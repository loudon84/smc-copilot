# ADR-005: Generated Runtime Client Is Main-Process Only

## Status

Accepted

## Context

Runtime device tokens and local control-plane credentials must not leak into Renderer.

## Decision

`@smc/runtime-client` may be imported only from Electron Main (or another trusted local service). Renderer/Preload continue to use IPC wrappers.

## Consequences

- Alias/path mapping is configured for Main (`electron.vite.config.ts` + `tsconfig.node.json`).
- Existing process-control contracts (`copilot-serve-contract`) remain separate from HTTP API client types.
