# ADR-021: Gateway Launcher vs Listener Identity

## Status

Accepted (PRD v1.5.2 Hotfix)

## Context

Hermes Gateway on Windows commonly runs as a launcher process (`hermes.exe`) that spawns a separate listener (often `python.exe`) bound to the gateway port. Persisting the spawn PID as the sole process identity caused false `GATEWAY_PORT_OWNERSHIP_CONFLICT` when launcher PID ≠ listener PID.

## Decision

1. Persist both launcher and listener identities (`gateway_launcher_*`, `gateway_listener_*`) with `gateway_fingerprint_version=2`.
2. After spawn, `GatewayListenerResolver` discovers the port listener and verifies process lineage before claiming ownership.
3. Ownership recovery after Runtime reload uses **listener** fingerprint; launcher may be dead.
4. Compatibility columns `pid` / `process_create_time` map to listener identity; never treat spawn PID as listener without resolver verification.
5. Launcher exit emits `gateway.launcher.exited`; `gateway.process.exited` requires listener gone/stale.

## Consequences

- Safe Adoption must not require `listener_exe == launcher_exe`.
- Health Worker and refresh must not infer exit from launcher death alone.
- Migration 021 copies existing `pid` to launcher only; listener rediscovered on reconcile.
