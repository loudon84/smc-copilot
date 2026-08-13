# Salt v2.4.2 Loader & Binding Contract Fix — STATUS

Decision: **NO-GO**
Verification: **not_proven**

This file is an unsigned status template for the v2.4.2 Loader/Contract fix.
It does not copy or rewrite historical Live Evidence from v2.4 / v2.4.1.

## Scope

- Salt 3008.2 independent `_utils` plugin loader
- External Pillar ↔ Salt Control Desired State / Artifact contract
- Job Payload ↔ `smc_hermes` / `smc_handover` invocation contract
- Existing Minion identity adoption Dry Run + binding fail-closed rules

## Not in this window

- `ITBJB0676` → `ep_*` identity switch
- Endpoint/User Binding creation
- Hermes install / Control Owner switch / Runtime stop
- Highstate, Handover, Ring 0 Advance, Runtime Decommission

## Manual verification entry

Operator-only. Cursor must not publish the release, restart `salt-master`, or mark `proven`.

1. Publish immutable Release Candidate `v2.4.2-loader-binding-contract-fix`
2. Sync pillar and restart unique Master `192.168.102.104` (`salt-master`)
3. `salt 'ITBJB0676' test.ping` / `service.status salt-minion`
4. `saltutil.sync_all refresh=True` then `smc_hermes.loader_status` / `inspect` / `doctor` / `grains.item smc_endpoint`
5. Hostname Pillar must return `identity_adoption_required` (or explicit backend unavailable) and empty `smc`

Record Release Version, Git Commit, time, and secret-free command summaries here only after the operator run.
