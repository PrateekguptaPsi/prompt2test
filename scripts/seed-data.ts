import { faker } from "@faker-js/faker";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

type EnvMap = Record<string, string>;

type OdooAuthResponse = {
  jsonrpc: "2.0";
  id: number | null;
  result?: {
    uid?: number;
    db?: string;
    username?: string;
    session_id?: string;
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

type SeedSummary = {
  generatedAt: string;
  runTag: string;
  baseUrl: string;
  created: Record<string, number>;
  existing: Record<string, number>;
  totalsAfterSeed: Record<string, number>;
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
      params: { db, login, password },
      id: 1,
    }),
  });

  const payload = (await response.json()) as OdooAuthResponse;
  const setCookie = response.headers.get("set-cookie");

  if (payload.error) {
    throw new Error(`Auth error ${payload.error.code}: ${payload.error.message}`);
  }

  const uid = payload.result?.uid;
  if (!uid) {
    throw new Error("Authentication failed: uid missing.");
  }

  const sessionId = payload.result?.session_id ?? parseSessionIdFromSetCookie(setCookie);
  if (!sessionId) {
    throw new Error("Authentication failed: session_id missing.");
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
    const errData =
      payload.error.data === undefined ? "" : ` | data=${JSON.stringify(payload.error.data).slice(0, 1500)}`;
    throw new Error(`${model}.${method} failed ${payload.error.code}: ${payload.error.message}${errData}`);
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
  limit = 200
): Promise<Array<Record<string, any>>> {
  return callKw<Array<Record<string, any>>>(baseUrl, sessionId, model, "search_read", [domain], {
    fields,
    limit,
  });
}

async function searchCount(baseUrl: string, sessionId: string, model: string, domain: unknown[]): Promise<number> {
  return callKw<number>(baseUrl, sessionId, model, "search_count", [domain], {});
}

async function createRecord(
  baseUrl: string,
  sessionId: string,
  model: string,
  vals: Record<string, unknown>
): Promise<number> {
  return callKw<number>(baseUrl, sessionId, model, "create", [vals], {});
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildRunTag(env: EnvMap): string {
  if (env.SEED_RUN_TAG && env.SEED_RUN_TAG.trim()) return env.SEED_RUN_TAG.trim();
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function seedTag(runTag: string, entity: string, n: number): string {
  return `TEST-${runTag}-SEED-${entity}-${String(n).padStart(3, "0")}`;
}

async function ensurePatients(
  baseUrl: string,
  sessionId: string,
  target: number,
  runTag: string,
  summary: SeedSummary
): Promise<number[]> {
  const existing = await searchRead(
    baseUrl,
    sessionId,
    "healthplix.patient",
    [["name", "like", "SEED-PAT-"]],
    ["id", "name"],
    500
  );
  summary.existing["healthplix.patient"] = existing.length;

  const ids = existing.map((r) => Number(r.id)).filter(Number.isFinite);
  let created = 0;

  for (let i = existing.length + 1; i <= target; i++) {
    const marker = seedTag(runTag, "PAT", i);
    const vals = {
      name: `${marker} ${faker.person.fullName()}`,
    };

    const id = await createRecord(baseUrl, sessionId, "healthplix.patient", vals);
    ids.push(id);
    created++;
  }

  summary.created["healthplix.patient"] = created;
  summary.totalsAfterSeed["healthplix.patient"] = ids.length;
  return ids;
}

async function ensureDoctors(
  baseUrl: string,
  sessionId: string,
  target: number,
  runTag: string,
  summary: SeedSummary
): Promise<number[]> {
  const existing = await searchRead(
    baseUrl,
    sessionId,
    "healthplix.doctor",
    [["name", "like", "SEED-DOC-"]],
    ["id", "name"],
    500
  );
  summary.existing["healthplix.doctor"] = existing.length;

  const ids = existing.map((r) => Number(r.id)).filter(Number.isFinite);
  let created = 0;

  for (let i = existing.length + 1; i <= target; i++) {
    const marker = seedTag(runTag, "DOC", i);
    const vals = {
      name: `${marker} ${faker.person.fullName()}`,
    };

    const id = await createRecord(baseUrl, sessionId, "healthplix.doctor", vals);
    ids.push(id);
    created++;
  }

  summary.created["healthplix.doctor"] = created;
  summary.totalsAfterSeed["healthplix.doctor"] = ids.length;
  return ids;
}

async function ensureAppointments(
  baseUrl: string,
  sessionId: string,
  target: number,
  runTag: string,
  patientIds: number[],
  doctorIds: number[],
  summary: SeedSummary
): Promise<number[]> {
  const existing = await searchRead(
    baseUrl,
    sessionId,
    "healthplix.appointment",
    [["notes", "like", "SEED-APT-"]],
    ["id", "notes"],
    1000
  );
  summary.existing["healthplix.appointment"] = existing.length;

  const ids = existing.map((r) => Number(r.id)).filter(Number.isFinite);
  let created = 0;

  for (let i = existing.length + 1; i <= target; i++) {
    const marker = seedTag(runTag, "APT", i);
    const vals = {
      patient_id: patientIds[(i - 1) % patientIds.length],
      doctor_id: doctorIds[(i - 1) % doctorIds.length],
      appointment_date: faker.date.soon({ days: 20 }).toISOString().slice(0, 10),
      notes: `${marker} synthetic appointment for automation`,
    };

    const id = await createRecord(baseUrl, sessionId, "healthplix.appointment", vals);
    ids.push(id);
    created++;
  }

  summary.created["healthplix.appointment"] = created;
  summary.totalsAfterSeed["healthplix.appointment"] = ids.length;
  return ids;
}

async function findAnyProductId(baseUrl: string, sessionId: string): Promise<number | null> {
  const products = await searchRead(baseUrl, sessionId, "product.product", [], ["id", "name"], 1);
  if (products.length) {
    const id = Number(products[0].id);
    if (Number.isFinite(id)) return id;
  }

  // Fallback: create a synthetic product template, then fetch its variant.
  const tmplName = `TEST-SEED-PRODUCT-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
  const tmplId = await createRecord(baseUrl, sessionId, "product.template", {
    name: tmplName,
    type: "consu",
    sale_ok: true,
    purchase_ok: false,
  });

  const variant = await searchRead(
    baseUrl,
    sessionId,
    "product.product",
    [["product_tmpl_id", "=", tmplId]],
    ["id", "name"],
    1
  );

  if (!variant.length) return null;
  const id = Number(variant[0].id);
  return Number.isFinite(id) ? id : null;
}

async function ensurePrescriptionsWithLines(
  baseUrl: string,
  sessionId: string,
  target: number,
  runTag: string,
  patientIds: number[],
  appointmentIds: number[],
  summary: SeedSummary
): Promise<number[]> {
  const existing = await searchRead(
    baseUrl,
    sessionId,
    "healthplix.prescription",
    [["name", "like", "SEED-RX-"]],
    ["id", "name"],
    1000
  );
  summary.existing["healthplix.prescription"] = existing.length;

  const ids = existing.map((r) => Number(r.id)).filter(Number.isFinite);
  let created = 0;
  let createdLines = 0;

  const productId = await findAnyProductId(baseUrl, sessionId);

  // Create missing prescription headers up to target.
  for (let i = existing.length + 1; i <= target; i++) {
    const marker = seedTag(runTag, "RX", i);
    const vals = {
      name: marker,
      patient_id: patientIds[(i - 1) % patientIds.length],
      appointment_id: appointmentIds[(i - 1) % appointmentIds.length],
      date: new Date().toISOString().slice(0, 10),
      notes: `${marker} synthetic prescription`,
    };

    const prescriptionId = await createRecord(baseUrl, sessionId, "healthplix.prescription", vals);
    ids.push(prescriptionId);
    created++;
  }

  // Ensure each seeded prescription has at least one seeded line.
  if (productId) {
    const seededPrescriptions = await searchRead(
      baseUrl,
      sessionId,
      "healthplix.prescription",
      [["name", "like", "SEED-RX-"]],
      ["id", "patient_id", "name"],
      2000
    );

    for (const rx of seededPrescriptions) {
      const rxId = Number(rx.id);
      if (!Number.isFinite(rxId)) continue;

      const existingLineCount = await searchCount(
        baseUrl,
        sessionId,
        "healthplix.prescription.line",
        [["prescription_id", "=", rxId], ["note", "like", "SEED-RX-"]]
      );

      if (existingLineCount > 0) continue;

      const patientId = Array.isArray(rx.patient_id) ? Number(rx.patient_id[0]) : Number(rx.patient_id);
      await createRecord(baseUrl, sessionId, "healthplix.prescription.line", {
        prescription_id: rxId,
        patient_id: Number.isFinite(patientId) ? patientId : patientIds[0],
        product_id: productId,
        quantity: faker.number.int({ min: 1, max: 3 }),
        note: `${rx.name}-LINE synthetic`,
      });
      createdLines++;
    }
  }

  summary.created["healthplix.prescription"] = created;
  summary.totalsAfterSeed["healthplix.prescription"] = ids.length;

  const lineTotal = await searchCount(baseUrl, sessionId, "healthplix.prescription.line", [["note", "like", "SEED-RX-"]]);
  summary.existing["healthplix.prescription.line"] = Math.max(0, lineTotal - createdLines);
  summary.created["healthplix.prescription.line"] = createdLines;
  summary.totalsAfterSeed["healthplix.prescription.line"] = lineTotal;

  if (!productId) {
    console.warn("No product.product found and fallback creation failed; prescription lines were not created.");
  }

  return ids;
}

async function ensureLabReports(
  baseUrl: string,
  sessionId: string,
  target: number,
  runTag: string,
  patientIds: number[],
  doctorIds: number[],
  summary: SeedSummary
): Promise<number[]> {
  const existing = await searchRead(
    baseUrl,
    sessionId,
    "healthplix.lab.report",
    [["name", "like", "SEED-LAB-"]],
    ["id", "name"],
    1000
  );
  summary.existing["healthplix.lab.report"] = existing.length;

  const ids = existing.map((r) => Number(r.id)).filter(Number.isFinite);
  let created = 0;

  for (let i = existing.length + 1; i <= target; i++) {
    const marker = seedTag(runTag, "LAB", i);
    const vals: Record<string, unknown> = {
      name: marker,
      patient_id: patientIds[(i - 1) % patientIds.length],
      date: new Date().toISOString().slice(0, 10),
    };

    const id = await createRecord(baseUrl, sessionId, "healthplix.lab.report", vals);
    ids.push(id);
    created++;
  }

  summary.created["healthplix.lab.report"] = created;
  summary.totalsAfterSeed["healthplix.lab.report"] = ids.length;
  return ids;
}

async function ensureBillings(
  baseUrl: string,
  sessionId: string,
  target: number,
  runTag: string,
  patientIds: number[],
  summary: SeedSummary
): Promise<number[]> {
  const existing = await searchRead(
    baseUrl,
    sessionId,
    "healthplix.billing",
    [["notes", "like", "SEED-BILL-"]],
    ["id", "notes"],
    500
  );
  summary.existing["healthplix.billing"] = existing.length;

  const ids = existing.map((r) => Number(r.id)).filter(Number.isFinite);
  let created = 0;

  for (let i = existing.length + 1; i <= target; i++) {
    const marker = seedTag(runTag, "BILL", i);
    const vals = {
      patient_id: patientIds[(i - 1) % patientIds.length],
      notes: `${marker} synthetic billing`,
    };

    const id = await createRecord(baseUrl, sessionId, "healthplix.billing", vals);
    ids.push(id);
    created++;
  }

  summary.created["healthplix.billing"] = created;
  summary.totalsAfterSeed["healthplix.billing"] = ids.length;
  return ids;
}

async function main() {
  const env = readEnvFile(".env");
  const ODOO_URL = normalizeBaseUrl(requireEnv(env, "ODOO_URL"));
  const ODOO_DB = requireEnv(env, "ODOO_DB");
  const ODOO_USER = requireEnv(env, "ODOO_USER");
  const ODOO_PASSWORD = requireEnv(env, "ODOO_PASSWORD");
  const runTag = buildRunTag(env);

  faker.seed(20260711);

  const summary: SeedSummary = {
    generatedAt: new Date().toISOString(),
    runTag,
    baseUrl: ODOO_URL,
    created: {},
    existing: {},
    totalsAfterSeed: {},
  };

  const { sessionId } = await authenticate(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD);

  const patientIds = await ensurePatients(ODOO_URL, sessionId, 5, runTag, summary);
  const doctorIds = await ensureDoctors(ODOO_URL, sessionId, 3, runTag, summary);
  const appointmentIds = await ensureAppointments(ODOO_URL, sessionId, 10, runTag, patientIds, doctorIds, summary);
  await ensurePrescriptionsWithLines(ODOO_URL, sessionId, 5, runTag, patientIds, appointmentIds, summary);
  await ensureLabReports(ODOO_URL, sessionId, 5, runTag, patientIds, doctorIds, summary);
  await ensureBillings(ODOO_URL, sessionId, 3, runTag, patientIds, summary);

  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/seed_data_summary.json", JSON.stringify(summary, null, 2), "utf8");

  console.log("Seed completed. Summary:");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Saved: artifacts/seed_data_summary.json");
}

main().catch((error) => {
  console.error("seed-data failed:", error);
  process.exit(1);
});
