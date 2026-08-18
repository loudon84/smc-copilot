# SMC OPSI Endpoint Control Plane (v1.7 engineering)

Independent provider parallel to Salt. Default SOT remains Salt (ADR-026); customers may choose OPSI (ADR-031, ADR-032, ADR-033, ADR-034, ADR-035, ADR-036). Managed Endpoint v2 layout is proposed in [ADR-037](../adr/ADR-037-opsi-managed-endpoint-v2.md) (`Proposed` until Architecture Owner accepts) and [PRD-OPSI-v2.0](PRD-OPSI-v2.0.md).

Roadmap:

- [`PRD-OPSI-v2.0.md`](PRD-OPSI-v2.0.md) — Managed Endpoint（machine HERMES_HOME；ADR-037 Proposed；Phase 1 HostControl engineering may land；Live/Architecture signoff remain operator gates）.

- [`PRD-OPSI-v1.7.md`](PRD-OPSI-v1.7.md) — Real Hermes Release Pipeline + Windows Client Deployment Proof（engineering implemented；Windows 10-only Live Gate remains operator signoff，且不自动授权Production Rollout）.
- [`PRD-OPSI-v1.6.md`](PRD-OPSI-v1.6.md) — Windows Endpoint Controller + Hermes Agent Install-to-Control Closure（engineering implemented；Live Windows 10 proof remains operator gate）.
- [`PRD-OPSI-v1.5.md`](PRD-OPSI-v1.5.md) — Production Re-entry + Controlled Rings（engineering implemented；Live Pilot/Production remain operator gates）.
- [`PRD-OPSI-v1.4.md`](PRD-OPSI-v1.4.md) — Real Lab + Hermes Windows Runtime Closure（engineering implemented；Live gate is one Windows 10 Clean Endpoint）.
- [`PRD-OPSI-v1.3.md`](PRD-OPSI-v1.3.md) — Controlled Production Rings + Multi-Depot Awareness（engineering may land; Live requires v1.2 `proven / GO`）.
- [`PRD-OPSI-v1.2.md`](PRD-OPSI-v1.2.md) — Pilot Rollout Orchestration + Fleet Reliability（requires v1.1 Live `proven / GO`）.
- [`PRD-OPSI-v1.1.md`](PRD-OPSI-v1.1.md) — Real Endpoint Closure + Pilot Readiness.
- v1.4 closes Real Lab/runtime trust; v1.5 closes authoritative Production reconciliation. v1.6 installs the Endpoint Controller engineering skeleton. v1.7 closes the real signed Release/Product Cache-independent Windows delivery chain and captures Windows 10-only Live evidence. Production stays frozen until v1.5 Re-entry、v1.6 Controller与v1.7 Client Deployment Release Operator Gates均为GO；Cursor不得签署Live `proven`。

| Path | Role |
| --- | --- |
| `infra/opsi` | `smc-hermes-agent` localboot Product + Endpoint Controller + v1.7 Release Pipeline |
| `services/opsi-control` | Management API → opsiconfd JSON-RPC；`opsiControlApi` 1.7.0 release catalog/read-back |
| `contracts/opsi` | JSON Schema + generated OpenAPI（current `opsiControlApi` 1.7.0） |
| `docs/opsi` | Decisions, lab, evidence, Pilot/Production/Controller runbooks |

Work (`apps/work`) stays Direct Hermes (`:8642`). No OPSI Rollout UI, RPC client, credentials, or `window.opsiApi`. Live Depot/Endpoint/Pilot operations are operator gates.

