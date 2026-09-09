# M6j Evidence Closure — PRD Revision Review (v1.0.0 → v1.1.0)

Review scope is the delta from APPROVED v1.0.0 to revised v1.1.0 (`REVIEW_REQUIRED`), grounded at `a426e44e5990583e8701e0f98d9a5d31ccd9d09e`. The revision responds to Plan semantic review RETURN_PRD (F1): approved AC-08/DOD-04 originally required RM-16 DONE to cite `smc-evidence:RM-17@sha256:<scope-fingerprint>` alongside parent Plan and commit `09efa7ac`, which `validate_roadmap_v11.py` rejects because (a) evidence-ref plan_id must equal Plan-column plan_id and (b) the manifest must exist inside the listed Implementation Commit. This review verifies the v1.1.0 split-reference semantics against the validator and confirms no governance downgrade.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | Delta only revises Roadmap evidence-reference semantics for cross-item closure; all production/non-goals unchanged. |
| G2 Existing capability | PASS | Still closes already-committed RM-16 behavior via RM-17 fresh evidence; no duplicate capability. |
| G3 Production ownership | PASS | No new production owner. |
| G4 KEEP/MODIFY/ADD/REPLACE/REMOVE | PASS | Same C01–C03 classification; only AC-08/DOD-04/Target End-State/Boundary text modified. |
| G5 Contract / IPC / security | PASS | No wire/IPC change; sanitized-boundary re-proof obligation unchanged. |
| G6 Behaviour → AC | PASS | AC-08 remains observable: RM-16 row fields and RM-17 strict binding are explicitly enumerated. |
| G7 Evidence integrity | PASS | Strict manifest binding moves to RM-17 row (`smc-evidence:`); RM-16 row uses `external-artifact:` pointer only after RM-17 manifest exists in repo — not a silent downgrade because RM-17 row still requires full manifest validation at DONE. Typecheck exclusion unchanged. |

## Validator Spot Checks (`validate_roadmap_v11.py`)

- **RM-16 DONE row (proposed):** Plan = parent RM-16 canonical Plan (`plan_id: RM-16`), Implementation Commit = `09efa7ac`, Verification Evidence = `external-artifact:docs_agent/evidence/RM-17-evidence.json`. Validator accepts `external-artifact:` when path non-empty; does not require manifest inside `09efa7ac` for external-artifact refs. **PASS path.**
- **RM-17 DONE row (proposed):** Plan = RM-17 canonical Plan (`plan_id: RM-17`), Implementation Commit = RM-17 implementation commit (contains `docs_agent/evidence/RM-17-evidence.json`), Verification Evidence = `smc-evidence:RM-17@sha256:<scope-fingerprint>`. Validator enforces plan_id match, manifest-in-commit, manifest schema, scope fingerprint, audit/review/verification PASS. **PASS path** once delivery completes.
- **Plan reuse:** RM-16 and RM-17 Plan columns differ → no `ROADMAP_PLAN_REUSED`.
- **Precedent:** RM-01 and RM-06 already use `external-artifact:` for DONE rows while sibling items use `smc-evidence:` — the split is consistent with existing Roadmap practice.

## Findings

No OPEN BLOCKER or MAJOR.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | RM-16 `external-artifact:` does not auto-validate manifest bytes at roadmap validate time; strict binding is intentionally delegated to RM-17 row. Plan T3 must still run `validate_roadmap_v11.py` after both rows are DONE. |
| N2 | NOTE | Roadmap RM-17 exit criteria text should be updated to match v1.1.0 split-reference semantics before or during Plan authoring. |

## Review Closure

v1.1.0 resolves the Plan-review BLOCKER without weakening RM-17's strict evidence obligations. PRD may converge to `APPROVED`; Plan must align AC-08/DOD-04/T3 with the split-reference semantics before semantic clearance.
