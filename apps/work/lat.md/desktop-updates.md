# Desktop Updates

Desktop updates use a Main-process snapshot with monotonic `revision`, so Layout and Settings render the same updater truth without racing event timing.

[[src/main/app/updater.ts#setupUpdater]] is the single updater state machine. It only enables `electron-updater` on packaged Windows non-portable builds, fixes `autoDownload=false` and `autoInstallOnAppQuit=false`, keeps a structured [[src/shared/app-update.ts#AppUpdateState]] snapshot in Main, and emits namespaced IPC over `app-update:*`. Startup and scheduled checks are silent background work: failures log and preserve actionable states like `available`, `downloading`, and `ready`.

[[src/preload/index.ts]] exposes the v2 renderer contract: `getUpdateState`, `checkForUpdates`, `downloadUpdate`, `installUpdate`, and `onUpdateStateChanged`. Legacy listener helpers remain as thin compatibility wrappers during migration, but they derive from the v2 snapshot instead of maintaining a second updater state shape.

[[src/renderer/src/update/AppUpdateProvider.tsx#AppUpdateProvider]] subscribes first, fetches the snapshot second, and only accepts higher revisions. That prevents older snapshots from overwriting newer updater events when the app boots, when Settings opens late, or when React unmounts/remounts consumers.

[[src/renderer/src/screens/Layout/Layout.tsx#Layout]] and [[src/renderer/src/components/settings/AboutPane.tsx#AboutPane]] both consume [[src/renderer/src/update/AppUpdateProvider.tsx#useAppUpdate]] through shared actions. The desktop app card in Settings remains separate from the Hermes Agent updater, but it no longer owns local updater listeners or an auto-upgrade preference toggle: users explicitly check, download, and install app updates from the shared snapshot state.

## Stable and beta release channels

Two GitHub Actions workflows publish builds; only the stable channel reaches end users' auto-update, so a beta can be tested without risking their devices.

`release.yml` (stable) runs on a push to the `release` branch: it tags `v<version>` from `package.json`, builds all platforms, and publishes a normal GitHub Release carrying the `latest*.yml` update feed. `beta-release.yml` runs on a push to `beta` (or manual dispatch): it stamps a prerelease version `v<version>-beta.<run>` via `scripts/set-version.mjs`, builds the same signed/notarized artifacts, and publishes a **GitHub prerelease** carrying a `beta*.yml` feed.

The isolation is structural: the updater ([[src/main/app/updater.ts#setupUpdater]]) leaves `allowPrerelease` off, so electron-updater's GitHub provider only ever resolves the latest **non-prerelease** release's `latest.yml`. A beta prerelease is therefore invisible to stable clients — testers download the beta installer manually from the prerelease. The beta workflow skips winget + the landing-page rebuild and uses a separate `beta-release` concurrency group so it never cancels a stable release. Cutting a beta for the *next* version requires bumping `package.json` first (a beta of an already-released version sorts lower than its stable tag).
