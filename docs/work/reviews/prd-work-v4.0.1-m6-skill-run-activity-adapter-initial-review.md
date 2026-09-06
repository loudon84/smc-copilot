# M6b Skill Run Activity Adapter — Initial PRD Review

Review scope is RM-08 Stage PRD v1.0.0 (`REVIEW_REQUIRED`). Evidence freshness is `REUSE` against `grounded_commit` `bbd78293f673a3b9acd6f3ea5a954cba530df1ad` and `source_revision` `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.2/RM-08`; this review does not re-ground the repository. It does not approve a Plan, mark RM-08 DONE, or authorize Approval decision / Expert-entry removal.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In is read-only mapping of four v1.2.1 enumerated events into sanitized activity on existing parser / projection / `modules/skill-run`. Out keeps Approval decision, Attachment, forms, Expert removal, Local Chat `ClarifyCard` reuse, streaming-delta invention, and Bundle edits. |
| G2 Existing capability | PASS | Parser, SkillRunService, `SkillRunProjection`, and `modules/skill-run` already own event adaptation and presentation. Local Chat `ClarifyCard` is correctly classified as a foreign, incompatible owner. No second activity bus or raw-event IPC. |
| G3 Production ownership | PASS | Parser owns mapping. SkillRunService owns merge/dedupe/monotonic projection. `modules/skill-run` owns display. MessageList / ClarifyCard / File Platform do not gain Skill Run activity ownership. |
| G4 Classification | PASS | C01–C03 MODIFY existing parser/DTO/presentation. C04 KEEP unknown fail-soft. C05 KEEP absent decision/respond (Bundle `approval: unsupported`, no matrix endpoint). C06 KEEP Local Chat clarify. No REPLACE, so no Removal Matrix is required. |
| G5 Contract and security | PASS | Only enumerated `$defs` fields. `tool.call` without arguments. `options` coerced to strings. No new raw-event channel. `approval_id` display-only. Explicit ban on `clarify-respond` / allow-deny controls. Telemetry must not grow secret fields. |
| G6 Behaviour to AC | PASS | AC-01 mapping vs `rawUnknown`; AC-02 secret ban; AC-03 read-only approval + no terminal rewind; AC-04 read-only clarify + no respond IPC; AC-05 unknown; AC-06 Local Chat / Expert non-goals; AC-07 no raw event and no second Chat/File owner. |
| G7 External contract maturity | PASS | v1.2.1 already enumerates the four events. The Item consumes them; it does not lift `unsupported` capabilities or add endpoints. |
| G8 Cross-repo ownership | PASS | Work-only. Forbids Provider-source inspection and Bundle mutation. |
| G9 Change traceability | PASS | Implements parent P1 “合同化细粒度 Run Activity” without parent Approval decision gate, Attachment gate, or C04 Expert removal. Consistent with Roadmap RM-08 vs RM-07 / RM-09. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | `clarify.requested.options` is an open array in the Bundle. Plan must fail-closed to displayable strings with a bound; it must not JSON-stringify arbitrary objects into UI. |
| N2 | NOTE | `approval.requested` may set `waiting-approval`. Plan must keep terminal monotonicity from M3; a late approval event cannot rewind a succeeded/failed run. |
| N3 | NOTE | Compact `SkillRunStatusBar` stays. Plan should add activity rendering under `modules/skill-run`, not teach MessageList Provider DTO switching. |
| N4 | NOTE | Control events matching `^(run\|step\|edge\.job)\.` remain unknown except P0 phase mappings already in the parser. Plan must not treat that open pattern as a license to textify payloads. |

PASS -> `smc-prd-converge`. This review does not modify the PRD and does not create a git commit.
