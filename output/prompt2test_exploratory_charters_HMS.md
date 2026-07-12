# Step 9 Exploratory Charters — HealthPlix Oncology HMS (Odoo 17)

1. Explore prescription line creation with boundary-value injection (zero/negative quantity and extreme dosage) to discover whether unsafe medication orders are accepted server-side.
2. Explore prescription finalization for allergy-risk synthetic patients with interaction-focused heuristics to discover whether fail-safe allergy/interaction blocking is consistently enforced.
3. Explore lab report creation with out-of-range and clinically implausible synthetic result values to discover whether the system accepts unsafe diagnostic data.
4. Explore billing creation from discharged-IPD and post-discharge patient contexts with state-transition abuse to discover whether billing is wrongly allowed after discharge.
5. Explore bed assignment flows with concurrent-like repeated allocation attempts to discover whether one bed can be linked to two active patients.
6. Explore appointment creation using temporal edge cases (past-dated and duplicate doctor/time slot entries) to discover whether scheduling guardrails prevent unsafe booking states.
7. Explore billing line item operations with adversarial financial payloads (negative/duplicate invoice lines) to discover whether server-side financial constraints are missing.
8. Explore billing totals and revenue dashboard counters with reconciliation heuristics to discover whether module-level revenue summaries drift from persisted billing lines.
9. Explore cross-patient read/write attempts by direct ID targeting through JSON-RPC search/read/write patterns to discover access-isolation bypasses.
10. Explore known boundary defect regression probes (negative prescription quantity, negative billing price, negative doctor experience) with replay verification to discover whether previously confirmed defects still persist.
