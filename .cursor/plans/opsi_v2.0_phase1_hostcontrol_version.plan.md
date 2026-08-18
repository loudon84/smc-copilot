---
name: OPSI v2.0 Phase 1 HostControl Version Closure
overview: 在保留 v1 Product Lifecycle 一个迁移周期的前提下，先交付 VERSION Operation 经 OPSI 4.3 MessageBus 执行固定 Hermes CLI 的最小闭环，补齐离线等待、幂等结果和 1.8 兼容契约；不在本 slice 实现 /api/v2、Installer、Artifact、Batch 或 Legacy Freeze。
todos:
  - id: hostcontrol-rpc-boundary
    content: 为单一精确 Client ID 增加 reachable/execute RPC 边界与真实返回形状归一化，拒绝 wildcard、批量 hostIds、opsiclientdRpc 和任意公开命令入口
    status: completed
  - id: version-command-dispatch
    content: 复用现有 Action/Result/Audit 路径，将 VERSION 映射为固定 Hermes CLI 并证明不触碰 ProductPropertyState/ProductOnClient
    status: completed
  - id: offline-waiting-retry
    content: 复用 Target lease/attempt/deadline 实现 WAITING_CLIENT 指数退避与到期 UNKNOWN，不把首次离线永久标记 FAILED
    status: completed
  - id: contract-compat-release
    content: 生成并校验新增 VERSION/WAITING_CLIENT 的 1.8 兼容 OpenAPI，保持 v1 路由且不伪装为尚未交付的 /api/v2
    status: completed
  - id: manual-live-hostcontrol
    content: 人工执行真实 OPSI 4.3 + Windows 10 Endpoint 的 reachable 与 hermes --version 验证并签署响应形状；Cursor 不得自动完成
    status: completed
isProject: false
---

# Cursor Implementation Plan — OPSI v2.0 Phase 1 HostControl Version Closure

## 结果与边界

要实现：
- `POST /api/v1/opsi/actions` 接受 `operation=version`，每个目标只经 `hostControlSafe_reachable` 与 `hostControlSafe_execute` 执行固定命令 `"D:\Programs\SMC\Hermes\bin\hermes.exe" --version`。
- 小结果经现有 `ActionResult` 持久化、截断、脱敏和 SHA256 关联；相同 `requestId + payload` 仍幂等，异载荷仍 409。
- Endpoint 离线进入 `WAITING_CLIENT`，按现有 lease/attempt/deadline 重试；到期才以 `UNKNOWN/CLIENT_OFFLINE` 收敛。

明确不做：
- 不删除或改写 v1 setup/update/custom 的 Product Lifecycle；不把 VERSION 退回 Product Property 或 `log_read`。
- 不开放任意 Shell、PowerShell、executable path、filesystem path 或 `hostControlSafe_opsiclientdRpc`。
- 不改 `apps/work`、`services/runtime`、`infra/salt`、`services/salt-control` 或对应 contracts。
- 不实施 `/api/v2`、machine-managed HERMES_HOME、Windows Installer、Config/Artifact/Logs/Sessions/Release/Batch；这些分别另建 plan。
- PRD 的 machine-managed 单实例与现有 ADR-031/per-user bootstrap 决策冲突；进入 Installer slice 前必须先接受 superseding ADR。

## 上下文路由

立即读取：
- [`AGENTS.md`](AGENTS.md)：仅确定 OPSI/cross-project 路由。
- [`docs/opsi/PRD-OPSI-v2.0.md`](docs/opsi/PRD-OPSI-v2.0.md)：Phase 1、Remote Command、Offline 与安全边界。
- [`docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`](docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)：独立 provider、单 owner、只连 opsiconfd 的不变量。
- [`services/opsi-control/src/workers/action_dispatcher.py`](services/opsi-control/src/workers/action_dispatcher.py)：`dispatch_queued` 及其直接调用方。

按触发读取：
- 修改公开 `Operation`/`ActionStatus` 时读取 [`docs/architecture/contract-flow.md`](docs/architecture/contract-flow.md)、[`tools/contract-generate/export_opsi_control_openapi.py`](tools/contract-generate/export_opsi_control_openapi.py) 与 [`contracts/version.json`](contracts/version.json)。
- 只有真实 OPSI 返回形状与测试 fixture 不一致时，读取 `backend_getInterface` 的该方法描述并停止扩大实现。

禁止预加载：
- 历史 OPSI PRD/evidence/runbook、整个 `docs/opsi`、references、构建产物、运行时数据及无关子项目。

## 最小方案判定

- 复用：`HttpOpsiJsonRpc.call`、`ActionService.create`、`RepositoryBundle`、Target 的 `lease_until/attempt`、现有 Result/Audit 与 payload digest。
- 根因锚点：`services/opsi-control/src/workers/action_dispatcher.py::dispatch_queued`。
- 调用方检查：`ActionService.dispatch_once`、`WorkerRuntime`，以及 `TargetRepository.claim_queued` 的 SQL/Memory 实现。
- 最小方案：为 VERSION 增一条固定 server-side command mapping；v1 其他 Operation 继续旧路径，直到后续 plan 逐项迁移。
- 跳过：新依赖、通用 command framework、任意脚本 DSL、Endpoint listener/service、每个 Operation 一套 worker。

## Todo — HostControl RPC Boundary

- 结果：allowlist 仅新增 `hostControlSafe_reachable`、`hostControlSafe_execute`；校验 `hostIds` 恰为一个无 wildcard 的 Client ID，并归一化 per-host success/error/stdout。
- 主锚点：[`services/opsi-control/src/integrations/opsi_jsonrpc.py`](services/opsi-control/src/integrations/opsi_jsonrpc.py) 的 `ALLOWED_METHODS`。
- 候选触碰：[`services/opsi-control/src/integrations/dto.py`](services/opsi-control/src/integrations/dto.py)、[`services/opsi-control/tests/test_jsonrpc.py`](services/opsi-control/tests/test_jsonrpc.py)；以上是探索上限。
- 变更预算：新增生产文件/依赖/公共抽象层 0；候选修改文件最多 3；新增测试文件 0。
- 最小验证：`uv run --project services/opsi-control pytest services/opsi-control/tests/test_jsonrpc.py -q`
- 停止条件：单 Client 调用形状通过正/负向测试；wildcard/多 Client/未 allowlist RPC fail closed；不新增公网 command API。

## Todo — VERSION Command Dispatch

- 结果：新增 `Operation.VERSION` 和 `WAITING_CLIENT` 状态；VERSION 只使用固定 absolute CLI path，保存 capped/redacted stdout 与 digest，聚合状态沿用现有逻辑。
- 主锚点：[`services/opsi-control/src/workers/action_dispatcher.py`](services/opsi-control/src/workers/action_dispatcher.py) 的 `dispatch_queued`。
- 候选触碰：[`services/opsi-control/src/schemas/models.py`](services/opsi-control/src/schemas/models.py)、[`services/opsi-control/tests/test_actions.py`](services/opsi-control/tests/test_actions.py)；以上是探索上限。
- 变更预算：新增生产文件/依赖/公共抽象层 0；候选修改文件最多 3；新增测试文件 0。
- 最小验证：`uv run --project services/opsi-control pytest services/opsi-control/tests/test_actions.py -q`
- 停止条件：RPC trace 含 reachable→execute 且不含 Product lifecycle/log_read；请求体不能覆盖 command/path；幂等 replay、冲突与 partial failure 回归通过。

## Todo — Offline Waiting / Retry

- 结果：reachable=false 时持久化 `WAITING_CLIENT/CLIENT_OFFLINE`，用既有 lease 记录下一次 claim 时间并做有界退避；deadline 后写 `UNKNOWN`，不执行 CLI。
- 主锚点：[`services/opsi-control/src/db/repositories/sqlalchemy.py`](services/opsi-control/src/db/repositories/sqlalchemy.py) 的 `SqlTargetRepository.claim_queued`。
- 候选触碰：[`services/opsi-control/src/db/repositories/memory.py`](services/opsi-control/src/db/repositories/memory.py)、[`services/opsi-control/tests/test_actions.py`](services/opsi-control/tests/test_actions.py)；以上是探索上限。
- 变更预算：新增生产文件/依赖/DB column/迁移 0；候选修改文件最多 3；新增测试文件 0。
- 最小验证：`uv run --project services/opsi-control pytest services/opsi-control/tests/test_actions.py -q`
- 停止条件：首次离线不是 FAILED；到期前可重新 claim 且不 busy-loop；超过 deadline 为 UNKNOWN/CLIENT_OFFLINE。

## Todo — Contract Compatibility Release

- 结果：FastAPI/OpenAPI 与 `opsiControlApi` 同步为 `1.8.0` additive compatibility release；v1 路径保留，不生成 `/api/v2` 空壳。
- 主锚点：[`services/opsi-control/src/app.py`](services/opsi-control/src/app.py) 的 `create_app` version。
- 候选触碰：[`contracts/version.json`](contracts/version.json)、[`services/opsi-control/tests/test_openapi_export.py`](services/opsi-control/tests/test_openapi_export.py)；OpenAPI 只由生成入口更新。
- 变更预算：新增生产文件/依赖/路由/抽象层 0；候选修改文件最多 3；新增测试文件 0。
- 最小验证：`uv run --project services/opsi-control python tools/contract-generate/export_opsi_control_openapi.py`；`npm run contracts:check`；`python scripts/check-opsi-isolation.py --base opsi/prd-v1.0`
- 停止条件：VERSION/WAITING_CLIENT 出现在生成契约；全部 v1 路径仍在；Salt/Runtime/Work isolation diff 为空。

## Manual Live / Signoff

### 人工 Runbook
1. 在授权 OPSI 4.3 Lab 执行 `opsi-cli jsonrpc execute hostControlSafe_reachable '["itbjb0326.smart-core.com"]'`，保存脱敏响应形状。
2. 执行 `opsi-cli jsonrpc execute hostControlSafe_execute '"D:\Programs\SMC\Hermes\bin\hermes.exe" --version' '["itbjb0326.smart-core.com"]'`，确认返回 exact release 且无 Secret。
3. 经授权的 opsi-control 调用 `operation=version` 两次，确认相同 `requestId` 无第二次副作用，并由 Operator 记录签署结果。

### Cursor 约束
- 不代替操作员执行 Lab/Production 远程命令，不自动完成 manual todo。
- 不把 fixture/Dry Run 写成 Live Evidence，不把 `not_proven` 改为 `proven`，不伪造或改写历史 evidence。

### 停止条件
- [ ] 真实 RPC 参数与归一化模型一致，VERSION 返回值可关联 requestId/clientId/digest。
- [ ] 人工证据齐备并由操作员签署；不因此授权 `/api/v2`、Installer 或 Production Rollout。

## 跳过 / 何时再加

- HostControl VERSION 闭环签署后，另建 Phase 2 plan：superseding ADR + machine HERMES_HOME + Windows Installer。
- Installer 的 install/upgrade/repair/uninstall smoke 通过后，另建 API v2 + Config/Release/Artifact plan。
- Artifact 上传下载、token binding 与回滚通过后，另建 Logs/Sessions/Batch/Legacy Freeze plan。
