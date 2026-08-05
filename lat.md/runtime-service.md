# Hermes Runtime Service

v1.3 起 `smc-copilot-serve` 定位为本机常驻 Runtime，接管 Hermes Agent 的安装、更新、回滚与版本激活，并通过 Instance 统一 Profile/Gateway/Runtime Version。所有写操作经异步 Job 队列串行化，失败不破坏当前 active 版本与 `~/.hermes` 用户数据。

相关：[[gateway-supervisor#Gateway 监管]]、[[data-model#Runtime 表]]、[[deployment#目录布局]]。

## 版本管理

[[src/db/models/runtime.py#RuntimeVersion]] 记录每个已安装 Hermes 版本的 `install_path`、`executable_path`、`python_path`、`checksum` 与 `status`。状态机见 [[src/core/runtime_enums.py#RuntimeVersionStatus]]：`installed → active ↔ inactive`，可标记 `invalid`/`pending_delete`。

[[src/db/repositories/runtime_repo.py#RuntimeVersionRepository]] 负责 `set_active`：先 `deactivate_all` 再置单条为 `active`，保证全局唯一 active 版本。删除 active 版本或被 Instance 引用的版本会被拒绝（见 `api/v1/runtime.py` `delete_runtime_version`）。`active.json` 由 [[src/runtime/environment_probe.py#ActivationManager]] 原子写入（tmp + replace），作为 DB 之外的快速激活指针。

## 安装 Job

[[src/services/installation_service.py#InstallationService]] `run_job` 执行阶段化安装：环境探测 → 拉 Manifest → 下载 Artifact → 校验 SHA256 → 解压到 staging → 建 venv → `pip install` → 读版本/`config migrate`/`doctor` → 写 `RuntimeVersion` 并激活 → 原子写 `active.json`。`force` 跳过已安装检查；`createDefaultInstance` 顺带创建 default Instance。

Manifest 解析支持扁平或 `releases[]` 形式，按 `channel`/`platform`/`architecture` 过滤。`HERMES_MANIFEST_URL` 未配置或缺失 `url`/`sha256` 时报 `manifest_invalid`。无真实包时回退写 `hermes` stub，保证受限环境 Job 可完成。staging 在 finally 中清理。

## 更新与回滚

更新与回滚复用同一 Job 队列（`update`/`rollback` 类型），由 `UpdateService`/`RollbackService` 处理（在 [[src/core/lifecycle.py#lifespan]] 中注册）。写类 Job 互斥：见 [[runtime-service#运行时 Job 队列]]。失败时保留当前 active 版本，不破坏 `~/.hermes`。

## 运行时 Job 队列

[[src/services/runtime_job_service.py#RuntimeJobService]] 用 `asyncio.Queue` + 单 worker 串行执行 Job。`create_job` 校验类型；对写类 Job（install/update/rollback/restore/config_migrate/runtime_cleanup，见 `WRITE_JOB_TYPES`）检查 `find_active_write_job`，存在未完成写 Job 则抛 `runtime_lock_conflict`。

Job 状态机见 [[src/core/runtime_enums.py#RuntimeJobStatus]]：`pending → running → succeeded/failed/cancelled`。进度经 `progress` 回调写 `RuntimeJobEvent`（带递增 `sequence`）。事件可通过 `iter_events` 以 SSE 推送（`GET /runtime/jobs/{id}/events`）。`doctor`/`backup` 等无 handler 的类型以 stub 完成。

## Job 恢复

服务重启时 [[src/services/runtime_job_service.py#RuntimeJobService]] `recover_incomplete_jobs` 将所有 `pending`/`running` Job 标记为 `failed`（`error_code=runtime_restarted`）并写失败事件。这避免重启后 Job 永久悬挂，符合「失败不破坏现状」原则。

## 环境探测与工具链

[[src/runtime/environment_probe.py#EnvironmentProbe]] 检测平台/架构、磁盘空间（≥500MB）、解析工具链（python/node/git/venv/hermes_install_dir）。`require_ready` 在 Windows 上强制 [[src/runtime/windows_program_paths.py#require_under_programs_root]] 校验 `HERMES_INSTALL_DIR`/`TOOLCHAIN_VENV_DIR` 位于 `D:\Programs` 下（见 [[deployment#程序目录约束]]）。

工具链路径可由环境变量或 Install API 的 `toolchain` 字段覆盖；空则探测 PATH。`VersionLayout` 计算版本安装根与 staging/download 路径。

## 目录布局

[[src/runtime/platform_paths.py#RuntimeLayout]] 定义服务态目录：`versions/`、`downloads/`、`staging/`、`logs/`（含 `service`/`jobs`/`instances`）、`backups/`、`runtime.db`、`active.json`。Windows 默认根 `%LOCALAPPDATA%\HermesRuntime`，其它平台 `~/.hermes-runtime`。服务态与程序目录必须隔离（见 [[design-decisions#服务态与程序目录隔离]]）。
