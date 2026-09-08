---
decision_id: AD-WORK-v4.0.1-STREAMING-DELTA
version: 1.0.1
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-08T19:24:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1 + user-input:2026-09-08-streaming-delta-provider-first
grounded_commit: 6a462238bee58f547855b68c57417f2f0442745c
---

# AD-WORK-v4.0.1 — Streaming token delta 合同进口与映射边界

本 Decision 是 APPROVED 架构 PRD `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md` 的 **named increment**，不取代该文件，也不把 Roadmap 的 `architecture_decision` 指针改到本 AD。它只冻结：在 Provider 发布并被 Work 进口一份**已枚举** streaming/token delta 事件合同之前，Work 不得 Grounding Stage PRD，也不得猜测 parser。

## Problem

架构 P1 写了「合同化的细粒度 Run Activity（reasoning、tool、clarify、streaming delta）映射」。RM-08 已映射 v1.2.1 已枚举的 `reasoning.summary` / `tool.call` / `clarify.requested` / `approval.requested`，并显式把 **streaming token delta** 排除：当时 Bundle 没有独立 delta 事件。

RM-01–RM-12 现已全部 DONE。`roadmap_next` 对 `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` 返回 `ROADMAP_NO_READY_ITEM`。用户要求下一阶段做 streaming delta。现行消费合同 `contracts/skill-run/v1.4.0` 仍无独立 delta 事件类型；`assistant.message` 只携带完整 `payload.text`。若现在写 Work Stage PRD 或在 parser 里把 `assistant.message` 伪装成字打，就会违反「未枚举不得映射」和 fail-closed。

## Decision Drivers

- 父架构：只有 Event contract 枚举 event type 与 payload 后，P1 才映射 streaming delta。未知事件只推进去重游标，不文本化 payload。
- RM-08 Stage PRD Out：`streaming token delta（Bundle 无独立 delta 事件）`；禁止 streaming delta 猜测。
- 用户约束：Provider 先发新 Bundle；本仓先立「进口未来 Bundle」Item，映射 UI 另立后续 Item；Bundle 尚不存在时两项都保持 BACKLOG，现在不写 Stage PRD。
- Work 不是 Provider Bundle author；只消费不可变 tag + checksum lock。

## Evidence Baseline

| Claim | Type | Evidence |
|---|---|---|
| v4.0.1 Roadmap RM-01–RM-12 均为 DONE，无 READY Item | REPO_FACT | `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`；`roadmap_next` → `ROADMAP_NO_READY_ITEM` |
| 父架构 P1 含 streaming delta，且要求事件已枚举 | SOURCE_FACT | `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md` P1 列表与 Agent output adaptation 段 |
| RM-08 排除 streaming delta | SOURCE_FACT | `docs/work/PRD-WORK-v4.0.1-M6-skill-run-activity-adapter.md` Out of this Item |
| v1.4.0 事件 oneOf 无 delta 类型 | REPO_FACT | `contracts/skill-run/v1.4.0/events/run-event.schema.json`：`assistant.message` / `reasoning.summary` / `tool.call` / `clarify.requested` / `approval.requested` / `artifact.persisted` |
| `assistant.message` 是完整 text，不是 token delta | REPO_FACT | `contracts/skill-run/v1.4.0/fixtures/run-event-assistant-message.json` `payload.text` |
| v1.4.0 未声明 streaming-delta capability | REPO_FACT | `contracts/skill-run/v1.4.0/RELEASE.md`；`capabilities/unsupported.schema.json` 仅 `attachments` / `approvalExpiry` |
| Provider 先发 Bundle，Work 后进口再映射 | USER_CONSTRAINT | 2026-09-08 会话选择 `provider_first` + `work_import_item` + `no_bundle_backlog` |
| 当前 `grounded_commit` | REPO_FACT | `6a462238bee58f547855b68c57417f2f0442745c`（RM-11 Roadmap DONE commit） |

## Current Capability

| Capability | Owner | State |
|---|---|---|
| Skill Run 消费合同 | Work consumer-lock；现行 pin v1.4.0 | EXISTS；无 delta 事件 |
| Event → activity 适配 | Main contract parser + SkillRunService | EXISTS（RM-08 四类只读 activity） |
| Compact / activity UI | `modules/skill-run` | EXISTS；无 token 流式 |
| `assistant.message` | Parser / Result 文本 | EXISTS；完整 snapshot |
| Streaming/token delta 事件合同 | Provider Owner | MISSING |
| Work 进口尚未发布的 delta Bundle | — | MISSING |
| Streaming delta Stage PRD / Plan | — | FORBIDDEN until import Item READY |

## Options Considered

1. **Provider 发枚举 delta 的新 Bundle → 本仓进口 Item → 映射 Item。** 进口与映射分成两个 Roadmap Item；Bundle 未发布前均为 BACKLOG。
2. **Work 把 `assistant.message` 当流式字打。** 无新事件类型，立即可写 PRD。
3. **Work 在 `contracts/skill-run/` 自拟 delta schema。** 本仓同时当 Bundle author 与 consumer。
4. **现在写进口 Stage PRD 草稿，合同后补。** 无 grounded Provider 字节。

## Decision

选择 Option 1。

- 不开启 Work streaming delta Stage PRD，直到进口 Item 变为 READY 且对应 Bundle 已 checksum lock。
- 本仓增加两个 Roadmap Item（编号在 Roadmap 更新时分配，建议 RM-13 / RM-14），**当前状态均为 BACKLOG**：
  - **Import Item**：进口 Provider 发布的、已枚举 streaming/token delta 事件类型与 payload 的不可变 Bundle（新 `contracts/skill-run/v1.x` + consumer-lock）。不映射 UI，不改 parser 去猜测未枚举类型。
  - **Mapping Item**：依赖 Import Item DONE。仅把 Bundle **已枚举** 的 delta 事件映射到现有 parser / projection / `modules/skill-run`，且只投影已发布、已清洗的 payload 字段。不新增 Chat 页面、不向 Renderer 传递 raw Provider event、不复用 Local Chat 流式通道。
- Import Item 的 READY 条件：存在可解析 Provider tag、完整 Bundle 目录、LF SHA256SUMS、discriminated union 中的 delta event type + payload schema + fixture。缺任一则保持 BACKLOG。
- Mapping Item 不得在 Import Item DONE 前标 READY。

**Provenance（APPROVED 后强制）：**

1. Roadmap `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` 的 frontmatter `architecture_decision` **继续**指向父架构 `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md`。禁止把该指针改到本 AD；禁止把本 AD 解读为替换整份 v4.0.1 架构。
2. 新增 Import / Mapping Item 的架构出处必须引用 `AD-WORK-v4.0.1-STREAMING-DELTA`：`smc-roadmap` 写入 Item 时须在 Outcome、Exit Criteria 或 Item 备注中显式给出本 `decision_id`；对应 Stage PRD 的 `source_revision` 必须包含 `AD-WORK-v4.0.1-STREAMING-DELTA@<本文件 version>`，不得只引用父 P1 那一句。
3. 父 PRD P1「streaming delta」不得被读成「可立刻开单一映射 Stage PRD」。该句的实施顺序以本 AD 为准：先 Import BACKLOG（Provider tag 前不得 READY），Import DONE 后 Mapping 才可 READY；无已枚举 Bundle 时两项保持 BACKLOG，不得 Grounding Stage PRD。

## Target Architecture

消费链保持：

```text
Provider immutable Bundle (new version, enumerated delta event)
  → Work import + consumer-lock + checksum
  → Main parser maps only enumerated delta type
  → SkillRunService merges into existing projection (bounded, sanitized)
  → modules/skill-run presents only enumerated, sanitized payload fields
```

未知或未进口的事件类型继续 `rawUnknown`：只推进 SSE 游标，不文本化 payload，不触发不可逆 UI。`assistant.message` 仍是完整消息事件，不是 delta 的替代合同。

映射阶段只投影 Bundle **已枚举且已清洗** 的 payload 字段。Provider 尚未发布 delta payload 时，「增量文本 / token / 打字机」只是当前产品假设，不是合同事实；Mapping 不得把未枚举字段写成增量文本合同。

不新增 Production Owner：不新增 parser、projection store、IPC channel、Session/File owner。

## Ownership & Boundaries

| Capability | Production Owner | Boundary |
|---|---|---|
| Delta 事件类型 / payload / fixture / tag | NoDeskClaw Provider Owner | Work 不写、不改 SHA256 覆盖的 Provider 字节 |
| Bundle 进口与 consumer-lock | 现有 Work Skill Run consumer-lock owner | 只 lock 完整、已 tag、checksum 通过的目录 |
| Event → projection 适配 | 现有 Main contract parser + SkillRunService | 只映射已枚举类型；禁止补偿 parser |
| Delta 展示 | 现有 `modules/skill-run` | 只渲染已枚举、已清洗的 projection 字段；MessageList 不解析 Provider event |
| Local Chat / Expert 流式 | 既有各自 owner | Skill Run 不复用 Hermes token 通道 |

## Dependencies & Cascading Effects

```text
Provider publishes enumerated delta Bundle
  → Import Item BACKLOG → READY → DONE (lock)
  → Mapping Item BACKLOG → READY → Stage PRD → Plan → delivery
```

级联：

- 在进口完成前，RM-08 的 unknown fail-soft 保持正确；不得把「看不到打字机效果」当成 parser bug。
- Mapping 不得把 deny/cancel、clarify respond、`approvalExpiry`、download-by-ref 混入同一 Item。
- 新 Bundle 若 `wireBreaking=true`，进口 Item 必须单独评估 P0 Catalog/start 与旧 lock 共存；本 Decision 不预判版本号。
- 父架构 PRD 的 P1 句子保留；其中 streaming delta 的**语义与实施顺序**以本 AD 为准（先进口 BACKLOG，后映射；无 Bundle 不得 READY），避免再塞进已 DONE 的 RM-08，也避免从父 P1 直接开单一映射 PRD。
- Import Item 对 RM-11 的依赖只表示现行消费合同基线停在 v1.4.0 lock，不是附件上传的功能依赖。

## Risks & Kill Criteria

| Risk | Mitigation | Kill |
|---|---|---|
| Provider 长期不枚举 delta | Import/Mapping 保持 BACKLOG；Work 不发明事件 | 若产品要求「无合同也要流式」，停止本方向，回到架构重开，不改 parser |
| 进口不完整 Bundle | READY 门禁：tag + SHA256SUMS + event schema + fixture | identity-only lock 不得标 READY |
| 把 `assistant.message` 当 delta | Mapping PRD Out 写死 | Grounding 若发现无独立 event type，Item 退回 BACKLOG |
| 新 Owner / 第二 Chat 流式面 | Target Architecture 禁止 | 出现新 IPC channel 或 MessageList 解析 raw event → 审查 FAIL |
| 与附件/审批混项 | Mapping Item 只映射已枚举 delta 字段；Import 不回归附件 | 混入 upload/decision/expiry → 拆回对应 Item |
| 双 SOT：改 Roadmap `architecture_decision` 或只引父 P1 开映射 PRD | Provenance 冻结：父 PRD 仍是 Roadmap 指针；新 Item/Stage PRD 必须引用本 `decision_id` | 指针被改走、或 Stage PRD `source_revision` 不含本 AD → 审查 FAIL |

## Rejected Alternatives

- **Work 把 `assistant.message` 伪装成 token 流式。** 拒绝：无独立事件类型；违反父架构「未枚举不映射」；会把完整 snapshot 误当成增量，造成重复文本或回退。
- **Work 自拟 `contracts/skill-run` delta schema。** 拒绝：Work 不是 Bundle author；与既有「external-immutable-bundle-only」冲突。
- **现在写进口 Stage PRD（合同后补）。** 拒绝：无 grounded Provider 字节，审查会在 G1/合同门挡下；用户已选择 Bundle 不存在时不写 PRD。
- **把 streaming delta 重开进 RM-08。** 拒绝：RM-08 已 DONE；不得改写已关闭 Item 的 Out。
- **无 READY Item 直接实施 parser。** 拒绝：违反 `smc-prd-grounding` / Plan delivery 入口。

## Roadmap Boundaries

在 `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` 上追加（本 Decision APPROVED 后由 `smc-roadmap` 写入，不在本文件分配 exact Todo）：

| 建议 Item | Outcome | Depends On | 初始 Status | Exit Criteria（阶段级） |
|---|---|---|---|---|
| Import（建议 RM-13） | 进口已枚举 streaming/token delta 的不可变 Skill Run Bundle 并完成 consumer-lock。架构出处：`AD-WORK-v4.0.1-STREAMING-DELTA`。 | RM-11（**合同基线**：现行 consumer-lock 停在 v1.4.0；**不是**附件功能依赖） | BACKLOG | Provider tag 可解析（仓外门禁）；Bundle checksum 通过；event union 含独立 delta type + payload schema + fixture；Work 不映射 UI；不回归附件/`approvalExpiry` |
| Mapping（建议 RM-14） | 将已进口的枚举 delta 映射为现有 parser/projection/`modules/skill-run` 上**已清洗的已枚举 payload 字段**。架构出处：`AD-WORK-v4.0.1-STREAMING-DELTA`。 | Import Item | BACKLOG | 仅映射已枚举类型与已发布 payload 字段；unknown fail-soft；无新 Owner；无 raw event 到 Renderer；不得把未枚举「增量文本」当合同 |

Import Item 在 Provider tag 存在前不得 READY。Mapping Item 在 Import DONE 前不得 READY。二者均不得与 `approvalExpiry`、download-by-ref、clarify respond 合并。

`smc-roadmap` 写入这两行时：Roadmap frontmatter `architecture_decision` 保持父 PRD 路径不变；Item 必须引用本 `decision_id`；Stage PRD `source_revision` 必须包含 `AD-WORK-v4.0.1-STREAMING-DELTA@<本文件 version>`。Depends On RM-11 只冻结合同基线，Import Item 不得把 RM-11 附件回归塞进来。
