# Rule 4 — Bug Report (Patient-Safety First)

## Scope
Use for Odoo Hospital Management System (cancer-center context) functional defect reporting only.

## Core principle
- Every bug report must lead with patient-safety impact.
- Defects that can directly affect clinical decision-making, treatment timing, medication, or care continuity must be prioritized first.
- Reports must be clear, reproducible, and suitable for triage and Jira filing.

## Required fields (exact)
- ID
- Severity
- Priority
- Module
- Preconditions
- Steps
- Expected
- Actual
- Evidence
- BusinessImpact
- Status

## Field guidance
- **ID**: unique defect identifier (e.g., `BUG-ONCO-001`).
- **Severity**: classify impact level (`Critical|High|Medium|Low`) with patient-safety rationale.
- **Priority**: assign execution/triage urgency (`P0|P1|P2|P3`) based on patient-safety first.
- **Module**: owning functional module (or multiple modules if cross-module defect).
- **Preconditions**: required data/state/access setup.
- **Steps**: minimal deterministic steps to reproduce.
- **Expected / Actual**: unambiguous functional behavior comparison.
- **Evidence**: attach/point to screenshots, logs, recordings, IDs, timestamps.
- **BusinessImpact**: specific operational/clinical impact statement.
- **Status**: lifecycle state (e.g., New, Confirmed, In Progress, Fixed, Retest, Closed, Rejected).

## Required analytics in each reporting batch
- Include a **severity split** summary (`Critical/High/Medium/Low` counts and percentages).
- Include **defect density per module** summary:
  - `DefectDensity(module) = ConfirmedDefectsInModule / ExecutedTestCasesInModule`
- Highlight modules with highest density and any patient-safety-critical concentration.

## Guardrails
- Functional testing only.
- No implementation-level root-cause speculation unless explicitly requested.
- Keep reports reproducible, evidence-backed, and traceable to Requirement IDs / scenarios when available.
