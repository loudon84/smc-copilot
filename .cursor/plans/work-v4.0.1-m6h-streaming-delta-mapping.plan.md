---
name: RM-14 Skill Run Streaming Delta Mapping
overview: Map imported v1.5.0 assistant.delta into the existing parser and projection text merge. Snapshot remains authoritative. Do not add IPC, activity kinds, or raw events.
todos:
  - id: t1-map-enumerated-assistant-delta
    content: "T1 — Map enumerated assistant.delta [C01]"
    status: completed
  - id: t2-merge-delta-into-projection-text
    content: "T2 — Merge delta into projection text [C02]"
    status: completed
  - id: t3-document-mapped-delta-state
    content: "T3 — Document mapped delta state [C06]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: RM-14
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/AD-WORK-v4.0.1-STREAMING-DELTA@1.0.1/RM-14
grounded_commit: fbe3316cfa30b64465cd6cfe0c4275c18bd7fcba
grounding_source: committed_baseline
working_tree_fingerprint: dirty
---

# RM-14 Skill Run Streaming Delta Mapping Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6h-streaming-delta-mapping.md)

## Scope

- In: map eligible v1.5 `assistant.delta` in the existing contract parser; merge `message_id`/`delta_seq`/`delta` into existing `SkillRunProjection.text` in `SkillRunService`; keep snapshot `assistant.message` authoritative; document mapped LAT state.
- Out: new parser/store/IPC/Chat/Session/File owner; raw Provider event to Preload/Renderer; Local Chat/Hermes streaming; new activity kind or sidecar activity rows; Provider SHA-covered bytes; attachments; `approvalExpiry`; download-by-ref; clarify respond; generic P0 required-path expansion; Roadmap RM-14 DONE.
- Production Owner inherited from PRD: Main contract parser owns event → sanitized delta. SkillRunService owns merge, duplicate/gap fail-soft, snapshot seal, emit and sidecar `text`. `modules/skill-run` already renders `projection.text`. consumer-lock eligibility is consumed, not rewritten.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent` | `assistant.message` maps `payload.text`; `assistant.delta` hits `default` → `unknownEvent` | `parseSkillRunEvent` and `ParsedSkillRunEvent` exist; `clipDisplayString` already clips display strings | sole production caller is `skill-run-service.ts` SSE loop | reuse activity fail-closed pattern; call existing `hasSkillRunStreamingDeltaBundle()`; do not set `text` to the raw chunk | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | non-`rawUnknown` assigns `patch.text = event.text` (replace); `updateProjection` emits and persists sidecar `text`; `ActiveRun` has `seenEventIds` only | `createSkillRunService`, `ActiveRun`, `updateProjection` exist | SSE is the only `parseSkillRunEvent` production call; poll uses `parseSkillRunStatusToPhase` | extend `ActiveRun` with in-memory per-`message_id` buffer; reuse emit/persist; do not add IPC or activity kind | PASS |
| C06 | `apps/work/lat.md/skill-run.md` | LAT still says import-only and RM-14 BACKLOG | file exists; M6g section names helper and mapping backlog | Grounding/review reads LAT; runtime does not | reuse existing skill-run LAT file | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | 在 v1.5 streaming-delta eligibility 为 true 时，合法 `assistant.delta` fixture 使同一 Skill Card 的 `text`/`resultText` 出现已清洗增量，而不再仅以 `rawUnknown` 丢弃。 | BEHAVIOR | C01, C02 | T1, T2 | V01, V02 | UNIT | yes |
| AC-02 | AC | `sse-assistant-delta-replay` 顺序（delta「正在分析」后 snapshot「正在分析完整结果」）结束后，可见文本等于 snapshot，而不是二者拼接。 | LIFECYCLE | C02 | T2 | V02 | UNIT | yes |
| AC-03 | AC | 缺 `message_id` / `delta_seq` / `delta`、非 string `delta`、eligibility false、或未枚举 `event_type` 时，不把 payload 写入 `text` 或 activity；游标仍可前进。 | NEGATIVE | C01, C02 | T1, T2 | V01, V02 | UNIT | yes |
| AC-04 | AC | 重复 `(message_id, delta_seq)` 不造成重复追加。乱序 delta 不覆盖已权威 snapshot，也不发明缺失 token。 | LIFECYCLE | C02 | T2 | V02 | UNIT | yes |
| AC-05 | AC | 无新 IPC channel、无 raw Provider event 到 Renderer、无新 Activity kind、无 sidecar activity 行、无第二 Chat/Session/File owner。 | SCOPE | C01, C02, C06 | T1, T2, T3 | V03 | DIFF_SCOPE | yes |
| AC-06 | AC | v1.2.1 Catalog/start、v1.3 decision、v1.4 attachment、RM-08 四类 activity、RM-15 单卡 transcript 与 sidecar 文本路径无回归。Local Chat 流式与 `clarify-respond` 不被调用。 | BEHAVIOR | C01, C02 | T1, T2 | V04, V05 | UNIT | yes |
| AC-07 | AC | LAT 写明：v1.5.0 enumerated `assistant.delta` 已映射进现有 projection `text`；mapping 仍受 eligibility helper 约束；expiry / download-by-ref / clarify respond 仍不在范围。 | SCOPE | C06 | T3 | V03 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | C01–C02 与 C06 由单一 canonical Plan 完成；blocking claims CL-01–CL-07 均为 fresh PASS。C03–C05、C07 由既有路径回归或静态范围证明。 | EVIDENCE | C01, C02, C06 | T1, T2, T3 | V01, V02, V03, V04, V05 | UNIT | yes |
| DOD-02 | DOD | RM-14 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。 | OPERATIONS | C06 | T3 | V03 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 若发现需要新 IPC、activity kind、raw event、把 snapshot 当 delta、改 Provider 字节、或混入 expiry/upload/clarify respond，必须返回 Architecture / 对应 Item，不得扩大本 PRD。 | SCOPE | C01, C02, C06 | T1, T2, T3 | V03 | DIFF_SCOPE | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Eligible delta merge | AC-01, AC-03 | SSE `assistant.delta` after `parseSkillRunEvent` | per-`message_id` buffer open; `nextSeq` waits for the next integer | `createSkillRunService` writes merged `projection.text` via `updateProjection` | missing/ineligible/non-string → `rawUnknown`; no `text` write | V01, V02 |
| Seq / snapshot authority | AC-02, AC-04 | duplicate, gap, or `assistant.message` for same `message_id` | duplicate/gap ignored; snapshot seals buffer | snapshot `text` replace is the success writer; later deltas cannot unseal | gap does not invent tokens; sealed snapshot ignores late deltas | V02 |
| Unknown / ineligible | AC-03, AC-05 | helper false or unknown `event_type` | cursor may advance via existing `seenEventIds` | none for `text` | `rawUnknown` path; no activity row | V01, V03 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Enumerated delta event | AC-01, AC-03 | Provider v1.5 SSE/`assistant.delta` | existing SSE parse → `parseSkillRunEvent` | `createSkillRunService` merge | `message_id`, `delta_seq`≥1, string `delta`; eligibility true | parser then service | `rawUnknown`; no `text` | `(message_id, delta_seq)` plus existing event id | V01, V02 |
| Snapshot authority | AC-02, AC-04 | Provider `assistant.message` | existing parser `text` plus optional `message_id` | same ActiveRun buffer | `text`; `message_id` when present | parser maps text; service seals | old snapshot without `message_id` keeps replace-all | event id + sealed `message_id` | V02 |
| Live/durable display | AC-01, AC-05 | `updateProjection` | existing projection IPC + RM-15 sidecar `text` | `modules/skill-run` `resultText` | Work `text` only | existing owners; no new channel | persist/emit failure stays current sidecar gap path | `clientRequestId` | V02, V03 |
| Eligibility gate | AC-03, AC-06 | RM-13 `hasSkillRunStreamingDeltaBundle` | local v1.5 Bundle read | parser | helper true | consumer-lock, unchanged | false keeps `rawUnknown` | pure read | V01, V04 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | eligible v1.5 delta enters sanitized projection text | yes | RM-13 lock/helper PASS; parser currently rawUnknown | PROVEN_FRESH + NOT_TESTED | TARGETED_RERUN | runtime mapping is new | V01, V02 |
| CLM-02 | AC-02 | replay ends on snapshot text, not concatenation | yes | Provider replay fixture locked; Work unconsumed | NOT_TESTED | TARGETED_RERUN | merge/replace is new | V02 |
| CLM-03 | AC-03 | malformed/ineligible/unknown does not write text | yes | parser unknown + helper negatives | PROVEN_BUT_AFFECTED | TARGETED_RERUN | mapping must not weaken fail-closed | V01, V02 |
| CLM-04 | AC-04 | duplicate seq does not double-append; gap/late delta does not unseal snapshot | yes | SSE id dedupe exists; no delta_seq buffer | NOT_TESTED | TARGETED_RERUN | seq merge is new | V02 |
| CLM-05 | AC-05 | no new owner/IPC/raw event/activity kind | yes | RM-08/RM-15 boundary; RM-13 AC-05 | PROVEN_BUT_AFFECTED | TARGETED_RERUN | mapping may tempt a new channel | V03 |
| CLM-06 | AC-06 | existing P0/P1/transcript suites still pass | yes | existing focused suites | PROVEN_BUT_AFFECTED | TARGETED_RERUN | parser/service text merge touches old paths | V04, V05 |
| CLM-07 | AC-07 | LAT describes mapped state, not import-only backlog | yes | LAT still names RM-14 BACKLOG | NOT_TESTED | TARGETED_RERUN | documentation must track this Item | V03 |
| CLM-08 | DOD-01 | C01/C02/C06 have fresh Plan-owned proof | yes | no RM-14 implementation evidence | NOT_TESTED | TARGETED_RERUN | new item | V01, V02, V03, V04, V05 |
| CLM-09 | DOD-02 | implementation tree does not mark RM-14 DONE | yes | Roadmap currently READY | PROVEN_BUT_AFFECTED | TARGETED_RERUN | status rule | V03 |
| CLM-10 | DOD-03 | expansion is rejected rather than added | yes | approved PRD boundary | PROVEN_FRESH | TARGETED_RERUN | mapper remains narrow | V03 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01, CLM-03, CLM-08 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-contract-parser.test.ts --pool=threads --maxWorkers=1', shell=True))"` | eligible v1.5 delta fixture is not `rawUnknown` and does not put the chunk on `text`; malformed/ineligible/unknown stay `rawUnknown`; snapshot still maps `text` | helper false or missing fields never become delta | LOCAL_TRANSIENT | local Work checkout | TARGETED_RERUN | yes |
| V02 | CLM-01, CLM-02, CLM-03, CLM-04, CLM-08 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | replay fixture ends on snapshot text; first delta appears in `projection.text`; duplicates do not double-append; gapped/late delta does not unseal | unknown events still skip `text` | LOCAL_TRANSIENT | local Work checkout | TARGETED_RERUN | yes |
| V03 | CLM-05, CLM-07, CLM-08, CLM-09, CLM-10 | DOCUMENT_SEMANTIC | LOCAL | `python -c "from pathlib import Path; import subprocess,sys; kinds=Path('apps/work/src/shared/skill-run.ts').read_text(encoding='utf-8'); store=Path('apps/work/src/main/skill-run/skill-run-transcript-store.ts').read_text(encoding='utf-8'); preload=Path('apps/work/src/preload/skill-run-api.ts').read_text(encoding='utf-8'); lat=Path('apps/work/lat.md/skill-run.md').read_text(encoding='utf-8'); road=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); row=next(x for x in road.splitlines() if x.startswith(chr(124)+' RM-14 ')); status=row.split(chr(124))[4].strip(); ok=('assistant.delta' not in kinds.split('SkillRunActivityKind')[1].split('export type')[0] and 'assistant.delta' not in store and 'DELTA' not in preload and 'projection text' in lat.lower() and 'BACKLOG' not in lat.split('Still Out')[-1] and status!='DONE'); sys.exit(0 if ok and subprocess.call('lat check',shell=True,cwd='apps/work')==0 else 1)"` | no new activity kind/IPC; LAT mapped; Roadmap RM-14 not DONE; `lat check` PASS | raw event channel, sidecar activity kind, or DONE in this commit fail | LOCAL_TRANSIENT | local Work checkout | TARGETED_RERUN | yes |
| V04 | CLM-06, CLM-08 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-contract-parser.test.ts src/main/skill-run/skill-run-consumer-lock.test.ts src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | RM-08 activity mapping, lock helpers, and Skill Card `resultText` path still pass | Catalog/decision/attachment helpers and read-only clarify remain | LOCAL_TRANSIENT | local Work checkout | TARGETED_RERUN | yes |
| V05 | CLM-06, CLM-08 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run guard', shell=True))"` | Work boundary guards pass | no new renderer HTTP, gateway spawn, or reference import | LOCAL_TRANSIENT | local Work checkout | TARGETED_RERUN | yes |

## Immediate Read

- `apps/work/src/main/skill-run/skill-run-contract-parser.ts`
- `apps/work/src/main/skill-run/skill-run-service.ts`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts`
- `apps/work/src/shared/skill-run.ts`
- `apps/work/lat.md/skill-run.md`
- `contracts/skill-run/v1.5.0/fixtures/run-event-assistant-delta.json`
- `contracts/skill-run/v1.5.0/fixtures/sse-assistant-delta-replay.json`

## Triggered Read

- If parser needs a test seam for eligibility: read only `hasSkillRunStreamingDeltaBundle` call sites; do not change helper semantics.
- If `skill-run-service.test.ts` is `DELIVERY_TARGET_CONFLICT` because of pre-existing dirty: stop; do not stash or fold unrelated e2e edits into this Plan.
- If mapping appears to need a new IPC channel, activity kind, or snapshot-as-delta: RETURN_PRD / Architecture.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent` | PROD | MODIFY | Main contract parser | T1 | eligible `assistant.delta` becomes sanitized delta fields, never `text` | Parser maps enumerated assistant.delta | no |
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#ParsedSkillRunEvent` | PROD | MODIFY | Main contract parser | T1 | optional `messageId`/`deltaSeq`/`deltaText`; snapshot may carry `messageId` | Parser maps enumerated assistant.delta | no |
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.test.ts` | TEST | MODIFY | parser tests | T1 | v1.5 delta fixture, negatives, snapshot regression | Parser maps enumerated assistant.delta | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#ActiveRun` | PROD | MODIFY | SkillRunService | T2 | in-memory per-`message_id` buffer/nextSeq/sealed | Service merges delta into projection text | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | SkillRunService | T2 | merge/seal through existing `updateProjection` | Service merges delta into projection text | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | service tests | T2 | replay, duplicate, gap, ineligible skip | Service merges delta into projection text | no |
| C06 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | Work LAT | T3 | mapped enumerated delta; helper still gates; RM-14 not described as BACKLOG | LAT streaming-delta state | no |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx` | PROD | KEEP | modules/skill-run | - | continue rendering existing `projection.text` as `resultText` | Live Skill Card / sidecar text | no |
| C04 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts` | PROD | KEEP | Main contract parser | - | unknown and ineligible stay `rawUnknown` | Unknown fail-soft | no |
| C05 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunStreamingDeltaBundle` | PROD | KEEP | consumer-lock | - | helper semantics unchanged | v1.5 eligibility helper | no |
| C07 | `apps/work/src/main/skill-run/skill-run-service.ts` | PROD | KEEP | SkillRunService | - | no Local Chat streaming, raw event, expiry, upload, or clarify respond | KEEP absent mixed items | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `parseSkillRunEvent` default is why delta is invisible; `clipDisplayString` and activity fail-closed already exist | One switch arm at the shared parser; no second codec |
| C02 | MODIFY_EXISTING | `createSkillRunService` is the only production caller and already owns `text` replace/emit/persist | In-memory ActiveRun fields avoid a new store/IPC |
| C03 | REUSE_EXISTING | `skill-run-transcript.ts` already copies `projection.text` to `resultText` | Live typewriter is C02, not a UI owner change |
| C04 | REUSE_EXISTING | `unknownEvent` + `rawUnknown` skip already exist | Keep the default path |
| C05 | REUSE_EXISTING | `hasSkillRunStreamingDeltaBundle` already fail-closed | Consume, do not rewrite lock |
| C06 | MODIFY_EXISTING | Work AGENTS requires LAT after behaviour change | Smallest truthful mapped-state sentence |
| C07 | REUSE_EXISTING | Local Chat streaming and expiry/upload/clarify respond are other owners | Keep absent |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts#ParsedSkillRunEvent`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.test.ts` | `hasSkillRunStreamingDeltaBundle`; v1.5 delta/message fixtures | - | no |
| T2 | C02 | `apps/work/src/main/skill-run/skill-run-service.ts#ActiveRun`<br>`apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts` | T1 parsed delta/snapshot fields; existing `updateProjection` | T1 | no |
| T3 | C06 | `apps/work/lat.md/skill-run.md` | T1/T2 behaviour; Roadmap RM-14 status | T1, T2 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/skill-run/skill-run-contract-parser.ts` | T1 | Discriminated event switch is the only legal mapping site; T2 must not add a second parser. |
| `apps/work/src/main/skill-run/skill-run-service.ts` | T2 | SSE merge and `ActiveRun` identity live here; T1 must not write service buffers. |

## Generated Outputs Ledger

None. This Plan does not generate Provider assets or code-generated files.

## New File Justification

No new production or test files. Parser/service tests extend existing suites.

## Todo T1 — Map enumerated assistant.delta

**Owns Changes**
- C01

**Goal**

Eligible v1.5 `assistant.delta` leaves `rawUnknown`. Parser exposes sanitized `messageId`/`deltaSeq`/`deltaText` and does not assign the chunk to `text`. Snapshot may carry `messageId` while keeping `text`.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#ParsedSkillRunEvent`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunStreamingDeltaBundle`
- `contracts/skill-run/v1.5.0/fixtures/run-event-assistant-delta.json`

**Changes**
- Call `hasSkillRunStreamingDeltaBundle()` inside `assistant.delta`; false → `unknownEvent`.
- Require non-empty `message_id`, integer `delta_seq` ≥ 1, string `delta`; clip with existing `clipDisplayString`; otherwise `unknownEvent`.
- Do not set `ParsedSkillRunEvent.text` from delta.
- On `assistant.message`, keep `text`; if `message_id` is a non-empty string, pass it through for T2 seal. Missing `message_id` keeps today’s replace-all snapshot.
- Extend parser tests with the v1.5 delta fixture, field negatives, eligibility-false, and snapshot regression. Do not change `REQUIRED_BUNDLE_PATHS` or helper semantics.

**Stop conditions**
- [ ] V01 PASS.
- [ ] Delta never becomes `activity`.
- [ ] No preload/shared activity-kind edits.

**Triggered reads**
- If eligibility needs a test stub, stub `hasSkillRunStreamingDeltaBundle` only.
- If a new payload field appears required by schema: RETURN_PRD / Provider.

## Todo T2 — Merge delta into projection text

**Owns Changes**
- C02

**Goal**

SSE applies eligible delta chunks onto `projection.text` in `delta_seq` order per `message_id`. Snapshot seals and replaces. Duplicates/gaps do not corrupt sealed text. Existing emit/persist/Skill Card path is reused.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-service.ts#ActiveRun`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `contracts/skill-run/v1.5.0/fixtures/sse-assistant-delta-replay.json`

**Changes**
- Add in-memory buffer map on `ActiveRun` (`text`, `nextSeq`, `sealed`) keyed by `message_id`.
- When parsed delta is present and not sealed: if `deltaSeq === nextSeq` (starting at 1), append `deltaText`, bump `nextSeq`, `updateProjection({ text })`. If `deltaSeq < nextSeq`, ignore increment. If `deltaSeq > nextSeq`, ignore increment (no invented tokens).
- When parsed snapshot `text` has `messageId`, replace buffer, seal, `updateProjection({ text })`.
- When snapshot has `text` but no `messageId`, keep current replace-all.
- `rawUnknown` continues to skip `text` and still uses `seenEventIds`.
- Do not persist delta as sidecar activity. Do not add IPC.
- Prove replay, duplicate, gap-after-snapshot, and unknown-skip in `skill-run-service.test.ts`.

**Stop conditions**
- [ ] V02 PASS.
- [ ] Replay visible text equals snapshot, not concatenation.
- [ ] `SkillRunActivityKind` and transcript whitelist unchanged.

**Triggered reads**
- If `skill-run-service.test.ts` is a delivery target conflict from pre-existing dirty: stop; do not stash unrelated edits.
- If UI cannot see `text` without a new channel: RETURN_PRD (C03 is KEEP because the card already renders `resultText`).

## Todo T3 — Document mapped delta state

**Owns Changes**
- C06

**Goal**

LAT states v1.5 enumerated `assistant.delta` is mapped into existing projection `text`, still gated by `hasSkillRunStreamingDeltaBundle`. Do not mark RM-14 DONE.

**Immediate anchors**
- `apps/work/lat.md/skill-run.md`

**Changes**
- Replace import-only / RM-14 BACKLOG sentences with mapped-state facts.
- Keep expiry, download-by-ref, and clarify respond in Still Out.
- Do not edit Roadmap status in this Plan.
- Run `lat check` from `apps/work`.

**Stop conditions**
- [ ] V03 PASS.
- [ ] V05 PASS after LAT/guard.
- [ ] Roadmap RM-14 remains not DONE in this implementation.

**Triggered reads**
- If LAT format fails: repair only `apps/work/lat.md/skill-run.md`.

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`. V01–V05 are LOCAL; none is live Provider E2E.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; all blocking Acceptance Claims PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05 |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | `skill-run-service.test.ts` target conflict or helper/bundle missing | blocker record; do not stash |
| RETURN_PRD | new IPC, activity kind, raw event, snapshot-as-delta, or mixed expiry/upload/clarify is required | Architecture/PRD revision |
