# 组件族概览

Renderer 层组件按职责划分为 5 个族：

| 族 | 目录 | 职责 | 详细文档 |
|---|---|---|---|
| layout | `components/layout/` | 桌面布局壳层：侧栏、工作区出口、窗口控制、状态栏、弹层兼容导出 | [layout.md](layout.md) |
| overlay | `components/overlay/` | **V5.7.8** 全局 Dialog/Drawer 栈 + NativeShellLayerGate | 本节 |
| shell | `components/shell/` | ShellView / WebContentsView 适配与原生层定位 | [shell.md](shell.md) |
| hermes | `components/hermes/` | Hermes 聊天面板（WebOperator 侧栏嵌入） | [hermes.md](hermes.md) |
| workspace | `components/workspace/` | Workspace 渲染分发（webview / composite / react / external） | [workspace.md](workspace.md) |
| install | `components/install/` + `components/install-wizard/` | 安装向导与 PyPI 镜像配置 | [install.md](install.md) |

## 文件清单

### layout（10 文件）

| 文件 | 类型 | 导出 |
|---|---|---|
| `DesktopShell.tsx` | 组件 | `DesktopShell` — 三栏布局壳（sidebar + header + outlet + status + modal + drawer） |
| `DesktopSidebar.tsx` | 组件 | `DesktopSidebar` — 二级导航侧栏 + 更新按钮 |
| `WorkspaceOutlet.tsx` | 组件 | `WorkspaceOutlet` — 委托 `WorkspaceRenderer` 的薄壳 |
| `WindowControls.tsx` | 组件 | `WindowControls` — 最小化 / 最大化 / 关闭按钮（macOS 返回 null） |
| `StatusBar.tsx` | 组件 | `StatusBar` — 底部状态栏（Profile / Mode / Update） |
| `ModalLayer.tsx` | 组件 | `ModalLayer` — 兼容导出 `overlay/DialogLayer` |
| `DrawerLayer.tsx` | 组件 | `DrawerLayer` — 兼容导出 `overlay/DrawerLayer` |
| `PageHeader.tsx` | 组件 | `PageHeader` — 页面标题头（legacy，主链路用 MainTopBar） |
| `KeepAliveView.tsx` | 组件 | `KeepAliveView` — Tab 保活容器（display 切换而非卸载） |
| `useKeepAliveRegistry.ts` | Hook | `useKeepAliveRegistry` — 保活视图注册表 |

### overlay（8 文件，**V5.7.8**）

| 文件 | 类型 | 导出 |
|---|---|---|
| `OverlayProvider.tsx` | Provider | 全局 Dialog/Drawer 状态 + `nativeBlocked` 计算 |
| `DialogLayer.tsx` | 组件 | 全局 Dialog stack（z-index 60；首版 `confirm` / `danger-confirm`） |
| `DrawerLayer.tsx` | 组件 | 全局 Drawer stack（z-index 50） |
| `NativeShellLayerGate.tsx` | Provider + Hook | `useNativeShellLayerGate()` — 阻塞时隐藏 active WebContentsView |
| `overlay-types.ts` | 类型 | `DialogDescriptor` / `DrawerDescriptor` / `OverlayState` / API 契约 |
| `useDialog.ts` | Hook | `useDialog()` — promise 式打开/关闭 Dialog |
| `useDrawer.ts` | Hook | `useDrawer()` — 打开/关闭 Drawer |
| `useOverlayState.ts` | Hook | 内部读取 overlay 状态 |

### shell（2 文件）

| 文件 | 类型 | 导出 |
|---|---|---|
| `WebContentsHost.tsx` | 组件 | `WebContentsHost` — 原生 WebContentsView 定位 + ResizeObserver 自动同步 bounds |
| `web-contents-host-bounds.ts` | 工具 | `resolveWebContentsHostBounds` / `getMainPageWorkspaceBottom` — bounds 计算 |

### hermes（14 文件）

| 文件 | 类型 | 导出 |
|---|---|---|
| `panel/WebOperatorHermesChatPanel.tsx` | 组件 | `WebOperatorHermesChatPanel` — 侧栏聊天面板 UI |
| `panel/WebOperatorHermesPanelComposer.tsx` | 组件 | `WebOperatorHermesPanelComposer` — 输入框 |
| `panel/WebOperatorHermesPanelMessageList.tsx` | 组件 | `WebOperatorHermesPanelMessageList` — 消息列表 |
| `panel/WebOperatorHermesPanelToolCard.tsx` | 组件 | `WebOperatorHermesPanelToolCard` — 工具调用卡片 |
| `hooks/useWebOperatorHermesPanelChat.ts` | Hook | `useWebOperatorHermesPanelChat` — 聊天状态机 + 发送/取消/清空/续会话 |
| `api/hermesPanelApi.ts` | API | `hermesPanelApi` — `window.hermesDefaultChat` 薄封装 |
| `lib/web-operator-hermes-session-binding.ts` | 工具 | 会话绑定持久化（scopeKey → sessionId） |
| `lib/inject-web-context-attachments.ts` | 工具 | 首轮注入页面上下文附件 |
| `lib/build-web-context-prefix.ts` | 工具 | 构造上下文前缀文本 |
| `lib/build-task-first-message.ts` | 工具 | 构造任务首发消息 |
| `lib/preset-actions.ts` | 常量 | `DEFAULT_WEB_OPERATOR_PRESET_ACTIONS` |
| `constants.ts` | 常量 | `DEFAULT_PANEL_SYSTEM_PROMPT` / `HERMES_PANEL_DRAFT_SESSION_ID` / `HERMES_PANEL_DEFAULT_PROFILE` |
| `types.ts` | 类型 | `HermesPanelMessage` / `HermesPanelPageContext` / `HermesPanelRunState` / `HermesPanelToolCall` / `HermesPanelTaskInput` 等 |
| `index.ts` | 入口 | 统一导出 |

### workspace（4 文件）

| 文件 | 类型 | 导出 |
|---|---|---|
| `WorkspaceRenderer.tsx` | 组件 | `WorkspaceRenderer` — 按 `module.kind` 分发到对应 Screen |
| `CompositeWorkspace.tsx` | 组件 | `CompositeWorkspace` — composite 类型壳（React chrome + native WebContents） |
| `ReactWorkspace.tsx` | 组件 | `ReactWorkspace` — react 类型壳（KeepAliveView 保活） |
| `WebViewWorkspace.tsx` | 组件 | `WebViewWorkspace` — webview/external 类型壳（WebContentsHost） |

### install（2 文件）

| 文件 | 类型 | 导出 |
|---|---|---|
| `PipMirrorFields.tsx` | 组件 | `PipMirrorFields` / `createDefaultPipMirrorSelection` — PyPI 镜像预设选择器 |
| `install-wizard.tsx` | 组件 | `InstallWizard` — Agent 安装向导（检测 → 选源 → 安装 → 验证 → 完成） |
