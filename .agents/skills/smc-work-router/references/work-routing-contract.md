# Work routing contract

The router consumes a JSON object of explicit booleans. Unknown or omitted capability/risk facts force FULL. Set existing_owner, existing_capability, bounded_writes and deterministic_verification true for LEAN; every risk field listed in work_router.py must be false.

`research_only` is a hint alias for `research_intent`. It cannot alone produce SPIKE/NONE. The router computes `effective_research_only` only when:

- `research_intent` (or legacy `research_only`) is true;
- `governed`, `retained_production_change`, `production_write_requested`, and `durable_product_artifact_requested` are all explicitly false;
- `previous_profile` is None or NONE.

Any missing/unknown authority fact, governed/production conflict, or retained production change fails closed to FULL with a stable reason code. A retained production change is never research_only.

The caller loads previous governance_profile from the canonical artifact; pass --previous-profile on continuation. Project policy paths are additive guidance below Frozen Invariants and Approved Architecture. Policy conflicts return upstream; a policy document cannot grant a new delivery owner or waive evidence requirements.
