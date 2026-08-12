# Endpoint Control Plane freeze (PRD v2.0 / ADR-026)

Runtime OpenAPI `runtimeApi` 3.1.0 mixes Endpoint Control Plane with Chat/Task data plane.

## Frozen (no functional extension)

These tags and path prefixes are frozen. P0/P1 and security fixes only. Do not bump `runtimeApi` major to add capability here — implement in Salt (`infra/salt`) instead.

| OpenAPI tag | Typical prefix | Salt replacement |
| --- | --- | --- |
| `runtime` | `/api/v1/runtime/*` | `smc_hermes` execution module + jobs |
| `service` | `/api/v1/service/*` | Minion self-update / Master |
| `system` | `/api/v1/health/*`, `/api/v1/system/*` | Grains + health module |
| `bootstrap` | `/api/v1/bootstrap/*` | Initial highstate |
| `endpoint` | `/api/v1/endpoint/*` | Salt key + endpoint grains + mock binding |
| `sync` | `/api/v1/sync/*` | Pillar refresh + highstate |
| `resources` | `/api/v1/resources/*` | State + artifact utils |
| `service-center` | `/api/v1/service-center/*` | Minion / Master |
| `gateways` | `/api/v1/gateways/*` | Windows scheduled task + `smc_hermes.restart` |
| `observability` | `/api/v1/metrics` | Returner / beacon |
| `pairing` | `/api/v1/pairings/*`, `/api/v1/devices/*` | Salt key (partial) |
| `instances` lifecycle | start/stop/restart/health/reconcile | Salt state (not Chat subpaths) |
| SSE `job-event` | `/api/v1/runtime/jobs/{id}/events` | Salt JID / returner |

TS client: `@smc/runtime-client` control-plane methods (`runtime.install/update/rollback/doctor`, instance lifecycle) are **deprecated**. Keep for `apps/desktop` and runtime-mode `apps/work` until archive.

## Partial (config vs runtime)

| Tag | Salt | Still Runtime / Hermes |
| --- | --- | --- |
| `instance-config-mcp` / `secrets` / `expert-mcp` | Desired config via Pillar/State | Runtime Chat tool invocation stays data plane |
| `diagnostics-backup` | Install/update/bundle diagnostics | Chat diagnostics may stay |

## Not Salt (data plane — do not freeze as control plane)

`chat-runs`, `sessions`, `memory`, `attachments`, `work-tasks`, `tasks`, `kanban`, `approvals`, and related SSE schemas. Do not grow these on Runtime if the target is Hermes direct or a Task Service. Salt must not enter this plane.

## Governance

- `npm run contracts:check` still runs to prevent drift.
- Control-plane functional PRs are rejected by default (ADR-026).
- Bundle file is not deleted in v2.0.
