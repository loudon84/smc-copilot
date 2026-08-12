# Salt v2.1 Real Windows Canary

v2.1 does **not** accept fixture-only closeout. Run on ≥5 real Windows 11 x64 PCs/VMs. This repo ships scripts + Pester stubs; executing them on hardware is a lab/ops step.

Salt Minion channel: **3008 LTS**. Production Master: `auto_accept: false`.

## Preconditions

- Windows 11 x64 (build ≥ 22000)
- Machine-scope SMC Endpoint Bootstrap (not apps/work NSIS)
- `apps/work` user-scope install
- Runtime may be present on migrate PCs; Salt mode clients must not start it
- `%ProgramData%\SMC\control-owner.json` written by bootstrap/highstate: `{ "hermes": "salt" }`

## Case A — Fresh PC (SALT-101…104, HERMES-101, GATEWAY-101, WORK-101…103)

```text
no Runtime / no Hermes
→ bootstrap.ps1 / fresh-install.ps1
→ Salt enroll (fingerprint match, Integration accept)
→ saltutil.sync_all
→ signed Hermes install
→ OnLogon Gateway (bound user)
→ apps/work Chat / Session / Files / Slash
```

## Case B — Existing Runtime PC (MIGRATE-101, HERMES-102, WORK-101)

```text
Runtime installed + existing Hermes data
→ migrate-runtime-to-salt.ps1
→ adopt existing Hermes Home (no second home)
→ Runtime stopped/disabled
→ owner=salt
→ Chat/Session regression
```

Rollback drill: `rollback-to-runtime.ps1` (MIGRATE-102). Do not uninstall Runtime files.

## Case C — User Switch (USER-101, SECRET-101)

```text
User A logout → User B login
→ Backend Binding update → pillar refresh
→ Gateway task user/path update
→ A secret refs not reusable
```

## Case D — Salt Master Offline (OFFLINE-101)

```text
Master unavailable
→ existing Gateway stays running
→ apps/work Chat remains available
→ new control jobs pending
```

## Pester stubs

See `infra/salt/tests/canary/`. Marked `Not executed in CI` — run on the canary PC:

```powershell
Invoke-Pester -Path infra/salt/tests/canary
```

## Record

| ID | Result | Notes |
| --- | --- | --- |
| SALT-101 |  | silent install 3008.2 |
| SALT-102 |  | master_finger |
| SALT-103 |  | secure enrollment |
| SALT-104 |  | sync_all live minion |
| SALT-105 |  | reboot reconnect |
| HERMES-101 |  | signed fresh install |
| HERMES-102 |  | adopt existing home |
| HERMES-103 |  | upgrade |
| HERMES-104 |  | rollback |
| GATEWAY-101 |  | bound user OnLogon |
| GATEWAY-102 |  | no System fallback |
| GATEWAY-103 |  | external restart |
| CONFIG-101 |  | desired config apply |
| CONFIG-102 |  | invalid config rollback |
| USER-101 |  | binding refresh |
| SECRET-101 |  | no secret log/return |
| MIGRATE-101 |  | Runtime → Salt |
| MIGRATE-102 |  | Salt → Runtime rollback |
| WORK-101 |  | Runtime stopped startup |
| WORK-102 |  | Chat streaming |
| WORK-103 |  | Sessions/files/slash |
| OFFLINE-101 |  | Master offline Chat |
