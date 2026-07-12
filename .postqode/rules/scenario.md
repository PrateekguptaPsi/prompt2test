# Rule 3 — Scenario (Workflow-Level Coverage)

## Scope
Use for Odoo Hospital Management System (cancer-center context) functional scenario design only.

## Core principle
- Scenarios must validate real clinical and operational workflows end-to-end.
- Every scenario must map to one or more Requirement IDs (`REQ-<MODULE>-<n>`).
- Patient-safety impact drives scenario priority and execution order.

## Scenario bands
Classify every scenario into exactly one band:
1. **Core**
   - Primary workflow needed for safe and correct care delivery.
2. **Alternate**
   - Valid variation, exception path, or recovery path of a core flow.
3. **Cross-Module E2E**
   - Workflow traversing multiple modules (e.g., registration → consultation → orders → billing).

## Required fields per scenario
- ScenarioID
- ScenarioName
- Band (`Core|Alternate|Cross-Module E2E`)
- LinkedRequirementIDs (one or more)
- ModulesInvolved
- Preconditions
- Trigger
- MainFlow (numbered steps)
- AlternateOrExceptionFlow (if applicable)
- ExpectedOutcome
- **RiskIfFailed** (specific risk statement)
- **SeverityIfFailed** (`Critical|High|Medium|Low`)
- Priority (`P0|P1|P2|P3`)

## Guardrails
- Functional testing only.
- Do not include implementation details.
- Keep scenarios testable, unambiguous, and traceable to requirements.
- Every scenario must explicitly name the risk and severity-if-failed.
