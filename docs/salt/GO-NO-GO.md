# Salt v2.1 Go / No-Go

Do **not** delete `services/runtime` in v2.1. Use this review after real Windows canary (≥5 endpoints) plus inventory v2.

## Inventory command

```bash
uv run --project infra/salt python ../../scripts/salt-migration-inventory.py
```

Reads `infra/salt/migration-capabilities.yaml`. Only **verified FULL** counts as 1.0.

Current snapshot (v2.1 repo-only implementation):

| Scope | Value | Gate |
| --- | ---: | --- |
| Endpoint API | 92.1% | 85% — pass |
| Endpoint Service | 90.3% | 85% — pass |
| Endpoint LOC | 94.1% | 75% — pass |
| P0/P1 | 0 | pass |

Hardware canary (≥5 Windows 11 endpoints, Cases A–D) remains an ops gate and is not claimed by this repo-only drop.

## Go thresholds (PRD v2.1)

| Gate | Threshold |
| --- | ---: |
| Endpoint API replacement (routers, excl. NO) | ≥ 85% |
| Endpoint Service replacement (excl. NO) | ≥ 85% |
| Endpoint LOC replacement (excl. NO) | ≥ 75% |
| P0 blockers | 0 |
| P1 blockers | 0 |
| Real Windows canary (Cases A–D, ≥5 PCs) | PASS |

## No-Go

If any gate fails: keep Runtime as rollback control plane; Salt stays parallel. Chat/Task/Approval/Kanban stay on Hermes data plane / Runtime until a later version.

v2.1 does not uninstall Runtime files. v2.2 is Runtime decommission + production rollout.

## Archive path (later version only)

```text
services/runtime → deprecated → read-only maintenance → archive
```
