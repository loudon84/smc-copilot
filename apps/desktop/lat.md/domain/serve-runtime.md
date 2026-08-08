# Serve-First Runtime

v9.0 makes `copilot-serve` the trusted local control plane. Desktop Main connects, pairs, and proxies; Renderer never holds Device Tokens or fetches `:8765` directly for JSON.

PRD: `prd_work/v9.0_serve-runtime-migration.md`. Phase 0/1 landed OpenAPI client consumption, pairing, handshake, and production process policy. Phase 2 routes Gateway / Configuration / MCP / Diagnostics through Serve. Phase 3 routes `window.chatRuntime` execution to Serve `/api/v1/chat-runs*` (hand-authored until OpenAPI catches up). Session/Resource cutovers are later phases.

Architecture framing: [[architecture#Three-layer process model]], [[architecture#Preload bridge contract]]. Decision: [[decisions#Serve Device Token stays in Main]], [[decisions#Serve owns Gateway and YAML control plane]].

## Connection handshake

Handshake loads status, capabilities, and readiness; Connection Ready follows service readiness only (ADR-013).

Desktop probes Serve with `health → /runtime/status → /runtime/capabilities → /runtime/compatibility`, then emits a seven-state connection model for UI. Execution/maintenance Attention must not flip Connection to Degraded.

States: `Connecting`, `PairingRequired`, `Incompatible`, `RuntimeMissing`, `RuntimeStarting`, `RuntimeDegraded`, `Ready`. Non-`Ready` allows viewing local UI Workspace but must block Chat/Task/MCP mutating writes.

Owner: [[src/main/copilot-runtime-client/runtime-connection-manager.ts#runRuntimeHandshake]] via `window.copilotRuntime`.

## Device pairing and auth store

v1.3.2 Main-owned `pairAndConnect()`: start → confirm → saveDeviceToken → handshake → Ready. Renderer only calls `window.copilotRuntime.pairAndConnect()`; challenge and Device Token never leave Main.

Token persistence: keytar (`smc-copilot-runtime`) → Electron safeStorage → memory-only (Diagnostics warns `DEVICE_TOKEN_NOT_PERSISTED`). `DEVICE_REVOKED` / `INVALID_DEVICE_TOKEN` clear local credentials; generic 401 does not.

Startup maps `PairingRequired` → `runtime-pairing` screen (not Runtime Recovery). Concurrent `pairAndConnect` shares one in-flight Promise.

Owners: [[src/main/copilot-runtime-client/runtime-auth-store.ts#saveDeviceToken]], [[src/main/copilot-runtime-client/runtime-pairing-manager.ts#pairAndConnect]], [[src/main/copilot-runtime-client/runtime-http-client.ts#buildRuntimeRequestHeaders]].

## Production process policy

Packaged production Desktop must not spawn or stop Serve. It only probes an existing service; missing Runtime becomes `RuntimeMissing` with Repair. Spawn/stop remain allowed for `development`, `portable_dev`, and `e2e`.

`COPILOT_ALLOW_LEGACY_HERMES_DIRECT` is forced false in production. Owner: [[src/main/copilot-runtime-client/runtime-mode.ts#canSpawnCopilotServe]].

## OpenAPI contract gate

Generated Serve types live under `src/shared/generated/copilot-serve/`. Refresh with `npm run generate:serve-client`; CI fails on drift via `npm run check:serve-contract-drift`. Hand-authored stable contracts stay in `src/shared/copilot-runtime/`.

## Renderer bridge without token

Legacy Renderer Serve JSON helpers use Main `copilot-runtime:proxy-fetch` / `window.copilotRuntime.proxyFetch` so Device Token never enters Renderer. Prefer domain IPC in later phases over growing the generic proxy.

Owners: [[src/main/copilot-runtime-client/copilot-runtime-ipc.ts#registerCopilotRuntimeIpc]], [[src/preload/copilot-runtime-api.ts]].

## Phase 2 Gateway and config control plane

When Serve is preferred and Ready, Desktop must not spawn Hermes Gateway CLI or write `config.yaml` as the control plane. Modes: `serve | legacy | blocked` via [[src/main/runtime-adapters/gateway-control.ts#resolveGatewayControlMode]].

Gateway start/stop/restart/status await Serve Instance ([[src/main/runtime-adapters/ServeInstanceAdapter.ts]], [[src/main/hermes.ts#startGatewayAsync]], [[src/main/hermes.ts#isGatewayRunningAsync]]). YAML writers call [[src/main/runtime-adapters/config-control.ts#assertLegacyYamlControlPlane]] and fail closed unless legacy-direct.

Models CRUD may update local `models.json` but must skip `syncCustomProvidersFromModels` under Serve preferred. MCP Skill Gateway register and expert install materializer must skip Desktop `writeHermesConfig` under Serve preferred (Serve MCP/Configuration APIs own that surface).

Related Gateway domain: [[domain/gateway#Gateway lifecycle]].

## Phase 3 Chat Runtime transport

When Serve chat transport is preferred and Ready, `window.chatRuntime` must not call Hermes `sendMessage` or write Desktop durable event sequences as the authority. Fail closed when preferred but not Ready.

Gates: [[src/main/copilot-runtime-client/runtime-mode.ts#isServeChatTransportPreferred]], [[src/main/copilot-runtime-client/runtime-mode.ts#isServeChatTransportEnabled]]. Owner: [[src/main/runtime-adapters/ServeChatRuntimeAdapter.ts#ServeChatRuntimeAdapter]] via [[src/main/chat-runtime/chat-runtime-ipc.ts#registerChatRuntimeIpc]].

Client: [[src/main/copilot-runtime-client/clients/chat-runtime-client.ts#chatRuntimeClient]] + SSE [[src/main/copilot-runtime-client/runtime-sse-client.ts#subscribeRuntimeSse]]. Contracts: [[src/shared/copilot-runtime/chat-runtime-serve-contract.ts#mapServeChatEventToRuntimeEvent]] (hand-authored; OpenAPI alignment deferred).

Production start also gates on [[src/main/copilot-runtime-client/runtime-capability-manager.ts#assertReadyForChat]] (`chat.runtime.v2`, and `chat.runtime.v2.real-execution` when subdivided v2 features are advertised).

## Workspace Chat durable cutover

Workspaces Chat streams through chat-runs; `clientRunId` is the stable Desktop `session_id`, not a per-message run.

[[src/main/workspace-chat/workspace-chat-stream.ts#startWorkspaceChatStream]] uses `chatRuntimeClient.startTurn` + `subscribeEvents` and maps Serve events to existing `workspace-chat:*` IPC (Renderer unchanged). Guard: `npm run check:no-direct-instance-chat`.
