# smc-copilot-serve — 文档索引

> 本地控制面服务：Hermes Gateway 多 Profile、任务运行时、审批门控、工作空间安全策略、**Workspaces Chat**（team_v1.8）、**Hermes Runtime Service**（v1.3）。
> 本索引与 [`AGENT.md`](../AGENT.md) 对齐，供 Agent / 开发者按需加载。
> **文档语言：** 描述性文字仅使用简体中文；文件路径、API、类名、环境变量、代码片段保持原文。

---

## 一、项目定位

`smc-copilot-serve`（包名 `smc-copilot-serve`）面向 **smc-copilot-desktop** 的本地控制面，职责：

| 域 | 说明 |
|---|---|
| Profile / Gateway | CRUD、启停/重启、健康、端口分配、审计事件 |
| Hermes 代理 | 模型列表、Run 创建/查询/事件流 |
| **Workspace Chat（v1.8）** | Profile resolve、默认模型、附件、Chat SSE 代理、会话历史（`state.db`） |
| 本地任务（v1.2） | 创建/执行/取消、状态机、SSE 时间线 |
| 团队任务（v1.2） | Team Hub 拉取/认领、绑定、Outbox 同步 |
| 审批 / 工作空间 | 审批流、路径与命令策略（Workspace Guard） |
| 角色库（v1.4.1） | Role spec 同步、预设导入、按 Profile 重编译 |
| 桌面工作台 | 摘要计数、全局 SSE 事件流 |

**不负责**：LLM 推理实现、Gateway 进程内部逻辑、Electron UI 渲染。

**架构路径**（与 AGENT.md 一致）：

```text
Electron Desktop（Main 拉起 serve；Renderer 调 :8765）
  → smc-copilot-serve / 可选 Windows Service
  → Hermes Gateway（按 Profile 端口）
  → Team Task Hub / Workspace / 本地工具（经 Guard + Approval）
```

---

## 二、技术栈

| 层 | 选型 |
|---|---|
| 语言 | Python 3.12（`>=3.12,<3.13`） |
| API | FastAPI + Uvicorn |
| DTO | Pydantic v2 + pydantic-settings |
| ORM / DB | SQLAlchemy 2.x async + SQLite（aiosqlite） |
| 迁移 | Alembic |
| 出站 HTTP | httpx |
|  multipart 上传 | **python-multipart**（附件 `Form`/`UploadFile` 必需） |
| 进程 | asyncio subprocess + psutil |
| 测试 | pytest / pytest-asyncio |
| 包管理 | uv |

**桌面集成要点**：

- 默认 `http://127.0.0.1:8765`，前缀 `/api/v1`
- `COPILOT_REQUIRE_TOKEN=true` 时需头 `X-Copilot-Desktop-Token`（`/api/v1/health` 等白名单除外）
- SSE 经纯 ASGI CORS 包装（`build_asgi_app`），见 v1.3.1 hotfix

---

## 三、工程目录结构（当前）

```text
copilot-serve/
├── src/                              # 扁平源码根（pythonpath / --app-dir src）
│   ├── main.py                       # 入口：uvicorn、smc-copilot-serve CLI
│   ├── app.py                        # FastAPI 工厂 + 异常处理 + CORS 包装
│   ├── version.py
│   ├── api/
│   │   ├── deps.py                   # 依赖注入、桌面 Token 校验
│   │   ├── router.py                 # 聚合 /api/v1
│   │   ├── middleware/
│   │   │   └── cors_asgi.py          # 纯 ASGI CORS（SSE 安全）
│   │   └── v1/
│   │       ├── health.py
│   │       ├── system.py
│   │       ├── service.py            # Windows 服务状态
│   │       ├── profiles.py
│   │       ├── chat.py               # team_v1.8 Workspace Chat
│   │       ├── attachments.py
│   │       ├── gateways.py
│   │       ├── hermes_runs.py
│   │       ├── role_library.py       # v1.4.1 角色库
│   │       ├── tasks.py
│   │       ├── team_tasks.py
│   │       ├── task_routing.py
│   │       ├── approvals.py
│   │       ├── workspaces.py
│   │       └── desktop_workbench.py
│   ├── core/                         # config / errors / lifecycle / logging / task_routing
│   ├── db/
│   │   ├── models/                   # profile, local_task, workspace, chat_*, role_spec, …
│   │   └── repositories/
│   ├── schemas/                      # Pydantic DTO（含 chat.py / attachments.py）
│   ├── services/                     # 业务编排（见下表）
│   ├── integrations/
│   │   ├── hermes/                   # Gateway HTTP、config_writer、profile_loader
│   │   └── team_hub/                 # 远程任务 Hub 客户端（Stub / HTTP）
│   ├── runtime/                      # gateway_process、port_allocator
│   ├── local_service/                # 可选 Windows 服务 CLI / 状态
│   ├── workers/                      # v12 后台轮询与健康检查
│   └── utils/
├── migrations/versions/
│   ├── 0001_create_profiles.py
│   ├── 0002_v12_tables.py
│   ├── 001_add_role_spec_and_profile_fields.py   # revision: 001_role_spec
│   └── 20260525_team_v18_workspace_chat.py       # revision: 002_team_v18_chat
├── tests/
│   ├── api/
│   │   ├── test_workspace_chat.py
│   │   └── test_workspace_attachments.py
│   ├── test_v1_acceptance.py
│   ├── test_v12_integration.py
│   └── …
├── docs/
│   ├── INDEX.md                      # 本文件
│   └── api-contract.md               # HTTP 端点契约
├── scripts/                          # mock_hermes_gateway、smoke-test*.ps1
├── prd/
├── AGENT.md
├── pyproject.toml
└── alembic.ini
```

---

## 四、分层职责（与 AGENT.md 一致）

| 目录 | 职责 |
|---|---|
| `api/v1/` | 薄路由；禁止写业务逻辑 |
| `schemas/` | 请求/响应 DTO；禁止直接返回 ORM |
| `db/models/` | SQLAlchemy 模型 |
| `db/repositories/` | 数据访问；禁止调 Gateway / Shell / Team Hub |
| `services/` | 业务编排 |
| `integrations/hermes/` | Gateway 与配置读写 |
| `integrations/team_hub/` | 远程任务同步 |
| `runtime/` | 进程注册、端口、心跳 |
| `workers/` | 轮询、重试、清理 |

### 4.x `services/` 关键模块

| 模块 | 说明 |
|---|---|
| `profile_service.py` | Profile CRUD |
| `gateway_supervisor.py` | Gateway 生命周期 |
| `hermes_gateway_client.py` | Hermes Run/模型代理 |
| `profile_ref_resolver.py` | `ref` → `profile_id`（id/name/default），`not_deployed` |
| `chat_model_service.py` | 模型列表 + 默认模型持久化 |
| `chat_stream_service.py` | Gateway SSE → 统一 `chat.*` 事件 |
| `attachment_service.py` | 附件校验、落盘、上下文注入 |
| `chat_session_service.py` | 读 Profile 目录下 `state.db` 会话消息 |
| `task_runtime.py` / `task_sync_service.py` | 本地任务与 Hub 同步 |
| `approval_service.py` / `workspace_guard.py` | 审批与路径/命令策略 |
| `role_library_service.py` | 角色库同步与预设导入 |
| `workbench_summary.py` / `workbench_event_stream.py` | 桌面工作台 |

---

## 五、已实现 API 模块（路由文件 → 前缀）

完整 Method/Path 见 [`api-contract.md`](api-contract.md)。

| 模块 | 路由文件 | API 前缀 / 路径特征 | 数据表 / 外部依赖 |
|---|---|---|---|
| Health | `health.py` | `GET /api/v1/health` | — |
| System | `system.py` | `GET /api/v1/system/info` | — |
| Service | `service.py` | `GET /api/v1/service/status` | `profiles` 计数 |
| **Workspace Chat** | `chat.py` | `/profiles/resolve`、`/profiles/{id}/chat/*`、`/profiles/{id}/sessions/{sid}/messages` | `profile_chat_settings`；Gateway SSE |
| **Attachments** | `attachments.py` | `POST/DELETE /api/v1/workspaces/{id}/attachments` | `chat_attachments` |
| Profiles | `profiles.py` | `/api/v1/profiles` + start/stop/restart/status/health/events | `profiles` |
| Gateways | `gateways.py` | `/api/v1/gateways/{id}/health|logs` | Gateway 进程 |
| Hermes proxy | `hermes_runs.py` | `/api/v1/profiles/{id}/models|runs` | Gateway HTTP |
| Role library | `role_library.py` | `/role-library/*`、`/profiles/import-preset` | `profile_role_specs` |
| Tasks | `tasks.py` | `/api/v1/tasks` + SSE | `local_tasks`, `task_events` |
| Team tasks | `team_tasks.py` | `/api/v1/team-tasks` | `team_task_bindings`, `sync_outbox` |
| Task routing | `task_routing.py` | `GET|PATCH /api/v1/task-routing` | 内存 + 环境变量 |
| Approvals | `approvals.py` | `/api/v1/approvals` | `approvals` |
| Workspaces | `workspaces.py` | `/api/v1/workspaces` + validate | `workspaces` |
| Desktop workbench | `desktop_workbench.py` | `/api/v1/desktop/task-workbench/*` | 聚合 + SSE |
| Endpoint (v1.5) | `endpoint.py` | `/api/v1/endpoint/*` | `endpoint_*`；Service Center |
| Sync (v1.5) | `sync.py` | `/api/v1/sync/*` | sync_* / delivery_outbox / desired_state_* |
| Remote tasks (v1.5) | `remote_tasks.py` | `/api/v1/remote-tasks/*` | `remote_task_*`；Task Hub Deprecated |
| Experience (v1.5) | `experience.py` | `/api/v1/experience/*` | experience_*；StaffDeck via Center |

---

## 六、数据库迁移链

| Revision | 文件 | 内容 |
|---|---|---|
| `0001` | `0001_create_profiles.py` | `profiles` |
| `0002` | `0002_v12_tables.py` | 任务、审批、工作空间、审计等 v1.2 表 |
| `001_role_spec` | `001_add_role_spec_and_profile_fields.py` | Profile 展示字段 + `profile_role_specs` |
| `002_team_v18_chat` | `20260525_team_v18_workspace_chat.py` | `profile_chat_settings`、`chat_attachments` |
| `003_runtime_core` | `20260723_runtime_core.py` | Runtime 表（versions/jobs/instances/devices 等）+ profiles→instances 数据迁移 |

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --app-dir src --reload --host 127.0.0.1 --port 8765
```

生产环境仅使用 Alembic（`core/lifecycle.py`），勿依赖测试用 `init_db()`。

---

## 七、开发命令（摘自 AGENT.md）

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --app-dir src --reload --host 127.0.0.1 --port 8765
uv run pytest
uv run ruff check .
```

Windows 冒烟：`scripts/smoke-test.ps1` / `scripts/smoke-test-windows.ps1`（若存在）。

---

## 八、规划 / 未实现

| 项 | 说明 |
|---|---|
| `/api/v1/audit` 查询 API | 审计写入已有（如 Profile events），独立列表 API 未实现 |
| `integrations/local_shell/` | Shell 执行经 Workspace Guard + Approval；目录规划中 |

---

## 九、相关文档

| 文档 | 用途 |
|---|---|
| [`AGENT.md`](../AGENT.md) | Agent 工作手册、边界、编码与安全规则 |
| [`api-contract.md`](api-contract.md) | **全量 HTTP 端点清单**与 Chat SSE/错误码 |
| [`runtime-architecture.md`](runtime-architecture.md) | Hermes Runtime 架构与边界 |
| [`runtime-installation.md`](runtime-installation.md) | Hermes 安装与工具链路径 |
| [`runtime-versioning.md`](runtime-versioning.md) | 版本管理、更新与回滚 |
| [`runtime-security.md`](runtime-security.md) | 鉴权、Secret、执行策略 |
| [`runtime-desktop-contract.md`](runtime-desktop-contract.md) | Desktop 与 Runtime 契约 |
| [`runtime-acceptance-v1.3.md`](runtime-acceptance-v1.3.md) | v1.3 验收记录 |
| [`../prd/ver1.3-runtime-service.md`](../prd/ver1.3-runtime-service.md) | Runtime Service 改造 PRD |
| [`.env.example`](../.env.example) | 环境变量 |

---

## 十、文档语言规则

项目文档的**描述性文字只允许使用简体中文**。文件路径、API、类名、环境变量、代码片段等技术标识保持原文。

新增模块或变更公共 API 时**必须**同步：

1. 本文件「目录结构」「已实现 API 模块」「迁移链」
2. [`api-contract.md`](api-contract.md) 端点表
3. [`AGENT.md`](../AGENT.md) 的 layout / API design rules（若架构级变更）
4. 相关 `docs/runtime-*.md`（若涉及 Runtime）
