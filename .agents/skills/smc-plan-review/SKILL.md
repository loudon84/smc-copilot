---
name: smc-plan-review
description: GES 5 adaptive semantic Plan gate. External NOT_REQUIRED/REQUIRED contract is stable; internal NONE/DELTA/FULL depth is profile- and risk-aware.
version: 2.0.0
---

# SMC Plan Review v2.0

External router remains:

```text
NOT_REQUIRED | REQUIRED
```

Actual review verdict remains:

```text
PASS | REVISE | RETURN_PRD
```

Internal cost depth:

```text
NONE   deterministic clearance for safe unchanged/low-risk semantics
DELTA  review only semantic changes against last accepted snapshot
FULL   full semantic review
```

`governance_profile: LEAN` biases toward NONE/DELTA but never overrides deterministic risk.
`FULL`, Acceptance Contract risk, new/changed boundary, LIVE/FAULT/EXTERNAL proof, lifecycle,
security, schema/protocol, cross-domain ownership or stale upstream semantics force FULL.

Review snapshots bind normalized semantic Plan hash. Cursor runtime status/display projection is
excluded from semantic change; Change Matrix, ownership, AC, Verification, Domain/Test Asset and
behavior changes are semantic.

A reviewer consumes a normalized review packet/diff and source anchors, not the entire historical
conversation. `NOT_REQUIRED` still writes a content-bound clearance record.
