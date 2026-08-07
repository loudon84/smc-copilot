# WorkspaceRenderer / workspace-registry

## 1. workspace-registry.ts — 模块注册表

**文件**：`src/renderer/src/workspace/workspace-registry.ts`

### STATIC_WORKSPACE_MODULES

当前启用的模块：

| id | kind | shellLayerId | closeable | draggable | persistable | showInTabBar | source |
|---|---|---|---|---|---|---|---|
| `web-operator` | `composite` | `web-operator` | false | false | true | true | `operator` |
| `crm-workbench` | `react` | — | false | false | true | **false** | `crm` |
| `local-hermes` | `react` | — | false | false | true | true | `hermes` |

**已注释（未启用）**：

| id | kind | shellLayerId | source |
|---|---|---|---|
| `workspaces` | `react` | — | `local` |
| `portal` | `webview` | `portal` | `system` |
| `task-workbench` | `react` | — | `local` |
| `office` | `react` | — | `office` |

### 导出函数

| 函数 | 签名 | 说明 |
|---|---|---|
| `resolveWorkspaceModule(id)` | `(id: string) => WorkspaceModule \| null` | 查找静态模块；`external-browser:*` 返回 null |
| `isStaticWorkspaceId(id)` | `(id: string) => id is WorkspaceModule["id"]` | 判断是否为已注册静态 ID |

### WorkspaceModule 类型

定义于 `src/shared/workspace/workspace-contract.ts`，关键字段：

- `id` — 模块唯一标识
- `kind` — `"webview"` / `"composite"` / `"react"`
- `shellLayerId` — 对应的 ShellView 层 ID（webview/composite 才有）
- `closeable` — Tab 是否可关闭
- `draggable` — Tab 是否可拖拽排序
- `persistable` — 是否参与状态持久化
- `showInTabBar` — 是否显示在顶栏 Tab 栏（默认 true）
- `source` — 来源标记（`system` / `operator` / `crm` / `hermes` / `local` / `office` / `external`）

## 2. WorkspaceRenderer.tsx — 渲染分发

**文件**：`src/renderer/src/components/workspace/WorkspaceRenderer.tsx`

### 分发逻辑

```text
WorkspaceRenderer({ workspaceId, ... })
  │
  ├─ workspaceId.startsWith("external-browser:")
  │    → WebViewWorkspace(layerId=workspaceId, enabled)
  │
  ├─ module = resolveWorkspaceModule(workspaceId)
  │    → null → <></>
  │
  └─ switch (module.kind)
       ├─ "webview"   → ReactWorkspace + PortalScreen
       ├─ "composite" → CompositeWorkspace + WebOperatorScreen
       └─ "react"
            ├─ "office"         → ReactWorkspace + Office (需 officeVisited)
            ├─ "task-workbench" → ReactWorkspace + TaskWorkbenchScreen
            ├─ "local-hermes"   → ReactWorkspace + HermesScreen
            ├─ "crm-workbench"  → ReactWorkspace + CrmWorkbenchScreen
            └─ default          → ReactWorkspace + WorkspacesScreen
```

### Workspace 壳组件

| 组件 | 用途 |
|---|---|
| `WorkspaceShell` | 通用 flex 容器（`flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden`） |
| `ReactWorkspace` | KeepAlive 包裹的 React 页面壳 |
| `CompositeWorkspace` | Web Operator 专用壳（ShellView + React 侧栏） |
| `WebViewWorkspace` | 外部浏览器 WebView 壳 |

### 各 Screen 的 props 注入

| Screen | 特殊 props |
|---|---|
| `PortalScreen` | `enabled`, `onNavigate`, `onOpenRuntimeSettings` |
| `WebOperatorScreen` | `enabled`, `focusedPanel`, `onFocusedPanelChange`, `layout`, `onLayoutChange` |
| `HermesScreen` | `activePanel`, `onPanelChange`, `onOpenRuntimeSettings` |
| `CrmWorkbenchScreen` | `enabled`, `onNavigate` |
| `Office` | `visible` (非 active) |
| `TaskWorkbenchScreen` | 无额外 props |
| `WorkspacesScreen` | `profile`, `activePanel`, `onPanelChange`, `onOpenSettingsDrawer` |

## 3. workspace-tabs.ts — Tab 构建

**文件**：`src/renderer/src/workspace/workspace-tabs.ts`

### buildWorkspaceTabs(externalTabs?)

从 `STATIC_WORKSPACE_MODULES` 构建 Tab 列表：

1. 过滤 `showInTabBar !== false` 的模块
2. 映射 `source`：`operator` / `crm` → `"operator"`，`external` → `"external"`，其余 → `"system"`
3. 拼接 externalTabs（source = `"external"`, closeable = true）

### isWorkspaceTabView(view)

判断 view 是否为 workspace tab（静态 ID 或 `external-browser:*` 前缀）。

## 4. resolve-workspace.ts — ShellView 层解析

**文件**：`src/renderer/src/workspace/resolve-workspace.ts`

### resolveShellLayerId(workspaceId)

```text
"external-browser:*" → workspaceId 本身作为 layerId
resolveWorkspaceModule(id)?.shellLayerId ?? null
```

返回 `null` 表示该 workspace 不需要 ShellView 层（纯 React 渲染）。

## 5. has-global-secondary-nav.ts

**文件**：`src/renderer/src/workspace/has-global-secondary-nav.ts`

### hasGlobalSecondaryNav(view)

当 `SECONDARY_NAV_BY_WORKSPACE[view].length > 0` 时返回 `true`，表示顶层壳应渲染 DesktopSidebar。

**注意**：当前 MainPage 中 `globalSecondaryNav` 硬编码为 `false`，此函数未实际生效。
