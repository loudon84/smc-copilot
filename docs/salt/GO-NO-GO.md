# Salt v2.2 Go / No-Go

Do **not** delete `services/runtime` in v2.2. Endpoint Control Plane is **flag-off** (`SMC_RUNTIME_ENDPOINT_CONTROL_ENABLED=false`) after Ring 3 evidence, not source deletion.

## Inventory command

```bash
python scripts/salt-migration-inventory.py --check
```

Reads `infra/salt/migration-capabilities.yaml`. Only **verified FULL** counts as 1.0.

| Scope | Gate |
| --- | ---: |
| Endpoint API | ≥ 85% |
| Endpoint Service | ≥ 85% |
| Endpoint LOC | ≥ 75% |
| P0/P1 | 0 |

## v2.2 additional gates

| Gate | Requirement |
| --- | --- |
| Salt Control API | All seven route groups + CI green |
| Multimaster config | `failover.conf` + security tests |
| Live bootstrap | `-SaltControlUrl`; no token-hash endpoint id in live mode |
| Artifact | Ed25519 in production; HMAC lab-only |
| Secret/Returner | API + HTTPS spool; no production fixture fallback |
| Windows Canary Cases A–F | **Manual Gate** — self-hosted `smc-salt-canary` runner |
| Ring 0/1/2/3 | Observation + SLO from `infra/salt/rollout/rings.yaml` + signed `approval.md` |
| Runtime endpoint flag | `SMC_RUNTIME_ENDPOINT_CONTROL_ENABLED=false` after Ring 3 30d |

## No-Go

If any gate fails: keep Runtime as rollback; Salt stays parallel. Chat/Task/Approval/Kanban stay on Hermes data plane.

Repo CI passing **does not** imply Production rollout GO — hardware canary and ring evidence are Manual Gate.

## Evidence path

```text
docs/salt/evidence/v2.2/<ring>/<date>/
  summary.json
  test-results.xml
  metrics.json
  incidents.md
  approval.md
```

Templates: `docs/salt/evidence/v2.2/templates/`
