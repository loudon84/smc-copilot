# OPSI v1.0 acceptance — STATUS

Decision: **NO-GO**
Verification: **not_proven**

Unsigned template. Cursor/CI may generate scripts and `implemented` automation evidence. Windows 10/11 live matrix, Pilot, Security Signoff, and Release Signoff are operator-only.

## Automation (implemented)

- OPSI Control unit/API tests and OpenAPI export
- Product contract tests / packaging smoke
- Work `direct | salt | opsi | runtime` owner tests
- Isolation guard vs Salt/Runtime implementation paths

## Live matrix (not_proven)

Windows 10 and Windows 11: enrollment, setup, user context, Gateway, Work connect, config 12→13, restart-gateway, update rollback, diagnose, collect-log, uninstall data boundary, reboot/logon, OPSI offline + Gateway healthy.

Do not mark this file `proven` until authorized operators archive evidence.
