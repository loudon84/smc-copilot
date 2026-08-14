# Machine / User Bootstrap Spike

SYSTEM must not install Hermes into `systemprofile`. Machine layer only stages OPSI-managed files; user-context bootstrap creates/starts Hermes Home.

Live Lab status: **not_proven**.

## Directories

| Path | Owner | Contents |
| --- | --- | --- |
| `C:\ProgramData\SMC\opsi\` | SYSTEM | Adapter, bootstrap, managed policy, state, diagnostics, logs, staging |
| `C:\ProgramData\SMC\control-owner.json` | SYSTEM | `{ "hermes": "opsi" }` |
| User `HERMES_HOME` | Logged-in user SID | Hermes runtime, profiles, credentials — **never** written by SYSTEM install |

SYSTEM must not write `C:\Windows\System32\config\systemprofile` or `C:\Users\*\.hermes` by username guess.

## User resolution

Target user is an explicit Windows SID (and optional `DOMAIN\account`). Resolve profile directory via SID. Prefer `hermes config path` / `hermes config env-path` / `HERMES_HOME` for the actual home.

## Handoff

1. SYSTEM: verify artifact SHA256/signature, atomic stage to version dir, write `version.json`, register logon Scheduled Task / trigger for that SID.
2. No interactive user: return `USER_CONTEXT_PENDING`. Do not report install success.
3. At logon: user-context script initializes Hermes Home, prefers native Gateway install/autostart, else a versioned per-user Scheduled Task (least privilege, uninstallable).
4. Concurrent logons: each SID has its own task and home; Machine staging is shared and read-only for users.
5. Logout/reboot: Gateway task is logon-triggered; Machine staging survives. Uninstall removes OPSI files and triggers only.

## Uninstall data boundary

Uninstall deletes OPSI-managed files and triggers. It **retains** Profiles, Config, Skills, Plugins, Memory, Sessions, Credentials, Workspace.
