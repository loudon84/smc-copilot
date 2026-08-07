# smc-copilot-serve v1.3.1 Windows Runtime Hotfix 方案 PRD

## 1. 文档信息

| 项目                  | 内容                                         |
| ------------------- | ------------------------------------------ |
| 产品                  | smc-copilot-serve / Hermes Runtime Service |
| 版本                  | v1.3.1                                     |
| 文档类型                | Windows Runtime Hotfix PRD                 |
| 目标仓库                | `loudon84/ai-os-serve`                     |
| 基线分支                | `master`                                   |
| 建议开发分支              | `hotfix/windows-runtime-v1.3.1`            |
| 目标系统                | Windows 11 Pro x64                         |
| Python              | 3.12                                       |
| Runtime Service 端口  | `127.0.0.1:8765`                           |
| Hermes Gateway 默认端口 | `127.0.0.1:8642`                           |
| 优先级                 | P0                                         |
| 上一版本                | v1.3                                       |
| 后续版本                | v1.4 企业部署与静默安装                             |

---

## 2. 项目背景

`smc-copilot-serve` 是 Copilot Desktop 的本机 Runtime 控制面，负责：

* Hermes Agent 安装、更新、回滚；
* Hermes 版本管理与激活；
* Instance 管理；
* Gateway 生命周期管理；
* Hermes 配置管理；
* Secret 管理；
* MCP Server 管理；
* Desktop 设备配对与本地鉴权；
* Runtime 日志、诊断与备份。

Copilot Desktop 只通过：

```text
http://127.0.0.1:8765
```

连接 Runtime Service，不再直接安装、升级或启动 Hermes Agent。当前仓库 README 已明确将 Desktop、Runtime Service 和 Hermes Agent 划分为三个独立职责层。

v1.3 已完成 Runtime Core、安装 Job、版本管理、Instance、Gateway、配置、Secret、MCP、设备配对和 Windows UserDaemon 的基础实现。现有验收记录显示相关自动化测试已通过，但当前安装测试允许使用 Stub Hermes，因此不能证明真实 Hermes Agent 能在 Windows 环境完成安装、配置和 Gateway 启动。

v1.3.1 的目标不是增加新的业务模块，而是修复 Windows 环境下真实 Hermes Agent 安装与运行链路中的阻断问题。

---

## 3. 当前源码架构

### 3.1 Runtime 安装链路

当前 Hermes 安装流程为：

```text
POST /api/v1/runtime/install
        │
        ▼
RuntimeJobService
        │
        ▼
InstallationService
        │
        ├─ EnvironmentProbe
        ├─ Manifest 解析
        ├─ Artifact 下载
        ├─ SHA-256 校验
        ├─ Staging 解压
        ├─ Python venv 创建
        ├─ pip install
        ├─ hermes --version
        ├─ hermes config migrate
        ├─ hermes doctor
        ├─ RuntimeVersion 激活
        └─ 默认 Instance 创建
```

该流程已具备 Manifest、下载、校验、隔离 venv、版本激活和 Job 事件能力。

### 3.2 Windows Runtime 安装链路

当前 Windows 脚本流程为：

```text
runtime-precheck-windows.ps1
        │
        ▼
bootstrap-windows.ps1
        │
        ├─ 检查 Python 3.12
        ├─ 安装 uv
        ├─ 创建 copilot-serve/.venv
        ├─ uv sync
        ├─ 生成 .env
        └─ Alembic migration
        │
        ▼
runtime-install-windows.ps1
        │
        ├─ 写入 TOOLCHAIN_*
        ├─ 写入 HERMES_INSTALL_DIR
        └─ 可选安装 UserDaemon
```

当前脚本只安装 Runtime Service 本身，不会自动调用 `/runtime/install` 安装 Hermes Agent。

### 3.3 目录约定

```text
D:\Programs\copilot-serve\
├─ src\
├─ scripts\
├─ .venv\
├─ .env
└─ migrations\

D:\Programs\HermesAgent\
└─ <version>\
   └─ venv\
      └─ Scripts\
         └─ hermes.exe

%LOCALAPPDATA%\HermesRuntime\
├─ runtime.db / service state
├─ downloads\
├─ staging\
├─ backups\
├─ logs\
└─ active.json

%USERPROFILE%\.hermes\
├─ config.yaml
├─ .env
├─ state.db
├─ skills\
├─ memories\
└─ profiles\
   └─ <profile-name>\
      ├─ config.yaml
      ├─ .env
      ├─ state.db
      └─ skills\
```

程序文件、Runtime 服务态和 Hermes 用户数据必须继续分离。

---

## 4. 当前问题

## 4.1 P0：安装失败会生成 Stub Hermes

当前 `_pip_install()` 在以下情况会生成 Stub：

* Artifact 内没有 `.whl`；
* Artifact 内没有 `pyproject.toml`；
* Artifact 内没有 `setup.py`；
* `pip install` 执行失败。

Stub 会输出：

```text
hermes 0.0.0-stub
```

但安装 Job 仍可能继续执行版本激活并返回成功。

当前安装测试使用只包含 `README.md` 的 ZIP，并将 Stub 安装视为成功。这只能验证 Runtime Job 流程，不能验证真实 Hermes 安装。

### 影响

* Runtime 状态显示 Hermes 已安装；
* `active.json` 指向无效版本；
* 默认 Instance 被创建；
* Gateway 无法提供真实 Agent 能力；
* Desktop 可能进入“已安装但无法聊天”的状态。

---

## 4.2 P0：Hermes Doctor 命令参数不兼容

当前代码执行：

```text
hermes doctor --json
```

当前 Hermes Agent 的 `doctor` 命令只提供：

```text
--fix
--ack
```

没有 `--json` 参数。

### 影响

真实 Hermes 安装成功后，安装 Job 会在 Doctor 阶段失败。

---

## 4.3 P0：Gateway CLI 命令格式不兼容

当前 Gateway 命令为：

```text
hermes gateway run --profile <profile-name> --port <port>
```

当前 Hermes CLI 的 Profile 是顶层参数：

```text
hermes -p <profile-name> gateway run
```

默认 Profile 必须执行：

```text
hermes gateway run
```

不能执行：

```text
hermes -p default gateway run
```

同时，当前 `gateway run` 没有 `--port` 参数；外部 Runtime 监管 Gateway 时应使用 `--external-supervisor`。

### 影响

真实 Hermes 安装后，Gateway 启动会直接被 argparse 拒绝。

---

## 4.4 P0：API Server 端口配置方式错误

Hermes API Server 通过以下环境变量启用：

```text
API_SERVER_ENABLED
API_SERVER_HOST
API_SERVER_PORT
API_SERVER_KEY
```

`API_SERVER_PORT` 是环境变量，不是 `gateway run --port` 参数，也不是普通 `config.yaml` 端口字段。命名 Profile 的 API Server 配置应位于对应 Profile 的环境作用域中。

当前代码只在 Profile 配置中写入：

```yaml
gateway:
  port: 8642
```

### 影响

* Gateway 进程即使启动，也不一定启用 API Server；
* `/health`、`/v1/models`、`/v1/chat/completions` 不可访问；
* Runtime GatewaySupervisor 健康检查失败。

---

## 4.5 P0：默认 Profile 路径错误

Hermes 默认 Profile 使用：

```text
%USERPROFILE%\.hermes\
```

命名 Profile 使用：

```text
%USERPROFILE%\.hermes\profiles\<name>\
```

当前 `HermesConfigAdapter` 对所有 Profile 都使用：

```text
~/.hermes/profiles/<profile-name>/config.yaml
```

因此名为 `default` 的 Instance 会写入：

```text
~/.hermes/profiles/default/config.yaml
```

而不是：

```text
~/.hermes/config.yaml
```

### 影响

* Runtime 写入的配置不会被默认 Hermes Profile 读取；
* 默认 Profile 模型、Provider、Gateway 设置不生效；
* 配置 API 返回成功，但 Gateway 使用另一套配置。

---

## 4.6 P0：Instance 与 Profile 存在双控制面断点

当前数据库同时存在：

```text
instances
profiles
```

安装服务创建的是：

```text
HermesInstance
```

但 `InstanceService.start()` 将 Instance ID 传给：

```text
GatewaySupervisor.start_profile(instance_id)
```

GatewaySupervisor 实际从旧 `profiles` 表读取 Profile。

安装过程不会保证 `profiles` 表存在同 ID 的记录。

### 影响

```text
安装成功
→ instances 表存在默认 Instance
→ profiles 表没有同 ID Profile
→ POST /instances/{id}/start
→ Profile not found
```

---

## 4.7 P0：Instance 未接入启动恢复和自动启动

当前 Runtime 生命周期执行：

```text
reconcile_on_boot()
start_auto_start_profiles()
shutdown_all()
```

这些逻辑只处理旧 `Profile`，不处理 `HermesInstance`。

### 影响

* `instances.auto_start=true` 不生效；
* Runtime 重启后 Instance 状态无法恢复；
* 遗留 Gateway 进程无法按 Instance 记录重新关联；
* Runtime 关闭时可能遗漏 Instance Gateway。

---

## 4.8 P0：Secret 已保存但没有注入 Gateway

当前 SecretStore 在 Windows 上优先使用 DPAPI，API 只返回 Secret 元数据，不返回明文。

但 GatewayProcessManager 启动子进程时没有传入 Secret 环境变量。

### 影响

通过 Runtime API 保存的：

```text
DASHSCOPE_API_KEY
DEEPSEEK_API_KEY
OPENAI_API_KEY
API_SERVER_KEY
```

不会被 Hermes Gateway 读取。

---

## 4.9 P0：Windows 显式 PythonPath 没有贯穿 Bootstrap

`runtime-install-windows.ps1` 支持：

```text
-PythonPath
```

但调用 `bootstrap-windows.ps1` 时只传递了 `RepoRoot`。

`bootstrap-windows.ps1` 内仍通过：

```text
py -3.12
python
uv venv --python 3.12
```

探测和创建环境。

### 影响

即使预检通过显式 Python 路径，Bootstrap 仍可能因 PATH 中没有 Python 而失败。

---

## 4.10 P0：PowerShell 执行策略阻止安装脚本

Windows 11 Pro 默认环境或企业组策略可能禁止执行本地 `.ps1`，导致：

```text
PSSecurityException
UnauthorizedAccess
```

当前仓库没有提供 `.cmd` 启动入口，用户必须自行修改 ExecutionPolicy。

### 影响

安装流程在第一步被阻断，不适合公司员工电脑批量部署。

---

## 4.11 P1：配置校验不足

当前配置校验只确认：

```text
config.yaml 顶层是否为 mapping
```

没有调用 Hermes 原生：

```text
hermes config check
```

Hermes CLI 已提供 `config check` 与 `config migrate` 等配置命令。

### 影响

错误的 Provider、Model、Gateway 或 MCP 配置可能被写入并触发 Gateway 重启。

---

## 4.12 P1：Windows Secret 可能静默退化为弱加密文件

Windows DPAPI 调用异常时，当前 SecretStore 会静默回退到基于固定默认种子的 XOR 文件存储。

### 影响

生产环境可能在没有明确告警的情况下使用不符合要求的 Secret 存储。

---

## 4.13 P1：Runtime 启动入口未统一使用 RUNTIME_HOST/RUNTIME_PORT

配置对象已经提供：

```text
bind_host
bind_port
```

并优先使用 `RUNTIME_HOST` 和 `RUNTIME_PORT`。

但 `main.py` 仍使用：

```text
copilot_host
copilot_port
```

### 影响

通过 `smc-copilot-serve` 命令启动时，`RUNTIME_*` 配置可能不生效。

---

## 5. 版本目标

v1.3.1 必须实现以下闭环：

```text
Windows 预检
→ Runtime Service 安装
→ Runtime Service 启动
→ Hermes Artifact 下载
→ Hermes 真实安装
→ Hermes CLI 校验
→ 默认 Instance 创建
→ Profile 配置定位
→ Secret 安全加载
→ Gateway 正确启动
→ API Server 监听
→ Runtime 健康检查
→ Desktop 可调用 Chat API
```

### 5.1 核心目标

1. 禁止 Stub Hermes 被激活；
2. 确保安装 Job 只在真实 Hermes 可执行时成功；
3. 修正 Hermes CLI 命令契约；
4. 正确处理默认 Profile 和命名 Profile；
5. 让 Instance 成为新 Runtime 生命周期的真实控制对象；
6. 将 Secret 注入对应 Instance 的 Gateway 进程；
7. 正确启用 Hermes API Server；
8. 让 Windows 显式工具链路径贯穿全部脚本；
9. 提供无需修改永久 ExecutionPolicy 的安装入口；
10. 增加真实 Hermes 安装和 Gateway 启动验收。

---

## 6. 非目标

v1.3.1 不处理以下内容：

* 不开发 MSI 安装包；
* 不开发图形安装向导；
* 不实现 Windows 系统级多用户服务；
* 不删除旧 `/profiles` API；
* 不重构 Desktop 页面；
* 不增加新的 Agent 功能；
* 不增加新的 MCP 类型；
* 不实现 Hermes 自动在线升级策略；
* 不实现 macOS LaunchAgent；
* 不实现 Linux systemd user service；
* 不完成企业批量软件分发；
* 不实现远程 Runtime；
* 不允许 Runtime 默认监听 `0.0.0.0`。

上述能力进入 v1.4 或后续版本。

---

## 7. 总体设计原则

## 7.1 Runtime 是唯一生命周期控制面

```text
Desktop
   │
   ▼
Runtime REST API
   │
   ├─ RuntimeVersion
   ├─ HermesInstance
   ├─ Configuration
   ├─ Secret
   └─ Gateway Process
```

Desktop 不得：

* 直接执行 `hermes gateway run`；
* 直接修改 Runtime 数据库；
* 直接读取 DPAPI Secret；
* 直接决定 Hermes 可执行路径；
* 直接安装 Python 包。

---

## 7.2 HermesInstance 是新运行时主对象

v1.3.1 中：

* `/instances` 负责新 Runtime；
* `/profiles` 保留兼容；
* Instance 启停不得再依赖同 ID 的旧 Profile；
* GatewaySupervisor 同时支持 Instance 和遗留 Profile；
* 新功能必须使用 Instance 路径。

---

## 7.3 配置与 Secret 分离

```text
config.yaml
├─ model
├─ provider
├─ tools
├─ gateway
└─ compression

SecretStore
├─ Provider API Key
├─ API_SERVER_KEY
├─ MCP Secret
└─ Platform Token
```

禁止将 Secret 明文返回给 Renderer。

---

## 7.4 API Server 使用进程环境变量

每个 Instance 启动时由 Runtime 注入：

```text
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=<instance.gateway_port>
API_SERVER_KEY=<resolved secret>
```

不再通过错误的 Gateway CLI 参数传递端口。

---

## 7.5 安装失败不得改变当前 Active 版本

以下任意阶段失败时，不得切换 Active 版本：

```text
download
checksum
extract
venv
pip install
executable verify
version verify
config migrate
doctor
```

---

## 8. 目标架构

```text
Copilot Desktop
        │
        │ HTTP + Bearer device token
        ▼
┌──────────────────────────────────────────────┐
│ smc-copilot-serve                            │
│                                              │
│ Runtime API                                  │
│ ├─ RuntimeJobService                        │
│ ├─ InstallationService                      │
│ ├─ InstanceService                          │
│ ├─ InstanceGatewaySupervisor                │
│ ├─ ConfigurationService                     │
│ ├─ SecretService                            │
│ ├─ McpService                               │
│ └─ DiagnosticsService                       │
└──────────────────────┬───────────────────────┘
                       │
                       │ argv + scoped env
                       ▼
┌──────────────────────────────────────────────┐
│ Hermes Agent                                 │
│                                              │
│ D:\Programs\HermesAgent\<version>\venv       │
│                                              │
│ default profile                              │
│   %USERPROFILE%\.hermes                      │
│                                              │
│ named profile                                │
│   %USERPROFILE%\.hermes\profiles\<name>      │
│                                              │
│ API Server                                   │
│   127.0.0.1:<instance.gateway_port>          │
└──────────────────────────────────────────────┘
```

---

# 9. 功能需求

## 9.1 FR-01：真实 Hermes Artifact 安装

### 需求

安装服务必须只接受可安装的 Hermes Artifact。

支持：

```text
wheel bundle
源码包 + pyproject.toml
源码包 + setup.py
```

生产 Stable Channel 优先使用 Wheel Bundle。

### 处理规则

Artifact 内没有安装入口时：

```json
{
  "error": {
    "code": "artifact_not_installable",
    "message": "Hermes artifact contains no wheel or Python project"
  }
}
```

`pip install` 非零退出时：

```json
{
  "error": {
    "code": "hermes_install_failed",
    "message": "Failed to install Hermes Agent",
    "details": {
      "exitCode": 1,
      "stderrTail": "..."
    }
  }
}
```

### 禁止行为

* 禁止生成 Stub；
* 禁止记录 `0.0.0-stub`；
* 禁止在 pip 失败后继续激活；
* 禁止吞掉 pip stderr；
* 禁止在没有 `hermes.exe` 时返回成功。

### 安装完成校验

必须执行：

```text
<venv>\Scripts\hermes.exe --version
```

校验条件：

```text
文件存在
退出码 = 0
版本输出非空
版本不包含 stub
版本与 Manifest 可兼容
```

---

## 9.2 FR-02：Manifest 确定性解析

### Manifest 格式

```json
{
  "releases": [
    {
      "version": "0.19.0",
      "channel": "stable",
      "platform": "windows",
      "architecture": "x86_64",
      "artifactType": "wheel-bundle",
      "url": "https://artifact.example/hermes-0.19.0-windows-x86_64.zip",
      "sha256": "<64-character-sha256>",
      "publishedAt": "2026-08-05T00:00:00Z"
    }
  ]
}
```

### 解析规则

当请求：

```json
{
  "version": "latest",
  "channel": "stable"
}
```

必须：

1. 过滤 `channel=stable`；
2. 过滤 `platform=windows`；
3. 过滤 `architecture=x86_64`；
4. 按语义版本排序；
5. 选择最高版本；
6. 不允许依赖数组顺序。

### 校验规则

必须校验：

* `version`；
* `channel`；
* `platform`；
* `architecture`；
* `url`；
* `sha256`；
* `artifactType`。

---

## 9.3 FR-03：修正 Hermes CLI Adapter

### Doctor 命令

修改为：

```text
hermes doctor
```

不得默认追加：

```text
--json
```

Doctor 结果由 Runtime 自行封装：

```json
{
  "exitCode": 0,
  "stdout": "...",
  "stderr": ""
}
```

### Gateway 命令

默认 Profile：

```text
hermes.exe gateway run --external-supervisor
```

命名 Profile：

```text
hermes.exe -p <profile-name> gateway run --external-supervisor
```

禁止：

```text
--profile
--port
shell=True
cmd.exe /c
powershell -Command
```

### Config 命令

默认 Profile：

```text
hermes.exe config check
hermes.exe config migrate
```

命名 Profile：

```text
hermes.exe -p <name> config check
hermes.exe -p <name> config migrate
```

### 命令构建器

新增统一方法：

```python
build_profile_command(
    profile_name: str,
    args: list[str],
) -> list[str]
```

规则：

```python
if profile_name in ("", "default"):
    return [hermes_executable, *args]

return [
    hermes_executable,
    "-p",
    profile_name,
    *args,
]
```

---

## 9.4 FR-04：统一 Profile 路径解析

新增：

```text
src/runtime/hermes_profile_paths.py
```

提供：

```python
def profile_home(settings: Settings, profile_name: str) -> Path
def profile_config_path(settings: Settings, profile_name: str) -> Path
def profile_env_path(settings: Settings, profile_name: str) -> Path
```

规则：

```python
if profile_name in ("", "default"):
    return settings.hermes_home_path

return (
    settings.hermes_home_path
    / "profiles"
    / profile_name
)
```

所有以下模块必须统一使用该方法：

* `ConfigurationService`；
* `HermesConfigAdapter`；
* `ProfileService`；
* `GatewayProcessManager`；
* `McpService`；
* `DiagnosticsService`；
* 后续 Backup / Restore。

禁止直接拼接：

```python
hermes_home / "profiles" / profile_name
```

---

## 9.5 FR-05：Instance Gateway Supervisor

### 目标

Instance 启动、停止、恢复、自动启动不再依赖旧 Profile 表。

### 新增方法

```python
async def start_instance(instance_id: str)
async def stop_instance(instance_id: str)
async def restart_instance(instance_id: str)
async def refresh_instance_status(instance_id: str)
async def reconcile_instances_on_boot()
async def start_auto_start_instances()
async def shutdown_all_instances()
```

### 启动输入

Supervisor 从 `HermesInstance` 和 `RuntimeVersion` 获取：

```text
instance.id
instance.profile_name
instance.gateway_port
instance.status
instance.pid
instance.runtime_version_id
runtime_version.executable_path
```

### 状态机

```text
created
  │
  ▼
starting
  │
  ├─ success ──► running
  │
  └─ failure ──► error

running
  │
  ├─ stop ─────► stopped
  ├─ crash ────► error
  └─ restart ──► stopping → starting

error
  │
  ├─ restart ──► starting
  └─ stop ─────► stopped
```

### 启动步骤

```text
读取 Instance
→ 检查 RuntimeVersion
→ 检查 hermes.exe
→ 检查端口
→ 构建 Profile Home
→ 构建 Secret 环境
→ 构建 API Server 环境
→ 构建 Gateway CLI
→ 启动进程
→ 保存 PID
→ 等待 /health
→ 更新 running/healthy
```

### 健康检查

```text
GET http://127.0.0.1:<gateway_port>/health
```

成功条件：

```json
{
  "status": "ok"
}
```

超时时间使用：

```text
HERMES_GATEWAY_START_TIMEOUT_SECONDS
```

### 遗留 Profile 兼容

保留：

```python
start_profile()
stop_profile()
restart_profile()
```

但 Instance API 不得再调用这些方法。

---

## 9.6 FR-06：Runtime 生命周期接入 Instance

修改 `core/lifecycle.py`。

启动阶段：

```text
recover_incomplete_jobs
→ reconcile_instances_on_boot
→ reconcile_legacy_profiles_on_boot
→ start_auto_start_instances
→ start_auto_start_profiles
→ start workers
```

关闭阶段：

```text
stop workers
→ shutdown_all_instances
→ shutdown_all_legacy_profiles
→ dispose database
```

### 恢复规则

Instance 数据库状态为 `running` 时：

| OS 状态   | 端口      | 健康  | 处理                |
| ------- | ------- | --- | ----------------- |
| PID 存在  | 占用      | 健康  | 保持 running        |
| PID 存在  | 占用      | 不健康 | 终止进程，标记 error     |
| PID 不存在 | 空闲      | 否   | 标记 error          |
| PID 不存在 | 被未知进程占用 | 未知  | 标记 error，不直接杀未知进程 |

不得仅凭端口占用杀死非 Runtime 管理进程。

---

## 9.7 FR-07：Gateway Scoped Environment

启动 Gateway 时构建：

```python
child_env = os.environ.copy()
```

注入：

```text
HERMES_HOME
API_SERVER_ENABLED
API_SERVER_HOST
API_SERVER_PORT
API_SERVER_KEY
```

示例：

```text
HERMES_HOME=C:\Users\<user>\.hermes
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
API_SERVER_KEY=<secret>
```

同时注入当前 Profile Scope 下的 Provider Secret：

```text
DASHSCOPE_API_KEY
DEEPSEEK_API_KEY
OPENAI_API_KEY
OPENROUTER_API_KEY
ANTHROPIC_API_KEY
```

### 环境变量安全规则

Secret 名称必须满足：

```regex
^[A-Z][A-Z0-9_]{1,127}$
```

禁止通过 Secret API覆盖：

```text
PATH
PYTHONPATH
PATHEXT
COMSPEC
SYSTEMROOT
WINDIR
HERMES_HOME
USERPROFILE
LOCALAPPDATA
TEMP
TMP
```

### Profile 隔离

每个 Gateway 只允许读取所属 Profile Scope 的 Secret。

禁止：

* 默认 Profile 借用命名 Profile Secret；
* 命名 Profile 借用默认 Profile Secret；
* 合并所有 Profile 的 Secret；
* 将 Secret 写入日志。

---

## 9.8 FR-08：API_SERVER_KEY 自动生成

创建 Instance 时，如果当前 Profile Scope 没有 `API_SERVER_KEY`，Runtime 自动生成：

```text
32-byte cryptographically secure random token
```

保存到 SecretStore。

不得：

* 返回给 Renderer；
* 写入配置响应；
* 写入日志；
* 写入 Runtime Job Event。

Runtime 内部 HermesGatewayClient 调用需要鉴权时，通过 SecretService 解析该 Key。

---

## 9.9 FR-09：Windows SecretStore 强化

### Windows 默认策略

Windows 必须使用 DPAPI。

DPAPI 初始化或写入失败时：

```json
{
  "error": {
    "code": "secret_store_unavailable",
    "message": "Windows DPAPI secret store is unavailable"
  }
}
```

不得静默回退到固定默认密钥的 XOR 存储。

### 开发模式

仅当显式配置：

```env
RUNTIME_ALLOW_INSECURE_SECRET_STORE=true
```

时，允许使用开发文件存储。

默认：

```env
RUNTIME_ALLOW_INSECURE_SECRET_STORE=false
```

### Windows 用户约束

Runtime、UserDaemon、Hermes Gateway 和 DPAPI Secret 必须运行在同一个 Windows 用户上下文。

不允许：

```text
管理员账号安装 Secret
普通账号运行 Gateway
```

除非重新完成该用户的 Secret 配置。

---

## 9.10 FR-10：配置原子写入与原生校验

### 配置写入流程

```text
读取当前配置
→ 创建 Snapshot
→ 合并 Patch
→ 写入临时文件
→ 原子 replace
→ hermes config check
→ 成功：保留新配置
→ 失败：恢复 Snapshot
→ 根据配置组决定是否重启 Gateway
```

### 原子文件

```text
config.yaml.tmp
→ fsync
→ replace config.yaml
```

### 校验返回

```json
{
  "ok": true,
  "profileName": "coding",
  "configPath": "<redacted>",
  "warnings": []
}
```

失败：

```json
{
  "error": {
    "code": "configuration_invalid",
    "message": "Hermes config check failed",
    "details": {
      "stderrTail": "..."
    }
  }
}
```

### 重启规则

以下组修改后需要重启：

```text
model
provider
gateway
runtime
platforms
```

以下组默认不强制重启，由 Hermes 能力决定：

```text
compression
prompt_caching
agent
```

Secret 修改后，如果目标 Instance 正在运行，应返回：

```json
{
  "restartRequired": true
}
```

不得未经调用方同意自动连续重启多个 Instance。

---

## 9.11 FR-11：Windows Bootstrap 工具链贯穿

`bootstrap-windows.ps1` 新增：

```powershell
param(
    [string]$RepoRoot,
    [string]$PythonPath = "",
    [switch]$Force,
    [switch]$SkipProgramsCheck
)
```

### Python 解析规则

优先级：

```text
-PythonPath
→ py -3.12
→ python
```

解析后必须验证：

```text
Python 版本 >= 3.12
Python 版本 < 3.13
可执行文件存在
```

### uv 安装

使用解析后的 Python：

```powershell
& $ResolvedPython -m pip install uv
```

不得固定执行：

```powershell
py -3.12 -m pip install uv
```

### Runtime venv

```powershell
uv venv --python $ResolvedPython
```

`runtime-install-windows.ps1` 必须将 `PythonPath` 传递到：

```text
runtime-precheck-windows.ps1
bootstrap-windows.ps1
.env
```

---

## 9.12 FR-12：PowerShell Bypass 启动入口

新增：

```text
scripts/runtime-install-windows.cmd
scripts/runtime-provision-windows.cmd
```

`runtime-install-windows.cmd`：

```bat
@echo off
set SCRIPT_DIR=%~dp0
powershell.exe ^
  -NoLogo ^
  -NoProfile ^
  -ExecutionPolicy Bypass ^
  -File "%SCRIPT_DIR%runtime-install-windows.ps1" %*
exit /b %ERRORLEVEL%
```

### 要求

* 不修改 LocalMachine ExecutionPolicy；
* 不修改 CurrentUser ExecutionPolicy；
* 只对本次进程使用 Bypass；
* 退出码必须透传；
* 不要求管理员权限安装 UserDaemon；
* 文件来自 ZIP 时允许先执行 `Unblock-File`。

---

## 9.13 FR-13：Windows Provision 编排脚本

新增：

```text
scripts/runtime-provision-windows.ps1
```

职责：

```text
预检
→ 安装 Runtime
→ 启动 Runtime
→ 等待 Runtime /health
→ 调用 /runtime/install
→ 轮询 Job
→ 验证真实 Hermes
→ 获取或创建 Instance
→ 配置 API Server Secret
→ 启动 Instance
→ 验证 Gateway /health
→ 执行 Smoke Test
→ 安装 UserDaemon
```

### 参数

```powershell
param(
    [string]$RepoRoot = "D:\Programs\copilot-serve",
    [string]$PythonPath = "",
    [string]$NodePath = "",
    [string]$GitPath = "",
    [string]$HermesInstallDir = "D:\Programs\HermesAgent",
    [string]$ManifestUrl = "",
    [string]$Version = "latest",
    [string]$Channel = "stable",
    [string]$InstanceName = "default",
    [int]$RuntimePort = 8765,
    [int]$GatewayPort = 8642,
    [switch]$UserDaemon,
    [switch]$Force
)
```

### 执行结果

成功：

```text
Runtime URL: http://127.0.0.1:8765
Hermes version: <version>
Instance: <name>
Gateway URL: http://127.0.0.1:8642
Status: healthy
```

失败时：

* 输出失败阶段；
* 输出 Runtime Job ID；
* 输出日志路径；
* 返回非零退出码；
* 不切换损坏版本；
* 不安装 UserDaemon。

---

## 9.14 FR-14：Windows 端口冲突处理

当前预检只警告端口占用。v1.3.1 改为：

```text
8765 被占用
→ 检查是否为现有 Runtime
→ 若 /api/v1/health 正常，允许复用
→ 若非 Runtime，安装失败
```

新增参数：

```powershell
-AllowExistingRuntime
```

Gateway 端口被占用时：

* 如果 PID 与 Instance 已记录 PID 相同，执行状态恢复；
* 如果是未知 PID，不自动终止；
* 返回 `gateway_port_conflict`。

---

## 9.15 FR-15：UserDaemon 安装顺序

UserDaemon 只能在以下条件全部成功后安装：

```text
Runtime health = ready
Hermes installed = true
Hermes executable verified = true
Instance exists
Gateway health = true
Smoke test passed
```

安装任务计划后立即执行：

```text
schtasks /Run /TN HermesRuntimeUserDaemon
```

### 计划任务要求

```text
触发器：用户登录
运行级别：LIMITED
运行用户：当前用户
工作目录：D:\Programs\copilot-serve
可执行文件：copilot-serve\.venv\Scripts\python.exe
日志：%LOCALAPPDATA%\HermesRuntime\logs\runtime-user-daemon.log
```

当前 UserDaemon 已使用当前 Python 构造 Uvicorn 命令，v1.3.1 需要补充工作目录、日志和立即启动能力。

---

## 9.16 FR-16：统一 Runtime 启动配置

修改 `main.py`：

```python
uvicorn.run(
    "main:app",
    host=settings.bind_host,
    port=settings.bind_port,
    reload=False,
    app_dir="src",
)
```

统一使用：

```text
RUNTIME_HOST
RUNTIME_PORT
```

兼容：

```text
COPILOT_HOST
COPILOT_PORT
```

---

## 9.17 FR-17：增强 Runtime Smoke Test

现有 Smoke Test 只检查：

* Runtime health；
* capabilities；
* runtime status；
* instance list。

v1.3.1 必须增加：

```text
active RuntimeVersion 存在
hermes.exe 文件存在
hermes --version 非 stub
Instance 存在
Instance status = running
Instance healthy = true
Gateway /health = ok
Gateway /v1/models 可访问
配置文件路径正确
Runtime Job 无 failed 状态
```

支持参数：

```powershell
-BaseUrl
-InstanceId
-GatewayBaseUrl
-RequireHermes
```

---

## 9.18 FR-18：安装日志与错误收敛

### 日志目录

```text
%LOCALAPPDATA%\HermesRuntime\logs\
├─ runtime-service.log
├─ runtime-install-<jobId>.log
├─ gateway-<instance>.log
├─ runtime-user-daemon.log
└─ provision-<timestamp>.log
```

### 日志禁止内容

不得记录：

* API Key；
* Bearer Token；
* Device Token；
* API_SERVER_KEY；
* Secret 明文；
* 完整 Authorization Header；
* 完整 `.env`。

### Job 错误码

新增或统一：

```text
artifact_not_installable
artifact_platform_mismatch
artifact_architecture_mismatch
checksum_mismatch
python_runtime_failed
venv_creation_failed
hermes_install_failed
hermes_executable_missing
hermes_version_invalid
config_migrate_failed
doctor_failed
configuration_invalid
secret_store_unavailable
gateway_command_invalid
gateway_port_conflict
gateway_start_failed
gateway_health_failed
profile_path_invalid
```

---

# 10. API 设计

## 10.1 保持现有接口

以下接口路径不变：

```text
POST /api/v1/runtime/install
GET  /api/v1/runtime/jobs/{jobId}
GET  /api/v1/runtime/jobs/{jobId}/events
GET  /api/v1/runtime/status
GET  /api/v1/runtime/versions

GET  /api/v1/instances
POST /api/v1/instances
POST /api/v1/instances/{id}/start
POST /api/v1/instances/{id}/stop
POST /api/v1/instances/{id}/restart
GET  /api/v1/instances/{id}/health
GET  /api/v1/instances/{id}/logs

GET   /api/v1/instances/{id}/configuration
PATCH /api/v1/instances/{id}/configuration
POST  /api/v1/instances/{id}/configuration/validate

GET /api/v1/secrets/{scope}
PUT /api/v1/secrets/{scope}/{name}
DELETE /api/v1/secrets/{scope}/{name}
```

现有 Runtime API 已具备安装、Job、版本、Instance、配置和 Secret 入口。

---

## 10.2 Install Job 结果扩展

成功结果：

```json
{
  "version": "0.19.0",
  "resolvedVersion": "0.19.0",
  "installPath": "D:\\Programs\\HermesAgent\\0.19.0",
  "executablePath": "D:\\Programs\\HermesAgent\\0.19.0\\venv\\Scripts\\hermes.exe",
  "instanceId": "<uuid>",
  "doctorOk": true,
  "realExecutableVerified": true,
  "artifactType": "wheel-bundle",
  "stub": false
}
```

### 规则

只要：

```text
realExecutableVerified != true
```

Job 不得进入 `succeeded`。

---

## 10.3 Instance Health 扩展

返回：

```json
{
  "id": "<uuid>",
  "name": "default",
  "profileName": "default",
  "runtimeVersion": "0.19.0",
  "gatewayPort": 8642,
  "status": "running",
  "healthy": true,
  "pid": 12345,
  "autoStart": true,
  "lastError": null,
  "executableVerified": true,
  "apiServerEnabled": true
}
```

不得返回：

```text
API_SERVER_KEY
Provider API Key
完整子进程环境
```

---

## 10.4 Configuration Validate

```http
POST /api/v1/instances/{id}/configuration/validate
```

返回：

```json
{
  "ok": true,
  "profileName": "default",
  "nativeCheck": true,
  "errors": [],
  "warnings": []
}
```

---

# 11. 数据模型处理

## 11.1 本版本不新增核心表

继续使用：

```text
runtime_versions
runtime_jobs
runtime_job_events
instances
config_snapshots
secret_references
runtime_audit_logs
```

---

## 11.2 Instance 状态字段

继续使用：

```text
status
healthy
pid
last_error
auto_start
runtime_version_id
gateway_port
profile_name
```

不新增第二套 Instance 状态表。

---

## 11.3 Profile 兼容策略

v1.3.1 不删除：

```text
profiles
```

但规定：

* 新 Runtime API 以 `instances` 为准；
* 旧 `/profiles` API 继续服务历史模块；
* Instance 状态不得同步依赖 Profile；
* 不要求 Instance ID 和 Profile ID 相同；
* v1.4 再制定 Profile 数据迁移与删除方案。

---

# 12. 代码改造清单

## 12.1 必须修改

| 文件                                          | 改造内容                                  |
| ------------------------------------------- | ------------------------------------- |
| `src/services/installation_service.py`      | 删除 Stub；安装失败立即终止；真实 executable 校验     |
| `src/integrations/hermes/cli_adapter.py`    | 修正 doctor、Profile 参数、Gateway 命令       |
| `src/runtime/gateway_process.py`            | 使用统一 CLI Builder；支持 scoped env        |
| `src/services/gateway_supervisor.py`        | 增加 Instance 生命周期                      |
| `src/services/instance_service.py`          | 改为调用 Instance Supervisor              |
| `src/core/lifecycle.py`                     | Instance reconcile/autostart/shutdown |
| `src/services/configuration_service.py`     | 默认 Profile 路径、原子写、原生校验、失败恢复           |
| `src/services/secret_service.py`            | DPAPI 严格模式、Secret 环境解析、保留名校验          |
| `src/core/config.py`                        | 增加 Secret Store 配置；统一 bind 配置         |
| `src/main.py`                               | 使用 `bind_host` / `bind_port`          |
| `src/integrations/hermes/config_writer.py`  | 使用统一 Profile Path                     |
| `src/integrations/hermes/profile_loader.py` | 使用统一 Profile Path                     |
| `src/utils/paths.py`                        | 默认 Profile 特殊处理或废弃并迁移                 |
| `scripts/bootstrap-windows.ps1`             | 接收并使用 PythonPath                      |
| `scripts/runtime-install-windows.ps1`       | 参数贯穿；调整 UserDaemon 安装时机               |
| `scripts/runtime-precheck-windows.ps1`      | 端口冲突强校验；Python 版本校验                   |
| `scripts/runtime-smoke-test-windows.ps1`    | 增加 Hermes/Gateway 验证                  |
| `.env.example`                              | 新增 Secret Store 和 Provision 配置        |
| `docs/runtime-installation.md`              | 更新真实安装流程                              |
| `README.md`                                 | 更新 v1.3.1 Windows 操作                  |

---

## 12.2 建议新增

```text
src/runtime/hermes_profile_paths.py
src/services/instance_gateway_service.py
src/runtime/gateway_environment.py
scripts/runtime-install-windows.cmd
scripts/runtime-provision-windows.ps1
scripts/runtime-provision-windows.cmd
scripts/runtime-start-windows.cmd
tests/test_real_artifact_install.py
tests/test_instance_gateway_supervisor.py
tests/test_gateway_command_contract.py
tests/test_profile_paths.py
tests/test_gateway_secret_environment.py
tests/test_windows_bootstrap_contract.py
```

---

# 13. 关键实现约束

## 13.1 安装不得降级成功

以下代码必须删除：

```text
pip_install_failed_using_stub
_write_stub_hermes
0.0.0-stub
```

测试 Stub 必须放在测试 Fixture 中，不得进入生产代码。

---

## 13.2 Gateway 不使用 Shell

必须继续使用：

```python
asyncio.create_subprocess_exec(*argv)
```

禁止：

```python
shell=True
subprocess.run("...")
os.system(...)
cmd.exe /c
powershell -Command
```

---

## 13.3 Secret 不进入配置快照

Config Snapshot 只保存：

```text
config.yaml
```

不得包含 SecretStore 数据或 `.env` 明文。

---

## 13.4 默认只监听 Loopback

Runtime：

```text
127.0.0.1:8765
```

Gateway：

```text
127.0.0.1:<instance.gateway_port>
```

禁止默认使用：

```text
0.0.0.0
```

---

## 13.5 路径限制

Windows 程序目录：

```text
D:\Programs
```

允许：

```text
D:\Programs\copilot-serve
D:\Programs\HermesAgent
```

服务态允许：

```text
%LOCALAPPDATA%\HermesRuntime
```

用户数据允许：

```text
%USERPROFILE%\.hermes
```

---

# 14. Windows 完整目标流程

## 14.1 用户执行

```bat
D:\Programs\copilot-serve\scripts\runtime-provision-windows.cmd ^
  -PythonPath "C:\Python312\python.exe" ^
  -NodePath "C:\Program Files\nodejs" ^
  -GitPath "C:\Program Files\Git\cmd\git.exe" ^
  -HermesInstallDir "D:\Programs\HermesAgent" ^
  -ManifestUrl "<manifest-url>" ^
  -UserDaemon
```

## 14.2 内部流程

```text
1. ExecutionPolicy Process Bypass
2. 检查 D:\Programs 路径
3. 检查 Python 3.12
4. 检查 Node
5. 检查 Git
6. 检查 uv
7. 创建 copilot-serve/.venv
8. 安装 Runtime 依赖
9. 执行 Alembic
10. 启动 Runtime 临时进程
11. 检查 Runtime /health
12. 提交 Hermes install Job
13. 下载 Artifact
14. 校验 SHA-256
15. 创建 Hermes 版本 venv
16. 安装真实 Hermes
17. 验证 hermes.exe
18. 执行 hermes --version
19. 执行 config migrate
20. 执行 doctor
21. 激活 RuntimeVersion
22. 创建默认 Instance
23. 生成 API_SERVER_KEY
24. 启动 Gateway
25. 检查 Gateway /health
26. 检查 /v1/models
27. 执行 Smoke Test
28. 注册 UserDaemon
29. 启动 UserDaemon
30. 输出安装结果
```

---

# 15. 测试方案

## 15.1 单元测试

### InstallationService

* Artifact 无安装入口时失败；
* pip install 失败时失败；
* executable 缺失时失败；
* version 包含 stub 时失败；
* checksum 错误时失败；
* 安装失败不切换 Active；
* 成功后写入 RuntimeVersion。

### CLI Adapter

验证：

```text
default gateway command
named gateway command
doctor command
config check command
config migrate command
```

必须断言不存在：

```text
--profile
--port
doctor --json
```

### Profile Path

| Profile   | 期望路径                                    |
| --------- | --------------------------------------- |
| `default` | `~/.hermes/config.yaml`                 |
| 空字符串      | `~/.hermes/config.yaml`                 |
| `coding`  | `~/.hermes/profiles/coding/config.yaml` |

### Secret

* Windows DPAPI 成功；
* DPAPI 不可用时生产模式失败；
* 开发模式显式允许文件存储；
* GET 不返回明文；
* 保留环境变量名被拒绝；
* Profile Secret 隔离。

### Gateway Environment

断言包含：

```text
API_SERVER_ENABLED
API_SERVER_HOST
API_SERVER_PORT
API_SERVER_KEY
```

断言日志不包含 Secret Value。

---

## 15.2 集成测试

### 真实 Artifact 测试

测试 Artifact 必须包含可安装的最小 Python 包，并生成真实：

```text
hermes.exe
```

不允许使用 Stub。

流程：

```text
file:// manifest
→ ZIP
→ SHA-256
→ install Job
→ venv
→ pip install
→ hermes --version
→ RuntimeVersion active
```

### Instance Gateway 测试

使用兼容 Hermes CLI 的测试 Gateway：

```text
create Instance
→ start
→ /health
→ running
→ restart
→ stop
```

### 配置测试

```text
创建 Instance
→ Patch config
→ native config check
→ restart
→ health
```

错误配置：

```text
Patch
→ config check failed
→ restore snapshot
→ 原 Gateway 保持可用
```

---

## 15.3 Windows 实机测试

测试环境：

```text
Windows 11 Pro x64
PowerShell 5.1
PowerShell 7
Python 3.12
Node 22
Git for Windows
非管理员 UserDaemon
管理员 Windows Service 对照测试
```

测试场景：

1. PowerShell 禁止脚本；
2. Python 不在 PATH，但传入 `-PythonPath`；
3. 8765 空闲；
4. 8765 已有健康 Runtime；
5. 8765 被未知应用占用；
6. Gateway 8642 被未知进程占用；
7. Artifact 下载中断；
8. SHA-256 错误；
9. pip install 失败；
10. Hermes Doctor 失败；
11. Gateway 启动失败；
12. Runtime 重启后 Instance 恢复；
13. Windows 注销再登录后 UserDaemon 自动启动；
14. Secret 写入后重启 Gateway；
15. Desktop 完成 Chat SSE。

---

# 16. 验收标准

## 16.1 安装验收

必须同时满足：

```text
Runtime /health = 200
Runtime status = ready
hermesInstalled = true
activeHermesVersion 非空
active executable 文件存在
hermes --version 退出码 = 0
版本不包含 stub
Install Job = succeeded
```

---

## 16.2 Instance 验收

```text
默认 Instance 存在
Instance 绑定 Active RuntimeVersion
gatewayPort = 8642
status = running
healthy = true
pid 非空
```

---

## 16.3 Gateway 验收

```text
GET /health = 200
GET /v1/models 可访问
POST /v1/chat/completions 可建立 SSE
Gateway 日志无 argparse error
Gateway 日志无 unknown argument --port
Gateway 日志无 unknown argument --profile
```

---

## 16.4 配置验收

```text
default 配置写入 ~/.hermes/config.yaml
命名 Profile 写入 ~/.hermes/profiles/<name>/config.yaml
错误配置可以恢复
模型配置变更后 Gateway 可重启
```

---

## 16.5 Secret 验收

```text
Windows 使用 DPAPI
Secret GET 不返回明文
Gateway 可以读取所属 Profile Secret
不同 Profile 之间 Secret 隔离
日志不出现 Secret
```

---

## 16.6 Windows 安装体验验收

```text
用户无需永久修改 ExecutionPolicy
显式 PythonPath 可以完成安装
安装失败返回非零退出码
安装日志可定位具体阶段
成功后 UserDaemon 自动运行
Windows 登录后 Runtime 自动启动
```

---

## 16.7 自动化测试验收

至少新增并通过：

```text
test_install_rejects_non_installable_artifact
test_install_rejects_stub_version
test_install_does_not_activate_on_pip_failure
test_gateway_command_default_profile
test_gateway_command_named_profile
test_doctor_command_has_no_json_flag
test_default_profile_path
test_named_profile_path
test_instance_start_without_legacy_profile
test_instance_autostart_on_runtime_boot
test_instance_reconcile_after_runtime_restart
test_gateway_env_contains_api_server_settings
test_gateway_env_profile_secret_isolation
test_windows_dpapi_required
test_configuration_invalid_rolls_back
```

全量执行：

```text
uv run pytest -q
uv run ruff check src tests
```

结果必须：

```text
0 failed
0 lint errors
```

---

# 17. 发布策略

## 17.1 开发分支

```text
hotfix/windows-runtime-v1.3.1
```

## 17.2 提交顺序

### Commit 1

```text
fix(installer): reject stub and invalid Hermes artifacts
```

### Commit 2

```text
fix(hermes-cli): align doctor gateway and profile command contracts
```

### Commit 3

```text
fix(profile-path): resolve default and named Hermes homes correctly
```

### Commit 4

```text
fix(instance-runtime): supervise instances independently from legacy profiles
```

### Commit 5

```text
fix(secrets): inject scoped DPAPI secrets into gateway processes
```

### Commit 6

```text
fix(windows-bootstrap): propagate explicit Python path and add cmd launcher
```

### Commit 7

```text
feat(windows-provision): add end-to-end Runtime and Hermes provisioning
```

### Commit 8

```text
test(runtime): add real artifact and gateway lifecycle coverage
```

### Commit 9

```text
docs(runtime): update Windows v1.3.1 installation and troubleshooting
```

---

## 17.3 发布前检查

```text
测试环境全新安装
旧 v1.3 数据库升级
旧 Active Hermes 版本保留
旧 Profile API 可用
Desktop 可连接 Runtime
Chat 可调用 Gateway
Rollback 可恢复旧 Active 版本
```

---

# 18. 回滚策略

## 18.1 代码回滚

保留 v1.3 Git Tag：

```text
runtime-v1.3
```

发布 v1.3.1 Tag：

```text
runtime-v1.3.1
```

---

## 18.2 Hermes 版本回滚

安装新版本前保留当前 Active：

```text
RuntimeVersion.status = active
active.json
```

新版本通过全部校验后再切换 Active。

失败时：

```text
删除 staging
保留旧版本
保留旧 active.json
保留 ~/.hermes
保留 Secret
保留 Runtime 数据库
```

---

## 18.3 配置回滚

每次配置 Patch 前创建 Snapshot。

配置校验失败：

```text
恢复 Snapshot
不重启 Gateway
返回 configuration_invalid
```

Gateway 重启失败：

```text
恢复 Snapshot
再次启动旧配置
记录 restart rollback
```

---

# 19. 风险与控制

| 风险                        | 控制                                 |
| ------------------------- | ---------------------------------- |
| Hermes CLI 后续继续变化         | CLI Adapter 集中封装，并增加契约测试           |
| 默认 Profile 与命名 Profile 混淆 | 单一 Profile Path Resolver           |
| Instance/Profile 双状态      | Instance 生命周期独立，旧 Profile 仅兼容      |
| Secret 跨 Profile 泄漏       | Scope 解析与环境白名单                     |
| Windows DPAPI 用户不一致       | Runtime 与 Gateway 必须使用同一用户         |
| 未知进程占用 Gateway 端口         | 不自动终止未知 PID                        |
| Artifact 安装失败却激活          | executable/version/doctor 全部通过后才激活 |
| PowerShell 策略阻止脚本         | `.cmd + Process Bypass`            |
| 显式 PythonPath 丢失          | 参数贯穿预检、Bootstrap 和安装 API           |
| 配置错误导致 Gateway 不可用        | Snapshot、native check、失败恢复         |
| Secret 出现在日志              | Redaction 与环境名白名单                  |
| UserDaemon 安装了不可用 Runtime | Smoke Test 通过后才注册                  |

---

# 20. 开发优先级

## P0 第一阶段：真实安装

* 删除 Stub；
* 修复 Artifact 安装错误；
* 修复 Doctor；
* 增加真实 executable 验证；
* 增加真实 Artifact 测试。

## P0 第二阶段：Gateway 启动

* 修复 Gateway CLI；
* 修复 API Server 环境；
* 修复默认 Profile 路径；
* Instance 独立 Supervisor；
* Instance 自动启动与恢复。

## P0 第三阶段：Windows 安装

* PythonPath 全链路；
* `.cmd` Bypass；
* Provision 脚本；
* 增强 Smoke Test；
* UserDaemon 安装顺序。

## P0 第四阶段：Secret

* DPAPI 严格模式；
* Secret Scope；
* Gateway 环境注入；
* API_SERVER_KEY 自动生成；
* 日志脱敏。

## P1 第五阶段：配置可靠性

* 原子写入；
* Hermes native config check；
* Snapshot 自动恢复；
* 重启失败回滚。

---

# 21. Definition of Done

v1.3.1 只有在以下条件全部满足后才能发布：

```text
[ ] 不再存在生产 Stub Hermes 逻辑
[ ] 真实 Artifact 可在 Windows 安装
[ ] hermes.exe --version 正常
[ ] doctor 命令兼容
[ ] Gateway CLI 命令兼容
[ ] 默认 Profile 路径正确
[ ] 命名 Profile 路径正确
[ ] API Server 通过环境变量启用
[ ] Instance 不依赖旧 Profile 记录启动
[ ] Instance 支持 autostart
[ ] Runtime 重启后 Instance 可恢复
[ ] Secret 使用 Windows DPAPI
[ ] Secret 可注入 Gateway
[ ] 不同 Profile Secret 隔离
[ ] PowerShell Restricted 环境可通过 cmd 安装
[ ] 显式 PythonPath 全链路生效
[ ] Provision 脚本完成端到端安装
[ ] Smoke Test 覆盖真实 Hermes 和 Gateway
[ ] Desktop 可完成 Chat SSE
[ ] 全量 pytest 通过
[ ] Ruff 检查通过
[ ] 安装、升级、回滚文档完成
```

---

# 22. 阶段验收结果

完成 v1.3.1 后，Windows 11 Pro 上应达到：

```text
用户执行一个 Provision 入口
→ Runtime Service 安装成功
→ Hermes Agent 真实版本安装成功
→ 默认 Instance 创建成功
→ Provider Secret 安全保存
→ Hermes Gateway 启动成功
→ API Server 健康
→ Copilot Desktop 可以连接
→ Chat 可以正常流式返回
→ Windows 重新登录后 Runtime 自动恢复
```

v1.3.1 验收重点不是“安装 Job 返回成功”，而是：

```text
真实 Hermes 可执行
真实 Gateway 可启动
真实 API Server 可调用
真实 Desktop Chat 可完成
```
