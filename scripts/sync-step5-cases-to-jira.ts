import { readFileSync, writeFileSync } from "node:fs";

type EnvMap = Record<string, string>;

type StoryMapEntry = {
  requirementId: string;
  module: string;
  key: string;
};

type CaseRow = {
  TestCaseID: string;
  Module: string;
  ScenarioID: string;
  RequirementID: string;
  Title: string;
  Type: "Negative" | "Positive";
  Category: string;
  Priority: "P0" | "P1" | "P2" | "P3";
  Preconditions: string;
  TestData: string;
  Steps: string;
  ExpectedResult: string;
  E2E: "Yes" | "No";
};

type JiraTransition = { id: string; name: string };

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

function parseCsv(content: string): CaseRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"' && inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };

  const header = parseLine(lines[0]);
  const rows: CaseRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length !== header.length) continue;

    const row: any = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = cols[c];
    }
    rows.push(row as CaseRow);
  }

  return rows;
}

function toAdfText(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
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
  if (!found?.accountId) throw new Error("Could not resolve assignee accountId.");
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
  const types = ["Sub-task", "Subtask"];

  for (const type of types) {
    try {
      const payload = await jiraFetch<{ key: string }>(baseUrl, authHeader, "/rest/api/3/issue", {
        method: "POST",
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            parent: { key: parentKey },
            issuetype: { name: type },
            summary,
            description: toAdfText(description),
          },
        }),
      });
      return payload.key;
    } catch (error) {
      if (type === types[types.length - 1]) throw error;
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
    body: JSON.stringify({ body: toAdfText(text) }),
  });
}

function buildCaseSummary(cases: CaseRow[]): string {
  const negatives = cases.filter((c) => c.Type === "Negative").length;
  const positives = cases.filter((c) => c.Type === "Positive").length;

  const categorySet = Array.from(new Set(cases.map((c) => c.Category)));
  const lines = cases
    .map(
      (c) =>
        `${c.TestCaseID} | ${c.Type} | ${c.Category} | ${c.Priority} | Scenario=${c.ScenarioID} | E2E=${c.E2E} | ${c.Title}`
    )
    .join("\n");

  return [
    `Step 5 Test Cases`,
    `Total Cases: ${cases.length}`,
    `Negative: ${negatives}, Positive: ${positives}`,
    `Categories Covered: ${categorySet.join(", ")}`,
    ``,
    `Case List:`,
    lines,
    ``,
    `Source Artifact: 04_cases/test_cases.csv`,
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
  const csv = readFileSync("04_cases/test_cases.csv", "utf8");
  const allCases = parseCsv(csv);

  if (!allCases.length) throw new Error("No test cases parsed from 04_cases/test_cases.csv.");
  if (!storyMap.created?.length) throw new Error("No Jira stories found in artifacts/jira_story_keys.json.");

  const report: Array<{
    storyKey: string;
    requirementId: string;
    createdSubtaskKey: string;
    caseCount: number;
    transition: string | null;
  }> = [];

  for (const story of storyMap.created) {
    const cases = allCases.filter((c) => c.RequirementID === story.requirementId);
    if (!cases.length) {
      console.warn(`[skip] No Step 5 cases found for ${story.requirementId} (${story.key})`);
      continue;
    }

    const summary = `Test Case Creation - ${story.module} (${story.requirementId})`;
    const description = buildCaseSummary(cases);

    const subtaskKey = await createSubtask(
      jiraBaseUrl,
      authHeader,
      jiraProjectKey,
      story.key,
      summary,
      description
    );

    await setAssignee(jiraBaseUrl, authHeader, subtaskKey, assigneeAccountId);
    await setAssignee(jiraBaseUrl, authHeader, story.key, assigneeAccountId);

    const transition = await transitionToDone(jiraBaseUrl, authHeader, subtaskKey);

    await addComment(
      jiraBaseUrl,
      authHeader,
      story.key,
      `Step 5 cases prepared for ${story.requirementId}. Subtask ${subtaskKey} created with ${cases.length} cases and marked Done.`
    );

    report.push({
      storyKey: story.key,
      requirementId: story.requirementId,
      createdSubtaskKey: subtaskKey,
      caseCount: cases.length,
      transition,
    });

    console.log(
      `[step5] ${story.key} (${story.requirementId}) -> ${subtaskKey}, cases=${cases.length}, transition=${transition ?? "none"}`
    );
  }

  writeFileSync(
    "artifacts/jira_step5_subtasks.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        assigneeEmail: jiraEmail,
        totalCases: allCases.length,
        totalStoryLinks: report.length,
        report,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Saved Step 5 Jira subtask mapping: artifacts/jira_step5_subtasks.json");
}

main().catch((error) => {
  console.error("sync-step5-cases-to-jira failed:", error);
  process.exit(1);
});
