import { readFileSync, writeFileSync } from "node:fs";

type EnvMap = Record<string, string>;

type StoryMapEntry = {
  requirementId: string;
  module: string;
  key: string;
};

type SeedSummary = {
  generatedAt: string;
  runTag: string;
  baseUrl: string;
  created: Record<string, number>;
  existing: Record<string, number>;
  totalsAfterSeed: Record<string, number>;
};

type JiraTransition = { id: string; name: string };

function parseEnv(raw: string): EnvMap {
  const env: EnvMap = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
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

function adfText(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function jiraFetch<T>(baseUrl: string, authHeader: string, path: string, init?: RequestInit): Promise<T> {
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

async function findCurrentUserAccountId(baseUrl: string, authHeader: string, jiraEmail: string): Promise<string> {
  const users = await jiraFetch<Array<{ accountId: string; emailAddress?: string }>>(
    baseUrl,
    authHeader,
    `/rest/api/3/user/search?query=${encodeURIComponent(jiraEmail)}`
  );
  const found = users.find((u) => (u.emailAddress ?? "").toLowerCase() === jiraEmail.toLowerCase()) ?? users[0];
  if (!found?.accountId) throw new Error("Unable to resolve Jira assignee accountId.");
  return found.accountId;
}

async function createSubtask(
  baseUrl: string,
  authHeader: string,
  projectKey: string,
  parentKey: string,
  summary: string,
  description: string
): Promise<string> {
  const issueTypeCandidates = ["Sub-task", "Subtask"];

  for (const issueType of issueTypeCandidates) {
    try {
      const payload = await jiraFetch<{ key: string }>(baseUrl, authHeader, "/rest/api/3/issue", {
        method: "POST",
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            parent: { key: parentKey },
            issuetype: { name: issueType },
            summary,
            description: adfText(description),
          },
        }),
      });
      return payload.key;
    } catch (error) {
      if (issueType === issueTypeCandidates[issueTypeCandidates.length - 1]) throw error;
    }
  }

  throw new Error(`Failed to create subtask under ${parentKey}`);
}

async function setAssignee(baseUrl: string, authHeader: string, issueKey: string, accountId: string): Promise<void> {
  await jiraFetch(baseUrl, authHeader, `/rest/api/3/issue/${issueKey}/assignee`, {
    method: "PUT",
    body: JSON.stringify({ accountId }),
  });
}

async function getTransitions(baseUrl: string, authHeader: string, issueKey: string): Promise<JiraTransition[]> {
  const payload = await jiraFetch<{ transitions: JiraTransition[] }>(
    baseUrl,
    authHeader,
    `/rest/api/3/issue/${issueKey}/transitions`,
    { method: "GET" }
  );
  return payload.transitions ?? [];
}

async function transitionToDone(baseUrl: string, authHeader: string, issueKey: string): Promise<string | null> {
  const transitions = await getTransitions(baseUrl, authHeader, issueKey);
  const target =
    transitions.find((t) => t.name.toLowerCase() === "done") ??
    transitions.find((t) => t.name.toLowerCase().includes("done")) ??
    transitions.find((t) => t.name.toLowerCase().includes("resolve")) ??
    transitions.find((t) => t.name.toLowerCase().includes("close"));

  if (!target) return null;

  await jiraFetch(baseUrl, authHeader, `/rest/api/3/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: target.id } }),
  });

  return target.name;
}

async function addComment(baseUrl: string, authHeader: string, issueKey: string, text: string): Promise<void> {
  await jiraFetch(baseUrl, authHeader, `/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    body: JSON.stringify({ body: adfText(text) }),
  });
}

function buildDescription(seed: SeedSummary, story: StoryMapEntry): string {
  return [
    `Step 6 Test Data Creation completed for ${story.requirementId} (${story.module}).`,
    ``,
    `RunTag: ${seed.runTag}`,
    `GeneratedAt: ${seed.generatedAt}`,
    `BaseURL: ${seed.baseUrl}`,
    ``,
    `Seed Totals (After):`,
    `- healthplix.patient: ${seed.totalsAfterSeed["healthplix.patient"] ?? 0}`,
    `- healthplix.doctor: ${seed.totalsAfterSeed["healthplix.doctor"] ?? 0}`,
    `- healthplix.appointment: ${seed.totalsAfterSeed["healthplix.appointment"] ?? 0}`,
    `- healthplix.prescription: ${seed.totalsAfterSeed["healthplix.prescription"] ?? 0}`,
    `- healthplix.prescription.line: ${seed.totalsAfterSeed["healthplix.prescription.line"] ?? 0}`,
    `- healthplix.lab.report: ${seed.totalsAfterSeed["healthplix.lab.report"] ?? 0}`,
    `- healthplix.billing: ${seed.totalsAfterSeed["healthplix.billing"] ?? 0}`,
    ``,
    `Dashboard verification completed for key counters:`,
    `- Total Patients = ${seed.totalsAfterSeed["healthplix.patient"] ?? 0}`,
    `- OPD Appointments = ${seed.totalsAfterSeed["healthplix.appointment"] ?? 0}`,
    `- Pending Lab Tests = ${seed.totalsAfterSeed["healthplix.lab.report"] ?? 0}`,
    `- Active Doctors = ${seed.totalsAfterSeed["healthplix.doctor"] ?? 0}`,
    ``,
    `Artifacts: artifacts/seed_data_summary.json`,
  ].join("\n");
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const jiraBaseUrl = normalizeBaseUrl(requireEnv(env, "JIRA_BASE_URL"));
  const jiraEmail = requireEnv(env, "JIRA_EMAIL");
  const jiraToken = requireEnv(env, "JIRA_API_TOKEN");
  const jiraProjectKey = requireEnv(env, "JIRA_PROJECT_KEY");

  const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`;
  const assigneeAccountId = await findCurrentUserAccountId(jiraBaseUrl, authHeader, jiraEmail);

  const storyMap = JSON.parse(readFileSync("artifacts/jira_story_keys.json", "utf8")) as { created: StoryMapEntry[] };
  const seedSummary = JSON.parse(readFileSync("artifacts/seed_data_summary.json", "utf8")) as SeedSummary;

  const report: Array<{
    storyKey: string;
    requirementId: string;
    createdSubtaskKey: string;
    transition: string | null;
  }> = [];

  for (const story of storyMap.created ?? []) {
    const subtaskSummary = `Test Data Creation - ${story.module} (${story.requirementId})`;
    const description = buildDescription(seedSummary, story);

    const subtaskKey = await createSubtask(
      jiraBaseUrl,
      authHeader,
      jiraProjectKey,
      story.key,
      subtaskSummary,
      description
    );

    await setAssignee(jiraBaseUrl, authHeader, subtaskKey, assigneeAccountId);
    await setAssignee(jiraBaseUrl, authHeader, story.key, assigneeAccountId);

    const transition = await transitionToDone(jiraBaseUrl, authHeader, subtaskKey);

    await addComment(
      jiraBaseUrl,
      authHeader,
      story.key,
      `Step 6 test data prepared and verified. Subtask ${subtaskKey} created, assigned, and moved to Done.`
    );

    report.push({
      storyKey: story.key,
      requirementId: story.requirementId,
      createdSubtaskKey: subtaskKey,
      transition,
    });

    console.log(
      `[step6] ${story.key} (${story.requirementId}) -> ${subtaskKey}, transition=${transition ?? "none"}`
    );
  }

  writeFileSync(
    "artifacts/jira_step6_subtasks.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        assigneeEmail: jiraEmail,
        runTag: seedSummary.runTag,
        report,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Saved Step 6 Jira subtask mapping: artifacts/jira_step6_subtasks.json");
}

main().catch((error) => {
  console.error("sync-step6-testdata-to-jira failed:", error);
  process.exit(1);
});
