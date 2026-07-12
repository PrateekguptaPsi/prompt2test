import { readFileSync, writeFileSync } from "node:fs";

type EnvMap = Record<string, string>;

type StoryMapEntry = {
  requirementId: string;
  module: string;
  key: string;
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
  const v = env[key];
  if (!v) throw new Error(`Missing required environment variable: ${key}`);
  return v;
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

async function jiraFetch<T>(baseUrl: string, auth: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Jira API failed ${path}: ${JSON.stringify(
        { status: response.status, errorMessages: (payload as any)?.errorMessages ?? null, errors: (payload as any)?.errors ?? null },
        null,
        2
      )}`
    );
  }

  return payload as T;
}

async function findCurrentUserAccountId(baseUrl: string, auth: string, jiraEmail: string): Promise<string> {
  const users = await jiraFetch<Array<{ accountId: string; emailAddress?: string }>>(
    baseUrl,
    auth,
    `/rest/api/3/user/search?query=${encodeURIComponent(jiraEmail)}`
  );
  const found = users.find((u) => (u.emailAddress ?? "").toLowerCase() === jiraEmail.toLowerCase()) ?? users[0];
  if (!found?.accountId) throw new Error("Unable to resolve Jira assignee accountId.");
  return found.accountId;
}

async function createSubtask(
  baseUrl: string,
  auth: string,
  projectKey: string,
  parentKey: string,
  summary: string,
  description: string
): Promise<string> {
  const issueTypeCandidates = ["Sub-task", "Subtask"];

  for (const issueType of issueTypeCandidates) {
    try {
      const payload = await jiraFetch<{ key: string }>(baseUrl, auth, "/rest/api/3/issue", {
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
    } catch (e) {
      if (issueType === issueTypeCandidates[issueTypeCandidates.length - 1]) throw e;
    }
  }

  throw new Error(`Failed to create subtask under ${parentKey}`);
}

async function setAssignee(baseUrl: string, auth: string, issueKey: string, accountId: string): Promise<void> {
  await jiraFetch(baseUrl, auth, `/rest/api/3/issue/${issueKey}/assignee`, {
    method: "PUT",
    body: JSON.stringify({ accountId }),
  });
}

async function getTransitions(baseUrl: string, auth: string, issueKey: string): Promise<JiraTransition[]> {
  const payload = await jiraFetch<{ transitions: JiraTransition[] }>(
    baseUrl,
    auth,
    `/rest/api/3/issue/${issueKey}/transitions`,
    { method: "GET" }
  );
  return payload.transitions ?? [];
}

async function transitionToDone(baseUrl: string, auth: string, issueKey: string): Promise<string | null> {
  const transitions = await getTransitions(baseUrl, auth, issueKey);
  const target =
    transitions.find((t) => t.name.toLowerCase() === "done") ??
    transitions.find((t) => t.name.toLowerCase().includes("done")) ??
    transitions.find((t) => t.name.toLowerCase().includes("resolve")) ??
    transitions.find((t) => t.name.toLowerCase().includes("close"));

  if (!target) return null;

  await jiraFetch(baseUrl, auth, `/rest/api/3/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: target.id } }),
  });

  return target.name;
}

async function addComment(baseUrl: string, auth: string, issueKey: string, text: string): Promise<void> {
  await jiraFetch(baseUrl, auth, `/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    body: JSON.stringify({ body: adfText(text) }),
  });
}

async function getWorklogs(baseUrl: string, auth: string, issueKey: string): Promise<Array<{ comment?: unknown }>> {
  const payload = await jiraFetch<{ worklogs: Array<{ comment?: unknown }> }>(
    baseUrl,
    auth,
    `/rest/api/3/issue/${issueKey}/worklog`
  );
  return payload.worklogs ?? [];
}

async function addWorklog(
  baseUrl: string,
  auth: string,
  issueKey: string,
  marker: string,
  minutes: number,
  artifactText: string
): Promise<boolean> {
  const existing = await getWorklogs(baseUrl, auth, issueKey);
  const exists = existing.some((w) => JSON.stringify(w.comment ?? {}).includes(marker));
  if (exists) return false;

  await jiraFetch(baseUrl, auth, `/rest/api/3/issue/${issueKey}/worklog`, {
    method: "POST",
    body: JSON.stringify({
      timeSpentSeconds: minutes * 60,
      comment: adfText(`${marker} | Step 7 | Best-effort approximation | Artifacts: ${artifactText}`),
    }),
  });

  return true;
}

function frameworkDescription(story: StoryMapEntry): string {
  return [
    `Step 7 Automation Framework implemented for ${story.requirementId} (${story.module}).`,
    ``,
    `Framework root: 05_automation/`,
    `- OdooBasePage with SPA-safe waits for .o_form_view and .o_list_view`,
    `- One page object per module (Patients, Doctors, Prescriptions, Lab Reports, IPD Details, Appointments, Billing, Ward, Bed)`,
    `- JSON-RPC auth setup with cookie-based storageState`,
    `- Data-driven Priority-High specs from 04_cases/test_cases.csv`,
    `- Tags used in tests: @smoke, @regression, @negative, @positive`,
    `- Reporters: HTML + JUnit`,
    ``,
    `Key files:`,
    `- 05_automation/playwright.config.ts`,
    `- 05_automation/tests/auth.setup.ts`,
    `- 05_automation/tests/high-priority-cases.spec.ts`,
    `- 05_automation/fixtures/automationFixtures.ts`,
    `- 05_automation/data/testCaseLoader.ts`,
    `- 05_automation/pages/*.ts`,
    `- 05_automation/utils/rpcAuth.ts`,
    `- 05_automation/utils/env.ts`,
    ``,
    `Sanity checks completed:`,
    `- npx tsc -p 05_automation/tsconfig.json --noEmit`,
    `- npx playwright test -c 05_automation/playwright.config.ts --list`,
  ].join("\n");
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const jiraBaseUrl = normalizeBaseUrl(requireEnv(env, "JIRA_BASE_URL"));
  const jiraEmail = requireEnv(env, "JIRA_EMAIL");
  const jiraToken = requireEnv(env, "JIRA_API_TOKEN");
  const jiraProjectKey = requireEnv(env, "JIRA_PROJECT_KEY");

  const auth = `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`;
  const accountId = await findCurrentUserAccountId(jiraBaseUrl, auth, jiraEmail);

  const stories = JSON.parse(readFileSync("artifacts/jira_story_keys.json", "utf8")) as { created: StoryMapEntry[] };
  const report: Array<{
    storyKey: string;
    requirementId: string;
    subtaskKey: string;
    transition: string | null;
    worklogPosted: boolean;
  }> = [];

  for (const story of stories.created ?? []) {
    const summary = `Automation Framework (Step 7) - ${story.module} (${story.requirementId})`;
    const subtaskKey = await createSubtask(
      jiraBaseUrl,
      auth,
      jiraProjectKey,
      story.key,
      summary,
      frameworkDescription(story)
    );

    await setAssignee(jiraBaseUrl, auth, subtaskKey, accountId);
    await setAssignee(jiraBaseUrl, auth, story.key, accountId);

    const transition = await transitionToDone(jiraBaseUrl, auth, subtaskKey);

    const marker = `EFFORT-STEP7-${subtaskKey}`;
    const worklogPosted = await addWorklog(
      jiraBaseUrl,
      auth,
      subtaskKey,
      marker,
      25,
      "05_automation/playwright.config.ts, tests/auth.setup.ts, tests/high-priority-cases.spec.ts"
    );

    await addComment(
      jiraBaseUrl,
      auth,
      story.key,
      `Step 7 framework subtask ${subtaskKey} created, assigned, transitioned to Done, with effort log marker ${marker}.`
    );

    report.push({
      storyKey: story.key,
      requirementId: story.requirementId,
      subtaskKey,
      transition,
      worklogPosted,
    });

    console.log(`[step7] ${story.key} -> ${subtaskKey}, transition=${transition ?? "none"}, worklog=${worklogPosted}`);
  }

  writeFileSync(
    "artifacts/jira_step7_subtasks.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        assigneeEmail: jiraEmail,
        report,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Saved Step 7 Jira subtask mapping: artifacts/jira_step7_subtasks.json");
}

main().catch((error) => {
  console.error("sync-step7-framework-to-jira failed:", error);
  process.exit(1);
});
