# M6c Skill Run Approval Decision — Semantic Plan Review

Review scope is canonical Plan `.cursor/plans/work-v4.0.1-m6-approval-decision.plan.md` (`plan_id: RM-09`). Router result was `REQUIRED` (`INTEGRATION_HOTSPOT`). The Plan also declares `acceptance_contract: smc.acceptance.v1`, so Actual Semantic Review is mandatory even if the router had been `NOT_REQUIRED`. This review does not re-open the APPROVED Stage PRD, does not mark RM-09 DONE, and does not authorize RM-11 Attachment, Chat reuse, or Bundle edits.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Grounding | PASS | Gateway `SkillRunGatewayClient` has catalog/call/snapshot/SSE/cancel/artifacts and forwards `idempotencyKey` through `authorizedFetch`; no `/decision` POST. Parser already maps `approval.requested` to `waiting-approval` + `approvalId`/`summary`. StatusBar tests still assert no Approve/Deny. Consumer lock `REQUIRED_BUNDLE_PATHS` omits approval schemas; first-complete finder can open on v1.2.1. Start uses `clientRequestId` as `tools/call` key. Chat `MessageRow` still owns Local approve/deny. |
| Ponytail | PASS | C01–C05 are MODIFY_EXISTING on Gateway, lock helper, service, one IPC name, and StatusBar. C06–C08 KEEP parser mapping, Chat, and Bundle bytes. No second HTTP client, no legacy path, no comment UI, no Attachment IPC, no Chat.tsx edit. |
| Single writer | PASS | T1 owns Gateway `decideApproval` / `hasApprovalDecisionBundle` and the v1.3.0-only lock helper. T2 owns service bind, `decidedApprovalId`, DECIDE_APPROVAL IPC/preload/DTO. T3 owns StatusBar/i18n/lat.md and depends on T2. Shared `skill-run.ts` is T2-only. Sequential Depends On matches the hotspot. |
| Coverage | PASS | AC-01 StatusBar gate. AC-02 canonical `/decision` + non-terminal receipt. AC-03 deny follows Public status; Cancel stays cancel. AC-04 Main UUID key per approval. AC-05 fail-closed without waiting/approvalId/v1.3.0. AC-06 Chat/Bundle isolation greps. AC-07 `RUN_ALREADY_ACTIVE`. DOD-01 focused suites. DOD-02/03 Roadmap not DONE and out-of-scope greps. |
| Lifecycle / boundary | PASS | Allow/deny share `decideApproval`; non-terminal receipt keeps waiting-approval and sets `decidedApprovalId`. Terminal receipt uses existing `parseSkillRunStatusToPhase` with no deny→cancelled special case. Ineligible paths emit zero HTTP. Renderer cannot supply `approvalId` or the idempotency key. |
| Verification | PASS | V01–V05 are LOCAL unit commands on existing focused files. V06/V09/V10 are document greps that freeze Chat isolation, `/decision`, no upload channel, attachments unsupported, and RM-09 not DONE. Live Scenario / Environment matrices are empty; no V07/V08. CLM-01 TARGETED_RERUN of the RM-08 no-button assertion is justified. |
| Scope | PASS | Out still forbids Attachment, v1.2.1/v1.3.0 SHA256 files, legacy POST, comment, clarify respond, Chat handlers, and Hermes `approval.respond`. INTEGRATION_HOTSPOT is shared DTO/service/Gateway files, not a new owner. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | `hasSkillRunApprovalDecisionBundle()` must check `contracts/skill-run/v1.3.0` only. Do not add approval schemas to `REQUIRED_BUNDLE_PATHS` and do not change first-complete `findSkillRunConsumerLockDir`. |
| N2 | NOTE | Decision idempotency key is a Main UUID on `ActiveRun`, not `clientRequestId` / start `tools/call` key, and must not appear on `SkillRunProjection`. |
| N3 | NOTE | `createMockGateway` and IPC channel exact-key assertions will need T2 updates. Do not invent a second mock factory. |
| N4 | NOTE | StatusBar Allow/Deny must call `skillRun.decideApproval`. Deny must not call `onCancel`. Chat.tsx stays unmodified. |
| N5 | NOTE | V10 requires RM-09 status is not DONE in the implementation tree. Roadmap DONE is a later separate commit. |

PASS -> `smc-plan-delivery`. This review does not modify the Plan and does not create a git commit.
