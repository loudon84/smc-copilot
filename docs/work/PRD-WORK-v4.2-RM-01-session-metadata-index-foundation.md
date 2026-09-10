---
work_item_id: RM-01
version: 1.0.3
status: APPROVED
target_branch: work/prd-v4.2
review_verdict: PASS
approved_at: 2026-09-11T00:12:06.3134518+08:00
source_revision: AD-WORK-v4.2-UNIFIED-CONVERSATION-EXECUTION-PROVIDER@1.0.1/RM-01
grounded_commit: 2d215626030a366dad26bdddcb12f1a57a09a051
---

# WORK v4.2 RM-01 — Session Metadata and Index Foundation

## Scope

本 Stage 交付 Work Main 唯一拥有的 Session metadata/index 基础，使每个受支持 Session 都以可信作用域和显式产品分类进入 cache projection。v4.2 的分类集合是封闭的：原有 Chat 对应 `chat/hermes-chat`，新 Skill Run 对应 `work/skill-run`。

本 Stage 只建立持久身份、分类写入、cache projection、受支持数据回填、定向修复、删除清理、诊断与非破坏回滚基础。Sidebar 分组/排序属于 RM-02；Skill Run Native transcript 与历史重放属于 RM-03；重复展示移除属于 RM-04。

## Non-Goals

- 不实现 Sidebar 的 Chat history / Work history 分组或视觉改版。
- 不迁移 Skill Run transcript，不移除 `SkillRunTranscriptCard`，不改变 Native MessageList。
- 不修改 Skill Run public contract、Hermes Gateway/Runtime API 或 Provider 原始数据格式。
- 不创建通用 Provider registry、第三种 `session_kind` 或第三种 `execution_provider`。
- Expert/HermesTask 完全不在范围内：不识别、不分类、不兼容、不迁移、不回填。
- 不根据 `source`、session ID、tool name、message body、context folder、transport mode 或 Renderer 状态推断产品分类。

## Current Capability Inventory

| Capability | Current State | Production Owner | Source Anchor | Grounded Observation |
|---|---|---|---|---|
| Local Session cache persistence and targeted upsert | EXISTS/PARTIAL | Work Main Session cache | `apps/work/src/main/session-cache.ts#CachedSession`; `#syncSessionCache`; `#upsertCachedSession` | Cache row and mutation path exist, but the DTO has no explicit product classification or trusted logical scope. |
| Local Chat Session visibility | EXISTS/PARTIAL | Work Main Chat IPC | `apps/work/src/main/ipc/register.ts` Chat session-start/cache routes | A valid Chat Session can become visible to Main, but session-start currently does not durably classify and publish it through the metadata/index sequence. |
| Remote Dashboard and SSH cache producers | EXISTS/PARTIAL | Work Main transport adapters | `apps/work/src/main/remote-sessions.ts#remoteListCachedSessions`; `apps/work/src/main/ssh-remote.ts#sshListCachedSessions` | Both return CachedSession-compatible rows without explicit product classification. They are Chat transports, not execution providers. |
| Renderer cache consumption | EXISTS/PARTIAL | Work preload/shared DTO boundary and Renderer | `apps/work/src/preload/index.d.ts`; `apps/work/src/shared/session-cache-events.ts`; `apps/work/src/renderer/src/screens/Chat/hooks/useChatIPC.ts` | Renderer can consume and refresh cache rows/events, but current rows do not carry authoritative classification. |
| Skill Run provider-accept boundary | EXISTS/PARTIAL | Work Main Skill Run subsystem | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#shouldMaterializeSkillRunSession`; `apps/work/src/main/skill-run/skill-run-ipc.ts#persistSanitizedRun` | Materialization requires durable Provider acceptance evidence (`providerRunId`); classification metadata and ordered cache publication are missing. |
| Skill Run session-mode/audit association | EXISTS | Work Main Skill Run subsystem | `apps/work/src/main/skill-run/skill-run-session-mode-store.ts`; transcript/continuation stores | Durable associations exist independently of Renderer presentation and remain authoritative Skill Run evidence. |
| Session deletion | EXISTS/PARTIAL | Work Main Sessions deletion owner | `apps/work/src/main/sessions.ts#deleteSessionRows` | Existing rows and associations can be removed, but the new metadata/index cleanup and interrupted-cleanup reconciliation do not yet exist. |
| Explicit scoped Session classification | MISSING | No production owner today | Current `CachedSession` and adapters | No durable closed mapping, Main-derived `session_scope`, fail-closed validation, backfill or repair contract exists. |

## Target End-State Inventory

| Capability | Target State | Production Owner | Boundary / Observable Result |
|---|---|---|---|
| Logical Session identity | ADD | Work Main Session metadata/index | Durable identity is `session_scope + profile_id + session_id`; scope is derived from trusted Main configuration and is opaque outside Main. |
| Closed Session classification | ADD | Work Main Session metadata/index | Only `chat/hermes-chat` and `work/skill-run` are valid pairs; invalid or incomplete pairs are rejected. |
| Explicit cache projection | MODIFY | Work Main cache producers | Every supported local, Remote Dashboard and SSH cache row carries the authoritative pair; transport does not alter the Chat pair. |
| Original Chat publication | MODIFY | Work Main Chat/session integration | A valid Chat Session persists `chat/hermes-chat` before its cache row and sanitized cache-change event become observable. |
| Skill Run accepted publication | MODIFY | Work Main Skill Run integration | `work/skill-run` becomes durable only after Provider acceptance is durable; a pre-accept failure creates no formal Work Session/cache row. |
| Supported two-class backfill | ADD | Work Main metadata/index repair | Accepted Skill Run evidence maps to `work/skill-run`; every other supported current Chat Session maps to `chat/hermes-chat`; repeated execution converges without duplicates. |
| Fail-closed validation and targeted repair | ADD | Work Main metadata/index repair | Missing, corrupt or scope-mismatched metadata is excluded from classified projections, diagnosed safely, and repaired only from trusted Chat ownership or accepted Skill Run evidence. |
| Delete and interrupted-cleanup convergence | MODIFY | Work Main Sessions deletion owner | Classification/cache/Skill Run associations are cleaned consistently; restart/sync cannot resurrect a deleted row without authoritative Session or accepted Run evidence. |
| Non-destructive rollback compatibility | ADD | Work Main metadata/index | Older presentation readers may ignore additive fields; disabling consumption never deletes/downgrades classification, audit or File identity. |
| Renderer classification authority | KEEP/PROHIBIT | Work Main remains owner | Renderer reads explicit fields only and cannot derive, override, persist or repair classification/scope. |

## Change Classification

| Change ID | Classification | Requirement | Production Owner | Boundary |
|---|---|---|---|---|
| C01 | ADD | Introduce the Main-owned logical Session identity and closed classification domain. | Work Main Session metadata/index | `session_scope` is trusted and opaque; only two valid product/provider pairs exist. |
| C02 | MODIFY | Extend the sanitized cache projection contract and every supported cache producer with explicit classification. | Work Main cache producers | Local, Remote Dashboard and SSH preserve `chat/hermes-chat`; transport is never a provider. |
| C03 | MODIFY | Persist original Chat classification before publishing a newly valid Chat Session. | Work Main Chat/session integration | Renderer focus, refresh timers and inferred content are not prerequisites. |
| C04 | MODIFY | Persist Skill Run classification only after durable Provider acceptance, before cache publication. | Work Main Skill Run integration | Pre-accept failure creates no formal Work history identity. |
| C05 | ADD | Add idempotent two-class backfill plus fail-closed validation, sanitized diagnostics and targeted repair. | Work Main metadata/index repair | No Expert/HermesTask detector, compatibility promise or migration branch is permitted. |
| C06 | MODIFY | Extend deletion and interrupted-cleanup reconciliation to metadata/index associations. | Work Main Sessions deletion owner | Deleted Sessions cannot be recreated from stale cache/sidecar state. |
| C07 | ADD | Preserve durable metadata during presentation/Sidebar rollback and make cache publication idempotent. | Work Main metadata/index | Rollback may stop consumption but cannot destroy or downgrade authoritative data. |
| C08 | KEEP | Preserve existing Chat execution truth, Skill Run audit/continuation truth, File Platform ownership and sanitized Provider boundary. | Existing owners | RM-01 changes classification/index only; no execution or artifact truth is rewritten. |
| C09 | PROHIBIT | Prevent Renderer-side classification/scope inference or writes. | Work Main enforcement + sanitized DTO boundary | Missing/invalid metadata fails closed instead of silently becoming Chat. |

## Behaviour and Boundaries

### Closed classification contract

The only valid values are:

| `session_kind` | `execution_provider` | Meaning |
|---|---|---|
| `chat` | `hermes-chat` | Original Chat, including its supported Direct, Remote Dashboard and SSH transports |
| `work` | `skill-run` | New Skill Run after durable Provider acceptance |

The pair is atomic: partial or cross-paired values are invalid. No unknown/default value is exposed as a classified row. Future product paths require a new approved Architecture Decision and are not reserved inside RM-01.

### Identity and trust boundary

Main derives an opaque `session_scope` from trusted connection/account configuration. Reconnecting to the same configured domain preserves logical identity; changing tenant/account/domain separates it even when `profile_id` and `session_id` collide. Renderer input, raw endpoint strings and credentials cannot define or override the scope and are not exposed in cache rows or diagnostics.

### Durable publication order

For both product paths the convergent order is: durable authoritative evidence → durable classification metadata → durable/updateable cache row → sanitized cache-change event. Retrying any completed prefix must converge on one logical row.

Original Chat authoritative evidence is a valid Session visible through its trusted Chat route. Skill Run authoritative evidence is durable Provider acceptance with its accepted Run identity. A request that fails before that boundary may retain non-session diagnostics, but cannot create `work/skill-run` metadata or a formal cache row.

### Backfill and repair

The one-time supported-data backfill and later targeted repair use the same closed precedence: accepted Skill Run evidence wins `work/skill-run`; otherwise an authoritative supported Chat Session becomes `chat/hermes-chat`. A row with neither proof, corrupt metadata, or a scope mismatch remains absent from classified projections until Main can repair it. Renderer never supplies fallback data.

Backfill and repair are idempotent, scope-aware and safe after interruption. They never inspect or manufacture an Expert/HermesTask history class and never reinterpret transport types as execution providers.

### Deletion, rollback and diagnostics

Deletion is coordinated by the existing Main deletion owner and removes the logical metadata/index row, cache identity and applicable Skill Run associations. Restart/sync reconciles interrupted cleanup but does not resurrect an identity solely from stale derived state.

Presentation or Sidebar feature rollback is non-destructive: additive classification data, Skill Run audit/continuation and File Platform identity remain durable. Diagnostics contain only opaque scope/profile/session identifiers, operation stage and sanitized error code; they exclude credentials, JWT, endpoint, prompt/message content, raw Provider events and filesystem paths.

## Acceptance Criteria

- **AC-01**: [C01] The persisted validator accepts exactly `chat/hermes-chat` and `work/skill-run`; it rejects missing, partial, cross-paired, unknown and third-provider values without silently defaulting them.
- **AC-02**: [C01] Two Sessions with the same `profile_id + session_id` but different trusted domains remain isolated, while reconnecting to the same configured domain resolves the same opaque logical identity without exposing endpoint or credential material.
- **AC-03**: [C02/C03] Each supported original Chat path—including Direct, Remote Dashboard and SSH—produces an explicit `chat/hermes-chat` cache projection only after durable metadata exists; repeated publication yields one logical row and one current classification.
- **AC-04**: [C04] After Provider acceptance becomes durable, a Skill Run persists `work/skill-run` before its cache row/event is observable; retried materialization converges on the same logical row.
- **AC-05**: [C04] A Skill Run request that fails, is rejected or is cancelled before durable Provider acceptance creates no `work/skill-run` metadata and no formal Work cache row.
- **AC-06**: [C02/C09] Every supported sanitized CachedSession producer returns the explicit pair from Main-owned metadata; Renderer classification remains identical across refresh/reopen and contains no inference or write fallback.
- **AC-07**: [C05] Running supported-data backfill repeatedly maps accepted Skill Run evidence to `work/skill-run` and all remaining authoritative supported Chat Sessions to `chat/hermes-chat` without duplicates, cross-scope collisions, third classes, or Expert/HermesTask logic.
- **AC-08**: [C05/C09] Missing, corrupt and scope-mismatched metadata is excluded from classified projections, emits only sanitized diagnostics, and is repaired only from trusted Chat ownership or accepted Skill Run evidence; an unrecoverable row stays failed closed.
- **AC-09**: [C06] Deleting either class removes its metadata/index/cache identity and applicable associations; interruption followed by restart/sync converges to the deleted state and stale derived records alone cannot resurrect the row.
- **AC-10**: [C07] Repeated metadata/cache/event publication and an interrupted retry converge without duplicate logical rows; disabling the downstream presentation/Sidebar consumer preserves classification, audit/continuation and File identities for later re-enable.
- **AC-11**: [C08] Original Chat execution state remains owned by the existing Chat path, Skill Run execution/audit remains owned by its existing subsystem, and File Platform identity remains unchanged; RM-01 adds no Provider contract or transcript mutation.
- **AC-12**: [C01/C02/C05/C09] `contextFolder`, transport, `source`, session ID shape, tool name and message content cannot change classification; no third provider/session kind and no Expert/HermesTask recognition, compatibility, migration or backfill branch is present.
- **AC-13**: [C01/C05/C06] Concurrent operations on one logical Session—classification, repair, publish and delete—are serialized or conflict-resolved so the durable end state is atomic, valid and reproducible after restart.
- **AC-14**: [C01/C05] Diagnostics and cache DTOs expose no raw endpoint, credential/JWT, prompt/message content, raw Provider event, raw artifact location or filesystem path.

## Definition of Done

- **DOD-01**: All blocking acceptance criteria have fresh, recorded implementation evidence; no Todo completion or cache event alone is treated as proof.
- **DOD-02**: Durable metadata, cache projection, Chat publication, accepted Skill Run publication, backfill/repair and deletion/restart convergence satisfy the closed two-pair contract without a third mode or Expert/HermesTask branch.
- **DOD-03**: The implementation preserves existing Chat execution truth, Skill Run audit/continuation truth, File Platform ownership and the sanitized Main-to-Renderer boundary.
- **DOD-04**: Repeated/interrupted metadata operations and downstream presentation rollback preserve one valid logical Session identity without duplicates, secret exposure, destructive re-backfill or stale-row resurrection.

## Evidence Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL01 | AC-01/AC-02 closed classification and scoped identity | Only the two valid pairs persist; scope collision/reconnect cases resolve correctly. | YES | No current classification domain exists. | NOT_TESTED | NEW_EVIDENCE | New capability. |
| CL02 | AC-03 original Chat durable classification/publication | Local and transport-backed Chat projections carry `chat/hermes-chat` after durable metadata. | YES | Current Chat/cache source inspection; focused cache/Chat tests passed at grounded commit. | RESIDUAL_GAP | TARGETED_RERUN+NEW_EVIDENCE | Existing paths lack classification and ordered publication. |
| CL03 | AC-04 accepted Skill Run classification/publication | Accepted Run materializes one `work/skill-run` identity before cache event visibility. | YES | Current materializer requires Provider Run identity; focused materializer/IPC tests passed at grounded commit. | PROVEN_BUT_AFFECTED | TARGETED_RERUN+NEW_EVIDENCE | New metadata write and ordering affect the proven path. |
| CL04 | AC-05 pre-accept negative boundary | Pre-accept failure/rejection/cancellation produces no formal Work Session/cache row. | YES | Current materialization predicate requires Provider Run identity; focused negative-path tests passed at grounded commit. | PROVEN_BUT_AFFECTED | TARGETED_RERUN | New classification side effects must preserve the negative boundary. |
| CL05 | AC-06 all cache producers explicit; Renderer read-only | Local, Remote Dashboard and SSH rows expose authoritative fields and Renderer has no inference/write path. | YES | Current adapter/DTO inspection. | RESIDUAL_GAP | NEW_EVIDENCE | Fields and authority boundary are absent today. |
| CL06 | AC-07/AC-08 two-class backfill and fail-closed repair | Repeated backfill/repair converges; corrupt/unknown data is excluded; no Expert branch exists. | YES | No current backfill/repair implementation exists. | NOT_TESTED | NEW_EVIDENCE | New capability. |
| CL07 | AC-09 deletion convergence | Delete and interrupted restart cleanup remove metadata/cache/associations without resurrection. | YES | Existing Session deletion path and focused cache/session tests passed at grounded commit. | PROVEN_BUT_AFFECTED | TARGETED_RERUN+NEW_EVIDENCE | New metadata/index associations extend cleanup responsibility. |
| CL08 | AC-10 idempotent publication and non-destructive rollback | Retry produces one row; downstream rollback retains durable facts and re-enable needs no re-backfill. | YES | Existing targeted cache upsert/event mechanism. | PROVEN_BUT_AFFECTED | TARGETED_RERUN+NEW_EVIDENCE | New ordered multi-step publication and retained fields. |
| CL09 | AC-11 fact-source and artifact ownership preservation | No Chat/Skill Run execution truth, public Provider contract, transcript, or File identity changes. | YES | Architecture and current subsystem ownership anchors. | PROVEN_FRESH | REUSE_EVIDENCE+TARGETED_RERUN | Regression guard across touched integration boundaries. |
| CL10 | AC-12 classification independence and two-mode exclusion | Context/transport/content cannot affect classification; no third/Expert path exists. | YES | Approved Architecture Decision and explicit user constraint. | PROVEN_REQUIREMENT | NEW_EVIDENCE | Implementation must demonstrate absence of forbidden branches. |
| CL11 | AC-13 concurrent operation/restart convergence | Interleaved classify/repair/publish/delete ends in one valid durable state after restart. | YES | No current classification/index concurrency behavior exists. | NOT_TESTED | NEW_EVIDENCE | New capability and failure mode. |
| CL12 | AC-14 sanitized data boundary | Cache rows and diagnostics contain no prohibited secrets/content/paths. | YES | Existing sanitized Skill Run parsing boundary. | PROVEN_BUT_AFFECTED | TARGETED_RERUN+NEW_EVIDENCE | New DTO and diagnostics expand the inspected surface. |

All blocking claims require fresh completion evidence before RM-01 can reach DONE. Evidence that changes only presentation, Sidebar grouping or transcript behavior is not valid RM-01 completion evidence.
