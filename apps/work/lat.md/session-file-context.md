# Session File Context

Session-scoped managed files can be explicitly added to model context without rewriting chat history. Associations, FTS search, and the context builder live in Main; the Session Files panel only calls `hermesAPI.files`.

## Associations

[[src/main/files/file-service.ts#fileService]] wires `attachToMessage`, `detachFromMessage` / `deleteAssociation`, `addToSessionContext` (idempotent `context-file`), `removeFromSessionContext`, and `searchSessionFiles` (session-filtered FTS via [[src/main/files/file-index-service.ts#searchSessionChunks]]).

## Context builder

[[src/main/files/file-context-builder.ts#buildSessionFileContext]] injects only `context-file` associations within an explicit character budget, including wrappers, XML escaping and separators. This is a text-size limit, not an exact token count.

Small files inline text (≤ `maxInlineTextChars` from [[src/main/files/file-config.ts#readDesktopFilesConfig]]); other files use FTS or leading chunks, without duplicating a leading summary. Repeated identical passages within a file are emitted once. Truncation preserves complete wrappers and adds an ellipsis; source refs only describe emitted blocks. Files without matching chunks retain a short `no-matches` reference.

## Wire injection on send

[[src/main/files/compose-wire-session-context.ts#composeWireMessageWithSessionContext]] runs in `send-message` before the agent call: context XML is prepended to the wire string only. Dual-write and UI history keep the original user text.

[[src/main/ipc/register.ts]] passes a 12,000-character limit for knowledge chats; other sends retain the previous 32,000-character ceiling. The dashboard transport uses its existing attachment path and does not call this local context-file injector. Full-request accounting and history compression remain owned by Hermes.

## Session Files Panel

[[src/renderer/src/screens/Chat/session-files/SessionFilesPanel.tsx#SessionFilesPanel]] lists attachments / context / agent-output via [[src/renderer/src/screens/Chat/session-files/useSessionFiles.ts#useSessionFiles]] and offers preview plus add/remove context. Chat mounts it beside messages when a gateway session id is active and Session Files is visible.

Visibility is owned by Chat ([[src/renderer/src/screens/Chat/useChatPanelLayout.ts#useSessionFilesVisible]]): hide removes the column; a floating restore control reappears in the messages pane. Preference persists in `hermes:chat:session-files-visible`.

The panel search box debounces to `searchSessionFiles`; hits show filename + snippet and open the existing Preview by `fileId`. Empty query restores the three-section list.

`refreshKey` from Chat forces a re-fetch after `files.createFromMessage` so Agent output updates without waiting for a session switch.

`useSessionFiles` also subscribes to `onFileDomainEvent` and refreshes when the event `sessionId` matches the active session.

## Agent Output Section

Dedicated Session Files section for `role=agent-output` ManagedFiles with full file actions.

[[src/renderer/src/screens/Chat/session-files/AgentOutputSection.tsx#AgentOutputSection]] renders [[src/renderer/src/screens/Chat/session-files/AgentOutputFileCard.tsx#AgentOutputFileCard]] cards (Preview / Save As / Open / Reveal). Path-only chat cards remain under [[file-ui-components#Agent output card]].

## FTS chunking

[[src/main/files/file-chunking.ts#chunkText]] indexes parsed text with structure-aware splits (heading → paragraph → newline → sentence → fixed window) and configurable overlap for Session file search.
