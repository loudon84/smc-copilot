---
work_item_id: RM-18
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.1
review_verdict: PASS
approved_at: 2026-09-10T09:00:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.10/RM-18/typecheck-baseline-2026-09-10
grounded_commit: 1069f0050956154b687c0a211c0b24c6245301da
grounding_mode: revision
roadmap: docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md
product_version: v4.0.1
---

# WORK PRD v4.0.1 — Package-wide Typecheck Baseline Restoration

本 Stage PRD 只关闭 Roadmap `RM-18`：恢复 `apps/work` 的 package-wide TypeScript 检查为绿色，消化 RM-17 与 Managed Hermes RM-02 登记的 `BASELINE_RESTORATION_INPUT`。本 Item **不**新增产品能力、不改 Runtime ownership、不改 Skill Run Provider 合同。

独立初审：`docs/work/reviews/prd-work-v4.0.1-typecheck-baseline-restoration-initial-review.md` → RETURN_PRD（F1–F6）；本版关闭全部必改项。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Grounding HEAD | `1069f005`（RM-18 READY）；代码面与 `a620288c` 等价（roadmap docs-only） |
| Capture 时点 | ≥ `a620288c`；Plan 阶段必须 FRESH 重跑 `typecheck:node` / `typecheck:web` 确认计数 |
| Deferred by | RM-17；Managed Hermes PRD v1.1.3 AC-20；RM-02 AC-07 |
| Durable capture（Impl commit 入库） | `docs_agent/evidence/RM-18-typecheck-node-baseline.txt`；`docs_agent/evidence/RM-18-typecheck-web-baseline.txt`（由 Plan 阶段 capture 复制） |
| Command | `npm --prefix apps/work run typecheck` = `typecheck:node` && `typecheck:web` |

### Frozen error-file inventory（19 files）

**node (13):** `dashboard.ts`；`expert-gateway-client.ts`；`expert-session-materialize.ts`；`skill-run-artifact-transfer.ts`；`upsert-skill-run-remote-artifact.ts` + `.test.ts`；`hermes-agent-compat.ts`；`hermes.ts`；`remote-sessions.ts`；`session-continuation-store.ts`；`skill-run-contract-parser.test.ts`；`skill-run-service.test.ts`；`skill-run-session-materialize.ts`

**web (6):** `SkillRunStatusBar.test.tsx`；`ChatInput.tsx`；`sessionHistory.ts`；`skillSelectionRestore.test.ts`；`ConnectionErrorScreen.test.tsx`；`source-locale-authoring.test.ts`

## Problem and Outcome

`npm --prefix apps/work run typecheck` 失败（node 35 / web 15），阻断后续把 package-wide typecheck 重新纳入 Delivery 阻断门。

完成后：node+web typecheck 退出 0；产品可观察行为不变；无新 Owner；touched tests focused vitest PASS。

## Scope

- **In：** 上表 19 文件的最小类型/死代码修复；为 PASS 所必需的同 Owner 伴随修改须在 Plan 显式枚举；durable baseline captures + evidence + RM-18 DONE。
- **Out：** 新功能；Provider Bundle；Managed Hermes 再开删除面；放宽 `compilerOptions` 检查类标志；改写历史 run；Skill Registry v4.1.1。
- **Production Owner：** 各文件既有 Owner；不新增 Owner。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| package-wide typecheck gate | Work build | FAIL | MODIFY |
| Focused unit/guard/lat | Work | PASS recently | KEEP |
| Managed Hermes Data Plane | gateway-probe | DONE | KEEP |
| Skill Run / Expert / File / Chat | M6 owners | 类型债残留 | MODIFY |

## Target End-State Inventory

| Capability | Owner | Target State | Classification |
|---|---|---|---|
| `npm --prefix apps/work run typecheck` | Work build | exit 0 | MODIFY |
| Hermes unused leftovers | Main hermes | unused symbols 删除（仅 unused；不重开 Runtime 删除面） | MODIFY |
| Skill/Expert/File/Chat types | 既有 owners | 与现行合同一致 | MODIFY |
| Renderer Node-in-web tests | SkillRunStatusBar.test | **原地**去掉 Node API 依赖或 mock；不得仅 exclude 出 web project | MODIFY |

## Change Classification

| Change ID | Capability | Action | Reason |
|---|---|---|---|
| C01 | Main unused / hermes leftovers | MODIFY | unused-symbol only；不重开 Managed Hermes 删除面 |
| C02 | Expert / Skill Run / File type drift | MODIFY | DB typing、FileErrorCode、Gateway mock、continuation `never` 等 |
| C03 | Renderer / shared test typing | MODIFY | Chat types、mocks；renderer 测试原地修复 |
| C04 | Evidence + Roadmap DONE | ADD/MODIFY | durable captures + proof；RM-18 DONE |

## Acceptance Criteria

- **AC-01**: `npm --prefix apps/work run typecheck:node` 退出 0。
- **AC-02**: `npm --prefix apps/work run typecheck:web` 退出 0。
- **AC-03**: `npm --prefix apps/work run typecheck` 退出 0。
- **AC-04**: `npm --prefix apps/work run guard` 退出 0。
- **AC-05**: `lat check`（cwd `apps/work`）退出 0。
- **AC-06**: 不放宽 tsconfig 严格性。`tsconfig*.json` diff 仅限 `include`/`exclude`/`types`；`compilerOptions` 不得新增关闭检查类标志（`strict*`、`noUnused*`、`noImplicit*` 等）。任何文件被移出某 tsc project 的 include，必须仍被另一 project 覆盖；`src/renderer/**` 测试因 node 工程不覆盖，须原地修复，不得仅以 exclude 消除错误。
- **AC-07**: 所有被本 Item 修改的 `*.test.ts` / `*.test.tsx` 经 focused `vitest run <those files>` PASS。
- **AC-08**: 无产品行为变更（无新 IPC/UI/Runtime ownership）；Impl commit 不含 Roadmap DONE。
- **AC-09**: Status commit 将 RM-18 DONE，Evidence=`smc-evidence:RM-18@sha256:<scope-fingerprint>`。

## Definition of Done

- **DOD-01**: AC-01–AC-09 FRESH PASS。
- **DOD-02**: 独立 canonical Plan；`commit_policy: post_review`。
- **DOD-03**: Impl/status commit 分离。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Result | Evidence Action |
|---|---|---|---|---|---|
| CLM-01 | AC-01 | typecheck:node PASS | yes | FAIL 35 | NEW_EVIDENCE |
| CLM-02 | AC-02 | typecheck:web PASS | yes | FAIL 15 | NEW_EVIDENCE |
| CLM-03 | AC-03 | typecheck PASS | yes | FAIL | NEW_EVIDENCE |
| CLM-04 | AC-04 | guard PASS | yes | PASS | NEW_EVIDENCE |
| CLM-05 | AC-05 | lat check PASS | yes | PASS | NEW_EVIDENCE |
| CLM-06 | AC-06 | tsconfig/diff policy held | yes | N/A | NEW_EVIDENCE |
| CLM-07 | AC-07 | touched tests PASS | yes | N/A | NEW_EVIDENCE |
| CLM-08 | AC-08 | no product expansion | yes | N/A | NEW_EVIDENCE |
| CLM-09 | AC-09 | RM-18 DONE refs | yes | READY | NEW_EVIDENCE |
