# ADR-032: OPSI Production Rings and Multi-Depot Awareness

## Status

Accepted (OPSI v1.3 engineering). Live Production Rings remain `not_proven` until operator signoff.

## Context

ADR-031 introduced OPSI as a parallel Endpoint Control Plane. v1.2 added Pilot orchestration for 10–20 endpoints on a single Config Server. Production expansion to 21–500 endpoints and 1–8 Depots requires fail-closed inventory, per-Depot attestation, deterministic rings, rate budgets, global freeze, and Evidence Manifest v2 — without copying files onto Depots or talking to Endpoint/Gateway/Work.

## Decision

1. Single OPSI Config Server. Scope is 21–500 endpoints and 1–8 Depots. No OPSI HA/DR, multi-config-server, or provider migration in v1.3.
2. `opsi-control` verifies OPSI-native distribution via ProductOnDepot + signed Depot Artifact Attestation. It does not implement Depot file copy, SSH, SMB, or WinRM.
3. Campaign `mode` defaults to `pilot` (10–20). `production` requires 21–500, stable artifact, v1.2 proven GO record, Depot attestation, and triple approval.
4. Ring 0 is 1–2 hosts per Depot (global ≤25, all Depots covered). Later rings are cumulative 10%/25%/50%/100% from a frozen client→depot mapping digest.
5. Scheduler uses per-campaign/per-depot leases, weighted fair Depot lanes, and the strictest of global/campaign/depot rate budgets. Workers enqueue Actions only; Dispatcher/Reconciler run independently.
6. Ring 0 failure pauses the Campaign. Later rings pause the Depot lane first, then escalate. Critical causes write a global freeze. Freeze is checked at claim and dispatch. Clear requires dual approval after root cause close.
7. Rollback scopes are target, depot, ring, and campaign. `ROLLED_BACK` is written only after Action Result, Product read-back, Gateway probe, and Work smoke evidence.
8. Fleet compliance is read-only. Repair requires a new signed Campaign.
9. Work remains Direct Hermes. Salt and Runtime trees stay unmodified. Production start and stable promotion read a persisted signed Gate record — not request body, env, or ordinary flags.

## Consequences

- v1.2 Pilot payloads without `mode` remain valid.
- Live v1.2 `proven / GO` is an operator gate; engineering tests must not write that decision in `SMC_OPSI_ENV=production`.
- v1.4 Fleet GA + HA/DR is out of scope until v1.3 Production Evidence is signed.
