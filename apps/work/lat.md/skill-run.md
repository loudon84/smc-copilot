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

`hasSkillRunConsumerLock()` / `isCompleteSkillRunBundleDir()` require a Work lock, LF `SHA256SUMS` with matching digests for every listed file, `manifest.json`, and the P0 schema/matrix/fixture paths. The legacy v1.0.0 identity-only material remains a fail-closed regression case, while checksum-valid v1.2.1, v1.3.0, or v1.4.0 returns true. Gateway Catalog/start uses Bundle-defined JSON-RPC and `X-Idempotency-Key`. Production default feature mode is `skill-first`; `SMC_WORK_SKILL_RUN_MODE` or `userData/skill-run-feature-mode.json` can roll new submits back to `expert-compat` or `local-only` without stopping existing Skill Run readers.

## M0 v1.3.0 Approval decision bundle

Work has also imported immutable `SKILL-RUN-CONTRACT` v1.3.0. Tag `skill-run-contract-v1.3.0` pins `26e1cb5aa2aebbb4bdc1a8e1c65617aaa6b6c948`.

`contracts/skill-run/v1.3.0/consumer-lock.json` records that pin. Provider files stay under LF `SHA256SUMS`. Manifest sets `approval` / `approvalDecision` to `supported` and keeps `attachments` / `approvalExpiry` `unsupported`. Canonical decision path is `POST /api/v1/runs/{run_id}/approvals/{approval_id}/decision` with `X-Idempotency-Key`. Deny terminal follows the Bundle (`COMPLETED` on Hermes REAL_PROCESS live, `FAILED` on local no-binding); Work must not rewrite deny as `CANCELLED`. This import does not implement RM-09 IPC/UI and does not enable Attachment upload.

## M0 v1.4.0 Attachment bundle

Work has also imported immutable `SKILL-RUN-CONTRACT` v1.4.0. Tag `skill-run-contract-v1.4.0` pins `5d0e538fa68655f0084850d5378398f622ed90ba`.

`contracts/skill-run/v1.4.0/consumer-lock.json` records that pin. Provider files stay under LF `SHA256SUMS`. Manifest sets `attachments` to `supported` and keeps `approvalExpiry` `unsupported`. Public upload is `POST /api/v1/attachments` (multipart). Binding is `params.client_context.attachment_refs` only. Accepted `structuredContent` may echo opaque `attachment_refs`. P0 `REQUIRED_BUNDLE_PATHS` stays unchanged so v1.2.1 can still open Catalog/start. This import does not implement RM-11 upload IPC/UI, does not call upload HTTP, and does not add a second File Platform owner.

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
- The live suite remains env-gated. Fixture green does not prove cross-end idempotency; RM-01 AC-03 requires two independent live clients to replay the same `X-Idempotency-Key` and receive one Provider `run_id`. Optional object/array properties on a prompt-first schema are allowed and omitted from `tools/call` arguments; root `$ref` / composite schemas and extra required fields still fail closed before `tools/call`.
- M3 production Skill Run identity is Bundle `structuredContent.run_id` + `/api/v1/runs/*`. HermesTask `task_id` / `/api/v1/hermes/tasks/*` is not a Skill Run contract and must not become the Work lifecycle SoT.
- M3 `consumeSse` starts bounded `pollStatus` while the SSE body is still open so a hung nonterminal stream cannot block Bundle terminal status. Repository default feature mode is `skill-first`; rollback modes still reject `start` with `START_DISABLED_FEATURE_MODE` and never silently fall back to Expert.

## M4 Result artifacts and Session Files

Work consumes Bundle `PublicArtifactList` through [[src/main/skill-run/skill-run-contract-parser.ts#mapPublicArtifactList]] and upserts Session `agent-output` on the assistant bubble.

Private `id`/`file_name` envelopes are skipped. Required Bundle fields are `artifact_id` / `name` / `size_bytes` / `checksum_sha256`. Upsert keys Skill files by `(provider=skill-run, remoteRunId, remoteArtifactId)` with message id `skill-run:{clientRequestId}:assistant`.

Discovery failure keeps Run phase `succeeded` and records a sanitized retryable error on [[src/shared/skill-run.ts#SkillRunProjection]]. [[src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar]] exposes retry via existing `hermesAPI.skillRun.retryArtifactDiscovery` and `skillRun.artifactRetry`; it does not own Session Files and does not copy Expert artifact cards. Retry re-enters `listRunArtifacts` and never issues a second `tools/call`.

Live Checkpoint B (Catalog → Submit → Run → Result → Artifact Preview/Save As → Restart, plus the fixture negatives) remains the Roadmap `DONE` bar for RM-05. Fixture and focused tests prove implementation; env-gated live stay skipped unless `SMC_SKILL_RUN_E2E=1`. RM-01 live same-key replay (AC-03) and Catalog→rehydrate (AC-04) are env-gated in the same suite.

## M6b Skill Run activity mapping

Work maps v1.2.1 enumerated `reasoning.summary`, `tool.call`, `clarify.requested`, and `approval.requested` events into sanitized Skill Run activity.

[[src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent]] produces Work-owned [[src/shared/skill-run.ts#SkillRunActivityItem]] items on [[src/shared/skill-run.ts#SkillRunProjection]]. [[src/main/skill-run/skill-run-service.ts#createSkillRunService]] appends a bounded list (cap 32, deduped by contract `event_id`) over the existing projection subscribe path. [[src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar]] renders those items as read-only text under the compact phase row.

`tool.call` copies only `tool_name` / `call_id` / `status`. `clarify.requested` shows the question and string options only; Skill Run does not call Hermes `clarify-respond` or reuse Local Chat `ClarifyCard`. `approval.requested` may set phase `waiting-approval` and shows the summary. M6c adds Allow/Deny on this same compact bar; it does not reuse Local Chat `ClarifyCard` or `MessageRow` approve/deny. Unknown and unmapped control events stay `rawUnknown` and are not textified into transcript or activity.

## M6c Skill Run approval decision

Work posts canonical v1.3.0 Allow/Deny from the existing Skill Run status bar.

[[src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient]] owns `POST /api/v1/runs/{run_id}/approvals/{approval_id}/decision` with Main `X-Idempotency-Key`. [[src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunApprovalDecisionBundle]] requires checksum-complete `contracts/skill-run/v1.3.0`; P0 `REQUIRED_BUNDLE_PATHS` stays unchanged so v1.2.1 can still open Catalog/start. [[src/main/skill-run/skill-run-service.ts#createSkillRunService]] binds the current `approval.requested` `approvalId`, stores a per-approval UUID (never the start `clientRequestId`), and treats a 200 receipt as non-terminal unless Public status is already terminal. Deny follows Public `COMPLETED`/`FAILED`; Work must not rewrite deny as `cancelled`. Cancel remains the existing cancel IPC.

Renderer [[src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar]] shows English Allow and Deny only while `waiting-approval` and the current approval is not yet `decidedApprovalId`. Clicks call `hermesAPI.skillRun.decideApproval({ clientRequestId, sessionId, decision })`. Chat `MessageRow` Local/Hermes approval is unchanged.

## M6d Limited parameter form

Work lifts a fail-closed subset of extra required string fields into callable `limited-parameter-form`.

[[src/main/skill-run/skill-run-contract-parser.ts#classifySkillInvocation]] is still the single classify/bind owner. Chat / form tools with 1–8 extra required `type === "string"` properties besides `promptField` become callable. Main projects `extraStringFields` and re-binds whitelist keys on existing `skillRun.start`. `$ref`, composite schemas, non-string extras, more than eight extras, and `form` tools with no extra required fields stay unsupported. Renderer must not walk `inputSchema` to build `tools/call` arguments.

[[src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel]] selects `callability === "callable"`. [[src/renderer/src/modules/skill-run/SkillSelectionBar.tsx#SkillSelectionBar]] collects the projected extra strings. Chat queues an immutable extra-parameter snapshot.

## M6f Catalog favorites and recent use

Work overlays local **Favorites** and **Recent** on the existing Main Catalog. Identity is Skill Run `toolName`. Display members are preference names intersected with current Catalog `tools`.

Main persists names in `userData/skill-run-catalog-preferences.json`, partitioned with the Gateway Catalog cache key. Favorites cap at 50 and reject new names. Recent cap at 20 and records only Work `skillRun.start` `{ accepted: true }`. Renderer `modules/skill-run` groups those flags on [[src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx#SkillCatalogPanel]]; Chat remains the selection owner. There is no second `tools/list`, no org-recommendation HTTP, and no telemetry JSONL replay.

## M5 production default and telemetry

Repository default feature mode is `skill-first`. `SMC_WORK_SKILL_RUN_MODE` and `userData/skill-run-feature-mode.json` can roll new submits back to `expert-compat` or `local-only` without stopping existing Skill Run or Expert readers.

[[src/main/skill-run/skill-run-telemetry.ts#recordSkillRunTelemetry]] appends allow-listed JSONL events to `userData/logs/skill-run-telemetry.jsonl`: `catalog`, `start`, `accepted`, `reconnect`, `terminal`, `duplicate-prevented`, `artifact`. Events may include feature mode, outcome, errorCode, phase, reconnectAttempt, artifactItemCount, and a SHA-256 prefix of `clientRequestId`. They must never include prompt, tool arguments, JWT, Authorization, backend origin, Result body, download token, absolute path, or Artifact bytes. Telemetry write failures must not change start/cancel/rehydrate. Renderer has no telemetry IPC. There is no hosted metrics dashboard in Work.

## Still Out

The following capabilities remain intentionally outside the current Work slice and require their own Provider Owner delivery or PRD.

- Hosted telemetry dashboard / metrics UI
- Attachment upload
- Legacy `POST /api/v1/runs/{run_id}/approvals/{approval_id}` (Work never calls it)
- Local Chat / Hermes `MessageRow` approve-deny as Skill Run decision
- Unrestricted JSON Schema / `$ref` / non-string parameter widgets
- Org recommendation / curated catalog API

## Cross References

Related architecture docs for Skill Run integration, Expert compatibility, and File Platform artifacts.

- [[skill-run-integration]] — Approved target architecture and roadmap.
- [[expert-execution]] — Expert compatibility client and lifecycle boundaries.
- [[file-platform]] — Managed files and remote artifact transfer subsystem.
