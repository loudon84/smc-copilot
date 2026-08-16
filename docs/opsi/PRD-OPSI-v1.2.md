# SMC Copilot OPSI Endpoint Control Plane v1.2 PRD

**Pilot Rollout Orchestration + Fleet Reliability**

- 基线分支：`opsi/prd-v1.0`
- 规划基线：`403c67d`（OPSI v1.1 engineering implementation）
- 目标 API：`opsiControlApi 1.2.0`
- 状态：Planning；v1.1 Live Gate 未通过前禁止进入 Pilot

## 1. 文档定位

v1.1 已把 OPSI Provider 从工程骨架推进到真实 Package、Endpoint transaction、Durable Action、OPSI 4.3 RPC fidelity 和生产门禁的实现阶段。但当前 Evidence 仍明确为：

```text
Engineering       implemented
Live verification not_proven
Decision          NO-GO
```

v1.2 不重新实现 v1.1，也不把工程测试等价为真实 Pilot。它只在 v1.1 Windows 10/11、24h Development Observation、Security/Release Signoff 和 Pilot Go/No-Go 均为 `proven / GO` 后，建设 10～20 台 OPSI-managed Endpoint 的可审计、可暂停、可定向回滚的 Pilot 发布编排。

```text
v1.1 Live Gate = GO
        ↓
Immutable Pilot Target Snapshot
        ↓
Preflight + Human Approval
        ↓
2 台 Canary → 每批最多 5 台
        ↓
Batch Health Gate / Auto Pause
        ↓
Target / Batch / Campaign Rollback
        ↓
7-Day Pilot Observation
        ↓
v1.3 Production Rollout Go / No-Go
```

## 2. 决策与产品边界

以下架构决策在 v1.2 继续冻结：

1. Salt 仍是默认 Endpoint Control Plane SOT；OPSI 是客户可选的独立平行 Provider。
2. 单 Endpoint 同一时间只有一个 Hermes lifecycle owner；本版本只编排 `hermes=opsi` 的 Endpoint。
3. Work 始终 Direct Hermes `localhost:8642`，不调用 `opsi-control`，不存 OPSI 凭据，不增加 OPSI Job UI。
4. `services/opsi-control` 只通过 TLS JSON-RPC 连接 OPSI Server，不直连 Endpoint、Gateway 或 Work。
5. OPSI Server/Control 离线不得停止已经健康运行的 Hermes Gateway 或 Work Chat。
6. 不修改 `infra/salt`、`services/salt-control`、`contracts/salt-control-api`。
7. 不向 `services/runtime` 或 `contracts/runtime-api` 增加 OPSI 能力。
8. Pilot、Rollback Drill 和 7-Day Observation 均为 Operator Gate；自动化只能生成证据，不能签署 `proven`。

## 3. 产品目标

v1.2 必须完成：

- 对 10～20 台明确选择的 OPSI-managed Endpoint 创建不可变 Pilot target snapshot。
- 在派发前完成 Owner、OPSI inventory、Package、Hermes/Gateway、User Binding、磁盘和最近在线状态预检。
- 冻结目标 Product version/package revision、Hermes artifact digest、config revision 和 rollback baseline。
- 使用“2 台 Canary + 后续每批最多 5 台”的批次策略，批间经过观察与人工审批。
- 支持 Campaign pause/resume/abort，以及单 Endpoint、当前 Batch、整个 Campaign 三种回滚范围。
- 任一 false success、Owner conflict、secret leak、P0/P1、rollback failure 或 Canary failure 自动暂停。
- 通过 PostgreSQL 持久化 Campaign、Batch、Target、Approval、Gate Evaluation 和 Audit Event。
- 产出可复算、可签核、默认脱敏的 Pilot evidence manifest 和 7-Day Observation 报告。
- 保持 Work Direct Hermes 与 OPSI Offline Continuity，通过 Pilot 全程回归。
- 最终形成 v1.3 Production Rollout Go/No-Go，而不是自动进入生产全量发布。

## 4. 非目标

v1.2 不建设：

```text
超过 20 台 Endpoint 的 Production Rollout
OPSI Server HA / Disaster Recovery
Multi-depot / WAN-aware Distribution
Salt ↔ OPSI 或 Runtime ↔ OPSI 自动迁移
跨 Provider 自动回滚
无人值守生产发布
实时日志 Streaming
完整 5 MiB Diagnostic Bundle 中央下载
AI/LLM RCA 或自动修复决策
Work OPSI Job / Rollout UI
Renderer OPSI Credentials / RPC Client
Skills / Plugins / MCP Catalog 管理
```

以上能力进入 v1.3 或后续版本重新评估。完整 Diagnostic Bundle 在 Pilot 仍保留 Endpoint-local，由 Operator 按既有安全流程收集；Control API 只返回 Compact Diagnostic 和 Evidence manifest。

## 5. 角色与职责

- `Release Owner`：创建 Campaign、冻结 Artifact/Config、申请启动、处理暂停与发布结论。
- `Endpoint Ops`：确认 OPSI inventory、Endpoint window、离线原因和回滚执行结果。
- `Security Owner`：审核签名、Secret canary、Redaction 与 Audit evidence。
- `Pilot User`：执行 Work Chat/Gateway 业务验证，不接触 OPSI 管理凭据。
- `opsi-control Worker`：按持久化状态机编排，不承担人工批准或最终 `proven` 签名。

启动 Pilot 至少需要 `Release Owner + Endpoint Ops` 双人审批；若 Artifact、签名策略或 Redaction 发生变化，还需要 `Security Owner` 审批。创建者不得独自满足双人审批。

## 6. 核心对象与状态机

### 6.1 Pilot Campaign

Campaign 创建后冻结以下字段：

- `campaign_id`、名称、变更单/原因和维护窗口。
- 显式 `client_ids` 列表与 canonical target snapshot SHA-256。
- 目标 `product_id`、`product_version`、`package_version`。
- Hermes artifact manifest digest 与 signer key id。
- config revision 与 schema version。
- 每个 Target 的 previous product/config/owner rollback baseline。
- batch strategy、gate policy revision 和 evidence policy revision。

状态：

```text
DRAFT
  → PREFLIGHTING
  → AWAITING_APPROVAL
  → RUNNING ↔ PAUSED
  → OBSERVING ↔ PAUSED
  → SUCCEEDED

RUNNING / OBSERVING / PAUSED
  → ROLLING_BACK
  → ABORTED | FAILED
```

规则：

- `SUCCEEDED`、`ABORTED`、`FAILED` 为终态，不可 resume。
- Target snapshot、Artifact、Config 或 Gate Policy 改变时必须创建新 Campaign，不允许原地修改。
- 所有状态转换使用乐观锁和审计原因；重复请求由 `Idempotency-Key` 收敛。
- 一个 `client_id` 同一时间最多参加一个非终态 mutation Campaign。

### 6.2 Batch

- Batch 0 固定为 2 台 Canary。
- 后续 Batch 每批最多 5 台；由稳定排序的 target snapshot 切分，创建后不可重排。
- 前一 Batch gate 通过且下一批获得人工批准后才可派发。
- Canary 至少观察 24 小时；后续批次至少观察 6 小时；全部 Target 收敛后进入 7-Day Observation。

Batch 状态：

```text
PENDING → READY → DISPATCHING → VERIFYING → OBSERVING → PASSED
                           ↘ FAILED / PAUSED / ROLLED_BACK
```

### 6.3 Target

Target 状态：

```text
PENDING → PREFLIGHT_READY → DISPATCHED → APPLYING → VERIFYING → HEALTHY
             ↘ INELIGIBLE          ↘ FAILED → ROLLED_BACK | ROLLBACK_FAILED
                                                    ↘ SKIPPED（仅在未派发时）
```

`HEALTHY` 至少要求：

- OPSI `productOnClient` 与目标 Product/package 一致。
- 最终 Result checksum 合法，且不是 timeout/unknown/false success。
- `control-owner.json` 为 `{ "hermes": "opsi" }`，无 owner conflict。
- Hermes config revision 与 Campaign 冻结值一致。
- Gateway 进程、端口 `8642`、health probe 与用户态 binding 正常。
- Work Direct Hermes reconnect 与 Chat smoke 通过；证据由 Endpoint Test Harness/Operator 产生，`opsi-control` 只校验经 Result/Evidence 通道返回的结果，不直连 Work。

## 7. 功能需求

### F1 — Target Snapshot 与 Preflight

`opsi-control` 必须把动态 inventory 查询转成显式、不可变 target snapshot，不得在 Campaign 运行期间因为 group membership 变化而静默增删 Endpoint。

Preflight 对每个 Target 检查：

- Client 存在、OS 为受支持 Windows 10/11、最近在线时间在策略窗口内。
- `hermes=opsi` 或尚未被其他 Provider 占有；发现 `salt/runtime/direct` 冲突立即 INELIGIBLE。
- OPSI agent、Depot、`smc-hermes-agent` Product 与目标 package 可用。
- Artifact manifest、SHA-256、Ed25519 signature 和 signer allowlist 有效。
- previous version/config/owner rollback baseline 可解析且 Artifact 可获取。
- 磁盘、安装路径、Scheduled Task/User Binding 和 Gateway 当前状态可判定。
- Endpoint 没有其他 active mutation Action/Campaign。

任何 Target 不可回滚或状态未知时，Campaign 不得进入审批。

### F2 — Artifact Promotion

增加 `testing → pilot → stable` 的 Artifact channel 元数据，但 v1.2 只允许从已签名且经过 v1.1 Live Gate 的 Artifact 提升到 `pilot`。

- Promotion 记录 digest、signer、source evidence、审批人与时间。
- Digest immutable；同版本不同 digest 视为 supply-chain conflict。
- `quarantined` Artifact 不能新派发；已运行 Campaign 自动暂停。
- `stable` 仅作为 v1.3 输入，本版本不自动提升。

### F3 — Approval 与维护窗口

- 启动、下一批、resume、扩大回滚范围都必须记录 actor、role、reason、timestamp。
- Approval 绑定 Campaign revision，任何冻结字段变化使旧 Approval 失效。
- Worker 只在维护窗口内产生新的 mutation dispatch；窗口结束后保留观察和 reconciliation，但不继续下一批。
- Emergency pause 可由 Release Owner、Endpoint Ops、Security Owner 任一角色触发。

### F4 — Batch Orchestration

- Campaign API 只创建编排意图；实际 dispatch 由带 lease 的 Worker 异步执行。
- Worker 复用 v1.1 Action primitive，不绕过 Result Transport、checksum、deadline 或 reconciliation。
- 同一 Endpoint 的 install/config/repair/rollback 串行执行。
- Worker restart 后从 DB 恢复，不重复派发已经被 OPSI 接受的 Action。
- OPSI 或 DB 短暂离线进入 backoff/PAUSED，不把基础设施故障伪装成 Endpoint failure。

### F5 — Gate Evaluation 与自动暂停

以下任一条件立即 `PAUSED`，并停止产生新 dispatch：

- Canary 任一 Target install/config/health/Work smoke 失败。
- Result checksum 不一致、timeout 后状态不可判定或出现 false success。
- Owner conflict、签名/Artifact digest 冲突、Secret canary 命中或 Redaction failure。
- 任一 rollback failure、用户数据损失迹象或未关闭 P0/P1。
- OPSI/DB/Worker readiness 连续超过策略阈值不可用。
- 已运行 Endpoint 的 Gateway availability 或 Work reconnect 低于 Pilot threshold。

Pause 不停止健康 Gateway，也不修改 Work；它只停止 Control Plane 的新 mutation。Resume 必须重新 preflight 未派发 Target、关闭 pause cause 并获得审批。

### F6 — 回滚

支持三种 scope：

- `target`：只恢复指定 Endpoint。
- `batch`：恢复当前或指定 Batch 已发生 mutation 的 Endpoint。
- `campaign`：按逆批次顺序恢复所有已发生 mutation 的 Endpoint。

回滚必须恢复冻结的 previous Product/package、Hermes artifact、config revision 和必要的用户态启动配置。由于本版本不做 Provider migration，正常 rollback 后 owner 仍是 `opsi`；若 baseline owner 不是 `opsi`，Preflight 必须拒绝该 Target，而不是自动切换 Provider。

回滚也走签名验证、Action/Result checksum、health/Work smoke 和审计。Rollback failure 是终止性 Gate，不得自动继续下一批。

### F7 — Evidence 与 Audit

每个 Campaign 输出：

- Campaign/target snapshot digest、Artifact/config/gate policy revision。
- Approvals、状态转换、pause/resume/abort/rollback 原因。
- 每批 dispatch、Result、health、Work smoke 和观察窗口摘要。
- Endpoint ID 使用受控标识；默认不包含用户名、Prompt、Memory、Conversation 或 OPSI Secret。
- 每个 evidence object 的 SHA-256、producer、生成时间和 schema version。
- `implemented / verified / proven` 分层状态；只有 Operator 可以签 `proven`。

完整 Bundle 不经 Product Property、OPSI log 或 API response 传输。Compact Diagnostic 必须经过结构化 Redaction 与 secret canary test。

Gateway/Work 证据的 Producer 必须显式记录：Endpoint Product 负责本机 Gateway probe，受控 Test Harness/Operator 负责 Work Chat smoke；`opsi-control` 不直接请求 Gateway 或 Work。

### F8 — Fleet Observability

至少暴露下列低基数指标：

- Campaign/Batch/Target 各状态数量。
- preflight/gate/dispatch/reconcile/rollback duration。
- action success/failure/unknown、pause cause、rollback outcome。
- OPSI RPC、DB、Worker lease/readiness。
- Pilot Gateway availability 与 Work reconnect smoke aggregate。

指标标签不得包含 user、prompt、conversation、raw hostname 或 secret。高基数 Target 细节只通过受 RBAC 保护的审计查询获取。

## 8. API 与数据契约

新增 additive API：

```text
POST /api/v1/opsi/rollouts
GET  /api/v1/opsi/rollouts
GET  /api/v1/opsi/rollouts/{campaign_id}
GET  /api/v1/opsi/rollouts/{campaign_id}/targets
POST /api/v1/opsi/rollouts/{campaign_id}/preflight
POST /api/v1/opsi/rollouts/{campaign_id}/approve
POST /api/v1/opsi/rollouts/{campaign_id}/start
POST /api/v1/opsi/rollouts/{campaign_id}/pause
POST /api/v1/opsi/rollouts/{campaign_id}/resume
POST /api/v1/opsi/rollouts/{campaign_id}/abort
POST /api/v1/opsi/rollouts/{campaign_id}/rollback
GET  /api/v1/opsi/rollouts/{campaign_id}/evidence
```

写 API 要求：

- `Idempotency-Key`。
- Campaign revision/`If-Match` 乐观并发控制。
- actor 由认证身份导出，body 不接受自报 actor。
- reason/change ticket；高风险动作要求相应 RBAC role。
- 成功只表示意图已持久化，不表示 Endpoint 已完成。

契约 SOT 仍是 `services/opsi-control` FastAPI/Pydantic；生成 `contracts/opsi/openapi.yaml`，JSON Schema 放在 `contracts/opsi/*.schema.json`，并将 `contracts/version.json` 的 `opsiControlApi` 提升到 `1.2.0`。不得手改生成的 OpenAPI 代替 source model 变更。

## 9. 数据持久化与一致性

新增或扩展：

- `rollout_campaigns`
- `rollout_batches`
- `rollout_targets`
- `rollout_approvals`
- `rollout_gate_evaluations`
- `rollout_events`
- `artifact_promotions`

要求：

- PostgreSQL transaction/UoW 同时提交状态与 outbox/audit event。
- 唯一约束阻止同一 Target 的并发 active mutation Campaign。
- Worker lease 有 owner、expiry、heartbeat 和 fencing token。
- Migration 必须完成 upgrade/downgrade/upgrade 与历史 Action 兼容测试。
- 状态可由 DB + OPSI authoritative read-back 重建；内存缓存不是 SOT。
- Evidence manifest 可由不可变事件重算并校验 digest。

## 10. Pilot SLO 与 Gate

自动化观测目标：

- Campaign/Action create API p95 < 500 ms（不含外部 OPSI/Endpoint 完成时间）。
- Eligible job 获得 Worker lease 后，内部 dispatch p95 < 60 s。
- OPSI result 可见后，reconciliation p95 < 5 min。
- 7-Day Observation 期间健康 Endpoint 的 Gateway availability ≥ 99.5%。
- Work Direct Hermes reconnect smoke success ≥ 99%。
- Action `unknown` 在最终报告中为 0；secret leak、owner conflict、false success 为 0。
- Rollback Drill 成功率 100%。

SLO 不以隐藏离线 Endpoint、删除失败 Target 或修改 target snapshot 的方式达成。Endpoint/OPSI 外部等待时间必须单独报告，不计入内部 API/Worker latency。

## 11. 验收场景

### AC-01 Immutable Snapshot

创建 10～20 台 Campaign 后改变 OPSI group membership，Campaign Target 不变；snapshot digest 可复算。

### AC-02 Preflight Rejects Unsafe Target

Owner conflict、rollback Artifact 缺失、signature failure、未知 User Binding 或 active mutation 的 Target 均阻止审批。

### AC-03 Canary Auto Pause

Canary 中一台注入 Gateway health failure；Campaign 自动暂停，后续 Batch 无新 dispatch，健康 Gateway/Work 不受影响。

### AC-04 Durable Resume

在 dispatch、reconcile 和观察阶段分别重启 Worker/API；无 duplicate dispatch，恢复后从 DB/OPSI authoritative state 收敛。

### AC-05 Target Rollback

单台失败 Target 恢复 previous Product/config，Gateway/Work smoke 通过，其他 Target 不变。

### AC-06 Batch/Campaign Rollback

对当前 Batch 和整个 Campaign 演练回滚；按逆批次执行，所有已 mutation Target 回到冻结 baseline。

### AC-07 Offline Continuity

OPSI Server/Control 离线时 Campaign 停止新 mutation；已经健康的 Gateway 与 Work Chat 连续可用；恢复后 reconcile 收敛。

### AC-08 Security/Audit

Idempotency、RBAC、双人审批、revision invalidation、Secret canary、Redaction 和 evidence checksum 全部通过。

### AC-09 Seven-Day Pilot

10～20 台完成批次发布并观察 7 天；Action unknown=0、false success=0、owner conflict=0、rollback drill=100%，形成 Operator 签核报告。

## 12. 发布阶段

```text
Phase 0  v1.1 Live Gate / Pilot GO（人工前置）
Phase 1  Contract + Durable Rollout Domain
Phase 2  Snapshot + Preflight + Artifact Promotion
Phase 3  Approval + Batch Orchestration
Phase 4  Gate + Pause/Resume + Rollback
Phase 5  Observability + Evidence + Security Hardening
Phase 6  10～20 Endpoint Pilot / 7-Day Observation（人工门禁）
Phase 7  v1.3 Production Rollout Go / No-Go
```

Phase 0 不是可由代码绕过的 feature flag。Phase 6/7 不因自动测试通过而自动完成，也不允许 Cursor 代替 Operator 写 `proven` 或 `GO`。

## 13. Definition of Done

- [ ] v1.1 Windows 10/11、24h Observation、Security/Release Signoff 与 Pilot GO 已归档为 `proven`。
- [ ] 10～20 台 target snapshot immutable 且 digest 可复算。
- [ ] Preflight 覆盖 owner、inventory、artifact、rollback、binding、disk、health 和并发 mutation。
- [ ] `opsiControlApi 1.2.0`、OpenAPI、JSON Schema 与 migrations 通过 drift/兼容测试。
- [ ] 双人审批、维护窗口、revision invalidation 与 RBAC 生效。
- [ ] Canary 2 台、后续每批最多 5 台，批间观察和人工审批生效。
- [ ] Auto pause 不产生后续 dispatch，resume 重新 preflight 并审批。
- [ ] Target、Batch、Campaign rollback drill 全部通过。
- [ ] API/Worker restart、OPSI/DB offline、lease/fencing 和 reconciliation 测试通过。
- [ ] Gateway availability、Work reconnect、Compact Diagnostic 与 Offline Continuity 达标。
- [ ] secret leak、owner conflict、false success、最终 Action unknown 均为 0。
- [ ] 7-Day Pilot Evidence 由 Operator 签为 `proven`。
- [ ] Salt/Runtime 隔离 diff 为空，Work 无 OPSI Job/RPC/Credentials 能力。
- [ ] v1.3 Production Rollout Go/No-Go 已归档；未获 GO 时保持 Pilot 范围，不自动扩容。
