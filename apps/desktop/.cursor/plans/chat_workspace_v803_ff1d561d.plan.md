---
name: chat workspace v803
overview: 重构 Chat Workspace 为「单一 per-run 状态源」：合并重复 Header、统一内容宽度、收敛 Composer 控件，并让每个 Chat Run 独立持有 Session/Expert/Skill/Model/WorkMode 并真实回传运行状态。覆盖 PRD v8.0.3 的 PR1–PR4，测试采用 Vitest 单元/集成（Playwright E2E 与 File Facade 顺延到后续版本）。
todos:
  - id: pr1
    content: PR1 Run State Unification：新增 ChatRunRecord + chatWorkspaceReducer，重写 ChatWorkspaceProvider（保存 per-run expert/skill/session/workMode），新增 useRunWorkContext，改 AiosCopilotChatHost 为 run/active/onPatchRun props 并移除全局 setActiveSessionId，修复 Return Default
    status: completed
  - id: pr2
    content: PR2 Header & Layout：新增 ChatRunHeader/ChatRunStatus，删除双 Header，copilot-chat.css 加内容宽度 token + ChatContentRail 统一 Empty/Message/Composer 中轴，右面板响应式，Task Status 收敛
    status: completed
  - id: pr3
    content: PR3 Composer IA：WorkContextChip + WorkContextPopover + PromptHintPopover + ComposerMoreMenu 收敛控件，Prompt Hint 状态化 per-run，响应式单行工具栏，停用 WorkComposerControls 常驻布局
    status: completed
  - id: pr4
    content: PR4 Multi-Run 闭环：ChatSurface.onControllerStateChange 回传状态，Provider 更新 loading/unread/completed/title/session/model + 后台通知，ChatRunTabs 标题来源/重命名/关闭策略/overflow，chatWorkspacePersistence v1 持久化与恢复(interrupted 不续跑)
    status: completed
  - id: tests
    content: PR-T Vitest：reducer、multi-run 隔离、标题派生、run-state 回传 单元/集成测试；运行 typecheck:chat / typecheck / test / build 验收
    status: completed
  - id: docs
    content: 收尾文档同步：AGENTS.md v8.0.3 版本行与 Chat 数据流、docs/renderer 相关页、lat.md chat 章节 + lat check
    status: completed
isProject: false
---

# Chat Workspace 布局统一与多会话状态隔离 (v8.0.3 · PR1–PR4)

## 目标与范围

修复截图暴露的四类问题：双 Header、Expert/Runtime 状态不一致、多会话未隔离、Composer 控件拥挤/宽度不统一。

- **纳入**：PR1 Run 状态统一、PR2 Header/布局统一、PR3 Composer 信息架构、PR4 多会话生产闭环（状态回传 + 持久化）。
- **不纳入（PR5 顺延）**：`ChatFilesFacade`、legacy 索引迁移、Playwright Electron E2E、截图基线。
- **测试策略**：Vitest 单元/集成（reducer、per-run 隔离、标题派生、Return Default），保留现有人工验收矩阵。

## 关键设计决策

1. **单一 per-run 状态源**：`ChatWorkspaceProvider` 用 reducer 管理 `ChatRunRecord[]`，取代当前的模块级单例 [`chatRunRegistry.ts`](src/renderer/src/modules/chat/workspace/chatRunRegistry.ts) 与扁平 `ChatRunRegistryEntry`。
2. **`HermesWorkspaceContext` 降级为导航层**：[`HermesWorkspaceContext.tsx`](src/renderer/src/screens/Hermes/context/HermesWorkspaceContext.tsx) 不再作为所有 Run 共享的 Session/Expert 源；仅在从 Expert/Team 页进入 Chat 时 `openRun({context})` 播种。禁止 Host 内 `workspace.setActiveSessionId(id)`。
3. **模块保持通用、screens 提供业务插槽**：`ChatRunHeader` / `WorkContextChip` 做成展示型（接收已解析的 expertName/skillName + 回调）放在 `modules/chat`；具体的 `ExpertSelector`/`ExpertSkillSelector`/`PermissionSelector`/`GatewayStatusBadge`（依赖 `workExpertGatewayApi` 与 `HermesExpertsContext`）仍留在 screens，由 Host 组装进 Popover 插槽。这样既满足 PRD 命名，又不破坏 `modules/chat` 与 screens 的边界规则。
4. **状态一致性单点**：发送消息时 Header Expert、Prompt Hint Expert、Runtime `expertId`、Tab metadata 全部来自同一个 `run.context.expertId`。

## 目标状态模型

```ts
// modules/chat/workspace/ChatRunRecord.ts (PRD §4.1，实现时逐字段落地)
ChatRunRecord = { runId, identity{sessionId,profileId,createdAt,updatedAt},
  context{mode,expertId,expertName,teamId,teamName,skillName,skillDisplayName,permissionMode,workMode},
  execution{expertRunId,invocationSource,runState,startedAt,completedAt},
  presentation{title,titleSource,unread,selectedModelId,sessionFilesVisible,previewFileId,previewMaximized,draft?,promptHint?} }
```

---

## PR1 — Run State Unification

统一状态源、修复 Return Default、Host 不再读全局 Session。

- 新增 [`ChatRunRecord.ts`](src/renderer/src/modules/chat/workspace/ChatRunRecord.ts)、[`chatWorkspaceReducer.ts`](src/renderer/src/modules/chat/workspace/chatWorkspaceReducer.ts)（actions：`openRun/closeRun/setActive/patchRun(DeepPartial)/renameRun/markUnread/markInterrupted/restore`；`createdOrder` 保序，禁止按 `updatedAt` 重排）。
- 重写 [`ChatWorkspaceProvider.tsx`](src/renderer/src/modules/chat/workspace/ChatWorkspaceProvider.tsx) 用 `useReducer` 托管 record 列表 + activeRunId；`openRun` 接收并保存 `expertId/teamId/skill/permissionMode/workMode`（当前实现丢弃这些字段）。
- 新增 [`useRunWorkContext.ts`](src/renderer/src/modules/chat/workspace/useRunWorkContext.ts)：`useRunWorkContext(runId)` 返回该 run 的 context 与 `patch`；替代 Host 内的 `useWorkChatContext()`（该 hook 的 gateway 健康探测逻辑迁入或复用）。
- 改 [`AiosCopilotChatHost.tsx`](src/renderer/src/screens/Hermes/pages/Chat/AiosCopilotChatHost.tsx) props 为 `{ run: ChatRunRecord; active: boolean; onPatchRun }`；`sessionId`/`expertId`/`workMode` 全部取自 `run.*`；`onSessionIdChange` 改为 `onPatchRun(runId,{identity:{sessionId}})`，删除 `workspace.setActiveSessionId`。
- 修复 Return Default：真实清除当前 run 的 `context.mode='default'` + expert/team/skill/permission，不影响其他后台 run。

**验收**：同时开两个 Run，选不同 Expert/Skill/WorkMode，两边发送 payload 完全独立；Return Default 只清当前 Run。

## PR2 — Header & Layout Consolidation

一套 Header + 统一内容中轴。

- 新增 [`ChatRunHeader.tsx`](src/renderer/src/modules/chat/components/header/ChatRunHeader.tsx)（展示型：Expert/Team/Default 标签 + Skill badge + Return Default + 单套 Ask/Plan/Craft）与 [`ChatRunStatus.tsx`](src/renderer/src/modules/chat/components/header/ChatRunStatus.tsx)。
- 删除 Chat 页内的双 Header：停用 [`ChatHeader.tsx`](src/renderer/src/modules/chat/components/ChatHeader.tsx) 与 Host 内的 [`HermesActiveExpertBar.tsx`](src/renderer/src/screens/Hermes/pages/Chat/components/HermesActiveExpertBar.tsx) 组合（Host 的 `activeExpertSlot` 只渲染 `ChatRunHeader`）。
- 统一内容宽度：在 [`copilot-chat.css`](src/renderer/src/modules/chat/styles/copilot-chat.css) 新增 token（`--chat-content-max:960px` 等）并新增 [`ChatContentRail.tsx`](src/renderer/src/modules/chat/layout/ChatContentRail.tsx)，让 Empty/MessageList/Composer 共用 `.chat-content-rail`；Composer 不再铺满 `chat-main`；右面板宽度改为响应式（默认 400px，中屏 ≤42%）。
- Task Status 收敛（FR-11）：`ChatRunStatus` 只在 creating/streaming/waiting_*/failed 显示，completed 3s 后自动收起，不重复 Header 已有的 Expert/Skill/Profile。

**验收**：Tabs 下只有一行 Header、一套 Ask/Plan/Craft，Composer 与消息区同中轴同宽度。

## PR3 — Composer Information Architecture

十余个常驻控件收敛为两层。

- 新增 [`WorkContextChip.tsx`](src/renderer/src/modules/chat/components/composer/WorkContextChip.tsx)（展示 `Expert · Skill` + Gateway 状态点）、[`WorkContextPopover.tsx`](src/renderer/src/modules/chat/components/composer/WorkContextPopover.tsx)（组装 screens 的 Expert/Skill/Permission/Clear 选择器插槽）、[`PromptHintPopover.tsx`](src/renderer/src/modules/chat/components/composer/PromptHintPopover.tsx)、[`ComposerMoreMenu.tsx`](src/renderer/src/modules/chat/components/composer/ComposerMoreMenu.tsx)。
- 停用 [`WorkComposerControls.tsx`](src/renderer/src/screens/Hermes/pages/Chat/components/work/WorkComposerControls.tsx) 的常驻横排布局；Host 的 `composerControlsSlot` 改为 `WorkContextChip`（点开 Popover），主工具栏结构：`Attach/Voice · Context Chip · Model · Prompt Hint · Files … Context Gauge · Send`。
- Prompt Hint 状态化（FR-07）：`{mode:'auto'|'custom'|'disabled', customValue}`，每个 Run 独立存于 `run.presentation.promptHint`；auto 随用户输入更新，custom 保持，切换 Expert/Skill 提示重置。
- 响应式（FR-09）：≥1280 全量、960–1279 Skill 进 Popover/Model 截断、800–959 全图标 + More Menu，禁止 Composer 折成两行。

**验收**：1536 / 1200 / 960 三种宽度 Composer 均单行不换行、不拥挤。

## PR4 — Multi-Run Production Closure

Run 状态真实接入 Tab + 持久化。

- [`ChatSurface.tsx`](src/renderer/src/modules/chat/components/ChatSurface.tsx) 新增 `onControllerStateChange({runId,sessionId,runState,selectedModelId,usage,firstUserPrompt})`（基于 controller state 的 effect 回传）。
- Provider 依据回调 `patchRun`：loading/completed/unread/title/sessionId/modelId/duration；后台 Run 完成 → Tab 关 spinner + unread dot + 尽力桌面通知（`Notification` API，失败降级 in-app）；Active Run 不显示 unread。
- [`ChatRunTabs.tsx`](src/renderer/src/modules/chat/workspace/ChatRunTabs.tsx)：标题来源顺序 Session title → 用户自定义 → 首条 Prompt 前 40 字 → New Chat（Skill 改为 tooltip/badge，不再作标题）；双击重命名、中键关闭、Running 关闭确认、最多 8 个 Tab + Overflow Menu。
- 新增 [`chatWorkspacePersistence.ts`](src/renderer/src/modules/chat/workspace/chatWorkspacePersistence.ts)：`chat-workspace-state.v1`（localStorage）持久化 Run 顺序/Active/Session/Profile/Expert/Team/Skill/WorkMode/Title/Model/面板状态；不持久化流式内容/工具事件/审批/文件正文；恢复时重建 metadata、从 Session DB 懒加载消息、上次运行中的 Run 标记 `interrupted` 不自动续跑。
- 简化 [`MultiRunChatShell.tsx`](src/renderer/src/screens/Hermes/pages/Chat/MultiRunChatShell.tsx)：mount 集合直接由 provider `runs` 派生，Host 传 `run/active/onPatchRun`。

**验收**：三个后台 Run 同时生成，切换后 Session/Expert/Model/输入草稿互不串联；后台完成显示 Unread。

## PR-T — 测试（Vitest）

- `chatWorkspaceReducer.test.ts`：openRun 保存 context、patchRun 深合并、createdOrder 保序、Return Default 只清当前、markInterrupted。
- `multi-run-isolation.test.ts`：两 Run 的 expertId/sessionId/draft 互不影响。
- `title-derivation.test.ts`：标题优先级；Skill 不作标题。
- `run-state-feedback.test.ts`：`onControllerStateChange` 驱动 loading/unread/completed。

## 受影响文件汇总

- 新增：`ChatRunRecord.ts`、`chatWorkspaceReducer.ts`、`chatWorkspacePersistence.ts`、`useRunWorkContext.ts`、`components/header/ChatRunHeader.tsx`+`ChatRunStatus.tsx`、`components/composer/WorkContextChip.tsx`+`WorkContextPopover.tsx`+`PromptHintPopover.tsx`+`ComposerMoreMenu.tsx`、`layout/ChatContentRail.tsx`。
- 修改：`AiosCopilotChatHost.tsx`、`MultiRunChatShell.tsx`、`ChatWorkspaceProvider.tsx`、`ChatRunTabs.tsx`、`ChatSurface.tsx`、`CopilotChatInput.tsx`、`copilot-chat.css`、`SessionFilesPanel`（仅面板状态改 per-run）。
- 停用：`ChatHeader.tsx`、Host 内 `HermesActiveExpertBar`、`WorkComposerControls` 常驻布局、`chatRunRegistry` 扁平单例（由 reducer 取代）、Skill 作 Tab 标题、`workspace.activeSessionId` 作为 Run Session。

## 文档同步（收尾）

按 rule 007 增量更新 `AGENTS.md`（v8.0.3 版本行 + Chat 数据流）、`docs/API_CONTRACTS.md`（若 IPC 无新增则免）、`docs/renderer/` 相关 Screen；`lat.md/` 更新 chat 相关章节并 `lat check`。

## 验证命令

```bash
npm run check:no-reference-imports
npm run check:chat-boundaries
npm run typecheck:chat
npm run typecheck
npm test
npm run build
```

（`test:e2e:electron` 顺延，本版本不引入 Playwright。）