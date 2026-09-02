---
plan_contract: smc.plan.v3.2
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-03
grounded_commit: 07d70278a3d9fd310aa2670638eed21b1a96bcd8
grounding_source: committed_baseline
working_tree_fingerprint: dirty
---

# M2 Layout, Catalog, and Safe Selection Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M2-layout-catalog-selection.md)

## Scope

- In: Layout use-skill tab transition, Catalog panel states/search/keyboard/a11y, Chat-local selection and Composer projection, focused renderer tests; KEEP session display restore and Main no-execution gate.
- Out: Provider Bundle, real tools/call, pending-submit/SSE/cancel/retry, artifacts, Session writer, M5 default, P1, Expert removal.
- Production Owner inherited from PRD: Layout/ChatRun for mode; mounted Chat for selection/submit; Main IPC/Gateway for Catalog data and Backend.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | apps/work/src/renderer/src/screens/Layout/Layout.tsx#handleUseSkill | exists at 07d70278 | inline transition logic | goTo chat only; no abortChat | chatRuns.ts has isScratchRun/mintRun helpers | PASS |
| C01 | apps/work/src/renderer/src/screens/Layout/chatRuns.ts | exists at 07d70278 | no selectSkillModeTransition yet | Layout handleUseSkill duplicates transition | selectProfileRunTransition pattern | PASS |
| C02 | apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx | exists at 07d70278 | panel maps five statuses | fetchSkillRunCatalog via store | no second catalog store | PASS |
| C02 | apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx | exists at 07d70278 | keyboard Arrow/Enter/Escape | onSelectSkill callable gate | no renderer tests at baseline | PASS |
| C03 | apps/work/src/renderer/src/screens/Chat/Chat.tsx | exists at 07d70278 | Chat-local selectedSkill | Catalog vs Selection Bar; toolbarExtras null in skill mode | no Layout selection field | PASS |
| C03 | apps/work/src/renderer/src/screens/Chat/ChatInput.tsx | exists at 07d70278 | attachmentsDisabled | hides attach; addFiles disabled error | ChatInput.test exists | PASS |
| C04 | existing session-mode reader | exists at 07d70278 | getSessionMode restore | Chat effect maps catalog/display | KEEP | PASS |
| C05 | apps/work/src/main/skill-run/skill-run-service.ts | exists at 07d70278 | START_DISABLED_FEATURE_MODE | default expert-compat | service tests | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Layout 提供一级“使用技能”入口：空白 scratch 在原 tab 切换为 Skill mode；已有内容或非 scratch 不覆盖原 tab，而是复用或新建正确 profile 的 Skill scratch；后台 Local/Expert 工作不被取消。 | BEHAVIOR | C01 | T1 | V01 | UNIT | yes |
| AC-02 | AC | ChatRun 的 executionMode 只表达 tab mode；Provider run_id、client request id 和 ChatRun id 继续不可互换，Layout 不保存 selected Skill 或 Provider payload。 | BEHAVIOR | C01 | T1 | V01 | UNIT | yes |
| AC-03 | AC | Skill mode 中，Catalog 仅展示 Main contract 明确标记为 Skill 的项；loading、empty、unauthorized、backend unavailable、contract unsupported 和不可调用项均有可恢复状态，不猜测或混入 Connector。 | CONTRACT | C02 | T2 | V02 | UNIT | yes |
| AC-04 | AC | Catalog 支持搜索、类别可发现性和 Arrow/Enter/Escape 键盘操作；选择目标可被辅助技术辨识，且 keyboard flow 不依赖鼠标。 | BEHAVIOR | C02 | T2 | V02 | UNIT | yes |
| AC-05 | AC | 挂载的 Chat 是唯一 selection truth：未选择时显示 Catalog 并禁用 Skill submit；选择后显示 Selection Bar，清除后回到 Catalog；tab 切换或恢复 session 不使 mode/selected Skill display 丢失。 | BEHAVIOR | C03 | T3 | V03 | UNIT | yes |
| AC-06 | AC | Skill mode 从 Composer 移除 Local Model、Reasoning、Fast Mode、Context Folder 与 Expert controls，并明确禁用未合同化 Attachment；不新增第二个 Chat View、MessageList 或 Input。 | BEHAVIOR | C03 | T3 | V03 | UNIT | yes |
| AC-07 | AC | 在默认 expert-compat 或 RM-01 未完成时，M2 UI 选择和 prompt 输入不产生真实 tools/call，不自动 fallback 到 Expert；M3 仍是唯一 owner of execution/recovery semantics。 | NEGATIVE | C05 | T3 | V04 | UNIT | yes |
| AC-08 | AC | Layout/Chat transition、Catalog state/keyboard、selection/Composer projection 和 mode restoration 的 focused tests 通过；任何直接修复只在既有 Layout、Chat 或 Catalog owner 中完成。 | EVIDENCE | C01<br>C02<br>C03 | T1<br>T2<br>T3 | V01<br>V02<br>V03 | UNIT | yes |
| DOD-01 | DOD | C01–C03 有 APPROVED Stage PRD、validated Plan、review PASS、focused renderer/layout verification evidence 和真实 implementation commit；C04/C05 的 existing owner 仍由回归证据覆盖。 | EVIDENCE | C01<br>C02<br>C03<br>C05 | T1<br>T2<br>T3 | V01<br>V02<br>V03<br>V04 | DOCUMENT_SEMANTIC | yes |
| DOD-02 | DOD | RM-03 完成不改变 RM-01 的 BACKLOG，也不允许 RM-04 在 RM-01 未 DONE 时进入真实执行。 | OPERATIONS | C05 | T3 | V05 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要 Provider schema、真实 run lifecycle、Session/File writer 或 production default 的工作必须返回 RM-01、RM-04、RM-05 或独立后续 PRD，不得混入 M2。 | SCOPE | C05 | T3 | V05 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

None

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Catalog DTO | AC-03 | Main listCatalog | SkillCatalogResponse via skill-run:list-catalog | fetchSkillRunCatalog to panel | status; tools | Gateway discriminator | UI contract-unsupported; no guess | not used | V02 |
| Start still gated | AC-07 | Chat submitSkill | skill-run:start | createSkillRunService.start | start DTO fields | Service feature mode | START_DISABLED_FEATURE_MODE; no callSkill | not used when disabled | V04 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Output | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `npx vitest run src/renderer/src/screens/Layout/chatRuns.test.ts` (cwd `apps/work`) | scratch in-place mode change; non-scratch leaves other loading runs unchanged; ChatRun has no selectedSkill | no abort on use-skill | `apps/work/artifacts/rm-03-m2/v01-chatRuns.log` | local apps/work | yes |
| V02 | UNIT | `npx vitest run src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx` (cwd `apps/work`) | all catalog statuses; search/category; Arrow/Enter/Escape; non-callable not selected | contract unsupported path | `apps/work/artifacts/rm-03-m2/v02-catalog-panel.log` | local apps/work | yes |
| V03 | UNIT | `npx vitest run src/renderer/src/screens/Chat/ChatInput.test.tsx src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx src/renderer/src/screens/Chat/skillSelectionRestore.test.ts` (cwd `apps/work`) | attach hidden; restore maps session tool display; clear button fires onClear | toolbar extras not in ChatInput | `apps/work/artifacts/rm-03-m2/v03-selection-composer.log` | local apps/work | yes |
| V04 | UNIT | `npx vitest run src/main/skill-run/skill-run-service.test.ts` (cwd `apps/work`) | default start START_DISABLED_FEATURE_MODE; callSkill not called | disabled start regression | `apps/work/artifacts/rm-03-m2/v04-start-disabled.log` | local apps/work | yes |
| V05 | DOCUMENT | `node -e "const fs=require('fs');const r=fs.readFileSync('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md','utf8');const l=fs.readFileSync('apps/work/src/renderer/src/screens/Layout/chatRuns.ts','utf8');let ok=true;if(r.indexOf('RM-01')<0)ok=false;if(r.indexOf('RM-04')<0)ok=false;if(r.indexOf('BACKLOG')<0)ok=false;if(l.indexOf('selectedSkill')>=0)ok=false;if(!ok)process.exit(1);"` (cwd repo root) | RM-01 and RM-04 remain BACKLOG; Layout chatRuns has no selectedSkill field | M2 must not enable skill-first | `apps/work/artifacts/rm-03-m2/v05-roadmap-scope.log` | local repo | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M2-layout-catalog-selection.md`
- `apps/work/src/renderer/src/screens/Layout/chatRuns.ts`
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#handleUseSkill`
- `apps/work/src/renderer/src/screens/Layout/chatRuns.test.ts`

## Triggered Read

- If Catalog DTO shape unclear: `apps/work/src/shared/skill-run.ts` `SkillCatalogResponse`
- If ChatInput attach markup differs: `ChatInput.tsx` around `attachmentsDisabled`
- If restore helper cannot live in Chat.tsx without circular import: keep in same file
- Do not read e2e live, continuation, artifact transfer

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#mintRun` | PROD | MODIFY | Layout ChatRun owner | T1 | add `selectSkillModeTransition` beside mintRun | Layout mode entry | no |
| C01 | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#handleUseSkill` | PROD | MODIFY | Layout navigation | T1 | delegate to `selectSkillModeTransition` | Layout mode entry | no |
| C01 | `apps/work/src/renderer/src/screens/Layout/chatRuns.test.ts` | TEST | MODIFY | chatRuns tests | T1 | V01 evidence | Layout transition evidence | no |
| C02 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel` | PROD | MODIFY | Catalog panel | T2 | aria-pressed and refresh aria-label | Safe Catalog states | no |
| C02 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx` | TEST | ADD | skill-run renderer tests | T2 | V02 evidence | Catalog keyboard/a11y evidence | yes |
| C03 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | PROD | MODIFY | mounted Chat | T3 | export `resolveRestoredSkillSelection` | Selection truth | no |
| C03 | `apps/work/src/renderer/src/screens/Chat/ChatInput.test.tsx` | TEST | MODIFY | ChatInput tests | T3 | attachmentsDisabled evidence | Composer projection | no |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx` | TEST | ADD | skill-run renderer tests | T3 | clear button evidence | Selection bar evidence | yes |
| C03 | `apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts` | TEST | ADD | Chat restore tests | T3 | restore mapper evidence | Selection truth | yes |
| C04 | existing session-mode reader | PROD | KEEP | session-mode reader | - | display restore unchanged | Persisted display restoration | no |
| C05 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | KEEP | SkillRunService | - | start gate unchanged | No-execution safety | no |

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C02 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx` | No skill-run renderer test file exists at baseline | Bounded Catalog panel states/keyboard/a11y evidence only |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx` | No skill-run renderer test file exists at baseline | Bounded Selection Bar clear interaction only |
| C03 | `apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts` | No dedicated restore-helper test at baseline | Bounded restore mapper catalog-hit vs display-fallback only |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | handleUseSkill inline in Layout.tsx | hoist once next to isScratchRun/mintRun |
| C02 | MODIFY_EXISTING | panel already owns states/keyboard | add a11y attrs and tests only |
| C03 | MODIFY_EXISTING | Chat-local selectedSkill already drives UI | extract restore mapper; extend tests |
| C04 | REUSE_EXISTING | session-mode reader at baseline | traceability only |
| C05 | REUSE_EXISTING | createSkillRunService start gate | no skill-first enablement |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#mintRun`<br>`apps/work/src/renderer/src/screens/Layout/Layout.tsx#handleUseSkill`<br>`apps/work/src/renderer/src/screens/Layout/chatRuns.test.ts` | `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#isScratchRun`<br>`apps/work/src/renderer/src/screens/Layout/chatRuns.ts#mintRun` | - | yes |
| T2 | C02 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel`<br>`apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx` | `apps/work/src/renderer/src/modules/skill-run/store.ts#fetchSkillRunCatalog` | - | yes |
| T3 | C03 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx`<br>`apps/work/src/renderer/src/screens/Chat/ChatInput.test.tsx`<br>`apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx`<br>`apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts` | `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx#attachmentsDisabled` | - | yes |

## Integration Hotspots

None

## Generated Outputs Ledger

None

## Todo T1 — Skill mode tab transition

**Owns Changes**
- C01

**Goal**

Hoist Layout use-skill transition into `selectSkillModeTransition` and prove scratch in-place, reuse/mint, and non-interference with loading tabs.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#mintRun`
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#handleUseSkill`

**Changes**

- Add `selectSkillModeTransition` beside `mintRun` in `chatRuns.ts`.
- Wire `handleUseSkill` to the helper and `goTo("chat")` only.
- Extend `chatRuns.test.ts` for V01.

**Stop conditions**
- [ ] V01 passes
- [ ] ChatRun still has no selectedSkill payload

**Triggered reads**
- None

## Todo T2 — Catalog states and keyboard

**Owns Changes**
- C02

**Goal**

Prove Catalog recoverable states, search/category filtering, keyboard flow, and a11y attrs without a second catalog store.

**Immediate anchors**
- `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel`

**Changes**

- Add `aria-pressed` on category pills and `aria-label` on refresh using English `skillRun.*` keys only.
- Add `SkillCatalogPanel.test.tsx` for V02.

**Stop conditions**
- [ ] V02 passes

**Triggered reads**
- If DTO shape unclear: `apps/work/src/shared/skill-run.ts`

## Todo T3 — Selection truth and Composer projection

**Owns Changes**
- C03

**Goal**

Export and test session restore mapper; prove Composer attachment disablement and Selection Bar clear; keep Main start gate unchanged.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx#attachmentsDisabled`

**Changes**

- Export `resolveRestoredSkillSelection` from `Chat.tsx`.
- Extend `ChatInput.test.tsx`, add `SkillSelectionBar.test.tsx` and `skillSelectionRestore.test.ts`.
- Do not enable `skill-first` or add Layout selection state.

**Stop conditions**
- [ ] V03 and V04 pass

**Triggered reads**
- None

## Verification

Run from repo root unless noted. Capture stdout/stderr to the Evidence Output paths in the Verification Ledger.

```bash
cd apps/work
mkdir -p artifacts/rm-03-m2
npx vitest run src/renderer/src/screens/Layout/chatRuns.test.ts 2>&1 | tee artifacts/rm-03-m2/v01-chatRuns.log
npx vitest run src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx 2>&1 | tee artifacts/rm-03-m2/v02-catalog-panel.log
npx vitest run src/renderer/src/screens/Chat/ChatInput.test.tsx src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx src/renderer/src/screens/Chat/skillSelectionRestore.test.ts 2>&1 | tee artifacts/rm-03-m2/v03-selection-composer.log
npx vitest run src/main/skill-run/skill-run-service.test.ts 2>&1 | tee artifacts/rm-03-m2/v04-start-disabled.log
cd ../..
node -e "const fs=require('fs');const r=fs.readFileSync('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md','utf8');const l=fs.readFileSync('apps/work/src/renderer/src/screens/Layout/chatRuns.ts','utf8');let ok=true;if(r.indexOf('RM-01')<0)ok=false;if(r.indexOf('RM-04')<0)ok=false;if(r.indexOf('BACKLOG')<0)ok=false;if(l.indexOf('selectedSkill')>=0)ok=false;if(!ok){console.error('roadmap gate check failed');process.exit(1);}console.log('roadmap scope OK');" 2>&1 | tee apps/work/artifacts/rm-03-m2/v05-roadmap-scope.log
```

- AC mapping: V01 covers AC-01–AC-02; V02 covers AC-03–AC-04; V03 covers AC-05–AC-06 and AC-08; V04 covers AC-07; V05 covers DOD-02–DOD-03.
- Expected: focused renderer/layout tests pass; default start remains disabled; RM-01 stays BACKLOG.
- Negative/regression: non-callable catalog entries must not select; attachments stay disabled in skill mode; no `callSkill` on default start.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all blocking Verification Ledger rows pass | V01,V02,V03,V04,V05 evidence output retained |
| IMPLEMENTED_NOT_PROVEN | evidence collection incomplete | pending verification named |
| BLOCKED | vitest or environment prevents verification | blocker recorded |
| RETURN_PRD | proof needs Provider schema, real start, second Chat/Session owner, or default skill-first | revision request recorded |
