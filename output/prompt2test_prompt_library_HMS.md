# Prompt Library — How PostQode AI Was Driven (Prompt2Test / HealthPlix HMS)

This document evidences the **Working AI Prompting** criterion: the actual prompt
sequence used to drive PostQode AI through the 12-step pipeline, and the prompt-
engineering techniques that made the output reliable on a live, frequently-
redeployed target.

## Prompting principles used

1. **Explore first, generate second.** No test asset was generated from
   imagination — Step 1 prompts forced the AI to capture ground truth
   (`module_map.md`, `model_schema.json`) and every later prompt says
   *"using ONLY these artifacts, do not invent fields."*
2. **Constraint-laden prompts.** Each prompt carries hard guardrails learned
   from earlier runs (model prefix `healthplix.*`, RPC endpoint shape,
   text/role-based selectors only, "never weaken a failing assertion").
3. **Scoped permission to edit.** When a run failed, the re-prompt allowed
   exactly one class of fix (e.g. *"the ONLY allowed edit is adding a label to
   MODULE_ALIASES"*) — preventing the AI from rewriting working code.
4. **Failing tests are findings.** Prompts explicitly told the AI that red
   negative tests are the deliverable (application defects), not something to
   make green — which is how the four Jira-filed bugs survived automation.
5. **Self-diagnosing outputs.** Prompts required failure evidence (screenshots,
   "visible clickables" dumps) so each iteration was driven by facts, not guesses.

---

## The prompt sequence (as issued to PostQode)

### Step 0 — Setup
> Create .env.example with the ODOO_ and JIRA_ variables listed, blank values,
> read only from process.env, add .env to .gitignore, and create the six project
> rules I describe (user-story, negative-first test-case, scenario, bug-report,
> Playwright automation, Jira-filing). Never hard-code secrets. This is a
> cancer-center Hospital Management System on Odoo; functional testing only.

### Step 1 — Explorer (FE + backend)
> Write a Playwright TS script that logs into ODOO_URL, clicks each module nav
> (href="#", so click, don't deep-link): Patients, Doctors, Prescriptions, Lab
> Reports, IPD Details, Appointments, Billing, Ward Management, Bed Management.
> Capture each action-XXX URL, list columns (thead th), and form fields
> (.o_field_widget[name]) with required flags → artifacts/module_map.md +
> app_map.json. Then a second script hitting Odoo JSON-RPC
> (/web/session/authenticate, then /web/dataset/call_kw fields_get) to dump each
> model's schema → artifacts/model_schema.json. Read-only. Run both, show outputs.

*Iteration note:* the first runs failed against the live app (themed login,
dropdown navs, model prefix `healthplix.*` not `hospital.*`). The winning
re-prompt flipped the order — **explore the app yourself first, then align the
script with what you saw** — and locked edits to `MODULE_ALIASES` only.

### Step 2 — Strategist
> Using module_map.md and model_schema.json as the ONLY ground truth, write a
> Test Strategy for this oncology HMS: scope, risk register (Prescriptions/Lab/
> Patients/Billing/IPD highest), test levels, entry/exit criteria, synthetic-data
> strategy (no real PII), automation approach (Playwright UI + JSON-RPC backend),
> 48h schedule. Markdown, no AI-tell. Save 01_strategy/Test_Strategy.md.

### Step 3 — Stories
> Generate user stories per module using the user-story rule, grounded in the
> real fields from model_schema.json (healthplix.* models), prioritising
> patient-safety (dosage, allergy/interaction, lab-result validation,
> cross-patient access). Save 02_stories/user_stories.md.

### Step 4 — Scenarios
> Convert stories into scenarios using the scenario rule: core, alternate, and a
> cross-module E2E (register→appointment→prescription→lab→treatment→discharge→
> billing) following the real model relations. Save 03_scenarios/scenarios.md.

### Step 5 — Cases (run once per module, swap [MODULE])
> Generate test cases for [MODULE] from its scenarios using the negative-first
> test-case rule (CSV). Enforce the negative-first ratio and all mandatory
> categories. Use only fields that exist in model_schema.json for [MODULE]'s
> healthplix.* model. Append to 04_cases/test_cases.csv.

### Step 6 — Test data
> Write a JSON-RPC + Faker script to create synthetic data (5 patients, 3
> doctors, 10 appointments, 5 prescriptions, 5 lab orders, 3 invoices) using
> model_schema.json for required fields, creds from env, reusing the
> authenticate/callKw helpers from scripts/dump-model-schema.ts. Idempotent
> (SEED- prefix). Run it, confirm dashboard counters update.

### Step 7 — Playwright FE framework
> Build the Playwright framework per the automation rule under 05_automation/:
> OdooBasePage (SPA-safe waits, list/form helpers), per-module page objects,
> storageState auth fixture that logs in via JSON-RPC session cookie injection
> (the themed login form is unreliable), data-driven specs running cases from
> 04_cases/test_cases.csv, HTML+JUnit reporters, env config. CRITICAL: all
> selectors text/role-based (getByRole/getByText), never theme CSS classes —
> the theme is redeployed frequently. Show the structure.

### Step 8 — Backend/API tests
> Add 05_automation/api/ using Playwright request context against Odoo JSON-RPC
> (/web/session/authenticate then /web/dataset/call_kw/<model>/<method>). Assert
> business rules server-side on healthplix.* models: rejects negative
> prescription qty, invoice totals match billing lines, no cross-user record
> access. Data-driven from 04_cases/test_cases.csv where E2E=No.

### Execution prompt (Steps 6-8 verification)
> Framework updated externally — do NOT rewrite it. Run:
> 1. npm run seed  2. npm run test:all
> Expected & CORRECT outcomes (do NOT weaken tests to make them green):
> the boundary bug hunter WILL fail 3 tests — these are confirmed APP DEFECTS
> (negative drug quantity = patient-safety P0; negative billing price; negative
> doctor experience). Route them into 06_bugs and Jira. Any FE case failing on a
> missing column means the app redeployed — re-run npm run map:ui, then rerun.
> Run ONE instance at a time.

### Step 9 — Hunter (exploratory)
> Act as adversarial exploratory tester. Produce charters per high-risk module
> ("Explore <target> with <technique> to discover <info>"), then execute them.
> Focus on patient-safety/data-integrity breakage: negative/zero drug qty,
> dosage out of range, missing allergy check, out-of-range lab values accepted,
> discharged patient still billable, two patients one bed, past/double-booked
> appointments, negative/duplicate invoice, revenue counter mismatch,
> cross-patient access by ID. For each confirmed defect apply the bug-report
> rule. Save 06_bugs/exploratory_charters.md and append to
> 06_bugs/bug_report.html, leading with the top patient-safety finding.

### Step 10 — Execute + consolidate bugs
> Run the full UI + API suite. Merge automation failures with exploratory finds
> into 06_bugs/bug_report.html using the bug-report rule: severity split, defect
> density per module, clean repro (include the call_kw payload for API defects),
> Enhancements section. If a UI failure looks like a selector/column break,
> verify against artifacts/module_map.md whether the app redeployed before
> calling it a defect.

### Step 11 — File to Jira
> Using the Jira-filing rule, create an issue in JIRA_PROJECT_KEY for each
> confirmed defect via REST v3 (auth from env), mapping severity to priority and
> putting steps/expected/actual/impact in the description. Reuse the existing
> jira scripts' env/auth/REST helpers. Write the returned issue keys back into
> bug_report.html and the RTM. Show me the created keys.

### Step 12 — RTM, verdict, approach, package
> Build 07_rtm/traceability_matrix.csv linking RequirementID→ScenarioID→
> TestCaseID→automation status→Jira key. Then 08_verdict/release_readiness.md
> (go/no-go + risks, patient-safety first), 09_approach/approach.md, and a
> submission README. Name files prompt2test_<artifact>_HMS.<ext>.

---

## Outcome evidence

- 36 test cases executed (100% pass on valid behavior) + API boundary hunter.
- **4 genuine defects discovered and filed to Jira: KAN-49, KAN-50, KAN-51,
  KAN-52** — led by a patient-safety Critical (negative drug quantity accepted).
- Full traceability: Requirement → Scenario → Case → Automation status → Jira key.
- Release verdict: **No-Go**, defensible from the evidence chain above.
