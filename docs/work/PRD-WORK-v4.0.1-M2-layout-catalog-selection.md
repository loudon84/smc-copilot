---
work_item_id: RM-03
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-02T12:01:26+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-03
grounded_commit: 07d70278a3d9fd310aa2670638eed21b1a96bcd8
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.2.1
---

# WORK PRD v4.0.1 M2 — Layout, Catalog, and Safe Selection

本 Stage PRD 收敛既有 Chat 内的 Skill mode、Catalog 和选择行为，使用户能安全进入“使用技能”并准备提交快照；它不启用真实 `tools/call`，也不创建第二套 Chat、Session 或 File owner。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-03` / M2 Layout, Catalog, and Selection |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-03` |
| Repository baseline | `07d70278a3d9fd310aa2670638eed21b1a96bcd8` |
| Dependency | RM-02 is `DONE`; RM-01 remains `BACKLOG` pending Provider prompt-first live verification |
| Existing UI | `ChatRun.executionMode`、Layout “使用技能”入口、Chat-local selection、Skill Catalog Panel/Selection Bar、session-mode restore 已存在 |
| Existing safety | Main Catalog 返回 sanitized DTO；默认 `expert-compat` 在 `tools/call` 前拒绝 start；Catalog lacking discriminator is `contract-unsupported` |

## Problem and Outcome

Work 已实现 Skill mode 与部分 Catalog/selection UI，但这些行为跨 Layout、现有 Chat 和 Main Catalog surface，尚未作为 M2 独立冻结其单一 owner、切换语义、不可调用状态与可访问性证据。若未明确界限，后续功能容易把 selection 移入 Layout、复制 Chat 表面，或将 UI mode 误当作 Provider 执行许可。

完成后，用户可在现有 Chat 中进入 Skill mode、浏览由 Main 提供的可证明 Skill Catalog、选择或清除一个 Skill，并得到与 mode/selection 一致的 Composer 状态。模式切换不取消后台 Local/Expert 工作；默认或 M0 未验证状态下，UI 不会把选择升级为真实 Skill Run。

## Scope

- In: 复用现有 `ChatRun` mode、Layout navigation、mounted Chat 的 selection state、Renderer Catalog store/panel/selection bar、session-mode display restoration 与 Composer capability projection；补齐这些行为的 focused renderer/layout/a11y evidence，或只在既有 owner 中修正直接回归。
- Out: Provider Bundle/API、真实 `tools/call`、pending-submit/idempotency/SSE/poll/cancel/retry、Result/Artifact、Session continuation writer、direct download IPC、Approval/Attachment、M5 default、P1、Expert removal。
- Production Owner: Layout/`ChatRun` 只拥有 per-tab `executionMode` 和 navigation；挂载的 Chat 是唯一 Skill selection 与 submit owner；Main IPC/Gateway 仍是 Catalog 数据与所有 Backend 调用 owner；现有 Session/File Platform owner 不变。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Per-tab execution mode and scratch transitions | Layout + `ChatRun` | `local-chat` / `skill-run` mode、scratch reuse/mint 和 session resume 已存在 | PARTIAL |
| Catalog presentation | Renderer Skill Run store + `SkillCatalogPanel` | 通过 `window.hermesAPI.skillRun` 读取状态，呈现 loading/empty/error/unsupported 和键盘选择 | PARTIAL |
| Selection and Composer projection | Mounted `Chat` | Chat-local `selectedSkill` 驱动 Catalog、Selection Bar、submit gate 与 skill-mode controls | PARTIAL |
| Mode/selection display restore | existing session-mode reader + Layout/Chat | 已保存的 Skill session 可恢复 mode 和 tool display；不得新建 Session store | EXISTS |
| Contract and execution gate | Existing Main Service/Gateway | discriminator/lock fail-closed；默认 `expert-compat` 不发 `tools/call` | EXISTS |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Layout mode entry and tab semantics | Existing Layout/`ChatRun` owner | “使用技能”只变更或创建正确的 Skill tab，不取消其它活动 tab | MODIFY |
| Safe Catalog states and navigation | Existing Renderer Catalog store/panel owner | 只展示 Main 已证明为 Skill 的项；loading/empty/unauthorized/backend unavailable/contract unsupported 可恢复且可访问 | MODIFY |
| Single selection truth and Composer projection | Existing mounted Chat owner | 单一 selected Skill 驱动 Selection Bar、submit eligibility 与 Skill-mode control visibility；不在 Layout/store 复制 truth | MODIFY |
| Persisted Skill display restoration | Existing session-mode reader owner | 恢复 session 时保留 mode 与已选 Skill display；不创建第二 Session SoT | KEEP |
| No-execution safety boundary | Existing Main feature-mode/Service owner | M2 不使 UI choice 产生真实 `tools/call`，不 silent fallback 到 Expert | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Layout/`ChatRun` Skill mode transition | MODIFY | 复用既有 per-tab mode owner，补齐 scratch/non-scratch、active-state 与 background-run 不受影响的行为证据。 |
| C02 | Renderer Catalog state and accessible panel | MODIFY | 复用 Main-sanitized Catalog DTO 与既有 panel/store，补齐 discriminator failure、recoverable states、search/category 与 keyboard evidence。 |
| C03 | Chat-local selection and Composer capability projection | MODIFY | 保持 Chat 为唯一 selection/submit owner，证明选择、清除、提交禁用和 Local/Expert control removal 不分叉。 |
| C04 | Session mode/selected Skill display restoration | KEEP | 现有 session-mode reader 承载恢复 display；M2 不新建持久化 owner。 |
| C05 | Main execution gate and Expert compatibility | KEEP | 默认 `expert-compat`、M0 deferred live gate 与 no-silent-fallback 不因 M2 改变。 |

## Contract and Security Boundary

- Renderer 仅消费 `window.hermesAPI.skillRun` 的 Catalog DTO；它不得访问 backend URL、token、raw Provider event、download URL 或 bytes。
- Catalog 缺失 `capabilityKind` 或 Consumer lock 无效时，UI 必须展示 contract-unsupported/recoverable state，不能以名称、分类或历史缓存猜测为 Skill。
- Layout 不能拥有 selected tool 或 request snapshot；Chat 不能改变其他 tab 的 execution mode。已提交/排队请求的 snapshot 属于 M3，不因本阶段切换 UI 而重路由。
- Skill mode 不是授权。M0 未完成或默认 `expert-compat` 时，选择 Skill、输入 prompt 或切换 tab 均不得产生真实 `tools/call`，不得自动转交 Expert。
- Skill mode 不渲染 Local Model、Reasoning、Fast Mode、Context Folder 或 Expert-specific controls；Attachment 未合同化时保持显式不可用。

## Acceptance Criteria

1. Layout 提供一级“使用技能”入口：空白 scratch 在原 tab 切换为 Skill mode；已有内容或非 scratch 不覆盖原 tab，而是复用或新建正确 profile 的 Skill scratch；后台 Local/Expert 工作不被取消。
2. ChatRun 的 `executionMode` 只表达 tab mode；Provider `run_id`、client request id 和 ChatRun id 继续不可互换，Layout 不保存 selected Skill 或 Provider payload。
3. Skill mode 中，Catalog 仅展示 Main contract 明确标记为 Skill 的项；loading、empty、unauthorized、backend unavailable、contract unsupported 和不可调用项均有可恢复状态，不猜测或混入 Connector。
4. Catalog 支持搜索、类别可发现性和 Arrow/Enter/Escape 键盘操作；选择目标可被辅助技术辨识，且 keyboard flow 不依赖鼠标。
5. 挂载的 Chat 是唯一 selection truth：未选择时显示 Catalog 并禁用 Skill submit；选择后显示 Selection Bar，清除后回到 Catalog；tab 切换或恢复 session 不使 mode/selected Skill display 丢失。
6. Skill mode 从 Composer 移除 Local Model、Reasoning、Fast Mode、Context Folder 与 Expert controls，并明确禁用未合同化 Attachment；不新增第二个 Chat View、MessageList 或 Input。
7. 在默认 `expert-compat` 或 RM-01 未完成时，M2 UI 选择和 prompt 输入不产生真实 `tools/call`，不自动 fallback 到 Expert；M3 仍是唯一 owner of execution/recovery semantics。
8. Layout/Chat transition、Catalog state/keyboard、selection/Composer projection 和 mode restoration 的 focused tests 通过；任何直接修复只在既有 Layout、Chat 或 Catalog owner 中完成。

## Definition of Done

1. C01–C03 有 APPROVED Stage PRD、validated Plan、review PASS、focused renderer/layout verification evidence 和真实 implementation commit；C04/C05 的 existing owner 仍由回归证据覆盖。
2. RM-03 完成不改变 RM-01 的 `BACKLOG`，也不允许 RM-04 在 RM-01 未 `DONE` 时进入真实执行。
3. 发现需要 Provider schema、真实 run lifecycle、Session/File writer 或 production default 的工作必须返回 RM-01、RM-04、RM-05 或独立后续 PRD，不得混入 M2。

## Source Anchors

- `apps/work/src/renderer/src/screens/Layout/chatRuns.ts`
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `apps/work/src/renderer/src/modules/skill-run/store.ts`
- `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx`
- `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx`
- `apps/work/src/renderer/src/screens/Layout/chatRuns.test.ts`
- `apps/work/lat.md/skill-run-integration.md#Approved target`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md#Roadmap Items`
