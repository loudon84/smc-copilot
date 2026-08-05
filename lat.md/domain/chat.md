# Chat

Chat spans Local Hermes surfaces, Workspaces, and Web Operator panels. v8 Copilot Chat Module isolates concurrent turns by `runId` and persists files via `chatFiles`.

Related decisions: [[decisions#Chat runId isolation (v8)]], [[decisions#Chat must not bypass Hermes MCP host mode]], [[decisions#Chat workspace per-run state (v8.0.3)]]. File platform detail: [[file-platform#File Platform]].

## Chat runtime isolation

[[src/main/chat-runtime/chat-runtime-manager.ts#setActiveRun]] registers per-`runId` abort handles. `window.chatRuntime` submit/abort/command and `chat-runtime:event` stay scoped to that run.

Abort must resolve cleanly so UI does not hang on cancelled turns. Session reconcile heals history after reconnects without mixing run streams. Decision: [[decisions#Chat runId isolation (v8)]].

## Chat workspace per-run state

v8.0.3 makes each Chat Run own Session, Expert, Skill, Permission, Work Mode, Model, draft, and panel visibility via [[src/renderer/src/modules/chat/workspace/ChatRunRecord.ts#ChatRunRecord]].

[[src/renderer/src/modules/chat/workspace/ChatWorkspaceProvider.tsx#ChatWorkspaceProvider]] is the single workspace store (reducer: [[src/renderer/src/modules/chat/workspace/chatWorkspaceReducer.ts#chatWorkspaceReducer]]). Hosts must not write global `HermesWorkspaceContext.activeSessionId` for run isolation.

Copilot Host uses [[src/renderer/src/modules/chat/workspace/useRunWorkContext.ts#useRunWorkContext]] per `runId`. Header Expert, Prompt Hint, and Runtime `expertId` must all read the same `run.context`. Return Default clears only that run. Decision: [[decisions#Chat workspace per-run state (v8.0.3)]].

## Host and navigation seeding

[[src/renderer/src/screens/Hermes/pages/Chat/AiosCopilotChatHost.tsx#AiosCopilotChatHost]] takes `{ run, active, onPatchRun }` and must not mutate shared Hermes session fields for multi-run isolation.

[[src/renderer/src/screens/Hermes/pages/Chat/MultiRunChatShell.tsx#MultiRunChatShell]] may seed the first run from Expert/Team navigation on `HermesWorkspaceContext`, then treats that context as navigation-only. Further Session/Expert/Skill changes stay on the `ChatRunRecord`.

## Unified header and content rail

Chat shows one run header and one Ask/Plan/Craft group — never `ChatHeader` plus `HermesActiveExpertBar` together.

[[src/renderer/src/modules/chat/components/header/ChatRunHeader.tsx#ChatRunHeader]] is the sole header. Conditional status uses [[src/renderer/src/modules/chat/components/header/ChatRunStatus.tsx#ChatRunStatus]] (busy/failed; completed auto-hides). Empty state, messages, and composer share [[src/renderer/src/modules/chat/layout/ChatContentRail.tsx#ChatContentRail]] (`--chat-content-max: 960px`).

Empty suggestions may follow run context via [[src/renderer/src/modules/chat/components/empty/ChatEmptyState.tsx#ChatEmptyState]] (Default / Expert / Team), still inside the same content rail.

## Composer context chip

Composer keeps a single-row toolbar: Attach/Voice, Work Context Chip, Model, Prompt Assist, Files, gauge, Send.

Expert/Skill/Permission/Gateway live in [[src/renderer/src/modules/chat/components/composer/WorkContextChip.tsx#WorkContextChip]] popover slots (screens inject selectors). Prompt hint state is per-run via [[src/renderer/src/modules/chat/components/composer/PromptAssistPanel.tsx#PromptAssistPanel]]. Narrow widths may fold extras into [[src/renderer/src/modules/chat/components/composer/ComposerMoreMenu.tsx#ComposerMoreMenu]]. Do not restore the permanent multi-control `WorkComposerControls` row on the Copilot path.

## Run tabs and titles

[[src/renderer/src/modules/chat/workspace/ChatRunTabs.tsx#ChatRunTabs]] keeps stable `createdOrder` (no reorder by `updatedAt`). Supports rename, middle-click close, running-close confirm, and overflow beyond eight tabs.

Tab titles use [[src/renderer/src/modules/chat/workspace/ChatRunRecord.ts#deriveTabTitle]]: session title → user rename → first prompt (40 chars) → `New Chat`. Skill names are badges/tooltips only. [[src/renderer/src/modules/chat/components/ChatSurface.tsx#ChatSurface]] snapshots drive loading/unread/session/model/title; background completion sets unread, active run does not.

## Workspace persistence

[[src/renderer/src/modules/chat/workspace/chatWorkspacePersistence.ts#loadChatWorkspaceState]] restores `chat-workspace-state.v1` metadata (order, active run, context, title, model, panels, draft).

Streaming content, tool events, and approvals are not persisted. Busy runs become `interrupted` on restore and must not auto-resume.

## Chat surfaces and engines

Default Local Hermes chat uses `modules/chat` (`ChatSurface` + controller) inside [[src/renderer/src/screens/Hermes/pages/Chat/MultiRunChatShell.tsx#MultiRunChatShell]]. Legacy engine is opt-in via env.

`VITE_CHAT_ENGINE=legacy` falls back to the older Hermes webchat surface (`useWorkChatContext`). Copilot Host binds Work context through `useRunWorkContext` instead.

## Session and model scoping

Ordinary sends must not rewrite global `config.yaml`. Default model changes are explicit Settings actions.

Session-level model selection is per draft/session. Global default changes may restart Gateway. Draft ids isolate surfaces (e.g. `draft_default` vs `draft_weboperator`).
