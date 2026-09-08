# M6b Skill Run Activity Adapter — Semantic Plan Review

Review scope is canonical Plan `.cursor/plans/work-v4.0.1-m6-skill-run-activity-adapter.plan.md` (`plan_id: RM-08`). Router result was `REQUIRED` (`INTEGRATION_HOTSPOT`, `SECURITY_OR_TRUST_BOUNDARY`). This review does not re-open the APPROVED Stage PRD, does not mark RM-08 DONE, and does not authorize RM-07, RM-09, or any other Plan.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Grounding | PASS | `parseSkillRunEvent` still maps only assistant/artifact/control phases; four P1 types hit `default` → `rawUnknown`. `SkillRunProjection` has no activity list. `#consumeSse` patches phase/text/artifacts only when `!rawUnknown`. `SkillRunStatusBar` is compact phase UI already mounted by Chat. Bundle fixtures and `$defs` fields match the Plan copies. |
| Ponytail | PASS | All three MODIFY changes stay on existing parser / DTO / StatusBar. No second parser, no `skillRun.activity` IPC, no continuation persistence, no new Chat page. KEEP rows correctly leave unknown, Bundle `unsupported`, and `ClarifyCard` alone. |
| Single writer | PASS | T1 owns `parseSkillRunEvent`. T2 owns `SkillRunProjection` and `createSkillRunService` merge. T3 owns StatusBar + lat.md. C04 KEEP shares the parser switch but has no Todo writer; T1 must keep `default` rawUnknown. |
| Coverage | PASS | AC-01/02 map to parser (+ projection for AC-01). AC-03 spans merge + UI + existing terminal guard. AC-04 maps parser string options plus StatusBar/ClarifyCard negatives. AC-05/06/07 and DOD-02/03 stay on unknown KEEP, Local Chat tests, no-DONE oracle, and no-new-IPC check. |
| Lifecycle / boundary | PASS | Activity append writer is `#consumeSse` → `updateProjection`. Unknown still advances `seenEventIds` without writing activity. `waiting-approval` cannot rewind terminal because `updateProjection` already drops nonterminal phase after `terminalConfirmed`. `approval_id` is display/dedupe only. No respond/decision producer exists. |
| Verification | PASS | V01 uses existing parser test file plus Bundle fixtures. V02 extends the existing SSE mock in service tests. V03/V04 are existing StatusBar and ClarifyCard files. V05 Expert regression is a real suite. V06/V07 avoid markdown `\|` breakage via `chr(124)` / source greps. |
| Scope | PASS | Out still forbids Bundle edits, Approval decision, forms, attachments, ClarifyCard reuse, Expert-entry work, and a second Session/File owner. SECURITY_OR_TRUST_BOUNDARY is the sanitization boundary (no arguments/JWT/URL), not a new auth owner. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | T1 local `ParsedSkillRunEvent.activity` and T2 `SkillRunProjection.activities` must stay field-compatible. Do not invent a third mapper file. |
| N2 | NOTE | Cap 32 activities and 8 clarify options are Plan fail-closed bounds, not Bundle fields. Do not persist them on continuation. |
| N3 | NOTE | `run.waiting_approval` already maps phase. T1 must not duplicate that control case when adding `approval.requested`. |
| N4 | NOTE | V06 requires RM-08 status is not DONE in the implementation tree. Roadmap DONE is a later separate commit. |

PASS -> `smc-plan-delivery`. This review does not modify the Plan and does not create a git commit.
