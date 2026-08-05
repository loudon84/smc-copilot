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
