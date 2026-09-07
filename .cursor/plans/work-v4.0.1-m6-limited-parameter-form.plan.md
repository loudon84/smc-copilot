---
name: M6d Limited Parameter Form
overview: Lift the P0 fail-closed extra-required string subset into a callable limited-parameter-form on the existing classifier, bind, start IPC, Catalog, and Chat. Keep $ref/composite/non-string/form-without-extra closed. Do not add a JSON Schema engine or a new IPC channel.
todos:
  - id: t1-classifier-bind-dto-and-start-ipc
    content: "T1 — Classifier bind DTO and start IPC [C01, C02, C03]"
    status: completed
  - id: t2-catalog-chat-extra-string-collector
    content: "T2 — Catalog Chat extra-string collector [C04]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.4
plan_id: RM-10
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-10
grounded_commit: c58fe7c4c0fdf965674395c68bfcec9b83f09873
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M6d Limited Parameter Form Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6-limited-parameter-form.md)

## Scope

- In: extend the existing invocation classifier so extra required string scalars (1–8, besides `promptField`) become callable `limited-parameter-form`; project those field descriptors on the Catalog DTO; extend existing `bindPromptFirstTool` / start IPC / `SkillRunService.start` so Main copies only whitelisted extra strings into `tools/call`; let existing Catalog/Chat Skill UI select the subset, collect the strings, and snapshot them on the Chat queue.
- Out: Approval decision (RM-09); Attachment (RM-11); favorites (RM-12); `$ref` / oneOf/anyOf/allOf / non-object root; required number/boolean/object/array/file; collecting optional extra fields; a generic JSON Schema widget library; promoting form-with-no-extra-required to prompt-first; a new Skill Chat page or second Session/File/Catalog owner; a new start channel name; edits to `contracts/skill-run/v1.2.1`; Expert / Local Chat contract changes.
- Production Owner inherited from PRD: Main contract parser owns classify + bind. SkillRunService owns start / pending-submit / `tools/call`. Shared Skill Run DTO owns start payload and extra-field descriptors. Renderer `modules/skill-run` owns Catalog selection and extra string inputs. Existing Chat owns Skill submit / queue snapshot forwarding and must not walk `inputSchema`.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#classifySkillInvocation` | exists at `c58fe7c4`; `interactionMode === "form"` returns `form-required` before schema checks; chat extra `required` besides `promptField` returns `parameters-required` / `unsupported`; `$ref` / non-object / composite already `unsupported-schema` | `export function classifySkillInvocation` | `mapPublicSkillCatalogTools` and `bindPromptFirstTool` are the production callers; Catalog Panel and Chat currently key off `invocationMode === "prompt-first"` | reuse existing object-root / promptField string gates; freeze new mode `limited-parameter-form`; do not add a second parser or JSON Schema library | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#bindPromptFirstTool` | exists; only `prompt-first` binds `{ [promptField]: prompt }`; extra required returns `SKILL_PARAMETERS_REQUIRED`. `validateStartInput` keeps only `toolName`/`prompt`/ids. `createSkillRunService` `start` passes those two bind args | `export function bindPromptFirstTool`; `function validateStartInput`; `export function createSkillRunService` | IPC START handler is the only production caller of `start`; preload `skillRun.start` already forwards `SkillRunStartInput` | add optional `extraParameters` on existing `SkillRunStartInput` and START channel; Main whitelist from classification; keep `SKILL_RUN_IPC_CHANNELS.START`; rewrite the service test that currently rejects `prompt`+`region` strings | PASS |
| C03 | `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem` | exists; projects `invocationMode` / `callability` / read-only `inputSchema`; no extra-field list. `mapPublicSkillCatalogTools` copies classifier `promptField`/`callability`/`invocationMode` | `export interface SkillCatalogToolItem`; `export type SkillInvocationMode`; `export function mapPublicSkillCatalogTools` | Catalog IPC already ships `SkillCatalogToolItem[]`; Renderer must not build arguments from `inputSchema` (comment already says so) | add bounded `extraStringFields` from classifier; extend `SkillInvocationMode` with `limited-parameter-form`; do not make Renderer the schema walker | PASS |
| C04 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel` | exists; cards and keyboard Enter only when `invocationMode === "prompt-first"`. `SkillSelectionBar` marks anything else unavailable. `Chat` submit and `QueuedMessage.skillRequest` only send `toolName`/`prompt`/`clientRequestId` | `export const SkillCatalogPanel`; `export const SkillSelectionBar`; `function Chat` | Chat already mounts Catalog/SelectionBar and calls `hermesAPI.skillRun.start`; queue drain already uses the snapshot | select `callability === "callable"`; collect extra strings in SelectionBar; snapshot `extraParameters` on the existing queue item; English-only i18n; no new page or form package | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Catalog 中满足受限子集的工具：callability 为可调用；用户可选中；Composer 展示 Main 投影的额外必填 string 字段；全部非空且 prompt 非空后，现有 skillRun.start 被接受，tools/call arguments 含 promptField 与这些 extra key，且仅含这些 key。 | BEHAVIOR | C01, C02, C03, C04 | T1, T2 | V01, V03, V04, V05 | UNIT | yes |
| AC-02 | AC | 同类工具若额外必填含非 string、或超过 8 个 extra required、或 schema 含 $ref/组合类型：仍 unsupported，卡片不可选，start 返回既有 fail-closed 错误族（form/parameters/unsupported-schema），不猜字段。 | NEGATIVE | C01, C05 | T1 | V01, V03 | UNIT | yes |
| AC-03 | AC | interactionMode=form 且无额外必填：仍 form-required / 不可选 / 不可 start；不升为 prompt-first。 | NEGATIVE | C01, C05 | T1 | V01, V04 | UNIT | yes |
| AC-04 | AC | prompt-first 工具回归：不出现 extra 字段收集器；arguments 仍只有 promptField；既有 Catalog/Chat/bind 测试语义不变。 | BEHAVIOR | C01, C02, C04, C05 | T1, T2 | V01, V03, V04, V05 | UNIT | yes |
| AC-05 | AC | Renderer 传入未知 extra key、非 string、或缺少某个投影必填 key：Main 拒绝 start，不把这些值转发 Gateway。 | SECURITY | C02 | T1 | V02, V03 | UNIT | yes |
| AC-06 | AC | Chat 在已有 active run 时排队：queue snapshot 包含当时的 extra string 值；出队使用 snapshot，不重读之后改过的字段。 | LIFECYCLE | C04 | T2 | V06 | UNIT | yes |
| AC-07 | AC | 不新增 Skill Chat 页面、第二 Catalog/Session/File owner、Approval decision IPC、Attachment upload，或 Bundle 修改。Local Chat / Expert 回归不因本 Item 改变默认入口或 clarify 合同。 | SCOPE | C06, C07 | T2 | V07, V08 | UNIT | yes |
| DOD-01 | DOD | C01–C04 有 classifier / bind / IPC / Catalog-or-composer focused tests，并覆盖 AC-02/AC-03/AC-05 负向。C05–C07 由既有 prompt-first、unsupported-schema、Expert/Local Chat 套件回归。 | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2 | V01, V02, V03, V04, V05, V07 | UNIT | yes |
| DOD-02 | DOD | RM-10 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 DONE。implementation commit 不得包含该 status 更新。 | OPERATIONS | C04 | T2 | V08 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要 $ref 解析、非 string 控件、通用 form 引擎、Approval、Attachment 或改 Bundle 的工作，必须返回对应 Roadmap Item / Provider，不得混入本 Item。 | SCOPE | C05, C06, C07 | T1, T2 | V08 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Limited-parameter start | AC-01, AC-04, AC-05 | existing `skillRun.start` after Catalog revalidation | `pending-submit` then existing run phases | `createSkillRunService` `start` binds whitelist arguments then existing persist-before-`callSkill` | missing/unknown/non-string extra values or non-subset classification reject start before HTTP; existing `START_DISABLED_*` / `RUN_ALREADY_ACTIVE` KEEP | V02, V03 |
| Skill queue snapshot | AC-06 | Chat Skill submit while `chatBusy` | queued local item, no second start | Chat enqueue writes `skillRequest` including `extraParameters`; drain calls `submitSkill` with that object | remove-queued still cancels via existing `skillRun.cancel`; later SelectionBar edits must not mutate the queued object | V06 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Extra-field catalog projection | AC-01, AC-03, AC-04 | `classifySkillInvocation` then `mapPublicSkillCatalogTools` | existing Catalog IPC DTO `SkillCatalogToolItem.extraStringFields` | `SkillCatalogPanel` / `SkillSelectionBar` / Chat | `name`; optional display `title` if property `title` is a non-empty string; order follows extra `required` | Main classifier; cap 8; Renderer must not invent keys from `inputSchema` | non-subset stays `form-required` / `parameters-required` / `unsupported-schema` with `callability` unsupported | existing auth-scoped Catalog cache | V01, V04 |
| Extra string start bind | AC-01, AC-05 | Chat `SkillRunStartInput.extraParameters` | existing `SKILL_RUN_IPC_CHANNELS.START`; optional bounded `Record<string, string>` | `validateStartInput` then `bindPromptFirstTool` then `gateway.callSkill` arguments | prompt + every projected extra required name; values non-empty strings | IPC length/count/type then Main whitelist against current Catalog classification | unknown key / non-string / blank / over-cap → reject start, no Gateway call | existing `clientRequestId` / idempotency key | V02, V03 |
| Queue extra snapshot | AC-06 | Chat enqueue | in-memory `QueuedMessage.skillRequest` | Chat drain `submitSkill` | same extra map captured at enqueue | Chat must not reread SelectionBar on dequeue | existing busy/queue behaviour | `clientRequestId` on the snapshot | V06 |
| Forbidden form engine / new channel / Bundle | AC-07, DOD-03 | none | none | none | none | Plan forbids new IPC names, `$ref` loaders, and Bundle edits | tests and source grep assert absence | None | V08 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-contract-parser.test.ts --pool=threads --maxWorkers=1', shell=True))"` | chat/form + 1–8 extra required string properties classify as `limited-parameter-form` / `callable` with `extraStringFields`; bind copies prompt + those keys only; titles used when schema `title` is a string | form with no extra required stays `form-required`; non-string extra required / 9 extras / `$ref` / composite stay unsupported; prompt-first bind unchanged; unknown bind keys fail | LOCAL_TRANSIENT | local apps/work | yes |
| V02 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-ipc.test.ts --pool=threads --maxWorkers=1', shell=True))"` | START accepts bounded string `extraParameters` and forwards them; existing required-field and auth-generation checks still pass | non-string values, extra keys beyond 8, over-long key/value, or a non-object map are rejected; `SKILL_RUN_IPC_CHANNELS` key set is unchanged | LOCAL_TRANSIENT | local apps/work | yes |
| V03 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | start of a subset tool with extra strings reaches `callSkill` with `{promptField, extra...}` only; prompt-first `query` bind regression still passes | missing extra / unknown extra / form-without-extra / non-string extra required do not call Gateway; Skill failure still does not start Expert | LOCAL_TRANSIENT | local apps/work | yes |
| V04 | UNIT | `python -c "import subprocess,sys; cmds=['npm --prefix apps/work exec -- vitest run src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx --pool=threads --maxWorkers=1','npm --prefix apps/work exec -- vitest run src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx --pool=threads --maxWorkers=1']; sys.exit(0 if all(subprocess.call(c,shell=True)==0 for c in cmds) else 1)"` | `limited-parameter-form` cards are selectable; SelectionBar shows extra string inputs from `extraStringFields` and does not show the prompt-first-unavailable label; prompt-first has no extra inputs | `form-required` / `parameters-required` / `unsupported-schema` cards stay disabled; keyboard Enter still cannot select them | LOCAL_TRANSIENT | local apps/work | yes |
| V05 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/screens/Chat/skillSelectionRestore.test.ts --pool=threads --maxWorkers=1', shell=True))"` | restored catalog tools keep callability from Catalog; helper covering Skill submit/queue snapshot includes `extraParameters` captured at enqueue | prompt-first snapshot omits extra keys; missing catalog entry still `CONTRACT_MISMATCH` | LOCAL_TRANSIENT | local apps/work | yes |
| V06 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/screens/Chat/skillSelectionRestore.test.ts --pool=threads --maxWorkers=1', shell=True))"` | queue snapshot object is immutable relative to later extra-field edits (helper copies values at enqueue) | dequeue must not reread live SelectionBar state | LOCAL_TRANSIENT | local apps/work | yes |
| V07 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/expert/expert-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | Expert run service regression still passes | this Item must not create ExpertTask on Skill failure | LOCAL_TRANSIENT | local apps/work | yes |
| V08 | DOCUMENT | `python -c "from pathlib import Path; import sys; r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); lat=Path('apps/work/lat.md/skill-run.md').read_text(encoding='utf-8'); ch=Path('apps/work/src/shared/skill-run.ts').read_text(encoding='utf-8'); p=chr(124); row=next(x for x in r.splitlines() if x.startswith(p+' RM-10 ')); keys='LIST_CATALOG REFRESH_CATALOG START CANCEL GET_FEATURE_MODE GET_PROJECTION LIST_PROJECTIONS REHYDRATE_SESSION RETRY_ARTIFACT_DISCOVERY GET_SESSION_MODE SET_SESSION_MODE ON_PROJECTION_CHANGED'.split(); ok=(row.split(p)[4].strip()!='DONE' and 'limited-parameter-form' in lat and 'Approval' in lat and 'Attachment' in lat and all(k in ch for k in keys) and 'skill-run:form' not in ch); sys.exit(0 if ok else 1)"` | implementation tree keeps RM-10 not DONE; lat.md documents the string subset and still treats Approval / Attachment / unrestricted schema as out; IPC channel object has no new name | implementation commit must not mark RM-10 DONE or edit `contracts/skill-run/v1.2.1` | LOCAL_TRANSIENT | local repo | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M6-limited-parameter-form.md`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#classifySkillInvocation`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#bindPromptFirstTool`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#mapPublicSkillCatalogTools`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#validateStartInput`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem`
- `apps/work/src/shared/skill-run.ts#SkillRunStartInput`
- `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel`
- `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx#SkillSelectionBar`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`

## Triggered Read

- If extending `SkillRunStartInput` fails preload compile: read `apps/work/src/preload/skill-run-api.ts` and pass the extra field through the existing START invoke only
- If Chat cannot be mounted for queue tests: export a snapshot helper next to existing `resolveRestoredSkillSelection` and test it in `skillSelectionRestore.test.ts`; do not create a Skill Chat page
- If extra string inputs do not fit `SkillSelectionBar`: add markup in that same component, not a new module file or JSON Schema renderer
- If `createSkillRunService` telemetry would log extra values: keep the M5 allow-list; do not add extra field text
- If enabling form-with-only-prompt looks like a one-line classifier change: stop; that is out of this Item
- Do not read Provider source, do not edit the Bundle, do not add Approval/Attachment IPC

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#classifySkillInvocation` | PROD | MODIFY | Skill Run contract parser | T1 | extra required string scalars 1–8 (chat or form) become `limited-parameter-form` / `callable` with `extraStringFields`; form with no extra required stays `form-required`; `$ref`/composite/non-string extra stay fail-closed | Classifier 识别受限额外必填 string 子集 | no |
| C01 | `apps/work/src/shared/skill-run.ts#SkillInvocationMode` | PROD | MODIFY | Skill Run DTO | T1 | union adds `limited-parameter-form`; do not reuse `parameters-required` as callable | Classifier 识别受限额外必填 string 子集 | no |
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.test.ts` | TEST | MODIFY | Skill Run parser tests | T1 | subset / form-without-extra / over-cap / non-string / `$ref` / prompt-first matrix | Classifier 识别受限额外必填 string 子集 | no |
| C02 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#bindPromptFirstTool` | PROD | MODIFY | Skill Run contract parser | T1 | bind `prompt-first` and `limited-parameter-form`; arguments = promptField + whitelist extras; unknown/missing/non-string extra fail-closed; prompt-first rejects extra keys | Bind + start 白名单 extra strings | no |
| C02 | `apps/work/src/shared/skill-run.ts#SkillRunStartInput` | PROD | MODIFY | Skill Run DTO | T1 | optional `extraParameters?: Record<string, string>` | Bind + start 白名单 extra strings | no |
| C02 | `apps/work/src/main/skill-run/skill-run-ipc.ts#validateStartInput` | PROD | MODIFY | Skill Run IPC | T1 | sanitize extra map: at most 8 keys, string key/value, key length ≤ 256, value length ≤ 32000; omit or empty object when absent | Bind + start 白名单 extra strings | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | SkillRunService | T1 | pass `extraParameters` into bind; `tools/call` uses bind arguments; no new channel; telemetry still must not log extra values | Bind + start 白名单 extra strings | no |
| C02 | `apps/work/src/main/skill-run/skill-run-ipc.test.ts` | TEST | MODIFY | Skill Run IPC tests | T1 | extra map accept/reject; channel key set unchanged | Bind + start 白名单 extra strings | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | SkillRunService tests | T1 | subset start includes extras; rewrite the current `prompt`+`region` reject test; keep prompt-first and non-subset rejects | Bind + start 白名单 extra strings | no |
| C02 | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` | TEST | MODIFY | Skill Run fixture e2e | T1 | `writer.extra` string subset is `limited-parameter-form`; start without extras still rejected; start with extras may call tools | Bind + start 白名单 extra strings | no |
| C03 | `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem` | PROD | MODIFY | Skill Run DTO | T1 | optional `extraStringFields: { name: string; title?: string }[]` | Catalog 投影 extra-field descriptors | no |
| C03 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#mapPublicSkillCatalogTools` | PROD | MODIFY | Skill Run contract parser | T1 | copy classifier extra-field list onto catalog items; `inputSchema` stays read-only and is not an execution source | Catalog 投影 extra-field descriptors | no |
| C04 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel` | PROD | MODIFY | modules/skill-run | T2 | selectable when `callability === "callable"` | Catalog 选择 + Skill UI 收集 extra strings + queue snapshot | no |
| C04 | `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx#SkillSelectionBar` | PROD | MODIFY | modules/skill-run | T2 | extra string inputs from `extraStringFields`; unavailable label only for non-callable | Catalog 选择 + Skill UI 收集 extra strings + queue snapshot | no |
| C04 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | PROD | MODIFY | Chat Skill submit | T2 | allow start for callable subset; require extras filled; pass `extraParameters`; queue snapshot copies them | Catalog 选择 + Skill UI 收集 extra strings + queue snapshot | no |
| C04 | `apps/work/src/shared/i18n/locales/en/skillRun.ts` | PROD | MODIFY | Work i18n English | T2 | English-only strings for extra-parameter labels / missing-field toast | Catalog 选择 + Skill UI 收集 extra strings + queue snapshot | no |
| C04 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx` | TEST | MODIFY | modules/skill-run tests | T2 | subset selectable; remaining fail-closed disabled | Catalog 选择 + Skill UI 收集 extra strings + queue snapshot | no |
| C04 | `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx` | TEST | MODIFY | modules/skill-run tests | T2 | extra inputs present; prompt-first has none | Catalog 选择 + Skill UI 收集 extra strings + queue snapshot | no |
| C04 | `apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts` | TEST | MODIFY | Chat Skill tests | T2 | submit/queue snapshot helper covers extraParameters copy-on-enqueue | Catalog 选择 + Skill UI 收集 extra strings + queue snapshot | no |
| C04 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | work lat skill-run | T2 | document `limited-parameter-form` subset; keep Approval / Attachment / unrestricted schema out | Catalog 选择 + Skill UI 收集 extra strings + queue snapshot | no |
| C05 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#classifySkillInvocation` | PROD | KEEP | Skill Run contract parser | - | prompt-first unchanged; `$ref`/composite/non-string extra / form-without-extra remain unsupported | prompt-first 与其余 fail-closed | no |
| C06 | `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS` | PROD | KEEP | Skill Run DTO | - | START remains the only execution channel; Gateway `tools/call` unchanged | Gateway tools/call、lock、feature mode | no |
| C07 | `contracts/skill-run/v1.2.1/capabilities/unsupported.schema.json` | PROD | KEEP | Provider Bundle | - | `approval` / `attachments` stay unsupported; no Bundle edit | Approval / Attachment / Expert / Bundle | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `classifySkillInvocation` is why extra required and all form tools are unselectable; it is already the shared Catalog/start owner | lift the string subset in that function; do not add a schema engine or a second classifier |
| C02 | MODIFY_EXISTING | `bindPromptFirstTool` plus `validateStartInput` are the trust boundary before `callSkill` | extend the existing bind/start payload; do not add `skillRun.form` IPC |
| C03 | MODIFY_EXISTING | Catalog DTO already crosses IPC and already forbids Renderer-built arguments from `inputSchema` | project an explicit extra-field list from the classifier; do not let the UI walk schema |
| C04 | MODIFY_EXISTING | Catalog Panel, SelectionBar, and Chat Skill submit already own selection and start/queue | collect named string inputs on SelectionBar and snapshot them on the existing queue; do not add a page or form package |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01, C02, C03 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#classifySkillInvocation`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts#bindPromptFirstTool`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts#mapPublicSkillCatalogTools`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.test.ts`<br>`apps/work/src/shared/skill-run.ts#SkillInvocationMode`<br>`apps/work/src/shared/skill-run.ts#SkillCatalogToolItem`<br>`apps/work/src/shared/skill-run.ts#SkillRunStartInput`<br>`apps/work/src/main/skill-run/skill-run-ipc.ts#validateStartInput`<br>`apps/work/src/main/skill-run/skill-run-ipc.test.ts`<br>`apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts`<br>`apps/work/src/main/skill-run/skill-run-e2e.test.ts` | `contracts/skill-run/v1.2.1/mcp/tools-list.response.schema.json` | - | no |
| T2 | C04 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel`<br>`apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx#SkillSelectionBar`<br>`apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`<br>`apps/work/src/shared/i18n/locales/en/skillRun.ts`<br>`apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.test.tsx`<br>`apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx`<br>`apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/shared/skill-run.ts#SkillCatalogToolItem`<br>`apps/work/src/shared/skill-run.ts#SkillRunStartInput`<br>`apps/work/src/shared/skill-run.ts#SkillInvocationMode` | T1 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/skill-run/skill-run-contract-parser.ts` | T1 | classify, bind, and catalog mapping share one file with KEEP fail-closed branches |
| `apps/work/src/shared/skill-run.ts` | T1 | invocation mode, catalog extra-field list, and start payload share one DTO file |
| `apps/work/src/main/skill-run/skill-run-ipc.ts` | T1 | extra map sanitization shares START validation with existing length/auth checks |
| `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | T2 | Skill submit/queue share the Chat file with Expert and Local Chat KEEP paths |

## Generated Outputs Ledger

None

## Todo T1 — Classifier bind DTO and start IPC

**Owns Changes**
- C01
- C02
- C03

**Goal**

Make the extra-required string subset classified, projected, and bound on the existing Main path so Catalog can mark it callable and start can send whitelist arguments on the existing `tools/call`.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#classifySkillInvocation`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#bindPromptFirstTool`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#validateStartInput`

**Changes**
- Freeze invocation mode name as `limited-parameter-form`. Do not make `parameters-required` mean callable.
- Run the existing object-root / `$ref` / composite / `promptField` string gates for both `chat` and `form` before extra-required analysis.
- If extra required (besides `promptField`) is 1–8 names, every extra property exists, and each has `type === "string"` (not a union): classify `limited-parameter-form` / `callable` and emit `extraStringFields` in `required` extra order. Use property `title` only when it is a non-empty string.
- If extra required is empty: `chat` stays `prompt-first`; `form` stays `form-required`.
- If extra required is non-string, over 8, or missing from properties: keep `parameters-required` (chat) or `form-required` (form) and `unsupported`.
- `mapPublicSkillCatalogTools` copies `extraStringFields`. Renderer still must not use `inputSchema` as execution truth.
- Extend `bindPromptFirstTool` with optional `extraParameters`. Success for `prompt-first` remains `{ [promptField]: trimmedPrompt }` and rejects any extra keys. Success for `limited-parameter-form` requires every extra field to be a non-empty string present in the whitelist and copies only those keys plus promptField.
- Extend `SkillRunStartInput` with optional `extraParameters`. `validateStartInput` accepts a missing map; otherwise at most 8 string keys (length ≤ 256) and string values (length ≤ 32000). Do not add a channel name.
- `createSkillRunService` `start` passes the sanitized map into bind. Rewrite `skill-run-service.test.ts` so a `prompt`+`region` string schema succeeds when `region` is supplied, and a non-string extra required still fails. Update `skill-run-e2e.test.ts` so `writer.extra` is `limited-parameter-form`; start without extras still fails closed.
- Do not edit `contracts/skill-run/v1.2.1`. Do not parse `$ref`. Do not collect optional extra fields. Do not log extra values in telemetry.

**Stop conditions**
- [ ] V01 PASS
- [ ] V02 PASS
- [ ] V03 PASS
- [ ] prompt-first arguments still only promptField
- [ ] form with no extra required is still not prompt-first
- [ ] no new IPC channel name

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T2 — Catalog Chat extra-string collector

**Owns Changes**
- C04

**Goal**

Let users select the callable subset, fill Main-projected extra string fields in the existing Skill UI, start through existing IPC, and keep those values on the Chat queue snapshot.

**Immediate anchors**
- `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel`
- `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx#SkillSelectionBar`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`

**Changes**
- Catalog cards and keyboard Enter select when `callability === "callable"` (covers prompt-first and `limited-parameter-form`). Remaining fail-closed modes stay disabled.
- `SkillSelectionBar` shows extra string inputs from `extraStringFields` for `limited-parameter-form`. Prompt-first shows no extra inputs. The unavailable label stays for non-callable selections.
- Chat Skill send allows callable subset tools. Block send when any extra required string is blank. Pass `extraParameters` on `skillRun.start`.
- Queue `skillRequest` copies `extraParameters` at enqueue. Drain uses the snapshot. If Chat cannot be mounted, export a copy-on-enqueue helper next to `resolveRestoredSkillSelection` and cover it in `skillSelectionRestore.test.ts`.
- English-only new strings in `locales/en/skillRun.ts`. Do not add other locale packages.
- Update `lat.md/skill-run.md`: document the subset; keep Approval decision, Attachment, and unrestricted JSON Schema in Still Out. Do not mark Roadmap RM-10 `DONE`.

**Stop conditions**
- [ ] V04 PASS
- [ ] V05 PASS
- [ ] V06 PASS
- [ ] V07 PASS
- [ ] V08 PASS
- [ ] no Skill Chat page and no JSON Schema form package
- [ ] Roadmap RM-10 status is not DONE in this implementation tree

**Triggered reads**
- None unless a listed trigger becomes true

## Verification

Run the Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07, V08 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but one or more proof gates are pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents implementation or proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts with current reality | PRD revision request |
