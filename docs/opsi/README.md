# SMC OPSI Endpoint Control Plane (v1.4)

Independent provider parallel to Salt. Default SOT remains Salt (ADR-026); customers may choose OPSI (ADR-031, ADR-032, ADR-033).

Roadmap:

- [`PRD-OPSI-v1.4.md`](PRD-OPSI-v1.4.md) — Real Lab + Hermes Windows Runtime Closure（engineering may land; Live Clean Pair/Pilot remain operator gates）.
- [`PRD-OPSI-v1.3.md`](PRD-OPSI-v1.3.md) — Controlled Production Rings + Multi-Depot Awareness（engineering may land; Live requires v1.2 `proven / GO`）.
- [`PRD-OPSI-v1.2.md`](PRD-OPSI-v1.2.md) — Pilot Rollout Orchestration + Fleet Reliability（requires v1.1 Live `proven / GO`）.
- [`PRD-OPSI-v1.1.md`](PRD-OPSI-v1.1.md) — Real Endpoint Closure + Pilot Readiness.
- v1.4 engineering closes Fake Lab and Windows runtime trust; Live evidence stays `NO-GO / not_proven` until Operator signoff. Production Rings stay frozen. Cursor must not sign Live `proven`.

| Path | Role |
| --- | --- |
| `infra/opsi` | `smc-hermes-agent` localboot Product + packaging |
| `services/opsi-control` | Management API → opsiconfd JSON-RPC; v1.4 real Lab + accelerated Pilot |
| `contracts/opsi` | JSON Schema + generated OpenAPI (`opsiControlApi` 1.4.0) |
| `docs/opsi` | Decisions, lab, evidence, Pilot/Production runbooks |

Work (`apps/work`) stays Direct Hermes (`:8642`). No OPSI Rollout UI, RPC client, credentials, or `window.opsiApi`. Live Depot/Endpoint/Pilot operations are operator gates.

