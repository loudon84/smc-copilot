# File UI Components

Renderer file presentation under `components/files/{composer,message,preview,common}` — path I/O stays in Main behind `window.hermesAPI.files`.

## Composer and message cards

Composer tray/cards/drop overlay and message grids wrap the legacy `Attachment` type; ManagedFile views power preview. Session lists live under [[session-file-context]]. See [[file-platform]] for Main contracts.

Pick / drop / paste in [[src/renderer/src/screens/Chat/ChatInput.tsx#ChatInput]] go through [[src/renderer/src/screens/Chat/composerFilePlatform.ts]] (`hermesAPI.files` pick/import/stage → `toAttachments`), with legacy `processFiles` only as fallback. Tray shows ManagedFile `status` and `retryParse`. Card click opens [[file-ui-components#Preview panel]] via `fileId`.

Composer and History/message image cards use [[src/renderer/src/components/files/common/ImageAttachmentPreview.tsx#ImageAttachmentPreview]] — not legacy `AttachmentChip`. Tool-result attachments in [[src/renderer/src/screens/Chat/HistoryRow.tsx#ToolActivityGroup]] render via [[src/renderer/src/components/files/message/MessageAttachmentGrid.tsx#MessageAttachmentGrid]].

## Preview panel

[[src/renderer/src/components/files/preview/FilePreviewPanel.tsx#FilePreviewPanel]] shows descriptors from Main and, when `sessionId` is set, can add the file to session context or retry parse.

Chat owns three-column layout: messages, optional Session Files, and File Preview. [[src/renderer/src/screens/Chat/useChatPanelLayout.ts#useSessionFilesVisible]] persists Session Files show/hide; [[src/renderer/src/screens/Chat/useChatPanelLayout.ts#useFilePreviewMaximized]] covers only `chat-body` (ChatInput stays). Maximize does not rewrite `hermes:filePreviewWidth`.

Composer and restored message cards call `useFilePreview.openPreview(fileId)` so TXT / image / PDF previews are reachable without the Session Files panel.

`useFilePreview.openMessagePreview` opens an in-memory Markdown document (no `fileId`) via [[src/renderer/src/components/files/preview/MessageDocumentPreview.tsx#MessageDocumentPreview]].

Chat prefers [[src/renderer/src/hooks/files/useDocumentPreview.ts#useDocumentPreview]] for message-document state so managed-file and message previews stay separate.

## Message document actions

Long Assistant Markdown reports get an action bar without auto-writing files.

[[src/renderer/src/components/files/message/MessageDocumentActions.tsx#MessageDocumentActions]] appears when [[src/renderer/src/components/files/message/document-message-utils.ts#isDocumentLikeMessage]] is true. Preview works without a session; Save / Add require `sessionId` and call `files.createFromMessage`.

## Message document preview

In-memory Markdown preview for reports that are not yet ManagedFiles.

[[src/renderer/src/components/files/preview/MessageDocumentPreview.tsx#MessageDocumentPreview]] renders via RichContentRenderer; used when `useFilePreview.openMessagePreview` opens a message-document source.

## Agent output card

[[src/renderer/src/components/files/message/AgentOutputFileCard.tsx#AgentOutputFileCard]] renders non-image agent paths detected by media token parsing. Missing files show an explicit state; cards never auto-register arbitrary paths (registration is Main-only via `registerAgentOutputFile` for workspace/profile paths).
