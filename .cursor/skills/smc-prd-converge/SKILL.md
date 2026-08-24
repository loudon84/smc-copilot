---
name: smc-prd-converge
description: Converges an SMC Copilot PRD draft, independent review findings, and human decisions into one final approved PRD. Use only after PRD review.
disable-model-invocation: true
---

# SMC PRD Converge

1. Apply accepted review findings and human decisions to the draft.
2. Remove rejected alternatives, exploration notes, temporary hotfixes, and obsolete algorithms.
3. Keep only final state, migration/removal method, and acceptance criteria.
4. Recheck [`../../references/prd-contract.md`](../../references/prd-contract.md) and [`../../references/architecture-convergence.md`](../../references/architecture-convergence.md).
5. Set `status: APPROVED`, `review_verdict: PASS`, and `approved_at` only after a PASS review and any required human decision.
6. After APPROVED, rename `*-DRAFT.md` by dropping the `-DRAFT` suffix (keep one file). Validate the new path with `--require-approved`.

## Exit

The PRD expresses one target architecture, the filename no longer contains `-DRAFT`, and it is ready for planning. A `REVISE` or `BLOCKED` review cannot be converged to `APPROVED`.
