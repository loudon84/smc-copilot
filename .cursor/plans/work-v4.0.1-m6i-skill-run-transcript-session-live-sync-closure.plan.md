---
name: RM-15 Skill Run Transcript Session Live-Sync Closure
overview: Close the existing Skill Run to Chat and Session loop with an optimistic/live Skill Card, Session-owned durable sanitized execution audit, complete Prompt history, and cache-only Sidebar live sync. Keep Provider raw events, streaming delta, and second Chat/Session/File owners out.
todos:
  - id: t1-skill-lifecycle-durable-sanitized-delta
    content: "T1 — Skill lifecycle durable sanitized delta [C01]"
    status: completed
  - id: t2-session-owned-skill-execution-audit
    content: "T2 — Session-owned Skill execution audit [C02]"
    status: completed
  - id: t3-complete-prompt-and-persistence-integration
    content: "T3 — Complete Prompt and persistence integration [C03]"
    status: completed
  - id: t4-existing-session-history-merge-and-delete
    content: "T4 — Existing Session history merge and delete [C04]"
    status: completed
  - id: t5-existing-chat-skill-transcript-card
    content: "T5 — Existing Chat Skill transcript card [C05]"
    status: completed
  - id: t6-session-cache-signal-and-sidebar-refresh
    content: "T6 — Session cache signal and Sidebar refresh [C06]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: RM-15
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: AD-WORK-v4.0.1-SKILL-RUN-TRANSCRIPT-LIVE-SYNC@1.0.0/RM-15
grounded_commit: 7c9e295b3b773539c769772953d47c0c43f47c12
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# RM-15 Skill Run Transcript & Session Live-Sync Closure Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6i-skill-run-transcript-session-live-sync-closure.md)

## Scope

- In: Main pre-cap sanitized run/activity persistence callbacks; Existing Session-owned same-DB execution-audit sidecar; complete Prompt and readable fallback message materialization; existing `getSessionMessages()` merge/delete; optimistic and live/history Skill Card in the existing Chat transcript; all projections for one Session in the Renderer store; sanitized session-cache mutation notification; Sidebar cache-only refresh; restart, replay, 100-activity, multi-run, cleanup, security, and affected regression evidence.
- Out: Provider Bundle or endpoint changes; raw Provider event persistence/IPC; a second Chat, Session database, session list, history IPC, or File store; Hermes `tool_calls` reuse for NoDeskClaw activity; streaming/token delta; clarify response; tool arguments/output exposure; Artifact transport rewrite; Expert removal; Local Chat behavior changes; RM-13/RM-14 implementation or status changes.
- Production Owner inherited from PRD: Main `SkillRunService`/parser owns lifecycle and sanitized delta. Existing Main Session persistence owns messages, sidecar, history merge, and delete. Existing Chat/MessageList owns Skill Card presentation. Existing session-cache plus Main IPC/Preload and Sidebar owns cache mutation notification and cache-only reread. Continuation, File Platform, approval command, Local Chat, Expert, and Provider contracts keep their current owners.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | `ActiveRun.request` retains complete Prompt; parsed activity becomes `SkillRunActivityItem` then `appendSanitizedActivity` caps Projection at 32; only continuation callback exists | `createSkillRunService`, SSE activity branch, `updateProjection` | `skill-run-ipc.ts#getSkillRunService` is the sole production composition root | reuse parser and typed activity; add injected Main-only callbacks before cap; never persist raw parser payload | PASS |
| C02 | Existing Session persistence in `apps/work/src/main/sessions.ts` | one `state.db` owns sessions/messages/local overlays/continuation; no typed Skill execution timeline exists | add internal `skill-run-transcript-store.ts` under this owner | C01 callbacks write it; C04 sole history loader reads it; existing delete owns cleanup | no existing message field preserves Work event/call identity without corrupting Hermes `tool_calls`; same-DB sidecar is minimum | PASS |
| C03 | `skill-run-session-materialize.ts#materializeSkillRunSessionTranscript` | accepted projections write normal rows, but user/title use `promptSummary`; assistant is readable fallback | existing materializer, deterministic bubble ids, assistant content builder | `broadcastProjection` currently invokes materializer; service owns complete Prompt | reuse deterministic ids, title/cache policy, and ordinary fallback; pass Prompt only through Main callback | PASS |
| C04 | `sessions.ts#getSessionMessages` and `#deleteSessionRows` | one history IPC expands Hermes rows plus overlays/continuation; delete removes existing children/messages/session; no Skill item | `HistoryItem`, `expandRowsToHistory`, `getSessionMessages`, `deleteSessionRows` | Preload history call and `dbItemsToChatMessages` are the resume path | extend this loader with one batched sidecar read and deterministic fallback replacement; no new IPC | PASS |
| C05 | `Chat.tsx#submitSkill`, `MessageList`, and `modules/skill-run/store.ts` | submit awaits Main and rejection is toast-only; store is request-keyed but exposes only latest per Session; StatusBar is outside transcript | `submitSkill`, `handleSubmitOrQueue`, `ChatMessage`, `MessageList`, latest selector | existing projection listener receives every bounded Projection; history mapper is DB-to-Chat entry | add one Skill union/card/adapter and ordered per-Session selector; identity remains clientRequestId | PASS |
| C06 | `session-cache.ts#upsertCachedSession` and `SidebarRecentSessions` | profile cache writes have no Renderer notification; Sidebar event/focus/timer paths call full `syncSessionCache()` | `writeCache`, upsert/remove/title, Sidebar refresh/effects | `ipc/register.ts` owns cache IPC; Preload exposes list/sync/title/delete; Sidebar has loaded-window helpers | add sanitized event and call `listCachedSessions` only; bypass full-sync throttle for this hint | PASS |
| C07 | continuation, StatusBar, File, approval, clarify, Local/Expert, Provider, RM-13/RM-14 | existing or explicitly deferred; RM-13/RM-14 BACKLOG | PRD Source Anchors | transcript may call only existing approval/File APIs; recovery stays continuation-owned | KEEP with targeted regressions and scope proof | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | 选择Skill并发送后，在Main返回accepted前，中央Chat立即显示完整user Prompt和一个pending Skill Card；start拒绝/异常原位变为失败且不重复。 | LIFECYCLE | C05 | T5 | V05 | UNIT | yes |
| AC-02 | AC | reasoning、tool call、approval、clarify、phase、Result和Error随Projection实时进入同一Card；相同clientRequestId始终一张Card，同callId原位更新且相同eventId不重复。 | BEHAVIOR | C01, C05 | T1, T5 | V01, V05 | UNIT | yes |
| AC-03 | AC | 同一Session连续执行Skill A、A、B后，Live和reopen均按稳定顺序显示三个独立Card；身份只使用三个不同clientRequestId。 | LIFECYCLE | C02, C04, C05 | T2, T4, T5 | V02, V04, V05 | UNIT | yes |
| AC-04 | AC | 产生100条已枚举activity时，任一Live Projection最多32条，关闭并重开Session后恢复100条且无重复；durable payload不含raw Provider字段。 | BEHAVIOR | C01, C02, C04 | T1, T2, T4 | V01, V02, V04 | UNIT | yes |
| AC-05 | AC | 超过120字符的首条Prompt在reopen后逐字保持；Sidebar title由完整Prompt按现有title policy产生，Projection仍可只保留summary。 | BEHAVIOR | C03, C04 | T3, T4 | V03, V04 | UNIT | yes |
| AC-06 | AC | accepted Skill Session无需refresh/focus/slow timer，在500ms产品预算内出现在Sidebar；更新通知只触发cache list，不触发full DB sync。 | LIFECYCLE | C03, C06 | T3, T6 | V03, V06 | UNIT | yes |
| AC-07 | AC | 运行中退出并重启后恢复原Run和原Card，不发第二次tools/call；SSE replay不重复activity或Result；terminal后history仍在。 | LIFECYCLE | C01, C02, C04, C05, C07 | T1, T2, T4, T5 | V01, V02, V04, V05, V08 | UNIT | yes |
| AC-08 | AC | 历史加载有sidecar时不显示匹配assistant fallback副本；无sidecar的旧Session仍正常显示普通user/assistant rows。 | BEHAVIOR | C04, C05 | T4, T5 | V04, V05 | UNIT | yes |
| AC-09 | AC | 删除Session后对应run/activity sidecar均删除；DB不可用/写失败不改变Provider terminal truth，且不会宣称缺失timeline完整。 | NEGATIVE | C01, C02, C04, C06 | T1, T2, T4, T6 | V01, V02, V04, V06 | UNIT | yes |
| AC-10 | AC | Approval操作仍调用现有decision API且幂等；Clarify只读；Artifact操作仍只经File Platform，Artifact discovery failure不改变Run succeeded。 | BEHAVIOR | C05, C07 | T5 | V05, V08 | UNIT | yes |
| AC-11 | AC | Renderer/Preload无法取得raw Provider event、Provider endpoint、auth token、tool arguments/output、artifact bytes或本机绝对路径；Sidebar事件不含Prompt/Result。 | SECURITY | C01, C02, C04, C05, C06 | T1, T2, T4, T5, T6 | V01, V02, V04, V05, V06 | UNIT | yes |
| AC-12 | AC | Local Chat send/stream/reasoning/tool/history、Expert reader/history、remote session、Attachment和现有Skill StatusBar/cancel/retry均无回归；RM-13/RM-14状态与合同均不变。 | SCOPE | C07 | - | V08, V09 | UNIT | yes |
| DOD-01 | DOD | C01–C06全部由canonical Plan、Completion Audit、Implementation Review和FRESH blocking verification证明；C07通过既有证据复用与受影响回归证明。 | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2, T3, T4, T5, T6 | V01, V02, V03, V04, V05, V06, V08, V09 | UNIT | yes |
| DOD-02 | DOD | CL-01–CL-12全部PASS；任何FAILED/NOT_TESTED blocking claim不得以deferred理由进入DONE。 | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2, T3, T4, T5, T6 | V01, V02, V03, V04, V05, V06, V08, V09 | UNIT | yes |
| DOD-03 | DOD | Verification至少覆盖immediate/reject、live activity/result/error、100 activity、multi-run、restart/replay、history fallback replacement、Sidebar cache-only refresh、delete/failure/security以及Local/Expert/File/Approval回归。 | EVIDENCE | C01, C02, C03, C04, C05, C06, C07 | T1, T2, T3, T4, T5, T6 | V01, V02, V03, V04, V05, V06, V08 | UNIT | yes |
| DOD-04 | DOD | implementation commit不得包含RM-15 DONE；Roadmap状态在evidence manifest可解析且implementation commit存在后独立更新。 | OPERATIONS | C05, C06 | T5, T6 | V09 | DOCUMENT_SEMANTIC | yes |
| DOD-05 | DOD | 若实施需要第二Session/history IPC、raw event、Hermes tool_calls复用、Provider合同变化、streaming delta、clarify response或Artifact transport重写，必须RETURN_ARCHITECTURE/RETURN_PRD，不得混入。 | SCOPE | C07 | - | V09 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Optimistic Skill turn | AC-01, AC-02 | Chat submit after local validation | full user bubble plus pending card keyed by clientRequestId | bounded Projection upserts same card | reject/throw patches same card; cancel stays existing Skill cancel | V05 |
| Durable execution | AC-03, AC-04, AC-05, AC-09 | accepted run and every sanitized activity before cap | run row plus immutable activity rows; auditComplete tracks gaps | C01 callbacks through Existing Session store | writer failure is logged/marked incomplete without changing Provider phase | V01, V02, V03, V04 |
| Reopen/restart | AC-07, AC-08 | existing history call and continuation rehydrate | continuation plus sidecar merge to one request card | terminal sidecar replaces matching assistant fallback | missing sidecar uses ordinary messages; no second start | V04, V05, V08 |
| Sidebar visibility | AC-06 | successful cache mutation | sanitized cache-change event | Sidebar rereads cache list and applies window | failed write emits no event; full sync remains focus/timer-only | V06 |
| Session deletion | AC-09 | existing single/batch delete | transaction deletes sidecar children before Session | existing delete owner plus cache cleanup/event | rollback preserves rows | V02, V04, V06 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Sanitized durable delta | AC-02, AC-04, AC-07, AC-09, AC-11 | SkillRunService after parser, before cap | Main-only typed run/activity callback and ordinal | Existing Session transcript store | request/session/tool/full Prompt; eventId/kind/allow-listed optional fields | service allow-list plus store validation | non-fatal callback error sets later auditComplete false; unknown/raw ignored | clientRequestId; `(clientRequestId,eventId)` | V01, V02 |
| Compatible messages | AC-01, AC-05, AC-08 | Main persistence composition | existing sessions/messages and deterministic `skill-run:{clientRequestId}:user/assistant` ids | existing history/legacy clients | exact Prompt and readable assistant fallback | materializer and title policy | DB absent preserves cache/live fallback | deterministic platform id upsert | V03, V04 |
| Sidecar history merge | AC-03, AC-04, AC-07, AC-08, AC-11 | transcript store batch query | internal `HistoryItem.kind=skill_run` via existing history IPC | history mapper and MessageList | sanitized run, ordered activities, auditComplete, artifact descriptors | Main loader | no sidecar returns ordinary rows; incomplete stays labeled | request id replaces matching fallback; stable time/ordinal order | V02, V04, V05 |
| Live Skill Card | AC-01, AC-02, AC-03, AC-10 | Chat optimistic insert plus projection store | existing bounded listener and Chat union | existing MessageList card | request/tool/phase/stage/activity/result/error/artifacts | existing IPC plus adapter | reject patches same card | request card; callId compaction; eventId dedupe | V05 |
| Session cache changed | AC-06, AC-11 | successful Main cache mutation | `session-cache:changed` `{sessionId, reason}` with created/updated/deleted | Sidebar | non-empty id and enum only | shared guard | invalid dropped; failed write no event | event hint; cache list is idempotent SOT | V06 |
| KEEP boundaries | AC-10, AC-12, DOD-05 | existing owners | existing contracts | existing consumers | no new fields | regression/scope checks | return Architecture/PRD on conflict | existing identities | V08, V09 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | complete user Prompt and one pending card appear before Main result; reject patches same card | yes | current submit has no transcript insert and toast-only reject | FAILED | NEW_EVIDENCE | Chat submit lifecycle changes | V05 |
| CLM-02 | AC-02 | typed live activity/result/error updates one card with event/call dedupe | yes | RM-08/RM-09 parser and approval tests | PASS | NEW_EVIDENCE | new adapter/card consumes DTO | V01, V05 |
| CLM-03 | AC-03 | A/A/B produces three ordered cards live and reopened | yes | current store exposes latest only | NOT_TESTED | NEW_EVIDENCE | per-Session selector and sidecar are new | V02, V04, V05 |
| CLM-04 | AC-04 | live stays 32 while durable reopen restores 100 unique sanitized activities | yes | RM-08 cap test | PASS | NEW_EVIDENCE | pre-cap durable path is new | V01, V02, V04 |
| CLM-05 | AC-05 | over-120 Prompt and title round-trip exactly | yes | materializer uses promptSummary | FAILED | NEW_EVIDENCE | materializer input changes | V03, V04 |
| CLM-06 | AC-06 | accepted Session reaches Sidebar within 500ms by cache list only | yes | Sidebar needs focus/timer/full sync | FAILED | NEW_EVIDENCE | cache event is new | V03, V06 |
| CLM-07 | AC-07 | restart/replay restores same card with no second start or duplicate event/result | yes | RM-04 continuation/idempotency tests | PASS | NEW_EVIDENCE | sidecar/history added beside recovery | V01, V02, V04, V05, V08 |
| CLM-08 | AC-08 | sidecar replaces matching fallback and legacy rows remain | yes | ordinary history behavior | PASS | NEW_EVIDENCE | new HistoryItem/replacement | V04, V05 |
| CLM-09 | AC-09 | delete leaves no sidecar and write gaps do not alter Provider truth/claim completeness | yes | delete has no sidecar cleanup | NOT_TESTED | NEW_EVIDENCE | new persistent data | V01, V02, V04, V06 |
| CLM-10 | AC-10 | approval/File/clarify remain on current owners | yes | RM-05/RM-09 suites | PASS | NEW_EVIDENCE | card adds presentation/action entry | V05, V08 |
| CLM-11 | AC-11 | new payloads contain no forbidden raw/secret/path/byte fields | yes | sanitized Projection/telemetry tests | PASS | NEW_EVIDENCE | sidecar/history/event are new | V01, V02, V04, V05, V06 |
| CLM-12 | AC-12 | affected regressions pass and RM-13/RM-14 remain BACKLOG | yes | current suites and Roadmap v2.4 | PASS | NEW_EVIDENCE | shared surfaces affected | V08, V09 |
| CLM-13 | DOD-01 | C01-C06 and KEEP C07 have governed fresh proof | yes | no RM-15 implementation evidence | NOT_TESTED | NEW_EVIDENCE | new Item | V01, V02, V03, V04, V05, V06, V08, V09 |
| CLM-14 | DOD-02 | every blocking claim is PASS before DONE | yes | no RM-15 completion audit | NOT_TESTED | NEW_EVIDENCE | new Item | V08 |
| CLM-15 | DOD-03 | required lifecycle/data/failure/security/regression scenarios are covered | yes | no combined RM-15 evidence | NOT_TESTED | NEW_EVIDENCE | integrated feature is new | V01, V02, V03, V04, V05, V06, V08 |
| CLM-16 | DOD-04 | implementation tree keeps RM-15 not DONE | yes | Roadmap currently IN_PRD | PASS | NEW_EVIDENCE | two-commit status rule | V09 |
| CLM-17 | DOD-05 | no forbidden owner/contract/delta work lands | yes | approved architecture/PRD scope | PASS | NEW_EVIDENCE | implementation scope audit | V09 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-02, CLM-04, CLM-07, CLM-09, CLM-11, CLM-13, CLM-15 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | every enumerated activity calls persistence before cap; 100 callbacks and live at most 32; run callback has complete Prompt; terminal/replay monotonic | raw/duplicate skip; writer throw preserves Provider phase and later marks audit incomplete; Projection/telemetry omit Prompt/raw | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V02 | CLM-03, CLM-04, CLM-07, CLM-09, CLM-11, CLM-13, CLM-15 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-transcript-store.test.ts --pool=threads --maxWorkers=1', shell=True))"` | same-DB idempotent schema; 100 ordered activities and A/A/B round-trip; terminal/result/artifact/auditComplete persist | duplicate request/event ignored; forbidden fields absent; delete removes rows; unavailable/write failure does not invent data | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V03 | CLM-05, CLM-06, CLM-13, CLM-15 | UNIT | LOCAL | `python -c "import subprocess,sys; cmds=['npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-session-materialize.test.ts --pool=threads --maxWorkers=1','npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-ipc.test.ts --pool=threads --maxWorkers=1']; sys.exit(0 if all(subprocess.call(c,shell=True)==0 for c in cmds) else 1)"` | IPC wires callbacks; materializer writes exact Prompt/title and stable ids; accepted updates sidecar/cache; broadcast stays bounded | pending-submit not durable accepted; repeat no duplicate; persistence failure does not reject; Renderer payload has no full Prompt | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V04 | CLM-03, CLM-04, CLM-05, CLM-07, CLM-08, CLM-09, CLM-11, CLM-13, CLM-15 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/sessions-skill-run-history.test.ts src/renderer/src/screens/Chat/sessionHistory.test.ts --pool=threads --maxWorkers=1', shell=True))"` | one batch merge restores exact Prompt, 100 activities, A/A/B, terminal/continuation history; Renderer maps same card | matching fallback removed once; legacy remains; replay dedupes; delete cleans sidecar; incomplete remains labeled | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V05 | CLM-01, CLM-02, CLM-03, CLM-07, CLM-08, CLM-10, CLM-11, CLM-13, CLM-15 | UNIT | LOCAL | `python -c "import subprocess,sys; cmds=['npm --prefix apps/work exec -- vitest run src/renderer/src/modules/skill-run/skill-run-transcript.test.ts --pool=threads --maxWorkers=1','npm --prefix apps/work exec -- vitest run src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx --pool=threads --maxWorkers=1','npm --prefix apps/work exec -- vitest run src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx --pool=threads --maxWorkers=1']; sys.exit(0 if all(subprocess.call(c,shell=True)==0 for c in cmds) else 1)"` | immediate user/card before await; live/history upsert same request; typed activity/result/error and A/A/B render | reject patches once; replay dedupes; legacy bubbles remain; clarify read-only; existing approval/File only; forbidden fields absent | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V06 | CLM-06, CLM-09, CLM-11, CLM-13, CLM-15 | UNIT | LOCAL | `python -c "import subprocess,sys; cmds=['npm --prefix apps/work exec -- vitest run src/main/session-cache.test.ts --pool=threads --maxWorkers=1','npm --prefix apps/work exec -- vitest run src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx --pool=threads --maxWorkers=1']; sys.exit(0 if all(subprocess.call(c,shell=True)==0 for c in cmds) else 1)"` | successful create/update/delete event; Preload unsubscribe; open Sidebar applies cache list within fake-timer 500ms | only id/reason; failed write no event; event calls zero sync; invalid/closed ignored | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V08 | CLM-07, CLM-10, CLM-12, CLM-13, CLM-14, CLM-15 | INTEGRATION | LOCAL | `python -c "import subprocess,sys; work='apps/work'; cmds=['npm exec -- vitest run src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-ipc.test.ts src/main/files/upsert-skill-run-remote-artifact.test.ts src/main/files/skill-run-artifact-transfer.test.ts src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx src/renderer/src/screens/Chat/hooks/useChatIPC.test.tsx src/main/expert/expert-session-materialize.test.ts --pool=threads --maxWorkers=1','npm run guard']; sys.exit(0 if all(subprocess.call(c,shell=True,cwd=work)==0 for c in cmds) else 1)"` | recovery/no-second-start, approval/status/cancel/retry, File, Local history, Expert materialization, and guard pass when vitest/guard run with cwd=apps/work so vitest.config.jsdom/setupFiles apply; package-wide typecheck is outside KEEP write-set | no Expert fallback, Artifact rewrite, or Local/remote history contract change | LOCAL_TRANSIENT | local repo | NEW_EVIDENCE | yes |
| V09 | CLM-12, CLM-13, CLM-16, CLM-17 | DOCUMENT | LOCAL | `python -c "from pathlib import Path; import subprocess,sys; r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); lat=Path('apps/work/lat.md/skill-run.md').read_text(encoding='utf-8'); p=chr(124); rows={x.split(p)[1].strip():x for x in r.splitlines() if x.startswith(p+' RM-')}; ok=(rows['RM-15'].split(p)[4].strip()!='DONE' and rows['RM-13'].split(p)[4].strip()=='BACKLOG' and rows['RM-14'].split(p)[4].strip()=='BACKLOG' and 'complete sanitized activity' in lat and 'skill-run:history' not in lat); sys.exit(0 if ok and subprocess.call('lat check',shell=True,cwd='apps/work')==0 else 1)"` | LAT documents bounded-live/complete-durable and current owners; RM-15 not DONE; RM-13/RM-14 BACKLOG; lat check PASS from apps/work cwd | no second history IPC, raw event, Hermes tool_calls, Provider edit, delta, clarify response, or Artifact rewrite | LOCAL_TRANSIENT | local repo | NEW_EVIDENCE | yes |

V08 and V09 are each one shlex-parseable `python -c`. V08 runs vitest and guard with `cwd=apps/work` so `apps/work/vitest.config.ts` applies; it does not run package-wide typecheck because KEEP files outside this write set currently fail `tsc`. V09 folds Roadmap/LAT literals and `lat check` into the same process, with `lat check` using `cwd=apps/work`.

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M6i-skill-run-transcript-session-live-sync-closure.md`
- `docs/work/AD-WORK-v4.0.1-skill-run-transcript-live-sync.md`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#broadcastProjection`
- `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript`
- `apps/work/src/main/sessions.ts#getSessionMessages`
- `apps/work/src/main/sessions.ts#deleteSessionRows`
- `apps/work/src/main/session-cache.ts#upsertCachedSession`
- `apps/work/src/preload/index.ts`
- `apps/work/src/preload/index.d.ts`
- `apps/work/src/shared/skill-run.ts#SkillRunProjection`
- `apps/work/src/renderer/src/modules/skill-run/store.ts`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#submitSkill`
- `apps/work/src/renderer/src/screens/Chat/types.ts#ChatMessage`
- `apps/work/src/renderer/src/screens/Chat/MessageList.tsx#MessageList`
- `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#dbItemsToChatMessages`
- `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx`
- `apps/work/lat.md/skill-run.md`

## Triggered Read

- If sidecar DDL cannot use current `state.db` safely: read `apps/work/src/main/db.ts` and existing Desktop-owned table stores; keep one DB and Existing Session ownership.
- If native SQLite blocks unit tests: extract pure sidecar merge/order helpers and test typed rows; do not add history IPC.
- If full Chat mount is impractical: test exported pure optimistic/upsert helpers plus one focused Chat integration; keep production wiring in Chat.
- If title/cache conflicts with Expert materialization: reuse `resolveUniqueSessionTitle` and current cache row shape; do not fork policy.
- If a cross-process cache type is needed: use `shared/session-cache-events.ts`; do not import Main persistence into Preload.
- If card needs Artifact or approval actions: call existing File Platform or `skillRun.decideApproval`; do not add APIs.
- If implementation needs raw Provider payload, streaming delta, clarify response, Hermes `tool_calls`, second DB/list/history API, or Bundle edits: stop and RETURN_ARCHITECTURE/RETURN_PRD.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | Skill lifecycle/parser boundary | T1 | Main-only run/activity callbacks; typed activity before cap; stable ordinal; audit gap state; non-fatal persistence | Skill lifecycle to durable sanitized delta | no |
| C01 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | Skill service tests | T1 | pre-cap 100, duplicate/raw skip, Prompt boundary, terminal/replay, writer failure | Skill lifecycle to durable sanitized delta | no |
| C02 | `apps/work/src/main/skill-run/skill-run-transcript-store.ts` | PROD | ADD | Existing Session persistence | T2 | same-DB run/activity sidecar, typed allow-list, unique identities, batch read/delete, no IPC | Session-owned Skill execution audit | yes |
| C02 | `apps/work/src/main/skill-run/skill-run-transcript-store.test.ts` | TEST | ADD | Session persistence tests | T2 | DDL/upsert/dedupe/order/100/A-A-B/delete/failure/security | Session-owned Skill execution audit | yes |
| C03 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript` | PROD | MODIFY | Existing Skill Session materializer | T3 | exact Prompt row/title; deterministic fallback; cache upsert | Complete Prompt and compatible rows | no |
| C03 | `apps/work/src/main/skill-run/skill-run-ipc.ts#getSkillRunService` | PROD | MODIFY | Skill IPC composition root | T3 | wire run/activity persistence; remove Projection-only duplicate materialization; keep bounded broadcast | Persistence integration | no |
| C03 | `apps/work/src/main/skill-run/skill-run-session-materialize.test.ts` | TEST | MODIFY | materializer tests | T3 | over-120 Prompt/title, ids, repeated update, cache/DB failure | Complete Prompt and compatible rows | no |
| C03 | `apps/work/src/main/skill-run/skill-run-ipc.test.ts` | TEST | MODIFY | IPC tests | T3 | callback order/wiring, bounded/no Prompt payload, failure isolation | Persistence integration | no |
| C04 | `apps/work/src/main/sessions.ts#HistoryItem` | PROD | MODIFY | Existing Session history DTO | T4 | sanitized skill_run item | Existing history merge/delete | no |
| C04 | `apps/work/src/main/sessions.ts#getSessionMessages` | PROD | MODIFY | Existing history loader | T4 | one batch sidecar merge, deterministic fallback replacement, stable multi-run/legacy | Existing history merge/delete | no |
| C04 | `apps/work/src/main/sessions.ts#deleteSessionRows` | PROD | MODIFY | Existing Session delete | T4 | sidecar delete inside existing transaction | Existing history merge/delete | no |
| C04 | `apps/work/src/main/sessions-skill-run-history.test.ts` | TEST | ADD | Existing history tests | T4 | 100/A-A-B/order/continuation/fallback/incomplete/delete | Existing history merge/delete | yes |
| C04 | `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#DbHistoryItem` | PROD | MODIFY | Renderer history mapper | T4 | map skill_run to common Chat variant | Existing history merge/delete | no |
| C04 | `apps/work/src/renderer/src/screens/Chat/sessionHistory.test.ts` | TEST | ADD | Renderer history tests | T4 | Skill mapping and legacy regression | Existing history merge/delete | yes |
| C05 | `apps/work/src/renderer/src/modules/skill-run/store.ts` | PROD | MODIFY | Renderer Skill store | T5 | ordered all-projections selector; retain latest selector | Existing Chat Skill Card | no |
| C05 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts` | PROD | ADD | Renderer Skill module | T5 | optimistic/history/projection adapter and request/event/call reconciliation | Existing Chat Skill Card | yes |
| C05 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx` | PROD | ADD | Renderer Skill module | T5 | structured pending/activity/result/error/incomplete card using existing actions | Existing Chat Skill Card | yes |
| C05 | `apps/work/src/renderer/src/screens/Chat/types.ts#ChatMessage` | PROD | MODIFY | Existing Chat model | T5 | add skill_run variant keyed by request | Existing Chat Skill Card | no |
| C05 | `apps/work/src/renderer/src/screens/Chat/MessageList.tsx#MessageList` | PROD | MODIFY | Existing MessageList | T5 | dispatch skill_run card; preserve all existing rows | Existing Chat Skill Card | no |
| C05 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#submitSkill` | PROD | MODIFY | Existing Chat Skill submit | T5 | immediate user/pending, reject patch, all Session projections, history dedupe | Existing Chat Skill Card | no |
| C05 | `apps/work/src/renderer/src/modules/skill-run/skill-run.css` | PROD | MODIFY | Existing Skill styles | T5 | card/activity/incomplete styles | Existing Chat Skill Card | no |
| C05 | `apps/work/src/shared/i18n/locales/en/skillRun.ts` | PROD | MODIFY | English i18n | T5 | English card copy | Existing Chat Skill Card | no |
| C05 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.test.ts` | TEST | ADD | Renderer Skill tests | T5 | request/event/call/A-A-B/reject/history-live identity | Existing Chat Skill Card | yes |
| C05 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx` | TEST | ADD | Renderer Skill tests | T5 | typed render/actions/incomplete/security | Existing Chat Skill Card | yes |
| C05 | `apps/work/src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx` | TEST | ADD | Chat integration tests | T5 | immediate-before-await/reject/live/multi-run/history no duplicate | Existing Chat Skill Card | yes |
| C05 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | Skill Run LAT | T5 | M6i behavior, bounded/durable split, owners, tests, remaining delta gap | Existing Chat Skill Card | no |
| C06 | `apps/work/src/shared/session-cache-events.ts` | PROD | ADD | Session cache boundary | T6 | channel, DTO, reason enum, strict guard; no content | Cache signal/Sidebar | yes |
| C06 | `apps/work/src/main/session-cache.ts` | PROD | MODIFY | Main session cache | T6 | write success, created/updated/deleted internal event after mutation | Cache signal/Sidebar | no |
| C06 | `apps/work/src/main/ipc/register.ts` | PROD | MODIFY | Main session IPC | T6 | subscribe/broadcast/cleanup once | Cache signal/Sidebar | no |
| C06 | `apps/work/src/preload/index.ts` | PROD | MODIFY | Preload session API | T6 | validated listener plus unsubscribe | Cache signal/Sidebar | no |
| C06 | `apps/work/src/preload/index.d.ts` | PROD | MODIFY | Renderer API types | T6 | listener typing | Cache signal/Sidebar | no |
| C06 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx` | PROD | MODIFY | Existing Sidebar | T6 | event calls cache list only within budget; existing refresh remains | Cache signal/Sidebar | no |
| C06 | `apps/work/src/main/session-cache.test.ts` | TEST | ADD | Main cache tests | T6 | reasons/write gate/shape/unsubscribe | Cache signal/Sidebar | yes |
| C06 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx` | TEST | ADD | Sidebar tests | T6 | cache-only event, 500ms, no-sync, invalid/closed/unsubscribe | Cache signal/Sidebar | yes |
| C07 | `apps/work/src/main/skill-run/skill-run-continuation.ts` | PROD | KEEP | continuation | - | non-terminal recovery/no-second-start unchanged | KEEP recovery | no |
| C07 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | PROD | KEEP | Skill StatusBar | - | active status/cancel/approval/artifact retry remains; not history SOT | KEEP StatusBar/actions | no |
| C07 | `contracts/skill-run/v1.4.0` | PROD | KEEP | Provider Bundle | - | no bytes/schema/delta changes | KEEP Provider | no |
| C07 | `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` | DOC | KEEP | Roadmap | - | RM-13/RM-14 BACKLOG and RM-15 not DONE in implementation commit | KEEP Roadmap boundary | no |

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C02 | `apps/work/src/main/skill-run/skill-run-transcript-store.ts` | Existing Hermes message columns cannot preserve typed eventId/callId/activity identity; one cohesive persistence adapter is required. | Internal extension of Existing Session persistence in the same state.db; no new IPC or conversation owner. |
| C02 | `apps/work/src/main/skill-run/skill-run-transcript-store.test.ts` | Focused schema, ordering, dedupe, failure, and security proof is required for the new durable contract. | Test-only coverage of the Existing Session persistence extension. |
| C04 | `apps/work/src/main/sessions-skill-run-history.test.ts` | No current suite covers Skill sidecar merge, deterministic fallback replacement, and delete. | Test-only coverage of existing getSessionMessages/delete ownership. |
| C04 | `apps/work/src/renderer/src/screens/Chat/sessionHistory.test.ts` | The new history union branch needs focused mapping and legacy regression proof. | Test-only coverage of the existing Renderer history mapper. |
| C05 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts` | Live and historical inputs must share one pure request/event/call identity algorithm. | Remains a helper inside the existing Renderer Skill module and Chat owner. |
| C05 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx` | A structured Chat union variant requires a dedicated accessible renderer. | Presentation child of existing MessageList; no new page or transcript owner. |
| C05 | `apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.test.ts` | Request upsert, replay dedupe, call compaction, and multi-run order need pure proof. | Test-only coverage of existing Skill module behavior. |
| C05 | `apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx` | Typed activity/result/error/action and security rendering need DOM proof. | Test-only coverage of the existing Chat/Skill presentation owner. |
| C05 | `apps/work/src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx` | Current Chat suites do not prove optimistic timing, rejection patch, or history/live dedupe. | Test-only integration coverage of the existing Chat owner. |
| C06 | `apps/work/src/shared/session-cache-events.ts` | Main and Preload need one shared sanitized event contract without importing persistence implementation. | Extends the existing session-cache IPC boundary with one hint DTO; no content owner. |
| C06 | `apps/work/src/main/session-cache.test.ts` | Cache mutation reason, successful-write gate, and listener cleanup have no focused suite. | Test-only coverage of existing Main session-cache ownership. |
| C06 | `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx` | Sidebar cache-only event path and 500ms budget have no focused suite. | Test-only coverage of existing Sidebar ownership. |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | service already produces only safe typed activity, but cap precedes durable consumption | inject callbacks at sanitized pre-cap/run-update points; no raw pipeline or Renderer writer |
| C02 | MINIMAL_NEW | messages lack event/call identity and continuation is recovery-only | one same-DB internal adapter, no second list/history IPC |
| C03 | MODIFY_EXISTING | full Prompt is in ActiveRun; truncation arises only from Projection-only materializer input | carry Prompt through Main persistence callback and retain message/title/cache mechanisms |
| C04 | MODIFY_EXISTING | existing history/delete entries own all reconstruction/cleanup | add one batch sidecar merge/delete there |
| C05 | MODIFY_EXISTING | existing Chat and request-keyed store own presentation inputs | one union/card and pure adapter keyed by clientRequestId |
| C06 | MODIFY_EXISTING | cache already is Sidebar SOT but lacks a hint | tiny post-write event plus cache list, never per-event DB sync |
| C07 | REUSE_EXISTING | continuation/approval/File/Local/Expert/Provider/streaming ownership is correct | regression/scope proof only; conflicts return to governance |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts` | `apps/work/src/shared/skill-run.ts#SkillRunActivityItem`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts` | - | no |
| T2 | C02 | `apps/work/src/main/skill-run/skill-run-transcript-store.ts`<br>`apps/work/src/main/skill-run/skill-run-transcript-store.test.ts` | `apps/work/src/main/db.ts`<br>`apps/work/src/main/sessions.ts`<br>`apps/work/src/shared/skill-run.ts#SkillRunActivityItem` | - | no |
| T6 | C06 | `apps/work/src/shared/session-cache-events.ts`<br>`apps/work/src/main/session-cache.ts`<br>`apps/work/src/main/ipc/register.ts`<br>`apps/work/src/preload/index.ts`<br>`apps/work/src/preload/index.d.ts`<br>`apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx`<br>`apps/work/src/main/session-cache.test.ts`<br>`apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.test.tsx` | `apps/work/src/main/db.ts` | - | no |
| T3 | C03 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript`<br>`apps/work/src/main/skill-run/skill-run-ipc.ts#getSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-session-materialize.test.ts`<br>`apps/work/src/main/skill-run/skill-run-ipc.test.ts` | `apps/work/src/main/skill-run/skill-run-service.ts`<br>`apps/work/src/main/skill-run/skill-run-transcript-store.ts`<br>`apps/work/src/main/session-cache.ts` | T1, T2, T6 | no |
| T4 | C04 | `apps/work/src/main/sessions.ts#HistoryItem`<br>`apps/work/src/main/sessions.ts#getSessionMessages`<br>`apps/work/src/main/sessions.ts#deleteSessionRows`<br>`apps/work/src/main/sessions-skill-run-history.test.ts`<br>`apps/work/src/renderer/src/screens/Chat/sessionHistory.ts#DbHistoryItem`<br>`apps/work/src/renderer/src/screens/Chat/sessionHistory.test.ts` | `apps/work/src/main/skill-run/skill-run-transcript-store.ts`<br>`apps/work/src/main/session-continuation-store.ts` | T2, T3 | no |
| T5 | C05 | `apps/work/src/renderer/src/modules/skill-run/store.ts`<br>`apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.ts`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.tsx`<br>`apps/work/src/renderer/src/screens/Chat/types.ts#ChatMessage`<br>`apps/work/src/renderer/src/screens/Chat/MessageList.tsx#MessageList`<br>`apps/work/src/renderer/src/screens/Chat/Chat.tsx#submitSkill`<br>`apps/work/src/renderer/src/modules/skill-run/skill-run.css`<br>`apps/work/src/shared/i18n/locales/en/skillRun.ts`<br>`apps/work/src/renderer/src/modules/skill-run/skill-run-transcript.test.ts`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx`<br>`apps/work/src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/shared/skill-run.ts#SkillRunProjection`<br>`apps/work/src/renderer/src/screens/Chat/sessionHistory.ts`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | T3, T4 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/skill-run/skill-run-service.ts` | T1 | exact pre-cap callback must preserve SSE/poll/terminal behavior |
| `apps/work/src/main/skill-run/skill-run-ipc.ts` | T3 | sole composition root joins lifecycle, continuation, persistence, and broadcast |
| `apps/work/src/main/sessions.ts` | T4 | history/delete SOT must absorb sidecar without changing Local/Expert rows |
| `apps/work/src/main/session-cache.ts` | T6 | mutation event must follow successful writes only |
| `apps/work/src/preload/index.ts` | T6 | broad API gains one sanitized listener/unsubscribe |
| `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | T5 | optimistic Skill state shares Local/Expert/queue/history paths |
| `apps/work/src/renderer/src/screens/Chat/MessageList.tsx` | T5 | new kind must preserve bubble/reasoning/tool/clarify grouping |

## Generated Outputs Ledger

None

## Todo T1 — Skill lifecycle durable sanitized delta

**Owns Changes**
- C01

**Goal**

Expose Main-only run snapshots and every enumerated sanitized activity before the 32-item Projection cap while isolating Provider truth from local persistence.

**Immediate anchors**
- `skill-run-service.ts#createSkillRunService`
- `skill-run-service.ts#appendSanitizedActivity`
- `skill-run-contract-parser.ts#parseSkillRunEvent`

**Changes**
- Define Main-only run/activity callback inputs. Run input contains exact Prompt from `ActiveRun.request`, sanitized projection fields, timestamps, and auditComplete; never add it to shared Renderer DTOs.
- Add optional injected writers. Invoke run writer for accepted lifecycle updates. Build one typed activity plus stable local ordinal, call writer, then append to bounded Projection.
- Unknown/raw and duplicate eventId invoke neither writer nor append. Catch writer errors, preserve lifecycle, retain a persistence-gap flag, log ids/outcome only, and send auditComplete false on later run retries.
- Preserve cap, monotonic terminal, continuation, artifacts, approval, cancel, and no Expert fallback.

**Stop conditions**
- [ ] V01 PASS
- [ ] 100 callbacks and live at most 32
- [ ] raw/duplicate zero callbacks
- [ ] writer failure cannot change Provider phase
- [ ] exact Prompt absent from Projection/telemetry

**Triggered reads**
- If polling has a separate activity branch: call the same helper before cap.
- If terminal artifact ordering conflicts: use idempotent run upsert; discovery failure still cannot change succeeded.

## Todo T2 — Session-owned Skill execution audit

**Owns Changes**
- C02

**Goal**

Add an internal same-DB execution-audit extension under Existing Session ownership without creating a second conversation/history API.

**Immediate anchors**
- `apps/work/src/main/db.ts#getDbConnection`
- `apps/work/src/main/sessions.ts#HistoryItem`
- `apps/work/src/shared/skill-run.ts#SkillRunActivityItem`

**Changes**
- Create idempotent run/activity sidecar schema in active profile `state.db`: run keyed by client request; activity unique by request/event with ordinal. Keep explicit child-first delete compatible with old DBs.
- Store only ids, exact Prompt, sanitized phase/stage/result/error, artifact descriptors, timestamps, auditComplete, and enumerated activity fields. Forbid raw/headers/endpoint/auth/args/output/bytes/URL/path.
- Expose internal run upsert, activity append, batch Session read, and delete-by-session. No IPC/list/search owner.
- Make replay idempotent and ordering stable. Surface controlled write failure for T1 gap marking.
- Test schema, allow-list, 100, A/A/B, duplicate, terminal, batch read/delete, unavailable/failure.

**Stop conditions**
- [ ] V02 PASS
- [ ] same DB and no IPC
- [ ] unique request/event and stable batch order
- [ ] no forbidden payload fields
- [ ] Session delete removes both tables

**Triggered reads**
- If no migration helper fits: use idempotent CREATE TABLE following existing Desktop stores.
- If FK differs: explicit child-first delete stays authoritative; do not change global pragmas.

## Todo T3 — Complete Prompt and persistence integration

**Owns Changes**
- C03

**Goal**

Wire persistence at the Main composition root and materialize exact Prompt plus readable fallback without widening Renderer Projection.

**Immediate anchors**
- `skill-run-ipc.ts#getSkillRunService`
- `skill-run-ipc.ts#broadcastProjection`
- `skill-run-session-materialize.ts#materializeSkillRunSessionTranscript`

**Changes**
- Materializer accepts Main-only exact Prompt for user row/title; retain deterministic ids, assistant fallback, source/profile/count/cache behavior.
- Bind T1 run callback to materializer then T2 run upsert, and activity callback to T2 append. Remove Projection-only duplicate materialization from broadcast; keep continuation and bounded broadcast.
- Do not add Prompt to Projection, continuation, cache event, telemetry, or Preload. Old rehydrated runs without it keep message fallback.
- Test long Prompt/title, repeat/idempotency, callback order, DB/cache failure, and no Prompt Renderer payload.

**Stop conditions**
- [ ] V03 PASS
- [ ] exact Prompt/title and stable fallback ids
- [ ] one persistence path per update
- [ ] no Renderer/continuation/cache Prompt widening

**Triggered reads**
- If FK requires Session first: materialize before sidecar upsert and retry activity safely with audit incomplete.
- If cache timing flakes: use T6 post-write event, not DOM events.

## Todo T4 — Existing Session history merge and delete

**Owns Changes**
- C04

**Goal**

Extend the sole history/delete owner with structured Skill items, deterministic fallback replacement, stable restart merge, and sidecar cleanup.

**Immediate anchors**
- `sessions.ts#HistoryItem`
- `sessions.ts#getSessionMessages`
- `sessions.ts#deleteSessionRows`
- `Chat/sessionHistory.ts#dbItemsToChatMessages`

**Changes**
- Add sanitized skill_run HistoryItem. Batch-read all sidecar data once and merge with messages/overlays/continuation in stable order.
- Widen existing message SELECT with platform_message_id if needed. Remove only matching deterministic assistant fallback when valid sidecar exists; keep user and unrelated/legacy rows.
- Reconcile continuation/sidecar by request so one non-terminal card survives and terminal history remains after continuation cleanup.
- Delete sidecar in existing single/batch transaction. Map history to the same T5 Chat variant.
- Test 100/A-A-B/replay/fallback/legacy/incomplete/continuation/delete.

**Stop conditions**
- [ ] V04 PASS
- [ ] one history IPC and one batched sidecar read
- [ ] matched fallback absent; legacy retained
- [ ] one request card on restart
- [ ] no orphan on single/batch delete

**Triggered reads**
- If fallback lacks identity: widen existing SELECT; never match by text.
- If overlay order conflicts: preserve local errors and perform final stable ordering only once.

## Todo T5 — Existing Chat Skill transcript card

**Owns Changes**
- C05

**Goal**

Make Skill execution a first-class turn in the existing Chat with immediate optimistic, live in-place, and identical historical rendering.

**Immediate anchors**
- `Chat.tsx#submitSkill`
- `Chat/types.ts#ChatMessage`
- `Chat/MessageList.tsx#MessageList`
- `modules/skill-run/store.ts`

**Changes**
- Add one request-keyed Skill Chat variant and pure optimistic/history/projection reconcile helpers.
- Before awaiting start, append exact user and pending card once. Queue keeps request/Prompt snapshot. Reject/throw patches the same card; toast remains supplemental.
- Expose all ordered Session projections; subscribe mounted Chat and upsert each by request. Reconcile DB history with optimistic/live identity without duplicate Prompt/card.
- Card renders sanitized pending/phase/activity/result/error/artifacts/incomplete. Dedupe eventId and compact tool status by callId for live display.
- Approval uses existing decision API; clarify read-only; Artifact uses existing File callbacks only. Add English copy/CSS and update LAT including remaining delta gap.

**Stop conditions**
- [ ] V05 PASS
- [ ] immediate before Main resolution
- [ ] reject/live/history share one card
- [ ] A/A/B has three cards
- [ ] current approval/File only and clarify read-only
- [ ] V09 LAT check PASS

**Triggered reads**
- If user identity is needed: pass deterministic platform id from history; never compare Prompt text.
- If actions need props: add narrow MessageList/Chat callbacks, not IPC.
- If delta is requested: stop for RM-13/RM-14.

## Todo T6 — Session cache signal and Sidebar refresh

**Owns Changes**
- C06

**Goal**

Notify Renderer after successful profile cache mutations and make Sidebar reread cache only, never state.db per Skill update.

**Immediate anchors**
- `session-cache.ts#writeCache`
- `session-cache.ts#upsertCachedSession`
- `main/ipc/register.ts`
- `preload/index.ts`
- `SidebarRecentSessions.tsx`

**Changes**
- Add shared channel/DTO/guard with only sessionId and created/updated/deleted.
- Make cache writes report success; emit after actual upsert/title/remove mutation only. No Prompt/title/result content.
- Subscribe once in Main IPC and broadcast to live windows with teardown. Preload validates and returns unsubscribe.
- Sidebar subscribes only while open/current profile; event calls listCachedSessions and applies loaded window immediately. Never call refresh/syncSessionCache on this event. Keep initial/focus/timer/pagination behavior.
- Test successful/failed/no-op mutation, payload, cleanup, cache-only path, invalid/closed state, burst/no-sync, and fake-timer 500ms budget.

**Stop conditions**
- [ ] V06 PASS
- [ ] id/reason only
- [ ] failed/no-op writes emit no success event
- [ ] event path zero full sync
- [ ] no listener leak across open/profile changes

**Triggered reads**
- If registration cleanup differs: follow existing event broadcast ownership and teardown.
- If profile switch races: use effect cancellation; do not add content to event.

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all todos completed; completion audit and implementation review FRESH PASS; V01, V02, V03, V04, V05, V06, V08, V09 FRESH PASS; CLM-01 through CLM-17 PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V08, V09 through SMC evidence ledger and durable manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate and claim ids |
| BLOCKED | environment/dependency prevents implementation/proof | blocker record with failed command and owner |
| RETURN_PRD | approved owner/data/acceptance conflicts with source | PRD revision request |
