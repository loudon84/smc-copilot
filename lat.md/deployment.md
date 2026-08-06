# 部署形态

v1.3 生产默认连接常驻 Runtime；v1.3.1 补齐 Windows 真实 Hermes 闭环：`.cmd` Bypass、`-PythonPath` 贯穿、Provision 编排，且 UserDaemon 仅在 smoke 通过后安装。

相关：[[runtime-service#目录布局]]、[[design-decisions#服务态与程序目录隔离]]、[[tests#部署与端口]]。

## Windows 用户级后台

[[src/local_service/windows_user_daemon.py]] 用 `schtasks /Create /SC ONLOGON /RL LIMITED` 注册登录即启任务（`HermesRuntimeUserDaemon`），免管理员。`install` 前检测 8765：非 `--replace` 时端口占用则拒绝；`install --replace` 会停止本机 Runtime、等待端口释放后重装任务并启动。另支持 `start`/`stop`/`restart`/`repair`/`status --json`。

CLI：`python -m local_service.windows_user_daemon install|install --replace|uninstall|status|status --json|check-port|start|stop|restart|repair`。

## Windows Installer（生产门禁）

v1.5 FR-04：`installer/wix/` 与 `installer/bootstrapper/` 产出 MSI/`Setup.exe`（版本 1.5.0）。Stable 通道构建缺少 WiX/MSI/签名必须失败。维护进程见 [[src/local_service/runtime_maintenance.py#apply_maintenance]]，由 [[src/services/runtime_service_update.py#RuntimeServiceUpdateService]] `apply()` 调度。

## Windows Provision

`scripts/runtime-provision-windows.ps1`（经 `.cmd`）完成 precheck→Runtime→Hermes install→instance/start→smoke，最后装 UserDaemon。

入口 `.cmd` 仅进程级 `ExecutionPolicy Bypass`。`-PythonPath` 写入 `TOOLCHAIN_PYTHON_PATH` 并传 bootstrap/`uv venv --python`。8765 若已被健康 Runtime 占用需 `-AllowExistingRuntime`，否则失败。

## Windows 服务

**EXPERIMENTAL** — v1.4 默认不用 LocalSystem Windows Service。生产使用 per-user Task Scheduler（见 [[deployment#Windows 用户级后台]]）。

[[src/local_service/windows_service.py]]（服务名 `HermesLocalService`）经 `pywin32` 实现，`SvcDoRun` 在工作线程跑 `run_local_service`，`SvcStop` 经 `request_shutdown` 优雅停止。需管理员安装（`uv sync --extra service` + `ai-copilot-service install`）。非 win32 平台提供同名占位类。绑定使用 `bind_host`/`bind_port`。

## 程序目录约束

v1.4（FR-13）取消固定 `D:\Programs`。默认用户级 `%LOCALAPPDATA%\Programs\SMC\{CopilotRuntime,HermesAgent}`；可选机器级 `%ProgramFiles%\SMC\...`。服务态仍用 `%LOCALAPPDATA%\HermesRuntime` 与 `%USERPROFILE%\.hermes`。

[[src/runtime/windows_program_paths.py]] 提供默认路径、[[src/runtime/windows_program_paths.py#detect_legacy_install_paths]] 检测旧 `D:\Programs\copilot-serve` / `HermesAgent`（供迁移，不自动删除）。`enforce_windows_program_paths` 不再强制单一根目录；Node/Git 在 precheck 中为可选。

## 跨平台

macOS/Linux 的 Runtime 逻辑（探测、目录、API）与 Windows 一致；后台 daemon 为占位（`local_service.launch_agent` / `local_service.systemd_user_service`），正式 LaunchAgent / systemd user unit 后续补齐。默认绑定 `127.0.0.1`，勿默认 `0.0.0.0`。

## 目录布局

服务态与程序目录分离，升级/卸载程序不删 `~/.hermes`。

| 用途 | Windows | macOS/Linux |
|------|---------|-------------|
| Runtime 服务态 | `%LOCALAPPDATA%\HermesRuntime\` | `~/.hermes-runtime/` |
| 本仓库 / serve | `%LOCALAPPDATA%\Programs\SMC\CopilotRuntime\`（默认） | 任意工作目录 |
| Hermes 版本 / Agent venv | `%LOCALAPPDATA%\Programs\SMC\HermesAgent\<version>\` | `HERMES_INSTALL_DIR` 或 Runtime `versions/` |
| Hermes 用户数据 | `%USERPROFILE%\.hermes\` | `~/.hermes/` |

升级/卸载程序时默认不删 `~/.hermes`；服务态仅在显式 `-RemoveRuntimeData` 时清理。详见 [[runtime-service#目录布局]]。
