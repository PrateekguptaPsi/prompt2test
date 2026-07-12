# Rule 1 — User Story (Functional, Patient-Safety Weighted)

## Scope
Use for Odoo Hospital Management System (cancer-center context) functional requirements only.

## Required format
- Story sentence must be exactly:
  - `As a <role>, I want <action>, so that <benefit>.`
- Provide **3 to 6** acceptance criteria in Given/When/Then format.
- Include **at least one negative acceptance criterion** (reject/prevent/fail-safe behavior).
- Include a Requirement ID in this format:
  - `REQ-<MODULE>-<n>` (example: `REQ-ONCO-12`)
- Assign priority weighted by patient-safety impact.

## Priority model (patient-safety first)
- **P0 Critical**: failure may directly risk patient safety/clinical outcome.
- **P1 High**: failure can delay/impair treatment decisions or care continuity.
- **P2 Medium**: operational impact without immediate clinical harm.
- **P3 Low**: minor inconvenience/cosmetic workflow impact.

## Output template
- RequirementID: `REQ-<MODULE>-<n>`
- Module: `<module>`
- UserStory: `As a <role>, I want <action>, so that <benefit>.`
- Priority: `P0|P1|P2|P3`
- AcceptanceCriteria:
  1. Given ... When ... Then ...
  2. Given ... When ... Then ...
  3. Given ... When ... Then ...
  4. (optional)
  5. (optional)
  6. (optional)

## Guardrails
- Keep criteria testable and unambiguous.
- Include one negative criterion per story minimum.
- Do not include implementation detail in requirement text.
- Functional testing only (no performance/security scope unless explicitly requested).
