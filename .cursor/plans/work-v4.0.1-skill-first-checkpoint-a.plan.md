---
plan_contract: smc.plan.v3.2
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1
grounded_commit: c10ae2fdc9bd7d286d828836c80fcbc2debb6257
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# WORK-SKILL-FIRST-LAYOUT-V4.0.1 Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md)

## Scope

- In: 抽取共享 authorized backend transport；建立 Skill Run shared DTO、feature mode、Gateway list、Service、IPC 与 Preload 骨架；Layout 增加一级“使用技能”入口与 Tab `executionMode`；Chat 内单一 selection truth、不可变 queue snapshot、Catalog Panel / Selection Bar 与工具条 DOM 移除；无 Consumer Lock 时 Catalog 呈现 `contract-unsupported`，`start` / `cancel` 在本切片一律 fail-closed。
- Out: 生产 `tools/call`、SSE 与轮询恢复、Result transcript upsert、`skill-run` session continuation、File Platform `skill-run` provider、Approval 与附件上传；不修改 `contracts/work-expert/v1.0.2`；不删除 Expert 默认入口。
- Production Owner inherited from PRD: Layout 导航（`Layout.tsx` + `chatRuns.ts`）、Chat 选择与提交（`Chat.tsx`）、共享授权传输（`authorized-backend-transport.ts`）、Skill Run 主进程生命周期（`SkillRunService`）、Catalog UI（`modules/skill-run`）、File Platform（`file-association-store.ts`）。

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/auth/authorized-backend-transport.ts` | absent at `grounded_commit` | `createAuthorizedBackendTransport` | `expert-gateway-client.ts` + `skill-run-gateway-client.ts` -> `authorized-backend-transport.ts` -> `ensureFreshAccessToken` | `expert-gateway-client.ts#authorizedFetch` | PASS |
| C02 | `apps/work/src/main/expert/expert-gateway-client.ts#createExpertGatewayClient` | exists at `grounded_commit` | resolved | `expert-run-service.ts` -> `createExpertGatewayClient` -> `authorized-backend-transport.ts` | `expert-gateway-client.ts` | PASS |
| C03 | `apps/work/src/shared/skill-run.ts` | absent at `grounded_commit` | `SkillRunFeatureMode` | `skill-run-gateway-client.ts` / `skill-run-ipc.ts` / `modules/skill-run` -> `shared/skill-run.ts` | `shared/expert.ts` | PASS |
| C04 | `apps/work/src/main/skill-run/feature-mode-store.ts` | absent at `grounded_commit` | `getSkillRunFeatureMode` | `skill-run-ipc.ts` / `skill-run-service.ts` -> `feature-mode-store.ts` | `auth-endpoint-config-store.ts` | PASS |
| C05 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts` | absent at `grounded_commit` | `createSkillRunGatewayClient` | `skill-run-service.ts` -> `createSkillRunGatewayClient` -> `authorized-backend-transport.ts` | `expert-gateway-client.ts` | PASS |
| C06 | `apps/work/src/main/skill-run/skill-run-service.ts` | absent at `grounded_commit` | `createSkillRunService` | `skill-run-ipc.ts` -> `createSkillRunService` | `expert-run-service.ts` | PASS |
| C07 | `apps/work/src/main/skill-run/skill-run-ipc.ts` | absent at `grounded_commit` | `registerSkillRunIpc` | `start.ts` -> `registerSkillRunIpc` | `expert-ipc.ts` | PASS |
| C08 | `apps/work/src/preload/skill-run-api.ts` | absent at `grounded_commit` | `createSkillRunApi` | `preload/index.ts` -> `createSkillRunApi` | `preload/expert-api.ts` | PASS |
| C09 | `apps/work/src/preload/index.ts` | exists at `grounded_commit` | `hermesAPI` | Renderer -> `window.hermesAPI.skillRun` | `preload/index.ts` | PASS |
| C10 | `apps/work/src/preload/index.d.ts` | exists at `grounded_commit` | `HermesAPI` | Renderer TypeScript -> `window.hermesAPI.skillRun` | `preload/index.d.ts` | PASS |
| C11 | `apps/work/src/main/app/start.ts#startMainProcess` | exists at `grounded_commit` | resolved | Electron bootstrap -> `registerSkillRunIpc` | `start.ts` | PASS |
| C12 | `apps/work/src/main/auth/auth-ipc.ts` | exists at `grounded_commit` | `registerAuthIpc` | Logout handler -> `disposeSkillRunSubsystem` | `auth-ipc.ts` | PASS |
| C13 | `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#ChatRun` | exists at `grounded_commit` | resolved | `Layout.tsx` -> `mintRun` / `isScratchRun` -> `ChatRun` | `chatRuns.ts` | PASS |
| C14 | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#Layout` | exists at `grounded_commit` | resolved | Pinned navigation -> `handleUseSkill` / `handleNewChat` | `Layout.tsx` | PASS |
| C15 | `apps/work/src/renderer/src/modules/skill-run/store.ts` | absent at `grounded_commit` | `getSkillRunCatalogState` | `Chat.tsx` / `SkillCatalogPanel.tsx` -> `store.ts` | `modules/expert/store.ts` | PASS |
| C16 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx` | absent at `grounded_commit` | `SkillCatalogPanel` | `Chat.tsx` -> `<SkillCatalogPanel />` | `modules/expert/ExpertSelector.tsx` | PASS |
| C17 | `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx` | absent at `grounded_commit` | `SkillSelectionBar` | `Chat.tsx` -> `<SkillSelectionBar />` | `modules/expert/WorkContextChip.tsx` | PASS |
| C18 | `apps/work/src/renderer/src/modules/skill-run/index.ts` | absent at `grounded_commit` | `SkillCatalogPanel` | `Chat.tsx` -> `modules/skill-run` | `modules/expert/index.ts` | PASS |
| C19 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | exists at `grounded_commit` | resolved | Composer submit / queue -> `skillSelection` snapshot -> `hermesAPI.skillRun` | `Chat.tsx` | PASS |
| C20 | `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx` | exists at `grounded_commit` | `ChatInput` | `Chat.tsx` -> `ChatInput` attachments / slash filter | `ChatInput.tsx` | PASS |
| C21 | `apps/work/src/shared/i18n/index.ts` | exists at `grounded_commit` | `sharedI18n` | React i18n -> `navigation.useSkill` / `skillRun.*` | `shared/i18n/index.ts` | PASS |
| C22 | `apps/work/lat.md/skill-run.md` | absent at `grounded_commit` | file-level doc | `lat.md/lat.md` -> `skill-run.md` | `lat.md/expert-execution.md` | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Layout 显示一级“使用技能”；空白 scratch 原地切 mode，已有内容时创建/激活独立 Skill Tab，不取消其它运行。 | BEHAVIOR | C13, C14 | T3 | V01 | UNIT | yes |
| AC-02 | AC | View 不新增 Skill Chat 页面；现有 Chat/MessageList/ChatInput 被复用。 | BEHAVIOR | C14, C19 | T3, T5 | V01, V02 | UNIT | yes |
| AC-03 | AC | ChatRun 只拥有 execution mode；Skill selection truth 在当前 Chat 中唯一，提交/排队保存不可变 snapshot。 | BEHAVIOR | C13, C19 | T3, T5 | V01, V02 | UNIT | yes |
| AC-04 | AC | 未选择 Skill 时展示 Catalog 并禁用发送；选择后展示 Selection Bar；全部错误/空状态可恢复。 | BEHAVIOR | C15, C16, C17, C18, C19 | T4, T5 | V02 | UNIT | yes |
| AC-05 | AC | Skill mode 不渲染本地模型、Reasoning、Fast Mode、Context Folder 或 Expert 控件；附件未合同化时明确禁用。 | BEHAVIOR | C19, C20 | T5 | V02 | UNIT | yes |
| AC-06 | AC | Catalog 只显示合同可证明为 Skill 的项；缺少 discriminator 时显示 contract unsupported，而不是猜测过滤。 | CONTRACT | C05, C06, C15, C16 | T2, T4 | V03 | UNIT | yes |
| AC-07 | AC | Work 锁定带 tag/checksum 的完整 Skill Run Consumer Contract；旧 work-expert lock 不变。 | CONTRACT | C03, C05 | T2 | V03 | UNIT | yes |
| AC-08 | AC | 新调用只使用 toolname 与 runid，不发送 Expert/Agent/Runtime/Profile/Workspace routing 字段。 | CONTRACT | C03, C07, C08 | T2 | V03 | UNIT | yes |
| AC-09 | AC | Provider runid、Renderer ChatRun.runId 与 clientRequestId 在类型、持久化和日志中不可互换。 | CONTRACT | C03, C13, C19 | T2, T3, T5 | V01, V02, V03 | UNIT | yes |
| AC-10 | AC | Renderer 无法取得 JWT、Backend/Agent URL、raw Provider event、download token 或 absolute path。 | SECURITY | C01, C07, C08 | T1, T2 | V03, V04 | UNIT | yes |
| AC-11 | AC | Main 是唯一 Skill Run lifecycle owner；Renderer store 仅为 projection。 | LIFECYCLE | C06, C07, C15 | T2, T4 | V03 | UNIT | yes |
| AC-12 | AC | 不确定网络与 App 重启使用同一 idempotency identity 恢复，跨端证明只创建一个 Provider Run。 | NEGATIVE | C06 | T2 | V03 | UNIT | yes |
| AC-13 | AC | SSE replay 去重、terminal 单调、poll fallback 和 cleanup 可验证；旧事件不能回退终态。 | NEGATIVE | C06 | T2 | V03 | UNIT | yes |
| AC-14 | AC | 同一 Chat Tab 至多一个 active Skill Run；queue item 不因用户更换 Skill 而改路由。 | BEHAVIOR | C19 | T5 | V02 | UNIT | yes |
| AC-15 | AC | 取消只调用 Skill Run cancel；不得误调用 Local Chat abort。Approval 未合同化时只读等待，不显示伪交互。 | BEHAVIOR | C06, C19 | T2, T5 | V02, V03 | UNIT | yes |
| AC-16 | AC | 只有合同枚举事件可产生 activity UI；unknown payload 不文本化、不触发不可逆 UI side effect。 | NEGATIVE | C06, C15 | T2, T4 | V03 | UNIT | yes |
| AC-17 | AC | Result 更新同一 assistant transcript；restart 后 session mode、在途 projection 与历史可恢复且不重复 start。 | NEGATIVE | C06 | T2 | V03 | UNIT | yes |
| AC-18 | AC | Artifact 进入现有 File Platform，以 run-scoped remote identity 去重，并通过现有 Preview/Save As/Materialize API 使用。 | NEGATIVE | C06 | T2 | V03 | UNIT | yes |
| AC-19 | AC | 不得新增 Skill conversation/file parallel SoT 或直接 Artifact download IPC。 | SECURITY | C07, C08 | T2 | V03, V04 | UNIT | yes |
| AC-20 | AC | Skill-first、Expert compatibility 与 Local Chat 路径显式互斥；一条消息不会同时创建 Skill Run 与 ExpertTask。 | BEHAVIOR | C04, C06, C19 | T2, T5 | V02, V03 | UNIT | yes |
| AC-21 | AC | Skill-first 失败不自动 fallback；回滚停止新建但保留 Skill/Expert 各自 reader。 | BEHAVIOR | C04, C06, C19 | T2, T5 | V02, V03 | UNIT | yes |
| AC-22 | AC | Expert 默认创建入口的最终删除满足 Compatibility Contract，并由独立 Removal PRD 执行。 | SCOPE | C04, C07, C19 | T2, T5 | V02, V03 | UNIT | yes |
| DOD-01 | DOD | Provider Contract Gate 与 Work Consumer Lock 就绪，无未验证 schema。 | CONTRACT | C05, C06 | T2 | V03 | UNIT | yes |
| DOD-02 | DOD | Contract、Main、IPC、Renderer 与 Session 聚焦测试全部通过，无回归。 | EVIDENCE | C01, C02, C13, C14, C19 | T1, T2, T3, T5 | V01, V02, V03, V05 | UNIT | yes |
| DOD-03 | DOD | 生产切换前通过完整 Checklist，历史任务可独立恢复且无 silent fallback。 | OPERATIONS | C04, C06, C19 | T2, T5 | V02, V03 | UNIT | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Skill Catalog State | AC-04, AC-06 | `listCatalog` / `refreshCatalog` | `loading` | `SkillRunService` (Main) | `SkillRunService` (Main) | V03 |
| Skill Run Start Attempt | AC-11, AC-12, AC-20, AC-21 | `skillRun.start` invocation | none (immediate rejected projection) | `SkillRunService` (Main) | `SkillRunService` (Main) | V03 |
| Skill Run Cancel Attempt | AC-15 | `skillRun.cancel` invocation | none (fail-closed response) | `SkillRunService` (Main) | `SkillRunService` (Main) | V03 |
| Auth Logout / Teardown | AC-10, AC-11 | `auth:logout` / `before-quit` | none (synchronous cache drop) | `disposeSkillRunSubsystem` (Main) | `disposeSkillRunSubsystem` (Main) | V03 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Skill Catalog Fetch | AC-04, AC-06, AC-07 | Main `SkillRunGatewayClient` | IPC `skill-run:list-catalog` -> `SkillCatalogResponse` | Renderer `store.ts` | `tools: SkillCatalogToolItem[]`, `status`, `reason` | `SkillRunGatewayClient` / `SkillRunService` | `unauthorized`, `backend-unavailable`, `contract-unsupported` | none (read-only TTL cache) | V03 |
| Skill Run Start Gate | AC-08, AC-09, AC-10, AC-11, AC-12, AC-20 | Renderer `Chat.tsx` | IPC `skill-run:start` -> `SkillRunStartInput` | Main `SkillRunService` | `toolName`, `prompt`, `clientRequestId`, `sessionId`, `profileId` | `SkillRunService` | `START_DISABLED_CHECKPOINT_A` | `clientRequestId` (validated in Main) | V03 |
| Feature Mode Sync | AC-20, AC-21, AC-22 | Main `feature-mode-store.ts` | IPC `skill-run:get-feature-mode` | Renderer `Chat.tsx` / `Layout.tsx` | `mode: SkillRunFeatureMode` | `feature-mode-store.ts` | default `expert-compat` | none (config snapshot) | V03 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Output | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `npm test -- src/renderer/src/screens/Layout/chatRuns.test.ts` | Layout transitions preserve `executionMode`, separate tabs and maintain scratches | Scratch run under local mode does not overwrite skill scratch | `artifacts/work-v4.0.1-checkpoint-a/chatRuns.log` | local node | yes |
| V02 | UNIT | `npm test -- src/renderer/src/screens/Chat/Chat.test.tsx` | Chat mounts Catalog on skill mode, queues immutable snapshot, omits model pickers | Slash `/model` does not reopen model picker in skill mode | `artifacts/work-v4.0.1-checkpoint-a/chatUi.log` | local node (jsdom) | yes |
| V03 | UNIT | `npm test -- src/main/skill-run/skill-run-service.test.ts` | Gateway/Service returns contract-unsupported when no lock exists, start fails closed without network call | Unauthorized/invalid payload maps to sanitized status | `artifacts/work-v4.0.1-checkpoint-a/skillRunMain.log` | local node | yes |
| V04 | UNIT | `npm run check:work-renderer-contract` | Preload exports `skillRun` and does not leak raw tokens/URLs | Contract checker confirms all required surface symbols | `artifacts/work-v4.0.1-checkpoint-a/rendererContract.log` | local node | yes |
| V05 | UNIT | `npm test -- src/main/expert/expert-gateway-client.test.ts` | Expert client keeps 100% test pass rate after switching to shared transport | Cross-origin/auth-expired retries continue functioning | `artifacts/work-v4.0.1-checkpoint-a/expertGateway.log` | local node | yes |

## Immediate Read

- `apps/work/src/main/expert/expert-gateway-client.ts#createExpertGatewayClient`
- `apps/work/src/main/auth/ensure-access-token.ts#ensureFreshAccessToken`
- `apps/work/src/main/auth/auth-endpoint-config-store.ts#readAuthEndpointConfig`
- `apps/work/src/main/expert/expert-gateway-client.test.ts`

## Triggered Read

- If transport extraction affects Expert retry: `apps/work/src/main/expert/expert-run-service.ts`
- If chatRuns transition needs active bar sync: `apps/work/src/renderer/src/screens/Layout/SidebarRecentSessions.tsx`
- If slash menu requires command blacklist: `apps/work/src/renderer/src/screens/Chat/slashCommands.ts`
- Otherwise: do not read

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/auth/authorized-backend-transport.ts` | PROD | ADD | - | T1 | Shared origin/JWT/timeout/same-origin fetcher | NoDeskClaw 授权网络 | yes |
| C02 | `apps/work/src/main/expert/expert-gateway-client.ts#createExpertGatewayClient` | PROD | MODIFY | `expert-gateway-client.ts` | T1 | Uses shared transport for HTTP | NoDeskClaw 授权网络 | no |
| C03 | `apps/work/src/shared/skill-run.ts` | PROD | ADD | - | T2 | Skill Run shared DTOs and IPC channel types | Skill Run IPC / Preload | yes |
| C04 | `apps/work/src/main/skill-run/feature-mode-store.ts` | PROD | ADD | - | T2 | Durable feature mode store default to expert-compat | Expert compatibility | yes |
| C05 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts` | PROD | ADD | - | T2 | Lock-aware tool list client using shared transport | Skill Catalog / call client | yes |
| C06 | `apps/work/src/main/skill-run/skill-run-service.ts` | PROD | ADD | - | T2 | Main lifecycle owner with fail-closed start/cancel | Skill Run lifecycle | yes |
| C07 | `apps/work/src/main/skill-run/skill-run-ipc.ts` | PROD | ADD | - | T2 | IPC registration and input sanitization | Skill Run IPC / Preload | yes |
| C08 | `apps/work/src/preload/skill-run-api.ts` | PROD | ADD | - | T2 | Preload bridge for window.hermesAPI.skillRun | Skill Run IPC / Preload | yes |
| C09 | `apps/work/src/preload/index.ts` | PROD | MODIFY | `preload/index.ts` | T2 | Exposes hermesAPI.skillRun | Skill Run IPC / Preload | no |
| C10 | `apps/work/src/preload/index.d.ts` | PROD | MODIFY | `preload/index.d.ts` | T2 | Declares SkillRunApi interface | Skill Run IPC / Preload | no |
| C11 | `apps/work/src/main/app/start.ts#startMainProcess` | PROD | MODIFY | `start.ts` | T2 | Registers Skill Run IPC on startup and cleans on quit | Skill Run lifecycle | no |
| C12 | `apps/work/src/main/auth/auth-ipc.ts` | PROD | MODIFY | `auth-ipc.ts` | T2 | Disposes Skill Run subsystem on logout | NoDeskClaw 授权网络 | no |
| C13 | `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#ChatRun` | PROD | MODIFY | `chatRuns.ts` | T3 | Adds executionMode to ChatRun and scratch helper | Chat Tab 执行模式 | no |
| C14 | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#Layout` | PROD | MODIFY | `Layout.tsx` | T3 | Adds 使用技能 pinned entry and mode switching | Layout 一级“使用技能”入口 | no |
| C15 | `apps/work/src/renderer/src/modules/skill-run/store.ts` | PROD | ADD | - | T4 | UI catalog/projection cache store | Renderer projection | yes |
| C16 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx` | PROD | ADD | - | T4 | Catalog UI component with search/categories | Skill Catalog UI | yes |
| C17 | `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx` | PROD | ADD | - | T4 | Selection Bar component above input | Skill Catalog UI | yes |
| C18 | `apps/work/src/renderer/src/modules/skill-run/index.ts` | PROD | ADD | - | T4 | Module barrel exports | Skill Catalog UI | yes |
| C19 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | PROD | MODIFY | `Chat.tsx` | T5 | Skill selection truth, queue snapshot, DOM removals | Chat 选择与提交路由 | no |
| C20 | `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx` | PROD | MODIFY | `ChatInput.tsx` | T5 | Attachments disabled notice and slash filtering | Composer capability projection | no |
| C21 | `apps/work/src/shared/i18n/index.ts` | PROD | MODIFY | `shared/i18n/index.ts` | T6 | Registers skillRun and navigation keys for all locales | Layout 一级“使用技能”入口 | no |
| C22 | `apps/work/lat.md/skill-run.md` | DOC | ADD | - | T7 | Architecture knowledge documentation for skill-run | Layout 一级“使用技能”入口 | yes |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MINIMAL_NEW | `apps/work/src/main/expert/expert-gateway-client.ts#authorizedFetch` | Shared transport centralizes JWT/origin/timeout without duplicating across clients |
| C02 | MODIFY_EXISTING | `apps/work/src/main/expert/expert-gateway-client.ts#createExpertGatewayClient` | Replaces private fetch with shared transport while preserving JSON-RPC and TTL caches |
| C03 | MINIMAL_NEW | `apps/work/src/shared/expert.ts` | Skill Run wire contract differs from Expert v1.0.2; separate DTO avoids mixed invariants |
| C04 | MINIMAL_NEW | `apps/work/src/main/auth/auth-endpoint-config-store.ts` | Simple persistent JSON store in userData matches auth-endpoint pattern |
| C05 | MINIMAL_NEW | `apps/work/src/main/expert/expert-gateway-client.ts` | Separate gateway client consumes locked MCP tool catalog without touching Expert tasks |
| C06 | MINIMAL_NEW | `apps/work/src/main/expert/expert-run-service.ts` | Standalone lifecycle service enforces Checkpoint A fail-closed gate without Expert branch pollution |
| C07 | MINIMAL_NEW | `apps/work/src/main/expert/expert-ipc.ts` | Narrow IPC channels with sender and input assertions match established security boundary |
| C08 | MINIMAL_NEW | `apps/work/src/preload/expert-api.ts` | Dedicated bridge exposes only sanitized commands under hermesAPI.skillRun |
| C09 | MODIFY_EXISTING | `apps/work/src/preload/index.ts#hermesAPI` | Hooks `skillRun` into existing preload object without creating alternative globals |
| C10 | MODIFY_EXISTING | `apps/work/src/preload/index.d.ts#HermesAPI` | Typings declaration in existing HermesAPI interface |
| C11 | MODIFY_EXISTING | `apps/work/src/main/app/start.ts#startMainProcess` | Registers Skill Run IPC alongside Expert IPC during app startup |
| C12 | MODIFY_EXISTING | `apps/work/src/main/auth/auth-ipc.ts#registerAuthIpc` | Ensures Skill Run cache and active instances drop cleanly upon logout |
| C13 | MODIFY_EXISTING | `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#ChatRun` | Adds `executionMode: "local-chat" | "skill-run"` to existing ChatRun record |
| C14 | MODIFY_EXISTING | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#Layout` | Adds pinned nav button and symmetrical scratch/reuse tab transition logic |
| C15 | MINIMAL_NEW | `apps/work/src/renderer/src/modules/expert/store.ts` | Read-only projection store mirroring expert module pattern |
| C16 | MINIMAL_NEW | `apps/work/src/renderer/src/modules/expert/ExpertSelector.tsx` | Catalog panel presents flat tool list, search and category pills |
| C17 | MINIMAL_NEW | `apps/work/src/renderer/src/modules/expert/WorkContextChip.tsx` | Selection bar provides clear/switch triggers above input |
| C18 | MINIMAL_NEW | `apps/work/src/renderer/src/modules/expert/index.ts` | Standard module barrel exporting presentation components |
| C19 | MODIFY_EXISTING | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | Keeps single selection truth, snapshots queue items, removes model pickers from DOM |
| C20 | MODIFY_EXISTING | `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx#ChatInput` | Filters incompatible slash commands and shows informative notice on attachment drag/paste |
| C21 | MODIFY_EXISTING | `apps/work/src/shared/i18n/index.ts#sharedI18n` | Wires translations for all 12 supported app locales without changing i18n core |
| C22 | MINIMAL_NEW | `apps/work/lat.md/expert-execution.md` | Documents Skill-first architecture boundaries and tests according to repository standard |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01<br>C02 | `apps/work/src/main/auth/authorized-backend-transport.ts`<br>`apps/work/src/main/expert/expert-gateway-client.ts#createExpertGatewayClient` | - | - | yes |
| T2 | C03<br>C04<br>C05<br>C06<br>C07<br>C08<br>C09<br>C10<br>C11<br>C12 | `apps/work/src/shared/skill-run.ts`<br>`apps/work/src/main/skill-run/feature-mode-store.ts`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts`<br>`apps/work/src/main/skill-run/skill-run-service.ts`<br>`apps/work/src/main/skill-run/skill-run-ipc.ts`<br>`apps/work/src/preload/skill-run-api.ts`<br>`apps/work/src/preload/index.ts`<br>`apps/work/src/preload/index.d.ts`<br>`apps/work/src/main/app/start.ts#startMainProcess`<br>`apps/work/src/main/auth/auth-ipc.ts` | `apps/work/src/main/auth/authorized-backend-transport.ts` | T1 | no |
| T3 | C13<br>C14 | `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#ChatRun`<br>`apps/work/src/renderer/src/screens/Layout/Layout.tsx#Layout` | - | - | yes |
| T4 | C15<br>C16<br>C17<br>C18 | `apps/work/src/renderer/src/modules/skill-run/store.ts`<br>`apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx`<br>`apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx`<br>`apps/work/src/renderer/src/modules/skill-run/index.ts` | `apps/work/src/shared/skill-run.ts` | T2 | no |
| T5 | C19<br>C20 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`<br>`apps/work/src/renderer/src/screens/Chat/ChatInput.tsx` | `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#ChatRun`<br>`apps/work/src/renderer/src/modules/skill-run/index.ts` | T2, T3, T4 | no |
| T6 | C21 | `apps/work/src/shared/i18n/index.ts` | - | T3, T4 | no |
| T7 | C22 | `apps/work/lat.md/skill-run.md` | - | T2, T5 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/preload/index.ts` | T2 | Shared hermesAPI preload export |
| `apps/work/src/preload/index.d.ts` | T2 | Shared HermesAPI typings definition |
| `apps/work/src/main/app/start.ts` | T2 | Main process IPC handler setup |
| `apps/work/src/main/auth/auth-ipc.ts` | T2 | Auth logout lifecycle cleanup |
| `apps/work/src/renderer/src/screens/Layout/Layout.tsx` | T3 | Primary navigation and tab manager |
| `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | T5 | Primary conversation coordinator |
| `apps/work/src/shared/i18n/index.ts` | T6 | Unified localization dictionary registry |

## Generated Outputs Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `apps/work/src/main/auth/authorized-backend-transport.ts` | Centralized transport prevents duplicating JWT/origin/timeout logic across Expert and Skill gateways | Pure utility helper; single owner for auth transport |
| C03 | `apps/work/src/shared/skill-run.ts` | Type definitions for Skill Run wire contract and IPC bridges | Shared DTO owner; avoids mixing with legacy expert DTOs |
| C04 | `apps/work/src/main/skill-run/feature-mode-store.ts` | Persistent store for local feature mode setting | Isolated configuration owner |
| C05 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts` | Dedicated client for MCP tool catalog discovery | Main gateway client owner for Skill Platform |
| C06 | `apps/work/src/main/skill-run/skill-run-service.ts` | Main process lifecycle and execution coordinator | Single production owner for Skill Run lifecycle |
| C07 | `apps/work/src/main/skill-run/skill-run-ipc.ts` | IPC bridge registration and parameter validation | Narrow IPC boundary owner |
| C08 | `apps/work/src/preload/skill-run-api.ts` | Context-isolated preload bridge | Renderer-Preload bridge owner |
| C15 | `apps/work/src/renderer/src/modules/skill-run/store.ts` | UI catalog and state projection cache | Presentation store; does not own lifecycle truth |
| C16 | `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx` | Catalog view displayed when no skill is selected | Presentation component |
| C17 | `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx` | Banner indicating active skill selection | Presentation component |
| C18 | `apps/work/src/renderer/src/modules/skill-run/index.ts` | Module export barrel | Module encapsulation |
| C22 | `apps/work/lat.md/skill-run.md` | Architectural documentation per repository standards | Documentation artifact |

## Todo T1 — Shared Backend Transport Extraction

**Owns Changes**
- C01
- C02

**Goal**
Extract authorized HTTP transport from `expert-gateway-client.ts` into `authorized-backend-transport.ts` and ensure all Expert tests continue passing.

**Immediate anchors**
- `apps/work/src/main/expert/expert-gateway-client.ts#createExpertGatewayClient`
- `apps/work/src/main/auth/ensure-access-token.ts#ensureFreshAccessToken`

**Changes**
- Create `apps/work/src/main/auth/authorized-backend-transport.ts` providing `createAuthorizedBackendTransport` with JWT refresh, same-origin validation, timeout and error parsing.
- Refactor `expert-gateway-client.ts` to use `createAuthorizedBackendTransport`.
- Add unit test `apps/work/src/main/auth/authorized-backend-transport.test.ts`.

**Stop conditions**
- [ ] `npm test -- src/main/auth/authorized-backend-transport.test.ts` passes.
- [ ] `npm test -- src/main/expert/expert-gateway-client.test.ts` passes with zero regressions.

**Triggered reads**
- If Expert auth retry fails: `apps/work/src/main/auth/ensure-access-token.ts`

## Todo T2 — Skill Run Main, IPC, and Preload Foundation

**Owns Changes**
- C03
- C04
- C05
- C06
- C07
- C08
- C09
- C10
- C11
- C12

**Goal**
Establish Skill Run shared types, feature mode store, gateway client, lifecycle service with fail-closed execution, IPC registration, and preload bridge.

**Immediate anchors**
- `apps/work/src/shared/expert.ts`
- `apps/work/src/main/expert/expert-ipc.ts`
- `apps/work/src/preload/index.ts`

**Changes**
- Create `apps/work/src/shared/skill-run.ts` with DTOs, IPC channels (`skill-run:list-catalog`, `skill-run:start`, `skill-run:cancel`, `skill-run:get-feature-mode`).
- Create `apps/work/src/main/skill-run/feature-mode-store.ts` defaulting to `expert-compat`.
- Create `apps/work/src/main/skill-run/skill-run-gateway-client.ts` implementing `listCatalog` (returning `contract-unsupported` when no consumer lock is present).
- Create `apps/work/src/main/skill-run/skill-run-service.ts` implementing fail-closed `start` and `cancel`.
- Create `apps/work/src/main/skill-run/skill-run-ipc.ts` and wire into `start.ts` and `auth-ipc.ts`.
- Create `apps/work/src/preload/skill-run-api.ts` and expose under `window.hermesAPI.skillRun`.
- Add unit test `apps/work/src/main/skill-run/skill-run-service.test.ts`.

**Stop conditions**
- [ ] `npm test -- src/main/skill-run/skill-run-service.test.ts` passes.
- [ ] `npm run check:work-renderer-contract` passes.

**Triggered reads**
- If preload typechecking fails: `apps/work/src/preload/index.d.ts`

## Todo T3 — Execution Mode & Layout Navigation

**Owns Changes**
- C13
- C14

**Goal**
Add `executionMode` to `ChatRun` and implement the "使用技能" pinned navigation button with proper scratch/tab transitions.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#ChatRun`
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#Layout`

**Changes**
- Update `ChatRun` type and `mintRun` to accept `executionMode?: "local-chat" | "skill-run"`.
- Update `isScratchRun` to account for `executionMode` so local and skill scratch tabs remain distinct.
- Update `Layout.tsx` to add "使用技能" button, `handleUseSkill` transition (switch in-place for scratch, create/activate tab for busy chat without aborting background runs).
- Update unit tests in `chatRuns.test.ts` to cover `executionMode` transitions.

**Stop conditions**
- [ ] `npm test -- src/renderer/src/screens/Layout/chatRuns.test.ts` passes.

**Triggered reads**
- If sidebar icon layout shifts: `apps/work/src/renderer/src/screens/Layout/Layout.css`

## Todo T4 — Skill Run Presentation Module

**Owns Changes**
- C15
- C16
- C17
- C18

**Goal**
Build the `modules/skill-run` presentation components (Catalog Panel with search/categories, Selection Bar, and projection store).

**Immediate anchors**
- `apps/work/src/renderer/src/modules/expert/ExpertSelector.tsx`
- `apps/work/src/renderer/src/modules/expert/store.ts`

**Changes**
- Create `apps/work/src/renderer/src/modules/skill-run/store.ts` caching catalog results and projection states.
- Create `apps/work/src/renderer/src/modules/skill-run/SkillCatalogPanel.tsx` with search input, category filters, empty/error/loading/unsupported states, and tool cards.
- Create `apps/work/src/renderer/src/modules/skill-run/SkillSelectionBar.tsx` showing the selected skill name and clear button.
- Create `apps/work/src/renderer/src/modules/skill-run/index.ts` exporting the components and store hooks.

**Stop conditions**
- [ ] TypeScript compilation for `modules/skill-run` passes cleanly.

**Triggered reads**
- If styling details are needed: `apps/work/src/renderer/src/modules/expert/expert.css`

## Todo T5 — Chat Integration, Queue Snapshot, and DOM Cleanup

**Owns Changes**
- C19
- C20

**Goal**
Integrate Skill selection truth in `Chat.tsx`, snapshot requests in the queue, remove model pickers from DOM in skill mode, and disable attachments.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`
- `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx#ChatInput`

**Changes**
- In `Chat.tsx`, manage `skillSelection: SkillSelection | null` when `chatRun.executionMode === "skill-run"`.
- Render `SkillCatalogPanel` when no skill is selected; render `SkillSelectionBar` above input when selected.
- Completely omit `ModelPicker`, `ReasoningEffortPicker`, `FastMode`, `ContextFolderChip`, and `ExpertContextControl` from DOM in skill mode.
- Extend `QueuedMessage` with immutable `skillRequest` snapshot.
- In `ChatInput.tsx`, filter out `/model` slash command in skill mode and show a clear error toast if attachments are dropped/pasted.
- Update `handleSubmitOrQueue` to call `hermesAPI.skillRun.start` when in skill mode (failing closed safely).

**Stop conditions**
- [ ] `npm test -- src/renderer/src/screens/Chat/Chat.test.tsx` passes.

**Triggered reads**
- If slash command virtual layout needs updating: `apps/work/src/renderer/src/screens/Chat/slash/virtualSlashCommands.ts`

## Todo T6 — Localization Key Additions

**Owns Changes**
- C21

**Goal**
Add navigation and skill-run localization strings for all 12 supported app locales.

**Immediate anchors**
- `apps/work/src/shared/i18n/locales/en/navigation.ts`
- `apps/work/src/shared/i18n/index.ts`

**Changes**
- Add `useSkill: "Use Skill"` (and equivalent in 11 other languages) to navigation localization files.
- Add `skillRun` namespace (search, categories, unsupported contract notice, clear selection, select skill) across all locales in `apps/work/src/shared/i18n/index.ts`.

**Stop conditions**
- [ ] All 12 locales contain valid translations without missing keys.

**Triggered reads**
- If locale type definitions complain: `apps/work/src/shared/i18n/config.ts`

## Todo T7 — Architecture Knowledge Documentation

**Owns Changes**
- C22

**Goal**
Document the Skill-first architecture and boundaries in `lat.md/skill-run.md` and link with `lat.md/expert-execution.md`.

**Immediate anchors**
- `apps/work/lat.md/expert-execution.md`

**Changes**
- Create `apps/work/lat.md/skill-run.md` detailing Checkpoint A boundaries, shared transport, fail-closed start, and UI isolation.
- Cross-reference with `lat.md/expert-execution.md` and update index.

**Stop conditions**
- [ ] `lat.md/skill-run.md` exists and accurately describes Checkpoint A state.

**Triggered reads**
- None

## Verification

```bash
npm test -- src/main/auth/authorized-backend-transport.test.ts
npm test -- src/main/expert/expert-gateway-client.test.ts
npm test -- src/main/skill-run/skill-run-service.test.ts
npm test -- src/renderer/src/screens/Layout/chatRuns.test.ts
npm run check:work-renderer-contract
npm run typecheck
```

- AC mapping: AC-01 through AC-22 verified via unit tests, negative gates, and contract checks.
- Expected: Zero regressions in Expert tests; Skill Run cleanly isolated and fail-closed.
- Negative case: Invoking `skillRun.start` in Checkpoint A immediately fails closed without making external network requests.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all blocking Verification Ledger rows pass | V01,V02,V03,V04,V05 evidence output retained |
| IMPLEMENTED_NOT_PROVEN | implementation exists but evidence is incomplete | pending verification named |
| BLOCKED | environment or dependency prevents proof | blocker recorded |
| RETURN_PRD | owner or boundary conflicts with APPROVED PRD | revision request recorded |
