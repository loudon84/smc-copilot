# M6i Skill Run Transcript & Session Live-Sync Closure — Initial PRD Review

**Mode:** initial
**Verdict:** PASS

## Blocking Findings

None.

## Major Findings

None.

## Minor Findings

- The original `docs/work/PRD-WORK-v4.0.1-M6i.md` remains a proposal input and should not be mistaken for the canonical approved Stage PRD or implementation Plan.

## Gate Assessment

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | RM-15 is limited to live transcript、Session-owned durable history and Sidebar cache notification; Provider contract、streaming delta、Clarify response and Artifact transport are explicitly out. |
| G2 Existing Capability / duplicate owner | PASS | Existing SkillRunService、Chat/MessageList、Session persistence/loader、session-cache/Sidebar、continuation and File Platform are reused. The sidecar is justified only because ordinary message fields cannot preserve typed Skill activity without contract aliasing. |
| G3 Production Ownership | PASS | Sanitized delta stays with Main lifecycle/parser; durable write/history/delete stay with Existing Session persistence; Chat owns presentation; cache owner and Sidebar own notification/read projection. No second session/history IPC is created. |
| G4 Change Classification | PASS | C01、C03–C06 are MODIFY, C02 is a bounded ADD beneath the existing Session owner, and C07 freezes all adjacent owners as KEEP. No hidden REPLACE or orphan removal exists. |
| G5 Contract / Security Boundary | PASS | Raw Provider data、secrets、URLs、tool args/output and bytes cannot cross or persist; history remains on existing IPC; full Prompt stays local and is excluded from Projection/telemetry/cache event. |
| G6 Behaviour → Acceptance Criteria | PASS | Immediate/reject、live update、100 activity、full Prompt、multi-run、restart、Sidebar、fallback replacement、delete/failure、security and regression behaviours have observable AC. |
| G7 Acceptance / Evidence Integrity | PASS | Current transcript、Prompt、durable activity and Sidebar gaps remain `FAILED`/`NOT_TESTED` blocking claims. Prior RM-04/05/08/09 evidence is reused only where unaffected and targeted rerun is required for touched consumers. No blocking failure is deferred to another RM. |

## Review Notes for Plan

- Plan must prove the durable writer receives individual sanitized activity before the 32-item projection cap; deriving history from `projection.activities` alone is non-compliant.
- Plan must bind a single fallback-replacement identity based on `clientRequestId` so live, DB rows and sidecar cannot render duplicate cards.
- Sidebar verification must distinguish cache-only list refresh from full `syncSessionCache` and cover unsubscribe/payload validation.
- 100-activity、A/A/B multi-run and restart/replay scenarios are blocking, not stretch tests.

## Closure Table

No OPEN BLOCKER or MAJOR finding.

## Conclusion

The Stage PRD faithfully inherits the approved Architecture Decision and RM-15. It may converge to APPROVED and proceed to canonical Plan generation.
