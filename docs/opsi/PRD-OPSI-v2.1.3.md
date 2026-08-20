# PRD-OPSI-v2.1.3 — Hermes Managed Workspace & Temporary Runtime Contract

**项目**：SMC Copilot  
**文档类型**：工程解决方案 PRD  
**版本**：v2.1.3  
**适用分支**：`opsi/prd-2.0`  
**适用模块**：`infra/windows/hermes-agent`、Hermes Windows Enterprise Runtime  
**目标平台**：Windows 10 / Windows 11 x64  
**状态**：Implementation Ready  
**日期**：2026-08-20

---

## 1. 版本目标

v2.1.3 在现有 Program/Data 分离基础上，进一步冻结 Hermes Windows 企业运行时的 Workspace、Temporary Data 和 Execution Context。

当前已实现：

```text
Program Root = D:\Programs\SMC\Hermes
HERMES_HOME  = C:\ProgramData\SMC\Hermes
```

但实际 Agent/Terminal 子进程仍可能继承安装用户或执行账户环境：

```text
Current Working Directory = C:\Users\Administrator
TEMP/TMP                  = C:\Users\Administrator\AppData\Local\Temp
Generated temporary code = user profile temp
```

本版本建立四根分离的 Managed Runtime Filesystem Contract：

```text
ProgramRoot   = 可执行 Runtime
HermesHome    = 持久化 Data Root
WorkspaceRoot = Agent Working Root
TempRoot      = Hermes Temporary Runtime Root
```

目标是消除默认运行过程中继续向 `C:\Users\<user>`、SystemProfile 或用户 `%TEMP%` 落盘，同时不破坏 Windows 用户真实 HOME/USERPROFILE 和 Terminal 后续 `cd` 持久化语义。

## 2. 当前问题

当前 Managed Layout 已创建 `workspace` 目录，并设置 Machine `HERMES_HOME`、`HERMES_AGENT_ROOT`、`HERMES_NODE_ROOT` 和 PATH，但尚未定义：

```text
WorkspaceRoot
TempRoot
terminal.cwd
TERMINAL_CWD
Gateway process TEMP/TMP
Scheduled Task WorkingDirectory
```

`HERMES_HOME` 正确并不等于 Agent Working Directory 或 Python tempfile 正确。HermesHome 是配置和持久数据根，不直接承担 Terminal CWD 语义。

## 3. Runtime Filesystem Contract

### 3.1 Program Root

```text
D:\Programs\SMC\Hermes
```

用途：Executable、Node runtime、Hermes Agent source/runtime、Scripts、Static dependencies。

原则：ProgramRoot 不存放用户生成内容，不作为 Agent Workspace，不作为 TempRoot。

### 3.2 Hermes Home

```text
C:\ProgramData\SMC\Hermes
```

用途：Configuration、Credentials、Profiles、Skills、Sessions、Memories、Logs、Workspace、Temp、State。保持现有 Installer Contract 不变。

### 3.3 Workspace Root

```text
WorkspaceRoot = C:\ProgramData\SMC\Hermes\workspace
```

用途：新 Terminal Session 初始 CWD、Agent 相对路径文件、生成文档/脚本、下载文件、Task artifacts 和普通工作文件。

WorkspaceRoot 属于 Persistent Managed Data，不因 Upgrade、Repair、Gateway Restart 或 Work Restart 被清空。

### 3.4 Temp Root

```text
TempRoot = C:\ProgramData\SMC\Hermes\tmp
```

用途：Python tempfile、Temporary code execution、Hermes sandbox、Transient scripts 和 Runtime intermediate files。

TempRoot 属于 Transient Managed Runtime Data，可以按受控策略清理，但只能清理 TempRoot 内满足条件的条目，禁止扩大到 HermesHome、`C:\ProgramData\SMC` 或用户 `%TEMP%`。

## 4. 目标目录布局

```text
D:\Programs\SMC\Hermes\
├── bin\
├── node\
├── scripts\
└── runtime\

C:\ProgramData\SMC\Hermes\
├── config.yaml
├── .env
├── auth.json
├── profiles\
├── skills\
├── sessions\
├── memories\
├── logs\
├── workspace\
│   ├── generated\
│   ├── downloads\
│   └── agent-created files
├── tmp\
│   ├── hermes_sandbox_*\
│   └── temporary execution files
└── state\
```

`generated`、`downloads` 可由 Hermes/业务按需创建；Installer 的最低职责是确保 WorkspaceRoot 与 TempRoot 存在并满足 ACL。

## 5. 非目标

本版本不修改：

- HermesHome、ProgramRoot、Gateway Port/API、OPSI Control Plane、Work Runtime Adapter 或 Chat Transport。
- Hermes Session/Profile/Model/Provider 配置体系。
- Windows 全局 TEMP/TMP、USERPROFILE、HOME、HOMEDRIVE、HOMEPATH。
- 用户或 Agent 主动 `cd` 到其他目录的能力。
- 每次 Terminal tool invocation 的 cwd 强制重置。

本版本不把 `HERMES_HOME` 改成 WorkspaceRoot，也不把 Windows 用户 HOME 指向 ProgramData。

## 6. FR-213-01 — Managed Layout

`infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1::Get-SmcHermesManagedLayout` 必须新增：

```powershell
WorkspaceRoot = Join-Path $hermesHome "workspace"
TempRoot      = Join-Path $hermesHome "tmp"
```

并将 `tmp` 纳入受管目录：

```powershell
Directories = @(
    "profiles",
    "skills",
    "sessions",
    "memories",
    "logs",
    "workspace",
    "tmp",
    "state"
)
```

Installer、Gateway、Repair、Doctor、HostOperations 和测试必须从 `Get-SmcHermesManagedLayout` 读取这些路径，禁止自行拼接或维护第二套常量。

## 7. FR-213-02 — Workspace/Temp 初始化与 ACL

`Initialize-SmcHermesManagedHome` 必须确保 WorkspaceRoot 与 TempRoot 存在，并继承/满足现有 Hermes Home ACL：

```text
SYSTEM          FullControl
Administrators  FullControl
Users           Modify
```

初始化必须幂等。普通 Windows 用户可在 WorkspaceRoot 创建、修改和删除用户生成内容；Gateway/SYSTEM 可在 TempRoot 创建和清理临时文件。

路径必须继续通过 managed path 安全检查：绝对本地路径、非 UNC、不在 User Profile/SystemProfile，且 resolved path 严格位于 HermesHome 下。

## 8. FR-213-03 — terminal.cwd 配置契约

`config.yaml` 必须包含：

```yaml
terminal:
  cwd: "C:\\ProgramData\\SMC\\Hermes\\workspace"
```

语义：`terminal.cwd` 只定义新 Terminal Session 的初始工作目录。

配置更新必须使用 Patch/Merge，禁止覆盖或重新生成整个 `config.yaml`。必须保留 models、providers、gateway、plugins、skills、profiles、tools、auth 和未知扩展字段。

Managed Enterprise Mode 处理规则：

- 不存在 `terminal.cwd`：添加 WorkspaceRoot。
- 已存在但值不同：强制修正为 WorkspaceRoot。
- 已经正确：保持文件语义与其他字段不变，避免无意义重写。

## 9. FR-213-04 — Config 安全更新

配置 enforcement 必须：

1. 获取 layout 与 ConfigPath。
2. 对现有 config 创建同目录备份/临时文件。
3. 结构化合并 `terminal.cwd`，禁止用会破坏嵌套 YAML 的裸正则替换。
4. 以 UTF-8 写入同目录临时文件。
5. 使用安装包内 `hermes.exe config check` 验证临时/候选配置或完成替换后验证。
6. 验证成功后原子替换；失败恢复原文件并抛错。

实施时优先复用 Hermes CLI 的配置 set/validate 能力；若其不能对指定文件安全 patch，则提供范围受限、可测试的 YAML merge helper。不得引入客户端联网依赖。

## 10. FR-213-05 — Gateway Runtime Environment

Gateway Process 必须显式设置：

```text
HERMES_HOME       = C:\ProgramData\SMC\Hermes
HERMES_AGENT_ROOT = D:\Programs\SMC\Hermes\node\hermes-agent
HERMES_NODE_ROOT  = D:\Programs\SMC\Hermes\node
TERMINAL_CWD      = C:\ProgramData\SMC\Hermes\workspace
TEMP              = C:\ProgramData\SMC\Hermes\tmp
TMP               = C:\ProgramData\SMC\Hermes\tmp
```

Gateway launcher 必须在调用 `hermes.exe gateway run` 前执行：

```powershell
Set-Location -LiteralPath $workspaceRoot
```

所有值来自 Managed Layout，不得硬编码第二套路径。

## 11. FR-213-06 — Scheduled Task Working Directory

`SMC Hermes Gateway` Scheduled Task Action 的 WorkingDirectory 必须从 ProgramRoot 改为 WorkspaceRoot：

```powershell
New-ScheduledTaskAction `
    -Execute $psExe `
    -Argument $command `
    -WorkingDirectory $workspaceRoot
```

形成三级保护：

```text
config.yaml terminal.cwd
        ↓
TERMINAL_CWD + Set-Location
        ↓
Scheduled Task WorkingDirectory
```

## 12. FR-213-07 — TEMP/TMP 作用域

TEMP/TMP 只允许注入 Gateway Process 及其子进程。禁止设置 Machine 或 User TEMP/TMP：

```text
Windows User Process  → existing user TEMP
Work                  → existing environment
OPSI                  → existing environment
Hermes Gateway        → HermesHome\tmp
Hermes Child Process  → HermesHome\tmp
```

`Set-SmcHermesEnvironment` 继续只管理 Hermes 专用 Machine 变量和 ProgramRoot PATH，不得新增 Machine TEMP/TMP/TERMINAL_CWD。

## 13. FR-213-08 — HOME/USERPROFILE Contract

禁止修改：

```text
HOME
USERPROFILE
HOMEDRIVE
HOMEPATH
```

Windows 用户环境保持真实；`HERMES_HOME` 仅表示 Hermes Enterprise Data Root。不得以修改 HOME/USERPROFILE 作为 Workspace 修复方式，避免污染 Git、SSH、npm、Python、Cloud CLI 或其他用户工具。

## 14. FR-213-09 — Terminal Persistence

v2.1.3 只保证新 Terminal Session 的 initial cwd 为 WorkspaceRoot。

用户执行：

```powershell
cd C:\project-a
```

后续同一 Terminal Session 可以保持 `C:\project-a`。不得在每次 tool invocation 前强制 `Set-Location WorkspaceRoot`。

## 15. FR-213-10 — 文件落盘规则

默认相对路径文件：

```python
open("verify-baidu-search.py", "w")
```

应写入：

```text
C:\ProgramData\SMC\Hermes\workspace\verify-baidu-search.py
```

Python tempfile：

```python
tempfile.NamedTemporaryFile()
```

应写入 TempRoot。Hermes sandbox 应位于：

```text
C:\ProgramData\SMC\Hermes\tmp\hermes_sandbox_*
```

## 16. FR-213-11 — Install/Upgrade 生命周期

Install 顺序：

```text
Install Program Tree
  ↓
Initialize HermesHome/WorkspaceRoot/TempRoot
  ↓
Enforce terminal.cwd
  ↓
Set Machine Hermes Environment
  ↓
Register Gateway Task with managed execution context
  ↓
Start/Readiness
```

Upgrade 必须保留 HermesHome、Workspace、Sessions、Memories、Skills 和 Config，并重新执行：

```text
Ensure WorkspaceRoot/TempRoot
Enforce terminal.cwd
Re-register Gateway Task
Reapply Gateway process environment
```

不得因旧版本已存在而跳过 contract enforcement。

## 17. FR-213-12 — Repair Contract

Repair Level 1+ 至少验证：

```text
HERMES_HOME
WorkspaceRoot
TempRoot
terminal.cwd
Gateway Scheduled Task WorkingDirectory
Gateway TERMINAL_CWD/TEMP/TMP
```

Repair 必须能恢复 workspace/tmp 缺失、terminal.cwd 缺失/错误、Task CWD 错误和 Task runtime env 错误，然后按 managed lifecycle 重启/协调 Gateway。

Repair readiness 不得只检查 Task 存在；必须检查 Task Action contract 和配置 contract。

## 18. FR-213-13 — Uninstall 与 Preserve Data

Uninstall 继续删除 Program Runtime、Task、Installer-owned Machine env/PATH/state，并保留 HermesHome 持久数据。

WorkspaceRoot 不得被普通 Upgrade、Repair 或默认 Uninstall 删除。TempRoot 可以在 Uninstall 清理，但必须满足：

- resolved target 精确等于 Managed Layout TempRoot。
- target 严格位于 HermesHome 内。
- 不跟随/扩大到 reparse point、UNC、ProgramData SMC root 或用户 TEMP。

若无法安全证明目标，fail closed 并保留 TempRoot。

## 19. FR-213-14 — HostOperations 单一 SOT

`infra/windows/hermes-agent/scripts/HostOperations.ps1` 不得继续维护独立的 HermesHome/ProgramRoot 常量，必须导入/使用 `Get-SmcHermesManagedLayout` 获取：

```text
HermesHome
ProgramRoot
WorkspaceRoot
TempRoot
ConfigPath/Logs/Sessions derived paths
```

Config apply、Repair、Collect 操作继续遵循现有权限与范围，不引入第二套目录 contract。

## 20. FR-213-15 — Doctor 与 Runtime Diagnostic

Hermes 企业扩展或 SMC Doctor 至少输出：

```text
Hermes Home
Program Root
Workspace Root
Temp Root
terminal.cwd
Gateway Working Directory
Gateway TERMINAL_CWD/TEMP/TMP contract
```

每项给出 PASS/FAIL。Gateway 启动时记录结构化 context：

```json
{
  "event": "managed_runtime_context",
  "hermesHome": "C:\\ProgramData\\SMC\\Hermes",
  "workspaceRoot": "C:\\ProgramData\\SMC\\Hermes\\workspace",
  "tempRoot": "C:\\ProgramData\\SMC\\Hermes\\tmp",
  "terminalCwd": "C:\\ProgramData\\SMC\\Hermes\\workspace"
}
```

禁止记录 credentials、API keys、auth.json 内容或 `.env` values。

## 21. FR-213-16 — Temp Cleanup

v2.1.3 只实现基础 cleanup contract，不要求复杂 GC。允许删除满足全部条件的 TempRoot 直属/后代临时条目：

```text
Age > 24h
AND not locked
AND resolved path is strictly under TempRoot
AND not a reparse point escaping TempRoot
```

禁止删除 Workspace、Sessions、Profiles、Skills、Memories、Logs 或 HermesHome 其他目录。单个文件清理失败不应扩大删除范围；需记录脱敏 warning 并继续。

## 22. Security Contract

```text
ProgramRoot:
  Users          ReadAndExecute
  Administrators FullControl
  SYSTEM         FullControl

HermesHome/WorkspaceRoot/TempRoot:
  Users          Modify
  Administrators FullControl
  SYSTEM         FullControl
```

WorkspaceRoot/TempRoot 必须：本地绝对路径、位于 HermesHome、非 UNC、非 User Profile、非 SystemProfile。ProgramRoot 不可写仍是强约束。

## 23. 自动化测试要求

### 23.1 Managed Layout Tests

- Layout 暴露 WorkspaceRoot/TempRoot。
- `Directories` 包含 `workspace`/`tmp`。
- 初始化创建二者并满足 Home ACL。
- Test Root override 下仍保持相同相对 contract。

### 23.2 Config Tests

输入仅含 models/providers 等字段时，merge 后保留原字段并添加 terminal.cwd；已有错误 terminal.cwd 时 Repair 强制修正；正确值时幂等；malformed YAML/config check 失败时原文件不变。

### 23.3 Installer/Gateway Tests

Launcher 必须包含 `HERMES_HOME`、`HERMES_AGENT_ROOT`、`HERMES_NODE_ROOT`、`TERMINAL_CWD`、TEMP、TMP 和 `Set-Location`；Scheduled Task WorkingDirectory 等于 WorkspaceRoot。

### 23.4 Lifecycle Tests

- Install 创建目录并 enforce config/task。
- Upgrade 保留 Workspace 文件并重建 execution context。
- Repair 恢复删除/漂移的目录、config 和 Task contract。
- Uninstall 默认保留 Workspace，Temp cleanup 不越界。

### 23.5 Leakage/Negative Tests

生产代码不得把 USERPROFILE、AppData Local Temp、`os.homedir()` 或 `%TEMP%` 作为 Hermes 默认 Workspace/Temp root；fixtures/tests 除外。拒绝 UNC、User Profile、SystemProfile、路径穿越和 reparse escape。

## 24. CI Gates

- **Managed Layout Gate**：WorkspaceRoot/TempRoot 存在且位于 HermesHome。
- **Config Gate**：`terminal.cwd == WorkspaceRoot`，配置其他字段保持。
- **Gateway Runtime Gate**：Task Action 包含 TERMINAL_CWD/TEMP/TMP，WorkingDirectory=WorkspaceRoot。
- **Machine Environment Gate**：Machine TEMP/TMP/HOME/USERPROFILE 未被修改。
- **User Directory Leakage Gate**：生产默认 contract 不使用 User Profile/用户 Temp。
- **Lifecycle Gate**：Upgrade preserve、Repair reconcile、Uninstall cleanup boundary 全部通过。

## 25. Real Windows Acceptance

安装后：

```powershell
[Environment]::GetEnvironmentVariable("HERMES_HOME", "Machine")
Test-Path C:\ProgramData\SMC\Hermes\workspace
Test-Path C:\ProgramData\SMC\Hermes\tmp
```

期望 HERMES_HOME 正确，两个目录均为 True；Machine TEMP/TMP、HOME/USERPROFILE 不变。

新 Agent Session：

```powershell
Get-Location
```

期望 WorkspaceRoot，不得是 User Profile、用户 Temp 或 ProgramRoot。

Python 验收：

```python
import os, tempfile
print(os.getcwd())
print(tempfile.gettempdir())
```

期望分别为 WorkspaceRoot、TempRoot。

相对路径生成文件应进入 WorkspaceRoot；同一 Terminal Session `cd workspace\project-a` 后下一次调用应保持 project-a，证明没有每次强制 reset。

## 26. Upgrade/Repair Acceptance

Upgrade 前创建 `workspace\user-file.txt`，升级后必须仍存在，同时 terminal.cwd、Task WorkingDirectory、TEMP/TMP contract 仍正确。

Repair 前人为把 terminal.cwd 改到 User Profile、删除 TempRoot、漂移 Task CWD/env；Repair 后必须恢复配置、重建目录、重注册/协调 Task 和 Gateway。

## 27. Acceptance Criteria

- **AC-21301**：HERMES_HOME 保持 `C:\ProgramData\SMC\Hermes`。
- **AC-21302**：WorkspaceRoot 固定为 `HERMES_HOME\workspace`。
- **AC-21303**：TempRoot 固定为 `HERMES_HOME\tmp`。
- **AC-21304**：config.yaml 的 terminal.cwd 固定为 WorkspaceRoot，其他配置保持。
- **AC-21305**：Gateway Process 设置 TERMINAL_CWD=WorkspaceRoot、TEMP/TMP=TempRoot。
- **AC-21306**：Scheduled Task WorkingDirectory=WorkspaceRoot。
- **AC-21307**：不修改 Machine/User TEMP/TMP、HOME 或 USERPROFILE。
- **AC-21308**：新 Terminal Session initial cwd=WorkspaceRoot。
- **AC-21309**：Agent 相对路径文件默认生成到 WorkspaceRoot。
- **AC-21310**：Python tempfile 默认进入 TempRoot。
- **AC-21311**：Terminal Session 后续 `cd` 可持久化，不被每次 reset。
- **AC-21312**：Upgrade 不删除 Workspace；Repair 恢复完整 contract。
- **AC-21313**：HostOperations 不维护独立目录 SOT。
- **AC-21314**：Temp cleanup 不越界且不删除持久数据。
- **AC-21315**：Windows 10/11 标准用户实机验收通过。

## 28. No-Go 条件

以下任一存在，不允许发布：

- `HERMES_HOME=workspace`，或 HOME/USERPROFILE/HOMEDRIVE/HOMEPATH 被改写。
- Machine/User TEMP/TMP 被设置为 Hermes TempRoot。
- 只创建 workspace 而未 enforce terminal.cwd。
- 只配置 terminal.cwd 而未设置 Gateway TEMP/TMP/CWD。
- Scheduled Task 仍以 ProgramRoot/User Profile 为 WorkingDirectory。
- 每次 Terminal tool invocation 强制 reset cwd。
- config patch 覆盖/丢失 models、providers、gateway、plugins、skills、profiles、tools、auth 或未知字段。
- Upgrade/Repair 删除 Workspace 用户文件。
- Temp cleanup 可扩展到 HermesHome、ProgramData SMC root、用户 Temp、UNC 或 reparse target。
- HostOperations/Doctor/Installer 继续各自维护冲突路径常量。
- 仅以 unit/smoke 代替真实 Windows Session/CWD/tempfile proof。

## 29. Definition of Done

v2.1.3 完成必须满足：

1. Managed Layout 唯一提供 ProgramRoot、HermesHome、WorkspaceRoot、TempRoot 及相关 Runtime 路径。
2. Install/Upgrade/Repair 幂等创建 WorkspaceRoot/TempRoot，保留 Workspace 数据并 enforce terminal.cwd。
3. Gateway Task 使用 WorkspaceRoot 作为 WorkingDirectory，并把 TERMINAL_CWD、TEMP、TMP 注入 Gateway Process。
4. Machine/User TEMP/TMP、HOME、USERPROFILE 保持原值。
5. HostOperations、Doctor、Installer、Tests 使用同一 Layout SOT。
6. Config merge 原子、可回滚、保留未知字段并通过 Hermes config validation。
7. Temp cleanup 仅处理 TempRoot 内超过 24h、未锁定且安全解析的条目。
8. 自动化 Layout/Config/Gateway/Lifecycle/Security gates 全部通过。
9. Windows 10/11 标准用户新 Session CWD、Python cwd/tempfile、相对文件、cd persistence、Upgrade/Repair 实机矩阵由操作员签署。

## 30. 最终运行时模型

```text
                     OPSI
                      │ lifecycle owner
                      ▼
        D:\Programs\SMC\Hermes
                ProgramRoot
                      │
                      ▼
                 hermes.exe
                      │
                      ▼
                   Gateway
          ┌───────────┼────────────┐
          │           │            │
          ▼           ▼            ▼
     HERMES_HOME   TERMINAL_CWD   TEMP / TMP
          │           │            │
          ▼           ▼            ▼
C:\ProgramData\  ...\workspace   ...\tmp
SMC\Hermes
```

自动化实施完成不等于 Release GO；最终 Windows 实机证明必须由操作员执行并签署。
