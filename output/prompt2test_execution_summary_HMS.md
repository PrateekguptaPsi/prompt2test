# Prompt2Test QA Execution Summary

**Verdict:** FAILED | **Pass rate:** 88% (38/43) | **Duration:** 5.7 min | **Generated:** 2026-07-11T18:57:49.058Z

| Module | Passed | Failed | Skipped |
|---|---:|---:|---:|
| API | 0 | 3 | 2 |
| Appointments | 4 | 0 | 0 |
| Bed Management | 4 | 0 | 0 |
| Billing | 4 | 0 | 0 |
| Coverage | 2 | 0 | 0 |
| Doctors | 4 | 0 | 0 |
| IPD Details | 4 | 0 | 0 |
| Lab Reports | 4 | 0 | 0 |
| Patients | 4 | 0 | 0 |
| Prescriptions | 4 | 0 | 0 |
| Ward Management | 4 | 0 | 0 |

## Failures / defect candidates (3)
- **TC-PRESCRIPTIONS-NEG-002 - API**: Error: APP DEFECT: healthplix.prescription.line accepted invalid quantity (prescription line quantity must not be zero or negative). File in 06_bugs/Jira.
- **TC-BILLING-NEG-002 - API**: Error: APP DEFECT: healthplix.billing.line accepted invalid price (billing line unit price must not be negative). File in 06_bugs/Jira.
- **TC-DOCTORS-NEG-002 - API**: Error: APP DEFECT: healthplix.doctor accepted invalid experience (doctor experience must not be negative). File in 06_bugs/Jira.

> Assertion failures against a working framework are candidate APP defects — triage into 06_bugs and Jira, do not weaken assertions.
