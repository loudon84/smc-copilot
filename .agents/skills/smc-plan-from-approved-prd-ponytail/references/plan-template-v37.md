---
plan_contract: smc.plan.v3.7
plan_id: <PLAN_ID>
governance_profile: <LEAN|FULL>
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
domain_contract: smc.ges.domain-activation.v2
consumer_profile: <PROFILE@VERSION>
domain_policy_digest: <sha256:digest>
todos: []
---

# <PLAN_ID> — <TITLE>

## Governance Profile

- Profile: `<LEAN|FULL>`
- Route rationale: <why>
- Escalation triggers checked: <none or list>

## Requirement Coverage Ledger

| Requirement | Change IDs | Todo IDs | Verification IDs | Blocking |
|---|---|---|---|---|

## Change Matrix

| Change ID | Kind | Action | File / Symbol | Target State |
|---|---|---|---|---|

## Write Ownership Ledger

| Path / Symbol | WRITE_OWNER | Readers / Dependents |
|---|---|---|

## Domain Activation Ledger

| Domain | Pack Version | Trigger Changes | Capabilities | Status |
|---|---:|---|---|---|

## Test Asset Ledger

| Verification ID | Asset ID | Kind | Path / Entrypoint | Required Capabilities | Action | Impact | Reason |
|---|---|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Requirement / Claim | Mode | Command / Oracle | Blocking | Evidence Policy |
|---|---|---|---|---|---|

## Todo T1 — <observable slice>

**Changes:** C01
**Writes:** `path#symbol`
**Reads:** <anchors>
**Depends On:** none
**Parallel Safe:** no
**Focused Check:** <command>

## Implementation Decisions

- Reuse/minimality decision: <...>

## Lifecycle Closure Matrix

N/A — bounded profile, unless triggered.

## Contract / Data Flow Closure Matrix

N/A — bounded profile, unless triggered.
