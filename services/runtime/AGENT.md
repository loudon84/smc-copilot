# AGENTS.md

## 项目定位

本仓库实现 `smc-copilot-serve`，作为 `smc-copilot-desktop` 的本地控制面服务（v1.3 起亦称 **Hermes Runtime Service**）。

本服务不是通用后端。它管理本机 Hermes Agent 运行时、多 Profile Gateway、团队任务、审批门控、工作空间安全策略，以及 Electron / React 桌面端消费的 API。

主架构路径：

```text
Electron Desktop UI
  -> smc-copilot-serve / HermesLocalService
  -> Hermes Gateway Profiles
  -> Team Task Hub / Workspace / Local Tools
```

## 不可违背的边界

1. Electron Renderer 不得直接管理 Hermes 进程。
2. Electron Renderer 不得直接读写 `~/.hermes`。
3. Electron Renderer 不得直接执行 Shell 命令。
4. 所有本机运行时动作必须经 `smc-copilot-serve` API。
5. 所有 Hermes Gateway 访问必须经 `HermesGatewayClient` 或 `integrations/hermes/` 下的适配器。
6. 所有高风险动作必须经 Approval Runtime 与 Workspace Guard。
7. 不得硬编码用户密钥、模型 API Key、工作空间路径或私有 Git URL。
8. 变更公共 API 契约时，必须同步更新 schemas、测试与文档。

## 技术栈

后端：

- Python 3.12
- FastAPI
- Uvicorn
- Pydantic v2 与 pydantic-settings
- SQLAlchemy 2.x
- Alembic
- SQLite（本地优先的桌面状态）
- httpx（出站 HTTP）
- `python-multipart`（FastAPI `Form` / `UploadFile` 必需，如工作空间聊天附件）
- asyncio subprocess 与 psutil（进程监管）
- pytest 与 pytest-asyncio

桌面集成：

- Electron Main Process 可 spawn `copilot-serve`，并暴露 `window.copilotServe`（仅连接）。
- Renderer 使用 `X-Copilot-Desktop-Token` 直接调用 `http://127.0.0.1:8765/api/v1/*`。
- v1.3：全局/任务 SSE 位于 `/api/v1/desktop/task-workbench/events/stream` 与 `/api/v1/tasks/{id}/events/stream`。
- v1.3.1 hotfix：纯 ASGI CORS（`build_asgi_app`）、桌面 spawn 时 `COPILOT_REQUIRE_TOKEN=true`、同步终端 `append_event`、动态 SSE `Access-Control-Allow-Origin`。
- Runtime v1.3：生产期望 Desktop 连接常驻 Runtime，不默认 spawn；鉴权优先 `Authorization: Bearer <device-token>`。

## 期望仓库布局

```text
src/                                    # 扁平源码根（dev-mode-dirs / pythonpath）
  __init__.py
  main.py                               # 入口: main:app / smc-copilot-serve CLI
  app.py                                # FastAPI 应用工厂
  version.py
  core/
    config.py
    constants.py
    enums.py
    errors.py
    lifecycle.py
    logging.py
    task_routing.py
    capabilities.py
    runtime_enums.py
    runtime_errors.py
  api/
    deps.py
    router.py
    middleware/
      cors_asgi.py
      error_envelope.py
    v1/
      health.py
      system.py
      profiles.py
      runtime.py
      instances.py
      pairings.py
      chat.py
      attachments.py
      gateways.py
      hermes_runs.py
      role_library.py
      service.py
      tasks.py
      team_tasks.py
      task_routing.py
      approvals.py
      workspaces.py
      desktop_workbench.py
  db/
    base.py
    session.py
    models/
      __init__.py
      profile.py
      runtime.py
      chat_settings.py
      chat_attachment.py
      role_spec.py
      local_task.py
      task_related.py
      workspace_db.py
    repositories/
      profile_repo.py
      runtime_repo.py
      v12_repos.py
  schemas/
    common.py
    profile.py
    runtime.py
    profile_events.py
    gateway.py
    hermes.py
    chat.py
    attachments.py
    role_library.py
    system.py
    v12_tasks.py
  services/
    profile_service.py
    gateway_supervisor.py
    hermes_gateway_client.py
    runtime_status_service.py
    runtime_job_service.py
    installation_service.py
    instance_service.py
    update_service.py
    pairing_service.py
    task_runtime.py
    task_state_machine.py
    task_sync_service.py
    task_routing_registry.py
    approval_service.py
    workspace_guard.py
    workbench_summary.py
  integrations/
    hermes/
      client.py
      cli_adapter.py
      config_writer.py
      profile_loader.py
    team_hub/
      client.py
      dto.py
      errors.py
  runtime/
    gateway_process.py
    port_allocator.py
    platform_paths.py
    environment_probe.py
    artifact_downloader.py
    checksum_verifier.py
    executable_policy.py
  local_service/
    windows_service.py
    windows_user_daemon.py
  workers/
    v12_workers.py
    runtime_job_worker.py
  utils/
    paths.py

migrations/
tests/
docs/
scripts/
prd/
```

## 模块职责

### `core/`

横切配置、日志、生命周期、错误处理与安全辅助。

### `api/v1/`

仅 FastAPI 路由。路由必须保持薄壳，禁止在路由中写业务逻辑。

### `schemas/`

Pydantic 请求/响应模型。使用显式 DTO，禁止直接返回 ORM 模型。

### `db/models/`

仅 SQLAlchemy 模型。

### `db/repositories/`

数据访问层。仓库不得调用 Hermes Gateway、Shell、文件系统变更或远程 Team Hub API。

### `services/`

业务编排层。

**team_v1.8 Workspace Chat：** `profile_ref_resolver.py`（ref→`profile_id`，含 `not_deployed`）、`chat_model_service.py`、`chat_stream_service.py`（Gateway SSE 代理）、`attachment_service.py`、`chat_session_service.py`（读 profile `state.db` 消息）。路由：`api/v1/chat.py`、`api/v1/attachments.py`；表 `profile_chat_settings`、`chat_attachments`。

**team_v1.8.1 hotfix：** `chat.done` 携带 `resolved_session_id`；`GET .../sessions/{session_id}/messages`；`require_deployed_profile`；完整 PRD 错误码 factory（`core/errors.py`）。

**Runtime v1.3：** `runtime_status_service.py`、`runtime_job_service.py`、`installation_service.py`、`instance_service.py`、`pairing_service.py` 等。Runtime Core 不得依赖 Task / Team Hub 模块。

### `integrations/hermes/`

Hermes Profile 加载、配置生成、Gateway HTTP 客户端、Run 事件流、CLI 适配器。

### `integrations/team_hub/`

远程任务 Hub 客户端与同步逻辑。

### `integrations/local_shell/`（规划中）

命令执行与命令策略。Shell 执行必须经 Workspace Guard 与 Approval Runtime 中介。当前 Workspace Guard 实现在 `services/workspace_guard.py`，local_shell 集成待实现。

### `runtime/`

Profile/Instance 运行时状态、Gateway 进程注册、端口分配、心跳、锁、安装布局与 Artifact 下载。

### `workers/`

后台轮询、Gateway 健康检查、Runtime Job、重试与清理。

## 开发命令

优先使用 `uv`（若仓库已采用）。否则使用项目已登记的包管理器。

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --app-dir src --reload --host 127.0.0.1 --port 8765
uv run pytest
uv run ruff check .
uv run mypy src
```

### 数据库 / 迁移

Alembic 链：`0001`（profiles）→ `0002`（v1.2 任务表）→ `001_role_spec`（展示字段 + `profile_role_specs`）→ `002_team_v18_chat`（`profile_chat_settings`、`chat_attachments`）→ `003_runtime_core`（Runtime 表与 instances 迁移）。

| 场景 | 命令 |
|------|------|
| 全新 SQLite | `uv run alembic upgrade head` |
| 已有 v1.2（`0002`）库但缺 v1.4 列 | `uv run alembic upgrade head` |
| 已手动应用 v1.4 role_spec DDL | `uv run alembic stamp 001_role_spec` |
| 空库不得跳过 `0001`/`0002` — 执行完整 `upgrade head`，不要只跑 `001_role_spec` |

生产不得依赖测试专用 `init_db()`；仅使用 Alembic（`core/lifecycle.py`）。

**角色源布局：** 编译文件位于 `skills/role-source/agency-agents-zh/<repo-relative-path>`。v1.4.1 前以扁平 `skills/role-source/*.md` 安装的 Profile，应执行 **Recompile Role** 或重新安装预设。

### team_v1.4.1 Windows 手工验证

1. `uv run alembic upgrade head`
2. Desktop：安装预设 `team_v1.4`（可选覆盖）
3. 启动六个专家 Profile（9601–9641）或 `startAll`
4. Curl `http://127.0.0.1:9601/health` … `9641/health` — 全部 OK
5. 停止其中一个 Profile；其余保持健康
6. `GET /api/v1/profiles/{id}/events` — 含 `profile_started` / `profile_stopped` 审计行

若项目在 Windows 使用 PowerShell 脚本，优先：

```powershell
scripts/smoke-test.ps1
scripts/runtime-smoke-test-windows.ps1
```

不要臆造命令。运行任何内容前先检查 `pyproject.toml`、`README.md` 与 `scripts/`。

## 编码规则

1. 使用带类型的 Python。公共函数补充类型注解。
2. HTTP 客户端、流处理与进程编排在适当时使用 async。
3. 避免全局可变运行时状态。使用注册表与生命周期管理的依赖。
4. 所有 API 响应必须使用 Pydantic schemas。
5. 所有数据库 schema 变更需要 Alembic migration。
6. 每次服务变更应包含单元测试或集成测试。
7. 长循环必须支持取消。
8. 进程监管必须处理 start、stop、restart、崩溃检测与日志捕获。
9. Profile、Gateway、Task、Approval、Run、Instance、Job 状态使用显式枚举。
10. 兼顾 Windows 10 Home 兼容性。

## 安全规则

在实现会执行命令、修改文件、变更 Git 状态或部署容器的功能前：

1. 校验工作空间策略。
2. 检查命令允许/拒绝列表。
3. 判断是否需要审批。
4. 记录审计日志。
5. 尽可能使执行幂等。
6. 返回结构化错误。

以下场景不得绕过 `WorkspaceGuard` 或 `ApprovalService`：

- Shell 命令执行
- 在允许工作空间路径之外写文件
- `git commit`、`git push`、`git reset`、`git clean`
- Docker start / stop / compose
- Hermes Profile 配置变更
- 远程任务附件下载

## API 设计规则

使用以下路由分组：

```text
/api/v1/health
/api/v1/system
/api/v1/runtime
/api/v1/instances
/api/v1/pairings
/api/v1/secrets
/api/v1/profiles
/api/v1/profiles/resolve
/api/v1/profiles/{profile_id}/chat/models
/api/v1/profiles/{profile_id}/chat/model-config
/api/v1/profiles/{profile_id}/chat/completions
/api/v1/workspaces/{workspace_id}/attachments
/api/v1/gateways
/api/v1/profiles/{profile_id}/models
/api/v1/profiles/{profile_id}/runs
/api/v1/tasks
/api/v1/approvals
/api/v1/workspaces
/api/v1/audit
```

**Profile Gateway 生命周期（team_v1.8.3）：** `POST .../start|stop|restart` — start 失败将 DB 从 `starting` 置 `error` 并返回 503 `gateway_error`；stop 释放端口监听；restart 在 stop 后等待端口空闲再 start。`GET .../resolve` 在 `starting` 时返回 `healthy=false`。

规则：

1. 保持路由命名稳定。
2. 返回带机器可读 code 的结构化错误。
3. 错误响应不得泄露本机文件系统密钥。
4. 可能增长的列表接口使用分页。
5. 通过 SSE 兼容端点转发 Hermes Run 事件。

## Hermes 集成规则

Hermes Gateway 行为必须隔离在 `HermesGatewayClient` / CLI Adapter 之后。

客户端需支持的方法：

```python
list_models(profile_id: str) -> list[HermesModel]
create_run(profile_id: str, request: CreateRunRequest) -> HermesRun
stream_run_events(profile_id: str, run_id: str) -> AsyncIterator[HermesRunEvent]
get_run(profile_id: str, run_id: str) -> HermesRun
cancel_run(profile_id: str, run_id: str) -> None
```

禁止在 API 路由中直接调用 Hermes Gateway URL。禁止 `shell=True`。

## Gateway Supervisor 规则

Gateway 生命周期必须支持：

```text
STOPPED -> STARTING -> RUNNING -> ERROR -> RESTARTING -> RUNNING
```

实现要求：

1. 每个 Profile/Instance 必须有稳定 Gateway 端口。
2. 默认 Profile 通常使用 `8642`，除非另行配置。
3. 其它 Profile 使用分配端口，且不得冲突。
4. 某个 Profile 崩溃不得终止其它 Profile。
5. 日志按 Profile/Instance 隔离。
6. 健康检查不得阻塞 API 事件循环。
7. 启动路径优先使用 `RuntimeVersion.executable_path`，以参数数组拼装命令。

## Team Task Runtime 规则

远程任务同步应从轮询开始。除非明确要求，否则不要引入消息队列。

任务状态模型：

```text
REMOTE_ASSIGNED
LOCAL_CREATED
WAITING_APPROVAL
APPROVED
RUNNING
NEED_HUMAN_INPUT
COMPLETED
FAILED
CANCELLED
SYNCED
```

规则：

1. 使用 `remote_task_id + assignment_id + local_attempt_id` 保证幂等。
2. 执行前先 Claim。
3. 每个任务绑定目标 Profile。
4. 持久化所有状态迁移。
5. 将结果同步回 Team Task Hub。
6. 同步失败必须可重试。

## 测试要求

对任何非平凡变更，增加或更新测试。

按模块的最低覆盖：

- Profile Runtime：Profile CRUD、配置路径处理、端口分配。
- Gateway Supervisor：带 mock 子进程的 start/stop/restart 状态迁移（**team_v1.8.3**：start 失败恢复 DB 状态；stop 释放端口；restart 等待端口空闲；见 `tests/api/test_profile_start_failure_recovery.py`）。
- Hermes Client：带 mock HTTP 的 models、runs、stream events。
- Task Runtime：轮询、claim、本地创建、幂等、同步。
- Approval Runtime：pending/approve/reject 流程。
- Workspace Guard：允许列表、拒绝列表、路径穿越、命令策略。
- Runtime Core：Job 锁、capabilities、安装/配对/MCP 策略（见 `tests/test_runtime_core.py`）。

定稿前先跑最小相关测试集，时间允许再跑更广测试。

## 文档规则

变更架构、API 契约、运行时行为或部署脚本时必须更新文档。

**描述性文字只允许使用简体中文**；文件路径、API、类名、环境变量、代码片段等技术标识保持原文。

期望文档：

```text
docs/INDEX.md                      # 目录地图 + 模块索引（与代码同步）
docs/api-contract.md               # 全量 HTTP 端点 + Chat SSE / 错误码
docs/runtime-architecture.md       # Runtime 架构
docs/runtime-installation.md       # 安装与工具链
docs/runtime-versioning.md         # 版本管理
docs/runtime-security.md           # 安全
docs/runtime-desktop-contract.md   # Desktop 契约
README.md                          # 开发与部署说明
```

## Pull Request / 变更摘要格式

每次完成的 Agent 任务应产出：

```text
Summary:
- 改了什么
- 为什么改
- 主要涉及文件

Validation:
- 执行的命令
- 测试通过 / 失败
- 手工检查

Risk:
- 运行时影响
- 迁移影响
- Windows 影响
- 安全影响

Follow-ups:
- 剩余工作
```

## 不确定时

不要猜测外部 API 契约、Hermes CLI 参数、Windows 服务细节或数据库 schema。

应改为：

1. 检查现有代码与文档。
2. 搜索仓库引用。
3. 若实现细节不稳定，增加小型适配器接口。
4. 用测试锁定行为。
