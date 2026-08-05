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

[[src/services/configuration_service.py#ConfigurationService]] 经统一 Profile 路径读写 `config.yaml`（原子 tmp→fsync→replace），必要时跑 `hermes config check`；失败恢复 snapshot。

`PATCH` 仅保存并返回 `restartRequired`/`snapshotId`（`applied` 恒为 false）；`POST .../configuration/apply` 重启 Gateway 并健康检查，失败回滚 snapshot 后返回 `configuration_apply_failed`。重启分组含 `gateway`/`provider`/`model`/`runtime`/`platforms`。

[[src/services/secret_service.py#SecretStore]] Windows 优先 DPAPI；失败默认 `secret_store_unavailable`，仅 `RUNTIME_ALLOW_INSECURE_SECRET_STORE=true` 才允许 XOR 文件。[[src/runtime/gateway_environment.py#build_gateway_environment]] 向 Gateway 注入 `HERMES_HOME`、`API_SERVER_*` 与 Profile 作用域密钥（见 [[gateway-supervisor#Gateway 环境注入]]）；缺 `API_SERVER_KEY` 时拒绝启动。Instance 密钥按 Profile 作用域隔离，命名 Profile **不**借用 `default`/`runtime`（见 [[src/services/instance_gateway_service.py#InstanceGatewayService]]）。Instance 创建时 [[src/services/secret_service.py#SecretService]] `ensure_api_server_key` 生成 CSPRNG 密钥（不得静默吞错）。

## MCP 配置编译

v1.4 FR-07：MCP CRUD 以 DB 为主数据源，经编译器写入 Profile `config.yaml` 的 `mcp.servers` 段。

[[src/runtime/mcp_config_compiler.py#McpConfigCompiler]] 将启用中的记录编译进 Hermes 配置；[[src/runtime/mcp_config_compiler.py#McpSecretResolver]] 解析 Secret 引用；[[src/runtime/mcp_config_compiler.py#McpRuntimeValidator]] 跑 `hermes config check`（无 Hermes 时软跳过）。状态机：`draft → validating → ready/error/disabled`。`mcp_servers.json` 仅作可选导出与旧数据导入兼容。

## 更新与回滚

更新与回滚复用同一 Job 队列（`update`/`rollback` 类型），由 [[src/services/update_service.py#UpdateService]] / [[src/services/update_service.py#RollbackService]] 处理（在 [[src/core/lifecycle.py#lifespan]] 中注册）。写类 Job 互斥：见 [[runtime-service#运行时 Job 队列]]。

v1.4 事务化更新：`POST /runtime/update/plan`（[[src/services/runtime_update_plan_service.py#RuntimeUpdatePlanService]]）生成计划并写入 `runtime_update_plans`；`update` Job 先 inactive 安装（`createDefaultInstance: false`），再按 canary→其余 Instance 停止/重绑/启动/探活（`/v1/models`），成功后 `set_active` + `write_active_atomic`。失败路径恢复 `Instance.runtime_version_id`、旧 active 与 Gateway。回滚支持 `all`/`selected`/`canary`，状态写入 `runtime_jobs.rollback_state_json`。

版本删除与后台 cleanup 经 [[src/services/runtime_version_pin_service.py#RuntimeVersionPinService]] 检查 active/Instance 引用/Update Plan/最后健康版本/rollback 保留，拒绝时 `runtime_version_pinned`。

Job 取消：[[src/runtime/cancellation_token.py#CancellationToken]] 贯穿 Job worker、安装与下载；`cancel_job` 设置 `cancellation_requested_at` 并信号 token，安装在 pip 等阶段协作退出并清理 staging。

## 运行时 Job 队列

[[src/services/runtime_job_service.py#RuntimeJobService]] 用 `asyncio.Queue` + 单 worker 串行执行 Job。`create_job` 校验类型；对写类 Job（install/update/rollback/restore/config_migrate/runtime_cleanup，见 `WRITE_JOB_TYPES`）检查 `find_active_write_job`，存在未完成写 Job 则抛 `runtime_lock_conflict`。

Job 状态机见 [[src/core/runtime_enums.py#RuntimeJobStatus]]：`pending → running → succeeded/failed/cancelled`。进度经 `progress` 回调写 `RuntimeJobEvent`（带递增 `sequence`）。事件可通过 `iter_events` 以 SSE 推送（`GET /runtime/jobs/{id}/events`）。`doctor`/`backup` 等无 handler 的类型以 stub 完成。

## Job 恢复

服务重启时 [[src/services/runtime_job_service.py#RuntimeJobService]] `recover_incomplete_jobs` 将所有 `pending`/`running` Job 标记为 `failed`（`error_code=runtime_restarted`）并写失败事件。这避免重启后 Job 永久悬挂，符合「失败不破坏现状」原则。

## 环境探测与工具链

[[src/runtime/environment_probe.py#EnvironmentProbe]] 检测平台/架构、磁盘空间（≥500MB）、解析工具链（python/node/git/venv/hermes_install_dir）。Windows 默认 Hermes 安装根见 [[deployment#程序目录约束]]；不再强制 `D:\Programs`。Node/Git 为可选 Tool Runtime。

工具链路径可由环境变量或 Install API 的 `toolchain` 字段覆盖；空则探测 PATH。`VersionLayout` 计算版本安装根与 staging/download 路径。显式 `-PythonPath` / `TOOLCHAIN_PYTHON_PATH` 须贯穿 bootstrap 与 provision（见 [[deployment#Windows Provision]]）。

## 离线 Wheelhouse 安装

FR-15：Hermes Artifact 含 `wheelhouse/` 时，[[src/services/installation_service.py#InstallationService]] `_pip_install` 使用 `pip install --no-index --find-links wheelhouse <whl>`，禁止安装期访问 PyPI。构建见 `build/hermes-wheelhouse.ps1`。

## Runtime Bundle

FR-14：`build/runtime-bundle.ps1` 产出 `runtime-bundle-win-x64.zip`（`runtime/`、`python/`、`site-packages/`、`scripts/`、`migrations/`、`config/`、`manifest.json`），供无预装 Python/uv/Git/Node 的企业部署。

## Artifact 签名

FR-23：[[src/runtime/artifact_signature.py#ArtifactSignatureVerifier]] 校验 Ed25519 Manifest 信封（`payload`/`keyId`/`signature`/可选 `expiresAt`）；公钥来自配置 `RUNTIME_MANIFEST_PUBLIC_KEYS_JSON`。

## Artifact 下载策略

FR-24：[[src/runtime/archive_policy.py#ArchivePolicy]] 强制 HTTPS、域名白名单、大小/超时、重定向校验、Archive 文件数与解压总量限制、路径穿越拒绝、partial 清理；[[src/runtime/artifact_downloader.py#ArtifactDownloader]] 接入该策略。

## Runtime Service 更新

FR-21/22：Runtime 版本与 Hermes 分离（`serviceVersion` 1.4.0）。[[src/services/runtime_service_update.py#RuntimeServiceUpdateService]] 提供 check/download/apply；表 `runtime_service_versions` 记录下载与应用状态。API：`GET/POST /api/v1/service/update/*`。

## 诊断包

FR-28：[[src/services/diagnostic_bundle_service.py#DiagnosticBundleService]] 生成 ZIP（版本、状态、Job 摘要、日志尾部、环境与配置结构、Manifest 元数据）；禁止 Secret、Token、`.env`、Chat 正文。`POST /api/v1/diagnostics/bundle`。

## 目录布局

[[src/runtime/platform_paths.py#RuntimeLayout]] 定义服务态目录：`versions/`、`downloads/`、`staging/`、`logs/`（含 `service`/`jobs`/`instances`）、`backups/`、`runtime.db`、`active.json`。Windows 默认根 `%LOCALAPPDATA%\HermesRuntime`，其它平台 `~/.hermes-runtime`。服务态与程序目录必须隔离（见 [[design-decisions#服务态与程序目录隔离]]）。
