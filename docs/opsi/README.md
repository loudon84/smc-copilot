# SMC OPSI Endpoint Control Plane (v1.6 engineering)

Independent provider parallel to Salt. Default SOT remains Salt (ADR-026); customers may choose OPSI (ADR-031, ADR-032, ADR-033, ADR-034, ADR-035).

Roadmap:

- [`PRD-OPSI-v1.6.md`](PRD-OPSI-v1.6.md) — Windows Endpoint Controller + Hermes Agent Install-to-Control Closure（engineering implemented；Live Windows 10 proof remains operator gate）.
- [`PRD-OPSI-v1.5.md`](PRD-OPSI-v1.5.md) — Production Re-entry + Controlled Rings（engineering implemented；Live Pilot/Production remain operator gates）.
- [`PRD-OPSI-v1.4.md`](PRD-OPSI-v1.4.md) — Real Lab + Hermes Windows Runtime Closure（engineering implemented；Live gate is one Windows 10 Clean Endpoint）.
- [`PRD-OPSI-v1.3.md`](PRD-OPSI-v1.3.md) — Controlled Production Rings + Multi-Depot Awareness（engineering may land; Live requires v1.2 `proven / GO`）.
- [`PRD-OPSI-v1.2.md`](PRD-OPSI-v1.2.md) — Pilot Rollout Orchestration + Fleet Reliability（requires v1.1 Live `proven / GO`）.
- [`PRD-OPSI-v1.1.md`](PRD-OPSI-v1.1.md) — Real Endpoint Closure + Pilot Readiness.
- v1.4 closes Real Lab/runtime trust; v1.5 closes authoritative Production reconciliation. v1.6 installs a durable local Endpoint Controller and closes the Hermes Agent install/config/Gateway/recovery/update/rollback/uninstall lifecycle. Production stays frozen until both re-entry and controller Operator Gates are GO; Cursor must not sign Live `proven`.

| Path | Role |
| --- | --- |
| `infra/opsi` | `smc-hermes-agent` localboot Product + v1.6 Endpoint Controller |
| `services/opsi-control` | Management API → opsiconfd JSON-RPC; v1.6 Controller State v2 |
| `contracts/opsi` | JSON Schema + generated OpenAPI（current `opsiControlApi` 1.6.0） |
| `docs/opsi` | Decisions, lab, evidence, Pilot/Production/Controller runbooks |

Work (`apps/work`) stays Direct Hermes (`:8642`). No OPSI Rollout UI, RPC client, credentials, or `window.opsiApi`. Live Depot/Endpoint/Pilot operations are operator gates.

