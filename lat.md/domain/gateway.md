# Gateway

The Hermes Gateway is a Python process supervised by Desktop. Desktop starts, stops, health-checks, and restarts it; it does not implement Gateway protocol internals.

Lifecycle code: [[src/main/hermes.ts#startGateway]], [[src/main/hermes.ts#stopGateway]], [[src/main/hermes.ts#sendMessage]].

## Gateway lifecycle

[[src/main/hermes.ts#startGateway]] / [[src/main/hermes.ts#stopGateway]] own process supervision. Status uses explicit enums (`idle`, `starting`, `running`, `stopping`, `stopped`, `failed`, `unknown`).

Health is polled (typically `/health`). Config changes that affect agent behavior must trigger restart. Message send prefers local HTTP/SSE (`/v1/chat/completions`) with CLI fallback; remote mode uses HTTPS API routing instead of local spawn.

## Multi-profile runtime

Multiple Gateway instances run with profile-specific ports (default `8642`, specialists `8643+`). Control plane modules cover supervisor auto-restart, log collection, port conflict detection, and App-restart reconciliation.

State machine: `not_deployed → starting → running → stopping → stopped` (failures → `failed`). See [[domain/profiles#Profile isolation]].

## Observability requirements

Every instance should expose status, port, pid, profileId, health, last error, restart count, log paths, and last start/stop timestamps. Silent background Gateway operations are not acceptable.
