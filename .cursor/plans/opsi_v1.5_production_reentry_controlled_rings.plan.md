---
name: OPSI v1.5 Production Re-entry + Controlled Rings
overview: 基于 9c10235 已完成的 v1.4 Real Lab/Windows Runtime 信任链，把 v1.3 Production Rings 从测试 facts 接到真实 Action Result、continuation、Product read-back、持久化 Inventory 与 Work Evidence，补齐可恢复 Ring observation、Ed25519 Depot Attestation v2 和签名 Production Re-entry Gate；人工范围只认证 Windows 10，先执行 3～5 台 accelerated Pilot，再执行 21～50 台、1～2 Depot 的 Controlled Production Re-entry 与 7-Day Observation。
todos:
  - id: opsi-v15-phase0-truth-red-tests
    content: "Phase 0: 统一 v1.4 Windows 10-only Live Gate，冻结 Production，新增 ADR-034 与针对 self.facts reconcile、提前 Ring 观察/推进、弱 Depot signature、无正式 re-entry Gate import 的 red tests，并固定 Pester/PowerShell 兼容基线"
    status: completed
  - id: opsi-v15-phase1-target-verification
    content: "Phase 1: 建立 Action/Result/continuation/ProductOnClient/Inventory/Work Evidence 到持久化 TargetVerification 的相关性桥接、幂等 outbox 与 restart/replay 语义"
    status: completed
  - id: opsi-v15-phase2-authoritative-reconcile
    content: "Phase 2: 将 rollout success、rollback verify、gate input 与 fleet compliance 全部切到 TargetVerification/Inventory repository，删除 production self.facts 成功路径并对 stale/missing/conflict fail closed"
    status: completed
  - id: opsi-v15-phase3-ring-state-machine
    content: "Phase 3: 合并 Ring/Batch 状态 SOT，使 observation 从最后 Target HEALTHY 开始，next Ring 强制 predecessor PASSED、deadline、fresh preflight、mapping/attestation、triple approval 与 fencing revision"
    status: completed
  - id: opsi-v15-phase4-depot-attestation
    content: "Phase 4: 实现 canonical Depot Attestation v2 + Ed25519 verify，绑定 Artifact envelope v2、key id 与 ProductOnDepot read-back；tamper/expiry/drift 时 quarantine + freeze"
    status: completed
  - id: opsi-v15-phase5-reentry-evidence
    content: "Phase 5: 实现受信 v1.5-production-reentry Gate import/get/revoke、签名/expiry/revision/RBAC，并输出可复算 Evidence Manifest v3；Cursor/CI 不得写 proven/GO"
    status: completed
  - id: opsi-v15-phase6-policy-api-db
    content: "Phase 6: 增加 controlled-reentry-v1.5（21～50、1～2 Depot、Ring 0/10/25/50/100、final 7-Day）、opsiControlApi 1.5.0、Schemas 与 0006 migration；人工验证只使用 Windows 10"
    status: completed
  - id: opsi-v15-phase7-automated-gates
    content: "Phase 7: 完成 PostgreSQL restart/migration、freeze/rollback/crash、attestation negative vectors、21/50 deterministic 与 500/8 engineering load、Product/Pester/Contracts/Work/isolation 自动化"
    status: completed
  - id: opsi-v15-phase8-live-pilot
    content: "Phase 8（人工门禁）: 在真实 OPSI 4.3 执行 3～5 台 Windows 10 accelerated-v1.4 Pilot、24h Observation 与 target/batch/campaign rollback；Cursor 不得自动标记完成"
    status: pending
  - id: opsi-v15-phase9-live-production
    content: "Phase 9（人工门禁）: 执行 21～50 台 Windows 10、1～2 Depot Controlled Rings、Depot/freeze/rollback/recovery drill 与 7-Day Observation，Operator 签署 v1.5 Go/No-Go"
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v1.5

## 1. 执行依据

- PRD：[`docs/opsi/PRD-OPSI-v1.5.md`](../../docs/opsi/PRD-OPSI-v1.5.md)
- v1.4 PRD：[`docs/opsi/PRD-OPSI-v1.4.md`](../../docs/opsi/PRD-OPSI-v1.4.md)
- v1.4 Evidence：[`docs/opsi/evidence/v1.4/STATUS.md`](../../docs/opsi/evidence/v1.4/STATUS.md)
- OPSI Provider：[`docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`](../../docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)
- Production Rings：[`docs/adr/ADR-032-opsi-production-rings-multi-depot.md`](../../docs/adr/ADR-032-opsi-production-rings-multi-depot.md)
- Runtime Trust：[`docs/adr/ADR-033-opsi-real-lab-runtime-trust.md`](../../docs/adr/ADR-033-opsi-real-lab-runtime-trust.md)
- Contract Flow：[`docs/architecture/contract-flow.md`](../../docs/architecture/contract-flow.md)
- 基线分支：`opsi/prd-v1.0`
- 规划基线：`9c10235`

开始实现前读取：

- [`AGENTS.md`](../../AGENTS.md)
- [`apps/work/AGENTS.md`](../../apps/work/AGENTS.md)（只做 Direct Hermes 回归）
- [`contracts/opsi`](../../contracts/opsi)
- [`services/opsi-control`](../../services/opsi-control)
- [`infra/opsi/products/smc-hermes-agent`](../../infra/opsi/products/smc-hermes-agent)

建议实现分支：`opsi/prd-v1.5`。

固定边界：

- 不修改 `infra/salt/**`、`services/salt-control/**`、`contracts/salt-control-api/**`。
- 不向 `services/runtime/**` 或 `contracts/runtime-api/**` 增加 OPSI。
- Work 保持 Direct Hermes `:8642`；不新增 OPSI UI/API/credentials。
- Control 只经 opsiconfd JSON-RPC 管理 Endpoint，不增加 SSH/WinRM/SMB/Endpoint HTTP。
- Windows Endpoint SQLite、OPSI Server 自有数据库不变；opsi-control 继续连接公司内部既有 PostgreSQL 的隔离 database/schema。
- v1.5 Live 只认证 Windows 10、21～50 Endpoint、1～2 Depot；500/8 只保留 engineering load gate。
- Phase 8/9 只能由 Operator Evidence 完成。工程代码、fixture、migration、Cursor 不得写 `proven/GO`。

## 2. 基线真值与 P0 缺口

v1.4 engineering 已实现：

```text
test/lab/production exclusive assembly
HttpOpsiJsonRpc + existing internal PostgreSQL
persisted inventory/binding + ABSENT/INSTALLED/CONFLICT
Artifact envelope v2 + Endpoint Ed25519 verify
managed absolute CLI + SID tasks + owner transaction
user continuation relay
accelerated-v1.4 policy
Production gate = v1.5-production-reentry（default frozen）
```

实现前必须用 red tests 固化以下事实：

1. `RolloutService.reconcile_once()`、rollback verify、fleet compliance 仍读取 `self.facts`。
2. Result Reconciler 收敛 Action，但没有持久化 Rollout Target verification link。
3. Batch 在 dispatch 后立即 OBSERVING，未等待 Target HEALTHY。
4. `approve_ring()` 没有校验 predecessor PASSED/observe deadline/freshness/drift。
5. Depot Attestation 只检查 signature 长度，不做 Ed25519。
6. production 禁止 seed 是正确的，但缺少正式签名 Gate import/revoke 路径。
7. 当前 runner 下 Pester traversal `Should Throw` 报 false negative，而直接调用 resolver 会正确抛错；需要固定 Windows 10 PowerShell 5.1/CI pwsh/Pester 兼容矩阵，不能删测试绕过。

以上任一项未关闭，`v1.5-production-reentry` 必须保持 412。

## 3. Phase 0 — Truth Freeze、ADR-034 与 Red Tests

### 3.1 文档与 Gate 真值

- v1.4 Live Gate 统一为 `v1.4-win10-clean-endpoint`：1 台 Windows 10；不要求 Windows 11。
- v1.4 accelerated policy 工程能力保留，但 3～5 台 Live Pilot 移入 v1.5 Phase 8。
- v1.1～v1.4 historical Evidence 不回写为已完成。
- 新建 v1.5 Evidence STATUS：engineering/live 分层，初始 `not_implemented/not_proven/NO-GO`。
- Production start、stable promotion、next Ring 继续检查 persisted `v1.5-production-reentry`。

### 3.2 ADR-034

新增 `ADR-034-opsi-production-reentry-authoritative-rings.md`，冻结：

- TargetVerification source/trust model。
- Ring single SOT 与 observation 起点。
- Depot Attestation v2 canonical Ed25519 contract。
- signed live Gate import/revoke，服务不自行签 GO。
- Windows 10-only validation matrix、21～50 / 1～2 Depot Live authorization；不新增 Windows 11 拒绝逻辑。
- Work Direct Hermes、公司内部 PostgreSQL 与 OPSI DB 隔离边界。

### 3.3 Red Tests

- 空 `facts` 但真实 Repository Result/Inventory 齐全时 Target 必须能 HEALTHY。
- facts 声称 success 但 Repository 缺 Result 时不得 HEALTHY。
- enqueue/dispatch 后 observation 不得开始。
- predecessor 未 PASSED/未到 deadline 时 next Ring 必须 412。
- signature 仅够长度但无效的 attestation 必须失败。
- production seed、body `decision=GO`、env flag 均不能解冻。
- traversal negative case 在固定 Pester runner、Windows 10 PowerShell 5.1 和 CI pwsh 上均通过。

## 4. Phase 1 — TargetVerification Bridge

### 4.1 模型

新增 `TargetVerificationRecord`：

```text
campaignId / clientId / actionId / kind(apply|rollback)
actionResultDigest / parentResultDigest
productReadbackDigest / inventoryDigest
gatewayEvidenceRef / workEvidenceRef
desiredVersion/package/artifact/config/owner
observedVersion/package/artifact/config/owner/tasks/health
decision / reason / observedAt / expiresAt / canonicalDigest
```

- unique key 绑定 campaign/target/action/kind；同 digest replay 幂等，不同 digest conflict。
- 只存 Work smoke reference/digest；不让 opsi-control 连接 Work。
- Inventory 中敏感 SID/account 继续按 RBAC/redaction 处理。

### 4.2 Action/Result Correlation

- Rollout enqueue 时写 target action relation，不只写字符串 `action_id`。
- Result Reconciler 终结 Action 后发布 `action.result.finalized` outbox。
- continuation Result 使用 parent request id 关联原 rollout action，不把 status poll 当成业务成功。
- Verification worker 读取 Action Result、ProductOnClient、fresh status Inventory 和 Work evidence，生成 canonical decision。
- API/worker restart、重复/乱序 marker、late result、wrong client/parent/digest 全部测试。

完成标准：production state 不注入 facts，也能从真实 repository 将 Target 从 DISPATCHED 收敛到 HEALTHY/FAILED/UNKNOWN_BLOCKED。

## 5. Phase 2 — Authoritative Reconcile、Rollback 与 Compliance

### 5.1 删除 facts 成功路径

- 从 `RolloutService` constructor 移除 production `facts`；注入故障改为 test-only fake provider。
- preflight safety flags 使用持久化 security evidence，而不是 dict。
- dispatch 只处理 eligible/fresh snapshot，不消费 `injectFailure/secretCanary` map。
- reconcile、rollback、compliance 只读取 Verification/Inventory/Event repositories。

### 5.2 Apply 与 Rollback

- `Action SUCCEEDED` → `VERIFYING`，不是直接 HEALTHY。
- exact Product/package/artifact/config/owner/tasks/Gateway + Work evidence 齐全才 HEALTHY。
- rollback 分别验证 ABSENT 与 INSTALLED frozen baseline。
- OPSI/DB/Endpoint offline、stale evidence → UNKNOWN_BLOCKED；不写 false success。
- critical failure 通过持久化 gate event 触发 freeze，不能依赖进程内 hint。

### 5.3 Fleet Compliance

- desired 来自 frozen Campaign；observed 来自 fresh Inventory/Verification。
- 输出 COMPLIANT/DRIFTED/UNKNOWN/EXEMPT，包含 source digest 与 observedAt。
- drift 只读，不自动 mutation；修复必须新 Campaign。

## 6. Phase 3 — Ring Single SOT 与 Observation

### 6.1 状态归一

- `rollout_rings` 为 production SOT；`batches` 只做 API compatibility projection。
- 状态 transition 使用 CAS、campaign/depot/ring fencing token 和 append-only event。
- Ring status、Target status、Depot lane 与 Campaign status 原子更新或经 outbox 幂等收敛。

### 6.2 Observation

- 只有当前 Ring 所有 Target HEALTHY 后进入 OBSERVING。
- `observe_started_at=max(target.healthy_at)`；`observe_until` 持久化。
- 期间持续 refresh Inventory/Work evidence，critical drift 立即 PAUSE/FREEZE。
- deadline 到期且 gate PASS 才 PASSED；API/Worker restart 不跳过时间。

### 6.3 Next Ring

检查顺序：

1. live Gate active/GO、global freeze inactive。
2. predecessor PASSED、observe deadline 到期。
3. mapping digest 未漂移、all Depot Attestation fresh。
4. target Inventory/preflight fresh、Artifact 仍 stable/non-quarantined。
5. Release Owner + Endpoint Ops + Security Owner 对当前 revision 同意。

任一不满足返回明确 412，不修改 next Ring。

## 7. Phase 4 — Depot Attestation v2

### 7.1 Contract

新增 `depot-artifact-attestation.schema.json` v2，canonical payload 绑定：

- depot/Product/productVersion/packageVersion。
- artifact digest、runtime envelope manifest digest、Hermes signer key id。
- ProductOnDepot read-back digest/observedAt。
- issuer/key id/algorithm/generated/expiry/evidence ref。

### 7.2 Verification

- 配置 allowlisted Ed25519 keys 和 revoke set；请求 body 不传可信 public key。
- 使用 shared canonical test vectors；valid/tamper/wrong key/wrong envelope/expired/revoked/readback drift。
- start/next Ring 重新读取 ProductOnDepot 并比较 attestation read-back digest。
- mismatch quarantine Artifact；owner/artifact/signature conflict触发 global freeze。

保留 OPSI-native distribution 边界：Control 不复制文件，也不生成“Depot 已复制”的假证明。

## 8. Phase 5 — Signed Re-entry Gate 与 Evidence v3

### 8.1 Gate API

实现：

```text
POST /live-gates/import
GET  /live-gates/{gate_id}
POST /live-gates/{gate_id}/revoke
```

- import 接收外部签名 Gate envelope，服务使用 allowlisted Operator key 验签。
- payload 绑定 v1.4 Win10 Evidence、accelerated Pilot policy/evidence、rollback summary、Artifact digest、target/depot scope 和 expiry。
- Release Owner、Endpoint Ops、Security Owner 的签名/approval 都绑定同一 input digest。
- revoke 立即阻止 stable/start/next Ring；已运行 Campaign pause，critical 原因可 freeze。
- test-only seed 保留单元测试能力，但 production 永远拒绝。

### 8.2 Evidence Manifest v3

- 从 Event/Verification/Ring/Attestation/Freeze repositories 复算，不依赖内存 counter。
- tolerant-reader 继续接受 v1/v2；新 producer 输出 v3。
- service verification 最高为 `verified`，decision 默认 `NO-GO`。
- Operator signed envelope 与 service manifest 分离存储，避免服务自证 GO。

## 9. Phase 6 — Policy、API、Contracts 与 DB

### 9.1 Production Policy

新增 immutable `controlled-reentry-v1.5`：

```text
21..50 targets / 1..2 depots
Ring 0: 1 per depot, global max 4
Cumulative: 10 / 25 / 50 / 100 percent
Observe: 24h / 12h / 12h / 24h / final 7d
Concurrency: global 5 / campaign 3 / depot 2
```

- policy revision/digest 写入 Campaign/Approval/Evidence。
- `engineering-v1.3` 500/8 profile不能满足 v1.5 Live Gate。
- live profile preflight 拒绝 >50 或 >2 Depot；人工 Evidence 只使用 Windows 10，不新增 Windows 11 拒绝分支。

### 9.2 API/Schema

- `opsiControlApi=1.5.0`；FastAPI/Pydantic 生成 OpenAPI。
- target verification、attestation v2、evidence v3、production policy schemas。
- old pilot/create readers兼容；不静默解释缺失 production revision。

### 9.3 Migration

- 建议 `0006_v15_production_reentry.py`。
- target verifications、ring observations、live gate signature/revoke、attestation v2、policy fields/indexes。
- PostgreSQL upgrade/downgrade/upgrade、historical v1.3/v1.4 read、API/Worker rolling restart。

## 10. Phase 7 — Automated Gates

OPSI Control：

```text
cd services/opsi-control
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic upgrade head
```

必须新增：

- Action→Rollout integration、continuation/restart/replay tests。
- Ring timing/predecessor/drift/fencing tests。
- Depot Attestation v2 cryptographic negative vectors。
- freeze at claim/dispatch、rollback recovery、PostgreSQL/OPSI outage tests。
- 21/50 Windows 10 + 1/2 Depot deterministic tests。
- 500/8 engineering load regression；不能生成 Live GO。
- 固定 Pester 版本/语法，关闭当前 traversal assertion runner false negative，并保留直接行为证明。

Repository：

```text
python -m pytest infra/opsi/tests -q
Invoke-Pester infra/opsi/tests/SmcHermesAgent.Tests.ps1
npm run contracts:check
python scripts/check-opsi-isolation.py --base <merge-base>
git diff --exit-code <base>...HEAD -- infra/salt services/salt-control contracts/salt-control-api
git diff --exit-code <base>...HEAD -- services/runtime contracts/runtime-api
cd apps/work && lat check && npm run typecheck && npm test && npm run build
```

更新 Runbooks：re-entry Gate signing、Target verification recovery、attestation v2、accelerated Pilot、controlled rings、freeze/rollback、7-Day evidence、NO-GO。

## 11. Phase 8 — Windows 10 Accelerated Pilot（人工）

前置：v1.4 Windows 10 Clean Endpoint 已 `proven/GO`。

1. 真实 OPSI 4.3、1 Config Server/Depot、3～5 台 Windows 10。
2. 同一 Artifact envelope v2，policy digest=`accelerated-v1.4`。
3. Canary 2 / 4h，follow-on ≤3 / 1h，final 24h。
4. 验证 continuation、Action→TargetVerification、Control/OPSI offline continuity。
5. target/batch/campaign rollback drill，确认 user data retained。
6. final unknown、secret leak、owner conflict、artifact conflict、false success、rollback failure 为 0。
7. Operator 签署 Pilot Evidence；Cursor 不得修改为 proven。

Pilot 未 GO 时不得 import `v1.5-production-reentry` GO。

## 12. Phase 9 — Controlled Production Re-entry（人工）

1. 冻结 21～50 台 Windows 10、1～2 Depot mapping/profile/artifact。
2. 验证 stable promotion、每 Depot ProductOnDepot + Attestation v2。
3. import 三方签名 `v1.5-production-reentry` Gate。
4. 执行 Ring 0 → 10% → 25% → 50% → 100%，逐 Ring 验证观察时钟与 approval revision。
5. 注入普通 Depot failure 验证 lane pause；注入 critical conflict 验证 global freeze。
6. 执行 target/depot/ring/campaign rollback 与 freeze clear/recovery。
7. 完成 7-Day Observation，归档 Evidence Manifest v3 和 Operator Go/No-Go。

Live GO 仅授权 21～50 / 1～2 Depot，人工 Evidence 由 Windows 10 设备产生。它不构成 Windows 11 独立认证，但也不改变现有 Windows 11 兼容逻辑；51～500、3～8 Depot 继续 NO-GO。

## 13. 建议 PR 拆分

1. `test(opsi): add v1.5 production reentry red gates`
2. `feat(opsi-control): persist rollout target verification`
3. `fix(opsi-control): reconcile rollout from authoritative results`
4. `fix(opsi-control): make ring observation and progression recoverable`
5. `feat(opsi-control): verify depot attestation v2`
6. `feat(opsi-control): import signed production reentry gates`
7. `feat(opsi-control): add evidence manifest v3 and api 1.5`
8. `test(opsi-control): add postgres restart freeze and load gates`
9. `docs(opsi): add v1.5 operator runbooks`
10. `test(opsi): archive windows 10 pilot evidence`（Operator PR）
11. `test(opsi): archive controlled production evidence`（Operator PR）

顺序约束：TargetVerification 在 Rollout reconcile 之前；Ring state 在 Live Campaign 之前；Attestation/Gate/Evidence 在 Production start 之前。工程 PR 不包含 Operator GO。

## 14. Definition of Done

- [ ] v1.4 Windows 10-only Live Gate 和历史 NO-GO 真值一致。
- [ ] production Rollout/rollback/compliance 无 `self.facts` 成功路径。
- [ ] TargetVerification 可权威关联 Action/continuation/read-back/Inventory/Work Evidence。
- [ ] apply/rollback 在 missing/stale/conflict/outage 时 fail closed。
- [ ] Ring state 单一可恢复，observation 从全部 HEALTHY 后开始。
- [ ] next Ring 强制 predecessor/deadline/freshness/drift/approval/fencing。
- [ ] Depot Attestation v2 执行 Ed25519，并绑定 envelope v2 + ProductOnDepot。
- [ ] signed `v1.5-production-reentry` Gate 可 import/revoke，production seed/body/env 不能绕过。
- [ ] Evidence Manifest v3 可从 PostgreSQL 持久化事件复算。
- [ ] controlled-reentry-v1.5 只允许 21～50、1～2 Depot；人工验证只使用 Windows 10，代码不新增 Windows 11 拒绝逻辑。
- [ ] API 1.5.0、Schema/OpenAPI、0006 migration、restart/load/security gates 通过。
- [ ] Product/Pester/Contracts/Work/isolation 无回归。
- [ ] 3～5 Windows 10 Pilot / 24h 由 Operator `proven/GO`。
- [ ] 21～50 Windows 10 / 1～2 Depot + rollback/freeze + 7-Day 由 Operator签核。
- [ ] Operator GO 前 Production start/stable/next Ring 继续冻结。
