# 部署形态

v1.3 生产默认改为「连接常驻 Runtime」，与 Desktop 生命周期解耦。Runtime 逻辑跨平台；Windows 提供用户级后台（推荐，免管理员）与企业 Service（可选）。不要让 UserDaemon / Service / Desktop spawn 同时监听 8765。

相关：[[runtime-service#目录布局]]、[[design-decisions#服务态与程序目录隔离]]、[[tests#部署与端口]]。

## Windows 用户级后台

[[src/local_service/windows_user_daemon.py]] 用 `schtasks /Create /SC ONLOGON /RL LIMITED` 注册登录即启的 Task Scheduler 任务（任务名 `HermesRuntimeUserDaemon`），免管理员。`install` 前先 `detect_port_conflict`，8765 已占用则拒绝安装，避免与企业 Service 或其它进程冲突。

CLI：`python -m local_service.windows_user_daemon install|uninstall|status|check-port`。

## Windows 服务

[[src/local_service/windows_service.py]]（服务名 `HermesLocalService`）经 `pywin32` 实现，`SvcDoRun` 在工作线程跑 `run_local_service`，`SvcStop` 经 `request_shutdown` 优雅停止。需管理员安装（`uv sync --extra service` + `ai-copilot-service install`）。非 win32 平台提供同名占位类。

## 程序目录约束

企业 Windows 下程序必须在 `D:\Programs` 下，服务态例外。

[[src/runtime/windows_program_paths.py]] 固定该根：`DEFAULT_HERMES_INSTALL_DIR=D:\Programs\HermesAgent`、`DEFAULT_COPILOT_SERVE_DIR=D:\Programs\copilot-serve`。`require_under_programs_root` 在安装/探测期强制 `HERMES_INSTALL_DIR`/`TOOLCHAIN_VENV_DIR` 位于其下；服务态 `RUNTIME_DATA_DIR` 例外（仍走 `%LOCALAPPDATA%\HermesRuntime`）。

## 跨平台

macOS/Linux 的 Runtime 逻辑（探测、目录、API）与 Windows 一致；后台 daemon 为占位（`local_service.launch_agent` / `local_service.systemd_user_service`），正式 LaunchAgent / systemd user unit 后续补齐。默认绑定 `127.0.0.1`，勿默认 `0.0.0.0`。

## 目录布局

服务态与程序目录分离，升级/卸载程序不删 `~/.hermes`。

| 用途 | Windows | macOS/Linux |
|------|---------|-------------|
| Runtime 服务态 | `%LOCALAPPDATA%\HermesRuntime\` | `~/.hermes-runtime/` |
| 本仓库 / serve venv | `D:\Programs\copilot-serve\` | 任意工作目录 |
| Hermes 版本 / Agent venv | `D:\Programs\HermesAgent\<version>\` | `HERMES_INSTALL_DIR` 或 Runtime `versions/` |
| Hermes 用户数据 | `%USERPROFILE%\.hermes\` | `~/.hermes/` |

升级/卸载程序时默认不删 `~/.hermes`；服务态仅在显式 `-RemoveRuntimeData` 时清理。详见 [[runtime-service#目录布局]]。
