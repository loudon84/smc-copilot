# Hermes Runtime 安装

## 前置条件

部署或安装时，用户可覆盖工具链路径：

| 环境变量 / 请求字段 | 用途 |
|---------------------|------|
| `TOOLCHAIN_PYTHON_PATH` / `pythonPath` | Python 3.12+ 可执行文件或目录 |
| `TOOLCHAIN_NODE_PATH` / `nodePath` | Node 可执行文件或目录 |
| `TOOLCHAIN_GIT_PATH` / `gitPath` | Git 可执行文件或目录 |
| `TOOLCHAIN_VENV_DIR` / `venvDir` | 隔离 venv 根目录 |
| `HERMES_INSTALL_DIR` / `hermesInstallDir` | Hermes 版本安装根目录 |

空值表示通过 `PATH` 自动探测。

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
    "venvDir": "D:\\hermes-venvs",
    "hermesInstallDir": "D:\\hermes-versions"
  }
}
```

返回 `{ "jobId", "status" }`。进度通过 `GET /api/v1/runtime/jobs/{id}/events`（SSE）获取。

## Manifest

将 `HERMES_MANIFEST_URL` 设为包含 `url`、`sha256`、`version` 的 JSON 文档，可选 `releases[]`。

## Windows 脚本

```powershell
.\scripts\runtime-precheck-windows.ps1 -PythonPath ... -NodePath ... -GitPath ...
.\scripts\runtime-install-windows.ps1 -UserDaemon
.\scripts\runtime-smoke-test-windows.ps1
.\scripts\runtime-uninstall-windows.ps1   # 默认保留 ~/.hermes
```
