# Monorepo architecture

## Boundaries

| Path | Role |
| --- | --- |
| `apps/desktop` | Electron Desktop (npm) |
| `apps/work` | Work desktop; Salt-mode Direct Hermes Client (v2.0) |
| `services/runtime` | FastAPI Runtime (uv); Endpoint Control Plane **frozen** (ADR-026) |
| `infra/salt` | Salt Lab + SMC Hermes Extension (default Endpoint Control Plane) |
| `infra/opsi` | OPSI 4.3 `smc-hermes-agent` Product (parallel Endpoint Control Plane) |
| `services/opsi-control` | FastAPI OPSI Control (opsiconfd JSON-RPC adapter) |
| `contracts` | Generated OpenAPI + event schemas + OPSI JSON Schema |
| `packages/runtime-client-ts` | Generated + facade TS client |

## Build isolation

- Desktop installs with `cd apps/desktop && npm ci`
- Runtime installs with `cd services/runtime && uv sync --extra dev`
- Root npm only holds Nx + contract orchestration tools
- Nx orchestrates targets; it does not install Electron native deps or Python packages

## Nx project graph

```text
runtime → contracts → runtime-client-ts → desktop
```

## Run

```bash
npm run dev:runtime
npm run dev:desktop
npm run contracts:generate
npm run client:generate
```

## Artifacts

Desktop, Runtime, and Contracts publish independent versions and tags
(`desktop-v*`, `runtime-v*`, `contracts-v*`).
