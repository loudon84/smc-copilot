# ADR-028: Salt Control Authentication

## Status

Accepted (PRD Work v2.2)

## Decision

| Actor | Mechanism |
| --- | --- |
| Bootstrap | One-time Enrollment Token (server stores hash only) |
| Endpoint | Opaque Device Credential; DPAPI Machine Scope on disk; `Authorization: Device <cred>` |
| Salt Master / Backend / Worker | OAuth2 Client Credentials → short-lived JWT (audience/scope separated) |
| Operator Rollout | Enterprise OIDC JWT with `salt.rollout.admin` |

All production APIs are HTTPS-only. Tokens/secrets never appear in logs or error bodies.

## Consequences

Enrollment Token hash derivation of Endpoint ID is forbidden. Device Credential is returned once at enrollment create.
