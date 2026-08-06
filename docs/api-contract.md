# smc-copilot-serve API 契约

**Base URL：** `http://127.0.0.1:8765`（`COPILOT_HOST` / `COPILOT_PORT`；亦可用 `RUNTIME_HOST` / `RUNTIME_PORT`）

**代码根：** 扁平 `src/`；启动：`uv run uvicorn main:app --app-dir src --host 127.0.0.1 --port 8765`

**SQLite 默认：** `~/.hermes/desktop/sqlite.db`（`COPILOT_SQLITE_PATH`）；Profile 数据目录 `~/.hermes/profiles/<name>/`

**依赖：** 附件上传需安装 `python-multipart`（见 `pyproject.toml`）

**API Version：** `1.2`（`GET /api/v1/runtime/capabilities`）。v1.5 新增 Endpoint / Sync / Remote Tasks / Experience，见下文。

---

## 鉴权与 CORS

| 项 | 行为 |
|---|---|
| Header | `X-Copilot-Desktop-Token: <COPILOT_DESKTOP_TOKEN>` |
| 开关 | `COPILOT_REQUIRE_TOKEN=true` 时除白名单外必填 |
| 白名单 | `GET /api/v1/health`、`/docs`、`/openapi.json`、`/redoc` |
| CORS | `build_asgi_app()` 纯 ASGI 包装；SSE 响应带 `Access-Control-Allow-Origin`（本地 Portal/Desktop） |

---

## 错误响应格式

### 通用 Copilot 错误（`CopilotError`）

```json
{
  "code": "not_found",
  "message": "Profile xyz not found"
}
```

| code | 典型 HTTP |
|------|-----------|
| `not_found` | 404 |
| `conflict` | 409 |
| `gateway_error` | 503 |
| `hermes_client_error` | 502 |
| `policy_denied` | 403 |
| `invalid_state_transition` | 409 |
| `team_hub_error` | 502 |

### Workspace Chat 结构化错误（`ChatApiError`）

```json
{
  "error": {
    "code": "PROFILE_NOT_DEPLOYED",
    "message": "Profile is not deployed on this machine",
    "details": { "profile_id": "…" }
  }
}
```

| code | HTTP | 场景 |
|------|------|------|
| `PROFILE_NOT_FOUND` | 404 | resolve / profile 不存在 |
| `PROFILE_NOT_DEPLOYED` | 400 | 本机无 profile 目录 |
| `GATEWAY_NOT_RUNNING` | 503 | Gateway 未启动 |
| `GATEWAY_HEALTH_FAILED` | 503 | 健康检查失败 |
| `MODEL_LIST_FAILED` | 502 | 拉模型列表失败 |
| `MODEL_CONFIG_INVALID` | 400 | 模型配置非法 |
| `ATTACHMENT_TOO_LARGE` | 400 | 单文件 > 25MB |
| `TOO_MANY_ATTACHMENTS` | 400 | 超过 10 个 |
| `ATTACHMENT_TOTAL_SIZE_EXCEEDED` | 400 | 总大小 > 80MB |
| `ATTACHMENT_NOT_FOUND` | 404 | 删除附件不存在 |
| `ATTACHMENT_SCOPE_MISMATCH` | 400 | workspace/profile/session 不匹配 |
| `WORKSPACE_NOT_FOUND` | 404 | workspace 不存在 |
| `WORKSPACE_PATH_INVALID` | 400 | 路径校验失败 |
| `CHAT_STREAM_FAILED` | 502 | Gateway SSE 失败 |
| `CHAT_STREAM_ABORTED` | 400 | 流被 abort |

---

## Runtime Service（v1.3）

统一错误信封：

```json
{
  "error": {
    "code": "runtime_lock_conflict",
    "message": "Another runtime job is running",
    "details": { "jobId": "…" },
    "requestId": "…"
  }
}
```

鉴权：优先 `Authorization: Bearer <device-token>`；兼容期可启用 `X-Copilot-Desktop-Token`（`RUNTIME_ALLOW_LEGACY_TOKEN`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/runtime/status` | Runtime 状态、Hermes 安装、capabilities |
| GET | `/runtime/capabilities` | 能力协商 features[] |
| GET | `/runtime/compatibility` | API 兼容提示 |
| POST | `/runtime/install` | 创建安装 Job（可带 toolchain 覆盖） |
| POST | `/runtime/update` | 更新 Job |
| POST | `/runtime/rollback` | 回滚 Job |
| POST | `/runtime/doctor` | Doctor Job |
| GET/POST | `/runtime/jobs` | Job 列表 / 创建 |
| GET | `/runtime/jobs/{id}` | Job 详情 |
| GET | `/runtime/jobs/{id}/events` | Job SSE |
| POST | `/runtime/jobs/{id}/cancel` | 取消 Job |
| GET | `/runtime/versions` | 已安装版本 |
| GET/POST/PATCH/DELETE | `/instances` | Instance CRUD |
| POST | `/instances/{id}/start\|stop\|restart` | Gateway 生命周期 |
| GET/PATCH | `/instances/{id}/configuration` | 配置读写 |
| GET/POST/PUT/DELETE | `/instances/{id}/mcp/servers` | MCP CRUD |
| PUT/GET/DELETE | `/secrets/{scope}/…` | Secret（GET 不返回明文） |
| POST | `/pairings/start` | 设备配对（仅 loopback） |
| POST | `/pairings/{id}/confirm` | 确认并签发 device token |
| GET/DELETE | `/devices` | 设备列表 / 吊销 |
| GET | `/diagnostics/summary\|environment\|logs` | 诊断 |
| POST/GET/DELETE | `/runtime/backups` | 备份与恢复 |

工具链环境变量：`TOOLCHAIN_PYTHON_PATH`、`TOOLCHAIN_NODE_PATH`、`TOOLCHAIN_GIT_PATH`、`TOOLCHAIN_VENV_DIR`、`HERMES_INSTALL_DIR`。  
Windows：`HERMES_INSTALL_DIR` 默认 `D:\Programs\HermesAgent`（须在 `D:\Programs` 下）；服务态默认 `%LOCALAPPDATA%\HermesRuntime`（`RUNTIME_DATA_DIR` 空即可，不迁出）。

---

## 端点总览（按模块）

> 下列路径均相对于 **`/api/v1`**，除非注明。

### 系统 / 健康 / 服务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 存活探测（无需 Token 时可匿名） |
| GET | `/system/info` | 版本、hermes_home、sqlite_path、默认 Gateway 端口 |
| GET | `/service/status` | 服务 PID、uptime、Profile 运行计数（Windows 服务场景） |

### Profiles

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/profiles` | 列表 |
| POST | `/profiles` | 创建 |
| GET | `/profiles/{profile_id}` | 详情 |
| PATCH | `/profiles/{profile_id}` | 更新 |
| DELETE | `/profiles/{profile_id}` | 删除（204） |
| POST | `/profiles/{profile_id}/start` | 启动 Gateway |
| POST | `/profiles/{profile_id}/stop` | 停止 |
| POST | `/profiles/{profile_id}/restart` | 重启 |
| GET | `/profiles/{profile_id}/status` | 状态 |
| GET | `/profiles/{profile_id}/health` | 健康（同 refresh status） |
| GET | `/profiles/{profile_id}/events` | 任务事件 + 审计合并时间线（`?limit=1..500`） |

**ProfileCreate 示例：**

```json
{
  "name": "default",
  "type": "default",
  "gateway_port": 8642,
  "enabled": true,
  "auto_start": false
}
```

**ProfileStatusResponse：** `status` ∈ `stopped` | `starting` | `running` | `error` | `restarting`；含 `gateway_port`、`gateway_pid`、`healthy`、`message`。

### Workspace Chat（team_v1.8 / v1.8.1）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/profiles/resolve?ref=` | 解析 `ref`（id / name / `default`）→ `ResolvedProfile` |
| GET | `/profiles/{profile_id}/chat/models` | 模型列表（Gateway 未运行时可 `models:[]`, `status: gateway_not_running`） |
| GET | `/profiles/{profile_id}/chat/model-config` | 默认模型配置（可 null） |
| PUT | `/profiles/{profile_id}/chat/model-config` | 保存默认模型 |
| POST | `/profiles/{profile_id}/chat/completions` | **SSE** Chat 代理（见下） |
| POST | `/profiles/{profile_id}/chat/abort?stream_id=` | 中止指定流 |
| GET | `/profiles/{profile_id}/sessions/{session_id}/messages` | 会话历史（读 profile 目录 `state.db`） |

**ResolvedProfile：** `status` 含 `not_deployed`（本机无部署目录，非 500）。

**WorkspaceChatSendPayload：**

```json
{
  "workspace_id": "<profile_id 或 workspace uuid>",
  "session_id": "session_xxx",
  "stream_id": "optional-stream-id",
  "model": "optional-model-id",
  "messages": [{ "role": "user", "content": "hello" }],
  "attachments": ["attachment-id-1"],
  "stream": true
}
```

**Chat SSE（`text/event-stream`）统一事件：**

| event | data 字段（均含 scope） | 说明 |
|-------|-------------------------|------|
| `chat.chunk` | `stream_id`, `profile_id`, `workspace_id`, `session_id`, `content` | 文本增量 |
| `chat.tool_progress` | `name`, `label?` | 工具进度 |
| `chat.usage` | `prompt_tokens`, `completion_tokens`, `total_tokens` | Token 用量 |
| `chat.done` | 上述 + **`resolved_session_id?`**（Gateway `x-hermes-session-id`） | 流结束 |
| `chat.error` | `message`, `details?` | 流错误 |

Scope 校验：客户端应比对 `stream_id` + `profile_id` + `workspace_id` + `session_id`，避免切 Profile/Session 后串流。

**Session messages：** 返回 `{ "messages": [{ "id", "role", "content", "timestamp" }] }`；无 `state.db` 时为空数组。

### 附件（multipart）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/workspaces/{workspace_id}/attachments` | `multipart/form-data`：`profile_id`, `session_id`, `files[]` |
| DELETE | `/workspaces/{workspace_id}/attachments/{attachment_id}` | 删除附件元数据与暂存文件 |

响应含 `workspace_relative_path`、`text_preview`（文本类）；**不**在 API 中返回本机绝对路径。

### Gateways

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/gateways/{gateway_id}/health` | Gateway 健康（v1.0：`gateway_id` = `profile_id`） |
| GET | `/gateways/{gateway_id}/logs?tail=200` | 日志尾部 |

### Hermes 代理（Run API）

需 Profile Gateway `running` 且 `healthy`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/profiles/{profile_id}/models` | 代理 `GET /v1/models` |
| POST | `/profiles/{profile_id}/runs` | 代理 `POST /v1/runs` |
| GET | `/profiles/{profile_id}/runs/{run_id}` | 代理 `GET /v1/runs/{id}` |
| GET | `/profiles/{profile_id}/runs/{run_id}/events` | Run 事件 |

**HermesRunCreate：**

```json
{
  "model": "optional-model-id",
  "input": "prompt text or structured object",
  "metadata": {}
}
```

### 角色库（team_v1.4.1）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/role-library/sync` | 同步角色库（可选 body） |
| GET | `/role-library/specs` | 列出 Role spec |
| POST | `/role-library/recompile/{profile_id}` | 按 Profile 重编译角色 |
| POST | `/profiles/import-preset` | 导入预设 Profile 包 |

### 任务（v1.2）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/tasks` | 列表 |
| POST | `/tasks` | 创建 |
| GET | `/tasks/{task_id}` | 详情 |
| POST | `/tasks/{task_id}/run` | 执行（需 Gateway healthy） |
| POST | `/tasks/{task_id}/cancel` | 取消 |
| POST | `/tasks/{task_id}/bind-profile` | Body `{ "profile_id": "…" }` |
| GET | `/tasks/{task_id}/events` | 事件日志 |
| GET | `/tasks/{task_id}/events/stream` | **SSE** 任务时间线 |
| POST | `/tasks/{task_id}/request-approval` | Query：`action_type`, `risk_level?`, `requested_by?` |

任务终态后 SSE 约 **30s** 内关闭；支持 `Last-Event-ID`。

### 团队任务（v1.2）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/team-tasks/pull` | 轮询 Hub 并 ingest |
| GET | `/team-tasks` | 绑定列表 |
| GET | `/team-tasks/{binding_id}` | 单条绑定 |
| POST | `/team-tasks/{binding_id}/claim` | 认领 |
| POST | `/team-tasks/{binding_id}/sync` | 入队 Outbox 同步 |

环境变量见 `.env.example`（`AIOS_TEAM_HUB_*`、`TASK_ROUTING_JSON`）。默认 `StubTeamHubClient`。

### 任务路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/task-routing` | 有效路由规则 |
| PATCH | `/task-routing` | Body `{ "rules": { "<task_type>": { "profile_type", "require_approval" } } }` |

### 审批

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/approvals` | 最近审批 |
| GET | `/approvals/pending` | 待审 |
| GET | `/approvals/{approval_id}` | 单条 |
| POST | `/approvals/{approval_id}/approve` | 可选 `{ "approved_by": "…" }` |
| POST | `/approvals/{approval_id}/reject` | 可选 `{ "actor", "reason" }` |

### 工作空间

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/workspaces` | 列表 |
| POST | `/workspaces` | 创建 |
| GET | `/workspaces/{workspace_id}` | 详情 |
| PATCH | `/workspaces/{workspace_id}` | 更新 |
| DELETE | `/workspaces/{workspace_id}` | 删除（204） |
| POST | `/workspaces/{workspace_id}/validate-path` | Body `{ "path": "…" }` |
| POST | `/workspaces/{workspace_id}/validate-command` | Body `{ "command": "…" }` → `classification` |

### 桌面工作台

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/desktop/task-workbench/summary` | Profile/Task/Approval 计数 + Hub stub 计数 |
| GET | `/desktop/task-workbench/events/stream` | **SSE** 全局：`task_created` / `task_updated` / `approval_created` / `ping`（10s） |

---

## 桌面集成（copilot-desktop）

| 通道 | 用途 |
|------|------|
| `window.copilotServe` | 连接信息、Token、部署/预检（Main Process） |
| `window.workspaceChat` | Workspaces Chat：resolve、模型、附件、**Main 代理 SSE**（IPC） |
| Renderer 直连 serve | 会话历史 `GET .../sessions/{id}/messages`（Bearer 同 Token） |

打包运行时：`%LOCALAPPDATA%\Programs\SMC-Copilot\runtime\serve`；部署后需 `uv sync` 含 **python-multipart**。

---

## 验收检查（摘录）

**V1.0 Profile / Gateway**

1. `GET /api/v1/profiles` 有数据  
2. `POST .../start` → `running`, `healthy=true`  
3. `GET .../models` 返回 Gateway 模型  

**team_v1.8 Chat**

1. `GET /profiles/resolve?ref=default` 返回真实 `profile_id` 或 `not_deployed`  
2. `PUT .../chat/model-config` 后刷新仍保留  
3. `POST .../chat/completions` SSE 含 `chat.chunk` / `chat.done`；`chat.done` 可含 `resolved_session_id`  
4. `POST /workspaces/{id}/attachments` multipart 成功；超大文件 `ATTACHMENT_TOO_LARGE`  
5. `GET .../sessions/{sid}/messages` 有 `state.db` 时非空  

**V1.2 任务**

1. `GET /desktop/task-workbench/summary`  
2. `GET /tasks/{id}/events/stream` 有事件流  

**V1.5 Endpoint Sync（Stub Service Center）**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/endpoint/status` | 注册与 sync 状态 |
| POST | `/api/v1/endpoint/enrollment/start` | 开始 enrollment，生成设备密钥 |
| POST | `/api/v1/endpoint/enrollment/complete` | 完成注册 |
| POST | `/api/v1/endpoint/enrollment/revoke` | 吊销（不停本地 Chat） |
| GET | `/api/v1/endpoint/inventory` | 脱敏库存 |
| GET/POST | `/api/v1/sync/status`、`/sync/now` | 同步状态 / 立即拉取 |
| GET | `/api/v1/sync/channels`、`/resources`、`/conflicts`、`/dead-letters` | 渠道与资源 |
| GET/POST | `/api/v1/remote-tasks`、`/{id}/accept|reject|cancel` | Remote Task v2 |
| GET/POST | `/api/v1/experience/evidence`、`/candidates`、`/{id}/submit` | 经验证据与 StaffDeck 提交 |

默认 `AIOS_SERVICE_CENTER_USE_STUB=true`。Capability 含 `endpoint.enrollment`、`sync.desired-state`、`tasks.remote.v2`、`experience.staffdeck.submit` 等（apiVersion `1.2`）。

---

## 文档索引

- 目录与模块地图：[`INDEX.md`](INDEX.md)  
- Agent 规则：[`AGENT.md`](../AGENT.md)
