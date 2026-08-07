# Changelog

All notable changes to Hermes Desktop (SMC Copilot) are documented in this file.

## [0.3.6] - V3.3.1 Auth Embed Hotfix

### Changed

- **Session partitions (breaking for stored cookies)**:
  - `persist:aios-desktop` → `persist:aios-home` — users must sign in to the Portal Portal again after upgrade
  - `persist:aios-external-web` → `persist:web-operator` — Web Operator session cookies are reset
- **Startup gate**: All connection modes (local, remote, ssh) now require Desktop Auth (endpoint + token) and completed bootstrap before entering `main`
- **Bootstrap pending**: If authenticated but bootstrap is not initialized, app routes to `login` with `bootstrap-pending`; LoginScreen auto-retries bootstrap without re-entering password
- **Bootstrap apply**: Remote `aios.*` fields are synced to `auth-endpoint-config.json`; token injection policy updates immediately; `aios-home` WebContentsView reloads when URL changes
- **Remote / SSH**: No longer bypass login; same auth + bootstrap gate as local mode

### Added

- `aios-home-view-coordinator.ts` — `refreshAiosHomeView()` for immediate Portal reload after config apply
- `aios:get-home-url` IPC — read-only resolved Home URL for Renderer (`window.aiosRuntime.getHomeUrl()`)
- `bootstrap-pending` startup decision reason
- Dev Mock Auth badge on LoginScreen when using mock user (`mock-user-1`)
- Explicit auth IPC channel tests in `tests/ipc-handlers.test.ts`

## [0.3.5] - V3.3 Auth Embed

See plan `.cursor/plans/v3.3_auth_embed_cb289475.plan.md` and `prd/v3.3_module_ui.md`.

- Endpoint config + Main token vault (keytar / safeStorage / memory)
- Origin whitelist token injection for `persist:aios-home`
- Login-first startup flow with `DesktopAuthAPI`
- User config schema v2 (`authPrefix`, `aiosHomeUrl`)
