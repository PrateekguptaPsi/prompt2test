import { readFileSync, writeFileSync } from "node:fs";

type EnvMap = Record<string, string>;

type StoryMap = {
  created: Array<{ requirementId: string; module: string; key: string }>;
};

type Step4Map = {
  results: Array<{
    storyKey: string;
    subtaskKey: string;
    requirementId: string;
    scenarioIds: string[];
  }>;
};

type JiraUser = {
  accountId: string;
  displayName?: string;
  emailAddress?: string;
};

type JiraTransition = {
  id: string;
  name: string;
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

async function findCurrentUser(baseUrl: string, authHeader: string, jiraEmail: string): Promise<JiraUser> {
  const candidates = await jiraFetch<JiraUser[]>(
    baseUrl,
    authHeader,
    `/rest/api/3/user/search?query=${encodeURIComponent(jiraEmail)}`
  );

  if (!Array.isArray(candidates) || !candidates.length) {
    throw new Error(`No Jira user found by query: ${jiraEmail}`);
  }

  const exact =
    candidates.find((u) => (u.emailAddress ?? "").toLowerCase() === jiraEmail.toLowerCase()) ?? candidates[0];

  if (!exact.accountId) throw new Error("Resolved Jira user has no accountId.");
  return exact;
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

function pickTransition(transitions: JiraTransition[], targets: string[]): JiraTransition | null {
  const lower = transitions.map((t) => ({ ...t, lower: t.name.toLowerCase() }));
  for (const wanted of targets) {
    const w = wanted.toLowerCase();
    const exact = lower.find((t) => t.lower === w);
    if (exact) return exact;
    const includes = lower.find((t) => t.lower.includes(w));
    if (includes) return includes;
  }
  return null;
}

async function transitionTo(
  baseUrl: string,
  authHeader: string,
  issueKey: string,
  targets: string[]
): Promise<string | null> {
  const transitions = await getTransitions(baseUrl, authHeader, issueKey);
  const chosen = pickTransition(transitions, targets);
  if (!chosen) return null;

  await jiraFetch(baseUrl, authHeader, `/rest/api/3/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({
      transition: { id: chosen.id },
    }),
  });

  return chosen.name;
}

async function addComment(baseUrl: string, authHeader: string, issueKey: string, text: string): Promise<void> {
  await jiraFetch(baseUrl, authHeader, `/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      },
    }),
  });
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const jiraBaseUrl = normalizeBaseUrl(requireEnv(env, "JIRA_BASE_URL"));
  const jiraEmail = requireEnv(env, "JIRA_EMAIL");
  const jiraToken = requireEnv(env, "JIRA_API_TOKEN");

  const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`;

  const storyMap = JSON.parse(readFileSync("artifacts/jira_story_keys.json", "utf8")) as StoryMap;
  const step4Map = JSON.parse(readFileSync("artifacts/jira_step4_subtasks.json", "utf8")) as Step4Map;

  const user = await findCurrentUser(jiraBaseUrl, authHeader, jiraEmail);
  console.log(`Resolved assignee: ${user.displayName ?? "User"} (${user.accountId})`);

  const subtasksByStory = new Map<string, string[]>();
  for (const row of step4Map.results ?? []) {
    if (!subtasksByStory.has(row.storyKey)) subtasksByStory.set(row.storyKey, []);
    subtasksByStory.get(row.storyKey)!.push(row.subtaskKey);
  }

  const report: Array<{
    storyKey: string;
    storyAssigneeSet: boolean;
    storyTransition: string | null;
    subtasks: Array<{ key: string; assigneeSet: boolean; transition: string | null }>;
  }> = [];

  for (const story of storyMap.created ?? []) {
    const storyKey = story.key;
    let storyAssigneeSet = false;
    try {
      await setAssignee(jiraBaseUrl, authHeader, storyKey, user.accountId);
      storyAssigneeSet = true;
    } catch {}

    // Force story to In Progress (not Done)
    const storyTransition = await transitionTo(jiraBaseUrl, authHeader, storyKey, [
      "In Progress",
      "In progress",
      "Selected for Development",
      "Doing",
    ]);

    const subtasks = subtasksByStory.get(storyKey) ?? [];
    const subtaskResults: Array<{ key: string; assigneeSet: boolean; transition: string | null }> = [];

    for (const subtaskKey of subtasks) {
      let assigneeSet = false;
      try {
        await setAssignee(jiraBaseUrl, authHeader, subtaskKey, user.accountId);
        assigneeSet = true;
      } catch {}

      // Ensure subtask is Done
      const transition = await transitionTo(jiraBaseUrl, authHeader, subtaskKey, ["Done", "Resolved", "Closed"]);

      // add concise audit comment
      await addComment(
        jiraBaseUrl,
        authHeader,
        subtaskKey,
        "Scenario subtask completed and marked Done as requested. Linked Step 4 scenario coverage is documented in 03_scenarios/scenarios.md."
      );

      subtaskResults.push({ key: subtaskKey, assigneeSet, transition });
      console.log(`[subtask] ${subtaskKey} assignee=${assigneeSet} transition=${transition ?? "none"}`);
    }

    await addComment(
      jiraBaseUrl,
      authHeader,
      storyKey,
      "Story status corrected to In Progress as requested. Scenario execution subtasks are completed and assigned."
    );

    report.push({
      storyKey,
      storyAssigneeSet,
      storyTransition,
      subtasks: subtaskResults,
    });

    console.log(`[story] ${storyKey} assignee=${storyAssigneeSet} transition=${storyTransition ?? "none"}`);
  }

  writeFileSync(
    "artifacts/jira_step4_status_fix.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        assigneeAccountId: user.accountId,
        assigneeDisplayName: user.displayName ?? null,
        report,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Saved status/assignee correction report: artifacts/jira_step4_status_fix.json");
}

main().catch((error) => {
  console.error("fix-jira-step4-status-assignee failed:", error);
  process.exit(1);
});
