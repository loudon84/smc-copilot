# Workspace 组件族

> `src/renderer/src/components/workspace/`

Workspace 渲染分发层，根据 `WorkspaceModule.kind` 将请求路由到对应的 Screen 组件或原生 WebContentsView。

## WorkspaceRenderer

**文件**：`WorkspaceRenderer.tsx`

核心分发组件，决定当前 workspace 渲染哪个 Screen。

### Props

| 字段 | 类型 | 说明 |
|---|---|---|
| `workspaceId` | `View` | 当前工作区 ID（静态 ID 或 `external-browser:uuid`） |
| `activeProfile` | `string` | 当前 Profile 名 |
| `officeVisited` | `boolean` | Office 是否已访问（延迟加载） |
| `onNavigate` | `(view: View) => void` | 视图切换回调 |
| `onOpenSettingsDrawer` | `(panel?: SettingsDrawerPanel) => void` | 打开设置 Drawer |
| `secondaryPanel` / `onSecondaryPanelChange` | `string?` / `(panel: string) => void` | 二级面板状态 |
| `webOperatorLayout` / `onWebOperatorLayoutChange` | `WebOperatorLayoutState?` / `(next) => void` | WebOperator 布局状态 |

### 分发逻辑

```
workspaceId.startsWith("external-browser:")
  → WebViewWorkspace (layerId = workspaceId)

resolveWorkspaceModule(workspaceId) → module
  module.kind === "webview"
    → ReactWorkspace + PortalScreen
  module.kind === "composite"
    → CompositeWorkspace + WebOperatorScreen
  module.kind === "react"
    module.id === "office"       → ReactWorkspace + Office (KeepAlive)
    module.id === "task-workbench" → ReactWorkspace + TaskWorkbenchScreen
    module.id === "local-hermes"  → ReactWorkspace + HermesScreen
    module.id === "crm-workbench" → ReactWorkspace + CrmWorkbenchScreen
    default (workspaces)          → ReactWorkspace + WorkspacesScreen
```

### 屏幕映射

| kind / id | 包裹组件 | Screen |
|---|---|---|
| `external-browser:*` | `WebViewWorkspace` | — |
| `webview` (portal) | `ReactWorkspace` | `PortalScreen` |
| `composite` (web-operator) | `CompositeWorkspace` | `WebOperatorScreen` |
| `react:office` | `ReactWorkspace` | `Office` (KeepAlive) |
| `react:task-workbench` | `ReactWorkspace` | `TaskWorkbenchScreen` |
| `react:local-hermes` | `ReactWorkspace` | `HermesScreen` |
| `react:crm-workbench` | `ReactWorkspace` | `CrmWorkbenchScreen` |
| `react:workspaces` | `ReactWorkspace` | `WorkspacesScreen` |

## CompositeWorkspace

**文件**：`CompositeWorkspace.tsx`

Composite 类型壳层，当前实现与 `ReactWorkspace` 相同（`KeepAliveView` 保活）。语义上表示「React chrome + 原生 WebContents」混合工作区（如 WebOperator）。

Props：`active` / `children`

## ReactWorkspace

**文件**：`ReactWorkspace.tsx`

React 类型壳层，委托 `KeepAliveView` 实现 Tab 保活（display 切换而非卸载）。

Props：`active` / `children`

## WebViewWorkspace

**文件**：`WebViewWorkspace.tsx`

WebView / External 类型壳层，委托 `WebContentsHost` 渲染原生 WebContentsView。

Props：`layerId` / `className?` / `enabled?`
