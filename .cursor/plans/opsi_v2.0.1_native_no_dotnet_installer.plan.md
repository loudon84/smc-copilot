---
name: OPSI v2.0.1 Native No-.NET Installer
overview: 在 ADR-037 人工接受后，用 WiX Burn Native Bootstrapper + Embedded MSI 替换当前 ZIP rename/managed Host 路径，并建立客户端零新增 .NET、离线安装、Authenticode 与 fail-closed CI 门禁；本切片不实施 Artifact 或远程 Operations。
todos:
  - id: manual-architecture-offline-signoff
    content: 人工执行 ADR-037 Review，并在工程完成后执行无网络、无额外 .NET 的 Windows 10/11 Installer matrix 与签署；Cursor 不得自动完成
    status: pending
  - id: native-burn-msi-installer
    content: 用 Native Burn + Embedded MSI + Windows PowerShell 5.1 生成真实离线 PE，删除 managed Host 与 Endpoint Python verifier 路径
    status: completed
  - id: no-dotnet-release-ci-gates
    content: 收紧 hermes-installer Release/CI，对 no-.NET、offline、PE/MSI、Authenticode、Smoke provenance 与测试失败全部 fail closed
    status: completed
isProject: false
---

# Cursor Implementation Plan — OPSI v2.0.1 Native No-.NET Installer

## 结果与边界

要实现：
- `smc-hermes-agent_<release>_windows-amd64.exe` 是 Native Burn PE，内嵌 MSI 与完整 Hermes payload；Endpoint 只使用 Windows Installer、Windows PowerShell 5.1、Task Scheduler 和 Windows Trust。
- 删除 Production 路径中的 `SmcHermesInstallerHost.exe`、managed bootstrapper/custom action、`dotnet.exe`、DotNet/NetFx prerequisite、RemotePayload/DownloadUrl 与 ZIP rename。
- MSI 通过固定 `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` 调用现有 `InstallerCore.psm1`；Fresh Install 无网络、无系统 Python/Node/.NET。
- Production release 只有在 PE/MSI、离线 payload、Authenticode、Production provenance 和 no-.NET guard 全部通过时才可 `liveEligible=true`。

明确不做：
- 不实施 Artifact storage/content API、Config/Logs/Sessions、Remote Update/Repair 或 Snapshot Reconcile；分别另建后续计划。
- 不修改 Work、Salt、Runtime 或 legacy OPSI Product，不安装/签署生产证书，不执行未授权真实 Endpoint 变更。

## 上下文路由

立即读取：
- [`AGENTS.md`](AGENTS.md)：OPSI、contract 与 provider isolation 路由。
- [`docs/opsi/PRD-OPSI-v2.0.1.md`](docs/opsi/PRD-OPSI-v2.0.1.md)：`2、`5–13、`40–48、`50–53。
- [`docs/adr/ADR-037-opsi-managed-endpoint-v2.md`](docs/adr/ADR-037-opsi-managed-endpoint-v2.md)：当前 Proposed 状态与 owner gate。
- [`infra/windows/hermes-agent/installer/build.ps1`](infra/windows/hermes-agent/installer/build.ps1)：ZIP rename/non-Smoke fail 根因与 Production build 入口。

按触发读取：
- Installer lifecycle 接入时读取 `infra/windows/hermes-agent/installer/InstallerCore.psm1::Invoke-SmcHermesLifecycle`，只修 MSI/native bootstrap 所需边界。
- Release eligibility 变化时读取 `tools/release/client/build_client_release.py::build_hermes_installer_release` 与其直接调用方。
- 只有 API/event contract 实际变化时读取 `docs/architecture/contract-flow.md`；本切片预期不改 API。

禁止预加载：
- 历史 PRD/evidence、无关 ADR/子项目、legacy Product 全树、references、构建产物、运行时数据和归档内容。

## 最小方案判定

- 复用：现有 `InstallerCore.psm1`、`SmcHermesManaged.psm1`、release-v2 payload、Pester fixture、WiX Standard Bootstrapper Application 与 Windows Installer native capability。
- 根因锚点：`infra/windows/hermes-agent/installer/build.ps1` 的 Smoke/non-Smoke 分叉；检查 `run_hermes_installer` 和 `build_hermes_installer_release` 直接调用方。
- 最小方案：`build.ps1` 构建 MSI，再由 Native Burn 只打包/提权/转发参数；MSI 用固定 Windows PowerShell 5.1 进入 InstallerCore，不新增另一套 lifecycle。
- 跳过：自定义 EXE/DLL Host、managed BA/custom action、在线 prerequisite、第三方下载器、新 Windows Service 或通用 Installer framework。

## Todo — Native Burn + Embedded MSI

### 结果
- Production build 生成有效 `.msi` 与内嵌该 MSI 的 Burn `.exe`；完整 payload 压入本地 package，不产生网络依赖。
- Bundle 只负责 packaging/elevation/arguments/log/exit；MSI 通过 native action 调用 Windows PowerShell 5.1；`verify_release_v2.py` 仅留在 Build/CI，Endpoint 不调用系统 Python。

### 实施锚点
- 主锚点：[`infra/windows/hermes-agent/installer/build.ps1`](infra/windows/hermes-agent/installer/build.ps1) 的 non-Smoke build。
- 候选触碰：[`infra/windows/hermes-agent/installer/Bundle.wxs`](infra/windows/hermes-agent/installer/Bundle.wxs)、`infra/windows/hermes-agent/installer/Product.wxs`；后者是 Embedded MSI 边界所需新生产文件。
- 以上是探索上限，不是必须修改清单。

### 变更预算
- 新增生产文件：最多 `Product.wxs` 与一个固定 PowerShell bootstrap；现有 Bundle/ZIP 路径不能提供 MSI transaction。
- 新增 Endpoint 依赖、公共 API、通用抽象层：0；候选修改文件最多 3、新增测试文件 0；build-time WiX/.NET SDK 只能存在于 runner。

### 最小验证
- 现有 Pester 增加：PE header、embedded MSI、fixed WindowsPowerShell path、tamper pre-write reject 与 no-system-Python 断言。
- 命令：`pwsh -NoProfile -File infra/windows/hermes-agent/installer/build.ps1 -ReleaseVersion 0.22.0-smc.1 -OutputDir infra/windows/hermes-agent/installer/dist`
- 命令：`pwsh -NoProfile -Command "Invoke-Pester -Path 'infra/windows/hermes-agent/tests/Installer.Tests.ps1' -EnableExit"`

### 停止条件
- [ ] Production EXE 是内嵌有效 MSI 的 PE；ZIP rename、managed Host/custom action 和 Endpoint Python verifier 路径消失。
- [ ] Fresh Install/Repair/Uninstall 只调用系统 Windows PowerShell 5.1，payload 无 RemotePayload/DownloadUrl。
- [ ] 条件成立后停止，不实施 Artifact 或远程 Operation。

## Todo — No-.NET Release / CI Gates

### 结果
- Windows job 构建并检查 PE/MSI/embedded chain、no-.NET strings、offline payload、Authenticode 与 Smoke/Production eligibility。
- 删除 `.github/workflows/opsi-package-ci.yml` 中吞掉 pytest 失败的 `|| echo`；Build tooling 只留在 runner，missing test/artifact/verifier error 均非零退出。

### 实施锚点
- 主锚点：[`.github/workflows/opsi-package-ci.yml`](.github/workflows/opsi-package-ci.yml) 的 `builder`/Windows Installer gates。
- 候选触碰：[`tools/release/client/build_client_release.py`](tools/release/client/build_client_release.py)、[`tools/release/tests/test_client_release.py`](tools/release/tests/test_client_release.py)。
- 以上是探索上限，不是必须修改清单。

### 变更预算
- 新增生产文件/Endpoint 依赖/公共接口/抽象层：0；候选修改文件最多 3；新增测试文件 0。
- 可新增一个 Windows CI job；真实 PE/MSI、native chain 与 no-.NET 检查不能由 Linux metadata test 代替。

### 最小验证
- 现有 release test 增加 renamed ZIP、unsigned/wrong signer、Smoke key 与 verifier exception fail-closed 断言。
- 命令：`uv run --project services/opsi-control pytest tools/release/tests/test_client_release.py tools/release/tests/test_hermes_builder.py -q`
- 命令：`pwsh -NoProfile -Command "$hits = rg -n 'SmcHermesInstallerHost|ManagedBootstrapperApplicationHost|DotNetCoreSearch|NetFx|dotnet-runtime|dotnet-hosting|Microsoft.NETCore|RemotePayload|DownloadUrl' infra/windows/hermes-agent/installer; if ($LASTEXITCODE -eq 0) { $hits; exit 1 }; if ($LASTEXITCODE -gt 1) { exit $LASTEXITCODE }"`

### 停止条件
- [ ] Production 缺任一 PE/MSI/trust/offline/no-.NET 条件时 job 非零退出且不能写 `liveEligible=true`。
- [ ] v2 output 无 `.opsi`，OPSI isolation gate 通过，Smoke/test certificate 保持 `liveEligible=false`。
- [ ] 条件成立后停止，不重构 legacy v1 release pipeline。

## Manual Architecture / Offline Signoff

### 人工 Runbook
1. Architecture Owner 审阅 ADR-037 supersede table 并记录 reviewer/date；未接受则停止工程 todo。
2. 在未安装任何额外 .NET Runtime、禁用 Internet 的 Windows 10/11 VM 上验证 install、reboot、upgrade/rollback、repair、uninstall-preserve-data，并记录网络与安装 trace。
3. Security/Endpoint Ops 验证 Production Authenticode、EXE/MSI digest、固定 Program/Home/owner、Gateway health 与无 .NET prerequisite/install action 后签署。

### Cursor 约束
- 不代替 Architecture Owner 接受 ADR，不安装生产证书，不使用签名私钥，不执行未授权真实 Endpoint 变更。
- 不自动完成 manual todo，不把 fixture/Dry Run 写成 Live Evidence。

### 停止条件
- [ ] ADR 接受记录与 Win10/Win11 offline/no-.NET evidence 分别齐备并由对应责任人签署。

## 跳过 / 何时再加

- 仅在 Native Installer 与 no-.NET/offline gates 完成后，按 PRD Phase 2 为 Artifact transport 新建下一份 `.plan.md`。
