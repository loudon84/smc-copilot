# Skill Run Transcript and Session Live-Sync Architecture Review

**Mode:** initial
**Verdict:** PASS

## Blocking Findings

None.

## Major Findings

None.

## Minor Findings

- Roadmap frontmatter still names `work/prd-v4.0` while current delivery branch and this increment use `work/prd-v4.1`. The RM-15 Roadmap update should align this metadata without changing the parent architecture identity.
- The proposal file `PRD-WORK-v4.0.1-M6i.md` is architecture-heavy and contains exact schemas/files. After RM-15 becomes READY, PRD Grounding should replace it with a canonical Stage PRD rather than treating the proposal text as already approved.

## Roadmap Notes

- Add RM-15 as READY with direct dependencies RM-04、RM-05、RM-08、RM-09; all are already DONE.
- RM-15 must remain independent from RM-13/RM-14 and must not change their BACKLOG state.
- The Stage PRD should classify Existing Session persistence、Chat/MessageList、Renderer projection store、session cache/Sidebar and File Platform as existing owners; the sidecar is an extension beneath Session persistence, not a new Production Owner.

## Gate Assessment

| Gate | Result | Evidence |
|---|---|---|
| A1 Problem Necessity | PASS | Current source materializes only coarse rows, uses `promptSummary`, keeps live projection outside Chat messages, and does not notify Sidebar state after cache upsert. |
| A2 Existing Capability / Reuse | PASS | Decision extends existing Chat、Session loader/cache、continuation and File Platform owners; no new Chat/session/file surface is introduced. |
| A3 Alternatives | PASS | Plain messages、permanent continuation、new DB/full-history IPC and selected sidecar option are compared with concrete tradeoffs. |
| A4 Ownership / Boundary | PASS | Session owns sidecar persistence/history/delete; SkillRunService owns sanitized delta production; Renderer owns presentation only. |
| A5 Dependencies / Cascading Effects | PASS | Complete-before-cap persistence、fallback-row replacement、cache-only Sidebar refresh、delete cleanup and delta independence are explicit. |
| A6 Security / Operability | PASS | Raw Provider data and secrets stay in Main boundary; persistence failure does not mutate remote phase and must be observable/retryable. |
| A7 Pre-mortem / Kill Criteria | PASS | Duplicate cards、history truncation、DB hammer、raw payload leakage and parallel-owner drift have enforceable stop conditions. |
| A8 Roadmap Decomposability | PASS | One RM-15 can be sliced into Live、Durable/History、Sidebar and Recovery outcomes while exact files/Todos remain deferred to Plan. |

## Closure Table

No OPEN BLOCKER or MAJOR finding.

## Conclusion

The decision is suitable for convergence. Its key architectural protection is that the Desktop-owned tables are a Session-owned execution-audit sidecar: `messages` remains the readable transcript/session identity SOT, while sidecar data supplies complete typed Skill history through the existing session loader.
