import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type CaseRecord = {
  title: string;
  status: string;
  durationMs: number;
  retries: number;
  project: string;
  module: string;
  priority: string;
  type: string;
  testCaseId: string;
  requirementId: string;
  error?: string;
};

const SUMMARY_DIR = path.join(__dirname, "..", "reports", "summary");

function annotation(test: TestCase, type: string): string {
  return test.annotations.find((a) => a.type === type)?.description ?? "";
}

// Test titles are formatted "<tags> <TestCaseID> | <Module> | <Title>".
// Parsing the title is more reliable than runtime annotations, which are not
// consistently visible to the reporter at onTestEnd.
function parseTitle(title: string): { module: string; testCaseId: string } {
  const parts = title.split("|").map((p) => p.trim());
  if (parts.length >= 2) {
    const idMatch = parts[0].match(/(TC-[A-Z0-9-]+)/);
    return { module: parts[1], testCaseId: idMatch?.[1] ?? "" };
  }
  return { module: "", testCaseId: "" };
}

function pct(part: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Executive summary reporter: writes a standalone HTML dashboard and a
 * markdown digest (used as the GitHub Actions job summary) with per-module
 * and per-priority breakdowns plus a defect-candidate list.
 */
export default class PsiSummaryReporter implements Reporter {
  private records: CaseRecord[] = [];
  private startTime = new Date();

  onBegin(_config: FullConfig): void {
    this.startTime = new Date();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name ?? "";
    if (project === "setup") return;

    const fromTitle = parseTitle(test.title);
    const fullTitle = test.titlePath().join(" ");
    const isApi = fullTitle.includes("@api");
    const isContract = fullTitle.includes("Coverage contract");

    // Precedence: explicit annotation → API/Coverage classification → module
    // parsed from an FE title → fallback. (API titles also contain " | ", so
    // the isApi check must win over title parsing.)
    const module =
      annotation(test, "Module") ||
      (isApi ? "API" : isContract ? "Coverage" : fromTitle.module || "Framework");

    this.records.push({
      title: test.title,
      status: result.status,
      durationMs: result.duration,
      retries: result.retry,
      project,
      module,
      priority: annotation(test, "Priority"),
      type: annotation(test, "Type") || (isApi ? "API" : ""),
      testCaseId: annotation(test, "TestCaseID") || fromTitle.testCaseId,
      requirementId: annotation(test, "RequirementID"),
      error: result.error?.message?.split("\n")[0]?.slice(0, 300),
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    // Retries produce multiple onTestEnd calls per test — keep the final one.
    const finalByTitle = new Map<string, CaseRecord>();
    for (const r of this.records) finalByTitle.set(r.title, r);
    const rows = Array.from(finalByTitle.values());

    const total = rows.length;
    const passed = rows.filter((r) => r.status === "passed").length;
    const failed = rows.filter((r) => r.status === "failed" || r.status === "timedOut").length;
    const skipped = rows.filter((r) => r.status === "skipped").length;
    const durationMin = ((Date.now() - this.startTime.getTime()) / 60_000).toFixed(1);

    const byModule = new Map<string, { passed: number; failed: number; skipped: number }>();
    for (const r of rows) {
      const m = byModule.get(r.module) ?? { passed: 0, failed: 0, skipped: 0 };
      if (r.status === "passed") m.passed++;
      else if (r.status === "skipped") m.skipped++;
      else m.failed++;
      byModule.set(r.module, m);
    }

    const failures = rows.filter((r) => r.status === "failed" || r.status === "timedOut");

    mkdirSync(SUMMARY_DIR, { recursive: true });
    writeFileSync(path.join(SUMMARY_DIR, "summary.md"), this.buildMarkdown(result, rows, byModule, failures, durationMin), "utf8");
    writeFileSync(path.join(SUMMARY_DIR, "summary.html"), this.buildHtml(result, rows, byModule, failures, durationMin), "utf8");

    console.log(`\nExecutive summary: 05_automation/reports/summary/summary.html`);
    console.log(`Run: ${passed}/${total} passed (${pct(passed, total)}), ${failed} failed, ${skipped} skipped in ${durationMin} min`);
  }

  private buildMarkdown(
    result: FullResult,
    rows: CaseRecord[],
    byModule: Map<string, { passed: number; failed: number; skipped: number }>,
    failures: CaseRecord[],
    durationMin: string
  ): string {
    const total = rows.length;
    const passed = rows.filter((r) => r.status === "passed").length;
    const lines: string[] = [];

    lines.push(`# Prompt2Test QA Execution Summary`);
    lines.push("");
    lines.push(`**Verdict:** ${result.status === "passed" ? "PASSED" : "FAILED"} | **Pass rate:** ${pct(passed, total)} (${passed}/${total}) | **Duration:** ${durationMin} min | **Generated:** ${new Date().toISOString()}`);
    lines.push("");
    lines.push(`| Module | Passed | Failed | Skipped |`);
    lines.push(`|---|---:|---:|---:|`);
    for (const [mod, s] of Array.from(byModule.entries()).sort()) {
      lines.push(`| ${mod} | ${s.passed} | ${s.failed} | ${s.skipped} |`);
    }

    if (failures.length) {
      lines.push("");
      lines.push(`## Failures / defect candidates (${failures.length})`);
      for (const f of failures) {
        const id = f.testCaseId ? `${f.testCaseId} - ` : "";
        lines.push(`- **${id}${f.module}**: ${f.error ?? "see HTML report"}`);
      }
      lines.push("");
      lines.push(`> Assertion failures against a working framework are candidate APP defects — triage into 06_bugs and Jira, do not weaken assertions.`);
    }

    return lines.join("\n") + "\n";
  }

  private buildHtml(
    result: FullResult,
    rows: CaseRecord[],
    byModule: Map<string, { passed: number; failed: number; skipped: number }>,
    failures: CaseRecord[],
    durationMin: string
  ): string {
    const total = rows.length;
    const passed = rows.filter((r) => r.status === "passed").length;
    const failed = failures.length;
    const skipped = rows.filter((r) => r.status === "skipped").length;

    const moduleRows = Array.from(byModule.entries())
      .sort()
      .map(([mod, s]) => {
        const t = s.passed + s.failed + s.skipped;
        return `<tr><td>${esc(mod)}</td><td class="num ok">${s.passed}</td><td class="num bad">${s.failed}</td><td class="num muted">${s.skipped}</td><td class="num">${pct(s.passed, t)}</td></tr>`;
      })
      .join("");

    const failureRows = failures
      .map(
        (f) =>
          `<tr><td>${esc(f.testCaseId || "-")}</td><td>${esc(f.module)}</td><td>${esc(f.priority || "-")}</td><td class="err">${esc(f.error ?? "")}</td></tr>`
      )
      .join("");

    const caseRows = rows
      .map((r) => {
        const cls = r.status === "passed" ? "ok" : r.status === "skipped" ? "muted" : "bad";
        return `<tr><td>${esc(r.testCaseId || "-")}</td><td>${esc(r.module)}</td><td>${esc(r.priority || "-")}</td><td>${esc(r.type || "-")}</td><td class="${cls}">${esc(r.status)}</td><td class="num">${(r.durationMs / 1000).toFixed(1)}s</td></tr>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Prompt2Test QA Execution Report</title>
<style>
  :root { --purple:#5b2d8f; --ok:#1a7f37; --bad:#c62828; --muted:#777; }
  * { box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; margin:0; background:#f5f3f8; color:#222; }
  header { background:linear-gradient(120deg,var(--purple),#8e4ec6); color:#fff; padding:28px 40px; }
  header h1 { margin:0 0 4px; font-size:24px; }
  header p { margin:0; opacity:.85; font-size:13px; }
  main { padding:28px 40px; max-width:1100px; margin:auto; }
  .kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:28px; }
  .kpi { background:#fff; border-radius:10px; padding:16px; box-shadow:0 1px 4px rgba(0,0,0,.08); text-align:center; }
  .kpi .v { font-size:28px; font-weight:700; }
  .kpi .l { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; }
  h2 { font-size:16px; margin:26px 0 10px; color:var(--purple); }
  table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  th,td { padding:9px 12px; font-size:13px; text-align:left; border-bottom:1px solid #eee; }
  th { background:#efeaf6; color:#3d2266; }
  .num { text-align:right; }
  .ok { color:var(--ok); font-weight:600; }
  .bad { color:var(--bad); font-weight:600; }
  .muted { color:var(--muted); }
  .err { font-family:Consolas,monospace; font-size:12px; color:var(--bad); }
  .note { background:#fff8e1; border-left:4px solid #f0b429; padding:10px 14px; font-size:13px; margin-top:12px; border-radius:4px; }
  footer { text-align:center; font-size:12px; color:var(--muted); padding:20px; }
</style>
</head>
<body>
<header>
  <h1>Prompt2Test &mdash; QA Execution Report</h1>
  <p>Oncology HMS (Odoo) &middot; UI + API automation &middot; ${new Date().toISOString()} &middot; verdict: <strong>${result.status.toUpperCase()}</strong></p>
</header>
<main>
  <div class="kpis">
    <div class="kpi"><div class="v">${total}</div><div class="l">Total</div></div>
    <div class="kpi"><div class="v ok">${passed}</div><div class="l">Passed</div></div>
    <div class="kpi"><div class="v bad">${failed}</div><div class="l">Failed</div></div>
    <div class="kpi"><div class="v muted">${skipped}</div><div class="l">Skipped</div></div>
    <div class="kpi"><div class="v">${pct(passed, total)}</div><div class="l">Pass rate</div></div>
  </div>

  <h2>Results by module</h2>
  <table><thead><tr><th>Module</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Skipped</th><th class="num">Pass rate</th></tr></thead>
  <tbody>${moduleRows}</tbody></table>

  ${
    failures.length
      ? `<h2>Failures / defect candidates (${failed})</h2>
  <table><thead><tr><th>Case ID</th><th>Module</th><th>Priority</th><th>Error</th></tr></thead><tbody>${failureRows}</tbody></table>
  <div class="note"><strong>Triage rule:</strong> assertion failures against a verified framework are candidate <em>application</em> defects &mdash; route them to the bug report and Jira instead of weakening the tests.</div>`
      : ""
  }

  <h2>All executed cases</h2>
  <table><thead><tr><th>Case ID</th><th>Module</th><th>Priority</th><th>Type</th><th>Status</th><th class="num">Duration</th></tr></thead>
  <tbody>${caseRows}</tbody></table>
</main>
<footer>Generated by Prompt2Test PSI summary reporter &middot; run duration ${durationMin} min</footer>
</body>
</html>
`;
  }
}
