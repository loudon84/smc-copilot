# Runtime Connection

Work connects to the OPSI-managed Hermes Gateway for Connection Ready. Work discovers runtime state, probes Gateway health, and calls Gateway HTTP APIs — it does not install Hermes or own Gateway lifecycle.

## Boundary

OPSI / Hermes Installer owns install, upgrade, repair, machine Hermes config, ACL, and the `SMC Hermes Gateway` scheduled task. Work owns discovery, status, authentication probing, and Chat/Session/Model HTTP calls. See [[src/shared/runtime/runtime-contract.ts]] for shared probe types.

## Runtime Descriptor

[[src/main/runtime/hermes-runtime-config.ts]] resolves `HermesRuntimeConfig`: home, programRoot, cliPath, and gateway.baseUrl for managed runtime discovery.

Resolution priority: Work `runtime.json`, enterprise descriptor, machine `HERMES_HOME`, then platform defaults (`C:\ProgramData\SMC\Hermes`, `D:\Programs\SMC\Hermes\bin\hermes.exe`, `http://127.0.0.1:8642`).

## Path resolution

[[src/main/runtime/hermes-runtime-paths.ts]] keeps a live `HERMES_HOME` synced from `getHermesHome()`. Self-Install exports are gone. Use `getHermesHome()`, `getHermesCliPath()`, and `getGatewayBaseUrl()` instead of joining `hermes-agent` or `venv`.

Former Python/venv path helpers (`HERMES_PYTHON`, `hermesCliArgs`) are not production exports.

## CLI invocation

[[src/main/runtime/hermes-cli-runner.ts]] invokes `hermes.exe` by absolute path with managed PATH segments for subprocesses. Version and doctor checks use `hermes.exe --version` / `hermes.exe doctor`.

## Adapter

[[src/main/runtime/runtime-manager.ts]] always uses [[src/main/runtime/legacy-local-runtime-adapter.ts]] (Managed Local Hermes Runtime Consumer). Production Main/IPC/Startup must not construct `RuntimeServiceAdapter` or `HermesAvailabilityBackend`; tests may inject adapters via constructor or `setRuntimeManagerForTests`.

`probe()` checks CLI + Gateway health + authenticated API probe; `ensureReady()` is probe-only; `restart()` returns `MANAGED_RUNTIME_RESTART_REQUIRED`.

## Adapter freeze

v2.1.2 freezes `RuntimeManager` default adapter to `legacy-local` / contract `managed-local-v1`. `check:runtime-adapter-contract` rejects alternate adapters in production Main/IPC/Startup sources.

## Build identity

Release writes `resources/work-build-info.json` (`smc.work.build.v1`) with version, commit, adapter, and contract. Startup logs `work_startup_identity`; probes log `hermes_runtime_probe` without secrets.

## Gateway probe

[[src/main/runtime/gateway-probe.ts]] performs `GET /health` and authenticated `GET /v1/models`. On Windows, READY also requires listen inspect of the managed `hermes.exe`.

Inspect failure or a foreign owning process is not READY (UNAVAILABLE / `configuration_error` / CONFLICT) and never kills the process.

## Startup

App splash checks Portal Auth, then connects Hermes before main UI, or shows Connection Error / Login.

[[src/renderer/src/App.tsx]] starts at splash, may route to [[src/renderer/src/modules/auth/LoginScreen.tsx]], then `runtimeEnsureLocalReady` for local mode, and routes to main or Connection Error. Remote and SSH skip local probe. [[src/renderer/src/screens/SplashScreen/SplashScreen.tsx]] shows a centered `hermes-one.png` image on a black splash (no intro video), plus status text and the remote escape hatch when needed.

`RuntimeProvider` wraps `SettingsModalProvider` so [[src/renderer/src/components/settings/RuntimePane.tsx]] (mounted as a settings-modal sibling) can call `useRuntime`.

## Direct Hermes Mode

Default Work local mode probes Gateway at `runtimeConfig.gateway.baseUrl` and never spawns or kills Gateway processes. IPC `start-gateway` / `stop-gateway` / `restart-gateway` refuse local lifecycle changes with a managed-runtime message.

Under production contract `managed-local-v1` (including `controlOwner=direct`), Settings and Connection Error cannot open Install Hermes / Choose Hermes directory / Create venv. Retry is probe-only.

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

## OPSI enterprise mode canary

OPSI control-owner changes only Hermes lifecycle capability: Work keeps the managed local adapter for Runtime/CLI/Gateway readiness, refuses local restart/update/doctor, and never routes Chat through Runtime `:8765`.

Covered by `apps/work/tests/enterprise-opsi-mode.test.ts`.

## OPSI owner / lifecycle

`owner=opsi` denies install, update, repair, start, stop, and restart. Discovery, CLI, Gateway health/auth, and Chat stay on [[src/main/runtime/runtime-manager.ts]]. Local IPC lifecycle handlers refuse with a managed message and must not call `RuntimeManagementBackend.startGateway()`.

## CI guards

`npm run guard` rejects local Gateway spawn in production Main and Hermes Python/source Self-Install literals in Main/scripts. Test fixtures may keep historical strings. The spawn scan covers `src/main`, not only `register.ts`.

## Portal Auth Login

Phase 5 migrates Portal Auth Login only (not Hermes Panel / JSSDK / Service Settings).

Main handlers live in [[src/main/auth/auth-ipc.ts]]; preload exposes `window.desktopAuth` via [[src/preload/auth-api.ts]]. Tokens stay Main-only in [[src/main/auth/token-store.ts]]. [[src/main/auth/ensure-access-token.ts#ensureFreshAccessToken]] refreshes User JWT when `expiresAt` is due so restart does not keep a dead access token.
