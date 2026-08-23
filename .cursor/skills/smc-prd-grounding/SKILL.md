---
name: smc-prd-grounding
description: Grounds a solution draft in the SMC Copilot codebase before writing a PRD. Use for non-trivial features, architecture changes, replacements, or migrations.
disable-model-invocation: true
---

# SMC PRD Grounding

1. Read `AGENTS.md`, route to the affected subsystem, then read only that subsystem's `AGENTS.md`.
2. Read the relevant source anchors, direct callers, contracts/ADRs only when their boundary is affected, and current tests. Do not scan the monorepo for completeness.
3. Write a `PRD-DRAFT` using [`../../references/prd-contract.md`](../../references/prd-contract.md).
4. Include `Current Capability Inventory` before proposing an implementation. Record capability, existing owner, entry point, and tests.
5. Include `Target End-State Inventory`; every capability has exactly one production owner and allowed implementation count.
6. Classify every change as KEEP, MODIFY, ADD, REPLACE, or REMOVE. REPLACE requires a removal matrix. Compatibility needs a real current consumer and bounded removal contract.
7. Store historical faulty behavior only in tests/fixtures or golden files, never in production modules.

## Exit

The PRD is `DRAFT` or `REVIEW_REQUIRED`, has source anchors, inventories, change classification, and acceptance criteria. Do not mark it approved.
