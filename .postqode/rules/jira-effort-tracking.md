# Rule 7 — Jira Effort Tracking (Mandatory for Delivery Subtasks)

## Scope
Use for Odoo Hospital Management System (cancer-center context) Jira issue/subtask tracking.

## Core principle
- Every completed Jira subtask must include effort logging.
- Effort must be logged on the **subtask itself** (not only parent story).
- Use consistent, auditable time entries tied to actual delivery artifacts.

## Mandatory actions per completed subtask
1. Add/update technical completion comment with linked artifact(s).
2. Transition subtask to `Done` (or project equivalent closed state).
3. Log work effort using Jira worklog API:
   - `POST /rest/api/3/issue/{issueKey}/worklog`
4. Ensure assignee is set to execution owner (`JIRA_EMAIL` account by default).

## Effort format guidance
- Log effort in minutes/hours (`timeSpent` or `timeSpentSeconds`).
- Keep entries realistic and reproducible.
- Include short worklog comment:
  - Step identifier (e.g., Step 4/5/6)
  - Artifact references (file names)
  - Summary of work performed

## Approximation policy
- If exact tracked time is unavailable, log **best-effort approximation** and mark as such in comment.
- Never leave completed subtasks without effort entry.

## API/env requirements
- Use Jira REST API v3.
- Read config from environment only:
  - `process.env.JIRA_BASE_URL`
  - `process.env.JIRA_EMAIL`
  - `process.env.JIRA_API_TOKEN`
  - `process.env.JIRA_PROJECT_KEY`
- Never hard-code credentials or tenant data.

## Idempotency
- Before adding worklog, check existing worklogs for the same step marker.
- Skip duplicate effort posting for the same step+subtask marker.

## Guardrails
- Functional/testing delivery scope only.
- Do not falsify effort.
- Keep comments concise, evidence-backed, and traceable to repository artifacts.
