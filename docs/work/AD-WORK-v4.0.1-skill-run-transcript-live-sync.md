---
decision_id: AD-WORK-v4.0.1-SKILL-RUN-TRANSCRIPT-LIVE-SYNC
version: 1.0.0
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-08T13:23:54Z
source_revision: PRD-WORK-v4.0.1-M6i@1.0.0
grounded_commit: 9c93c239c74ff4187f547001a0c2a236aec85db4
---

# Skill Run Transcript and Session Live-Sync Architecture Decision

## Problem

Skill Run 已能执行、恢复、产出 Result/Artifact 并广播 sanitized projection，但 Projection 只驱动 Composer 上方状态条，没有进入唯一 Chat transcript；现有 session materializer 只写粗粒度 user/assistant 两行，Sidebar cache 更新后也没有事件通知 Renderer。用户因此无法实时看到 Skill turn，重开 Session 后无法恢复完整 activity timeline，首次 Skill Session 还需手工刷新才出现在 Sidebar。

## Decision Drivers

- Skill execution 必须继续是现有 Chat 的一种 execution mode，不得出现第二个 Chat、Session 或 File Platform Owner。
- submit 后应立即出现完整 Prompt 和一个稳定的 Skill Card；后续 Projection 必须原位更新同一 Card。
- Live Projection 继续保持最多 32 条 sanitized activity，IPC payload 不随 Session 历史增长。
- 重开 Session 必须恢复同一 `clientRequestId` 对应的完整 sanitized activity timeline，并支持同 Session 多次 Skill invocation。
- 完整 Prompt 必须本地持久化，但不得加入跨窗口 Projection 或 telemetry。
- Provider raw event、URL、credential、artifact bytes 和 internal snapshot 不得进入 Renderer 或 durable payload。
- RM-13/RM-14 的 streaming delta contract/import/mapping 不属于本增量。

## Evidence Baseline

| Claim | Type | Evidence |
|---|---|---|
| 父架构要求 accepted 后 upsert user/assistant transcript，历史 transcript 保留，并复用现有 session/messages/sidebar | REPO_FACT | `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md#Session persistence` |
| Main 已在 projection broadcast 前执行 continuation upsert 与 transcript materialization | REPO_FACT | `apps/work/src/main/skill-run/skill-run-ipc.ts#broadcastProjection` |
| 当前 materializer 只用 `promptSummary` 写 user row，并把 assistant 压成执行中/终态文本 | REPO_FACT | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript` |
| `SkillRunService` 保留完整 start request，但 Projection 只带 120 字摘要和最多 32 条 sanitized activity | REPO_FACT | `apps/work/src/main/skill-run/skill-run-service.ts#ActiveRun`; `apps/work/src/main/skill-run/skill-run-service.ts#appendSanitizedActivity` |
| Renderer store 只提供每 Session 最新 Projection，Chat 只把它投影到 `SkillRunStatusBar` | REPO_FACT | `apps/work/src/renderer/src/modules/skill-run/store.ts#getLatestSkillRunProjectionForSession`; `apps/work/src/renderer/src/screens/Chat/Chat.tsx` |
| Session loader 已把普通 messages/reasoning/tool rows映射成 `HistoryItem`，是唯一历史读取入口 | REPO_FACT | `apps/work/src/main/sessions.ts#getSessionMessages`; `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#dbItemsToChatMessages` |
| `upsertCachedSession` 只更新 profile-scoped JSON cache；Sidebar 依靠 focus/timer/context-folder 事件刷新 | REPO_FACT | `apps/work/src/main/session-cache.ts#upsertCachedSession`; `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx` |
| 产品要求把 Live、Restart、Resume、Sidebar 和 Session Files 收敛为一个可审计 Chat turn | USER_CONSTRAINT | `docs/work/PRD-WORK-v4.0.1-M6i.md` |

## Current Capability

- Main lifecycle、Contract parser、SSE/poll、idempotency、cancel、approval、artifact 和 continuation 已存在并保持 Owner 不变。
- Main 已能把 accepted Skill Run 物化成现有 Hermes session/messages，并更新 profile-scoped Sidebar cache。
- Renderer 已能接收 bounded `SkillRunProjection`，但只保留最新 Session projection，未桥接到 `messages`。
- Existing Chat message union、MessageList、Session history loader 和 File Platform 均可扩展。
- 当前没有能在 terminal continuation 清理后保存完整 Skill activity timeline 的既有字段；把 Provider activity 塞入 Hermes `tool_calls` 会混淆合同语义。

## Options Considered

### Option A — 只扩展普通 messages 文本

继续只写 user/assistant rows，把 activity 渲染成一段文本。实现最小，但会丢失 `eventId`、`callId`、approval/clarify 类型和完整 100+ activity 顺序，无法稳定原位合并 tool started/completed，也会阻碍未来 delta 复用。拒绝。

### Option B — Existing Session Owner 管理同库 sidecar execution audit（选择）

在现有 Hermes `state.db` 内增加 Desktop-owned Skill Run/Activity sidecar 表。普通 `messages` 仍保存完整用户 Prompt 与可读 Assistant fallback；sidecar 只保存 Work sanitized DTO，并由现有 Session loader 按 `clientRequestId` 合并为结构化 Skill Card。它扩展现有 Session Owner，不建立第二个 Session DB、conversation index 或独立历史 API。

### Option C — 让 continuation 永久保存完整 timeline

把 `desktop_session_continuations` 从 active recovery 扩成 terminal history。会把 recovery SOT 和历史 SOT混在一起，阻止 terminal cleanup，并迫使 bounded Projection/continuation 承担无限增长数据。拒绝。

### Option D — 新建 Skill history DB 或通过 IPC加载完整历史

独立数据库会形成第二 Session Owner；完整历史 IPC 会随 Session 无限增长并扩大 Renderer trust surface。拒绝。

## Decision

采用 Option B。新增的数据结构是 Existing Session Owner 下的 execution-audit sidecar，不是新的 conversation/session store。`messages`、`sessions`、profile-scoped `sessions.json`、continuation 与 File Platform 继续各自承担原有职责；Main Skill Run lifecycle 只提供已脱敏的 run/activity delta，Session persistence 负责同库写入、历史合并和删除。

完整 Prompt 从 Main-owned start request 写入普通 user message 与 sidecar run row，不加入 `SkillRunProjection`。每个已枚举 activity 在进入 32 条 Projection 窗口前，以 Work sanitized shape 交给 durable writer；raw/unknown Provider event 永不持久化。Sidecar event 以 `(clientRequestId, eventId)` 去重，Live compacted tool activity 可按 `callId` 原位更新，durable event history仍保持不可变。

## Target Architecture

```text
Provider SSE / Poll
        ↓
Main parser → sanitized run/activity delta
        ├─→ SkillRunProjection (bounded 32) → existing IPC → Renderer store
        │                                            ↓
        │                                  existing Chat messages
        │                                            ↓
        │                                  one live Skill Card
        │
        └─→ Existing Session persistence owner
              ├─ sessions/messages (full prompt + readable fallback)
              ├─ Skill Run sidecar audit (complete sanitized timeline)
              └─ profile session cache
                         ↓
                 session-cache changed signal
                         ↓
                 Sidebar cache-only refresh

Session reopen → existing getSessionMessages
              → merge messages + sidecar by clientRequestId
              → replace matching fallback assistant row
              → one historical Skill Card
```

Live submit optimistically appends one user bubble and one pending Skill Card keyed by `clientRequestId`. Projection updates never append a second card. Historical merge recognizes `skill-run:{clientRequestId}:assistant` and replaces that fallback row with the sidecar-backed card, preventing duplicate Assistant content. Multiple invocations in one Session remain separate because identity is always `clientRequestId`, never `providerRunId`、`sessionId` 或 `toolName`。

## Ownership & Boundaries

| Capability | Production Owner | Boundary |
|---|---|---|
| Provider lifecycle、SSE/poll、terminal monotonic、sanitization | Main `SkillRunService` / parser | Produces only Work DTO and sanitized durable deltas |
| Live Skill projection cache | Existing Renderer `modules/skill-run` store | Bounded current-session projections only; no raw event/history IPC |
| Live/historical Skill Card | Existing Chat / MessageList | Presentation and local optimistic upsert only; no persistence decisions |
| Session rows、messages、Skill execution sidecar、history merge/delete | Existing Main Session persistence owner | Same `state.db`; no second DB, session list or conversation identity |
| Sidebar cache and change signal | Existing Main session-cache + IPC/Preload boundary | Signal carries only `sessionId` and `created|updated|deleted`; Renderer rereads JSON cache without DB sync |
| Artifact references and actions | Existing File Platform | Card displays descriptors/ManagedFile references only |
| Restart recovery | Existing continuation owner | Non-terminal recovery only; terminal history stays in messages/sidecar |
| Approval action | Existing Skill Run decision API | Transcript may invoke the same command; no second decision IPC |

Renderer never receives Provider endpoint/token/raw payload/internal snapshot. Sidecar payload may contain full prompt/result and sanitized activity in the local profile DB, but telemetry must not copy their bodies. Clarify remains read-only until Provider publishes a response contract。

## Dependencies & Cascading Effects

- Hard dependencies: RM-04 lifecycle/recovery、RM-05 Result/Artifact、RM-08 activity mapping、RM-09 approval decision；这些 Item 已 DONE。
- RM-15 does not depend on RM-13/RM-14。Streaming delta 以后只扩展 parser/projection text merge，并复用本决策的 Skill Card 与 Session history。
- Main persistence must receive each sanitized activity before Projection capping;仅订阅 bounded list 无法证明 100 activity 完整恢复。
- Session delete 必须在 Existing Session Owner 内同时删除 sidecar children，避免 orphan；删除顺序或 transaction 由后续 Plan Grounding 决定。
- Sidebar signal 必须在 cache mutation 成功后发出；Renderer 只调用 `listCachedSessions`，不触发昂贵的 `syncSessionCache`。
- DB 不可用或 sidecar write 失败不得改变 Provider Run phase；Live UI继续工作，错误进入本地可诊断日志/allow-listed telemetry，后续 projection 可幂等重试 run state。无法恢复的 activity gap 必须可观测，不得伪造完整历史。
- Local Chat、Expert history、remote session loader 与 File Platform 的既有映射不得改变语义。

## Risks & Kill Criteria

### Pre-mortem

- Live optimistic Card 与 DB reload card 使用不同 identity，导致重复 Bubble。
- Sidecar writer从 capped Projection 回推 history，超过 32 条后不可恢复。
- 普通 assistant fallback 与 Skill Card 同时进入历史，重复展示 Result。
- session cache signal触发完整 DB sync，产生高频 I/O。
- payload_json 意外保存 raw event、tool arguments 或 credential。
- 新 sidecar 被调用方当成独立 Session SOT，形成双写漂移。

### Kill Criteria

出现以下任一情况必须停止实施并返回 Architecture Review：

- 新增第二个 Chat 页面、Session DB、Session list API 或 File store；
- Renderer 解析 Provider raw event、直接访问 Backend、token、URL 或 artifact bytes；
- durable writer只能看到 capped 32 条 Projection，无法证明完整 timeline；
- `clientRequestId` 不能唯一关联 live card、fallback row 与 sidecar run；
- 把 NoDeskClaw activity 强制写入 Hermes `tool_calls` / reasoning 字段；
- Sidebar change signal导致每个 event 执行 state.db full sync；
- 把 RM-13/RM-14 streaming delta、未合同化 clarify response、tool arguments/output 合入 RM-15；
- sidecar 成为 messages/session 之外的独立 conversation truth，而非 Session-owned audit extension。

## Rejected Alternatives

- 纯文本 assistant history：只适合 fallback，不足以恢复 typed timeline。
- 永久 continuation timeline：混淆 recovery 与 durable history。
- Renderer 直接持久化：越过 Main trust boundary，且后台/重启不可靠。
- raw Provider event passthrough：违反 sanitized IPC 和 contract lock。
- 新 Skill Chat / 新 Skill Session DB：创建平行产品 Owner。
- 复用 Hermes `tool_calls`：合同语义不同，会污染 Local/Expert history。
- 等 RM-13/RM-14 后一起做：delta 只会继续进入状态条，不能解决当前闭环缺口。

## Roadmap Boundaries

新增一个独立 RM-15，依赖 RM-04、RM-05、RM-08、RM-09，初始 READY。Outcome 是把现有 Skill Run Projection 接入唯一 Chat transcript，保存完整 sanitized execution timeline，并在 Session cache 变化后实时刷新 Sidebar。

RM-15 一个 Item 内允许按结果划分：Live transcript、Session-owned durable audit/history merge、Sidebar signal、Recovery/regression。Stage PRD 负责冻结 Capability/Owner/AC；Plan 再决定 exact files、symbols 和 Todo ownership。

RM-15 明确排除 RM-13/RM-14 streaming delta、Provider contract changes、Clarify response、tool args/results、Artifact transport重写、Expert/Local removal。RM-15 DONE 后不自动改变 RM-13/RM-14 的 BACKLOG 状态。
