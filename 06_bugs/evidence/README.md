# Defect Evidence — Jira Board Screenshots

Visual proof that the confirmed defects were filed as tracked issues on the
`KAN` board (`zeroday-qa.atlassian.net`). Retained here because the hackathon
Jira access token deactivates automatically — these screenshots are the durable
record after the live board is gone.

| File | Shows |
|---|---|
| `jira_board_KAN-49-52.png` | The full KAN board — the 9 requirement/story issues (KAN-4 … KAN-12, *In Review*) **and** the 4 filed defects (KAN-49 … KAN-52, *To Do*) with priorities. Evidence the whole pipeline (stories → defects) reached a real tracker. |
| `jira_KAN-49_detail.png` | Detail of KAN-49 — Critical / Highest: server accepts negative drug quantity |
| `jira_KAN-50_detail.png` | Detail of KAN-50 — High: server accepts negative billing unit price |
| `jira_KAN-51_detail.png` | Detail of KAN-51 — Medium: server accepts negative doctor experience |
| `jira_KAN-52_detail.png` | Detail of KAN-52 — High: prescription accepts implausible dosage text |

Mapping of bug id → Jira key → test case: see
[`../confirmed_defects.json`](../confirmed_defects.json) and
[`../../artifacts/jira_step11_defects.json`](../../artifacts/jira_step11_defects.json).

| Bug | Jira | Severity | Defect |
|---|---|---|---|
| BUG-ONCO-001 | KAN-49 | Critical | Server accepts negative drug quantity (prescription line) |
| BUG-ONCO-002 | KAN-50 | High | Server accepts negative billing unit price |
| BUG-ONCO-004 | KAN-52 | High | Prescription accepts implausible dosage text |
| BUG-ONCO-003 | KAN-51 | Medium | Server accepts negative doctor experience |
