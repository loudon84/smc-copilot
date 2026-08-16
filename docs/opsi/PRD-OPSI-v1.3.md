# SMC Copilot OPSI Endpoint Control Plane v1.3 PRD

**Controlled Production Rings + Multi-Depot Awareness**

- 基线分支：`opsi/prd-v1.0`
- 规划基线：`ed8ad69`（OPSI v1.2 engineering implementation）
- 目标 API：`opsiControlApi 1.3.0`
- 状态：Planning；v1.2 Production Go/No-Go 未获 `proven / GO` 前禁止生产 mutation

## 1. 文档定位

v1.2 已实现 10～20 台 Pilot 的 immutable snapshot、preflight、双人审批、Canary/Batch、暂停、三层回滚和 Evidence 工程骨架，自动化基线为 48 passed / 1 skipped，Contract drift 已通过。

当前真实状态仍是：

```text
v1.2 Engineering       implemented
v1.2 Live verification not_proven
v1.3 Production Gate   NO-GO
```

v1.3 的目标是在 v1.2 Live Pilot 与 7-Day Observation 获得 Operator `proven / GO` 后，将同一 OPSI Provider 扩展到受控生产分环发布。v1.3 可先完成工程实现和非生产测试，但不能借助 feature flag、测试 fixture 或 API body 绕过 Production Gate。

```text
v1.2 Pilot proven / Production GO
             ↓
Production Correctness Closure
             ↓
Stable Artifact + Depot Attestation
             ↓
Immutable Client → Depot Snapshot
             ↓
Ring 0 → 10% → 25% → 50% → 100%
             ↓
Per-Depot Circuit Breaker / Global Freeze
             ↓
14-Day Production Observation
             ↓
v1.4 Fleet GA + HA/DR Go / No-Go
```

## 2. v1.2 生产化阻塞项

v1.2 的 Pilot 实现不能原样放大到生产。v1.3 必须先关闭：

- Preflight 仍允许缺省 OS/owner/last-seen/disk/Gateway 等事实，并可能构造默认 rollback baseline。
- User Binding 可使用 hard-coded SID/account fallback；生产必须 authoritative 且 fail closed。
- Product readiness 只验证“任一 Depot 存在版本”，没有验证每个 Target 的实际 Depot。
- Rollback 在 Action 创建后即标记成功，没有等待 Result reconciliation、Product read-back、Gateway/Work verify。
- Target 从 `DISPATCHED` 到 `HEALTHY`、Batch observation 到 `PASSED` 的生产闭环不完整。
- rollout metrics 依赖进程内计数，重启后 Evidence 不可稳定复算。
- Orchestrator 使用单个全局 lease 并扫描全量 Campaign，不适合多 Campaign/多 Depot 扩展。
- Pilot 固定 20 台、单一批次模型，不含 Depot lane、时区、backpressure、rate budget 和 fleet drift。

这些项属于 v1.3 Phase 1 的 release blockers，不是可延期的优化。

## 3. 产品目标

v1.3 必须完成：

- 支持单一 OPSI Config Server 下，21～500 台 Endpoint、最多 8 个 Depot 的受控生产 Campaign。
- 冻结 client→depot mapping、目标/回滚 Artifact、Config、Ring Policy、维护窗口和 Gate Policy digest。
- 只允许引用 v1.2 proven evidence 的 Artifact 从 `pilot` 提升到 `stable`。
- 在每个目标 Depot 验证 exact Product/package 与可信 Depot Artifact Attestation。
- 按 Depot 分层并以 Ring 0、10%、25%、50%、100% 渐进发布。
- 实现全局、Campaign、Depot 三层并发/rate budget，以及 OPSI/DB backpressure。
- 实现 Depot lane pause/resume、全局 release freeze、artifact quarantine 和 circuit breaker。
- 所有 install/config/rollback 仅在 authoritative Result + read-back + Gateway/Work evidence 后终结。
- 提供 fleet compliance/drift snapshot，并通过显式 Campaign 修复，不做静默自动 mutation。
- 通过 14-Day Production Observation 形成 v1.4 Fleet GA + HA/DR Go/No-Go。

## 4. 非目标

v1.3 不建设：

```text
超过 500 台 Endpoint 或超过 8 个 Depot
多个 OPSI Config Server / Multi-tenant SaaS
OPSI Server HA、DR 编排或自动故障切换
由 opsi-control 执行 Depot 包复制、SSH、SMB 或文件分发
Salt ↔ OPSI、Runtime ↔ OPSI 自动迁移或跨 Provider 回滚
无人审批的生产发布或自愈 mutation
完整 Diagnostic Bundle 中央上传/下载
实时日志 Streaming
AI/LLM RCA 或自动发布决策
Work OPSI Rollout/Fleet UI
Renderer OPSI Credentials / RPC Client
```

OPSI Package 的 Depot 分发继续由 OPSI-native 工具和 Operator 完成；`opsi-control` 只通过受允许的 TLS JSON-RPC 读取 Product/Client 状态，并校验独立签名的 Depot Attestation。

## 5. 架构冻结

1. Salt 仍是默认 Endpoint Control Plane SOT；OPSI 是独立平行 Provider。
2. v1.3 只管理已经确认 `hermes=opsi` 的 Endpoint，不迁移 owner。
3. Work 始终 Direct Hermes `localhost:8642`，不调用 `opsi-control`。
4. `services/opsi-control` 不直连 Endpoint、Gateway 或 Work，不新增 SSH/SMB/WinRM side channel。
5. Runtime Endpoint API 保持冻结，Salt/Runtime contract 和实现路径不得出现 OPSI diff。
6. OPSI/Control 离线不得停止健康 Gateway 或 Work Chat。
7. Production start、Ring progression、exception、扩大 rollback 和 freeze clear 都是人工审批动作。

v1.3 实现前新增 `ADR-032`，记录 Production Ring、Multi-Depot Attestation、rate budget、freeze 和不接管 Depot distribution 的决策。

## 6. 支持范围与角色

### 6.1 支持档位

- 每个 Production Campaign：21～500 个 canonical client id。
- 每个 Campaign：1～8 个目标 Depot；单 OPSI Config Server。
- 每个 Endpoint：一个 frozen Depot mapping；运行时 mapping 改变则暂停该 Target/Depot lane。
- 可并行存在多个 Campaign，但同一 Endpoint 只能属于一个 active mutation Campaign。
- 生产容量必须通过 500 Endpoint / 8 Depot 的 deterministic load test，不用缩短观察时间达成。

### 6.2 角色

- `Release Owner`：定义 release、rings、变更单和最终结论。
- `Endpoint Ops`：确认 client/depot mapping、维护窗口、Depot readiness 和 rollback。
- `Security Owner`：审核 stable promotion、signer、attestation、redaction 和 quarantine。
- `Site/Depot Owner`：批准特定 Depot lane 的维护窗口与恢复。
- `Incident Commander`：可单人触发 emergency freeze；无权单人清除 freeze。

Production start 需要 Release Owner、Endpoint Ops、Security Owner 三方审批；Depot lane start 还需要对应 Site/Depot Owner。Emergency freeze 可单人触发，clear 至少需要 Incident Commander 以外的 Release Owner + Endpoint Ops 双人审批。

## 7. 核心模型与状态

### 7.1 Production Campaign

沿用 v1.2 Campaign 状态，新增 `mode=production`，避免复制第二套编排服务：

```text
DRAFT → PREFLIGHTING → AWAITING_APPROVAL → RUNNING ↔ PAUSED
                                      RUNNING → OBSERVING → SUCCEEDED
                          PAUSED/RUNNING → ROLLING_BACK → ABORTED | FAILED
```

规则：

- v1.2 payload 未提供 `mode` 时默认 `pilot`，保持兼容。
- `SUCCEEDED` 只允许所有目标最终为目标版本/config 且健康；存在 rollback/exclusion 时最终 Decision 必须为 `NO-GO`，通过 follow-up Campaign 收敛。
- Target、Depot mapping、Artifact、Config、Ring/Gate Policy 任一变化必须创建新 revision，并使旧审批失效。
- Production Gate、stable Artifact 和 Depot Attestation 都是 start 前置条件。

### 7.2 Depot Lane

每个目标 Depot 建立 lane：

```text
UNATTESTED → READY → RUNNING ↔ PAUSED → OBSERVING → PASSED
                       ↘ BLOCKED / ROLLING_BACK / FAILED
```

Depot lane 保存：

- depot id、client count、mapping digest。
- Product/package、artifact digest、attestation issuer/expiry。
- timezone、maintenance windows、concurrency/rate budget。
- OPSI RPC health、queue depth、failure/error budget。

单 Depot failure 默认先打开该 lane 的 circuit breaker；安全、Artifact、Owner、false success、global readiness 等 critical cause 触发整个 Campaign/global freeze。

### 7.3 Rings

- `Ring 0`：每个目标 Depot 至少 1 台；大型 Depot 2 台；全局最多 25 台，必须覆盖所有 Depot。
- `Ring 1`：累计达到 target snapshot 的 10%。
- `Ring 2`：累计达到 25%。
- `Ring 3`：累计达到 50%。
- `Ring 4`：达到 100%。

Ring membership 由 canonical client/depot snapshot + versioned cohort selector 确定，创建后不可重排。Ring 0 至少观察 24h；Ring 1/2 至少 12h；Ring 3 至少 24h；Ring 4 完成后进入 14-Day Observation。

## 8. 功能需求

### F1 — Production Correctness Closure

- 用 typed `EndpointInventorySnapshot` 替代 rollout service 内的缺省 facts。
- OS、last-seen、owner、Depot、User Binding、disk、Gateway、previous Artifact/config 缺失时 fail closed。
- 禁止 hard-coded SID/account、previous version/digest 和默认健康状态进入生产路径。
- Action 创建只代表 `QUEUED`；Target success/rollback success 必须等待 Result checksum、OPSI Product read-back、Gateway probe 和 Work Operator/Test Harness evidence。
- Observation 使用持久化 clock/deadline，Worker restart 不能跳过等待。
- metrics/evidence 从 DB event/target/action 聚合重算，不依赖进程内 counter。

### F2 — Multi-Depot Inventory 与 Attestation

- 从 OPSI authoritative inventory 获取每个 client 的实际 Depot mapping 和 ProductOnDepot/ProductOnClient 状态。
- 冻结 canonical `client_id → depot_id` mapping digest；mapping drift 自动暂停受影响 lane。
- 每个 Depot 必须同时满足 exact productVersion/packageVersion 和有效的 `DepotArtifactAttestation`。
- Attestation 包含 depot id、artifact digest、package identity、issuer、generated/expiry、signature 和 source evidence。
- `opsi-control` 不生成“已复制完成”的假证明；Attestation 由受信任 OPSI-native promotion/import pipeline 或 Operator signer 产生。

### F3 — Stable Promotion

允许 `pilot → stable`，但必须满足：

- v1.2 Pilot/7-Day Evidence 为 `proven / GO`。
- digest 与 Pilot 完全一致，signer 在 allowlist，未 quarantined。
- Release Owner + Security Owner 审批，Evidence/approval revision 绑定。
- 所有目标 Depot 在 production start 前完成 attestation。

同版本不同 digest、过期/撤销 signer 或 attestation mismatch 立即 quarantine 并触发 global freeze。v1.3 不自动从 `stable` 推广到其他客户/OPSI Config Server。

### F4 — Ring Scheduler 与维护窗口

- Ring 内按 Depot lane 公平调度，避免单一 Depot 占满 global budget。
- 支持 global、Campaign、Depot 三层 `max_in_flight`、requests/minute 和 retry budget，取最严格值。
- 维护窗口以 Depot timezone 保存，转换 UTC 后冻结；DST/跨午夜必须有测试。
- 窗口结束停止新 mutation，但继续 reconcile/health/rollback。
- 新 Ring 必须在前一 Ring 所有 lane passed、观察时间满足、三方审批有效后启动。
- Rollout Worker 只 enqueue Action，由 Action Dispatcher 独立限流派发；禁止在 Ring loop 内同步强制 dispatch。

### F5 — Gate、Circuit Breaker 与 Global Freeze

零容忍全局 Gate：

- secret leak、owner conflict、signature/digest conflict、false success、rollback failure。
- 未关闭 P0/P1、用户数据损失、健康 Gateway/Work 被 Control outage 中断。
- Production Gate/approval/attestation 被撤销或 Artifact quarantined。

Ring 0 任一 Target failure 暂停整个 Campaign。Ring 1～4 的普通 Endpoint failure 先暂停对应 Depot lane；连续 2 次失败、10 分钟内 3 次失败、失败率超过 2% 或 unknown 超过 reconciliation deadline 时暂停整个 Campaign。所有阈值均来自 versioned Gate Policy。

Global freeze：

- 阻止所有 Production Campaign 的新 mutation，不停止 reconcile、health 或 rollback。
- 触发必须立即生效且可单人执行；clear 要求 root cause closed、fresh preflight 和双人审批。
- Worker 必须在每次 claim 与 dispatch 前校验 freeze revision/fencing token。

### F6 — Rollback 与安全收敛

- 继续支持 target、ring/batch、campaign rollback；新增 depot lane scope。
- Campaign rollback 按 Ring 逆序、Ring 内按 Depot 受控并发执行。
- 回滚目标使用冻结的 exact Product/package/artifact/config/User Binding baseline。
- `ROLLED_BACK` 只有在 Action Result、OPSI read-back、Gateway/Work verify 全部通过后写入。
- OPSI/DB outage 期间不得猜测成功；进入 `UNKNOWN_BLOCKED` 等待 authoritative reconcile。
- rollback failure 自动 global freeze，并阻止 stable release 结论为 GO。

### F7 — Fleet Compliance 与 Drift

Campaign 完成后生成 read-only fleet snapshot：

- desired/observed Product、package、artifact/config revision、owner、Depot、Gateway health。
- `COMPLIANT / DRIFTED / UNKNOWN / EXEMPT`，包含 observed-at 和 evidence digest。
- drift 不直接触发 mutation；Operator 必须创建新的 signed reconcile Campaign。
- owner drift、artifact/signature drift 视为 critical；普通 offline/observation stale 单独报告。
- 列表和导出支持分页/游标，不加载全量 Campaign/Target 到单进程内存。

### F8 — Evidence、Audit 与 Observability

- Evidence 升级为 `smc.opsi.evidence-manifest.v2`，包含 Depot/Ring、freeze、exception、rollback 和 14-Day summary。
- 每个状态转换、approval、attestation、gate input/output、dispatch/reconcile 都进入 append-only event/outbox。
- Evidence SHA-256 从持久化 canonical payload 复算；进程重启、API replica 切换不改变结果。
- Gateway probe 由 Endpoint Product 产生，Work smoke 由受控 Test Harness/Operator 产生；Control 不直连二者。
- 指标保持低基数；raw hostname/client id 只在受 RBAC 保护的分页查询中出现。

## 9. API 与契约

演进现有 `/api/v1/opsi/rollouts`：

```text
POST /api/v1/opsi/rollouts                         mode=pilot|production
GET  /api/v1/opsi/rollouts/{id}/depots
GET  /api/v1/opsi/rollouts/{id}/rings
POST /api/v1/opsi/rollouts/{id}/rings/{ring}/approve
POST /api/v1/opsi/rollouts/{id}/depots/{depot}/pause
POST /api/v1/opsi/rollouts/{id}/depots/{depot}/resume
POST /api/v1/opsi/rollouts/{id}/rollback           scope 增加 depot/ring
GET  /api/v1/opsi/rollouts/{id}/compliance
POST /api/v1/opsi/artifacts/promote                支持 pilot→stable
POST /api/v1/opsi/depot-attestations
POST /api/v1/opsi/release-freezes
POST /api/v1/opsi/release-freezes/{id}/clear
GET  /api/v1/opsi/fleet/compliance                 cursor pagination
```

兼容规则：

- v1.2 create payload 未提供 `mode` 时保持 `pilot` 和 10～20 台限制。
- `production` 要求 21～500 台，并使用 production-only fields；不得通过扩大 v1.2 `pilot` 绕过 Gate。
- 所有 mutation API 要求 Idempotency-Key、If-Match/revision、认证 actor、reason 和 change ticket。
- 新 enum/Schema 先做 tolerant-reader/contract fixture 测试，再发布 producer。
- `opsiControlApi` 提升至 `1.3.0`，OpenAPI/JSON Schema 仍由 FastAPI/Pydantic SOT 生成。

## 10. 数据与执行模型

新增或扩展：

- `rollout_campaigns.mode` 和 production policy digests。
- `rollout_depots`、`rollout_rings`、`rollout_ring_targets`。
- `depot_artifact_attestations`、`release_freezes`、`fleet_compliance_snapshots`。
- persisted observations、gate counters、rate budgets 和 reconciliation deadlines。

要求：

- per-Campaign/per-Depot lease key，使用 `SKIP LOCKED`/等价机制领取 bounded work；禁止全量扫描成为唯一调度方式。
- fencing token 绑定 Campaign、Depot lane、freeze revision。
- 状态、outbox、audit event 原子提交；consumer 至少一次投递但幂等应用。
- Target/Action/Result 查询有索引和 cursor pagination；500 Endpoint load test 检查 query count/latency。
- Migration 完成 v1.2→v1.3 upgrade、downgrade（安全允许范围内）、restart 与历史 Campaign 只读兼容。

## 11. Production SLO 与门禁

- API create/command p95 < 500 ms，不包含 OPSI/Endpoint 外部执行时间。
- Eligible work 获得 lease 后 enqueue p95 < 30 s；Action Dispatcher 按 rate budget 派发。
- Result 在 OPSI 可见后 reconciliation p95 < 5 min。
- 500 Endpoint / 8 Depot 状态重建与分页查询不导致 Worker/API OOM。
- 14-Day Observation 中健康 Endpoint Gateway availability ≥ 99.5%，Work reconnect smoke ≥ 99%。
- 最终 unknown、secret leak、owner conflict、false success 均为 0；rollback drill 成功率 100%。
- Control/OPSI outage 后恢复，所有 open Action/Campaign 在 15 min 内完成 authoritative reconciliation 或明确进入 blocked state。

外部 Endpoint offline、维护窗口和 OPSI event cadence 单独报告，不得混入内部 API/Worker latency。

## 12. 验收场景

### AC-01 Production Gate

v1.2 Evidence 非 `proven / GO` 时，production start 和 stable promotion 均 fail closed；非生产 fixture 不能在 production 环境写 Gate。

### AC-02 No Fabricated Facts

缺失 owner、Depot、User Binding、previous digest 或 Gateway evidence 的 Target 均 INELIGIBLE；无 hard-coded fallback。

### AC-03 Depot Attestation

8 Depot 中一个缺包、版本不符、attestation 过期或 digest mismatch 时，其 lane 不可启动，Campaign 不得推进新 Ring。

### AC-04 Deterministic Rings

500 Endpoint/8 Depot 多次构造得到相同 snapshot/ring digest；Ring 0 覆盖所有 Depot，mapping drift 自动暂停受影响 lane。

### AC-05 Rate Budget / Backpressure

在 OPSI latency/429/503 和 DB pool pressure 下不超出 global/Campaign/Depot budget，不形成 retry storm。

### AC-06 Freeze Race

在 Worker claim 后、dispatch 前触发 global freeze；旧 fencing token 不产生新 mutation，reconcile/rollback 继续运行。

### AC-07 Authoritative Rollback

Action enqueue/OPSI accept 后分别注入 crash；恢复后无 duplicate dispatch，只有 Result/read-back/health evidence 完整时标记 `ROLLED_BACK`。

### AC-08 Offline Continuity

OPSI/Control/DB 短暂离线时停止新 mutation，健康 Gateway/Work 连续可用；恢复后 15 min 内收敛或明确 blocked。

### AC-09 Persistent Evidence

API/Worker 多次重启与 replica 切换后，Evidence digest 可复算且 metrics 不归零；无用户业务数据或 secret。

### AC-10 Production Observation

21～500 台按全部 Rings 完成并观察 14 天；执行 Depot lane、Ring、Campaign rollback drill，Operator 签署 v1.4 Go/No-Go。

## 13. 发布阶段

```text
Phase 0  v1.2 Live Pilot + Production GO（人工前置）
Phase 1  Production Correctness Closure
Phase 2  ADR/Contract/Migration + Scale Model
Phase 3  Multi-Depot Inventory + Attestation + Stable Promotion
Phase 4  Ring Scheduler + Windows/Timezone + Rate Budget
Phase 5  Circuit Breaker + Global Freeze + Authoritative Rollback
Phase 6  Fleet Compliance + Evidence v2 + Security/Observability
Phase 7  500 Endpoint Load/Chaos/Regression + Production Runbook
Phase 8  Live Production Rings + 14-Day Observation（人工门禁）
Phase 9  v1.4 Fleet GA + HA/DR Go / No-Go
```

Phase 0/8/9 只能由 Operator Evidence 推进。工程实现完成不等于 Production GO。

## 14. Definition of Done

- [ ] v1.2 10～20 台 Pilot、三层 rollback、7-Day Observation 已签为 `proven / GO`。
- [ ] v1.2 默认 facts、hard-coded binding/baseline、即时 rollback success 和进程内 Evidence blocker 已关闭。
- [ ] ADR-032、`opsiControlApi 1.3.0`、OpenAPI/Schema、migration/compatibility gates 通过。
- [ ] 21～500 Endpoint、1～8 Depot snapshot/rings deterministic。
- [ ] stable promotion 与每 Depot Artifact Attestation fail closed。
- [ ] global/Campaign/Depot rate budget、timezone window、backpressure 生效。
- [ ] Depot circuit breaker、global freeze/clear、fencing race 测试通过。
- [ ] Target/Depot/Ring/Campaign rollback 均经 authoritative reconcile 后成功。
- [ ] Fleet compliance/drift read-only，mutation 只能通过新审批 Campaign。
- [ ] Evidence v2 在 restart/replica 场景可复算且默认脱敏。
- [ ] 500 Endpoint/8 Depot load、OPSI/DB outage、retry storm 和 migration tests 通过。
- [ ] Work Direct Hermes/Offline Continuity 通过，Salt/Runtime isolation diff 为空。
- [ ] 14-Day Production Evidence 由 Operator 签为 `proven`。
- [ ] v1.4 Fleet GA + HA/DR Go/No-Go 已归档；未获 GO 不扩大到本版本上限以外。

