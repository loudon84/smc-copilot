# ADR-027: Salt Control Service

## Status

Accepted (PRD Work v2.2)

## Context

v2.1 proved Salt can replace Endpoint Control Plane in-repo, but enrollment, desired state, secrets, returns, artifacts, and rollout still used fixtures/local sinks. Production needs a dedicated integration service between SMC Management Backend and Salt Masters.

## Decision

1. Introduce `services/salt-control` as the Salt Integration API (`/salt/v1`).
2. Owns Enrollment, Desired State projection, Key accept orchestration, Job Returns, Artifact metadata, Secret broker, and Rollout gates.
3. Does **not** proxy Chat/Task/SSE.
4. Must not import `services/runtime` at runtime.
5. FastAPI + Pydantic v2 is the OpenAPI SOT → `contracts/salt-control-api/openapi.yaml`.

## Consequences

- Runtime Endpoint Control Plane can be deprecated after Ring 3 stability.
- Clients call Salt Control for bootstrap/enrollment instead of inventing Endpoint IDs.
