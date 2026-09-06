---
work_item_id: RM-07
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-06T23:55:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.2/RM-07
grounded_commit: bbd78293f673a3b9acd6f3ea5a954cba530df1ad
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.2.1
product_decision: user-input:2026-09-06-m6-split-expert-removal-from-p1
---

# WORK PRD v4.0.1 M6a — Expert Default Entry Removal

本 Stage PRD 执行架构 Compatibility Contract 的 v4.2 REMOVE：在生产默认 `skill-first`（以及 `local-only`）下，删除 local-chat Composer 上的 Expert 默认创建入口，使新员工 Skill 调用不能再经 `ExpertRequest` / `expert.start` 发出。Expert Run Service 仍是既有 HermesTask 的唯一 lifecycle reader；`expert-compat` 仍是可执行回滚，可恢复该入口。本阶段不删除 Expert 子系统，不改 `contracts/work-expert/v1.0.2`，也不把失败 Skill Run 改交 Expert。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-07` / M6a v4.2 Expert 默认创建入口 Removal |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.2/RM-07` |
| Architecture | `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md` C04、Replacement Matrix、Compatibility Contract AC-22 |
| Repository baseline | `bbd78293f673a3b9acd6f3ea5a954cba530df1ad` |
| Dependencies | RM-06 is `DONE`（`185418ff`）。生产默认已是 `skill-first`；无 silent fallback；Skill 与 Expert dual readers 并存。 |
| Provider input | 不修改 v1.2.1 Bundle。Expert 合同保持 `contracts/work-expert/v1.0.2`。 |
| Current default mode | `DEFAULT_MODE = "skill-first"`。env / store 可回滚到 `expert-compat` / `local-only`。 |
| Current Expert create path | local-chat Composer 仍渲染 `ExpertContextControl`。Chat 在 `expertModeActive` 时调用 `window.hermesAPI.expert.start`。Renderer **不**读取 feature mode 来隐藏该入口。 |
| Current Expert start gate | Main `expert.start` IPC 校验 auth 与 `ExpertRequest` 后直接 `ExpertRunService.start`；**没有** feature-mode fail-closed。因此 `local-only` / `skill-first` 仍可新建 Expert Task。 |
| Compatibility KEEP | Expert cancel / rehydrate / list / 历史 session / File Platform Expert remote rows / `ExpertRunCard` retry 仍存在。 |
| P1 / other M6 | Approval decision、rich activity、JSON Schema form、Attachment、收藏不在本 Item。见 RM-08–RM-12。 |

## Problem and Outcome

M0–M5 已把新员工 Skill 调用的生产默认切到 `tool_name → run_id`，但 local-chat「新建对话」Composer 仍把 Expert 选择器当作默认可走路径。用户不必打开「使用技能」也能发出 `expertSlug + skillName → task_id`。Main 对 `expert.start` 也不看 feature mode，Renderer 绕过 UI 仍能新建 Expert Task。这使架构 C04「默认入口 REMOVE」未完成，回滚 mode 与生产默认在创建路径上没有对称的硬门。

完成后，`skill-first` 与 `local-only` 下 Composer 不再展示 Expert 默认创建入口，Chat 对新建 prompt 不调用 `expert.start`，Main 在非 `expert-compat` 下拒绝新的 `expert.start`。已创建 Expert Task、历史 transcript 与 Expert Artifact 继续由既有 Expert reader 恢复。`expert-compat` 回滚后入口与 start 恢复。`ExpertRunCard` 对已有失败投影的 retry 作为 compatibility 保留，不作为默认员工入口。P1 能力与 Expert 合同删除不在本阶段。

## Scope

- In: 按 feature mode 移除 / 恢复 local-chat Composer 的 Expert 默认创建入口；Chat 新建提交路由与 Main `expert.start` 硬门对齐；更新 M5 回滚手册中关于 Expert 入口的说明；证明 Local Chat 与 Skill Run 新提交不受影响；无 silent fallback。
- Out: 删除 Expert IPC / ExpertRunService / Expert 合同 / 历史 session / Expert File rows；禁止 `expert.retry`（已有 Expert 投影）；把 Layout「新建对话」改成 Skill Tab；Approval / activity / form / attachment（RM-08–RM-11）；收藏（RM-12）；修改 `contracts/skill-run/v1.2.1` 或 `contracts/work-expert/v1.0.2`；把失败 Skill Run 改交 ExpertTask。
- Production Owner: Chat Composer 拥有入口可见性与新建提交路由。Main Expert IPC / ExpertRunService 拥有 `expert.start` 硬门与既有 Task lifecycle。feature-mode store 仍是唯一新提交 mode Owner。SkillRunService 拥有 Skill 新提交。Local Chat 拥有无 Expert 选择时的本地发送。Renderer 不得成为 feature-mode SoT。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Production feature mode | feature-mode store | 默认 `skill-first`；env / store 可覆盖；只门禁 Skill `start` | EXISTS |
| Skill 新提交 | SkillRunService | 非 `skill-first` 返回 `START_DISABLED_FEATURE_MODE` | EXISTS |
| Local Chat 新提交 | Chat + Local Chat transport | local-chat 无 Expert 选择时走 Hermes 本地发送 | EXISTS |
| Expert 默认创建入口 | Chat Composer `ExpertContextControl` | 凡非 Skill mode 即渲染；不读 feature mode | CONFLICT |
| Chat Expert 新建路由 | `Chat.tsx` submit | `expertModeActive` 时 `expert.start`；与 Skill / Local 互斥，但不受 feature mode 约束 | CONFLICT |
| Expert start IPC | Expert IPC | auth + request 校验后无条件 start | CONFLICT |
| Expert reader / cancel / rehydrate | ExpertRunService | 独立恢复既有 Task | EXISTS |
| Expert retry | ExpertRunCard + `expert.retry` | 对已有失败投影重建 `ExpertRequest` | EXISTS（compatibility） |
| Dual readers / no Skill→Expert fallback | Skill + Expert owners | Skill 失败不改走 Expert | EXISTS |
| Rollback handbook | `docs/work/SKILL-RUN-M5-ROLLBACK.md` | 写清 Skill 停建；写「expert-compat 新 Expert 提交仍走 Expert」，未写生产默认下入口已删除 | PARTIAL |
| P1 Approval / activity / form / attachment | Skill Run / Provider | 不在本 Item | KEEP absent |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Expert 默认创建入口 | Existing Chat Composer | `skill-first` / `local-only`：local-chat Composer 不渲染 `ExpertContextControl`，用户不能从该入口选择 expertSlug/skillName 并发出新 Task。`expert-compat`：入口恢复 | REMOVE（默认路径） / KEEP（回滚路径） |
| Chat 新建 Expert 路由 | Existing Chat submit owner | 上述关闭 mode 下新建 prompt 不得调用 `expert.start`；Slash-first 与 Local Chat 不变；Skill mode 仍只走 Skill Run | MODIFY |
| Expert start 硬门 | Existing Expert IPC + feature-mode store | 仅 `expert-compat` 允许新 `expert.start`；其它 mode 返回明确 errorCode，不发 Expert HTTP | MODIFY |
| Expert retry / cancel / rehydrate / list | Existing Expert owners | 对已有 Expert 投影与 continuation 保持可用，不依赖 Composer 入口 | KEEP |
| Skill 新提交 / Local Chat | Existing owners | 行为不变；不得把被拒的 Expert start 改写成 Skill 或 Local | KEEP |
| Feature mode | Existing feature-mode store | 仍是唯一 mode SoT；Renderer 经既有 `skillRun.getFeatureMode` 读取，不自报、不缓存为第二 SoT | KEEP |
| Rollback handbook | Work release docs | 写清：生产默认已无 Expert 默认入口；回滚 `expert-compat` 恢复入口与 start；`local-only` 两者都不新建 | MODIFY |
| Expert 子系统 / 合同 | Expert owners | 代码与 `work-expert/v1.0.2` 保留到未来另一次 Removal | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Composer Expert 默认创建入口 | REMOVE | 生产默认下该入口仍创建 `task_id`，与架构 C04 冲突。只移除默认创建路径，不删除组件实现。`expert-compat` 继续挂载同一组件。 |
| C02 | Chat 新建提交路由 | MODIFY | 入口隐藏不够。Chat 必须在关闭 mode 下拒绝 `expertModeActive` 新建，避免残留 selection 或测试桩发出 start。 |
| C03 | Main `expert.start` 硬门 | MODIFY | UI 不是信任边界。非 `expert-compat` 必须在 Main 拒绝新 start，且不发 Expert HTTP。 |
| C04 | Expert reader / retry / cancel / rehydrate | KEEP | Compatibility：既有 Task 与 ExpertRunCard retry 不是默认员工入口。 |
| C05 | Skill Run 与 Local Chat 新提交 | KEEP | 不得借 Removal 改 Skill start 或本地 Chat abort/send。 |
| C06 | Rollback handbook Expert 入口说明 | MODIFY | M5 手册只描述 Skill 停建。必须补上默认入口已删除、回滚如何恢复。 |

## Replacement / Removal Matrix

| Replaced Production Path | Existing Owner | Target Path | Removal Condition |
|---|---|---|---|
| local-chat Composer `ExpertContextControl` + Chat `expert.start` 作为新员工 Skill 默认创建入口 | Chat Composer / Chat submit | Layout「使用技能」→ Skill Catalog → `SkillRunService` → `tool_name` / `run_id` | 本 PRD implementation commit 合入后，`skill-first` 与 `local-only` 不再挂载该入口，Main 拒绝新 `expert.start` |
| 无 feature-mode 门禁的 `expert.start` IPC | Expert IPC | 同一 IPC，仅 `expert-compat` 放行新 start | 与上一行同一 commit；关闭 mode 返回稳定 errorCode，不发 HTTP |

`expert.retry`、`expert.cancel`、`expert.rehydrateSession` **不是**被替换路径。

## Compatibility Contract

### Expert compatibility（收紧后）

- **Current Consumer:** 已部署 Expert v1.0.2 的在途 HermesTask、历史 session、Expert Artifact、`ExpertRunCard` retry。
- **Reason:** Skill Run 与 Expert Task 身份不兼容；删除默认入口后仍须恢复旧任务。
- **Removal Condition:** 本 PRD 只删除**默认创建入口**。Expert 子系统、合同与 retry 的最终删除需要另一次 Removal PRD（不在 RM-07–RM-12）。
- **Removal Version:** 默认入口最早 Work v4.2（本 Item）。完整 Expert 代码删除不在本版本。

Mode 只影响新提交：

| Mode | 新 Skill Run | 新 Expert Task（Composer / `expert.start`） | 既有 Skill / Expert reader |
|---|---|---|---|
| `skill-first` | 允许 | 拒绝 | 继续 |
| `local-only` | 拒绝 | 拒绝 | 继续 |
| `expert-compat` | 拒绝 | 允许 | 继续 |

失败 Skill Run 不得改交 Expert。被拒的 Expert start 不得改交 Skill Run 或 Local Chat。

## Contract and Security Boundary

- 不修改 Skill Run v1.2.1 与 Expert v1.0.2 Bundle。
- Renderer 经既有 `window.hermesAPI.skillRun.getFeatureMode` 读取 mode；不得新增第二 mode IPC，不得让 Renderer 自报 org/user/origin/mode 以放行 start。
- `expert.start` 硬门在 Main：非 `expert-compat` 不调用 Expert gateway HTTP，返回明确 errorCode（Plan 命名，PRD 只要求可观察且稳定）。
- `expert.retry` 仅针对已有 Expert 投影；不得变成无投影的匿名新建。
- 不向 Renderer 暴露 JWT、Expert URL 或 raw Expert event。
- 回滚只改 feature mode；不得删除 Expert continuation、ManagedFile 或 transcript。

## Acceptance Criteria

1. `skill-first` 与 `local-only` 下，local-chat Composer 不渲染 Expert 默认创建入口；用户无法从该入口发出新的 `ExpertRequest`。
2. 上述 mode 下 Chat 对新建 prompt 不调用 `expert.start`；有残留 `expertSelection` 也不得发出。Slash-first 与未选 Expert 的 Local Chat 发送仍可用。
3. Main `expert.start` 在非 `expert-compat` 下失败，errorCode 稳定，且不发出 Expert HTTP。`expert-compat` 下 start 仍可创建 Task。
4. 已有 Expert continuation 在三种 mode 下均可 rehydrate / cancel；`ExpertRunCard` retry 对已有失败投影仍可用。
5. Skill Run 在 `skill-first` 下仍可 start；Skill 失败路径不创建 ExpertTask。Local Chat focused tests 无因本 Item 引入的回归。
6. 回滚手册写明：生产默认已移除 Expert 默认入口；切到 `expert-compat` 恢复入口与 start；`local-only` 同时停 Skill 与 Expert 新建；禁止把失败 Skill Run 改交 Expert。
7. 本 Item 不得声称 Approval、rich activity、表单、Attachment 或 Expert 子系统删除已完成。

## Definition of Done

1. C01–C03 有 focused tests（Renderer 入口/路由 + Main start 硬门 + 不发 HTTP）。C04/C05 由既有 Expert / Skill / Local 套件回归。C06 有手册条文可检索。
2. RM-07 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。
3. 发现需要删除 Expert 子系统、改 Expert 合同、或做 P1 Approval/activity/form/attachment/收藏的工作，必须返回 RM-08–RM-12 或新的 Removal PRD，不得混入本 Item。

## Source Anchors

- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `apps/work/src/renderer/src/modules/expert/ExpertContextControl.tsx`
- `apps/work/src/renderer/src/modules/expert/ExpertRunCard.tsx`
- `apps/work/src/main/expert/expert-ipc.ts`
- `apps/work/src/main/expert/expert-run-service.ts#createExpertRunService`
- `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`
- `apps/work/src/preload/skill-run-api.ts`
- `docs/work/SKILL-RUN-M5-ROLLBACK.md`
- `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md#Compatibility Contract`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md#Milestone M6 — Expert Removal and Independent P1 Items`
