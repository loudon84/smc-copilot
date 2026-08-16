# SMC OPSI Endpoint Control Plane (v1.3)

Independent provider parallel to Salt. Default SOT remains Salt (ADR-026); customers may choose OPSI (ADR-031, ADR-032).

Roadmap:

- [`PRD-OPSI-v1.3.md`](PRD-OPSI-v1.3.md) — Controlled Production Rings + Multi-Depot Awareness（engineering may land; Live requires v1.2 `proven / GO`）.
- [`PRD-OPSI-v1.2.md`](PRD-OPSI-v1.2.md) — Pilot Rollout Orchestration + Fleet Reliability（requires v1.1 Live `proven / GO`）.
- [`PRD-OPSI-v1.1.md`](PRD-OPSI-v1.1.md) — Real Endpoint Closure + Pilot Readiness.
- v1.3 engineering may land while Live evidence stays `NO-GO / not_proven`. Cursor must not sign Production `proven`.

| Path | Role |
| --- | --- |
| `infra/opsi` | `smc-hermes-agent` localboot Product + packaging |
| `services/opsi-control` | Management API → opsiconfd JSON-RPC; v1.3 production rings |
| `contracts/opsi` | JSON Schema + generated OpenAPI (`opsiControlApi` 1.3.0) |
| `docs/opsi` | Decisions, lab, evidence, Pilot/Production runbooks |

Work (`apps/work`) stays Direct Hermes (`:8642`). No OPSI Rollout UI, RPC client, credentials, or `window.opsiApi`. Live Depot/Endpoint/Pilot operations are operator gates.
