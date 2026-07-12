# PostQode Handover — Complete Plan for Remaining Work

> **STATUS: COMPLETED 2026-07-12.** All steps below were executed: suite run
> (38/43 passed, 3 intentional defect-reds, 2 documented skips), exploratory
> hunt done, bugs consolidated, defects filed as KAN-49…KAN-52, RTM/verdict/
> approach/package delivered to `output/`. Retained as the historical
> execution plan; see [README.md](README.md) for the current state.

This is a self-contained brief to finish the Prompt2Test pipeline. Steps 0-8 are
**done and verified** (see [README.md](README.md)). Your job is to **run the
suite** and then complete **Steps 9-12** (exploratory hunt, bug consolidation,
Jira filing, RTM/verdict/package).

---

## 0. Global guardrails (apply to every step)

- **Do NOT rewrite the automation framework** (`05_automation/`), the explorer
  scripts, or the seeder. They were stabilized externally and verified. Only
  permitted framework edit: adding a menu label to `MODULE_ALIASES` if one
  specific module can't be found.
- **Models are `healthplix.*`** (NOT `hospital.*`). RPC endpoint is
  `/web/dataset/call_kw/<model>/<method>`. Reuse the working
  `authenticate`/`callKw` helpers in `scripts/dump-model-schema.ts` and
  `scripts/seed-data.ts` — do not write new RPC plumbing.
- **A failing test = candidate application defect.** Never weaken an assertion,
  add a try/catch to swallow it, or delete a case to go green. Route it to
  `06_bugs/` and Jira.
- **All data is synthetic** (Faker, `SEED-` prefixed). No real PII, ever.
- **Run one browser suite at a time.** The shared server is latency-flaky;
  `retries: 1` handles transient flakes. Never launch two `test:*` runs at once.
- **Selectors stay text/role/field-name based.** The theme redeploys often and
  its CSS classes (`hp-*`) change; do not introduce class-based selectors.
- **Before Step 11: regenerate the Jira API token** in Atlassian (the old one
  leaked in plaintext during setup) and update `JIRA_API_TOKEN` in `.env`.

---

## 1. First: run the suite (produces the inputs for Steps 9-12)

```
1. npm run seed        # idempotent Faker data (patients/doctors/appointments/prescriptions/labs/billing)
2. npm run test:all    # ALL 36 FE cases + API business rules + boundary bug hunter (SUITE_SCOPE defaults to "all")
```

Then read `05_automation/reports/summary/summary.html`,
`05_automation/reports/summary/summary.md`, and
`05_automation/reports/junit/results.xml`.

**Expected & CORRECT outcomes (do NOT weaken tests to make them green):**
- The boundary bug hunter **will fail 3 tests — these are confirmed APP DEFECTS**:
  - `TC-PRESCRIPTIONS-NEG-002`: server accepts **negative drug quantity** (patient-safety P0)
  - `TC-BILLING-NEG-002`: server accepts **negative billing price** (financial)
  - `TC-DOCTORS-NEG-002`: server accepts **negative doctor experience** (data integrity)
- The cross-user isolation test **skips** unless `ODOO_SECONDARY_USER` /
  `ODOO_SECONDARY_PASSWORD` are set in `.env`. Add a second Odoo login there if
  you want that check to execute.
- The billing-total positive test **skips** if no billing record has line items
  — the seed step covers this; if it still skips, confirm `npm run seed` ran.
- **Any FE case failing on a missing column** means the app was redeployed —
  run `npm run map:ui` to refresh `artifacts/app_map.json`, then rerun. That is
  the only permitted data refresh.
- Capture the final pass/fail/skip counts and the per-module table from the
  executive summary — Steps 10 and 12 consume them.

---

## 2. Step 9 — Exploratory Hunter

**Goal:** adversarial exploratory testing focused on patient-safety and
data-integrity breakage, beyond the scripted cases.

**Do:**
1. Write charters (one line each) per high-risk module in
   `06_bugs/exploratory_charters.md`, format:
   `Explore <target> with <technique> to discover <info>`.
2. Execute them against the live app (this step MAY create/modify records —
   use only `SEED-`-prefixed synthetic data; clean up where practical).
3. Cover these specific risks (all are in-scope for the bug challenge):
   negative/zero drug quantity, dosage out of range, missing allergy/interaction
   check, out-of-range lab values accepted, discharged patient still billable,
   two patients one bed, past-dated / double-booked appointments,
   negative/duplicate invoice line, revenue counter mismatch, cross-patient
   record access by ID.
4. For each **confirmed** defect, apply the `.postqode/rules/bug-report.md` rule.

**Reuse, don't reinvent:** the 3 boundary defects the API hunter already proved
are confirmed findings — pull them straight in. For new probes, drive JSON-RPC
with the `seed-data.ts` client pattern rather than clicking through the UI where
a server call is faster and less flaky.

**Output:** `06_bugs/exploratory_charters.md`, and append confirmed defects to
`06_bugs/bug_report.html` (created in Step 10), **leading with the top
patient-safety finding** (negative drug quantity).

---

## 3. Step 10 — Execute + Consolidate Bugs

**Goal:** one authoritative bug report merging automation failures with
exploratory finds.

**Do:**
1. Take the failures from the `test:all` run (JUnit + executive summary) and the
   exploratory finds from Step 9.
2. Build `06_bugs/bug_report.html` per `.postqode/rules/bug-report.md`:
   - severity split (Critical/High/Medium/Low),
   - defect density per module,
   - clean, numbered reproduction steps for each (the API defects have exact
     model + field + value; include the `call_kw` payload),
   - an **Enhancements** section (non-defect observations, e.g. missing
     server-side constraints as a class).
3. Order the report patient-safety first.

**Guardrail:** if a UI test failed on a selector/column, first check whether the
app redeployed (compare against `artifacts/module_map.md`) before classifying it
as a defect. Framework flakes are not app bugs.

**Output:** `06_bugs/bug_report.html`.

---

## 4. Step 11 — File to Jira

**Goal:** a real Jira issue per confirmed defect on the KAN board.

**Prerequisite:** regenerate `JIRA_API_TOKEN` (leaked) and update `.env`.

**Do:**
1. Using `.postqode/rules/jira-filing.md` and the existing Jira-sync script
   pattern (`scripts/create-jira-stories.ts`, `scripts/sync-step5-cases-to-jira.ts`),
   create one issue in `JIRA_PROJECT_KEY` per confirmed defect via REST v3
   (auth from `.env`).
2. Map severity → priority; put steps / expected / actual / patient-safety
   impact in the description.
3. Write the returned issue keys back into `06_bugs/bug_report.html` and into the
   RTM (Step 12).
4. Print the created issue keys.

**Reuse:** the env parsing, auth header, and REST helpers already exist in the
`scripts/*jira*.ts` files — extend that pattern; do not hand-roll a new client.

**Output:** created Jira keys, echoed back into the bug report and RTM.

---

## 5. Step 12 — RTM, Verdict, Approach, Package

**Goal:** traceability + decision artifacts + a submission package.

**Do:**
1. `07_rtm/traceability_matrix.csv` linking
   `RequirementID → ScenarioID → TestCaseID → automation status → Jira key`.
   Sources: `03_scenarios/scenarios.md`, `04_cases/test_cases.csv`, the JUnit
   results (for automation status), and the Step 11 Jira keys.
2. `08_verdict/release_readiness.md` — go/no-go decision with risks, **leading
   with the patient-safety findings**. Given the confirmed negative-quantity /
   negative-price defects, the honest verdict is **No-Go / conditional** with the
   blocking defects listed.
3. `09_approach/approach.md` — the risk-based agentic pipeline narrative:
   PostQode + Playwright + JSON-RPC + Jira, explorer-first ground truth, POM +
   API bug hunter, closed-loop traceability into a real tracker.
4. A submission `README` (or reuse the root [README.md](README.md)) summarizing
   the deliverables.
5. Name packaged files `prompt2test_<artifact>_HMS.<ext>`.

**Output:** `07_rtm/`, `08_verdict/`, `09_approach/`, submission package.

---

## 6. Definition of done

- `test:all` executed; results captured; the 3 known defects confirmed (not
  suppressed).
- `06_bugs/exploratory_charters.md` + `06_bugs/bug_report.html` complete,
  patient-safety first, with an Enhancements section.
- One Jira issue per confirmed defect; keys echoed into the bug report and RTM.
- `07_rtm/traceability_matrix.csv`, `08_verdict/release_readiness.md`,
  `09_approach/approach.md`, and the submission package exist.
- No test was weakened, deleted, or wrapped to force a green result.

---

## 7. Efficiency notes

- Run the reasoning-heavy steps (bug report prose, verdict, approach) in **Plan
  mode** to conserve trial credit.
- The explorer artifacts, `model_schema.json`, and the executive summary are your
  ground truth — read them instead of re-deriving facts from the live app.
- If anything suddenly fails on selectors after a gap, suspect a theme redeploy
  and re-run `npm run map:ui` before debugging.
