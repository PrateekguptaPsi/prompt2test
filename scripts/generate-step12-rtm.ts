import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

type Row = Record<string, string>;

function parseCsvLine(line: string): string[] {
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
  return out;
}

function parseCsv(content: string): Row[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = cols[c] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function csvEscape(val: string): string {
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

function extractStatusesFromJunit(xml: string): Map<string, string> {
  const statusByCase = new Map<string, string>();
  const testcaseBlockRe = /<testcase\b[\s\S]*?<\/testcase>/g;
  const blocks = xml.match(testcaseBlockRe) ?? [];

  for (const block of blocks) {
    const idMatch = block.match(/<property name="TestCaseID" value="([^"]+)"/);
    if (!idMatch) continue;
    const testCaseId = idMatch[1];

    let status = "Passed";
    if (/<failure\b/.test(block)) status = "Failed";
    else if (/<skipped\b/.test(block)) status = "Skipped";

    const existing = statusByCase.get(testCaseId);
    if (existing === "Failed") continue;
    if (!existing) {
      statusByCase.set(testCaseId, status);
      continue;
    }

    if (existing === "Skipped" && status === "Passed") {
      statusByCase.set(testCaseId, "Passed");
      continue;
    }

    if (status === "Failed") {
      statusByCase.set(testCaseId, "Failed");
    }
  }

  return statusByCase;
}

function main() {
  const repo = "d:/Prompt2Test";
  const casesPath = path.join(repo, "04_cases", "test_cases.csv");
  const junitPath = path.join(repo, "05_automation", "reports", "junit", "results.xml");
  const defectsPath = path.join(repo, "06_bugs", "confirmed_defects.json");
  const outDir = path.join(repo, "07_rtm");
  const outPath = path.join(outDir, "traceability_matrix.csv");

  const cases = parseCsv(readFileSync(casesPath, "utf8"));
  const junitXml = readFileSync(junitPath, "utf8");
  const statuses = extractStatusesFromJunit(junitXml);

  const defects = JSON.parse(readFileSync(defectsPath, "utf8")) as {
    confirmedDefects: Array<{ testCaseId: string; jiraKey?: string }>;
  };

  const jiraByCase = new Map<string, string>();
  for (const d of defects.confirmedDefects ?? []) {
    if (d.testCaseId && d.jiraKey) jiraByCase.set(d.testCaseId, d.jiraKey);
  }

  const lines = ["RequirementID,ScenarioID,TestCaseID,AutomationStatus,JiraKey"];
  for (const c of cases) {
    const testCaseId = c.TestCaseID;
    const status = statuses.get(testCaseId) ?? "NotExecuted";
    const jira = jiraByCase.get(testCaseId) ?? "";

    lines.push(
      [
        c.RequirementID ?? "",
        c.ScenarioID ?? "",
        testCaseId ?? "",
        status,
        jira,
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Generated RTM: ${outPath}`);
  console.log(`Rows: ${cases.length}`);
}

main();
