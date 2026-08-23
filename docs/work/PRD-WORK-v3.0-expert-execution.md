---
work_item_id: WORK-EXPERT-V3.0
version: v3.0
status: APPROVED
target_branch: opsi/prd-2.0
review_verdict: PASS
approved_at: 2026-08-23T14:20:14+08:00
approval_basis: USER_OVERRIDE; approved by explicit user direction despite the previously recorded external contract tag and load-gate evidence gaps.
---

# WORK PRD v3.0 — apps/work「召唤专家」源码校准稿

本文是附件初稿的 codebase-grounded 修订稿。它确认 `apps/work` 当前真实 owner、目标唯一 owner 和变更分类，并吸收独立审查发现。已核对 NoDeskClaw 的 `WORK-EXPERT-CONTRACT v1.0.1` 发布产物；其已补齐 Hermes HTTP response schema，但 consumer 尚不能锁定 v1.0.1 annotated tag SHA，且 20-run load gate 未满足。因此当前状态保持 `REVIEW_REQUIRED`、结论保持 `BLOCKED`；不得进入实施计划或实现。

## Grounding Scope

本次立即核对了 Work 路由、Chat 输入与发送链、Dashboard/Hermes 传输、MCP 配置、SSE 解析、会话投影、文件产物、认证及 IPC/Preload 边界。

已在 `apps/work` 工作目录执行 `lat search "expert"`、`lat expand "src/main/mcp-servers.ts"` 和 `lat check`；`lat.md/` 可正常使用，`lat check` 通过。本次没有修改知识图谱。

本仓库未 vendor NoDeskClaw Expert 合同；外部 `WORK-EXPERT-CONTRACT v1.0.1` 是当前候选基线，剩余固定与运行 gate 见“External Contract Gate”。`contracts/runtime-api` 中现有 `expert-mcp` 属于已冻结的 Runtime/旧 Desktop 边界，不是本 PRD 的 Work → NoDeskClaw Expert Gateway owner；本功能不得向 `services/runtime` 或 `contracts/runtime-api` 增加新 Expert 能力。

## Source Anchors

- [`apps/work/src/renderer/src/screens/Chat/ChatInput.tsx`](../../apps/work/src/renderer/src/screens/Chat/ChatInput.tsx)：`toolbarExtras` 是现有 Composer 扩展点。
- [`apps/work/src/renderer/src/screens/Chat/Chat.tsx`](../../apps/work/src/renderer/src/screens/Chat/Chat.tsx)：`handleSubmitOrQueue`、Slash Router、`queueRef` 和现有 toolbar 集成入口。
- [`apps/work/src/renderer/src/screens/Chat/hooks/useDashboardChatTransport.ts`](../../apps/work/src/renderer/src/screens/Chat/hooks/useDashboardChatTransport.ts)：当前 Local Hermes Dashboard Chat 传输 owner。
- [`apps/work/src/main/hermes.ts`](../../apps/work/src/main/hermes.ts)：当前 Hermes Chat HTTP/TUI/CLI 传输与恢复 owner。
- [`apps/work/src/main/mcp-servers.ts`](../../apps/work/src/main/mcp-servers.ts)：现有 MCP 配置、远端管理 API、校验和测试 owner；本地写入已经复用 `safeWriteFile` 原子替换。
- [`apps/work/src/main/run-stream.ts`](../../apps/work/src/main/run-stream.ts)：已有 SSE block framing 和 Hermes run event 转换能力。
- [`apps/work/src/renderer/src/screens/Chat/dashboardEventAdapter.ts`](../../apps/work/src/renderer/src/screens/Chat/dashboardEventAdapter.ts)：现有 Chat stream → message projection owner。
- [`apps/work/src/main/session-continuation-store.ts`](../../apps/work/src/main/session-continuation-store.ts)：Desktop-owned 会话投影持久化 owner。
- [`apps/work/src/main/files/agent-output/agent-output-service.ts`](../../apps/work/src/main/files/agent-output/agent-output-service.ts) 与 [`AgentOutputFileCard.tsx`](../../apps/work/src/renderer/src/screens/Chat/session-files/AgentOutputFileCard.tsx)：现有产物入库、预览和下载展示 owner。
- [`apps/work/src/main/auth/token-store.ts`](../../apps/work/src/main/auth/token-store.ts) 与 [`auth-ipc.ts`](../../apps/work/src/main/auth/auth-ipc.ts)：NoDeskClaw 用户会话和 Logout owner；Renderer 不接触 access token。
- [`apps/work/src/main/ipc/register.ts`](../../apps/work/src/main/ipc/register.ts) 与 [`apps/work/src/preload/index.ts`](../../apps/work/src/preload/index.ts)：现有 Main IPC 注册和 `window.hermesAPI` 暴露入口。
- [`apps/work/src/main/app/start.ts`](../../apps/work/src/main/app/start.ts)：Main 进程启动、IPC 注册和退出清理的现有生命周期入口。
- [`apps/work/src/shared/session-continuation.ts`](../../apps/work/src/shared/session-continuation.ts)：现有 continuation item 联合类型；未知 item 会在现有持久化链中丢失，Expert projection 必须显式扩展该合同。

## Current Capability Inventory

| Capability | Existing Owner | Existing Entry Point | Current Tests |
|---|---|---|---|
| Chat Composer 扩展 | `ChatInput.tsx` | `toolbarExtras` | `ChatInput.test.tsx`, `Chat.layout.test.tsx` |
| Chat 提交、Slash 优先级、单 Chat 队列 | `Chat.tsx` + `useChatActions.ts` | `handleSubmitOrQueue`, `queueRef` | `ChatInput.test.tsx`, Slash tests, Dashboard transport tests |
| Local Hermes Chat 执行 | `useDashboardChatTransport.ts` + `hermes.ts` | `dashboardTransport.sendMessage`, `sendMessage()` | `useDashboardChatTransport.test.tsx`, `dashboard-chat-transport.test.ts`, `hermes.test.ts` |
| MCP 配置 CRUD 与工具验证 | `mcp-servers.ts` | `list/add/update/remove/testMcpServer` | `tests/mcp-servers.test.ts`, `tests/ipc-handlers.test.ts` |
| MCP 配置原子写入 | `utils.ts::safeWriteFile` | temp file + `renameSync` | MCP config tests；缺少并发 writer/reload rollback 测试 |
| Main/Renderer IPC 边界 | `ipc/register.ts` + `preload/index.ts` + `index.d.ts` | `ipcMain.handle`, `window.hermesAPI` | `tests/ipc-handlers.test.ts` |
| SSE 文本分帧 | `run-stream.ts::parseRunSseBlock`、`sse-parser.ts` | Hermes run/chat stream parser | `run-stream.test.ts`, `tests/sse-parser.test.ts` |
| Chat 事件投影 | `dashboardEventAdapter.ts` | `applyDashboardStreamEvent` | `dashboardEventAdapter.test.ts`, `dashboard-event-adapter.test.ts` |
| Desktop 会话投影恢复 | `session-continuation-store.ts` | `persist/loadSessionContinuationItems` | `tests/session-continuation-store.test.ts` |
| Session-scoped Folder/Model | `session-context-folder-store.ts`, `session-model-override-store.ts` | per-session SQLite tables | 对应 store tests |
| Agent 产物入库与展示 | File Platform + `AgentOutputFileCard` | `createFromMessage`, preview/open/download | agent-output、file preview、AgentOutputFileCard tests |
| NoDeskClaw 用户身份 | `auth/token-store.ts` + `auth-ipc.ts` | encrypted session, `auth:logout` | auth/token/account tests |
| Expert Catalog 与授权 Skill 列表 | 不存在 | 无 | 无 |
| Expert Exact Tool Invocation | 不存在 | 无 | 无 |
| Expert Task SSE、Result、Artifact、Cancel、Retry | 不存在 | 无 | 无 |
| NoDeskClaw Expert/HermesTask API 合同 | 本仓库不存在；外部系统待提供 | 待确认 OpenAPI/JSON Schema | 无可验证 contract test |

## Grounding Findings

1. `ChatInput` 不需要重构；`WorkContext` 应通过现有 `toolbarExtras` 接入。
2. Slash Router 已经是提交优先级 owner。Expert 路由必须位于 Slash 判定之后，不能另建第二个 Chat command router。
3. `mcp-servers.ts` 已拥有 MCP 配置解析、输入校验、本地原子写入、远端管理和 test 能力。附件提出的 `ExpertMcpBindingService` 与 `LocalHermesMcpAdmin` 会形成平行 MCP owner，应从目标目录删除。由于当前外部合同未提供 Work 的 Local Hermes capability-token 生命周期，本 v3.0 不修改该 owner，也不新增 binding writer、reload 或 credential store。
4. 已有 SSE framing 可以复用。Expert 需要的是事件合同 normalization 与 reconnect orchestration，不应复制第三套通用 SSE parser。
5. 已有 `session-continuation-store.ts` 和 File Platform。`ExpertRunStore` 不能成为第二个 task truth 或第二套 artifact store；远端 HermesTask 保持事实源，本地只保存最小 UI projection。现有 continuation 是受限联合类型，Expert projection 必须明确加入版本化 item，不得依赖未知字段透传。
6. `ExpertCatalogService` 没有必要成为独立缓存 owner。Catalog/Skill HTTP、授权错误和 TTL 缓存由一个受信 Main gateway client 统一负责。
7. NoDeskClaw 已发布 `WORK-EXPERT-CONTRACT v1.0.1` 的 MCP schema、SSE schema、fixtures、manifest 与 SHA256SUMS；它确认 async event、SSE resume、idempotency、task owner policy、retry contract 与 cancel safe，并补齐 Hermes HTTP 200/4xx response schema。`runtimeProgress=false`，所以 Work 不得把远端 delta 显示为可信工具级进度。发布说明仍要求 consumer 锁定 annotated tag SHA；当前 v1.0.1 tag 尚不可解析。

## Review Remediation Decisions

本节是对独立审查发现的最终设计回应；以下外部合同事实以发布产物为准。

### External Contract Is a Release Prerequisite

NoDeskClaw Expert API 是所有 Expert 网络行为的唯一外部事实源。已提供的合同位置为 `loudon84/nodeskclaw:nodeskclaw-backend/contracts/work-expert/v1.0.1/`，manifest 的生成源码 commit 为 `bbfff0de21fd9a123d70ac4dcdb54b3cfbdf8257`。它包含 OpenAPI 3.1、独立 SSE event schema、MCP schema、fixtures、manifest 和 SHA256SUMS；`shared/expert.ts` 必须由这些产物派生，不能按 wiki 或正文猜字段。

v1.0.0 已冻结并有 tag；但 Work 消费的是 v1.0.1。发布说明要求 consumer 锁定 `work-expert-contract-v1.0.1` 的 annotated tag 名、tag target commit SHA 和 SHA256SUMS，而 v1.0.1 manifest 的 `tagTargetCommit` 仍为 `null`，tag 本身尚不可解析。因此 `main`、`manifest.backendCommit` 与 raw URL 都不是 consumer lock；在 tag 与 SHA 到位前，合同只能作为已核对的候选基线。

v1.0.1 已为 Task、Snapshot、Result、Artifacts、Cancel、Retry 与 artifact endpoints 补齐非空成功/4xx response schema。当前仍须关闭的外部 gate 是 v1.0.1 tag lock 与 20-run load evidence；真实工具级 runtime progress 仅在产品选择它为 v3.0 必需能力时才构成额外 gate。

### Contract v1.0.1 Confirmed Behaviour

Work Explicit Expert 只使用 User JWT 调用 `POST /api/v1/expert/mcp` 和 `POST /api/v1/expert/mcp/{slug}`；`tools/call` 以 `X-Idempotency-Key` 去重，成功响应为 Accepted 而非最终结果。它必须从 `structuredContent` 读取 `task_id`、`event_stream`、`event_token_url`、`result_url`、`artifact_url` 和 `wait_strategy`。JSON-RPC 应用错误可以是 HTTP 200，错误码位于 `error.data.errorCode`。

Task 的权威事实源是 `/api/v1/hermes/tasks/{task_id}`、`snapshot`、`events`、`result` 和 `artifacts`；恢复优先 `snapshot`。SSE 支持 `Last-Event-ID`、event sequence 与 replay。普通用户 task owner policy 生效，跨用户操作应收到 403；MCP capability token 的 scope 与 allowed tool/skill 过滤由后端执行。

本版本只承诺 `preparing`、`finalizing` 等最低阶段；`runtimeProgress=false` 时，Work 只能显示“正在执行”的非细分状态，不能声称正在检索、调用某工具或产生可信 token/delta timeline。

### WorkContext and Expert Task State Machine

Expert 请求在 `Chat.tsx` 形成一个不可变 `ExpertRequest` 快照：`kind`、`expertSlug`、`skillName`、`prompt`、已允许的附件引用、`sessionId`、`profileId`、`clientRequestId` 和调用时的认证代际。不能复用或读取队列 drain 时的 toolbar 当前值。Slash 判定始终先于此路由。

状态机只有 `queued → starting → running → terminal`；`terminal` 是 `succeeded | failed | cancelled | expired | unauthorized`。本地 Chat 与 Expert Task 不共享 `isLoading` 事实状态：普通 Chat 保持原队列语义，Expert 运行状态由 Expert store 投影。取消 queued item 只移除尚未发出的请求；取消 `starting/running` item 必须调用同一 `clientRequestId`/`taskId` 的远端 cancel。Retry 只允许对 terminal failure，并生成新的 `clientRequestId`；不得重用旧任务或在 mode/account/profile 改变后静默执行。

### MCP Binding Scope Decision

`WORK-EXPERT-CONTRACT v1.0.1` 为 Work Explicit Expert 定义的是 User JWT consumer path；虽然 NoDeskClaw 也支持 Local Hermes 的 `ndsk_mcp_*` capability token，但 v1.0.1 没有向 Work 暴露 token issuance、rotation、revoke 或 profile binding 接口。因此 Local Hermes Expert MCP binding 不是本 v3.0 的可实施 consumer capability。

本 PRD 从 v3.0 target 中移除该 binding；`mcp-servers.ts` 保持现有 MCP 配置 owner，不为 Expert 新增 writer、token store、reload 或 wrapper。将来确有现有 consumer 时，须由新的版本化 NoDeskClaw contract 定义 capability token 生命周期和 profile/connection semantics，再以独立 PRD 加入该能力。

### Event Delivery and Status Polling

`expert-run-service.ts` 是 Expert 事件合并的唯一 owner。SSE event id 只可按外部合同保存和恢复；同一 task 的事件按 event id 去重，乱序事件不能覆盖更高版本的状态，terminal state 一旦经 status/result 确认不可回退。

status polling 是一个有期限的 fallback，不是第二个协议 owner：只读取同一 HermesTask status endpoint。它仅在 SSE 建连/恢复失败后启动，最多连续 5 次重连，指数退避为 1s、2s、4s、8s、16s；之后以 15s 间隔轮询，最长 10 分钟或到 terminal state 为止。达到上限后显示可重试的 `delivery-timeout`，并记录指标。该 fallback 的 Current Consumer 是 `expert-run-service.ts`；目标 removal version 是 **v3.2（最早）**，条件为持久事件流通过 30 天生产指标、断线恢复和完成事件零丢失验证，并由新 PRD 删除。`runtimeProgress=false` 不影响 completion polling，但禁止 UI 将该 fallback 伪装为过程级 progress。

### Continuation, Artifact and Lifecycle Boundaries

Expert restart projection 是 `DesktopSessionContinuationItem` 的一个显式、版本化联合成员：`kind: "expert-run"`、`schemaVersion: 1`、`taskId`、不可变 WorkContext 摘要、`lastEventId`、最后显示状态与时间戳。它不是 task truth。rehydrate 时 Main 必须重新校验当前 user/profile/session 对 task 的授权；任务已过期、已撤销或不允许访问时，删除 projection 并显示确定的不可恢复状态。需要覆盖断电、Logout 与 task completion 并发。

远端 artifact 只可由 Main 下载并经现有 File Platform 入库。v1.0.1 的 artifact descriptor 部分字段可空，不能作为 Work 的信任断言；Work 只接受后端返回的 `artifact_id`，并以已配置的 NoDeskClaw API base URL 调用同源、带 User JWT 的 preview/download endpoint。不得信任或跳转 nullable `download_url`，也不得从 Renderer 接受 URL。

Main 必须验证 artifact ID 与当前 task/session 的关联，拒绝跨 origin/redirect，限制流式下载大小，并采用保守的 MIME/文件名策略；若后端未提供 hash/signature，Work 不得声称已完成内容完整性校验。写入临时文件后原子提交，并在失败、Logout 或授权变化时清理临时文件。`AgentOutputFileCard` 只展示已入库的本地文件。后续合同若将 task/profile、size、hash 与下载 locator 设为必填，可再增加相应的强校验，而不创建第二套 artifact owner。

`startMainProcess` 是 Expert service 生命周期入口：先构造单例 `expert-run-service`，再注册 Expert IPC；退出前按“停止新请求 → abort SSE/polling → 取消本地下载 → 清理内存 cache → dispose”执行。auth logout、profile/connection change 必须使用同一幂等 dispose 路径；每个 IPC 调用都验证 sender、当前 session、profile 与 DTO。

## Target End-State Inventory

| Capability | Production Owner | Allowed Implementations |
|---|---|---:|
| Hermes Default Chat、Slash Router 与普通队列 | 现有 `Chat.tsx` + `useChatActions.ts` + Dashboard/Hermes transport | 1 |
| Expert 跨进程 DTO、状态与事件类型 | 新增 `apps/work/src/shared/expert.ts`，只由已批准 NoDeskClaw contract 派生 | 1 |
| WorkContext 选择与 Expert UI 组合 | 新增 `renderer/src/modules/expert/`，由一个 feature public entry 统一导出 | 1 |
| Local/Expert 提交选择与队列 WorkContext 快照 | 修改 `Chat.tsx`/Chat types 的现有提交链 | 1 |
| Expert Gateway HTTP、Catalog/Skill 缓存和授权错误 | 新增 `main/expert/expert-gateway-client.ts` | 1 |
| Expert Run 生命周期、SSE 重连、受限 status-poll fallback、authoritative completion、Cancel/Retry | 新增 `main/expert/expert-run-service.ts` | 1 |
| SSE block framing | 复用/最小泛化 `main/run-stream.ts::parseRunSseBlock` | 1 |
| Expert Main IPC 注册 | 新增 `main/expert/expert-ipc.ts`，由现有 app startup 注册 | 1 |
| Expert Preload bridge | 新增 `preload/expert-api.ts`，挂载到现有 `window.hermesAPI.expert` | 1 |
| Expert UI projection | 新增 `renderer/src/modules/expert/store.ts`；只保存 UI 状态，不充当 task truth | 1 |
| Expert Run restart projection | 修改 `shared/session-continuation.ts` 与 `session-continuation-store.ts`；唯一版本化 `expert-run` projection | 1 |
| Expert Result/Artifact 入库、预览与下载 | 复用并扩展现有 File Platform 和 `AgentOutputFileCard` | 1 |
| Expert 生命周期注册与关闭 | 修改 `main/app/start.ts`；构造/注册单例并在退出时按既定顺序 dispose | 1 |
| Logout 时 Expert 清理 | 修改 `auth-ipc.ts`，调用 Expert Run owner 走同一 dispose 路径，清理本地 Expert projection/cache/download | 1 |
| Expert/HermesTask 服务端合同与容量治理 | NoDeskClaw Expert API（外部唯一 owner；当前为 WORK-EXPERT-CONTRACT v1.0.1 候选基线） | 1 |
| Runtime `expert-mcp` 旧 Desktop 管理边界 | 保持冻结；本 PRD不扩展 | 1 |

## Change Classification

| Item | Action | Existing Owner | Target State |
|---|---|---|---|
| `ChatInput.toolbarExtras` | KEEP | `ChatInput.tsx` | 继续作为 WorkContext UI 插槽，不修改核心 Composer |
| Hermes Default Chat | KEEP | Dashboard/Hermes transport | Expert 功能关闭或 local mode 时行为不变 |
| Slash Router | KEEP | `Chat.tsx` + Slash modules | `/command` 优先于 Expert execution |
| Context Folder、Model、Reasoning、Fast Mode | MODIFY | `Chat.tsx` toolbar state | Expert mode 禁用但不删除；不得传给 Remote Expert |
| Chat queue request | MODIFY | `Chat.tsx`/Chat types | 以 `ExpertRequest` 快照、单一状态机、queued/running 两类取消和新幂等键 retry 固化 Expert 语义 |
| MCP 配置 | KEEP | `mcp-servers.ts` | v3.0 Explicit Expert 不消费 Local Hermes capability token；不新增 Expert binding writer、credential store 或 reload path |
| SSE framing | MODIFY | `run-stream.ts` | 泛化并复用现有 parser，Expert run service 不复制 parser |
| Session continuation | MODIFY | `shared/session-continuation.ts` + `session-continuation-store.ts` | 加入版本化 `expert-run` 联合成员；rehydrate 必须授权复核，服务端状态优先 |
| File Platform/Artifact UI | MODIFY | Existing File Platform | 只接入 Main 受控下载、校验、临时文件原子提交后的 artifact，不新建平行 artifact store |
| App lifecycle | MODIFY | `main/app/start.ts` | 注册 Expert IPC/service，并规定 quit dispose 顺序 |
| Logout | MODIFY | `auth-ipc.ts` | 追加 Expert SSE、polling、catalog cache、临时下载及本地 projection 清理 |
| Shared Expert contract | ADD | 无 | `shared/expert.ts` 成为跨 Main/Preload/Renderer 唯一 DTO owner |
| Expert Gateway client | ADD | 无 | 受信 Main 网络 owner，Renderer 不传 URL/token |
| Expert Run service | ADD | 无 | 唯一 task lifecycle owner，包含 exact call、reconnect、completion、cancel/retry |
| Expert IPC/Preload | ADD | 无 | 窄接口，只接受 expertSlug、skillName、prompt、taskId 等已验证 DTO |
| Expert renderer feature | ADD | 无 | Selector、RunCard、Timeline 和 UI projection 位于一个 feature boundary |
| `ExpertCatalogService` 独立实现 | REMOVE | 原稿拟新增、尚无生产 consumer | 合并到唯一 `expert-gateway-client.ts` owner |
| `ExpertMcpBindingService` 独立实现 | REMOVE | 原稿拟新增、尚无生产 consumer | 能力归现有 `mcp-servers.ts` |
| `LocalHermesMcpAdmin` | REMOVE | 原稿拟新增、尚无生产 consumer | 能力归现有 `mcp-servers.ts` |
| Local Hermes Expert MCP binding（v3.0 scope） | REMOVE | 原稿拟新增、当前合同没有 Work consumer token lifecycle | Explicit Expert 仅消费 User JWT；等待未来合同和实际 consumer 后以独立 PRD 引入 |
| `ExpertSseService` 独立 parser owner | REMOVE | 原稿拟新增、尚无生产 consumer | 生命周期归 `expert-run-service.ts`，framing 复用 `run-stream.ts` |
| `ExpertRunStore` 作为事实源/持久化 owner | REMOVE | 原稿拟新增、尚无生产 consumer | Renderer store 仅投影；HermesTask 是事实源，持久化复用 continuation store |
| Runtime control-plane Expert API 扩展 | REMOVE | Frozen Runtime boundary | Work 直接使用 NoDeskClaw，禁止向 `services/runtime` 增加本功能 |

## New File Justification

- `shared/expert.ts`：现有 chat/MCP DTO 不表达 Expert、Skill、HermesTask 和 Expert event；跨进程信任边界需要一个唯一合同 owner。
- `main/expert/expert-gateway-client.ts`：现有 `mcp-servers.ts` 管理 Local Hermes MCP 配置，不负责 NoDeskClaw 用户级 Expert HTTP API；把远端 URL/token 放入 Renderer 不安全。
- `main/expert/expert-run-service.ts`：现有 Hermes Chat transport 不表达独立 HermesTask 的 authoritative status/result/artifact/cancel/retry 生命周期；该文件只拥有 Expert task orchestration，复用现有 SSE framing。
- `main/expert/expert-ipc.ts` 与 `preload/expert-api.ts`：现有架构对 auth/files 已采用按 domain 注册和 bridge；Expert 需要同样的最小信任边界，不能把 Gateway client 暴露为任意 HTTP proxy。
- `renderer/src/modules/expert/`：现有 renderer 只有 auth feature module，没有 Expert UI owner；把 Selector、RunCard、Timeline 全部塞入 `Chat.tsx` 会扩大现有提交 owner。

不新增 Expert continuation store、artifact store、MCP admin、SSE parser 或 lifecycle wrapper；它们分别扩展既有 continuation、File Platform、`mcp-servers.ts`、`run-stream.ts` 和 `startMainProcess` owner。

## Compatibility Contract

本 PRD不新增 legacy、compat、alias 或 adapter wrapper。SSE 失败后的 status polling 是受版本约束的可靠性 fallback，不是并行协议；它仍读取同一个 HermesTask truth，并由 `expert-run-service.ts` 唯一拥有。

| Compatibility | Current Consumer | Reason | Removal Condition | Removal Version |
|---|---|---|---|---|
| Task status polling fallback | `expert-run-service.ts` | SSE 建连或恢复连续失败时，仍需读取同一 HermesTask 的权威 terminal state | 持久事件流通过 30 天生产指标、断线恢复和完成事件零丢失验证；以新 PRD 删除该分支 | v3.2（最早） |

## External Contract Gate

已核对的候选基线是 [WORK-EXPERT-CONTRACT v1.0.1 Release Notes](https://github.com/loudon84/nodeskclaw/blob/main/nodeskclaw-backend/contracts/work-expert/v1.0.1/RELEASE.md)。其 `manifest.json` 记录生成源码 commit `bbfff0de21fd9a123d70ac4dcdb54b3cfbdf8257`，并为 OpenAPI、SSE/MCP schema、HTTP fixtures 与 load evidence 给出 SHA256SUMS。v1.0.1 已补齐 Hermes HTTP 200/4xx response schema；v1.0.0 的冻结 tag 不再是 Work consumer 的 target。

在重新 PRD Review 前，外部 owner 必须完成以下剩余交付：

- 创建可解析的 `work-expert-contract-v1.0.1` annotated tag，记录 tag object/peeled target commit SHA，并更新 v1.0.1 manifest 的 `tagTargetCommit`；Consumer lock 必须使用 tag 名 + target SHA + SHA256SUMS，而不是 `main` 或 `manifest.backendCommit`。
- 完成并记录 20 active runs 压测；当前 evidence 为 `executed=false`、`passed=false`，`capabilities.loadGate` 为 `unmet`，worker batch 是顺序执行，队列配置不是吞吐 SLA。
- 若 v3.0 要求真实工具级过程时间线，发布 `runtimeProgress=true` 的后续合同；当前版本只允许最低阶段状态。

Work CI 只能以冻结 tag 下载合同，校验 SHA256SUMS 与 manifest，再用 fixtures/schema 驱动 contract tests。未满足上述项前，合同不可作为 Cursor Plan 的实现依据。

## Acceptance Criteria

- [ ] `Current Capability Inventory` 中每项现有 owner 都能由列出的源码入口和测试定位。
- [ ] `Target End-State Inventory` 中每项 capability 只有一个 production owner。
- [ ] 原稿拟新增的 MCP admin、SSE parser、artifact store、task truth 平行实现已从目标目录删除。
- [ ] Hermes Default Chat、Slash Router、Composer 扩展点、File Platform 和 Runtime frozen boundary 保持原 owner。
- [ ] NoDeskClaw Expert/HermesTask 外部合同已以 annotated tag SHA 固定，并通过 contract review 与 schema drift 检查。
- [ ] Contract schema/fixture 覆盖 Catalog、exact call、start/status/snapshot/result/cancel/retry、SSE replay、鉴权/额度错误、artifact descriptor；v1.0.1 Task HTTP response 不得退回空 schema。
- [ ] Expert request 状态机测试覆盖 Slash 优先、queue drain 后 mode/account/profile 改变、queued/running cancel、重复 retry 与 terminal completion race。
- [ ] Expert event 测试覆盖重复/乱序 SSE、Last-Event-ID reconnect、五次重连后的 polling budget、polling terminal state 和 delivery timeout。
- [ ] Continuation 测试覆盖 `expert-run` schema migration、断电恢复、登出、授权被撤销、过期 task 与 task completion race。
- [ ] Artifact Main-only 测试只接受同源、带鉴权 artifact ID endpoint，覆盖 URL/redirect 拒绝、超限、保守 MIME/文件名、部分下载清理、跨用户拒绝与 Logout race；hash/signature 不存在时不得声称已验证完整性。
- [ ] 生命周期测试覆盖 IPC 注册顺序、sender/session/profile 校验、logout/connection change/quit 的幂等 dispose 顺序。
- [ ] 外部 `loadGate` 已满足，并以可复现证据证明 20 个并发 Expert Run 时不会使普通 Chat 队列或 UI 主线程退化。
- [ ] 经 `smc-prd-review` 得到 PASS 后，才可由 `smc-prd-converge` 设置 `status: APPROVED`。
- [ ] 只有 APPROVED PRD 才能进入 `smc-plan-from-approved-prd`。

## Human Decisions Required

1. NoDeskClaw maintainer 创建 `work-expert-contract-v1.0.1` annotated tag，并提供 tag object SHA、peeled target SHA 与批准记录。
2. 确认 Expert Team actor metadata 是 P0 合同还是允许 P1 退化，并把选择写入外部 schema。
3. 确认是否接受 v3.0 仅显示最低阶段状态；若要求真实工具级 timeline，等待 `runtimeProgress=true` 的后续合同。
4. 提供通过的 20 active runs 压测证据，使 `loadGate` 从 `unmet` 变为满足。
