# API Contracts (copilot-desktop)

IPC channels exposed to the Renderer via Preload. This document is incrementally maintained; full `index.ts` inventory is not duplicated here.

## AIOS Workspace (read-only file tree)

Registered in `src/main/aios-workspace-ipc.ts`, exposed as `window.aiosWorkspace`.

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `aios-workspace:list-files` | invoke | `profileId: string`, `relativePath?: string` (default `"."`) | `WorkspaceFileEntryDto[]` | Lists non-dot entries under profile home. Paths resolved with `root + sep` sandbox (see below). |
| `aios-workspace:read-file` | invoke | `profileId: string`, `relativePath: string` | `{ ok: true, content, encoding }` or `{ ok: false, error }` | Preview whitelist extensions; max size 256KB (text) / 512KB (images). Errors: `FILE_NOT_FOUND`, `NOT_A_FILE`, `UNSUPPORTED_TYPE`, `FILE_TOO_LARGE`. |
| `aios-workspace:git-status` | invoke | `profileId: string` | `{ branch: string \| null, dirtyCount: number }` | Runs `git` in profile home; no `.git` → `{ branch: null, dirtyCount: 0 }`; 3s timeout. **team_v1.5.3** |

**Path sandbox:** `profileId` resolves to DB profile `name` (e.g. `writer-9601`) → `profileHome(name)`. Target path must equal root or start with `root + path.sep` after `resolve()` (prevents `writer-evil` prefix bypass on Windows).

## Profile Runtime (AIOSWorkspace consumers)

Registered in `src/main/profile-runtime-ipc.ts`, exposed as `window.profileRuntime` (`profile-runtime-api.ts`).

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `profile-runtime:status` | invoke | — | `ProfileGatewayState[]` | All runtime instances. |
| `profile-runtime:probeHealth` | invoke | `profileId: string` | `{ healthy: boolean }` | Read-only `GET http://{host}:{port}/health`. Only probes when DB status is `running`; does not mutate status. **team_v1.5.2** |
| `profile-runtime:listProfileSessions` | invoke | `profileId: string` | `ProfileSessionSummary[]` | Reads `{profile_home}/state.db` sessions table; home resolved via profile **name**, not UUID. **Fixed v1.5.2** |
| `profile-runtime:deleteProfileSession` | invoke | `profileId: string`, `sessionId: string` | `{ ok: boolean }` | `DELETE FROM sessions WHERE id = ?` on profile state.db; no-op if db missing. **team_v1.5.2** |
| `profile-runtime:startProfile` | invoke | `profileId: string` | `ProfileGatewayState` | |
| `profile-runtime:stopProfile` | invoke | `profileId: string` | `ProfileGatewayState` | |
| `profile-runtime:restartProfile` | invoke | `profileId: string` | `ProfileGatewayState` | |
| `profile-runtime:getGatewayLogs` | invoke | `profileId`, `options?` | `GatewayLogEntry[]` | |
| `profile-runtime:listProfileSkills` | invoke | `profileId: string` | skill summaries | |
| `profile-runtime:listAuditEvents` | invoke | `filter?` | audit rows | |

**Events (Main → Renderer):** `profile-runtime:onStatusChanged` → `RuntimeStatusChangeEvent`.

## Hermes chat (AIOSWorkspace via `aiosWorkspaceApi`)

Global channels on `window.hermesAPI` (not profile-scoped in payload):

| Event | Payload | Notes |
|-------|---------|-------|
| `chat-chunk` | `string` | Stream token |
| `chat-done` | `sessionId?: string` | Persisted session id after first message |
| `chat-error` | `string` | |
| `chat-tool-progress` | `string` | Tool name |

Renderer guards by `streamingOwnerRef` + `abortChat` on profile switch (**team_v1.5.1**).

**Approval UI (team_v1.5.3):** No new chat IPC. Renderer sets `waiting_approval` when `chat-tool-progress` payload matches heuristics (`approval`, `confirm`, `human`, etc. in `approvalUtils.ts`). Approve clears local state only; Reject calls `abortChat`. Gateway resume is out of scope for P2.

## Workspace Chat (team_v1.8)

Workspaces Chat 面板经 `window.workspaceChat` 代理到 `copilot-serve`（`:8765`），不再经 `hermesAPI` 直连 Gateway。Main 注册于 `src/main/workspace-chat/workspace-chat-ipc.ts`，Preload：`src/preload/workspace-chat-api.ts`，契约：`src/shared/workspace-chat/workspace-chat-contract.ts`。

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `workspace-chat:resolve-profile` | invoke | `profileRef: string` | `ResolvedProfile` | ref 支持 id / name / `default` |
| `workspace-chat:list-models` | invoke | `profileId: string` | `ChatModelListResponse` | Gateway 模型列表 |
| `workspace-chat:get-model-config` | invoke | `profileId: string` | `ProfileChatModelConfig \| null` | 持久化默认模型 |
| `workspace-chat:set-model-config` | invoke | `profileId`, `SetProfileChatModelConfigPayload` | `ProfileChatModelConfig` | |
| `workspace-chat:upload-attachments` | invoke | `UploadWorkspaceAttachmentsPayload` | `UploadWorkspaceAttachmentsResponse` | Main 弹窗选文件后 multipart 上传 serve |
| `workspace-chat:remove-attachment` | invoke | `workspaceId`, `attachmentId` | `{ ok: true }` | |
| `workspace-chat:send-message` | invoke | `WorkspaceChatSendPayload` | `{ stream_id: string }` | 立即返回；SSE 在 Main 后台消费 |
| `workspace-chat:abort` | invoke | `profileId: string` 或 `{ profile_id, session_id? }` | `{ ok: true }` | 中止 stream；带 `session_id` 仅中止该会话桶 |

**Events (Main → Renderer):** 载荷均含 `stream_id`、`profile_id`、`workspace_id`、`session_id`（scope 校验）。

| Event | Payload | Notes |
|-------|---------|-------|
| `workspace-chat:chunk` | `WorkspaceChatChunkEvent` | 流式文本 |
| `workspace-chat:tool-progress` | `WorkspaceChatToolProgressEvent` | 工具进度 |
| `workspace-chat:usage` | `WorkspaceChatUsageEvent` | token 用量 |
| `workspace-chat:done` | `WorkspaceChatDoneEvent` | 流结束；可含 `resolved_session_id`（Gateway `x-hermes-session-id`） |
| `workspace-chat:error` | `WorkspaceChatErrorEvent` | 结构化错误 |
| `workspace-chat:status` | `WorkspaceChatStatusEvent` | 预留状态（可选） |

Renderer UI：`panels/ChatPanel.tsx` → `pages/Chat/HermesWebChatSurface.tsx`；编排 hook：`hooks/useHermesWebChat.ts`。

**team_v1.8.1 hotfix：** 会话历史改走 copilot-serve `GET /api/v1/profiles/{id}/sessions/{session_id}/messages`（Renderer `copilotServeFetch`）；`chat.done` 回写 `resolved_session_id`；Main stream 按 `profile_id:session_id` 分桶 abort。

**team_v1.8.3 hotfix：** 聊天门控以 `resolveProfile` 为准；Profile runtime 启停/状态变更后 Renderer 必须 re-resolve（`useHermesWebChat` 监听 `runtime.status` 等）。勿用 legacy `hermesAPI.gatewayStatus` 覆盖 copilot-serve 的 stopped/starting 状态。

**Serve 会话消息（Renderer 直连 serve，不经 IPC）：**

```http
GET /api/v1/profiles/{profile_id}/sessions/{session_id}/messages
```

## Hermes Default Chat (v5.6.4)

Local Hermes（固定 `default` profile）WebChat Surface 使用 `window.hermesDefaultChat`（Main 新 IPC），不依赖 `workspaceChat` / copilot-serve。

Main：`src/main/hermes-default-chat/hermes-default-chat-ipc.ts`  
Preload：`src/preload/hermes-default-chat-api.ts`  
契约：`src/shared/hermes-default-chat/hermes-default-chat-contract.ts`  
配置 YAML：`src/main/hermes-config/hermes-config-yaml.ts`  
Env / Key：`src/main/config.ts` `readEnv()` + `src/main/hermes-model-env.ts`  
架构约束：[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) § **V5.6.4 Local Hermes Chat — 强制约束**

### WebOperator Hermes Panel（v5.7.4）

Renderer 公共组件：`src/renderer/src/components/hermes/`（`WebOperatorHermesChatPanel`）。  
消费方：`src/renderer/src/screens/WebOperator/HermesTaskPanel.tsx`。

| 规则 | 说明 |
|------|------|
| 传输 | **仅** `window.hermesDefaultChat` + `hermesAPI.getSessionMessages`（历史）；**禁止** Portal HTTP、`workspaceChat` |
| 模型 | **不传** `model_id`；**禁止** `getSessionModel` / `setSessionModel`；`resumeSessionId` 占位用 `draft_weboperator`（与全页 `draft_default` 隔离）→ Main 走全局默认 `config.yaml` overlay |
| Web 上下文 | `aiosBrowser.getFrameHtml` → `WebOperatorPageContext` → 首轮 `hermesDefaultChat.uploadAttachmentBuffers`（`web-context/*`）+ `buildTaskFirstMessage` / `buildWebContextPrefix` |
| 会话续聊 | v5.7.5+：`window.webOperatorTaskSession` → `~/.hermes/desktop/web-operator-task-session.db`；**v6.3.3** 业务键 `source + requestId`（`page_url` 仅上下文）；v5.7.4 legacy `localStorage` 键 `weboperator-hermes-panel-session-bindings` 保留文件但非主路径 |
| 历史消息 | `window.hermesAPI.getSessionMessages(sessionId)` | 恢复已有 Hermes session 时 |

PRD：[`prd/v5.7.4_sidepanel_hermes.md`](../prd/v5.7.4_sidepanel_hermes.md) · v5.7.5：[`prd/v5.7.5_hermes_integration.md`](../prd/v5.7.5_hermes_integration.md)

### WebOperator Task Session（v5.7.5 + v6.3.3）

Page Structure `[分析内容]` / HostBridge JSSDK → `HermesTaskPanel` 按 **`source + requestId`** 解析/创建 Hermes 任务会话；`pageUrl` 仅作页面上下文字段。

Main：`src/main/web-operator-task-session-store.ts` + `web-operator-task-session-ipc.ts`  
Preload：`src/preload/web-operator-task-session-api.ts`  
契约：`src/shared/web-operator/web-operator-task-session-contract.ts`  
`taskId`：`src/shared/web-operator/build-task-id.ts` — `wot_` + sha256(`${source}:${requestId}`).slice(0,32)  
DB：`~/.hermes/desktop/web-operator-task-session.db`（**非** Hermes `state.db`）；schema v2：`UNIQUE(source, request_id)`；v1 库自动迁移（`legacy-page-url` + 旧 `page_url`）

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `web-operator-task-session:resolve` | invoke | `{ source: string, requestId: string, pageUrl?: string }` | `WebOperatorTaskSessionLookupResult` | `taskId` 由 Main 派生；按 `source + requestId` 查询 |
| `web-operator-task-session:upsert` | invoke | `{ source, requestId, pageUrl, sessionId, pageContext, skill?, createNewSession? }` | `WebOperatorTaskSessionRecord` | **不传** `taskId`；`createNewSession` 时清除旧 binding 后新建 |
| `web-operator-task-session:prepare-new` | invoke | `{ source, requestId }` | `{ ok: true }` | Dialog 选「新建会话」时立即清除该 identity 的旧 `task_session` 行 |
| `web-operator-task-session:remove` | invoke | `taskId: string` | `{ ok: true }` | |
| `web-operator-task-session:get-last-active` | invoke | — | `WebOperatorTaskSessionGetLastActiveResult` | **v6.3.1** `status=active`，`ORDER BY updated_at DESC LIMIT 1` |

Preload：`window.webOperatorTaskSession.resolve / upsert / remove / getLastActive`

**source 约定**：`manual`（Page Structure 分析）、`web-host-bridge`（HostBridge JSSDK）、`legacy-page-url`（v1 迁移行）。

**v6.3.1**：`WebOperatorPageContext.currentTask` + `sessionStorage`；**v6.3.3** 键升为 `weboperator-current-task-v2`（含 `source/requestId`）；Provider mount 时 SQLite `getLastActive` 优先，无 record 再读 sessionStorage。

### Preload：`window.hermesDefaultChat`（WebOperator 相关子集）

完整 API 见 `src/preload/hermes-default-chat-api.ts`。WebOperator Hermes 面板常用：

| 方法 | IPC | 说明 |
|------|-----|------|
| `getModelConfig(profile?)` | `hermes-chat:get-model-config` | 全局默认模型展示 |
| `uploadAttachmentBuffers(payload)` | `hermes-chat:upload-attachment-buffers` | **v5.7.5** 页面上下文 buffer 落盘（`inject-web-context-attachments.ts`） |
| `uploadAttachments(payload)` | `hermes-chat:upload-attachments` | 本地文件路径上传 |
| `uploadDroppedAttachments(payload, files)` | 上述两者组合 | Local Hermes Chat 拖拽 |
| `sendMessage(payload)` | `hermes-chat:send-message` | 流式 SSE `chat-*` |
| `abort()` | `abort-chat` | 中止当前流 |
| `onChunk` / `onDone` / `onError` / `onToolProgress` / `onUsage` | 事件订阅 | 返回 unsubscribe |

---

### 强制约束（MUST）— Chat 调模型与 API Key

以下规则为 **强制**；实现或改 IPC/UI 时不得违反。

#### A. Models 页 vs Chat 页

| | Models 页 | Chat 页 |
|---|-----------|---------|
| **模型作用域** | 全局默认（`config.yaml` root + `model:`） | **仅当前 session** |
| **IPC** | `hermes-chat:set-model-config`（Set Default） | `hermes-chat:get/set-session-model`、`hermes-chat:send-message` |
| **写 root `default:`** | 允许（Set Default） | **禁止** |
| **写 `model:` 段** | 允许（Set Default 全量） | **仅**发送前 runtime overlay（见 C） |
| **写 `custom_providers`** | 允许（CRUD 后同步） | 允许**仅**凭证修复式同步（见 D），非改默认模型 |
| **Gateway restart** | Set Default / 模型 CRUD 后允许 | **禁止**（session 选模） |
| **Save as Default** | — | **禁止**（无 UI、无 IPC） |

#### B. Session 级模型解析（MUST）

存储：`profileHome(profile)/desktop/session-models.json`（`hermes-session-model-store.ts`）。

| 步骤 | 规则 |
|------|------|
| B1 | 新对话绑定键：`draft_default`，直至首条消息拿到真实 `sessionId` |
| B2 | 用户切换下拉 → `hermes-chat:set-session-model(sessionId, modelId)` |
| B3 | `hermes-chat:send-message` 解析模型：**先** `payload.model_id`，**再** `getSessionModel(resumeSessionId \|\| draft_default)` |
| B4 | 若发送带 `model_id` 且与 session 不一致，以 `model_id` 为准并 **回写** session 绑定 |
| B5 | `chat-done` 后：`migrateSessionModelBinding(draft_default, realSessionId)` |
| B6 | Renderer **必须**用 `window.hermesDefaultChat`；**禁止** `workspaceChat`、禁止 Renderer 读写在 `config.yaml` |

#### C. 发送前 Gateway `model:` overlay（MUST）

Hermes Gateway **忽略** HTTP body 中的 `provider` / `base_url` / `api_key` 用于选模；以 `config.yaml` 的 **`model.default`** 为准。

| 步骤 | 规则 |
|------|------|
| C1 | `sendMessageViaApi` 在 POST 前调用 `overlayGatewayModelSectionForSession(profile, saved)` |
| C2 | 写入：`model.provider`、`model.default`（= `SavedModel.model`）、`model.base_url` |
| C3 | **不得**修改 root `default:` |
| C4 | **不得**为 overlay restart Gateway |
| C5 | HTTP `body.model` 仍为 API Server 注册名（如 `hermes-agent`），**不是** LLM id |

#### D. API Key 必须从 `.env` 读取（MUST）

| 步骤 | 规则 |
|------|------|
| D1 | 密钥文件：`profileHome(profile)/.env`；Main **`readEnv(profile)`** 为唯一读取入口 |
| D2 | **禁止** Renderer / Preload 接收或持久化用户 API key 明文 |
| D3 | 解析顺序：`apiKeyLiteral` → `readEnv[apiKeyEnv]` → `URL_KEY_MAP(baseUrl)`（`hermes-model-env.ts`） |
| D4 | `models.json` 缺 `apiKeyEnv` 时，Main **必须** `ensureModelsApiKeyEnvPersisted()` 按 URL 推断并回写 |
| D5 | `buildCustomProviderEntry`：`key_env` = **裸**变量名（如 `DEEPSEEK_API_KEY`）；**禁止** `${DEEPSEEK_API_KEY}` |
| D6 | 同步 `custom_providers` 时 **必须**将 `readEnv()` 解析结果写入 `api_key` 字段 |
| D7 | `startGateway()` **必须**将 profile `.env` 注入 Gateway 子进程环境 |
| D8 | `set-env` 修改 `*_API_KEY` / `HF_TOKEN` 后 **必须** `restartGateway`（已有 `set-env` handler） |
| D9 | 首条 Chat 发送可触发一次性 `syncCustomProvidersFromModels`；若 YAML 变更且 Gateway 在跑，**允许** restart（凭证修复，非 session 选模） |

#### E. 传输与回退（MUST）

| 规则 | 说明 |
|------|------|
| E1 | 优先 `POST {gateway}/v1/chat/completions`（`hermes.ts` `sendMessageViaApi`） |
| E2 | CLI 回退 **仅**当 API 不可用 |
| E3 | Windows CLI：**必须** `getHermesPython()` + `-m hermes_cli.main`；**禁止** `hermes.exe`（无控制台） |
| E4 | **禁止**因 session 模型 ≠ 全局默认而强制 CLI |

---

### IPC 通道

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `hermes-chat:list-models` | invoke | `profile?: string` | `HermesChatModelListResponse` | 来自 `models.json` + `config.yaml` 默认模型标记 `is_current` |
| `hermes-chat:get-model-config` | invoke | `profile?: string` | `HermesChatModelConfig \| null` | 当前**全局**默认模型（Models Set Default） |
| `hermes-chat:set-model-config` | invoke | `profile?: string`, `{ model_id: string }` | `HermesChatModelConfig` | **仅 Models 页**；写 root + `model:` + `custom_providers`；Gateway restart |
| `hermes-chat:get-session-model` | invoke | `sessionId: string`, `profile?: string` | `HermesSessionModelBinding \| null` | 读 session 绑定（含 `apiKeyEnv` 元数据，非明文 key） |
| `hermes-chat:set-session-model` | invoke | `sessionId: string`, `modelId: string`, `profile?: string` | `HermesSessionModelBinding` | Chat 下拉；**不**改 root `default:` |
| `hermes-chat:upload-attachments` | invoke | `UploadHermesAttachmentsPayload` | `UploadHermesAttachmentsResponse` | `profileHome(profile)/desktop/chat-attachments/<sessionId>/` |
| `hermes-chat:upload-attachment-buffers` | invoke | `UploadHermesAttachmentBuffersPayload` | `UploadHermesAttachmentsResponse` | buffer 落盘（拖拽 / **WebOperator `web-context/*`**）；Preload：`hermesDefaultChat.uploadAttachmentBuffers` |
| `hermes-chat:remove-attachment` | invoke | `workspaceId: string`, `attachmentId: string`, `profile?: string` | `{ ok: true }` | `workspaceId` 占位 |
| `hermes-chat:send-message` | invoke | `HermesChatSendPayload` | `{ response: string; sessionId?: string }` | 遵守 § 强制约束 B–E；SSE `chat-*` |

**Events (Main → Renderer)：**（与 `hermesAPI` legacy chat 复用，不带 scope）

| Event | Payload | Notes |
|-------|---------|-------|
| `chat-chunk` | `string` | Stream token |
| `chat-done` | `sessionId?: string` | Gateway 首次持久化后的 session id |
| `chat-error` | `string` | |
| `chat-tool-progress` | `string` | Tool name |
| `chat-usage` | `HermesChatUsageEvent` | tokens / cost |

---

## Chat Runtime（v8.0–v8.1.1 Durable Runtime Closure）

**Preload**：`window.chatRuntime`（`src/preload/chat-runtime-api.ts`）  
**Main**：`src/main/chat-runtime/`（`chat-runtime:start` 事件驱动；**v8.1.1** profile-routed `stateDbPathForProfile` + store router；事务 `allocateAndAppendEvent`；UNIQUE(run,turn,sequence)；`hermes-interaction-continuation-adapter` 返回 `completion` 且 Native/Fallback 互斥；`chat-event-replay-service`；`chat-queue-service`；`chat-diagnostics-service` Save Dialog；与 legacy `hermes-chat:*` **并存**）  
**契约**：`src/shared/chat-runtime/`（contract / events / state / trace）

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `chat-runtime:start` | invoke | `ChatStartInput`（`runId`+`turnId`+`request`） | `ChatStartResult`（立即返回） | **v8.1** 主路径；生命周期经 `chat-runtime:event` |
| `chat-runtime:submit` | invoke | `ChatSubmitInput` | `ChatSubmitResult` | **@deprecated** 兼容适配（PR7 再删） |
| `chat-runtime:abort` | invoke | `ChatAbortInput \| string` | `{ ok: boolean }` | 取消 transport；durable pending 可保留 |
| `chat-runtime:command` | invoke | `ChatRuntimeCommand` | `ChatRuntimeCommandResult` | **v8.1.1** `accepted`→`continuing`→**await completion**→`resolved`；缺 sessionId 失败；Native 与 Fallback 互斥 |
| `chat-runtime:get-state` | invoke | `{ runId }` | `ChatRuntimeGetStateResult` | 恢复 run/turns/pending/queue |
| `chat-runtime:get-snapshot` | invoke | `{ runId, profileId?, afterSequence?, maxEvents? }` | `ChatRuntimeGetSnapshotResult` | **v8.1.1** 含 events 窗口 + truncated |
| `chat-runtime:replay-events` | invoke | `{ runId, afterSequence, turnId?, limit? }` | `ChatRuntimeReplayEventsResult` | **v8.1.1** 按 sequence 回放 |
| `chat-runtime:recover` | invoke | `{ runId?, profileId? }` | `ChatRuntimeRecoverResult` | incomplete turns → waiting / interrupted |
| `chat-runtime:export-diagnostics` | invoke | `{ runId }` | `ChatDiagnosticsExport` | 元数据 / timeline / **真实 fileIds** / store health |
| `chat-runtime:save-diagnostics` | invoke | `{ runId }` | `{ ok, path }` | **v8.1.1** Main `dialog.showSaveDialog`（禁止 Renderer `<a download>`） |
| `chat-runtime:queue-*` | invoke | enqueue/list/remove/move/mark-running/complete/set-auto-drain | typed results | **v8.1.1** Durable Queue（Main 权威源）；Preload `chatRuntime.queue.*` |

**Event（Main → Renderer）**：`chat-runtime:event` → `ChatRuntimeEvent`（必含 **`eventId`+`sequence`+`emittedAt`**）；sequence 跨进程从 DB MAX 续编；Renderer `ChatRuntimeRecoveryBridge` + sequence 去重。

**Renderer**：**v8.1.1** `ChatRuntimeRecoveryBridge`、`useDurableChatQueue`、Error Card `retryTurn(turnId)`、`AiosChatRunContextAdapter`、Diagnostics Save；E2E：`npm run test:e2e:electron`。

**v8.2 联动**：`session.started` / turn `completed` 时 Main 调用 `bindSessionToRun` + `session-catalog:changed` 广播（见下节 Chat Workspace / Session Catalog）。

---

## Chat Workspace（v8.2 Persistent Workspace）

**Preload**：`window.chatWorkspace`（`src/preload/chat-workspace-api.ts`）  
**Main**：`src/main/chat-workspace/`（桌面库 `~/.hermes/desktop/chat-workspace.db`；**不是** profile `state.db`）  
**契约**：`src/shared/chat-workspace/chat-workspace-contract.ts`

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `chat-workspace:get-snapshot` | invoke | `workspaceId?` | `ChatWorkspaceSnapshot` | 权威 Tab/Draft/Active 元数据 |
| `chat-workspace:list` | invoke | `workspaceId?` | `ChatWorkspaceRunRow[]` | 未关闭 runs |
| `chat-workspace:open` | invoke | `ChatWorkspaceOpenInput` | `ChatWorkspaceSnapshot` | 创建/更新 draft 或 session run |
| `chat-workspace:open-session` | invoke | `ChatWorkspaceOpenSessionInput` | `{ runId, created, workspaceId, snapshot }` | 同 session 默认去重激活 |
| `chat-workspace:patch-run` | invoke | `ChatWorkspacePatchRunInput` | `ChatWorkspaceSnapshot` | 元数据补丁 |
| `chat-workspace:close-run` | invoke | `ChatWorkspaceCloseRunInput` | `ChatWorkspaceSnapshot` | soft close（`closed_at`） |
| `chat-workspace:set-active` | invoke | `ChatWorkspaceSetActiveInput` | `ChatWorkspaceSnapshot` | |
| `chat-workspace:reorder` | invoke | `ChatWorkspaceReorderInput` | `ChatWorkspaceSnapshot` | |
| `chat-workspace:migrate-v1` | invoke | `ChatWorkspaceMigrateV1Input` | `ChatWorkspaceSnapshot` | localStorage `chat-workspace-state.v1` → db |
| `chat-workspace:changed` | event | — | `ChatWorkspaceSnapshot` | Main → Renderer；Provider 合并视图缓存 |

**Renderer**：`ChatWorkspaceProvider` 提升至 `HermesScreen`；`HermesPersistentChatWorkspace` 常驻挂载（menu 只切 visible）；`sessionId==null` = draft。

---

## Session Catalog（v8.2 Unified Catalog）

**Preload**：`window.sessionCatalog`（`src/preload/session-catalog-api.ts`）  
**Main**：`src/main/session-catalog/`（profile-aware `stateDbPathForProfile` 直读 `sessions`/`messages`；metadata 表 `chat_session_metadata` 在 `chat-workspace.db`）  
**契约**：`src/shared/session-catalog/session-catalog-contract.ts`

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `session-catalog:list` | invoke | `SessionCatalogQuery` | `SessionCatalogListResult` | **不再**依赖 `sessions.json` 作为主数据源 |
| `session-catalog:rename` | invoke | `{ profileId, sessionId, title }` | `SessionCatalogItem \| null` | 写 metadata + 同步 workspace run title |
| `session-catalog:archive` | invoke | `{ profileId, sessionId, archived }` | `{ ok }` | soft archive |
| `session-catalog:delete` | invoke | `{ profileId, sessionId, soft? }` | `{ ok }` | 默认 soft |
| `session-catalog:pin` | invoke | `{ profileId, sessionId, pinned }` | `{ ok }` | |
| `session-catalog:changed` | event | — | `SessionCatalogChangedPayload` | `session.started` / `turn.completed` / rename / archive 等 |

**Renderer**：`HermesSessionsPage` → `sessionCatalog.list` + `openSession` 导航 Chat；空状态区分 No sessions / profile / search / db unavailable。

---

## Chat Files（v8.0.1 index · v8.0.2 File Platform · v8.0.5 changed）

**Preload**：`window.chatFiles`（`src/preload/chat-files-api.ts`）— **不**扩展 `hermesAPI.files`；完整 File Platform 挂在 `window.chatFiles.platform`（`HermesFilesAPI` / `files:*`）；**v8.0.5** `chatFiles.onChanged(cb)` → unsubscribe  
**Main**：
- `chat-files:*` — `src/main/chat-files/chat-files-ipc.ts` + `chat-files-session-store.ts`（持久化 `~/.hermes/desktop/chat-files-index.json`；Hermes 附件桥）
- `files:*` — `src/main/chat-files/platform/register-file-ipc.ts` → `file-service.ts`（完整 pick/import/parse/preview/context/FTS）
- `chat-files-event-emitter.ts` — upload/remove/migrate/context/agent-output 后 emit

**Shared**：`src/shared/chat-files/`（含 `chat-files-events.ts` / `ChatFilesChangedEvent`）

### `chat-files:*`（Hermes 附件 + 持久化 index）

| Channel | Args | Returns |
|---------|------|---------|
| `chat-files:list-session-files` | `profile?`, `sessionId` | `ChatFilesListed[]` |
| `chat-files:upload-paths` | `{ profile?, session_id, file_paths }` | `{ files }` |
| `chat-files:upload-buffers` | `{ profile?, session_id, files }` | `{ files }` |
| `chat-files:remove` | `profile?`, `fileId`, `sessionId?` | `{ ok: true }` |
| `chat-files:preview` | `profile?`, `fileId` | `{ content?, name?, error? }` |
| `chat-files:reveal` / `open-external` / `save-as` | path… | `{ ok, path? }` |
| `chat-files:save-managed-as` | `fileId`, `suggestedName?` | `{ ok, path? }` |
| `chat-files:save-local-path-as` | `filePath`, `suggestedName?` | `{ ok, path? }` |
| `chat-files:migrate-draft` | `{ profile?, draftSessionId?, sessionId }` | `{ files }` |
| `chat-files:changed` | event（Main → Renderer） | `ChatFilesChangedEvent`（`profileId`/`sessionId`/`reason`/`fileId?`；reason：`uploaded`/`removed`/`context_added`/`context_removed`/`agent_output_created`/`draft_migrated`） |

### `files:*`（File Platform — `FILES_IPC_CHANNELS`）

| Channel | Args | Returns |
|---------|------|---------|
| `files:get-capabilities` | `profile?` | `FilesCapabilities` |
| `files:pick-files` | `options?`, `context` | managed file list |
| `files:import-dropped` | `paths[]`, `context` | managed file list |
| `files:stage-clipboard` | `input`, `context` | managed file |
| `files:list-session` | `profile?`, `sessionId` | managed file list |
| `files:get` | `profile?`, `fileId` | `ManagedFile` |
| `files:get-preview` | `profile?`, `fileId`, `options?` | preview payload |
| `files:get-parsed` | `profile?`, `fileId` | parsed content |
| `files:retry-parse` | `profile?`, `fileId` | `{ ok }` |
| `files:to-attachments` / `files:attach-to-message` / `files:detach-from-message` | association input | wire/result |
| `files:add-to-context` / `files:remove-from-context` | `{ profile?, sessionId, fileId }` | void |
| `files:search-session` | `{ profile?, sessionId, query, maxResults? }` | search hits |
| `files:open-external` / `files:reveal-in-folder` / `files:save-as` | `profile?`, `fileId` | `{ ok, path? }` |
| `files:create-from-message` / `files:delete-association` / `files:cleanup` | lifecycle input | result |

Preload exposes a File Platform subset on `window.chatFiles`（`searchSessionFiles` / `addToSessionContext` / `removeFromSessionContext` / `getPreview`）。Chat Core 经 Ports + adapters 调用，禁止直连 `window.*`。

## Hermes memory (AIOSWorkspace)

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `write-memory-content` | invoke | `content: string`, `profile?: string` | `{ ok: boolean, error?: string }` | Overwrites `MEMORY.md` for profile (not append entry). Char limit enforced in Main. May emit `memory_save` audit. **team_v1.5.3** |

`MEMORY.md` saves from Renderer use `hermesAPI.writeMemoryContent`; `USER.md` / `SOUL.md` still use existing profile write paths.

---

## ShellView / MainPage workspace ids (Portal rename)

Renderer、Main、持久化状态统一使用下列标识（**不是** IPC channel 名）：

| 概念 | 当前值 | 说明 |
|------|--------|------|
| 静态 workspace / `View` | `portal` | 顶栏 Tab、默认首页；原 `aios-home` 已由 `main-page-state-migrate` 映射 |
| ShellView `layerId` / `ShellViewKind` | `portal` | `WebContentsHost`、`shellView.*`、`portal-view-coordinator` |
| Electron session 分区 | `persist:aios-home` | **未改名**（保留 NextAuth cookies）；TS 常量 `PORTAL_PARTITION` |
| 登录配置 URL 字段 | `aiosHomeUrl` | Auth / Endpoint 契约不变 |

Preload：`window.shellView` 的 `layerId` 传 `"portal"`。Main 懒创建见 `shell-view-ipc.ts` → `ensurePortalView()` → `refreshPortalView()`。

---

## AIOS Portal Runtime

Registered in `src/main/aios/aios-ipc.ts` (`registerAiosIpc`), exposed as `window.aiosRuntime` (`src/preload/aios-api.ts`). Types: `src/shared/aios/aios-contract.ts`.

| Channel | Direction | Args | Returns | Notes |
|---------|-----------|------|---------|-------|
| `aios:get-runtime-status` | invoke | — | runtime status rows | |
| `aios:get-runtime-snapshot` | invoke | — | `AiOsRuntimeSnapshot` | backend + frontend services |
| `aios:start` | invoke | — | void | Spawns Portal backend/frontend; requires installed monorepo |
| `aios:stop` | invoke | — | void | |
| `aios:restart` | invoke | — | void | |
| `aios:get-logs` | invoke | `serviceId`, `options?` | `AiOsLogEntry[]` | |
| `aios:doctor` | invoke | — | `AiOsDoctorReport` | |
| `aios:reconcile` | invoke | — | reconcile result | |
| `aios:check-ports` | invoke | — | `PortCheckResult[]` | |
| `aios:get-home-url` | invoke | — | `{ url: string }` | Embedded Portal Home URL |
| `aios:get-portal-info` | invoke | — | `AiOsPortalInfo` | **V5.3.4** — installed flag + effective/config/env roots |
| `aios:install` | invoke | options | — | **Preload 声明；Main 未注册**（后续单独实现） |

**`AiOsPortalInfo`（V5.3.4）：**

```typescript
interface AiOsPortalInfo {
  installed: boolean;
  portalRoot: string | null;       // effective monorepo root
  portalRuntimeRoot: string;
  envPortalRoot: string | null;    // process.env.COPILOT_PORTAL_ROOT
  configPortalRoot: string | null; // desktop-runtime.json portalSourceRoot
}
```

**Events (Main → Renderer):** `aios:runtime-changed` → `RuntimeStatusChangeEvent`（`onAiOsRuntimeChanged`）。

**Portal monorepo 根解析（Main，非 IPC）：** `src/main/runtime/portal-root-resolver.ts` — `resolveEffectivePortalMonorepoRoot()` 优先级：`COPILOT_PORTAL_ROOT` → `desktop-runtime.json` → filesystem（`runtime/portal/src`、legacy `ai-os-full`）。`buildCopilotRuntimeEnv()` 保留已有 env。

---

## Web Operator / aiosBrowser（V5.7 WebContentsView 核心）

Preload：`window.aiosBrowser`（`src/preload/browser-api.ts`）。Main：`src/main/browser/*`，IPC 注册于 `browser-ipc.ts`。

### Legacy channels（点号，保留）

| Channel | Returns | Notes |
|---------|---------|-------|
| `browser.open` | `BrowserOpenResult` | |
| `browser.back` / `browser.forward` / `browser.reload` | `BrowserActionResult` | |
| `browser.get_state` | `BrowserStateResult` | 扁平 inputs/buttons/links |
| `browser.screenshot` | `BrowserScreenshotResult` | base64 PNG |
| `browser.click` / `browser.type` | `BrowserActionResult` | main frame selector only |
| `browser.get_audit_log` | `BrowserAuditRecord[]` | 安全审计 |

### V5.7 channels（冒号，Frame / Snapshot / 结构化动作）

| Channel | Args | Returns |
|---------|------|---------|
| `browser:get-state` | — | `BrowserRuntimeState` |
| `browser:list-frames` | — | `BrowserFrameSnapshot[]` |
| `browser:snapshot` | `BrowserSnapshotOptions?` | `BrowserPageSnapshot` |
| `browser:find-element` | `BrowserElementTarget` | `BrowserElementSnapshot \| null` |
| `browser:click-element` | `BrowserElementTarget` | `BrowserStructuredActionResult` |
| `browser:type-element` | `{ target, text, options? }` | `BrowserStructuredActionResult` |
| `browser:select-option` | `{ target, value }` | `BrowserStructuredActionResult` |
| `browser:scroll` | `BrowserScrollOptions` | `BrowserStructuredActionResult` |
| `browser:screenshot-v2` | `BrowserScreenshotOptions?` | `BrowserStructuredScreenshotResult \| null` |
| `browser:get-frame-html` | `BrowserFrameHtmlRequest` | `BrowserFrameHtmlResult` |
| `browser:action-logs` | `limit?` | `BrowserActionLogEntry[]` |
| `browser:clear-action-logs` | — | `{ ok: boolean }` |

**Events (Main → Renderer):**

| Event | Payload |
|-------|---------|
| `browser:state-changed` | `BrowserRuntimeState` |
| `browser:action-logged` | `BrowserActionLogEntry` |

**Shared DTO：** `src/shared/browser/browser-frame-contract.ts`、`browser-snapshot-contract.ts`、`browser-action-contract.ts`。

**`browser:get-frame-html`（V5.7.3 hotfix）：** 请求 `BrowserFrameHtmlRequest`（`frameId` / `framePath` + 可选 `selector`、`outer`、`maxLength`）。返回 `BrowserFrameHtmlResult` 含 `source`：`frame-document`（子 frame 内 `executeJavaScript`）或 `parent-srcdoc`（`about:srcdoc` + sandbox iframe 时由父 frame 读取 `iframe[srcdoc]`，不在子 frame 执行脚本）。错误码含 `FRAME_SCRIPT_BLOCKED`、`ELEMENT_NOT_FOUND` 等。

**Main 模块：** `browser-frame-inspector.ts`、`browser-dom-snapshot.ts`、`browser-element-locator.ts`、`browser-coordinate-resolver.ts`、`browser-action-log-store.ts`、`browser-v57-core.ts`（由 `BrowserController.v57` 委托）。

**Renderer：** `WebOperatorScreen` 右栏 — `BrowserStatePanel`、`PageStructurePanel`（`FrameTreePanel` + `ElementListPanel`）、`ScreenshotPanel`、`BrowserActionLog`（结构化 + 审计双 tab）。

**验收页：** `resources/test-pages/v57/`。

---

## CRM Desktop Bridge（V5.7.1 + V5.7.6 Host Bridge + V5.7.10 CRM-Lite Demo）

CRM 页面运行在 WebOperator 的 WebContentsView 中，由专用 preload `src/preload/crm-bridge-preload.ts` 注入最小桥接 API（`view-registry` 已为 `web-operator` 设置 `defaultPreload`）：

- `window.CopilotDesktopCRM.emit(event)`：只允许在**真实用户点击**后的短时间窗口内提交（preload 本地校验），随后通过 IPC 进入 Main 二次校验。
- `window.CopilotDesktopCRM.emitReady(event)`：**V5.7.6** — 页面 `crm.page.ready` 专用通道，**不**校验用户手势。
- `crm-bridge:command`：Main 下发命令到 CRM 页面（preload 转发为 `window.postMessage`，由 CRM JSSDK 消费）。
- **V5.7.6 handoff**：Hermes 工具 `crm.open_form_with_json` → 保存 pending handoff → 跳转 CRM URL → CRM `emitReady` → Main 自动 `pushJson` + `runAction` → JSSDK ack 回传工具结果。

### Main IPC（invoke）

| Channel | Args | Returns |
|---------|------|---------|
| `crm-bridge:emit` | `CrmBridgeEmitInput` | `CrmBridgeResult` |
| `crm-bridge:list-events` | `limit?: number` | `CrmBridgeStoredEvent[]` |
| `crm-bridge:get-last-event` | — | `CrmBridgeStoredEvent \| null` |
| `crm-bridge:send-command` | `CrmDesktopCommand` | `CrmBridgeResult & { data?: unknown }`（**V5.7.6** 可等待 ack） |
| `crm-bridge:command-result` | `CrmDesktopCommandAck` | `CrmBridgeResult`（**V5.7.6** CRM JSSDK → preload → Main） |

### Main → Renderer event

| Event | Payload |
|-------|---------|
| `crm-bridge:on-event` | `CrmBridgeOnEventPayload` |

### Main → CRM WebContents event

| Event | Payload |
|-------|---------|
| `crm-bridge:command` | `CrmDesktopCommand`（含 `expectAck` / `timeoutMs` / `target.actionKey`） |

### Browser Tool Server（Hermes，`127.0.0.1:8765+`）

**V5.7.6** 新增 CRM 工具（`BrowserToolBridge` + `browser-tool-schema.ts`）：

| Tool | 说明 |
|------|------|
| `crm.get_context` | 返回最近一次 CRM bridge event |
| `crm.click_button` | 派发 `desktop.crm.clickButton`（expectAck） |
| `crm.run_action` | 派发 `desktop.crm.runAction`（expectAck） |
| `crm.push_json` | 派发 `desktop.crm.pushJson`（expectAck） |
| `crm.open_form_with_json` | 创建 handoff + 跳转 CRM URL，ready 后自动交付 |

**Shared DTO：** `src/shared/crm-bridge/*`。**Main 模块：** `crm-handoff-store.ts`、`crm-handoff-orchestrator.ts`、`crm-command-result-store.ts`。

**CRM JSSDK（页面侧）：** `resources/crm-bridge/hermes-crm-bridge-sdk.js`（全局 `window.CopilotCrm`）。

**Renderer 路由（`open-renderer-route`）：** Main `routeAction.route` 由 `Layout.tsx` 解析为 `src/shared/crm-bridge/crm-renderer-routes.ts` 中的路径，并切换到 workspace `crm-workbench`（本地 React，非 Portal WebView）。当前路径：

| `route` | 页面 |
|---------|------|
| `/crm/customer-ai` | 客户 AI 分析 |
| `/crm/quote-assistant` | 报价辅助 |
| `/crm/order-risk` | 订单风控 |

配置见 `resources/crm-bridge/crm-bridge.config.json`；UI 入口 `src/renderer/src/screens/Crm/CrmWorkbenchScreen.tsx`。

**V5.7.10 CRM-Lite 商品验证（`prd/v5.7.10_bridge_demo.md`）**：

| 方向 | 类型 | 说明 |
|------|------|------|
| CRM → Desktop | `crm.product.context.submit` | 商品查看页「同步到 Electron」；`page.app` 可为 `crm-lite`；`payload.product` 必填（`ProductPayload`） |
| Desktop → CRM | `desktop.crm.product.fillForm` | 填充商品新增页表单，不写 JSON |
| Desktop → CRM | `desktop.crm.product.create` | 填充表单并调用 `/api/products` 写入 `data/products.json`（默认 `expectAck`） |

**允许 origin（增量）**：`http://localhost:5178`、`http://127.0.0.1:5178`（与 `crm-bridge.config.json` / `crm-bridge-config.ts` DEFAULT 对齐）。

**Renderer 调试**：`CrmEventPanel`（WebOperator 侧栏 `crm-context`）展示商品上下文卡片；按钮「填充表单到 CRM」「写入商品到 CRM」经 `window.aiosBrowser.sendCrmCommand`。

**Shared 类型**：`ProductPayload`、`SupplierSupplyPayload`、`CrmProductContextPayload`（`src/shared/crm-bridge/crm-bridge-contract.ts`）。

### HostBridge v6.0（`prd/v6.0_hostBridge-JSSDK.md`）

**新命名**：`CopilotHostBridge` / `CopilotHostBridgeSDK`；`host.bridge.submit` / `host.page.ready`；`desktop.host.form.fill`。

**配置**：`app.getPath("userData")/bridge-config.json`（模板 `resources/crm-bridge/bridge-config.template.json`），加载逻辑 `src/main/crm-bridge/host-bridge-config.ts`。

**页面 JSSDK**：`resources/crm-bridge/crm-lite-jssdk.js`（`submit` / `ready` / `onCommand` / `ack`）。

#### Main IPC（invoke）

| Channel | Args | Returns |
|---------|------|---------|
| `host-bridge:emit` | `HostBridgeEmitInput` | `HostBridgeResult` |
| `host-bridge:page-ready` | `HostBridgeEmitInput` | `HostBridgeResult` |
| `host-bridge:list-events` | `limit?: number` | `HostBridgeStoredEvent[]` |
| `host-bridge:get-last-event` | — | `HostBridgeStoredEvent \| null` |
| `host-bridge:send-command` | `HostDesktopCommand` | `HostBridgeResult` |
| `host-bridge:command-result` | `HostDesktopCommandAck` | `HostBridgeResult` |
| `host-bridge:get-config` | — | `HostBridgeConfigFile` |
| `host-bridge:get-config-path` | — | `string` |
| `host-bridge:reload-config` | — | `HostBridgeConfigFile` |
| `host-bridge:open-config-file` | — | `{ ok: boolean }` |
| `host-bridge:get-last-handoff` | — | `HostHandoffRecord \| null` |
| `host-bridge:list-handoffs` | `limit?: number` | `HostHandoffRecord[]` |
| `host-bridge:clear-handoff` | — | `{ ok: boolean }` |

**兼容**：`crm-bridge:*` 同上表转发到 HostBridge handler。

#### WebOperator 多页签 IPC

| Channel | Args | Returns |
|---------|------|---------|
| `web-operator-tabs:list` | — | `WebOperatorTab[]` |
| `web-operator-tabs:get-active` | — | `{ tab, activeTabId, layerId }` |
| `web-operator-tabs:create` | `{ url, title?, kind?, activate? }` | `WebOperatorTab` |
| `web-operator-tabs:activate` | `tabId` | `WebOperatorTab \| null` |
| `web-operator-tabs:close` | `tabId` | `boolean` |
| `web-operator-tabs:open-callback` | `{ requestId, formType, action, callbackUrl, handoffId }` | `WebOperatorTab` |

#### Preload → Renderer（`window.aiosBrowser`）

| 方法 | IPC |
|------|-----|
| `listHostBridgeEvents` / `getLastHostBridgeEvent` | `host-bridge:list-events` / `get-last-event` |
| `sendHostCommand` | `host-bridge:send-command` |
| `onHostBridgeEvent` | 监听 `host-bridge:on-event` |
| `getHostBridgeConfig` / `reloadHostBridgeConfig` / `openHostBridgeConfigFile` | 配置管理 |
| `listWebOperatorTabs` / `activateWebOperatorTab` / … | `web-operator-tabs:*` |

**Renderer UI**：`HostBridgePanel`（侧栏 `host-context`）；`WebOperatorTabs`（多页签 + `WebContentsHost` 动态 `layerId`）。

---

## Windows 安装注册表（非 IPC）

业务安装信息由 NSIS [`build/installer.nsh`](../build/installer.nsh) 写入，由 Main [`install-location-resolver.ts`](../src/main/enterprise/windows/install-location-resolver.ts) 读取。与 electron-builder 卸载项（`appId` / `nsis.guid`）分离。

| 键 | 用途 |
|---|---|
| `HKCU\Software\SMC\copilot`（primary） | 安装后写入 `InstallLocation`、`RuntimeRoot`、`BinDir`、`AppVersion`、`PreviousVersion` 等 |
| `HKLM\Software\SMC\copilot` | primary 的 HKLM 回退读取 |
| `HKCU\Software\SMC\Copilot` | legacy，仅兼容读取 / 卸载清理 |
| `HKCU\Software\SMC\CopilotSMC` | legacy |
| `HKCU\Software\SMC\HermesDesktop` | legacy |
| `HKCU\...\Uninstall\com.nousresearch.hermes` | legacy 卸载项 `InstallLocation` |

**解析顺序（`readRegistryInstallInfo`）**：primary HKCU → primary HKLM → legacy 键（存在且目录存在则采用）。`resolveInstallLocation().source` 为 `registry` 仅当命中 primary 键。

**默认路径（无注册表）**：`%LOCALAPPDATA%\Programs\SMC-Copilot`（dev-default 与 NSIS 首次安装一致）。

**V5.4.1**：`desktop-runtime.json` 身份字段由 migration schema **5**（`migrateV541InstallIdentity`）在应用启动时刷新，NSIS 升级不 patch 已有 JSON。

---

## Local Hermes config sync（V5.6.1）

**非新 IPC**：`setModelConfig` / `startGateway` / `sendMessage` 路径内调用 `syncGatewayModelSection(profile)`（`src/main/config.ts`），将扁平 `config.yaml` 顶层 `default`/`provider`/`base_url` 写入 Gateway 可读的 `model:` 段。若 sync 返回 `true` 且 Gateway 已在运行，则 `restartGateway(profile)`。

| Channel | Notes |
|---------|-------|
| `get-credential-pool` | 读 `~/.hermes/auth.json` → `credential_pool` |
| `set-credential-pool` | `(provider, entries[])` 写回同上 |

Preload：`window.hermesAPI.getCredentialPool` / `setCredentialPool`。Local Hermes Providers 页使用。

---

## Local Hermes Models UI（V5.6.3）

**无新 IPC**。Models 库 CRUD 复用既有 Preload `window.hermesAPI`：

| Preload 方法 | Main | 存储 |
|--------------|------|------|
| `listModels()` | `models.ts` | `~/.hermes/models.json` |
| `addModel(name, provider, model, baseUrl)` | 同上 | 同上 |
| `updateModel(id, fields)` | 同上 | 同上 |
| `removeModel(id)` | 同上 | 同上 |

Renderer：`screens/Hermes/pages/Models/HermesDefaultModelsSurface.tsx` 经 `hermesDefaultApi.models.*` 调用；custom provider 的 API key 经 `hermesDefaultApi.providers.setEnv`（profile `default`）。活跃 Gateway 模型由 Chat `hermesDefaultChat.setModelConfig` / `setModelConfig` 设置，Models 页不提供「Set active」。

---

## Hermes MCP Registry（V6.1）

Desktop MCP 管理面：`~/.hermes/desktop/mcp-registry.db`。Renderer 仅通过 `window.hermesAPI.mcp`（Preload `mcp-api.ts`）访问；token 明文不进入 Renderer。

| Channel | Args | Returns |
|---------|------|---------|
| `mcp:list-servers` | `profile?` | `McpServer[]` |
| `mcp:create-server` | `CreateMcpServerInput` | `McpServer` |
| `mcp:update-server` | `id`, `UpdateMcpServerInput` | `McpServer` |
| `mcp:delete-server` | `id` | `{ success: boolean }` |
| `mcp:set-server-enabled` | `id`, `enabled` | `McpServer` |
| `mcp:test-connection` | `id` | `McpConnectionTestResult` |
| `mcp:sync-tools` | `id` | `McpToolSyncResult`（v6.4.1：`ok` / `status` / `error` / `diagnostics`；backend gateway preset 经 Local Proxy + Desktop token，失败不抛裸 `fetch failed`） |
| `mcp:list-tools` | `ListMcpToolsInput?` | `McpTool[]` |
| `mcp:set-tool-enabled` | `SetMcpToolEnabledInput` | `McpSkillBinding` |
| `mcp:bind-tool` | `BindMcpToolInput` | `McpSkillBinding` |
| `mcp:unbind-tool` | `UnbindMcpToolInput` | `{ success: boolean }` |
| `mcp:check-bridge` | `profile` | `McpBridgeStatus` |
| `mcp:install-bridge` | `profile` | `McpBridgeStatus` |
| `mcp:invoke-test` | `McpInvokeToolInput` | `McpInvocationResult` |
| `mcp:list-invocations` | `ListMcpInvocationsInput?` | `McpInvocation[]` |
| `mcp:list-artifacts` | `invocationId` | `McpArtifact[]` |

**Main 事件（Preload unsubscribe）**

| Event | Payload |
|-------|---------|
| `mcp:event` | `McpRuntimeEvent` |
| `mcp:server-status` | `McpServerStatusEvent` |
| `mcp:invocation-event` | `McpInvocationEvent` |

**Runtime Proxy**：Main `mcp-runtime-proxy.ts` 监听 `127.0.0.1:18781` — `GET /health`、`POST /mcp/skills/call`（供 `mcp-skill-bridge`）。

**Legacy**：`list-mcp-servers` 仍读 Hermes `config.yaml` 的 `mcp_servers` 段，与 v6.1 registry 并存。

**Renderer**：`screens/Hermes/pages/MCP/HermesMCPPage.tsx`；Hermes 左导航 `mcp`；页内 Tab：MCP 服务 / 技能 / 市场。

---

## MCP Skill Gateway Runtime（V6.4 / V6.4.1）

将 nodeskclaw `/api/v1/hermes/mcp` 经 Desktop 本地 Proxy 注册为 Hermes `mcp_servers.mcp_skill_gateway`。Renderer 经 `window.mcpSkillGatewayRuntime`（Preload `mcp-skill-gateway-runtime-api.ts`）访问；**accessToken 不写入 config.yaml**，仅 Proxy 注入 `Authorization`。

**V6.4.1 配置单一源**：远程 backend 不再存于 `McpSkillGatewayRuntimeConfig`；统一从登录时写入的 `AuthEndpointConfig.backendUrl`（`auth-endpoint-config.json`）派生 `backendBaseUrl` / `remoteMcpUrl`。测试默认 backend：`http://192.168.0.118:4510`。

| Channel | Args | Returns |
|---------|------|---------|
| `mcp-skill-gateway-runtime:get-status` | — | `McpSkillGatewayRuntimeStatus`（含 `backendBaseUrl`、`remoteMcpUrl`、`localProxyUrl`） |
| `mcp-skill-gateway-runtime:get-config` | — | `McpSkillGatewayRuntimeConfig`（**无** `backendBaseUrl`） |
| `mcp-skill-gateway-runtime:save-config` | `Partial<McpSkillGatewayRuntimeConfig>` | `McpSkillGatewayRuntimeConfig` |
| `mcp-skill-gateway-runtime:start-proxy` | — | `McpSkillGatewayActionResult` |
| `mcp-skill-gateway-runtime:stop-proxy` | — | `McpSkillGatewayActionResult` |
| `mcp-skill-gateway-runtime:restart-proxy` | — | `McpSkillGatewayActionResult` |
| `mcp-skill-gateway-runtime:test-proxy` | — | `McpSkillGatewayHealthResult` |
| `mcp-skill-gateway-runtime:test-remote-mcp` | — | `McpGatewayRemoteTestResult`（经 Local Proxy `tools/list`） |
| `mcp-skill-gateway-runtime:register-to-profile` | `profile` | `McpSkillGatewayRegisterResult`（含 `urlMatched` / `backendMatched` / `ready`） |
| `mcp-skill-gateway-runtime:unregister-from-profile` | `profile` | `McpSkillGatewayRegisterResult` |
| `mcp-skill-gateway-runtime:list-profile-registrations` | — | `McpSkillGatewayProfileRegistration[]`（含一致性字段） |
| `mcp-skill-gateway-runtime:read-proxy-logs` | `lines?` | `string` |
| `mcp-skill-gateway-runtime:read-structured-logs` | `lines?` | `McpGatewayProxyLogEntry[]`（V6.6.1 JSONL 解析；过滤非法行；redact Authorization） |
| `mcp-skill-gateway-runtime:run-diagnostics` | — | `McpGatewayDiagnosticsResult`（V6.6.1：10 步含 `toolsList` / `defaultProfileRegistration` / `hermesGateway`；`checkedAt`；错误码对外 `MCP_OP_*`） |
| `mcp-skill-gateway-runtime:list-remote-tools` | `forceRefresh?` | `McpGatewayToolPreview[]`（含 `category` / `permission` / `riskLevel` / `lastSyncedAt`；**V6.7** 含 `approvalMode` / `requiresApproval` / `authorized` / `grantStatus` / `grantId` / `approvalRequestId` / `expiresAt`；缓存 TTL 60s） |
| `mcp-skill-gateway-runtime:invoke-remote-tool` | `McpGatewayInvokeTestInput` | `McpGatewayInvokeTestResult`（v6.6.1：`arguments` 或兼容 `input`；**V6.7** UI 默认仍仅 read 工具；响应可含 `approvalRequired` / `approvalRequestId` / `grantStatus`；**V7.0** 可含 `taskHints`；256KB 截断；`MCP_OP_TOOL_*` 含 approval/grant 错误码） |

**V7.0 Hermes Client Contract**（仍经 `window.mcpSkillGatewayRuntime` 暴露；Main `hermes-client-api.ts`；契约 `src/shared/hermes-client/`）：

| Channel | 输入 | 输出 |
|---|---|---|
| `hermes-client:get-bootstrap` | `HermesClientBootstrapInput?` | `HermesClientActionResult<HermesClientBootstrap>` |
| `hermes-client:list-agents` | `HermesClientAgentsInput?` | `HermesClientActionResult<HermesClientAgent[]>` |
| `hermes-client:get-agent` | `agentAlias` | `HermesClientActionResult<HermesClientAgent>` |
| `hermes-client:list-tools` | `HermesClientToolsInput?` | `HermesClientActionResult<HermesClientTool[]>` |
| `hermes-client:readiness-check` | `HermesReadinessCheckInput` | `HermesClientActionResult<HermesReadinessCheckResult>` |
| `hermes-client:create-events-token` | `taskId` | `HermesClientActionResult<TaskEventsTokenResult>` |
| `hermes-client:get-task-result` | `taskId` | `HermesClientActionResult<HermesTaskResult>` |
| `hermes-client:preview-artifact` | `artifactId` | `HermesArtifactPreviewResult`（Main 注入 Bearer；Renderer 不接触 token） |
| `hermes-client:download-artifact` | `artifactId` | `HermesArtifactDownloadResult`（`showSaveDialog` + Main fetch 写盘） |
| `hermes-client:get-recent-tasks` | — | `RecentHermesTask[]`（`userData/hermes-mcp/recent-tasks.json`） |
| `hermes-client:clear-recent-tasks` | — | `void` |

**V7.0 配置**（`McpSkillGatewayRuntimeConfig`）：`enableHermesClientBootstrap` / `enableAgentAliasToolsFilter` / `enableTaskResultPanel` / `enableSseTokenEventSource`（默认均为 `true`）。

**V7.0 structuredContent**：Local Proxy / Invoke Test 解析 `tools/call` 结果中的 `structuredContent.task_id` / `event_token_url` / `result_url` 写入 recent task cache；诊断在 `enableHermesClientBootstrap` 时追加 `clientBootstrap` / `clientAgents` / `clientToolsFilter` / `clientReadiness` 步骤。

**V6.7 服务端审批感知（Desktop 不审批）**：Local Proxy 转发时除 `Authorization` 外注入 `X-NoDeskClaw-Desktop-Device-Id`（Main `device-identity.ts`）、`X-NoDeskClaw-Hermes-Profile`（自 `/mcp?profile=` 解析，缺省 `default`）、`X-NoDeskClaw-Client`、`X-NoDeskClaw-MCP-Proxy-Version: v6.7`。Hermes 注册 URL 默认 `http://127.0.0.1:<port>/mcp?profile=<name>`（`profileScopedProxyUrl`）；旧无 query URL 与 default profile 兼容。`system/info.mcp.approvalCenterPath` 默认 `/mcp/approvals`。Renderer **无** approve/reject/revoke；仅展示 grant 状态 + 打开 Portal 审批中心。

**本地 Proxy**：`src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-proxy.ts` 监听 `127.0.0.1:48742`（可配置）— `GET /health`（`self` / `backend` / `mcp` 分项）、`POST /admin/config`、`GET /debug/last-error`、`POST /debug/probe`、`POST /mcp`（auto-initialize + Bearer + v6.7 上下文 header 注入；`tools/call` approval/grant 错误写入 structured log）。

**Descriptor**：Main `mcp-backend-descriptor.ts` — `GET {backendUrl}/api/v1/system/info` → `mcp.endpoint` 合成 `upstreamUrl`（缓存 60s）。

**Tools 缓存**：`~/.hermes/desktop/mcp-tools-cache.json`（sync 成功覆盖，失败保留旧缓存，不含 token）。

**Windows 验收**：

```bash
curl http://127.0.0.1:48742/health
curl -X POST http://127.0.0.1:48742/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":\"test\",\"method\":\"tools/list\",\"params\":{}}"
```

**Hermes 注册**：写入 `~/.hermes/config.yaml` 或 `~/.hermes/profiles/<name>/config.yaml` 的 `mcp_servers.mcp_skill_gateway`（`type: http`，`url: http://127.0.0.1:<port>/mcp?profile=<name>` 或 legacy `/mcp`）；禁止写入远程 backend URL 或 token。

**生命周期**：登录成功自动启动 Proxy + 注册 default（可配置）；退出登录停止 Proxy；`before-quit` 停止 Proxy。

**认证（V6.4.1）**：`window.desktopAuth.login({ endpointConfig, account, password })` → Main `POST {backendUrl}/api/v1/auth/account-login` → `GET /auth/me` 校验 `current_org_id` + `portal_org_role`；`LoginInput.email` 仅兼容旧 UI。

**契约**：`src/shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract.ts`（re-export **`mcp-gateway-operations-contract.ts`** V6.6.1 运营类型）、`src/shared/auth/auth-contract.ts`

**Renderer**：`screens/Hermes/pages/McpGateway/HermesMcpGatewayPage.tsx`（**V7.0** Client Contract / Agent Alias / Readiness Drawer / Task Result Panel + client tools 筛选；**V6.7** Server Authorization Panel + Tools Preview 授权 badge；**V6.6.1** Diagnostics / Invoke Test / Registration / Logs；Hermes 重启横幅）；Hermes 左导航 `mcpGateway`；登录页 `modules/auth/components/LoginForm.tsx`（account 字段）。

---

## GeneHub Runtime（V6.5 + V6.5.1 Hotfix + **V6.6.2 MCP Registration** + **V6.7.1 Hardening**）

nodeskclaw 企业 GeneHub Registry 本地安装执行器：拉取授权 Skill / 安装任务、下载 Bundle、写入本机 Hermes `skills/` 与 `scripts/`、回传状态。**禁止** Renderer 传入任意 URL 或本地路径；**无**上传/发布/审核入口。

**V6.6.2**：`source=mcp_agent_request` 的 install job **永不自动安装**；scheduler 写入 `~/.hermes/desktop/genehub/pending-jobs.json` 并广播 `genehub:pending-jobs-changed`；用户确认后 `genehub:install-job` 才 claim/install；安装成功写入 `skills/<name>/genehub.json` provenance。

**V6.7.1**：`GET .../bundle-preview`（preview **不 claim**）；`POST .../ignore` 同步服务端 `cancelled`；`~/.hermes/desktop/genehub/profile-mapping.json` 持久化 serverProfileId；`syncInstalledSkills` 使用 server profile id；`verifySignature` + `trustedPublicKeys` 签名校验；scripts 写入 provenance sidecar（`*.genehub.json`）；`InstallJob.profileMappingMissing` 禁用确认安装。

**配置单一源**：`AuthEndpointConfig.backendUrl` → `GET /api/v1/system/info` → `genehub` descriptor → `apiBaseUrl`；Bearer 仅 Main 注入。

**V6.5.1 后端契约对齐**（`team_v3.4.1`）：`registerHermesProfile` 发送 `desktop_device_id`（非 `profile_id`）；`heartbeat` 发送 `desktop_device_id` + `profiles[].profile_name`；`createInstallJob` 使用 `job_type` + `version`；`/status` **不**回传 `claimed`；Skill 列表兼容 `slug`/`version`/`name`/`permissions[]`/`installed_status`。

| Channel | Args | Returns |
|---------|------|---------|
| `genehub:get-connection` | `forceRefresh?` | `GeneHubConnection` |
| `genehub:probe-connection` | — | `GeneHubConnection`（强制刷新 descriptor + health） |
| `genehub:initialize` | — | `GeneHubInitializeResult`（device/profile 注册 + sync） |
| `genehub:get-config` | — | `GeneHubRuntimeConfig` |
| `genehub:list-authorized-skills` | `{ profileId? }` | `GeneHubSkill[]` |
| `genehub:list-pending-jobs` | `{ profileId? }` | `InstallJob[]` |
| `genehub:create-install-job` | `{ profileId?, geneSlug, action }` | `InstallJob` |
| `genehub:install-job` | `jobId`, `{ userConfirmed?: boolean }?` | `GeneHubActionResult`（MCP job 须 `userConfirmed: true`） |
| `genehub:update-skill` | `{ profileId?, geneSlug }` | `GeneHubActionResult` |
| `genehub:uninstall-skill` | `{ profileId?, geneSlug }` | `GeneHubActionResult` |
| `genehub:sync-installed-skills` | `{ profileId? }` | `GeneHubActionResult` |
| `genehub:get-install-logs` | `limit?` | `InstallLogEntry[]` |
| `genehub:list-mcp-registration-jobs` | `{ profileId? }` | `GeneHubMcpRegistrationJobsResult` |
| `genehub:preview-install-bundle` | `jobId` | `GeneHubInstallBundlePreview`（`GET .../bundle-preview`，不 claim） |
| `genehub:ignore-install-job` | `jobId` | `GeneHubActionResult`（`POST .../ignore` → 服务端 cancelled + 刷新 cache） |
| `genehub:get-registration-summary` | — | `GeneHubRegistrationSummary`（含 `inProgressMcpJobCount`、`lastSyncAt`） |

**事件（Main → Renderer）**：`genehub:pending-jobs-changed` — scheduler poll 完成后广播；Preload `genehubRuntime.onPendingJobsChanged(cb)` 返回 unsubscribe。

**InstallJob 扩展字段（V6.6.2 + V6.7.1）**：`source?`（缺失不得视为 MCP job）、`profileName?`、`profileMappingMissing?`、`createdAt?`、`lastUpdatedAt?`、`errorCode?`、`errorMessage?`

**本地缓存（V6.7.1）**：
- `~/.hermes/desktop/genehub/profile-mapping.json` — local ↔ server profile id
- `~/.hermes/desktop/genehub/pending-jobs.json` — scheduler merge（version `v6.7.1`）

**Main 模块**：`src/main/genehub/`（`genehub-client.ts`、`genehub-profile-mapping.ts`、`script-provenance.ts`、`skill-install-worker.ts`、`hermes-skill-writer.ts`、`genehub-scheduler.ts`、`pending-jobs-cache.ts`、`mcp-registration-service.ts` 等）。

**生命周期**：登录成功 `onGeneHubLoginSuccess` → `initializeGeneHub` + 定时 heartbeat/pending jobs；logout / `before-quit` 停止 scheduler。

**契约**：`src/shared/genehub/genehub-contract.ts`、`src/shared/genehub/genehub-errors.ts`

**Renderer**：`screens/Hermes/pages/GeneHub/GeneHubSkillCenterPage.tsx`（**V6.7.1** validation preview + profile mapping 门禁；**V6.6.2** `mcpRegistration` 页签 + Drawer）；`screens/Hermes/pages/McpGateway/McpGatewayGeneHubRegistrationCard.tsx`（pending/in-progress/lastSync）；Local Hermes 左导航 `skillCenter`。

---

## Hermes Experts Workspace（V7.1 / V7.1.1 E2E → **V7.2 Remote Experts Pivot** → **Expert MCP Gateway v6.1**）

专家广场 / 专家团队 / 专家运行：**V7.2 起不再本地安装专家 Profile**；**Expert MCP Gateway v6.1** 直连 `POST /api/v1/expert/mcp`（同步 JSON-RPC `tools/call`，无 HermesTask）；目录来自 root `tools/list`（严格 `annotations.kind=expert|expert_team`）；per-slug `tools/list` 取 skill；统一 `callCatalogSkill` 创建 run + artifact；Runs/Artifacts 为本地 UI 缓存（`expert-runtime-db` schema v3）。边界见 `docs/specs/v7.2-nodeskclaw-remote-experts/01-architecture-boundary.md`。

**Preload**：`window.hermesExperts`（`src/preload/hermes-experts-api.ts`）— **不向 Renderer 暴露 token**。

| Channel | Args | Returns |
|---------|------|---------|
| `hermes-experts:list-catalog` | `ExpertCatalogQuery?` | `ExpertCatalogPage`（Expert MCP root `tools/list`） |
| `hermes-experts:get-expert` | `expertId` | `HermesExpert \| null` |
| `hermes-experts:list-teams` | `ExpertTeamCatalogQuery?` | `ExpertTeamCatalogPage` |
| `hermes-experts:get-team` | `teamId` | `HermesExpertTeam \| null` |
| `hermes-experts:get-expert-gateway-health` | — | `ExpertHealthResponse` |
| `hermes-experts:get-expert-gateway-diagnostics` | — | `ExpertGatewayDiagnostics`（endpoint + `currentCatalogSource` + `lastError`） |
| `hermes-experts:clear-expert-catalog-cache` | — | `{ ok: true }` — 清除本地 expert/team catalog cache（v1.2.1 hotfix） |
| `hermes-experts:list-catalog-skills` | `slug` | `{ ok, data?: RemoteExpertSkill[], error?, errorCode? }` |
| `hermes-experts:list-expert-skills` | `expertSlug` | `{ ok, data?: RemoteExpertSkill[], error?, errorCode? }`（委托 `list-catalog-skills`） |
| `hermes-experts:call-catalog-skill` | `CallCatalogSkillInput`（**v7.5** 可选 `payload: OpenAICompatibleExpertPayload`；legacy `prompt`；**禁止** route override；Main `assertNoRouteOverride` 抛错） | `CallCatalogSkillResult`（**v7.5** `mode: event_stream` 时含 `taskId` / `eventSseUrl` / `artifactUrl` / `streaming`；`sync_result` 含 `responseText`） |
| `hermes-experts:subscribe-task-events` | `SubscribeExpertTaskEventsInput` | `SubscribeExpertTaskEventsResult` — Main 代理 `eventSseUrl` SSE（Bearer 仅 Main） |
| `hermes-experts:unsubscribe-task-events` | `taskId` | `{ ok: true }` |
| `hermes-experts:list-task-artifacts` | `taskId` | `{ ok, data?: ExpertArtifact[] }` — 来自 stream 事件缓存 |
| `hermes-experts:preview-artifact` | `ExpertArtifactPreviewInput` | `{ ok, data?: ExpertArtifactPreview, error?, errorCode? }` |
| `hermes-experts:download-artifact` | `ExpertArtifactDownloadInput` | `ExpertArtifactDownloadResult` |
| `hermes-experts:list-local-artifacts` | `limit?` | `{ ok, data?: HermesExpertArtifact[] }` |
| `hermes-experts:preview-install-expert` | `expertId` | `{ ok, data?, error?, errorCode? }` — **@deprecated V7.2** |
| `hermes-experts:install-expert` | `expertId`, `InstallOptions?` | `{ ok, data?, ... }` — **@deprecated V7.2** |
| `hermes-experts:preview-install-team` | `teamId` | `{ ok, data?, ... }` — **@deprecated V7.2** |
| `hermes-experts:install-team` | `teamId`, `InstallOptions?` | `{ ok, data?, ... }` — **@deprecated V7.2** |
| `hermes-experts:summon-expert` | `SummonExpertInput`（含 `skillName?`、`context?`；内部委托 `callCatalogSkill`） | `SummonExpertResult`（同步完成，**无** `taskId`） |
| `hermes-experts:summon-team` | `SummonTeamInput`（含 `skillName?`；内部委托 `callCatalogSkill`） | `SummonTeamResult`（同步完成） |
| `hermes-experts:list-runs` | `ExpertRunFilter?` | `HermesExpertRun[]`（含 `responseText?`、`catalogSlug?`、`skillName?`、`invocationId?`） |
| `hermes-experts:get-run` | `runId` | `HermesExpertRun \| null` |
| `hermes-experts:sync-remote-run` | `runId` | `{ ok, error?, errorCode? }` — **legacy HermesTask only**；Expert Gateway 路径 no-op |
| `hermes-experts:get-run-result` | `runId` | `{ ok, data?: RemoteRunResult, ... }` — **legacy HermesTask** |
| `hermes-experts:get-run-timeline` | `runId` | `{ ok, data?: ExpertRunEvent[], error?, errorCode? }` |
| `hermes-experts:list-run-artifacts` | `runId` | `{ ok, data?: RemoteArtifact[], error?, errorCode? }` |
| `hermes-experts:preview-run-artifact` | `artifactId` | hermes-client preview |
| `hermes-experts:download-run-artifact` | `artifactId` | hermes-client download |
| `hermes-experts:import-run-artifact` | `ImportArtifactInput` | `{ ok, localPath?, error? }` — 导入副本至 `~/.hermes/desktop/imported-artifacts/` |
| `hermes-experts:cancel-run` | `runId` | `{ ok, errorCode?, message? }` |
| `hermes-experts:retry-run` | `runId` | `SummonTeamResult \| SummonExpertResult` |
| `hermes-experts:set-trust` | `expertId`, `HermesExpertTrustStatus` | `{ ok, error?, errorCode? }` |
| `hermes-experts:preflight` | `profileId`, `port?` | `ExpertPreflightResult` — **@deprecated V7.2 本地安装** |
| `hermes-experts:dispatch-team` | `{ runId, teamId, ... }` | `{ ok }` — **@deprecated V7.2 no-op（server_managed）** |
| `hermes-experts:push-genehub-skill` | `PushSkillInput` | `{ ok, data?: { submissionId }, error? }` |
| `hermes-experts:list-genehub-submissions` | — | `{ ok, data?: GeneHubSkillSubmission[] }` |
| `hermes-experts:list-genehub-pull-jobs` | — | `{ ok, data?: GeneHubPullJob[] }` |
| `hermes-experts:get-desktop-sync-status` | — | `{ ok, data: ExpertDesktopSyncStatus }` |
| `hermes-experts:register-desktop` | — | `{ ok, data?, error?, errorCode? }` |

**事件（Main → Renderer）**：
- `hermes-experts:event` — Preload `hermesExperts.onExpertRuntimeEvent(cb)` 返回 unsubscribe。
- **v7.5** `hermes-experts:task-event` — `ExpertTaskEvent`（`task.started` / `task.progress` / `task.artifact.ready` / `task.completed` / `task.failed` / `task.stream.closed`）；Preload `onExpertTaskEvent(cb)`。
- **v7.5** `hermes-experts:task-stream-error` — `ExpertTaskStreamError`；Preload `onExpertTaskStreamError(cb)`。
- **v7.5** `hermes-experts:task-stream-closed` — `ExpertTaskStreamClosedEvent`；Preload `onExpertTaskStreamClosed(cb)`。

**Main 模块**：`src/main/hermes-experts/`（**Expert MCP v6.1 / v1.2.1 hotfix** `expert-mcp-endpoint.ts` + `ExpertMcpClient` + `expert-mcp-mappers.ts` + `expert-route-guard.ts`；**v7.5** `expert-task-stream.ts` SSE 代理 + `expert-artifact-client.ts`；`expert-catalog-client.ts` 主路径 `POST /api/v1/expert/mcp` tools/list，MCP 成功但 0 expert **不** fallback 旧 cache；`callCatalogSkill` in `expert-runtime.ts`；legacy HermesTask：`expert-remote-client.ts`；deprecated：`expert-installer.ts`、`expert-profile-manager.ts`）。

**传输**：Expert 域 → `GET /api/v1/expert/health` + `POST /api/v1/expert/mcp`（root/slug JSON-RPC）；非专家 Skill 仍走 `mcp-skill-gateway-runtime`。

**Route guard**：`assertNoRouteOverride` 拦截 12+ 禁止字段（含 `arguments.context` 子字段）；命中抛 `EXPERT_ROUTE_OVERRIDE_FORBIDDEN`。

**Chat 桥接**：`expert-run-bridge.ts` 远端 run（`profileId: remote`）跳过本地 team dispatch；artifact 预览优先本地 `preview_text`，legacy 走 `hermes-client-api`。

**契约**：`src/shared/hermes-experts/hermes-experts-contract.ts`、`expert-task-stream-contract.ts`（**v7.5**）、`hermes-experts-errors.ts`（含 `ExpertErrorCode`）

**Renderer**：默认页 **chat**（**v7.4.2** + **v7.5.1 Runtime Skill fixed route**）；`pages/Chat/` 内嵌 Work 控件（**v7.5.1** `runtimeSkillApi` → `nodeskclawRuntimeSkillAPI` + `useRuntimeSkillSend` / `useNodeskclawTaskStream`；`RuntimeSkillTimelineBlock` / `RuntimeSkillArtifactCard` / `WorkExpertOutputPanel`）；legacy v7.5 `workExpertGatewayApi` / `hermes-experts:task-event` 保留但 **Chat Runtime Skill 禁止**；`pages/Workbench/`、`pages/Artifacts/`、`pages/Experts/` + `pages/ExpertTeams/`（统一 `ExpertCatalogCallDrawer` + `callCatalogSkill`）；`ExpertRuns/`；GeneHub `skillPush` 页签；`pages/Tasks/` 保留但导航隐藏（v7.4.1 遗留）。

---

## NoDeskClaw Runtime Skill（v7.5.1 fixed）

**背景**：Work Chat 选择 Expert + Skill 后调用远端 Runtime Skill 必须走 NoDeskClaw MCP Skill Gateway 固定路由（`sourceType=hermes_api_server`），**禁止**再走 `hermes-experts:call-catalog-skill` / OpenAI-compatible payload。

**Preload**：`window.nodeskclawRuntimeSkillAPI`（`src/preload/nodeskclaw-runtime-skill-api.ts`）— **不向 Renderer 暴露 token**。

| Channel | Args | Returns |
|---------|------|---------|
| `nodeskclaw:list-runtime-skills` | — | `McpTool[]` — `tools/list` 经 `isRuntimeSkillTool` 过滤 |
| `nodeskclaw:call-runtime-skill` | `CallRuntimeSkillInput`（`tool` + `prompt` + `context`；**仅** `prompt`/`context` 进入 MCP `arguments`；Main 注入 `device_id`） | `RuntimeSkillStructuredContent`（`task_id` / `execution_mode=async_event` / `event_stream` 含 `/hermes/tasks/`） |
| `nodeskclaw:subscribe-task-events` | `SubscribeTaskEventsInput` | `SubscribeTaskEventsResult` — Main 代理 SSE（禁止 `/v1/runs/`） |
| `nodeskclaw:unsubscribe-task-events` | `taskId` | `{ ok: true }` |
| `nodeskclaw:preview-artifact` | `NodeskclawArtifactPreviewInput` | `{ ok, data?, error?, errorCode? }` |
| `nodeskclaw:download-artifact` | `NodeskclawArtifactDownloadInput` | `NodeskclawArtifactDownloadResult` |

**事件（Main → Renderer）**：
- `nodeskclaw:task-event` — `NodeskclawTaskEvent`；Preload `onTaskEvent(cb)` 返回 unsubscribe。
- `nodeskclaw:task-stream-error` — `NodeskclawTaskStreamError`；Preload `onTaskStreamError(cb)`。
- `nodeskclaw:task-stream-closed` — `NodeskclawTaskStreamClosedEvent`；Preload `onTaskStreamClosed(cb)`。

**Main 模块**：`src/main/nodeskclaw/`（`nodeskclaw-mcp-client.ts` → `POST /api/v1/hermes/mcp/skill-gateway`；`nodeskclaw-runtime-skill-client.ts`；`nodeskclaw-task-stream.ts`；`nodeskclaw-artifact-client.ts`；复用 `mcp-token-provider` + `resolveBackendBaseUrl`）。

**契约**：`src/shared/nodeskclaw/runtime-skill-contract.ts`、`runtime-skill-guards.ts`、`task-stream-contract.ts`、`artifact-contract.ts`。

**Renderer（Chat Runtime Skill 专用）**：`api/runtimeSkillApi.ts`；`hooks/useRuntimeSkillSend.ts` + `useNodeskclawTaskStream.ts`；`RuntimeSkillTimelineBlock` / `RuntimeSkillArtifactCard`；**不得**调用 `workExpertGatewayApi.callExpertSkill` 或 `window.hermesExperts.callCatalogSkill`。

**Legacy**：`window.hermesExperts` / `hermes-experts:*` 仍供 Workbench、ExpertRuns、Experts 广场等使用。

---

## v7.4.2 Chat-first Work Controls（Renderer 发送路径，无新 IPC）

**背景**：从 v7.4.1「任务首页预发送」回退为 Chat 主入口；Expert + Skill 选择嵌入 `HermesDefaultWebChatSurface` / `ComposerBar`，仅在用户点击 **Send** 且 `useExpertGateway === true` 时走 Runtime Skill（**v7.5.1** 起改 NoDeskClaw MCP 固定路由，不再 `workExpertGatewayApi.callExpertSkill`）。

**Renderer API 层**（禁止组件直接 `window.nodeskclawRuntimeSkillAPI` / `window.hermesExperts`）：

| 模块 | 职责 |
|------|------|
| `api/runtimeSkillApi.ts` | **v7.5.1** `checkGatewayHealth` / `listRuntimeSkillExperts` / `listRuntimeSkillTools` / `callRuntimeSkill` → `window.nodeskclawRuntimeSkillAPI` |
| `api/workExpertGatewayApi.ts` | **legacy** Workbench 等；Chat Runtime Skill **禁止** |
| `hooks/useWorkChatContext.ts` | gateway / expert / skill / permission；`useExpertGateway = expert && skill?.runtimeTool && gatewayStatus === "remote"` |
| `hooks/useRuntimeSkillSend.ts` | **v7.5.1** Send → `runtimeSkillApi.callRuntimeSkill` + `useNodeskclawTaskStream.startStream` |
| `hooks/useNodeskclawTaskStream.ts` | 订阅 `nodeskclaw:task-event`；artifact preview/download |
| `pages/Chat/hooks/useHermesDefaultChatStream.ts` | 扩展 `appendLocalMessage` / `setExternalRunState` / `setLastError` |

**底层 IPC**（**v7.5.1 Chat Runtime Skill** 见上节 `nodeskclaw:*`；legacy Expert Gateway 仍用 Hermes Experts 通道）：

- `hermes-experts:get-expert-gateway-health`（经 `workApi.gateway.health`）
- `hermes-experts:list-catalog-skills` + `hermes-experts:call-catalog-skill`

**Hermes 默认路径**（未选 Expert+Skill 或 gateway 非 remote）：`hermesDefaultChat.sendMessage` → Gateway `:8642` SSE（`hermes-chat:*` IPC，无变更）。

---

## Work 任务窗口（v7.4.1 Hotfix — Hermes Session 绑定）

**Preload**：`window.work`（`src/preload/work-api.ts`）

| Channel | Args | Returns |
|---------|------|---------|
| `work:task-start` | `WorkTaskStartInput & { task: WorkTask }` | `WorkTaskStartResult` |
| `work:task-list` | `profile?: string` | `WorkTask[]` |
| `work:task-resume` | `taskId`, `profile?` | `WorkTaskResumeResult` |
| `work:task-get-by-session` | `sessionId`, `profile?` | `WorkTask \| null` |
| `work:task-send` | `WorkTaskSendInput` | `WorkTaskSendResult`（**@deprecated** legacy mock SSE） |
| `work:task-stop` | `taskId: string` | `void` |

**持久化**：`~/.hermes/desktop/work-tasks.json`（`src/main/work/work-task-store.ts`）。

**事件（Main → Renderer）**：`work:task-event` — Preload `work.task.onEvent(cb)`（legacy mock 流；v7.4.1 主路径走 Hermes Chat SSE）。

**Shared 契约**：`src/shared/work/`（`WorkTask.sessionId` / `profile` / `source` / `permissionMode: default \| confirm_each \| auto_low_risk`）。

**Renderer**：`screens/Hermes/pages/Tasks/` — `WorkTaskStartComposer` → `workTaskApi.startTask` → `hermesDefaultChat.sendMessage`；任务窗口复用 `HermesDefaultWebChatSurface`（`forcedSessionId`）；最近任务 = Hermes sessions ⨝ `work-tasks.json`。**v7.4.2**：`tasks` 导航隐藏；主发送路径见下节。

---

## v7.6 Hermes Agent MCP Host Mode

**背景**：Chat 不再直连 nodeskclaw Expert MCP Gateway。Expert + Skill 选择仅生成 `buildExpertPromptHint()` 拼入用户消息，统一 `hermesDefaultChat.sendMessage` → Gateway `:8642`；hermes-agent 内部 MCP Client 调用 `config.yaml` → `mcp_servers`。

**Preload**：`window.hermesMcpConfig`（`src/preload/hermes-mcp-config-api.ts`）— token 仅 Main 读写 `.env`，Renderer 只见 `tokenConfigured`。

| Channel | Args | Returns |
|---------|------|---------|
| `hermes-mcp:get-servers` | `profile?` | `HermesMcpServerView[]` |
| `hermes-mcp:save-server` | `SaveHermesMcpServerInput` | `HermesMcpServerMutationResult`（写 `config.yaml` + `.env`；可触发 Gateway restart） |
| `hermes-mcp:remove-server` | `name`, `profile?` | `HermesMcpServerMutationResult` |
| `hermes-mcp:enable-server` | `name`, `profile?` | `HermesMcpServerMutationResult` |
| `hermes-mcp:disable-server` | `name`, `profile?` | `HermesMcpServerMutationResult` |
| `hermes-mcp:test-server` | `name`, `profile?` | `HermesMcpTestServerResult`（经 Hermes `:8642/health` + 配置校验；**不**直连 nodeskclaw） |
| `hermes-mcp:reload` | `profile?` | `{ ok, restarted?, message? }` |
| `hermes-mcp:list-tools` | `name`, `profile?` | `HermesMcpListToolsResult`（`mcp_servers.tools.include`） |

**Main 模块**：`src/main/hermes-mcp-config/`（`hermes-mcp-config-service.ts` 复用 `hermes-config-yaml.ts`）。

**契约**：`src/shared/hermes-mcp-config/hermes-mcp-config-contract.ts`。

**Renderer（Chat）**：
- `pages/Chat/utils/buildExpertPromptHint.ts` + `components/PromptHintPreview.tsx`
- `components/ToolProgressTimeline.tsx`（`hermes.tool.progress`）
- `components/LocalDocumentCard.tsx`（识别 final response 本地路径）
- **禁止**业务 Chat 调用 `workExpertGatewayApi.callExpertSkill` / `useRuntimeSkillSend` / `useExpertTaskStream`

**Renderer（MCP 配置 UI）**：`pages/McpGateway/HermesAgentMcpServersPanel.tsx` + `hooks/useHermesMcpConfig.ts`。

**发送单路径**（用户点击 Send）：

| 条件 | 路径 |
|------|------|
| 选中 Expert + Skill | `buildExpertPromptHint(userMessage, …)` → `hermesDefaultChat.sendMessage` → Gateway `:8642` SSE |
| 否则 | 原始 `userMessage` → `hermesDefaultChat.sendMessage` |

**Legacy（debug / Workbench）**：`window.hermesExperts.callCatalogSkill` 与 `nodeskclaw:*` 保留，**禁止** Chat 业务路径使用。

---

## v7.4.2 Chat-first Work Controls（Renderer，无新 IPC — **v7.6 已由 MCP Host Mode 取代发送分叉**）

Chat 为 Local Hermes 默认页；Work 控件（Expert / Skill / Permission / Gateway badge）嵌入 `ComposerBar.workControlsSlot` 与 `WorkChatContextBar`。

**发送路径（v7.6 起）**：见上节 **v7.6 Hermes Agent MCP Host Mode**；`useExpertGateway` 恒为 `false`。

**Renderer 模块**：`api/workExpertGatewayApi.ts`（**@deprecated** `callExpertSkill`）、`types/work-chat.ts`、`pages/Chat/hooks/useWorkChatContext.ts`、`pages/Chat/components/work/*`。

---

See `copilot-desktop/AGENTS.md` §「新增 IPC」for the checklist when adding channels.
