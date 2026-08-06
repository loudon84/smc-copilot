# smc-copilot-serve（Hermes Runtime Service）

本机常驻的 **Hermes Runtime Service**：负责 Hermes Agent 安装/更新/回滚、Instance/Gateway 监管、配置与 MCP、设备配对与本地鉴权，以及 v1.5 企业终端 Endpoint Sync（Desired State / Remote Task / Experience）。Desktop 通过 `http://127.0.0.1:8765` 访问本服务。

| 组件 | 职责 |
|------|------|
| copilot-desktop | UI、登录、连接 Runtime |
| **smc-copilot-serve** | Runtime 控制面（本仓库） |
| hermes-agent | Agent 执行引擎 |

更多设计文档：

- [docs/runtime-architecture.md](docs/runtime-architecture.md)
- [docs/runtime-installation.md](docs/runtime-installation.md)
- [docs/runtime-desktop-contract.md](docs/runtime-desktop-contract.md)
- [docs/api-contract.md](docs/api-contract.md)
- [docs/INDEX.md](docs/INDEX.md)

文档描述性文字仅使用简体中文；文件路径、API、类名、环境变量、代码片段保持原文。


---

## 安装约定（Windows 企业）

1. 推荐使用签名的 `SMC-Copilot-Runtime-Setup-1.5.0.exe` / MSI 静默安装（`/quiet`），由 Bundle 携带嵌入式 Python，员工机无需预装 Python/Node/Git。
2. 开发态可将仓库放在任意目录；默认程序根为 `%LOCALAPPDATA%\Programs\SMC\{CopilotRuntime,HermesAgent}`。
3. Hermes Agent 版本与其 venv 安装到 `HERMES_INSTALL_DIR`（Windows 默认上述 SMC 路径）。
4. **Runtime 服务态**（DB / 日志 / downloads / staging）继续使用 `%LOCALAPPDATA%\HermesRuntime`，与程序目录分离。

允许例外：`%USERPROFILE%\.hermes`（Hermes 用户数据）、`%LOCALAPPDATA%\HermesRuntime`（服务态）。

---

## 目录约定

| 用途 | Windows | macOS / Linux |
|------|---------|---------------|
| Runtime **服务态**（DB/日志/staging） | `%LOCALAPPDATA%\HermesRuntime\` | `~/.hermes-runtime/` |
| 本仓库 / serve `.venv` | `%LOCALAPPDATA%\Programs\SMC\CopilotRuntime\`（或开发工作目录） | 任意工作目录 |
| Hermes Agent 版本 / venv | `%LOCALAPPDATA%\Programs\SMC\HermesAgent\<version>\` | `HERMES_INSTALL_DIR` 或 Runtime `versions/` |
| Hermes 用户数据 | `%USERPROFILE%\.hermes\` | `~/.hermes/` |

服务态与程序目录必须隔离：升级或卸载程序时默认 **不得**删除 `~/.hermes`；服务态仅在显式 `-RemoveRuntimeData` 时清理。

---

## 快速开始（开发）

代码布局为扁平 `src/`（`PYTHONPATH=src` 或 editable install）。

```bash
cd copilot-serve
cp .env.example .env
# 建议至少配置 HERMES_MANIFEST_URL（见下文「Hermes Agent 安装」）

# 方式 A：uv（推荐）
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn main:app --app-dir src --reload --host 127.0.0.1 --port 8765

# 方式 B：pip
pip install -e ".[dev]"
alembic upgrade head
uvicorn main:app --app-dir src --reload --host 127.0.0.1 --port 8765
```

健康检查：

```bash
curl http://127.0.0.1:8765/api/v1/health
curl http://127.0.0.1:8765/api/v1/runtime/status
curl http://127.0.0.1:8765/api/v1/runtime/capabilities
```

### SQLite

| 场景 | `SQLITE_PATH` |
|------|----------------|
| 默认 | `~/.hermes/desktop/sqlite.db` |
| 仓库内调试 | `./data/sqlite.db` |
| Desktop 集成 | 由 Main 注入绝对路径 |

生产/开发启动前执行 `alembic upgrade head`；应用启动时**不会** `create_all`。

```bash
alembic upgrade head
pytest
```

---

## 部署说明（v1.3 / v1.3.1 hotfix）

### 1. 前置条件

| 依赖 | 说明 |
|------|------|
| Python 3.12 | Runtime Service 自身运行时 |
| 网络 | 下载 Hermes Artifact（或本地 `file://` Manifest） |
| 可选 | Node、Git（Hermes 构建/工具链前置；可自定义路径） |

默认只监听 **`127.0.0.1`**，不要默认绑定 `0.0.0.0`。v1.3.1：仅真实 Hermes Artifact 可安装成功（禁止 Stub）。

### 2. 可配置工具链路径

部署或安装时允许用户指定安装目录（为空则自动探测 `PATH`）：

| 环境变量 | Install API 字段 | 含义 |
|----------|------------------|------|
| `TOOLCHAIN_PYTHON_PATH` | `toolchain.pythonPath` | Python 可执行文件或目录 |
| `TOOLCHAIN_NODE_PATH` | `toolchain.nodePath` | Node 可执行文件或目录 |
| `TOOLCHAIN_GIT_PATH` | `toolchain.gitPath` | Git 可执行文件或目录 |
| `TOOLCHAIN_VENV_DIR` | `toolchain.venvDir` | 可选；空则用 `<HERMES_INSTALL_DIR>/<version>/venv` |
| `HERMES_INSTALL_DIR` | `toolchain.hermesInstallDir` | Windows 默认 `D:\Programs\HermesAgent` |

其他常用项见 [`.env.example`](.env.example)：

| 变量 | 说明 |
|------|------|
| `RUNTIME_HOST` / `RUNTIME_PORT` | 默认 `127.0.0.1:8765`（优先于 `COPILOT_*`） |
| `RUNTIME_DATA_DIR` | 服务态根；空=Windows `%LOCALAPPDATA%\HermesRuntime`（保持默认即可） |
| `HERMES_HOME` | Hermes 用户数据；默认 `~/.hermes` |
| `HERMES_MANIFEST_URL` | Hermes 版本 Manifest（必配才可走安装 Job） |
| `RUNTIME_REQUIRE_AUTH` | 生产建议 `true` |
| `RUNTIME_ALLOW_LEGACY_TOKEN` | 是否兼容旧 `X-Copilot-Desktop-Token` |
| `RUNTIME_ALLOW_INSECURE_SECRET_STORE` | 仅开发：DPAPI 不可用时允许 XOR 文件存储（默认 `false`） |

### 3. Windows 部署

#### 3.0 一键 Provision（推荐，v1.3.1）

Restricted 策略下用 `.cmd`（仅进程级 Bypass）：

```cmd
cd /d D:\Programs\copilot-serve
scripts\runtime-provision-windows.cmd -PythonPath C:\Python312\python.exe
```

顺序：precheck → Runtime → Hermes install → Instance → smoke → **最后** UserDaemon。详见 [docs/runtime-installation.md](docs/runtime-installation.md)。

#### 3.1 预检与安装脚本

```powershell
cd D:\Programs\copilot-serve

# 预检（Python/Node/Git 可传绝对路径；HermesInstallDir 默认 D:\Programs\HermesAgent）
.\scripts\runtime-precheck-windows.ps1 `
  -RepoRoot $PWD `
  -PythonPath "C:\Python312\python.exe" `
  -NodePath "C:\Program Files\nodejs\node.exe" `
  -GitPath "C:\Program Files\Git\cmd\git.exe"

# 引导 .venv / 依赖 / .env / 迁移；默认不改 RUNTIME_DATA_DIR（服务态仍 LOCALAPPDATA）
# v1.3.1：勿在烟测前加 -UserDaemon；请用 provision 脚本在 smoke 通过后安装
.\scripts\runtime-install-windows.ps1 `
  -PythonPath "C:\Python312\python.exe" `
  -NodePath "C:\Program Files\nodejs" `
  -GitPath "C:\Program Files\Git\cmd\git.exe" `
  -HermesInstallDir "D:\Programs\HermesAgent"
```

手动启动（开发或未启用 UserDaemon 时）：

```powershell
scripts\runtime-start-windows.cmd
# 或: uv run uvicorn main:app --app-dir src --host 127.0.0.1 --port 8765
```

烟测（要求真实 Hermes + Gateway）：

```powershell
.\scripts\runtime-smoke-test-windows.ps1 -RequireHermes -RequireGateway
```

#### 3.2 用户级后台（推荐，无需管理员）

登录时由任务计划触发，与 Desktop 生命周期解耦：

```powershell
uv run python -m local_service.windows_user_daemon install
uv run python -m local_service.windows_user_daemon status
uv run python -m local_service.windows_user_daemon check-port --port 8765
uv run python -m local_service.windows_user_daemon uninstall
```

若 8765 已被占用，安装会拒绝，避免与企业 Windows Service 或其它进程冲突。

#### 3.3 企业 Windows Service（可选）

需要管理员；**不要**与 UserDaemon / Desktop spawn 同时监听同一端口：

```powershell
uv sync --extra service
uv run ai-copilot-service install
uv run ai-copilot-service start
```

服务名：`HermesLocalService`。

#### 3.4 升级 / 卸载 / 冒烟

```powershell
# 升级本服务包与数据库迁移（Hermes Agent 版本走 API）
.\scripts\runtime-upgrade-windows.ps1

# 冒烟（服务已启动）
.\scripts\runtime-smoke-test-windows.ps1

# 卸载：默认保留 ~/.hermes；可选清理 Runtime 数据
.\scripts\runtime-uninstall-windows.ps1
# .\scripts\runtime-uninstall-windows.ps1 -RemoveRuntimeData
# .\scripts\runtime-uninstall-windows.ps1 -RemoveHermesUserData   # 慎用
```

### 4. macOS / Linux 部署

本版本保证 **Runtime 逻辑跨平台**（安装探测、目录布局、API）。macOS/Linux 后台 daemon 为占位，正式 LaunchAgent / systemd 用户单元后续补齐。

```bash
cd copilot-serve
cp .env.example .env
# 编辑 TOOLCHAIN_* / HERMES_INSTALL_DIR / HERMES_MANIFEST_URL / RUNTIME_DATA_DIR

uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn main:app --app-dir src --host 127.0.0.1 --port 8765
```

可将上述命令写入登录项或自行配置 LaunchAgent / systemd user service。Daemon 占位入口：

```bash
uv run python -m local_service.launch_agent status          # macOS stub
uv run python -m local_service.systemd_user_service status  # Linux stub
```

### 5. 安装 Hermes Agent（Runtime API）

1. 配置 Manifest：`HERMES_MANIFEST_URL` 指向含 `version` / `url` / `sha256` 的 JSON（也支持 `file://` 本地 Manifest）。
2. 启动 Runtime Service。
3. 发起安装 Job：

```http
POST /api/v1/runtime/install
Content-Type: application/json

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

返回 `{ "jobId", "status" }`。查询进度：

- `GET /api/v1/runtime/jobs/{jobId}`
- `GET /api/v1/runtime/jobs/{jobId}/events`（SSE）

其它：

| 操作 | 接口 |
|------|------|
| 状态 | `GET /api/v1/runtime/status` |
| 更新 | `POST /api/v1/runtime/update` |
| 回滚 | `POST /api/v1/runtime/rollback` |
| Doctor | `POST /api/v1/runtime/doctor` |
| Instance 启停 | `POST /api/v1/instances/{id}/start\|stop\|restart` |

失败时不会破坏当前 active 版本与 `~/.hermes` 用户数据。

### 6. Desktop 接入与鉴权

生产期望：

```text
用户登录 → OS 启动 Runtime → Desktop 连接 Runtime（不默认 spawn）
Desktop 退出 → Runtime 与 Gateway 按策略继续运行
```

设备配对（推荐）：

```http
POST /api/v1/pairings/start          # 仅 loopback
POST /api/v1/pairings/{id}/confirm   # 返回 deviceToken（仅存 Main，勿进 Renderer）
```

后续请求：

```http
Authorization: Bearer <device-token>
```

兼容期可使用 `X-Copilot-Desktop-Token`（`RUNTIME_ALLOW_LEGACY_TOKEN=true`）。契约细节见 [docs/runtime-desktop-contract.md](docs/runtime-desktop-contract.md)。

### 7. 与旧 Desktop Spawn 的关系

历史路径：安装器释放到 `%LOCALAPPDATA%\Programs\SMC Copilot\runtime\copilot-serve`，并设置 `COPILOT_SERVE_ROOT` / `COPILOT_SERVE_PYTHON`，由 Desktop Main spawn。

v1.3 起生产默认改为 **连接常驻 Runtime**；开发模式仍可显式 spawn 测试实例，但勿与 UserDaemon / Windows Service 同时占用 8765。

---

## 常见问题

| 现象 | 处理 |
|------|------|
| 安装 Job 报 `manifest_invalid` | 检查 `HERMES_MANIFEST_URL` |
| `python_runtime_failed` | 设置 `TOOLCHAIN_PYTHON_PATH` 或安装 Python 3.12+ |
| 端口冲突 | `windows_user_daemon check-port`；停掉重复的 Service/spawn |
| Desktop 无法写接口 | 完成配对或开启遗留 Token；确认 `RUNTIME_REQUIRE_AUTH` |
| 卸载后想保留对话/配置 | 默认已保留 `~/.hermes`；勿加 `-RemoveHermesUserData` |

验收记录：[docs/runtime-acceptance-v1.3.md](docs/runtime-acceptance-v1.3.md)；v1.3.1 hotfix：[docs/runtime-acceptance-v1.3.1.md](docs/runtime-acceptance-v1.3.1.md)。
