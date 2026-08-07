# 结论

Hermes Desktop 在 Windows 10 内部部署不应继续按 Linux/WSL 路径改造，而应改成 **Windows Native Runtime 优先、WSL2 Runtime 作为可选适配器、Remote Runtime 作为兜底**。

原因很直接：Hermes Agent 当前官方已经提供 Windows Native 早期 Beta 安装路径，支持 Windows 10/11，不需要 WSL、Cygwin、Docker，安装到 `%LOCALAPPDATA%\hermes\`，并通过 PowerShell `install.ps1` 自动处理 uv、Python 3.11、Node.js、ripgrep、ffmpeg、PortableGit、venv、PATH 等依赖。([Hermes Agent][1])
但官方也明确说明 Native Windows 仍是 early beta，尤其在 subprocess、路径、非 ASCII 控制台输出上可能有边界问题；如果要最稳定的 POSIX 环境，WSL2 仍是官方更成熟路径。([Hermes Agent][1])

所以 hermes-desktop 的部署问题，本质不是“Electron 如何打包”，而是要把 **Hermes Agent Runtime 安装、诊断、启动、更新、Profile 隔离、日志、回滚** 做成一个 Windows 运行时管理层。

---

# 1. 当前 hermes-desktop 部署问题定位

你们现有 hermes-desktop 架构是合理的：Electron 只做桌面壳、IPC、进程管理、文件系统管理、UI；真正的 agent 能力属于 Python Hermes Gateway。当前桌面端通过 Main Process 管理 Python Gateway，Renderer 只能通过 `window.hermesAPI` 访问能力，`installer.ts` 负责一次性环境安装，`hermes.ts` 负责 gateway 生命周期，`profileHome()` 负责 profile 文件路径隔离。

问题主要在 Windows 部署层：

| 问题                     | 当前风险                                                             | 应调整方向                                           |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| Linux 路径假设             | `~/.hermes/venv/bin/python`、shell 命令、source、chmod 在 Windows 下不可靠 | 改为 Windows Runtime Resolver                     |
| 直接依赖系统 Python/Git/Node | 公司电脑环境不可控                                                        | 使用官方 install.ps1 或内部镜像安装包                       |
| 私有 Git 拉取不稳定           | Git token、代理、证书、凭据污染                                             | 通过 Desktop Auth 获取短期 token 或改为内部 zip artifact   |
| Gateway 启动不可观测         | 启动失败只看到 “连接失败”                                                   | 增加 install job、doctor job、health job、log viewer |
| Profile 多实例端口冲突        | 8642-8648 可能和 webhook/其它服务冲突                                     | 由 SQLite Runtime DB 分配端口                        |
| 安装阶段失败不可恢复             | 网络中断后需要人工清理                                                      | 安装任务必须可 resume / retry / rollback               |
| 更新链路混乱                 | desktop auto-update 与 hermes-agent update 混在一起                   | Desktop 更新、Hermes Agent 更新、Profile 更新分离         |

---

# 2. 推荐部署主线

## 2.1 默认方案：Windows Native Runtime

```text
HermesDesktop.exe
  ↓
First Launch Runtime Bootstrap
  ↓
Install / Update Hermes Agent Native Runtime
  ↓
Create / Verify HERMES_HOME
  ↓
Enable API Server
  ↓
Start Gateway
  ↓
Connect via http://127.0.0.1:<profilePort>/v1
```

官方 API Server 是 OpenAI-compatible endpoint，启用方式是在 `.env` 中设置 `API_SERVER_ENABLED=true` 和 `API_SERVER_KEY`，然后启动 `hermes gateway`；默认端口是 8642，客户端连接 `http://localhost:8642/v1`。 ([GitHub][2])

Hermes Desktop 应只把 Hermes Gateway 当作本地 HTTP 服务使用，不要直接侵入 Hermes Agent 内部 Python 模块。你们现有设计已经把 Python Gateway 当作黑盒，通过 `/v1/chat/completions` 通信，这个方向应继续保留。

---

## 2.2 可选方案：WSL2 Runtime Adapter

WSL2 只用于以下场景：

```text
1. coding profile 需要强 POSIX 兼容。
2. terminal / file watcher / inotify / fork 语义要求高。
3. 需要使用 Hermes Dashboard 的 embedded terminal /chat pane。
4. 已经有公司统一 WSL2 Ubuntu 环境。
```

官方 WSL2 指南明确说明：dashboard 的 embedded terminal 需要 POSIX PTY，WSL2 更适合 POSIX-heavy 开发工作；但普通 chat、gateway、cron、browser tool、MCP servers 等大部分功能 Windows Native 可运行。([Hermes Agent][3])

Windows 10 Home 内部电脑不应默认强制 WSL2，因为 WSL2 初始化通常涉及管理员 PowerShell、系统功能启用和重启。Hermes Desktop 首版应避免把这个作为普通用户的一键安装前提。([Hermes Agent][3])

---

# 3. Windows 目录规划

建议不要完全照搬官方 `%LOCALAPPDATA%\hermes`，而是保留官方兼容性，同时增加 Desktop 自己的控制面目录。

```text
%LOCALAPPDATA%\Programs\HermesDesktop\
  HermesDesktop.exe
  resources/
  bootstrap/
    install-hermes.ps1
    runtime-manifest.json

%LOCALAPPDATA%\HermesDesktop\
  logs/
    desktop.log
    installer.log
    runtime/
  cache/
  downloads/
  runtime-db/
    profile-runtime.db

%LOCALAPPDATA%\hermes\
  hermes-agent/
  git/
  node/
  bin/
    hermes.cmd

%USERPROFILE%\.hermes\
  config.yaml
  .env
  SOUL.md
  state.db
  skills/
  memories/
  profiles/
    writer/
    coding/
    research/
```

官方 Windows Native 文档将 `%LOCALAPPDATA%\hermes` 作为可重建基础设施目录，将 `%USERPROFILE%\.hermes` 作为用户配置、auth、skills、sessions、logs 数据目录，这个拆分适合 hermes-desktop 复用。([Hermes Agent][1])

---

# 4. hermes-desktop 需要新增的部署模块

## 4.1 Runtime Bootstrap Manager

新增模块：

```text
src/main/runtime/
  runtime-manager.ts
  runtime-resolver.ts
  runtime-installer.ts
  runtime-doctor.ts
  runtime-updater.ts
  runtime-logs.ts
  runtime-manifest.ts
  windows/
    powershell-runner.ts
    path-resolver.ts
    process-tree.ts
```

职责：

```text
1. 检测 Windows 版本、架构、PowerShell、执行策略。
2. 检测 hermes.cmd 是否存在。
3. 检测 Hermes Agent 版本、commit、branch。
4. 检测 Python venv 是否完整。
5. 检测 Node、Git Bash、ripgrep、ffmpeg、Playwright Chromium。
6. 检测 API Server 是否可启动。
7. 检测 profile 端口是否可用。
8. 输出可读的诊断码。
```

不要在 Renderer 中实现任何安装逻辑。Renderer 只展示安装进度、日志和按钮；真实安装执行必须在 Main Process。你们现有架构约束已经要求 Renderer 不能访问 Node API，只能通过 preload 暴露的 `hermesAPI` 访问能力。

---

## 4.2 Installer Job Model

安装不要做成一个长同步过程，要做成可恢复任务。

```sql
CREATE TABLE runtime_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- install | update | doctor | repair | uninstall
  status TEXT NOT NULL, -- pending | running | succeeded | failed | cancelled
  step TEXT,
  progress INTEGER DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  log_path TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
```

安装步骤建议：

```text
BOOTSTRAP_CHECK
  ↓
DOWNLOAD_INSTALLER
  ↓
VERIFY_CHECKSUM
  ↓
INSTALL_DEPENDENCIES
  ↓
CLONE_OR_UNPACK_HERMES_AGENT
  ↓
CREATE_VENV
  ↓
PIP_INSTALL
  ↓
WRITE_ENV
  ↓
RUN_HERMES_DOCTOR
  ↓
START_GATEWAY
  ↓
VERIFY_API_SERVER
```

---

# 5. 私有 Git 仓库部署方案

## 5.1 不建议

```text
1. 不要把 Git token 写死进 Electron 安装包。
2. 不要让 NSIS 安装阶段直接 clone 私有仓库。
3. 不要依赖用户系统已有 Git。
4. 不要让用户手工配置 Python / Node / Git。
5. 不要在失败后只提示“安装失败”。
```

## 5.2 推荐做法

### 方案 A：内部 Git clone

适合开发环境和内部技术用户。

```text
Desktop Login
  ↓
后端签发短期 Git Access Token
  ↓
Desktop runtime-manager 拉取私有 repo
  ↓
clone 到 %LOCALAPPDATA%\hermes\hermes-agent
  ↓
安装 venv
  ↓
写入 runtime-manifest.json
```

运行命令示例：

```powershell
& "$env:LOCALAPPDATA\HermesDesktop\bootstrap\install-hermes.ps1" `
  -RepoUrl "https://git.internal.local/ai/hermes-agent.git" `
  -Ref "hermes-agent-win-v0.13.0-desktop-001" `
  -InstallDir "$env:LOCALAPPDATA\hermes\hermes-agent" `
  -HermesHome "$env:USERPROFILE\.hermes" `
  -SkipSetup
```

需要你们 fork 官方 `install.ps1`，增加以下参数：

```text
-RepoUrl
-Ref
-InstallerMirrorBaseUrl
-OfflineBundlePath
-ChecksumManifestUrl
-NoPathMutation
-DesktopMode
```

官方 install.ps1 已支持 `-Branch`、`-NoVenv`、`-SkipSetup`、`-HermesHome`、`-InstallDir`，因此 fork 成内部企业版成本不高。([Hermes Agent][1])

---

### 方案 B：内部 Artifact zip

适合普通员工电脑一键部署。

```text
CI 构建 hermes-agent-runtime.zip
  ↓
上传到 MinIO / GitLab Package Registry / Gitea Release
  ↓
Desktop 下载 zip + checksum
  ↓
解压到 %LOCALAPPDATA%\hermes\hermes-agent
  ↓
uv pip install 或使用预构建 wheels cache
```

推荐优先级高于 Git clone，因为企业内网部署更稳定，能避免 Git token、证书、代理、仓库权限、分支漂移问题。

---

# 6. Gateway 启动与 Profile Runtime 设计

Hermes Agent 官方 profile 是通过独立 `HERMES_HOME` 实现隔离的。每个 profile 有自己的 `config.yaml`、`.env`、`SOUL.md`、memory、sessions、skills、cron jobs、state database；创建 profile 后可以形成独立命令别名，并且每个 profile 可以运行自己的 gateway。([Hermes Agent][4])

Hermes Desktop 不要依赖命令别名，而应直接用环境变量启动。

```ts
type RuntimeMode = "windows-native" | "wsl2" | "remote";

interface ProfileRuntimeInstance {
  profileId: string;
  mode: RuntimeMode;
  hermesHome: string;
  installDir: string;
  apiHost: "127.0.0.1";
  apiPort: number;
  apiKeyRef: string;
  cwd?: string;
  pid?: number;
  status: "stopped" | "starting" | "running" | "failed";
}
```

建议端口不要继续简单使用 `8642-8648`，因为 Hermes 的 webhook 默认端口是 8644，容易撞车。建议改为：

```text
default   8642
writer    8652
coding    8662
research  8672
finance   8682
```

每个 profile 的 `.env` 写入：

```env
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8652
API_SERVER_KEY=<desktop-generated-random-key>
API_SERVER_MODEL_NAME=writer
```

官方环境变量说明中，`API_SERVER_PORT` 默认 8642，`API_SERVER_HOST` 默认 127.0.0.1，`API_SERVER_MODEL_NAME` 可用于多 profile 场景中给前端显示不同模型名。([GitHub][5])

---

# 7. Electron 安装器策略

## 7.1 NSIS 只安装 Desktop，不安装 Hermes Agent

正确拆分：

```text
NSIS Installer
  只负责：
    - 安装 HermesDesktop.exe
    - 写入快捷方式
    - 写入基础配置
    - 安装 auto-update 组件
    - 放置 bootstrap 脚本

First Launch Bootstrap
  负责：
    - 下载 / 安装 Hermes Agent
    - 初始化 HERMES_HOME
    - 检查依赖
    - 启动 gateway
    - 展示进度和日志
```

这样可以避免 NSIS 阶段因为网络、代理、私有 Git、pip、Playwright 下载失败导致整个安装器卡死。

你们之前的 Electron 选型结论仍然成立：Hermes Desktop 主客户端继续用 Electron，Windows 10 一键安装采用 electron-builder + NSIS，自动更新走 electron-updater + 私有 generic provider。

---

## 7.2 package 配置方向

```json
{
  "build": {
    "appId": "com.company.hermes.desktop",
    "productName": "Hermes Desktop",
    "directories": {
      "output": "release"
    },
    "files": [
      "out/**",
      "resources/bootstrap/**"
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ]
    },
    "nsis": {
      "oneClick": true,
      "perMachine": false,
      "allowElevation": false,
      "deleteAppDataOnUninstall": false
    },
    "publish": [
      {
        "provider": "generic",
        "url": "https://update.internal.local/hermes-desktop/"
      }
    ]
  }
}
```

企业内网发布必须加签名。Electron 官方文档明确建议面向分发的 Electron 应用进行代码签名。([Electron][6])

---

# 8. Desktop 需要暴露的安装诊断 UI

新增页面：

```text
Runtime Setup
  - Windows 环境检查
  - Hermes Agent 安装状态
  - 依赖状态
  - Profile Runtime 状态
  - Gateway 状态
  - API Server 验证
  - Doctor 日志
  - 一键修复
```

诊断码建议：

```text
WIN_POWERSHELL_BLOCKED
WIN_LONG_PATH_DISABLED
HERMES_CMD_NOT_FOUND
HERMES_INSTALL_INCOMPLETE
HERMES_VERSION_MISMATCH
GIT_AUTH_FAILED
GIT_CLONE_FAILED
UV_INSTALL_FAILED
PYTHON_VENV_MISSING
NODE_VERSION_CONFLICT
PLAYWRIGHT_CHROMIUM_MISSING
API_SERVER_DISABLED
API_SERVER_UNAUTHORIZED
PROFILE_PORT_CONFLICT
GATEWAY_START_TIMEOUT
GATEWAY_CRASHED
```

验证命令：

```powershell
Get-Command hermes
hermes --version
hermes doctor
curl.exe http://127.0.0.1:8642/health
curl.exe -H "Authorization: Bearer <key>" http://127.0.0.1:8642/v1/models
```

官方 Open WebUI 集成文档也使用 `/health` 和 `/v1/models` 来验证 API Server 是否可达，以及 API key 是否正确。([Hermes Agent][7])

---

# 9. Windows 10 部署验收标准

```text
A. 基础安装
1. Windows 10 Home 普通用户权限可安装 Hermes Desktop。
2. 安装 Hermes Desktop 不要求管理员权限。
3. 首次启动可自动安装 Hermes Agent Runtime。
4. 安装失败后可重试，不需要手工删除目录。
5. 所有安装日志可在 UI 查看。

B. 私有仓库
1. 可从公司私有 Git 或内部 artifact 下载 hermes-agent。
2. Git token 不进入安装包。
3. 下载内容有 checksum 校验。
4. 可指定 branch/tag/commit。
5. 可回滚到上一个 runtime 版本。

C. Gateway
1. default profile 可启动 8642 API Server。
2. writer/coding 等 profile 可启动独立端口。
3. 任意 profile 崩溃后 UI 可感知。
4. 端口冲突能返回明确错误。
5. 重启 app 后能恢复 runtime 状态。

D. Profile
1. default 进入 Portal。
2. writer/coding/research 进入独立 workspace。
3. 每个 profile 有独立 HERMES_HOME。
4. 每个 profile 有独立 API_SERVER_KEY。
5. 不同 profile 的 state.db、skills、SOUL.md 不互相污染。

E. 更新
1. Desktop 自更新不影响 Hermes Agent 数据。
2. Hermes Agent 更新不影响 Desktop 安装。
3. Profile 配置更新前自动备份。
4. update 失败可 rollback。
```

---

# 10. 版本策略

当前 upstream 最新 release 已到 Hermes Agent v0.13.0，发布日期为 2026-05-07；你们之前大量方案基于 v0.12.0。v0.13.0 release 明确包含 gateway auto-resume、Kanban durable board、checkpoint v2、安全修复等运行时能力变化。([GitHub][8])
v0.12.0 是 2026-04-30 的 Curator release，重点是 curator、自我改进、skills 管理等。([GitHub][9])

建议：

```text
短期：
  hermes-desktop V1.2 不直接追 main。
  fork NousResearch/hermes-agent，固定内部 tag：
    hermes-agent-win-desktop-v0.13.0-001

中期：
  每次升级只通过 internal runtime manifest 放行。
  Desktop 读取 manifest 判断可升级版本。

长期：
  desktop-runtime-channel:
    stable
    beta
    dev
```

runtime manifest 示例：

```json
{
  "runtime": "hermes-agent",
  "channel": "stable",
  "version": "v0.13.0",
  "ref": "hermes-agent-win-desktop-v0.13.0-001",
  "repoUrl": "https://git.internal.local/ai/hermes-agent.git",
  "artifactUrl": "https://artifact.internal.local/hermes/hermes-agent-v0.13.0-win.zip",
  "sha256": "...",
  "minDesktopVersion": "1.2.0",
  "installMode": "artifact-first-git-fallback"
}
```

---

# 11. 最终落地优先级

```text
P0-1：Windows Runtime Resolver
P0-2：First Launch Bootstrap UI
P0-3：Internal install.ps1 fork
P0-4：Profile Runtime SQLite
P0-5：Gateway health / logs / restart
P0-6：API Server enable + key 管理
P0-7：Private Git / Artifact 下载
P0-8：Doctor + 一键修复
```

V1.2 不建议优先做更多业务 Profile，也不建议先做 Docker Runtime。你们之前 V1.2 规划已经把重点放在 Windows 部署、Runtime 稳定性、SQLite Governance、Observability、安全策略上，这个方向应保持。

需要你最终确认的实现分歧点只有一个：**Hermes Desktop V1.2 默认采用 Windows Native Runtime，WSL2 只作为 coding/profile 高级适配器**。确认后，下一步可以直接输出 `docs/specs/v1.2-windows-deployment/` 的 Cursor 执行版 SPEC。

[1]: https://hermes-agent.nousresearch.com/docs/user-guide/windows-native "Windows (Native) Guide — Early Beta | Hermes Agent"
[2]: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md?utm_source=chatgpt.com "api-server.md - NousResearch/hermes-agent"
[3]: https://hermes-agent.nousresearch.com/docs/user-guide/windows-wsl-quickstart "Windows (WSL2) Guide | Hermes Agent"
[4]: https://hermes-agent.nousresearch.com/docs/user-guide/profiles "Profiles: Running Multiple Agents | Hermes Agent"
[5]: https://github.com/nousresearch/hermes-agent/blob/main/website/docs/reference/environment-variables.md?utm_source=chatgpt.com "environment-variables.md - hermes-agent"
[6]: https://electronjs.org/docs/latest/tutorial/code-signing?utm_source=chatgpt.com "Code Signing"
[7]: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/open-webui?utm_source=chatgpt.com "Open WebUI | Hermes Agent"
[8]: https://github.com/NousResearch/hermes-agent/releases "Releases · NousResearch/hermes-agent · GitHub"
[9]: https://github.com/NousResearch/hermes-agent/blob/main/RELEASE_v0.12.0.md "hermes-agent/RELEASE_v0.12.0.md at main · NousResearch/hermes-agent · GitHub"
