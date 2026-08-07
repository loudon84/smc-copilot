# Contract flow

```text
Runtime Pydantic models + FastAPI routes
        ↓  tools/contract-generate/export_openapi.py
contracts/runtime-api/openapi.yaml
        ↓  tools/contract-generate/export_event_schemas.py
contracts/runtime-events/*.schema.json
        ↓  tools/contract-generate/generate_ts_client.mjs
packages/runtime-client-ts/src/generated/
        ↓  handwritten facade
packages/runtime-client-ts/src/index.ts (@smc/runtime-client)
        ↓
Desktop Main
```

## Governance

- Source of truth: Runtime FastAPI + Pydantic (not hand-written OpenAPI).
- `npm run contracts:check` fails CI on drift.
- Breaking changes bump `contracts/version.json` major and require an ADR.
