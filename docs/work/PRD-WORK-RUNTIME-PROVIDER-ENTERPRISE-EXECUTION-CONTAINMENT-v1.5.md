---
title: "smc-copilot Runtime Provider Enterprise Execution Containment v1.5 方案 PRD"
subtitle: "把 Hermes Auxiliary LLM Routing 纳入 NodeDeskClaw 企业 Runtime 管理边界，形成 Main Chat + Auxiliary Tasks 一体化企业模型执行闭环"
prd_id: "PRD-WORK-RUNTIME-PROVIDER-ENTERPRISE-EXECUTION-CONTAINMENT-V1.5"
version: "1.5"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "79ba099897831792a59630ada8601d40c4cdb9cd"
external_contract_repository: "loudon84/nodeskclaw"
external_contract_branch: "main"
external_contract_commit: "7abb73e90e163f85257208ac4aa58e4914d2da6e"
owner: "Work Platform / Runtime Provider"
reviewers: ["Product","Architecture","Desktop Main","Renderer","Hermes Runtime","Backend Integration","Security","QA","Desktop Support / Operations"]
created_at: "2026-09-28"
updated_at: "2026-09-28"
target_release: "Enterprise Execution Containment v1.5"
change_type: ["BROWNFIELD_CHANGE","ARCHITECTURE_CHANGE","INTEGRATION","GOVERNANCE"]
golden_consumer: "smc-copilot apps/work + NodeDeskClaw Runtime Bootstrap + local Hermes Gateway + enterprise NEW-API"
related_docs:
  - "需求PRD工程模板.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.0.md @ v1.1"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-v1.2-CLOSURE-RECONCILE.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-CONTINUOUS-RECONCILE-v1.3.md"
  - "docs/work/PRD-WORK-RUNTIME-PROVIDER-OPERATIONS-DIAGNOSTICS-v1.4.md"
supersedes: null
---

# 0. PRD 使用原则

本 PRD 严格按《需求PRD工程模板.md》v1.0 输出，作为 **Human + AI Coding Machine-Executable Engineering Contract**。

本轮是 Runtime Provider 主链 v1.1～v1.4 之后的 **execution containment delta**。它不重新设计 NodeDeskClaw Runtime Bootstrap、MemberToken、NEW-API 权限、Hermes Gateway、主 Chat Provider Projection、Continuous Reconcile 或 Diagnostics；它只把当前仍独立存在的 Hermes `auxiliary.<task>` 模型路由纳入同一个企业 Runtime 所有权边界。

## 0.1 Delta Priority

```text
本 PRD v1.5：EEC-D-01～EEC-D-16
    >
v1.4 Runtime Provider Operations / Diagnostics
    >
v1.3 Continuous Reconcile
    >
v1.2 Closure / Reconcile
    >
v1.1 Runtime Provider Bootstrap，含 RPB-D-01～RPB-D-18
    >
当前源码行为
```

`EEC-D-11`～`EEC-D-16` 覆盖本文后文与之冲突的句子。其中 `EEC-D-03` 明确覆盖 v1.1 `RPB-D-16` 最后一条“辅助任务写入不受此拒绝”。其余未被本 PRD 修改的 v1.1～v1.4 语义继续有效。

## 0.2 强制规范关键词

`MUST / MUST NOT / SHOULD / SHOULD NOT / MAY` 按模板定义。所有实施级 `MUST / MUST NOT` 均在 §10 Requirement Unit 中声明并映射到 §20 Acceptance、§27 Traceability 与 §24 Evidence。

## 0.3 No-Inference Rule

若 Plan/Coding Agent 无法唯一确定以下任一事项：

```text
Auxiliary 哪些 slot 被管理
provider=auto 的本 PRD语义
进入 managed 前的 Auxiliary 配置如何保存
何时可以覆盖/复用 adoption snapshot
logout 如何恢复
NOT_READY / STALE_ACTIVE / ERROR 时是否恢复
profile switch 是否修改其它 profile
Auxiliary drift 是否触发 reconcile
Auxiliary write lock 的 Main-process 边界
rollback 是否包含 Auxiliary config/adoption
NEW-API 权限与 Desktop allowlist 的边界
Golden 如何证明 direct NEW-API 且 NodeDeskClaw inference=0
```

则：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT 自行选择一个“看起来合理”的实现
```

## 0.4 Source Integrity Gate

```text
smc-copilot
repo:   loudon84/smc-copilot
branch: work/prd-v6.2.1
commit: 79ba099897831792a59630ada8601d40c4cdb9cd

NodeDeskClaw Runtime Bootstrap
repo:   loudon84/nodeskclaw
branch: main
commit: 7abb73e90e163f85257208ac4aa58e4914d2da6e
endpoint: POST /api/v1/runtime/model-bootstrap
```

2026-09-28 复核：`work/prd-v6.2.1` HEAD 仍是 `79ba099897831792a59630ada8601d40c4cdb9cd`，与 baseline 相同。`AUX_TASK_SLOTS` 与 §5.3 的 11 个 slot 一致。`auxiliary-config.ts` 仍把 `provider`、`model`、`base_url` 写入 `config.yaml`。v1.4 的 public state、transaction、integrity 与 diagnostics 路径仍在。节点 2 沿用同日 Source Probe：NodeDeskClaw Bootstrap contract 未在本仓库改动。

进入 `APPROVED_FOR_PLAN` 前必须重新执行：

```text
1. work/prd-v6.2.1 HEAD == baseline 或输出 baseline → HEAD impact diff；
2. nodeskclaw main 的 Runtime Bootstrap Contract 未破坏；
3. AUX_TASK_SLOTS 仍与 §5.3 一致；
4. auxiliary-config.ts 仍由 config.yaml auxiliary.* 作为写入目标；
5. v1.4 Runtime Provider public state / transaction / integrity / diagnostics 未被旁路。
```

## 0.5 Current Review Gate

2026-09-28 用户要求检查书面 PRD 并明确转为可计划。`EEC-D-01`～`EEC-D-16` 已覆盖后文冲突句。本文当前：

```text
status = APPROVED_FOR_PLAN
```

未执行的 v1.5 Golden 仍记为 BLOCKED，不得记为 PASS。

## 0.6 Grilling / 锁定设计决定

```text
EEC-D-01  Scope
v1.5 只管理当前 Desktop canonical AUX_TASK_SLOTS；不引入新的 Auxiliary Task，不修改 Hermes Agent Core。

EEC-D-02  Routing Model
企业 Runtime ACTIVE 后，每个 canonical Auxiliary slot 的受管目标都是：
  provider = "auto"
  model = ""
  base_url = ""
"auto" 在当前 apps/work 语义中表示跟随 main chat model。

EEC-D-03  Lock Override
local + NodeDeskClaw enterprise runtime 非 UNBOUND 时，Auxiliary route 写入进入与主 Provider 设置同级的 managed lock。
该决定覆盖 v1.1 RPB-D-16 中“辅助任务写入不受此拒绝”。

EEC-D-04  Authority Boundary
v1.5 的 Auxiliary allow/route 是 Desktop execution routing，不是 NEW-API authorization boundary。
真正可调用模型范围继续由 MemberToken 所属 NEW-API Group 决定。
本阶段不加入 llm-proxy，不让 NodeDeskClaw 转发 inference。

EEC-D-05  Durable Adoption
进入 managed runtime 前的 Auxiliary routing 必须保存在独立 sidecar：
  <profileHome>/runtime-provider-auxiliary-adoption.json
不得扩展 runtime-provider-adoption.json；后者继续只承担 main provider/model adoption。

EEC-D-06  Capture Rule
sidecar 不存在且当前 main provider != nodeskclaw 时，首次 READY apply 捕获一次 pre-managed Auxiliary state。
sidecar 已存在时必须复用，禁止覆盖。
sidecar 不存在但当前 main provider == nodeskclaw 时视为 adoption 丢失，必须 BLOCK，不得把 managed auto 状态重新捕获成用户原始状态。

EEC-D-07  Lifecycle
ACTIVE / STALE_ACTIVE / 已经成功 managed 之后的 NOT_READY / ERROR：保持 Auxiliary managed projection，不恢复用户路由。
logout：恢复 pre-managed Auxiliary route，然后删除 sidecar；只有恢复 + Gateway secret purge 验证完成才进入 UNBOUND。

EEC-D-08  Transaction
READY apply / reconcile 的 Auxiliary config 与 sidecar 必须纳入现有 Runtime Provider T0 transaction。
失败时 managed scope 回到 T0；logout 的 secret purge 是安全单调操作，恢复失败不得把 Member Key 重新装回内存。

EEC-D-09  Local-only
remote / ssh 不写 Auxiliary config，不创建 adoption sidecar，不增加企业路由锁，沿用现有行为。

EEC-D-10  Diagnostics
不新建第二套 Operations subsystem。Auxiliary containment 通过现有 Projection Integrity / public state / v1.4 diagnostics 暴露；Support Bundle 仍不得包含 sidecar 内容或任何 key/token。

EEC-D-11  Canonical api_key
托管投影写入 provider="auto"、model=""、base_url=""，并删除每个 canonical slot 上的 api_key。
sidecar 不保存 api_key。logout 只按 sidecar 恢复三个路由字段，MUST NOT 写回 api_key。
timeout 与 extra_body 保留，不参与 drift。
present=false 表示该字段原来不存在，restore 不得把它写成空字符串。

EEC-D-12  Drift timing
不新增文件监听，也不新开 timer。
AUXILIARY_ROUTING_DRIFT 在下一次已经存在的登录、恢复、手动刷新、profile switch 或调度读取里修回。
Busy Skip、间隔和退避仍按 v1.3。

EEC-D-13  Adoption gate
sidecar 缺失且主 provider 已是 nodeskclaw，或 sidecar 非法时，必须在这次 apply 的任何 managed 写入之前返回 ERROR。
不创建 sidecar，不改 Auxiliary，不改主投影。这次尝试的 mutation 为 0，磁盘保持原样。

EEC-D-14  Reappearing api_key
canonical slot 上再次出现 api_key，包括空字符串，与三个路由字段偏离使用同一个原因 AUXILIARY_ROUTING_DRIFT。
下一次现有读取删掉该字段。不把密钥写入 history、Snapshot 或 Support Bundle，也不新增错误码。

EEC-D-15  Auxiliary copy
Auxiliary 只读说明的英文源文案是：
These auxiliary tasks follow the enterprise model. Route changes are unavailable while enterprise runtime is managed.
不按 slot 分句。中文由现有 i18n 提供。组件 MUST NOT 写死中文。

EEC-D-16  Capture order and rollback
安全的首次捕获发生在写入 contained route 和删除 api_key 之前，并与后续投影同属这次 T0。
这次 apply 失败回滚时，恢复 T0，包括尝试开始前已经存在的 api_key。
成功 logout 不恢复 api_key。
同一次读取修完后三个路由字段或 api_key 仍偏离 contained route 时，回滚 T0，MUST NOT ACTIVE。
```

---

# 1. 文档元数据与源码基线

## 1.1 Current HEAD

```text
repository: loudon84/smc-copilot
branch: work/prd-v6.2.1
HEAD: 79ba099897831792a59630ada8601d40c4cdb9cd
```

该提交已实现 v1.4 read-only Runtime Diagnostics Card、Support Bundle、Scheduler diagnostics 与 post-apply projection check。

## 1.2 Current Source Facts

### Runtime Provider 主链

当前 `runtime-provider-orchestrator.ts` 已有：

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

以及：

```text
fetch Runtime Bootstrap
checkManagedRuntimeProjection
captureManagedTransaction(T0)
projectManagedRuntime
install memory-only Member Key
restart Gateway
post-apply integrity check
rollbackOwned
continuous reconcile
```

### 主 Provider Projection

`runtime-provider-projection.ts` 当前管理：

```text
config.yaml providers.nodeskclaw
providers.json 无 secret Registry row
models.json providerRef=named:nodeskclaw rows
active model provider/model
session model overrides
runtime-provider-adoption.json
```

`runtime-provider-adoption.json` 当前只保存：

```json
{"provider":"...","model":"..."}
```

v1.5 不改变其 schema。

### Auxiliary Routing

`auxiliary-config.ts` 当前把 Hermes side-task routing 写到：

```text
config.yaml
  auxiliary.<task>.provider
  auxiliary.<task>.model
  auxiliary.<task>.base_url
```

当前代码注释定义：

```text
provider = "auto"
→ use the main chat model
```

`setAuxiliaryTask()` 会修改 provider/model/base_url；`resetAuxiliaryToAuto()` 会把 canonical slots 全部重置为 `auto / "" / ""`。

### 当前缺口

Main IPC 对 Model / Provider / Credential / OAuth 等 managed writes 已使用 `isRuntimeSettingsLocked()` 拒绝，但 `set-auxiliary-task` / reset auxiliary 仍可直接写 `config.yaml` 并重启 Gateway。

因此当前可以出现：

```text
Main Chat
  → named:nodeskclaw
  → enterprise NEW-API

Auxiliary Task
  → user-selected provider/model/base_url
  → another provider
```

这意味着“Enterprise Runtime”当前只约束主 Chat 模型路径，尚未约束 Hermes Agent 的辅助模型执行路径。

---

# 2. 一句话目标

让 **已登录 NodeDeskClaw 且使用 local Hermes Runtime 的 smc-copilot 用户**，在 Runtime Bootstrap 已形成企业受管 Provider 的前提下，通过把 Hermes canonical Auxiliary Tasks 强制投影为 `provider=auto`，使 Main Chat 与 Auxiliary LLM execution 共同继承 `named:nodeskclaw` 企业 Provider 并直接访问 NEW-API，同时保证原用户 Auxiliary routing 可在 logout 后确定性恢复、Member Key 不被持久化或泄漏、NodeDeskClaw 不成为 inference proxy。

---

# 3. 背景与问题定义

## 3.1 Current State

当前架构已经形成：

```text
NodeDeskClaw Login / Session Restore
        ↓
Runtime Bootstrap
        ↓
Managed Provider / Models / Memory Secret
        ↓
Hermes Main Chat
        ↓
DIRECT NEW-API
```

但 Hermes 还存在独立的：

```text
Auxiliary Task
        ↓
auxiliary.<task>.provider/model/base_url
        ↓
可独立选择其它 Provider
```

## 3.2 Problem

P-EEC-001：同一个本地 Hermes Runtime 存在两套模型路由所有权；主 Chat 由 NodeDeskClaw 企业 Runtime 管理，Auxiliary Tasks 仍由用户本地设置管理。

P-EEC-002：在企业 Runtime ACTIVE 时，用户仍可通过 Auxiliary UI / IPC 写入独立 provider/model/base_url，导致企业 Runtime 无法声称覆盖完整 Agent LLM execution surface。

P-EEC-003：直接把 Auxiliary 改成 `auto` 会破坏用户进入 enterprise runtime 前的本地配置；当前不存在持久、profile-scoped、secret-free 的 Auxiliary adoption state。

P-EEC-004：当前 Projection Integrity 不检查 `auxiliary.*`；即使用户/外部进程把 Auxiliary route 改到其它 Provider，Continuous Reconcile 也不会把它识别为 Runtime Provider drift。

P-EEC-005：若把 Auxiliary restore 独立于现有 T0 / rollback，会产生主 Provider 已回滚、Auxiliary 未回滚或反向不一致的 partial state。

## 3.3 Impact

```text
业务影响：企业管理员认为员工使用企业模型，实际 Auxiliary 仍可能访问其它 Provider。
工程影响：Provider ownership 分裂，Runtime 状态 ACTIVE 不等价于完整 LLM routing 一致。
安全影响：企业 Member Key 仍安全，但执行路径可绕出企业 Provider；这属于 routing containment 缺口。
运维影响：v1.4 Diagnostics 不能解释 Auxiliary route drift。
AI Coding 影响：后续 agent feature 无法假设 Runtime Provider 是统一模型执行入口。
```

---

# 4. Scope

## 4.1 In Scope

```text
SCOPE-001  canonical AUX_TASK_SLOTS 的 enterprise routing projection。
SCOPE-002  Auxiliary pre-managed adoption sidecar。
SCOPE-003  READY/reconcile T0 transaction 集成。
SCOPE-004  logout restore + sidecar cleanup。
SCOPE-005  Main-process Auxiliary mutation lock。
SCOPE-006  Renderer read-only managed UX。
SCOPE-007  Projection Integrity / Continuous Reconcile 覆盖 Auxiliary drift。
SCOPE-008  v1.4 Diagnostics 复用现有 projection state 展示 Auxiliary drift。
SCOPE-009  Synthetic + Golden direct-data-plane Evidence。
```

映射：

```text
SCOPE-001 → REQ-AUX-001
SCOPE-002 → REQ-AUX-002
SCOPE-003 → REQ-TXN-001
SCOPE-004 → REQ-LIFE-001
SCOPE-005 → REQ-LOCK-001
SCOPE-006 → REQ-UI-001
SCOPE-007 → REQ-CHECK-001
SCOPE-008 → REQ-OBS-001
SCOPE-009 → REQ-EVID-001
```

## 4.2 Out of Scope

```text
NON-GOAL-001  不修改 NodeDeskClaw Backend / MemberToken schema / Bootstrap response schema。
NON-GOAL-002  不增加 llm-proxy 或 NodeDeskClaw inference relay。
NON-GOAL-003  不把 MemberToken.models 变成 NEW-API 真实权限边界。
NON-GOAL-004  不修改 NEW-API Group / Token 策略。
NON-GOAL-005  不引入第二 Provider。
NON-GOAL-006  不为每个 Auxiliary Task 在 NodeDeskClaw 增加独立模型策略。
NON-GOAL-007  不给 vision/compression/title_generation 推断 capability metadata。
NON-GOAL-008  不修改 Hermes Agent Core 的 provider=auto 解析逻辑。
NON-GOAL-009  不改变 remote / ssh routing。
NON-GOAL-010  不删除用户自定义 Provider / Model / Auxiliary unknown fields。
NON-GOAL-011  不导出 Auxiliary adoption sidecar 到 Support Bundle。
```

## 4.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Enterprise identity | NodeDeskClaw | JWT / org membership | Runtime Bootstrap | Desktop local config |
| NEW-API authorization | NEW-API | Member Key + Group | 可调用模型权限 | Desktop selected JSON |
| Runtime provider projection | smc-copilot Main | Bootstrap READY | nodeskclaw Provider / Models / Secret | inference proxy |
| Auxiliary containment | smc-copilot Main | Runtime state + config.yaml | auxiliary canonical route | Hermes Core routing algorithm |
| Runtime execution | Hermes | config + child env | inference request | enterprise identity DB |
| Data plane | NEW-API | Member Key | model response | Desktop UI policy |
| Operations | v1.4 diagnostics | Runtime local state | snapshot / bundle | mutation owner |

---

# 5. Terminology / Domain Model

## 5.1 Enterprise Runtime

`local` connection mode 且 NodeDeskClaw auth session 存在，由 Runtime Provider Orchestrator 管理的当前 profile 模型运行环境。

## 5.2 Auxiliary Routing

只指：

```text
auxiliary.<slot>.provider
auxiliary.<slot>.model
auxiliary.<slot>.base_url
```

不包含：

```text
timeout
extra_body
unknown future fields
unknown task slots
```

## 5.3 Canonical Auxiliary Slots

以当前 `AUX_TASK_SLOTS` 为唯一 Desktop-supported slot set：

```text
vision
web_extract
compression
skills_hub
approval
mcp
title_generation
triage_specifier
kanban_decomposer
profile_describer
curator
```

v1.5 代码必须从同一个 `AUX_TASK_SLOTS` constant 消费该集合，禁止在 projection / integrity / UI 复制第二份 hard-coded slot list。

## 5.4 Contained Route

对 canonical slot 的目标值：

```text
provider = "auto"
model = ""
base_url = ""
```

## 5.5 Auxiliary Adoption Snapshot

用户进入 Enterprise Runtime 前，canonical slots 三个 routing fields 的原始 **presence + value** 快照。它用于 logout restore，不是 Runtime desired state。

## 5.6 Authorization Boundary

NEW-API Member Key + Group 是真实模型调用权限边界。Desktop Auxiliary containment 只是执行路由边界，不阻止拥有原始 Key 的其它客户端调用 Group 内其它模型。

## 5.7 Implemented / Verified

```text
Implemented = 代码已落地。
Verified = Required Acceptance 已有实际执行 Evidence。
BLOCKED / SKIPPED != PASS。
```

---

# 6. System Context

## 6.1 Context Diagram

```text
NodeDeskClaw Auth
      │
      │ Runtime Bootstrap
      ▼
smc-copilot Main
      │
      ├── Main Provider Projection ─────────┐
      │                                    │
      ├── Auxiliary Containment            │
      │    provider=auto                    │
      │    model=""                         │
      │    base_url=""                      │
      │                                    │
      └── Memory-only Member Key            │
                                           ▼
                                  Local Hermes Gateway
                                           │
                             Main + Auxiliary execution
                                           │
                                           ▼
                                  Enterprise NEW-API
```

## 6.2 System Boundary

```text
Inside boundary:
  apps/work Main Process
  runtime-provider orchestrator / projection / integrity / transaction
  auxiliary-config routing fields
  Renderer Auxiliary UI lock

Outside boundary:
  NodeDeskClaw Backend internals
  Hermes Agent Core
  NEW-API source
  remote / ssh Hermes

External dependency:
  NodeDeskClaw Runtime Bootstrap @ 7abb73e...
  Hermes provider=auto semantics
  enterprise NEW-API

Trusted input:
  parsed READY Runtime Bootstrap Contract
  Main-owned Runtime Provider public state
  canonical AUX_TASK_SLOTS

Untrusted input:
  existing config.yaml
  auxiliary routing strings
  manually edited adoption sidecar
  Renderer IPC arguments
```

---

# 7. Authoritative State / Source of Truth

| State | Role | Authoritative? | Writer | Reader | 可否自动覆盖 |
|---|---|---:|---|---|---:|
| Runtime Provider public state | RUNTIME_STATE | YES | Orchestrator | Main/Renderer/Diagnostics | YES，由 Orchestrator |
| NodeDeskClaw Bootstrap READY | DESIRED_STATE for main provider | YES for current fetch | Backend | Main | NO，本地不可改 |
| `config.yaml auxiliary.*` | OBSERVED / LAST_APPLIED routing | YES for Hermes effective local config | Main + unmanaged user flow | Hermes/Main | managed 时 YES，仅 canonical routing fields |
| `runtime-provider-auxiliary-adoption.json` | USER_PRE_MANAGED_STATE | YES for logout restore | Runtime Provider only | Runtime Provider only | 仅首次 capture；managed lease 内禁止覆盖 |
| `runtime-provider-adoption.json` | main provider/model adoption | YES for main restore | existing Runtime Provider | Runtime Provider | 按 parent PRD |
| Memory Member Key | RUNTIME_STATE | YES | managed secret store | Hermes child env | YES，rotation/revoke |
| NEW-API Token Group | AUTHORIZATION_STATE | YES | NodeDeskClaw/NEW-API admin flow | NEW-API | Desktop NO |
| Projection check result | OBSERVED_STATE | YES for last check | integrity checker | reconcile/diagnostics | YES，new check replaces old |
| Evidence artifact | EVIDENCE_STATE | YES for verification | tests/QA | Release Gate | append/new run |

Derived rule：

```text
RuntimeProvider.state != UNBOUND
AND connection.mode == local
→ user Auxiliary mutation is locked.
```

这条 lock derived state 不替代 NodeDeskClaw/NEW-API 权限。

---

# 8. State Machine

## 8.1 Runtime Provider State 保持不变

```text
UNBOUND
  ↓ login/session restore/local re-entry
FETCHING
  ↓ READY
APPLYING
  ↓ projection + restart + post-check PASS
ACTIVE
  ↓ bootstrap unavailable
STALE_ACTIVE
  ↓ next accepted READY
ACTIVE

ACTIVE / STALE_ACTIVE
  ↓ explicit NOT_READY
CLEARING
  ↓ secret purge
NOT_READY

ANY managed state
  ↓ logout
CLEARING
  ↓ restore main adoption + restore auxiliary adoption + purge restart + cleanup
UNBOUND
```

## 8.2 Auxiliary Containment Derived State

```text
AUX_USER_OWNED
  condition: Runtime == UNBOUND

AUX_PENDING
  condition: first FETCHING/APPLYING before first successful projection

AUX_MANAGED
  condition: valid sidecar exists + canonical slots == contained route

AUX_DRIFTED
  condition: valid sidecar exists but any canonical routing field != contained route

AUX_ADOPTION_INVALID
  condition: sidecar exists but schema invalid/profile mismatch/forbidden key

AUX_ADOPTION_MISSING
  condition: main provider == nodeskclaw but sidecar absent
```

合法转移：

```text
AUX_USER_OWNED --first READY apply--> AUX_MANAGED
AUX_MANAGED --manual drift--> AUX_DRIFTED
AUX_DRIFTED --reconcile--> AUX_MANAGED
AUX_MANAGED --logout restore PASS--> AUX_USER_OWNED
AUX_* --invalid sidecar--> AUX_ADOPTION_INVALID
AUX_MANAGED --sidecar deleted--> AUX_ADOPTION_MISSING
```

非法转移：

```text
AUX_ADOPTION_MISSING → capture current managed auto as new adoption
AUX_ADOPTION_INVALID → overwrite sidecar
AUX_MANAGED → user set another provider while runtime locked
```

持久化：

```text
Observed route: profile config.yaml
Restore source: runtime-provider-auxiliary-adoption.json
Runtime public state: Main memory existing mechanism
```

---

# 9. Data / Schema Contract

## 9.1 New Schema

Schema ID：

```text
smc.runtime-provider.auxiliary-adoption.v1
```

Path：

```text
<profileHome>/runtime-provider-auxiliary-adoption.json
```

Schema：

```json
{
  "schema_version": "1.0",
  "profile": "default",
  "slots": {
    "vision": {
      "provider": {"present": true, "value": "openai"},
      "model": {"present": true, "value": "gpt-4o-mini"},
      "base_url": {"present": false, "value": null}
    }
  }
}
```

Rules：

```text
schema_version = "1.0"
profile = normalized profile id
slots 必须且只能包含当前 AUX_TASK_SLOTS 的 11 个 key
每个 slot 必须包含 provider/model/base_url
每个 field 必须包含 present:boolean + value:string|null
present=false → value 必须为 null
present=true  → value 必须为 string；空字符串合法
additionalProperties=false
禁止任何 secret/api_key/token/authorization/fingerprint/revision 字段
```

## 9.2 Field Semantic Table

| Field | Type | Required | Default | Authority | Meaning |
|---|---|---:|---|---|---|
| schema_version | string | YES | none | Runtime Provider | sidecar schema |
| profile | string | YES | none | normalized profile | 防止跨 profile 误用 |
| slots | object | YES | none | captured config | canonical slot snapshot |
| `<slot>.provider.present` | boolean | YES | none | captured config | 字段原来是否存在 |
| `<slot>.provider.value` | string/null | YES | none | captured config | 原值 |
| model.* | same | YES | none | captured config | 原 model |
| base_url.* | same | YES | none | captured config | 原 base_url |

## 9.3 Compatibility

```text
v1.0 唯一支持 schema_version=1.0。
未知 schema version → RUNTIME_AUXILIARY_ADOPTION_INVALID。
不得 best-effort 解析未知字段。
不得把 sidecar 迁移为 runtime-provider-adoption.json。
```

---

# 10. Requirement Unit

## REQ-AUX-001 — Canonical Auxiliary Containment Projection

### Goal

让企业 Runtime ACTIVE 时 canonical Auxiliary Tasks 全部继承 main managed model，而不再具有独立 Provider route。

### Normative Requirement

```text
MUST 以 AUX_TASK_SLOTS 作为唯一 slot source。
MUST 在 READY apply/reconcile 的 managed projection 中把每个 canonical slot 写成 provider="auto"、model=""、base_url=""。
MUST 删除每个 canonical slot 上已有的 api_key。规则见 EEC-D-11、EEC-D-14。
MUST 保留 timeout、extra_body 和 unknown task slots。
MUST NOT 把 api_key/secret/token 写入 sidecar、diagnostics 或 Support Bundle。
MUST NOT 为不同 slot 创建新的 provider identity。
```

### Inputs

```text
profile
config.yaml current bytes
AUX_TASK_SLOTS
Runtime Bootstrap READY
```

### Preconditions

```text
PRE-AUX-001 connection.mode == local
PRE-AUX-002 Bootstrap == READY
PRE-AUX-003 Auxiliary adoption capture 已成功或已有有效 sidecar
```

### Authoritative State

```text
SOT: contained routing constant + AUX_TASK_SLOTS
Observed: config.yaml auxiliary.*
Derived: projection integrity
```

### State Transition

```text
Before: user route / drifted route
Event: projectManagedRuntime
After: all canonical slots contained
```

### Allowed Side Effects

```text
ALLOW: current profile config.yaml 的 canonical slot provider/model/base_url
```

### Forbidden Side Effects

```text
DENY: timeout / extra_body / unknown fields / unknown slots / other profile / NodeDeskClaw / NEW-API
```

### Ownership Scope

```text
FIELD: auxiliary.<canonical-slot>.provider/model/base_url
```

### Idempotency

```text
first run: normalize target fields
second run: semantic mutation = 0 when already contained
```

### Failure Semantics

```text
F-AUX-001 write throws
expected state: ERROR
error code: existing transaction/project failure mapped by orchestrator
rollback: T0 managed scope
retryable: YES
```

### Postconditions

```text
POST-AUX-001 canonical slot route == contained route
POST-AUX-002 unrelated auxiliary values unchanged
```

### Invariants

```text
INV-AUX-001 canonical slots share main model route while managed
INV-AUX-002 no auxiliary credential persistence
```

### Error Codes

```text
RUNTIME_PROVIDER_POST_APPLY_DRIFT
RUNTIME_PROVIDER_ROLLBACK_FAILED
```

### Acceptance

```text
A-AUX-001
A-AUX-002
A-AUX-003
```

### Evidence

```text
required test: auxiliary projection unit/integration tests
required artifact: before/after semantic config snapshot
required digest: unrelated auxiliary-field digest equal
required runtime output: Projection MATCH
```

---

## REQ-AUX-002 — Durable Auxiliary Adoption Capture

### Goal

在企业接管前持久保存用户原 routing，并防止 managed auto 状态被错误记录成用户原配置。

### Normative Requirement

```text
MUST 使用独立 runtime-provider-auxiliary-adoption.json。
MUST 在 first READY mutation 之前 capture presence + value。
MUST 在 sidecar 已存在且有效时复用，MUST NOT 覆盖。
MUST 在 sidecar 缺失且 current main provider == nodeskclaw 时，按 EEC-D-13 在任何 managed 写入之前返回 RUNTIME_AUXILIARY_ADOPTION_MISSING，mutation=0。
MUST 在 sidecar invalid 时按 EEC-D-13 返回 RUNTIME_AUXILIARY_ADOPTION_INVALID，mutation=0。
MUST 在安全首次捕获时先记录三个路由字段，再写入 contained route。见 EEC-D-16。
MUST NOT 把 secret/api_key/token/authorization/fingerprint 写入 sidecar。
```

### Inputs

```text
current profile
config.yaml
active main provider
existing sidecar bytes
```

### Preconditions

```text
PRE-ADOPT-001 local mode
PRE-ADOPT-002 before first managed Auxiliary mutation
```

### Authoritative State

```text
SOT: sidecar after successful capture
Observed: current config fields
Derived: adoption validity
```

### State Transition

```text
absent + pre-managed → valid sidecar
valid → unchanged
missing + provider=nodeskclaw → error
invalid → error
```

### Allowed Side Effects

```text
ALLOW: create sidecar only when safe capture rule is satisfied
```

### Forbidden Side Effects

```text
DENY: overwrite existing valid sidecar
DENY: repair invalid sidecar by guessing
DENY: write other profile
```

### Ownership Scope

```text
FILE: runtime-provider-auxiliary-adoption.json
```

### Idempotency

```text
first capture: one file create
repeat managed apply: 0 write to sidecar
```

### Failure Semantics

```text
F-ADOPT-001 parse/schema invalid → RUNTIME_AUXILIARY_ADOPTION_INVALID, mutation=0
F-ADOPT-002 missing while provider nodeskclaw → RUNTIME_AUXILIARY_ADOPTION_MISSING, mutation=0
F-ADOPT-003 create/write failure → ERROR, existing config remains T0
```

### Postconditions

```text
POST-ADOPT-001 captured state uniquely restorable
POST-ADOPT-002 sidecar contains no forbidden keys
```

### Invariants

```text
INV-ADOPT-001 sidecar is never regenerated from already-managed auto route
INV-ADOPT-002 sidecar profile must equal target normalized profile
```

### Error Codes

```text
RUNTIME_AUXILIARY_ADOPTION_INVALID
RUNTIME_AUXILIARY_ADOPTION_MISSING
```

### Acceptance

```text
A-ADOPT-001
A-ADOPT-002
A-ADOPT-003
A-ADOPT-004
```

### Evidence

```text
required test: capture/reuse/missing/invalid matrix
required artifact: sanitized sidecar fixture
required digest: existing sidecar digest unchanged on repeat
```

---

## REQ-LOCK-001 — Main-process Auxiliary Mutation Lock

### Goal

使 enterprise runtime 的 routing ownership 不能被 Renderer 或直接 IPC 调用绕过。

### Normative Requirement

```text
MUST 在 set-auxiliary-task 与 reset-auxiliary-config Main IPC mutation 前调用 runtime lock guard。
MUST 在 local 且 RuntimeProvider.state != UNBOUND 时拒绝写入并返回/抛出 RUNTIME_PROVIDER_SETTINGS_LOCKED。
MUST 保证被拒绝请求 config bytes changed = 0 且 Gateway restart count = 0。
MUST NOT 仅依赖 Renderer disable。
```

### Inputs

```text
profile
Runtime Provider public state
IPC payload
```

### Preconditions

```text
none
```

### Authoritative State

```text
SOT: Runtime Provider public state + connection mode
```

### State Transition

```text
managed: request → rejected, state unchanged
unbound: request → existing behavior
```

### Allowed Side Effects

```text
ALLOW unmanaged: existing set/reset behavior
ALLOW managed rejection: diagnostic/log event only
```

### Forbidden Side Effects

```text
DENY managed: config write / Gateway restart / provider discovery side effect
```

### Ownership Scope

```text
ENTRY: IPC set/reset auxiliary mutation entry points
```

### Idempotency

```text
repeated rejected writes remain 0 mutation
```

### Failure Semantics

```text
F-LOCK-001 managed write request
error: RUNTIME_PROVIDER_SETTINGS_LOCKED
rollback: none; mutation=0
retryable: only after UNBOUND
```

### Postconditions

```text
POST-LOCK-001 managed route cannot be changed through Desktop IPC
```

### Invariants

```text
INV-LOCK-001 UI state is not a security boundary
```

### Acceptance

```text
A-LOCK-001
A-LOCK-002
```

### Evidence

```text
required test: Main IPC direct invocation under ACTIVE/ERROR/NOT_READY
required digest: config pre == post
required counter: restart calls == 0
```

---

## REQ-UI-001 — Managed Auxiliary Read-only UX

### Goal

让用户理解 Auxiliary route 已由 Enterprise Runtime 管理，同时避免 UI 产生无效可编辑入口。

### Normative Requirement

```text
MUST 在 managed local state 隐藏或 disable Auxiliary Edit 与 Reset mutation controls。
MUST 显示 EEC-D-15 的英文源文案，不在组件写死中文。
MUST 在 UNBOUND 恢复当前 unmanaged Auxiliary UX。
MUST NOT 在 managed state 打开编辑 modal 或触发 model discovery。
```

### Inputs

```text
Runtime Provider public state event
connection mode
Auxiliary config read model
```

### Preconditions

```text
Renderer mounted
```

### Authoritative State

```text
SOT: Main Runtime Provider state
Renderer: presentation only
```

### State Transition

```text
UNBOUND → managed: editable → read-only
managed → UNBOUND: read-only → editable
```

### Allowed Side Effects

```text
ALLOW: Renderer local presentation state
```

### Forbidden Side Effects

```text
DENY: direct config mutation / direct HTTP / secret access
```

### Ownership Scope

```text
COMPONENT: AuxiliaryTasksSection presentation
```

### Idempotency

```text
repeated state events render same controls
```

### Failure Semantics

```text
F-UI-001 runtime state unavailable → fail closed for mutation control only if Main reports managed lock on invocation; Renderer may show unavailable state, Main remains authority
```

### Postconditions

```text
POST-UI-001 managed user cannot initiate edit flow through normal UI
```

### Invariants

```text
INV-UI-001 Main guard remains authoritative
```

### Acceptance

```text
A-UI-001
A-UI-002
```

### Evidence

```text
required test: React component tests
required artifact: DOM assertion output
```

---

## REQ-CHECK-001 — Projection Integrity + Continuous Reconcile

### Goal

让 Auxiliary routing drift 成为现有 Runtime Provider drift 的一部分，由同一个 reconcile owner 修复。

### Normative Requirement

```text
MUST 扩展 checkManagedRuntimeProjection，检查 canonical slots 的 provider/model/base_url contained route，以及 api_key 是否出现。
MUST 把这两种偏离都记为 AUXILIARY_ROUTING_DRIFT。见 EEC-D-12、EEC-D-14。
MUST 检查 sidecar validity，并可报告 AUXILIARY_ADOPTION_MISSING / AUXILIARY_ADOPTION_INVALID。
缺失或非法 sidecar 按 EEC-D-13 在写入前停止。
MUST 复用现有 Continuous Reconcile 与 post-apply integrity check；MUST NOT 新建第二个 scheduler。
MUST 在 post-apply Auxiliary 仍 drift 时回滚 T0 并进入 RUNTIME_PROVIDER_POST_APPLY_DRIFT，MUST NOT ACTIVE。
```

### Inputs

```text
ReadyRuntimeContract
config.yaml
auxiliary adoption sidecar
existing main projection state
```

### Preconditions

```text
existing runtime provider integrity path
```

### Authoritative State

```text
SOT desired: contained route constant
Observed: config + sidecar
Resolved: ProjectionIntegrity
```

### State Transition

```text
MATCH → no repair
DRIFTED → existing reconcile apply → MATCH
post-check DRIFTED → rollback → ERROR
```

### Allowed Side Effects

```text
CHECK: read-only
REPAIR: existing managed transaction scope only
```

### Forbidden Side Effects

```text
DENY: second scheduler / second public state machine / backend mutation
```

### Ownership Scope

```text
SECTION: Runtime Provider integrity reasons
```

### Idempotency

```text
MATCH check = 0 mutation
repair twice = second run 0 semantic mutation
```

### Failure Semantics

```text
F-CHECK-001 post-check drift → rollback T0; RUNTIME_PROVIDER_POST_APPLY_DRIFT
F-CHECK-002 invalid adoption → no guessing; error state
```

### Postconditions

```text
POST-CHECK-001 ACTIVE implies Auxiliary containment check MATCH
```

### Invariants

```text
INV-CHECK-001 public ACTIVE cannot coexist with observed Auxiliary route drift after apply
```

### Acceptance

```text
A-CHECK-001
A-CHECK-002
A-CHECK-003
```

### Evidence

```text
required test: integrity + scheduler/orchestrator tests
required artifact: drift reasons and post-rollback snapshot
```

---

## REQ-TXN-001 — Unified READY Apply Transaction

### Goal

防止 main provider 与 Auxiliary routing 发生 partial apply。

### Normative Requirement

```text
MUST 把 config.yaml Auxiliary routing 与 auxiliary adoption sidecar 纳入 captureManagedTransaction T0。
MUST 在第一次 managed mutation 前完成 T0 capture。
MUST 在 project/restart/post-check 任一点失败时恢复 main projection、Auxiliary routing、sidecar、session overrides 与 managed memory 到本次 T0；logout 除外，见 REQ-LIFE-001。
MUST 在 rollback failure 时保留可恢复输入并返回 RUNTIME_PROVIDER_ROLLBACK_FAILED。
MUST NOT 把失败后的 partial Auxiliary route 标记 ACTIVE。
```

### Inputs

```text
current managed files
session overrides
memory secret
auxiliary sidecar
```

### Preconditions

```text
READY accepted generation
```

### Authoritative State

```text
T0 = pre-first-mutation managed transaction snapshot
```

### State Transition

```text
T0 → stage projection → secret → restart → post-check → ACTIVE
failure → restore T0 → ERROR
```

### Allowed Side Effects

```text
ALLOW: existing managed scope + auxiliary sidecar
```

### Forbidden Side Effects

```text
DENY: unrelated files / other profile / backend / NEW-API
```

### Ownership Scope

```text
TRANSACTION: Runtime Provider current profile managed scope
```

### Idempotency

```text
same READY + MATCH + same secret = noop
same READY + Auxiliary drift = repair only required fields
```

### Failure Semantics

```text
F-TXN-001 after sidecar create → rollback removes/restores sidecar to T0
F-TXN-002 after auxiliary config write → rollback config T0
F-TXN-003 restart fail → rollback all T0
F-TXN-004 post-check drift → rollback all T0
F-TXN-005 rollback fail → RUNTIME_PROVIDER_ROLLBACK_FAILED; recovery artifacts retained
```

### Postconditions

```text
POST-TXN-001 success = main + auxiliary + secret coherent
POST-TXN-002 ordinary apply failure = managed scope equals T0
```

### Invariants

```text
INV-TXN-001 no ACTIVE partial projection
```

### Acceptance

```text
A-TXN-001
A-TXN-002
A-TXN-003
```

### Evidence

```text
required test: failure injection after capture/create/config/restart/post-check
required digest: T0 semantic digest == after rollback digest
```

---

## REQ-LIFE-001 — Logout / NOT_READY / Profile Lifecycle

### Goal

在不泄漏 Member Key 的前提下保留 managed lifecycle，并在真正 logout 时恢复用户 Auxiliary routing。

### Normative Requirement

```text
MUST 在 NOT_READY 时保留有效 Auxiliary managed projection 与 sidecar；MUST NOT restore 用户 Auxiliary route。
MUST 在 STALE_ACTIVE / ERROR（已有 managed adoption）时保留 sidecar与 contained route。
MUST 在 logout 时先验证 sidecar；随后清除 managed Member Key，恢复 main adoption 与 Auxiliary 三个路由字段，并重启 Gateway 以验证旧 secret 被 purge。
MUST NOT 在 logout 恢复中写回 canonical slot 的 api_key。见 EEC-D-11。
MUST 在 successful logout restore + Gateway purge PASS 后删除 auxiliary sidecar并进入 UNBOUND。
MUST 在 Auxiliary restore 失败时保留 sidecar、保持 Member Key absent、尝试完成 Gateway purge，并进入 ERROR=RUNTIME_AUXILIARY_RESTORE_FAILED。
MUST 在 sidecar cleanup 失败时保持 Member Key absent，进入 ERROR=RUNTIME_AUXILIARY_ADOPTION_CLEANUP_FAILED；sidecar 保留供 retry。
MUST NOT 因 logout restore failure 把 Member Key rollback 回内存。
MUST 只处理当前目标 profile；不得写其它 profile。
```

### Inputs

```text
logout/not_ready reason
profile
sidecar
main adoption
managed secret
Gateway restart result
```

### Preconditions

```text
current connection local
```

### Authoritative State

```text
restore source: main adoption + auxiliary adoption sidecar
secret truth: managed secret store
```

### State Transition

```text
NOT_READY: managed → contained + no secret → NOT_READY
logout success: managed → restore + no secret + restart PASS + sidecar delete → UNBOUND
logout restore failure: → ERROR, secret absent, sidecar retained
```

### Allowed Side Effects

```text
ALLOW: current profile main/aux config, sidecar delete, managed secret clear, Gateway restart
```

### Forbidden Side Effects

```text
DENY: re-install Member Key during failed logout recovery
DENY: other profile mutation
```

### Ownership Scope

```text
RESOURCE: current profile managed runtime lifecycle
```

### Idempotency

```text
retry failed logout with retained sidecar repeats same restore target
successful logout then repeated clear behaves as existing UNBOUND lifecycle
```

### Failure Semantics

```text
F-LIFE-001 invalid/missing sidecar on logout → clear secret; preserve evidence; ERROR adoption code
F-LIFE-002 restore write fail → RUNTIME_AUXILIARY_RESTORE_FAILED
F-LIFE-003 Gateway purge fail → RUNTIME_SECRET_PURGE_UNVERIFIED takes precedence
F-LIFE-004 sidecar delete fail → RUNTIME_AUXILIARY_ADOPTION_CLEANUP_FAILED
```

### Postconditions

```text
POST-LIFE-001 UNBOUND implies sidecar absent and pre-managed route restored
POST-LIFE-002 any logout failure implies Member Key absent from managed secret store
```

### Invariants

```text
INV-LIFE-001 logout failure never resurrects enterprise credential
```

### Error Codes

```text
RUNTIME_AUXILIARY_ADOPTION_INVALID
RUNTIME_AUXILIARY_ADOPTION_MISSING
RUNTIME_AUXILIARY_RESTORE_FAILED
RUNTIME_AUXILIARY_ADOPTION_CLEANUP_FAILED
RUNTIME_SECRET_PURGE_UNVERIFIED
```

### Acceptance

```text
A-LIFE-001
A-LIFE-002
A-LIFE-003
A-LIFE-004
```

### Evidence

```text
required test: logout/not-ready/restart/profile matrix
required artifact: pre-managed vs restored routing snapshot
required counter: managedSecretPresent=false after logout failures
```

---

## REQ-COMP-001 — Local-only Compatibility Boundary

### Goal

避免 v1.5 影响 remote/ssh 与 unmanaged users。

### Normative Requirement

```text
MUST 在 connection.mode != local 时保持现有 Auxiliary behavior。
MUST NOT 创建/修改 auxiliary adoption sidecar。
MUST NOT 增加 remote/ssh Runtime Provider lock。
MUST 在 local + UNBOUND 时保持现有 Auxiliary edit/reset semantics。
```

### Inputs

```text
connection mode
runtime state
```

### Preconditions

```text
none
```

### Authoritative State

```text
SOT: getConnectionConfig().mode + runtime public state
```

### State Transition

```text
remote/ssh: unchanged
local UNBOUND: unchanged
local managed: v1.5 containment
```

### Allowed Side Effects

```text
existing remote/ssh/unmanaged behavior only
```

### Forbidden Side Effects

```text
enterprise auxiliary projection outside local managed mode
```

### Ownership Scope

```text
BOUNDARY
```

### Idempotency

```text
mode read repeated = same behavior
```

### Failure Semantics

```text
F-COMP-001 accidental remote mutation = Requirement FAIL
```

### Postconditions

```text
POST-COMP-001 remote/ssh semantic digest unchanged by v1.5 path
```

### Invariants

```text
INV-COMP-001 enterprise containment is local-only
```

### Acceptance

```text
A-COMP-001
A-COMP-002
```

### Evidence

```text
required test: remote + ssh + local UNBOUND regression
```

---

## REQ-SEC-001 — Secret and Authorization Boundary

### Goal

扩展 execution containment 时不改变既定凭证安全边界，也不把 NodeDeskClaw 变成 inference proxy。

### Normative Requirement

```text
MUST 保持 Member Key memory-only 语义；Auxiliary sidecar/config/Renderer/diagnostics/support bundle 均不得包含该 Key。
MUST 保持 Hermes → NEW-API direct data plane；NodeDeskClaw Runtime Bootstrap 仅作为 control-plane bootstrap。
MUST NOT 声称 Auxiliary contained model list 是 NEW-API authorization enforcement。
MUST NOT 新建 NodeDeskClaw inference endpoint 调用。
MUST NOT 记录 secret prefix/suffix/length/fingerprint 派生信息。
```

### Inputs

```text
managed Member Key
Runtime config
network destinations
logs/bundle
```

### Preconditions

```text
enterprise runtime flow
```

### Authoritative State

```text
Authorization: NEW-API Token Group
Runtime Secret: Main managed secret store
```

### State Transition

```text
none beyond parent Runtime lifecycle
```

### Allowed Side Effects

```text
Hermes child env receives existing managed key
```

### Forbidden Side Effects

```text
persistent key copy
Renderer key
NodeDeskClaw inference proxy
support bundle sidecar contents
```

### Ownership Scope

```text
SECURITY_BOUNDARY
```

### Idempotency

```text
n/a
```

### Failure Semantics

```text
F-SEC-001 secret appears in persistent/exported artifact → Release Gate FAIL
F-SEC-002 inference request reaches NodeDeskClaw → Golden FAIL
```

### Postconditions

```text
POST-SEC-001 execution containment changes routing only
```

### Invariants

```text
INV-SEC-001 NEW-API Group remains authorization boundary
```

### Acceptance

```text
A-SEC-001
A-SEC-002
A-SEC-003
```

### Evidence

```text
required test: secret sentinel scan + network counters
required artifact: sanitized Support Bundle
```

---

## REQ-OBS-001 — Diagnostics Reuse

### Goal

让 v1.4 Operations 能看见 Auxiliary drift，而不增加第二套诊断状态。

### Normative Requirement

```text
MUST 把 Auxiliary drift reason 进入现有 ProjectionIntegrity reasons 与 diagnostics history allowlist-safe event。
MUST 保持 getRuntimeProviderDiagnostics read-only：network=0、file write=0、Gateway mutation=0。
MUST NOT 把 Auxiliary sidecar内容、base_url query/userinfo、Member Key 输出到 Snapshot/History/Bundle。
```

### Inputs

```text
last projection check
runtime provider public state
existing v1.4 diagnostics
```

### Preconditions

```text
v1.4 diagnostics present
```

### Authoritative State

```text
SOT: existing projectionChecks + v1.4 snapshot model
```

### State Transition

```text
none; read-only
```

### Allowed Side Effects

```text
none except existing in-memory diagnostic event recording on actual runtime operation
```

### Forbidden Side Effects

```text
network / config write / secret / sidecar export
```

### Ownership Scope

```text
FIELD: existing diagnostic reason/status
```

### Idempotency

```text
100 repeated reads = 0 mutation
```

### Failure Semantics

```text
F-OBS-001 diagnostics assembly error → existing RUNTIME_DIAGNOSTICS_UNAVAILABLE
```

### Postconditions

```text
POST-OBS-001 support can distinguish Auxiliary routing drift from generic runtime error
```

### Invariants

```text
INV-OBS-001 diagnostics never becomes mutation path
```

### Acceptance

```text
A-OBS-001
A-OBS-002
```

### Evidence

```text
required test: diagnostics read-only + secret scan
```

---

## REQ-EVID-001 — Verification and Golden Consumer

### Goal

区分 synthetic correctness 与真实 enterprise runtime path。

### Normative Requirement

```text
MUST 执行 targeted unit/integration、full apps/work test、typecheck、guard。
MUST 记录 Required Acceptance 的 machine-readable Evidence。
MUST 使用真实 smc-copilot + local Hermes + NodeDeskClaw + enterprise NEW-API 做 Golden Consumer。
MUST 在 Golden 中证明 NodeDeskClaw inference request count = 0。
MUST 在 Golden 中证明 config effective state 的 canonical Auxiliary slots 全部 contained。
MUST 通过一个新 session 首消息/标题生成路径触发 Hermes title_generation Auxiliary task；若目标 Hermes build 未产生该 task 的可验证调用 Evidence，则该 Golden 必须 BLOCKED，不得用 synthetic 替代。
MUST 证明该 Auxiliary request 解析到 main enterprise route 并到达 NEW-API，而不是旧 Auxiliary provider。
```

### Inputs

```text
immutable implementation commit
real NodeDeskClaw session
real enterprise MemberToken
local Hermes runtime
NEW-API request evidence
```

### Preconditions

```text
all targeted local tests PASS
```

### Authoritative State

```text
SOT: executed Evidence artifacts
```

### State Transition

```text
IMPLEMENTED → VERIFIED only after Required Golden PASS
```

### Allowed Side Effects

```text
test fixtures + real Golden inference traffic
```

### Forbidden Side Effects

```text
fabricated PASS / synthetic substituted for Golden
```

### Ownership Scope

```text
EVIDENCE_STATE
```

### Idempotency

```text
new verification run creates new evidence identity
```

### Failure Semantics

```text
F-EVID-001 Golden unavailable → BLOCKED
F-EVID-002 title_generation not observable → BLOCKED
F-EVID-003 NodeDeskClaw inference count > 0 → FAIL
F-EVID-004 legacy Auxiliary provider request count > 0 → FAIL
```

### Postconditions

```text
POST-EVID-001 VERIFIED has real data-plane proof
```

### Invariants

```text
INV-EVID-001 CI green alone != VERIFIED
```

### Acceptance

```text
A-EVID-001
A-EVID-002
```

### Evidence

```text
required artifact: evidence JSON + network/runtime logs sanitized
required identity: repo/branch/commit/runtime version/timestamp
```

---

# 11. Side-Effect Contract

| Operation | DB Write | File Write | Network | Cache/Memory | Gateway | External Business Source |
|---|---:|---:|---:|---:|---:|---:|
| Read Auxiliary config | NO | NO | NO | NO | NO | NO |
| Capture adoption | NO | YES: sidecar | NO | NO | NO | NO |
| READY project | NO | YES: config/sidecar + existing managed files | NO during projection | managed secret | restart | NO |
| Integrity check | NO | NO | NO | projectionChecks memory | NO | NO |
| Continuous reconcile fetch | NO | MAY local files on repair | YES: NodeDeskClaw bootstrap only | YES | MAY restart | NO inference |
| User set/reset while managed | NO | **NO** | **NO** | log MAY | **NO** | NO |
| NOT_READY clear | NO | NO new Auxiliary restore | bootstrap already happened | secret clear | restart | NO |
| Logout restore | NO | YES current profile | NO | secret clear | restart | NO |
| Diagnostics read | NO | NO | NO | read-only | NO | NO |
| Support export | NO | new user-selected JSON | NO | read history | NO | NO |

Read-only scope：Integrity/Diagnostics 对 current profile 文件和 Main memory 只读；读取不得修复。

Telemetry/log：只允许现有 allowlist observability；不得记录 routing raw base URL query、sidecar、secret。

---

# 12. Ownership Contract

## 12.1 Ownership Type

```text
config.yaml auxiliary.<canonical-slot>.provider/model/base_url = SHARED FIELD OWNERSHIP
  UNBOUND: USER_OWNED
  managed local runtime: Runtime Provider FIELD owner

runtime-provider-auxiliary-adoption.json = GENERATED_ONLY / Runtime Provider FILE owner

unknown auxiliary slot / timeout / extra_body / unrelated config = USER_OWNED / PRESERVE
```

## 12.2 Ownership Rule

```text
创建 sidecar：首次 safe capture。
更新 sidecar：managed lease 内禁止更新。
用户手改 sidecar：视为 invalid/drift，不覆盖。
升级：schema 1.0 only；unknown version BLOCK。
remove：仅 successful logout cleanup。
```

## 12.3 Drift

```text
canonical routing != contained route
或 canonical slot 出现 api_key
→ AUXILIARY_ROUTING_DRIFT
→ 下一次现有 reconcile 修回三个路由字段并删除 api_key

sidecar invalid 或缺失且主 provider 已是 nodeskclaw
→ 按 EEC-D-13 BLOCK，这次 mutation 为 0

timeout、extra_body、unknown task slots
→ PRESERVE
```

---

# 13. Hash / Identity Contract

v1.5 不新增 content hash/digest 作为运行时决策。

Identity 定义：

```text
profile identity = existing normalizeRuntimeProfileId(profile)
  empty / undefined / "default" → "default"

Auxiliary sidecar identity =
  profileHome(normalized profile)
  + "/runtime-provider-auxiliary-adoption.json"
  + schema_version "1.0"

slot identity = exact string from AUX_TASK_SLOTS
```

Evidence digest 使用 SHA-256 对 sanitized artifact bytes 计算，UTF-8，不改变文件内容后再 hash。运行时不得用 Evidence digest 作为 ownership 决策。

---

# 14. Transaction Contract

## 14.1 READY / Reconcile Transaction Boundary

```text
TXN includes:
  config.yaml existing managed provider + Auxiliary routing fields
  providers.json
  models.json
  runtime-provider-adoption.json
  runtime-provider-auxiliary-adoption.json
  rewritable session model overrides
  managed in-memory Member Key + revision

TXN excludes:
  NodeDeskClaw DB
  NEW-API state
  other profile
  Hermes Core files outside existing managed projection
```

## 14.2 Commit Order

```text
accepted READY
→ pre-check
→ validate/capture Auxiliary adoption eligibility
→ snapshot T0
→ create/reuse auxiliary sidecar
→ project main Provider/Models
→ project canonical Auxiliary route
→ install memory secret
→ restart Gateway
→ post-apply full projection check
→ set applied revision
→ ACTIVE
```

## 14.3 Failure Atomicity

```text
T0 = 第一次 mutation 前：
  managed file snapshot
  session overrides
  memory secret/revision
  auxiliary sidecar bytes/absence

普通 READY/reconcile transaction 失败：
  AfterRollback(managed_scope) == T0
```

## 14.4 Logout Security Transaction

logout 不使用“把 secret 恢复回 T0”的普通 rollback 语义：

```text
validate restore source
→ clear managed secret (monotonic security action)
→ restore main adoption
→ restore Auxiliary adoption
→ restart Gateway / verify purge
→ delete auxiliary sidecar
→ UNBOUND
```

若 logout restore/cleanup 失败：

```text
Member Key MUST remain absent
sidecar MUST be retained when cleanup not complete
state = ERROR
retry uses same retained sidecar
```

## 14.5 Rollback Failure

```text
error = RUNTIME_PROVIDER_ROLLBACK_FAILED
recovery artifact = existing T0/recovery evidence path retained by implementation
auxiliary sidecar / pre-failure inputs MUST NOT be silently deleted
manual/support recovery = v1.4 diagnostics + Retry reconcile; no destructive reset added
```

---

# 15. Conflict Contract

| Conflict | Detection | Default Behavior | Error | Mutation |
|---|---|---|---|---:|
| sidecar valid already exists | schema/profile valid | REUSE | none | 0 sidecar write |
| sidecar invalid | parse/schema/profile/forbidden key | BLOCK | RUNTIME_AUXILIARY_ADOPTION_INVALID | 0 |
| sidecar missing + active main provider=nodeskclaw | current config check | BLOCK | RUNTIME_AUXILIARY_ADOPTION_MISSING | 0 |
| Auxiliary route drift while managed | integrity compare | REPAIR via existing reconcile | drift reason | owned fields only |
| manual IPC write while managed | `isRuntimeSettingsLocked` | DENY | RUNTIME_PROVIDER_SETTINGS_LOCKED | 0 |
| unknown slot/field | not in ownership set | PRESERVE | none | 0 |
| other profile | normalized identity mismatch | DENY | implementation invariant failure | 0 |
| logout restore write failure | write exception | retain sidecar + secret absent | RUNTIME_AUXILIARY_RESTORE_FAILED | partial restore allowed, retryable |
| sidecar cleanup failure | unlink failure | retain file + ERROR | RUNTIME_AUXILIARY_ADOPTION_CLEANUP_FAILED | no secret |

禁止 `last writer wins`、自动重建缺失 adoption、自动丢弃 invalid snapshot。

---

# 16. Compatibility / Migration

## 16.1 Existing State

```text
旧版本：v1.4 及之前
旧 schema：没有 auxiliary adoption sidecar
旧配置：用户可自由编辑 auxiliary provider/model/base_url
旧 Runtime lock：明确不锁 Auxiliary writes
```

## 16.2 Migration

首次 v1.5 enterprise READY：

```text
1. sidecar absent
2. current main provider != nodeskclaw
3. capture all canonical routing fields presence/value
4. create schema 1.0 sidecar
5. project contained route
```

已处于上一版本 managed projection 的升级场景：

```text
current main provider == nodeskclaw
AND sidecar absent
→ MUST NOT 猜原 Auxiliary 配置
→ RUNTIME_AUXILIARY_ADOPTION_MISSING
→ BLOCK v1.5 Auxiliary takeover
```

这是有意的 fail-closed migration rule，用于避免把 v1.4 运行期间的当前状态误当成 pre-managed user state。

## 16.3 Unknown Ownership

无法证明某个字段属于 canonical routing ownership：

```text
PRESERVE
REPORT only when it blocks known-route integrity
MUST NOT DELETE
```

---

# 17. External Dependency Contract

## 17.1 NodeDeskClaw Runtime Bootstrap

```text
repo: loudon84/nodeskclaw
commit: 7abb73e90e163f85257208ac4aa58e4914d2da6e
endpoint: POST /api/v1/runtime/model-bootstrap
role: control plane only
v1.5 schema change: NONE
fallback: existing STALE_ACTIVE / ERROR semantics
```

## 17.2 Hermes Auxiliary Routing

```text
consumer: local Hermes runtime used by apps/work
config source: config.yaml auxiliary.<task>
Desktop current semantic contract: provider="auto" uses main chat model
canonical slots: AUX_TASK_SLOTS at implementation commit
```

若目标 Hermes build 在 Golden 中不能证明 `auto → main provider`，Golden 为 BLOCKED，Release Gate 不得 PASS。

## 17.3 NEW-API

```text
role: data plane + authorization boundary
credential: existing Member Key
permission: existing NEW-API Group
v1.5 mutation: NONE
```

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| Member Key 写入 sidecar | strict schema + forbidden key scan | A-SEC-001 |
| Member Key 进入 Renderer/Bundle | existing memory-only + allowlist diagnostics | A-SEC-001 |
| Renderer 绕过 UI 直接写 IPC | Main lock guard | A-LOCK-001 |
| managed route 被手改到外部 Provider | integrity + continuous reconcile | A-CHECK-001 |
| sidecar 被删后重捕获 managed state | provider=nodeskclaw missing guard | A-ADOPT-003 |
| sidecar 篡改 | schema/profile validation, no auto repair | A-ADOPT-004 |
| logout restore failure resurrects Key | monotonic clear semantics | A-LIFE-003 |
| NodeDeskClaw 变 inference proxy | network boundary + Golden request counter | A-SEC-002 |
| unknown config 被误删 | field ownership + preserve | A-AUX-002 |
| cross-profile write | normalized profile scoping | A-LIFE-004 |

Path traversal：sidecar path 由 `profileHome(profile)` + constant basename 构成，Renderer 不提供任意 path。

Symlink：implementation 应沿用现有 profile file write primitive；若当前 primitive 对 symlink 安全语义不足，Plan 必须记录为 existing platform risk，不得自行引入新的任意路径写入口。

Arbitrary execution：v1.5 不执行用户提供命令。

---

# 19. Observability

沿用 v1.4 Operation/History 体系。

新增/扩展允许 stage/result：

```text
AUX_CAPTURE
AUX_PROJECT
AUX_RESTORE
AUX_CHECK
AUX_LOCK_DENY
```

每条事件最多记录：

```text
operation_id
generation
profile
stage
status
runtime_state
errorCode
projection reason enum
```

禁止：

```text
raw provider secret
Member Key
sidecar JSON
raw base_url query/userinfo
Authorization
secret-derived prefix/suffix/length/fingerprint
```

ProjectionIntegrity 可新增 reason：

```text
AUXILIARY_ROUTING_DRIFT
AUXILIARY_ADOPTION_MISSING
AUXILIARY_ADOPTION_INVALID
```

---

# 20. Acceptance Design Standard

## A-AUX-001 — Managed Projection

**Requirement Refs:** REQ-AUX-001

**Given:** 一个 profile 的 11 个 canonical slots 中至少 4 个使用不同 provider/model/base_url，其余为 auto/empty。

**When:** 执行 accepted READY apply。

**Then:** 11 个 slot 均为 `provider=auto, model="", base_url=""`。

**Oracle:** `getAuxiliaryConfig(profile)` 返回 11 行且每行精确匹配目标值；Runtime 最终 ACTIVE。

**Evidence:** `TEST-A-AUX-001`，Vitest 输出 + sanitized before/after JSON。

---

## A-AUX-002 — Preserve Unowned Fields

**Requirement Refs:** REQ-AUX-001

**Given:** canonical slot 同时含 timeout、extra_body、注释，另有 unknown slot `future_task`。

**When:** project + reconcile。

**Then:** 只改变 canonical provider/model/base_url。

**Oracle:** targeted-field 之外的 normalized YAML subtree/fixture digest 与 pre-image 相等；`future_task` 完整保留。

**Evidence:** `TEST-A-AUX-002`。

---

## A-AUX-003 — Idempotent Reapply

**Requirement Refs:** REQ-AUX-001

**Given:** 已 contained 且 sidecar valid。

**When:** 连续两次 accepted READY/reconcile same revision/same secret。

**Then:** 第二次 Auxiliary semantic mutation=0。

**Oracle:** second-run config digest unchanged；sidecar digest unchanged。

**Evidence:** `TEST-A-AUX-003`。

---

## A-ADOPT-001 — Capture Presence and Value

**Requirement Refs:** REQ-AUX-002

**Given:** slot A 字段存在且空，slot B 字段缺失，slot C 为 custom values。

**When:** first safe capture。

**Then:** sidecar 精确保留 present/value 区别。

**Oracle:** schema validation PASS；missing→`present=false,value=null`；empty→`present=true,value=""`。

**Evidence:** `TEST-A-ADOPT-001`。

---

## A-ADOPT-002 — Existing Valid Snapshot Reused

**Requirement Refs:** REQ-AUX-002

**Given:** sidecar valid 且 config 已 contained。

**When:** restart/session restore → READY。

**Then:** sidecar 不被改写。

**Oracle:** SHA-256 pre sidecar == post sidecar。

**Evidence:** `TEST-A-ADOPT-002`。

---

## A-ADOPT-003 — Missing Snapshot Fail Closed

**Requirement Refs:** REQ-AUX-002

**Given:** current main provider=nodeskclaw，sidecar absent。

**When:** v1.5 apply。

**Then:** 不 capture 当前 auto route；返回 `RUNTIME_AUXILIARY_ADOPTION_MISSING`。

**Oracle:** sidecar absent；config digest unchanged；Gateway restart count=0；state ERROR。

**Evidence:** `TEST-A-ADOPT-003`。

---

## A-ADOPT-004 — Invalid Snapshot Fail Closed

**Requirement Refs:** REQ-AUX-002

**Given:** sidecar JSON invalid / profile mismatch / forbidden key 三个 fixtures。

**When:** apply/reconcile。

**Then:** `RUNTIME_AUXILIARY_ADOPTION_INVALID`，0 mutation。

**Oracle:** config+sidecar digest unchanged；Gateway restart=0。

**Evidence:** `TEST-A-ADOPT-004`。

---

## A-LOCK-001 — Direct IPC Write Denied

**Requirement Refs:** REQ-LOCK-001

**Given:** local + ACTIVE，直接调用 set-auxiliary-task IPC。

**When:** 尝试写 custom provider/model/baseUrl。

**Then:** `RUNTIME_PROVIDER_SETTINGS_LOCKED`。

**Oracle:** config digest unchanged；Gateway restart=0。

**Evidence:** `TEST-A-LOCK-001`。

---

## A-LOCK-002 — Reset Also Denied

**Requirement Refs:** REQ-LOCK-001

**Given:** local + NOT_READY/ERROR 两种状态。

**When:** 调用 reset auxiliary。

**Then:** 同样被 lock。

**Oracle:** 两种 case 均 error exact；mutation=0。

**Evidence:** `TEST-A-LOCK-002`。

---

## A-UI-001 — Managed UI Read-only

**Requirement Refs:** REQ-UI-001

**Given:** Runtime state ACTIVE。

**When:** Providers/Auxiliary section render。

**Then:** Edit/Reset mutation controls不可操作；显示 EEC-D-15 的英文源文案。

**Oracle:** DOM 不存在 enabled edit/reset control；translation key rendered。

**Evidence:** `TEST-A-UI-001`。

---

## A-UI-002 — UNBOUND Restores UX

**Requirement Refs:** REQ-UI-001

**Given:** Runtime state UNBOUND。

**When:** section render。

**Then:** existing edit/reset flow 可用。

**Oracle:** controls enabled；打开 modal 不产生 Runtime lock error。

**Evidence:** `TEST-A-UI-002`。

---

## A-CHECK-001 — Drift Detected and Repaired

**Requirement Refs:** REQ-CHECK-001

**Given:** ACTIVE + valid sidecar；手工把 `compression.provider` 改为 custom。

**When:** integrity check + scheduled reconcile。

**Then:** pre-check reason 包含 `AUXILIARY_ROUTING_DRIFT`；repair 后 MATCH。

**Oracle:** final route auto/empty；single existing scheduler；state ACTIVE。

**Evidence:** `TEST-A-CHECK-001`。

---

## A-CHECK-002 — Read-only Check

**Requirement Refs:** REQ-CHECK-001

**Given:** drifted config。

**When:** 只执行 `checkManagedRuntimeProjection`。

**Then:** 不修复。

**Oracle:** config byte digest pre==post；network calls=0；Gateway restarts=0。

**Evidence:** `TEST-A-CHECK-002`。

---

## A-CHECK-003 — Post-apply Drift Blocks ACTIVE

**Requirement Refs:** REQ-CHECK-001, REQ-TXN-001

**Given:** 注入 post-apply Auxiliary drift。

**When:** READY apply。

**Then:** rollback T0；state ERROR；error=`RUNTIME_PROVIDER_POST_APPLY_DRIFT`。

**Oracle:** ACTIVE emission count=0；T0 digest restored。

**Evidence:** `TEST-A-CHECK-003`。

---

## A-TXN-001 — Failure After Sidecar Create

**Requirement Refs:** REQ-TXN-001

**Given:** sidecar initially absent。

**When:** capture/create sidecar 后注入 projection failure。

**Then:** rollback removes newly-created sidecar and restores config T0。

**Oracle:** managed-scope digest equals T0。

**Evidence:** `TEST-A-TXN-001`。

---

## A-TXN-002 — Failure After Auxiliary Write

**Requirement Refs:** REQ-TXN-001

**Given:** valid existing user config。

**When:** Auxiliary config write 后、Gateway restart 前注入 failure。

**Then:** config + sidecar + main projection + memory 回到 T0。

**Oracle:** semantic snapshot exact equal。

**Evidence:** `TEST-A-TXN-002`。

---

## A-TXN-003 — Restart Failure Rollback

**Requirement Refs:** REQ-TXN-001

**Given:** full project 已写。

**When:** Gateway restart 返回 fail。

**Then:** rollback T0，不进入 ACTIVE。

**Oracle:** final state ERROR；T0 digest equal；ACTIVE count=0。

**Evidence:** `TEST-A-TXN-003`。

---

## A-LIFE-001 — NOT_READY Preserves Containment

**Requirement Refs:** REQ-LIFE-001

**Given:** previous ACTIVE contained + sidecar valid。

**When:** 后端返回 explicit NOT_READY。

**Then:** secret 清除；Auxiliary route 仍 contained；sidecar 保留。

**Oracle:** managedSecretPresent=false；sidecar digest unchanged；route auto/empty；state NOT_READY。

**Evidence:** `TEST-A-LIFE-001`。

---

## A-LIFE-002 — Logout Restores User Route

**Requirement Refs:** REQ-LIFE-001

**Given:** pre-managed `compression=other-provider/model-x`，进入 ACTIVE 后 contained。

**When:** logout。

**Then:** pre-managed route 恢复；sidecar 删除；Member Key absent；Gateway purge restart PASS；UNBOUND。

**Oracle:** config fields equal captured presence/value；sidecar absent；secret=false；state=UNBOUND。

**Evidence:** `TEST-A-LIFE-002`。

---

## A-LIFE-003 — Logout Restore Failure Never Restores Secret

**Requirement Refs:** REQ-LIFE-001

**Given:** managed secret present + sidecar valid。

**When:** 注入 Auxiliary restore write failure。

**Then:** state ERROR=`RUNTIME_AUXILIARY_RESTORE_FAILED`（若 Gateway purge 也失败则 `RUNTIME_SECRET_PURGE_UNVERIFIED` 优先）；sidecar retained；secret absent。

**Oracle:** `managedSecretPresent=false`；sidecar exists；UNBOUND count=0。

**Evidence:** `TEST-A-LIFE-003`。

---

## A-LIFE-004 — Profile Isolation

**Requirement Refs:** REQ-LIFE-001

**Given:** profile A managed，profile B 有不同 Auxiliary config。

**When:** A reconcile/logout/profile switch。

**Then:** B bytes 不变。

**Oracle:** profile B config + sidecar digest pre==post。

**Evidence:** `TEST-A-LIFE-004`。

---

## A-COMP-001 — Remote/SSH No Projection

**Requirement Refs:** REQ-COMP-001

**Given:** remote 与 ssh 各一 fixture。

**When:** auth/runtime lifecycle 事件发生。

**Then:** 不创建 sidecar，不改 local Auxiliary config。

**Oracle:** file write count=0 for v1.5 assets。

**Evidence:** `TEST-A-COMP-001`。

---

## A-COMP-002 — Local UNBOUND Existing Behavior

**Requirement Refs:** REQ-COMP-001

**Given:** local UNBOUND。

**When:** set/reset Auxiliary。

**Then:** 沿用现有行为。

**Oracle:** mutation succeeds；existing unit expectations remain PASS。

**Evidence:** `TEST-A-COMP-002`。

---

## A-SEC-001 — Secret Sentinel Absent

**Requirement Refs:** REQ-SEC-001

**Given:** test Member Key=`sk-v15-secret-sentinel`。

**When:** READY/reconcile/logout/diagnostics/export 全链执行。

**Then:** sidecar/config persistent additions/Renderer payload/history/Support Bundle 均不含 sentinel 或其派生字段。

**Oracle:** recursive artifact scan match count=0；managed secret memory path除外。

**Evidence:** `TEST-A-SEC-001`。

---

## A-SEC-002 — Direct NEW-API Data Plane

**Requirement Refs:** REQ-SEC-001, REQ-EVID-001

**Given:** real enterprise setup。

**When:** Golden main + Auxiliary title-generation execution。

**Then:** NodeDeskClaw inference request count=0；NEW-API data-plane request count>0。

**Oracle:** sanitized network/server counters。

**Evidence:** `EVID-GOLDEN-EEC-001`。

---

## A-SEC-003 — Authorization Boundary Not Duplicated

**Requirement Refs:** REQ-SEC-001

**Given:** Bootstrap models subset + NEW-API Group 可见模型范围存在差异的 controlled fixture。

**When:** Desktop projection。

**Then:** v1.5 只写 routing，不创建 proxy/model firewall/model_limits。

**Oracle:** implementation diff 不含 inference proxy endpoint/model-filter transport；Runtime request仍使用原 Member Key direct provider。

**Evidence:** `TEST-A-SEC-003` + review evidence。

---

## A-OBS-001 — Auxiliary Drift Visible in Existing Diagnostics

**Requirement Refs:** REQ-OBS-001

**Given:** AUXILIARY_ROUTING_DRIFT。

**When:** read diagnostics。

**Then:** existing projection status/reasons 能表达该 drift。

**Oracle:** snapshot projection status != MATCH 且 reason enum存在；network/file write/restart=0。

**Evidence:** `TEST-A-OBS-001`。

---

## A-OBS-002 — Bundle Excludes Adoption Data

**Requirement Refs:** REQ-OBS-001, REQ-SEC-001

**Given:** sidecar包含 sentinel URL/model strings。

**When:** export v1.4 Support Bundle。

**Then:** Bundle 不复制 sidecar或其 values。

**Oracle:** exported JSON exact string search count=0。

**Evidence:** `TEST-A-OBS-002`。

---

## A-EVID-001 — Local Quality Gate

**Requirement Refs:** REQ-EVID-001

**Given:** implementation commit。

**When:** 执行：

```bash
cd apps/work
npm test -- --run
npm run typecheck
npm run guard
```

**Then:** required commands exit 0；targeted tests 均有 Evidence。

**Oracle:** exit_code=0；required test ids present。

**Evidence:** `EVID-LOCAL-EEC-001`。

---

## A-EVID-002 — Real Auxiliary Golden

**Requirement Refs:** REQ-EVID-001

**Given:** real smc-copilot + logged-in NodeDeskClaw user + valid MemberToken + local Hermes + enterprise NEW-API；pre-managed `title_generation` 指向一个可计数的 legacy test endpoint/provider。

**When:** login→READY→新建 session→发送首条消息→等待 title generation 完成→logout。

**Then:** ACTIVE 时 effective `title_generation` route=`auto/empty/empty`；legacy endpoint request count=0；NEW-API 收到 main/auxiliary data-plane request evidence；NodeDeskClaw inference count=0；logout 恢复 pre-managed title_generation route。

**Oracle:** 五个 machine counters/snapshots全部满足；任一不可观测项=BLOCKED，不可替代为 synthetic PASS。

**Evidence:** `EVID-GOLDEN-EEC-002`。

---

# 21. Acceptance Input Matrix

| Case | Sidecar | Main Provider | Aux Route | Mode | Event | Expected |
|---|---|---|---|---|---|---|
| 1 | absent | user provider | custom | local | READY | capture + contain |
| 2 | valid | nodeskclaw | contained | local | READY | reuse + noop |
| 3 | valid | nodeskclaw | drifted | local | reconcile | repair |
| 4 | absent | nodeskclaw | contained | local | READY | ADOPTION_MISSING, 0 mutation |
| 5 | invalid JSON | user/nodeskclaw | any | local | READY | ADOPTION_INVALID |
| 6 | profile mismatch | any | any | local | READY | ADOPTION_INVALID |
| 7 | valid | nodeskclaw | contained | local | NOT_READY | keep route + sidecar, clear secret |
| 8 | valid | nodeskclaw | contained | local | logout | restore + delete + UNBOUND |
| 9 | valid | nodeskclaw | contained | local | logout restore fail | ERROR + secret absent + sidecar retained |
| 10 | none | any | any | remote | lifecycle | no v1.5 write |
| 11 | none | any | any | ssh | lifecycle | no v1.5 write |
| 12 | none | user | custom | local UNBOUND | user edit | existing behavior |
| 13 | valid | nodeskclaw | contained | local ACTIVE | user edit IPC | SETTINGS_LOCKED, 0 mutation |
| 14 | valid | nodeskclaw | contained | local ACTIVE | sidecar delete | ADOPTION_MISSING/drift, no recapture |
| 15 | valid | nodeskclaw | contained + unknown fields | local | reconcile | unknown preserved |
| 16 | valid | nodeskclaw | contained | local | repeat reconcile | semantic mutation=0 |

---

# 22. Negative Acceptance

```text
N-AUX-001 managed IPC set custom provider
→ RUNTIME_PROVIDER_SETTINGS_LOCKED
→ config bytes changed = 0
→ Gateway restart = 0

N-ADOPT-001 sidecar missing while provider=nodeskclaw
→ RUNTIME_AUXILIARY_ADOPTION_MISSING
→ MUST NOT recreate

N-ADOPT-002 sidecar contains api_key key
→ RUNTIME_AUXILIARY_ADOPTION_INVALID
→ 0 mutation

N-CHECK-001 post-apply route remains custom
→ RUNTIME_PROVIDER_POST_APPLY_DRIFT
→ ACTIVE emission = 0

N-LIFE-001 logout restore failure
→ Member Key absent
→ MUST NOT rollback secret

N-COMP-001 remote/ssh event
→ sidecar write count = 0

N-SEC-001 Support Bundle contains sidecar value
→ Release Gate FAIL

N-GOLDEN-001 NodeDeskClaw receives inference request
→ Golden FAIL
```

---

# 23. Failure Injection

| Injection Point | Expected Postcondition |
|---|---|
| before sidecar create | T0 unchanged |
| immediately after sidecar create | ordinary apply rollback removes/restores sidecar |
| after first Auxiliary field write | full managed T0 restored |
| after Nth slot write | full managed T0 restored |
| after main model projection before secret | full managed T0 restored |
| after secret install before restart | full managed T0 restored, including previous secret |
| Gateway restart failure | full managed T0 restored; not ACTIVE |
| post-apply check returns AUX drift | rollback; POST_APPLY_DRIFT |
| rollback write failure | RUNTIME_PROVIDER_ROLLBACK_FAILED; recovery input retained |
| logout Auxiliary restore first write failure | secret remains absent; sidecar retained; ERROR |
| logout Gateway purge restart failure | RUNTIME_SECRET_PURGE_UNVERIFIED; secret absent |
| logout sidecar unlink failure | ADOPTION_CLEANUP_FAILED; sidecar retained; secret absent |
| diagnostics assembly failure | RUNTIME_DIAGNOSTICS_UNAVAILABLE; runtime mutation 0 |

每个 injection 必须有对应测试或 Evidence；未执行的 Required injection = BLOCKED。

---

# 24. Evidence Contract

## 24.1 Evidence Schema

每条 Required Acceptance Evidence 至少：

```json
{
  "acceptance_id": "A-AUX-001",
  "status": "PASS",
  "requirement_ids": ["REQ-AUX-001"],
  "test_ids": ["TEST-A-AUX-001"],
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v6.2.1",
  "commit_sha": "<implementation sha>",
  "command": "npm test -- ...",
  "exit_code": 0,
  "timestamp": "<ISO-8601>",
  "oracle": {
    "type": "exact/semantic/digest/counter",
    "expected": "...",
    "actual": "..."
  },
  "evidence_files": []
}
```

## 24.2 Evidence Integrity

必须关联：

```text
repo
branch
immutable implementation SHA
test command
timestamp
Node/npm/vitest version（local gate）
Hermes runtime version/build identity（Golden）
NodeDeskClaw commit
NEW-API deployment identity/version（Golden）
```

## 24.3 Secret Hygiene

Evidence 只能包含：

```text
boolean secret present/absent
request counts
providerRef/model ids where non-secret
sanitized host identity
hash/digest
```

不得包含 Member Key、Authorization、sidecar raw content。

---

# 25. Release Gate

Required gates：

```text
GATE-EEC-01 Source Integrity
GATE-EEC-02 Targeted Unit / Integration
GATE-EEC-03 Full apps/work test
GATE-EEC-04 Typecheck
GATE-EEC-05 Guard
GATE-EEC-06 Secret Sentinel
GATE-EEC-07 Failure Injection
GATE-EEC-08 Real NodeDeskClaw + Hermes + NEW-API Main Data Plane
GATE-EEC-09 Real Auxiliary title_generation Golden
GATE-EEC-10 Logout Restore Golden
```

状态：

```text
PASS
FAIL
SKIPPED
BLOCKED
```

规则：

```text
SKIPPED != PASS
BLOCKED != PASS
任何 Required Acceptance != PASS
→ Release Gate FAIL/BLOCKED
→ process exit != 0
```

本 PRD 创建时所有实施/Golden Evidence 均为 `BLOCKED`，因为代码尚未按 v1.5 实施。

---

# 26. Golden Consumer / Real-world Acceptance

## 26.1 Golden Environment

```text
smc-copilot implementation commit: immutable SHA
NodeDeskClaw: 7abb73e90e163f85257208ac4aa58e4914d2da6e
local Hermes runtime: record version/build/contract identity
enterprise NEW-API: record deployed version/identity
real test user: active membership + READY MemberToken
connection mode: local
```

## 26.2 Golden Before Snapshot

记录且脱敏：

```text
main active provider/model
canonical auxiliary semantic snapshot
auxiliary sidecar absent/present boolean
legacy title_generation provider endpoint request counter
NodeDeskClaw runtime-bootstrap counter
NodeDeskClaw inference-path counter (expected 0)
NEW-API data-plane counter
```

## 26.3 Golden Sequence

```text
1. UNBOUND 下配置 title_generation → legacy test provider/model。
2. 登录 NodeDeskClaw。
3. Bootstrap READY。
4. 验证 Runtime ACTIVE。
5. 验证 title_generation 与其余 canonical slots effective route == auto/empty/empty。
6. 新建 session，发送首条消息，等待 Hermes title generation 完成。
7. 采集路由/NEW-API/legacy provider/NodeDeskClaw counters。
8. logout。
9. 验证 legacy title_generation route 恢复、sidecar 删除、Member Key absent。
```

## 26.4 Golden PASS Oracle

```text
Runtime ACTIVE = true
all canonical auxiliary contained = true
legacy title_generation provider request count = 0
NEW-API data-plane request count delta > 0
NodeDeskClaw inference request count delta = 0
sidecar contains Member Key = false
logout final state = UNBOUND
logout managed secret present = false
logout restored title_generation == before snapshot
```

若 Hermes build 无法产生/观察 title_generation auxiliary evidence：

```text
GATE-EEC-09 = BLOCKED
Release != VERIFIED
```

Synthetic fixture 不得替代该 Golden。

---

# 27. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test | Evidence | Release Gate |
|---|---|---|---|---|---|
| REQ-AUX-001 | INV-AUX-001/002 | A-AUX-001/002/003 | TEST-A-AUX-001/002/003 | EVID-AUX-* | REQUIRED |
| REQ-AUX-002 | INV-ADOPT-001/002 | A-ADOPT-001/002/003/004 | TEST-A-ADOPT-* | EVID-ADOPT-* | REQUIRED |
| REQ-LOCK-001 | INV-LOCK-001 | A-LOCK-001/002 | TEST-A-LOCK-* | EVID-LOCK-* | REQUIRED |
| REQ-UI-001 | INV-UI-001 | A-UI-001/002 | TEST-A-UI-* | EVID-UI-* | REQUIRED |
| REQ-CHECK-001 | INV-CHECK-001 | A-CHECK-001/002/003 | TEST-A-CHECK-* | EVID-CHECK-* | REQUIRED |
| REQ-TXN-001 | INV-TXN-001 | A-TXN-001/002/003 | TEST-A-TXN-* | EVID-TXN-* | REQUIRED |
| REQ-LIFE-001 | INV-LIFE-001 | A-LIFE-001/002/003/004 | TEST-A-LIFE-* | EVID-LIFE-* | REQUIRED |
| REQ-COMP-001 | INV-COMP-001 | A-COMP-001/002 | TEST-A-COMP-* | EVID-COMP-* | REQUIRED |
| REQ-SEC-001 | INV-SEC-001 | A-SEC-001/002/003 | TEST/EVID SEC-* | EVID-SEC-* | REQUIRED |
| REQ-OBS-001 | INV-OBS-001 | A-OBS-001/002 | TEST-A-OBS-* | EVID-OBS-* | REQUIRED |
| REQ-EVID-001 | INV-EVID-001 | A-EVID-001/002 | local + Golden | EVID-LOCAL/GOLDEN | REQUIRED |

---

# 28. Plan Generation Contract

只有：

```text
status = APPROVED_FOR_PLAN
```

才允许生成 `.plan.md`。

## 28.1 Semantic Gap Check

Plan 前不得存在未定义的：

```text
slot set
sidecar path/schema
capture/overwrite rule
logout ordering
error precedence
managed lock condition
Auxiliary target route
ownership
drift behavior
rollback scope
Golden oracle
```

## 28.2 Requirement Coverage Check

每个 Requirement 必须有：

```text
ID
Acceptance
Failure semantics
Oracle
Evidence
```

## 28.3 Side Effect Check

所有 mutation 都已限制到：

```text
current profile
canonical routing fields
new sidecar
existing Runtime Provider managed scope
```

## 28.4 State Authority Check

```text
Runtime state → existing publicState
Auxiliary effective route → config.yaml
pre-managed route → new sidecar
authorization → NEW-API Group
```

## 28.5 Failure-path Check

rollback/retry/logout restore 均有 Failure Acceptance；若 Plan 发现现有 file primitive 无法满足 presence-aware restore，必须报告 `SPEC_SEMANTIC_GAP`，不得把“缺失”简化为空字符串。

---

# 29. `.plan.md` 输出标准

未来 Plan Todo 必须至少包含：

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
status: planned
evidence: pending
```

建议 Stage：

```text
P0 Source/Contract Recheck
P1 Auxiliary adoption schema + parser + presence-aware helpers
P2 Auxiliary projection + restore
P3 Transaction / integrity integration
P4 Orchestrator lifecycle + logout ordering
P5 Main IPC lock + Renderer read-only UX
P6 Diagnostics reason integration
P7 Targeted tests + failure injection
P8 Full quality gate
P9 Golden Consumer + Evidence closure
```

Plan 不得把 `implemented` 写成 `verified`，除非对应 Acceptance Evidence 已执行并 PASS。

---

# 30. Code Review Contract

Review 顺序：

```text
1. EEC-D-01～EEC-D-10 是否保持
2. RPB-D-16 override 是否只针对 Auxiliary lock，不破坏其它 parent rule
3. sidecar 是否严格独立于 runtime-provider-adoption.json
4. presence-aware capture/restore 是否成立
5. config ownership 是否只触及 provider/model/base_url
6. T0 transaction 是否包含 sidecar
7. logout failure 是否保持 secret absent
8. integrity/reconcile 是否复用 existing scheduler
9. remote/ssh 是否 0 behavior change
10. UI 是否只是 presentation，Main guard 是否真实存在
11. secret / Support Bundle 是否无泄漏
12. Required AC / Failure Injection / Golden Evidence 是否齐全
13. code quality
```

---

# 31. PRD Quality Gate

## Architecture

```text
[x] Goal 唯一明确
[x] Scope / Non-goal 完整
[x] Runtime / Authorization Owner 不重叠
[x] NodeDeskClaw 不承担 inference proxy
```

## State

```text
[x] Runtime state SOT 明确
[x] Auxiliary observed route SOT 明确
[x] pre-managed restore state SOT 明确
[x] authorization SOT 明确
```

## Semantics

```text
[x] canonical slots 明确
[x] target route 明确
[x] capture/reuse/missing/invalid 语义明确
[x] logout/NOT_READY 语义明确
[x] unknown fields ownership 明确
```

## Side Effects

```text
[x] projection mutation scope 明确
[x] lock rejection mutation=0
[x] diagnostics read-only
[x] remote/ssh no-write
```

## Failure

```text
[x] apply rollback postcondition 明确
[x] logout security-first failure 明确
[x] rollback failure 明确
[x] retryable cases明确
```

## Acceptance

```text
[x] 所有实施级 MUST 有 AC
[x] MUST NOT 有 Negative AC
[x] transaction 有 failure injection
[x] high-risk 有 input matrix
[x] Oracle 可机器判断
```

## Evidence

```text
[x] Required AC 有 Evidence schema
[x] Evidence 绑定 commit
[x] BLOCKED/SKIPPED 不算 PASS
[x] Synthetic 不替代 Golden
```

## Plan Readiness

```text
[x] PRD 本身无未决占位词
[x] Traceability 完整
[x] 用户审核本书面 PRD
[x] status = APPROVED_FOR_PLAN
```

---

# 32. PRD 禁止写法

本版本实现不得出现以下含糊语义：

```text
“未定义条件下恢复 Auxiliary”
“模糊描述保留原配置”
“自动处理 sidecar 冲突”
“如果缺失就重新生成 adoption”
“企业模型应该走 NEW-API”
“测试通过即可”
```

必须落实为本文 exact state / error / mutation / oracle。

---

# 33. 推荐 ID 体系

本 PRD 使用：

```text
REQ-AUX-xxx
REQ-LOCK-xxx
REQ-UI-xxx
REQ-CHECK-xxx
REQ-TXN-xxx
REQ-LIFE-xxx
REQ-COMP-xxx
REQ-SEC-xxx
REQ-OBS-xxx
REQ-EVID-xxx

INV-*
A-*
TEST-A-*
EVID-*
GATE-EEC-*
```

---

# 34. PRD 最小完整结构核对

```text
0. Document Meta / Rules                 PASS
1. Source Baseline                        PASS
2. Goal                                   PASS
3. Background                             PASS
4. Scope / Non-goal                       PASS
5. Terminology                            PASS
6. System Context                         PASS
7. State / SOT                            PASS
8. State Machine                          PASS
9. Schema                                 PASS
10. Requirements                          PASS
11. Side Effects                          PASS
12. Ownership                             PASS
13. Identity / Hash                       PASS
14. Transaction                           PASS
15. Conflict                              PASS
16. Migration                             PASS
17. External Dependency                   PASS
18. Security                              PASS
19. Observability                         PASS
20. Acceptance                            PASS
21. Edge-case Matrix                      PASS
22. Negative Acceptance                   PASS
23. Failure Injection                     PASS
24. Evidence                              PASS
25. Release Gate                          PASS
26. Golden Consumer                       PASS
27. Traceability                          PASS
28. Plan Generation Gate                  PASS
29. Plan Output Standard                  PASS
30. Code Review                           PASS
31. PRD Quality Gate                      PASS except user approval/status
32. Prohibited Ambiguity                  PASS
33. ID System                             PASS
34. Structure Check                       PASS
35. Definition of Done                    below
36. Final Principle                       below
```

---

# 35. Definition of Done

本 PRD 进入开发计划前：

```text
[x] 所有 MUST 唯一语义
[x] 所有状态有明确 SOT
[x] 所有 mutation 有 side-effect contract
[x] 所有 ownership 有 scope
[x] identity 定义完整；无运行时 content hash 歧义
[x] READY transaction 有 T0 / commit / rollback
[x] logout security transaction 有确定失败后状态
[x] rollback failure 有 retention/recovery contract
[x] conflict 有 deterministic behavior
[x] 所有 Requirement 有 AC
[x] 所有 MUST NOT 有 Negative AC
[x] 高风险 Requirement 有 edge-case matrix
[x] failure semantics 有 failure injection
[x] AC 有 machine-readable Oracle
[x] Required AC 有 Evidence Contract
[x] BLOCKED / SKIPPED 不算 PASS
[x] Synthetic / Golden 职责分开
[x] Traceability 完整
[x] 无 SPEC_SEMANTIC_GAP
[x] 用户审核书面 PRD
[x] PRD status = APPROVED_FOR_PLAN
```

实施完成后 Definition of Done：

```text
[ ] implementation commit immutable
[ ] targeted tests PASS
[ ] full npm test PASS
[ ] typecheck PASS
[ ] guard PASS
[ ] secret sentinel PASS
[ ] all required failure injection PASS
[ ] Main direct NEW-API Golden PASS
[ ] Auxiliary title_generation Golden PASS
[ ] logout restore Golden PASS
[ ] NodeDeskClaw inference request count = 0
[ ] Release Gate PASS
[ ] status = VERIFIED
```

---

# 36. 最终原则

```text
1. v1.5 管的是 Hermes Desktop execution routing，不是假装增加一套 NEW-API 授权系统。
2. NEW-API Group 继续是实际模型权限边界。
3. NodeDeskClaw 继续只提供身份与 Runtime Bootstrap，不中转 inference。
4. Main Chat 与 Auxiliary Tasks 在企业 Runtime ACTIVE 后必须共享同一个 managed Provider 路径。
5. Auxiliary `provider=auto` 是复用 Hermes 现有 main-model inheritance，而不是增加第二套 Provider resolver。
6. pre-managed Auxiliary 配置必须可恢复，且不得从已 managed 状态重新猜测。
7. sidecar 与 main adoption 分离，避免破坏 v1.1 已锁定 main adoption schema。
8. READY/reconcile 的 Auxiliary mutation 必须进入现有 T0 transaction。
9. logout 的 credential purge 优先于配置恢复；恢复失败不得复活 Member Key。
10. Main-process lock 是真实写边界，Renderer disable 只是 UX。
11. Projection Integrity 是唯一 drift resolver；不创建第二 scheduler/state machine。
12. remote/ssh 不属于本阶段。
13. Diagnostics 只观察，不修复；Support Bundle 不复制 adoption 内容。
14. ACTIVE 不能在 post-apply Auxiliary drift 下成立。
15. Golden 必须证明真实 Hermes execution 仍 direct NEW-API，且 NodeDeskClaw inference=0。
16. Synthetic Fixture 不能替代 Auxiliary Golden。
17. 2026-09-28 书面 PRD 已审核，status = APPROVED_FOR_PLAN。未执行 Golden 仍是 BLOCKED。
```
