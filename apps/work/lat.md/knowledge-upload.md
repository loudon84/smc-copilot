# Knowledge uploads

Knowledge base uploads use Main-owned batches, independent persisted file jobs, and continuous sanitized snapshots. File transfer and remote ingestion have separate concurrency limits.

## Batch selection and import

The knowledge base's Upload jobs tab invokes `knowledge-job:pick-and-upload` for its locked target. Main opens one multi-file picker, then creates one job per selected file with a shared batch ID; canceling the picker creates no jobs.

[[src/main/knowledge/knowledge-upload-job-coordinator.ts#KnowledgeUploadJobCoordinator#pickAndUpload]] returns initial snapshots and imports at most two files concurrently across all batches through [[src/main/files/file-import-service.ts#importOnePath]]. A rejected file records its own error and does not stop the other imports. Cancellation and identity changes stop queued imports; late results cannot bind canceled or deleted jobs. [[src/main/files/file-service.ts#selectFilePaths]] is Main-only; paths never enter the Knowledge IPC response.

Batch drafts are created in a single transaction and published after commit, so failed allocation leaves no partial batch. An identity change during capability preflight or the native picker rejects the pending command.

When managed storage is enabled, Knowledge picker imports retain a managed copy even if Chat's `copyPickerFiles` preference is false. Disabling managed storage keeps the original-path behavior, so missing or changed source files require re-selection. Chat import preferences are unchanged.

Managed copying now uses asynchronous filesystem operations and publishes only a completed temporary copy. A profile/hash lookup after copying reuses one managed file record for concurrent same-content imports. Job binding still waits for copying and rechecks identity/attempt before writing. Knowledge imports skip automatic local parsing and FTS indexing during upload; Office content is parsed on demand when previewed, within the profile's existing size limit. See [[file-platform#Storage]] and [[file-platform#File preview]].

## Upload and ingestion

Separate [[src/main/files/jobs/file-job-queue.ts#FileJobQueue]] instances limit local imports, upload submissions, ingestion status requests, and remote cancellations to two concurrent operations each.

Remote parsing releases the upload slot immediately after the accepted receipt. The Upload jobs tab also submits batch commands two at a time and reconciles their responses together.

[[src/main/knowledge/knowledge-job-runtime.ts#runProviderUpload]] submits only queued jobs without a remote task ID. It checks stored content hashes and readable bytes before submitting, and persists remote IDs and status together. The multipart upload uses the existing byte view without first copying the entire file into another typed array. Upload requests have a 180-second timeout and support abort signals.

[[src/main/knowledge/knowledge-job-runtime.ts#pollIngestionUntilTerminal]] queries until a terminal result or abort, normally every two seconds. Transient errors use 5/10/30-second backoff; permanent request failures remain awaiting confirmation. Server progress is a percentage from 0 to 100, so a value of 1 displays as 1 percent. V1.1 puts the actual stage first and keeps that percentage in expandable details. Only a completed status denotes success; a server value stuck at 80 does not imply transfer progress or completion.

Chunk indexing runs during ingestion. A build response with `jobs: []` is valid: [[src/main/knowledge/knowledge-http-provider.ts#createKnowledgeHttpProvider]] returns `null`, Main skips build polling, and [[src/renderer/src/screens/Knowledge/pages/KnowledgeBaseDetailPage.tsx]] refreshes index readiness without inventing a completed task. Malformed job lists still fail contract validation.

## Manual status confirmation

[[src/main/knowledge/knowledge-upload-job-coordinator.ts#KnowledgeUploadJobCoordinator#refreshStatus]] queries pending tasks with known remote IDs in the current base, account, tenant, profile and data mode.

It skips submission/retry executions and tasks without remote IDs. Availability-blocked known tasks can be restored locally for a GET after a successful capability probe. This command never submits uploads or invokes startup recovery; mock mode returns local snapshots.

[[src/main/knowledge/knowledge-job-runtime.ts#confirmProviderJobOnce]] performs one GET, validates the returned ID and unchanged stored remote binding, and persists the result or safe awaiting-confirmation error. Manual refresh and normal polling share the complete in-flight query and persistence round through the existing two-request queue. One failed task does not discard other query results. Identity/attempt changes invalidate stale results.

The curated preload still exposes `knowledge-job:refresh-status` for compatibility. Main checks identity, mode and coordinator epoch across capability preflight and again before returning. The result includes attempted, confirmed, failed, skipped, and business-state-changed counts; revision or local timestamp changes alone do not count as state changes. The Upload jobs tab no longer exposes a manual status-query button; Main-owned polling and recovery continue.

## Persistence and identity

The profile database stores batch ID, phase, revision, creation time, and optional remote confirmation time. Accepted writes increment revision; conditional writes reject older attempts, terminal rewinds, and foreign partitions.

[[src/main/knowledge/knowledge-upload-job-store.ts#updateJobRecord]] guards attempt, revision, status, profile, account, and tenant in one SQL update. Renderer hydration, events, and command responses merge by revision. Main derives `canCancel` and `canRetry`; the UI uses those flags for single-file and batch actions.

`lastRemoteConfirmedAt` is written by Main in the same accepted conditional write as a valid remote result. Local operations and failed queries do not advance it. A new attempt clears the old confirmation time; legacy rows without the additive database field display no successful synchronization. Local `updatedAt` does not represent successful remote confirmation.

[[src/main/knowledge/knowledge-upload-job-coordinator.ts#KnowledgeUploadJobCoordinator#pauseForIdentityChange]] invalidates old executions before a profile database switch. Imports also check coordinator identity and epoch after asynchronous preparation, including account switches away and back. A token refresh for the same identity keeps active execution. Old capability probes cannot overwrite a new identity's probe result.

## Cancellation, retry, and recovery

Queued and importing jobs can be canceled locally. Submitted tasks require a confirmed remote terminal result; ambiguous upload or cancellation results stay awaiting confirmation rather than asserting success.

Once a task is definitively `failed`, the Upload jobs tab can delete its local task record even while the provider is offline. [[src/main/knowledge/knowledge-upload-job-store.ts#deleteCancelledJob]] conditionally deletes the row only for the acting profile, account, tenant, `failed` status, and observed revision. It does not delete a ManagedFile, remote document, or ingestion job. Main broadcasts a sanitized removal event so other open views discard the row; stale snapshot/list responses cannot restore it. Manually `cancelled` tasks and `awaiting_confirmation` tasks, including `INTERRUPTED` uploads without a remote receipt, remain ineligible.

[[src/main/knowledge/knowledge-upload-job-coordinator.ts#KnowledgeUploadJobCoordinator#retry]] permits only the persisted capability. Explicit format, size, permission, duplicate-name, missing-file, and changed-file failures require correction. Unknown submissions without a remote ID are never automatically re-uploaded. Remote retries do not fall back to creating another upload.

[[src/main/knowledge/knowledge-upload-job-coordinator.ts#KnowledgeUploadJobCoordinator#recoverOnStart]] processes the active account, tenant, profile, and data mode only. Safe queued files resume submission; remote tasks resume status queries; abandoned imports become interrupted. Currently importing jobs are excluded from capability-triggered recovery. Tasks blocked by service availability resume when a successful capability probe returns.

## Upload jobs presentation

[[src/renderer/src/screens/Knowledge/pages/KnowledgeBaseDetailPage.tsx#KnowledgeBaseDetailPage]] places Upload jobs beside Documents and Settings. The Upload files button selects that tab. The wider page keeps batch summaries visible while limiting the number of file rows mounted at once.

[[src/renderer/src/screens/Knowledge/features/file-job/KnowledgeUploadPanel.tsx#KnowledgeUploadPanel]] groups jobs by batch and shows totals, queued, active, successful, failed, canceled, and awaiting-confirmation counts, including partial success. Snapshot events are merged into one visible update per animation frame. An expanded batch initially mounts 30 matching file rows and reveals 30 more per click; search and status filters still inspect every job. Only the newest batch starts expanded.

Each row shows name, size, stage, successful synchronization time, actionable error, and permitted actions. Interrupted local imports, uncertain remote upload receipts, and failed remote ingestion have distinct guidance; uncertain remote tasks do not show the generic file failure beside the no-repeat-upload warning. Safe technical codes and server percentages stay in expandable details.

Filename search and status buttons change visible file rows only; every nonempty batch header, original summary, and full-batch action remains visible when no file matches. Such batches show a per-batch no-match message. Searches and filters reveal matching completed rows. Documents are available through the adjacent tab; per-file and toolbar View files buttons are removed. Status badges use text plus restrained color cues.

The manual local reload button is removed. The panel still reads partition-scoped SQLite when opened and when document visibility or Knowledge activation returns; these reads do not probe the service or start recovery. A separate retry-connection action invokes the existing capability recheck. [[src/shared/knowledge/use-knowledge-facade.ts#useKnowledgeFacade]] respects injected capability overrides. Snapshot reconciliation merges by revision.

Main exposes only a boolean query capability for each sanitized job, never the remote job ID. The manual service-status button is removed. Awaiting-confirmation jobs without a remote ID still advise checking the server record before another upload. Main-owned polling continues for known remote IDs.

The tab accepts multiple files dropped into its upload area through `useFileDrop`. The Renderer passes `File[]` to the Knowledge preload; preload resolves native paths and sends them directly to Main. Main validates the bounded request and each regular file before passing valid paths to the existing per-file import pipeline with `drag-drop` provenance. Invalid files fail individually, and sanitized job snapshots return to Renderer without paths. The native chooser remains available; directories are not supported.

The Simplified Chinese upload namespace includes batch summaries, actions, stages, errors, and restart guidance. This translation was explicitly requested by the user; missing Chinese keys previously fell back to English. Existing locale selection and English source strings remain in place.

The detail page subscribes outside the Upload jobs tab and shares completion detection across events and local reconciliation. Completed attempts trigger a combined, serialized file-list refresh even after leaving the tab. Knowledge activation also reconciles missed completions while Documents is shown. Returning to Upload jobs restores Main-owned tasks; late callbacks after identity/base/unmount changes are ignored.

[[src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView]] keys its pages by profile, user, and tenant. Identity changes clear cached files and batches, while token refresh retains the current tab. New authentication events take priority over a late initial authentication read.

Development starts Electron with `--watch`, rebuilding Main/preload changes alongside Renderer updates. An old running preload lacks `pickAndUpload`, so the tab explains that a desktop restart is required rather than reporting a provider outage. Restart the development command once after changing its startup arguments; a Renderer refresh alone cannot update that running command.

## Verification

Regression tests use real SQLite with controlled file and provider boundaries. Renderer tests cover revision ordering, batch actions, unavailable service, and completion refresh.

The focused checks live in `knowledge-upload-job-coordinator.test.ts`, `knowledge-upload-job-store.test.ts`, `file-import-knowledge-job.test.ts`, the runtime/provider tests, `tests/knowledge-job-ipc.test.ts`, and the Knowledge upload/base/fail-closed/host page tests. V1.1 checks include confirmation timestamps and rejected conditional writes, single-query/single-write overlap, bounded GET concurrency, submission/identity isolation, recovery controls, completion reconciliation, and filtered full-batch actions. The feature adds no dependency or backend endpoint; directory uploads and resumable transfer remain outside V1.1. The remote service source and deployment remain unchanged.

Responsiveness repair checks in `file-store.test.ts`, `file-import-knowledge-job.test.ts` and `file-preview-service.test.ts` cover event-loop responsiveness during a controlled pending copy, atomic object visibility, concurrent record reuse, temporary-file cleanup, unchanged Chat scheduling, and deferred Office preview/fallback/size limits. These are source-level regressions, not a live desktop performance capture.
