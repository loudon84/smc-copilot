---
decision_id: AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER
version: 1.0.1
status: APPROVED
target_branch: work/prd-v4.2
review_verdict: PASS
approved_at: 2026-09-10T23:49:55.1032473+08:00
source_revision: PRD-WORK-v4.2@v4.2+user-constraint-2026-09-10-v2
grounded_commit: 2d215626030a366dad26bdddcb12f1a57a09a051
---

# Work v4.2 Unified Conversation / Execution Provider

## Problem

Work 当前把原有 Chat 与新 Skill Run 作为两套 transcript presentation：Chat 使用 Native `ChatMessage → MessageList`，Skill Run 使用 `SkillRunMessage → SkillRunTranscriptCard`。Session cache 又没有显式产品分类，导致实时展示、历史 reopen、Sidebar 与 provider lifecycle 之间存在重复 owner 和顺序漂移。

v4.2 只解决两条现行产品路径：原有 Chat 与新 Skill Run。Expert/HermesTask 不属于目标架构，不承担历史识别、兼容分类或迁移要求。

## Decision Drivers

1. Work 必须只有一个 Conversation Presentation Owner 与一个 Native Message Presentation。
2. Chat 与 Skill Run 的执行事实源必须保持分离，不能把 Skill Run activity 写成 Hermes Chat 原生 tool execution。
3. Session 产品分类必须显式、可持久化、可由 Main 发布给 Renderer，禁止从 `source`、sessionId、toolName、message body 或 contextFolder 推断。
4. Live transcript 与 history reopen 必须使用稳定 turn/row identity 和 Provider sequence，不依赖 wall-clock 排序。
5. File Platform 继续是唯一 Artifact resource owner。
6. 架构只覆盖 Chat 与 Skill Run，不为已退出路径引入第三种 Provider、兼容层或迁移分支。
7. 必须优先扩展现有 Chat、SkillRunService、Session cache 与 File Platform owner，不创建第二套 MessageList、Session DB 或 remote HTTP client。

## Evidence Baseline

| Claim | Type | Evidence |
|---|---|---|
| v4.2 只有原有 Chat 与新 Skill Run；Expert/HermesTask 不进入历史或迁移需求 | USER_CONSTRAINT | user-input:2026-09-10-v2 |
| ChatMessage/MessageList 已是成熟 Native presentation，但当前仍包含 SkillRunMessage/SkillRunTranscriptCard 分支 | REPO_FACT | `apps/work/src/renderer/src/screens/Chat/types.ts`; `apps/work/src/renderer/src/screens/Chat/MessageList.tsx` |
| Skill Run raw events 在 Main 被解析为 sanitized projection，Renderer 不接收 JWT/raw SSE/endpoint | REPO_FACT | `apps/work/src/main/skill-run/skill-run-contract-parser.ts`; `apps/work/src/main/skill-run/skill-run-service.ts`; `apps/work/src/shared/skill-run.ts` |
| Skill Run 已有稳定 clientRequestId/providerRunId、sidecar、continuation、user/assistant materialized anchors | REPO_FACT | `apps/work/src/main/skill-run/skill-run-transcript-store.ts`; `apps/work/src/main/skill-run/skill-run-session-materialize.ts` |
| Current reopen 把 sidecar item append 后按 timestamp/createdAt 全局排序 | REPO_FACT | `apps/work/src/main/sessions.ts#mergeSkillRunTranscriptIntoHistory` |
| Skill Run v1.5.0 event contract 提供 event_id/event_seq/message_id/delta_seq | SOURCE_FACT | `contracts/skill-run/v1.5.0/events/run-event.schema.json` |
| Session cache mutation event 与 targeted upsert 已存在 | REPO_FACT | `apps/work/src/main/session-cache.ts#upsertCachedSession`; `apps/work/src/shared/session-cache-events.ts` |
| Sidebar 当前按 pinned、contextFolder Projects、Chats 分组 | REPO_FACT | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx` |
| File Platform 已拥有 Skill Run remote artifact materialization 与 Session Files identity | REPO_FACT | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts`; `apps/work/lat.md/file-platform.md` |
| 统一 Native presentation 可在不修改 Provider public contract 的前提下完成 | INFERENCE | existing sanitized projection + v1.5.0 stable identities |

## Current Capability

| Capability | State | Current Production Owner |
|---|---|---|
| Original Chat execution and live Chat projection | EXISTS | Main Chat transport + Renderer `useChatIPC` |
| Native transcript union and rows | EXISTS/PARTIAL | Renderer Chat `types.ts`, `MessageList`, `HistoryRow`, `MessageRow` |
| Skill Run lifecycle, sanitized parsing, SSE/poll, approval/cancel, continuation | EXISTS | Main `SkillRunService` subsystem |
| Skill Run durable audit and history fallback anchors | EXISTS/PARTIAL | Main Skill Run transcript store/materializer + Sessions reader |
| Skill Run Native message projection | MISSING | No owner yet; current compatibility owner is `SkillRunTranscriptCard` |
| Explicit Chat/Skill Run session classification | MISSING | Session cache has no session kind/provider fields |
| Session cache mutation publication | EXISTS/PARTIAL | Main Session cache; Skill Run uses targeted upsert, original Chat session-start does not |
| Artifact identity, preview, download and Session Files | EXISTS | Main File Platform |
| Product modes beyond Chat/Skill Run | OUT | No v4.2 owner or migration requirement |

## Options Considered

### Option A — One Native transcript plus two closed execution providers

Keep Chat and Skill Run lifecycle owners intact. Work Main owns explicit Session metadata/index projection; Renderer owns one Native `ChatMessage → MessageList`. A Skill Run presentation adapter converts sanitized projection/activity into stable Native rows. This extends existing owners and removes the duplicate transcript branch.

### Option B — Keep SkillRunTranscriptCard as a permanent provider-specific transcript

This preserves the smallest immediate diff but retains two presentation models, divergent tool/reasoning/result behavior, and live/reopen mismatch. It prevents Work from becoming a unified Conversation system.

### Option C — Materialize Skill Run as Hermes Chat reasoning/tool_calls

This would reuse the existing DB history reader but would rewrite remote execution activity as Hermes Chat truth, collapse two authoritative sources, and violate security/ownership boundaries.

### Option D — Introduce a generic provider registry including Expert/HermesTask

This creates abstraction and migration work for a path outside the current product. It contradicts the closed two-mode constraint and expands scope without a v4.2 requirement.

## Decision

Select Option A.

v4.2 has exactly two product execution modes and one-to-one session classification:

| Product path | `session_kind` | `execution_provider` | UI history label |
|---|---|---|---|
| Original Chat | `chat` | `hermes-chat` | 聊天历史 |
| Skill Run | `work` | `skill-run` | 工作历史 |

The unions are closed for v4.2. Connection transport such as Direct, Remote Dashboard, or SSH is not an execution provider and cannot create another session kind. Expert/HermesTask is not represented in either union and receives no compatibility or migration branch.

Work Main is the unique Session classification/index writer. Renderer consumes `sessionKind` and `executionProvider` from sanitized Session cache DTOs and never derives them from provider/session/message fields.

The logical durable Session identity is:

```text
session_scope + profile_id + session_id
```

`session_scope` is a Main-derived opaque identity for the trusted connection/account domain. A reconnect to the same configured domain preserves it; changing endpoint/tenant/account produces a different scope. Renderer cannot provide, override, or infer this value, and raw endpoint/credential material is not exposed in CachedSession or ChatMessage. Exact persistence schema and normalization belong to the RM-01 Stage PRD.

Work Renderer Chat is the unique transcript presentation owner. Original Chat may continue using `useChatIPC` as its existing presentation adapter. Skill Run adds one adapter from sanitized `SkillRunProjection` to Native ChatMessage rows. No generic plugin registry or third provider interface is introduced.

## Target Architecture

```text
Original Chat transport                         SkillRunService
         │                                           │
         │ Chat callbacks                            │ sanitized projection
         ▼                                           ▼
 existing Chat adapter                      Skill Run presentation adapter
         │                                           │
         └────────────────────┬──────────────────────┘
                              ▼
                    Native ChatMessage[]
                              │
                         MessageList
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
     ReasoningRow      ToolActivityGroup      MessageRow

Main Session classification/index
  chat ↔ hermes-chat
  work ↔ skill-run
              │
              ▼
        CachedSession DTO
              │
              ▼
  Pinned / Projects / Chat history / Work history
```

Skill Run Native row identity and precedence are frozen as follows:

| Row | Stable identity | Update/order rule |
|---|---|---|
| User prompt | `skill-run:{clientRequestId}:user` | Insert before provider execution and retain as durable turn anchor |
| Reasoning summary | `clientRequestId + eventId` | Ordered by Provider event sequence/durable ordinal within the anchored turn |
| Tool lifecycle | `clientRequestId + callId` | One row; `started → completed/failed` updates in place |
| Read-only clarify notice | `clientRequestId + eventId` | Native agent information row; no Local Chat clarify response semantics |
| Assistant result | `skill-run:{clientRequestId}:assistant` | Delta ordered by `message_id + delta_seq`; matching snapshot is authoritative |
| Artifact | ManagedFile identity | Never creates a new ChatMessage kind; File Platform owns it |

History reopen locates the durable Skill Run user/assistant anchors and expands the execution rows inside that turn. It never appends a sidecar transcript and then globally sorts by timestamp. Duplicate Provider events are ignored by stable event identity; terminal snapshot cannot be overwritten by a later duplicate delta.

Sidebar presentation uses one-row identity and this precedence:

1. Pinned sessions appear once in the existing Pinned area and are removed from normal groups.
2. Unpinned sessions with `contextFolder` appear once under Projects, retaining explicit session kind in their row data.
3. Remaining `chat` sessions appear under Chat history.
4. Remaining `work` sessions appear under Work history.

`contextFolder` remains orthogonal metadata; it never changes `session_kind` or `execution_provider`.

## Ownership & Boundaries

| Capability | Production Owner | Boundary |
|---|---|---|
| Original Chat execution truth | Existing Hermes Chat transport/runtime | Work does not rewrite Chat execution as Skill Run |
| Skill Run execution truth | Remote Skill Run Provider + Main SkillRunService lifecycle | Local Hermes Chat DB is not the remote execution truth |
| Provider event validation/sanitization | Existing Main transport/parser owner | raw SSE, JWT, endpoint, raw tool args/result and raw artifact location never enter Renderer |
| Conversation projection | Renderer Chat provider adapters | Only sanitized DTO/projection may become Native ChatMessage |
| Native message presentation | Renderer MessageList and existing row components | No Skill/Provider-specific MessageList or result card |
| Session classification and cache DTO | Work Main Session metadata/index owner | Renderer cannot infer or write classification |
| Skill Run audit/restart | Existing Skill Run transcript store + continuation | Audit remains separate from Native presentation state |
| Artifact resource lifecycle | Main File Platform | Transcript references only safe ManagedFile identity |
| Approval/cancel/artifact retry/current phase | Skill Run compact control surface | Control actions do not become a second transcript history |
| Expert/HermesTask | OUT | No historical migration, classification, adapter or compatibility requirement |

## Dependencies & Cascading Effects

1. Session metadata/index foundation must precede Sidebar classification and live cache publication.
2. Stable turn/row identity and anchored history expansion must precede removal of `SkillRunTranscriptCard`; otherwise reopen parity cannot be proven.
3. Native `HistoryRow` must support lifecycle-only tool calls without fabricating provider arguments/results before Skill Run can reuse it.
4. `ConversationBusyState` must drive both composer gating and MessageList active/loading rows before the duplicate status transcript is removed.
5. Approval/cancel/artifact retry and current phase must remain reachable after activity history leaves the status bar.
6. Chat transport adapters that publish CachedSession must provide explicit `chat/hermes-chat`; they may not infer from returned session row contents.
7. Skill Run accepted state must persist `work/skill-run` metadata before publishing the cache row/event. Pre-provider-accept failure creates no formal work history.
8. One-time backfill covers only the supported Chat/Skill Run product dataset. Accepted Skill Run evidence maps to `work/skill-run`; remaining supported sessions map to `chat/hermes-chat`. It contains no Expert/HermesTask detection branch or compatibility promise.
9. Classification publication is an idempotent Main sequence: durable metadata → durable/updateable cache row → sanitized cache-changed event. Repeating any step must converge on one logical Session row.
10. Missing, corrupt, or scope-mismatched metadata fails closed from classified lists. Main emits a sanitized diagnostic and performs targeted repair during startup/sync from trusted Chat route ownership or accepted Skill Run evidence; Renderer never supplies a fallback classification.
11. Targeted repair cannot turn a pre-provider-accept Skill Run request into formal Work history. Repair may republish a valid cache row/event after metadata becomes durable.
12. Session deletion removes classification, cache identity, Skill Run sidecar/continuation and File associations through the existing Main deletion owner. Partial cleanup is reconciled on the next startup/sync and cannot resurrect a deleted cache row without an authoritative Session/accepted Run.
13. Presentation/Sidebar feature-flag rollback does not delete or downgrade durable classification, Skill Run audit or File Platform identity. Legacy readers may ignore new metadata fields; re-enabling the feature reuses the same rows without re-backfill.
14. Operability diagnostics contain only opaque session scope/id, failure stage and sanitized error code; no JWT, endpoint, prompt, raw Provider event or filesystem path.

## Risks & Kill Criteria

### Risks

- Partial metadata/cache writes can make a valid session temporarily absent from Sidebar.
- Adapter identities that omit clientRequestId/eventId/callId can merge separate turns or duplicate replayed events.
- Removing SkillRunTranscriptCard before control-surface parity can lose approval/cancel/retry access.
- Treating transport mode as provider type can reintroduce more than two classifications.
- Timestamp fallback can silently restore the current prompt/result inversion.
- Feature-flag rollback can create mixed cache rows unless readers fail closed on missing/invalid metadata.
- Unstable session_scope derivation can split one reconnecting Chat history or merge different tenant histories.

### Kill Criteria

Stop or roll back the affected stage if any of the following occurs:

- A second MessageList, Skill result transcript card, or provider-specific tool list is introduced.
- Renderer receives raw Provider SSE/JWT/endpoint/raw artifact location or writes classification.
- Skill Run activity is persisted as Hermes Chat native tool execution truth.
- Session kind is inferred at runtime from source/sessionId/toolName/message/contextFolder.
- A Skill Run replay produces duplicate reasoning/tool/result rows or changes prompt-before-result order.
- A pre-accept Skill Run failure creates a formal Work history row.
- Approval/cancel/artifact retry becomes unreachable after presentation migration.
- A third provider/session kind or Expert/HermesTask compatibility path is added without a new approved Architecture Decision.
- Missing/corrupt classification is silently treated as Chat instead of being repaired or kept out of classified lists.
- Rollback deletes durable metadata/audit or requires a destructive re-backfill when re-enabled.

## Rejected Alternatives

- Permanent `SkillRunTranscriptCard` presentation: rejected because it keeps a second transcript owner.
- RemoteRuntimeMessageList/SkillMessageList/SkillToolList: rejected because Native MessageList already owns presentation.
- Writing Skill Run activity into Hermes Chat `tool_calls`: rejected because it falsifies the execution fact source.
- Runtime classification from `source`, ID prefix, tool name, message content or context folder: rejected because those fields are transport/content details, not product metadata.
- Wall-clock merge of sidecar execution rows: rejected because timestamps cannot prove turn membership.
- Generic provider registry or Expert/HermesTask compatibility migration: rejected because v4.2 is a closed Chat + Skill Run architecture.
- Local Hermes proxying Skill Run execution: rejected because execution providers retain separate lifecycle owners.

Rejected provider/generalization options may be revisited only after a new product path or fact-source/Provider contract boundary is explicitly approved upstream. They cannot be revived as an RM implementation convenience.

## Roadmap Boundaries

### RM-01 — Session metadata and index foundation

Outcome: Main-owned closed classification (`chat/hermes-chat`, `work/skill-run`), scoped durable Session identity, supported two-class backfill, explicit CachedSession projection, fail-closed repair/diagnostics, deletion cleanup, non-destructive rollback compatibility and Chat transport adapter coverage. No Sidebar redesign or transcript migration.

### RM-02 — History classification and live publication

Outcome: Pinned/Projects/Chat history/Work history precedence is implemented from explicit metadata; original Chat and accepted Skill Run publish cache changes immediately. No Skill Run Native transcript removal.

Depends on RM-01.

### RM-03 — Skill Run Native projection and reopen parity

Outcome: sanitized reasoning/tool/clarify/result/artifact projection uses Native ChatMessage/MessageList with stable identity, in-place lifecycle updates, provider sequence and anchored history expansion. Live/reopen/restart parity is proven while compatibility presentation remains rollback-only.

Depends on RM-01. May proceed in parallel with RM-02 after the shared CachedSession/metadata contract is frozen.

### RM-04 — Duplicate presentation removal and rollback closure

Outcome: SkillRunTranscriptCard and status-bar activity history leave the main transcript path; compact controls remain; feature flags and rollback behavior are proven; no duplicate presentation owner remains.

Depends on RM-02 and RM-03.
