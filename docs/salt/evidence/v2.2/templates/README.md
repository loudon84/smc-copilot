# v2.2 evidence templates

Copy this folder to `docs/salt/evidence/v2.2/<ring>/<YYYY-MM-DD>/` when filing ring or canary evidence.

| File | Purpose |
| --- | --- |
| `summary.json` | Machine-readable pass/fail, device counts, SLO snapshot |
| `test-results.xml` | JUnit from Pester/pytest canary (redact hostnames/users) |
| `metrics.json` | Bootstrap/enrollment/highstate/gateway metrics |
| `incidents.md` | P0/P1 and rollback notes |
| `approval.md` | Signed operator approval before ring advance |

**Manual Gate:** Cases A–F and Ring 0–3 hardware observation require real endpoints. Repo CI and skipped Pester tests do **not** satisfy production rollout GO.
