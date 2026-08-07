# 全局 UI 状态与 Context

## 1. Layout 本地状态

Layout.tsx 管理一组核心 UI 状态，通过 props 下发给 MainPage / WorkspaceOutlet：

| 状态 | 类型 | 默认值 | 持久化 | 说明 |
|---|---|---|---|---|
| `sidebarMode` | `SidebarMode` | `"expanded"` | ✅ | 侧栏三态 |
| `workspaceOrder` | `string[]` | `[]` | ✅ | Tab 排序 |
| `workspaceSecondaryState` | `Record<string, string>` | `{}` | ✅ | 各 workspace 二级面板 |
| `webOperatorLayout` | `WebOperatorLayoutState` | `DEFAULT_WEB_OPERATOR_LAYOUT` | ✅ | Web Operator 布局 |
| `hydrated` | `boolean` | `false` | — | 状态恢复完成标记 |
| `settingsDrawerOpen` | `boolean` | `false` | — | 设置抽屉开关 |
| `settingsPanel` | `SettingsDrawerPanel` | `"server"` | ✅ (lastSettingsDrawerPanel) | 设置面板页签 |

### SidebarMode 三态

```text
expanded → rail → hidden → expanded
```

- `expanded`：232px 宽侧栏
- `rail`：56px 宽图标栏
- `hidden`：完全隐藏

## 2. 持久化机制

**API**：`window.mainPageState.read()` / `window.mainPageState.write(payload)`

**存储位置**：`~/.hermes/desktop/main-page-state.json`

**持久化策略**：300ms debounce，变更后延迟写入，避免频繁 IO。

### MainPagePersistedState 结构（version 2）

```typescript
interface MainPagePersistedState {
  version: 2;
  sidebarMode: SidebarMode;
  workspaceOrder: string[];
  externalTabs: Array<{ id, title, url, createdAt, updatedAt }>;
  lastActiveWorkspace: string;
  lastSettingsDrawerPanel: SettingsDrawerPanel;
  workspaceSecondaryState: Record<string, string>;
  webOperatorLayout: WebOperatorLayoutState;
}
```

### 恢复流程

```text
mount → window.mainPageState.read()
  → setSidebarMode / setWorkspaceOrder / setWorkspaceSecondaryState / setWebOperatorLayout
  → restoreExternalTabs(state.externalTabs)
  → navigateToView(lastActiveWorkspace ?? "portal")
  → setSettingsPanel(lastSettingsDrawerPanel)
  → setHydrated(true)
```

## 3. useDesktopNavigation

**文件**：`src/renderer/src/hooks/useDesktopNavigation.ts`

管理当前视图与 Profile 选择：

| 状态 | 默认值 | 说明 |
|---|---|---|
| `view` | `"portal"` | 当前活跃视图 |
| `activeProfile` | `"default"` | 当前 Profile |
| `officeVisited` | `false` | Office 是否已访问（首次延迟渲染） |

### navigateToView(next)

切换视图，若 `next === "office"` 则标记 `officeVisited = true`。

## 4. useUpdateState

**文件**：`src/renderer/src/hooks/useUpdateState.ts`

通过 `window.hermesAPI` 事件监听应用更新：

| 事件 | IPC Channel | 状态变更 |
|---|---|---|
| `onUpdateAvailable` | `update-available` | `updateState = "available"` |
| `onUpdateDownloadProgress` | `update-download-progress` | `updateState = "downloading"` |
| `onUpdateDownloaded` | `update-downloaded` | `updateState = "ready"` |
| `onUpdateError` | `update-error` | `updateState = null`, `updateError = message` |

### handleUpdate()

- `available` → `downloadUpdate()` + `updateState = "downloading"`
- `ready` → `installUpdate()`

## 5. useRemoteMode

**文件**：`src/renderer/src/hooks/useRemoteMode.ts`

调用 `window.hermesAPI.isRemoteOnlyMode()`，返回 `boolean`。每次 `view` 变更重新查询。

## 6. useProfileEntries

**文件**：`src/renderer/src/hooks/useProfileEntries.ts`

调用 `window.profileEntry.listProfileEntries()`，返回 `ProfileEntrySummary[]`。仅 mount 时查询一次。

## 7. useShellViewMetadata

**文件**：`src/renderer/src/screens/MainPage/useShellViewMetadata.ts`

监听 ShellView 元数据事件（title / loading / favicon / crashed / errorCode / canGoBack / canGoForward），维护 `Record<string, ShellViewSnapshot>`。

## 8. useKeepAliveRegistry

**文件**：`src/renderer/src/components/layout/useKeepAliveRegistry.ts`

管理 KeepAlive 页面注册，根据当前 `view` 返回活跃的 `KeepAliveEntry` 列表。

## 9. KeepAliveView

**文件**：`src/renderer/src/components/layout/KeepAliveView.tsx`

通过 CSS `display: none / flex` 切换实现页面保活，不销毁组件实例和 DOM：

```text
active=true  → display:flex, flex:1, width/height:100%
active=false → display:none, aria-hidden=true
```

子组件始终保持挂载，切换时仅改变可见性。

## 10. AuthProvider Context

**文件**：`src/renderer/src/modules/auth/AuthProvider.tsx`

提供全局认证上下文：

- 认证状态
- `pendingBootstrapDiff` — 配置差异（触发 ConfigDiffConfirmDrawer）
- `onLogoutComplete` — 登出回调（触发 recheck）

## 11. ShellLayerVisibility

**文件**：`src/renderer/src/hooks/useShellLayerVisibility.ts`

### syncInactiveShellLayers(activeView, externalTabIds)

遍历所有 ShellView 层（`portal` / `web-operator` + externalTabIds），对非活跃层调用 `window.shellView.hide(layerId)`。

### hideAllContentShellLayers()

隐藏所有静态 ShellView 层（splash / login 阶段使用）。

### useShellLayerVisibility(activeView, externalTabIds, enabled)

在 `enabled=true` 且 `activeView` / `externalTabIds` 变更时自动同步层可见性。

## 12. 二级导航状态

**workspaceSecondaryState**：`Record<StaticWorkspaceId, WorkspaceSecondaryPanel>`

每个 workspace 可独立记忆当前二级面板选择。默认值通过 `defaultSecondaryPanel(workspaceId)` 从 `SECONDARY_NAV_BY_WORKSPACE` 取首项。
