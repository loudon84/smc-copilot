# Untracked workflow review (v2.3 Phase 0)

Reviewed without modifying user content:

| Path | Assessment |
| --- | --- |
| `.github/workflows/salt-canary.yml` | Valid v2.2 canary dispatch; self-hosted Manual Gate documented; **do not mark hardware PASS without evidence** |
| `.github/workflows/salt-control-ci.yml` | Valid salt-control + infra guards CI; Alembic step is syntax-only (no live PG) — acceptable for repo gate; improve in v2.3 CI with optional service container |
| `.cursor/review/current.json` | Local review artifact for empty staged set; leave untracked |

Action: include workflows in a dedicated review commit when operators approve; do not overwrite.
