---
name: chat-module-v8-migration
overview: 按 PRD v8.0 将 copilot-desktop 的 Chat 模块作为 UI/交互内核迁入 ai-os-desktop，先建立 runId 隔离的 Chat Runtime 跨进程契约与可复现拷贝/CI 基础设施，再分阶段迁移消息与 Composer UI、File Platform，最后用 Slot + Adapter 重接 Work/Expert/MCP 能力并切换入口（保留 legacy 与 VITE_CHAT_ENGINE 开关）。
todos:
  - id: phase0-infra
    content: 阶段0：新增 scripts/chat-migration/（chat-copy-map.json + inventory/copy/rewrite-imports/verify.mjs）与 scripts/check-no-reference-imports.mjs，package.json 注册 check:no-reference-imports / check:chat-boundaries 并入 ci
    status: completed
  - id: phase1-shared
    content: 阶段1：新增 src/shared/chat-runtime/（contract/events/errors），定义 ChatSubmitInput 与 runId 判别联合 ChatRuntimeEvent
    status: completed
  - id: phase1-main
    content: 阶段1：新增 src/main/chat-runtime/（manager 用 activeRuns Map、event-emitter 用 chat-runtime:event、session-reconciler 750ms 回补、ipc submit/abort(runId)），在 index.ts 注册并复用 hermes.sendMessage 与 expert-run-bridge
    status: completed
  - id: phase1-preload-ports
    content: 阶段1：新增 preload/chat-runtime-api.ts（exposeInMainWorld chatRuntime，onEvent 返回 unsubscribe）+ index.d.ts 类型；新增 modules/chat/ports/*（Runtime/Session/Files/Models/Navigation）
    status: completed
  - id: phase1-verify
    content: 阶段1验收：加 tests 验证 abort(runId) 只取消指定 run、三并发 runId 不串流
    status: completed
  - id: phase2-copy-ui
    content: 阶段2：运行拷贝脚本迁入 core/*、Messages/Reasoning/Tools/Clarify/ChatInput/Slash/HistoryRow/QueuedMessages、useChatScroll；新增 useChatEvents/useChatActions/useChatQueue 与 ChatSurface（含 slots）
    status: completed
  - id: phase2-css-deps
    content: 阶段2：抽取 Chat 相关选择器到 modules/chat/styles/copilot-chat.css 并作用域 .copilot-chat-root；按 import graph 逐个安装缺失依赖（排除 three/ethers/ws/@react-three）
    status: completed
  - id: phase2-verify
    content: 阶段2验收：普通消息/Reasoning/Tool 分组/Clarify/Usage/Abort 全通
    status: completed
  - id: phase3-files-shared-main
    content: 阶段3：shared/files → shared/chat-files；main/files + attachment/context-folder/model-override stores → main/chat-files 并注册 IPC
    status: completed
  - id: phase3-files-preload-ui
    content: 阶段3：files-api → preload/chat-files-api.ts 暴露 window.chatFiles + index.d.ts；迁 components/files 与 hooks/files 到 modules/chat，接入 SessionFilesPanel/FilePreviewPanel
    status: completed
  - id: phase3-verify
    content: 阶段3验收：附件(点击/拖拽/剪贴板)、上下文文件、Agent 输出、Preview、Load More、Save As、Reveal 可用
    status: completed
  - id: phase4-adapters-slots
    content: 阶段4：实现 adapters/aios/*（Runtime/Session/Files/Models/Navigation，Navigation 走 aiosBrowser + web-operator Tab）；通过 slots 接回 HermesActiveExpertBar/TaskStatusBar/WorkChatContextBar/WorkComposerControls/PromptHintComposer
    status: completed
  - id: phase4-verify
    content: 阶段4验收：Default/Expert/Team/MCP Host Chat 共用同一 ChatSurface
    status: completed
  - id: phase5-cutover
    content: 阶段5：HermesDefaultChatPage 改为 AiosCopilotChatHost→CopilotChatSurface，保留 legacy 与 VITE_CHAT_ENGINE 开关；同步 AGENTS.md/API_CONTRACTS/docs-renderer 文档
    status: completed
  - id: phase5-acceptance
    content: 阶段5验收：跑通 PRD §12 验收矩阵与 check:no-reference-imports/typecheck/test/build
    status: completed
isProject: false
---

# Chat 模块 v8.0 迁移实施计划

## 核心原则（PRD §14）

- 不覆盖现有 `src/renderer/src/screens/Hermes/pages/Chat`，新代码进 `src/renderer/src/modules/chat`
- 禁止从 `references/**` 运行时 import（CI 拦截）
- 先迁 runId 事件契约，再迁 UI；源 Chat 作内核，AI-OS Work 作 Host
- 只保留一套 Chat 状态机、一套浏览器容器（WebOperator）
- CSS 全部作用域到 `.copilot-chat-root`

## 现状锚点

- 目标现用全局通道 `chat-chunk/done/error/tool-progress/usage` + 单一 `chatAbortRef`，见 [src/main/hermes-default-chat/hermes-default-chat-ipc.ts](src/main/hermes-default-chat/hermes-default-chat-ipc.ts)、preload [src/preload/hermes-default-chat-api.ts](src/preload/hermes-default-chat-api.ts)
- 入口 [HermesDefaultChatPage.tsx](src/renderer/src/screens/Hermes/pages/Chat/HermesDefaultChatPage.tsx) → `HermesDefaultWebChatSurface`
- 参考实现的 runId 隔离 runtime 已存在于 `references/copilot-desktop/src/main/ipc/register.ts`（`activeRuns` Map + `safeSend` + `abort-chat(runId)`），可作为 Main 侧蓝本
- Preload 通过 `contextBridge.exposeInMainWorld` 暴露（[src/preload/index.ts](src/preload/index.ts) L885-906）；Main 在 [src/main/index.ts](src/main/index.ts):464 注册 chat IPC

---

## 阶段 0：迁移基础设施（可复现拷贝 + CI）

- 新增 `scripts/chat-migration/`：`chat-copy-map.json`、`inventory.mjs`、`copy.mjs`、`rewrite-imports.mjs`、`verify.mjs`（PRD §10）
  - `copy.mjs`：按 map 复制并跳过 `excludes`（`WebPreviewPanel.tsx`/`RemoteFolderPicker.tsx`/`*.snap`）
  - `rewrite-imports.mjs`：重写 `../../` 相对 import 到目标模块路径；`shared/files` → `shared/chat-files`
  - `verify.mjs`：扫描未解析 import + 禁止 `references/` 引用，输出 manifest
- 新增 `scripts/check-no-reference-imports.mjs`（改写参考版 FORBIDDEN 为 `/references\//i`，仅扫 `src/`）
- `package.json` 增加 `check:no-reference-imports`、`check:chat-boundaries`，并入 `ci`
- 验收：脚本可空跑、CI 命令注册成功

## 阶段 1：runId 隔离的 Chat Runtime 契约（最高优先级）

- Shared：新增 `src/shared/chat-runtime/`
  - `chat-runtime-contract.ts`（`ChatSubmitInput`、`ChatHistoryMessage`、`ChatModelOverride`、`invocationSource`）
  - `chat-runtime-events.ts`（`ChatRuntimeEvent` 判别联合：session.started/message.delta/reasoning.delta/tool.progress/tool.event/clarify.requested/approval.requested/usage/completed/failed/cancelled）
  - `chat-runtime-errors.ts`
- Main：新增 `src/main/chat-runtime/`
  - `chat-runtime-manager.ts`：`const activeRuns = new Map<string, ChatRunHandle>()` 取代 `chatAbortRef`
  - `chat-event-emitter.ts`：统一 `event.sender.send("chat-runtime:event", { type, runId, ... })`（安全发送，sender 失效即 abort 本 run）
  - `chat-session-reconciler.ts`：运行中 750ms 回补 Session DB（reasoning/tool result）
  - `chat-runtime-ipc.ts`：`chat-runtime:submit`、`chat-runtime:abort(runId)`；复用现有 `hermes.sendMessage`、model 解析、`expert-run-bridge`（`beforeExpertChatSend`/`bridgeChatToolProgress`/`afterExpertChatComplete` 仍在 Main）
  - 在 [src/main/index.ts](src/main/index.ts) 注册（与现有 `registerHermesDefaultChatIpc` 并存，供灰度）
- Preload：新增 `src/preload/chat-runtime-api.ts`，`contextBridge.exposeInMainWorld("chatRuntime", ...)`；`onEvent` 返回 unsubscribe；在 [src/preload/index.d.ts](src/preload/index.d.ts) 补类型
- Renderer ports：新增 `src/renderer/src/modules/chat/ports/`（`ChatRuntimePort`/`ChatSessionPort`/`ChatFilesPort`/`ChatModelsPort`/`ChatNavigationPort`）
- 验收：`abort(runId)` 只取消指定 run；三个并发 runId 不串流（加 `tests/chat-runtime-ipc.test.ts`）

## 阶段 2：迁移消息与 Composer UI

- 运行拷贝脚本迁入 `src/renderer/src/modules/chat/`：
  - core：`types.ts`/`chatMessages.ts`/`sessionHistory.ts`/`liveToolEvents.ts`/`liveReasoningEvents.ts`/`contextWindows.ts`
  - components：`Messages/`（MessageList/MessageRow）、`Reasoning/`、`Tools/`、`Clarify/`、`ChatInput/`、`Slash/`、`HistoryRow`、`QueuedMessages`
  - hooks：`useChatScroll`；新增 `useChatEvents(ChatRuntimePort)`（替代 `useChatIPC`）、`useChatActions`（注入 Runtime/Command/Navigation Port）、`useChatQueue`
  - `ChatSurface.tsx`：接受 slots（contextBar/composerControls/statusBar/activeExpert/rightPanel）
- 暂不迁：SessionFiles/FilePreview/WebPreview/Worktree
- 样式：新增 `src/renderer/src/modules/chat/styles/copilot-chat.css`，抽取 `.chat-*/.message-*/.reasoning-*/.tool-*/.composer-*/.slash-*` 并作用域到 `.copilot-chat-root`（不复制 `main.css`）
- 依赖：按实际 import graph 逐个安装（候选 `date-fns`/`dompurify`/`highlight.js`/`mermaid`/`motion`/`react-file-icon`/`react-hot-toast`/`thinking-orbs`/`@wesbos/code-icons`/`vscode-material-icons`）；禁止 `three`/`ethers`/`ws`/`@react-three`
- 验收：普通消息、Reasoning、Tool 分组、Clarify、Usage、Abort 可运行

## 阶段 3：迁移 File Platform

- Shared：`shared/files/**` → `src/shared/chat-files/**`（纯契约，整体迁移）
- Main：`main/files/**` + `session-attachment-store`/`attachment-staging`/`session-context-folder-store`/`session-model-override-store` → `src/main/chat-files/`，在 index.ts 注册 IPC
- Preload：`files-api.ts` → `src/preload/chat-files-api.ts`，暴露为 `window.chatFiles`（不扩展 `hermesAPI.files`），补 `index.d.ts`
- Renderer：`components/files/**`（common/composer/message/preview）、`hooks/files/**` → `modules/chat/components/files`、`modules/chat/hooks/files`；接入 `SessionFilesPanel`/`FilePreviewPanel`
- 验收：附件（点击/拖拽/剪贴板）、上下文文件、Agent 输出、预览、Load More、Save As、Reveal 可用

## 阶段 4：重接 AI-OS Work 能力（Slot + Adapter）

- 新增 `src/renderer/src/modules/chat/adapters/aios/`：`aiosChatRuntimeAdapter`/`aiosSessionAdapter`/`aiosFilesAdapter`/`aiosModelsAdapter`/`aiosNavigationAdapter`
  - Models 复用现有 `createHermesProfileApi`/`hermesDefaultChatApi`
  - Navigation：`openWeb(url)` → `window.aiosBrowser.open` + 激活 web-operator Tab（替代 WebPreview）
- 通过 slots 接回现有能力（保留不覆盖）：`HermesActiveExpertBar`、`TaskStatusBar`、`WorkChatContextBar`、`WorkComposerControls`、`PromptHintComposer`
- 验收：Default / Expert / Team / MCP Host Chat 共用同一 `ChatSurface`

## 阶段 5：切换入口 + Legacy 开关

- [HermesDefaultChatPage.tsx](src/renderer/src/screens/Hermes/pages/Chat/HermesDefaultChatPage.tsx) 改为 `AiosCopilotChatHost → CopilotChatSurface`
- 保留 `HermesDefaultWebChatSurface.legacy.tsx`，用 `VITE_CHAT_ENGINE=legacy|copilot` 切换
- 文档同步（rule 007）：`AGENTS.md`、`docs/API_CONTRACTS.md`（新 `chatRuntime`/`chatFiles` channel）、`docs/renderer/**`
- 稳定后再删除 legacy
- 验收（PRD §12 矩阵）：新/恢复会话、多会话不串流、多 Profile 隔离、模型覆盖不改全局、附件/文件/Tool/Clarify/Approval/Abort/Work/Web/Remote/SSH/重启/UI 主题

## 全局验收命令

```bash
npm run check:no-reference-imports
npm run typecheck
npm run test
npm run build
```