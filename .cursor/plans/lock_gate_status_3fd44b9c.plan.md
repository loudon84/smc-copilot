---
name: Lock Gate Status
overview: The Complete Bundle Lock Gate plan is already implemented in commit c8af60fc. This plan clarifies current status and the only remaining optional follow-ups if you still want a “fix” pass.
todos:
  - id: confirm-intent
    content: User confirms A re-verify, B optional LOW tests/harden, or C stop
    status: completed
  - id: optional-followup
    content: "If B: add CRLF/omit-path tests and optional tools-array harden; re-run focused tests"
    status: completed
isProject: false
---

# Complete Bundle Lock Gate — already done; optional follow-ups

## Current status

Implementation landed in [`c8af60fc`](c8af60fc) (`fix(work): require complete Skill Run Bundle before lock opens`). Working tree for the plan’s write targets is clean.

| Plan todo | Status | Evidence |
|---|---|---|
| T1 Complete Bundle lock predicate | Done | [`apps/work/src/main/skill-run/skill-run-consumer-lock.ts`](apps/work/src/main/skill-run/skill-run-consumer-lock.ts) `isCompleteSkillRunBundleDir`; repo [`contracts/skill-run/v1.0.0/`](contracts/skill-run/v1.0.0/) still identity-only → `hasSkillRunConsumerLock() === false` |
| T2 Gateway fail-closed Catalog/start | Done | [`apps/work/src/main/skill-run/skill-run-gateway-client.ts`](apps/work/src/main/skill-run/skill-run-gateway-client.ts) no-lock short-circuit + missing `capabilityKind` → `contract-unsupported` |

Do **not** re-implement C01/C02 or edit the plan file. Re-running the same todos would be a no-op.

```mermaid
flowchart LR
  lock[hasSkillRunConsumerLock]
  gate[createSkillRunGatewayClient]
  catalog[listCatalog]
  call[callSkill]
  lock -->|false identity-only| unsupported[contract-unsupported]
  gate --> catalog
  gate --> call
  catalog -->|missing capabilityKind| unsupported
  call -->|assertLock| unsupported
```

## Recommended next action (pick one)

**A — Re-verify only (no code change)**  
Re-run Plan Verification Ledger V01–V06 from `apps/work`, retain under `artifacts/work-v4.0.1-complete-bundle-lock-gate/`. Confirm Completion = `IMPLEMENTED_AND_PROVEN` for this slice (still does **not** close ROADMAP M0 while Bundle is identity-only).

**B — Optional LOW hygiene from prior review**  
Only if you want a small follow-up commit:
1. Add explicit unit cases in [`skill-run-consumer-lock.test.ts`](apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts) for CRLF `SHA256SUMS` rejection and SHA256SUMS that omit a required P0 path.
2. Optionally harden [`listCatalog`](apps/work/src/main/skill-run/skill-run-gateway-client.ts): when `tools` is missing/non-array after a successful MCP call, return `contract-unsupported` instead of `ready` + `[]` (pre-existing gap; outside strict AC-06 discriminator wording).

**C — Stop here**  
Treat the attached plan as complete; proceed to Roadmap update or the next Work slice (M0 Bundle delivery is Provider-owned / C05 out of this plan).

## Not in scope (unchanged)

- C03 production-default skill-first (M5)
- C04 Expert entry REMOVE (v4.2 Removal PRD)
- C05 Work-authored Provider Bundle files
- Enabling live E2E (`SMC_SKILL_RUN_E2E=1`)
