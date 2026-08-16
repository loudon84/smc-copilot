# OPSI v1.2 Pilot Rollout Orchestration — STATUS

Engineering: **implemented** (Cursor/CI)
Live verification: **not_proven**
Decision: **NO-GO**

v1.1 Live Gate remains `not_proven / NO-GO`. This file does not authorize Pilot mutation.

| Token | Who may set it |
| --- | --- |
| `implemented` | Cursor / CI after automated tests |
| `verified` | CI + contract/fixture gates |
| `proven` | Operator signoff only |

API/Cursor must not write Operator `proven` or `GO`.

## Scope

Immutable 10–20 target snapshot, preflight, dual approval, Canary 2 + batches of ≤5, auto pause, target/batch/campaign rollback, append-only evidence. Work stays Direct Hermes. Salt/Runtime isolation unchanged.

## Not proven

- v1.1 Windows 10/11 Live Gate
- 10–20 endpoint Canary / batch Pilot
- target / batch / campaign rollback drill on live OPSI 4.3
- 7-Day Observation
- v1.3 Production Rollout Go/No-Go
