# MainPage / Layout / WorkspaceOutlet

## 1. Layout.tsx — 主界面编排

**文件**：`src/renderer/src/screens/Layout/Layout.tsx`

Layout 是主界面的顶层编排器，负责：

### 1.1 Hooks 编排

| Hook | 用途 |
|---|---|
| `useAuth()` | pendingBootstrapDiff / ConfigDiffConfirmDrawer |
| `useDesktopNavigation()` | view / activeProfile / navigateToView |
| `useUpdateState()` | 更新状态（available / downloading / ready / error） |
| `useRemoteMode(view)` | 是否远程模式 |
| `useProfileEntries()` | Profile 入口列表 |
| `useShellViewMetadata()` | ShellView 元数据（title / loading / favicon / crashed） |
| `useKeepAliveRegistry(view)` | KeepAlive 页面注册 |
| `useExternalBrowserTabs()` | 外部浏览器 Tab 管理 |
| `useShellLayerVisibility(view, externalIds, hydrated)` | 同步 ShellView 层可见性 |

### 1.2 本地状态

| 状态 | 类型 | 说明 |
|---|---|---|
| `sidebarMode` | `SidebarMode` | `"expanded"` / `"rail"` / `"hidden"` |
| `workspaceOrder` | `string[]` | Tab 排序 |
| `workspaceSecondaryState` | `Record<string, string>` | 各 workspace 二级面板选择 |
| `webOperatorLayout` | `WebOperatorLayoutState` | Web Operator 布局 |
| `hydrated` | `boolean` | 持久化状态恢复完成 |
| `settingsDrawerOpen` | `boolean` | 设置抽屉开关 |
| `settingsPanel` | `SettingsDrawerPanel` | 设置面板页签 |

### 1.3 持久化（mainPageState）

**恢复**（mount 时）：
```typescript
const state = await window.mainPageState.read();
→ sidebarMode / workspaceOrder / workspaceSecondaryState / webOperatorLayout / externalTabs / lastActiveWorkspace
```

**写入**（300ms debounce）：
```typescript
window.mainPageState.write(MainPagePersistedState)
→ sidebarMode / workspaceOrder / externalTabs / lastActiveWorkspace / lastSettingsDrawerPanel / workspaceSecondaryState / webOperatorLayout
```

### 1.4 ShellView 导航

Layout 封装 ShellView 层导航操作，通过 `resolveActiveShellLayerId(view)` 获取当前活跃层 ID：

| 操作 | IPC |
|---|---|
| Reload | `window.shellView.reload(layerId)` |
| Stop | `window.shellView.stopLoading(layerId)` |
| Back | `window.shellView.goBack(layerId)` |
| Forward | `window.shellView.goForward(layerId)` |
| Recover | `window.shellView.recover(id)` |

### 1.5 事件监听

- **`aiosBrowser.onOpened`** → 自动导航到 `web-operator`
- **`aiosBrowser.onCrmEvent`** → CRM Bridge 路由（`open-renderer-route` → `crm-workbench`；其余 → `web-operator` + `focusedPanel`）

### 1.6 渲染结构

```text
Layout (hydrated?)
  → <OverlayProvider legacyDrawerBlocking={settingsDrawerOpen || configDiffOpen}>
       <NativeShellLayerGateProvider activeView={navigation.view}>
         <MainPage
           outlet={<WorkspaceOutlet view={...} />}
           statusBar={<StatusBar />}
           modalLayer={<ModalLayer />}   ← overlay/DialogLayer
           drawerLayer={<DrawerLayer /> + <SettingsDrawer /> + <ConfigDiffConfirmDrawer />}
         />
       </NativeShellLayerGateProvider>
     </OverlayProvider>
```

**V5.7.8**：`legacyDrawerBlocking` 使 SettingsDrawer / ConfigDiffConfirmDrawer 打开时 `WebContentsHost` 自动 hide active shell layer；`NativeShellLayerGateProvider` 首帧 `useLayoutEffect` 兜底避免闪挡。

**hydrated 前渲染空壳**，避免闪烁。

## 2. MainPage.tsx — 一级壳层

**文件**：`src/renderer/src/screens/MainPage/MainPage.tsx`

### 布局结构

```text
<div className="MainPage layout MainPage--sidebar-{mode}">
  <MainTopBar ... />
  <div className="MainPage__body">
    {/* DesktopSidebar 当前硬编码不渲染 (globalSecondaryNav = false) */}
    <main className="MainPage__content">
      {outlet}  ← WorkspaceOutlet
    </main>
  </div>
  {/* StatusBar 当前注释 */}
  {modalLayer}
  {drawerLayer}
</div>
```

**关键决定**：`globalSecondaryNav` 硬编码为 `false`，`showGlobalSidebar` 为 `false`。DesktopSidebar 不渲染。

### MainPageProps

| Prop 组 | 说明 |
|---|---|
| `outlet` / `statusBar` / `modalLayer` / `drawerLayer` | 壳层插槽 |
| `activeProfile` / `activeView` | 当前 Profile / 视图 |
| `profileEntries` | Profile 入口列表 |
| `externalTabs` / `tabOrder` | 外部浏览器 Tab |
| `sidebarMode` | 侧栏模式 |
| `metadataById` | ShellView 元数据 |
| `canCloseActiveTab` / `canNavigateShell` / `canGoBack` / `canGoForward` | 导航能力 |
| `secondaryPanel` | 当前二级面板 |
| `updateState` / `updateVersion` / `downloadPercent` / `updateError` | 更新状态 |

## 3. MainTopBar.tsx — 顶栏

**文件**：`src/renderer/src/screens/MainPage/MainTopBar.tsx`

```text
<header className="MainTopBar app-drag-region">
  [SidebarToggle] (仅 showSidebarToggle)
  <MainViewTabs ... />
  <div className="MainTopBar__actions">
    [+] New browser tab (输入 URL)
    [Back] [Forward] [Stop] (仅 canNavigateShell)
    [Reload]
    [Close] (仅 canCloseActiveTab, 即 external-browser)
    [Settings] → openSettingsDrawer("server")
    [User] → openSettingsDrawer("account")
  </div>
  <WindowControls />
</header>
```

### Sidebar 三态切换

`expanded → rail → hidden → expanded`

### 新建浏览器 Tab

点击 `+` 弹出 URL 输入框，提交后调用 `onOpenExternalTab(url)` → `shellView.create("external-browser:uuid", ...)`。

## 4. MainViewTabs.tsx — 工作区 Tabs

**文件**：`src/renderer/src/screens/MainPage/MainViewTabs.tsx`

**Tab 分类**：

| 类别 | 来源 | 可拖拽 | 可关闭 |
|---|---|---|---|
| fixedTabs | `STATIC_WORKSPACE_MODULES` 中 `draggable=false` | 否 | 按 module.closeable |
| draggableTabs | `STATIC_WORKSPACE_MODULES` 中 `draggable=true` + externalTabs | 是 | externalTabs 可关闭 |

**DnD**：使用 `@dnd-kit/core` + `@dnd-kit/sortable`，仅 draggable tabs 参与拖拽排序。

**Tab 标签来源优先级**：
1. `portal` Tab 始终用 i18n key（不 mirror 嵌入页 title）
2. ShellView metadata.title（favicon + title）
3. i18n titleKey
4. tab.title / tab.id

**Recover 按钮**：当 `metadata.crashed` 或 `metadata.errorCode` 存在时显示。

## 5. WorkspaceOutlet.tsx

**文件**：`src/renderer/src/components/layout/WorkspaceOutlet.tsx`

薄壳组件，直接委托给 `WorkspaceRenderer`。Props 透传，不做额外逻辑。

## 6. 布局常量

**文件**：`src/shared/shell/main-page-constants.ts`

| 常量 | 值 | 含义 |
|---|---|---|
| `MAIN_TOPBAR_HEIGHT` | 40px | 顶栏高度 |
| `MAIN_STATUSBAR_HEIGHT` | 24px | 状态栏高度 |
| `MAIN_RAIL_WIDTH` | 56px | 侧栏 Rail 模式宽度 |
| `MAIN_SIDEBAR_WIDTH` | 232px | 侧栏展开宽度 |
| `MAIN_INSPECTOR_WIDTH` | 320px | Inspector 面板宽度 |
| `DEFAULT_WINDOW_WIDTH` | 1280px | 默认窗口宽度 |
| `DEFAULT_WINDOW_HEIGHT` | 800px | 默认窗口高度 |
| `MINIMUM_WINDOW_WIDTH` | 900px | 最小窗口宽度 |
| `MINIMUM_WINDOW_HEIGHT` | 600px | 最小窗口高度 |

## 7. KeepAliveView

**文件**：`src/renderer/src/components/layout/KeepAliveView.tsx`

通过 `display: none / flex` 切换实现页面保活，不销毁 DOM。

```text
active=true  → display:flex, flex:1, width/height:100%
active=false → display:none, aria-hidden=true
```
