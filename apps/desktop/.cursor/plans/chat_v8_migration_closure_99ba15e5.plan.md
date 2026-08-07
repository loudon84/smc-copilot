---
name: chat v8 migration closure
overview: 按 PRD 8.0.1 将「迁移框架」推进为「迁移闭环」：分 5 个 PR 依次完成 Session/Runtime 闭环、Copilot UI 生产接管、Work/Expert/MCP 重接、File Platform 生产化、多会话与验收切换。按用户要求默认引擎保持 copilot（不回退 legacy），因此每个 PR 都必须保证 copilot 引擎在生产可用。
todos:
  - id: pr1-controller
    content: "PR1: 新增 modules/chat/controller/（useChatController + chatReducer + chatHistoryMapper + chatRuntimeEventReducer），集中 chat 状态"
    status: completed
  - id: pr1-session
    content: "PR1: Session 生命周期——挂载载入历史、submit 带 history、消费 session.started 保存 activeSessionId 并回写 HermesWorkspaceContext、后续 resumeSessionId、New Chat 重置"
    status: completed
  - id: pr1-abort
    content: "PR1: Main finishCompleted/finishFailed/finishCancelled 互斥 guard，abort 必 resolve submit Promise、停 reconciler、清 activeRun"
    status: completed
  - id: pr1-workparams
    content: "PR1: AiosCopilotChatHost 修正 expertId/teamId/expertRunId/workMode/invocationSource；ChatSubmitInput+toHermesPayload 增加 permissionMode 独立字段"
    status: completed
  - id: pr1-runtime-events
    content: "PR1: 扩展 hermes.ts ChatCallbacks + sse-parser 事件解析 + reconciler 真实输出（去重/cursor/新session即启/完成再补一次）"
    status: completed
  - id: pr1-tests
    content: "PR1: 重命名/新增 runtime 单测（manager/submit/abort/event-routing/reconciler）+ useChatController 多轮会话测试"
    status: completed
  - id: pr2-viewitem
    content: "PR2: 定义 canonical ChatViewItem 判别联合 + 三向 mapper（SessionDB→ViewItem / RuntimeEvent→ViewItem / ViewItem→History）"
    status: completed
  - id: pr2-surface
    content: "PR2: 拆除占位 ChatSurface，迁 source/** 纯 UI 到 components/{messages,composer,reasoning,tools,clarify,navigator}，依赖替换为 Port/Slot，组合 CopilotChatSurface"
    status: completed
  - id: pr2-statusbar
    content: "PR2: TaskStatusBar 改读 Controller runState + Expert/Skill/Profile/Tool/Duration/Usage"
    status: completed
  - id: pr2-compile
    content: "PR2: 新增 tsconfig.chat.json + typecheck:chat、移除 chat 相关 tsconfig exclude、增强 verify.mjs、CSS 作用域 .copilot-chat-root"
    status: completed
  - id: pr3-prompthint
    content: "PR3: aiosWorkPromptAdapter 接回 buildExpertPromptHint/PromptHintComposer/Selected Skill/Permission Mode/MCP Server"
    status: completed
  - id: pr3-expertrun
    content: "PR3: 打通 Expert Run 闭环（message_sent→tool→artifact→run completed）与 Team dispatch"
    status: completed
  - id: pr3-clarify-approval
    content: "PR3: 新增 chat-runtime:command（clarify.respond/approval.approve/deny）Shared+Main+Preload+d.ts+Controller/UI"
    status: completed
  - id: pr4-fileplatform
    content: "PR4: _upstream 逐模块迁入 chat-files 生产目录，统一 shared/files 与 shared/chat-files，纳入 tsconfig.node，真实 IPC 取代内存 Map，补单测删副本"
    status: completed
  - id: pr4-fileport-ui
    content: "PR4: ChatFilesPort 拆 saveManagedFileAs/saveLocalPathAs；接入 SessionFilesPanel/FilePreviewPanel；Draft 迁移与重启恢复；预览矩阵"
    status: completed
  - id: pr5-multichat
    content: "PR5: ChatWorkspaceManager + ChatRunRegistry，多会话后台运行与并发隔离"
    status: completed
  - id: pr5-ci-e2e
    content: "PR5: ci 加入 typecheck:chat/check:chat-boundaries/build，补 Electron E2E 验收矩阵"
    status: completed
  - id: pr5-docs
    content: "PR5: 按 rule 007 同步 AGENTS.md / API_CONTRACTS / docs/renderer；跑最终验收命令"
    status: completed
isProject: false
---

# Chat 模块 v8 迁移闭环实施计划（PRD 8.0.1）

## 决策与约束

- 全量实施 PRD 8.0.1 的 5 个 PR（v8.1.0 → v8.2.1）。
- **默认引擎保持 `copilot`**（覆盖 PRD §5.1 的「暂回 legacy」建议）。因此 PR1 的 Session/History/Abort 闭环是生产阻断项，必须先落地。
- 保留 `VITE_CHAT_ENGINE=legacy|copilot` 开关与 `HermesDefaultWebChatSurface.legacy.tsx`，直至 PR5 验收通过。
- 遵守三层进程边界：Renderer 只经 `window.chatRuntime` / `window.chatFiles`；新增 IPC 必须 Main 注册 → Preload 封装 → `index.d.ts` → `docs/API_CONTRACTS.md`。

## 现状锚点（已核对）

- Main 运行时 [chat-runtime-ipc.ts](src/main/chat-runtime/chat-runtime-ipc.ts) 已传 `history`、已发 `session.started`，但 **abort 分支不 resolve submit Promise**（PRD §3.8）；`toHermesPayload` 未处理 `permissionMode`。
- Renderer [ChatSurface.tsx](src/renderer/src/modules/chat/components/ChatSurface.tsx) 为占位实现：`submit(text)` 不带 history、不消费 `session.started`、`session/models/files` Port 未使用（PRD §3.1–3.4）。
- 入口 [AiosCopilotChatHost.tsx](src/renderer/src/screens/Hermes/pages/Chat/AiosCopilotChatHost.tsx)：`expertId={slug}`、`workMode={permissionMode}`、缺 `expertRunId`（PRD §3.9）；`TaskStatusBar` 固定 `status="ready"`（§3.11）；无 Prompt Hint（§3.10）。
- Workspace 上下文 [HermesWorkspaceContext.tsx](src/renderer/src/screens/Hermes/context/HermesWorkspaceContext.tsx) 已含 `activeExpertId/activeTeamId/activeRunId/workMode`。
- Hermes 回调 [hermes.ts](src/main/hermes.ts) 仅 `onChunk/onDone/onError/onToolProgress/onUsage`；[sse-parser.ts](src/main/sse-parser.ts) 仅识别 `hermes.tool.progress` + 普通 `delta.content`（§3.6）。
- 迁入完整 UI 在 `src/renderer/src/modules/chat/source/**`，被 [tsconfig.web.json](tsconfig.web.json) L10 排除；完整 File Platform 在 `src/main/chat-files/_upstream/**`（用 `shared/files`），生产用的是内存 Map 薄桥 [chat-files-ipc.ts](src/main/chat-files/chat-files-ipc.ts)（§3.5）。
- 校验脚本 [scripts/chat-migration/verify.mjs](scripts/chat-migration/verify.mjs) 仅做拷贝边界检查；`ci` 未含 `build`（§3.12）。

---

## PR1 · v8.1.0 Session / Runtime 闭环（最高优先级）

### 1.1 Renderer Chat Controller
新增 `src/renderer/src/modules/chat/controller/`：`useChatController.ts`、`chatReducer.ts`、`chatHistoryMapper.ts`、`chatRuntimeEventReducer.ts`。集中管理 `activeSessionId / activeRunId / messages / streamingMessage / reasoning / toolEvents / usage / attachments / selectedModel / queue / runState / lastError`（PRD §5.2）。占位 `ChatSurface` 的散状态迁入 Controller。

### 1.2 Session 生命周期（PRD §5.3）
- 挂载时若有 `forcedSessionId` → 经 `ChatSessionPort.getMessages` 载入历史 → 映射为 canonical model。
- 每次 `submit` 传入当前 History（`chatHistoryMapper`），不再用默认 `[]`。
- 消费 `session.started` → 保存 `activeSessionId` → 回写 `HermesWorkspaceContext`（新增 `setActiveSessionId` 或复用现有 patch）→ 后续请求用 `resumeSessionId`。
- New Chat 清理 session / model override / 文件状态；session 切换停止旧 run 的 UI 更新。

### 1.3 Main Abort 生命周期（PRD §3.8 / §5.4）
在 [chat-runtime-ipc.ts](src/main/chat-runtime/chat-runtime-ipc.ts) 引入互斥 `finishCompleted() / finishFailed() / finishCancelled()`（各只执行一次的 guard）。`setActiveRun.abort` 调 `finishCancelled()` 保证 submit Promise 一定 resolve；停 Reconciler、清 activeRun、保留 partial 内容。

### 1.4 Work 参数映射（PRD §3.9 / §5.5）
- [AiosCopilotChatHost.tsx](src/renderer/src/screens/Hermes/pages/Chat/AiosCopilotChatHost.tsx) 改为 `expertId={workspace.activeExpertId}`、`teamId={workspace.activeTeamId}`、`expertRunId={workspace.activeRunId}`、`workMode={workspace.workMode}`、`invocationSource` 按 `workspace.mode` 推导。
- `ChatSubmitInput`（[chat-runtime-contract.ts](src/shared/chat-runtime/chat-runtime-contract.ts)）新增 `permissionMode?: "default" | "ask_each_time"`；`toHermesPayload` 映射；禁止再把权限模式塞进 `workMode`。

### 1.5 Runtime 事件补齐（PRD §7.1–7.3，落在 PR1 打基础）
- [hermes.ts](src/main/hermes.ts) `ChatCallbacks` 增加 `onSessionStarted / onReasoningDelta / onToolEvent / onClarifyRequested / onApprovalRequested`（可选，向后兼容）。
- [sse-parser.ts](src/main/sse-parser.ts) 识别 `hermes.session.started / hermes.reasoning.delta / hermes.tool.event / hermes.clarify.requested / hermes.approval.requested / hermes.usage / hermes.completed / hermes.failed`。
- [chat-session-reconciler.ts](src/main/chat-runtime/chat-session-reconciler.ts) 真正输出：Session DB diff（message id / tool call id 去重 + cursor）→ `emitChatRuntimeEvent`；拿到新 sessionId 立即启动，completed 后再 reconcile 一次。

### 1.6 测试
`tests/` 新增/重命名：`chat-runtime-manager.test.ts`（重命名自现 `chat-runtime-ipc.test.ts`）、`chat-runtime-submit.test.ts`、`chat-runtime-abort.test.ts`、`chat-runtime-event-routing.test.ts`、`chat-session-reconciler.test.ts`；Renderer `useChatController` 测试（第一条建 session、第二条 resume、history 正确、cancel 保留 partial）。

**验收**：copilot 引擎连续三轮对话属于同一 Hermes Session；Abort 后 submit Promise 完成。

---

## PR2 · v8.1.1 Copilot UI 生产接管

### 2.1 统一消息模型（PRD §6.3）
`controller/` 定义 canonical `ChatViewItem` 判别联合（User/Assistant/Reasoning/ToolCall/ToolResult/Clarify/Approval/Error）+ 三向 mapper：Session DB→ViewItem、Runtime Event→ViewItem、ViewItem→Hermes History。

### 2.2 拆除占位 ChatSurface（PRD §6.1–6.2）
将 `source/**` 纯 UI 组件移入正式目录 `components/{messages,composer,reasoning,tools,clarify,navigator}`，Electron/Runtime/Profile/File/Navigation 调用替换为 Port；WebPreview→`ChatNavigationPort`，Remote/Worktree→可选 Slot 或删除。`ChatSurface` 重构为组合容器（MessageList / ReasoningRow / ToolActivityGroup / ClarifyCard / PromptNavigator / ChatInput / ModelPicker / ReasoningEffortPicker / QueuedMessages + slots）。`source/` 仅作上游快照。

### 2.3 动态 TaskStatusBar（PRD §3.11 / §8.2）
`TaskStatusBar` 读 Controller 的 `runState`（idle/creating/streaming/waiting_approval/completed/failed/cancelled）+ Expert/Skill/Profile/当前 Tool/Duration/Usage。

### 2.4 编译体系（PRD §11.1）
新增 `tsconfig.chat.json`（include Chat 生产模块 + `shared/chat-runtime` + `shared/chat-files`）+ `typecheck:chat` 脚本；逐步移除 [tsconfig.web.json](tsconfig.web.json) 的 chat 相关 exclude；增强 [verify.mjs](scripts/chat-migration/verify.mjs)（import 解析、`_upstream` 生产引用、Core 直接 `window.*`、Adapter 边界）。CSS 全部作用域 `.copilot-chat-root`。

**验收**：不再出现占位 textarea / 简单 message-row；`typecheck:chat` 通过。

---

## PR3 · v8.1.2 Work / Expert / MCP 重接

### 3.1 Prompt Hint（PRD §3.10 / §8.1）
新增 `adapters/aios/aiosWorkPromptAdapter`，接回 `buildExpertPromptHint` / `PromptHintComposer` / Selected Expert / Selected Skill / Permission Mode / MCP Server Name；Work 业务逻辑留在 Adapter，不回灌 Chat Core。

### 3.2 Expert Run 闭环（PRD §8.3）
验证 `beforeExpertChatSend → message_sent → tool_call → waiting_approval → message_completed → artifact_created → run completed`；Team Chat 首条消息触发 `dispatchTeamRun`。复用 [expert-run-bridge](src/main/hermes-experts/expert-run-bridge.ts)（Main 侧已接线，补齐 `expertRunId` 传递后打通）。

### 3.3 Clarify / Approval 响应通道（PRD §7.4）
新增 `chat-runtime:command`（`clarify.respond / approval.approve / approval.deny`）：Shared 契约 + Main handler + Preload `window.chatRuntime.command` + `index.d.ts` + Controller/UI 接线。

**验收**：Expert 与 Skill 真正进入 Hermes 执行链路，非仅 UI 显示。

---

## PR4 · v8.2.0 File Platform 生产化

### 4.1 生产迁移（PRD §9.1–9.2）
将 `src/main/chat-files/_upstream/**` 逐模块迁入 `src/main/chat-files/{domain,stores,services,parsers,jobs,ipc}`；统一 `shared/files` 与 `shared/chat-files`（收敛为一套契约）；纳入 `tsconfig.node.json`；用真实 IPC 取代内存 Map 薄桥 [chat-files-ipc.ts](src/main/chat-files/chat-files-ipc.ts)；每迁一块补单测并删对应 `_upstream` 副本。

### 4.2 File Port 语义拆分（PRD §9.4）
`ChatFilesPort` 拆 `saveManagedFileAs(fileId)` 与 `saveLocalPathAs(filePath)`，避免 ID/路径混用。

### 4.3 UI 与恢复（PRD §9.3）
接入 `SessionFilesPanel` / `FilePreviewPanel`；覆盖点击/拖拽/剪贴板/Draft 附件迁移/Context Folder/Agent Output/Markdown+Code+Image+PDF+Office 预览/Save As/Reveal/Open External/安全路径/重启后关系恢复。

**验收**：生产路径删除内存 Session File Map；重启后文件关系恢复。

---

## PR5 · v8.2.1 多会话与验收切换

### 5.1 多会话后台运行（PRD §10）
新增 `ChatWorkspaceManager`（`ChatRunRegistry`：runId↔sessionId/profileId/expertRunId/title/loading/unread）；三个 Chat 可并发、事件只进各自 Controller、切页不停后台、Abort 只停当前、完成后可通知。

### 5.2 CI 与验收矩阵（PRD §11.3 / §12）
`ci` 加入 `check:chat-boundaries`（增强版）+ `typecheck:chat` + `build`；补 Electron E2E 场景（两轮对话 / Expert Artifact / Team Dispatch / 三并发 / 中止其一 / PDF 预览 / Markdown 另存 / 重启恢复 / local·remote·ssh / 双引擎切换）。

### 5.3 收尾
默认引擎已是 copilot（无需切换）；验收通过后 legacy 进入待删除（本次保留开关）。按 rule 007 同步 `AGENTS.md` / `docs/API_CONTRACTS.md`（`chat-runtime:command`、`chatFiles` 全量 channel）/ `docs/renderer/**`。

**最终验收命令**
```bash
npm run check:no-reference-imports
npm run check:chat-boundaries
npm run typecheck:chat
npm run typecheck
npm run test
npm run build
```