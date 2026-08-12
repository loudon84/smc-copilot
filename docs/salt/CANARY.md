# Salt v2.0 Canary runbook

Repo-only Phase 7 checklist. Target: 5–10 Windows PCs. Runtime remains installed but **must not** own Gateway.

## Preconditions

- Salt Minion 3007+ installed
- `control-owner.json` → `{ "hermes": "salt" }`
- `SMC_HERMES_CONTROL_OWNER=salt` on `apps/work` (optional if file is present)
- Runtime service **stopped** or set not to auto-start
- Mock or lab Salt Master reachable (or fixture highstate applied offline)

## Per-machine checklist

1. Minion key accepted (`SALT-001`)
2. `saltutil.sync_all` succeeds (`SALT-002`)
3. `smc_hermes.inspect` returns facts (`HERMES-004`)
4. Fresh install or existing Hermes detected (`HERMES-001`)
5. User logon starts Gateway scheduled task (`GATEWAY-001`)
6. `apps/work` splash reaches Chat **without** Runtime `:8765` (`WORK-001`, `WORK-002`)
7. Session resume / attachments / slash still work (`WORK-003`–`WORK-005`)
8. Master offline: current Chat continues (`OFFLINE-001`)
9. Confirm Runtime supervisor is not spawning Gateway (no dual owner)

## Metrics to record (Phase 8)

| Metric | How |
| --- | --- |
| Install success rate | Salt job return `smc_hermes.install` |
| Upgrade success rate | `smc_hermes.upgrade` |
| Config apply rate | config revision apply returns ok |
| Gateway recovery rate | beacon / `smc_hermes.health` after logon |
| Minion offline rate | Master presence |
| Pillar refresh rate | ext_pillar / highstate |
| Highstate failure rate | state.apply |
| Rollback rate | `smc_hermes.rollback` / config rollback |

Keep Runtime available for rollback: set `control-owner` to `runtime`, start Runtime, reconcile, reconnect Work.
