import { test, expect, type APIRequestContext } from "@playwright/test";
import { loadAllCases, type TestCaseRow } from "../data/testCaseLoader";
import { getAutomationEnv } from "../utils/env";
import { OdooJsonRpcClient } from "../api/odooJsonRpcClient";

type BillingRecord = {
  id: number;
  bill_no?: string;
  total_amount?: number;
  invoice_amount_total?: number;
  billing_line_ids?: number[];
};

type BillingLineRecord = {
  id: number;
  subtotal?: number;
  quantity?: number;
  price?: number;
};

const allCases = loadAllCases();
const apiEligibleCases = allCases.filter((c) => c.E2E === "No");

function requireCaseBy(
  description: string,
  predicate: (row: TestCaseRow) => boolean
): TestCaseRow {
  const row = apiEligibleCases.find(predicate);
  if (!row) {
    throw new Error(`Missing E2E=No case in CSV for: ${description}`);
  }
  return row;
}

function buildClientForPrimaryUser(request: APIRequestContext): OdooJsonRpcClient {
  const env = getAutomationEnv();
  return new OdooJsonRpcClient(request, {
    baseUrl: env.ODOO_URL,
    db: env.ODOO_DB,
    login: env.ODOO_USER,
    password: env.ODOO_PASSWORD,
  });
}

function buildClientForSecondaryUser(request: APIRequestContext): OdooJsonRpcClient | null {
  const env = getAutomationEnv();
  const secondaryLogin = process.env.ODOO_SECONDARY_USER;
  const secondaryPassword = process.env.ODOO_SECONDARY_PASSWORD;

  if (!secondaryLogin || !secondaryPassword) {
    return null;
  }

  return new OdooJsonRpcClient(request, {
    baseUrl: env.ODOO_URL,
    db: env.ODOO_DB,
    login: secondaryLogin,
    password: secondaryPassword,
  });
}

function uniqueSeed(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

async function findAnyId(client: OdooJsonRpcClient, model: string): Promise<number | null> {
  const rows = await client.callKw<Array<{ id: number }>>(model, "search_read", [[]], {
    fields: ["id"],
    limit: 1,
    order: "id desc",
  });
  return rows[0]?.id ?? null;
}

async function createSeedPatient(client: OdooJsonRpcClient): Promise<number> {
  const patientName = uniqueSeed("SEED-API-PATIENT");
  return client.callKw<number>("healthplix.patient", "create", [
    {
      name: patientName,
      phone: "SEED-9000000011",
      email: `${patientName.toLowerCase()}@synthetic.test`,
    },
  ]);
}

async function addCaseTrace(row: TestCaseRow): Promise<void> {
  test.info().annotations.push(
    { type: "TestCaseID", description: row.TestCaseID },
    { type: "RequirementID", description: row.RequirementID },
    { type: "ScenarioID", description: row.ScenarioID },
    { type: "Category", description: row.Category },
    { type: "Priority", description: row.Priority },
    { type: "Type", description: row.Type }
  );

  test.info().attach("case-context", {
    body: JSON.stringify(row, null, 2),
    contentType: "application/json",
  });
}

test.describe("Step 8 API business rules via Odoo JSON-RPC (E2E=No)", () => {
  // Negative-quantity / negative-price / negative-experience boundary rules
  // live in the data-driven "boundary bug hunter" describe block below.

  test("@api @positive validates billing total equals billing line subtotals", async ({ request }) => {
    const row = requireCaseBy(
      "Billing positive total consistency rule",
      (c) =>
        c.Module === "Billing" &&
        c.Type === "Positive" &&
        /total|accurate|sum/i.test(c.Title)
    );
    await addCaseTrace(row);

    const client = buildClientForPrimaryUser(request);
    await client.authenticate();

    const billings = await client.callKw<BillingRecord[]>("healthplix.billing", "search_read", [[]], {
      fields: ["id", "bill_no", "total_amount", "invoice_amount_total", "billing_line_ids"],
      order: "id desc",
      limit: 30,
    });

    const billing = billings.find((b) => Array.isArray(b.billing_line_ids) && b.billing_line_ids.length > 0);
    test.skip(!billing, "No billing records with billing_line_ids found; cannot assert billing total consistency.");

    const lineIds = billing!.billing_line_ids ?? [];
    const lines = await client.callKw<BillingLineRecord[]>(
      "healthplix.billing.line",
      "search_read",
      [[["id", "in", lineIds]]],
      { fields: ["id", "subtotal", "quantity", "price"] }
    );

    const subtotalSum = lines.reduce((sum, line) => sum + Number(line.subtotal ?? 0), 0);
    const totalAmount = Number(billing!.total_amount ?? 0);

    expect(totalAmount).toBeCloseTo(subtotalSum, 2);

    const invoiceAmountTotal = Number(billing!.invoice_amount_total ?? 0);
    if (invoiceAmountTotal > 0) {
      expect(invoiceAmountTotal).toBeCloseTo(totalAmount, 2);
    }

    test.info().attach("billing-total-evidence", {
      body: JSON.stringify(
        {
          billingId: billing!.id,
          billNo: billing!.bill_no ?? null,
          totalAmount,
          invoiceAmountTotal,
          subtotalSum,
          lineCount: lines.length,
        },
        null,
        2
      ),
      contentType: "application/json",
    });
  });

  test("@api @negative blocks cross-user record access", async ({ request }) => {
    const row = requireCaseBy(
      "Patients cross-user/cross-record isolation rule",
      (c) =>
        c.Module === "Patients" &&
        c.Type === "Negative" &&
        c.Category === "WorkflowOrStateGuard" &&
        /unauthorized|access|cross-patient/i.test(c.Title)
    );
    await addCaseTrace(row);

    const primaryClient = buildClientForPrimaryUser(request);
    await primaryClient.authenticate();

    const secondaryClient = buildClientForSecondaryUser(request);
    test.skip(
      !secondaryClient,
      "Set ODOO_SECONDARY_USER and ODOO_SECONDARY_PASSWORD to execute cross-user isolation assertion."
    );

    await secondaryClient!.authenticate();

    const patientId = await createSeedPatient(primaryClient);
    let blocked = false;

    try {
      const visibleToSecondary = await secondaryClient!.callKw<Array<{ id: number }>>(
        "healthplix.patient",
        "search_read",
        [[["id", "=", patientId]]],
        { fields: ["id"], limit: 1 }
      );

      blocked = visibleToSecondary.length === 0;
    } catch {
      blocked = true;
    }

    try {
      expect(
        blocked,
        `Cross-user access isolation failed: secondary user could access patient ID ${patientId}.`
      ).toBeTruthy();
    } finally {
      await primaryClient.callKw("healthplix.patient", "unlink", [[patientId]]).catch(() => undefined);
    }
  });
});

/**
 * Boundary bug hunter — data-driven from the InvalidOrBoundaryInput cases.
 *
 * Each rule attempts to persist a clinically/financially invalid value via
 * JSON-RPC and asserts the server REJECTS it (throws, or the record does not
 * persist). A failure here is a genuine application defect (the server let an
 * unsafe value through) that belongs in 06_bugs and Jira — never soften it.
 */
type BoundaryRule = {
  caseId: string;
  title: string;
  build: (client: OdooJsonRpcClient) => Promise<{ model: string; vals: Record<string, unknown>; cleanup: number[] }>;
  invalidField: string;
  badValueDomain: [string, string, unknown];
};

const BOUNDARY_RULES: BoundaryRule[] = [
  {
    caseId: "TC-PRESCRIPTIONS-NEG-002",
    title: "prescription line quantity must not be zero or negative",
    invalidField: "quantity",
    badValueDomain: ["quantity", "<=", 0],
    build: async (client) => {
      const productId = await findAnyId(client, "product.product");
      if (!productId) throw new Error("SKIP:no product.product to attach to a prescription line");
      const patientId = await createSeedPatient(client);
      const prescriptionId = await client.callKw<number>("healthplix.prescription", "create", [{ patient_id: patientId }]);
      return {
        model: "healthplix.prescription.line",
        vals: { prescription_id: prescriptionId, patient_id: patientId, product_id: productId, quantity: -1 },
        cleanup: [patientId, prescriptionId],
      };
    },
  },
  {
    caseId: "TC-BILLING-NEG-002",
    title: "billing line unit price must not be negative",
    invalidField: "price",
    badValueDomain: ["price", "<", 0],
    build: async (client) => {
      const patientId = await createSeedPatient(client);
      const billingId = await client.callKw<number>("healthplix.billing", "create", [{ patient_id: patientId }]);
      return {
        model: "healthplix.billing.line",
        vals: { billing_id: billingId, line_type: "lab", quantity: 1, price: -1000 },
        cleanup: [patientId, billingId],
      };
    },
  },
  {
    caseId: "TC-DOCTORS-NEG-002",
    title: "doctor experience must not be negative",
    invalidField: "experience",
    badValueDomain: ["experience", "<", 0],
    build: async (client) => ({
      model: "healthplix.doctor",
      vals: { name: uniqueSeed("SEED-API-DOC"), experience: -1 },
      cleanup: [],
    }),
  },
];

test.describe("Step 8 boundary bug hunter (InvalidOrBoundaryInput, E2E=No)", () => {
  for (const rule of BOUNDARY_RULES) {
    test(`@api @negative ${rule.caseId} | ${rule.title}`, async ({ request }) => {
      const row = apiEligibleCases.find((c) => c.TestCaseID === rule.caseId);
      if (row) await addCaseTrace(row);

      const client = buildClientForPrimaryUser(request);
      await client.authenticate();

      let built: { model: string; vals: Record<string, unknown>; cleanup: number[] };
      try {
        built = await rule.build(client);
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        test.skip(msg.startsWith("SKIP:"), msg.replace(/^SKIP:/, ""));
        throw e;
      }

      let createdId: number | null = null;
      let rejected = false;
      try {
        createdId = await client.callKw<number>(built.model, "create", [built.vals]);
      } catch {
        rejected = true;
      }

      try {
        if (createdId) {
          // Server accepted the create — confirm the invalid value actually persisted.
          const persisted = await client.callKw<Array<Record<string, unknown>>>(
            built.model,
            "search_read",
            [[["id", "=", createdId], rule.badValueDomain]],
            { fields: ["id", rule.invalidField] }
          );
          rejected = persisted.length === 0;
        }

        expect(
          rejected,
          `APP DEFECT: ${built.model} accepted invalid ${rule.invalidField} (${rule.title}). File in 06_bugs/Jira.`
        ).toBeTruthy();
      } finally {
        if (createdId) await client.callKw(built.model, "unlink", [[createdId]]).catch(() => undefined);
        await cleanupParents(client, built.cleanup);
      }
    });
  }
});

/**
 * Removes the parent records (patient / prescription / billing header) created
 * during rule setup. The exact model per id is unknown here, so each id is
 * tried against the candidate parent models; best-effort, failures swallowed.
 */
async function cleanupParents(client: OdooJsonRpcClient, ids: number[]): Promise<void> {
  const parentModels = ["healthplix.prescription", "healthplix.billing", "healthplix.patient"];
  for (const id of [...ids].reverse()) {
    for (const model of parentModels) {
      const ok = await client
        .callKw(model, "unlink", [[id]])
        .then(() => true)
        .catch(() => false);
      if (ok) break;
    }
  }
}
