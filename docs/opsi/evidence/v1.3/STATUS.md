# OPSI v1.3 Production Rings — STATUS

Engineering: **implemented** (Cursor/CI)
Live verification: **not_proven**
Decision: **NO-GO**

v1.2 Live Pilot remains `not_proven / NO-GO`. This file does not authorize production mutation.

| Token | Who may set it |
| --- | --- |
| `implemented` | Cursor / CI after automated tests |
| `verified` | CI + contract/fixture gates |
| `proven` | Operator signoff only |

API/Cursor must not write Operator `proven` or `GO`.

## Scope

Authoritative inventory, `mode=production` 21–500 / 1–8 Depot, mapping digest, Depot attestation, stable promotion, Ring 0–4, rate budgets, circuit breaker, global freeze, multi-scope rollback, fleet compliance, Evidence Manifest v2. Work stays Direct Hermes. Salt/Runtime isolation unchanged.

## Not proven

- v1.2 10–20 Live Pilot / rollback / 7-Day Observation / Production GO
- 21–500 Production Rings on live OPSI 4.3
- Depot / Ring / Campaign rollback drill
- 14-Day Observation
- v1.4 Fleet GA + HA/DR Go/No-Go
