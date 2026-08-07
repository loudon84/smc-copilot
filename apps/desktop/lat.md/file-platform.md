# File Platform

Main-process file platform for Copilot Chat: import, parse, preview, cleanup, and session association without exposing absolute paths to Renderer.

Production implementation lives under `src/main/chat-files/platform/` (`files:*` IPC). Hermes attachment bridge remains on `chat-files:*`. UI consumers: [[file-ui-components#File UI components]], [[session-file-context#Session File Context]].

## FileService

[[src/main/chat-files/platform/file-service.ts#fileService]] is the facade implementing Hermes files capabilities: pick/import, status, parse triggers, and capability probing (including MarkItDown availability).

## Storage

Managed files are stored under a profile-scoped desktop files root with metadata in the file store. Renderer receives stable file ids and display names — never raw absolute paths in domain events.

## Security

Path validation, size limits, and extension/MIME policy reject unsafe imports. Operations must stay inside the managed root; symlink/escape attempts fail closed.

## Parser Registry

Parsers are registered by kind (text, PDF, office, etc.). The registry selects a parser for each job; MarkItDown may back PDF/office when configured and available.

## MarkItDown conversion

Office/PDF conversion can run through a local MarkItDown provider with timeouts and binary probing. Failures surface as structured file errors rather than silent empty text.

## File job queue

Parse and conversion work is queued asynchronously. Jobs emit progress/domain events so Renderer hooks can update without polling Main internals.

## File preview

Preview service returns bounded text/HTML/metadata for a file id. Large documents are truncated; missing-on-disk files raise typed not-found errors.

## File operations

Higher-level operations (save managed/local, reveal, migrate draft associations) coordinate store + filesystem while preserving session index consistency.

## Attachment adapter

Bridges chat attachment payloads to managed file records so sends can reference `attachment_ids` instead of inlining large blobs.

## Send dual-write and session dual-read

On send, message↔file associations are persisted (dual-write). On session load, managed attachments are rehydrated (dual-read) so history and the Session Files panel stay aligned.

## Cleanup

Cleanup removes orphaned managed files and expired job artifacts according to retention policy, without deleting files still referenced by sessions.

## File domain events

[[src/main/chat-files/platform/file-domain-events.ts#emitFileDomainEvent]] broadcasts path-free `FileDomainEvent`s to Main subscribers and Renderer windows for live UI updates.

## Chat files changed events

Session Files Badge and summary hooks listen to a dedicated lightweight channel, separate from full `FileDomainEvent` payloads.

[[src/main/chat-files/chat-files-event-emitter.ts#emitChatFilesChanged]] sends `chat-files:changed` with [[src/shared/chat-files/chat-files-events.ts#ChatFilesChangedEvent]] (`uploaded` / `removed` / `context_added` / `context_removed` / `agent_output_created` / `draft_migrated`). Emit sites: `chat-files:*` IPC, context add/remove in [[src/main/chat-files/platform/register-file-ipc.ts#registerFilesIpcHandlers]], and agent-output create. Preload: `window.chatFiles.onChanged`. Concept: [[domain/chat#Session files live summary]].

## AgentOutputService

Captures agent-produced output files into the managed store so Session Files / Agent Output UI can list and preview them safely.
