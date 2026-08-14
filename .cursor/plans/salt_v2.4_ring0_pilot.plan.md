---
name: Salt v2.4 Ring 0 Pilot
overview: 将 v2.3.1 单 Endpoint 代码闭环升级为可持久化、可暂停、可恢复、可审计的 5 台 Ring 0 灰度系统。先关闭 v2.3.1 工程门禁与生产一致性缺口，再按 1→2→2 批次迁移并连续观察 7 天。继续使用单 Master 192.168.102.104；不部署第二 Master，不进入 Ring 1。
todos:
  - id: phase-0
    content: 关闭 v2.3.1 工程门禁缺口，修复格式检查、真实 PostgreSQL Migration CI 和过期证据引用
    status: completed
  - id: phase-1
    content: 实现 Request-scoped Unit of Work、持久化幂等、Observation 和 Incident
    status: completed
  - id: phase-2
    content: 修复 Job Lease、JID 恢复、Enrollment 重复调用、Operation 映射和 Returner Contract
    status: completed
  - id: phase-3
    content: 将真实 Windows Handover Hooks、Runtime Rollback 和 Work Probe 接入 Salt Extension
    status: completed
  - id: phase-4
    content: 实现 5 台 Target Snapshot、1→2→2 批次、三方审批、自动暂停和分级回滚
    status: completed
  - id: phase-5
    content: 完成 Persistent Observer、Endpoint Status、Metrics、Evidence 和真实 Live Canary
    status: completed
  - id: phase-6-manual
    content: 人工执行 5 台 Ring 0 实机迁移、连续 7 天观察与 v2.5 Go-No-Go 签署；Cursor 不得自动完成，status 仅人工在签署后更新
    status: cancelled
isProject: false
---

# Cursor Implementation Plan — Salt Migration v2.4

## 1. 执行依据

- PRD：[`prd/v2.4.md`](prd/v2.4.md)
- 工程闭环 Commit：`593f80f`（`Work PRD v2.4 : Pilot Orchestration & 5-Endpoint Controlled Rollout`）
- 唯一 Salt Master：`192.168.102.104`
- 当前 Live 决策：`NO-GO`（见 [`docs/salt/evidence/v2.4/STATUS.md`](docs/salt/evidence/v2.4/STATUS.md)）
- 后续修复计划：[`.cursor/plans/salt_v2.4.1_live_ring0_closure.plan.md`](.cursor/plans/salt_v2.4.1_live_ring0_closure.plan.md)

开始前阅读：

- [`AGENTS.md`](AGENTS.md)
- [`services/salt-control/AGENTS.md`](services/salt-control/AGENTS.md)
- [`apps/work/AGENTS.md`](apps/work/AGENTS.md)
- [`docs/adr/ADR-026-salt-endpoint-control-plane.md`](docs/adr/ADR-026-salt-endpoint-control-plane.md)
- [`docs/adr/ADR-030-runtime-endpoint-decommission.md`](docs/adr/ADR-030-runtime-endpoint-decommission.md)
- [`prd/v2.4.md`](prd/v2.4.md)
- [`docs/salt/evidence/v2.4/STATUS.md`](docs/salt/evidence/v2.4/STATUS.md)
- [`docs/salt/evidence/v2.4/ring0/TEMPLATE/V2.5-GO-NO-GO.md`](docs/salt/evidence/v2.4/ring0/TEMPLATE/V2.5-GO-NO-GO.md)

固定边界：

- 不部署第二 Master。
- 不实施 MultiMaster-PKI 和双向故障转移。
- 不进入 Ring 1。
- 不删除 [`services/runtime`](services/runtime)。
- Salt 不进入 [`apps/work`](apps/work) Chat Data Plane。
- Cursor/CI 只能设置 `implemented`，不得设置人工 `proven`。
- 现有未跟踪文件属于用户，禁止清理或覆盖。
- 不修改或伪造历史实机证据。

状态与人工边界：

- `phase-0` 至 `phase-5` 为工程任务；证据状态以 [`docs/salt/evidence/v2.4/STATUS.md`](docs/salt/evidence/v2.4/STATUS.md) 为准，已校验为 `implemented` → todo `completed`。
- `phase-6-manual` 为纯人工 Phase：Cursor 不得执行其 Runbook 任何步骤，不得将其 `status` 改为 `in_progress` 或 `completed`。
- `phase-6-manual` 的 `status` 仅允许人工在 v2.5 Go/No-Go 签署完成后更新为 `completed`。
- 任何 `not_proven` → `proven` 的变更只能由授权签署人完成。
- v2.3.1 实机 Manual Gate 仍为 `not_proven`；不得因本计划工程完成而自动写成 `proven`。

## 2. 当前基线（校验结果）

校验来源（2026-08-13）：

- Evidence：[`docs/salt/evidence/v2.4/STATUS.md`](docs/salt/evidence/v2.4/STATUS.md)
- 工程 Commit：`593f80f`
- 代码抽样：`get_uow` / `ring0_service` / `smc_handover.migrate` / `salt-control-ci.yml` PostgreSQL

| Phase | Evidence | Todo 判定 |
| --- | --- | --- |
| 0 CI / format / alembic / docs | `implemented`（v2.3.1 Manual Gate 仍 `not_proven`） | `completed` |
| 1 Request UoW / persistence / idempotency | `implemented` | `completed` |
| 2 Job lease / JID / mapping / returner | `implemented` | `completed` |
| 3 Real handover hooks / migrate modules | `implemented` | `completed` |
| 4 Ring 0 orchestrator 1→2→2 + approvals | `implemented` | `completed` |
| 5 Observer / endpoint status / live canary | `implemented` | `completed` |
| 6 Live 5-endpoint + 7d observation | `manual_gate / not_proven` | `phase-6-manual` = `pending` |

补充事实：

- Live Ring 0 证据目录仅有 [`docs/salt/evidence/v2.4/ring0/TEMPLATE/`](docs/salt/evidence/v2.4/ring0/TEMPLATE/)，无真实 `<rollout-id>/<date>/` 归档。
- v2.4.1 已识别并修复若干生产缺口；本 v2.4 plan 工程 todo 仍按 v2.4 Evidence `implemented` 关闭，Live 继续挂在 `phase-6-manual`。

## 3. Phase 0 — Gate 与 CI

### 目标

关闭格式/CI/迁移工程门禁，修正单 Master 文档边界；不伪造 v2.3.1 实机 proven。

### 修改

- 格式化 Salt Control 失败文件。
- [`.github/workflows/salt-control-ci.yml`](.github/workflows/salt-control-ci.yml) 增加 PostgreSQL Service 与 alembic cycle。
- Alembic Upgrade → Downgrade → Upgrade。
- 修正 v2.3.1 baseline Commit / Workflow 引用。
- 修正 Master README 单 Master Ring 0 边界；`failover.conf` 不进入 v2.4 单 Master 部署清单。
- Test/Lab 增加单 Fake Master Composition。

### 人工门禁（非本 Phase todo；仍 `not_proven`）

- 首台 migrate / rollback / remigrate
- 24h Observation
- Master Restore
- Runtime Fallback
- Live Canary
- 三方签署

### 退出条件

- [x] CI 工程门禁通过（Evidence：Phase 0 `implemented`）
- [ ] v2.3.1 Go-No-Go = GO（仍 `not_proven`，不阻塞本 Phase 工程关闭，但阻塞 Live GO）

## 4. Phase 1 — Production Persistence

### 目标

Request-scoped UoW、Worker 短事务、Observation/Incident 持久化与幂等 digest。

### 修改

- [`services/salt-control/src/api/deps.py`](services/salt-control/src/api/deps.py)：`get_uow()` / `get_request_services()`
- [`services/salt-control/src/app.py`](services/salt-control/src/app.py)：AppState 仅保留 Settings / Engine / Session Factory / Adapters / Worker Handles
- Workers：[`enrollment_worker.py`](services/salt-control/src/workers/enrollment_worker.py)、[`job_worker.py`](services/salt-control/src/workers/job_worker.py)、[`observer.py`](services/salt-control/src/workers/observer.py)
- Migration：[`services/salt-control/migrations/versions/20260812_v24_ring0.py`](services/salt-control/migrations/versions/20260812_v24_ring0.py)
  - `rollout_approvals` / `rollout_observations` / `endpoint_observations` / `control_plane_incidents` / `rollout_target_jobs`
- Idempotency：Rollout/Secret 走 `repos.idempotency`，冲突 409

### 测试

- API 双实例幂等、双 Worker 并发、服务重启恢复、PostgreSQL Integration

### 退出条件

- [x] Evidence Phase 1 = `implemented`

## 5. Phase 2 — Salt Job Correctness

### 目标

Typed Payload、唯一 Invocation 映射、Lease/JID 恢复、Enrollment 单 JID、Returner Contract。

### 修改

- Payload Discriminated Union（Install/Upgrade/Configure/GatewayLifecycle/Probe/Handover/Rollback）
- [`services/salt-control/src/services/invocation.py`](services/salt-control/src/services/invocation.py) 唯一映射
- Lease：发布后立即存 JID；独立事务续租；有 JID 只 Poll
- Enrollment：删除 local_async 后再同步 Helper 的路径；每 Step 存 JID
- Returner：`items` / `payloadRedacted`；Poll/Return 并发幂等

### 退出条件

- [x] Evidence Phase 2 = `implemented`

## 6. Phase 3 — Real Handover

### 目标

真实 Windows Handover / Runtime Rollback / Work Probe；生产禁止 Stub。

### 修改

- [`infra/salt/extensions/_modules/smc_handover.py`](infra/salt/extensions/_modules/smc_handover.py)：`migrate` / `remigrate` / 强化 `rollback`
- [`infra/salt/extensions/_utils/smc_handover_hooks.py`](infra/salt/extensions/_utils/smc_handover_hooks.py)
- [`infra/salt/client/windows/production_hooks.py`](infra/salt/client/windows/production_hooks.py)
- Owner 切换后失败自动恢复 Runtime；Marker 仅在 Work Probe 成功后写 `COMPLETED`

### 退出条件

- [x] Evidence Phase 3 = `implemented`

## 7. Phase 4 — Ring 0 Orchestrator

### 目标

5 台 Target Snapshot、1→2→2、三方审批、自动暂停、分级回滚。

### 修改

- [`services/salt-control/src/services/ring0_service.py`](services/salt-control/src/services/ring0_service.py)
- [`services/salt-control/src/api/v1/ring0.py`](services/salt-control/src/api/v1/ring0.py)
- Batch：1 / 2 / 2；每批最少 24h；全部完成后进入 7d observing
- Approval：`release_owner` / `platform_owner` / `security_owner`
- Pause：Master 180s / P0-P1 / Secret Leak / Signature Bypass / Owner Conflict / Duplicate Publish / SLO 失败
- Rollback：`target` / `batch` / `rollout`，全部写 Audit

### 退出条件

- [x] Evidence Phase 4 = `implemented`

## 8. Phase 5 — Observation 与 Evidence

### 目标

持久化观察窗口、Endpoint Status、Metrics、Evidence 模板与 Live Canary 工程路径。

### 修改

- Observer 持久化 15m / 1h / 6h / 24h / 7d
- Endpoint Status：rollout / gateway_health / owner / release / revision / target state
- Evidence 输出根：`docs/salt/evidence/v2.4/ring0/<rollout-id>/<date>/`
- 模板：[`docs/salt/evidence/v2.4/ring0/TEMPLATE/`](docs/salt/evidence/v2.4/ring0/TEMPLATE/)

### 退出条件

- [x] Evidence Phase 5 = `implemented`
- [ ] 真实 Live Canary Evidence = `proven`（属人工，不关闭本 Phase 工程 todo）

## 9. Phase 6 — Live Ring 0（人工）

执行 Runbook：

1. 冻结 5 台 Target。
2. 签署三方审批。
3. Batch 1 / 24h。
4. Batch 2 / 24h。
5. Batch 3。
6. 全部 5 台观察 7d。
7. 受控 Rollback 1 台并恢复。
8. 最终签署 v2.5 Go/No-Go。

任何失败：

- 自动 Pause。
- 禁止新增 Target。
- 保留 Runtime Fallback。
- 未达门禁不得进入下一批次。

### Cursor 约束

- 不代替操作员执行未授权生产变更，不执行本 Phase Runbook 任何步骤。
- 不把 `phase-6-manual` 的 TODO 自动改为 `completed`。
- 不把 Template 或 Dry Run 写成 Live Evidence。
- 不把任何 `not_proven` 自动改为 `proven`。
- 仅可生成 Runbook 检查清单、Evidence 模板与脚本骨架，且必须标注 `template`。

### 退出条件（全部人工判定）

- [ ] 5 台 1→2→2 批次证据齐备。
- [ ] 受控单 Endpoint Rollback → Verify → Remigrate 证据齐备。
- [ ] 连续 7 天有效观察完整。
- [ ] 三方最终 Signoff 完成。
- [ ] v2.5 Go/No-Go 已签署归档。

## 10. CI / 验证命令

Salt Control（[`services/salt-control`](services/salt-control)）：

```text
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
uv run alembic upgrade head
uv run alembic downgrade base
uv run alembic upgrade head
```

Salt Infra（[`infra/salt`](infra/salt)）：

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

Work（[`apps/work`](apps/work)）：

```text
npm exec vitest run -- tests/enterprise-salt-mode.test.ts tests/hermes-availability-backend.test.ts tests/runtime-adapter.test.ts tests/chat-messages.test.ts tests/chat-runs.test.ts tests/sessions-history-items.test.ts tests/session-attachment-store.test.ts src/main/files/attachment-adapter.test.ts src/main/files/file-security.test.ts
lat check
```

## 11. DoD

工程（已由 Evidence Phase 0–5 `implemented` 支持）：

- [x] Format 和 PostgreSQL CI 通过。
- [x] Request-scoped UoW 生效。
- [x] Worker 无长期数据库事务。
- [x] Lease 周期续约 / Reclaim by JID / Enrollment 单 JID。
- [x] Operation 映射真实可执行。
- [x] Returner Contract 闭环。
- [x] 真实 Handover Hooks（工程路径）。
- [x] Rollout / Approval / Observation 持久化。
- [x] 5 台 Target Snapshot / 1→2→2 / Pause-Resume / Rollback（工程路径）。

人工（仍 open）：

- [ ] v2.3.1 Manual Gate proven。
- [ ] Work 关键流程 Live proven。
- [ ] 7 天 SLO Live proven。
- [ ] Runtime fallback Live proven。
- [ ] v2.5 Go-No-Go 签署。
- [ ] Phase 6 只有人工 Live Evidence 完成后才允许完成。
