---
name: smc-prd-review
description: Independently reviews an SMC Copilot PRD draft for architecture, ownership, replacement, and governance defects. Use before approving a non-trivial PRD.
disable-model-invocation: true
---

# SMC PRD Review

This skill is read-only. Use a fresh-context reviewer and [`../../references/architecture-convergence.md`](../../references/architecture-convergence.md).

Input: PRD-DRAFT, current-state inventory, relevant source anchors, contracts, and ADRs. Do not provide the author’s private reasoning.

Check existing capability, ownership, ADD versus REPLACE, removal completeness, compatibility lifetime, parallel implementations, test architecture, new-file necessity, scope expansion, boundaries, and operational verification.

Return exactly one verdict:

- `PASS` — ready to converge and approve.
- `REVISE` — correctable PRD issue.
- `BLOCKED` — missing evidence or an unresolved decision.

Use `doubt-driven-development` for adversarial questioning; do not edit the PRD.
