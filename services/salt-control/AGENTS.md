# Salt Control Service

> Monorepo location: `services/salt-control/` inside `smc-copilot`.
> Root routing: ../../AGENTS.md.

## Scope

Salt Integration API for SMC Copilot Endpoint Control Plane (PRD v2.2):

- Enrollment, Desired State, Job Return, Secret Broker, Artifact Metadata, Rollout
- Independent package — **never** import `services/runtime`
- API prefix: `/salt/v1`
- Contract SOT: FastAPI/Pydantic → `contracts/salt-control-api/openapi.yaml`

## Commands

```bash
uv sync --extra dev
uv run ruff check .
uv run pytest
uv run alembic upgrade head
```

Regenerate OpenAPI from repo root:

```bash
uv run --project services/salt-control python tools/contract-generate/export_salt_control_openapi.py
```

## Boundaries

- Management Backend / Vault / Salt Master / Artifact Store: Protocol + Fake in tests, HTTP adapters in production
- Tests use InMemory repositories — no live PostgreSQL required
- Fail closed on auth/errors; never log or return secrets
