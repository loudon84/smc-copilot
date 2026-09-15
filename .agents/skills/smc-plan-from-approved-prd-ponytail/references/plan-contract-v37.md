# SMC Plan Contract v3.7

v3.7 is v3.6 plus adaptive governance metadata. It deliberately keeps the delivery truth contract
unchanged.

## Required frontmatter

```yaml
plan_contract: smc.plan.v3.7
plan_id: <stable-id>
governance_profile: LEAN | FULL
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
domain_contract: smc.ges.domain-activation.v2
consumer_profile: <id@version>
domain_policy_digest: sha256:<digest>
```

## Required for both profiles

- stable Change IDs;
- one canonical Plan identity;
- Cursor Todo projection;
- Requirement Coverage Ledger;
- Change Matrix / Single Writer;
- Domain Activation Ledger;
- Verification Ledger;
- Test Asset Ledger;
- blocking acceptance closure;
- post-review commit handoff.

## LEAN

LEAN allows `N/A — bounded profile` for untriggered full-only closure sections. It cannot use N/A
for ownership, acceptance, domain activation, test assets, verification or commit semantics.
Hard risk signals force Plan/PRD revision to FULL.

## FULL

FULL retains complete contract/data-flow/lifecycle closure whenever applicable.

## Compatibility

Readers continue to support v3.3-v3.6. New Plan creation targets v3.7. In-flight v3.6 plans are not
bulk migrated.
