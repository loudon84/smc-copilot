---
name: Work v4.2 RM-01 Session Metadata and Index Foundation
overview: Implement Main-owned durable Chat and Skill Run Session classification, scoped cache projection, repair, and deletion convergence.
todos:
  - id: t1-session-metadata-domain
    content: "T1 — Establish the scoped two-mode Session metadata domain [C01, C05, C07]"
    status: completed
  - id: t2-session-cache-ipc-integration
    content: "T2 — Publish explicit classified cache rows across Main transports [C02, C03, C06, C09]"
    status: completed
  - id: t3-skill-run-accepted-materialization
    content: "T3 — Materialize Work classification only after Skill Run acceptance [C04]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: WORK-v4.2-RM-01-session-metadata-index-foundation
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: PRD-WORK-v4.2-RM-01-session-metadata-index-foundation@1.0.3
grounded_commit: 2d215626030a366dad26bdddcb12f1a57a09a051
grounding_source: committed_baseline
working_tree_fingerprint: sha256:5b791bc54d22f5faa65c6b6c2570d1f78e7dd80d4a3b2f9bf278595d38f0b611
---

# Work v4.2 RM-01 Session Metadata and Index Foundation Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.2-RM-01-session-metadata-index-foundation.md)

## Scope

- In: trusted Main-derived logical Session identity; closed `chat/hermes-chat` and `work/skill-run` metadata; explicit sanitized CachedSession projection for local, Remote Dashboard, and SSH Chat routes; accepted Skill Run persistence; idempotent repair/backfill; deletion convergence; focused proof.
- Out: Sidebar grouping/labels, Renderer classification consumption, Native transcript migration, SkillRunTranscriptCard removal, Provider public-contract changes, new execution providers, and any Expert/HermesTask recognition, compatibility, migration, or backfill branch.
- Production Owner inherited from PRD: Work Main owns Session metadata/index and cache publication; existing Chat, Skill Run, File Platform, and Renderer owners retain their execution/presentation boundaries.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/session-metadata-store.ts` | Absent | New Main-only state-db store | Cache, Skill materializer, IPC, and deletion need one durable owner | `session-context-folder-store.ts` and `skill-run-session-mode-store.ts` prove the existing per-session store pattern but do not own classification | PASS |
| C05 | `apps/work/src/main/session-metadata-store.ts` | Absent | Same new store owns validation/backfill/repair | Cache readers and producers require fail-closed source data | No current repair/backfill store exists | PASS |
| C07 | `apps/work/src/main/session-metadata-store.ts` | Absent | Same store owns unique identity/idempotency | Repeat publication and rollback depend on retained durable metadata | Existing cache upsert is id-only and cannot enforce scoped identity | PASS |
| C02 | `apps/work/src/main/session-cache.ts#CachedSession` | Existing DTO lacks classification | Shared Main/preload cache-row type | Local sync/upsert and Remote/SSH producers return it | Existing cache/event path is the smallest DTO owner | PASS |
| C02 | `apps/work/src/main/remote-sessions.ts#remoteListCachedSessions` | Unclassified rows | Called by `registerIpcHandlers` cache route | `RemoteSessionConfig` supplies trusted URL/profile scope inputs | No remote classifier exists | PASS |
| C02 | `apps/work/src/main/ssh-remote.ts#sshListCachedSessions` | Unclassified rows | SSH fallback cache producer | SSH config and active profile identify Main scope | No SSH classifier exists | PASS |
| C03 | `apps/work/src/main/ipc/register.ts#registerIpcHandlers` | Session-start only sends Renderer event | Main receives Chat callback and dispatches cache routes here | Main can write before cache/event visibility | Existing cache event broadcast is reusable | PASS |
| C04 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript` | Gates on providerRunId but cache-falls-back on DB failure | `persistSanitizedRun` invokes materialization, which calls cache upsert | Accepted snapshot is authoritative evidence | Existing predicate is the correct negative boundary | PASS |
| C06 | `apps/work/src/main/sessions.ts#deleteSessionRows` | Existing delete transaction clears per-session stores | Local delete callers use this transaction then cache cleanup | Metadata deletion belongs in this owner | Existing store cleanup calls establish integration pattern | PASS |
| C09 | `apps/work/src/main/session-cache.ts#CachedSession` | Renderer sees unclassified DTO | Preload mirrors Main cache output | Boundary must omit invalid metadata rather than infer | Existing cache event payload stays minimal | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | [C01] The persisted validator accepts exactly chat/hermes-chat and work/skill-run; it rejects missing, partial, cross-paired, unknown and third-provider values without silently defaulting them. | SECURITY | C01,C09 | T1,T2 | V01 | UNIT | yes |
| AC-02 | AC | [C01] Two Sessions with the same profileid + sessionid but different trusted domains remain isolated, while reconnecting to the same configured domain resolves the same opaque logical identity without exposing endpoint or credential material. | LIFECYCLE | C01 | T1 | V01 | UNIT | yes |
| AC-03 | AC | [C02/C03] Each supported original Chat path—including Direct, Remote Dashboard and SSH—produces an explicit chat/hermes-chat cache projection only after durable metadata exists; repeated publication yields one logical row and one current classification. | CONTRACT | C02,C03 | T2 | V02 | INTEGRATION | yes |
| AC-04 | AC | [C04] After Provider acceptance becomes durable, a Skill Run persists work/skill-run before its cache row/event is observable; retried materialization converges on the same logical row. | LIFECYCLE | C04 | T3 | V03 | INTEGRATION | yes |
| AC-05 | AC | [C04] A Skill Run request that fails, is rejected or is cancelled before durable Provider acceptance creates no work/skill-run metadata and no formal Work cache row. | NEGATIVE | C04 | T3 | V03 | INTEGRATION | yes |
| AC-06 | AC | [C02/C09] Every supported sanitized CachedSession producer returns the explicit pair from Main-owned metadata; Renderer classification remains identical across refresh/reopen and contains no inference or write fallback. | CONTRACT | C02,C09 | T2 | V02 | INTEGRATION | yes |
| AC-07 | AC | [C05] Running supported-data backfill repeatedly maps accepted Skill Run evidence to work/skill-run and all remaining authoritative supported Chat Sessions to chat/hermes-chat without duplicates, cross-scope collisions, third classes, or Expert/HermesTask logic. | LIFECYCLE | C05 | T1 | V01 | UNIT | yes |
| AC-08 | AC | [C05/C09] Missing, corrupt and scope-mismatched metadata is excluded from classified projections, emits only sanitized diagnostics, and is repaired only from trusted Chat ownership or accepted Skill Run evidence; an unrecoverable row stays failed closed. | SECURITY | C05,C09 | T1,T2 | V01,V02 | INTEGRATION | yes |
| AC-09 | AC | [C06] Deleting either class removes its metadata/index/cache identity and applicable associations; interruption followed by restart/sync converges to the deleted state and stale derived records alone cannot resurrect the row. | LIFECYCLE | C06 | T2 | V02 | INTEGRATION | yes |
| AC-10 | AC | [C07] Repeated metadata/cache/event publication and an interrupted retry converge without duplicate logical rows; disabling the downstream presentation/Sidebar consumer preserves classification, audit/continuation and File identities for later re-enable. | LIFECYCLE | C07 | T1 | V01 | UNIT | yes |
| AC-11 | AC | [C08] Original Chat execution state remains owned by the existing Chat path, Skill Run execution/audit remains owned by its existing subsystem, and File Platform identity remains unchanged; RM-01 adds no Provider contract or transcript mutation. | SCOPE | C04 | T3 | V04 | INTEGRATION | yes |
| AC-12 | AC | [C01/C02/C05/C09] contextFolder, transport, source, session ID shape, tool name and message content cannot change classification; no third provider/session kind and no Expert/HermesTask recognition, compatibility, migration or backfill branch is present. | SECURITY | C01,C02,C05,C09 | T1,T2 | V05 | DIFF_SCOPE | yes |
| AC-13 | AC | [C01/C05/C06] Concurrent operations on one logical Session—classification, repair, publish and delete—are serialized or conflict-resolved so the durable end state is atomic, valid and reproducible after restart. | LIFECYCLE | C01,C05,C06 | T1,T2 | V01,V02 | INTEGRATION | yes |
| AC-14 | AC | [C01/C05] Diagnostics and cache DTOs expose no raw endpoint, credential/JWT, prompt/message content, raw Provider event, raw artifact location or filesystem path. | SECURITY | C01,C05 | T1 | V01 | UNIT | yes |
| DOD-01 | DOD | All blocking acceptance criteria have fresh, recorded implementation evidence; no Todo completion or cache event alone is treated as proof. | EVIDENCE | C01,C02,C04,C05,C06,C07 | T1,T2,T3 | V06 | INTEGRATION | yes |
| DOD-02 | DOD | Durable metadata, cache projection, Chat publication, accepted Skill Run publication, backfill/repair and deletion/restart convergence satisfy the closed two-pair contract without a third mode or Expert/HermesTask branch. | BEHAVIOR | C01,C02,C03,C04,C05,C06,C07,C09 | T1,T2,T3 | V06 | INTEGRATION | yes |
| DOD-03 | DOD | The implementation preserves existing Chat execution truth, Skill Run audit/continuation truth, File Platform ownership and the sanitized Main-to-Renderer boundary. | SCOPE | C04 | T3 | V04 | INTEGRATION | yes |
| DOD-04 | DOD | Repeated/interrupted metadata operations and downstream presentation rollback preserve one valid logical Session identity without duplicates, secret exposure, destructive re-backfill or stale-row resurrection. | LIFECYCLE | C01,C05,C06,C07 | T1,T2 | V06 | INTEGRATION | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Chat classify/publish | AC-01,AC-02,AC-03,AC-06,AC-08,AC-10,AC-12,AC-13,AC-14 | Main receives valid local/Remote/SSH Chat Session | Candidate absent from classified projection until durable metadata exists | T2 invokes T1 store, then publishes one cache row/event | T1 validates/rejects; T2 omits invalid candidate; no Renderer writer | V01,V02 |
| Accepted Skill Run | AC-01,AC-04,AC-05,AC-10,AC-11,AC-12,AC-14 | Sanitized durable snapshot has providerRunId and non-pending phase | Pre-accept or uncommitted materialization has no Work cache row | T3 commits Session/transcript plus Work metadata, then cache row | T3 fails closed on missing DB/metadata failure; pre-accept writes neither | V03,V04 |
| Backfill/repair | AC-01,AC-02,AC-07,AC-08,AC-10,AC-12,AC-13,AC-14 | Startup/sync finds supported evidence or invalid metadata | Missing/invalid row excluded | T1 upserts/repairs using unique logical identity and accepted-Run precedence | Evidence-free/corrupt row remains unclassified with safe diagnostic | V01 |
| Delete/restart | AC-06,AC-09,AC-10,AC-13,DOD-04 | Authoritative local/remote delete or resumed cleanup | Cleanup pending only inside Main transaction/reconciliation | T2 extends existing deletion and derives cache cleanup afterward | T1/T2 block stale derived state from recreating metadata | V02,V06 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Local Chat cache | AC-01,AC-02,AC-03,AC-06,AC-08,AC-12,AC-14 | Main Chat callback and `sessions` row | register → metadata store → CachedSession → existing preload IPC | existing cache reader | opaque scope, profile, session id, Chat pair, display fields | T1 pair/scope validator | omit row/safe diagnostic; never default Chat | scope + profile + session | V01,V02 |
| Remote/SSH Chat cache | AC-02,AC-03,AC-06,AC-08,AC-12,AC-14 | Dashboard/SSH summary plus trusted Main connection/profile | remote/ssh adapter → metadata store → IPC result | existing cache reader | normalized opaque scope inputs, profile, session id, Chat pair | T1 validation; T2 adapter | omit invalid row; transport never becomes provider | scope + profile + session | V01,V02 |
| Accepted Skill Run | AC-01,AC-04,AC-05,AC-06,AC-10,AC-11,AC-12,AC-14 | sanitized durable Skill snapshot | IPC → materializer → state-db metadata/transcript → cache upsert/event | cache reader and existing audit owner | providerRunId, profileId, sessionId, Work pair, safe display fields | T3 invokes T1 inside transaction | pre-accept/DB/metadata failure produces no formal Work row | scoped session plus accepted Run identity | V03,V04 |
| Deletion | AC-06,AC-09,AC-10,AC-13,DOD-04 | authoritative delete result | delete route → `deleteSessionRows`/metadata cleanup → cache removal | existing cache reader | trusted scoped identity only | T2 integration and T1 exact delete | stale cache/sidecar cannot recreate metadata | scoped session identity | V02,V06 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | Only two valid pairs persist/read; invalid pairs fail closed. | yes | No classification domain | NOT_TESTED | NEW_EVIDENCE | New durable domain | V01 |
| CLM-02 | AC-02 | Scope isolates collisions and stabilizes reconnect without raw values. | yes | No scoped identity | NOT_TESTED | NEW_EVIDENCE | New identity contract | V01 |
| CLM-03 | AC-03 | Local/Remote/SSH Chat exposes explicit Chat after durable metadata. | yes | Existing cache/Chat tests | RESIDUAL_GAP | TARGETED_RERUN | Classification ordering changes publication | V02 |
| CLM-04 | AC-04 | Accepted Skill Run commits Work metadata before cache and retries converge. | yes | Existing materializer/IPC tests | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Metadata transaction precedes cache upsert | V03 |
| CLM-05 | AC-05 | Pre-accept/rejected/cancelled Run has no Work metadata/cache row. | yes | Existing providerRunId predicate tests | PROVEN_BUT_AFFECTED | TARGETED_RERUN | New side effects must preserve negative boundary | V03 |
| CLM-06 | AC-06 | Every producer returns Main-owned explicit fields; no Renderer inference/write. | yes | Adapter/DTO inspection | RESIDUAL_GAP | NEW_EVIDENCE | Fields/boundary are new | V01 |
| CLM-07 | AC-07 | Repeated backfill gives accepted Run Work, remaining Chat Chat, no duplicate/Expert branch. | yes | No backfill | NOT_TESTED | NEW_EVIDENCE | New repair capability | V01 |
| CLM-08 | AC-08 | Invalid metadata is omitted and repairs only from trusted evidence. | yes | No validation/repair | NOT_TESTED | NEW_EVIDENCE | New fail-closed path | V01 |
| CLM-09 | AC-09 | Delete/restart removes metadata/cache/associations without resurrection. | yes | Existing deletion tests | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Metadata extends deletion transaction | V02 |
| CLM-10 | AC-10 | Retries converge; rollback retains durable metadata/audit/File identity. | yes | Existing cache upsert tests | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Ordered metadata publication is new | V01 |
| CLM-11 | AC-11 | Existing truth owners and sanitizer boundary remain intact. | yes | Focused Skill/session history tests | PROVEN_FRESH | TARGETED_RERUN | Materializer integration changes | V04 |
| CLM-12 | AC-12 | No inference input, third mode, or Expert/HermesTask branch enters the path. | yes | Approved AD/user constraint | PROVEN_REQUIREMENT | NEW_EVIDENCE | Implementation absence requires proof | V05 |
| CLM-13 | AC-13 | Interleaved operations end in one valid durable state after restart. | yes | No classification concurrency | NOT_TESTED | NEW_EVIDENCE | New transaction/idempotency | V01 |
| CLM-14 | AC-14 | Metadata DTOs/diagnostics exclude secrets, content, raw events/artifacts, paths. | yes | Existing sanitizer boundary | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | New metadata diagnostic surface | V01 |
| CLM-15 | DOD-01 | All blocking claims have fresh recorded focused proof. | yes | No RM-01 completion evidence | NOT_TESTED | NEW_EVIDENCE | Completion proof is new | V06 |
| CLM-16 | DOD-02 | Focused suite proves closed two-pair outcome across metadata/cache/Skill/delete. | yes | No RM-01 completion evidence | NOT_TESTED | NEW_EVIDENCE | Integrated outcome is new | V06 |
| CLM-17 | DOD-03 | Regression keeps existing truth owners and sanitizer boundary. | yes | Existing focused baseline | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Fresh combined proof required | V06 |
| CLM-18 | DOD-04 | Interruption/rollback keeps one safe identity without stale resurrection. | yes | No RM-01 completion evidence | NOT_TESTED | NEW_EVIDENCE | New closure proof | V06 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01,CLM-02,CLM-06,CLM-07,CLM-08,CLM-10,CLM-13,CLM-14 | UNIT | LOCAL | `npm exec vitest -- run src/main/session-metadata-store.test.ts --pool=threads --maxWorkers=1` | Store proves pair/scope/backfill/repair/idempotency/concurrency/sanitization. | Invalid pair/scope/evidence is omitted; no Expert branch or sensitive field accepted. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V02 | CLM-03,CLM-09 | INTEGRATION | LOCAL | `npm exec vitest -- run src/main/session-cache.test.ts src/main/remote-sessions.test.ts src/main/ssh-remote.test.ts src/main/sessions-skill-run-history.test.ts --pool=threads --maxWorkers=1` | Chat cache rows publish explicit classification; delete/restart has no resurrection. | Events stay sanitized; stale derived state cannot recreate deleted row. | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V03 | CLM-04,CLM-05 | INTEGRATION | LOCAL | `npm exec vitest -- run src/main/skill-run/skill-run-session-materialize.test.ts src/main/skill-run/skill-run-ipc.test.ts --pool=threads --maxWorkers=1` | Accepted snapshot persists Work metadata before cache; retry converges. | Pre-accept/no-DB/metadata failure creates no formal Work row. | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V04 | CLM-11 | REGRESSION | LOCAL | `npm exec vitest -- run src/main/skill-run/skill-run-transcript-store.test.ts src/main/sessions.test.ts src/main/sessions-skill-run-history.test.ts --pool=threads --maxWorkers=1` | Existing execution/audit/session-history behavior stays covered. | No transcript/File/execution-truth rewrite. | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V05 | CLM-12 | UNIT | LOCAL | `npm exec vitest -- run src/main/session-metadata-store.test.ts --pool=threads --maxWorkers=1` | Closed-pair validator tests prove all unsupported values are rejected and the store exposes only Chat and Skill Run intents. | No input derived from context, transport, IDs, tools or message content can select a class; no Expert/HermesTask intent exists. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V06 | CLM-15,CLM-16,CLM-17,CLM-18 | FOCUSED | LOCAL | `npm exec vitest -- run src/main/session-metadata-store.test.ts src/main/session-cache.test.ts src/main/remote-sessions.test.ts src/main/ssh-remote.test.ts src/main/skill-run/skill-run-session-materialize.test.ts src/main/skill-run/skill-run-ipc.test.ts src/main/sessions.test.ts src/main/sessions-skill-run-history.test.ts src/main/skill-run/skill-run-transcript-store.test.ts --pool=threads --maxWorkers=1` | Full RM-01 focused suite passes. | Includes invalid, pre-accept, retry, cleanup, restart, forbidden-branch and sanitization regressions. | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/main/session-cache.ts#CachedSession`
- `apps/work/src/main/ipc/register.ts#registerIpcHandlers`
- `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript`
- `apps/work/src/main/sessions.ts#deleteSessionRows`
- `apps/work/src/main/remote-sessions.ts#remoteListCachedSessions`
- `apps/work/src/main/ssh-remote.ts#sshListCachedSessions`
- `apps/work/src/main/session-context-folder-store.ts#ensureTable`

## Triggered Read

- If accepted Skill metadata must share the transcript transaction: read `apps/work/src/main/skill-run/skill-run-ipc.ts#persistSanitizedRun`; otherwise do not alter service lifecycle.
- If remote/SSH delete has a distinct success branch: read only that caller in `apps/work/src/main/ipc/register.ts`; do not add a second remote client.
- If state-db schema differs: read existing per-session table guards; do not add a global migration framework.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/session-metadata-store.ts` | PROD | ADD | New Main metadata owner | T1 | Scoped identity and closed-pair validator | identity/classification | yes |
| C05 | `apps/work/src/main/session-metadata-store.ts` | PROD | ADD | New Main metadata owner | T1 | Idempotent backfill/repair and safe diagnostics | repair/backfill | yes |
| C07 | `apps/work/src/main/session-metadata-store.ts` | PROD | ADD | New Main metadata owner | T1 | Retained-metadata idempotency/rollback semantics | rollback | yes |
| C01 | `apps/work/src/main/session-metadata-store.test.ts` | TEST | ADD | New store test seam | T1 | Unit proof of scope/pair/transaction rules | C01 proof | yes |
| C01 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | Existing Work architecture record | T1 | Record the closed Main-owned two-mode metadata boundary and its sanitization rule | operator/developer behavior | no |
| C02 | `apps/work/src/main/session-cache.ts#CachedSession` | PROD | MODIFY | Existing cache DTO owner | T2 | Explicit valid pair on cache rows | cache projection | no |
| C02 | `apps/work/src/main/session-cache.ts#syncSessionCache` | PROD | MODIFY | Existing local cache sync owner | T2 | Hydrate/repair trusted local Chat metadata | local projection | no |
| C02 | `apps/work/src/main/session-cache.ts#upsertCachedSession` | PROD | MODIFY | Existing cache publication owner | T2 | Valid metadata precedes event publication | idempotent projection | no |
| C02 | `apps/work/src/main/remote-sessions.ts#remoteListCachedSessions` | PROD | MODIFY | Existing Remote producer | T2 | Trusted-scope explicit Chat rows | Remote transport | no |
| C02 | `apps/work/src/main/ssh-remote.ts#sshListCachedSessions` | PROD | MODIFY | Existing SSH producer | T2 | Trusted-scope explicit Chat rows | SSH transport | no |
| C02 | `apps/work/src/preload/index.ts` | PROD | MODIFY | Existing preload API | T2 | Runtime DTO matches explicit fields | sanitized contract | no |
| C02 | `apps/work/src/preload/index.d.ts#ElectronAPI` | PROD | MODIFY | Existing preload declaration | T2 | Type DTO matches runtime | sanitized contract | no |
| C03 | `apps/work/src/main/ipc/register.ts#registerIpcHandlers` | PROD | MODIFY | Existing Main integration hotspot | T2 | Chat metadata before cache-visible publication | Main-only publication | no |
| C06 | `apps/work/src/main/sessions.ts#deleteSessionRows` | PROD | MODIFY | Existing delete transaction | T2 | Exact metadata cleanup before cache cleanup | delete convergence | no |
| C09 | `apps/work/src/main/session-cache.ts#CachedSession` | PROD | MODIFY | Existing cache DTO owner | T2 | Invalid values never cross Main boundary | Renderer prohibition | no |
| C02 | `apps/work/src/main/remote-sessions.test.ts` | TEST | ADD | No Remote adapter tests | T2 | Remote explicit-classification proof | C02 proof | yes |
| C02 | `apps/work/src/main/session-cache.test.ts` | TEST | MODIFY | Existing cache tests | T2 | Local validation/order/sanitization proof | C02/C09 proof | no |
| C02 | `apps/work/src/main/ssh-remote.test.ts` | TEST | MODIFY | Existing SSH tests | T2 | SSH classification proof | C02 proof | no |
| C06 | `apps/work/src/main/sessions-skill-run-history.test.ts` | TEST | MODIFY | Existing delete tests | T2 | Cleanup/non-resurrection proof | C06 proof | no |
| C04 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript` | PROD | MODIFY | Existing Skill materializer | T3 | Accepted Work metadata before cache | accepted publication | no |
| C04 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#upsertSessionCacheRow` | PROD | MODIFY | Existing cache helper | T3 | Reachable only after durable metadata | publication order | no |
| C04 | `apps/work/src/main/skill-run/skill-run-session-materialize.test.ts` | TEST | MODIFY | Existing materializer tests | T3 | Accepted/retry/pre-accept/failure proof | C04 proof | no |
| C04 | `apps/work/src/main/skill-run/skill-run-ipc.test.ts` | TEST | MODIFY | Existing IPC tests | T3 | Accepted durable snapshot proof | C04 proof | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MINIMAL_NEW | `session-cache.ts` is JSON-derived and unscoped; `session-context-folder-store.ts#ensureTable` proves per-session SQLite pattern. | Small Main-only store; no second cache/database/client. |
| C02 | MODIFY_EXISTING | CachedSession, sync/upsert, Remote/SSH producers, preload, and IPC are the complete current publication path. | Extends one DTO/event owner; no Renderer inference or provider registry. |
| C03 | MODIFY_EXISTING | `registerIpcHandlers#onSessionStarted` is the trusted Main callback before Renderer event. | Sequencing belongs at existing Main entry, not Renderer write-back IPC. |
| C04 | MODIFY_EXISTING | Existing predicate/materializer own accepted-run and cache materialization. | Retains existing acceptance/audit truth; adds metadata ordering only. |
| C05 | MINIMAL_NEW | No repair owner exists; `backfillLegacyAcceptedLock` proves accepted-run evidence lookup pattern. | Co-locate repair with new metadata table and unique identity; no Expert branch. |
| C06 | MODIFY_EXISTING | `deleteSessionRows` and IPC delete dispatch are existing deletion owners. | Extends authoritative routes, not a cleanup worker/heuristic. |
| C07 | MINIMAL_NEW | Cache upsert cannot retain scoped durable metadata across consumer rollback. | Store-level identity/idempotency is the smallest durable solution. |
| C09 | MODIFY_EXISTING | CachedSession/preload are the Main-to-Renderer cache contract. | Validation/omission blocks inference without Renderer code. |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01,C05,C07 | `apps/work/src/main/session-metadata-store.ts`; `apps/work/src/main/session-metadata-store.test.ts`; `apps/work/lat.md/skill-run.md` | `apps/work/src/main/session-context-folder-store.ts#ensureTable`; `apps/work/src/main/skill-run/skill-run-session-mode-store.ts#backfillLegacyAcceptedLock`; existing state-db session/Skill tables | - | no |
| T2 | C02,C03,C06,C09 | `apps/work/src/main/session-cache.ts#CachedSession`; `apps/work/src/main/session-cache.ts#syncSessionCache`; `apps/work/src/main/session-cache.ts#upsertCachedSession`; `apps/work/src/main/remote-sessions.ts#remoteListCachedSessions`; `apps/work/src/main/ssh-remote.ts#sshListCachedSessions`; `apps/work/src/preload/index.ts`; `apps/work/src/preload/index.d.ts#ElectronAPI`; `apps/work/src/main/ipc/register.ts#registerIpcHandlers`; `apps/work/src/main/sessions.ts#deleteSessionRows`; `apps/work/src/main/remote-sessions.test.ts`; `apps/work/src/main/session-cache.test.ts`; `apps/work/src/main/ssh-remote.test.ts`; `apps/work/src/main/sessions-skill-run-history.test.ts` | `apps/work/src/main/session-metadata-store.ts` | T1 | no |
| T3 | C04 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript`; `apps/work/src/main/skill-run/skill-run-session-materialize.ts#upsertSessionCacheRow`; `apps/work/src/main/skill-run/skill-run-session-materialize.test.ts`; `apps/work/src/main/skill-run/skill-run-ipc.test.ts` | `apps/work/src/main/session-metadata-store.ts`; `apps/work/src/main/session-cache.ts#upsertCachedSession`; `apps/work/src/main/skill-run/skill-run-ipc.ts#persistSanitizedRun` | T1,T2 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/ipc/register.ts` | T2 | One Main entry owns Chat start ordering, cache transport dispatch, broadcast and remote-delete integration. |
| `apps/work/src/main/session-cache.ts` | T2 | One owner controls DTO validation, hydration, write order and event publication. |

## Generated Outputs Ledger

None. RM-01 changes handwritten TypeScript/state-db schema only; no generated output.

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `apps/work/src/main/session-metadata-store.ts` | Existing JSON cache and feature stores do not own scoped classification/repair transaction semantics. | Establishes the sole approved Main metadata owner. |
| C05 | `apps/work/src/main/session-metadata-store.ts` | Existing JSON cache and feature stores do not own scoped classification/repair transaction semantics. | Establishes the sole approved Main metadata owner. |
| C07 | `apps/work/src/main/session-metadata-store.ts` | Existing JSON cache and feature stores do not own scoped classification/repair transaction semantics. | Establishes the sole approved Main metadata owner. |
| C01 | `apps/work/src/main/session-metadata-store.test.ts` | No current test seam exercises new table scope/pair/backfill/repair semantics. | Proves the new owner only. |
| C02 | `apps/work/src/main/remote-sessions.test.ts` | Remote cached-session adapter lacks local deterministic coverage. | Tests existing adapter; no production owner added. |

## Todo T1 — Establish the scoped two-mode Session metadata domain

**Owns Changes**
- C01
- C05
- C07

**Goal**
Add the minimal Main-only metadata store for scoped identity, the two approved pairs, idempotent trusted backfill/repair/delete primitives, and sanitized diagnostics.

**Immediate anchors**
- `apps/work/src/main/session-context-folder-store.ts#ensureTable`
- `apps/work/src/main/skill-run/skill-run-session-mode-store.ts#backfillLegacyAcceptedLock`

**Changes**
- Add a state-db table keyed by opaque scope/profile/session identity with constraints and transactional upsert/delete.
- Expose explicit Chat and accepted Skill Run intents; accepted Run wins backfill; missing/corrupt/evidence-free candidates fail closed.
- Add focused tests for valid/invalid pairs, scope isolation/reconnect, pre-accept precedence, repair/retry/concurrency, safe diagnostics, and retained metadata.
- Update the existing Skill Run architecture record with the closed two-mode Main-only metadata boundary; do not document Expert/HermesTask compatibility or migration.

**Stop conditions**
- [ ] Store tests prove T1 claims and no API accepts Expert/HermesTask or a third pair.
- [ ] The store has no Renderer dependency, cache/event ownership, or raw secret/content field.

**Triggered reads**
- If an older state-db guard is needed, read only existing per-session `tableExists`/`ensureTable` patterns.

## Todo T2 — Publish explicit classified cache rows across Main transports

**Owns Changes**
- C02
- C03
- C06
- C09

**Goal**
Extend existing Main cache/IPC transport paths with explicit authoritative fields, durable-before-visible Chat publication, fail-closed reads, and authoritative deletion cleanup.

**Immediate anchors**
- `apps/work/src/main/session-cache.ts#CachedSession`
- `apps/work/src/main/ipc/register.ts#registerIpcHandlers`
- `apps/work/src/main/remote-sessions.ts#remoteListCachedSessions`
- `apps/work/src/main/ssh-remote.ts#sshListCachedSessions`
- `apps/work/src/main/sessions.ts#deleteSessionRows`

**Changes**
- Add `sessionKind`/`executionProvider` to cache/preload DTOs; hydrate only via T1 validation and retain minimal cache-change events.
- Persist local Chat metadata before cache-visible row/event; classify Remote Dashboard/SSH only from trusted Main scope/profile and retain `chat/hermes-chat`.
- Omit invalid/scope-mismatched rows, repair only trusted Chat evidence, and never infer from content, ids, context, transport, or Renderer input.
- Extend existing deletion routes/transaction to remove exact metadata and prevent stale cache/sidecar resurrection.

**Stop conditions**
- [ ] All Chat producers expose valid explicit Chat classification after durable metadata, without default/inference.
- [ ] Main remains the only writer and delete cannot leave a revivable classified stale row.

**Triggered reads**
- If remote/SSH delete has a separate success branch, read only that branch; do not add a second remote client.

## Todo T3 — Materialize Work classification only after Skill Run acceptance

**Owns Changes**
- C04

**Goal**
Keep existing sanitized Skill Run truth while requiring Provider acceptance and durable Work metadata before formal cache publication.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-session-materialize.ts#shouldMaterializeSkillRunSession`
- `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#persistSanitizedRun`

**Changes**
- Reuse providerRunId plus non-pending phase as the sole acceptance predicate.
- Write T1 Work metadata inside the existing materialization transaction before cache upsert.
- Make DB/metadata failure fail closed for formal Work cache history; preserve separate audit/continuation and sanitizer truth.
- Extend materializer/IPC tests for ordering, retry, pre-accept/rejected/cancelled and failure negatives.

**Stop conditions**
- [ ] Accepted Run has one Work identity; pre-accept Run has none.
- [ ] No Skill activity is rewritten as Chat execution truth and no File/transcript owner changes.

**Triggered reads**
- If the materializer cannot share the existing transaction safely, stop with `RETURN_PRD`; do not add a second pre-metadata cache transaction.

## Verification

Run V01-V06 through `smc-plan-delivery/scripts/evidence.py`. Delivery must capture the required evidence manifest and complete review gates before Todo status becomes `completed` or any implementation commit is made.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit and implementation review FRESH PASS; V01-V06 FRESH PASS; CLM-01 through CLM-18 PASS; durable Evidence Manifest FRESH | V01,V02,V03,V04,V05,V06 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof/review/manifest is pending or stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents implementation or proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts with current reality | PRD revision request |
