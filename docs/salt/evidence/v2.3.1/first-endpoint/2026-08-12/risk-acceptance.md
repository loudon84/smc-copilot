# Single-Master Risk Acceptance (v2.3.1)

Status: `not_proven` (Manual Gate — human signatures required)

## Scope

- Allowed only for first Endpoint validation and v2.4 Ring 0.
- Master: `192.168.102.104` (single Master; HA deferred to v2.5).
- When Master unavailable: Control Plane enters observe/pause; Data Plane continues.

## Acceptance criteria

- [ ] Business owner signed
- [ ] Platform owner signed
- [ ] Security owner signed
- [ ] Runtime fallback verified on the first endpoint
- [ ] 24h observation thresholds met
- [ ] Master backup/restore drill passed

## Signatures

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Business | | | |
| Platform | | | |
| Security | | | |

Cursor / CI must never mark this document as proven.
