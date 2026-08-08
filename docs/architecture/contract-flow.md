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

## v1.4 readiness / memory / expert-mcp

- **Readiness v2** (`GET /api/v1/runtime/readiness`) splits `service` / `execution` / `maintenance` / `expertMcp` — Desktop Domain Gate must not collapse these into a single hard block (ADR-010).
- **Memory** and session stats are Runtime data-plane APIs; Desktop must not read Hermes `state.db` / `MEMORY.md` (ADR-008).
- **Expert MCP Gateway** is hosted by Runtime; Desktop must not auto-start a local proxy on `:48742` (ADR-007 / ADR-009).
