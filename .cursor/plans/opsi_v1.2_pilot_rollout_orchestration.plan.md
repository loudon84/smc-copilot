---
name: OPSI v1.2 Pilot Rollout Orchestration
overview: 在 v1.1 真实 OPSI/Windows 门禁获得 Pilot GO 后，为 10～20 台 OPSI-managed Endpoint 建设不可变目标快照、预检、双人审批、2 台 Canary 与每批最多 5 台的发布编排、自动暂停、三层回滚、可复算 Evidence 和 7 天 Pilot 观察；保持 Work Direct Hermes、Salt/Runtime 隔离，且不扩展到生产全量或多 Depot。
todos:
  - id: opsi-v12-phase0-live-prerequisite
    content: "Phase 0（人工前置）: 完成 v1.1 Windows 10/11、24h Development Observation、Security/Release Signoff 与 Pilot Go/No-Go；Evidence 未 proven/GO 时禁止后续 Pilot mutation，Cursor 不得自动标记完成"
    status: pending
  - id: opsi-v12-phase1-contract-domain
    content: "Phase 1: 将 opsiControlApi 提升至 1.2.0，新增 Campaign/Batch/Target/Approval/Gate/Event/Artifact Promotion 契约、PostgreSQL migration、UoW/outbox、乐观锁和 active-target 唯一约束"
    status: completed
  - id: opsi-v12-phase2-snapshot-preflight
    content: "Phase 2: 实现 10～20 台 immutable target snapshot、stable batching、owner/inventory/artifact/rollback/user-binding/disk/health/concurrency preflight 与 testing→pilot promotion"
    status: completed
  - id: opsi-v12-phase3-approval-orchestration
    content: "Phase 3: 实现双人审批、维护窗口、2 台 Canary + 每批最多 5 台、异步 Worker dispatch、per-endpoint serialization、restart recovery 和 OPSI authoritative reconciliation"
    status: completed
  - id: opsi-v12-phase4-gates-rollback
    content: "Phase 4: 实现 policy-versioned gate evaluation、auto pause、重新 preflight 后 resume、abort，以及 target/batch/campaign 逆批次 rollback 与 rollback health/Work verify"
    status: completed
  - id: opsi-v12-phase5-observability-security
    content: "Phase 5: 实现低基数 metrics、结构化 audit/evidence manifest、RBAC/idempotency/If-Match、Secret canary/Redaction、readiness/lease/fencing 和故障注入测试"
    status: completed
  - id: opsi-v12-phase6-regression-release
    content: "Phase 6: 通过 contracts、OPSI Control、Product、migration、Windows Pester、Work Direct Hermes、OPSI Offline Continuity 与 Salt/Runtime isolation gates，生成 Pilot Runbook/Evidence 模板"
    status: completed
  - id: opsi-v12-phase7-live-pilot
    content: "Phase 7（人工门禁）: 在真实 OPSI 4.3 对 10～20 台执行 Canary/批次发布、target/batch/campaign rollback drill 和 7-Day Observation，完成 v1.3 Production Rollout Go/No-Go；Cursor 不得自动标记完成"
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v1.2

## 1. 执行依据

- PRD：[`docs/opsi/PRD-OPSI-v1.2.md`](../../docs/opsi/PRD-OPSI-v1.2.md)
- v1.1 PRD：[`docs/opsi/PRD-OPSI-v1.1.md`](../../docs/opsi/PRD-OPSI-v1.1.md)
- v1.1 Evidence：[`docs/opsi/evidence/v1.1/STATUS.md`](../../docs/opsi/evidence/v1.1/STATUS.md)
- 架构：[`docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`](../../docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)
- Contract Flow：[`docs/architecture/contract-flow.md`](../../docs/architecture/contract-flow.md)
- 基线分支：`opsi/prd-v1.0`
- 规划基线：`403c67d`

开始实现前读取：

- [`AGENTS.md`](../../AGENTS.md)
- [`apps/work/AGENTS.md`](../../apps/work/AGENTS.md)（仅 Work regression；无 OPSI feature）
- [`contracts/opsi`](../../contracts/opsi)
- [`docs/opsi/decisions/action-result-transport.md`](../../docs/opsi/decisions/action-result-transport.md)
- [`docs/opsi/decisions/machine-user-bootstrap.md`](../../docs/opsi/decisions/machine-user-bootstrap.md)

固定边界：

- 继续从当前 OPSI 分支迭代；实现分支建议为 `opsi/prd-v1.2`。
- 不修改 `infra/salt/**`、`services/salt-control/**`、`contracts/salt-control-api/**`。
- 不向 `services/runtime/**`、`contracts/runtime-api/**` 增加 OPSI 能力。
- Work 始终 Direct Hermes；不得增加 OPSI Rollout UI、RPC client、credentials 或 `window.opsiApi`。
- `opsi-control` 只连接 DB、Secret/JWKS provider 和 OPSI Server，不直连 Windows Endpoint/Gateway/Work。
- 不做超过 20 台、Multi-depot、HA、跨 Provider migration 或 Production auto-rollout。

## 2. 当前真值与启动条件

当前 [`docs/opsi/evidence/v1.1/STATUS.md`](../../docs/opsi/evidence/v1.1/STATUS.md) 为：

```text
Engineering       implemented
Live verification not_proven
Decision          NO-GO
```

因此 Phase 0 是硬门禁：

1. Windows 10/11 实机矩阵 `proven`。
2. 24h Development Observation `proven`。
3. Lab Depot install/read-back `proven`。
4. Security + Release Signoff 完成。
5. `v1.2 Pilot Go/No-Go = GO` 并归档签名 Evidence。

未满足时允许实现和测试 Phase 1～6 的代码，但禁止对 Pilot Endpoint 产生 mutation，也禁止把 Phase 0/7 标为完成。默认 feature flag 必须关闭 Pilot start，且不能由普通 API caller 绕过。

## 3. Phase 0 — v1.1 Live Gate（人工前置）

### 3.1 Evidence 收敛

- 复核 v1.1 Evidence manifest、真实 OPSI 4.3 backend info、Product/Depot read-back、Win10/11 Action matrix 和 24h report。
- 检查 Artifact digest/signer、Result checksum、Owner、Gateway/User Binding、Work Chat smoke 和 Offline Continuity。
- Release Owner、Endpoint Ops、Security Owner 在 evidence 上签名；状态从 `not_proven/NO-GO` 变为 `proven/GO`。
- 保留原始证据，只追加签核与 supersedes 关系，不覆写失败/未证明历史。

### 3.2 强制启动保护

- Pilot start 读取不可变 Gate record，不接受 body 自报 `go=true`。
- 无 GO 时返回明确的 non-retryable precondition error，并写审计。
- 单元测试/集成测试使用显式 test fixture；生产配置不允许默认 bypass。

完成标准：Operator Evidence 已归档并验证签名；Cursor 不得代签或自动完成。

## 4. Phase 1 — Contract、Domain 与 Persistence

### 4.1 API/Schema

在 `services/opsi-control` 的 FastAPI/Pydantic SOT 新增：

- `RolloutCampaign`、`RolloutBatch`、`RolloutTarget`。
- `RolloutApproval`、`GateEvaluation`、`RolloutEvent`。
- `ArtifactPromotion`、`EvidenceManifest`。
- create/preflight/approve/start/pause/resume/abort/rollback command models。

所有写 command 支持 `Idempotency-Key`、`If-Match`/revision、reason/change ticket；actor 从认证上下文获取。生成 `contracts/opsi/openapi.yaml` 和相应 JSON Schema，将 `contracts/version.json` 的 `opsiControlApi` 提升至 `1.2.0`。

Contract order：

```text
Pydantic source model
  → generated OpenAPI / JSON Schema
  → repository/domain adapters
  → worker producer/consumer
  → evidence/report consumer
```

### 4.2 Database

增加 Campaign/Batch/Target/Approval/Gate/Event/Promotion 表或等价正规化模型：

- 状态字段受 check constraint/enum 约束。
- target snapshot、artifact/config/gate revision 均保存 digest。
- 唯一约束阻止 `client_id` 同时处于两个 active mutation Campaign。
- transaction/UoW 同步提交状态、outbox 和 audit event。
- Worker lease 增加 owner、expiry、heartbeat、fencing token。
- Campaign revision 使用 compare-and-swap 防 lost update。

测试：

- `alembic upgrade head → downgrade -1 → upgrade head`。
- 从 v1.1 schema 升级，历史 Action/Result 保持可读。
- 并发 create/start/pause/rollback、重复 idempotency key、stale revision。
- crash 在 commit 前/后、outbox publish 前/后的恢复测试。

## 5. Phase 2 — Snapshot、Preflight 与 Artifact Promotion

### 5.1 Immutable Target Snapshot

- 输入只允许显式 client ids 或受控 inventory query；最终必须 materialize 为 10～20 个 canonical client ids。
- canonicalize、排序并计算 snapshot SHA-256；保存 query provenance 但不在运行期重新展开。
- Batch 固定切分为 Canary 2 台，其余每批最多 5 台；同一 digest 得到相同分批。
- group membership 后续变化不影响 Campaign；任何 target/顺序变化创建新 revision/Campaign。

### 5.2 Preflight Matrix

对每台检查并保存带时间戳的 typed result：

- supported Windows、recently seen、opsiclientd/Depot/Product inventory。
- `control-owner` 无 Salt/Runtime/direct conflict。
- target 和 previous Artifact/Package 都存在且签名/digest/signer 合法。
- target/previous config schema 和 revision 可解析。
- 安装路径、磁盘、User Binding、Scheduled Task、Gateway health 可判定。
- 无 active mutation Action/Campaign，OPSI/DB/Worker readiness 正常。

任一 rollback baseline 缺失、owner conflict 或 unknown 项使 Target `INELIGIBLE`，Campaign 不可审批。Preflight 有 TTL；start/resume 前过期必须重跑。

### 5.3 Artifact Promotion

- 实现 `testing → pilot → stable` 元数据与 `quarantined` 状态。
- v1.2 start 只接受 `pilot` Artifact，promotion 必须引用 v1.1 proven evidence 和审批。
- 同版本不同 digest 拒绝；quarantine 触发所有引用该 digest 的 active Campaign pause。
- 本版本不自动提升到 `stable`。

## 6. Phase 3 — Approval 与 Batch Orchestration

### 6.1 Approval

- 至少 Release Owner + Endpoint Ops 双人批准，创建者不可独自满足两项角色。
- signer/redaction/security policy 变化时增加 Security Owner 批准。
- Approval 绑定 Campaign revision；冻结字段变化使旧批准失效。
- start、next batch、resume、扩大 rollback scope 分别记录批准和 reason。

### 6.2 Durable Orchestrator

- API 只持久化 command 并快速返回；Worker 使用 lease/fencing 异步执行。
- 复用 v1.1 Action primitive 和 OPSI RPC adapter，不另建旁路 dispatch/result transport。
- 同一 Endpoint mutation 串行；不同 Endpoint 受全局/OPSI 限流器约束。
- 在维护窗口外停止新 mutation，但继续 health observation/result reconciliation。
- API/Worker restart 后从 DB + OPSI authoritative read-back 恢复，禁止 duplicate dispatch。

### 6.3 Batch Progression

- Canary 固定 2 台并至少观察 24h。
- 后续每批最多 5 台并至少观察 6h。
- Batch 全部 Target `HEALTHY`、gate passed 且获得下一批人工批准后才推进。
- 全部 Batch passed 后进入 7-Day Observation，不自动标记 Campaign `SUCCEEDED`。

## 7. Phase 4 — Gates、Pause/Resume 与 Rollback

### 7.1 Gate Engine

Gate policy 版本化并输出 input digest、判定、原因和 evaluator version。至少覆盖：

- Canary/Target Action failure、timeout/unknown、checksum mismatch、false success。
- Owner conflict、Artifact/signature conflict、Secret canary、Redaction failure。
- rollback failure、P0/P1、Gateway availability、Work reconnect smoke。
- OPSI/DB/Worker readiness 连续异常。

命中时事务性切换 Campaign/Batch 为 `PAUSED`，已排队但未派发的 mutation 必须被 fencing token 阻断。

### 7.2 Resume/Abort

- Pause 不停止已健康 Gateway/Work，只停止新的 Control mutation。
- Resume 要求 pause cause 关闭、未派发 Target 重新 preflight、Gate passed、审批有效。
- Abort 停止后续 mutation；是否回滚已变更 Target 必须显式选择，不做隐式 silent rollback。

### 7.3 Rollback

- `target`：单 Endpoint 恢复 frozen baseline。
- `batch`：恢复指定 Batch 中已经发生 mutation 的 Target。
- `campaign`：按逆 Batch 顺序恢复全部已经发生 mutation 的 Target。
- rollback 复用签名、checksum、Result、health、Gateway/Work smoke 和 evidence pipeline。
- baseline owner 不是 `opsi` 的 Target 在 preflight 已被拒绝；本阶段不得实现 cross-provider handoff。
- rollback failure 进入 terminal gate，禁止继续 rollout。

故障注入：Artifact missing、signature mismatch、OPSI accepted 后 Worker crash、Result late/duplicate、Gateway unhealthy、Work reconnect failure、DB/OPSI offline、lease steal。

## 8. Phase 5 — Observability、Evidence 与 Security

### 8.1 Metrics/Readiness

- Campaign/Batch/Target 状态数、duration、pause cause、rollback outcome。
- action dispatch/reconcile success/failure/unknown。
- OPSI RPC、DB pool、worker lease/heartbeat/outbox lag。
- Pilot aggregate Gateway availability、Work reconnect success。
- 生产 `/ready` 检查 DB、OPSI、Secret/JWKS、Worker freshness 与 migration head。

禁止 metric label 含 raw hostname、username、prompt、conversation、memory 或 secret。

### 8.2 Evidence

- 由 append-only event 重算 Campaign evidence manifest。
- manifest 包含 snapshot/artifact/config/gate revision、approvals、batch results、pause/rollback 和 observation 摘要。
- Gateway probe 由 Endpoint Product 产生，Work Chat smoke 由受控 Test Harness/Operator 产生；`opsi-control` 只核验 Result/Evidence，不直连 Gateway 或 Work。
- 每个 object 有 schema version、producer、timestamp、SHA-256。
- `implemented/verified/proven` 分离；API/Cursor 不得写 Operator `proven`。
- Compact Diagnostic 做结构化 Redaction 和 secret canary；完整 Bundle 保留 Endpoint-local。

### 8.3 Security

- RBAC 覆盖 create/approve/start/pause/resume/abort/rollback/evidence read。
- 强制 TLS verification、Secret Provider、signer allowlist、request/audit correlation id。
- body 中 actor/role 字段被忽略或拒绝，不能伪造审批身份。
- 审计读取和 Target 详情受限；列表 API 默认最小化 Endpoint 标识。

## 9. Phase 6 — Regression、Release Gates 与 Runbook

### 9.1 Automated Gates

OPSI Product：

```text
python -m pytest infra/opsi/tests -q
Invoke-Pester infra/opsi/tests/SmcHermesAgent.Tests.ps1
```

OPSI Control：

```text
cd services/opsi-control
uv sync --extra dev
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic upgrade head
```

Contracts / Isolation：

```text
npm run contracts:check
python scripts/check-opsi-isolation.py --base <merge-base>
git diff --exit-code <base>...HEAD -- infra/salt services/salt-control contracts/salt-control-api
git diff --exit-code <base>...HEAD -- services/runtime contracts/runtime-api
```

Work regression：

```text
cd apps/work
lat check
npm run typecheck
npm run lint
npm test
npm run build
```

Work 只做 Direct Hermes、external owner availability、reconnect 和 OPSI Offline Continuity 回归；如果实现需要新增 Work OPSI API/UI，视为违反本计划。

### 9.2 Runbook/Evidence 模板

新增 v1.2：

- Pilot target nomination/preflight checklist。
- Approval/maintenance window/run/pause/resume/abort runbook。
- target/batch/campaign rollback drill runbook。
- Canary 24h、batch 6h、final 7-Day Observation 模板。
- P0/P1、Secret leak、Owner conflict、false success、rollback failure 的 NO-GO 规则。

## 10. Phase 7 — Live Pilot（人工门禁）

在真实 OPSI 4.3 单 Server/Depot、10～20 台 Windows 10/11 Endpoint 执行：

1. 固化 Target snapshot、Artifact/config/baseline digest。
2. 完成 Preflight 与双人/安全审批。
3. Canary 2 台发布并观察至少 24h。
4. 后续每批最多 5 台，每批观察至少 6h并审批推进。
5. 注入失败验证 auto pause/no-new-dispatch。
6. 分别执行 target、batch、campaign rollback drill。
7. 验证 OPSI/Control offline 时 Gateway/Work continuity。
8. 全部 Target 收敛后观察 7 天。
9. Release/Endpoint Ops/Security 复核 Evidence，签署 v1.3 Production Rollout Go/No-Go。

硬性 NO-GO：

- v1.1 Live Gate 未 proven。
- Secret leak、owner conflict、false success 或最终 Action unknown 非 0。
- 任一 rollback drill 失败。
- 用户 Hermes 数据损失或健康 Gateway/Work 因 Control offline 停止。
- 未关闭 P0/P1。
- 通过删除失败 Target、重写 snapshot 或覆盖历史 Evidence 达成指标。

## 11. PR 拆分

1. `feat(opsi-control): add v1.2 rollout contracts and persistence`
2. `feat(opsi-control): add immutable target preflight and artifact promotion`
3. `feat(opsi-control): add approval and durable batch orchestration`
4. `feat(opsi-control): add rollout gates pause resume and rollback`
5. `feat(opsi-control): add rollout observability audit and evidence`
6. `test(opsi): add pilot failure injection and isolation regressions`
7. `docs(opsi): add v1.2 pilot runbook and evidence templates`
8. `test(opsi): archive 10-20 endpoint seven-day pilot evidence`（Operator Evidence PR）

Contract/Migration PR 先于 producer/consumer；功能 PR 不包含 Live `proven` Evidence。每个工程 PR 应可独立回退，且 Salt/Runtime 隔离 diff 必须为空。

## 12. Definition of Done

- [ ] Phase 0 v1.1 Live Gate 已由 Operator 签为 `proven/GO`。
- [ ] `opsiControlApi 1.2.0`、OpenAPI/Schema、migration/compatibility gates 通过。
- [ ] 10～20 台 immutable snapshot、deterministic batches 与 digest 通过测试。
- [ ] Preflight 对 unsafe/unknown/unrollbackable Target fail closed。
- [ ] 双人审批、revision invalidation、maintenance window、RBAC 生效。
- [ ] Canary/Batch durable orchestration 在 restart/offline/duplicate 场景收敛。
- [ ] Auto pause 后无新 dispatch；resume 重新 preflight 和审批。
- [ ] target/batch/campaign rollback 与 health/Work verify 通过。
- [ ] Evidence 可复算、默认脱敏、secret canary 与 checksum 通过。
- [ ] Contracts、Product、Control、Pester、Work 与 isolation 全部通过。
- [ ] 10～20 台 7-Day Pilot 由 Operator 签为 `proven`。
- [ ] v1.3 Production Rollout Go/No-Go 已归档；未获 GO 时不得扩大范围。
