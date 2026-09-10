# RM-17 M6j Evidence Closure — Plan Semantic Review (owned_control revise)

Review scope is the canonical `smc.plan.v3.5` Plan for RM-17 (`.cursor/plans/work-v4.0.1-m6j-evidence-closure.plan.md`), revised mid-delivery after discovering that listing `docs_agent/evidence/RM-17-evidence.json` in the Change Matrix made `scope_fingerprint` include the durable manifest and therefore STALE every audit/review/verification the moment `evidence.py manifest` wrote it. This violates the evidence contract: generating the manifest must not enter implementation scope or stale the proof it summarizes.

Grounded at committed baseline `a426e44e5990583e8701e0f98d9a5d31ccd9d09e` with APPROVED PRD v1.1.0. Workspace re-init base is HEAD `55a595c6` (authorized jsdom + cleanup harness commits on `SessionFilesPanel.test.tsx` only).

## Verdict

PASS

## Gate Results

All Actual Review Scope gates remain PASS after the owned_control revise:

- **C02 removed from Change Matrix / New File Justification / Implementation Decisions as a planned write.** Durable Evidence Manifest stays in Generated Outputs as `GENERATED_ENTRYPOINT` and is delivery `owned_control` only.
- **Requirement Coverage** remaps former C02 obligations (AC-06/AC-02/AC-04/AC-07/DOD-01/DOD-02/DOD-04) onto C01 + T2 orchestration without inventing a second production owner.
- **T2** owns no Change Matrix write (`Owns Changes` / `Writes` = `-`); stop conditions explicitly require that writing the manifest must not change the RM-17 scope fingerprint.
- **RM-16 / RM-17 DONE evidence split** from PRD v1.1.0 is unchanged: RM-16 uses `external-artifact:docs_agent/evidence/RM-17-evidence.json`; RM-17 uses `smc-evidence:RM-17@sha256:<scope-fingerprint>`.
- **Authorized harness delta** clarified to `6c0ee294` + `55a595c6` on the single test file; V10 integrity oracle still requires that file alone under `apps/work`/`contracts`/`packages` and a leading jsdom pragma.

## Findings

No OPEN BLOCKER or MAJOR.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | V10 still does not oracle every closure-record field T1 writes; tooling independently enforces HEAD/ambient stability. |
| N2 | NOTE | Manifest is no longer a Change Matrix planned file; commit_guard / validate_delivery_completion still require it via owned_control. |

## Review Closure

Plan may proceed to `smc-plan-delivery`. Record semantic clearance via `review_record.py plan --verdict PASS`.
