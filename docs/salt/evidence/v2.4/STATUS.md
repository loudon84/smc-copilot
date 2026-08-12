# Salt evidence — v2.4 Ring 0

| Status | Meaning | Who may set |
| --- | --- | --- |
| `implemented` | Repo / CI / unit tests | Cursor / CI |
| `proven` | Live Master / 5-endpoint attestation | Human only |
| `manual_gate` | Requires live action | Human only |
| `not_proven` | Incomplete for GO | Anyone |

## Phase checklist

| Phase | Status |
| --- | --- |
| 0 CI / format / alembic / single-master docs | implemented (Manual Gate remains not_proven) |
| 1 Request UoW / persistence / idempotency digest | implemented |
| 2 Job lease / JID reclaim / mapping / returner / payload | implemented |
| 3 Real handover hooks / migrate modules | implemented |
| 4 Ring 0 orchestrator 1→2→2 + approvals table | implemented |
| 5 Persistent observer windows / endpoint status / live canary | implemented |
| 6 Live 5-endpoint + 7d observation | manual_gate / not_proven |

## Ring 0 Go / No-Go

See `ring0/TEMPLATE/V2.5-GO-NO-GO.md`. Live deployment remains **NO-GO** until Manual Gates are proven by operators.
