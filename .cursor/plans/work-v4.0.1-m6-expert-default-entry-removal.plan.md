---
name: M6a Expert Default Entry Removal
overview: Hide the local-chat Composer Expert default-create entry unless feature mode is expert-compat, reject new expert.start in Main for other modes, and document rollback restore. Keep Expert reader, retry, and Skill/Local submit paths.
todos:
  - id: t1-expert-start-feature-mode-gate
    content: "T1 — Main expert.start feature-mode gate [C03]"
    status: completed
  - id: t2-composer-expert-default-entry
    content: "T2 — Composer Expert default-entry hide and submit routing [C01, C02]"
    status: completed
  - id: t3-rollback-handbook-expert-entry
    content: "T3 — Rollback handbook Expert-entry wording [C06]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.4
plan_id: RM-07
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.2/RM-07
grounded_commit: 0450c44e1d5545ff5646d7c58e05b43f123c5869
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M6a Expert Default Entry Removal Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6-expert-default-entry-removal.md)

## Scope

- In: feature-mode gated Composer Expert default-create entry; Chat new-submit routing that cannot call `expert.start` outside `expert-compat`; Main `expert.start` hard gate that issues no Expert HTTP; rollback-handbook wording for restore vs production hide; prove Skill Run and Local Chat new submits and Expert reader/retry stay.
- Out: deleting Expert IPC / ExpertRunService / Expert contract / history / File rows; disabling `expert.retry` for existing projections; turning Layout「新建对话」into a Skill Tab; Approval / activity / form / attachment / favorites; editing Skill Run or Expert Bundles; resubmitting failed Skill Runs as ExpertTask.
- Production Owner inherited from PRD: Chat Composer owns entry visibility and new-submit routing. Expert IPC owns the `expert.start` hard gate. feature-mode store remains the only mode SoT. SkillRunService owns Skill new submits. Local Chat owns send when no Expert selection. Renderer is not a mode SoT.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | exists at `0450c44e`; `toolbarExtras` mounts `ExpertContextControl` whenever `!isSkillRunMode`; Chat does not call `getFeatureMode` | `function Chat` | `ChatInput` `toolbarExtras` at the Composer; `ExpertContextControl` is the default-create widget | `getFeatureMode` already on `createSkillRunApi`; do not add a second mode IPC; do not delete `ExpertContextControl.tsx` | PASS |
| C02 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleSubmitOrQueue` | exists; `expertModeActive` calls `submitExpert` → `window.hermesAPI.expert.start` with no feature-mode check | `const handleSubmitOrQueue` | `submitExpert` is the only production `expert.start` caller; `ExpertRunCard` uses `expert.retry` | Slash-first and Local Chat branches already exist; do not retarget them | PASS |
| C03 | `apps/work/src/main/expert/expert-ipc.ts#registerExpertIpc` | exists; `EXPERT_IPC_CHANNELS.start` validates sender/auth/request then `getExpertRunService().start` with no mode gate | `export function registerExpertIpc` | only IPC start reaches `createExpertRunService` `#start`; retry is a different handler | reuse `encodeExpertIpcError` and `getSkillRunFeatureMode`; inject optional `getFeatureMode` like SkillRunService tests; do not gate `retry`/`cancel`/`rehydrateSession` | PASS |
| C06 | `docs/work/SKILL-RUN-M5-ROLLBACK.md` | exists; Skill stop-create is documented; `expert-compat` still “新 Expert 提交仍走 Expert”; production hide of the default entry is missing | file-level handbook | operators currently have M5 Skill-only rollback | modify this handbook; do not add a settings UI or a second ops owner | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | skill-first 与 local-only 下，local-chat Composer 不渲染 Expert 默认创建入口；用户无法从该入口发出新的 ExpertRequest。 | BEHAVIOR | C01 | T2 | V02 | UNIT | yes |
| AC-02 | AC | 上述 mode 下 Chat 对新建 prompt 不调用 expert.start；有残留 expertSelection 也不得发出。Slash-first 与未选 Expert 的 Local Chat 发送仍可用。 | BEHAVIOR | C01, C02 | T2 | V02, V03 | UNIT | yes |
| AC-03 | AC | Main expert.start 在非 expert-compat 下失败，errorCode 稳定，且不发出 Expert HTTP。expert-compat 下 start 仍可创建 Task。 | SECURITY | C03 | T1 | V01 | UNIT | yes |
| AC-04 | AC | 已有 Expert continuation 在三种 mode 下均可 rehydrate / cancel；ExpertRunCard retry 对已有失败投影仍可用。 | LIFECYCLE | C04 | T1 | V04 | UNIT | yes |
| AC-05 | AC | Skill Run 在 skill-first 下仍可 start；Skill 失败路径不创建 ExpertTask。Local Chat focused tests 无因本 Item 引入的回归。 | NEGATIVE | C05 | T2 | V05 | UNIT | yes |
| AC-06 | AC | 回滚手册写明：生产默认已移除 Expert 默认入口；切到 expert-compat 恢复入口与 start；local-only 同时停 Skill 与 Expert 新建；禁止把失败 Skill Run 改交 Expert。 | OPERATIONS | C06 | T3 | V06 | DOCUMENT_SEMANTIC | yes |
| AC-07 | AC | 本 Item 不得声称 Approval、rich activity、表单、Attachment 或 Expert 子系统删除已完成。 | SCOPE | C06 | T3 | V06, V07 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | C01–C03 有 focused tests（Renderer 入口/路由 + Main start 硬门 + 不发 HTTP）。C04/C05 由既有 Expert / Skill / Local 套件回归。C06 有手册条文可检索。 | EVIDENCE | C01, C02, C03, C04, C05, C06 | T1, T2, T3 | V01, V02, V03, V04, V05, V06 | UNIT | yes |
| DOD-02 | DOD | RM-07 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 DONE。implementation commit 不得包含该 status 更新。 | OPERATIONS | C06 | T3 | V07 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要删除 Expert 子系统、改 Expert 合同、或做 P1 Approval/activity/form/attachment/收藏的工作，必须返回 RM-08–RM-12 或新的 Removal PRD，不得混入本 Item。 | SCOPE | C06 | T3 | V07 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| New Expert Task create | AC-03, AC-04 | Renderer `expert.start` IPC | auth validated, service not yet started | `registerExpertIpc` start handler calls `getExpertRunService().start` only when mode is `expert-compat` | same handler throws `EXPERT_START_DISABLED_FEATURE_MODE` before service/gateway; retry/cancel/rehydrate handlers remain the ExpertRunService writers | V01, V04 |
| Existing Expert Task restore | AC-04 | session rehydrate / cancel / ExpertRunCard retry | in-flight or failed Expert projection | ExpertRunService rehydrate/cancel/retry | retry stays on `expert.retry` with a previous projection id; it must not become a no-projection `expert.start` | V04 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Feature mode projection | AC-01, AC-02 | `getSkillRunFeatureMode` in Main feature-mode store | existing `skillRun.getFeatureMode` IPC `{ mode }` | Chat Composer display copy | `mode` in `skill-first` / `expert-compat` / `local-only` | Main store is SoT; Chat must not persist a second store | IPC failure fail-closes to hide Expert default entry (treat as not `expert-compat`) | None | V02, V03 |
| New Expert start | AC-02, AC-03 | Chat `handleSubmitOrQueue` only when helper allows | existing `expert.start` + `ExpertRequest` | `registerExpertIpc` start handler | validated `ExpertRequest`; mode from Main store not from Renderer-supplied field | Main checks mode after auth/request validate, before `getExpertRunService().start` | non-`expert-compat` → `encodeExpertIpcError` `EXPERT_START_DISABLED_FEATURE_MODE`; no gateway HTTP; Chat must not rewrite to Skill or Local | existing Expert `clientRequestId` only when start is allowed | V01, V02, V03 |
| Expert compatibility restore | AC-04 | ExpertRunService | existing cancel / rehydrate / retry IPC | Chat ExpertRunCard / continuation | previous `clientRequestId` for retry | Expert IPC retry handler unchanged | Skill failure still must not start Expert | retry identity remains previous projection id | V04, V05 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/expert/expert-ipc-registration.test.ts --pool=threads --maxWorkers=1', shell=True))"` | `skill-first` and `local-only` `expert.start` throw `EXPERT_START_DISABLED_FEATURE_MODE` and do not call `getExpertRunService().start`; `expert-compat` still calls start | retry/cancel/rehydrate handlers are not feature-gated | LOCAL_TRANSIENT | local apps/work | yes |
| V02 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/screens/Chat/expertDefaultEntry.test.ts --pool=threads --maxWorkers=1', shell=True))"` | `shouldMountExpertDefaultEntry` is true only for `expert-compat` and not skill-run mode; `shouldSubmitNewExpertStart` is false for `skill-first`/`local-only` even with leftover expert selection | Slash-first/Local path is not claimed by these helpers | LOCAL_TRANSIENT | local apps/work | yes |
| V03 | UNIT | `python -c "from pathlib import Path; import sys; p=Path('apps/work/src/renderer/src/screens/Chat/Chat.tsx').read_text(encoding='utf-8'); ok=('shouldMountExpertDefaultEntry' in p and 'shouldSubmitNewExpertStart' in p and 'getFeatureMode' in p and 'expert.start' in p); sys.exit(0 if ok else 1)"` | Chat consumes the helpers and existing `getFeatureMode`; it still contains the `expert.start` call for the allowed path | no new mode IPC channel name | LOCAL_TRANSIENT | local repo | yes |
| V04 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/expert/expert-run-service.test.ts src/renderer/src/modules/expert/ExpertTimeline.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | Expert reader/retry tests still pass | `ExpertRunCard` still uses `expert.retry` not `expert.start` for failed projections | LOCAL_TRANSIENT | local apps/work | yes |
| V05 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts src/renderer/src/screens/Layout/chatRuns.test.ts --pool=threads --maxWorkers=1', shell=True))"` | Skill `skill-first` start still works; Layout local-chat tests pass | Skill failure still does not start Expert | LOCAL_TRANSIENT | local apps/work | yes |
| V06 | DOCUMENT | `python -c "from pathlib import Path; import sys; r=Path('docs/work/SKILL-RUN-M5-ROLLBACK.md').read_text(encoding='utf-8'); ok=('Expert' in r and 'skill-first' in r and 'expert-compat' in r and 'local-only' in r and '默认' in r); sys.exit(0 if ok else 1)"` | handbook states production default hides Expert default entry, `expert-compat` restores entry and start, `local-only` stops both new Skill and new Expert, and forbids Expert resubmit of failed Skill Runs | no claim that Expert subsystem is deleted | LOCAL_TRANSIENT | local repo | yes |
| V07 | DOCUMENT | `python -c "from pathlib import Path; import sys; r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); lat=Path('apps/work/lat.md/skill-run.md').read_text(encoding='utf-8'); p=chr(124); row=next(x for x in r.splitlines() if x.startswith(p+' RM-07 ')); ok=(row.split(p)[4].strip()!='DONE' and 'RM-08' in r and 'Approval' in lat); sys.exit(0 if ok else 1)"` | implementation tree keeps RM-07 not DONE; lat.md still treats Approval/P1 as out of this Item | implementation commit must not mark RM-07 DONE or claim Approval/Attachment shipped | LOCAL_TRANSIENT | local repo | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M6-expert-default-entry-removal.md`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleSubmitOrQueue`
- `apps/work/src/main/expert/expert-ipc.ts#registerExpertIpc`
- `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`
- `apps/work/src/preload/skill-run-api.ts#createSkillRunApi`
- `apps/work/src/shared/expert.ts#encodeExpertIpcError`
- `docs/work/SKILL-RUN-M5-ROLLBACK.md`

## Triggered Read

- If `registerExpertIpc` tests cannot reach the start handler with the current `getExpertRunService` mock: extend that mock with `start`, do not add a second Expert IPC test file
- If Chat.tsx cannot be imported in unit tests: keep decisions in `expertDefaultEntry.ts` and do not mount the full Chat tree
- If `getFeatureMode` rejects in Renderer: fail-closed hide the Expert default entry; do not show it
- Do not read Provider source, do not edit Bundles, do not gate `expert.retry`

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C03 | `apps/work/src/main/expert/expert-ipc.ts#registerExpertIpc` | PROD | MODIFY | Expert IPC | T1 | optional injected `getFeatureMode` defaulting to `getSkillRunFeatureMode`; non-`expert-compat` throws `EXPERT_START_DISABLED_FEATURE_MODE` via `encodeExpertIpcError` before `getExpertRunService().start` | Expert start 硬门 | no |
| C03 | `apps/work/src/main/expert/expert-ipc-registration.test.ts` | TEST | MODIFY | Expert IPC tests | T1 | start gated by mode; start not invoked when disabled; compat mode still starts | Expert start 硬门 | no |
| C01 | `apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.ts#shouldMountExpertDefaultEntry` | PROD | ADD | Chat Composer | T2 | true only when not skill-run mode and mode is `expert-compat` | Composer Expert 默认创建入口 | yes |
| C01 | `apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.ts#shouldSubmitNewExpertStart` | PROD | ADD | Chat Composer | T2 | false for `skill-first`/`local-only` even with leftover expert selection; Chat submit consumes this | Composer Expert 默认创建入口 | yes |
| C01 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | PROD | MODIFY | Chat Composer | T2 | reads existing `skillRun.getFeatureMode`; mounts `ExpertContextControl` only when `shouldMountExpertDefaultEntry` | Composer Expert 默认创建入口 | no |
| C02 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleSubmitOrQueue` | PROD | MODIFY | Chat submit owner | T2 | new Expert start only when `shouldSubmitNewExpertStart`; Slash-first and Local Chat unchanged | Chat 新建 Expert 路由 | no |
| C01 | `apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.test.ts` | TEST | ADD | Chat Composer tests | T2 | mount and submit helpers cover AC-01/AC-02 | Composer Expert 默认创建入口 | yes |
| C01 | `apps/work/lat.md/expert-execution.md` | DOC | MODIFY | work lat expert-execution | T2 | document production hide, `expert-compat` restore, Main start gate, retry KEEP | Composer Expert 默认创建入口 | no |
| C01 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | work lat skill-run | T2 | remove “v4.2 Expert entry removal” from current Out; keep P1 Approval/forms/attachments out | Composer Expert 默认创建入口 | no |
| C06 | `docs/work/SKILL-RUN-M5-ROLLBACK.md` | DOC | MODIFY | Work release docs | T3 | production default hides Expert default entry; `expert-compat` restores; `local-only` stops Skill and Expert create; no Expert resubmit | Rollback handbook Expert 入口说明 | no |
| C04 | `apps/work/src/main/expert/expert-run-service.ts#createExpertRunService` | PROD | KEEP | Expert Run Service | - | reader/cancel/rehydrate/retry unchanged | Expert reader / retry / cancel / rehydrate | no |
| C05 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | KEEP | SkillRunService | - | Skill start and no Expert fallback unchanged | Skill Run 与 Local Chat 新提交 | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C03 | MODIFY_EXISTING | all new Expert HTTP goes through `registerExpertIpc` start; `createExpertRunService` is not a Renderer trust boundary | one gate in the existing IPC handler using existing `getSkillRunFeatureMode` and `encodeExpertIpcError`; do not also patch the service and retry |
| C01 | MINIMAL_NEW | Chat.tsx already owns Composer extras but cannot be unit-imported without the full Chat graph; `ExpertContextControl.tsx` must remain for `expert-compat` | one Chat-owned helper file plus conditional mount; do not delete the control or add a mode settings UI |
| C02 | MODIFY_EXISTING | `handleSubmitOrQueue` is the leftover-selection bypass of a hidden control | same helper; do not add a second submit owner |
| C06 | MODIFY_EXISTING | M5 handbook is the operator rollback SOT | extend the mode table; do not create a second handbook |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C03 | `apps/work/src/main/expert/expert-ipc.ts#registerExpertIpc`<br>`apps/work/src/main/expert/expert-ipc-registration.test.ts` | `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`<br>`apps/work/src/shared/expert.ts#encodeExpertIpcError`<br>`apps/work/src/main/expert/expert-run-service.ts#createExpertRunService` | - | no |
| T2 | C01, C02 | `apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.ts#shouldMountExpertDefaultEntry`<br>`apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.ts#shouldSubmitNewExpertStart`<br>`apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`<br>`apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleSubmitOrQueue`<br>`apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.test.ts`<br>`apps/work/lat.md/expert-execution.md`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/preload/skill-run-api.ts#createSkillRunApi`<br>`apps/work/src/renderer/src/modules/expert/ExpertContextControl.tsx` | T1 | no |
| T3 | C06 | `docs/work/SKILL-RUN-M5-ROLLBACK.md` | `apps/work/src/main/expert/expert-ipc.ts#registerExpertIpc`<br>`apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.ts#shouldMountExpertDefaultEntry` | T1, T2 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/expert/expert-ipc.ts` | T1 | start hard gate shares the Expert IPC registration file with keep-as-is retry/cancel/rehydrate handlers |
| `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | T2 | mount and submit routing share the same Composer owner |

## Generated Outputs Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.ts` | `Chat.tsx` cannot be unit-imported without the full Chat graph; the decision must still belong to Chat Composer, not Layout `chatRuns` or ExpertContextControl | stays Chat Composer owner |
| C01 | `apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.test.ts` | `Chat.layout.test.tsx` does not mount Chat or Expert routing | stays Chat Composer test owner |

## Todo T1 — Main expert.start feature-mode gate

**Owns Changes**
- C03

**Goal**

Make Main the trust boundary for new Expert Task creation so Renderer cannot bypass the production default.

**Immediate anchors**
- `apps/work/src/main/expert/expert-ipc.ts#registerExpertIpc`
- `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`

**Changes**
- Extend `registerExpertIpc` options with optional `getFeatureMode` defaulting to `getSkillRunFeatureMode`.
- After `validateRequest` / `assertAuthGeneration` and before `getExpertRunService().start`, if mode is not `expert-compat`, throw `encodeExpertIpcError` with stable `errorCode` `EXPERT_START_DISABLED_FEATURE_MODE` and do not call the service.
- Leave `retry`, `cancel`, `rehydrateSession`, catalog, and health ungated.
- Extend `expert-ipc-registration.test.ts` with start cases for the three modes.

**Stop conditions**
- [ ] V01 PASS
- [ ] non-compat start does not invoke `getExpertRunService().start`
- [ ] `expert-compat` start still invokes start
- [ ] retry/cancel/rehydrate tests still register without a mode check

**Triggered reads**
- If the current `getExpertRunService` mock lacks `start`: add it in this test file only
- Otherwise: do not create `expert-ipc-start.test.ts`

## Todo T2 — Composer Expert default-entry hide and submit routing

**Owns Changes**
- C01
- C02

**Goal**

Stop local-chat Composer from offering or submitting a new Expert Task unless feature mode is `expert-compat`.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleSubmitOrQueue`
- `apps/work/src/preload/skill-run-api.ts#createSkillRunApi`

**Changes**
- Add Chat-owned `shouldMountExpertDefaultEntry` and `shouldSubmitNewExpertStart`.
- Chat reads `window.hermesAPI.skillRun.getFeatureMode` as a display copy; on failure, hide the default entry.
- Mount `ExpertContextControl` only when the mount helper is true; do not delete the control module.
- `handleSubmitOrQueue` must not call `submitExpert` / `expert.start` when the submit helper is false, including leftover `expertSelection`.
- Slash-first and unselected Local Chat send stay as they are.
- Update `lat.md/expert-execution.md` and `lat.md/skill-run.md` so Expert default-entry removal is current behaviour and P1 Approval/forms/attachments stay out.
- English-only strings if a toast is added; do not edit other locale packs.

**Stop conditions**
- [ ] V02 and V03 PASS
- [ ] V05 PASS
- [ ] `lat check` in `apps/work` PASS after lat.md edits
- [ ] `ExpertContextControl.tsx` is not deleted

**Triggered reads**
- If `getFeatureMode` is missing on `hermesAPI.skillRun`: fail-closed hide the entry; do not add a new IPC channel
- Otherwise: do not mount the full Chat tree in unit tests

## Todo T3 — Rollback handbook Expert-entry wording

**Owns Changes**
- C06

**Goal**

Make the existing M5 rollback handbook tell operators that production default no longer creates Expert Tasks from Composer, and how `expert-compat` restores that path.

**Immediate anchors**
- `docs/work/SKILL-RUN-M5-ROLLBACK.md`

**Changes**
- Update the three-mode table: `skill-first` allows Skill create and rejects new Expert start; `expert-compat` restores Composer Expert entry and `expert.start`; `local-only` rejects both.
- Keep dual readers, no deletion of continuation/ManagedFile/transcript, and the ban on resubmitting failed Skill Runs as ExpertTask.
- Do not claim Expert subsystem deletion, Approval, activity, forms, or attachments.

**Stop conditions**
- [ ] V06 PASS
- [ ] V07 PASS (RM-07 status column is not DONE in the implementation tree)

**Triggered reads**
- Use the T1 errorCode name if the handbook mentions it
- Otherwise: do not edit Roadmap status in this Todo

## Verification

Run the Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts | PRD revision request |
