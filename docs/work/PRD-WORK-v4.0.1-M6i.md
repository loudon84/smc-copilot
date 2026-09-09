# PRD-WORK-v4.0.1-M6i — Skill Run Transcript & Session Live-Sync Closure

```yaml
prd_id: PRD-WORK-v4.0.1-M6i
title: Skill Run Transcript & Session Live-Sync Closure
version: 1.0.0
status: PROPOSED
target_branch: work/prd-v4.0
target_app: apps/work
roadmap_item: RM-15
parent_architecture:
  - docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md
  - docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md
related_decision:
  - docs/work/AD-WORK-v4.0.1-streaming-delta.md
depends_on:
  - RM-04
  - RM-05
  - RM-08
  - RM-09
does_not_depend_on:
  - RM-13
  - RM-14
target_release: work-v4.0.1-m6i
```

---

## 1. 背景与问题定义

当前 `apps/work` 已完成 Skill-first 主链路：

```text
Layout
  → Chat
  → Skill Catalog
  → SkillRunService
  → NoDeskClaw Backend
  → Skill Run
  → SSE / Poll
  → SkillRunProjection
  → Renderer
```

现有架构明确要求 Skill execution 是 **Chat 内的一种 execution mode**，不得创建第二套 Chat、Session 或 File Platform；Main Process 负责 Skill Run lifecycle、SSE/poll、contract parsing、continuation 和 sanitized projection。

当前 RM-01～RM-12 已完成，RM-13、RM-14 专用于未来 Streaming Delta Contract Import / Mapping，目前仍为 BACKLOG。

现阶段 Skill Run 已可以：

* 选择 Skill；
* 启动真实 Skill；
* 接收 SSE；
* polling recovery；
* cancel；
* restart continuation；
* Result；
* Artifact；
* reasoning summary；
* tool call；
* clarify；
* approval；
* Session materialization。

但当前用户实际看到的是：

```text
Skill 执行正常
    ↓
输入框上方 SkillRunStatusBar 正常刷新
    ↓
执行完成

但是：

Chat Transcript 不更新
过程不进入 Chat
调用链不进入 Chat
Result 不立即进入 Chat
左侧聊天记录不立即出现
必须人工刷新后才能打开
历史 Session 无法恢复完整执行过程
```

这已经不是 Provider 执行问题，而是 **Work 内部 Skill Run Projection、Chat Transcript、Session Persistence、Sidebar Session Cache 四个模块之间没有形成闭环**。

---

# 2. 当前实现基线

## 2.1 SkillRunService 已经具备完整 Live Projection 主链

当前：

```text
Provider SSE
   ↓
parseSkillRunEvent()
   ↓
SkillRunProjection
   ↓
updateProjection()
   ↓
emit()
```

`SkillRunService` 已维护：

```ts
SkillRunProjection {
  clientRequestId
  providerRunId
  toolName
  promptSummary
  sessionId
  phase
  displayStage
  lastEventId
  eventSeq
  text
  artifacts
  activities
}
```

并通过 `subscribe()` 向外发送 Projection。

SSE 已支持：

```text
assistant.message
reasoning.summary
tool.call
clarify.requested
approval.requested
run completed / failed / cancelled
artifact
```

并将受支持事件映射为 sanitized Activity。

---

## 2.2 Main → Renderer IPC 已经存在

Main 当前通过：

```ts
SKILL_RUN_IPC_CHANNELS.ON_PROJECTION_CHANGED
```

向全部 BrowserWindow 广播 Projection。广播前还会：

```text
upsertSkillRunContinuationProjection()
materializeSkillRunSessionTranscript()
```

因此：

> Provider → Main → IPC 这一段不是当前主要问题。

---

## 2.3 Renderer 已经正确接收到 Projection

Renderer `modules/skill-run/store.ts` 已：

```ts
window.hermesAPI.skillRun.onProjectionChanged(...)
    → upsertSkillRunProjection(...)
    → emit()
```

并可以按 `sessionId` 查询最新 Projection。

---

## 2.4 当前 Chat 只消费“状态”，没有消费“Transcript”

`Chat.tsx` 当前维护：

```text
messages
    → MessageList
    → 中央 Chat Transcript

activeSkillProjection
    → SkillRunStatusBar
    → Composer 上方状态区
```

两者没有建立 Projection → ChatMessage 的桥接。

因此 Skill Run 执行过程中：

```text
activeSkillProjection ✅
messages ❌
```

最终表现就是截图中的：

```text
中央 Chat 空白
底部状态显示 Skill completed successfully
```

相比之下，Expert Run 已经存在：

```text
ExpertProjection
  → setMessages()
  → user bubble
  → assistant bubble
  → running/final update
```

所以 Skill Run 需要补齐同等级的 Transcript Adapter，而不是重新设计 Chat。

---

# 3. 当前设计缺陷

## 3.1 Live Projection 与 Chat Transcript 是两个独立状态域

当前没有：

```text
SkillRunProjection
       ↓
SkillRun Transcript Adapter
       ↓
messages
```

所以 Skill execution 只是一个“Composer status component”，并没有真正成为 Chat turn。

---

## 3.2 `skill-run-session-materialize.ts` 只保存粗粒度两条消息

当前物化逻辑只写：

```text
user
assistant
```

Assistant 内容主要是：

```text
[Executing skill: xxx]

[Skill execution failed: xxx]

[Skill execution cancelled by user]

projection.text
```

以下信息均没有 durable persistence：

```text
reasoning.summary
tool.call
approval.requested
clarify.requested
event_seq
event_id
step execution
activity timeline
```

因此“过程 → 调用链 → 结果”在重开 Session 后无法恢复。

---

## 3.3 用户 Prompt 被截断

Skill Projection 当前：

```ts
promptSummary: input.prompt.slice(0, 120)
```

而 materialize 又把：

```ts
projection.promptSummary
```

作为用户消息写入 DB。

意味着用户输入超过 120 字符时，Session 历史不是原始 Prompt。

这是数据完整性问题，必须修复。

---

## 3.4 `activities` 当前明确是 transient state

当前共享 DTO 注释明确：

```ts
activities?: SkillRunActivityItem[]
```

属于：

> bounded sanitized activity，not persisted on continuation

Service 内还存在：

```ts
const ACTIVITY_LIST_CAP = 32;
```

它适合作为 Live UI cache，但不适合作为 durable execution history。

---

## 3.5 Session 已落库，但 Sidebar 不知道

Session materialization 已执行：

```text
INSERT sessions
INSERT / UPDATE messages
upsertCachedSession()
```

`upsertCachedSession()` 只更新 `sessions.json`，并不会通知 Renderer。

而 `SidebarRecentSessions` 当前刷新条件主要是：

```text
initial open
window focus
60s interval
currentSessionId change
hermes-session-context-folder-changed
```

因此出现：

```text
Main 已经保存 Session
Renderer Sidebar 仍持有旧 React state
```

直到用户刷新或 focus 才显示。

---

# 4. PRD 目标

本 Item 完成后，Skill Run 必须成为一个真正的一等 Chat Turn，而不是 Composer 上方的临时状态。

目标链路：

```text
Skill Submit
   ↓
User Bubble
   ↓
Skill Run Card / Assistant Turn
   ↓
Reasoning
   ↓
Tool Calls
   ↓
Clarify / Approval
   ↓
Result
   ↓
Artifacts
   ↓
Durable Session
```

同时满足：

```text
Live
Restart
Resume
Sidebar
Session Files
Background Run
```

均保持一致。

---

# 5. 非目标

本 PRD **不包含**：

```text
Streaming token delta
assistant.delta
token-by-token 打字效果
Provider raw event passthrough
第二个 Chat 页面
第二个 Session store
第二个 File store
重写 NoDeskClaw Backend
修改 Agent Runtime 路由
Expert migration/removal
```

尤其：

### RM-13 / RM-14 不属于本 Item

当前 Streaming Delta AD 明确：

```text
Provider immutable Bundle
→ Work import
→ consumer lock
→ parser mapping
```

在 Provider 尚未发布枚举 delta contract 之前，不允许 Work 猜测 streaming payload。

因此：

```text
本 PRD解决：
执行过程可见
调用链可见
最终结果可见
历史可恢复
Sidebar 自动更新

RM-13/14解决：
结果文本 token/chunk 级流式显示
```

两者必须解耦。

---

# 6. 架构原则

## 6.1 保持现有 Owner

必须继续遵守：

| Capability                | Owner                         |
| ------------------------- | ----------------------------- |
| Skill Run lifecycle       | Main `SkillRunService`        |
| Provider contract parsing | Main parser                   |
| SSE / Poll                | Main                          |
| Sanitization              | Main                          |
| Live renderer cache       | `modules/skill-run`           |
| Chat transcript           | Existing `Chat / MessageList` |
| Session                   | Existing Hermes `state.db`    |
| Session cache             | Existing `session-cache`      |
| File                      | Existing File Platform        |
| Restart continuation      | Existing continuation system  |

不得创建：

```text
skill-chat
skill-session
skill-file-store
skill-history-db
renderer raw-event parser
```

---

# 7. Target Architecture

```text
NoDeskClaw Agent
        ↓
NoDeskClaw Backend
        ↓
Public Skill Run Contract
        ↓
SkillRunService
        │
        ├─────────────────────────────────────┐
        │                                     │
        ▼                                     ▼
Live Projection                        Durable Skill Timeline
        │                                     │
        │                                     │
        ▼                                     ▼
IPC Projection                        state.db extension tables
        │                                     │
        ▼                                     │
Renderer Skill Store                         │
        │                                     │
        ▼                                     │
Skill Transcript Adapter                     │
        │                                     │
        ▼                                     │
Chat Messages / MessageList                  │
        │                                     │
        └────────────────────┬────────────────┘
                             ↓
                    Session History Loader
                             ↓
                    Re-open same transcript
```

另外：

```text
Session materialized
        ↓
Session Cache upsert
        ↓
session-cache:changed
        ↓
SidebarRecentSessions
        ↓
立即刷新
```

---

# 8. Transcript UI 设计

Skill Run 不应该只显示：

```text
Skill completed successfully
```

而应该作为 Chat 中一个完整 execution turn。

目标：

```text
用户
分析这个客户并执行审批……

Hermes / Skill
┌────────────────────────────────────────────┐
│ customer-analysis               执行完成 ✓ │
│                                            │
│ 过程                                       │
│  ✓ 分析客户背景                            │
│                                            │
│  调用工具                                  │
│  customer_search                           │
│  call_017                                  │
│  completed                                 │
│                                            │
│  审批                                      │
│  是否允许继续读取企业信息？                 │
│  [允许] [拒绝]                             │
│                                            │
│  结果                                      │
│  深圳华腾……                                │
│                                            │
│  文件                                      │
│  customer-report.md                        │
└────────────────────────────────────────────┘
```

运行过程中原位更新：

```text
pending
starting
running
waiting approval
discovering artifacts
succeeded
```

不得反复新增多个 Assistant Bubble。

---

# 9. Renderer Transcript Model

## 9.1 不直接把 Provider Event 放进 `ChatMessage`

Provider 原始 Event 不得进入 Renderer。

继续：

```text
Provider Event
   ↓
Main parse
   ↓
Work DTO
   ↓
Renderer
```

---

## 9.2 扩展 ChatMessage

建议新增：

```ts
export interface SkillRunMessage {
  id: string;
  kind: "skill_run";
  role: "agent";

  clientRequestId: string;
  providerRunId?: string | null;

  toolName: string;
  phase: SkillRunLocalPhase;
  displayStage: string;

  activities: SkillRunActivityItem[];

  resultText?: string;
  errorCode?: string;
  errorMessage?: string;

  artifactFileIds?: string[];

  pending: boolean;
  timestamp?: number;
}
```

然后：

```ts
export type ChatMessage =
  | ChatBubbleMessage
  | ReasoningMessage
  | ToolCallMessage
  | ToolResultMessage
  | ClarifyMessage
  | SkillRunMessage;
```

现有 ChatMessage 已经是 union model，因此增加一种结构化消息符合当前设计。

---

# 10. Live Transcript Adapter

新增：

```text
apps/work/src/renderer/src/modules/skill-run/
    transcript-adapter.ts
```

职责：

```text
SkillRunProjection
      ↓
SkillRunMessage
```

核心函数：

```ts
projectionToSkillRunMessage(
  projection: SkillRunProjection
): SkillRunMessage
```

以及：

```ts
upsertSkillRunMessage(
  messages: ChatMessage[],
  projection: SkillRunProjection
): ChatMessage[]
```

规则：

### Start

Skill submit 时立即产生：

```text
User Bubble
SkillRunMessage(pending)
```

而不是等 `providerRunId` 返回以后才出现。

---

### Running

Projection 更新：

```text
same clientRequestId
→ update same SkillRunMessage
```

---

### Terminal

```text
succeeded
failed
cancelled
expired
unauthorized
```

更新现有 Message：

```text
pending = false
```

不得追加重复 Assistant 消息。

---

# 11. Chat.tsx 改造

新增：

```ts
const liveSkillTranscriptIdsRef = useRef(new Set<string>());
```

与现有 Expert 的：

```ts
liveExpertTranscriptIdsRef
```

保持对应关系。

---

## 11.1 Skill Submit

当前：

```text
submitSkill()
→ skillRun.start()
→ setSessionMode()
```

调整为：

```text
submitSkill()
  ↓
ensure sessionId
  ↓
append user message
  ↓
append SkillRunMessage(pending)
  ↓
liveSkillTranscriptIdsRef.add(clientRequestId)
  ↓
skillRun.start()
```

---

## 11.2 Projection Effect

增加：

```ts
useEffect(() => {
  if (!activeSkillProjection) return;

  if (
    !liveSkillTranscriptIdsRef.current.has(
      activeSkillProjection.clientRequestId
    )
  ) {
    return;
  }

  setMessages(prev =>
    upsertSkillRunMessage(prev, activeSkillProjection)
  );
}, [activeSkillProjection]);
```

---

## 11.3 Background Chat

因为每一个 ChatRun 都保持 mounted：

```text
background Skill Run
→ projection 继续更新
→ 其对应 Chat state 继续更新
→ Sidebar loading state 继续正确显示
```

不得要求当前 tab active。

---

# 12. SkillRunStatusBar 职责收敛

当前 `SkillRunStatusBar` 已能显示：

```text
phase
activity
cancel
approval
artifact retry
```

完成本 PRD 后：

### StatusBar 保留

职责：

```text
当前 active Skill
当前 phase
Cancel
Approval decision
artifact retry
```

### Transcript Card

职责：

```text
完整执行过程
调用链
结果
历史
artifact references
```

不要让 StatusBar 同时承担历史内容。

---

# 13. 完整 Prompt 保存

当前：

```ts
promptSummary = input.prompt.slice(0,120)
```

只能用于：

```text
title
debug
continuation display
```

不得作为用户 transcript。

---

## 13.1 ActiveRun 增加完整 Prompt

已经存在：

```ts
request: SkillRunStartInput
```

其中含：

```ts
prompt
```

因此 materialization 不应该只依赖 Projection。

调整 Main API：

```ts
materializeSkillRunSessionTranscript({
  projection,
  prompt: activeRun.request.prompt
})
```

或者扩展 Main-owned durable model：

```ts
SkillRunPersistenceRecord {
  fullPrompt: string
}
```

---

# 14. Durable Skill Run Timeline

不建议把 Activity 塞回普通 Hermes `messages.tool_calls`。

原因：

```text
Hermes native Chat Event
≠
NoDeskClaw Skill Run Public Event
```

强行转换会导致：

```text
语义混淆
callId 冲突
Provider contract 泄漏
future schema 难升级
```

---

# 15. state.db Extension Tables

沿用同一个 Hermes `state.db`，增加 Desktop-owned extension tables。

## 15.1 desktop_skill_runs

```sql
CREATE TABLE IF NOT EXISTS desktop_skill_runs (
  client_request_id TEXT PRIMARY KEY,

  session_id TEXT NOT NULL,
  provider_run_id TEXT,

  profile_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,

  prompt_text TEXT NOT NULL,

  phase TEXT NOT NULL,
  display_stage TEXT,

  result_text TEXT,

  error_code TEXT,
  error_message TEXT,

  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_desktop_skill_runs_session
ON desktop_skill_runs(session_id, created_at);
```

---

## 15.2 desktop_skill_run_events

```sql
CREATE TABLE IF NOT EXISTS desktop_skill_run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  client_request_id TEXT NOT NULL,
  session_id TEXT NOT NULL,

  event_id TEXT NOT NULL,
  event_seq INTEGER,

  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,

  created_at REAL NOT NULL,

  UNIQUE(client_request_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_events_session
ON desktop_skill_run_events(
  session_id,
  client_request_id,
  event_seq
);
```

---

# 16. 可持久化的 Activity Payload

只能保存 Work sanitized DTO：

```json
{
  "kind": "tool.call",
  "toolName": "customer-search",
  "callId": "call_001",
  "status": "completed"
}
```

允许：

```text
reasoning.summary
tool.call
clarify.requested
approval.requested
```

禁止：

```text
raw Provider payload
credential
URL
internal run object
tool arguments（除非未来合同明确发布）
raw headers
attachment bytes
Agent internal snapshot
```

---

# 17. Provider Contract 边界

当前 v1.4.0 Public Event Contract 的 `tool.call` 公开字段只有：

```text
tool_name
call_id
status
```

因此当前调用链最多显示：

```text
调用了什么工具
call_id
started / completed / failed
```

本 PRD不得声称可以展示：

```text
完整 tool args
tool output
step input
step output
```

如果后续产品需要这些信息，应由 NoDeskClaw Provider 发布新的枚举、脱敏 Public Event：

```text
tool.call.arguments
tool.result
step.summary
```

然后 Work 再进行 consumer-lock。

---

# 18. Persistence Service

新增：

```text
apps/work/src/main/skill-run/
    skill-run-transcript-store.ts
```

接口：

```ts
interface SkillRunTranscriptStore {
  upsertRun(input: SkillRunDurableRun): void;

  appendActivity(input: SkillRunDurableActivity): void;

  getRun(clientRequestId: string): SkillRunDurableRun | null;

  listSessionRuns(sessionId: string): SkillRunDurableRun[];

  listRunActivities(
    clientRequestId: string
  ): SkillRunDurableActivity[];

  deleteSession(sessionId: string): void;
}
```

---

# 19. Persistence Trigger

不要让 Renderer 决定是否持久化。

唯一 Owner：

```text
Main SkillRunService / Main projection subscription
```

目标：

```text
updateProjection()
      ↓
emit()
      ↓
Main projection listener
      ├─ update continuation
      ├─ materialize normal session
      ├─ persist durable skill run
      ├─ persist activity event
      └─ broadcast projection
```

---

# 20. Event Idempotency

当前 Service 已经通过：

```text
seenEventIds
eventId
eventSeq
```

做 SSE replay 去重。

DB 继续通过：

```sql
UNIQUE(client_request_id, event_id)
```

保证：

```text
SSE reconnect
poll fallback
Desktop restart
duplicate event
```

均不会重复保存 Activity。

---

# 21. Activity Cap 调整

保留：

```ts
ACTIVITY_LIST_CAP = 32
```

用于：

```text
Live Projection
StatusBar
IPC payload size control
```

但 durable DB：

```text
不得限制 32 条
```

即：

```text
Projection = bounded live window
DB Timeline = complete history
```

---

# 22. Session History Loader

现有 `sessions.ts` 已经负责：

```text
messages DB rows
→ reasoning
→ assistant
→ tool_call
→ tool_result
→ HistoryItem[]
```

扩展：

```ts
HistoryItem
  | ...
  | SkillRunHistoryItem
```

新增：

```ts
interface SkillRunHistoryItem {
  kind: "skill_run";
  clientRequestId: string;
  providerRunId?: string | null;
  toolName: string;
  phase: SkillRunLocalPhase;
  displayStage: string;
  activities: SkillRunActivityItem[];
  resultText?: string;
  errorCode?: string;
  errorMessage?: string;
  timestamp: number;
}
```

---

# 23. Session Merge

`getSessionMessages(sessionId)`：

现状：

```text
messages
+ local overlays
+ continuation
```

调整为：

```text
Hermes messages
+ Work local overlays
+ durable skill runs
+ non-terminal continuation
```

排序依据：

```text
timestamp
createdAt
event sequence
```

最终：

```text
User
Skill Run
User
Assistant
User
Skill Run
```

顺序必须稳定。

---

# 24. Continuation 职责收敛

当前 continuation 负责：

```text
active run restart recovery
```

这应该保留。

但是 continuation 不再承担：

```text
完整 transcript
完整 activity timeline
terminal history
```

目标：

```text
desktop_session_continuations
      ↓
仅用于 active / recoverable state

desktop_skill_runs/events
      ↓
用于 durable Skill history
```

运行结束：

```text
continuation 可以删除
durable run/history 必须保留
```

---

# 25. Sidebar Live Sync

新增统一事件：

```text
session-cache:changed
```

不要继续借用：

```text
hermes-session-context-folder-changed
```

表达 Session 创建。

---

## 25.1 Main

当这些情况发生时：

```text
session created
session materialized
title changed
message_count changed
skill result finished
session deleted
```

发：

```ts
webContents.send(
  "session-cache:changed",
  {
    sessionId,
    reason:
      | "created"
      | "updated"
      | "deleted"
  }
)
```

---

## 25.2 Preload

增加：

```ts
onSessionCacheChanged(
  listener: (event: SessionCacheChangedEvent) => void
): () => void
```

---

## 25.3 Sidebar

`SidebarRecentSessions` 增加监听：

```text
session-cache:changed
       ↓
listCachedSessions()
       ↓
applyFirstPage/applyLoadedWindow
```

对于刚创建 Session：

```text
不必再次 sync state.db
```

因为 Main 已经：

```text
upsertCachedSession()
```

只需要读取 JSON cache。

这样可避免 DB hammer。

---

# 26. Session Title

Skill 第一次发送时：

```text
完整 Prompt
   ↓
sessionTitleFromUserMessage()
```

当前 `session-cache.ts` 已经提供该函数。

目标：

```text
Skill session 一旦 Provider accepted
→ Sidebar 立刻显示真实标题
```

不能显示：

```text
New Conversation
skill-xxx
live-approval-park
```

除非用户 Prompt 本身为空。

---

# 27. Artifact Integration

当前 Artifact 已通过 File Platform owner 处理：

```text
onUpsertArtifact
→ upsertSkillRunRemoteArtifact
```

不得重写。

Transcript Card 只显示：

```text
Artifact descriptor / ManagedFile reference
```

点击以后：

```text
Existing File Preview
Existing Session Files
Existing Save As
```

继续由 File Platform 负责。

---

# 28. Approval

当前：

```text
approval.requested
→ SkillRunActivity
→ SkillRunStatusBar
→ decideApproval IPC
```

已经存在。

本 PRD新增：

```text
Transcript SkillRunCard
```

也要展示 approval state。

但操作按钮 Owner 仍是现有：

```text
decideApproval()
```

不得创建新的 decision IPC。

---

# 29. Clarify

当前 Public Contract 存在：

```text
clarify.requested
question
options
```

但没有定义完整的 clarify response contract。

因此本 PRD：

```text
显示 clarify requested
```

可以做。

若当前 Provider 没有对应 answer endpoint：

```text
不得创建自定义 respond IPC
```

保持 read-only。

---

# 30. Renderer Store 改造

当前 `store.ts`：

```text
projectionsByReq
catalogState
listeners
```

保留。

建议增加：

```ts
export function getSkillRunProjectionsForSession(
  sessionId: string
): SkillRunProjection[]
```

不要只提供：

```text
getLatestSkillRunProjectionForSession()
```

原因：

一个 Session 可以连续执行多次 Skill。

Chat Transcript 必须支持：

```text
Skill Run #1
Skill Run #2
Skill Run #3
```

当前 `activeSkillProjection` 只能表示最后一个 Run，不能作为完整 transcript source。

---

# 31. 多 Skill Turn

目标必须支持：

```text
User Prompt 1
  Skill Run 1

User Prompt 2
  Skill Run 2

User Prompt 3
  Skill Run 3
```

每次用：

```text
clientRequestId
```

作为永久 turn identity。

严禁用：

```text
providerRunId
sessionId
toolName
```

作为 Message identity。

---

# 32. Identity 规范

冻结：

| Identity            | Scope            |
| ------------------- | ---------------- |
| Renderer ChatRun ID | Desktop tab      |
| Session ID          | Chat Session     |
| clientRequestId     | Skill invocation |
| providerRunId       | NoDeskClaw Run   |
| eventId             | Provider event   |
| callId              | Tool call        |

不得互相 alias。

这与当前 v4.0.1 架构要求一致。

---

# 33. Failure Semantics

## Start failed before Provider accepted

展示：

```text
User
Skill execution failed
```

但：

```text
providerRunId = null
```

可以不创建 durable NoDeskClaw Run row。

Renderer local failure仍需可见。

---

## Provider failed

持久化：

```text
phase = failed
errorCode
errorMessage
activities
```

---

## Cancel

持久化：

```text
phase = cancelled
```

---

## Artifact discovery failed

Run 本身：

```text
succeeded
```

Artifact：

```text
artifactDiscoveryError = true
```

不得把 Run 改成 failed。

当前 Service 已经这样处理，应保持。

---

# 34. Restart Recovery

场景：

```text
Skill Running
   ↓
Desktop 退出
   ↓
Desktop 重启
```

流程：

```text
Session continuation
     ↓
rehydrateSkillRunContinuationsForSession()
     ↓
SkillRunService.rehydrate()
     ↓
SSE reconnect
     ↓
projection update
     ↓
durable timeline继续 append
     ↓
same SkillRunMessage continues
```

不得：

```text
创建第二个 Skill Run Message
重复 Activity
重复 Result
```

现有 rehydrate 主链可直接复用。

---

# 35. Delete Session

当前 `deleteSession()` 已负责：

```text
messages
continuation
context folder
model override
cache
```

需要增加：

```text
delete desktop_skill_run_events
delete desktop_skill_runs
```

顺序：

```sql
DELETE FROM desktop_skill_run_events
WHERE session_id = ?;

DELETE FROM desktop_skill_runs
WHERE session_id = ?;
```

避免留下 orphan state。

---

# 36. Renderer 组件结构

建议：

```text
modules/skill-run/
├─ SkillCatalogPanel.tsx
├─ SkillSelectionBar.tsx
├─ SkillRunStatusBar.tsx
├─ SkillRunTranscriptCard.tsx        NEW
├─ SkillRunActivityTimeline.tsx      NEW
├─ skill-run-transcript-adapter.ts   NEW
├─ store.ts
└─ skill-run.css
```

---

# 37. SkillRunTranscriptCard

组件职责：

```text
Header
  Skill Name
  phase
  duration

Activity Timeline
  reasoning
  tools
  clarify
  approval

Result
  resultText

Artifacts
  references

Error
  error message
```

---

# 38. Activity Presentation

## Reasoning

```text
分析
正在验证客户主体信息……
```

---

## Tool

```text
工具调用
customer-search

call_xxx
completed
```

同一个 `callId`：

```text
started
→ completed
```

UI 应原位更新，不显示两条。

---

## Clarify

```text
需要补充信息
请选择客户类型：
- IC设计公司
- 模组厂
```

---

## Approval

```text
需要审批
允许访问企业数据？
[允许] [拒绝]
```

---

# 39. Live Activity Merge

新增：

```ts
function mergeActivity(
  existing: SkillRunActivityItem[],
  incoming: SkillRunActivityItem
)
```

对于 `tool.call`：

主键优先：

```text
callId
```

如果：

```text
started
completed
```

应该更新：

```text
同一 activity row
```

而 durable event table仍可保存两条 Provider event。

也就是：

```text
Event history = immutable
UI projection = compacted
```

---

# 40. Streaming Delta Future Compatibility

本 PRD从一开始必须为 RM-14 留接口：

```ts
SkillRunMessage {
  resultText?: string;
}
```

未来：

```text
assistant.delta
→ SkillRunProjection.resultText increment
→ same SkillRunMessage
```

因此 RM-14 以后：

```text
不改 Chat architecture
不改 Session architecture
不改 Sidebar architecture
```

只改：

```text
Parser
Projection merge
Transcript text update
```

符合 Streaming Delta AD。

---

# 41. 主要代码修改范围

## Main

```text
apps/work/src/main/skill-run/
  skill-run-service.ts
  skill-run-ipc.ts
  skill-run-session-materialize.ts
  skill-run-continuation.ts
  skill-run-transcript-store.ts          NEW

apps/work/src/main/
  sessions.ts
  session-cache.ts
```

---

## Shared

```text
apps/work/src/shared/
  skill-run.ts
  session-continuation.ts
```

---

## Preload

SkillRun API 本身不用新增 raw event API。

增加 Session Cache Change：

```text
session-cache event API
```

---

## Renderer

```text
apps/work/src/renderer/src/modules/skill-run/
  store.ts
  SkillRunTranscriptCard.tsx
  SkillRunActivityTimeline.tsx
  transcript-adapter.ts

apps/work/src/renderer/src/screens/Chat/
  Chat.tsx
  MessageList.tsx
  types.ts
  sessionHistory.ts

apps/work/src/renderer/src/screens/Layout/
  SidebarRecentSessions.tsx
```

---

# 42. 数据迁移

无需迁移 Hermes 原有表。

启动时：

```sql
CREATE TABLE IF NOT EXISTS ...
```

完成 Extension table bootstrap。

老 Session：

```text
无 desktop_skill_runs
→ 按现有 messages 显示
```

新 Session：

```text
自动产生完整 Skill timeline
```

完全向后兼容。

---

# 43. Telemetry

增加：

```text
skill_transcript_materialized
skill_activity_persisted
skill_session_cache_notified
skill_transcript_rehydrated
skill_transcript_duplicate_prevented
```

记录：

```text
outcome
phase
activityCount
sessionId hash
request fingerprint
```

禁止记录：

```text
prompt正文
result正文
credentials
raw event
```

---

# 44. 性能要求

Live Projection：

```text
最多 32 activities
```

保持现状。

DB：

```text
append-only event persistence
```

要求：

```text
每 event 单次 prepared statement
禁止每次 projection full rewrite timeline
```

Session reopen：

```text
一个 run list query
一个 events query
```

避免 N+1。

建议：

```sql
SELECT *
FROM desktop_skill_run_events
WHERE session_id = ?
ORDER BY client_request_id, event_seq, id;
```

一次读完。

---

# 45. IPC 性能

不得通过 IPC发送完整 durable history。

Live IPC：

```text
继续只发送 bounded SkillRunProjection
```

历史：

```text
继续通过 getSessionMessages()
```

加载。

这样可防止：

```text
长 Session
→ IPC payload 无限增长
```

---

# 46. Security

必须保持：

```text
Renderer 不拿 auth token
Renderer 不拿 Provider URL
Renderer 不拿 raw event
Renderer 不拿 artifact bytes
Renderer 不拿 internal snapshot
```

Main 仍是 security boundary。

---

# 47. Tests

## Unit Tests

新增：

```text
skill-run-transcript-store.test.ts
skill-run-transcript-adapter.test.ts
SkillRunTranscriptCard.test.tsx
```

覆盖：

```text
reasoning
tool start → complete
tool fail
approval
clarify
result
failure
cancel
event dedupe
multi-run same session
```

---

# 48. Main Integration Tests

验证：

```text
projection emit
→ DB run created
→ event stored
→ transcript materialized
→ cache upsert
→ cache-change broadcast
```

---

# 49. Renderer Integration Tests

验证：

```text
Skill submit
→ user bubble immediately visible
→ Skill card visible
→ projection updates card
→ completed result appears
```

---

# 50. Restart Tests

场景：

```text
run started
→ events 1–5
→ process restart
→ rehydrate
→ SSE replay events 4–10
```

结果：

```text
1–10 only once
```

---

# 51. Sidebar Tests

场景：

```text
empty scratch
→ Skill Submit
→ Provider accepted
→ materialize
```

要求：

```text
≤ 500ms 内 Sidebar 出现 Session
```

无需：

```text
refresh
focus
60s timer
```

---

# 52. Multi-Run Tests

同 Session：

```text
skill A
skill A
skill B
```

要求：

```text
3 个独立 clientRequestId
3 个 Transcript Cards
历史顺序正确
```

---

# 53. Large Activity Test

运行产生：

```text
100 activities
```

要求：

Live：

```text
Projection最多32
```

Restart：

```text
100条均可恢复
```

这是本 PRD非常关键的验收项。

---

# 54. Acceptance Criteria

## AC-01 Chat First Turn

选择 Skill 并发送后：

```text
用户 Prompt 立即显示
Skill Run Card 立即显示
```

不能等待执行完成。

---

## AC-02 Live Activity

SSE：

```text
reasoning.summary
tool.call
approval.requested
clarify.requested
```

在 Chat 中实时出现。

---

## AC-03 Result

`succeeded` 后：

```text
projection.text
```

立即进入 Skill Run Card。

---

## AC-04 Error

`failed`：

```text
errorCode
errorMessage
```

立即显示。

---

## AC-05 Sidebar

首次 Skill Run Session 创建后：

```text
无需手工刷新
无需切焦点
```

左侧聊天立即出现。

---

## AC-06 Title

Sidebar 标题来自：

```text
完整首条 Prompt
```

而不是 `promptSummary`。

---

## AC-07 Durable Timeline

关闭 Session 再重新打开：

```text
Prompt
Reasoning
Tool Calls
Approval
Result
Artifacts
```

保持。

---

## AC-08 Restart

Skill 运行中 Desktop restart：

```text
恢复原 Run
不创建第二 Run
不创建第二 Card
```

---

## AC-09 Event Dedupe

相同：

```text
event_id
```

不得重复持久化。

---

## AC-10 32 Activity Boundary

超过 32 activity：

```text
Live bounded
History complete
```

---

## AC-11 Multi-run

同一 Session 连续多个 Skill 调用全部保留。

---

## AC-12 Artifact

Artifact：

```text
仍由 File Platform 管理
```

不得引入第二 File store。

---

## AC-13 Security

Renderer 不可看到：

```text
raw provider event
provider endpoint
auth token
artifact bytes
```

---

## AC-14 Existing Local Chat Regression

Local Chat：

```text
发送
stream
reasoning
tool
history
```

全部不受影响。

---

## AC-15 Expert Regression

`expert-compat` 下原有 Expert reader / history 不受影响。

---

# 55. Kill Criteria

出现以下任一情况，本实施必须停止并重新评审：

```text
新增第二套 Chat 页面
新增第二套 Session DB
Renderer 解析 Provider raw event
Renderer 直接连接 NoDeskClaw Backend
把 NoDeskClaw Event 强制写进 Hermes tool_calls
把 RM-13/RM-14 token delta 混入本 Item
为 Clarify 自创未发布 response contract
为 Tool Call 自创 arguments 字段
Artifact 绕过 File Platform
```

---

# 56. Delivery Slices

建议本 PRD拆为 5 个工程 Slice。

### Slice A — Live Transcript Closure

```text
Chat submit
SkillRunMessage
Transcript Adapter
MessageList renderer
```

验收：

```text
不刷新即可看到 Prompt → Activity → Result
```

---

### Slice B — Durable Timeline

```text
desktop_skill_runs
desktop_skill_run_events
transcript store
```

验收：

```text
关闭再打开仍能恢复
```

---

### Slice C — Session Loader

```text
sessions.ts
sessionHistory.ts
SkillRunHistoryItem
```

验收：

```text
历史 Session 与 Live UI一致
```

---

### Slice D — Sidebar Live Sync

```text
session-cache:changed
Preload
SidebarRecentSessions
```

验收：

```text
首次 Skill Session 自动出现在左侧
```

---

### Slice E — Recovery / Regression

```text
restart
duplicate SSE
100 activity
multi-run
local Chat
Expert
File Platform
```

---

# 57. 推荐 Roadmap Item

建议在现有 Roadmap 增加：

```markdown
| RM-15 | M6i Skill Run Transcript & Session Live-Sync Closure：
将现有 SkillRunProjection 接入唯一 Chat Transcript，
持久化 sanitized Skill activity，并在 Session materialize 后实时刷新 Sidebar。
不包含 streaming delta。 |
RM-08, RM-09 |
READY |
Chat 从 submit 到 terminal 实时显示 prompt/activity/result；
Session reopen 保留过程和调用链；
Sidebar 无需手工刷新；
bounded live projection + complete durable timeline；
无第二 Chat/Session/File owner；
无 raw Provider event 到 Renderer。 |
docs/work/PRD-WORK-v4.0.1-M6i-skill-run-transcript-session-live-sync-closure.md |
- |
- |
- |
```

RM-15 与 RM-13 / RM-14 的关系：

```text
RM-15
   └─ 完成 Transcript / Session / Sidebar 基础设施

RM-13
   └─ Future Delta Contract Import

RM-14
   └─ Delta → existing SkillRunProjection

RM-14 最终直接复用 RM-15 的 Transcript
```

---

# 58. 最终工程形态

完成后整个 Skill Run 架构应该收敛为：

```text
                          ┌─ Catalog
                          │
Layout → Chat → Skill ────┼─ Submit
                          │
                          ▼
                  Main SkillRunService
                          │
              ┌───────────┼────────────┐
              │           │            │
              ▼           ▼            ▼
            SSE        Poll        Continuation
              │
              ▼
        Sanitized Projection
              │
       ┌──────┴─────────┐
       │                │
       ▼                ▼
Live Renderer       Durable Store
       │                │
       ▼                ▼
SkillRunMessage    state.db extension
       │                │
       ▼                ▼
MessageList       Session History
       │                │
       └───────┬────────┘
               ▼
           同一个 Chat

Session materialize
       ↓
Session Cache
       ↓
Cache Changed Event
       ↓
Sidebar

Artifact
       ↓
Existing File Platform
```

本 PRD 的本质不是增加一个新功能面，而是把当前已经存在的：

```text
Skill execution
Projection
Activity
Result
Session
Artifact
```

真正闭环成：

> **一个可实时显示、可恢复、可审计、可继续演进到 Streaming Delta 的完整 Chat Turn。**

这应当作为 `apps/work` 当前 Skill-first 架构进入下一阶段之前的基础闭环项；否则即使后续完成 RM-13 / RM-14，Streaming Delta 也只会继续流进底部状态组件，而不会解决当前 Chat Transcript 与 Session SOT 的结构性问题。
