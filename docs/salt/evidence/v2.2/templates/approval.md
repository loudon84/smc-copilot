# Salt v2.2 Ring Advance Approval

| Field | Value |
| --- | --- |
| Ring | _ring0 / ring1 / ring2 / ring3_ |
| Date | YYYY-MM-DD |
| Component / Version | _hermes x.y.z_ |
| Evidence path | `docs/salt/evidence/v2.2/<ring>/<date>/` |

## Checklist

- [ ] Repo CI green (`salt-control-ci`, `salt-ci`, production guards)
- [ ] SLO thresholds from `infra/salt/rollout/rings.yaml` met for observation period
- [ ] P0/P1 = 0; no secret plaintext leak; no control-owner conflict
- [ ] Windows Cases A–F evidence attached (or explicitly skipped with Manual Gate reason)
- [ ] Rollback bundle verified for this ring

## Sign-off

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Release owner | | | |
| Security | | | |
| Ops | | | |

**Do not Advance** Salt Control rollout until this file is completed for the ring.
