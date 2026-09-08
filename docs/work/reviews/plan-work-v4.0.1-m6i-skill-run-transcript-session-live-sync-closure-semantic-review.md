# M6i Skill Run Transcript & Session Live-Sync Closure — Semantic Plan Review

Review scope is canonical Plan `.cursor/plans/work-v4.0.1-m6i-skill-run-transcript-session-live-sync-closure.plan.md` (`plan_id: RM-15`). Router result was `REQUIRED` because of multiple new production files, integration hotspots, a security/trust boundary, and cross-Todo dependencies. The Plan declares `acceptance_contract: smc.acceptance.v1`, so this is the required Actual Semantic Review. This review does not execute the Plan, change production code, or mark RM-15 DONE.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Grounding | PASS | Current service retains exact Prompt only in `ActiveRun.request`, appends typed activity into a capped Projection, and has no durable activity writer. Current materializer writes `promptSummary`; history remains `getSessionMessages`; Renderer keeps request-keyed projections but exposes latest-per-Session; Sidebar cache has no change signal. Plan anchors and baseline match these sources. |
| Ponytail | PASS | C01 modifies the existing lifecycle boundary; C02 adds one same-DB internal adapter under Existing Session ownership; C03-C06 extend the current materializer/history/Chat/cache owners. C07 keeps continuation, File, approval, Local/Expert, Provider, and streaming boundaries. No second Chat, Session database, history IPC, File store, or dependency is introduced. |
| Single writer | PASS | T1 solely owns service callbacks, T2 the sidecar adapter, T6 the cache event path, T3 the Main composition/materializer, T4 history/delete, and T5 Chat presentation/LAT. T3 depends on T1/T2/T6; T4 on T2/T3; T5 on T3/T4. Every Change Matrix target has exactly one Todo writer and hotspots name the shared integration files. |
| Coverage | PASS | AC-01/02 map to immediate/live Chat evidence; AC-03/04/05 to multi-run, pre-cap 100-event, exact Prompt, and history evidence; AC-06 to cache-only 500ms evidence; AC-07/08/09 to restart/fallback/delete/failure; AC-10/11/12 to owner, security, and regression evidence. DOD-01-DOD-05 are explicit and blocking. |
| Lifecycle | PASS | Optimistic submit, durable execution, restart/reopen, Sidebar notification, and delete each name trigger, nonterminal state, success writer, failure behavior, identity, and evidence. Provider terminal truth is isolated from local write failure; continuation remains non-terminal recovery only. |
| Boundary | PASS | Durable input is constructed after parser sanitization and before Projection cap. Sidecar carries Work-owned typed fields only. Exact Prompt stays Main/local DB only. Existing history IPC is reused. Cache event contains only sessionId/reason and causes cache list, not state.db sync. |
| Verification | PASS | V01-V06 are focused tests for service, store, materializer/IPC, history, Chat/card, and cache/Sidebar. V08 runs affected recovery/File/approval/Local/Expert regressions plus guard/typecheck. V09 freezes LAT/Roadmap/scope. Commands name existing tests or Plan-owned new test files; no live Provider environment is required for this local architecture closure. |
| Scope | PASS | RM-13/RM-14 remain BACKLOG. Provider Bundle bytes, raw events, streaming delta, clarify response, Hermes `tool_calls`, tool args/output, and Artifact transport are explicitly excluded. Any need for them is a RETURN_ARCHITECTURE/RETURN_PRD condition. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | The durable activity callback must execute before `appendSanitizedActivity`; persisting the already capped Projection would fail AC-04. |
| N2 | NOTE | `skill-run-transcript-store.ts` is an internal same-DB Session extension. It must not register a second history/list/delete IPC or become a conversation SOT. |
| N3 | NOTE | Fallback replacement must use deterministic `platform_message_id`, never Prompt/result text matching. |
| N4 | NOTE | Persistence failure must preserve Provider phase and make audit incompleteness observable on a later idempotent run snapshot. |
| N5 | NOTE | Sidebar change events call `listCachedSessions` only. Existing focus/timer initial synchronization may remain, but the new event path must not call `syncSessionCache`. |
| N6 | NOTE | Implementation must update `apps/work/lat.md/skill-run.md` and keep RM-15 not DONE until the separate evidence-backed Roadmap status commit. |

PASS means the canonical Plan may be executed manually through the governed Cursor delivery flow. This review itself performs no delivery work.
