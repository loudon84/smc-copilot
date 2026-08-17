# OPSI v1.7.1 Unified Client Release Builder — STATUS

Engineering: **implemented**
Release Builder Live (RB-01/RB-02/RB-03): **not_proven**
Windows 10 client-deployment: **not_proven**
Decision: **NO-GO**

This file does not authorize Production Ring mutation or ≤100 rollout. v1.7 Live Evidence remains `not_proven / NO-GO`.

| Token | Who may set it |
| --- | --- |
| `implemented` | Cursor / CI after automated tests |
| `verified` | CI + contract/fixture gates |
| `proven` / `GO` | Operator signoff only |

API/Cursor must not write Operator `proven` or `GO`.

## Scope

Hermes Source Builder (Git → wheel → Windows AMD64 wheelhouse → managed offline bundle), Runtime Artifact v3 `python-wheelhouse`, Endpoint Controller prerequisite + slot venv + `--no-index` install, native `opsi-makepackage` + extract/read-back, Work installer capture, official OPSI client installer capture, Unified Client Release (`smc.client-release.v1`).

## Not proven

- RB-01 Local hermes-agent Git → signed Windows managed bundle
- RB-02 Offline runtime install (venv + wheelhouse, no PyPI)
- RB-03 native `opsi-makepackage` → `.opsi` → extract/read-back
- W10-01..W10-05 from v1.7 (still operator-only)
