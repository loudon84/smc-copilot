---
name: windows-service-packaging
description: Use when implementing Windows 10 Home installation, background service startup, no-console execution, service recovery, packaging scripts, or Electron bootstrap integration for smc-copilot-serve and Hermes Agent.
license: Proprietary
compatibility: Designed for Cursor Agent, Windows 10 Home, PowerShell, Electron, Python service process, Hermes Agent local runtime.
metadata:
  version: "1.0"
  owner: "smc-copilot-desktop"
---

# Windows Service Packaging Skill

## Scope

Implement one-click or low-friction Windows deployment for `smc-copilot-serve` and Hermes Agent runtime.

Core paths:

```text
scripts/install-service-windows.ps1
scripts/uninstall-service-windows.ps1
scripts/start-local.ps1
packaging/windows/
docs/windows-service.md
```

## Requirements

1. Must work on Windows 10 Home.
2. Must run in background without opening a command window.
3. Must support auto-start after boot or user login.
4. Must expose local API only on loopback by default.
5. Must not store secrets in scripts.
6. Must allow Electron to detect service status.
7. Must allow service restart and log inspection.

## Recommended approach

Use a service wrapper where available, or a user-level scheduled task fallback.

Preferred order:

1. Windows service wrapper if installer has admin permissions.
2. Scheduled task at user logon if admin permission is not available.
3. Manual development script for dev mode.

## Implementation procedure

1. Detect Python runtime or bundled runtime path.
2. Validate `smc-copilot-serve` installation directory.
3. Generate environment file from template.
4. Register service or scheduled task.
5. Configure recovery behavior.
6. Start local service.
7. Poll `/api/v1/health`.
8. Write install log.
9. Expose status to Electron.

## Script safety rules

- Never echo API keys or tokens.
- Never delete install directories without explicit uninstall mode.
- Quote all Windows paths.
- Handle spaces in path names.
- Return non-zero exit codes on failure.
- Log to a known local app data path.

## Validation checklist

- clean install
- reinstall over existing install
- uninstall
- start after user login
- service restart
- local API health check
- Hermes Gateway start from service
- no visible command window
- logs available to desktop UI
