# PRD-WORK-v2.3 — Windows Release Production Closure & Auto Update Hardening

**版本：** PRD v2.3
**模块：** `smc-copilot/apps/work`
**代码基线：** `work/prd-v2.0` 当前实现
**目标平台：** Windows 10 / Windows 11 AMD64
**技术栈：** Electron 39 + React 19 + electron-builder 26 + electron-updater 6 + NSIS
**文档类型：** 工程实施 PRD
**实施性质：** v2.0 发布与自动更新能力的生产闭环，不新增 Work 业务功能

---

## 1. 项目背景

`apps/work` 当前已经完成 Windows 自动更新主体能力：

* Main Process 持有 Update State Single Source of Truth；
* `revision` 单调递增；
* 启动随机延迟检查；
* 6 小时周期检查；
* 手动下载；
* 手动安装；
* `autoDownload=false`；
* `autoInstallOnAppQuit=false`；
* Renderer `AppUpdateProvider`；
* Available / Download / Ready 等更新交互；
* Generic Provider；
* NSIS Windows Installer；
* Release Server 基础结构；
* Windows Release Build / Validate / Publish 脚本。

因此 v2.3 **不再调整自动更新总体架构**。

当前阻碍正式生产发布的核心问题集中在：

1. 旧版安装身份与新版安装身份不一致；
2. `0.7.4` 历史版本是否已经发布需要形成不可变基线；
3. per-user → per-machine、旧 appId → 新 appId 的迁移没有生产级闭环；
4. NSIS 安装目录 Registry View 兼容不完整；
5. Release Gate 尚未完整校验 `latest.yml.sha512`；
6. 新旧 Updater IPC/Event 同时存在；
7. Update Error Contract 部分错误码未实际落地；
8. `apps/work` 缺少独立 CI / Release Pipeline；
9. Internal Generic Feed 的正式 DNS / TLS / Publisher / Signing / 权限尚未形成发布基线；
10. 尚未完成真实签名 Windows N→N+1 升级验收。

---

# 2. v2.3 产品定位

v2.3 定义为：

> **SMC Copilot Work Windows 客户端生产发布闭环版本。**

核心目标不是增加新功能，而是将现有：

```text
Build
  ↓
Installer
  ↓
Release Server
  ↓
Auto Update
```

升级为：

```text
Source
  ↓
CI Quality Gate
  ↓
Windows NSIS Build
  ↓
Authenticode Signing
  ↓
Metadata / Blockmap Generation
  ↓
Artifact Integrity Validation
  ↓
Immutable Version Repository
  ↓
Stable Feed
  ↓
Installed Client
  ↓
Check
  ↓
Explicit Download
  ↓
Explicit Install
  ↓
Identity / userData Continuity
```

v2.3 完成后，`apps/work` 才进入：

**Production Ready**

状态。

---

# 3. v2.3 实施目标

## 3.1 P0 目标

必须完成：

| ID         | 目标                                      |
| ---------- | --------------------------------------- |
| IDM-01     | Windows 安装身份迁移闭环                        |
| VER-01     | 历史版本不可变                                 |
| INST-01    | Installer Registry / InstallLocation 兼容 |
| REL-01     | `latest.yml.sha512` 强校验                 |
| CUTOVER-01 | GitHub Feed → Internal Generic Feed 切换  |
| MIG-01     | userData 连续性                            |
| TEST-01    | Windows N→N+1 实机升级                      |
| SIGN-01    | Authenticode Production Gate            |

P0 任一未完成：

> 禁止 Stable Production Release。

---

## 3.2 P1 目标

本版本同步完成：

* 删除 Legacy Updater IPC；
* 删除 Legacy Update Events；
* 删除旧 Auto Upgrade Preference；
* 完善 Update Error Contract；
* 建立 Work 独立 CI；
* 建立 Windows Release Workflow；
* 建立 Release Manifest / Artifact Integrity Gate；
* Release Server Production Smoke Test。

---

# 4. 非目标范围

以下内容不属于 v2.3：

* Kanban scheduled / review 状态；
* comments；
* reassignment；
* task decomposition；
* dependencies；
* diagnostics；
* runs；
* realtime events；
* attachments；
* Work 新业务模块；
* Desktop UI 重构；
* Updater State Machine 重构；
* AppUpdateProvider 重构；
* Update Dialog 重构。

上述业务能力进入独立 Work Feature PRD。

---

# 5. 现有能力冻结

以下代码进入架构冻结状态：

```text
apps/work/src/shared/app-update.ts

apps/work/src/main/app/updater.ts
  ├─ Main State Snapshot
  ├─ revision
  ├─ startup update check
  ├─ periodic check
  ├─ checkPromise
  ├─ downloadPromise
  ├─ autoDownload=false
  └─ autoInstallOnAppQuit=false

apps/work/src/renderer/src/update/
  ├─ AppUpdateProvider.tsx
  ├─ UpdateAvailableDialog.tsx
  ├─ UpdateDownloadStatus.tsx
  └─ UpdateReadyDialog.tsx
```

v2.3 只允许：

* Bug Fix；
* Contract 收敛；
* Error Mapping；
* Legacy API 清除；
* Test 补充。

禁止重新设计 Update State Architecture。

---

# 6. IDM-01 — Windows 安装身份治理

## 6.1 当前身份变化

历史身份：

```yaml
appId: com.nousresearch.hermes
productName: Copilot Desktop
executableName: copilot-desktop
perMachine: false
```

当前代码：

```yaml
appId: com.smc.copilot
productName: SMC-Copilot

win:
  executableName: smc-copilot

nsis:
  perMachine: true
```

实际上包含三次迁移：

```text
Application ID Migration
com.nousresearch.hermes
        ↓
com.smc.copilot

Executable Migration
copilot-desktop.exe
        ↓
smc-copilot.exe

Installation Scope Migration
Current User
        ↓
All Users
```

不能视为普通 Electron Upgrade。

---

# 7. VER-01 — 0.7.4 基线冻结

当前：

```json
"version": "0.7.4"
```

但代码身份已经发生变化。

必须首先确认：

> 历史 `0.7.4` 是否曾向任何测试或生产终端正式分发。

### 情况 A：0.7.4 已经分发

必须：

```text
0.7.4
│
├── Installer
├── latest.yml
├── blockmap
└── binary
```

全部冻结。

禁止重新生成另一个不同内容的：

```text
smc-copilot-0.7.4-setup.exe
```

新版必须：

```text
version > 0.7.4
```

例如：

```text
0.7.4   Legacy
   ↓
0.7.5   Bridge / Migration
   ↓
0.7.6   N+1 validation
```

具体版本号可以调整，但必须保持 SemVer 单调递增。

### 情况 B：0.7.4 从未正式分发

允许重新建立产品基线，但必须在 Release Record 中明确：

```text
0.7.4 = non-production development build
```

---

# 8. IDM-02 — Identity Migration 实现

新增：

```text
apps/work/src/main/migration/
├── identity-migration.ts
├── userdata-migration.ts
├── legacy-installation.ts
└── migration-state.ts
```

职责：

### legacy-installation.ts

识别：

```text
legacy app
legacy executable
legacy uninstall registry
legacy install path
legacy userData
```

不得只依赖一个固定目录。

需要检查：

```text
HKCU
HKLM

32-bit Registry View
64-bit Registry View
```

---

## 8.1 Migration State

建立：

```json
{
  "schemaVersion": 1,
  "source": "copilot-desktop",
  "target": "smc-copilot",
  "status": "pending | migrated | verified | failed",
  "sourceVersion": "0.7.4",
  "targetVersion": "0.7.5"
}
```

状态文件必须位于不会因为应用身份变化而丢失的位置。

迁移必须具备：

```text
detect
  ↓
backup
  ↓
copy/migrate
  ↓
verify
  ↓
mark migrated
```

禁止：

```text
delete old data
   ↓
then verify
```

---

# 9. MIG-01 — userData 连续性

重点检查 Electron：

```text
app.getPath("userData")
```

因：

```text
Copilot Desktop
        ↓
SMC-Copilot
```

可能导致 userData 路径变化。

必须保证旧：

```text
sessions
settings
local state
workspace metadata
user preference
```

继续可访问。

迁移策略：

```text
Old userData
     ↓
Detect
     ↓
Backup
     ↓
Migrate
     ↓
Launch new version
     ↓
Business validation
```

---

## 9.1 验收要求

升级前：

```text
Create Session A
Create Settings A
Create Local File Record A
```

升级后：

```text
Session A exists
Settings A exists
Local File Record A exists
```

禁止出现：

```text
new application starts as empty profile
```

---

# 10. INST-01 — NSIS Registry View 修复

修改：

```text
apps/work/build/installer.nsh
```

当前只执行：

```nsis
SetRegView 64
```

v2.3 必须同时兼容：

```text
64-bit HKLM
64-bit HKCU
32-bit HKLM
32-bit HKCU
```

读取顺序：

```text
64 HKLM
  ↓
64 HKCU
  ↓
32 HKLM
  ↓
32 HKCU
  ↓
legacy install location
  ↓
default install location
```

---

## 10.1 InstallLocation 优先级

```text
Existing Valid Installation
        ↓
Migrated Legacy Installation
        ↓
Configured Enterprise Path
        ↓
Default Path
```

不能因为升级直接覆盖用户已经选择的自定义目录。

必须测试：

```text
C:\Program Files
D:\Programs
custom directory
per-user legacy installation
per-machine installation
```

---

# 11. Legacy Updater Contract 清除

修改：

```text
apps/work/src/main/app/updater.ts
```

当前仍存在：

```text
check-for-updates
download-update
install-update

get-auto-upgrade-enabled
set-auto-upgrade-enabled
```

以及：

```text
update-available
update-download-progress
update-downloaded
update-error
```

v2.3 完成后只保留：

```text
app-update:get-state
app-update:check
app-update:download
app-update:install
app-update:state-changed
```

架构收敛为：

```text
Renderer
   │
AppUpdateProvider
   │
Preload
   │
IPC v2
   │
Main Process
   │
Update State SOT
   │
electron-updater
```

禁止 Renderer 直接消费 electron-updater event。

---

# 12. Update Error Contract 完善

当前 Contract 定义：

```text
CHECK_FAILED
DOWNLOAD_FAILED
UPDATE_METADATA_INVALID
SIGNATURE_INVALID
INSTALL_FAILED
```

但实际实现主要返回：

```text
CHECK_FAILED
DOWNLOAD_FAILED
INSTALL_FAILED
```

v2.3 增加：

```text
normalizeUpdaterError()
```

建议位置：

```text
apps/work/src/main/app/update-error.ts
```

统一分类：

| 场景                                  | Error Code                |
| ----------------------------------- | ------------------------- |
| 网络/Feed Check 失败                    | `CHECK_FAILED`            |
| latest.yml 无效                       | `UPDATE_METADATA_INVALID` |
| Metadata 字段错误                       | `UPDATE_METADATA_INVALID` |
| Publisher / Signature Validation 失败 | `SIGNATURE_INVALID`       |
| 下载失败                                | `DOWNLOAD_FAILED`         |
| Installer 执行失败                      | `INSTALL_FAILED`          |

无法可靠识别的异常不得伪造分类，降级至对应阶段通用错误。

---

# 13. REL-01 — Release Metadata Integrity

核心修改：

```text
apps/work/scripts/lib/work-release-guard.mjs
```

当前校验：

```text
version
path
installer
blockmap
SHA256SUMS
```

v2.3 增加：

```text
latest.yml.sha512
```

完整校验关系：

```text
latest.yml
 ├─ version
 ├─ path
 └─ sha512
       │
       ▼
Final Signed Installer
```

必须验证：

```text
latest.yml.sha512
==
Base64(SHA512(final signed installer))
```

---

# 14. SIGN-01 — Signing 顺序固定

正式流水线必须固定：

```text
electron-builder
        ↓
Unsigned Installer
        ↓
Authenticode Signing
        ↓
Signed Installer
        ↓
Generate latest.yml
        ↓
Generate blockmap
        ↓
Integrity Validation
        ↓
Publish
```

禁止：

```text
generate latest.yml
        ↓
sign exe
```

因为会导致：

```text
metadata hash != final installer
```

---

# 15. Release Manifest v1

继续使用：

```text
smc.work.release.v1
```

建议正式 Manifest：

```json
{
  "schemaVersion": "smc.work.release.v1",
  "version": "0.7.5",
  "channel": "stable",
  "platform": "win32",
  "arch": "x64",
  "installer": "smc-copilot-0.7.5-setup.exe",
  "sha256": "...",
  "updateUrl": "https://release.superic.com/work/stable/",
  "publisher": "...",
  "createdAt": "..."
}
```

Release Guard 必须同时检查：

```text
Manifest
latest.yml
installer
blockmap
SHA256SUMS
Authenticode
```

---

# 16. CUTOVER-01 — Update Feed 切换

当前目标：

```text
https://release.superic.com/work/stable/
```

发布目录：

```text
/work/
├── releases/
│   ├── 0.7.5/
│   └── 0.7.6/
│
└── stable/
    ├── latest.yml
    ├── smc-copilot-x.x.x-setup.exe
    └── *.blockmap
```

其中：

```text
releases/<version>
```

必须不可变。

`stable` 只是当前发布指针。

---

## 16.1 Legacy GitHub Feed

旧版客户端如果仍指向 GitHub：

```text
Legacy Client
     ↓
GitHub Provider
```

它无法自动知道：

```text
release.superic.com
```

因此存在两种路径。

### Bridge Release

```text
Legacy 0.7.4
   ↓ GitHub
Bridge
   ↓
Internal Generic Provider
   ↓
New Releases
```

优先用于能够保持升级兼容的旧客户端。

### Bootstrap Migration

对于身份变化导致无法可靠原地升级的客户端：

```text
Enterprise Deployment
        ↓
Signed Bootstrap Installer
        ↓
Detect Legacy Client
        ↓
Migrate
        ↓
Install SMC-Copilot
```

IDM-01 必须在 Stable 发布前明确选择其中一种。

---

# 17. Work CI

新增：

```text
.github/workflows/work-ci.yml
```

触发：

```text
apps/work/**
infra/release-server/**
.github/workflows/work-*.yml
```

执行：

```text
npm ci
   ↓
npm run guard
   ↓
npm run typecheck
   ↓
npm test
   ↓
build
```

CI 负责代码质量。

不负责生产证书发布。

---

# 18. Windows Release Workflow

新增：

```text
.github/workflows/work-release.yml
```

或者将 Work 作为独立 Component 加入现有 Release Workflow。

推荐独立 Workflow，避免与：

```text
desktop
runtime
contracts
```

发布生命周期耦合。

流水线：

```text
Version Validation
       ↓
npm ci
       ↓
guard
       ↓
typecheck
       ↓
test
       ↓
build:win
       ↓
sign
       ↓
validate signature
       ↓
validate latest.yml
       ↓
validate sha512
       ↓
validate blockmap
       ↓
validate SHA256SUMS
       ↓
generate release manifest
       ↓
immutable publish
       ↓
stable promotion
```

Stable Promotion 必须保留人工 Gate。

---

# 19. Release Server Production Gate

现有：

```text
infra/release-server/
```

继续沿用，不再重新设计。

v2.3 只补齐生产验收：

```text
DNS
TLS
Certificate Chain
Nginx
MIME
Cache Policy
latest.yml
blockmap
Range Request
Artifact Permissions
SSH Publish Permission
Rollback
```

必须真实测试：

```text
https://release.superic.com/work/stable/latest.yml
```

通过公司实际：

```text
DNS
Proxy
Firewall
TLS Inspection
```

环境访问。

---

# 20. Stable 指针与回滚

版本目录不可覆盖：

```text
/releases/0.7.5
/releases/0.7.6
```

回滚只能：

```text
stable
0.7.6 → 0.7.5
```

但必须明确：

> Stable Feed 回滚只能阻止后续客户端升级，不能使已经升级到 0.7.6 的客户端自动降级到 0.7.5。

因此严重故障的标准策略应为：

```text
0.7.6 faulty
     ↓
stop promotion
     ↓
0.7.7 hotfix
```

而不是客户端 Downgrade。

---

# 21. 自动化测试

## Unit Test

补充：

```text
identity migration
registry resolution
update error normalization
release manifest validation
sha512 validation
version validation
```

---

## Integration Test

必须覆盖：

| Case                    | Expected                  |
| ----------------------- | ------------------------- |
| Current < Server        | available                 |
| Current = Server        | uptodate                  |
| Current > Server        | 不降级                       |
| Feed 404                | error                     |
| Offline                 | error                     |
| invalid latest.yml      | `UPDATE_METADATA_INVALID` |
| corrupted installer     | 下载/完整性失败                  |
| invalid signature       | 安装拒绝                      |
| Download → Later → Quit | 不自动安装                     |
| Download → Install      | 安装                        |
| concurrent check        | 单请求                       |
| concurrent download     | 单请求                       |

---

# 22. Windows 实机验收矩阵

最低必须建立：

```text
Windows 10 x64
Windows 11 x64
```

分别执行：

### Scenario A

```text
Clean Install N
     ↓
Launch
     ↓
Update N+1
```

### Scenario B

```text
Legacy Install
     ↓
Migration
     ↓
New App
```

### Scenario C

```text
Custom Install Directory
     ↓
Upgrade
```

### Scenario D

```text
Download Update
     ↓
Later
     ↓
Normal Quit
```

结果必须：

```text
NOT installed
```

### Scenario E

```text
Download Update
     ↓
Install Now
```

结果：

```text
close
install
restart
new version
```

---

# 23. v2.3 工程实施阶段

## Phase 0 — Release Baseline

完成：

* 确认 0.7.4 是否历史分发；
* 冻结旧 Artifact；
* 确认 IDM-01；
* 确认 CUTOVER-01；
* 确认 Publisher；
* 确认正式 Feed URL。

**Exit Gate：**

所有决定形成 Release Decision Record。

---

## Phase 1 — Installer Migration

修改：

```text
electron-builder.yml
installer.nsh
src/main/migration/**
```

完成：

* old installation detection；
* Registry 32/64；
* userData migration；
* install scope migration；
* custom install path preservation。

---

## Phase 2 — Updater Contract Closure

修改：

```text
src/main/app/updater.ts
src/shared/app-update.ts
src/main/app/update-error.ts
preload updater bridge
```

完成：

* Legacy IPC 删除；
* Legacy Events 删除；
* Auto Upgrade preference 删除；
* Error Contract 落地。

---

## Phase 3 — Release Gate

修改：

```text
scripts/lib/work-release-guard.mjs
scripts/validate-work-release.ps1
scripts/build-work-release.ps1
scripts/publish-work-release.ps1
```

增加：

```text
sha512
signature
publisher
metadata
blockmap
manifest
artifact immutable check
```

---

## Phase 4 — CI/CD

增加：

```text
.github/workflows/work-ci.yml
.github/workflows/work-release.yml
```

完成：

```text
CI
Build
Sign
Validate
Publish
Promote
```

职责分离。

---

## Phase 5 — Production Infrastructure

完成：

```text
DNS
TLS
Nginx
Permissions
Signing Certificate
Release Account
Stable Directory
Immutable Releases
```

---

## Phase 6 — Live Upgrade Verification

建立两个真实版本：

```text
N
↓
N+1
```

使用最终：

```text
signed installer
real HTTPS
real latest.yml
real blockmap
production updater configuration
```

完成 Win10 / Win11 升级。

---

# 24. Release Gate

任何 Stable Release 必须执行：

```text
npm ci
✓

guard
✓

typecheck
✓

test
✓

Windows NSIS x64
✓

Authenticode Valid
✓

Publisher Valid
✓

latest.yml Valid
✓

latest.yml SHA512 Valid
✓

blockmap Valid
✓

SHA256SUMS Valid
✓

Release Manifest Valid
✓

Installed Smoke Test
✓

N → N+1 Live Update
✓

userData Continuity
✓

Later → Quit → NOT Install
✓
```

任一失败：

```text
Release Blocked
```

---

# 25. v2.3 Acceptance Criteria

### AC-01

Updater 只在：

```text
Windows
+
Packaged
+
NSIS
+
Non Portable
```

环境启用。

### AC-02

用户点击 Check 不自动 Download。

### AC-03

Download 完成不自动 Install。

### AC-04

普通 Quit 不安装 Ready Update。

### AC-05

只有：

```text
Install Now
```

调用 `quitAndInstall()`。

### AC-06

Main Process 是 Update State 唯一事实源。

### AC-07

Renderer 不维护第二套 Update State。

### AC-08

Legacy Update IPC 全部移除。

### AC-09

Legacy Update Events 全部移除。

### AC-10

Internal Generic Feed 为唯一正式 Feed。

### AC-11

Release Version 不允许 Artifact 覆盖。

### AC-12

`latest.yml.sha512` 与最终签名 Installer 完全一致。

### AC-13

Authenticode Publisher 校验通过。

### AC-14

旧客户端迁移后不存在 Zombie Dual Installation。

### AC-15

旧 userData 无损。

### AC-16

自定义安装目录升级后保持。

### AC-17

per-user → per-machine 迁移验证成功。

### AC-18

Win10 N→N+1 成功。

### AC-19

Win11 N→N+1 成功。

### AC-20

真实企业网络环境能够访问 Update Feed。

---

# 26. Definition of Done

PRD v2.3 只有同时满足以下条件才允许关闭：

```text
[ ] 0.7.4 Release Baseline 已确认
[ ] IDM-01 已签字关闭
[ ] CUTOVER-01 已签字关闭

[ ] Installer Registry 32/64 已兼容
[ ] Legacy Installation Detection 已实现
[ ] userData Migration 已实现
[ ] InstallLocation Continuity 已验证

[ ] Legacy Updater IPC 已删除
[ ] Legacy Update Event 已删除
[ ] Legacy Auto Upgrade Preference 已删除

[ ] Error Contract 已完整实现

[ ] latest.yml SHA512 Gate 已实现
[ ] Authenticode Gate 已实现
[ ] Publisher Gate 已实现
[ ] Release Manifest Gate 已实现

[ ] Work CI 已建立
[ ] Work Release Workflow 已建立

[ ] Production DNS/TLS 已部署
[ ] Internal Generic Feed 已验证

[ ] Windows 10 N→N+1 已通过
[ ] Windows 11 N→N+1 已通过

[ ] userData Continuity 已通过
[ ] Custom Install Directory 已通过
[ ] Later + Quit 不安装已通过

[ ] Stable Release 经过人工授权
```

---

# 27. v2.3 最终代码结构

完成后建议形成：

```text
apps/work/
├── build/
│   └── installer.nsh
│
├── scripts/
│   ├── build-work-release.ps1
│   ├── validate-work-release.ps1
│   ├── publish-work-release.ps1
│   └── lib/
│       └── work-release-guard.mjs
│
├── src/
│   ├── main/
│   │   ├── app/
│   │   │   ├── updater.ts
│   │   │   └── update-error.ts
│   │   │
│   │   └── migration/
│   │       ├── identity-migration.ts
│   │       ├── legacy-installation.ts
│   │       ├── migration-state.ts
│   │       └── userdata-migration.ts
│   │
│   ├── preload/
│   │
│   ├── shared/
│   │   └── app-update.ts
│   │
│   └── renderer/
│       └── src/update/
│
└── electron-builder.yml

.github/workflows/
├── work-ci.yml
└── work-release.yml

infra/release-server/
├── nginx/
├── scripts/
├── certs/
└── docker-compose.yml
```

---

# 28. v2.3 完成后的状态定义

当前 `apps/work` 更准确的工程状态是：

```text
Updater Implementation
        COMPLETE

Release Infrastructure
        MOSTLY COMPLETE

Production Migration
        INCOMPLETE

Production Verification
        INCOMPLETE
```

PRD v2.3 的目标是将其推进为：

```text
Implementation Complete
        +
Migration Proven
        +
Release Gate Proven
        +
Windows Live Upgrade Proven
        =
Production Ready
```

因此 v2.3 后续开发重点已经不应继续投入到 Updater UI 和状态机，而应严格集中于 **Installer Migration、Release Integrity、Legacy Contract Cleanup、CI/CD、Internal Feed Cutover 和真实 Windows 升级验证**。这也是当前 `apps/work` 从“功能已实现”进入“可正式部署”的关键工程边界。
