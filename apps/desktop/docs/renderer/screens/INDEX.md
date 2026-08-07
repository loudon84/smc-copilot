# Screens 索引

> `src/renderer/src/screens/` 下所有 Screen 的分类与状态总览。
> 状态判定依据：`workspace-registry.ts` 中 `STATIC_WORKSPACE_MODULES` 是否注册。

---

## 当前主链路 Screens（active）

| Screen | 路径 | 状态 | 入口 |
|---|---|---|---|
| SplashScreen | `screens/SplashScreen/` | active | `App.tsx` |
| Login | `modules/auth/LoginScreen.tsx` | active | `App.tsx` |
| Welcome | `screens/Welcome/` | active | `App.tsx` |
| Install | `screens/Install/` | active | `App.tsx` |
| Setup | `screens/Setup/` | active | `App.tsx` |
| Layout | `screens/Layout/` | active | `App.tsx screen=main` |
| MainPage | `screens/MainPage/` | active | `Layout.tsx` |
| WebOperator | `screens/WebOperator/` | active | `WorkspaceRenderer`（registry `web-operator`） |
| Hermes | `screens/Hermes/` | active | `WorkspaceRenderer`（registry `local-hermes`）；**V6.1** 左导航 `mcp` → `pages/MCP/HermesMCPPage.tsx`（`window.hermesAPI.mcp`）；**V6.4** 左导航 `mcpGateway` → `pages/McpGateway/HermesMcpGatewayPage.tsx`（`window.mcpSkillGatewayRuntime`）；**V6.4.1** 页面展示 Auth/Proxy backend 一致性、member 校验状态 |
| CrmWorkbench | `screens/Crm/` | active | `WorkspaceRenderer`（registry `crm-workbench`） |
| SettingsDrawer | `screens/SettingsDrawer/` | active | `Layout.tsx` drawer layer |

## 保留/可恢复 Screens（retained）

> registry 当前注释，WorkspaceRenderer 保留分支，非主链路入口。

| Screen | 路径 | 状态 | 说明 |
|---|---|---|---|
| Workspaces | `screens/Workspaces/` | retained | 多 Profile 三栏工作台，registry 注释 |
| Portal | `screens/Portal/` | retained | Portal WebView 嵌入页，registry 注释 |
| TaskWorkbench | `screens/TaskWorkbench/` | retained | 本地任务三栏，registry 注释 |
| Office | `screens/Office/` | retained | Office 视图，registry 注释 |

## 其他目录

| 路径 | 说明 |
|---|---|
| `screens/Servers/` | 已收敛至 `SettingsDrawer/server/`，独立目录不再使用 |
