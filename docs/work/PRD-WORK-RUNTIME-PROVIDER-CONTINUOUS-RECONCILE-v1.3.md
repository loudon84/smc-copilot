---
title: "smc-copilot Runtime Provider Continuous Reconcile v1.3 方案 PRD"
subtitle: "NodeDeskClaw Control Plane 自动收敛：定时刷新、Sleep/Resume 恢复、退避与企业模型变更自动生效"
prd_id: "PRD-WORK-RUNTIME-PROVIDER-CONTINUOUS-RECONCILE-V1.3"
version: "1.3"
status: "REVIEW"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "22e61a07349758722d71b8665fd2a7cb14bfa093"
extends:
  - "PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.0.md @ v1.1"
  - "PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.2-CLOSURE-RECONCILE.md"
external_contract_repository: "loudon84/nodeskclaw"
external_contract_branch: "main"
external_contract_commit: "7abb73e90e163f85257208ac4aa58e4914d2da6e"
owner: "Work Platform / Runtime Provider"
reviewers: ["Product", "Architecture", "Desktop Main", "Hermes Runtime", "Backend Integration", "Security", "QA"]
created_at: "2026-09-27"
updated_at: "2026-09-27"
target_release: "Runtime Provider Continuous Reconcile v1.3"
change_type: ["NEW_FEATURE", "BROWNFIELD_CHANGE", "INTEGRATION", "GOVERNANCE"]
golden_consumer: "smc-copilot apps/work + NodeDeskClaw Runtime Bootstrap + local Hermes Gateway + enterprise NEW-API"
related_docs:
  - "需求PRD工程模板.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.0.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.2-CLOSURE-RECONCILE.md"
  - ".cursor/plans/runtime_closure_plan_83bd9e83.plan.md"
supersedes: null
---

# 0. PRD 使用原则

本 PRD 严格按《需求PRD工程模板.md》v1.0 编写，作为 **Human + AI Coding Machine-Executable Engineering Contract**。

本轮不重构 Runtime Provider 主链，只在 v1.2 已完成的 Bootstrap、Managed Secret、Provider/Model Projection、Operation Coordinator、Transaction/Rollback、Projection Integrity、State Push 与 Explicit Refresh 之上增加 **Control Plane Continuous Reconcile**。

## 0.1 Delta Priority

```text
§0.6 Grilling 决定 RPB-R-01～RPB-R-09
  > 本 PRD v1.3 其余明确 MODIFY / ADD 的语义
  > v1.2 Grilling 决定 RPB-C-01～RPB-C-07
  > v1.2 其余语义
  > v1.1 Parent PRD
  > 当前源码行为
```

`RPB-R-01`～`RPB-R-09` 覆盖本文后文与之冲突的句子。

v1.3 仅覆盖 v1.2 的一项 Non-goal：

```text
v1.2 NON-GOAL-007:
  MUST NOT 增加固定周期后台轮询。

v1.3:
  MUST 增加受生命周期约束、可退避、可合并的 Runtime Provider Reconcile Scheduler。
```

v1.2 其它 Non-goal 与安全边界继续有效。

## 0.2 强制关键词

`MUST / MUST NOT / SHOULD / SHOULD NOT / MAY` 按工程模板定义。所有 `MUST / MUST NOT` MUST 映射至少一个 Acceptance。

## 0.3 No-Inference Rule

若 Plan/Coding Agent 无法从本文唯一确定 Scheduler 启停、周期、jitter、退避、Sleep/Resume、与 Login/Manual/Logout 的冲突、Busy Skip、STALE_ACTIVE、NOT_READY recovery、Secret scope 或 Release Gate，则：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT 自行补全
```

## 0.4 Source Integrity Gate

```text
repo: loudon84/smc-copilot
branch: work/prd-v6.2.1
commit: 22e61a07349758722d71b8665fd2a7cb14bfa093

external repo: loudon84/nodeskclaw
branch: main
commit: 7abb73e90e163f85257208ac4aa58e4914d2da6e
endpoint: POST /api/v1/runtime/model-bootstrap
```

进入 `APPROVED_FOR_PLAN` 前 MUST：

```text
1. 检查当前 HEAD 与 22e61a0... 的 impact diff。
2. 确认 v1.2 Runtime Provider Contract 未发生不兼容改变。
3. 确认 NodeDeskClaw Runtime Bootstrap Contract 未发生不兼容改变。
4. 确认 v1.2 L4 Golden Consumer 已有真实 PASS Evidence。
5. 若 v1.2 L4 仍为 BLOCKED，本 PRD MUST 保持 REVIEW，MUST NOT 生成实施 Plan。
```

## 0.5 当前 Gate 判定

当前 `22e61a0...` 实施计划明确规定 L4 Golden 未执行时保持 BLOCKED，Synthetic Fixture 不能替代 Golden。因此本文当前状态固定为：

```text
REVIEW
```

设计评审可以继续；Plan Generation 必须等待 v1.2 L4 Golden PASS。§0.6 的 Grilling 决定不改变这条 Gate。

## 0.6 Grilling 决定（最高优先级）

2026-09-27 grilling 确认。profile 比较沿用现有约定：空字符串和文件侧 `undefined` 都等于 `"default"`。被接受的结果指本次 `bootstrapRuntimeProvider` 返回时 generation 仍等于当前值。

```text
RPB-R-01
RuntimeProviderReconcileScheduler 只收敛当前 active profile。
定时触发和休眠恢复在发起读取时读取当时的 active profile。
切换 active profile 时，现有 profile_switch 负责新 profile 的第一次收敛。
没有成为 active profile 的本机 profile 不进入轮询。

RPB-R-02
被接受的结果为 RUNTIME_BOOTSTRAP_UNAVAILABLE 时，
Scheduler 进入 BACKOFF。
第一次不可达的下一轮延迟是 60 秒加 0～30 秒抖动。
被接受的结果为 READY，或明确的 NOT_READY 时，
Scheduler 进入 SCHEDULED，下一轮为 300 秒加 0～60 秒抖动。
schema 非法、仍保留 session 的 Unauthorized，以及其它确定性 ERROR，
同样进入 SCHEDULED，下一轮为 300 秒加 0～60 秒抖动。

RPB-R-03
登录、Session Restore、手动刷新、profile_switch、
scheduled_reconcile、resume_reconcile、local_reentry
都按被接受的结果重排下一轮。
lastAttemptAt、consecutiveUnavailable、nextDueAt 在同一次被接受的结果上写入。

RPB-R-04
connection mode 切回 local 且存在 stored session 时，
只发起一次 reason=local_reentry 的收敛。
现有 bootstrapRuntimeProvider("switch-local") 调用 MUST 删除。
startHermesBootstrapAsync() 保留。

RPB-R-05
public state 为 FETCHING、APPLYING 或 CLEARING 时，
到期的 scheduled 或 resume trigger 只记录 SKIPPED_BUSY。
MUST NOT beginRuntimeIntent。
MUST NOT 修改 consecutiveUnavailable。
MUST NOT 武装新的 due。
由仍在进行的那次读取的被接受结果单独排下一轮。

RPB-R-06
consecutiveUnavailable 是进程级计数。
被接受的 RUNTIME_BOOTSTRAP_UNAVAILABLE 加一。
被接受的 READY 或明确 NOT_READY 归零。
确定性 ERROR、Busy Skip、profile 切换动作本身不归零。
档位仍是第 1 次 60 秒、第 2 次 120 秒、第 3 次及以后 300 秒，各加 0～30 秒抖动。

RPB-R-07
Scheduler 已有资格运行，public state 不是 FETCHING、APPLYING、CLEARING，
且 lastAttemptAt 缺失时，Electron resume 视为已超过 60 秒门槛，
发起一次 resume_reconcile。
resume 遇到这三种过渡态时先执行 RPB-R-05，不另开第二次读取。
now - lastAttemptAt < 60 秒时保留现有 timer。
now - lastAttemptAt >= 60 秒时发起一次 resume_reconcile。
一次 Resume 最多一个 reconcile，不按休眠时长补跑多个 timer。

RPB-R-08
app quitting 时 stop Scheduler 并清掉 pending timer。
进行中的 scheduled_reconcile、resume_reconcile、local_reentry
MUST 被 generation 取代，回滚自己的 T0，MUST NOT set ACTIVE。
进行中的登录、手动刷新、profile_switch 按各自生命周期收尾。

RPB-R-09
只有返回时 generation 仍是当前值，且当时 connection mode 为 local、
stored session 仍在、应用未处于 quitting 的结果，
才可以写入 lastAttemptAt、consecutiveUnavailable 和 nextDueAt。
写入前先清掉已有 one-shot timer。
被取代的结果不修改这三个值，也不武装 timer。
logout 或 quit 使资格消失后，不再排下一轮。
```

---

# 1. 文档元数据与当前源码基线

## 1.1 当前 HEAD

```text
work/prd-v6.2.1
HEAD = 22e61a07349758722d71b8665fd2a7cb14bfa093
```

该提交已经完成 v1.2 Closure 的主要源码：

```text
runtime-provider-operation-coordinator.ts
runtime-provider-transaction.ts
runtime-provider-integrity.ts
runtime-provider-orchestrator.ts
runtime-provider-state.ts
IPC / Preload State Event
Chat Runtime UX / Refresh
相关测试
```

## 1.2 当前 Runtime Provider 行为

```text
Session Restore → bootstrapRuntimeProvider("restore")
Login           → bootstrapRuntimeProvider("login")
Manual Refresh  → bootstrapRuntimeProvider("refresh")
Logout          → clearRuntimeProvider("logout")
```

普通 JWT `auth:refresh` 只刷新 NodeDeskClaw JWT，不自动 Runtime Bootstrap。当前不存在 periodic reconcile、resume-triggered reconcile、自动 NOT_READY→READY recovery timer、STALE_ACTIVE retry scheduler。

## 1.3 当前 Coordinator 可复用

现有 Coordinator 已提供：

```text
beginRuntimeIntent(reason)
runtimeIntentCurrent(generationId)
enqueueRuntimeMutation(generationId, work)
logoutIntentIsWaiting()
```

v1.3 Scheduler MUST 复用现有 Orchestrator/Coordinator，不得建立第二套 projection/mutation 管理器。

## 1.4 当前 Orchestrator 已具备收敛语义

```text
READY + exact MATCH                → no-op
READY + drift/revision/secret change → repair/restart
ACTIVE + transport unavailable     → STALE_ACTIVE
explicit NOT_READY                 → purge → NOT_READY
logout                             → purge → UNBOUND
```

v1.3 只负责确定性地触发现有收敛函数。

---

# 2. 一句话目标

让 **已登录 NodeDeskClaw、使用 Local Hermes 的 smc-copilot 用户** 在无需重新登录或手动点击“刷新企业模型”的情况下，由 Desktop Main Process 周期性且低负载地重新获取当前用户 Runtime Bootstrap，使管理员完成的 **凭证禁用/启用、Token 轮换、模型集合调整、默认模型调整** 能在明确 Freshness SLA 内自动收敛到本机 Hermes，同时保证 NodeDeskClaw 仍只属于 Control Plane、Member Key 仍不落盘、Control Plane 暂时故障时既有 Data Plane 不被误撤销。

---

# 3. 背景与问题定义

## 3.1 Current State

v1.2 已完成登录同步、启动恢复同步、手动刷新、状态 Push、并发串行化和 Projection Integrity，但长时间运行时 Backend Desired State 不会被 Desktop 主动再次读取。

## 3.2 Problem

```text
P-001 Desired State 与 Desktop Applied State 没有持续收敛。
P-002 管理员禁用 MemberToken 后，本机生效依赖用户行为。
P-003 Token 轮换后，本机不会自动更新 Hermes child secret。
P-004 Models/default_model 调整后 Picker/Runtime 可能长期停留旧状态。
P-005 STALE_ACTIVE 缺少自动恢复路径。
P-006 Laptop Sleep 后普通 timer 无法证明 freshness。
P-007 直接 setInterval 可能与 foreground intent 抢占并形成请求尖峰。
P-008 企业规模下必须 jitter + backoff。
```

## 3.3 Impact

```text
业务：管理员配置无法自然同步到正在运行的员工桌面端。
安全：凭证禁用的本地生效窗口不可控。
运维：Token/Model 变更容易形成“后台已改、本机仍旧”。
工程：Manual Refresh 不应承担长期状态同步职责。
规模：数百 Desktop 固定同一时刻请求会产生尖峰。
```

---

# 4. Scope

## 4.1 In Scope

```text
SCOPE-001 Main-process RuntimeProviderReconcileScheduler。
SCOPE-002 5 分钟 Normal Reconcile Interval。
SCOPE-003 每周期 0～60 秒随机 jitter。
SCOPE-004 transport unavailable 的 60s→120s→300s backoff。
SCOPE-005 App Resume freshness reconcile。
SCOPE-006 Local + Authenticated 生命周期绑定。
SCOPE-007 Logout / 非 Local mode 确定性停止 Scheduler。
SCOPE-008 调用现有 bootstrapRuntimeProvider()。
SCOPE-009 与现有 Coordinator / generation 协同。
SCOPE-010 transient state Busy Skip。
SCOPE-011 NOT_READY 自动发现 READY。
SCOPE-012 STALE_ACTIVE 自动恢复 ACTIVE。
SCOPE-013 Token / Model / Default 变更自动收敛。
SCOPE-014 Reconcile Observability。
SCOPE-015 Synthetic + Golden Consumer 验收。
```

## 4.2 Out of Scope

```text
NON-GOAL-001 MUST NOT 修改 NodeDeskClaw Bootstrap API。
NON-GOAL-002 MUST NOT 修改 Hermes Agent Core。
NON-GOAL-003 MUST NOT 修改 NEW-API。
NON-GOAL-004 MUST NOT 将 NodeDeskClaw 放入 inference Data Plane。
NON-GOAL-005 MUST NOT 增加第二 Model Provider。
NON-GOAL-006 MUST NOT 引入 NEW-API model_limits。
NON-GOAL-007 MUST NOT 增加 WebSocket/SSE 服务端推送 Contract。
NON-GOAL-008 MUST NOT 在 Renderer 执行 polling。
NON-GOAL-009 MUST NOT 把 Scheduler 状态持久化为新 SOT。
NON-GOAL-010 MUST NOT 持久化 Member Key。
NON-GOAL-011 MUST NOT 删除 Manual Refresh。
NON-GOAL-012 MUST NOT 在 Control Plane 暂不可达时主动清除 ACTIVE Credential。
NON-GOAL-013 MUST NOT fallback 到 hermesone/本地 Provider。
NON-GOAL-014 MUST NOT 增加用户可修改的轮询频率设置。
```

## 4.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Desired Runtime | NodeDeskClaw | member/admin config | Bootstrap | Desktop scheduling |
| Scheduler | smc-copilot Main | auth/mode/time/resume | reconcile intent | projection |
| Orchestrator | smc-copilot Main | reconcile intent | Runtime State | timer |
| Coordinator | smc-copilot Main | operation | serial mutation | schedule |
| Projection | existing v1.2 | READY | provider/models/secret | polling |
| Runtime | Hermes | applied provider/secret | inference | Backend auth |
| Data Plane | NEW-API | Member Key/model | LLM response | Desktop schedule |

---

# 5. Terminology / Domain Model

| Term | Definition |
|---|---|
| Continuous Reconcile | Desktop 周期性重新读取 Bootstrap 并收敛 Runtime |
| Normal Interval | 成功 fetch 后到下一轮的基础周期，300000ms |
| Jitter | 为打散客户端请求增加的随机延迟 |
| Transient Backoff | `RUNTIME_BOOTSTRAP_UNAVAILABLE` 后的恢复重试 |
| Scheduled Trigger | timer 到期触发 |
| Resume Trigger | Electron power resume 后触发 |
| Foreground Trigger | login/restore/manual/logout 等现有生命周期操作 |
| Stable State | ACTIVE/STALE_ACTIVE/NOT_READY/ERROR/UNBOUND |
| Transient State | FETCHING/APPLYING/CLEARING |
| Freshness SLA | Backend 可达、App awake 时 Desired State 被观察的最大正常窗口 |
| Scheduler State | STOPPED/SCHEDULED/RUNNING/BACKOFF，仅 Main memory |
| Successful Control Fetch | 成功取得 READY 或 NOT_READY Contract |

---

# 6. System Context

## 6.1 Context Diagram

```text
NodeDeskClaw Backend
       ▲ Bootstrap
       │
RuntimeProviderReconcileScheduler
       ├─ every 5m + jitter
       ├─ resume
       └─ backoff
       │
       ▼
bootstrapRuntimeProvider("scheduled_reconcile" | "resume_reconcile")
       │
       ▼
Existing Orchestrator + Coordinator
       ├─ MATCH → NO-OP
       ├─ Changed → Apply/Restart
       ├─ Transport Fail → STALE_ACTIVE
       └─ NOT_READY → Purge
       │
       ▼
Local Hermes Gateway ──DIRECT──> Enterprise NEW-API
```

## 6.2 Invariant

```text
Scheduler only decides WHEN to reconcile。
Orchestrator remains the only owner of WHAT reconciliation means。
```

Scheduler MUST NOT direct-write files/models/secrets、restart Gateway、purge 或调用 NEW-API。

---

# 7. Authoritative State / Source of Truth

| State | Role | Authoritative? | Writer | Reader | Persist |
|---|---|---:|---|---|---:|
| Auth session | IDENTITY | YES | Auth | Scheduler | existing |
| Connection mode | DESIRED | YES | Config | Scheduler | existing |
| Bootstrap Contract | DESIRED_STATE | YES | NodeDeskClaw | Orchestrator | NO |
| Runtime public state | RUNTIME_STATE | YES local | Orchestrator | Scheduler/UI | NO |
| Scheduler state | RUNTIME_STATE | YES local | Scheduler | Scheduler/Test | NO |
| lastAttemptAt | RUNTIME_STATE | YES local | Scheduler | Scheduler | NO |
| lastSuccessfulFetchAt | RUNTIME_STATE | YES local | Scheduler | Scheduler | NO |
| consecutiveUnavailable | RUNTIME_STATE | YES local | Scheduler | Scheduler | NO |
| nextDueAt | RESOLVED_STATE | YES local | Scheduler | Scheduler | NO |
| Managed Projection | LAST_APPLIED_STATE | NO | Orchestrator | Hermes | existing |
| Member Key | RUNTIME_SECRET | YES Backend | Secret Store | Hermes | NO |

Process restart MAY reset Scheduler timestamps；Session Restore Bootstrap MUST 重建 freshness。

---

# 8. State Machine

## 8.1 Scheduler State

```text
STOPPED
  │ local + authenticated
  ▼
SCHEDULED
  │ due/resume-due
  ▼
RUNNING
  ├─ success/NOT_READY ─► SCHEDULED
  ├─ unavailable ───────► BACKOFF
  ├─ session invalid ───► STOPPED
  └─ runtime busy ──────► 不武装新 due，等进行中的结果按 RPB-R-09 排期

BACKOFF ──retry due──► RUNNING
```

## 8.2 Start/Stop

Start：

```text
connection.mode == local
AND stored NodeDeskClaw session exists
```

Stop：

```text
logout begins
OR stored session cleared
OR connection.mode != local
OR app quitting
```

Stop MUST clear pending timer，prevent new scheduled reconcile，MUST NOT 直接改变 Projection。
app quitting 的进行中后台收敛按 RPB-R-08 回滚。下一轮排期只按 RPB-R-09 写入。

## 8.3 Busy Skip

若 callback 看到：

```text
FETCHING | APPLYING | CLEARING
```

则 MUST NOT 调用 Bootstrap、MUST NOT 增加 generation、MUST NOT 武装新的 due。下一轮只由进行中的被接受结果写入。

---

# 9. Data / Schema Contract

## 9.1 Constants v1

```ts
NORMAL_INTERVAL_MS = 300_000
NORMAL_JITTER_MAX_MS = 60_000
TRANSIENT_BACKOFF_MS = [60_000, 120_000, 300_000]
BACKOFF_JITTER_MAX_MS = 30_000
RESUME_FRESHNESS_THRESHOLD_MS = 60_000
```

这些值 MUST 为 Main-side code constants；Renderer MUST NOT 修改；测试 MAY dependency-inject。

## 9.2 Normal Next Due

```text
nextDueAt = now + 300000 + randomIntInclusive(0, 60000)
```

正常 Freshness Observation Bound：

```text
<= 360 秒
```

前提：Backend reachable、App running/awake、auth valid。

## 9.3 Unavailable Backoff

```text
#1 → 60s  + 0..30s jitter
#2 → 120s + 0..30s jitter
#3+→ 300s + 0..30s jitter
```

成功 control fetch 后 counter=0。任何被接受的 `RUNTIME_BOOTSTRAP_UNAVAILABLE` 都加一，包括登录或恢复的第一次读取。写入规则以 RPB-R-06 与 RPB-R-09 为准。

## 9.4 Non-transient Error Cadence

`RUNTIME_BOOTSTRAP_SCHEMA_INVALID`、仍有 session 的 Unauthorized、其它确定性 ERROR 使用 normal interval + jitter；不得 aggressive 60s retry，也不改变 `consecutiveUnavailable`。若 Unauthorized 已导致 stored session 清除，Scheduler MUST STOP，并且不再武装 timer。成功的 READY 或明确 NOT_READY 把 `consecutiveUnavailable` 归零。计数规则以 RPB-R-06 为准。

## 9.5 Diagnostics Schema

Schema ID：`work.runtime-provider.reconcile-diagnostics.v1`

```json
{
  "schedulerState": "SCHEDULED",
  "lastTrigger": "scheduled_reconcile",
  "lastAttemptAt": 1790520000000,
  "lastSuccessfulFetchAt": 1790519900000,
  "nextDueAt": 1790520300000,
  "consecutiveUnavailable": 0
}
```

MUST NOT 包含 api_key、Authorization、JWT、secret prefix/fingerprint。

---

# 10. Requirement Unit

## REQ-SCHED-001 — Runtime Provider Reconcile Scheduler

### Goal
建立单一 Main-process 后台收敛调度器。

### Normative Requirement

```text
MUST 新增 RuntimeProviderReconcileScheduler。
MUST 只在 Local + Authenticated 条件下运行。
MUST 一个 Desktop process 最多一个 active timer。
MUST 使用 one-shot setTimeout/等价机制，不使用永久 setInterval。
MUST 每轮结束后根据结果计算 next due。
MUST NOT 自己写 Projection/Secret/Gateway。
MUST 只通过 bootstrapRuntimeProvider(reason, profile) 收敛。
MUST 在 scheduled_reconcile 与 resume_reconcile 发起时读取当前 active profile。
MUST NOT 轮询未激活的 profile。
MUST NOT 在 Renderer 执行 timer。
```

### Inputs
`connection mode / auth session / runtime public state / clock / random`

### Preconditions
v1.2 Orchestrator/Coordinator 已存在。

### Authoritative State
`Auth + Connection mode` 是 eligibility SOT。

### State Transition
`STOPPED → SCHEDULED → RUNNING → SCHEDULED/BACKOFF`

### Allowed Side Effects
Main memory timer、sanitized logs、经 Orchestrator 的 NodeDeskClaw request。

### Forbidden Side Effects
Direct file/SQLite/secret/Gateway mutation。

### Ownership Scope
`OBJECT: scheduler timer + diagnostics`

### Idempotency
重复 start 后 active timer count MUST remain 1。

### Failure Semantics
callback 自身失败：记录 sanitized error，按 Normal cadence 重新 schedule，scheduler direct mutation=0。

### Invariants

```text
INV-SCHED-001 one process <= 1 reconcile timer
INV-SCHED-002 scheduler is trigger-only
```

### Acceptance
`A-SCHED-001 / A-SCHED-002 / A-SCHED-003`

### Evidence
Fake-clock scheduler tests + network/mutation spies。

---

## REQ-LIFE-001 — Auth / Connection Lifecycle Binding

### Goal
Scheduler 生命周期严格绑定当前身份与 local mode。

### Normative Requirement

```text
MUST 在 Login 的首次 Runtime Bootstrap 被接受后启动 Scheduler。
MUST 在 Session Restore 的首次 Runtime Bootstrap 被接受后启动 Scheduler。
首次结果为 RUNTIME_BOOTSTRAP_UNAVAILABLE 时进入 BACKOFF，仍启动下一轮。
首次结果为 ERROR 的确定性错误，或 NOT_READY，或 READY 时进入 SCHEDULED，仍启动下一轮。
排期分类以 RPB-R-02、RPB-R-06、RPB-R-09 为准。
MUST 在 Logout 开始时先 stop Scheduler，再 clearRuntimeProvider("logout")。
MUST 在 stored session 清除时 stop。
MUST 在 connection mode 切离 local 时 stop。
MUST 在切回 local 且有 session 时 immediate reconcile + start。
MUST NOT 因普通 JWT auth:refresh 成功而无条件 restart Hermes。
```

### Inputs
Login / hydrate / logout / session change / connection mode change。

### Preconditions
Auth 与 Connection Config SOT 可读。

### Authoritative State
Stored session + connection mode。

### State Transition
`local+auth` 且被接受的结果为 READY、明确 NOT_READY 或确定性 ERROR → `SCHEDULED`；同一资格下结果为 `RUNTIME_BOOTSTRAP_UNAVAILABLE` → `BACKOFF`；`logout/non-local/no-session/quitting → STOPPED`。

### Allowed Side Effects
Start/stop timer；local re-entry immediate reconcile。

### Forbidden Side Effects
remote/ssh scheduled Bootstrap；logout 后重新 schedule。

### Failure Semantics
Scheduler start failure MUST NOT fail Portal Login；状态 STOPPED，记录诊断。

### Invariants

```text
INV-LIFE-001 no auth => no scheduled NodeDeskClaw request
INV-LIFE-002 non-local => no scheduled NodeDeskClaw request
```

### Acceptance
`A-LIFE-001 / A-LIFE-002 / A-LIFE-003 / A-LIFE-004`

---

## REQ-TIME-001 — Interval / Jitter / Backoff

### Goal
定义可证明的 Freshness 与企业请求负载边界。

### Normative Requirement

```text
MUST 使用 §9.1 固定常量。
MUST 每个正常周期重新生成 jitter。
MUST 在 RUNTIME_BOOTSTRAP_UNAVAILABLE 使用 60/120/300 秒 backoff。
MUST 在成功 control fetch 后清零 unavailable counter。
MUST NOT tight-loop。
MUST NOT 使用小于 60 秒的 production background cadence。
```

### Inputs
Orchestrator result / clock / random。

### Authoritative State
`nextDueAt` 为 Scheduler derived state。

### Failure Semantics
随机源失败时 jitter=0，MUST NOT block scheduling。

### Invariants

```text
INV-TIME-001 normal delay ∈ [300000, 360000] ms
INV-TIME-002 unavailable retry delay按 §9.3
```

### Acceptance
`A-TIME-001 / A-TIME-002 / A-TIME-003`

---

## REQ-RESUME-001 — Sleep / Resume Freshness Recovery

### Goal
Laptop 休眠恢复时立即重建 Control Plane freshness。

### Normative Requirement

Main Process MUST 订阅 Electron resume lifecycle。Resume 判定以 RPB-R-07 为准：

```text
if scheduler not eligible:
  no-op
else if public state in {FETCHING, APPLYING, CLEARING}:
  SKIPPED_BUSY
  MUST NOT arm a new due
else if lastAttemptAt missing OR now - lastAttemptAt >= 60_000:
  request resume_reconcile once
else:
  preserve existing next timer
```

并且：

```text
MUST NOT direct mutate Runtime。
MUST NOT 按 suspend duration 补跑多个 timer。
一次 Resume 最多一个 reconcile。
被接受的 resume_reconcile 才重排 next timer。
```

### Allowed Side Effects
被接受的 resume_reconcile 触发一次 Orchestrator reconcile，并按 RPB-R-09 重排 next timer。

### Failure Semantics
Resume reconcile unavailable → 正常 transient backoff。

### Acceptance
`A-RESUME-001 / A-RESUME-002`

---

## REQ-COAL-001 — Background Trigger Coalescing

### Goal
防止 background scheduler 干扰 foreground Runtime intent。

### Normative Requirement

Scheduled/Resume 在调用 Orchestrator 前 MUST 检查 public state。RPB-R-05 规定：

```text
FETCHING | APPLYING | CLEARING
→ SKIP_BUSY
→ MUST NOT beginRuntimeIntent
→ MUST NOT supersede foreground operation
→ MUST NOT 修改 consecutiveUnavailable
→ MUST NOT 武装新的 due
```

进行中的读取结束后，只由仍属当前 generation 且资格仍在的被接受结果，按 RPB-R-09 写入下一轮。

如果 background reconcile 已 RUNNING：

```text
后续 scheduled/resume trigger MUST coalesce
MUST NOT 创建第二个 background fetch
```

Foreground manual/login/logout：

```text
MAY supersede background operation
现有 generation semantics 继续适用
```

### Invariants

```text
INV-COAL-001 background cannot preempt foreground transient operation
INV-COAL-002 scheduled fetch concurrency <= 1
```

### Acceptance
`A-COAL-001 / A-COAL-002 / A-COAL-003`

---

## REQ-RECON-001 — Automatic Runtime Convergence

### Goal
企业模型 Desired State 在无人操作时自动生效。

### Normative Requirement

Scheduled/Resume MUST 复用 v1.2：

```text
READY + MATCH + same secret/revision
→ 0 file mutation
→ 0 Gateway restart
→ ACTIVE

READY + token/projection change
→ existing managed transaction
→ Gateway restart
→ ACTIVE

ACTIVE + transport unavailable
→ STALE_ACTIVE
→ preserve secret/projection/Gateway

STALE_ACTIVE + later READY
→ ACTIVE

NOT_READY + later READY
→ apply → ACTIVE

ACTIVE + explicit Backend NOT_READY
→ purge → NOT_READY
```

MUST NOT：

```text
把 transport failure 当 revoke
把 STALE_ACTIVE 自动 clear
绕过 Projection Integrity
```

### Authoritative State
Desired=Bootstrap；Applied=existing v1.2 projection；Observed=Runtime public state。

### Idempotency
Exact MATCH scheduled reconcile MUST 0 mutation/0 restart。

### Failure Semantics
完全沿用 v1.2 Orchestrator Failure Contract。

### Invariants

```text
INV-RECON-001 background trigger不改变 v1.2 reconciliation semantics
INV-RECON-002 Control Plane outage不主动撤销已有 ACTIVE runtime
```

### Acceptance
`A-RECON-001 / A-RECON-002 / A-RECON-003 / A-RECON-004`

---

## REQ-SEC-001 — Security Boundary Preservation

### Goal
后台同步不得扩大 Credential 暴露面。

### Normative Requirement

```text
MUST 继续使用 AuthorizedBackendTransport。
MUST 继续使用 memory-only ManagedRuntimeSecretStore。
MUST NOT 把 Member Key 放入 scheduler diagnostics。
MUST NOT 把 Member Key 放入持久 timer/scheduler state。
MUST NOT 通过 Renderer IPC 传 secret。
MUST NOT log secret/fingerprint/prefix/length。
MUST NOT 调用 NEW-API 做 control health check。
MUST NOT 代理 inference。
```

### Ownership Scope
Scheduler 只拥有无 secret 的 timer/diagnostics。

### Invariants

```text
INV-SEC-001 persistent Member Key occurrence == 0
INV-SEC-002 Renderer Scheduler payload Member Key occurrence == 0
```

### Acceptance
`A-SEC-001 / A-SEC-002 / A-SEC-003`

---

## REQ-OBS-001 — Reconcile Observability

### Goal
可区分 scheduler 没运行、Backend 不可达、Runtime busy、收敛成功。

### Normative Requirement

每次 background attempt MUST 记录：

```text
event=runtime_provider_reconcile
trigger=scheduled_reconcile|resume_reconcile|local_reentry
scheduler_state
attempt_at
result
runtime_state
backend_state
error_code
next_due_delay_ms
consecutive_unavailable
```

Result enum：

```text
START
SKIPPED_BUSY
NOOP_MATCH
RECONCILED
NOT_READY
STALE_ACTIVE
ERROR
STOPPED_INELIGIBLE
```

MUST NOT 包含任何 secret。

### Acceptance
`A-OBS-001 / A-OBS-002`

---

## REQ-GATE-001 — v1.2 Verification Dependency

### Goal
未证明基础链路真实可用前，不扩大后台自动化范围。

### Normative Requirement

v1.3 Plan Generation 前 MUST 有 v1.2 L4 Golden Evidence：

```text
NodeDeskClaw inference proxy request count == 0
NEW-API direct Chat == PASS
persistent/Renderer Member Key occurrence == 0
```

任一 `BLOCKED / SKIPPED / FAIL / missing`：

```text
v1.3 status MUST remain REVIEW
Plan Generation MUST BLOCK
```

### Acceptance
`A-GATE-001`

---

## REQ-EVID-001 — v1.3 Golden Consumer

### Goal
证明 Continuous Reconcile 在真实企业链路自动生效。

### Normative Requirement

Golden MUST 执行：

```text
1. Login，Runtime ACTIVE。
2. 记录 baseline revision/model/default。
3. NodeDeskClaw 管理端修改 default_model 或 models。
4. 不点击 Desktop Refresh，不重新登录。
5. 等待 <= 360 秒。
6. Desktop 自动 reconcile，Runtime ACTIVE，新配置生效。
7. 管理端 disable MemberToken。
8. 不点击 Refresh。
9. 等待 <= 360 秒。
10. Desktop 自动 NOT_READY，managed send blocked。
11. enable/rotate MemberToken。
12. 等待自动 reconcile。
13. Desktop ACTIVE，Hermes 使用新 Key。
14. 模拟 NodeDeskClaw 网络不可达。
15. 下一轮 reconcile → STALE_ACTIVE；既有 Hermes → NEW-API Chat 继续成功。
16. 恢复 NodeDeskClaw。
17. 自动 reconcile → ACTIVE。
```

### Acceptance
`A-EVID-001 / A-EVID-002 / A-EVID-003`

---

# 11. Side-Effect Contract

| Operation | NodeDeskClaw | NEW-API | File Write | Secret | Gateway | Timer |
|---|---:|---:|---:|---:|---:|---:|
| scheduler start | NO | NO | NO | NO | NO | YES |
| scheduled MATCH | YES | NO | NO | keep | NO | reschedule |
| scheduled changed | YES | NO | existing managed scope | replace if needed | YES | reschedule |
| scheduled unavailable | attempted | NO | NO | keep | keep | backoff |
| scheduled NOT_READY | YES | NO | existing purge semantics | clear | purge | normal |
| busy skip | NO | NO | NO | NO | NO | reschedule |
| resume due | via Orchestrator | NO | conditional | conditional | conditional | reschedule |
| logout stop | NO | NO | NO | NO | NO | clear |
| Chat | NO | YES via Hermes | existing | Hermes uses | NO | NO |

---

# 12. Ownership Contract

| Resource | Ownership |
|---|---|
| Bootstrap | EXTERNAL_AUTHORITY / NodeDeskClaw |
| Scheduler timer | GENERATED_ONLY / Main |
| Scheduler timestamps/counter | RUNTIME_STATE / Main |
| Runtime public state | Existing Orchestrator |
| Projection | Existing v1.2 |
| Secret | Existing ManagedRuntimeSecretStore |
| Gateway lifecycle | Existing RuntimeManager |
| Manual Refresh | Existing Runtime Provider UX |

Drift resolution MUST remain owned by Orchestrator；Scheduler only triggers。

---

# 13. Hash / Identity Contract

本 PRD不新增业务 Hash。

```text
Scheduler singleton = process-global RuntimeProviderReconcileScheduler
profile normalization = "" / undefined → "default"
Backend revision = opaque exact-string identity
```

Timer/Jitter MUST NOT 使用 Member Key、JWT、email、user id 作为随机种子或日志 identity。

---

# 14. Transaction Contract

Scheduler 不建立第二业务事务。Scheduled reconcile 的 mutation transaction MUST 完全委托 v1.2 Orchestrator。

Scheduler transaction：

```text
schedule one-shot timer
→ eligibility check
→ busy/coalesce check
→ trigger orchestrator
→ classify result
→ calculate next due
→ schedule next one-shot timer
```

Orchestrator 失败时 Scheduler MUST NOT 自行 rollback，MUST 根据 Orchestrator 最终 public state 安排下一周期。

---

# 15. Conflict Contract

| Conflict | Detection | Behavior | Mutation |
|---|---|---|---:|
| timer during FETCHING | runtime state | SKIP_BUSY，不武装新 due | 0 |
| timer during APPLYING | runtime state | SKIP_BUSY，不武装新 due | 0 |
| timer during CLEARING | runtime state | SKIP_BUSY，不武装新 due | 0 |
| resume + timer same tick | in-flight | coalesce | one attempt |
| manual starts before timer | transient state | timer skip，结果由 manual 写入 | manual only |
| timer starts before manual | generation | manual may supersede；被取代结果不改排期 | existing rollback |
| logout starts | stop + generation | no future timer | logout owns |
| switch remote/ssh | eligibility | stop | 0 |
| no auth | eligibility | stop | 0 |
| app quit during background reconcile | reason in scheduled/resume/local_reentry | supersede and rollback T0 | 0 new ACTIVE |
| overlapping completions | current generation + eligibility | only that result writes schedule | existing |

禁止：last-writer-wins timer logic、第二 projection writer、第二 secret store、background preempt foreground transient operation。

---

# 16. Compatibility / Migration

```text
DB migration: NONE
file schema migration: NONE
Bootstrap API migration: NONE
Provider schema migration: NONE
```

MUST 保留 Manual Refresh、Login/Restore/Logout、State Event、remote/ssh、hermesone、Provider Identity v2、v1.2 transaction/integrity。

关闭 v1.3 Scheduler 后 MUST 退化回 v1.2：login/restore/manual refresh 仍工作。因此 Scheduler SHOULD 是独立 Main module。

---

# 17. External Dependency Contract

## 17.1 NodeDeskClaw

```text
pin = 7abb73e90e163f85257208ac4aa58e4914d2da6e
POST /api/v1/runtime/model-bootstrap
```

无新 endpoint。

## 17.2 Electron

需要 Main lifecycle：

```text
powerMonitor resume
app before-quit / will-quit
```

Golden 主平台 Windows MUST 验证 resume。

## 17.3 Hermes / NEW-API

无新 Contract。

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| background request 泄露 Key | scheduler只触发 Bootstrap | A-SEC-001 |
| scheduler state持久化 secret | diagnostics allowlist | A-SEC-002 |
| Backend outage误撤销 | STALE_ACTIVE preserve | A-RECON-003 |
| logout 后 timer 再 bootstrap | stop-before-purge | A-LIFE-002 |
| remote mode仍 polling | eligibility stop | A-LIFE-003 |
| client stampede | jitter | A-TIME-001 |
| network outage hammer | backoff | A-TIME-002 |
| NodeDeskClaw进入 Data Plane | architecture Golden | A-EVID-003 |

# 19. Observability

每次 reconcile log MUST 使用结构化字段：

```json
{
  "event": "runtime_provider_reconcile",
  "trigger": "scheduled_reconcile",
  "scheduler_state": "RUNNING",
  "result": "NOOP_MATCH",
  "runtime_state": "ACTIVE",
  "backend_state": null,
  "error_code": null,
  "next_due_delay_ms": 331234,
  "consecutive_unavailable": 0
}
```

不得记录：api_key、Authorization、JWT、secret 派生信息。

关键可观察事件：

```text
SCHEDULER_START
SCHEDULER_STOP
SCHEDULED
RUN_START
SKIPPED_BUSY
RESULT
BACKOFF
RESUME_TRIGGER
COMPLETE
```

---

# 20. Acceptance Design Standard

## A-SCHED-001 — Singleton Timer

### Requirement Refs
`REQ-SCHED-001`

### Given
Local + authenticated，连续调用 start 三次。

### When
读取 fake timer queue。

### Then
仅一个 active due timer。

### Oracle

```text
active_timer_count == 1
```

### Evidence
`TEST-A-SCHED-001`

---

## A-SCHED-002 — Trigger-only Scheduler

### Requirement Refs
`REQ-SCHED-001`

### Given
Scheduler due。

### When
执行一次 callback。

### Oracle

```text
bootstrapRuntimeProvider call count == 1
direct file writer call count == 0
direct secret writer call count == 0
direct RuntimeManager.restart call count == 0
```

### Evidence
`TEST-A-SCHED-002`

---

## A-SCHED-003 — One-shot Reschedule

### Requirement Refs
`REQ-SCHED-001`

### Given
一次 reconcile 完成。

### Then
旧 timer 已消费且仅创建一个 next timer。

### Oracle

```text
pending_timer_count == 1
```

---

## A-LIFE-001 — Login/Restore Starts Scheduler

### Requirement Refs
`REQ-LIFE-001`

### Given
Local + valid stored session。

### When
Login 或 Restore 的首次 bootstrap 被接受。

### Then
ACTIVE、NOT_READY，以及确定性 ERROR，Scheduler=SCHEDULED。
结果为 RUNTIME_BOOTSTRAP_UNAVAILABLE 时，Scheduler=BACKOFF。

### Oracle

```text
unavailable: scheduler_state == BACKOFF
ready_or_not_ready_or_deterministic_error: scheduler_state == SCHEDULED
pending_timer_count == 1
```

---

## A-LIFE-002 — Logout Stops Before Purge

### Requirement Refs
`REQ-LIFE-001`

### Given
Scheduler active。

### When
Logout。

### Oracle

```text
ordered trace:
SCHEDULER_STOP < RUNTIME_CLEAR_INTENT
pending_timer_count == 0
post_logout scheduled_bootstrap_count == 0
```

---

## A-LIFE-003 — Remote/SSH Stops Scheduler

### Requirement Refs
`REQ-LIFE-001`

### When
Local → remote/ssh。

### Oracle

```text
scheduler_state == STOPPED
pending_timer_count == 0
scheduled Bootstrap after switch == 0
```

---

## A-LIFE-004 — Local Re-entry Reconciles

### Requirement Refs
`REQ-LIFE-001`

### Given
有有效 stored session，当前 remote/ssh。

### When
切回 local。

### Then
立即发起一次 `local_reentry` reconcile 并重新 schedule。

### Oracle

```text
bootstrap reason == local_reentry
scheduler eventual state in {SCHEDULED, BACKOFF}
```

---

## A-TIME-001 — Normal Delay Range

### Requirement Refs
`REQ-TIME-001`

### Given
成功 control fetch。

### Oracle

```text
300000 <= next_due_delay_ms <= 360000
```

随机源 fixture 分别验证 jitter=0、60000 与中间值。

---

## A-TIME-002 — Transient Backoff Sequence

### Requirement Refs
`REQ-TIME-001`

### Given
连续三次 `RUNTIME_BOOTSTRAP_UNAVAILABLE`。

### Oracle

```text
retry1 ∈ [60000, 90000]
retry2 ∈ [120000, 150000]
retry3 ∈ [300000, 330000]
```

第四次仍使用第三档上限。

---

## A-TIME-003 — Success Resets Backoff

### Requirement Refs
`REQ-TIME-001`

### Given
两次 unavailable 后一次 READY/NOT_READY 成功 fetch。

### Oracle

```text
consecutive_unavailable == 0
next delay uses normal interval range
```

---

## A-RESUME-001 — Stale Resume Triggers Once

### Requirement Refs
`REQ-RESUME-001`

### Given
eligible，且 `lastAttemptAt` 缺失，或 `now-lastAttemptAt >= 60000`。public state 不是 FETCHING、APPLYING、CLEARING。

### When
触发 resume。

### Oracle

```text
resume_reconcile bootstrap count == 1
```

---

## A-RESUME-002 — Fresh Resume Does Not Duplicate

### Requirement Refs
`REQ-RESUME-001`

### Given
`now-lastAttemptAt < 60000` 且已有 timer。

### When
resume。

### Oracle

```text
immediate bootstrap count == 0
pending timer identity/due preserved
```

---

## A-COAL-001 — Busy Scheduled Attempt Skips Without Generation

### Requirement Refs
`REQ-COAL-001`

### Given
Runtime state=APPLYING。

### When
scheduled timer fires。

### Oracle

```text
bootstrapRuntimeProvider count == 0
beginRuntimeIntent count == 0
result == SKIPPED_BUSY
consecutiveUnavailable unchanged
new due armed by this timer == 0
```

---

## A-COAL-002 — Resume + Timer Coalesce

### Requirement Refs
`REQ-COAL-001`

### Given
scheduled reconcile 已 RUNNING。

### When
同时收到 resume。

### Oracle

```text
max background reconcile in-flight == 1
```

---

## A-COAL-003 — Manual Refresh Wins

### Requirement Refs
`REQ-COAL-001`

### Given
background reconcile 已开始，随后用户 Manual Refresh。

### Then
foreground refresh MAY 通过现有 generation supersede background；最终状态属于最新 foreground intent。

### Oracle

```text
final runtime state generation == manual refresh generation
background cannot overwrite foreground result
superseded background result changes nextDueAt == false
superseded background result changes consecutiveUnavailable == false
```

---

## A-RECON-001 — Automatic Model/Default Change

### Requirement Refs
`REQ-RECON-001`

### Given
ACTIVE，Backend revision/models/default 已变化。

### When
scheduled reconcile。

### Oracle

```text
local managed model ids == Backend model ids
active default == Backend default_model
runtime state == ACTIVE
```

---

## A-RECON-002 — Automatic Token Rotation

### Requirement Refs
`REQ-RECON-001`

### Given
Projection MATCH，但 Backend api_key 已轮换。

### When
scheduled reconcile。

### Oracle

```text
managed file digest unchanged
memory secret changed
Gateway restart count == 1
state == ACTIVE
```

---

## A-RECON-003 — Control Plane Outage Preserves Data Plane

### Requirement Refs
`REQ-RECON-001`

### Given
ACTIVE，NodeDeskClaw 不可达，NEW-API 可达。

### When
scheduled reconcile fails unavailable。

### Then
STALE_ACTIVE，existing Chat remains usable。

### Oracle

```text
runtime state == STALE_ACTIVE
secret unchanged
managed projection digest unchanged
Gateway restart count == 0
Hermes→NEW-API chat == PASS
```

---

## A-RECON-004 — NOT_READY Auto-recovers

### Requirement Refs
`REQ-RECON-001`

### Given
Runtime=NOT_READY，后台管理员完成配置使 Bootstrap READY。

### When
下一轮 scheduled reconcile。

### Oracle

```text
state == ACTIVE
managed models == Bootstrap.models
manual refresh count == 0
re-login count == 0
```

---

## A-SEC-001 — Scheduler Secret Zero

### Requirement Refs
`REQ-SEC-001`

### Oracle

```text
JSON.stringify(scheduler diagnostics).includes(api_key) == false
captured scheduler logs exact api_key occurrence == 0
```

---

## A-SEC-002 — Persistent Secret Zero After Repeated Reconcile

### Requirement Refs
`REQ-SEC-001`

### Given
10 scheduled reconciles，其中包含 Token rotation。

### Oracle

```text
.env exact key occurrence == 0
config.yaml exact key occurrence == 0
providers.json exact key occurrence == 0
models.json exact key occurrence == 0
SQLite exact key occurrence == 0
```

---

## A-SEC-003 — Scheduler Never Calls NEW-API

### Requirement Refs
`REQ-SEC-001`

### Oracle

```text
scheduler/orchestrator control refresh NEW-API request count == 0
NodeDeskClaw Bootstrap request count > 0
```

---

## A-OBS-001 — Result and Next Due Are Observable

### Requirement Refs
`REQ-OBS-001`

### Oracle

```text
每次 background attempt 至少一条 RESULT/COMPLETE log
next_due_delay_ms present when rescheduled
```

---

## A-OBS-002 — Busy/Backoff Distinguishable

### Requirement Refs
`REQ-OBS-001`

### Oracle

```text
busy fixture result == SKIPPED_BUSY
unavailable fixture scheduler_state == BACKOFF
```

---

## A-GATE-001 — v1.2 Golden Is Hard Prerequisite

### Requirement Refs
`REQ-GATE-001`

### Given
v1.2 L4 Evidence = BLOCKED。

### Then
本文不得 APPROVED_FOR_PLAN。

### Oracle

```text
v1.3 plan generation exit != 0
block reason == V12_GOLDEN_NOT_VERIFIED
```

---

## A-EVID-001 — Real Automatic Config Convergence

### Requirement Refs
`REQ-EVID-001`

### Oracle

```text
admin model/default change observed by Desktop <= 360 seconds
no manual refresh
no re-login
state == ACTIVE
```

---

## A-EVID-002 — Real Automatic Disable/Enable/Rotation

### Requirement Refs
`REQ-EVID-001`

### Oracle

```text
disable → NOT_READY <= 360 seconds
enable/rotate → ACTIVE automatically
old Member Key no longer present in Desktop runtime
new Chat succeeds with new key
```

---

## A-EVID-003 — Real Control/Data Plane Separation

### Requirement Refs
`REQ-EVID-001`

### Oracle

```text
NodeDeskClaw blocked after ACTIVE
scheduled reconcile → STALE_ACTIVE
Hermes→NEW-API Chat still PASS
NodeDeskClaw inference proxy request count == 0
```

---

# 21. Acceptance Input Matrix

| Case | Auth | Mode | Runtime | Trigger/Result | Expected |
|---|---|---|---|---|---|
| 1 | YES | local | ACTIVE | normal due/MATCH | NOOP, normal schedule |
| 2 | YES | local | ACTIVE | models changed | reconcile ACTIVE |
| 3 | YES | local | ACTIVE | token changed | secret rotate + restart |
| 4 | YES | local | ACTIVE | unavailable #1 | STALE + 60s backoff |
| 5 | YES | local | STALE | unavailable #2 | STALE + 120s backoff |
| 6 | YES | local | STALE | READY | ACTIVE + normal schedule |
| 7 | YES | local | NOT_READY | READY | ACTIVE |
| 8 | YES | local | APPLYING | timer | SKIP_BUSY，不武装新 due |
| 9 | YES | local | FETCHING | resume | SKIP_BUSY，不另开读取 |
| 10 | YES | local | ACTIVE | resume stale | immediate reconcile |
| 11 | YES | local | ACTIVE | resume fresh | preserve timer |
| 12 | NO | local | UNBOUND | timer/start | STOPPED |
| 13 | YES | remote | n/a | timer/start | STOPPED |
| 14 | YES | ssh | n/a | timer/start | STOPPED |
| 15 | YES | local | ACTIVE | logout | stop before purge |
| 16 | YES | local | ERROR | backend fixed | scheduled recovery |
| 17 | YES | local | NOT_READY | remains NOT_READY | normal schedule |
| 18 | YES | local | ACTIVE | schema invalid | ERROR + normal cadence |

---

# 22. Negative Acceptance

```text
NEG-SCHED-001 active timer count > 1 → FAIL
NEG-SCHED-002 Renderer contains polling timer → FAIL
NEG-LIFE-001 logout后发生 scheduled Bootstrap → FAIL
NEG-LIFE-002 remote/ssh发生 scheduled Bootstrap → FAIL
NEG-TIME-001 unavailable tight-loop <60s → FAIL
NEG-COAL-001 background timer supersedes APPLYING foreground operation → FAIL
NEG-RECON-001 transport unavailable clears ACTIVE secret → FAIL
NEG-RECON-002 scheduled MATCH restarts Gateway → FAIL
NEG-SEC-001 scheduler diagnostics/log contains Member Key → FAIL
NEG-SEC-002 scheduler calls NEW-API → FAIL
NEG-ARCH-001 NodeDeskClaw handles inference → FAIL
NEG-GATE-001 v1.2 Golden BLOCKED but v1.3 Plan generated → FAIL
```

---

# 23. Failure Injection

| Point | Injection | Postcondition |
|---|---|---|
| scheduler start | timer creation throws | login unaffected, STOPPED |
| jitter random | random throws | jitter=0, schedule continues |
| timer callback | runtime=APPLYING | SKIP_BUSY, 0 Bootstrap, 0 new due |
| app quit | background reconcile in flight | rollback T0, no ACTIVE from that intent |
| Bootstrap network | timeout | STALE/ERROR per v1.2 + backoff |
| Bootstrap schema | invalid | ERROR + normal cadence |
| background apply | Gateway restart fail | v1.2 rollback; Scheduler reschedules |
| background apply | superseded by manual | existing generation/rollback |
| logout | timer pending | timer cleared before purge |
| resume | timer already RUNNING | coalesced |
| auth cleared | pending timer fires race | eligibility check stops, 0 request |
| switch remote | pending timer fires race | eligibility check stops, 0 request |

---

# 24. Evidence Contract

每个 Required Acceptance Evidence：

```json
{
  "acceptance_id": "A-TIME-002",
  "status": "PASS",
  "requirement_ids": ["REQ-TIME-001"],
  "test_ids": ["TEST-A-TIME-002"],
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v6.2.1",
  "commit_sha": "<implementation-sha>",
  "command": "pnpm vitest ...",
  "exit_code": 0,
  "oracle": {
    "retry1_ms": 60000,
    "retry2_ms": 120000,
    "retry3_ms": 300000
  },
  "timestamp": "<ISO8601>",
  "evidence_files": []
}
```

规则：

```text
SKIPPED != PASS
BLOCKED != PASS
Synthetic != Golden
代码存在 != Evidence
日志声明 PASS != Oracle PASS
```

---

# 25. Release Gate

v1.3 Release Required：

```text
A-SCHED-001..003
A-LIFE-001..004
A-TIME-001..003
A-RESUME-001..002
A-COAL-001..003
A-RECON-001..004
A-SEC-001..003
A-OBS-001..002
A-GATE-001
A-EVID-001..003
all NEG-* PASS
```

任何 Required AC `!= PASS`：

```text
Release Gate = FAIL/BLOCKED
process exit != 0
```

---

# 26. Golden Consumer / Real-world Acceptance

## 26.1 Required Identity

记录：

```text
smc-copilot implementation SHA
NodeDeskClaw SHA
Hermes version
NEW-API deployment identity
Windows Desktop build identity
test member（脱敏）
normal interval/jitter constants
baseline Bootstrap revision
```

## 26.2 Golden Flow

```text
G1 Login → ACTIVE
G2 不手工 Refresh，管理端修改 default_model
G3 <=360s Desktop 自动收敛
G4 发 Chat，Hermes 使用新 default/model
G5 管理端 disable MemberToken
G6 <=360s Desktop 自动 NOT_READY
G7 managed send blocked
G8 管理端 enable + rotate Token
G9 Desktop 自动 ACTIVE
G10 Chat 使用新 Key 成功
G11 阻断 NodeDeskClaw，不阻断 NEW-API
G12 scheduled reconcile → STALE_ACTIVE
G13 Chat 仍成功
G14 恢复 NodeDeskClaw
G15 自动 ACTIVE
G16 Windows sleep > 6min → resume
G17 Resume 触发一次 reconcile，不补跑多个 timer
```

---

# 27. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test/Evidence | Gate |
|---|---|---|---|---|
| REQ-SCHED-001 | INV-SCHED-001/002 | A-SCHED-001..003 | scheduler fake-clock | REQUIRED |
| REQ-LIFE-001 | INV-LIFE-001/002 | A-LIFE-001..004 | lifecycle integration | REQUIRED |
| REQ-TIME-001 | INV-TIME-001/002 | A-TIME-001..003 | clock/random fixtures | REQUIRED |
| REQ-RESUME-001 | resume single trigger | A-RESUME-001..002 | power lifecycle fixture | REQUIRED |
| REQ-COAL-001 | INV-COAL-001/002 | A-COAL-001..003 | concurrency fixture | REQUIRED |
| REQ-RECON-001 | INV-RECON-001/002 | A-RECON-001..004 | orchestrator integration | REQUIRED |
| REQ-SEC-001 | INV-SEC-001/002 | A-SEC-001..003 | secret scan/spies | REQUIRED |
| REQ-OBS-001 | structured result | A-OBS-001..002 | log capture | REQUIRED |
| REQ-GATE-001 | v1.2 prerequisite | A-GATE-001 | evidence gate | REQUIRED |
| REQ-EVID-001 | real convergence | A-EVID-001..003 | Golden | REQUIRED |

---

# 28. Plan Generation Contract

只有满足：

```text
v1.2 L4 Golden == PASS
本 PRD评审完成
status = APPROVED_FOR_PLAN
```

才允许生成 `.plan.md`。

建议 Plan Phase：

```text
P0 v1.2 Golden prerequisite + baseline impact
P1 Scheduler core + injectable clock/random
P2 Auth/Connection lifecycle wiring
P3 Interval/Jitter/Backoff
P4 Resume trigger
P5 Busy Skip/Coalescing
P6 Observability
P7 Synthetic failure/edge tests
P8 Real Golden Consumer
P9 Evidence / Release Gate
```

---

# 29. `.plan.md` 输出标准

每个 Todo MUST：

```yaml
id:
requirement_refs:
acceptance_refs:
files_or_symbols:
implementation_goal:
preconditions:
state_transition:
side_effect_scope:
failure_cases:
verification:
status:
evidence:
```

`implemented != verified`。

---

# 30. Code Review Contract

Review 顺序：

```text
1. Scheduler 是否仅 trigger，不成为第二 Orchestrator。
2. local/auth eligibility 是否在武装下一轮 timer 前重检。
3. one-shot timer singleton 是否成立。
4. Busy Skip 是否在 beginRuntimeIntent 前发生，且不武装新 due。
5. background 是否不会抢占 foreground transient state。
6. jitter/backoff 是否严格按 RPB-R-02 与 RPB-R-06。
7. logout/mode switch 是否先 stop。
8. quit 是否只取代 scheduled_reconcile、resume_reconcile、local_reentry。
9. STALE_ACTIVE 是否 preserve Data Plane。
10. Secret 是否仍 memory-only。
11. 切回 local 是否只剩一次 local_reentry，且不再调用 switch-local。
12. 被取代的结果是否不改 lastAttemptAt、consecutiveUnavailable、nextDueAt。
13. Golden 是否真实证明无手工 Refresh 自动收敛。
```

重点搜索：

```text
setInterval
setTimeout
powerMonitor
scheduled_reconcile
resume_reconcile
bootstrapRuntimeProvider
beginRuntimeIntent
runtime-provider-refresh
readStoredSessionSync
getConnectionConfig
RUNTIME_BOOTSTRAP_UNAVAILABLE
apiKey
```

---

# 31. PRD Quality Gate

```text
Architecture
[x] Scheduler/Orchestrator Owner 分离
[x] Control/Data Plane 分离
[x] Scope/Non-goal 明确

State
[x] Scheduler state/SOT 明确
[x] Start/Stop 明确
[x] Runtime Busy Skip 明确

Semantics
[x] Interval/Jitter/Backoff 精确
[x] Resume 行为精确
[x] Conflict/Coalesce 精确

Side Effect
[x] Scheduler direct mutation=0
[x] Existing Orchestrator transaction复用

Failure
[x] transient vs deterministic error区分
[x] no tight-loop
[x] logout race有明确行为

Acceptance
[x] MUST/MUST NOT 有 AC/Negative AC
[x] 边界矩阵
[x] Failure Injection
[x] Machine-readable Oracle

Evidence
[x] Synthetic/Golden 分离
[x] v1.2 Golden prerequisite
[x] BLOCKED != PASS

Plan Readiness
[x] 无 TBD
[x] Traceability完整
[ ] v1.2 L4 Golden PASS
[ ] User Review
[ ] status=APPROVED_FOR_PLAN
```

---

# 32. PRD 禁止写法

禁止：

```text
“定期刷新”
“适当退避”
“避免频繁请求”
“恢复后及时同步”
“后台自动处理”
```

必须使用本文确定值：

```text
300s normal interval
0..60s normal jitter
60/120/300s transient backoff
0..30s backoff jitter
60s resume freshness threshold
Transient states Busy Skip
```

---

# 33. 推荐 ID 体系

```text
REQ-SCHED-xxx
REQ-LIFE-xxx
REQ-TIME-xxx
REQ-RESUME-xxx
REQ-COAL-xxx
REQ-RECON-xxx
REQ-SEC-xxx
REQ-OBS-xxx
REQ-GATE-xxx
REQ-EVID-xxx

A-SCHED-xxx
A-LIFE-xxx
A-TIME-xxx
A-RESUME-xxx
A-COAL-xxx
A-RECON-xxx
A-SEC-xxx
A-OBS-xxx
A-GATE-xxx
A-EVID-xxx
```

---

# 34. Implementation Change Map

建议源码面：

```text
apps/work/src/main/runtime-provider/runtime-provider-reconcile-scheduler.ts
  ADD
  - start/stop
  - one-shot timer
  - eligibility
  - busy/coalesce
  - normal/backoff scheduling
  - diagnostics

apps/work/src/main/runtime-provider/runtime-provider-reconcile-scheduler.test.ts
  ADD
  - fake clock/random
  - lifecycle
  - backoff
  - coalescing

apps/work/src/main/runtime-provider/runtime-provider-orchestrator.ts
  KEEP API
  - MUST NOT 把 scheduler 逻辑塞入 transaction core
  - MAY 增加 result classification helper，若必要

apps/work/src/main/auth/auth-ipc.ts
  MODIFY
  - login/restore 后 start
  - logout 前 stop
  - session clear hook

apps/work/src/main/ipc/register.ts
  MODIFY
  - 删除切回 local 时的 bootstrapRuntimeProvider("switch-local")
  - 保留 startHermesBootstrapAsync()
  - 切回 local 只由 Scheduler 发起一次 local_reentry
  - profile_switch 保留，Scheduler 跟随当前 active profile
  - Manual Refresh 保持，被接受的结果重排下一轮

apps/work/src/main/index.ts 或当前 Electron lifecycle owner
  MODIFY
  - powerMonitor resume
  - app quit stop timer
  - quit 时取代进行中的 scheduled_reconcile、resume_reconcile、local_reentry

apps/work/src/main/runtime-provider/runtime-provider-observability.ts
  MODIFY
  - reconcile allowlisted event

apps/work/src/preload / renderer
  NO new polling
  Manual Refresh 与现有 Runtime State UX 保持
```

## 34.1 不应修改

```text
NodeDeskClaw Backend
Hermes Agent Core
NEW-API
llm-proxy
Provider Identity schema
MemberToken schema
```

---

# 35. Definition of Done

```text
[ ] v1.2 L4 Golden 已 PASS
[ ] baseline 22e61a0 impact checked
[ ] Scheduler singleton timer PASS
[ ] Local + Authenticated eligibility PASS
[ ] Login/Restore start PASS
[ ] Logout stop-before-purge PASS
[ ] remote/ssh stop PASS
[ ] local re-entry immediate reconcile PASS
[ ] 300s + 0..60s jitter PASS
[ ] 60/120/300s backoff PASS
[ ] success resets backoff PASS
[ ] Resume stale immediate reconcile PASS
[ ] Resume fresh no duplicate PASS
[ ] Busy Skip does not begin Runtime intent PASS
[ ] Background in-flight coalescing PASS
[ ] Manual Refresh wins foreground race PASS
[ ] Automatic model/default convergence PASS
[ ] Automatic token rotation PASS
[ ] Automatic NOT_READY→READY recovery PASS
[ ] Control Plane outage → STALE_ACTIVE / Data Plane preserved PASS
[ ] Scheduler secret occurrence == 0
[ ] Persistent Member Key occurrence == 0
[ ] Scheduler NEW-API control request count == 0
[ ] remote/ssh regression PASS
[ ] typecheck/build targeted tests PASS
[ ] Real Golden <=360s model/default convergence PASS
[ ] Real Golden disable/enable/rotate PASS
[ ] Real Golden sleep/resume PASS
[ ] NodeDeskClaw inference proxy count == 0
[ ] all Required Evidence bound to implementation SHA
[ ] Release Gate PASS
```

---

# 36. 最终原则

v1.2 解决的是：

```text
“当 Desktop 被要求刷新时，如何正确、原子、可恢复地刷新。”
```

v1.3 解决的是：

```text
“Desktop 如何在长期运行中持续知道自己应该刷新。”
```

最终企业 Runtime Control Loop：

```text
NodeDeskClaw Desired State
        │
        ▼
Continuous Reconcile Scheduler
        │ 5m + jitter / resume / backoff
        ▼
RuntimeProviderOrchestrator
        │
        ├─ MATCH → NO-OP
        ├─ CHANGE → APPLY
        ├─ NOT_READY → PURGE
        └─ OUTAGE → STALE_ACTIVE
        │
        ▼
Local Hermes Gateway
        │
        ▼
DIRECT NEW-API
```

核心不变量：

```text
1. Scheduler 只决定 WHEN，不拥有 WHAT。
2. Orchestrator 仍是唯一 Runtime Mutation Owner。
3. 后台任务不得抢占 foreground transient lifecycle。
4. Backend 可达时，企业配置正常观察窗口 <=360 秒。
5. Backend 不可达时，ACTIVE Data Plane 不因 polling 失败被误撤销。
6. Logout / remote mode 后没有后台 Bootstrap。
7. Member Key 仍只存在 Main memory + Hermes child env。
8. NodeDeskClaw 仍不进入 inference Data Plane。
9. v1.2 Golden 未 PASS，不得扩大到 v1.3 自动化实施。
10. v1.3 VERIFIED 后，才进入 model policy / multi-provider 等下一扩展阶段。
```
