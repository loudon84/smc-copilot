# Runtime Connection

Work connects to the OPSI-managed Hermes Gateway for Connection Ready. Work discovers runtime state, probes Gateway health, and calls Gateway HTTP APIs — it does not install Hermes or own Gateway lifecycle.

## Boundary

OPSI / Hermes Installer owns install, upgrade, repair, machine Hermes config, ACL, and the `SMC Hermes Gateway` scheduled task. Work owns discovery, status, authentication probing, and Chat/Session/Model HTTP calls. See [[src/shared/runtime/runtime-contract.ts]] for shared probe types.

## Runtime Descriptor

[[src/main/runtime/hermes-runtime-config.ts]] resolves `HermesRuntimeConfig`: home, programRoot, cliPath, and gateway.baseUrl for managed runtime discovery.

Resolution priority: Work `runtime.json`, enterprise descriptor, machine `HERMES_HOME`, then platform defaults (`C:\ProgramData\SMC\Hermes`, `D:\Programs\SMC\Hermes\bin\hermes.exe`, `http://127.0.0.1:8642`).

## Path resolution

[[src/main/runtime/hermes-runtime-paths.ts]] re-exports runtime getters and legacy compatibility helpers. New code must call `getHermesHome()`, `getHermesCliPath()`, and `getGatewayBaseUrl()` instead of deriving repo/venv/python paths.

## CLI invocation

[[src/main/runtime/hermes-cli-runner.ts]] invokes `hermes.exe` by absolute path with managed PATH segments for subprocesses. Version and doctor checks use `hermes.exe --version` / `hermes.exe doctor`.

## Adapter

[[src/main/runtime/runtime-manager.ts]] always uses [[src/main/runtime/legacy-local-runtime-adapter.ts]] (Managed Local Hermes Runtime Consumer). `probe()` checks CLI + Gateway health + authenticated API probe; `ensureReady()` is probe-only; `restart()` returns `MANAGED_RUNTIME_RESTART_REQUIRED`.

## Gateway probe

[[src/main/runtime/gateway-probe.ts]] performs `GET /health` and authenticated `GET /v1/models`. Authentication success is determined by Gateway HTTP responses, not by reading `API_SERVER_KEY` alone.

## Startup

App splash checks Portal Auth, then connects Hermes before main UI, or shows Connection Error / Login.

[[src/renderer/src/App.tsx]] starts at splash, may route to [[src/renderer/src/modules/auth/LoginScreen.tsx]], then `runtimeEnsureLocalReady` for local mode, and routes to main or Connection Error. Remote and SSH skip local probe. [[src/renderer/src/screens/SplashScreen/SplashScreen.tsx]] shows a centered `hermes-one.png` image on a black splash (no intro video), plus status text and the remote escape hatch when needed.

`RuntimeProvider` wraps `SettingsModalProvider` so [[src/renderer/src/components/settings/RuntimePane.tsx]] (mounted as a settings-modal sibling) can call `useRuntime`.

## Direct Hermes Mode

Default Work local mode probes Gateway at `runtimeConfig.gateway.baseUrl` and never spawns or kills Gateway processes. IPC `start-gateway` / `stop-gateway` / `restart-gateway` refuse local lifecycle changes with a managed-runtime message.

## Runtime Service Adapter

Legacy opt-in adapter when `SMC_HERMES_CONTROL_OWNER=runtime`. Not used in v2.4 P0 managed-runtime production path; retained for P1 decommission.

## Runtime Management Backend

HTTP facade over `/api/v1/runtime/*` and `/api/v1/instances/*`. Legacy Runtime `:8765` control plane — not used in v2.4 P0 managed-runtime production path.

## Runtime Management Mapper

Maps Runtime readiness/health/job SSE payloads into Desktop `HermesRuntimeProbe`. Legacy — retained for P1 decommission.

## Runtime Service Client

Main-only HTTP client targets `http://127.0.0.1:8765`. Legacy — not used in v2.4 P0 managed-runtime production path.

## Hermes Availability Backend

Probe-only Connection Ready for enterprise/Salt mode. Legacy — v2.4 P0 uses the same managed consumer adapter for local Connection Ready.

## Salt enterprise mode canary

v2.3.1 regression: Salt control-owner keeps Work on Availability-only Connection Ready and refuses local Gateway restart while Chat stays off Runtime `:8765`.

Covered by `apps/work/tests/enterprise-salt-mode.test.ts`.

## Portal Auth Login

Phase 5 migrates Portal Auth Login only (not Hermes Panel / JSSDK / Service Settings).

Main handlers live in [[src/main/auth/auth-ipc.ts]]; preload exposes `window.desktopAuth` via [[src/preload/auth-api.ts]]. Tokens stay Main-only in [[src/main/auth/token-store.ts]].
