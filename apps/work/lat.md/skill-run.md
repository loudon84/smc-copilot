# Skill Run Architecture & Boundaries (Checkpoint C)

This document describes the Checkpoint C (P0 hardening) architecture for Skill Run integration in SMC Copilot Work.

## Checkpoint C Scope & Boundaries

Checkpoint C hardens Skill Run start gates, prompt-first validation, single-active-run, persistence, IPC, session restore, and catalog keyboard access.

1. **Feature mode gate**:
   - `SkillRunService.start` rejects new runs unless `getSkillRunFeatureMode()` is `skill-first`.
   - `expert-compat` and `local-only` return `START_DISABLED_FEATURE_MODE` without issuing production HTTP.
   - Existing readers/rehydration are not disposed when mode is not `skill-first`.

2. **Prompt-first Main validation**:
   - `classifySkillInvocation` in `skill-run-contract-parser.ts` is the single Owner for Catalog callability and Start bindability (`prompt-first` | `parameters-required` | `form-required` | `unsupported-schema`).
   - Catalog projection (`mapPublicSkillCatalogTools`) and `bindPromptFirstTool` both call that classifier; `catalog.callability === "callable"` implies bind success.
   - Binding uses contract `promptField` (not a hardcoded `"prompt"`) to build `tools/call` arguments; optional object/array properties are ignored and do not disqualify prompt-first.
   - Extra required fields, root `$ref`, non-object root, or composite schemas fail closed with `SKILL_*` error codes (`SKILL_PARAMETERS_REQUIRED`, `SKILL_UNSUPPORTED_SCHEMA`, etc.).
   - Renderer-submitted `toolName` is never trusted without Catalog confirmation; Renderer never supplies `promptField` / `inputSchema` as execution truth.

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

## M0 Provider Contract Bundle (v1.2.1 locked)

Work has imported the complete immutable `SKILL-RUN-CONTRACT` v1.2.1 Bundle and pins the published `skill-run-contract-v1.2.1` tag before allowing the consumer gate to open.

Work consumes only `contracts/skill-run/<version>/` Bundle contents: its consumer lock, manifest, checksums, schemas, endpoint matrix, idempotency/SSE semantics, and redacted fixtures. `contracts/skill-run/v1.2.1/consumer-lock.json` pins tag target `10d38f2c97739c4a55df893d1dc954fc8896f1a7`; the Provider-owned files remain covered solely by its LF `SHA256SUMS`.

`hasSkillRunConsumerLock()` / `isCompleteSkillRunBundleDir()` require a Work lock, LF `SHA256SUMS` with matching digests for every listed file, `manifest.json`, and the P0 schema/matrix/fixture paths. The legacy v1.0.0 identity-only material remains a fail-closed regression case, while checksum-valid v1.2.1 returns true. Gateway Catalog/start uses Bundle-defined JSON-RPC and `X-Idempotency-Key`; production start still additionally requires feature mode `skill-first` (the default remains `expert-compat`).

## Checkpoint B Live / Fixture E2E

Entry: `apps/work/src/main/skill-run/skill-run-e2e.test.ts` via `npm run test:skill-run-e2e` (or vitest with `--pool=threads --maxWorkers=1`).

- **CI fixture (blocking):** `fetchImpl` HTTP replay through real `createSkillRunGatewayClient` + `createSkillRunService` covers Catalog → start → SSE/poll → result → artifacts → rehydrate (zero second `tools/call`), plus negatives: unauthorized catalog, unpublished tool, SSE reconnect + `Last-Event-ID`, idempotency key replay, cancel, hanging SSE with concurrent poll, artifact discovery failure keeping `succeeded`, unknown event fail-soft.
- **Live (env-gated):** `describe.skipIf` unless `SMC_SKILL_RUN_E2E=1`. Required env (never commit secrets):
  - `SMC_SKILL_RUN_E2E_BACKEND_URL`
  - `SMC_SKILL_RUN_E2E_ACCESS_TOKEN`
  - `SMC_SKILL_RUN_E2E_TOOL_NAME`
  - `SMC_SKILL_RUN_E2E_PROMPT` (optional short prompt)
- **AC-12 evidence grading:** fixture green proves same-process idempotency / restart without second `tools/call`. **Cross-end** “only one Provider Run” is **proven only when live suite actually runs**. If live is skipped → Completion = `IMPLEMENTED_NOT_PROVEN` for AC-12 cross-end; do not claim proven from fixture alone.
- Evidence under `artifacts/work-v4.0.1-checkpoint-b-live-e2e/` must not contain JWT, absolute backend URLs, prompt全文, or artifact bytes.
- The live suite remains env-gated. RM-01 live AC stay BACKLOG by product decision and will be re-run in a later stage; fixture green does not prove cross-end idempotency. Optional object/array properties on a prompt-first schema are allowed and omitted from `tools/call` arguments; root `$ref` / composite schemas and extra required fields still fail closed before `tools/call`.
- M3 production Skill Run identity is Bundle `structuredContent.run_id` + `/api/v1/runs/*`. HermesTask `task_id` / `/api/v1/hermes/tasks/*` is not a Skill Run contract and must not become the Work lifecycle SoT.
- M3 `consumeSse` starts bounded `pollStatus` while the SSE body is still open so a hung nonterminal stream cannot block Bundle terminal status. Repository default feature mode remains `expert-compat` until M5.

## M4 Result artifacts and Session Files

Work consumes Bundle `PublicArtifactList` through [[src/main/skill-run/skill-run-contract-parser.ts#mapPublicArtifactList]] and upserts Session `agent-output` on the assistant bubble.

Private `id`/`file_name` envelopes are skipped. Required Bundle fields are `artifact_id` / `name` / `size_bytes` / `checksum_sha256`. Upsert keys Skill files by `(provider=skill-run, remoteRunId, remoteArtifactId)` with message id `skill-run:{clientRequestId}:assistant`.

Discovery failure keeps Run phase `succeeded` and records a sanitized retryable error on [[src/shared/skill-run.ts#SkillRunProjection]]. [[src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar]] exposes retry via existing `hermesAPI.skillRun.retryArtifactDiscovery` and `skillRun.artifactRetry`; it does not own Session Files and does not copy Expert artifact cards. Retry re-enters `listRunArtifacts` and never issues a second `tools/call`.

Live Checkpoint B (Catalog → Submit → Run → Result → Artifact Preview/Save As → Restart, plus the fixture negatives) remains the Roadmap `DONE` bar for RM-05. Fixture and focused tests prove implementation; env-gated live stay skipped unless `SMC_SKILL_RUN_E2E=1`. RM-01 live AC stay BACKLOG.

## Still Out

The following capabilities remain intentionally outside the current Work slice and require their own Provider Owner delivery or PRD.

- RM-01 live replay remains BACKLOG and will be re-run later; it does not block M3 Stage PRD/implementation, and it does not authorize production-default `skill-first`
- M5 production default skill-first, telemetry dashboard
- M6 P1: Approval decisions, rich events, JSON Schema forms, attachment upload
- v4.2 Expert entry removal

## Cross References

Related architecture docs for Skill Run integration, Expert compatibility, and File Platform artifacts.

- [[skill-run-integration]] — Approved target architecture and roadmap.
- [[expert-execution]] — Expert compatibility client and lifecycle boundaries.
- [[file-platform]] — Managed files and remote artifact transfer subsystem.
