---
name: OPSI v2.0 Phase 4–5c Control API + Artifact Operations
overview: 在 Installer 全生命周期签署后，一次交付 /api/v2/opsi、HostControl command dispatcher/reconciler、Client Status、Gateway/Doctor、Config/Release/Artifact 数据面、Update/Repair、Logs/Sessions 与审计；保留 v1 一个迁移周期且不进入 Batch/Legacy Freeze。
todos:
  - id: v2-api-data-foundation
    content: 新增 API v2 router/schema、hermes_releases/config_artifacts/artifacts/client_snapshots migration 与 repository，并保留 v1 路由
    status: completed
  - id: command-status-gateway-doctor
    content: 用固定 Operation mapping 完成 status/gateway/config-check/doctor command dispatcher 与 reconciler，禁止任意 shell
    status: completed
  - id: artifact-config-release-update-repair
    content: 完成短期绑定 Token Artifact Service、Config/Release API、Config rollback、Remote Update 与分层 Repair
    status: completed
  - id: logs-sessions-audit
    content: 完成 Logs/Sessions 选择、压缩、限额、Artifact 上传关联与强制审计，禁止大文件进入 stdout/log_read
    status: completed
  - id: manual-v2-operations-matrix
    content: 人工执行真实 Endpoint 的 API v2、Config rollback、Artifact、Update/Repair、Logs/Sessions 矩阵并签署；Cursor 不得自动完成
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v2.0 Phase 4–5c

## 结果与边界

要实现：
- `/api/v2/opsi` 提供 Clients/Status、Actions/Results、Configs、Releases、Artifacts；v1 保持一周期，不把 v2 请求送入 Product lifecycle。
- v2 Operation allowlist 覆盖 STATUS/VERSION、Gateway start/stop/restart/status、CONFIG_CHECK/APPLY、DOCTOR、UPDATE、REPAIR、COLLECT_LOGS、LIST/COLLECT_SESSION(S)。
- Artifact 只走 HTTPS + short-lived token，并绑定 artifactId/type/clientId/requestId/expiry；Config/Release 下载与 Logs/Sessions 上传共用同一信任边界。
- Config 原子备份/替换/check/restart/rollback；Update 校验 exact release+SHA256+signature；Repair L1–L5 保留所有 HERMES_HOME 数据。

明确不做：
- 不暴露 shell/PowerShell/cmd/executable path/filesystem path；Operation payload 只允许每项 schema 定义的 selector/version/revision。
- 不让 opsi-control 直连 Endpoint/Gateway，不让大文件经过 HostControl stdout、OPSI log 或 Product Property。
- 不修改 Work/Salt/Runtime；不实现 Batch、Group selection、Legacy 410 或删除历史表/源码。
- Installer manual gate 未签署时，Update/Repair/production Artifact 保持不可启用。

## 上下文路由

立即读取：
- [`AGENTS.md`](AGENTS.md)：OPSI、contract 与隔离规则。
- [`docs/opsi/PRD-OPSI-v2.0.md`](docs/opsi/PRD-OPSI-v2.0.md)：§10–24、§26–31、Migration Phase 4/5。
- [`docs/architecture/contract-flow.md`](docs/architecture/contract-flow.md)：FastAPI/Pydantic → generated OPSI OpenAPI。
- [`services/opsi-control/src/workers/action_dispatcher.py`](services/opsi-control/src/workers/action_dispatcher.py)：Phase 1 HostControl 与 legacy 分叉。

按触发读取：
- DB 变更时读取 [`services/opsi-control/src/db/models.py`](services/opsi-control/src/db/models.py) 与当前 Alembic head；生成新 migration，不改旧 revision。
- Endpoint script 只读取 [`infra/windows/hermes-agent/installer/InstallerCore.psm1`](infra/windows/hermes-agent/installer/InstallerCore.psm1) 的公开 lifecycle contract，不读取 legacy Product scripts。

禁止预加载：
- 历史 PRD/evidence、references、旧 Product 全树、构建产物、运行时数据、Salt/Runtime/Work 实现。

## 最小方案判定

- 复用：Phase 1 HostControl normalizer/retry/idempotency、现有 Action/Result/Audit repositories、Installer exact commands、FastAPI/Pydantic/Alembic/httpx。
- 根因锚点：`services/opsi-control/src/workers/action_dispatcher.py::dispatch_queued`；v2 分叉稳定后迁到 `command_dispatcher.py`，v1 legacy 保持原路径。
- 最小方案：一个 server-side `Operation -> immutable command template` mapping；PowerShell payload 从受控模板生成并只引用固定 managed paths。
- 跳过：通用 RPC proxy、对象存储 SDK依赖、消息队列、新控制面服务、每项 Operation 独立 worker。

## Todo — API v2 + Data Foundation

- 结果：新增 v2 router/models 与四张新表；Actions 复用 requestId/payload digest/target/audit，v2 Status/Artifact/Release/Config 只读写新 SOT。
- 主锚点：[`services/opsi-control/src/api/router.py`](services/opsi-control/src/api/router.py) 的 `api_router`。
- 候选触碰：[`services/opsi-control/src/db/models.py`](services/opsi-control/src/db/models.py)、[`services/opsi-control/tests/test_alembic_cycle.py`](services/opsi-control/tests/test_alembic_cycle.py)；API/schema/repository 新文件是 v2 public boundary 必需。
- 变更预算：新增 v2 router/schema/repository 与 migration 超默认预算，因 PRD 明确新 API/SOT 且 v1 必须隔离；新增依赖 0。
- 最小验证：`uv run --project services/opsi-control pytest services/opsi-control/tests/test_alembic_cycle.py services/opsi-control/tests/test_v2.py -q`
- 停止条件：upgrade/downgrade cycle 通过且不 DROP 历史表；v1/v2 同时可见；v2 无 Product 字段与 userBinding。

## Todo — Command Dispatcher / Status / Gateway / Doctor

- 结果：v2 Dispatcher 先 validate client/reachable，再执行 fixed mapping；Status 聚合 installed/release/config/gateway，Reconciler 持久化 capped/redacted result 与 client snapshot。
- 主锚点：[`services/opsi-control/src/workers/command_dispatcher.py`](services/opsi-control/src/workers/command_dispatcher.py) 的 `COMMAND_TEMPLATES`。
- 候选触碰：[`services/opsi-control/src/workers/runtime.py`](services/opsi-control/src/workers/runtime.py)、[`services/opsi-control/tests/test_actions.py`](services/opsi-control/tests/test_actions.py)。
- 变更预算：新增两个 worker 文件符合 PRD 明确边界；新增依赖/Endpoint listener 0；候选锚点最多 3。
- 最小验证：`uv run --project services/opsi-control pytest services/opsi-control/tests/test_actions.py services/opsi-control/tests/test_v2.py -q`
- 停止条件：所有 command trace 只含 allowlisted HostControl；payload 无法覆盖 command/path；offline/retry/deadline/idempotency 延续 Phase 1。

## Todo — Artifact / Config / Release / Update / Repair

- 结果：Artifact token HMAC/expiry/binding/size/digest fail closed；Config Apply 原子 rollback；Release exact-only；UPDATE/REPAIR 下载 installer、验签、执行并 post-check。
- 主锚点：[`services/opsi-control/src/services/control.py`](services/opsi-control/src/services/control.py) 的 `ActionService`，在其旁新增 v2 Artifact/Config/Release services 而不扩展 rollout.py。
- 候选触碰：[`services/opsi-control/src/core/config.py`](services/opsi-control/src/core/config.py)、[`infra/windows/hermes-agent/tests/HostOperations.Tests.ps1`](infra/windows/hermes-agent/tests/HostOperations.Tests.ps1)。
- 变更预算：新增 service/API/Endpoint operation scripts 是 Artifact 双向传输与 rollback 所必需；优先标准库/httpx，新增依赖 0。
- 最小验证：`uv run --project services/opsi-control pytest services/opsi-control/tests/test_v2.py -k "artifact or config or release or update or repair" -q`；`Invoke-Pester -Path infra/windows/hermes-agent/tests/HostOperations.Tests.ps1 -EnableExit`
- 停止条件：token 重放/错 client/request/过期/超限拒绝；config failure 恢复旧文件；latest/main/master 与 tampered installer 拒绝。

## Todo — Logs / Sessions / Audit + Contract

- 结果：Logs/Sessions selector 有 since/maxBytes/maxCount/sessionId/timeRange 限额；Endpoint 压缩+SHA256+upload，API 只返回 metadata；Session reason/operator/audit 必填。
- 主锚点：[`services/opsi-control/src/schemas/models.py`](services/opsi-control/src/schemas/models.py) 的 v2 Operation payload validation。
- 候选触碰：[`tools/contract-generate/export_opsi_control_openapi.py`](tools/contract-generate/export_opsi_control_openapi.py)、[`services/opsi-control/tests/test_openapi_export.py`](services/opsi-control/tests/test_openapi_export.py)。
- 变更预算：新增 collector scripts 复用统一 HostOperations module；新增依赖 0；OpenAPI 只由生成入口写。
- 最小验证：`uv run --project services/opsi-control python tools/contract-generate/export_opsi_control_openapi.py`；`npm run contracts:check`；`uv run --project services/opsi-control pytest services/opsi-control/tests/test_v2.py -k "logs or session or audit" -q`
- 停止条件：大文件不进入 stdout/log_read；Secret scan 为空；`opsiControlApi=2.0.0`、v2 paths 与 schemas 无 drift。

## Manual Live / Signoff

### 人工 Runbook
1. 在授权 OPSI 4.3 + Windows 10 Endpoint 依次执行 status、gateway restart、doctor、config success/failure rollback、logs/session collection、exact update 与 L5 repair。
2. 核对每项 requestId/clientId/operator/reason/artifactId/digest/audit 关联以及离线恢复；Security Owner 复核 token replay、Secret 与大文件边界。

### Cursor 约束
- 不代替操作员执行真实远程运维、Session 取证或签署，不自动完成 manual todo。
- 不把 fake Artifact/fixture 标为 Live，不把 not_proven 改为 proven/GO。

### 停止条件
- [ ] AC-09–AC-23 的本阶段证据由 Endpoint Ops 与 Security Owner 签署。

