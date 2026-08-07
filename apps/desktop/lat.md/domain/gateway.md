# Gateway

The Hermes Gateway is a Python process supervised by Desktop. Desktop starts, stops, health-checks, and restarts it; it does not implement Gateway protocol internals.

Lifecycle code: [[src/main/hermes.ts#startGatewayAsync]], [[src/main/hermes.ts#stopGatewayAsync]], [[src/main/hermes.ts#isGatewayRunningAsync]], [[src/main/hermes.ts#sendMessage]]. Sync [[src/main/hermes.ts#startGateway]] / [[src/main/hermes.ts#stopGateway]] remain for legacy call sites but must not claim Serve success.

Serve control plane: [[domain/serve-runtime#Phase 2 Gateway and config control plane]].

## Gateway lifecycle

Under Serve control plane (`Ready` and not legacy-direct), Gateway start/stop/restart **await** Serve Instance APIs via [[src/main/runtime-adapters/gateway-control.ts#serveStartGateway]] and return real `ok`. Sync wrappers schedule work and return false / void — they must not optimistic-`true`.

Status under Serve CP uses Instance health via [[src/main/hermes.ts#isGatewayRunningAsync]] and [[src/main/runtime-adapters/ServeInstanceAdapter.ts#ServeInstanceAdapter]], with a short TTL cache for sync [[src/main/hermes.ts#isGatewayRunning]]. Legacy mode still owns local PID / CLI spawn supervision.

Status enums remain explicit (`idle`, `starting`, `running`, `stopping`, `stopped`, `failed`, `unknown`). Config changes that affect agent behavior must trigger restart (Serve or legacy). Message send prefers local HTTP/SSE (`/v1/chat/completions`) with CLI fallback; remote mode uses HTTPS API routing instead of local spawn.

## Multi-profile runtime

Multiple Gateway instances run with profile-specific ports (default `8642`, specialists `8643+`). Control plane modules cover supervisor auto-restart, log collection, port conflict detection, and App-restart reconciliation.

State machine: `not_deployed → starting → running → stopping → stopped` (failures → `failed`). See [[domain/profiles#Profile isolation]]. When Serve CP is preferred, profile Gateway lifecycle should route through Serve Instance resolve/start/stop rather than Desktop CLI spawn.

## Observability requirements

Every Gateway instance must expose status, health, and operational metadata — silent background control is not acceptable.

Required fields include status, port, pid, profileId, health, last error, restart count, log paths, and last start/stop timestamps. Under Serve CP, Desktop must surface Serve Instance health rather than only local process handles.
