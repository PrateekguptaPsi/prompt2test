# Rule 2 — Negative-First Test Case (CSV, Functional, Patient-Safety Weighted)

## Scope
Use for Odoo Hospital Management System (cancer-center context) functional test case design only.

## Core principle
- Generate test cases from scenarios with **negative-first** ordering.
- Enforce **minimum 2:1 ratio** of `Negative` to `Positive` cases.
- Prioritize failure modes that can impact patient safety, data integrity, or care continuity.

## Required CSV schema
Each row must include these columns:

- `TestCaseID`
- `Module`
- `ScenarioID`
- `RequirementID`
- `Title`
- `Type` (`Negative|Positive`)
- `Category`
- `Priority` (`P0|P1|P2|P3`)
- `Preconditions`
- `TestData`
- `Steps`
- `ExpectedResult`
- `E2E` (`Yes|No`)

## Mandatory categories (must be represented in each module batch where applicable)
1. `RequiredFieldValidation`
2. `InvalidOrBoundaryInput`
3. `WorkflowOrStateGuard`
4. `CrossRecordOrAccessIsolation`

If a category is not applicable to a module due to model constraints, mark it as covered at cross-module scenario level and include at least one related case in the full batch.

## Model/schema grounding rules
- Use only fields that exist in `artifacts/model_schema.json` for the target `healthplix.*` model.
- Required-field negative cases must be based only on fields where `required: true`.
- Do not invent columns/fields or backend behavior not represented by model + scenario context.
- Keep test data synthetic only (no real PII).

## Negative-first sequencing
For each module:
- Start with negative cases first.
- Include at least one positive control case.
- Maintain minimum ratio:
  - `NegativeCases >= 2 * PositiveCases`

## ID and traceability format
- TestCaseID format: `TC-<MODULE>-<NEG|POS>-<nnn>`
  - Example: `TC-PRESCRIPTIONS-NEG-001`
- `ScenarioID` and `RequirementID` must map to existing entries.
- Ensure every case is traceable to one scenario and one requirement.

## Guardrails
- Functional testing only.
- No implementation details in test steps.
- Steps must be deterministic, reproducible, and concise.
- Expected results must be unambiguous and validation-oriented.
