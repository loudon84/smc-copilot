# RM-16 Skill Session UX and Terminal Result Closure — Plan Semantic Review

Review scope is the canonical `smc.plan.v3.5` Plan for RM-16, generated from the APPROVED M6j PRD and grounded at `0cb5b34a6fa2684a826456583cace8a3a5e350ad`. The router returned `REQUIRED` for integration hotspots and cross-Todo dependencies, so this record performs the actual semantic review rather than treating routing as clearance.

## Verdict

PASS

Semantic Plan hash: `sha256:74cd273d8d21e9071b4751a74a0ae8f0eeba5254dc73aa5e8e6ec658e653891c`.

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Grounding truth | PASS | Panel visibility, mutable session mode, unused resultPath, permissive snapshot extraction, terminal abort race, sidecar recovery and Card wording are each tied to existing source owners and locked v1.5.0 contract files. |
| Ponytail minimality | PASS | All seven Changes modify existing owners. Only two new files are focused tests for modules with no owner-local suite. No production service/store/channel/dependency is added. |
| Change/owner alignment | PASS | C01/C02 remain in Chat/Selection; C03 stays in Main session mode plus the existing Service accepted boundary; C04/C05 stay in Gateway/Service; C06 stays in rehydrate/Card; C07 stays in LAT. |
| Single writer and hotspots | PASS | T1 exclusively owns `Chat.tsx`; T2 exclusively owns `skill-run-service.ts`, Main IPC and shared Skill API; T3 exclusively owns continuation recovery/Card; T4 only writes LAT. Symbol-level write/read dependencies are ordered. |
| Requirement closure | PASS | AC-01–AC-10 and DOD-01–DOD-05 reproduce the APPROVED obligations exactly and map to C01–C07, T1–T4, and blocking V01–V09. |
| Lifecycle closure | PASS | The Plan identifies one writer for panel intent, an atomic accepted-time lock, one in-flight terminal resolver, a succeeded-but-unavailable failure state, and restart retry identity without `tools/call`. |
| Contract/data boundary | PASS | Public Run status and Public Run Result are separated according to v1.5.0; `resultPath` remains same-origin/authorized; session conflicts stop before Provider call; Renderer receives only existing sanitized fields. |
| Verification quality | PASS | Focused commands cover contrary UI baselines, store transaction/migration, result adapter negatives, five terminal orderings, sidecar recovery, Card semantics, Expert/File regressions, guard, typecheck and LAT. Oracles do not rely on fixed sleeps or raw live payloads. |
| PRD drift | PASS | No Provider Bundle change, Public Run widening, raw IPC, second owner, Managed Runtime work, or accepted/idempotency redefinition is introduced. Triggered conflicts return to PRD/Provider. |
| Cursor projection | PASS | Four frontmatter todos map one-to-one to T1–T4 headings and owned Change IDs; all begin `pending`. |

## Risk Review

| Risk | Resolution |
|---|---|
| UI-only lock could be bypassed | T2 removes the mutable Renderer/Preload setter and enforces an atomic Main lock before accepted side effects or Provider call. |
| Legacy provisional selections could be mistaken for locks | Migration uses earliest sidecar accepted evidence with non-null providerRunId; a mode row alone is insufficient. |
| poll or SSE could finalize twice | C05 gives one ActiveRun terminal promise ownership of result fetch, projection, telemetry, Artifact discovery and abort. |
| Empty/failed result could erase streamed text | Resolver preserves non-empty projection text and records a sanitized unavailable/no-text outcome while retaining succeeded truth. |
| Restart retry could create another Run | T3 routes only unavailable sidecar rows through existing rehydrate/result resolution and explicitly forbids `start`/`callSkill`. |
| Session Files could reopen from background effects | T1 centralizes explicit user intent at existing show/file callbacks and resets visibility by Chat/session identity. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | T2 must treat Work's locally accepted boundary as the lock point; a later Provider failure does not unlock the Session. |
| N2 | NOTE | A nullable successful `result.text` is not a contract error. Preserve live text or show completed-without-text; reserve `RESULT_RETRIEVAL_FAILED` for transport/validation failure. |
| N3 | NOTE | T3 may extend the existing Service rehydrate input under T2 ownership, but must not create a second result-recovery API or lifecycle owner. |

## Review Clearance

The PASS verdict has been recorded through `smc-plan-delivery` against the semantic Plan hash above. Any semantic Plan edit after this review makes the clearance stale and requires validation, reassessment, and review again. Cursor todo status changes alone do not invalidate it.
