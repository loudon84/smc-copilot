# ADR-012: Runtime Port Ownership

## Status

Accepted (PRD v1.4.1 Hotfix Phase D)

## Context

Desktop historically owned Agent-side listeners (MCP proxy `:18781`, Gateway
lifecycle toward `:8642`). Thin Client requires Runtime to own Agent data-plane
ports while Desktop remains an HTTP client of `:8765`.

## Decision

Canonical port ownership (PRD v1.4.1 §60):

| Port | Owner | Notes |
|------|-------|-------|
| `8765` | Copilot Runtime | Desktop connects here only |
| `8642` | Runtime-managed Hermes Gateway | Desktop must not start/stop/probe as control plane |
| `18781` | **Removed** | Desktop MCP Agent proxy deleted |
| Browser tool bridge ports | Desktop Web Operator | Whitelisted local tooling only |

When Gateway start finds a foreign process on the instance port, Runtime records
`gateway_port_conflict` on the instance and does **not** kill the external PID
(`kill_unknown_port_listeners=False`).

## Consequences

- Desktop CI guards ban `:18781` and Agent `createServer` outside whitelist.
- Operators clear foreign Gateway listeners manually; Runtime surfaces conflict.
