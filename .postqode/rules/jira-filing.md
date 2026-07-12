# Rule 6 — Jira Filing (Confirmed Defects)

## Scope
Use for Odoo Hospital Management System (cancer-center context) functional defect filing only.

## Core principle
- File every **confirmed** defect to Jira in project `JIRA_PROJECT_KEY`.
- Preserve patient-safety context and traceability from bug report to Jira and RTM.
- Functional defects only.

## Jira API requirements
- Use Jira REST API v3 endpoint:
  - `POST /rest/api/3/issue`
- Project key must come from `process.env.JIRA_PROJECT_KEY`.
- Jira base URL and auth must come from environment variables only:
  - `process.env.JIRA_BASE_URL`
  - `process.env.JIRA_EMAIL`
  - `process.env.JIRA_API_TOKEN`
- Do not hard-code credentials, tokens, project keys, or tenant-specific URLs in code.

## Priority mapping
Map Severity to Jira Priority consistently:
- `Critical` -> Highest
- `High` -> High
- `Medium` -> Medium
- `Low` -> Low

If the Jira instance uses different priority names/IDs, resolve them once via API and map deterministically.

## Description payload requirements
Jira issue description must include, in this order:
1. Patient-safety impact summary
2. Preconditions
3. Steps to reproduce
4. Expected result
5. Actual result
6. Business impact
7. Evidence references (screenshots/log IDs/timestamps)
8. Traceability IDs (Bug ID, Requirement ID, Scenario/TestCase ID when available)

## Post-filing traceability updates
After successful issue creation:
- Capture returned issue key (e.g., `KAN-123`).
- Write the issue key back into:
  - The originating bug report record
  - The RTM entry linked to the defect/requirement
- Update defect status to reflect Jira filing state.

## Failure handling
- If Jira creation fails, mark filing status as `FailedToFile` and persist error details.
- Never drop a confirmed defect silently.
- Retry only with idempotency safeguards to avoid duplicate Jira issues.

## Guardrails
- Functional testing scope only.
- No root-cause speculation unless explicitly requested.
- Keep all Jira-authenticated operations sourced from `process.env` only.
