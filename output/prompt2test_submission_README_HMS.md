# Prompt2Test Submission Package — HealthPlix HMS (Odoo 17)

## Lane
**Web UI lane.** The primary deliverable is a Playwright Web UI automation
framework (POM, 9 module page objects, 36 data-driven UI cases). JSON-RPC
API-level checks are included as *supporting depth*: they prove that the
defects found are server-side (not just UI-layer) and power the synthetic-data
seeding — they are evidence for the UI lane, not a second lane.

## Status
Full 12-step pipeline complete: explore → strategy → stories → scenarios →
negative-first cases → Faker data → UI framework → API business rules →
exploratory hunt → consolidated bug report → Jira filing → RTM/verdict/package.

## Final test execution snapshot
- Source: `05_automation/reports/summary/summary.md`
- Result: **38/43 passed, 3 failed, 2 skipped** (~2 min, 3 parallel workers)
- The 3 failures are intentionally retained: each is a confirmed application
  defect (assertions were never weakened to force green).
- The 2 skips are documented preconditions (secondary user credentials;
  billing-line data dependency).

## Confirmed defects filed to Jira (patient-safety first)
| Bug | Jira | Severity | Finding |
|---|---|---|---|
| BUG-ONCO-001 | KAN-49 | Critical | Server accepts **negative drug quantity** in prescription lines |
| BUG-ONCO-004 | KAN-52 | High | Server accepts **clinically implausible dosage text** without guardrails |
| BUG-ONCO-002 | KAN-50 | High | Server accepts **negative billing unit price** |
| BUG-ONCO-003 | KAN-51 | Medium | Server accepts **negative doctor experience** |

Root-cause analysis (systemic: missing `@api.constrains` at model level, UI-only
validation bypassable via API) is included in the bug report, with a recommended
fix pattern and automatic regression coverage once fixed.

## Evaluation-criteria mapping
| Criterion | Where to look |
|---|---|
| Test strategy & coverage | `01_strategy/Test_Strategy.md` (risk register, 5 test levels, entry/exit) |
| User stories, scenarios & cases | `02_stories/`, `03_scenarios/` (10 scenarios incl. cross-module E2E), `04_cases/test_cases.csv` (36 cases, negative-first) |
| Automation quality | `05_automation/` — POM with schema-driven locators, self-healing auth, CI workflow, executive reporter (see its README for the stability engineering) |
| Test coverage | Functional + boundary + negative + edge: 3:1 negative ratio, API boundary bug hunter, exploratory charters |
| Defect analysis | `prompt2test_bug_report_HMS.html` — severity split, defect density, call_kw repro payloads, **root-cause analysis**, enhancements |
| Working AI prompting | `prompt2test_prompt_library_HMS.md` — the full prompt sequence + prompting techniques used |
| **Bonus: real defects** | **4 genuine defects filed to Jira: KAN-49…KAN-52**, mapped in the RTM |

## Delivered artifacts (repo paths)
- Exploratory charters: `06_bugs/exploratory_charters.md`
- Consolidated bug report: `06_bugs/bug_report.html`
- Defect evidence map: `06_bugs/confirmed_defects.json`
- RTM (36/36 cases → Jira keys): `07_rtm/traceability_matrix.csv`
- Release verdict (**No-Go**, evidence-based): `08_verdict/release_readiness.md`
- Approach narrative: `09_approach/approach.md`
- Solution documentation: root `README.md`, `05_automation/README.md`

## Packaged files in this folder
- `prompt2test_execution_summary_HMS.html` / `.md`
- `prompt2test_junit_results_HMS.xml`
- `prompt2test_playwright_report_index_HMS.html`
- `prompt2test_bug_report_HMS.html`
- `prompt2test_confirmed_defects_HMS.json`
- `prompt2test_exploratory_charters_HMS.md` / `prompt2test_exploratory_results_HMS.json`
- `prompt2test_jira_defects_mapping_HMS.json`
- `prompt2test_traceability_matrix_HMS.csv`
- `prompt2test_release_readiness_HMS.md`
- `prompt2test_approach_HMS.md`
- `prompt2test_prompt_library_HMS.md`
- `prompt2test_submission_README_HMS.md`

## How to reproduce
```bash
npm ci && npx playwright install --with-deps chromium
npm run test:full     # seed synthetic Faker data + run all UI + API cases
npm run test:report   # open the Playwright HTML report
```
Credentials via `.env` (see `.env.example`). All test data is synthetic; no PII.

## Notes
- A live web-agent cross-check separated harness/data issues from true app
  defects before anything was filed; framework assertions were never weakened.
- The environment is redeployed frequently by the app team; the framework's
  selectors are text/role/schema-based specifically to survive that.
