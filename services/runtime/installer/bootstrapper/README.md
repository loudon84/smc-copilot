# Burn bootstrapper scaffold (FR-16)

Best-effort Burn bootstrapper notes for `SMC-Copilot-Runtime-Setup-<version>.exe`. Wraps the WiX MSI and chains Hermes/runtime provisioning.

## Command-line interface

```text
Setup.exe /quiet /channel=stable /installScope=user /bootstrapConfig=<path> /norestart /log=<path>
```

| Switch | Description |
|--------|-------------|
| `/quiet` | Silent install |
| `/channel=stable` | Release channel (`dev`, `beta`, `stable`) |
| `/installScope=user` | Per-user install under `%LOCALAPPDATA%\Programs\SMC` |
| `/bootstrapConfig=<path>` | JSON bootstrap config (see `config/bootstrap.example.json`) |
| `/norestart` | Do not reboot |
| `/log=<path>` | Verbose install log |

## Bootstrap flow (concept)

1. Validate OS and free disk.
2. Install MSI payload to user Programs folder.
3. Start Runtime with `RUNTIME_BOOTSTRAP_TOKEN` (one-time).
4. `POST /api/v1/bootstrap` with config JSON and `Authorization: Bearer <token>`.
5. Poll `GET /api/v1/bootstrap/jobs/{id}` until complete.
6. Register UserDaemon (`install --replace`) and exit.

## Exit codes

Same as MSI — see `installer/wix/README.md` (0, 10–17).

## Bootstrapper.wxs

`Bootstrapper.wxs` is a minimal WiX Burn chain stub chaining the MSI. Customize `MsiPackage` source path at build time.
