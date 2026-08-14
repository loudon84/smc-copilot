# ADR-031: OPSI as a parallel Endpoint Control Plane provider

## Status

Accepted (OPSI v1.0) — live OPSI 4.3 Lab verification remains `not_proven` until operator signoff.

## Context

ADR-026 made Salt the default Endpoint Control Plane source of truth and froze Runtime Endpoint APIs. Some customer deployments already operate OPSI 4.3 (`opsiconfd` HTTPS `:4447/rpc`) and must not be forced onto Salt. Work Chat remains a Direct Hermes Client (`localhost:8642`). Runtime Endpoint Control stays frozen (ADR-030).

## Decision

1. Endpoint Control Plane **default SOT remains Salt** (`infra/salt` + `services/salt-control`). Customer deployments **may choose an independent OPSI provider** (`infra/opsi` + `services/opsi-control`). Salt implementation is not rewritten and is not imported.
2. A single Endpoint has exactly one Hermes lifecycle owner. `%ProgramData%\SMC\control-owner.json` `hermes` is the mutex and expands to `direct | salt | opsi | runtime`. OPSI-managed endpoints write `{ "hermes": "opsi" }`.
3. Work Data Plane does not change with provider. Chat/Session/Memory stay on Hermes Gateway. `apps/work` never calls `opsi-control`, never stores OPSI credentials, and never exposes OPSI RPC, Jobs, or Product Properties.
4. `smc-hermes-agent` is a short-lived OPSI Product adapter (PowerShell). It does not listen on a port, does not stay resident, and does not proxy Chat.
5. `services/opsi-control` talks only to the OPSI Server over TLS JSON-RPC. It does not connect to Windows Endpoints, Hermes Gateway, or Work.
6. Runtime Endpoint API (`contracts/runtime-api`) remains frozen. New OPSI capability must not appear on Runtime OpenAPI or `services/runtime`.
7. OPSI Server/Control offline must not stop an already-healthy Hermes Gateway or Work Chat.

## Consequences

- Repository may contain Salt and OPSI trees; PRs that add OPSI features must keep `infra/salt`, `services/salt-control`, and `contracts/salt-control-api` diffs empty.
- Work Availability-only path is shared by Salt and OPSI (`isExternallyManagedControlOwner()`). Salt-specific error code `SALT_MANAGED` is preserved for Salt; OPSI uses `EXTERNALLY_MANAGED` with `provider=opsi`.
- Live install to OPSI Depot, Endpoint dispatch, Pilot, and Production remain operator gates.
