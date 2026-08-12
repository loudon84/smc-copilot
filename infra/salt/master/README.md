# Production Salt Master (v2.4 Ring 0)

Topology: **v2.4 Ring 0 uses a single Master** at `192.168.102.104`. Second Master, MultiMaster-PKI, and bidirectional failover are deferred to **v2.5 HA Readiness**. Do not deploy `master.d/failover.conf` for Ring 0 (see `deploy-list-v24-single-master.txt`).

Minions: Ring 0 uses scalar `master: 192.168.102.104`. Multimaster `master_type: failover` is out of scope until v2.5.

## salt-api / eAuth

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
| Ring 0 | Restore drill onto an isolated spare; verify `test.ping` + sync + health (see v2.3.1 / v2.4 evidence) |

## Verification commands

```text
test.ping
key.finger
key.finger_master
saltutil.sync_all
sys.list_modules
sys.list_state_modules
smc_hermes.inspect
smc_handover.migrate
smc_handover.rollback
state.highstate
```
