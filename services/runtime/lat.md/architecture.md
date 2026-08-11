# 架构总览

控制面采用薄路由 + 服务编排 + 仓储 + 集成适配器的分层结构。API 只做请求解析与依赖注入，业务逻辑在 `services/`，数据库访问在 `db/repositories/`，外部系统在 `integrations/`，进程与端口在 `runtime/`，可取消后台循环在 `workers/`。

边界规则见 [[design-decisions#关键设计决策]] 与 [[index#系统边界]]。源码布局见 [[index#文档导航]]。

## 分层职责

每层只承担单一职责，禁止跨层直访外部系统。

| 目录 | 职责 | 禁止 |
|------|------|------|
| `api/v1/` | 薄路由、依赖注入、响应映射 | 写业务逻辑、直连 Gateway |
| `schemas/` | 请求/响应 DTO（Pydantic） | 直接返回 ORM |
| `db/models/` | SQLAlchemy 模型 | — |
| `db/repositories/` | 数据访问 | 调 Gateway / Shell / Team Hub |
| `services/` | 业务编排与状态迁移 | 跨层直访外部系统 |
| `integrations/hermes/` | Gateway HTTP、配置、Profile 加载、角色编译、**Kanban CLI Adapter** | 直改 `kanban.db` |
| `integrations/team_hub/` | 旧 Team Task Hub（Deprecated 兼容 Adapter） | 新远程任务主路径 |
| `integrations/service_center/` | Work Copilot Service Center 出站 Client（Stub/HTTPS） | — |
| `runtime/` | 进程注册、端口、Gateway 子进程、环境探测、同步协议 | — |
| `workers/` | 可取消后台循环（任务/Hub Outbox + Endpoint Sync） | 阻塞事件循环 |

仓储层只做 DB 操作；外部调用必须经 `integrations/` 适配器；进程与端口经 `runtime/`；后台循环经 `workers/` 且必须可取消、受生命周期管理（见 [[task-runtime#后台 Worker]]）。

## 应用装配

入口 `src/main.py` 通过 [[src/app.py#build_asgi_app]] 构造纯 ASGI 应用：`create_app()` 创建 FastAPI 并挂载 `api_router`，再以 `PureAsgiCorsMiddleware` 包裹（SSE 安全，v1.3.1 hotfix）。CORS 源来自 `CORS_ALLOW_ORIGINS`，缺省 `127.0.0.1`/`localhost`。

路由聚合在 [[src/api/router.py#api_router]]，统一前缀 `/api/v1`，并以 [[src/api/deps.py#verify_desktop_token]] 作为全局依赖（白名单见 [[auth-pairing#本地鉴权与设备配对]]）。

## 生命周期与后台循环

[[src/core/lifecycle.py#lifespan]] 启动：日志、引擎、Supervisor、Service Center Client、JobService（注册 install/update/rollback/doctor）、recover jobs，再按 FR-06 reconcile/autostart Instance 与 legacy Profile，最后启 v1.2 与 v1.5 Endpoint Sync workers。

关闭：停 Job worker 与后台 Worker → `shutdown_all_instances` → `shutdown_all_legacy_profiles` → dispose 引擎。绑定地址用 `settings.bind_host`/`bind_port`（`RUNTIME_*` 优先于 `COPILOT_*`）。测试经 `app.state._test_*`（含 `_test_service_center`）注入并禁用自启/worker。详见 [[gateway-supervisor#启动时重协调]]、[[endpoint-sync#Workers]]。

## Worker Supervisor

v1.6 FR-801–805：[[src/workers/supervisor.py#WorkerSupervisor]] 在 `lifespan` 中统一注册后台 Worker，提供 Backoff、熔断、Tick Timeout、手动重启与 Critical Readiness 聚合；[[src/runtime/process_lock.py#ProcessLock]] 防止双实例重复消费（含陈旧锁回收）。
