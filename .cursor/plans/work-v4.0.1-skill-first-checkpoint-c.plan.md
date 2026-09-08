---
plan_contract: smc.plan.v3.2
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1
grounded_commit: c10ae2fdc9bd7d286d828836c80fcbc2debb6257
grounding_source: committed_baseline
working_tree_fingerprint: sha256:b2d48ef4ccf01ad0c8414286e972eeb00c795020d631f3fb50f42249b8719592
---

# WORK-SKILL-FIRST-LAYOUT-V4.0.1 Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md)

## Scope

- In: <DECIDE>
- Out: <DECIDE>
- Production Owner inherited from PRD: <GROUND>

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| <DECIDE> | `<GROUND>` | <GROUND> | <GROUND> | <GROUND> | <GROUND> | <GROUND> |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Layout 显示一级“使用技能”；空白 scratch 原地切 mode，已有内容时创建/激活独立 Skill Tab，不取消其它运行。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-02 | AC | View 不新增 Skill Chat 页面；现有 Chat/MessageList/ChatInput 被复用。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-03 | AC | ChatRun 只拥有 execution mode；Skill selection truth 在当前 Chat 中唯一，提交/排队保存不可变 snapshot。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-04 | AC | 未选择 Skill 时展示 Catalog 并禁用发送；选择后展示 Selection Bar；全部错误/空状态可恢复。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-05 | AC | Skill mode 不渲染本地模型、Reasoning、Fast Mode、Context Folder 或 Expert 控件；附件未合同化时明确禁用。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-06 | AC | Catalog 只显示合同可证明为 Skill 的项；缺少 discriminator 时显示 contract unsupported，而不是猜测过滤。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-07 | AC | Work 锁定带 tag/checksum 的完整 Skill Run Consumer Contract；旧 work-expert lock 不变。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-08 | AC | 新调用只使用 toolname 与 runid，不发送 Expert/Agent/Runtime/Profile/Workspace routing 字段。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-09 | AC | Provider runid、Renderer ChatRun.runId 与 clientRequestId 在类型、持久化和日志中不可互换。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-10 | AC | Renderer 无法取得 JWT、Backend/Agent URL、raw Provider event、download token 或 absolute path。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-11 | AC | Main 是唯一 Skill Run lifecycle owner；Renderer store 仅为 projection。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-12 | AC | 不确定网络与 App 重启使用同一 idempotency identity 恢复，跨端证明只创建一个 Provider Run。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-13 | AC | SSE replay 去重、terminal 单调、poll fallback 和 cleanup 可验证；旧事件不能回退终态。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-14 | AC | 同一 Chat Tab 至多一个 active Skill Run；queue item 不因用户更换 Skill 而改路由。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-15 | AC | 取消只调用 Skill Run cancel；不得误调用 Local Chat abort。Approval 未合同化时只读等待，不显示伪交互。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-16 | AC | 只有合同枚举事件可产生 activity UI；unknown payload 不文本化、不触发不可逆 UI side effect。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-17 | AC | Result 更新同一 assistant transcript；restart 后 session mode、在途 projection 与历史可恢复且不重复 start。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-18 | AC | Artifact 进入现有 File Platform，以 run-scoped remote identity 去重，并通过现有 Preview/Save As/Materialize API 使用。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-19 | AC | 不得新增 Skill conversation/file parallel SoT 或直接 Artifact download IPC。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-20 | AC | Skill-first、Expert compatibility 与 Local Chat 路径显式互斥；一条消息不会同时创建 Skill Run 与 ExpertTask。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-21 | AC | Skill-first 失败不自动 fallback；回滚停止新建但保留 Skill/Expert 各自 reader。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| AC-22 | AC | Expert 默认创建入口的最终删除满足 Compatibility Contract，并由独立 Removal PRD 执行。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| DOD-01 | DOD | Provider Contract Gate 与 Work Consumer Lock 就绪，无未验证 schema。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| DOD-02 | DOD | Contract、Main、IPC、Renderer 与 Session 聚焦测试全部通过，无回归。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |
| DOD-03 | DOD | 生产切换前通过完整 Checklist，历史任务可独立恢复且无 silent fallback。 | <CLASSIFY> | - | - | <VERIFY> | <EVIDENCE_CLASS> | yes |

## Lifecycle Closure Matrix

Use `None` only when the PRD has no state/concurrency lifecycle requirements.

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| <DECIDE> | <DECIDE> | <DECIDE> | <DECIDE> | <DECIDE> | <DECIDE> | <VERIFY> |

## Contract / Data Flow Closure Matrix

Use `None` only when no data crosses an independent owner, process, network, persistence, queue, or generator boundary.

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| <DECIDE> | <DECIDE> | <GROUND> | <GROUND> | <GROUND> | <GROUND> | <GROUND> | <GROUND> | <GROUND> | <VERIFY> |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Output | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | <VERIFY_LEVEL> | <VERIFY> | <VERIFY> | <VERIFY> | <VERIFY> | <ENVIRONMENT> | yes |

## Immediate Read

- `<GROUND>`

## Triggered Read

- If <trigger>: `<GROUND>`
- Otherwise: do not read

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `<GROUND>` | PROD | MODIFY | <GROUND> | T1 | <TARGET> | Layout 一级“使用技能”入口 | no |
| C02 | `<GROUND>` | PROD | MODIFY | <GROUND> | T2 | <TARGET> | Chat Skill 选择与提交 | no |
| C03 | `<GROUND>` | PROD | ADD | <GROUND> | T3 | <TARGET> | Skill Catalog presentation | no |
| C04 | `<GROUND>` | PROD | ADD | <GROUND> | T4 | <TARGET> | Skill Run Main client/service/IPC | no |
| C05 | `<GROUND>` | PROD | MODIFY | <GROUND> | T5 | <TARGET> | Expert 私有 authorized transport | no |
| C06 | `<GROUND>` | PROD | REPLACE | <GROUND> | T6 | <TARGET> | 员工新 Skill 创建路径 | no |
| C07 | `<GROUND>` | PROD | REMOVE | <GROUND> | T7 | <TARGET> | Expert 新建员工 Skill 路径 | no |
| C08 | `<GROUND>` | PROD | MODIFY | <GROUND> | T8 | <TARGET> | Session / continuation | no |
| C09 | `<GROUND>` | PROD | MODIFY | <GROUND> | T9 | <TARGET> | File Platform remote identity | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | <DECIDE> | <GROUND> | <DECIDE> |
| C02 | <DECIDE> | <GROUND> | <DECIDE> |
| C03 | <DECIDE> | <GROUND> | <DECIDE> |
| C04 | <DECIDE> | <GROUND> | <DECIDE> |
| C05 | <DECIDE> | <GROUND> | <DECIDE> |
| C06 | <DECIDE> | <GROUND> | <DECIDE> |
| C07 | <DECIDE> | <GROUND> | <DECIDE> |
| C08 | <DECIDE> | <GROUND> | <DECIDE> |
| C09 | <DECIDE> | <GROUND> | <DECIDE> |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `<GROUND>` | - | - | no |
| T2 | C02 | `<GROUND>` | - | - | no |
| T3 | C03 | `<GROUND>` | - | - | no |
| T4 | C04 | `<GROUND>` | - | - | no |
| T5 | C05 | `<GROUND>` | - | - | no |
| T6 | C06 | `<GROUND>` | - | - | no |
| T7 | C07 | `<GROUND>` | - | - | no |
| T8 | C08 | `<GROUND>` | - | - | no |
| T9 | C09 | `<GROUND>` | - | - | no |

## Integration Hotspots

None

## Generated Outputs Ledger

None

## Todo T1 — Layout 一级“使用技能”入口

**Owns Changes**
- C01

**Goal**

<DECIDE>

**Immediate anchors**
- `<GROUND>`

**Changes**
- <DECIDE>

**Stop conditions**
- [ ] <VERIFY>

**Triggered reads**
- None unless a listed trigger becomes true


## Todo T2 — Chat Skill 选择与提交

**Owns Changes**
- C02

**Goal**

<DECIDE>

**Immediate anchors**
- `<GROUND>`

**Changes**
- <DECIDE>

**Stop conditions**
- [ ] <VERIFY>

**Triggered reads**
- None unless a listed trigger becomes true


## Todo T3 — Skill Catalog presentation

**Owns Changes**
- C03

**Goal**

<DECIDE>

**Immediate anchors**
- `<GROUND>`

**Changes**
- <DECIDE>

**Stop conditions**
- [ ] <VERIFY>

**Triggered reads**
- None unless a listed trigger becomes true


## Todo T4 — Skill Run Main client/service/IPC

**Owns Changes**
- C04

**Goal**

<DECIDE>

**Immediate anchors**
- `<GROUND>`

**Changes**
- <DECIDE>

**Stop conditions**
- [ ] <VERIFY>

**Triggered reads**
- None unless a listed trigger becomes true


## Todo T5 — Expert 私有 authorized transport

**Owns Changes**
- C05

**Goal**

<DECIDE>

**Immediate anchors**
- `<GROUND>`

**Changes**
- <DECIDE>

**Stop conditions**
- [ ] <VERIFY>

**Triggered reads**
- None unless a listed trigger becomes true


## Todo T6 — 员工新 Skill 创建路径

**Owns Changes**
- C06

**Goal**

<DECIDE>

**Immediate anchors**
- `<GROUND>`

**Changes**
- <DECIDE>

**Stop conditions**
- [ ] <VERIFY>

**Triggered reads**
- None unless a listed trigger becomes true


## Todo T7 — Expert 新建员工 Skill 路径

**Owns Changes**
- C07

**Goal**

<DECIDE>

**Immediate anchors**
- `<GROUND>`

**Changes**
- <DECIDE>

**Stop conditions**
- [ ] <VERIFY>

**Triggered reads**
- None unless a listed trigger becomes true


## Todo T8 — Session / continuation

**Owns Changes**
- C08

**Goal**

<DECIDE>

**Immediate anchors**
- `<GROUND>`

**Changes**
- <DECIDE>

**Stop conditions**
- [ ] <VERIFY>

**Triggered reads**
- None unless a listed trigger becomes true


## Todo T9 — File Platform remote identity

**Owns Changes**
- C09

**Goal**

<DECIDE>

**Immediate anchors**
- `<GROUND>`

**Changes**
- <DECIDE>

**Stop conditions**
- [ ] <VERIFY>

**Triggered reads**
- None unless a listed trigger becomes true


## Verification

Use the Verification Ledger as the only evidence SOT; this section orders the final commands.

```bash
<VERIFY>
```

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | <VERIFY> | <VERIFY> |
| IMPLEMENTED_NOT_PROVEN | <VERIFY> | <VERIFY> |
| BLOCKED | <VERIFY> | <VERIFY> |
| RETURN_PRD | <VERIFY> | <VERIFY> |
