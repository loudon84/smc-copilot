# Gateway 监管

[[src/services/gateway_supervisor.py#GatewaySupervisor]] 负责按 Profile 启停 Hermes Gateway 子进程、健康检查、状态重协调与自启。它将 DB 状态与 OS 进程对齐，是 Runtime 与 Hermes 之间的唯一进程控制入口。Hermes 始终视为外部运行时（见 [[design-decisions#Hermes 视为外部运行时]]）。

Gateway 进程由 [[src/runtime/gateway_process.py#GatewayProcessManager]] 管理；端口由 [[gateway-supervisor#端口分配]] 分配。相关：[[profiles-instances#Profile 与 Instance]]、[[task-runtime#任务运行时]]。

## 进程生命周期

`start_profile` 流程：校验 enabled → 置 `starting` → 解析 hermes 可执行文件（优先 Instance 绑定的 `RuntimeVersion.executable_path`，否则 active 版本）→ 启子进程 → 置 `running`+pid → 轮询健康。健康失败则置 `error` 并审计 `profile_start_failed`，抛 `GatewayError`。`starting` 超 60s 视为 stale 并重置。

[[src/runtime/gateway_process.py#GatewayProcessManager]] `start` 仅用 argv 数组（PRD §7.7，禁止 `shell=True`），Windows 加 `CREATE_NO_WINDOW`/`SW_HIDE` 隐藏控制台。`stop` 先 terminate 再 kill，并清理占用端口的孤儿监听者（`terminate_listeners_on_port`）。日志写 `gateway-{name}.log`。

## 端口分配

[[src/runtime/port_allocator.py#allocate_port]]：请求端口冲突或被占用即抛错；未指定则从 `DEFAULT_GATEWAY_PORT` 起扫描最多 100 个可用端口。`is_port_available` 用非阻塞 connect 探测。Profile 创建/更新时由 [[src/services/profile_service.py#ProfileService]] 调用，避免硬编码端口（架构技能拒绝准则）。

## 健康检查

`_wait_for_health` 在 `gateway_health_timeout_sec` 内轮询 [[src/integrations/hermes/client.py#HermesGatewayClient]] `health_check`（试 `/health` 与 `/v1/models`，<500 视为健康）。`_compute_status` 综合 handle 存活、pid 存活、健康结果将 Profile 在 `running`/`error` 间迁移，并写入审计。

## 启动时重协调

`reconcile_on_boot`（[[src/core/lifecycle.py#lifespan]] 调用）遍历 DB 中 `running` 的 Profile：handle 仍存活则保留；pid 存活且健康则保留；pid 存活但不健康则 kill 并置 `error`；pid 已失则置 `error`。`start_auto_start_profiles` 启动 `enabled && auto_start && 未运行` 的 Profile，失败仅审计不中断。

## 孤儿进程清理

`stop`/`release_port` 在端口仍被占用时用 psutil `net_connections` 找监听该端口的 PID 并 `terminate`/`kill`（权限不足时仅告警）。`shutdown_all` 在服务关闭时停掉所有运行中 Profile 并审计 `profile_stopped(reason=service_shutdown)`。相关测试见 [[tests#Gateway 监管]]。
