---
name: RM-16 Skill Session UX and Terminal Result Closure
overview: Fix Session Files user-intent visibility, lock the accepted Skill identity in Main, and converge v1.5.0 terminal reports through the published result endpoint without changing Provider contracts or creating parallel Chat, Session, File, or lifecycle owners.
todos:
  - id: t1-session-files-intent-and-selection-lock-ui
    content: "T1 — Session Files intent and accepted-aware selection [C01, C02]"
    status: completed
  - id: t2-main-session-lock-and-terminal-result-resolver
    content: "T2 — Main session lock and terminal result resolver [C03, C04, C05]"
    status: completed
  - id: t3-result-recovery-and-transcript-presentation
    content: "T3 — Result recovery and transcript presentation [C06]"
    status: completed
  - id: t4-lat-and-governed-regression-closure
    content: "T4 — LAT and governed regression closure [C07]"
    status: blocked
isProject: false
plan_contract: smc.plan.v3.5
plan_id: RM-16
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-16/user-input-2026-09-09-v1
grounded_commit: 0cb5b34a6fa2684a826456583cace8a3a5e350ad
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# RM-16 Skill Session UX and Terminal Result Closure Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6j-skill-session-ux-terminal-result-closure.md)

## Scope

- In: new-session Session Files hidden-by-default and explicit-open triggers; accepted-aware Skill Selection Bar; Main-authoritative, atomic session/tool lock; removal of Renderer-owned session-mode mutation; strict v1.5.0 Public Run Result adapter; one order-independent successful-terminal resolver; non-empty text monotonicity; sanitized result-unavailable/no-text presentation; restart retry through the existing rehydrate entry; focused, guard, typecheck, LAT, and affected regression proof.
- Out: Provider Bundle/schema/checksum edits; Public Run schema widening; raw SSE/result IPC; direct hermes-agent workspace access; a second Chat, Session, File, Gateway, transcript, or lifecycle owner; Local/Expert execution changes; parameter form, approval, attachment upload, artifact download-by-ref, or Managed Hermes Runtime Ownership Closure work.
- Production Owner inherited from PRD: existing Chat owns panel/selection UX; existing Main session-mode owner owns durable Skill identity; existing Gateway Client owns authorized Provider HTTP adaptation; existing SkillRunService owns SSE/poll/result terminal convergence; existing Session sidecar/Card/File Platform retain persistence, presentation, and file operations.
- Grounding boundary: source behavior is grounded at committed baseline `0cb5b34a6fa2684a826456583cace8a3a5e350ad`. Uncommitted Managed Hermes Runtime changes and RM-16 governance documents are present in the working tree but are excluded from implementation grounding and write ownership.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Chat/useChatPanelLayout.ts#useSessionFilesVisible` and `Chat.tsx#handleOpenManagedPreview` | visibility initializes from a global localStorage key with default `true`; Chat mounts the panel whenever `sessionId && visible`; managed preview does not assert panel visibility | exported hook and local callback resolve; show/hide buttons already exist | every MessageList, Expert artifact, document-created, FilePreview-created, and SessionFiles preview path converges at `handleOpenManagedPreview` | reuse the existing boolean state, show/hide controls, and preview callback; remove global auto-open semantics | PASS |
| C02 | `Chat.tsx#Chat` and `SkillSelectionBar.tsx#SkillSelectionBar` | Catalog selection writes session mode immediately; accepted submit writes it again; Selection Bar always exposes clear | Chat selection restore effect, Catalog callback, `submitSkill`, and Selection Bar props resolve | `getSessionMode` already restores durable identity; no separate catalog owner is needed | reuse selectedSkill and Main mode restore; add a locked presentation state and remove pre-accepted persistence | PASS |
| C03 | `skill-run-session-mode-store.ts#setSkillRunSessionMode`, `skill-run-service.ts#createSkillRunService`, and `skill-run-ipc.ts#getSkillRunService` | store uses overwrite UPSERT; public Preload setter permits arbitrary replacement; service validates/binds before creating the accepted local run but does not consult/persist a lock | store setters/getters, service start, IPC composition and shared/preload API symbols resolve | RM-15 sidecar already records accepted `providerRunId`, `sessionId`, `toolName`, and creation order for legacy backfill; no new identity table is required | convert the existing table to an atomic accepted lock, inject it at the service accepted boundary, retain read/clear, and remove Renderer mutation API | PASS |
| C04 | `skill-run-gateway-client.ts#SkillRunGatewayClient` and `#createSkillRunGatewayClient` | per-run routes already retain sanitized `resultPath`; interface only exposes snapshot; snapshot permissively tries to extract result-like fields | interface, `defaultSkillRunRoutes`, `resolveRoutes`, `getRunSnapshot`, and authorized transport resolve | v1.5.0 endpoint matrix declares safe GET `/api/v1/runs/{run_id}/result`; `runs/result.schema.json` publishes `run_id`, status, nullable text | add one strict result adapter on the existing client and stop treating Public Run snapshot as a report envelope | PASS |
| C05 | `skill-run-service.ts#updateProjection`, `#pollStatus`, and `#consumeSse` | any terminal phase marks `terminalConfirmed` and aborts SSE; poll success patches optional snapshot `resultText`; SSE terminal discovers artifacts and returns independently | all three local functions resolve inside the sole `createSkillRunService` owner | existing ActiveRun, sleep injection, projection persistence, delta buffers, telemetry, and artifact discovery are sufficient | hoist one in-flight successful-terminal resolver; preserve non-empty text, fetch result once per attempt, finalize/abort once, and keep failure truth separate | PASS |
| C06 | `skill-run-continuation.ts#rehydrateSkillRunContinuationsForSession` and `SkillRunTranscriptCard.tsx#SkillRunTranscriptCard` | succeeded continuations are removed; terminal result failure has no retry path; Card renders existing error text but artifact buttons say “Result ready” even without report text | rehydrate entry, transcript sidecar batch reader, service rehydrate, Card and English locale resolve | reuse existing `errorCode/errorMessage`, durable sidecar, projection subscription, history merge, and file preview callback; no result-specific store or raw command IPC | rehydrate only sanitized sidecar rows marked result-unavailable, retry safe GET without start, and make Card distinguish report state from output files | PASS |
| C07 | `apps/work/lat.md/skill-run.md` and existing focused suites | LAT records v1.5 delta/transcript closure but not explicit-open panel, accepted lock, or status/result convergence; tests encode default-visible and omit terminal order race | LAT section and named test entry points resolve | C01-C06 behavior changes invalidate the current LAT state and focused expectations | extend existing suites; add focused store/continuation tests only where no current owner-local test file exists | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | 新会话在空白、首次 submit、sessionId 创建、Skill Run accepted/terminal 和 Artifact 到达后均保持 Session Files 折叠；不会继承其他会话的 visible 状态。 | BEHAVIOR | C01 | T1 | V01 | INTEGRATION | yes |
| AC-02 | AC | 用户点击现有 show 入口或实际文件/preview 入口后 Session Files 才显示；用户 hide 后，后台状态变化不能再次打开，直至下一次显式动作。 | BEHAVIOR | C01 | T1 | V01 | INTEGRATION | yes |
| AC-03 | AC | Skill selection 在首个 accepted Run 前可清除/切换；accepted 后同一会话的 clear/switch 不可操作，cancel/fail/success 不解锁。 | LIFECYCLE | C02, C03 | T1, T2 | V01, V02 | INTEGRATION | yes |
| AC-04 | AC | reload/reopen/restart 恢复 accepted skill lock；Main 允许同 tool 的幂等写/后续 run，拒绝不同 tool 且不调用 Provider。升级前无 accepted 证据的 provisional selection 不被误锁。 | LIFECYCLE | C03 | T2 | V02 | INTEGRATION | yes |
| AC-05 | AC | Provider run 成功且 v1.5.0 `/result` 返回非空报告时，同一 Skill Card 最终显示并持久化该报告，而不是只显示 completed/result-ready；Artifact 是否存在不影响报告取得。 | CONTRACT | C04, C05, C06 | T2, T3 | V03, V04, V05 | INTEGRATION | yes |
| AC-06 | AC | poll-first、SSE-terminal-first、message-before-terminal、message-after-terminal 和 replay 五类顺序得到一致 terminal report；空 snapshot/result 不会清除已有 delta/message/result text，terminal phase 不回退。 | LIFECYCLE | C05 | T2 | V04 | UNIT | yes |
| AC-07 | AC | Result GET 暂时失败时，run 仍是 succeeded、Artifact 仍可用，Card 显示 sanitized result-unavailable 而非 false-ready；恢复只做 safe GET，不创建第二个 Provider Run。 | LIFECYCLE | C05, C06 | T2, T3 | V04, V05 | INTEGRATION | yes |
| AC-08 | AC | Renderer 看不到 raw Provider event、result URL、token、response body、absolute workspace/cache path；冲突 skill 不 silent fallback Expert/Local Chat。 | SECURITY | C03, C04, C05, C06 | T2, T3 | V02, V03, V04, V05, V07 | DIFF_SCOPE | yes |
| AC-09 | AC | 现有 v1.5 delta snapshot authority、RM-15 单 Card/durable transcript、queue/idempotency/cancel/restart、File Platform Preview/Save As 和 Local/Expert regression 行为保持通过。 | SCOPE | C01, C02, C03, C04, C05, C06 | T1, T2, T3 | V06, V07, V08 | INTEGRATION | yes |
| AC-10 | AC | LAT 明确记录：Session Files explicit-open-only、accepted-time session skill lock、Public Run status 与 Result 的终态收敛，以及 result failure 不改变 Provider succeeded truth。 | OPERATIONS | C07 | T4 | V09 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | C01–C07 由一个独立 canonical Plan 实施；本 PRD 不与 Managed Hermes Runtime Ownership Closure 或 Provider Bundle 变更合并。 | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2, T3, T4 | V01, V02, V03, V04, V05, V06, V07, V08, V09 | DIFF_SCOPE | yes |
| DOD-02 | DOD | CL-01–CL-10 均有 fresh PASS；至少包含 Session Files user-intent、accepted lock/Main bypass、terminal order matrix、result retry/no-second-run、sanitized boundary 和回归证据。 | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2, T3, T4 | V01, V02, V03, V04, V05, V06, V07, V08, V09 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 实施不能新增第二 Chat/Session/File/Gateway/transcript owner，不能只隐藏 clear X 而省略 Main lock，也不能以延迟/固定 sleep 掩盖 SSE/poll race。 | SCOPE | C01, C02, C03, C04, C05, C06 | T1, T2, T3 | V02, V04, V07 | DIFF_SCOPE | yes |
| DOD-04 | DOD | 若实现需要改变 Provider v1.5.0 wire schema、把 result 放进 Public Run snapshot、引入新 raw IPC，或改变 accepted/idempotency 定义，必须返回 Provider contract/Architecture，不得在 Plan 中扩大范围。 | SCOPE | C03, C04, C05 | T2 | V03, V06, V07 | DIFF_SCOPE | yes |
| DOD-05 | DOD | RM-16 仅在 APPROVED PRD、canonical Plan、实现提交、Completion Audit/Review/Verification PASS 和可解析 evidence reference 全部具备后标为 `DONE`；Roadmap status commit 与 implementation commit 分离。 | OPERATIONS | C07 | T4 | V09 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Session Files intent | AC-01, AC-02 | Chat mount/session identity change or explicit user file/show/hide action | hidden local view state; session/run/artifact effects cannot promote it | existing Chat callback sets visible only for show/file intent | hide sets false; background updates are no-op | V01 |
| Session Skill lock | AC-03, AC-04, AC-08 | start passes Main validation/binding and reaches local accepted boundary | selection is Renderer-local and replaceable; no durable lock row | atomic existing session-mode transaction inserts first tool or accepts same tool | conflicting tool returns sanitized rejection before `callSkill`; failed/cancelled terminal does not delete lock | V02 |
| Successful terminal resolution | AC-05, AC-06, AC-07 | poll or SSE observes succeeded | one ActiveRun in-flight terminal promise; delta/message text remains writable and non-empty-monotonic | one resolver reads safe `/result`, patches final text/state, persists, emits telemetry, discovers artifacts, then aborts/cleans once | safe GET failure records succeeded plus `RESULT_RETRIEVAL_FAILED`; cancel/non-success terminal use existing unique terminal writer | V03, V04 |
| Restart result recovery | AC-07 | Session rehydrate sees a succeeded sidecar row with providerRunId and result-unavailable code | no continuation and no new Provider start | existing rehydrate entry reconstructs one ActiveRun and invokes the same successful-terminal resolver | unavailable remains sanitized/retryable; duplicate active request is reused | V05 |
| Legacy lock migration | AC-04 | existing session-mode table is opened after upgrade | old row alone is provisional; accepted evidence is earliest sidecar run with non-null providerRunId | existing table migration/backfill writes first accepted tool as locked | no accepted sidecar leaves row unlocked/invisible to lock reader | V02 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Explicit Session Files open | AC-01, AC-02 | user click on show/file/preview | existing Renderer callback props; no IPC content | existing Chat panel state and File Preview | fileId only on file action; current session identity | existing Chat/File callbacks | invalid/no file retains hidden or existing preview error; no auto-open effect | current mounted Chat/session identity | V01 |
| Accepted session tool lock | AC-03, AC-04, AC-08 | validated/bound SkillRunService request | Main-only lock callback into existing SQLite session-mode table | start gate, `getSessionMode`, Renderer restore | sessionId, validated toolName, catalog title, accepted timestamp | service + atomic store transaction | stable `SKILL_SESSION_TOOL_LOCKED`; no Provider call/fallback | sessionId primary key; same tool is idempotent | V02 |
| Provider terminal result | AC-05, AC-06, AC-08 | checksum-locked v1.5 Provider | authorized safe GET sanitized `resultPath`; `runs/result.schema.json` | existing Gateway adapter then SkillRunService | run_id, status, nullable text; response bounds | Gateway route/response adapter | sanitized Gateway error; no body/URL leakage | providerRunId; GET is safe-retry | V03, V04 |
| Terminal projection persistence | AC-05, AC-06, AC-07 | single Service resolver | existing sanitized `SkillRunProjection` and RM-15 durable run snapshot | existing sidecar, projection subscription, Card/history | phase, non-empty text, errorCode/message, artifacts, ids | Service monotonic merge + sidecar allow-list | succeeded truth plus `RESULT_RETRIEVAL_FAILED`; empty does not erase text | clientRequestId; one terminal promise per ActiveRun | V04, V05 |
| Restart retry | AC-07 | existing Session sidecar reader | existing `rehydrateSession` IPC returns sanitized projections | Service rehydrate and same terminal resolver | clientRequestId, providerRunId, sessionId, toolName, profile, prior text/error | Main continuation/sidecar adapter | no row/mismatch ignored; retry failure stays unavailable | clientRequestId/providerRunId; never tools/call | V05 |
| KEEP boundaries | AC-08, AC-09, DOD-04 | existing Local/Expert/File/Provider owners | existing contracts | existing consumers | no new fields outside sanitized Work DTO | guard, typecheck, regression suites, scope review | RETURN_PRD on Provider/owner conflict | existing identities | V06, V07, V08 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | New session stays collapsed across session/run/artifact updates | yes | current layout test asserts default visible | FAILED | NEW_EVIDENCE | approved product behavior replaces baseline | V01 |
| CLM-02 | AC-02 | only explicit show/file action opens and hide stays effective | yes | show/hide/preview callbacks exist | PASS | NEW_EVIDENCE | trigger ownership changes | V01 |
| CLM-03 | AC-03 | accepted boundary removes clear/switch for the lifetime of Session | yes | Selection Bar always clears | FAILED | NEW_EVIDENCE | accepted-aware UI is new | V01, V02 |
| CLM-04 | AC-04 | atomic Main lock restores, permits same tool, rejects conflicts, and migrates only accepted legacy sessions | yes | current store overwrites; RM-15 sidecar exists | FAILED | NEW_EVIDENCE | authority and migration semantics change | V02 |
| CLM-05 | AC-05 | terminal report comes from `/result` and persists in one Card | yes | result route exists but client never calls it | NOT_TESTED | NEW_EVIDENCE | Gateway/result resolver are new | V03, V04, V05 |
| CLM-06 | AC-06 | five terminal orderings converge and empty patches do not erase text | yes | delta tests pass; poll race omitted | NOT_TESTED | NEW_EVIDENCE | single terminal resolver is new | V04 |
| CLM-07 | AC-07 | unavailable result preserves succeeded/artifacts and restart retries without start | yes | artifact failure path exists; result retry absent | NOT_TESTED | NEW_EVIDENCE | recovery path is new | V04, V05 |
| CLM-08 | AC-08 | result and lock paths remain sanitized and conflicting tool never reaches Provider | yes | existing guard/sanitized IPC evidence | PASS | NEW_EVIDENCE | Main/Gateway boundaries are modified and need fresh Plan-bound proof | V02, V03, V04, V05, V07 |
| CLM-09 | AC-09 | affected Skill/Session/File/Local/Expert behavior remains intact | yes | RM-14/RM-15 and focused baseline PASS | PASS | NEW_EVIDENCE | shared Chat/service files change and need fresh Plan-bound proof | V06, V07, V08 |
| CLM-10 | AC-10 | LAT describes all three closure rules | yes | no RM-16 LAT state | NOT_TESTED | NEW_EVIDENCE | documentation is new | V09 |
| CLM-11 | DOD-01 | all C01-C07 are delivered by this canonical Plan only | yes | RM-16 has no implementation | NOT_TESTED | NEW_EVIDENCE | new work item | V01, V02, V03, V04, V05, V06, V07, V08, V09 |
| CLM-12 | DOD-02 | all blocking claims are fresh PASS before completion | yes | no RM-16 evidence ledger | NOT_TESTED | NEW_EVIDENCE | new work item | V09 |
| CLM-13 | DOD-03 | implementation has one owner per capability and no UI-only/timing workaround | yes | approved PRD boundary | PASS | NEW_EVIDENCE | implementation could violate boundary and needs fresh Plan-bound proof | V02, V04, V07 |
| CLM-14 | DOD-04 | Provider bytes/Public Run/accepted-idempotency semantics remain unchanged | yes | v1.5 consumer lock and current contract | PASS | NEW_EVIDENCE | result adapter/start gate touch boundaries and need fresh Plan-bound proof | V03, V06, V07 |
| CLM-15 | DOD-05 | Roadmap DONE is deferred to post-review evidence/status commit | yes | RM-16 currently IN_PRD | PASS | NEW_EVIDENCE | delivery state must be proven later | V09 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01, CLM-02, CLM-03, CLM-11 | COMPONENT | LOCAL | `npm --prefix apps/work exec -- vitest run src/renderer/src/screens/Chat/Chat.layout.test.tsx src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx --pool=threads --maxWorkers=1` | new/restored identity starts hidden; session/run/artifact effects stay hidden; show/file click opens; hide holds; accepted UI has no clear/switch while rejected pre-accept remains editable | previous-session visible state, background Artifact refresh, keyboard clear, rejected start | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V02 | CLM-03, CLM-04, CLM-08, CLM-11, CLM-13 | INTEGRATION | LOCAL | `npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-session-mode-store.test.ts src/main/skill-run/skill-run-ipc.test.ts src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1` | atomic first accepted tool locks; same tool is idempotent; conflict returns stable sanitized rejection before `callSkill`; reopen and accepted-sidecar migration restore lock | concurrent different tools, old provisional row without providerRunId, public setter bypass absent, cancel/fail cannot unlock | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V03 | CLM-05, CLM-08, CLM-11, CLM-14 | CONTRACT | LOCAL | `npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-gateway-client.test.ts --pool=threads --maxWorkers=1` | client uses sanitized resultPath and accepts only v1.5 Public Run Result run_id/status/nullable text; snapshot no longer supplies report text | cross-origin/internal URL, wrong run id/type, oversized/malformed/error response, raw body leakage | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V04 | CLM-05, CLM-06, CLM-07, CLM-08, CLM-11, CLM-13 | UNIT | LOCAL | `npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1` | one terminal resolver converges poll-first, SSE-first, message-before/after, and replay; `/result.text` wins; empty does not erase; exactly one finalize/telemetry/artifact pass | result GET throw/null, duplicate terminal, stale nonterminal, cancel, persistence failure; no second `callSkill` or fixed-delay oracle | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V05 | CLM-05, CLM-07, CLM-08, CLM-11 | INTEGRATION | LOCAL | `npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-continuation.test.ts src/main/skill-run/skill-run-transcript-store.test.ts src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx src/renderer/src/modules/skill-run/skill-run-transcript.test.ts --pool=threads --maxWorkers=1` | result-unavailable sidecar rehydrates through safe GET and updates same Card; report/no-text/unavailable/output-file labels are distinct; durable text/error round-trips | missing/mismatched providerRunId ignored; failed retry stays succeeded/unavailable; no tools/call/raw URL/path | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V06 | CLM-09, CLM-14, CLM-11 | REGRESSION | LOCAL | `npm --prefix apps/work exec -- vitest run src/main/expert/expert-run-service.test.ts src/main/files/upsert-skill-run-remote-artifact.test.ts src/renderer/src/screens/Chat/expertDefaultEntry.test.ts src/renderer/src/screens/Chat/session-files/SessionFilesPanel.test.tsx --pool=threads --maxWorkers=1` | Expert lifecycle, Skill artifact upsert, default-entry routing, and Session Files contents/actions remain unchanged | no Expert fallback, no direct artifact transport, no second panel owner | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V07 | CLM-08, CLM-09, CLM-13, CLM-14, CLM-11 | STATIC | LOCAL | `npm --prefix apps/work run guard` | renderer/network/runtime/i18n contract guards pass and no forbidden boundary appears | direct HTTP/JWT/URL/raw event, legacy runtime or non-English locale edits fail | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V08 | CLM-09, CLM-11 | STATIC | LOCAL | `npm --prefix apps/work run typecheck` | Node and Web TypeScript projects pass with the changed internal/preload/Renderer contracts | removed setter, result adapter, and rehydrate signatures have no stale consumers | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V09 | CLM-10, CLM-11, CLM-12, CLM-15 | DOCUMENT_SEMANTIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('lat check', cwd='apps/work', shell=True))"` | LAT links/code refs pass and final completion audit keeps RM-16 non-DONE until post-review evidence/status commit | stale default-visible/identity-mutable/snapshot-result wording or premature Roadmap DONE fails completion audit | REPO_SUMMARY | local repository | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/renderer/src/screens/Chat/useChatPanelLayout.ts#useSessionFilesVisible`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleOpenManagedPreview`
- `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx#SkillSelectionBar`
- `apps/work/src/main/skill-run/skill-run-session-mode-store.ts#setSkillRunSessionMode`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#getSkillRunService`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-continuation.ts#rehydrateSkillRunContinuationsForSession`
- `apps/work/src/main/skill-run/skill-run-transcript-store.ts#listSkillRunTranscriptForSession`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx#SkillRunTranscriptCard`
- `apps/work/src/shared/skill-run.ts#SkillRunProjection`
- `contracts/skill-run/v1.5.0/http/endpoint-matrix.json`
- `contracts/skill-run/v1.5.0/runs/public-run.schema.json`
- `contracts/skill-run/v1.5.0/runs/result.schema.json`

## Triggered Read

- If legacy lock backfill cannot identify an accepted run from existing sidecar rows: inspect `apps/work/src/main/sessions.ts#getSessionMessages` and RM-15 migration/history tests; do not infer acceptance from session-mode presence alone.
- If the Provider returns a result envelope not accepted by the locked schema: stop with `RETURN_PRD`; do not widen `extractResultText` or inspect live/internal payloads.
- If terminal recovery needs a new Renderer command: first prove the existing `rehydrateSession` path cannot safely retry; otherwise do not add an IPC channel.
- If result diagnostics require new stored fields: first reuse succeeded phase plus existing sanitized `errorCode/errorMessage`; only change schema after proving those fields cannot distinguish unavailable from no-text.
- If a file-preview path is not user initiated: keep it from setting Session Files visible rather than adding a background exception.
- Otherwise: do not read Managed Runtime, Provider implementation, archived PRDs, build output, runtime data, or reference applications.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Chat/useChatPanelLayout.ts#useSessionFilesVisible` | PROD | MODIFY | Chat layout | T1 | per-view/session hidden default and identity reset; no global visible inheritance | Session Files explicit-open visibility | no |
| C01 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleOpenManagedPreview` | PROD | MODIFY | Chat/File preview integration | T1 | explicit file/show actions set visible; background state does not | Session Files explicit-open visibility | no |
| C01 | `apps/work/src/renderer/src/screens/Chat/Chat.layout.test.tsx` | TEST | MODIFY | Chat layout tests | T1 | product rule replaces default-visible expectation | Session Files explicit-open visibility | no |
| C02 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | PROD | MODIFY | Chat selection owner | T1 | selection remains local before accepted and becomes locked from Main mode/accepted result | Accepted-aware Skill Selection Bar | no |
| C02 | `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx#SkillSelectionBar` | PROD | MODIFY | Skill selection presentation | T1 | locked state has no clear action and correct a11y semantics | Accepted-aware Skill Selection Bar | no |
| C02 | `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx` | TEST | MODIFY | Skill selection tests | T1 | editable and locked states are both proven | Accepted-aware Skill Selection Bar | no |
| C02 | `apps/work/src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx` | TEST | MODIFY | Chat Skill integration tests | T1 | accepted/rejected selection and file-click panel behavior are proven | Accepted-aware Skill Selection Bar | no |
| C03 | `apps/work/src/main/skill-run/skill-run-session-mode-store.ts` | PROD | MODIFY | Main session-mode store | T2 | atomic first-accepted lock, same-tool idempotency, legacy accepted backfill, conflict result | Main authoritative session skill lock | no |
| C03 | `apps/work/src/main/skill-run/skill-run-session-mode-store.test.ts` | TEST | ADD | Main session-mode store tests | T2 | focused transaction/migration/conflict coverage | Main authoritative session skill lock | yes |
| C03 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | Main Skill lifecycle | T2 | invokes Main-only atomic lock after binding and before accepted start side effects | Main authoritative session skill lock | no |
| C03 | `apps/work/src/main/skill-run/skill-run-ipc.ts#getSkillRunService` | PROD | MODIFY | Main Skill composition | T2 | injects lock owner and removes public mutable setter registration | Main authoritative session skill lock | no |
| C03 | `apps/work/src/main/skill-run/skill-run-ipc.test.ts` | TEST | MODIFY | Skill IPC tests | T2 | lock composition, sanitized conflict, and removed bypass are proven | Main authoritative session skill lock | no |
| C03 | `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS` | PROD | MODIFY | Work sanitized IPC contract | T2 | mutable SET_SESSION_MODE surface removed; read-only restore remains | Main authoritative session skill lock | no |
| C03 | `apps/work/src/shared/skill-run.ts#SkillRunApi` | PROD | MODIFY | Work sanitized API contract | T2 | Renderer cannot write session mode | Main authoritative session skill lock | no |
| C03 | `apps/work/src/preload/skill-run-api.ts#createSkillRunApi` | PROD | MODIFY | Preload Skill bridge | T2 | setter removed; start/getSessionMode remain sanitized | Main authoritative session skill lock | no |
| C04 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient` | PROD | MODIFY | Main Gateway contract | T2 | adds typed Public Run Result read and removes result text from snapshot contract | v1.5.0 Public Run Result adapter | no |
| C04 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | PROD | MODIFY | Main Gateway adapter | T2 | strict same-origin `resultPath` GET parses only run_id/status/nullable text | v1.5.0 Public Run Result adapter | no |
| C04 | `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts` | TEST | MODIFY | Gateway contract tests | T2 | result/snapshot separation and negative response cases are proven | v1.5.0 Public Run Result adapter | no |
| C05 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | Main Skill lifecycle | T2 | one in-flight terminal resolver, non-empty text merge, one finalize/abort/telemetry/artifact pass | Order-independent terminal resolver and monotonic text | no |
| C05 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | Skill lifecycle tests | T2 | terminal ordering, null/error, stale, cancel, and no-duplicate matrices are proven | Order-independent terminal resolver and monotonic text | no |
| C06 | `apps/work/src/main/skill-run/skill-run-continuation.ts#rehydrateSkillRunContinuationsForSession` | PROD | MODIFY | Existing Skill recovery entry | T3 | adds sidecar result-unavailable candidates and reuses service result resolution without tools/call | Result closure presentation/recovery | no |
| C06 | `apps/work/src/main/skill-run/skill-run-continuation.test.ts` | TEST | ADD | Skill recovery tests | T3 | terminal sidecar safe-retry and dedupe coverage | Result closure presentation/recovery | yes |
| C06 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx#SkillRunTranscriptCard` | PROD | MODIFY | Existing Skill Card | T3 | report, no-text, unavailable, and output-file labels cannot imply false readiness | Result closure presentation/recovery | no |
| C06 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx` | TEST | MODIFY | Skill Card tests | T3 | result/error/artifact semantics and file callback are proven | Result closure presentation/recovery | no |
| C06 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.test.ts` | TEST | MODIFY | Projection-to-Card adapter tests | T3 | succeeded plus result diagnostic remains sanitized and durable | Result closure presentation/recovery | no |
| C06 | `apps/work/src/shared/i18n/locales/en/skillRun.ts` | PROD | MODIFY | English source locale | T3 | output-file and unavailable/no-text copy are distinct | Result closure presentation/recovery | no |
| C07 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | Work Skill Run LAT | T4 | documents explicit-open, accepted lock, result convergence, and failure truth | Test specification and LAT status | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `useSessionFilesVisible` owns the wrong global default and all user file paths converge at `handleOpenManagedPreview` | change one existing hook and one shared callback; no per-file caller guards or new panel state owner |
| C02 | MODIFY_EXISTING | Chat already owns selectedSkill and restores Main mode; Selection Bar owns the only clear affordance | add one accepted/locked state through existing props; no second selection store |
| C03 | MODIFY_EXISTING | existing SQLite table, service accepted boundary, and IPC composition already carry session/tool identity | convert existing persistence to atomic write-once and remove mutable Renderer setter; no new identity table/channel |
| C04 | MODIFY_EXISTING | existing client already sanitizes and stores `resultPath` while the locked Bundle supplies the exact result schema | one method on the existing client is smaller and safer than a new result client or snapshot guessing |
| C05 | MODIFY_EXISTING | poll and SSE share `ActiveRun` but independently finalize through the same service | hoist terminal success into one promise/owner and refactor abort timing; no delay workaround or parallel lifecycle |
| C06 | MODIFY_EXISTING | succeeded error fields, RM-15 sidecar, rehydrate entry, Card, and English locale already carry all safe data/actions | reuse a stable result error code and existing rehydrate IPC; no result store or public retry transport |
| C07 | MODIFY_EXISTING | `lat.md/skill-run.md` is the current Skill Run SOT and existing suites cover each affected owner | update one LAT node and focused existing tests; only add tests for previously untested store/recovery modules |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T2 | C03,C04,C05 | `apps/work/src/main/skill-run/skill-run-session-mode-store.ts`<br>`apps/work/src/main/skill-run/skill-run-session-mode-store.test.ts`<br>`apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts`<br>`apps/work/src/main/skill-run/skill-run-ipc.ts#getSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-ipc.test.ts`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.test.ts`<br>`apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS`<br>`apps/work/src/shared/skill-run.ts#SkillRunApi`<br>`apps/work/src/preload/skill-run-api.ts#createSkillRunApi` | `contracts/skill-run/v1.5.0/http/endpoint-matrix.json`<br>`contracts/skill-run/v1.5.0/runs/public-run.schema.json`<br>`contracts/skill-run/v1.5.0/runs/result.schema.json`<br>`apps/work/src/main/skill-run/skill-run-transcript-store.ts#listSkillRunTranscriptForSession` | - | no |
| T1 | C01,C02 | `apps/work/src/renderer/src/screens/Chat/useChatPanelLayout.ts#useSessionFilesVisible`<br>`apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleOpenManagedPreview`<br>`apps/work/src/renderer/src/screens/Chat/Chat.layout.test.tsx`<br>`apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`<br>`apps/work/src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx`<br>`apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx#SkillSelectionBar`<br>`apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx` | `apps/work/src/shared/skill-run.ts#SkillRunApi`<br>`apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | T2 | no |
| T3 | C06 | `apps/work/src/main/skill-run/skill-run-continuation.ts#rehydrateSkillRunContinuationsForSession`<br>`apps/work/src/main/skill-run/skill-run-continuation.test.ts`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx#SkillRunTranscriptCard`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx`<br>`apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.test.ts`<br>`apps/work/src/shared/i18n/locales/en/skillRun.ts` | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-transcript-store.ts#listSkillRunTranscriptForSession`<br>`apps/work/src/shared/skill-run.ts#SkillRunProjection` | T2 | no |
| T4 | C07 | `apps/work/lat.md/skill-run.md` | `apps/work/src/renderer/src/screens/Chat/Chat.tsx`<br>`apps/work/src/main/skill-run/skill-run-session-mode-store.ts`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts`<br>`apps/work/src/main/skill-run/skill-run-service.ts`<br>`apps/work/src/main/skill-run/skill-run-continuation.ts`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx` | T1,T2,T3 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | T1 | sole integration point for panel intent, preview actions, selection restore, accepted state, and removal of Renderer mode writes |
| `apps/work/src/main/skill-run/skill-run-service.ts` | T2 | sole lifecycle owner joins atomic lock, poll/SSE success, result fetch, monotonic projection, abort, telemetry, persistence, and artifacts |
| `apps/work/src/main/skill-run/skill-run-ipc.ts` | T2 | sole Main composition point removes mutable setter and injects store lock without widening Renderer data |
| `apps/work/src/shared/skill-run.ts` | T2 | sanitized contract removes the mutable setter surface while preserving projection and read-only restore |
| `apps/work/src/main/skill-run/skill-run-continuation.ts` | T3 | existing rehydrate path is the only restart retry coordinator; it must not create a second start or history owner |

## Generated Outputs Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C03 | `apps/work/src/main/skill-run/skill-run-session-mode-store.test.ts` | the production store has no focused test owner; atomic transaction, schema upgrade, accepted-sidecar backfill, idempotent same-tool and conflict behavior cannot be isolated safely in IPC tests | test-only under the existing Main session-mode owner; no production owner added |
| C06 | `apps/work/src/main/skill-run/skill-run-continuation.test.ts` | the recovery module has no focused suite; terminal sidecar retry, continuation merge and no-second-start behavior span neither the pure Service unit nor Renderer Card tests | test-only under the existing Skill recovery owner; no production owner added |

## Todo T1 — Session Files intent and accepted-aware selection

**Owns Changes**
- C01
- C02

**Goal**

Make Chat panel visibility follow explicit user intent and make the current Skill editable only until Main accepts the first request for that Session.

**Immediate anchors**
- `useChatPanelLayout.ts#useSessionFilesVisible`
- `Chat.tsx#handleOpenManagedPreview`
- `Chat.tsx#Chat`
- `SkillSelectionBar.tsx#SkillSelectionBar`

**Changes**
- Replace the cross-session default-visible localStorage behavior with hidden initial state that resets on Chat/session identity changes. Preserve existing show/hide controls; sessionId, run projection, Artifact refresh, focus, and cache signals never set visible.
- Route only explicit show and user-initiated file/preview actions through the existing visibility setter. Keep the common managed-preview callback as the root cause location so MessageList, Skill/Expert artifact, document-created, and Session Files clicks behave consistently; exclude any discovered background caller.
- Track whether the selected Skill came from a Main locked session or a just-accepted start. Remove both Renderer `setSessionMode` calls. Before accepted, Catalog selection and clear remain local; after accepted/getSessionMode, preserve the locked selection and ignore replacement/clear attempts.
- Add a locked prop/state to the existing Selection Bar. Do not render the clear button while locked, preserve readable current-skill text, and verify keyboard/a11y semantics.
- Update existing layout/selection/Chat integration tests to replace default-visible assertions and prove accepted versus rejected selection behavior without changing Catalog ownership.

**Stop conditions**
- [ ] V01 PASS.
- [ ] A new session remains hidden after sessionId, accepted, terminal, and Artifact updates.
- [ ] Only explicit show/file action opens; hide is not undone by effects.
- [ ] Rejected pre-accepted selection remains editable; accepted selection has no clear/switch action.
- [ ] No Renderer session-mode mutation API call remains.

**Triggered reads**
- If a `handleOpenManagedPreview` caller is background-only, keep that caller from opening Session Files and record the exception in its focused test.
- If Chat does not remount on tab/session switch, key/reset the existing hook by resolved session identity; do not add global store state.

## Todo T2 — Main session lock and terminal result resolver

**Owns Changes**
- C03
- C04
- C05

**Goal**

Enforce Skill identity at the Main accepted boundary and make one SkillRunService resolver own every successful poll/SSE/result terminal transition.

**Immediate anchors**
- `skill-run-session-mode-store.ts#setSkillRunSessionMode`
- `skill-run-ipc.ts#getSkillRunService`
- `skill-run-service.ts#createSkillRunService`
- `skill-run-service.ts#updateProjection`
- `skill-run-service.ts#pollStatus`
- `skill-run-service.ts#consumeSse`
- `skill-run-gateway-client.ts#SkillRunGatewayClient`
- `skill-run-gateway-client.ts#createSkillRunGatewayClient`

**Changes**
- Evolve the existing session-mode table in place with explicit locked state. In one SQLite transaction, backfill legacy identity from the earliest sidecar run with non-null providerRunId, ignore a provisional row with no accepted evidence, insert the first accepted validated tool, return existing state for the same tool, and return a typed conflict for a different tool.
- Replace the mutable store setter with an internal lock result. Inject it through the existing Service composition. Invoke it after catalog/schema/attachment validation and validated tool binding, before accepted run creation or asynchronous `callSkill`; map conflict to stable `SKILL_SESSION_TOOL_LOCKED`. A local accepted run remains locked through later Provider failure/cancel/success.
- Remove `SET_SESSION_MODE` from shared channels/API, Preload bridge, IPC registration, and Renderer consumers. Retain read-only get and Session deletion clear behavior. Prove a direct conflicting start cannot reach Gateway.
- Add `getRunResult(runId)` to the existing Gateway interface/factory. Use only the sanitized per-run `resultPath`, bounded authorized GET, and the locked Public Run Result fields. Validate returned run identity/status/type; stop extracting report-like content from Public Run snapshot.
- Add one in-flight successful-terminal promise/flag to ActiveRun. Route poll succeeded and SSE succeeded through it; preserve live delta/message patches, fetch result, prefer non-empty `result.text`, never overwrite non-empty text with empty/undefined, and commit succeeded/telemetry/artifact discovery/abort exactly once.
- On nullable empty result, keep current legitimate live text or emit completed-without-text stage. On safe GET error, finalize Provider truth as succeeded with sanitized `RESULT_RETRIEVAL_FAILED`/message, preserve artifacts and text, and leave enough sanitized identity for T3 restart retry.
- Keep non-success terminal/cancel behavior monotonic and independently finalized. Do not introduce a timeout-based oracle, duplicate `callSkill`, raw response persistence, or Provider schema change.

**Stop conditions**
- [ ] V02, V03, and V04 PASS.
- [ ] Atomic same-tool/conflict/migration cases pass and conflict produces zero Gateway calls.
- [ ] Public Run snapshot no longer acts as Result; strict `/result` adapter negatives pass.
- [ ] All five event-order cases end with identical report and exactly one terminal side-effect set.
- [ ] Result error/null cannot erase text, change succeeded truth, hide artifacts, or create another Run.

**Triggered reads**
- If SQLite lacks the sidecar table, make migration conditional and leave legacy rows provisional; do not fabricate accepted evidence.
- If typed Service lock callback cannot carry title from the bound catalog item, use that existing item; do not add Renderer title authority.
- If result payload diverges from v1.5.0 schema, stop `RETURN_PRD` rather than widening recursive extraction.

## Todo T3 — Result recovery and transcript presentation

**Owns Changes**
- C06

**Goal**

Recover a failed terminal result read through the existing Session rehydrate path and present report, no-text, unavailable, and output-file states without false readiness.

**Immediate anchors**
- `skill-run-continuation.ts#rehydrateSkillRunContinuationsForSession`
- `skill-run-transcript-store.ts#listSkillRunTranscriptForSession`
- `skill-run-service.ts#rehydrate`
- `SkillRunTranscriptCard.tsx#SkillRunTranscriptCard`
- `skillRun.ts`

**Changes**
- Extend existing rehydrate orchestration to inspect the sanitized sidecar batch after normal continuation recovery. Select only succeeded rows with providerRunId and `RESULT_RETRIEVAL_FAILED`, dedupe by clientRequestId, and pass them to the existing Service rehydrate/result resolver. Never call start or reopen SSE for this terminal retry.
- Reuse existing projection/sidecar `errorCode/errorMessage` for unavailable state. Successful retry clears only the result diagnostic and updates the same request Card; failed retry remains succeeded/unavailable and is safe to retry on the next rehydrate.
- Keep valid non-empty historical/live text during retry. Do not retry completed-without-text rows or rows with missing/mismatched identifiers.
- Update the existing Card and English source locale so report text, completed-without-text, result-unavailable, and downloadable output-file states are distinct. Artifact buttons describe opening an output file, not generic result readiness, and continue to invoke existing File preview callbacks.
- Add focused recovery tests and extend Card/adapter tests for sanitized round-trip, duplicate rehydrate, retry success/failure, and no-second-run behavior.

**Stop conditions**
- [ ] V05 PASS.
- [ ] Reopen retries only unavailable terminal rows and performs zero `callSkill` calls.
- [ ] Successful retry updates the same clientRequestId; failed retry remains succeeded and sanitized.
- [ ] Artifact button no longer asserts report readiness; File preview remains unchanged.
- [ ] No new result store, history API, or public retry IPC exists.

**Triggered reads**
- If sidecar list failure occurs, preserve normal continuation/history behavior and skip terminal retry; do not fail Session open.
- If Service rehydrate cannot accept sanitized error state, extend its existing internal input under T2; do not add a second recovery service.

## Todo T4 — LAT and governed regression closure

**Owns Changes**
- C07

**Goal**

Update the Work Skill Run SOT after implementation and close all focused, boundary, type, regression, and delivery-state evidence without marking RM-16 DONE early.

**Immediate anchors**
- `apps/work/lat.md/skill-run.md`
- `docs/work/PRD-WORK-v4.0.1-M6j-skill-session-ux-terminal-result-closure.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`

**Changes**
- Document Session Files explicit-open-only behavior, accepted-time Main lock, v1.5 Public Run status versus Result separation, single terminal resolver, non-empty text monotonicity, and result-unavailable recovery while preserving succeeded truth.
- Run V01–V09 through `smc-plan-delivery`; record fresh evidence against the final scope fingerprint. Treat unrelated dirty Managed Runtime paths as excluded scope, not RM-16 evidence.
- Confirm the implementation diff contains no Provider Bundle, Managed Runtime, Local/Expert lifecycle, second owner, raw transport, or non-English locale changes.
- Keep Roadmap RM-16 `IN_PRD`/later delivery status until implementation review and all blocking evidence pass; the separate Roadmap status commit is outside the implementation commit.

**Stop conditions**
- [ ] V01–V09 are FRESH PASS and CLM-01–CLM-15 are PASS.
- [ ] `lat check`, guard, and both typecheck projects pass.
- [ ] Completion audit and implementation review are FRESH PASS with no forbidden owner/contract changes.
- [ ] Implementation commit excludes RM-16 DONE; status update remains a separate delivery step.

**Triggered reads**
- If verification reveals an existing unrelated failure, classify and record it without modifying out-of-scope Managed Runtime work.
- If any change requires Provider bytes/Public Run shape/raw IPC/new owner, stop with `RETURN_PRD`.

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`. LOCAL tests use the committed v1.5.0 Bundle and deterministic fake authorized transport; no live Provider credentials or environment discovery are required by this Plan.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; V01 through V09 FRESH PASS; CLM-01 through CLM-15 PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07, V08, V09 through SMC evidence ledger plus durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but one or more Todo, audit, review, verification, claim, or manifest states are pending/stale | pending/stale Todo, V01-V09, CLM-01-CLM-15, audit/review/manifest ids |
| BLOCKED | environment/dependency prevents implementation or proof after in-scope retries | blocker record with command, owner, and non-secret diagnostic |
| RETURN_PRD | approved Provider/owner/accepted/result boundary conflicts with source reality | PRD revision request; no Plan-local architecture repair |
