# MainPage

## 1. 路径

```text
src/renderer/src/screens/MainPage/
```

## 2. 入口

由 `Layout.tsx` 渲染，接收数据 props（secondaryPanel、update、outlet、StatusBar 等）。

## 3. 职责

- V2.0 主界面壳层 UI 编排
- MainTopBar：Profile 切换、Gateway 状态、Tabs、WindowControls、侧栏按钮
- MainViewTabs：顶栏工作区 Tab 列表（含 DnD 拖拽、+号创建 external-browser tab）
- DesktopSidebar：条件渲染侧栏（非 portal/workspaces 时）
- WorkspaceOutlet：各 Screen 渲染出口
- StatusBar：底部状态栏
- ShellView 元数据管理（title/loading/error/crash）
- External Browser Tab 管理

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `MainPage.tsx` | 主界面壳层主组件 |
| `MainTopBar.tsx` | 顶栏（Profile / Gateway / Tabs / WindowControls） |
| `MainViewTabs.tsx` | 工作区 Tab 列表 + DnD |
| `MainProfileSwitch.tsx` | Profile 切换下拉 |
| `MainRuntimeIndicator.tsx` | Gateway 运行状态指示器 |
| `ServersEntry.tsx` | 顶栏 Servers 入口（→ openSettingsDrawer("server")） |
| `useExternalBrowserTabs.ts` | External Browser Tab 生命周期管理 |
| `useShellViewMetadata.ts` | ShellView 元数据事件订阅 |
| `main-page-tabs.ts` | Tab 定义与排序逻辑 |
| `main-page-types.ts` | MainPage 相关类型 |
| `tab-order.ts` | Tab 顺序持久化 |
| `shell-layer-id.ts` | Shell 层 ID 常量 |
| `main-page.css` | 样式 |
| `MainPageDebugPanel.tsx` | 调试面板（开发用） |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.mainPageState.*`（workspaceOrder / externalTabs / sidebarMode） |
| Preload | `window.shellView.*`（create / metadata / navigation） |
| Preload | `window.profileRuntime.*`（状态 / 启停） |
| Preload | `window.hermesAPI.windowControls`（窗口控制） |
| Props | Layout 传入的 secondaryPanel / update / outlet / StatusBar |

## 6. 状态流

```text
Layout props + mainPageState
  → MainPage 渲染
  → MainTopBar（Profile / Runtime / Tabs）
  → MainViewTabs（Tab 列表 + DnD + +号）
  → WorkspaceOutlet（当前 Tab 对应 Screen）
  → ShellView metadata 事件 → Tab 状态更新
  → ExternalBrowserTab 创建/关闭 → Tab 列表更新
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- 不绕过 workspace routing
- 顶栏 RuntimeGuard 仅打开 SettingsDrawer，不独立渲染

## 8. 相关文档

- `docs/API_CONTRACTS.md` § MainPage State / ShellView / Profile Runtime
- `docs/renderer/WORKSPACE_ROUTING.md`
- `prd/v2.0_mainpage.md` / `prd/v2.1_mainpage.md`
