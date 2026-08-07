下面按 `smc-copilot-serve` 作为 **smc-copilot-desktop 的本地服务层 / Local Control Plane** 来规划。依据是当前架构文档覆盖的模块：`smc-copilot-desktop 产品定位`、`HermesLocalService 本地控制面`、`多 Profile Hermes Gateway Supervisor`、`Team Task Runtime / 任务监听服务`、`人工审批闭环`、`Workspace 安全策略`、`ai-os-full / Team Task Hub 集成方案` 等。

---

# 1. 项目定位

`smc-copilot-serve` 不建议设计成普通 Web 后端，而应定义为：

> **smc-copilot-desktop 的本地控制面服务，负责 Hermes Agent、多 Profile Gateway、任务监听、审批流、Workspace 安全、桌面端 API 的统一封装。**

它位于：

```txt
Electron Desktop UI
        ↓
smc-copilot-serve / HermesLocalService
        ↓
Hermes Gateway Profiles / Local Tools / Team Task Hub / Workspace
```

核心职责：

| 模块                 | 职责                                                 |
| ------------------ | -------------------------------------------------- |
| Local API          | 给 Electron / React UI 提供本地 HTTP API                |
| Gateway Supervisor | 管理多个 Hermes Profile 的启动、停止、重启、状态检测                 |
| Profile Runtime    | 维护 profile 配置、端口、模型、环境变量、状态                        |
| Task Listener      | 接收 ai-os-full / 同事 Agent 分派过来的任务                   |
| Approval Runtime   | 对代码执行、文件修改、部署动作进行人工审批                              |
| Workspace Guard    | 限制 Agent 可访问目录、命令、文件写入范围                           |
| Hermes Client      | 统一访问 Hermes Gateway `/v1/models`、`/v1/runs`、events |
| Audit Log          | 记录任务、审批、命令、文件变更、Gateway 状态                         |

---

# 2. 总体技术栈

## 2.1 后端服务栈

| 层级              | 技术选型                                      | 说明                                |
| --------------- | ----------------------------------------- | --------------------------------- |
| Runtime         | Python 3.12                               | 与现有 ai-os-facade 方向一致             |
| Web API         | FastAPI                                   | 本地 API、OpenAPI、类型清晰               |
| ASGI Server     | Uvicorn                                   | 本地服务启动简单                          |
| DTO / Config    | Pydantic v2 / pydantic-settings           | profile、任务、审批、系统配置                |
| HTTP Client     | httpx                                     | 调用 Hermes Gateway / Team Task Hub |
| DB ORM          | SQLAlchemy 2.x                            | 管理 SQLite / 后续 Postgres           |
| Migration       | Alembic                                   | 本地 schema 版本管理                    |
| Local DB        | SQLite                                    | Desktop 本地优先，安装成本低                |
| Process Control | asyncio subprocess + psutil               | 管理 Hermes Gateway 子进程             |
| Background Jobs | APScheduler / asyncio TaskGroup           | 任务监听、心跳、状态巡检                      |
| SSE / Streaming | sse-starlette / FastAPI StreamingResponse | 转发 Hermes run events              |
| Logging         | structlog / loguru                        | 本地日志、任务日志、审计日志                    |
| Test            | pytest + pytest-asyncio                   | 单元测试、服务测试                         |

---

## 2.2 桌面端对接栈

| 层级               | 技术选型                         | 说明                        |
| ---------------- | ---------------------------- | ------------------------- |
| Desktop Shell    | Electron                     | smc-copilot-desktop 主壳          |
| Renderer         | React + TypeScript           | 页面 UI                     |
| UI               | shadcn/ui + Tailwind         | 管理台、任务面板、profile 页面       |
| IPC              | Electron IPC                 | 只做窗口能力、系统能力               |
| Local API Client | fetch / axios / typed client | 调用 `smc-copilot-serve`     |
| Preload          | preload API 白名单              | 不让 Renderer 直接访问 Node API |

原则：

```txt
Renderer 不直接管理 Hermes 进程
Renderer 不直接读写 ~/.hermes
Renderer 不直接执行 shell
所有动作走 smc-copilot-serve API
```

---

## 2.3 Hermes 集成栈

| 集成对象           | 方案                                                 |
| -------------- | -------------------------------------------------- |
| Hermes Agent   | 由 smc-copilot-serve 启动与管理                           |
| Hermes Gateway | 每个 Profile 独立端口                                    |
| Profile Config | 读取 / 写入 `~/.hermes/profiles/<profile>/config.yaml` |
| Gateway API    | `/v1/models`、`/v1/runs`、`/v1/runs/{run_id}/events` |
| 多 Profile      | default / writer / finance / coding / research     |
| 模型配置           | 统一从 profile config 或服务端下发配置生成                      |

---

## 2.4 团队协作集成栈

| 模块            | 技术选型                                       |
| ------------- | ------------------------------------------ |
| Team Task Hub | ai-os-full 后台服务                            |
| 本地监听          | Pull Polling 优先，后续 SSE / WebSocket         |
| 任务状态同步        | 本地 SQLite + 远端 Hub 双写状态                    |
| 幂等处理          | task_id + assignment_id + local_attempt_id |
| 审批            | 本地审批状态 + 远端同步                              |
| 冲突处理          | 本地锁 + 任务 claim 机制                          |

第一阶段不建议一开始做复杂消息队列。先用：

```txt
smc-copilot-serve 定时 polling Team Task Hub
↓
发现分派给当前用户 / 当前设备 / 当前 Agent 的任务
↓
写入本地 SQLite
↓
等待用户确认或自动执行
↓
调用对应 Hermes Profile Gateway
↓
同步状态回 Team Task Hub
```

后续再扩展：

```txt
Polling → SSE → WebSocket → MQ / Redis Stream
```

---

# 3. 推荐项目结构

建议采用单体服务清晰分层，不要一开始拆成过多微服务。

```txt
smc-copilot-serve/
├─ README.md
├─ pyproject.toml
├─ uv.lock
├─ .env.example
├─ alembic.ini
├─ scripts/
│  ├─ dev.ps1
│  ├─ dev.sh
│  ├─ install-service-windows.ps1
│  ├─ uninstall-service-windows.ps1
│  ├─ start-local.ps1
│  └─ smoke-test.sh
│
├─ src/
│  └─ copilot_serve/
│     ├─ __init__.py
│     ├─ main.py
│     ├─ app.py
│     │
│     ├─ core/
│     │  ├─ config.py
│     │  ├─ logging.py
│     │  ├─ errors.py
│     │  ├─ constants.py
│     │  ├─ lifecycle.py
│     │  └─ security.py
│     │
│     ├─ api/
│     │  ├─ router.py
│     │  ├─ deps.py
│     │  └─ v1/
│     │     ├─ health.py
│     │     ├─ system.py
│     │     ├─ profiles.py
│     │     ├─ gateways.py
│     │     ├─ hermes_runs.py
│     │     ├─ tasks.py
│     │     ├─ approvals.py
│     │     ├─ workspace.py
│     │     ├─ audit.py
│     │     └─ settings.py
│     │
│     ├─ db/
│     │  ├─ session.py
│     │  ├─ base.py
│     │  ├─ models/
│     │  │  ├─ profile.py
│     │  │  ├─ gateway.py
│     │  │  ├─ task.py
│     │  │  ├─ approval.py
│     │  │  ├─ workspace.py
│     │  │  ├─ audit_log.py
│     │  │  └─ system_setting.py
│     │  └─ repositories/
│     │     ├─ profile_repo.py
│     │     ├─ gateway_repo.py
│     │     ├─ task_repo.py
│     │     ├─ approval_repo.py
│     │     └─ audit_repo.py
│     │
│     ├─ schemas/
│     │  ├─ common.py
│     │  ├─ profile.py
│     │  ├─ gateway.py
│     │  ├─ hermes.py
│     │  ├─ task.py
│     │  ├─ approval.py
│     │  ├─ workspace.py
│     │  └─ audit.py
│     │
│     ├─ services/
│     │  ├─ profile_service.py
│     │  ├─ gateway_supervisor.py
│     │  ├─ hermes_gateway_client.py
│     │  ├─ task_runtime.py
│     │  ├─ task_listener.py
│     │  ├─ approval_service.py
│     │  ├─ workspace_guard.py
│     │  ├─ audit_service.py
│     │  └─ system_service.py
│     │
│     ├─ integrations/
│     │  ├─ hermes/
│     │  │  ├─ client.py
│     │  │  ├─ config_writer.py
│     │  │  ├─ profile_loader.py
│     │  │  └─ run_events.py
│     │  ├─ team_hub/
│     │  │  ├─ client.py
│     │  │  ├─ dto.py
│     │  │  └─ sync.py
│     │  └─ local_shell/
│     │     ├─ command_runner.py
│     │     ├─ command_policy.py
│     │     └─ process_tree.py
│     │
│     ├─ runtime/
│     │  ├─ profile_runtime.py
│     │  ├─ gateway_process.py
│     │  ├─ gateway_registry.py
│     │  ├─ port_allocator.py
│     │  ├─ heartbeat.py
│     │  └─ locks.py
│     │
│     ├─ workers/
│     │  ├─ scheduler.py
│     │  ├─ task_listener_worker.py
│     │  ├─ gateway_health_worker.py
│     │  └─ cleanup_worker.py
│     │
│     └─ utils/
│        ├─ paths.py
│        ├─ yaml_io.py
│        ├─ json_io.py
│        ├─ crypto.py
│        └─ time.py
│
├─ migrations/
│  ├─ env.py
│  └─ versions/
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ fixtures/
│
├─ docs/
│  ├─ architecture.md
│  ├─ api-contract.md
│  ├─ profile-runtime.md
│  ├─ gateway-supervisor.md
│  ├─ team-task-runtime.md
│  ├─ workspace-security.md
│  └─ windows-service.md
│
└─ packaging/
   ├─ windows/
   │  ├─ winsw.xml
   │  ├─ install-service.ps1
   │  └─ service-template.env
   ├─ linux/
   │  └─ smc-copilot-serve.service
   └─ docker/
      └─ Dockerfile
```

---

# 4. 核心模块规划

## 4.1 Profile Runtime

负责管理本地 Hermes Profile。

```txt
Profile Runtime
├─ profile 注册
├─ profile 配置读取
├─ profile config.yaml 生成
├─ profile 端口分配
├─ profile 启动参数生成
├─ profile 模型配置挂载
└─ profile 状态持久化
```

核心表：

```txt
profiles
├─ id
├─ name
├─ type                # default / writer / coding / finance / research
├─ hermes_home
├─ profile_path
├─ gateway_port
├─ enabled
├─ auto_start
├─ status
├─ created_at
└─ updated_at
```

---

## 4.2 Gateway Supervisor

负责多个 Hermes Gateway 的生命周期管理。

```txt
Gateway Supervisor
├─ start_profile(profile_id)
├─ stop_profile(profile_id)
├─ restart_profile(profile_id)
├─ get_status(profile_id)
├─ health_check(profile_id)
├─ read_logs(profile_id)
└─ recover_crashed_gateway(profile_id)
```

状态机：

```txt
STOPPED
  ↓ start
STARTING
  ↓ health ok
RUNNING
  ↓ error
ERROR
  ↓ restart
RESTARTING
  ↓ ok
RUNNING
```

不建议用 Electron Main Process 直接长期托管 Hermes Gateway。正确边界是：

```txt
Electron Main Process
  ↓
smc-copilot-serve API
  ↓
Gateway Supervisor
  ↓
Hermes Gateway Process
```

---

## 4.3 Hermes Gateway Client

封装 Hermes API，不让上层直接拼 URL。

```txt
HermesGatewayClient
├─ list_models(profile_id)
├─ create_run(profile_id, input, metadata)
├─ stream_run_events(profile_id, run_id)
├─ get_run(profile_id, run_id)
└─ cancel_run(profile_id, run_id)
```

本地 API 可以暴露：

```txt
GET  /api/v1/profiles
POST /api/v1/profiles/{id}/start
POST /api/v1/profiles/{id}/stop
GET  /api/v1/profiles/{id}/status

GET  /api/v1/profiles/{id}/models
POST /api/v1/profiles/{id}/runs
GET  /api/v1/profiles/{id}/runs/{run_id}/events
```

---

## 4.4 Team Task Runtime

用于接收同事 Agent / ai-os-full 分派给本机 Agent 的任务。

```txt
Team Task Runtime
├─ listen remote assignments
├─ claim task
├─ create local task
├─ bind target profile
├─ wait approval
├─ execute via Hermes Gateway
├─ collect events
├─ sync status
└─ archive result
```

任务状态：

```txt
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

本地任务表：

```txt
tasks
├─ id
├─ remote_task_id
├─ assignment_id
├─ title
├─ description
├─ source_agent_id
├─ target_profile_id
├─ workspace_id
├─ status
├─ priority
├─ payload_json
├─ result_json
├─ created_at
├─ started_at
├─ finished_at
└─ last_sync_at
```

---

## 4.5 Approval Runtime

用于控制高风险动作。

需要审批的动作：

```txt
- 写入项目代码
- 执行 shell command
- git commit / push
- docker compose up / down
- 修改 Hermes profile 配置
- 下载远端任务附件
- 访问非授权 workspace
```

审批表：

```txt
approvals
├─ id
├─ task_id
├─ action_type
├─ action_payload
├─ risk_level
├─ status              # pending / approved / rejected / expired
├─ requested_by
├─ approved_by
├─ created_at
└─ decided_at
```

---

## 4.6 Workspace Guard

这是团队协作场景必须有的边界。

```txt
Workspace Guard
├─ workspace 白名单
├─ 文件读写范围限制
├─ 命令 allowlist / denylist
├─ git branch 限制
├─ 敏感文件保护
├─ 执行前审批
└─ 操作审计
```

配置示例：

```yaml
workspace:
  root: "D:/workspace/smc-copilot-desktop"
  allowed_paths:
    - "apps/"
    - "packages/"
    - "docs/"
  denied_paths:
    - ".env"
    - ".env.local"
    - "secrets/"
    - ".git/config"

commands:
  allow:
    - "git status"
    - "git diff"
    - "pnpm test"
    - "pnpm build"
  require_approval:
    - "git commit"
    - "git push"
    - "docker compose up"
  deny:
    - "rm -rf"
    - "format"
    - "del /s"
```

---

# 5. API 结构规划

## 5.1 System API

```txt
GET  /api/v1/health
GET  /api/v1/system/info
GET  /api/v1/system/paths
GET  /api/v1/system/logs
```

## 5.2 Profile API

```txt
GET    /api/v1/profiles
POST   /api/v1/profiles
GET    /api/v1/profiles/{profile_id}
PATCH  /api/v1/profiles/{profile_id}
DELETE /api/v1/profiles/{profile_id}
POST   /api/v1/profiles/{profile_id}/start
POST   /api/v1/profiles/{profile_id}/stop
POST   /api/v1/profiles/{profile_id}/restart
GET    /api/v1/profiles/{profile_id}/status
```

## 5.3 Gateway API

```txt
GET  /api/v1/gateways
GET  /api/v1/gateways/{gateway_id}/health
GET  /api/v1/gateways/{gateway_id}/logs
POST /api/v1/gateways/{gateway_id}/recover
```

## 5.4 Hermes Run API

```txt
GET  /api/v1/profiles/{profile_id}/models
POST /api/v1/profiles/{profile_id}/runs
GET  /api/v1/profiles/{profile_id}/runs/{run_id}
GET  /api/v1/profiles/{profile_id}/runs/{run_id}/events
POST /api/v1/profiles/{profile_id}/runs/{run_id}/cancel
```

## 5.5 Task API

```txt
GET  /api/v1/tasks
POST /api/v1/tasks
GET  /api/v1/tasks/{task_id}
POST /api/v1/tasks/{task_id}/claim
POST /api/v1/tasks/{task_id}/approve
POST /api/v1/tasks/{task_id}/reject
POST /api/v1/tasks/{task_id}/run
POST /api/v1/tasks/{task_id}/cancel
GET  /api/v1/tasks/{task_id}/events
```

## 5.6 Approval API

```txt
GET  /api/v1/approvals
GET  /api/v1/approvals/{approval_id}
POST /api/v1/approvals/{approval_id}/approve
POST /api/v1/approvals/{approval_id}/reject
```

## 5.7 Workspace API

```txt
GET  /api/v1/workspaces
POST /api/v1/workspaces
GET  /api/v1/workspaces/{workspace_id}
PATCH /api/v1/workspaces/{workspace_id}
GET  /api/v1/workspaces/{workspace_id}/policy
POST /api/v1/workspaces/{workspace_id}/validate-action
```

---

# 6. 分阶段实施规划

## V1.0：本地服务基础版

目标：让 Electron 能稳定管理 Hermes。

交付内容：

```txt
- FastAPI 本地服务
- SQLite 初始化
- Profile CRUD
- 单 Profile Gateway 启停
- Gateway 健康检查
- Hermes /v1/models 读取
- Hermes /v1/runs 调用
- 基础日志查看
```

验收：

```txt
- Electron 能看到 profile 列表
- 能启动 default profile
- 能读取 Hermes models
- 能创建一次 run
- Gateway 崩溃后状态能识别
```

---

## V1.1：多 Profile Gateway Supervisor

目标：支持多个 Hermes Profile 同时运行。

交付内容：

```txt
- 多 profile 端口分配
- 多 gateway process registry
- profile auto_start
- gateway restart / recover
- profile 日志隔离
- profile 状态面板 API
```

验收：

```txt
- default profile 使用 8642
- writer profile 使用 8643
- coding profile 使用 8644
- 多个 profile 可同时启动
- 单个 profile 崩溃不影响其他 profile
```

---

## V1.2：Team Task Runtime

目标：接收团队任务分派。

交付内容：

```txt
- Team Task Hub client
- task polling worker
- 本地 task 表
- task claim / sync
- task → profile 绑定
- task run events
```

验收：

```txt
- ai-os-full 分派任务给当前用户
- smc-copilot-serve 能拉取任务
- 用户可在桌面端看到任务
- 任务可绑定 coding profile 执行
- 执行结果可同步回 Team Task Hub
```

---

## V1.3：Approval + Workspace Guard

目标：把 Agent 执行纳入安全边界。

交付内容：

```txt
- workspace 白名单
- command policy
- approval 表
- approval API
- 高风险动作拦截
- 审计日志
```

验收：

```txt
- 未授权目录不可写
- git push 需要审批
- docker 操作需要审批
- 被拒绝动作不会执行
- 所有审批动作可追溯
```

---

## V1.4：Windows Service + 一键部署

目标：适配 Windows 10 Home 企业内部分发。

交付内容：

```txt
- Windows 后台服务安装脚本
- 开机自启动
- 无命令行窗口运行
- Electron 检测服务状态
- 服务异常自动恢复
- 本地升级机制预留
```

验收：

```txt
- Windows 10 Home 可安装
- 开机后 smc-copilot-serve 自动启动
- Electron 打开后能连接本地服务
- Hermes Gateway 可由服务启动
```

---

# 7. 推荐开发顺序

```txt
第一步：先做 smc-copilot-serve FastAPI 骨架
第二步：做 SQLite schema + Alembic
第三步：做 Profile Runtime
第四步：做 Gateway Supervisor
第五步：打通 Hermes /v1/models 和 /v1/runs
第六步：接 Electron Profile 管理页面
第七步：做 Team Task Runtime
第八步：做 Approval + Workspace Guard
第九步：做 Windows Service 安装部署
第十步：接 ai-os-full Team Task Hub
```

不要一开始就做复杂分布式任务系统。当前最优路径是：

```txt
本地 SQLite
+ FastAPI
+ 多 Hermes Gateway 子进程管理
+ Team Task Hub polling
+ 本地审批
+ 本地 Workspace 安全
```

这条路径最贴合 `smc-copilot-desktop + Hermes Agent + ai-os-full` 的集成目标。
