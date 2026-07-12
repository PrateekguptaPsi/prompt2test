# Test Strategy — Oncology Hospital Management System (Odoo)

## 1) Objective
Define a risk-based, patient-safety-first functional test strategy for the oncology HMS implemented on Odoo, using verified system exploration outputs from:

- `artifacts/module_map.md`
- `artifacts/app_map.json`
- `artifacts/model_schema.json`

This strategy covers clinical and operational workflows across:
Patients, Doctors, Prescriptions, Lab Reports, IPD Details, Appointments, Billing, Ward Management, and Bed Management.

---

## 2) Scope

### In Scope (Functional)
- UI functional behavior of mapped modules and workflows.
- Server-side functional validations through Odoo JSON-RPC.
- Data integrity across related `healthplix.*` models.
- Cross-module workflow continuity:
  Patient registration → appointment → prescription → lab → IPD/treatment → discharge → billing.
- Access-control behavior relevant to cross-patient data exposure.

### Out of Scope
- Performance/load testing.
- Security penetration testing.
- Infrastructure/network resilience testing.
- Non-functional UX benchmarking beyond functional correctness.

---

## 3) Ground Truth Baseline (from Explorer)

- UI modules mapped: **9/9**
- UI module errors: **0**
- Model schema discovered: **30 `healthplix.*` models**
- Schema failures: **0**
- Action references verified:
  - Patients `action-374`
  - Doctors `action-375`
  - Appointments `action-376`
  - Prescriptions `action-377`
  - Lab Reports `action-378`
  - IPD Details `action-380`
  - Ward Management `action-381`
  - Bed Management `action-382`
  - Billing `action-383`
- Navigation behavior facts:
  - Billing label appears as **“Billings”** in UI.
  - Ward/Bed Management are reachable via dashboard cards.
  - URLs can be nested (`/odoo/action-372/action-XXX`), and last action segment represents active module.
- Current environment data state:
  - Database is effectively empty for business records; data seeding is prerequisite for meaningful execution depth.

---

## 4) Risk Register (Patient-Safety First)

| Risk ID | Area | Risk Description | Patient-Safety Impact | Likelihood | Impact | Priority |
|---|---|---|---|---|---|---|
| R1 | Prescriptions | Invalid dosage/quantity accepted (zero/negative/out-of-range) | Medication error risk | Medium | Critical | P0 |
| R2 | Prescriptions | Missing allergy/interaction safeguards in prescribing flow | Adverse drug event risk | Medium | Critical | P0 |
| R3 | Lab Reports | Invalid or out-of-range lab values accepted without control | Incorrect clinical decision support | Medium | Critical | P0 |
| R4 | Patients | Cross-patient record visibility or wrong patient linkage | Privacy breach + treatment mismatch | Medium | Critical | P0 |
| R5 | Billing | Incorrect totals/line aggregation or duplicate/negative billing | Financial and discharge process harm | Medium | High | P1 |
| R6 | IPD Details | Bed/ward allocation conflicts (double assignment) | Care continuity and bed safety risk | Medium | High | P1 |
| R7 | Appointments | Past-date or double-booking accepted | Treatment delay and scheduling conflicts | Medium | High | P1 |
| R8 | Cross-Module | Referential mismatches across appointment/prescription/lab/IPD/billing | Clinical traceability breakdown | Medium | High | P1 |

Highest focus modules by risk concentration: **Prescriptions, Lab Reports, Patients, Billing, IPD Details**.

---

## 5) Test Levels and Coverage Model

### L1 — Schema/Model Validation (Backend-First)
- Validate required fields and relation integrity from `model_schema.json`.
- Confirm model-level expectations for high-risk entities:
  `healthplix.patient`, `healthplix.doctor`, `healthplix.appointment`,
  `healthplix.prescription`, `healthplix.prescription.line`,
  `healthplix.lab.report`, `healthplix.billing`, `healthplix.billing.line`,
  `healthplix.ipd`, `healthplix.ward`, `healthplix.bed`.

### L2 — Module Functional Validation (UI)
- Per-module list, form, save/discard, required fields, status transitions.
- Positive and negative-path checks with strict traceability to requirement/story/case IDs.

### L3 — Cross-Module Workflow E2E
- Registration to billing chain with linkage consistency and business-state continuity.
- Failure-in-the-middle scenarios (invalid data, missing prerequisite, incompatible state).

### L4 — API/Business Rule Assertions
- JSON-RPC assertions for server-side rejections/acceptances:
  negative prescription qty rejection, invoice total consistency, access isolation.

### L5 — Exploratory Risk Hunting
- Adversarial charters on top patient-safety and data-integrity risks.

---

## 6) Entry and Exit Criteria

## Entry Criteria
1. Explorer artifacts available and valid:
   - `module_map.md` complete for 9 modules.
   - `app_map.json` has zero module errors.
   - `model_schema.json` has zero schema failures.
2. Environment variables configured from `process.env` only.
3. Synthetic seed data available (no production/real patient data).
4. Automation framework baseline available (auth/session handling, reporters).

## Exit Criteria
1. Planned high-priority functional scenarios executed.
2. Critical and high severity defects triaged; blocking defects documented.
3. Bug report generated with severity split and module defect density.
4. Jira filing completed for confirmed defects (when Step 11 is executed).
5. RTM updated with execution and defect traceability.
6. Release readiness verdict documented with explicit residual risks.

---

## 7) Synthetic Data Strategy (No Real PII)

### Principles
- Use **synthetic-only** patient/doctor/clinical/billing data.
- No real names, identifiers, phone numbers, email addresses, or clinical records.
- Tag generated entities with deterministic prefix (e.g., `SEED-`) for idempotent reruns and cleanup.

### Planned Seed Minimum
- 5 patients
- 3 doctors
- 10 appointments
- 5 prescriptions (+ prescription lines)
- 5 lab reports/orders
- 3 billing records/invoices

### Data Controls
- Required fields populated per `model_schema.json`.
- Referential integrity preserved across linked models.
- Generate both valid and controlled-invalid datasets for negative testing paths.

---

## 8) Automation Approach

## UI Automation
- Playwright + TypeScript with Page Object Model.
- Stable selectors strategy:
  - Prefer role/text-based locators (`getByRole`, `getByText`).
  - Avoid brittle theme CSS selectors (theme classes can change across redeploys).
- SPA-safe waits focused on Odoo list/form readiness and deterministic state transitions.
- Session strategy: JSON-RPC authentication with reusable storage state.

## Backend/API Automation
- Playwright request context against Odoo JSON-RPC:
  - `/web/session/authenticate`
  - `/web/dataset/call_kw/<model>/<method>`
- Business rule assertions at server layer for non-E2E cases.

## Reporting
- HTML reporter for human triage.
- JUnit reporter for CI traceability and pipeline integration.

---

## 9) 48-Hour Execution Schedule

### 0–6h: Stabilize Foundation
- Finalize explorer outputs and strategy baseline.
- Confirm module/action map and schema integrity.
- Freeze selector conventions and auth pattern.

### 6–14h: Requirements to Test Design
- Generate user stories (patient-safety weighted).
- Build core/alternate/cross-module scenarios.
- Start module-wise negative-first case generation.

### 14–24h: Data + Framework Build
- Implement synthetic seed script and verify counters.
- Build Playwright FE framework (base page + module POMs + fixtures).
- Configure HTML + JUnit reporting.

### 24–34h: Functional Automation Implementation
- Implement high-priority UI specs from CSV.
- Add backend JSON-RPC API assertions for E2E=No cases.
- Validate deterministic execution and retries.

### 34–42h: Exploratory Risk Hunt + Consolidation
- Execute adversarial charters on high-risk modules.
- Confirm defects with reproducible evidence and patient-safety impact.
- Merge automated + exploratory findings into consolidated bug report.

### 42–48h: Closure and Decision Artifacts
- Jira filing for confirmed defects.
- Build RTM with requirement→scenario→case→status→Jira link.
- Publish release readiness verdict and approach summary.

---

## 10) Quality Gates (Go/No-Go Inputs)
- No unresolved P0 patient-safety defects.
- High-risk workflow pass rate acceptable with documented residual risk.
- Defect reporting complete, evidence-backed, and traceable.
- Jira and RTM synchronization complete for confirmed issues.
- Release verdict reflects current risk posture, not only pass percentage.
