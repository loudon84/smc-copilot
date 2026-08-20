---
name: opsi v2.1.5 path immutability
overview: 按 PRD-OPSI-v2.1.5 冻结 Windows PATH Immutability Contract：从 Hermes 生产生命周期删除一切持久化 Machine/User PATH 修改能力，Gateway 改用 process-local PATH，并加不变式 Gate、静态/WiX/Release Gate 与测试隔离。
todos:
  - id: remove-path-api
    content: "SmcHermesManaged.psm1: 删除 Add/Remove-SmcMachinePath 函数与导出；Set/Remove-SmcHermesEnvironment 移除 PATH 调用；Initialize rollback 移除 prevMachinePath 捕获与恢复"
    status: completed
  - id: doctor-path-policy
    content: Get-SmcHermesManagedDoctorReport 增加 Hermes CLI Path / CLI Exists / PATH Policy / Gateway Process PATH contract 诊断段
    status: completed
  - id: gateway-process-path
    content: InstallerCore Get-SmcHermesGatewayTaskSpec launcher 注入 process-local PATH (bin;scripts;node;inherited)，保留 inherited、无尾随分隔符
    status: completed
  - id: path-equality-gate
    content: InstallerCore 新增 snapshot/equality helper 并在 Install/Upgrade/Repair/Uninstall success 与 rollback 路径接入 Ordinal 相等 Gate + digest 日志，变化抛 ENVIRONMENT_PATH_MUTATED
    status: completed
  - id: static-wix-release-gate
    content: 新增 path_policy_gate.py 静态扫描 + WiX Environment PATH Gate；verify_client_release 接入 PATH Policy 与 environment.path.policy=immutable
    status: completed
  - id: pester-isolation
    content: 重写 SmcHermesManaged.Tests.ps1 / Installer.Tests.ps1：PATH 不变式、setter 从未调用、process PATH 顺序、rollback 不写 PATH，测试不触真实 registry
    status: completed
  - id: python-tests
    content: 新增 test_path_policy_gate：静态扫描命中/allowlist、WiX Gate、release verification policy 字段
    status: completed
  - id: work-regression
    content: Work TS 回归测试：Machine PATH 无 Hermes 时绝对 CLI 解析 + process-local PATH 仍 READY，不依赖 where hermes
    status: completed
  - id: runbook
    content: 新增 docs/opsi/RUNBOOK-OPSI-v2.1.5-path-immutability.md 覆盖 PATH-001..015 手工签署步骤
    status: completed
isProject: false
---

# PRD-OPSI-v2.1.5 — Windows PATH 不可变契约实施

沿用既定约定：P0 + P1 全部代码化实现并配单测/静态 Gate；真实 Windows 10/11 lifecycle live PATH 相等矩阵（AC-21514 / DoD §39.9-10）由操作员现场签署，不在纯代码环境执行。SmartCopilot/Desktop forensic 审计与 legacy migration 工具属独立 Track（§38），本版不交付。

## P0-1 删除持久化 PATH 变更 API（`SmcHermesManaged.psm1`）

文件：[SmcHermesManaged.psm1](infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1)

- `Set-SmcHermesEnvironment`（L146-162）：删除 `Add-SmcMachinePath -Entry $layout.BinPath/ScriptsPath`（L160-161）。仅保留 3 个专属 Machine 变量 + 对应 process 变量（FR-215-03）。
- `Remove-SmcHermesEnvironment`（L164-174）：删除 `Remove-SmcMachinePath`（L172-173），只删 3 个 Installer-owned 变量，不读/写 PATH（FR-215-04）。
- 整体删除 `Add-SmcMachinePath`（L176-192）与 `Remove-SmcMachinePath`（L194-202）两个函数（FR-215-05）。
- `Initialize-SmcHermesManagedHome`：删除 `$prevMachinePath` 捕获（L369）与 rollback 中 `SetEnvironmentVariable("PATH", $prevMachinePath, "Machine")`（L395），rollback 只回滚 3 个专属变量（FR-215-03/rollback）。
- `Export-ModuleMember`（L1197-1198）：移除 `Add-SmcMachinePath` / `Remove-SmcMachinePath`。
- `Get-SmcHermesManagedDoctorReport`（L1108+）：新增诊断段（FR-215-10）：
  - `Hermes CLI Path` = `$layout.CliPath`（绝对路径）
  - `CLI Exists` PASS/FAIL
  - `PATH Policy` = PASS — persistent Hermes PATH not required（Machine PATH 无 Hermes 不判 FAIL，FR-215-10 末句）
  - `Gateway Process PATH contract` PASS/FAIL：扩展现有 task Arguments 检查（当前 L1163 校验 TERMINAL_CWD/TEMP/TMP）追加 `PATH` 存在校验。

## P0-2 Gateway process-local PATH + 不变式 Gate（`InstallerCore.psm1`）

文件：[InstallerCore.psm1](infra/windows/hermes-agent/installer/InstallerCore.psm1)

- `Get-SmcHermesGatewayTaskSpec`（L305-349）launcher：在 `& '$cli' gateway run` 前注入 process-local PATH（FR-215-06/07/08）：

```powershell
$managedPath = @($layout.BinPath, $layout.ScriptsPath, $layout.NodeRoot) -join ";"
$env:PATH = if ([string]::IsNullOrEmpty($env:PATH)) { $managedPath } else { "$managedPath;$env:PATH" }
```

  - Hermes 路径固定置前；空 inherited 不产生尾随分隔符；不 split/normalize inherited；路径全部来自 `Get-SmcHermesManagedLayout`（无第二套硬编码）。
- 新增 helper：
  - `Get-SmcEnvironmentPathSnapshot`：读原始 Machine/User PATH，区分 null 与 empty，产出 `machinePathSha256/userPathSha256` 与 `schema=smc.windows.environment-snapshot.v1`（FR-215-12），仅落 digest。
  - `Assert-SmcEnvironmentPathUnchanged -Before -After`：`[string]::Equals($before,$after,[StringComparison]::Ordinal)`，不做任何 split/normalize/sort/dedupe/trim/case（FR-215-13，No-Go §37）。
- 在 `Install-`（L594）/`Upgrade-`（L636）/`Repair-`（L670）/`Uninstall-SmcHermesAgent`（L710）：
  - 入口 capture before（内存原始值 + digest）。
  - success 分支在 `Commit-SmcControlOwner` 前、catch/rollback 分支退出前均调用 equality Gate（覆盖 success 与 handled failure）。
  - 变化时抛 `ENVIRONMENT_PATH_MUTATED` 记录 before/after SHA256，判操作失败，不猜测/修复/恢复 PATH（FR-215-13）。
  - 输出日志：`environment.path.policy=immutable` + `machinePath.before/after.sha256` + `machinePath.unchanged` + user 同（FR-215-28），默认不输出完整 PATH。

## P0-3 静态 / WiX / Release Gate（Python，`tools/release`）

- 新增 [path_policy_gate.py](tools/release/hermes/path_policy_gate.py)：扫描 `infra/windows/hermes-agent/**` 生产源（大小写/换行/PowerShell/.NET/WiX 写法），命中即 `PERSISTENT_PATH_MUTATION_FORBIDDEN`（FR-215-25）：
  - `SetEnvironmentVariable("PATH"|"Path", ..., "Machine"|"User")`、`[EnvironmentVariableTarget]::Machine/User` + PATH、`setx PATH/Path`、`HKCU:\Environment` Path 写、`Session Manager\Environment` Path 写、WiX `<Environment Name="PATH">`。
  - allowlist 仅限 `tests/` fixture 与将来独立 migration 目录，禁止覆盖 lifecycle 生产文件。
  - WiX Gate：断言 [Product.wxs](infra/windows/hermes-agent/installer/Product.wxs) 与 [Bundle.wxs](infra/windows/hermes-agent/installer/Bundle.wxs) 及 CustomAction payload 无 PATH `<Environment>`（FR-215-26）。
- Release verification：在 [verify_client_release.py](tools/release/client/verify_client_release.py) 的 Hermes 校验路径接入 PATH Policy 断言并要求 metadata `environment.path.policy=immutable`（FR-215-27），任一不满足则发布失败。

## P0-4 测试隔离与不变式（Pester + Python）

- [SmcHermesManaged.Tests.ps1](infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1)：
  - 删除 `Add/Remove-SmcMachinePath` 用例（L206-222）与真实 Machine PATH 保存/恢复（L21、L56）（FR-215-21，No-Go）。
  - 新增：`Set/Remove-SmcHermesEnvironment` 只动 3 个专属变量；persistent PATH setter 从未被调用（Mock 断言）；rollback 不写 PATH；Doctor `PATH Policy` 段。
- [Installer.Tests.ps1](infra/windows/hermes-agent/tests/Installer.Tests.ps1)：
  - 用 Environment abstraction/Mock 断言 install/upgrade/repair/uninstall/rollback 前后 Machine/User PATH raw 相等；Gateway launcher PATH 顺序 bin;scripts;node;inherited 且不丢 inherited；snapshot/equality Gate 在 commit 前触发；测试清理不写真实 registry PATH。
- Python：新增 `test_path_policy_gate` 覆盖静态扫描命中/allowlist、WiX Gate、release verification policy 字段。

## P1（进入本版 DoD）

- Doctor/HostOperations/Repair 绝对 CLI：现状已用 `$layout.CliPath`（[HostOperations.ps1](infra/windows/hermes-agent/scripts/HostOperations.ps1)）；核对无裸 `hermes`/`where hermes`，PATH policy 诊断由 P0-1 覆盖（FR-215-10）。
- Work 回归（adapter 不改，FR-215-09/24）：新增 TS 测试证明 Machine PATH 无 Hermes 时 `getHermesCliPath()` 绝对解析 + `buildHermesCliEnv()` 生成 process-local PATH（bin/scripts/node + inherited）仍 READY，不依赖 `where hermes`（[hermes-cli-runner.ts](apps/work/src/main/runtime/hermes-cli-runner.ts) L21-37 已合规）。
- 新增验收 Runbook：`docs/opsi/RUNBOOK-OPSI-v2.1.5-path-immutability.md`，覆盖 Acceptance Matrix PATH-001..015 的真实 Windows 手工签署步骤（含 malformed/legacy entry 隔离 VM 场景）。

## 独立 Track（本版不交付，§38）

- SmartCopilot/Desktop PATH Writer Forensic 审计（FR-215-20）。
- Legacy PATH Recovery/Migration 工具 `smc-hermes-path-migrate.ps1`（FR-215-18/19）：不由 lifecycle 隐式调用；仅在静态 Gate allowlist 预留目录约定。

## 验证

- `pytest tools/release/tests -k "path_policy or client_release"`。
- `Invoke-Pester infra/windows/hermes-agent/tests`（本机）——单测不触真实 registry。
- 真实 Windows lifecycle 矩阵 + Gateway/Work live 由操作员按 Runbook 签署（AC-21514 / DoD 9-10）。