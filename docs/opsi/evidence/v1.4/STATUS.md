# OPSI v1.4 Real Lab + Windows Runtime Closure — STATUS

Engineering: **implemented** (automated gates)
Lab Clean Pair: **not_proven**
Accelerated Pilot: **not_proven**
Decision: **NO-GO**

v1.1 / v1.2 / v1.3 Live Evidence remain `not_proven / NO-GO`. This file does not authorize Production Ring mutation.

| Token | Who may set it |
| --- | --- |
| `implemented` | Cursor / CI after automated tests |
| `verified` | CI + contract/fixture gates |
| `proven` | Operator signoff only |

API/Cursor must not write Operator `proven` or `GO`.

## Scope

Real Lab `HttpOpsiJsonRpc` + PostgreSQL, persisted inventory/binding, Artifact envelope v2 + Ed25519, managed absolute CLI, SID Bootstrap/Gateway tasks, owner commit after Gateway health, user continuation relay, `accelerated-v1.4` Pilot policy.

## Not proven

- Win10 + Win11 Clean Pair on live OPSI 4.3
- 3–5 endpoint accelerated Pilot / 24h Observation
- target / batch / campaign rollback drill on live OPSI 4.3
- v1.5 Production Re-entry Go/No-Go
