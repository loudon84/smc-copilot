# Workspaces

## 1. 路径

```text
src/renderer/src/screens/Workspaces/
```

## 2. 入口

由 `WorkspaceRenderer` 根据 registry `workspaces`（kind `react`）渲染。

## 3. 职责

- 多 Profile 三栏工作台（V3.6.2）
- 左栏 WorkspacesSidebar：Profile 切换 / Chat / Sessions / models / skills / tools / memory / providers
- 中栏：当前选中页面内容
- 右栏 WorkspaceRightPanel：Inspector / Runtime / Chat / Memory / Skills
- 顶栏 WorkspaceStatusCards：各 Profile 状态概览
- 集成 Workspaces Chat（team_v1.8，`workspaceChat` IPC → copilot-serve）

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `index.tsx` | 导出入口 |
| `constants.ts` | 常量 |
| `types.ts` | 类型定义 |
| `Workspaces.css` | 样式 |
| `api/workspacesApi.ts` | Workspace 级 API 封装 |
| `api/sessionUtils.ts` | 会话工具 |
| `api/approvalUtils.ts` | 审批工具 |
| `api/mergeExpertProfiles.ts` | 专家 Profile 合并 |
| `context/` | Context Provider |
| `components/WorkspacesShell.tsx` | 三栏壳层（实际在 panels/） |
| `components/WorkspacesSidebar.tsx` | 左栏导航 |
| `components/WorkspaceStatusCards.tsx` | 顶栏状态卡片 |
| `components/WorkspaceRightPanel.tsx` | 右面板 |
| `components/WorkspaceRightPanelRail.tsx` | 右面板 Rail |
| `components/RightInspectorTabs.tsx` | Inspector Tabs |
| `components/ProfileSwitcher.tsx` | Profile 切换器 |
| `components/SessionList.tsx` | 会话列表 |
| `components/SessionSearch.tsx` | 会话搜索 |
| `panels/WorkspacesShell.tsx` | 三栏壳层编排 |
| `panels/ChatPanel.tsx` | Chat 面板 |
| `panels/RuntimePanel.tsx` | Runtime 面板 |
| `panels/MemoryPanel.tsx` | Memory 面板 |
| `panels/SkillsPanel.tsx` | Skills 面板 |
| `panels/WorkspacePanel.tsx` | Workspace 面板 |
| `registry/workspace-pages.tsx` | 页面注册表 |
| `pages/Chat/` | Chat 页面（HermesWebChatSurface，workspaceChat IPC） |
| `pages/Sessions/` | 会话列表页 |
| `pages/Models/` | 模型库页 |
| `pages/Skills/` | 技能页 |
| `pages/Tools/` | 工具页 |
| `pages/Memory/` | 记忆页 |
| `pages/Providers/` | Provider 页 |
| `hooks/` | Profile / Runtime / Sessions / Chat 等 hooks |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.workspaceChat.*`（Chat / 附件 / SSE） |
| Preload | `window.profileRuntime.*`（多 Profile 启停/状态/日志） |
| Preload | `window.hermesAPI.*`（配置/模型/技能） |
| Preload | `window.copilotServe.*`（Copilot Serve 连接） |

## 6. 状态流

```text
WorkspaceRenderer 渲染 Workspaces
  → WorkspacesShell 三栏编排
  → Sidebar 页面选择 → registry 渲染对应 page
  → Chat: workspaceChat.send → copilot-serve → SSE 流
  → Profile 切换 → profileRuntime.start/stop → Gateway 生命周期
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- 不绕过 workspace routing

> **状态**：retained — 当前 registry 注释，WorkspaceRenderer 保留分支，非主链路入口。

## 8. 相关文档

- `docs/API_CONTRACTS.md` § Workspace Chat / Profile Runtime
- `docs/renderer/WORKSPACE_ROUTING.md`
- `prd/team_v1.8_chatpanel.md`
