# PRD-OPSI-v2.0 — Managed Endpoint Architecture

**项目**：SMC Copilot
**版本**：2.0
**基线分支**：`opsi/prd-v2.0`
**客户端平台**：Windows 10 AMD64
**OPSI**：4.3.x
**架构模式**：Managed Endpoint
**范围**：Hermes Agent 安装、状态、配置、CLI、日志、Session、更新、修复
**排除范围**：`apps/work`

---

## 1. 产品目标

v2.0 将 Hermes Endpoint 管理从 OPSI Product 生命周期中解耦。

客户端只安装两个管理相关组件：

```text
Windows Endpoint
│
├── opsi-client-agent
│    └── opsiclientd
│
└── smc-hermes-agent.exe
     ├── Hermes Runtime
     ├── Hermes CLI
     ├── Hermes Gateway
     └── machine-managed HERMES_HOME
```

服务器负责：

```text
services/opsi-control
        ↓
opsiconfd JSON-RPC
        ↓
OPSI MessageBus
        ↓
opsiclientd
        ↓
PowerShell / Hermes CLI
```

v2.0 不再部署：

```text
smc-hermes-control.exe
Endpoint Controller Service
Client FastAPI Service
smc-hermes-agent.opsi
ProductPropertyState 生命周期
OPSI setup/update/custom Product Action
```

---

# 2. 当前架构问题

当前 `opsi/prd-v2.0` 已存在独立 `services/opsi-control`，其定位是服务器端 FastAPI Control Plane，只连接 `opsiconfd` JSON-RPC。该边界继续保留。

当前 Hermes 客户端部署则建立在：

```text
infra/opsi/products/smc-hermes-agent/
├── CLIENT_DATA
├── OPSI
├── bootstrap
├── controller
├── managed
├── packaging
└── scripts
```

之上。

`control.toml` 当前同时定义 Hermes Version、Client ID、request_id、Managed User、Config Payload、Controller Revision 等大量 Product Property。

`setup.opsiscript` 又要求 `request_id`、`client_id` 等参数才能执行。

服务器端 `action_dispatcher.py` 当前通过：

```text
ProductPropertyState
        ↓
ProductOnClient
        ↓
actionRequest
```

驱动 Hermes 操作。

v2.0 删除上述 Hermes Product Lifecycle。

---

# 3. v2.0 总体架构

```text
┌─────────────────────────────────────────────┐
│            SMC Management / Admin           │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│            services/opsi-control            │
│                                             │
│ Client │ Status │ Action │ Config │ Release │
│ Logs   │ Session│ Audit  │ Batch  │ Artifact│
└─────────────────────┬───────────────────────┘
                      │ HTTPS JSON-RPC
                      ▼
┌─────────────────────────────────────────────┐
│                  opsiconfd                  │
│                                             │
│ Client Identity / MessageBus / HostControl  │
└─────────────────────┬───────────────────────┘
                      │
                 OPSI MessageBus
                      │
                      ▼
┌─────────────────────────────────────────────┐
│              Windows 10 Endpoint            │
│                                             │
│  opsiclientd                                │
│      │                                      │
│      ├── PowerShell                         │
│      └── Hermes CLI                         │
│                                             │
│  D:\Programs\SMC\Hermes                     │
│  C:\ProgramData\SMC\Hermes                  │
└─────────────────────────────────────────────┘
```

---

# 4. 组件职责

| 组件                      | 职责                                      |
| ----------------------- | --------------------------------------- |
| `opsi-client-agent`     | Client 注册、在线状态、MessageBus、远程命令          |
| `smc-hermes-agent.exe`  | Hermes 安装、升级、修复、卸载                      |
| Hermes CLI              | Hermes 状态、Gateway、Doctor、Config 等操作     |
| PowerShell              | Windows 文件、压缩、下载、上传、Installer 调用        |
| `services/opsi-control` | Control Plane、任务、批量、审计、Artifact、Release |
| `opsiconfd`             | Endpoint 通讯与 HostControl                |

`services/opsi-control` 不部署到客户端。

---

# 5. Managed Endpoint 模型

每台终端只允许一个受管 Hermes 实例。

定义：

```text
Endpoint
    1
    │
    └── 1 Managed Hermes Instance
```

不支持：

```text
同一 Windows Endpoint
├── User A Hermes
├── User B Hermes
└── User C Hermes
```

v2.0 的 Hermes Runtime、Config、Session、Logs 统一属于 Endpoint，而不是某个 Windows Profile。

---

# 6. Windows 目录规范

## 6.1 Program

固定：

```text
D:\Programs\SMC\Hermes\
```

目录：

```text
D:\Programs\SMC\Hermes\
├── bin\
├── runtime\
├── python\
├── node\
├── manifest\
└── uninstall\
```

Hermes CLI：

```text
D:\Programs\SMC\Hermes\bin\hermes.exe
```

---

## 6.2 HERMES_HOME

固定：

```text
C:\ProgramData\SMC\Hermes
```

机器级环境变量：

```text
HERMES_HOME=C:\ProgramData\SMC\Hermes
```

目录：

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

禁止使用：

```text
%USERPROFILE%\.hermes
%LOCALAPPDATA%\hermes
C:\Windows\System32\config\systemprofile\.hermes
```

作为 SMC Managed Endpoint 的运行目录。

---

# 7. Hermes Windows Installer

发布产物：

```text
smc-hermes-agent_<release>_windows-amd64.exe
```

例如：

```text
smc-hermes-agent_0.22.0-smc.1_windows-amd64.exe
```

Installer 输入：

```text
hermes-windows-amd64.zip
release-manifest.json
release signature
installer bootstrap
```

---

## 7.1 Installer Command

必须支持：

```text
/install
/upgrade
/repair
/uninstall
/silent
/install-dir
/hermes-home
```

企业默认：

```text
/install-dir D:\Programs\SMC\Hermes

/hermes-home C:\ProgramData\SMC\Hermes
```

---

## 7.2 Installer 职责

Installer 负责：

```text
Hermes Runtime
Python Runtime
Node Runtime
Hermes CLI
machine HERMES_HOME
environment variables
Gateway Scheduled Task
release metadata
upgrade
repair
uninstall
```

OPSI 不参与 Hermes 安装内部实现。

---

# 8. Hermes Release 模型

取消：

```text
OPSI Product Version
OPSI Package Version
Controller Revision
Hermes Runtime Version
```

多重版本体系。

统一：

```text
Hermes Version
+
SMC Packaging Revision
```

例如：

```text
Upstream Hermes    0.22.0
SMC Revision       smc.1
Release            0.22.0-smc.1
```

Release Manifest：

```json
{
  "schema": "smc.hermes.release.v2",
  "releaseVersion": "0.22.0-smc.1",
  "hermesVersion": "0.22.0",
  "platform": "windows",
  "architecture": "amd64",
  "sha256": "...",
  "buildId": "...",
  "signerKeyId": "...",
  "signature": "..."
}
```

---

# 9. 初次安装流程

客户端实施人员执行：

```text
1. 安装 opsi-client-agent.exe
2. 注册 OPSI Client ID
3. 安装 smc-hermes-agent_<release>.exe
4. 验证 Hermes CLI
5. 验证 Gateway
```

安装后服务器即可：

```text
Client ID
   ↓
OPSI MessageBus
   ↓
Hermes CLI
```

进行持续管理。

初次安装不要求 OPSI Server 发布任何 `.opsi` Product。

---

# 10. `services/opsi-control` v2 职责

当前服务已有：

```text
API
DB
Action
Audit
OPSI JSON-RPC Integration
Worker
Client Inventory
```

这些基础模块保留。

v2.0 核心职责固定为：

```text
Client Inventory
Endpoint Reachability
Hermes Status
Remote Command
Config Management
Hermes Release
Remote Update
Remote Repair
Logs
Sessions
Artifact
Batch
Audit
```

---

# 11. OPSI Adapter v2

当前 `opsi_jsonrpc.py` 主要允许：

```text
productOnDepot_*
productOnClient_*
productPropertyState_*
```

等 Product Lifecycle RPC。

v2 改为：

```text
backend_info
host_getObjects
configState_getObjects

hostControlSafe_reachable
hostControlSafe_getActiveSessions
hostControlSafe_execute
hostControlSafe_opsiclientdRpc

group_getObjects
objectToGroup_getObjects

log_read
```

Hermes 管理链不再使用：

```text
productOnDepot_getObjects
productOnClient_updateObjects
productPropertyState_updateObjects
```

---

# 12. Client ID

OPSI Client ID 是 Endpoint 唯一管理 ID。

例如：

```text
itbjb0326.smart-core.com
```

服务器所有操作统一：

```text
clientId
    ↓
OPSI
    ↓
opsiclientd
```

不得再次维护：

```text
client_id ProductProperty
Hermes Client ID
Controller Client ID
```

三套身份。

---

# 13. Endpoint Status

API：

```http
GET /api/v2/opsi/clients/{clientId}/status
```

执行：

```text
hostControlSafe_reachable
        ↓
hostControlSafe_execute
        ↓
hermes --version
hermes status
hermes gateway status
```

结果：

```json
{
  "clientId": "itbjb0326.smart-core.com",
  "reachable": true,
  "hermes": {
    "installed": true,
    "releaseVersion": "0.22.0-smc.1",
    "version": "0.22.0",
    "configValid": true
  },
  "gateway": {
    "state": "running",
    "port": 8642
  }
}
```

---

# 14. Remote Command Model

不提供任意 Shell API。

API 只允许 Operation。

允许：

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

COLLECT_LOGS
COLLECT_SESSIONS

UPDATE
REPAIR
```

服务器固定映射：

```text
STATUS
    → hermes status

VERSION
    → hermes --version

GATEWAY_STATUS
    → hermes gateway status

DOCTOR
    → hermes doctor
```

禁止：

```text
POST /execute-shell
POST /powershell
POST /cmd
```

---

# 15. Action API

保留现有 Action 架构。

当前已经具备：

```text
request_id
payload_digest
ActionStatus
ActionTarget
Audit
```

v2：

```http
POST /api/v2/opsi/actions
GET  /api/v2/opsi/actions/{requestId}
GET  /api/v2/opsi/actions/{requestId}/results
```

请求：

```json
{
  "requestId": "req_xxx",
  "operation": "gateway-restart",
  "targets": [
    {
      "clientId": "itbjb0326.smart-core.com"
    }
  ]
}
```

---

# 16. Dispatcher v2

删除当前：

```text
Action
 ↓
ProductPropertyState
 ↓
actionRequest
```

模式。

新增：

```text
Action
 ↓
Client Validation
 ↓
Reachability
 ↓
Command Mapping
 ↓
hostControlSafe_execute
 ↓
opsiclientd
 ↓
Hermes CLI / PowerShell
 ↓
Result
```

新增：

```text
services/opsi-control/src/workers/
├── command_dispatcher.py
└── command_reconciler.py
```

---

# 17. Config 管理

取消：

```text
config_payload ProductProperty
config_digest ProductProperty
config_revision ProductProperty
```

新增 Server Config Store。

API：

```http
POST /api/v2/opsi/configs
GET  /api/v2/opsi/configs/{revision}
```

配置记录：

```json
{
  "revision": 12,
  "sha256": "...",
  "artifactId": "cfg_xxx"
}
```

---

## 17.1 Config Apply

服务器生成固定 PowerShell Command：

```text
Download config
    ↓
SHA256
    ↓
YAML validation
    ↓
backup config.yaml
    ↓
atomic replace
    ↓
hermes config check
    ↓
gateway restart
```

目标：

```text
C:\ProgramData\SMC\Hermes\config.yaml
```

失败：

```text
restore previous config
```

---

# 18. Artifact Service

大型文件不经过：

```text
OPSI stdout
ProductProperty
OPSI Log
```

传输。

Artifact 类型：

```text
config
release
logs
sessions
diagnostic
```

数据：

```json
{
  "artifactId": "art_xxx",
  "type": "logs",
  "requestId": "req_xxx",
  "clientId": "client.example.com",
  "sha256": "...",
  "size": 123456
}
```

传输：

```text
HTTPS
+
short-lived token
+
clientId binding
+
requestId binding
+
expiry
```

---

# 19. 日志采集

Command：

```text
COLLECT_LOGS
```

客户端执行：

```text
PowerShell
    ↓
C:\ProgramData\SMC\Hermes\logs
    ↓
Filter
    ↓
Compress-Archive
    ↓
SHA256
    ↓
Artifact Upload
```

参数：

```json
{
  "sinceHours": 24,
  "maxBytes": 52428800
}
```

OPSI 自身日志继续通过 OPSI 原生接口读取。

Hermes 日志由 SMC Artifact Service 管理。

---

# 20. Session 管理

Session：

```text
C:\ProgramData\SMC\Hermes\sessions
```

支持：

```text
LIST_SESSIONS
COLLECT_SESSION
COLLECT_SESSIONS
```

过滤：

```text
sessionId
timeRange
maxCount
maxBytes
```

完整 Session：

```text
ZIP
 ↓
Artifact API
```

禁止通过 Remote Command stdout 返回完整 Session。

必须审计：

```text
operator
requestId
clientId
reason
session selector
artifactId
timestamp
```

---

# 21. Gateway 管理

Gateway 不增加 Windows Service。

Installer 创建：

```text
Windows Scheduled Task
```

例如：

```text
SMC Hermes Gateway
```

使用统一：

```text
HERMES_HOME=C:\ProgramData\SMC\Hermes
```

管理操作：

```text
gateway-status
gateway-start
gateway-stop
gateway-restart
```

由 Hermes CLI 或 Scheduled Task 命令完成。

禁止增加：

```text
SMC Gateway Windows Service
SMC Controller Windows Service
```

---

# 22. Hermes Update

初次安装由实施人员完成。

后续更新：

```text
Publish Release
      ↓
Artifact Store
      ↓
UPDATE Action
      ↓
OPSI MessageBus
      ↓
PowerShell
      ↓
Download Installer
      ↓
SHA256 + Signature
      ↓
silent /upgrade
      ↓
hermes --version
      ↓
gateway status
```

例如：

```json
{
  "operation": "update",
  "payload": {
    "releaseVersion": "0.22.1-smc.1"
  }
}
```

禁止以：

```text
latest
main
master
```

作为生产升级目标。

---

# 23. Repair

Repair 分层：

```text
L1 Gateway restart

L2 hermes config check

L3 hermes doctor

L4 Runtime integrity check

L5 Download current release installer
   /repair /silent
```

Repair 不删除：

```text
config.yaml
auth
skills
sessions
logs
workspace
```

---

# 24. Offline Endpoint

检测：

```text
hostControlSafe_reachable = false
```

Action 状态：

```text
WAITING_CLIENT
```

Worker：

```text
retry
+
backoff
+
deadline
```

超过 deadline：

```text
UNKNOWN
errorCode = CLIENT_OFFLINE
```

不得第一次 Offline 即标记永久 FAILED。

---

# 25. Batch Management

支持：

```json
{
  "requestId": "req_batch_001",
  "operation": "status",
  "targets": [
    {"clientId": "client01.example.com"},
    {"clientId": "client02.example.com"},
    {"clientId": "client03.example.com"}
  ]
}
```

批量能力：

```text
concurrency limit
per-client result
partial failure
retry
deadline
cancel
aggregate status
audit
```

OPSI Group 只用于 Target Selection。

Hermes 本身不维护：

```text
testing
pilot
production
```

客户端 Property。

---

# 26. Client State

状态模型：

```text
OPSI
├── ONLINE
└── OFFLINE

Hermes
├── NOT_INSTALLED
├── INSTALLED
├── HEALTHY
├── WARNING
└── FAILED

Gateway
├── RUNNING
├── STOPPED
└── UNKNOWN

Config
├── CURRENT
├── OUTDATED
├── INVALID
└── UNKNOWN
```

不得再使用：

```text
ProductOnClient.installationStatus
```

表示 Hermes Health。

---

# 27. Security

生产环境必须：

```text
opsi-control → opsiconfd
    HTTPS

Endpoint Command
    allowlist only

Installer
    signature + SHA256

Artifact
    HTTPS

Config
    SHA256 + revision

Secrets
    redacted

Actions
    requestId audit
```

禁止客户端 Remote Execution API 接受：

```text
任意 shell
任意 PowerShell script
任意 executable path
任意 filesystem path
```

所有操作必须通过：

```text
Operation
    ↓
server-side command template
```

生成。

---

# 28. Repository 调整

## 保留

```text
services/opsi-control/
scripts/opsi-enroll-local-client.ps1
infra/opsi/server-related assets
```

---

## 新增

```text
infra/windows/hermes-agent/
├── installer/
├── release/
├── scripts/
├── schemas/
└── tests/
```

---

## 重构

```text
services/opsi-control/src/integrations/opsi_jsonrpc.py

services/opsi-control/src/services/control.py

services/opsi-control/src/schemas/models.py

services/opsi-control/src/workers/action_dispatcher.py
    →
command_dispatcher.py

services/opsi-control/src/workers/result_reconciler.py
    →
command_reconciler.py
```

---

## Legacy

当前：

```text
infra/opsi/products/smc-hermes-agent/
```

整体进入：

```text
legacy
```

不再用于 v2 Production Release。

迁移稳定前保留历史源码，不直接删除。

---

# 29. `rollout.py` 调整

当前 `services/opsi-control/src/services/rollout.py` 已承担较重的 OPSI Product Release/Rollout 逻辑。

v2 删除：

```text
ProductOnDepot
OPSI Package Rollout
Controller Revision Rollout
Product Property Rollout
```

保留并重构为：

```text
Release Target Selection
Batch Action
Concurrency
Failure Threshold
Pause
Cancel
Aggregate Result
```

---

# 30. API v2

新增：

```text
/api/v2/opsi
```

主要 API：

```text
GET  /clients
GET  /clients/{clientId}
GET  /clients/{clientId}/status

POST /actions
GET  /actions/{requestId}
GET  /actions/{requestId}/results

POST /configs
GET  /configs/{revision}

POST /releases
GET  /releases
GET  /releases/{version}

GET  /artifacts/{artifactId}
```

v1 API 保留一个迁移周期。

---

# 31. 数据库

保留：

```text
actions
action_targets
action_results
audit
client_inventory
policies
```

新增：

```text
hermes_releases
config_artifacts
artifacts
client_snapshots
```

逐步废弃：

```text
product_releases
controller_evidence
OPSI Product rollout state
```

第一阶段不得直接 DROP 历史表。

---

# 32. Build Pipeline

目标：

```text
Hermes Source
    ↓
hermes-windows-amd64.zip
    ↓
SMC Release Manifest
    ↓
Sign
    ↓
Windows Installer
    ↓
Smoke Test
    ↓
Release Artifact
```

脚本：

```text
scripts/build-client-release.ps1
```

新增 Stage：

```text
hermes-installer
```

取消 Hermes Release 对：

```text
opsi-makepackage
control.toml
ProductOnDepot
ProductProperty
```

的依赖。

---

# 33. Migration

## Phase 1 — OPSI HostControl

完成：

```text
reachable
activeSessions
execute
```

验收：

```text
通过 Client ID 执行 hermes --version
```

---

## Phase 2 — Managed HERMES_HOME

完成：

```text
C:\ProgramData\SMC\Hermes
```

验证：

```text
SYSTEM Context 执行 Hermes CLI
不产生 systemprofile Hermes Home
```

---

## Phase 3 — Windows Installer

完成：

```text
Fresh Install
Upgrade
Repair
Uninstall
```

---

## Phase 4 — API v2

完成：

```text
status
gateway
doctor
config
```

---

## Phase 5 — Artifact

完成：

```text
logs
sessions
config
release
```

---

## Phase 6 — Batch

完成：

```text
batch update
batch status
retry
partial failure
```

---

## Phase 7 — Legacy Freeze

停止：

```text
smc-hermes-agent.opsi
ProductProperty Dispatcher
ProductOnClient Hermes Lifecycle
```

---

# 34. 验收标准

| ID    | 验收项                                       |
| ----- | ----------------------------------------- |
| AC-01 | Client 仅需 OPSI Client + Hermes Installer  |
| AC-02 | 无 `smc-hermes-control.exe`                |
| AC-03 | 无额外 SMC Windows Service                   |
| AC-04 | Hermes 安装目录为 `D:\Programs\SMC\Hermes`     |
| AC-05 | HERMES_HOME 为 `C:\ProgramData\SMC\Hermes` |
| AC-06 | SYSTEM Context 可执行 Hermes CLI             |
| AC-07 | 不创建 systemprofile `.hermes`               |
| AC-08 | Client ID 唯一标识 Endpoint                   |
| AC-09 | Reachable PASS                            |
| AC-10 | Remote `hermes --version` PASS            |
| AC-11 | Remote `hermes status` PASS               |
| AC-12 | Gateway Status PASS                       |
| AC-13 | Gateway Restart PASS                      |
| AC-14 | Config Apply PASS                         |
| AC-15 | Config Failure Rollback PASS              |
| AC-16 | Doctor PASS                               |
| AC-17 | Logs Collect PASS                         |
| AC-18 | Session Collect PASS                      |
| AC-19 | Artifact Upload PASS                      |
| AC-20 | Remote Upgrade PASS                       |
| AC-21 | Remote Repair PASS                        |
| AC-22 | Offline Retry PASS                        |
| AC-23 | requestId 幂等 PASS                         |
| AC-24 | Batch Partial Failure PASS                |
| AC-25 | v2 不调用 ProductPropertyState               |
| AC-26 | v2 不调用 ProductOnClient Update             |
| AC-27 | Hermes Release 不生成 `.opsi`                |
| AC-28 | `apps/work` 无任何 OPSI 改动                   |

---

# 35. Definition of Done

```text
Endpoint
    =
OPSI Client Agent
+
SMC Hermes Agent

Hermes Instance
    =
1 Endpoint : 1 Managed Instance

Program
    =
D:\Programs\SMC\Hermes

HERMES_HOME
    =
C:\ProgramData\SMC\Hermes

Identity
    =
OPSI Client ID

Transport
    =
OPSI MessageBus

Execution
    =
Hermes CLI + PowerShell

Installation
    =
Windows Installer

Configuration
    =
Config Artifact

Logs / Sessions
    =
Artifact Service

Update / Repair
    =
Remote Installer Operation

Control Plane
    =
services/opsi-control

OPSI Product Lifecycle
    =
Not used for Hermes

Additional Client Agent
    =
None
```

**PRD-OPSI-v2.0 最终客户端边界：只保留 `opsi-client-agent` 与 `smc-hermes-agent.exe` 两个安装对象；持续运维通过 OPSI Client ID、MessageBus、Hermes CLI 和 Windows 原生命令完成。**
