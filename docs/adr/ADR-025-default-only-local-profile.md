# ADR-025: Default-only Local Hermes Profile

## Status

Accepted (PRD v1.5.3 Hotfix)

## Context

Hermes supports named profiles under `~/.hermes/profiles/<name>/`, but SMC Copilot local Runtime currently supervises a single Gateway on `:8642` with the default home layout.

## Decision

1. Local Runtime only supports profile `default` → `HERMES_HOME=~/.hermes` → Gateway port `8642`.
2. `require_supported_local_profile()` rejects named profiles with `LOCAL_HERMES_PROFILE_UNSUPPORTED`.
3. Underlying path helpers for named profiles remain for future Multi-Profile Runtime.
4. Boot reconcile marks unsupported instances `desired_state=stopped` without deleting data.
5. Exactly one `HermesInstance(name="default")` is expected; duplicates surface as `DEFAULT_INSTANCE_CONFLICT` in diagnostics.

## Consequences

- Chat/Task readiness continues to resolve the default instance by name.
- Multi-profile support requires a dedicated future version, not this hotfix.
