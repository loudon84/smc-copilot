# ADR-011: Development Hermes Registration

## Status

Accepted (PRD v1.4.1 Hotfix Phase C)

## Context

`npm run dev:runtime` previously only detected a local Hermes CLI and always
exited 0 without registering a `RuntimeVersion` or ensuring the default
instance. Developers with a working `hermes` on PATH still saw empty Runtime
versions and no auto-started Gateway.

## Decision

- Add `DevHermesRegistrationService` invoked from `scripts/dev_bootstrap.py`.
- Resolve executable via `HERMES_DEV_EXECUTABLE` override, else `shutil.which("hermes")`.
- Validate with `hermes --version`; register via `RuntimeVersionService.register_external`
  with `channel=development` and `metadata_json={"source":"external-dev","managed":false}`.
- Ensure default instance through public `InstanceService.ensure_default(...)`.
- Missing Hermes is non-fatal unless `HERMES_DEV_REQUIRED=1`; invalid override,
  validation failure, or DB write failure exits non-zero so nx `&&` chains stop.

## Consequences

- Dev Runtime boots with an Active RuntimeVersion + default Instance when Hermes
  is available locally.
- No UI path to register arbitrary external Hermes (security).
- InstallationService reuses `ensure_default` instead of a private helper.
