import { readFileSync, writeFileSync } from "node:fs";

type EnvMap = Record<string, string>;
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
function norm(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function jiraFetch<T>(base: string, auth: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Jira API failed ${path}: ${JSON.stringify(
        { status: res.status, errorMessages: payload?.errorMessages ?? null, errors: payload?.errors ?? null },
        null,
        2
      )}`
    );
  }
  return payload as T;
}

async function findUserAccountId(base: string, auth: string, email: string): Promise<string> {
  const users = await jiraFetch<Array<{ accountId: string; emailAddress?: string }>>(
    base,
    auth,
    `/rest/api/3/user/search?query=${encodeURIComponent(email)}`
  );
  const found = users.find((u) => (u.emailAddress ?? "").toLowerCase() === email.toLowerCase()) ?? users[0];
  if (!found?.accountId) throw new Error("Unable to resolve Jira accountId for assignee.");
  return found.accountId;
}

async function setAssignee(base: string, auth: string, key: string, accountId: string): Promise<void> {
  await jiraFetch(base, auth, `/rest/api/3/issue/${key}/assignee`, {
    method: "PUT",
    body: JSON.stringify({ accountId }),
  });
}

async function getStatus(base: string, auth: string, key: string): Promise<string> {
  const issue = await jiraFetch<{ fields: { status: { name: string } } }>(
    base,
    auth,
    `/rest/api/3/issue/${key}?fields=status`,
    { method: "GET" }
  );
  return issue.fields.status.name;
}

async function getTransitions(base: string, auth: string, key: string): Promise<JiraTransition[]> {
  const p = await jiraFetch<{ transitions: JiraTransition[] }>(
    base,
    auth,
    `/rest/api/3/issue/${key}/transitions`,
    { method: "GET" }
  );
  return p.transitions ?? [];
}

function pickTransition(transitions: JiraTransition[], preferred: string[]): JiraTransition | null {
  const list = transitions.map((t) => ({ ...t, lc: t.name.toLowerCase() }));
  for (const p of preferred) {
    const pLc = p.toLowerCase();
    const exact = list.find((t) => t.lc === pLc);
    if (exact) return exact;
    const includes = list.find((t) => t.lc.includes(pLc));
    if (includes) return includes;
  }
  return null;
}

async function transition(base: string, auth: string, key: string, id: string): Promise<void> {
  await jiraFetch(base, auth, `/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id } }),
  });
}

function isDoneLike(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("done") || s.includes("closed") || s.includes("resolved");
}

async function ensureStoryActive(base: string, auth: string, key: string): Promise<string> {
  let status = await getStatus(base, auth, key);
  if (!isDoneLike(status)) return status;

  const transitions = await getTransitions(base, auth, key);
  const preferred = [
    "In Progress",
    "In Review",
    "To Do",
    "Selected for Development",
    "Open",
    "Reopened",
    "Backlog",
  ];
  let chosen = pickTransition(transitions, preferred);

  if (!chosen) {
    // fallback: choose any non-done-ish transition
    chosen = transitions.find((t) => !isDoneLike(t.name)) ?? null;
  }

  if (!chosen) return status;
  await transition(base, auth, key, chosen.id);
  status = await getStatus(base, auth, key);
  return status;
}

async function ensureSubtaskDone(base: string, auth: string, key: string): Promise<string> {
  let status = await getStatus(base, auth, key);
  if (isDoneLike(status)) return status;

  const transitions = await getTransitions(base, auth, key);
  const chosen = pickTransition(transitions, ["Done", "Resolved", "Closed"]);
  if (!chosen) return status;

  await transition(base, auth, key, chosen.id);
  status = await getStatus(base, auth, key);
  return status;
}

async function addComment(base: string, auth: string, key: string, text: string): Promise<void> {
  await jiraFetch(base, auth, `/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    }),
  });
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const base = norm(requireEnv(env, "JIRA_BASE_URL"));
  const email = requireEnv(env, "JIRA_EMAIL");
  const token = requireEnv(env, "JIRA_API_TOKEN");
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

  const storyMap = JSON.parse(readFileSync("artifacts/jira_story_keys.json", "utf8")) as {
    created: Array<{ key: string; requirementId: string; module: string }>;
  };
  const subMap = JSON.parse(readFileSync("artifacts/jira_step4_subtasks.json", "utf8")) as {
    results: Array<{ storyKey: string; subtaskKey: string }>;
  };

  const accountId = await findUserAccountId(base, auth, email);

  const subtasksByStory = new Map<string, string[]>();
  for (const row of subMap.results ?? []) {
    if (!subtasksByStory.has(row.storyKey)) subtasksByStory.set(row.storyKey, []);
    subtasksByStory.get(row.storyKey)!.push(row.subtaskKey);
  }

  const report: any[] = [];

  for (const story of storyMap.created ?? []) {
    const storyKey = story.key;
    await setAssignee(base, auth, storyKey, accountId);
    const storyStatus = await ensureStoryActive(base, auth, storyKey);

    const subtaskKeys = subtasksByStory.get(storyKey) ?? [];
    const subtaskReport: any[] = [];

    for (const sk of subtaskKeys) {
      await setAssignee(base, auth, sk, accountId);
      const finalStatus = await ensureSubtaskDone(base, auth, sk);
      subtaskReport.push({ key: sk, finalStatus });
    }

    await addComment(
      base,
      auth,
      storyKey,
      `Status normalized per request: story kept active (${storyStatus}), subtasks moved to Done, all issues assigned to ${email}.`
    );

    report.push({ storyKey, finalStoryStatus: storyStatus, subtasks: subtaskReport });
    console.log(`[normalized] ${storyKey} => ${storyStatus}; subtasks=${subtaskReport.map((s) => `${s.key}:${s.finalStatus}`).join(", ")}`);
  }

  writeFileSync(
    "artifacts/jira_step4_status_normalized.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        assigneeEmail: email,
        assigneeAccountId: accountId,
        report,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Saved normalization report: artifacts/jira_step4_status_normalized.json");
}

main().catch((e) => {
  console.error("normalize-jira-step4-status failed:", e);
  process.exit(1);
});
