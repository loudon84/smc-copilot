# PRD-OPSI-v2.0.2 — Hermes Agent Windows Installable Release Pipeline

**版本：v2.0.2**
**适用仓库：`smc-copilot / opsi/prd-2.0`**
**目标：基于现有 `build-client-release.ps1 + build.ps1`，一次构建生成可直接在 Windows 10/11 客户端安装、运行的 Hermes Agent EXE。**
**架构基线：沿用 [`ADR-037`](../adr/ADR-037-opsi-managed-endpoint-v2.md) 当前已接受的 machine Hermes 边界；本 PRD 不修改其签署状态、Program Root、HERMES_HOME 或 control-owner 规则。**

---

## 1. 项目背景

当前项目已经完成 Windows Installer 基础架构：

```text
scripts/build-client-release.ps1
        ↓
tools/release/client/build_client_release.py
        ↓
Hermes Release Builder
        ↓
infra/windows/hermes-agent/installer/build.ps1
        ↓
WiX MSI
        ↓
WiX Burn EXE
```

WiX Installer 本身已经成立：

* `build.ps1` 生成真实 MSI；
* Burn 将 MSI 内嵌到最终 EXE；
* Hermes Release ZIP、Manifest、InstallerCore 等安装资源由 MSI 内嵌；
* 客户端不需要 Python/.NET/Node 等外部安装依赖；
* 客户端最终应只分发一个 `smc-hermes-agent_<version>_windows-amd64.exe`。

当前阻断点不在 WiX，而在 **Hermes Runtime Release 的构建链尚未闭环**。

---

# 2. 当前源码状态

## 2.1 已完成能力

当前已经具备：

```text
Hermes Git Source
    ↓
Source Freeze
    ↓
Hermes Wheel
    ↓
Windows AMD64 Wheelhouse
    ↓
Node package cache
    ↓
Release Manifest
    ↓
Ed25519 Manifest Signature
    ↓
WiX MSI
    ↓
Burn EXE
```

`build_runtime.py` 已经负责 Hermes wheel、Windows wheelhouse、Node packages、runtime metadata 的组装。

`build_client_release.py` 也已经存在：

```python
"hermes-installer"
```

stage，并且具备：

```text
Hermes Release
→ installer/build.ps1
→ EXE
→ Release Inventory
```

逻辑。

---

# 3. 当前缺失能力

当前要达到：

> clone Hermes 源码 → 执行一条 build-client-release.ps1 → 得到一个 EXE → 拷贝 EXE 到 Windows 10 → 管理员安装 → Hermes Gateway 正常运行

还缺 **5 项工程闭环**。

| ID | 缺失                                    | 当前状态 | 优先级 |
| -- | ------------------------------------- | ---- | --- |
| R1 | Release Pipeline 切换到 Hermes Installer | 未完成  | P0  |
| R2 | 真实 Windows Hermes Runtime             | 未完成  | P0  |
| R3 | Hermes CLI Windows Launcher           | 未完成  | P0  |
| R4 | Runtime 与 Endpoint scripts 完整进入 ZIP   | 未完成  | P0  |
| R5 | 安装完成后启动 Gateway 并完成真实 readiness       | 未完成  | P0  |

WiX MSI/Burn 架构 **不重新设计**。

---

# 4. 核心问题：当前 Release v2 仍是假 Runtime

当前：

```text
tools/release/hermes/release_v2.py
```

仍然使用：

```python
_write_stub_exe()
```

创建：

```text
bin/hermes.exe
python/embedded/python.exe
node/embedded/node.exe
```

其实际内容只是：

```bat
@echo off
echo SMC Hermes <version>
```

不是 Windows PE 可执行程序。

因此当前状态实际上是：

```text
真实 Burn EXE
    ↓
真实 MSI
    ↓
真实 ZIP
    ↓
假的 hermes.exe
假的 python.exe
假的 node.exe
```

所以 Installer 能生成，不代表 Hermes Agent 能安装运行。

**v2.0.2 的核心工作就是替换这一层。**

---

# 5. 目标架构

最终 Release Pipeline 固定为：

```text
Internal Hermes Git Repository
        │
        ▼
Source Freeze
        │
        ▼
Hermes Wheel
        │
        ├── Windows Wheelhouse
        └── Node Package Cache
        │
        ▼
Windows Runtime Builder
        │
        ├── CPython 3.12 Embedded x64
        ├── Hermes Wheel
        ├── Python Dependencies
        ├── Node.js 22 x64
        ├── Node Dependencies
        ├── Hermes Launcher
        └── SMC Endpoint Scripts
        │
        ▼
Hermes Release Tree
        │
        ▼
hermes-windows-amd64.zip
release-manifest.json
release-manifest.sig
        │
        ▼
installer/build.ps1
        │
        ├── MSI
        └── Burn EXE
                │
                ▼
smc-hermes-agent_<release>_windows-amd64.exe
                │
                ▼
Windows Client
```

客户端安装阶段：

```text
Burn EXE
   ↓
Embedded MSI
   ↓
InstallerCore
   ↓
Extract Hermes Runtime
   ↓
ProgramRoot
   ↓
Initialize HERMES_HOME
   ↓
Register Gateway Scheduled Task
   ↓
Start Gateway
   ↓
Ready
```

---

# 6. FR-01 — 单一 Release 入口

## 6.1 保留现有入口

正式发版只允许：

```text
scripts/build-client-release.ps1
```

作为人工入口。

`infra/windows/hermes-agent/installer/build.ps1` 保留为内部 Installer Builder，不要求人工单独执行。

---

## 6.2 增加 `hermes-installer` stage

当前 PowerShell Wrapper 的 `ValidateSet` 没有 `hermes-installer`，虽然 Python 已支持。

修改：

```powershell
[ValidateSet(
    "preflight",
    "work",
    "hermes",
    "hermes-installer",
    "runtime",
    "assemble",
    "verify",
    "all"
)]
```

执行方式：

```powershell
.\scripts\build-client-release.ps1 `
    -Stage hermes-installer `
    -HermesRepo "E:\git\hermes-agent" `
    -SigningKeyRef "E:\keys\hermes-release.pem" `
    -Output "E:\smc-build\out"
```

该命令必须完成：

```text
Source Freeze
→ Hermes Runtime
→ Release v2
→ MSI
→ Burn EXE
→ Final Release
```

不再要求人工调用第二条脚本。

---

# 7. FR-02 — Release 配置切换

当前：

```yaml
release/client-release.yaml
```

仍然只有旧：

```yaml
opsi:
  productVersion:
  packageVersion:
```

并没有启用 `hermesInstaller`。

所以当前：

```text
build-client-release.ps1 -Stage all
```

默认仍可能进入旧 OPSI Product pipeline。

## 修改为

```yaml
schema: smc.client-release.config.v2

release:
  version: "2.0.2"
  channel: "lab"

clientRuntime:
  platform: windows
  architecture: amd64

  python:
    version: "3.12.8"

  node:
    version: "22.11.0"

hermes:
  repo: "E:/git/hermes-agent"
  version: auto
  profile: smc-managed

hermesInstaller:
  enabled: true
  smcRevision: 1
  platform: windows
  architecture: amd64
```

Hermes Release Version：

```text
<hermes pyproject version>-smc.<revision>
```

例如：

```text
0.20.4-smc.1
```

---

# 8. FR-03 — 统一版本解析

当前 `build_client_release.py` 存在：

```python
"0.22.0-smc.1"
```

硬编码 fallback。

删除所有 Hermes Release Version 硬编码。

新增：

```text
tools/release/hermes/release_version.py
```

提供唯一接口：

```python
def resolve_release_version(
    hermes_version: str,
    smc_revision: int
) -> str:
    return f"{hermes_version}-smc.{smc_revision}"
```

所有模块：

```text
build_runtime.py
release_v2.py
build_client_release.py
installer/build.ps1
```

只能使用同一个 resolved release version。

---

# 9. FR-04 — Windows Runtime Builder

新增：

```text
tools/release/hermes/windows_runtime.py
```

职责：

```text
build_managed_bundle()
        ↓
build_windows_runtime()
        ↓
assemble_self_contained_tree()
```

不再由 `release_v2.py` 创建 fake runtime。

---

# 10. FR-05 — Embedded Python Runtime

## 构建目标

最终：

```text
python\
├── python.exe
├── python3.dll
├── python312.dll
├── python312.zip
├── python312._pth
└── Lib\
    └── site-packages\
```

Python Runtime 使用：

```text
CPython 3.12.x Windows AMD64 Embedded Distribution
```

在 **Build Server** 下载/缓存。

客户端不下载 Python。

---

## Hermes Python 环境

现有 `build_runtime.py` 已经生成：

```text
app\
    hermes_agent-*.whl

python\
    wheels\
```

Windows Runtime Builder 在 Build-Time 将这些 wheel materialize：

```text
Hermes wheel
+
wheelhouse/*.whl
        ↓
python/Lib/site-packages/
```

最终：

```text
python\
└── Lib\
    └── site-packages\
        ├── hermes_cli\
        ├── openai\
        ├── pydantic\
        ├── fastapi\
        ├── psutil\
        ├── win32\
        └── ...
```

客户端禁止：

```text
pip install
uv sync
uv install
```

---

# 11. FR-06 — Hermes Windows Launcher

上游 Hermes 的 CLI entrypoint 是：

```toml
[project.scripts]
hermes = "hermes_cli.main:main"
hermes-agent = "run_agent:main"
```

因此不需要把 Hermes Python 项目重新编译成一个大型 Native 程序。

需要一个 Windows launcher：

```text
bin/hermes.exe
```

负责使用私有 Python Runtime 调用：

```text
hermes_cli.main:main
```

---

## 实现方案

Build-Time 安装 Hermes Wheel 后，生成 Windows console-script launcher：

```text
bin\
└── hermes.exe
```

运行时解析：

```text
ProgramRoot
  ↓
python\python.exe
  ↓
python\Lib\site-packages
  ↓
hermes_cli.main
```

必须满足：

```text
bin/hermes.exe = Windows PE
```

禁止继续：

```text
batch 内容 + .exe 扩展名
```

---

# 12. FR-07 — Node Runtime

当前：

```text
build_node_packages.py
```

只构建 `.tgz` package cache，不包含 Node Runtime。

增加：

```text
Node.js Windows x64 runtime
```

最终：

```text
node\
├── node.exe
├── npm.cmd
└── node_modules\
```

Build-Time 完成：

```text
package cache
        ↓
node_modules
```

客户端禁止：

```text
npm install
npm pack
npm download
```

---

# 13. FR-08 — Release Tree 重构

当前：

```text
release_v2.py
```

直接创建 Stub。

修改后：

```text
release-v2/tree/
│
├── bin/
│   └── hermes.exe
│
├── python/
│   ├── python.exe
│   ├── python312.dll
│   ├── python312.zip
│   └── Lib/site-packages/
│
├── node/
│   ├── node.exe
│   └── node_modules/
│
├── scripts/
│   ├── HostOperations.ps1
│   ├── SmcHermesManaged.psm1
│   └── ...
│
├── runtime/
│   └── runtime-build.json
│
├── manifest/
│   └── release-metadata.json
│
└── uninstall/
```

删除：

```python
_write_stub_exe()
_write_embedded_runtime()
```

`release_v2.py` 只负责：

```text
Runtime Tree
→ inventory
→ ZIP
→ manifest
→ signature
```

不再负责“伪造 runtime”。

---

# 14. FR-09 — Endpoint Scripts 打入 Runtime

当前 Server command dispatcher 依赖：

```text
D:\Programs\SMC\Hermes\
└── scripts\
    └── HostOperations.ps1
```

但当前 Release v2 没有 `scripts/`。

v2.0.2 必须把：

```text
infra/windows/hermes-agent/scripts/
```

需要运行时使用的脚本复制到：

```text
release-v2/tree/scripts/
```

至少：

```text
HostOperations.ps1
SmcHermesManaged.psm1
```

否则安装虽然完成，后续：

```text
CONFIG_APPLY
COLLECT_LOGS
COLLECT_SESSIONS
UPDATE
REPAIR
```

无法调用。

---

# 15. FR-10 — Release Manifest

保留现有：

```text
smc.hermes.release.v2
```

Manifest 机制。

当前 `release_v2.py` 已经能够记录：

```text
releaseVersion
hermesVersion
smcRevision
architecture
platform
sourceRevision
sha256
files[]
```

并进行 Ed25519 签名。

新增 Runtime 信息：

```json
{
  "runtime": {
    "python": "3.12.8",
    "node": "22.11.0"
  }
}
```

Manifest 中必须 inventory：

```text
bin/hermes.exe
python/python.exe
node/node.exe
scripts/*
```

---

# 16. FR-11 — Installer Builder 保持现有架构

继续使用：

```text
infra/windows/hermes-agent/installer/build.ps1
```

当前已经完成：

```text
Payload Source
    ↓
staging
    ↓
Product.wxs
    ↓
MSI
    ↓
Bundle.wxs
    ↓
Burn EXE
```

不增加：

```text
.NET Host
C# Bootstrapper
Python installer
Node installer
在线安装逻辑
```

---

# 17. FR-12 — 最终 EXE 必须完全自包含

最终：

```text
smc-hermes-agent_0.20.4-smc.1_windows-amd64.exe
```

内部结构：

```text
Burn EXE
        ↓ embedded
MSI
        ↓ embedded
bootstrap.ps1
InstallerCore.psm1
release-manifest.json
release-manifest.sig
hermes-windows-amd64.zip
        ↓
Complete Hermes Runtime
```

因此客户端分发对象只有：

```text
smc-hermes-agent_<version>_windows-amd64.exe
```

不需要一起复制：

```text
.msi
staging/
payload/
hermes-windows-amd64.zip
bootstrap.ps1
InstallerCore.psm1
```

MSI 保留在 Build Artifact，仅用于运维诊断。

---

# 18. FR-13 — Installer Lifecycle

保持现有：

```text
Burn
→ MSI
→ bootstrap.ps1
→ InstallerCore.psm1
```

安装：

```text
/install
```

升级：

```text
/upgrade
```

修复：

```text
/repair
```

卸载：

```text
/uninstall
```

客户端不新增 SMC Windows Service。

Gateway 继续通过：

```text
Windows Scheduled Task
SMC Hermes Gateway
```

管理。

---

# 19. FR-14 — 安装完成必须启动 Gateway

当前 Installer 主要完成 Scheduled Task 注册。

v2.0.2 增加：

```powershell
Register-ScheduledTask
        ↓
Start-ScheduledTask
```

安装成功的定义从：

```text
Task exists
```

调整为：

```text
Hermes Runtime installed
+
Gateway Scheduled Task registered
+
Gateway started
```

不允许“安装成功但需要重启 Windows 才启动 Hermes”。

---

# 20. FR-15 — Readiness 改为真实执行结果

当前 InstallerCore 允许：

```text
hermes.exe 执行失败
        ↓
读取文件内容
        ↓
regex 匹配版本
```

这也是 Stub 能通过 readiness 的原因。

v2.0.2 删除该 fallback。

Ready 的最小条件：

```text
bin/hermes.exe exists
        +
hermes.exe --version ExitCode == 0
        +
version == release-manifest.hermesVersion
        +
Scheduled Task exists
```

Gateway readiness：

```text
hermes status
```

或 Hermes Gateway 本身已有的 status/health 能力。

不再通过读取 `hermes.exe` 文本判断版本。

---

# 21. FR-16 — Build Runtime 和 Release Runtime 职责重新划分

现有：

```text
build_runtime.py
```

只生成 wheel/cache bundle。

调整为：

```text
build_runtime.py
    │
    ├── build Hermes wheel
    ├── resolve Windows wheels
    ├── resolve Node packages
    └── build_windows_runtime()
                   │
                   ▼
            complete runtime tree
```

然后：

```text
release_v2.py
```

只：

```text
complete runtime tree
        ↓
release package
```

职责固定：

| 模块                        | 职责                          |
| ------------------------- | --------------------------- |
| `build_wheel.py`          | Hermes Wheel                |
| `build_wheelhouse.py`     | Windows Python Dependencies |
| `build_node_packages.py`  | Node Dependencies           |
| `windows_runtime.py`      | 真实 Windows Runtime          |
| `release_v2.py`           | ZIP + Manifest + Signature  |
| `build_client_release.py` | Release orchestration       |
| `installer/build.ps1`     | MSI + Burn EXE              |

---

# 22. FR-17 — Hermes Installer Stage 不构建 Work

当前：

```python
build_hermes_installer_release()
```

仍然调用：

```python
run_work()
```

这是 Hermes Installer Release 不需要的依赖。

修改：

```text
hermes-installer
```

stage：

```text
不 build apps/work
不 build OPSI Product
不要求 OPSI Client Installer
```

只构建：

```text
Hermes
+
Hermes Installer
```

这样才能真正成为简化发版入口。

---

# 23. FR-18 — `all` 的新语义

当前：

```text
all
```

仍然会根据配置进入旧 OPSI package pipeline。

v2.0.2：

当：

```yaml
hermesInstaller:
  enabled: true
```

时：

```text
all
    ↓
Hermes native installer release
```

禁止继续创建：

```text
smc-hermes-agent.opsi
```

Hermes 生命周期不再使用 OPSI Product。

OPSI 只负责后续：

```text
hostControlSafe_execute
```

远程触发安装程序。

---

# 24. FR-19 — Build Output 收敛

当前有：

```text
hermes-build/
hermes-installer-build/
hermes-installer/
hermes/
manifests/
```

这些仍可以作为 build workspace。

但新增正式目录：

```text
release/
```

最终：

```text
client-release/
└── 2.0.2/
    └── build-20260819TxxxxxxZ/
        │
        ├── build/
        │   ├── hermes-build/
        │   └── installer-build/
        │
        ├── manifests/
        │
        └── release/
            ├── smc-hermes-agent_0.20.4-smc.1_windows-amd64.exe
            ├── release-manifest.json
            ├── release-manifest.sig
            └── SHA256SUMS
```

**运维人员只取 `release/`。**

---

# 25. FR-20 — 客户端 Runtime 目录

继续遵循当前 Managed Hermes 架构：

```text
ProgramRoot:
D:\Programs\SMC\Hermes

HERMES_HOME:
C:\ProgramData\SMC\Hermes
```

程序和用户状态严格分离：

```text
D:\Programs\SMC\Hermes
│
├── bin
├── python
├── node
├── scripts
└── runtime
```

```text
C:\ProgramData\SMC\Hermes
│
├── config.yaml
├── auth.json
├── skills
├── sessions
├── workspace
├── logs
└── state
```

当前 `SmcHermesManaged.psm1` 已经采用这套路径模型。

本 PRD **不修改 Managed Root 策略**。

---

# 26. 非功能要求

## NFR-01 客户端零开发运行时依赖

Windows 客户端不得要求额外安装：

```text
Python
Node.js
.NET Runtime
.NET Desktop Runtime
.NET SDK
Git
uv
pip
npm
WiX
```

WiX/.NET 只允许存在于 Build Server。

---

## NFR-02 Offline Install

最终 EXE：

```text
断网情况下
```

必须能够完成：

```text
安装
启动 Hermes
启动 Gateway
```

---

## NFR-03 不运行在线依赖安装

首次启动和安装期间禁止：

```text
pip install
npm install
uv sync
curl runtime
Invoke-WebRequest runtime
```

---

# 27. 代码改造清单

### P0 修改

```text
scripts/build-client-release.ps1
```

增加：

```text
hermes-installer
```

stage。

---

```text
release/client-release.yaml
```

增加：

```yaml
hermesInstaller:
  enabled: true
  smcRevision: 1
```

并切换 SOT。

---

```text
tools/release/client/build_client_release.py
```

修改：

```text
移除 0.22.0-smc.1 hardcode
hermes-installer 不调用 run_work()
all 默认走 native Hermes Installer
统一 ReleaseVersion
最终 release/ artifact 输出
```

---

```text
tools/release/hermes/build_runtime.py
```

增加：

```python
build_windows_runtime()
```

调用。

---

### P0 新增

```text
tools/release/hermes/windows_runtime.py
```

实现：

```text
Embedded CPython
Wheel materialization
Node runtime
Node modules
Hermes launcher
Runtime scripts
```

---

### P0 修改

```text
tools/release/hermes/release_v2.py
```

删除：

```python
_write_stub_exe()
_write_embedded_runtime()
```

改成接收真实 Runtime Tree。

---

```text
infra/windows/hermes-agent/installer/InstallerCore.psm1
```

修改：

```text
真实 hermes --version
启动 Gateway Task
真实 readiness
删除 text fallback
```

---

### P0 修改测试

```text
tools/release/tests/test_hermes_builder.py
infra/windows/hermes-agent/tests/Installer.Tests.ps1
```

测试对象从：

```text
file exists
```

提升为：

```text
real executable
real Hermes CLI
real installation
```

---

# 28. 最终调用方式

内部 Hermes 仓库只需要提前：

```powershell
git clone http://git.superic.com/aiplatform/hermes-agent.git E:\git\hermes-agent
```

之后日常发版统一：

```powershell
.\scripts\build-client-release.ps1 `
    -Stage hermes-installer `
    -HermesRepo "E:\git\hermes-agent" `
    -SigningKeyRef "E:\smc-build\keys\hermes-release.pem" `
    -Output "E:\smc-build\out"
```

工程内部自动：

```text
Hermes Repo
→ Freeze
→ Wheel
→ Wheelhouse
→ Node Packages
→ Windows Runtime
→ Release v2
→ Manifest
→ MSI
→ Burn
→ Final Release
```

不再人工执行：

```text
infra/windows/hermes-agent/installer/build.ps1
```

---

# 29. 最终交付物

唯一客户端安装程序：

```text
release/
└── smc-hermes-agent_<HermesVersion>-smc.<Revision>_windows-amd64.exe
```

例如：

```text
smc-hermes-agent_0.20.4-smc.1_windows-amd64.exe
```

同时保留发布元数据：

```text
release-manifest.json
release-manifest.sig
SHA256SUMS
```

---

# 30. 验收标准

## AC-01 Build

执行一条：

```text
build-client-release.ps1 -Stage hermes-installer
```

必须直接产生最终 EXE。

---

## AC-02 Distribution

客户端只复制：

```text
smc-hermes-agent_xxx_windows-amd64.exe
```

即可安装。

不得依赖：

```text
hermes-installer-build/
MSI
ZIP
Python
Node
.NET
```

---

## AC-03 Install

Windows 10 x64 管理员直接运行 EXE后：

```text
Hermes ProgramRoot 创建成功
HERMES_HOME 创建成功
Gateway Scheduled Task 创建成功
Gateway 启动成功
```

---

## AC-04 Hermes CLI

安装结束：

```powershell
D:\Programs\SMC\Hermes\bin\hermes.exe --version
```

必须返回内部 Hermes Git 源码对应版本。

---

## AC-05 Runtime

必须使用 EXE 内嵌：

```text
Python 3.12
Node 22
Hermes dependencies
```

客户端无需安装任何开发运行时。

---

## AC-06 Release Version

以下版本必须完全一致：

```text
Hermes pyproject.toml
        ↓
releaseVersion
        ↓
release-manifest.json
        ↓
Hermes Runtime
        ↓
MSI
        ↓
Burn EXE filename
```

禁止 hardcode 独立版本。

---

## AC-07 Offline

客户端断网仍可：

```text
安装
hermes --version
启动 gateway
```

---

# 31. v2.0.2 完成后的工程边界

完成本 PRD 后：

```text
Hermes Git
        ↓
一个脚本
        ↓
一个 EXE
        ↓
Windows 客户端
        ↓
安装完成直接运行
```

其中现有 WiX Installer 架构继续使用；**主要开发量集中在 `windows_runtime.py + release_v2.py + build_client_release.py` 三层。**

最关键的实施顺序只有四步：

1. **先实现真实 Windows Runtime，彻底删除 Stub。**
2. **让 `release_v2.py` 打包真实 Runtime。**
3. **把 `build-client-release.ps1` 正式切换到 `hermes-installer`。**
4. **InstallerCore 安装后直接启动真实 Hermes Gateway。**

这四项完成，当前已有的 MSI/Burn 体系才会真正变成可直接交给 Windows 客户端安装的 Hermes Agent 安装程序。
