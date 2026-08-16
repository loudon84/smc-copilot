# ADR-035: OPSI Windows Endpoint Controller

## Status

Accepted (OPSI v1.6 engineering). Live Windows 10 install-to-control remains `not_proven` until operator signoff. Cursor/CI must not write `proven` or `GO`.

## Context

ADR-034 made Production Rings authoritative on the control plane. The Windows Product is still a cache-launched PowerShell adapter: Controller files are not installed under ProgramData, journals are not resumable, config payload is not transported, SYSTEM may run user Gateway commands, and `/clients/{id}/state` maps Product `installed` to HEALTHY.

## Decision

1. **Controller is a short-lived reconcile engine** installed under `%ProgramData%\SMC\opsi\controller\releases\<revision>`. It has no listener, no Windows Service, and no Chat. Triggers are opsiclientd, `SMC-Hermes-Controller-Recover` (SYSTEM), and `SMC-Hermes-Controller-User-{SID}`.
2. **Thin OPSI bootstrap** from Product cache only verifies, installs, switches, or rolls back the Controller bundle. After cache delete/reboot the installed Controller remains executable.
3. **Controller and Hermes runtime versions are independent.** Runtime lives in immutable `runtime/versions/<version>-<digest>` slots. `runtime/active.json` is the only CLI SOT.
4. **desired / observed / ownership / per-request journal v2** are local JSON. Same request+digest is idempotent; different digest conflicts. Startup resumes verified checkpoints or rolls back.
5. **Machine never writes HERMES_HOME or starts Gateway.** User operations run in the bound SID via inbox/outbox/ack.
6. **Owner commit requires full READY.** Uninstall is two-phase and restores previous owner; user `.hermes` data is retained.
7. **`v1.6-endpoint-controller` is a mandatory Production Gate.** v1.5 re-entry start/stable/next Ring stays 412 until both Gates are persisted GO.

## Consequences

- `/clients/{id}/state` consumes Controller Evidence only; missing/stale evidence is UNKNOWN.
- Result relay acks continuation records; duplicates do not re-finalize parents.
- Engineering may land while Live remains NO-GO.
