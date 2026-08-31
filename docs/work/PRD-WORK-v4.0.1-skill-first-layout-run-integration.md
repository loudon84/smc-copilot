---
work_item_id: WORK-SKILL-FIRST-LAYOUT-V4.0.1
version: v4.0.1
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-08-31T20:21:00+08:00
grounding_mode: revision
source_revision: user-input:2026-08-31-provider-contract-delivery-boundary-v1
grounded_commit: e72e5edc15af93e6e3a34cc4d6f9517fcd2b7931
source_commit: e72e5edc15af93e6e3a34cc4d6f9517fcd2b7931
provider_contract: Provider Owner Contract Bundle required
provider_contract_delivery: external-immutable-bundle-only
supersedes: WORK-SKILL-RUN-V4.0
---

# WORK PRD v4.0.1 — Skill-First Layout and Run Integration

本文定义 `apps/work` 的“使用技能”一级入口、Skill Catalog、Skill Run UI、Main/Preload 接口及运行恢复架构。目标是把 NoDeskClaw 已发布 Skill 作为 Chat 的一种执行模式，而不是复制一套 Chat 页面，也不是继续把新调用塞进 Expert 合同。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Repository | `smc-copilot` |
| Branch | `work/prd-v4.0` |
| Checkout / `grounded_commit` | `e72e5edc15af93e6e3a34cc4d6f9517fcd2b7931` |
| Grounding mode | `revision` |
| Affected subsystem | `apps/work` |
| Architecture index | `apps/work/lat.md/expert-execution.md`; `apps/work/lat.md/file-platform.md`; `apps/work/lat.md/skill-run.md` |
| Current Expert Consumer Contract | `contracts/work-expert/v1.0.2`（本 PRD 不修改） |
| Provider delivery authority | NoDeskClaw Provider Owner |
| Permitted Provider input | immutable, versioned Contract Bundle delivered to Work |
| Current Work material | `contracts/skill-run/v1.0.0/consumer-lock.json` + `SHA256SUMS` (identity evidence only; not a complete Bundle) |
| Source revision | `user-input:2026-08-31-provider-contract-delivery-boundary-v1` |

Work 事实以 `grounded_commit` 为准。任何 Provider wire semantics、endpoint、schema、fixture 和 live-E2E prerequisite 都必须由 Provider Owner 以不可变 Contract Bundle 交付；Work 不读取、搜索或以任何方式把 NoDeskClaw 项目源码作为需求或 Grounding 输入。

## Problem and Outcome

当前 Work 已有 Layout「使用技能」入口、Chat Tab `executionMode`、Skill Catalog/Selection、Main `SkillRunService` 与 File Platform `skill-run` 远端身份。员工新调用的生产启用仍被不完整 Contract Bundle 挡住：现有 consumer lock 只核验 identity 文件存在，不能代表完整 Bundle。NoDeskClaw 已把员工调用身份收敛为 `tool_name`，把执行事实收敛为 `run_id` 与 `/api/v1/runs/*`；Work 继续在不暴露 Agent/Runtime 路由、不建立第二套会话与文件平台的前提下消费这条链路，且不得再 ADD 一套并行 Skill Run Owner。

目标调用链为：

```text
Layout “使用技能”
  → 当前 ChatRun.executionMode = skill-run
  → Chat Skill Catalog / SkillSelection
  → Main SkillRunService
  → nodeskclaw-backend POST /api/v1/mcp
  → Backend Auth / RBAC / published Release / Policy / Routing
  → nodeskclaw-agent Run SoT
  → Backend /api/v1/runs/* authenticated projection
  → Main SkillRunProjection
  → existing Chat UI + existing File Platform
```

## Scope

P0 包含：

- Layout 一级“使用技能”入口与每个 Chat Tab 的执行模式；
- Skill-only Catalog、搜索、分类、选择与不可变提交快照；
- prompt-first Tool 调用、稳定幂等键、Run 状态、SSE（服务端推送）恢复与轮询兜底；
- Chat 内紧凑运行状态、取消、最终结果与只读等待审批状态；
- App 重启后的在途 Run 恢复；
- Skill Artifact 导入现有 File Platform 与 Session Files；
- Expert compatibility、灰度、回滚、安全与基础遥测。

P1 包含：

- 合同化的 Approval 操作；
- 合同化的细粒度 Run Activity（reasoning、tool、clarify、streaming delta）映射；
- 受限 JSON Schema 参数表单；
- Provider attachment refs 合同完成后的附件接入。

## Non-Goals

- 不新增 `SkillChat`、`SkillMessageList` 或第二套 Chat 页面；
- 不让 Work 选择或提交 Agent、Runtime、Profile、Installation、Edge Node、Connector Route；
- 不直连 `nodeskclaw-agent`，不向 Renderer 暴露 JWT、Backend URL、SSE token 或 Artifact URL；
- 不把 Provider `run_id` 写进现有 Renderer `ChatRun.runId`；
- 不复用 Runtime ChatRun `/v1/runs/*` 或 Expert `task_id` 作为 Skill Run 合同；
- 不新增 `skill_conversations` / `skill_messages` 平行会话数据库；
- 不修改 `contracts/work-expert/v1.0.2`；
- 不在 Provider schema 未枚举时猜测事件 payload、Result、Approval 或 Attachment 语义；
- 不改造本地 Hermes bundled Skills 管理页。

## Current Capability Inventory

| Capability | Existing Production Owner | Current Behaviour | Evidence | Result |
|---|---|---|---|---|
| Layout 导航与多 Chat Tab | Existing `Layout` / `ChatRun` owner | `View` 仍是大页面；`ChatRun.executionMode` 区分 `local-chat` 与 `skill-run`；「使用技能」对空白 scratch 原地切 mode，否则复用或创建 Skill Tab | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#Layout`; `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#ChatRun` | EXISTS |
| Chat 选择与提交路由 | Existing `Chat.tsx` owner | 每个挂载 Chat 持有 Skill selection；Skill mode 经 `hermesAPI.skillRun.start` 提交；Slash-first 仍在 Chat | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat` | EXISTS |
| Composer | Existing `ChatInput` owner | Skill mode 禁用附件并隐藏本地模型/Expert 入口 | `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx` | EXISTS |
| NoDeskClaw authorized transport | Main shared authorized transport | Expert 与 Skill Run 复用 origin、JWT refresh、same-origin、错误清洗；不拥有 lifecycle | `apps/work/src/main/auth/authorized-backend-transport.ts#createAuthorizedBackendTransport` | EXISTS |
| Expert Task 生命周期 | Main Expert Run Service | `task_id`、Expert SSE、poll、cancel、retry、materialization 仍独立；与 Skill Run 合同不兼容 | `apps/work/src/main/expert/expert-run-service.ts#createExpertRunService` | EXISTS，合同不兼容 |
| Expert IPC / Preload | Expert IPC/API | 狭窄 Expert surface 仍在，与 Skill Run surface 分离 | `apps/work/src/main/expert/expert-ipc.ts`; `apps/work/src/preload/expert-api.ts#createExpertApi` | EXISTS |
| Skill Run lifecycle | Main `SkillRunService` | pending-submit、幂等、SSE/poll、cancel、result、rehydrate 已落地；start 另受 feature mode `skill-first` 约束（默认 `expert-compat`） | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | EXISTS |
| Skill Catalog / call client | Main `SkillRunGatewayClient` | 已消费 MCP list/call 与 `/runs/*`；当前 lock Gate 在 identity-only 文件存在时放行真实 HTTP | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | PARTIAL |
| Work Contract Bundle / lock Gate | Existing Work Skill Run consumer-lock owner | `hasSkillRunConsumerLock()` 只检查 `consumer-lock.json` 与 `SHA256SUMS` 存在，不校验完整 Bundle manifest、schema、fixtures 或 checksum contents | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunConsumerLock`; `contracts/skill-run/v1.0.0/consumer-lock.json`; `contracts/skill-run/v1.0.0/SHA256SUMS` | PARTIAL |
| Skill Run IPC / Preload | Main Skill Run IPC + Preload API | `window.hermesAPI.skillRun` 已提供 list/start/cancel/rehydrate/subscribe；不暴露 raw URL/credential | `apps/work/src/main/skill-run/skill-run-ipc.ts`; `apps/work/src/preload/skill-run-api.ts` | EXISTS |
| Renderer projection / Catalog UI | Renderer `modules/skill-run` presentation module | Catalog、Selection Bar 与 projection 展示已存在；selection truth 仍在 Chat | `apps/work/src/renderer/src/modules/skill-run` | EXISTS |
| Provider event parsing | Main Skill Run contract adapter | 已有 parser；Skill/Connector discriminator 与完整 event/result schema 仍缺 Bundle，不得用私有推断补齐 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts` | PARTIAL |
| Session continuation | Existing Session / Continuation owner | 已支持 versioned `skill-run` item 与 rehydrate | `apps/work/src/shared/session-continuation.ts#DesktopSessionContinuationItem`; `apps/work/src/shared/skill-run.ts#SkillRunContinuationItem` | EXISTS |
| Session transcript | Existing Skill Run session materializer + Hermes Session store | Skill Run projection 可 upsert 普通 session/messages | `apps/work/src/main/skill-run/skill-run-session-materialize.ts` | EXISTS |
| File Platform | Main File Platform | `provider=skill-run` 与 Expert 共存；远端唯一索引含 `(profile, provider, remote_run_id, remote_artifact_id)` | `apps/work/src/shared/files/managed-file.ts#ManagedFileRemoteProvider`; `apps/work/src/main/files/file-association-store.ts`; `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts` | EXISTS |
| Local Chat / Runtime ChatRun | Existing Chat transport owners | 本地 Hermes Chat 与 Runtime event contract 正常工作；Skill mode 不复用 Runtime run contract | `apps/work/src/main/run-stream.ts`; `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | EXISTS |
| Local bundled Skills 管理 | `screens/Skills` | 管理本地 Hermes skills，不是员工 Skill Run Catalog | `apps/work/src/renderer/src/screens/Skills/Skills.tsx` | EXISTS |
| Provider Contract Delivery | NoDeskClaw Provider Owner | Provider 负责交付版本化、校验和可验证的 Consumer Contract Bundle；当前 Work 只有 identity lock 与 SHA256 清单，缺少本地可独立消费的 Bundle 内容 | `contracts/skill-run/v1.0.0/consumer-lock.json`; `contracts/skill-run/v1.0.0/SHA256SUMS` | PARTIAL external |

## Target End-State Inventory

| Capability | Target Production Owner | Target Behaviour | Classification |
|---|---|---|---|
| Chat Tab 执行模式 | Existing `Layout` / `ChatRun` owner | 每个 Tab 显式区分 `local-chat` 与 `skill-run`；Layout 入口只改变或创建 Tab mode | KEEP |
| Skill selection truth | Existing `Chat.tsx` owner | 每个挂载 Chat 只有一个 `SkillSelection | null`；提交时冻结 request snapshot | KEEP |
| Skill Catalog UI | Renderer `modules/skill-run` presentation module | Skill-only Catalog、搜索、分类、状态与 Selection Bar；不拥有第二份 selection state | KEEP |
| Composer capability projection | Existing `ChatInput` owner | Skill mode 隐藏本地模型/Reasoning/Context Folder/Expert 控件；附件按合同 fail-closed | KEEP |
| NoDeskClaw authorized transport | Main shared authorized transport | Expert compatibility 与 Skill Run client 复用 origin、JWT refresh、same-origin、错误清洗；不拥有 lifecycle | KEEP |
| Skill Catalog / call client | Existing Main `SkillRunGatewayClient` | 只消费已校验完整 Bundle 的 Skill Run contract；`tools/list`、`tools/call`、`/runs/*`；不完整 Bundle 时 `contract-unsupported`，不启用真实 Provider HTTP | MODIFY |
| Skill Run lifecycle | Existing Main `SkillRunService` | pending-submit、幂等、SSE/poll、cancel、result、artifact discovery、rehydrate；唯一 Work lifecycle owner；不新增第二套 service | KEEP |
| Skill Run IPC / Preload | Existing Main Skill Run IPC + Preload API | Renderer-safe narrow commands 与 Projection push；不暴露原始 URL/credential/event payload | KEEP |
| Renderer projection | Existing Renderer skill-run projection store | Main projection 的只读 UI cache；不是 Provider Run SoT | KEEP |
| Work Contract Bundle / lock Gate | Existing Work Skill Run consumer-lock owner | 完整 Bundle（manifest、SHA256 contents、schemas、fixtures）校验通过才视为 lock closed；identity-only 材料必须 fail-closed | MODIFY |
| Provider event parsing | Existing Main Skill Run contract adapter | 只接受已校验 Bundle 枚举的事件并生成 Renderer-safe activity projection；unknown fail-soft；禁止为缺失 schema 写补偿 parser | MODIFY |
| Run activity presentation | Renderer `modules/skill-run` | 只渲染 Work activity projection；MessageList 不理解 Provider DTO | KEEP |
| Session persistence | Existing Session / Continuation owner | 已有 versioned `skill-run` continuation 与 mode metadata；复用现有 session/messages/sidebar | KEEP |
| Skill Artifact | Existing File Platform owner | `skill-run` remote provider、run-scoped identity、授权预览/下载/Save As/Session Files | KEEP |
| Expert execution | Existing Expert owners | 仅 compatibility mode 和旧在途任务；新 Skill 调用不 fallback 到 Expert | MODIFY |
| Local Chat / Runtime ChatRun | Existing owners | 行为不变，Skill mode 不复用 Runtime run contract | KEEP |
| Local bundled Skills | Existing `screens/Skills` owner | 行为与命名边界不变 | KEEP |
| Provider Contract Bundle | NoDeskClaw Provider Owner | 唯一 Provider 需求输入：发布 identity、manifest、schema、fixtures、endpoint matrix 与 checksums；Work 不读取 Provider implementation | ADD external |
| Provider Run SoT | NoDeskClaw Agent | Work 不可直达；Backend 只提供由 Contract Bundle 定义的鉴权投影 | KEEP external |

## Change Classification

| Change ID | Capability | Classification | Decision |
|---|---|---|---|
| | Layout 一级「使用技能」入口 | KEEP | 现有 Layout/ChatRun owner 已持 execution mode transition；不增加新 View，不新增第二 Owner |
| | Chat Skill 选择与提交 | KEEP | 现有 Chat selection/submit owner 已含 Skill path；保持 Slash-first 和单一 selection truth |
| | Skill Catalog presentation | KEEP | 现有 `modules/skill-run` 只负责 Catalog/Selection/Projection，不拥有网络与会话 truth |
| | Skill Run lifecycle / IPC / projection | KEEP | `SkillRunService` 已是唯一 Work lifecycle owner；禁止再 ADD 并行 client/service/IPC |
| | Shared authorized transport | KEEP | 已抽取为 Main 内部共享 transport；Expert 和 Skill clients 不复制 auth/security 逻辑 |
| | Session / continuation / File Platform remote identity | KEEP | `skill-run` continuation 与 run-scoped remote identity 已落地；不新增平行 conversation/file database |
| C01 | Work Contract Bundle / lock Gate | MODIFY | 现有 consumer-lock owner 把 identity-only 文件当作通过；必须校验完整 Bundle，否则 `contract-unsupported`，禁止生产 HTTP 与 live-E2E |
| C02 | Skill Run Gateway / contract adapter | MODIFY | 现有 Gateway 与 parser 只消费已校验 Bundle；禁止补偿 parser，禁止在不完整 Bundle 下启用真实 Provider HTTP |
| C03 | 员工新 Skill 创建路径 | REPLACE | `expertSlug + skillName → task_id` 替换为 `tool_name → run_id`，无运行时自动 fallback |
| C04 | Expert 新建员工 Skill 路径 | REMOVE | v4.2 migration gate 后删除默认入口；在此之前仅 compatibility |
| C05 | Provider Contract Bundle | ADD | Provider Owner 交付完整 Bundle（external）；Work 只在 `contracts/skill-run/<version>/` 校验与消费 |
| | Local Chat、Runtime ChatRun、本地 Skills 管理 | KEEP | 保持现有 Owner 与行为 |

## Replacement / Removal Matrix

| Replaced Production Path | Existing Owner | Target Path | Removal Condition |
|---|---|---|---|
| 新员工 Skill 调用使用 `/api/v1/expert/mcp/{slug}` 与 `ExpertRequest` | Work Expert owners | `/api/v1/mcp` + Main `SkillRunService` + `/api/v1/runs/*` | Skill-first mode 完成生产灰度、无自动 fallback、旧在途任务可独立恢复后，默认入口停止创建 Expert Task |
| 新员工调用身份 `(expertSlug, skillName)` | Expert selection / contract | `tool_name` | Skill Run contract tag 被 Work checksum lock，Catalog 与 start 均使用同一 tool identity |
| 新员工执行身份 `task_id` | Expert Run Projection | Provider `run_id`，Renderer 表示为独立 provider run identity | Skill Run start、rehydrate、cancel、result、artifact 全部以 `run_id` 工作 |

## Compatibility Contract

### Expert compatibility

- **Current Consumer**: 已部署 `WORK-EXPERT-CONTRACT v1.0.2` 的 Expert Context、新旧在途 HermesTask 与历史 session。
- **Reason**: Skill Run 与 Expert Task 的身份、API、生命周期和 Artifact contract 不兼容；切换期间必须可恢复旧任务。
- **Removal Condition**: 新提交默认走 Skill Run；灰度期没有 silent fallback；所有旧在途 ExpertTask 已终态或仍可由独立 reader 恢复；移除前有专门 Removal PRD。
- **Removal Version**: 最早 Work v4.2。

兼容期使用显式 feature mode：`skill-first | expert-compat | local-only`。Mode 只影响新提交；已创建的 Skill Run 与 Expert Task 始终由各自 lifecycle reader 恢复。Skill-first 失败不得自动改走 Expert。

## Target Architecture

### Layout and Chat ownership

`View` 继续表示 Chat、Discover、Kanban 等大页面；`ChatRun.executionMode` 只表示当前 Chat Tab 的执行类型。它不保存 Provider run、Catalog 或 Skill selection truth。

点击“使用技能”时：

1. 当前 Tab 是空白 scratch：原地切为 `skill-run`；
2. 当前 Tab 已有内容或正在运行：激活同 profile 的空白 Skill Tab，或创建一个新的 Skill Tab；
3. 当前已是空白 Skill Tab：只激活，不重复创建；
4. 不取消其它后台 Tab 的运行。

“新建对话”执行对称的 `local-chat` transition。左侧 active 状态由 `view + active ChatRun.executionMode + scratch` 决定，不由是否已经选择 Skill 决定。

`Chat.tsx` 继续是每个已挂载 Chat 的选择与提交 owner。Skill selection 不复制到 Layout；每次提交或入队时生成不可变 snapshot，之后更换 Skill 只影响后续提交。

### UI composition

Skill mode 复用现有 `Chat.tsx`、`MessageList.tsx` 和 `ChatInput.tsx`：

- 未选择 Skill：主区域显示 Catalog Panel，发送禁用；
- 已选择 Skill：输入区上方显示 Selection Bar，可更换或清除；
- Catalog 有 loading、empty、search-empty、unauthorized、backend-unavailable、contract-unsupported 与 retry 状态；
- 搜索覆盖 title、name、description、category；分类来自合同，不硬编码业务分类；
- 本地模型、Reasoning、Fast Mode、Context Folder 与 Expert Context 控件从 Skill mode DOM 移除；
- Attachment 在公开 refs/upload contract 完成前禁用并解释原因；不得静默丢弃；
- 键盘支持搜索聚焦、Arrow、Enter、Esc，风险/状态不只依赖颜色；
- 新文案进入全部现有 locale。

### Identity and request snapshot

三个 identity 永不混用：

- `ChatRun.runId`: Renderer Tab identity；
- `clientRequestId`: 一次本地提交/幂等 correlation identity；
- Provider `run_id`: 一次服务器执行 identity，在 Work DTO 中显式表示为 provider run identity。

Renderer 的 `SkillSelection` 只包含展示与本地 callability 信息。Main 不信任 Renderer 传入的 input schema、release、risk 或 routing metadata；start 时按当前 auth scope 的 Catalog 重新确认 `toolName` 与可调用 schema，再构造 `tools/call`。

P0 只自动绑定合同可证明为单一 string prompt 的 Tool。存在额外必填字段、远程 `$ref`、组合/递归 schema 或不支持类型时 fail-closed，进入 `parameters-required` 或 `unsupported-schema`，不猜字段。

### Provider Contract Delivery Boundary

NoDeskClaw Provider Owner is the sole owner for all Provider requirements. `apps/work` may consume only an immutable, versioned Contract Bundle delivered by that owner; it must never scan, read, search, reference, or use as a test/discovery input any Provider checkout, branch, implementation source, database, internal route, service, or Agent API.

The Bundle must be imported at `contracts/skill-run/<version>/` and contain:

1. `consumer-lock.json` with release/tag identity, peeled commit SHA, Bundle version, and Bundle checksum;
2. `manifest.json` and `SHA256SUMS` that declare and verify every Bundle file;
3. Catalog, call, Public Run, Result, Artifact list/download, and SSE event request/response schemas;
4. endpoint method/path/header/status/error/retry matrix;
5. idempotency scope/TTL/conflict/replay and SSE authentication/replay semantics;
6. offline-replayable, redacted fixtures for success and safety/failure behavior.

The Contract Bundle is a Provider Owner release output, not a Provider-source mirror and not a Work schema SOT. Work may validate and consume it, or validate its behavior against a Provider Owner supplied controlled live environment; the environment is not a discovery channel. Missing, incomplete, or checksum-invalid Bundles require `contract-unsupported` / fail-closed behavior. Work must not infer a schema, write a compensating private parser, or enable real Provider HTTP.

The current `contracts/skill-run/v1.0.0/` has only release identity material (`consumer-lock.json` and `SHA256SUMS`), not the complete Bundle contents above. It does not independently close this PRD's Provider Contract Gate.

### Main process boundary

Main 是 Work 侧网络与 lifecycle 的最终 Owner：

- shared authorized transport 统一 Backend origin、fresh JWT、401/403 单次 refresh、timeout、same-origin allowlist 与错误清洗；
- `SkillRunGatewayClient` 只处理锁定合同的 Catalog、call 与 Run HTTP；
- `SkillRunService` 处理 durable pending-submit、幂等、Accepted、SSE/poll、cancel、result、artifact discovery、continuation 与 cleanup；
- Main 从 auth store 计算 `backendOrigin + org + user + loginGeneration` scope，Renderer 不可自报 org/user/origin；
- Catalog cache、pending-submit、projection、continuation、SSE 与 artifact 均按 auth scope 分区；logout、org/origin/generation/mode 变化立即失效；
- Provider paths, headers, status mappings, and retry rules come only from the verified Bundle endpoint matrix; returned URLs are permitted only as Bundle-allowed same-origin relative paths and must pass the allowlist;
- Renderer 只接收用户可显示、长度受限且已清洗的错误。

### IPC and Preload contract

新 surface 命名为 `window.hermesAPI.skillRun`，避免与本地 Skills 管理混名。最小 capability 为：

- list/refresh callable Skill tools；
- start/cancel Skill Run；
- rehydrate current session projections；
- retry artifact discovery；
- subscribe sanitized projection changes；
- 在 Approval contract 完成后增加 narrow approval decision。

不暴露通用 raw fetch、Provider URL、raw event subscription、直接 Artifact download、任意 resume 或 Renderer 指定 auth scope。Artifact 的 Preview/Save As/Materialize 继续通过 `window.hermesAPI.files`。

### Run lifecycle and concurrency

Provider Run 是远端事实源；Main SkillRunService 是 Work 本地 lifecycle owner；Renderer store 只是 projection。

每个 Chat Tab 同时最多一个 active Skill Run。运行中再次提交进入现有 queue；queue item 必须保存 text、toolName、arguments snapshot 和 clientRequestId，不得在出队时重读当前 selection。

Main 在发出 `tools/call` 前持久化 pending-submit。只有 Provider 合同保证幂等 key 的 scope、TTL、冲突与 accepted replay/query 语义后才启用生产 start；网络不确定时用同一 key 恢复，不生成第二次执行。

SSE 使用 Authorization header 与 `Last-Event-ID`；按稳定 event identity/sequence 去重，断线指数回退并以状态 poll 兜底。Terminal 状态单调；旧事件不得把终态回退。App 重启按 session continuation 恢复非终态 Run，不重复调用 Tool。

### Agent output adaptation

Provider event 必须先经过 Main contract parser，再变为 Work activity projection。MessageList 与 Chat components 不直接 switch Provider DTO。

P0 只呈现合同稳定的 Run phase、连接状态、最终 Result 和 Artifact。只有 Event contract 枚举 event type 与 payload 后，P1 才映射 reasoning、tool activity、clarify、approval 与 streaming delta。Unknown event 只推进去重游标并记录 bounded telemetry，不文本化 payload，不触发不可逆 UI 副作用。

### Session persistence

复用现有 Hermes Session/messages、sidebar cache 与 Session Continuation Store：

- 使用已有 versioned `skill-run` continuation item；
- session metadata 可恢复 execution mode 与最后合法 Skill display snapshot；
- accepted 后 upsert user/assistant transcript，后续 projection 更新同一 assistant row；
- terminal continuation 可按 retention policy 清理，但历史 transcript 与 File association 保留；
- 不直接写 NoDeskClaw Agent 数据库，不新增平行 Skill conversation SoT。

### Artifact and File Platform

Main 在合同化 Artifact list 后，把 descriptor upsert 为现有 ManagedFile remote resource，并关联当前 session 的 `agent-output` role。Renderer 只消费 `ManagedFileView`。

远端唯一性必须包含 `(profile, provider, remoteRunId, remoteArtifactId)`，避免 artifact id 仅在 Run 内唯一时冲突。`provider=skill-run` 与现有 Expert row 共存；预览、下载、checksum、size limit、atomic Save As 与 on-demand materialize 复用 File Platform security owner。

## Provider Contract Gate

Work PRD 可以批准，但任何 production implementation 或 live-E2E slice 在 Provider Owner 交付且 Work 校验完整 Contract Bundle 前不得启用。Gate 的唯一证据是本仓库 `contracts/skill-run/<version>/` 中的 Bundle；Provider source, branch, checkout, raw manifest path, or verbal confirmation are not evidence.

1. Skill-only Catalog discriminator，或等价的稳定 endpoint 语义；当前 descriptor 无法区分 Skill 与 Public Connector；
2. Public Run view，禁止把含 org/user/internal snapshot 的 Agent `RunRecord` 直接作为 Work DTO；
3. Result response schema；
4. Artifact list envelope、descriptor 与 authenticated download response contract；
5. Event type 的 discriminated union、payload schema、stable event identity 与 SSE auth/replay semantics；
6. Approval descriptor、decision request/response 与幂等语义；
7. `X-Idempotency-Key` 的转发、scope、TTL、冲突及 Accepted replay/query semantics；
8. endpoint method/path/header/status/error/cache/retry contract；
9. Attachment refs/upload contract（启用附件前）。

Provider Owner delivers the Bundle; the existing Work consumer-lock owner only validates release identity, checksums, schemas, and fixtures offline. It must not treat identity-only `consumer-lock.json` + `SHA256SUMS` as a closed Gate. The existing v1.0.0 lock/SHA256 material is insufficient to close this Gate. ROADMAP M0 must be re-accepted against the complete Bundle. Work must not compensate missing contract material with Provider-source inspection, private parser inference, or observation of a live environment.

## Security and Trust Boundary

- Work only connects to the Provider public backend surface defined by the verified Contract Bundle; Agent internal URLs/tokens do not enter Work;
- Renderer 不持有 JWT、Backend origin、SSE credential、download URL 或内部 routing；
- Main handler 验证 sender、session/profile、auth generation、输入长度与 Tool schema；
- Backend 是 Auth/RBAC/Policy/Approval 的最终 enforcement owner；Renderer guard 只提供 UX；
- Tool disappearance、unpublish、权限变化或 auth scope drift 均 fail-closed；不得自动换 Tool 或 Expert；
- 日志与 telemetry 不记录 prompt、JWT、download token、absolute path、Result body 或 Artifact bytes；
- Artifact bytes 的网络、大小、checksum、临时文件和 atomic rename 继续由 File Platform 控制。

## Rollout and Removal

灰度顺序：developer → internal pilot → production default。Feature mode 只影响新提交，回滚只停止新 Skill Run 创建，不破坏已创建 Run 的恢复。

生产默认切换前必须满足：

- Provider Contract Gate is closed by a validated complete Bundle and Work checksum lock;
- contract/main/ipc/renderer/e2e tests 通过；
- Skill Run 成功率、reconnect、duplicate prevention、artifact failure 与 unauthorized 指标可观测；
- Expert 与 Skill Run reader 可并存恢复各自任务；
- 无 silent fallback；
- 旧 Expert 默认创建入口的 REMOVE 由单独 v4.2 Removal PRD 执行。

## Test Strategy

- Contract tests run only against the Provider Owner Bundle's manifest/checksum, Catalog discriminator, Public Run, Result, Artifact, Event, Approval, SSE, and idempotency fixtures; Provider source and internal tests cannot substitute;
- Main tests：auth scope cache、same-origin、refresh、pending-submit、replay、terminal monotonic、poll fallback、logout disposal；
- IPC tests：sender/input validation、projection sanitization、无 credential/URL/raw payload 泄漏；
- Renderer tests：Layout mode transition、单一 selection truth、Catalog states、queue snapshot、toolbar DOM removal、keyboard/a11y；
- Persistence tests：restart rehydrate 不重复 start、session transcript upsert、mode metadata、terminal cleanup；
- File tests：run-scoped remote identity、dedupe、preview/download size/checksum/security；
- Cross-project tests：同一个 idempotency key 只产生一个 Run，SSE replay 无重复 UI side effect，unpublish/auth drift fail-closed。

## Acceptance Criteria

1. Layout 显示一级“使用技能”；空白 scratch 原地切 mode，已有内容时创建/激活独立 Skill Tab，不取消其它运行。
2. `View` 不新增 Skill Chat 页面；现有 Chat/MessageList/ChatInput 被复用。
3. `ChatRun` 只拥有 execution mode；Skill selection truth 在当前 Chat 中唯一，提交/排队保存不可变 snapshot。
4. 未选择 Skill 时展示 Catalog 并禁用发送；选择后展示 Selection Bar；全部错误/空状态可恢复。
5. Skill mode 不渲染本地模型、Reasoning、Fast Mode、Context Folder 或 Expert 控件；附件未合同化时明确禁用。
6. Catalog 只显示合同可证明为 Skill 的项；缺少 discriminator 时显示 contract unsupported，而不是猜测过滤。
7. Work locks only the complete, tag/release-identified and checksummed Skill Run Contract Bundle delivered by Provider Owner; identity-only `consumer-lock.json` + `SHA256SUMS` is not a closed lock and must surface `contract-unsupported` for Catalog, production start, and live-E2E. The old work-expert lock remains unchanged and Provider source is never a Contract input.
8. 新调用只使用 `tool_name` 与 `run_id`，不发送 Expert/Agent/Runtime/Profile/Workspace routing 字段。
9. Provider `run_id`、Renderer `ChatRun.runId` 与 `clientRequestId` 在类型、持久化和日志中不可互换。
10. Renderer 无法取得 JWT、Backend/Agent URL、raw Provider event、download token 或 absolute path。
11. Main 是唯一 Skill Run lifecycle owner；Renderer store 仅为 projection。
12. 不确定网络与 App 重启使用同一 idempotency identity 恢复，跨端证明只创建一个 Provider Run。
13. SSE replay 去重、terminal 单调、poll fallback 和 cleanup 可验证；旧事件不能回退终态。
14. 同一 Chat Tab 至多一个 active Skill Run；queue item 不因用户更换 Skill 而改路由。
15. 取消只调用 Skill Run cancel；不得误调用 Local Chat abort。Approval 未合同化时只读等待，不显示伪交互。
16. 只有合同枚举事件可产生 activity UI；unknown payload 不文本化、不触发不可逆 UI side effect。
17. Result 更新同一 assistant transcript；restart 后 session mode、在途 projection 与历史可恢复且不重复 start。
18. Artifact 进入现有 File Platform，以 run-scoped remote identity 去重，并通过现有 Preview/Save As/Materialize API 使用。
19. 不得新增 Skill conversation/file parallel SoT 或直接 Artifact download IPC。
20. Skill-first、Expert compatibility 与 Local Chat 路径显式互斥；一条消息不会同时创建 Skill Run 与 ExpertTask。
21. Skill-first 失败不自动 fallback；回滚停止新建但保留 Skill/Expert 各自 reader。
22. Expert 默认创建入口的最终删除满足 Compatibility Contract，并由独立 Removal PRD 执行。

## Definition of Done

1. Provider Owner Contract Bundle and Work Consumer Lock are present and content-validated; no schema is unverified and no Work implementation/test input comes from Provider source.
2. Contract、Main、IPC、Renderer 与 Session 聚焦测试全部通过，无回归。
3. 生产切换前通过完整 Checklist，历史任务可独立恢复且无 silent fallback。

## Source Anchors

### Work

- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#Layout`
- `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#ChatRun`
- `apps/work/src/renderer/src/screens/Layout/chatRuns.ts#isScratchRun`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#Chat`
- `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx`
- `apps/work/src/main/auth/authorized-backend-transport.ts#createAuthorizedBackendTransport`
- `apps/work/src/main/expert/expert-gateway-client.ts#createExpertGatewayClient`
- `apps/work/src/main/expert/expert-run-service.ts#createExpertRunService`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunConsumerLock`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-session-materialize.ts`
- `apps/work/src/main/skill-run/skill-run-ipc.ts`
- `apps/work/src/preload/skill-run-api.ts`
- `apps/work/src/shared/skill-run.ts#SkillRunContinuationItem`
- `apps/work/src/shared/session-continuation.ts#DesktopSessionContinuationItem`
- `apps/work/src/main/session-continuation-store.ts#normalizeContinuationItems`
- `apps/work/src/shared/files/managed-file.ts#ManagedFileRemoteProvider`
- `apps/work/src/main/files/file-association-store.ts`
- `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts`
- `apps/work/src/main/app/start.ts#startMainProcess`
- `apps/work/lat.md/expert-execution.md`
- `apps/work/lat.md/file-platform.md`
- `apps/work/lat.md/skill-run.md`

### Contracts and Provider Owner delivery

- `contracts/work-expert/v1.0.2/consumer-lock.json`
- `docs/architecture/contract-flow.md`
- `contracts/skill-run/v1.0.0/consumer-lock.json` (current identity-only material)
- `contracts/skill-run/v1.0.0/SHA256SUMS` (current identity-only material)
- Provider Owner delivered Contract Bundle at `contracts/skill-run/<version>/` (required before any production or live-E2E Provider integration)
