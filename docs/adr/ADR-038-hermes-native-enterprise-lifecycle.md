# ADR-038: Hermes Native Enterprise Fork owns endpoint Hermes lifecycle

Work no longer treats OPSI, Salt, or Copilot Runtime as the local Hermes install/update/lifecycle owner. A Windows endpoint that runs SMC Copilot Work uses Hermes Native Enterprise Fork (`%LOCALAPPDATA%\hermes`, user ONLOGON Gateway, company Git as the only Hermes source). This is hard to reverse, surprising against ADR-031, and the trade-off is dropping machine-wide SYSTEM Gateway in favor of Native defaults.

## Status

Accepted for product architecture (Work Runtime Architecture v2). Implementation is authorized by `PRD-WORK-HERMES-NATIVE-ENTERPRISE-RUNTIME-V2` v2.1.1 `APPROVED_FOR_PLAN` on `work/prd-v6.0 @ 1ad1af60a2ab13d93da92cb06cb3b7aff7a08e31`.

Supersedes **ADR-031 Decision 2 and Decision 4** for Hermes Agent only. Does not rewrite OPSI as a control plane for non-Hermes products. Does not re-enable Salt trees (repository routing: `infra/salt/` and `services/salt-control/` stay agent-disabled).

## Context

ADR-031 made `%ProgramData%\SMC\control-owner.json` `hermes` a mutex over `direct | salt | opsi | runtime`, and named `smc-hermes-agent` as the OPSI product adapter for Hermes install/update. That conflicted with the v2 decision that Work is a Native Hermes consumer and OPSI must not carry Hermes runtime.

## Decision

1. Local production Hermes lifecycle owner is Hermes Native Enterprise Fork. Work is Adapter/Bootstrap only.
2. Local production **effective** `control-owner` is always `direct` (Native). Observed `opsi` / `salt` in `control-owner.json` MUST NOT block READY, Update, or Doctor. Doctor MAY warn.
3. `runtime` remains an explicit lab switch to Copilot Runtime `:8765`, not the production default.
4. OPSI product `smc-hermes-agent` MUST leave the Work/Hermes release pipeline. OPSI MAY continue for other products.
5. Production Hermes Root is `%LOCALAPPDATA%\hermes` (per-user Native default), not `C:\ProgramData\SMC\Hermes`.

## Considered Options

- Keep OPSI as a zero-payload Bootstrap invoker: rejected (NON-GOAL; dual owner).
- Keep machine-wide ProgramData + SYSTEM Gateway: rejected (freeze Native default).

## Consequences

- Work IPC that currently calls `isExternallyManagedControlOwner()` for update/doctor MUST switch to **effective** owner.
- ADR-037 Managed Endpoint v2 (machine instance / ProgramData) is not the Work v2 production layout. Do not implement ADR-037 paths as Work local production.
- A later ADR is required if a fleet later needs machine-wide Hermes again.
