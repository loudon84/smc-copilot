# Desktop Updates

Desktop updates use a Main-process snapshot with monotonic `revision`, so Layout and Settings render the same updater truth without racing event timing.

[[src/main/app/updater.ts#setupUpdater]] is the single updater state machine. It only enables `electron-updater` on packaged Windows non-portable builds, fixes `autoDownload=false` and `autoInstallOnAppQuit=false`, keeps a structured [[src/shared/app-update.ts#AppUpdateState]] snapshot in Main, and emits namespaced IPC over `app-update:*`. Startup and scheduled checks are silent background work: failures log and preserve actionable states like `available`, `downloading`, and `ready`.

[[src/preload/index.ts]] exposes the v2 renderer contract: `getUpdateState`, `checkForUpdates`, `downloadUpdate`, `installUpdate`, and `onUpdateStateChanged`. Legacy listener helpers remain as thin compatibility wrappers during migration, but they derive from the v2 snapshot instead of maintaining a second updater state shape.

[[src/renderer/src/update/AppUpdateProvider.tsx#AppUpdateProvider]] subscribes first, fetches the snapshot second, and only accepts higher revisions. That prevents older snapshots from overwriting newer updater events when the app boots, when Settings opens late, or when React unmounts/remounts consumers.

[[src/renderer/src/screens/Layout/Layout.tsx#Layout]] and [[src/renderer/src/components/settings/AboutPane.tsx#AboutPane]] both consume [[src/renderer/src/update/AppUpdateProvider.tsx#useAppUpdate]] through shared actions. The desktop app card in Settings remains separate from the Hermes Agent updater, but it no longer owns local updater listeners or an auto-upgrade preference toggle: users explicitly check, download, and install app updates from the shared snapshot state.

## Product identity

The shipped Windows product is **SMC-Copilot**. Engineering still uses `apps/work`, `/work/stable/`, and `SMC_WORK_*` env names.

Packaged identity is `appId: com.smc.copilot`, `productName: SMC-Copilot`, `executableName: smc-copilot`, and installer `smc-copilot-{version}-setup.exe`. Runtime [[src/main/app/start.ts]] sets AppUserModelId to `com.smc.copilot`. NSIS `build/installer.nsh` defaults a fresh install to `D:\Programs\SMC\Copilot`, falling back to `%ProgramFiles%\SMC\Copilot` when D: is missing, and keeps an existing `InstallLocation` on upgrade.

## UserData migration

Renaming `package.json` `name` to `smc-copilot` changes `%APPDATA%\<name>`, so a one-shot migration preserves login, chat, and settings.

[[src/main/user-data-migration.ts#applyLegacyUserDataMigration]] runs in [[src/main/index.ts]] before GPU preference reads. If `HERMES_DESKTOP_USER_DATA_DIR` is unset and the new userData directory is empty, it moves `copilot-desktop` (then `SMC Work`) into the current path. A populated new directory is never overwritten.

## Internal release server

Packaged Windows releases use a static HTTPS Generic Provider at `https://release.superic.com/work/stable/`.

`electron-builder.yml` points `publish` at `${env.SMC_WORK_UPDATE_URL}` with the `generic` provider. The build path is split into `scripts/build-work-release.ps1`, `scripts/validate-work-release.ps1`, and `scripts/publish-work-release.ps1` so a normal local package build cannot accidentally promote production `stable`.

Production gates require hostname `release.superic.com`, a packaged `app-update.yml` with that feed, Authenticode `Valid` plus `SMC_WORK_EXPECTED_PUBLISHER`, and `manifest.signed=true` on remote publish. `SMC_WORK_RELEASE_ALLOW_UNSIGNED=1` is fixture-only and is `PUBLISH_DENIED` for remote publish. After promote, publish GETs `latest.yml` and HEADs the installer or reports `PUBLISH_NOT_CONFIRMED`.

The static server lives under `infra/release-server/` and serves a read-only volume as `release.superic.com`. Host-side `promote-work-release.sh` and `rollback-work-stable.sh` call `assert-work-release.sh` before the atomic `stable` symlink swap. Rollback only repoints `stable`; it does not downgrade already-upgraded clients.

## Update dialogs

Sidebar status remains, but available and ready states also prompt with explicit Later / Download / Install actions.

[[src/renderer/src/update/UpdateAvailableDialog.tsx#UpdateAvailableDialog]], [[src/renderer/src/update/UpdateDownloadStatus.tsx#UpdateDownloadStatus]], and [[src/renderer/src/update/UpdateReadyDialog.tsx#UpdateReadyDialog]] mount inside [[src/renderer/src/App.tsx]] under `AppUpdateProvider`. Later dismisses only the current session prompt and does not download, disable checks, or mutate the Main snapshot. Build injects `release-notes/<version>.md` into `latest.yml` so `releaseNotes` reaches the dialog.

## Windows live evidence

Code gates cannot prove a packaged Windows upgrade. Fresh install, `0.7.4 → 0.7.5`, userData continuity, and TLS against `release.superic.com` stay a human Gate.

Checklist (not proven here): install `smc-copilot-0.7.4-setup.exe` to `D:\Programs\SMC\Copilot` with `smc-copilot.exe` and AppUserModelId `com.smc.copilot`; Chat and Settings start; publish signed `0.7.5`; the installed app shows the available dialog, user-confirmed download, ready dialog, restart, and keeps login/settings/chat DB. Do not skip Windows certificate verification. Failure cases: unsigned publish denied, wrong feed host, rollback of `stable` hides the bad version from clients that have not upgraded.

## Stable and beta release channels

Two GitHub Actions workflows still exist on the upstream fork; production Work updates no longer use the GitHub provider.

`release.yml` / `beta-release.yml` remain historical. The packaged updater reads Generic `latest.yml` from `release.superic.com` and keeps `allowPrerelease` off. Cutting the next production version requires bumping `package.json` and adding `release-notes/<version>.md` before `release:build:win`.
