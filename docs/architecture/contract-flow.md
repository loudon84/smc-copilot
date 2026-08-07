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

## Governance

- Source of truth: Runtime FastAPI + Pydantic (not hand-written OpenAPI). Desktop no longer keeps an OpenAPI snapshot.
- `npm run contracts:check` fails CI on drift.
- Breaking OpenAPI changes bump `contracts/version.json` `runtimeApi` major and require an ADR (see ADR-006).
- Bundle version: `contracts/version.json` `bundleVersion`.
