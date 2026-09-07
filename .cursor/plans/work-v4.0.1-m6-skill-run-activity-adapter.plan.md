---
name: M6b Skill Run Activity Adapter
overview: Map v1.2.1 enumerated reasoning/tool/clarify/approval.requested events into sanitized Skill Run activity on the existing parser, projection, and StatusBar. Keep unknown fail-soft and forbid ClarifyCard reuse or Approval decision.
todos:
  - id: t1-parser-enumerated-activity-mapping
    content: "T1 — Parser enumerated activity mapping [C01]"
    status: completed
  - id: t2-projection-bounded-activity
    content: "T2 — Projection bounded activity list [C02]"
    status: completed
  - id: t3-skill-run-readonly-activity-ui
    content: "T3 — Skill-run read-only activity UI [C03]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.4
plan_id: RM-08
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.2/RM-08
grounded_commit: 407ff9ea773ffe0a6f763888842149049ef774a5
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M6b Skill Run Activity Adapter Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6-skill-run-activity-adapter.md)

## Scope

- In: map v1.2.1 enumerated `reasoning.summary` / `tool.call` / `clarify.requested` / `approval.requested` from parser `rawUnknown` into sanitized activity; carry a bounded list on existing `SkillRunProjection`; render read-only items under existing `modules/skill-run`; unknown and control events stay fail-soft; prove no `clarify-respond` and no Approval decision controls.
- Out: Approval decision IPC / allow-deny cards (RM-09); lifting Bundle `approval` / `attachments` from `unsupported`; JSON Schema forms (RM-10); Attachment (RM-11); favorites (RM-12); Expert default-entry work; Local Chat / Dashboard `ClarifyCard` reuse; streaming token delta; editing `contracts/skill-run/v1.2.1`; a new raw-event IPC channel; persisting activity on continuation; teaching MessageList Provider DTOs.
- Production Owner inherited from PRD: Main contract parser owns event → activity. SkillRunService owns projection merge, dedupe, and terminal monotonicity. Renderer `modules/skill-run` owns display. MessageList / `ClarifyCard` / File Platform do not gain Skill Run activity ownership.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent` | exists at `407ff9ea`; `assistant.message` and `artifact.persisted` mapped; four P1 types fall through `default` → `rawUnknown: true` | `export function parseSkillRunEvent` | SSE consumer `createSkillRunService` `#consumeSse` is the only production caller; poll path uses `parseSkillRunStatusToPhase`, not these event types | reuse `inner` payload unwrap already in the function; consume Bundle fixtures as-is; do not add a second parser or compensate missing schema | PASS |
| C02 | `apps/work/src/shared/skill-run.ts#SkillRunProjection` | exists; fields are phase / displayStage / text / artifacts / error; no activity list | `export interface SkillRunProjection` | Preload / IPC already ship this DTO on `onProjectionChanged`; Renderer store upserts it | no second projection store or `skillRun.activity` channel; continuation item stays without activity | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | exists; `!event.rawUnknown` patches phase/text/artifacts; `updateProjection` already blocks nonterminal patch after `terminalConfirmed` | `export function createSkillRunService` | `#consumeSse` calls `parseSkillRunEvent` then `updateProjection`; `seenEventIds` already skip duplicates | append sanitized activity in the existing patch; do not add telemetry fields for summary/question/arguments | PASS |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar` | exists; compact phase / error / artifact retry / cancel; Chat already mounts it in skill-run mode | `export const SkillRunStatusBar` | `Chat.tsx` passes `activeSkillProjection`; tests live in `SkillRunStatusBar.test.tsx` | render activity below the compact row in this module; do not import `ClarifyCard` or create a Skill Chat page | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | fixture 中的 `reasoning.summary`、`tool.call`、`clarify.requested`、`approval.requested` 使 projection 出现对应 sanitized activity item；不再仅以 `rawUnknown` 丢弃。 | BEHAVIOR | C01, C02 | T1, T2 | V01, V02 | UNIT | yes |
| AC-02 | AC | activity item 不含 tool arguments、JWT、URL、absolute path、raw payload object。`tool.call` 只含合同字段 tool_name / call_id / status。 | SECURITY | C01 | T1 | V01 | UNIT | yes |
| AC-03 | AC | `approval.requested` 展示 summary 且无允许/拒绝控件；phase 为 `waiting-approval` 或保持既有非终态，且旧事件不能把终态回退。 | LIFECYCLE | C01, C02, C03 | T2, T3 | V02, V03 | UNIT | yes |
| AC-04 | AC | `clarify.requested` 展示 question；选项若存在则仅为 string；无回答/跳过动作，且测试证明不调用 `clarify-respond` 或 Expert / Skill 未发布 endpoint。 | SECURITY | C01, C03, C06 | T1, T3 | V01, V03, V04 | UNIT | yes |
| AC-05 | AC | 未枚举事件仍 `rawUnknown`，不把 payload 文本化进 transcript 或 activity。 | NEGATIVE | C04 | T1 | V01 | UNIT | yes |
| AC-06 | AC | Local Chat `ClarifyCard` focused tests 无回归。Skill 失败不创建 ExpertTask。不声称 Approval decision 或 Attachment 已启用。 | SCOPE | C05, C06 | T2, T3 | V04, V05, V06 | UNIT | yes |
| AC-07 | AC | Renderer 仍无法取得 raw Provider event。不得新增 Skill Chat 页面或第二 Session/File owner。 | SCOPE | C02, C03 | T2, T3 | V03, V07 | UNIT | yes |
| DOD-01 | DOD | C01–C03 有 parser / projection / presentation focused tests，并覆盖 AC-04 的负向「无 respond IPC」。C04–C06 由既有 unknown / Local Chat / Expert 套件回归。 | EVIDENCE | C01, C02, C03, C04, C05, C06 | T1, T2, T3 | V01, V02, V03, V04, V05 | UNIT | yes |
| DOD-02 | DOD | RM-08 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。 | OPERATIONS | C03 | T3 | V06 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要 decision/respond endpoint、改 Bundle、`ClarifyCard` 复用、表单或 Expert 入口删除的工作，必须返回对应 Roadmap Item，不得混入本 Item。 | SCOPE | C03 | T3 | V06, V07 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Enumerated activity append | AC-01, AC-02, AC-05 | SSE block parsed by `parseSkillRunEvent` | run not terminalConfirmed | `createSkillRunService` `#consumeSse` appends sanitized activity via `updateProjection` when `rawUnknown` is absent | incomplete/illegal payload stays `rawUnknown`; cursor still advances through existing `seenEventIds`; unknown never writes activity or transcript text | V01, V02 |
| Approval requested wait | AC-03 | `approval.requested` mapped | nonterminal running or waiting-approval | same `updateProjection` may set `waiting-approval` and append read-only activity | if `terminalConfirmed`, existing guard drops nonterminal phase patch; activity must not rewind succeeded/failed/cancelled | V02 |
| Clarify requested display | AC-04 | `clarify.requested` mapped | nonterminal | activity item with question + string options only | no respond/skip writer exists; missing question → `rawUnknown` | V01, V03, V04 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Enumerated activity | AC-01, AC-02, AC-04 | `parseSkillRunEvent` from v1.2.1 fixtures / SSE JSON | existing Skill Run SSE + `ParsedSkillRunEvent.activity` then existing `SkillRunProjection` IPC | `createSkillRunService` merge; `SkillRunStatusBar` display copy | reasoning: `summary`; tool: `tool_name`, `call_id`, `status` in started/completed/failed; clarify: `question`, optional string `options`; approval: `approval_id`, `summary` | parser copies only `$defs` fields; options coerced to displayable strings with a cap; extra keys including `arguments` dropped | missing required string → `rawUnknown`; non-string options dropped not stringified; unknown/control stay `rawUnknown` | SSE `event_id` / `seenEventIds`; activity dedupe by `event_id`; `approval_id` display/dedupe only | V01, V02, V03 |
| Compact phase (KEEP) | AC-03, AC-07 | existing phase mapping | existing projection `phase` / `displayStage` | existing StatusBar compact row | existing phase fields | existing `updateProjection` terminal monotonicity | late approval cannot rewind terminal | existing `clientRequestId` | V02, V03 |
| Forbidden respond / decision | AC-04, AC-06, AC-07 | none | no new IPC | none | none | Plan forbids `clarify-respond`, `respondClarify`, allow/deny, and Bundle edits | tests assert absence | None | V03, V04, V07 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-contract-parser.test.ts --pool=threads --maxWorkers=1', shell=True))"` | four Bundle fixtures map to sanitized activity and are not `rawUnknown`; `tool.call` with extra `arguments` does not copy them; non-string clarify options are dropped; unknown/control events stay `rawUnknown` without payload text | do not invent schema for missing fields | LOCAL_TRANSIENT | local apps/work | yes |
| V02 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | SSE of the four event types appears on `SkillRunProjection.activities`; `approval.requested` can set `waiting-approval`; a later approval event does not rewind a succeeded run; activity list is bounded; Skill start in `skill-first` still works and failure does not start Expert | no new IPC channel name | LOCAL_TRANSIENT | local apps/work | yes |
| V03 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | StatusBar still shows compact phase; activity kinds render read-only; no Approve/Deny/Skip/Respond controls; source does not import ClarifyCard or contain `clarify-respond` / `respondClarify` | compact cancel and artifact retry KEEP | LOCAL_TRANSIENT | local apps/work | yes |
| V04 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/screens/Chat/ClarifyCard.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | Local Chat ClarifyCard tests still pass | Skill Run module is not this file | LOCAL_TRANSIENT | local apps/work | yes |
| V05 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/expert/expert-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | Expert run service regression still passes | Skill failure must not create ExpertTask in this Item | LOCAL_TRANSIENT | local apps/work | yes |
| V06 | DOCUMENT | `python -c "from pathlib import Path; import sys; r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); lat=Path('apps/work/lat.md/skill-run.md').read_text(encoding='utf-8'); p=chr(124); row=next(x for x in r.splitlines() if x.startswith(p+' RM-08 ')); ok=(row.split(p)[4].strip()!='DONE' and 'Approval' in lat and 'activity' in lat.lower()); sys.exit(0 if ok else 1)"` | implementation tree keeps RM-08 not DONE; lat.md documents activity mapping and still treats Approval decision / forms / attachments as out | implementation commit must not mark RM-08 DONE | LOCAL_TRANSIENT | local repo | yes |
| V07 | DOCUMENT | `python -c "from pathlib import Path; import sys; files=['apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx','apps/work/src/shared/skill-run.ts','apps/work/src/main/skill-run/skill-run-ipc.ts']; blob=''.join(Path(f).read_text(encoding='utf-8') for f in files); ok=('SKILL_RUN_IPC_CHANNELS' in Path('apps/work/src/shared/skill-run.ts').read_text(encoding='utf-8') and 'clarify-respond' not in blob and 'respondClarify' not in blob and 'ClarifyCard' not in Path('apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx').read_text(encoding='utf-8')); sys.exit(0 if ok else 1)"` | no new Skill Run IPC channel; skill-run presentation does not import ClarifyCard or call Hermes clarify IPC | Chat.tsx remains the StatusBar mounter only | LOCAL_TRANSIENT | local repo | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M6-skill-run-activity-adapter.md`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/shared/skill-run.ts#SkillRunProjection`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar`
- `contracts/skill-run/v1.2.1/events/run-event.schema.json`
- `contracts/skill-run/v1.2.1/fixtures/run-event-reasoning-summary.json`
- `contracts/skill-run/v1.2.1/fixtures/run-event-tool-call.json`
- `contracts/skill-run/v1.2.1/fixtures/run-event-clarify-requested.json`
- `contracts/skill-run/v1.2.1/fixtures/run-event-approval-requested.json`

## Triggered Read

- If `parseSkillRunEvent` tests cannot import Bundle fixtures by path: load them with `fs` from `contracts/skill-run/v1.2.1/fixtures/`, do not copy rewritten fixtures into apps/work
- If SSE test harness in `skill-run-service.test.ts` cannot emit multiple events before `run.completed`: extend that mock reader only
- If StatusBar cannot render a list without replacing the compact row: add a sibling element in the same component, do not create a new Chat page
- If `getFeatureMode` or Expert entry code appears necessary: stop; that is RM-07 KEEP, not this Item
- Do not read Provider source, do not edit the Bundle, do not gate `expert.retry`

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent` | PROD | MODIFY | Skill Run contract parser | T1 | four enumerated types return sanitized `activity` without `rawUnknown`; illegal/incomplete payloads stay `rawUnknown`; `options` string-only with a cap; never copy `arguments` | Parser 对 v1.2.1 已枚举 activity 事件 | no |
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.test.ts` | TEST | MODIFY | Skill Run parser tests | T1 | fixture mapping + secret/options/unknown negatives | Parser 对 v1.2.1 已枚举 activity 事件 | no |
| C02 | `apps/work/src/shared/skill-run.ts#SkillRunProjection` | PROD | MODIFY | Skill Run DTO | T2 | optional bounded `activities` of Work activity items, not Provider event objects | Projection 携带 bounded activity | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | SkillRunService | T2 | merge parser activity into projection; `approval.requested` may set `waiting-approval`; terminal monotonicity KEEP; no new IPC | Projection 携带 bounded activity | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | SkillRunService tests | T2 | SSE activity on projection; no terminal rewind; start/Expert-fallback regression | Projection 携带 bounded activity | no |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar` | PROD | MODIFY | modules/skill-run | T3 | compact phase KEEP; read-only activity list; no allow/deny/respond controls; English-only new strings | modules/skill-run 只读 activity UI | no |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx` | TEST | MODIFY | modules/skill-run tests | T3 | render activity; assert no decision/respond UI or ClarifyCard import | modules/skill-run 只读 activity UI | no |
| C03 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | work lat skill-run | T3 | document enumerated activity mapping; keep Approval/forms/attachments out | modules/skill-run 只读 activity UI | no |
| C04 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent` | PROD | KEEP | Skill Run contract parser | - | unenumerated and non-P0 `run.` control events remain `rawUnknown` | Unknown event fail-soft | no |
| C05 | `contracts/skill-run/v1.2.1/capabilities/unsupported.schema.json` | PROD | KEEP | Provider Bundle | - | `approval` stays unsupported; no decision endpoint | Approval decision 与 clarify respond | no |
| C06 | `apps/work/src/renderer/src/screens/Chat/ClarifyCard.tsx` | PROD | KEEP | Local Chat clarify | - | Hermes clarify path unchanged; Skill Run must not call it | Local Chat clarify 路径 | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `parseSkillRunEvent` default is why the four types are invisible; it is the single adaptation owner | add four switch cases and field copies; do not create a second mapper or edit the Bundle |
| C02 | MODIFY_EXISTING | `SkillRunProjection` already crosses IPC; `updateProjection` already owns merge and terminal monotonicity | optional `activities` on the existing DTO plus append in `#consumeSse`; do not add `skillRun.activity` or continuation persistence |
| C03 | MODIFY_EXISTING | Chat already mounts `SkillRunStatusBar` with the live projection | render read-only items under the compact row; do not add a file, Chat page, or MessageList adapter |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.test.ts` | `contracts/skill-run/v1.2.1/events/run-event.schema.json`<br>`contracts/skill-run/v1.2.1/fixtures/run-event-reasoning-summary.json`<br>`contracts/skill-run/v1.2.1/fixtures/run-event-tool-call.json`<br>`contracts/skill-run/v1.2.1/fixtures/run-event-clarify-requested.json`<br>`contracts/skill-run/v1.2.1/fixtures/run-event-approval-requested.json` | - | no |
| T2 | C02 | `apps/work/src/shared/skill-run.ts#SkillRunProjection`<br>`apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts` | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent` | T1 | no |
| T3 | C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/shared/skill-run.ts#SkillRunProjection`<br>`apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | T1, T2 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/skill-run/skill-run-contract-parser.ts` | T1 | new cases share the switch with KEEP unknown `default` and P0 phase mappings |
| `apps/work/src/main/skill-run/skill-run-service.ts` | T2 | activity merge shares `updateProjection` with terminal monotonicity and artifact patches |
| `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | T3 | activity list shares the compact phase / cancel / artifact-retry component |

## Generated Outputs Ledger

None

## Todo T1 — Parser enumerated activity mapping

**Owns Changes**
- C01

**Goal**

Turn the four v1.2.1 enumerated activity events into sanitized parser output so SkillRunService can stop treating them as `rawUnknown`.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent`
- `contracts/skill-run/v1.2.1/fixtures/run-event-reasoning-summary.json`

**Changes**
- Extend `ParsedSkillRunEvent` with an optional sanitized `activity` object owned by this parser (not a Provider event clone).
- Map `reasoning.summary` → kind + `summary` string.
- Map `tool.call` → kind + `tool_name` + `call_id` + `status` (`started` / `completed` / `failed` only). Drop any other payload keys including `arguments`.
- Map `clarify.requested` → kind + `question`. Keep at most 8 `options` that are non-empty strings; drop objects, numbers, and extra entries. Do not JSON-stringify them.
- Map `approval.requested` → kind + `approval_id` + `summary`, and set `phase` to `waiting-approval`.
- Missing required strings, illegal tool status, or non-object payload → keep `rawUnknown: true` and no activity.
- Cap copied strings enough to avoid dumping huge blobs; never copy URLs as dedicated fields.
- Load the four Bundle fixtures in `skill-run-contract-parser.test.ts`. Also cover extra `arguments`, non-string options, and an unenumerated event that stays `rawUnknown` without textifying payload.
- Do not edit `contracts/skill-run/v1.2.1`. Do not map `run.waiting_approval` twice; the existing control case stays.

**Stop conditions**
- [ ] V01 PASS
- [ ] four fixtures are not `rawUnknown`
- [ ] unknown/control path still `rawUnknown`

**Triggered reads**
- If fixture `event_type` does not reach the switch because the test passes the inner payload only: pass the full fixture object as `payload` and `event_type` as `eventType`, matching current `parseSkillRunEvent` unwrap
- Otherwise: do not add `skill-run-activity-parser.ts`

## Todo T2 — Projection bounded activity list

**Owns Changes**
- C02

**Goal**

Carry parser activity on the existing projection over the existing subscribe path, with terminal monotonicity preserved.

**Immediate anchors**
- `apps/work/src/shared/skill-run.ts#SkillRunProjection`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`

**Changes**
- Add a Work-owned activity item type and optional `activities` array on `SkillRunProjection`. Items are not raw Provider events.
- In `#consumeSse`, when parsed activity exists, append it to a bounded list (cap 32) keyed/deduped by `event_id`. Do not update continuation schema.
- If parsed `phase` is `waiting-approval` and the run is not terminal, patch phase; existing `updateProjection` already ignores nonterminal phase after `terminalConfirmed`.
- Do not add IPC channels, telemetry of summary/question/arguments, or Expert fallback.
- Extend `skill-run-service.test.ts` with an SSE sequence of the four fixtures plus `run.completed`, and a case where a succeeded run ignores a later approval phase rewind. Keep existing `skill-first` start coverage.

**Stop conditions**
- [ ] V02 PASS
- [ ] V05 PASS
- [ ] no new key under `SKILL_RUN_IPC_CHANNELS`

**Triggered reads**
- If the current SSE mock only emits `run.completed`: extend that reader to yield activity events first
- Otherwise: do not add `skill-run-activity-service.ts`

## Todo T3 — Skill-run read-only activity UI

**Owns Changes**
- C03

**Goal**

Show sanitized activity next to the existing compact StatusBar without creating a second Chat or reuse of Local Chat clarify.

**Immediate anchors**
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar`
- `apps/work/lat.md/skill-run.md`

**Changes**
- Render `projection.activities` as read-only text under the compact phase row. Keep cancel and artifact retry.
- `approval.requested` shows summary only. `clarify.requested` shows question and string options only. No Approve, Deny, Skip, Send, or respond controls.
- English-only new `t(...)` fallbacks; do not edit other locale packs.
- Do not import `ClarifyCard`, `MessageList`, or `respondClarify`. Chat.tsx already mounts StatusBar; do not add a Skill Chat route.
- Update `SkillRunStatusBar.test.tsx` for the four kinds and the negative control/import assertions.
- Update `lat.md/skill-run.md`: activity mapping is current behaviour; Approval decision, JSON Schema forms, and attachment upload stay out. Run `lat check` in `apps/work`.
- Do not mark Roadmap RM-08 DONE.

**Stop conditions**
- [ ] V03, V04, V06, V07 PASS
- [ ] `lat check` in `apps/work` PASS after lat.md edits
- [ ] `ClarifyCard.tsx` is not modified

**Triggered reads**
- If Chat stopped mounting StatusBar: restore the mount in Chat only as the existing owner, do not add a new page
- Otherwise: do not write `Chat.tsx` except that trigger

## Verification

Run the Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts | PRD revision request |
