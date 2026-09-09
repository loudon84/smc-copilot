---
work_item_id: RM-14
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-09T13:57:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/AD-WORK-v4.0.1-STREAMING-DELTA@1.0.1/RM-14
grounded_commit: fbe3316cfa30b64465cd6cfe0c4275c18bd7fcba
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.5.0
provider_tag: skill-run-contract-v1.5.0
provider_tag_commit: 3a7fa5ac32017d41f7191b8221c861b93d7e7f32
product_decision: user-input:2026-09-09-rm14-ready-then-ground-m6h
---

# WORK PRD v4.0.1 M6h — Skill Run Streaming Delta Mapping

本 Stage PRD 只关闭 Roadmap `RM-14`：把已进口、已 checksum lock 的 `SKILL-RUN-CONTRACT v1.5.0` 中**已枚举** `assistant.delta` 映射进现有 Main parser、`SkillRunService` projection 与 `modules/skill-run` 展示面。它只投影已发布 payload 字段 `message_id` / `delta_seq` / `delta`。`assistant.message` 仍是完整 snapshot，不是 delta 的替代合同。

本 Item 不新增 Production Owner、IPC channel、Chat 页面、Session/File store，不向 Renderer 传递 raw Provider event，不复用 Local Chat / Hermes 流式通道，也不回退附件、`approvalExpiry`、download-by-ref 或 clarify respond。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-14` / M6h P1 Streaming delta 映射；依赖 `RM-13` 已 `DONE`；本 Grounding 时 Item 已 `READY`。 |
| Architecture | `AD-WORK-v4.0.1-STREAMING-DELTA@1.0.1`：Import DONE 后才允许 Mapping READY 与 Stage PRD；只映射已枚举类型与已清洗 payload 字段；unknown fail-soft；禁止把 `assistant.message` 伪装成 token 流式。 |
| Repository baseline | `fbe3316cfa30b64465cd6cfe0c4275c18bd7fcba`（RM-13 implementation `c70cb3c0b175b6e4eb9c6570d4b631acd95906ea` + Roadmap DONE）。 |
| Import lock | `contracts/skill-run/v1.5.0/` 已进口；`consumer-lock.json` pin tag `skill-run-contract-v1.5.0` 与 peeled commit `3a7fa5ac32017d41f7191b8221c861b93d7e7f32`。manifest `wireBreaking=false`；`streamingDelta=supported`；`assistantMessageSnapshot=supported`。 |
| Enumerated contract | `events/run-event.schema.json` 独立 discriminator `assistant.delta`；payload required `message_id`、`delta_seq`（integer ≥1）、`delta`（string）。snapshot `assistant.message` required `message_id`、`text`。fixtures：`run-event-assistant-delta.json`、`sse-assistant-delta-replay.json`。 |
| Eligibility | `hasSkillRunStreamingDeltaBundle()` 已存在且仅对 checksum-complete v1.5.0 的 capability/discriminator/payload/fixtures 返回 true。generic P0 仍可用 v1.2.1 开 Catalog/start。 |
| Current parser | `assistant.message` 把 `payload.text` 写成 projection `text`（整段替换）。`assistant.delta` 落入 default → `rawUnknown: true`。 |
| Current service | 非 `rawUnknown` 才 patch projection；`text` 目前是整段赋值。每次 patch 经现有 subscribe 下发，并写入 RM-15 Session sidecar 的 run snapshot `text`。`rawUnknown` 只靠 SSE id 去重推进游标。 |
| Current UI / transcript | `modules/skill-run` 把 `projection.text` 渲染为同一 Skill Card 的 `resultText`。Activity 白名单仍是 RM-08 四类；sidecar 不接受未登记 kind。 |
| RM-15 constraint | Transcript live-sync 已 DONE，且明确 **不包含** streaming delta。本 Item 必须复用现有 sanitized projection / sidecar `text`，不得开第二审计表或 raw event 通道。 |
| Out of this Item | `approvalExpiry`；download-by-ref；clarify respond；改 Provider SHA 覆盖字节；新 IPC；Local Chat 流式；Hermes `tool_calls` 复用；把未枚举字段当增量文本。 |

## Problem and Outcome

v1.5.0 已枚举 `assistant.delta`，Work 也已 lock。运行时若仍把该事件当 `rawUnknown`，用户只能等到 `assistant.message` snapshot 才看到完整文本，进口合同没有被消费。若把 snapshot 拆成假打字机，或把未枚举字段写成 token 合同，会违反 AD 与 fail-closed。

完成后：在 v1.5 streaming-delta eligibility 为 true 时，合法 `assistant.delta` 被映射为 Work 已清洗的增量文本，按 `message_id` 归组、按 `delta_seq` 顺序合并进现有 `SkillRunProjection.text`；同 `message_id` 的 `assistant.message` snapshot 覆盖该缓冲，成为权威文本。Renderer 继续只读现有 Skill Card `resultText`。eligibility 为 false、缺字段、或未枚举事件仍 `rawUnknown`。

## Scope

- In: 现有 Skill Run contract parser 对 `assistant.delta` 的 fail-closed 映射；现有 `SkillRunService` 按 `message_id`/`delta_seq` 合并进现有 projection `text`；现有 projection 订阅与 RM-15 sidecar 对 `text` 的既有持久化；`modules/skill-run` 继续展示该 `text`；LAT 从「import-only」改为「已映射 enumerated delta」。
- Out: 新 parser/store/IPC/Chat/Session/File owner；raw Provider event 到 Preload/Renderer；Local Chat / Hermes token 通道；activity kind 扩成 delta 行；把每条 delta 写成 sidecar activity；改 Provider Bundle；attachments / `approvalExpiry` / download-by-ref / clarify respond；generic P0 required-path 扩张。
- Production Owner: 现有 Main contract parser 拥有 event → sanitized delta。现有 SkillRunService 拥有合并、去重、snapshot 覆盖与 terminal monotonic。现有 `modules/skill-run` 拥有展示。MessageList 不解析 Provider event。consumer-lock eligibility 仍由现有 lock owner 持有，本 Item 只消费、不改 helper 语义。Provider 仍拥有事件类型与 payload 字节。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| v1.5.0 enumerated delta contract | Provider bytes + Work import lock | RM-13 DONE；checksum lock 与 eligibility helper 已存在 | EXISTS |
| Streaming-delta eligibility | Work consumer-lock | `hasSkillRunStreamingDeltaBundle()` 已 fail-closed | EXISTS |
| Event → projection parser | Main contract parser | snapshot `text` 已映射；`assistant.delta` 为 `rawUnknown` | PARTIAL |
| Projection text merge | SkillRunService | 非 unknown 时整段替换 `text`；无 `message_id`/`delta_seq` 缓冲 | PARTIAL |
| Live Skill Card text | `modules/skill-run` transcript card | 已渲染 `projection.text` 为 `resultText` | EXISTS |
| Durable run text | Existing Session sidecar | 每次 projection patch 已持久化 snapshot `text` | EXISTS |
| Activity list / kinds | Parser + sidecar whitelist | 仅 RM-08 四类；无 delta kind | EXISTS（本阶段不扩张） |
| Unknown event policy | Parser + SkillRunService | `rawUnknown` 不驱动 UI | EXISTS |
| Raw event IPC | Main/Preload boundary | Renderer 只有 sanitized projection | EXISTS |
| Local Chat / Hermes streaming | 既有 Chat/Expert owners | 与 Skill Run 合同不兼容 | EXISTS（禁止复用） |
| `assistant.message` as delta substitute | — | AD 禁止 | KEEP absent |
| approvalExpiry / download-by-ref / clarify respond | 对应后续或 unsupported | 非本 Item | KEEP absent |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Enumerated `assistant.delta` mapping | Existing contract parser | eligibility true 且 payload 含 `message_id`、合法 `delta_seq`、string `delta` 时产出 sanitized 增量；否则 `rawUnknown` | MODIFY |
| Delta merge into projection text | Existing SkillRunService | 按 `message_id` 归组，按 `delta_seq` 顺序追加已清洗 `delta`；重复 seq 忽略；缺口 seq fail-soft 不污染权威 snapshot | MODIFY |
| Snapshot authority | Existing parser + service | 同 `message_id` 的 `assistant.message.text` 覆盖该组缓冲；无 `message_id` 的既有 snapshot 行为保持整段 `text` 替换，以兼容旧 Bundle | MODIFY |
| Live / durable text presentation | Existing projection IPC + sidecar + `modules/skill-run` | 继续只展示/持久化 Work `text`；不新增 channel、activity 行或 raw event | KEEP |
| Eligibility helper | Existing consumer-lock | 语义不变；mapping 必须先看它，v1.2.1–v1.4 仍不得映射 delta | KEEP |
| Unknown / unenumerated events | Existing parser + service | 仍 `rawUnknown`，不文本化 payload | KEEP |
| Activity kinds / ClarifyCard / decision / attachment | Existing owners | 不变 | KEEP |
| Provider Bundle bytes | Provider | 不改 SHA 覆盖文件 | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Parser 映射已枚举 `assistant.delta` | MODIFY | 现有 parser 是唯一适配 Owner；只提升 v1.5 已枚举事件，禁止补偿未发布字段。 |
| C02 | Service 按 `message_id`/`delta_seq` 合并进现有 `text`，snapshot 覆盖 | MODIFY | 扩展现有 projection 合并，不新增 store；replay 后权威文本是 snapshot。 |
| C03 | Live Skill Card / sidecar `text` | KEEP | 展示与持久化路径已存在；增量可见性来自 C02，不新开 IPC 或 activity kind。 |
| C04 | Unknown fail-soft 与 eligibility false | KEEP | 无 v1.5 helper、缺字段、未枚举类型不得当成功映射。 |
| C05 | v1.5 eligibility helper | KEEP | RM-13 已关闭；本 Item 只消费，不改 checksum/capability 语义。 |
| C06 | LAT streaming-delta 状态 | MODIFY | 从 import-only / RM-14 BACKLOG 改为 enumerated mapping 已由本 Item 消费。 |
| C07 | Local Chat 流式、raw event、expiry/upload/clarify respond | KEEP absent | AD 禁止混项与第二通道。 |

## Replacement / Removal Matrix

本 Item 无 REPLACE 或 REMOVE。不删除 RM-08 activity、RM-15 sidecar、P0 compact status、Local Chat 流式或 v1.2.1–v1.4 lock。不把 `assistant.message` 从 snapshot 合同里删掉。

## Behaviour — Enumerated delta mapping

1. 仅当 streaming-delta eligibility 为 true 时，parser 才把 `event_type=assistant.delta` 视为可映射事件。false 时该事件保持 `rawUnknown`，即使线上 JSON 看起来像 delta。
2. 可映射 delta 必须同时具备非空 `message_id`、整数 `delta_seq` ≥ 1、string `delta`。任一缺失、类型错误或非 string 增量 → `rawUnknown`，不把剩余字段拼进 `text`。
3. Service 为每个 `message_id` 维护 Work 拥有的文本缓冲。合法 delta 按 `delta_seq` 升序把已清洗 `delta` 追加到该缓冲，再写入现有 `projection.text`。同一 `(message_id, delta_seq)` 重复到达则忽略增量（仍可按既有 event id 去重推进游标）。
4. 后到但序号不连续的 delta fail-soft：不回写乱序文本，不把 payload 文本化进 activity。允许等待后续合法序号或依赖即将到来的 snapshot 纠偏；不得为「补洞」猜测未收到的 token。
5. 同 `message_id` 的 `assistant.message` 一旦合法映射，其 `text` **覆盖**该缓冲，成为权威展示/持久化文本。replay fixture 的最终可见文本是 snapshot「正在分析完整结果」，不是 delta 与 snapshot 的拼接。
6. 没有 `message_id` 的既有 `assistant.message`（旧 Bundle）保持今天的整段 `text` 替换，避免 v1.2.1 snapshot 回归。
7. `delta` 与 snapshot `text` 只投影为 Work sanitized 显示字符串；不得把 `source_event_id`、raw payload object、JWT、URL 或未枚举字段送入 Renderer。
8. 不把 `assistant.delta` 登记为 activity kind，不写入 sidecar activity 表。Live 与 reopen 只通过现有 `projection.text` / run snapshot `text` 看见增量结果。
9. 未枚举事件、control 噪音、缺 contract 的后续字段继续 `rawUnknown`。Skill 失败不创建 ExpertTask，不调用 Local Chat 流式或 `clarify-respond`。

## Contract and Security Boundary

- 只消费 v1.5.0 已枚举 `assistant.delta` / `assistant.message` 字段。禁止把 `assistant.message` 拆成假 token 流。禁止投影未出现在 `$defs` required/published properties 中的增量假设。
- Renderer 仍然只收到 sanitized `SkillRunProjection`。禁止新增 raw SSE、delta 专用 Preload channel，或让 MessageList 解析 Provider event。
- eligibility helper 的输入仍是离线 Bundle；mapping 不得在 runtime 向 GitHub/SSH/live schema 补字段。
- telemetry 若记录 delta 相关信号，不得写入 `delta` 全文、`text` 全文或 raw payload。
- 不得改 Provider `SHA256SUMS` 覆盖字节，不得扩张 generic P0 required paths。

## Acceptance Criteria

1. 在 v1.5 streaming-delta eligibility 为 true 时，合法 `assistant.delta` fixture 使同一 Skill Card 的 `text`/`resultText` 出现已清洗增量，而不再仅以 `rawUnknown` 丢弃。
2. `sse-assistant-delta-replay` 顺序（delta「正在分析」后 snapshot「正在分析完整结果」）结束后，可见文本等于 snapshot，而不是二者拼接。
3. 缺 `message_id` / `delta_seq` / `delta`、非 string `delta`、eligibility false、或未枚举 `event_type` 时，不把 payload 写入 `text` 或 activity；游标仍可前进。
4. 重复 `(message_id, delta_seq)` 不造成重复追加。乱序 delta 不覆盖已权威 snapshot，也不发明缺失 token。
5. 无新 IPC channel、无 raw Provider event 到 Renderer、无新 Activity kind、无 sidecar activity 行、无第二 Chat/Session/File owner。
6. v1.2.1 Catalog/start、v1.3 decision、v1.4 attachment、RM-08 四类 activity、RM-15 单卡 transcript 与 sidecar 文本路径无回归。Local Chat 流式与 `clarify-respond` 不被调用。
7. LAT 写明：v1.5.0 enumerated `assistant.delta` 已映射进现有 projection `text`；mapping 仍受 eligibility helper 约束；expiry / download-by-ref / clarify respond 仍不在范围。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL-01 | AC-01 | eligible v1.5 delta 进入 sanitized projection text | Yes | RM-13 lock/helper PASS；parser 现为 rawUnknown | PROVEN_FRESH + NOT_TESTED | NEW_EVIDENCE | runtime mapping is new |
| CL-02 | AC-02 | replay 后权威文本是 snapshot | Yes | Provider replay fixture 已 lock；Work 未消费 | NOT_TESTED | NEW_EVIDENCE | merge/replace semantics are new |
| CL-03 | AC-03 | malformed / ineligible / unknown 不写入 text | Yes | parser unknown + helper negatives | PROVEN_BUT_AFFECTED | TARGETED_RERUN + NEW_EVIDENCE | mapping must not weaken fail-closed |
| CL-04 | AC-04 | duplicate seq 不重复追加；乱序不污染 snapshot | Yes | SSE id 去重存在；无 delta_seq 缓冲 | NOT_TESTED | NEW_EVIDENCE | seq merge is new |
| CL-05 | AC-05 | 无新 owner/IPC/raw event/activity kind | Yes | RM-08/RM-15 边界；RM-13 AC-05 | PROVEN_BUT_AFFECTED | TARGETED_RERUN | mapping may tempt a new channel |
| CL-06 | AC-06 | 既有 P0/P1/transcript 回归 | Yes | 既有 focused suites | PROVEN_BUT_AFFECTED | TARGETED_RERUN | parser/service text merge 会碰到旧路径 |
| CL-07 | AC-07 | LAT 描述 mapped 而非 import-only | Yes | LAT 仍写 RM-14 BACKLOG | NOT_TESTED | NEW_EVIDENCE | documentation must track this Item |

## Definition of Done

1. C01–C02 与 C06 由单一 canonical Plan 完成；blocking claims CL-01–CL-07 均为 fresh PASS。C03–C05、C07 由既有路径回归或静态范围证明。
2. RM-14 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。
3. 若发现需要新 IPC、activity kind、raw event、把 snapshot 当 delta、改 Provider 字节、或混入 expiry/upload/clarify respond，必须返回 Architecture / 对应 Item，不得扩大本 PRD。

## Source Anchors

- `apps/work/src/main/skill-run/skill-run-contract-parser.ts`
- `apps/work/src/main/skill-run/skill-run-service.ts`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts`
- `apps/work/src/shared/skill-run.ts`
- `apps/work/src/main/skill-run/skill-run-transcript-store.ts`
- `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx`
- `apps/work/lat.md/skill-run.md`
- `contracts/skill-run/v1.5.0/events/run-event.schema.json`
- `contracts/skill-run/v1.5.0/manifest.json`
- `contracts/skill-run/v1.5.0/consumer-lock.json`
- `contracts/skill-run/v1.5.0/fixtures/run-event-assistant-delta.json`
- `contracts/skill-run/v1.5.0/fixtures/run-event-assistant-message.json`
- `contracts/skill-run/v1.5.0/fixtures/sse-assistant-delta-replay.json`
- `docs/work/AD-WORK-v4.0.1-streaming-delta.md`
- `docs/work/PRD-WORK-v4.0.1-M6g-streaming-delta-contract-import.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
