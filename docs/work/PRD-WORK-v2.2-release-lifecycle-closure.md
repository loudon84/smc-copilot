# PRD-WORK-v2.2 — SMC-Copilot Product Identity & Release Lifecycle Closure

**项目**：SMC Copilot
**模块**：`apps/work`
**PRD 版本**：Work v2.2
**源码基线**：`work/prd-v2.0`
**目标产品名称**：**SMC-Copilot**
**目标平台**：Windows 10/11 AMD64
**更新体系**：electron-updater + Internal Generic Release Server
**正式 Release Host**：`release.superic.com`
**目标**：完成 **打包 → 首次安装 → 发版 → 版本发现 → 下载 → 安装升级** 的完整生产闭环

---

## 1. v2.2 定位

Work v2.0 已经完成客户端 Updater Core 的核心重构，包括统一 `AppUpdateState`、Main Process Snapshot、`revision`、启动/周期检查、手工下载和手工安装。

全局 `AppUpdateProvider` 已经建立，并挂载到应用全局生命周期，不再依赖 Settings 打开后才能接收更新状态。

Work v2.1 已经建立 Release Server、Windows Release Build、Artifact Validation、Publish、Immutable Release 和 Stable 原子切换的主体代码。当前已有 Nginx Docker 服务、只读 Release Volume、Promotion 和 Rollback Script。

**Work v2.2 不再扩展新的架构层。**

本阶段解决：

```text
① 统一 SMC-Copilot 产品身份
② 修复现有 Release Pipeline 阻断问题
③ 正式接入 release.superic.com
④ 收紧 Production Signing / Feed / Publish Gate
⑤ 补齐用户更新提示
⑥ 完成真实 Windows Packaged Upgrade 验收
```

---

# 2. 产品命名规范

本版本开始，严格区分：

```text
工程模块名
≠
用户产品名
```

## 2.1 固定命名

| 对象                  | 固定值                                            |
| ------------------- | ---------------------------------------------- |
| Monorepo 模块         | `apps/work`                                    |
| PRD 名称              | Work                                           |
| 产品名称                | **SMC-Copilot**                                |
| Windows App ID      | **`com.smc.copilot`**                          |
| Executable          | **`smc-copilot.exe`**                          |
| Package Name        | **`smc-copilot`**                              |
| Installer           | **`smc-copilot-{version}-setup.exe`**          |
| Installer blockmap  | **`smc-copilot-{version}-setup.exe.blockmap`** |
| 默认安装目录              | **`D:\Programs\SMC\Copilot`**                  |
| Release Host        | **`release.superic.com`**                      |
| Update Feed         | **`https://release.superic.com/work/stable/`** |
| Release Env         | `SMC_WORK_UPDATE_URL`                          |
| Server Release Root | `/data/smc-release/work`                       |
| Stable Channel      | `/work/stable/`                                |
| Immutable Archive   | `/work/releases/{version}/`                    |

其中：

```text
apps/work
/work/stable/
SMC_WORK_UPDATE_URL
```

继续作为**内部工程术语**保留。

不得为了产品改名而改为：

```text
apps/copilot
/copilot/stable/
SMC_COPILOT_UPDATE_URL
```

本阶段不做这种无收益重构。

---

# 3. 当前源码与目标身份的差异

当前 `electron-builder.yml` 已经从旧 Hermes Identity 改为：

```yaml
appId: com.smc.work
productName: SMC Work
executableName: smc-work
```

并已经切换到 Generic Provider。

Work v2.2 必须进一步改成：

```yaml
appId: com.smc.copilot
productName: SMC-Copilot

win:
  executableName: smc-copilot
```

当前 Main Process 仍然存在：

```ts
electronApp.setAppUserModelId("com.hermes.desktop");
```

必须同步统一为：

```ts
electronApp.setAppUserModelId(
  "com.smc.copilot"
);
```

当前 `package.json` 也仍残留：

```json
"name": "copilot-desktop",
"description": "Copilot Desktop ...",
"author": "fathah",
"homepage": "https://github.com/fathah/hermes-desktop"
```

正式 Release 前必须清理。

---

# 4. 目标生命周期

最终唯一生产链路：

```text
apps/work
   │
   ▼
package.json version
   │
   ▼
build-work-release.ps1
   │
   ├── npm ci
   ├── guard
   ├── typecheck
   ├── tests
   ├── electron-builder
   ├── Authenticode
   └── Artifact Validation
   │
   ▼
smc-copilot-x.y.z-setup.exe
latest.yml
blockmap
release-manifest.json
   │
   ▼
首次安装
D:\Programs\SMC\Copilot
   │
   ▼
publish-work-release.ps1
   │
   ▼
release.superic.com
   │
   ▼
staging
   │
   ▼
releases/x.y.z
   │
   ▼
stable → releases/x.y.z
   │
   ▼
SMC-Copilot 客户端
   │
   ▼
发现更新
   │
   ▼
用户确认下载
   │
   ▼
用户确认安装
   │
   ▼
新版 SMC-Copilot
```

---

# 5. FR-01 — Product Identity 统一

修改：

```text
apps/work/electron-builder.yml
```

目标：

```yaml
appId: com.smc.copilot
productName: SMC-Copilot

win:
  executableName: smc-copilot
  target:
    - nsis

nsis:
  artifactName: smc-copilot-${version}-setup.${ext}
  shortcutName: SMC-Copilot
  uninstallDisplayName: SMC-Copilot

  oneClick: false
  perMachine: true
  allowElevation: true
  allowToChangeInstallationDirectory: true

  createDesktopShortcut: always
  createStartMenuShortcut: true

publish:
  provider: generic
  url: ${env.SMC_WORK_UPDATE_URL}
  channel: latest
```

正式 Windows 构建禁止重新加入：

```text
portable
```

---

# 6. FR-02 — Runtime Windows Identity

修改：

```text
apps/work/src/main/app/start.ts
```

从：

```ts
electronApp.setAppUserModelId(
  "com.hermes.desktop"
);
```

改为：

```ts
electronApp.setAppUserModelId(
  "com.smc.copilot"
);
```

确保：

```text
Installer Identity
Shortcut Identity
Taskbar Identity
Runtime Identity
```

全部一致。

---

# 7. FR-03 — Package Metadata

修改：

```text
apps/work/package.json
```

目标：

```json
{
  "name": "smc-copilot",
  "version": "0.7.4",
  "description": "SMC-Copilot Desktop",
  "author": "SMC"
}
```

`homepage` 如果暂时不存在正式 SMC 产品主页，可以删除旧 upstream homepage。

不得继续在正式安装包 metadata 中暴露：

```text
fathah
hermes-desktop
Copilot Desktop
Nous Research
```

等上游产品身份。

---

# 8. FR-04 — Installer Artifact 全部改名

当前 Release Script 使用：

```text
smc-work-{version}-setup.exe
```

例如 release guard 当前直接生成该名称。

全部改为：

```text
smc-copilot-{version}-setup.exe
smc-copilot-{version}-setup.exe.blockmap
```

必须同步修改：

```text
electron-builder.yml

build-work-release.ps1
validate-work-release.ps1
publish-work-release.ps1

scripts/lib/work-release-guard.mjs

infra/release-server/scripts/
promote-work-release.sh

rollback / validation logic

所有 release tests
```

---

# 9. FR-05 — 默认安装目录

企业 Windows 安装目标：

```text
D:\Programs\SMC\Copilot
```

当前：

```yaml
allowToChangeInstallationDirectory: true
```

只解决“允许用户选目录”，并没有固定默认位置。

需要增加：

```text
apps/work/build/installer.nsh
```

由 NSIS 初始化默认：

```text
D:\Programs\SMC\Copilot
```

但必须同时处理：

```text
D: 不存在
D: 空间不足
旧版本已有安装目录
升级不得跳到新目录
```

推荐逻辑：

```text
已有安装
    ↓
继续使用原 InstallLocation

无已有安装
    ↓
D: 存在
    ↓
D:\Programs\SMC\Copilot

D: 不存在
    ↓
%ProgramFiles%\SMC\Copilot
```

这样不会因为某台电脑没有 D 盘而导致安装失败。

---

# 10. FR-06 — 修复 PowerShell Release Script

当前：

```text
validate-work-release.ps1
publish-work-release.ps1
```

存在：

```powershell
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

param(...)
```

结构。

必须改成：

```powershell
param(
    ...
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
```

该问题属于：

```text
P0 / RELEASE_BLOCKER
```

---

# 11. FR-07 — Release Script Integration Test

现有测试主要检查：

```text
脚本文本
Node Guard
静态配置
```

例如 Release Script Test 当前主要验证 helper 与 artifact 规则。

新增真正执行 PowerShell 的集成测试：

```text
tests/release-powershell-integration.test.ts
```

覆盖：

```text
validate-work-release.ps1 -- valid

validate-work-release.ps1 -- invalid version

validate-work-release.ps1 -- missing artifact

publish-work-release.ps1 -- local staging

publish-work-release.ps1 -- invalid config
```

要求：

```text
ExitCode
```

成为测试条件，而不是源码字符串匹配。

---

# 12. FR-08 — Production Signing Gate

当前 Build 已经执行：

```powershell
Get-AuthenticodeSignature
```

但仍允许：

```text
SMC_WORK_RELEASE_ALLOW_UNSIGNED=1
```

绕过。

该变量只允许：

```text
development / CI fixture
```

正式 Publish 必须：

```text
ALLOW_UNSIGNED
    ↓
立即拒绝
```

增加：

```powershell
if (
  $env:SMC_WORK_RELEASE_ALLOW_UNSIGNED
  -eq "1"
) {
  throw "Unsigned release cannot be published"
}
```

并要求：

```json
"signed": true
```

否则：

```text
PUBLISH_DENIED
```

---

# 13. FR-09 — Signer Identity Verification

不能只验证：

```text
Authenticode = Valid
```

还必须验证：

```text
Publisher == approved SMC publisher
```

增加：

```text
SMC_WORK_EXPECTED_PUBLISHER
```

例如：

```powershell
$signature =
  Get-AuthenticodeSignature $installer

if (
  $signature.SignerCertificate.Subject
  -notmatch $env:SMC_WORK_EXPECTED_PUBLISHER
) {
  throw "Unexpected release publisher"
}
```

正式证书申请完成后锁定真实 Publisher Subject。

---

# 14. FR-10 — Release Feed 固定

生产唯一 Feed：

```text
https://release.superic.com/work/stable/
```

构建：

```powershell
$env:SMC_WORK_UPDATE_URL =
  "https://release.superic.com/work/stable/"
```

当前 Guard 只要求 HTTPS + `/work/stable/`，其他域名仍可能通过。

Work v2.2 增加：

```text
Production Host Gate
```

要求：

```text
hostname
=
release.superic.com
```

Production Build 不允许：

```text
test.xxx
localhost
IP address
其他正式域名
```

---

# 15. FR-11 — Packaged Feed Verification

Build 完成以后，不能只检查：

```text
electron-builder.yml
```

必须检查**最终安装包实际携带的 feed**。

Release Gate 必须证明 packaged：

```text
app-update.yml
```

中包含：

```yaml
provider: generic
url: https://release.superic.com/work/stable/
channel: latest
```

否则 Build Fail。

解决：

```text
BUILD_CONFIG
      ↓
PACKAGED_CONFIG
      ↓
VERIFY
```

避免：

```text
源码配置正确
但 Build 环境变量错误
```

导致已经安装到客户机才发现无法升级。

---

# 16. FR-12 — Release Server Production Host

当前 Nginx：

```nginx
server_name _;
```

生产改成：

```nginx
server_name release.superic.com;
```

正式服务：

```text
https://release.superic.com
```

健康：

```text
https://release.superic.com/healthz
```

Feed：

```text
https://release.superic.com/work/stable/latest.yml
```

---

# 17. FR-13 — TLS

正式证书必须：

```text
SAN:
DNS:release.superic.com
```

Windows 10/11 必须能够正常验证完整证书链。

生产严禁：

```text
self-signed certificate
--insecure
skip certificate verify
```

仓库中的 Development Certificate Script 继续仅作为本地测试用途；现有 README 已经明确 dev cert 不可用于生产。

---

# 18. FR-14 — Docker Healthcheck

当前 Compose 已建立：

```text
smc-release-server
nginx:1.26.3-alpine
443:443
read-only release volume
```

增加 Docker：

```yaml
healthcheck:
```

目标：

```text
docker compose ps
```

直接得到：

```text
healthy
```

而不是只判断 Container Process 存活。

---

# 19. FR-15 — Nginx Method Boundary

当前 Release Artifact Location 已限制：

```text
GET
HEAD
```

`/healthz` 同样统一：

```nginx
limit_except GET HEAD {
    deny all;
}
```

最终 Nginx 不接受：

```text
POST
PUT
PATCH
DELETE
```

任何发布操作。

发布始终使用：

```text
SSH / SCP
```

---

# 20. FR-16 — Server-side Promotion Validation

当前 Promote 已经执行：

```text
required files
sha256sum
immutable version
stable atomic swap
```

Work v2.2 再增加：

```text
latest.yml.version
=
VERSION

latest.yml.path
=
smc-copilot-${VERSION}-setup.exe

manifest.version
=
VERSION

manifest.updateUrl
=
https://release.superic.com/work/stable/

manifest.signed
=
true
```

验证。

客户端验证 + Build 机验证不能替代 Server Final Gate。

---

# 21. FR-17 — Post Publish Verification

当前 Publish 完成：

```text
scp
→ promote
→ Published
```

即结束。

v2.2 必须增加：

```text
POST_PUBLISH_VERIFY
```

发版：

```text
Promote 0.7.5
      ↓
GET release.superic.com
/work/stable/latest.yml
      ↓
version == 0.7.5
      ↓
HEAD installer
      ↓
200 + Content-Length
      ↓
VERIFY
      ↓
PUBLISH_SUCCESS
```

任何步骤失败：

```text
PUBLISH_NOT_CONFIRMED
```

不得输出正式发布成功。

---

# 22. FR-18 — Rollback Validation

当前 Rollback 只确认目标版本目录存在就切换 symlink。

v2.2 在切换前增加：

```text
SHA256
manifest
latest.yml
required artifacts
```

校验。

Rollback 语义固定：

```text
Stable Rollback
=
阻止还没升级的客户端继续获取坏版本
```

不是：

```text
已升级客户端自动降级
```

线上问题优先：

```text
0.7.5 faulty
       ↓
0.7.6 forward fix
```

---

# 23. FR-19 — Release Notes Pipeline

客户端 Contract 已经包含：

```text
releaseNotes
```

但现有 Build Script 没有正式 Release Notes 输入。

新增：

```text
apps/work/release-notes/
```

例如：

```text
release-notes/
├── 0.7.5.md
└── 0.7.6.md
```

Build：

```powershell
-ReleaseNotesPath
```

发布必须存在对应版本 Release Notes。

内容最终进入用户看到的：

```text
当前版本
新版本
发布日期
更新内容
```

---

# 24. FR-20 — Update Available Dialog

当前已经能够通过 Sidebar Update Button：

```text
available
downloading
ready
error
```

向用户显示状态。

并且按钮已经能调用：

```text
downloadUpdate
installUpdate
```

但是尚没有完整的新版本主动提示。

新增：

```text
src/renderer/src/update/
├── UpdateAvailableDialog.tsx
├── UpdateDownloadStatus.tsx
└── UpdateReadyDialog.tsx
```

---

# 25. 新版本提示

当：

```text
status = available
```

弹出：

```text
┌─────────────────────────────────────┐
│ SMC-Copilot 有新版本               │
│                                     │
│ 当前版本：0.7.4                    │
│ 最新版本：0.7.5                    │
│                                     │
│ 更新内容                            │
│ · ...                               │
│ · ...                               │
│                                     │
│             [稍后] [下载更新]       │
└─────────────────────────────────────┘
```

点击：

```text
稍后
```

不得：

```text
下载
关闭更新检查
改变 Main Snapshot
```

只关闭当前提示。

Sidebar Update Indicator 继续保留。

---

# 26. 下载完成提示

状态：

```text
ready
```

弹：

```text
┌──────────────────────────────────────┐
│ SMC-Copilot 0.7.5 已下载完成        │
│                                      │
│ 安装更新需要重新启动 SMC-Copilot。  │
│                                      │
│                  [稍后] [立即安装]   │
└──────────────────────────────────────┘
```

当前 Main 已经固定：

```text
autoDownload = false
autoInstallOnAppQuit = false
```

因此不会因为用户普通退出而偷偷安装。

---

# 27. FR-21 — First Install Validation

首次安装测试环境：

```text
Windows 10 AMD64
```

验证：

```text
Programs & Features
    SMC-Copilot

Executable
    smc-copilot.exe

Install Path
    D:\Programs\SMC\Copilot

AppUserModelId
    com.smc.copilot

Desktop Shortcut
    SMC-Copilot

Start Menu
    SMC-Copilot
```

还必须验证：

```text
Work 可以启动
Hermes Gateway 可以连接
Chat 可以进入
Settings 可以进入
Updater 不报初始化错误
```

---

# 28. FR-22 — Packaged Upgrade E2E

这是 Work v2.2 最终关键 Gate。

不允许只测试：

```text
npm run dev
```

必须：

### Release A

```text
SMC-Copilot 0.7.4
```

安装至 Windows 10。

### Release B

修改：

```json
"version": "0.7.5"
```

执行：

```text
build
validate
publish
```

然后客户机：

```text
SMC-Copilot 0.7.4
       ↓
GET latest.yml
       ↓
发现 0.7.5
       ↓
Update Dialog
       ↓
用户点击下载
       ↓
Installer GET
       ↓
READY
       ↓
用户点击安装
       ↓
quitAndInstall
       ↓
Restart
       ↓
SMC-Copilot 0.7.5
```

---

# 29. Upgrade Data Integrity

升级后不得丢失：

```text
登录状态
用户 Settings
Chat 数据
本地数据库
应用配置
Hermes Connection Config
Profile 状态
```

尤其由于：

```text
productName
appId
```

正在发生正式身份切换，必须对：

```text
app.getPath("userData")
```

进行单独验证。

如发现产品改名导致 userData 路径发生变化，则必须增加：

```text
Legacy UserData Migration
```

不能接受“升级成功但像全新安装”的结果。

---

# 30. 代码修改矩阵

| 文件/目录                                | v2.2 工作                                       |
| ------------------------------------ | --------------------------------------------- |
| `electron-builder.yml`               | `com.smc.copilot`、SMC-Copilot、artifact rename |
| `package.json`                       | `smc-copilot` metadata                        |
| `package-lock.json`                  | package identity 同步                           |
| `src/main/app/start.ts`              | AppUserModelId                                |
| `build/installer.nsh`                | 默认安装目录                                        |
| `scripts/lib/work-release-guard.mjs` | smc-copilot artifact + domain gate            |
| `build-work-release.ps1`             | Feed Verification / Release Notes             |
| `validate-work-release.ps1`          | param 修复 / signer / manifest gate             |
| `publish-work-release.ps1`           | param 修复 / unsigned deny / post verify        |
| `promote-work-release.sh`            | manifest/latest server validation             |
| `rollback-work-stable.sh`            | rollback validation                           |
| `docker-compose.yml`                 | healthcheck                                   |
| `nginx/default.conf`                 | release.superic.com + health method           |
| `update/*`                           | Available / Download / Ready dialogs          |
| Release Tests                        | artifact rename + production host             |
| PowerShell Integration Tests         | 新增                                            |
| Packaged E2E                         | 新增                                            |

---

# 31. 实施顺序

### Phase 1 — Identity

完成：

```text
SMC-Copilot
com.smc.copilot
smc-copilot.exe
smc-copilot-x.y.z-setup.exe
```

以及安装目录。

### Phase 2 — Release Pipeline Repair

完成：

```text
PowerShell param
Unsigned Block
Signer Gate
Artifact Rename
Feed Verification
```

### Phase 3 — Production Release Server

完成：

```text
release.superic.com
TLS
Docker healthcheck
Nginx restrictions
Server-side validation
```

### Phase 4 — Publish Closure

完成：

```text
Build
Validate
Upload
Promote
Post Publish Verify
Rollback Verify
```

### Phase 5 — UX Closure

完成：

```text
Release Notes
UpdateAvailableDialog
UpdateDownloadStatus
UpdateReadyDialog
```

### Phase 6 — Windows Live Test

完成：

```text
Fresh Install
0.7.4 → 0.7.5
Data Continuity
Release Server Failure Cases
```

---

# 32. P0 / P1 优先级

### P0 — 不完成不得进入生产发版

1. `com.smc.copilot` 全身份统一。
2. `smc-copilot-*` Artifact 全链统一。
3. PowerShell `param()` 修复。
4. Production unsigned publish 禁止。
5. Signer Identity Gate。
6. `release.superic.com` 正式 TLS。
7. Packaged `app-update.yml` Feed Verification。
8. Post Publish Verify。
9. Windows 真实 `N → N+1` Upgrade PASS。
10. userData Continuity PASS。

### P1 — 完成后形成完整产品体验

1. 默认 `D:\Programs\SMC\Copilot`。
2. Release Notes Pipeline。
3. Update Available Dialog。
4. Download Status。
5. Ready / Restart Dialog。
6. Docker Healthcheck。
7. Rollback Deep Validation。

---

# 33. Definition of Done

Work v2.2 结束时必须满足：

```text
Internal Module
=
apps/work

Product
=
SMC-Copilot

Windows App ID
=
com.smc.copilot

Executable
=
smc-copilot.exe

Installer
=
smc-copilot-{version}-setup.exe

Install Path
=
D:\Programs\SMC\Copilot
或无 D 盘时受控 fallback

Release Host
=
release.superic.com

Update Feed
=
https://release.superic.com/work/stable/

Updater
=
electron-updater

Release Server
=
Docker + Nginx

Release Backend API
=
None

Database
=
None

Release Archive
=
Immutable

Stable
=
Atomic

Production Signing
=
Required

Auto Check
=
Enabled

Auto Download
=
Disabled

Auto Install
=
Disabled

Download
=
Explicit User Action

Install
=
Explicit User Action

Packaged Live Upgrade
=
PASS

User Data Continuity
=
PASS
```

最终交付链固定为：

```text
SMC-Copilot Source
      ↓
Windows Signed Build
      ↓
smc-copilot-x.y.z-setup.exe
      ↓
Windows Initial Install
      ↓
release.superic.com
      ↓
Immutable Release
      ↓
Stable Promotion
      ↓
electron-updater
      ↓
新版本提示
      ↓
用户下载
      ↓
用户安装
      ↓
SMC-Copilot Upgrade
```

**v2.2 完成后，`apps/work` 才从“具备更新代码”正式进入“SMC-Copilot 可生产发布、可安装、可持续升级”的产品交付状态。**
