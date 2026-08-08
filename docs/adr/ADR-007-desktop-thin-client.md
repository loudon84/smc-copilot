# ADR-007: Desktop is a Runtime thin client

## Status

Accepted (PRD v1.4 Phase G/H)

## Context

Desktop historically owned Portal Runtime, Copilot Serve process lifecycle, Hermes
Gateway start/stop, and local Expert MCP proxy. That duplicated control planes and
blocked a single SOT for Agent readiness.

## Decision

- Desktop is a **Runtime Client** only: UI, OS integration, pairing, and Main-only
  HTTP via `@smc/runtime-client` to `http://127.0.0.1:8765`.
- Agent control plane (install, gateway, instances, Expert MCP) lives in
  `services/runtime` exclusively.
- CI guards under `apps/desktop/scripts/check-no-desktop-*.mjs` enforce the boundary.

## Consequences

- Settings must not offer Desktop Install/Start for Portal/Serve/Hermes processes.
- Legacy IPC/process managers are removed or stubbed; violations fail `npm run guard`.
