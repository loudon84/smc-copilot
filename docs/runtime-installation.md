# Hermes Runtime 安装

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

Windows 示例省略 `venvDir` 时，venv 落在 `D:\Programs\HermesAgent\<version>\venv`。

返回 `{ "jobId", "status" }`。进度通过 `GET /api/v1/runtime/jobs/{id}/events`（SSE）获取。

## Manifest

将 `HERMES_MANIFEST_URL` 设为包含 `url`、`sha256`、`version` 的 JSON 文档，可选 `releases[]`。

## Windows 脚本

```powershell
cd D:\Programs\copilot-serve
.\scripts\runtime-precheck-windows.ps1 -RepoRoot $PWD -PythonPath ... -NodePath ... -GitPath ...
.\scripts\runtime-install-windows.ps1 -UserDaemon
.\scripts\runtime-smoke-test-windows.ps1
.\scripts\runtime-uninstall-windows.ps1
# 默认保留 %LOCALAPPDATA%\HermesRuntime、D:\Programs\HermesAgent、~/.hermes
# 清理服务态与 HermesAgent：-RemoveRuntimeData；清理用户数据：-RemoveHermesUserData
```
