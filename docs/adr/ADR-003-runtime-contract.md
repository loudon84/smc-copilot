# ADR-003: Export Runtime Contracts from FastAPI

## Status

Accepted

## Context

Hand-maintained OpenAPI / Desktop DTOs diverge from the live FastAPI surface.

## Decision

Treat FastAPI routes + Pydantic models as the authoring source. Export `create_app().openapi()` to `contracts/runtime-api/openapi.yaml`. Export SSE/error JSON Schemas from Runtime Pydantic models.

## Consequences

- Generated files are committed and drift-checked in CI.
- Manual edits to generated contracts are forbidden.
- Contract tooling lives under `tools/contract-generate/`.
