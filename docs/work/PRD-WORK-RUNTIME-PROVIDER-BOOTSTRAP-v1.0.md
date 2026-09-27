---
title: "smc-copilot Runtime Provider Bootstrap v1.0 方案 PRD"
subtitle: "NodeDeskClaw Member Credential → Managed Provider/Model Projection → Local Hermes Direct NEW-API"
prd_id: "PRD-WORK-RUNTIME-PROVIDER-BOOTSTRAP-V1"
version: "1.1"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "9a4e7618d576790e0201aa8b2a0ed4e6ec4e70e6"
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
target_release: "Work Runtime Provider Bootstrap v1.0"
change_type:
  - "NEW_FEATURE"
  - "BROWNFIELD_CHANGE"
  - "ARCHITECTURE_CHANGE"
  - "INTEGRATION"
golden_consumer: "smc-copilot apps/work + local Hermes Gateway + NodeDeskClaw Runtime Bootstrap + enterprise NEW-API"
related_docs:
  - "需求PRD工程模板.md"
  - "PRD-NODESKCLAW-MEMBER-TOKEN-v1.0"
  - "nodeskclaw runtime_model_bootstrap @ 7abb73e90e163f85257208ac4aa58e4914d2da6e"
  - "smc-copilot Provider Identity P0.1 production wiring @ 9a4e7618d576790e0201aa8b2a0ed4e6ec4e70e6"
supersedes: null
---

# 0. PRD 使用原则

本 PRD 严格按《需求PRD工程模板.md》v1.0 输出，作为 **Human + AI Coding Machine-Executable Engineering Contract**。

## 0.1 强制规范关键词

`MUST / MUST NOT / SHOULD / SHOULD NOT / MAY` 按工程模板定义。

- 所有 `MUST / MUST NOT` MUST 映射至少一个 Acceptance。
- 所有 mutation MUST 有 Side-Effect Contract。
- 所有持久状态 MUST 有唯一 Source of Truth。
- Plan/Coding Agent MUST NOT 根据“常见做法”补全本 PRD 未定义的状态、默认值、冲突、事务、回滚或错误语义。
- 若实现阶段发现本文无法唯一确定关键语义，MUST 报告 `SPEC_SEMANTIC_GAP` 并 BLOCK Plan/Implementation。

## 0.2 Source Integrity Gate

本 PRD 的 smc-copilot 源码基线固定为：

```text
repo:   loudon84/smc-copilot
branch: work/prd-v6.2.1
commit: 9a4e7618d576790e0201aa8b2a0ed4e6ec4e70e6
```

NodeDeskClaw Runtime Bootstrap Contract 固定为：

```text
repo:   loudon84/nodeskclaw
branch: main
commit: 7abb73e90e163f85257208ac4aa58e4914d2da6e
endpoint:
  POST /api/v1/runtime/model-bootstrap
```

进入 `APPROVED_FOR_PLAN` 前 MUST：

1. 再次确认以上两个 immutable commit 仍是目标实施基线；
2. 若实施分支 HEAD 已变化，MUST 输出 baseline diff impact；
3. MUST 验证 NodeDeskClaw Bootstrap Contract 与本文 §8 Schema 一致；
4. MUST NOT 静默使用另一个分支或 HEAD 替代本文基线。

## 0.3 Grilling 决定（最高优先级）

本文 v1.1 记入 2026-09-27 grilling 决定 `RPB-D-01`～`RPB-D-18`。这些决定覆盖本文更早句子中与之冲突的表述。

```text
RPB-D-01
本地 Chat ModelPicker 的目录是当前 profile 的 models.json，读取入口是 listModels。
受管行 MUST 写 provider=nodeskclaw、providerRef=named:nodeskclaw。
MUST NOT 把 listConfiguredAgentModels 当作本地 Picker 的来源。

RPB-D-02
READY apply MUST 写入一条无 secret 的 Provider Registry 记录：
  providerKey=nodeskclaw
  baseUrl=Bootstrap.base_url
  keyEnv=NODESKCLAW_RUNTIME_MODEL_API_KEY
  apiMode=chat_completions
MUST NOT 调用 saveNamedProvider(secret=...) 保存成员密钥。
普通记录已占用该 providerKey 或该 keyEnv 时：
  error=MANAGED_PROVIDER_IDENTITY_CONFLICT
  mutation=0

RPB-D-03
NodeDeskClaw 会话存在且 connection mode=local 时，
Chat Picker 只列企业模型。本地模型行留在 catalog，这次会话不可选。

RPB-D-04
显式 NOT_READY 与 logout MUST 保留：
  providers.nodeskclaw 受管字段
  无密钥 Registry 记录
  providerRef=named:nodeskclaw 的模型行
并清除内存密钥、purge Gateway。保留投影不得表示可发送。

RPB-D-05
只投影当前显式活动 profile。
切换 profile 时清除上一 profile 的内存密钥，只对目标 profile bootstrap。
其它 profile 的文件本次不写。已有受管投影保留。

RPB-D-06
活动模型只写 model.provider=nodeskclaw 与 model.default=Bootstrap.default_model。
身份 base_url 只存在于 providers.nodeskclaw.base_url。
MUST NOT 把这份 base_url 写入 model 块作为身份。

RPB-D-07
connection mode=local 且 NodeDeskClaw 会话存在：
  ACTIVE / STALE_ACTIVE：Picker 只列上次成功应用的 models[]，可选。
  FETCHING / NOT_READY / ERROR / CLEARING：无可选模型。
    发送错误：NOT_READY、FETCHING、APPLYING、CLEARING = RUNTIME_NOT_READY
    ERROR = 当前 errorCode
UNBOUND：Picker 列出其余 catalog 行，不列 providerRef=named:nodeskclaw。
listModels MUST 仍返回完整 catalog。过滤只发生在 Chat Picker。

RPB-D-08
READY apply 到该 profile 时：
  会话覆盖仍是 named:nodeskclaw 且 model 在新 models[] 中：保持。
  其它覆盖改写为当前企业默认：
    providerRef=named:nodeskclaw
    migrationStatus=canonical
会话存在且 connection mode=local 时，发送只接受这对身份，
且 model 属于上次成功应用的集合。

RPB-D-09
登出进入 UNBOUND，且活动模型仍是 nodeskclaw 时，
恢复 runtime-provider-adoption.json 中的 provider 与 model。
仍登录时的显式 NOT_READY 不恢复。下次 READY 再写成新的企业默认。

RPB-D-10
同一 Hermes 进程同时只保留当前 profile 的成员密钥。
切换 profile 时清除上一 profile 的内存密钥。

RPB-D-11
Picker 过滤、发送门、设置锁、投影与密钥注入只在 connection mode=local 时生效。
remote/ssh 不投影、不注入成员密钥、不改全局模型、不改会话覆盖，发送行为保持现状。

RPB-D-12
每当活动模型还不是 nodeskclaw、即将被改成 nodeskclaw 时，
刷新 <profileHome>/runtime-provider-adoption.json。
文件只含 provider 与 model。当前活动模型已是 nodeskclaw 时不改该文件。
该文件不得包含 secret。

RPB-D-13
已登录且 connection mode 变为 local 时，对当前 profile 执行与 login 相同的 bootstrap。
从 local 切到 remote/ssh 不把远程发送改成企业路由，也不因此清除身份。

RPB-D-14
revision 与投影一致，但内存密钥与本次 READY api_key 不同：
  只更换内存密钥并重启 Gateway
  文件 mutation=0
  日志不得记录密钥，也不得记录二者不同的派生值

RPB-D-15
同一 profile 同时只有一个编排操作。
后发生的 login、refresh、profile switch、切回 local 或 logout
作废尚未完成的操作。作废操作不得再写文件，不得把状态写成 ACTIVE。
logout 盖过进行中的 apply。
身份切换走 logout 清除，再对新身份 bootstrap。

RPB-D-16
登录且 connection mode=local 时，Main MUST 拒绝该 profile 的用户写入：
  活动模型
  LLM Provider（含本地 Provider 与厂商密钥）
  模型库
  凭证池
  OAuth
  工具密钥
  浏览器自动化
  语音
  研究训练
  消息平台
error=RUNTIME_PROVIDER_SETTINGS_LOCKED
mutation=0
编排器对受管 Registry、YAML、受管模型行和内存密钥的写入不受此拒绝。
辅助任务写入不受此拒绝。

RPB-D-17
本地发送在 FETCHING、APPLYING、CLEARING、NOT_READY 时错误码为 RUNTIME_NOT_READY。
ERROR 时使用该状态上的 errorCode。

RPB-D-18
无密钥 Registry 记录与 RPB-D-04 的 YAML、受管模型行使用同一保留规则。
```

---

# 1. 一句话目标

让 **已登录 NodeDeskClaw 的 smc-copilot 桌面用户**，在本机 Hermes Runtime 可用的前置条件下，通过 NodeDeskClaw Runtime Bootstrap 自动取得当前用户自己的企业模型 Provider、模型目录与临时运行凭证，并将其投影到现有 Hermes Provider Identity / Model / Gateway 体系，使 Chat **直接经 Local Hermes Gateway 调用 NEW-API**，同时保证 Member API Key 不写入桌面持久文件、不进入 Renderer、不进入日志，并在身份切换、撤销和登出时确定性清除旧身份运行权限。

---

# 2. 背景与问题定义

## 2.1 Current State

### 2.1.1 NodeDeskClaw 已完成的 Control Plane 能力

当前 NodeDeskClaw `main@7abb73e9...` 已提供：

```http
POST /api/v1/runtime/model-bootstrap
Authorization: Bearer <NodeDeskClaw Access Token>
Content-Type: application/json

{
  "consumer": "smc-copilot",
  "runtime": "hermes-agent"
}
```

当前 Backend 行为：

- 当前用户与当前组织由登录身份解析；
- 只读取当前用户 Membership 上的默认 `member_token`；
- 只有 `READY` 返回 `base_url`、`api_key`、`default_model`、`models[]`、`revision`；
- 非 READY 返回 HTTP 200，但 MUST NOT 返回 `api_key`；
- Bootstrap 本身不代理推理请求；
- Bootstrap 本身不调用 NEW-API；
- 返回头包含 `Cache-Control: no-store` 与 `Pragma: no-cache`。

Backend readiness state 当前定义：

```text
READY
MODEL_NOT_CONFIGURED
MODEL_CREDENTIAL_CLOSING
MODEL_CREDENTIAL_DISABLED
MODEL_PROVIDER_UNSUPPORTED
MODEL_SYNC_NOT_READY
MODEL_CREDENTIAL_INVALID
MODEL_LIST_EMPTY
MODEL_DEFAULT_NOT_SET
MODEL_DEFAULT_INVALID
```

### 2.1.2 smc-copilot 已存在的可复用能力

`work/prd-v6.2.1@9a4e7618...` 已具备：

1. **NodeDeskClaw Auth Main-process Transport**
   - `auth/authorized-backend-transport.ts`
   - JWT 注入
   - Token refresh
   - 401/403 retry
   - same-origin 校验
   - timeout
   - Renderer 不接触 Access Token

2. **Auth Session Lifecycle**
   - `auth/auth-ipc.ts`
   - `auth/token-store.ts`
   - login / logout / refresh / session hydration

3. **Provider Identity v2**
   - `provider-identity/provider-ref.ts`
   - `provider-identity/runtime-provider-resolver.ts`
   - `provider-identity/provider-save-transaction.ts`
   - `providers-store.ts`
   - `agent-config-providers.ts`

4. **Hermes Named Provider Projection**
   - `config.yaml -> providers:<slug>`
   - `name`
   - `base_url`
   - `key_env`
   - `api_mode`

5. **Model Library**
   - `models.json`
   - `model-definitions.json`
   - `SavedModelRow.providerRef`
   - `named:<providerKey>`

6. **Hermes Runtime**
   - `runtime/hermes-cli-runner.ts`
   - `runtime/runtime-manager.ts`
   - `runtime/native-hermes-runtime-backend.ts`
   - `hermes.ts`

### 2.1.3 当前限制

现有能力尚未形成 NodeDeskClaw Member Credential → Local Hermes 的闭环：

```text
NodeDeskClaw Login
      ↓
Auth Session
      ↓
[缺口]
      ↓
Hermes Provider / Models / Secret
      ↓
Local Hermes Gateway
      ↓
NEW-API
```

当前普通 `saveNamedProvider()` 可把 `secret` 写入 Profile `.env`；该语义适用于用户本地 Provider，但不适用于企业身份绑定 MemberToken。

当前本地 Chat ModelPicker 读取当前 profile 的 `models.json`（`listModels`）。`named:<providerKey>` 只有在 `providers.json` 里恰好有一条同 key 记录时才能被 `resolveRuntimeProvider` 解析。`RPB-D-01`～`RPB-D-02` 覆盖任何仍把 `listConfiguredAgentModels` 当作本地 Picker 来源的句子。

当前 Hermes child env 构造会继承：

```text
process.env
+
profile .env
+
configured secrets provider
```

尚无“企业受管、仅内存、仅 Hermes child 可见”的 Runtime Secret Layer。

## 2.2 Problem

P-001：企业模型凭证已经由 NodeDeskClaw 统一管理，但 smc-copilot 尚不能按当前登录身份自动消费 Runtime Bootstrap。

P-002：若直接复用普通 Custom Provider 保存流程，Member API Key 会进入 `.env`，无法满足企业身份凭证的短生命周期与撤销语义。

P-003：Provider、ModelPicker、Hermes runtime route 目前虽已具备 Provider Identity v2，但缺少 Backend-managed Provider 的 ownership 与 reconciliation 语义。

P-004：当前 Logout 只清 Portal session / Expert / SkillRun；已运行 Hermes Gateway 可能继续持有其启动时继承的旧 Member Key。

P-005：如果 NodeDeskClaw 暂时不可达，必须区分“首次无法初始化”与“已 ACTIVE 后 Control Plane 暂时不可达”；二者不能使用同一降级行为。

P-006：NodeDeskClaw 不应被引入 Chat 数据面，否则会把 Control Plane 误实现为 LLM Proxy。

## 2.3 Impact

```text
业务影响：
  用户仍需手工配置模型或凭证，无法实现员工身份即模型身份。

工程影响：
  Auth、Provider、Model、Hermes Runtime 已分别存在，但缺少统一 Orchestrator。

安全影响：
  错误复用 .env 持久化会扩大 Member API Key 暴露面；
  Logout 后旧 Gateway 可能继续持有旧身份凭证。

运维影响：
  Provider/模型变化不能由 Backend revision 驱动桌面收敛。

AI Coding 影响：
  若不先固定 SOT、ownership、revision、logout、failure semantics，
  Plan Agent 会出现多种合理实现路径。
```

---

# 3. Scope / Non-goal

## 3.1 In Scope

```text
SCOPE-001 NodeDeskClaw Runtime Bootstrap Main-process Client
SCOPE-002 Runtime Provider Contract / Schema 校验
SCOPE-003 Managed Runtime Secret Store（内存）
SCOPE-004 Hermes named provider `nodeskclaw` 投影
SCOPE-005 Backend models → managed model rows reconcile
SCOPE-006 Backend default_model → Hermes active/default model
SCOPE-007 Chat ModelPicker 纳入 managed named-provider models
SCOPE-008 Login / session restore / refresh / logout 生命周期编排
SCOPE-009 revision 驱动 idempotent apply
SCOPE-010 Hermes child env 精确注入 managed runtime secret
SCOPE-011 Gateway restart / purge / verification
SCOPE-012 Runtime readiness gate
SCOPE-013 Golden Consumer：Hermes → NEW-API 直连证明
SCOPE-014 Security / Observability / Evidence 闭环
```

## 3.2 Out of Scope

```text
NON-GOAL-001 MUST NOT 修改 NodeDeskClaw Backend Runtime Bootstrap 业务语义。
NON-GOAL-002 MUST NOT 让 NodeDeskClaw 代理 Chat/LLM 推理请求。
NON-GOAL-003 MUST NOT 在 Renderer 保存或读取 Member API Key。
NON-GOAL-004 MUST NOT 把 Member API Key 写入 .env / config.yaml / providers.json /
             models.json / work-settings.json / SQLite / session files。
NON-GOAL-005 MUST NOT 以 hermesone 作为 NodeDeskClaw NOT_READY 的自动 fallback。
NON-GOAL-006 MUST NOT 自动切换到用户其它本地 Provider 绕过企业 readiness gate。
NON-GOAL-007 MUST NOT 把 NodeDeskClaw managed models 镜像成 legacy custom_providers。
NON-GOAL-008 MUST NOT 在 v1.0 重做现有 Provider Identity v2。
NON-GOAL-009 MUST NOT 在 v1.0 重做 Hermes Gateway transport。
NON-GOAL-010 MUST NOT 在 v1.0 引入后台定时轮询；刷新触发仅来自本文定义的 lifecycle events。
NON-GOAL-011 MUST NOT 在 v1.0 将 Backend `capabilities/settings/max_output_tokens`
              写入全局 ModelDefinition SOT。
```

## 3.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Identity | NodeDeskClaw Auth | 用户登录 | JWT session | 模型推理 |
| Runtime Credential | NodeDeskClaw Backend | JWT + 当前 org/member | Runtime Bootstrap Contract | Hermes lifecycle |
| Runtime Orchestration | smc-copilot Main | Bootstrap Contract | Managed runtime state | LLM inference |
| Provider Projection | smc-copilot Main | READY provider | `providers.nodeskclaw` | Secret 持久化 |
| Model Projection | smc-copilot Main | READY models/default | managed rows + default | NEW-API 模型发现 |
| Secret Injection | smc-copilot Main | READY api_key | Hermes child env | Renderer exposure |
| Runtime Execution | Local Hermes Gateway | Provider/model/env | OpenAI-compatible call | 用户身份管理 |
| Inference | NEW-API | Member Key + model request | LLM response | Desktop auth |

---

# 4. Architecture Boundary / Target Architecture

## 4.1 Control Plane

```text
NodeDeskClaw Backend
POST /api/v1/runtime/model-bootstrap
          ▲
          │ JWT
          │
AuthorizedBackendTransport
          ▲
          │
smc-copilot Electron Main
          │
RuntimeProviderOrchestrator
 ┌────────┼───────────┬──────────────┐
 │        │           │              │
 ▼        ▼           ▼              ▼
Contract Provider   Model        Managed Secret
Parser   Projection Reconcile    Store(memory)
 │        │           │              │
 │        ▼           ▼              │
 │    config.yaml   models.json      │
 │    providers:    managed rows     │
 │    nodeskclaw                    │
 └───────────────┬───────────────────┘
                 │
          Hermes restart/ensure
                 │
                 ▼
          Local Hermes Gateway
```

## 4.2 Data Plane

```text
smc-copilot Renderer
        ↓ IPC
Electron Main / Chat
        ↓
Local Hermes Gateway
        ↓ Authorization: Bearer <Member Key>
Enterprise NEW-API
        ↓
LLM Provider / Model
```

**Invariant：NodeDeskClaw Backend MUST NOT 位于上述数据面。**

---

# 5. Terminology / Domain Model

| Term | Definition |
|---|---|
| Runtime Bootstrap | NodeDeskClaw 当前登录用户自作用域模型运行配置 |
| Managed Provider | Backend 管理、Desktop 仅投影的 Provider |
| Managed Model | `providerRef=named:nodeskclaw` 且由当前 Bootstrap models 驱动的模型 |
| Managed Runtime Secret | NodeDeskClaw 返回的 Member API Key，仅存在 Electron Main memory 与 Hermes child env |
| Provider Projection | 将 Backend provider contract 映射成 Hermes `providers.nodeskclaw` |
| Model Reconcile | 使本地 managed model 集合与 Backend `models[]` 精确一致 |
| Runtime Readiness | smc-copilot 对当前身份模型运行能力的本地状态 |
| Backend State | NodeDeskClaw `READY/MODEL_*` state |
| Revision | NodeDeskClaw 返回的非明文变更标识；Desktop 不重新计算 |
| ACTIVE | 当前进程已持有 secret，Provider/Models 已投影，Hermes 已验证可运行 |
| STALE_ACTIVE | Control Plane 刷新失败，但当前 ACTIVE runtime 仍保持且未收到 Backend NOT_READY |
| UNBOUND | 无有效 NodeDeskClaw Auth session |
| Runtime Purge | 清除 managed secret，并确保旧 Gateway 不继续持有旧身份 secret |
| Reserved Key Env | `NODESKCLAW_RUNTIME_MODEL_API_KEY` |
| Managed Provider Key | `nodeskclaw` |
| Managed Provider Ref | `named:nodeskclaw` |

---

# 6. State / Source of Truth

## 6.1 Authoritative State Table

| State | Role | Authoritative? | Writer | Reader | 可否自动覆盖 |
|---|---|---:|---|---|---:|
| NodeDeskClaw Auth Session | DESIRED/IDENTITY | YES | Auth Client | Main Process | YES，仅 Auth lifecycle |
| Bootstrap `ready/state` | DESIRED_STATE | YES | NodeDeskClaw Backend | Orchestrator | NO |
| Bootstrap `revision` | DESIRED_STATE identity | YES | NodeDeskClaw Backend | Orchestrator | NO |
| Bootstrap `base_url` | DESIRED_STATE | YES | NodeDeskClaw Backend | Provider Projector | NO |
| Bootstrap `default_model` | DESIRED_STATE | YES | NodeDeskClaw Backend | Model Projector | NO |
| Bootstrap `models[]` | DESIRED_STATE | YES | NodeDeskClaw Backend | Model Projector | NO |
| Bootstrap `api_key` | RUNTIME_SECRET | YES | NodeDeskClaw Backend | Main memory + Hermes child | NO |
| `providers.nodeskclaw` | LAST_APPLIED_STATE | NO | smc-copilot | Hermes | YES，仅 managed fields |
| managed `models.json` rows | LAST_APPLIED_STATE | NO | smc-copilot | ModelPicker/runtime | YES，仅 managed rows |
| local runtime readiness | RUNTIME_STATE | NO | Orchestrator | Main/Renderer public state | YES |
| Hermes Gateway probe | OBSERVED_STATE | YES for runtime health | RuntimeManager | Orchestrator | N/A |
| log/evidence | EVIDENCE_STATE | NO | smc-copilot | QA/Review | append-only |

## 6.2 Secret SOT

```text
Backend READY api_key
    ↓
ManagedRuntimeSecretStore (memory)
    ↓
Hermes child environment

MUST NOT create any persistent secret SOT on Desktop.
```

## 6.3 Provider SOT

```text
Desired:
  Backend READY.base_url
  fixed provider key = nodeskclaw
  fixed key_env = NODESKCLAW_RUNTIME_MODEL_API_KEY
  fixed api_mode = chat_completions

Last Applied:
  profile config.yaml -> providers.nodeskclaw
  profile providers.json -> providerKey nodeskclaw（无 secret，RPB-D-02）
```

## 6.4 Model SOT

```text
Desired:
  Backend READY.models[]
  Backend READY.default_model

Last Applied:
  models.json rows where providerRef == named:nodeskclaw and provider == nodeskclaw
  config.yaml model.provider=nodeskclaw and model.default
  <profileHome>/runtime-provider-adoption.json（非密钥，仅 provider 与 model）

身份 base_url 不属于活动模型字段。见 RPB-D-06、RPB-D-12。
```

---

# 7. State Machine

## 7.1 Runtime Provider State

```text
UNBOUND
  │ auth login / hydrated session，且 connection mode=local
  ▼
FETCHING
  │ connection mode 不是 local：留在 UNBOUND，不 bootstrap
  ├─ backend READY + need apply ───────► APPLYING ──success──► ACTIVE
  ├─ backend READY + same revision
  │   + active secret + projection ok ──────────────────────► ACTIVE
  ├─ backend NOT_READY ─────────────────────────────────────► NOT_READY
  └─ transport/schema failure
      ├─ no prior ACTIVE ───────────────────────────────────► ERROR
      └─ prior ACTIVE ──────────────────────────────────────► STALE_ACTIVE

ACTIVE / STALE_ACTIVE
  │ backend explicit NOT_READY
  ▼
CLEARING
  └─ purge verified ────────────────────────────────────────► NOT_READY

ACTIVE / STALE_ACTIVE
  │ logout / identity switch
  ▼
CLEARING
  └─ purge verified ────────────────────────────────────────► UNBOUND

APPLYING
  └─ apply/restart failure ─────────────────────────────────► ERROR
```

## 7.2 Legal Transitions

| From | Event | To | Rule |
|---|---|---|---|
| UNBOUND | authenticated 且 connection mode=local | FETCHING | MUST bootstrap |
| UNBOUND | authenticated 且 connection mode 不是 local | UNBOUND | MUST 跳过 bootstrap |
| FETCHING | READY/new revision | APPLYING | MUST apply |
| FETCHING | READY/same active revision | ACTIVE | MUST NO-OP |
| FETCHING | NOT_READY | NOT_READY | MUST NOT expose secret |
| FETCHING | transport fail/no active | ERROR | Chat blocked |
| ACTIVE | refresh transport fail | STALE_ACTIVE | preserve current runtime |
| ACTIVE | READY/new revision | APPLYING | rotate/reconcile/restart |
| ACTIVE | NOT_READY | CLEARING | revoke local runtime |
| ACTIVE | logout | CLEARING | purge old identity |
| CLEARING | purge verified | UNBOUND/NOT_READY | target depends trigger |

## 7.3 Illegal Transitions

```text
NOT_READY → ACTIVE without fresh READY Bootstrap
ERROR → ACTIVE without fresh READY Bootstrap
UNBOUND → ACTIVE using persisted local secret
logout → UNBOUND while old Gateway secret purge is unverified and Chat remains enabled
Backend NOT_READY → hermesone/local provider auto fallback
```

## 7.4 State Persistence

Runtime state and secret：

```text
MUST be memory-only.
```

Provider/model projection：

```text
MAY persist because不含明文 secret；
but MUST NOT independently grant runtime readiness.
```

---

# 8. Schema / Contract

## 8.1 Bootstrap Request

Schema ID：

```text
work.nodeskclaw.runtime-bootstrap.request.v1
```

Payload：

```json
{
  "consumer": "smc-copilot",
  "runtime": "hermes-agent"
}
```

Rules：

```text
additionalProperties = false
consumer MUST equal "smc-copilot"
runtime MUST equal "hermes-agent"
```

## 8.2 READY Response Data

```json
{
  "ready": true,
  "state": "READY",
  "revision": "<sha256-like backend-owned string>",
  "provider": "new-api",
  "base_url": "http://new-api.example/v1",
  "api_key": "<member key>",
  "provider_group": "group-name-or-null",
  "default_model": "model-id",
  "models": [
    {
      "id": "model-id",
      "display_name": "Model Name",
      "context_window": null,
      "max_output_tokens": null,
      "capabilities": [],
      "settings": {
        "extra": {}
      }
    }
  ]
}
```

## 8.3 NOT_READY Response Data

最低要求：

```json
{
  "ready": false,
  "state": "MODEL_*",
  "revision": null
}
```

`provider` MAY 存在。

`api_key` MUST NOT 存在。

## 8.4 Field Semantic Table

| Field | Type | Required | Default | Authority | Meaning |
|---|---|---:|---|---|---|
| ready | boolean | YES | none | Backend | Runtime 是否可应用 |
| state | enum/string | YES | none | Backend | readiness reason |
| revision | string/null | YES | null | Backend | READY 配置变更标识 |
| provider | string | READY=YES | none | Backend | v1 仅接受 `new-api` |
| base_url | string | READY=YES | none | Backend | OpenAI-compatible inference base URL |
| api_key | string | READY=YES | none | Backend | 当前成员运行凭证 |
| provider_group | string/null | NO | null | Backend | 审计/展示信息，v1 不参与 routing |
| default_model | string | READY=YES | none | Backend | 当前企业默认模型 |
| models | array | READY=YES | none | Backend | 当前允许模型 |
| models[].id | string | YES | none | Backend | Runtime model id |
| models[].display_name | string | YES | id | Backend | UI display |
| context_window | number/null | NO | null | Backend | v1 parse but不写全局 ModelDefinition |
| max_output_tokens | number/null | NO | null | Backend | v1 parse only |
| capabilities | string[] | NO | [] | Backend | v1 parse only |
| settings | object | NO | {} | Backend | v1 parse only |

## 8.5 Desktop Managed Provider Constants

```text
providerKey:  nodeskclaw
providerRef:  named:nodeskclaw
displayName:  SMC Enterprise Model
keyEnv:       NODESKCLAW_RUNTIME_MODEL_API_KEY
apiMode:      chat_completions
```

这些值在 v1.0 MUST NOT 由 Renderer 或用户配置覆盖。

---

# 9. Requirements

## REQ-API-001 — NodeDeskClaw Runtime Bootstrap Client

### Goal

复用现有 Main-process Auth Transport 获取当前身份 Runtime Contract。

### Normative Requirement

```text
MUST 使用 createAuthorizedBackendTransport()/authorizedFetch。
MUST POST /api/v1/runtime/model-bootstrap。
MUST 使用固定 request consumer/runtime。
MUST NOT 从 Renderer 接收 access token。
MUST NOT 自行实现第二套 JWT refresh。
MUST 对 HTTP、JSON、Schema 做严格校验。
MUST 将 api_key 在日志/错误中视为 secret。
```

### Inputs

```text
authenticated NodeDeskClaw session
current auth endpoint config
```

### Preconditions

```text
PRE-API-001 已存在有效或可 refresh 的 NodeDeskClaw Session。
PRE-API-002 Backend URL 来自现有 Auth Endpoint SOT。
```

### Authoritative State

```text
SOT: NodeDeskClaw Bootstrap response
Observed: HTTP status / schema validity
Derived: local runtime provider state
```

### Allowed Side Effects

```text
ALLOW: Main memory state
ALLOW: sanitized observability event
```

### Forbidden Side Effects

```text
DENY: file write
DENY: Renderer secret exposure
DENY: NEW-API call
```

### Idempotency

```text
相同 Session + 相同 Backend state 重复 fetch MUST 不产生配置 mutation。
```

### Failure Semantics

```text
F-API-001
trigger: HTTP 401 after single refresh retry
expected state: ERROR 或 STALE_ACTIVE
error code: RUNTIME_BOOTSTRAP_UNAUTHORIZED
rollback: none
retryable: YES after re-auth

F-API-002
trigger: timeout/network
expected state:
  prior ACTIVE -> STALE_ACTIVE
  no prior ACTIVE -> ERROR
error code: RUNTIME_BOOTSTRAP_UNAVAILABLE
rollback: 0 mutation
retryable: YES

F-API-003
trigger: HTTP 200 but invalid schema
expected state: ERROR 或 STALE_ACTIVE
error code: RUNTIME_BOOTSTRAP_SCHEMA_INVALID
rollback: 0 mutation
retryable: NO until contract corrected
```

### Invariants

```text
INV-API-001 Bootstrap failure before apply MUST cause 0 provider/model file mutation.
INV-API-002 NOT_READY response MUST NOT be treated as transport failure.
```

### Acceptance

```text
A-API-001
A-API-002
A-API-003
```

---

## REQ-SEC-001 — Managed Runtime Secret Store

### Goal

保证 Member API Key 仅存在于 Electron Main memory 与目标 Hermes process environment。

### Normative Requirement

```text
MUST 新增 ManagedRuntimeSecretStore。
MUST 按 profile + authenticated identity epoch 隔离。
MUST 保存 api_key、revision、keyEnv 的运行态映射。
MUST NOT 写入任何持久文件。
MUST NOT 写入 process.env 全局对象。
MUST NOT 通过 IPC 返回 secret。
MUST NOT 记录 secret、prefix、length、fingerprint。
MUST 在 logout / explicit NOT_READY / identity switch 清空对应 secret。
```

### Reserved Env Rule

`NODESKCLAW_RUNTIME_MODEL_API_KEY` 为受管保留 key。

Hermes child env 构建时：

```text
若 ManagedRuntimeSecretStore READY：
  child env[reserved key] MUST = managed secret

若无 ManagedRuntimeSecretStore READY：
  child env MUST NOT 包含 reserved key，
  即使 process.env / .env / command provider 中存在同名值。
```

### Ownership Scope

```text
OBJECT: Main-process memory store only
```

### Failure Semantics

```text
F-SEC-001
trigger: attempt to serialize/persist managed secret
expected state: operation rejected
error code: MANAGED_SECRET_PERSISTENCE_FORBIDDEN
rollback: 0 persistent mutation
retryable: NO
```

### Invariants

```text
INV-SEC-001 Secret persistent occurrence count MUST = 0。
INV-SEC-002 Renderer secret occurrence count MUST = 0。
INV-SEC-003 Non-Hermes child process MUST NOT receive reserved key through this feature。
```

### Acceptance

```text
A-SEC-001
A-SEC-002
A-SEC-003
```

---

## REQ-PROJ-001 — Managed Hermes Provider Projection

### Goal

把 Backend NEW-API endpoint 映射为固定 Hermes named provider。

### Normative Requirement

READY 时 MUST 形成：

```yaml
providers:
  nodeskclaw:
    name: "SMC Enterprise Model"
    base_url: "<Bootstrap.base_url>"
    key_env: "NODESKCLAW_RUNTIME_MODEL_API_KEY"
    api_mode: "chat_completions"
```

Rules：

```text
MUST 复用 named provider 语义。
MUST 固定 providerKey=nodeskclaw。
MUST 固定 providerRef=named:nodeskclaw。
MUST 按 RPB-D-02 写入无 secret 的 Registry 记录。
MUST NOT 把 api_key 写入 YAML 或 providers.json。
MUST NOT 创建 custom_providers 条目。
MUST NOT 调用 saveNamedProvider(secret=...) 保存 managed secret。
MUST 只管理 providers.nodeskclaw 的 name/base_url/key_env/api_mode 字段。
MUST 保留其它 provider entries。
MUST 保留 nodeskclaw entry 中非受管未知字段，除非其导致 routing semantic conflict。
```

### Drift

若受管字段与 Bootstrap 不一致：

```text
behavior = FORCE_RECONCILE_MANAGED_FIELDS
```

若 providerKey `nodeskclaw` 被另一条 Desktop Provider Registry record 占用，或 reserved keyEnv 被另一 Provider 使用：

```text
behavior = BLOCK
error = MANAGED_PROVIDER_IDENTITY_CONFLICT
mutation = 0
```

### Acceptance

```text
A-PROJ-001
A-PROJ-002
A-PROJ-003
```

---

## REQ-DATA-001 — Managed Model Reconcile

### Goal

使本地 NodeDeskClaw managed model 集合与 Backend `models[]` 精确一致。

### Normative Requirement

Managed row identity：

```text
providerRef == "named:nodeskclaw"
```

目标集合：

```text
DesiredModelIds = unique(Bootstrap.models[].id)
```

Reconcile：

```text
ADD desired but missing
UPDATE desired and existing managed row metadata
REMOVE managed rows not in desired
PRESERVE all non-managed rows
```

每个 managed row MUST 至少包含：

```text
name          = display_name || id
provider      = nodeskclaw
model         = id
baseUrl       = Bootstrap.base_url
providerLabel = SMC Enterprise Model
providerRef   = named:nodeskclaw
```

v1.0 MUST NOT：

```text
把 context_window/max_output_tokens/capabilities/settings
写入全局 model-definitions.json 作为新的 authority。
```

原因：

```text
model-definitions.json 按 model id 全局共享；
对 managed provider 的 metadata 写入可能改变同 model id 的其它 provider 行。
```

### Default Model

```text
MUST 验证 default_model ∈ DesiredModelIds。
MUST 按 RPB-D-06 投影活动模型：
  provider = nodeskclaw
  model = Bootstrap.default_model
身份 base_url 只写在 providers.nodeskclaw.base_url。
会话覆盖按 RPB-D-08 改写。
本地默认恢复记录按 RPB-D-12 刷新。
```

Backend 若返回 READY 但 default_model 不在 models[]：

```text
MUST reject contract
error = RUNTIME_BOOTSTRAP_SCHEMA_INVALID
mutation = 0
```

### Idempotency

同一 desired set 再次 reconcile：

```text
models.json semantic diff MUST = 0
```

### Acceptance

```text
A-DATA-001
A-DATA-002
A-DATA-003
```

---

## REQ-UI-001 — Chat ModelPicker Managed Model Visibility

### Goal

让用户只能在当前 Bootstrap 允许模型集合中选择 NodeDeskClaw managed models，同时保留现有本地模型数据但不允许在企业 runtime gate 未满足时绕过。

### Normative Requirement

`listModels(profile)` MUST 返回完整 catalog。
Chat ModelPicker MUST 按 RPB-D-01、RPB-D-03、RPB-D-07、RPB-D-11 过滤。
MUST NOT 扩展 `listConfiguredAgentModels` 作为本地 Picker 来源。

可选受管行的运行身份：

```text
providerRef = named:nodeskclaw
provider = nodeskclaw
baseUrl = Bootstrap projected base_url
```

Runtime Provider Resolver MUST 最终解析为：

```text
hermesProvider = nodeskclaw
strategy = named-config
```

当 connection mode=local，且存在 authenticated NodeDeskClaw session，且 runtime state 不是 ACTIVE 或 STALE_ACTIVE：

```text
Chat send MUST be blocked。错误码见 RPB-D-17。
MUST NOT 自动 fallback hermesone。
MUST NOT 自动 fallback其它 local provider。
```

登录且 connection mode=local 时，设置写入按 RPB-D-16 拒绝。

### Acceptance

```text
A-UI-001
A-UI-002
A-UI-003
A-UI-004
A-UI-005
```

---

## REQ-STATE-001 — Runtime Provider Orchestrator

### Goal

把 Auth、Bootstrap、Projection、Secret、Hermes lifecycle 串成单一编排入口。

### Normative Requirement

MUST 新增 Main-process `RuntimeProviderOrchestrator`，至少暴露：

```text
bootstrap(reason, profile)
refresh(reason, profile)
clear(reason, profile)
getPublicState(profile)
```

调用者 MUST NOT 独立执行：

```text
fetch bootstrap
write provider
write managed models
install managed secret
restart Hermes
```

而绕过 Orchestrator。

同一 profile 的重叠操作按 RPB-D-15。目标 profile 按 RPB-D-05。connection mode 按 RPB-D-11 与 RPB-D-13。

### Apply Order

READY/new revision：

```text
1. validate Bootstrap contract
2. snapshot managed file scope T0
3. validate provider/key conflicts
4. stage desired provider/model/default projection
5. commit provider/model/default projection
6. install managed secret in memory
7. restart Hermes Gateway with managed secret
8. probe Gateway
9. verify runtime/provider/model projection
10. set ACTIVE(revision)
11. emit sanitized evidence
```

Secret install MUST occur after file projection commit、before Gateway restart。

### Same Revision No-op

只有同时满足：

```text
state == ACTIVE
current in-memory secret exists
current revision == Bootstrap.revision
in-memory secret == Bootstrap.api_key
provider projection semantic check == PASS
managed model set == desired set
active model.provider == nodeskclaw
active model.default == Bootstrap.default_model
```

才允许：

```text
NO file mutation
NO Gateway restart
state remains ACTIVE
```

revision 相同但 api_key 不同时按 RPB-D-14。否则同 revision 仍 MUST repair projection/runtime。

### Acceptance

```text
A-STATE-001
A-STATE-002
A-STATE-003
```

---

## REQ-AUTH-001 — Login / Restore / Refresh / Logout Integration

### Goal

使 runtime credential 生命周期严格绑定 NodeDeskClaw 身份生命周期。

### Login

现有：

```text
login
→ writeStoredSession
→ restoreExpertSubsystemAfterAuth
```

目标 MUST 为：

```text
login
→ writeStoredSession
→ connection mode=local 时 RuntimeProviderOrchestrator.bootstrap("login")
→ connection mode 不是 local 时跳过 bootstrap，不投影、不注入密钥
→ restoreExpertSubsystemAfterAuth
```

Bootstrap NOT_READY / ERROR：

```text
MUST NOT 撤销已经成功的 Portal Login。
MUST 将模型 runtime 标记为不可用。
```

### Session Restore

App 启动恢复 Auth Session 后：

```text
connection mode=local 时 MUST fresh bootstrap。
connection mode 不是 local 时 MUST 跳过 bootstrap。
MUST NOT 从磁盘恢复 Member API Key。
```

### Auth Refresh

普通 JWT token refresh：

```text
MUST NOT 无条件 restart Hermes。
```

只有显式触发 runtime refresh 且 revision/projection 变化时才允许 apply。

### Logout

Logout MUST 执行：

```text
1. mark runtime CLEARING; Chat blocked
2. clear ManagedRuntimeSecretStore
3. purge old Gateway credential
4. verify old managed runtime no longer usable
5. dispose Expert / SkillRun / file temp as existing behavior
6. clear NodeDeskClaw stored session
7. 若活动模型仍是 nodeskclaw，按 RPB-D-09 恢复 adoption 记录
8. state = UNBOUND
```

远端 NodeDeskClaw logout API 失败：

```text
MUST NOT 阻止本地 identity/runtime purge。
```

### Acceptance

```text
A-AUTH-001
A-AUTH-002
A-AUTH-003
A-AUTH-004
A-AUTH-005
```

---

## REQ-RUNTIME-001 — Hermes-only Secret Injection

### Goal

让 managed secret 只注入 Hermes CLI/Gateway 创建链。

### Normative Requirement

MUST 修改：

```text
runtime/hermes-cli-runner.ts -> buildHermesCliEnv()
hermes.ts -> tuiGatewayEnv()
以及其它实际 Gateway spawn env build path（若存在）
```

统一 precedence：

```text
1. base process env
2. profile .env
3. configured secrets provider
4. Managed Runtime Overlay（reserved key only, highest priority）
```

但 reserved key 特例：

```text
当无 ACTIVE managed secret 时，
必须先从 1/2/3 中删除 NODESKCLAW_RUNTIME_MODEL_API_KEY。
```

MUST 提供单一函数，例如：

```text
applyManagedRuntimeSecretOverlay(env, profile)
```

所有 Hermes launch paths MUST 复用该函数。

### Non-Hermes Child

其它 child process：

```text
MUST NOT 调用 managed overlay。
```

### Acceptance

```text
A-RUNTIME-001
A-RUNTIME-002
A-RUNTIME-003
```

---

## REQ-RUNTIME-002 — Gateway Apply / Purge

### Goal

保证 Gateway 进程使用当前身份的 secret，并在撤销/登出后不保留旧 secret。

### Apply

READY apply 后：

```text
MUST 使用现有 RuntimeManager.restart(profile) 或等价 Native Hermes lifecycle path。
MUST 等待 health + auth probe。
MUST 在 probe 成功后才进入 ACTIVE。
```

当前 enterprise observed owner 为 `opsi/salt` 时：

```text
MUST 使用现有 effectiveControlOwner 语义；
opsi/salt observed → direct effective；
不得因为 observed=opsi/salt 跳过本地 Gateway refresh。
```

### Purge

Backend explicit NOT_READY、logout、identity switch：

```text
MUST 先从 Main memory 移除 managed secret；
MUST restart Gateway，使新进程无法获得 reserved key；
MUST verify Gateway 已重启且 Chat gate 已关闭/状态非 ACTIVE。
```

若 restart 失败：

```text
MUST 进入 RUNTIME_SECRET_PURGE_UNVERIFIED。
MUST 保持 Chat blocked。
MUST NOT 声明 runtime purge success。
MUST 尝试既有 Hermes lifecycle 能力进行一次 containment stop/recovery；
若当前 Runtime Adapter 不支持 stop，Plan MUST 明确新增最小 stop/containment 能力，
但 MUST NOT 改变“普通 Work exit 不杀 Gateway”的既有语义。
```

Purge failure 不得把旧 secret 重新写回 Main memory。

### Acceptance

```text
A-RUNTIME-004
A-RUNTIME-005
A-RUNTIME-006
```

---

## REQ-CHECK-001 — Revision / Refresh Semantics

### Goal

以 Backend revision 控制 apply，而不是每次 Auth 事件都重启 Hermes。

### Normative Requirement

```text
MUST 直接使用 Backend revision。
MUST NOT 在 Desktop 重新计算 revision。
MUST NOT 根据 api_key 明文生成日志 fingerprint。
```

Triggers：

```text
TRIGGER-001 login success，且 connection mode=local
TRIGGER-002 restored authenticated session，且 connection mode=local
TRIGGER-003 explicit runtime refresh IPC/action，且 connection mode=local
TRIGGER-004 profile switch when profile is a supported managed target，且 connection mode=local
TRIGGER-005 auth endpoint/session identity changes，且 connection mode=local
TRIGGER-006 authenticated session and connection mode changes to local
```

v1.0 MUST NOT 增加：

```text
background timer polling
```

### Failure Preservation

若当前 state 为 ACTIVE，refresh 遇到 transport failure：

```text
MUST preserve current in-memory secret
MUST preserve current Gateway
MUST perform 0 projection mutation
MUST transition STALE_ACTIVE
MUST allow existing Direct NEW-API data plane to continue
```

若 refresh 收到 Backend explicit NOT_READY：

```text
MUST NOT preserve active credential
MUST enter CLEARING
```

### Acceptance

```text
A-CHECK-001
A-CHECK-002
A-CHECK-003
```

---

## REQ-MIGRATE-001 — Legacy Provider Isolation

### Goal

避免现有 hermesone / Custom Provider 路径破坏企业控制面。

### Normative Requirement

```text
MUST 保留现有 hermesone 能力作为独立 legacy/development capability。
MUST NOT 把 hermesone 作为 nodeskclaw runtime 的 fallback。
MUST NOT 自动复制 HERMESONE_API_KEY 到 managed key。
MUST NOT 读取普通 Custom Provider secret 代替 MemberToken。
MUST NOT 删除用户已有 provider/model 数据。
```

如果本地已经存在：

```text
providers.nodeskclaw
```

则：

- 若其受管字段可被安全识别：MUST reconcile；
- 若其 Provider Registry ownership 属于普通用户 Provider：MUST BLOCK `MANAGED_PROVIDER_IDENTITY_CONFLICT`；
- MUST NOT silent takeover。

### Acceptance

```text
A-MIGRATE-001
A-MIGRATE-002
```

---

## REQ-EVID-001 — Golden Consumer / Architecture Proof

### Goal

证明 NodeDeskClaw 只在 Control Plane，Chat 实际数据面为 Hermes → NEW-API。

### Normative Requirement

Golden test MUST 完成：

```text
1. 用户登录 NodeDeskClaw
2. Bootstrap READY
3. provider projection = nodeskclaw
4. model/default projection 与 Backend 一致
5. Hermes Gateway restart/probe PASS
6. 发起 Chat
7. NEW-API 确认收到 Member Key 对应请求
8. Chat 期间 NodeDeskClaw 无 inference proxy request
9. 在已 ACTIVE 后阻断 NodeDeskClaw Backend，但保持 NEW-API 可达
10. 再发起 Chat
11. Chat 仍通过 Hermes → NEW-API 成功
```

MUST 记录：

```text
smc-copilot commit
nodeskclaw commit
Hermes version/runtime identity
Bootstrap revision
providerRef（非 secret）
default_model
Gateway endpoint
NEW-API request evidence（脱敏）
NodeDeskClaw inference count = 0 的证据
```

### Acceptance

```text
A-EVID-001
A-EVID-002
```

---

# 10. Side-Effect Contract

| Operation | NodeDeskClaw Network | NEW-API Network | File Write | Memory Secret | Gateway Restart | Renderer Secret |
|---|---:|---:|---:|---:|---:|---:|
| bootstrap fetch | YES | NO | NO | NO until validated | NO | NO |
| READY apply | NO additional | NO | YES managed scope | YES | YES | NO |
| same-revision no-op | NO additional | NO | NO | keep | NO | NO |
| refresh transport fail ACTIVE | attempted | NO | NO | keep | NO | NO |
| Backend NOT_READY | YES | NO | retain managed projection | CLEAR | YES | NO |
| logout | MAY logout API | NO | restore adoption snapshot; retain managed projection | CLEAR | YES | NO |
| same revision, different api_key | NO additional | NO | NO | replace | YES | NO |
| ModelPicker read | NO | NO | NO | NO | NO | NO |
| Chat | NO | YES through Hermes | existing session effects | read by Hermes only | NO | NO |

Allowed file mutation scope：

```text
<profile>/config.yaml:
  providers.nodeskclaw managed fields
  model.provider
  model.default

<profile>/models.json:
  rows where providerRef == named:nodeskclaw

<profile>/providers.json:
  the nodeskclaw record fields except secret

<profileHome>/runtime-provider-adoption.json:
  provider
  model

<profile>/state.db:
  session model overrides rewritten by RPB-D-08
```

Forbidden file mutation scope：

```text
<profile>/.env
custom_providers managed-secret entry
unrelated providers
unrelated models
work-settings.json secret field
auth session payload with model api_key
```

---

# 11. Ownership Contract

## 11.1 Ownership Types

| Resource | Ownership |
|---|---|
| Backend Bootstrap Contract | EXTERNAL_AUTHORITY |
| `providers.nodeskclaw.name` | FIELD / MANAGED |
| `providers.nodeskclaw.base_url` | FIELD / MANAGED |
| `providers.nodeskclaw.key_env` | FIELD / MANAGED |
| `providers.nodeskclaw.api_mode` | FIELD / MANAGED |
| unknown fields under same provider entry | USER_OWNED/PRESERVE |
| managed model rows | ROW / MANAGED |
| non-managed model rows | USER_OWNED/PRESERVE |
| `.env` | USER_OWNED for this feature |
| ManagedRuntimeSecretStore | GENERATED_ONLY / MEMORY |
| NodeDeskClaw auth token store | existing Auth owner |

## 11.2 Drift Rule

```text
managed field drift:
  FORCE_RECONCILE

managed row drift:
  FORCE_RECONCILE

unknown field drift:
  PRESERVE

non-managed resource:
  PRESERVE

identity collision:
  BLOCK
```

## 11.3 Removal

Backend NOT_READY / logout：

```text
MUST clear memory secret.
MUST remove managed models from the selectable Chat picker.
MUST retain providers.nodeskclaw, the secret-free registry record, and managed model rows.
保留投影不得表示 runtime readiness。
logout 进入 UNBOUND 时按 RPB-D-09 恢复活动模型。
显式 NOT_READY 且会话仍在时不恢复活动模型。
MUST NOT remove unrelated provider/model state.
```

---

# 12. Identity / Hash Contract

## 12.1 Backend Revision

Desktop MUST treat `revision` as opaque identity：

```text
Algorithm: Backend-owned
Desktop hash: NONE
Desktop normalization: NONE
Desktop recomputation: FORBIDDEN
```

Comparison：

```text
exact UTF-8 string equality
```

## 12.2 Managed Model Identity

```text
providerRef UTF-8 exact "named:nodeskclaw"
+
model id UTF-8 exact Backend models[].id
```

No lowercasing of model id。

## 12.3 Provider Identity

```text
providerKey exact ASCII "nodeskclaw"
providerRef exact "named:nodeskclaw"
keyEnv exact "NODESKCLAW_RUNTIME_MODEL_API_KEY"
```

---

# 13. Transaction Contract

## 13.1 READY Apply Transaction

T0：

```text
T0.providerManagedFields
T0.managedModelRows
T0.activeModelConfig
T0.runtimeMemoryState
T0.gatewayObservedState
```

TXN includes：

```text
provider managed-field projection
managed model reconcile
default model projection
managed secret install
Gateway restart + probe
runtime state commit
```

TXN excludes：

```text
NodeDeskClaw Backend mutation
NEW-API mutation
ordinary user provider mutation
ordinary user model mutation
```

## 13.2 Commit Order

```text
validate
→ snapshot T0
→ conflict check
→ file projection
→ projection semantic verify
→ memory secret install
→ Gateway restart
→ Gateway probe
→ runtime verification
→ ACTIVE
→ evidence
```

## 13.3 Failure Atomicity

### File projection failure before secret install

```text
MUST restore managed file scope to T0.
MUST leave old ACTIVE runtime untouched if it existed and no Gateway restart occurred.
```

### Secret installed but Gateway restart fails

```text
MUST NOT claim ACTIVE(new revision).
MUST clear newly installed secret or restore previous ACTIVE secret only if previous revision was still running and rollback can be proven.
MUST restore managed file scope to T0.
MUST emit RUNTIME_APPLY_FAILED.
```

若无法证明 Gateway 与 previous revision 一致：

```text
MUST state = ERROR
MUST Chat blocked
```

## 13.4 Rollback Failure

```text
error = RUNTIME_PROVIDER_ROLLBACK_FAILED
recovery artifact = sanitized managed-state snapshot metadata
secret in recovery artifact = FORBIDDEN
manual recovery = re-login / explicit bootstrap repair after file backup
backup retention = retain until successful repair or manual removal
```

---

# 14. Failure Contract

| Error Code | Trigger | State | Mutation | Retry |
|---|---|---|---|---|
| RUNTIME_BOOTSTRAP_UNAUTHORIZED | auth retry exhausted | ERROR | 0 | re-auth |
| RUNTIME_BOOTSTRAP_UNAVAILABLE | network/timeout | ERROR or STALE_ACTIVE | 0 | YES |
| RUNTIME_BOOTSTRAP_SCHEMA_INVALID | contract invalid | ERROR or STALE_ACTIVE | 0 | after fix |
| MANAGED_PROVIDER_IDENTITY_CONFLICT | reserved identity collision | ERROR | 0 | manual |
| MANAGED_SECRET_PERSISTENCE_FORBIDDEN | persistence attempt | ERROR | 0 | NO |
| RUNTIME_PROVIDER_PROJECTION_FAILED | YAML/model projection fail | ERROR | rollback | repair |
| RUNTIME_MODEL_RECONCILE_FAILED | model reconcile fail | ERROR | rollback | repair |
| RUNTIME_GATEWAY_RESTART_FAILED | restart fail | ERROR | rollback/contain | YES |
| RUNTIME_SECRET_PURGE_UNVERIFIED | logout/revoke purge cannot verify | CLEARING/ERROR | secret memory cleared | manual/retry |
| RUNTIME_PROVIDER_ROLLBACK_FAILED | rollback fail | ERROR | recovery artifact | manual |
| RUNTIME_NOT_READY | Backend MODEL_* or local gate not ACTIVE/STALE_ACTIVE | NOT_READY or FETCHING/APPLYING/CLEARING | clear active secret only for explicit NOT_READY | after Backend READY |
| RUNTIME_PROVIDER_SETTINGS_LOCKED | user settings write while authenticated and local | unchanged | 0 | after UNBOUND or non-local |

---

# 15. Conflict Contract

| Conflict | Detection | Default Behavior | Error | Mutation |
|---|---|---|---|---:|
| providerKey `nodeskclaw` owned by ordinary local provider | registry ownership check | BLOCK | MANAGED_PROVIDER_IDENTITY_CONFLICT | 0 |
| reserved keyEnv used by other provider | registry/YAML check | BLOCK | MANAGED_PROVIDER_IDENTITY_CONFLICT | 0 |
| managed base_url drift | semantic projection check | FORCE managed fields | none if success | managed only |
| managed model stale rows | providerRef query | REMOVE managed stale row | none | managed only |
| duplicate Backend model id | schema validation | BLOCK | RUNTIME_BOOTSTRAP_SCHEMA_INVALID | 0 |
| default_model not in models | schema validation | BLOCK | RUNTIME_BOOTSTRAP_SCHEMA_INVALID | 0 |
| user non-managed model same id | providerRef differs | PRESERVE | none | 0 on user row |
| local `.env` contains reserved key | env overlay guard | IGNORE/STRIP for Hermes child when no ACTIVE secret | none | file 0 |
| hermesone configured | providerRef differs | PRESERVE, NEVER fallback | none | 0 |

`last writer wins` MUST NOT 用于任何 managed identity conflict。

---

# 16. Compatibility / Migration

## 16.1 Existing State

必须兼容：

```text
Provider Identity v2
legacy custom_providers
hermesone
per-profile models.json
existing session model providerRef migration
Native Hermes Runtime
observed OPSI/Salt → effective direct lifecycle
```

## 16.2 Migration Rule

v1.0 不执行广义数据迁移。

仅执行 managed adoption：

```text
detect exact providers.nodeskclaw
→ prove no ordinary registry owner conflict
→ adopt managed fields
→ reconcile
```

无法证明 ownership：

```text
PRESERVE
REPORT
BLOCK
MUST NOT DELETE
```

## 16.3 Legacy Secret

若 `.env` 已存在：

```text
NODESKCLAW_RUNTIME_MODEL_API_KEY=<...>
```

v1.0：

```text
MUST NOT 自动读取为有效 managed secret。
MUST NOT 自动删除该行。
MUST 在 health/security check 报 MANAGED_SECRET_LEGACY_PERSISTED。
Hermes managed overlay MUST ignore it。
```

---

# 17. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| Member Key 写磁盘 | memory-only store + persistence deny | A-SEC-001 |
| Renderer 读取 Member Key | Main-only contract + public state redaction | A-SEC-002 |
| process.env 全局污染 | 禁止写 process.env；Hermes-only overlay | A-SEC-003 |
| Logout 后旧 Gateway 继续持有 Key | purge + restart + verify | A-RUNTIME-005 |
| Backend NOT_READY 仍沿用旧 Key | explicit NOT_READY 必须 clear/purge | A-CHECK-003 |
| Control Plane outage 误撤销已 active runtime | STALE_ACTIVE | A-CHECK-002 |
| hermesone fallback 绕过企业控制 | no-fallback invariant | A-UI-003 |
| Provider identity collision | reserved identity BLOCK | A-PROJ-003 |
| Secret 出现在日志 | sanitizer + no secret derived metadata | A-SEC-002 |
| 跨 Backend origin 请求 | AuthorizedBackendTransport same-origin | A-API-001 |
| 不可信 base_url | only Backend READY contract；URL schema validate http/https | A-API-003 |

额外要求：

```text
MUST NOT log:
  api_key
  Authorization
  secret length
  secret prefix
  secret fingerprint

MAY log:
  revision
  provider
  state
  model ids
  sanitized base_url origin
```

---

# 18. Observability

每次 orchestrator operation MUST 记录：

```json
{
  "event": "runtime_provider_operation",
  "operation_id": "<uuid>",
  "reason": "login|restore|refresh|logout|not_ready|profile_switch",
  "stage": "FETCH|VALIDATE|PROJECT|SECRET|RESTART|CHECK|CLEAR",
  "status": "START|PASS|FAIL|NOOP",
  "profile": "default",
  "runtime_state": "ACTIVE",
  "backend_state": "READY",
  "revision": "<opaque-or-null>",
  "provider_ref": "named:nodeskclaw",
  "model_count": 3,
  "default_model": "model-id",
  "gateway_state": "ready",
  "error_code": null
}
```

日志 MUST NOT 包含 secret。

关键 stages：

```text
FETCH
VALIDATE
PROJECT_PROVIDER
RECONCILE_MODELS
APPLY_DEFAULT
INSTALL_SECRET
RESTART_GATEWAY
VERIFY_GATEWAY
CLEAR_SECRET
PURGE_GATEWAY
COMPLETE
```

---

# 19. Acceptance

## A-API-001 — Authorized Bootstrap Transport

### Requirement Refs

```text
REQ-API-001
```

### Given

有效 NodeDeskClaw session。

### When

调用 runtime bootstrap。

### Then

请求由现有 AuthorizedBackendTransport 发出，Bearer JWT 自动注入；Renderer 未得到 JWT/API Key。

### Oracle

```text
HTTP request path == /api/v1/runtime/model-bootstrap
request body exact consumer/runtime
renderer IPC payload contains api_key == false
```

### Evidence

```text
TEST-A-API-001
authorized transport mock test
IPC serialization test
```

---

## A-API-002 — Bootstrap Transport Failure 0 Mutation

Given：无 prior ACTIVE。  
When：Bootstrap timeout。  
Then：state=ERROR；Provider/model files 0 mutation。

Oracle：

```text
pre managed digest == post managed digest
state.errorCode == RUNTIME_BOOTSTRAP_UNAVAILABLE
```

---

## A-API-003 — Invalid Contract Block

Given：READY=true 但缺少 api_key 或 default_model 不在 models。  
When：parse。  
Then：reject。

Oracle：

```text
errorCode == RUNTIME_BOOTSTRAP_SCHEMA_INVALID
file bytes changed == 0
gateway restart count == 0
```

---

## A-SEC-001 — Secret Persistent Occurrence Zero

Given：READY Bootstrap 成功。  
When：apply + Chat。  
Then：扫描允许检查的 Desktop persistent managed files。

Oracle：

```text
api_key exact value occurrence:
  .env == 0
  config.yaml == 0
  providers.json == 0
  models.json == 0
  work-settings.json == 0
  sqlite/session files == 0
```

---

## A-SEC-002 — Renderer / Log Secret Zero

Oracle：

```text
renderer messages exact secret occurrence == 0
captured main log exact secret occurrence == 0
captured error stack exact secret occurrence == 0
```

---

## A-SEC-003 — Hermes-only Injection

Given：ACTIVE。  
When：构建 Hermes child env 与普通 child env。  
Then：

```text
Hermes child reserved key == api_key
ordinary child reserved key absent
process.env reserved key unchanged/absent
```

---

## A-PROJ-001 — Named Provider Exact Projection

Oracle：

```text
providers.nodeskclaw.base_url == Bootstrap.base_url
providers.nodeskclaw.key_env == NODESKCLAW_RUNTIME_MODEL_API_KEY
providers.nodeskclaw.api_mode == chat_completions
yaml contains api_key == false
```

---

## A-PROJ-002 — Provider Drift Repair

Given：managed base_url 被改为 stale URL。  
When：fresh READY bootstrap。  
Then：只恢复受管字段。

Oracle：

```text
managed fields == desired
unrelated provider bytes/semantics preserved
unknown extra field under nodeskclaw preserved
```

---

## A-PROJ-003 — Identity Conflict BLOCK

Oracle：

```text
errorCode == MANAGED_PROVIDER_IDENTITY_CONFLICT
managed file diff == 0
gateway restart count == 0
```

---

## A-DATA-001 — Model Exact Reconcile

Oracle：

```text
set(local rows where providerRef=named:nodeskclaw model)
==
set(Bootstrap.models[].id)
```

---

## A-DATA-002 — Non-managed Model Preserve

Oracle：

```text
pre non-managed row digest == post non-managed row digest
```

---

## A-DATA-003 — Default Model Exact

Oracle：

```text
active provider == nodeskclaw
active model == Bootstrap.default_model
providers.nodeskclaw.base_url == Bootstrap.base_url
model.base_url is not the identity field
```

---

## A-UI-001 — Managed Models Visible

Oracle：

```text
ModelPicker managed ids == Bootstrap models ids
```

---

## A-UI-002 — Runtime Resolver Named Route

Oracle：

```text
providerRef == named:nodeskclaw
hermesProvider == nodeskclaw
strategy == named-config
```

---

## A-UI-003 — No Enterprise Fallback

Given：authenticated session + Backend `MODEL_CREDENTIAL_DISABLED`。  
When：Chat send。  
Then：blocked。

Oracle：

```text
errorCode == RUNTIME_NOT_READY
hermesone send count == 0
other provider send count == 0
connection mode == local
```

---

## A-UI-004 — Picker Visibility

Given：connection mode=local。  
When：runtime state 分别为 ACTIVE、STALE_ACTIVE、NOT_READY、UNBOUND。  
Then：按 RPB-D-07。`listModels` 返回的 catalog 行数保持完整。

---

## A-UI-005 — Settings Lock

Given：authenticated session 且 connection mode=local。  
When：用户写入 RPB-D-16 列出的设置。  
Then：

```text
errorCode == RUNTIME_PROVIDER_SETTINGS_LOCKED
mutation == 0
auxiliary task write is not rejected by this rule
orchestrator managed write is not rejected by this rule
```

---

## A-STATE-001 — Login Orchestration

Oracle：

```text
writeStoredSession completes before bootstrap
bootstrap completes before runtime state result
Portal auth remains authenticated when runtime NOT_READY
```

---

## A-STATE-002 — Same Revision No-op

Given：ACTIVE same revision + semantic projection一致。  
When：refresh。  
Then：

```text
file write count == 0
Gateway restart count == 0
state == ACTIVE
```

---

## A-STATE-003 — Same Revision Drift Repair

Given：ACTIVE same revision but provider projection drift。  
When：refresh。  
Then：repair + restart/verify as required。

Oracle：

```text
projection == desired
state == ACTIVE
```

---

## A-AUTH-001 — Session Restore Fresh Bootstrap

Oracle：

```text
persisted Member API Key reads == 0
bootstrap call count == 1
READY -> managed secret installed from fresh response
```

---

## A-AUTH-002 — Logout Purge

Oracle：

```text
ManagedRuntimeSecretStore entry == absent
Chat gate == blocked
Portal auth state == unauthenticated
post-purge Hermes launch env reserved key == absent
```

---

## A-AUTH-003 — Remote Logout Failure Does Not Preserve Local Credential

Oracle：

```text
remote logout HTTP failure
AND
local managed secret absent
AND
Chat blocked
```

---

## A-AUTH-004 — Identity Switch Cannot Reuse Previous Secret

Oracle：

```text
identity epoch changes
old secret exact value absent from new Hermes env
new ACTIVE requires fresh Bootstrap READY
```

---

## A-AUTH-005 — Logout Restores Pre-adoption Model

Given：adoption 文件记录了接入前的 provider 与 model，当前活动模型仍是 nodeskclaw。  
When：logout 进入 UNBOUND。  
Then：活动模型恢复为该记录。受管投影与无密钥 Registry 记录仍在。内存密钥已清除。

---

## A-RUNTIME-001 — CLI Env Managed Overlay

Oracle：

```text
buildHermesCliEnv(profile)[reserved] == current managed secret
```

---

## A-RUNTIME-002 — TUI/Gateway Env Managed Overlay

Oracle：

```text
tuiGatewayEnv(profile)[reserved] == current managed secret
```

---

## A-RUNTIME-003 — Stale Disk Reserved Key Ignored

Given：`.env` 有旧 reserved key，但 runtime state 非 ACTIVE。  
Then：

```text
Hermes child env reserved key absent
.env bytes unchanged
```

---

## A-RUNTIME-004 — READY Apply Restart

Oracle：

```text
Gateway restart count == 1
post restart probe.state == ready
runtime state == ACTIVE
```

---

## A-RUNTIME-005 — Explicit NOT_READY Purge

Oracle：

```text
Backend state == MODEL_CREDENTIAL_DISABLED
managed secret absent
Chat blocked
runtime state == NOT_READY
old revision not ACTIVE
```

---

## A-RUNTIME-006 — Purge Failure Never Reports Success

Oracle：

```text
restart/purge verification injected failure
state != ACTIVE
errorCode == RUNTIME_SECRET_PURGE_UNVERIFIED
Chat blocked
```

---

## A-CHECK-001 — Revision Change Apply

Oracle：

```text
R1 ACTIVE
refresh returns R2 != R1
post state revision == R2
Gateway restart count == 1
```

---

## A-CHECK-002 — ACTIVE + Control Plane Outage Continues Data Plane

Given：R1 ACTIVE，随后阻断 NodeDeskClaw Backend，但 NEW-API 可达。  
When：refresh 失败，然后 Chat。  
Then：

```text
state == STALE_ACTIVE
managed secret unchanged in memory
projection file diff == 0
Gateway restart count == 0
Chat via NEW-API succeeds
```

---

## A-CHECK-003 — Explicit Backend NOT_READY Beats STALE Preservation

Oracle：

```text
HTTP 200 ready=false
=> secret cleared
=> state NOT_READY
=> no Chat
```

---

## A-MIGRATE-001 — hermesone Isolation

Oracle：

```text
Backend NOT_READY
hermesone provider remains stored
but send count through hermesone == 0
```

---

## A-MIGRATE-002 — Existing User Provider Preserve

Oracle：

```text
all provider records except managed target digest unchanged
```

---

## A-EVID-001 — Direct NEW-API Data Plane

Oracle：

```text
Chat success == true
NEW-API request observed == true
NodeDeskClaw inference proxy request count == 0
```

---

## A-EVID-002 — Control Plane Disconnect Proof

Oracle：

```text
NodeDeskClaw Backend unreachable after ACTIVE
NEW-API reachable
second Chat success == true
route remains Local Hermes → NEW-API
```

---

# 20. Edge-case / Acceptance Input Matrix

| Case | Auth | Bootstrap | Prior Runtime | Projection | Expected |
|---|---|---|---|---|---|
| 1 | valid | READY R1 | none | none | APPLY → ACTIVE |
| 2 | valid | READY R1 | ACTIVE R1 | equal | NO-OP |
| 3 | valid | READY R1 | ACTIVE R1 | drift | repair → ACTIVE |
| 4 | valid | READY R2 | ACTIVE R1 | any | rotate/apply → ACTIVE R2 |
| 5 | valid | NOT_READY | none | stale files | NOT_READY, Chat blocked |
| 6 | valid | NOT_READY | ACTIVE | any | purge → NOT_READY |
| 7 | valid | timeout | none | any | ERROR, 0 mutation |
| 8 | valid | timeout | ACTIVE | any | STALE_ACTIVE |
| 9 | expired JWT | READY after refresh | none | none | ACTIVE |
| 10 | unauthorized after refresh | n/a | none | any | ERROR |
| 11 | READY invalid default | none | none | none | schema error, 0 mutation |
| 12 | duplicate models | READY invalid | none | none | schema error |
| 13 | provider identity collision | READY | none | conflict | BLOCK |
| 14 | stale reserved key in `.env` | READY | none | none | ignore disk key, use Backend key |
| 15 | stale reserved key in `.env` | NOT_READY | none | none | child env key absent |
| 16 | logout remote API fail | n/a | ACTIVE | any | local purge still executes |
| 17 | Gateway restart fail | READY R2 | ACTIVE R1 | changed | ERROR/rollback |
| 18 | purge verification fail | logout | ACTIVE | any | PURGE_UNVERIFIED, Chat blocked |
| 19 | hermesone exists | NOT_READY | none | any | no fallback |
| 20 | same model id in another provider | READY | none | user row exists | preserve user row + managed row |

---

# 21. Negative Acceptance

必须覆盖：

```text
NEG-001 api_key 出现在 .env → FAIL
NEG-002 api_key 出现在 Renderer IPC → FAIL
NEG-003 api_key 出现在 log → FAIL
NEG-004 Backend NOT_READY 后仍可 Chat → FAIL
NEG-005 NOT_READY 自动走 hermesone → FAIL
NEG-006 provider collision 被 silent takeover → FAIL
NEG-007 refresh timeout 删除当前 ACTIVE secret → FAIL
NEG-008 same revision 无 drift 却 restart Gateway → FAIL
NEG-009 logout 完成后旧 secret 仍进入新 Hermes child env → FAIL
NEG-010 managed reconcile 删除普通用户模型 → FAIL
NEG-011 NodeDeskClaw 出现在 LLM inference data plane → FAIL
```

---

# 22. Failure Injection

| Injection Point | Expected Postcondition |
|---|---|
| before Bootstrap request | no mutation |
| after HTTP before parse | no mutation |
| after parse before snapshot | no mutation |
| after provider write | rollback provider to T0 |
| after model write | rollback provider/model to T0 |
| after default model write | rollback managed file scope |
| after secret install before restart | clear/restore memory secret + rollback files |
| during Gateway restart | not ACTIVE(new revision) |
| after restart before probe PASS | ERROR until verified |
| refresh network failure from ACTIVE | STALE_ACTIVE, no mutation |
| logout after memory clear before restart | Chat blocked |
| purge restart failure | PURGE_UNVERIFIED |
| rollback failure | RUNTIME_PROVIDER_ROLLBACK_FAILED + recovery metadata retained |

所有 failure injection test MUST 证明确定 postcondition，不接受“无异常”作为 Oracle。

---

# 23. Evidence Contract

每个 Required Acceptance evidence 至少包含：

```json
{
  "acceptance_id": "A-STATE-002",
  "status": "PASS",
  "requirement_ids": ["REQ-STATE-001", "REQ-CHECK-001"],
  "test_ids": ["TEST-A-STATE-002"],
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v6.2.1",
  "commit": "<implementation SHA>",
  "command": "<exact test command>",
  "exit_code": 0,
  "oracle": {
    "type": "exact",
    "expected": "...",
    "actual": "..."
  },
  "evidence_files": [],
  "timestamp": "<ISO-8601>"
}
```

Secret Evidence Rule：

```text
Evidence MUST NOT 保存 api_key。
需要证明 secret equality 时 MUST 使用 in-test boolean assertion，
不得把 expected/actual secret 序列化到 artifact。
```

---

# 24. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Required Test | Evidence | Release Gate |
|---|---|---|---|---|---|
| REQ-API-001 | INV-API-001/002 | A-API-001/002/003 | TEST-A-API-* | EVID-A-API-* | REQUIRED |
| REQ-SEC-001 | INV-SEC-001/002/003 | A-SEC-001/002/003 | TEST-A-SEC-* | EVID-A-SEC-* | REQUIRED |
| REQ-PROJ-001 | managed identity | A-PROJ-001/002/003 | TEST-A-PROJ-* | EVID-A-PROJ-* | REQUIRED |
| REQ-DATA-001 | exact desired set | A-DATA-001/002/003 | TEST-A-DATA-* | EVID-A-DATA-* | REQUIRED |
| REQ-UI-001 | no fallback | A-UI-001/002/003/004/005 | TEST-A-UI-* | EVID-A-UI-* | REQUIRED |
| REQ-STATE-001 | state machine | A-STATE-001/002/003 | TEST-A-STATE-* | EVID-A-STATE-* | REQUIRED |
| REQ-AUTH-001 | identity-bound | A-AUTH-001/002/003/004/005 | TEST-A-AUTH-* | EVID-A-AUTH-* | REQUIRED |
| REQ-RUNTIME-001 | Hermes-only env | A-RUNTIME-001/002/003 | TEST-A-RUNTIME-* | EVID-A-RUNTIME-* | REQUIRED |
| REQ-RUNTIME-002 | purge verified | A-RUNTIME-004/005/006 | TEST-A-RUNTIME-* | EVID-A-RUNTIME-* | REQUIRED |
| REQ-CHECK-001 | backend revision | A-CHECK-001/002/003 | TEST-A-CHECK-* | EVID-A-CHECK-* | REQUIRED |
| REQ-MIGRATE-001 | legacy isolation | A-MIGRATE-001/002 | TEST-A-MIGRATE-* | EVID-A-MIGRATE-* | REQUIRED |
| REQ-EVID-001 | direct data plane | A-EVID-001/002 | TEST-A-EVID-* | EVID-A-EVID-* | REQUIRED |

任何 Requirement 的 Required Acceptance 不为 PASS：

```text
Release Gate != PASS
```

---

# 25. Release Gate

## 25.1 Required Gates

```text
GATE-01 Bootstrap Contract tests PASS
GATE-02 Secret persistence zero-occurrence PASS
GATE-03 Provider projection PASS
GATE-04 Model exact reconcile PASS
GATE-05 ModelPicker named route PASS
GATE-06 Login/restore lifecycle PASS
GATE-07 Logout/NOT_READY purge PASS
GATE-08 Revision no-op/rotate PASS
GATE-09 ACTIVE control-plane outage/data-plane continuity PASS
GATE-10 No fallback bypass PASS
GATE-11 Golden Consumer Direct NEW-API PASS
GATE-12 Evidence completeness PASS
```

规则：

```text
SKIPPED != PASS
BLOCKED != PASS

任一 Required Gate != PASS：
  Release Gate = FAIL
  verification process exit != 0
```

---

# 26. Plan Generation Gate

本 PRD 当前状态：

```text
APPROVED_FOR_PLAN
```

2026-09-27 检查记录：

```text
smc-copilot HEAD = 9a4e7618d576790e0201aa8b2a0ed4e6ec4e70e6
  与本文 baseline_commit 相同
nodeskclaw 7abb73e90e163f85257208ac4aa58e4914d2da6e
  公开提交存在，消息为成员模型凭证运行时引导
RPB-D-01～RPB-D-18 覆盖冲突旧句
登录、会话恢复与 §7.2 的 bootstrap 仅在 connection mode=local 时发生
人工批准：将状态标为 APPROVED_FOR_PLAN
```

本状态允许编写 .plan.md。计划本身在其评审通过前仍是 planned，不是 approved。
§26.1 的实施前核对留到编写计划时再勾。

只有人工完成 Architecture/Security/Runtime review 并明确批准后，才允许进入本状态。批准已经完成。

## 26.1 Plan 前必须再次验证

```text
[ ] smc-copilot implementation baseline SHA
[ ] nodeskclaw contract SHA
[ ] POST /runtime/model-bootstrap schema
[ ] effective control-owner semantics
[ ] Hermes gateway restart capability
[ ] managed model projection target files
[ ] ModelPicker current source semantics
[ ] no hidden .env write in proposed managed path
```

## 26.2 计划阶段禁止自行改变的决策

```text
providerKey = nodeskclaw
providerRef = named:nodeskclaw
keyEnv = NODESKCLAW_RUNTIME_MODEL_API_KEY
apiMode = chat_completions
secret = memory-only
NodeDeskClaw = Control Plane only
NOT_READY = no fallback
ACTIVE refresh network failure = STALE_ACTIVE
explicit NOT_READY = clear secret and purge, retain projection
revision = Backend-owned opaque string
RPB-D-01～RPB-D-18
```

任何计划若需要改变以上 Contract：

```text
MUST 回到 PRD review
MUST NOT 在 .plan.md 中自行修改
```

---

# 27. Definition of Done

本 PRD 进入 `VERIFIED` 必须满足：

```text
[ ] NodeDeskClaw Bootstrap Client 已复用 AuthorizedBackendTransport
[ ] READY / NOT_READY schema 已锁定
[ ] ManagedRuntimeSecretStore 为 memory-only
[ ] Secret 未写入任何 Desktop persistence
[ ] Secret 未暴露给 Renderer
[ ] Secret 未写日志
[ ] providers.nodeskclaw 精确投影
[ ] managed model exact reconcile
[ ] default_model 精确投影
[ ] ModelPicker 支持 named:nodeskclaw managed models
[ ] runtime resolver → hermesProvider=nodeskclaw
[ ] Login 后 bootstrap 生命周期闭合
[ ] Session Restore 必须 fresh bootstrap
[ ] Logout / explicit NOT_READY 清 secret 并 purge Gateway
[ ] Gateway purge failure 不会误报成功
[ ] same revision 无 drift 为 0 mutation / 0 restart
[ ] revision change 会 apply + restart + verify
[ ] ACTIVE 后 Control Plane outage 进入 STALE_ACTIVE，Chat 数据面可继续
[ ] Backend explicit NOT_READY 不保留旧 credential
[ ] hermesone 不作为企业 fallback
[ ] 普通用户 Provider/Model 未被误删
[ ] Golden Consumer 证明 Hermes → NEW-API direct
[ ] NodeDeskClaw inference proxy request count = 0
[ ] 所有 Required Acceptance 有 Test / Oracle / Evidence
[ ] 所有 Negative Acceptance PASS
[ ] 所有 failure injection 有确定 postcondition
[ ] Requirement Traceability 完整
[ ] 无 SPEC_SEMANTIC_GAP
```

---

# 28. 建议代码改造边界

> 本节定义预计触及面，Plan 可进一步拆 Todo，但 MUST NOT 扩展语义边界。

## 28.1 新增

```text
apps/work/src/main/runtime-provider/
  runtime-provider-contract.ts
  nodeskclaw-bootstrap-client.ts
  managed-runtime-secret-store.ts
  runtime-provider-projection.ts
  runtime-model-projection.ts
  runtime-provider-orchestrator.ts
  runtime-provider-errors.ts
  runtime-provider-observability.ts
```

对应测试：

```text
apps/work/src/main/runtime-provider/*.test.ts
```

## 28.2 修改

```text
apps/work/src/main/auth/auth-ipc.ts
  - login / logout runtime lifecycle integration

apps/work/src/main/runtime/hermes-cli-runner.ts
  - Hermes-only managed env overlay

apps/work/src/main/hermes.ts
  - tuiGatewayEnv / actual gateway child env overlay
  - Chat readiness gate integration if current send path requires

apps/work/src/main/agent-config-providers.ts
  - managed provider projection helper or existing helper reuse

apps/work/src/main/models.ts
  - managed row reconcile on the profile catalog
apps/work/src/main/providers-store.ts
  - secret-free nodeskclaw registry record
apps/work/src/renderer/src/screens/Chat/hooks/useModelConfig.ts
  - Chat picker filter; listModels stays the full catalog
apps/work/src/renderer/src/screens/Providers/Providers.tsx
  - settings lock while authenticated and local
  - auxiliary tasks stay writable

apps/work/src/main/provider-identity/runtime-provider-resolver.ts
  - only if current named route shape cannot carry managed picker identity

apps/work/src/main/runtime/runtime-manager.ts
apps/work/src/main/runtime/native-hermes-runtime-backend.ts
  - logout/revoke purge containment only if restart cannot provide verified purge

apps/work/src/main/ipc/register.ts
  - runtime public state / explicit refresh / Chat gate IPC wiring if required

apps/work/src/shared/
  - public runtime provider state contract（MUST exclude secret）
```

## 28.3 MUST NOT 作为主实现入口

```text
hermesone-provision.ts
provider-save-transaction.ts secret persistence path
legacy custom_providers secret path
Renderer localStorage
```

---

# 29. Public Runtime State Contract

Renderer MAY 获取一个**无 secret**公共状态：

```ts
type RuntimeProviderPublicState =
  | { state: "UNBOUND" }
  | { state: "FETCHING" }
  | {
      state: "NOT_READY";
      backendState: string;
      provider?: string;
    }
  | {
      state: "ACTIVE";
      revision: string;
      providerRef: "named:nodeskclaw";
      defaultModel: string;
      modelCount: number;
    }
  | {
      state: "STALE_ACTIVE";
      revision: string;
      providerRef: "named:nodeskclaw";
      defaultModel: string;
      modelCount: number;
      errorCode: "RUNTIME_BOOTSTRAP_UNAVAILABLE";
    }
  | {
      state: "ERROR";
      errorCode: string;
    }
  | {
      state: "CLEARING";
    };
```

MUST NOT 包含：

```text
api_key
Authorization
NodeDeskClaw accessToken
refreshToken
secret fingerprint
```

---

# 30. Golden Consumer Test Topology

```text
[Test User]
    │ login
    ▼
smc-copilot
    │ POST Bootstrap
    ▼
NodeDeskClaw Backend
    │ returns READY + Member Key
    ▼
smc-copilot Main
    │ projects + injects
    ▼
Local Hermes Gateway
    │ OpenAI-compatible /v1
    ▼
Enterprise NEW-API
    │
    ▼
LLM
```

第二阶段断链：

```text
NodeDeskClaw Backend = BLOCKED
NEW-API = AVAILABLE
Local Hermes = ACTIVE with existing in-memory session
```

预期：

```text
runtime refresh -> STALE_ACTIVE
Chat -> PASS
NodeDeskClaw inference traffic -> 0
```

此测试是本 PRD 的架构证明，不得由全 mock 测试替代。

---

# 31. PRD Quality Gate

## Architecture

```text
[x] Goal 唯一明确
[x] Scope / Non-goal 明确
[x] Control Plane / Data Plane 分离
[x] Owner 不重叠
```

## State

```text
[x] Backend readiness 为 authority
[x] Runtime state 单独定义
[x] ACTIVE / STALE_ACTIVE / NOT_READY 可区分
[x] Secret 无持久 SOT
```

## Semantics

```text
[x] provider key 固定
[x] key env 固定
[x] revision 语义固定
[x] no fallback 固定
[x] refresh failure 与 explicit NOT_READY 行为不同
```

## Side Effects

```text
[x] file mutation scope 明确
[x] .env secret write 明确禁止
[x] non-managed provider/model preserve
```

## Failure

```text
[x] transport failure 有状态
[x] apply failure 有 rollback
[x] purge failure 有 blocking state
[x] rollback failure 有 recovery contract
```

## Acceptance

```text
[x] 每个 MUST 归入 Requirement/Acceptance
[x] Security 有 Negative Acceptance
[x] High-risk flow 有 edge matrix
[x] Golden Consumer 有机器可判断 Oracle
```

## Plan Readiness

```text
[x] 文档无 TBD
[x] 核心架构语义已唯一
[x] 人工 Review 完成
[x] status = APPROVED_FOR_PLAN
```

因此当前文档状态为：

```text
APPROVED_FOR_PLAN
```
