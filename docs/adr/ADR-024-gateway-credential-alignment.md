# ADR-024: Gateway Credential Alignment

## Status

Accepted (PRD v1.5.3 Hotfix)

## Context

Even when Runtime injected `API_SERVER_KEY` into the child environment, Hermes reloaded `.env` and could override it. Separately, Runtime clients often used a different SecretStore key. Liveness (`GET /health`) does not prove authentication.

## Decision

1. Invariant `HERMES_GATEWAY_CREDENTIAL_ALIGNMENT`: Gateway configured key == Runtime client key, both from `HermesLocalConfigService`.
2. `GatewayCredentialService` and InstanceGateway spawn secrets resolve `API_SERVER_KEY` from Hermes dotenv only.
3. `HermesGatewayClient.health_check()` treats `/health` as public liveness; when an api_key is present it must also succeed on authenticated `GET /v1/models`.
4. Auth failure maps to `GATEWAY_AUTH_FAILED` / `api_state=unauthorized` and blocks `executionEligible`.
5. Business code constructs authenticated clients via `HermesGatewayClientFactory`.

## Consequences

- Health Worker and startup share the same probe semantics.
- Diagnostics expose fingerprint and auth status, never the raw key.
