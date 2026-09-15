---
name: smc-plan-delivery
description: GES 5 canonical Plan delivery orchestrator. Supports smc.plan.v3.7 and adaptive Engineering Runtime while preserving the frozen delivery-truth state machine.
version: 1.5.0
---

# SMC Plan Delivery v1.5 — GES 5 Delivery Truth

## Role

This is the **only governed Plan Delivery Orchestrator**. Intent may be LEAN/FULL and engineering
may use different methods/models, but final delivery truth is never weakened.

## Frozen invariants

1. `commit_policy: post_review`.
2. Static PASS != implementation complete.
3. Todo completed != `IMPLEMENTED_AND_PROVEN`.
4. One production `path#symbol` has one Todo WRITE_OWNER.
5. explicit Plan path/id is binding; no newest-plan fallback.
6. Plan Author owns Todo id/content; Delivery owns runtime status.
7. Completion Audit / Implementation Review / Verification bind current Plan scope content.
8. pre-existing unrelated dirty may remain only if byte/state stable.
9. dirty Plan target at start -> `DELIVERY_TARGET_CONFLICT`.
10. new non-Plan write -> `DELIVERY_SCOPE_DRIFT`; governance tooling mutation -> hard block.
11. all blocking Verification must be fresh PASS and produce durable Evidence Manifest.
12. implementation commit contains only Plan-owned delta + canonical Plan + durable evidence.
13. implementation commit and Roadmap status commit remain separate.
14. continuation/resume state is working memory, not completion truth.
15. one canonical `.plan.md`; no display/metadata duplicate.
16. known blocking claim FAIL cannot be downgraded into observation.
17. LIVE/FAULT/EXTERNAL requires Scenario/Environment/Candidate preflight.
18. evidence reuse is explicit inheritance; no disguised rerun/relabel.
19. live SUT candidate must match current Plan candidate.
20. Test Asset REUSE is immutable; EXTEND/NEW refreshes manifest/proof.
21. `governance_profile: LEAN` may reduce upstream artifact depth but cannot skip any invariant above.
22. Domain preplan/engineering/review/verification providers never own delivery state.

## State machine — unchanged

```text
PLAN_CREATED
-> PLAN_STATIC_VALID
-> PLAN_REVIEW_CLEARED
-> IMPLEMENTING
-> IMPLEMENTATION_COMPLETE
-> COMPLETION_AUDIT_PASS
-> IMPLEMENTATION_REVIEW_PASS
-> VERIFICATION_PASS
-> IMPLEMENTED_AND_PROVEN
-> IMPLEMENTATION_COMMITTED
-> ROADMAP_DONE
```

Blocking states include PLAN_REVISE_REQUIRED, RETURN_PRD, IMPLEMENTATION_BLOCKED,
COMPLETION_AUDIT_BLOCKED, REVIEW_BLOCKED, VERIFICATION_BLOCKED and ROADMAP_UPDATE_BLOCKED.

## Phase 0 — identity / recovery

Resolve exactly one Plan and initialize/resume delivery. New authoring target is
`smc.plan.v3.7`; v3.3-v3.6 remain readable for existing work. Do not bulk migrate in-flight Plans.

## Phase 1 — static gate

```bash
python .agents/skills/smc-plan-validator/scripts/validate_plan_current.py "$PLAN_PATH"
```

Validate profile, Cursor projection, Change/ownership/verification ledgers, acceptance, Domain v2
binding and Test Assets. Tooling crash/incompatibility is a tooling block, never business PASS.

## Phase 2 — semantic gate

Use `smc-plan-review`. External `NOT_REQUIRED|REQUIRED` and actual
`PASS|REVISE|RETURN_PRD` contracts stay stable. Internal NONE/DELTA/FULL cost depth is adaptive.
After clearance, freeze Plan-scoped workspace and initialize `.smc/runs/<plan_id>/` working state.

## Phase 2.5 — Domain policy

Before implementation write:

```bash
python .agents/skills/smc-plan-delivery/scripts/domain_hooks.py validate "$PLAN_PATH"
python .agents/skills/smc-plan-delivery/scripts/domain_hooks.py assert-policy "$PLAN_PATH"
```

Query engineering/review/verification providers generically. `preplan` was consumed before Plan
creation and is not rerun as an implementation owner.

## Phase 3 — execution

Default engine: `executing-plans`; use `subagent-driven-development` only when write ownership and
DAG allow it.

For each Todo:

1. mark `in_progress` through controller;
2. create/reuse content-bound Source Context Capsules;
3. classify Engineering Method from structured Plan signals;
4. dispatch minimum task brief, not entire Plan/history;
5. execute TDD/debug policy when required;
6. run focused checks and task review;
7. verify method gates before controller marks Todo completed;
8. assert workspace stability at Todo/resume boundaries.

Engineering files in `.smc/runs/<plan_id>/engineering` are working memory, not Final Evidence.
TDD/debug event v2 binds Plan semantic hash + method epoch. The latest successful execution event
must bind the current owned-source fingerprint or the method gate is stale.

## Source context budget

Use:

```bash
python .agents/skills/smc-plan-delivery/scripts/source_context.py capture "$PLAN_PATH" --path <file> --symbol <symbol> --summary <summary>
python .agents/skills/smc-plan-delivery/scripts/source_context.py get "$PLAN_PATH" --path <file> --symbol <symbol> --json
```

A capsule is reused only while its content SHA matches. This reduces repeated source scans across
Harness workers/reviewers without creating a second source of truth.

## Completion method interlock

A Todo requiring TDD/debug cannot become completed until `tdd-check` / `debug-check` passes for
the current Plan+method epoch. Three failed debug fixes -> `DEBUG_ARCHITECTURE_ESCALATION`.
Out-of-scope root cause -> PLAN_REVISE_REQUIRED; owner/contract/boundary/observable-behavior change
-> RETURN_PRD.

## Phase 4 — Completion Audit

Fresh-context audit checks canonical Plan against actual current implementation, not Todo self-report.
If gaps exist, emit a Residual Gap Packet using `residual_gap.py`; Audit does not edit the Plan.
Return `PLAN_REVISE_REQUIRED`. Only Plan Author may add/revise Todos.

## Phase 5 — Implementation Review

Review the current Plan-owned whole diff plus relevant Domain review providers. Task reviews are
local cost controls; they do not replace this independent whole-implementation review.

## Phase 6 — Final Verification

Run every blocking verification through the evidence wrapper. Domain verification providers select
oracles/entrypoints but GES evidence/freshness owns truth. Reused evidence must be explicitly inherited.

## Phase 7 — Evidence Freshness / Commit / Roadmap

Only fresh PASS evidence against the current candidate allows `IMPLEMENTED_AND_PROVEN`, then the
scoped post-review implementation commit. Roadmap DONE follows in a separate Roadmap commit and
references the real implementation commit/evidence.
