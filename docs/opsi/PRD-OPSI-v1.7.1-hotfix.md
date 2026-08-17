# SMC Copilot OPSI v1.7.1 Deployment Closure PRD

**Release Builder Closure → Real OPSI Server → Clean Windows Client Live Validation**

* PRD 版本：`v1.7.1 Deployment Closure`
* 基线分支：`opsi/prd-v1.0`
* OPSI Product：`smc-hermes-agent`
* Product Version：`1.7.1`
* Package Version：`1`
* Controller Revision：`2`
* Runtime Profile：`smc-managed`
* 当前目标平台：`Windows x64`
* 部署验证范围：`1 台 Real OPSI Server + 1 台 Clean Windows Client`
* 最终目标：`Deployment Ready`

---

# 1. 产品目标

完成从 Hermes 源码到真实 Windows 客户端运行的完整发布部署链：

```text
Local hermes-agent Git
        ↓
Hermes Release Builder
        ↓
Managed Offline Bundle
        ↓
Runtime Artifact v3
        ↓
Controller Bundle
        ↓
Product Release Index
        ↓
Signed OPSI Stage
        ↓
Real .opsi Package
        ↓
OPSI Server / Depot
        ↓
opsiclientd
        ↓
Endpoint Controller
        ↓
Hermes Runtime
        ↓
Bound-user Gateway
        ↓
Work Desktop
```

本版本完成以下闭环：

1. Hermes Git 一键生成 Windows Managed Offline Bundle。
2. 自动生成 Windows Python Wheelhouse。
3. 固定 Node Offline Dependency。
4. Runtime Artifact、Controller、Product Release 完整签名。
5. 仅通过真实 OPSI Tooling 创建 `.opsi`。
6. `.opsi` Build 后进行正式 Read-back。
7. Release Builder 真正执行 `Stage all`。
8. OPSI Product 发布到真实 Depot。
9. Clean Windows 安装并注册 `opsiclientd`。
10. OPSI Server 下发 `setup/update/custom`。
11. Endpoint 离线创建 Hermes Runtime。
12. Gateway 在绑定用户上下文运行。
13. Work Desktop 完成实际调用。
14. 完成 Update、Rollback、Repair、Uninstall。
15. 形成正式 Deployment Readiness Gate。

---

# 2. 当前代码基线

当前代码已经具备以下基础能力：

```text
Hermes Source Builder
Runtime Profile
Python Wheelhouse 校验
Node Offline Package Builder
Runtime Artifact v3
Endpoint Controller
Hermes Offline Install
opsiclientd Enrollment
OPSI Action Dispatch
Client Release Manifest
```

`tools/release/hermes/` 已形成 Hermes Release Builder 模块，包括 `build_runtime.py`、`build_wheel.py`、`build_wheelhouse.py`、`build_node_packages.py`、`runtime_profile.py` 和 `verify_runtime.py`。

Runtime Profile 当前定义 `smc-managed`，固定 Python extras，并将 Node MCP filesystem server 固定到 exact version。

Endpoint Controller 已支持：

```text
Python prerequisite validation
Node prerequisite validation
fresh venv
pip --no-index
Hermes wheel install
runtime slot
active/previous pointer
CLI version verification
```

OPSI Product 当前已经定义：

```text
Product Version = 1.7.1
Package Version = 1
Controller Revision = 2
setup/update/uninstall/custom
```

并声明 Hermes exact version、Gateway、managed user、request_id、client_id 等 Product Property。

---

# 3. 本版本非目标

不新增：

* Endpoint HTTP Listener；
* Windows 常驻管理 Service；
* Remote Shell；
* Hermes Chat Proxy；
* Python/Node 自动安装产品；
* S3/MinIO/CDN Artifact Store；
* 多 Depot HA；
* 多 Region；
* 500 Client 并发设计；
* Salt 管理链路；
* Work + Hermes All-in-One Installer；
* macOS/Linux Runtime；
* Hermes 用户会话迁移。

Python、Node 继续作为 Client Prerequisite。

---

# 4. Deployment Ready 定义

只有以下链路全部通过才能标记：

```text
Deployment Ready
```

完整状态：

```text
BUILD READY
    ↓
PACKAGE READY
    ↓
DEPOT READY
    ↓
CLIENT ENROLLED
    ↓
RUNTIME INSTALLED
    ↓
USER CONTEXT READY
    ↓
GATEWAY HEALTHY
    ↓
WORK VERIFIED
    ↓
LIFECYCLE VERIFIED
    ↓
DEPLOYMENT READY
```

任何 P0 Gate 未通过：

```text
NO-GO
```

---

# 5. P0-01 Hermes Release Builder 闭环

## 5.1 目标

正式构建只需要：

```text
hermes-agent Git Repository
Runtime Profile
Release Config
Signing Key Reference
```

不得要求操作员提前人工生成：

```text
Wheelhouse
Hermes ZIP
OPSI Package
```

---

# 6. Hermes Build Pipeline

统一流程：

```text
H00 Preflight
 ↓
H01 Source Freeze
 ↓
H02 Build Hermes Wheel
 ↓
H03 Resolve Runtime Profile
 ↓
H04 Resolve Windows Python Wheels
 ↓
H05 Verify Wheelhouse
 ↓
H06 Build Node Offline Packages
 ↓
H07 Assemble Managed Bundle
 ↓
H08 Verify Bundle
 ↓
H09 ZIP
 ↓
H10 SHA256
```

目标产物：

```text
hermes-<version>-windows-amd64.zip
runtime-build.json
SHA256
```

---

# 7. Automatic Wheelhouse

当前 `download_wheelhouse()` 已存在，但尚未接入主构建链。

修改：

```text
tools/release/hermes/build_runtime.py
tools/release/hermes/build_runtime.ps1
tools/release/hermes/build_wheelhouse.py
```

原：

```text
--wheelhouse REQUIRED
```

修改为：

```text
--wheelhouse OPTIONAL
```

逻辑：

```text
--wheelhouse supplied
        ↓
使用指定缓存

未 supplied
        ↓
download_wheelhouse()
        ↓
自动创建
```

---

# 8. Wheelhouse Contract

当前平台：

```text
OS              windows
Architecture    amd64
Python          >=3.12,<3.13
ABI             cp312
```

必须拒绝：

```text
Linux wheel
macOS wheel
win32
win_arm64
错误 CPython ABI
sdist-only dependency
```

正式 Bundle 必须包含 dependency inventory 和 SHA256。

---

# 9. Build Online / Offline 模式

支持：

```text
online
offline
```

### Online

Build Machine 可以访问：

```text
PyPI / configured Python registry
npm registry
```

用于建立 Release Cache。

### Offline

必须只使用：

```text
Python Wheel Cache
Node Package Cache
```

不允许网络下载。

正式 Release Pipeline 后续以：

```text
offline build reproducibility
```

作为 Production Gate。

---

# 10. Node Offline Package

Runtime Profile 是 Node Runtime Dependency SOT。

当前：

```text
@modelcontextprotocol/server-filesystem
```

已经固定 exact version。

Builder：

```text
profile
 ↓
npm pack exact-version
 ↓
*.tgz
 ↓
SHA256
 ↓
node/packages/
```

禁止：

```text
latest
npx -y unversioned
npm install latest
```

作为 Production Runtime Dependency。

---

# 11. Hermes Managed Bundle

正式结构：

```text
hermes-<version>-windows-amd64.zip
│
├── app/
│   └── hermes_agent-<version>.whl
│
├── python/
│   ├── wheels/
│   │   └── *.whl
│   └── requirements.lock
│
├── node/
│   ├── packages/
│   │   └── *.tgz
│   ├── package.json
│   └── package-lock.json
│
├── config/
│   ├── config.schema.yaml
│   └── managed.defaults.yaml
│
├── runtime-profile.json
├── runtime-build.json
└── LICENSES/
```

---

# 12. P0-02 Node Runtime Slot 安装修复

当前 Endpoint 直接：

```powershell
npm install --offline ...
```

需要改为固定 Runtime Slot。

目标：

```text
C:\ProgramData\SMC\Hermes\
runtime\
versions\
<version>-<digest>\
node\
node_modules\
```

修改：

```text
infra/opsi/products/smc-hermes-agent/
controller/SmcController.psm1
```

---

# 13. Node Install Transaction

目标流程：

```text
$slot\node
  ↓
validate package.json
  ↓
validate package-lock
  ↓
validate *.tgz
  ↓
npm install / ci
  ↓
--prefix $slot\node
  ↓
offline
  ↓
verify node_modules
```

禁止写入：

```text
OPSI Product Cache
System32
Current PowerShell CWD
%APPDATA%\npm
用户 home
```

---

# 14. Node Runtime Verification

安装后必须验证 Profile 声明的 package。

例如：

```text
node_modules/@modelcontextprotocol/server-filesystem
```

并增加：

```text
NodeDependencyStatus = PASS
```

至：

```text
runtime.json
```

---

# 15. P0-03 Runtime Artifact v3 Closure

继续使用：

```text
smc.opsi.runtime-artifact.v3
```

Artifact Manifest 必须包含：

```text
version
platform
architecture
sha256
files[]
installType
runtimeEntrypoint
requires.python
requires.node
profile
runtimeBuildSha256
controllerCompat
keyId
signature
```

当前代码已经支持 `python-wheelhouse`、`runtimeEntrypoint` 和 prerequisite contract。

---

# 16. Entrypoint

Managed Runtime：

```text
installType:
python-wheelhouse

runtimeEntrypoint:
venv/Scripts/hermes.exe
```

禁止再依赖 ZIP 根目录：

```text
hermes.exe
```

Controller、Gateway、Health 均从：

```text
runtime/active.json
```

解析真实入口。

---

# 17. P0-04 Real OPSI Package Closure

正式 Release 删除 Production ZIP `.opsi` 路径。

Production 唯一路径：

```text
Signed Stage
     ↓
OPSI Package Builder
     ↓
opsi-makepackage
     ↓
Real .opsi
```

修改：

```text
infra/opsi/products/smc-hermes-agent/
packaging/makepackage.py
packaging/build-real.sh
packaging/opsi_readback.py
```

---

# 18. makepackage.py

当前仍存在：

```text
opsi_tooling = zipfile
```

以及直接 `zipfile.ZipFile(... .opsi)` 的路径。

Production 修改为：

```text
native = default
```

正式 Release 禁止：

```text
zipfile
```

`zipfile` 仅允许：

```text
.smoke.zip
unit test fixture
```

不得产生：

```text
.opsi
```

---

# 19. Signed OPSI Stage

Stage：

```text
stage/
│
├── OPSI/
│   ├── control.toml
│   ├── product-release.json
│   ├── smc-artifact-manifest.json
│   ├── smc-provenance.json
│   └── smc-sbom.cdx.json
│
└── CLIENT_DATA/
    ├── setup.opsiscript
    ├── update.opsiscript
    ├── uninstall.opsiscript
    ├── custom.opsiscript
    │
    ├── controller/
    │
    ├── scripts/
    │
    ├── artifacts/
    │   ├── hermes-*.zip
    │   ├── hermes-*.manifest.json
    │   └── hermes-*.sig
    │
    └── keys/
        └── release-public-key.pem
```

Private Key 禁止进入 Stage。

---

# 20. control.toml 动态 Release Staging

源码中的：

```text
OPSI/control.toml
```

作为 Product Template。

Stage 时必须根据本次构建 Artifact 生成最终：

```text
productVersion
packageVersion
hermes_version.default
controller_revision.default
```

当前仓库默认 Hermes Version 为 `0.22.0`。

正式 Release 必须保证：

```text
control.toml Hermes Version
        =
runtime-build.json version
        =
Runtime Artifact version
        =
Product Release runtime version
```

不允许依赖人工修改。

---

# 21. Real OPSI Read-back

当前 `opsi_readback.py` 基于 ZIP reader，需要改为正式 OPSI Package Read-back。

目标：

```text
real .opsi
   ↓
OPSI-aware extract
   ↓
temporary readback/
   ↓
Compare signed stage
```

比较：

```text
OPSI/control.toml
OPSI/product-release.json
Runtime ZIP
Runtime Manifest
Runtime Signature
Controller Manifest
Public Key
Artifact Manifest
```

同时校验：

```text
SHA256
Product Version
Package Version
Hermes Version
Controller Revision
```

---

# 22. P0-05 Unified Release Builder

当前：

```text
build-client-release all
```

仍要求输入已完成的：

```text
--hermes-zip
--opsi-package
```

必须改成真正 Orchestrator。

---

# 23. Unified Pipeline

```text
R00 Preflight
 ↓
R01 Freeze SMC Source
 ↓
R02 Freeze Hermes Source
 ↓
R03 Build Work
 ↓
R04 Build Hermes Wheel
 ↓
R05 Build Python Wheelhouse
 ↓
R06 Build Node Offline Packages
 ↓
R07 Build Managed Bundle
 ↓
R08 Runtime Artifact Sign
 ↓
R09 Controller Sign
 ↓
R10 Product Release Sign
 ↓
R11 Build Signed OPSI Stage
 ↓
R12 Real opsi-makepackage
 ↓
R13 OPSI Read-back
 ↓
R14 Capture OPSI Client Installer
 ↓
R15 Assemble Client Release
 ↓
R16 Security Scan
 ↓
R17 Final Verification
 ↓
R18 READY
```

任何阶段失败：

```text
Release FAILED
```

---

# 24. CLI

正式入口：

```powershell
.\scripts\build-client-release.ps1 `
    -Stage all `
    -HermesRepo "D:\git\hermes-agent" `
    -OpsiClientInstaller "D:\packages\opsi-client-agent-installer.exe" `
    -SigningKeyRef "D:\secure\smc-release.pem" `
    -Output "D:\smc-release"
```

不得再要求：

```text
-HermesZip
-OpsiPackage
```

作为 `Stage all` 必填输入。

---

# 25. 独立 Stage

继续支持：

```text
preflight
work
hermes
runtime
opsi-stage
opsi-package
assemble
verify
all
```

每一个 Stage 必须能够实际执行，而不是返回：

```text
requires external input
```

---

# 26. P0-06 Final Release Verification

当前 Client Release Verify 主要检查：

```text
file exists
SHA256
secret scan
```

正式 Final Verify 必须提升为：

```text
Client Release
 │
 ├─ Work artifact hash
 │
 ├─ Hermes Bundle verification
 │    ├ signature
 │    ├ runtime manifest
 │    ├ files[]
 │    └ runtime-build
 │
 ├─ Controller verification
 │    └ signature
 │
 ├─ Product Release verification
 │    └ signature
 │
 ├─ OPSI Package verification
 │    └ real read-back
 │
 ├─ OPSI Client hash
 │
 └─ Secret Scan
```

全部 PASS 才允许：

```json
"liveEligible": true
```

---

# 27. Client Release Output

目标：

```text
dist/client-release/
└── 1.7.1/
    └── <build-id>/
        │
        ├── work/
        │   ├── copilot-desktop-<version>-setup.exe
        │   └── copilot-desktop-<version>-portable.exe
        │
        ├── hermes/
        │   ├── hermes-<version>-windows-amd64.zip
        │   ├── hermes-<version>-windows.manifest.json
        │   └── hermes-<version>-windows.sig
        │
        ├── opsi/
        │   ├── smc-hermes-agent_1.7.1-1.opsi
        │   └── smc-hermes-agent_1.7.1-1.opsi.sha256
        │
        ├── bootstrap/
        │   ├── opsi-client-agent-installer.exe
        │   └── opsi-enroll-local-client.ps1
        │
        └── manifests/
            ├── client-release.json
            ├── product-release.json
            ├── provenance.json
            ├── sbom.cdx.json
            └── SHA256SUMS
```

---

# 28. P0-07 Real OPSI Server Publish

Build 与 Publish 保持权限分离。

Release Builder：

```text
BUILD
SIGN
VERIFY
```

Operator：

```text
PUBLISH
```

目标流程：

```text
Release READY
   ↓
copy .opsi to OPSI Server
   ↓
install package
   ↓
Depot update
   ↓
ProductOnDepot read-back
   ↓
Release Catalog ingest
```

---

# 29. Server Publish Gate

发布后必须取得：

```text
ProductId
ProductVersion
PackageVersion
DepotId
```

目标：

```text
smc-hermes-agent
1.7.1
1
<expected depot>
```

若不匹配：

```text
DEPOT_NOT_READY
```

禁止向 Client 下发 setup/update。

---

# 30. Release Catalog 同步

OPSI Server Product 成功发布后：

```text
product-release.json
        ↓
opsi-control
        ↓
Product Release Store
```

状态：

```text
verified = true
liveEligible = true
```

随后才允许：

```text
SETUP
UPDATE
```

当前 `opsi-control` 已能在 Dispatch 前检查 Depot Product、Hermes Runtime Catalog 和 Controller Compatibility。

---

# 31. P0-08 Clean Windows Client Baseline

验证机器必须满足：

```text
Windows 10 / Windows 11 x64

无 Hermes Runtime
无旧 SMC Hermes Runtime
无旧 OPSI Product Cache 干扰
```

预安装：

```text
Python 3.12.x x64
Node.js 22.x
```

不得预装：

```text
Hermes Python dependencies
Hermes venv
Hermes npm packages
```

用于证明 Offline Runtime Artifact 完整性。

---

# 32. Prerequisite Gate

增加：

```text
Test-SmcClientPrerequisites.ps1
```

输出：

```json
{
  "platform": "windows",
  "architecture": "amd64",

  "python": {
    "version": "3.12.x",
    "architecture": "AMD64",
    "venv": true,
    "status": "PASS"
  },

  "node": {
    "version": "22.x",
    "npm": true,
    "status": "PASS"
  }
}
```

失败则：

```text
PREREQUISITE_FAILED
```

不得安装 Hermes。

---

# 33. P0-09 opsiclientd Enrollment

继续使用：

```text
scripts/opsi-enroll-local-client.ps1
```

该脚本已支持：

```text
本地 installer
Service Address
Client ID
Credential
opsiclientd.conf 更新
service restart
Running verification
```

验证：

```text
opsiclientd = Running

config_service =
https://opsi.superic.com:4447

ClientId =
<FQDN>
```

---

# 34. Client Identity

Endpoint Identity 必须保持：

```text
OPSI Client FQDN
```

例如：

```text
pc001.superic.com
```

禁止：

```text
PC001
COMPUTERNAME only
IP address
```

---

# 35. P0-10 Server → Client SETUP

真实 Server 通过 `opsi-control`：

```text
request_id
client_id
hermes_version
managed_user_sid
managed_user_account
gateway_port
controller_revision
```

写入 Product Property。

随后：

```text
productOnClient.actionRequest = setup
```

当前 Dispatcher 已实现 property update + read-back + `actionRequest` update + read-back。

---

# 36. SETUP Client Pipeline

```text
opsiclientd
   ↓
setup.opsiscript
   ↓
Invoke-SmcHermesAgent.ps1
   ↓
Verify Controller
   ↓
Install Controller
   ↓
Copy Artifact to ProgramData
   ↓
Installed Endpoint Controller
   ↓
Verify Runtime Artifact
   ↓
Create Runtime Slot
   ↓
Verify Python / Node
   ↓
Create venv
   ↓
Offline Python install
   ↓
Offline Node install
   ↓
Hermes --version
```

`setup.opsiscript` 已经进入 Thin Bootstrap。

Bootstrap 已经转入安装后的 Controller，而不是继续从 Product Cache 直接操作 Hermes。

---

# 37. Runtime Directory

目标：

```text
C:\ProgramData\SMC\Hermes\
│
├── controller\
│   ├── releases\
│   └── current.json
│
├── runtime\
│   ├── versions\
│   │   └── <version>-<digest>\
│   │       ├── app\
│   │       ├── python\
│   │       ├── node\
│   │       ├── venv\
│   │       └── runtime.json
│   │
│   └── active.json
│
├── managed\
├── desired\
├── observed\
├── transactions\
├── results\
└── logs\
```

---

# 38. Runtime Activation

安装成功前：

```text
active.json
```

不得更新。

完整顺序：

```text
Stage new runtime
 ↓
verify files
 ↓
create venv
 ↓
install Python
 ↓
install Node
 ↓
CLI verify
 ↓
runtime verify
 ↓
atomic activate
```

失败：

```text
delete/retain failed slot for diagnostics
keep previous active
```

---

# 39. P0-11 User Context

Machine Runtime 成功并不等于部署完成。

若用户未登录：

```text
USER_CONTEXT_PENDING
```

必须保持：

```text
RUNNING
```

而不是：

```text
FAILED
SUCCEEDED
```

---

# 40. Bound-user Gateway

用户登录后：

```text
Managed SID
   ↓
Bound-user Task
   ↓
HERMES_HOME=%USERPROFILE%\.hermes
   ↓
active runtime hermes.exe
   ↓
gateway
   ↓
127.0.0.1:8642
```

Gateway 必须读取：

```text
runtime/active.json
```

不得固定引用旧 Runtime Slot。

---

# 41. Gateway Health Gate

必须检查：

```text
Task exists
Task principal = expected user
Runtime version = expected
Gateway process exists
127.0.0.1:8642 reachable
Gateway health/status succeeds
```

成功：

```text
GATEWAY_HEALTHY
```

---

# 42. Endpoint Health Model

正式统一：

```text
UNKNOWN
INSTALLING
USER_CONTEXT_PENDING
STARTING
HEALTHY
DEGRADED
FAILED
ROLLING_BACK
```

`HEALTHY` 定义：

```text
Controller verified
AND Runtime verified
AND Hermes exact version
AND User binding valid
AND Gateway reachable
AND no open failed transaction
```

OPSI：

```text
ProductOnClient.installationStatus = installed
```

不能替代：

```text
Endpoint HEALTHY
```

---

# 43. P0-12 Work Desktop Live Verification

Clean Client 安装：

```text
Work Desktop
```

实际验证：

```text
Work
 ↓
127.0.0.1:8642
 ↓
Hermes Gateway
 ↓
Hermes Agent
 ↓
LLM request
 ↓
valid response
```

验收至少执行：

```text
new session
simple prompt
Hermes response
session continues
```

---

# 44. P1-01 Update

完成：

```text
Hermes A
 ↓
Hermes B
```

例如：

```text
0.22.0
→
next exact test version
```

流程：

```text
build new Release
 ↓
publish package
 ↓
actionRequest=update
 ↓
new immutable slot
 ↓
verify
 ↓
active switch
 ↓
Gateway restart
```

---

# 45. Update Gate

必须验证：

```text
old slot remains
new slot active
active.json version correct
previous points old slot
Gateway runs new entrypoint
HERMES_HOME unchanged
Work session capability intact
```

---

# 46. P1-02 Rollback

人为制造：

```text
invalid runtime
missing wheel
invalid Node package
Gateway failure
```

验证：

```text
new runtime activation FAILED
 ↓
previous runtime remains active
 ↓
Gateway previous version restored
 ↓
Endpoint becomes HEALTHY/DEGRADED
```

不得：

```text
leave active.json pointing broken runtime
```

---

# 47. P1-03 Repair

验证：

```text
restart-gateway
repair L1
repair L2
reconcile-controller
```

修复场景：

```text
Gateway stopped
Task missing
config drift
runtime pointer drift
Controller pointer drift
```

不得默认重装 Hermes。

---

# 48. P1-04 Uninstall

Uninstall 必须明确 ownership。

删除：

```text
OPSI-managed Runtime
Controller
Scheduled Tasks
Managed machine state
```

默认保留：

```text
%USERPROFILE%\.hermes
user sessions
memory
user data
```

除非显式执行：

```text
purge-user-data
```

该能力不进入 v1.7.1 默认 uninstall。

---

# 49. P1-05 Diagnostics

增加统一 Deployment Diagnostic Bundle。

至少包含：

```text
clientId
OPSI Product status
Controller revision
Controller digest
Runtime version
Runtime digest
active.json
runtime.json
Python version
Node version
npm version
Gateway task
Gateway port
Gateway status
last transaction
last install error
OPSI relevant log
Controller log
Gateway log
```

必须脱敏：

```text
API Keys
Tokens
Passwords
Credentials
Config secrets
```

---

# 50. P1-06 Product Cache Independence

首次成功安装 Controller + Runtime 后：

模拟删除/不可访问 OPSI Product Cache。

验证：

```text
status
health
restart-gateway
repair
recover
```

继续工作。

只有：

```text
新的 setup/update Artifact
```

需要 OPSI Product。

---

# 51. P1-07 Machine Reboot

Clean Client 完成安装后：

```text
Reboot Windows
```

验证：

```text
Controller Recovery Task
Runtime active pointer
User task
Gateway
Work Desktop
```

均可恢复。

不得依赖：

```text
旧 PowerShell Process
OPSI Product Cache path
temporary stage
```

---

# 52. Release Security Gate

正式 Release Fail Closed：

```text
dirty SMC source
dirty Hermes source
unknown version
latest
missing uv.lock
missing Runtime Profile
wrong wheel platform
missing wheel
missing Node package
unversioned Node package
invalid signature
wrong key
Runtime hash mismatch
Controller mismatch
Product Release mismatch
private key leak
secret leak
fake .opsi
OPSI read-back mismatch
```

---

# 53. Signing Boundary

两个信任域继续分离：

```text
Ed25519
→ Runtime / Controller / OPSI metadata

Authenticode
→ Work Windows executable
```

Private Signing Key：

```text
Source     ❌
Stage      ❌
Artifact   ❌
Dist       ❌
Logs       ❌
```

仅：

```text
external key reference
```

---

# 54. Automated Test Gate

## Release Builder

| ID   | 场景                        | 结果    |
| ---- | ------------------------- | ----- |
| RB01 | Clean Sources             | PASS  |
| RB02 | Dirty Source              | FAIL  |
| RB03 | Automatic Wheelhouse      | PASS  |
| RB04 | Wrong Wheel Platform      | FAIL  |
| RB05 | Missing Python Wheel      | FAIL  |
| RB06 | Node exact package        | PASS  |
| RB07 | Node latest               | FAIL  |
| RB08 | Bundle Build              | PASS  |
| RB09 | Artifact Signature        | PASS  |
| RB10 | Controller Signature      | PASS  |
| RB11 | Product Release Signature | PASS  |
| RB12 | Real OPSI Package         | PASS  |
| RB13 | OPSI Read-back            | PASS  |
| RB14 | Secret Scan               | PASS  |
| RB15 | Final Release             | READY |

---

# 55. Clean Client Gate

| ID   | 场景                     | 结果   |
| ---- | ---------------------- | ---- |
| WC01 | Python prerequisite    | PASS |
| WC02 | Node prerequisite      | PASS |
| WC03 | opsiclientd install    | PASS |
| WC04 | OPSI enrollment        | PASS |
| WC05 | Product download       | PASS |
| WC06 | Controller install     | PASS |
| WC07 | Runtime signature      | PASS |
| WC08 | Fresh venv             | PASS |
| WC09 | Offline Python install | PASS |
| WC10 | Offline Node install   | PASS |
| WC11 | Hermes version         | PASS |
| WC12 | User binding           | PASS |
| WC13 | Gateway                | PASS |
| WC14 | Work → Hermes          | PASS |

---

# 56. Lifecycle Gate

| ID   | 场景              | 结果   |
| ---- | --------------- | ---- |
| LC01 | Initial Setup   | PASS |
| LC02 | Reboot          | PASS |
| LC03 | Update          | PASS |
| LC04 | Failed Update   | PASS |
| LC05 | Rollback        | PASS |
| LC06 | Restart Gateway | PASS |
| LC07 | Repair          | PASS |
| LC08 | Apply Config    | PASS |
| LC09 | Collect Log     | PASS |
| LC10 | Uninstall       | PASS |

---

# 57. Real OPSI Server 实施步骤

## Step 1 — Build Release

Build Machine：

```powershell
.\scripts\build-client-release.ps1 `
    -Stage all `
    -HermesRepo "D:\git\hermes-agent" `
    -OpsiClientInstaller "D:\packages\opsi-client-agent-installer.exe" `
    -SigningKeyRef "D:\secure\smc-release.pem" `
    -Output "D:\smc-release"
```

验收：

```text
client-release.json
liveEligible=true
real .opsi exists
Final Verify PASS
```

---

# 58. Step 2 — Publish OPSI Product

上传：

```text
smc-hermes-agent_1.7.1-1.opsi
```

至 OPSI Server。

执行正式 Package Install。

随后读取：

```text
ProductOnDepot
```

确认：

```text
productId = smc-hermes-agent
productVersion = 1.7.1
packageVersion = 1
```

---

# 59. Step 3 — Release Catalog

导入并验证：

```text
product-release.json
```

确认：

```text
runtime = exact Hermes version
controllerRevision = 2
verified = true
liveEligible = true
```

---

# 60. Step 4 — Prepare Clean Windows

执行：

```text
Python check
Node check
Architecture check
```

并确认不存在旧：

```text
C:\ProgramData\SMC\Hermes
```

或明确清理为 Clean Baseline。

---

# 61. Step 5 — Install OPSI Client

```powershell
.\scripts\opsi-enroll-local-client.ps1 `
    -InstallerPath "D:\packages\opsi-client-agent-installer.exe" `
    -ServiceAddress "https://opsi.superic.com:4447"
```

验收：

```text
opsiclientd Running
client FQDN registered
config_service correct
```

---

# 62. Step 6 — Server Inventory

OPSI Server/`opsi-control` 必须看到：

```text
Client
Product
Depot
```

Client：

```text
<client-fqdn>
```

Product：

```text
smc-hermes-agent
```

---

# 63. Step 7 — User Binding

写入：

```text
managed_user_sid
managed_user_account
```

例如：

```text
SID:
S-1-5-21-...

Account:
DOMAIN\user
```

setup/update 未有 verified user binding 时禁止下发；当前 Dispatcher 已执行该约束。

---

# 64. Step 8 — SETUP

下发：

```text
operation = setup
clientId = client FQDN
hermesVersion = exact version
```

验证状态：

```text
QUEUED
→ DISPATCHED
→ RUNNING
→ USER_CONTEXT_PENDING / SUCCEEDED
```

---

# 65. Step 9 — Machine Runtime Evidence

必须保存：

```text
controller/current.json
runtime/active.json
state/version.json
runtime/<slot>/runtime.json
```

检查：

```text
Hermes version
Artifact digest
Controller revision
Runtime entrypoint
```

---

# 66. Step 10 — User Gateway

用户登录。

验证：

```text
HERMES_HOME
Gateway Task
Gateway Process
127.0.0.1:8642
```

Endpoint 状态：

```text
HEALTHY
```

---

# 67. Step 11 — Work Desktop

安装 Release Bundle 内 Work Setup。

执行：

```text
Work → Local Gateway → Hermes
```

完成实际 Chat。

---

# 68. Step 12 — Lifecycle

依次执行：

```text
status
restart-gateway
apply-config
collect-log
repair
update
rollback test
reboot
uninstall
```

全部记录 Live Evidence。

---

# 69. Live Evidence 目录

建议统一：

```text
evidence/
└── v1.7.1/
    └── <client-fqdn>/
        │
        ├── release/
        ├── depot/
        ├── enrollment/
        ├── setup/
        ├── runtime/
        ├── gateway/
        ├── work/
        ├── update/
        ├── rollback/
        ├── repair/
        ├── reboot/
        └── uninstall/
```

每个场景保存：

```text
timestamp
requestId
clientId
command
result
relevant hashes
relevant state JSON
sanitized log
```

---

# 70. 实施阶段

## Phase 1 — Release Builder Closure

完成：

```text
Automatic Wheelhouse
Unified Stage wiring
Node prefix
```

---

## Phase 2 — OPSI Package Closure

完成：

```text
remove Production zipfile .opsi
real opsi-makepackage
OPSI-aware read-back
```

---

## Phase 3 — Final Release Gate

完成：

```text
Signature chain
Read-back
Security scan
Client Release verification
```

---

## Phase 4 — Real OPSI Server

完成：

```text
Build Release
Publish Product
ProductOnDepot
Release Catalog
```

---

## Phase 5 — Clean Windows Setup

完成：

```text
Prerequisite
opsiclientd
Enrollment
setup
Runtime
```

---

## Phase 6 — User Runtime

完成：

```text
User Binding
HERMES_HOME
Gateway
HEALTHY
```

---

## Phase 7 — Work Integration

完成：

```text
Work Desktop
Local Gateway
Hermes Chat
```

---

## Phase 8 — Lifecycle Verification

完成：

```text
Update
Rollback
Repair
Reboot
Uninstall
Diagnostics
```

---

# 71. Deployment Readiness Gate

最终必须全部为 PASS：

```text
[ ] Hermes Source → Bundle
[ ] Automatic Windows Wheelhouse
[ ] Node Offline Package
[ ] Node Runtime Slot
[ ] Runtime Artifact v3
[ ] Runtime Signature
[ ] Controller Signature
[ ] Product Release Signature
[ ] Signed OPSI Stage
[ ] Real opsi-makepackage
[ ] OPSI Package Read-back
[ ] Client Release Final Verify
[ ] liveEligible=true

[ ] OPSI Product Publish
[ ] ProductOnDepot verified
[ ] Release Catalog verified

[ ] Clean Windows prerequisite
[ ] opsiclientd installed
[ ] Client enrolled

[ ] setup dispatched
[ ] Controller installed
[ ] Runtime installed
[ ] Fresh venv
[ ] Python offline install
[ ] Node offline install
[ ] Hermes exact version

[ ] User binding
[ ] Gateway task
[ ] Gateway healthy

[ ] Work Desktop → Hermes
[ ] status
[ ] apply-config
[ ] restart-gateway
[ ] collect-log
[ ] repair
[ ] update
[ ] failed update rollback
[ ] reboot recovery
[ ] uninstall
```

只有全部通过：

```text
SMC Copilot OPSI v1.7.1
DEPLOYMENT READY
```

---

# 72. Definition of Done

v1.7.1 Deployment Closure 完成条件：

> **从两个干净 Git Repository 出发，一个 Release Builder 命令生成经过签名和验证的真实 OPSI Product；该 Product 能发布至真实 OPSI Server，并由真实 Windows `opsiclientd` 获取和执行；客户端在仅预装指定 Python/Node 的前提下完全离线构建 Hermes Runtime，在绑定用户上下文启动 Gateway，Work Desktop 可以实际调用 Hermes；Update、Rollback、Repair、Reboot、Uninstall 均产生可追踪 Live Evidence。**

达到该条件后，项目从：

```text
Development Complete
```

进入：

```text
Deployment Ready
```

后续工作不再属于 v1.7.1 功能开发，而进入 **真实服务器实施、Clean Client 验证、Canary Rollout**。
