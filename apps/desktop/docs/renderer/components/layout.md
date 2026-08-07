# Layout 组件族

> `src/renderer/src/components/layout/`

桌面主界面的布局壳层组件，由 `MainPage` 编排。

## DesktopShell

**文件**：`DesktopShell.tsx`

经典三栏布局壳，接收插槽组合：

```
┌──────────┬────────────────────────────────┐
│ sidebar  │ header                         │
│          ├────────────────────────────────┤
│          │ outlet                         │
│          │                                │
│          ├────────────────────────────────┤
│          │ statusBar                      │
└──────────┴────────────────────────────────┘
+ modalLayer + drawerLayer (fixed overlay)
```

Props：`sidebar` / `header` / `outlet` / `modalLayer?` / `drawerLayer?` / `statusBar?`

> **注意**：V2.0+ 主链路使用 `MainPage` 自持壳层，`DesktopShell` 为 legacy。

## DesktopSidebar

**文件**：`DesktopSidebar.tsx`

全局二级导航侧栏，根据当前 `workspaceId` 查询 `SECONDARY_NAV_BY_WORKSPACE` 渲染二级 panel 按钮（`browser-state` / `crm-context` / `hermes-task` / `page-structure` / `action-log` / `office`）。底部显示自动更新按钮。

Props：

| 字段 | 类型 | 说明 |
|---|---|---|
| `mode` | `"expanded" \| "collapsed"` | 侧栏模式（三态之一） |
| `workspaceId` | `View` | 当前工作区 ID |
| `secondaryPanel` / `onSecondaryPanelChange` | `string` / `(panel: string) => void` | 二级面板选中状态 |
| `updateState` / `updateError` / `updateVersion` / `downloadPercent` / `onUpdate` | 更新相关 | 自动更新 UI |

## WorkspaceOutlet

**文件**：`WorkspaceOutlet.tsx`

薄壳组件，直接委托 `WorkspaceRenderer`，传递 `view` / `activeProfile` / `officeVisited` / `onNavigate` / `onOpenSettingsDrawer` / `secondaryPanel` / `onSecondaryPanelChange` / `webOperatorLayout` / `onWebOperatorLayoutChange`。

## WindowControls

**文件**：`WindowControls.tsx`

窗口控制按钮组（最小化 / 最大化或还原 / 关闭），通过 `window.hermesAPI.windowControls` IPC 调用主进程。

- macOS 平台返回 `null`（系统原生红绿灯）
- Windows/Linux 渲染 `—` / `□` / `×` 三按钮
- 监听 `resize` 事件同步 `isMaximized` 状态

## StatusBar

**文件**：`StatusBar.tsx`

底部状态栏，显示当前 Profile 名、连接模式（local/remote）、更新状态。

Props：`activeProfile` / `remoteMode` / `updateState`

## ModalLayer

**文件**：`ModalLayer.tsx`

兼容导出 `components/overlay/DialogLayer`。MainPage 仍使用 `modalLayer` prop 名称。

## DrawerLayer

**文件**：`DrawerLayer.tsx`

兼容导出 `components/overlay/DrawerLayer`。Layout 中 legacy `SettingsDrawer` / `ConfigDiffConfirmDrawer` 仍直接挂载，通过 `OverlayProvider.legacyDrawerBlocking` 接入 native gate。

## overlay（V5.7.8）

**目录**：`components/overlay/`

全局 Overlay 系统，解决 WebContentsView 原生层遮挡 React Dialog/Drawer 的问题：

```text
Layout
  └─ OverlayProvider (legacyDrawerBlocking)
       └─ NativeShellLayerGateProvider (activeView)
            └─ MainPage
                 ├─ outlet → WebContentsHost (effectiveEnabled)
                 ├─ modalLayer → DialogLayer
                 └─ drawerLayer → DrawerLayer + legacy drawers
```

- `useDialog()` / `useDrawer()` — 业务打开阻塞型弹层
- `nativeBlocked` — 任一 blocking dialog/drawer 或 legacy drawer 打开时为 true
- 与 `useShellLayerVisibility` 职责分离：后者管 tab 切换，前者管 overlay 阻塞

## PageHeader

**文件**：`PageHeader.tsx`

页面标题头（legacy）。主链路使用 `MainTopBar`。Props：`view` / `activeProfile` / `title?` / `subtitle?` / `actions?`

## KeepAliveView

**文件**：`KeepAliveView.tsx`

Tab 保活容器。通过 `display: flex | none` 切换可见性而非卸载，保持内部状态不丢失。

Props：`active` / `className?` / `children`

- `active=true`：`display: flex`，占满父容器
- `active=false`：`display: none`，DOM 保留但不可见

## useKeepAliveRegistry

**文件**：`useKeepAliveRegistry.ts`

保活视图注册表 Hook。追踪每个视图的 `mountedAt` 和 `lastActiveAt` 时间戳。

```ts
function useKeepAliveRegistry(activeView: string): Record<string, KeepAliveEntry>
```
