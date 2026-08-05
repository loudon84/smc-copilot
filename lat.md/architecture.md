# Architecture

Hermes Desktop uses a strict three-layer Electron model: Renderer (React), Preload (contextBridge), and Main (Node). Python Gateway is an external process.

Cross-links: [[lat#Hermes Desktop|product overview]], [[domain/profiles#Profile isolation]], [[domain/gateway#Gateway lifecycle]], [[decisions#Key design decisions]].

## Three-layer process model

Renderer may only call `window.*` Preload APIs. Preload is the sole security bridge. Main alone owns filesystem, SQLite, child processes, and Gateway lifecycle.

```text
Renderer (React)
  → window.hermesAPI / smcShell / desktopAuth / chatRuntime / …
       ↓ ipcRenderer.invoke
Preload (contextBridge)
       ↓ IPC
Main (Node.js domain modules)
       ↓ HTTP / spawn
Portal Auth (:8000) + Hermes Gateway (:8642+) + copilot-serve
```

Hard rules:

- Renderer must never import `electron`, `fs`, `path`, `child_process`, or `better-sqlite3`.
- Renderer must never call `ipcRenderer` directly.
- New capabilities follow Main module → IPC registration → Preload wrapper → `index.d.ts` → `docs/API_CONTRACTS.md`.

Core entry points: [[src/main/utils.ts#profileHome]], [[src/main/hermes.ts#startGateway]], [[src/main/startup/startup-decision.ts#resolveStartupDecision]], [[src/main/auth/token-header-injector.ts#installTokenHeaderInjector]], [[src/main/chat-runtime/chat-runtime-manager.ts#setActiveRun]].

## Preload bridge contract

Every Renderer capability is declared on a typed `window.*` surface. Long-lived listeners must return an unsubscribe function cleaned up on unmount.

Primary surfaces:

| Global | Role |
|--------|------|
| `hermesAPI` | Install, config, sessions, models, skills, legacy chat |
| `smcShell` | Startup gate, window controls |
| `desktopAuth` / `desktopUserConfig` | Portal login + bootstrap (no tokens in Renderer) |
| `chatRuntime` / `chatFiles` | v8 runId-isolated chat + file index |
| `profileRuntime` | Multi-profile gateway control plane |
| `aiosBrowser` | Web Operator browser control |
| `mcpSkillGatewayRuntime` / `genehubRuntime` | MCP proxy + GeneHub sync |

IPC channel names must not be invented in Renderer; the Preload file is authoritative for method names.

## Main process ownership

Main is the privileged control plane. Domain logic lives in `src/main/<domain>.ts` (or `*-ipc.ts`); `src/main/index.ts` registers handlers thinly via `setupIPC()`.

Notable domains: Gateway (`hermes.ts`), installer, config, sessions, profile-runtime, browser/Web Operator, auth, chat-runtime, chat-files, MCP, GeneHub, hermes-experts, enterprise install.

## Primary Main code anchors

These Main exports carry `@lat:` comments back to domain sections. Keep both sides updated when behavior changes.

| Symbol | Section |
|--------|---------|
| [[src/main/utils.ts#profileHome]] | [[domain/profiles#Profile isolation]] |
| [[src/main/hermes.ts#startGateway]] | [[domain/gateway#Gateway lifecycle]] |
| [[src/main/startup/startup-decision.ts#resolveStartupDecision]] | [[domain/auth#Startup gate]] |
| [[src/main/auth/token-header-injector.ts#installTokenHeaderInjector]] | [[domain/auth#Token vault and injection]] |
| [[src/main/chat-runtime/chat-runtime-manager.ts#setActiveRun]] | [[domain/chat#Chat runtime isolation]] |

## External runtimes

Desktop supervises but does not embed Python agent logic. Gateway health is polled; config mutations that affect Gateway behavior must restart it.

Related: [[domain/gateway#Gateway lifecycle]], [[domain/install#Runtime layout]], [[domain/auth#Startup gate]].
