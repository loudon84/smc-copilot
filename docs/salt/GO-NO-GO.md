# Salt v2.0 Go / No-Go

Do **not** delete `services/runtime` in v2.0. Use this review after ≥30 days canary (or lab equivalent) plus inventory.

## Inventory command

```bash
python scripts/salt-migration-inventory.py
```

Outputs `migration-inventory.json` and `migration-inventory.md` at repo root.

Current snapshot (script run during v2.0 implementation):

| Scope | Value | Gate |
| --- | ---: | --- |
| Endpoint API | 78.9% | 85% — **below** |
| Endpoint Service | 80.6% | 85% — **below** |
| Endpoint LOC | 86.5% | 75% — pass |

No-Go on API/Service until Salt coverage of PARTIAL instance/config/secrets domains increases. v2.0 does not delete Runtime.

## Go thresholds (PRD Phase 9)

| Gate | Threshold |
| --- | ---: |
| Endpoint API replacement (routers, excl. NO) | ≥ 85% |
| Endpoint Service replacement (excl. NO) | ≥ 85% |
| Endpoint LOC replacement (excl. NO) | ≥ 75% |
| P0 blockers | 0 |
| P1 blockers | 0 |
| Canary stability | PASS |

## No-Go

If any gate fails: keep Runtime as control plane; Salt stays parallel. Chat/Task/Approval/Kanban stay on Runtime or Hermes data plane until a later version names their migration target.

## Archive path (later version only)

```text
services/runtime → deprecated → read-only maintenance → archive
```
