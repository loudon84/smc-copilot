# Chat

Chat spans Local Hermes surfaces, Workspaces, and Web Operator panels. v8 Copilot Chat Module isolates concurrent turns by `runId` and persists files via `chatFiles`.

Related decisions: [[decisions#Chat runId isolation (v8)]], [[decisions#Chat must not bypass Hermes MCP host mode]]. File platform detail: [[file-platform#File Platform]].

## Chat runtime isolation

[[src/main/chat-runtime/chat-runtime-manager.ts#setActiveRun]] registers per-`runId` abort handles. `window.chatRuntime` submit/abort/command and `chat-runtime:event` stay scoped to that run.

Abort must resolve cleanly so UI does not hang on cancelled turns. Session reconcile heals history after reconnects without mixing run streams. Decision: [[decisions#Chat runId isolation (v8)]].

## Chat surfaces and engines

Default Local Hermes chat uses `modules/chat` (`ChatSurface` + controller). Legacy engine is opt-in via env.

`VITE_CHAT_ENGINE=legacy` falls back to the older Hermes webchat surface. Work prompt hints compose through Work controls without replacing the Hermes send path for normal chat.

## Session and model scoping

Ordinary sends must not rewrite global `config.yaml`. Default model changes are explicit Settings actions.

Session-level model selection is per draft/session. Global default changes may restart Gateway. Draft ids isolate surfaces (e.g. `draft_default` vs `draft_weboperator`).
