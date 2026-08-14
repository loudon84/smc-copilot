# SMC OPSI Control Service

Independent FastAPI service for the OPSI Endpoint Control Plane (ADR-031). Talks only to `opsiconfd` JSON-RPC (`https://<server>:4447/rpc`). Does not connect to Windows Endpoints, Hermes Gateway, Work, Runtime, or Salt Control.

Prefix: `/api/v1/opsi`

| Area | Endpoints |
|------|-----------|
| Health | `GET /health`, `GET /ready` (also unprefixed `/health` `/ready`) |
| Clients | `GET /clients`, `GET /clients/{clientId}`, `GET /clients/{clientId}/state` |
| Products | `GET /products` |
| Actions | `POST /actions`, `GET /actions/{requestId}`, `GET /actions/{requestId}/results` |
| Policies | `POST /policies/apply` |
| Diagnostics | `GET /diagnostics/{requestId}` |

Production fail-closes without TLS, OIDC JWKS, and a live OPSI adapter. Fake/InMemory adapters are `test|lab` only.

```bash
uv sync --extra dev
uv run ruff check .
uv run pytest
```
