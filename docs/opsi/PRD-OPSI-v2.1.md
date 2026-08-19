# PRD-OPSI-v2.1 — Hermes Managed Environment & Windows User Compatibility

**项目**：SMC Copilot
**版本**：v2.1
**基线分支**：`opsi/prd-2.0`
**目标平台**：Windows 10 / Windows 11 x64
**Hermes Agent**：v0.20.x
**安装模式**：Machine Install / Multi-User Windows Login
**Program Root**：`D:\Programs\SMC\Hermes`
**HERMES_HOME**：`C:\ProgramData\SMC\Hermes`

---

# 1. 版本目标

v2.1 解决 Hermes Agent MSI 安装完成后的 Windows 企业运行环境问题。

企业实际部署模式：

```text
IT Administrator
        ↓
安装 Hermes MSI
        ↓
Machine Scope Installation
        ↓
员工使用自己的 Windows 工号账号登录
        ↓
运行 Hermes / SMC Work
```

因此 Hermes 安装结果必须同时满足：

```text
程序机器级安装
+
环境变量机器级生效
+
普通 Windows 用户可执行程序
+
普通 Windows 用户可写 Hermes 数据
+
Hermes setup Node Workspace 路径正确
```

v2.1 不修改 OPSI Control Plane，不修改 Hermes Gateway Protocol，不修改 apps/work 业务代码。

---

# 2. 当前问题

当前 Windows Installer 已能够完成：

```text
MSI Install
        ↓
D:\Programs\SMC\Hermes
        ↓
C:\ProgramData\SMC\Hermes
        ↓
Hermes CLI
```

实际验证：

```text
D:\Programs\SMC\Hermes\bin>hermes --version

Hermes Agent v0.20.0 (2026.8.3)
Install directory:
D:\Programs\SMC\Hermes\python\Lib\site-packages

Python: 3.12.8
OpenAI SDK: 2.24.0
```

当前仍存在四类问题。

## 2.1 Windows Environment 未完整配置

安装后仍需人工设置：

```text
HERMES_HOME
PATH
```

其中 PATH 需要：

```text
D:\Programs\SMC\Hermes\bin
D:\Programs\SMC\Hermes\scripts
```

当前 `SmcHermesManaged.psm1` 已写入 Machine `HERMES_HOME`，但没有完整维护 Machine `PATH`。

---

## 2.2 `hermes setup` Node Workspace 错误

当前出现：

```text
npm install failed

cd C:\ProgramData\SMC\Hermes\profiles\writer/hermes-agent
npm install --workspaces=false
```

问题是：

```text
HERMES_HOME
```

被错误用于推导 Hermes Node Workspace。

实际上：

```text
C:\ProgramData\SMC\Hermes
```

属于 Hermes Data Root。

Node Workspace 应属于：

```text
D:\Programs\SMC\Hermes
```

程序运行树。

---

## 2.3 Managed HERMES_HOME ACL 不允许普通用户使用

当前 `SmcHermesManaged.psm1` 对：

```text
C:\ProgramData\SMC\Hermes
```

关闭 ACL inheritance，并只允许：

```text
SYSTEM
Administrators
```

访问。

这与企业部署模式冲突：

```text
管理员负责安装
≠
管理员负责日常使用
```

实际运行 Hermes 的员工属于普通 Windows User。

---

## 2.4 Machine HERMES_HOME 与原 Hermes User Home 存在兼容差异

原 Hermes 默认结构：

```text
%USERPROFILE%\.hermes
```

当前企业 Managed Hermes：

```text
C:\ProgramData\SMC\Hermes
```

需要明确配置、Profile、Session、Skill、Auth 等数据的最终存储边界。

Hermes 的 Profile、配置、Session、Skill 等均围绕 HERMES_HOME 组织，因此 Machine HERMES_HOME 可以继续作为企业 Managed Hermes 的数据根。

---

# 3. v2.1 架构约束

最终 Hermes Windows 目录固定为：

```text
Windows Machine

D:\Programs\SMC\Hermes
│
├── bin\
├── python\
├── node\
├── scripts\
├── runtime\
├── manifest\
└── uninstall\
```

数据：

```text
C:\ProgramData\SMC\Hermes
│
├── config.yaml
├── .env
├── auth.json
│
├── profiles\
├── skills\
├── sessions\
├── memories\
├── logs\
├── workspace\
└── state\
```

职责：

```text
ProgramRoot
=
程序、Runtime、脚本、Node Workspace

HERMES_HOME
=
用户配置、Profile、Session、Skill、Workspace、运行状态
```

两个目录禁止混用。

---

# 4. Windows Environment 规范

Installer 必须自动建立 Machine Environment。

## 4.1 HERMES_HOME

Machine：

```text
HERMES_HOME
=
C:\ProgramData\SMC\Hermes
```

禁止写入：

```text
User Environment
```

作为 Hermes Managed Endpoint SOT。

---

# 5. Machine PATH

Installer 自动向 Machine PATH 增加：

```text
D:\Programs\SMC\Hermes\bin
D:\Programs\SMC\Hermes\scripts
```

最终普通员工重新登录 Windows 后可以直接执行：

```powershell
hermes --version
hermes status
hermes setup
hermes doctor
```

不需要：

```text
cd D:\Programs\SMC\Hermes\bin
```

---

# 6. HERMES_AGENT_ROOT

新增 Machine Environment：

```text
HERMES_AGENT_ROOT
=
D:\Programs\SMC\Hermes\node\hermes-agent
```

职责：

```text
Hermes Node Workspace Root
```

与：

```text
HERMES_HOME
```

完全分离。

最终：

```text
HERMES_HOME
C:\ProgramData\SMC\Hermes

HERMES_AGENT_ROOT
D:\Programs\SMC\Hermes\node\hermes-agent
```

---

# 7. Environment Owner

所有以下环境变量均由：

```text
SMC Hermes Installer
```

拥有生命周期：

```text
HERMES_HOME
HERMES_AGENT_ROOT
PATH entries
```

Hermes CLI 不负责永久写 Machine Environment。

OPSI 不直接写这些变量。

apps/work 不写这些变量。

---

# 8. Environment Install Transaction

Installer：

```text
Install Runtime
        ↓
Create ProgramRoot
        ↓
Create HERMES_HOME
        ↓
Apply ACL
        ↓
Set Machine HERMES_HOME
        ↓
Set Machine HERMES_AGENT_ROOT
        ↓
Add Machine PATH
        ↓
Continue Hermes initialization
```

同时当前 Installer Process 设置：

```powershell
$env:HERMES_HOME =
"C:\ProgramData\SMC\Hermes"

$env:HERMES_AGENT_ROOT =
"D:\Programs\SMC\Hermes\node\hermes-agent"
```

并将：

```text
bin
scripts
```

加入当前 `$env:PATH`。

这样安装事务本身不依赖重新打开 PowerShell。

---

# 9. PATH 修改规则

新增：

```powershell
Add-SmcMachinePath
Remove-SmcMachinePath
```

必须：

```text
去重
大小写不敏感
只处理目标路径
保持其他 PATH 项目原样
```

禁止：

```text
整体覆盖 Machine PATH
删除其他产品 PATH
重复加入 Hermes PATH
```

---

# 10. Uninstall Environment

Uninstall 删除：

```text
HERMES_HOME
HERMES_AGENT_ROOT

PATH:
D:\Programs\SMC\Hermes\bin
D:\Programs\SMC\Hermes\scripts
```

只允许删除 Installer 自己拥有的 PATH Entry。

禁止删除其他 PATH 内容。

---

# 11. Hermes Setup Node Workspace

Hermes Node Workspace 固定：

```text
D:\Programs\SMC\Hermes\
└── node\
    └── hermes-agent\
        ├── package.json
        ├── package-lock.json
        └── node_modules\
```

禁止 Node Dependency Installer 使用：

```text
C:\ProgramData\SMC\Hermes
```

或：

```text
C:\ProgramData\SMC\Hermes\profiles\<profile>
```

作为 npm workspace。

---

# 12. Release Builder 改造

Hermes Windows Release Tree 必须增加：

```text
node\
└── hermes-agent\
    ├── package.json
    ├── package-lock.json
    └── node_modules\
```

其中：

```text
package.json
package-lock.json
```

来源：

```text
Hermes Agent Source Freeze
```

必须与当前 Hermes Release 相同 Git Revision。

禁止使用其他版本源码中的 Node Manifest。

---

# 13. npm Runtime

Windows 安装包中的 Node Runtime 固定：

```text
D:\Programs\SMC\Hermes\node\
```

Hermes setup 查找 npm 顺序：

```text
SMC Embedded npm.cmd
        ↓
System npm.cmd
        ↓
System npm
```

企业安装模式优先使用：

```text
Hermes Embedded Node Runtime
```

避免依赖客户端系统 Node.js。

---

# 14. Windows npm Command

Windows 强制优先：

```text
npm.cmd
```

禁止优先：

```text
npm.ps1
```

防止受到 PowerShell ExecutionPolicy 影响。

逻辑：

```python
npm_cmd =
    embedded_npm_cmd
    or shutil.which("npm.cmd")
    or shutil.which("npm")
```

---

# 15. Hermes Node Workspace Resolver

Hermes Internal Fork 增加统一函数：

```python
get_node_workspace_root()
```

解析顺序：

```text
1. HERMES_AGENT_ROOT
2. Managed installation discovery
3. Source checkout fallback
```

Managed 模式：

```text
HERMES_AGENT_ROOT
=
D:\Programs\SMC\Hermes\node\hermes-agent
```

Source Development 模式允许 fallback：

```text
repository root
```

禁止：

```text
HERMES_HOME/profile
→ Node Workspace
```

---

# 16. `hermes setup` 修改

需要检查并统一：

```text
hermes_cli/setup.py
hermes_cli/tools_config.py
```

所有：

```text
npm install
npm update
npm dependency check
```

操作统一：

```python
cwd=get_node_workspace_root()
```

错误提示：

```text
npm install failed

Workspace:
D:\Programs\SMC\Hermes\node\hermes-agent

Command:
npm.cmd install --workspaces=false
```

禁止继续显示：

```text
C:\ProgramData\SMC\Hermes\profiles\writer\hermes-agent
```

---

# 17. Chromium 策略

v2.1 不打包 Chromium。

保持：

```text
hermes setup
        ↓
Browser capability setup
        ↓
需要时下载 Chromium
```

安装包中不新增：

```text
Chromium
Chrome
Playwright Browser Binary
```

因此 Hermes MSI 大小不因为 Chromium 增加约 170MB。

本版本只修复：

```text
npm workspace path
```

---

# 18. Windows ACL 总体模型

企业部署权限模型：

```text
Administrator
        ↓
安装程序

Standard User
        ↓
日常运行 Hermes
```

不能按 Installer Current User 授权。

统一使用 Windows Built-in Security Principal。

---

# 19. ProgramRoot ACL

目录：

```text
D:\Programs\SMC\Hermes
```

ACL：

```text
SYSTEM
    FullControl

BUILTIN\Administrators
    FullControl

BUILTIN\Users
    ReadAndExecute
```

SID：

```text
SYSTEM
S-1-5-18

Administrators
S-1-5-32-544

Users
S-1-5-32-545
```

普通员工可以：

```text
执行 hermes.exe
执行 python.exe
执行 node.exe
读取 Runtime
执行 scripts
```

不能：

```text
修改 hermes.exe
覆盖 Python Runtime
覆盖 Node Runtime
修改 scripts
篡改 manifest
```

---

# 20. HERMES_HOME ACL

目录：

```text
C:\ProgramData\SMC\Hermes
```

ACL：

```text
SYSTEM
    FullControl

BUILTIN\Administrators
    FullControl

BUILTIN\Users
    Modify
```

`Users:Modify` 必须：

```text
ContainerInherit
ObjectInherit
```

作用于整个 Managed Home。

---

# 21. 普通员工需要的权限

Standard User 必须能够创建、更新、删除：

```text
config.yaml
.env
auth.json

profiles\
skills\
sessions\
memories\
logs\
workspace\
state\
```

支持：

```text
hermes setup
hermes auth
hermes model
hermes profile create
hermes skills install
hermes chat
hermes sessions
hermes config
```

---

# 22. Managed Directory 初始化

当前 `SmcHermesManaged.psm1` 初始化：

```text
skills
sessions
logs
workspace
state
```

需要调整为：

```powershell
Directories = @(
    "profiles",
    "skills",
    "sessions",
    "memories",
    "logs",
    "workspace",
    "state"
)
```

现有 Managed Home 初始化与 Machine `HERMES_HOME` 已由 `SmcHermesManaged.psm1` 承担，应继续在该模块收敛。

---

# 23. ACL Implementation

现有：

```text
Set-SmcHermesManagedAcl
```

拆分为：

```text
Set-SmcHermesProgramAcl
Set-SmcHermesHomeAcl
```

---

## 23.1 Program ACL

```text
SYSTEM                  FullControl
Administrators          FullControl
Users                   ReadAndExecute
```

---

## 23.2 Home ACL

```text
SYSTEM                  FullControl
Administrators          FullControl
Users                   Modify
```

两者均：

```text
Inheritance from parent = disabled
```

但内部目录继续从：

```text
ProgramRoot
HERMES_HOME
```

继承各自定义的权限。

---

# 24. ACL Assert

当前：

```text
Assert-SmcHermesManagedAcl
```

也需要拆成：

```text
Assert-SmcHermesProgramAcl
Assert-SmcHermesHomeAcl
```

不能继续简单判断：

```text
是否包含 SID
```

必须验证：

```text
SID
AccessControlType
FileSystemRights
InheritanceFlags
```

---

# 25. Program ACL Assert Contract

必须满足：

```text
SYSTEM
FullControl

Administrators
FullControl

Users
ReadAndExecute
```

如果 Users 获得：

```text
Modify
FullControl
```

必须判定：

```text
PROGRAM_ACL_TOO_PERMISSIVE
```

---

# 26. Home ACL Assert Contract

必须满足：

```text
SYSTEM
FullControl

Administrators
FullControl

Users
Modify
```

没有 Users Modify：

```text
HOME_ACL_USER_WRITE_MISSING
```

---

# 27. MSI 安装用户不能成为 ACL SOT

禁止：

```powershell
WindowsIdentity.GetCurrent()
        ↓
Grant permission
```

因为安装身份通常：

```text
IT Admin
SYSTEM
OPSI Service Account
```

而业务用户是：

```text
员工 Windows 工号账户
```

授权目标统一：

```text
BUILTIN\Users
```

---

# 28. Managed HERMES_HOME 数据影响

企业版本继续：

```text
C:\ProgramData\SMC\Hermes
```

而不恢复：

```text
%USERPROFILE%\.hermes
```

以下数据因此成为 Machine Managed Data：

| 数据          | 企业路径                                    |
| ----------- | --------------------------------------- |
| config      | `C:\ProgramData\SMC\Hermes\config.yaml` |
| Environment | `C:\ProgramData\SMC\Hermes\.env`        |
| Auth        | `C:\ProgramData\SMC\Hermes\auth.json`   |
| Profiles    | `C:\ProgramData\SMC\Hermes\profiles`    |
| Skills      | `C:\ProgramData\SMC\Hermes\skills`      |
| Sessions    | `C:\ProgramData\SMC\Hermes\sessions`    |
| Memories    | `C:\ProgramData\SMC\Hermes\memories`    |
| Logs        | `C:\ProgramData\SMC\Hermes\logs`        |
| Workspace   | `C:\ProgramData\SMC\Hermes\workspace`   |
| State       | `C:\ProgramData\SMC\Hermes\state`       |

Hermes 的配置、Profile、Session、Skill 等生命周期本身均依赖 HERMES_HOME，因此这个模型不要求修改 Hermes 核心数据结构。

---

# 29. 原 `%USERPROFILE%\.hermes` 兼容影响

需要记录以下兼容风险：

```text
旧 Hermes 数据
%USERPROFILE%\.hermes

新 Managed Hermes 数据
C:\ProgramData\SMC\Hermes
```

两者默认：

```text
互不自动同步
```

v2.1 不自动迁移旧 Hermes Home。

如果客户端存在旧环境：

```text
%USERPROFILE%\.hermes
```

继续保留，不删除。

后续迁移单独设计：

```text
Legacy User Home Migration
```

---

# 30. 多 Windows 用户影响

当前产品模型：

```text
1 Endpoint
=
1 Managed Hermes Instance
=
1 Machine HERMES_HOME
```

因此同一 Windows Endpoint 上所有普通 Users 均可以访问：

```text
config
profiles
sessions
skills
workspace
auth
```

这是 v2.1 明确接受的 Machine Managed 模式。

如果未来需要：

```text
同一 PC
+
多个员工
+
用户数据严格隔离
```

需要另行拆分：

```text
Machine Hermes State
+
Per-User Hermes Data
```

不属于 v2.1。

---

# 31. apps/work 影响清单

本版本不修改 apps/work。

需要登记以下后续兼容点。

原 hermes-desktop 数据模型通常以：

```text
~/.hermes
```

作为默认 Home，named profile 位于：

```text
~/.hermes/profiles/<name>
```

并通过 `profileHome()` 路由文件访问。

因此 apps/work 后续需要确认：

```text
是否直接读取 config.yaml
是否直接读取 .env
是否直接读取 profiles
是否直接读取 sessions
是否直接读取 skills
是否使用 Path.home()/.hermes
```

凡是硬编码：

```text
%USERPROFILE%\.hermes
```

的模块都属于：

```text
Managed HERMES_HOME Compatibility Risk
```

但：

```text
apps/work
→ localhost:8642
→ Hermes Gateway
```

的数据面连接本身不受本次目录调整影响。

---

# 32. Gateway Environment

Gateway Scheduled Task 启动时必须显式设置：

```text
HERMES_HOME=C:\ProgramData\SMC\Hermes
HERMES_AGENT_ROOT=D:\Programs\SMC\Hermes\node\hermes-agent
```

禁止依赖：

```text
Scheduled Task 创建时的管理员用户环境
```

Gateway 的运行环境必须与员工 CLI 使用的 Machine Managed Environment 一致。

---

# 33. Installer Upgrade

Upgrade 不得破坏：

```text
Machine HERMES_HOME
Machine HERMES_AGENT_ROOT
Machine PATH
Home ACL
```

Upgrade 可以重新执行：

```text
Ensure Environment
Ensure ACL
```

但必须幂等。

---

# 34. Installer Repair

Repair L2/L4/L5 增加：

```text
Environment Repair
ACL Repair
```

检查：

```text
HERMES_HOME
HERMES_AGENT_ROOT
PATH

Program ACL
Home ACL
```

发现漂移时恢复期望状态。

---

# 35. Installer Uninstall

Uninstall 删除：

```text
ProgramRoot
Gateway Scheduled Task

HERMES_HOME environment variable
HERMES_AGENT_ROOT environment variable

Hermes PATH entries
```

默认继续保留：

```text
C:\ProgramData\SMC\Hermes
```

防止删除：

```text
config
auth
profiles
skills
sessions
workspace
```

因此即使卸载程序：

```text
Hermes Business Data
=
Preserved
```

---

# 36. 代码改造范围

## 36.1 SMC Repository

修改：

```text
infra/windows/hermes-agent/scripts/
└── SmcHermesManaged.psm1
```

新增或调整：

```text
Set-SmcHermesEnvironment
Remove-SmcHermesEnvironment

Add-SmcMachinePath
Remove-SmcMachinePath

Set-SmcHermesProgramAcl
Set-SmcHermesHomeAcl

Assert-SmcHermesProgramAcl
Assert-SmcHermesHomeAcl
```

---

## 36.2 InstallerCore

修改：

```text
infra/windows/hermes-agent/installer/
└── InstallerCore.psm1
```

集成：

```text
Environment Install
Environment Upgrade
Environment Repair
Environment Uninstall

Program ACL
Home ACL
```

---

## 36.3 Hermes Release Builder

修改 Hermes Windows Runtime Assembly：

```text
tools/release/hermes/
```

确保 Release Tree 包含：

```text
node/hermes-agent/
├── package.json
├── package-lock.json
└── node_modules/
```

并保证来源与 Hermes Release Source Revision 一致。

---

## 36.4 Hermes Internal Repository

修改内部 Hermes Agent Fork：

```text
hermes_cli/setup.py
hermes_cli/tools_config.py
```

必要时新增：

```text
hermes_cli/runtime_paths.py
```

统一提供：

```python
get_hermes_home()
get_node_workspace_root()
get_embedded_node_root()
```

避免多个模块自行拼装路径。

---

# 37. 推荐 Hermes Runtime Path API

企业 Fork 中统一：

```text
get_hermes_home()
        ↓
HERMES_HOME
        ↓
C:\ProgramData\SMC\Hermes
```

```text
get_node_workspace_root()
        ↓
HERMES_AGENT_ROOT
        ↓
D:\Programs\SMC\Hermes\node\hermes-agent
```

```text
get_program_root()
        ↓
Hermes executable location
        ↓
D:\Programs\SMC\Hermes
```

禁止：

```text
Path.home() / ".hermes"
```

作为 Managed Mode 的直接 SOT。

---

# 38. Windows Security Boundary

最终形成两个安全域：

```text
PROGRAM
D:\Programs\SMC\Hermes

Users:
Read + Execute
```

和：

```text
DATA
C:\ProgramData\SMC\Hermes

Users:
Modify
```

因此：

```text
员工可以改变自己的 Hermes 数据
```

但不能：

```text
改变企业发布的 Hermes Runtime
```

---

# 39. 测试范围

必须增加 Pester Tests。

## Environment

验证：

```text
HERMES_HOME Machine
HERMES_AGENT_ROOT Machine

PATH/bin exists once
PATH/scripts exists once
```

---

## ACL

管理员安装后以普通 Standard User 验证：

```text
ProgramRoot Read
ProgramRoot Execute

ProgramRoot Write = Denied

HERMES_HOME Read = PASS
HERMES_HOME Create = PASS
HERMES_HOME Modify = PASS
HERMES_HOME Delete Own File = PASS
```

---

## Hermes CLI

Standard User：

```powershell
hermes --version
hermes config path
hermes status
```

PASS。

---

## Hermes Setup

Standard User：

```text
hermes setup
```

Node Dependency 阶段必须：

```text
cwd =
D:\Programs\SMC\Hermes\node\hermes-agent
```

不得：

```text
C:\ProgramData\SMC\Hermes\profiles\<profile>\hermes-agent
```

---

# 40. Chromium 验收

Hermes setup 可以继续提示：

```text
Installing Chromium (~170MB one-time download)
```

但安装包：

```text
不得内置 Chromium
```

本版本验收只关注：

```text
npm install workspace 正确
```

---

# 41. Multi-Profile 验收

普通用户执行：

```powershell
hermes profile create writer
```

目标：

```text
C:\ProgramData\SMC\Hermes\
└── profiles\
    └── writer\
```

创建成功。

不得写入：

```text
C:\Users\<user>\.hermes\profiles\writer
```

---

# 42. Acceptance Criteria

| ID      | 验收条件                                   |
| ------- | -------------------------------------- |
| AC-2101 | MSI 自动设置 Machine `HERMES_HOME`         |
| AC-2102 | MSI 自动设置 `HERMES_AGENT_ROOT`           |
| AC-2103 | Machine PATH 自动增加 Hermes `bin`         |
| AC-2104 | Machine PATH 自动增加 Hermes `scripts`     |
| AC-2105 | PATH 重复执行不产生重复条目                       |
| AC-2106 | Standard User 可直接执行 `hermes --version` |
| AC-2107 | ProgramRoot Users 权限为 ReadAndExecute   |
| AC-2108 | Standard User 不可修改 ProgramRoot         |
| AC-2109 | HERMES_HOME Users 权限为 Modify           |
| AC-2110 | Standard User 可修改 config               |
| AC-2111 | Standard User 可创建 Profile              |
| AC-2112 | Standard User 可创建 Session              |
| AC-2113 | Standard User 可安装 Skill                |
| AC-2114 | `profiles` 默认目录存在                      |
| AC-2115 | `memories` 默认目录存在                      |
| AC-2116 | npm workspace 使用 `HERMES_AGENT_ROOT`   |
| AC-2117 | npm Windows command 使用 `npm.cmd`       |
| AC-2118 | Profile 路径不得作为 npm cwd                 |
| AC-2119 | Chromium 不进入 MSI                       |
| AC-2120 | Gateway 使用 Machine HERMES_HOME         |
| AC-2121 | Upgrade 保持环境变量                         |
| AC-2122 | Upgrade 保持 HERMES_HOME 数据              |
| AC-2123 | Repair 可以恢复环境变量                        |
| AC-2124 | Repair 可以恢复 ACL                        |
| AC-2125 | Uninstall 删除 Hermes PATH entries       |
| AC-2126 | Uninstall 删除 Hermes Machine Variables  |
| AC-2127 | Uninstall 默认保留 HERMES_HOME 数据          |
| AC-2128 | 不修改 `%USERPROFILE%\.hermes`            |
| AC-2129 | Standard User `hermes setup` PASS      |
| AC-2130 | Windows 10 Standard User 场景 PASS       |

---

# 43. No-Go 条件

存在以下任一情况，不允许进入下一版本：

```text
安装后需要人工设置 HERMES_HOME

安装后需要人工设置 PATH

普通员工需要管理员权限运行 Hermes

ProgramRoot 对普通 Users 可写

HERMES_HOME 对普通 Users 不可写

npm cwd 位于 profiles/<profile>

npm 依赖系统 Node.js

npm 执行 npm.ps1 导致 ExecutionPolicy 失败

Hermes setup 自动寻找
%USERPROFILE%\.hermes
而忽略 HERMES_HOME

Upgrade 重置 config / auth / sessions

Repair 不能恢复 ACL

MSI 内置 Chromium
```

---

# 44. Definition of Done

v2.1 完成后，企业客户端运行模型必须达到：

```text
IT Administrator
        │
        ▼
Install MSI
        │
        ├── D:\Programs\SMC\Hermes
        │       Users = ReadAndExecute
        │
        ├── C:\ProgramData\SMC\Hermes
        │       Users = Modify
        │
        ├── Machine HERMES_HOME
        │
        ├── Machine HERMES_AGENT_ROOT
        │
        └── Machine PATH
                │
                ▼
        Installation Complete
                │
                ▼
Employee Windows Account Login
                │
                ├── hermes --version
                ├── hermes setup
                ├── hermes profile
                ├── hermes skills
                ├── hermes chat
                └── SMC Work
```

最终环境：

```text
PROGRAM_ROOT
=
D:\Programs\SMC\Hermes

HERMES_HOME
=
C:\ProgramData\SMC\Hermes

HERMES_AGENT_ROOT
=
D:\Programs\SMC\Hermes\node\hermes-agent

MACHINE PATH
+=
D:\Programs\SMC\Hermes\bin
D:\Programs\SMC\Hermes\scripts
```

权限：

```text
D:\Programs\SMC\Hermes

SYSTEM                  FullControl
Administrators          FullControl
Users                   ReadAndExecute
```

```text
C:\ProgramData\SMC\Hermes

SYSTEM                  FullControl
Administrators          FullControl
Users                   Modify
```

Node Workspace：

```text
D:\Programs\SMC\Hermes\node\hermes-agent
```

Profile：

```text
C:\ProgramData\SMC\Hermes\profiles\<profile>
```

两者严格分离。

**v2.1 的完成标准是：IT 管理员完成一次 MSI 安装后，普通员工使用自己的 Windows 工号账号登录，不进行任何环境变量、目录权限或 Hermes 路径的人工配置，即可直接运行 Hermes、完成 `hermes setup`、创建 Profile，并正常读写 Machine Managed HERMES_HOME。**
