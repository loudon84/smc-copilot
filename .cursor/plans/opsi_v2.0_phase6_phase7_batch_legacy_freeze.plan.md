---
name: OPSI v2.0 Phase 6–7 Batch + Legacy Freeze
overview: 在 API v2 与 Artifact 运维闭环签署后，一次交付 Group target selection、Batch concurrency/retry/cancel/partial failure、rollout.py 去 Product 化、v1/legacy freeze、Hermes build pipeline 最终切换与 PRD AC/DoD 门禁；不删除历史表或历史源码。
todos:
  - id: group-batch-action-model
    content: 用 OPSI Group 只做 target selection，扩展 v2 Action 支持 concurrency、deadline、cancel、per-client result 与 aggregate status
    status: completed
  - id: rollout-product-decoupling
    content: 将 rollout.py 收敛为 Release Target Selection + Batch Action 编排，移除 v2 ProductOnDepot/ProductProperty/Controller revision 依赖
    status: completed
  - id: legacy-freeze-migration
    content: 冻结 legacy Product/v1 mutation 路径并返回明确迁移结果，保留历史源码/表/只读数据且证明 v2 零 Product write RPC
    status: completed
  - id: final-pipeline-gates
    content: 完成 hermes-installer build SOT、contracts/isolation/AC 自动门禁、迁移文档与 operator freeze/signoff 准备
    status: completed
  - id: manual-batch-legacy-signoff
    content: 人工执行真实 Group/Batch partial failure/cancel/offline retry 与 Legacy Freeze/rollback 演练并签署；Cursor 不得自动完成
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v2.0 Phase 6–7

## 结果与边界

要实现：
- Batch 接受显式 clientIds 或 OPSI Group selection snapshot；限制 concurrency，逐 client 结果，支持 partial failure/retry/deadline/cancel 与 deterministic aggregate。
- `rollout.py` 只负责 Release target selection、batch scheduling、failure threshold、pause/resume/cancel/aggregate，不再发布/校验 OPSI Product。
- v2 生产链停止 ProductPropertyState/ProductOnClient write、ProductOnDepot Hermes rollout、`.opsi` Hermes release；v1 mutation 明确冻结，历史查询/表/源码保留。
- Build SOT 只产 signed Installer release；最终 gates 覆盖 contracts、isolation、negative RPC scan、migration、AC-01–28 与人工证据边界。

明确不做：
- 不删除 `infra/opsi/products/smc-hermes-agent`、历史 Alembic 表/ADR/evidence；仅标记 legacy/frozen 并阻止新 Production 使用。
- 不修改 Salt/Runtime/Work，不新增 Hermes testing/pilot/production client Property，不让 Group 成为 Hermes 状态 SOT。
- 不自动发布 Depot/Production、不自动将 manual gate/observation/signature 标记 GO/proven。
- 不在本阶段新增 Installer/API/Artifact 功能；只消费前两计划已经签署的能力。

## 上下文路由

立即读取：
- [`AGENTS.md`](AGENTS.md)：OPSI isolation 与 legacy 保留规则。
- [`docs/opsi/PRD-OPSI-v2.0.md`](docs/opsi/PRD-OPSI-v2.0.md)：§25、§28–34、Migration Phase 6/7、AC/DoD。
- [`services/opsi-control/src/services/rollout.py`](services/opsi-control/src/services/rollout.py)：`RolloutService.dispatch_once/reconcile_once`。
- [`services/opsi-control/src/integrations/opsi_jsonrpc.py`](services/opsi-control/src/integrations/opsi_jsonrpc.py)：v2 RPC allowlist。

按触发读取：
- 迁移 v1 route 时读取 [`services/opsi-control/src/api/v1/rollouts.py`](services/opsi-control/src/api/v1/rollouts.py) 的 mutation endpoints；只在冻结行为测试要求时加载。
- Pipeline 切换时读取 [`tools/release/client/build_client_release.py`](tools/release/client/build_client_release.py) 的 stage graph，不加载旧 Product packaging 全树。

禁止预加载：
- 历史 PRD/evidence 内容、references、构建产物、运行时数据、无关子项目；不得扫描/改写历史 evidence。

## 最小方案判定

- 复用：现有 Action targets/idempotency/lease/deadline/result/audit、Rollout batch/lease/outbox/failure gates、HostControl retry、OPSI `group_getObjects/objectToGroup_getObjects`。
- 根因锚点：`services/opsi-control/src/services/rollout.py::dispatch_once`；把其下游从 Product mutation 换为 v2 Batch Action，不另建第二套 rollout service。
- 最小方案：Group 解析为 immutable sorted client snapshot 后即退出链路；后续全部按 Client ID 与现有 Action primitives 执行。
- 跳过：新队列依赖、Hermes ring Property、自动 Production publish、数据 DROP、legacy source delete。

## Todo — Group + Batch Action Model

- 结果：allowlist 新增 group read RPC；创建时冻结 targets digest，按 concurrency claim，cancel 只阻止未开始目标，已运行目标由 reconciler 收敛。
- 主锚点：[`services/opsi-control/src/integrations/opsi_jsonrpc.py`](services/opsi-control/src/integrations/opsi_jsonrpc.py) 的 `ALLOWED_METHODS`。
- 候选触碰：[`services/opsi-control/src/schemas/rollout.py`](services/opsi-control/src/schemas/rollout.py)、[`services/opsi-control/tests/test_rollout.py`](services/opsi-control/tests/test_rollout.py)。
- 变更预算：新增依赖/表 0，优先复用现有 campaign/batch/target/lease；候选修改文件最多 3。
- 最小验证：`uv run --project services/opsi-control pytest services/opsi-control/tests/test_rollout.py -k "group or concurrency or cancel or partial or offline" -q`
- 停止条件：Group 只读且 snapshot deterministic；并发上限不超；cancel/retry/deadline/partial aggregate 可观察且幂等。

## Todo — rollout.py Product Decoupling

- 结果：v2 rollout dispatch 生成 Batch Actions，failure threshold/pause/resume/aggregate 复用现有状态；Product/depot/controller gates 不再参与 v2。
- 主锚点：[`services/opsi-control/src/services/rollout.py`](services/opsi-control/src/services/rollout.py) 的 `RolloutService.dispatch_once`。
- 候选触碰：[`services/opsi-control/src/db/repositories/rollout_sql.py`](services/opsi-control/src/db/repositories/rollout_sql.py)、[`services/opsi-control/tests/test_rollout.py`](services/opsi-control/tests/test_rollout.py)。
- 变更预算：新增 service/worker/依赖 0；候选修改文件最多 3；旧字段/表本阶段不 DROP。
- 最小验证：`uv run --project services/opsi-control pytest services/opsi-control/tests/test_rollout.py -q`
- 停止条件：v2 campaign RPC trace 无 Product lifecycle；重启/lease 恢复无重复 side effect；failure threshold 与 partial result 正确。

## Todo — Legacy Freeze / Migration Compatibility

- 结果：legacy Product 源码进入 frozen marker；v1 Product mutation endpoints 返回稳定迁移响应/410，允许的 v1 read 与历史数据仍可查；v2 worker 禁止 Product write。
- 主锚点：[`services/opsi-control/src/api/router.py`](services/opsi-control/src/api/router.py) 的 v1/v2 registration。
- 候选触碰：[`infra/opsi/README.md`](infra/opsi/README.md)、[`services/opsi-control/tests/test_v17.py`](services/opsi-control/tests/test_v17.py)。
- 变更预算：新增依赖/数据 DROP 0；候选修改文件最多 3；legacy 目录不移动/删除以保护用户工作树与历史。
- 最小验证：`uv run --project services/opsi-control pytest services/opsi-control/tests/test_v17.py services/opsi-control/tests/test_v2.py -q`；`$hits = rg -n "productPropertyState_updateObjects|productOnClient_updateObjects" services/opsi-control/src/api/v2 services/opsi-control/src/workers/command_dispatcher.py; if ($LASTEXITCODE -eq 0) { $hits; throw 'v2 product write RPC found' }`
- 停止条件：v1 migration response 稳定；v2 零 Product writes；历史表/源码/evidence 未删除或伪造。

## Todo — Final Pipeline / Contract / Isolation Gates

- 结果：`hermes-installer` 成为 Hermes release SOT；OPSI client enrollment assets 保留但 `.opsi` 不再进入 Hermes release；自动 AC 报告只标 implemented/not_implemented。
- 主锚点：[`tools/release/client/build_client_release.py`](tools/release/client/build_client_release.py) 的 `build_all`。
- 候选触碰：[`scripts/build-client-release.ps1`](scripts/build-client-release.ps1)、[`.github/workflows/opsi-package-ci.yml`](.github/workflows/opsi-package-ci.yml)。
- 变更预算：新增依赖 0；候选修改文件最多 3；不新增 deploy/publish job。
- 最小验证：`python -m pytest tools/release/tests infra/opsi/tests -q`；`npm run contracts:check`；`python scripts/check-opsi-isolation.py --base opsi/prd-v1.0`；`git diff --exit-code opsi/prd-v1.0...HEAD -- apps/work infra/salt services/salt-control services/runtime contracts/salt-control-api contracts/runtime-api`
- 停止条件：AC-01–28 自动项通过且 manual 项未伪造；Hermes pipeline 无 opsi-makepackage/ProductProperty；隔离 diff 为空。

## Manual Live / Signoff

### 人工 Runbook
1. 在真实 OPSI Group 上执行三客户端 batch status/update：一台成功、一台离线后恢复、一台注入失败；验证 concurrency、partial aggregate、retry 与 cancel。
2. 冻结 legacy 后演练 v1 mutation 拒绝、v2 正常、Installer rollback 与 control-owner 恢复；Release Owner/Endpoint Ops/Security Owner 审阅 AC/DoD。

### Cursor 约束
- 不代替操作员执行真实 Group/Batch/Freeze/Production 操作，不自动完成 manual todo。
- 不把自动 AC、fixture、Dry Run 写成 Live Evidence，不把 not_proven/NO-GO 自动改为 proven/GO。

### 停止条件
- [ ] AC-24–AC-28、Legacy Freeze 与 rollback 证据由三方签署；Production Rollout 仍需独立授权。

