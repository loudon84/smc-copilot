# WiX MSI scaffold (FR-16)

Best-effort WiX Toolset 5 sources for `SMC-Copilot-Runtime-<version>-x64.msi`. Python tests and CI do not require WiX to be installed.

## Install location

| Scope | Path |
|-------|------|
| User (default) | `%LOCALAPPDATA%\Programs\SMC\CopilotRuntime` |

Machine-level installers only lay down binaries; the Runtime process is started per user via Task Scheduler `ONLOGON` (`HermesRuntimeUserDaemon`, `LIMITED`).

## Task Scheduler (concept)

After file copy, a deferred custom action should run:

```text
python.exe -m local_service.windows_user_daemon install --replace
```

This registers `schtasks /SC ONLOGON /RL LIMITED` for the installing user. See [[src/local_service/windows_user_daemon.py]].

## Standard exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 10 | Unsupported system |
| 11 | Port conflict (8765 held by non-Runtime process) |
| 12 | Runtime install failed |
| 13 | Hermes install failed |
| 14 | Gateway verification failed |
| 15 | Auth initialization failed |
| 16 | Signature verification failed |
| 17 | Repair failed |

## Build (when WiX is available)

```powershell
wix build Package.wxs -o dist\SMC-Copilot-Runtime-x64.msi
```

Bind paths and file versions are supplied by `build/runtime-bundle.ps1` (not required for local Python development).

## Repair (FR-29)

```text
Setup.exe /repair
```

Repair checks Runtime files, embedded Python, database migration, UserDaemon, ports, Active Hermes, Instance, and Gateway. It repairs program and control-plane files only. It does **not** delete `~/.hermes`, sessions, skills, or memories by default.

## Uninstall (FR-30)

```text
Setup.exe /uninstall /quiet
```

Default removal:

- Runtime program files
- UserDaemon scheduled task
- Runtime cache and temp

Default retention:

- `~/.hermes`, Hermes Profile, Session, Skill, Memory

Optional flags:

```text
/removeRuntimeData
/removeHermesVersions
/removeHermesUserData
```
