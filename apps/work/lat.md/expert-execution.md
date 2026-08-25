# Expert execution

Work runs Explicit Experts: pick Expert/Skill in Chat, submit, Main orchestrates HermesTask over NoDeskClaw. Renderer holds UI projection only; server HermesTask is the fact source.

## Shared DTO owner

Cross-process types live in [[src/shared/expert.ts]]: health, annotations, `canSilentCallExpertSkill`, and HermesTask DTOs for v1.0.2.

Fields follow contract schemas; Renderer never sees JWT or backend URLs. Consumer lock: `contracts/work-expert/v1.0.2/`.

## Gateway client

[[src/main/expert/expert-gateway-client.ts]] is the trusted Main network owner for NoDeskClaw Expert HTTP.

Base URL from [[src/main/auth/auth-endpoint-config-store.ts]] (not Hermes `getApiUrl`). JWT from [[src/main/auth/ensure-access-token.ts#ensureFreshAccessToken]].

`getHealth` uses `openAuthorizedGet` with direct JSON parse (no `httpGetData`). Catalog/Skill parsers reject illegal annotations; production never falls back `slug = tool.name`. `callSkill` forces health + catalog ready + `canSilentCallExpertSkill` before `tools/call`.

## Run service and SSE framing

[[src/main/expert/expert-run-service.ts]] owns HermesTask lifecycle: state machine, SSE with `Last-Event-ID` reconnect (≤5, exponential backoff), bounded poll fallback (15s, ≤10min → `delivery-timeout`), cancel/retry, authoritative completion.

SSE framing reuses [[src/main/run-stream.ts#parseRunSseBlock]] with optional `id:` lines — no separate Expert parser.

## IPC and preload bridge

[[src/main/expert/expert-ipc.ts]] registers narrow handlers including `expert:get-health`, `expert:refresh-catalog`, and `expert:retry-artifact-discovery`; validates sender, session/profile, DTOs. Expert download IPC is removed — transfer goes through File Platform.

[[src/preload/expert-api.ts]] exposes `window.hermesAPI.expert`. [[src/main/app/start.ts#startMainProcess]] registers Expert IPC and `registerAuthIpc({ getMainWindow })`; logout/`before-quit` dispose Expert and run File Platform cleanup (`runFilesCleanupBestEffort`).

## Auth state push

[[src/main/auth/token-store.ts]] notifies after write/clear. [[src/main/auth/auth-ipc.ts]] forwards `DesktopAuthState` on `auth:state-changed`. [[src/preload/auth-api.ts]] `onStateChanged` returns unsubscribe.

## Renderer module and Chat integration

[[src/renderer/src/modules/expert/index.ts]] exports Control, Chip/Popover, fields-only Selector, RunCard, Timeline, and projection store.

Control owns health/catalog/skill/refresh/revision; Chat holds selection truth and UI send gates. Incomplete Expert Context never falls through to Local Chat.

[[src/renderer/src/screens/Chat/Chat.tsx]] builds immutable `ExpertRequest` on submit, Slash-first routing, queued vs in-flight cancel, Expert selection disables local toolbar without forwarding remotely.

## Continuation and artifacts

[[src/shared/session-continuation.ts]] adds versioned `expert-run` (`schemaVersion: 1`). [[src/main/session-continuation-store.ts#normalizeContinuationItems]] whitelists the kind. [[src/main/expert/expert-continuation.ts]] rehydrates with auth re-check.

After authoritative task completion, [[src/main/expert/expert-run-service.ts]] runs async artifact discovery (`listArtifacts`) and upserts remote File Platform resources via [[src/main/files/upsert-expert-remote-artifact.ts#upsertExpertRemoteArtifact]]. Durable metadata lives in `file-index.db`; Chat uses [[src/renderer/src/modules/expert/ExpertArtifactCards.tsx#ExpertArtifactCards]] and Session Files Agent output for the same `ManagedFileView`. Preview/Download/Materialize go through File Platform (`files.getPreview` / `saveAs` / internal materialize), never Expert download IPC.

## Terminal session materialize

As soon as a run has `task_id`, [[src/main/expert/expert-session-materialize.ts#materializeExpertSessionTranscript]] upserts Hermes `state.db` session/messages and the sidebar cache.

Assistant rows update on `task.progress` / terminal result. Titles pass [[src/main/expert/expert-session-materialize.ts#resolveUniqueSessionTitle]] because Hermes enforces `UNIQUE(sessions.title)`. Chat mirrors live bubbles and refreshes the sidebar.

## Test specifications

See [[expert-execution-tests]] for `@lat`-mapped unit/component coverage.
