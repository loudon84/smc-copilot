---
name: Salt v2.4.1 Live Ring 0 Closure
overview: 修复 v2.4 允许跳过 Job、健康门禁和 7 天观察的生产缺口，建立真实 Handover/Runtime Fallback、唯一 Ring 0 状态机、持久化 SLO 与不可伪造 Evidence。继续使用单 Master 192.168.102.104；不部署第二 Master，不进入 v2.5 或 Ring 1。
todos:
  - id: phase-0
    content: 冻结 Live Rollout，锁定 PostgreSQL/CI/历史证据基线并新增 v2.4.1 回归测试
    status: completed
  - id: phase-1
    content: 修复 Gateway Lifecycle、result_pending/JID Reconcile、Return Identity 与认证 Actor
    status: completed
  - id: phase-2
    content: 完成真实 Windows Handover、Runtime Fallback、Snapshot Restore 与 Failure Injection
    status: completed
  - id: phase-3
    content: 实现可信 Target Resolver、唯一 Ring 0 Aggregate、Target Reconcile 与不可跳过批次门禁
    status: completed
  - id: phase-4
    content: 接入真实 Endpoint Facts、持久化时间窗口、SLO、Incident、Auto Pause 与 Manual Resume
    status: completed
  - id: phase-5
    content: 实现 Evidence Generator、Manifest/Secret Scan 和真实 Live Canary/Work Probe
    status: completed
  - id: phase-6
    content: 完成 PostgreSQL、Salt、Work、Contract、Windows Release Candidate CI
    status: completed
  - id: phase-7-manual
    content: 人工执行首台预演、5 台 1→2→2、受控回滚、7 天观察与最终签署；Cursor 不得自动完成，status 仅人工在签署后更新
    status: pending
isProject: false
---

# Cursor Implementation Plan — Salt Migration v2.4.1

## 1. 执行依据

- PRD：`prd/v2.4.1.md`
- 基线 Commit：`593f80f`
- 唯一 Salt Master：`192.168.102.104`
- 当前 Live 决策：`NO-GO`

开始前阅读：

- `AGENTS.md`
- `services/salt-control/AGENTS.md`
- `apps/work/AGENTS.md`
- `docs/adr/ADR-026-salt-endpoint-control-plane.md`
- `docs/adr/ADR-030-runtime-endpoint-decommission.md`
- `prd/v2.4.md`
- `prd/v2.4.1.md`
- `docs/salt/evidence/v2.4/STATUS.md`
- `docs/salt/evidence/v2.4/ring0/TEMPLATE/V2.5-GO-NO-GO.md`

固定边界：

- 不部署第二 Master。
- 不实施 MultiMaster-PKI、双向故障转移或 Ring 1。
- 不删除 `services/runtime`。
- Salt 不进入 Work Chat Data Plane。
- 不修改或伪造历史实机证据。
- Cursor/CI 只能设置 `implemented`，不得设置人工 `proven`。
- 现有未跟踪文件属于用户，禁止清理或覆盖。

状态与人工边界：

- `phase-0` 至 `phase-6` 为 Cursor 可执行工程任务；完成判定以对应 Phase 退出条件与 CI 证据为准，退出条件未满足禁止标记 `completed`。
- `phase-7-manual` 为纯人工 Phase：Cursor 不得执行其 Runbook 任何步骤，不得将其 `status` 改为 `in_progress` 或 `completed`。
- `phase-7-manual` 的 `status` 仅允许人工在 v2.5 Go/No-Go 签署完成后更新为 `completed`。
- 任何 `not_proven` → `proven` 的变更只能由授权签署人完成，Cursor/CI 仅可写 `implemented`。

## 2. 当前基线

- Salt Control：44 passed、1 skipped。
- Salt Control Ruff：通过，85 files formatted。
- Salt Infra：91 passed。
- Work 定向测试：本机受运行中的 Work/Nx 进程影响而超时，需由独立 CI 复核。
- Contract Check：本机 Nx 超时，需由 CI 复核。
- Work `lat check`：通过。
- v2.4 Phase 6：`manual_gate / not_proven`。

必须先增加失败测试证明以下缺陷：

1. 未启动当前 Batch 即可 Advance。
2. Job 未成功即可 Advance。
3. Batch 3 未下发即可标记完成。
4. 7 天未结束即可完成。
5. `gateway_restart(action=...)` 调用失败。
6. Handover Owner 切换后失败不能完整恢复 Runtime。
7. 自报 Approval Role 可通过。
8. Return Endpoint/Function 与 Job 不一致仍可完成 Job。

## 3. Phase 0 — Freeze、Migration 与可信 CI

### 修改

- 保持 `docs/salt/evidence/v2.4/STATUS.md` Live 状态为 `not_proven`。
- 新增 `docs/salt/evidence/v2.4.1/STATUS.md` 与 Schema/TEMPLATE；默认 `NO-GO`。
- 新增 Alembic `20260812_v241_live_ring0.py`。
- 在 `pytest.ini` 或 `pyproject.toml` 注册 `integration` mark。
- CI 显式断言 PostgreSQL Alembic Test 未 skip。
- 历史第二 Master 描述只增加 Superseded Index，不改原始 Evidence Payload。

### 数据模型

- Rollout：状态版本、批次时间、最终观察时间、完成时间。
- Target：批次、状态版本、来源 Job、Reason、观察时间。
- Target Job：Operation、Attempt、Idempotency、Expected Function、Result Source。
- Control Job：Expected Function、Redacted Result、Result Schema、Result Source、Reconcile TTL。
- Approval：Stage、Role Source、Expiry、Revocation。
- Evidence Bundle：Manifest Digest、Status、Signer、Archive。

### 测试

- PostgreSQL 16 Upgrade → Downgrade → Upgrade。
- Unique Constraint 与 Backfill。
- 双实例乐观锁冲突。

### 退出条件

- CI 中 PostgreSQL Integration Test 实际执行且通过。
- v2.4.1 Schema 可回滚。
- Live Gate 没有被自动设置为完成。

## 4. Phase 1 — Job、Returner 与 Lifecycle Contract

### Gateway Lifecycle

选择一个唯一合同并端到端实现：

- 推荐：`smc_hermes.gateway_start`、`gateway_stop`、`gateway_restart`；或
- 保留统一入口，但 `action=start|stop|restart` 必须由模块签名、实现、State 与测试共同支持。

更新：

- `services/salt-control/src/services/invocation.py`
- `services/salt-control/src/integrations/salt_api.py`
- `infra/salt/extensions/_modules/smc_hermes.py`
- `infra/salt/extensions/_states/smc_hermes.py`
- Salt Loader Tests 与 Invocation Contract Tests。

### Result Pending 与 Reconcile

- Job Poll Timeout 写 `result_pending`，不直接 `failed`。
- 新增 Result Reconciler，从 PostgreSQL 认领 `running/result_pending` Job。
- 已有 JID 只查 `jobs/{jid}`，永不再次 Publish。
- Reconcile TTL 到期后进入 `expired`，写稳定 Error Code。
- Worker、Returner、Reconciler 共享原子 Terminal Apply 方法。

### Return Identity

- Device Credential Endpoint 必须等于 Return `endpointId`。
- Return Endpoint/Minion、JID Owner、Expected Function 必须一致。
- 不一致写 P1 Incident，禁止完成 Job。
- 持久化 Redacted Result、Schema Version、Result Source、CapturedAt。

### Auth/Audit

- 删除或忽略 Job 请求体的 `requestedBy`。
- Service 使用 OIDC/Auth Principal Subject。
- 严格固定 Salt Function 白名单，删除任意 `smc_hermes.*` 前缀放行。
- 检查 Master eAuth，按账号/Function/Target 收敛 Wheel/Runner 权限。

### 测试

- 每个 Operation 的 Function/Arg/Kwarg/Timeout。
- Publish 后 Crash、JID 前后 Crash。
- Poll/Returner 先后顺序、重复与迟到 Return。
- Endpoint/JID/Function Identity Mismatch。
- 双 Worker Reconcile。

### 退出条件

- 每个 Operation 只产生一个 JID。
- 生命周期调用在真实 Salt Loader 合同下通过。
- Returner 不能伪造 Endpoint 或 Function。

## 5. Phase 2 — Transactional Handover 与 Runtime Fallback

### Windows Facts 与 Snapshot

Snapshot 必须包含：

- Runtime Service/Process/Task 状态。
- Runtime Gateway PID/Port/Owner。
- Hermes Home、Gateway Task User。
- Owner、Release、Config、Pillar、Binding Revision。
- 回退命令与健康探针。

### Handover

- `disable_runtime()` 必须执行真实 Runtime Service/Task Ownership 停止并验证。
- 停止旧 Gateway 后检查进程与端口关闭。
- Owner 只在 Salt Gateway Ready 前最后阶段切换。
- Salt Gateway 必须以绑定用户运行，禁止 System。
- Work Critical Probe 通过后才写 `COMPLETED` Marker。

### Rollback

- Owner 切换后任何失败调用统一 Snapshot Restore。
- 恢复 Runtime Service/Task、旧 Gateway、Owner、Release、Config。
- `runtime_reconcile()` 必须执行真实恢复，不得固定 `True`。
- Runtime Health 与 Salt Gateway Health 使用不同 Probe。
- Rollback 成功后再允许 Remigrate。

### Failure Injection

至少覆盖：

- Salt Preflight、Artifact、Stop Gateway、Stop Runtime。
- Owner Switch 后 Start Salt Gateway。
- Gateway Health、Work Probe、Marker Write。
- Rollback Restore、Runtime Start、Runtime Health。

### Live Preview

- 仅使用一台授权测试 Endpoint。
- 执行 migrate → rollback → remigrate。
- 生成 `implemented` Evidence；人工确认后才能改为 `proven`。

### 退出条件

- 每个故障点都恢复初始 Owner 与 Runtime/Work 可用性。
- 无 Stub/WhatIf 结果进入生产 Evidence。

## 6. Phase 3 — 唯一 Ring 0 Aggregate

### Target Resolver

从 Backend/Database 解析并冻结 5 台互不重复 IT/开发 Endpoint：

- Active、Key Accepted、Ping True。
- Windows Binding 完整且非 System。
- Pillar/Release/Signature/Config 可解析。
- Runtime Fallback Preflight 通过。

Snapshot 保存完整事实与 SHA-256 Digest，不接受调用方自报 Group/Binding/Minion 事实。

### Approval

- Role 来自 OIDC Claim 或 Backend RBAC。
- 请求体不再决定角色。
- 三个不同 Subject 与三个固定 Role。
- Approval 绑定 Snapshot/Release/Config/Threshold Digest 与 Expiry。
- 内容变化自动 Revoke。
- 最终 Signoff 使用独立 Stage。

### State Machine

建立单一 Domain Transition Guard：

- Rollout：Approval → Batch Running → Batch Observing → Final Observing → Awaiting Signoff → Completed。
- Target：Pending → Dispatching → Verifying → Observing → Observing Passed。
- 所有命令检查 `stateVersion`。
- Generic Rollout API 对 Ring 0 委托同一 Aggregate。

### Job Reconcile

- Handover Job 终态自动更新 Target/Target Job。
- Verifier 采集 Owner、Gateway、Release、Config、Work Probe。
- 失败自动 Pause 与 Incident。
- Target Job 支持 Handover/Verify/Rollback/Remigrate 与受控重试。

### Batch Gate

Advance 前必须：

- 当前批次已启动且数量为 1/2/2。
- 全部 Job 成功。
- 全部 Target=`observing_passed`。
- 真实 24h 窗口完成。
- P0/P1/Security/SLO Gate 全过。
- Operator 提交最新 Gate Digest。

禁止自动 Advance。最终批次后进入 `final_observing`，不是 `completed`。

### 测试

- 跳批、重复 Start、重复 Advance。
- 未启动 Advance、Job Pending/Failed Advance。
- 双 API/双 Worker、服务重启。
- 时间推进、迟到 Return、State Version Conflict。
- Approval Role 伪造与 Digest 变化。

### 退出条件

- 任何顺序/并发都不能绕过 Batch 与 Signoff。
- 同一 Target 同一 Operation 不重复 Publish。

## 7. Phase 4 — Real Observation、SLO 与 Auto Pause

### Endpoint Fact Collector

每 60 秒采集：

- Master Availability、Minion Heartbeat/Key。
- Gateway Health/Process/Task User。
- Owner、Release、Config。
- Job/Return/Spool。
- Work Probe、Secret Scan、Signature Validation。

禁止从 Target State 推断 Owner 或 Gateway Health。

### Window Aggregation

- PostgreSQL 保存 Raw Sample 与 Bucket Aggregate。
- 15m/1h/6h/24h/7d 是真实时间范围。
- 重启后可从数据库重算。
- 数据缺口超过 5 分钟写 Incident，不计入观察时长。

### Gate Evaluator

实现 PRD 中全部 SLO 与 Security Gate。

5 台样本规则：任一 Endpoint Handover、Gateway、Work Critical Probe 失败即暂停。

### Pause/Resume

- Gate 失败自动 Pause，Incident 去重。
- 恢复后不自动 Resume。
- Resume 必须重新 Evaluate、提交 Reason、写 Actor 与 Gate Digest。

### API/Metrics

- Rollout Status、Gates、Observations。
- Prometheus 或 `/salt/v1/metrics`。
- Endpoint Status 返回真实 LastObservedAt 与 Fact Source。

### 退出条件

- 每类故障注入都能暂停。
- Observer 重启不丢失窗口。
- 无法证明的时间不计入 24h/7d。

## 8. Phase 5 — Evidence 与 Live Canary

### Evidence Generator

生成到：

`docs/salt/evidence/v2.4.1/ring0/<rollout-id>/<captured-date>/`

文件：

- baseline、target-snapshot、approvals、batches、jobs、job-returns。
- observations、metrics、incidents、rollback、work-probes、secret-scan。
- manifest、final-go-no-go。

每个 JSON 必须含 Schema、Source、CapturedAt、Digest、Status。Manifest 保存所有文件 SHA-256、Git Commit、Snapshot Digest、Release、Config 与 Generator Version。

### Proven Guard

- Generator/CI 只能写 `implemented/not_proven`。
- `proven` 需要授权 Signer 与签署时间。
- 缺失事实、Schema/Digest 失败、Secret Scan 非零时禁止 GO。

### Live Canary

- 明确 Windows PowerShell 5.1 或 PowerShell 7 运行合同。
- TLS CA 与真实 Master Fingerprint 比对。
- Key/Ping/Extension/Pillar/Release Signature/Config Gate。
- 仅通过 Job/Migration API执行变更。
- 等待 Reconcile 终态。
- 执行真实 Work Probe。
- 实际 Runtime Rollback → Verify → Remigrate；WhatIf 不算 Proven。
- 输出 Secret-Free Evidence Fragment。

### 退出条件

- 测试 Rollout 可生成 Schema/Digest Valid Bundle。
- 缺失事实明确为 `not_proven`。
- Live Canary 不再存在占位 Gate 或 WhatIf 假阳性。

## 9. Phase 6 — Release Candidate CI

### Salt Control

- `ruff check`
- `ruff format --check`
- 全量 Pytest。
- PostgreSQL 16 Migration Cycle。
- 双 Worker、Crash、Reconcile、State Version Test。
- OpenAPI Export/Generated Client Drift。

### Infra Salt

- Ruff 与全量 Pytest。
- Real Loader/Invocation Contract。
- Handover Failure Injection。
- Returner Identity/Spool Recovery。
- Production Guards、Migration Inventory、Secret Scan。

### Work

- 使用独立 CI/临时目录，避免正在运行的 Work/Nx 进程影响。
- Ring 0 定向 54 项或更新后的等价 Suite。
- Windows Self-hosted Gateway/Work Probe。
- 全量失败基线不得增加。
- 修改 Work 后运行 `lat check`，必要时更新 `lat.md`。

### 退出条件

- Release Candidate CI 全绿。
- P0/P1 代码问题为 0。
- Phase 7 仍保持 `pending/manual_gate`。

## 10. Phase 7 — Live Ring 0（人工）

执行 Runbook：

1. 首台 migrate → rollback → remigrate。
2. 冻结 5 Target Snapshot。
3. 三方部署前审批。
4. Batch 1：1 台 / 24h。
5. Batch 2：2 台 / 24h。
6. Batch 3：2 台。
7. 受控单 Endpoint Rollback → Verify → Remigrate。
8. 5 台连续 7 天有效观察。
9. 三方最终 Signoff。
10. 生成并签署 v2.5 Go/No-Go。

Cursor 约束：

- 不代替操作员执行未授权生产变更，不执行本 Phase Runbook 的任何步骤。
- 不把 TODO 自动改为 completed；`phase-7-manual` 的 status 仅人工在签署后更新。
- 不把 Template 或 Dry Run 写成 Live Evidence。
- 不把任何 `not_proven` 自动改为 `proven`。
- 仅可生成 Runbook 检查清单、Evidence 模板与脚本骨架，且必须标注 `template`。

退出条件（全部人工判定）：

- [ ] 首台 migrate → rollback → remigrate 证据齐备。
- [ ] 5 台 1→2→2 批次与受控回滚证据齐备。
- [ ] 连续 7 天有效观察数据完整，无未解释缺口。
- [ ] 三方最终 Signoff 完成。
- [ ] v2.5 Go/No-Go 已签署归档。

## 11. CI 命令

Salt Control：

```text
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
uv run alembic upgrade head
uv run alembic downgrade base
uv run alembic upgrade head
```

Salt Infra：

```text
uv run ruff check .
uv run pytest -q
uv run python scripts/check-production-guards.py
```

Repository：

```text
python scripts/salt-migration-inventory.py --check
npm run contracts:check
git diff --check
```

Work：

```text
npm exec vitest run -- tests/enterprise-salt-mode.test.ts tests/hermes-availability-backend.test.ts tests/runtime-adapter.test.ts tests/chat-messages.test.ts tests/chat-runs.test.ts tests/sessions-history-items.test.ts tests/session-attachment-store.test.ts src/main/files/attachment-adapter.test.ts src/main/files/file-security.test.ts
lat check
```

## 12. DoD

- [ ] 以 `prd/v2.4.1.md` 为唯一需求基线。
- [ ] 每个 Phase 单独提交，禁止一次提交全部功能。
- [ ] 每次提交包含对应测试和文档。
- [ ] 所有状态迁移、Salt Publish、Rollback、Approval、Evidence 均可审计。
- [ ] Runtime Fallback 在最终签署前保持可用。
- [ ] Phase 7 只有人工 Live Evidence 完成后才允许完成。
- [ ] 未签署 v2.5 Go/No-Go 前，不创建第二 Master、不进入 Ring 1。
