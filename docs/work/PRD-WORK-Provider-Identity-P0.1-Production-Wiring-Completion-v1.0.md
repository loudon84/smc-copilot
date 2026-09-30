---
title: "smc-copilot Provider Identity P0.1 Production Wiring Completion 方案 PRD"
prd_id: "PRD-WORK-PROVIDER-P0.1-WIRING-001"
version: "1.1"
status: "APPROVED_FOR_PLAN"
product: "smc-copilot / apps/work"
repository: "https://github.com/loudon84/smc-copilot"
branch: "work/prd-v6.2.1"
baseline_commit: "a121b246b7243bb16b33ba1da5e9ec7e0de8cab2"
parent_prd: "docs/work/PRD-WORK-Provider-Identity-Chat-Routing-Stability-v1.0.md"
parent_prd_version: "1.1"
parent_prd_status: "APPROVED_FOR_PLAN"
owner: "smc-copilot Architecture"
reviewers:
  - "Desktop Architecture"
  - "Hermes Runtime"
  - "Chat / Provider Module"
  - "Quality / Release Engineering"
created_at: "2026-09-27"
updated_at: "2026-09-27"
target_release: "work/prd-v6.3"
change_type:
  - "BROWNFIELD_CHANGE"
  - "PRODUCTION_WIRING"
  - "BUGFIX"
  - "MIGRATION"
  - "INTEGRATION"
  - "RELIABILITY"
golden_consumer: "smc-copilot/apps/work + Hermes Agent v0.21.0 + enterprise NEW-API OpenAI-compatible endpoint"
related_docs:
  - "需求PRD工程模板.md v1.0"
  - "PRD-WORK-Provider-Identity-Chat-Routing-Stability-v1.0.md v1.1"
  - ".cursor/plans/provider_identity_routing_03dd872c.plan.md"
  - "P0.1 Production Wiring Completion 源码审查结论（2026-09-27）"
supersedes: null
---

# 0. PRD 使用原则

本文是 **Engineering Contract PRD**，用于收口已批准 Provider Identity v1.1 PRD 在 `work/prd-v6.2.1` 中“核心 Resolver 已实现、真实生产入口仍未完全接线”的剩余缺口。本文不是新的 Provider 架构设计，而是现有契约的 **Production Wiring Completion**。

本文使用以下规范关键词：

- `MUST`：必须实现、必须测试、必须有 Evidence。
- `MUST NOT`：违反即 Requirement FAIL。
- `SHOULD`：默认应满足；偏离必须记录原因并通过评审。
- `SHOULD NOT`：原则上禁止；偏离必须记录明确理由。
- `MAY`：可选，不影响主 Release Gate。
- `BLOCKED`：不是 PASS；表示由于外部依赖或既有基线问题无法完成对应验证。
- `0 mutation`：目标 managed scope 在操作失败后必须与 T0 完全一致。
- `0 model request`：失败路径不得向 Hermes/NEW-API 发出模型请求。

父 PRD v1.1 的 D-01～D-10、ProviderRef、Provider Registry v2、Secret containment、Runtime Provider Resolver、migration、transaction、Golden Consumer 等定义继续有效。本文只补充生产接线、持久化闭环与验证门禁；若本文与父 PRD 发生冲突，除本文明确写明“override parent decision”外，MUST 以父 PRD v1.1 为准。

本文 v1.1 记入 2026-09-27 grilling 决定 `P0.1-D-15`～`P0.1-D-23`。这些决定覆盖本文更早句子中与之冲突的表述。其中只有 `P0.1-D-21` 写明 override parent decision。

## 0.1 No-Inference Rule

```text
如果实现者无法从本文与父 PRD 唯一确定：

- Provider Settings 最终调用哪个 Main writer；
- providers.json v2、.env、config.yaml providers: 的写入所有权；
- ProviderRecordV2 如何进入 Renderer；
- ModelCatalog 如何持久化 ProviderRef；
- ModelPicker 如何把 ProviderRef 传给 Session；
- 新 Session 与 legacy Session 的 ProviderRef 语义；
- Global Active Model 的 canonicalization 规则；
- Gateway / Dashboard local send 是否共享同一 RuntimeProviderRoute；
- migration 是“仅本次 resolve”还是“同一次发送内持久化”；
- Provider save 成功前需要验证哪些 projection semantic；
- Runtime reload 何时必须发生；
- remote / ssh 是否允许改变；
- 失败时是否允许 fallback 到 bare custom；
- Evidence、Golden Consumer 与 Release Gate 的判断方式；

则：

MUST report SPEC_SEMANTIC_GAP
MUST BLOCK implementation plan generation / execution
MUST NOT 自行采用“看起来可用”的兼容写法
MUST NOT 通过增加新的 Store、Provider alias 或 baseURL heuristic 绕开缺口
```

---

# 1. 文档元数据

```yaml
title: smc-copilot Provider Identity P0.1 Production Wiring Completion 方案 PRD
prd_id: PRD-WORK-PROVIDER-P0.1-WIRING-001
version: 1.1
status: APPROVED_FOR_PLAN

product: smc-copilot/apps/work
repository: loudon84/smc-copilot
branch: work/prd-v6.2.1
baseline_commit: a121b246b7243bb16b33ba1da5e9ec7e0de8cab2

parent_prd:
  file: docs/work/PRD-WORK-Provider-Identity-Chat-Routing-Stability-v1.0.md
  effective_version: 1.1
  status: APPROVED_FOR_PLAN

runtime:
  hermes_agent_version: v0.21.0
  hermes_agent_reference_tag: v2026.8.31

target_release: work/prd-v6.3

golden_consumer:
  desktop: smc-copilot/apps/work
  runtime: Hermes Agent v0.21.0
  upstream: enterprise OpenAI-compatible NEW-API

scope_mode:
  local: IN_SCOPE
  remote: FROZEN_NO_CHANGE
  ssh: FROZEN_NO_CHANGE
```

## 1.1 Baseline Snapshot

截至本文 baseline：

```text
work/prd-v6.2.1 HEAD
= a121b246b7243bb16b33ba1da5e9ec7e0de8cab2

latest commit
= feat(work): route local chat through canonical provider identity
```

当前 baseline 已经拥有：

- `provider-identity/provider-ref.ts`
- `provider-identity/runtime-provider-resolver.ts`
- `provider-identity/provider-save-transaction.ts`
- `provider-identity/local-migrate-and-send.ts`
- Provider Registry v2 / migration helpers
- Session override providerRef/migration schema基础
- local Gateway canonical resolver 接入
- local Dashboard canonical resolver 接入
- Golden identity 单元测试骨架

但 baseline 仍存在以下生产 wiring 缺口：

- Provider Settings IPC 仍可走 legacy `upsertCustomProvider()`；
- Renderer/Preload Provider contract 仍以 `name + baseUrl` 为主，未稳定暴露完整 ProviderRecordV2；
- 新增 Model 未保证写入 `providerRef`；
- ModelPicker row / callback 未保证传递 `providerRef`；
- `handleSelectModel()` 创建 Session override 时仍可能只写 `provider + model + baseUrl`；
- legacy Session 的 unique match 可能只用于当前 send route，未保证同一次发送内 persist canonical ProviderRef；
- Global Active Model unique match 未保证 canonical write-back；
- Provider save transaction 对 projection 的 post-write semantic verify 未形成强制 commit gate；
- CI 当前未进入 Typecheck/Test/Build，Provider Identity 代码不能标记为 verified。

---

# 2. 一句话目标

让 `Provider Settings → Provider Registry → Model Catalog → ModelPicker → Session Override → Runtime Resolver → Gateway / Dashboard → Hermes Agent` 全链路从“发送时修复 identity”升级为“创建时即 canonical、迁移后立即持久化、运行时只做 deterministic resolve”，彻底消除 local named provider 在任何正常生产路径中降级为 bare `custom` 的可能。

## 2.1 P0.1 冻结决定

本节是本文最高优先级决策。Plan、代码与 Review MUST 不得改变以下决定。`P0.1-D-15`～`P0.1-D-23` 覆盖本节更早决定及后文中与之冲突的句子。

```text
P0.1-D-01
父 PRD v1.1 的 D-01～D-10 全部继承。
本阶段只处理 connection mode = local。
remote / ssh MUST NOT 改行为、MUST NOT 接入本阶段新 migration/restart 语义。

P0.1-D-02
Provider Settings 的生产保存路径 MUST 最终委托 saveNamedProvider() transaction。
legacy upsertCustomProvider() MAY 保留用于内部兼容读取/迁移，
但 Renderer 正常“新增/修改 Provider”成功结果 MUST NOT 由 legacy writer 产生。

P0.1-D-03
当前 renderer-facing IPC 名称 MAY 继续使用 "upsert-custom-provider" 以降低迁移面，
但其语义 MUST 升级为 ProviderRecordV2 transaction save。
本阶段不要求为了“命名更干净”新增一套并行 IPC。
禁止同时保留两个都可写 Provider Registry 的生产 writer。

P0.1-D-04
Renderer Provider state MUST 持有：
id / providerKey / name / baseUrl / keyEnv / apiMode。
Renderer MUST NOT 持有持久化 secret value。
keyEnv MUST 由 Main transaction 按父 PRD D-03 生成或继承，
Renderer MUST NOT 用 provider display name 自行重新推导 keyEnv。

P0.1-D-05
所有新写入的 named Provider Model MUST 携带：
providerRef = "named:<providerKey>"。
provider/providerLabel/baseUrl MAY 作为兼容/展示字段保留，
但 MUST NOT 再作为正常 routing identity SOT。

P0.1-D-06
ModelPicker 的模型选择契约 MUST 携带 providerRef。
新 Session 的首次模型选择后，SessionModelOverride MUST 立即是 canonical。
MUST NOT 等到第一次 send 才给新 Session 补 ProviderRef。

P0.1-D-07
legacy Session 在 local send 前唯一匹配成功时：
同一次用户发送内 MUST 先持久化 canonical Session ProviderRef，
再 resolve RuntimeProviderRoute，再发模型请求。
持久化失败 → 0 model request。
无法唯一匹配 → SESSION_PROVIDER_UNRESOLVED，0 mutation，0 model request。

P0.1-D-08
无 Session override 时，legacy Global Active Model 唯一匹配成功：
同一次发送内 MUST 把 config.yaml model.provider canonicalize 为 providerKey，
并去掉作为 identity 的 model.base_url。
写回失败 → 0 model request。
无法唯一匹配 → ACTIVE_MODEL_PROVIDER_UNRESOLVED。

P0.1-D-09
Provider save transaction 的 success 必须同时满足：
Provider Registry v2 写入成功；
secret target key 写入成功（如果本次提供 secret）；
providers:<providerKey> projection 写入成功；
重新读取后的 semantic checkProviderProjection() PASS。
仅“写文件函数没有 throw”不能算 success。

P0.1-D-10
local Gateway 与 local Dashboard MUST 消费同一 RuntimeProviderRoute 语义：
named Provider → strategy=named-config；
hermesProvider=providerKey；
正常路径 MUST NOT 使用 bare custom；
正常路径 MUST NOT 使用 custom:<name>；
正常路径 MUST NOT 用 baseURL 猜 provider。

P0.1-D-11
baseURL/providerLabel/custom_providers 匹配只允许存在于明确标记的 legacy migration compatibility layer。
一旦 migration 成功，后续 Session/Model 正常读 MUST 直接使用 ProviderRef，
不得持续每次发送重新猜 identity。

P0.1-D-12
在 P0.1 Golden Consumer 与 Release Gate 未满足前，
MUST NOT 进入 NodeDeskClaw Bootstrap 的 Provider 自动下发实施。
否则会把当前 lossy identity contract 扩散到新的企业 Provider provisioning 链。

P0.1-D-13
不通过将真实 API Key 写入 config.yaml model.api_key 解决本阶段问题。
Secret value 只允许存在于父 PRD批准的 secret store（当前为 profile .env）。
日志、models.json、providers.json、Session DB、Evidence MUST NOT 保存明文 secret。

P0.1-D-14
当前 Work CI 的 legacy-runtime Guard false positive 与 SMC Governance bootstrap 缺失
属于 baseline verification blocker，不得伪装为 Provider Requirement PASS。
它们 MAY 独立修复，但 Provider 功能只有实际执行 Typecheck/Test/Build/Golden 后才可 verified。

P0.1-D-15
providerKey 生成算法冻结为当前 generateProviderKey()：
NFKC、trim、lowercase；
空白与非法字符变为 "-"；
折叠并去掉首尾分隔符；
最长 64；
名称为空 → custom-<recordId 的 hex 前 12 位，不足补 0>；
与已有 providerKey 冲突 → PROVIDER_KEY_CONFLICT，0 mutation。
禁止用后缀自动避让。
display name 修改不得重新生成 providerKey。

P0.1-D-16
listCustomProviders() 这一次调用 MUST 是 0 mutation：
MUST NOT 写 providers.json；
MUST NOT 写 .env；
MUST NOT 写 config.yaml；
MUST NOT 重启 Gateway。
import-on-list MUST NOT 通过 upsertCustomProviderRecordOnly() 成功写入 Registry。
从 config.yaml 收口进 Registry，只允许发生在 Settings 的 saveNamedProvider()，
或同一次发送里按 P0.1-D-23 允许的 transaction 补齐。

P0.1-D-17
removeCustomProvider() 行为冻结，本阶段不改。
这是已知缺口：P0.1 不增加 projection 清理，也不收紧 custom_providers 删除条件。
见 4.4。

P0.1-D-18
Model catalog 按显式 profile 分文件。
default profile：Hermes Root models.json。
named profile：该 profile 的 profileHome/models.json。
Settings 的 model 增删改查与本地 ModelPicker MUST 读写同一份当前显式 profile catalog。
named profile MUST NOT 把 providerRef 写入 Root models.json。
named profile MUST NOT 复制 Root catalog。
该 profile 的 catalog 文件不存在时，允许一次性 seedDefaults。
seed 出的 builtin 行按 P0.1-D-20 写 builtin:<canonicalSlug>。

P0.1-D-19
catalog 文件已存在时，读取只允许写该行尚不存在的 providerRef。
providerRef 已存在则 MUST NOT 改写该行。
MUST NOT 插入新行。
MUST NOT 调用 syncAgentConfigModels()。
MUST NOT 写 .env、providers.json、config.yaml。
MUST NOT 在 catalog 读取中调用 saveNamedProvider() 或重启 Gateway。

P0.1-D-20
catalog 读取写下 providerRef 的条件：
唯一匹配落到当前显式 profile 已存在的 ProviderRecord
→ providerRef = named:<providerKey>；
或 provider 字符串属于 pinned Hermes Agent v0.21.0
（reference tag v2026.8.31）hermes_cli/models.py 的 CANONICAL_PROVIDERS，
或该文件将此字符串 alias 到的 canonical slug
→ providerRef = builtin:<canonicalSlug>。
PROVIDER_BASE_URLS MUST NOT 作为身份闭集。
否则该行保持原样，可见但不可选。
用户点击不可选行 → MODEL_PROVIDER_UNRESOLVED，
0 次 Session 写入，0 model request。
已写下但在当前 profile 无法解析的 providerRef 同样不可选，且 MUST NOT 清除或改写。
0 个或多于 1 个候选项不做消歧。
Registry 新建只发生在 Settings 的 saveNamedProvider()，
或 P0.1-D-23 发送事务的补齐。

P0.1-D-21
override parent decision：
父 PRD work.model-record.v2 的 additionalProperties: false
不在 P0.1 删除 model 行上的 provider、providerLabel、baseUrl。
这些字段只做展示和迁移匹配。
路由只读 providerRef。
Session 行不 override 父 schema。
Session 持久化字段为 providerRef、model、legacyProvider、legacyBaseUrl、
migrationStatus = canonical | migrated | unresolved。

P0.1-D-22
本地 ModelPicker 只列出当前显式 profile catalog 中的行。
listConfiguredAgentModels() 不得作为本地 Picker 的身份来源，
也不得在本地 Picker 读取时把库镜像进 custom_providers。
只存在于 custom_providers 或 model.default、而 catalog 没有对应行的模型，
不出现在本地 Picker。
已经打开的 legacy Session 与 legacy Global Active Model
仍按 P0.1-D-23 在发送时迁移。

P0.1-D-23
同一次 local 发送的顺序 MUST 为：
唯一匹配，否则 0 mutation、0 model request
→ 用 saveNamedProvider() transaction 补齐 Registry 与 providers:<providerKey> 投影；
  补齐失败则只回滚这次补齐，0 model request
→ 持久化 Session providerRef，或把 model.provider 写成 providerKey 并去掉作为身份的 base_url
→ 若本次写入了投影或目标 keyEnv，且当前 Gateway 不是在该投影成功启动之后启动的，则重启本 profile Runtime
→ resolve RuntimeProviderRoute
→ 发送。
重启失败：保留已提交的 Registry、投影，以及已经写上的 canonical identity；
返回 PROVIDER_RUNTIME_RELOAD_FAILED；0 model request。
下一次发送走 canonical resolve，不得再次做 baseURL 匹配。
本文 §8.3、§8.4、§8.5 与 REQ-MIG-001 的顺序以本决定为准。
P0.1-D-07 里“先持久化再 resolve”指持久化发生在 resolve 与发送之前，
不表示持久化可以发生在 Registry/投影补齐之前。
```

---

# 3. 背景与问题定义

## 3.1 已完成能力

本阶段不是从零设计。baseline 已经解决了最危险的一部分：local send 之前可以通过 canonical resolver 阻止 named provider 直接作为 bare `custom` 发给 Hermes。

已经具备：

```text
ProviderRef
  builtin:<slug>
  named:<providerKey>

RuntimeProviderRoute
  strategy = builtin | named-config

local Gateway:
  send → resolver → hermesProvider

local Dashboard:
  send → resolver → hermesProvider
```

因此：

```text
"custom + explicit baseUrl"
→ Hermes direct-alias
→ key_env ignored
→ 401
```

这条最初故障路径已经有 runtime-side 防护。

## 3.2 P0.1 核心问题

当前实现仍然大量依赖：

```text
创建/选择时：
Provider identity 被压平
    ↓
发送时：
再恢复 Provider identity
```

这意味着 canonical identity 尚未成为 end-to-end data contract。

### P0.1-P1 — Provider Save Writer Split-Brain

当前系统同时存在：

```text
legacy:
providers-store.ts
  upsertCustomProvider()

new:
provider-identity/provider-save-transaction.ts
  saveNamedProvider()
```

如果正常 Provider Settings 仍调用 legacy writer：

```text
providers.json 保存成功
      ↓
config.yaml providers: mirror best-effort
      ↓
mirror failure 被吞掉
      ↓
UI 仍认为保存成功
```

则父 PRD `REQ-DATA / REQ-PROJ / REQ-TXN` 没有生产闭环。

### P0.1-P2 — Model Catalog ProviderRef Optionality

Model schema 已出现 `providerRef?: string`，但新 named Provider Model 的生产写入仍可能只保存：

```text
provider=custom
providerLabel=<display name>
baseUrl=<endpoint>
```

因此 ProviderRef 仍不是 Model identity SOT。

### P0.1-P3 — Picker Contract 丢失 ProviderRef

ModelPicker 当前选择接口仍以：

```text
provider
model
baseUrl
```

为核心参数。

只要 picker row 没有 providerRef，Session 层就无法天然 canonical。

### P0.1-P4 — New Session 仍可能先产生 Legacy Override

当前 Session override 可支持 providerRef，但新选择逻辑可能仍写：

```json
{
  "provider": "custom",
  "model": "deepseek-v4-flash",
  "baseUrl": "..."
}
```

这会迫使第一次 send 继续做 identity recovery。

### P0.1-P5 — Lazy Migration 可能没有持久化闭环

如果 legacy Session 在每次 send 都：

```text
provider=custom + baseUrl
      ↓
unique match
      ↓
route named-config
```

但没有写回：

```text
providerRef=named:<providerKey>
```

则系统仍处于长期 heuristic mode，不符合父 PRD D-07。

### P0.1-P6 — Global Active Model 未完成 Canonical Write-back

如果 `config.yaml model:` 仍长期保存：

```yaml
provider: custom
base_url: https://...
```

每次 send 仍需要 migration lookup，不符合父 PRD D-08。

### P0.1-P7 — Projection Verify 不足

Provider save transaction 若只验证：

```text
write function returned
```

而没有重新读取：

```text
providers:<providerKey>
```

确认 `base_url / key_env / api_mode` 等语义一致，则仍可能产生 committed split-brain。

### P0.1-P8 — Verification Gate 尚未执行

当前 baseline Work CI：

```text
Install      PASS
Guard        FAIL
Typecheck    SKIPPED
Test         SKIPPED
Build        SKIPPED
```

Guard failure 是 baseline 已存在的 `hermes-agent/venv` literal 检查问题，并非 Provider commit 引入；但 Provider Identity 新代码仍然没有 CI Evidence，不能标记为 verified。

## 3.3 Impact

```text
业务：
- 用户仍可能依赖“第一次 send repair”而不是稳定模型绑定。
- 恢复历史 Session 后身份可能重复推断。
- Provider 编辑成功仍可能不等价于 Hermes projection 可用。

工程：
- 新旧 writer 并存。
- providerRef 是 optional 而非 end-to-end mandatory contract。
- Renderer/Main/Session/Model 对 Provider identity 的数据模型不统一。
- Resolver 承担了本应在创建/迁移阶段完成的数据修复。

可靠性：
- transaction success 与 runtime usable state 仍可能不完全等价。
- migration 不持久化会增加长期 drift surface。

安全：
- 如果继续用 config.yaml model.api_key workaround，Secret 会双写。
- lossy identity 可能增加 wrong credential / wrong endpoint 的风险。

扩展：
- NodeDeskClaw Bootstrap 若现在接入，会继续生成 legacy custom+baseUrl 模型绑定。
```

---

# 4. Scope

## 4.1 In Scope

```text
SCOPE-P01-001 Provider Settings production writer 接入 saveNamedProvider()
SCOPE-P01-002 Provider renderer/preload/Main contract 升级到 ProviderRecordV2
SCOPE-P01-003 Provider save post-write projection semantic verification
SCOPE-P01-004 Model Catalog 新写入强制 ProviderRef
SCOPE-P01-005 ModelPicker row/callback 传递 ProviderRef
SCOPE-P01-006 新 Session override 首次即 canonical
SCOPE-P01-007 legacy Session same-send lazy migration + persistence
SCOPE-P01-008 Global Active Model same-send lazy migration + persistence
SCOPE-P01-009 local Gateway/Dashboard route parity
SCOPE-P01-010 runtime reload / no-request failure semantics
SCOPE-P01-011 profile-scoped consistency
SCOPE-P01-012 secret containment
SCOPE-P01-013 compatibility layer 收敛
SCOPE-P01-014 test / evidence / Golden Consumer / release gate
SCOPE-P01-015 baseline verification blocker 的显式分类与记录
```

## 4.2 Out of Scope

```text
NON-GOAL-P01-001 MUST NOT 修改 Hermes Agent Core。
NON-GOAL-P01-002 MUST NOT 修改 NEW-API token/auth。
NON-GOAL-P01-003 MUST NOT 实现 NodeDeskClaw Bootstrap。
NON-GOAL-P01-004 MUST NOT 改 remote / ssh Chat provider routing。
NON-GOAL-P01-005 MUST NOT 合并 Gateway 与 Dashboard transport。
NON-GOAL-P01-006 MUST NOT 创建第三套 Provider Registry。
NON-GOAL-P01-007 MUST NOT 把 config.yaml custom_providers: 重新定义为 SOT。
NON-GOAL-P01-008 MUST NOT 把 baseUrl 重新定义为 Provider identity。
NON-GOAL-P01-009 MUST NOT 删除无法证明 ownership 的 custom_providers/providers entry。
NON-GOAL-P01-010 MUST NOT 为本阶段引入 Provider 消歧 UI。
NON-GOAL-P01-011 MUST NOT 改 Knowledge Chat 业务语义。
NON-GOAL-P01-012 MUST NOT 改打包 bake-in / electron-builder hard controls。
NON-GOAL-P01-013 MUST NOT 把 API Key 写入 providers.json/models.json/session DB/Evidence。
NON-GOAL-P01-014 MUST NOT 用“升级 Hermes”替代 Desktop contract 修复。
```

## 4.4 Known Gap

```text
KNOWN-GAP-P01-001
removeCustomProvider() 在 P0.1 冻结，行为保持现状。
本阶段不增加 Desktop-owned projection 的删除事务，
也不收紧 custom_providers 的删除条件。
见 P0.1-D-17。
后续阶段才允许把删除收进唯一 production writer 与 semantic verify。
```

## 4.3 Initial Implementation Surface

以下文件/符号属于当前确认的最小影响面。Plan MUST 再做精确 symbol-level impact analysis，但不得绕开这些生产入口。

| Area | Current File / Surface | P0.1 目标 |
|---|---|---|
| Provider store | `apps/work/src/main/providers-store.ts` | legacy writer 降为 compatibility；不再作为正常 Settings save owner |
| Save transaction | `apps/work/src/main/provider-identity/provider-save-transaction.ts` | 成为 Provider save production owner |
| Projection | `apps/work/src/main/agent-config-providers.ts` | post-write semantic verify |
| Main IPC | `apps/work/src/main/*` IPC registration | `upsert-custom-provider` 委托 transaction |
| Preload | `apps/work/src/preload/*` | 返回完整 ProviderRecordV2；输入不泄露 secret |
| Provider UI | `apps/work/src/renderer/src/screens/Providers/*` | 保存完整 Provider identity metadata |
| Model store | `apps/work/src/main/models.ts` | 按显式 profile 读写 catalog；新 named model 强制 providerRef；读取只补尚不存在的 providerRef |
| Chat model config | `apps/work/src/renderer/src/screens/Chat/hooks/useModelConfig.ts` | 本地 Picker 读取当前 profile catalog，可选项带可解析的 providerRef |
| Chat types | `apps/work/src/renderer/src/screens/Chat/types.ts` | ModelGroup model 带 providerRef |
| Chat screen | `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | session selection 写 canonical override |
| Session store | `apps/work/src/main/session-model-override-store.ts` | same-send migration persistence |
| Local orchestrator | `apps/work/src/main/provider-identity/local-migrate-and-send.ts` | migration + persist + resolve + reload sequencing |
| Legacy Gateway | `apps/work/src/main/hermes.ts` | 只消费 resolved route |
| Dashboard | `apps/work/src/renderer/src/screens/Chat/hooks/useDashboardChatTransport.ts` | local 不再 heuristic identity repair |
| Runtime | `apps/work/src/main/runtime/*` | 必要时同 profile restart |
| Tests | `apps/work/src/main/provider-identity/*.test.ts` + related tests | 从纯 resolver test 扩展到生产 wiring contract |

---

# 5. Terminology / Domain Model

```text
ProviderRecordV2
  Desktop named Provider 的 canonical metadata。
  authority = providers.json v2。

ProviderRef
  Desktop 内部 canonical provider identity。
  builtin:<slug>
  named:<providerKey>

providerKey
  named Provider 的稳定 routing key。
  创建后 immutable。
  displayName 修改不得改变 providerKey。

keyEnv
  指向 secret store 中 credential value 的环境变量名。
  不是 secret value。
  authority = ProviderRecordV2 / inherited config key_env。

ModelBinding
  model 与 ProviderRef 的关系。
  对 named Provider，新写入必须有 providerRef。

SessionModelOverrideV2
  Session 级 model + ProviderRef。
  新写入必须 canonical。
  legacy row 可临时没有 ProviderRef，等待 migration。

GlobalActiveModel
  config.yaml model: 中 Hermes 当前默认模型。
  canonical named provider 通过 providerKey 表达。

RuntimeProviderRoute
  send 前由 resolver 生成的 runtime route。
  strategy 仅 builtin | named-config。

LegacyIdentityTuple
  provider/providerLabel/baseUrl/custom_providers 等旧信息。
  只允许 migration layer 读取，不允许成为正常 routing SOT。

Production Writer
  对某类 authoritative state 唯一拥有正常 mutation 权限的代码路径。

Compatibility Writer
  仅用于旧版本兼容、恢复或明确 migration；不能承担正常 UI save。

Semantic Projection Verify
  写入 config.yaml providers:<providerKey> 后重新读取并比较 managed fields，
  而不是仅判断写文件函数是否返回。
```

---

# 6. System Context

## 6.1 Current vs Target

### Current residual path

```text
Provider Settings
      │
      ├── legacy upsertCustomProvider()
      │        │
      │        ├── providers.json
      │        └── best-effort config mirror
      │
      ▼
Model Catalog
 provider=custom
 baseUrl=...
 providerRef? optional
      │
      ▼
ModelPicker
 provider/model/baseUrl
      │
      ▼
Session override
 provider=custom
 baseUrl=...
 providerRef? maybe absent
      │
      ▼
send-time identity recovery
      │
      ▼
Runtime Resolver
```

### Target path

```text
Provider Settings
      │
      ▼
saveNamedProvider()
      │
      ├── providers.json v2
      ├── profile .env
      └── config.yaml providers:<providerKey>
                 │
                 └── semantic verify
      │
      ▼
ProviderRecordV2
      │
      ▼
Model Catalog
 providerRef=named:<providerKey>
      │
      ▼
ModelPicker
 providerRef + model
      │
      ▼
SessionModelOverrideV2
 providerRef=named:<providerKey>
      │
      ▼
Runtime Provider Resolver
      │
      ├─────────────┐
      ▼             ▼
Gateway /v1    Dashboard /api/ws
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
Inside P0.1 boundary:
- apps/work Renderer
- apps/work Preload
- apps/work Main
- providers.json
- profile .env
- config.yaml providers:
- config.yaml model:
- models.json
- Session override SQLite state
- local Gateway request construction
- local Dashboard model switch
- RuntimeManager local restart
- Work tests / evidence

Outside boundary:
- Hermes Agent Core implementation
- NEW-API server auth implementation
- NodeDeskClaw backend provisioning
- remote / ssh routing
- enterprise packaging design
```

---

# 7. Authoritative State / Source of Truth

| State | Role | Type | Authoritative? | Production Writer | Reader | Routing SOT? |
|---|---|---|---:|---|---|---:|
| `providers.json` v2 | named Provider Registry | DESIRED_STATE | YES | `saveNamedProvider()` | Settings/Resolver | YES |
| profile `.env` | secret value | SECRET_STATE | YES | transaction credential step | Hermes/runtime | secret only |
| `config.yaml providers:` | Hermes runtime projection | APPLIED_STATE | NO | projection writer | Hermes | NO |
| profile catalog `providerRef` | Model→Provider identity | DESIRED_STATE | YES for model binding | model writer | ModelPicker / Settings | YES |
| `provider/providerLabel/baseUrl` in model | legacy/display metadata | COMPAT_STATE | NO | model compatibility writer | UI/migration | NO |
| Session override `providerRef` | session model identity | DESIRED_STATE | YES | session store | Chat/Resolver | YES |
| Session legacy provider/baseUrl | migration snapshot | COMPAT_STATE | NO | migration only | migration | NO |
| `config.yaml model.provider` | Hermes global active provider | APPLIED_ACTIVE_STATE | YES for active Hermes default | active-model writer | Hermes/Desktop | YES after canonicalization |
| `config.yaml model.base_url` | legacy active identity | COMPAT_STATE | NO | migration cleanup only | migration | NO |
| `custom_providers:` | legacy Hermes custom list | COMPAT_SOURCE | NO | legacy/user | migration/import | NO |
| Dashboard `model.options` | runtime view | OBSERVED_STATE | NO | Hermes | remote/compat only | NO |
| RuntimeProviderRoute | ephemeral route | DERIVED_STATE | NO | Resolver | Gateway/Dashboard | execution only |
| Evidence artifacts | verification | EVIDENCE | NO | tests/acceptance | Review/CI | NO |

## 7.0 Profile Catalog Path

```text
default profile catalog = Hermes Root models.json
named profile catalog = profileHome(profile)/models.json

Settings model CRUD 与本地 ModelPicker 使用同一个显式 profile 的这份文件。
见 P0.1-D-18。
```

## 7.1 Writer Uniqueness Invariant

```text
INV-SOT-001
Provider Settings normal save
→ exactly one production writer
→ saveNamedProvider()

MUST NOT:
Provider UI → legacy writer
AND
Provider UI → transaction writer
同时存在可成功路径。
```

## 7.2 Routing Authority Invariant

```text
INV-SOT-002
named Provider 正常 routing identity
= ProviderRef
= named:<providerKey>

MUST NOT be:
baseUrl
providerLabel
"custom"
"custom:<name>"
Dashboard model.options guess
```

---

# 8. State Machine

## 8.1 Provider Save State Machine

```text
UNREGISTERED / EXISTING
        │
        ▼
VALIDATING
  ├─ profile invalid ───────────────→ BLOCKED / 0 mutation
  ├─ providerKey conflict ─────────→ BLOCKED / 0 mutation
  ├─ keyEnv conflict ──────────────→ BLOCKED / 0 mutation
  └─ apiMode invalid ──────────────→ BLOCKED / 0 mutation
        │
        ▼
SNAPSHOT_T0
        │
        ▼
WRITE_REGISTRY_V2
        │
        ▼
WRITE_SECRET_IF_PRESENT
        │
        ▼
WRITE_PROJECTION
        │
        ▼
VERIFY_PROJECTION
  ├─ mismatch ─→ ROLLBACK_T0
  └─ pass
        │
        ▼
COMMITTED
```

## 8.2 Model Binding State Machine

```text
LEGACY_MODEL
 provider=custom
 baseUrl=...
 providerRef absent
      │ migration / explicit re-save
      ▼
CANONICAL_MODEL
 providerRef=named:<providerKey>
      │
      └─ normal reads never need baseUrl matching
```

New named model MUST enter `CANONICAL_MODEL` directly。
已有 catalog 行只按 P0.1-D-19 与 P0.1-D-20 补 `providerRef`。
builtin 行的目标是 `providerRef=builtin:<canonicalSlug>`。
无法唯一匹配的行停在可见但不可选，不进入上图的成功迁移。

## 8.3 Session State Machine

```text
NEW_SESSION
   │ ModelPicker selects canonical model
   ▼
CANONICAL_OVERRIDE
 providerRef=named:<providerKey>
   │
   ▼
SEND

LEGACY_OVERRIDE
 provider=custom + baseUrl
   │ first local send
   ▼
UNIQUE_MATCH?
   ├─ NO → SESSION_PROVIDER_UNRESOLVED / 0 mutation / 0 network
   └─ YES
        │
        ▼
ENSURE_REGISTRY_AND_PROJECTION
 saveNamedProvider() when the matched record or projection is missing
   ├─ FAIL → rollback this fill only / 0 network
   └─ PASS
        │
        ▼
PERSIST_CANONICAL_OVERRIDE
        │
        ▼
RUNTIME_RELOAD_IF_REQUIRED
   ├─ FAIL → keep committed registry, projection, and persisted providerRef
   │         PROVIDER_RUNTIME_RELOAD_FAILED / 0 network
   └─ PASS or not required
        │
        ▼
RESOLVE_ROUTE
        │
        ▼
SEND_NAMED_CONFIG
```

## 8.4 Global Active Model State Machine

```text
LEGACY_ACTIVE_MODEL
 model.provider=custom
 model.base_url=...
     │ local send without Session override
     ▼
UNIQUE_MATCH?
  ├─ NO → ACTIVE_MODEL_PROVIDER_UNRESOLVED / 0 mutation / 0 network
  └─ YES
       │
       ▼
ENSURE_REGISTRY_AND_PROJECTION
  ├─ FAIL → rollback this fill only / 0 network
  └─ PASS
       │
       ▼
WRITE:
 model.provider=<providerKey>
 remove identity model.base_url
 normalize api_mode if owned/required
       │
       ▼
RUNTIME_RELOAD_IF_REQUIRED
  ├─ FAIL → keep committed registry, projection, and canonical model.provider
  │         PROVIDER_RUNTIME_RELOAD_FAILED / 0 network
  └─ PASS or not required
       │
       ▼
CANONICAL_ACTIVE_MODEL
       │
       ▼
RESOLVE_NAMED_CONFIG
```

## 8.5 Local Send State Machine

```text
INPUT
 providerRef present and resolvable in the explicit profile?
   │
   ├─ YES → canonical resolve
   │
   └─ NO  → legacy migration path
               │
               ├─ not exactly one candidate → BLOCK / 0 mutation / 0 network
               └─ exactly one
                     │
                     ▼
              ensure registry and projection
              via saveNamedProvider() when missing
                     │
            ┌────────┴────────┐
           FAIL              PASS
            │                 │
     rollback this fill       │
     0 network                ▼
                       persist canonical identity
                       session providerRef
                       or model.provider + remove identity base_url
                              │
                              ▼
                       runtime reload if this operation wrote
                       projection or target keyEnv
                       and Gateway is not post-apply
                              │
                     ┌────────┴────────┐
                   FAIL               PASS or not required
                    │                  │
             keep committed state      ▼
             0 network              resolve route
                                        │
                                        ▼
                                   model request
```

下一次发送若 canonical identity 已持久化，走 canonical resolve。不得再次用 baseURL 匹配。见 P0.1-D-23。

---

# 9. Data / Schema Contract

## 9.1 Provider Save Contract

```ts
type ApiMode = "chat_completions" | "anthropic_messages";

interface ProviderSaveInput {
  id?: string;
  name: string;
  baseUrl: string;
  secret?: string | null;
  apiMode?: ApiMode;
}

interface ProviderRecordV2 {
  id: string;
  providerKey: string;
  name: string;
  baseUrl: string;
  keyEnv: string;
  apiMode: ApiMode;
  createdAt: number;
  updatedAt: number;
}

type ProviderSaveResult =
  | { ok: true; record: ProviderRecordV2 }
  | { ok: false; error: ProviderErrorCode };
```

Rules：

```text
- providerKey 创建后 immutable。
- keyEnv 由 Main 按父 PRD D-03 继承/生成。
- secret value 不进入 ProviderRecordV2。
- update 时 id 用于定位 stable providerKey。
- display name change 不得重新生成 providerKey。
```

## 9.2 Model Binding v2

```ts
interface CanonicalModelBinding {
  providerRef: string;   // REQUIRED for new named-provider writes
  model: string;

  // compatibility/display only:
  provider?: string;
  providerLabel?: string;
  baseUrl?: string;
  apiMode?: string;
}
```

Rules：

```text
named provider 新写入：
providerRef MUST = named:<providerKey>

builtin provider 新写入：
providerRef MUST = builtin:<canonicalSlug>
canonicalSlug 的闭集见 P0.1-D-20。

provider/baseUrl/providerLabel：
override parent decision，见 P0.1-D-21。
落盘行 MUST 保留这些已有字段。
MUST NOT override providerRef during routing
MAY remain for UI and legacy matching

catalog 读取的写入范围见 P0.1-D-19、P0.1-D-20。
```

## 9.3 ModelPicker Contract

目标 picker row：

```ts
interface ModelPickerItem {
  providerRef: string;
  model: string;
  label: string;

  provider?: string;
  providerLabel?: string;
  baseUrl?: string;
}
```

目标选择接口 SHOULD 使用结构体，避免继续扩展 positional parameters：

```ts
interface ModelSelection {
  providerRef: string;
  model: string;
  provider?: string;
  baseUrl?: string;
}
```

如果实现阶段为了最小 diff 保留 positional callback，仍 MUST 把 `providerRef` 作为显式参数传递，不得通过 `providerLabel/baseUrl` 在 Chat.tsx 再推导。

## 9.4 SessionModelOverrideV2

```ts
interface SessionModelOverrideV2 {
  providerRef: string;
  model: string;
  legacyProvider: string | null;
  legacyBaseUrl: string | null;
  migrationStatus: "canonical" | "migrated" | "unresolved";
}
```

规则：

```text
新 Session：
providerRef REQUIRED
legacyProvider = null
legacyBaseUrl = null
migrationStatus = canonical

legacy Session：
providerRef MAY initially be absent only in persisted legacy row
第一次 local send 必须按 P0.1-D-23 migration 或 BLOCK
migration 成功后必须写回 providerRef
migrationStatus = migrated
```

## 9.5 RuntimeProviderRoute

```ts
interface RuntimeProviderRoute {
  providerRef: string;
  hermesProvider: string;
  model: string;
  apiMode: ApiMode | null;
  strategy: "builtin" | "named-config";
  source: "canonical" | "migrated-legacy";
}
```

Invariant：

```text
strategy = named-config
→ hermesProvider == providerKey
→ request identity MUST NOT be custom
→ request identity MUST NOT be custom:<name>
→ base_url MUST NOT be required to identify provider
```

## 9.6 Global Active Model Canonical Form

named provider canonical target：

```yaml
model:
  default: deepseek-v4-flash
  provider: <providerKey>
  api_mode: chat_completions
```

`base_url`：

```text
MUST be removed when its only purpose is identity for canonical named provider.
MAY remain only if future Hermes contract explicitly requires it for a non-identity purpose，
but such exception is outside P0.1 and requires PRD update.
```

---

# 10. Requirement Units

## REQ-WIRE-001 — Provider Settings 必须使用唯一 Production Writer

### Goal

消除 Provider Settings 正常保存路径对 legacy writer 的依赖。

### Requirement

```text
Given Renderer saves a named Provider
When Main receives the save request
Then Main MUST invoke saveNamedProvider() transaction
And success MUST return ProviderRecordV2
And legacy upsertCustomProvider() MUST NOT be the successful writer of this operation
```

### Invariant

`INV-WIRE-001: normal Provider save has exactly one authoritative writer.`

### Failure

transaction failure → UI MUST NOT report success。

---

## REQ-DATA-001 — Renderer Provider State 必须使用 ProviderRecordV2

### Goal

让 providerKey/keyEnv/apiMode 从创建阶段开始稳定进入 UI state，而不是之后重新猜。

### Requirement

Renderer normal state MUST expose：

```text
id
providerKey
name
baseUrl
keyEnv
apiMode
```

Renderer MUST NOT persist or echo secret value after save。

### Invariant

`INV-DATA-001: displayName != routing identity.`

---

## REQ-PROJ-001 — Provider Save 必须通过 Semantic Projection Verify

### Goal

让“保存成功”等价于“Desktop desired state 与 Hermes named provider projection 一致”。

### Requirement

Provider transaction commit 前 MUST：

```text
1. write Provider Registry
2. write target secret if supplied
3. write providers:<providerKey>
4. re-read config.yaml providers:
5. call equivalent of checkProviderProjection()
6. compare at least providerKey/baseUrl/keyEnv/apiMode
```

任何 mismatch：

```text
error = PROVIDER_PROJECTION_DRIFT
or PROVIDER_SAVE_TRANSACTION_FAILED
MUST rollback managed scope to T0
MUST return failure
```

### Invariant

`INV-PROJ-001: save success => projected semantics equal registry semantics.`

---

## REQ-MODEL-001 — 新 named Model 必须写 ProviderRef

### Goal

让 Model Catalog 从源头保存 canonical Provider identity。

### Requirement

```text
When model is attached to ProviderRecordV2
Then models.json/model library row MUST contain:
providerRef = named:<providerKey>
```

禁止：

```text
new named model
providerRef absent
provider=custom + baseUrl used as only identity
```

### Invariant

`INV-MODEL-001: every new named model is canonically bound.`

---

## REQ-PICKER-001 — ModelPicker 必须传递 ProviderRef

### Goal

消除 Picker → Session 之间的 identity loss。

### Requirement

Picker 中可被选择的 model item MUST carry 一个能在当前显式 profile 解析的 providerRef；select callback MUST deliver it to Chat state。

可见但不可选的行 MUST NOT 进入 Session。点击返回 MODEL_PROVIDER_UNRESOLVED。见 P0.1-D-20、P0.1-D-22。

`providerLabel/baseUrl` 只可用于展示或 catalog migration layer 的匹配，不得在 Chat.tsx 重新构造 ProviderRef。

### Invariant

`INV-PICKER-001: ProviderRef survives list → click → session state.`

---

## REQ-SESSION-001 — 新 Session 首次即 Canonical

### Goal

新会话不再依赖第一次 send 做 identity repair。

### Requirement

```text
Given user selects a canonical named model
When Chat creates/updates sessionModelOverride
Then providerRef MUST be written immediately
And persisted once session id exists
And migrationStatus MUST be canonical
```

### Invariant

`INV-SESSION-001: new session never intentionally persists bare custom as routing identity.`

---

## REQ-MIG-001 — Legacy Session 必须 Same-send Persist Migration

### Goal

将 legacy Session 从“每次 send 重新猜”转为“一次迁移后永久 canonical”。

### Requirement

顺序 MUST 以 P0.1-D-23 为准：

```text
read legacy override
→ unique match
→ ensure registry/projection through saveNamedProvider() when missing
→ persist Session providerRef
→ runtime reload if required
→ resolve RuntimeProviderRoute
→ send
```

persist 失败：

```text
0 model request
migration state remains legacy/unresolved
```

无法唯一匹配：

```text
SESSION_PROVIDER_UNRESOLVED
0 mutation
0 model request
```

### Invariant

`INV-MIG-SESSION-001: successful migrated send leaves canonical persisted session state.`

---

## REQ-MIG-002 — Global Active Model 必须 Same-send Canonicalize

### Goal

消除全局 default model 长期依赖 `custom + base_url`。

### Requirement

无 Session override 时，顺序同样以 P0.1-D-23 为准：

```text
legacy model.provider=custom + model.base_url
→ unique match
→ ensure registry/projection through saveNamedProvider() when missing
→ model.provider=<providerKey>
→ remove identity model.base_url
→ runtime reload if required
→ route named-config
→ send
```

无法唯一匹配：

```text
ACTIVE_MODEL_PROVIDER_UNRESOLVED
0 model request
```

### Invariant

`INV-MIG-GLOBAL-001: successful global migration persists canonical Hermes providerKey.`

---

## REQ-ROUTE-001 — Gateway / Dashboard 必须共享 Canonical Route Semantics

### Goal

避免两个 Chat data plane 再次出现 Provider identity 分叉。

### Requirement

同一 `ProviderRef + model`：

```text
Gateway local
Dashboard local
```

必须得到等价：

```text
strategy
hermesProvider
apiMode
```

### Forbidden

```text
Gateway uses providerKey
Dashboard uses baseURL guess
or
Gateway uses custom
Dashboard uses custom:<name>
```

### Invariant

`INV-ROUTE-001: one ProviderRef => one Hermes provider identity across local transports.`

---

## REQ-RUNTIME-001 — Runtime Reload 顺序必须确定

### Goal

保证刚写入的 projection/credential 被目标 local Gateway 进程加载后才发送。

### Requirement

继承父 PRD D-09：

```text
if current operation wrote projection or target keyEnv
and current Gateway has not been confirmed started after that applied state
→ restart same profile RuntimeManager
```

restart failure：

```text
PROVIDER_RUNTIME_RELOAD_FAILED
committed registry/projection remain
MUST NOT send using old process
0 model request
```

### Invariant

`INV-RUNTIME-001: request is never sent through a known-stale Gateway after required config apply.`

---

## REQ-PROFILE-001 — 所有 Mutation 必须显式绑定目标 Profile

### Goal

避免 default/profile env 与 HERMES_PROFILE 隐式交叉。

### Requirement

Provider save、Model binding、Session migration、Global model migration、runtime restart MUST 使用同一个显式 resolved profile。

禁止：

```text
caller profile = default
process.env.HERMES_PROFILE = coder
writer silently mutates coder
```

### Failure

`PROFILE_SCOPE_MISMATCH` → 0 mutation。

---

## REQ-SEC-001 — Secret Containment

### Goal

生产 wiring 不重新引入 plaintext secret duplication。

### Requirement

Secret value MAY only be written to approved profile secret store。

MUST NOT appear in：

```text
providers.json
models.json
Session DB
config.yaml model.api_key
routing logs
Evidence
error messages
renderer persisted state
```

`keyEnv` MAY appear because it is a reference, not secret。

---

## REQ-COMPAT-001 — Legacy Data 只允许 Compatibility/Migration 使用

### Goal

把 legacy support 限制在明确边界内。

### Requirement

以下内容 MAY 被 migration 读取：

```text
custom_providers:
providerLabel
provider=custom
baseUrl
legacy Session provider/baseUrl
Dashboard model.options（仅 remote/compat，不用于 local normal path）
```

以下行为 MUST NOT：

```text
normal new write missing ProviderRef
normal local send baseURL heuristic
migration success 后继续每次 send 重新猜
automatic deletion of unknown legacy entry
```

---

## REQ-OBS-001 — Wiring 与 Migration 必须可观测但不可泄密

### Goal

能够证明发送前使用了哪个 Provider identity，同时不泄露 token。

### Required fields

```text
operationId
profile
providerRef
providerKey (named only)
model
strategy
source
migrationStatus
projectionStatus
runtimeReloadRequired
runtimeReloadResult
transport
modelRequestCount
errorCode
```

MUST NOT record secret value。

---

## REQ-VERIFY-001 — P0.1 只有执行 Evidence 才可 Verified

### Goal

阻止“代码存在 = 功能完成”的错误状态。

### Requirement

至少执行：

```text
Provider Identity targeted tests
Provider Settings / model wiring tests
Session migration tests
Gateway/Dashboard parity tests
typecheck
full Work test suite
build
Golden Consumer runtime acceptance
```

仅新增 test file 但没有 run Evidence：

```text
status = IMPLEMENTED_UNVERIFIED
NOT VERIFIED
```

---

## REQ-GATE-001 — Baseline Blocker 必须与 Feature Failure 分开

### Goal

准确处理当前 Work CI / Governance 的既有阻塞。

### Requirement

如果 P0.1 代码验证被 unrelated baseline gate 阻止：

```text
Feature acceptance status = BLOCKED
NOT PASS
NOT FAIL（除非实际功能断言失败）
```

Evidence MUST 记录 blocker 名称和证明。

当前已知 baseline：

```text
Work CI Guard:
check:no-legacy-hermes-runtime
matches unchanged legacy literal in hermes-runtime-config.ts comment

SMC Governance Acceptance:
repository binding/bootstrap configuration incomplete
```

本 PRD 不要求把这些治理问题重构成 Provider 功能。

---

# 11. Side-Effect Contract

| Operation | providers.json | .env | config providers | config model | models.json | Session DB | Restart | Model Network |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| list providers | NO | NO | NO | NO | NO | NO | NO | NO |
| catalog read, file exists | NO | NO | NO | NO | providerRef only when the row has none and P0.1-D-20 matches | NO | NO | NO |
| catalog seed, file absent | NO | NO | NO | NO | YES, one seedDefaults | NO | NO | NO |
| save named Provider | YES | MAY | YES | NO | NO | NO | MAY after commit | NO |
| add canonical model | NO | NO | MAY legacy projection only | NO | YES | NO | NO | NO |
| select model before session exists | NO | NO | NO | NO | NO | local state | NO | NO |
| persist new session override | NO | NO | NO | NO | NO | YES | NO | NO |
| migrate legacy Session | MAY if provider missing | MAY if required input exists | MAY | NO | NO | YES | MAY | YES only after all prior PASS |
| migrate Global Active Model | MAY if provider missing | MAY | MAY | YES | NO | NO | MAY | YES only after all prior PASS |
| resolve canonical route | NO | NO | NO | NO | NO | NO | NO | NO |
| Gateway local send | NO | NO | NO | NO | NO | runtime/session normal writes | NO | YES |
| Dashboard local send | NO | NO | NO | NO | NO | runtime/session normal writes | NO | YES |

## 11.1 Zero-request Rule

所有以下错误 MUST `modelRequestCount = 0`：

```text
PROVIDER_ROUTE_UNRESOLVED
SESSION_PROVIDER_UNRESOLVED
ACTIVE_MODEL_PROVIDER_UNRESOLVED
MODEL_PROVIDER_UNRESOLVED
PROVIDER_PROJECTION_DRIFT
PROVIDER_SECRET_MISSING
PROVIDER_API_MODE_INVALID
PROVIDER_KEYENV_CONFLICT
PROFILE_SCOPE_MISMATCH
PROVIDER_SAVE_TRANSACTION_FAILED
PROVIDER_SAVE_ROLLBACK_FAILED
PROVIDER_RUNTIME_RELOAD_FAILED
```

---

# 12. Ownership Contract

## 12.1 Managed Ownership

```text
providers.json v2:
Desktop owns Provider records created/migrated by Desktop.

profile .env:
Desktop owns only target keyEnv entry it writes.
Other env keys MUST be preserved.

config.yaml providers:<providerKey>:
Desktop owns entry only when ownership can be proven by registry identity / migration evidence.

config.yaml model:
Desktop owns only provider/default/base_url/api_mode fields involved in its active model management.
Unrelated model fields MUST be preserved.

models.json:
Desktop owns model rows it creates.
Unknown future fields MUST be preserved where parser/writer supports round-trip.

Session override:
Desktop owns row by session id.
```

## 12.2 Unknown Ownership

```text
unknown ownership
→ PRESERVE
→ REPORT
→ BLOCK destructive action if required
→ MUST NOT delete
```

## 12.3 Drift

```text
Registry == Projection
→ PROJECTED

Registry != Projection
→ PROVIDER_PROJECTION_DRIFT
→ normal send/save behavior follows parent D-04
```

用户再次显式保存同一 Provider 可覆盖 Desktop-owned projection；系统不得自动“以 YAML 回写 Registry”。

---

# 13. Identity Contract

本节继承父 PRD v1.1，并用 `P0.1-D-15`、`P0.1-D-20` 收紧 providerKey 与 builtin slug 的生成规则。

## 13.1 ProviderRef

```text
builtin:<canonical-slug>
named:<providerKey>
```

`canonical-slug` 只来自 pinned Hermes Agent v0.21.0（reference tag `v2026.8.31`）`hermes_cli/models.py` 的 `CANONICAL_PROVIDERS`，或该文件把输入 alias 到的 canonical slug。写入值是 canonical slug。`PROVIDER_BASE_URLS` 不是这套闭集。见 P0.1-D-20。

## 13.2 providerKey

新创建 providerKey MUST 使用冻结的 `generateProviderKey()`，见 P0.1-D-15：

```text
stable
immutable
non-empty
NFKC trim lowercase
separators collapsed
max length 64
empty name → custom-<recordId hex>
existing key collision → PROVIDER_KEY_CONFLICT，0 mutation
no automatic suffix
display-name independent after creation
```

## 13.3 keyEnv

生成/继承规则：

```text
1. existing providers:/custom_providers: key_env → preserve
2. otherwise PROVIDER_<PROVIDERKEY>_API_KEY
3. collision with another providerKey → PROVIDER_KEYENV_CONFLICT
```

空 keyEnv 合法，表示无需 credential。

## 13.4 Identity Equality

```text
Provider identity equality:
ProviderRef exact equality

MUST NOT use:
baseURL string equality
display name equality
providerLabel equality
model name equality
```

这些只可作为 migration candidate matching 条件。

---

# 14. Transaction Contract

## 14.1 Provider Save Transaction Boundary

一个 logical Provider save 包含：

```text
Provider Registry managed record
target .env key (optional)
config.yaml providers:<providerKey> managed projection
semantic verification
```

不包含：

```text
models.json mutation
Session DB mutation
global model selection
model network request
```

## 14.2 Commit Order

```text
VALIDATE
→ RESOLVE_PROFILE
→ RESOLVE_EXISTING_IDENTITY
→ SNAPSHOT_T0
→ WRITE_REGISTRY_V2
→ WRITE_SECRET_IF_PRESENT
→ WRITE_PROJECTION
→ RE_READ_PROJECTION
→ SEMANTIC_VERIFY
→ COMMIT
→ EVIDENCE
```

## 14.3 Failure Atomicity

在 `COMMIT` 之前任何失败：

```text
AfterRollback(managed_scope) == T0
```

包含：

```text
Provider record
target env key
target providers:<providerKey> entry
```

## 14.4 Post-commit Runtime Reload

Runtime reload 不属于文件 transaction rollback boundary。

```text
files committed
→ restart required
→ restart fails
→ keep committed desired/applied files
→ return PROVIDER_RUNTIME_RELOAD_FAILED
→ 0 model request
```

这样避免因 runtime process failure 把正确 desired state 反向回滚成旧错误配置。

## 14.5 Session Migration Transaction

same-send legacy Session migration：

```text
snapshot session row
→ unique match
→ ensure required provider/projection
→ persist providerRef
→ verify session row
→ route/send
```

如果 session persist 本身失败：

```text
rollback session row if partially changed
0 model request
```

## 14.6 Global Model Migration Transaction

```text
snapshot model managed fields
→ unique match
→ ensure provider/projection
→ write providerKey/remove identity base_url
→ re-read verify
→ runtime reload if required
→ route/send
```

写回失败：

```text
restore model managed fields to T0
0 model request
```

---

# 15. Conflict Contract

| Conflict | Detection | Default | Error | Mutation | Network |
|---|---|---|---|---:|---:|
| duplicate providerKey | Registry index | BLOCK | PROVIDER_KEY_CONFLICT | 0 | 0 |
| keyEnv owned by other providerKey | Registry/config scan | BLOCK | PROVIDER_KEYENV_CONFLICT | 0 | 0 |
| apiMode invalid | closed-set validation | BLOCK | PROVIDER_API_MODE_INVALID | 0 | 0 |
| Registry/Projection mismatch | semantic verify | BLOCK | PROVIDER_PROJECTION_DRIFT | 0 | 0 |
| legacy baseUrl matches >1 provider | migration candidate set | BLOCK | PROVIDER_IDENTITY_AMBIGUOUS / session-specific unresolved | 0 | 0 |
| legacy Session no match | migration lookup | BLOCK | SESSION_PROVIDER_UNRESOLVED | 0 | 0 |
| global active no match | migration lookup | BLOCK | ACTIVE_MODEL_PROVIDER_UNRESOLVED | 0 | 0 |
| catalog row cannot resolve in this profile | catalog read or picker click | visible, not selectable; stored row unchanged | MODEL_PROVIDER_UNRESOLVED | 0 | 0 |
| secret required but missing | keyEnv lookup | BLOCK | PROVIDER_SECRET_MISSING | 0 | 0 |
| wrong profile scope | profile resolver | BLOCK | PROFILE_SCOPE_MISMATCH | 0 | 0 |
| runtime restart fails | restart result | BLOCK send | PROVIDER_RUNTIME_RELOAD_FAILED | committed state kept | 0 |
| ProviderRef points missing record | resolver | BLOCK | PROVIDER_ROUTE_UNRESOLVED | 0 | 0 |
| model providerRef conflicts with provider/apiMode compatibility fields | validation | ProviderRef authority; invalid apiMode blocks | PROVIDER_API_MODE_INVALID | 0 | 0 |

---

# 16. Compatibility / Migration

## 16.1 Legacy Sources

P0.1 MAY read：

```text
providers.json v1
config.yaml custom_providers:
model.provider=custom
model.base_url
models.json provider/providerLabel/baseUrl
Session provider/baseUrl
```

## 16.2 New-write Rule

从 P0.1 起：

```text
new Provider → ProviderRecordV2
new named Model → providerRef REQUIRED
new builtin Model → providerRef = builtin:<canonicalSlug> REQUIRED
new Session model override → providerRef REQUIRED
local normal send → no identity heuristic
local ModelPicker source → current explicit profile catalog
```

## 16.3 Catalog Read Migration

Catalog 读取与发送迁移使用不同的写入权限。

```text
catalog 文件已存在：
只允许按 P0.1-D-20 给尚无 providerRef 的行补上 providerRef
不得插入行
不得新建 ProviderRecord
不得写 .env / providers.json / config.yaml

catalog 文件不存在：
允许一次 seedDefaults
builtin 行写 builtin:<canonicalSlug>
闭集外的 seed 行不写 providerRef，可见但不可选

发送时的 legacy Session / Global Active Model：
仍按父 PRD REQ-MIGRATE-001 做唯一匹配
缺 Registry 或投影时，按 P0.1-D-23 用 saveNamedProvider() 补齐
然后再持久化 canonical identity
```

## 16.4 Legacy Session Migration

Candidate matching MAY 使用：

```text
exact normalized baseUrl
providerLabel/name
model membership
legacy provider metadata
```

但最终只有：

```text
exactly one candidate
```

才可迁移。

成功后：

```text
persist providerRef
retain legacy snapshot only if schema requires audit/rollback
normal subsequent reads use providerRef
```

## 16.5 Legacy Global Active Model Migration

成功后：

```yaml
model:
  provider: <providerKey>
  default: <model>
```

作为 identity 的 `base_url` MUST 删除。

## 16.6 Compatibility Removal

| Compatibility | P0.1 | Removal Condition |
|---|---|---|
| read providers.json v1 | KEEP | supported profiles migrated |
| read custom_providers | KEEP | all supported configs canonical + no unresolved evidence |
| providerLabel/baseUrl legacy matching | MIGRATION ONLY | models/session canonical coverage complete |
| local Dashboard baseURL heuristic | DISABLED FOR NORMAL PATH | already replaced by canonical route |
| bare custom runtime strategy | FORBIDDEN | permanent under parent v1.1 |
| `custom:<name>` runtime strategy | FORBIDDEN | permanent under parent v1.1 |
| legacy upsertCustomProvider normal Settings write | REMOVE FROM NORMAL PATH | P0.1 merge |
| optional providerRef on new named models | REMOVE | P0.1 merge |

---

# 17. External Dependency Contract

## 17.1 smc-copilot

```text
repo: loudon84/smc-copilot
branch baseline: work/prd-v6.2.1
commit: a121b246b7243bb16b33ba1da5e9ec7e0de8cab2
```

本 PRD只改 `apps/work` 与必要的 Work test/evidence glue。

## 17.2 Hermes Agent

```text
version: v0.21.0
reference tag: v2026.8.31
```

假设：

```text
named provider slug/providerKey 可作为 Hermes runtime provider identity
providers:<providerKey> 是可路由 named provider projection
bare custom direct-alias credential semantics 不作为 P0.1 正常路径
```

P0.1 MUST NOT 修改 Hermes Core。

## 17.3 Enterprise NEW-API

```text
interface: OpenAI-compatible /v1
auth: Bearer token
endpoint: deployment-specific
```

Golden Consumer 必须验证真实 HTTP 结果。

```text
HTTP 401
→ FAIL

unreachable / upstream non-401 infrastructure error
→ BLOCKED upstream
→ identity acceptance 可单独 PASS
→ 不得声称 full Golden PASS
```

## 17.4 Work CI

Work CI 应执行：

```text
guard
typecheck
test
build
```

当前 baseline guard blocker 必须单独记录；不得因为 blocker 存在就跳过本地 targeted/full tests。

---

# 18. Security Contract

| Threat | Control | Requirement |
|---|---|---|
| token 写入 YAML/JSON/DB | secret only in profile .env | REQ-SEC-001 |
| renderer 长期持有 token | save 后只保留 keyEnv/hasSecret semantics | REQ-SEC-001 |
| wrong secret → wrong endpoint | ProviderRef deterministic lookup | REQ-ROUTE-001 |
| baseURL spoof routing | normal route forbids baseURL identity | REQ-COMPAT-001 |
| profile crossing | explicit profile for every mutation/restart | REQ-PROFILE-001 |
| logs leak secret | structured redaction | REQ-OBS-001 |
| evidence leak secret | evidence schema forbids values | REQ-SEC-001 |
| stale Gateway uses old secret/projection | required restart before send | REQ-RUNTIME-001 |
| legacy ambiguity routes arbitrary provider | ambiguity blocks | REQ-MIG-001/002 |

## 18.1 Renderer Secret Rule

Provider Settings MAY collect secret input transiently。

提交后：

```text
Renderer persistent state:
hasSecret MAY be boolean
keyEnv MAY be string
secret value MUST be cleared
```

---

# 19. Observability

## 19.1 Required Stage Names

建议统一阶段：

```text
PROVIDER_SAVE_VALIDATE
PROVIDER_SAVE_REGISTRY
PROVIDER_SAVE_SECRET
PROVIDER_SAVE_PROJECT
PROVIDER_SAVE_VERIFY
PROVIDER_SAVE_ROLLBACK

MODEL_BIND_CANONICAL

SESSION_PROVIDER_ANALYZE
SESSION_PROVIDER_MIGRATE
SESSION_PROVIDER_PERSIST

ACTIVE_MODEL_ANALYZE
ACTIVE_MODEL_MIGRATE
ACTIVE_MODEL_PERSIST

RUNTIME_RELOAD_REQUIRED
RUNTIME_RELOAD_START
RUNTIME_RELOAD_PASS
RUNTIME_RELOAD_FAIL

ROUTE_RESOLVE
GATEWAY_SEND
DASHBOARD_SEND
MODEL_RESPONSE
```

## 19.2 Event Schema

```json
{
  "operationId": "uuid",
  "stage": "ROUTE_RESOLVE",
  "profile": "default",
  "providerRef": "named:company-new-api",
  "providerKey": "company-new-api",
  "model": "deepseek-v4-flash",
  "strategy": "named-config",
  "source": "canonical",
  "transport": "gateway",
  "migrationStatus": "canonical",
  "projectionStatus": "PROJECTED",
  "runtimeReloadRequired": false,
  "modelRequestCount": 0,
  "result": "PASS",
  "errorCode": null
}
```

禁止字段：

```text
apiKey
secret
Authorization
raw .env line
full credential pool
unredacted request headers
```

---

# 20. Acceptance Design Standard

每个 Acceptance 必须定义：

```text
Requirement Refs
Preconditions
Input
Action
Oracle
Expected Postcondition
Network Count
Evidence
```

## A-WIRE-001 — Provider Settings 使用 Transaction Writer

### Requirement Refs

`REQ-WIRE-001`, `REQ-DATA-001`, `REQ-PROJ-001`

### Preconditions

空 profile 或已有 v1/v2 Provider profile fixture。

### Action

通过与真实 Renderer 相同的 preload/IPC surface 保存 Provider。

### Oracle

```text
saveNamedProvider transaction 被调用
providers.json = v2
config.yaml providers:<providerKey> 存在并一致
返回 ProviderRecordV2
legacy writer 未作为成功 owner
```

### Expected

PASS。

### Network Count

0 model request。

### Evidence

`EVID-A-WIRE-001`：test output + managed state snapshot。

---

## A-DATA-001 — ProviderRecordV2 贯穿 Settings

### Requirement Refs

`REQ-DATA-001`

### Oracle

新增/编辑后 Renderer 可读取：

```text
id
providerKey
name
baseUrl
keyEnv
apiMode
```

displayName rename 后 providerKey 不变。

Evidence MUST NOT include secret。

---

## A-PROJ-001 — Projection Semantic Verify

### Requirement Refs

`REQ-PROJ-001`

### Action

注入 projection writer 生成不一致内容但不 throw。

### Oracle

```text
save result = failure
managed state rollback to T0
MUST NOT report success
```

---

## A-MODEL-001 — 新 Model 强制 ProviderRef

### Requirement Refs

`REQ-MODEL-001`

### Action

在 named Provider 下新增模型。

### Oracle

models store row：

```text
providerRef = named:<providerKey>
```

删除 `providerRef` 的 new-write test fixture MUST fail。

---

## A-PICKER-001 — Picker 不丢 ProviderRef

### Requirement Refs

`REQ-PICKER-001`

### Action

打开 ModelPicker 并选择 named Provider 模型。

### Oracle

```text
Picker row providerRef
== selection callback providerRef
== Chat sessionModelOverride.providerRef
```

禁止通过 baseUrl 重新查 Provider。
不可选行点击结果为 MODEL_PROVIDER_UNRESOLVED，且不得写入 Session。

---

## A-SESSION-001 — 新 Session 首次即 Canonical

### Requirement Refs

`REQ-SESSION-001`

### Oracle

在任何模型请求前，Session store 已包含：

```text
providerRef = named:<providerKey>
migrationStatus = canonical
```

第一次 send 不触发 legacy identity recovery。

---

## A-MIG-SESSION-001 — Legacy Session Same-send Migration

### Requirement Refs

`REQ-MIG-001`

### Action

恢复 legacy：

```text
provider=custom
baseUrl=X
providerRef absent
```

且 X 只匹配一个 Provider。

### Oracle

同一次 send：

```text
Session row providerRef persisted
route.strategy = named-config
route.hermesProvider = providerKey
model request count = 1
bare custom request count = 0
```

---

## A-MIG-GLOBAL-001 — Global Active Model Same-send Migration

### Requirement Refs

`REQ-MIG-002`

### Preconditions

无 Session override。

### Input

```yaml
model:
  provider: custom
  default: deepseek-v4-flash
  base_url: https://example/v1
```

唯一匹配一个 named Provider。

### Oracle

发请求前：

```yaml
model:
  provider: <providerKey>
  default: deepseek-v4-flash
```

identity `base_url` 已删除；request 使用 named-config。

---

## A-ROUTE-001 — Gateway / Dashboard Route Parity

### Requirement Refs

`REQ-ROUTE-001`

同一 canonical input 分别经两 transport 准备 route：

```text
providerRef
model
strategy
hermesProvider
apiMode
```

必须一致。

`hermesProvider` 不能为：

```text
custom
custom:*
```

---

## A-RUNTIME-001 — Required Reload Before Request

### Requirement Refs

`REQ-RUNTIME-001`

当本次 migration/save 写入 projection 或 credential：

```text
restart must complete before request
```

注入 restart failure：

```text
PROVIDER_RUNTIME_RELOAD_FAILED
model request count = 0
committed desired state retained
```

---

## A-PROFILE-001 — Explicit Profile Isolation

### Requirement Refs

`REQ-PROFILE-001`

```text
explicit profile = default
HERMES_PROFILE = coder
```

操作只能修改 default scope。

named profile 同理。

---

## A-SEC-001 — Secret Containment

### Requirement Refs

`REQ-SEC-001`

保存真实-looking test secret 后，全 workspace managed artifacts scan：

```text
providers.json: absent
models.json: absent
config.yaml model.api_key: absent
Session DB: absent
Evidence/logs: absent
target .env: present
```

---

## A-OBS-001 — Structured Route Evidence

### Requirement Refs

`REQ-OBS-001`

每次 Golden route 至少存在 redacted event：

```text
providerRef
strategy
source
transport
modelRequestCount
result/errorCode
```

无 secret。

---

## A-VERIFY-001 — Executed Evidence Gate

### Requirement Refs

`REQ-VERIFY-001`, `REQ-GATE-001`

只有执行结果才可：

```text
planned → implemented → verified
```

test file existence 不能跳到 verified。

---

# 21. Acceptance Input Matrix

| Case | Provider | Model | Session / Global | Transport | Expected |
|---|---|---|---|---|---|
| 1 | new named v2 | new canonical | new Session | Gateway | PASS named-config |
| 2 | new named v2 | new canonical | new Session | Dashboard | PASS named-config |
| 3 | renamed display | canonical | existing canonical Session | Gateway | same providerKey |
| 4 | v1 Provider | legacy model | legacy Session unique | Gateway | migrate + persist + send |
| 5 | v1 Provider | legacy model | legacy Session unique | Dashboard | migrate + persist + send |
| 6 | v2 Provider | legacy model | no Session / legacy global unique | Gateway | global migrate + send |
| 7 | v2 Provider | canonical model | no Session / canonical global | Gateway | direct named-config |
| 8 | duplicate baseUrl providers | legacy model | legacy Session | Gateway | SESSION_PROVIDER_UNRESOLVED / 0 network |
| 9 | missing secret | canonical model | canonical Session | Gateway | PROVIDER_SECRET_MISSING |
| 10 | projection missing | canonical model | canonical Session | Gateway | PROVIDER_PROJECTION_DRIFT |
| 11 | projection semantic mismatch | canonical | canonical | Gateway | BLOCK |
| 12 | apiMode invalid | canonical | canonical | Gateway | PROVIDER_API_MODE_INVALID |
| 13 | restart failure after migration | legacy | legacy | Gateway | RELOAD_FAILED / 0 network |
| 14 | wrong HERMES_PROFILE env | canonical | canonical | Gateway | explicit profile wins |
| 15 | unknown custom_providers entry | any | any | none | preserved |
| 16 | provider save projection silent corruption | save | none | none | rollback T0 |
| 17 | model save omits providerRef | new named | none | none | validation failure |
| 18 | remote connection | any | any | Dashboard/legacy | behavior unchanged |
| 19 | upstream HTTP 401 | canonical | canonical | Gateway | Golden FAIL |
| 20 | upstream unreachable | canonical | canonical | Gateway | identity PASS / upstream BLOCKED |

---

# 22. Negative Acceptance

## A-NEG-001 — Provider Settings 不得继续成功走 Legacy Writer

```text
Given normal Provider save
Then legacy upsertCustomProvider-only path MUST NOT produce success
```

## A-NEG-002 — 新 named Model 不得缺 ProviderRef

```text
Given ProviderRecordV2
When add model
Then providerRef absent MUST be rejected or impossible by type/contract
```

## A-NEG-003 — Picker 不得只传 custom + baseUrl

```text
Given canonical model row
When selected
Then providerRef MUST be present
And Chat MUST NOT derive it from baseUrl
```

## A-NEG-004 — 新 Session 不得以 Bare Custom 作为 Routing Identity

Session compatibility field MAY contain legacy display metadata，但：

```text
session.providerRef MUST be canonical
```

## A-NEG-005 — Legacy Migration Ambiguous 不得猜

```text
0 or >1 candidate
→ unresolved
→ 0 model request
```

## A-NEG-006 — Global Migration Ambiguous 不得修改 model:

```text
no unique provider
→ model managed state == T0
→ 0 network
```

## A-NEG-007 — named-config 正常请求不得发送 base_url 作为身份覆盖

```text
strategy=named-config
→ providerKey is route identity
→ request-level base_url identity override MUST NOT be required
```

## A-NEG-008 — 不得写 model.api_key

```text
config.yaml model.api_key
MUST NOT be created by P0.1
```

## A-NEG-009 — Migration 成功后不得继续依赖 Heuristic

第二次发送必须直接读取 persisted providerRef / providerKey。

## A-NEG-010 — remote/ssh 不得被 P0.1 改写

已有 remote/ssh behavior regression → FAIL。

---

# 23. Failure Injection

| Injection Point | Expected |
|---|---|
| Provider validation before T0 | 0 mutation |
| after registry write | rollback T0 |
| after secret write | rollback registry + secret |
| projection writer throws | rollback T0 |
| projection writer silently writes wrong baseUrl | semantic verify detects + rollback |
| semantic verify read fails | transaction fail + rollback |
| session providerRef persist fails | session restore + 0 network |
| global model write fails | model managed fields restore + 0 network |
| config re-read after global write mismatches | rollback + 0 network |
| runtime restart returns false | committed config kept + 0 network |
| resolver receives missing ProviderRef record | PROVIDER_ROUTE_UNRESOLVED |
| keyEnv set but secret missing | PROVIDER_SECRET_MISSING |
| Gateway route preparation fails | 0 upstream request |
| Dashboard model switch fails | prompt MUST NOT send under old/wrong provider |
| Evidence writer fails | functional action MAY be complete but acceptance status BLOCKED until Evidence captured |
| baseline CI guard blocks suite | classify BLOCKED_BASELINE; run targeted/local tests separately; no fake PASS |

---

# 24. Evidence Contract

## 24.1 Evidence Record

每个 Acceptance Evidence MUST 至少包含：

```json
{
  "evidenceId": "EVID-A-MIG-SESSION-001",
  "prdId": "PRD-WORK-PROVIDER-P0.1-WIRING-001",
  "requirementRefs": ["REQ-MIG-001"],
  "acceptanceRef": "A-MIG-SESSION-001",
  "baselineCommit": "a121b246b7243bb16b33ba1da5e9ec7e0de8cab2",
  "testedCommit": "<sha>",
  "profile": "default",
  "transport": "gateway",
  "result": "PASS",
  "modelRequestCount": 1,
  "providerRef": "named:company-new-api",
  "hermesProvider": "company-new-api",
  "strategy": "named-config",
  "artifacts": [],
  "timestamp": "ISO-8601"
}
```

## 24.2 Redaction

Evidence MUST NOT contain：

```text
API Key
Authorization header
raw .env secret line
full secret pool
unredacted process environment
```

## 24.3 Required Evidence Set

```text
EVID-A-WIRE-001
EVID-A-DATA-001
EVID-A-PROJ-001
EVID-A-MODEL-001
EVID-A-PICKER-001
EVID-A-SESSION-001
EVID-A-MIG-SESSION-001
EVID-A-MIG-GLOBAL-001
EVID-A-ROUTE-001
EVID-A-RUNTIME-001
EVID-A-PROFILE-001
EVID-A-SEC-001
EVID-A-OBS-001
EVID-A-VERIFY-001
EVID-A-GOLDEN-001
```

---

# 25. Release Gate

## 25.1 Gate Status

允许状态：

```text
PASS
FAIL
BLOCKED
```

`BLOCKED` MUST NOT 被解释为 PASS。

## 25.2 Merge Gate

P0.1 merge 必须满足：

```text
GATE-01 Provider Settings transaction writer PASS
GATE-02 Model ProviderRef new-write PASS
GATE-03 Picker → Session ProviderRef PASS
GATE-04 Legacy Session migration persistence PASS
GATE-05 Global Active Model migration persistence PASS
GATE-06 Projection semantic verification PASS
GATE-07 Gateway / Dashboard parity PASS
GATE-08 Secret containment PASS
GATE-09 Profile isolation PASS
GATE-10 no bare custom runtime request PASS
GATE-11 targeted + full test evidence available
GATE-12 typecheck/build evidence available or explicitly BLOCKED by documented unrelated baseline
GATE-13 Golden Consumer identity gate PASS
GATE-14 Golden upstream MUST NOT return 401
```

## 25.3 Absolute FAIL Conditions

以下任一发生即 FAIL：

```text
named provider request uses hermesProvider=custom
named provider request uses hermesProvider=custom:<name>
new named model missing providerRef
new Session canonical selection persisted without providerRef
catalog click on MODEL_PROVIDER_UNRESOLVED still sends a model request
Provider save returns success while projection mismatch
secret appears outside approved secret store
migration ambiguity still sends model request
runtime reload failure still sends through stale Gateway
Golden Consumer returns HTTP 401
remote/ssh behavior changed by P0.1
```

## 25.4 BLOCKED Conditions

```text
Golden upstream unreachable
unrelated baseline CI guard prevents full suite
governance acceptance infrastructure unavailable
external service unavailable
```

这些情况必须保留已经跑出的局部 PASS/FAIL，不得把 BLOCKED 写成全量 PASS。

---

# 26. Golden Consumer / Real-world Acceptance

Golden Consumer：

```text
Desktop:
smc-copilot/apps/work

Runtime:
Hermes Agent v0.21.0

Provider:
enterprise OpenAI-compatible NEW-API

Model:
at least one secret-backed named custom model
```

## 26.1 Golden Scenario

```text
1. 在 Provider Settings 新建/编辑 Provider
2. transaction save
3. verify providers.json v2
4. verify profile .env key reference
5. verify config.yaml providers:<providerKey>
6. 在该 Provider 下新增 Model
7. verify model.providerRef
8. Chat ModelPicker 选择模型
9. verify Session providerRef before first request
10. Gateway local send
11. verify named-config / providerKey / no bare custom
12. Dashboard local send
13. verify same provider identity
14. resume Session
15. verify no baseURL heuristic needed
16. prepare a legacy Session fixture
17. first send migrates + persists + sends
18. second send reads canonical state directly
19. prepare legacy Global Active Model fixture
20. send migrates global model and removes identity base_url
```

## 26.2 Golden Oracle

```text
Provider Settings save = PASS
Provider projection = PASS
Model providerRef = PASS
new Session canonical = PASS
Gateway identity = PASS
Dashboard identity = PASS
legacy Session migration = PASS
global migration = PASS
bare custom request count = 0
secret leakage count = 0
HTTP 401 count = 0
```

## 26.3 Upstream Classification

```text
HTTP 2xx:
Golden upstream PASS

HTTP 401:
Golden FAIL

network unreachable / DNS / timeout / server 5xx:
upstream BLOCKED
identity assertions continue to be evaluated independently
```

Synthetic fixture MUST NOT 替代最终 Golden Consumer。

---

# 27. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Evidence | Release |
|---|---|---|---|---|
| REQ-WIRE-001 | INV-WIRE-001 | A-WIRE-001, A-NEG-001 | EVID-A-WIRE-001 | REQUIRED |
| REQ-DATA-001 | INV-DATA-001 | A-DATA-001 | EVID-A-DATA-001 | REQUIRED |
| REQ-PROJ-001 | INV-PROJ-001 | A-PROJ-001 | EVID-A-PROJ-001 | REQUIRED |
| REQ-MODEL-001 | INV-MODEL-001 | A-MODEL-001, A-NEG-002 | EVID-A-MODEL-001 | REQUIRED |
| REQ-PICKER-001 | INV-PICKER-001 | A-PICKER-001, A-NEG-003 | EVID-A-PICKER-001 | REQUIRED |
| REQ-SESSION-001 | INV-SESSION-001 | A-SESSION-001, A-NEG-004 | EVID-A-SESSION-001 | REQUIRED |
| REQ-MIG-001 | INV-MIG-SESSION-001 | A-MIG-SESSION-001, A-NEG-005/009 | EVID-A-MIG-SESSION-001 | REQUIRED |
| REQ-MIG-002 | INV-MIG-GLOBAL-001 | A-MIG-GLOBAL-001, A-NEG-006/009 | EVID-A-MIG-GLOBAL-001 | REQUIRED |
| REQ-ROUTE-001 | INV-ROUTE-001 | A-ROUTE-001, A-NEG-007 | EVID-A-ROUTE-001 | REQUIRED |
| REQ-RUNTIME-001 | INV-RUNTIME-001 | A-RUNTIME-001 | EVID-A-RUNTIME-001 | REQUIRED |
| REQ-PROFILE-001 | profile isolation | A-PROFILE-001 | EVID-A-PROFILE-001 | REQUIRED |
| REQ-SEC-001 | secret containment | A-SEC-001, A-NEG-008 | EVID-A-SEC-001 | REQUIRED |
| REQ-COMPAT-001 | heuristic only migration | A-NEG-009/010 | EVID-A-ROUTE-001 | REQUIRED |
| REQ-OBS-001 | redacted observability | A-OBS-001 | EVID-A-OBS-001 | REQUIRED |
| REQ-VERIFY-001 | evidence before verified | A-VERIFY-001 | EVID-A-VERIFY-001 | REQUIRED |
| REQ-GATE-001 | blocker classification | A-VERIFY-001 | EVID-A-VERIFY-001 | REQUIRED |

---

# 28. Plan Generation Contract

当前本文：

```text
status = APPROVED_FOR_PLAN
```

因此：

```text
MAY 生成正式 .plan.md
MUST NOT 将 implementation plan 标记为 final / approved，直到该 plan 自己的评审完成
MUST NOT 开始 NodeDeskClaw Bootstrap implementation（P0.1-D-12）
```

## 28.1 Semantic Gap Check

生成 Plan 前必须确认：

```text
[x] Provider save writer 唯一
[x] ProviderRecordV2 renderer contract 冻结
[x] named model providerRef mandatory 冻结
[x] Picker providerRef contract 冻结
[x] profile catalog 文件与 catalog 读取写入范围冻结（P0.1-D-18、D-19、D-20、D-22）
[x] listCustomProviders 0 mutation 冻结（P0.1-D-16）
[x] removeCustomProvider 已知缺口冻结（P0.1-D-17）
[x] providerKey 算法与 builtin slug 闭集冻结（P0.1-D-15、D-20）
[x] model 行兼容字段 override parent decision 冻结（P0.1-D-21）
[x] new Session canonical rule 冻结
[x] legacy Session persistence order 冻结（P0.1-D-23）
[x] global migration write-back rule 冻结（P0.1-D-23）
[x] projection semantic verify 冻结
[x] runtime reload order 冻结（P0.1-D-23）
[x] remote/ssh no-change 冻结
[x] Golden/CI blocker taxonomy 冻结
```

上表由 2026-09-27 grilling 写入 v1.1，并经同日验证后随本文进入 `APPROVED_FOR_PLAN`。`.plan.md` 可以生成；plan 本身在完成自己的评审前不得标为 final / approved。

任一未确认：

```text
SPEC_SEMANTIC_GAP
BLOCK final plan
```

## 28.2 Plan Requirement Coverage

每个 implementation Todo MUST 至少标注：

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

---

# 29. `.plan.md` 输出标准

推荐 Plan 最少拆分为以下独立 Todo，但 Plan Agent MAY 在不改变 Requirement 边界的前提下调整任务粒度。

```yaml
id: p01-t1-provider-save-wiring
requirement_refs:
  - REQ-WIRE-001
  - REQ-DATA-001
  - REQ-PROJ-001
acceptance_refs:
  - A-WIRE-001
  - A-DATA-001
  - A-PROJ-001
status: planned
evidence: pending
```

```yaml
id: p01-t2-model-providerref
requirement_refs:
  - REQ-MODEL-001
  - REQ-PICKER-001
acceptance_refs:
  - A-MODEL-001
  - A-PICKER-001
status: planned
evidence: pending
```

```yaml
id: p01-t3-session-canonical
requirement_refs:
  - REQ-SESSION-001
acceptance_refs:
  - A-SESSION-001
status: planned
evidence: pending
```

```yaml
id: p01-t4-legacy-session-migration
requirement_refs:
  - REQ-MIG-001
  - REQ-RUNTIME-001
acceptance_refs:
  - A-MIG-SESSION-001
  - A-RUNTIME-001
status: planned
evidence: pending
```

```yaml
id: p01-t5-global-model-migration
requirement_refs:
  - REQ-MIG-002
  - REQ-RUNTIME-001
acceptance_refs:
  - A-MIG-GLOBAL-001
status: planned
evidence: pending
```

```yaml
id: p01-t6-route-parity
requirement_refs:
  - REQ-ROUTE-001
  - REQ-COMPAT-001
acceptance_refs:
  - A-ROUTE-001
status: planned
evidence: pending
```

```yaml
id: p01-t7-security-profile-observability
requirement_refs:
  - REQ-PROFILE-001
  - REQ-SEC-001
  - REQ-OBS-001
acceptance_refs:
  - A-PROFILE-001
  - A-SEC-001
  - A-OBS-001
status: planned
evidence: pending
```

```yaml
id: p01-t8-verification-golden
requirement_refs:
  - REQ-VERIFY-001
  - REQ-GATE-001
acceptance_refs:
  - A-VERIFY-001
status: planned
evidence: pending
```

状态规则：

```text
planned
→ in_progress
→ implemented
→ verified
```

只有 Acceptance 有 **实际执行 Evidence** 才能 `verified`。

---

# 30. Code Review Contract

Review MUST 按以下顺序执行：

```text
1. Scope
   local only?
   remote/ssh untouched?

2. Writer ownership
   normal Provider Settings 是否只剩一个 production writer?

3. Provider identity
   ProviderRecordV2/providerKey/keyEnv 是否稳定?

4. Model identity
   new named models 是否强制 providerRef?

5. Picker
   providerRef 是否从 list 到 click 不丢?

6. Session
   new Session 是否首次 canonical?
   legacy Session 是否 same-send persist?

7. Global active model
   migration 是否持久化 providerKey 并移除 identity base_url?

8. Projection
   save success 是否经过 semantic re-read verify?

9. Runtime apply
   required restart 是否发生在 request 之前?
   restart failure 是否 0 network?

10. Routing
    Gateway/Dashboard 是否同一 providerKey?
    bare custom 次数是否 0?

11. Security
    是否产生 model.api_key / JSON/DB secret leakage?

12. Profile
    是否任何 writer 偷读 HERMES_PROFILE 覆盖 explicit profile?

13. Compatibility
    heuristic 是否只在 migration?
    unknown entries 是否保留?

14. Tests/Evidence
    是否实际运行?
    是否有 negative/failure injection?

15. Golden Consumer
    是否真实 Hermes + NEW-API?
    是否无 401?

16. Code quality
    是否新增重复 Store / alias / fallback?
```

Review 如果发现：

```text
"为了兼容再加一个 Provider map"
"如果找不到 named provider 就 fallback custom"
"根据 baseUrl 在 normal send 时猜一次"
"把 api_key 写进 config.yaml 更简单"
```

必须判定违反 PRD。

---

# 31. PRD Quality Gate

## Architecture

```text
[x] P0.1 目标唯一：production wiring closure
[x] Parent PRD relationship 明确
[x] System boundary 明确
[x] SOT 明确
[x] Writer ownership 明确
[x] local / remote scope 明确
```

## Data

```text
[x] ProviderRecordV2 明确
[x] Model ProviderRef contract 明确
[x] Session ProviderRef contract 明确
[x] Global active model canonical form 明确
[x] Runtime route 明确
```

## Failure

```text
[x] Provider transaction rollback 明确
[x] Session migration failure 明确
[x] Global migration failure 明确
[x] Runtime reload failure明确
[x] ambiguity 0 network 明确
```

## Security

```text
[x] Secret store 唯一
[x] Renderer secret 生命周期明确
[x] Evidence redaction 明确
[x] model.api_key workaround 禁止
```

## Verification

```text
[x] Acceptance IDs 明确
[x] Negative Acceptance 明确
[x] Failure Injection 明确
[x] Golden Consumer 明确
[x] PASS/FAIL/BLOCKED 明确
[x] Baseline blockers 单独分类
```

## Current Status

```text
[x] PRD review completed
[x] status = APPROVED_FOR_PLAN
```

验证记录（2026-09-27）：

```text
父 PRD v1.1 status = APPROVED_FOR_PLAN
P0.1-D-15～D-23 覆盖本文内部冲突句子
唯一 override parent decision = P0.1-D-21
§27 每条 Requirement 都有 Acceptance 与 Evidence
§28.1 semantic gap checklist 已勾选
```

---

# 32. PRD 禁止写法

后续 Plan / Code Review 不接受以下模糊语义：

```text
“优化 Provider 稳定性”
“尽量保留 providerRef”
“必要时匹配 baseUrl”
“兼容 custom”
“保存后同步一下 YAML”
“如果失败 fallback”
“测试基本通过”
“应该不会 401”
“模型可以通过 Provider 名称找回来”
```

必须转换成本文中的：

```text
ProviderRef
providerKey
Production Writer
Semantic Projection Verify
same-send persist
0 mutation
0 model request
Error Code
Acceptance
Oracle
Evidence
Release Gate
```

---

# 33. ID 体系

本文使用：

```text
SCOPE-P01-xxx
NON-GOAL-P01-xxx
KNOWN-GAP-P01-xxx
P0.1-D-xx
REQ-WIRE-xxx
REQ-DATA-xxx
REQ-PROJ-xxx
REQ-MODEL-xxx
REQ-PICKER-xxx
REQ-SESSION-xxx
REQ-MIG-xxx
REQ-ROUTE-xxx
REQ-RUNTIME-xxx
REQ-PROFILE-xxx
REQ-SEC-xxx
REQ-COMPAT-xxx
REQ-OBS-xxx
REQ-VERIFY-xxx
REQ-GATE-xxx

INV-xxx
A-xxx
A-NEG-xxx
EVID-A-xxx
GATE-xx
```

不得复用父 PRD Requirement ID 来表达不同语义；父 PRD Requirement 仍作为上层 contract reference。

---

# 34. PRD 最小完整结构检查

本文已覆盖：

```text
0. PRD 使用原则 / No-Inference
1. Metadata / baseline
2. Goal / frozen decisions
3. Background / problem
4. Scope / non-goal / known gap / impact surface
5. Terminology
6. System context
7. SOT
8. State machine
9. Data/schema contract
10. Requirement units
11. Side-effect contract
12. Ownership contract
13. Identity contract
14. Transaction contract
15. Conflict contract
16. Compatibility/migration
17. External dependency
18. Security
19. Observability
20. Acceptance design
21. Acceptance matrix
22. Negative acceptance
23. Failure injection
24. Evidence
25. Release gate
26. Golden consumer
27. Traceability
28. Plan generation contract
29. Plan output standard
30. Code review contract
31. PRD quality gate
32. Forbidden wording
33. ID system
34. Structure check
35. Definition of Done
```

---

# 35. Definition of Done

## 35.1 PRD DoD — 进入 Plan 前

```text
[x] Architecture review 完成
[x] Provider/Chat owner review 完成
[x] P0.1-D-01～D-23 无 semantic gap
[x] Requirement / Acceptance / Evidence 一一可追踪
[x] status 从 DRAFT_FOR_REVIEW 更新为 APPROVED_FOR_PLAN
```

## 35.2 Implementation DoD — P0.1 完成

```text
[ ] Provider Settings normal save = saveNamedProvider transaction
[ ] ProviderRecordV2 回到 Renderer
[ ] legacy writer 不再承担正常 UI save
[ ] projection semantic verify 成为 commit gate

[ ] new named model providerRef REQUIRED
[ ] ModelPicker row/provider selection 携带 providerRef
[ ] new Session override 首次 canonical

[ ] legacy Session unique migration 同一次 send 写回 providerRef
[ ] migration success 后第二次 send 无 identity heuristic
[ ] legacy Global Active Model unique migration 写回 providerKey
[ ] identity model.base_url 被移除

[ ] Gateway local = named-config
[ ] Dashboard local = named-config
[ ] same input 两 transport providerKey 一致
[ ] bare custom request count = 0
[ ] custom:<name> request count = 0

[ ] required runtime restart 发生在 request 前
[ ] restart failure = 0 model request

[ ] secret only in approved profile .env
[ ] providers/models/session/evidence 无明文 secret
[ ] config.yaml model.api_key 未由本功能创建

[ ] explicit profile isolation PASS
[ ] unknown legacy ownership entries preserved
[ ] remote/ssh regression = 0

[ ] targeted Provider Identity tests executed
[ ] full Work tests executed or unrelated blocker explicitly BLOCKED with evidence
[ ] typecheck executed or blocker explicitly recorded
[ ] build executed or blocker explicitly recorded
[ ] Golden Consumer identity gate PASS
[ ] Golden Consumer HTTP 401 count = 0

[ ] lat.md architecture/test docs updated when code behavior changes
[ ] lat check PASS before final implementation completion claim
```

## 35.3 Exit Criteria to Next Stage

只有以下条件同时满足，才允许进入 **NodeDeskClaw Bootstrap / Provider 自动下发**：

```text
P0.1 Implementation DoD complete
AND canonical Provider contract stable
AND Provider Settings → Model → Session → Gateway/Dashboard end-to-end PASS
AND Golden Consumer no 401
AND no secret duplication
```

否则：

```text
MUST remain in Provider Identity stabilization
MUST NOT expand provisioning surface
```

---

# Appendix A — P0.1 目标架构摘要

```text
                         smc-copilot / apps/work

┌─────────────────────────────────────────────────────────────────────────────┐
│ Control Plane                                                               │
│                                                                             │
│ Provider Settings                                                           │
│      │                                                                      │
│      ▼                                                                      │
│ saveNamedProvider()                                                         │
│      │                                                                      │
│      ├── providers.json v2  ← Provider Registry SOT                         │
│      ├── profile .env       ← Secret SOT                                    │
│      └── config.yaml providers:<providerKey> ← Hermes Projection            │
│                   │                                                         │
│                   └── semantic verify                                       │
│                                                                             │
│ Model Catalog                                                               │
│      │ providerRef=named:<providerKey>                                      │
│      ▼                                                                      │
│ ModelPicker                                                                 │
│      │ providerRef                                                          │
│      ▼                                                                      │
│ SessionModelOverrideV2                                                      │
│                                                                             │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Chat Data Plane                                                             │
│                                                                             │
│ Runtime Provider Resolver                                                   │
│       │                                                                     │
│       ├─────────────┐                                                       │
│       ▼             ▼                                                       │
│ Gateway /v1    Dashboard /api/ws                                            │
│ providerKey    providerKey                                                  │
│       │             │                                                       │
│       └──────┬──────┘                                                       │
│              ▼                                                              │
│          Hermes Agent                                                       │
│              │                                                              │
│              ▼                                                              │
│      Enterprise NEW-API                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Appendix B — 当前 Baseline Verification Blockers

以下是 2026-09-27 baseline snapshot，不改变本文功能 Requirement。

## B.1 Work CI

```text
run: 36291626807
HEAD: a121b246b7243bb16b33ba1da5e9ec7e0de8cab2

Install: PASS
Guard: FAIL
Typecheck: SKIPPED
Test: SKIPPED
Build: SKIPPED
```

已知 Guard：

```text
check:no-legacy-hermes-runtime
src/main/runtime/hermes-runtime-config.ts
legacy literal: hermes-agent/venv
```

该文件与前一 baseline blob 相同，因此不得将该 Guard failure 归因于 P0.1 Provider wiring。

处理规则：

```text
- 可以单独做 behavior-neutral guard/comment cleanup；
- 或记录 BLOCKED_BASELINE；
- 但 Provider tests 仍必须在可执行环境中实际运行；
- 不得因 Guard unrelated 就把 Provider implementation 直接标 verified。
```

## B.2 SMC Governance Acceptance

当前 workflow 在实际 PRD Acceptance 前被 repository governance bootstrap/configuration 阻止。

处理规则：

```text
- 这是 Governance infrastructure blocker；
- 不替代 P0.1 functional acceptance；
- 不把其失败写成 Provider FAIL；
- 不把其缺失写成 Provider PASS。
```

---

# Appendix C — Engineering Review Checklist

```text
Provider Settings
[ ] normal save only one writer
[ ] return ProviderRecordV2
[ ] providerKey stable
[ ] keyEnv not renderer-derived
[ ] secret cleared from renderer state

Projection
[ ] providers:<providerKey>
[ ] re-read semantic verify
[ ] drift blocks
[ ] rollback T0

Model
[ ] new named row providerRef required
[ ] legacy fields display/compat only

Picker
[ ] providerRef present
[ ] providerRef passed on click
[ ] no baseURL derivation

Session
[ ] new session canonical
[ ] legacy same-send persist
[ ] ambiguous blocks

Global model
[ ] unique migration persists providerKey
[ ] identity base_url removed
[ ] ambiguous blocks

Runtime
[ ] route named-config
[ ] Gateway/Dashboard parity
[ ] no bare custom
[ ] no custom:<name>
[ ] restart before send when required
[ ] restart fail = zero request

Security
[ ] no model.api_key
[ ] no secret JSON/DB/log/evidence
[ ] profile isolation

Compatibility
[ ] unknown ownership preserved
[ ] remote/ssh unchanged

Verification
[ ] targeted tests
[ ] full suite
[ ] typecheck
[ ] build
[ ] Golden Consumer
[ ] Evidence attached
```
