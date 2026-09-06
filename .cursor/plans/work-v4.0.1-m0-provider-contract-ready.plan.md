---
name: M0 Provider Contract Ready Live Closure
overview: Close RM-01 by proving the already-locked v1.2.1 Bundle plus Work live harness. Add independent-client same-key replay (AC-03) and re-run Catalog→rehydrate (AC-04) against the controlled public backend. Do not change production default (owned by M5).
todos:
  - id: t1-live-same-key-replay
    content: "T1: live AC-03 two independent clients, same X-Idempotency-Key, one Provider run_id"
    status: completed
  - id: t2-live-checkpoint-rehydrate
    content: "T2: live AC-04 Catalog → start → terminal → artifact/empty → rehydrate without second tools/call"
    status: completed
isProject: false
plan_contract: smc.plan.v3.4
plan_id: RM-01
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-01
grounded_commit: 8314e5c7
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M0 Provider Contract Ready — Live Closure Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M0-provider-contract-ready.md)

## Scope

- In: reuse existing Work consumer-lock, Gateway, Skill Run E2E fixture, and env-gated live harness. Add a second live client that replays the same `clientRequestId` / `X-Idempotency-Key`. Capture redacted live evidence.
- Out: production default `skill-first` (M5/RM-06); Expert entry removal (M6); Provider Bundle edits; Approval/Attachment; telemetry dashboard.
- Production Owner inherited from PRD: Provider Owner supplies the controlled public backend; Work `SkillRunGatewayClient` / `SkillRunService` and `skill-run-e2e.test.ts` consume it.

## Requirement Coverage

| Requirement | Obligation | Todo | Blocking |
|---|---|---|---|
| AC-01 / AC-02 | Offline Bundle + CI fixture remain the contract gate | existing lock/e2e fixture | yes |
| AC-03 | Two independent live clients, same key, one `run_id` | T1 | yes |
| AC-04 | Live Catalog → start → terminal → rehydrate, no second `tools/call` | T2 | yes |
| AC-05 | Negatives stay fixture-replayable; live only runs Provider-safe happy/idempotency | existing fixture | yes |
| AC-06 | Evidence has no JWT, Authorization, absolute URL, prompt body, or artifact bytes | T1, T2 | yes |
| AC-07 | This Plan does not flip `DEFAULT_MODE` | T1, T2 | yes |

## Verification

| ID | Command | Expected |
|---|---|---|
| V01 | `npm --prefix apps/work run test:skill-run-e2e` without `SMC_SKILL_RUN_E2E` | fixture PASS; live skipped |
| V02 | same command with `SMC_SKILL_RUN_E2E=1` and live env | fixture + live AC-03 + live AC-04 PASS |

Live env (never committed): `SMC_SKILL_RUN_E2E_BACKEND_URL`, `SMC_SKILL_RUN_E2E_ACCESS_TOKEN`, `SMC_SKILL_RUN_E2E_TOOL_NAME`.
