import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

type EnvMap = Record<string, string>;

type Story = {
  requirementId: string;
  module: string;
  userStory: string;
  priority: string;
  acceptanceCriteria: string[];
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

function parseStories(markdown: string): Story[] {
  const blocks = markdown
    .split(/\r?\n(?=- RequirementID:)/g)
    .map((b) => b.trim())
    .filter((b) => b.startsWith("- RequirementID:"));

  const stories: Story[] = [];

  for (const block of blocks) {
    const requirementId = /- RequirementID:\s*`([^`]+)`/.exec(block)?.[1]?.trim() ?? "";
    const module = /- Module:\s*`([^`]+)`/.exec(block)?.[1]?.trim() ?? "";
    const userStory = /- UserStory:\s*`([^`]+)`/.exec(block)?.[1]?.trim() ?? "";
    const priority = /- Priority:\s*`([^`]+)`/.exec(block)?.[1]?.trim() ?? "";

    const acceptanceCriteria = Array.from(block.matchAll(/\n\s+\d+\.\s+(Given .*?)(?=\n\s+\d+\.|\n?$)/gs)).map(
      (m) => m[1].replace(/\s+/g, " ").trim()
    );

    if (!requirementId || !module || !userStory || !priority || acceptanceCriteria.length === 0) {
      continue;
    }

    stories.push({ requirementId, module, userStory, priority, acceptanceCriteria });
  }

  return stories;
}

function toAdf(story: Story) {
  const acLines = story.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join("\n");
  const text = [
    `RequirementID: ${story.requirementId}`,
    `Module: ${story.module}`,
    `Priority: ${story.priority}`,
    "",
    `UserStory: ${story.userStory}`,
    "",
    "AcceptanceCriteria:",
    acLines,
  ].join("\n");

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

async function createIssue(baseUrl: string, authHeader: string, projectKey: string, story: Story): Promise<string> {
  const summary = `${story.requirementId} | ${story.module} | ${story.userStory.slice(0, 90)}`;

  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        issuetype: { name: "Story" },
        summary,
        description: toAdf(story),
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    key?: string;
    errors?: Record<string, string>;
    errorMessages?: string[];
  };

  if (!response.ok || !payload.key) {
    const details = JSON.stringify(
      {
        status: response.status,
        errors: payload.errors ?? null,
        errorMessages: payload.errorMessages ?? null,
      },
      null,
      2
    );
    throw new Error(`Jira create issue failed for ${story.requirementId}: ${details}`);
  }

  return payload.key;
}

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const jiraBaseUrl = normalizeBaseUrl(requireEnv(env, "JIRA_BASE_URL"));
  const jiraEmail = requireEnv(env, "JIRA_EMAIL");
  const jiraToken = requireEnv(env, "JIRA_API_TOKEN");
  const jiraProjectKey = requireEnv(env, "JIRA_PROJECT_KEY");

  const markdown = readFileSync("02_stories/user_stories.md", "utf8");
  const stories = parseStories(markdown);

  if (!stories.length) {
    throw new Error("No stories were parsed from 02_stories/user_stories.md.");
  }

  const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`;
  const created: Array<{ requirementId: string; module: string; key: string }> = [];

  for (const story of stories) {
    const key = await createIssue(jiraBaseUrl, authHeader, jiraProjectKey, story);
    created.push({ requirementId: story.requirementId, module: story.module, key });
    console.log(`[created] ${story.requirementId} (${story.module}) -> ${key}`);
  }

  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/jira_story_keys.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectKey: jiraProjectKey,
        totalCreated: created.length,
        created,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Saved story key mapping: artifacts/jira_story_keys.json");
}

main().catch((error) => {
  console.error("create-jira-stories failed:", error);
  process.exit(1);
});
