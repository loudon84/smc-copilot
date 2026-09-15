---
name: smc-prd-converge
description: GES 5 deterministic PRD approval transition preserving governance profile, clarification decisions, evidence baseline and source grounding.
version: 4.0.0
disable-model-invocation: true
---

# SMC PRD Converge v4.0

Preconditions: latest PRD Review PASS, no OPEN BLOCKER/MAJOR, profile validator PASS, project PRD
validator PASS when present.

Preserve all canonical intent including `governance_profile`, Current/Target Capability Inventory,
stable Change IDs, Owner/Boundary/Behaviour/AC, minimal Source Anchors, Evidence/Acceptance Claim
Baseline, Clarification Ledger, `source_revision`, `grounded_commit`, and Domain Design Intent.

Set only approval state:

```yaml
status: APPROVED
review_verdict: PASS
approved_at: <ISO-8601>
```

Converge MUST NOT upgrade/downgrade profile, change owner/boundary, or redo source analysis.
An APPROVED PRD may then run Domain Pack v2 `preplan` validation if configured and proceed to the
single Plan Author.
