# Workspace Renderer 分发逻辑

> `src/renderer/src/workspace/WorkspaceRenderer.tsx`（实际位于 `components/workspace/WorkspaceRenderer.tsx`）
> 路由入口：`src/renderer/src/components/layout/WorkspaceOutlet.tsx` → `WorkspaceRenderer`

## 分发流程

```
WorkspaceOutlet(view, ...)
  → WorkspaceRenderer(workspaceId=view, ...)
```

### 1. External Browser 判断

```ts
if (workspaceId.startsWith("external-browser:"))
  → WebViewWorkspace(layerId=workspaceId, enabled=true)
```

动态 Tab，直接用 `workspaceId` 作为 ShellView 层 ID。

### 2. 静态模块解析

```ts
const module = resolveWorkspaceModule(workspaceId);
```

未找到 → 返回空 fragment。

### 3. kind 分发

| `module.kind` | 渲染路径 | 说明 |
|---|---|---|
| `"webview"` | `ReactWorkspace` + `PortalScreen` | Portal WebView（嵌入 :3000）；`PortalScreen` 内部使用 `WebContentsHost` |
| `"composite"` | `CompositeWorkspace` + `WebOperatorScreen` | WebOperator（React chrome + 原生 WebContents 混合）；传入 `secondaryPanel` / `webOperatorLayout` |
| `"react"` | 按 `module.id` 细分 | 见下表 |

### 4. react 细分

| `module.id` | Screen | 特殊处理 |
|---|---|---|
| `"office"` | `Office` | `officeVisited` 为 false 时不渲染；`visible` prop 控制激活 |
| `"task-workbench"` | `TaskWorkbenchScreen` | — |
| `"local-hermes"` | `HermesScreen` | 传入 `activePanel` / `onPanelChange` / `onOpenRuntimeSettings` |
| `"crm-workbench"` | `CrmWorkbenchScreen` | 传入 `enabled` / `onNavigate` |
| 其他（`"workspaces"`） | `WorkspacesScreen` | 传入 `profile` / `activePanel` / `onPanelChange` / `onOpenSettingsDrawer` |

## 包裹组件

| 组件 | 行为 |
|---|---|
| `WorkspaceShell` | flex 全屏容器（`<div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">`） |
| `ReactWorkspace` | 委托 `KeepAliveView(active)` — display 切换保活 |
| `CompositeWorkspace` | 当前等同 `ReactWorkspace`（语义标记） |
| `WebViewWorkspace` | 委托 `WebContentsHost(layerId)` — 原生 WebContentsView 定位 |

## resolveShellLayerId

**文件**：`resolve-workspace.ts`

```ts
function resolveShellLayerId(workspaceId: View): string | null
```

- `external-browser:*` → 返回 `workspaceId` 本身
- 静态模块 → 返回 `module.shellLayerId`（webview/composite 有值，react 无）
- 用于判断某个 workspace 是否需要 ShellView 原生层
