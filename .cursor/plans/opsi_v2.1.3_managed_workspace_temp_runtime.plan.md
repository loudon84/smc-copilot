---
name: OPSI v2.1.3 Managed Workspace & Temp Runtime
overview: 在现有 ProgramRoot/HERMES_HOME 分域上，新增 WorkspaceRoot 与 TempRoot 单一布局契约，原子 enforce config.yaml terminal.cwd，并将 Gateway Scheduled Task 的 CWD、TERMINAL_CWD、TEMP/TMP 收敛到受管目录，同时补齐 Repair、Doctor、HostOperations、安全清理和 Windows 实机门禁。
todos:
  - id: managed-layout-workspace-temp
    content: 扩展 SmcHermesManaged Layout 与初始化，新增 WorkspaceRoot/TempRoot、安全路径断言、ACL 和单元测试
    status: completed
  - id: managed-terminal-config
    content: 实现 config.yaml terminal.cwd 的结构化原子合并、校验、回滚与幂等测试
    status: completed
  - id: gateway-execution-context
    content: 将 Gateway Task WorkingDirectory、TERMINAL_CWD、TEMP/TMP 和启动 CWD 统一到 Managed Workspace/Temp
    status: completed
  - id: lifecycle-repair-cleanup
    content: 在 Install/Upgrade/Repair/Uninstall 中 enforce Workspace Contract，并实现严格限界的 Temp cleanup
    status: completed
  - id: hostops-doctor-single-sot
    content: 让 HostOperations、Doctor 与 Runtime diagnostics 使用 Get-SmcHermesManagedLayout 单一路径 SOT
    status: completed
  - id: automated-contract-gates
    content: 补齐 Layout、Config、Task、Lifecycle、泄漏与安全负向测试及 CI gates
    status: completed
  - id: manual-windows-workspace-proof
    content: 人工执行 Windows 10/11 标准用户 Session CWD、Python tempfile、相对文件、cd persistence、Upgrade/Repair 矩阵并签署；Cursor 不得自动完成
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v2.1.3 Managed Workspace & Temporary Runtime Contract

## 结果与边界

要实现：

- `Get-SmcHermesManagedLayout` 成为 ProgramRoot、HermesHome、WorkspaceRoot、TempRoot、AgentRoot、NodeRoot、Bin/Scripts/CLI 的唯一 SOT。
- `Initialize-SmcHermesManagedHome` 幂等创建 `workspace`/`tmp` 并复用 Home ACL；所有路径严格位于 Managed HermesHome。
- 原子、结构化地 enforce `config.yaml::terminal.cwd=WorkspaceRoot`，保留所有已有与未知字段，验证失败自动回滚。
- Gateway Task 以 WorkspaceRoot 为 WorkingDirectory，并仅在 Gateway Process/children 注入 TERMINAL_CWD=WorkspaceRoot、TEMP/TMP=TempRoot；不改 Machine TEMP/TMP/HOME/USERPROFILE。
- Install/Upgrade/Repair 重新 reconcile 目录、配置和 Task contract；Workspace 持久保留，Temp cleanup 严格限界。
- HostOperations、Doctor 和 diagnostics 使用同一 Layout；自动化和真实 Windows 标准用户验证 CWD/tempfile/文件落盘与 cd persistence。

明确不做：

- 不修改 HermesHome、ProgramRoot、Gateway Port/API、OPSI Control Plane、Work Runtime Adapter、Chat Transport 或 Hermes Profile/Session/Model/Provider 体系。
- 不将 HERMES_HOME 改为 WorkspaceRoot，不修改 HOME、USERPROFILE、HOMEDRIVE、HOMEPATH 或 Machine/User TEMP/TMP。
- 不禁止 Agent 主动切换目录，不在每次 Terminal tool invocation 前 reset cwd。
- 不构建复杂 GC、配额服务、resident cleanup service 或新 Endpoint Controller。
- 不修改 `infra/salt`、`services/salt-control`、`contracts/salt-control-api`、`services/runtime`、`contracts/runtime-api` 或 `apps/work`。
- 不自动完成 Windows Live Evidence、签名、Release GO 或生产发布。

## 上下文路由

立即读取：

- [`AGENTS.md`](AGENTS.md)：OPSI provider isolation 与禁止触碰范围。
- [`docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`](docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)：OPSI lifecycle owner 边界。
- [`docs/opsi/PRD-OPSI-v2.1.3.md`](docs/opsi/PRD-OPSI-v2.1.3.md)：全部 FR、AC、No-Go、DoD。
- [`docs/opsi/PRD-OPSI-v2.1.md`](docs/opsi/PRD-OPSI-v2.1.md)：Machine Environment、Program/Data ACL 与 Standard User 基线。
- [`infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`](infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1)：Layout、path assertion、ACL、environment、home initialization。
- [`infra/windows/hermes-agent/installer/InstallerCore.psm1`](infra/windows/hermes-agent/installer/InstallerCore.psm1)：Gateway Task、Install/Upgrade/Repair/Uninstall/readiness。
- [`infra/windows/hermes-agent/scripts/HostOperations.ps1`](infra/windows/hermes-agent/scripts/HostOperations.ps1)：当前独立路径常量与 operation surface。

按触发读取：

- Config enforcement 时只读取 Hermes CLI `config` 命令帮助/实现和现有 config schema/sample，确认是否支持指定文件的安全 set/check；不可用时再设计窄范围 YAML merge helper。
- Task validation 时读取 Pester 中现有 ScheduledTask mock/fixtures 与 bootstrap staging 逻辑，不读取真实 Task Scheduler 状态作为 unit proof。
- Doctor/diagnostic 时读取现有 `HostOperations.ps1` 的直接调用方和 release script allowlist，确保模块随 Runtime 打包。
- Cleanup 时读取现有 safe-path/remove helpers，不扫描运行时数据或真实用户 Temp。

禁止预加载：

- 历史 PRD/evidence、references、构建输出、运行时数据、旧 OPSI Product 全树、无关子项目。

## 当前事实与根因锚点

- Managed Layout 当前 `Directories` 已含 `workspace`，但未暴露 WorkspaceRoot，且没有 `tmp`/TempRoot。
- `Set-SmcHermesEnvironment` 已管理 HERMES_HOME/AGENT_ROOT/NODE_ROOT 和 PATH；它不得扩展为 Machine TEMP/TMP setter。
- `Set-SmcHermesGatewayTask` 当前只注入三个 Hermes 变量，WorkingDirectory 仍是 ProgramRoot，是 execution context 漂移的直接锚点。
- `Repair-SmcHermesAgent` Level 1 仅重启 Task，Level 2–4 只初始化 Home/ACL/readiness，尚不验证 config/task execution contract。
- `HostOperations.ps1` 当前硬编码 HermesHome/ProgramRoot，必须退出独立目录 SOT。
- 仓内没有通用 PowerShell YAML merge helper；不得用裸正则伪造结构化 merge。

## 最小方案判定

- Layout：在现有 PSCustomObject 增加两个字段并复用 test-root override，不建立第二个 config/registry SOT。
- Config：优先调用已打包 Hermes CLI 的安全 config set/check；只有 CLI 不支持指定文件原子 patch 时，才增加一个窄范围、离线、可测试的 merge helper。
- Gateway：复用现有 EncodedCommand，增加来自 Layout 的 env/Set-Location/WorkingDirectory；不设置 Machine TEMP/TMP。
- Repair：扩展现有 lifecycle core 的 reconcile/assert，不新建 resident repair agent。
- Cleanup：普通文件枚举 + canonical containment + age/lock/reparse checks；不使用宽泛递归删除命令。

## Todo — Managed Layout, Paths & ACL

### 结果

- Layout 在 production/test root 分支均暴露 WorkspaceRoot/TempRoot，值严格为 HermesHome 下 `workspace`/`tmp`。
- `Directories` 加入 tmp；初始化创建二者并确认 ACL 继承/实际 Users Modify、SYSTEM/Admin FullControl。
- 新增/扩展 containment assertion，拒绝 UNC、User Profile、SystemProfile、relative/wildcard/NUL、HermesHome 外部和 reparse escape。
- 环境 rollback 补齐当前 NodeRoot process/machine 状态，确保初始化失败不留下部分环境修改。

### 实施锚点

- 主锚点：[`infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`](infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1) 的 `Get-SmcHermesManagedLayout`/`Initialize-SmcHermesManagedHome`。
- 测试锚点：[`infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1`](infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1)。

### 变更预算与验证

- 新公共模块 0；新增路径字段 2；优先扩展现有 functions/tests。
- 最小验证：Windows PowerShell 5.1 下运行 Managed Pester suite。
- 停止条件：[ ] production/test layout 一致；目录/ACL 幂等；安全负向路径 fail closed；Machine TEMP/TMP/HOME/USERPROFILE 不变。

## Todo — Managed terminal.cwd Config

### 结果

- 提供单一 `Set/Assert-SmcHermesManagedTerminalConfig`（命名实施时按现有模块风格）从 Layout 获取 ConfigPath/WorkspaceRoot。
- 缺 terminal.cwd 时添加，错误时覆盖，正确时不产生无意义 rewrite；保留 comments/format 若所选工具支持，最低要求是保留全部数据字段与值。
- 写入使用同目录 temp + backup + atomic replace；调用 bundled `hermes.exe config check`，失败恢复原文件。
- malformed config、locked file、validation failure、path drift、unknown nested fields 均有正/负向测试。

### 实施锚点

- 主锚点：[`infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`](infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1) 或一个同目录专用 config module；先验证 Hermes CLI 是否提供安全原语。
- 串联锚点：[`infra/windows/hermes-agent/installer/InstallerCore.psm1`](infra/windows/hermes-agent/installer/InstallerCore.psm1) 的 Install/Repair。
- 测试锚点：现有 Managed/Installer Pester 文件，fixtures 覆盖 models/providers/unknown fields。

### 变更预算与验证

- 新生产 helper 文件最多 1；新增在线依赖 0；禁止 regex-only YAML edit。
- 最小验证：Pester config cases + `hermes.exe config check` integration（真实 Runtime 时）；fixture 只证明 merge/rollback。
- 停止条件：[ ] add/override/idempotent/rollback 全通过；原配置字段不丢；terminal.cwd 精确等于 WorkspaceRoot。

## Todo — Gateway Execution Context

### 结果

- Task launcher 从 Layout 注入 HERMES_HOME/AGENT_ROOT/NODE_ROOT、TERMINAL_CWD、TEMP、TMP，并在启动 Gateway 前 `Set-Location WorkspaceRoot`。
- `New-ScheduledTaskAction -WorkingDirectory` 改为 WorkspaceRoot；路径存在且 ACL 已完成后才注册 Task。
- `Test-SmcHermesReady`/专用 Task assertion 检查 Action working directory 与 decoded/launcher contract，不只检查 Task 存在。
- Gateway startup 输出脱敏 managed_runtime_context；不输出 env secret values。

### 实施锚点

- 主锚点：[`infra/windows/hermes-agent/installer/InstallerCore.psm1`](infra/windows/hermes-agent/installer/InstallerCore.psm1) 的 `Set-SmcHermesGatewayTask`。
- 候选触碰：单一 Gateway wrapper（仅当比 EncodedCommand 更可测试/可审计）、`Installer.Tests.ps1`。

### 变更预算与验证

- 新 wrapper 最多 1；不新增 Service/Task；不改变 Task name/principal/trigger。
- 最小验证：Pester mock/read-back 验证六变量、Set-Location、WorkingDirectory；installer smoke staging 验证脚本被打包。
- 停止条件：[ ] Task execution context 完整；TEMP/TMP 只在 launcher process；ProgramRoot/User Profile 不再作为 Task CWD。

## Todo — Lifecycle, Repair & Temp Cleanup

### 结果

- Install 在 Task 注册前 ensure dirs + config；Upgrade 保留 Workspace 文件并重新 enforce；Repair Level 1+ reconcile dirs/config/task env/CWD。
- Repair 漂移测试覆盖 workspace/tmp 删除、terminal.cwd 错误、Task working directory/env 错误。
- Uninstall 默认保留 Workspace；若清 TempRoot，先精确验证 target/containment/reparse，再逐项清理，任何不确定情况 fail closed。
- 基础 cleanup 仅删除 TempRoot 内 age>24h、未锁定、安全解析条目；失败记录 warning，不扩大范围。

### 实施锚点

- 主锚点：[`infra/windows/hermes-agent/installer/InstallerCore.psm1`](infra/windows/hermes-agent/installer/InstallerCore.psm1) 的 Install/Upgrade/Repair/Uninstall。
- 安全 helper 锚点：现有 managed path assertion/remove retry 的最小扩展。
- 测试锚点：[`infra/windows/hermes-agent/tests/Installer.Tests.ps1`](infra/windows/hermes-agent/tests/Installer.Tests.ps1)。

### 变更预算与验证

- 新 cleanup service/scheduler 0；使用当前 lifecycle 触发；不得递归删除 HermesHome 或 ProgramData SMC root。
- 最小验证：Pester lifecycle/negative cleanup cases，尤其 junction/reparse/UNC/path traversal（可构造时）。
- 停止条件：[ ] Upgrade preserve；Repair 全恢复；cleanup 只限 TempRoot；数据目录从不被误删。

## Todo — HostOperations, Doctor & Single SOT

### 结果

- HostOperations 导入 Managed module，通过 Layout 派生 Config/Logs/Sessions/Workspace/Temp，删除硬编码 Home/Program constants。
- config-apply 和 repair 使用同一 config/task assertions；Doctor 输出六项 Managed Runtime Layout 状态。
- diagnostics 只记录路径和 PASS/FAIL，不读取/打印 config secrets、auth.json 或 `.env` values。
- release builder/script allowlist 确认更新后的 Managed module/HostOperations/Doctor 仍进入 Runtime/Installer payload。

### 实施锚点

- 主锚点：[`infra/windows/hermes-agent/scripts/HostOperations.ps1`](infra/windows/hermes-agent/scripts/HostOperations.ps1)。
- 候选触碰：现有 HostOperations tests/doctor entrypoint、runtime script inventory tests。

### 变更预算与验证

- 新 Doctor framework 0；优先扩展现有 operation surface/CLI wrapper。
- 最小验证：HostOperations Pester、script inventory tests、doctor fixture/read-back。
- 停止条件：[ ] 无独立路径 SOT；Doctor/Repair 与 Installer 对同一 layout/config/task 得出一致结果。

## Todo — Automated Contract Gates

### 结果

- Managed Layout/ACL、Config merge/rollback、Gateway launcher/Task、Lifecycle preserve/repair、cleanup containment 全覆盖。
- 静态 gate 限定 production sources，拒绝 USERPROFILE/AppData Local Temp/`os.homedir()`/%TEMP% 成为默认 Hermes roots；测试 fixtures 可豁免。
- Gate 明确证明 Machine TEMP/TMP/HOME/USERPROFILE 未被修改。
- Installer smoke/read-back 检查 WorkspaceRoot/TempRoot 和 Task contract；不能把 fixture 当真实 process inheritance proof。
- OPSI isolation 检查保证 Salt/Runtime/Work/contracts diff 为空。

### 实施锚点

- 测试：`SmcHermesManaged.Tests.ps1`、`Installer.Tests.ps1`、HostOperations/script inventory tests。
- CI：现有 installer build/test workflow 与 `scripts/check-opsi-isolation.py`。

### 变更预算与验证

- 优先扩展现有 tests；新增 static gate 仅在现有 isolation/guard 无法表达时允许 1 个。
- 最小验证：全部 Hermes Windows Pester、installer smoke build/read-back、相关 Python release tests、OPSI isolation check。
- 停止条件：[ ] AC-21301–21315 均映射到自动化或 manual gate；No-Go fail closed；无无关子项目修改。

## Manual Windows Workspace Proof

### 人工 Runbook

1. 用正式 Client Release Pipeline 生成并安装 MSI/Burn EXE，记录 release digest、版本和 Machine env before/after。
2. 管理员安装后以标准员工账号登录，确认 WorkspaceRoot/TempRoot 存在且可按 ACL 使用；Machine TEMP/TMP/HOME/USERPROFILE 未变。
3. 创建全新 Agent/Terminal Session，执行 `Get-Location` 与 Python `os.getcwd()`，确认 WorkspaceRoot。
4. 执行 `tempfile.gettempdir()`/NamedTemporaryFile/sandbox，确认仅落到 TempRoot；相对路径文件落到 WorkspaceRoot。
5. 在同一 Session `cd workspace\project-a` 后再次调用，确认 cwd 持久化而非被 reset。
6. 创建 Workspace 用户文件并 Upgrade，确认保留；漂移 config/task、删除 tmp 后 Repair，确认完整恢复。
7. 运行 Doctor，核对 Layout/config/task PASS；检查脱敏日志无 credential/API key/auth/.env 内容。

### Cursor 约束

- 不自动安装/卸载真实 MSI，不触碰真实用户 TEMP 或 Production Endpoint，不执行危险 cleanup，不使用 Production signing key。
- 不把 Pester/smoke/fixture 写成 Windows Live Evidence，不自动完成 manual todo，不签署 Release GO。

### 停止条件

- [ ] Windows 10/11 标准用户 CWD/tempfile/relative file/cd persistence/Upgrade/Repair/Doctor 证据由 Release Owner、Endpoint Ops、Security Owner 签署。

## 实施顺序与合并门禁

1. 先扩展 Layout/path security/ACL；没有单一 SOT 前不改 Task launcher。
2. 再实现 config merge/validation/rollback，并以 fixture + real CLI validation 双层证明。
3. 接入 Gateway execution context 和 Task read-back assertion。
4. 扩展 Install/Upgrade/Repair/Uninstall 与安全 Temp cleanup。
5. 收敛 HostOperations/Doctor，补齐所有自动 gates 和 isolation check。
6. 自动化通过后交给人工 Windows proof；manual todo 保持 pending 直到签署。

## 跳过 / 何时再加

- Temp 配额、复杂 GC、长期 cleanup service、Workspace 项目管理不在 v2.1.3；出现容量/合规需求时另立 PRD。
- Agent 主动访问用户目录的策略控制、sandbox 强隔离、DLP 不在本版；本版只定义默认 root 与 process context。
- Work UI 展示 Workspace、远程 Workspace、共享 UNC Workspace 不在本版；当前安全 contract 明确拒绝 UNC。
