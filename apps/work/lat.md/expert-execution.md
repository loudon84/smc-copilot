# Expert execution

Work runs Explicit Experts: pick Expert/Skill in Chat, submit, Main orchestrates HermesTask over NoDeskClaw. Renderer holds UI projection only; server HermesTask is the fact source.

## Shared DTO owner

Cross-process types live in [[src/shared/expert.ts]]: `ExpertRequest`, catalog/skill, HermesTask status/result, SSE events, artifacts, terminal phases. Fields follow v1.0.1 schemas; Renderer never sees JWT or backend URLs.

## Gateway client

[[src/main/expert/expert-gateway-client.ts]] is the trusted Main network owner for NoDeskClaw Expert HTTP.

Base URL from [[src/main/auth/auth-endpoint-config-store.ts]] (not Hermes `getApiUrl`). JWT from [[src/main/auth/ensure-access-token.ts#ensureFreshAccessToken]].

Refresh when `expiresAt` is due, and once more after backend `Authentication expired`. Catalog/Skill JSON-RPC with TTL cache; exact skill call sends `X-Idempotency-Key` and reads `structuredContent`. HermesTask status/snapshot/result/cancel and artifact paths. JSON-RPC errors on HTTP 200 and REST 4xx surface as `ExpertGatewayError`.

## Run service and SSE framing

[[src/main/expert/expert-run-service.ts]] owns HermesTask lifecycle: state machine, SSE with `Last-Event-ID` reconnect (≤5, exponential backoff), bounded poll fallback (15s, ≤10min → `delivery-timeout`), cancel/retry, authoritative completion.

SSE framing reuses [[src/main/run-stream.ts#parseRunSseBlock]] with optional `id:` lines — no separate Expert parser.

## IPC and preload bridge

[[src/main/expert/expert-ipc.ts]] registers narrow handlers; validates sender, session/profile, DTOs; artifact download accepts server `artifact_id` only.

[[src/preload/expert-api.ts]] exposes `window.hermesAPI.expert`. [[src/main/app/start.ts#startMainProcess]] registers Expert IPC; logout/`before-quit` call [[src/main/expert/expert-ipc.ts#disposeExpertSubsystem]].

## Renderer module and Chat integration

[[src/renderer/src/modules/expert/index.ts]] exports Selector, RunCard, Timeline, and projection store. Minimum stages only — no tool-level progress when `runtimeProgress=false`.

[[src/renderer/src/screens/Chat/Chat.tsx]] builds immutable `ExpertRequest` on submit, Slash-first routing, queued vs in-flight cancel, Expert mode disables local toolbar without forwarding remotely.

## Continuation and artifacts

[[src/shared/session-continuation.ts]] adds versioned `expert-run` (`schemaVersion: 1`). [[src/main/session-continuation-store.ts#normalizeContinuationItems]] whitelists the kind. [[src/main/expert/expert-continuation.ts]] rehydrates with auth re-check.

[[src/main/expert/expert-artifact-download.ts]] downloads Main-only (same-origin JWT, size/MIME guards, temp + atomic commit) into File Platform. [[src/renderer/src/components/files/message/AgentOutputFileCard.tsx#AgentOutputFileCard]] shows local managed files only.

## Test specifications

See [[expert-execution-tests]] for `@lat`-mapped unit/component coverage.
