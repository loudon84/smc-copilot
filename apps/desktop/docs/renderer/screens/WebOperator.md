# WebOperator

## 1. 路径

```text
src/renderer/src/screens/WebOperator/
```

## 2. 入口

由 `WorkspaceRenderer` 根据 registry `web-operator`（kind `composite`）渲染。

## 3. 职责

- 受控浏览器自动化界面（V5.7 WebContentsView 核心）
- BrowserToolbar：地址栏、导航按钮（back/forward/reload/stop）
- BrowserViewportHost：ShellView WebContents 宿主
- FrameTreePanel：Frame Tree 结构展示
- PageStructurePanel：DOM 结构化面板
- ScreenshotPanel：页面截图
- ElementListPanel：元素列表
- BrowserActionLog：操作日志
- HermesTaskPanel：Hermes 任务流（V5.7.5，分析内容 → AI）
- CrmEventPanel：CRM 桥事件面板
- WebOperatorSideRail：侧边操作栏

### 3.1 WebOperatorScreen 作为 Composite Workspace

`WebOperatorScreen` 是 registry `web-operator`（kind `composite`）的渲染入口。它不是单一页面，而是编排了四个区域的三栏 composite workspace：

- **主区域**（`web-operator-layout__main`）：BrowserToolbar + WebContentsHost
- **分隔条**（`web-operator-layout__handle`）：可拖拽 resize，由 `useWebOperatorLayoutSplit` 驱动
- **侧边面板区**（`web-operator-layout__side`）：WebOperatorPanels（5 个子面板）
- **SideRail**：面板切换导航 + 折叠按钮

外层 `WebOperatorScreen` 负责挂载 `WebOperatorPageContextProvider` + `WebOperatorTaskStartDialogHost`，确保 context 和遮罩在组件树顶层可用。

### 3.2 WebContentsHost 与 WEB_OPERATOR_LAYER_ID

`WebContentsHost`（`components/shell/WebContentsHost.tsx`）是 Renderer 侧的**占位壳**，它本身不渲染 WebContents，而是：

1. 测量自身 DOM `getBoundingClientRect()`
2. 调用 `window.shellView.setBounds(layerId, bounds)` 让 Main 进程将原生 WebContentsView 定位到该区域
3. 通过 `ResizeObserver` + `IntersectionObserver` + `window.resize` 持续同步 bounds
4. `enabled=false` 时调用 `shellView.hide(layerId)` 隐藏原生层

`WEB_OPERATOR_LAYER_ID` 值为 `"web-operator"`（定义于 `web-operator-constants.ts`），与 `ShellBrowserViewAdapter` 注册的层 ID 对应。

### 3.3 WebOperatorPanels 面板体系

`WebOperatorPanels`（`panels/WebOperatorPanels.tsx`）编排 5 个子面板，遵循 `web-operator-panels-contract.ts` 定义的 `WebOperatorPanelId` 联合类型与 `WEB_OPERATOR_PANEL_ORDER` 顺序：

| PanelId | 组件 | size | 说明 |
|---|---|---|---|
| `browser-state` | `BrowserStatePanel` | md | 运行时状态 + 页面 inputs/buttons |
| `crm-context` | `CrmEventPanel` | md | CRM 桥事件 + 下发命令 |
| `hermes-task` | `HermesTaskPanel` | md | Hermes AI 对话流 |
| `page-structure` | `PageStructurePanel` | lg | Frame Tree + HTML Inspector + 元素列表 |
| `action-log` | `BrowserActionLog` | lg | 结构化动作日志 + 审计日志 |

渲染规则：hermes-task **始终挂载**（保持 Chat 会话活跃）；其余面板仅当 `active` 时挂载。`normalizeWebOperatorPanelId` 将旧 `"screenshot"` 归一化为 `"browser-state"`。

### 3.4 SideRail 面板切换

`WebOperatorSideRail` 渲染一组图标按钮（来自 `SECONDARY_NAV_BY_WORKSPACE["web-operator"]`），每个按钮对应一个面板。点击行为：

1. 调用 `onFocusedPanelChange(panel)` 切换活跃面板
2. 若面板区已折叠（`panelsOpen=false`），同时展开（`onTogglePanelsOpen`）

顶部按钮控制侧边面板区折叠/展开（Lucide `PanelRightClose` / `PanelRightOpen`）。

图标映射：`Monitor`（browser-state）、`Building2`（crm-context）、`Bot`（hermes-task）、`ScanSearch`（page-structure）、`ScrollText`（action-log）。

### 3.5 PageStructurePanel / Get HTML / 分析内容

`PageStructurePanel` 是最大的面板，内含：

1. **FrameTreePanel**：展示 Frame Tree 层级，支持选中 frame
2. **PageSelectorActionBar**：CSS selector 输入 + Find/Click/Type 即时测试
3. **PageFrameHtmlInspector**：
   - "Get HTML" 按钮 → `aiosBrowser.getFrameHtml()` → 显示 body innerHTML
   - "分析内容" 按钮 → 获取 HTML → `derivePageUrl()` → `buildPageContextFromFrameHtml()` → `requestHermesAnalysis()` → 切换到 hermes-task 面板
4. **ElementListPanel**：交互元素列表，支持 click/type 测试

`PageFrameHtmlInspector` 是"分析内容"流的起点——它构建 `HermesPanelPageContext` 并通过 `WebOperatorPageContext.requestHermesAnalysis()` 发起 Hermes 任务。

### 3.6 HermesTaskPanel 与 components/hermes

`HermesTaskPanel`（`screens/WebOperator/HermesTaskPanel.tsx`）是 Hermes 任务的面板壳，它：

1. 监听 `analysisRequest` 变化 → 调用 `webOperatorTaskSession.resolve()` 查找已有任务
2. 若有已绑定 session → 直接加载历史（`action: "loading"`）
3. 若无 → 弹出 `HermesTaskStartDialog`（`action: "pending"`）
4. 确认后 → 设置 `currentTask`（`action: "running"`）→ 委托 `WebOperatorHermesChatPanel`

`WebOperatorHermesChatPanel`（`components/hermes/panel/`）是可复用的 Chat UI 组件，核心 hook 为 `useWebOperatorHermesPanelChat`，负责：

- 首次发送前注入 web context 附件（`inject-web-context-attachments.ts`）
- 构建 context prefix（`build-web-context-prefix.ts`）
- SSE 流式订阅（`hermesPanelApi.onChunk/onToolProgress/onDone/onError`）
- 会话持久化（`web-operator-hermes-session-binding.ts` → localStorage）
- 任务首次消息构建（`build-task-first-message.ts`）

### 3.7 WebOperatorTaskStartDialogHost 遮罩策略

`WebOperatorTaskStartDialogHost` 在 `WebOperatorPageContextProvider` 内渲染，当 `taskStartDialog.requestId === analysisRequest?.requestId` 时挂载 `HermesTaskStartDialog`。

`HermesTaskStartDialog` 使用 `createPortal` 渲染到 `document.body`，并：

1. 设置 `document.body.style.overflow = "hidden"` 阻止背景滚动
2. 拦截 `Escape` 键（`preventDefault + stopPropagation`）
3. 提供用户提示词输入 + 技能选择（`hermesAPI.listInstalledSkills("default")`）

同时，`WebOperatorScreenInner` 通过 `enabled={enabled && !isTaskStartDialogOpen}` 将 `WebContentsHost` 设为不可交互——原生 WebContentsView 被 hide，用户只能与 Dialog 交互。

### 3.8 WebOperatorPageContext

`WebOperatorPageContext`（`context/WebOperatorPageContext.tsx`）是整个 WebOperator 屏的共享状态，包含：

| 字段 | 类型 | 用途 |
|---|---|---|
| `pageContext` | `HermesPanelPageContext \| null` | 当前页面上下文（URL/title/HTML/text/frameMeta） |
| `pageUrl` | `string \| null` | 稳定页面 URL（经 `derivePageUrl` 处理） |
| `analysisRequest` | `WebOperatorHermesAnalysisRequest \| null` | 当前分析请求（requestId/pageUrl/pageContext/createdAt） |
| `taskStartDialog` | `WebOperatorTaskStartDialogState \| null` | Dialog 状态 |
| `taskStartDialogHandlers` | `WebOperatorTaskStartDialogHandlers \| null` | Dialog onConfirm/onCancel |
| `setPageContext` | function | PageFrameHtmlInspector 设置上下文 |
| `requestHermesAnalysis` | function | 触发分析请求（生成 requestId） |

Context 实例通过 `globalThis.__smcWebOperatorPageContext__` 单例防 HMR 双实例（`web-operator-page-context-instance.ts`）。

### 3.9 与 Main browser IPC 的边界

Renderer 侧**仅**通过 Preload API 与 Main 交互，不直接使用 `ipcRenderer`：

| Preload API | 用途 |
|---|---|
| `window.aiosBrowser.*` | 13+ V5.7 方法：open/frame/snapshot/action/getFrameHtml/events/sendCrmCommand |
| `window.shellView.setBounds/hide` | 原生 WebContentsView 定位与隐藏 |
| `window.webOperatorTaskSession.*` | 任务会话 resolve/upsert |
| `window.hermesAPI.*` | Chat 发消息/获取模型/列出技能/会话历史/附件上传 |

Main 侧对应模块：`src/main/browser/browser-controller.ts`、`src/main/browser/browser-v57-core.ts`、`src/main/shell/shell-view-manager.ts`、`src/main/web-operator-task-session/`、`src/main/hermes.ts`。

## 4. 关键文件

| 文件 | 作用 |
|---|---|
| `WebOperatorScreen.tsx` | 主组件，编排 Toolbar + Viewport + Panels |
| `BrowserToolbar.tsx` | 地址栏 + 导航按钮 |
| `BrowserViewportHost.tsx` | ShellView 宿主容器 |
| `WebOperatorSideRail.tsx` | 侧边操作栏 |
| `FrameTreePanel.tsx` | Frame Tree 面板 |
| `PageStructurePanel.tsx` | DOM 结构面板 |
| `ScreenshotPanel.tsx` | 截图面板 |
| `ElementListPanel.tsx` | 元素列表面板 |
| `BrowserActionLog.tsx` | 操作日志 |
| `BrowserStatePanel.tsx` | 浏览器状态面板 |
| `HermesTaskPanel.tsx` | Hermes 任务面板 |
| `HermesTaskStartDialog.tsx` | 任务启动对话框 |
| `CrmEventPanel.tsx` | CRM 事件面板 |
| `context/` | Page Context 管理 |
| `hooks/` | 浏览器状态 / 动作 / 审计 / CRM 事件等 hooks |
| `panels/` | 子面板组件 |
| `utils/` | URL 派生 / 上下文摘要 |
| `web-operator-constants.ts` | 常量 |
| `web-operator-layout-constants.ts` | 布局常量 |
| `web-operator.css` | 样式 |

## 5. 数据来源

| 来源 | API |
|---|---|
| Preload | `window.aiosBrowser.*`（13+ V5.7 方法：open / frame / snapshot / action / events） |
| Preload | `window.webOperatorTaskSession.*`（任务会话 CRUD） |
| Preload | `window.hermesAPI.*`（默认 Chat 发消息） |
| Preload | `window.shellView.*`（ShellView 生命周期） |
| Context | `WebOperatorPageContext` |

## 6. 状态流

```text
用户操作 Toolbar / SideRail
  → aiosBrowser.* IPC → Main BrowserController → ShellBrowserViewAdapter
  → ShellView WebContents 渲染
  → metadata 事件 → UI 状态更新
  → hooks 订阅 browser actions / audit / CRM events
  → Panel 展示

Hermes Task 流：
  → 用户选内容 → HermesTaskStartDialog → webOperatorTaskSession.create()
  → hermesAPI.sendMessage() → SSE 流 → HermesTaskPanel 展示
```

## 7. 约束

- 不直接访问 Node.js
- 不新增未登记 IPC
- 不跨层 import main/preload
- ShellView 层 ID 固定为 `web-operator`
- CRM 事件需经 Main 校验 origin / event type / payload size

## 8. 相关文档

- `docs/API_CONTRACTS.md` § Web Operator V5.7
- `docs/renderer/WORKSPACE_ROUTING.md`
- `prd/v5.7_webcontentsview.md`
- `prd/v5.7.5_hermes_integration.md`
