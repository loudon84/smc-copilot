# Desktop Updates

Desktop updates use a Main-process snapshot with monotonic `revision`, so Layout and Settings render the same updater truth without racing event timing.

[[src/main/app/updater.ts#setupUpdater]] is the single updater state machine. It only enables `electron-updater` on packaged Windows non-portable builds, fixes `autoDownload=false` and `autoInstallOnAppQuit=false`, keeps a structured [[src/shared/app-update.ts#AppUpdateState]] snapshot in Main, and emits namespaced IPC over `app-update:*`. Startup and scheduled checks are silent background work: failures log and preserve actionable states like `available`, `downloading`, and `ready`.

[[src/preload/index.ts]] exposes the v2 renderer contract: `getUpdateState`, `checkForUpdates`, `downloadUpdate`, `installUpdate`, and `onUpdateStateChanged`. Legacy listener helpers remain as thin compatibility wrappers during migration, but they derive from the v2 snapshot instead of maintaining a second updater state shape.

[[src/renderer/src/update/AppUpdateProvider.tsx#AppUpdateProvider]] subscribes first, fetches the snapshot second, and only accepts higher revisions. That prevents older snapshots from overwriting newer updater events when the app boots, when Settings opens late, or when React unmounts/remounts consumers.

[[src/renderer/src/screens/Layout/Layout.tsx#Layout]] and [[src/renderer/src/components/settings/AboutPane.tsx#AboutPane]] both consume [[src/renderer/src/update/AppUpdateProvider.tsx#useAppUpdate]] through shared actions. The desktop app card in Settings remains separate from the Hermes Agent updater, but it no longer owns local updater listeners or an auto-upgrade preference toggle: users explicitly check, download, and install app updates from the shared snapshot state.

## Internal release server

Work v2.1 switches packaged Windows releases to a static HTTPS Generic Provider pipeline rooted at `https://<release-host>/work/stable/`.

`electron-builder.yml` now brands the Windows package as **SMC Work** (`appId: com.smc.work`, `executableName: smc-work`) and points `publish` at `${env.SMC_WORK_UPDATE_URL}` with the `generic` provider. The build path is intentionally split into `scripts/build-work-release.ps1`, `scripts/validate-work-release.ps1`, and `scripts/publish-work-release.ps1` so a normal local package build cannot accidentally promote production `stable`.

The static server lives under `infra/release-server/` in the monorepo and serves artifacts from a read-only bind mount through its `nginx/default.conf`. Promotion is host-side, not in Nginx: `promote-work-release.sh` moves a fully validated `staging/<release-id>` into immutable `releases/<version>` storage, then atomically flips `stable` with `ln -s ... stable.new` plus `mv -Tf stable.new stable`. `rollback-work-stable.sh` only repoints that symlink; it does not downgrade already-upgraded clients.

Because the packaged identity changed from `com.nousresearch.hermes` / `copilot-desktop` to `com.smc.work` / `smc-work`, old `0.7.4` installs are not expected to in-place auto-upgrade into this line. The v2.1 release server covers new installs and future updates within the SMC Work identity; any old-install migration remains a separate IDM/CUTOVER exercise.

## Stable and beta release channels

Two GitHub Actions workflows publish builds; only the stable channel reaches end users' auto-update, so a beta can be tested without risking their devices.

`release.yml` (stable) runs on a push to the `release` branch: it tags `v<version>` from `package.json`, builds all platforms, and publishes a normal GitHub Release carrying the `latest*.yml` update feed. `beta-release.yml` runs on a push to `beta` (or manual dispatch): it stamps a prerelease version `v<version>-beta.<run>` via `scripts/set-version.mjs`, builds the same signed/notarized artifacts, and publishes a **GitHub prerelease** carrying a `beta*.yml` feed.

The isolation is structural: the updater ([[src/main/app/updater.ts#setupUpdater]]) leaves `allowPrerelease` off, so electron-updater's GitHub provider only ever resolves the latest **non-prerelease** release's `latest.yml`. A beta prerelease is therefore invisible to stable clients — testers download the beta installer manually from the prerelease. The beta workflow skips winget + the landing-page rebuild and uses a separate `beta-release` concurrency group so it never cancels a stable release. Cutting a beta for the *next* version requires bumping `package.json` first (a beta of an already-released version sorts lower than its stable tag).
