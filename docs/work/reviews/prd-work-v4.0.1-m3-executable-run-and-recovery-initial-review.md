# M3 Executable Run and Recovery — Initial PRD Review

Review scope is RM-04 Stage PRD v1.1.0 (`REVIEW_REQUIRED`). Evidence freshness is `REUSE` against `grounded_commit` `92748e3655d9528700ab31ef683ce126722631eb` and `source_revision` `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-04`; this review does not re-ground the repository. It does not approve a Plan, mark RM-01 DONE, or authorize production-default `skill-first`.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In covers executable lifecycle on existing Skill Run owners: native `run_id` transport, concurrent bounded poll, default `expert-compat`, fixture/focused proof. Out keeps RM-01 DONE, M4 File Platform/Checkpoint B, M5 production default, P1, and Expert removal. Deferring RM-01 live is an explicit product decision, not a silent scope expansion into M5. |
| G2 Existing capability | PASS | The PRD reuses `SkillRunService`, `SkillRunGatewayClient`, contract parser, continuation, Chat queue snapshot, and session materialize. It does not ADD a second lifecycle, Session, or File owner. Hermes Task bridging is classified as a working-tree deviation to REMOVE, not a new production owner. |
| G3 Production ownership | PASS | Main `SkillRunService` remains the only Work lifecycle owner; Gateway only consumes Bundle MCP and `/api/v1/runs/*`; Chat owns immutable queue snapshots; Renderer stays a sanitized projection consumer; Expert keeps HermesTask; File Platform remains out. |
| G4 Classification | PASS | C01/C03/C06 MODIFY existing owners; C02 REMOVE has a Removal Condition and does not rewrite Expert; C04/C05 KEEP. Feature-mode CONFLICT is resolved by restoring the existing store default, not by replacing the store. |
| G5 Contract and security | PASS | Accepted identity is Bundle `run_id` only; `task_id`/Hermes paths fail closed; identities stay unaliased; Renderer cannot receive JWT/URL/raw events; default `expert-compat` blocks `tools/call`; no silent Expert fallback. |
| G6 Behaviour to AC | PASS | AC-01–AC-08 map to start/bind, native run identity, single-active/queue snapshot, concurrent poll, cancel, rehydrate, compact result, and default-off mode. AC-09 makes fixture the M3 proof bar and keeps live env-gated without claiming RM-01 closed. |
| G7 External contract maturity | PASS | v1.2.1 Bundle and fixtures already define `run_id` and `/api/v1/runs/*`. Incomplete live proof is isolated to deferred RM-01; it does not BLOCK C01–C06 authoring. |
| G8 Cross-repo ownership | PASS | Provider remains external; Work only consumes the in-repo Bundle. The PRD forbids promoting Hermes Task URLs to Skill Run contract and forbids reading Provider source. |
| G9 Change traceability | PASS | C01/C02 implement parent `tool_name → run_id` without completing Expert removal (parent C04). C06 preserves parent compatibility mode split. C03 tightens parent “poll fallback” so an open SSE cannot hide a terminal snapshot. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | Parent architecture still describes live/idempotency proof before production start. This Stage PRD and Roadmap defer RM-01 live by product decision, keep default `expert-compat`, and refuse RM-01 DONE. That is a delivery-order exception, not a change to Production Owner or wire identity. |
| N2 | NOTE | Current Inventory labels “RM-01 live proof” as `KEEP deferred`. That is a scheduling state, not a current-capability class. It does not create a second owner. |
| N3 | NOTE | G5 forbids internal routing fields on the public accepted DTO, but no AC names those fields. AC-02 fail-closed on missing `run_id` plus sanitized projection is sufficient if Gateway never copies `agent_*`/`profile_id` into Work DTO. |
| N4 | NOTE | C02 removes an uncommitted Hermes Task bridge, not a committed HEAD path. The freeze is still required so that deviation cannot land as Skill Run SoT. |
| N5 | NOTE | Artifact list envelope shape (`items` vs `artifacts`) stays with RM-05. M3 may discover empty artifact lists without claiming File Platform complete. |

PASS -> `smc-prd-converge`. This review does not modify the PRD and does not create a git commit.
