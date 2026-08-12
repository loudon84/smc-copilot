# ADR-026: Salt owns Endpoint Control Plane

## Status

Accepted (PRD Work v2.0, extended by v2.1 client migration)

## Context

`services/runtime` currently mixes Endpoint Control Plane (Hermes install/upgrade, Gateway lifecycle, config sync, endpoint registration) with Chat/Task data-plane APIs. `apps/work` already talks to Hermes Gateway directly for Chat. PRD v2.0 requires proving Salt Master/Minion + SMC Hermes Extension can replace Runtime as the Endpoint Control Plane without deleting Runtime in this version.

## Decision

1. Endpoint Control Plane source of truth moves to Salt Master → Salt Minion → SMC Hermes Extension (`infra/salt`).
2. `services/runtime` Endpoint Control Plane APIs are **frozen**: P0/P1 bugfix and security only; no new Desired State / Endpoint Connection / Resource Reconciler features.
3. `apps/work` control owner:
   - `direct` (**default**): Legacy local adapter — probe/start Hermes Gateway (`:8642`); no Runtime `:8765`.
   - `salt` (`SMC_HERMES_CONTROL_OWNER=salt` or `%ProgramData%\SMC\control-owner.json`): `HermesAvailabilityBackend` only — probe Gateway `/health`, never spawn Gateway or call Runtime install/update/start.
   - `runtime`: opt-in Copilot Runtime HTTP control plane (`:8765`).
4. Chat/Session/Attachment/Task remain data plane: Salt must not proxy them.
5. Runtime and Salt must not both own Gateway. `control-owner.json` is the mutex.
6. Hermes Python/venv stays isolated from Salt Minion Python.
7. Runtime OpenAPI control-plane tags stay in the bundle as read-only/deprecated until a later archive version. Chat/Task contracts must not grow on Runtime if they should live on Hermes or a Task Service.

## Consequences

- Desktop (`apps/desktop`) continues to use Runtime `:8765` until a separate migration.
- `apps/work` Connection Ready defaults to Hermes Gateway without Runtime; Chat works with Runtime stopped in `direct` and `salt` modes.
- v2.1: Windows machine-scope Bootstrap installs Salt Minion 3008 LTS; enterprise `control-owner.json` is `salt`. Migration inventory v2 only counts **verified FULL** capabilities (`infra/salt/migration-capabilities.yaml`). v2.1 does not delete Runtime.
