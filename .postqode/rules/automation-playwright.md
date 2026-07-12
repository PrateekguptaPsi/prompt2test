# Rule 5 — Automation (Playwright + TypeScript)

## Scope
Use for Odoo Hospital Management System (cancer-center context) functional automation only.

## Framework requirements
- Use **Playwright with TypeScript**.
- Use **Page Object Model (POM)** architecture.
- Define a shared `OdooBasePage` with SPA-safe waits targeting:
  - `.o_form_view`
  - `.o_list_view`
- Create **one page object per module** to keep flows modular and maintainable.

## Authentication and session
- Use a dedicated auth setup that saves and reuses **`storageState`**.
- Do not hard-code credentials.
- Read credentials and target URLs from environment variables only (`process.env`).

## Data and execution model
- Drive automated coverage from `test_cases.csv` (data-driven execution).
- Ensure each automated case maps back to Requirement IDs / test case IDs when available.
- Enforce functional testing scope only (no non-functional assertions unless explicitly requested).

## Reporting
- Enable both reporters:
  - **HTML** report
  - **JUnit** report
- Ensure report output is suitable for CI and traceable to module and test IDs.

## Configuration guardrails
- All runtime config must come from env variables via `process.env` only.
- Never hard-code secrets, tokens, credentials, or tenant-specific identifiers in test code.
- Keep selectors and waits resilient for Odoo SPA navigation and state transitions.
