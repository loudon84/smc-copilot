# Skill Run Architecture & Boundaries (Checkpoint C)

This document describes the Checkpoint C (P0 hardening) architecture for Skill Run integration in SMC Copilot Work.

## Checkpoint C Scope & Boundaries

Checkpoint C hardens Skill Run start gates, prompt-first validation, single-active-run, persistence, IPC, session restore, and catalog keyboard access.

1. **Feature mode gate**:
   - `SkillRunService.start` rejects new runs unless `getSkillRunFeatureMode()` is `skill-first`.
   - `expert-compat` and `local-only` return `START_DISABLED_FEATURE_MODE` without issuing production HTTP.
   - Existing readers/rehydration are not disposed when mode is not `skill-first`.

2. **Prompt-first Main validation**:
   - `bindPromptFirstTool` in `skill-run-contract-parser.ts` revalidates Catalog `toolName` and prompt-only schema on Main before `tools/call`.
   - Extra required fields, `$ref`, or complex schema shapes fail closed with `PARAMETERS_REQUIRED` / `UNSUPPORTED_SCHEMA`.
   - Renderer-submitted `toolName` is never trusted without Catalog confirmation.

3. **Single active run per session**:
   - `SkillRunService.start` rejects a second non-terminal run for the same `sessionId` with `RUN_ALREADY_ACTIVE`.
   - `Chat.tsx` treats non-terminal skill projections as busy (`chatBusy`) for queue drain and submit gating.
   - Queue dequeue uses the snapshot captured at enqueue time; remove-queued cancels skill runs via `hermesAPI.skillRun.cancel`.

4. **Persist before `tools/call`**:
   - `onPersistContinuation` writes `pending-submit` continuation before `gateway.callSkill`.
   - IPC `broadcastProjection` continues to upsert on every projection change.

5. **IPC validation & auth scope**:
   - `skill-run-ipc.ts` mirrors Expert patterns: `requireAuthSession`, trimmed required fields, `authGeneration` aligned to `user:${id}`, length limits.
   - Catalog cache in `skill-run-gateway-client.ts` is keyed by Main-computed auth scope (`origin|user:id`); `clearCache` on refresh/logout.

6. **Session mode restore**:
   - `skill-run-session-mode-store.ts` persists `{executionMode: skill-run, toolName, toolTitle}` per `session_id`.
   - `Layout.handleResumeSession` restores `executionMode` and title; `Chat` restores selected skill display from mode store + catalog.

7. **Catalog a11y**:
   - `SkillCatalogPanel` supports Arrow/Enter/Esc keyboard navigation and searches category text.

## M0 Consumer Lock (closed)

Work pins `SKILL-RUN-CONTRACT v1.0.0` at `contracts/skill-run/v1.0.0/` (`consumer-lock.json` + LF `SHA256SUMS`). `hasSkillRunConsumerLock()` requires both files. Gateway Catalog/start uses `POST /api/v1/mcp` JSON-RPC (`tools/list`, `tools/call`) with `X-Idempotency-Key`. Parser consumes PublicRunEvent types (`run.completed`, `event_id` / `event_seq`). Production start still requires feature mode `skill-first` (default remains `expert-compat`).

## Still Out

- Live backend Catalog → Run → Artifact E2E against a deployed Gateway
- M5 production default skill-first, telemetry dashboard
- M6 P1: Approval decisions, rich events, JSON Schema forms, attachment upload
- v4.2 Expert entry removal

## Cross References

Related architecture docs for Skill Run integration, Expert compatibility, and File Platform artifacts.

- [[skill-run-integration]] — Approved target architecture and roadmap.
- [[expert-execution]] — Expert compatibility client and lifecycle boundaries.
- [[file-platform]] — Managed files and remote artifact transfer subsystem.
