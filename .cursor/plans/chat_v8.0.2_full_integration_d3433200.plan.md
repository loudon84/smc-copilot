---
name: chat v8.0.2 full integration
overview: 将 copilot-desktop 的完整 Chat 体验（消息、Composer、文件面板、Prompt Navigator、模型选择、多会话后台执行、完整 File Platform）真正接入 ai-os-desktop 生产链路，删除所有 Lite/Thin/placeholder 实现与 _upstream/source 快照，保持三层进程边界与 Port/Slot 隔离。
todos:
  - id: phase1
    content: 阶段一：扩展 canonical ChatViewItem/mapper；迁入 MessageList/MessageRow/HistoryRow/ClarifyCard/ChatEmptyState + media/avatar/orb/toolMeta；重写 ReasoningRow/ToolActivityGroup（折叠+callId 分组）；删除简化 MessageList；接入滚动/Prompt Anchor
    status: completed
  - id: phase2
    content: 阶段二：迁入 CopilotChatInput 全能力（IME/slash/voice/drag/clipboard/history/queue/context gauge/imperative）；新增 ChatCommandPort/ChatVoicePort + adapters；ModelPicker 分组化（ChatModelGroup）；附件输入入口；删除简化 ChatComposer
    status: completed
  - id: phase3
    content: 阶段三：_upstream 迁入 chat-files/{domain,stores,services,parsers,jobs,ipc}，收敛 shared/files+chat-files，真实 files:* IPC + preload + d.ts + API_CONTRACTS；右侧面板三态消除空白 aside；接管 session-files + 启用 components/files+hooks/files（改 Port）；完整 Preview Router；移除相关 tsconfig exclude
    status: completed
  - id: phase4
    content: 阶段四：ChatHeader + 条件 TaskStatusBar；AiosWorkComposerToolbar 收敛 Expert/Skill/Permission 去重；Prompt Hint 真绑定(rawInput→customPromptHint→effectivePrompt→submit)；接入 PromptNavigator；ChatWorkspaceProvider/ChatRunHost/ChatRunTabs 多 Chat 后台并行
    status: completed
  - id: phase5
    content: 阶段五：删除 source/** 与 _upstream/**；默认 copilot 入口保留 legacy 开关；增强 verify.mjs；chat-e2e-matrix 降级为清单；补/搬 Vitest；rule 007 文档同步；跑最终验收命令
    status: completed
isProject: false
---

> 交付方式：一次性推进全部 5 个阶段（用户确认）。真实 Electron E2E 延后，本轮以 Vitest 单元/集成覆盖验收矩阵，`chat-e2e-matrix.test.ts` 降级为验收清单文档。执行期按 `.cursor/rules/no-wait-skipped.mdc` 维护 `specs/current-agent-{task,state,log}.md` 状态机；收尾按 rule 007 同步文档。

## 现状与差距锚点

- 生产入口 [AiosCopilotChatHost.tsx](src/renderer/src/screens/Hermes/pages/Chat/AiosCopilotChatHost.tsx) → [ChatSurface.tsx](src/renderer/src/modules/chat/components/ChatSurface.tsx) 组合的是简化 [MessageList.tsx](src/renderer/src/modules/chat/components/messages/MessageList.tsx) / `ChatComposer` / `ModelPicker`。
- 完整上游快照在 [source/**](src/renderer/src/modules/chat/source)（`Chat.tsx` / `ChatInput.tsx` / `MessageRow.tsx` / `HistoryRow.tsx` / `ClarifyCard.tsx` / `ChatEmptyState.tsx` / `ModelPicker.tsx` / `prompt-navigator/**` / `session-files/**`）；已复制但被排除的 `components/files/**`、`hooks/files/**`（见 [tsconfig.web.json](tsconfig.web.json) L10）。
- Main 完整 File Platform 在 [_upstream/**](src/main/chat-files/_upstream)（用 `shared/files`），生产用薄桥 [chat-files-ipc.ts](src/main/chat-files/chat-files-ipc.ts)（JSON 索引 + 256KB 文本）。
- 契约双份：`shared/files` 与 `shared/chat-files` 需收敛。

## 目标生产结构

```text
modules/chat/
  components/
    CopilotChatExperience.tsx        (源 source/Chat.tsx，运行态改 Controller)
    messages/{MessageList,MessageRow}.tsx + media/avatar/orb/toolMeta
    history/HistoryRow.tsx
    clarify/ClarifyCard.tsx
    empty/ChatEmptyState.tsx
    composer/{CopilotChatInput,ModelPicker,ReasoningEffortPicker,ContextGauge,QueuedMessages}.tsx
    navigator/**                     (源 prompt-navigator)
    session-files/**                 (替换 Lite)
    files/**  hooks/files/**         (纳入编译，外部调用改 Port)
  controller/  ports/  adapters/aios/  workspace/
```

---

## 阶段一 · 布局与消息组件接管（PRD §8 阶段一 / FR-01,02）

- 扩展 [chatViewTypes.ts](src/renderer/src/modules/chat/controller/chatViewTypes.ts)：`user/assistant` 增加 `attachments?: ChatAttachment[]`、`error?`、`isSlashLoader?`；`tool_call/tool_result` 用 canonical `callId/name/args/status/content`（FR-01）。同步三向 mapper [chatHistoryMapper.ts](src/renderer/src/modules/chat/controller/chatHistoryMapper.ts)、[chatRuntimeEventReducer.ts](src/renderer/src/modules/chat/controller/chatRuntimeEventReducer.ts)、[chatReducer.ts](src/renderer/src/modules/chat/controller/chatReducer.ts)。
- 迁 `source/{MessageList,MessageRow,ClarifyCard,ChatEmptyState}.tsx` + `mediaUtils`/`MediaImage`/`ProfileAvatar`/`OrbLoader`/`ToolMeta`/`MessageAttachmentGrid` 到 `components/{messages,clarify,empty}`；`source/HistoryRow.tsx` → `components/history`。上游 props 改 canonical `ChatViewItem`；Markdown 复用目标项目已有 `AgentMarkdown`（不重写）。
- Reasoning 折叠、连续 Tool Call 按 `callId` 分组：重写 [ReasoningRow.tsx](src/renderer/src/modules/chat/components/reasoning/ReasoningRow.tsx) / [ToolActivityGroup.tsx](src/renderer/src/modules/chat/components/tools/ToolActivityGroup.tsx) 为上游实现（100 次调用不炸成 100 气泡）。
- 删除简化 `MessageList`；接入滚动/Prompt Anchor（`source/hooks/useChatScroll.ts`）。

验收：Markdown/代码/Diff/复制/头像/时间可用；Reasoning 可折叠；Tool 分组；Empty State 六快捷建议点击填入。

## 阶段二 · Composer 完整接管（PRD §8 阶段二 / FR-03,04 / §5.2）

- 迁 `source/ChatInput.tsx` → `components/composer/CopilotChatInput.tsx`（自动高度、IME 保护、attachment tray、slash、drag/drop、clipboard、voice、context gauge、readiness、imperative handle）。配套迁 `keyboard.ts`/`attachmentUtils.ts`/`composerFilePlatform.ts`/`useInputHistory.ts`/`useVoiceInput.ts`/`slash/**`/`ContextGauge.tsx`/`QueuedMessages.tsx`。
- 新增 Port：`ChatCommandPort`（slash 目录/执行）、`ChatVoicePort`（语音）；上游内的直接 `window.*` 调用替换为 `ChatFilesPort/ChatCommandPort/ChatVoicePort/ChatModelsPort/ChatNavigationPort`。补 adapters/aios 对应实现。
- 迁 `source/ModelPicker.tsx` 替换原生 select：Provider 分组/Logo/搜索/当前置顶/Configure/Esc 关闭；[ChatModelsPort.ts](src/renderer/src/modules/chat/ports/ChatModelsPort.ts) 返回 `ChatModelGroup{provider,providerLabel,models}`（FR-04），[aiosModelsAdapter.ts](src/renderer/src/modules/chat/adapters/aios/aiosModelsAdapter.ts) 适配。
- 删除简化 `ChatComposer`；单边框容器（附件 tray→textarea→error/readiness→底部工具栏），消除多行分散布局。
- 附件输入入口（FR-08/§2.11）：`useChatController` 暴露 add/remove attachment；Composer 文件按钮；`attachmentTraySlot` 由 Composer 内部承载。

验收：单容器 Composer；中文 IME Enter 不误发；Busy 入 Queue；Slash/Voice/History/Model Override 可用。

## 阶段三 · 文件面板与 File Platform 生产化（PRD §8 阶段三 / FR-06 / §5.3）

- Main 迁移：`chat-files/_upstream/**` → `chat-files/{domain,stores,services,parsers,jobs,ipc}`；收敛 `shared/files` 与 `shared/chat-files` 为一套契约；纳入 `tsconfig.node.json`；真实 `files:*` handler（`register-file-ipc.ts`）取代薄桥 [chat-files-ipc.ts](src/main/chat-files/chat-files-ipc.ts) 的内存/截断逻辑；每迁一块补/搬单测并删对应 `_upstream` 副本；完成后删除整个 `_upstream`。
- Preload/契约：扩展 [chat-files-api.ts](src/preload/chat-files-api.ts) + `index.d.ts`（`getCapabilities/pickFiles/importDropped/stageClipboard/getFile/getPreview/getParsedContent/retryParse/loadMore/agentOutput/context add/remove` 等）；更新 `docs/API_CONTRACTS.md`。
- 右侧面板三态（§5.3）：`sessionFilesVisible / previewFileId / previewMaximized`；仅面板真正打开才渲染 `aside`，消除固定 320px 空白（修 [ChatSurface.tsx](src/renderer/src/modules/chat/components/ChatSurface.tsx) 与 host `filesPanelSlot` 恒真问题）。
- 接管 `source/session-files/**` → `components/session-files`（Attachments/Context/Agent Output 分组、FTS 防抖、Add/Remove Context、角色状态、空态）；启用已复制 `components/files/**` + `hooks/files/**`（改走 Port/新 files API，去除直连 `window.*`），完整 Preview Router（图片/Markdown/代码/PDF/Office/文本/Unsupported/自动加载/Load More/Retry/Save As/Reveal/Open External/拖动宽度/全屏）。`ChatFilesPort` 拆 `saveManagedFileAs`/`saveLocalPathAs`。
- 移除 `tsconfig.web.json` L10 对 `chat/source`(仅保留必要)、`components/files`、`hooks/files` 的 exclude。

验收：新会话无空白右栏；PDF/Office/Markdown/图片/代码可预览；Preview 拖动+全屏；重启后文件关系恢复。

## 阶段四 · Work 收敛 + Prompt Hint 绑定 + 多 Chat（PRD §8 阶段四 / FR-05,07 / §5.1,5.4）

- Header 重构（§5.1）：新增 `ChatHeader`（Active Expert/Team + Ask/Plan/Craft + 返回 Default + 运行状态）；`TaskStatusBar` 仅 `creating/running/waiting/completed/failed` 显示，`ready` 不占两行；Usage/Duration 收进状态详情。
- Work 收敛（FR-05）：新增 `AiosWorkComposerToolbar`（Gateway/Expert/Skill/Permission/WorkMode/PromptHint 单行底部工具栏）；删除顶部常驻 `WorkChatContextBar`；消除 Expert/Skill/Permission 双处重复（§2.2）。
- Prompt Hint 真绑定（§2.3 / FR-05）：`rawInput → customPromptHint → effectivePrompt → submit`；`PromptHintComposer` 传入真实 Composer 输入 + `onHintChange`；`composeWorkPrompt` 改为消费 `effectivePrompt`，用户编辑生效。
- Prompt Navigator 接入（§2.7 / §5.4）：迁 `source/prompt-navigator/**` → `components/navigator`，接入 `CopilotChatExperience`；≥2 条用户消息显示、默认折叠、点击滚动、当前高亮、与文件面板互斥、窄窗隐藏。
- 多 Chat（FR-07 / §10）：新增 `ChatWorkspaceProvider` / `ChatRunHost` / `ChatRunTabs` / `BackgroundRunIndicator`；每 Run 持 `runId/sessionId/profileId/expertId/teamId/expertRunId/title/loading/unread/completed`；多 `ChatRunHost` 常挂载、CSS 控制可见；切换不停后台流；Abort 仅停当前 Run；完成通知/Unread（复用 [chatRunRegistry.ts](src/renderer/src/modules/chat/workspace/chatRunRegistry.ts) + `useChatWorkspaceManager`）。

验收：三个 Chat 并行不串流；切换不终止后台生成；Prompt Hint 编辑内容真实进入请求；Expert/Skill/Permission 不重复。

## 阶段五 · 清理、切换与验收（PRD §8 阶段五 / §9,11,12）

- 删除 `modules/chat/source/**`、`src/main/chat-files/_upstream/**`；生产路径不存在 Lite/Thin/placeholder；生产组件不在 tsconfig exclude。
- Copilot 作为默认入口（`VITE_CHAT_ENGINE` 保留一版 legacy 开关 + `HermesDefaultWebChatSurface.legacy.tsx`）。
- 增强 [verify.mjs](scripts/chat-migration/verify.mjs)：新生产目录（messages/composer/history/clarify/empty/navigator/session-files/files/hooks-files）纳入 `_upstream` 与 `window.*` 边界校验；`chat-e2e-matrix.test.ts` 降级为验收清单文档。
- 补/搬 Vitest：消息/工具分组/composer/IME/queue/model group/prompt-hint 绑定/文件面板三态/多 Run 隔离/reconciler。
- rule 007 同步 `AGENTS.md`、`docs/API_CONTRACTS.md`（files:* 全量 channel + chatFiles）、`docs/renderer/**`。

最终验收（去掉未搭建的 `test:e2e`）：
```bash
npm run check:no-reference-imports
npm run check:chat-boundaries
npm run typecheck:chat
npm run typecheck
npm run test
npm run build
```
要求：`modules/chat/source` 不存在；`chat-files/_upstream` 不存在；tsconfig 不排除生产 Chat 组件；无 Lite/Thin/placeholder Chat 实现。

## 主要风险

- 上游组件依赖链深（`source/Chat.tsx` 1252 行 + 大量 hooks），迁移时须逐组件替换 `window.*`→Port，避免把 Work 业务回灌 Chat Core（§9 禁项 5/10）。
- `shared/files` 与 `shared/chat-files` 收敛需谨慎，避免破坏现有 `hermes-default-chat` 附件桥。
- File Platform 生产 IPC 与 profile 路径须走 `profileHome()`；预览大小/安全路径策略保留。