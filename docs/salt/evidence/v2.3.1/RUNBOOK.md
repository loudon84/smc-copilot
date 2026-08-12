# v2.3.1 First Endpoint Runbook

Operator-attended procedure for Master `192.168.102.104` and one IT/dev Windows endpoint.

## Preconditions

1. Phase 0 baseline filed under `docs/salt/evidence/v2.3.1/baseline.json`.
2. salt-control P0 tests green (`uv run pytest` in `services/salt-control`).
3. User maintenance window approved; business data backed up.
4. Runtime fallback scripts present under `infra/salt/client/windows/`.

## Execution order

1. Preflight (`Invoke-LiveCanary.ps1 -Operation preflight`)
2. Test Ping
3. Sync All
4. Pillar Dry Run
5. Install / Configure via Job API
6. Health
7. Handover (`POST /salt/v1/migrations/handover`)
8. apps/work regression (Chat / Session / Files / Attachment / Slash)
9. Rollback (`POST /salt/v1/migrations/rollback`)
10. apps/work regression
11. Remigrate (`POST /salt/v1/migrations/remigrate`)
12. Start 24h observation (`GET /salt/v1/observer/stability`)

## Failure rules

- Stop on first failure; do not continue the sequence.
- After Handover failure, trigger Runtime rollback immediately.
- Incomplete evidence package = failure.

## Evidence outputs

Write under `docs/salt/evidence/v2.3.1/first-endpoint/<date>/`:

- `preflight.json`, `ping.json`, `sync.json`, `highstate.json`
- `handover.json`, `work-probe.json`, `rollback.json`, `remigrate.json`
- `metrics-24h.json`, `master-restore.json`, `risk-acceptance.md`, `V2.4-GO-NO-GO.md`
