# Runtime Connection

Copilot Desktop connects to Copilot Runtime (`services/runtime`) for Hermes Agent install and Gateway lifecycle.

## Boundary

Desktop owns login, local connection config, Chat, Sessions, Profile, MCP, and settings. Runtime owns Hermes install, update, doctor, version, and Gateway start/stop/restart/health.

Hermes Agent owns agent loop, session data, skills/tools. See [[src/shared/runtime/runtime-contract.ts]] for shared probe types.

## Path resolution

Runtime paths live outside the install module so Gateway and Chat stay decoupled.

[[src/main/runtime/hermes-runtime-paths.ts]] owns `HERMES_HOME` and derived paths so Gateway/Chat no longer import `installer.ts`.

## Adapter

Local default profile uses the Runtime Service adapter; other profiles keep the legacy local adapter.

[[src/main/runtime/runtime-service-adapter.ts]] implements `HermesRuntimeAdapter` via [[src/main/runtime/runtime-management-backend.ts]] and `@smc/runtime-client`. [[src/main/runtime/legacy-local-runtime-adapter.ts]] remains for non-default profiles. [[src/main/runtime/runtime-manager.ts]] is the IPC facade.

## Runtime Service Adapter

Default-profile adapter delegates probe/ensureReady/restart to the Runtime HTTP backend and falls back to Legacy for other profiles.

## Runtime Management Backend

HTTP facade over `/api/v1/runtime/*` and `/api/v1/instances/*` used by IPC and the adapter.

## Runtime Management Mapper

Maps Runtime readiness/health/job SSE payloads into Desktop `HermesRuntimeProbe` and legacy `install-progress` events.

## Runtime Service Client

Main-only HTTP client targets `http://127.0.0.1:8765` (override with `HERMES_RUNTIME_SERVICE_URL`).

[[src/main/runtime/runtime-service-client.ts]] constructs `createRuntimeClient`. Mappers live in [[src/main/runtime/runtime-management-mapper.ts]]. Errors map through [[src/main/runtime/runtime-service-errors.ts]].

## Startup

App splash checks Portal Auth, then connects Runtime before main UI, or shows Connection Error / Login.

[[src/renderer/src/App.tsx]] starts at splash, may route to [[src/renderer/src/modules/auth/LoginScreen.tsx]], then `runtimeEnsureLocalReady` for local mode, and routes to main or Connection Error. Remote and SSH skip local Runtime probe. [[src/renderer/src/screens/SplashScreen/SplashScreen.tsx]] shows a centered `hermes-one.png` image on a black splash (no intro video), plus status text and the remote escape hatch when needed.

## Portal Auth Login

Phase 5 migrates Portal Auth Login only (not Hermes Panel / JSSDK / Service Settings).

Main handlers live in [[src/main/auth/auth-ipc.ts]]; preload exposes `window.desktopAuth` via [[src/preload/auth-api.ts]]. Tokens stay Main-only in [[src/main/auth/token-store.ts]].
