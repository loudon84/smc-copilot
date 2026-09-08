# M6a Expert Default Entry Removal — Semantic Plan Review

Review scope is canonical Plan `.cursor/plans/work-v4.0.1-m6-expert-default-entry-removal.plan.md` (`plan_id: RM-07`). Router result was `REQUIRED` (`MULTIPLE_NEW_PROD_FILES`, `INTEGRATION_HOTSPOT`). This review does not re-open the APPROVED Stage PRD, does not mark RM-07 DONE, and does not authorize RM-08 or any other Plan.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Grounding | PASS | C03 start is `registerExpertIpc` with no mode gate. C01/C02 Composer mounts `ExpertContextControl` and `handleSubmitOrQueue` calls `expert.start` without `getFeatureMode`. C06 handbook exists and only documents Skill stop-create. |
| Ponytail | PASS | Trust-boundary gate stays in existing Expert IPC. Composer hide is a Chat-owned helper because `Chat.tsx` cannot be unit-imported. Handbook is MODIFY of the M5 file. No second Expert client, no Bundle edit, no ExpertContextControl deletion. |
| Single writer | PASS | T1 owns `expert-ipc.ts`. T2 owns `Chat.tsx` and the helper. T3 owns the handbook. C04/C05 KEEP have no Todo writer. |
| Coverage | PASS | AC-01/02 map to helper+Chat. AC-03 maps to IPC start. AC-04/05 are KEEP regressions. AC-06/07 and DOD-02/03 stay on handbook + Roadmap-not-DONE oracle. |
| Lifecycle / boundary | PASS | New start writer is the IPC handler; retry/cancel/rehydrate remain ExpertRunService. Mode is Main SoT via existing `getFeatureMode`. Renderer-supplied mode cannot authorize start. |
| Verification | PASS | V01 asserts no `service.start` on disabled modes. V02/V03 cover hide and leftover selection. V04/V05 are existing suites. V06/V07 are document oracles without `|` table breakage. |
| Scope | PASS | Out still forbids Expert subsystem deletion, P1, Bundle edits, and Expert resubmit of failed Skill Runs. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | Two PROD ADD rows share one new helper file. Delivery must not split that file across Todos or invent a second Chat owner. |
| N2 | NOTE | `expert.retry` must stay ungated. A start-only gate that also blocks retry would violate AC-04. |
| N3 | NOTE | Chat `getFeatureMode` failure fail-closes to hide the default entry. Do not treat missing IPC as `expert-compat`. |
| N4 | NOTE | V07 requires RM-07 status is not DONE in the implementation tree. Roadmap DONE is a later separate commit. |

PASS -> `smc-plan-delivery`. This review does not modify the Plan and does not create a git commit.
