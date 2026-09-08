---
plan_contract: smc.plan.v3.2
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1
grounded_commit: c10ae2fdc9bd7d286d828836c80fcbc2debb6257
grounding_source: working_tree
working_tree_fingerprint: clean
---

# WORK-SKILL-FIRST-LAYOUT-V4.0.1 Checkpoint B Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md)

## Scope

- In: 
  1. 将 Checkpoint A 的 `SkillRunService.start` / `cancel` stub 升级为完整 lifecycle owner（pending-submit、`clientRequestId` 幂等、Accepted `providerRunId`、SSE `Last-Event-ID` 去重、poll 兜底、terminal lock 单调推进、单 Tab 单 active run、queue snapshot 出队不重读 selection）；
  2. 实现 versioned `skill-run` continuation (`DesktopSessionContinuationItem`) 与 session transcript materialize/rehydrate（重启不重复调用 `tools/call`）；
  3. 扩展 File Platform：`ManagedFileRemoteProvider` 加入 `"skill-run"`，数据库新增 `remote_run_id` 并将远端唯一索引迁移为 `(profile_id, provider, remote_run_id, remote_artifact_id)`，新增 `upsertSkillRunRemoteArtifact` 与 `skill-run-artifact-transfer.ts`，在 preview/saveAs/materialize 中实现 provider dispatch；
  4. 扩展 IPC/Preload：在 `window.hermesAPI.skillRun` 增加 `onProjectionChanged`、`getProjection`、`listProjections`、`rehydrateSession`、`retryArtifactDiscovery`，保持无 URL/JWT/raw event 泄露；
  5. 渲染层集成：Chat 接入 accepted projection、rehydrate 恢复、StatusBar 展示状态，并将 Chat Composer 的 abort 替换为调用 `hermesAPI.skillRun.cancel`（禁止误调用本地 `abortChat`）；
  6. Feature mode 枚举对齐 PRD：`skill-first | expert-compat | local-only`；
  7. 12 种语言区域的运行/结果文案接入与 `lat.md` 边界更新。
- Out:
  1. M0 需由 Provider Owner 产出可验证的 tag/checksum，本切片禁止伪造 consumer lock；
  2. 当无 `contracts/skill-run/*/consumer-lock.json` 时，生产 `tools/call` / `GET /api/v1/runs/*` / SSE 保持 fail-closed 门禁（`CONTRACT_UNSUPPORTED` / `START_DISABLED_NO_LOCK`），不发真实外网请求，仅在单测中通过 fake gateway / mock parser 验证全流程；
  3. M5 生产灰度与 telemetry dashboard；
  4. M6 P1（Approval 决策卡、rich events、JSON Schema 表单、附件上传）；
  5. v4.2 Expert 默认入口 REMOVE；
  6. 不修改 `contracts/work-expert/v1.0.2`；不新建第二套 Chat 页面或平行 session DB。
- Production Owner inherited from PRD:
  - 授权传输：Main 共享 `authorized-backend-transport.ts`
  - 运行生命周期：Main `SkillRunService` (唯一生命周期事实源)
  - 契约解析与 Lock 门禁：Main `skill-run-contract-parser.ts` 与 `skill-run-consumer-lock.ts`
  - 会话与 Continuation：现有 Session Continuation Store (`session-continuation-store.ts`)
  - 产物文件：现有 File Platform (`file-association-store.ts`, `file-service.ts`)
  - 页面与提交：`Layout.tsx`、`Chat.tsx`、`modules/skill-run`

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/shared/skill-run.ts` | exists in working_tree | `SkillRunProjection`, `SkillRunContinuationItem`, `SkillRunFeatureMode` | IPC / preload / service / renderer store -> `shared/skill-run.ts` | `shared/expert.ts` | PASS |
| C02 | `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode` | exists in working_tree | resolved | `skill-run-service.ts` / IPC -> `feature-mode-store.ts` | `feature-mode-store.ts` | PASS |
| C03 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts` | absent at `grounded_commit` | `hasSkillRunConsumerLock` | `skill-run-gateway-client.ts` / `skill-run-service.ts` -> lock reader | `expert-consumer-lock.test.ts` | PASS |
| C04 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts` | absent at `grounded_commit` | `parseSkillRunEvent`, `parseSkillRunSnapshot` | `skill-run-gateway-client.ts` / `skill-run-service.ts` -> parser | `run-stream.ts#parseRunSseBlock` | PASS |
| C05 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | exists in working_tree | resolved | `skill-run-service.ts` -> `createSkillRunGatewayClient` -> `authorized-backend-transport.ts` | `expert-gateway-client.ts` | PASS |
| C06 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | exists in working_tree | resolved | `skill-run-ipc.ts` -> `createSkillRunService` -> `skill-run-gateway-client.ts` | `expert-run-service.ts#createExpertRunService` | PASS |
| C07 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | exists in working_tree | test suite | vitest runner -> `skill-run-service.test.ts` | `skill-run-service.test.ts` | PASS |
| C08 | `apps/work/src/main/skill-run/skill-run-continuation.ts` | absent at `grounded_commit` | `projectionToSkillRunContinuationItem`, `rehydrateSkillRunContinuationsForSession` | `skill-run-service.ts` / `skill-run-ipc.ts` -> continuation persistence | `expert-continuation.ts` | PASS |
| C09 | `apps/work/src/shared/session-continuation.ts#DesktopSessionContinuationItem` | exists at `grounded_commit` | resolved | `session-continuation-store.ts` -> `DesktopSessionContinuationItem` | `session-continuation.ts` | PASS |
| C10 | `apps/work/src/main/session-continuation-store.ts#normalizeContinuationItems` | exists at `grounded_commit` | resolved | session rehydration -> `normalizeContinuationItems` | `session-continuation-store.ts` | PASS |
| C11 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts` | absent at `grounded_commit` | `materializeSkillRunSessionTranscript` | `skill-run-service.ts` / `skill-run-ipc.ts` -> transcript upsert | `expert-session-materialize.ts` | PASS |
| C12 | `apps/work/tests/session-continuation-store.test.ts` | exists at `grounded_commit` | test suite | vitest runner -> `session-continuation-store.test.ts` | `session-continuation-store.test.ts` | PASS |
| C13 | `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc` | exists in working_tree | resolved | `start.ts` -> `registerSkillRunIpc` -> forwarder/handlers | `expert-ipc.ts` | PASS |
| C14 | `apps/work/src/preload/skill-run-api.ts#createSkillRunApi` | exists in working_tree | resolved | `preload/index.ts` -> `createSkillRunApi` | `preload/expert-api.ts` | PASS |
| C15 | `apps/work/src/shared/files/managed-file.ts#ManagedFileRemoteProvider` | exists at `grounded_commit` | resolved | `file-association-store.ts` / `file-service.ts` -> `ManagedFileRemoteProvider` | `managed-file.ts` | PASS |
| C16 | `apps/work/src/main/files/file-association-store.ts#ensureRemoteIdentityIndex` | exists at `grounded_commit` | resolved | `file-association-store.ts` -> migration / `findByRemoteIdentity` | `file-association-store.ts` | PASS |
| C17 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts` | absent at `grounded_commit` | `upsertSkillRunRemoteArtifact` | `skill-run-service.ts` -> `upsertSkillRunRemoteArtifact` -> `file-association-store.ts` | `upsert-expert-remote-artifact.ts` | PASS |
| C18 | `apps/work/src/main/files/skill-run-artifact-transfer.ts` | absent at `grounded_commit` | `streamSkillRunArtifactBytes`, `resolveSkillPreviewCachePath` | `file-preview-service.ts` / `file-service.ts` -> `skill-run-artifact-transfer.ts` | `expert-artifact-transfer.ts` | PASS |
| C19 | `apps/work/src/main/files/file-preview-service.ts#getRemotePreviewDescriptor` | exists at `grounded_commit` | resolved | IPC preview -> `getRemotePreviewDescriptor` -> provider dispatch | `file-preview-service.ts` | PASS |
| C20 | `apps/work/src/main/files/expert-artifact-transfer.ts#resolvePreviewCachePath` | exists at `grounded_commit` | resolved | Preview cache resolution | `expert-artifact-transfer.ts` | PASS |
| C21 | `apps/work/src/main/files/file-association-store.test.ts` | exists at `grounded_commit` | test suite | vitest runner -> `file-association-store.test.ts` | `file-association-store.test.ts` | PASS |
| C22 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | exists in working_tree | resolved | Renderer Chat projection listener / abort handling | `Chat.tsx` | PASS |
| C23 | `apps/work/src/renderer/src/modules/skill-run/store.ts` | exists in working_tree | `upsertSkillRunProjection`, `getSkillRunProjection` | `Chat.tsx` / `SkillRunStatusBar.tsx` -> `store.ts` | `modules/expert/store.ts` | PASS |
| C24 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | absent at `grounded_commit` | `SkillRunStatusBar` | `Chat.tsx` -> `<SkillRunStatusBar />` | `modules/expert/ExpertTaskStatusBar.tsx` | PASS |
| C25 | `apps/work/src/shared/i18n/locales/en/skillRun.ts` | exists in working_tree | i18n dictionary | `shared/i18n/index.ts` -> `skillRun` namespace | `shared/i18n/locales/en/skillRun.ts` | PASS |
| C26 | `apps/work/lat.md/skill-run.md` | exists in working_tree | doc file | `lat.md/lat.md` -> `skill-run.md` | `lat.md/skill-run.md` | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Layout 显示一级“使用技能”；空白 scratch 原地切 mode，已有内容时创建/激活独立 Skill Tab，不取消其它运行。 | BEHAVIOR | - | - | V05 | UNIT | yes |
| AC-02 | AC | View 不新增 Skill Chat 页面；现有 Chat/MessageList/ChatInput 被复用。 | BEHAVIOR | C22 | T6 | V04 | UNIT | yes |
| AC-03 | AC | ChatRun 只拥有 execution mode；Skill selection truth 在当前 Chat 中唯一，提交/排队保存不可变 snapshot。 | BEHAVIOR | C22 | T6 | V04 | UNIT | yes |
| AC-04 | AC | 未选择 Skill 时展示 Catalog 并禁用发送；选择后展示 Selection Bar；全部错误/空状态可恢复。 | BEHAVIOR | C23, C24 | T6 | V04 | UNIT | yes |
| AC-05 | AC | Skill mode 不渲染本地模型、Reasoning、Fast Mode、Context Folder 或 Expert 控件；附件未合同化时明确禁用。 | BEHAVIOR | C22 | T6 | V04 | UNIT | yes |
| AC-06 | AC | Catalog 只显示合同可证明为 Skill 的项；缺少 discriminator 时显示 contract unsupported，而不是猜测过滤。 | CONTRACT | C03, C05 | T1, T2 | V01 | UNIT | yes |
| AC-07 | AC | Work 锁定带 tag/checksum 的完整 Skill Run Consumer Contract；旧 work-expert lock 不变。 | CONTRACT | C03, C05 | T1, T2 | V01, V05 | UNIT | yes |
| AC-08 | AC | 新调用只使用 toolname 与 runid，不发送 Expert/Agent/Runtime/Profile/Workspace routing 字段。 | CONTRACT | C01, C05, C06 | T1, T2 | V01 | UNIT | yes |
| AC-09 | AC | Provider runid、Renderer ChatRun.runId 与 clientRequestId 在类型、持久化和日志中不可互换。 | CONTRACT | C01, C08, C13 | T1, T3, T4 | V01, V02 | UNIT | yes |
| AC-10 | AC | Renderer 无法取得 JWT、Backend/Agent URL、raw Provider event、download token 或 absolute path。 | SECURITY | C01, C13, C14 | T1, T4 | V01, V06 | UNIT | yes |
| AC-11 | AC | Main 是唯一 Skill Run lifecycle owner；Renderer store 仅为 projection。 | LIFECYCLE | C06, C13, C23 | T2, T4, T6 | V01 | UNIT | yes |
| AC-12 | AC | 不确定网络与 App 重启使用同一 idempotency identity 恢复，跨端证明只创建一个 Provider Run。 | NEGATIVE | C06, C08, C10 | T2, T3 | V01, V02 | UNIT | yes |
| AC-13 | AC | SSE replay 去重、terminal 单调、poll fallback 和 cleanup 可验证；旧事件不能回退终态。 | NEGATIVE | C04, C06 | T1, T2 | V01 | UNIT | yes |
| AC-14 | AC | 同一 Chat Tab 至多一个 active Skill Run；queue item 不因用户更换 Skill 而改路由。 | BEHAVIOR | C06, C22 | T2, T6 | V01, V04 | UNIT | yes |
| AC-15 | AC | 取消只调用 Skill Run cancel；不得误调用 Local Chat abort。Approval 未合同化时只读等待，不显示伪交互。 | BEHAVIOR | C06, C22 | T2, T6 | V01, V04 | UNIT | yes |
| AC-16 | AC | 只有合同枚举事件可产生 activity UI；unknown payload 不文本化、不触发不可逆 UI side effect。 | NEGATIVE | C04, C06 | T1, T2 | V01 | UNIT | yes |
| AC-17 | AC | Result 更新同一 assistant transcript；restart 后 session mode、在途 projection 与历史可恢复且不重复 start。 | NEGATIVE | C08, C10, C11 | T3 | V02 | UNIT | yes |
| AC-18 | AC | Artifact 进入现有 File Platform，以 run-scoped remote identity 去重，并通过现有 Preview/Save As/Materialize API 使用。 | NEGATIVE | C15, C16, C17, C18, C19, C20 | T5 | V03 | UNIT | yes |
| AC-19 | AC | 不得新增 Skill conversation/file parallel SoT 或直接 Artifact download IPC。 | SECURITY | C13, C15, C16 | T4, T5 | V03, V06 | UNIT | yes |
| AC-20 | AC | Skill-first、Expert compatibility 与 Local Chat 路径显式互斥；一条消息不会同时创建 Skill Run 与 ExpertTask。 | BEHAVIOR | C02, C06, C22 | T1, T2, T6 | V01, V04 | UNIT | yes |
| AC-21 | AC | Skill-first 失败不自动 fallback；回滚停止新建但保留 Skill/Expert 各自 reader。 | BEHAVIOR | C02, C06, C22 | T1, T2, T6 | V01, V04 | UNIT | yes |
| AC-22 | AC | Expert 默认创建入口的最终删除满足 Compatibility Contract，并由独立 Removal PRD 执行。 | SCOPE | C02, C06, C15 | T1, T2, T5 | V01, V03 | UNIT | yes |
| DOD-01 | DOD | Provider Contract Gate 与 Work Consumer Lock 就绪，无未验证 schema。 | CONTRACT | C03, C04, C05 | T1, T2 | V01 | UNIT | yes |
| DOD-02 | DOD | Contract、Main、IPC、Renderer 与 Session 聚焦测试全部通过，无回归。 | EVIDENCE | C06, C08, C10, C16, C21 | T2, T3, T5 | V01, V02, V03, V05, V06 | UNIT | yes |
| DOD-03 | DOD | 生产切换前通过完整 Checklist，历史任务可独立恢复且无 silent fallback。 | OPERATIONS | C02, C06, C08, C10 | T1, T2, T3 | V01, V02 | UNIT | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Skill Run Execution | AC-11, AC-12, AC-13, AC-14, AC-20 | Chat submit `skillRun.start` | `pending-submit` -> `starting` -> `running` -> `waiting-approval` | `SkillRunService` (Main) | `SkillRunService` (Main) | V01 |
| Pending Submit Persistence | AC-12, AC-17 | Main starts `tools/call` flow | `pending-submit` | `upsertSkillRunContinuationProjection` (Main) | `upsertSkillRunContinuationProjection` (Main) | V02 |
| App Restart Rehydration | AC-12, AC-17 | Chat mounts & calls `rehydrateSession` | `starting` / `running` / `waiting-approval` | `rehydrateSkillRunContinuationsForSession` (Main) | `SkillRunService` (Main) | V02 |
| Skill Run Cancellation | AC-15 | User clicks Stop/Cancel in Chat | `cancelling` | `SkillRunService.cancel` (Main) | `SkillRunService.cancel` (Main) | V01 |
| Artifact Discovery | AC-18, AC-19 | Run reaches terminal `succeeded` | `discovering-artifacts` | `upsertSkillRunRemoteArtifact` (Main) | `SkillRunService` (Main) | V03 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Skill Run Start Request | AC-08, AC-09, AC-10, AC-11, AC-12 | Renderer `Chat.tsx` | IPC `skill-run:start` -> `SkillRunStartInput` | Main `SkillRunService` | `toolName`, `prompt`, `clientRequestId`, `sessionId`, `profileId` | Main `skill-run-ipc.ts#assertSender` & validator | `START_DISABLED_NO_LOCK`, `UNAUTHORIZED`, `INVALID_INPUT` | `clientRequestId` | V01 |
| Provider `tools/call` HTTP | AC-08, AC-12 | Main `SkillRunGatewayClient` | HTTP `POST /api/v1/mcp` (`X-Idempotency-Key`) | Backend MCP handler | `name`, `arguments`, `idempotencyKey` | `SkillRunGatewayClient` / `AuthorizedBackendTransport` | 401/403 -> UNAUTHORIZED, 5xx -> BACKEND_UNAVAILABLE | `clientRequestId` | V01 |
| Event Stream / Polling | AC-13, AC-16 | Backend SSE / runs endpoint | SSE block / JSON snapshot | Main `SkillRunService` | `event`, `data`, `id` / `run_id`, `status` | Main `skill-run-contract-parser.ts` | Invalid/Unknown -> fail-soft log, connection drop -> exponential retry | `lastEventId`, `providerRunId` | V01 |
| Sanitized Projection Broadcast | AC-10, AC-11, AC-14, AC-15 | Main `SkillRunService` | IPC `skill-run:projection-changed` | Renderer `store.ts` & `Chat.tsx` | `clientRequestId`, `providerRunId`, `phase`, `displayStage`, `text` | Main `skill-run-ipc.ts` forwarder | IPC failure -> console warn | `clientRequestId` | V01, V04 |
| Continuation Storage | AC-12, AC-17 | Main `SkillRunService` | SQLite `desktop_session_continuations` | Main Continuation Store | `kind="skill-run"`, `schemaVersion=1`, `toolName`, `clientRequestId` | `session-continuation-store.ts#normalizeContinuationItems` | Malformed row -> dropped without crash | `clientRequestId` | V02 |
| Artifact Metadata Registration | AC-18, AC-19 | Main `SkillRunService` | SQLite `managed_files` & `file_associations` | File Platform Services | `provider="skill-run"`, `remoteRunId`, `remoteArtifactId` | `file-association-store.ts#findByRemoteIdentity` | SQL collision -> safe dedupe | `(profile, provider, remoteRunId, remoteArtifactId)` | V03 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Output | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `npm test -- src/main/skill-run/skill-run-service.test.ts` | `SkillRunService` handles start/cancel/SSE/poll/lock gate deterministically | Zero network requests when lock is absent; terminal state lock prevents replay regressions | `artifacts/work-v4.0.1-checkpoint-b/v01-service.log` | local node | yes |
| V02 | UNIT | `npm test -- tests/session-continuation-store.test.ts` | `normalizeContinuationItems` correctly normalizes `skill-run` item with or without `providerRunId` | Expert continuations continue to pass with 0 regressions | `artifacts/work-v4.0.1-checkpoint-b/v02-continuation.log` | local node | yes |
| V03 | UNIT | `npm test -- src/main/files/file-association-store.test.ts` | Remote identity index incorporates `remote_run_id`; two runs sharing artifact id do not collide | Legacy Expert records remain readable and unaffected | `artifacts/work-v4.0.1-checkpoint-b/v03-files.log` | local node | yes |
| V04 | UNIT | `npm test -- src/renderer/src/screens/Chat/Chat.layout.test.tsx` | Chat renders status bar for active skill run and replaces local abort with skill cancel | Local chat tabs remain isolated from skill cancellation | `artifacts/work-v4.0.1-checkpoint-b/v04-chat.log` | local node (jsdom) | yes |
| V05 | UNIT | `npm test -- src/main/expert/expert-gateway-client.test.ts` | Expert subsystem and transport regressions remain at 0 | Retry and token refresh logic remain green | `artifacts/work-v4.0.1-checkpoint-b/v05-expert.log` | local node | yes |
| V06 | BUILD | `npm run typecheck && npm run typecheck:web && npm run guard` | TypeScript and architecture guards pass cleanly across main, preload and renderer | No circular dependencies or type mismatches | `artifacts/work-v4.0.1-checkpoint-b/v06-build.log` | local node | yes |

## Immediate Read

- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/shared/skill-run.ts`
- `apps/work/src/main/expert/expert-run-service.ts#createExpertRunService`
- `apps/work/src/main/files/file-association-store.ts#ensureRemoteIdentityIndex`

## Triggered Read

- If lock verification is updated: `apps/work/src/main/expert/expert-consumer-lock.test.ts`
- If SSE block parsing needs adjustment: `apps/work/src/main/run-stream.ts#parseRunSseBlock`
- If preview cache key collides: `apps/work/src/main/files/expert-artifact-transfer.ts#resolvePreviewCachePath`
- Otherwise: do not read

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/shared/skill-run.ts` | PROD | MODIFY | `shared/skill-run.ts` | T1 | Add `SkillRunProjection`, `SkillRunContinuationItem`, update `SkillRunFeatureMode` | Skill Run IPC / Preload | no |
| C02 | `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode` | PROD | MODIFY | `feature-mode-store.ts` | T1 | Replace `skill-only` with `local-only` | Expert compatibility | no |
| C03 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts` | PROD | ADD | - | T1 | Consumer lock reader helper returning false when no lock file | Skill Catalog / call client | yes |
| C04 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts` | PROD | ADD | - | T1 | Discriminator & event parser (fail-soft on unknown events) | Provider event parsing | yes |
| C05 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | PROD | MODIFY | `skill-run-gateway-client.ts` | T2 | Implement `callSkill`, `getRunSnapshot`, `cancelRun`, `listRunArtifacts` with lock gates | Skill Catalog / call client | no |
| C06 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | `skill-run-service.ts` | T2 | Full lifecycle owner: pending-submit, idempotency, SSE stream, poll fallback, terminal lock | Skill Run lifecycle | no |
| C07 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | `skill-run-service.test.ts` | T2 | Comprehensive test suite for lifecycle, lock gate and cancel | Skill Run lifecycle | no |
| C08 | `apps/work/src/main/skill-run/skill-run-continuation.ts` | PROD | ADD | - | T3 | Projection to continuation mapping and rehydrate logic | Session persistence | yes |
| C09 | `apps/work/src/shared/session-continuation.ts#DesktopSessionContinuationItem` | PROD | MODIFY | `session-continuation.ts` | T3 | Add `SkillRunContinuationItem` to union | Session persistence | no |
| C10 | `apps/work/src/main/session-continuation-store.ts#normalizeContinuationItems` | PROD | MODIFY | `session-continuation-store.ts` | T3 | Parse and validate `skill-run` continuation items safely | Session persistence | no |
| C11 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts` | PROD | ADD | - | T3 | Upsert assistant transcript bubbles on terminal status | Session persistence | yes |
| C12 | `apps/work/tests/session-continuation-store.test.ts` | TEST | MODIFY | `session-continuation-store.test.ts` | T3 | Add tests for `skill-run` continuation normalization | Session persistence | no |
| C13 | `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc` | PROD | MODIFY | `skill-run-ipc.ts` | T4 | Add projection event push, `rehydrateSession`, `retryArtifactDiscovery` | Skill Run IPC / Preload | no |
| C14 | `apps/work/src/preload/skill-run-api.ts#createSkillRunApi` | PROD | MODIFY | `preload/skill-run-api.ts` | T4 | Expose projection subscription, rehydrate, and retry artifact APIs | Skill Run IPC / Preload | no |
| C15 | `apps/work/src/shared/files/managed-file.ts#ManagedFileRemoteProvider` | PROD | MODIFY | `managed-file.ts` | T5 | Add `"skill-run"` to provider union and add `remoteRunId?` field | Skill Artifact | no |
| C16 | `apps/work/src/main/files/file-association-store.ts#ensureRemoteIdentityIndex` | PROD | MODIFY | `file-association-store.ts` | T5 | Add `remote_run_id` column, migrate unique index to 4-tuple, update `findByRemoteIdentity` | Skill Artifact | no |
| C17 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts` | PROD | ADD | - | T5 | Upsert skill-run artifact metadata and session association | Skill Artifact | yes |
| C18 | `apps/work/src/main/files/skill-run-artifact-transfer.ts` | PROD | ADD | - | T5 | Download skill-run artifact bytes with size/checksum gates and preview cache | Skill Artifact | yes |
| C19 | `apps/work/src/main/files/file-preview-service.ts#getRemotePreviewDescriptor` | PROD | MODIFY | `file-preview-service.ts` | T5 | Dispatch remote preview and saveAs according to `file.provider` | Skill Artifact | no |
| C20 | `apps/work/src/main/files/expert-artifact-transfer.ts#resolvePreviewCachePath` | PROD | MODIFY | `expert-artifact-transfer.ts` | T5 | Incorporate remote run id in preview cache key | Skill Artifact | no |
| C21 | `apps/work/src/main/files/file-association-store.test.ts` | TEST | MODIFY | `file-association-store.test.ts` | T5 | Add tests for 4-tuple unique index and deduplication across distinct runs | Skill Artifact | no |
| C22 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | PROD | MODIFY | `Chat.tsx` | T6 | Integrate active projection, render status bar, route abort to `skillRun.cancel` | Chat 选择与提交路由 | no |
| C23 | `apps/work/src/renderer/src/modules/skill-run/store.ts` | PROD | MODIFY | `modules/skill-run/store.ts` | T6 | Manage projection map and active run listeners in renderer store | Renderer projection | no |
| C24 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | PROD | ADD | - | T6 | Compact status bar showing running phase, waiting approval, or result | Run activity presentation | yes |
| C25 | `apps/work/src/shared/i18n/locales/en/skillRun.ts` | PROD | MODIFY | `shared/i18n/locales/en/skillRun.ts` | T7 | Add status, result, and cancellation i18n keys for all 12 locales | Layout 一级“使用技能”入口 | no |
| C26 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | `lat.md/skill-run.md` | T8 | Update architecture docs with Checkpoint B lifecycle and file boundaries | Layout 一级“使用技能”入口 | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `apps/work/src/shared/skill-run.ts` | Extends existing Checkpoint A DTO file with projection, continuation and channel types without creating duplicate schemas |
| C02 | MODIFY_EXISTING | `apps/work/src/main/skill-run/feature-mode-store.ts` | Corrects mode union from `skill-only` to PRD `local-only` in the single feature mode store |
| C03 | MINIMAL_NEW | `apps/work/src/main/expert/expert-consumer-lock.test.ts` | Dedicated lock inspector keeps Skill Run lock status independent of Expert lock |
| C04 | MINIMAL_NEW | `apps/work/src/main/run-stream.ts#parseRunSseBlock` | Parser encapsulates event validation and DTO mapping cleanly; unknown events fail-soft |
| C05 | MODIFY_EXISTING | `apps/work/src/main/skill-run/skill-run-gateway-client.ts` | Extends existing gateway client to support call, cancel, snapshot and SSE stream using shared transport |
| C06 | MODIFY_EXISTING | `apps/work/src/main/skill-run/skill-run-service.ts` | Replaces Checkpoint A stubs with full Map-based lifecycle coordinator modeled after `expert-run-service.ts` |
| C07 | MODIFY_EXISTING | `apps/work/src/main/skill-run/skill-run-service.test.ts` | Updates existing test suite to verify pending-submit, SSE events, polling fallback, terminal lock and cancel |
| C08 | MINIMAL_NEW | `apps/work/src/main/expert/expert-continuation.ts` | Standalone continuation helper prevents polluting expert continuation logic |
| C09 | MODIFY_EXISTING | `apps/work/src/shared/session-continuation.ts` | Adds `SkillRunContinuationItem` to the canonical union |
| C10 | MODIFY_EXISTING | `apps/work/src/main/session-continuation-store.ts#normalizeContinuationItems` | Adds normalization logic for `kind: "skill-run"` without breaking existing items |
| C11 | MINIMAL_NEW | `apps/work/src/main/expert/expert-session-materialize.ts` | Dedicated transcript materializer maps skill-run result to assistant message |
| C12 | MODIFY_EXISTING | `apps/work/tests/session-continuation-store.test.ts` | Adds round-trip persistence tests for skill-run continuation items |
| C13 | MODIFY_EXISTING | `apps/work/src/main/skill-run/skill-run-ipc.ts` | Extends IPC handlers for projection subscription, rehydration, and artifact retry |
| C14 | MODIFY_EXISTING | `apps/work/src/preload/skill-run-api.ts` | Exposes extended IPC methods to renderer under `window.hermesAPI.skillRun` |
| C15 | MODIFY_EXISTING | `apps/work/src/shared/files/managed-file.ts` | Extends `ManagedFileRemoteProvider` to include `"skill-run"` and adds `remoteRunId?` |
| C16 | MODIFY_EXISTING | `apps/work/src/main/files/file-association-store.ts` | Adds `remote_run_id` column, updates index to 4-tuple and adapts `findByRemoteIdentity` |
| C17 | MINIMAL_NEW | `apps/work/src/main/files/upsert-expert-remote-artifact.ts` | Skill Run artifact upsert follows established pattern with `(profile, provider, remoteRunId, remoteArtifactId)` |
| C18 | MINIMAL_NEW | `apps/work/src/main/files/expert-artifact-transfer.ts` | Dedicated byte streaming client for Skill Run artifacts prevents coupling with Expert client |
| C19 | MODIFY_EXISTING | `apps/work/src/main/files/file-preview-service.ts` | Dispatches preview and saveAs requests based on `file.provider` (`"expert"` vs `"skill-run"`) |
| C20 | MODIFY_EXISTING | `apps/work/src/main/files/expert-artifact-transfer.ts` | Enhances preview cache key to include run id to prevent cross-run collisions |
| C21 | MODIFY_EXISTING | `apps/work/src/main/files/file-association-store.test.ts` | Tests 4-tuple uniqueness constraint and duplicate artifact handling |
| C22 | MODIFY_EXISTING | `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | Subscribes to skill run projections, rehydrates on mount, and ensures abort invokes `skillRun.cancel` |
| C23 | MODIFY_EXISTING | `apps/work/src/renderer/src/modules/skill-run/store.ts` | Caches active projections in memory for reactive rendering |
| C24 | MINIMAL_NEW | `apps/work/src/renderer/src/modules/expert/ExpertTaskStatusBar.tsx` | Compact status bar component rendering running, waiting-approval, error, or result states |
| C25 | MODIFY_EXISTING | `apps/work/src/shared/i18n/locales/en/skillRun.ts` | Adds i18n keys for status bar, results, approval, and cancellation |
| C26 | MODIFY_EXISTING | `apps/work/lat.md/skill-run.md` | Documents Checkpoint B lifecycle, continuation, and file platform integration |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01<br>C02<br>C03<br>C04 | `apps/work/src/shared/skill-run.ts`<br>`apps/work/src/main/skill-run/feature-mode-store.ts`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.ts`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts` | - | - | no |
| T2 | C05<br>C06<br>C07 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts`<br>`apps/work/src/main/skill-run/skill-run-service.ts`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts` | `apps/work/src/shared/skill-run.ts`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.ts`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts` | T1 | no |
| T3 | C08<br>C09<br>C10<br>C11<br>C12 | `apps/work/src/main/skill-run/skill-run-continuation.ts`<br>`apps/work/src/shared/session-continuation.ts`<br>`apps/work/src/main/session-continuation-store.ts`<br>`apps/work/src/main/skill-run/skill-run-session-materialize.ts`<br>`apps/work/tests/session-continuation-store.test.ts` | `apps/work/src/shared/skill-run.ts` | T1 | no |
| T4 | C13<br>C14 | `apps/work/src/main/skill-run/skill-run-ipc.ts`<br>`apps/work/src/preload/skill-run-api.ts`<br>`apps/work/src/preload/index.d.ts` | `apps/work/src/main/skill-run/skill-run-service.ts`<br>`apps/work/src/main/skill-run/skill-run-continuation.ts` | T2, T3 | no |
| T5 | C15<br>C16<br>C17<br>C18<br>C19<br>C20<br>C21 | `apps/work/src/shared/files/managed-file.ts`<br>`apps/work/src/main/files/file-association-store.ts`<br>`apps/work/src/main/files/upsert-skill-run-remote-artifact.ts`<br>`apps/work/src/main/files/skill-run-artifact-transfer.ts`<br>`apps/work/src/main/files/file-preview-service.ts`<br>`apps/work/src/main/files/file-service.ts`<br>`apps/work/src/main/files/expert-artifact-transfer.ts`<br>`apps/work/src/main/files/file-association-store.test.ts` | `apps/work/src/shared/skill-run.ts` | T1 | yes |
| T6 | C22<br>C23<br>C24 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx`<br>`apps/work/src/renderer/src/modules/skill-run/store.ts`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx`<br>`apps/work/src/renderer/src/modules/skill-run/index.ts` | `apps/work/src/preload/skill-run-api.ts` | T4 | no |
| T7 | C25 | `apps/work/src/shared/i18n/locales/en/skillRun.ts`<br>`apps/work/src/shared/i18n/locales/zh-CN/skillRun.ts`<br>`apps/work/src/shared/i18n/index.ts` | - | T1 | no |
| T8 | C26 | `apps/work/lat.md/skill-run.md`<br>`apps/work/lat.md/lat.md` | - | T2, T5, T6 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/shared/skill-run.ts` | T1 | Core DTOs and IPC channel types |
| `apps/work/src/main/session-continuation-store.ts` | T3 | Continuation normalization and SQLite persistence |
| `apps/work/src/main/skill-run/skill-run-ipc.ts` | T4 | Main process IPC handler registration |
| `apps/work/src/preload/index.d.ts` | T4 | Global `window.hermesAPI` interface definition |
| `apps/work/src/main/files/file-association-store.ts` | T5 | SQLite schema migrations and unique identity index |
| `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | T6 | Chat lifecycle and user action handling |
| `apps/work/src/shared/i18n/index.ts` | T7 | Unified i18n locale registry |

## Generated Outputs Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C03 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts` | Manages checksum lock validation for Skill Run without modifying Expert lock reader | Single owner for Skill Run lock check |
| C04 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts` | Implements dedicated event parser and discriminator for Skill Run DTOs | Single owner for wire event parsing |
| C08 | `apps/work/src/main/skill-run/skill-run-continuation.ts` | Converts Skill Run projection to continuation format without polluting Expert continuation module | Single owner for Skill Run continuation conversion |
| C11 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts` | Materializes Skill Run assistant bubbles to transcript | Single owner for transcript generation |
| C17 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts` | Upserts remote artifacts with 4-tuple identity into ManagedFiles | Single owner for Skill Run artifact registration |
| C18 | `apps/work/src/main/files/skill-run-artifact-transfer.ts` | Streams artifact bytes with sha256/size gates for Skill Run artifacts | Single owner for Skill Run artifact network transfer |
| C24 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | UI status bar displaying active phase, waiting approval, or result summary | Presentation component |

## Todo T1 — DTOs, Feature Mode, Lock Reader & Contract Parser

**Owns Changes**
- C01
- C02
- C03
- C04

**Goal**
Define Skill Run projection types, continuation shapes, IPC channels, align feature modes to PRD (`skill-first | expert-compat | local-only`), implement consumer lock reader (failing closed when lock is absent), and implement the event parser.

**Immediate anchors**
- `apps/work/src/shared/skill-run.ts`
- `apps/work/src/main/skill-run/feature-mode-store.ts`

**Changes**
- In `shared/skill-run.ts`, declare `SkillRunProjection`, `SkillRunLocalPhase` (`"pending-submit" | "starting" | "running" | "waiting-approval" | "succeeded" | "failed" | "cancelled" | "expired" | "unauthorized"`), `SkillRunContinuationItem`, `SkillRunArtifactDescriptor`, and extended `SKILL_RUN_IPC_CHANNELS`.
- In `feature-mode-store.ts`, update valid modes to `["expert-compat", "skill-first", "local-only"]` and migrate existing stored data.
- Create `skill-run-consumer-lock.ts` exporting `hasSkillRunConsumerLock(): boolean` (checking for `contracts/skill-run/*/consumer-lock.json`).
- Create `skill-run-contract-parser.ts` exporting `parseSkillRunEvent` and `parseSkillRunSnapshot` (fail-soft on unknown events).

**Stop conditions**
- [ ] `hasSkillRunConsumerLock()` returns `false` in current workspace.
- [ ] Typecheck passes for `shared/skill-run.ts`.

**Triggered reads**
- None

## Todo T2 — Gateway Client, Service Lifecycle & Unit Tests

**Owns Changes**
- C05
- C06
- C07

**Goal**
Implement complete lifecycle coordinator in `SkillRunService`: Map-based run state, pending-submit, `clientRequestId` idempotency, SSE stream with `Last-Event-ID`, polling fallback, terminal lock, and fail-closed gates when lock is missing.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts`
- `apps/work/src/main/skill-run/skill-run-service.ts`

**Changes**
- In `skill-run-gateway-client.ts`, add `callSkill`, `getRunSnapshot`, `cancelRun`, `listRunArtifacts`. Gate `tools/call` and `/runs/*` behind `hasSkillRunConsumerLock()`.
- In `skill-run-service.ts`, implement full `ActiveRun` tracking, `start` (refusing execution if lock is absent with `START_DISABLED_NO_LOCK`), `cancel`, `getProjection`, `listProjections`, `subscribe`, SSE consumption with auto-retry and poll fallback.
- In `skill-run-service.test.ts`, write comprehensive unit tests with mock gateway/parser verifying:
  1. Lock absent -> `start` immediately fails closed with zero network calls;
  2. With mock gateway -> pending-submit -> starting -> running -> succeeded flow;
  3. Terminal state cannot be downgraded by delayed SSE events;
  4. Same `clientRequestId` returns existing in-flight run (idempotency);
  5. `cancel` updates state and triggers gateway abort.

**Stop conditions**
- [ ] `npm test -- src/main/skill-run/skill-run-service.test.ts` passes 100%.

**Triggered reads**
- If SSE reconnection needs adjustment: `apps/work/src/main/expert/expert-run-service.ts`

## Todo T3 — Session Continuation & Transcript Materialization

**Owns Changes**
- C08
- C09
- C10
- C11
- C12

**Goal**
Enable crash-safe session continuation for `skill-run` items (supporting `providerRunId: null` during `pending-submit`), normalize items without schema errors, and materialize assistant transcripts upon terminal success.

**Immediate anchors**
- `apps/work/src/shared/session-continuation.ts`
- `apps/work/src/main/session-continuation-store.ts`

**Changes**
- Create `skill-run-continuation.ts` exporting `projectionToSkillRunContinuationItem`, `upsertSkillRunContinuationProjection`, `rehydrateSkillRunContinuationsForSession`.
- In `shared/session-continuation.ts`, add `SkillRunContinuationItem` to `DesktopSessionContinuationItem`.
- In `session-continuation-store.ts#normalizeContinuationItems`, add handler for `kind === "skill-run"` (validating schemaVersion: 1, toolName, clientRequestId, sessionId, phase).
- Create `skill-run-session-materialize.ts` exporting `materializeSkillRunSessionTranscript`.
- In `tests/session-continuation-store.test.ts`, add test cases for `skill-run` continuation persistence and rehydration.

**Stop conditions**
- [ ] `npm test -- tests/session-continuation-store.test.ts` passes with both Expert and Skill Run tests green.

**Triggered reads**
- None

## Todo T4 — IPC Registration & Preload Bridge

**Owns Changes**
- C13
- C14

**Goal**
Register extended IPC handlers in `skill-run-ipc.ts` with sender verification, error sanitization, and forward projection updates to renderer windows.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-ipc.ts`
- `apps/work/src/preload/skill-run-api.ts`
- `apps/work/src/preload/index.d.ts`

**Changes**
- In `skill-run-ipc.ts`, register `onProjectionChanged` forwarder, `skill-run:get-projection`, `skill-run:list-projections`, `skill-run:rehydrate-session`, `skill-run:retry-artifact-discovery`.
- In `preload/skill-run-api.ts`, expose corresponding typed methods under `window.hermesAPI.skillRun`.
- Update `preload/index.d.ts` typings.

**Stop conditions**
- [ ] `npm run check:work-renderer-contract` passes (or TypeScript compilation passes for preload).

**Triggered reads**
- None

## Todo T5 — File Platform Remote Identity & Artifact Transfer

**Owns Changes**
- C15
- C16
- C17
- C18
- C19
- C20
- C21

**Goal**
Migrate ManagedFile remote identity index to `(profile_id, provider, remote_run_id, remote_artifact_id)`, implement skill artifact upsert, byte streaming transfer, and preview cache keying with run id.

**Immediate anchors**
- `apps/work/src/shared/files/managed-file.ts`
- `apps/work/src/main/files/file-association-store.ts`

**Changes**
- In `shared/files/managed-file.ts`, update `ManagedFileRemoteProvider = "expert" | "skill-run"` and add `remoteRunId?: string`.
- In `file-association-store.ts`:
  1. Add `remote_run_id` column migration in `ensureManagedFileRemoteColumns`;
  2. Update `ensureRemoteIdentityIndex` to `UNIQUE(profile_id, provider, remote_run_id, remote_artifact_id)`;
  3. Update `findByRemoteIdentity` to accept `remoteRunId?: string`;
  4. Update `rowToManagedFile` and `upsertManagedFile` to handle `remote_run_id`.
- Create `upsert-skill-run-remote-artifact.ts` exporting `upsertSkillRunRemoteArtifact`.
- Create `skill-run-artifact-transfer.ts` exporting `streamSkillRunArtifactBytes`.
- In `expert-artifact-transfer.ts#resolvePreviewCachePath`, include `remoteRunId` in cache key.
- In `file-preview-service.ts` and `file-service.ts`, dispatch to `streamSkillRunArtifactBytes` when `file.provider === "skill-run"`.
- In `file-association-store.test.ts`, add test cases verifying two runs with identical `remote_artifact_id` create separate ManagedFile rows.

**Stop conditions**
- [ ] `npm test -- src/main/files/file-association-store.test.ts` passes.

**Triggered reads**
- If SQLite schema migration throws: `apps/work/src/main/files/file-store.ts`

## Todo T6 — Chat Lifecycle Integration & StatusBar Presentation

**Owns Changes**
- C22
- C23
- C24

**Goal**
Connect `Chat.tsx` to active skill run projections, render `SkillRunStatusBar` during running / waiting-approval / result phases, rehydrate projections on session mount, and replace Composer abort with `hermesAPI.skillRun.cancel`.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `apps/work/src/renderer/src/modules/skill-run/store.ts`

**Changes**
- Create `SkillRunStatusBar.tsx` showing current phase, tool name, prompt summary, and Cancel button.
- In `modules/skill-run/store.ts`, add projection cache and subscription listener.
- In `Chat.tsx`:
  1. Subscribe to `window.hermesAPI.skillRun.onProjectionChanged`;
  2. Call `window.hermesAPI.skillRun.rehydrateSession` when mounting a session in skill mode;
  3. Render `<SkillRunStatusBar />` below message list when an active projection exists;
  4. In `useChatActions` / `Chat.tsx` `onAbort`, call `window.hermesAPI.skillRun.cancel` when in skill mode instead of `abortChat`.

**Stop conditions**
- [ ] `npm test -- src/renderer/src/screens/Chat/Chat.layout.test.tsx` passes.

**Triggered reads**
- None

## Todo T7 — Localization Updates

**Owns Changes**
- C25

**Goal**
Add status, result, waiting-approval, and cancel localization strings across all supported locales.

**Immediate anchors**
- `apps/work/src/shared/i18n/locales/en/skillRun.ts`
- `apps/work/src/shared/i18n/locales/zh-CN/skillRun.ts`

**Changes**
- Add keys: `runPending`, `runRunning`, `runWaitingApproval`, `runSucceeded`, `runFailed`, `runCancelled`, `cancelSkillRun`, `resultReady`, `artifactRetry`, `startDisabledNoLock`.
- Update `en`, `zh-CN`, and all other locales.

**Stop conditions**
- [ ] All locales compile cleanly.

**Triggered reads**
- None

## Todo T8 — Architecture Documentation

**Owns Changes**
- C26

**Goal**
Update `apps/work/lat.md/skill-run.md` with Checkpoint B architecture details and cross-references.

**Immediate anchors**
- `apps/work/lat.md/skill-run.md`

**Changes**
- Document lifecycle coordinator, crash-safe continuation, 4-tuple remote file identity, and fail-closed M0 gate.
- Update `lat.md/lat.md`.

**Stop conditions**
- [ ] `lat.md/skill-run.md` reflects Checkpoint B state.

**Triggered reads**
- None

## Verification

```bash
npm test -- src/main/skill-run/skill-run-service.test.ts
npm test -- tests/session-continuation-store.test.ts
npm test -- src/main/files/file-association-store.test.ts
npm test -- src/renderer/src/screens/Chat/Chat.layout.test.tsx
npm test -- src/main/expert/expert-gateway-client.test.ts
npm run typecheck
npm run typecheck:web
npm run guard
```

- AC mapping: AC-01 through AC-22 validated through unit tests, negative gates, and structural checks.
- Expected: All test suites pass 100%; Expert tests remain intact; Skill Run fails closed on live execution when lock is absent.
- Negative case: Invocations without lock produce no outbound network requests.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all blocking Verification Ledger rows pass | V01,V02,V03,V04,V05,V06 evidence output retained |
| IMPLEMENTED_NOT_PROVEN | implementation exists but evidence is incomplete | pending verification named |
| BLOCKED | environment or dependency prevents proof | blocker recorded |
| RETURN_PRD | owner or boundary conflicts with APPROVED PRD | revision request recorded |
