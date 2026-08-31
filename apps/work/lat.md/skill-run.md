# Skill Run Architecture & Boundaries (Checkpoint B)

This document describes the Checkpoint B (M3 Executable Run + M4 Result & Artifacts) architecture for Skill Run integration in SMC Copilot Work.

## Checkpoint B Scope & Boundaries

1. **Shared Authorized Transport & Consumer Lock Gate**:
   - `apps/work/src/main/auth/authorized-backend-transport.ts` provides the single shared implementation for JWT attachment, token refresh retry on 401/403, timeout handling, and same-origin validation.
   - `skill-run-consumer-lock.ts` enforces the M0 Provider Contract gate: when `contracts/skill-run/*/consumer-lock.json` is missing, `hasSkillRunConsumerLock()` returns `false`. Production HTTP requests (`POST /api/v1/mcp/tools/call`, `/api/v1/runs/*`, SSE, artifact downloads) fail closed with `START_DISABLED_NO_LOCK` / `CONTRACT_UNSUPPORTED`. Zero external network requests are made in live environments without a pinned lock.
   - The entire lifecycle is proven via unit tests with mock gateway/parser.

2. **Skill Run Lifecycle Coordinator**:
   - `SkillRunService` (`apps/work/src/main/skill-run/skill-run-service.ts`) is the single production owner for run lifecycle:
     - `pending-submit` state initialization before network transmission;
     - `clientRequestId` idempotency key to deduplicate starts across retries and restarts;
     - Event stream consumption with `Last-Event-ID` tracking, event id deduplication, and poll fallback;
     - Terminal state lock ensuring completed/cancelled runs cannot be downgraded by delayed SSE events;
     - User cancellation through `hermesAPI.skillRun.cancel` which aborts SSE/polling and notifies the provider.

3. **Session Continuation & Transcript Materialization**:
   - `SkillRunContinuationItem` is integrated into `DesktopSessionContinuationItem` union with `schemaVersion: 1`.
   - Normalization safely handles items with or without `providerRunId` (supporting `pending-submit`).
   - On terminal status, assistant transcript bubbles are materialized to SQLite `state.db` messages without creating duplicate sessions.
   - `rehydrateSession` reloads active projections upon app restart and reconnects SSE without re-issuing `tools/call`.

4. **File Platform Remote Identity Migration**:
   - `ManagedFileRemoteProvider` includes `"skill-run"`.
   - `managed_files` table adds `remote_run_id` column, migrating the remote identity unique index to `(profile_id, provider, remote_run_id, remote_artifact_id)`.
   - Remote artifacts sharing the same artifact id across different runs do not collide.
   - `upsertSkillRunRemoteArtifact` registers metadata and associates files with the chat session as `assistant_attachment`.
   - `skill-run-artifact-transfer.ts` streams artifact bytes with size and sha256 integrity checks.
   - `file-preview-service.ts` and `file-service.ts` dispatch downloads and previews according to `file.provider`.

5. **Renderer Presentation & Isolation**:
   - `Chat.tsx` mounts `<SkillRunStatusBar />` to display active phase, waiting-approval, or error summary.
   - User abort in skill mode invokes `hermesAPI.skillRun.cancel` instead of `abortChat`, isolating local chat execution.
   - Renderer store (`modules/skill-run/store.ts`) caches projections received via IPC broadcast (`onProjectionChanged`).

6. **Cross References**:
   - [[skill-run-integration]] — Approved target architecture and roadmap.
   - [[expert-execution]] — Expert compatibility client and lifecycle boundaries.
   - [[file-platform]] — Managed files and remote artifact transfer subsystem.
