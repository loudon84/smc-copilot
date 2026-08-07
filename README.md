# SMC Copilot Monorepo

Unified repository for **SMC Copilot Desktop** and **Hermes Runtime Service**.

## Layout

```text
apps/desktop              Electron + React (npm)
services/runtime          FastAPI Runtime (uv / Python 3.12)
contracts/                Generated OpenAPI + event schemas
packages/runtime-client-ts
tools/                    Contract generate, release, integration
docs/                     Architecture + ADRs
```

## Quick start

```bash
# Root (Nx only)
npm ci

# Desktop
cd apps/desktop && npm ci && npm run dev

# Runtime
cd services/runtime && uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn main:app --app-dir src --reload --host 127.0.0.1 --port 8765
```

Or via Nx:

```bash
npm run bootstrap          # install desktop + runtime + runtime-client-ts
npm run dev:runtime
npm run dev:desktop
npm run contracts:generate
npm run client:generate
npm run integration:test   # L1+L2 against local Runtime
```

## Versions

| Component | Source |
|-----------|--------|
| Desktop product | `apps/desktop/package.json` (+ generated `build-info.ts`) |
| Runtime service | `services/runtime/pyproject.toml` |
| Runtime API / events / bundle | `contracts/version.json` |

## Agent routing

Start at [`AGENTS.md`](AGENTS.md). See [`docs/INDEX.md`](docs/INDEX.md).

## Source imports

Recorded in [`docs/architecture/source-imports.json`](docs/architecture/source-imports.json).
