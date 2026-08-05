# Hermes Runtime Service

v1.3 起本机常驻 Runtime 接管 Hermes 安装/更新/回滚与版本激活；v1.3.1 hotfix 要求**真实** Artifact 可执行校验，禁止 Stub 成功路径。写 Job 串行化，失败不破坏 active 版本与 `~/.hermes`。

相关：[[gateway-supervisor#Gateway 监管]]、[[data-model#Runtime 表]]、[[deployment#目录布局]]。

## 版本管理

[[src/db/models/runtime.py#RuntimeVersion]] 记录每个已安装 Hermes 版本的 `install_path`、`executable_path`、`python_path`、`checksum` 与 `status`。状态机见 [[src/core/runtime_enums.py#RuntimeVersionStatus]]：`installed → active ↔ inactive`，可标记 `invalid`/`pending_delete`。

[[src/db/repositories/runtime_repo.py#RuntimeVersionRepository]] 负责 `set_active`：先 `deactivate_all` 再置单条为 `active`，保证全局唯一 active 版本。删除 active 版本或被 Instance 引用的版本会被拒绝（见 `api/v1/runtime.py` `delete_runtime_version`）。`active.json` 由 [[src/runtime/environment_probe.py#ActivationManager]] 原子写入（tmp + replace），作为 DB 之外的快速激活指针。

## 安装 Job

[[src/services/installation_service.py#InstallationService]] `run_job`：探测 → Manifest（semver 最高）→ 下载/校验 → 解压 → 可安装判定 → venv → pip → `--version`/`doctor` → 激活。禁止 Stub；成功需 `realExecutableVerified: true`。

无 wheel/pyproject/setup 报 `artifact_not_installable`；pip 失败报 `hermes_install_failed`。`alreadyInstalled` 也会复验可执行文件/`--version`/`doctor`，失败则不得声称已验证。

Manifest 支持扁平或 `releases[]`，按 channel/platform/arch 过滤后取 **semver 最大**（不依赖数组顺序）；必填 `version`/`url`/`sha256`/`artifactType` 等。`HERMES_MANIFEST_URL` 未配置报 `manifest_invalid`。staging 在 finally 清理。见 [[tests#真实安装]]。

## 配置与 Secret

[[src/services/configuration_service.py#ConfigurationService]] 经统一 Profile 路径读写 `config.yaml`（原子 tmp→fsync→replace），必要时跑 `hermes config check`；失败恢复 snapshot。重启分组含 `gateway`/`provider`/`model`/`runtime`/`platforms`。

[[src/services/secret_service.py#SecretStore]] Windows 优先 DPAPI；失败默认 `secret_store_unavailable`，仅 `RUNTIME_ALLOW_INSECURE_SECRET_STORE=true` 才允许 XOR 文件。[[src/runtime/gateway_environment.py#build_gateway_environment]] 向 Gateway 注入 `HERMES_HOME`、`API_SERVER_*` 与 Profile 作用域密钥（见 [[gateway-supervisor#Gateway 环境注入]]）；缺 `API_SERVER_KEY` 时拒绝启动。Instance 密钥按 Profile 作用域隔离，命名 Profile **不**借用 `default`/`runtime`（见 [[src/services/instance_gateway_service.py#InstanceGatewayService]]）。Instance 创建时 [[src/services/secret_service.py#SecretService]] `ensure_api_server_key` 生成 CSPRNG 密钥（不得静默吞错）。

## 更新与回滚

更新与回滚复用同一 Job 队列（`update`/`rollback` 类型），由 `UpdateService`/`RollbackService` 处理（在 [[src/core/lifecycle.py#lifespan]] 中注册）。写类 Job 互斥：见 [[runtime-service#运行时 Job 队列]]。失败时保留当前 active 版本，不破坏 `~/.hermes`。

## 运行时 Job 队列

[[src/services/runtime_job_service.py#RuntimeJobService]] 用 `asyncio.Queue` + 单 worker 串行执行 Job。`create_job` 校验类型；对写类 Job（install/update/rollback/restore/config_migrate/runtime_cleanup，见 `WRITE_JOB_TYPES`）检查 `find_active_write_job`，存在未完成写 Job 则抛 `runtime_lock_conflict`。

Job 状态机见 [[src/core/runtime_enums.py#RuntimeJobStatus]]：`pending → running → succeeded/failed/cancelled`。进度经 `progress` 回调写 `RuntimeJobEvent`（带递增 `sequence`）。事件可通过 `iter_events` 以 SSE 推送（`GET /runtime/jobs/{id}/events`）。`doctor`/`backup` 等无 handler 的类型以 stub 完成。

## Job 恢复

服务重启时 [[src/services/runtime_job_service.py#RuntimeJobService]] `recover_incomplete_jobs` 将所有 `pending`/`running` Job 标记为 `failed`（`error_code=runtime_restarted`）并写失败事件。这避免重启后 Job 永久悬挂，符合「失败不破坏现状」原则。

## 环境探测与工具链

[[src/runtime/environment_probe.py#EnvironmentProbe]] 检测平台/架构、磁盘空间（≥500MB）、解析工具链（python/node/git/venv/hermes_install_dir）。`require_ready` 在 Windows 上强制 [[src/runtime/windows_program_paths.py#require_under_programs_root]] 校验 `HERMES_INSTALL_DIR`/`TOOLCHAIN_VENV_DIR` 位于 `D:\Programs` 下（见 [[deployment#程序目录约束]]）。

工具链路径可由环境变量或 Install API 的 `toolchain` 字段覆盖；空则探测 PATH。`VersionLayout` 计算版本安装根与 staging/download 路径。显式 `-PythonPath` / `TOOLCHAIN_PYTHON_PATH` 须贯穿 bootstrap 与 provision（见 [[deployment#Windows Provision]]）。

## 目录布局

[[src/runtime/platform_paths.py#RuntimeLayout]] 定义服务态目录：`versions/`、`downloads/`、`staging/`、`logs/`（含 `service`/`jobs`/`instances`）、`backups/`、`runtime.db`、`active.json`。Windows 默认根 `%LOCALAPPDATA%\HermesRuntime`，其它平台 `~/.hermes-runtime`。服务态与程序目录必须隔离（见 [[design-decisions#服务态与程序目录隔离]]）。
