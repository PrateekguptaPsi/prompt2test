import { readFileSync } from "node:fs";

type EnvMap = Record<string, string>;

type OdooRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

function parseEnv(raw: string): EnvMap {
  const env: EnvMap = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function requireEnv(env: EnvMap, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function rpcFetch<T>(
  baseUrl: string,
  sessionId: string,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}/web/dataset/call_kw/${model}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs },
      id: Date.now(),
    }),
  });

  const payload = (await response.json()) as OdooRpcResponse<T>;
  if (payload.error) {
    throw new Error(
      `${model}.${method} failed ${payload.error.code}: ${payload.error.message} ${JSON.stringify(payload.error.data ?? {})}`
    );
  }
  if (payload.result === undefined || payload.result === null) {
    throw new Error(`${model}.${method} returned empty result`);
  }
  return payload.result;
}

async function authenticate(baseUrl: string, db: string, login: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: 1,
      params: { db, login, password },
    }),
  });

  const payload = (await response.json()) as {
    result?: { uid?: number; session_id?: string };
    error?: { code: number; message: string };
  };

  if (payload.error) throw new Error(`Auth failed: ${payload.error.code} ${payload.error.message}`);

  const setCookie = response.headers.get("set-cookie") ?? "";
  const fromCookie = /session_id=([^;,\s]+)/.exec(setCookie)?.[1];
  const sid = payload.result?.session_id ?? fromCookie;
  if (!sid) throw new Error("Auth failed: no session_id");
  return sid;
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const baseUrl = normalizeBaseUrl(requireEnv(env, "ODOO_URL"));
  const db = requireEnv(env, "ODOO_DB");
  const user = requireEnv(env, "ODOO_USER");
  const pass = requireEnv(env, "ODOO_PASSWORD");

  const sessionId = await authenticate(baseUrl, db, user, pass);

  const appts = await rpcFetch<Array<{ id: number; state?: string }>>(
    baseUrl,
    sessionId,
    "healthplix.appointment",
    "search_read",
    [[["notes", "like", "SEED-APT-"]]],
    { fields: ["id", "state"], limit: 2000 }
  );

  if (!appts.length) {
    console.log("No seeded appointments found.");
    return;
  }

  const ids = appts.map((a) => a.id);
  const preferredStates = ["confirmed", "booked", "new", "draft"];
  let usedState: string | null = null;

  for (const st of preferredStates) {
    try {
      await rpcFetch<boolean>(
        baseUrl,
        sessionId,
        "healthplix.appointment",
        "write",
        [ids, { state: st }],
        {}
      );
      usedState = st;
      break;
    } catch {
      // try next state value
    }
  }

  if (!usedState) {
    console.log(`Could not normalize appointment state; kept existing values for ${ids.length} records.`);
    return;
  }

  console.log(`Updated ${ids.length} seeded appointments to state='${usedState}'.`);
}

main().catch((e) => {
  console.error("normalize-seed-appointments failed:", e);
  process.exit(1);
});
