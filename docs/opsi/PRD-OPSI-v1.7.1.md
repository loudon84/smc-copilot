# SMC Copilot v1.7.1 Release Builder 方案 PRD

**Hermes Managed Offline Bundle + Work Installer + OPSI Product Release**

* 版本：`v1.7.1`
* 前置版本：`PRD-OPSI-v1.7`
* 基线分支：`opsi/prd-v1.0`
* OPSI Product：`smc-hermes-agent 1.7.1-1`
* Runtime Contract：`smc.opsi.runtime-artifact.v3`
* Product Release Contract：`smc.opsi.product-release.v1`
* 新增 Runtime Build Contract：`smc.hermes.runtime-build.v1`
* 新增 Client Release Contract：`smc.client-release.v1`
* 当前目标平台：`Windows x64`
* 状态：Development Ready

---

# 1. 产品定位

v1.7.1 建设统一客户端 Release Builder，完成以下发布链路：

```text
smc-copilot Git
      +
hermes-agent Git
      ↓
Release Builder
      ↓
┌─────────────────────────────────────┐
│ Work Windows Installer              │
│ Hermes Managed Offline Bundle       │
│ Runtime Artifact v3                 │
│ Signed Controller Bundle            │
│ Real OPSI Product                   │
│ OPSI Client Installer               │
│ Client Release Manifest             │
└─────────────────────────────────────┘
```

解决以下发布能力：

1. 从本地 `hermes-agent` Git Repository 构建 Hermes Release。
2. 将 Hermes 源码与依赖转换为可离线安装的 Windows Runtime Artifact。
3. 构建 Work Windows 安装程序。
4. 构建真实 OPSI `.opsi` Product。
5. 纳入 OPSI Client 官方安装程序。
6. 通过统一命令生成完整客户端发布包。
7. 对所有发布 Artifact 建立版本、Hash、签名和 Source Revision 追踪。

---

# 2. 版本边界

以下版本必须独立管理：

```text
Work Desktop Version
Hermes Agent Version
Hermes Runtime Profile Version
Controller Revision
OPSI Product Version
OPSI Package Version
Client Release Version
```

示例：

```text
Client Release        1.7.1
Work Desktop          0.7.4
Hermes Agent          0.20.2
Runtime Profile       smc-managed-v1
Controller Revision   2
OPSI Product           1.7.1
OPSI Package           1
```

禁止：

```text
OPSI Product Version == Hermes Version
```

的强绑定。

---

# 3. Client Runtime 基线

当前客户端统一采用：

```text
OS:
Windows 10 / Windows 11 x64

Python:
指定企业标准版本
推荐基线 Python 3.12.x

Node.js:
指定企业标准版本
推荐基线 Node.js 22.x
```

Python 和 Node.js 属于：

> **SMC Client Prerequisite**

不作为 Hermes Release Artifact 内容。

Runtime Manifest 必须声明运行要求：

```json
{
  "platform": "windows",
  "architecture": "amd64",
  "requiresPython": ">=3.12,<3.13",
  "requiresNode": ">=22,<23"
}
```

Endpoint Controller 在安装 Hermes 前必须验证环境。

---

# 4. Hermes Release Artifact 定义

v1.7.1 不直接压缩整个 `hermes-agent.git`。

构建关系：

```text
hermes-agent Git
      ↓
Source Freeze
      ↓
Hermes Wheel
      ↓
Resolve Runtime Profile
      ↓
Python Wheelhouse
      +
Node Offline Packages
      +
Dependency Locks
      +
Config Templates
      ↓
Managed Offline Bundle
```

Git Repository 仅作为：

```text
Build Source
```

不得直接作为 Release Artifact。

---

# 5. Hermes Managed Offline Bundle

正式 Artifact：

```text
hermes-<version>-windows-amd64.zip
```

例如：

```text
hermes-0.20.2-windows-amd64.zip
```

目录结构：

```text
hermes-0.20.2-windows-amd64.zip
│
├── app/
│   └── hermes_agent-0.20.2-*.whl
│
├── python/
│   ├── wheels/
│   │   ├── openai-*.whl
│   │   ├── pydantic-*.whl
│   │   ├── pydantic_core-*-win_amd64.whl
│   │   ├── cryptography-*-win_amd64.whl
│   │   ├── psutil-*-win_amd64.whl
│   │   ├── pywin32-*.whl
│   │   ├── pywinpty-*.whl
│   │   └── ...
│   │
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

# 6. Hermes Artifact 禁止包含内容

Release ZIP 不允许包含：

```text
python.exe
Python Runtime
Node.exe
npm.exe
开发机 .venv
开发机 node_modules
.git/
.github/
tests/
开发配置
.env
API Key
credentials
auth data
用户 config.yaml
session
memory
logs
用户 HERMES_HOME
```

Runtime、用户状态、配置必须分离。

---

# 7. Python Dependency 模型

## 7.1 Build 侧

Release Builder：

```text
pyproject.toml
+
uv.lock
+
Runtime Profile
      ↓
Resolve Windows AMD64 dependencies
      ↓
Download exact Wheels
      ↓
Python Wheelhouse
```

正式构建不得在线动态解析不固定版本。

生产 Artifact 必须记录：

```text
pyproject SHA256
uv.lock SHA256
Python ABI
Platform
Architecture
Wheel inventory
Wheel SHA256
```

---

# 8. Endpoint Python 安装模型

Hermes ZIP 不携带 `.venv`。

Endpoint Controller 安装时：

```text
Verify Python
      ↓
Create Runtime Slot
      ↓
python -m venv
      ↓
Offline install wheelhouse
      ↓
Install Hermes wheel
      ↓
CLI verification
      ↓
Activate Runtime
```

目标目录：

```text
C:\ProgramData\SMC\Hermes\runtime\versions\
    <version>-<digest>\
        venv\
```

安装只允许：

```text
--no-index
```

从 Release Artifact 内的 Wheelhouse 安装。

不得依赖：

```text
PyPI
Internet
Developer machine
Global Python packages
```

---

# 9. Python Runtime 校验

Controller 安装前必须校验：

```text
python exists
architecture = AMD64
required version satisfied
venv module available
```

例如要求：

```text
>=3.12,<3.13
```

发现：

```text
Python 3.11
Python 3.13
Python x86
Python missing
```

均不得继续安装当前 Runtime。

结果进入：

```text
PREREQUISITE_FAILED
```

并记录实际版本。

---

# 10. Node Dependency 模型

Node Runtime：

```text
node.exe
npm
npx
```

由客户端基础环境统一安装。

Hermes Artifact 不携带 Node Runtime。

---

# 11. Node Offline Dependencies

Hermes 运行所需的固定 Node Package 可以进入：

```text
node/packages/
```

仅包含 `smc-managed` Runtime Profile 明确声明的 package。

例如：

```text
@modelcontextprotocol/server-filesystem@<exact-version>
```

禁止扫描全部 Hermes Skill 并自动打包所有 npm package。

---

# 12. Node 安装模型

Endpoint Controller：

```text
Verify Node
      ↓
Verify npm
      ↓
Create managed node environment
      ↓
Install exact local packages
      ↓
Verify dependency tree
```

安装不得使用：

```text
npx -y <unversioned-package>
npm install latest
```

作为 Production 关键依赖路径。

---

# 13. Runtime Profile

新增：

```text
release/hermes-runtime-profiles.yaml
```

Contract：

```text
smc.hermes.runtime-profile.v1
```

示例：

```yaml
schema: smc.hermes.runtime-profile.v1

profiles:

  smc-managed:
    version: 1

    python:
      extras:
        - mcp
        - web
        - google

      lazyInstall:
        allowed: false

    node:
      packages:
        - name: "@modelcontextprotocol/server-filesystem"
          version: "<fixed-version>"

    gateway:
      enabled: true
      bind: "127.0.0.1"
      port: 8642
```

Release Artifact 必须绑定 exact Runtime Profile。

---

# 14. Optional Dependency 管理

Hermes Optional Dependency 不允许默认全部进入 Runtime。

只允许：

```text
Runtime Profile
```

明确声明的能力进入 Release。

例如：

```text
smc-managed
smc-finance
smc-research
```

可以生成不同 Runtime Artifact：

```text
hermes-0.20.2-windows-amd64-smc-managed.zip
hermes-0.20.2-windows-amd64-smc-finance.zip
```

当前 v1.7.1 只要求实现：

```text
smc-managed
```

---

# 15. 用户配置模型

Hermes Runtime 与 HERMES_HOME 必须分离。

程序：

```text
C:\ProgramData\SMC\Hermes\
```

用户配置：

```text
%USERPROFILE%\.hermes
```

Artifact 中只允许：

```text
config schema
managed default template
managed policy
```

不得携带用户实际配置。

---

# 16. OS / Architecture Artifact 模型

Hermes Runtime Artifact 必须针对：

```text
OS
CPU Architecture
Python ABI
```

进行构建。

当前只实现：

```text
windows-amd64
```

未来扩展时分别构建：

```text
hermes-<version>-windows-amd64.zip
hermes-<version>-windows-arm64.zip

hermes-<version>-linux-x86_64.zip
hermes-<version>-linux-aarch64.zip

hermes-<version>-macos-arm64.zip
```

不同平台不得共享包含 Native Wheel 的 Wheelhouse。

---

# 17. Hermes Source Builder

新增：

```text
tools/release/hermes/
├── build_runtime.py
├── build_wheel.py
├── build_wheelhouse.py
├── build_node_packages.py
├── runtime_profile.py
├── source_metadata.py
├── verify_runtime.py
└── build_runtime.ps1
```

职责：

```text
Hermes Git
→ validate
→ source freeze
→ build wheel
→ resolve runtime profile
→ build Python wheelhouse
→ build Node offline packages
→ create runtime metadata
→ create ZIP
→ verify
```

---

# 18. Hermes Source Freeze

Builder 必须获取：

```text
Git SHA
Git branch/tag
Hermes version
dirty state
pyproject digest
uv.lock digest
```

Production：

```text
dirty = true
```

必须失败。

Development Build 可显式：

```text
--allow-dirty
```

但：

```json
{
  "liveEligible": false
}
```

---

# 19. Hermes Version SOT

Hermes Version 从：

```text
pyproject.toml
```

获取。

如 CLI 显式指定：

```text
--hermes-version
```

必须与源码版本一致。

禁止：

```text
latest
current
main
unknown
```

作为正式 Runtime Version。

---

# 20. Runtime Build Contract

新增：

```text
smc.hermes.runtime-build.v1
```

示例：

```json
{
  "schema": "smc.hermes.runtime-build.v1",

  "version": "0.20.2",

  "platform": "windows",
  "architecture": "amd64",

  "requires": {
    "python": ">=3.12,<3.13",
    "node": ">=22,<23"
  },

  "source": {
    "revision": "abc123",
    "dirty": false,
    "pyprojectSha256": "...",
    "lockSha256": "..."
  },

  "profile": {
    "name": "smc-managed",
    "version": 1
  },

  "python": {
    "wheelCount": 80,
    "wheelhouseDigest": "..."
  },

  "node": {
    "packageCount": 1,
    "packageLockDigest": "..."
  },

  "buildId": "...",
  "liveEligible": true
}
```

---

# 21. Runtime Artifact v3

继续使用：

```text
smc.opsi.runtime-artifact.v3
```

Managed Bundle 构建完成后生成：

```text
hermes-0.20.2-windows-amd64.zip
hermes-0.20.2-windows-amd64.manifest.json
hermes-0.20.2-windows-amd64.sig
```

Runtime Manifest 保存：

```text
ZIP SHA256
full file inventory
Runtime Build Manifest digest
OS
Architecture
Python requirement
Node requirement
Runtime profile
Controller compatibility
```

---

# 22. Runtime Entrypoint

新 Runtime Artifact 不再假设 ZIP 根目录存在：

```text
hermes.exe
```

Runtime 安装完成后的 executable 为：

```text
<runtime-slot>\venv\Scripts\hermes.exe
```

因此 Runtime Contract 必须区分：

```text
package entry
runtime entrypoint
```

推荐：

```json
{
  "installType": "python-wheelhouse",

  "runtimeEntrypoint": "venv/Scripts/hermes.exe",

  "versionCommand": [
    "--version"
  ]
}
```

所有 Controller、Gateway、Health Check 必须通过：

```text
runtime/active.json
```

解析实际 executable。

---

# 23. Runtime Installation Transaction

Controller 安装流程：

```text
Verify signed Artifact
      ↓
Extract temporary staging
      ↓
Verify all files
      ↓
Verify Python/Node prerequisites
      ↓
Create immutable runtime slot
      ↓
Create venv
      ↓
Install Python wheels offline
      ↓
Install Hermes wheel
      ↓
Install Node packages
      ↓
hermes --version
      ↓
Gateway smoke
      ↓
Write runtime slot metadata
      ↓
Update active.json
```

任何阶段失败：

```text
active.json 不更新
previous runtime 保留
```

---

# 24. Runtime Slot

目录：

```text
C:\ProgramData\SMC\Hermes\runtime\
├── versions\
│   ├── 0.20.2-<digest>\
│   │   ├── venv\
│   │   ├── node\
│   │   └── runtime.json
│   │
│   └── 0.21.0-<digest>\
│
└── active.json
```

`active.json`：

```json
{
  "active": {
    "version": "0.20.2",
    "digest": "...",
    "entrypoint": "venv/Scripts/hermes.exe"
  },

  "previous": {
    "version": "0.19.0",
    "digest": "..."
  }
}
```

---

# 25. Work Builder

继续使用现有：

```bash
npx nx run work:package-win
```

输出：

```text
work/
├── copilot-desktop-<version>-setup.exe
└── copilot-desktop-<version>-portable.exe
```

v1.7.1 只负责接入 Unified Release Builder。

---

# 26. OPSI Product Builder

正式 `.opsi` 必须由 OPSI tooling 创建。

流程：

```text
Controller Bundle
+
Runtime Artifact
+
Product Release Index
      ↓
Deterministic Stage
      ↓
opsi-makepackage
      ↓
smc-hermes-agent_1.7.1-1.opsi
```

禁止：

```text
zipfile.ZipFile(... ".opsi")
```

生成 Production `.opsi`。

---

# 27. OPSI Stage

结构：

```text
stage/
├── CLIENT_DATA/
│   ├── controller/
│   ├── artifacts/
│   │   ├── hermes-*.zip
│   │   ├── hermes-*.manifest.json
│   │   └── hermes-*.sig
│   │
│   └── keys/
│       └── release-public-key.pem
│
└── OPSI/
    ├── control.toml
    └── product-release.json
```

Private Key 不允许进入 Stage。

---

# 28. OPSI Builder

新增：

```text
infra/opsi/builder/
├── Dockerfile
├── build.sh
└── README.md
```

支持：

```text
native
docker
```

两种构建模式。

Windows 开发环境默认：

```text
Docker Builder
```

Linux OPSI Builder 默认：

```text
native opsi-makepackage
```

---

# 29. OPSI Package Read-back

`.opsi` 创建后必须执行：

```text
extract
```

并比较：

```text
Product Release Index
Runtime Manifest
Runtime ZIP SHA256
Controller Manifest
Public Key
control.toml
```

任何差异：

```text
Release FAILED
```

---

# 30. OPSI Client Installer

v1.7.1 不编译 OPSI Client。

使用官方：

```text
opsi-client-agent-installer.exe
```

Unified Builder 输入：

```text
--opsi-client-installer
```

Builder 负责：

```text
copy
SHA256
version metadata
Authenticode metadata
release inventory
```

---

# 31. Unified Release Builder

新增：

```text
tools/release/client/
├── build_client_release.py
├── release_config.py
├── release_manifest.py
├── release_inventory.py
└── verify_client_release.py
```

Windows 入口：

```text
scripts/build-client-release.ps1
```

---

# 32. Release 配置

新增：

```text
release/client-release.yaml
```

示例：

```yaml
schema: smc.client-release.config.v1

release:
  version: "1.7.1"
  channel: "lab"

clientRuntime:
  platform: windows
  architecture: amd64

  python:
    version: "3.12"
    range: ">=3.12,<3.13"

  node:
    version: "22"
    range: ">=22,<23"

work:
  enabled: true

hermes:
  repo: "D:/git/hermes-agent"
  version: auto
  profile: smc-managed

opsi:
  productVersion: "1.7.1"
  packageVersion: "1"
  controllerRevision: "2"
  buildMode: docker

external:
  opsiClientInstaller: "D:/packages/opsi-client-agent-installer.exe"
```

---

# 33. Unified Build Pipeline

```text
R00 Preflight

R01 Freeze smc-copilot source

R02 Freeze hermes-agent source

R03 Build Work

R04 Build Hermes Wheel

R05 Resolve Runtime Profile

R06 Build Windows Python Wheelhouse

R07 Build Node Offline Packages

R08 Build Hermes Managed Bundle

R09 Verify Bundle

R10 Runtime Artifact v3 Sign

R11 Controller Bundle Sign

R12 Product Release Index Sign

R13 Build deterministic OPSI Stage

R14 opsi-makepackage

R15 OPSI extract/read-back

R16 Capture OPSI Client Installer

R17 Build Client Release Manifest

R18 Final Release Verification

READY
```

---

# 34. 一键构建命令

目标：

```powershell
.\scripts\build-client-release.ps1 `
  -HermesRepo "D:\git\hermes-agent" `
  -OpsiClientInstaller "D:\packages\opsi-client-agent-installer.exe" `
  -SigningKeyRef "D:\secure\smc-release.pem" `
  -Output "D:\smc-release"
```

完成：

```text
Work Build
+
Hermes Build
+
Dependency Build
+
Runtime Artifact
+
OPSI Build
+
Client Release
```

---

# 35. 支持独立阶段执行

支持：

```text
build-client-release preflight

build-client-release work

build-client-release hermes

build-client-release runtime

build-client-release opsi-stage

build-client-release opsi-package

build-client-release assemble

build-client-release verify

build-client-release all
```

用于开发、CI 和故障定位。

---

# 36. Client Release Bundle

最终输出：

```text
dist/
└── client-release/
    └── 1.7.1/
        └── <build-id>/
            │
            ├── work/
            │   ├── copilot-desktop-0.7.4-setup.exe
            │   └── copilot-desktop-0.7.4-portable.exe
            │
            ├── hermes/
            │   ├── hermes-0.20.2-windows-amd64.zip
            │   ├── hermes-0.20.2-windows-amd64.manifest.json
            │   └── hermes-0.20.2-windows-amd64.sig
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

# 37. Client Release Contract

新增：

```text
smc.client-release.v1
```

示例：

```json
{
  "schema": "smc.client-release.v1",

  "releaseVersion": "1.7.1",

  "platform": "windows",
  "architecture": "amd64",

  "requirements": {
    "python": ">=3.12,<3.13",
    "node": ">=22,<23"
  },

  "work": {
    "version": "0.7.4",
    "sha256": "..."
  },

  "hermes": {
    "version": "0.20.2",
    "profile": "smc-managed",
    "sourceRevision": "...",
    "artifactSha256": "...",
    "manifestSha256": "..."
  },

  "opsi": {
    "productVersion": "1.7.1",
    "packageVersion": "1",
    "controllerRevision": "2",
    "artifactSha256": "..."
  },

  "opsiClientAgent": {
    "sha256": "..."
  },

  "buildId": "...",
  "liveEligible": true
}
```

---

# 38. Supply Chain 约束

Production Release 必须 fail closed：

* Hermes Source dirty；
* SMC Source dirty；
* Hermes Version 不匹配；
* `uv.lock` 缺失；
* Runtime Profile 未定义；
* Python wheel 缺失；
* Native wheel 平台不匹配；
* Node Package 未固定版本；
* Runtime Artifact 文件缺失；
* Runtime Hash 不一致；
* Signature 不一致；
* Wrong Signing Key；
* ZIP Path Escape；
* Duplicate Path；
* Private Key 进入 Stage；
* Secret 进入 Release；
* `.opsi` 非 OPSI Tooling 生成；
* `.opsi` read-back 不一致。

---

# 39. Secret 约束

Release 中禁止：

```text
*.key
*.pfx
*.p12
.env
credentials
password
token
secret
private-key
```

允许：

```text
release-public-key.pem
```

Private Release Key 只能通过：

```text
--signing-key-ref
```

外部注入。

---

# 40. Automated Tests

## Hermes Builder

| ID  | 验证项                         | 结果   |
| --- | --------------------------- | ---- |
| H01 | Clean Git Source            | PASS |
| H02 | Dirty Production Source     | FAIL |
| H03 | Version Match               | PASS |
| H04 | Version Mismatch            | FAIL |
| H05 | Windows Wheelhouse Complete | PASS |
| H06 | Wrong Platform Wheel        | FAIL |
| H07 | Runtime Profile Valid       | PASS |
| H08 | Missing Python Dependency   | FAIL |
| H09 | Missing Node Dependency     | FAIL |

---

## Endpoint Runtime

| ID  | 验证项                     | 结果   |
| --- | ----------------------- | ---- |
| E01 | Python 3.12 x64         | PASS |
| E02 | Python missing          | FAIL |
| E03 | Wrong Python version    | FAIL |
| E04 | Node 22                 | PASS |
| E05 | Wrong Node version      | FAIL |
| E06 | Create fresh venv       | PASS |
| E07 | Offline wheel install   | PASS |
| E08 | Hermes CLI version      | PASS |
| E09 | No PyPI access required | PASS |
| E10 | Gateway smoke           | PASS |

---

## OPSI Builder

| ID  | 验证项                      | 结果        |
| --- | ------------------------ | --------- |
| O01 | Valid Stage              | PASS      |
| O02 | Private Key In Stage     | FAIL      |
| O03 | Real `opsi-makepackage`  | PASS      |
| O04 | Fake ZIP `.opsi`         | FORBIDDEN |
| O05 | Extract/read-back        | PASS      |
| O06 | Product Release mismatch | FAIL      |

---

# 41. Windows Live Gate

v1.7.1 新增 Release Builder Gate：

```text
RB-01 Local Source Build
RB-02 Offline Runtime Install
RB-03 OPSI Product Build
```

## RB-01

```text
Local hermes-agent Git
→ Release Builder
→ Windows Managed Bundle
```

验证：

```text
Git SHA
Hermes Version
Runtime Profile
Artifact SHA256
Signature
```

---

## RB-02

Windows Endpoint：

```text
Preinstalled Python
Preinstalled Node
No PyPI
No npm registry dependency
```

完成：

```text
Create venv
Offline install
Hermes CLI
Gateway
```

---

## RB-03

```text
Signed Stage
→ opsi-makepackage
→ .opsi
→ extract
→ read-back
```

通过后进入 v1.7 已定义的 Windows Endpoint Live Evidence。

---

# 42. 实施阶段

## Phase 1

建立：

```text
Client Runtime Baseline
Runtime Profile
Runtime Build Contract
```

---

## Phase 2

开发：

```text
Hermes Source Builder
Hermes Wheel Builder
Python Wheelhouse Builder
Node Offline Package Builder
```

---

## Phase 3

改造 Runtime Artifact：

```text
python-wheelhouse install type
runtime entrypoint
Python/Node prerequisite metadata
```

---

## Phase 4

改造 Endpoint Controller：

```text
Prerequisite Check
Fresh Venv Creation
Offline Python Install
Offline Node Install
Runtime Verification
```

---

## Phase 5

完成：

```text
Real OPSI Stage
Real opsi-makepackage
Package Read-back
```

---

## Phase 6

接入：

```text
Work Windows Builder
OPSI Client Installer
```

---

## Phase 7

实现：

```text
Unified Release Orchestrator
smc.client-release.v1
Final Verification
```

---

# 43. Definition of Done

* [ ] 支持直接从本地 `hermes-agent` Git Repository 构建 Release。
* [ ] 不直接压缩整个 Git Repository。
* [ ] Hermes ZIP 不包含 Python Runtime。
* [ ] Hermes ZIP 不包含 Node Runtime。
* [ ] Hermes ZIP 不复制开发机 `.venv`。
* [ ] Hermes ZIP 不复制开发机 `node_modules`。
* [ ] Python Dependency 以 Windows Wheelhouse 形式离线交付。
* [ ] Node Runtime Dependency 以固定版本 Offline Package 交付。
* [ ] Runtime Profile 明确控制 Hermes 包含的能力。
* [ ] 当前只支持 `windows-amd64` Runtime。
* [ ] Runtime Manifest 声明 Python/Node 版本要求。
* [ ] Controller 安装前校验 Python/Node。
* [ ] Controller 在 Runtime Slot 中创建独立 venv。
* [ ] Python Dependency 完全离线安装。
* [ ] Hermes Wheel 完全离线安装。
* [ ] Production Runtime 不依赖 PyPI。
* [ ] Production 核心 Node Dependency 不依赖 npm Registry。
* [ ] Hermes Program 与用户 `HERMES_HOME` 完全分离。
* [ ] Work Windows Installer 纳入统一 Release。
* [ ] `.opsi` 只能通过正式 OPSI Tooling 创建。
* [ ] OPSI Product Build 后完成 extract/read-back。
* [ ] OPSI Client Installer 纳入 Release Bundle。
* [ ] Release Private Key 不进入任何 Artifact。
* [ ] 一个命令完成完整 Client Release Build。
* [ ] 最终生成 `smc.client-release.v1`。
* [ ] 任一 Artifact 验证失败时整体 Release 不得进入 READY。

---

## 44. v1.7.1 最终发布模型

```text
                 Client Prerequisite
                ┌───────────────────┐
                │ Python 3.12.x     │
                │ Node.js 22.x      │
                └─────────┬─────────┘
                          │
                          │
hermes-agent Git          │         smc-copilot Git
       │                  │                │
       ↓                  │                ↓
Hermes Wheel              │          Work Installer
       ↓                  │
Python Wheelhouse         │
       +                  │
Node Offline Packages     │
       ↓                  │
Hermes Managed Bundle     │
       ↓                  │
Runtime Artifact v3       │
       └──────────────┬───┘
                      ↓
              Endpoint Controller
                      ↓
                Create Venv
                      ↓
               Offline Install
                      ↓
                 Hermes Runtime
                      ↓
                Bound-user Gateway


Runtime Artifact
      +
Controller Bundle
      ↓
Product Release Index
      ↓
OPSI Stage
      ↓
opsi-makepackage
      ↓
Real .opsi
      ↓
Client Release Bundle
```

**v1.7.1 的交付核心收敛为：**

> `Git Source → Managed Offline Bundle → Endpoint Fresh Runtime → Real OPSI Product → Unified Client Release`。
