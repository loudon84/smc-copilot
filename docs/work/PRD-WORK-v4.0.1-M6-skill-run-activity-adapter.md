---
work_item_id: RM-08
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-06T23:55:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.2/RM-08
grounded_commit: bbd78293f673a3b9acd6f3ea5a954cba530df1ad
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.2.1
product_decision: user-input:2026-09-06-m6-split-expert-removal-from-p1
---

# WORK PRD v4.0.1 M6b — Skill Run Activity Adapter

本 Stage PRD 关闭架构 P1 中「合同化细粒度 Run Activity」的**只读映射**：把 v1.2.1 Bundle 已枚举的 `reasoning.summary`、`tool.call`、`clarify.requested`、`approval.requested` 从 parser `rawUnknown` 提升为 sanitized Work activity projection，并由现有 `modules/skill-run` 展示。Main parser / SkillRunService 仍是唯一事件适配 Owner。本阶段不增加 Approval decision、不回答 clarify、不复用 Local Chat `ClarifyCard` / `clarify-respond`，也不修改 Provider Bundle。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-08` / M6b P1 合同化 Run Activity |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.2/RM-08` |
| Architecture | 父 PRD P1「合同化的细粒度 Run Activity」；Agent output adaptation：P0 只呈现 phase/result；P1 才映射 reasoning / tool / clarify / approval |
| Repository baseline | `bbd78293f673a3b9acd6f3ea5a954cba530df1ad` |
| Dependencies | RM-06 is `DONE`。v1.2.1 `events/run-event.schema.json` 已 `oneOf` 枚举上述四类事件。 |
| Provider input | `contracts/skill-run/v1.2.1/`。`capabilities/unsupported.schema.json` 将 `approval` 与 `attachments` 标为 `unsupported`。endpoint matrix **没有** Approval decision 或 clarify respond。 |
| Current parser | `assistant.message` 与 `artifact.persisted` 已映射。`reasoning.summary` / `tool.call` / `clarify.requested` / `approval.requested` 落入 `default` → `rawUnknown: true`。`run.waiting_approval` 只把 phase 设为 `waiting-approval`，不带 approval 摘要。 |
| Current projection | `SkillRunProjection` 只有 phase / displayStage / text / artifacts / error；没有 activity 列表。 |
| Current UI | `SkillRunStatusBar` 只显示 compact phase。Local Chat `ClarifyCard` 绑定 Hermes `clarify.request` + `clarify-respond` IPC，**不是** Skill Run 合同。 |
| Out of this Item | Expert 默认入口（RM-07）；Approval decision（RM-09）；JSON Schema 表单（RM-10）；Attachment（RM-11）；收藏（RM-12）；streaming token delta（Bundle 无独立 delta 事件）。 |

## Problem and Outcome

v1.2.1 已经用 discriminated union 发布了 reasoning / tool / clarify / approval.requested 的 payload 形状，但 Work parser 把它们当 unknown：只推进去重游标，UI 看不到摘要。P0 这是正确 fail-soft。P1 若继续不映射，用户在等待审批或工具调用时只能看到笼统 phase。若错误地复用 Local Chat `ClarifyCard` 去「回答」Skill `clarify.requested`，答案会走 Hermes `clarify-respond`，而 Skill Run matrix 没有对应 endpoint，造成跨合同副作用。

完成后，上述四类已枚举事件成为 Main 产出的 bounded、已清洗 activity items，经现有 projection 订阅到达 `modules/skill-run`。`approval.requested` 可把 phase 保持或设为 `waiting-approval` 并展示 summary，**不**出现允许/拒绝控件。`clarify.requested` 只展示 question 与已清洗的 string 选项，**不**提供回答动作。unknown 事件仍 `rawUnknown`，不文本化 payload。Expert 入口、Approval decision、表单与附件不在本阶段。

## Scope

- In: 扩展现有 Skill Run contract parser 与 projection DTO，映射 Bundle 已枚举的四类 activity 事件；Renderer `modules/skill-run` 只读展示；unknown 继续 fail-soft；`approval.requested` 只读等待；证明不调用 Local Chat clarify IPC，不新增 decision/respond IPC。
- Out: Approval decision endpoint / 允许拒绝卡片（RM-09）；把 `approval` capability 从 `unsupported` 改掉；Attachment；JSON Schema 表单；Expert 默认入口删除；Local Chat / Dashboard `ClarifyCard` 改接到 Skill Run；streaming delta 猜测；修改 v1.2.1 Bundle；向 Renderer 传递 raw Provider event 或 tool arguments。
- Production Owner: Main contract parser 拥有 event → activity 适配。SkillRunService 拥有 projection 合并、去重、terminal monotonic。Renderer `modules/skill-run` 拥有 activity 展示。MessageList / `ClarifyCard` 不拥有 Skill Run activity。File Platform 不因 activity 改变 Artifact 所有权。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Event discriminated union | v1.2.1 Bundle | 已枚举 assistant / reasoning / tool / clarify / approval.requested / artifact / control | EXISTS（external） |
| Parser phase / result / artifact | Skill Run contract parser | P0 映射稳定；四类 P1 事件 `rawUnknown` | PARTIAL |
| Projection DTO | `SkillRunProjection` | 无 activity items | PARTIAL |
| Compact run status UI | `SkillRunStatusBar` | 只显示 phase / error / artifact retry | EXISTS |
| Unknown event policy | SkillRunService | `rawUnknown` 不驱动 UI 副作用 | EXISTS |
| Approval decision | Provider capability | `approval: unsupported`；无 decision 路径 | MISSING（本阶段不 ADD） |
| Skill clarify answer | Skill Run HTTP | matrix 无 respond endpoint | MISSING（本阶段不 ADD） |
| Local Chat clarify | Chat `ClarifyCard` + `clarify-respond` | Hermes 专用，与 Skill Run 合同不兼容 | EXISTS（禁止复用） |
| Expert 默认入口 | Chat Composer | 仍存在；属 RM-07 | KEEP absent from this Item |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Enumerated activity mapping | Existing contract parser | `reasoning.summary` → 只读 summary；`tool.call` → tool_name + call_id + status（无 arguments）；`clarify.requested` → question + string options；`approval.requested` → approval_id + summary，并可进入 `waiting-approval` | MODIFY |
| Projection activity list | Existing SkillRunProjection / SkillRunService | bounded 已清洗 activity items 随现有 subscribe 下发；非 Provider DTO | MODIFY |
| Activity presentation | Existing `modules/skill-run` | 只渲染 projection activity；不引入第二 Chat 页面，不让 MessageList 解析 Provider event | MODIFY |
| Unknown / control events | Existing parser + service | 未枚举或 control `run.` 模式中非 P0 已映射者保持 `rawUnknown`；不文本化 payload | KEEP |
| Compact phase status | Existing `SkillRunStatusBar` | 继续显示 phase；activity 是附加只读信息，不替换 StatusBar | KEEP |
| Approval decision / clarify respond | n/a | 继续缺失；UI 无伪交互按钮 | KEEP absent |
| Local Chat ClarifyCard | Existing Chat clarify owner | 行为不变；Skill Run 不调用 `clarify-respond` | KEEP |
| Bundle / Expert 合同 | Provider / Expert owners | 不修改 | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Parser 对 v1.2.1 已枚举 activity 事件 | MODIFY | 现有 parser 已是唯一适配 Owner；把四类事件从 `rawUnknown` 提升为 sanitized delta。禁止为缺失 schema 写补偿 parser。 |
| C02 | Projection 携带 bounded activity | MODIFY | 扩展现有 `SkillRunProjection`，不新增第二 projection store 或 IPC channel。 |
| C03 | `modules/skill-run` 只读 activity UI | MODIFY | 现有 presentation module 展示 activity；MessageList / ClarifyCard 不是 Owner。 |
| C04 | Unknown event fail-soft | KEEP | 未枚举事件仍只推进游标。 |
| C05 | Approval decision 与 clarify respond | KEEP absent | Bundle 仍 `unsupported` 且无 endpoint。只读展示不是 decision 合同。 |
| C06 | Local Chat clarify 路径 | KEEP | 证明零调用；禁止把 Skill clarify 接进 Hermes IPC。 |

## Replacement / Removal Matrix

本 Item 无 REPLACE。不删除 Local Chat `ClarifyCard`。不删除 P0 compact `SkillRunStatusBar`。

## Contract and Security Boundary

- 只消费 v1.2.1 已枚举 `event_type` 与 `$defs` 字段。`tool.call` 不得投影 arguments / JWT / URL。`clarify.requested` 的 `options` 只保留可显示的 string 标签，丢弃非 string / 超限项。
- activity 经现有 sanitized projection 订阅下发；不新增 `skillRun.activity` raw event channel。
- Renderer 不得获得 raw Provider event、approval 内部 descriptor 之外的 id 用途（`approval_id` 仅用于只读展示与去重，不得拿去调未发布 endpoint）。
- `approval.requested` 不得渲染允许/拒绝。`clarify.requested` 不得渲染发送/跳过并调用任何 respond IPC。
- 不得使用 Local Chat / Dashboard `clarify-respond`、`chat-clarify-request` 或 Runtime ChatRun 事件适配器。
- telemetry 若记录 activity 相关事件，仍遵守 M5 字段允许名单；不写 summary 全文、question 全文或 tool arguments。

## Acceptance Criteria

1. fixture 中的 `reasoning.summary`、`tool.call`、`clarify.requested`、`approval.requested` 使 projection 出现对应 sanitized activity item；不再仅以 `rawUnknown` 丢弃。
2. activity item 不含 tool arguments、JWT、URL、absolute path、raw payload object。`tool.call` 只含合同字段 tool_name / call_id / status。
3. `approval.requested` 展示 summary 且无允许/拒绝控件；phase 为 `waiting-approval` 或保持既有非终态，且旧事件不能把终态回退。
4. `clarify.requested` 展示 question；选项若存在则仅为 string；无回答/跳过动作，且测试证明不调用 `clarify-respond` 或 Expert / Skill 未发布 endpoint。
5. 未枚举事件仍 `rawUnknown`，不把 payload 文本化进 transcript 或 activity。
6. Local Chat `ClarifyCard` focused tests 无回归。Skill 失败不创建 ExpertTask。不声称 Approval decision 或 Attachment 已启用。
7. Renderer 仍无法取得 raw Provider event。不得新增 Skill Chat 页面或第二 Session/File owner。

## Definition of Done

1. C01–C03 有 parser / projection / presentation focused tests，并覆盖 AC-04 的负向「无 respond IPC」。C04–C06 由既有 unknown / Local Chat / Expert 套件回归。
2. RM-08 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。
3. 发现需要 decision/respond endpoint、改 Bundle、`ClarifyCard` 复用、表单或 Expert 入口删除的工作，必须返回对应 Roadmap Item，不得混入本 Item。

## Source Anchors

- `apps/work/src/main/skill-run/skill-run-contract-parser.ts`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/shared/skill-run.ts#SkillRunProjection`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx`
- `apps/work/src/renderer/src/screens/Chat/ClarifyCard.tsx`
- `contracts/skill-run/v1.2.1/events/run-event.schema.json`
- `contracts/skill-run/v1.2.1/capabilities/unsupported.schema.json`
- `contracts/skill-run/v1.2.1/http/endpoint-matrix.json`
- `contracts/skill-run/v1.2.1/fixtures/run-event-reasoning-summary.json`
- `contracts/skill-run/v1.2.1/fixtures/run-event-tool-call.json`
- `contracts/skill-run/v1.2.1/fixtures/run-event-clarify-requested.json`
- `contracts/skill-run/v1.2.1/fixtures/run-event-approval-requested.json`
- `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md#Agent output adaptation`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md#Milestone M6 — Expert Removal and Independent P1 Items`
