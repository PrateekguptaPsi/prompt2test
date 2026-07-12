import { readFileSync } from "node:fs";
import path from "node:path";

export type CasePriority = "P0" | "P1" | "P2" | "P3";

export type TestCaseRow = {
  TestCaseID: string;
  Module: string;
  ScenarioID: string;
  RequirementID: string;
  Title: string;
  Type: "Negative" | "Positive";
  Category: string;
  Priority: CasePriority;
  Preconditions: string;
  TestData: string;
  Steps: string;
  ExpectedResult: string;
  E2E: "Yes" | "No";
};

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
  return out.map((v) => v.trim());
}

export function loadAllCases(csvPath = path.join(__dirname, "..", "..", "04_cases", "test_cases.csv")): TestCaseRow[] {
  const raw = readFileSync(csvPath, "utf8").trim();
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: TestCaseRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length !== headers.length) continue;

    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = cols[c];
    }

    rows.push(record as unknown as TestCaseRow);
  }

  return rows;
}

/**
 * Step 7 instruction says "Priority=High cases from test_cases.csv".
 * Current project cases use P0/P1/P2/P3 scale. We map "High" to P0/P1.
 */
export function loadHighPriorityCases(csvPath?: string): TestCaseRow[] {
  return loadAllCases(csvPath).filter((r) => r.Priority === "P0" || r.Priority === "P1");
}
