# Work Application Structure

SMC Copilot Work is an Electron/Vite desktop client whose Main, preload, renderer, and shared layers keep privileged operations and presentation code separate.

## Process boundaries

Electron starts from [[src/main/index.ts]], which performs pre-ready setup before delegating lifecycle ownership to [[src/main/app/start.ts#startMainProcess]]. Main owns window lifecycle, protocols, persistence, local process coordination, remote transports, and all IPC registration through [[src/main/ipc/register.ts#registerIpcHandlers]].

`src/preload/` is the renderer's only Electron boundary. [[src/preload/index.ts]] exposes typed, curated `electron`, `hermesAPI`, and authentication capabilities through `contextBridge`; renderer code must not acquire Node or Electron capabilities directly.

`src/renderer/src/` starts at [[src/renderer/src/main.tsx]] and mounts the React application in [[src/renderer/src/App.tsx]]. It contains screens, reusable components, feature modules, hooks, runtime presentation, update UI, and browser-safe utilities.

`src/shared/` holds contracts and data types used across process boundaries, including runtime, authentication, file, i18n, session, and model-related definitions. It may describe a boundary, but it does not become a second privileged service layer.

## Main feature ownership

The Main process is organized by capability rather than by one monolithic service.

- `app/` owns desktop lifecycle, menu, tray, and updater wiring; see [[main-process]].
- `ipc/` owns the generic Main IPC registry, while `auth/`, `expert/`, `files/`, and `skill-run/` retain their capability-specific handlers and services.
- `hermes/` and `runtime/` adapt configured Hermes connectivity and control ownership; the renderer consumes their sanitized IPC contract, as described by [[runtime-connection]].
- `migration/`, `secrets/`, persistence stores, and security helpers support durable local state and privileged operations without leaking them to renderer code.

Feature documents remain the authority for detailed behavior: [[chat-runtime-contract]] defines transcript projection, [[file-platform]] owns file and artifact handling, [[expert-execution]] documents the compatibility execution path, and [[skill-run]] documents the gated Skill Run lifecycle.

## Build and verification layout

[[electron.vite.config.ts]] defines the Electron-Vite Main, preload, and renderer bundles, including the two preload entries and renderer aliasing. `package.json` supplies the development, typecheck, test, build, release, and boundary-guard commands.

Vitest is configured in [[vitest.config.ts]] to collect `src/**/*.test.ts(x)` and `tests/**/*.test.ts(x)` with the renderer test setup. `src/` therefore keeps unit and component tests beside their owners, while `tests/` holds cross-cutting, contract, release, and end-to-end scenario coverage. The package `guard` command enforces renderer and runtime ownership boundaries in addition to static import and locale checks.

## Documentation navigation

Use this document for structural orientation, then navigate to the smallest feature document that owns the behavior being changed. Do not treat legacy reference trees, generated outputs, or archived planning material as implementation sources.
