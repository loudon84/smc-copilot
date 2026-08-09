# Gateway 监管

[[src/services/gateway_supervisor.py#GatewaySupervisor]] 是 Runtime 与 Hermes 的进程控制入口：保留 legacy `/profiles` 启停，并经 [[src/services/instance_gateway_service.py#InstanceGatewayService]] 提供 Instance 原生生命周期（v1.3.1）。Hermes 为外部运行时（见 [[design-decisions#Hermes 视为外部运行时]]）。

进程由 [[src/runtime/gateway_process.py#GatewayProcessManager]] 管理；端口由 [[gateway-supervisor#端口分配]] 分配；子进程环境见 [[gateway-supervisor#Gateway 环境注入]]。相关：[[profiles-instances#Profile 与 Instance]]、[[task-runtime#任务运行时]]。

## 进程生命周期

Legacy `start_profile`：校验 enabled → `starting` → 解析 executable → 启子进程 → `running`+pid → 健康轮询；失败审计 `profile_start_failed`。`starting` 超 60s 视为 stale。

Instance API **不得**调用 `start_profile`；走 `start_instance` / `stop_instance` / `restart_instance`（写 `instances` 表）。CLI 合同见 [[gateway-supervisor#Hermes CLI 合同]]。日志写 `gateway-{name}.log`。argv-only，禁止 `shell=True`。

## Hermes CLI 合同

[[src/integrations/hermes/cli_adapter.py#HermesCliAdapter]]（v1.3.1）：默认 `hermes gateway run --external-supervisor`；命名 `-p <name> gateway run --external-supervisor`。禁止 `--profile`/`--port`；端口经 `API_SERVER_PORT`。`doctor` 无 `--json`；`config check`/`migrate` 对命名 Profile 加 `-p`。

## Gateway 环境注入

[[src/runtime/gateway_environment.py#build_gateway_environment]] 构建 Gateway 子进程环境：仅白名单继承主机变量，再注入 `HERMES_HOME`、`API_SERVER_*` 与 Runtime 作用域密钥。

白名单：`PATH`/`PATHEXT`/`SYSTEMROOT`/`WINDIR`/`COMSPEC`/`USERPROFILE`/`LOCALAPPDATA`/`APPDATA`/`TEMP`/`TMP`/`LANG`。父进程 `*_API_KEY`/`API_SERVER_KEY` 等敏感变量不得继承。禁止 Secret 覆盖 `PATH` 等保留名；禁止空 `API_SERVER_KEY`；日志仅记录 `envKeys`（不记录值）。

v1.5.3：`API_SERVER_KEY` 来自 [[src/services/hermes_local_config_service.py#HermesLocalConfigService]] 读取的 `~/.hermes/.env`，不再以 Runtime SecretStore 为 SOT；Provider Key 由 Hermes 自行从 `.env` 加载。见 [[runtime-service#配置与 Secret]]。

## Hermes 本地配置 SOT (v1.5.3)

[[src/services/hermes_local_config_service.py#HermesLocalConfigService]] 是读取 Hermes 本地配置的唯一入口。`.env` 为 Credential SOT；`config.yaml` 为行为配置 SOT。[[src/services/gateway_credential_service.py#GatewayCredentialService]] 与 Gateway spawn 共用同一 Resolver。[[src/runtime/local_hermes_profile_policy.py#require_supported_local_profile]] 将本地 Profile 收敛为 `default` only。

## 端口分配

[[src/runtime/port_allocator.py#allocate_port]]：请求端口冲突或被占用即抛错；未指定则从 `DEFAULT_GATEWAY_PORT` 起扫描最多 100 个可用端口。`is_port_available` 用非阻塞 connect 探测。Profile 创建/更新时由 [[src/services/profile_service.py#ProfileService]] 调用，避免硬编码端口（架构技能拒绝准则）。

Instance 启动遇端口占用：若监听 PID 即本 Instance 则恢复；未知 PID **不杀**，报 `gateway_port_conflict`。

## 健康检查

[[src/integrations/hermes/client.py#HermesGatewayClient]] `health_check` 返回 [[src/integrations/hermes/client.py#GatewayHealthResult]]：`/health` 仅为公开 liveness；当提供 `api_key` 时必须再通过认证的 `GET /v1/models` 才 `healthy`。401/403 为 `GATEWAY_AUTH_FAILED`，禁止 `<500→healthy`。启动等待仍用 `HERMES_GATEWAY_START_TIMEOUT_SECONDS` 严格就绪。

## Desired / Observed 状态

[[src/services/instance_gateway_service.py#InstanceGatewayService]] 先写 `desired_state` 再 reconcile；`process_state`/`api_state`/`ownership_state` 为 Observed。兼容字段 `status`/`healthy` 仅作投影。

## 进程所有权指纹

[[src/runtime/gateway_process.py#verify_ownership]] 验证 listener PID + create_time + 端口监听；仅 `owned`/`adopted` 可 kill。v1.5.1 持久化 fingerprint；v1.5.2 升级为 launcher + listener 双身份（[[src/runtime/gateway_listener.py#GatewayListenerResolver]]）。

## Ownership Recovery (v1.5.1 / v1.5.2)

[[src/services/gateway_ownership_service.py#GatewayOwnershipService]] 的 `inspect()` 是 Ownership 唯一 SOT。开发模式 shutdown 可 detach；boot reconcile 先于 autostart。Safe Adoption 证据全真才启用（禁止 health→owned；禁止 python.exe 单独判 Hermes）。Launcher PID 可与 Listener PID 不同。见 [[tests#Gateway ownership v151]]、[[tests#Gateway listener identity v152]]。

## Gateway Health Worker

[[src/workers/gateway_health_worker.py#GatewayHealthWorker]] 由 [[src/workers/supervisor.py#WorkerSupervisor]] 周期调度（默认 5s），经 `inspect()` + `_apply_gateway_observation` 写 Observed；`not owned ≠ exited`；auth/port conflict 不自动重启；历史 conflict 在 ownership 恢复后清除。并发经 [[src/runtime/instance_operation_lock.py#InstanceOperationLock]]。

## 启动时重协调

[[src/core/lifecycle.py#lifespan]] 启动序：recover jobs → reconcile instances → legacy profiles → autostart 二者 → workers（含 GatewayHealthWorker）。

关闭：停 workers → `shutdown_all_instances` → `shutdown_all_legacy_profiles`。未知端口占用者不杀（FR-06）。

## 孤儿进程清理

Legacy / Instance `stop` 均默认不杀未知 listener；`release_port` 在 v1.5 起拒绝强制杀进程并打 warning。Profile restart 端口仍占用时抛 `GatewayError`（Port Ownership Conflict）。相关测试见 [[tests#Gateway 监管]]、[[tests#Instance Gateway]]。
