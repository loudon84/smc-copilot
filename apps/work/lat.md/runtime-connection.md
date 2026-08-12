# Runtime Connection

Work connects to Hermes Gateway for Connection Ready by default (`direct`). Copilot Runtime (`services/runtime` :8765) is opt-in (`control owner = runtime`). Salt mode uses Availability probe only.

## Boundary

Desktop owns login, Chat, Sessions, and settings. Control owner selects who manages Hermes install and Gateway lifecycle:

- `direct` (default): Work probes and may start Gateway against Hermes home / `:8642`.
- `salt`: Salt owns install/lifecycle; Work only probes Availability.
- `runtime`: Copilot Runtime HTTP (`:8765`) owns install/lifecycle.

Hermes Agent owns agent loop, session data, skills/tools. See [[src/shared/runtime/runtime-contract.ts]] for shared probe types.

## Path resolution

Runtime paths live outside the install module so Gateway and Chat stay decoupled.

[[src/main/runtime/hermes-runtime-paths.ts]] owns `HERMES_HOME` and derived paths so Gateway/Chat no longer import `installer.ts`.

## Adapter

[[src/main/runtime/runtime-manager.ts]] picks the adapter from control owner:

- `direct` → [[src/main/runtime/legacy-local-runtime-adapter.ts]] (Gateway `:8642`, no Runtime HTTP)
- `salt` → [[src/main/hermes/availability-backend.ts]]
- `runtime` → [[src/main/runtime/runtime-service-adapter.ts]] via [[src/main/runtime/runtime-management-backend.ts]]

## Runtime Service Adapter

Opt-in adapter when `SMC_HERMES_CONTROL_OWNER=runtime`. Delegates probe/ensureReady/restart to the Runtime HTTP backend and falls back to Legacy for non-default profiles.

## Runtime Management Backend

HTTP facade over `/api/v1/runtime/*` and `/api/v1/instances/*` used by IPC and the adapter when control owner is `runtime`.

Instance routes require the instance **UUID**. [[src/main/runtime/runtime-management-backend.ts]] resolves `default` via `instances.resolve` / `instances.list` before `getHealth` / `start` / `stop` / `reconcile` — calling `/instances/default/health` 404s and used to be mapped as a false `gateway_stopped`. When start fails with port ownership conflict, the backend re-probes; a healthy authenticated gateway still counts as ready. `ensureReady` also best-effort `reconcile`s before start.

## Runtime Management Mapper

Maps Runtime readiness/health/job SSE payloads into Desktop `HermesRuntimeProbe` and legacy `install-progress` events.

## Runtime Service Client

Main-only HTTP client targets `http://127.0.0.1:8765` (override with `HERMES_RUNTIME_SERVICE_URL`). Only used when control owner is `runtime`.

[[src/main/runtime/runtime-service-client.ts]] constructs `createRuntimeClient`. Mappers live in [[src/main/runtime/runtime-management-mapper.ts]]. Errors map through [[src/main/runtime/runtime-service-errors.ts]].

## Startup

App splash checks Portal Auth, then connects Hermes before main UI, or shows Connection Error / Login.

[[src/renderer/src/App.tsx]] starts at splash, may route to [[src/renderer/src/modules/auth/LoginScreen.tsx]], then `runtimeEnsureLocalReady` for local `direct`/`runtime` mode, and routes to main or Connection Error. Remote and SSH skip local probe. [[src/renderer/src/screens/SplashScreen/SplashScreen.tsx]] shows a centered `hermes-one.png` image on a black splash (no intro video), plus status text and the remote escape hatch when needed.

`RuntimeProvider` wraps `SettingsModalProvider` so [[src/renderer/src/components/settings/RuntimePane.tsx]] (mounted as a settings-modal sibling) can call `useRuntime`.

## Direct Hermes Mode

Default Work mode (`direct`) and Salt-managed Work (`SMC_HERMES_CONTROL_OWNER=salt` or `%ProgramData%\SMC\control-owner.json`) do not depend on Runtime `:8765` for Connection Ready.

[[src/main/hermes/control-owner.ts]] is the owner mutex (default `direct`). `direct` uses Legacy local adapter to probe/start Gateway. Salt mode uses [[src/main/hermes/availability-backend.ts]] and splash [[src/renderer/src/runtime/RuntimeProvider.tsx]] calls `runtimeGetStatus` instead of `runtimeEnsureLocalReady`. Chat transport stays in [[src/main/hermes.ts]].

## Hermes Availability Backend

Probe-only Connection Ready for enterprise/Salt mode. Never install, update, or spawn Gateway.

Uses [[src/main/hermes/transport/gateway-http.ts]] for Gateway URL and `/health` (same path as Chat transport). `authenticated` is derived from local API key presence and is not equal to `gatewayHealthy`.

## Portal Auth Login

Phase 5 migrates Portal Auth Login only (not Hermes Panel / JSSDK / Service Settings).

Main handlers live in [[src/main/auth/auth-ipc.ts]]; preload exposes `window.desktopAuth` via [[src/preload/auth-api.ts]]. Tokens stay Main-only in [[src/main/auth/token-store.ts]].
