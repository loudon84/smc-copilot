# Gateway 监管

[[src/services/gateway_supervisor.py#GatewaySupervisor]] 是 Runtime 与 Hermes 的进程控制入口：保留 legacy `/profiles` 启停，并经 [[src/services/instance_gateway_service.py#InstanceGatewayService]] 提供 Instance 原生生命周期（v1.3.1）。Hermes 为外部运行时（见 [[design-decisions#Hermes 视为外部运行时]]）。

进程由 [[src/runtime/gateway_process.py#GatewayProcessManager]] 管理；端口由 [[gateway-supervisor#端口分配]] 分配；子进程环境见 [[gateway-supervisor#Gateway 环境注入]]。相关：[[profiles-instances#Profile 与 Instance]]、[[task-runtime#任务运行时]]。

## 进程生命周期

Legacy `start_profile`：校验 enabled → `starting` → 解析 executable → 启子进程 → `running`+pid → 健康轮询；失败审计 `profile_start_failed`。`starting` 超 60s 视为 stale。

Instance API **不得**调用 `start_profile`；走 `start_instance` / `stop_instance` / `restart_instance`（写 `instances` 表）。CLI 合同见 [[gateway-supervisor#Hermes CLI 合同]]。日志写 `gateway-{name}.log`。argv-only，禁止 `shell=True`。

## Hermes CLI 合同

[[src/integrations/hermes/cli_adapter.py#HermesCliAdapter]]（v1.3.1）：默认 `hermes gateway run --external-supervisor`；命名 `-p <name> gateway run --external-supervisor`。禁止 `--profile`/`--port`；端口经 `API_SERVER_PORT`。`doctor` 无 `--json`；`config check`/`migrate` 对命名 Profile 加 `-p`。

## Gateway 环境注入

[[src/runtime/gateway_environment.py#build_gateway_environment]] 构建 Gateway 子进程环境：仅白名单继承主机变量，再注入 `HERMES_HOME`、`API_SERVER_*` 与 Profile 作用域密钥。

白名单：`PATH`/`PATHEXT`/`SYSTEMROOT`/`WINDIR`/`COMSPEC`/`USERPROFILE`/`LOCALAPPDATA`/`APPDATA`/`TEMP`/`TMP`/`LANG`。父进程 `*_API_KEY`/`API_SERVER_KEY` 等敏感变量不得继承。禁止 Secret 覆盖 `PATH` 等保留名；禁止空 `API_SERVER_KEY`；日志仅记录 `envKeys`（不记录值）。见 [[runtime-service#配置与 Secret]]。

## 端口分配

[[src/runtime/port_allocator.py#allocate_port]]：请求端口冲突或被占用即抛错；未指定则从 `DEFAULT_GATEWAY_PORT` 起扫描最多 100 个可用端口。`is_port_available` 用非阻塞 connect 探测。Profile 创建/更新时由 [[src/services/profile_service.py#ProfileService]] 调用，避免硬编码端口（架构技能拒绝准则）。

Instance 启动遇端口占用：若监听 PID 即本 Instance 则恢复；未知 PID **不杀**，报 `gateway_port_conflict`。

## 健康检查

健康以 `GET /health` 且 body `{"status":"ok"}` 为准（超时 `HERMES_GATEWAY_START_TIMEOUT_SECONDS`），并兼容 `/v1/models`。[[src/integrations/hermes/client.py#HermesGatewayClient]] `health_check` 实现该策略。Instance health 响应含 `executableVerified`/`apiServerEnabled`，永不返回密钥。

## 启动时重协调

[[src/core/lifecycle.py#lifespan]] 启动序：recover jobs → reconcile instances → legacy profiles → autostart 二者 → workers。

关闭：停 workers → `shutdown_all_instances` → `shutdown_all_legacy_profiles`。未知端口占用者不杀（FR-06）。

## 孤儿进程清理

Legacy `stop` 可在请求时 `kill_unknown_port_listeners`；Instance stop 只停登记 PID。`release_port` 仍可用于运维强制释放。相关测试见 [[tests#Gateway 监管]]、[[tests#Instance Gateway]]。
