# SMC OPSI Endpoint Control Plane (v1.5 planning)

Independent provider parallel to Salt. Default SOT remains Salt (ADR-026); customers may choose OPSI (ADR-031, ADR-032, ADR-033).

Roadmap:

- [`PRD-OPSI-v1.5.md`](PRD-OPSI-v1.5.md) — Production Re-entry + Controlled Rings（planning；Windows 10-only validation matrix；Production remains frozen until operator GO）.
- [`PRD-OPSI-v1.4.md`](PRD-OPSI-v1.4.md) — Real Lab + Hermes Windows Runtime Closure（engineering implemented；Live gate is one Windows 10 Clean Endpoint）.
- [`PRD-OPSI-v1.3.md`](PRD-OPSI-v1.3.md) — Controlled Production Rings + Multi-Depot Awareness（engineering may land; Live requires v1.2 `proven / GO`）.
- [`PRD-OPSI-v1.2.md`](PRD-OPSI-v1.2.md) — Pilot Rollout Orchestration + Fleet Reliability（requires v1.1 Live `proven / GO`）.
- [`PRD-OPSI-v1.1.md`](PRD-OPSI-v1.1.md) — Real Endpoint Closure + Pilot Readiness.
- v1.4 engineering closes Fake Lab and Windows runtime trust; its Live gate is one Windows 10 Clean Endpoint. v1.5 closes authoritative Production reconciliation and performs a Windows 10 accelerated Pilot plus controlled 21–50 endpoint / 1–2 Depot Production Re-entry. Production Rings stay frozen until Operator GO; Cursor must not sign Live `proven`.

| Path | Role |
| --- | --- |
| `infra/opsi` | `smc-hermes-agent` localboot Product + packaging |
| `services/opsi-control` | Management API → opsiconfd JSON-RPC; v1.5 authoritative rings + signed re-entry |
| `contracts/opsi` | JSON Schema + generated OpenAPI (`opsiControlApi` 1.5.0) |
| `docs/opsi` | Decisions, lab, evidence, Pilot/Production runbooks |

Work (`apps/work`) stays Direct Hermes (`:8642`). No OPSI Rollout UI, RPC client, credentials, or `window.opsiApi`. Live Depot/Endpoint/Pilot operations are operator gates.

