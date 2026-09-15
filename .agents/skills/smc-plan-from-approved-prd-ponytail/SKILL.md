---
name: smc-plan-from-approved-prd-ponytail
description: GES 5 single canonical Plan author. Emits smc.plan.v3.7 with LEAN/FULL governance profile, Domain v2 activation and Test Asset binding while preserving Ponytail minimality and Single Writer.
version: 4.0.0
disable-model-invocation: true
---

# SMC Plan From Approved PRD — GES 5

## Purpose

Convert exactly one APPROVED Stage PRD into exactly one canonical Cursor `.plan.md`. GES 5 adds
`smc.plan.v3.7` and `governance_profile: LEAN|FULL`; it does not add another Plan owner.

## Gate 0 — Approved PRD

Require `status: APPROVED`, `review_verdict: PASS`, non-empty `approved_at`, valid PRD profile, and
all activated Domain v2 preplan decisions closed. If the PRD profile is LEAN but hard architectural
risk remains, return `PRD_PROFILE_STALE` / `FULL_REQUIRED`.

## Gate 0.5 — Single identity

New Plan frontmatter includes:

```yaml
plan_contract: smc.plan.v3.7
plan_id: <stable work item>
governance_profile: LEAN|FULL
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
domain_contract: smc.ges.domain-activation.v2
```

CREATE requires no existing Plan with that ID. REVISE edits only the canonical Plan.

## Gate 1 — Requirement closure

Map every blocking AC/DoD to stable IDs, Change IDs, Todo ownership and blocking Verification.
Preserve Acceptance Claim Baseline semantics. LEAN may use a compact ledger but cannot omit a
blocking requirement.

## Gate 2 — Implementation grounding

For each non-KEEP Change:

1. start from approved Production Owner / anchor;
2. locate exact `path#symbol`;
3. read target symbol and necessary direct caller/callee;
4. search existing helper/schema/type/fixture/shared path;
5. locate root-cause / behavior anchor;
6. reuse fresh Source Context Capsules when content hash matches;
7. expand reading only when a real trigger requires it.

If the approved PRD cannot be implemented without changing owner/contract/boundary, return
`PRD_STALE_OR_CONFLICTING` instead of silently redesigning in Plan.

## Gate 3 — Ponytail minimality

Choose the first correct option:

```text
REUSE_EXISTING
STDLIB
NATIVE
INSTALLED_DEP
MODIFY_EXISTING
MINIMAL_NEW
NEW_DEPENDENCY
REMOVE_ONLY
GENERATED_ENTRYPOINT
```

`NEW_DEPENDENCY` or architectural ownership change upgrades a LEAN plan to upstream PRD revision.

## Gate 4 — Single Writer

Stable `C01...` Change IDs. A Change ID has one Todo owner; each production `path#symbol` has one
WRITE_OWNER. Resolve hotspots by merge/hoist/single hotspot owner; never hide conflicts in prose.

## Gate 5 — Cursor Todo projection

Every `## Todo Tn — ...` maps to one frontmatter todo with deterministic id/content/status.
Plan Author owns id/content; Delivery owns runtime status.

## Gate 6 — Governance profile

Common mandatory sections for LEAN and FULL:

- Change Matrix / Write Ownership;
- Requirement Coverage;
- Todo mapping / dependencies;
- Verification Ledger;
- Domain Activation Ledger;
- Test Asset Ledger;
- acceptance/commit policy.

FULL includes all triggered lifecycle/contract/data-flow closure. LEAN omits only sections that are
provably not applicable. A validator-detected hard trigger returns `PLAN_LEAN_FULL_REQUIRED`.

## Gate 7 — Domain Pack v2

Resolve profile + Change Matrix using Domain Runtime v2. Activated domains may add Plan extension
ledgers. Preplan intent comes from the approved PRD; Plan may bind exact source/test paths but may
not reinterpret Domain Design Intent.

## Gate 8 — Test Asset binding

Reuse project-level fixtures/drivers when possible. `REUSE` assets are immutable for the current
Plan; `EXTEND/NEW` must refresh asset manifest and proof.

## Exit

Static validation -> semantic review -> `smc-plan-delivery`. No Todo commit and no second plan.
