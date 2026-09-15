# SMC Engineering Method Runtime Contract v1

## Purpose

The engineering-method runtime controls **how an already-cleared Todo is implemented**. It is not a new governance artifact and does not own Plan, Review, Verification, Evidence, Commit, or Roadmap truth.

```text
Canonical Plan
  -> Static/Semantic clearance
  -> Engineering Method Router
  -> implementation engine
  -> Completion Audit / Review / Verification / Evidence / Commit
```

Runtime state lives only under:

```text
.smc/runs/<plan-id>/engineering/
```

and is working memory. It must never be treated as durable delivery proof.

## Profiles

| Profile | Typical work | TDD | Debugging | Model | Task review |
|---|---|---|---|---|---|
| `MECHANICAL` | config, metadata, exact low-judgment edit | preferred or not-applicable | on failure | FAST | UNIFIED |
| `BEHAVIOR_CHANGE` | new/changed observable behavior | required when clear; preferred when classification is ambiguous | on failure | STANDARD | UNIFIED |
| `BUG_FIX` | defect/regression/failing behavior | required regression cycle | required before fix | STANDARD | UNIFIED |
| `HIGH_RISK` | auth/security/concurrency/migration/protocol/trust boundary | required where testable | required for bug-shaped work, otherwise on failure | REASONING | INDEPENDENT |

Classification is deterministic guidance, not permission to escape Plan scope. Any controller override must be written to the method artifact, which binds the current semantic Plan hash; malformed or stale artifacts block method gates until reclassified.

## Frozen Governance Boundaries

The method runtime must preserve:

- one canonical Plan and Todo identity;
- one production write owner per governed `path#symbol`;
- no implementation outside the current Todo write scope;
- `post_review` commit policy;
- Todo completion remains weaker than `IMPLEMENTED_AND_PROVEN`;
- final blocking Verification remains owned by `smc-plan-delivery` evidence flow;
- content change continues to stale prior proof.

TDD RED and debugging experiments are **execution evidence**, never final Verification FAIL/PASS records.

## Scope Escalation

If debugging or TDD reveals that the real fix requires a path/symbol outside the Todo write set, stop implementation:

```text
implementation-local scope error -> PLAN_REVISE_REQUIRED
owner / contract / boundary / observable-behavior drift -> RETURN_PRD
architecture assumption failure -> architecture review path as required
```

A controller cannot use a local ruling to bypass those boundaries.

## Unified Task Review

`UNIFIED` means one task reviewer returns two independent verdict dimensions:

```text
SPEC: PASS | FAIL
QUALITY: PASS | FAIL
```

It reduces reviewer seats but does not merge the meanings of the two checks. `INDEPENDENT` may dispatch separate reviewers for high-risk changes.
