# ADR-020: Gateway Ownership Recovery Across Runtime Reload

## Status

Accepted (PRD v1.5.1 Hotfix)

## Context

Uvicorn `--reload` and Runtime restarts drop in-memory `GatewayProcessHandle` while Hermes Gateway processes remain listening. Without persistent fingerprints and Safe Adoption, Supervisor mis-reports `GATEWAY_PORT_OWNERSHIP_CONFLICT` even when `/health` is 200.

## Decision

1. Persist Gateway fingerprints on Instance (`exe`, `command_hash`, `create_time`, `owner_runtime_id`, …).
2. On boot, run `GatewayOwnershipService.inspect` before starting Gateways; restore as `adopted` when fingerprints match.
3. In `development_stub`, preserve Gateways on shutdown (detach handles) so reload workers can re-adopt.
4. Safe Adoption is evidence-gated (exe+command+profile+port+auth health); health alone never grants ownership.
5. Stop/restart return 409 `GATEWAY_NOT_OWNED` when ownership is not owned/adopted.

## Consequences

- Chat readiness requires `ownership in {owned, adopted}` plus healthy Gateway API.
- Production defaults keep Safe Adoption off unless explicitly enabled.
