---
name: OPSI v1.3 Production Rings + Multi-Depot Awareness
overview: 在 v1.2 真实 Pilot、三层回滚和 1-Day Observation 获得 Production GO 后，将 OPSI Endpoint Control Plane 扩展到单 Config Server、21～500 台、最多 8 Depot 的受控生产分环发布；先关闭默认事实、即时回滚成功、内存 Evidence 和全局 lease 等生产 blocker，再建设 stable promotion、Depot attestation、Ring scheduler、rate budget、circuit breaker、global freeze、fleet compliance 与 14-Day Production Evidence。
todos:
  - id: opsi-v13-phase0-production-gate
    content: "Phase 0（人工前置）: 完成 v1.2 3～5 台 Live Pilot（Canary 4h + 批次 1h）、target/batch/campaign rollback、1-Day Observation 与 v1.3 Production Go/No-Go；未 proven/GO 时禁止 production mutation，Cursor 不得自动标记完成"
    status: pending
  - id: opsi-v13-phase1-correctness
    content: "Phase 1: 移除默认 OS/owner/baseline/health 与 hard-coded User Binding，建立 authoritative inventory/result/read-back/health reconciliation、持久化 observation/metrics/evidence，并修复 rollback enqueue 即成功"
    status: completed
  - id: opsi-v13-phase2-contract-scale
    content: "Phase 2: 新增 ADR-032，将 opsiControlApi 提升至 1.3.0，增加 production mode、Depot/Ring/Attestation/Freeze/Compliance 契约、migration、per-campaign/depot lease、索引和 cursor pagination"
    status: completed
  - id: opsi-v13-phase3-depot-stable
    content: "Phase 3: 实现 immutable client→depot mapping、每 Depot exact Product/package + signed Artifact Attestation、pilot→stable 三方审批和 digest/signer quarantine"
    status: completed
  - id: opsi-v13-phase4-ring-scheduler
    content: "Phase 4: 实现 Ring 0/10%/25%/50%/100% deterministic cohort、Depot timezone/maintenance window、global/campaign/depot rate budget、公平调度和 OPSI/DB backpressure"
    status: completed
  - id: opsi-v13-phase5-freeze-rollback
    content: "Phase 5: 实现 Depot circuit breaker、global release freeze/dual-approved clear、claim-dispatch fencing，以及 target/depot/ring/campaign authoritative rollback"
    status: completed
  - id: opsi-v13-phase6-compliance-evidence
    content: "Phase 6: 实现 read-only fleet compliance/drift、Evidence Manifest v2、append-only audit/outbox、低基数 metrics、RBAC/SoD、Secret canary 和 multi-replica deterministic evidence"
    status: completed
  - id: opsi-v13-phase7-load-release
    content: "Phase 7: 完成 500 Endpoint/8 Depot load、lease/freeze race、OPSI/DB outage/retry storm、migration、Product/Control/Contracts/Work regression、Salt/Runtime isolation 和生产 Runbook/Evidence 模板"
    status: completed
  - id: opsi-v13-phase8-live-production
    content: "Phase 8（人工门禁）: 在真实 OPSI 4.3 执行 21～500 台全部 Production Rings、Depot/Ring/Campaign rollback drill 和 14-Day Observation，归档 v1.4 Fleet GA + HA/DR Go/No-Go；Cursor 不得自动标记完成"
    status: pending
isProject: false
---

# Cursor Implementation Plan — OPSI v1.3

## 1. 执行依据

- PRD：[`docs/opsi/PRD-OPSI-v1.3.md`](../../docs/opsi/PRD-OPSI-v1.3.md)
- v1.2 PRD：[`docs/opsi/PRD-OPSI-v1.2.md`](../../docs/opsi/PRD-OPSI-v1.2.md)
- v1.2 Evidence：[`docs/opsi/evidence/v1.2/STATUS.md`](../../docs/opsi/evidence/v1.2/STATUS.md)
- Provider ADR：[`docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md`](../../docs/adr/ADR-031-opsi-parallel-endpoint-control-plane.md)
- Contract Flow：[`docs/architecture/contract-flow.md`](../../docs/architecture/contract-flow.md)
- Worker Decision：[`docs/opsi/decisions/worker-runtime.md`](../../docs/opsi/decisions/worker-runtime.md)
- 基线分支：`opsi/prd-v1.0`
- 规划基线：`ed8ad69`

开始实现前读取：

- [`AGENTS.md`](../../AGENTS.md)
- [`apps/work/AGENTS.md`](../../apps/work/AGENTS.md)（仅回归，不新增 OPSI feature）
- [`contracts/opsi`](../../contracts/opsi)
- [`docs/opsi/decisions/action-result-transport.md`](../../docs/opsi/decisions/action-result-transport.md)
- [`docs/opsi/decisions/machine-user-bootstrap.md`](../../docs/opsi/decisions/machine-user-bootstrap.md)

实现分支建议：`opsi/prd-v1.3`。

固定禁止项：

- 不修改 `infra/salt/**`、`services/salt-control/**`、`contracts/salt-control-api/**`。
- 不向 `services/runtime/**`、`contracts/runtime-api/**` 增加 OPSI 能力。
- Work 不增加 Rollout/Fleet UI、OPSI RPC、credentials 或 `window.opsiApi`。
- `opsi-control` 不直连 Endpoint/Gateway/Work，不增加 SSH/SMB/WinRM/Depot file copy。
- 不支持超过 500 台、超过 8 Depot、多 Config Server、OPSI HA/DR 或 Provider migration。

## 2. 基线真值

自动化已复核：

```text
opsi-control pytest    48 passed / 1 skipped
opsi-control ruff      passed
contracts:check        passed
v1.2 Engineering       implemented
v1.2 Live Pilot        not_proven
Production Decision    NO-GO
```

当前实现中以下行为必须在生产路径启用前关闭：

- `domain/preflight.py` 对 owner、recently-seen、disk、Gateway、rollback baseline 等使用安全性不足的缺省值，User Binding 检查存在 unconditional true。
- `services/rollout.py` 在 dispatch/rollback 中存在 hard-coded SID/account fallback。
- Product readiness 未按实际 client→depot mapping 验证。
- rollback enqueue 后直接写 `ROLLED_BACK`，Target/Batch observation 未完整消费 Action reconciliation。
- `metric_counts` 在内存中，Evidence/metrics 重启不稳定。
- `claim_orchestrator` 使用全局 `rollout-orchestrator` lease，Worker 扫描所有 Campaign。

Phase 1 是 production release blocker；不能仅扩大 `max_length=5` 后宣称支持生产。

## 3. Phase 0 — v1.2 Production Gate（人工）

必须归档：

1. v1.1 Windows 10/11 + 24h Live Gate `proven`。
2. v1.2 3～5 台 Canary 4h / 批次 1h Pilot `proven`。
3. target/batch/campaign rollback drill 全部成功。
4. 1-Day Observation、Security/Release Signoff 完成。
5. `v1.3 Production Go/No-Go = GO`，含签名 Evidence digest。

Production start/stable promotion 从持久化 signed Gate record 读取，不接受 API body、environment variable 或普通 feature flag 自报 GO。测试 seed 在 `SMC_OPSI_ENV=production` 必须不可调用。

完成标准：Operator Evidence 已签署；Cursor 不得代签或自动完成。

## 4. Phase 1 — Production Correctness Closure

### 4.1 Authoritative Inventory

- 新建 typed `EndpointInventorySnapshot` adapter，输入只能来自允许的 OPSI RPC、签名 Product Result 和受控 Operator Evidence。
- 移除 `facts.get(..., default)` 对 owner、OS、lastSeen、disk、Gateway、previous Artifact/config 的 production fallback。
- User Binding 必须提供真实 SID/account/source/observedAt；缺失直接 INELIGIBLE。
- previous Product/package/artifact/config 必须存在于 rollback manifest 和目标 Depot；禁止构造默认 digest/version。
- 将 FakeOpsiJsonRpc/fixtures 与 production dependency wiring 分离并增加启动断言。

### 4.2 Authoritative Lifecycle

- Rollout Worker 只 enqueue Action；不在同一 tick 强制调用 dispatcher。
- Target 状态由 Action Result/Reconciler 事件推进 `DISPATCHED→APPLYING→VERIFYING→HEALTHY/FAILED`。
- Batch `OBSERVING→PASSED` 使用持久化 deadline、全部 target outcome 和 Gate Evaluation。
- rollback 先进入 `ROLLBACK_QUEUED/APPLYING/VERIFYING`，Result/read-back/Gateway/Work evidence 完成后才写 `ROLLED_BACK`。
- late/duplicate/unknown Result 通过 request id + aggregate version 幂等收敛。

### 4.3 Durable Evidence

- 删除 rollout 进程内 `metric_counts` 作为 Evidence SOT。
- 从 persisted events/actions/targets/gates 聚合 metrics 和 manifest；相同 event set 得到相同 digest。
- observation deadline、failure counters、pause cause 和 reconciliation deadline 全部持久化。
- 增加 API/Worker restart、multi-replica 和 DB transaction crash tests。

## 5. Phase 2 — ADR、Contract 与 Scale Persistence

### 5.1 ADR-032

新增 [`docs/adr/ADR-032-opsi-production-rings-multi-depot.md`](../../docs/adr/ADR-032-opsi-production-rings-multi-depot.md)，冻结：

- 单 Config Server、21～500 Endpoint、1～8 Depot。
- `opsi-control` 只验证 OPSI-native distribution，不执行 Depot file copy。
- Ring/depot lane/rate budget/global freeze 模型。
- v1.2 Gate 和 stable/attestation 的信任链。
- Work/Salt/Runtime 隔离边界。

### 5.2 API/Schema

- `RolloutCreateRequest` 增加 `mode=pilot|production`，缺省为 `pilot`。
- conditional validation：pilot 3～5；production 21～500。
- 新增 Depot/Ring/Attestation/Freeze/Compliance models 和 Evidence Manifest v2。
- rollback scope 增加 `depot|ring`；production approval 增加 Security/Site Owner。
- 生成 OpenAPI/JSON Schema，`opsiControlApi` 提升到 `1.3.0`。
- v1.2 payload/response contract fixtures 保持兼容；新增 enum 使用 tolerant-reader tests。

### 5.3 Database/Leases

- migration 增加 production policy、rollout depots/rings/ring targets、attestations、freezes、compliance snapshots。
- lease key 改为 campaign/depot bounded claims，带 owner/expiry/heartbeat/fencing token。
- Target/Action/Result/Event 增加 campaign/depot/ring/status/updatedAt 索引。
- list API 使用 cursor pagination；Worker 使用 bounded query/`SKIP LOCKED` 等价方式，不全量加载。
- 执行 v1.2→v1.3 upgrade、允许范围内 downgrade、restart 和历史 Pilot 只读兼容。

## 6. Phase 3 — Depot Mapping、Attestation 与 Stable

### 6.1 Mapping Snapshot

- 通过 OPSI authoritative client-to-depot mapping 生成 canonical snapshot。
- 保存 client/depot lists、mapping digest、observedAt 和 source RPC evidence。
- 运行期间 mapping drift 暂停受影响 Depot lane；重新绑定必须创建 revision、preflight 和审批。
- 同一 Target 不允许跨 Depot 重复或无 Depot。

### 6.2 Depot Artifact Attestation

- 定义签名 attestation schema：depot、Product/package、artifact digest、issuer、generated/expiry、signature、evidence ref。
- 同时读取 ProductOnDepot exact version/package；版本或 attestation 任一不符均 fail closed。
- attestation issuer allowlist、撤销、过期和 replay tests。
- OPSI-native distribution/import 由 Operator/外部受信 pipeline 完成，Control 不实现复制命令。

### 6.3 Stable Promotion

- 开放 `pilot→stable`，要求 v1.2 proven evidence、相同 digest、Release+Security 审批。
- promotion/approval 绑定 revision，signer/attestation revoke 自动 quarantine。
- quarantine 事务性写 global freeze，并 fencing 所有引用 digest 的 production dispatch。

## 7. Phase 4 — Ring Scheduler、Windows 与 Rate Budget

### 7.1 Deterministic Rings

- Ring 0 每 Depot 1～2 台、全局 ≤25 且覆盖全部 Depot。
- 后续 cumulative 10%/25%/50%/100%，使用 canonical mapping + versioned selector。
- 同一 snapshot/policy 多次计算 digest 一致；禁止运行时重排/删除失败 Target。
- Ring observation：24h / 12h / 12h / 24h / final 14 days。

### 7.2 Scheduler

- Depot lane weighted fair scheduling，避免大 Depot 饿死小 Depot。
- global/Campaign/Depot `max_in_flight`、requests/minute、retry budget 取最严格值。
- OPSI 429/503/latency、DB pool/outbox lag 触发 exponential backoff + jitter/circuit breaker。
- maintenance window 按 IANA timezone 输入、UTC 冻结；覆盖 DST、跨午夜、窗口结束 race。
- Ring progression 需要所有 lane passed、observation deadline、fresh readiness 和三方审批。

### 7.3 Scale Tests

- deterministic 500 Endpoint/8 Depot fixtures。
- 查询数、内存、event volume、pagination、lease contention 和 dispatcher throughput 基线。
- 禁止通过缩短 observation 或跳过 reconciliation 通过 load test。

## 8. Phase 5 — Circuit Breaker、Freeze 与 Rollback

### 8.1 Gate/Circuit Breaker

- Ring 0 任一失败全局暂停。
- Ring 1～4 普通失败先暂停 Depot lane；连续 2 次、10 min 3 次、>2% 或 unknown deadline 超时升级 Campaign pause。
- critical cause（secret/owner/signature/false success/rollback failure/P0/P1）直接 global freeze。
- Gate Evaluation 保存 canonical input digest、policy version、decision 和原因。

### 8.2 Global Freeze

- 新 mutation 在 claim 和 dispatch 两处校验 freeze revision。
- freeze 可由 Incident Commander/Security/Release/Endpoint Ops 单人触发。
- clear 要求 root cause closed、fresh preflight、Release Owner + Endpoint Ops 双人审批。
- freeze 时 reconcile、health 和已批准 rollback 继续；Work/Gateway 不被停止。

### 8.3 Authoritative Rollback

- scope：target、depot、ring、campaign。
- campaign 按 Ring 逆序，Ring 内按 Depot rate budget。
- frozen exact baseline + current Depot attestation 必须可用。
- Action Result、ProductOnClient read-back、Gateway probe、Work smoke 齐全才终结。
- rollback failure 写 terminal Gate + global freeze；禁止继续 stable/GO。

## 9. Phase 6 — Compliance、Evidence v2 与 Security

### 9.1 Fleet Compliance

- 生成 desired/observed Product/package/artifact/config/owner/depot/health snapshot。
- 状态：`COMPLIANT|DRIFTED|UNKNOWN|EXEMPT`，含 observedAt/source/digest。
- drift 检测只读；修复必须新建 reconcile Campaign 并审批。
- owner/artifact drift 触发 critical alert/freeze；offline/stale 单独分类。

### 9.2 Evidence v2

- canonical manifest 覆盖 Depot/Ring、attestation、approval、freeze、gate、rollback、14-Day summary。
- append-only event/outbox 原子写入；replay 可重算同一 digest。
- `implemented|verified|proven` 分离；只有 Operator 可签 `proven`。
- 默认脱敏；无 prompt/conversation/memory/username/secret。

### 9.3 Security/Observability

- RBAC/SoD 覆盖 stable、production start、Ring progress、Depot resume、rollback expand、freeze clear。
- Secret/JWKS/signer/attestation readiness fail closed。
- 低基数 metrics：Campaign/Depot/Ring/Target state、queue/lease/outbox lag、RPC/backoff、freeze/gate/rollback。
- raw client/depot detail 只在受限 cursor API/Audit 中返回。

## 10. Phase 7 — Automated Release Gates 与 Runbook

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

Contracts / isolation：

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

额外 gates：

- 500 Endpoint/8 Depot load + pagination/query budget。
- multi-worker lease/fencing/freeze race。
- OPSI 429/503/timeout、DB outage、retry storm、outbox replay。
- authoritative rollback crash/restart/late/duplicate Result。
- v1.2 API compatibility 和历史 Pilot migration。

新增 v1.3 nomination、Depot attestation、stable promotion、Ring operation、freeze/clear、rollback、incident 和 14-Day Observation Runbook/Evidence 模板。

## 11. Phase 8 — Live Production（人工）

1. 归档 v1.2 Production GO。
2. 选择 21～500 台、1～8 Depot，冻结 client→depot/ring digest。
3. 完成 OPSI-native Package distribution 和每 Depot signed attestation。
4. stable promotion、三方/Site approval。
5. 执行 Ring 0、10%、25%、50%、100%，满足各观察窗口。
6. 演练 Depot circuit breaker、global freeze/clear、mapping drift。
7. 分别执行 target、depot、ring、campaign rollback drill。
8. 注入 OPSI/Control/DB outage，验证 Gateway/Work continuity 与恢复收敛。
9. 完成 14-Day Observation，归档 v1.4 Fleet GA + HA/DR Go/No-Go。

硬性 NO-GO：

- v1.2 Gate 非 `proven / GO`。
- fabricated/default inventory、binding 或 rollback baseline 进入生产。
- secret leak、owner conflict、false success、最终 unknown 非 0。
- 任一 rollback drill/attestation/freeze fencing 失败。
- 用户数据损失、未关闭 P0/P1、健康 Gateway/Work 因 Control outage 停止。
- 删除失败 Target、改变 snapshot/ring 或覆盖历史 Evidence 达成指标。

## 12. PR 拆分

1. `fix(opsi-control): close rollout authoritative state blockers`
2. `feat(opsi-control): add v1.3 production contracts and scale persistence`
3. `feat(opsi-control): add depot mapping attestation and stable promotion`
4. `feat(opsi-control): add deterministic production ring scheduler`
5. `feat(opsi-control): add rate budgets circuit breakers and global freeze`
6. `feat(opsi-control): add authoritative multi-scope rollback`
7. `feat(opsi-control): add fleet compliance and evidence v2`
8. `test(opsi): add 500 endpoint multi-depot load and chaos gates`
9. `docs(opsi): add production runbooks and evidence templates`
10. `test(opsi): archive production rings and 14-day evidence`（Operator Evidence PR）

Contract/Migration 先于 producer/consumer；correctness blocker PR 先于 scale feature。功能 PR 不混入 Live `proven` Evidence。

## 13. Definition of Done

- [ ] v1.2 Live Pilot/rollback/1-Day Evidence 已由 Operator 签为 `proven / GO`。
- [ ] Phase 1 authoritative inventory/lifecycle/evidence blocker 全部关闭。
- [ ] ADR-032、API 1.3.0、OpenAPI/Schema、migration/compatibility 通过。
- [ ] 21～500 Endpoint、1～8 Depot deterministic mapping/rings 通过。
- [ ] stable promotion/Depot attestation/quarantine 信任链通过。
- [ ] timezone、fair scheduling、三层 rate budget/backpressure 通过。
- [ ] circuit breaker/global freeze-clear/fencing race 通过。
- [ ] target/depot/ring/campaign authoritative rollback 通过。
- [ ] compliance read-only，Evidence v2 restart/replica replay digest 一致。
- [ ] load/chaos/contracts/Product/Control/Work/isolation gates 全部通过。
- [ ] 14-Day Production Evidence 已由 Operator 签为 `proven`。
- [ ] v1.4 Fleet GA + HA/DR Go/No-Go 已归档；未 GO 不扩大版本边界。

