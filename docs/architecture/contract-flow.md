# Contract flow

```text
Runtime Pydantic models + FastAPI routes
        ↓  tools/contract-generate/export_openapi.py
contracts/runtime-api/openapi.yaml
        ↓  tools/contract-generate/export_event_schemas.py
contracts/runtime-events/*.schema.json
        ↓  tools/contract-generate/generate_ts_client.mjs
packages/runtime-client-ts/src/generated/
        ↓  transport + domain facades
packages/runtime-client-ts (@smc/runtime-client)
        ↓  DesktopRuntimeTransport
Desktop Main (only)
```

## Work Task runtime (v1.3)

WorkTask durable execution, Kernel, and 21 event types are documented in [work-task-runtime.md](./work-task-runtime.md). Event schema: `contracts/runtime-events/task-event.schema.json` (`runtimeEvents` in `contracts/version.json`).

## Governance

- Source of truth: Runtime FastAPI + Pydantic (not hand-written OpenAPI). Desktop no longer keeps an OpenAPI snapshot.
- `npm run contracts:check` fails CI on drift.
- Breaking OpenAPI changes bump `contracts/version.json` `runtimeApi` major and require an ADR (see ADR-006).
- Bundle version: `contracts/version.json` `bundleVersion`.
- **v2.0 / ADR-026:** Endpoint Control Plane OpenAPI tags are frozen. See [ENDPOINT_CONTROL_PLANE_FREEZE.md](../../contracts/runtime-api/ENDPOINT_CONTROL_PLANE_FREEZE.md). New endpoint-management capability goes to `infra/salt`, not Runtime OpenAPI. Chat/Task data plane must not grow on Runtime if the target is Hermes direct or a Task Service.

## Salt Control API (v2.2)

```text
Salt Control FastAPI + Pydantic (services/salt-control)
        ↓  tools/contract-generate/export_salt_control_openapi.py
contracts/salt-control-api/openapi.yaml
        ↓  infra/salt/client (bootstrap, enrollment, secret resolve)
Windows Salt Minion / Bootstrap scripts
```

- Source of truth: `services/salt-control` FastAPI routes under `/salt/v1`.
- Version: `contracts/version.json` → `saltControlApi`.
- `npm run contracts:check` includes `check_salt_control_drift.py`.
- Salt Control must not import `services/runtime`. Runtime Endpoint Control retires via `SMC_RUNTIME_ENDPOINT_CONTROL_ENABLED=false` (ADR-030); Chat/Task contracts unchanged.

## OPSI Control API (v1.1 / ADR-031)

```text
OPSI Control FastAPI + Pydantic (services/opsi-control)
        ↓  tools/contract-generate/export_opsi_control_openapi.py
contracts/opsi/openapi.yaml
        ↓  infra/opsi Product + opsiconfd JSON-RPC
Windows opsiclientd / smc-hermes-agent
```

- Source of truth: `services/opsi-control` FastAPI routes under `/api/v1/opsi`.
- Version: `contracts/version.json` → `opsiControlApi`.
- `npm run contracts:check` includes `check_opsi_control_drift.py`.
- OPSI Control must not import `services/runtime` or `services/salt-control`. JSON Schemas live in `contracts/opsi/*.schema.json`.

## v1.4 readiness / memory / expert-mcp

- **Readiness v2** (`GET /api/v1/runtime/readiness`) splits `service` / `execution` / `maintenance` / `expertMcp` — Desktop Domain Gate must not collapse these into a single hard block (ADR-010).
- **Memory** and session stats are Runtime data-plane APIs; Desktop must not read Hermes `state.db` / `MEMORY.md` (ADR-008).
- **Expert MCP Gateway** is hosted by Runtime; Desktop must not auto-start a local proxy on `:48742` (ADR-007 / ADR-009).
