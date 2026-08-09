# ADR-019: Gateway Automatic Recovery Policy

## Status

Accepted (PRD v1.5)

## Context

Gateways can crash while Runtime stays up. Blind restart storms worsen port
conflicts and hide configuration errors (bad API key).

## Decision

When `desired_state=running` and process exited:

- Auto-restart if `GATEWAY_AUTO_RECOVERY_ENABLED`
- Budget: `GATEWAY_MAX_RESTARTS` within `GATEWAY_RESTART_WINDOW_SECONDS`
- Over budget → `GATEWAY_CRASH_LOOP`, pause auto-restart

Never auto-restart for:

- `GATEWAY_AUTH_FAILED`
- `GATEWAY_PORT_OWNERSHIP_CONFLICT`
- configuration invalid / missing executable

Serialize recovery with per-instance `InstanceOperationLock`.

## Consequences

- `GatewayHealthWorker` owns continuous probe + recovery
- Operators use Diagnostics / Logs / manual Restart after crash loop or auth failure
