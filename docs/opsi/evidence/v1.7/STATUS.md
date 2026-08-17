# OPSI v1.7 Real Release + Windows Client Deployment — STATUS

Engineering: **implemented**
Windows 10 client-deployment: **not_proven**
Decision: **NO-GO**

Automated engineering gates (Phase 8): opsi-control pytest/ruff, infra/opsi pytest (33), Product Pester (16), contracts:check, isolation vs `a448eb4`, Work `lat check` + typecheck + build. Alembic cycle skipped without DATABASE_URL. Work `npm test` reported pre-existing hermesHome/path mock failures unrelated to OPSI diffs (`apps/work` unchanged). Live remains operator-only.

v1.1 / v1.2 / v1.3 / v1.4 / v1.5 / v1.6 Live Evidence remain `not_proven / NO-GO`. This file does not authorize Production Ring mutation or ≤100 rollout.

| Token | Who may set it |
| --- | --- |
| `implemented` | Cursor / CI after automated tests |
| `verified` | CI + contract/fixture gates |
| `proven` / `GO` | Operator signoff only |

API/Cursor must not write Operator `proven` or `GO`.

## Scope

Signed Runtime v3 + Controller envelopes, `smc.opsi.product-release.v1`, Product/Controller/Runtime version split, self-contained Windows verifier, installed-controller-only dispatch, Gateway `HERMES_HOME` wrapper, Depot release read-back, `v1.7-client-deployment-release` Gate.

## Not proven

- W10-01 Fresh real ZIP → signed `.opsi` → Depot → Clean Windows 10 READY
- W10-02 User pending → logon continuation READY
- W10-03 Controller/runtime update + exact rollback
- W10-04 Cache delete / reboot / offline continuity
- W10-05 Tamper fail-closed + two-phase uninstall + reinstall
- Operator `v1.7-client-deployment-release` Go/No-Go
