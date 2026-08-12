# Production Salt Master (v2.2 / v2.3)

Topology: production target is two Linux Masters in Active/Passive failover. **v2.3 first-endpoint lab** may use single Master `192.168.102.104` only — Ring 0 remains **NO-GO** until second Master + failover drill are proven.

Minions: single Master uses scalar `master:`; multimaster uses `master_type: failover` with `master_alive_interval: 60`.

## salt-api / eAuth (v2.3)

- `master.d/salt-api.conf` — rest_cherrypy TLS only
- `master.d/eauth.conf` — `salt_control` allowlist (`test.ping`, `saltutil.*`, `state.*`, `smc_hermes.*`, `smc_handover.*`); no shell/cmd
- Release publish: `infra/salt/scripts/publish-salt-release.py` (current/previous atomic switch)

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
smc_handover.commit
state.highstate
```
