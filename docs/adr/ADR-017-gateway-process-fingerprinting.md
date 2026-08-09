# ADR-017: Gateway Process Fingerprinting

## Status

Accepted (PRD v1.5)

## Context

After Runtime or Gateway crash, OS PID reuse can make `pid_exists(stored_pid)`
true for an unrelated process. Killing by PID alone is unsafe.

## Decision

On Gateway spawn, capture and persist:

```text
pid + process_create_time + executable_path + gateway_port + instance_id
```

`verify_ownership()` rejects create_time mismatch as stale/foreign and forbids kill.

## Consequences

- `HermesInstance.process_create_time` column (Alembic 019)
- Stop/restart paths pass fingerprint into `GatewayProcessManager.stop`
