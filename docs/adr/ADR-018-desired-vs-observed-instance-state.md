# ADR-018: Desired vs Observed Instance State

## Status

Accepted (PRD v1.5)

## Context

DB `status=running` / `healthy=true` was treated as live truth, so crashes left
stale Ready state until a Desktop refresh.

## Decision

Split:

- **Desired state**: `running` | `stopped` (user/API intent; `auto_start` migrates to desired)
- **Observed state**: `process_state`, `api_state`, `ownership_state`, counters, timestamps

`start`/`stop`/`restart` first write desired state, then reconcile. Observed state
is continuously updated by `GatewayHealthWorker`. Legacy `status`/`healthy` remain
compatibility projections only.

## Consequences

- Multi-instance readiness uses explicit `name=default` + observed API health
- Desktop consumes `/instances/{id}/state` and readiness, not local probes
