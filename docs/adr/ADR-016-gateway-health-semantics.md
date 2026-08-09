# ADR-016: Gateway Health Semantics

## Status

Accepted (PRD v1.5)

## Context

`HermesGatewayClient.health_check()` previously returned `bool` and treated
`status_code < 500` on `/v1/models` as healthy, marking 401/403 as Ready while
Chat/Task failed auth.

## Decision

`health_check()` returns structured `GatewayHealthResult`:

- `healthy` only when reachable **and** authenticated against a successful known API
- 401/403 → `GATEWAY_AUTH_FAILED` (reachable, not authenticated, not healthy)
- Connection failure → `GATEWAY_UNREACHABLE`
- Fallback `/v1/models` uses the same strict semantics (no `<500 → healthy`)

## Consequences

- Readiness / Instance health never treat auth failure as healthy
- Auth failures do not trigger auto-restart loops
