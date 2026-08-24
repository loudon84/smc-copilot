---
name: smc-plan-from-approved-prd
description: Creates a minimal SMC Copilot implementation plan from an approved PRD. Use when a PRD is APPROVED and a Cursor .plan.md is needed.
disable-model-invocation: true
---

# Plan From Approved PRD

1. Validate the PRD with `python tools/agent-skills/validate_prd.py <prd> --require-approved`; stop unless it is APPROVED and the filename no longer ends with `-DRAFT.md`.
2. Use `planning-and-task-breakdown` and the existing `plan-codegen-minimal.mdc`; read only source needed for the current slice.
3. Add `## Approved PRD` with a repository-relative link and `## Change Matrix` with file/symbol, action, existing owner, and target state.
4. Mirror every PRD REPLACE with a Plan REMOVE. Any new production file needs `## New File Justification` explaining why its existing owner cannot carry the capability.
5. Check [`../../references/architecture-convergence.md`](../../references/architecture-convergence.md), then run `python tools/agent-skills/validate_plan.py <plan>`.

## Exit

The plan is approved only when its PRD is approved, its removal and ownership decisions match the PRD, and the existing minimal-plan rule is satisfied.
