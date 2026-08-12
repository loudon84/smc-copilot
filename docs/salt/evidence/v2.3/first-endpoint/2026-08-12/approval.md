# Salt v2.3 First Endpoint Approval

| Field | Value |
| --- | --- |
| Date | 2026-08-12 |
| Endpoint alias | host_itbjb0676 |
| Master | 192.168.102.104 |
| Evidence path | `docs/salt/evidence/v2.3/first-endpoint/2026-08-12/` |

## Checklist

- [ ] Repo gates `implemented` (salt-control + infra/salt CI)
- [ ] Master connectivity `proven` (`test.ping`, fingerprints)
- [ ] Enrollment + async ops `proven`
- [ ] Extension sync includes `smc_hermes` / `smc_handover`
- [ ] Highstate test=True without owner write during prepare
- [ ] Hermes inspect / gateway health / work probe `proven`
- [ ] Break-glass rollback + re-migrate `proven`
- [ ] 24h metrics meet targets
- [ ] No secret plaintext in evidence

## v2.4 Ring 0 Go / No-Go

| Decision | Value |
| --- | --- |
| Second Master deployed + failover drill | **NO** (single Master lab only) |
| Ring 0 (≥5 / 7d) | **NO-GO** |

**Conclusion: NO-GO for v2.4 Ring 0** until second Master and failover are proven, and first-endpoint Manual Gates above are signed.

## Sign-off

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Release owner | | | |
| Security | | | |
| Ops | | | |

Manual Gates must not be auto-completed by Cursor.
