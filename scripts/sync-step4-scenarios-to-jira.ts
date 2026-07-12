import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

type EnvMap = Record<string, string>;

type StoryMapEntry = {
  requirementId: string;
  module: string;
  key: string;
};

type Scenario = {
  scenarioId: string;
  scenarioName: string;
  band: string;
  linkedRequirementIds: string[];
  modulesInvolved: string;
  trigger: string;
  expectedOutcome: string;
  riskIfFailed: string;
  severityIfFailed: string;
  priority: string;
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

function parseScenarios(markdown: string): Scenario[] {
  const ids = Array.from(markdown.matchAll(/^## ScenarioID:\s*(.+)$/gm)).map((m) => ({
    id: m[1].trim(),
    index: m.index ?? 0,
  }));

  const sections = ids.map((entry, i) => {
    const start = entry.index;
    const end = i + 1 < ids.length ? ids[i + 1].index : markdown.length;
    return markdown.slice(start, end);
  });

  const out: Scenario[] = [];
  for (const section of sections) {
    const scenarioId = /^## ScenarioID:\s*(.+)$/m.exec(section)?.[1]?.trim() ?? "";
    const scenarioName = /- ScenarioName:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";
    const band = /- Band:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";
    const linkedRaw = /- LinkedRequirementIDs:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";
    const linkedRequirementIds = linkedRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const modulesInvolved = /- ModulesInvolved:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";
    const trigger = /- Trigger:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";
    const expectedOutcome = /- ExpectedOutcome:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";
    const riskIfFailed = /- RiskIfFailed:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";
    const severityIfFailed = /- SeverityIfFailed:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";
    const priority = /- Priority:\s*(.+)/.exec(section)?.[1]?.trim() ?? "";

    if (!scenarioId || !scenarioName) continue;
    out.push({
      scenarioId,
      scenarioName,
      band,
      linkedRequirementIds,
      modulesInvolved,
      trigger,
      expectedOutcome,
      riskIfFailed,
      severityIfFailed,
      priority,
    });
  }

  return out;
}

function adfText(text: string) {
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

  const payload = (await response.json().catch(() => ({}))) as T & {
    errorMessages?: string[];
    errors?: Record<string, string>;
  };

  if (!response.ok) {
    throw new Error(
      `Jira API failed ${path}: ${JSON.stringify(
        {
          status: response.status,
          errorMessages: (payload as any).errorMessages ?? null,
          errors: (payload as any).errors ?? null,
        },
        null,
        2
      )}`
    );
  }

  return payload;
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
    } catch (error: any) {
      if (issueType === issueTypeCandidates[issueTypeCandidates.length - 1]) throw error;
    }
  }

  throw new Error(`Unable to create subtask for parent ${parentKey}.`);
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

async function transitionIssue(baseUrl: string, authHeader: string, issueKey: string, targetName: string): Promise<boolean> {
  const transitions = await getTransitions(baseUrl, authHeader, issueKey);
  const target =
    transitions.find((t) => t.name.toLowerCase() === targetName.toLowerCase()) ??
    transitions.find((t) => t.name.toLowerCase().includes(targetName.toLowerCase()));

  if (!target) return false;

  await jiraFetch(baseUrl, authHeader, `/rest/api/3/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({
      transition: { id: target.id },
    }),
  });
  return true;
}

async function addComment(baseUrl: string, authHeader: string, issueKey: string, text: string): Promise<void> {
  await jiraFetch(baseUrl, authHeader, `/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: adfText(text),
    }),
  });
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const jiraBaseUrl = normalizeBaseUrl(requireEnv(env, "JIRA_BASE_URL"));
  const jiraEmail = requireEnv(env, "JIRA_EMAIL");
  const jiraToken = requireEnv(env, "JIRA_API_TOKEN");
  const projectKey = requireEnv(env, "JIRA_PROJECT_KEY");

  const storyMap = JSON.parse(readFileSync("artifacts/jira_story_keys.json", "utf8")) as {
    created: StoryMapEntry[];
  };
  const scenariosMd = readFileSync("03_scenarios/scenarios.md", "utf8");
  const scenarios = parseScenarios(scenariosMd);

  if (!storyMap.created?.length) throw new Error("No story keys found in artifacts/jira_story_keys.json.");
  if (!scenarios.length) throw new Error("No scenarios parsed from 03_scenarios/scenarios.md.");

  const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`;

  const results: Array<{
    storyKey: string;
    requirementId: string;
    subtaskKey: string;
    scenarioIds: string[];
    movedToInProgress: boolean;
    movedToDone: boolean;
  }> = [];

  for (const story of storyMap.created) {
    const related = scenarios.filter((s) => s.linkedRequirementIds.includes(story.requirementId));

    if (!related.length) {
      console.warn(`[skip] ${story.key} (${story.requirementId}) has no linked scenarios.`);
      continue;
    }

    const scenarioLines = related
      .map(
        (s) =>
          `- ${s.scenarioId} | ${s.scenarioName} | Band=${s.band} | Priority=${s.priority} | SeverityIfFailed=${s.severityIfFailed}`
      )
      .join("\n");

    const description = [
      `Step 4 Scenario Coverage for ${story.requirementId} (${story.module})`,
      "",
      "Scenarios included:",
      scenarioLines,
      "",
      "Source: 03_scenarios/scenarios.md",
      "Note: Includes negative/exception paths for quality and defect discovery.",
    ].join("\n");

    const subtaskSummary = `Scenario creation - ${story.module} (${story.requirementId})`;
    const subtaskKey = await createSubtask(jiraBaseUrl, authHeader, projectKey, story.key, subtaskSummary, description);

    const movedToInProgress = await transitionIssue(jiraBaseUrl, authHeader, story.key, "In Progress");
    const movedToDone = await transitionIssue(jiraBaseUrl, authHeader, story.key, "Done");

    const comment = [
      `Step 4 completed for ${story.requirementId}.`,
      `Scenario subtask created: ${subtaskKey}.`,
      `Scenarios: ${related.map((s) => s.scenarioId).join(", ")}.`,
      "Coverage includes core/alternate/E2E and negative/exception paths as applicable.",
      "Artifact: 03_scenarios/scenarios.md",
    ].join(" ");

    await addComment(jiraBaseUrl, authHeader, story.key, comment);

    results.push({
      storyKey: story.key,
      requirementId: story.requirementId,
      subtaskKey,
      scenarioIds: related.map((s) => s.scenarioId),
      movedToInProgress,
      movedToDone,
    });

    console.log(`[updated] ${story.key} -> subtask ${subtaskKey}, transitions In Progress=${movedToInProgress}, Done=${movedToDone}`);
  }

  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/jira_step4_subtasks.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalStoriesProcessed: storyMap.created.length,
        totalUpdates: results.length,
        results,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Saved Step 4 Jira update mapping: artifacts/jira_step4_subtasks.json");
}

main().catch((error) => {
  console.error("sync-step4-scenarios-to-jira failed:", error);
  process.exit(1);
});
