# Salt evidence status vocabulary (v2.3)

| Status | Meaning | Who may set |
| --- | --- | --- |
| `implemented` | Repo code, CI, unit/integration tests, configs, and scripts exist and pass in CI | Cursor / CI |
| `proven` | Real Master / endpoint / hardware evidence filed under `docs/salt/evidence/...` with operator attestation | Human operator only |
| `manual_gate` | Requires operator action on live Master or endpoint; **must stay pending** until proven | Human operator only |
| `not_proven` | Explicitly incomplete for production GO | Anyone |

## Rules

1. Repository CI green ⇒ at most `implemented`. Never auto-promote to `proven`.
2. Manual Gates (Master `test.ping`, key accept, Highstate on live minion, Ring observation, 24h metrics, approval signatures) must **not** be marked completed by Cursor because a script or DryRun exists.
3. v2.2 production rollout remains **NO-GO** until hardware Cases A–F and ring evidence are `proven`.
4. v2.3 first-endpoint lab closure can be `implemented` in-repo while Master-side Manual Gates remain `not_proven`.
5. v2.4 Ring 0 requires second Master + failover drill `proven`. Single-Master first endpoint ⇒ Ring 0 **NO-GO**.
