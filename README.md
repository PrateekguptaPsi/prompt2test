# Prompt2Test — Agentic QA for an Oncology HMS (Odoo)

An AI-driven, risk-based QA pipeline that explores a live Hospital Management
System, generates a full test-design suite, automates it (UI + API), hunts for
patient-safety defects, and files them to Jira — end to end.

**System under test:** HealthPlix oncology HMS on Odoo 17 (`team43.qaaerp.com`,
"Shivansh Cancer Center"). Functional testing only; all data is synthetic.

---

## 1. Pipeline overview

The solution follows a 12-step, artifact-driven pipeline. Each step consumes the
previous step's artifacts as ground truth, so nothing is hallucinated.

| Step | Stage | Output | Status |
|---|---|---|---|
| 0 | Setup (env, rules) | `.env.example`, `.postqode/rules/` | ✅ |
| 1 | Explorer (FE + backend) | `artifacts/module_map.md`, `app_map.json`, `model_schema.json` | ✅ |
| 2 | Test strategy | `01_strategy/Test_Strategy.md` | ✅ |
| 3 | User stories | `02_stories/user_stories.md` | ✅ |
| 4 | Scenarios | `03_scenarios/scenarios.md` | ✅ |
| 5 | Test cases (negative-first) | `04_cases/test_cases.csv` | ✅ |
| 6 | Synthetic data (Faker) | `scripts/seed-data.ts`, `artifacts/seed_data_summary.json` | ✅ |
| 7 | Playwright FE framework | `05_automation/` (POM) | ✅ |
| 8 | Backend/API tests | `05_automation/tests/api-business-rules.spec.ts` | ✅ |
| 9 | Exploratory hunter | `06_bugs/exploratory_charters.md`, `artifacts/step9_exploratory_results.json` | ✅ |
| 10 | Execute + consolidate bugs | `06_bugs/bug_report.html`, `06_bugs/confirmed_defects.json` | ✅ |
| 11 | File to Jira | KAN-49 … KAN-52 (`artifacts/jira_step11_defects.json`) | ✅ |
| 12 | RTM / verdict / approach / package | `07_rtm/`, `08_verdict/`, `09_approach/`, `output/` | ✅ |

**Pipeline complete.** The stakeholder showcase (all deliverables, submission-named
`prompt2test_<artifact>_HMS.<ext>`) is consolidated in [`output/`](output/).
[HANDOVER.md](HANDOVER.md) is retained as the historical execution plan.

---

## 2. Repository layout

```
Prompt2Test/
├── .env / .env.example        # ODOO_* and JIRA_* credentials (never commit .env)
├── .postqode/rules/           # 6 project rules (user-story, negative-first case,
│                              #   scenario, bug-report, Playwright automation, Jira-filing)
├── .github/workflows/         # qa-tests.yml — CI: seed + full suite + reports
├── artifacts/                 # explorer ground truth (source of truth for all steps)
│   ├── model_schema.json      #   30 healthplix.* models, every field/type/required/relation
│   ├── app_map.json / module_map.md   # 9 modules: nav path, columns, form fields
│   └── seed_data_summary.json # what the Faker seeder created
├── 01_strategy/ … 04_cases/   # test-design artifacts (Steps 2-5)
├── 05_automation/             # Playwright framework (Steps 7-8) — see its own README
├── scripts/                   # explorer, seeder, and Jira-sync utilities
│   ├── map-ui.ts              #   Step 1 FE explorer (Playwright)
│   ├── dump-model-schema.ts   #   Step 1 backend explorer (JSON-RPC fields_get)
│   ├── seed-data.ts           #   Step 6 Faker seeder (JSON-RPC create)
│   └── *jira*.ts              #   artifact → Jira sync helpers (Steps 3-7 already synced)
└── HANDOVER.md                # plan for the remaining steps
```

---

## 3. How it works

### Explorer (Step 1) — the ground truth
Two scripts capture the app's real contract so every downstream step is grounded:
- **`map-ui.ts`** logs in, walks all 9 module screens, and records nav path,
  list columns, and form fields (with required flags) → `app_map.json`,
  `module_map.md`.
- **`dump-model-schema.ts`** hits Odoo JSON-RPC `fields_get` for all 30
  `healthplix.*` models → `model_schema.json` (the object API surface).

### Test design (Steps 2-5)
Strategy → user stories → scenarios → negative-first test cases, each driven by
the explorer artifacts and the rules in `.postqode/rules/`. 36 cases at a 3:1
negative-to-positive ratio, patient-safety-first.

### Synthetic data (Step 6)
`seed-data.ts` uses **@faker-js/faker** (deterministic seed) over JSON-RPC
`create` to build 5 patients / 3 doctors / 10 appointments / 5 prescriptions
(+lines) / 5 lab reports / 3 billings, using `model_schema.json` for required
fields. Idempotent via `SEED-` markers — safe to re-run.

### Automation (Steps 7-8)
A proper Page Object Model plus a JSON-RPC API layer. Full details in
[05_automation/README.md](05_automation/README.md). Key design choices that make
it reliable on this frequently-redeployed, latency-flaky server:
- **Auth via JSON-RPC session cookie injection** (the themed login form is
  unreliable), with in-place re-auth if the session expires mid-run.
- **Text / role / schema-field-name selectors only** — theme CSS classes
  (`hp-*`) change on every redeploy; Odoo field widget names do not.
- **`.filter({ visible: true })` on every stock locator** — the DOM keeps
  hidden stock-Odoo duplicates that otherwise trap waits.
- **No `networkidle`** (Odoo longpolling never idles); waits target real
  content (`thead th`, form views) instead.

### The bug finder (Step 8)
The API layer is the sharp instrument for the "find the bugs" challenge. A
**data-driven boundary bug hunter** pushes invalid values at the server and
asserts rejection. It has already surfaced 3 real defects (see below).

---

## 4. Confirmed defects (filed to Jira)

| Bug | Jira | Case | Defect | Severity |
|---|---|---|---|---|
| BUG-ONCO-001 | KAN-49 | TC-PRESCRIPTIONS-NEG-002 | `healthplix.prescription.line` accepts **negative drug quantity** | Critical (patient safety) |
| BUG-ONCO-002 | KAN-50 | TC-BILLING-NEG-002 | `healthplix.billing.line` accepts **negative unit price** | High (financial) |
| BUG-ONCO-004 | KAN-52 | exploratory | prescription accepts **clinically implausible dosage text** without guardrails | High (patient safety) |
| BUG-ONCO-003 | KAN-51 | TC-DOCTORS-NEG-002 | `healthplix.doctor` accepts **negative experience** | Medium (data integrity) |

The three case-linked API tests are **red on purpose** — a failure is a documented
application defect (tracked in Jira), not a test to "fix". Full evidence with
`call_kw` repro payloads: `06_bugs/bug_report.html` and
`06_bugs/confirmed_defects.json`. Jira board screenshots (durable proof after the
hackathon token expires): [`06_bugs/evidence/`](06_bugs/evidence/). Release
verdict: **No-Go** (`08_verdict/release_readiness.md`).

---

## 5. Running the solution

Prerequisites: Node 20+, and a `.env` with `ODOO_URL`, `ODOO_DB`, `ODOO_USER`,
`ODOO_PASSWORD` (and `JIRA_*` for filing). Copy `.env.example` to start.

```bash
npm ci
npx playwright install --with-deps chromium

# Explorer (refresh ground truth if the app was redeployed)
npm run map:all           # map:ui + map:models

# Synthetic data
npm run seed              # idempotent Faker seed

# Tests
npm run test:full         # seed + all UI + API cases (recommended)
npm run test:all          # all cases, no re-seed
npm run test:ui           # FE only    (SUITE_SCOPE=high for P0/P1 smoke)
npm run test:api          # API + boundary bug hunter only
npm run test:report       # open the Playwright HTML report
```

### Running the test suite (new user quickstart)

#### Prerequisites
Before running the test suite, ensure the following are installed:
- Node.js 20 or later
- Git
- Visual Studio Code (or another code editor)

Create a local `.env` file from `.env.example` and add the required Odoo credentials.
Never commit `.env` to source control.

#### Clone and set up the project
```bash
git clone https://github.com/PrateekguptaPsi/prompt2test.git
cd prompt2test
npm install
npx playwright install
```

#### Validate TypeScript compilation
```bash
npx tsc --noEmit
npx tsc --noEmit -p 05_automation/tsconfig.json
```
Both commands should complete without compilation errors.

#### Seed synthetic test data
```bash
npm run seed
```

#### Run the complete test suite
```bash
npm run test:all
```

#### Open the executive summary report
On Windows:
```bash
start 05_automation/reports/summary/summary.html
```

If the browser shows `ERR_ACCESS_DENIED`, serve the report locally:
```bash
npx http-server 05_automation/reports/summary -p 8080 -c-1
```

Then open:
```text
http://localhost:8080/summary.html
```

#### Open the detailed Playwright report
```bash
npx playwright show-report 05_automation/reports/html
```

#### Complete command sequence
```bash
git clone https://github.com/PrateekguptaPsi/prompt2test.git
cd prompt2test
npm install
npx playwright install
npx tsc --noEmit
npx tsc --noEmit -p 05_automation/tsconfig.json
npm run seed
npm run test:all
```

After test execution:
```bash
start 05_automation/reports/summary/summary.html
npx playwright show-report 05_automation/reports/html
```

Execution runs with **3 parallel workers** by default (`fullyParallel`), which
completes the 38-test FE suite in ~2 minutes. Tune with `PW_WORKERS` (set
`PW_WORKERS=1` if the shared server becomes unstable under load).

### Reports
| Report | Path |
|---|---|
| Executive dashboard (KPIs, per-module, defect candidates) | `05_automation/reports/summary/summary.html` |
| CI job summary (markdown) | `05_automation/reports/summary/summary.md` |
| Playwright report (traces/video/screenshots) | `05_automation/reports/html/index.html` |
| JUnit XML | `05_automation/reports/junit/results.xml` |

### CI
`.github/workflows/qa-tests.yml` runs on push/PR/dispatch as two jobs:

1. **Build & type-check** — always runs, no credentials needed. Installs
   dependencies and type-checks the whole framework. This is the gate that
   proves the code is valid, and it stays green in any clone/fork.
2. **UI + API test suite (live)** — runs only when the four `ODOO_*` secrets are
   configured; otherwise it prints a "not configured" note and stays green
   rather than hard-failing. When it runs, it seeds data, executes all cases,
   publishes the executive summary to the job page, and uploads all reports.

**To run the live suite in CI**, add repository secrets under
*Settings → Secrets and variables → Actions*: `ODOO_URL`, `ODOO_DB`,
`ODOO_USER`, `ODOO_PASSWORD` (and optionally `ODOO_SECONDARY_USER` /
`ODOO_SECONDARY_PASSWORD` for the cross-user isolation check).

> The live job uses `continue-on-error` on the test step **by design**: the
> suite is meant to leave a few red tests when the app has real defects (the 3
> confirmed server-side defects). Those are findings filed to Jira, reported in
> the executive summary — not a broken pipeline. Locally, reproduce the exact
> run with `npm run test:full`.

---

## 6. Security note

`.env` holds live credentials and is git-ignored. The Jira API token was exposed
in plaintext during early setup — **it must be treated as leaked; regenerate it
in Atlassian and update `.env`.** All patient data is synthetic (Faker); no real
PII is used anywhere, and no credentials appear in any deliverable under
`output/` (verified by scan).
