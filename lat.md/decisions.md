# Key design decisions

These decisions constrain how features are added. Prefer linking code to these sections over restating rules in comments.

Product framing lives in [[lat#Hermes Desktop]]; process rules in [[architecture#Three-layer process model]]. Primary `@lat:` Main anchors are indexed in [[architecture#Primary Main code anchors]] (no behavior change — docs↔code binding only).

## Desktop is a control plane, not an agent runtime

Electron orchestrates install, config, UI, and process lifecycle. Inference, tools, memory, and skills execute inside `hermes-agent`. Do not reimplement agent loops in Main or Renderer.

## Profile-scoped paths via profileHome

All profile filesystem access routes through [[src/main/utils.ts#profileHome]]. Default profile is `~/.hermes/`; named profiles are `~/.hermes/profiles/<id>/`. Desktop control-plane state prefers `~/.hermes/desktop/`.

Never hardcode user home paths inside feature modules. See [[domain/profiles#Profile isolation]].

## Tokens stay in Main

Auth tokens live in Main vault (keytar → safeStorage → memory). Renderer sees session status only. Portal Bearer injection targets the `persist:aios-home` partition via origin/port allowlists — never Gateway or Web Operator partitions.

See [[domain/auth#Token vault and injection]].

## Chat runId isolation (v8)

Concurrent chat turns are isolated by `runId` through [[src/main/chat-runtime/chat-runtime-manager.ts#setActiveRun]] and `window.chatRuntime`. Abort and events are scoped per run so multi-surface chat does not cross-talk.

See [[domain/chat#Chat runtime isolation]].

## Chat turn lifecycle (v8.0.4)

Each submit uses a `turnId`; hydrate once via `initialSessionId`, bind with `BIND_SESSION` only.

Composer submit clears Input/Draft immediately. Terminal turn state is monotonic — late deltas cannot reopen a completed turn. Prompt Navigator and Session Files sit on `ChatFloatingRail`.

See [[domain/chat#Session hydrate vs bind]], [[domain/chat#Turn lifecycle]], [[domain/chat#Composer submit transaction]], [[domain/chat#Floating rail]].

## Chat interaction loop (v8.0.5)

Clarify/Approval commands require `runId`+`turnId`+`requestId` and resolve only on Main events.

Gateway bridge uses structured follow-up messages; never fake success. Cross-turn or stale request commands are rejected (`TURN_MISMATCH` / `REQUEST_*`). Queue/Retry keep full turn snapshots including attachments and expert/model. Session Files badge listens to `chat-files:changed` (not hardcoded).

See [[domain/chat#Interaction loop (Clarify / Approval)]], [[domain/chat#Turn snapshot queue and retry]], [[domain/chat#Session files live summary]], [[file-platform#Chat files changed events]], [[session-file-context#Session Files Panel]].

## Durable Chat Runtime (v8.1.0)

Chat submit is event-driven (`chat-runtime:start` returns immediately). Durable run/turn/pending/queue live in profile `state.db`; transport handles are separate and may end without deleting pending interactions.

Events carry `eventId`+`sequence`+`emittedAt`. Clarify/Approval continue via streaming session continuation. Turn Ledger binds Retry to specific turns (no duplicate user message). Recovery restores waiting cards after reload. Playwright E2E and deprecated cutover remain deferred.

See [[domain/chat#Durable runtime (v8.1)]], [[domain/chat#Ordered runtime events]], [[domain/chat#Interaction continuation]], [[domain/chat#Recovery and diagnostics]], [[domain/chat#Turn snapshot queue and retry]], [[domain/chat#Chat runtime isolation]].

## Chat workspace per-run state (v8.0.3)

Each Chat Run owns Session/Expert/Skill/WorkMode in `ChatRunRecord`; do not share them via `HermesWorkspaceContext`.

Multi-run UI state lives in `ChatWorkspaceProvider`. Return Default clears only the active run. Tab titles come from session/user/first prompt — never Skill name. One `ChatRunHeader`, shared content rail, and compact Context Chip keep layout and payload consistent. Hermes navigation may seed a run once; it is not the live Session/Expert store.

See [[domain/chat#Chat workspace per-run state]], [[domain/chat#Host and navigation seeding]], [[domain/chat#Unified header and content rail]], [[domain/chat#Composer context chip]], [[domain/chat#Run tabs and titles]], [[domain/chat#Workspace persistence]].

## Chat must not bypass Hermes MCP host mode

After v7.6, Chat business paths use Hermes Agent MCP host mode (`hermesDefaultChat` + prompt hints). Chat must not call `nodeskclaw` Runtime Skill or `hermesExperts.callCatalogSkill` for ordinary sends.

See [[domain/mcp#Hermes Agent MCP host mode]].

## Web Operator actions are auditable and profile-aware

Browser automation runs in Main (`BrowserController` / ShellView). Sensitive actions require confirmation. Login state must not leak across profile partitions. See [[domain/web-operator#Web Operator]].

## IPC is a typed contract, not an ad-hoc channel list

New IPC requires shared types, Main handler, Preload wrapper, `index.d.ts`, and `docs/API_CONTRACTS.md`. Guessing channel strings from Renderer is forbidden. See [[architecture#Preload bridge contract]].
