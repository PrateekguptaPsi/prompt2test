import { readFileSync, existsSync } from "node:fs";

type EnvMap = Record<string, string>;

type JiraWorklog = {
  id: string;
  comment?: any;
};

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

function extractCommentText(comment: any): string {
  if (!comment) return "";
  if (typeof comment === "string") return comment;
  try {
    return JSON.stringify(comment);
  } catch {
    return "";
  }
}

async function getWorklogs(baseUrl: string, auth: string, issueKey: string): Promise<JiraWorklog[]> {
  const payload = await jiraFetch<{ worklogs: JiraWorklog[] }>(baseUrl, auth, `/rest/api/3/issue/${issueKey}/worklog`);
  return payload.worklogs ?? [];
}

async function addWorklog(
  baseUrl: string,
  auth: string,
  issueKey: string,
  timeSpentMinutes: number,
  commentText: string
): Promise<void> {
  // Jira Cloud accepts ADF comment payload.
  const body = {
    timeSpentSeconds: timeSpentMinutes * 60,
    comment: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: commentText }],
        },
      ],
    },
  };

  await jiraFetch(baseUrl, auth, `/rest/api/3/issue/${issueKey}/worklog`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

type SubtaskPlan = {
  key: string;
  step: string;
  minutes: number;
  marker: string;
  artifact: string;
};

function buildPlanFromArtifact(path: string, step: string, minutes: number, markerPrefix: string, artifact: string): SubtaskPlan[] {
  if (!existsSync(path)) return [];
  const payload = JSON.parse(readFileSync(path, "utf8")) as any;
  const rows: Array<{ createdSubtaskKey?: string; subtaskKey?: string }> = payload.report ?? payload.results ?? [];
  return rows
    .map((r) => (r.createdSubtaskKey ?? r.subtaskKey ?? "").trim())
    .filter(Boolean)
    .map((key) => ({
      key,
      step,
      minutes,
      marker: `${markerPrefix}-${key}`,
      artifact,
    }));
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const jiraBaseUrl = normalizeBaseUrl(requireEnv(env, "JIRA_BASE_URL"));
  const jiraEmail = requireEnv(env, "JIRA_EMAIL");
  const jiraToken = requireEnv(env, "JIRA_API_TOKEN");
  const auth = `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`;

  const plan: SubtaskPlan[] = [
    ...buildPlanFromArtifact(
      "artifacts/jira_step4_subtasks.json",
      "Step 4",
      20,
      "EFFORT-STEP4",
      "03_scenarios/scenarios.md"
    ),
    ...buildPlanFromArtifact(
      "artifacts/jira_step5_subtasks.json",
      "Step 5",
      15,
      "EFFORT-STEP5",
      "04_cases/test_cases.csv"
    ),
    ...buildPlanFromArtifact(
      "artifacts/jira_step6_subtasks.json",
      "Step 6",
      15,
      "EFFORT-STEP6",
      "artifacts/seed_data_summary.json + artifacts/seed_edge_summary.json"
    ),
  ];

  if (!plan.length) {
    throw new Error("No subtask plans found from artifacts.");
  }

  let posted = 0;
  let skipped = 0;

  for (const item of plan) {
    const existingLogs = await getWorklogs(jiraBaseUrl, auth, item.key);
    const hasMarker = existingLogs.some((w) => extractCommentText(w.comment).includes(item.marker));

    if (hasMarker) {
      skipped++;
      console.log(`[skip] ${item.key} already has effort marker ${item.marker}`);
      continue;
    }

    const comment = `${item.marker} | ${item.step} | Best-effort approximation | Artifact(s): ${item.artifact}`;
    await addWorklog(jiraBaseUrl, auth, item.key, item.minutes, comment);
    posted++;
    console.log(`[logged] ${item.key} ${item.minutes}m (${item.step})`);
  }

  console.log(`Worklog update complete. posted=${posted}, skipped=${skipped}, total=${plan.length}`);
}

main().catch((error) => {
  console.error("log-jira-subtask-efforts failed:", error);
  process.exit(1);
});
