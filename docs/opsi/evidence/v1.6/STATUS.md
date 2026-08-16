# OPSI v1.6 Endpoint Controller — STATUS

Engineering: **implemented**
Windows 10 install-to-control: **not_proven**
Decision: **NO-GO**

v1.1 / v1.2 / v1.3 / v1.4 / v1.5 Live Evidence remain `not_proven / NO-GO`. This file does not authorize Production Ring mutation.

| Token | Who may set it |
| --- | --- |
| `implemented` | Cursor / CI after automated tests |
| `verified` | CI + contract/fixture gates |
| `proven` / `GO` | Operator signoff only |

API/Cursor must not write Operator `proven` or `GO`.

## Scope

Persistent ProgramData Controller bundle, journal v2 resume/rollback, immutable Hermes runtime slots, SID user command queue, config payload transport, Controller State v2, Result ack, two-phase uninstall, `v1.6-endpoint-controller` Gate.

## Not proven

- One Clean Windows 10 real `.opsi` install-to-control matrix
- Cache delete + reboot Controller recovery on live OPSI 4.3
- Online/offline uninstall + clean reinstall
- Operator `v1.6-endpoint-controller` Go/No-Go
