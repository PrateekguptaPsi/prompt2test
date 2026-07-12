# Prompt for Claude — Full Handover + Required Details (HealthPlix HMS)

Use this exact context to continue without re-discovery.

---

You are taking over a partially completed **Prompt2Test agentic QA pipeline** for **HealthPlix Oncology HMS** on **Odoo 17**.

## System Under Test
- URL: `https://team43.qaaerp.com`
- Context: Shivansh Cancer Center
- Scope: **Functional testing only**
- Data policy: **Synthetic data only** (SEED/Faker-style), no PII

---

## Critical Guardrails (must follow)
1. Do **not** rewrite the framework in `05_automation/`.
2. Only allowed framework-level tweak remains: adding menu label alias if module navigation breaks.
3. Models are `healthplix.*` (not `hospital.*`).
4. RPC pattern: `/web/dataset/call_kw/<model>/<method>`.
5. Reuse existing auth/RPC patterns from:
   - `scripts/seed-data.ts`
   - `scripts/dump-model-schema.ts`
6. A failing negative assertion indicates candidate/confirmed app defect; do not suppress or weaken to make green.
7. Run one suite at a time (shared env instability).
8. Selectors stay text/role/field-name based (no theme-class coupling).
9. Jira auth must come only from `.env` variables.

---

## What has already been completed in this handover

### Execution + stabilization
- Seed and full suite executed.
- Live browser cross-check was done for flaky/failed FE cases.
- FE failures in Prescriptions/Billing required-field rows were confirmed as harness/data-binding mismatch (app behavior was correct), then healed by **test case row data updates only** in:
  - `04_cases/test_cases.csv`
- No framework rewrite, no assertion weakening.

### Latest run outcome
- Source: `05_automation/reports/summary/summary.md`
- Result: **38/43 passed, 3 failed, 2 skipped**
- Remaining fails are confirmed app defects (expected):
  - Negative prescription quantity accepted
  - Negative billing price accepted
  - Negative doctor experience accepted

---

## Step 9 outputs (exploratory)
- `06_bugs/exploratory_charters.md`
- `artifacts/step9_exploratory_results.json`

Exploratory status:
- Confirmed:
  - `BUG-ONCO-001` (Critical)
  - `BUG-ONCO-002` (High)
  - `BUG-ONCO-003` (Medium)
  - `BUG-ONCO-004` (High)
- Guarded:
  - `BUG-ONCO-005` (past-dated appointment not persisted in this run)
- Blocked:
  - `BUG-ONCO-006` (cross-user check blocked by missing secondary creds)

---

## Step 10 outputs (consolidation)
- `06_bugs/bug_report.html`
- `06_bugs/confirmed_defects.json`

Includes:
- Patient-safety-first ordering
- Required bug fields
- Severity split
- Defect density per module
- API payload repro evidence
- Enhancements section

---

## Step 11 outputs (Jira filing)
Script used:
- `scripts/file-step11-defects-to-jira.ts`

Created Jira issues:
- `BUG-ONCO-001` → `KAN-49`
- `BUG-ONCO-002` → `KAN-50`
- `BUG-ONCO-003` → `KAN-51`
- `BUG-ONCO-004` → `KAN-52`

Mapping artifact:
- `artifacts/jira_step11_defects.json`

Backfilled into:
- `06_bugs/confirmed_defects.json`
- `06_bugs/bug_report.html`

---

## Step 12 outputs
- RTM: `07_rtm/traceability_matrix.csv` (36 rows)
- Verdict: `08_verdict/release_readiness.md` (**No-Go**)
- Approach: `09_approach/approach.md`
- Submission README: `prompt2test_submission_README_HMS.md`

Support scripts added:
- `scripts/exploratory-hunt-step9.ts`
- `scripts/file-step11-defects-to-jira.ts`
- `scripts/generate-step12-rtm.ts`

---

## Stakeholder showcase folder (already consolidated)
All key outputs are in:
- `output/`

Files present:
- `prompt2test_execution_summary_HMS.html`
- `prompt2test_execution_summary_HMS.md`
- `prompt2test_junit_results_HMS.xml`
- `prompt2test_playwright_report_index_HMS.html`
- `prompt2test_bug_report_HMS.html`
- `prompt2test_confirmed_defects_HMS.json`
- `prompt2test_exploratory_charters_HMS.md`
- `prompt2test_exploratory_results_HMS.json`
- `prompt2test_jira_defects_mapping_HMS.json`
- `prompt2test_traceability_matrix_HMS.csv`
- `prompt2test_release_readiness_HMS.md`
- `prompt2test_approach_HMS.md`
- `prompt2test_submission_README_HMS.md`

---

## What you should do next (if continuing)
1. Keep defects KAN-49..KAN-52 as active blockers until fixed and retested.
2. If cross-user isolation must execute, add in `.env`:
   - `ODOO_SECONDARY_USER`
   - `ODOO_SECONDARY_PASSWORD`
3. After any app fix deployment:
   - rerun seed + `npm run test:all`
   - refresh summary + junit + RTM
   - update verdict and bug statuses
4. Preserve patient-safety-first reporting order and traceability chain.

---

## Command quick reference
```powershell
npm run seed
npm run test:all
npm run map:ui
npx tsx scripts/exploratory-hunt-step9.ts
npx tsx scripts/file-step11-defects-to-jira.ts
npx tsx scripts/generate-step12-rtm.ts
```

---

Use this as the authoritative handover context. Do not re-derive already confirmed facts unless validating a new deployment state.
