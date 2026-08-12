# v2.2 repo evidence (Salt Migration Production Rollout)

Captured after v2.2 implementation in monorepo. **Production rollout remains NO-GO** until hardware canary and ring observation evidence exist.

Completion vocabulary (v2.3):

| Label | Applies to |
| --- | --- |
| `implemented` | Repo / CI gates below |
| `proven` | Live Master / endpoint / ring evidence only (Manual Gate) |

## CI / repo gates (`implemented`)

| Suite | Result |
| --- | --- |
| `infra/salt` pytest | 83 passed |
| `infra/salt` ruff + production guards | passed |
| `services/salt-control` pytest + ruff | passed |
| `services/runtime` RUNTIME-201 decommission | passed |
| `npm run contracts:check` | passed |
| `scripts/salt-migration-inventory.py --check` | GO (API 92.1% / Service 87.5% / LOC 93.5%) |

## Deliverables

| Phase | Repo status |
| --- | --- |
| 0 Baseline + guards | `implemented` — ADR-027–030, guards, v2.1 evidence |
| 1 Salt Control Service | `implemented` — `/salt/v1` seven route groups + OpenAPI CI |
| 2 Multimaster Master | `implemented` — `failover.conf`, security tests |
| 3 Windows live client | `implemented` — `-SaltControlUrl` bootstrap, journal, DPAPI credential |
| 4 Security chain | `implemented` — Ed25519 artifact, HTTPS returner, secret API path |
| 5 Canary + rings | `implemented` — `salt-canary.yml`, `rings.yaml`, Pester (hardware skipped) |
| 6 Runtime endpoint flag | `implemented` — flag-off → 410, workers off |
| Final | `implemented` docs only — Production GO **not** granted |

## Manual Gate (`not_proven` — do not auto-complete)

| Gate | Status |
| --- | --- |
| Windows Cases A–F on real endpoints | **NOT PROVEN** |
| Ring 0 ≥5 devices / 7d | **NOT PROVEN** |
| Ring 1–3 observation + SLO | **NOT PROVEN** |
| Ring 3 30d → Runtime flag-off in production | **NOT PROVEN** |

Use templates under `docs/salt/evidence/v2.2/templates/` when filing live evidence.
Cursor must not mark Manual Gates completed because scripts or DryRun exist.
