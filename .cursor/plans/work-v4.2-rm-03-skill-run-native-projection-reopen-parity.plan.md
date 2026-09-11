---
name: Work v4.2 RM-03 Skill Run Native Projection
overview: Project accepted Skill Run turns through existing Native ChatMessage rows with live, reopen, and restart parity, keeping the card rollback-only.
todos:
  - id: t1-sanitized-activity-ordinal
    content: "T1 — Preserve sanitized activity identity and ordinal for Native row order [C03]"
    status: completed
  - id: t2-native-live-projection
    content: "T2 — Project live Skill Run turns onto existing Native ChatMessage rows [C01, C02, C06]"
    status: completed
  - id: t3-anchor-history-expansion
    content: "T3 — Expand reopen and restart history inside accepted Skill Run anchors [C04]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: WORK-v4.2-RM-03-skill-run-native-projection-reopen-parity
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER@1.0.1/RM-03
grounded_commit: f62df916dc66726ba735a9663562a3ae18ee502d
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# Work v4.2 RM-03 Skill Run Native Projection Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.2-RM-03-skill-run-native-projection-reopen-parity.md)

## Scope

- In: map sanitized Skill Run prompt/activity/result onto existing Native `ChatMessage → MessageList` rows; carry durable activity ordinal across the live projection; expand reopen/restart history inside accepted `clientRequestId` anchors; keep `SkillRunTranscriptCard` only for incomplete/rollback; prove compact controls and File Platform identity unchanged.
- Out: original Chat execution, public Provider contract, Hermes Chat `tool_calls` fabrication, a second MessageList/transcript store, Renderer-to-Main execution writes, RM-04 card removal, Expert/HermesTask paths, and non-English locale edits.
- Production Owner inherited from PRD: Main owns sanitization/sidecar/history expansion; the existing Renderer Skill Run transcript adapter owns Native live mapping; `MessageList` remains the Native renderer.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#applySkillRunProjectionsToMessages` | Upserts one request-keyed `skill_run` card from the sanitized projection. | `Chat.tsx` live subscription and optimistic submit already call this adapter. | `MessageList` already renders `reasoning`, `tool_call`, and bubble rows. | `compactSkillRunActivities` already dedupes `eventId` and patches `callId` in place. | PASS |
| C02 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#createOptimisticSkillRunTurn` | Optimistic turn is `[user, skill_run card]`. | `Chat.tsx#submitSkill` inserts that pair before `skillRun.start`. | `MessageList` still delegates `kind === "skill_run"` to `SkillRunTranscriptCard`. | Keep the card branch as rollback-only; do not add a second list. | PASS |
| C03 | `apps/work/src/shared/skill-run.ts#SkillRunActivityItem` | Renderer-safe activity has `eventId` but no durable ordinal. | Sidecar `StoredActivity` and `SkillRunDurableActivityRecord` already persist `ordinal`. | `persistActivityBeforeCap` assigns ordinal then `appendSanitizedActivity` copies the item without it. | Extend the existing sanitized item; no new IPC/Provider contract. | PASS |
| C04 | `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory` | Suppresses the materializer assistant bubble, appends a detached `skill_run` item, and globally sorts by timestamp. | `sessions-skill-run-history.test.ts` covers the current merge. | `skillRunTranscriptBubbleIds` already identifies accepted user/assistant anchors. | Expand sidecar rows inside those anchors; stop timestamp-sorting provider activity. | PASS |
| C06 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts` | Adapter is Skill Run-only; Expert cancel remains a separate Chat path. | First Native Skill Run consumer. | Closed two-mode architecture. | Exact Skill Run mapping; no registry/third-mode branch. | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | [C01/C02] For an accepted Skill Run, the normal transcript renders through Native `ChatMessage → MessageList` rows in this order: durable user prompt, zero or more sanitized reasoning/tool/read-only lifecycle rows in stable provider order, then the assistant result or terminal failure. It does not render a `SkillRunTranscriptCard` alongside those rows. | BEHAVIOR | C01,C02 | T2 | V01 | INTEGRATION | yes |
| AC-02 | AC | [C01/C03] A reasoning or lifecycle row is deduplicated by stable run/event identity; one tool row is deduplicated by `clientRequestId + callId` and updates in place across `started → completed/failed`. The presentation never fabricates Hermes Chat tool arguments, tool results, or interactive Local Chat clarify handling from Skill Run activity. | LIFECYCLE | C01,C03 | T1,T2 | V03 | UNIT | yes |
| AC-03 | AC | [C01/C03] Assistant text is ordered by `messageId + deltaSeq`; a matching terminal snapshot is authoritative, and duplicate/out-of-order/later deltas cannot duplicate or overwrite the terminal Native assistant row. | LIFECYCLE | C01,C03 | T1,T2 | V03 | INTEGRATION | yes |
| AC-04 | AC | [C03/C04] Live subscription, session reopen, and application restart produce the same ordered Skill Run representation for complete durable activity, located inside its accepted `clientRequestId` turn. Global timestamp sorting is not used to infer turn membership or provider activity order. | LIFECYCLE | C03,C04 | T1,T3 | V02 | INTEGRATION | yes |
| AC-05 | AC | [C04] Prompt-before-execution-before-result holds when adjacent original Chat turns have equal, reversed, or otherwise non-monotonic timestamps; separate Skill Runs with the same tool name or activity text remain separate turns. | LIFECYCLE | C04 | T3 | V02 | INTEGRATION | yes |
| AC-06 | AC | [C05] Existing original Chat rows, Main Skill Run execution/audit/continuation truth, compact approval/cancel/phase/artifact-retry controls, and File Platform ManagedFile/Session Files identity preserve their current owners and observable behavior. | SCOPE | C05 | T2,T3 | V03 | INTEGRATION | yes |
| AC-07 | AC | [C03/C05] The Renderer receives only existing or minimally extended sanitized projection facts. No raw Provider SSE/JWT/endpoint/raw payload/remote artifact location enters the transcript, and no Renderer-to-Main execution, audit, or classification write is introduced. | SECURITY | C03,C05 | T1,T2 | V03 | INTEGRATION | yes |
| AC-08 | AC | [C02/C06] The normal feature path contains exactly original Chat and new Skill Run presentation adapters. It introduces no Expert/HermesTask recognition, compatibility/migration/backfill, third Provider/session class, generic registry, or second MessageList/transcript store. | SECURITY | C02,C06 | T2 | V01,V04 | DIFF_SCOPE | yes |
| DOD-01 | DOD | Focused projection tests prove stable Native row identities, in-place tool lifecycle update, read-only lifecycle notices, delta/snapshot authority, duplicate event omission, and no fabricated tool/clarify semantics. | EVIDENCE | C01,C02,C03 | T2 | V01 | INTEGRATION | yes |
| DOD-02 | DOD | Focused Main history tests prove accepted-anchor expansion, prompt/execution/result order independent of timestamps, distinct concurrent/sequential run identities, and live/reopen/restart parity from the same complete sanitized audit. | EVIDENCE | C04 | T3 | V02 | INTEGRATION | yes |
| DOD-03 | DOD | Existing Main Skill Run service, parser/sanitization, transcript store, session materialization, File Platform, and original Chat regression coverage remain passing without a new external Provider/public IPC contract or a Renderer write. | SCOPE | C05 | T1,T3 | V03 | INTEGRATION | yes |
| DOD-04 | DOD | Normal-path rendering uses no `SkillRunTranscriptCard` together with Native Skill Run rows; rollback-only card availability and compact control reachability are explicitly proven without RM-04 removal work. | BEHAVIOR | C02 | T2 | V01 | INTEGRATION | yes |
| DOD-05 | DOD | All blocking claims have fresh recorded evidence before RM-03 is marked DONE. | EVIDENCE | C01,C02,C03,C04,C06 | T1,T2,T3 | V01,V02,V03,V04 | INTEGRATION | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Live Native projection | AC-01,AC-02,AC-03,DOD-01 | Existing Skill Run projection subscription. | Optimistic user row plus in-place Native activity/result rows. | `applySkillRunProjectionsToMessages` upserts Native rows by stable ids; terminal snapshot seals the assistant row. | `rejectSkillRunCard` remains the adapter failure writer for pre-accept/start errors; it never defaults classification or fabricates tool payloads. | V01,V03 |
| Reopen/restart expansion | AC-04,AC-05,DOD-02 | `getSessionMessages` / restart history load. | Incomplete sidecar stays an explicit rollback `skill_run` item. | `mergeSkillRunTranscriptIntoHistory` expands complete audit inside accepted anchors. | Missing/incomplete audit keeps the existing card path; it does not synthesize Native facts. | V02 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Live sanitized projection | AC-01,AC-02,AC-03,AC-07 | Main `SkillRunService` projection + ordinalized activities. | Existing skill-run IPC/preload `SkillRunProjection`. | `skill-run-transcript.ts` then existing `MessageList`. | `clientRequestId`, `eventId`, `ordinal`, `callId`, `messageId`/`deltaSeq` via existing text seal, `phase`. | Shared Native-row helper plus adapter; Main remains sanitizer. | Invalid/incomplete activities omitted; no repair/write/default to Chat tool_calls. | `eventId` / `clientRequestId+callId` / assistant bubble id. | V01,V03 |
| Sidecar reopen expansion | AC-04,AC-05,AC-07 | Session-owned transcript sidecar. | Existing `listSkillRunTranscriptForSession` batch. | `mergeSkillRunTranscriptIntoHistory` then `dbItemsToChatMessages`. | Accepted user/assistant `platformMessageId`s, activity `ordinal`. | Main Sessions reader. | Incomplete audit → rollback card; no global timestamp membership. | `clientRequestId` turn identity. | V02 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | Accepted Skill Run occupies one Native turn without a normal-path card. | yes | Existing skill-run-transcript and Chat transcript tests. | RESIDUAL_GAP | NEW_EVIDENCE | Adapter still creates a `skill_run` card. | V01 |
| CLM-02 | AC-02 | Stable event/call identity; one tool lifecycle patches in place; no fabricated args/results/clarify. | yes | Existing Main dedupe and durable activity tests. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Native mapping is new. | V03 |
| CLM-03 | AC-03 | Ordered deltas plus authoritative snapshot win on the Native assistant row. | yes | Existing Skill Run service tests. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Native assistant consumer is new. | V03 |
| CLM-04 | AC-04 | Reopen/restart expand sidecar activity inside accepted anchors. | yes | Existing sessions Skill Run history tests. | RESIDUAL_GAP | NEW_EVIDENCE | Current merge appends cards and sorts by timestamp. | V02 |
| CLM-05 | AC-05 | Prompt/execution/result order is independent of adjacent timestamps. | yes | Existing sessions Skill Run history tests. | RESIDUAL_GAP | NEW_EVIDENCE | Timestamp sort currently owns membership. | V02 |
| CLM-06 | AC-06 | Chat, Main execution/audit, compact controls, and File Platform retain owners. | yes | APPROVED AD, RM-01/RM-02 evidence, existing subsystem tests. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Projection crosses Main history and Renderer presentation. | V03 |
| CLM-07 | AC-07 | Only sanitized projection fields reach the renderer; no Renderer write/new public contract. | yes | Existing parser/transcript-store forbidden-field checks. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Ordinal crosses the projection boundary. | V03 |
| CLM-08 | AC-08 | No third mode, Expert/HermesTask branch, second list/store, or registry. | yes | APPROVED AD and RM-02 scope evidence. | PROVEN_REQUIREMENT | NEW_EVIDENCE | RM-03 must prove closed presentation. | V01,V04 |
| CLM-09 | DOD-01 | Focused projection tests prove Native identities and lifecycle. | yes | No RM-03 Native proof. | NOT_TESTED | NEW_EVIDENCE | New completion evidence. | V01 |
| CLM-10 | DOD-02 | Focused Main history tests prove anchor expansion and parity. | yes | Current timestamp-merge tests. | RESIDUAL_GAP | NEW_EVIDENCE | Expansion replaces the merge. | V02 |
| CLM-11 | DOD-03 | Existing Main/Chat regressions pass without a new public contract. | yes | Existing service/store/materialize/sessionHistory tests. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Projection consumption is new. | V03 |
| CLM-12 | DOD-04 | Normal path has no card plus Native rows; rollback card remains reachable. | yes | Existing card tests. | RESIDUAL_GAP | NEW_EVIDENCE | Normal path still emits a card. | V01 |
| CLM-13 | DOD-05 | Every blocking RM-03 claim is fresh. | yes | No RM-03 manifest. | NOT_TESTED | NEW_EVIDENCE | New completion proof. | V04 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01,CLM-08,CLM-09,CLM-12 | UNIT | LOCAL | `npm exec vitest -- run src/renderer/src/modules/skill-run/skill-run-transcript.test.ts src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx --pool=threads --maxWorkers=1` | Native adapter proof: order, identities, read-only notices, and no card on the normal path. | Duplicate events, fabricated args/clarify, and mixed card+Native cases fail closed. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V02 | CLM-04,CLM-05,CLM-10 | INTEGRATION | LOCAL | `npm exec vitest -- run src/main/sessions-skill-run-history.test.ts --pool=threads --maxWorkers=1` | Anchor expansion keeps prompt/execution/result order independent of timestamps. | Incomplete audit stays rollback; distinct runs do not merge by tool name. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V03 | CLM-02,CLM-03,CLM-06,CLM-07,CLM-11 | INTEGRATION | LOCAL | `npm exec vitest -- run src/renderer/src/modules/skill-run/skill-run-transcript.test.ts src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-transcript-store.test.ts src/main/skill-run/skill-run-session-materialize.test.ts src/renderer/src/screens/Chat/sessionHistory.test.ts src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx --pool=threads --maxWorkers=1` | Ordinalized projection, in-place tool lifecycle, sidecar, materializer, Chat history, and compact controls pass without a Renderer write. | Forbidden fields stay absent; compact approval/cancel remain reachable. | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V04 | CLM-08,CLM-13 | REGRESSION | LOCAL | `npm run guard` | Work guards keep renderer/cache/i18n/contract boundaries. | No non-English locale, renderer HTTP/write, or forbidden contract path. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#applySkillRunProjectionsToMessages`
- `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#createOptimisticSkillRunTurn`
- `apps/work/src/shared/skill-run.ts#SkillRunActivityItem`
- `apps/work/src/main/skill-run/skill-run-service.ts#persistActivityBeforeCap`
- `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory`
- `apps/work/src/renderer/src/screens/Chat/MessageList.tsx`
- `apps/work/lat.md/skill-run.md`

## Triggered Read

- If `tool_call` with empty `args` is unreadable, read only `HistoryRow` tool header rendering; do not emit `tool_result` or copy Provider arguments.
- If a clarify/approval notice cannot reuse a bubble, read only the existing `MessageList` bubble path; do not introduce `ClarifyMessage` or a second list.
- If resume reconciliation keys still assume a `skill_run` card, read only `sessionHistory.ts` match keys; do not add a transcript store.
- If `Chat.tsx#submitSkill` still detects duplicates by `kind === "skill_run"`, read that callback only.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C03 | `apps/work/src/shared/skill-run.ts#SkillRunActivityItem` | PROD | MODIFY | Shared Skill Run DTO | T1 | Carry durable `ordinal` on the sanitized item | sanitized ordering | no |
| C03 | `apps/work/src/shared/skill-run.ts` | PROD | MODIFY | Shared Skill Run DTO | T1 | Derive Native row identities/order from sanitized facts | shared identity | no |
| C03 | `apps/work/src/main/skill-run/skill-run-service.ts#appendSanitizedActivity` | PROD | MODIFY | Skill Run service | T1 | Projection activities keep eventId plus ordinal | live/reopen parity | no |
| C03 | `apps/work/src/main/skill-run/skill-run-service.ts#persistActivityBeforeCap` | PROD | MODIFY | Skill Run service | T1 | Copy the assigned ordinal onto the projection item | live/reopen parity | no |
| C03 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | Existing service tests | T1 | Prove ordinalized projection without raw payloads | C03 proof | no |
| C01 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#applySkillRunProjectionsToMessages` | PROD | MODIFY | Renderer Skill Run adapter | T2 | Upsert Native rows, not a normal-path card | Native projection | no |
| C02 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#createOptimisticSkillRunTurn` | PROD | MODIFY | Renderer Skill Run adapter | T2 | Optimistic user/result anchors without a normal-path card | Native projection | no |
| C02 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#submitSkill` | PROD | MODIFY | Chat Skill Run submit | T2 | Duplicate detection uses `clientRequestId` anchors, not card kind | live publication | no |
| C06 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts` | PROD | MODIFY | Renderer Skill Run adapter | T2 | Skill Run-only mapping; no third-mode/registry branch | closed two-mode | no |
| C01 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.test.ts` | TEST | MODIFY | Existing adapter tests | T2 | Native identity/lifecycle/omission proof | C01-C02 proof | no |
| C02 | `apps/work/src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx` | TEST | MODIFY | Existing Chat Skill Run tests | T2 | Normal path has no card; rollback card remains | DOD-04 | no |
| C02 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | Existing Skill Run record | T2 | Native live/reopen presentation and rollback-only card | architecture record | no |
| C04 | `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory` | PROD | REPLACE | Sessions history reader | T3 | Expand complete sidecar inside accepted anchors | reopen parity | no |
| C04 | `apps/work/src/main/sessions.ts#historySortKey` | PROD | REMOVE | Sessions history reader | T3 | Remove global timestamp membership/order for sidecar Skill Run items | reopen parity | no |
| C04 | `apps/work/src/main/sessions-skill-run-history.test.ts` | TEST | MODIFY | Existing merge tests | T3 | Anchor expansion and timestamp independence | C04 proof | no |
| C05 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | PROD | KEEP | Compact Skill Run controls | - | Approval/cancel/phase/artifact-retry remain outside the transcript adapter | preserve compact controls | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C03 | MODIFY_EXISTING | Durable ordinal already exists on sidecar records; the live projection drops it at `appendSanitizedActivity`. | One shared sanitized field plus identity helper; no new IPC. |
| C01 | MODIFY_EXISTING | `applySkillRunProjectionsToMessages` is the only live mapping sink; `MessageList` already renders Native kinds. | Change the adapter output, not the list surface. |
| C02 | MODIFY_EXISTING | Optimistic submit and `MessageList` card branch already exist. | Stop emitting a normal-path card; keep the branch for incomplete/rollback only. |
| C04 | MODIFY_EXISTING | `mergeSkillRunTranscriptIntoHistory` is the only reopen merge; anchors already exist via `skillRunTranscriptBubbleIds`. | Replace timestamp membership in that function and remove `historySortKey`; do not add a second history reader. |
| C06 | MODIFY_EXISTING | Adapter is already Skill Run-specific. | Exact mapping; do not add Expert/HermesTask recognition. |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C03 | `apps/work/src/shared/skill-run.ts#SkillRunActivityItem`; `apps/work/src/shared/skill-run.ts`; `apps/work/src/main/skill-run/skill-run-service.ts#appendSanitizedActivity`; `apps/work/src/main/skill-run/skill-run-service.ts#persistActivityBeforeCap`; `apps/work/src/main/skill-run/skill-run-service.test.ts` | `apps/work/src/main/skill-run/skill-run-transcript-store.ts` StoredActivity ordinal | - | no |
| T2 | C01,C02,C06 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts`; `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#applySkillRunProjectionsToMessages`; `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#createOptimisticSkillRunTurn`; `apps/work/src/renderer/src/screens/Chat/Chat.tsx#submitSkill`; `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.test.ts`; `apps/work/src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx`; `apps/work/lat.md/skill-run.md` | `apps/work/src/shared/skill-run.ts`; existing `MessageList` Native rows | T1 | no |
| T3 | C04 | `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory`; `apps/work/src/main/sessions.ts#historySortKey`; `apps/work/src/main/sessions-skill-run-history.test.ts` | `apps/work/src/shared/skill-run.ts`; `apps/work/src/main/skill-run/skill-run-session-materialize.ts#skillRunTranscriptBubbleIds` | T1 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts` | T2 | Live optimistic, patch, reject, and projection mapping must share one Native identity scheme. |
| `apps/work/src/main/sessions.ts` | T3 | Reopen merge is the only place timestamp membership can leak back in. |

## Generated Outputs Ledger

None. RM-03 changes handwritten TypeScript, focused tests, and the Skill Run architecture record.

## Todo T1 — Preserve sanitized activity identity and ordinal for Native row order

**Owns Changes**
- C03

**Goal**
Make live projection activities carry the same durable identity and ordinal the sidecar already stores, and expose one shared Native-row derivation from those facts.

**Immediate anchors**
- `apps/work/src/shared/skill-run.ts#SkillRunActivityItem`
- `apps/work/src/main/skill-run/skill-run-service.ts#persistActivityBeforeCap`

**Changes**
- Add `ordinal` to the sanitized activity item and copy it from the durable record onto the live projection.
- Derive Native reasoning/tool/notice/assistant identities from `clientRequestId`, `eventId`, `callId`, and ordinal; do not use timestamps.
- Prove the projection still omits raw Provider payloads.

**Stop conditions**
- [ ] Live projection activities include eventId plus ordinal matching durable persistence order.
- [ ] Shared derivation yields stable ids for reasoning, one tool lifecycle, and read-only notices.
- [ ] Existing service forbidden-field coverage still passes.

**Triggered reads**
- Store mapping only if projection ordinal cannot be copied from `persistActivityBeforeCap`.

## Todo T2 — Project live Skill Run turns onto existing Native ChatMessage rows

**Owns Changes**
- C01
- C02
- C06

**Goal**
Render an accepted live Skill Run as Native rows in prompt → activity → result order, without a normal-path card or a third presentation mode.

**Immediate anchors**
- `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts#applySkillRunProjectionsToMessages`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#submitSkill`

**Changes**
- Map sanitized projection facts through the T1 helper into existing `ChatMessage` kinds; tool rows update in place and never invent args/results.
- Clarify/approval lifecycle becomes a read-only bubble, not `ClarifyMessage`.
- Keep `SkillRunTranscriptCard` reachable only for incomplete/rollback items; do not render it beside Native rows.
- Update English Skill Run architecture record.

**Stop conditions**
- [ ] Normal-path tests show Native order and no `SkillRunTranscriptCard`.
- [ ] Duplicate events and later deltas cannot duplicate or overwrite sealed assistant text.
- [ ] Compact controls remain outside the transcript adapter.
- [ ] No Expert/HermesTask or registry branch is added.

**Triggered reads**
- Only MessageList/`submitSkill`/sessionHistory keys under the documented triggers.

## Todo T3 — Expand reopen and restart history inside accepted Skill Run anchors

**Owns Changes**
- C04

**Goal**
Replace detached `skill_run` timestamp merging with in-turn expansion of complete sidecar activity.

**Immediate anchors**
- `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory`
- `apps/work/src/main/sessions-skill-run-history.test.ts`

**Changes**
- Locate accepted user/assistant anchors by `skillRunTranscriptBubbleIds`.
- Insert Native history rows from ordinalized sidecar activity between those anchors.
- Remove `historySortKey` timestamp membership for sidecar Skill Run items; keep incomplete audit as an explicit rollback `skill_run` item.

**Stop conditions**
- [ ] Complete audits reopen in prompt/execution/result order despite reversed adjacent timestamps.
- [ ] Distinct `clientRequestId`s stay distinct turns even with identical tool names.
- [ ] Incomplete audit still yields a rollback card, not synthesized Native rows.

**Triggered reads**
- `sessionHistory.ts` match keys only if resume reconciliation still assumes a card.

## Verification

Run V01-V04 through `smc-plan-delivery/scripts/evidence.py` in `apps/work`. All blocking modes are LOCAL.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit/review FRESH PASS; V01-V04 FRESH PASS; CLM-01 through CLM-13 PASS; durable manifest FRESH | V01,V02,V03,V04 via SMC evidence ledger and durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof/review/manifest is pending or stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents implementation or proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts with current reality | PRD revision request |
