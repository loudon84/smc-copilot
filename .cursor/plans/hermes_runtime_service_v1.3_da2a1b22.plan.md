---
name: Hermes Runtime Service v1.3
overview: 按 PRD v1.3（全部 7 个阶段）将 ai-os-serve 改造为本机 Hermes Runtime Service：增加基于 Artifact 的 hermes-agent 安装/更新/回滚、统一 Instance、配置/Secret/MCP 管理、设备配对，以及 Windows+macOS 部署；支持可配置工具链（python/node/git/venv/hermes 安装目录）与跨平台运行时路径。
todos:
  - id: foundations
    content: 横切基础：在 core/config.py 增加 RuntimeSettings + ToolchainSettings；platform_paths.py（Windows %LOCALAPPDATA%\HermesRuntime 与 ~/.hermes-runtime）；统一错误信封 + runtime_errors 映射并在 app.py 注册；CapabilityRegistry；更新 .env.example
    status: completed
  - id: phase1
    content: 阶段 1 Runtime Core：runtime_versions/runtime_jobs/runtime_job_events 模型+仓库+Alembic 迁移；RuntimeStatusService/RuntimeJobService/RuntimeJobWorker（单写锁与重启恢复）；/runtime/status|capabilities|jobs 路由；测试
    status: completed
  - id: phase2
    content: 阶段 2 Hermes 安装（+可配置工具链 +跨平台）：EnvironmentProbe（校验用户 python/node/git/venv 路径）、ArtifactDownloader、ChecksumVerifier、VersionLayout、ActivationManager、InstallationService、HermesCliAdapter；POST /runtime/install 支持 toolchain 覆盖；标准错误码；测试
    status: completed
  - id: phase3
    content: 阶段 3 Instance 重构：instances 模型 + InstanceService；Alembic 数据迁移 profiles→instances（保留 id/端口）；GatewaySupervisor 绑定 RuntimeVersion.executable_path（参数数组）；Instance API + 旧 /profiles 适配；测试
    status: completed
  - id: phase4
    content: 阶段 4 更新与回滚：UpdateService/RollbackService/CompatibilityService/ActivationManager；config_snapshots 模型+ConfigSnapshot；版本清理（RUNTIME_MAX_OLD_VERSIONS）；/runtime/update|rollback|versions（全局锁与自动恢复）；测试
    status: completed
  - id: phase5
    content: 阶段 5 配置/Secret/MCP：ConfigurationService+config_adapter；SecretService（Credential Manager/DPAPI，GET 仅返回 configured）；McpService+mcp_adapter+ExecutablePolicy；secret_references+audit_logs 模型；配置/Secret/MCP API；测试
    status: completed
  - id: phase6
    content: 阶段 6 配对与设备 Token：device_pairings+devices 模型；PairingService（challenge/confirm/revoke，仅存 token hash）；Bearer 鉴权替换静态 Token 并保留遗留桥接；device-id 审计；/pairings|/devices API；测试
    status: completed
  - id: phase7
    content: 阶段 7 交付：windows_user_daemon.py（登录计划任务，无需管理员）+ 保留 HermesLocalService 并做端口冲突检测；macOS/Linux daemon 占位；PowerShell precheck/install/upgrade/uninstall/smoke 脚本（暴露工具链路径，卸载保留 ~/.hermes）；冒烟测试
    status: completed
  - id: docs
    content: 文档与最终验收：创建 docs/runtime-*.md；保持 docs/api-contract.md 与 .env.example 同步；执行 ruff + pytest；按 PRD 第 19 节清单记录验收
    status: completed
isProject: false
---

# Hermes Runtime Service v1.3

按 [prd/ver1.3-runtime-service.md](prd/ver1.3-runtime-service.md)，将 [ai-os-serve](src/main.py) 改造为独立、由操作系统启动的 **Hermes Runtime Service**，实施全部 7 个阶段，并额外满足两项需求：

- **跨平台运行时**（Windows + macOS）：安装/探测/目录布局逻辑必须两端可用；本轮 macOS 仅保证跨平台运行时（不做后台 daemon）。
- **可配置工具链**：部署/安装时可指定 `python`、`node`、`git`、`venv`、`hermes-agent` 的安装目录。`node`/`git`/`python` 作为构建/运行前置依赖，需探测并记录；`hermes-agent` 通过下载 Artifact（SHA-256 校验）安装到隔离目录/venv。

## 当前状态（已确认）

- Hermes 假定已在 `PATH` 上，由 [src/core/config.py](src/core/config.py) 中的 `HERMES_GATEWAY_COMMAND=hermes gateway` 调用；尚无安装器。
- Gateway 生命周期在 [src/services/gateway_supervisor.py](src/services/gateway_supervisor.py) + [src/runtime/gateway_process.py](src/runtime/gateway_process.py)，按 `profile_id` 索引。
- 错误处理较散乱（[src/core/errors.py](src/core/errors.py) 中的 `CopilotError` + `ChatApiError`）；无统一错误信封。
- 鉴权为 [src/api/deps.py](src/api/deps.py) 中的静态 Header 校验（`X-Copilot-Desktop-Token`）。
- 迁移基于 Alembic（[migrations/env.py](migrations/env.py)）；启动时不使用 `create_all`（[src/core/lifecycle.py](src/core/lifecycle.py)）。脚本目前仅 Windows。

## 横切基础（优先建设，各阶段复用）

1. **Runtime 配置拆分** — 扩展 [src/core/config.py](src/core/config.py)，增加 `RuntimeSettings` 组：`RUNTIME_HOST/PORT`、`RUNTIME_DATA_DIR/LOG_DIR/DOWNLOAD_DIR/STAGING_DIR/BACKUP_DIR`、`HERMES_MANIFEST_URL`、超时项、`RUNTIME_REQUIRE_AUTH`、`RUNTIME_ALLOW_LEGACY_TOKEN`、`RUNTIME_MAX_OLD_VERSIONS`。启动时将路径规范为绝对路径。保留现有 Hermes/Team-Hub 配置。
2. **工具链配置**（新增需求）— 新增 `ToolchainSettings`：`TOOLCHAIN_PYTHON_PATH`、`TOOLCHAIN_NODE_PATH`、`TOOLCHAIN_GIT_PATH`、`TOOLCHAIN_VENV_DIR`、`HERMES_INSTALL_DIR`。均可选；为空则自动探测。安装 Job 请求可按次覆盖。
3. **平台目录** — 新增 `src/runtime/platform_paths.py`：Windows 为 `%LOCALAPPDATA%\HermesRuntime\`，macOS/Linux 为 `~/.hermes-runtime/`，含 `service/ versions/ downloads/ staging/ logs/ backups/ runtime.db active.json`。`~/.hermes` 用户数据保持独立。
4. **统一错误信封**（§14）— 新增 `src/api/middleware/error_envelope.py` + `src/core/runtime_errors.py`，完成错误码→HTTP 映射；在 [src/app.py](src/app.py) 注册处理器。现有 `ChatApiError` 做桥接，不重写。
5. **能力协商** — 新增 `src/core/capabilities.py` 中的 `CapabilityRegistry`，返回 `features[]` 列表。

## 分阶段实施（每阶段：读代码 → 迁移 → 单测+集成测 → 更新 docs/api-contract.md 与 .env.example → ruff → pytest → 验收记录）

### 阶段 1 — Runtime Core

模型 `runtime_versions`、`runtime_jobs`、`runtime_job_events`（§10.1–10.3）放在 `src/db/models/`，仓库在 `src/db/repositories/`，Alembic 迁移接在当前 head 之后。实现 `RuntimeStatusService`、`RuntimeJobService`、`RuntimeJobWorker`（单写锁、SSE 事件；重启恢复时在 [src/core/lifecycle.py](src/core/lifecycle.py) 将未完成 Job 标为 failed 或可恢复）。新增路由 `runtime.py`、`runtime_jobs.py` 并接入 [src/api/router.py](src/api/router.py)。接口：`/runtime/status`、`/runtime/capabilities`、`/runtime/jobs*`。

### 阶段 2 — Hermes 安装（+可配置工具链 +跨平台）

实现 `EnvironmentProbe`（检测并校验用户提供的 python/node/git/venv 路径、磁盘、网络、平台/架构）、`ArtifactDownloader`、`ChecksumVerifier`、`VersionLayout`（按版本隔离目录；尊重 `HERMES_INSTALL_DIR`/`TOOLCHAIN_VENV_DIR` 覆盖）、`ActivationManager`（原子切换 `active.json`）、`InstallationService`、`HermesCliAdapter`（仅参数数组，禁止 `shell=True`）。`POST /runtime/install` 接受 `version/channel/force/createDefaultInstance`，**并**接受可选 `toolchain{pythonPath,nodePath,gitPath,venvDir,hermesInstallDir}`。安装流程按 §7.3.2，错误码按 §7.3.3；失败时不改动当前 active 版本与用户数据。

### 阶段 3 — Instance 重构

`instances` 模型（§10.4）+ `InstanceService`；Alembic **数据迁移**将现有 `profiles` 转为 instances，保留 ID 与 gateway 端口（§11）。将 [gateway_supervisor.py](src/services/gateway_supervisor.py) 启动路径绑定到 `RuntimeVersion.executable_path`（参数数组 `[hermes, gateway, run, --profile, ..., --port, ...]`）。新增 Instance API（`/instances/*`，含 start/stop/restart/health/logs/events）。旧 `/profiles` API 保留，但经 `InstanceService → ProfileAdapter` 转发；只保留一套 Gateway 生命周期。

### 阶段 4 — 更新与回滚

`UpdateService`、`RollbackService`、`CompatibilityService`、`config_snapshots` 模型（§10.5）+ `ConfigSnapshot`，按 `RUNTIME_MAX_OLD_VERSIONS` 清理版本。接口 `/runtime/update`、`/runtime/rollback`、`/runtime/versions*`。全局 Runtime Lock；更新失败自动恢复先前 active 版本；active/被固定引用的版本不可删除。

### 阶段 5 — 配置、Secret、MCP

`ConfigurationService`（经新 `config_adapter.py`；修改前快照、修改后校验，仅在必要时自动重启）、`SecretService`（Windows Credential Manager/DPAPI，开发环境加密文件；GET 仅返回 `configured`）、`McpService` + `mcp_adapter.py` + `ExecutablePolicy`（白名单、禁止 Shell 字符串、禁止 `cmd /c`/`powershell -Command`、测试超时与清理）。`secret_references` + `audit_logs` 模型（§10.8–10.9）。配置/Secret/MCP API 位于 `/instances/{id}/...` 与 `/secrets/*`。

### 阶段 6 — 配对与设备 Token

`device_pairings` + `devices` 模型（§10.6–10.7），`PairingService`（一次性 challenge、仅 loopback 发起、只存 token hash、可吊销、Token 含 device-id）。将 [src/api/deps.py](src/api/deps.py) 中的静态校验替换为 `Authorization: Bearer`，并保留遗留 `X-Copilot-Desktop-Token` 桥接（标记 Deprecated，由 `RUNTIME_ALLOW_LEGACY_TOKEN` 控制）。写操作记录 device id。接口 `/pairings/*`、`/devices/*`。

### 阶段 7 — 交付与清理（+跨平台）

`src/local_service/windows_user_daemon.py`（任务计划程序登录触发 / Startup，无需管理员），保留 `HermesLocalService`；增加端口冲突检测，避免 daemon 与 service 同时运行。macOS/Linux daemon 文件先做占位（按选择，运行时逻辑已跨平台）。PowerShell 脚本：`runtime-precheck/install/upgrade/uninstall/smoke-test-windows.ps1`（卸载默认保留 `~/.hermes`）。安装脚本暴露可配置工具链路径。

## 测试、文档、脚本

- 单元：Job/Version/Instance 状态机、端口分配、路径校验、Checksum、配置快照、Secret 脱敏、MCP 命令策略、配对 challenge、Token Hash。
- 集成：安装 → 默认 Instance → Gateway 健康 → Chat SSE → 停止/重启 → 配置修改 → MCP 测试 → 更新 → 回滚 → Backup/Restore（通过现有 [scripts/mock_hermes_gateway.py](scripts/mock_hermes_gateway.py) mock Manifest/Artifact 与 Gateway）。
- 失败：下载中断、Checksum 不匹配、磁盘不足、Doctor 失败、Gateway 超时/被 Kill、配置迁移失败、端口占用、Job 中断、Token 过期、MCP 超时。
- 文档：创建 `docs/runtime-architecture.md`、`runtime-installation.md`、`runtime-versioning.md`、`runtime-security.md`、`runtime-desktop-contract.md`；每阶段更新 [docs/api-contract.md](docs/api-contract.md) 与 `.env.example`。

## 护栏（PRD §21）

禁止一次性重写全部源码；按阶段做 Migration（禁止 `create_all`）；禁止 `shell=True`；Hermes CLI 仅经 Adapter；禁止返回 Secret；保留 `/profiles` API；Runtime Core 不得 import Task/Team-Hub 模块；配对验证通过前保留旧 Desktop Spawn 逻辑。
