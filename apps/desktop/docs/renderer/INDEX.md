# Renderer Process 文档索引

## 1. 定位

`src/renderer/src` 是 SMC Copilot 的 React UI 层，负责：

- 启动路由与门控（splash → login → welcome → installing → setup → main）
- 主界面布局（MainPage / Layout / WorkspaceOutlet）
- Workspace 渲染分发（WorkspaceRenderer → 按 kind 路由 Screen）
- Screen 页面（15 个顶层屏幕目录）
- UI 状态与持久化（mainPageState / KeepAlive / sidebarMode）
- 通过 Preload 暴露的 `window.*` API 调用 Main Process

**硬性约束**：Renderer 禁止直接 `import` Node.js 模块；只通过 `window.*` 全局对象访问主进程。

## 2. 顶层结构

| 目录 | 职责 |
|---|---|
| `App.tsx` | 启动屏幕路由分支 |
| `screens/` | 页面级模块（15 目录） |
| `components/` | 复用 UI 组件（layout / workspace / hermes / shell / dropdowns / runtime / ui 等） |
| `modules/` | 跨 Screen 业务模块（auth / hermes-runtime） |
| `hooks/` | Renderer hooks（7 个） |
| `workspace/` | Workspace registry / tabs / 渲染分发 / 二级导航判定 |
| `types/` | Renderer 类型定义 |
| `crm-bridge/` | CRM Renderer 路由桥接 |
| `constants.ts` | Renderer 常量（PROVIDERS 等） |

## 3. 启动链路

```text
App.tsx
  → useStartupGate
    → window.smcShell.resolveStartupDecision()
    → splash (最少 1300ms) → login / welcome / installing / setup / main
  → Layout
    → hydrate mainPageState (sidebarMode / workspaceOrder / externalTabs / lastActiveWorkspace)
    → MainPage
      → MainTopBar (Tabs / Navigation / Settings / WindowControls)
      → MainPage__body → WorkspaceOutlet
        → WorkspaceRenderer → 按 kind 分发 Screen
```

## 4. 当前启用的 Workspace 模块

从 `workspace-registry.ts` 的 `STATIC_WORKSPACE_MODULES` 提取：

| id | kind | shellLayerId | closeable | draggable | showInTabBar | source |
|---|---|---|---|---|---|---|
| `web-operator` | `composite` | `web-operator` | false | false | true | `operator` |
| `crm-workbench` | `react` | — | false | false | **false** | `crm` |
| `local-hermes` | `react` | — | false | false | true | `hermes` |

**已注释（未启用）**：`workspaces`、`portal`、`task-workbench`、`office`

外部浏览器 Tab 通过 `external-browser:{uuid}` 前缀动态创建，不在 registry 中注册。

## 5. WorkspaceRenderer 分发逻辑

```text
WorkspaceRenderer(workspaceId)
  ├─ "external-browser:*" → WebViewWorkspace
  ├─ kind "webview"       → PortalScreen (ReactWorkspace)
  ├─ kind "composite"     → WebOperatorScreen (CompositeWorkspace)
  ├─ kind "react"
  │    ├─ "office"         → Office (ReactWorkspace, lazy on officeVisited)
  │    ├─ "task-workbench" → TaskWorkbenchScreen (ReactWorkspace)
  │    ├─ "local-hermes"   → HermesScreen (ReactWorkspace)
  │    ├─ "crm-workbench"  → CrmWorkbenchScreen (ReactWorkspace)
  │    └─ 其他 (workspaces)→ WorkspacesScreen (ReactWorkspace)
  └─ null / unknown        → <></>
```

## 6. 二级导航面板

| workspace | 面板列表 |
|---|---|
| `web-operator` | `browser-state` / `crm-context` / `hermes-task` / `page-structure` / `action-log` |
| `office` | `office` |
| 其余 | 无（空数组） |

`hasGlobalSecondaryNav()` 判定是否显示全局 DesktopSidebar（当前在 MainPage 中硬编码为 `false`）。

## 7. Screens 目录

| 目录 | 用途 |
|---|---|
| `SplashScreen/` | 启动画面 |
| `Layout/` | 主界面编排（Layout.tsx） |
| `MainPage/` | 一级壳层（MainPage / MainTopBar / MainViewTabs / Settings / Servers） |
| `SettingsDrawer/` | 设置抽屉（server / general / runtime / multi-profiles） |
| `Portal/` | Portal WebView 嵌入 |
| `WebOperator/` | Web Operator 受控浏览器 |
| `Hermes/` | Local Hermes 三栏（Chat / Sessions / Models / Skills / Tools / Memory / Providers） |
| `Workspaces/` | Workspaces 三栏 |
| `Crm/` | CRM Workbench |
| `TaskWorkbench/` | 本地任务三栏 |
| `Office/` | Office 可视化 |
| `Install/` | 安装向导 |
| `Setup/` | 运行时配置 |
| `Welcome/` | 欢迎页 |
| `Servers/` | 服务器入口（legacy） |

## 8. 相关文档

- [APP_STARTUP.md](APP_STARTUP.md) — 启动门控与 App 路由
- [MAIN_LAYOUT.md](MAIN_LAYOUT.md) — MainPage / Layout / WorkspaceOutlet
- [WORKSPACE_ROUTING.md](WORKSPACE_ROUTING.md) — WorkspaceRenderer / workspace-registry
- [STATE_AND_CONTEXT.md](STATE_AND_CONTEXT.md) — 全局 UI 状态与 Context
- [PRELOAD_API_USAGE.md](PRELOAD_API_USAGE.md) — Preload API 使用边界
- [COMPONENTS.md](COMPONENTS.md) — 组件族概览
- [HOOKS.md](HOOKS.md) — Hooks 概览
- [STYLES.md](STYLES.md) — 样式策略
