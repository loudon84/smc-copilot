# ADR-013: Runtime Readiness Semantics

## Status

Accepted (PRD v1.4.1 Hotfix Phase A)

## Context

Desktop `RuntimeConnectionManager` treated aggregate Hermes install/status checks
as connection degradation. That forced global `RuntimeDegraded` even when
`readiness.service.ready` was true (e.g. execution/maintenance attention only).

## Decision

- Connection `Ready` requires **only** `readiness.service.ready === true`.
- If readiness cannot be fetched or `service.ready !== true` → `RuntimeDegraded`
  with `canRepair: true`.
- Status/hermesInstalled/check fields must not override a successful service
  readiness result.
- Domain banners remain separate: execution attention → “View Hermes Runtime”;
  connection-level Repair only for missing/starting/service degraded.

## Consequences

- Settings Connection can show Connected while Execution is Attention.
- Vitest `runtime-connection-readiness` guards the Ready matrix.
