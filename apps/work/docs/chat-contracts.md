---
work_item_id: WORK-CHAT-CONTRACT-V1
version: 1.0-draft
status: DRAFT
target_branch: work/prd-3.0
review_verdict:
approved_at:
grounding_mode: discover
source_commit: c10ae2fdc9bd7d286d828836c80fcbc2debb6257
---

# apps/work Chat Runtime 对接标准与差异整改 PRD

本文校准附件《Work Chat Rendering Contract v1.0》，给出 `apps/work` Chat Transcript 的目标渲染边界、外部 Runtime/Event 的接入标准、与当前仓库及已批准 PRD 的冲突，以及所有不符合项的整改分类。

> 本文按用户指定路径保存。`DRAFT` 表示它不是已冻结合同，也不能进入实现计划；文件名不代表批准状态。后续仍须经过独立 PRD Review、收敛为 `APPROVED`，再生成 `.plan.md`。

## 1. Grounding 结论

附件对五类 `ChatMessage`、Reasoning/Tool/Clarify 的视觉语义、空 Bubble、Tool Group，以及 Artifact 不进入 `ChatMessage` 的判断大体符合当前源码。真正需要修正的是它对“网络合同”和“Run 生命周期”的定义。

目标边界冻结为：

```text
外部事实源
├─ Runtime ChatRun generated contract
├─ Hermes Dashboard JSON-RPC/WebSocket
├─ legacy Main IPC chat channels
└─ NoDeskClaw Expert Task/SSE contract
        │
        ▼ provider-owned validation / adapter
Work Chat canonical projection events
        │
        ▼ one renderer projection reducer
ChatMessage[5] ──► MessageList

Artifact event/result
        │
        ▼ provider owner + Main File Platform
ManagedFile/FileAssociation ──► FileDomainEvent
        ├─ Chat resource card
        └─ Session Files / Agent output
```

核心决定：

1. `ChatMessage` 仍是 Renderer 内唯一 Transcript 渲染模型，不是网络 DTO。
2. 外部网络合同仍由各自权威事实源拥有。Runtime 合同由 FastAPI/Pydantic 生成；Expert 合同由已锁定的 `WORK-EXPERT-CONTRACT` 拥有。本文不得成为第二套外部网络 SOT。
3. Provider Adapter 只把已验证的外部事件投影为 Work 内部规范事件；唯一 Renderer reducer 负责生成五类 `ChatMessage`。
4. `runId` 表示可包含多 Turn 的 ChatRun/会话执行容器；一次发送的终态由 `turnId` 约束。附件的 `run.completed/run.failed` 单 Turn 语义改为 `turn.completed/turn.failed/turn.cancelled`。
5. Artifact 可以与 Chat 事件共用同一传输流，但不能进入 `ChatMessage`。它必须先进入 Main-owned File Platform，再由资源 ID 驱动 Chat Card 与 Session Files。
6. 新 Provider 必须提供稳定事件身份、顺序和恢复能力；现有 Dashboard/legacy IPC 只能作为有退出条件的 transient compatibility consumer，不能被标记为 v1 durable-conformant。

## 2. 权威基线与指令优先级

附件是待校准的外部方案，不是仓库指令或已批准合同。发生冲突时按以下顺序处理：

1. 根 `AGENTS.md`、`apps/work/AGENTS.md` 与 API/Event 路由规则；
2. 生成合同、已锁定 Provider 合同、ADR 与已批准 PRD；
3. 当前生产源码和 `lat.md`；
4. 附件中的建议类型、目录和实施清单。

本次基线：分支 `work/prd-3.0`，commit `c10ae2fdc9bd7d286d828836c80fcbc2debb6257`。未扫描归档 PRD、构建产物或 Runtime 数据。

## 3. 附件与仓库规则冲突

| # | 附件主张 | 仓库事实 / 冲突 | 结论 | 规划来源 |
|---|---|---|---|---|
| C1 | 文档状态可直接视为 `Frozen / v1.0` | 仓库要求非平凡架构变更先 Grounding、PRD Review、APPROVED、Plan；附件无仓库审批元数据 | 降为 `DRAFT`，不得直接冻结 | 根 `AGENTS.md`；PRD Contract |
| C2 | `WorkChatEventV1` 是 Runtime/Gateway 与 Work 的新传输合同 | Runtime 网络 SOT 已是 FastAPI/Pydantic → `contracts/runtime-api` / `runtime-events`；Expert 也有独立锁定合同。手写第二 SOT 违反 ADR-003 | `WorkChatEventV1` 只可定义为 Work 内部 projection contract；外部 wire 继续使用各自权威合同 | ADR-003；`contract-flow.md`；WORK PRD v3.0/v3.0.1 |
| C3 | 新 envelope 使用 `seq` 与附件自定义事件名 | Runtime ChatRun 已使用 `sequence`、`agent.message.*`、`clarify.requested`、`turn.*`、`artifact.created` | 内部标准与现有 Runtime 语义对齐；Adapter 负责 Dashboard/Expert alias mapping，不复制 Runtime schema | Runtime PRD v1.1（由 Runtime `lat.md` 记录）；`chat-run-event.schema.json` |
| C4 | `run.completed/run.failed` 是一次回答的 terminal | Runtime `ChatRun` 可包含多 Turn；`apps/work` 的 `runId` 也是 Chat 实例身份。把 Run 当单 Turn 会阻止后续发送 | terminal 约束改为 `(runId, turnId)`；Turn terminal 后只禁止该 Turn 的新 Chat delta | Runtime Chat v2；当前 `ActiveTurn` |
| C5 | Artifact 必须走独立 `WorkResourceEventV1` stream | Runtime ChatRun 合同已在同一 durable event union 中定义 `artifact.created`；Work 已有 `FileDomainEvent` 作为 Main→Renderer 资源变更通知 | 只分离领域 owner，不强制分离物理 transport；不新增重复 `WorkResourceEventV1` | WORK PRD v3.1；File Platform `lat.md` |
| C6 | 所有 Adapter 建议放在 `screens/Chat/adapters` | Expert/远程资源的 URL、JWT、SSE、下载和授权边界必须留在 Main；Renderer 不能接收私有网络字段 | wire validation/normalization 跟随现有 transport owner；Renderer 只接收 renderer-safe projection event | WORK PRD v3.0、v3.1 |
| C7 | `ChatMessage Union` 提升为 shared contract owner | 当前 Union 包含 `pending/localOnly/isSlashLoader/error` 等 Renderer 行为字段；跨进程 DTO 已分别由 shared Expert/File contract 拥有 | `ChatMessage` KEEP 在 Renderer rendering owner；只把真正跨进程的 canonical event DTO 放 shared | `chat-reconciliation-plan.md`；WORK PRD v3.0 |
| C8 | 不存在任何 Provider-specific Chat Component | 已批准 v3.0/v3.1 明确拥有 Expert Run control 与 Artifact resource card | 将禁令收窄为“不得新增 Provider-specific Transcript row/MessageList 分支”；执行控制和资源卡不属于 `ChatMessage`，可保留 | WORK PRD v3.0、v3.1 |
| C9 | 所有 Provider 现在都可满足稳定 `eventId/sequence/callId/replay` | Dashboard notification 只有 `type/payload/session_id`；legacy IPC 只有 `runId + channel payload`；部分 Tool progress 使用 synthetic callId | 当前两条路径不是 durable-conformant，只能进入版本化 compatibility；新 Provider 不得复制该降级 | `dashboardGatewayClient.ts`、`chat-stream.ts`、`liveToolEvents.ts` |
| C10 | `clarify.request` 一定生成 `ClarifyMessage` | legacy IPC 已这样做；Dashboard Adapter 当前却生成普通 assistant bubble | Dashboard 路径必须改为统一 Clarify projection；这是明确 P0 不符合项 | `dashboardEventAdapter.ts`、`useChatIPC.ts` |
| C11 | Artifact ready 通过新 `resourceRevision` reducer 刷新 | 当前 File Platform 已发布 `FileDomainEvent`，`useSessionFiles` 已订阅 session-scoped 事件；另加 revision owner 会重复 | 复用 FileDomainEvent；删除附件中的第二 refresh truth | WORK PRD v3.1；`file-events.ts` |
| C12 | Expert progress 可自然映射为 reasoning/tool/message delta | v3.0 锁定 `runtimeProgress=false` 时不得伪造工具级时间线；Expert 只有最低 task stage 与结果 | task stage 保留在 execution control；只有真实文本事件才能进入 Assistant/Reasoning/Tool | WORK PRD v3.0、v3.0.1 |

## 4. PRD 与规划来源追溯

| 当前能力 / 决定 | 来源 | 追溯结论 |
|---|---|---|
| 五类 `ChatMessage`、MessageList、ReasoningRow、ToolActivityGroup、DB/stream reconcile | `apps/work/docs/chat-reconciliation-plan.md` 与初始 Work import commit `bb4d5ff2` | 当前有效设计依据，但该文件不是符合仓库 frontmatter 的 APPROVED PRD |
| Dashboard Chat transport 与 `dashboardEventAdapter` 作为当前投影 owner | 上述 reconciliation plan；WORK PRD v3.0 的 Current Inventory/Source Anchors | v3.0 明确认可当前 owner，目标必须 MODIFY 现有 owner，不能 ADD 平行 reducer |
| Expert Task/SSE、投影、RunCard/Timeline、Main trust boundary | `docs/work/PRD-WORK-v3.0-expert-execution.md` | APPROVED；新 Chat 标准不能迁走 Expert task truth、Gateway Client 或 Run Service owner |
| Expert Context UI 对执行/SSE/Projection/Artifact owner 的 KEEP | `docs/work/PRD-WORK-v3.0.1-expert-context-selector.md` | APPROVED；新标准只统一 Transcript projection，不改调用门禁与 Task lifecycle |
| Expert Artifact 作为 File Platform remote resource、Chat resource card、Session Files Agent output | `docs/work/PRD-WORK-v3.1-expert-remote-artifact-chat-file-resource.md` | APPROVED；Artifact card 允许存在，但必须以 File Platform resource ID 为唯一资源事实 |
| Runtime durable ChatRun、Event Store、`sequence`/replay/Turn terminal | Runtime PRD v1.1（`services/runtime/lat.md/chat-sessions.md` 记录）与生成合同 | 非归档有效目录中未找到对应 PRD 文件；本次不越权扫描 archived PRD。权威实现合同为生成 schema/OpenAPI |
| Runtime 合同必须从 FastAPI/Pydantic 生成 | ADR-003、`docs/architecture/contract-flow.md` | 手工维护一份并行 Runtime network schema 被禁止 |
| Runtime Endpoint Control Plane frozen，但 Chat/Task data plane 保留 | 根 `AGENTS.md`、contract-flow | 本标准不得向 Runtime 增加 Endpoint Control 能力；只消费既有 Chat/Task data-plane contract |

## Current Capability Inventory

| Capability | Existing Owner | Current Behaviour | Evidence | Result |
|---|---|---|---|---|
| Transcript rendering union | Renderer Chat `types.ts` | 五类 `ChatMessage`；Artifact 不在 union | `types.ts#ChatMessage` | EXISTS |
| Transcript row rendering | `MessageList` + `HistoryRow` + `ClarifyCard` | Bubble、Thought、连续 Tool group、Clarify card；空 bubble 隐藏 | `MessageList.tsx` | EXISTS |
| Dashboard event projection | `dashboardEventAdapter.ts` | 直接把 Dashboard raw event 投影到 `ChatMessage[]` | `applyDashboardStreamEvent` | PARTIAL |
| legacy IPC live projection | `useChatIPC` + live Tool/Reasoning helpers | 每个 IPC channel 直接 `setMessages`；结束后用 DB reconcile | `useChatIPC.ts` | PARTIAL |
| completion reconciliation | Dashboard adapter + session history | 合并 streamed/final；DB 与 live 依赖文本、callId 与 synthetic heuristics | `mergeStreamedWithFinal`、`reconcileStreamedWithDb` | PARTIAL |
| stable event identity/replay | Runtime ChatRun、Expert SSE | Runtime/Expert 有 durable identity；Dashboard/legacy IPC 没有 | runtime schema、`ExpertRunProjection` | PARTIAL |
| stable tool lifecycle identity | Provider payload + `ChatToolEvent` | 显式 callId 时稳定；否则按 name/label/preview 合成 | `chat-stream.ts`、`liveToolEvents.ts` | PARTIAL |
| Clarify rendering | IPC + Dashboard | IPC 生成 `ClarifyMessage`；Dashboard 生成普通 bubble | `useChatIPC.ts`、`dashboardEventAdapter.ts` | CONFLICT |
| Expert transcript projection | Expert Run Service + Renderer integration | Task projection直接镜像 user/assistant bubble；task truth 仍在服务端 | WORK PRD v3.0；`Chat.tsx` | PARTIAL |
| Artifact/resource ownership | Main File Platform | Expert discovery upsert remote ManagedFile；FileDomainEvent 刷新 Session Files；resource cards 使用 file ID | WORK PRD v3.1；`FileDomainEvent` | EXISTS |
| Provider-neutral canonical event reducer | 不存在 | Dashboard、IPC、Expert 各自更新 Chat state | 生产搜索与上述 anchors | MISSING |
| Canonical contract validation/fixtures | 不存在 | 只有各路径自己的 tests；无跨 Provider golden fixtures | 目标测试目录搜索 | MISSING |
| Capability negotiation | 各 transport 局部判断 | 无统一 `durableReplay/reasoning/tool/clarify/artifact` capability snapshot | 当前 transport hooks | MISSING |

## 5. Target Contract Semantics

### 5.1 Rendering Contract

`ChatMessage` 保持五类，不新增 `artifact`、`expert`、`runtime` 或 Provider kind：

```ts
type ChatMessage =
  | ChatBubbleMessage
  | ReasoningMessage
  | ToolCallMessage
  | ToolResultMessage
  | ClarifyMessage;
```

不变量：

- 外部 `assistant` role 在 Adapter 边界转为现有 Renderer `agent` role。
- `content/text/args/result` 只能是 renderer-safe 展示数据，不允许原始 event JSON、JWT、Provider URL、本地绝对路径或未验证下载 locator。
- Reasoning 只来自真实 reasoning 语义；Tool 日志不能伪装为 reasoning。
- ToolCall/ToolResult 必须按稳定 `callId` 关联。没有稳定 ID 的 transient compatibility event 不得承诺 replay/upsert 正确性。
- `message completed` 使用现有 streamed/final merge 行为，保留 Tool 前文本；不能无条件覆盖。
- Clarify 使用稳定 `requestId`；resolved 后不可重复提交。
- Provider-specific execution controls 与 resource cards 不进入 `MessageList` 的 `ChatMessage` union。

### 5.2 Canonical Projection Event

Work 内部 canonical event 与现有 Runtime ChatRun envelope 对齐，字段使用 `sequence` 而不是附件另造的 `seq`：

```ts
interface WorkChatEventV1<T = unknown> {
  schemaVersion: "1.0";
  eventId: string;
  runId: string;
  turnId: string;
  sessionId?: string;
  taskId?: string;
  sequence: number;
  timestamp?: string;
  type: WorkChatEventTypeV1;
  payload: T;
}
```

`WorkChatEventV1` 是 Adapter 输出和 Renderer projection 的内部语义，不替代 Runtime/Expert wire schema。Runtime source 应直接以生成 DTO 校验；Expert source 以 pinned contract 校验；Dashboard/IPC 以各自当前 payload guard 校验后再 normalize。

Canonical Chat 类型采用以下已有语义：

```text
run.started
session.started
agent.message.delta
agent.message.completed
reasoning.delta
reasoning.completed
tool.started
tool.progress
tool.completed
tool.failed
clarify.requested
clarify.resolved
usage.updated
turn.completed
turn.failed
turn.cancelled
artifact.created       # transport event, resource projection only
```

映射规则：

| Canonical event | Transcript behaviour | Resource / lifecycle behaviour |
|---|---|---|
| `agent.message.delta` | upsert 当前 Turn 的 assistant segment，`pending=true` | 无 |
| `agent.message.completed` | merge streamed + final，`pending=false` | 不代表整个 ChatRun terminal |
| `reasoning.delta/completed` | upsert/close reasoning segment | Tool 开始后关闭当前 segment |
| `tool.started/progress` | 按 callId create/update ToolCall | progress 不创建新 call |
| `tool.completed/failed` | finalize ToolCall；有 renderer-safe result 时 upsert ToolResult | 二进制/大型结果转资源 |
| `clarify.requested/resolved` | create/resolve ClarifyMessage | requested 可暂停当前 Turn，但不是 Run terminal |
| `turn.completed/failed/cancelled` | finalize 当前 Turn；失败保留已展示历史 | 仅该 `turnId` terminal |
| `artifact.created` | 不生成 ChatMessage | Provider owner → Main File Platform upsert/association → FileDomainEvent |

### 5.3 Ordering, Idempotency and Recovery

Durable-conformant Provider 必须满足：

- `(runId, eventId)` 和 `(runId, sequence)` 在 replay 后稳定；
- `sequence` 在同一 Run 内严格递增；
- dedupe 先于 reducer；重复事件不得重复 Bubble/Tool/Clarify；
- reconnect 使用 `Last-Event-ID` 或 `after_sequence`，并返回同一权威事件；
- 同一 `turnId` terminal 后拒绝该 Turn 的新 Chat delta；后续 Turn 与异步 Artifact 仍允许；
- stale/lower-sequence event 不得覆盖更高版本状态；
- Adapter 不得用 `Date.now()` 伪造可恢复身份。

现有 Dashboard/legacy IPC 缺少上述 wire 字段时，只能标记为 `transient`。可以为当前进程内排序分配 local ordinal，但不得把它持久化或宣称为 durable event identity。

### 5.4 Runtime Capability Snapshot

统一能力至少包含：

```ts
interface WorkChatCapabilitiesV1 {
  streaming: boolean;
  reasoning: boolean;
  toolEvents: boolean;
  stableToolCallId: boolean;
  clarify: boolean;
  artifacts: boolean;
  durableReplay: boolean;
}
```

能力只决定某类事件是否可用，不决定渲染组件类型。`MessageList` 不判断 Provider 名称。`runtimeProgress=false` 的 Expert 只能声明最终文本/最低 task lifecycle，不得声明 reasoning、toolEvents 或真实 token streaming。

### 5.5 Resource Boundary

不新增 `WorkResourceEventV1` 作为第二网络或 Renderer truth。资源处理标准是：

1. Provider wire event 可与 Chat 共流；
2. transport/task owner 校验 artifact identity、auth 和 source association；
3. Main File Platform upsert `ManagedFile` / `FileAssociation`；
4. Renderer 只接收 `fileId/resourceId` 与 safe metadata；
5. `FileDomainEvent` 驱动 Session Files refresh；
6. Chat resource card 与 Session Files 消费同一个 File Platform view。

这保留 WORK PRD v3.1 的 Chat Artifact Card，同时满足 Artifact 不进入 `ChatMessage` 的边界。

## Target End-State Inventory

| Capability | Target Production Owner | Target Behaviour | Classification |
|---|---|---|---|
| Chat rendering union | Renderer Chat types | 保持五类唯一 Transcript model | KEEP |
| Transcript rows | MessageList/HistoryRow/ClarifyCard | 所有 Provider 使用相同 row semantics | KEEP |
| Canonical event projection | 现有 Dashboard projection owner 演进为唯一 Work Chat reducer | Provider-neutral event → ChatMessage；不直接解析网络 auth/URL | MODIFY |
| Dashboard adapter | 现有 Dashboard transport/adapter | raw Dashboard event → canonical event；transient capability 明示 | MODIFY |
| legacy IPC adapter | 现有 IPC Chat integration | split channels → canonical event；不再逐 channel 直接改 ChatMessage | MODIFY |
| Expert transcript adapter | 现有 Expert renderer integration | renderer-safe Expert projection → canonical assistant/turn events；Task truth 不迁移 | MODIFY |
| Runtime ChatRun adapter | Work Main runtime boundary using `@smc/runtime-client` | generated ChatRun event → canonical event；Main→Preload 保持窄 DTO | ADD |
| Event validation and capability snapshot | shared cross-process Chat event contract | 对 Adapter 输出做版本化校验；不复制外部 network SOT | ADD |
| Event dedupe/cursor/terminal state | 唯一 Work Chat reducer state | durable source 以 eventId/sequence 去重；terminal 按 turnId | ADD |
| live/DB reconciliation | 现有 session history owner | DB 只负责 restore/canonical history；ID/sequence 可用时不再依赖文本猜测 | MODIFY |
| Clarify projection | 唯一 Work Chat reducer | Dashboard/IPC/Runtime 均生成 ClarifyMessage | MODIFY |
| Tool identity | Provider adapter + reducer | stable callId lifecycle；无稳定 ID 的路径仅 transient compatibility | MODIFY |
| Expert task lifecycle | Expert Run Service | 保持 Task/SSE/reconnect/cancel/retry truth | KEEP |
| Artifact/resource lifecycle | Main File Platform | Artifact 不进入 ChatMessage；FileDomainEvent 与 resource ID 为 UI 边界 | KEEP |
| Expert execution controls | Expert renderer module | 仅执行控制，不成为 Transcript row owner | KEEP |
| Expert/remote Artifact cards | Existing Chat/file UI | 资源卡消费同一 File Platform view，不扩 ChatMessage | KEEP |

## Change Classification

| Action | Item | Required change |
|---|---|---|
| KEEP | `ChatMessage` 五类 union | 不新增 Artifact/Expert/Provider-specific message kind；不整体搬成网络 DTO |
| KEEP | `MessageList`、ReasoningRow、ToolActivityGroup、ClarifyCard | 保持现有 grouped/avatar/empty bubble 语义 |
| KEEP | `mergeStreamedWithFinal` | 作为 canonical reducer 的 completion behaviour，覆盖 Tool 前后分段 |
| KEEP | Expert Run Service / Gateway Client / projection store | 继续拥有 Expert task truth、SSE 和授权；Chat reducer只消费 safe projection |
| KEEP | File Platform / FileDomainEvent / Agent output | 继续拥有 Artifact identity、association、preview/download/materialize 与 refresh |
| MODIFY | Dashboard event projection | 从 raw event → `ChatMessage` 改为 raw event → canonical event → reducer；Clarify 改为 ClarifyMessage |
| MODIFY | legacy IPC Chat listeners | 从多个 `setMessages` 分支改为 channel adapter + canonical dispatch |
| MODIFY | Expert live transcript mirror | 从 `Chat.tsx` 直接 upsert bubble 改为 Expert projection adapter + canonical dispatch |
| MODIFY | Tool fallback | 稳定 ID 时严格 upsert；synthetic ID 明示 transient，不进入 durable replay truth |
| MODIFY | session history reconciliation | restore 保留；逐步移除 text/name heuristic 作为 durable correctness owner |
| MODIFY | terminal semantics | `run terminal` 改为 `turn terminal`；Clarify pause 和后续 Turn 不被误封 |
| ADD | Work internal Chat event contract | 版本化 envelope、typed payload guard、capability snapshot；仅内部 projection contract |
| ADD | Runtime ChatRun adapter | 复用 `@smc/runtime-client` generated contract，不手写 Runtime wire schema |
| ADD | cross-provider fixtures | text/reasoning/tool/clarify/failure/replay/artifact fixtures 对所有 Adapter 复用 |
| ADD | conformance telemetry | 记录 duplicate、sequence gap、stale event、transient fallback、reconnect outcome，不记录内容/秘密 |
| REPLACE | source-specific direct transcript mutation | 用唯一 reducer 替代 Dashboard/IPC/Expert 各自的 ChatMessage mutation owner |
| REPLACE | durable path 的文本/工具名去重 | 有 stable identity 的来源使用 eventId/sequence/callId；heuristic 只留 compatibility |
| REMOVE | 新增独立 `WorkResourceEventV1` 的方案 | 资源事件复用 Provider wire + Main File Platform + FileDomainEvent |
| REMOVE | Provider-specific Transcript branch 方案 | MessageList 不判断 provider/runtime；执行控制和资源卡按领域边界保留 |

## Replacement / Removal Matrix

| Replaced production path | Replacement owner | Removal condition |
|---|---|---|
| Dashboard Adapter 直接产生 `ChatMessage[]` | 同一现有 owner 内的 Dashboard normalizer + canonical reducer | Dashboard conformance fixtures 全通过，现有 message/reasoning/tool/clarify 回归通过 |
| `useChatIPC` 各 channel 直接 `setMessages` | legacy IPC normalizer + canonical reducer | 所有 IPC channel 有等价 canonical mapping，DB restore/error/clarify 回归通过 |
| `Chat.tsx` 直接镜像 Expert assistant bubble | Expert projection adapter + canonical reducer | Expert start/progress/result/failure/retry/rehydrate transcript 回归通过；Run Service owner 不变 |
| durable source上的 text/name heuristic dedupe | eventId/sequence/callId dedupe | Runtime/Provider durable fixtures证明 replay、gap、duplicate 与 reconnect；restore 不丢 DB-only历史 |
| 手工 `sessionFilesRefreshKey` 作为 Artifact 主刷新路径 | FileDomainEvent session-scoped refresh | Expert/Runtime artifact upsert均发受管 file association event；UI 不漏刷新 |

## Compatibility Contract

| Compatibility path | Current Consumer | Reason | Removal Condition | Removal Version |
|---|---|---|---|---|
| Hermes Dashboard transient adapter | local/remote/SSH direct Hermes Dashboard Chat | 当前 notification 无稳定 eventId/sequence/replay | Hermes Dashboard 提供 durable envelope/replay，或对应连接统一路由到 Runtime ChatRun；生产不再产生 transient event | WORK-CHAT-CONTRACT v2.0 |
| legacy Main IPC split-channel adapter | Dashboard 不可用时的 HTTP/TUI/CLI fallback | 当前 channel 只有 runId/payload，需保持现有连接降级 | 所有受支持 fallback 改用 durable ChatRun/event stream，且生产搜索无 split-channel transcript consumer | WORK-CHAT-CONTRACT v2.0 |
| DB/text/name reconciliation heuristic | direct Hermes live stream + state.db restore | 当前 stream 仍会漏 reasoning/tool rows或缺 stable identity | 受支持 source 的完整事件与 restore identity 通过长期回放验证；heuristic 仅保留历史 fixture | WORK-CHAT-CONTRACT v2.0 |

Compatibility 约束：transient 路径不得声称支持 `durableReplay`；不得把进程内 ordinal/Date.now ID 回写成 Provider identity；新 Provider 禁止接入 transient adapter。

## 6. Provider Mapping Baseline

| Source | Authoritative wire | Adapter responsibility | Explicit limitation |
|---|---|---|---|
| SMC Runtime ChatRun | generated OpenAPI + `chat-run-event.schema.json` through `@smc/runtime-client` | 基本 1:1 投影；`artifact.created` 路由 File Platform | 不在 apps/work 手写 Runtime schema |
| Runtime WorkTask | `task-event.schema.json` | 仅当任务绑定到 Chat turn 时映射 task.message/reasoning/tool/input/terminal；Task truth仍在 WorkTask | 不把 WorkTask 当 ChatRun duplicate owner |
| Hermes Dashboard | JSON-RPC `/api/ws` notification | 映射 `message.*`、`reasoning.*`、`tool.*`、`clarify.request`；声明 transient | 当前无 durable identity/replay |
| legacy Hermes IPC | Main→Renderer split channels | 把 chunk/reasoning/tool/clarify/done/error 映射到统一 reducer | 当前需 DB polling/reconcile |
| NoDeskClaw Expert | pinned WORK-EXPERT-CONTRACT + renderer-safe projection | 最终文本映射 assistant/turn；最低 task stage留 execution control；artifactFileIds走 File Platform | `runtimeProgress=false` 时禁止伪造 reasoning/tool/token delta |
| 新 MCP/Agent Provider | 其版本化、可验证 Provider contract | 必须提供 invoke、durable events/poll、normalizer、final result 和 capabilities | 不得要求新增 MessageList branch |

## 7. 不符合标准的修改清单

### P0 — Owner 收敛与可观察一致性

- 将现有 `dashboardEventAdapter` 演进为唯一 canonical projection reducer 的 owner；禁止新增平行 reducer。
- Dashboard `clarify.request` 生成 `ClarifyMessage`，不再退化为普通 assistant bubble。
- `useChatIPC`、Dashboard transport、Expert transcript mirror 只 normalize/dispatch，不直接维护各自的 Transcript mutation 规则。
- terminal 以 `turnId` 为作用域；同一 ChatRun 后续 Turn 可继续，Artifact 可在 Turn terminal 后到达。
- Artifact 继续由 File Platform upsert/association，ChatMessage union 不新增 Artifact；资源刷新统一走 FileDomainEvent。
- Runtime 接入只消费 generated client/schema；禁止把本文复制到 `contracts/runtime-*` 作为手工 SOT。

### P1 — Durable conformance

- 增加 eventId/sequence dedupe、stale discard、gap detection、Last-Event-ID/after_sequence 恢复状态。
- Runtime ChatRun、WorkTask Chat binding、新 Provider 运行同一 contract fixtures。
- 稳定 callId 为 Tool 生命周期硬门槛；无稳定 ID 的 legacy Tool event 明示 transient，不能参加 durable replay。
- DB session history 从“live correctness merge owner”收敛为 restore/canonical history adapter；stable source 不再依赖文本或 tool name 猜测。
- 增加 capabilities snapshot；UI 仅按语义能力退化，不按 Provider 名分支。

### P2 — Compatibility retirement

- 推动 Hermes Dashboard wire 增加 durable event envelope/replay，或将对应模式迁到 Runtime ChatRun。
- 删除 legacy IPC transcript direct consumer 与 transient synthetic identity。
- 当 removal condition 满足后，删除 text/name heuristic 的生产分支，只保留历史 fixtures/golden tests。

## Acceptance Criteria

### Rendering

- [ ] Local Hermes、Runtime ChatRun、legacy IPC 与 Expert 最终文本均通过同一个 canonical reducer 和 `MessageList` 渲染。
- [ ] `ChatMessage` 仍只有 Bubble、Reasoning、ToolCall、ToolResult、Clarify 五类；不存在 Artifact/Provider-specific Transcript kind。
- [ ] Reasoning、连续 Tool group、Avatar grouping、空 Bubble 和 streamed/final merge 行为不回归。
- [ ] Dashboard 与 IPC 的 Clarify 都渲染为可回复、可 resolved 且不可重复提交的 ClarifyCard。
- [ ] MessageList 不读取 provider/runtime 名称。

### Contract and Recovery

- [ ] Runtime adapter 只消费生成的 `@smc/runtime-client`/runtime event contract；contract drift gate 通过。
- [ ] durable source 的重复 eventId/sequence 不产生重复 Assistant、Tool 或 Clarify。
- [ ] sequence gap 触发 replay/snapshot 恢复或明确失败，不静默继续错误顺序。
- [ ] reconnect 使用相同 event identity；lower/stale sequence 不覆盖新状态。
- [ ] terminal 只封闭对应 `turnId`；后续 Turn 与异步 Artifact 正常处理。
- [ ] Dashboard/legacy IPC 在缺稳定身份时报告 transient capability；新 Provider 无 transient 接入口。

### Tool and Reasoning

- [ ] Tool start/progress/complete/failed 以稳定 callId upsert，ToolResult 正确关联。
- [ ] 没有稳定 callId 的 legacy event 不被标记为 durable，不以 `Date.now()` 冒充可恢复 identity。
- [ ] Tool 开始关闭当前 reasoning segment，后续真实 reasoning 创建新 segment。
- [ ] Expert `runtimeProgress=false` 不产生伪造 reasoning/tool/token timeline。

### Resource and Security

- [ ] Artifact event不进入 ChatMessage；Main File Platform 是 resource identity/association 的唯一 owner。
- [ ] Chat resource card 与 Session Files Agent output 使用同一个 file/resource ID 和 renderer-safe view。
- [ ] Renderer 不接收 JWT、Provider base URL、download/preview locator、本地绝对路径或原始 Runtime 私有字段。
- [ ] Artifact upsert 后由 FileDomainEvent 刷新相应 session；不维护第二 resourceRevision truth。

### Compatibility and Regression

- [ ] 三条 compatibility path 均可观测、可测试，并满足本文 removal contract；新代码不扩大其 consumer。
- [ ] 当前 Dashboard、remote/SSH fallback、DB restore、Expert retry/rehydrate、Artifact preview/download 与 Session Files 回归通过。
- [ ] contract fixtures至少覆盖文本、reasoning→tool→文本、多 Tool、Tool failed、Clarify、Turn failed、Artifact、duplicate/replay、sequence gap。
- [ ] `lat check` 通过，架构知识图谱记录本文的 owner 与边界。

## 8. Source Anchors

- `apps/work/src/renderer/src/screens/Chat/types.ts#ChatMessage`
- `apps/work/src/renderer/src/screens/Chat/MessageList.tsx#MessageList`
- `apps/work/src/renderer/src/screens/Chat/dashboardEventAdapter.ts#applyDashboardStreamEvent`
- `apps/work/src/renderer/src/screens/Chat/hooks/useDashboardChatTransport.ts#useDashboardChatTransport`
- `apps/work/src/renderer/src/screens/Chat/hooks/useChatIPC.ts#useChatIPC`
- `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#reconcileStreamedWithDb`
- `apps/work/src/shared/chat-stream.ts#chatToolEventFromPayload`
- `apps/work/src/shared/expert.ts#ExpertRunProjection`
- `apps/work/src/main/expert/expert-run-service.ts`
- `apps/work/src/shared/files/file-events.ts#FileDomainEvent`
- `apps/work/src/renderer/src/screens/Chat/session-files/useSessionFiles.ts#useSessionFiles`
- `contracts/runtime-events/chat-run-event.schema.json`
- `contracts/runtime-events/task-event.schema.json`
- `packages/runtime-client-ts/src/domains/chat.ts#createChatDomain`
- `docs/architecture/contract-flow.md`
- `docs/adr/ADR-003-runtime-contract.md`
- `docs/work/PRD-WORK-v3.0-expert-execution.md`
- `docs/work/PRD-WORK-v3.0.1-expert-context-selector.md`
- `docs/work/PRD-WORK-v3.1-expert-remote-artifact-chat-file-resource.md`

## 9. Open Gates

本文保持 `DRAFT`，原因不是实现细节，而是以下架构 gate 尚未关闭：

1. Hermes Dashboard 与 legacy IPC 的 stable event identity/replay 目前不存在；批准前需接受本文的 transient compatibility + v2 removal contract，或选择直接迁往 Runtime ChatRun。
2. 需要独立 PRD Review 确认：统一 reducer 不迁走 Expert Run Service、File Platform、Runtime generated contract 的现有 owner。
3. 实施前必须由本 PRD 的 APPROVED 版本生成最小 `.plan.md`；本文不冻结 exact helper、hook、test file 或 mock 技术。
