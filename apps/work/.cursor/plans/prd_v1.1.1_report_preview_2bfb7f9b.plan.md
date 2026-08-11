---
name: PRD v1.1.1 Report Preview
overview: "Implement PRD v1.1.1: report/attachment preview, save-as, and Agent Output management in the Chat panel -- from message-document identification, through preview/save IPC, to Session Files auto-refresh."
todos:
  - id: shared-contracts
    content: "Phase 1: Create src/shared/files/message-document.ts (DTOs), extend file-ipc.ts (channel + API method), file-preview.ts (FilePreviewSource), file-errors.ts (new error codes), and index.ts re-exports"
    status: completed
  - id: document-utils
    content: "Phase 1: Create document-message-utils.ts with isDocumentLikeMessage() and extractDocumentTitle() in renderer components/files/message/"
    status: completed
  - id: agent-output-service
    content: "Phase 2: Create src/main/files/agent-output/ directory with agent-output-service.ts (createFromMessage), generated-file-name.ts (sanitize + unique), agent-output-errors.ts"
    status: completed
  - id: main-ipc-wiring
    content: "Phase 2-3: Add createFromMessage to fileService facade, register IPC handler in register-file-ipc.ts, wire preload bridge in files-api.ts"
    status: completed
  - id: message-doc-actions
    content: "Phase 4: Create MessageDocumentActions.tsx component with Preview/Save/Add buttons and state machine; integrate into MessageRow.tsx for qualifying assistant bubbles"
    status: completed
  - id: preview-extension
    content: "Phase 4: Extend useFilePreview with openMessagePreview(), create MessageDocumentPreview.tsx, update FilePreviewPanel to handle message-document mode with appropriate header actions"
    status: completed
  - id: chat-plumbing
    content: "Phase 4: Thread onPreviewDocument and onCreateFile callbacks through Chat.tsx -> MessageList -> MessageRow; connect to useFilePreview and useSessionFiles.refresh"
    status: completed
  - id: session-files-refresh
    content: "Phase 5: Trigger useSessionFiles.refresh() after createFromMessage succeeds; update Agent Output section to reflect new file immediately"
    status: completed
  - id: latmd-and-tests
    content: "Phase 6: Update lat.md docs (file-ui-components, file-platform, file-domain), add unit tests (generated-file-name, document-message-utils, agent-output-service), run lat check"
    status: completed
isProject: false
---

# PRD v1.1.1 Report Preview and Agent Output Implementation

## Current State

The File Platform is already mature: `ManagedFile`, `FileAssociation`, preview panel, agent-output role, `registerAgentOutputFile` (for existing disk files), and `SessionFilesPanel` with an "Agent output" section. But the **message-to-file pipeline** is missing: long Markdown assistant messages have no "preview/save" affordance, no way to write them to disk as managed files, and the Agent Output section stays empty for these reports.

## Architecture

The implementation spans four layers following existing conventions:

```
Shared contracts (src/shared/files/)
  -> Main services (src/main/files/agent-output/)
  -> IPC + Preload (src/main/files/register-file-ipc.ts, src/preload/files-api.ts)
  -> Renderer components (src/renderer/src/components/files/message/)
```

Key existing files to extend:
- [`src/shared/files/file-ipc.ts`](src/shared/files/file-ipc.ts) -- add `createFromMessage` channel + DTO
- [`src/shared/files/file-preview.ts`](src/shared/files/file-preview.ts) -- add `FilePreviewSource` union
- [`src/main/files/file-service.ts`](src/main/files/file-service.ts) -- add `createFromMessage` to `fileService`
- [`src/preload/files-api.ts`](src/preload/files-api.ts) -- wire new IPC
- [`src/preload/index.d.ts`](src/preload/index.d.ts) -- type the new API
- [`src/renderer/src/hooks/files/useFilePreview.ts`](src/renderer/src/hooks/files/useFilePreview.ts) -- support message-document source (no fileId)
- [`src/renderer/src/screens/Chat/MessageRow.tsx`](src/renderer/src/screens/Chat/MessageRow.tsx) -- render `MessageDocumentActions`
- [`src/renderer/src/components/files/preview/FilePreviewPanel.tsx`](src/renderer/src/components/files/preview/FilePreviewPanel.tsx) -- handle message-document preview mode
- [`src/renderer/src/screens/Chat/Chat.tsx`](src/renderer/src/screens/Chat/Chat.tsx) -- plumb message preview into existing layout
- [`src/renderer/src/screens/Chat/session-files/useSessionFiles.ts`](src/renderer/src/screens/Chat/session-files/useSessionFiles.ts) -- auto-refresh on file:created

## Phase 1: Shared Contracts and Document Identification

New files:
- `src/shared/files/message-document.ts` -- `CreateFileFromMessageInput`, `CreateFileFromMessageResult`, `MessageDocumentPreviewInput`
- `src/renderer/src/components/files/message/document-message-utils.ts` -- `isDocumentLikeMessage()`, `extractDocumentTitle()`

Extend existing:
- `src/shared/files/file-ipc.ts` -- add `createFromMessage` channel to `FILES_IPC_CHANNELS` and `HermesFilesAPI`
- `src/shared/files/file-preview.ts` -- add `FilePreviewSource` (managed-file | message-document) union type
- `src/shared/files/file-errors.ts` -- add agent-output error codes (`INVALID_MESSAGE_CONTENT`, `GENERATED_DIRECTORY_FAILED`, `GENERATED_FILE_WRITE_FAILED`, etc.)
- `src/shared/files/index.ts` -- re-export new module

## Phase 2: Main Process -- AgentOutputService and File Name Generation

New files:
- `src/main/files/agent-output/agent-output-service.ts` -- `createFromMessage()`: validate input, resolve profile root, create `generated/<sessionId>/` dir, sanitize filename, write UTF-8 .md, upsert ManagedFile, insert FileAssociation, emit domain event
- `src/main/files/agent-output/generated-file-name.ts` -- `sanitizeGeneratedFileName()`, `createGeneratedFileName()`, `resolveUniqueFileName()` (append `(1)`, `(2)` on collision)
- `src/main/files/agent-output/agent-output-errors.ts` -- typed error builder

Extend existing:
- [`src/main/files/file-service.ts`](src/main/files/file-service.ts) -- add `createFromMessage` method to the `fileService` facade, delegating to `AgentOutputService`
- [`src/main/files/register-file-ipc.ts`](src/main/files/register-file-ipc.ts) -- register `files:create-from-message` handler

Storage path: `<profileHome>/desktop/files/generated/<sessionId>/<sanitized-title>.md`

Title extraction priority: explicit `suggestedTitle` > first Markdown heading > session title > `generated-report`

Idempotency: if a FileAssociation with `role=agent-output` already exists for the same `(fileId, sessionId, messageId)`, return `alreadyExisted: true` without creating a duplicate file.

## Phase 3: Preload and IPC Wiring

Extend:
- [`src/preload/files-api.ts`](src/preload/files-api.ts) -- add `createFromMessage` bridge
- [`src/preload/index.d.ts`](src/preload/index.d.ts) -- add typing for the new method on `HermesFilesAPI` (it's typed via the imported `HermesFilesAPI` from shared already, but the `files` property on `HermesAPI` uses `import("../shared/files").HermesFilesAPI`, so updating the shared interface suffices)

## Phase 4: Renderer -- Document Actions and Message Preview

New files:
- `src/renderer/src/components/files/message/MessageDocumentActions.tsx` -- action bar: "Preview", "Save as .md", "Add to session files"; state machine (idle -> creating -> created / error)
- `src/renderer/src/components/files/preview/MessageDocumentPreview.tsx` -- wrapper rendering `RichContentRenderer` for raw markdown content

Extend:
- [`src/renderer/src/screens/Chat/MessageRow.tsx`](src/renderer/src/screens/Chat/MessageRow.tsx) -- for assistant bubbles where `isDocumentLikeMessage(content)` is true, render `<MessageDocumentActions>` after the bubble content
- [`src/renderer/src/hooks/files/useFilePreview.ts`](src/renderer/src/hooks/files/useFilePreview.ts) -- add `openMessagePreview(source: MessageDocumentPreviewInput)` that sets state without calling IPC (content is already in memory)
- [`src/renderer/src/components/files/preview/FilePreviewPanel.tsx`](src/renderer/src/components/files/preview/FilePreviewPanel.tsx) -- when `state.messageDocument` is set (no fileId), render `MessageDocumentPreview` instead of the normal router; header shows "Save as .md" / "Add to session files" / "Close" (no "Open" / "Reveal" since no physical file yet)
- [`src/renderer/src/screens/Chat/Chat.tsx`](src/renderer/src/screens/Chat/Chat.tsx) -- pass `onPreviewDocument` and `onCreateFile` callbacks through `MessageList` to `MessageRow` so document actions can trigger preview and file creation

## Phase 5: Session Files Auto-Refresh

Extend:
- [`src/renderer/src/screens/Chat/session-files/useSessionFiles.ts`](src/renderer/src/screens/Chat/session-files/useSessionFiles.ts) -- after `createFromMessage` returns successfully, call `refresh()` to re-query the session file list (no domain event pub/sub needed for P0; the action callback in Chat.tsx triggers refresh directly)
- Alternatively, if IPC event broadcast is already wired for file-job events, piggyback a lightweight `files:session-changed` event from Main after creating the association, and subscribe in `useSessionFiles`. The simpler approach (callback-triggered refresh) is preferred for P0.

## Phase 6: lat.md Documentation and Tests

- Update `lat.md/file-ui-components.md` -- document `MessageDocumentActions`, `MessageDocumentPreview`
- Update `lat.md/file-platform.md` -- document `AgentOutputService.createFromMessage`, generated file storage
- Update `lat.md/file-domain.md` -- mention message-document source path
- Add test specs to `lat.md/` or existing test docs
- Unit tests: `generated-file-name.test.ts`, `document-message-utils.test.ts`, `agent-output-service.test.ts`
- Run `lat check` to validate all links

## Security Constraints (from PRD Section 14)

- Renderer never touches `fs`/`path`; all file I/O goes through IPC
- File names sanitized via `sanitizeGeneratedFileName` (strips `<>:"/\|?*`, NFC normalize, 80-char cap)
- Session ID sanitized before use as directory segment
- No path traversal (`..`), no symlink bypass, canonicalized paths only
- `saveAs` target path comes exclusively from `dialog.showSaveDialog`
- No auto-registration from LLM text paths
- Profile isolation enforced on every query/write

## Compatibility

- Old messages without ManagedFile still show "Preview" and "Save as .md" (content-based identification)
- Old image attachments (`session-attachment-store`) untouched
- Legacy `Attachment` type preserved
- Existing `AgentOutputFileCard` (path-based) remains for agent-created files; new `MessageDocumentActions` is for message-content-based reports
