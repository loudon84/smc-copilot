# v2.1 baseline evidence (repo-only)

Captured during Salt Migration v2.2 Phase 0.

## Inventory

See `migration-inventory.json` / `migration-inventory.md` in this directory.

| Metric | Value |
| --- | ---: |
| Endpoint API | 92.1% |
| Endpoint Service | 90.3% |
| Endpoint LOC | 94.1% |
| P0/P1 | 0 |
| Inventory decision | GO (static/repo evidence only) |

## Tests (v2.1)

| Suite | Result |
| --- | --- |
| `infra/salt` pytest | 61 passed |
| `infra/salt` ruff | passed |
| `apps/work` availability/control-owner vitest | passed |
| Work guards (no renderer runtime HTTP / salt no gateway spawn) | passed |

## Hardware Canary

| Case | Status |
| --- | --- |
| A–F real Windows 11 | **NOT PROVEN** (templates only in v2.1) |

## Production rollout

**NO-GO** until v2.2 Salt Control + live enrollment + Ring evidence.

## Windows Case results template

Copy to per-endpoint folders when running live canary:

| ID | Result | Notes |
| --- | --- | --- |
| SALT-101 |  |  |
| ENROLL-201 |  |  |
| WORK-101 |  |  |
| MIGRATE-201 |  |  |
| OFFLINE-201 |  |  |
