# PRD-OPSI-v2.1.5 — Windows PATH Immutability & Hermes Runtime Environment Isolation

**项目**：SMC Copilot  
**文档类型**：工程解决方案 PRD  
**版本**：v2.1.5  
**目标分支**：`opsi/prd-2.0`  
**适用模块**：Hermes Windows Runtime、MSI Installer、OPSI Deployment、Work Runtime  
**目标平台**：Windows 10 / Windows 11 x64  
**状态**：Implementation Ready  
**日期**：2026-08-20

---

## 1. 版本目标

v2.1.5 冻结 Windows PATH Immutability Contract：Hermes 在 Install、Upgrade、Repair、Uninstall 全生命周期中不得持久化修改 Machine PATH 或 User PATH；Hermes 可执行路径只通过 Managed Layout、绝对路径和 Process Environment 解析。

现场已发现 Machine PATH 存在分隔符丢失和多个 token 粘连：

```text
D:\ShadowBotd:\SmartCopilot\desktop\binC:\Users\Administrator\...
             ↑                         ↑
           缺少 ;                    缺少 ;
```

当前 `SmcHermesManaged.psm1` 的确具备读取、拆分、合并并重写完整 Machine PATH 的能力：

```text
Read Machine PATH
  ↓
Split / Modify / Join
  ↓
Rewrite complete Machine PATH
```

即使该 helper 不一定是所有历史损坏的原始来源，它仍违反企业 Runtime 环境隔离，必须从生产生命周期移除。

核心不变式：

```text
Machine PATH before operation == Machine PATH after operation
User PATH before operation    == User PATH after operation
```

比较必须是原始字符串的 Ordinal bit-for-bit equality，不做 split、normalize、sort、deduplicate 或大小写修正。

## 2. 根因边界

### 2.1 已确认的 Hermes Installer 设计缺陷

当前 `Set-SmcHermesEnvironment()` 调用 `Add-SmcMachinePath()`，`Remove-SmcHermesEnvironment()` 调用 `Remove-SmcMachinePath()`；初始化失败 rollback 也会重新写完整 Machine PATH。因此 Install、Repair、Upgrade、Uninstall 和失败回滚均可能触碰非 Hermes 所属环境配置。

该能力必须删除。

### 2.2 未确认的历史 corruption source

当前损坏内容包含 SmartCopilot、Desktop、Cursor、VS Code、WindowsApps、nvm 等历史路径。合法的 `-split ';'` / `-join ';'` 本身不足以解释全部 token 粘连，因此不得在无证据时把所有损坏归因于 Hermes MSI。

历史 SmartCopilot/Desktop/其他 installer 的 PATH writer 审计进入独立 Forensic Track，不阻塞本 PRD 删除 Hermes persistent PATH mutation。

## 3. 当前实现问题

### 3.1 Install/Repair/Upgrade

`Set-SmcHermesEnvironment()` 合法设置三个 Hermes 专属 Machine 变量，但随后添加 ProgramRoot bin/scripts 到 Machine PATH：

```powershell
Add-SmcMachinePath -Entry $layout.BinPath
Add-SmcMachinePath -Entry $layout.ScriptsPath
```

前三个专属变量可以保留，PATH 操作必须取消。

### 3.2 Uninstall

即使只准备删除 Hermes entries，`Remove-SmcMachinePath()` 仍需读取和重写完整 Machine PATH，可能扩大既有 corruption。v2.1.5 后 Uninstall 不得读取 PATH 用于修改。

### 3.3 Rollback

Managed Home 初始化目前保存并恢复 Machine PATH。恢复操作本身也是完整 PATH writer。v2.1.5 必须从 rollback snapshot/restore 中移除 PATH，只回滚 Installer-owned Hermes variables。

### 3.4 Tests

现有 Pester 验证 Machine PATH 包含 Hermes bin/scripts，并直接保存/恢复真实 Machine PATH。该测试反向固化错误架构，必须替换为 PATH immutable tests，且 unit tests 不得写真实 Machine/User registry PATH。

### 3.5 WiX

当前 Product.wxs 没有 `<Environment Name="PATH" ...>`，应保持。修复点主要位于 PowerShell Managed Runtime/Installer 层，同时增加 WiX static gate 防回归。

## 4. 非目标

v2.1.5 不负责：

- 自动修复已经损坏的 SmartCopilot、Desktop、Cursor、VS Code、WindowsApps、nvm 等 PATH。
- 根据 `C:\`、`D:\` 或产品名猜测缺失分号。
- 自动清理历史 Hermes PATH entry。
- 将 PATH migration 绑定到 Install、Upgrade、Repair 或 Uninstall。
- 为命令行便利重新注册 Machine/User PATH。

历史恢复与 writer 定位分别进入 Legacy PATH Migration 和 PATH Writer Forensic Track。

## 5. Runtime Environment Isolation Contract

最终模型：

```text
Machine Environment
├── HERMES_HOME
├── HERMES_AGENT_ROOT
└── HERMES_NODE_ROOT

Machine PATH / User PATH
└── immutable

Gateway Process Environment
├── HERMES_HOME
├── HERMES_AGENT_ROOT
├── HERMES_NODE_ROOT
├── TERMINAL_CWD
├── TEMP / TMP
└── PATH
    ├── Hermes\bin
    ├── Hermes\scripts
    ├── Hermes\node
    └── inherited process PATH
```

Persistent Environment 与 Runtime Process Environment 必须严格分离。

## 6. FR-215-01 — PATH Immutability

以下操作不得修改 HKLM/HKCU PATH：

```text
Fresh Install
Upgrade
Repair
Uninstall
Failure rollback
Repeated/idempotent invocation
```

受保护目标：

```text
HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path
HKCU\Environment\Path
```

不变式使用 `[StringComparison]::Ordinal` 比较读取到的原始字符串，包括 null/empty、空 token、重复 entry、大小写、引号和尾部分号。

## 7. FR-215-02 — Machine Environment Allowlist

Installer 仅允许持久化设置/删除：

```text
HERMES_HOME       = C:\ProgramData\SMC\Hermes
HERMES_AGENT_ROOT = D:\Programs\SMC\Hermes\node\hermes-agent
HERMES_NODE_ROOT  = D:\Programs\SMC\Hermes\node
```

禁止持久化修改：

```text
PATH
TEMP
TMP
HOME
USERPROFILE
HOMEPATH
HOMEDRIVE
```

TEMP/TMP/TERMINAL_CWD 只按照 v2.1.3 注入 Gateway Process，不进入 Machine/User scope。

## 8. FR-215-03 — Set-SmcHermesEnvironment

`Set-SmcHermesEnvironment()` 只负责三个 Hermes 专属 Machine 变量和当前安装进程对应变量，不得调用任何 persistent PATH helper/API。

目标行为：

```powershell
[Environment]::SetEnvironmentVariable("HERMES_HOME", $HermesHome, "Machine")
[Environment]::SetEnvironmentVariable("HERMES_AGENT_ROOT", $layout.AgentRoot, "Machine")
[Environment]::SetEnvironmentVariable("HERMES_NODE_ROOT", $layout.NodeRoot, "Machine")

$env:HERMES_HOME = $HermesHome
$env:HERMES_AGENT_ROOT = $layout.AgentRoot
$env:HERMES_NODE_ROOT = $layout.NodeRoot
```

ProgramRoot 参数与 Layout 必须经过现有 managed path assertion，避免传入路径与实际 Agent/Node roots 不一致。

## 9. FR-215-04 — Remove-SmcHermesEnvironment

Uninstall 只删除三个 Installer-owned Machine/Process variables，不读取、解析或写回 Machine/User PATH。

即使 PATH 中存在旧 Hermes entries，也必须保持原始值不变。历史残留由独立 migration tool 处理。

## 10. FR-215-05 — 删除 Persistent PATH Mutation API

生产代码最终删除：

```text
Add-SmcMachinePath
Remove-SmcMachinePath
```

并从 `Export-ModuleMember`、调用方、rollback 和 tests 中移除。不得仅标记 deprecated 后继续保留生产可达路径。

全仓 Hermes Windows production source 禁止：

```text
SetEnvironmentVariable("PATH"|"Path", ..., "Machine"|"User")
[EnvironmentVariableTarget]::Machine/User with PATH
setx PATH / setx Path
HKCU:\Environment Path writes
Session Manager\Environment Path writes
WiX <Environment Name="PATH">
```

发现时 Release FAIL：`PERSISTENT_PATH_MUTATION_FORBIDDEN`。

## 11. FR-215-06 — Gateway Process PATH

Gateway 仍需要私有 Hermes CLI、scripts、Node、npm/npx，因此 Scheduled Task launcher 必须构造 process-local PATH：

```powershell
$managedPath = @(
    $layout.BinPath,
    $layout.ScriptsPath,
    $layout.NodeRoot
) -join ";"

$inheritedPath = [string]$env:PATH
$env:PATH = if ([string]::IsNullOrEmpty($inheritedPath)) {
    $managedPath
} else {
    "$managedPath;$inheritedPath"
}
```

要求：

- Hermes paths 按固定顺序置前，确保 private Runtime 优先。
- 不丢弃 inherited process PATH，保留 Windows 系统工具访问。
- 不产生尾随粘连或在 inherited PATH 为空时生成无意义分隔符。
- process 退出后该 PATH 随进程消失，不写 Registry。

## 12. FR-215-07 — Gateway Execution Context

结合 v2.1.3，Gateway launcher 最终注入：

```text
HERMES_HOME       = layout.HermesHome
HERMES_AGENT_ROOT = layout.AgentRoot
HERMES_NODE_ROOT  = layout.NodeRoot
TERMINAL_CWD      = layout.WorkspaceRoot
TEMP / TMP        = layout.TempRoot
PATH              = bin;scripts;node;<inherited process PATH>
WorkingDirectory  = layout.WorkspaceRoot
```

所有路径来自 `Get-SmcHermesManagedLayout`，不允许第二套硬编码。

## 13. FR-215-08 — Process PATH 安全

Process PATH 构造必须：

- 使用 Layout 已验证的绝对本地目录。
- 拒绝 NUL、wildcard、UNC、User Profile/SystemProfile root。
- 不执行 split/normalize/rewrite inherited PATH。
- 不把 inherited PATH 写入日志、manifest、OPSI event 或 central telemetry。
- Gateway child processes 继承同一 PATH，确保 Node/MCP 可离线解析。

## 14. FR-215-09 — Work Runtime Independence

Work 必须通过 `getHermesRuntimeConfig()`/`getHermesCliPath()` 解析绝对 CLI，而不是 `where hermes` 或 PATH search。

Work subprocess helper 可以构造自己的 process-local enhanced PATH：ProgramRoot bin/scripts/node + inherited PATH。Machine PATH 中完全不存在 Hermes 时，RuntimeManager 仍应找到 CLI、探测 Gateway 并进入 READY。

本 PRD 不改变 Work Runtime Adapter 或 readiness contract，只增加回归证明。

## 15. FR-215-10 — OPSI HostOperations/Doctor

HostOperations、Doctor、Repair 和 Installer 必须通过 Managed Layout 的绝对 `CliPath` 调用 Hermes：

```powershell
& $layout.CliPath doctor
```

禁止裸调用 `hermes doctor`、`hermes gateway run` 或依赖 `where.exe hermes`。

Doctor 至少报告：

```text
Hermes CLI Path  <absolute path>
CLI Exists       PASS/FAIL
PATH Policy      PASS — persistent Hermes PATH not required
Gateway Process PATH contract PASS/FAIL
```

Machine PATH 中找不到 Hermes 不得被判为 Runtime Invalid。

## 16. FR-215-11 — 用户命令行行为

移除 persistent PATH 后，普通 CMD/PowerShell 中裸 `hermes doctor` 可能无法解析，这是正式可接受行为。

企业运维入口使用：

```powershell
D:\Programs\SMC\Hermes\bin\hermes.exe doctor
```

或调用以绝对路径实现的受管运维脚本。禁止以命令便利为由恢复 Machine/User PATH mutation。

## 17. FR-215-12 — Installer PATH Snapshot

Installer operation preflight 读取原始 Machine/User PATH，并只持久化 digest：

```json
{
  "schema": "smc.windows.environment-snapshot.v1",
  "capturedAt": "<UTC ISO-8601>",
  "operation": "install|upgrade|repair|uninstall",
  "machinePathSha256": "<sha256>",
  "userPathSha256": "<sha256>"
}
```

Hash 必须区分 null 与 empty，避免把不同原始状态误判相同。默认日志不包含完整 PATH。

本地、显式授权的 debug bundle 可保存完整 before/after snapshot，但必须 ACL 保护、标注敏感诊断数据，不能上传 central telemetry。

## 18. FR-215-13 — Transaction Integrity Gate

每个 lifecycle operation 在退出前重新读取原始 PATH：

```powershell
[string]::Equals($before, $after, [StringComparison]::Ordinal)
```

必须覆盖 success 与 handled failure/rollback 路径。若发生变化：

- 记录 `ENVIRONMENT_PATH_MUTATED` 与 before/after SHA256。
- 不猜测、normalize、repair 或恢复 PATH。
- 当前 operation 判为失败/验收失败，保留必要 rollback evidence。
- 不把 mutation 隐藏为 warning 后继续提交 READY。

该 Gate 证明 Hermes operation 期间观察到 PATH 变化，但不能在并发第三方 writer 存在时自动归因；日志需记录 operation window/timestamps。

## 19. FR-215-14 — Install Contract

Fresh Install 顺序：

```text
Capture PATH hashes/raw in memory
  ↓
Install Program Tree
  ↓
Initialize HermesHome/Workspace/Temp/config
  ↓
Set dedicated Hermes Machine variables
  ↓
Register Gateway with process-local PATH
  ↓
Gateway Health/Auth READY
  ↓
Verify PATH raw equality
  ↓
Commit success/control-owner
```

PATH integrity Gate 必须发生在最终 success commit 前。

## 20. FR-215-15 — Repair Contract

Repair 可以 reconcile HermesHome、Agent/Node roots、Gateway Task、Workspace、Temp、config 和 dedicated variables，但不得处理 persistent PATH。

Repair 前后 Machine/User PATH 必须完全相等；重复 Repair 也不得产生变化。

## 21. FR-215-16 — Upgrade Contract

从旧版本升级到 v2.1.5+ 时：

- 不删除已有 Hermes PATH entries。
- 不添加新 Hermes PATH entries。
- 不 normalize/deduplicate PATH。
- 不因发现 malformed PATH 而拒绝 Program Runtime upgrade；只要 before/after 不变即可。

冗余历史 entry 的风险低于重写完整 PATH 的风险。

## 22. FR-215-17 — Uninstall Contract

Uninstall 删除 Program Runtime、Gateway Task、Installer-owned dedicated env/state，但 Machine/User PATH 完全不变。

即使旧版本留下 Hermes PATH entry，也不自动清理。Uninstall 不得为了“恢复安装前状态”重写 PATH。

## 23. FR-215-18 — Legacy PATH Migration

历史 PATH cleanup 如需实施，必须作为独立工具/流程，例如 `smc-hermes-path-migrate.ps1`，并满足：

```text
Explicit Admin Operation
Backup before modification
Parse validation
Dry-run
Diff preview
Single-purpose migration
Rollback artifact
Audit log
```

该工具不得由 Install/Upgrade/Repair/Uninstall 隐式调用，不属于 v2.1.5 主交付。

## 24. FR-215-19 — Corrupted Client Recovery

对已损坏机器，优先保存仍然结构正常的当前 Process PATH，以及 Machine PATH/registry backup：

```text
process-path.txt
machine-path-broken.txt
machine-environment.reg
```

恢复来源优先级：

1. 安装前 Process Snapshot。
2. Registry Backup。
3. System Restore/Enterprise inventory。
4. 人工确认后的路径清单。

禁止基于 drive/path regex 自动猜测缺失分号。该 runbook/forensic 工作不由 MSI 自动执行。

## 25. FR-215-20 — PATH Writer Forensic Track

独立审计 SmartCopilot/Desktop/历史项目与 installer：

```text
SetEnvironmentVariable("Path"/"PATH")
setx PATH/Path
HKCU:\Environment
Session Manager\Environment
$env:Path =
PATH=
desktop\bin
smc-ai-copilot\bin
```

输出 PATH Writer Inventory：Source、scope、append algorithm、delimiter handling、install/upgrade/uninstall lifecycle、证据和 owner。未经源码/日志证据不得认定原始 corruption source。

## 26. FR-215-21 — Pester Unit Test 隔离

Pester 不再验证 Machine PATH 含 Hermes，也不直接保存/恢复真实 Machine/User PATH。

Unit tests 使用 Mock、Environment abstraction、test registry hive 或纯 Process Environment 验证：

- dedicated Machine variables 被正确设置/删除。
- persistent PATH setter 从未调用。
- process PATH 构造顺序和 inherited raw string 保持。
- rollback 不写 PATH。

测试清理本身也不得调用真实 Machine/User PATH setter。

## 27. FR-215-22 — Windows Integration Matrix

真实 Windows integration test 在每次 operation 前建立：

```text
M0 = raw Machine PATH
U0 = raw User PATH
```

依次执行 Fresh Install、Repair、Upgrade、Uninstall，每一步验证 raw equality。测试必须覆盖：

- 正常 PATH。
- 包含重复、空 token、尾部分号的 PATH。
- 已有 Hermes legacy entry。
- 已 malformed 但保持原样的 PATH（在隔离 VM/受控 registry 中）。
- repeated Install/Repair。

不得在生产机器构造 malformed PATH。

## 28. FR-215-23 — Gateway Process Regression

Machine PATH 不含 Hermes 时，Gateway Scheduled Task 必须：

- 启动成功。
- 使用 private `hermes.exe`、Node、npm/npx。
- Filesystem MCP 可解析。
- `/health` 与 Bearer `/v1/models` 通过。

测试需通过受控子进程输出/diagnostic 证明 process PATH 包含 bin/scripts/node，同时 registry PATH 没有新 Hermes entry。

## 29. FR-215-24 — Work Regression

Machine PATH 不含 Hermes 时：

```text
Work Startup
  ↓
RuntimeManager
  ↓
getHermesCliPath() absolute discovery
  ↓
CLI Found + Gateway Healthy/Auth
  ↓
READY + Chat PASS
```

不得使用 `where hermes` 作为成功前提。

## 30. FR-215-25 — Static CI Gate

CI 扫描 `infra/windows/hermes-agent/**`、相关 WiX/build/release production source，禁止 persistent PATH writers。扫描必须处理大小写、换行和 PowerShell/.NET/WiX 常见写法，并允许明确的 test fixture/forensic migration allowlist。

Gate 报错：

```text
PERSISTENT_PATH_MUTATION_FORBIDDEN
```

Allowlist 不得覆盖 Installer lifecycle 生产文件；独立 migration tool 必须位于明确目录且不能被生产入口调用。

## 31. FR-215-26 — MSI/WiX Gate

WiX source 必须保持无：

```xml
<Environment Name="PATH" ... />
```

同时检查 Bundle/CustomAction payload 中没有调用 PATH migration。Smoke build/read-back 需验证最终 MSI source/payload policy，而不仅扫描一个 Product.wxs。

## 32. FR-215-27 — Client Release Verification

`verify_client_release`/Hermes release verification 增加 PATH Policy：

- No persistent Machine/User PATH writer。
- Gateway uses process-local runtime paths。
- HostOperations/Doctor use absolute CLI。
- Work resolves absolute Hermes CLI。
- Runtime/Installer metadata 声明 `environment.path.policy=immutable`。

任一不满足，Client Release 不得发布。

## 33. FR-215-28 — Logging 与隐私

Installer 输出：

```text
environment.path.policy=immutable
machinePath.before.sha256=<digest>
machinePath.after.sha256=<digest>
machinePath.unchanged=true|false
userPath.before.sha256=<digest>
userPath.after.sha256=<digest>
userPath.unchanged=true|false
```

默认不输出完整 PATH。完整 PATH 可能暴露用户名、内部软件目录、产品名称和企业安装结构，禁止进入 central telemetry、OPSI event payload 或 remote logs。

## 34. 自动化测试要求

### 34.1 Unit/Static

- `Set/Remove-SmcHermesEnvironment` 不调用 PATH helper/setter。
- Add/Remove persistent PATH API 不再导出/可达。
- Gateway launcher 只写 `$env:PATH` process scope。
- Static/WiX Gate 拒绝 Machine/User PATH writer。
- HostOperations/Doctor 不裸调用 `hermes`/`where hermes`。

### 34.2 Lifecycle Integration

Install、Repair、Upgrade、Uninstall 前后 Machine/User PATH raw strings 相等，包含 success/failure/rollback/repeated paths。

### 34.3 Runtime/Work

Machine PATH 无 Hermes 时 Gateway Health/Auth、MCP、Doctor、OPSI HostOperations、Work READY/Chat 全部通过。

## 35. Acceptance Matrix

| ID | 场景 | 预期 |
| --- | --- | --- |
| PATH-001 | Fresh Install | Machine PATH bit-for-bit unchanged |
| PATH-002 | Fresh Install | User PATH bit-for-bit unchanged |
| PATH-003 | Repair | Machine/User PATH unchanged |
| PATH-004 | Upgrade | Machine/User PATH unchanged |
| PATH-005 | Uninstall | Machine/User PATH unchanged |
| PATH-006 | Machine PATH 无 Hermes | Work READY/Chat PASS |
| PATH-007 | Machine PATH 无 Hermes | Gateway Health/Auth PASS |
| PATH-008 | Gateway child process | bin/scripts/node available |
| PATH-009 | Machine registry | 无新 Hermes PATH entry |
| PATH-010 | User registry | 无新 Hermes PATH entry |
| PATH-011 | Repeated Install/Repair | PATH unchanged |
| PATH-012 | Existing malformed PATH | Installer 不 normalize/repair |
| PATH-013 | Existing Hermes legacy entry | Upgrade/Uninstall 不清理 |
| PATH-014 | Static/WiX scan | Persistent PATH writer = 0 |
| PATH-015 | Failure rollback | PATH unchanged |

## 36. Acceptance Criteria

- **AC-21501**：Install、Repair、Upgrade、Uninstall、rollback 均不修改 Machine PATH。
- **AC-21502**：上述操作均不修改 User PATH。
- **AC-21503**：Add/Remove persistent PATH APIs 从生产调用与 exports 移除。
- **AC-21504**：Gateway 使用 process-local PATH，私有 bin/scripts/node 优先且 inherited PATH 保持。
- **AC-21505**：Machine PATH 无 Hermes 时 Gateway Health/Auth、MCP 可用。
- **AC-21506**：Work/HostOperations/Doctor 使用 Runtime Config/Managed Layout absolute CLI，不依赖 `where hermes`。
- **AC-21507**：Machine PATH 无 Hermes 时 Work READY 并完成 Chat。
- **AC-21508**：Pester/unit tests 不写真实 Machine/User PATH。
- **AC-21509**：PATH transaction hash/equality Gate 在每个 lifecycle success commit 前执行。
- **AC-21510**：Static/WiX/Release gates 拒绝 persistent PATH writer。
- **AC-21511**：已有 malformed PATH 与 legacy Hermes entry 保持原样。
- **AC-21512**：日志默认只记录 PATH digest/unchanged，完整 PATH 不进入 remote/central telemetry。
- **AC-21513**：历史 writer/recovery 进入独立 forensic/migration，不由 MSI 自动执行。
- **AC-21514**：Windows 10/11 真实 lifecycle PATH equality 矩阵由操作员签署。

## 37. No-Go 条件

以下任一存在，不允许发布：

- Installer/Repair/Upgrade/Uninstall/rollback 调用任何 Machine/User PATH setter 或 migration。
- Unit/Pester 为清理测试而写回真实 registry PATH。
- Gateway、HostOperations、Doctor 或 Work 依赖 Machine PATH/`where hermes` 才能工作。
- 移除 persistent PATH 后 Gateway private Node/MCP 不可用。
- PATH equality 比较前进行了 split、normalize、sort、deduplicate、trim 或 case folding。
- 发现 before/after 不同后自动猜测、修复或覆盖 PATH。
- Upgrade/Uninstall 自动清理 legacy Hermes PATH entry。
- WiX 最终 source/payload 注册 PATH，或 static scan 只覆盖单一文件留下旁路。
- 完整 PATH 出现在 central telemetry、OPSI event 或默认 remote logs。
- 在无证据时把现场全部 PATH corruption 归因于 Hermes，或自动执行 forensic recovery。
- 仅以 unit/static gate 代替真实 Windows lifecycle/process/Work proof。

## 38. 源码改造范围

### P0

- `infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`：删除 Add/Remove persistent PATH、exports、rollback PATH restore。
- `infra/windows/hermes-agent/installer/InstallerCore.psm1`：Gateway process PATH、operation snapshot/equality Gate。
- `infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1`、`Installer.Tests.ps1`：immutable contract 与 test isolation。
- WiX/installer static/read-back gate。

### P1（进入本版本 DoD）

- HostOperations/Doctor/Repair/Release verification：absolute CLI 与 PATH policy diagnostics。
- Work regression：Machine PATH 无 Hermes仍 READY。
- Windows lifecycle integration/runbook。

### 独立 Track

- SmartCopilot/Desktop PATH Writer Audit。
- Legacy PATH Recovery/Migration Tool。

独立 Track 不得重新进入 Hermes MSI 主生命周期。

## 39. Definition of Done

v2.1.5 完成必须同时满足：

1. Hermes Installer、Repair、Upgrade、Uninstall 和 rollback 均不修改 Machine/User PATH。
2. Add/Remove persistent PATH helpers 不再被生产代码调用或导出，static/WiX/release gates 阻止回归。
3. Gateway 使用 Managed Layout 构造 process-local PATH，并在无 Hermes registry PATH 时完成 Health/Auth/MCP。
4. Work、OPSI HostOperations、Doctor 使用 absolute CLI，不依赖 PATH discovery。
5. PATH before/after raw equality 与 digest logging 覆盖所有 lifecycle operation；失败不自动修复 PATH。
6. Pester/unit tests 不写真实 Machine/User PATH。
7. 已有 malformed PATH 与 legacy Hermes entries 在 Upgrade/Uninstall 中保持原样。
8. 完整 PATH 只在显式本地 debug bundle 中保存，不进入 central telemetry/OPSI remote event。
9. Windows 10/11 Fresh Install、Repair、Upgrade、Uninstall、rollback、repeated operation PATH equality 全部通过。
10. Machine PATH 无 Hermes时 Work READY/Chat 与 Gateway `/health`/Bearer Auth 通过。
11. SmartCopilot/历史 writer forensic 与 legacy recovery 独立跟踪，不由 MSI 隐式执行。

## 40. 最终架构基线

```text
                 Windows Registry
                       │
          ┌────────────┴────────────┐
          │                         │
     Machine PATH               User PATH
          │                         │
          └────── IMMUTABLE ────────┘

                 Hermes Installer
                       │ only manages
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     HERMES_HOME   AGENT_ROOT   NODE_ROOT

                 Gateway Task
                       │ Process Environment
      ┌────────────────┼────────────────┐
      ▼                ▼                ▼
 TERMINAL_CWD       TEMP/TMP           PATH
                                       │
                       ┌───────────────┼───────────────┐
                       ▼               ▼               ▼
                    Hermes bin      scripts           node
```

v2.1.5 冻结后的工程不变式：

> Hermes 对 Windows PATH 只有运行时消费权，没有持久化修改权。所有 Hermes 可执行路径通过 Managed Layout、绝对路径和 Process Environment 解析，Machine PATH 与 User PATH 在安装、升级、修复、卸载全过程保持不可变。
