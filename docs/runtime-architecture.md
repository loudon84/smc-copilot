# Hermes Runtime 架构

`ai-os-serve` / `smc-copilot-serve` 是本机 **Hermes Runtime Service**。

## 边界

```text
copilot-desktop  --REST/SSE-->  Runtime Service  --CLI/HTTP-->  hermes-agent
```

Desktop 不得自行安装 Python/Hermes、拉起 Gateway，也不得直接读写 `~/.hermes`。

## 目录布局

- 程序与版本数据：Windows 为 `%LOCALAPPDATA%\HermesRuntime\`，macOS/Linux 为 `~/.hermes-runtime/`
- 用户数据：`~/.hermes/`（不得放入版本目录）

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
