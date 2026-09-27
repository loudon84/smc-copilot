---
title: "smc-copilot Provider Identity 与 Chat Routing 稳定化方案 PRD"
prd_id: "PRD-WORK-PROVIDER-ROUTING-STABILITY-001"
version: "1.1"
status: "APPROVED_FOR_PLAN"
product: "smc-copilot / apps/work"
repository: "https://github.com/loudon84/smc-copilot"
branch: "work/prd-v6.2"
baseline_commit: "027e73278eb44a2333224521ec5b44ca78c3ecde"
owner: "smc-copilot Architecture"
reviewers:
  - "Desktop Architecture"
  - "Hermes Runtime"
  - "Chat / Provider Module"
created_at: "2026-09-27"
updated_at: "2026-09-27"
target_release: "work/prd-v6.3"
change_type:
  - "BROWNFIELD_CHANGE"
  - "ARCHITECTURE_CHANGE"
  - "BUGFIX"
  - "MIGRATION"
  - "INTEGRATION"
golden_consumer: "smc-copilot/apps/work + Hermes Agent v0.21.0 + enterprise NEW-API OpenAI-compatible endpoint"
related_docs:
  - "需求PRD工程模板.md v1.0"
  - "P0-02 Provider Identity Split-Brain 源码分析"
  - "P0-03 Session Override / Gateway / Dashboard Provider Identity 流转分析"
supersedes: null
---

# 0. PRD 使用原则

本文是 **Engineering Contract PRD**，用于把当前 `Provider Settings → Model Catalog → Session Override → Gateway / Dashboard` 中的 Provider Identity 分裂问题收敛为可验证的工程契约。

本文使用以下规范关键词：

- `MUST`：必须实现、必须测试、必须有 Evidence。
- `MUST NOT`：违反即 Requirement FAIL。
- `SHOULD`：默认应满足；偏离必须记录原因。
- `SHOULD NOT`：原则上禁止；偏离必须记录明确理由。
- `MAY`：可选，不影响主 Release Gate。

No-Inference Rule：

```text
如果实现者无法从本文唯一确定：
- Provider Identity 的事实源；
- Session Model Override 的路由语义；
- Gateway / Dashboard Provider 选择语义；
- config.yaml / providers.json / models.json / .env 的写入所有权；
- 旧 custom/custom_providers 的兼容与迁移规则；
- 失败、回滚、冲突与验收判断；

则：
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT 自行选择一个“看起来合理”的实现
```

---

# 1. 文档元数据

```yaml
title: smc-copilot Provider Identity 与 Chat Routing 稳定化方案 PRD
prd_id: PRD-WORK-PROVIDER-ROUTING-STABILITY-001
version: 1.1
status: APPROVED_FOR_PLAN
product: smc-copilot/apps/work
repository: loudon84/smc-copilot
branch: work/prd-v6.2
baseline_commit: 027e73278eb44a2333224521ec5b44ca78c3ecde
hermes_agent_version: v0.21.0
hermes_agent_tag: v2026.8.31
hermes_agent_commit: 29112bef099274229cadff79cdff7bf7b99c4b77
target_release: work/prd-v6.3
golden_consumer:
  desktop: smc-copilot/apps/work
  runtime: Hermes Agent v0.21.0
  upstream: OpenAI-compatible enterprise NEW-API
```

---

# 2. 一句话目标

让 `smc-copilot/apps/work` 在 Hermes Agent v0.21.0 与企业 OpenAI-compatible Provider 并存的前提下，通过统一的 **Canonical Provider Identity + Runtime Provider Resolver**，实现 Provider 设置、ModelPicker、Session Override、Gateway `/v1` 与 Dashboard `/api/ws` 的一致路由，同时保证 Secret 不进入 Model/Session 状态、named custom provider 不再降级为 bare `custom`。

## 2.1 评审决定（Grilling，2026-09-27）

本节覆盖本文其余条款中与之冲突的句子。实现者遇到冲突时 MUST 以本节为准。

```text
D-01 本契约只约束 connection mode = local。
     remote / ssh 的发送、投影与 Gateway 重启 MUST NOT 纳入本契约，行为保持现状。

D-02 线上请求的 RuntimeProviderRoute.strategy 只允许 builtin 与 named-config。
     hermesProvider MUST NOT 为 bare custom，也 MUST NOT 为 custom:<name>。
     MUST NOT 在投影缺失、密钥缺失或 Hermes 不认 key 时自动 fallback。
     baseURL 匹配只允许发生在迁移模块内部，不得成为 Gateway/Dashboard 正常路径的身份来源。

D-03 keyEnv 生成顺序：
     1. 已有 config.yaml providers: 或 custom_providers: 的 key_env 原样保留；
     2. 否则 PROVIDER_<PROVIDERKEY>_API_KEY
        （providerKey 转大写，"." 与 "-" 变为 "_"）；
     3. 该 keyEnv 已被另一个 providerKey 占用 → PROVIDER_KEYENV_CONFLICT，0 mutation。
     keyEnv MAY 为空，表示该 Provider 不携带密钥，投影中不写 key_env。
     与无关的非 Provider 环境变量同名不构成冲突。

D-04 registry 与 providers:<providerKey> 的 endpoint/keyEnv/apiMode 不一致时默认 BLOCK，0 mutation，
     错误码 PROVIDER_PROJECTION_DRIFT。
     唯一对账动作是用户再次保存该 Provider：registry 覆盖该 Desktop-owned entry。
     v1.1 MUST NOT 提供「采用 YAML 回写 registry」。

D-05 运行时 apiMode 只来自 ProviderRecord。
     闭集：chat_completions | anthropic_messages。默认 chat_completions。
     不在闭集内，或 v2 model 行带了与 Provider 不一致的 apiMode → PROVIDER_API_MODE_INVALID，0 mutation。
     v2 model 行 MAY 省略 apiMode。

D-06 错误码分开，且均 0 次模型网络请求：
     投影缺失或不一致 → PROVIDER_PROJECTION_DRIFT
     keyEnv 非空但 .env 无值 → PROVIDER_SECRET_MISSING
     无法唯一解析 named/builtin provider → PROVIDER_ROUTE_UNRESOLVED
     legacy Session 无法唯一匹配 → SESSION_PROVIDER_UNRESOLVED
     无 Session override 时全局 model 无法唯一匹配 → ACTIVE_MODEL_PROVIDER_UNRESOLVED

D-07 唯一匹配的 legacy Session，同一次用户发送内完成迁移并发送。
     顺序见 D-09。成功请求的 strategy MUST 为 named-config。
     v1.1 不做候选 Provider 消歧 UI；用户必须在模型选择器重选带 ProviderRef 的模型。

D-08 无 Session override 时，对全局 config.yaml model: 做与 D-07 相同的懒迁移。
     仅允许改 model 段内 Desktop-owned 的 provider/model/base_url/api_mode。
     唯一匹配成功后 model.provider 写成 providerKey，并去掉作为身份的 model.base_url。

D-09 同一次 local 发送若需要补齐状态，顺序 MUST 为：
     唯一匹配
     → 若缺则补齐 Provider Registry 与 providers:<providerKey> 投影
     → 若本动作写入了投影或目标 keyEnv，重启本机 Work 管理的 Gateway
     → 再发 named-config
     任一步失败则后续不做，模型请求次数为 0。
     投影已 PROJECTED 且当前 Gateway 进程是在该投影重启成功之后启动的，跳过重启。
     重启失败：PROVIDER_RUNTIME_RELOAD_FAILED；不回滚已提交的 registry/投影；不得用旧进程发模型请求。

D-10 Golden Consumer 拆门禁：
     身份/迁移/事务/密钥，以及路由断言（ProviderRef、hermesProvider、bare-custom 次数为 0）必须 PASS 才可合入。
     上游 HTTP 401 = FAIL，不得合入。
     上游不可达或非 401 的上游错误 = BLOCKED：不得把已 PASS 的身份验收打成失败，也不得写成上游全量 PASS。
```

---

# 3. 背景与问题定义

## 3.1 Current State

当前系统存在以下事实：

1. Provider Settings 已经拥有新的 Provider Identity 存储：
   - `providers.json`：桌面端自定义 Provider Identity；
   - profile `.env`：API Key；
   - `config.yaml providers:`：Hermes named provider 投影。

2. Model 层仍使用旧的路由表示：
   - `provider = "custom"`；
   - `providerLabel = <provider name>`；
   - `baseUrl = <endpoint>`。

3. `models.json` 的 custom model 会继续同步为：
   - `config.yaml custom_providers:` legacy entry。

4. Chat ModelPicker 展示 `providerLabel`，但点击时仅向下传：
   - `provider`；
   - `model`；
   - `baseUrl`。

5. `SessionModelOverride` 当前 schema 仅包含：
   - `provider`；
   - `model`；
   - `baseUrl`。

6. 因此 named custom provider 在进入 Session Override 后，Provider Identity 被压平为：
   - `custom + baseUrl`。

7. Legacy Gateway `/v1/runs` / `/v1/chat/completions` 将 request-level：
   - `provider=custom`；
   - `base_url=<endpoint>`
   直接传给 Hermes。

8. Hermes Agent v0.21.0 对 bare `custom + explicit base_url` 的 credential resolution 不等价于 named custom provider；`model.key_env` 不保证参与该 direct-alias credential resolution，因此 secret-backed enterprise endpoint 可以出现 HTTP 401。

9. Dashboard `/api/ws` 为规避 `custom` Identity 丢失，已经通过：
   - `model.options`；
   - baseURL match；
   - model match；
   - current provider match
   反推 named provider slug。

10. 当前代码因此形成：
    - Legacy Gateway：不修复 Identity；
    - Dashboard：运行态 heuristic repair；
    - 两条 Chat data plane 行为不一致。

## 3.2 Problem

### P0-02 — Provider Identity Split-Brain

同一个 Provider 在不同层被表示为：

```text
Provider UI / Registry:
localhost

Model Catalog:
provider=custom
providerLabel=localhost
baseUrl=http://...

Session Override:
provider=custom
baseUrl=http://...

Gateway:
provider=custom

Dashboard:
custom → runtime heuristic → localhost/custom:localhost
```

系统无法保证任何一个 Model/Session 在所有 transport 下指向相同 Provider Identity。

### P0-02A — Named Provider Mirror Not Guaranteed

Provider Settings 的 desktop store 写成功，不等价于 `config.yaml providers:` 投影写成功。当前 mirror failure 可能被 best-effort catch 吞掉，UI 可以显示 Provider 已存在，但 Hermes runtime 不一定拥有对应 named provider。

### P0-02B — Profile Scope Alignment Risk

Provider/Model/Secret 配置必须严格绑定到相同 Hermes profile home。Root config、named profile config 与环境中的 `HERMES_PROFILE` 不得隐式交叉覆盖。

### P0-03A — Legacy Gateway Propagates Lossy Identity

Session Override 的 `provider=custom + baseUrl` 直接进入 Gateway request override，可能触发 Hermes bare-custom direct-alias 路径。

### P0-03B — Dashboard Uses Heuristic Recovery

Dashboard 在正常请求路径依赖 baseURL/model 反查 Provider slug。这是兼容修复，不应承担主路由职责。

## 3.3 Impact

```text
业务影响：
- 用户配置有效 API Key 后仍可能 401。
- 同一个 Session 在 Gateway / Dashboard 切换后可能路由到不同 Provider。
- 恢复旧 Session 时可能继续继承错误 bare custom 路由。

工程影响：
- Provider Identity 在多个 store 中重复表达。
- Runtime routing 依赖 baseURL 反推。
- Provider Settings、Models、Chat、Dashboard 各自包含补偿逻辑。
- 新增 NodeDeskClaw/企业 Provider 时会复制现有问题。

安全影响：
- 为绕过 401 将 api_key 写入 config.yaml 会形成 secret 双写和明文持久化风险。
- Provider/Secret 关联不稳定可能导致错误 credential 被发送到错误 endpoint。

运维影响：
- 配置已保存 ≠ Runtime 已生效。
- profile scope 不一致时难以定位实际生效配置。

AI Coding 影响：
- 当前状态没有唯一 SOT，Plan Agent 可产生多种“合理”但互不兼容的修改方案。
```

---

# 4. Scope

## 4.1 In Scope

```text
SCOPE-001 Canonical Provider Identity / ProviderRef
SCOPE-002 providers.json Provider Registry schema v2
SCOPE-003 models.json Model → ProviderRef 关系
SCOPE-004 SessionModelOverride v2
SCOPE-005 config.yaml providers: named-provider projection
SCOPE-006 Runtime Provider Resolver
SCOPE-007 Legacy Gateway /v1 provider routing
SCOPE-008 Dashboard /api/ws provider routing
SCOPE-009 legacy custom/custom_providers migration
SCOPE-010 profile-scoped config consistency
SCOPE-011 secret containment and key_env semantics
SCOPE-012 transaction / rollback / evidence / observability
SCOPE-013 old Session lazy migration
SCOPE-014 compatibility-only Dashboard identity recovery
```

## 4.2 Out of Scope

```text
NON-GOAL-001 MUST NOT 修改 Hermes Agent Core 源码。
NON-GOAL-002 MUST NOT 修改 NEW-API 的 token/auth 实现。
NON-GOAL-003 MUST NOT 在本 PRD 中实现 NodeDeskClaw Bootstrap。
NON-GOAL-004 MUST NOT 重构 Knowledge Chat 业务语义。
NON-GOAL-005 MUST NOT 合并 Gateway 与 Dashboard 为单一 transport。
NON-GOAL-006 MUST NOT 把 API Key 写入 models.json、providers.json、Session DB。
NON-GOAL-007 MUST NOT 以“升级 Hermes Agent”替代本 PRD 的 Provider Identity 修复。
NON-GOAL-008 MUST NOT 删除无法证明 ownership 的 legacy custom_providers entry。
NON-GOAL-009 MUST NOT 修改 remote / ssh Chat 的 Provider 路由、投影或 Gateway 重启行为。
NON-GOAL-010 MUST NOT 在 v1.1 提供 legacy Provider 消歧 UI，或「采用 YAML 回写 registry」。
```

## 4.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Provider Registry | Desktop Main | Provider metadata | ProviderRef / ProviderRecord | Secret value |
| Secret Store | profile `.env` | key_env/value | credential lookup | Provider display/model |
| Model Catalog | `models.json` | ProviderRef + model id | ModelRecord | endpoint/key |
| Active Model | `config.yaml model:` | resolved Hermes route | runtime default | Provider registry |
| Session Override | Desktop SQLite | ProviderRef + model | per-session selection | secret/baseURL SOT |
| Runtime Resolver | Desktop Main | ProviderRef + ModelRef | Hermes runtime route | UI |
| Gateway Transport | `hermes.ts` | RuntimeProviderRoute | `/v1` request | Identity recovery guessing |
| Dashboard Transport | Dashboard hook | RuntimeProviderRoute | `/model --provider` | normal-path baseURL guessing |
| Migration | Desktop Main | legacy state | canonical state | unknown ownership deletion |
| Hermes Agent | External runtime | named provider route | inference | Desktop SOT |

---

# 5. Terminology / Domain Model

```text
ProviderRef
  smc-copilot 内部 canonical provider identity。
  格式：
    builtin:<slug>
    named:<providerKey>

ProviderRecord
  Desktop 管理的 named Provider metadata。
  Secret value 不属于该 Record。

providerId
  providers.json 内既有 UUID record id；不可变，用于内部记录追踪。

providerKey
  Hermes config.yaml `providers:` 的稳定 key。
  创建后不可修改。
  示例：localhost、nodeskclaw、company-new-api。

displayName
  UI 展示名，可修改，不参与 identity。

HermesProvider
  Runtime Resolver 输出给 Hermes 的 provider string。
  只允许：
    builtin slug
    providerKey
  MUST NOT 为 bare custom，也 MUST NOT 为 custom:<name>。

RuntimeProviderRoute
  ProviderRef 解析后的 runtime-only 路由对象。

Legacy Route
  provider=custom + baseUrl 或 custom_providers legacy representation。

Compatibility Recovery
  仅用于读取/迁移旧状态的 identity recovery，不得成为新状态写入方式。

DESIRED_STATE
  Desktop canonical Provider/Model/Session desired state。

RUNTIME_STATE
  Hermes 当前实际 provider/model/session 状态。

LAST_APPLIED_STATE
  Desktop 最近一次成功投影到 Hermes config/runtime 的状态。

DRIFTED
  Desired 与 runtime projection 不一致。

PASS
  所有 Required Acceptance 均有有效 Evidence。

BLOCKED
  无法唯一判断或无法安全迁移，禁止继续 mutation。
```

---

# 6. System Context

## 6.1 Context Diagram

```text
User
  │
  ▼
Provider Settings
  │
  ├─────────────► Secret Store (.env)
  │
  └─────────────► Provider Registry (providers.json)
                         │
                         ▼
                 Hermes Projection
                 config.yaml providers:
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
        Model Catalog          Runtime Provider Resolver
        models.json                   │
             │                        │
             ▼                        │
        Chat ModelPicker              │
             │                        │
             ▼                        │
        Session Override              │
             │                        │
             └──────────┬─────────────┘
                        ▼
               RuntimeProviderRoute
                 │             │
                 ▼             ▼
          Gateway /v1     Dashboard /api/ws
                 │             │
                 └──────┬──────┘
                        ▼
                  Hermes Agent
                        │
                        ▼
                Enterprise NEW-API
```

## 6.2 System Boundary

```text
Inside boundary:
- smc-copilot/apps/work Renderer/Main/Preload/SQLite/config stores
- Desktop-owned Provider/Model/Session state
- Runtime route resolution
- Hermes config projection

Outside boundary:
- Hermes Agent Core
- NEW-API
- upstream model provider

External dependency:
- Hermes Agent v0.21.0
- OpenAI-compatible endpoint

Trusted input:
- Desktop-owned Provider Registry
- Desktop-generated ProviderRef
- profile-scoped .env

Untrusted / non-authoritative input:
- arbitrary baseURL string
- stale Session legacy route
- config.yaml legacy custom_providers without ownership proof
- runtime model.options response for normal identity
```

---

# 7. Authoritative State / Source of Truth

| State | Role | Type | Authoritative? | Writer | Reader | 可自动覆盖 |
|---|---|---|---:|---|---|---:|
| `providers.json` v2 | named Provider Registry | DESIRED_STATE | YES | Desktop Main | Settings/Resolver | YES，仅 Desktop-owned record |
| profile `.env` | secret value | DESIRED_STATE | YES | credential writer | Resolver/Hermes | YES，仅目标 key |
| `models.json` v2 | Model Catalog + ProviderRef | DESIRED_STATE | YES | Desktop Main | ModelPicker/Resolver | YES，仅 Desktop-owned row |
| SQLite session override v2 | per-session model selection | DESIRED_STATE | YES | Chat | Chat/Resolver | YES，仅目标 session row |
| `config.yaml providers:` | Hermes named-provider projection | LAST_APPLIED_STATE | NO | Projection writer | Hermes | YES，仅 Desktop-owned entry |
| `config.yaml model:` | active global runtime selection | DESIRED_STATE + LAST_APPLIED_STATE | YES for global active selection | Desktop/Hermes compatible writer | Hermes/Desktop | SECTION ownership only |
| `config.yaml custom_providers:` | legacy compatibility | OBSERVED_STATE | NO | legacy/migration only | migration/compat | MUST NOT blanket overwrite |
| Dashboard `model.options` | runtime provider inventory | RUNTIME_STATE | NO | Hermes | Dashboard/compat check | NO |
| Gateway runtime process | runtime | RUNTIME_STATE | NO | Runtime owner | probes | NO |
| Evidence files | verification | EVIDENCE_STATE | YES | test/evidence runner | Release Gate | append-only |

State precedence：

```text
Provider identity:
ProviderRef → Provider Registry → Runtime Provider Resolver
MUST NOT:
baseUrl → guess provider (normal path)

Secret:
keyEnv → profile .env
MUST NOT:
model/session → api_key

Runtime drift:
Desired canonical state
vs
config projection / model.options
→ CHECK
```

---

# 8. State Machine

## 8.1 Provider State Machine

```text
UNREGISTERED
   │ save metadata
   ▼
REGISTERED
   │ project config.yaml providers
   ▼
PROJECTED
   │ resolve + runtime check
   ▼
ROUTABLE
   │ successful auth/model call
   ▼
VERIFIED

REGISTERED / PROJECTED
   │ config mismatch
   ▼
DRIFTED

legacy state detected
   ▼
MIGRATION_REQUIRED
   │ deterministic match
   ▼
MIGRATED
   │ verify
   ▼
VERIFIED

ambiguous match
   ▼
BLOCKED
```

合法转移：

```text
UNREGISTERED → REGISTERED
REGISTERED → PROJECTED
PROJECTED → ROUTABLE
ROUTABLE → VERIFIED
* → DRIFTED
legacy → MIGRATION_REQUIRED → MIGRATED → VERIFIED
legacy → BLOCKED
```

非法转移：

```text
UNREGISTERED → ROUTABLE
REGISTERED → VERIFIED without projection/runtime evidence
BLOCKED → mutation without operator correction
DRIFTED → VERIFIED without reconcile evidence
```

状态持久化：

- Provider desired state：`providers.json`。
- Projection state：`config.yaml providers:`。
- Session desired state：SQLite。
- Verification：Evidence artifact。

---

# 9. Data / Schema Contract

## 9.1 Schema Rule

### Schema: `work.provider-registry.v2`

```yaml
schema_id: work.provider-registry.v2
version: 2
additionalProperties: false
```

ProviderRecord：

```yaml
id: string                # UUID, immutable
providerKey: string       # immutable Hermes named-provider key
name: string              # mutable display name
baseUrl: string
keyEnv: string | ""      # empty = no secret, no key_env projection
apiMode: chat_completions | anthropic_messages
createdAt: number
updatedAt: number
```

### Schema: `work.model-record.v2`

```yaml
schema_id: work.model-record.v2
version: 2
additionalProperties: false
```

```yaml
id: string
name: string
providerRef: string
model: string
contextLength: number | null
apiMode: string | null
createdAt: number
updatedAt: number
```

New v2 rows MUST NOT use `providerLabel` as identity.

### Schema: `work.session-model-override.v2`

```yaml
schema_id: work.session-model-override.v2
version: 2
additionalProperties: false
```

```yaml
sessionId: string
providerRef: string
model: string
legacyProvider: string | null
legacyBaseUrl: string | null
migrationStatus: canonical | migrated | unresolved
updatedAt: number
```

New rows：

```text
legacyProvider = null
legacyBaseUrl = null
migrationStatus = canonical
```

### Schema: `work.runtime-provider-route.v1`

```yaml
providerRef: string
hermesProvider: string
model: string
baseUrl: string | null
keyEnv: string | null
apiMode: string | null
strategy: builtin | named-config
source: canonical | migrated-legacy
```

## 9.2 Field Semantic Table

| Field | Type | Required | Default | Authority | Meaning |
|---|---|---:|---|---|---|
| providerRef | string | YES | none | Desktop | canonical identity |
| providerKey | string | named only | none | Provider Registry | stable Hermes config key |
| name | string | YES | none | Provider Registry | display only |
| baseUrl | string | named only | none | Provider Registry | endpoint |
| keyEnv | string | NO | "" | Provider Registry | secret reference；空表示不携带密钥；见 D-03 |
| apiMode | enum | YES | chat_completions | Provider Registry | 闭集 chat_completions、anthropic_messages；运行时只读 ProviderRecord |
| hermesProvider | string | runtime only | none | Resolver | provider passed to Hermes |
| legacyProvider | string | migration only | null | legacy snapshot | previous provider |
| legacyBaseUrl | string | migration only | null | legacy snapshot | previous endpoint |

---

# 10. Requirement Units

## REQ-STATE-001 — Canonical ProviderRef

### Goal
建立跨 Settings、Model、Session、Gateway、Dashboard 不丢失的 Provider Identity。

### Normative Requirement

```text
MUST 使用 ProviderRef 作为 smc-copilot 内部 Provider canonical identity。
MUST 使用 builtin:<slug> 表示 Hermes built-in provider。
MUST 使用 named:<providerKey> 表示 Desktop 管理的 named provider。
MUST NOT 使用 bare "custom" 作为 named provider identity。
MUST NOT 使用 baseUrl 作为正常路径 Provider Identity。
```

### Inputs

```text
provider metadata
Hermes built-in slug
legacy provider/baseUrl
```

### Preconditions

```text
PRE-STATE-001 profile 已唯一解析。
PRE-STATE-002 named provider 必须存在 ProviderRecord。
```

### Authoritative State

```text
SOT: ProviderRef + Provider Registry
Observed: legacy provider/baseUrl
Derived: RuntimeProviderRoute
```

### State Transition

```text
Before: custom + providerLabel/baseUrl
Event: canonicalization/migration
After: ProviderRef
```

### Allowed Side Effects

```text
ALLOW: ProviderRecord / ModelRecord / SessionOverride canonical field
```

### Forbidden Side Effects

```text
DENY: secret value persistence
DENY: arbitrary config.yaml rewrite
```

### Ownership Scope

```text
FIELD / RECORD
```

### Idempotency

```text
first run: canonical identity generated/migrated
second run: same ProviderRef, 0 identity changes
```

### Failure Semantics

```text
F-STATE-001:
trigger: multiple named providers match one legacy baseUrl
expected state: unchanged
error code: PROVIDER_IDENTITY_AMBIGUOUS
rollback: 0 mutation
retryable: after operator resolves conflict
```

### Postconditions

```text
POST-STATE-001 every new ModelRecord has ProviderRef.
POST-STATE-002 every new Session override has ProviderRef.
```

### Invariants

```text
INV-STATE-001 ProviderRef MUST NOT change because displayName changes.
INV-STATE-002 named ProviderRef MUST resolve to exactly one ProviderRecord.
```

### Error Codes

```text
PROVIDER_IDENTITY_AMBIGUOUS
PROVIDER_REF_NOT_FOUND
```

### Acceptance

```text
A-STATE-001
A-NEG-001
```

### Evidence

```text
required test: provider-ref unit + migration tests
required artifact: provider-state.json
required runtime output: resolved ProviderRef/strategy without secret
```

---

## REQ-DATA-001 — Provider Registry v2

### Goal
让 Provider metadata 成为独立、稳定、可投影的事实源。

### Normative Requirement

```text
MUST 将 providers.json 升级到 schema v2。
MUST 为每个 named provider 保存 immutable providerKey。
MUST 为每个 named provider保存 keyEnv，但 MUST NOT 保存 key value。
MUST 保留既有 record UUID。
MUST NOT 以 displayName 变化重建 Provider Identity。
```

### Inputs

```text
legacy CustomProviderRecord
user provider metadata
```

### Preconditions

```text
PRE-DATA-001 providers.json 可读或不存在。
```

### Authoritative State

```text
SOT: providers.json v2
Observed: config.yaml providers/custom_providers
Derived: Hermes provider projection
```

### State Transition

```text
v1 → v2
```

### Allowed Side Effects

```text
ALLOW: providers.json atomic replacement
```

### Forbidden Side Effects

```text
DENY: .env secret value copy into providers.json
```

### Ownership Scope

```text
FILE / RECORD
```

### Idempotency

```text
migration second run produces byte-equivalent semantic content
```

### Failure Semantics

```text
F-DATA-001:
trigger: duplicate providerKey
expected state: v1 file preserved
error code: PROVIDER_KEY_CONFLICT
rollback: restore T0
retryable: yes after conflict resolution
```

### Postconditions

```text
POST-DATA-001 providerKey immutable.
POST-DATA-002 keyEnv stable across name edits.
```

### Invariants

```text
INV-DATA-001 no secret values in providers.json.
```

### Error Codes

```text
PROVIDER_KEY_CONFLICT
PROVIDER_REGISTRY_WRITE_FAILED
```

### Acceptance

```text
A-DATA-001
A-SEC-001
```

### Evidence

```text
required test: registry-v1-v2 migration
required artifact: redacted providers.json before/after
```

---

## REQ-DATA-002 — Model Catalog ProviderRef

### Goal
让 Model Catalog 引用 Provider，而不是复制 endpoint identity。

### Normative Requirement

```text
MUST 为 v2 ModelRecord 保存 providerRef。
MUST NOT 为新 named-provider model 使用 provider="custom" + providerLabel 作为 identity。
MUST NOT 从 ModelRecord 读取 secret。
SHOULD NOT 在 canonical named model row 保存 baseUrl；baseUrl MUST 从 Provider Registry 解析。
```

### Inputs

```text
ProviderRef
model id
model metadata
```

### Preconditions

```text
PRE-DATA-002 ProviderRef 可解析。
```

### Authoritative State

```text
SOT: models.json v2
Derived endpoint: Provider Registry
```

### State Transition

```text
legacy model row → canonical v2 row
```

### Allowed Side Effects

```text
ALLOW: models.json target row
```

### Forbidden Side Effects

```text
DENY: auto-create custom_providers entry for new v2 row
```

### Ownership Scope

```text
ROW
```

### Idempotency

```text
same providerRef + model → no duplicate row
```

### Failure Semantics

```text
F-DATA-002:
trigger: providerRef missing
expected state: no row created
error code: MODEL_PROVIDER_REF_INVALID
rollback: none required
retryable: yes
```

### Postconditions

```text
POST-DATA-002 ModelPicker can load provider identity without baseUrl reverse lookup.
```

### Invariants

```text
INV-DATA-002 model row does not own endpoint or credential.
```

### Error Codes

```text
MODEL_PROVIDER_REF_INVALID
MODEL_MIGRATION_AMBIGUOUS
```

### Acceptance

```text
A-DATA-002
```

### Evidence

```text
required test: model catalog add/update/migrate
required artifact: models-v2.json
```

---

## REQ-DATA-003 — SessionModelOverride v2

### Goal
让 Session 恢复后仍保留原始 Provider Identity。

### Normative Requirement

```text
MUST 持久化 providerRef + model。
MUST NOT 将 bare custom + baseUrl 写成新 Session canonical state。
MUST 支持 legacy row lazy migration。
MUST 在 legacy identity 无法唯一恢复时 BLOCK provider switch execution，而不是猜测。
```

### Inputs

```text
session id
ProviderRef
model
legacy provider/baseUrl
```

### Preconditions

```text
PRE-DATA-003 session id 非空。
```

### Authoritative State

```text
SOT: desktop_session_model_overrides providerRef
Observed: legacy provider/base_url
```

### State Transition

```text
legacy → migrated/canonical
legacy ambiguous → unresolved/BLOCKED
```

### Allowed Side Effects

```text
ALLOW: target session row only
```

### Forbidden Side Effects

```text
DENY: config.yaml global active model mutation
DENY: API key storage
```

### Ownership Scope

```text
ROW
```

### Idempotency

```text
restore same session → same providerRef/model
```

### Failure Semantics

```text
F-DATA-003:
trigger: legacy row maps to 0 or >1 provider
expected state: preserve legacy fields, migrationStatus=unresolved
error code: SESSION_PROVIDER_UNRESOLVED
rollback: not applicable
retryable: after provider registry correction
```

### Postconditions

```text
POST-DATA-003 resumed session routes to same canonical provider.
```

### Invariants

```text
INV-DATA-003 session override never contains secret.
```

### Error Codes

```text
SESSION_PROVIDER_UNRESOLVED
```

### Acceptance

```text
A-DATA-003
A-NEG-002
```

### Evidence

```text
required test: session create/resume/migration
required artifact: redacted DB query output
```

---

## REQ-PROJ-001 — Hermes Named Provider Projection

### Goal
确保 Desktop Provider Registry 与 Hermes `config.yaml providers:` 一致。

### Normative Requirement

```text
MUST 将 every Desktop-managed named ProviderRecord 投影为 config.yaml providers:<providerKey>。
MUST 使用 ProviderRecord.baseUrl/keyEnv/apiMode 生成投影。
MUST NOT 把 projection failure 当作成功保存。
MUST NOT blanket rewrite providers: section。
MUST NOT 删除 unknown/user-owned provider entries。
```

### Inputs

```text
ProviderRecord
profile config path
```

### Preconditions

```text
PRE-PROJ-001 profile scope resolved.
PRE-PROJ-002 config.yaml parseable.
```

### Authoritative State

```text
SOT: providers.json
Projection: config.yaml providers:
```

### State Transition

```text
REGISTERED → PROJECTED
```

### Allowed Side Effects

```text
ALLOW: one Desktop-owned providers:<providerKey> entry
```

### Forbidden Side Effects

```text
DENY: unrelated YAML fields
DENY: custom_providers bulk cleanup
```

### Ownership Scope

```text
ENTRY
```

### Idempotency

```text
same ProviderRecord projected twice → second run 0 semantic changes
```

### Failure Semantics

```text
F-PROJ-001:
trigger: config write fails
expected state: Provider save transaction rolls back to T0
error code: PROVIDER_PROJECTION_FAILED
rollback: mandatory
retryable: yes
```

### Postconditions

```text
POST-PROJ-001 ProviderRef named:<providerKey> has matching Hermes named provider entry.
```

### Invariants

```text
INV-PROJ-001 projection contains key_env reference, not key value.
```

### Error Codes

```text
PROVIDER_PROJECTION_FAILED
PROFILE_SCOPE_MISMATCH
```

### Acceptance

```text
A-PROJ-001
A-TXN-001
```

### Evidence

```text
required test: projection and write-failure injection
required artifact: redacted YAML diff
```

---

## REQ-API-001 — Runtime Provider Resolver

### Goal
为 Gateway 与 Dashboard 提供唯一 Provider routing contract。

### Normative Requirement

```text
MUST 新建共享 Runtime Provider Resolver。
MUST 以 ProviderRef 为输入。
MUST 为 named Provider 解析为 config.yaml providers:<providerKey> route（strategy=named-config）。
MUST 为 Hermes built-in 解析为 builtin slug（strategy=builtin）。
MUST NOT 输出 bare custom 或 custom:<legacy-name> 作为 hermesProvider。
MUST NOT 因投影缺失、密钥缺失或 runtime 不认 key 而自动 fallback。
MUST NOT 在正常路径通过 baseUrl 猜 Provider Identity。baseURL 唯一匹配只属于迁移模块（D-02）。
```

### Inputs

```text
ProviderRef
model
Provider Registry
Hermes projection
legacy compatibility state
```

### Preconditions

```text
PRE-API-001 ProviderRef canonical or explicitly legacy.
```

### Authoritative State

```text
SOT: ProviderRef + Provider Registry
Derived: RuntimeProviderRoute
```

### State Transition

```text
canonical identity → runtime route
```

### Allowed Side Effects

```text
ALLOW: none
```

### Forbidden Side Effects

```text
DENY: file/db mutation during pure resolve
DENY: secret logging
```

### Ownership Scope

```text
NONE
```

### Idempotency

```text
same canonical state → same RuntimeProviderRoute
```

### Failure Semantics

```text
F-API-001:
trigger: ProviderRef cannot resolve
expected state: no runtime request
error code: PROVIDER_ROUTE_UNRESOLVED
rollback: none
retryable: yes after state repair
```

### Postconditions

```text
POST-API-001 both transports receive identical hermesProvider for same ProviderRef.
```

### Invariants

```text
INV-API-001 Resolver is the only normal-path ProviderRef → HermesProvider owner.
```

### Error Codes

```text
PROVIDER_ROUTE_UNRESOLVED
PROVIDER_ROUTE_AMBIGUOUS
```

### Acceptance

```text
A-API-001
A-NEG-003
```

### Evidence

```text
required test: resolver matrix
required artifact: resolver-output.json (redacted)
```

---

## REQ-API-002 — Legacy Gateway Provider Contract

### Goal
确保 `/v1/runs` 与 `/v1/chat/completions` 使用 canonical runtime route。

### Normative Requirement

```text
MUST 在构建 Gateway request 前调用 Runtime Provider Resolver。
MUST 为 named provider 将 body.provider 设置为 resolved hermesProvider。
MUST NOT 对 canonical named provider发送 provider=custom。
MUST NOT 为 canonical named provider依赖 request.base_url 作为身份。
MAY 为明确 legacy compatibility route 发送 legacy-compatible base_url。
```

### Inputs

```text
Session override ProviderRef
global active ProviderRef
RuntimeProviderRoute
```

### Preconditions

```text
PRE-API-002 Gateway available.
```

### Authoritative State

```text
SOT: Session Override > Global Active Model
Resolved: RuntimeProviderRoute
```

### State Transition

```text
Session selection → resolved /v1 request
```

### Allowed Side Effects

```text
ALLOW: network request
```

### Forbidden Side Effects

```text
DENY: config.yaml mutation per message
DENY: secret serialization into session/model state
```

### Ownership Scope

```text
REQUEST
```

### Idempotency

```text
same session/provider/model → same route fields
```

### Failure Semantics

```text
F-API-002:
trigger: resolver blocked
expected state: request not sent
error code: PROVIDER_ROUTE_UNRESOLVED
rollback: none
retryable: yes
```

### Postconditions

```text
POST-API-002 NEW-API receives valid credential via Hermes named provider resolution.
```

### Invariants

```text
INV-API-002 canonical named provider never reaches Hermes as bare custom.
```

### Error Codes

```text
PROVIDER_ROUTE_UNRESOLVED
GATEWAY_PROVIDER_SWITCH_FAILED
```

### Acceptance

```text
A-API-002
A-GOLDEN-001
```

### Evidence

```text
required test: mocked /v1 request body + real golden consumer call
required runtime output: provider/model/HTTP status; secret redacted
```

---

## REQ-API-003 — Dashboard Provider Contract

### Goal
让 Dashboard 与 Gateway 使用相同 canonical route。

### Normative Requirement

```text
MUST 在 `/model` command 生成前调用同一 Runtime Provider Resolver。
MUST 使用 resolved hermesProvider 生成 `/model <model> --provider <provider>`。
MUST NOT 在正常路径通过 model.options + baseUrl 反推 Identity。
MUST NOT 在 Dashboard 发送路径调用 resolveDashboardProviderForModel。
legacy baseURL 恢复只允许留在迁移模块，并记迁移事件，不得记成 Dashboard heuristic recovery。
```

### Inputs

```text
ProviderRef
model
runtime route
legacy session route
```

### Preconditions

```text
PRE-API-003 Dashboard transport connected.
```

### Authoritative State

```text
SOT: ProviderRef
Runtime observation: model.options
```

### State Transition

```text
ProviderRef → /model command → session runtime state
```

### Allowed Side Effects

```text
ALLOW: slash.exec / prompt session runtime mutation
```

### Forbidden Side Effects

```text
DENY: Provider Registry mutation from model.options
```

### Ownership Scope

```text
SESSION RUNTIME
```

### Idempotency

```text
already applied same provider/model → no duplicate switch command required
```

### Failure Semantics

```text
F-API-003:
trigger: runtime refuses resolved provider
expected state: prompt not submitted under wrong provider
error code: DASHBOARD_PROVIDER_SWITCH_FAILED
rollback: preserve previous runtime session model
retryable: yes
```

### Postconditions

```text
POST-API-003 Dashboard and Gateway resolve same HermesProvider.
```

### Invariants

```text
INV-API-003 runtime observation cannot overwrite canonical ProviderRef.
```

### Error Codes

```text
DASHBOARD_PROVIDER_SWITCH_FAILED
LEGACY_PROVIDER_RECOVERY_USED
```

### Acceptance

```text
A-API-003
A-COMPAT-001
```

### Evidence

```text
required test: dashboard command tests
required artifact: RPC trace with redacted secrets
```

---

## REQ-CHECK-001 — Profile Scope Consistency

### Goal
确保 Provider、Model、Secret 与 config 投影始终落到同一个 profile home。

### Normative Requirement

```text
MUST 由 Desktop explicit profile 参数解析 profileHome。
MUST 对 Provider Registry、.env、config.yaml、Session resolver 使用同一 profile identity。
MUST NOT 让进程环境中的 HERMES_PROFILE 隐式覆盖 Desktop 已选择 profile。
MUST 在发现目标文件路径跨 profile 时 BLOCK mutation。
```

### Inputs

```text
desktop profile
active_profile
HERMES_HOME
HERMES_PROFILE env
```

### Preconditions

```text
PRE-CHECK-001 HERMES_HOME 可解析。
```

### Authoritative State

```text
SOT: Desktop-selected profile argument
Observed: active_profile/env
```

### State Transition

```text
profile resolved → scoped operation
```

### Allowed Side Effects

```text
ALLOW: none during check
```

### Forbidden Side Effects

```text
DENY: cross-profile writes
```

### Ownership Scope

```text
NONE
```

### Idempotency

```text
same inputs → same resolved paths
```

### Failure Semantics

```text
F-CHECK-001:
trigger: resolved paths disagree
expected state: 0 mutation
error code: PROFILE_SCOPE_MISMATCH
rollback: none
retryable: after profile correction
```

### Postconditions

```text
POST-CHECK-001 one operation touches exactly one profile scope.
```

### Invariants

```text
INV-CHECK-001 default profile and named profile paths MUST NOT be mixed.
```

### Error Codes

```text
PROFILE_SCOPE_MISMATCH
```

### Acceptance

```text
A-CHECK-001
A-NEG-004
```

### Evidence

```text
required test: default/named/env mismatch matrix
required artifact: resolved-paths.json
```

---

## REQ-MIGRATE-001 — Legacy Provider / Model Migration

### Goal
把既有 `custom/custom_providers/providerLabel/baseUrl` 状态迁移为 ProviderRef。

### Normative Requirement

```text
MUST 支持读取 legacy custom_providers。
MUST 按确定顺序恢复 ProviderRef：
1. exact config.yaml providers:<key> match
2. exact custom_providers 名称 match（只用于迁移匹配，不得输出 custom:<name> 线上 strategy）
3. exact baseUrl match to exactly one ProviderRecord
4. exact legacy custom_providers name/baseUrl import
MUST 在 0 或 >1 匹配时 BLOCK 自动迁移。
MUST PRESERVE unknown ownership legacy entries。
MUST NOT 自动删除 legacy custom_providers in Provider Contract v1.x。
```

### Inputs

```text
legacy config
providers.json
models.json
```

### Preconditions

```text
PRE-MIGRATE-001 source readable.
```

### Authoritative State

```text
Observed: legacy state
Target SOT: Provider Registry + ProviderRef
```

### State Transition

```text
legacy → migrated canonical
or
legacy → unresolved
```

### Allowed Side Effects

```text
ALLOW: canonical provider/model records
ALLOW: last-applied migration marker/evidence
```

### Forbidden Side Effects

```text
DENY: unknown legacy entry deletion
```

### Ownership Scope

```text
RECORD / ROW
```

### Idempotency

```text
second migration run → 0 additional canonical records
```

### Failure Semantics

```text
F-MIGRATE-001:
trigger: ambiguous baseUrl or name collision
expected state: source unchanged
error code: LEGACY_PROVIDER_MIGRATION_AMBIGUOUS
rollback: restore T0 for partially created canonical state
retryable: yes
```

### Postconditions

```text
POST-MIGRATE-001 migrated model has ProviderRef.
```

### Invariants

```text
INV-MIGRATE-001 unknown ownership content preserved.
```

### Error Codes

```text
LEGACY_PROVIDER_MIGRATION_AMBIGUOUS
LEGACY_PROVIDER_MIGRATION_FAILED
```

### Acceptance

```text
A-MIGRATE-001
A-NEG-005
```

### Evidence

```text
required test: normal/duplicate/orphan/ambiguous fixtures
required artifact: migration-report.json
```

---

## REQ-MIGRATE-002 — Legacy Session Lazy Migration

### Goal
旧 Session 恢复时不再永久携带 bare custom。

### Normative Requirement

```text
MUST 在读取 legacy Session override 时尝试唯一匹配。
MUST 在唯一匹配时于同一次用户发送内完成 D-09 后发送 named-config。
MUST 在写回 providerRef 时保留 legacy snapshot。
MUST 在 ambiguous/unmatched 时标记 unresolved。
MUST NOT 在 unresolved 状态发送模型请求。
MUST NOT 提供消歧 UI。
```

### Inputs

```text
session provider/model/base_url
Provider Registry
legacy provider config
```

### Preconditions

```text
PRE-MIGRATE-002 session row exists.
```

### Authoritative State

```text
Observed: legacy row
Target: Session Override v2
```

### State Transition

```text
legacy → migrated
legacy → unresolved
```

### Allowed Side Effects

```text
ALLOW: target session row
```

### Forbidden Side Effects

```text
DENY: global model mutation
```

### Ownership Scope

```text
ROW
```

### Idempotency

```text
migrated row remains stable on next restore
```

### Failure Semantics

```text
F-MIGRATE-002:
trigger: no unique provider
expected state: unresolved, no network request
error code: SESSION_PROVIDER_UNRESOLVED
rollback: none
retryable: yes
```

### Postconditions

```text
POST-MIGRATE-002 migrated session uses canonical route.
```

### Invariants

```text
INV-MIGRATE-002 failure cannot silently fall back to bare custom.
```

### Error Codes

```text
SESSION_PROVIDER_UNRESOLVED
PROVIDER_PROJECTION_DRIFT
PROVIDER_SECRET_MISSING
PROVIDER_RUNTIME_RELOAD_FAILED
```

### Acceptance

```text
A-MIGRATE-002
```

### Evidence

```text
required test: legacy session restore
required artifact: session-migration-report.json
```

---

## REQ-TXN-001 — Provider Save Atomicity

### Goal
消除“UI 保存成功但 Hermes named provider 未投影”的 split-brain。

### Normative Requirement

```text
MUST 把 Provider metadata save + Hermes provider projection 视为一个 transaction。
MUST 在首次 mutation 前建立 T0 snapshot。
MUST 在 projection write/verify 失败时 rollback 到 T0。
MUST NOT 对用户返回 success，除非 Provider Registry 与 projection 均验证成功。
```

### Inputs

```text
ProviderRecord mutation
config projection mutation
```

### Preconditions

```text
PRE-TXN-001 target profile writable.
```

### Authoritative State

```text
SOT: providers.json
Projection: config.yaml entry
```

### State Transition

```text
T0 → STAGED → COMMITTED → VERIFIED
failure → ROLLBACK → T0
```

### Allowed Side Effects

```text
ALLOW: provider registry target record
ALLOW: matching providers:<providerKey> entry
```

### Forbidden Side Effects

```text
DENY: unrelated config bytes/entries
```

### Ownership Scope

```text
RECORD + ENTRY
```

### Idempotency

```text
repeat same save → semantic no-op
```

### Failure Semantics

```text
F-TXN-001:
trigger: fail after providers.json write before config commit
expected state: T0 restored
error code: PROVIDER_SAVE_TRANSACTION_FAILED
rollback: mandatory
retryable: yes
```

### Postconditions

```text
POST-TXN-001 no partial successful provider save.
```

### Invariants

```text
INV-TXN-001 success => registry and projection agree.
```

### Error Codes

```text
PROVIDER_SAVE_TRANSACTION_FAILED
PROVIDER_SAVE_ROLLBACK_FAILED
```

### Acceptance

```text
A-TXN-001
A-TXN-002
```

### Evidence

```text
required test: failure injection after each write
required artifact: T0/post/rollback digests
```

---

## REQ-SEC-001 — Secret Containment

### Goal
Secret 只存在于批准的 secret store。

### Normative Requirement

```text
MUST 将 API Key value 存储于 profile .env 或既有安全 secret provider。
MUST NOT 将 API Key value 写入 providers.json。
MUST NOT 将 API Key value 写入 models.json。
MUST NOT 将 API Key value 写入 Session DB。
MUST NOT 以解决 401 为目的自动写 model.api_key。
MUST redact credential from logs/evidence.
```

### Inputs

```text
keyEnv
key value
```

### Preconditions

```text
PRE-SEC-001 target profile known.
```

### Authoritative State

```text
SOT: .env / approved secret provider
```

### State Transition

```text
secret update → runtime apply/restart owner process
```

### Allowed Side Effects

```text
ALLOW: one target env key
```

### Forbidden Side Effects

```text
DENY: secret duplication
```

### Ownership Scope

```text
ENTRY
```

### Idempotency

```text
same secret value write → same semantic state
```

### Failure Semantics

```text
F-SEC-001:
trigger: secret persistence failure
expected state: provider metadata remains but provider status=credential-missing / save workflow reports failure
error code: PROVIDER_SECRET_WRITE_FAILED
rollback: operation-specific
retryable: yes
```

### Postconditions

```text
POST-SEC-001 secret scan finds no key value outside approved store.
```

### Invariants

```text
INV-SEC-001 evidence/log never exposes full key.
```

### Error Codes

```text
PROVIDER_SECRET_WRITE_FAILED
SECRET_EXPOSURE_DETECTED
```

### Acceptance

```text
A-SEC-001
A-NEG-006
```

### Evidence

```text
required test: secret persistence + repository/runtime artifact scan
required artifact: redacted secret-scan.json
```

---

## REQ-OBS-001 — Provider Routing Observability

### Goal
让 401 / wrong endpoint / migration fallback 可以定位到 Identity/Route 层。

### Normative Requirement

```text
MUST 为 Provider resolve/switch/send 记录 operation id。
MUST 记录 providerRef、hermesProvider、strategy、profile、model、transport。
MUST NOT 记录 API Key value。
MUST 区分 canonical route 与 legacy recovery route。
MUST 在 fallback/recovery 时输出稳定 error/event code。
```

### Inputs

```text
route resolution
gateway/dashboard send
migration
```

### Preconditions

```text
none
```

### Authoritative State

```text
Evidence/telemetry only
```

### State Transition

```text
ANALYZE → RESOLVE → APPLY → CHECK
```

### Allowed Side Effects

```text
ALLOW: log/evidence
```

### Forbidden Side Effects

```text
DENY: business state changes
```

### Ownership Scope

```text
EVIDENCE
```

### Idempotency

```text
not applicable
```

### Failure Semantics

```text
F-OBS-001:
trigger: telemetry write fails
expected state: core routing continues; no secret leakage
error code: ROUTE_TELEMETRY_FAILED
rollback: none
retryable: no
```

### Postconditions

```text
POST-OBS-001 every failed route can be attributed to providerRef/strategy/transport.
```

### Invariants

```text
INV-OBS-001 logs are credential-free.
```

### Error Codes

```text
LEGACY_PROVIDER_RECOVERY_USED
PROVIDER_ROUTE_UNRESOLVED
ROUTE_TELEMETRY_FAILED
```

### Acceptance

```text
A-OBS-001
```

### Evidence

```text
required test: structured log assertions
required artifact: routing-events.jsonl
```

---

# 11. Side-Effect Contract

| Operation | DB Write | File Write | Network | Cache | User Data | Business Source |
|---|---:|---:|---:|---:|---:|---:|
| resolveProviderRef | NO | NO | NO | MAY | NO | NO |
| listProviderRegistry | NO | NO | NO | MAY | NO | NO |
| saveProvider | NO | YES | NO | MAY | YES | NO |
| saveSecret | NO | YES | NO | MAY | YES | NO |
| addModel | NO | YES | NO | MAY | YES | NO |
| setGlobalModel | NO | YES | MAY | MAY | YES | NO |
| setSessionOverride | YES | NO | NO | MAY | YES | NO |
| migrateLegacyProvider | MAY | YES | NO | MAY | YES | NO |
| migrateLegacySession | YES | MAY | NO | MAY | YES | NO |
| localMigrateAndSend | YES | YES | YES | MAY | YES | YES |
| gatewaySend | NO | NO | YES | MAY | NO | YES |
| dashboardSwitch | NO | NO | YES | MAY | NO | YES |
| compatibilityRecover | NO | NO | MAY | MAY | NO | NO |

日志与 telemetry 视为 Side Effect，但只允许写入 redacted evidence/log scope。

`localMigrateAndSend` 只适用于 connection mode = local。文件写入与进程重启的顺序以 D-09 为准。重启失败记 `PROVIDER_RUNTIME_RELOAD_FAILED`，不回滚已提交文件，模型请求次数为 0。

---

# 12. Ownership Contract

## 12.1 Ownership Type

```text
providers.json:
  Desktop WHOLE_RESOURCE, except unknown future schema extensions must block destructive migration.

config.yaml providers:
  ENTRY ownership only for providerKey recorded in Provider Registry.

config.yaml model:
  SECTION ownership for Desktop-managed active model operation.

config.yaml custom_providers:
  SHARED / legacy.
  Unknown ownership MUST PRESERVE.

.env:
  ENTRY ownership only for keyEnv associated with ProviderRecord.

models.json:
  ROW ownership.

session override DB:
  ROW ownership by session id.
```

## 12.2 Ownership Rule

```text
创建时 ownership：
- Provider record/entry written by Desktop is Desktop-owned.

更新后 ownership：
- only same id/providerKey record/entry.

用户修改后 ownership：
- if current != last_applied and change cannot be proven Desktop-generated → DRIFT.

升级时 ownership：
- preserve unknown fields/content.
- migrate only deterministic rows.

remove 时 ownership：
- remove only proven Desktop-owned record/entry.
```

## 12.3 Drift

```text
current == last_applied
→ safe

current != last_applied
→ DRIFTED
```

Drift behavior：

```text
Provider registry drift: BLOCK destructive overwrite.
Projection drift: MERGE target entry if ownership proven; otherwise BLOCK.
legacy custom_providers drift: PRESERVE.
Session legacy drift: REPORT/BLOCK routing when identity ambiguous.
```

---

# 13. Hash / Identity Contract

## 13.1 ProviderRef Identity

```text
builtin provider:
ProviderRef = "builtin:" + canonical Hermes builtin slug

named provider:
ProviderRef = "named:" + providerKey
```

ProviderRef UTF-8，case-sensitive after providerKey canonicalization。

## 13.2 providerKey Generation

新 Provider 创建时：

```text
1. Unicode NFKC(name)
2. trim
3. lowercase
4. whitespace run → "-"
5. any char outside [a-z0-9._-] → "-"
6. collapse repeated "-"
7. trim leading/trailing ".", "_", "-"
8. max 64 chars
9. if empty → "custom-" + first 12 hex chars of record UUID
10. exact collision → PROVIDER_KEY_CONFLICT
```

providerKey 一旦 commit：

```text
MUST be immutable
```

displayName 修改不得重新生成 providerKey。

## 13.5 keyEnv 生成

命名见 D-03。空 keyEnv 合法。生成结果与另一 providerKey 冲突时 `PROVIDER_KEYENV_CONFLICT`，0 mutation。

```text
function providerKeyEnv(providerKey: string): string {
  const suffix = providerKey.toUpperCase().replace(/[.\-]/g, "_");
  return "PROVIDER_" + suffix + "_API_KEY";
}
```

## 13.3 UUID

```text
provider record id:
RFC 4122 UUID v4
immutable
not reused
```

## 13.4 Evidence Digest

用于 T0 / rollback 比较时：

```text
SHA256(UTF-8 bytes of canonicalized managed scope snapshot)
```

canonical snapshot：

```text
JSON UTF-8
sorted object keys
LF newline
no secret values
```

---

# 14. Transaction Contract

## 14.1 Transaction Boundary

Provider save transaction：

```text
TXN includes:
- Provider Registry target record
- config.yaml providers:<providerKey> projection
- projection verification

TXN excludes:
- model attachment
- session selection
- network inference
```

Secret update：

```text
独立 transaction：
- target .env entry
- runtime apply signal
```

## 14.2 Commit Order

```text
validate
→ resolve profile
→ snapshot T0
→ stage Provider Registry
→ stage config projection
→ verify staged semantic state
→ commit Provider Registry
→ commit config projection
→ re-read verify
→ evidence
```

## 14.3 Failure Atomicity

```text
T0 = first mutation 前：
- target Provider Registry snapshot
- target config providers entry snapshot
```

失败要求：

```text
AfterRollback(managed_scope) == T0
```

## 14.4 Rollback Failure

```text
error: PROVIDER_SAVE_ROLLBACK_FAILED
recovery artifact: provider-save-recovery-<operationId>.json
backup retention: MUST retain T0 backup
manual recovery: artifact contains exact files/entries and intended values
cleanup policy: backup MUST NOT delete until operator confirms recovery
```

---

# 15. Conflict Contract

| Conflict | Detection | Default Behavior | Error | Mutation |
|---|---|---|---|---:|
| duplicate providerKey | registry index | BLOCK | PROVIDER_KEY_CONFLICT | 0 |
| same baseUrl, different provider | >1 exact match during migration | BLOCK migration | PROVIDER_IDENTITY_AMBIGUOUS | 0 |
| registry vs projection different endpoint | compare target entry | BLOCK；仅用户再次保存时 registry 覆盖该 entry | PROVIDER_PROJECTION_DRIFT | 0 until explicit save |
| secret keyEnv collision | same keyEnv bound to different providerKey | BLOCK | PROVIDER_KEYENV_CONFLICT | 0 |
| legacy session ambiguous | resolver match count != 1 | BLOCK send | SESSION_PROVIDER_UNRESOLVED | 0 network |
| unknown custom_providers ownership | no provenance | PRESERVE | none | 0 deletion |
| default/named profile mismatch | resolved path comparison | BLOCK | PROFILE_SCOPE_MISMATCH | 0 |

禁止：

```text
last writer wins
best effort success
silent fallback to bare custom
automatic destructive legacy cleanup
```

---

# 16. Compatibility / Migration

## 16.1 Existing State

```text
旧 Provider Registry:
providers.json v1: id/name/baseUrl

旧 Model:
provider=custom
providerLabel=<name>
baseUrl=<endpoint>

旧 Session:
provider/model/base_url

旧 Hermes:
config.yaml custom_providers:
config.yaml model.provider=custom + model.base_url
```

## 16.2 Migration

### Provider Registry

```text
detect v1
→ preserve UUID
→ generate immutable providerKey
→ keyEnv 按 D-03
→ write v2
→ project config.yaml providers:
→ verify
```

### Model Catalog

```text
legacy model
→ resolve ProviderRef deterministically
→ write v2 providerRef
→ preserve unresolved row and report
```

### Session

```text
legacy session
→ unique match
→ 同一用户动作内按 D-09 补齐并发送 named-config
→ ambiguous or zero match: SESSION_PROVIDER_UNRESOLVED + 0 network
```

### Active Model

```text
无 Session override，且全局 model 仍是 legacy 身份时：
→ 与 Session 相同的唯一匹配
→ 只改 Desktop-owned model 段字段：provider、model、base_url、api_mode
→ 唯一匹配后 model.provider = providerKey，去掉作为身份的 model.base_url
→ 补齐与重启顺序与 D-09 相同
→ 无法唯一匹配：ACTIVE_MODEL_PROVIDER_UNRESOLVED，0 network
```

## 16.3 Unknown Ownership

```text
无法证明 ownership：
PRESERVE
REPORT
MUST NOT DELETE
```

## 16.4 Compatibility Contract

| Compatibility | Current Consumer | Reason | Removal Condition | Removal Version |
|---|---|---|---|---|
| read `custom_providers:` | existing Hermes/user configs | migrate legacy providers | all supported profiles migrated + no unresolved evidence | Provider Contract v2.0 |
| `providerLabel` read | existing models.json | recover legacy model identity | models v2 migration PASS | Provider Contract v2.0 |
| baseUrl identity recovery | old Session rows | lazy migration | all active legacy sessions migrated/expired | Provider Contract v2.0 |
| `resolveDashboardProviderForModel` 在发送路径 | none | v1.1 禁止用于 Gateway/Dashboard 正常发送 | 已禁止；仅迁移模块可做 baseURL 唯一匹配 | v1.1 |
| bare `custom` 与 `custom:<name>` wire strategy | none in new writes | D-02 禁止作为 hermesProvider | 立即禁止 | v1.1 |

---

# 17. External Dependency Contract

## 17.1 smc-copilot

```text
name: smc-copilot
repo: https://github.com/loudon84/smc-copilot
branch: work/prd-v6.2
immutable identity: 027e73278eb44a2333224521ec5b44ca78c3ecde
required paths:
- apps/work/src/main/providers-store.ts
- apps/work/src/main/agent-config-providers.ts
- apps/work/src/main/models.ts
- apps/work/src/main/config.ts
- apps/work/src/main/session-model-override-store.ts
- apps/work/src/main/hermes.ts
- apps/work/src/main/remote-models.ts
- apps/work/src/renderer/src/screens/Providers/*
- apps/work/src/renderer/src/screens/Chat/*
```

## 17.2 Hermes Agent

```text
name: Hermes Agent
version: v0.21.0
tag: v2026.8.31
immutable commit: 29112bef099274229cadff79cdff7bf7b99c4b77
required capability:
- named custom provider resolution
- API server /v1
- Dashboard model switching
fallback:
- v1.1 MUST NOT 使用 custom:<name> 或 bare custom 作为本契约的降级路径
offline behavior:
- Provider state may be edited, but runtime verification is BLOCKED
failure behavior:
- MUST NOT downgrade to bare custom for secret-backed named provider
```

## 17.3 Enterprise NEW-API

```text
interface: OpenAI-compatible /v1
auth: Bearer token
endpoint: deployment-specific
ownership: external
failure:
- HTTP 401 MUST be surfaced as upstream auth failure
- route telemetry MUST record ProviderRef/strategy, not token
```

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| credential exposure in YAML/JSON/DB | key value only in approved secret store | A-SEC-001 |
| wrong secret sent to wrong endpoint | ProviderRef→ProviderRecord deterministic routing | A-API-002 |
| baseURL spoof causes identity switch | baseURL not normal-path identity | A-NEG-003 |
| cross-profile secret read | explicit profile scope check | A-CHECK-001 |
| destructive legacy migration | unknown ownership preserve | A-NEG-005 |
| logs leak token | structured redaction | A-OBS-001 |
| path traversal/profile injection | existing profile validation + scoped resolver | A-NEG-004 |

---

# 19. Observability

Stages：

```text
ANALYZE
RESOLVE
PROJECT
APPLY
CHECK
MIGRATE
ROLLBACK
```

每次 Provider routing operation 至少记录：

```json
{
  "operation_id": "...",
  "stage": "RESOLVE",
  "status": "PASS|FAIL|BLOCKED",
  "timestamp": "...",
  "profile": "default|name",
  "provider_ref": "named:localhost",
  "hermes_provider": "localhost",
  "model": "deepseek-v4-flash",
  "transport": "gateway|dashboard",
  "strategy": "named-config|builtin",
  "error_code": null
}
```

MUST NOT 出现：

```text
apiKey
Authorization bearer
full credential pool secret
```

---

# 20. Acceptance Design Standard

## A-STATE-001 — ProviderRef 不丢失

### Requirement Refs
`REQ-STATE-001`

### Given
一个 named provider `localhost` 已注册并挂载 `deepseek-v4-flash`。

### When
模型从 Provider Settings 进入 Model Catalog、Chat ModelPicker、Session Override。

### Then
每层都可得到同一 canonical `ProviderRef`。

### Oracle

```text
model.providerRef == session.providerRef == expected ProviderRef
bare "custom" count in canonical persisted identity == 0
```

### Evidence

```text
test id: TEST-A-STATE-001
exit code: 0
artifact: provider-ref-flow.json
```

---

## A-DATA-001 — Provider Registry v1→v2

### Requirement Refs
`REQ-DATA-001`

### Given
providers.json v1 存在一个 `{id,name,baseUrl}` record。

### When
执行 migration。

### Then
UUID 保留；providerKey/keyEnv/apiMode 生成；secret value 不进入文件。

### Oracle

```text
old.id == new.id
new.providerKey != ""
secret_value_occurrences == 0
```

### Evidence
`TEST-A-DATA-001`, `providers-migration.json`

---

## A-DATA-002 — Model Catalog 不再复制 Provider Identity

### Requirement Refs
`REQ-DATA-002`

### Given
named ProviderRef 与 model id。

### When
添加 Model。

### Then
new row 保存 providerRef，不以 providerLabel/baseUrl 作为身份。

### Oracle

```text
row.providerRef == expected
row has no secret
new identity does not require providerLabel
```

### Evidence
`TEST-A-DATA-002`, `models-v2.json`

---

## A-DATA-003 — Session Resume 保留 ProviderRef

### Requirement Refs
`REQ-DATA-003`, `REQ-MIGRATE-002`

### Given
canonical session override。

### When
关闭并恢复 Chat session。

### Then
恢复相同 providerRef/model。

### Oracle

```text
restored.providerRef == original.providerRef
restored.model == original.model
```

### Evidence
`TEST-A-DATA-003`, DB query evidence

---

## A-PROJ-001 — Provider Projection 一致

### Requirement Refs
`REQ-PROJ-001`

### Given
ProviderRecord `providerKey=localhost`。

### When
保存 Provider。

### Then
同 profile `config.yaml providers.localhost` 与 Registry metadata 一致。

### Oracle

```text
config.providers.localhost.base_url == registry.baseUrl
config.providers.localhost.key_env == registry.keyEnv
```

### Evidence
`TEST-A-PROJ-001`, redacted YAML diff

---

## A-API-001 — Resolver 单一结果

### Requirement Refs
`REQ-API-001`

### Given
同一 ProviderRef/model。

### When
Gateway 与 Dashboard 分别请求 resolve。

### Then
得到相同 `hermesProvider`。

### Oracle

```text
gatewayRoute.hermesProvider == dashboardRoute.hermesProvider
strategy != bare-custom
```

### Evidence
`TEST-A-API-001`, resolver matrix

---

## A-API-002 — Gateway 不发送 bare custom

### Requirement Refs
`REQ-API-002`

### Given
secret-backed named provider。

### When
Session override 通过 Legacy Gateway 发送模型请求。

### Then
request provider 为 resolved named route。

### Oracle

```text
body.provider != "custom"
HTTP request sent exactly once
```

### Evidence
`TEST-A-API-002`, redacted request capture

---

## A-API-003 — Dashboard 不依赖正常路径 heuristic

### Requirement Refs
`REQ-API-003`

### Given
canonical ProviderRef。

### When
Dashboard 切换模型。

### Then
`/model` 直接使用 Resolver 输出 provider。

### Oracle

```text
slash command provider == resolver.hermesProvider
compatibility recovery invocation count == 0
```

### Evidence
`TEST-A-API-003`, RPC trace

---

## A-CHECK-001 — Profile Scope 一致

### Requirement Refs
`REQ-CHECK-001`

### Given
named profile `smc-sz-hr21007`。

### When
保存 Provider/Secret/Model。

### Then
所有文件均位于同一 `profileHome(profile)`。

### Oracle

```text
all mutated paths share expected profile root
root profile config changed bytes == 0
```

### Evidence
`TEST-A-CHECK-001`, path-resolution.json

---

## A-MIGRATE-001 — Legacy Provider Migration

### Requirement Refs
`REQ-MIGRATE-001`

### Given
legacy `custom_providers: localhost` + legacy model row。

### When
执行 migration。

### Then
创建唯一 ProviderRef 并迁移 model。

### Oracle

```text
canonical provider count == 1
model.providerRef == expected
legacy entry deleted count == 0
```

### Evidence
`TEST-A-MIGRATE-001`, migration-report.json

---

## A-MIGRATE-002 — Legacy Session Lazy Migration

### Requirement Refs
`REQ-MIGRATE-002`

### Given
legacy session `provider=custom, base_url=X`，X 唯一对应 Provider。

### When
恢复 Session。

### Then
providerRef 写回并使用 canonical route。

### Oracle

```text
migrationStatus == "migrated"
providerRef != ""
network bare-custom requests == 0
```

### Evidence
`TEST-A-MIGRATE-002`, session-migration-report.json`

---

## A-TXN-001 — Provider Save 原子成功

### Requirement Refs
`REQ-TXN-001`, `REQ-PROJ-001`

### Given
有效 Provider input。

### When
save transaction 成功。

### Then
Registry 与 projection 均存在且一致。

### Oracle

```text
registry_match == true
projection_match == true
```

### Evidence
`TEST-A-TXN-001`, pre/post digest

---

## A-TXN-002 — Provider Save 失败回滚

### Requirement Refs
`REQ-TXN-001`

### Given
在 Registry commit 后注入 config write failure。

### When
transaction 执行。

### Then
managed scope 回滚至 T0。

### Oracle

```text
post_rollback_digest == T0_digest
returned status == FAIL
error == PROVIDER_SAVE_TRANSACTION_FAILED
```

### Evidence
`TEST-A-TXN-002`, rollback evidence

---

## A-SEC-001 — Secret Containment

### Requirement Refs
`REQ-SEC-001`, `REQ-DATA-001`

### Given
有效 secret。

### When
Provider/Model/Session 全流程执行。

### Then
Secret 只在批准的 store 中出现。

### Oracle

```text
providers.json occurrences == 0
models.json occurrences == 0
session DB occurrences == 0
config model.api_key created == false
```

### Evidence
`TEST-A-SEC-001`, secret-scan.json

---

## A-OBS-001 — Route Evidence 可定位

### Requirement Refs
`REQ-OBS-001`

### Given
一次 canonical send 和一次 forced legacy recovery fixture。

### When
执行 routing。

### Then
日志可区分 strategy 且不含 token。

### Oracle

```text
canonical.strategy == "named-config"
legacy.event_code == "LEGACY_PROVIDER_RECOVERY_USED"
secret_occurrences == 0
```

### Evidence
`TEST-A-OBS-001`, routing-events.jsonl

---

## A-COMPAT-001 — 迁移记录一次，正常路径不再猜测

### Requirement Refs
`REQ-API-003`, `REQ-MIGRATE-002`, D-02, D-07

### Given
旧 Session 无 ProviderRef，但迁移模块能用 baseURL 唯一匹配到一个 Provider。

### When
用户在 Dashboard 上发送该 Session 的消息。

### Then
迁移事件记录一次恢复；发送使用 named-config。之后同一 Session 的正常路径不再做 baseURL 恢复。

### Oracle

```text
migration.recovery_recorded == 1
post_session.providerRef != null
dashboard_send.strategy == "named-config"
dashboard_normal_path.heuristic_count == 0
```

### Evidence
`TEST-A-COMPAT-001`

---

## A-GOLDEN-001 — Real-world NEW-API 401 回归

### Requirement Refs
`REQ-API-002`, `REQ-SEC-001`

### Given
Golden Consumer：
- smc-copilot branch baseline compatible build；
- Hermes Agent v0.21.0；
- named enterprise OpenAI-compatible Provider；
- valid redacted API Key；
- model `deepseek-v4-flash` 或等价可用模型。

### When
1. Provider Settings 保存 Provider；
2. Chat 选择该模型；
3. Legacy Gateway 发送消息；
4. Dashboard transport 发送消息；
5. 恢复同一 Session 后再次发送。

### Then
两 transport 与 resumed session 都使用同一 named-config 路由。

### Oracle

身份门禁必须 PASS 才可合入：

```text
all resolved ProviderRef equal
all resolved HermesProvider equal
bare-custom canonical request count == 0
strategy == "named-config"
```

上游结果单独判定（D-10）：

```text
HTTP 401 == FAIL
unreachable 或非 401 的上游错误 == BLOCKED
BLOCKED 不得把已 PASS 的身份断言改成 FAIL
BLOCKED 不得记成上游全量 PASS
```

### Evidence
`TEST-A-GOLDEN-001`, redacted runtime trace + HTTP status evidence

---

# 21. Acceptance Input Matrix

| Case | Provider State | Model State | Session State | Profile | Expected |
|---|---|---|---|---|---|
| 1 | new named | new | new | default | canonical PASS |
| 2 | new named | new | new | named | canonical PASS |
| 3 | legacy custom_provider | legacy custom+label | new | default | migrate PASS |
| 4 | legacy custom_provider | legacy | legacy custom+URL | default | lazy migrate PASS |
| 5 | two providers same URL | legacy | legacy custom+URL | default | BLOCK ambiguous |
| 6 | provider registry exists, projection missing | canonical | canonical | default | DRIFT/BLOCK apply |
| 7 | config projection exists, registry missing | legacy/external | none | default | import/migration or PRESERVE |
| 8 | wrong profile env | canonical | canonical | named | BLOCK scope mismatch |
| 9 | secret missing | canonical | canonical | default | credential error, no bare custom fallback |
| 10 | valid secret | canonical | canonical | default | HTTP non-401 |
| 11 | Dashboard unavailable | canonical | canonical | local/remote | Gateway uses same resolver |
| 12 | legacy Session ambiguous | canonical registry | legacy session | default | no network send |
| 13 | rename displayName | canonical | canonical | default | ProviderRef unchanged |
| 14 | duplicate providerKey | create | none | default | 0 mutation |
| 15 | config write failure | save | none | default | rollback T0 |

---

# 22. Negative Acceptance

## A-NEG-001 — Named Provider 不得持久化为 bare custom

```text
Given named ProviderRef
When new Model/Session is persisted
Then provider identity != bare custom
Oracle: canonical bare-custom rows == 0
```

## A-NEG-002 — Unresolved Session 不得发送

```text
Given legacy Session maps to multiple ProviderRecords
When user sends message
Then network request count == 0
Error == SESSION_PROVIDER_UNRESOLVED
```

## A-NEG-003 — BaseURL 不得覆盖 ProviderRef

```text
Given ProviderRef A and malicious/stale baseURL of B
When Resolver runs
Then route remains A or BLOCK
MUST NOT resolve to B solely by baseURL
```

## A-NEG-004 — Cross-profile write 禁止

```text
Given desktop profile P1 and env HERMES_PROFILE=P2
When Provider save runs
Then P2 managed files changed bytes == 0
Error == PROFILE_SCOPE_MISMATCH when conflict is material
```

## A-NEG-005 — Unknown legacy content 不得删除

```text
Given custom_providers entry with no ownership proof
When migration runs
Then entry remains byte/semantic present
```

## A-NEG-006 — Secret 不得复制到 model.api_key

```text
Given valid .env credential
When active model is selected
Then config.yaml model.api_key MUST NOT be created by this feature
```

---

# 23. Failure Injection

| Injection Point | Requirement | Expected Postcondition |
|---|---|---|
| before first Provider write | REQ-TXN-001 | 0 mutation |
| after providers.json write | REQ-TXN-001 | rollback to T0 |
| before config projection rename/commit | REQ-TXN-001 | rollback to T0 |
| after config projection write, before verify | REQ-TXN-001 | verify or rollback |
| during rollback | REQ-TXN-001 | recovery backup retained + `PROVIDER_SAVE_ROLLBACK_FAILED` |
| during legacy model migration | REQ-MIGRATE-001 | original legacy state preserved |
| during session migration write | REQ-MIGRATE-002 | legacy row remains readable |
| resolver returns missing provider | REQ-API-001 | 0 network |
| Dashboard switch fails | REQ-API-003 | prompt not sent under wrong provider |
| secret store write fails | REQ-SEC-001 | no secret duplicated elsewhere |

---

# 24. Evidence Contract

每个 Evidence 必须包含：

```json
{
  "acceptance_id": "A-API-002",
  "status": "PASS",
  "requirement_ids": ["REQ-API-002"],
  "test_ids": ["TEST-A-API-002"],
  "repo": "loudon84/smc-copilot",
  "commit_sha": "<implementation commit>",
  "branch": "<implementation branch>",
  "timestamp": "<ISO-8601>",
  "tool_version": "<test runner version>",
  "command": "<exact command>",
  "exit_code": 0,
  "oracle": {
    "type": "structured_assertion",
    "expected": {},
    "actual": {}
  },
  "evidence_files": []
}
```

Evidence MUST NOT 包含：

```text
API Key
Bearer token
unredacted credential pool
```

---

# 25. Release Gate

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
```

A-GOLDEN-001 按 D-10 拆开：

```text
身份与路由断言非 PASS → release process exit != 0
上游 HTTP 401 → release process exit != 0
上游不可达或非 401 上游错误 → 记 BLOCKED，不得把身份断言改成 FAIL，也不得写成上游全量 PASS
```

Required Acceptance：

```text
A-STATE-001
A-DATA-001
A-DATA-002
A-DATA-003
A-PROJ-001
A-API-001
A-API-002
A-API-003
A-CHECK-001
A-MIGRATE-001
A-MIGRATE-002
A-TXN-001
A-TXN-002
A-SEC-001
A-OBS-001
A-COMPAT-001
A-GOLDEN-001
A-NEG-001
A-NEG-002
A-NEG-003
A-NEG-004
A-NEG-005
A-NEG-006
```

任意 Required Acceptance：

```text
status != PASS
→ Release Gate FAIL
→ process exit != 0
```

---

# 26. Golden Consumer / Real-world Acceptance

Golden Consumer：

```text
repo: loudon84/smc-copilot
baseline HEAD: 027e73278eb44a2333224521ec5b44ca78c3ecde
runtime: Hermes Agent v0.21.0
Hermes commit: 29112bef099274229cadff79cdff7bf7b99c4b77
OS: Windows enterprise desktop
upstream: internal NEW-API OpenAI-compatible /v1
provider type: named custom provider with key_env
```

Golden Consumer Evidence MUST 记录：

```text
implementation repo SHA
clean/dirty
profile
before provider registry snapshot
before config projection snapshot
before session override snapshot
after snapshots
resolved ProviderRef
resolved HermesProvider
transport
HTTP status
secret scan result
```

Synthetic fixture MUST NOT 替代 Golden Consumer。

---

# 27. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test | Evidence | Release Gate |
|---|---|---|---|---|---|
| REQ-STATE-001 | INV-STATE-001/002 | A-STATE-001, A-NEG-001 | TEST-A-STATE-001 | EVID-A-STATE-001 | REQUIRED |
| REQ-DATA-001 | INV-DATA-001 | A-DATA-001, A-SEC-001 | TEST-A-DATA-001 | EVID-A-DATA-001 | REQUIRED |
| REQ-DATA-002 | INV-DATA-002 | A-DATA-002 | TEST-A-DATA-002 | EVID-A-DATA-002 | REQUIRED |
| REQ-DATA-003 | INV-DATA-003 | A-DATA-003, A-NEG-002 | TEST-A-DATA-003 | EVID-A-DATA-003 | REQUIRED |
| REQ-PROJ-001 | INV-PROJ-001 | A-PROJ-001, A-TXN-001 | TEST-A-PROJ-001 | EVID-A-PROJ-001 | REQUIRED |
| REQ-API-001 | INV-API-001 | A-API-001, A-NEG-003 | TEST-A-API-001 | EVID-A-API-001 | REQUIRED |
| REQ-API-002 | INV-API-002 | A-API-002, A-GOLDEN-001 | TEST-A-API-002 | EVID-A-API-002 | REQUIRED |
| REQ-API-003 | INV-API-003 | A-API-003, A-COMPAT-001 | TEST-A-API-003 | EVID-A-API-003 | REQUIRED |
| REQ-CHECK-001 | INV-CHECK-001 | A-CHECK-001, A-NEG-004 | TEST-A-CHECK-001 | EVID-A-CHECK-001 | REQUIRED |
| REQ-MIGRATE-001 | INV-MIGRATE-001 | A-MIGRATE-001, A-NEG-005 | TEST-A-MIGRATE-001 | EVID-A-MIGRATE-001 | REQUIRED |
| REQ-MIGRATE-002 | INV-MIGRATE-002 | A-MIGRATE-002, A-NEG-002 | TEST-A-MIGRATE-002 | EVID-A-MIGRATE-002 | REQUIRED |
| REQ-TXN-001 | INV-TXN-001 | A-TXN-001, A-TXN-002 | TEST-A-TXN-001/002 | EVID-A-TXN | REQUIRED |
| REQ-SEC-001 | INV-SEC-001 | A-SEC-001, A-NEG-006 | TEST-A-SEC-001 | EVID-A-SEC-001 | REQUIRED |
| REQ-OBS-001 | INV-OBS-001 | A-OBS-001 | TEST-A-OBS-001 | EVID-A-OBS-001 | REQUIRED |

---

# 28. Plan Generation Contract

当前：

```text
status = APPROVED_FOR_PLAN
```

因此允许生成正式 implementation `.plan.md`。Plan 仍不得改变 §2.1 已冻结的契约。

## 28.1 Semantic Gap Check

Plan 前必须确认：

```text
- ProviderRef grammar 已冻结。
- providerKey immutable 规则已冻结。
- Runtime Provider Resolver output contract 已冻结。
- legacy recovery 优先级已冻结。
- profile scope precedence 已冻结。
- compatibility removal version 已冻结。
```

本文以上语义均已定义；评审如修改任何一项，MUST 更新 version。

## 28.2 Requirement Coverage Check

每个 Requirement 已定义：

```text
ID
MUST/MUST NOT
Failure
Acceptance
Oracle
Evidence
```

## 28.3 Side Effect Check

所有 mutation：

```text
有允许范围
有禁止范围
```

## 28.4 State Authority Check

所有持久状态已定义 SOT。

## 28.5 Failure-path Check

transaction/migration/recovery 均有 failure acceptance。

---

# 29. `.plan.md` 输出标准

后续 Plan 每个 Todo MUST 使用：

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

status：

```text
planned
implemented
verified
blocked
```

禁止：

```text
代码写完 → verified
测试文件存在 → verified
```

只有对应 Acceptance 有执行 Evidence 才能 `verified`。

---

# 30. Code Review Contract

Review 顺序：

```text
1. ProviderRef 是否贯穿全链路
2. 是否仍存在新写入 bare custom identity
3. Provider Registry / Model / Session SOT 是否一致
4. Gateway 与 Dashboard 是否使用同一 Resolver
5. 是否存在 baseUrl normal-path identity guessing
6. Secret 是否越界
7. profile scope 是否明确
8. legacy migration 是否 non-destructive
9. transaction rollback 是否满足 T0
10. Acceptance/Evidence 是否真实执行
11. compatibility recovery 是否仅发生在 legacy path
12. code quality
```

---

# 31. PRD Quality Gate

## Architecture

```text
[x] Goal 唯一明确
[x] Scope / Non-goal 完整
[x] Owner 不重叠
[x] System Boundary 明确
```

## State

```text
[x] 所有持久状态有 SOT
[x] Desired / Observed / Resolved / Applied 分离
[x] State transition 明确
```

## Semantics

```text
[x] default 行为明确
[x] optional / required 语义明确
[x] conflict 行为明确
[x] ownership 明确
[x] identity scope 明确
```

## Side Effects

```text
[x] 每个 operation 有 mutation contract
[x] read-only resolve 可证明 read-only
```

## Failure

```text
[x] 每个 failure 有 error code
[x] rollback 有 postcondition
[x] rollback failure 有恢复方案
[x] retryable / non-retryable 已区分
```

## Acceptance

```text
[x] 每个 MUST 有 AC
[x] 每个 MUST NOT 有 Negative AC
[x] transaction 有 failure injection
[x] 高风险需求有输入矩阵
[x] Oracle 可机器判断
```

## Evidence

```text
[x] 每个 required AC 有 Evidence schema
[x] Evidence 绑定 repo commit
[x] BLOCKED/SKIPPED 不算 PASS
[x] Release Gate 与 process exit code 一致
```

## Plan Readiness

```text
[x] 无本文已知 SPEC_SEMANTIC_GAP
[x] 无 TBD
[x] Traceability 完整
[x] PRD status = APPROVED_FOR_PLAN
```

---

# 32. PRD 禁止写法

本项目实施中禁止使用：

```text
“确保 Provider 稳定”
“自动修复 Provider”
“合理 fallback”
“必要时使用 custom”
“无法识别时按 baseURL 猜”
“保存成功但投影失败可忽略”
“升级 Hermes 后自然解决”
“把 key 临时写 config.yaml 即可”
```

必须转换为本文已定义的 ProviderRef、Error Code、0 mutation、rollback、Oracle 与 Evidence。

---

# 33. ID 体系

```text
REQ-STATE-xxx
REQ-DATA-xxx
REQ-PROJ-xxx
REQ-API-xxx
REQ-CHECK-xxx
REQ-MIGRATE-xxx
REQ-TXN-xxx
REQ-SEC-xxx
REQ-OBS-xxx

INV-STATE-xxx
INV-DATA-xxx
INV-API-xxx
INV-TXN-xxx

A-STATE-xxx
A-DATA-xxx
A-API-xxx
A-TXN-xxx
A-NEG-xxx
A-GOLDEN-xxx

TEST-A-xxx
EVID-A-xxx
```

---

# 34. PRD 最小完整结构检查

本文已覆盖：

```text
0. Document Meta
1. Goal
2. Background
3. Scope / Non-goal
4. Architecture Boundary
5. Terminology
6. State / SOT
7. State Machine
8. Schema
9. Requirements
10. Side Effects
11. Ownership
12. Identity / Hash
13. Transaction
14. Failure
15. Conflict
16. Migration
17. Security
18. Observability
19. Acceptance
20. Edge-case Matrix
21. Negative Acceptance
22. Failure Injection
23. Evidence
24. Traceability
25. Release Gate
26. Plan Generation Gate
27. DoD
```

---

# 35. Definition of Done

PRD 进入开发计划前：

```text
[x] 所有 MUST 唯一语义
[x] 所有状态有明确 SOT
[x] 所有 mutation 有 side-effect contract
[x] 所有 ownership 有 scope
[x] Provider identity 有算法与范围
[x] transaction 有 T0 / commit / rollback
[x] rollback failure 有 retention / recovery contract
[x] conflict 有 deterministic behavior
[x] Requirement 有 AC
[x] MUST NOT 有 Negative AC
[x] 高风险 Requirement 有 edge-case matrix
[x] failure semantics 有 failure injection
[x] AC 有 machine-readable Oracle
[x] Required AC 有 Evidence Contract
[x] SKIPPED / BLOCKED 不算 PASS
[x] Release Gate 非 PASS 时 process exit != 0
[x] Synthetic 与 Golden Consumer 职责分开
[x] Requirement Traceability 完整
[x] 无本文已知 SPEC_SEMANTIC_GAP
[x] PRD 状态 = APPROVED_FOR_PLAN
```

Implementation Definition of Done：

```text
[ ] Provider Settings 新建 named provider 后 providers.json 与 config.yaml providers: 一致
[ ] 新 Model 使用 ProviderRef
[ ] 新 Session override 使用 ProviderRef
[ ] Gateway canonical path 不发送 bare custom
[ ] Dashboard canonical path 不执行 baseURL heuristic recovery
[ ] old session 可 deterministic migrate
[ ] ambiguous legacy state BLOCK，0 wrong-route network request
[ ] Secret 未进入 Provider/Model/Session state
[ ] default/named profile 隔离验证 PASS
[ ] Provider save failure injection rollback PASS
[ ] Hermes v0.21.0 身份与路由 Golden 断言 PASS
[ ] 上游若 BLOCKED，发布说明必须写明 Golden upstream = BLOCKED
```

---

# 36. 最终架构原则

```text
1. Provider Identity 必须先于 Runtime Route。
2. Model 只引用 ProviderRef，不复制 Provider endpoint identity。
3. Session 只持久化 ProviderRef + Model，不持久化 secret。
4. baseURL 是 Provider metadata，不是 canonical identity。
5. named secret-backed Provider 正常路径 MUST NOT 降级为 bare custom。
6. Gateway 与 Dashboard MUST 使用同一个 Runtime Provider Resolver。
7. Dashboard heuristic recovery 只允许服务 legacy migration。
8. config.yaml providers: 是 Hermes projection，不是 Desktop Provider Identity SOT。
9. custom_providers: 在 v1.x 只读兼容 / 非破坏迁移，不再作为新架构主写入目标。
10. Provider save success 必须同时代表 Desktop Registry 与 Hermes projection 成功。
11. profile scope 必须显式，不得由 HERMES_PROFILE 隐式跨域。
12. Secret 值只属于 approved secret store。
13. 401 修复不得通过明文 model.api_key 双写完成。
14. Hermes Agent Core 保持零修改；兼容适配由 smc-copilot 承担。
15. NodeDeskClaw Bootstrap 必须在本 Provider Contract 稳定并 Golden Consumer PASS 后再接入。
```
