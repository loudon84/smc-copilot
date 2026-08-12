# SMC Salt Control Service

Independent FastAPI service implementing the Salt Integration API for SMC Copilot Endpoint Control Plane (PRD v2.3 / v2.3.1).

## Stack

- Python 3.12, FastAPI, Pydantic v2
- SQLAlchemy 2 (async) + Alembic (PostgreSQL)
- httpx, cryptography, pytest, ruff

## API

Prefix: `/salt/v1`

| Area | Endpoints |
|------|-----------|
| Health | `GET /health`, `GET /ready` |
| Enrollment | `POST /enrollments`, fingerprint report, get status |
| Desired State | `GET /endpoints/{id}/desired-state` |
| Job Returns | `POST /job-returns:batch` |
| Jobs | `POST /jobs`, `GET /jobs/{id}` |
| Endpoint Status | `GET /endpoints/{id}/status` |
| Migrations | `POST /migrations/handover\|rollback\|remigrate` |
| Observer | `GET /observer/stability` |
| Secrets | `POST /secrets:resolve` |
| Artifacts | `GET /artifacts/{component}/{version}` |
| Rollouts | `POST /rollouts`, approve/advance/pause/resume/abort/rollback |

## Local development

```bash
uv sync --extra dev
uv run ruff check .
uv run pytest
```

Production uses PostgreSQL (`DATABASE_URL`). Unit tests inject InMemory repositories and Fake adapters — no live database required.

## Contracts

```bash
uv run --project services/salt-control python tools/contract-generate/export_salt_control_openapi.py
uv run --project services/salt-control python tools/contract-generate/check_salt_control_drift.py
```

## Hard rules

- Never import `services/runtime`
- Fail closed on auth and integration errors
- Never log or return secret/token plaintext
- Endpoint IDs are server-generated (`ep_…`); never derived from token hash or hostname
