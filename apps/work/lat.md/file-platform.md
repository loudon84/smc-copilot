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

[[src/main/files/file-store.ts#storeManagedCopy]] copies asynchronously into a unique temporary file in the object's directory and publishes the completed object with an asynchronous rename. Concurrent imports can reuse a completed content-addressed object without observing a partial copy; failed operations clean up their exact temporary path. After copying, import rechecks the profile/hash record before its synchronous upsert to preserve one managed ID and separate consumer associations.

## Association store

[[src/main/files/file-association-store.ts]] owns `managed_files`, `file_associations`, `parsed_documents`, `file_chunks` (+ FTS5 when available) in `file-index.db`, not `state.db`. Reference counting uses [[src/main/files/file-association-store.ts#countAssociations]].

Remote Skill-run rows are unique on `(profile, remote_run_id, remote_artifact_id)` and require a non-null run id. Expert remote rows keep a partial unique on `(profile, remote_artifact_id)` so Skill indexes cannot swallow Expert identity; File Platform never stamps a fake `remoteRunId` onto Expert rows. Local hash uniqueness does not apply to remote. Session associations are idempotent on `(profile, session, file, role)`.

## Attachment adapter

[[src/main/files/attachment-adapter.ts#toManagedFile]] / [[src/main/files/attachment-adapter.ts#toHermesAttachment]] bridge legacy [[src/shared/attachments.ts#Attachment]]. Remote mode never emits local `path-ref`; unsupported remote files raise `FILE_REMOTE_UNSUPPORTED`.

## Send dual-write and session dual-read

Successful sends dual-write ManagedFile `message-attachment` links while keeping the legacy image blob table. Session restore prefers associations, then falls back to old images.

After send, [[src/main/files/persist-managed-message-associations.ts#persistManagedMessageAssociations]] links each ManagedFile id via [[src/main/session-attachment-store.ts#findUserMessageIdForPrompt]]. That lookup must not require `desktop_message_attachments` to exist yet (fresh profiles). Load uses [[src/main/files/load-managed-message-attachments.ts#loadManagedMessageAttachments]] ahead of the legacy table / vision path in [[src/main/sessions.ts#mergeStoredPromptImageAttachments]].

## FileService

[[src/main/files/file-service.ts#fileService]] implements HermesFilesAPI; import/staging is [[src/main/files/file-import-service.ts#importOnePath]], IPC via [[src/main/files/register-file-ipc.ts#registerFilesIpcHandlers]].

Agent paths register only under profile home or the session context folder via [[src/main/files/file-service.ts#registerAgentOutputFile]].

[[knowledge-upload#Batch selection and import]] reuses the Main-only multi-file picker and import pipeline. Knowledge imports retain a managed copy when managed storage is enabled, while Chat keeps its own picker-copy preference.

Knowledge imports defer local parsing and FTS indexing instead of scheduling them during remote upload. Chat path imports and clipboard imports continue scheduling local parsing. Existing content checks, stored hashes, and Knowledge identity/attempt checks remain in place.

## File preview

[[src/main/files/file-preview-service.ts#getPreviewDescriptor]] builds Renderer-safe [[src/shared/files/file-preview.ts#FilePreviewDescriptor]]s with bounded text reads and per-profile file lookup.

Local Office previews reuse cached parsed content. On a cache miss they check the actual file size asynchronously against the requested profile's `maxParseMb`, then request [[src/main/files/file-parse-service.ts#parseFile]] with its normal concurrency and parser limits. Oversized files and parsing failures retain the unsupported fallback. Image/PDF/text and remote preview paths keep their existing behavior.

For Expert remote resources (`locality: remote`), Main uses Gateway Provider Preview JSON or authorized download into a Main-only preview cache served as `hermes-file-preview://{fileId}` — Renderer never receives absolute cache paths, JWT, or Provider URLs. Offline cached copy is off by default.

Text/code/markdown/html previews accept optional `offset`/`limit` ([[src/shared/files/file-preview.ts#FilePreviewOptions]]); when truncated, the panel can request the next range via `nextOffset` ("Load more").

## File operations

[[src/main/files/file-operation-service.ts]] / [[src/main/files/file-service.ts#fileService]] provide OS open / reveal-in-folder / Save As.

Remote Download and materialize dispatch on `ManagedFile.provider`. Skill-run rows stream via [[src/main/files/skill-run-artifact-transfer.ts#streamSkillRunArtifactBytes]] (Bundle `/api/v1/runs/{run_id}/artifacts/{artifact_id}/download`, required `runId`, size cap, optional sha256, `.partial` + atomic rename). Expert rows keep [[src/main/files/expert-artifact-transfer.ts#streamExpertArtifactBytes]]. Shared materialize remains [[src/main/files/materialize-remote-expert-artifact.ts#materializeRemoteExpertArtifact]] on the same `fileId`. Preview already branches the same way in [[src/main/files/file-preview-service.ts#getPreviewDescriptor]]. Cache keys stay the ManagedFile `fileId`. Open/Reveal require a local managed copy.

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

The queue limits execution in Main; it does not move synchronous parser or indexing work to a worker thread. Knowledge uploads skip automatic local parsing, while an explicit Office preview can request it on demand.

## Index and session context

[[src/main/files/file-index-service.ts]] wraps session list + chunk search. [[session-file-context]] documents the panel and [[src/main/files/file-context-builder.ts#buildSessionFileContext]] (ephemeral injection only).

## Cleanup

[[src/main/files/file-cleanup-service.ts#cleanupOrphanFiles]] deletes managed physical copies with zero associations older than `orphan_retention_days`; [[src/main/files/file-cleanup-service.ts#cleanupTempFiles]] clears `temp/` past `temp_retention_hours`. App ready runs [[src/main/files/file-cleanup-service.ts#runFilesCleanupBestEffort]].
