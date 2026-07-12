# 05_automation — Playwright UI + API framework

Test automation for the HealthPlix oncology HMS (Odoo 17, `team43.qaaerp.com`).

## Structure

```
05_automation/
├── playwright.config.ts      # __dirname-anchored config: 2 projects (setup → chromium)
├── pages/
│   ├── OdooBasePage.ts       # engine: auth self-healing, SPA waits, visible-filtered locators
│   ├── GenericModulePage.ts  # POM base: schema-driven locator factory + form operations
│   └── <Module>Page.ts       # 9 page objects: real locators + business methods per module
├── fixtures/
│   └── automationFixtures.ts # page-object fixtures injected into specs
├── data/                     # CSV/markdown/artifact loaders (test_cases.csv, scenarios, app_map)
├── api/
│   └── odooJsonRpcClient.ts  # JSON-RPC client (/web/dataset/call_kw/<model>/<method>)
├── tests/
│   ├── auth.setup.ts         # JSON-RPC login → storageState (themed login form is unreliable)
│   ├── high-priority-cases.spec.ts  # data-driven P0/P1 FE cases from 04_cases/test_cases.csv
│   └── api-business-rules.spec.ts   # server-side business rules (E2E=No cases)
└── reporters/
    └── psiSummaryReporter.ts # executive HTML dashboard + markdown CI summary
```

## Stability rules (learned from this environment — do not undo)

1. **Never `waitForLoadState("networkidle")`** — Odoo longpolling keeps the network busy forever.
2. **Every stock-class locator needs `.filter({ visible: true })`** — the theme keeps hidden
   stock-Odoo duplicates (nav menus, list views) in the DOM.
3. **Selectors are text/role/field-name based** — theme CSS classes (`hp-*`) change on redeploys;
   Odoo field widget names come from `artifacts/model_schema.json` and survive.
4. **Wait for `thead th`, not the `.o_list_view` container** — the container mounts before data.
5. **Auth = JSON-RPC session cookie** with in-place refresh when the server expires it.
6. **1 worker** — parallel contexts churn the shared hackathon session.

## Run

```bash
npm run test:ui      # data-driven P0/P1 FE suite
npm run test:api     # JSON-RPC business-rule suite
npm run test:all     # both (setup project runs first automatically)
npm run test:report  # open the Playwright HTML report
```

Credentials come from `.env` (see `.env.example`) or CI secrets: `ODOO_URL`, `ODOO_DB`,
`ODOO_USER`, `ODOO_PASSWORD`. Optional for cross-user isolation test:
`ODOO_SECONDARY_USER`, `ODOO_SECONDARY_PASSWORD`.

## Reports

| Output | Path |
|---|---|
| Executive dashboard (KPIs, per-module, defect candidates) | `reports/summary/summary.html` |
| CI job summary (markdown) | `reports/summary/summary.md` |
| Playwright HTML report (traces, videos, screenshots) | `reports/html/index.html` |
| JUnit XML (CI integration) | `reports/junit/results.xml` |

## CI

`.github/workflows/qa-tests.yml` runs type-check + both suites on push/PR/manual dispatch,
publishes the executive summary to the job page, and uploads all reports as artifacts.
Set the four `ODOO_*` repository secrets in GitHub before the first run.

## Triage rule

A test failure against this verified framework is a **candidate application defect**
(e.g. the API suite proves the server accepts negative prescription quantities — a
patient-safety P0). Route failures to `06_bugs/` and Jira; never weaken assertions to go green.
