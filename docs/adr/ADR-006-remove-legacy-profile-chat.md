# ADR-006: Remove legacy Profile Chat routes

## Status

Accepted (PRD v1.1 Phase 6)

## Context

`/api/v1/profiles/{profileId}/chat/*` was deprecated with Sunset 2026-08-01.
Desktop Workspace Chat still depended on those paths while Instance chat and
Chat Runtime v2 were available.

## Decision

- Remove Runtime legacy Profile Chat endpoints (models, model-config, completions, abort).
- Desktop Workspace Chat resolves Profile → Instance and calls `/api/v1/instances/{id}/chat/*`.
- Chat Runtime v2 (`/api/v1/chat-runs*`) remains the durable runtime for `window.chatRuntime`.
- Bump `contracts/version.json` `runtimeApi` to `2.0.0` (removed endpoints).

## Consequences

- Clients still calling `/profiles/*/chat/*` must migrate.
- Desktop `check:no-legacy-profile-chat` is a blocking production gate.
