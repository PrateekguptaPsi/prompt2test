import { readFileSync, writeFileSync } from "node:fs";

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

async function authenticate(baseUrl: string, db: string, login: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: 1, params: { db, login, password } }),
  });

  const payload = (await response.json()) as {
    result?: { session_id?: string };
    error?: { code: number; message: string };
  };

  if (payload.error) {
    throw new Error(`Auth failed ${payload.error.code}: ${payload.error.message}`);
  }

  const setCookie = response.headers.get("set-cookie") ?? "";
  const sid = payload.result?.session_id ?? /session_id=([^;,\s]+)/.exec(setCookie)?.[1];
  if (!sid) throw new Error("Auth failed: no session_id");
  return sid;
}

async function callKw<T>(
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
      id: Date.now(),
      params: { model, method, args, kwargs },
    }),
  });

  const payload = (await response.json()) as OdooRpcResponse<T>;
  if (payload.error) {
    throw new Error(
      `${model}.${method} failed ${payload.error.code}: ${payload.error.message} ${JSON.stringify(payload.error.data ?? {})}`
    );
  }
  if (payload.result === undefined || payload.result === null) {
    throw new Error(`${model}.${method} returned empty result.`);
  }
  return payload.result;
}

async function searchRead(
  baseUrl: string,
  sessionId: string,
  model: string,
  domain: unknown[],
  fields: string[],
  limit = 100
): Promise<Array<Record<string, any>>> {
  return callKw<Array<Record<string, any>>>(baseUrl, sessionId, model, "search_read", [domain], { fields, limit });
}

async function create(baseUrl: string, sessionId: string, model: string, vals: Record<string, unknown>): Promise<number> {
  return callKw<number>(baseUrl, sessionId, model, "create", [vals], {});
}

async function ensureByField(
  baseUrl: string,
  sessionId: string,
  model: string,
  field: string,
  value: string,
  vals: Record<string, unknown>
): Promise<number> {
  const found = await searchRead(baseUrl, sessionId, model, [[field, "=", value]], ["id", field], 1);
  if (found.length) return Number(found[0].id);
  return create(baseUrl, sessionId, model, { ...vals, [field]: value });
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const baseUrl = normalizeBaseUrl(requireEnv(env, "ODOO_URL"));
  const db = requireEnv(env, "ODOO_DB");
  const user = requireEnv(env, "ODOO_USER");
  const pass = requireEnv(env, "ODOO_PASSWORD");

  const sessionId = await authenticate(baseUrl, db, user, pass);

  // Ensure core anchors referenced in negative cases exist as explicit records.
  const patientLocked = await ensureByField(baseUrl, sessionId, "healthplix.patient", "name", "SEED-PAT-LOCKED-01", {});
  const patientAllergy = await ensureByField(baseUrl, sessionId, "healthplix.patient", "name", "SEED-PAT-ALGY-01", {});
  const patientA = await ensureByField(baseUrl, sessionId, "healthplix.patient", "name", "SEED-PAT-001", {});
  const patientB = await ensureByField(baseUrl, sessionId, "healthplix.patient", "name", "SEED-PAT-002", {});
  const patientC = await ensureByField(baseUrl, sessionId, "healthplix.patient", "name", "SEED-PAT-003", {});
  const patientD = await ensureByField(baseUrl, sessionId, "healthplix.patient", "name", "SEED-PAT-004", {});

  const doctor1 = await ensureByField(baseUrl, sessionId, "healthplix.doctor", "name", "SEED-DOC-001", {});
  const doctor2 = await ensureByField(baseUrl, sessionId, "healthplix.doctor", "name", "SEED-DOC-002", {});

  // Ensure appointments used in cross-link negative tests.
  const apt1 = await ensureByField(baseUrl, sessionId, "healthplix.appointment", "name", "SEED-APT-001", {
    patient_id: patientA,
    doctor_id: doctor1,
    appointment_date: "2026-07-20",
    notes: "SEED-APT-001 synthetic",
  });

  const aptOther = await ensureByField(baseUrl, sessionId, "healthplix.appointment", "name", "SEED-APT-OTHER-PATIENT", {
    patient_id: patientB,
    doctor_id: doctor2,
    appointment_date: "2026-07-21",
    notes: "SEED-APT-OTHER-PATIENT synthetic",
  });

  // Ensure an IPD anchor (healthplix.ipd uses uid, not name).
  const ipd = await ensureByField(baseUrl, sessionId, "healthplix.ipd", "uid", "SEED-IPD-001", {
    patient_id: patientC,
    doctor_id: doctor1,
  });

  // Ensure billing anchor using notes marker (bill_no may be auto-generated/readonly).
  const bill = await ensureByField(baseUrl, sessionId, "healthplix.billing", "notes", "SEED-BILL-001 synthetic", {
    patient_id: patientD,
  });

  // Ensure lab anchors referenced in test data matrix.
  const lab1 = await ensureByField(baseUrl, sessionId, "healthplix.lab.report", "name", "SEED-LAB-001", {
    patient_id: patientA,
    date: "2026-07-20",
  });
  const lab2 = await ensureByField(baseUrl, sessionId, "healthplix.lab.report", "name", "SEED-LAB-002", {
    patient_id: patientB,
    date: "2026-07-21",
  });
  const lab3 = await ensureByField(baseUrl, sessionId, "healthplix.lab.report", "name", "SEED-LAB-003", {
    patient_id: patientC,
    date: "2026-07-22",
  });

  // Ensure ward/bed anchors referenced by negative cases.
  const ward1 = await ensureByField(baseUrl, sessionId, "healthplix.ward", "name", "SEED-WARD-001", {
    ward_type: "general",
    floor: "1",
  });

  const bed1 = await ensureByField(baseUrl, sessionId, "healthplix.bed", "bed_number", "SEED-BED-001", {
    ward_id: ward1,
    status: "occupied",
    charge: 1200,
  });

  // Ensure product anchors used by prescription negative/positive cases.
  const drug001 = await ensureByField(baseUrl, sessionId, "product.template", "name", "SEED-DRUG-001", {
    type: "consu",
    sale_ok: true,
    purchase_ok: false,
  });
  const drug002 = await ensureByField(baseUrl, sessionId, "product.template", "name", "SEED-DRUG-002", {
    type: "consu",
    sale_ok: true,
    purchase_ok: false,
  });
  const drugAlgy = await ensureByField(baseUrl, sessionId, "product.template", "name", "SEED-DRUG-ALGY-01", {
    type: "consu",
    sale_ok: true,
    purchase_ok: false,
  });

  const out = {
    generatedAt: new Date().toISOString(),
    anchors: {
      patientLocked,
      patientAllergy,
      patientA,
      patientB,
      patientC,
      patientD,
      doctor1,
      doctor2,
      apt1,
      aptOther,
      ipd,
      bill,
      lab1,
      lab2,
      lab3,
      ward1,
      bed1,
      drug001,
      drug002,
      drugAlgy,
    },
  };

  writeFileSync("artifacts/seed_edge_summary.json", JSON.stringify(out, null, 2), "utf8");
  console.log("Edge-case test-data anchors ensured.");
  console.log(JSON.stringify(out, null, 2));
  console.log("Saved: artifacts/seed_edge_summary.json");
}

main().catch((error) => {
  console.error("seed-edge-cases failed:", error);
  process.exit(1);
});
