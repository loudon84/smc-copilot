# WORK v4.2 RM-03 Skill Run Native Projection and Reopen Parity — Initial PRD Review

**PRD:** `docs/work/PRD-WORK-v4.2-RM-03-skill-run-native-projection-reopen-parity.md`
**Mode:** initial architecture review
**Grounded commit:** `f62df916dc66726ba735a9663562a3ae18ee502d`
**Verdict:** PASS

## Findings

No OPEN BLOCKER.
No OPEN MAJOR.
No OPEN MINOR.

## Seven Gates

| Gate | Verdict | Review result |
|---|---|---|
| G1 — Scope | PASS | RM-03 is limited to the normal Skill Run transcript presentation and deterministic live/reopen/restart parity. It preserves RM-04's removal/rollback closure, original Chat, compact controls, and File Platform. Expert/HermesTask, migration/backfill, a third mode, and registry work are explicitly out. |
| G2 — Existing capability / duplicate owner | PASS | The PRD reuses `ChatMessage → MessageList`, the existing Skill Run sanitizer, durable Session sidecar, prompt/assistant anchors, and File Platform. It identifies the current `skill_run` card and global timestamp merge as the limited gaps, without proposing a second list, store, transport, or Provider client. |
| G3 — Production ownership | PASS | Main continues to own remote execution, sanitization, durable audit, session-history read, continuation and file materialization. Renderer owns only the projection into the existing Native presentation. The normal-path card becomes rollback-only; it does not gain a competing primary owner. |
| G4 — Change classification | PASS | C01-C03 modify existing Native projection and safe identity/order data; C04 replaces the timestamp-based merge with a removal condition; C05 retains current lifecycle/control/file owners; C06 prohibits forbidden expansion. The replacement/removal matrix is explicit and preserves the Main Sessions/sidecar owners. |
| G5 — Contract and trust boundary | PASS | Stable identity/order facts are the minimal extension of the already-sanitized projection. The PRD rejects raw Provider data and Renderer writes, preserves the Provider public contract, and forbids converting remote activity into Hermes Chat execution/tool truth. |
| G6 — Behaviour to acceptance | PASS | AC-01 through AC-05 specify visible order, Native row uniqueness, in-place lifecycle updates, terminal snapshot authority, and anchored parity under timestamp anomalies. AC-06 through AC-08 preserve the control/file/Chat owners and closed two-mode boundary. |
| G7 — Acceptance/evidence integrity | PASS | All ACs and DoD statements are blocking and have a Claim Baseline. Existing Main service and sanitizer proof is marked targeted rerun because a new Renderer/Session consumer is introduced; the missing Native mapping and anchored merge are correctly new evidence, rather than being downgraded as observations. Scenario/tool/fixture details remain deferred to the canonical Plan. |

## Conclusion

PASS. The PRD may be deterministically converged to APPROVED. This review does
not approve a Plan, authorize implementation, or mark RM-03 DONE.
