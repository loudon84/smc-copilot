# Session File Context

Session file context builds retrieval chunks and wire prompts from managed files attached to a chat session, and powers the Session Files panel.

Depends on [[file-platform#File Platform]] for storage and parsing. UI cards also appear in [[file-ui-components#File UI components]].

## Context builder

Builds ranked/bounded text context from parsed file chunks for the active session. Respects size caps so prompts stay within model limits.

## FTS chunking

Parsed documents are split into FTS-friendly chunks for retrieval. Chunk boundaries prefer stable offsets so re-index does not scramble citations.

## Wire injection on send

On message send, composed session-file context is injected into the wire payload (alongside attachment ids) so the Gateway receives grounded file context without trusting Renderer-built paths.

## Session Files Panel

Renderer panel lists managed files for the current session, reacts to file domain/job events, and opens previews. It never performs filesystem IO directly.

In Copilot Chat, the open/close control is the Folder FAB on [[domain/chat#Floating rail]] (not Composer). The panel itself still renders in the right aside when active.

v8.0.5 live badge counts use the same session scope as the panel: [[domain/chat#Session files live summary]] refreshes on `chat-files:changed` ([[src/shared/chat-files/chat-files-events.ts#ChatFilesChangedEvent]]) so FAB `total` and list stay aligned. Context add/remove under `files:*` also emit that channel — see [[file-platform#Chat files changed events]].

## Agent Output Section

UI section listing agent output files associated with the session, with cards that open preview/actions through Preload file APIs.
