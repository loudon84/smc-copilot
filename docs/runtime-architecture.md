# Hermes Runtime 架构

`ai-os-serve` / `smc-copilot-serve` 是本机 **Hermes Runtime Service**。

## 边界

```text
copilot-desktop  --REST/SSE-->  Runtime Service  --CLI/HTTP-->  hermes-agent
```

Desktop 不得自行安装 Python/Hermes、拉起 Gateway，也不得直接读写 `~/.hermes`。

## 目录布局

| 用途 | Windows | macOS / Linux |
|------|---------|---------------|
| Runtime **服务态**（DB/日志/downloads/staging） | `%LOCALAPPDATA%\HermesRuntime\`（默认，不改动） | `~/.hermes-runtime/` |
| 源码 / serve `.venv` | `D:\Programs\copilot-serve\` | 任意工作目录 |
| Hermes 版本与 Agent venv | `D:\Programs\HermesAgent\<version>\` | `HERMES_INSTALL_DIR` 或 Runtime `versions/` |
| Hermes 用户数据 | `~/.hermes/` | `~/.hermes/` |

服务态与程序安装目录分离：Windows 企业策略要求程序与 venv 在 `D:\Programs` 下，但 **不** 把服务态迁出 LOCALAPPDATA。

## 模块映射

| 区域 | 路径 |
|------|------|
| API | `src/api/v1/runtime.py`、`instances.py`、`pairings.py` 等 |
| Services | `src/services/runtime_*`、`installation_service.py`、`instance_service.py` |
| Runtime | `src/runtime/platform_paths.py`、`environment_probe.py`、`artifact_downloader.py` |
| Hermes adapters | `src/integrations/hermes/cli_adapter.py`、`config_adapter.py`、`mcp_adapter.py` |
| Local service | `src/local_service/windows_user_daemon.py` |

## 能力协商

`GET /api/v1/runtime/capabilities` 返回 `features[]`。不得仅凭版本号判断接口是否可用。
