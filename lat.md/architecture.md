# Architecture

Hermes Desktop uses a strict three-layer Electron model: Renderer (React), Preload (contextBridge), and Main (Node). Python Gateway is an external process.

Cross-links: [[lat#Hermes Desktop|product overview]], [[domain/profiles#Profile isolation]], [[domain/gateway#Gateway lifecycle]], [[decisions#Key design decisions]].

## Three-layer process model

Renderer may only call `window.*` Preload APIs. Preload is the sole security bridge. Main alone owns filesystem, SQLite, child processes, and Gateway lifecycle.

```text
Renderer (React)
  → window.hermesAPI / smcShell / desktopAuth / copilotRuntime / chatRuntime / chatWorkspace / sessionCatalog / …
       ↓ ipcRenderer.invoke
Preload (contextBridge)
       ↓ IPC
Main (Node.js domain modules)
       ↓ HTTP / spawn (Serve spawn restricted in production)
Portal Auth (:8000) + Hermes Gateway (:8642+) + copilot-serve (:8765)
```

Hard rules:

- Renderer must never import `electron`, `fs`, `path`, `child_process`, or `better-sqlite3`.
- Renderer must never call `ipcRenderer` directly.
- Renderer must never fetch Serve (`127.0.0.1:8765`) with a Device Token; JSON goes through Main `copilotRuntime.proxyFetch` or domain IPC.
- New capabilities follow Main module → IPC registration → Preload wrapper → `index.d.ts` → `docs/API_CONTRACTS.md`.

Core entry points: [[src/main/utils.ts#profileHome]], [[src/main/hermes.ts#startGatewayAsync]], [[src/main/startup/startup-decision.ts#resolveStartupDecision]], [[src/main/auth/token-header-injector.ts#installTokenHeaderInjector]], [[src/main/copilot-runtime-client/runtime-connection-manager.ts#runRuntimeHandshake]], [[src/main/copilot-runtime-client/copilot-runtime-ipc.ts#registerCopilotRuntimeIpc]], [[src/main/runtime-adapters/gateway-control.ts#resolveGatewayControlMode]], [[src/main/chat-runtime/chat-runtime-ipc.ts#registerChatRuntimeIpc]], [[src/main/chat-runtime/chat-runtime-manager.ts#setActiveRun]].

## Preload bridge contract

Every Renderer capability is declared on a typed `window.*` surface. Long-lived listeners must return an unsubscribe function cleaned up on unmount.

Primary surfaces:

| Global | Role |
|--------|------|
| `hermesAPI` | Install, config, sessions, models, skills, legacy chat |
| `smcShell` | Startup gate, window controls |
| `desktopAuth` / `desktopUserConfig` | Portal login + bootstrap (no tokens in Renderer) |
| `copilotRuntime` | v9.0 Serve-First connection / pairing / repair / proxyFetch (no Device Token) |
| `copilotServe` | Serve process status/lifecycle (`getConnection` has no token) |
| `chatRuntime` / `chatFiles` | v8 runId-isolated chat + file index |
| `chatWorkspace` | v8.2 Chat Tab/Draft persistence (`chat-workspace.db`) |
| `sessionCatalog` | v8.2 profile-aware Sessions list (reads `state.db`) |
| `profileRuntime` | Multi-profile gateway control plane |
| `aiosBrowser` | Web Operator browser control |
| `mcpSkillGatewayRuntime` / `genehubRuntime` | MCP proxy + GeneHub sync |

IPC channel names must not be invented in Renderer; the Preload file is authoritative for method names.

## Main process ownership

Main is the privileged control plane. Domain logic lives in `src/main/<domain>.ts` (or `*-ipc.ts`); `src/main/index.ts` registers handlers thinly via `setupIPC()`.

Notable domains: Gateway (`hermes.ts` + `runtime-adapters`), installer, config, sessions, profile-runtime, browser/Web Operator, auth, **copilot-runtime-client** (v9 Serve-First SDK), chat-runtime, chat-files, chat-workspace, session-catalog, MCP, GeneHub, hermes-experts, enterprise install.

## Primary Main code anchors

These Main exports carry `@lat:` comments back to domain sections. Keep both sides updated when behavior changes.

| Symbol | Section |
|--------|---------|
| [[src/main/utils.ts#profileHome]] | [[domain/profiles#Profile isolation]] |
| [[src/main/hermes.ts#startGatewayAsync]] | [[domain/gateway#Gateway lifecycle]] |
| [[src/main/hermes.ts#isGatewayRunningAsync]] | [[domain/gateway#Gateway lifecycle]] |
| [[src/main/startup/startup-decision.ts#resolveStartupDecision]] | [[domain/auth#Startup gate]] |
| [[src/main/auth/token-header-injector.ts#installTokenHeaderInjector]] | [[domain/auth#Token vault and injection]] |
| [[src/main/copilot-runtime-client/runtime-connection-manager.ts#runRuntimeHandshake]] | [[domain/serve-runtime#Connection handshake]] |
| [[src/main/copilot-runtime-client/runtime-auth-store.ts#saveDeviceToken]] | [[domain/serve-runtime#Device pairing and auth store]] |
| [[src/main/copilot-runtime-client/runtime-pairing-manager.ts#confirmPairing]] | [[domain/serve-runtime#Device pairing and auth store]] |
| [[src/main/copilot-runtime-client/runtime-mode.ts#canSpawnCopilotServe]] | [[domain/serve-runtime#Production process policy]] |
| [[src/main/copilot-runtime-client/copilot-runtime-ipc.ts#registerCopilotRuntimeIpc]] | [[domain/serve-runtime#Renderer bridge without token]] |
| [[src/main/runtime-adapters/gateway-control.ts#resolveGatewayControlMode]] | [[domain/serve-runtime#Phase 2 Gateway and config control plane]] |
| [[src/main/runtime-adapters/ServeInstanceAdapter.ts#ServeInstanceAdapter]] | [[domain/serve-runtime#Phase 2 Gateway and config control plane]] |
| [[src/main/runtime-adapters/config-control.ts#assertLegacyYamlControlPlane]] | [[domain/serve-runtime#Phase 2 Gateway and config control plane]] |
| [[src/main/chat-runtime/chat-runtime-manager.ts#setActiveRun]] | [[domain/chat#Chat runtime isolation]] |
| [[src/main/chat-runtime/chat-runtime-ipc.ts#registerChatRuntimeIpc]] | [[domain/chat#Durable runtime (v8.1)]] |
| [[src/main/chat-runtime/chat-event-sequencer.ts#stampChatRuntimeEvent]] | [[domain/chat#Ordered runtime events]] |
| [[src/main/chat-runtime/hermes-interaction-continuation-adapter.ts#createHermesInteractionContinuationAdapter]] | [[domain/chat#Interaction continuation]] |
| [[src/main/chat-runtime/chat-recovery-coordinator.ts#recoverIncompleteTurns]] | [[domain/chat#Recovery and diagnostics]] |
| [[src/main/chat-workspace/chat-workspace-ipc.ts#registerChatWorkspaceIpc]] | [[domain/chat#Workspace persistence]] |
| [[src/main/chat-workspace/chat-workspace-service.ts#bindSessionToRun]] | [[domain/chat#Draft versus session runs]] |
| [[src/main/session-catalog/session-catalog-ipc.ts#registerSessionCatalogIpc]] | [[domain/chat#Persistent mount and session catalog]] |
| [[src/main/session-catalog/session-catalog-service.ts#listSessions]] | [[domain/chat#Persistent mount and session catalog]] |

## External runtimes

Desktop supervises Gateway and Serve as external processes; it does not embed Python agent logic.

Under Serve CP, Gateway health comes from Serve Instance APIs; legacy mode still polls local `/health`. Gateway-affecting config mutations must restart via Serve or legacy. After v9.0, production Desktop treats **copilot-serve** as the always-on control plane and must not stop it on quit.

Related: [[domain/gateway#Gateway lifecycle]], [[domain/serve-runtime#Serve-First Runtime]], [[domain/serve-runtime#Phase 2 Gateway and config control plane]], [[domain/install#Runtime layout]], [[domain/auth#Startup gate]].
