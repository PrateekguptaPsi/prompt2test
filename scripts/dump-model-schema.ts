import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type EnvMap = Record<string, string>;

type OdooAuthResponse = {
  jsonrpc: "2.0";
  id: number | null;
  result?: {
    uid?: number;
    db?: string;
    username?: string;
    session_id?: string;
    user_context?: Record<string, unknown>;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

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

// Actual custom-module prefix on this instance is "healthplix." (verified via ir.model).
const MODEL_PREFIX = "healthplix.";

// Fallback list used only if live discovery via ir.model fails.
const MODELS: string[] = [
  "healthplix.patient",
  "healthplix.doctor",
  "healthplix.prescription",
  "healthplix.lab.report",
  "healthplix.ipd",
  "healthplix.appointment",
  "healthplix.billing",
  "healthplix.ward",
  "healthplix.bed",
];

function parseEnv(raw: string): EnvMap {
  const env: EnvMap = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

function readEnvFile(path = ".env"): EnvMap {
  return parseEnv(readFileSync(path, "utf8"));
}

function requireEnv(env: EnvMap, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function parseSessionIdFromSetCookie(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = /(?:^|,\s*)session_id=([^;,\s]+)/.exec(headerValue);
  return match?.[1] ?? null;
}

async function authenticate(baseUrl: string, db: string, login: string, password: string): Promise<{ uid: number; sessionId: string }> {
  const response = await fetch(`${baseUrl}/web/session/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        db,
        login,
        password,
      },
      id: 1,
    }),
  });

  const setCookie = response.headers.get("set-cookie");
  const payload = (await response.json()) as OdooAuthResponse;

  if (payload.error) {
    throw new Error(`Auth error ${payload.error.code}: ${payload.error.message}`);
  }

  const uid = payload.result?.uid;
  if (!uid) {
    throw new Error("Authentication failed: uid missing in response.");
  }

  const sessionFromBody = payload.result?.session_id ?? null;
  const sessionFromCookie = parseSessionIdFromSetCookie(setCookie);
  const sessionId = sessionFromBody || sessionFromCookie;

  if (!sessionId) {
    throw new Error("Authentication failed: session_id not found in response body or cookies.");
  }

  return { uid, sessionId };
}

async function callKw<T>(
  baseUrl: string,
  sessionId: string,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  // Odoo 17+ routes call_kw as /web/dataset/call_kw/<model>/<method>;
  // the bare /web/dataset/call_kw endpoint returns HTTP 404.
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
    throw new Error(`${method} error ${payload.error.code}: ${payload.error.message}`);
  }

  if (payload.result === undefined || payload.result === null) {
    throw new Error(`${method} returned empty result.`);
  }

  return payload.result;
}

async function discoverHospitalModels(baseUrl: string, sessionId: string): Promise<string[]> {
  const records = await callKw<Array<{ model: string }>>(
    baseUrl,
    sessionId,
    "ir.model",
    "search_read",
    [[["model", "like", MODEL_PREFIX]]],
    { fields: ["model"] }
  );
  return records.map((r) => r.model).sort();
}

async function fieldsGet(baseUrl: string, sessionId: string, uid: number, model: string): Promise<Record<string, unknown>> {
  return callKw<Record<string, unknown>>(baseUrl, sessionId, model, "fields_get", [], {
    attributes: ["string", "type", "required", "readonly", "relation"],
    context: { uid },
  });
}

async function main() {
  const env = readEnvFile(".env");
  const ODOO_URL = normalizeBaseUrl(requireEnv(env, "ODOO_URL"));
  const ODOO_DB = requireEnv(env, "ODOO_DB");
  const ODOO_USER = requireEnv(env, "ODOO_USER");
  const ODOO_PASSWORD = requireEnv(env, "ODOO_PASSWORD");

  mkdirSync("artifacts", { recursive: true });

  const { uid, sessionId } = await authenticate(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD);

  // Prefer live discovery over the hard-coded guesses; fall back if it fails.
  let models = MODELS;
  try {
    const discovered = await discoverHospitalModels(ODOO_URL, sessionId);
    if (discovered.length) {
      console.log(`Discovered ${discovered.length} hospital.* models via ir.model:`);
      console.log(discovered.map((m) => ` - ${m}`).join("\n"));
      models = discovered;
    }
  } catch (error: any) {
    console.warn(`ir.model discovery failed (${error?.message ?? error}); using hard-coded list.`);
  }

  const out: {
    generatedAt: string;
    baseUrl: string;
    db: string;
    uid: number;
    models: Record<string, unknown>;
    failures: Record<string, string>;
  } = {
    generatedAt: new Date().toISOString(),
    baseUrl: ODOO_URL,
    db: ODOO_DB,
    uid,
    models: {},
    failures: {},
  };

  for (const model of models) {
    try {
      out.models[model] = await fieldsGet(ODOO_URL, sessionId, uid, model);
    } catch (error: any) {
      out.failures[model] = error?.message ?? String(error);
    }
  }

  writeFileSync("artifacts/model_schema.json", JSON.stringify(out, null, 2), "utf8");

  console.log("Model schema dump generated:");
  console.log(" - artifacts/model_schema.json");
  console.log(`Models attempted: ${models.length}`);
  console.log(`Models succeeded: ${Object.keys(out.models).length}`);
  console.log(`Models failed: ${Object.keys(out.failures).length}`);
}

main().catch((error) => {
  console.error("dump-model-schema failed:", error);
  process.exit(1);
});
