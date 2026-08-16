# SMC Copilot OPSI Endpoint Control Plane v1.5 PRD

**Production Re-entry + Authoritative Controlled Rings**

- 基线分支：`opsi/prd-v1.0`
- 规划基线：`9c10235`（OPSI v1.4 engineering implementation）
- 目标 API：`opsiControlApi 1.5.0`
- 目标 Product：`smc-hermes-agent` package revision 2（除非 Endpoint contract 必须修订）
- 状态：Planning；v1.4 Windows 10 Live Evidence 未 `proven/GO` 前，Production mutation 保持冻结

## 1. 文档定位

v1.4 已完成真实 Lab 装配、公司内部 PostgreSQL 持久化、权威 Inventory、Artifact envelope v2、Endpoint Ed25519 验签、managed absolute CLI、SID-scoped Tasks、Owner transaction 和 continuation relay。人工认证矩阵已收敛为 **1 台 Windows 10 Clean Endpoint**；Windows 11 不再是 v1.4 或 v1.5 的发布门禁。

v1.3 的 Production Rings 目录虽然已经存在，但它仍建立在测试 facts 和弱 Depot Attestation 上，不能仅通过写入一个 GO 记录就安全解冻。v1.5 的任务是把 v1.3 编排真正接到 v1.4 的 Runtime/Result/Inventory 信任链，然后先完成 3～5 台 Windows 10 Accelerated Pilot，再进行 21～50 台、1～2 Depot 的 Controlled Production Re-entry。

```text
v1.4 Windows 10 Clean Endpoint proven/GO
                    ↓
3～5 Windows 10 Accelerated Pilot / 24h
                    ↓
Authoritative Result → Rollout Target Reconciliation
                    ↓
Artifact Envelope v2 → Cryptographic Depot Attestation
                    ↓
controlled-reentry-v1.5 / 21～50 / 1～2 Depot
                    ↓
Ring 0 → 10% → 25% → 50% → 100%
                    ↓
Rollback + Freeze/Recovery Drill + 7-Day Observation
                    ↓
v1.6 Fleet Scale Expansion Go / No-Go
```

## 2. v1.4 后代码审计结论

以下缺口是 Production Re-entry 的 P0 blocker，不是人工签核可以替代的事项。

### 2.1 Rollout 结果仍依赖测试 facts

- `RolloutService.preflight()` 已读取持久化 Inventory，但仍把 `self.facts` 作为 secret/injection flags。
- `dispatch_once()` 仍从 `self.facts` 注入 failure；真实 production 装配中该 map 为空。
- `reconcile_once()` 只检查 `resultChecksum/productReadback/gatewayProbe/workSmoke` 的 facts；没有消费 Action Repository、Result Repository、continuation Result 或 fresh Inventory。
- rollback verify 与 fleet compliance 同样读取 facts，真实环境无法权威写入 `HEALTHY/ROLLED_BACK/COMPLIANT`。
- `result_reconciler` 可以收敛 Action，却没有将 Action Result 与 Rollout Target、目标 Inventory digest 和观察窗口形成持久化 verification record。

### 2.2 Ring Gate 与 Observation 时序不成立

- Batch/Ring 在 Action 刚入队后立即执行 gate evaluation，并立即开始 observation，而不是等待所有 Target 完成 Action + read-back + health。
- `approve_ring()` 没有强制前一 Ring `PASSED`、观察截止、fresh preflight 和 mapping/attestation 未漂移。
- Ring 与 Batch 是两套记录，状态更新并未形成单一可恢复状态机；API/Worker restart 后可能出现不一致。
- Depot lane pause/resume、Campaign freeze 和 Ring progression 之间缺少同一 fencing revision 的原子约束。

### 2.3 Depot Attestation 仍是弱证明

- 当前 attestation 只验证 issuer、expiry、版本/digest 和 `signature` 长度，不执行密码学验签。
- Attestation 未绑定 v1.4 Artifact envelope v2 的 manifest digest、signer key id、signature algorithm 和 ProductOnDepot read-back digest。
- Attestation 有效不等于对应 Depot 当前仍持有 exact package；start/advance 前必须重新读取 OPSI authoritative state。

### 2.4 Re-entry Gate 缺少生产导入闭环

- Production start、stable promotion 和 Ring advancement 已正确检查 `v1.5-production-reentry`，但 production 禁止 test seed。
- 尚缺少由受信 Operator Evidence 生成、验签、持久化、撤销和审计该 Gate 的正式路径。
- 现有 Evidence Manifest v2 固定返回 `implemented/NO-GO`，不能承载 v1.4 Clean、Pilot、Depot/Ring verification 和 7-Day summary 的可复算输入。

### 2.5 Windows Test Runner 基线不一致

- 当前 Python/Control/Contract 门禁通过，但本机 Pester runner 对 `Should Throw` 报 1 个 false negative；同一 `Resolve-SmcHermesCli` 路径逃逸调用直接执行会正确抛出 `entrypoint escapes managed root`。
- v1.5 必须固定 Pester/PowerShell 兼容矩阵，并在 Windows 10 PowerShell 5.1 与 CI pwsh 上使用兼容断言重新证明 traversal fail closed；不得删除或弱化该安全测试来获得绿灯。

## 3. 产品目标

v1.5 必须完成：

- 将 Action/Result、ProductOnClient read-back、fresh Endpoint Inventory 和 Operator/Test Harness Work smoke 合并成持久化 `TargetVerification`，彻底移除 production Rollout 对 `self.facts` 的依赖。
- 让 setup/update continuation 的 parent Result 能被所属 Rollout Target 精确消费；重启、重复 marker 和乱序事件保持幂等。
- 用单一、可恢复的 Ring state machine 约束 `dispatch → verify → observe → pass → approve next`。
- 每次 Ring start/advance 前重新校验 mapping digest、Inventory freshness、stable Artifact、Depot package 和 attestation。
- 将 Depot Attestation 升级为 canonical payload + Ed25519 verify，并绑定 Artifact envelope v2 与 OPSI ProductOnDepot read-back。
- 提供受 RBAC、双/三人审批和外部签名约束的 `v1.5-production-reentry` Gate import/revoke API；禁止 body/env/fixture 直接宣称 GO。
- 使用 versioned `controlled-reentry-v1.5` production profile：21～50 台、1～2 Depot、Ring 0/10%/25%/50%/100%、最终 7-Day Observation；本版本人工验证设备统一使用 Windows 10。
- 在 production re-entry 前完成人工 3～5 台 Windows 10 `accelerated-v1.4` Pilot / 24h Observation 和 rollback drill。
- 证明 global freeze、Depot pause、target/depot/ring/campaign rollback、OPSI/DB/Worker restart 后 authoritative recovery。
- 输出 Evidence Manifest v3；只有 Operator signoff 可以生成 `proven/GO`，服务和 Cursor 只能生成 `implemented/verified`。

## 4. 支持范围

### 4.1 v1.5 Live 认证范围

```text
Validation OS          Windows 10 only（不新增 Windows 11 独立用例）
Accelerated Pilot      3..5 endpoints / 1 Depot / final 24h
Production Re-entry    21..50 endpoints / 1..2 Depots
Config Server          1
Ring profile           0 / 10% / 25% / 50% / 100%
Final observation      7 days
Hermes owner           opsi only；ABSENT enrollment 仅限 Pilot
```

- v1.3 的 21～500 / 1～8 Depot 工程容量和 load test 继续保留。
- v1.5 Live GO **只授权**上述 21～50 / 1～2 Depot profile；不能据此扩展到 500/8。
- Windows 11 不作为测试或签核条件，也不由 v1.5 Evidence 宣称完成了独立认证；现有 Windows 平台兼容逻辑不因测试矩阵收缩而主动拒绝 Windows 11。

### 4.2 非目标

v1.5 不建设：

```text
Windows 11 Live certification
51～500 Endpoint 或 3～8 Depot 的 Live authorization
多个 OPSI Config Server、OPSI Server HA/DR 或自动故障切换
OPSI Control 自建 PostgreSQL；继续连接公司内部既有 PostgreSQL
访问、联表或迁移 OPSI Server 自有数据库
Control 直连 Endpoint/Gateway/Work（SSH/WinRM/HTTP）
Work Rollout UI / window.opsiApi / OPSI credentials
Salt/Runtime ↔ OPSI 自动迁移或跨 Provider rollback
Depot 文件复制、SMB/SSH 分发或伪造“复制完成”证明
Repair L3+、无人审批自愈、AI 发布决策
```

## 5. 架构与数据流

### 5.1 Authoritative Target Verification

```text
Rollout Target.action_id
        ↓
Action Repository + Result Repository + continuation parent result
        ↓
OPSI ProductOnClient exact version/package/actionResult read-back
        ↓
fresh Endpoint Inventory（artifact/config/owner/tasks/Gateway health）
        ↓
Operator/Test Harness Work reconnect evidence reference
        ↓
TargetVerification（canonical digest + observedAt + source refs）
        ↓
Target HEALTHY / ROLLED_BACK / UNKNOWN_BLOCKED / FAILED
```

规则：

- Control 不探测 `localhost:8642`，Gateway health 由 Endpoint `status` evidence 提供。
- Work smoke 由受控 Test Harness 或 Operator Evidence 提供，只保存 reference/digest，不在 Work 增加 OPSI API。
- `SUCCEEDED` Action 不是 `HEALTHY` Target；必须满足 exact package/artifact/config/owner/task/Gateway 和 Work evidence。
- 任一 source stale、缺失、冲突或不可读时为 `UNKNOWN_BLOCKED`，不得猜测成功。
- Action Result、Inventory refresh 与 Target transition 使用 outbox/idempotency，并在 PostgreSQL transaction 内绑定。

### 5.2 Rollback Verification

- `ABSENT` baseline：确认 Product/managed runtime/tasks 已清理、previous owner 已恢复、用户 `.hermes` 保留。
- `INSTALLED` baseline：确认 exact previous package/artifact/config/tasks/owner 和 healthy Gateway 已恢复。
- `ROLLED_BACK` 仅由 `TargetVerification(kind=rollback)` 写入。
- rollback failure、owner/artifact conflict、false success 立即 global freeze。

### 5.3 Ring State Machine

```text
PENDING → PREFLIGHT_READY → APPROVED → DISPATCHING
      → VERIFYING → OBSERVING → PASSED
                    ↘ PAUSED / BLOCKED
      → ROLLING_BACK → ROLLED_BACK | FAILED
```

- Ring 0：每个 Depot 1 台；单 Depot且风险需要时可 2 台，全局不超过 4 台。
- Ring 1/2/3/4：累计 10%/25%/50%/100%，membership 和 mapping digest 创建后冻结。
- Observation：Ring 0 24h、Ring 1 12h、Ring 2 12h、Ring 3 24h、Ring 4 完成后 7 天。
- Observation 从最后一个 Target `HEALTHY` 时开始，不从 enqueue/dispatch 开始。
- 下一 Ring 只在前一 Ring `PASSED`、deadline 到期、zero critical、fresh preflight、triple approval 后进入 READY。
- Ring、Batch 只能保留一个状态 SOT；旧 Batch view 作为兼容投影，不允许双写分叉。

### 5.4 Depot Attestation v2

Canonical payload 至少绑定：

- schema/revision、depot id、Product/package identity。
- Artifact zip digest、envelope manifest digest、Hermes signer key id。
- ProductOnDepot read-back digest/observedAt。
- attestation issuer/key id、generatedAt、expiresAt、evidenceRef。

`opsi-control` 使用配置的 allowlisted Ed25519 public keys 验签。未知 key、撤销 key、过期、payload tamper、ProductOnDepot drift 或 envelope mismatch 均 fail closed，并 quarantine Artifact；critical mismatch 同时 global freeze。

### 5.5 Production Re-entry Gate

Gate chain：

1. `v1.4-win10-clean-endpoint = proven/GO`。
2. `accelerated-v1.4` policy digest 完全匹配，3～5 台 Windows 10 Pilot 为 `proven/GO`。
3. Pilot target/batch/campaign rollback drill 100%，最终 unknown/secret leak/owner conflict/false success 为 0。
4. Artifact exact digest 由 pilot 提升 stable，Security Owner + Release Owner 批准。
5. 所有目标 Depot Attestation v2 有效，Inventory/mapping fresh。
6. Release Owner、Endpoint Ops、Security Owner 对同一 Gate input digest 签署。

服务可计算 `READY_FOR_OPERATOR_SIGNOFF`，但不得自行写 GO。正式 Gate import 必须验签并记录 signer、decision、input digest、evidence refs、expiry/revoke 状态和 audit event。

## 6. Controlled Production Profile

新增 immutable policy `controlled-reentry-v1.5`：

```text
targetCount             21..50
depotCount              1..2
ring0PerDepot           1（可显式批准为 2）
ring0GlobalMax          4
ringCumulative          10%, 25%, 50%, 100%
ringObservationHours    24, 12, 12, 24
finalObservationDays    7
maxInFlightGlobal       5
maxInFlightCampaign     3
maxInFlightDepot        2
```

- Campaign 保存 profile revision/digest；任何字段变化使审批失效并创建新 revision。
- 旧 v1.3 production policy 显式标为 `engineering-v1.3`，不能满足 v1.5 Live Gate。
- 维护窗口结束后不派发新 mutation，但继续 reconcile、status refresh、freeze 和 rollback。
- active freeze、mapping drift、attestation drift 或 stale Inventory 在 claim 与 dispatch 两处检查。

## 7. API、契约与持久化

### 7.1 API

新增/调整：

```text
POST /api/v1/opsi/live-gates/import
GET  /api/v1/opsi/live-gates/{gate_id}
POST /api/v1/opsi/live-gates/{gate_id}/revoke
POST /api/v1/opsi/depot-attestations             v2 canonical signature
POST /api/v1/opsi/rollouts                       增加 productionPolicyRevision
GET  /api/v1/opsi/rollouts/{id}/verifications
POST /api/v1/opsi/rollouts/{id}/rings/{ring}/approve
GET  /api/v1/opsi/rollouts/{id}/evidence          Evidence Manifest v3
```

- mutation 继续要求 Idempotency-Key、If-Match、reason/change ticket 和 RBAC。
- Gate import/revoke、stable promotion、Production start/next Ring 分别绑定最新 revision，旧审批不可复用。
- OpenAPI/Pydantic 为 SOT，`opsiControlApi` 升级为 `1.5.0`。

### 7.2 Contracts

- `target-verification.schema.json` → `smc.opsi.target-verification.v1`。
- `depot-artifact-attestation.schema.json` → `smc.opsi.depot-artifact-attestation.v2`。
- `evidence-manifest.schema.json` tolerant-reader 支持 v1/v2，新 producer 输出 `smc.opsi.evidence-manifest.v3`。
- `rollout-campaign.schema.json` 增加 `productionPolicyRevision/productionPolicyDigest`。
- `rollout-gate.schema.json` 增加 `gate-v1.5.0` 和 evidence/source digest，不允许普通请求 body 设置 operator verification。

### 7.3 Persistence

新增 migration（建议 `0006_v15_production_reentry`）：

- `opsi_target_verifications`：Action/Result/Inventory/Work refs、kind、decision、digest、observedAt。
- `opsi_ring_observations`：start/end、gate input/output、health counters、revision。
- `opsi_live_gates` 扩展 signer key、signature、input digest、expiry/revoke、evidence manifest ref。
- Depot Attestation v2 fields 与 unique `(depot, artifact, manifest, key)`。
- Campaign production profile revision/digest；Batch 兼容 projection revision。

Migration 必须验证 v1.3/v1.4 历史 Campaign 只读兼容、upgrade/downgrade/upgrade 和 API/Worker rolling restart。

## 8. Evidence、Observability 与安全

Evidence Manifest v3 至少包含：

- v1.4 Windows 10 Clean Evidence ref/digest。
- accelerated Pilot policy、Target Verification、rollback 和 24h summary。
- production profile、mapping、Artifact envelope/Depot attestation digests。
- 每 Ring membership、approval、verification、observation 和 gate decision。
- freeze/recovery、rollback、OPSI/DB/Worker outage timeline。
- 7-Day availability、Work reconnect、unknown/critical counters。
- canonical SHA-256、redaction、producer verification=`implemented|verified`。

安全规则：

- raw client id/account/SID 仅在受 RBAC 的详情中出现；metrics 保持低基数。
- Gate/Attestation public key 与撤销列表由 Secret/Config Provider 管理，不从请求 body 信任。
- signature、digest、Result 相关性不可互相替代；Evidence 明确 source trust level。
- Cursor、CI、fixtures、migration 不得生成 Operator `proven/GO`。

## 9. 验收标准

### AC-01 No Rollout Facts

Production 装配和 RolloutService 不存在 facts 成功路径。真实 Action Result + Product read-back + Inventory + Work evidence 才能将 Target 标为 HEALTHY；缺任一项为 UNKNOWN_BLOCKED。

### AC-02 Continuation Correlation

setup/update 的 continuation parent Result 在 API/Worker/Endpoint restart、重复/乱序 relay 后仍只收敛同一 Rollout Target 一次；wrong client/request/digest fail closed。

### AC-03 Observation Clock

Ring observation 从最后一个 Target HEALTHY 开始；重启不跳时钟。前一 Ring 未 PASSED、观察未到期或 gate 非 PASS 时 next Ring 返回 412。

### AC-04 Cryptographic Depot Attestation

valid Ed25519 attestation 通过；signature/payload/key/envelope/ProductOnDepot 任一篡改或过期均失败、quarantine，critical conflict 触发 freeze。

### AC-05 Production Gate Import

缺 v1.4 Win10/Pilot/operator signature、input digest 不一致、过期或撤销时 Production start/stable/next Ring 全部 fail closed。test seed 在 production 仍被禁止。

### AC-06 Rollback Verification

target/depot/ring/campaign rollback 只有 authoritative verification 完整时为 ROLLED_BACK；DB/OPSI offline 保持 UNKNOWN_BLOCKED；failure 自动 freeze。

### AC-07 Restart and Freeze Recovery

在 dispatch、continuation、verify、observe、rollback 各 crash point 重启 API/Worker/PostgreSQL connection，15 分钟内幂等恢复或明确 blocked；不重复 mutation。

### AC-08 Windows 10 Accelerated Pilot（人工）

3～5 台 Windows 10 按 2/4h、≤3/1h、final 24h 执行，包含 target/batch/campaign rollback；critical/unknown 为 0，Operator 签署 Pilot `proven/GO`。

### AC-09 Controlled Production Re-entry（人工）

21～50 台 Windows 10、1～2 Depot 完成 Ring 0/10/25/50/100、Depot/freeze/rollback drill 和 7-Day Observation；最终 unknown、owner conflict、artifact conflict、false success、secret leak、rollback failure 均为 0。

### AC-10 Scope Enforcement

Live profile 拒绝 >50 Endpoint 或 >2 Depot；500/8 只作为工程 load test，不得生成 v1.5 Live GO。Evidence 记录本次用例均为 Windows 10，但实现不得新增 Windows 11 拒绝分支或宣称 Windows 11 已被单独认证。

## 10. 自动化与人工门禁

自动化必须覆盖：

```text
opsi-control pytest / ruff / format
PostgreSQL migration upgrade-downgrade-upgrade
Action→Rollout integration and restart tests
Depot Attestation Ed25519 vectors
21/50 Windows 10 target deterministic ring tests
500/8 engineering load/regression tests
infra/opsi pytest + Pester
contracts:check + OPSI isolation
Work typecheck/test/build（Direct Hermes regression only）
```

Windows gate 必须固定 Pester 版本和调用方式，并同时运行 Windows 10 PowerShell 5.1 与 CI pwsh；当前 `Should Throw` runner false negative 必须先关闭。

人工门禁顺序：

1. v1.4 Windows 10 Clean Endpoint。
2. v1.5 Windows 10 Accelerated Pilot / 24h。
3. Controlled Production Ring 0～4。
4. rollback/freeze/recovery drill。
5. 7-Day Observation 与 Operator Go/No-Go。

工程 PR 可以在前序人工门禁未通过时合并，但对应 mutation 必须保持 frozen。Cursor 不得自动完成任何人工 Phase。

## 11. 发布阶段

```text
Phase 0  Truth Freeze + ADR-034 + Red Tests
Phase 1  Action/Result → TargetVerification Bridge
Phase 2  Authoritative Rollout/Rollback/Compliance Reconciliation
Phase 3  Single Ring State Machine + Observation Clock
Phase 4  Depot Attestation v2 + Stable Artifact Revalidation
Phase 5  Signed Production Re-entry Gate + Evidence Manifest v3
Phase 6  controlled-reentry-v1.5 Policy + API 1.5/Migration
Phase 7  Restart/Freeze/Load/Security/Contract Regression
Phase 8  Windows 10 Accelerated Pilot（人工）
Phase 9  21～50 / 1～2 Depot Production Re-entry + 7-Day（人工）
```

## 12. Definition of Done

- [ ] v1.4 人工验证矩阵只要求 1 台 Windows 10，Windows 11 不作为门禁。
- [ ] `v1.4-win10-clean-endpoint` 由 Operator 签为 `proven/GO`。
- [ ] Rollout reconcile/rollback/compliance 不再读取 `self.facts`。
- [ ] TargetVerification 绑定 Action Result、Product read-back、Inventory 和 Work Evidence，支持 continuation/restart/replay。
- [ ] Ring observation 从 HEALTHY 后开始，next Ring 严格检查 predecessor/gate/deadline/freshness/approval。
- [ ] Depot Attestation v2 执行 Ed25519 验签并绑定 envelope v2 + ProductOnDepot read-back。
- [ ] `v1.5-production-reentry` Gate 可受信导入/撤销，不能由 body/env/fixture 绕过。
- [ ] `controlled-reentry-v1.5` 强制 21～50、1～2 Depot 与 frozen policy digest；人工验证矩阵只使用 Windows 10，不新增 Windows 11 拒绝逻辑。
- [ ] Evidence Manifest v3 可从持久化事件与 verification 复算；Cursor/CI 仅输出 implemented/verified。
- [ ] PostgreSQL migration、restart/crash、freeze/rollback、contracts/isolation/Work regression 全部通过。
- [ ] 3～5 Windows 10 Accelerated Pilot / 24h 由 Operator 签为 `proven/GO`。
- [ ] 21～50 Windows 10 / 1～2 Depot Rings + rollback/freeze + 7-Day Evidence 由 Operator签核。
- [ ] 未完成 Operator GO 时 stable promotion、Production start 和 Ring advancement 继续 fail closed。
- [ ] v1.6 只在 v1.5 GO 后评估 51～500 / 3～8 Depot Scale Expansion；不自动包含 HA/DR。
