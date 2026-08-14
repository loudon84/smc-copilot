# SMC OPSI Endpoint Control Plane (v1.0)

Independent provider parallel to Salt. Default SOT remains Salt (ADR-026); customers may choose OPSI (ADR-031).

| Path | Role |
| --- | --- |
| `infra/opsi` | `smc-hermes-agent` localboot Product + packaging |
| `services/opsi-control` | Management API → opsiconfd JSON-RPC |
| `contracts/opsi` | JSON Schema + generated OpenAPI |
| `docs/opsi` | Decisions, lab, evidence |

Work (`apps/work`) stays Direct Hermes (`:8642`). OPSI owner is Availability-only. Live Depot/Endpoint operations are operator gates.
