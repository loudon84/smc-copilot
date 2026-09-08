---
work_item_id: RM-10
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-07T12:05:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-10
grounded_commit: c58fe7c4c0fdf965674395c68bfcec9b83f09873
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.2.1
product_decision: user-input:2026-09-07-continue-next-rm-prd-skip-unrelated-docs
---

# WORK PRD v4.0.1 M6d — Limited JSON Schema Parameter Form

本 Stage PRD 关闭架构 P1「受限 JSON Schema 参数表单」中 **P0 已 fail-closed** 的可证明子集：当 Catalog 工具在现有 object schema 上除 `promptField` 外还有额外 **必填 string 标量** 时，允许在现有 Chat / `modules/skill-run` 收集这些字段，并由 Main 现有 bind/start 路径写入 `tools/call` arguments。不引入通用 JSON Schema 表单引擎，不解析 `$ref` / 组合 schema，不启用 number/object/array/附件字段，不修改 Provider Bundle。

顺序上的下一号是 RM-09（Approval decision）。该项 Exit Criteria 要求新 Bundle 先把 `approval` 从 `unsupported` 提升并发布 decision endpoint；当前 v1.2.1 未满足，**禁止**为本对话开 RM-09 Stage PRD。RM-10 依赖 RM-06（已 DONE），是当前唯一可独立 Grounding 的 M6 P1 Item。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-10` / M6d P1 受限 JSON Schema 参数表单 |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-10` |
| Architecture | 父 PRD Identity and request snapshot：P0 只绑定单一 string prompt；额外必填 / `$ref` / 组合 schema fail-closed。P1 才做受限参数表单。Queue item 须保存 arguments snapshot。Main 不信任 Renderer 传入的 input schema。 |
| Repository baseline | `c58fe7c4c0fdf965674395c68bfcec9b83f09873` |
| Dependencies | RM-06 is `DONE`。Classifier / Catalog / Chat 已把 `form-required` 与 `parameters-required` 标为不可选、不可 start。 |
| Provider input | `contracts/skill-run/v1.2.1/`。Catalog tool 含 `interactionMode`（`chat` \| `form`）、`promptField`、`inputSchema`。`tools/call` 已是唯一执行入口。无独立「表单提交」endpoint。`attachments` 仍 `unsupported`。 |
| Current classifier | `interactionMode === "form"` 立即 `form-required` / `unsupported`，不看 schema。`chat` 且 `required` 含非 `promptField` 字段 → `parameters-required` / `EXTRA_REQUIRED_PARAMETERS` / `unsupported`。`$ref`、非 object root、oneOf/anyOf/allOf 等 → `unsupported-schema`。 |
| Current bind | 只接受 `prompt-first`；arguments 仅为 `{ [promptField]: prompt }`。Start IPC 只有 `toolName` + `prompt`，不接受额外参数 map。 |
| Current UI | Catalog 仅 `invocationMode === "prompt-first"` 可选。Chat Skill submit 同样拦截。Selection Bar 对非 prompt-first 显示不可用。Composer 只有单一 prompt 输入。无参数字段收集器。Queue 的 `skillRequest` 只有 `toolName` / `prompt` / `clientRequestId`。 |
| Out of this Item | RM-09 Approval decision；RM-11 Attachment；RM-12 收藏；`$ref` / 组合 / 非 string 必填；通用 JSON Schema widget 库；把 `form` 且无额外必填的工具改成 prompt-first；修改 v1.2.1 Bundle；Expert 合同。 |

## Problem and Outcome

P0 正确地拒绝了「除 prompt 外还有必填参数」以及全部 `interactionMode=form` 的工具，避免猜测字段。v1.2.1 Catalog 已经在本地 `inputSchema` 上给出 object properties 与 `required`，其中一部分只是额外的 string 必填，并不需要 `$ref` 解析或表单引擎。继续全部 fail-closed 会让这类已发布 Skill 在 Catalog 里永远不可选，即使用户能提供那些字符串。

若错误地让 Renderer 遍历 `inputSchema` 自己拼 `tools/call` arguments，会绕过 Main 重校验，并把未声明 key、非 string、附件或 schema 猜测带进网关。若为此新增第二 Catalog/Chat 页面或通用 JSON Schema 渲染器，会违反「一个 Capability 一个 Owner」和本 Item「不猜 schema」的退出条件。

完成后：

- 现有 classifier 把 **可证明子集** 标为可调用的受限参数模式（与 `prompt-first` 并列，不是把 `parameters-required` 语义改成「可调用」）。
- 子集定义见 Behaviour。不满足子集的 `form-required` / `parameters-required` / `unsupported-schema` 保持 P0 fail-closed。
- Main 投影允许收集的额外必填 string 字段描述（name + 可选 title）。Renderer 只渲染该列表，不把 `inputSchema` 当作执行真源。
- 现有 start IPC 增加 bounded string map；Main 只拷贝 Catalog 白名单 key，缺字段或未知 key fail-closed。
- Catalog 允许选择该子集；Chat Skill composer 在现有模块内收集额外 string；queue snapshot 带上这些值，出队不重读当前表单。
- prompt-first 路径、Gateway `tools/call`、无新 IPC channel name、无 Skill Chat 页面。

## Scope

- In: 扩展现有 invocation classifier，识别额外必填 string 标量子集；Catalog 投影这些字段描述；扩展现有 start bind 与 IPC payload，把 prompt + 白名单 string 写入 `tools/call`；在现有 Chat / `modules/skill-run` 收集这些字段并纳入 queue snapshot；保持其余 fail-closed。
- Out: Approval decision（RM-09）；Attachment refs/upload（RM-11）；收藏/最近/推荐（RM-12）；解析 `$ref`、oneOf/anyOf/allOf、非 object root；必填 number/boolean/object/array/file；可选复杂字段填值；通用 JSON Schema form 库；把仅含 `promptField`、无额外必填的 `form` 工具改成 prompt-first；新增 Skill Chat 页面或第二 Session/File/Catalog owner；新增 start 以外的执行 IPC；修改 `contracts/skill-run/v1.2.1`；Expert start / Local Chat 附件通道。
- Production Owner: Main contract parser 仍是 classify + bind 的唯一 Owner。SkillRunService 仍是 start / pending-submit / `tools/call` Owner。共享 Skill Run DTO 拥有 start payload 与 Catalog 字段描述。Renderer `modules/skill-run` 拥有 Catalog 选择与额外 string 字段展示。现有 Chat 拥有 Skill submit / queue snapshot 转发，不拥有 schema 解释。File Platform 与 Expert 不因参数表单改变所有权。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Catalog tool schema on the wire | v1.2.1 Bundle | `inputSchema` + `interactionMode` + `promptField`；无独立表单 endpoint | EXISTS（external） |
| Invocation classify / prompt-first bind | Main contract parser | 额外必填与全部 form 均 unsupported；arguments 仅 prompt | PARTIAL |
| Catalog projection | Main Catalog cache + DTO | 已投影 `invocationMode` / `callability` / 只读 `inputSchema`；无额外必填字段名单 | PARTIAL |
| Start IPC | Existing `skillRun.start` | 校验 `toolName` + `prompt`；无额外参数 map | PARTIAL |
| Catalog selection | `modules/skill-run` Catalog Panel | 非 `prompt-first` 卡片 disabled | PARTIAL |
| Skill composer / queue | Existing Chat Skill mode | 单 prompt；queue snapshot 无 arguments | PARTIAL |
| `tools/call` gateway | Existing SkillRunGatewayClient | 已能发送 arguments 对象 | EXISTS |
| `$ref` / composite / non-object | Existing classifier | fail-closed `unsupported-schema` | EXISTS |
| Optional object/array omit | Existing prompt-first bind | 可选复杂字段不写入 arguments（RM-06 KEEP） | EXISTS |
| JSON Schema form engine | n/a | 不存在 | MISSING（本阶段不 ADD 通用引擎） |
| Attachment / Approval decision | Provider capability | 仍 `unsupported` | KEEP absent |
| Expert / Local Chat | Existing owners | 与 Skill 参数无关 | KEEP |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Limited extra-required string subset | Existing classifier | 满足 Behaviour 子集的 chat/form 工具变为可调用的受限参数模式；字段名由 Main 决定 | MODIFY |
| Bind extra string arguments | Existing bind + SkillRunService start | arguments = `{ promptField: prompt, ...whitelistedExtraStrings }`；未知 key / 缺必填 / 非 string fail-closed | MODIFY |
| Catalog extra-field descriptors | Existing Catalog DTO / projection | 对可调用子集投影 bounded 额外必填 string 字段（name + 可选 title）；Renderer 不得用 `inputSchema` 构造 arguments | MODIFY |
| Start payload extra strings | Existing start IPC（同 channel） | 可选 bounded `Record<string, string>`；长度与 key 数量有上限 | MODIFY |
| Collect extra strings in Skill UI | Existing `modules/skill-run` + Chat Skill submit | 渲染 Main 投影的字段为 string 输入；未填完不可 start；queue 保存 snapshot | MODIFY |
| prompt-first | Existing classifier / bind / Catalog / Chat | 行为不变 | KEEP |
| Non-subset form / extra required / unsupported schema | Existing classifier | 仍 unsupported、卡片 disabled、start 拒绝 | KEEP |
| `tools/call` / Gateway / lock / feature-mode | Existing SkillRunService | 仍走现有 call；`skill-first` + consumer lock 不变 | KEEP |
| Generic JSON Schema engine / `$ref` | n/a | 继续缺失 | KEEP absent |
| Approval / Attachment / Expert / Bundle | 对应 Owner | 不修改 | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Classifier 识别受限额外必填 string 子集 | MODIFY | 现有 classify 已是唯一 Owner；只把可证明 string 必填从 fail-closed 提升为可调用模式。禁止第二 parser。 |
| C02 | Bind + start 白名单 extra strings | MODIFY | 扩展现有 bind/start，不新增执行 channel。Main 重校验 Catalog，不信任 Renderer schema。 |
| C03 | Catalog 投影 extra-field descriptors | MODIFY | 扩展现有 Catalog DTO。禁止 Renderer 把只读 `inputSchema` 当执行真源。 |
| C04 | Catalog 选择 + Skill UI 收集 extra strings + queue snapshot | MODIFY | 现有 Catalog/Chat Skill 路径承载；Architecture 已要求 queue 保存 arguments。禁止新页面或 schema widget 库。 |
| C05 | prompt-first 与其余 fail-closed | KEEP | 无额外必填的 prompt-first 不变。`$ref`/组合/非 string 必填/无额外必填的 form 仍 unsupported。 |
| C06 | Gateway `tools/call`、lock、feature mode | KEEP | 不换执行合同。 |
| C07 | Approval / Attachment / Expert / Bundle | KEEP absent | 分属 RM-09/RM-11/RM-07 与 Provider。 |

## Replacement / Removal Matrix

本 Item 无 REPLACE。不删除 prompt-first bind。不删除 P0 对 `$ref` / 组合 schema / 非 string 必填的 fail-closed。不删除 Local Chat 或 Expert 子系统。

## Behaviour — Limited subset

同时满足以下条件的工具进入本 Item 的可调用受限参数模式；否则保持当前 fail-closed 分类：

1. 本地 `inputSchema` 通过现有 object-root 检查：无 `$ref`，无 oneOf/anyOf/allOf/if-then-else/dependentRequired/dependentSchemas，`type` 缺省或为 `object`。
2. `promptField` 存在且对应 property `type === "string"`（与 P0 prompt-first 相同；不接受 type union）。
3. `required` 中除 `promptField` 外至少 1 个、至多 8 个额外字段。
4. 每个额外必填字段：出现在 `properties` 中，且该 property 的 `type === "string"`（标量 string；不是 array/object/number/boolean，不是 `$ref`）。
5. `interactionMode` 为 `chat` 或 `form` 均可进入该子集。`form` 且 **没有** 额外必填（仅 prompt 或零 extra required）**不得**改成 prompt-first，保持 `form-required`。
6. 可选（非 required）字段无论类型如何，本阶段仍不收集、不写入 arguments（延续 RM-06：可选复杂字段省略；本 Item 也不把可选 string 扩成表单）。

可调用子集必须由 Main 投影 extra-field 列表。列表顺序与 `required` 中额外字段出现顺序一致。title 仅当对应 property 的 `title` 为非空 string 时用于展示，否则展示字段 name。

超出 8 个额外必填 string、或任一额外必填非纯 string，保持 `parameters-required` 或 `form-required`（按 interactionMode）及 `unsupported`。

## Contract and Security Boundary

- 只消费 v1.2.1 Catalog 已给出的本地 `inputSchema`。禁止拉取/内联 `$ref`，禁止按 `format`/`pattern`/`enum` 猜测控件或校验器。
- Renderer 不得把 `inputSchema` 或自报字段列表作为 `tools/call` 真源。Start 时 Main 用当前 auth scope Catalog 重分类、重绑定。未知 key、非 string value、空白必填、超长 value 一律拒绝。
- 不新增 IPC channel name；只扩展现有 start 输入。不向 Renderer 下发 JWT、origin、raw Provider 文档。
- extra string 数量、key 长度、value 长度必须有与现有 prompt 校验同级的上限；拒绝无界 map。
- telemetry 若记录 start，仍遵守 M5 允许名单；不写 extra field 的全文 value。
- `supportsAttachments === true` 不构成本 Item 启用附件的理由；附件仍禁用（RM-11）。
- 不得编辑 `contracts/skill-run/v1.2.1`。

## Acceptance Criteria

1. Catalog 中满足受限子集的工具：`callability` 为可调用；用户可选中；Composer 展示 Main 投影的额外必填 string 字段；全部非空且 prompt 非空后，现有 `skillRun.start` 被接受，`tools/call` arguments 含 `promptField` 与这些 extra key，且仅含这些 key。
2. 同类工具若额外必填含非 string、或超过 8 个 extra required、或 schema 含 `$ref`/组合类型：仍 unsupported，卡片不可选，start 返回既有 fail-closed 错误族（form/parameters/unsupported-schema），不猜字段。
3. `interactionMode=form` 且无额外必填：仍 `form-required` / 不可选 / 不可 start；不升为 prompt-first。
4. prompt-first 工具回归：不出现 extra 字段收集器；arguments 仍只有 promptField；既有 Catalog/Chat/bind 测试语义不变。
5. Renderer 传入未知 extra key、非 string、或缺少某个投影必填 key：Main 拒绝 start，不把这些值转发 Gateway。
6. Chat 在已有 active run 时排队：queue snapshot 包含当时的 extra string 值；出队使用 snapshot，不重读之后改过的字段。
7. 不新增 Skill Chat 页面、第二 Catalog/Session/File owner、Approval decision IPC、Attachment upload，或 Bundle 修改。Local Chat / Expert 回归不因本 Item 改变默认入口或 clarify 合同。

## Definition of Done

1. C01–C04 有 classifier / bind / IPC / Catalog-or-composer focused tests，并覆盖 AC-02/AC-03/AC-05 负向。C05–C07 由既有 prompt-first、unsupported-schema、Expert/Local Chat 套件回归。
2. RM-10 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。
3. 发现需要 `$ref` 解析、非 string 控件、通用 form 引擎、Approval、Attachment 或改 Bundle 的工作，必须返回对应 Roadmap Item / Provider，不得混入本 Item。

## Source Anchors

- `apps/work/src/main/skill-run/skill-run-contract-parser.ts`
- `apps/work/src/main/skill-run/skill-run-service.ts`
- `apps/work/src/main/skill-run/skill-run-ipc.ts`
- `apps/work/src/shared/skill-run.ts`
- `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx`
- `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `contracts/skill-run/v1.2.1/mcp/tools-list.response.schema.json`
- `contracts/skill-run/v1.2.1/capabilities/unsupported.schema.json`
- `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md#Identity and request snapshot`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md#Milestone M6 — Expert Removal and Independent P1 Items`
