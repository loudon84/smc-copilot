# Production Salt Master (v2.2)

Topology: two Linux Masters (`salt-a.internal`, `salt-b.internal`) in Active/Passive failover. Minions use `master_type: failover` with `master_alive_interval: 60` (failover within ~120s).

## PKI and secrets

- Master private keys and CA material come from **enterprise secret management** at provision time.
- **Never commit private keys**, `.pem` key pairs, or accepted minion key archives to git or release artifacts.
- `master.d/security.conf` keeps `auto_accept: false`. Key accept is performed only by Salt Control Enrollment Service.
- Operator break-glass `salt-key -a` is allowed only with a written audit entry (who/why/ticket/time). Prefer Salt Control APIs.

## Fileserver

- SLS and extensions ship as **versioned readonly** trees (see `master.d/fileserver.conf`).
- Production Masters do not load `pillar/mock_desired.sls` or lab fixtures.

## Backup and restore

| Cadence | Scope |
| --- | --- |
| Daily | PKI, Master config (`master.d`), accepted keys, rollout metadata pointers |
| Quarterly | Restore drill onto a spare Master; verify `test.ping` + `state.highstate` on a lab minion |

## Verification commands

```text
test.ping
key.finger
key.finger_master
saltutil.sync_all
sys.list_modules
sys.list_state_modules
smc_hermes.inspect
state.highstate
```
