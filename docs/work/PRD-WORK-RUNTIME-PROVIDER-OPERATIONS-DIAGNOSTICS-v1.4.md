---
title: "smc-copilot Runtime Provider Operations / Diagnostics & Recovery v1.4 方案 PRD"
subtitle: "企业 Runtime Provider 可观察、可诊断、可恢复：只读运行快照、受控恢复入口、脱敏 Support Bundle 与运营闭环"
prd_id: "PRD-WORK-RUNTIME-PROVIDER-OPERATIONS-DIAGNOSTICS-V1.4"
version: "1.4"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "be0c302c0308fc0099734a9b8f1050463ea9c5b2"
extends:
  - "PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.0.md @ v1.1"
  - "PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.2-CLOSURE-RECONCILE.md"
  - "PRD-WORK-RUNTIME-PROVIDER-CONTINUOUS-RECONCILE-v1.3.md"
external_contract_repository: "loudon84/nodeskclaw"
external_contract_branch: "main"
external_contract_commit: "7abb73e90e163f85257208ac4aa58e4914d2da6e"
owner: "Work Platform / Runtime Provider Operations"
reviewers: ["Product","Architecture","Desktop Main","Renderer","Hermes Runtime","Backend Integration","Security","QA","Desktop Support / Operations"]
created_at: "2026-09-28"
updated_at: "2026-09-28"
target_release: "Runtime Provider Operations / Diagnostics v1.4"
change_type: ["NEW_FEATURE","BROWNFIELD_CHANGE","INTEGRATION","GOVERNANCE"]
golden_consumer: "smc-copilot apps/work + NodeDeskClaw Runtime Bootstrap + local Hermes Gateway + enterprise NEW-API"
related_docs:
  - "需求PRD工程模板.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.0.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.2-CLOSURE-RECONCILE.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-CONTINUOUS-RECONCILE-v1.3.md"
supersedes: null
---

# 0. PRD 使用原则

本 PRD 严格按《需求PRD工程模板.md》v1.0 输出，作为 **Human + AI Coding Machine-Executable Engineering Contract**。

本轮属于 Runtime Provider 主链完成后的 **Operations / Diagnostics Architectural Extension**。

本 PRD 不重新设计：

```text
NodeDeskClaw Runtime Bootstrap
Provider Identity v2
Managed Secret
Provider / Model Projection
Runtime Operation Coordinator
Transaction / Rollback
Continuous Reconcile
Chat Transport
Hermes → NEW-API Data Plane
```

本 PRD新增：

```text
Runtime Provider 运行状态只读聚合
+
受限历史事件
+
企业 Runtime 运营 UI
+
安全 Support Bundle
+
基于现有 Orchestrator 的恢复入口
```

目标从“系统自动工作”提升到“企业用户和支持人员能够知道它为什么工作/失败，并在不接触密钥、不手改配置文件的前提下执行确定性恢复”。

## 0.1 Delta Priority

```text
§0.6 Grilling 决定 RPB-D-01～RPB-D-07
    >
本 PRD v1.4 其余明确 MODIFY / ADD
    >
v1.3 Continuous Reconcile，含 RPB-R-01～RPB-R-09
    >
v1.2 Closure / Reconcile
    >
v1.1 Bootstrap Parent PRD
    >
当前源码行为
```

`RPB-D-01`～`RPB-D-07` 覆盖本文后文与之冲突的句子。未被 v1.4 修改的 v1.1～v1.3 语义继续有效。

## 0.2 强制规范关键词

`MUST / MUST NOT / SHOULD / SHOULD NOT / MAY` 按模板定义。所有 `MUST / MUST NOT` MUST 映射至少一个 Acceptance。

## 0.3 No-Inference Rule

若 Plan/Coding Agent 无法唯一确定以下任何事项：

```text
Diagnostics Snapshot 字段
Diagnostics 是否允许网络访问
Secret 是否允许出 Main
History 容量/retention
Scheduler diagnostics 如何读取
Projection 状态表示当前还是上次检查
Recovery Action 范围
Support Bundle 字段
Support Bundle 是否覆盖文件
路径如何脱敏
ERROR / NOT_READY / STALE_ACTIVE UI 行为
Golden / Entry Gate
```

则：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT 自行选择实现
```

## 0.4 Source Integrity Gate

```text
repo: loudon84/smc-copilot
branch: work/prd-v6.2.1
commit: be0c302c0308fc0099734a9b8f1050463ea9c5b2

external repo: loudon84/nodeskclaw
branch: main
commit: 7abb73e90e163f85257208ac4aa58e4914d2da6e
endpoint: POST /api/v1/runtime/model-bootstrap
```

进入 `APPROVED_FOR_PLAN` 前的来源核对：

```text
1. 再次确认 work/prd-v6.2.1 HEAD。
2. HEAD 变化时输出 baseline → HEAD impact diff。
3. 确认 Runtime Provider public state / scheduler / IPC 未破坏。
4. 确认 NodeDeskClaw Bootstrap Contract 未破坏。
5. v1.2 与 v1.3 Required Golden Consumer 的真实 PASS Evidence。
```

2026-09-28 核对：HEAD 仍是 `be0c302c0308fc0099734a9b8f1050463ea9c5b2`，与 baseline 相同，没有 baseline → HEAD diff。第 5 项由用户在同日明确放行，见 §0.5。

## 0.5 Entry Gate

当前基线已经提交 v1.3 Continuous Reconcile 实现。v1.2 与 v1.3 Golden 仍是 BLOCKED，不是 synthetic PASS，也不是 PASS。

2026-09-28 用户明确放行 `REQ-GATE-001` 的状态门槛，要求先把本文转为 `APPROVED_FOR_PLAN`。因此本文当前：

```text
status = APPROVED_FOR_PLAN
```

这次放行只解除状态和后续 Plan Generation 的阻断。它不改 Golden 结果。实施与 Evidence MUST 继续把尚未执行的 v1.2 NodeDeskClaw inference、v1.2 NEW-API 直连、v1.3 自动收敛记为 BLOCKED，MUST NOT 记为 PASS。

## 0.6 Grilling 决定（最高优先级）

2026-09-28 grilling 确认。profile 比较沿用现有约定：空字符串和文件侧 `undefined` 都等于 `"default"`。被接受的结果指本次 `bootstrapRuntimeProvider` 返回时 generation 仍等于当前值。`gatewayHealthy === false` 才算 Gateway 明确不健康；`lastProbe == null` 或健康状态缺失时不按不健康处理。

```text
RPB-D-01
Summary 完全按 §8.1。
按钮先取 Runtime 状态本身的动作，再在 gatewayHealthy === false 时并上 Open Gateway。
FETCHING、APPLYING、CLEARING、UNBOUND 没有任何按钮。
STALE_ACTIVE 即使 Gateway 明确不健康，summary 仍是 DEGRADED。
READY 的动作是 Reconcile now 和 Export。
其它允许重试的状态，同一动作的文字是 Retry reconcile。
这两个动作都调用现有 runtime-provider-refresh。
Open Gateway 只切换到现有 Gateway 页面，卡片内不重启 Gateway。

RPB-D-02
RUNTIME_PROVIDER_ROLLBACK_FAILED 和 RUNTIME_PROVIDER_POST_APPLY_DRIFT
MUST 显示 Export 和 Retry，MUST NOT 提供破坏性重置。
没有列入本节动作表的错误码，包括 RUNTIME_BOOTSTRAP_UNAUTHORIZED，只显示 Export。
NOT_READY 显示 Backend State、管理指引、Retry 和 Export。
schema 无效和 MANAGED_PROVIDER_IDENTITY_CONFLICT 只显示 Export。
以上各类只要 Gateway 明确不健康，再按 RPB-D-01 并上 Open Gateway。
RUNTIME_BOOTSTRAP_UNAVAILABLE 显示 Retry 和 Export。
RUNTIME_GATEWAY_RESTART_FAILED 和 RUNTIME_SECRET_PURGE_UNVERIFIED
显示 Open Gateway 和 Export；Gateway 已不健康时不重复添加。

RPB-D-03
nextDueAt 只等于当前仍武装的那一次 one-shot timer。
到期回调已经清掉 timer 后再 Busy Skip 时，nextDueAt 为 null。
休眠恢复遇到 FETCHING、APPLYING 或 CLEARING 时，保留原来的未来 timer，nextDueAt 也保留。
RUNNING 不另造一个 due。
STOPPED 时 nextDueAt 为 null。

RPB-D-04
运行状态、投影和凭证是否已加载，按请求的 profile 读取。
请求的 profile 不是活跃 profile 时，收敛块表示该 profile 没有排期：
schedulerState 为 STOPPED，lastTrigger、lastResult 和时间为 null，
consecutiveUnavailable 为 0。
MUST NOT 把活跃 profile 的 timer 写进另一条 profile 的快照。
History 仍是进程内全局 ring。导出复制整圈，每条事件自带 profile。

RPB-D-05
NOT_READY 的管理指引只有一条英文源文案：
This enterprise model is not ready. An administrator must fix it in NodeDeskClaw.
卡片同时显示 Backend State。
“由企业 NodeDeskClaw 管理”的英文源文案是：
This provider is managed by enterprise NodeDeskClaw.
中文由现有 i18n 提供。组件 MUST NOT 写死中文。

RPB-D-06
Busy Skip 把 lastTrigger 写成这次被跳过的触发，把 lastResult 写成 SKIPPED_BUSY。
lastAttemptAt、lastSuccessfulFetchAt、consecutiveUnavailable 不因 Busy Skip 改变。
nextDueAt 按 RPB-D-03，不因 Busy Skip 另武装。
START 只进入 history。进行中由 scheduler state 显示 RUNNING，lastResult 保留上一轮终态。
只有被接受的终态结果可以覆盖 lastResult 和 lastTrigger，并按 v1.3 安排下一轮。
被取代的结果不修改 lastTrigger、lastResult、lastAttemptAt、lastSuccessfulFetchAt、
consecutiveUnavailable、nextDueAt。
登出、退出，或没有新的跳过触发而停止时，scheduler state 为 STOPPED，nextDueAt 为 null。
此时 lastTrigger 和 lastResult 保持原值。

RPB-D-07
投影复验结果不是 MATCH，或检查抛异常时：
回滚该次操作自己的 T0，公共状态为 ERROR，
错误码为 RUNTIME_PROVIDER_POST_APPLY_DRIFT，MUST NOT 进入 ACTIVE。
卡片动作按 RPB-D-02。
```

---

# 1. 文档元数据与源码基线

## 1.1 Current HEAD

```text
work/prd-v6.2.1
HEAD = be0c302c0308fc0099734a9b8f1050463ea9c5b2
```

当前链路：

```text
NodeDeskClaw Login / Session Restore
        ↓
Runtime Bootstrap
        ↓
Managed Provider / Models / Secret
        ↓
Operation Coordinator
        ↓
Projection Integrity
        ↓
Continuous Reconcile
        ↓
Hermes Gateway
        ↓
DIRECT NEW-API
```

## 1.2 当前 Runtime Provider Public State

```text
UNBOUND
FETCHING
APPLYING
CLEARING
NOT_READY
ACTIVE
STALE_ACTIVE
ERROR
```

`ACTIVE / STALE_ACTIVE` 已包含：

```text
revision
providerRef
defaultModel
modelIds
modelCount
optional errorCode
```

## 1.3 当前 Scheduler

当前 v1.3 已实现：

```text
normal interval = 300000ms
normal jitter = 0..60000ms
unavailable backoff = 60000 / 120000 / 300000ms
resume freshness threshold = 60000ms
scheduler phase = STOPPED / SCHEDULED / RUNNING / BACKOFF
```

当前可读：

```text
state()
consecutiveUnavailable()
lastAttemptAt()
activeTimerCount()
```

但缺少稳定 diagnostics contract：

```text
nextDueAt
lastResult
lastTrigger
lastSuccessfulFetchAt
```

## 1.4 当前 Observability

`runtime-provider-observability.ts` 将：

```text
runtime_provider_operation
runtime_provider_reconcile
```

作为脱敏 JSON 写入 `console.info`，但不存在稳定 bounded history / support bundle schema。

## 1.5 当前 Renderer

Chat ModelPicker 已有 Runtime Status 与 Refresh。Providers 页面仍以用户自配置 Provider/Key/Model 为主，没有独立的：

```text
SMC Enterprise Runtime
```

只读运营卡片。

## 1.6 当前 Hermes Runtime

`RuntimeManager` 已维护：

```text
lastProbe
runtime adapter identity
runtime contract identity
gatewayHealthy
authenticated
errorCode
endpoint
homePath
executablePath
```

v1.4 MUST 复用 `RuntimeManager.getLastProbe()` 构造无网络、无进程变更的 snapshot。

---

# 2. 一句话目标

让 **已登录 NodeDeskClaw 并使用 Local Hermes 的 smc-copilot 企业用户与桌面支持人员**，在 Runtime Provider 已由 v1.1～v1.3 自动管理的前置条件下，通过 **只读 Runtime Diagnostics Snapshot、SMC Enterprise Runtime 运营卡片、受控 Reconcile 恢复入口和用户显式导出的脱敏 Support Bundle**，确定当前企业模型的配置、同步、Gateway 与错误状态，并执行不越过现有 Orchestrator 所有权边界的恢复操作，同时保证 **Member Key / JWT / Authorization 永不进入 Renderer、Support Bundle 或持久诊断状态**。

---

# 3. 背景与问题定义

## 3.1 Current State

当前系统已支持：

```text
Login Bootstrap
Session Restore
Continuous Reconcile
Token Rotation
Models/default_model 更新
STALE_ACTIVE
NOT_READY Purge
Manual Refresh
```

但排障事实分散在：

```text
Orchestrator
Scheduler
RuntimeManager
console logs
config / models / registry
```

没有统一安全的 Operations View。

## 3.2 Problem

```text
P-001 Control Loop 没有单一 Diagnostics Projection。
P-002 ERROR / NOT_READY 时用户无法判断 Control Plane、Projection、Gateway 哪层失败。
P-003 Scheduler 没有稳定 diagnostics contract。
P-004 console log 无 bounded history、无 schema、不可直接作为 Support Contract。
P-005 人工排障容易直接打开 .env/config/log，扩大 Secret 暴露面。
P-006 Providers 页面没有清楚表达“当前 Provider 由企业控制面管理”。
P-007 Operations 层需要准确的最近 Projection 检查结果，不能展示修复前的 stale drift。
P-008 企业规模部署需要统一、可审核、无密钥 Support Bundle。
```

## 3.3 Impact

```text
业务影响：
- 用户难以区分管理员未配置与本机 Hermes 故障。

工程影响：
- 多 subsystem 有状态但没有统一 operational projection。

安全影响：
- 人工排障会增加密钥和个人路径暴露风险。

运维影响：
- 500 台终端无法标准化问题收集。

AI Coding 影响：
- 后续 Provider/Policy 扩展会继续重复状态读取逻辑。
```

---

# 4. Scope

## 4.1 In Scope

```text
SCOPE-001 RuntimeProviderDiagnosticsSnapshot v1
SCOPE-002 Main Diagnostics Aggregator
SCOPE-003 Scheduler diagnostics 补全
SCOPE-004 bounded sanitized Runtime Provider history
SCOPE-005 Last Projection Integrity record
SCOPE-006 Post-apply Projection Integrity verify
SCOPE-007 Read-only Diagnostics IPC / Preload API
SCOPE-008 Providers 页 SMC Enterprise Runtime 只读卡片
SCOPE-009 Providers managed mode UI lock explanation
SCOPE-010 Guided Recovery：Reconcile/Retry
SCOPE-011 Guided Recovery：Gateway 导航
SCOPE-012 Support Bundle JSON 导出
SCOPE-013 path/url/data redaction
SCOPE-014 Diagnostics / Recovery observability
SCOPE-015 v1.4 Synthetic + Golden Evidence
```

## 4.2 Out of Scope

```text
NON-GOAL-001 MUST NOT 修改 NodeDeskClaw Runtime Bootstrap API。
NON-GOAL-002 MUST NOT 修改 Hermes Agent Core。
NON-GOAL-003 MUST NOT 修改 NEW-API。
NON-GOAL-004 MUST NOT 新增第二 Model Provider。
NON-GOAL-005 MUST NOT 新增 model_limits。
NON-GOAL-006 MUST NOT 新增 SSE/WebSocket Control Plane Push。
NON-GOAL-007 MUST NOT 把 NodeDeskClaw 放入 inference Data Plane。
NON-GOAL-008 MUST NOT 在 Diagnostics 时调用 NEW-API。
NON-GOAL-009 MUST NOT 自动上传 Support Bundle。
NON-GOAL-010 MUST NOT 把 Bundle 上传到 NodeDeskClaw。
NON-GOAL-011 MUST NOT 导出 .env、完整 config.yaml/providers.json/models.json。
NON-GOAL-012 MUST NOT 导出 Member Key、JWT、Authorization、refresh token。
NON-GOAL-013 MUST NOT 新增强制重置 Provider 文件按钮。
NON-GOAL-014 MUST NOT 新增用户侧“清除企业 Credential”按钮。
NON-GOAL-015 MUST NOT 让 Renderer 直接写 managed files。
NON-GOAL-016 MUST NOT 让 Diagnostics Snapshot 发起 Control Plane 网络请求。
NON-GOAL-017 MUST NOT 改 remote/ssh Provider 行为。
```

## 4.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Desired Runtime | NodeDeskClaw | member/admin config | Bootstrap | Desktop diagnostics |
| Runtime State | Orchestrator | lifecycle + Bootstrap | public state | UI storage |
| Reconcile State | Scheduler | timer/result | scheduler diagnostics | projection |
| Projection Check | Integrity | desired + local | MATCH/DRIFT/CONFLICT | persistence |
| Gateway Health | RuntimeManager | local runtime | last probe | enterprise policy |
| Diagnostics Aggregator | v1.4 Main | above state | snapshot | mutation |
| History | v1.4 Main | sanitized events | bounded history | raw logs |
| Renderer Card | Providers | snapshot | operational UI | config ownership |
| Recovery | Existing Orchestrator | explicit intent | reconcile | manual repair |
| Support Bundle | Main | snapshot/history | JSON file | upload |
| Data Plane | Hermes + NEW-API | Member Key | inference | diagnostics |

---

# 5. Terminology / Domain Model

| Term | Definition |
|---|---|
| Diagnostics Snapshot | 某一时刻 Main 聚合的无 Secret Runtime Provider 视图 |
| Diagnostics Event | 严格 allowlist 后的 operation/reconcile 事件 |
| Diagnostics History | Main memory 中最近固定数量 Diagnostics Event |
| Support Bundle | 用户显式导出的单一 JSON，包含 Snapshot + bounded history |
| Last Projection Check | Orchestrator 最近一次 integrity check 的结果 |
| Runtime Health Summary | 派生运营摘要，不是 Runtime SOT |
| READY | ACTIVE 且未观察到 Gateway unhealthy |
| DEGRADED | STALE_ACTIVE |
| ACTION_REQUIRED | NOT_READY/ERROR，或 ACTIVE 但 Gateway 明确 unhealthy |
| INITIALIZING | FETCHING/APPLYING/CLEARING |
| UNBOUND | Runtime Provider 未绑定 |
| Reconcile Recovery | 调用现有 Runtime Refresh/Orchestrator |
| Sensitive Secret | API Key、JWT、Authorization、refresh/access/OAuth token |
| Sensitive Path | 可识别用户名/用户 Home 的绝对路径 |

---

# 6. System Context

## 6.1 Context Diagram

```text
NodeDeskClaw
   │ Bootstrap
   ▼
Runtime Provider Control Loop
 ┌──────────────┼──────────────┐
 ▼              ▼              ▼
Orchestrator   Scheduler    RuntimeManager
public state   diagnostics  last probe
 └──────────────┼──────────────┘
                ▼
       Diagnostics Aggregator
          ┌─────┴─────┐
          ▼           ▼
       History      Snapshot
          └─────┬─────┘
                ▼
        Preload Read-only API
          ┌─────┴─────────┐
          ▼               ▼
 Enterprise Card     Support Bundle
      │
      ├─ Reconcile
      └─ Open Gateway

Data Plane:
Chat → Local Hermes → NEW-API → LLM
```

## 6.2 System Boundary

Inside：

```text
diagnostics state
scheduler diagnostics
last projection check
strict event ring
snapshot builder
support bundle exporter
read-only IPC
Providers operations card
recovery action wiring
```

Outside：

```text
NodeDeskClaw mutation
Hermes Agent Core
NEW-API internals
remote/ssh flow
bundle upload service
```

Trusted input：

```text
Runtime public state
Scheduler diagnostics
RuntimeManager last probe
strict internal events
current profile/mode/session presence
```

Untrusted input：

```text
Renderer IPC arguments
filesystem selected export location
local malformed config-derived error values
```

---

# 7. Authoritative State / Source of Truth

| State | Role | Authoritative? | Writer | Reader | 自动覆盖 |
|---|---|---:|---|---|---:|
| RuntimeProviderPublicState | RUNTIME_STATE | YES local | Orchestrator | Diagnostics/UI | YES |
| Bootstrap revision | DESIRED identity | YES external | NodeDeskClaw | Orchestrator/Diagnostics | NO |
| Scheduler phase | RUNTIME_STATE | YES local | Scheduler | Diagnostics | YES |
| Scheduler timing/result | RUNTIME_STATE | YES local | Scheduler | Diagnostics | YES |
| RuntimeManager lastProbe | OBSERVED_STATE | YES local | RuntimeManager | Diagnostics | YES |
| Last Projection Check | OBSERVED_STATE | YES local | Orchestrator | Diagnostics | YES |
| Managed Secret | RUNTIME_SECRET | YES | Secret Store | Hermes | NO export |
| Secret Presence boolean | RESOLVED_STATE | derived | Diagnostics | UI/Bundle | YES |
| Diagnostics History | EVIDENCE_STATE volatile | YES recent history | Recorder | UI/Bundle | ring |
| Support Bundle | EVIDENCE_STATE user artifact | YES | Exporter | User/Support | NO overwrite |
| Renderer Snapshot | OBSERVED COPY | NO | Renderer | UI | reload |

规则：

```text
Diagnostics Snapshot MUST NOT 成为 Runtime Provider SOT。
Renderer MUST NOT 反向修改 Snapshot。
Support Bundle MUST NOT 作为 recovery input。
```

---

# 8. State Machine

## 8.1 Runtime Health Summary

```text
UNBOUND → UNBOUND

FETCHING/APPLYING/CLEARING → INITIALIZING

STALE_ACTIVE → DEGRADED

NOT_READY/ERROR → ACTION_REQUIRED

ACTIVE:
  lastProbe.gatewayHealthy == false → ACTION_REQUIRED
  otherwise → READY
```

`lastProbe == null`：

```text
ACTIVE → READY
gateway health = UNKNOWN
```

## 8.2 Recovery Mapping

```text
READY:
  Reconcile now
  Export diagnostics

DEGRADED:
  Retry reconcile
  Export diagnostics

NOT_READY:
  Retry reconcile
  Admin guidance：RPB-D-05
  Export diagnostics

Gateway unhealthy 且 Runtime 不是 FETCHING / APPLYING / CLEARING / UNBOUND:
  在上面的动作上并上 Open Gateway
  summary 仍按 §8.1，不因 Gateway 改写 STALE_ACTIVE 的 DEGRADED

ERROR:
  按 RPB-D-02 的错误码动作表
  Gateway 明确不健康时再并上 Open Gateway

FETCHING / APPLYING / CLEARING / UNBOUND:
  无动作
```

## 8.3 Last Projection Check Lifecycle

```text
UNKNOWN
  ↓ READY check
MATCH | DRIFTED | IDENTITY_CONFLICT
  ↓ repair + post-check
MATCH
```

Process restart 后恢复为 `UNKNOWN`。

---

# 9. Data / Schema Contract

## 9.1 RuntimeProviderDiagnosticsSnapshot v1

Schema ID：

```text
work.runtime-provider.diagnostics-snapshot.v1
```

Version `1.0`，`additionalProperties=false`。

核心字段：

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "RFC3339",
  "profile": "default",
  "summaryStatus": "READY",
  "connection": {
    "mode": "local",
    "authenticatedSessionPresent": true
  },
  "runtimeProvider": {
    "state": "ACTIVE",
    "backendState": null,
    "errorCode": null,
    "revision": "opaque",
    "providerRef": "named:nodeskclaw",
    "defaultModel": "model-a",
    "modelIds": ["model-a"],
    "modelCount": 1,
    "managedSecretPresent": true
  },
  "reconcile": {
    "schedulerState": "SCHEDULED",
    "lastTrigger": "scheduled_reconcile",
    "lastResult": "NOOP_MATCH",
    "lastAttemptAt": "RFC3339",
    "lastSuccessfulFetchAt": "RFC3339",
    "nextDueAt": "RFC3339",
    "consecutiveUnavailable": 0
  },
  "projection": {
    "status": "MATCH",
    "checkedAt": "RFC3339",
    "revision": "opaque",
    "reasons": []
  },
  "gateway": {
    "observed": true,
    "state": "READY",
    "gatewayHealthy": true,
    "authenticated": true,
    "errorCode": null,
    "endpoint": "http://127.0.0.1:8642",
    "homePath": "<USER_HOME>/.hermes",
    "executablePath": "<USER_HOME>/.../hermes"
  }
}
```

Rules：

```text
summaryStatus enum:
  READY
  DEGRADED
  ACTION_REQUIRED
  INITIALIZING
  UNBOUND

modelIds max 500
each model id max 256 chars
revision opaque
managedSecretPresent boolean only
URL strip userinfo/query/hash
user home prefix → <USER_HOME>
```

## 9.2 ReconcileDiagnostics v1

Fields：

```text
schedulerState
lastTrigger
lastResult
lastAttemptAt
lastSuccessfulFetchAt
nextDueAt
consecutiveUnavailable
```

Rules：

```text
nextDueAt 只表示当前仍武装的 timer。规则见 RPB-D-03。
READY/explicit NOT_READY accepted → update lastSuccessfulFetchAt
Busy Skip 按 RPB-D-06 只更新 lastTrigger 和 lastResult。
被取代的结果不更新诊断字段。
请求的 profile 不是活跃 profile 时，收敛块按 RPB-D-04。
```

## 9.3 ProjectionCheckRecord v1

```text
profile
checkedAt
revision
status:
  UNKNOWN
  MATCH
  DRIFTED
  IDENTITY_CONFLICT
reasons[]
```

Reasons 复用现有 drift enums。

## 9.4 RuntimeProviderDiagnosticEvent v1

严格 allowlist：

```text
timestamp
event
operationId
generation
reason
profile
stage
status
result
runtimeState
backendState
errorCode
revision
providerRef
defaultModel
modelCount
schedulerState
nextDueDelayMs
consecutiveUnavailable
```

Rules：

```text
additionalProperties=false
capacity=200
oldest evicted first
process restart clears history
string max 512 chars
```

MUST NOT 存：

```text
apiKey/api_key
secret
token
jwt
Authorization
access/refresh token
secret prefix/suffix/length/fingerprint/hash
raw stack
raw request/response body
```

## 9.5 RuntimeProviderSupportBundle v1

Schema ID：

```text
work.runtime-provider.support-bundle.v1
```

文件名：

```text
smc-copilot-runtime-diagnostics-YYYYMMDD-HHmmss.json
```

结构：

```text
schemaVersion
generatedAt
product:
  name
  appVersion
  platform
  arch
  electronVersion
  nodeVersion
  runtimeAdapter
  runtimeContract
  hermesVersion|null
snapshot
history[]
```

规则：

```text
history <= 200
serialized bundle <= 1 MiB
超限时只移除最旧 history，snapshot MUST NOT 截断
MUST NOT 自动上传
MUST NOT 附加 raw log/config/env 文件
```

---

# 10. Requirement Unit

## REQ-DIAG-001 — Read-only Runtime Diagnostics Snapshot

### Goal
统一汇总当前企业 Runtime 运营状态。

### Normative Requirement

```text
MUST 新增 buildRuntimeProviderDiagnostics(profile) 或等价 Main service。
MUST 聚合：
  connection mode
  auth session presence
  Runtime public state
  managed secret presence boolean
  Scheduler diagnostics
  Last Projection Check
  RuntimeManager.getLastProbe()

MUST NOT：
  调 NodeDeskClaw
  调 NEW-API
  restart/ensure Gateway
  修改 file/DB/secret/timer
```

### Inputs
`profile`

### Preconditions
Main initialized。

### Authoritative State

```text
SOT: Orchestrator/Scheduler/ProjectionRecord/RuntimeManager
Derived: summaryStatus, secret presence
```

### State Transition
无业务状态变化。

### Allowed Side Effects
bounded diagnostics telemetry MAY。

### Forbidden Side Effects
network / managed write / Gateway mutation / secret persistence。

### Ownership Scope
`NONE`

### Idempotency
underlying state 未变时 semantic snapshot 相等，generatedAt 可不同。

### Failure Semantics

```text
optional subsystem unavailable → section null/unknown, snapshot仍可返回
aggregator itself fails → RUNTIME_DIAGNOSTICS_UNAVAILABLE
```

### Postconditions

```text
secret occurrence=0
diagnostics network count=0
```

### Invariants

```text
INV-DIAG-001 managed runtime state unchanged
INV-DIAG-002 Renderer只收到 public snapshot
```

### Acceptance
`A-DIAG-001/002/003`

### Evidence
unit + network spy + state digest。

---

## REQ-HIST-001 — Bounded Sanitized Runtime History

### Goal
把 runtime operation/reconcile 变成可支持排障的受限历史。

### Normative Requirement

```text
MUST 新增 Main memory ring buffer。
MUST capacity=200。
MUST 使用 strict allowlist event projection。
MUST oldest-first eviction。
MUST NOT 持久化。
MUST NOT 原样保存 Record<string,unknown>。
MUST NOT 存 stack/body/headers。
```

### State Transition
0..200 ring append/evict。

### Side Effects
Main memory only；existing console log 可保持。

### Failure Semantics
Recorder exception → drop event；MUST NOT 改 Runtime flow。

### Invariants
`INV-HIST-001 diagnostics recorder failure cannot affect Runtime Provider`

### Acceptance
`A-HIST-001/002/003`

---

## REQ-SCHED-001 — Scheduler Diagnostics Exposure

### Goal
让 Operations UI 判断 Continuous Reconcile 是否在运行。

### Normative Requirement

Scheduler MUST 暴露：

```text
schedulerState
lastTrigger
lastResult
lastAttemptAt
lastSuccessfulFetchAt
nextDueAt
consecutiveUnavailable
```

并且：

```text
arm() → set nextDueAt 为该 one-shot 的到期时间
timer 被回调消费、clearTimer() 或 stop() → nextDueAt=null
休眠恢复的 Busy Skip 若原 timer 仍在 → nextDueAt 保持，见 RPB-D-03
accepted READY/NOT_READY → update lastSuccessfulFetchAt
Busy Skip 与 lastResult 见 RPB-D-06
非活跃 profile 见 RPB-D-04
MUST NOT 修改 v1.3 scheduling semantics
```

### Acceptance
`A-SCHED-001/002`

---

## REQ-PROJ-001 — Last Projection Check + Post-apply Verify

### Goal
避免 Operations UI 把修复前 DRIFTED 误当当前状态，同时强化 ACTIVE 前最终校验。

### Normative Requirement

Orchestrator MUST：

```text
每次 checkManagedRuntimeProjection → 更新 Last Projection Check。

READY MATCH no-op：
  record MATCH。

READY DRIFTED → project：
  Gateway restart success 后、set ACTIVE 前，
  MUST 再执行 read-only checkManagedRuntimeProjection。

post-check MATCH：
  record MATCH
  可以 ACTIVE。

post-check != MATCH，或这次检查抛异常：
  MUST rollback 该次操作自己的 T0
  MUST NOT ACTIVE
  error=RUNTIME_PROVIDER_POST_APPLY_DRIFT
  见 RPB-D-07。

identity conflict：
  record IDENTITY_CONFLICT。
```

MUST NOT 增加第二套 Projection 算法。

### Failure Semantics

```text
post-apply != MATCH，或检查抛异常
→ rollback 该次操作自己的 T0
→ ERROR
→ error=RUNTIME_PROVIDER_POST_APPLY_DRIFT
→ retryable via reconcile
```

### Invariants

```text
INV-PROJ-001 successful repair 后 Operations 不得保留 stale pre-repair DRIFTED
```

### Acceptance
`A-PROJ-001/002/003`

---

## REQ-IPC-001 — Read-only Diagnostics IPC

### Goal
向 Renderer 提供严格 schema，不暴露内部 Secret/对象。

### Normative Requirement

新增：

```text
runtime-provider-get-diagnostics
```

Preload：

```text
getRuntimeProviderDiagnostics(profile?)
```

MUST 返回 Snapshot v1。

MUST NOT 返回：

```text
Managed Secret
auth token
raw env
raw registry
raw config
任意文件内容
```

Renderer除 profile 外不得注入 state 字段。

### Failure Semantics
Aggregator exception → `RUNTIME_DIAGNOSTICS_UNAVAILABLE`，runtime mutation=0。

### Acceptance
`A-IPC-001/002`

---

## REQ-UI-001 — SMC Enterprise Runtime Operations Card

### Goal
明确表达企业模型当前由 NodeDeskClaw 管理。

### Normative Requirement

Providers `providers` tab 顶部 MUST 新增只读：

```text
SMC Enterprise Runtime
```

显示：

```text
Summary Status
Runtime State
Backend State / Error Code
Provider = SMC Enterprise Model
Default Model
Model Count
Last Successful Sync
Next Reconcile
Scheduler State
Gateway Health
Projection Status
运行凭证：已加载 / 未加载
```

MUST NOT 显示任何 masked key/prefix/suffix/length/fingerprint。

当：

```text
local + stored session + Runtime state != UNBOUND
```

时，Providers tab MUST 显示由企业 NodeDeskClaw 管理的只读说明。英文源文案见 RPB-D-05。Main 的 `RUNTIME_PROVIDER_SETTINGS_LOCKED` 继续是最终 enforcement owner。

Auxiliary tab MUST NOT 被锁定。

### Failure Semantics
Diagnostics unavailable → card 显示不可用；Providers 页面继续渲染；不得 fallback 到 raw env。

### Invariants

```text
INV-UI-001 Main enforcement remains authority
INV-UI-002 card is read-only projection
```

### Acceptance
`A-UI-001/002/003`

---

## REQ-REC-001 — Guided Recovery

### Goal
用户通过已有安全控制面恢复，不手改 Hermes 文件。

### Normative Requirement

Card MUST 提供：

```text
1. Reconcile / Retry
2. Open Gateway
3. Export Diagnostics
```

Reconcile：

```text
MUST 复用现有 runtime-provider-refresh / Orchestrator。
MUST NOT 由 Renderer 直接 fetch/project。
```

Open Gateway：

```text
只导航到现有 Gateway screen。
MUST NOT 在 card 内直接 restart。
```

Error mapping 以 RPB-D-02 为准：

```text
RUNTIME_BOOTSTRAP_UNAVAILABLE
  → Retry + Export

RUNTIME_BOOTSTRAP_SCHEMA_INVALID
  → Export

RUNTIME_BOOTSTRAP_UNAUTHORIZED
  以及其它未列入本表的错误码
  → Export

MANAGED_PROVIDER_IDENTITY_CONFLICT
  → Export + conflict explanation
  → MUST NOT auto-delete provider

RUNTIME_GATEWAY_RESTART_FAILED / RUNTIME_SECRET_PURGE_UNVERIFIED
  → Open Gateway + Export

RUNTIME_PROVIDER_ROLLBACK_FAILED / RUNTIME_PROVIDER_POST_APPLY_DRIFT
  → Export + Retry
  → MUST NOT destructive reset

MODEL_* NOT_READY
  → RPB-D-05 管理指引 + Backend State + Retry + Export
```

Gateway 明确不健康时，按 RPB-D-01 在上述动作上并上 Open Gateway。FETCHING、APPLYING、CLEARING、UNBOUND 不显示动作。

### Invariants
`INV-REC-001 v1.4 MUST NOT introduce second mutation owner`

### Acceptance
`A-REC-001/002/003`

---

## REQ-EXP-001 — User-triggered Support Bundle Export

### Goal
生成标准、无密钥、可审计排障文件。

### Normative Requirement

新增 Main IPC：

```text
runtime-provider-export-diagnostics
```

Renderer输入仅 `profile`，MUST NOT 传输出路径。

Main MUST：

```text
build snapshot
copy bounded history
build Bundle v1
enforce <=1 MiB
show Electron Save Dialog
cancel → CANCELLED
target exists/symlink → DIAGNOSTICS_EXPORT_TARGET_EXISTS
exclusive create
write UTF-8 JSON + trailing newline
close
verify parse/schema
return exported path
```

MUST NOT：

```text
overwrite existing file
auto-upload
include raw logs/config/env
include Secret
```

### Ownership Scope
仅新建的 support JSON file。

### Failure Semantics

```text
user cancel → file mutation=0
target exists → mutation=0
write fail → DIAGNOSTICS_EXPORT_FAILED；partial new target best-effort remove
cleanup fail → DIAGNOSTICS_EXPORT_CLEANUP_FAILED；不得删除其它文件
```

### Acceptance
`A-EXP-001/002/003/004`

---

## REQ-SEC-001 — Diagnostics Data Minimization / Redaction

### Goal
增强排障但不扩大 Secret/个人环境暴露。

### Normative Requirement

Diagnostics / History / Bundle MUST 使用字段 allowlist，不可只依赖 blacklist。

MUST NEVER include：

```text
Member API Key
JWT
Authorization
access/refresh/OAuth token
credential pool secret
.env value
provider secret
```

MUST NOT include secret metadata：

```text
prefix
suffix
length
fingerprint
hash
```

唯一允许：

```text
managedSecretPresent boolean
authenticatedSessionPresent boolean
```

URL：

```text
parse
→ remove username/password/query/hash
→ scheme + host + port + pathname
invalid → null
```

Path：

```text
exact OS user home prefix → <USER_HOME>
MUST NOT expose username through home segment
```

String bounds：

```text
errorCode/reason/stage/result <=128
model id <=256
history string <=512
overflow → "...<truncated>"
```

### Acceptance
`A-SEC-001/002/003/004`

---

## REQ-OPS-001 — Diagnostics UI Refresh Semantics

### Goal
Operations Card 随 Runtime state 收敛，不增加 Renderer polling。

### Normative Requirement

Renderer MUST：

```text
onRuntimeProviderStateChanged
→ reload Diagnostics Snapshot
```

Providers 首次可见时 MAY load snapshot。

Scheduler 状态只因时间推进时不要求 push。

如果展示 countdown：

```text
MAY 本地根据 nextDueAt 计算
MUST NOT 为 countdown 发 IPC
```

MUST NOT 新增 Renderer 周期性 diagnostics polling。

### Acceptance
`A-OPS-001/002`

---

## REQ-GATE-001 — v1.4 Entry Gate

### Goal
v1.2/v1.3 真实链路未执行时，Evidence 仍不得写成 PASS。

### Normative Requirement

v1.2 与 v1.3 Golden 的目标结果仍是：

```text
v1.2 Golden:
  Hermes direct NEW-API Chat PASS
  NodeDeskClaw inference request count=0
  Member Key disk/Renderer occurrence=0

v1.3 Golden:
  automatic model/default convergence PASS
  automatic disable → NOT_READY PASS
  token rotate → automatic ACTIVE PASS
  NodeDeskClaw outage → STALE_ACTIVE + Data Plane continues PASS
```

2026-09-28 用户已放行状态门槛。未执行时的记录规则：

```text
v1.2 Golden = BLOCKED
v1.3 Golden = BLOCKED
status = APPROVED_FOR_PLAN
Plan Generation 允许
MUST NOT 把 BLOCKED 写成 PASS
```

### Acceptance
`A-GATE-001`

---

## REQ-EVID-001 — v1.4 Golden Consumer

### Goal
证明 Operations / Diagnostics 在真实企业链路可用且不泄密。

### Normative Requirement

Golden MUST 执行：

```text
1. Login → ACTIVE。
2. 打开 Enterprise Runtime card。
3. 导出 Bundle B1，Secret/JWT exact scan=0。
4. NodeDeskClaw 断网。
5. v1.3 自动 STALE_ACTIVE。
6. Card DEGRADED；Chat 继续经 NEW-API。
7. 导出 B2，history 能重建 unavailable/backoff。
8. 恢复 NodeDeskClaw → ACTIVE。
9. 制造可恢复 Projection drift。
10. Reconcile → repair → post-check MATCH → ACTIVE。
11. 模拟 Gateway unhealthy。
12. Card ACTION_REQUIRED；Open Gateway 导航成功。
13. Diagnostics API 本身 NodeDeskClaw/NEW-API network count=0。
```

### Acceptance
`A-EVID-001/002/003`

---

# 11. Side-Effect Contract

| Operation | NodeDeskClaw Network | NEW-API Network | Managed Mutation | User File | Secret | Gateway | Renderer |
|---|---:|---:|---:|---:|---:|---:|---:|
| get diagnostics | NO | NO | NO | NO | presence only | NO | snapshot |
| record event | NO | NO | NO | NO | NO | NO | NO |
| open card | NO | NO | NO | NO | NO | NO | UI |
| reconcile action | YES via Orchestrator | NO | existing scope | NO | existing | conditional | state event |
| open Gateway | NO | NO | NO | NO | NO | NO | navigation |
| export bundle | NO | NO | NO | YES new file | NO | NO | result |
| post-apply integrity | NO | NO | read-only | NO | NO | NO | state later |

`Diagnostics read-only` = managed files/SQLite/Secret/Gateway/network 均 0 mutation。

---

# 12. Ownership Contract

| Resource | Ownership |
|---|---|
| Runtime Public State | SHARED read / Orchestrator write |
| Scheduler Diagnostics | SHARED read / Scheduler write |
| Last Probe | SHARED read / RuntimeManager write |
| Last Projection Check | GENERATED_ONLY / Orchestrator |
| Snapshot | GENERATED_ONLY |
| History | GENERATED_ONLY / bounded memory |
| Support Bundle | FILE / user-exported |
| Card | GENERATED_ONLY Renderer |
| Provider config | existing ownership |
| Secret | existing ManagedSecretStore |

Rules：

```text
Diagnostics read-only。
History process-owned，restart clears。
Support Bundle export 后不再由 app 管理。
Recovery 委托现有 owner。
Unknown ownership → PRESERVE / REPORT / MUST NOT DELETE。
```

---

# 13. Hash / Identity Contract

不新增 credential hash。

Bundle MAY 计算：

```text
SHA256(UTF-8 exact exported JSON bytes)
```

仅用于 Evidence / support artifact digest，MUST NOT 用作 Runtime state comparison。

Backend revision 仍为 opaque exact string，Desktop MUST NOT recompute。

---

# 14. Transaction Contract

## 14.1 Diagnostics Read

```text
TXN includes: memory/read-only local state
TXN excludes: network, managed writes, Gateway mutation
```

## 14.2 Post-apply Integrity

沿用 v1.2 T0：

```text
project
→ install secret
→ restart Gateway
→ generation check
→ verify Gateway
→ post-apply Projection check
→ MATCH
→ ACTIVE
```

post-check != MATCH：

```text
rollback T0
→ ERROR
```

## 14.3 Support Bundle Export

T0：

```text
selected target absent
```

Commit：

```text
build
→ sanitize
→ serialize
→ size cap
→ save dialog
→ assert absent
→ exclusive create
→ write
→ close
→ parse/schema verify
→ success
```

Failure after create → best-effort delete partial new target。

Rollback cleanup fail：

```text
DIAGNOSTICS_EXPORT_CLEANUP_FAILED
MUST NOT delete any other file
```

---

# 15. Conflict Contract

| Conflict | Detection | Behavior | Error | Mutation |
|---|---|---|---|---:|
| snapshot during transition | state | return transitional snapshot | none | 0 |
| post-apply drift | integrity | rollback | RUNTIME_PROVIDER_POST_APPLY_DRIFT | T0 rollback |
| provider identity conflict | integrity | BLOCK | MANAGED_PROVIDER_IDENTITY_CONFLICT | 0 |
| target exists | exclusive create/lstat | BLOCK | DIAGNOSTICS_EXPORT_TARGET_EXISTS | 0 |
| history >200 | capacity | evict oldest | none | memory |
| bundle >1MiB | serialized size | trim oldest history | none | memory |
| no last probe | null | observed=false | none | 0 |
| no projection check | null | UNKNOWN | none | 0 |
| UI/state event race | reload | latest snapshot wins | none | UI |
| reconcile/background race | coordinator | existing serialization | existing | existing |

---

# 16. Compatibility / Migration

```text
DB migration: NONE
config migration: NONE
model migration: NONE
provider registry migration: NONE
NodeDeskClaw API migration: NONE
```

MUST preserve：

```text
Provider Identity v2
named:nodeskclaw
Runtime State Event
Continuous Reconcile
Chat Status
Manual Refresh
Providers storage
Gateway screen
remote/ssh
legacy hermesone
```

v1.4 被移除/关闭时，v1.1～v1.3 MUST 继续工作。

---

# 17. External Dependency Contract

## NodeDeskClaw

```text
loudon84/nodeskclaw
7abb73e90e163f85257208ac4aa58e4914d2da6e
```

v1.4 不增加 Backend dependency。

## Electron

```text
ipcMain/ipcRenderer
dialog.showSaveDialog
fs exclusive create
app.getVersion()
process platform/arch/versions
```

## RuntimeManager

Diagnostics 只使用：

```text
getLastProbe()
getAdapterIdentity()
```

MUST NOT 为 Snapshot 调用：

```text
ensureReady()
restart()
```

Hermes Version SHOULD 使用已有 cache/read；如果读取会启动 CLI，则 Bundle 使用 null。

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| Member Key 进入 Renderer | strict schema | A-SEC-001 |
| Generic log value 泄密 | allowlist event | A-HIST-002 |
| Bundle 包含 JWT/token | exact scan | A-SEC-001 |
| Bundle 包含 raw env/config | serializer | A-EXP-004 |
| URL 泄露 userinfo/query | sanitizer | A-SEC-002 |
| 路径泄露 username | home redaction | A-SEC-003 |
| 任意路径写入 | Main Save Dialog | A-EXP-001 |
| 覆盖用户文件 | exclusive create | A-EXP-002 |
| Diagnostics 触发网络 | read-only aggregator | A-DIAG-002 |
| destructive recovery | guided owner only | A-REC-002 |
| auto upload | forbidden | NEG-EXP-001 |

Renderer MUST NOT 提供 export path。Existing target/symlink MUST block。Bundle 是 JSON，不执行、不自动打开。

# 19. Observability

v1.4 新增/扩展事件：

```text
runtime_provider_diagnostics
runtime_provider_support_export
runtime_provider_recovery
```

## 19.1 Diagnostics Stages

```text
BUILD
SANITIZE
RETURN
```

## 19.2 Export Stages

```text
BUILD
SERIALIZE
DIALOG
CREATE
WRITE
VERIFY
COMPLETE
CLEANUP
```

## 19.3 Recovery Stages

```text
REQUEST
DELEGATE
RESULT
```

每次 operation 至少记录：

```text
operation_id
stage
status
timestamp
profile
runtime_state
error_code
result
```

MUST NOT 记录：

```text
api key
JWT
Authorization
secret metadata
raw request/response body
```

---

# 20. Acceptance Design Standard

## A-DIAG-001 — Snapshot Aggregates Current State

### Requirement Refs
`REQ-DIAG-001`

### Given

```text
profile=default
mode=local
session exists
Runtime=ACTIVE
Scheduler=SCHEDULED
lastProbe.gatewayHealthy=true
Projection=MATCH
```

### When
调用 `getRuntimeProviderDiagnostics("default")`。

### Then

Snapshot 对应当前状态。

### Oracle

```text
schema validation PASS
summaryStatus == READY
runtimeProvider.state == ACTIVE
reconcile.schedulerState == SCHEDULED
projection.status == MATCH
gateway.gatewayHealthy == true
```

### Evidence
`TEST-A-DIAG-001`

---

## A-DIAG-002 — Diagnostics Is Network Read-only

### Requirement Refs
`REQ-DIAG-001`

### Given
NodeDeskClaw / NEW-API / Gateway restart spy。

### When
连续读取 Snapshot 100 次。

### Then / Oracle

```text
NodeDeskClaw call count == 0
NEW-API call count == 0
Gateway restart count == 0
managed file write count == 0
SQLite managed update count == 0
```

### Evidence
`TEST-A-DIAG-002`

---

## A-DIAG-003 — Missing Optional Observations Do Not Fail

### Given

```text
lastProbe=null
Projection Check absent
Scheduler never accepted result
```

### When
读取 Snapshot。

### Oracle

```text
gateway.observed == false
projection.status == UNKNOWN
timestamps == null
snapshot schema PASS
```

---

## A-HIST-001 — History Capacity

### Requirement Refs
`REQ-HIST-001`

### Given
依次记录 250 条合法 Diagnostics Event。

### Oracle

```text
history.length == 200
history[0] == input[50]
```

---

## A-HIST-002 — Strict Event Allowlist

### Requirement Refs
`REQ-HIST-001`

### Given

```json
{
  "stage": "FETCH",
  "innocentField": "sk-secret-sentinel",
  "api_key": "sk-secret-sentinel"
}
```

### When
记录 event。

### Oracle

```text
innocentField absent
api_key absent
secret sentinel occurrence == 0
```

此 Acceptance 用于证明系统是 allowlist，而不是只做字段名 blacklist。

---

## A-HIST-003 — Recorder Failure Does Not Break Runtime

### Given
Recorder 被注入异常。

### When
Orchestrator 正常记录 operation event。

### Oracle

```text
Runtime operation final state unchanged
Recorder exception does not escape runtime flow
```

---

## A-SCHED-001 — Scheduler Diagnostics Timestamps

### Requirement Refs
`REQ-SCHED-001`

### Given
accepted READY at `T1`，下一轮 delay=`D`。

### Oracle

```text
lastAttemptAt == T1
lastSuccessfulFetchAt == T1
nextDueAt == T1 + D
```

---

## A-SCHED-002 — Stop Clears Due

### When
`scheduler.stop()`。

### Oracle

```text
schedulerState == STOPPED
nextDueAt == null
activeTimerCount == 0
```

休眠恢复遇到 FETCHING、APPLYING 或 CLEARING，且原 timer 仍在时：

```text
nextDueAt 保持原到期时间
activeTimerCount == 1
lastResult == SKIPPED_BUSY
lastAttemptAt 不变
```

---

## A-PROJ-001 — Successful Repair Records MATCH

### Requirement Refs
`REQ-PROJ-001`

### Given
pre-check=`DRIFTED`。

### When
Projection repair + Gateway restart 成功。

### Oracle

```text
post-check == MATCH
lastProjectionCheck.status == MATCH
Runtime state == ACTIVE
```

---

## A-PROJ-002 — Post-apply Drift Blocks ACTIVE

### Requirement Refs
`REQ-PROJ-001`

### Given
注入 repair 后依然存在 `ACTIVE_DEFAULT_DRIFT`。

### When
执行 post-apply integrity check。

### Oracle

```text
ACTIVE event count for new revision == 0
rollback invoked == 1
final state == ERROR
errorCode == RUNTIME_PROVIDER_POST_APPLY_DRIFT
```

检查函数抛异常时，oracle 相同。

---

## A-PROJ-003 — Identity Conflict Recorded

### Given
reserved Provider identity conflict。

### Oracle

```text
projection.status == IDENTITY_CONFLICT
runtime error == MANAGED_PROVIDER_IDENTITY_CONFLICT
managed mutation count == 0
```

---

## A-IPC-001 — Renderer Receives Strict Snapshot

### Requirement Refs
`REQ-IPC-001`

### Oracle

```text
response validates RuntimeProviderDiagnosticsSnapshot v1
unknown field count == 0
```

---

## A-IPC-002 — IPC Inputs Cannot Inject State

### Given
Renderer 尝试发送额外字段：

```json
{
  "profile": "default",
  "apiKey": "x",
  "state": "ACTIVE"
}
```

### Oracle

```text
extra state fields ignored/rejected
snapshot state comes from Main
runtime mutation count == 0
```

---

## A-UI-001 — Enterprise Runtime Card ACTIVE

### Requirement Refs
`REQ-UI-001`

### Given
Snapshot `ACTIVE / READY`。

### Then

Card 显示：

```text
企业模型已就绪
default model
model count
last successful sync
next reconcile
Gateway healthy
Projection MATCH
运行凭证已加载
```

### Oracle

```text
secret text occurrence == 0
expected labels visible == true
```

---

## A-UI-002 — Managed Providers UX Is Read-only

### Given

```text
local
stored session exists
Runtime != UNBOUND
```

### Oracle

```text
Enterprise Runtime card visible
enterprise-conflicting Provider mutation controls disabled/explained
Auxiliary tab remains usable
Main settings lock still enforced
英文源文案包含 RPB-D-05 的两句
组件源码中文硬编码句数 == 0
```

---

## A-UI-003 — Diagnostics Unavailable Fails Safe

### Given
Diagnostics IPC reject。

### Oracle

```text
card shows diagnostics unavailable
Providers page still renders
raw env/config fallback count == 0
```

---

## A-REC-001 — Reconcile Uses Existing Owner

### Requirement Refs
`REQ-REC-001`

### When
点击 `Retry / Reconcile`。

### Oracle

```text
existing runtime-provider-refresh IPC count == 1
Renderer direct fetchRuntimeBootstrap count == 0
Renderer direct projection write count == 0
```

---

## A-REC-002 — Identity Conflict Is Not Auto-deleted

### Given
`MANAGED_PROVIDER_IDENTITY_CONFLICT`。

### Oracle

```text
delete provider action absent
force reset action absent
Export Diagnostics available
RUNTIME_BOOTSTRAP_UNAUTHORIZED 的 Retry 按钮数 == 0
RUNTIME_PROVIDER_POST_APPLY_DRIFT 的 Retry 按钮数 == 1
```

---

## A-REC-003 — Gateway Recovery Is Navigation-only

### Given
Gateway unhealthy。

### When
点击 `Open Gateway`。

### Oracle

```text
navigation target == gateway
runtimeRestart invocation from Enterprise Runtime card == 0
```

---

## A-EXP-001 — Export Uses Main Save Dialog

### Requirement Refs
`REQ-EXP-001`

### When
Renderer 请求 Export。

### Oracle

```text
Renderer output-path argument count == 0
Main Save Dialog call count == 1
```

---

## A-EXP-002 — Existing Target Is Preserved

### Given
目标文件存在，digest=`H0`。

### When
Export 选择该 path。

### Oracle

```text
error == DIAGNOSTICS_EXPORT_TARGET_EXISTS
target digest == H0
write count == 0
```

---

## A-EXP-003 — Bundle Validates / Size Bounded

### Given
History 200 条，构造接近尺寸上限。

### Oracle

```text
JSON parse PASS
Bundle schema PASS
file size <= 1 MiB
snapshot present == true
history oldest rows trimmed only when required
```

---

## A-EXP-004 — Bundle Contains No Raw Config / Secret

### Given
已知 sentinel Secret 同时存在于：

```text
Managed Secret
.env fixture
providers fixture
credential pool fixture
```

### Oracle

```text
sentinel occurrence == 0
raw .env content occurrence == 0
raw config content occurrence == 0
raw providers content occurrence == 0
```

---

## A-SEC-001 — Secret Zero Across Public Diagnostics

### Requirement Refs
`REQ-SEC-001`

### Oracle

对以下四类结果：

```text
Snapshot
History
Support Bundle
Renderer state
```

搜索：

```text
known Member Key
known JWT
known Authorization
```

结果全部：

```text
0
```

---

## A-SEC-002 — URL Redaction

### Given

```text
https://user:pass@host:3900/v1?token=abc#frag
```

### Oracle

```text
https://host:3900/v1
```

---

## A-SEC-003 — User Home Redaction

### Given

```text
home=C:\Users\alice
path=C:\Users\alice\AppData\Local\SMC
```

### Oracle

```text
output begins with <USER_HOME>
"alice" occurrence == 0
```

---

## A-SEC-004 — Secret Metadata Is Forbidden

### Oracle

Public schema 不存在：

```text
secretLength
secretPrefix
secretSuffix
secretFingerprint
apiKeyHash
```

---

## A-OPS-001 — State Event Refreshes Operations Card

### Requirement Refs
`REQ-OPS-001`

### Given
Providers 可见，当前 `STALE_ACTIVE`。

### When
收到 Runtime State Event `ACTIVE`。

### Oracle

```text
Diagnostics reload count == 1
card eventually summaryStatus == READY
```

---

## A-OPS-002 — No Renderer Diagnostics Polling

### Oracle

fake timers 跑 10 分钟，无 state/user event：

```text
periodic diagnostics IPC call count == 0
```

---

## A-GATE-001 — Entry Gate

### Requirement Refs
`REQ-GATE-001`

### Oracle

2026-09-28 用户放行之后：

```text
v1.2 Golden == BLOCKED
v1.3 Golden == BLOCKED
v1.4 status == APPROVED_FOR_PLAN
```

未执行的 Golden 被写成 PASS 时，Evidence 为 FAIL。

---

## A-EVID-001 — Real Operations Card

### Requirement Refs
`REQ-EVID-001`

真实环境中分别触发：

```text
ACTIVE
STALE_ACTIVE
NOT_READY
ERROR
```

Oracle：

```text
summaryStatus / action mapping 与 §8 一致
```

---

## A-EVID-002 — Real Bundle Security

真实 Member Key/JWT 环境导出 Bundle。

Oracle：

```text
Member Key exact occurrence == 0
JWT exact occurrence == 0
Authorization exact occurrence == 0
Bundle schema PASS
```

---

## A-EVID-003 — Diagnostics Does Not Alter Data Plane Architecture

Golden：

```text
Diagnostics reads/exports executed
Hermes direct NEW-API Chat succeeds
NodeDeskClaw inference request count == 0
Diagnostics read NodeDeskClaw/NEW-API request count == 0
```

---

# 21. Acceptance Input Matrix

| Case | Runtime | Scheduler | Projection | Gateway | Expected Summary | Recovery |
|---|---|---|---|---|---|---|
| 1 | ACTIVE | SCHEDULED | MATCH | healthy | READY | Reconcile/Export |
| 2 | STALE_ACTIVE | BACKOFF | MATCH | healthy | DEGRADED | Retry/Export |
| 3 | NOT_READY | SCHEDULED | UNKNOWN | healthy | ACTION_REQUIRED | Admin guidance/Retry/Export |
| 4 | ERROR unavailable | BACKOFF | MATCH | healthy | ACTION_REQUIRED | Retry/Export |
| 5 | ERROR conflict | SCHEDULED | IDENTITY_CONFLICT | healthy | ACTION_REQUIRED | Export |
| 6 | ACTIVE | SCHEDULED | MATCH | unhealthy | ACTION_REQUIRED | Reconcile/Export/Open Gateway |
| 6b | STALE_ACTIVE | BACKOFF | MATCH | unhealthy | DEGRADED | Retry/Export/Open Gateway |
| 6c | ERROR unauthorized | SCHEDULED | MATCH | healthy | ACTION_REQUIRED | Export |
| 7 | FETCHING | RUNNING | MATCH | healthy | INITIALIZING | none |
| 8 | APPLYING | RUNNING | DRIFTED | healthy | INITIALIZING | none |
| 9 | UNBOUND | STOPPED | UNKNOWN | null | UNBOUND | none |
| 10 | ACTIVE | SCHEDULED | UNKNOWN | null | READY | Reconcile/Export |
| 11 | repair | SCHEDULED | post DRIFTED | healthy | ERROR after rollback | Export/Retry |
| 12 | ACTIVE | SCHEDULED | MATCH | healthy | export existing path | BLOCK |
| 13 | ACTIVE | SCHEDULED | MATCH | healthy | bundle >1MiB | trim history |
| 14 | remote/ssh | STOPPED | any | any | enterprise control inactive | none |
| 15 | ACTIVE | SCHEDULED | MATCH | healthy | diagnostics IPC fail | fail-safe UI |

---

# 22. Negative Acceptance

```text
NEG-DIAG-001
Diagnostics read causes Bootstrap / NEW-API network
→ FAIL

NEG-HIST-001
History stores arbitrary unknown field
→ FAIL

NEG-PROJ-001
post-apply integrity != MATCH but Runtime sets ACTIVE
→ FAIL

NEG-IPC-001
Renderer receives Member Key / JWT
→ FAIL

NEG-UI-001
Enterprise card displays masked/prefix/suffix key
→ FAIL

NEG-REC-001
Operations card auto-deletes provider identity conflict
→ FAIL

NEG-REC-002
Operations card directly restarts Gateway
→ FAIL

NEG-EXP-001
Support Bundle automatically uploads
→ FAIL

NEG-EXP-002
Support Bundle overwrites existing file
→ FAIL

NEG-SEC-001
Support Bundle contains exact known secret
→ FAIL

NEG-OPS-001
Renderer starts periodic diagnostics polling
→ FAIL

NEG-ARCH-001
Diagnostics/recovery routes inference through NodeDeskClaw
→ FAIL
```

---

# 23. Failure Injection

| Injection Point | Failure | Required Postcondition |
|---|---|---|
| snapshot scheduler read | throw | snapshot safe/null or stable diagnostics error; no mutation |
| history recorder | throw | runtime operation continues |
| post-apply integrity | DRIFTED | T0 rollback; no ACTIVE |
| post-apply integrity | conflict | T0 rollback; ERROR |
| diagnostics serialization | throw | RUNTIME_DIAGNOSTICS_UNAVAILABLE; no mutation |
| bundle serialize | throw | file absent |
| Save Dialog | cancel | file absent |
| exclusive create | EEXIST | target unchanged |
| bundle write | partial/fail | partial new target removed best-effort |
| partial cleanup | fail | DIAGNOSTICS_EXPORT_CLEANUP_FAILED; no other file touched |
| card diagnostics | IPC fail | Providers page remains; no secret fallback |
| Reconcile | backend unavailable | existing STALE_ACTIVE/ERROR |
| Open Gateway | navigation fail | no runtime mutation |
| URL sanitizer | invalid | endpoint=null |
| path sanitizer | user home | username redacted |

---

# 24. Evidence Contract

每个 Required Acceptance 至少：

```json
{
  "acceptance_id": "A-EXP-004",
  "status": "PASS",
  "requirement_ids": ["REQ-EXP-001", "REQ-SEC-001"],
  "test_ids": ["TEST-A-EXP-004"],
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v6.2.1",
  "commit_sha": "<implementation-sha>",
  "command": "npx vitest run ...",
  "exit_code": 0,
  "oracle": {
    "bundle_schema_valid": true,
    "secret_occurrence": 0,
    "jwt_occurrence": 0,
    "raw_env_occurrence": 0
  },
  "timestamp": "<RFC3339>",
  "tool_version": "<version>",
  "evidence_files": []
}
```

Rules：

```text
SKIPPED != PASS
BLOCKED != PASS
test source exists != PASS
UI screenshot alone != security PASS
synthetic bundle != real Golden bundle
```

Evidence MUST 绑定 repo / branch / commit / command / timestamp / tool version。

---

# 25. Release Gate

Required：

```text
A-DIAG-001/002/003
A-HIST-001/002/003
A-SCHED-001/002
A-PROJ-001/002/003
A-IPC-001/002
A-UI-001/002/003
A-REC-001/002/003
A-EXP-001/002/003/004
A-SEC-001/002/003/004
A-OPS-001/002
A-GATE-001
A-EVID-001/002/003
ALL NEG-* PASS
```

任一 Required Acceptance：

```text
!= PASS
```

则：

```text
Release Gate FAIL/BLOCKED
process exit != 0
```

`CI green` 不能覆盖 Golden BLOCKED。

---

# 26. Golden Consumer / Real-world Acceptance

## 26.1 Immutable Identities

MUST 记录：

```text
smc-copilot implementation SHA
NodeDeskClaw SHA
Hermes version
Runtime adapter/contract
NEW-API deployment/version
test profile
test member（脱敏）
Bootstrap revision
default model
```

## 26.2 Golden Flow

```text
G1 Login。
G2 Runtime ACTIVE。
G3 Enterprise Runtime Card READY。
G4 导出 B1。
G5 B1 Secret/JWT exact scan = 0。
G6 只阻断 NodeDeskClaw。
G7 v1.3 自动 STALE_ACTIVE。
G8 Card DEGRADED。
G9 Chat 仍经 Hermes → NEW-API 成功。
G10 导出 B2；history 显示 unavailable/backoff。
G11 恢复 NodeDeskClaw。
G12 Reconcile → ACTIVE。
G13 制造安全、可恢复 Projection drift fixture。
G14 Reconcile → repair → post-check MATCH。
G15 Card Projection=MATCH。
G16 模拟/观察 Gateway unhealthy。
G17 Card ACTION_REQUIRED；Open Gateway 成功。
G18 导出 B3。
G19 Diagnostics API 自身 NodeDeskClaw/NEW-API request count=0。
G20 Chat inference 期间 NodeDeskClaw inference request count=0。
```

Synthetic Fixture MUST NOT 替代 G1～G20。

---

# 27. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test | Evidence | Gate |
|---|---|---|---|---|---|
| REQ-DIAG-001 | INV-DIAG-001/002 | A-DIAG-001/002/003 | TEST-A-DIAG-* | EVID-DIAG | REQUIRED |
| REQ-HIST-001 | INV-HIST-001 | A-HIST-001/002/003 | TEST-A-HIST-* | EVID-HIST | REQUIRED |
| REQ-SCHED-001 | scheduler semantics | A-SCHED-001/002 | TEST-A-SCHED-* | EVID-SCHED | REQUIRED |
| REQ-PROJ-001 | INV-PROJ-001 | A-PROJ-001/002/003 | TEST-A-PROJ-* | EVID-PROJ | REQUIRED |
| REQ-IPC-001 | read-only | A-IPC-001/002 | TEST-A-IPC-* | EVID-IPC | REQUIRED |
| REQ-UI-001 | INV-UI-001/002 | A-UI-001/002/003 | TEST-A-UI-* | EVID-UI | REQUIRED |
| REQ-REC-001 | INV-REC-001 | A-REC-001/002/003 | TEST-A-REC-* | EVID-REC | REQUIRED |
| REQ-EXP-001 | file-only | A-EXP-001/002/003/004 | TEST-A-EXP-* | EVID-EXP | REQUIRED |
| REQ-SEC-001 | secret zero | A-SEC-001/002/003/004 | TEST-A-SEC-* | EVID-SEC | REQUIRED |
| REQ-OPS-001 | no polling | A-OPS-001/002 | TEST-A-OPS-* | EVID-OPS | REQUIRED |
| REQ-GATE-001 | prior Golden | A-GATE-001 | TEST-A-GATE-001 | EVID-GATE | REQUIRED |
| REQ-EVID-001 | real consumer | A-EVID-001/002/003 | GOLDEN | EVID-GOLDEN | REQUIRED |

规则：

```text
任何 MUST 无映射 → PRD BLOCKED
任何 AC 无 Test → PRD BLOCKED
任何 Test 无 Oracle → PRD BLOCKED
任何 Required AC 无 Evidence → Release BLOCKED
```

---

# 28. Plan Generation Contract

只有：

```text
status = APPROVED_FOR_PLAN
```

才允许生成 `.plan.md`。2026-09-28 的状态放行使本文满足这一条件。

Plan 前仍 MUST：

```text
Source Integrity Gate：HEAD 与 baseline 相同，或已写出 impact diff
No SPEC_SEMANTIC_GAP
v1.2 Golden 与 v1.3 Golden 在未执行时记为 BLOCKED
```

Plan Phase：

```text
P0 Baseline / Golden Gate / Evidence Inventory
P1 Diagnostics Schemas + Strict Sanitizers
P2 Diagnostics History + Scheduler Diagnostics
P3 Projection Last-check + Post-apply Verify
P4 Main Diagnostics Aggregator + IPC / Preload
P5 Enterprise Runtime Operations Card
P6 Guided Recovery Wiring
P7 Support Bundle Export
P8 Security / Failure Injection / Regression
P9 Real Golden Consumer
P10 Evidence / Release Gate
```

Plan MUST NOT：

```text
修改 NodeDeskClaw
修改 Hermes Core
修改 NEW-API
增加第二 Provider
增加 model_limits
增加 Data Plane proxy
增加 bundle upload
增加 destructive reset
```

---

# 29. `.plan.md` 输出标准

每个 Todo MUST 包含：

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

状态：

```text
planned
implemented
verified
blocked
```

`implemented != verified`。

---

# 30. Code Review Contract

Review 顺序：

```text
1. Diagnostics 是否真正 read-only
2. Secret 是否由 allowlist 隔离
3. History 是否 bounded + memory-only
4. Scheduler diagnostics 是否改变调度语义
5. Post-apply integrity 是否在 ACTIVE 前
6. Post-apply failure 是否 rollback T0
7. Renderer 是否只拿 public snapshot
8. Recovery 是否只委托现有 owner
9. Bundle 是否只创建新文件
10. URL/path redaction
11. Providers managed UX 是否与 Main lock 一致
12. Golden 是否真实
```

Reviewer MUST 搜索：

```text
apiKey
api_key
Authorization
token
fingerprint
prefix
secret
runtime-provider-get-diagnostics
runtime-provider-export-diagnostics
showSaveDialog
checkManagedRuntimeProjection
RUNTIME_PROVIDER_POST_APPLY_DRIFT
runtime-provider-refresh
```

新增 Diagnostics DTO MUST 做 schema allowlist review。

---

# 31. PRD Quality Gate

## Architecture

```text
[x] Goal 唯一明确
[x] Operations 不成为第二个 Runtime owner
[x] Control/Data Plane 不变
[x] Scope / Non-goal 完整
[x] System Boundary 明确
```

## State

```text
[x] Runtime / Scheduler / Probe / Projection SOT 明确
[x] Diagnostics Snapshot 是 derived state
[x] History retention 明确
```

## Semantics

```text
[x] Summary Status mapping 明确
[x] Recovery Action mapping 明确
[x] Bundle Contract 明确
[x] URL/path redaction 明确
```

## Side Effects

```text
[x] Diagnostics read = 0 business mutation
[x] Export only new user file
[x] Recovery delegates existing owner
```

## Failure

```text
[x] Post-apply drift rollback明确
[x] Export failure postcondition明确
[x] Diagnostics unavailable fail-safe明确
```

## Acceptance

```text
[x] 每个 MUST 有 AC
[x] 每个 MUST NOT 有 Negative AC
[x] 高风险路径有 Failure Injection
[x] Oracle 可机器判断
```

## Evidence

```text
[x] Synthetic / Golden 分离
[x] Evidence 绑定 commit
[x] Secret scan 有 Oracle
[x] BLOCKED/SKIPPED != PASS
```

## Plan Readiness

```text
[x] 无 TBD
[x] Traceability 完整
[x] Source baseline 已定义
[ ] v1.2 Golden PASS
[ ] v1.3 Golden PASS
[x] User Review
[x] status = APPROVED_FOR_PLAN
```

---

# 32. PRD 禁止写法

禁止：

```text
“导出必要日志”
“适当脱敏”
“必要时修复”
“自动恢复”
“显示有用信息”
“保存诊断文件”
“保证不泄密”
```

必须使用：

```text
字段 allowlist
200-event ring
1 MiB cap
URL sanitizer
<USER_HOME> replacement
exact recovery mapping
exclusive create
Secret exact occurrence=0
Network call count=0
```

---

# 33. ID 体系

```text
REQ-DIAG-xxx
REQ-HIST-xxx
REQ-SCHED-xxx
REQ-PROJ-xxx
REQ-IPC-xxx
REQ-UI-xxx
REQ-REC-xxx
REQ-EXP-xxx
REQ-SEC-xxx
REQ-OPS-xxx
REQ-GATE-xxx
REQ-EVID-xxx

A-DIAG-xxx
A-HIST-xxx
A-SCHED-xxx
A-PROJ-xxx
A-IPC-xxx
A-UI-xxx
A-REC-xxx
A-EXP-xxx
A-SEC-xxx
A-OPS-xxx
A-GATE-xxx
A-EVID-xxx
```

---

# 34. Implementation Change Map

建议实施面：

```text
apps/work/src/shared/runtime-provider-diagnostics.ts
  ADD
  - Snapshot/Event/Bundle schema + guards

apps/work/src/main/runtime-provider/runtime-provider-diagnostics-history.ts
  ADD
  - 200-event ring
  - strict allowlist projection

apps/work/src/main/runtime-provider/runtime-provider-diagnostics.ts
  ADD
  - aggregate state
  - summary status
  - URL/path redaction

apps/work/src/main/runtime-provider/runtime-provider-observability.ts
  MODIFY
  - append strict diagnostics event
  - recorder failure isolation

apps/work/src/main/runtime-provider/runtime-provider-reconcile-scheduler.ts
  MODIFY
  - nextDueAt
  - lastTrigger
  - lastResult
  - lastSuccessfulFetchAt
  - diagnostics() read API
  - MUST NOT change scheduling semantics

apps/work/src/main/runtime-provider/runtime-provider-reconcile-bindings.ts
  MODIFY
  - read-only scheduler diagnostics

apps/work/src/main/runtime-provider/runtime-provider-orchestrator.ts
  MODIFY
  - Last Projection Check
  - post-apply integrity
  - RUNTIME_PROVIDER_POST_APPLY_DRIFT

apps/work/src/main/runtime-provider/runtime-provider-contract.ts
  MODIFY
  - add new stable error code

apps/work/src/main/runtime-provider/runtime-provider-support-export.ts
  ADD
  - bundle builder
  - 1 MiB cap
  - Save Dialog
  - exclusive create
  - cleanup

apps/work/src/main/ipc/register.ts
  MODIFY
  - runtime-provider-get-diagnostics
  - runtime-provider-export-diagnostics

apps/work/src/preload/index.ts
apps/work/src/preload/index.d.ts
  MODIFY
  - getRuntimeProviderDiagnostics
  - exportRuntimeProviderDiagnostics

apps/work/src/renderer/src/screens/Providers/EnterpriseRuntimeCard.tsx
  ADD

apps/work/src/renderer/src/screens/Providers/Providers.tsx
  MODIFY
  - Operations Card
  - managed-mode explanation
  - recovery actions
  - state-event reload

locale/i18n
  MODIFY

runtime-provider tests
renderer Providers tests
  ADD/EXPAND
```

MUST NOT 修改：

```text
NodeDeskClaw Backend
Hermes Agent Core
NEW-API
llm-proxy
remote/ssh send semantics
```

---

# 35. Definition of Done

```text
[ ] Source Integrity Gate PASS
[ ] v1.2 Golden PASS
[ ] v1.3 Golden PASS
[ ] Diagnostics Snapshot schema implemented
[ ] Snapshot network count=0
[ ] Snapshot runtime mutation=0
[ ] 200-event strict history
[ ] unknown fields cannot enter history
[ ] Scheduler diagnostics complete
[ ] nextDueAt semantics PASS
[ ] Last Projection Check implemented
[ ] post-apply MATCH required before ACTIVE
[ ] post-apply drift rollback PASS
[ ] strict Diagnostics IPC
[ ] Renderer Secret occurrence=0
[ ] Enterprise Runtime Card
[ ] managed Providers UX read-only/explained
[ ] Auxiliary tab unchanged
[ ] Reconcile delegates existing Orchestrator
[ ] Gateway action navigation-only
[ ] Support Bundle v1
[ ] Bundle <=1 MiB
[ ] existing target preserved
[ ] no auto upload
[ ] URL redaction PASS
[ ] USER_HOME redaction PASS
[ ] Member Key/JWT/Authorization occurrence=0
[ ] Renderer polling count=0
[ ] remote/ssh regression PASS
[ ] typecheck PASS
[ ] targeted tests PASS
[ ] Work build PASS
[ ] v1.4 Golden PASS
[ ] NodeDeskClaw inference request count=0
[ ] Required Evidence bound to implementation SHA
[ ] Release Gate PASS
```

---

# 36. 最终原则 / Target Architecture

```text
NodeDeskClaw
   │ Control Plane
   ▼
Runtime Bootstrap
   ▼
Continuous Reconcile
   ▼
Runtime Provider Orchestrator
 ┌───────────┼──────────────┬────────────┐
 ▼           ▼              ▼            ▼
Public     Scheduler      Projection    Gateway
State      Diagnostics      Check        Probe
 └───────────┴──────────┬───┴────────────┘
                        ▼
              Diagnostics Snapshot
                 ┌──────┴──────┐
                 ▼             ▼
            Operations       History
               Card            │
                 └──────┬──────┘
                        ▼
                  Support Bundle

Data Plane:
Chat → Local Hermes → NEW-API → LLM
```

最终不变量：

```text
1. Diagnostics 是 Projection，不是新的 SOT。
2. Diagnostics Read = 0 Network / 0 Runtime Mutation。
3. Member Key / JWT / Authorization 永不进入 Renderer/History/Bundle。
4. History = strict allowlist + bounded memory。
5. ACTIVE repair 必须以后置 Projection MATCH 为最终条件。
6. Operations Card 不成为第二个配置写入器。
7. Recovery 只能委托现有 Runtime owner。
8. Support Bundle 只能用户显式导出，不能自动上传。
9. Support Bundle 只能新建，不能覆盖已有用户文件。
10. NodeDeskClaw 仍然只是 Control Plane。
11. Hermes 仍然直接连接 NEW-API。
12. v1.2/v1.3 Golden 未 PASS 时，v1.4 不能进入 Plan。
13. Synthetic Test 不能替代真实 Golden。
14. IMPLEMENTED 不等于 VERIFIED。
```
