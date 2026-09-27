---
title: "smc-copilot Runtime Provider Bootstrap v1.2 Closure / Reconcile / Runtime UX 方案 PRD"
subtitle: "从 IMPLEMENTED 收敛到 VERIFIED：并发串行化、事务闭环、投影一致性、运行态事件与 Golden Consumer"
prd_id: "PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-CLOSURE-V1.2"
version: "1.2"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "e83aaba9afb62dda047aa922badf319a8b0a3cb7"
parent_prd: "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.0.md @ version 1.1 / APPROVED_FOR_PLAN"
external_contract_repository: "loudon84/nodeskclaw"
external_contract_branch: "main"
external_contract_commit: "7abb73e90e163f85257208ac4aa58e4914d2da6e"
owner: "Work Platform / Runtime Provider"
reviewers:
  - "Product"
  - "Architecture"
  - "Desktop Main"
  - "Hermes Runtime"
  - "Backend Integration"
  - "Security"
  - "QA"
created_at: "2026-09-27"
updated_at: "2026-09-27"
target_release: "Work Runtime Provider Bootstrap v1.2 Closure"
change_type:
  - "BROWNFIELD_CHANGE"
  - "BUGFIX"
  - "GOVERNANCE"
  - "INTEGRATION"
golden_consumer: "smc-copilot apps/work + local Hermes Gateway + NodeDeskClaw Runtime Bootstrap + enterprise NEW-API"
related_docs:
  - "需求PRD工程模板.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.0.md"
  - ".cursor/plans/runtime_bootstrap_plan_3eb14da3.plan.md"
  - "NodeDeskClaw runtime bootstrap @ 7abb73e90e163f85257208ac4aa58e4914d2da6e"
supersedes: null
---

# 0. PRD 使用原则

本 PRD 严格按《需求PRD工程模板.md》v1.0 输出，作为 **Human + AI Coding Machine-Executable Engineering Contract**。

本 PRD 是 **Closure Delta PRD**：

```text
Parent PRD:
  Runtime Provider Bootstrap v1.1
  → 定义并完成主链实现

本 PRD v1.2:
  → 不重新设计 Bootstrap
  → 不重新设计 Provider Identity
  → 不重新设计 Chat Transport
  → 只处理当前实现的可靠性、事务、并发、Runtime UX 与 Evidence Closure
```

优先级：

```text
§0.5 Grilling 决定 RPB-C-01～RPB-C-07
    >
本 PRD 其余 MODIFY / ADD 的语义
    >
Parent PRD v1.1
    >
当前源码行为
```

未被本 PRD 修改的 Parent PRD 语义继续有效。`RPB-C-01`～`RPB-C-07` 覆盖本文后文与之冲突的句子。

## 0.5 Grilling 决定（最高优先级）

2026-09-27 grilling 确认。profile 比较沿用现有约定：空字符串和文件侧 `undefined` 都等于元数据里的 `"default"`。

```text
RPB-C-01
desktop_session_metadata.profile_id 明确不等于目标 profile 的会话覆盖 MUST PRESERVE。
缺元数据的覆盖行位于目标 profile 的 state.db，MUST 按 Parent D-08 改写成企业默认模型。
目标 profile 数据库里，除上述其它 profile 行以外的全部覆盖 MUST 改写，
包括 session_kind=work / execution_provider=skill-run 的行。
skill-run 不读取 desktop_session_model_overrides。
改写这些行 MUST NOT 改变 skill-run 的执行路径。
MUST NOT 把其它 profile 的行改写成企业默认模型。

RPB-C-02
受管写入使用进程级单写者锁。managed mutation concurrency MUST <= 1。
被取代的操作若已经写入，MUST 先回到自己的 T0，再释放锁。
superseded operation MUST NOT set ACTIVE。

RPB-C-03
Same Revision NO-OP 仅当 public state 为 ACTIVE、revision 相同、
内存密钥与本次 READY api_key 相同、ProjectionIntegrity 为 MATCH。
此时文件写入次数为 0，Gateway 重启次数为 0。
同一 revision 且投影 DRIFTED 时，修复走完整受管事务，包含 Gateway 重启。

RPB-C-04
Chat 模型选择器显示 §9.4 / REQ-UI-001 的全部状态语义，
包括 FETCHING、APPLYING、CLEARING、ACTIVE、STALE_ACTIVE、
NOT_READY、ERROR、UNBOUND。
这些中文句子是语义，渲染源文案 MUST 为英文。
「刷新企业模型」按钮只出现在 Chat 模型选择器，
且只在 STALE_ACTIVE、NOT_READY、ERROR 显示。
FETCHING、APPLYING、CLEARING、ACTIVE、UNBOUND 不显示该按钮。

RPB-C-05
登出意图等待中的旧操作回滚失败时，登出 MUST 继续。
旧操作记录 RUNTIME_PROVIDER_ROLLBACK_FAILED。
内存密钥清除，Gateway purge。
purge 成功则公共状态为 UNBOUND。
purge 失败才是 RUNTIME_SECRET_PURGE_UNVERIFIED。
登出仍执行 Parent D-09 的 adoption 恢复。
留下的文件不一致由下一次登录的漂移修复处理。
没有登出意图、且本次事务自身回滚失败时：
  state=ERROR
  error=RUNTIME_PROVIDER_ROLLBACK_FAILED
  Chat BLOCK

RPB-C-06
runtime-provider-refresh 不受 RUNTIME_PROVIDER_SETTINGS_LOCKED 拒绝。
它只调用编排器。
活动模型、LLM Provider、模型库、凭证池、OAuth、工具密钥、
浏览器自动化、语音、研究训练、消息平台的用户写入仍然锁定。
未登录，或 connection mode 不是 local 时，刷新不执行 bootstrap，
公共状态保持 UNBOUND。

RPB-C-07
活动模型为 nodeskclaw 且内存没有成员密钥时，
本地发送 MUST 返回 RUNTIME_NOT_READY，模型请求次数为 0。
用户改选本地模型后，按未绑定的现有路由发送。
```

## 0.1 PRD 职责

本文必须同时回答：

```text
WHY          为什么当前 IMPLEMENTED 仍不能直接视为 VERIFIED
WHAT         Closure 后得到什么
BOUNDARY     哪些能力修复，哪些能力明确不扩展
STATE        Runtime 状态的事实源与事件传播
INPUT        Bootstrap / Refresh / Logout / Profile Switch
OUTPUT       确定的 ACTIVE / NOT_READY / ERROR / STALE_ACTIVE
SIDE EFFECT  哪些文件、SQLite row、Memory Secret、Gateway 允许修改
FAILURE      并发、Restart、Rollback、State Event 失败后的确定结果
ACCEPTANCE   如何机器判断闭环是否完成
EVIDENCE     如何证明真实 NodeDeskClaw → Hermes → NEW-API 链路
```

## 0.2 强制规范关键词

```text
MUST
MUST NOT
SHOULD
SHOULD NOT
MAY
```

- `MUST`：必须实现、必须测试、必须有 Evidence。
- `MUST NOT`：违反即 Requirement FAIL。
- `SHOULD`：默认应满足；偏离必须记录原因。
- `SHOULD NOT`：原则上禁止；偏离必须记录原因。
- `MAY`：可选，不影响主 Release Gate。

所有 `MUST / MUST NOT` MUST 映射至少一个 Acceptance。

## 0.3 No-Inference Rule

若 Plan/Coding Agent 无法从本 PRD 唯一确定以下任何事项：

```text
并发操作谁覆盖谁
mutation lock 的范围
generation 何时递增
旧操作何时允许 rollback
T0 包含哪些状态
Session Override 的 profile scope
Same Revision 何时允许 NO-OP
Projection Drift 的完整判定
Runtime State Event 的 payload
Renderer 如何从 FETCHING 收敛到 ACTIVE
Explicit Refresh 的副作用
Golden Consumer PASS/BLOCKED 规则
```

则：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT 自行选择“合理实现”
```

## 0.4 Source Integrity Gate

```text
repository: loudon84/smc-copilot
branch: work/prd-v6.2.1
commit: e83aaba9afb62dda047aa922badf319a8b0a3cb7
```

NodeDeskClaw：

```text
repository: loudon84/nodeskclaw
branch: main
commit: 7abb73e90e163f85257208ac4aa58e4914d2da6e
endpoint:
  POST /api/v1/runtime/model-bootstrap
```

进入 `APPROVED_FOR_PLAN` 前 MUST：

```text
1. 再次确认 work/prd-v6.2.1 当前实施基线。
2. 如果 HEAD 已变化，输出 e83aaba9.. → 新 HEAD 的 impact diff。
3. 确认 NodeDeskClaw Bootstrap Contract 未破坏 Parent PRD v1.1 Contract。
4. 确认本 PRD 不是在另一个分支实施。
```

2026-09-27 检查记录：

```text
branch: work/prd-v6.2.1
HEAD: e83aaba9afb62dda047aa922badf319a8b0a3cb7
impact diff: 无。HEAD 等于本文基线。
NodeDeskClaw pin: 7abb73e90e163f85257208ac4aa58e4914d2da6e
本文不修改 Bootstrap 请求体、路径或 Parent PRD v1.1 Contract。
RPB-C-01～RPB-C-07 已覆盖正文冲突句。
status: APPROVED_FOR_PLAN
本状态允许生成 .plan.md。计划本身在自己的评审通过前保持 planned。
```

---

# 1. 文档元数据 / Current Implementation Baseline

## 1.1 当前实施状态

当前提交：

```text
e83aaba9afb62dda047aa922badf319a8b0a3cb7
feat(work): bootstrap local chat onto the enterprise model provider
```

当前已形成：

```text
apps/work/src/main/runtime-provider/
  managed-runtime-secret-store.ts
  nodeskclaw-bootstrap-client.ts
  runtime-provider-contract.ts
  runtime-provider-observability.ts
  runtime-provider-orchestrator.ts
  runtime-provider-projection.ts
  *.test.ts
```

主链状态：

```text
Bootstrap Client          IMPLEMENTED
Managed Memory Secret     IMPLEMENTED
Hermes env overlay        IMPLEMENTED
Provider Projection       IMPLEMENTED
Managed Model Projection  IMPLEMENTED
Login / Restore / Logout  IMPLEMENTED
Chat Picker Gate          IMPLEMENTED
Local Send Gate           IMPLEMENTED
Settings Lock             IMPLEMENTED
Evidence Closure          NOT VERIFIED
```

## 1.2 当前关键源码事实

### Fact A — Bootstrap Contract 已落地

```text
providerKey = nodeskclaw
providerRef = named:nodeskclaw
keyEnv = NODESKCLAW_RUNTIME_MODEL_API_KEY
apiMode = chat_completions
```

READY Contract 已严格校验：

```text
state == READY
provider == new-api
revision non-empty
base_url = http/https
api_key non-empty
default_model ∈ models[]
model id unique
```

### Fact B — Secret 已 memory-only

`ManagedRuntimeSecretStore` 当前保存：

```text
profile
identity epoch
apiKey
revision
```

Hermes child env 通过 overlay 注入 Reserved Key；不要求把 Member Key 写入持久文件。

### Fact C — Projection 已落地

READY apply 当前会修改：

```text
config.yaml
  providers.nodeskclaw
  model.provider
  model.default

providers.json
  providerKey=nodeskclaw
  no secret

models.json
  providerRef=named:nodeskclaw rows

runtime-provider-adoption.json

desktop_session_model_overrides
  session routing override
```

### Fact D — Orchestrator 已实现 Runtime State

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

### Fact E — 当前并发控制仍为全局 ticket

当前代码使用：

```text
let ticket = 0
operation:
  const mine = ++ticket
```

已发生 mutation 的旧 operation 在检测到 `mine != ticket` 后仍可能执行旧 snapshot rollback。

### Fact F — 当前 Snapshot 不含 Session Override

当前 file snapshot 仅包括：

```text
config.yaml
providers.json
models.json
runtime-provider-adoption.json
```

而 projection 同时会更新 `desktop_session_model_overrides`。

### Fact G — Session Override 自身不带 profile

`desktop_session_model_overrides` 仅以 `session_id` 为主键；profile ownership 必须从 `desktop_session_metadata.profile_id` 解析。

### Fact H — Same Revision Check 尚不覆盖完整 Projection

当前 check 主要验证：

```text
providers.nodeskclaw baseUrl/keyEnv/apiMode
managed model id set
```

尚不能单独证明 Registry、active default、session override 等都与 Desired State 一致。

### Fact I — Renderer 当前只有 pull

Renderer 可调用：

```text
getRuntimeProviderState(profile)
```

但尚无正式 `runtime-provider-state-changed` push Contract。

### Fact J — 当前已有 Synthetic Tests，但 Required Evidence 未闭合

已有测试覆盖主流程和部分失败场景；本 PRD补齐：

```text
concurrency race
full transaction rollback
session override rollback
profile-scoped session mutation
full projection drift
runtime state event
real Golden Consumer
```

---

# 2. 一句话目标

让 **当前已经 IMPLEMENTED 的 Runtime Provider Bootstrap** 在用户登录、Session Restore、Refresh、Profile Switch、NOT_READY、Logout 和 Gateway Failure 等并发/异常场景下，通过 **单写者并发编排、完整受管事务、Projection Reconcile、Runtime State Push 与真实 Golden Consumer 验收** 收敛到可证明的 `VERIFIED`，同时保证：

```text
Member Key 仍不落盘；
NodeDeskClaw 仍只属于 Control Plane；
Local Hermes 仍直接调用 NEW-API；
后发身份/注销意图永远不能被旧操作覆盖。
```

---

# 3. 背景与问题定义

## 3.1 Current State

Parent PRD v1.1 主链已经实现：

```text
NodeDeskClaw Login
  ↓
Runtime Bootstrap
  ↓
Electron Main
  ↓
Managed Provider + Models + Memory Secret
  ↓
Hermes Gateway
  ↓
NEW-API
```

当前代码已经证明“能运行”，但尚不能证明“在所有高风险边界下状态仍唯一且可恢复”。

## 3.2 Problem

```text
P-001 Global ticket 可以作废旧 operation，但不能独立保证旧 rollback 不覆盖新 apply。

P-002 Mutation Scope 包含 SQLite Session Override，
      Snapshot/Rollback Scope 当前不包含该资源。

P-003 当前 projection 读取全量 Session Override；
      active profile ownership 未从 session metadata 严格证明。

P-004 Same Revision No-op 的 Projection Check 不覆盖全部受管状态。

P-005 App Session Restore 使用异步 Bootstrap；
      Renderer 缺少 Runtime Provider State Push。

P-006 用户看到空 ModelPicker 时无法区分 FETCHING / NOT_READY / ERROR。

P-007 缺少统一 Explicit Refresh 入口。

P-008 当前 plan/test 文件不能替代 Required Evidence；
      尚无真实 NodeDeskClaw → Hermes → NEW-API Golden Consumer 证据。
```

## 3.3 Impact

```text
业务影响：
- Runtime 已 ACTIVE 时 UI 可能仍停留空模型状态。
- Backend 修改凭证/模型后缺少明确刷新入口。

工程影响：
- “后发意图胜出”尚未形成 serializable contract。
- rollback 无法恢复完整 T0。
- Same Revision 不能等价于完整 Projection 一致。

安全影响：
- Logout / NOT_READY / identity switch 属于高风险 Credential Lifecycle。
- 旧 operation 错误写回可能形成 stale identity projection。
- rollback 不覆盖 Session Override 会遗留旧路由身份。

运维影响：
- Main/Renderer Runtime State 可能漂移。
- 缺少真实架构验收，不能证明 NodeDeskClaw 未进入 inference data plane。
```

---

# 4. Scope

## 4.1 In Scope

```text
SCOPE-001 RuntimeProviderOperationCoordinator 单写者并发闭环。
SCOPE-002 Supersession generation/epoch 确定语义。
SCOPE-003 Managed Runtime Transaction T0 完整化。
SCOPE-004 Session Override 进入 snapshot/rollback。
SCOPE-005 Session Override mutation 严格按目标 profile 过滤。
SCOPE-006 Managed Projection Integrity Check 完整化。
SCOPE-007 Same Revision Drift Repair。
SCOPE-008 Runtime Provider State Change Main→Renderer Event。
SCOPE-009 Chat Runtime State UX。
SCOPE-010 Explicit Runtime Provider Refresh IPC / UI 入口。
SCOPE-011 Failure Injection 扩展。
SCOPE-012 Real Golden Consumer。
SCOPE-013 Evidence / Release Gate Closure。
```

## 4.2 Out of Scope

```text
NON-GOAL-001 MUST NOT 新增第二个 Model Provider。
NON-GOAL-002 MUST NOT 修改 NodeDeskClaw Runtime Bootstrap 业务 Contract。
NON-GOAL-003 MUST NOT 修改 Hermes Agent Core。
NON-GOAL-004 MUST NOT 修改 nodeskclaw-llm-proxy。
NON-GOAL-005 MUST NOT 把 NodeDeskClaw 引入 inference/chat/embedding/streaming data plane。
NON-GOAL-006 MUST NOT 将 NEW-API model_limits 纳入本阶段。
NON-GOAL-007 MUST NOT 增加固定周期后台轮询。
NON-GOAL-008 MUST NOT 重新设计 Provider Identity v2。
NON-GOAL-009 MUST NOT 重新设计 Chat Transport。
NON-GOAL-010 MUST NOT 将 Member Key 写入磁盘或 Renderer。
NON-GOAL-011 MUST NOT 删除 legacy hermesone。
NON-GOAL-012 MUST NOT 允许 NOT_READY 自动 fallback 到 hermesone/local provider。
NON-GOAL-013 MUST NOT 修改 remote/ssh 既有 Provider routing。
NON-GOAL-014 MUST NOT 将 Runtime Provider State 持久化为新的桌面 SOT。
```

## 4.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Bootstrap Contract | NodeDeskClaw | current login identity | desired provider/models/secret/revision | Desktop concurrency |
| Operation Coordination | smc-copilot Main | lifecycle intent | serialized mutation execution | Backend policy |
| Managed Transaction | smc-copilot Main | validated READY/NOT_READY | exact managed state | unrelated provider |
| Session Ownership | session metadata store | sessionId | profileId | credential |
| Projection Integrity | smc-copilot Main | desired + local applied | MATCH/DRIFT/CONFLICT | Backend mutation |
| Runtime State Push | Main/Preload | public state | Renderer event | secret |
| Runtime UX | Renderer Chat | public state | loading/not-ready/error UI | Provider mutation |
| Data Plane | Local Hermes + NEW-API | Member Key | inference stream | NodeDeskClaw |
| Evidence | QA/Automation | real environment | machine-readable proof | product runtime |

---

# 5. Terminology / Domain Model

| Term | Definition |
|---|---|
| Intent | login / restore / refresh / profile_switch / switch_local / not_ready / logout |
| Generation | Process 内单调递增版本；新 Intent 到达即递增 |
| Mutation Lock | Managed Runtime 的 process-global 单写者锁 |
| Superseded Operation | operation.generation != currentGeneration |
| T0 | 第一次受管 mutation 前的完整 Managed Scope 快照 |
| Managed File Scope | config.yaml、providers.json、models.json、runtime-provider-adoption.json |
| Managed Session Scope | 目标 profile 下允许被 Runtime Provider 改写的 session override rows |
| Managed Memory Scope | 当前 runtime secret + revision/public state metadata |
| Projection Integrity | Desired Bootstrap 与本地受管状态的一致性 |
| MATCH | 所有 required managed state 与 Desired State 等价 |
| DRIFTED | 无 identity conflict，但至少一个 required managed state 不一致 |
| IDENTITY_CONFLICT | reserved provider identity 被普通 Provider 占用 |
| State Push | Main public runtime state 变化后发给 Renderer 的无 secret IPC event |
| STALE_ACTIVE | Control Plane 暂不可达，但已应用 data plane 仍可继续 |
| Closure | 从 IMPLEMENTED 收敛为 VERIFIED，不扩业务能力 |

---

# 6. System Context

## 6.1 Context Diagram

```text
NodeDeskClaw
   │ Bootstrap
   ▼
RuntimeProviderOrchestrator
   ▼
RuntimeProviderOperationCoordinator
   ├─ Generation / Supersession
   └─ Mutation Lock
          │
          ▼
Managed Runtime Transaction
 ┌────────┼──────────┬─────────────┐
 ▼        ▼          ▼             ▼
YAML   Registry   Models    Session Override
 └────────┴─────┬────┴─────────────┘
                ▼
          Memory Secret
                ▼
          Hermes Restart
                ▼
             ACTIVE
                │
                ├─ State Event → Renderer
                ▼
       Local Hermes Gateway
                │ DIRECT
                ▼
              NEW-API
```

## 6.2 System Boundary

```text
Inside:
- operation coordinator
- orchestrator
- projection integrity
- session override scope/rollback
- state event
- refresh IPC
- runtime status UX
- tests/evidence

Outside:
- NodeDeskClaw Backend business changes
- Hermes Agent Core
- NEW-API internals
- remote/ssh Provider flow
```

---

# 7. Authoritative State / Source of Truth

| State | Role | Authoritative? | Writer | Reader | 自动覆盖 |
|---|---|---:|---|---|---:|
| Bootstrap READY/NOT_READY | DESIRED_STATE | YES | NodeDeskClaw | Orchestrator | NO |
| Bootstrap revision | DESIRED_STATE identity | YES | NodeDeskClaw | Orchestrator | NO |
| Bootstrap models/default | DESIRED_STATE | YES | NodeDeskClaw | Projector | NO |
| Bootstrap api_key | RUNTIME_SECRET | YES | NodeDeskClaw | Main/Hermes | NO |
| current Generation | RUNTIME_STATE | YES local | Coordinator | Orchestrator | YES |
| mutation lock | RUNTIME_STATE | YES local | Coordinator | Mutator | N/A |
| providers.nodeskclaw | LAST_APPLIED_STATE | NO | Projector | Hermes/Integrity | managed only |
| nodeskclaw Registry row | LAST_APPLIED_STATE | NO | Projector | Resolver/Integrity | managed only |
| managed model rows | LAST_APPLIED_STATE | NO | Projector | Picker/Integrity | managed only |
| active provider/default | LAST_APPLIED_STATE | NO | Projector | Chat/Integrity | managed fields |
| target-profile session overrides | LAST_APPLIED_STATE | NO | Projector | Chat/Integrity | managed rows only |
| session metadata profileId | RESOLVED_STATE/SOT | YES | session metadata domain | Scope Resolver | NO |
| runtime public state | RUNTIME_STATE | YES local | Orchestrator | Renderer | YES |
| Gateway probe | OBSERVED_STATE | YES health | RuntimeManager | Orchestrator | N/A |
| Evidence | EVIDENCE_STATE | YES | Test/QA | Review | append-only |

---

# 8. State Machine

## 8.1 Public State 保持兼容

```text
UNBOUND
FETCHING
APPLYING
ACTIVE
STALE_ACTIVE
NOT_READY
CLEARING
ERROR
```

## 8.2 Internal Operation State

```text
CREATED
  ↓ generation assigned
FETCHING
  ├─ superseded → ABORTED_SUPERSEDED
  ▼
WAIT_MUTATION_LOCK
  ├─ superseded → ABORTED_SUPERSEDED
  ▼
MUTATING
  ↓
RESTARTING
  ↓
VERIFYING
  ├─ current generation → COMMITTED
  └─ superseded → ROLLBACK_T0 → ABORTED_SUPERSEDED
```

## 8.3 Supersession Rule

任何新 Intent 到达：

```text
currentGeneration += 1
newOperation.generation = currentGeneration
```

MUST：

```text
进入 mutation lock 前检查 generation
取得 mutation lock 后再检查 generation
fetch/restart/probe 等高风险 async boundary 后检查 generation
superseded operation MUST NOT set ACTIVE
```

## 8.4 Mutation Serialization

```text
整个受管 Runtime Provider mutation scope 使用 process-global single-writer mutation lock。
managed mutation concurrency MUST <= 1。
```

## 8.5 Logout Priority

Logout Intent：

```text
1. generation 立即递增
2. public state 立即 CLEARING
3. Chat gate 立即关闭
4. 等待当前 holder rollback/释放 lock
5. purge
6. purge verified → UNBOUND
```

旧 operation MUST NOT 在 Logout Intent 后发布 `ACTIVE`。

---

# 9. Data / Schema Contract

## 9.1 Runtime Provider State Event

Schema ID：

```text
work.runtime-provider.state-event.v1
```

Channel：

```text
runtime-provider-state-changed
```

ACTIVE payload：

```json
{
  "profile": "default",
  "state": "ACTIVE",
  "backendState": null,
  "errorCode": null,
  "revision": "opaque",
  "providerRef": "named:nodeskclaw",
  "defaultModel": "model-a",
  "modelIds": ["model-a", "model-b"],
  "modelCount": 2
}
```

NOT_READY：

```json
{
  "profile": "default",
  "state": "NOT_READY",
  "backendState": "MODEL_CREDENTIAL_DISABLED",
  "errorCode": null,
  "revision": null,
  "providerRef": null,
  "defaultModel": null,
  "modelIds": [],
  "modelCount": 0
}
```

Rules：

```text
additionalProperties = false
MUST NOT contain api_key
MUST NOT contain Authorization/access token
MUST NOT contain secret fingerprint/prefix/length
```

## 9.2 Projection Integrity Result

```ts
type ProjectionIntegrity =
  | { status: "MATCH" }
  | { status: "DRIFTED"; reasons: ProjectionDriftReason[] }
  | {
      status: "IDENTITY_CONFLICT";
      errorCode: "MANAGED_PROVIDER_IDENTITY_CONFLICT";
    };
```

Reasons：

```text
YAML_PROVIDER_DRIFT
REGISTRY_DRIFT
MODEL_SET_DRIFT
MODEL_ROW_DRIFT
ACTIVE_PROVIDER_DRIFT
ACTIVE_DEFAULT_DRIFT
SESSION_OVERRIDE_DRIFT
ADOPTION_INVALID
```

## 9.3 Managed Transaction Snapshot

T0 MUST include：

```text
files:
  config.yaml bytes/absent
  providers.json bytes/absent
  models.json bytes/absent
  runtime-provider-adoption.json bytes/absent

session overrides:
  exact rows within target profile managed scope

memory:
  previous managed secret in memory
  previous revision
  previous public runtime state

runtime:
  pre-restart Gateway observed metadata
```

Snapshot MUST NOT 把 plaintext secret 写入 recovery artifact。

## 9.4 Runtime UX Mapping

本表中文是语义，不是界面渲染源文案。渲染源文案为英文，见 RPB-C-04。

| Runtime State | UI | ModelPicker | Send |
|---|---|---|---|
| FETCHING | 正在加载企业模型… | disabled/empty | BLOCK |
| APPLYING | 正在应用企业模型… | disabled/empty | BLOCK |
| CLEARING | 正在清除企业模型凭证… | disabled/empty | BLOCK |
| ACTIVE | 企业模型已就绪 | managed models | ALLOW |
| STALE_ACTIVE | 企业模型控制面暂不可用，继续使用已应用配置 | last managed models | ALLOW |
| NOT_READY | 显示 backendState 原因 | empty | BLOCK |
| ERROR | 显示 errorCode | empty | BLOCK |
| UNBOUND | 未绑定企业 Runtime | existing non-managed behavior | existing；活动模型为 nodeskclaw 且无内存密钥时 RUNTIME_NOT_READY，模型请求次数为 0（RPB-C-07） |

---

# 10. Requirement Unit

## REQ-CONC-001 — Serializable Runtime Provider Operations

### Goal

消除旧 operation rollback/commit 覆盖后发 Intent 的并发风险。

### Normative Requirement

```text
MUST 新增 RuntimeProviderOperationCoordinator 或语义等价组件。
MUST 使用 process-global single-writer mutation lock。
MUST 使用 monotonic generation。
MUST 在 Intent 到达时立即 generation++。
MUST 在等待 lock 前、取得 lock 后检查 generation。
MUST 在 Gateway restart/probe 返回后检查 generation。
MUST 保证 superseded operation 不得 set ACTIVE。
MUST 保证旧 operation rollback 时，新 operation 尚未进入 mutation section。
MUST 保证 Logout Intent 的最终状态优先于更早的 login/refresh/apply。
```

### Inputs

```text
reason = login|restore|refresh|profile_switch|switch_local|not_ready|logout
profile
```

### Preconditions

```text
Main process alive
```

### Authoritative State

```text
SOT: coordinator.currentGeneration
Observed: operation generation
Derived: superseded
```

### State Transition

```text
older operation + newer intent
→ older superseded
→ newest generation owns final commit
```

### Allowed Side Effects

```text
public runtime state
managed transaction under lock
```

### Forbidden Side Effects

```text
concurrent managed mutation
superseded ACTIVE commit
superseded rollback after newer mutation starts
```

### Ownership Scope

```text
OBJECT: RuntimeProviderOperationCoordinator
RESOURCE: managed mutation critical section
```

### Idempotency

相同 refresh 连续触发时，最终只有最新 generation 可 commit。

### Failure Semantics

```text
F-CONC-001
trigger: superseded before mutation
expected: ABORTED_SUPERSEDED
mutation: 0

F-CONC-002
trigger: superseded after mutation/restart began
expected:
  rollback own T0 while lock held
  no ACTIVE
  release lock
  newer intent continues
```

### Postconditions

```text
managed mutation concurrency max == 1
final public state belongs to latest generation
```

### Invariants

```text
INV-CONC-001 logout wins over older operation
INV-CONC-002 old rollback cannot overwrite newer committed projection
```

### Error Codes

```text
RUNTIME_PROVIDER_ROLLBACK_FAILED
```

### Acceptance

```text
A-CONC-001
A-CONC-002
A-CONC-003
```

### Evidence

```text
deferred-promise concurrency tests
ordered operation trace
```

---

## REQ-TXN-001 — Complete Managed Runtime Transaction

### Goal

失败后证明 `AfterRollback(managed_scope) == T0`。

### Normative Requirement

```text
MUST 将 T0 扩展到 Managed File Scope + target-profile Session Override + Managed Memory metadata。
MUST 在第一次 mutation 前捕获完整 T0。
MUST 在 Gateway restart/probe failure 时恢复 T0。
MUST 在 superseded-after-mutation 时恢复 T0。
MUST 将 Session Override rollback 纳入同一事务。
MUST NOT 只恢复文件而保留已改写 Session Override。
MUST NOT 把 plaintext secret 写入 snapshot file/recovery artifact。
```

### Inputs

```text
validated READY contract
target profile
target-profile session overrides
```

### Preconditions

```text
operation holds mutation lock
operation generation is current
```

### Authoritative State

```text
T0 = first mutation 前完整 managed scope
```

### State Transition

```text
T0 → project → secret → restart → verify → COMMIT
or
T0 → partial → fail/supersede → ROLLBACK → T0
```

### Allowed Side Effects

```text
managed files
target-profile session override
memory secret
Gateway lifecycle
```

### Forbidden Side Effects

```text
other-profile override
unrelated provider/model
secret persistence
```

### Ownership Scope

```text
FILES + ROWS + MEMORY OBJECT + Gateway RESOURCE
```

### Failure Semantics

```text
projection/restart/probe failure:
  rollback complete T0

rollback failure:
  RPB-C-05
  logout waiting → logout continues
  no logout intent → state=ERROR, Chat BLOCK
```

### Invariants

```text
INV-TXN-001 mutation scope == rollback scope
INV-TXN-002 recovery artifact secret count == 0
```

### Acceptance

```text
A-TXN-001
A-TXN-002
A-TXN-003
```

---

## REQ-SCOPE-001 — Profile-scoped Session Override Ownership

### Goal

禁止当前 profile enterprise projection 改写其它 profile session routing。

### Normative Requirement

```text
MUST 按 RPB-C-01 解析会话覆盖。
metadata.profile_id 明确不等于目标 profile 时 MUST PRESERVE。
缺元数据的行，以及目标 profile 数据库里其余覆盖（含 skill-run 行）MUST 按 Parent D-08 改写。
MUST NOT 改写其它 profile 的行。
skill-run 不读取该覆盖表，改写 MUST NOT 改变它的执行路径。
```

### Inputs

```text
session_id
desktop_session_metadata
target profile
```

### Authoritative State

```text
SOT: desktop_session_metadata.profile_id
```

### Allowed Side Effects

```text
target profile state.db rows except other-profile metadata rows
```

### Forbidden Side Effects

```text
other profile
```

### Failure Semantics

metadata unavailable：

```text
row is in the target profile state.db
rewrite per RPB-C-01 / Parent D-08
```

### Invariants

```text
INV-SCOPE-001 target profile apply不能改变其它 profile override digest
```

### Acceptance

```text
A-SCOPE-001
A-SCOPE-002
```

---

## REQ-CHECK-001 — Full Managed Projection Integrity

### Goal

Same Revision NO-OP 只有在完整 managed projection MATCH 时发生。

### Normative Requirement

MUST 新增：

```text
checkManagedRuntimeProjection(profile, desired)
```

至少检查：

```text
1. providers.nodeskclaw base_url/key_env/api_mode
2. providers.json managed row baseUrl/keyEnv/apiMode/providerKey，无 secret
3. managed models exact id set + provider/providerRef/baseUrl
4. config model.provider=nodeskclaw
5. config model.default=desired.defaultModel
6. target-profile session overrides合法
7. adoption file无 secret且语义合法
```

Same Revision NO-OP only if：

```text
state == ACTIVE
revision == desired.revision
managed secret == READY apiKey
ProjectionIntegrity == MATCH
```

否则：

```text
same revision + DRIFTED → repair
```

### Allowed Side Effects

Check：

```text
NONE
```

Repair：

```text
managed transaction only
```

### Failure Semantics

```text
IDENTITY_CONFLICT
→ MANAGED_PROVIDER_IDENTITY_CONFLICT
→ mutation=0
```

### Invariants

```text
INV-CHECK-001 Same Revision != Projection MATCH
INV-CHECK-002 ACTIVE NO-OP requires full MATCH
```

### Acceptance

```text
A-CHECK-001
A-CHECK-002
A-CHECK-003
```

---

## REQ-EVENT-001 — Runtime Provider State Push

### Goal

让异步 Session Restore / Refresh 后 Renderer 确定性收敛。

### Normative Requirement

```text
MUST 定义 runtime-provider-state-changed。
MUST 在 public state semantic change 后 emit。
MUST NOT 在相同 semantic payload 上制造事件风暴。
MUST 在 Preload 暴露 onRuntimeProviderStateChanged(callback)。
MUST 让 useModelConfig 订阅当前 profile event 并 reload。
MUST NOT 让其它 profile event 改当前 picker。
MUST NOT 在 event payload 放 secret。
```

### Allowed Side Effects

```text
IPC event
Renderer local state reload
```

### Forbidden Side Effects

```text
secret IPC
event handler持久化 provider/model
```

### Invariants

```text
INV-EVENT-001 Session Restore eventual ACTIVE 不依赖 unrelated event 才可见
```

### Acceptance

```text
A-EVENT-001
A-EVENT-002
A-EVENT-003
```

---

## REQ-UI-001 — Runtime Provider UX

### Goal

把空 ModelPicker 转换为可解释 Runtime 状态。

### Normative Requirement

§9.4 与下列中文是语义。渲染源文案 MUST 为英文，见 RPB-C-04。

Chat MUST 映射：

```text
FETCHING  → 正在加载企业模型…
APPLYING  → 正在应用企业模型…
CLEARING  → 正在清除企业模型凭证…
ACTIVE    → 正常 ModelPicker
STALE_ACTIVE → 企业模型控制面暂不可用，继续使用已应用配置

MODEL_NOT_CONFIGURED       → 管理员尚未配置企业模型
MODEL_CREDENTIAL_DISABLED  → 企业模型凭证已禁用
MODEL_CREDENTIAL_CLOSING   → 企业模型凭证正在关闭
MODEL_SYNC_NOT_READY       → 企业模型配置尚未同步完成
MODEL_LIST_EMPTY           → 管理员尚未配置运行模型
MODEL_DEFAULT_NOT_SET      → 管理员尚未设置默认模型
MODEL_DEFAULT_INVALID      → 默认模型配置无效
MODEL_PROVIDER_UNSUPPORTED → 当前模型 Provider 不受支持
MODEL_CREDENTIAL_INVALID   → 企业模型凭证无效

ERROR → errorCode 诊断提示
```

```text
MUST NOT 把 NOT_READY 显示成 Hermes 故障。
MUST NOT 在 NOT_READY/ERROR fallback 到其它 Provider。
MUST 保持 remote/ssh UX 不变。
```

### Acceptance

```text
A-UI-001
A-UI-002
A-UI-003
```

---

## REQ-REFRESH-001 — Explicit Runtime Provider Refresh

### Goal

让 Backend 配置变化无需重新登录即可收敛。

### Normative Requirement

MUST 新增 Main IPC：

```text
runtime-provider-refresh
```

仅在：

```text
connection mode = local
authenticated NodeDeskClaw session exists
```

执行：

```text
bootstrapRuntimeProvider("refresh", currentProfile)
```

Renderer MUST 在 Chat 模型选择器提供英文刷新按钮，可见性见 RPB-C-04。
该 IPC MUST NOT 被 RUNTIME_PROVIDER_SETTINGS_LOCKED 拒绝，见 RPB-C-06。
未登录或 connection mode 不是 local 时不执行 bootstrap，公共状态保持 UNBOUND。

Refresh MUST：

```text
复用 coordinator/generation/mutation lock
不绕过 Orchestrator
不直接 fetch/project
```

ACTIVE + transport fail：

```text
→ STALE_ACTIVE
→ preserve current data plane
```

Backend explicit NOT_READY：

```text
→ CLEARING → purge → NOT_READY
```

### Acceptance

```text
A-REFRESH-001
A-REFRESH-002
A-REFRESH-003
```

---

## REQ-OBS-001 — Closure Observability

### Goal

让并发/事务问题可以按 operation 还原。

### Normative Requirement

每次 Intent MUST 生成：

```text
operation_id UUID
generation integer
reason
profile
stage
status
runtime_state
revision
errorCode
```

Stages：

```text
INTENT
FETCH
WAIT_LOCK
LOCK_ACQUIRED
SNAPSHOT
CHECK
PROJECT
SESSION_OVERRIDE
SECRET
RESTART
VERIFY
ROLLBACK
EMIT_STATE
COMPLETE
```

MUST NOT 记录：

```text
api_key
Authorization
secret prefix/length/fingerprint
```

### Acceptance

```text
A-OBS-001
A-OBS-002
```

---

## REQ-EVID-001 — Verification / Golden Consumer Closure

### Goal

把当前状态从 IMPLEMENTED 收敛到 VERIFIED。

### Normative Requirement

Required Evidence MUST 分四层：

```text
L1 Contract / Unit
L2 Transaction / Concurrency
L3 Renderer / IPC Integration
L4 Live Golden Consumer
```

Golden Consumer MUST 证明：

```text
1. Login NodeDeskClaw
2. Bootstrap READY
3. Provider/Model projection MATCH
4. Secret persistent count = 0
5. Hermes child receives Member Key
6. Chat success
7. NEW-API receives inference
8. NodeDeskClaw inference request count = 0
9. Block NodeDeskClaw after ACTIVE
10. Existing Hermes → NEW-API Chat still succeeds
11. Disable MemberToken + explicit refresh
12. Desktop becomes NOT_READY and old key removed from local runtime
13. Rotate/re-enable Token + refresh
14. secret-only rotation does not rewrite managed files when projection unchanged
15. Gateway uses new key and Chat succeeds
```

### Acceptance

```text
A-EVID-001
A-EVID-002
A-EVID-003
```

---

# 11. Side-Effect Contract

| Operation | NodeDeskClaw | NEW-API | File Write | SQLite Override | Memory Secret | Gateway | Renderer Event |
|---|---:|---:|---:|---:|---:|---:|---:|
| state read | NO | NO | NO | NO | NO | NO | NO |
| bootstrap fetch | YES | NO | NO | NO | NO until validated | NO | state only |
| projection check | NO | NO | NO | NO | NO | NO | NO |
| READY MATCH no-op | NO extra | NO | NO | NO | keep | NO | MAY |
| READY repair | NO extra | NO | managed only | target profile only | install/replace | restart | YES |
| explicit refresh | YES | NO | conditional | conditional | conditional | conditional | YES |
| transport fail ACTIVE | attempted | NO | NO | NO | keep | keep | YES |
| explicit NOT_READY | YES | NO | retain projection | NO | CLEAR | restart/purge | YES |
| logout | MAY | NO | adoption restore only | NO | CLEAR | restart/purge | YES |
| Chat | NO | YES via Hermes | existing session effects | existing | Hermes reads | no restart | existing |

---

# 12. Ownership Contract

| Resource | Ownership |
|---|---|
| Bootstrap Contract | EXTERNAL_AUTHORITY |
| Runtime generation | GENERATED_ONLY / Main memory |
| Mutation lock | GENERATED_ONLY / Main memory |
| providers.nodeskclaw managed fields | FIELD / MANAGED |
| nodeskclaw Registry row | ROW / MANAGED |
| named:nodeskclaw model rows | ROW / MANAGED |
| active provider/default | FIELD / MANAGED while bound |
| session override | ROW / MANAGED per RPB-C-01 |
| other-profile session override | ROW / PRESERVE |
| missing-metadata session override | ROW / MANAGED rewrite |
| unrelated providers/models | USER_OWNED/PRESERVE |
| Managed Secret | GENERATED_ONLY / memory |
| Runtime public state | GENERATED_ONLY / memory |
| Renderer runtime state | OBSERVED COPY |

Drift：

```text
MATCH → no-op only when secret also matches, restart count 0（RPB-C-03）
DRIFTED → repair including Gateway restart
CONFLICT → BLOCK
other-profile override → PRESERVE
missing metadata override → rewrite（RPB-C-01）
```

---

# 13. Hash / Identity Contract

Backend revision：

```text
opaque
exact string equality
Desktop MUST NOT recompute
```

测试用 Managed Projection Digest：

```text
SHA256(
  canonical_json({
    provider_yaml_managed_fields,
    registry_managed_row,
    managed_model_rows_sorted,
    active_provider,
    active_default,
    target_profile_session_overrides_sorted
  })
)
```

规则：

```text
UTF-8
JSON keys sort ascending
arrays按 identity sort
不含 secret
不含非语义 timestamp
```

Session ownership：

```text
desktop_session_metadata.profile_id exact match target profile
```

---

# 14. Transaction Contract

## 14.1 Boundary

T0：

```text
managed files
target-profile session override rows
managed memory metadata
runtime public state
Gateway observed metadata
```

TXN excludes：

```text
NodeDeskClaw mutation
NEW-API mutation
unrelated local provider/model
other-profile session override
```

## 14.2 Commit Order

```text
validate
→ generation check
→ wait lock
→ generation check
→ snapshot T0
→ conflict check
→ full integrity check
→ project
→ session override
→ local semantic verify
→ secret install
→ Gateway restart
→ generation check
→ probe
→ generation check
→ post-apply integrity
→ ACTIVE
→ state event
→ Evidence
→ release lock
```

## 14.3 Failure Atomicity

step `project` 之后任何失败：

```text
rollback complete T0 while lock held
AfterRollback(managed_scope) == T0
```

Superseded：

```text
rollback own mutation before lock release
MUST NOT ACTIVE
```

## 14.4 Rollback Failure

有登出意图正在等待时，按 RPB-C-05：旧操作记下回滚失败，登出继续。

没有登出意图时：

```text
error = RUNTIME_PROVIDER_ROLLBACK_FAILED
state = ERROR
Chat = BLOCK
recovery artifact = sanitized metadata/digest only
secret persisted = NO
```

---

# 15. Conflict Contract

| Conflict | Detection | Behavior | Error | Mutation |
|---|---|---|---|---:|
| newer intent before mutation | generation | abort old | none | 0 |
| newer intent during mutation | generation + lock | old rollback then new | rollback error if fail | old→T0 |
| provider identity collision | integrity | BLOCK | MANAGED_PROVIDER_IDENTITY_CONFLICT | 0 |
| same revision + drift | integrity | repair | none if success | managed only |
| other-profile override | metadata | PRESERVE | none | 0 |
| unknown override ownership | metadata absent | rewrite to enterprise default per RPB-C-01 | none | target row only |
| Renderer stale state | state event | reload | none | UI |
| ACTIVE transport fail | transport | STALE_ACTIVE | RUNTIME_BOOTSTRAP_UNAVAILABLE | 0 |
| explicit NOT_READY | contract | purge | runtime not ready | secret clear |

---

# 16. Compatibility / Migration

```text
DB schema migration: NONE
file schema migration: NONE
Bootstrap contract migration: NONE
```

MUST 保持：

```text
Provider Identity v2
named:nodeskclaw
NODESKCLAW_RUNTIME_MODEL_API_KEY
models.json
providers.json v2
Hermes config.yaml
Auth session
remote/ssh
hermesone legacy
```

Unknown ownership：

```text
missing metadata in the target profile state.db → rewrite per RPB-C-01
other-profile metadata → PRESERVE
MUST NOT DELETE other-profile rows
```

---

# 17. External Dependency Contract

NodeDeskClaw：

```text
repo: loudon84/nodeskclaw
commit: 7abb73e90e163f85257208ac4aa58e4914d2da6e
API: POST /api/v1/runtime/model-bootstrap
```

Fallback：

```text
prior ACTIVE + transport fail → STALE_ACTIVE
no prior ACTIVE + transport fail → ERROR
explicit NOT_READY → no fallback
```

Hermes：

```text
RuntimeManager.restart(profile)
Gateway probe
managed env injection
```

NEW-API：

```text
Golden Consumer 中作为 Hermes 直接 Data Plane
```

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| stale operation 覆盖 logout/new identity | generation + single-writer lock | A-CONC-002 |
| rollback 遗留 session route | complete T0 | A-TXN-001 |
| cross-profile session rewrite | metadata profile ownership | A-SCOPE-001 |
| same revision 隐藏 drift | full integrity check | A-CHECK-002 |
| Renderer secret exposure | secret-free state event | A-EVENT-003 |
| refresh 绕过 Orchestrator | orchestrator-only IPC | A-REFRESH-001 |
| Member Key persistent | existing memory-only invariant | A-EVID-002 |
| Control Plane 进入 Data Plane | Golden proof | A-EVID-003 |
| log secret leak | structured redaction | A-OBS-002 |

MUST NOT log：

```text
api_key
Authorization
secret prefix
secret length
secret fingerprint
```


# 19. Observability

每个 operation event：

```json
{
  "event": "runtime_provider_operation",
  "operation_id": "uuid",
  "generation": 42,
  "reason": "refresh",
  "profile": "default",
  "stage": "LOCK_ACQUIRED",
  "status": "START",
  "runtime_state": "APPLYING",
  "revision": "opaque",
  "provider_ref": "named:nodeskclaw",
  "model_count": 2,
  "default_model": "model-a",
  "error_code": null
}
```

Superseded：

```json
{
  "stage": "COMPLETE",
  "status": "SUPERSEDED"
}
```

Rollback：

```text
ROLLBACK START
ROLLBACK PASS|FAIL
```

MUST 可以从日志重建：

```text
Intent order
Generation order
Lock acquisition order
Commit/rollback result
Final winning operation
```

---

# 20. Acceptance Design Standard

## A-CONC-001 — Concurrent Mutation Count = 1

### Requirement Refs

```text
REQ-CONC-001
```

### Given

Operation A 在 restart promise 处阻塞。

### When

Operation B refresh 到达。

### Then

B generation 更高，但 B mutation 等待 A release lock。

### Oracle

```text
max concurrent managed mutation == 1
```

### Evidence

```text
TEST-A-CONC-001
deterministic deferred promise test
```

---

## A-CONC-002 — Logout Wins During Apply

### Requirement Refs

```text
REQ-CONC-001
```

### Given

A=login apply 已修改 projection，restart 尚未返回。

### When

Logout Intent 到达。

### Then

```text
public state immediately CLEARING
A cannot set ACTIVE
A rolls back own T0 while lock held
Logout then purge
final state == UNBOUND
managed secret == absent
```

### Oracle

```text
ACTIVE event after logout intent count == 0
final state == UNBOUND
secret overlay reserved key absent
```

### Evidence

```text
TEST-A-CONC-002
operation trace artifact
```

---

## A-CONC-003 — Old Rollback Never Overwrites New Commit

### Requirement Refs

```text
REQ-CONC-001
```

### Given

A 被 supersede，B waiting。

### When

A rollback。

### Then

B 只有在 A rollback + lock release 后才可 mutation。

### Oracle

```text
ordered trace:
A.ROLLBACK_PASS
<
A.LOCK_RELEASE
<
B.LOCK_ACQUIRE
<
B.COMMIT
```

### Evidence

```text
TEST-A-CONC-003
```

---

## A-TXN-001 — Restart Failure Restores Complete T0

### Requirement Refs

```text
REQ-TXN-001
```

### Given

READY apply 会修改 file + session override。

### When

Gateway restart injected fail。

### Then

全部恢复。

### Oracle

```text
pre managed projection digest == post rollback digest
pre target-profile session override digest == post digest
managed secret == pre secret state
new ACTIVE == false
```

### Evidence

```text
TEST-A-TXN-001
```

---

## A-TXN-002 — Session Override Rollback

### Requirement Refs

```text
REQ-TXN-001
```

### Given

两个 target-profile session override 被 projector 改写。

### When

restart fail。

### Then

两行恢复原值。

### Oracle

```text
row semantic equality == true
```

### Evidence

```text
TEST-A-TXN-002
```

---

## A-TXN-003 — Rollback Failure Is Contained

### Requirement Refs

```text
REQ-TXN-001
```

### Given

restore session override 注入失败。

### When

rollback。

### Then

```text
state == ERROR
errorCode == RUNTIME_PROVIDER_ROLLBACK_FAILED
Chat blocked
recovery artifact secret count == 0
```

### Evidence

```text
TEST-A-TXN-003
```

---

## A-SCOPE-001 — Other Profile Override Preserve

### Requirement Refs

```text
REQ-SCOPE-001
```

### Given

```text
session S1 profile=default
session S2 profile=research
target profile=default
```

### When

apply。

### Then

只允许 S1 mutate。

### Oracle

```text
S2 pre semantic digest == S2 post semantic digest
```

### Evidence

```text
TEST-A-SCOPE-001
```

---

## A-SCOPE-002 — Missing Metadata Rewritten

### Requirement Refs

```text
REQ-SCOPE-001
```

### Given

override row 有 sessionId，但 metadata 无对应 row。

### When

apply。

### Then

该行按 Parent D-08 改写成企业默认模型。RPB-C-01。

### Oracle

```text
post.providerRef == named:nodeskclaw
post.model == enterprise default
other-profile rows unchanged
```

### Evidence

```text
TEST-A-SCOPE-002
```

---

## A-CHECK-001 — Full MATCH Allows No-op

### Requirement Refs

```text
REQ-CHECK-001
```

### Given

revision/secret/所有 managed state 均 MATCH。

### When

refresh。

### Then

```text
file write count == 0
SQLite update count == 0
Gateway restart count == 0
state == ACTIVE
```

### Evidence

```text
TEST-A-CHECK-001
```

---

## A-CHECK-002 — Same Revision + Active Default Drift Repairs

### Requirement Refs

```text
REQ-CHECK-001
```

### Given

revision 相同，managed model set 正确，但：

```text
config.model.default != Backend.default_model
```

### When

refresh。

### Then

不能 no-op。

### Oracle

```text
projection integrity before == DRIFTED
active default after == Backend.default_model
state == ACTIVE
```

### Evidence

```text
TEST-A-CHECK-002
```

---

## A-CHECK-003 — Registry Drift Repairs

### Requirement Refs

```text
REQ-CHECK-001
```

### Given

Registry managed row baseUrl stale，但 YAML/model IDs 正确。

### When

refresh。

### Then

Registry 被修复且 unrelated rows 不变。

### Oracle

```text
managed registry row == desired
non-managed registry digest unchanged
```

### Evidence

```text
TEST-A-CHECK-003
```

---

## A-EVENT-001 — Session Restore Eventually Pushes ACTIVE

### Requirement Refs

```text
REQ-EVENT-001
```

### Given

App 启动时 Renderer 先读取 FETCHING。

### When

后台 restore Bootstrap 最终 ACTIVE。

### Then

Renderer 收到 state event 并 reload。

### Oracle

```text
ACTIVE event count >= 1
ModelPicker eventually contains Backend managed models
无需 connection/model library unrelated event
```

### Evidence

```text
TEST-A-EVENT-001
```

---

## A-EVENT-002 — Other Profile Event Does Not Pollute Current Picker

### Requirement Refs

```text
REQ-EVENT-001
```

### Given

current profile=default，event profile=research。

### When

event 到达。

### Then

default ModelPicker semantic state 不变。

### Oracle

```text
current profile model group digest unchanged
```

### Evidence

```text
TEST-A-EVENT-002
```

---

## A-EVENT-003 — State Event Secret Zero

### Requirement Refs

```text
REQ-EVENT-001
```

### Oracle

```text
JSON.stringify(all state event payloads).includes(api_key) == false
```

### Evidence

```text
TEST-A-EVENT-003
```

---

## A-UI-001 — NOT_READY Reason Visible

### Requirement Refs

```text
REQ-UI-001
```

### Given

每个 Backend MODEL_* fixture。

### When

Runtime State Push 到 Chat。

### Then

```text
UI 显示对应原因
ModelPicker empty
send blocked
```

### Oracle

```text
rendered English label carries the REQ-UI-001 semantic mapping
send gate error == RUNTIME_NOT_READY
```

### Evidence

```text
TEST-A-UI-001
```

---

## A-UI-002 — STALE_ACTIVE Continues

### Requirement Refs

```text
REQ-UI-001
```

### Given

ACTIVE 后 Backend transport down。

### Then

```text
state=STALE_ACTIVE
last models visible
send allowed
warning visible
```

### Oracle

```text
model ids unchanged
send gate ok == true
```

### Evidence

```text
TEST-A-UI-002
```

---

## A-UI-003 — Remote/SSH Unchanged

### Requirement Refs

```text
REQ-UI-001
```

### When

connection mode 为 remote/ssh。

### Then

```text
runtime provider managed UX filtering disabled
existing remote/ssh model behavior preserved
```

### Evidence

```text
TEST-A-UI-003
```

---

## A-REFRESH-001 — Refresh Uses Orchestrator

### Requirement Refs

```text
REQ-REFRESH-001
```

### Oracle

```text
Renderer IPC → Main runtime-provider-refresh
direct bootstrap client call from Renderer count == 0
direct projection write count == 0
```

### Evidence

```text
TEST-A-REFRESH-001
```

---

## A-REFRESH-002 — Token Rotation Secret-only Refresh

### Requirement Refs

```text
REQ-REFRESH-001
```

### Given

```text
projection semantic MATCH
Backend READY api_key changed
```

### When

explicit refresh。

### Then

```text
managed file digest unchanged
memory secret changed
Gateway restart count == 1
state == ACTIVE
```

### Evidence

```text
TEST-A-REFRESH-002
```

---

## A-REFRESH-003 — Explicit NOT_READY Revokes Runtime

### Requirement Refs

```text
REQ-REFRESH-001
```

### Given

ACTIVE。

### When

refresh receives `MODEL_CREDENTIAL_DISABLED`。

### Then

```text
state transitions CLEARING → NOT_READY
secret absent
Gateway restarted/purged
send blocked
```

### Evidence

```text
TEST-A-REFRESH-003
```

---

## A-OBS-001 — Operation Trace Is Reconstructable

### Requirement Refs

```text
REQ-OBS-001
```

### Oracle

```text
one operation_id has ordered stages
generation present
final stage COMPLETE or SUPERSEDED
```

### Evidence

```text
TEST-A-OBS-001
```

---

## A-OBS-002 — Observability Secret Zero

### Requirement Refs

```text
REQ-OBS-001
```

### Oracle

```text
captured runtime provider logs exact api_key occurrence == 0
Authorization occurrence == 0
```

### Evidence

```text
TEST-A-OBS-002
```

---

## A-EVID-001 — Synthetic Closure Suite

### Requirement Refs

```text
REQ-EVID-001
```

### Oracle

```text
contract tests PASS
concurrency tests PASS
transaction tests PASS
projection drift tests PASS
state event tests PASS
renderer UX tests PASS
typecheck PASS
Work target tests PASS
build PASS
```

---

## A-EVID-002 — Persistent / Renderer Secret Zero in Real Run

### Requirement Refs

```text
REQ-EVID-001
```

### Given

真实 login + Chat。

### Oracle

```text
persistent managed file secret occurrence == 0
Renderer event/state secret occurrence == 0
Hermes child env contains current key == true
```

---

## A-EVID-003 — Golden Direct Data Plane

### Requirement Refs

```text
REQ-EVID-001
```

### Given

Runtime ACTIVE。

### When

```text
1. Chat with NodeDeskClaw reachable
2. Block NodeDeskClaw only
3. Keep NEW-API reachable
4. Chat again
```

### Then

第二次 Chat 仍成功。

### Oracle

```text
NEW-API inference requests >= 2
NodeDeskClaw inference proxy requests == 0
second chat success == true
```

---

# 21. Acceptance Input Matrix

| Case | Prior State | New Intent | Condition | Expected |
|---|---|---|---|---|
| 1 | UNBOUND | login | READY | ACTIVE |
| 2 | ACTIVE | refresh | exact MATCH | ACTIVE no-op |
| 3 | ACTIVE | refresh | same revision + default drift | repair ACTIVE |
| 4 | ACTIVE | refresh | transport fail | STALE_ACTIVE |
| 5 | ACTIVE | refresh | NOT_READY | purge → NOT_READY |
| 6 | APPLYING | logout | restart pending | logout wins |
| 7 | APPLYING A | refresh B | A superseded | A rollback before B mutation |
| 8 | APPLYING | restart fail | session rows changed | full T0 rollback |
| 9 | ACTIVE | profile switch | previous secret exists | previous memory secret cleared, target bootstrap |
| 10 | restore FETCHING | renderer mounted | later ACTIVE | state event reload |
| 11 | default profile | apply | research override exists | research row preserved |
| 12 | default profile | apply | metadata absent | rewrite to enterprise default |
| 13 | ACTIVE | token rotation refresh | files MATCH | files unchanged, restart |
| 14 | ERROR | refresh | Backend fixed READY | repair to ACTIVE |
| 15 | remote/ssh | any | managed projection exists | existing remote behavior |
| 16 | APPLYING rollback fails | logout waiting | purge succeeds | UNBOUND, secret cleared |
| 17 | UNBOUND | send | active model nodeskclaw, no memory secret | RUNTIME_NOT_READY, model requests 0 |
| 18 | NOT_READY settings locked | refresh | local session exists | refresh runs, settings writes stay locked |

---

# 22. Negative Acceptance

```text
NEG-CONC-001
old operation emits ACTIVE after newer logout intent
→ FAIL

NEG-CONC-002
old rollback runs after newer mutation commit
→ FAIL

NEG-TXN-001
Gateway restart failure leaves changed session override
→ FAIL

NEG-SCOPE-001
target profile apply modifies another profile session override
→ FAIL

NEG-CHECK-001
same revision + default drift returns no-op
→ FAIL

NEG-EVENT-001
runtime state event contains api_key
→ FAIL

NEG-REFRESH-001
Renderer直接调用 Bootstrap Client / projection writer
→ FAIL

NEG-ARCH-001
Chat inference routed through NodeDeskClaw Backend
→ FAIL

NEG-SEC-001
Member Key appears in persistent managed files
→ FAIL
```

---

# 23. Failure Injection

| Point | Injection | Required Postcondition |
|---|---|---|
| after Bootstrap fetch | newer intent | old mutation=0 |
| while waiting mutation lock | newer intent | old mutation=0 |
| after file projection | newer logout | rollback T0 before logout mutation |
| after session override update | throw | full T0 rollback |
| memory secret installed | restart fail | restore T0 / no ACTIVE new revision |
| restart returns | generation stale | rollback before lock release |
| rollback file restore | fail | RUNTIME_PROVIDER_ROLLBACK_FAILED |
| rollback session restore | fail | RUNTIME_PROVIDER_ROLLBACK_FAILED |
| projection check YAML | drift | repair |
| projection check Registry | drift | repair |
| projection check active default | drift | repair |
| state event listener | throw | Main runtime unaffected |
| Backend refresh | timeout ACTIVE | STALE_ACTIVE |
| Backend refresh | explicit NOT_READY | purge |
| Golden | NodeDeskClaw blocked | Chat still via NEW-API |

---

# 24. Evidence Contract

每个 Required Acceptance 至少记录：

```json
{
  "acceptance_id": "A-CONC-002",
  "status": "PASS",
  "requirement_ids": ["REQ-CONC-001"],
  "test_ids": ["TEST-A-CONC-002"],
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v6.2.1",
  "commit_sha": "<implementation-sha>",
  "command": "pnpm vitest ...",
  "exit_code": 0,
  "oracle": {
    "final_state": "UNBOUND",
    "active_event_after_logout_count": 0,
    "reserved_key_present": false
  },
  "timestamp": "<ISO8601>",
  "tool_version": "<version>",
  "evidence_files": []
}
```

规则：

```text
SKIPPED != PASS
BLOCKED != PASS
test source exists != PASS
Todo completed != VERIFIED
synthetic fixture != Golden Consumer
```

---

# 25. Release Gate

Required：

```text
A-CONC-001/002/003
A-TXN-001/002/003
A-SCOPE-001/002
A-CHECK-001/002/003
A-EVENT-001/002/003
A-UI-001/002/003
A-REFRESH-001/002/003
A-OBS-001/002
A-EVID-001/002/003
all NEG-* PASS
```

任何 Required Acceptance：

```text
status != PASS
→ Release Gate FAIL/BLOCKED
→ process exit != 0
```

状态区分：

```text
Implementation Complete != Feature VERIFIED
```

---

# 26. Golden Consumer / Real-world Acceptance

## 26.1 Immutable identities

MUST 记录：

```text
smc-copilot implementation SHA
NodeDeskClaw SHA
Hermes version
NEW-API deployment/version identity
test member（可脱敏）
Bootstrap revision
providerRef
default model
```

## 26.2 Real Flow

```text
G1 Login
G2 Bootstrap READY
G3 Runtime ACTIVE
G4 Projection MATCH
G5 Secret disk occurrence 0
G6 Chat success
G7 NEW-API receives request
G8 NodeDeskClaw inference request count 0
G9 Disable NodeDeskClaw network only
G10 Chat still succeeds
G11 Restore NodeDeskClaw
G12 Backend disables MemberToken
G13 Explicit Refresh
G14 Runtime NOT_READY / old key purged
G15 Backend rotates/enables Token
G16 Explicit Refresh
G17 Runtime ACTIVE / new key
G18 Chat success
```

Synthetic Test MUST NOT 替代上述流程。

---

# 27. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test | Evidence | Release Gate |
|---|---|---|---|---|---|
| REQ-CONC-001 | INV-CONC-001/002 | A-CONC-001/002/003 | TEST-A-CONC-* | EVID-CONC | REQUIRED |
| REQ-TXN-001 | INV-TXN-001/002 | A-TXN-001/002/003 | TEST-A-TXN-* | EVID-TXN | REQUIRED |
| REQ-SCOPE-001 | INV-SCOPE-001 | A-SCOPE-001/002 | TEST-A-SCOPE-* | EVID-SCOPE | REQUIRED |
| REQ-CHECK-001 | INV-CHECK-001/002 | A-CHECK-001/002/003 | TEST-A-CHECK-* | EVID-CHECK | REQUIRED |
| REQ-EVENT-001 | INV-EVENT-001 | A-EVENT-001/002/003 | TEST-A-EVENT-* | EVID-EVENT | REQUIRED |
| REQ-UI-001 | runtime UX mapping | A-UI-001/002/003 | TEST-A-UI-* | EVID-UI | REQUIRED |
| REQ-REFRESH-001 | orchestrator-only | A-REFRESH-001/002/003 | TEST-A-REFRESH-* | EVID-REFRESH | REQUIRED |
| REQ-OBS-001 | secret-free trace | A-OBS-001/002 | TEST-A-OBS-* | EVID-OBS | REQUIRED |
| REQ-EVID-001 | architecture proof | A-EVID-001/002/003 | TEST/GOLDEN | EVID-GOLDEN | REQUIRED |

---

# 28. Plan Generation Contract

只有：

```text
status = APPROVED_FOR_PLAN
```

才允许生成 `.plan.md`。

Plan Phase MUST 为：

```text
P0 Baseline / Evidence Inventory
P1 Operation Coordinator / Generation / Mutation Lock
P2 Full Transaction Snapshot + Session Override Rollback
P3 Profile-scoped Session Override
P4 Full Projection Integrity / Reconcile
P5 Runtime State Event
P6 Runtime UX + Explicit Refresh
P7 Failure Injection / Targeted Tests
P8 Golden Consumer
P9 Evidence / Release Gate
```

Plan MUST NOT：

```text
添加第二 Provider
改 NodeDeskClaw Backend
改 Hermes Core
改 llm-proxy
加 background polling
加 model_limits
```

---

# 29. `.plan.md` 输出标准

每个 Todo：

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

定义：

```text
implemented = 代码已写
verified = Required Acceptance 已有执行 Evidence
```

---

# 30. Code Review Contract

Review 顺序：

```text
1. latest-intent-wins 是否真正可证明
2. mutation serialization 是否单写者
3. rollback scope 是否等于 mutation scope
4. session override 是否按 RPB-C-01：其它 profile 保留，其余目标库行改写
5. same revision 是否要求 full projection MATCH
6. Renderer 是否通过 state event 收敛
7. refresh 是否只走 Orchestrator
8. Secret 是否仍 memory-only
9. remote/ssh 是否未被改变
10. Golden architecture evidence 是否真实
```

Reviewer MUST 搜索：

```text
let ticket
restoreManagedFiles
listSessionModelOverrides
setSessionModelOverride
sameProjection
setState
get-runtime-provider-state
runtime-provider-state-changed
apiKey
NODESKCLAW_RUNTIME_MODEL_API_KEY
```

---

# 31. PRD Quality Gate

## Architecture

```text
[x] Goal 唯一明确
[x] Closure 不扩 Provider
[x] Control/Data Plane 不变
[x] System Boundary 明确
```

## State

```text
[x] Generation SOT 明确
[x] Desired / Applied / Observed 分离
[x] State transition 明确
```

## Semantics

```text
[x] latest intent wins 明确
[x] mutation lock scope 明确
[x] session profile ownership 明确
[x] same revision no-op 条件明确
```

## Side Effects

```text
[x] mutation scope 明确
[x] read-only check 可证明
```

## Failure

```text
[x] rollback postcondition 明确
[x] rollback failure 明确
[x] transport failure与NOT_READY区分
```

## Acceptance

```text
[x] 每个 MUST 有 AC
[x] 每个 MUST NOT 有 Negative AC
[x] 并发/事务有 failure injection
[x] Oracle machine-readable
```

## Evidence

```text
[x] Synthetic 与 Golden 分离
[x] Evidence 绑定 commit
[x] BLOCKED/SKIPPED 不算 PASS
```

## Plan Readiness

```text
[x] 无 TBD
[x] Traceability 完整
[x] User Review
[x] status = APPROVED_FOR_PLAN
```

---

# 32. PRD 禁止写法

禁止：

```text
“并发时最后一个为准”
“尽量避免重复重启”
“失败后恢复”
“状态变化后刷新 UI”
“完整检查 projection”
“测试通过即可”
```

必须使用：

```text
generation + single-writer mutation lock
AfterRollback(managed_scope) == T0
state event schema
ProjectionIntegrity MATCH/DRIFTED/IDENTITY_CONFLICT
Required Acceptance + Evidence
```

---

# 33. ID 体系

```text
REQ-CONC-xxx
REQ-TXN-xxx
REQ-SCOPE-xxx
REQ-CHECK-xxx
REQ-EVENT-xxx
REQ-UI-xxx
REQ-REFRESH-xxx
REQ-OBS-xxx
REQ-EVID-xxx

INV-CONC-xxx
INV-TXN-xxx
INV-SCOPE-xxx
INV-CHECK-xxx
INV-EVENT-xxx

A-CONC-xxx
A-TXN-xxx
A-SCOPE-xxx
A-CHECK-xxx
A-EVENT-xxx
A-UI-xxx
A-REFRESH-xxx
A-OBS-xxx
A-EVID-xxx
```

---

# 34. Implementation Change Map

建议实施面：

```text
apps/work/src/main/runtime-provider/runtime-provider-operation-coordinator.ts
  ADD
  - generation
  - process-global mutation queue/lock
  - supersession checks

apps/work/src/main/runtime-provider/runtime-provider-transaction.ts
  ADD
  - capture T0
  - full rollback
  - semantic digest helpers

apps/work/src/main/runtime-provider/runtime-provider-projection.ts
  MODIFY
  - session overrides per RPB-C-01
  - semantic verification

apps/work/src/main/runtime-provider/runtime-provider-integrity.ts
  ADD
  - MATCH / DRIFTED / IDENTITY_CONFLICT
  - YAML / Registry / Models / Default / Session checks

apps/work/src/main/runtime-provider/runtime-provider-orchestrator.ts
  MODIFY
  - coordinator integration
  - full transaction
  - event emission
  - explicit refresh flow

apps/work/src/main/session-model-override-store.ts
  MODIFY
  - snapshot/restore helper
  - profile-scoped list/update helper

apps/work/src/main/session-metadata-store.ts
  KEEP / minimally expose read helper if needed
  - profileId identifies other-profile rows per RPB-C-01
  - missing metadata is not a preserve signal

apps/work/src/shared/runtime-provider-state.ts
  ADD
  - event schema / type guard

apps/work/src/main/ipc/register.ts
  MODIFY
  - runtime-provider-refresh
  - state broadcast

apps/work/src/preload/index.ts
apps/work/src/preload/index.d.ts
  MODIFY
  - onRuntimeProviderStateChanged
  - refreshRuntimeProvider

apps/work/src/renderer/src/screens/Chat/hooks/useModelConfig.ts
  MODIFY
  - event subscription
  - profile-filtered reload

apps/work/src/renderer/src/screens/Chat/*
  MODIFY
  - runtime status / refresh action

apps/work/src/main/runtime-provider/*.test.ts
  EXPAND

renderer tests
  ADD/EXPAND
```

---

# 35. Definition of Done

```text
[ ] e83aaba9 baseline impact captured
[ ] global ticket-only concurrency replaced/contained by defined coordinator
[ ] managed mutation concurrency max == 1
[ ] latest generation final-state ownership PASS
[ ] logout-during-apply PASS
[ ] old rollback cannot overwrite newer commit PASS
[ ] T0 includes managed files + target-profile session overrides + memory metadata
[ ] restart failure restores complete T0 PASS
[ ] rollback failure containment PASS
[ ] other-profile session override preserve PASS
[ ] missing metadata override rewrite PASS
[ ] full ProjectionIntegrity implemented
[ ] same revision + drift repairs PASS
[ ] exact MATCH no-op PASS
[ ] runtime-provider-state-changed implemented
[ ] Session Restore eventual ACTIVE visible without unrelated event
[ ] Runtime UX mappings PASS
[ ] explicit refresh PASS
[ ] STALE_ACTIVE PASS
[ ] NOT_READY purge PASS
[ ] secret persistent occurrence == 0
[ ] renderer/event secret occurrence == 0
[ ] remote/ssh regression PASS
[ ] targeted tests PASS
[ ] typecheck PASS
[ ] Work build PASS
[ ] Golden Consumer PASS
[ ] NodeDeskClaw inference request count == 0
[ ] NEW-API direct inference evidence present
[ ] all Required Evidence bound to implementation SHA
[ ] Release Gate PASS
```

---

# 36. 最终原则 / Target Closure

本阶段完成后，Runtime Provider 应从：

```text
“主链能运行”
```

提升为：

```text
“状态可以证明”
```

最终闭环：

```text
Intent
  ↓
Generation
  ↓
Single Writer
  ↓
Complete T0
  ↓
Projection Integrity
  ↓
Apply / Repair
  ↓
Secret Overlay
  ↓
Gateway Restart / Verify
  ↓
ACTIVE
  ↓
State Push
  ↓
Renderer Runtime UX
  ↓
Hermes
  ↓
DIRECT NEW-API
```

核心不变量：

```text
1. 后发 Intent 永远不能被旧 operation 覆盖。
2. mutation scope 与 rollback scope 必须一致。
3. Session Override 必须有可证明的 profile ownership。
4. Same Revision 只有 Full Projection MATCH 才允许 NO-OP。
5. Renderer 必须通过 Runtime State Event 确定性收敛。
6. Member Key 仍然只存在 Main memory + Hermes child env。
7. NodeDeskClaw 仍然不进入模型 Data Plane。
8. Synthetic PASS 不能替代 Golden Consumer。
9. IMPLEMENTED 不等于 VERIFIED。
10. 本 PRD Release Gate PASS 后，才允许进入第二 Provider / model_limits 等下一能力阶段。
```
