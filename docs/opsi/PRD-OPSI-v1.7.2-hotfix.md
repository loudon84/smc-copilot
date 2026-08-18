# PRD-OPSI-v1.7.2 Hotfix — Hermes Endpoint Native Deployment Model

**项目**：SMC Copilot / OPSI Endpoint Management
**版本**：PRD v1.7.2 Hotfix
**适用分支**：`opsi/prd-v1.0`
**客户端**：Windows 10 AMD64
**OPSI Server**：4.3.x
**目标 Product**：`smc-hermes-agent`
**目标 Package**：`smc-hermes-agent_1.7.2-2.opsi`

---

## 1. Hotfix 目标

修正 v1.7.1～v1.7.2-1 中 OPSI Product 模型与客户端生命周期设计，使 `smc-hermes-agent` 按 OPSI 4.3 原生方式完成：

```text
Build
  ↓
Package
  ↓
Depot Publish
  ↓
Client Group
  ↓
actionRequest=setup
  ↓
opsiclientd
  ↓
Machine Runtime Reconcile
  ↓
ProductOnClient=installed
```

正常安装、升级不得要求管理员预先逐客户端写入：

```text
request_id
client_id
hermes_version
controller_revision
managed_user_sid
config_payload
config_digest
```

OPSI Product Property 仅承担可配置安装策略；客户端身份、发布版本、执行 ID、Artifact 元数据和动态配置不得混入 Product Property。OPSI 官方将 Product Property 定义为产品配置项，客户端/Depot 的实际值存储于 `ProductPropertyState`。

---

# 2. 版本定义

当前已存在：

```text
smc-hermes-agent_1.7.2-1.opsi
```

本 Hotfix 保持 Product Version：

```text
Product Version = 1.7.2
```

Package Version 升级：

```text
Package Version = 2
```

最终：

```text
smc-hermes-agent_1.7.2-2.opsi
```

原因：OPSI 的 Package Version 用于区分相同 Product Version 下脚本、Property 和 Package 实现修订。

Controller 因执行契约发生变化：

```text
Controller Revision
2 → 3
```

Hermes Runtime Artifact 不重新构建，继续使用已经完成的：

```text
hermes-windows-amd64.zip
```

Hermes 实际版本直接读取 Package 内 signed runtime manifest。

---

# 3. Product 数据模型

## 3.1 Package-owned Metadata

以下信息属于 `.opsi` Release，不允许通过 Product Property 修改：

```text
product_id
product_version
package_version
controller_revision
hermes_version
platform
architecture
artifact_sha256
controller_sha256
release_signature
runtime_signature
```

统一写入 Package Release Manifest：

```json
{
  "productId": "smc-hermes-agent",
  "productVersion": "1.7.2",
  "packageVersion": "2",
  "controllerRevision": 3,
  "hermesVersion": "<runtime-build.json version>",
  "platform": "windows",
  "architecture": "amd64"
}
```

Package Manifest、Runtime Manifest 和对应签名构成客户端安装的 Release SOT。

---

## 3.2 Product Property

保留：

| Property                    |   Default | 用途                    |
| --------------------------- | --------: | --------------------- |
| `gateway_autostart`         |    `true` | Gateway 登录后自动启动       |
| `gateway_port`              |    `8642` | Gateway 监听端口          |
| `managed_profile`           | `default` | Hermes Profile        |
| `diagnostics_enabled`       |    `true` | 诊断能力                  |
| `diagnostic_log_lines`      |     `500` | 日志采集上限                |
| `auto_repair_level`         |       `1` | 自动修复等级                |
| `managed_user_binding_mode` |    `auto` | 用户绑定策略                |
| `managed_user_account`      |      `""` | `fixed` 模式可选指定账号      |
| `custom_operation`          |  `status` | 仅供 `custom` action 使用 |

OPSI Product Property 用于运行时安装选项，并由 `GetProductProperty()` 在 opsi-script 中读取。

---

## 3.3 删除 Product Property

删除：

```text
request_id
client_id
hermes_version
release_channel
config_revision
managed_user_sid
config_digest
config_payload
controller_revision
```

### 删除原因

`request_id`

```text
执行上下文
≠
持久安装配置
```

`client_id`

直接从 OPSI Service Context 获取。

`hermes_version / controller_revision`

属于 Package Artifact。

`release_channel`

发布分批使用 OPSI Client Group 管理。

`managed_user_sid`

在 Windows 客户端根据账户解析。

`config_payload / config_digest / config_revision`

属于动态配置管理，不作为 Product Property 数据传输协议。

---

# 4. Client Identity

禁止：

```text
Server
  ↓
ProductPropertyState.client_id
  ↓
Client
```

客户端 ID 使用：

```text
%HostID%
```

OPSI Service Context 下 `%HostID%` 提供 OPSI Client FQDN；OPSI 官方同时提供 `%opsiserviceUser%` 作为 Service Context 身份。

Controller 接收：

```text
client_id = OPSI Client Context
```

不得要求 `client_id` Product Property。

---

# 5. Execution ID

原逻辑：

```text
request_id missing
    ↓
setup FAILED
```

删除。

新逻辑：

```text
External request_id 存在
    ↓
沿用 external request_id

External request_id 不存在
    ↓
Controller 自动生成 execution_id
```

格式：

```text
exec_<client>_<utc_timestamp>_<random>
```

用途：

```text
transaction correlation
log correlation
diagnostic correlation
result correlation
```

`execution_id` 不参与 OPSI Product 是否允许安装的判断。

---

# 6. Hermes Version Resolution

禁止：

```text
GetProductProperty("hermes_version")
```

新流程：

```text
CLIENT_DATA/artifacts/
      ↓
runtime-build.json
      ↓
signature verification
      ↓
hermesVersion
```

安装目标：

```text
desired_runtime_version =
verified runtime-build.json.version
```

因此：

```text
一个 .opsi
=
一个确定的 Hermes Runtime Release
```

Depot Property 的默认值在后续 Package 更新时默认会保留，因此 Release Version 不能依赖 Property Default 更新。

---

# 7. Controller Revision Resolution

禁止：

```text
GetProductProperty("controller_revision")
```

改为：

```text
release-manifest.json
    ↓
controllerRevision
```

Controller Bundle：

```text
controller/
  revision = 3
```

必须满足：

```text
Manifest Revision
=
Controller Bundle Revision
```

不一致直接：

```text
RELEASE_METADATA_INVALID
```

---

# 8. Setup Action 模型

`setup` 成为唯一的 Machine Runtime converge action。

```text
actionRequest=setup
        ↓
verify package
        ↓
inspect current state
        ↓
reconcile
```

Controller 根据当前状态自行判断：

```text
未安装
    → INSTALL

已安装旧 Runtime
    → UPGRADE

版本相同
    → VERIFY / REPAIR

Active Pointer 损坏
    → REPAIR

新版本激活失败
    → LOCAL ROLLBACK
```

因此：

```text
setup
=
install + upgrade + repair + reconcile
```

必须保证幂等。

---

# 9. updateScript

`control.toml`：

```toml
updateScript = ""
```

不再注册 `update.opsiscript` 为 OPSI Product Update Script。

原因：OPSI 在执行 `setupScript` 后，如果 Product 定义了 `updateScript`，会自动继续执行该 Update Script。

原结构：

```text
setup
 ↓
setup.opsiscript
 ↓
update.opsiscript
```

可能造成重复生命周期执行。

新结构：

```text
setup
 ↓
setup.opsiscript
 ↓
Controller reconcile
```

---

# 10. Product Action 定义

## setup

用途：

```text
Fresh Install
Upgrade
Repair
Reconcile
```

成功：

```text
installationStatus = installed
actionResult       = successful
actionRequest      = none
```

---

## uninstall

负责：

```text
停止 Gateway
注销 SMC Scheduled Tasks
删除 Machine Runtime Active Pointer
卸载 Managed Runtime
删除 Controller Machine State
```

用户数据是否删除保持现有 uninstall policy，不在 Hotfix 中改变。

成功：

```text
installationStatus = not_installed
```

---

## custom

仅用于管理动作：

```text
status
collect-log
diagnose
repair
restart-gateway
```

`custom_operation` 仅在：

```text
actionRequest=custom
```

时读取。

不得影响：

```text
setup
uninstall
```

---

# 11. Machine Runtime 与 User Runtime 解耦

OPSI Product 安装成功条件定义为：

```text
Controller installed
+
Hermes Machine Runtime installed
+
Runtime verification passed
+
Active Pointer valid
+
User Bootstrap registered
```

不要求当前存在交互用户。

---

## 11.1 Machine State

```text
NOT_INSTALLED
    ↓
STAGING
    ↓
VERIFYING
    ↓
ACTIVATING
    ↓
INSTALLED
```

失败状态：

```text
PACKAGE_INVALID
SIGNATURE_INVALID
PREREQUISITE_MISSING
RUNTIME_INSTALL_FAILED
ACTIVATION_FAILED
ROLLBACK_FAILED
```

这些状态允许导致 OPSI setup FAILED。

---

## 11.2 User State

独立：

```text
USER_UNBOUND
    ↓
USER_CONTEXT_PENDING
    ↓
USER_CONTEXT_READY
    ↓
GATEWAY_HEALTHY
```

以下状态不得导致 Machine setup FAILED：

```text
USER_UNBOUND
USER_CONTEXT_PENDING
Gateway 当前未启动
用户当前未登录
```

因此：

```text
ProductOnClient=installed
```

表示：

```text
Machine Product Installed
```

不表示：

```text
Gateway Healthy
```

---

# 12. Managed User Binding

增加：

```text
managed_user_binding_mode
```

取值：

```text
auto
fixed
disabled
```

默认：

```text
auto
```

---

## auto

Machine setup：

```text
安装 Runtime
注册 User Bootstrap
返回 installed
```

用户登录后：

```text
获取 LoggedInUser
        ↓
解析 SID
        ↓
绑定 Managed User
        ↓
初始化 Hermes User Context
        ↓
启动 Gateway
```

OPSI script 在 Windows 提供 `GetLoggedInUser` 和 `GetUserSID()` 等用户上下文能力。

---

## fixed

读取：

```text
managed_user_account
```

例如：

```text
SMART-CORE\user01
```

Controller 本地解析 SID。

禁止服务器要求管理员填写：

```text
managed_user_sid
```

如果指定账户当前不存在：

```text
Machine Setup = SUCCESS
User State    = USER_CONTEXT_PENDING
```

---

## disabled

仅安装 Machine Runtime：

```text
Gateway User Bootstrap Disabled
```

适用于服务器验证、安装测试和特殊终端。

---

# 13. Dynamic Configuration

以下内容不得通过 Product Property 传输：

```text
config_payload
config_digest
large JSON/base64 configuration
task command
one-shot request context
```

职责拆分：

```text
OPSI Product Property
    → 稳定安装策略

Package Manifest
    → Release Metadata

Controller Command
    → 动态任务

Managed Config
    → Signed Config Artifact / Management API
```

v1.7.2 Hotfix 保留现有：

```text
commands/
results/
transactions/
```

Machine SOT 目录模型。

动态配置能力不得阻塞 `setup`。

---

# 14. OPSI control.toml

目标：

```toml
[Package]
version = "2"
depends = []

[Product]
type = "localboot"
id = "smc-hermes-agent"
name = "SMC Hermes Agent"
version = "1.7.2"
priority = 0
licenseRequired = false

setupScript = "setup.opsiscript"
uninstallScript = "uninstall.opsiscript"
updateScript = ""
alwaysScript = ""
onceScript = ""
customScript = "custom.opsiscript"
userLoginScript = ""

windowsSoftwareIds = []
```

Product Property 必须使用 OPSI 4.3：

```toml
[[ProductProperty]]
type = "unicode"
name = "gateway_port"
...
```

`control.toml` 是 OPSI 4.3 Product Control Source。

---

# 15. Windows 10 Runtime Prerequisite

当前 Hermes Artifact 继续使用现有 Windows Runtime Profile：

```text
Windows AMD64
Python >=3.12,<3.13
Node >=22,<23
```

原 v1.7.1 已按该 Runtime Profile 构建 Hermes Bundle。

v1.7.2 不重新构建 Hermes Artifact。

setup 必须执行 Preflight：

```text
Windows_NT
AMD64
Python 3.12.x
Node 22.x
required disk space
artifact readable
```

缺失返回：

```text
PREREQUISITE_MISSING:<component>
```

不得返回模糊安装失败。

Python/Node 后续是否拆为独立 OPSI Product Dependency，不纳入本 Hotfix。

---

# 16. Release Builder

`packaging/makepackage.py` 必须完成：

```text
Hermes Artifact
      ↓
Read runtime-build.json
      ↓
Resolve exact Hermes Version
      ↓
Build Controller Revision 3
      ↓
Build Release Manifest
      ↓
Sign Runtime
      ↓
Sign Controller
      ↓
Sign Release Manifest
      ↓
Generate Product Stage
      ↓
Schema Precheck
      ↓
opsi-makepackage
      ↓
Native .opsi
      ↓
opsi-cli package extract
      ↓
Read-back
```

---

# 17. Schema Gate

native build 前必须校验：

```text
Package.version = 2
Product.version = 1.7.2
Product.id = smc-hermes-agent
Product.type = localboot
updateScript = ""
```

拒绝：

```text
Product.productVersion
Product.packageVersion
ProductProperty.unicode.*
ProductProperty.bool.*
```

Native `opsi-makepackage` 仍为最终 Product Schema Gate。

---

# 18. Release Artifact

产物：

```text
smc-hermes-agent_1.7.2-2.opsi
smc-hermes-agent_1.7.2-2.opsi.sha256
```

Read-back 必须确认：

```text
OPSI/control.toml
CLIENT_DATA/
Release Manifest
Controller Bundle
Hermes Runtime
Signatures
```

---

# 19. Depot Publish

统一采用 OPSI 4.3 service-side tooling：

```text
opsi-cli
```

或兼容：

```text
opsi-package-manager
```

OPSI 4.3 官方同时支持两者进行 Package 安装；新的自动化流程优先使用 `opsi-cli package install`。

发布后必须确认：

```text
ProductOnDepot

productId      = smc-hermes-agent
productVersion = 1.7.2
packageVersion = 2
```

---

# 20. Product Property Default 管理

禁止假设：

```text
安装新 .opsi
    =
Depot Property Default 自动更新
```

OPSI 在新 Package 安装后默认保留 Depot 已有 Product Property State。

因此：

```text
Release Version
Controller Version
Hermes Version
```

全部不得依赖 Product Property Default。

真正需要变更策略默认值时：

```text
显式修改 Depot Default Property
```

而不是依赖 `.opsi` 覆盖。

---

# 21. Client Group 发布

定义发布组：

```text
smc-hermes-lab
smc-hermes-pilot
smc-hermes-production
```

Group 仅负责：

```text
Release Rollout Scope
```

不得使用：

```text
release_channel Product Property
```

OPSI 4.3 Client 可以属于多个 Group，并支持按照 Client Group 设置 Product Action。

---

# 22. Fresh Install

正常流程：

```text
Product Published
      ↓
Client 属于目标 Group
      ↓
actionRequest=setup
      ↓
opsiclientd
      ↓
setup.opsiscript
      ↓
Controller reconcile
      ↓
Machine Runtime installed
      ↓
ProductOnClient=installed
```

不得存在：

```text
逐客户端 ProductPropertyState 初始化
```

默认 Client 的：

```text
productPropertyState_getObjects = []
```

也必须能够正常安装。

---

# 23. Upgrade

发布新 Product/Package 后：

```text
ProductOnDepot > ProductOnClient
```

使用 OPSI 原生 outdated 模型：

```bash
opsi-cli client-action set-action-request \
  --where-outdated \
  --products smc-hermes-agent
```

或者指定 Group。

OPSI 4.3 `client-action set-action-request --where-outdated` 与 `opsi-outdated-to-setup` 均用于把 Depot 上存在较新版本的 Localboot Product 设置为 `setup`。

不使用：

```text
actionRequest=update
```

作为 Hermes 常规版本升级机制。

---

# 24. Failed Retry

对于：

```text
actionResult=failed
```

修复问题后：

```bash
opsi-cli client-action set-action-request \
  --where-failed \
  --products smc-hermes-agent
```

或者：

```text
--where-outdated --where-failed
```

OPSI 4.3 原生支持该筛选。

---

# 25. Rollout Policy

发布顺序：

```text
Package Build
    ↓
Depot
    ↓
Lab
    ↓
Pilot
    ↓
Production
```

每阶段只执行：

```text
set actionRequest=setup
```

客户端执行使用：

```text
on_demand
```

或现有 Client Agent 周期事件。

OPSI 4.3 支持 Client Group action 以及按事件限制 Product Group。

---

# 26. Product Health 模型

OPSI 状态：

```text
ProductOnClient
```

负责：

```text
installed
not_installed
failed
```

SMC Controller 状态：

```text
MACHINE_READY
USER_CONTEXT_PENDING
USER_CONTEXT_READY
GATEWAY_HEALTHY
GATEWAY_UNHEALTHY
```

禁止：

```text
Gateway 未启动
→ ProductOnClient failed
```

只有 Machine Product 本身安装失败才：

```text
actionResult = failed
```

---

# 27. 需要修改的代码范围

```text
infra/opsi/products/smc-hermes-agent/
```

重点：

```text
OPSI/control.toml

CLIENT_DATA/setup.opsiscript
CLIENT_DATA/update.opsiscript
CLIENT_DATA/uninstall.opsiscript
CLIENT_DATA/custom.opsiscript

Controller invocation / lifecycle scripts

packaging/makepackage.py

Release Manifest builder
Release validation
Read-back validation

Unit tests
Native integration tests
```

---

# 28. 必须删除的逻辑

搜索并删除 setup/update 中：

```text
missing request_id → fatal

missing client_id → fatal

missing managed_user_sid → fatal

missing managed_user_account → fatal

hermes_version from ProductProperty

controller_revision from ProductProperty

release_channel resolving Hermes Runtime
```

同时删除：

```text
setup → updateScript 自动双执行
```

---

# 29. 必须新增的逻辑

```text
client_id ← OPSI Context

execution_id ← Controller generate

hermes_version ← signed runtime manifest

controller_revision ← signed release manifest

managed_user ← delayed binding

setup ← idempotent reconcile

Machine Install ←→ User Runtime State 分离
```

---

# 30. Functional Acceptance

## AC-01 无 Client Property 安装

客户端：

```text
productPropertyState_getObjects = []
```

执行：

```text
actionRequest=setup
```

必须：

```text
Machine Runtime installed
ProductOnClient=installed
```

---

## AC-02 request_id

没有：

```text
request_id
```

不得失败。

Controller 自动生成 execution ID。

---

## AC-03 client_id

没有：

```text
client_id ProductProperty
```

必须从 OPSI Context 获取正确 FQDN。

---

## AC-04 Managed User

没有用户登录：

```text
Machine Install = PASS
ProductOnClient = installed
User State = USER_CONTEXT_PENDING
```

---

## AC-05 Hermes Version

修改 Depot：

```text
hermes_version Property
```

不得改变实际安装 Hermes Version。

安装版本必须与 Package Manifest 完全一致。

---

## AC-06 Controller Revision

客户端 Controller Revision：

```text
3
```

必须来源于 Release Manifest。

---

## AC-07 setup 幂等

同一 Package 连续执行两次：

```text
setup
setup
```

第二次不得重复破坏 Runtime，不得创建错误版本，不得改变正确 Active Pointer。

---

## AC-08 Upgrade

旧 Package：

```text
1.7.1-x
```

升级：

```text
1.7.2-2
```

只通过：

```text
actionRequest=setup
```

完成。

---

## AC-09 updateScript

最终 Product 定义：

```text
updateScript = ""
```

---

## AC-10 Batch

同一 Client Group 下多个客户端：

```text
无逐机 Property 初始化
```

一次 Group Action 可以完成：

```text
setup
```

---

# 31. Release Acceptance

必须全部 PASS：

| Gate                        | 结果            |
| --------------------------- | ------------- |
| OPSI 4.3 control.toml       | PASS          |
| Product Version             | `1.7.2`       |
| Package Version             | `2`           |
| Controller Revision         | `3`           |
| Hermes Bundle               | 原已构建 Artifact |
| Native opsi-makepackage     | PASS          |
| Native package extract      | PASS          |
| Signature Read-back         | PASS          |
| ProductOnDepot              | `1.7.2-2`     |
| Empty Client Property Setup | PASS          |
| Fresh Install               | PASS          |
| Idempotent Setup            | PASS          |
| Upgrade via Setup           | PASS          |
| Managed User Pending        | PASS          |
| User Bootstrap              | PASS          |
| Gateway Health              | 独立状态          |
| Group Deployment            | PASS          |

---

# 32. Definition of Done

v1.7.2 Hotfix 完成条件：

```text
OPSI Package
    不依赖逐客户端初始化
        +
setup
    同时支持 install / upgrade / repair
        +
Hermes Version
    来自 signed Package Manifest
        +
Controller Revision
    来自 signed Release Manifest
        +
Client Identity
    来自 OPSI Context
        +
Managed User
    与 Machine Installation 解耦
        +
ProductOnClient
    与 Gateway Health 解耦
        +
Client Group
    可直接批量下发 setup
```

最终发布对象：

```text
smc-hermes-agent_1.7.2-2.opsi
```
