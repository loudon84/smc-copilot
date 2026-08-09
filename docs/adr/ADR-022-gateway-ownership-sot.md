# ADR-022: Gateway Ownership Single Source of Truth

## Status

Accepted (PRD v1.5.2 Hotfix)

## Context

v1.5.1 introduced `GatewayOwnershipService.inspect()` with `adopted` / `conflict`, but `InstanceGatewayService` still called `verify_ownership()` from refresh and Health Worker. Dual ownership paths caused adopted Gateways to be reclassified as conflict/exited on the next tick.

## Decision

1. `GatewayOwnershipService.inspect()` is the only ownership SOT for InstanceGatewayService, Health Worker, reconcile, and API projections.
2. `verify_ownership()` remains an internal helper used by the ownership service / process manager only.
3. Observed state is written through `_apply_gateway_observation()` so refresh, worker, and reconcile cannot diverge.
4. `not owned ≠ exited`; only stale/missing listener fingerprints mark `process_state=exited`.
5. Current observation clears historical `GATEWAY_PORT_OWNERSHIP_CONFLICT` when ownership recovers.
6. CI guards enforce SOT (`check:gateway-ownership-sot`, `check:no-not-owned-equals-exited`).

## Consequences

- Chat/Task logic unchanged; readiness recovers when `executionEligible` becomes true.
- Force kill / takeover remains forbidden for foreign healthy Gateways.
