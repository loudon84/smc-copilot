# SMC OPSI Endpoint Control Plane (v1.0)

Independent provider parallel to Salt. Default SOT remains Salt (ADR-026); customers may choose OPSI (ADR-031).

Roadmap:

- [`PRD-OPSI-v1.1.md`](PRD-OPSI-v1.1.md) — Real Endpoint Closure + Pilot Readiness.
- v1.0 code is implemented, while live OPSI/Windows verification remains `NO-GO / not_proven` until operator evidence is signed.

| Path | Role |
| --- | --- |
| `infra/opsi` | `smc-hermes-agent` localboot Product + packaging |
| `services/opsi-control` | Management API → opsiconfd JSON-RPC |
| `contracts/opsi` | JSON Schema + generated OpenAPI |
| `docs/opsi` | Decisions, lab, evidence |

Work (`apps/work`) stays Direct Hermes (`:8642`). OPSI owner is Availability-only. Live Depot/Endpoint operations are operator gates.
