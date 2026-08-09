# ADR-015: Hermes Supervisor Ownership Model

## Status

Accepted (PRD v1.5)

## Context

Runtime must be the exclusive owner of Hermes Gateway processes. Treating a
listening port or a bare PID as ownership proof is unsafe (PID reuse, foreign
listeners).

## Decision

Ownership requires **all** of:

1. PID alive
2. `process_create_time` matches persisted fingerprint
3. PID listens on the expected gateway port
4. Executable matches expected Hermes (when available)

Only `ownership == owned` may `terminate` / `kill` / `restart`. Foreign or stale
fingerprints yield `GATEWAY_PROCESS_OWNERSHIP_CONFLICT` / port conflict errors
and never kill unknown PIDs.

## Consequences

- `GatewayProcessFingerprint` persisted on start
- Boot reconcile adopts owned healthy gateways; clears stale PID without kill
- Desktop must not manage Gateway PIDs or ports
