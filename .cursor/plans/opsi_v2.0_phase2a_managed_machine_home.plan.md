---
name: OPSI v2.0 Phase 2a Managed Machine Home Foundation
overview: 在 Phase 1 HostControl 工程闭环之上，先用 superseding ADR 解决现有 per-user/OPSI Product 决策冲突，再于新的 infra/windows/hermes-agent 边界交付固定 machine HERMES_HOME、ACL、环境变量与 systemprofile 防护；不提前实现 Installer EXE、Runtime bundle、Gateway Task 或 control-owner commit。
todos:
  - id: managed-endpoint-superseding-adr
    content: 新增 ADR-037，明确 supersede ADR-031/035/036 中与 Managed Endpoint v2 冲突的 Product、Controller、per-user HERMES_HOME 决策并保留 provider 隔离不变量
    status: completed
  - id: manual-architecture-signoff
    content: 人工执行 ADR-037 架构复核与接受签署；Cursor 不得自动完成
    status: completed
  - id: machine-home-core
    content: 在 infra/windows/hermes-agent 新增最小 PowerShell 5.1 模块，幂等初始化固定 machine HERMES_HOME、目录、ACL 与机器环境变量且不触碰用户 profile
    status: completed
  - id: windows-ci-boundary
    content: 将新 Windows Hermes Agent Pester 回归纳入现有 OPSI CI，并证明 Work、Salt、Runtime 与旧 Product 行为未被改动
    status: completed
isProject: false
---

# Cursor Implementation Plan — OPSI v2.0 Phase 2a Managed Machine Home Foundation

## 结果与边界

要实现：

- 架构先决条件：接受一个 Managed Endpoint v2 ADR，明确 `1 Endpoint : 1 machine Hermes instance`，并精确标记被 supersede 的旧决策。
- 新代码边界固定为 `infra/windows/hermes-agent`；Program 为 `D:\Programs\SMC\Hermes`，`HERMES_HOME` 为 `C:\ProgramData\SMC\Hermes`。
- 以 PowerShell 5.1 幂等创建 `skills/sessions/logs/workspace/state`，保留已有 `config.yaml/.env/auth.json` 及数据，并设置 Machine 与当前进程的 `HERMES_HOME`。
- HERMES_HOME ACL 只授予 `SYSTEM`、`BUILTIN\Administrators` 所需权限；任何 user profile、`systemprofile`、相对路径或越界路径 fail closed。

明确不做：

- 不创建或选择 Installer EXE 工具链；当前仓库没有可直接调用的 `makensis/iscc/dotnet`，该决策属于 Phase 2b/3。
- 不复制旧 Endpoint Controller，不创建 Windows Service、Controller Recover Task、per-user task/home 或 OPSI Product。
- 不安装 Hermes/Python/Node，不创建 Gateway Scheduled Task，不写 `control-owner.json`；owner 只能在后续 Installer 全部 READY 后原子提交。
- 不改 `apps/work`、`infra/salt`、`services/salt-control`、`services/runtime`、Runtime/Salt contracts 或 Phase 1 未提交改动。
- 不把自动化测试或 fixture 写成 Windows 10 Live Evidence；Phase 1 manual gate 仍保持其真实状态。

## 上下文路由

立即读取：

- `[AGENTS.md](AGENTS.md)`：仅确定 OPSI/cross-project 路由与禁止目录。
- `[docs/opsi/PRD-OPSI-v2.0.md](docs/opsi/PRD-OPSI-v2.0.md)`：Managed Endpoint、目录规范与 Migration Phase 2。
- `[docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md](docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)`：独立 provider、单 owner、Work/Runtime/Salt 隔离不变量。
- `[docs/adr/ADR-035-opsi-windows-endpoint-controller.md](docs/adr/ADR-035-opsi-windows-endpoint-controller.md)`：必须显式 supersede 的 per-user HERMES_HOME/Controller 决策。

按触发读取：

- 起草 ADR-037 时读取 `[docs/adr/ADR-036-opsi-real-release-client-deployment.md](docs/adr/ADR-036-opsi-real-release-client-deployment.md)` 与 `[docs/opsi/decisions/machine-user-bootstrap.md](docs/opsi/decisions/machine-user-bootstrap.md)`，只定位被 supersede 条款。
- 只有实际修改 API/event/schema 时才读取 `[docs/architecture/contract-flow.md](docs/architecture/contract-flow.md)`；本 slice 预期不触发。

禁止预加载：

- 历史 PRD/evidence/runbook、整个 `docs/opsi`、references、构建产物、运行时数据、无关 ADR/子项目。

## 最小方案判定

- 复用：PowerShell 5.1/.NET 自带 `System.IO`、`System.Environment`、`System.Security.AccessControl`；不复制 Salt/Runtime 实现。
- 根因锚点：`infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1::Initialize-SmcHermesManagedHome`（PRD 要求的新边界，当前不存在）。
- 调用方检查：本 slice 只允许 Pester 调用；Installer 成为首个生产调用方时必须另建 plan。
- 最小方案：一个 module 同时承载 fixed layout、path guard、ACL、environment 与 idempotent initialization；不拆 mapper/factory/adapter。
- 跳过：新依赖、通用 installer framework、可配置任意路径、数据迁移器、owner handover、Gateway lifecycle。

## Todo — Superseding Managed Endpoint ADR

- 结果：新增 `[docs/adr/ADR-037-opsi-managed-endpoint-v2.md](docs/adr/ADR-037-opsi-managed-endpoint-v2.md)`，初始 `Proposed`；保留 Salt 默认 SOT、OPSI 独立 provider、opsi-control 只连 opsiconfd、Work Direct Gateway、Runtime freeze。
- 主锚点：新 ADR 的 `Decision`；精确 supersede ADR-031 Decision 4、ADR-035 Decision 1/2/5/6、ADR-036 Decision 4/5/6 及 machine-user bootstrap，不改写历史 ADR。
- 候选触碰：`[docs/opsi/README.md](docs/opsi/README.md)`；以上是探索上限。
- 变更预算：新增决策文件 1；新增生产文件/依赖/公共接口 0；候选修改文件最多 2。
- 最小验证：`rg -n "Status|Supersed|services/opsi-control|apps/work|services/runtime|infra/salt|HERMES_HOME|control-owner" docs/adr/ADR-037-opsi-managed-endpoint-v2.md`
- 停止条件：冲突条款与保留不变量可逐项审查；状态保持 Proposed，直到 Architecture Owner 人工接受；未接受前不执行后续生产代码 todo。

## Todo — Machine Home Core

- 结果：新增 `SmcHermesManaged.psm1`，固定返回 Program/Home 布局并幂等初始化 machine home；失败不遗留错误环境变量、宽松 ACL 或半写 owner。
- 主锚点：`[infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1](infra/windows/hermes-agent/scripts/SmcHermesManaged.psm1)` 的 `Initialize-SmcHermesManagedHome`。
- 候选触碰：`[infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1](infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1)`；以上是探索上限。
- 变更预算：新增生产文件 1、新增测试文件 1（新 PRD subtree 无现有 harness，属停止条件必需）；新增依赖/公共抽象层 0；候选文件最多 2。
- 最小验证：`Invoke-Pester -Path infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1 -EnableExit`
- 停止条件：exact paths、目录集合、Machine/current-process env 与 restrictive ACL 通过；重复执行不覆盖数据；user/systemprofile/owner mutation 负向测试通过。

## Todo — Windows CI Boundary

- 结果：现有 OPSI Windows job 同时运行 legacy Product Pester 与新 managed-home Pester，path filter 包含 `infra/windows/hermes-agent/**`；不创建发布/部署 job。
- 主锚点：`[.github/workflows/opsi-package-ci.yml](.github/workflows/opsi-package-ci.yml)` 的 `pester` job。
- 候选触碰：`[scripts/check-opsi-isolation.py](scripts/check-opsi-isolation.py)` 只复用不修改；以上是探索上限。
- 变更预算：新增文件/依赖/公共接口 0；候选修改文件最多 1；新增 CI job 0。
- 最小验证：`Invoke-Pester -Path infra/opsi/tests/SmcHermesAgent.Tests.ps1,infra/windows/hermes-agent/tests/SmcHermesManaged.Tests.ps1 -EnableExit`；`python scripts/check-opsi-isolation.py --base opsi/prd-v1.0`；`git diff --exit-code opsi/prd-v1.0...HEAD -- apps/work infra/salt services/salt-control services/runtime contracts/salt-control-api contracts/runtime-api`
- 停止条件：两套 Pester 均通过；新路径能触发既有 Windows job；Work/Salt/Runtime diff 为空且旧 Product 未被移动/删除。

## Manual Architecture Signoff

### 人工 Runbook

1. Architecture Owner 对照 PRD v2.0、ADR-031、ADR-035、ADR-036 逐条审阅 ADR-037 的 supersede/保留清单。
2. 确认 machine ACL、Gateway 未来运行身份、owner READY commit 与 legacy migration 原则后，将 ADR-037 状态从 `Proposed` 改为 `Accepted` 并记录评审人和日期。

### Cursor 约束

- 不代替 Architecture Owner 接受 ADR，不自动完成 manual todo。
- 未接受时不执行 machine-wide filesystem、ACL、environment 或 owner 变更，也不声称 Phase 2 proven。

### 停止条件

- [x] ADR-037 已由 Architecture Owner 接受；冲突条款不存在双 SOT。

## 跳过 / 何时再加

- ADR 接受且 managed-home CI 通过后，另建 Phase 2b/3 plan：self-contained Python/Node Release v2 + Installer Fresh Install。
- Fresh Install 能从签名输入达到 CLI/Gateway READY 后，再扩展 Upgrade/Repair/Uninstall 与 owner atomic commit。
- Installer 四种 lifecycle 通过后，再建 API v2 + Config/Release/Artifact plan；随后才是 Logs/Sessions/Batch/Legacy Freeze。

