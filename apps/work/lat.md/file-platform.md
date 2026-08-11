# File Platform

Hermes Desktop's independent file layer: managed files, security, storage, parsers, session context, and Attachment compatibility — without replacing Hermes Agent file tools.

## Four layers

The long-term stack is File Domain → File UI Components → Rich Content Components → File Context Adapter. Shared contracts live under `src/shared/files`; Main under `src/main/files`; UI under `components/files` and `rich-content`.

Renderer never touches `fs`/`path`; it calls `window.hermesAPI.files`. Absolute paths and full security policy stay in Main; Renderer receives trimmed [[file-platform#Capabilities]].

## Reference tree exclusion

Product toolchains must never parse or import `references/**` or `wiki/**` (PRD §2.1).

`tsconfig` exclude, ESLint ignores, Vite `server.fs.deny`, and `npm run check:no-reference-imports` gate CI so Chatbox clones stay out of `src/`.

## Capabilities

Main reads `desktop.files.*` from profile `config.yaml` via [[src/main/files/file-config.ts#readDesktopFilesConfig]] and exposes [[src/main/files/file-config.ts#toFilesCapabilities]] flags (limits, parsing/indexing toggles, preview toggles, categories).

## Security

[[src/main/files/file-security.ts]] enforces canonicalize + realpath, managed-root containment, denied extensions, import size limits, and magic-byte sniffing. Violations surface as [[src/shared/files/file-errors.ts#FileError]] / [[src/main/files/file-security.ts#FilePlatformError]].

## Storage

Per-profile layout lives at `profileHome/desktop/files/{objects,parsed,previews,temp}/file-index.db`. [[src/main/files/file-store.ts#ensureFilesLayout]] creates it; content-hash dedup copies go under `objects/<prefix>/<hash>`. Clipboard staging reuses [[src/main/attachment-staging.ts#stageAttachment]].

## Association store

[[src/main/files/file-association-store.ts]] owns `managed_files`, `file_associations`, `parsed_documents`, `file_chunks` (+ FTS5 when available) in `file-index.db`, not `state.db`. Reference counting uses [[src/main/files/file-association-store.ts#countAssociations]].

## Attachment adapter

[[src/main/files/attachment-adapter.ts#toManagedFile]] / [[src/main/files/attachment-adapter.ts#toHermesAttachment]] bridge legacy [[src/shared/attachments.ts#Attachment]]. Remote mode never emits local `path-ref`; unsupported remote files raise `FILE_REMOTE_UNSUPPORTED`.

## Send dual-write and session dual-read

Successful sends dual-write ManagedFile `message-attachment` links while keeping the legacy image blob table. Session restore prefers associations, then falls back to old images.

After send, [[src/main/files/persist-managed-message-associations.ts#persistManagedMessageAssociations]] links each ManagedFile id via [[src/main/session-attachment-store.ts#findUserMessageIdForPrompt]]. That lookup must not require `desktop_message_attachments` to exist yet (fresh profiles). Load uses [[src/main/files/load-managed-message-attachments.ts#loadManagedMessageAttachments]] ahead of the legacy table / vision path in [[src/main/sessions.ts#mergeStoredPromptImageAttachments]].

## FileService

[[src/main/files/file-service.ts#fileService]] implements HermesFilesAPI; import/staging is [[src/main/files/file-import-service.ts#importOnePath]], IPC via [[src/main/files/register-file-ipc.ts#registerFilesIpcHandlers]].

Agent paths register only under profile home or the session context folder via [[src/main/files/file-service.ts#registerAgentOutputFile]].

## File preview

[[src/main/files/file-preview-service.ts#getPreviewDescriptor]] builds Renderer-safe [[src/shared/files/file-preview.ts#FilePreviewDescriptor]]s with capped streamed reads — never buffering an entire large file in Main.

Text/code/markdown/html previews accept optional `offset`/`limit` ([[src/shared/files/file-preview.ts#FilePreviewOptions]]); when truncated, the panel can request the next range via `nextOffset` ("Load more").

## File operations

[[src/main/files/file-operation-service.ts]] provides OS open / reveal-in-folder / Save As for managed files via Electron `shell` and dialogs, keeping absolute paths in Main only.

## AgentOutputService

[[src/main/files/agent-output/agent-output-service.ts#createFromMessage]] turns Assistant Message Markdown into a ManagedFile under `desktop/files/generated/<sessionId>/`.

It sanitizes titles via [[src/main/files/agent-output/generated-file-name.ts#sanitizeGeneratedFileName]], never overwrites on name collision, upserts `source: agent-output` + association `role: agent-output`, and is idempotent per `(sessionId, messageId)`.

## File domain events

Main broadcasts ManagedFile / association changes without absolute paths.

[[src/main/files/file-domain-events.ts#emitFileDomainEvent]] sends `files:event` to all windows; Renderer subscribes via `hermesAPI.files.onFileDomainEvent`.

## Parser Registry

[[src/main/files/file-parser-registry.ts#FileParserRegistry]] picks the highest-priority [[src/shared/files/parser-contract.ts#FileParser]]; denied extensions always use fallback (path-ref only).

Built-ins: text/markdown/code, MarkItDown (pdf/office when configured), Office (docx/xlsx/pptx via inline ZIP), PDF (BT/ET scan), EPUB, image metadata, fallback. [[src/main/files/file-parse-service.ts#parseFile]] caches by parser id/version, persists [[src/shared/files/managed-file.ts#ParsedDocument]], and chunks into FTS.

## MarkItDown conversion

[[src/main/files/conversion/local-markitdown-provider.ts#LocalMarkItDownProvider]] spawns the MarkItDown CLI (timeout, stdout cap, abort, exit-code checks). [[src/main/files/parsers/markitdown-parser.ts#markitdownParser]] prefers it when `office_parser`/`pdf_parser` are `markitdown`, and falls back to coarse parsers if the CLI is missing.

## File job queue

[[src/main/files/jobs/file-job-queue.ts#FileJobQueue]] bounds parse concurrency (default 2) and broadcasts [[src/shared/files/file-job.ts#FileJobEvent]] via `file-job:event`. Import uses [[src/main/files/jobs/parse-file-job.ts#scheduleParseJob]]; Composer subscribes through `hermesAPI.files.onFileJobEvent`.

## Index and session context

[[src/main/files/file-index-service.ts]] wraps session list + chunk search. [[session-file-context]] documents the panel and [[src/main/files/file-context-builder.ts#buildSessionFileContext]] (ephemeral injection only).

## Cleanup

[[src/main/files/file-cleanup-service.ts#cleanupOrphanFiles]] deletes managed physical copies with zero associations older than `orphan_retention_days`; [[src/main/files/file-cleanup-service.ts#cleanupTempFiles]] clears `temp/` past `temp_retention_hours`. App ready runs [[src/main/files/file-cleanup-service.ts#runFilesCleanupBestEffort]].
