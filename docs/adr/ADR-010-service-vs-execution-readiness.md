# ADR-010: Service vs execution readiness

## Status

Accepted (PRD v1.4 Phase G/H)

## Context

A single `RuntimeDegraded` / aggregate status blocked Chat, Settings, MCP, and
updates whenever any subsystem failed (e.g. missing update manifest), even when
Hermes execution was healthy.

## Decision

- Expose Readiness v2 with separate layers: `service`, `execution` (chat/task),
  `maintenance`, `expertMcp`.
- Desktop Domain Gate uses `window.copilotRuntime.getReadiness` — Chat/Task gate on
  `execution.*`, Expert tools on `expertMcp`, updates on `maintenance`.
- Offline connection banner must not present Desktop Install/Start Runtime as the
  primary CTA.

## Consequences

- Partial degradation is domain-scoped banners, not a global hard block.
- Capability missing → “upgrade Runtime”, never silent legacy fallback.
