# v2.2 repo evidence (Salt Migration Production Rollout)

Captured after v2.2 implementation in monorepo. **Production rollout remains NO-GO** until hardware canary and ring observation evidence exist.

## CI / repo gates

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
| 0 Baseline + guards | ADR-027–030, guards, v2.1 evidence |
| 1 Salt Control Service | `/salt/v1` seven route groups + OpenAPI CI |
| 2 Multimaster Master | `failover.conf`, security tests |
| 3 Windows live client | `-SaltControlUrl` bootstrap, journal, DPAPI credential |
| 4 Security chain | Ed25519 artifact, HTTPS returner, secret API path |
| 5 Canary + rings | `salt-canary.yml`, `rings.yaml`, Pester (hardware skipped) |
| 6 Runtime endpoint flag | `SMC_RUNTIME_ENDPOINT_CONTROL_ENABLED=false` → 410, workers off |
| Final | GO-NO-GO doc, contract-flow, inventory |

## Manual Gate (NOT PROVEN)

| Gate | Status |
| --- | --- |
| Windows Cases A–F on real endpoints | **NOT PROVEN** |
| Ring 0 ≥5 devices / 7d | **NOT PROVEN** |
| Ring 1–3 observation + SLO | **NOT PROVEN** |
| Ring 3 30d → Runtime flag-off in production | **NOT PROVEN** |

Use templates under `docs/salt/evidence/v2.2/templates/` when filing live evidence.
