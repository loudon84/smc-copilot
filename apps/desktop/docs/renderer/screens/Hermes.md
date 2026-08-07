# Hermes

> **v1.3 Spec Pack（AI Coding）**：[`docs/specs/v1.3-workbuddy-product-line/00-overview.md`](../../specs/v1.3-workbuddy-product-line/00-overview.md) — Layout 边界见 [`03-layout-boundary.md`](../../specs/v1.3-workbuddy-product-line/03-layout-boundary.md)，UI 质量见 [`13-ai-coding-structure.md`](../../specs/v1.3-workbuddy-product-line/13-ai-coding-structure.md)。

## 1. 路径

```text
src/renderer/src/screens/Hermes/
```

## 2. 入口

由 `WorkspaceRenderer` 根据 registry `local-hermes`（kind `react`）渲染。

## 3. 职责

- V5.6 Local Hermes 默认 Profile 三栏工作台
- **V7.2 Remote Experts Pivot** + **Expert MCP Gateway v6.1**：直连 `/api/v1/expert/mcp` 同步召唤（无 HermesTask）；root `tools/list` 严格 kind 过滤；统一 `callCatalogSkill`；`ExpertCatalogCallDrawer`；Workbench Expert Gateway 健康；本地 Runs/Artifacts（schema v3）
- **V7.1** Hermes Experts Workspace：专家广场 / 专家团队 / 专家运行 + profile-aware Chat
- **V7.1.1** E2E：Chat↔Run 事件桥接、Tools&MCP Inspector、Desktop register/heartbeat
- **v7.4.2 Chat-first Work Controls**：Chat 恢复默认入口与侧栏首位；`ComposerBar.workControlsSlot` 内嵌 `WorkComposerControls`（Expert / Skill / Permission / Gateway）；`WorkChatContextBar`；Send 双路径（Hermes SSE vs `workExpertGatewayApi.callExpertSkill`）；`tasks` / `workbench` 导航隐藏；`pages/Tasks/**` 源码保留不继续优化
- **v8.2.0 Persistent Chat Workspace + Session Catalog**：`ChatWorkspaceProvider` 提升至 `HermesScreen`；`HermesPersistentChatWorkspace` 常驻挂载（菜单只切 visible）；Main `chat-workspace.db` + `window.chatWorkspace`；Sessions 页走 `window.sessionCatalog` 直读 profile `state.db`，`openSession` 去重激活/创建 Tab
- **v8.1.1 Durable Runtime Closure**：Continuation await completion + Native/Fallback 互斥；profile store；`ChatRuntimeRecoveryBridge`；Queue IPC；Error Card `retryTurn(turnId)`；Diagnostics Save Dialog；Playwright E2E
- **v8.1.0 Durable Chat Runtime**：`chat-runtime:start` 事件驱动；durable `state.db`；Turn Ledger 精确 Retry；Queue reducer；Recovery/`getState`；Clarify/Approval 流式续跑
- **v8.0.5 Chat Interaction Loop**：Clarify/Approval 真 Command（Follow-up Message）；Turn Snapshot Queue/Retry；Session Files Badge 走 `useSessionFilesSummary` + `chat-files:changed`（禁止硬编码 0）
- **v8.0.4 Chat Turn Lifecycle**：`initialSessionId` 一次性 hydrate vs `BIND_SESSION`；`submitComposer` 立即清 Input/Draft；`turnId` 终态保护；右侧 `ChatFloatingRail`（Prompt Navigator + Session Files）
- **v8.0.3 Chat Workspace Layout**：`ChatRunRecord` per-run 隔离；单一 Header + Content Rail；Composer Context Chip；Tab 状态真实回传；localStorage `chat-workspace-state.v1`（**v8.2** 起仅作迁移源）
- **v7.4.1 Work 任务 Hotfix**（导航已由 v7.4.2 回退）：`pages/Tasks/` — `WorkTaskStartComposer`、`TaskWindow`、`work-tasks.json` 仍保留供遗留路径
- **v1.4 Work 任务窗口**（已由 v7.4.1 取代主路径）：~~TaskStream mock SSE~~
- 左栏 Sidebar：**三段分组**（主流程含 **chat**（默认）/ experts / expertTeams …；`tasks` / `workbench` **v7.4.2 隐藏**；能力管理 / 高级设置，后两组默认折叠）；**v1.3 Phase 6** `requiresGateway` 离线门控（disabled + tooltip）；窄栏仅显示主流程 icon
- 中栏：当前选中页面内容（**v8.2** Chat 始终挂载于 `HermesShell`，非 chat 页时 `visibility:hidden`）
- 右栏：Right Panel（Runtime / Inspector）
- 固定使用 `default` profile 做本地 Chat；远端专家 `profileId: remote`
- 与 Workspaces / copilot-serve 隔离

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `index.tsx` | 导出入口 + `ChatWorkspaceProvider` 提升 + `useRemoteExpertContextBridge` |
| `panels/HermesShell.tsx` | **v8.2** 常驻 `HermesPersistentChatWorkspace` + 非 chat 页 `HermesPageLoader` |
| `pages/Chat/HermesPersistentChatWorkspace.tsx` | **v8.2** Chat 常驻挂载（visible/hidden） |
| `pages/Sessions/HermesSessionsPage.tsx` | **v8.2** `sessionCatalog.list` + Drafts + `openSession` |
| `api/hermesDefaultApi.ts` | 封装 `window.hermesAPI` |
| `constants.ts` | 导航项（**v7.4.2**：`chat` 首位可见；`tasks`/`workbench` hidden） |
| `context/HermesDefaultContext.tsx` | 默认页 **chat**（v7.4.2）；历史 `tasks`/`workbench` localStorage 迁移至 `chat` |
| `context/HermesExpertsContext.tsx` | 专家/团队目录 Context（Inspector / Chat 用 `getExpertById`；**Phase 6** 已移除 `runs`/`refreshRuns`） |
| `hooks/useRemoteExpertContextBridge.ts` | WebOperator/屏幕上下文事件桥 |
| `utils/remote-expert-context.ts` | tools/call context 存储 |
| `pages/Workbench/HermesWorkbenchPage.tsx` | **v1.3** 工作台首页：`features/workbench` + ConnectionStatusCard / QuickTaskEntry / Recommended* / Recent* |
| `pages/Artifacts/HermesArtifactsPage.tsx` | **V7.2** 本地 `expert_mcp_response` 成果 |
| `pages/Experts/components/ExpertCatalogCallDrawer.tsx` | **v6.1** 统一 expert/team 召唤 Drawer（`listCatalogSkills` + `callCatalogSkill`） |
| `pages/Experts/hooks/useCatalogSkillCall.ts` | skill 列表加载 + catalog skill 调用 |
| `pages/Experts/components/ExpertCallDrawer.tsx` | legacy Call Drawer（保留） |
| `pages/ExpertTeams/components/ExpertTeamCallDrawer.tsx` | legacy 团队 Call Drawer（主路径已切 `ExpertCatalogCallDrawer`） |
| `pages/Experts/` | 专家广场 |
| `pages/ExpertTeams/` | 专家团队 |
| `pages/ExpertRuns/` | 运行记录（`features/expert-run` + `workApi.runs`；组件 RunFilterBar / RunList / RunDetailPanel） |
| `pages/Artifacts/` | 成果中心（`features/artifact` + `workApi.artifacts`；ArtifactList / PreviewPanel / ImportDialog） |
| `api/workApi.ts` | **v1.3** Work 域 API 封装（Experts / Teams / Runs / Artifacts → `window.hermesExperts`；**v1.4** `task.*` → `workTaskApi`） |
| `api/workTaskApi.ts` | **v7.4.1** `startTask` / `resumeTask` / `listRecentTasks` → `hermesDefaultChat` + `window.work.task.*` |
| `features/task-store/` | **v7.4.1** 任务 metadata + activeTask / rightDock UI 状态 |
| `pages/Tasks/WorkTasksPage.tsx` | **v7.4.1** 任务首页 + Hermes Chat 任务窗口 |
| `pages/Tasks/components/WorkTaskStartComposer.tsx` | Popover 选择器 + 首条消息启动 |
| `pages/Tasks/components/WorkTaskContextBar.tsx` | 任务上下文 chips |
| `api/workExpertGatewayApi.ts` | **v7.4.2** Chat Work 控件唯一 Expert Gateway 封装（`callCatalogSkill` / health / catalog skills） |
| `types/work-chat.ts` | **v7.4.2** Work Chat 上下文类型 |
| `pages/Chat/hooks/useWorkChatContext.ts` | Gateway / expert / skill / permission 状态（**legacy Surface**；Copilot Host 改用 `useRunWorkContext`） |
| `pages/Chat/hooks/useWorkExpertGatewaySend.ts` | Expert Gateway Send 路径 |
| `pages/Chat/components/work/*` | Expert/Skill/Permission 选择器；`WorkComposerControls` 常驻布局已停用（改 Context Popover 插槽） |
| `pages/Chat/ComposerBar.tsx` | **v7.4.2** `workControlsSlot` 插槽 |
| `pages/Chat/HermesDefaultWebChatSurface.tsx` | Chat 主面 + Work 控件 + Send 双路径；支持 `forcedSessionId`（任务窗口遗留）；**默认引擎已切 Copilot** |
| `pages/Chat/MultiRunChatShell.tsx` | **v8.0.3** 多 Run 壳：`ChatWorkspaceProvider` + Tabs + 保活 Host |
| `pages/Chat/AiosCopilotChatHost.tsx` | **v8.1** Host props=`run/active/onPatchRun`；Runtime 走 `start`；`sessionFilesCount`←`useSessionFilesSummary`；单一 `ChatRunHeader` |
| `modules/chat/controller/useChatController.ts` | **v8.1** `runtime.start` + Turn Ledger + Queue reducer + 精确 Retry；**v8.0.5** `submitRuntimeCommand`；**v8.0.4** hydrate / 清 Draft |
| `modules/chat/hooks/useSessionFilesSummary.ts` | **v8.0.5** list + `chatFiles.onChanged` 驱动 Badge `total` |
| `modules/chat/components/approval/ApprovalCard.tsx` | **v8.0.5** Tool/Summary/Risk；high 二次确认；Deny reason |
| `modules/chat/hooks/useChatRuntimeRecovery.ts` | **v8.1** mount `getState`/`recover` |
| `modules/chat/components/diagnostics/ChatDiagnosticsExportButton.tsx` | **v8.1** Export Chat Diagnostics || `modules/chat/components/floating/ChatFloatingRail.tsx` | **v8.0.4** 右侧固定 Prompt Navigator + Session Files |
| `modules/chat/workspace/ChatRunRecord.ts` | **v8.0.3** per-run Session/Expert/Skill/WorkMode/Model/draft 单一状态源 |
| `modules/chat/workspace/chatWorkspaceReducer.ts` | **v8.0.3** open/close/patch/returnDefault/applyControllerSnapshot；`createdOrder` 保序 |
| `modules/chat/workspace/chatWorkspacePersistence.ts` | **v8.0.3** `chat-workspace-state.v1`；恢复时 busy→`interrupted` |
| `features/expert-run/` | Runs 列表/详情 hooks（`useExpertRuns`、`useExpertRunDetail`） |
| `features/artifact/` | 成果列表/预览/导入 hooks |
| `features/workbench/` | Workbench 聚合 hooks（`useWorkbenchOverview`、`useQuickTaskEntry`） |
| `features/nav/` | **v1.3 Phase 6** 导航门控（`useGatewayNavGate`、`navItemAccess.isNavItemAccessible`） |
| `pages/GeneHub/components/GeneHubSkillPushPanel.tsx` | **V7.2** Skill Push / Submissions / Pull |
| `registry/hermes-pages.tsx` | 页面注册表 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.hermesAPI.*`（本地 default profile） |
| Preload | `window.hermesExperts.*`（Expert MCP v6.1；Chat Work 控件经 `workExpertGatewayApi` 间接调用，组件禁止直连） |
| Preload | `window.work.task.*`（**v7.4.1**：`start` / `resume` / `list` / `getBySession`；legacy `send`/`onEvent` 保留） |
| Preload | `window.mcpSkillGatewayRuntime.*`（非专家 MCP Skill Gateway；legacy hermes-client task） |

## 6. 边界

见 `docs/specs/v7.2-nodeskclaw-remote-experts/01-architecture-boundary.md`：禁止 route override；server_artifacts 导入为本地副本。

## 7. IPC

见 `docs/API_CONTRACTS.md` § Hermes Experts Workspace（V7.2）与 § v7.4.2 Chat-first Work Controls。
