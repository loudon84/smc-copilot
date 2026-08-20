# Desktop Updates

Desktop updates use a Main-process snapshot with monotonic `revision`, so Layout and Settings render the same updater truth without racing event timing.

[[src/main/app/updater.ts#setupUpdater]] is the single updater state machine. It only enables `electron-updater` on packaged Windows non-portable builds, fixes `autoDownload=false` and `autoInstallOnAppQuit=false`, keeps a structured [[src/shared/app-update.ts#AppUpdateState]] snapshot in Main, and emits namespaced IPC over `app-update:*`. Startup and scheduled checks are silent background work: failures log and preserve actionable states like `available`, `downloading`, and `ready`.

[[src/preload/index.ts]] exposes the v2 renderer contract only: `getUpdateState`, `checkForUpdates`, `downloadUpdate`, `installUpdate`, and `onUpdateStateChanged`. Legacy updater IPC, push events, and auto-upgrade preference APIs are removed.

[[src/renderer/src/update/AppUpdateProvider.tsx#AppUpdateProvider]] subscribes first, fetches the snapshot second, and only accepts higher revisions. That prevents older snapshots from overwriting newer updater events when the app boots, when Settings opens late, or when React unmounts/remounts consumers.

[[src/renderer/src/screens/Layout/Layout.tsx#Layout]] and [[src/renderer/src/components/settings/AboutPane.tsx#AboutPane]] both consume [[src/renderer/src/update/AppUpdateProvider.tsx#useAppUpdate]] through shared actions. The desktop app card in Settings remains separate from the Hermes Agent updater, but it no longer owns local updater listeners or an auto-upgrade preference toggle: users explicitly check, download, and install app updates from the shared snapshot state.

## Product identity

The shipped Windows product is **SMC-Copilot**. Engineering still uses `apps/work`, `/work/stable/`, and `SMC_WORK_*` env names.

Packaged identity is `appId: com.smc.copilot`, `productName: SMC-Copilot`, `executableName: smc-copilot`, and installer `smc-copilot-{version}-setup.exe`. Runtime [[src/main/app/start.ts]] sets AppUserModelId to `com.smc.copilot`. NSIS `build/installer.nsh` reads InstallLocation in 64-bit then 32-bit HKLM/HKCU, then legacy `com.nousresearch.hermes` keys, then defaults a fresh install to `D:\Programs\SMC\Copilot` or `%ProgramFiles%\SMC\Copilot`. `customInstall` silently uninstalls leftover per-user hermes installs so upgrades do not leave a second product.

## UserData migration

Renaming `package.json` `name` to `smc-copilot` changes `%APPDATA%\<name>`, so a one-shot migration preserves login, chat, and settings.

[[src/main/migration/identity-migration.ts#applyIdentityMigration]] runs in [[src/main/index.ts]] before GPU preference reads. If `HERMES_DESKTOP_USER_DATA_DIR` is unset and the new userData directory is empty, it backups then copies `copilot-desktop` (then `SMC Work`) into the current path, verifies file sizes, and writes state to `%LOCALAPPDATA%\SMC\work-identity-migration.json`. A populated new directory is never overwritten, and the source directory is kept until after verify.

## Update error contract

Updater failures map to a closed error-code set so Settings can retry without guessing electron-updater strings.

[[src/main/app/update-error.ts#normalizeUpdaterError]] classifies check/download/install errors into `CHECK_FAILED`, `DOWNLOAD_FAILED`, `UPDATE_METADATA_INVALID`, `SIGNATURE_INVALID`, or `INSTALL_FAILED`. Unrecognized messages stay on the current operation's generic code instead of inventing a more specific one.

## Release integrity

A signed Windows installer is not releasable until `latest.yml.sha512` matches the final exe and the version directory does not already exist.

Build signs first, then `scripts/lib/work-release-guard.mjs` `assertLatestYmlSha512` requires Base64(SHA512(installer)) to equal `latest.yml.sha512`. Manifests carry `publisher`. Existing `release/work/<version>` directories are immutable. Host promote uses the same sha512 gate in `infra/release-server/scripts/assert-work-release.sh`.

## Internal release server

Packaged Windows releases use a static HTTPS Generic Provider at `https://release.superic.com/work/stable/`.

`electron-builder.yml` points `publish` at `${env.SMC_WORK_UPDATE_URL}` with the `generic` provider. The build path is split into `scripts/build-work-release.ps1`, `scripts/validate-work-release.ps1`, and `scripts/publish-work-release.ps1` so a normal local package build cannot accidentally promote production `stable`.

Production gates require hostname `release.superic.com`, a packaged `app-update.yml` with that feed, Authenticode `Valid` plus `SMC_WORK_EXPECTED_PUBLISHER`, `latest.yml.sha512`, and `manifest.signed=true` on remote publish. `SMC_WORK_RELEASE_ALLOW_UNSIGNED=1` is fixture-only and is `PUBLISH_DENIED` for remote publish. After promote, publish GETs `latest.yml` and HEADs the installer or reports `PUBLISH_NOT_CONFIRMED`.

The static server lives under `infra/release-server/` and serves a read-only volume as `release.superic.com`. Host-side `promote-work-release.sh` and `rollback-work-stable.sh` call `assert-work-release.sh` before the atomic `stable` symlink swap. Rollback only repoints `stable`; it does not downgrade already-upgraded clients. `production-smoke.sh` checks DNS, TLS, Cache-Control, Range, and sha512 fields against the live feed.

## Update dialogs

Sidebar status remains, but available and ready states also prompt with explicit Later / Download / Install actions.

[[src/renderer/src/update/UpdateAvailableDialog.tsx#UpdateAvailableDialog]], [[src/renderer/src/update/UpdateDownloadStatus.tsx#UpdateDownloadStatus]], and [[src/renderer/src/update/UpdateReadyDialog.tsx#UpdateReadyDialog]] mount inside [[src/renderer/src/App.tsx]] under `AppUpdateProvider`. Later dismisses only the current session prompt and does not download, disable checks, or mutate the Main snapshot. Build injects `release-notes/<version>.md` into `latest.yml` so `releaseNotes` reaches the dialog.

## Windows live evidence

Code gates cannot prove a packaged Windows upgrade. Fresh install, `0.7.4 → 0.7.5`, userData continuity, and TLS against `release.superic.com` stay a human Gate.

Minimum matrix (not proven here), on Windows 10 x64 and Windows 11 x64:

- A: clean install 0.7.4, then update to signed 0.7.5
- B: pre-0.7.4 hermes / copilot-desktop Bootstrap via 0.7.5 setup, old product gone, sessions remain
- C: custom install directory is kept
- D: Download then Later then Quit does **not** install
- E: Install Now closes, installs, restarts on 0.7.5 with login/settings/chat DB intact

Do not skip Windows certificate verification. Failure cases: unsigned publish denied, wrong feed host, rollback of `stable` hides the bad version from clients that have not upgraded.

## Stable and beta release channels

Monorepo Work CI/Release is independent of desktop/runtime tags. Production updates use only the Generic internal feed.

`.github/workflows/work-ci.yml` runs guard, typecheck, test, and build for `apps/work` and `infra/release-server`. `.github/workflows/work-release.yml` builds a signed Windows NSIS release; Stable Promote is a separate job gated by the `work-stable` GitHub Environment. Upstream `apps/work/.github/workflows/release.yml` / `beta-release.yml` remain historical. Cutting the next production version requires bumping `package.json` and adding `release-notes/<version>.md` before `release:build:win`.
