# M6a Expert Default Entry Removal — Initial PRD Review

Review scope is RM-07 Stage PRD v1.0.0 (`REVIEW_REQUIRED`). Evidence freshness is `REUSE` against `grounded_commit` `bbd78293f673a3b9acd6f3ea5a954cba530df1ad` and `source_revision` `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.2/RM-07`; this review does not re-ground the repository. It does not approve a Plan, mark RM-07 DONE, or authorize P1 activity / Approval / Attachment work.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In is Composer Expert default-create removal, Chat new-submit routing, Main `expert.start` feature-mode gate, and rollback-handbook Expert-entry wording. Out keeps Expert subsystem/contract/history, `expert.retry` for existing projections, Layout「新建对话」as local-chat, and all P1 Items RM-08–RM-12. |
| G2 Existing capability | PASS | Reuses Chat Composer, Expert IPC/RunService, feature-mode store, SkillRunService, and Local Chat. No second Expert client or Skill fallback owner. `getFeatureMode` IPC already exists. |
| G3 Production ownership | PASS | Chat owns entry visibility and new-submit routing. Expert IPC owns the start hard gate. feature-mode store remains the only mode SoT. Skill Run and Local Chat keep their submit owners. Renderer is not a mode SoT. |
| G4 Classification | PASS | C01 REMOVE has Replacement Matrix rows for Composer entry and ungoverned `expert.start`. C02/C03 MODIFY routing and Main gate. C04 KEEP retry/reader. C05 KEEP Skill/Local. C06 MODIFY existing M5 handbook rather than adding a second ops owner. Dual KEEP/REMOVE in the inventory row is resolved by C01 vs C04. |
| G5 Contract and security | PASS | No Bundle edits. Main rejects `expert.start` unless `expert-compat` and must not issue Expert HTTP. Renderer may read existing `skillRun.getFeatureMode` only. Retry is limited to existing Expert projections. No silent Skill→Expert or Expert→Skill rewrite. |
| G6 Behaviour to AC | PASS | AC-01/02 hide and stop Composer create; AC-03 Main hard gate + rollback restore; AC-04 reader/retry KEEP; AC-05 Skill/Local regression and no fallback; AC-06 handbook; AC-07 forbids claiming P1 or full Expert deletion. |
| G7 External contract maturity | PASS | Expert v1.0.2 and Skill Run v1.2.1 are untouched. Removal is a Work create-path change. |
| G8 Cross-repo ownership | PASS | Work-only. Forbids Provider-source inspection and Expert contract edits. |
| G9 Change traceability | PASS | Implements architecture C04 / Compatibility Contract / AC-22 without completing P1 or deleting the Expert subsystem. Roadmap split of RM-07 from P1 is consistent with “独立 Removal PRD”. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | `expert.retry` stays for existing `ExpertRunCard` projections. Plan must not turn retry into a no-projection create path, or the default-entry REMOVE is hollow. |
| N2 | NOTE | Chat currently never reads feature mode. Plan should consume existing `skillRun.getFeatureMode`, not add a second mode IPC. |
| N3 | NOTE | `local-only` currently still allows Composer Expert create. Closing both `skill-first` and `local-only` is required for C03; do not gate Skill start only. |
| N4 | NOTE | Exact Main errorCode string is Plan-owned. PRD only requires a stable, observable code and zero Expert HTTP. |

PASS -> `smc-prd-converge`. This review does not modify the PRD and does not create a git commit.
