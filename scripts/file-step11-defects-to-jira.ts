import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

type EnvMap = Record<string, string>;

type ConfirmedDefect = {
  id: string;
  testCaseId: string;
  requirementId: string;
  scenarioId: string;
  module: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  priority: "P0" | "P1" | "P2" | "P3";
  title: string;
  preconditions: string;
  steps: string[];
  expected: string;
  actual: string;
  businessImpact: string;
  evidence: {
    payload?: {
      model?: string;
      method?: string;
      args?: unknown[];
    };
    traceRefs?: string[];
  };
  status: string;
  jiraKey: string;
};

type ConfirmedDefectsFile = {
  generatedAt: string;
  sourceEvidence: string[];
  confirmedDefects: ConfirmedDefect[];
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

async function jiraFetch<T>(
  baseUrl: string,
  authHeader: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    throw new Error(
      `Jira API failed ${path}: ${JSON.stringify(
        {
          status: response.status,
          errorMessages: payload?.errorMessages ?? null,
          errors: payload?.errors ?? null,
        },
        null,
        2
      )}`
    );
  }
  return payload as T;
}

function toAdf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function targetPriorityName(severity: ConfirmedDefect["severity"]): string {
  if (severity === "Critical") return "Highest";
  if (severity === "High") return "High";
  if (severity === "Medium") return "Medium";
  return "Low";
}

async function resolvePriorityId(
  baseUrl: string,
  authHeader: string,
  severity: ConfirmedDefect["severity"]
): Promise<string | null> {
  const priorities = await jiraFetch<Array<{ id: string; name: string }>>(
    baseUrl,
    authHeader,
    "/rest/api/3/priority",
    { method: "GET" }
  );

  const wanted = targetPriorityName(severity).toLowerCase();
  const exact = priorities.find((p) => p.name.toLowerCase() === wanted);
  if (exact) return exact.id;

  const contains = priorities.find((p) => p.name.toLowerCase().includes(wanted));
  return contains?.id ?? null;
}

function buildDescription(defect: ConfirmedDefect): string {
  const payload = defect.evidence.payload ? JSON.stringify(defect.evidence.payload, null, 2) : "N/A";
  const traces = defect.evidence.traceRefs?.length ? defect.evidence.traceRefs.join(", ") : "N/A";

  return [
    `1) Patient-safety impact summary`,
    `${defect.businessImpact}`,
    ``,
    `2) Preconditions`,
    defect.preconditions,
    ``,
    `3) Steps to reproduce`,
    ...defect.steps.map((s, i) => `${i + 1}. ${s}`),
    ``,
    `4) Expected result`,
    defect.expected,
    ``,
    `5) Actual result`,
    defect.actual,
    ``,
    `6) Business impact`,
    defect.businessImpact,
    ``,
    `7) Evidence references`,
    `API payload:`,
    payload,
    `Trace refs: ${traces}`,
    ``,
    `8) Traceability IDs`,
    `Bug ID: ${defect.id}`,
    `Requirement ID: ${defect.requirementId}`,
    `Scenario/TestCase ID: ${defect.scenarioId} / ${defect.testCaseId}`,
  ].join("\n");
}

async function createBugIssue(
  baseUrl: string,
  authHeader: string,
  projectKey: string,
  defect: ConfirmedDefect
): Promise<string> {
  const priorityId = await resolvePriorityId(baseUrl, authHeader, defect.severity);
  const summary = `${defect.id} | ${defect.module} | ${defect.title}`;

  const fields: Record<string, unknown> = {
    project: { key: projectKey },
    issuetype: { name: "Bug" },
    summary,
    description: toAdf(buildDescription(defect)),
  };

  if (priorityId) {
    fields.priority = { id: priorityId };
  }

  const created = await jiraFetch<{ key: string }>(baseUrl, authHeader, "/rest/api/3/issue", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });

  return created.key;
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const jiraBaseUrl = normalizeBaseUrl(requireEnv(env, "JIRA_BASE_URL"));
  const jiraEmail = requireEnv(env, "JIRA_EMAIL");
  const jiraToken = requireEnv(env, "JIRA_API_TOKEN");
  const jiraProjectKey = requireEnv(env, "JIRA_PROJECT_KEY");

  const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`;

  const defectsFile = JSON.parse(readFileSync("06_bugs/confirmed_defects.json", "utf8")) as ConfirmedDefectsFile;
  const confirmed = defectsFile.confirmedDefects.filter((d) => d.status === "Confirmed");

  if (!confirmed.length) throw new Error("No confirmed defects found in 06_bugs/confirmed_defects.json.");

  const created: Array<{ id: string; key: string; module: string; title: string }> = [];

  for (const defect of confirmed) {
    if (defect.jiraKey?.trim()) {
      created.push({ id: defect.id, key: defect.jiraKey, module: defect.module, title: defect.title });
      continue;
    }

    const key = await createBugIssue(jiraBaseUrl, authHeader, jiraProjectKey, defect);
    defect.jiraKey = key;
    defect.status = "FiledToJira";
    created.push({ id: defect.id, key, module: defect.module, title: defect.title });
    console.log(`[jira] ${defect.id} -> ${key}`);
  }

  writeFileSync("06_bugs/confirmed_defects.json", JSON.stringify(defectsFile, null, 2), "utf8");

  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/jira_step11_defects.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectKey: jiraProjectKey,
        totalFiled: created.length,
        created,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Saved Jira defect mapping: artifacts/jira_step11_defects.json");
}

main().catch((error) => {
  console.error("file-step11-defects-to-jira failed:", error);
  process.exit(1);
});
