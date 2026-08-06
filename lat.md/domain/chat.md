# Chat

Chat spans Local Hermes surfaces, Workspaces, and Web Operator panels. v8 Copilot Chat Module isolates concurrent turns by `runId`+`turnId` and persists files via `chatFiles`.

Related decisions: [[decisions#Chat runId isolation (v8)]], [[decisions#Chat turn lifecycle (v8.0.4)]], [[decisions#Chat interaction loop (v8.0.5)]], [[decisions#Chat must not bypass Hermes MCP host mode]], [[decisions#Chat workspace per-run state (v8.0.3)]]. File platform detail: [[file-platform#File Platform]].

## Chat runtime isolation

[[src/main/chat-runtime/chat-runtime-manager.ts#setActiveRun]] registers per-`runId` abort handles. `window.chatRuntime` submit/abort/command and `chat-runtime:event` stay scoped to that run and turn.

Abort must resolve cleanly so UI does not hang on cancelled turns. Session reconcile heals history after reconnects without mixing run streams. Decision: [[decisions#Chat runId isolation (v8)]].

Shared wire contracts: [[src/shared/chat-runtime/chat-runtime-contract.ts#ChatSubmitInput]] (required `turnId`) and [[src/shared/chat-runtime/chat-runtime-events.ts#ChatRuntimeEvent]] (every event carries `runId`+`turnId`). Commands use [[src/shared/chat-runtime/chat-runtime-contract.ts#ChatRuntimeCommand]] / [[src/shared/chat-runtime/chat-runtime-contract.ts#ChatRuntimeCommandResult]] (required `runId`+`turnId`+`requestId`). Main registration: [[src/main/chat-runtime/chat-runtime-ipc.ts#registerChatRuntimeIpc]]. Run handle fields: [[src/main/chat-runtime/chat-runtime-manager.ts#ChatRunHandle]] (`pendingInteractions`, `respondClarify` / `approve` / `deny`).

## Session hydrate vs bind

Mount-time history restore uses `initialSessionId` once ([[src/renderer/src/modules/chat/controller/useChatController.ts#useChatController]]). Runtime `session.started` only dispatches `BIND_SESSION` in [[src/renderer/src/modules/chat/controller/chatReducer.ts#chatReducer]] — it must not `LOAD_HISTORY` or force `idle`.

`HYDRATE_SESSION` applies only when idle/cancelled/failed with an empty transcript. Busy `LOAD_HISTORY` / late hydrate is a no-op (requestId invalidated on submit, run switch, or unmount). Host must not feed a runtime-bound `sessionId` back as a hydrate source. Main emits `session.started` at most once per turn from `onSessionStarted`/`onDone` inside [[src/main/chat-runtime/chat-runtime-ipc.ts#registerChatRuntimeIpc]].

## Turn lifecycle

Every submit carries a `turnId`; Main and Controller ignore late non-terminal events after that turn completes. Per-turn `startedAt` resets when a run leaves terminal/idle into busy. Decision: [[decisions#Chat turn lifecycle (v8.0.4)]].

Controller `BEGIN_TURN` sets `activeTurnId` and clears per-turn usage. Event intake requires `event.runId` and `event.turnId` to match the active turn. Terminal guards use [[src/shared/chat-runtime/chat-runtime-events.ts#CHAT_TURN_NON_TERMINAL_EVENTS]] / [[src/shared/chat-runtime/chat-runtime-events.ts#isChatTurnTerminalEventType]]. Workspace [[src/renderer/src/modules/chat/workspace/chatWorkspaceReducer.ts#chatWorkspaceReducer]] resets `startedAt` on each busy entry; [[src/renderer/src/modules/chat/components/header/ChatRunStatus.tsx#ChatRunStatus]] refreshes duration every second.

## Interaction loop (Clarify / Approval)

Clarify and Approval cards must wait for Main-resolved events — never optimism from a successful `invoke` alone.

UI drafts use [[src/shared/chat-runtime/chat-runtime-contract.ts#ChatRuntimeCommandDraft]]; Controller [[src/renderer/src/modules/chat/controller/useChatController.ts#useChatController]] `submitRuntimeCommand` fills `runId`/`turnId` and dispatches `INTERACTION_SUBMIT` / resolves only on events. Pending state lives on [[src/renderer/src/modules/chat/controller/chatViewTypes.ts#ChatPendingInteractionState]] + clarify/approval rows in [[src/renderer/src/modules/chat/controller/chatReducer.ts#chatReducer]].

SSE `hermes.clarify.requested` / `hermes.approval.requested` register pending via [[src/main/chat-runtime/chat-interaction-registry.ts#createPendingClarify]] / [[src/main/chat-runtime/chat-interaction-registry.ts#createPendingApproval]]. [[src/main/chat-runtime/chat-interaction-registry.ts#validatePendingInteraction]] rejects turn/request/kind mismatches. [[src/main/chat-runtime/hermes-chat-command-adapter.ts#createHermesChatCommandAdapter]] prefers structured follow-up messages (`[[hermes.clarify.response]]` / `[[hermes.approval.response]]`); unsupported gateways return `GATEWAY_UNSUPPORTED` (no fake `ok: true`). Events: `clarify.resolved` / `approval.resolved` / `interaction.failed` on [[src/shared/chat-runtime/chat-runtime-events.ts#ChatRuntimeEvent]]. UI: [[src/renderer/src/modules/chat/components/clarify/ClarifyCard.tsx#ClarifyCard]], [[src/renderer/src/modules/chat/components/approval/ApprovalCard.tsx#ApprovalCard]] (high-risk confirm + deny reason). Distinct from slash routing in [[chat-commands#Chat Commands]]. Decision: [[decisions#Chat interaction loop (v8.0.5)]].

## Turn snapshot queue and retry

Busy sends enqueue a full [[src/renderer/src/modules/chat/controller/chatTurnSnapshot.ts#ChatTurnRequestSnapshot]] (text, attachments, model, expert/skill, work mode). Drain replays the snapshot into `runtime.submit`.

[[src/renderer/src/modules/chat/controller/chatTurnSnapshot.ts#createTurnSnapshot]] builds the snapshot at `BEGIN_TURN`; busy enqueue uses [[src/renderer/src/modules/chat/hooks/useChatQueue.ts#useChatQueue]] (`QueuedChatTurn`). Retry APIs on the controller: `retryLastTurn` (exact snapshot), `editAndRetryLastTurn` (restore composer, no auto-send), `retryLastTurnWithCurrentContext` (original text+attachments, live model/expert). Avoid double-appending the same user row on replay. Decision: [[decisions#Chat interaction loop (v8.0.5)]].

## Session files live summary

Session Files badge `total` comes from [[src/renderer/src/modules/chat/hooks/useSessionFilesSummary.ts#useSessionFilesSummary]] (list + `chat-files:changed`), not a hardcoded `0`.

Main emits via [[src/main/chat-files/chat-files-event-emitter.ts#emitChatFilesChanged]] after upload/remove/migrate/context/agent-output. Event shape: [[src/shared/chat-files/chat-files-events.ts#ChatFilesChangedEvent]]. Preload: `window.chatFiles.onChanged`. Host wires `sessionFilesCount` in [[src/renderer/src/screens/Hermes/pages/Chat/AiosCopilotChatHost.tsx#AiosCopilotChatHost]]. Badge and panel should share the same summary source — see [[session-file-context#Session Files Panel]] and [[file-platform#Chat files changed events]].

## Composer submit transaction

Send must clear Input, Draft, and pending attachments synchronously before network work so switching Runs cannot restore the old prompt.

[[src/renderer/src/modules/chat/controller/useChatController.ts#useChatController]] exposes `submitComposer` / `submitPayload` + `commitInput` / `onDraftChange`. When the run is busy, `submitPayload` enqueues a full turn snapshot instead of dropping attachments — see [[domain/chat#Turn snapshot queue and retry]]. [[src/renderer/src/modules/chat/components/composer/CopilotChatInput.tsx#CopilotChatInput]] calls `onSend()` with no text override. Failures do not auto-restore the prompt; message rows offer Retry / Edit and retry / Copy via [[src/renderer/src/modules/chat/components/messages/MessageList.tsx#MessageList]].

## Chat workspace per-run state

v8.0.3 makes each Chat Run own Session, Expert, Skill, Permission, Work Mode, Model, draft, and panel visibility via [[src/renderer/src/modules/chat/workspace/ChatRunRecord.ts#ChatRunRecord]].

[[src/renderer/src/modules/chat/workspace/ChatWorkspaceProvider.tsx#ChatWorkspaceProvider]] is the single workspace store (reducer: [[src/renderer/src/modules/chat/workspace/chatWorkspaceReducer.ts#chatWorkspaceReducer]]). Hosts must not write global `HermesWorkspaceContext.activeSessionId` for run isolation.

Copilot Host uses [[src/renderer/src/modules/chat/workspace/useRunWorkContext.ts#useRunWorkContext]] per `runId`. Header Expert, Prompt Hint, and Runtime `expertId` must all read the same `run.context`. Return Default clears only that run. Decision: [[decisions#Chat workspace per-run state (v8.0.3)]].

## Host and navigation seeding

[[src/renderer/src/screens/Hermes/pages/Chat/AiosCopilotChatHost.tsx#AiosCopilotChatHost]] takes `{ run, active, onPatchRun }` and must not mutate shared Hermes session fields for multi-run isolation.

[[src/renderer/src/screens/Hermes/pages/Chat/MultiRunChatShell.tsx#MultiRunChatShell]] may seed the first run from Expert/Team navigation on `HermesWorkspaceContext`, then treats that context as navigation-only. Further Session/Expert/Skill changes stay on the `ChatRunRecord`. Host passes mount-time `sessionId` / `initialDraft` into [[src/renderer/src/modules/chat/components/ChatSurface.tsx#ChatSurface]] and patches identity/draft from controller callbacks only.

## Unified header and content rail

Chat shows one run header and one Ask/Plan/Craft group — never `ChatHeader` plus `HermesActiveExpertBar` together.

[[src/renderer/src/modules/chat/components/header/ChatRunHeader.tsx#ChatRunHeader]] is the sole header. Conditional status uses [[src/renderer/src/modules/chat/components/header/ChatRunStatus.tsx#ChatRunStatus]] (busy/failed; completed auto-hides; duration ticks each second). Empty state, messages, and composer share [[src/renderer/src/modules/chat/layout/ChatContentRail.tsx#ChatContentRail]] (`--chat-content-max: 960px`).

Empty suggestions may follow run context via [[src/renderer/src/modules/chat/components/empty/ChatEmptyState.tsx#ChatEmptyState]] (Default / Expert / Team), still inside the same content rail.

## Composer context chip

Composer keeps a single-row toolbar: Attach/Voice, Work Context Chip, Model, Prompt Assist, gauge, Send. Session Files and Prompt Navigator live on the floating rail — not in Composer.

Expert/Skill/Permission/Gateway live in [[src/renderer/src/modules/chat/components/composer/WorkContextChip.tsx#WorkContextChip]] popover slots (screens inject selectors). Prompt hint state is per-run via [[src/renderer/src/modules/chat/components/composer/PromptAssistPanel.tsx#PromptAssistPanel]]. Narrow widths may fold extras into [[src/renderer/src/modules/chat/components/composer/ComposerMoreMenu.tsx#ComposerMoreMenu]]. Clearing on send is specified in [[domain/chat#Composer submit transaction]]. Do not restore the permanent multi-control `WorkComposerControls` row on the Copilot path.

## Floating rail

[[src/renderer/src/modules/chat/components/floating/ChatFloatingRail.tsx#ChatFloatingRail]] is a direct child of `chat-main` in [[src/renderer/src/modules/chat/components/ChatSurface.tsx#ChatSurface]], fixed on the right, outside the scroll and Composer.

Prompt Navigator expands left from the rail (utils still in [[prompt-navigator#Conversation Prompt Navigator]]); Session Files uses [[src/renderer/src/modules/chat/components/floating/FloatingActionButton.tsx#FloatingActionButton]] with Folder + badge + active. Badge count is live via [[domain/chat#Session files live summary]] — never hardcode `0`. Disabled when there is no session and no draft/session files. See also [[session-file-context#Session Files Panel]].

## Run tabs and titles

[[src/renderer/src/modules/chat/workspace/ChatRunTabs.tsx#ChatRunTabs]] keeps stable `createdOrder` (no reorder by `updatedAt`). Supports rename, middle-click close, running-close confirm, and overflow beyond eight tabs.

Tab titles use [[src/renderer/src/modules/chat/workspace/ChatRunRecord.ts#deriveTabTitle]]: session title → user rename → first prompt (40 chars) → `New Chat`. Skill names are badges/tooltips only. [[src/renderer/src/modules/chat/components/ChatSurface.tsx#ChatSurface]] snapshots drive loading/unread/session/model/title; background completion sets unread, active run does not.

## Workspace persistence

[[src/renderer/src/modules/chat/workspace/chatWorkspacePersistence.ts#loadChatWorkspaceState]] restores `chat-workspace-state.v1` metadata (order, active run, context, title, model, panels, draft).

Streaming content, tool events, and approvals are not persisted. Busy runs become `interrupted` on restore and must not auto-resume. After Send, `presentation.draft` must be empty so restore cannot revive a submitted prompt.

## Chat surfaces and engines

Default Local Hermes chat uses `modules/chat` (`ChatSurface` + controller) inside [[src/renderer/src/screens/Hermes/pages/Chat/MultiRunChatShell.tsx#MultiRunChatShell]]. Legacy engine is opt-in via env.

`VITE_CHAT_ENGINE=legacy` falls back to the older Hermes webchat surface (`useWorkChatContext`). Copilot Host binds Work context through `useRunWorkContext` instead.

## Session and model scoping

Ordinary sends must not rewrite global `config.yaml`. Default model changes are explicit Settings actions.

Session-level model selection is per draft/session. Global default changes may restart Gateway. Draft ids isolate surfaces (e.g. `draft_default` vs `draft_weboperator`).
