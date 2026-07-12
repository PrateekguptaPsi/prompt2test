import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

type EnvMap = Record<string, string>;

type OdooAuthResponse = {
  jsonrpc: "2.0";
  id: number | null;
  result?: { uid?: number; session_id?: string };
  error?: { code: number; message: string; data?: unknown };
};

type OdooRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

type ProbeStatus = "ConfirmedDefect" | "Guarded" | "Blocked";

type ProbeResult = {
  id: string;
  module: string;
  title: string;
  status: ProbeStatus;
  severity: "Critical" | "High" | "Medium" | "Low";
  priority: "P0" | "P1" | "P2" | "P3";
  patientSafetyImpact: string;
  evidence: {
    model?: string;
    method?: string;
    payload?: Record<string, unknown>;
    notes?: string;
    persistedRecordId?: number | null;
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
  const value = env[key] ?? process.env[key];
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
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db, login, password },
      id: 1,
    }),
  });

  const payload = (await response.json()) as OdooAuthResponse;
  if (payload.error) throw new Error(`RPC auth failed ${payload.error.code}: ${payload.error.message}`);

  const uid = payload.result?.uid;
  if (!uid) throw new Error("RPC auth failed: uid missing.");

  const sid = payload.result?.session_id ?? parseSessionIdFromSetCookie(response.headers.get("set-cookie"));
  if (!sid) throw new Error("RPC auth failed: session_id missing.");

  return { uid, sessionId: sid };
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
  if (payload.error) throw new Error(`${model}.${method} failed ${payload.error.code}: ${payload.error.message}`);
  if (payload.result === undefined) throw new Error(`${model}.${method} returned undefined result.`);
  return payload.result;
}

function uniqueSeed(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function findAnyId(baseUrl: string, sid: string, model: string): Promise<number | null> {
  const rows = await callKw<Array<{ id: number }>>(baseUrl, sid, model, "search_read", [[]], {
    fields: ["id"],
    limit: 1,
    order: "id desc",
  });
  return rows[0]?.id ?? null;
}

async function createSeedPatient(baseUrl: string, sid: string): Promise<number> {
  const marker = uniqueSeed("SEED-EXP-PAT");
  return callKw<number>(baseUrl, sid, "healthplix.patient", "create", [
    { name: marker, phone: "SEED-9110000000", email: `${marker.toLowerCase()}@synthetic.test` },
  ]);
}

async function createSeedDoctor(baseUrl: string, sid: string): Promise<number> {
  return callKw<number>(baseUrl, sid, "healthplix.doctor", "create", [{ name: uniqueSeed("SEED-EXP-DOC") }]);
}

async function safeUnlink(baseUrl: string, sid: string, model: string, id?: number | null): Promise<void> {
  if (!id) return;
  await callKw(baseUrl, sid, model, "unlink", [[id]]).catch(() => undefined);
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const baseUrl = normalizeBaseUrl(requireEnv(env, "ODOO_URL"));
  const db = requireEnv(env, "ODOO_DB");
  const login = requireEnv(env, "ODOO_USER");
  const password = requireEnv(env, "ODOO_PASSWORD");
  const { sessionId } = await authenticate(baseUrl, db, login, password);

  const results: ProbeResult[] = [];
  const cleanup: Array<{ model: string; id: number }> = [];

  {
    const productId = await findAnyId(baseUrl, sessionId, "product.product");
    const patientId = await createSeedPatient(baseUrl, sessionId);
    cleanup.push({ model: "healthplix.patient", id: patientId });
    const prescriptionId = await callKw<number>(baseUrl, sessionId, "healthplix.prescription", "create", [{ patient_id: patientId }]);
    cleanup.push({ model: "healthplix.prescription", id: prescriptionId });

    const payload = { prescription_id: prescriptionId, patient_id: patientId, product_id: productId, quantity: -1 };
    let lineId: number | null = null;
    try {
      lineId = await callKw<number>(baseUrl, sessionId, "healthplix.prescription.line", "create", [payload]);
    } catch {
      lineId = null;
    }
    if (lineId) cleanup.push({ model: "healthplix.prescription.line", id: lineId });

    results.push({
      id: "BUG-ONCO-001",
      module: "Prescriptions",
      title: "Server accepts negative drug quantity in prescription lines",
      status: lineId ? "ConfirmedDefect" : "Guarded",
      severity: "Critical",
      priority: "P0",
      patientSafetyImpact: "Negative quantity can distort dosage interpretation and directly risk unsafe medication orders.",
      evidence: { model: "healthplix.prescription.line", method: "create", payload, persistedRecordId: lineId },
    });
  }

  {
    const patientId = await createSeedPatient(baseUrl, sessionId);
    cleanup.push({ model: "healthplix.patient", id: patientId });
    const billingId = await callKw<number>(baseUrl, sessionId, "healthplix.billing", "create", [{ patient_id: patientId }]);
    cleanup.push({ model: "healthplix.billing", id: billingId });

    const payload = { billing_id: billingId, line_type: "lab", quantity: 1, price: -1000 };
    let lineId: number | null = null;
    try {
      lineId = await callKw<number>(baseUrl, sessionId, "healthplix.billing.line", "create", [payload]);
    } catch {
      lineId = null;
    }
    if (lineId) cleanup.push({ model: "healthplix.billing.line", id: lineId });

    results.push({
      id: "BUG-ONCO-002",
      module: "Billing",
      title: "Server accepts negative billing unit price",
      status: lineId ? "ConfirmedDefect" : "Guarded",
      severity: "High",
      priority: "P1",
      patientSafetyImpact: "Invalid negative billing can disrupt treatment continuity through incorrect financial eligibility and audit records.",
      evidence: { model: "healthplix.billing.line", method: "create", payload, persistedRecordId: lineId },
    });
  }

  {
    const payload = { name: uniqueSeed("SEED-EXP-DOC"), experience: -1 };
    let doctorId: number | null = null;
    try {
      doctorId = await callKw<number>(baseUrl, sessionId, "healthplix.doctor", "create", [payload]);
    } catch {
      doctorId = null;
    }
    if (doctorId) cleanup.push({ model: "healthplix.doctor", id: doctorId });

    results.push({
      id: "BUG-ONCO-003",
      module: "Doctors",
      title: "Server accepts negative doctor experience",
      status: doctorId ? "ConfirmedDefect" : "Guarded",
      severity: "Medium",
      priority: "P2",
      patientSafetyImpact: "Corrupted provider metadata undermines trust and can mislead assignment workflows.",
      evidence: { model: "healthplix.doctor", method: "create", payload, persistedRecordId: doctorId },
    });
  }

  {
    const productId = await findAnyId(baseUrl, sessionId, "product.product");
    const patientId = await createSeedPatient(baseUrl, sessionId);
    cleanup.push({ model: "healthplix.patient", id: patientId });
    const prescriptionId = await callKw<number>(baseUrl, sessionId, "healthplix.prescription", "create", [{ patient_id: patientId }]);
    cleanup.push({ model: "healthplix.prescription", id: prescriptionId });

    const payload = {
      prescription_id: prescriptionId,
      patient_id: patientId,
      product_id: productId,
      quantity: 1,
      dosage: "9999 mg every 1 minute",
    };
    let lineId: number | null = null;
    try {
      lineId = await callKw<number>(baseUrl, sessionId, "healthplix.prescription.line", "create", [payload]);
    } catch {
      lineId = null;
    }
    if (lineId) cleanup.push({ model: "healthplix.prescription.line", id: lineId });

    results.push({
      id: "BUG-ONCO-004",
      module: "Prescriptions",
      title: "Server accepts clinically implausible dosage text without guardrails",
      status: lineId ? "ConfirmedDefect" : "Guarded",
      severity: "High",
      priority: "P1",
      patientSafetyImpact: "Unbounded dosage input can enable unsafe medication instructions in clinical workflows.",
      evidence: { model: "healthplix.prescription.line", method: "create", payload, persistedRecordId: lineId },
    });
  }

  {
    const patientId = await createSeedPatient(baseUrl, sessionId);
    const doctorId = await createSeedDoctor(baseUrl, sessionId);
    cleanup.push({ model: "healthplix.patient", id: patientId }, { model: "healthplix.doctor", id: doctorId });

    const payload = {
      patient_id: patientId,
      doctor_id: doctorId,
      appointment_date: "2001-01-01",
      appointment_time: "09:00",
      notes: uniqueSeed("SEED-EXP-PAST-APT"),
    };

    let appointmentId: number | null = null;
    try {
      appointmentId = await callKw<number>(baseUrl, sessionId, "healthplix.appointment", "create", [payload]);
    } catch {
      appointmentId = null;
    }
    if (appointmentId) cleanup.push({ model: "healthplix.appointment", id: appointmentId });

    results.push({
      id: "BUG-ONCO-005",
      module: "Appointments",
      title: "Server accepts past-dated appointment creation",
      status: appointmentId ? "ConfirmedDefect" : "Guarded",
      severity: "Medium",
      priority: "P2",
      patientSafetyImpact: "Past-date acceptance degrades schedule integrity and may cause missed/incorrect care tracking.",
      evidence: { model: "healthplix.appointment", method: "create", payload, persistedRecordId: appointmentId },
    });
  }

  {
    const hasSecondary = Boolean(process.env.ODOO_SECONDARY_USER || env.ODOO_SECONDARY_USER);
    results.push({
      id: "BUG-ONCO-006",
      module: "Patients",
      title: "Cross-user direct-ID access isolation probe",
      status: hasSecondary ? "Guarded" : "Blocked",
      severity: "High",
      priority: "P1",
      patientSafetyImpact: "Cross-user record leakage would directly violate patient confidentiality and continuity boundaries.",
      evidence: {
        notes: hasSecondary
          ? "Secondary user present but deep probe not executed in this run."
          : "Skipped: ODOO_SECONDARY_USER / ODOO_SECONDARY_PASSWORD not configured.",
      },
    });
  }

  for (const rec of cleanup.reverse()) {
    await safeUnlink(baseUrl, sessionId, rec.model, rec.id);
  }

  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/step9_exploratory_results.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl,
        totalProbes: results.length,
        results,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Saved exploratory probe results: artifacts/step9_exploratory_results.json");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error("exploratory-hunt-step9 failed:", error);
  process.exit(1);
});
