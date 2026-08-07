# 组件族概览

## 1. 目录结构

```
src/renderer/src/components/
├── layout/          布局壳组件
├── workspace/       Workspace 渲染壳
├── hermes/          Hermes Chat 面板
├── shell/           ShellView / WebContentsHost
├── aios/            Portal Web 嵌入
├── dropdowns/       顶栏下拉菜单
├── runtime/         运行时状态/守卫
├── install/         安装相关（PipMirrorFields）
├── install-wizard/  安装向导
├── common/          品牌标识（HermesLogo / BrandLogo）
├── ui/              基础 UI（dropdown-menu）
├── AgentMarkdown.tsx    Agent Markdown 渲染
├── AttachmentChip.tsx   附件标签
├── ErrorBoundary.tsx    错误边界
├── I18nProvider.tsx     i18n Provider
├── RemoteNotice.tsx     远程模式提示
├── ThemeProvider.tsx    主题 Provider
└── Versions.tsx         版本信息
```

## 2. layout/ — 布局壳组件

| 组件 | 文件 | 说明 |
|---|---|---|
| `DesktopShell` | `DesktopShell.tsx` | Legacy 壳层（非主链路） |
| `DesktopSidebar` | `DesktopSidebar.tsx` | 全局侧栏（当前未渲染，MainPage 硬编码关闭） |
| `WindowControls` | `WindowControls.tsx` | 窗口控制按钮（最小化/最大化/关闭） |
| `PageHeader` | `PageHeader.tsx` | Legacy 页头（非主链路） |
| `StatusBar` | `StatusBar.tsx` | 底部状态栏（当前注释，未渲染） |
| `ModalLayer` | `ModalLayer.tsx` | 全局弹窗层 |
| `DrawerLayer` | `DrawerLayer.tsx` | 全局抽屉层 |
| `KeepAliveView` | `KeepAliveView.tsx` | 页面保活容器（display 切换） |
| `WorkspaceOutlet` | `WorkspaceOutlet.tsx` | Workspace 渲染出口（委托 WorkspaceRenderer） |

## 3. workspace/ — Workspace 渲染壳

| 组件 | 文件 | 说明 |
|---|---|---|
| `WorkspaceRenderer` | `WorkspaceRenderer.tsx` | 按 workspace kind 分发 Screen |
| `ReactWorkspace` | `ReactWorkspace.tsx` | React 页面 KeepAlive 壳 |
| `CompositeWorkspace` | `CompositeWorkspace.tsx` | Web Operator 专用壳（ShellView + React 侧栏） |
| `WebViewWorkspace` | `WebViewWorkspace.tsx` | 外部浏览器 WebView 壳 |

## 4. hermes/ — Hermes Chat 面板

| 组件 | 文件 | 说明 |
|---|---|---|
| `WebOperatorHermesChatPanel` | `panel/WebOperatorHermesChatPanel.tsx` | Web Operator 侧栏 Hermes Chat |
| `WebOperatorHermesPanelComposer` | `panel/WebOperatorHermesPanelComposer.tsx` | 消息输入区 |
| `WebOperatorHermesPanelMessageList` | `panel/WebOperatorHermesPanelMessageList.tsx` | 消息列表 |
| `WebOperatorHermesPanelToolCard` | `panel/WebOperatorHermesPanelToolCard.tsx` | Tool 调用卡片 |

## 5. shell/ — ShellView 管理

| 组件 | 文件 | 说明 |
|---|---|---|
| `WebContentsHost` | `shell/WebContentsHost.tsx` | WebContentsView 容器（setBounds 定位） |

## 6. aios/ — Portal 嵌入

| 组件 | 文件 | 说明 |
|---|---|---|
| `AiOsWebAppHost` | `aios/AiOsWebAppHost.tsx` | Portal Web 嵌入宿主 |

## 7. dropdowns/ — 顶栏下拉

| 组件 | 文件 | 说明 |
|---|---|---|
| `GatewayStatusDropdown` | `GatewayStatusDropdown.tsx` | Gateway 状态下拉 |
| `ModelSelectorDropdown` | `ModelSelectorDropdown.tsx` | 模型选择下拉 |
| `ProfileSwitcherDropdown` | `ProfileSwitcherDropdown.tsx` | Profile 切换下拉 |
| `QuickActionsDropdown` | `QuickActionsDropdown.tsx` | 快捷操作下拉 |
| `dropdown-shared` | `dropdown-shared.tsx` | 共享下拉样式/逻辑 |

## 8. runtime/ — 运行时

| 组件 | 文件 | 说明 |
|---|---|---|
| `RuntimeGuard` | `RuntimeGuard.tsx` | 运行时守卫（重定向到 Settings） |
| `RuntimeStatusBar` | `RuntimeStatusBar.tsx` | 运行时状态栏组件 |

## 9. install/ — 安装

| 组件 | 文件 | 说明 |
|---|---|---|
| `PipMirrorFields` | `install/PipMirrorFields.tsx` | PyPI 镜像配置字段 |

## 10. 顶层组件

| 组件 | 文件 | 说明 |
|---|---|---|
| `AgentMarkdown` | `AgentMarkdown.tsx` | Agent Markdown 渲染 |
| `AttachmentChip` | `AttachmentChip.tsx` | 附件标签 |
| `ErrorBoundary` | `ErrorBoundary.tsx` | React 错误边界 |
| `I18nProvider` | `I18nProvider.tsx` | i18next Provider |
| `RemoteNotice` | `RemoteNotice.tsx` | 远程模式提示 |
| `ThemeProvider` | `ThemeProvider.tsx` | 主题 Provider |
| `Versions` | `Versions.tsx` | 版本信息展示 |
