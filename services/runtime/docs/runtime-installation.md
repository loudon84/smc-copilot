# Hermes Runtime 安装

v1.3.1 hotfix：生产安装**禁止 Stub Hermes**；Job 成功仅当 `realExecutableVerified: true`。Windows 推荐一条 Provision 链路完成闭环。

## 前置条件

部署或安装时，用户可覆盖工具链路径：

| 环境变量 / 请求字段 | 用途 |
|---------------------|------|
| `TOOLCHAIN_PYTHON_PATH` / `pythonPath` | Python 3.12+ 可执行文件或目录 |
| `TOOLCHAIN_NODE_PATH` / `nodePath` | Node 可执行文件或目录 |
| `TOOLCHAIN_GIT_PATH` / `gitPath` | Git 可执行文件或目录 |
| `TOOLCHAIN_VENV_DIR` / `venvDir` | 可选；空则 `<HERMES_INSTALL_DIR>/<version>/venv` |
| `HERMES_INSTALL_DIR` / `hermesInstallDir` | Windows 默认 `D:\Programs\HermesAgent`（须在 `D:\Programs` 下） |

Python/Node/Git 空值表示通过 `PATH` 自动探测。Windows 上 `HERMES_INSTALL_DIR` / `TOOLCHAIN_VENV_DIR` 必须位于 `D:\Programs`；**服务态**仍用 `%LOCALAPPDATA%\HermesRuntime`（`RUNTIME_DATA_DIR` 默认空即可）。

显式 `-PythonPath` 会写入 `.env` 的 `TOOLCHAIN_PYTHON_PATH`，并由 `bootstrap-windows.ps1` 传给 `uv venv --python`。

## 安装接口

```http
POST /api/v1/runtime/install
```

```json
{
  "version": "latest",
  "channel": "stable",
  "force": false,
  "createDefaultInstance": true,
  "toolchain": {
    "pythonPath": "C:\\Python312\\python.exe",
    "nodePath": "C:\\Program Files\\nodejs",
    "gitPath": "C:\\Program Files\\Git\\cmd\\git.exe",
    "hermesInstallDir": "D:\\Programs\\HermesAgent"
  }
}
```

Artifact 必须含 `.whl` 或带 `pyproject.toml`/`setup.py` 的源码包，否则 Job `failed`（`artifact_not_installable`）。成功结果含：

```json
{
  "resolvedVersion": "0.19.0",
  "executablePath": "...",
  "instanceId": "...",
  "doctorOk": true,
  "realExecutableVerified": true,
  "stub": false
}
```

进度通过 `GET /api/v1/runtime/jobs/{id}/events`（SSE）获取。

## Manifest

将 `HERMES_MANIFEST_URL` 设为包含 `url`、`sha256`、`version`、`artifactType` 等字段的 JSON；`releases[]` 时按 channel/platform/arch 过滤后取 **semver 最高**，不依赖数组顺序。

## Windows Provision（推荐）

Restricted 环境下用 `.cmd` 入口（仅进程级 Bypass，不改系统 ExecutionPolicy）：

```cmd
cd /d D:\Programs\copilot-serve
scripts\runtime-provision-windows.cmd -PythonPath C:\Python312\python.exe -AllowExistingRuntime
```

编排顺序：precheck → install Runtime → health → `POST /runtime/install` → poll → instance/secret/start → smoke → **最后** UserDaemon。

分步脚本：

```powershell
cd D:\Programs\copilot-serve
.\scripts\runtime-precheck-windows.ps1 -RepoRoot $PWD -PythonPath ... -AllowExistingRuntime
.\scripts\runtime-install-windows.ps1 -PythonPath ...   # 勿在冒烟前装 UserDaemon
.\scripts\runtime-start-windows.cmd
.\scripts\runtime-smoke-test-windows.ps1 -RequireHermes -RequireGateway
.\scripts\runtime-uninstall-windows.ps1
# 默认保留 %LOCALAPPDATA%\HermesRuntime、D:\Programs\HermesAgent、~/.hermes
```

## 回滚

安装/激活失败不改当前 active 版本与 `~/.hermes`。版本回滚见 `POST /api/v1/runtime/rollback` 与 [runtime-versioning.md](runtime-versioning.md)。
