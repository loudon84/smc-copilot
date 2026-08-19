# PRD-OPSI-v2.0.1 — Production Installer & Endpoint Operations Closure

**项目**：SMC Copilot
**版本**：v2.0.1
**基线**：`opsi/prd-2.0`
**前置版本**：`PRD-OPSI-v2.0 — Managed Endpoint Architecture`
**客户端平台**：Windows 10 / Windows 11 x64
**OPSI**：4.3.x
**定位**：Production Closure / Engineering PRD
**核心约束**：**客户端零新增 .NET 依赖**
**架构门禁**：[`ADR-037`](../adr/ADR-037-opsi-managed-endpoint-v2.md) 当前为 `Proposed`；Architecture Owner 接受前，不授权 Production filesystem、ACL、Gateway Scheduled Task 或 `control-owner.json` 变更，Cursor/CI 不得代签 `Accepted`、`proven` 或 `GO`

---

# 1. 版本目标

v2.0 已完成 Managed Endpoint 架构收敛：

```text
services/opsi-control
        ↓
opsiconfd JSON-RPC
        ↓
OPSI MessageBus
        ↓
opsiclientd
        ↓
PowerShell 5.1 / Hermes CLI
```

Endpoint 只保留：

```text
Windows Endpoint
│
├── opsi-client-agent
│
└── SMC Managed Hermes
     ├── Hermes Runtime
     ├── Hermes CLI
     ├── Hermes Gateway
     └── Machine HERMES_HOME
```

v2.0.1 **不继续增加管理组件，不重新设计架构**，只完成以下生产闭环：

1. 将当前 Smoke Installer 升级为真实 Windows Production EXE。
2. 完成 Config / Logs / Sessions / Update / Repair 的真实 Endpoint Operation。
3. 完成 Artifact Server ↔ Endpoint 二进制双向传输。
4. 将 Hermes Release Pipeline 正式切换到 `hermes-installer`。
5. 修正 Client Snapshot/Reconcile 正确性。
6. 完成严格 CI Gate 与真实 Windows Endpoint 验收。

---

# 2. 强制工程约束

## 2.1 客户端零新增 .NET 依赖

生产客户端**禁止要求安装或下载**：

```text
.NET Runtime
.NET Desktop Runtime
ASP.NET Runtime
.NET SDK
.NET Framework Feature Package
```

禁止 Installer：

```text
检测 .NET Runtime
下载 .NET Runtime
安装 .NET Runtime
启动 dotnet.exe
运行 managed bootstrapper
运行 managed custom action
```

禁止生产 Bundle 包含：

```text
DotNetCoreSearch
NetFx prerequisite
dotnet-hosting
dotnet-runtime
DownloadUrl
RemotePayload
Web prerequisite
```

---

## 2.2 允许的 Build 依赖与 Client 依赖必须分离

### Build Runner 可以安装

```text
WiX Toolset
.NET SDK              # 仅 WiX/build tooling 如有需要
Python
PowerShell
Signing Tools
GitHub Actions Tooling
```

这些只能存在于：

```text
Developer Machine
CI Runner
Release Builder
```

不得因为 Build Tool 使用 .NET，就让 Endpoint 依赖 .NET。

### Windows Endpoint 只依赖

```text
Windows 10 / 11 x64
Windows Installer
Windows PowerShell 5.1
Windows Task Scheduler
Windows Crypto / Authenticode
OPSI Client Agent
```

Hermes 自身需要的：

```text
Python Runtime
Node Runtime
Hermes Runtime
```

必须属于 Hermes Release Payload，自包含部署，不使用系统 Python / Node。

---

# 3. v2.0.1 架构不变量

以下架构继续冻结。

## 3.1 Program Root

```text
D:\Programs\SMC\Hermes
```

目标结构：

```text
D:\Programs\SMC\Hermes\
├── bin\
├── runtime\
├── python\
├── node\
├── scripts\
├── manifest\
└── uninstall\
```

---

## 3.2 Machine HERMES_HOME

```text
C:\ProgramData\SMC\Hermes
```

结构：

```text
C:\ProgramData\SMC\Hermes\
├── config.yaml
├── .env
├── auth.json
├── skills\
├── sessions\
├── logs\
├── workspace\
└── state\
```

禁止 Managed Hermes 使用：

```text
%USERPROFILE%\.hermes
%LOCALAPPDATA%\hermes
C:\Windows\System32\config\systemprofile\.hermes
```

---

## 3.3 Endpoint Identity

唯一 Endpoint Identity：

```text
OPSI Client ID
```

不得新增：

```text
Hermes Client ID
Controller Client ID
Runtime Client ID
```

---

## 3.4 不增加客户端控制服务

禁止新增：

```text
smc-hermes-control.exe
Endpoint Controller Service
FastAPI Client Service
.NET Windows Service
SMC Gateway Service
```

Gateway 继续使用：

```text
Windows Scheduled Task
```

运行身份：

```text
SYSTEM
```

---

# 4. 当前源码与 v2.0.1 改造边界

当前已有核心代码继续复用：

```text
infra/windows/hermes-agent/
├── installer/
│   ├── Bundle.wxs
│   ├── InstallerCore.psm1
│   └── build.ps1
│
├── scripts/
│   ├── SmcHermesManaged.psm1
│   └── HostOperations.ps1
│
└── tests/
```

服务器：

```text
services/opsi-control/
├── src/api/v2/
├── src/services/v2/
├── src/workers/
│   ├── command_dispatcher.py
│   └── command_reconciler.py
└── tests/
```

Release：

```text
tools/release/client/build_client_release.py
scripts/build-client-release.ps1
release/client-release.yaml
.github/workflows/
```

v2.0.1 原则：

> **修复和补齐现有链路，不重新引入 Endpoint Controller、Runtime Service 或 Hermes OPSI Product Lifecycle。**

---

# 5. Production Installer 总体设计

## 5.1 最终发布文件

```text
smc-hermes-agent_<release>_windows-amd64.exe
```

例如：

```text
smc-hermes-agent_0.22.0-smc.1_windows-amd64.exe
```

必须是真实：

```text
Windows PE EXE
```

禁止：

```text
ZIP 文件改名为 .exe
```

---

# 6. Installer 技术选型

Production Installer 使用：

```text
WiX Burn Native Bootstrapper EXE
              ↓
       Embedded MSI
              ↓
Windows Installer Engine
              ↓
Windows PowerShell 5.1
              ↓
      InstallerCore.psm1
```

禁止结构：

```text
Burn
 ↓
.NET Bootstrapper Host
 ↓
PowerShell
```

也禁止：

```text
Custom .NET EXE
Custom .NET DLL Action
dotnet.exe
```

---

# 7. Installer 工程结构

调整为：

```text
infra/windows/hermes-agent/installer/
├── Bundle.wxs
├── Product.wxs
├── build.ps1
├── InstallerCore.psm1
├── bootstrap.ps1
│
├── payload/
│
└── tests/
    ├── Installer.Build.Tests.ps1
    ├── Installer.Install.Tests.ps1
    ├── Installer.Upgrade.Tests.ps1
    └── Installer.Repair.Tests.ps1
```

删除生产路径中的：

```text
SmcHermesInstallerHost.csproj
Program.cs
ManagedBootstrapperApplicationHost
```

如果代码中已因上一方案创建上述内容，应直接移除。

---

# 8. Bundle 职责

`Bundle.wxs` 只负责：

```text
EXE Packaging
Elevation
Command-line forwarding
Embedded MSI
Installer Exit Code
Bundle Logging
```

Bundle 不负责 Hermes 业务安装逻辑。

禁止：

```text
DownloadPrerequisite
RemotePayload
.NET Detection
.NET Runtime Chain
Internet Download
```

---

# 9. MSI 职责

`Product.wxs` 负责：

```text
Install Program Files
Install Runtime Payload
Install Scripts
Install Manifest
Register Uninstall Metadata
Invoke InstallerCore lifecycle
```

PowerShell 调用必须使用：

```text
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe
```

参数：

```text
-NoProfile
-NonInteractive
-ExecutionPolicy Bypass
```

不得调用：

```text
pwsh.exe
```

因为 PowerShell 7 不作为客户端依赖。

---

# 10. Hermes Release Payload

Production Installer 必须包含完整离线 Payload：

```text
hermes-windows-amd64.zip

release-manifest.json

scripts/
├── InstallerCore.psm1
├── SmcHermesManaged.psm1
├── HostOperations.ps1
├── ArtifactTransfer.psm1
├── GatewayOperations.psm1
└── Integrity.psm1
```

Hermes bundle 内部包含：

```text
Hermes CLI
Hermes Python Runtime
Hermes Node Runtime
Hermes dependencies
```

初次安装：

```text
无需 Internet
无需 pip
无需 npm
无需 Python 下载
无需 Node 下载
无需 .NET 下载
```

---

# 11. Release 信任模型

取消 Endpoint 对 Python Signature Verifier 的依赖。

当前类似：

```text
verify_release_v2.py
```

只能保留用于：

```text
Build
CI
Release Verification
```

不得作为 Endpoint 安装前置执行程序。

生产 Endpoint 信任链调整为：

```text
SMC Production EXE
        │
        ├── SHA256
        │
        └── Authenticode
                ↓
          Windows Trust
```

内部安装文件：

```text
release-manifest.json
        ↓
SHA256 Manifest
        ↓
installed file integrity
```

---

# 12. Installer Authenticode

Production：

```text
smc-hermes-agent_xxx.exe
```

必须签名。

验证：

```powershell
Get-AuthenticodeSignature $Installer
```

必须：

```text
Status = Valid
```

远程 Update 执行前必须再次验证。

签名异常：

```text
INSTALLER_SIGNATURE_INVALID
```

立即终止。

---

# 13. Installer Command Contract

支持：

```text
/install
/upgrade
/repair
/uninstall
/silent
/install-dir
/hermes-home
/repair-level
```

默认：

```text
/install-dir D:\Programs\SMC\Hermes

/hermes-home C:\ProgramData\SMC\Hermes
```

示例：

```powershell
.\smc-hermes-agent_0.22.0-smc.1_windows-amd64.exe `
  /install `
  /silent
```

Upgrade：

```powershell
.\smc-hermes-agent_0.22.1-smc.1_windows-amd64.exe `
  /upgrade `
  /silent
```

---

# 14. Fresh Install Transaction

必须按事务执行：

```text
Validate Environment
        ↓
Verify Installer
        ↓
Check Existing Installation
        ↓
Prepare Staging
        ↓
Extract Hermes Runtime
        ↓
Verify Release Manifest
        ↓
Install Program Tree
        ↓
Initialize Machine HERMES_HOME
        ↓
Apply ACL
        ↓
Set machine HERMES_HOME
        ↓
Create Gateway Scheduled Task
        ↓
hermes --version
        ↓
hermes config check
        ↓
Gateway Start
        ↓
Gateway Health
        ↓
Commit installer-state
        ↓
Commit control-owner
```

只有最终 Health PASS 后，安装状态才能变成：

```text
INSTALLED
```

---

# 15. Machine HERMES_HOME

继续复用现有：

```text
SmcHermesManaged.psm1
```

负责：

```text
Create directories
Set ACL
Set machine environment
Reject user profile path
Reject systemprofile
Reject UNC path
Reject wildcard path
```

ACL：

```text
SYSTEM
Administrators
```

禁止继承普通用户写权限。

---

# 16. Gateway Scheduled Task

Installer 创建：

```text
SMC Hermes Gateway
```

运行：

```text
SYSTEM
```

调用：

```text
D:\Programs\SMC\Hermes\bin\hermes.exe gateway run
```

环境：

```text
HERMES_HOME=C:\ProgramData\SMC\Hermes
```

不得创建：

```text
Windows Service
```

---

# 17. Upgrade Transaction

Remote/Local Upgrade 均进入同一 InstallerCore：

```text
Validate target version
        ↓
Backup Program Tree
        ↓
Stop Gateway
        ↓
Install New Runtime
        ↓
Verify Files
        ↓
Preserve HERMES_HOME
        ↓
Start Gateway
        ↓
hermes --version
        ↓
config check
        ↓
gateway health
```

成功：

```text
SUCCEEDED
```

失败：

```text
Restore Program Backup
        ↓
Restore Previous Scheduled Task
        ↓
Restart Previous Runtime
        ↓
Verify Previous Version
```

状态：

```text
FAILED_ROLLED_BACK
```

---

# 18. Upgrade 数据保护

Upgrade 不允许修改/删除：

```text
config.yaml
.env
auth.json
skills\
sessions\
logs\
workspace\
```

安装程序只管理：

```text
D:\Programs\SMC\Hermes
```

业务状态主要位于：

```text
C:\ProgramData\SMC\Hermes
```

---

# 19. Repair 模型

继续使用：

```text
L1 Gateway
L2 Config
L3 Doctor
L4 Runtime Integrity
L5 Installer Repair
```

具体：

| Level | 动作                                                 |
| ----- | -------------------------------------------------- |
| L1    | Gateway Restart + Health                           |
| L2    | `hermes config check` + Gateway Restart            |
| L3    | `hermes doctor`                                    |
| L4    | Release Manifest / File SHA256 / Runtime Integrity |
| L5    | 下载当前 Release Installer → `/repair /silent`         |

---

# 20. Uninstall

默认卸载：

```text
Remove:
D:\Programs\SMC\Hermes

Remove:
Gateway Scheduled Task

Remove:
machine HERMES_HOME environment variable

Remove:
installer-state

Remove:
control-owner
```

默认保留：

```text
C:\ProgramData\SMC\Hermes\
```

尤其：

```text
config
auth
skills
sessions
logs
workspace
```

防止卸载造成业务数据丢失。

---

# 21. Endpoint Operation 统一入口

继续使用：

```text
D:\Programs\SMC\Hermes\scripts\HostOperations.ps1
```

Operation 固定：

```text
STATUS
VERSION

GATEWAY_STATUS
GATEWAY_START
GATEWAY_STOP
GATEWAY_RESTART

CONFIG_CHECK
CONFIG_APPLY

DOCTOR

LIST_SESSIONS
COLLECT_LOGS
COLLECT_SESSIONS

UPDATE
REPAIR
```

禁止增加：

```text
SHELL
CMD
POWERSHELL
EXEC
RUN_SCRIPT
```

等通用执行 API。

---

# 22. HostControl 执行模式

Server：

```text
Action
 ↓
Command Dispatcher
 ↓
Fixed Template
 ↓
hostControlSafe_execute
```

Endpoint：

```text
opsiclientd
 ↓
HostOperations.ps1
```

例如：

```text
UPDATE
```

Server 不允许用户传：

```text
Executable Path
Shell Command
PowerShell Body
Download URL
Filesystem Target
```

Server 根据 Release Record 自动生成固定参数。

---

# 23. Artifact Service 工程闭环

当前 Artifact Metadata/Token 能力扩展为：

```text
Artifact Metadata
      +
Artifact Storage
      +
Upload
      +
Download
      +
Transfer Authorization
```

支持：

```text
config
release
installer
logs
sessions
diagnostic
```

---

# 24. Artifact Storage

新增：

```text
services/opsi-control/src/services/v2/artifact_storage.py
```

接口：

```python
put()
open_read()
exists()
stat()
delete()
```

首个实现：

```text
FilesystemArtifactStorage
```

默认：

```text
/data/smc-op-control/artifacts/
```

结构：

```text
artifacts/
├── config/
├── release/
├── installer/
├── logs/
├── sessions/
└── diagnostic/
```

DB 只保存 metadata，不保存 binary。

---

# 25. Artifact Transfer API

补齐：

```http
GET  /api/v2/opsi/artifacts/{artifactId}

POST /api/v2/opsi/artifacts/{artifactId}/token

GET  /api/v2/opsi/artifacts/{artifactId}/content

PUT  /api/v2/opsi/artifacts/{artifactId}/content
```

Token：

```json
{
  "artifactId": "art_xxx",
  "clientId": "pc01.example.com",
  "requestId": "req_xxx",
  "direction": "download",
  "maxBytes": 52428800,
  "exp": 1780000000,
  "jti": "..."
}
```

---

# 26. Artifact Token 约束

必须绑定：

```text
artifactId
clientId
requestId
direction
maxBytes
expiry
jti
```

要求：

```text
short-lived
one-time
fail closed
```

成功使用：

```text
jti = consumed
```

再次使用：

```text
403
TOKEN_REPLAY
```

---

# 27. Endpoint ArtifactTransfer.psm1

新增：

```text
ArtifactTransfer.psm1
```

职责：

```text
HTTPS Download
HTTPS Upload
SHA256
Size Limit
Temporary File
Cleanup
Transfer Token Redaction
```

使用 Windows PowerShell 原生：

```powershell
Invoke-WebRequest -OutFile ...
```

不得要求：

```text
curl package
Python requests
Node fetch
.NET SDK
第三方下载器
```

---

# 28. Config Apply

当前 Stub 必须实现完整事务：

```text
Resolve Config Revision
        ↓
Resolve Artifact
        ↓
Create Download Token
        ↓
HostControl
        ↓
Endpoint Download
        ↓
SHA256
        ↓
config.yaml.new
        ↓
Backup config.yaml
        ↓
Atomic Replace
        ↓
hermes config check
        ↓
Gateway Restart
        ↓
Health
```

失败：

```text
Restore config.yaml.bak
        ↓
Config Check
        ↓
Gateway Restart
```

---

# 29. Config 校验禁止新增 YAML Runtime

Endpoint 不安装：

```text
Python YAML
Node YAML
.NET YAML Library
```

配置语义校验统一调用：

```text
hermes config check
```

Hermes 自身作为 Config Validator。

---

# 30. Logs Collection

`COLLECT_LOGS`：

```text
C:\ProgramData\SMC\Hermes\logs
        ↓
Filter by time
        ↓
Explicit File Allowlist
        ↓
Temporary Staging
        ↓
Compress-Archive
        ↓
SHA256
        ↓
Artifact Upload
        ↓
Cleanup
```

默认：

```text
sinceHours = 24
maxBytes = 50 MiB
```

结果 stdout：

```json
{
  "artifactId": "log_xxx",
  "sha256": "...",
  "size": 1234567,
  "files": 8
}
```

禁止返回日志正文。

---

# 31. Session Operations

增加：

```text
LIST_SESSIONS
COLLECT_SESSIONS
```

LIST：

```text
metadata only
```

例如：

```json
{
  "sessionId": "...",
  "modifiedAt": "...",
  "size": 128320
}
```

COLLECT：

```text
selector
 ↓
staging
 ↓
Compress-Archive
 ↓
SHA256
 ↓
Artifact Upload
```

---

# 32. Session 审计

Session Collection 必须记录：

```text
operator
requestId
clientId
reason
selector
artifactId
timestamp
```

没有：

```text
operator
reason
```

拒绝执行：

```text
SESSION_REASON_REQUIRED
```

---

# 33. Remote Update

当前 `UPDATE` Stub 改成：

```text
releaseVersion
      ↓
Resolve HermesRelease
      ↓
liveEligible?
      ↓
Resolve Installer Artifact
      ↓
Create Download Token
      ↓
HostControl
      ↓
Download EXE
      ↓
SHA256
      ↓
Get-AuthenticodeSignature
      ↓
/upgrade /silent
      ↓
Version
      ↓
Config Check
      ↓
Gateway Health
      ↓
STATUS Reconcile
```

---

# 34. Remote Update 禁止模糊版本

只接受：

```text
0.22.1-smc.1
```

禁止：

```text
latest
stable
main
master
HEAD
*
```

Endpoint 不负责寻找“最新版本”。

---

# 35. Remote Installer 校验

执行前：

```powershell
Get-FileHash -Algorithm SHA256
```

必须等于 Release Record。

然后：

```powershell
Get-AuthenticodeSignature
```

必须：

```text
Valid
```

否则 Installer 不启动。

---

# 36. Remote Repair

`REPAIR` 真实调用：

```text
L1
→ GatewayOperations

L2
→ hermes config check

L3
→ hermes doctor

L4
→ Integrity.psm1

L5
→ Artifact Download
→ Installer /repair /silent
```

禁止继续：

```text
只返回 repairLevel
然后 status=success
```

---

# 37. Gateway Health

Gateway Health 不等于：

```text
Scheduled Task exists
```

必须组合：

```text
Scheduled Task
+
Hermes Gateway Process
+
TCP Port
+
Gateway HTTP/health probe
```

最终状态：

```text
RUNNING
STOPPED
DEGRADED
UNKNOWN
```

---

# 38. Snapshot Reconcile 修复

禁止现有逻辑：

```text
任意 Operation 成功
→ installed=true
```

Snapshot 必须来自权威 Probe。

更新规则：

| Operation      | 可直接更新                                |
| -------------- | ------------------------------------ |
| VERSION        | Hermes version                       |
| STATUS         | Hermes installed/health              |
| GATEWAY_STATUS | Gateway state                        |
| CONFIG_CHECK   | Config state                         |
| CONFIG_APPLY   | Mutation result，不直接推导完整 Hermes State |
| UPDATE         | Mutation result                      |
| REPAIR         | Mutation result                      |

---

# 39. Post-Mutation Probe

以下操作完成：

```text
CONFIG_APPLY
UPDATE
REPAIR
GATEWAY_RESTART
```

必须追加：

```text
STATUS
GATEWAY_STATUS
CONFIG_CHECK
```

只有 Probe 结果才能进入：

```text
client_snapshots
```

核心原则：

```text
Command Success
≠
Observed Endpoint State
```

---

# 40. Release Pipeline

正式 Pipeline：

```text
Hermes Source
      ↓
Hermes Windows Bundle
      ↓
Release Manifest
      ↓
Production MSI
      ↓
WiX Burn EXE
      ↓
Authenticode Sign
      ↓
Verify
      ↓
Publish Artifact
```

Hermes v2 Production 禁止：

```text
opsi-makepackage
smc-hermes-agent.opsi
ProductOnDepot
ProductProperty
ProductOnClient Action Lifecycle
```

---

# 41. Build Stage

`scripts/build-client-release.ps1` 调整：

```text
preflight
hermes
hermes-installer
verify
assemble
all
```

Legacy：

```text
runtime
opsi-stage
opsi-package
```

不得再进入默认：

```text
all
```

如果仍保留，必须显式：

```text
legacy mode
```

---

# 42. `release/client-release.yaml`

升级为 v2：

```yaml
schema: smc.client-release.v2

hermes:
  enabled: true

hermesInstaller:
  enabled: true
  platform: windows
  architecture: amd64
  type: wix-burn

legacyOpsiProduct:
  enabled: false
```

删除 Hermes Release SOT 对以下字段的依赖：

```text
productVersion
packageVersion
controllerRevision
```

---

# 43. Production Release Output

```text
dist/client-release/<release>/<buildId>/

├── hermes/
│   ├── hermes-windows-amd64.zip
│   └── release-manifest.json
│
├── installer/
│   ├── smc-hermes-agent_<release>_windows-amd64.exe
│   └── smc-hermes-agent-core_<release>_x64.msi
│
└── manifests/
    ├── client-release.json
    ├── SHA256SUMS
    ├── provenance.json
    └── sbom.cdx.json
```

MSI 可以作为内部/诊断 Artifact 保留。

生产分发对象：

```text
smc-hermes-agent_<release>_windows-amd64.exe
```

---

# 44. CI Engineering Gate

## Gate A — Python

必须真实执行：

```text
services/opsi-control tests
artifact tests
action tests
batch tests
reconcile tests
migration tests
```

禁止：

```bash
pytest ... || echo ok
```

---

## Gate B — PowerShell

Windows Runner：

```text
SmcHermesManaged.Tests.ps1
ArtifactTransfer.Tests.ps1
HostOperations.Tests.ps1
Integrity.Tests.ps1
InstallerCore.Tests.ps1
```

---

## Gate C — Production Installer Build

必须在 Windows Runner 生成：

```text
.exe
.msi
```

检查：

```text
PE MZ Header
MSI Valid
Bundle Valid
File Size
Embedded MSI
No RemotePayload
No DotNet Prerequisite
```

---

# 45. CI .NET Dependency Guard

新增专用测试：

```text
installer-no-dotnet-dependency
```

扫描：

```text
Bundle.wxs
Product.wxs
build.ps1
Generated Bundle metadata
```

禁止出现：

```text
DotNet
NetFx
dotnet-runtime
dotnet-hosting
Microsoft.NETCore
managedBootstrapperApplicationHost
RemotePayload
DownloadUrl
```

同时在隔离 Windows VM：

```text
无额外 .NET Runtime 安装动作
无网络
```

执行 Installer。

必须：

```text
PASS
```

---

# 46. Offline Installer Gate

CI / Manual Gate 必须验证：

```text
Internet = disabled
```

然后执行：

```text
Fresh Install
Repair
Uninstall
```

整个过程不得访问：

```text
dotnet.microsoft.com
aka.ms
download.visualstudio.microsoft.com
python.org
nodejs.org
github.com
```

初次安装仍必须成功。

---

# 47. Production Signature Gate

Release Artifact：

```text
Get-AuthenticodeSignature
```

必须：

```text
Valid
```

Smoke/Test：

```text
允许测试证书
liveEligible=false
```

Production：

```text
Production Certificate
liveEligible=true
```

---

# 48. OPSI Product Isolation Gate

自动扫描 v2 生产路径。

必须保证 Hermes v2 不执行：

```text
productPropertyState_updateObjects
productOnClient_updateObjects
productOnDepot_createObjects
```

也不得：

```text
opsi-makepackage
```

生成 Hermes v2 Release。

---

# 49. Repository 目标状态

```text
infra/windows/hermes-agent/
│
├── installer/
│   ├── Bundle.wxs
│   ├── Product.wxs
│   ├── build.ps1
│   ├── bootstrap.ps1
│   ├── InstallerCore.psm1
│   └── tests/
│
├── scripts/
│   ├── SmcHermesManaged.psm1
│   ├── HostOperations.ps1
│   ├── ArtifactTransfer.psm1
│   ├── GatewayOperations.psm1
│   └── Integrity.psm1
│
├── release/
├── schemas/
└── tests/
```

Server：

```text
services/opsi-control/src/
├── api/v2/
│   └── artifacts.py
│
├── services/v2/
│   ├── control.py
│   ├── artifact_storage.py
│   └── artifact_token.py
│
└── workers/
    ├── command_dispatcher.py
    └── command_reconciler.py
```

---

# 50. 实施阶段

## Phase 1 — Installer Production Closure

修改：

```text
Bundle.wxs
Product.wxs
build.ps1
InstallerCore.psm1
```

完成：

```text
Real EXE
Embedded MSI
No .NET Client Dependency
Offline Install
Upgrade
Repair
Uninstall
```

**Phase Gate：真实 Windows VM 安装成功。**

---

## Phase 2 — Artifact Transport

新增：

```text
ArtifactStorage
Artifact API
ArtifactTransfer.psm1
one-time token
```

完成：

```text
Server → Endpoint
Endpoint → Server
```

---

## Phase 3 — Endpoint Operations

完成：

```text
CONFIG_APPLY
COLLECT_LOGS
LIST_SESSIONS
COLLECT_SESSIONS
UPDATE
REPAIR
```

清除当前 Stub。

---

## Phase 4 — Reconcile

修复：

```text
command_reconciler.py
client snapshot
post-mutation probe
```

---

## Phase 5 — Release Pipeline

完成：

```text
hermes-installer stage
client-release.yaml v2
legacy OPSI exclusion
production signing
```

---

## Phase 6 — CI Closure

完成：

```text
fail-closed tests
Windows build runner
no-dotnet gate
offline gate
signature gate
product isolation gate
```

---

## Phase 7 — Live Verification

当前开发验证以少量真实 Windows Endpoint 完成，不以未来大规模设备数量作为本版本验收前提。

至少覆盖：

```text
Endpoint A
Endpoint B
Endpoint C
```

用于：

```text
正常
Offline
Injected Failure
```

三种状态验证。

---

# 51. Live Test Matrix

| Matrix | 场景                        | 结果             |
| ------ | ------------------------- | -------------- |
| M01    | 无网络 Fresh Install         | PASS           |
| M02    | Client 未安装额外 .NET Runtime | PASS           |
| M03    | SYSTEM Hermes CLI         | PASS           |
| M04    | Reboot Gateway            | PASS           |
| M05    | Config Apply              | PASS           |
| M06    | Invalid Config Rollback   | PASS           |
| M07    | Logs Upload               | PASS           |
| M08    | Session Upload            | PASS           |
| M09    | Remote Upgrade A → B      | PASS           |
| M10    | Corrupt Installer         | REJECT         |
| M11    | Invalid Authenticode      | REJECT         |
| M12    | Upgrade Runtime Failure   | ROLLBACK       |
| M13    | Repair L1-L5              | PASS           |
| M14    | Endpoint Offline          | WAITING_CLIENT |
| M15    | Endpoint Recovery         | SUCCEEDED      |
| M16    | Batch Partial Failure     | PASS           |
| M17    | No Product Lifecycle RPC  | PASS           |

---

# 52. Acceptance Criteria

## Installer

| ID     | 条件                            |
| ------ | ----------------------------- |
| AC-201 | 生成真实 Windows PE EXE           |
| AC-202 | EXE 内嵌 MSI                    |
| AC-203 | ZIP rename 方式完全删除             |
| AC-204 | 无客户端 .NET Runtime 依赖          |
| AC-205 | 无客户端 .NET SDK 依赖              |
| AC-206 | 无 managed bootstrapper        |
| AC-207 | 无 managed custom action       |
| AC-208 | 无 DotNet/NetFx prerequisite   |
| AC-209 | 无 Internet Fresh Install PASS |
| AC-210 | Windows 10 x64 PASS           |
| AC-211 | Windows 11 x64 PASS           |
| AC-212 | Fresh Install PASS            |
| AC-213 | Upgrade PASS                  |
| AC-214 | Repair PASS                   |
| AC-215 | Uninstall PASS                |
| AC-216 | Authenticode PASS             |

## Endpoint

| ID     | 条件                          |
| ------ | --------------------------- |
| AC-217 | Program Root 正确             |
| AC-218 | HERMES_HOME 正确              |
| AC-219 | SYSTEM CLI PASS             |
| AC-220 | systemprofile 无 `.hermes`   |
| AC-221 | Gateway Scheduled Task PASS |
| AC-222 | 无新增 SMC Windows Service     |

## Artifact

| ID     | 条件                         |
| ------ | -------------------------- |
| AC-223 | Artifact Download PASS     |
| AC-224 | Artifact Upload PASS       |
| AC-225 | SHA256 PASS                |
| AC-226 | Expired Token Reject       |
| AC-227 | Replay Reject              |
| AC-228 | Client ID mismatch Reject  |
| AC-229 | Request ID mismatch Reject |
| AC-230 | maxBytes Reject            |

## Operations

| ID     | 条件                           |
| ------ | ---------------------------- |
| AC-231 | Config Apply PASS            |
| AC-232 | Config Rollback PASS         |
| AC-233 | Logs Collect PASS            |
| AC-234 | List Sessions PASS           |
| AC-235 | Session Collect PASS         |
| AC-236 | Remote Update PASS           |
| AC-237 | Update Rollback PASS         |
| AC-238 | Repair L1-L5 PASS            |
| AC-239 | Gateway Health PASS          |
| AC-240 | Post-Mutation Reconcile PASS |

## OPSI / Control Plane

| ID     | 条件                                 |
| ------ | ---------------------------------- |
| AC-241 | Remote STATUS PASS                 |
| AC-242 | Remote VERSION PASS                |
| AC-243 | Offline Retry PASS                 |
| AC-244 | requestId Idempotency PASS         |
| AC-245 | Batch Partial Failure PASS         |
| AC-246 | 无任意 Shell API                      |
| AC-247 | 无 ProductProperty write            |
| AC-248 | 无 ProductOnClient Hermes lifecycle |

## Release

| ID     | 条件                                            |
| ------ | --------------------------------------------- |
| AC-249 | `hermes-installer` 为 Production Release Stage |
| AC-250 | Production Hermes 不生成 `.opsi`                 |
| AC-251 | CI Test Failure 必须导致 Workflow Failure         |
| AC-252 | Smoke Artifact 不得 Live Eligible               |
| AC-253 | Production EXE Authenticode Valid             |
| AC-254 | Installer No-.NET Gate PASS                   |

---

# 53. No-Go 条件

存在以下任一情况，v2.0.1 不允许进入 Production：

```text
安装时需要下载 .NET

客户端需要预安装 .NET Runtime

使用 dotnet.exe 启动 Installer

存在 .NET Bootstrapper Host

存在 .NET Custom Action

Production EXE 本质为 ZIP rename

Production Installer 需要 Internet

Hermes Runtime 需要在线 pip/npm 安装

Remote Update 未校验 SHA256

Remote Update 未校验 Authenticode

Config Apply 无 rollback

Update 无 rollback

Artifact Token 可重放

Session Collect 无审计

Mutation success 直接推导 installed=true

CI test failure 被吞掉

Hermes v2 Release 仍生成或依赖 .opsi
```

---

# 54. v2.0.1 Definition of Done

最终客户端：

```text
Windows Endpoint

├── Windows Native Capability
│   ├── Windows Installer
│   ├── Windows PowerShell 5.1
│   ├── Task Scheduler
│   └── Windows Trust / Authenticode
│
├── opsi-client-agent
│
└── SMC Hermes
    ├── Hermes CLI
    ├── Hermes Runtime
    ├── Embedded Python Runtime
    ├── Embedded Node Runtime
    └── Gateway
```

明确不存在：

```text
.NET Runtime dependency
.NET Desktop Runtime dependency
.NET SDK dependency
.NET Installer Host
SMC Controller Service
Client FastAPI
Hermes OPSI Product lifecycle
```

最终生产链：

```text
                       SMC Control Plane
                              │
                     services/opsi-control
                       │               │
               JSON-RPC               │ HTTPS
                       │               │
                       ▼               ▼
                   opsiconfd      Artifact Store
                       │               ▲
                 MessageBus             │
                       │               │
                       ▼               │
                  opsiclientd           │
                       │               │
                       ▼               │
             HostOperations.ps1 ───────┘
                 │          │
                 │          └── Production Installer
                 │
                 ▼
              Hermes CLI
                 │
                 ▼
       D:\Programs\SMC\Hermes
                 │
                 ▼
    C:\ProgramData\SMC\Hermes
```

**v2.0.1 的工程完成标准不是“Installer 能生成”，而是：一台未安装任何额外 .NET Runtime、无法访问互联网的 Windows 10/11 x64 终端，可以仅凭 `smc-hermes-agent_<release>_windows-amd64.exe` 完成 Hermes Fresh Install；随后由 OPSI MessageBus 完成 Config、Logs、Sessions、Update、Repair 的完整远程运维闭环。**

这应作为 `opsi/prd-2.0` 下一轮 Cursor 实施的正式工程基线。
