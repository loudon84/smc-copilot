---
name: OPSI v2.0 Phase 2b–3b Self-contained Installer Lifecycle
overview: 在 ADR-037 与 machine HERMES_HOME 基础通过后，一次交付自包含 Python/Node Release v2、WiX 5 Burn Installer EXE、Fresh Install、Upgrade、Repair、Uninstall、Gateway Scheduled Task 与 control-owner READY commit；不涉及 opsi-control API v2、Artifact Service 或 Batch。
todos:
  - id: self-contained-release-v2
    content: 将现有 Hermes release builder 扩展为内含 Python/Node/runtime/CLI 的 smc.hermes.release.v2 签名输入并保持 exact version 与可复现校验
    status: completed
  - id: installer-fresh-install
    content: 用固定版本 WiX 5 Burn + 自包含 Bootstrapper Application 生成所需 EXE，支持 PRD 参数并完成 Fresh Install 到固定 Program/Home
    status: completed
  - id: lifecycle-gateway-owner
    content: 在同一 Installer Core 完成 Upgrade、Repair、Uninstall、Gateway Task、回滚与 control-owner READY 原子提交
    status: completed
  - id: installer-release-pipeline
    content: 将 hermes-installer stage 接入现有 client release builder、Windows CI 与签名/read-back 门禁且不再要求 Hermes .opsi Product
    status: completed
  - id: manual-win10-installer-matrix
    content: 人工执行 Windows 10 Fresh Install、Upgrade、Repair、Uninstall、Tamper 与 Reboot Gateway 矩阵并签署；Cursor 不得自动完成
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v2.0 Phase 2b–3b

## 结果与边界

要实现：
- 产物名 `smc-hermes-agent_<release>_windows-amd64.exe`，输入绑定 `hermes-windows-amd64.zip`、`smc.hermes.release.v2`、SHA256、signature、buildId 与 signerKeyId。
- Installer 精确支持 `/install|/upgrade|/repair|/uninstall`、`/silent`、`/install-dir`、`/hermes-home`；enterprise defaults 固定为 PRD 路径。
- Fresh Install 安装 Runtime/Python/Node/CLI、machine HERMES_HOME/env、Gateway Scheduled Task 和 release metadata；所有 READY 检查通过后才写 `{ "hermes": "opsi" }`。
- Upgrade/Repair 失败回滚 Program pointer、Task 与 owner；Uninstall 删除 program/task/env/metadata，但保留 config/auth/skills/sessions/logs/workspace。

明确不做：
- 不部署 Endpoint Controller/Windows Service/Client FastAPI，不生成 Hermes `.opsi`，不调用 Product Property。
- 不修改 `services/runtime`、`infra/salt`、`services/salt-control`、`apps/work` 或其 contracts；Runtime WiX 仅作已存在模式参考，不共享源码或产物。
- 不实现 Remote Update/Repair API、Config/Artifact/Logs/Sessions/Batch；由下一计划消费 Installer。
- ADR-037 未 Accepted、Phase 2a machine-home tests 未通过或 Phase 1 manual response shape 未签署时，不产生 liveEligible release。

## 上下文路由

立即读取：
- [`AGENTS.md`](AGENTS.md)：OPSI 与 cross-project 隔离规则。
- [`docs/opsi/PRD-OPSI-v2.0.md`](docs/opsi/PRD-OPSI-v2.0.md)：§6–9、§21–23、§32–34。
- [`docs/adr/ADR-037-opsi-managed-endpoint-v2.md`](docs/adr/ADR-037-opsi-managed-endpoint-v2.md)：必须为 Accepted。
- [`tools/release/hermes/build_runtime.py`](tools/release/hermes/build_runtime.py)：`assemble_bundle` 与直接调用方。

按触发读取：
- 扩展 release manifest 时读取 [`contracts/opsi/runtime-artifact-manifest.schema.json`](contracts/opsi/runtime-artifact-manifest.schema.json) 仅迁移可复用字段；v2 SOT 写入 `infra/windows/hermes-agent/schemas`。
- 实现事务/验签时只读取旧 [`infra/opsi/products/smc-hermes-agent/scripts/install/Install-Hermes.ps1`](infra/opsi/products/smc-hermes-agent/scripts/install/Install-Hermes.ps1) 的 fail-closed 行为，不复制 Controller/Product 路径。

禁止预加载：
- 历史 PRD/evidence、references、旧 Product 全树、构建产物、运行时数据、无关子项目。

## 最小方案判定

- 复用：现有 source freeze/wheel/wheelhouse/node inventory、Ed25519 envelope、PowerShell 5.1 machine-home module、Windows Task Scheduler 与 atomic file replace。
- 根因锚点：`tools/release/hermes/build_runtime.py::assemble_bundle`；先修 bundle 自包含性，再构建 Installer。
- Installer 工具链：固定版本 WiX 5 Burn；custom self-contained BA 只解析 PRD slash arguments/exit code，生命周期逻辑只放一个 PowerShell Installer Core。
- 跳过：第二套 release builder、在线 pip/npm、PATH Python/Node、通用插件系统、额外 resident agent。

## Todo — Self-contained Release v2

- 结果：builder 嵌入 pinned Windows AMD64 Python/Node 与 Hermes offline payload，生成 v2 manifest/signature/file inventory；拒绝 dirty/latest、错架构、缺文件、重复路径、private key/Secret。
- 主锚点：[`tools/release/hermes/build_runtime.py`](tools/release/hermes/build_runtime.py) 的 `assemble_bundle`。
- 候选触碰：[`tools/release/hermes/verify_runtime.py`](tools/release/hermes/verify_runtime.py)、[`tools/release/tests/test_hermes_builder.py`](tools/release/tests/test_hermes_builder.py)；schema/manifest 由同一 builder 入口生成。
- 变更预算：新增 v2 schema 1；新增依赖 0；候选修改文件最多 3；测试扩展现有文件。
- 最小验证：`python -m pytest tools/release/tests/test_hermes_builder.py -q`
- 停止条件：bundle 离线、自包含、可重建并通过签名/read-back；不再依赖系统 Python/Node；tamper fail closed。

## Todo — Installer Fresh Install

- 结果：WiX Bundle EXE 将验证后的 payload 原子安装至 Program/Home，设置 machine env，创建 Gateway Task，验证 CLI/version/config/gateway 后提交 release state。
- 主锚点：[`infra/windows/hermes-agent/installer/InstallerCore.psm1`](infra/windows/hermes-agent/installer/InstallerCore.psm1) 的 `Install-SmcHermesAgent`。
- 候选触碰：[`infra/windows/hermes-agent/installer/Bundle.wxs`](infra/windows/hermes-agent/installer/Bundle.wxs)、[`infra/windows/hermes-agent/tests/Installer.Tests.ps1`](infra/windows/hermes-agent/tests/Installer.Tests.ps1)；BA/build files 由 installer build 入口管理。
- 变更预算：新 Installer subtree 与 pinned WiX/.NET build tooling 是 EXE/自定义参数停止条件必需；不得影响 monorepo 全局依赖；候选锚点最多 3。
- 最小验证：`powershell -NoProfile -ExecutionPolicy Bypass -File infra/windows/hermes-agent/installer/build.ps1 -ReleaseVersion 0.22.0-smc.1 -Smoke`；`Invoke-Pester -Path infra/windows/hermes-agent/tests/Installer.Tests.ps1 -EnableExit`
- 停止条件：exact flags/exit codes、silent elevation、fixed defaults、ACL/env/task/CLI/gateway READY 通过；失败不写 owner、不留半安装。

## Todo — Upgrade / Repair / Uninstall / Owner

- 结果：同一 Core 以 current/previous release transaction 实现 Upgrade；Repair L1–L5 保留数据；Uninstall 清程序与 Task 但保留 HERMES_HOME 数据并安全恢复 previous owner。
- 主锚点：[`infra/windows/hermes-agent/installer/InstallerCore.psm1`](infra/windows/hermes-agent/installer/InstallerCore.psm1) 的 `Invoke-SmcHermesLifecycle`。
- 候选触碰：[`infra/windows/hermes-agent/tests/Installer.Tests.ps1`](infra/windows/hermes-agent/tests/Installer.Tests.ps1)、[`infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1`](infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1)。
- 变更预算：新增依赖/Service/Controller 0；候选修改文件最多 3；测试仍用统一 Pester harness。
- 最小验证：`Invoke-Pester -Path infra/windows/hermes-agent/tests/Installer.Tests.ps1 -Tag Lifecycle -EnableExit`
- 停止条件：upgrade tamper 回滚；repair 不删用户数据；uninstall/reinstall 幂等；owner 仅 READY 后 commit 且冲突 owner fail closed。

## Todo — Installer Release Pipeline

- 结果：`hermes-installer` stage 进入统一 release，产物 inventory/SHA256/signature/provenance/SBOM/read-back 完整；Hermes release 不调用 `opsi-makepackage`。
- 主锚点：[`tools/release/client/build_client_release.py`](tools/release/client/build_client_release.py) 的 `build_all`。
- 候选触碰：[`scripts/build-client-release.ps1`](scripts/build-client-release.ps1)、[`.github/workflows/opsi-package-ci.yml`](.github/workflows/opsi-package-ci.yml)。
- 变更预算：新增 stage 1；新增发布依赖仅为局部 pinned WiX/.NET tooling；候选修改文件最多 3。
- 最小验证：`python -m pytest tools/release/tests/test_client_release.py -q`；`python scripts/check-opsi-isolation.py --base opsi/prd-v1.0`
- 停止条件：release 中存在且只存在 exact Installer；Hermes build 对 `.opsi`/ProductProperty 无依赖；Work/Salt/Runtime diff 为空。

## Manual Live / Signoff

### 人工 Runbook
1. 在 Clean Windows 10 AMD64 运行 `smc-hermes-agent_0.22.0-smc.1_windows-amd64.exe /install /silent /install-dir "D:\Programs\SMC\Hermes" /hermes-home "C:\ProgramData\SMC\Hermes"`。
2. 依次验证 reboot Gateway、`0.22.1-smc.1 /upgrade`、tamper rollback、`/repair /silent`、`/uninstall /silent`、数据保留与 reinstall。

### Cursor 约束
- 不代替操作员运行真实 Installer/签名/生产变更，不自动完成 manual todo。
- 不把 smoke/fixture 标记 liveEligible/proven/GO，不伪造或改写历史 evidence。

### 停止条件
- [ ] Windows 10 矩阵与签名证据由 Release Owner、Endpoint Ops、Security Owner 签署。

