# PRD-WORK-v2.4 — OPSI Managed Hermes Runtime Integration

**版本：** v2.4
**模块：** `apps/work` / Hermes Runtime Integration
**关联基线：**

* `smc-copilot/opsi/prd-2.0`
* `smc-copilot/work/prd-v2.0`

**目标平台：** Windows 10 / Windows 11 AMD64
**文档类型：** 工程实施 PRD
**实施目标：** 将 `apps/work` 对 Hermes 的运行时管理模型统一到 OPSI v2.0 已完成的企业 Managed Hermes Runtime，不再保留 Desktop 自建 Runtime、多 Control Owner、多连接类型等历史兼容架构。

---

# 1. 背景

`opsi/prd-2.0` 已经重新定义 Windows Hermes Agent 的安装和运行结构：

```text
PROGRAM_ROOT
D:\Programs\SMC\Hermes

HERMES_HOME
C:\ProgramData\SMC\Hermes

HERMES_AGENT_ROOT
D:\Programs\SMC\Hermes\node\hermes-agent

PATH
D:\Programs\SMC\Hermes\bin
D:\Programs\SMC\Hermes\scripts
```

其中 OPSI Managed Runtime 明确实行：

```text
Program Files / Runtime Binary
                ≠
Persistent Hermes Data
```

`SmcHermesManaged.psm1` 当前也正式定义：

```text
ProgramRoot = D:\Programs\SMC\Hermes
HermesHome  = C:\ProgramData\SMC\Hermes
CliPath     = D:\Programs\SMC\Hermes\bin\hermes.exe
```

同时安装程序把 `HERMES_HOME` 注册为 Machine Environment Variable，并建立受控的数据目录。

Hermes Gateway 则由安装程序创建：

```text
Scheduled Task
SMC Hermes Gateway

Account:
SYSTEM

Executable:
D:\Programs\SMC\Hermes\bin\hermes.exe

Arguments:
gateway run
```

但 `apps/work` 当前仍保留原 Hermes Desktop 的 Runtime 模型：

```text
HERMES_HOME
    ↓
HERMES_HOME\hermes-agent
    ↓
venv
    ↓
python/pythonw
    ↓
hermes_cli.main

Desktop
    ↓
启动/恢复/重启 Gateway
```

并且 RuntimeManager 仍根据：

```text
direct
salt
runtime
```

选择三类 Adapter。

两套架构已经产生职责和路径冲突。

---

# 2. v2.4 核心目标

v2.4 将 `apps/work` 的 Hermes Runtime 架构收敛为：

> **OPSI / Hermes Installer 管理 Hermes Runtime 生命周期，Work Desktop 只负责发现、连接、探测和调用本机 Hermes Gateway。**

最终生产路径：

```text
OPSI
 │
 ├─ Install Hermes
 ├─ Upgrade Hermes
 ├─ Repair Hermes
 ├─ Configure Hermes
 └─ Manage Gateway
       │
       ▼
D:\Programs\SMC\Hermes
       │
       ▼
SMC Hermes Gateway
SYSTEM / Scheduled Task
127.0.0.1:8642
       ▲
       │ HTTP
       │
apps/work
       │
RuntimeManager
       │
LegacyLocalRuntimeAdapter
       │
Chat / Session / Model / Capability
```

---

# 3. v2.4 架构决策

## ADR-01 — Program 与 Data 完全分离

定义：

```text
PROGRAM_ROOT
D:\Programs\SMC\Hermes
```

负责：

```text
bin/
python/
node/
scripts/
runtime/
```

定义：

```text
HERMES_HOME
C:\ProgramData\SMC\Hermes
```

负责：

```text
config.yaml
.env
auth.json

profiles/
skills/
sessions/
workspace/
logs/
state/
```

Work 禁止继续执行：

```ts
HERMES_REPO = join(HERMES_HOME, "hermes-agent");
HERMES_VENV = join(HERMES_REPO, "venv");
```

当前 `apps/work` 正是通过上述方式从 `HERMES_HOME` 推导 Repo/Venv/Python，必须移除该假设。

---

# 4. ADR-02 — Work 不再理解 Hermes 内部安装结构

Work 的运行时 Contract 只能依赖：

```text
Hermes Home
Hermes CLI
Gateway Endpoint
```

即：

```text
C:\ProgramData\SMC\Hermes

D:\Programs\SMC\Hermes\bin\hermes.exe

http://127.0.0.1:8642
```

以下路径不再属于核心 Runtime Contract：

```text
HERMES_AGENT_ROOT
python root
node root
venv
site-packages
hermes_cli.main
source repo
```

其中 `HERMES_AGENT_ROOT` 可以作为：

```text
diagnostics metadata
```

但不得再用于：

```text
runtimeFound
runtimeValid
gatewayReady
```

判断。

---

# 5. ADR-03 — RuntimeManager 只保留一种 Runtime

当前：

```text
RuntimeManager
   │
   ├─ direct
   │    └─ LegacyLocalRuntimeAdapter
   │
   ├─ salt
   │    └─ HermesAvailabilityBackend
   │
   └─ runtime
        └─ RuntimeServiceAdapter
```

v2.4 改为：

```text
RuntimeManager
      │
      ▼
LegacyLocalRuntimeAdapter
```

删除生产运行路径中的：

```text
RuntimeServiceAdapter
HermesAvailabilityBackend
getHermesControlOwner()
direct/salt/runtime switch
```

---

# 6. ADR-04 — RuntimeManager 不再判断 Control Owner

`opsi/prd-2.0` 当前 Installer 写入：

```json
{
  "hermes": "opsi"
}
```

而 Work 当前 Control Owner 只支持：

```text
direct
salt
runtime
```

两套 Contract 本身已经不一致。

v2.4 不再扩展：

```text
direct/salt/runtime/opsi
```

成为第四种 Router。

而是：

> `control-owner.json` 退出 Work Runtime Routing。

它继续作为：

```text
OPSI
Installer
Endpoint Controller
```

之间的设备管理状态。

Work 不再根据它决定使用哪个 Runtime Adapter。

---

# 7. ADR-05 — Gateway 只有一个 Process Owner

Gateway 生命周期唯一 Owner：

```text
OPSI / SMC Hermes Installer
```

Gateway 运行方式：

```text
Windows Scheduled Task
        │
        ▼
SMC Hermes Gateway
        │
      SYSTEM
```

当前 Installer 已经实现上述模型。

因此 Work 禁止：

```text
spawn Hermes Gateway
kill Hermes Gateway
restart Hermes Gateway process
maintain Gateway PID ownership
recover Gateway by launching another process
```

---

# 8. LegacyLocalRuntimeAdapter 职责重定义

保留：

```text
LegacyLocalRuntimeAdapter
```

类名，降低现阶段代码迁移范围。

但其语义从：

> Local Hermes Runtime Owner

调整为：

> Managed Local Hermes Runtime Consumer

---

## 8.1 当前职责

当前 `ensureReady()` 会：

```text
probe
  ↓
Gateway stopped
  ↓
startGatewayWithRecovery()
```

`restart()` 会直接：

```text
restartGateway()
```

这会与 SYSTEM Scheduled Task 形成双进程 Owner。

---

## 8.2 v2.4 职责

### probe()

负责：

```text
Runtime Descriptor
       ↓
CLI Exists
       ↓
Hermes Version
       ↓
Gateway Health
       ↓
Authenticated Probe
       ↓
Runtime State
```

### ensureReady()

改成：

```text
probe()
```

如果 Gateway 不可访问：

```text
gateway_unreachable
```

禁止执行：

```text
startGatewayWithRecovery()
```

---

## 8.3 restart()

生产 Runtime 不再直接 restart。

接口保留时返回：

```text
management_required
```

例如：

```ts
{
  ok: false,
  state: "gateway_unreachable",
  errorCode: "MANAGED_RUNTIME_RESTART_REQUIRED",
  errorMessage:
    "Hermes Gateway is managed by the endpoint management service."
}
```

后续若需要 Work UI 提供：

```text
Restart Hermes
```

必须通过：

```text
Work
 ↓
Privileged Endpoint Management API
 ↓
OPSI / Endpoint Controller
 ↓
Scheduled Task restart
```

实现。

---

# 9. ADR-06 — 引入 Runtime Descriptor

禁止继续把 Runtime Path 写死在业务代码各处。

新增统一配置：

```text
HermesRuntimeConfig
```

建议定义：

```ts
export interface HermesRuntimeConfig {
  schemaVersion: 1;

  hermes: {
    home: string;
    programRoot: string;
    cliPath: string;

    agentRoot?: string;
    scriptsRoot?: string;
  };

  gateway: {
    baseUrl: string;
    healthPath: string;
  };
}
```

默认值：

```json
{
  "schemaVersion": 1,
  "hermes": {
    "home": "C:\\ProgramData\\SMC\\Hermes",
    "programRoot": "D:\\Programs\\SMC\\Hermes",
    "cliPath": "D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe",
    "agentRoot": "D:\\Programs\\SMC\\Hermes\\node\\hermes-agent",
    "scriptsRoot": "D:\\Programs\\SMC\\Hermes\\scripts"
  },
  "gateway": {
    "baseUrl": "http://127.0.0.1:8642",
    "healthPath": "/health"
  }
}
```

---

# 10. Runtime Config 保存位置

Work Runtime Config 必须属于 Work。

推荐：

```text
%APPDATA%\SMC-Copilot\runtime.json
```

或者统一放入 Work Settings Store。

禁止继续：

```text
C:\ProgramData\SMC\Hermes\desktop.json
```

当前 `config.ts` 将 Desktop connection config 保存在：

```ts
join(HERMES_HOME, "desktop.json")
```

该设计必须废弃。

---

# 11. 原因：OPSI Hermes Home ACL 与 Desktop 用户权限冲突

OPSI 当前对：

```text
C:\ProgramData\SMC\Hermes
```

执行：

```text
ACL inheritance disabled

SYSTEM         FullControl
Administrators FullControl
```

因此不能假定普通 Desktop 用户可以：

```text
write desktop.json
write config.yaml
write .env
modify profile files
```

v2.4 的边界：

```text
Hermes Machine Configuration
        │
        └─ OPSI / privileged management

Work Desktop Configuration
        │
        └─ Work userData
```

二者彻底分开。

---

# 12. Runtime Config 解析优先级

定义统一 Resolver：

```ts
getHermesRuntimeConfig()
```

优先级：

```text
1. Work runtime.json
        ↓
2. Enterprise Runtime Descriptor
        ↓
3. Machine HERMES_HOME
        ↓
4. Windows Enterprise Defaults
```

Enterprise 默认：

```text
home:
C:\ProgramData\SMC\Hermes

programRoot:
D:\Programs\SMC\Hermes

cli:
D:\Programs\SMC\Hermes\bin\hermes.exe

gateway:
http://127.0.0.1:8642
```

---

# 13. 不再扫描历史 Home

生产环境取消：

```text
%LOCALAPPDATA%\hermes
%USERPROFILE%\.hermes
```

自动探测。

当前 `defaultHermesHome()` 会在：

```text
%LOCALAPPDATA%\hermes
~\.hermes
```

之间寻找已有数据。

该行为属于旧 Desktop 自安装模式。

Enterprise Managed Runtime 下 Canonical Home：

```text
C:\ProgramData\SMC\Hermes
```

不得因为用户目录中遗留一个 `.hermes` 而切换 Runtime。

---

# 14. ADR-07 — 禁止 Module-Level Runtime Path Snapshot

当前：

```ts
export const HERMES_HOME = ...
export const HERMES_REPO = ...
export const HERMES_PYTHON = ...
```

都是 module initialization 时计算。

这与“桌面配置变量”需求冲突。

v2.4 改成：

```ts
getHermesRuntimeConfig()

getHermesHome()

getHermesCliPath()

getGatewayBaseUrl()
```

禁止新增：

```ts
const HERMES_HOME = ...
const HERMES_CLI = ...
```

作为运行期 Single Source of Truth。

---

# 15. Hermes Runtime Locator 重构

当前 Locator 仍要求：

```text
HERMES_HOME\hermes-agent
venv
python
hermes_cli\main.py
```

存在才能认定 Runtime Valid。

v2.4 改为：

```text
Runtime Found
=
home exists
OR
cli exists

Runtime Valid
=
cliPath exists
AND
CLI executable can execute

CLI Available
=
hermes.exe --version succeeds
```

---

## 15.1 新 Locator

建议：

```ts
interface HermesRuntimeLocation {
  homePath: string;
  programRoot: string;
  executablePath: string;
  endpoint: string;

  runtimeFound: boolean;
  runtimeValid: boolean;
  cliAvailable: boolean;
}
```

删除核心 Contract 中：

```text
repoPath
pythonPath
venvPath
```

---

# 16. Hermes CLI 调用统一

当前 Work 调用：

```text
HERMES_PYTHON
-m hermes_cli.main
```

例如：

```text
getHermesVersion()
runHermesDoctor()
```

v2.4 统一调用：

```text
D:\Programs\SMC\Hermes\bin\hermes.exe
```

---

## 16.1 Version

从：

```text
python -m hermes_cli.main --version
```

改成：

```text
hermes.exe --version
```

---

## 16.2 Doctor

从：

```text
python -m hermes_cli.main doctor
```

改成：

```text
hermes.exe doctor
```

---

## 16.3 原则

Work 不再知道：

```text
Hermes CLI 使用 Python
Hermes 包位于 site-packages
Hermes launcher 如何构建
```

这些属于 Runtime 实现细节。

OPSI 当前 Windows Runtime 已经正式构建 `bin\hermes.exe`，并以 PE AMD64 executable 作为 Runtime Gate。

---

# 17. PATH 策略

取消现有大量：

```text
HERMES_HOME\git
HERMES_HOME\node
HERMES_VENV\Scripts
```

拼接。

当前 `getEnhancedPath()` 仍有这些历史路径假设。

v2.4 原则：

> 核心程序全部使用 Absolute Path。

即：

```text
Hermes CLI
D:\Programs\SMC\Hermes\bin\hermes.exe
```

如果个别 subprocess 必须使用 PATH：

```text
D:\Programs\SMC\Hermes\bin
D:\Programs\SMC\Hermes\scripts
D:\Programs\SMC\Hermes\node
```

只加入该 subprocess 的：

```ts
env.PATH
```

不修改系统 PATH，不依赖用户 shell PATH。

---

# 18. ADR-08 — Gateway Endpoint Single Source of Truth

当前至少存在三种 Endpoint Resolver：

```text
RuntimeManager / Locator

hermes.ts
connectionMode local/remote/ssh

gateway-ports.ts
profile → port
```

必须收敛。

最终：

```text
HermesRuntimeConfig.gateway.baseUrl
                    │
                    ├─ Runtime probe
                    ├─ Chat
                    ├─ Models
                    ├─ Sessions
                    ├─ Capabilities
                    └─ Health
```

全部使用：

```text
http://127.0.0.1:8642
```

---

# 19. Connection Mode 收敛

当前 `ConnectionConfig` 还定义：

```text
local
remote
ssh
```

如果 Work 产品架构已经确定：

```text
Desktop
  ↓
Local OPSI Managed Hermes
```

则 v2.4 生产路径取消：

```text
remote
ssh
```

Runtime Routing。

---

## 19.1 目标

不再：

```text
connectionMode === remote
→ remoteUrl

connectionMode === ssh
→ ssh tunnel

connectionMode === local
→ local gateway
```

而是：

```text
gatewayUrl =
runtimeConfig.gateway.baseUrl
```

如果未来重新支持 Remote Hermes：

> 作为独立新 Transport PRD 引入，而不是继续让 RuntimeManager 承担两套架构。

---

# 20. Profile / Gateway Port 收敛

当前：

```text
default → 8642

profile A → allocate 8643
profile B → allocate 8644
...
```

而且 `gateway-ports.ts` 可能修改 Profile config。

这与 OPSI 当前单 Scheduled Task Gateway 模式不一致。

v2.4 默认模型：

```text
一台 Endpoint
     │
一个 Hermes Gateway
     │
127.0.0.1:8642
     │
Hermes 内部处理 Profile / Agent
```

Work 不再：

```text
profile → standalone Gateway port
```

---

# 21. Gateway Authentication 重构

当前 Adapter 通过：

```ts
getApiServerKey(profile)
```

判断：

```text
authenticated
```

这意味着普通 Work 用户需要直接读取：

```text
HERMES_HOME\.env
```

与 OPSI ACL 模型不兼容。

---

## 21.1 新原则

认证状态由 Gateway 实际响应判断：

```text
GET /health
        ↓
Gateway reachable

Authenticated API Probe
        ↓
200
        → authenticated

401/403
        → gateway_auth_failed
```

不能再：

```text
找到 API_SERVER_KEY
=
认证成功
```

---

# 22. Secret 管理边界

如果 Local Gateway 必须使用 Token：

Token 不直接通过：

```text
C:\ProgramData\SMC\Hermes\.env
```

暴露给普通 Work Desktop。

应进入：

```text
Windows Credential Manager
DPAPI protected Work Secret Store
或
OPSI 提供的安全 Client Credential
```

v2.4 至少要完成：

```text
Work 不再要求直接读 Hermes .env 才能连接 Gateway
```

具体 Credential Provisioning 可以拆成安全子任务。

---

# 23. `config.ts` 职责拆分

当前 `config.ts` 混合：

```text
Desktop Connection Config
Hermes config.yaml
Hermes .env
Provider Config
API Key
```

v2.4 拆成：

```text
work-runtime-config.ts
    │
    └─ Work Runtime Descriptor

work-settings.ts
    │
    └─ Desktop UI / user preferences

hermes-config-reader.ts
    │
    └─ 必要的只读 Hermes information

privileged configuration
    │
    └─ OPSI / Endpoint Controller
```

普通 Work 用户不再负责 Machine Hermes Config Mutation。

---

# 24. RuntimeManager 最终实现

建议：

```ts
export class RuntimeManager {
  private readonly adapter: HermesRuntimeAdapter;
  private lastProbe: HermesRuntimeProbe | null = null;

  constructor(
    adapter: HermesRuntimeAdapter = new LegacyLocalRuntimeAdapter(),
  ) {
    this.adapter = adapter;
  }

  async probe(profile?: string) {
    const result = await this.adapter.probe(profile);
    this.emit(result);
    return result;
  }

  async getStatus(profile?: string) {
    return this.probe(profile);
  }

  async ensureReady(profile?: string) {
    return this.adapter.ensureReady(profile);
  }

  getLastProbe() {
    return this.lastProbe;
  }
}
```

删除：

```text
defaultAdapter()

getHermesControlOwner()

RuntimeServiceAdapter

HermesAvailabilityBackend
```

测试仍允许 Adapter Dependency Injection。

---

# 25. Runtime Contract 调整

当前 Contract：

```ts
interface HermesRuntimeAdapter {
  probe()
  ensureReady()
  getStatus()
  restart()
}
```

v2.4 推荐调整为：

```ts
interface HermesRuntimeAdapter {
  probe(profile?: string): Promise<HermesRuntimeProbe>;

  ensureReady(
    profile?: string
  ): Promise<HermesRuntimeConnectionResult>;

  getStatus(
    profile?: string
  ): Promise<HermesRuntimeProbe>;
}
```

删除：

```text
restart()
```

更符合 Work 非 Runtime Owner 的职责。

如果现有 Renderer IPC 暂时依赖 `restart()`，可保留一个版本作为 Deprecated：

```text
restart()
→ MANAGED_RUNTIME_RESTART_REQUIRED
```

后续删除。

---

# 26. Runtime State 定义

保留：

```text
ready
runtime_missing
runtime_invalid
gateway_unreachable
gateway_auth_failed
configuration_error
```

删除或逐步废弃：

```text
gateway_starting
gateway_stopped
```

因为 Desktop 不再拥有 Gateway Process Lifecycle。

建议新增：

```text
management_required
```

或者使用错误码：

```text
MANAGED_RUNTIME_ACTION_REQUIRED
```

而不扩大 State Machine。

---

# 27. 代码修改清单

## P0

### `apps/work/src/main/runtime/runtime-manager.ts`

处理：

```text
删除 Control Owner switch
删除 RuntimeServiceAdapter
删除 HermesAvailabilityBackend
默认只构建 LegacyLocalRuntimeAdapter
```

---

### `apps/work/src/main/runtime/hermes-runtime-paths.ts`

重构为：

```text
Runtime Config Resolver
```

删除：

```text
HERMES_HOME → repo → venv → python
```

推导。

---

### 新增

```text
apps/work/src/main/runtime/hermes-runtime-config.ts
```

职责：

```text
read
validate
normalize
resolve
```

Runtime Descriptor。

---

### `apps/work/src/main/runtime/hermes-runtime-locator.ts`

改成：

```text
home
programRoot
cli
gateway URL
```

验证。

---

### `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts`

删除：

```text
startGatewayWithRecovery()
restartGateway()
```

改成：

```text
probe-only + ensure-connect
```

---

### `apps/work/src/main/installer.ts`

替换：

```text
HERMES_PYTHON
hermesCliArgs
cwd=HERMES_REPO
```

为：

```text
runtime.cliPath
```

---

### `apps/work/src/main/hermes.ts`

Local Endpoint：

```text
getRuntimeConfig().gateway.baseUrl
```

成为唯一来源。

---

# 28. P1 代码改造

### `config.ts`

迁移：

```text
desktop.json
```

退出 `HERMES_HOME`。

---

### `gateway-ports.ts`

生产 Managed Mode：

```text
禁止 Profile 自动分配 Gateway Port
禁止修改 Hermes config.yaml
```

---

### `hermes/control-owner.ts`

退出 RuntimeManager。

如果其它 OPSI UI/状态页面仍需要读取：

```text
保留为 endpoint metadata
```

但不得控制 Adapter。

---

### `runtime-service-adapter.ts`

退出 Production Runtime Path。

后续确认无引用后删除。

---

### `runtime-service-client.ts`

同上。

---

### `runtime-management-backend.ts`

同上。

---

### `runtime-management-mapper.ts`

同上。

---

### `hermes/availability-backend.ts`

退出生产路径。

确认无引用后删除。

---

# 29. 不纳入 v2.4 的内容

以下不属于本次范围：

```text
Hermes Agent 打包格式重构

OPSI Server 管理体系重构

Hermes Gateway API 重构

Hermes Profile 内部调度模型重构

Remote Hermes

SSH Hermes

Cloud Runtime

services/runtime 恢复

新的 Runtime Adapter 类型
```

v2.4 的原则是：

> 减少 Runtime 模式，而不是增加新的兼容层。

---

# 30. Migration Strategy

## Phase 1 — 建立 Runtime Descriptor

新增：

```text
hermes-runtime-config.ts
```

先保持现有调用逻辑。

实现：

```text
config
defaults
validation
tests
```

---

## Phase 2 — 路径解耦

完成：

```text
HERMES_HOME ≠ PROGRAM_ROOT
```

核心 CLI 全部切换：

```text
hermes.exe
```

---

## Phase 3 — Locator 重构

删除：

```text
repo
venv
python
main.py
```

作为 Runtime Valid 条件。

---

## Phase 4 — RuntimeManager 单 Adapter

删除：

```text
direct / salt / runtime routing
```

只保留：

```text
LegacyLocalRuntimeAdapter
```

---

## Phase 5 — Gateway Ownership 收敛

删除 Work：

```text
spawn
restart
recovery launch
```

---

## Phase 6 — Endpoint 收敛

所有：

```text
Chat
Runtime
Model
Session
Capabilities
Health
```

统一：

```text
RuntimeConfig.gateway.baseUrl
```

---

## Phase 7 — Desktop Config 迁移

从：

```text
HERMES_HOME\desktop.json
```

迁移至：

```text
Work userData
```

---

## Phase 8 — ACL / Auth 验证

使用：

```text
普通 Windows Domain User
```

完成实际安装验证。

---

# 31. Unit Test

必须覆盖：

### Runtime Config

```text
Default Config
Custom Config
Invalid absolute path
Invalid Gateway URL
Missing Runtime Config
```

### Locator

```text
CLI exists
CLI missing
Home exists
Home missing
Gateway endpoint resolution
```

### RuntimeManager

```text
always LegacyLocalRuntimeAdapter

no control owner routing
```

### Adapter

```text
Gateway healthy
Gateway unreachable
Gateway 401
Runtime CLI missing
CLI invalid
```

---

# 32. Integration Test

必须覆盖实际 OPSI Managed Runtime：

```text
D:\Programs\SMC\Hermes
C:\ProgramData\SMC\Hermes
```

Case 1：

```text
Hermes installed
Gateway running
→ Work Ready
```

Case 2：

```text
Hermes installed
Gateway unavailable
→ gateway_unreachable
→ Work does NOT spawn process
```

Case 3：

```text
Hermes CLI missing
→ runtime_invalid
```

Case 4：

```text
Gateway returns 401
→ gateway_auth_failed
```

Case 5：

```text
normal user
no Admin rights
→ Work starts
→ Runtime probe works
→ Chat works
```

---

# 33. Process Ownership Test

必须重点验证：

启动 Work 前：

```powershell
Get-ScheduledTask -TaskName "SMC Hermes Gateway"
```

确认：

```text
SYSTEM
```

记录 Gateway PID。

启动 Work。

完成：

```text
Runtime probe
Chat
Sessions
Models
```

再次检查：

```text
Gateway PID unchanged
No second Hermes Gateway process
```

验收要求：

```text
Work 启动：
不得创建 Gateway Process

Work 退出：
不得终止 Gateway Process

Work 异常退出：
Gateway 必须继续运行
```

---

# 34. PATH / CLI Test

必须在：

```text
用户 PATH 不包含 Hermes
```

情况下启动 SMC-Copilot。

仍必须成功：

```text
runtime probe
hermes --version
doctor
chat
```

证明应用使用：

```text
absolute cliPath
```

而非依赖 shell PATH。

---

# 35. ACL Test

测试账号：

```text
Standard User
非 Administrators
```

验证：

```text
C:\ProgramData\SMC\Hermes
```

仍保持 OPSI ACL。

禁止为了兼容 Desktop 执行：

```text
Users FullControl
Everyone Read/Write
```

Work 自己配置写入：

```text
%APPDATA%\SMC-Copilot
```

---

# 36. Acceptance Criteria

### AC-01

Work 不再从：

```text
HERMES_HOME
```

推导 ProgramRoot。

### AC-02

Work 不再要求：

```text
HERMES_HOME\hermes-agent
```

存在。

### AC-03

Runtime Valid 以：

```text
hermes.exe
```

为 CLI 判断基础。

### AC-04

`RuntimeManager` 只有：

```text
LegacyLocalRuntimeAdapter
```

一个生产 Adapter。

### AC-05

不存在：

```text
direct/salt/runtime
```

Runtime Router。

### AC-06

`control-owner.json` 不再影响 RuntimeManager。

### AC-07

Work 不启动 Hermes Gateway。

### AC-08

Work 不终止 Hermes Gateway。

### AC-09

Work 不直接 Restart SYSTEM Gateway。

### AC-10

Gateway Endpoint 有唯一 SOT：

```text
RuntimeConfig.gateway.baseUrl
```

### AC-11

Production Default：

```text
http://127.0.0.1:8642
```

### AC-12

Work 不再自动为 Profile 修改 Gateway Port。

### AC-13

Desktop Runtime Config 位于 Work userData。

### AC-14

Desktop Config 不写：

```text
HERMES_HOME\desktop.json
```

### AC-15

普通 Windows 用户可运行 Work。

### AC-16

无需降低 Hermes Home ACL。

### AC-17

`hermes --version` 使用：

```text
D:\Programs\SMC\Hermes\bin\hermes.exe
```

### AC-18

Work 无需了解：

```text
venv
python module
hermes_cli.main
```

### AC-19

Work 启动后系统中没有第二个 Gateway Process。

### AC-20

Work 退出后 SYSTEM Gateway 继续运行。

---

# 37. Definition of Done

```text
[ ] HermesRuntimeConfig Contract 已完成

[ ] Runtime Config 已进入 Work userData

[ ] HERMES_HOME / PROGRAM_ROOT 已解耦

[ ] Hermes CLI 已切换到 bin\hermes.exe

[ ] Runtime Locator 不再依赖 repo/venv

[ ] RuntimeManager 只剩 LegacyLocalRuntimeAdapter

[ ] RuntimeServiceAdapter 已退出生产路径

[ ] HermesAvailabilityBackend 已退出生产路径

[ ] Control Owner Router 已移除

[ ] LegacyLocalRuntimeAdapter 不再启动 Gateway

[ ] LegacyLocalRuntimeAdapter 不再直接 Restart Gateway

[ ] Gateway URL 已统一

[ ] Profile Gateway Port 自动分配已退出 Managed Mode

[ ] Desktop Config 已移出 HERMES_HOME

[ ] Standard User ACL Test 通过

[ ] Work 无管理员权限运行通过

[ ] Gateway Auth Probe 通过

[ ] No Second Gateway Process Test 通过

[ ] Work Exit Gateway Survival Test 通过

[ ] OPSI Install → Work Connect 通过

[ ] OPSI Upgrade → Work Reconnect 通过

[ ] OPSI Repair → Work Reconnect 通过

[ ] Windows 10 验证通过

[ ] Windows 11 验证通过
```

---

# 38. v2.4 最终目录建议

```text
apps/work/src/main/runtime/
│
├── hermes-runtime-config.ts
├── hermes-runtime-locator.ts
├── legacy-local-runtime-adapter.ts
├── runtime-errors.ts
└── runtime-manager.ts
```

退出 Runtime 主链：

```text
runtime-service-adapter.ts
runtime-service-client.ts
runtime-management-backend.ts
runtime-management-mapper.ts

hermes/availability-backend.ts
hermes/control-owner.ts  ← 仅保留 OPSI metadata 用途时例外
```

---

# 39. 最终系统职责

## OPSI / Hermes Installer

唯一负责：

```text
Hermes installation
Hermes binary
Hermes upgrade
Hermes repair
Hermes configuration ownership
Hermes Home ACL
Machine HERMES_HOME
Gateway Scheduled Task
Gateway process lifecycle
```

当前 OPSI Installer 已经具备 install / upgrade / repair / uninstall 以及 Gateway Task 生命周期。

---

## Hermes Agent

负责：

```text
Gateway
Agent
Profiles
Skills
Sessions
Models
Tools
Runtime internal dependencies
```

---

## apps/work

只负责：

```text
Runtime discovery
Runtime status
Gateway health
Gateway authentication
Gateway API
Chat
Session
Model
Capability
UI
```

---

# 40. v2.4 目标架构

```text
┌──────────────────────────────────────────────┐
│ OPSI / Endpoint Management                   │
│                                              │
│ Install / Upgrade / Repair / Configure       │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│ SMC Managed Hermes Runtime                   │
│                                              │
│ PROGRAM_ROOT                                 │
│ D:\Programs\SMC\Hermes                       │
│                                              │
│ ├─ bin\hermes.exe                            │
│ ├─ python                                    │
│ ├─ node                                      │
│ └─ scripts                                   │
│                                              │
│ HERMES_HOME                                  │
│ C:\ProgramData\SMC\Hermes                    │
│                                              │
│ Gateway Owner = SYSTEM Scheduled Task        │
└───────────────────┬──────────────────────────┘
                    │
             127.0.0.1:8642
                    │
                    ▼
┌──────────────────────────────────────────────┐
│ SMC-Copilot / apps/work                      │
│                                              │
│ HermesRuntimeConfig                          │
│          │                                   │
│          ▼                                   │
│ RuntimeManager                               │
│          │                                   │
│          ▼                                   │
│ LegacyLocalRuntimeAdapter                    │
│          │                                   │
│          ▼                                   │
│ Hermes Gateway API                           │
│                                              │
│ Work owns no Hermes process                  │
│ Work owns no Hermes installation             │
│ Work owns no machine Hermes config           │
└──────────────────────────────────────────────┘
```

## v2.4 的核心工程边界

本次改造不是“让 Work 适配 OPSI 的几个新目录”，而是完成一次 **Runtime Ownership 收敛**：

```text
旧：

Work
 ├─ 找 Runtime
 ├─ 推导 Python/Venv
 ├─ 管 Gateway
 ├─ 支持 Runtime Service
 ├─ 支持 Salt
 ├─ 支持 Remote
 ├─ 支持 SSH
 └─ 修改 Hermes Config


v2.4：

OPSI
 └─ 管 Runtime

Work
 └─ 用 Runtime
```

这也是后续 `apps/work` 与 `opsi/prd-2.0` 能长期独立升级的关键：**OPSI 可以改变 Hermes 内部 Python、Node、Agent Root 和打包结构，只要继续提供稳定的 `hermes.exe + Gateway API + Runtime Descriptor`，Work 就不再需要同步修改运行时底层代码。**
