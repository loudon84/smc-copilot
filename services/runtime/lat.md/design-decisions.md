# 关键设计决策

记录影响架构走向的决策与权衡，作为评审与重构的依据。架构技能的拒绝准则（不在 Renderer 控制 Gateway、不让 UI 跑 shell、不绕过审批、不硬编码端口、不混 DB 逻辑进路由、不裸存 secret）均源自这些决策。

相关：[[index#系统边界]]、[[architecture#分层职责]]。

## 本地优先

优先 SQLite + 本地文件，不引入 Postgres/Redis/MQ/Kubernetes（除非任务明确要求）。状态尽量持久化以便 Desktop 重启后恢复：Runtime Job、Profile 状态、任务事件、审批、Outbox 均入库。后台循环必须可取消、受生命周期管理（见 [[architecture#生命周期与后台循环]]）。

## 服务态与程序目录隔离

Windows 默认程序根为 `%LOCALAPPDATA%\Programs\SMC\{CopilotRuntime,HermesAgent}`（不再强制 `D:\Programs`）；服务态（DB/日志/downloads/staging）用 `%LOCALAPPDATA%\HermesRuntime`，与程序目录分离，避免升级/卸载误删服务态与 `~/.hermes`。详见 [[deployment#程序目录约束]]。

## Hermes 视为外部运行时

Hermes Gateway 是外部进程，控制面只经 `integrations/hermes/` 适配器（HTTP、配置、CLI、角色编译）交互，不把 Hermes 内部嵌入路由或服务。Gateway 子进程经 `runtime/` 管理，argv-only 启动（禁 `shell=True`）。详见 [[gateway-supervisor#进程生命周期]]。

## 风险操作门控

任务执行、命令运行、路径写入经审批门控 + Workspace Guard + ExecutablePolicy 三重拦截：审批见 [[approval-workspace#审批运行时]]，路径/命令策略见 [[approval-workspace#Workspace Guard]]，MCP/进程命令见 [[approval-workspace#可执行策略]]。secret 仅存引用不入库明文（见 [[data-model#Runtime 表]]）。

## 失败不破坏现状

安装/更新/回滚 Job 串行互斥（见 [[runtime-service#运行时 Job 队列]]），失败保留当前 active 版本且 **禁止 Stub 激活**（v1.3.1）；服务重启将未完成 Job 标记失败（见 [[runtime-service#Job 恢复]]）；Gateway 启动失败置 `error` 但不删配置。端口冲突不杀未知 PID。这是 Runtime 的核心可靠性约束。

## Development Hermes Registration（v1.4.1）

`dev_bootstrap` discovers local Hermes and registers an external-dev RuntimeVersion plus default Instance.

Resolve via `HERMES_DEV_EXECUTABLE` or `hermes` on PATH, validate `--version` (Windows: [[src/integrations/hermes/win_subprocess.py#windows_no_window_kwargs|CREATE_NO_WINDOW]]), then probe [[src/services/dev_hermes_registration_service.py#probe_local_gateway_running|hermes gateway status]] / `hermes status`. Register via `register_external` (`channel=development`, `metadata.source=external-dev`) and `InstanceService.ensure_default`. Missing Hermes may continue; invalid override / validation / DB write must exit non-zero.

When Gateway is not running, uvicorn lifespan starts it through [[src/runtime/gateway_process.py#GatewayProcessManager]] (`hermes gateway run --external-supervisor`, no console window). Already-running Gateways are adopted — never spawn a second process or open a terminal.

## Runtime File Logging（v1.4.1）

`configure_logging(settings)` 双通道：stderr ConsoleRenderer + `<RUNTIME_DATA_DIR>/logs/runtime-service.log` 旋转 JSON Lines。`/diagnostics/logs` 暴露 `source`，供 Desktop View Logs 读取。
