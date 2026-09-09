# M6j Skill Session UX and Terminal Result Closure — Initial PRD Review

Review scope is RM-16 Stage PRD v1.0.0 (`REVIEW_REQUIRED`) grounded at `0cb5b34a6fa2684a826456583cace8a3a5e350ad`. It independently reviews the user-frozen Session Files rule, current Chat/session-mode/Gateway/SkillRunService ownership, the v1.5.0 result contract, and the existing RM-14/RM-15 boundaries. It does not create a Plan, implement fixes, alter Provider bytes, or mark RM-16 `DONE`.

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | Scope is one coherent consumer bug-fix Item: panel visibility follows user intent, accepted skill identity becomes immutable, and successful terminal status closes through the published result endpoint. Provider changes, runtime ownership closure, new pages/stores and unrelated P1 features are explicitly out. |
| G2 Existing capability | PASS | The PRD reuses the existing Chat panel state, Selection Bar, Main session-mode persistence, Gateway route resolution, SkillRunService SSE/poll lifecycle, RM-15 sidecar/Card, and File Platform. It identifies precise partial capabilities instead of proposing parallel implementations. |
| G3 Production ownership | PASS | Chat owns view intent, Main session mode owns durable skill identity, Gateway owns Provider HTTP adaptation, Service owns terminal coordination, and existing Session/File owners retain persistence/materialization. No second owner or Renderer transport authority is introduced. |
| G4 KEEP/MODIFY/ADD/REPLACE/REMOVE | PASS | C01–C07 are MODIFY on existing owners. The narrow obsolete behaviors are named with removal conditions. There is no ADD/REPLACE production owner and therefore no unmatched removal obligation. |
| G5 Contract / IPC / security | PASS | The status/result distinction is grounded in checksum-locked v1.5.0 schemas and endpoint matrix. Result stays behind same-origin/auth/sanitization boundaries; Main enforces skill conflict before Provider call; no raw event, URL, token or workspace path crosses Preload. |
| G6 Behaviour → AC | PASS | Explicit-open rules map to AC-01/02; accepted-time lock and restart semantics map to AC-03/04; result endpoint, race matrix, monotonic text and failure recovery map to AC-05/06/07; boundary, regression and LAT requirements map to AC-08/09/10. AC are observable and do not prescribe private test filenames or timing sleeps. |
| G7 Evidence integrity | PASS | Current contrary behavior is honestly recorded for visibility and clear action. New result and lock behavior require new evidence; affected security/regression claims require targeted reruns. No blocking failure is deferred to manual verification or mislabeled as prior PASS. |

## Spot Checks Against `grounded_commit`

- Session Files visibility defaults to shown through one cross-session local preference; Chat mounts the panel once a session id exists.
- Catalog selection writes session mode before a Run is accepted, and Selection Bar always receives a clear callback.
- Main session-mode persistence uses overwrite semantics and has no accepted-time immutable conflict rule.
- Gateway route resolution includes `resultPath`, while the public interface/implementation only reads the run snapshot for terminal status.
- SkillRunService confirms terminal and aborts SSE from both poll and event paths; the poll success patch can carry an absent result text.
- v1.5.0 publishes separate Public Run and Public Run Result schemas; only Result contains `text`, and its endpoint is declared safe to retry.
- Existing Skill Card renders report body only for non-empty result text while Artifact readiness is presented separately.

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | Plan must preserve the exact lock point: selection and rejected validation remain editable; the first accepted immutable request locks the session. A UI-only disabled X would not satisfy C03/AC-04. |
| N2 | NOTE | `result.text` is contractually nullable. C05/C06 correctly require non-empty result authority, fallback to already sanitized live text, and an explicit no-text/unavailable state instead of fabricated content. |
| N3 | NOTE | Terminal coordination must be event-order independent. Fixed sleeps or simply delaying abort without a single resolver would not satisfy AC-06. |
| N4 | NOTE | C01 intentionally rejects a global visible preference as the trigger for a new session; existing file content and File Platform operations stay unchanged. |

## Review Closure

The PRD is semantically complete and may converge from `REVIEW_REQUIRED` to `APPROVED` without requirement changes. RM-16 should then move from `READY` to `IN_PRD` with this PRD path and remain without a Plan until a later explicit planning request.
