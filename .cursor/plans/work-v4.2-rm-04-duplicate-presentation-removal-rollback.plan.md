---
name: Work v4.2 RM-04 Duplicate Presentation Removal
overview: Remove the Skill Run transcript card and compact activity-history duplicate, keep Native rows plus compact controls, and prove presentation rollback is non-destructive.
todos:
  - id: t1-remove-skill-run-card
    content: "T1 — Remove Skill Run card union from the transcript and history path [C01]"
    status: completed
  - id: t2-compact-controls-without-activity-list
    content: "T2 — Keep compact controls without duplicate activity history [C02, C03]"
    status: completed
  - id: t3-presentation-rollback-non-destructive
    content: "T3 — Prove presentation rollback is non-destructive [C04]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: WORK-v4.2-RM-04-duplicate-presentation-removal-rollback
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER@1.0.1/RM-04
grounded_commit: d33001386df61faa0442d5d49181a8e11810e2f4
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# Work v4.2 RM-04 Duplicate Presentation Removal Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.2-RM-04-duplicate-presentation-removal-rollback.md)

## Scope

- In: remove `SkillRunMessage`, the `skill_run` MessageList branch, `SkillRunTranscriptCard`, and history mapping that can revive a card; stop Main incomplete/continuation merge from emitting `skill_run` history items; drop the compact status-bar activity list; keep approval/cancel/phase/error/artifact-retry; prove feature-mode rollback/re-enable does not delete or rewrite Session classification, Skill audit/continuation, or File Platform identity.
- Out: Main Skill Run execution/sanitization/audit writers, original Chat execution, public Provider contract, a second MessageList/transcript store, Renderer-to-Main writers, Expert/HermesTask paths, and non-English locale edits.
- Production Owner inherited from PRD: Renderer Chat/skill-run presentation owns card removal; `SkillRunStatusBar` owns compact controls; existing feature-mode and Main durable stores remain rollback owners.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx#SkillRunTranscriptCard` | Card component, SkillRunMessage union, MessageList skill_run branch, sessionHistory skill_run mapping, and Main toSkillRunHistoryItem still exist. RM-03 live adapter already emits Native rows; incomplete reopen still appends a card. | MessageList imports the card; dbItemsToChatMessages maps Main skill_run items; mergeSkillRunTranscriptIntoHistory appends incomplete/continuation cards. | rejectSkillRunCard still patches a card when one is present; remote-sessions historyItemSearchText still switches on skill_run. | Reuse RM-03 Native identities and expandCompleteSkillRun; do not add a second list or mapper. | PASS |
| C02 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#activityCopy` | Compact bar renders a second activity `<ul>` from `projection.activities` under the phase row. | `activityCopy` plus the `aria-label` activity list are the only history UI in this file. | Tests currently assert reasoning/tool/clarify/approval copy in that list. | Keep `currentApproval` scan of the same array for Allow/Deny; do not move history into MessageList. | PASS |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | Allow/Deny, cancel, phase/error, and artifact retry already call existing IPC. | `handleDecide` → `skillRun.decideApproval`; `handleCancel`; `handleRetryDiscovery` → `skillRun.retryArtifactDiscovery`. | `Chat.tsx` already mounts `SkillRunStatusBar` outside the transcript rows. | No new control surface or clarify/artifact transcript semantics. | PASS |
| C04 | `apps/work/src/main/skill-run/feature-mode-store.ts#setSkillRunFeatureMode` | Feature mode persist/env rollback already rejects new `start` with `START_DISABLED_FEATURE_MODE` and does not delete stores. | `getSkillRunFeatureMode` / `setSkillRunFeatureMode`; `skill-run-service.ts` start gate; `lat.md` already says readers/rehydration are not disposed. | `session-metadata-store.ts` and transcript/file deletes live on session-delete paths, not mode toggle. | Extend existing mode and metadata tests; do not add a rollback writer. | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | [C01] A live, reopened, or restarted Skill Run renders only through Native `ChatMessage → MessageList` rows; no `SkillRunMessage`, `skill_run` MessageList branch, or `SkillRunTranscriptCard` is reachable from the normal transcript/history path. | BEHAVIOR | C01 | T1 | V01 | INTEGRATION | yes |
| AC-02 | AC | [C01/C05] Original Chat and RM-03 Native Skill Run prompt/reasoning/tool/read-only notice/result ordering and stable identities remain unchanged; no second MessageList, transcript store, or presentation adapter is introduced. | SCOPE | C01,C05 | T1 | V01,V04 | INTEGRATION | yes |
| AC-03 | AC | [C02/C03] During an active Skill Run, current phase/error, approval allow/deny, cancel, and artifact retry remain reachable through the compact control surface, while reasoning/tool/clarify/approval activity is not repeated there as a second history list. | BEHAVIOR | C02,C03 | T2 | V02 | INTEGRATION | yes |
| AC-04 | AC | [C03] Compact controls preserve their existing safe action boundaries and do not fabricate Local Chat clarify semantics, raw Provider data, or transcript-owned artifact data. | SECURITY | C03 | T2 | V02 | UNIT | yes |
| AC-05 | AC | [C04] Feature rollback/re-enable preserves classified Session rows, accepted Skill Run audit/continuation, and ManagedFile/Session Files identity without deletion, downgrade, cache/classification rewrite, or destructive re-backfill. | LIFECYCLE | C04 | T3 | V03 | INTEGRATION | yes |
| AC-06 | AC | [C05/C06] Main execution/audit/continuation and File Platform remain their current owners; Renderer receives no raw SSE/JWT/endpoint/payload and adds no write channel, Expert/HermesTask path, third mode, registry, or migration branch. | SECURITY | C05,C06 | T1,T2 | V05 | DIFF_SCOPE | yes |
| DOD-01 | DOD | Focused renderer/history tests prove the removed card/union/branch cannot reappear for live, reopen, or restart, while RM-03 Native rows retain ordering and identity. | EVIDENCE | C01 | T1 | V01 | INTEGRATION | yes |
| DOD-02 | DOD | Focused compact-control tests prove approval, cancel, phase/error, and artifact retry remain reachable and activity history is not duplicated. | EVIDENCE | C02,C03 | T2 | V02 | INTEGRATION | yes |
| DOD-03 | DOD | Rollback/re-enable tests prove durable classification, audit/continuation, cache and File Platform identities are non-destructive and reusable. | EVIDENCE | C04 | T3 | V03 | INTEGRATION | yes |
| DOD-04 | DOD | Existing Main Skill Run, Session, File Platform, and original Chat coverage remains passing with no new public Provider/IPC contract or Renderer writer. | SCOPE | C05 | T1,T3 | V04 | INTEGRATION | yes |
| DOD-05 | DOD | All blocking claims have fresh recorded evidence before RM-04 is marked DONE. | EVIDENCE | C01,C02,C03,C04,C06 | T1,T2,T3 | V01,V02,V03,V04,V05 | INTEGRATION | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Live/reopen Native-only transcript | AC-01,AC-02,DOD-01 | Live projection sync, `getSessionMessages`, restart history load. | Incomplete sidecar no longer becomes a `skill_run` card; Native user/assistant anchors remain. | RM-03 `applySkillRunProjectionsToMessages` and `expandCompleteSkillRun` remain the Native success writers. | `rejectSkillRunCard` patches the Native assistant only; incomplete/continuation history keeps Native assistant error/pending, never a card. | V01 |
| Compact control without history list | AC-03,AC-04,DOD-02 | Active projection with phase/approval/cancel/retry. | `waiting-approval` / running; Allow/Deny derived from latest `approval.requested`. | Existing `decideApproval` / `retryArtifactDiscovery` IPC. | Cancel uses existing `skillRun.cancel`; no ClarifyCard/MessageList control branch. | V02 |
| Feature rollback / re-enable | AC-05,DOD-03 | `setSkillRunFeatureMode` or `SMC_WORK_SKILL_RUN_MODE` to `expert-compat`/`local-only`, then back to `skill-first`. | New `start` rejected with `START_DISABLED_FEATURE_MODE`. | Mode store writes only `skill-run-feature-mode.json`. | No session-metadata, transcript, cache, or ManagedFile delete/rewrite on mode toggle; rehydrate/readers remain. | V03 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Transcript/history Native-only | AC-01,AC-02 | Main sanitized sidecar + RM-03 Native expansion. | Existing `getSessionMessages` HistoryItem (user/assistant/reasoning/tool_call) plus live `SkillRunProjection`. | `dbItemsToChatMessages` then `MessageList`; live `applySkillRunProjectionsToMessages`. | `clientRequestId`, `platformMessageId` Native ids, `eventId`/`callId`/`ordinal`. | Renderer mapper + Native adapter. | Incomplete/missing audit → Native assistant pending/error; omit `skill_run` union. | `clientRequestId` turn identity. | V01 |
| Compact control actions | AC-03,AC-04 | Existing Skill Run projection (phase, error, activities for approvalId only). | Existing preload IPC `decideApproval` / `cancel` / `retryArtifactDiscovery`. | `SkillRunStatusBar` phase row and buttons only. | `clientRequestId`, `sessionId`, `approvalId`, `artifactDiscoveryError`. | Existing Main IPC owners. | No clarify respond; no artifact bytes in transcript. | Existing approval/cancel idempotency. | V02 |
| Presentation rollback | AC-05,AC-06 | Feature mode env/file. | `skill-run-feature-mode.json` / `SMC_WORK_SKILL_RUN_MODE`. | `SkillRunService.start` gate; existing rehydrate/readers. | `mode` in `{skill-first,expert-compat,local-only}`. | Main feature-mode store. | Disabled start; no durable delete. | Same Session/run/file identities on re-enable. | V03 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | Normal transcript/history cannot create a legacy card. | yes | RM-03 Native projection delivery evidence. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Legacy union/branches still exist. | V01 |
| CLM-02 | AC-02 | Native Chat and Skill Run presentation stays singular and ordered. | yes | RM-03 delivery evidence. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Removing legacy variants changes union/history routing. | V01,V04 |
| CLM-03 | AC-03 | Compact controls survive while activity list is absent. | yes | Existing status-bar tests. | RESIDUAL_GAP | NEW_EVIDENCE | Control/history separation is new. | V02 |
| CLM-04 | AC-04 | Compact controls keep existing IPC boundaries and no clarify/artifact fabrication. | yes | Existing status-bar IPC tests. | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Activity-list removal must not take Allow/Deny/cancel/retry with it. | V02 |
| CLM-05 | AC-05 | Rollback/re-enable is presentation-only and non-destructive. | yes | RM-01/RM-02 durable identity evidence plus feature-mode start gate. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | RM-04 removes presentation code. | V03 |
| CLM-06 | AC-06 | Closed owner/trust/two-mode boundaries remain intact. | yes | APPROVED AD and RM-03 evidence. | PROVEN_REQUIREMENT | NEW_EVIDENCE | Final removal must prove no replacement owner/branch appears. | V05 |
| CLM-07 | DOD-01 | Focused renderer/history tests prove the card cannot reappear. | yes | RM-03 still keeps rollback card tests. | RESIDUAL_GAP | TARGETED_RERUN | Card path must be deleted, not just unused. | V01 |
| CLM-08 | DOD-02 | Focused compact-control tests prove controls without activity history. | yes | Status-bar tests currently require the activity list. | RESIDUAL_GAP | NEW_EVIDENCE | Assertions invert from list-present to list-absent. | V02 |
| CLM-09 | DOD-03 | Rollback tests prove durable identities survive mode toggle. | yes | Feature-mode start-disabled tests do not assert metadata/file survival. | RESIDUAL_GAP | TARGETED_RERUN | Need explicit non-delete proof. | V03 |
| CLM-10 | DOD-04 | Existing Main/Chat/File regressions pass without a new public contract. | yes | RM-03 targeted rerun suite. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Union/history/status-bar consumers change. | V04 |
| CLM-11 | DOD-05 | Every blocking RM-04 claim is fresh. | yes | No RM-04 manifest. | NOT_TESTED | NEW_EVIDENCE | New completion proof. | V05 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01,CLM-02,CLM-07 | INTEGRATION | LOCAL | `npm exec vitest -- run src/renderer/src/modules/skill-run/skill-run-transcript.test.ts src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx src/renderer/src/screens/Chat/sessionHistory.test.ts src/main/sessions-skill-run-history.test.ts --pool=threads --maxWorkers=1` | Live/reopen/restart Skill Run rows are Native-only; no `skill_run` card/union mapping. | Incomplete audit does not revive a card; distinct runs stay distinct Native turns. | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V02 | CLM-03,CLM-04,CLM-08 | UNIT | LOCAL | `npm exec vitest -- run src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx --pool=threads --maxWorkers=1` | Phase/error, Allow/Deny, cancel, and artifact retry remain; activity-history list is absent. | No ClarifyCard/MessageRow/respondClarify; no activity list label. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V03 | CLM-05,CLM-09 | INTEGRATION | LOCAL | `npm exec vitest -- run src/main/skill-run/feature-mode-store.test.ts src/main/session-metadata-store.test.ts src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-transcript-store.test.ts --pool=threads --maxWorkers=1` | Mode rollback rejects new start and does not delete classification/audit identities. | `expert-compat`/`local-only` never fall back to Expert start; re-enable reuses the same stores. | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V04 | CLM-02,CLM-10 | INTEGRATION | LOCAL | `npm exec vitest -- run src/renderer/src/modules/skill-run/skill-run-transcript.test.ts src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-transcript-store.test.ts src/main/skill-run/skill-run-session-materialize.test.ts src/renderer/src/screens/Chat/sessionHistory.test.ts src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx --pool=threads --maxWorkers=1` | Native identities, Main execution/sidecar, Chat history, and compact controls pass without a Renderer write. | Forbidden fields stay absent; no new IPC/Provider contract. | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V05 | CLM-06,CLM-11 | REGRESSION | LOCAL | `npm run guard` | Work guards keep renderer/cache/i18n/contract boundaries. | No non-English locale, renderer HTTP/write, or forbidden contract path. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx#SkillRunTranscriptCard`
- `apps/work/src/renderer/src/screens/Chat/types.ts#SkillRunMessage`
- `apps/work/src/renderer/src/screens/Chat/MessageList.tsx`
- `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#dbItemsToChatMessages`
- `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory`
- `apps/work/src/main/sessions.ts#toSkillRunHistoryItem`
- `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#rejectSkillRunCard`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx`
- `apps/work/src/main/skill-run/feature-mode-store.ts#setSkillRunFeatureMode`
- `apps/work/lat.md/skill-run.md`

## Triggered Read

- If `DbHistoryItem` user/assistant omit `platformMessageId`, extend that renderer type from Main `HistoryItem` and use it as `ChatMessage.id` when present so live projection can match reopen Native rows; do not add a second mapper.
- If a continuation/incomplete run has no Native anchors, emit a Native assistant pending/error bubble, not a card.
- If `remote-sessions.ts#historyItemSearchText` exhaustive switch fails after `HistoryItem.kind skill_run` removal, update only that switch.
- If Allow/Deny still needs `approval.requested` after the list is removed, keep scanning `projection.activities` without rendering it.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Chat/types.ts#SkillRunMessage` | PROD | REMOVE | Renderer Chat types | T1 | Drop `SkillRunMessage` from the `ChatMessage` union | normal transcript | no |
| C01 | `apps/work/src/renderer/src/screens/Chat/MessageList.tsx` | PROD | REMOVE | Native MessageList | T1 | Remove `kind === "skill_run"` branch and card import | normal transcript | no |
| C01 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx#SkillRunTranscriptCard` | PROD | REMOVE | Skill Run card | T1 | Delete the duplicate transcript card | normal transcript | no |
| C01 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx` | TEST | REMOVE | Card tests | T1 | Delete card-only tests with the component | C01 proof | no |
| C01 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#projectionToSkillRunMessage` | PROD | REMOVE | Renderer Skill Run adapter | T1 | Remove card constructors/upsert/patch helpers | Native-only adapter | no |
| C01 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#upsertSkillRunCard` | PROD | REMOVE | Renderer Skill Run adapter | T1 | Remove card upsert | Native-only adapter | no |
| C01 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#patchSkillRunCard` | PROD | REMOVE | Renderer Skill Run adapter | T1 | Remove card patch | Native-only adapter | no |
| C01 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#rejectSkillRunCard` | PROD | MODIFY | Renderer Skill Run adapter | T1 | Failure writer patches Native assistant only | Native-only adapter | no |
| C01 | `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#dbItemsToChatMessages` | PROD | MODIFY | Renderer session-history mapper | T1 | Map Native history only; never emit `SkillRunMessage` | reopen history | no |
| C01 | `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#reconciliationKey` | PROD | REMOVE | Renderer session-history mapper | T1 | Remove `skill_run` match-key arm | reopen history | no |
| C01 | `apps/work/src/main/sessions.ts#HistoryItem` | PROD | REMOVE | Sessions history reader | T1 | Drop `kind: "skill_run"` from the renderer-facing union | reopen history | no |
| C01 | `apps/work/src/main/sessions.ts#toSkillRunHistoryItem` | PROD | REMOVE | Sessions history reader | T1 | Remove incomplete-run card DTO | reopen history | no |
| C01 | `apps/work/src/main/sessions.ts#continuationRunToHistoryItem` | PROD | REMOVE | Sessions history reader | T1 | Remove continuation card DTO | reopen history | no |
| C01 | `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory` | PROD | REPLACE | Sessions history reader | T1 | Incomplete/continuation stay Native anchors/assistant error; no card append | reopen history | no |
| C01 | `apps/work/src/main/remote-sessions.ts#historyItemSearchText` | PROD | REMOVE | Remote session search | T1 | Drop `skill_run` search arm with the union member | history search | no |
| C01 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.test.ts` | TEST | MODIFY | Existing adapter tests | T1 | Prove no card on live/reject; Native identities remain | C01 proof | no |
| C01 | `apps/work/src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx` | TEST | MODIFY | Existing Chat Skill Run tests | T1 | Normal path has zero cards | C01 proof | no |
| C01 | `apps/work/src/renderer/src/screens/Chat/sessionHistory.test.ts` | TEST | MODIFY | Existing history mapping tests | T1 | Sidecar/history mapping is Native-only | C01 proof | no |
| C01 | `apps/work/src/main/sessions-skill-run-history.test.ts` | TEST | MODIFY | Existing merge tests | T1 | Incomplete/continuation do not emit `skill_run` | C01 proof | no |
| C01 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | Existing Skill Run record | T1 | Card is removed; Native rows are the sole transcript | architecture record | no |
| C02 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#activityCopy` | PROD | REMOVE | Compact Skill Run controls | T2 | Remove activity-history copy helper | compact controls | no |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | PROD | MODIFY | Compact Skill Run controls | T2 | Remove the activity `<ul>`; keep phase/error, Allow/Deny, cancel, artifact retry | compact controls | no |
| C02 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx` | TEST | MODIFY | Existing status-bar tests | T2 | Prove controls remain and activity list is gone | C02-C03 proof | no |
| C04 | `apps/work/src/main/skill-run/feature-mode-store.ts#setSkillRunFeatureMode` | PROD | KEEP | Feature mode store | - | Mode persist remains presentation/start gate only | rollback | no |
| C04 | `apps/work/src/main/session-metadata-store.ts` | PROD | KEEP | Session metadata | - | Classification is not rewritten on mode toggle | rollback | no |
| C04 | `apps/work/src/main/skill-run/skill-run-transcript-store.ts` | PROD | KEEP | Skill Run audit sidecar | - | Audit/continuation survive rollback | rollback | no |
| C04 | `apps/work/src/main/skill-run/feature-mode-store.test.ts` | TEST | MODIFY | Existing mode tests | T3 | Prove set-mode does not delete durable identities | C04 proof | no |
| C04 | `apps/work/src/main/session-metadata-store.test.ts` | TEST | MODIFY | Existing metadata tests | T3 | Accepted classification remains after rollback | C04 proof | no |
| C04 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | Existing service tests | T3 | Disabled start still does not delete sidecar/metadata | C04 proof | no |
| C05 | `apps/work/src/main/skill-run/skill-run-service.ts` | PROD | KEEP | Skill Run execution | - | Execution/sanitization/audit writers unchanged | preserve owners | no |
| C05 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | PROD | KEEP | Chat Skill Run host | - | StatusBar mount and Native adapter consumption unchanged | preserve Chat | no |
| C06 | `apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.ts` | PROD | KEEP | Expert default entry | - | No Expert/HermesTask/registry/migration branch | closed two-mode | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | REMOVE_ONLY | Duplicate presentation remains in the union, MessageList branch, card component, history mapper, and incomplete Main merge even though RM-03 live path is Native. | Delete the card path at those owners; reuse Native expansion/adapter instead of a compatibility mapper. |
| C02 | REMOVE_ONLY | `SkillRunStatusBar` activity `<ul>` is a second history of the same sanitized activities already shown as Native rows. | Remove the list and `activityCopy`; keep scanning activities only for current approval. |
| C03 | MODIFY_EXISTING | Compact Allow/Deny/cancel/retry already exist on the same component. | Do not invent a new control surface or move actions into transcript rows. |
| C04 | MODIFY_EXISTING | `setSkillRunFeatureMode` already writes only the mode file; start-disabled already exists. | Prove non-delete with existing test files; do not add a rollback/migration writer. |
| C06 | REUSE_EXISTING | Closed two-mode architecture and Expert default-entry gating already exist. | No new branch, registry, or compatibility path. |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/src/renderer/src/screens/Chat/types.ts#SkillRunMessage`; `apps/work/src/renderer/src/screens/Chat/MessageList.tsx`; `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx#SkillRunTranscriptCard`; `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx`; `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#projectionToSkillRunMessage`; `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#upsertSkillRunCard`; `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#patchSkillRunCard`; `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#rejectSkillRunCard`; `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#dbItemsToChatMessages`; `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#reconciliationKey`; `apps/work/src/main/sessions.ts#HistoryItem`; `apps/work/src/main/sessions.ts#toSkillRunHistoryItem`; `apps/work/src/main/sessions.ts#continuationRunToHistoryItem`; `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory`; `apps/work/src/main/remote-sessions.ts#historyItemSearchText`; `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.test.ts`; `apps/work/src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx`; `apps/work/src/renderer/src/screens/Chat/sessionHistory.test.ts`; `apps/work/src/main/sessions-skill-run-history.test.ts`; `apps/work/lat.md/skill-run.md` | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#skillRunTranscriptBubbleIds`; existing Native row helpers | - | no |
| T2 | C02,C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#activityCopy`; `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx`; `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx` | Existing `SkillRunProjection` activities for current approval only | - | no |
| T3 | C04 | `apps/work/src/main/skill-run/feature-mode-store.test.ts`; `apps/work/src/main/session-metadata-store.test.ts`; `apps/work/src/main/skill-run/skill-run-service.test.ts` | `apps/work/src/main/skill-run/feature-mode-store.ts#setSkillRunFeatureMode`; `apps/work/src/main/session-metadata-store.ts`; `apps/work/src/main/skill-run/skill-run-transcript-store.ts` | - | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts` | T1 | Card helpers and Native reject/live mapping share one adapter; removal must not reintroduce a card. |
| `apps/work/src/main/sessions.ts` | T1 | Incomplete merge is the last Main producer of `skill_run` history items. |
| `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts` | T1 | History mapping is the last Renderer producer of `SkillRunMessage`. |
| `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | T2 | Control reachability and activity-list removal share one component. |

## Generated Outputs Ledger

None. RM-04 changes handwritten TypeScript, focused tests, and the Skill Run architecture record.

## Todo T1 — Remove Skill Run card union from the transcript and history path

**Owns Changes**
- C01

**Goal**
Make Native `ChatMessage → MessageList` the only Skill Run transcript/history presentation for live, reopen, and restart.

**Immediate anchors**
- `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx#SkillRunTranscriptCard`
- `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory`
- `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#dbItemsToChatMessages`

**Changes**
- Remove `SkillRunMessage`, the MessageList card branch, `SkillRunTranscriptCard`, and card constructor/upsert/patch helpers.
- Replace incomplete/continuation `skill_run` history items with Native anchors or Native assistant pending/error; remove `toSkillRunHistoryItem` / `continuationRunToHistoryItem`.
- Map reopen history through Native kinds only; prefer existing `platformMessageId` as `ChatMessage.id` when present so live projection can match.
- `rejectSkillRunCard` patches the Native assistant only.
- Update English Skill Run architecture record; delete card-only tests.

**Stop conditions**
- [ ] No production `kind: "skill_run"` remains on the Chat transcript/history path.
- [ ] Live, reopen, and restart tests render Native rows only.
- [ ] Incomplete audit does not revive a card.
- [ ] No Expert/HermesTask, second list, or new IPC is added.

**Triggered reads**
- Only `platformMessageId` typing, continuation-without-anchors, and `remote-sessions` search under the documented triggers.

## Todo T2 — Keep compact controls without duplicate activity history

**Owns Changes**
- C02
- C03

**Goal**
Keep current phase/error, approval, cancel, and artifact retry on `SkillRunStatusBar` without repeating Native transcript activity.

**Immediate anchors**
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx`

**Changes**
- Remove `activityCopy` and the activity `<ul>`.
- Keep Allow/Deny from the latest unread `approval.requested`, plus cancel and artifact retry on existing IPC.
- Invert tests: activity-history copy is absent; controls remain reachable.

**Stop conditions**
- [ ] No activity-list label or reasoning/tool/clarify history rows in the compact surface.
- [ ] Allow/Deny/cancel/artifact retry still fire the existing IPC.
- [ ] No ClarifyCard or transcript-owned artifact payload.

**Triggered reads**
- Approval scan of `projection.activities` only if Allow/Deny would otherwise disappear.

## Todo T3 — Prove presentation rollback is non-destructive

**Owns Changes**
- C04

**Goal**
Prove `expert-compat` / `local-only` rollback and `skill-first` re-enable do not delete or rewrite classified Sessions, Skill audit/continuation, or File Platform identity.

**Immediate anchors**
- `apps/work/src/main/skill-run/feature-mode-store.ts#setSkillRunFeatureMode`
- `apps/work/src/main/session-metadata-store.test.ts`
- `apps/work/src/main/skill-run/skill-run-service.test.ts`

**Changes**
- Extend existing mode/metadata/service tests so mode toggle does not call session/transcript/file deletes and does not change accepted classification.
- Keep proving disabled start (`START_DISABLED_FEATURE_MODE`) never falls back to Expert.
- Do not add a rollback writer, cache rewrite, or re-backfill.

**Stop conditions**
- [ ] `setSkillRunFeatureMode` still only persists mode.
- [ ] Accepted `work/skill-run` metadata and sidecar rows remain after rollback.
- [ ] Re-enable does not require destructive re-backfill.

**Triggered reads**
- Transcript-store delete tests only if a mode-toggle path unexpectedly reaches session delete.

## Verification

Run V01-V05 through `smc-plan-delivery/scripts/evidence.py` in `apps/work`. All blocking modes are LOCAL.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit/review FRESH PASS; V01-V05 FRESH PASS; CLM-01 through CLM-11 PASS; durable manifest FRESH | V01,V02,V03,V04,V05 via SMC evidence ledger and durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof/review/manifest is pending or stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents implementation or proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts with current reality | PRD revision request |
