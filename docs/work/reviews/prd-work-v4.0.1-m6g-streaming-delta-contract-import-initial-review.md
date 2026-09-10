# M6g Skill Run Streaming Delta Contract Import — Initial PRD Review

Review scope is RM-13 Stage PRD v1.0.0 (`REVIEW_REQUIRED`) grounded at `6e7516bf53d9c2144453c291a8b1405d32af43a9`. It reviews only the approved architecture, Roadmap READY predicate, current Work lock implementation, and the locally delivered Provider tag. It does not import a Bundle, run a live Provider endpoint, authorize RM-14 mapping, or mark RM-13 DONE.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In is restricted to immutable v1.5 import, receipt, v1.5 eligibility and LAT. Parser, service, IPC, Renderer, Session and UI are explicit Out and remain RM-14. |
| G2 Existing capability | PASS | Existing consumer lock already owns generic complete-bundle verification and has v1.3/v1.4 version-specific helpers; extending it is the minimum reuse. |
| G3 Provider ownership | PASS | Provider owns tag, manifest, schemas, fixtures and SHA-covered bytes. Work only copies the published local tag tree and adds a non-covered receipt. No schema/checksum fabrication or network lookup is allowed. |
| G4 Contract closure | PASS | Local tag `skill-run-contract-v1.5.0` resolves to `3a7fa5ac32017d41f7191b8221c861b93d7e7f32`; Provider release check passed. Manifest capabilities, independent `assistant.delta` schema with required `message_id`/`delta_seq`/`delta`, and both replay fixtures are explicitly required. |
| G5 Compatibility | PASS | P1 delta files are not added to generic `REQUIRED_BUNDLE_PATHS`; v1.2.1 P0, v1.3 decision and v1.4 attachment gates remain separately tested. |
| G6 Behaviour to AC | PASS | AC-01 through AC-04 specify positive identity/shape and all required negatives. AC-05 prevents premature runtime mapping; AC-06 makes LAT state externally reviewable. |
| G7 Evidence integrity | PASS | External Provider release evidence is separated from new Work import proof. New helper and tests are `NEW_EVIDENCE`; affected generic gate proof is `TARGETED_RERUN`; no blocking claim is deferred to RM-14. |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | `manifest.releaseCommit` and `consumer-lock.tagTargetCommit` have different stated identities by design: the former is Provider release metadata, the latter pins the annotated tag’s peeled commit. Plan must assert both appropriately and must not require equality. |
| N2 | NOTE | The helper must parse the closed discriminator/payload shape structurally; a fixture filename or text substring alone is insufficient evidence of a usable RM-14 input. |
| N3 | NOTE | `consumer-lock.json` is Work-owned and must remain outside Provider `SHA256SUMS`; implementation may not regenerate or append Provider checksum entries. |

PASS -> `smc-prd-converge`. This review does not modify the Stage PRD, create an implementation commit, or change Roadmap delivery status.
