# Step 12 Approach — Risk-Based Agentic QA Pipeline

## Objective
Deliver a traceable, patient-safety-weighted QA cycle for the HealthPlix oncology HMS (Odoo 17), from grounded exploration through automated execution, defect confirmation, Jira filing, and release verdict.

## Pipeline Narrative (Closed Loop)

1. **Explorer-grounded truth (Step 1 artifacts as contract)**
   - UI contract from `artifacts/app_map.json` / `artifacts/module_map.md`
   - Backend model contract from `artifacts/model_schema.json`
   - All downstream design and automation aligned to these artifacts to avoid speculative assumptions.

2. **Risk-based test design**
   - Requirements → scenarios → negative-first test cases (`04_cases/test_cases.csv`)
   - Patient-safety weighted priorities (P0/P1 first)
   - Functional scope only, with explicit traceability IDs.

3. **Automation architecture**
   - **Playwright + TypeScript** with **POM** for UI workflows (`05_automation/pages/*`)
   - **JSON-RPC API validation** for server-side business rules and boundary bug hunting
   - Deterministic execution with retries for transient infrastructure instability
   - Single-worker execution in this environment to reduce shared-session churn and flake amplification.

4. **Explorer + automation convergence**
   - Full suite run establishes pass/fail/skip baseline.
   - Web-agent live cross-check used to differentiate:
     - true application defects
     - harness/data-binding issues
   - Non-app failures were healed minimally via test-data alignment, not by weakening assertions.

5. **Adversarial exploratory hunt**
   - High-risk charters (`06_bugs/exploratory_charters.md`) executed with synthetic data.
   - Faster server probes preferred via JSON-RPC (same working auth/call_kw pattern).
   - Confirmed defects merged with automation findings.

6. **Defect consolidation and analytics**
   - Unified report in `06_bugs/bug_report.html`
   - Patient-safety first ordering
   - Severity split and module-wise defect density
   - API payload evidence included for reproducibility.

7. **Tracker integration (Jira)**
   - One Jira issue per confirmed defect using REST v3 with env-driven auth.
   - Severity-to-priority mapping applied.
   - Returned keys backfilled into bug report + RTM:
     - KAN-49, KAN-50, KAN-51, KAN-52.

8. **Release governance artifacts**
   - RTM generation (`07_rtm/traceability_matrix.csv`) links Requirement → Scenario → TestCase → status → Jira.
   - Release readiness verdict (`08_verdict/release_readiness.md`) explicitly No-Go due to blocking safety/integrity defects.
   - This closes the loop from discovery to decision with auditable traceability.

## Why this approach is resilient here
- Uses environment-proven selectors and server contracts, not fragile theme CSS.
- Treats failing negative tests as defect signals, not test problems to mask.
- Couples UI behavior checks with API persistence verification.
- Maintains strict synthetic-data discipline and reproducibility evidence.
- Produces actionable outputs for engineering, QA, and release stakeholders in one pass.
