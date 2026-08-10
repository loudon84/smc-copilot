# Workspace Chat

team_v1.8 引入 Workspace Chat：Runtime 解析 Profile、注入默认模型与附件上下文，将 Desktop 的 chat 请求代理到目标 Gateway 的 `/v1/chat/completions`，并把 Gateway SSE 归一为 `chat.*` 事件流。相关：[[profiles-instances#Profile 与 Instance]]、[[gateway-supervisor#Gateway 监管]]。

## Chat SSE 流

[[src/services/chat_stream_service.py#ChatStreamService]] `stream_chat` 先 `require_deployed_profile` + `ensure_gateway_ready`，解析默认模型（[[src/services/chat_model_service.py#ChatModelService]]），加载附件并构造 system 上下文块插入 messages，再以 `httpx` stream POST 到 Gateway。

响应按 `\n\n` 分块解析：`hermes.tool.progress` → `chat.tool_progress`；`usage` → `chat.usage`；`choices[0].delta.content` → `chat.chunk`；`error` → `chat.error`；末尾 `chat.done`（含 `x-hermes-session-id` 回填）。`register_stream`/`abort_stream` 维护可取消流表，取消时发 `chat.error(code=CHAT_STREAM_ABORTED)`。SSE 经纯 ASGI CORS 包装（见 [[architecture#应用装配]]）。

## 附件

[[src/services/attachment_service.py#AttachmentService]] 校验、落盘并按 profile/workspace/session 作用域加载附件，`build_attachment_context` 拼成上下文块。附件表 `chat_attachments`，上传经 `python-multipart` `Form`/`UploadFile`。相关测试见 [[tests#Workspace Chat]]。

## Session 访问

Runtime 通过 `sessions` 路由读取 Profile 目录下 Hermes `state.db` 的会话消息（`chat_session_service`），暴露 `sessions.read` 能力（见 [[profiles-instances#能力协商]]）。Runtime 不持有会话存储，仅作受控代理。

## Instance Chat

v1.4 Chat 以 HermesInstance 为一等公民。[[src/services/instance_ref_resolver.py#InstanceRefResolver]] 解析 id/name/profile_name/default；[[src/services/instance_chat_service.py#InstanceChatService]] 是 **compatibility adapter**：底层统一走 [[src/services/hermes_chat_executor.py#HermesChatExecutor]]，仅把内部执行事件格式化为 legacy `chat.*` SSE，禁止第二套 Hermes 调用逻辑。旧 `/profiles/{id}/chat/*` 映射到 Instance 并返回 `Deprecation`/`Sunset` 头；chat settings 优先 `instance_id`。

## Hermes Model Catalog (v1.5.4)

Execution catalog SOT is Hermes `/api/model/options` via [[src/services/hermes_model_catalog_service.py#HermesModelCatalogService]]; default from `~/.hermes/config.yaml`.

Gateway `/v1/models` is virtual-only (e.g. `smc-copilot`) for diagnostics — never Desktop picker or model-config seed. `GET /instances/{id}/chat/models?refresh=` forwards to options; virtual historical bindings reconcile on read. [[src/services/hermes_chat_executor.py#HermesChatExecutor]] resolves execution `model` via the same catalog SOT and omits virtual aliases (PRD §47). `PUT /chat/model-config` also writes Hermes `config.yaml` default via HermesConfigAdapter so Desktop Set Default goes through Runtime to the local Agent SOT.

## Chat Runtime v2

v1.1 引入 durable ChatRun：Desktop 经 `/api/v1/chat-runs*` 与 Event Store 交互，Hermes SSE 不再是 Desktop 事实源。路由 [[src/api/v1/chat_runs.py]]；编排 [[src/services/chat_run_service.py#ChatRunService]]；事件 [[src/services/chat_event_service.py#ChatEventService]]；队列 [[src/services/chat_queue_service.py#ChatQueueService]]；交互 [[src/services/chat_interaction_service.py#ChatInteractionService]]。能力 `chat.runtime.v2` 见 [[profiles-instances#能力协商]]。

`runId` 路径同时接受主键与 `client_run_id`。SSE 用单调 `sequence` 作 `Last-Event-ID`，亦支持用 event UUID 定位后继续 replay。

## Hermes Chat Executor

[[src/services/hermes_chat_executor.py#HermesChatExecutor]] 是 Hermes Gateway chat stream 的唯一执行入口（PRD v1.2）。解析 Instance、凭证、默认模型与附件上下文后 POST `/v1/chat/completions`，经 [[src/services/hermes_chat_event_mapper.py#parse_hermes_sse_block]] 产出内部 `HermesExecutionEvent`（delta / usage / tool / clarify / failed 等）。Durable 路径与 legacy Instance Chat 共用此执行器。

本地 L2 可用 `scripts/mock_hermes_gateway.py` 模拟 delta、usage、`hermes.tool.progress`、`x-hermes-session-id`、中途 abort，以及 query/header 触发的 provider failure。

## Chat Turn Scheduler

[[src/services/chat_turn_scheduler.py#ChatTurnScheduler]] 保证每个 ChatRun 同时最多一个 active Turn：`schedule_turn` 入队后等待同 Run 无 running/waiting_*，再交给 Worker。Turn 终态后 `on_turn_finished` 提升下一个 queued turn / queue entry。

## Chat Turn Worker

[[src/services/chat_turn_worker.py#ChatTurnWorker]] 执行单 Turn：queued→running→`ChatExecutor.execute`→将 `HermesExecutionEvent` 映射并 `ChatEventStore.append`（先写库再消费）。支持 cancel Event（abort）、clarify/approval 挂起、usage/tool 观测字段。测试可用 `EchoChatExecutor` / `set_use_echo_executor(True)` 离线回放。

## Chat Turn Recovery

[[src/services/chat_turn_recovery.py#recover_chat_turns]] 在 Runtime 启动时恢复：queued/pending 重新入队；running 标 failed（`RUNTIME_RESTARTED_DURING_TURN`）并写 `turn.failed`，**不**重放 Hermes；waiting_clarify/approval 留给 Desktop 续跑。由 lifespan / WorkerSupervisor 在启动路径调用。

## Chat Capability Closure (v1.6 P0)

v1.6 将原 copilot-desktop Hermes Chat 能力收口到 Runtime：Desktop 不得直连 Hermes Home/DB/Gateway/Dashboard WS。

- Command Catalog / Slash Execute：[[src/api/v1/chat_commands.py]] + [[src/services/chat_command_service.py#ChatCommandService]]，底层 [[src/integrations/hermes/dashboard_rpc_client.py#HermesDashboardRpcClient]]（`commands.catalog` / `slash.exec` / `command.dispatch`）。
- Background `/btw`：`POST /chat-runs/{runId}/background-turns` → [[src/services/background_chat_service.py#BackgroundChatService]]；`chat_runs.run_kind=background`，发 `background.*` 事件，不改 Main Queue/State。
- Session Files：[[src/api/v1/session_chat.py]] + [[src/services/session_file_service.py#SessionFileService]]（list/search/+Ctx/-Ctx）。
- Session Chat Settings：表 `session_chat_settings` + [[src/services/session_chat_settings_service.py#SessionChatSettingsService]]（`modelId` / `contextFolder`）；Turn 执行前解析 Session Override 与 `x-hermes-cwd`。
- Worktree：[[src/services/workspace_browse_service.py#WorkspaceBrowseService]]（path escape / symlink 校验）。
- 测试：[[tests#Chat Capability v1.6]]。
