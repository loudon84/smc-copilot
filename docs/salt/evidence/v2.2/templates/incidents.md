# Salt v2.2 Incidents (template)

Record P0/P1 and rollout pauses during ring observation. Redact secrets and device identifiers.

| Time (UTC) | Ring | Severity | Summary | Action | Resolved |
| --- | --- | --- | --- | --- | --- |
| | | P0/P1 | | pause / rollback / fix | |

## Auto-pause triggers (from rings.yaml)

- P0 or P1
- Secret leak
- Signature bypass attempt
- Control owner conflict
- Gateway availability SLO fail
- Any ring SLO fail

Paused rings allow **diagnose** and **rollback** only — no advance until approval.md signed.
