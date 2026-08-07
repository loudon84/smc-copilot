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

v1.4 Chat 以 HermesInstance 为一等公民。[[src/services/instance_ref_resolver.py#InstanceRefResolver]] 解析 id/name/profile_name/default；[[src/services/instance_chat_service.py#InstanceChatService]] 经 credential broker 代理 models/config/completions/sessions。旧 `/profiles/{id}/chat/*` 映射到 Instance 并返回 `Deprecation`/`Sunset` 头；chat settings 优先 `instance_id`。

## Chat Runtime v2

v1.1 引入 durable ChatRun：Desktop 经 `/api/v1/chat-runs*` 与 Event Store 交互，Hermes SSE 不再是 Desktop 事实源。路由 [[src/api/v1/chat_runs.py]]；编排 [[src/services/chat_run_service.py#ChatRunService]]；事件 [[src/services/chat_event_service.py#ChatEventService]]；队列 [[src/services/chat_queue_service.py#ChatQueueService]]；交互 [[src/services/chat_interaction_service.py#ChatInteractionService]]。能力 `chat.runtime.v2` 见 [[profiles-instances#能力协商]]。

Turn 执行当前为 stub worker，持久化 `agent.message.*` / `turn.*` 事件以保证 SSE/replay e2e；后续切到 InstanceChatService→Hermes。`runId` 路径同时接受主键与 `client_run_id`。SSE 用单调 `sequence` 作 `Last-Event-ID`，亦支持用 event UUID 定位后继续 replay。
