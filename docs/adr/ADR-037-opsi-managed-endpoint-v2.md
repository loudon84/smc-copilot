# ADR-037: OPSI Managed Endpoint v2 (machine Hermes instance)


## Status

Accepted

- Reviewer: xxx
- Accepted At: 2026-08-19
- Decision: Approved for OPSI Managed Endpoint v2 implementation

Accepted. Architecture Owner must accept this ADR before Phase 2 production filesystem, ACL, environment, or `control-owner.json` changes are treated as authorized. Cursor/CI must not write `Accepted`, `proven`, or `GO`.

## Context

PRD-OPSI-v2.0 defines a Managed Endpoint: one Windows Endpoint owns exactly one machine Hermes instance. Program is `D:\Programs\SMC\Hermes`. `HERMES_HOME` is `C:\ProgramData\SMC\Hermes`. SYSTEM must run Hermes CLI without creating `systemprofile\.hermes`.

Those product rules conflict with accepted v1 decisions that treat Hermes as an OPSI Product plus a ProgramData Endpoint Controller, and that keep `HERMES_HOME` in a logged-in user SID:

- ADR-031 Decision 4: `smc-hermes-agent` is a short-lived OPSI Product adapter.
- ADR-035 Decision 1/2: Controller is the installed reconcile engine; Product cache bootstrap installs it.
- ADR-035 Decision 5/6: Machine must not write `HERMES_HOME` or start Gateway; user `.hermes` is the data home.
- ADR-036 Decision 4/5/6: signed Controller install, cache bootstrap that never leaves `%ScriptPath%`, and Gateway start via `Start-SmcHermesGateway.ps1` with a caller-supplied home.
- [`docs/opsi/decisions/machine-user-bootstrap.md`](../opsi/decisions/machine-user-bootstrap.md): SYSTEM stages files; each SID gets its own Hermes Home and task.

This ADR supersedes only those conflicting clauses. Historical ADR files are not rewritten. Live v1 evidence and Phase 1 HostControl manual signoff stay in their real state.

## Decision

1. **Cardinality is `1 Endpoint : 1 machine Hermes instance`.** Runtime, config, sessions, logs, and workspace belong to the Endpoint. Per-user `%USERPROFILE%\.hermes`, `%LOCALAPPDATA%\hermes`, concurrent SID homes, and `C:\Windows\System32\config\systemprofile\.hermes` are forbidden.

2. **Fixed layout.** Program root is `D:\Programs\SMC\Hermes` (`bin\hermes.exe` is the CLI). `HERMES_HOME` is `C:\ProgramData\SMC\Hermes` with `skills`, `sessions`, `logs`, `workspace`, and `state`. Existing `config.yaml`, `.env`, `auth.json`, and data files are retained across idempotent initialization. Relative paths, path traversal, and any home other than that exact path fail closed.

3. **Machine writes `HERMES_HOME`.** The Machine environment variable and the current process must both be `HERMES_HOME=C:\ProgramData\SMC\Hermes`. ACL on that home grants only `NT AUTHORITY\SYSTEM` (`S-1-5-18`) and `BUILTIN\Administrators` (`S-1-5-32-544`) the access they need. Inheritance is disabled. User profiles are not mutated.

4. **New Windows code boundary is `infra/windows/hermes-agent`.** Phase 2a ships a PowerShell 5.1 managed-home module called only by Pester. It does not install Hermes/Python/Node, does not create a Gateway Scheduled Task or Windows Service, and does not copy the v1 Endpoint Controller.

5. **OPSI Product + Controller are not the v2 Hermes lifecycle.** ADR-031 Decision 4, ADR-035 Decision 1/2/5/6, ADR-036 Decision 4/5/6, and the machine-user bootstrap SID-home model are superseded for new Managed Endpoint work. Legacy `infra/opsi/products/smc-hermes-agent` remains in tree for one migration cycle; it is not moved or deleted in this slice.

6. **`control-owner.json` remains the single-owner mutex** (`hermes` = `direct | salt | opsi | runtime`). This slice must not create, rewrite, or half-write that file. An OPSI-managed endpoint still writes `{ "hermes": "opsi" }` only after a later Installer slice reaches full READY and commits owner atomically.

7. **Provider isolation is unchanged.**
    - Endpoint Control Plane default SOT remains Salt (`infra/salt` + `services/salt-control`). Customers may choose the independent OPSI provider (`infra/opsi` + `services/opsi-control`).
    - `services/opsi-control` talks only to opsiconfd over TLS JSON-RPC. It does not connect to Windows Endpoints, Hermes Gateway, or Work.
    - Work (`apps/work`) stays a Direct Hermes Client (`localhost:8642`). It never calls `opsi-control`, never stores OPSI credentials, and never exposes OPSI RPC.
    - Runtime Endpoint API (`contracts/runtime-api`) and `services/runtime` stay frozen for new OPSI capability.
    - OPSI Server/Control offline must not stop an already-healthy Hermes Gateway or Work Chat.

8. **Gateway identity is deferred.** Future Gateway is a Windows Scheduled Task using the machine `HERMES_HOME`, not a Windows Service and not a per-user logon task. That work belongs to a later Installer plan.

## Supersedes

| Source | Clause | Why |
| --- | --- | --- |
| ADR-031 Decision 4 | `smc-hermes-agent` short-lived OPSI Product adapter | v2 Hermes lifecycle is machine Installer + HostControl, not Product Action |
| ADR-035 Decision 1 | ProgramData Endpoint Controller reconcile engine | v2 has no Controller listener, service, or recover/user tasks |
| ADR-035 Decision 2 | Thin OPSI Product-cache bootstrap installs Controller | v2 does not install Controller from Product cache |
| ADR-035 Decision 5 | Machine never writes `HERMES_HOME`; user SID inbox/outbox | Machine **does** write machine `HERMES_HOME`; user profile is not a home |
| ADR-035 Decision 6 | Uninstall retains user `.hermes` as the data home | Data home is `C:\ProgramData\SMC\Hermes`; user `.hermes` is out of model |
| ADR-036 Decision 4 | Signed Controller install / `current`+`previous` pointer | No Controller bundle in v2 managed-home |
| ADR-036 Decision 5 | After install, operations must not call `%ScriptPath%` (Controller entrypoint) | No Controller entrypoint; new boundary is `infra/windows/hermes-agent` |
| ADR-036 Decision 6 | `Start-SmcHermesGateway.ps1` injects caller `HERMES_HOME` | Machine `HERMES_HOME` is the SOT; Gateway task is a later slice |
| machine-user-bootstrap | SYSTEM stages; each SID has a Hermes Home and task | One machine instance; SYSTEM CLI must not create `systemprofile\.hermes` |

Not superseded: ADR-031 Decisions 1–3 and 5–7; ADR-035 Decisions 3, 4, and 7 (version independence, journal, production gates remain until a later freeze plan); ADR-036 Decisions 1–3 and 7 (independent version axes, signed release index, self-contained verifier, operator-only `.opsi` publish).

## Consequences

- Architecture review compares this Decision and the supersede table against PRD-OPSI-v2.0, ADR-031, ADR-035, and ADR-036. Status stays Proposed until that review records reviewer and date.
- Engineering may add `infra/windows/hermes-agent` tests that initialize the fixed home on CI runners. That is not Live Evidence and does not make Phase 2 `proven`.
- Installer EXE, Runtime bundle, Gateway Scheduled Task, and owner commit require a later plan after this ADR is Accepted.
- PRs that add OPSI v2 features must keep `apps/work`, `infra/salt`, `services/salt-control`, `services/runtime`, `contracts/salt-control-api`, and `contracts/runtime-api` diffs empty.
