---
lat:
  require-code-mention: true
---

# Serve-First Runtime tests

Test specifications for v9.0 Serve-First Runtime: Phase 0/1 connection and token boundaries, Phase 2 control-plane hardening, and Phase 3 Chat Runtime cutover.

Parent domain: [[domain/serve-runtime#Serve-First Runtime]].

## Serve-First Runtime tests

Leaf cases below must each have exactly one `@lat:` mention in the matching Vitest file.

### Maps unauthorized to pairing required

401 / unauthorized-style envelopes become `PAIRING_REQUIRED` and are not treated as generic network retries.

### Maps revoked device codes

Serve `device_revoked` (and aliases) become `DEVICE_REVOKED` with the server message preserved.

### Write gate blocks when not Ready

`assertReadyForWrites(false)` returns `RUNTIME_UNAVAILABLE`; Ready with capabilities loaded allows writes.

### Production forbids spawn

[[src/main/copilot-runtime-client/runtime-mode.ts#canSpawnCopilotServe]] is false for production.

### Production ignores legacy hermes-direct flag

Even when `COPILOT_ALLOW_LEGACY_HERMES_DIRECT=true`, production mode keeps legacy direct disabled via [[src/main/copilot-runtime-client/runtime-mode.ts#isLegacyHermesDirectAllowed]].

### Connection shape has no token field

`CopilotServeConnection` runtime objects expose `baseUrl`/`port` only — never Device Token.

### Public auth snapshot omits token keys

[[src/main/copilot-runtime-client/runtime-auth-store.ts#getPublicAuthSnapshot]] must not include `token` or `deviceToken` keys.

### Prefers Serve control plane unless legacy-direct

[[src/main/copilot-runtime-client/runtime-mode.ts#isServeControlPlanePreferred]] is true unless legacy-direct is explicitly allowed (and never in production via the legacy flag alone).

### Serve Instance resolve maps profile ref

`instanceClient.resolve` maps a profile/name ref to `instanceId` without inventing Desktop-local IDs.

### YAML write blocked when Serve preferred

[[src/main/runtime-adapters/config-control.ts#assertLegacyYamlControlPlane]] throws under Serve preferred / blocked modes.

### Serve Instance start awaits real ok

[[src/main/runtime-adapters/ServeInstanceAdapter.ts#ServeInstanceAdapter]] / [[src/main/runtime-adapters/gateway-control.ts#serveStartGateway]] await Serve and return boolean `ok` — no optimistic success.

### Serve Instance health drives running status

[[src/main/runtime-adapters/ServeInstanceAdapter.ts#ServeInstanceAdapter]] maps Serve health payloads used by Gateway running checks under Serve CP.

### Prefers Serve chat transport unless legacy-direct

[[src/main/copilot-runtime-client/runtime-mode.ts#isServeChatTransportPreferred]] is true unless legacy-direct; production never enables legacy Hermes chat transport.

### Maps Serve chat events to Desktop runtime events

Hand-authored [[src/shared/copilot-runtime/chat-runtime-serve-contract.ts#mapServeChatEventToRuntimeEvent]] maps Serve Chat Event types onto existing Desktop `ChatRuntimeEvent` unions for Renderer compatibility.

### Serve chat-runs start awaits createRun and createTurn

[[src/main/runtime-adapters/ServeChatRuntimeAdapter.ts#ServeChatRuntimeAdapter]] starts a turn via `/api/v1/chat-runs` + turns, then subscribes to `/events/stream` — no optimistic local Hermes `sendMessage`.

### Workspace Chat stream uses chat-runs not instance completions

[[src/main/workspace-chat/workspace-chat-stream.ts#startWorkspaceChatStream]] binds `clientRunId` to Desktop `session_id`, calls createRun/createTurn via [[src/main/copilot-runtime-client/clients/chat-runtime-client.ts#chatRuntimeClient]], and forwards Serve events as `workspace-chat:*` IPC. Production source must not mention instance chat completions (`check:no-direct-instance-chat`).
