# Web Operator 模块编码任务清单

> 基于 spec.md（需求规格）、design.md（技术设计）、prd/webcontent_view.md（PRD 扩展方案）生成。
> 6 个 Phase，按依赖拓扑排序，每个任务为可独立验证的最小交付单元。

---

## 1. Phase 1: Browser Main 模块（基座）

### 1.1 [T1-01] 创建 browser-types.ts — 内部类型定义

- **依赖**: 无
- **优先级**: P0
- **文件**: `src/main/browser/browser-types.ts`
- **实现步骤**:
  - 定义 `BrowserViewBounds` 接口（x, y, width, height）
  - 定义 `PendingSensitiveAction` 内部接口（pendingActionId, action, selector, elementDescription, url, createdAt, expiresAt, originalParams）
  - 定义 `SENSITIVE_ACTION_KEYWORDS` 常量集合
  - 定义 `JS_SCRIPT_NAMES` 白名单常量（`__get_page_state__`, `__click_selector__`, `__type_selector__`, `__extract_table__`）
  - 导出所有内部类型，禁止使用 `any`
- **验收标准**: TypeScript 编译通过；无 `any` 类型；所有常量与 spec 定义一致

### 1.2 [T1-02] 创建 browser-security.ts — BrowserSecurityGuard

- **依赖**: T1-01
- **优先级**: P0
- **文件**: `src/main/browser/browser-security.ts`
- **实现步骤**:
  - 实现 `BrowserSecurityGuard` 类，构造函数接收 `configPath: string`
  - 实现 `loadConfig()`: 读取 `web-operator.config.json`，解析 `allowedDomains`，配置缺失时使用空白名单
  - 实现 `isDomainAllowed(url)`: 使用 `new URL(url).hostname` 提取域名，支持精确匹配和 `*.example.com` 通配符（使用 minimatch 或手写 glob）
  - 实现 `isPasswordField(selector)`: 检测 `type=password` 或 name 包含 `password`/`passwd`/`pwd`
  - 实现 `isSensitiveAction(selector, elementInfo?)`: 基于 `SENSITIVE_ACTION_KEYWORDS` 匹配 `data-action`、`aria-label`、按钮文本、type 属性
  - 实现 `validateAction(request)`: 综合校验，返回 `BrowserSecurityCheckResult { allowed, errorCode?, message?, isSensitiveAction? }`
  - 实现 `getAllowedDomains()` 和 `reloadConfig()`
- **验收标准**: 精确域名匹配通过；`*.example.com` 通配符匹配通过；配置缺失时全部拒绝；密码字段选择器被识别；敏感动作关键词被识别

### 1.3 [T1-03] 创建 browser-audit.ts — BrowserAuditLogger

- **依赖**: T1-01
- **优先级**: P0
- **文件**: `src/main/browser/browser-audit.ts`
- **实现步骤**:
  - 实现 `BrowserAuditLogger` 类，构造函数接收 `logDir: string`
  - 实现 `log(record)`: 生成 UUID v4 id + ISO 8601 time，序列化为 JSONL 追加写入
  - 实现日期轮转逻辑：写入前检查当前日期，跨天时关闭旧 WriteStream、创建新流
  - 实现文本脱敏：对 `browser.type` 操作，`argsSummary` 中仅记录 `{ textLength: text.length }`
  - 实现 `query(limit?)`: 读取当前日志文件最后 N 条记录
  - 实现 `close()`: 关闭 WriteStream
  - 实现 `getCurrentLogPath()`
- **验收标准**: JSONL 文件追加写入正确；跨天轮转创建新文件；`browser.type` 审计仅含 textLength；query 返回正确记录数

### 1.4 [T1-04] 创建 browser-view-manager.ts — BrowserViewManager

- **依赖**: T1-01, T1-02
- **优先级**: P0
- **文件**: `src/main/browser/browser-view-manager.ts`
- **实现步骤**:
  - 实现 `BrowserViewManager` 类，构造函数接收 `mainWindow: BrowserWindow`
  - 定义私有常量 `PARTITION = "persist:aios-external-web"`
  - 实现 `createView(url)`: 检查 `this.view` 是否存在（单例模式），若存在则调用 `navigate` 复用；否则创建 `WebContentsView`，设置独立 partition，`attachToMainWindow`，加载 URL
  - 实现 `navigate(url)`: 在已有视图上 `loadURL(url)`
  - 实现 `destroyView()`: 从 mainWindow 移除 WebContentsView，调用 `webContents.close()`，置空 `this.view`
  - 实现 `updateBounds(bounds)`: 调用 `this.view.setBounds(bounds)`
  - 实现 `getExternalWebContents()`: 返回 `this.view?.webContents ?? null`
  - 实现 `isReady()`: 返回 `this.view !== null && !this.view.webContents.isDestroyed()`
  - 实现 `onBoundsUpdate(callback)`: 注册 bounds 变更回调
  - 监听 mainWindow 的 `resize` 事件，触发 bounds 重新计算
- **验收标准**: WebContentsView 创建成功并设置独立 partition；单例模式：连续 open 不创建新视图；destroyView 释放资源；updateBounds 同步视口

### 1.5 [T1-05] 创建 browser-controller.ts — BrowserController

- **依赖**: T1-01, T1-02, T1-03, T1-04
- **优先级**: P0
- **文件**: `src/main/browser/browser-controller.ts`
- **实现步骤**:
  - 实现 `BrowserController` 类，构造函数接收 `viewManager`, `securityGuard`, `auditLogger`
  - 初始化 `pendingActions: Map<string, PendingSensitiveAction>`
  - 实现 `openExternalUrl(request)`: 调用 `securityGuard.isDomainAllowed`，通过后调用 `viewManager.createView/navigate`，记录审计
  - 实现 `goBack/ goForward / reload`: 检查 `viewManager.isReady()`，调用 `webContents.navigationHistory.goBack/forward` 或 `reload`
  - 实现 `getPageState(source)`: 通过 `webContents.executeJavaScript` 注入固定脚本 `__get_page_state__` 提取 DOM 元素信息（title/url/inputs/buttons/links）
  - 实现 `captureScreenshot(source)`: 调用 `webContents.capturePage()` 转为 base64 PNG
  - 实现 `clickSelector(request)`: 安全校验 → 敏感动作识别 → 通过 `executeJavaScript` 注入 `__click_selector__` 脚本
  - 实现 `typeIntoSelector(request)`: 密码字段检测 → 安全校验 → 注入 `__type_selector__` 脚本
  - 实现 `extractTable(selector, source)`: 注入 `__extract_table__` 脚本提取表格数据
  - 实现 `confirmAction(pendingActionId)` 和 `rejectAction(pendingActionId)`（Phase 6 完善，先写占位方法）
  - 实现 `getAuditLog(limit?)`: 委托 `auditLogger.query(limit)`
  - 每个操作方法统一调用 `auditLogger.log()` 记录审计
  - 错误场景返回结构化 `BrowserActionResult { ok: false, errorCode, message }`
- **验收标准**: TypeScript 编译通过；open/getState/screenshot/click/type 方法可用；选择器未找到返回 SELECTOR_NOT_FOUND；安全校验在操作前执行；审计记录写入正确

---

## 2. Phase 2: IPC 契约与 Preload API

### 2.1 [T2-01] 创建 browser-contract.ts — IPC 契约类型

- **依赖**: 无（可与 Phase 1 并行）
- **优先级**: P0
- **文件**: `src/shared/browser/browser-contract.ts`
- **实现步骤**:
  - 定义 `BrowserActionSource` 类型（"user" | "hermes" | "system"）
  - 定义 `BrowserActionName` 类型（"browser.open" | "browser.back" | ... | "browser.extract_table"）
  - 定义 `BrowserActionStatus` 类型（"success" | "failed" | "blocked" | "confirmed" | "rejected" | "timeout"）
  - 定义 `BrowserErrorCode` 类型（7 个错误码联合类型）
  - 定义所有请求类型：`BrowserOpenRequest`, `BrowserClickRequest`, `BrowserTypeRequest`, `BrowserExtractTableRequest`, `BrowserConfirmActionRequest`, `BrowserRejectActionRequest`, `BrowserViewBounds`
  - 定义所有响应类型：`BrowserActionResult`, `BrowserOpenResult`, `BrowserElementSummary`, `BrowserPageState`, `BrowserStateResult`, `BrowserScreenshotResult`
  - 定义 `BrowserAuditRecord` 接口
  - 定义 `PendingSensitiveAction` 接口
  - 定义 `BrowserSecurityCheckResult` 接口
  - 所有类型禁止 `any`
- **验收标准**: 无 `any` 类型；所有 IPC channel 的请求/响应类型定义完整；与 design.md 2.2.1 节一致

### 2.2 [T2-02] 创建 browser-errors.ts — 错误码定义与工具函数

- **依赖**: T2-01
- **优先级**: P0
- **文件**: `src/shared/browser/browser-errors.ts`
- **实现步骤**:
  - 定义 `BrowserErrorCodes` 常量对象，包含 7 个错误码的 code、message、httpStatus
  - 导出 `BrowserErrorCode` 类型（`keyof typeof BrowserErrorCodes`）
  - 实现 `createBrowserError(errorCode, overrides?)` 工厂函数，返回 `BrowserActionResult { ok: false, errorCode, message }`
- **验收标准**: 7 个错误码定义完整；`createBrowserError` 返回结构正确

### 2.3 [T2-03] 创建 browser-ipc.ts — IPC handler 注册

- **依赖**: T1-05, T2-01
- **优先级**: P0
- **文件**: `src/main/browser/browser-ipc.ts`
- **实现步骤**:
  - 实现 `BrowserIPC` 类，构造函数接收 `controller: BrowserController`
  - 实现 `register()` 方法，注册以下 `ipcMain.handle` handlers:
    - `browser.open` → `controller.openExternalUrl(request)`
    - `browser.back` → `controller.goBack(source)`
    - `browser.forward` → `controller.goForward(source)`
    - `browser.reload` → `controller.reload(source)`
    - `browser.get_state` → `controller.getPageState(source)`
    - `browser.screenshot` → `controller.captureScreenshot(source)`
    - `browser.click` → `controller.clickSelector(request)`
    - `browser.type` → `controller.typeIntoSelector(request)`
    - `browser.extract_table` → `controller.extractTable(selector, source)`
    - `browser.get_audit_log` → `controller.getAuditLog(limit)`
    - `browser.confirm_action` → `controller.confirmAction(pendingActionId)`
    - `browser.reject_action` → `controller.rejectAction(pendingActionId)`
    - `browser.update_bounds` → `viewManager.updateBounds(bounds)`
  - 实现 `unregister()` 方法，移除所有 `browser.*` handler
  - 每个 handler 包含 try-catch，捕获异常后返回结构化错误
- **验收标准**: 所有 13 个 IPC channel 注册成功；handler 调用对应 Controller 方法；异常捕获返回结构化错误

### 2.4 [T2-04] 创建 browser-api.ts — Preload API 实现

- **依赖**: T2-01
- **优先级**: P0
- **文件**: `src/preload/browser-api.ts`
- **实现步骤**:
  - 实现 `AiosBrowserAPI` 接口的所有方法，每个方法通过 `ipcRenderer.invoke("browser.*", ...)` 调用
  - 导航方法（open/back/forward/reload）自动注入 `source: "user"`
  - 实现 `onPendingAction(callback)`: 通过 `ipcRenderer.on("browser.on_pending_action", handler)` 订阅，返回取消订阅函数
  - 实现 `onAuditUpdate(callback)`: 通过 `ipcRenderer.on("browser.on_audit_update", handler)` 订阅，返回取消订阅函数
  - 禁止暴露原始 `ipcRenderer` 对象
- **验收标准**: `AiosBrowserAPI` 接口方法完整；所有方法通过 `ipcRenderer.invoke` 调用；事件订阅返回取消函数；不暴露 `ipcRenderer`

### 2.5 [T2-05] 集成到现有 Preload 和 Main Process

- **依赖**: T2-03, T2-04
- **优先级**: P0
- **文件**:
  - `src/preload/index.ts`（修改）— 添加 `contextBridge.exposeInMainWorld("aiosBrowser", aiosBrowser)`
  - `src/preload/index.d.ts`（修改）— 扩展 `Window` 接口添加 `aiosBrowser: AiosBrowserAPI`
  - `src/main/index.ts`（修改）— 在 `setupIPC()` 中调用 `browserIPC.register()`，实例化 BrowserSecurityGuard/BrowserAuditLogger/BrowserViewManager/BrowserController/BrowserIPC
- **实现步骤**:
  - 在 `src/preload/index.ts` 中 import `browser-api.ts` 并通过 `contextBridge.exposeInMainWorld` 暴露
  - 在 `src/preload/index.d.ts` 中为 `Window` 接口新增 `aiosBrowser` 属性
  - 在 `src/main/index.ts` 中添加 browser 模块初始化逻辑，确保 `BrowserIPC.register()` 在 app ready 后执行
  - 确保不修改现有 `hermesAPI` 相关逻辑
- **验收标准**: `window.aiosBrowser` 在 Renderer 中可用且类型正确；`window.hermesAPI` 不受影响；browser IPC handler 注册成功；应用启动无报错

---

## 3. Phase 3: Renderer UI

### 3.1 [T3-01] 创建自定义 Hooks

- **依赖**: T2-05
- **优先级**: P0
- **文件**: `src/renderer/src/screens/WebOperator/hooks/use-browser-state.ts`, `use-browser-actions.ts`, `use-audit-log.ts`, `use-pending-actions.ts`
- **实现步骤**:
  - `useBrowserState()`: 管理页面状态，封装 `window.aiosBrowser.getState()` 调用，提供 `{ state, isLoading, refresh }`
  - `useBrowserActions()`: 封装所有浏览器操作方法（open/back/forward/reload/click/type/extractTable/screenshot），自动处理 loading 和 error 状态
  - `useAuditLog()`: 管理审计日志，初始加载 `getAuditLog(100)`，通过 `onAuditUpdate` 订阅实时追加，提供 `filterSource/filterStatus` 过滤
  - `usePendingActions()`: 管理敏感动作确认/拒绝，通过 `onPendingAction` 订阅推送，提供 `confirmAction/rejectAction` 方法
- **验收标准**: 所有 hook 可正常调用 `window.aiosBrowser` API；状态管理逻辑正确；事件订阅/取消订阅无内存泄漏

### 3.2 [T3-02] 创建 BrowserToolbar 组件

- **依赖**: T3-01
- **优先级**: P0
- **文件**: `src/renderer/src/screens/WebOperator/BrowserToolbar.tsx`
- **实现步骤**:
  - 实现 `BrowserToolbarProps { onNavigate: (url: string) => void }`
  - 内部状态：`url`（输入框值）、`isAllowed`（域名白名单状态）、`canGoBack/canGoForward`
  - URL 输入框：回车触发 `onNavigate(url)`，调用 `window.aiosBrowser.open`
  - 后退/前进/刷新按钮：调用 `window.aiosBrowser.back/forward/reload`
  - 白名单状态指示灯：根据 `isAllowed` 显示绿/红色指示
  - 当前域名显示
- **验收标准**: URL 输入回车触发导航；前进/后退/刷新按钮功能正常；白名单状态正确显示

### 3.3 [T3-03] 创建 BrowserViewportHost 组件

- **依赖**: T3-01
- **优先级**: P0
- **文件**: `src/renderer/src/screens/WebOperator/BrowserViewportHost.tsx`
- **实现步骤**:
  - 实现 `BrowserViewportHostProps { className?: string; onBoundsUpdate: (bounds: BrowserViewBounds) => void }`
  - 渲染占位 `<div>` 容器，使用 `ref` 获取 DOM 尺寸
  - 通过 `ResizeObserver` 监听容器尺寸变化
  - 尺寸变化时计算 bounds（含 offsetTop/offsetLeft），调用 `onBoundsUpdate`
  - 通过 `window.aiosBrowser.updateBounds` 通知 Main Process 更新 WebContentsView bounds
  - 显示加载占位提示（当 WebContentsView 尚未加载时）
- **验收标准**: 占位区域尺寸变化触发 bounds 更新；WebContentsView 视口与占位区域对齐；窗口缩放后视口同步调整

### 3.4 [T3-04] 创建 HermesTaskPanel 组件

- **依赖**: T3-01
- **优先级**: P0
- **文件**: `src/renderer/src/screens/WebOperator/HermesTaskPanel.tsx`
- **实现步骤**:
  - 内部状态：`taskInput`、`pendingActions`、`isProcessing`
  - 任务输入区域：textarea + 发送按钮（将任务发送至 Hermes Gateway chat 流）
  - 操作计划展示区域：展示 Hermes 返回的操作计划（Phase 5 完善）
  - 待确认敏感动作列表：每个动作卡片显示操作详情（selector、动作类型、URL、元素描述）
  - 确认/拒绝按钮：调用 `window.aiosBrowser.confirmAction/rejectAction`
  - 通过 `usePendingActions` hook 订阅待确认操作推送
- **验收标准**: 任务输入区域可输入并发送；待确认操作卡片正确展示；确认/拒绝按钮触发 IPC 调用

### 3.5 [T3-05] 创建 BrowserStatePanel 组件

- **依赖**: T3-01
- **优先级**: P1
- **文件**: `src/renderer/src/screens/WebOperator/BrowserStatePanel.tsx`
- **实现步骤**:
  - 内部状态：`title`、`url`、`inputs`、`buttons`、`links`、`isLoading`
  - 刷新按钮：调用 `window.aiosBrowser.getState` 更新状态
  - 展示页面标题和 URL
  - 展示 inputs 列表（selector、type、name、placeholder）
  - 展示 buttons 列表（selector、text、type）
  - 展示 links 列表（text、href、selectorHint）
  - 加载中/加载失败状态展示
- **验收标准**: 页面加载后显示 title/URL/元素列表；刷新按钮可更新状态；加载失败时显示错误提示

### 3.6 [T3-06] 创建 ScreenshotPanel 组件

- **依赖**: T3-01
- **优先级**: P1
- **文件**: `src/renderer/src/screens/WebOperator/ScreenshotPanel.tsx`
- **实现步骤**:
  - 内部状态：`base64`、`isCapturing`、`persistEnabled`
  - 截图按钮：调用 `window.aiosBrowser.screenshot`，将 base64 存入状态
  - 截图预览：使用 `<img src="data:image/png;base64,..." />` 渲染
  - 持久化开关：控制是否将截图保存到磁盘（默认关闭）
  - 截图捕获中/失败状态展示
- **验收标准**: 截图按钮触发 IPC 调用；base64 PNG 预览正确渲染；持久化开关可切换

### 3.7 [T3-07] 创建 BrowserActionLog 组件

- **依赖**: T3-01
- **优先级**: P1
- **文件**: `src/renderer/src/screens/WebOperator/BrowserActionLog.tsx`
- **实现步骤**:
  - 内部状态：`records`（最近 100 条）、`filterSource`（all/user/hermes）、`filterStatus`（all/success/failed/confirmed/rejected）
  - 通过 `useAuditLog` hook 管理审计日志数据和实时追加
  - 过滤控件：source 下拉框 + status 下拉框
  - 审计记录列表：每条记录显示时间、source、action、status、errorCode
  - 实时追加：新审计记录自动追加到列表底部
  - 虚拟滚动（如果记录数量大）或简单列表渲染
- **验收标准**: 审计记录列表正确展示；source/status 过滤功能正常；新操作产生后列表实时追加

### 3.8 [T3-08] 创建 WebOperatorScreen 主容器

- **依赖**: T3-02, T3-03, T3-04, T3-05, T3-06, T3-07
- **优先级**: P0
- **文件**: `src/renderer/src/screens/WebOperator/WebOperatorScreen.tsx`
- **实现步骤**:
  - 三栏布局：左 `w-80`（HermesTaskPanel）、中 `flex-1`（BrowserToolbar + BrowserViewportHost）、右 `w-80`（BrowserStatePanel + ScreenshotPanel + BrowserActionLog）
  - 使用 TailwindCSS 原子类构建布局
  - 管理 bounds 同步：BrowserViewportHost 的 `onBoundsUpdate` 回调连接到 `window.aiosBrowser.updateBounds`
  - 组件挂载时初始化状态，卸载时清理事件订阅
- **验收标准**: 三栏布局正确渲染；各子组件位于对应区域；bounds 同步逻辑正确；事件订阅卸载时清理

### 3.9 [T3-09] 集成到 Layout 视图系统

- **依赖**: T3-08
- **优先级**: P0
- **文件**:
  - `src/renderer/src/screens/Layout/Layout.tsx`（修改）— 新增 `web-operator` 视图选项
- **实现步骤**:
  - 在 Layout.tsx 的视图类型定义中添加 `"web-operator"`
  - 在侧栏导航中添加 Web Operator 入口（图标 + 标签）
  - 视图切换逻辑：选中 `web-operator` 时渲染 `WebOperatorScreen`
  - 不修改现有视图（Chat 等）的任何逻辑
- **验收标准**: 侧栏可进入 Web Operator 视图；WebOperatorScreen 正确渲染；现有 Chat 视图不受影响；视图切换无报错

### 3.10 [T3-10] 创建 i18n 国际化文案

- **依赖**: T3-08
- **优先级**: P2
- **文件**:
  - `src/shared/i18n/locales/en/browser.ts`
  - `src/shared/i18n/locales/zh-CN/browser.ts`
  - `src/shared/i18n/locales/es/browser.ts`
  - `src/shared/i18n/locales/pt-BR/browser.ts`
- **实现步骤**:
  - 定义 Web Operator 所有 UI 文案的翻译 key-value
  - 涵盖：视图标题、工具栏按钮、状态面板标签、确认/拒绝按钮、错误提示等
  - 在各语言文件中同步添加 key
- **验收标准**: 4 种语言文案 key 完整一致；组件中使用 `t()` 引用文案；语言切换时文案正确更新

---

## 4. Phase 4: Tool Bridge Server

### 4.1 [T4-01] 创建 browser-tool-schema.ts — Tool Schema 定义

- **依赖**: T2-01
- **优先级**: P0
- **文件**: `src/shared/browser/browser-tool-schema.ts`
- **实现步骤**:
  - 定义 `BrowserToolSchema` 接口（name, description, input_schema）
  - 定义 `browserToolSchemas` 常量数组，包含 9 个工具的 Schema：
    - `browser.open`（url 必填）
    - `browser.get_state`（无参数）
    - `browser.screenshot`（无参数）
    - `browser.click`（selector 必填）
    - `browser.type`（selector + text 必填）
    - `browser.back`（无参数）
    - `browser.forward`（无参数）
    - `browser.reload`（无参数）
    - `browser.extract_table`（selector 必填）
  - 每个 Schema 包含 name、description、input_schema（JSON Schema 格式）
- **验收标准**: 9 个工具 Schema 定义完整；JSON Schema 格式正确；与 design.md 2.2.4 节一致

### 4.2 [T4-02] 创建 browser-tool-bridge.ts — BrowserToolBridge

- **依赖**: T1-05, T4-01
- **优先级**: P0
- **文件**: `src/main/browser/browser-tool-bridge.ts`
- **实现步骤**:
  - 实现 `BrowserToolBridge` 类，构造函数接收 `controller: BrowserController`, `securityGuard: BrowserSecurityGuard`
  - 实现 `handleToolCall(toolName, params)`: 根据 toolName 路由到对应 Controller 方法，强制 `source: "hermes"`
  - 工具名到方法映射：`browser.open` → `openExternalUrl`、`browser.click` → `clickSelector` 等
  - 对非法 toolName 返回错误 `{ ok: false, errorCode: "UNKNOWN_TOOL", message: "..." }`
  - 实现 `getToolSchemas()`: 返回 `browserToolSchemas` 数组
  - 每个 handleToolCall 调用前经过 securityGuard 校验
  - 每个 handleToolCall 调用后记录审计（source="hermes"）
- **验收标准**: 工具名正确路由到 Controller 方法；source 强制 "hermes"；非法工具名返回错误；安全校验在执行前；审计记录正确

### 4.3 [T4-03] 创建 browser-tool-server.ts — BrowserToolServer

- **依赖**: T4-02
- **优先级**: P0
- **文件**: `src/main/browser/browser-tool-server.ts`
- **实现步骤**:
  - 实现 `BrowserToolServer` 类，构造函数接收 `toolBridge: BrowserToolBridge`
  - 定义 `BASE_PORT = 8765`，`MAX_PORT = 8775`
  - 实现 `start()`: 使用 Node.js 原生 `http.createServer`，端口冲突时自动递增（8765→8775），仅绑定 `127.0.0.1`
  - 请求路由：`GET /tools` → 返回 `toolBridge.getToolSchemas()`；`POST /tools/:toolName` → 解析 JSON body → `toolBridge.handleToolCall(toolName, body)`
  - HTTP 响应统一格式：`{ ok, errorCode?, message?, data? }`
  - 每个请求设置 30 秒超时，超时返回 HTTP 504
  - 实现 `stop()` 和 `getPort()` 和 `isRunning()`
  - 全部端口失败时记录错误日志，标记不可用
- **验收标准**: HTTP 服务在 127.0.0.1:8765 启动；端口冲突自动递增；GET /tools 返回 Schema 列表；POST /tools/browser.get_state 返回页面状态；不绑定 0.0.0.0；30 秒超时生效

### 4.4 [T4-04] 集成 Tool Server 到 Main Process

- **依赖**: T4-03
- **优先级**: P0
- **文件**:
  - `src/main/index.ts`（修改）— 在 app ready 后启动 BrowserToolServer
- **实现步骤**:
  - 在 `src/main/index.ts` 中添加 Tool Server 启动逻辑
  - 实例化 BrowserToolBridge 和 BrowserToolServer
  - app ready 后调用 `toolServer.start()`
  - app quit 前调用 `toolServer.stop()`
  - 将 Tool Server 端口信息通知 Hermes Gateway（通过 Gateway chat 通道传递）
- **验收标准**: 应用启动后 127.0.0.1:8765 可用；curl 可调用 `POST /tools/browser.get_state`；应用退出时 Tool Server 停止

---

## 5. Phase 5: Hermes Skill

### 5.1 [T5-01] 创建 SKILL.md — Web Operator Skill 定义

- **依赖**: T4-04
- **优先级**: P1
- **文件**:
  - `resources/skills/web/web-operator/SKILL.md`
- **实现步骤**:
  - 编写 Skill 名称、描述、版本
  - 声明可用工具列表（9 个工具）及其参数和用法说明
  - 声明操作规则：
    1. 执行 `click/type/extract_table` 前必须先调用 `browser.get_state`
    2. 禁止对 `input[type=password]` 执行 `browser.type`
    3. 敏感动作（submit/delete/approve 等）必须等待用户确认
    4. 优先使用稳定选择器：id > name > aria-label > role
    5. 对 ERP/CRM/OA 页面操作前必须先报告操作计划
  - 声明 Tool Bridge 地址：`http://127.0.0.1:8765`
  - 声明错误码说明
- **验收标准**: SKILL.md 存在且内容完整；9 个工具说明齐全；5 条操作规则清晰；Tool Bridge 地址正确

---

## 6. Phase 6: 敏感动作确认流

### 6.1 [T6-01] 增强 BrowserSecurityGuard 敏感动作识别

- **依赖**: T1-02
- **优先级**: P0
- **文件**: `src/main/browser/browser-security.ts`（修改）
- **实现步骤**:
  - 增强 `isSensitiveAction` 方法：除选择器关键词匹配外，增加对 `elementInfo.text`、`elementInfo.ariaLabel`、`elementInfo.type` 的匹配
  - 增强 `validateAction` 方法：当识别为敏感动作时，返回 `isSensitiveAction: true` 和 `errorCode: UNSAFE_ACTION_REQUIRES_CONFIRMATION`
  - 确保敏感关键词列表完整：submit/approve/reject/delete/remove/payment/transfer/archive/publish/send
- **验收标准**: 正常按钮不识别为敏感动作；含 delete/submit 等语义的元素识别为敏感动作；`data-action` 属性匹配正确

### 6.2 [T6-02] 实现 BrowserController 敏感动作挂起与裁决

- **依赖**: T1-05, T6-01
- **优先级**: P0
- **文件**: `src/main/browser/browser-controller.ts`（修改）
- **实现步骤**:
  - 完善 `clickSelector` 和 `typeIntoSelector`：当 `securityGuard.isSensitiveAction` 返回 true 时，生成 `pendingActionId`（UUID v4），创建 `PendingSensitiveAction` 对象存入 `pendingActions` Map
  - 设置 5 分钟超时计时器：超时后从 Map 移除，记录审计 `status=timeout`
  - 通过 `mainWindow.webContents.send("browser.on_pending_action", pendingAction)` 推送至 Renderer
  - 实现 `confirmAction(pendingActionId)`: 从 Map 取出挂起操作，执行原始 click/type 操作，移除 Map 条目，清除超时计时器，记录审计 `status=confirmed`
  - 实现 `rejectAction(pendingActionId)`: 从 Map 移除条目，清除超时计时器，记录审计 `status=rejected`，不执行操作
  - pendingActionId 不存在时返回错误提示
- **验收标准**: 敏感操作被挂起，返回 UNSAFE_ACTION_REQUIRES_CONFIRMATION；pendingAction 推送至 Renderer；confirmAction 执行操作并记录 confirmed；rejectAction 取消操作并记录 rejected；5 分钟超时自动取消并记录 timeout

### 6.3 [T6-03] 注册确认/拒绝 IPC + 推送事件

- **依赖**: T2-03, T6-02
- **优先级**: P0
- **文件**: `src/main/browser/browser-ipc.ts`（修改）
- **实现步骤**:
  - 确认 `browser.confirm_action` 和 `browser.reject_action` handler 已注册（T2-03 中已占位，此处完善实现）
  - 确认 `browser.on_pending_action` 推送事件通过 `mainWindow.webContents.send` 发送
  - 添加 `browser.on_audit_update` 推送事件：每次审计写入后推送新增记录至 Renderer
- **验收标准**: `browser.confirm_action` IPC 调用成功；`browser.reject_action` IPC 调用成功；待确认操作推送至 Renderer；审计记录实时推送

### 6.4 [T6-04] 完善 HermesTaskPanel 确认/拒绝 UI

- **依赖**: T3-04, T6-03
- **优先级**: P0
- **文件**: `src/renderer/src/screens/WebOperator/HermesTaskPanel.tsx`（修改）
- **实现步骤**:
  - 通过 `usePendingActions` hook 订阅 `browser.on_pending_action` 推送
  - 待确认操作卡片：显示操作详情（目标元素选择器、动作类型、当前页面 URL、元素描述、过期时间）
  - 确认按钮：调用 `window.aiosBrowser.confirmAction(pendingActionId)`，操作成功后从列表移除
  - 拒绝按钮：调用 `window.aiosBrowser.rejectAction(pendingActionId)`，操作拒绝后从列表移除
  - 多个待确认操作按时间顺序排列
  - 操作已过期时显示"已过期"标签
- **验收标准**: 敏感操作推送后卡片出现；确认按钮触发 confirmAction 并移除卡片；拒绝按钮触发 rejectAction 并移除卡片；多操作正确排列；过期操作显示标签

---

## 7. 验证与集成测试

### 7.1 [T7-01] TypeScript 编译与类型检查

- **依赖**: 所有前置任务
- **优先级**: P0
- **实现步骤**:
  - 执行 `npm run typecheck` 确认无类型错误
  - 确认 `src/shared/browser/` 中无 `any` 类型
  - 确认 `src/main/browser/` 中无 `any` 类型
  - 确认 Preload API 类型与 IPC 契约一致
- **验收标准**: `npm run typecheck` 通过；无 any 类型；Window.aiosBrowser 类型正确

### 7.2 [T7-02] 单元测试 — BrowserSecurityGuard

- **依赖**: T6-01
- **优先级**: P1
- **文件**: `tests/unit/browser/browser-security.test.ts`
- **实现步骤**:
  - 测试域名精确匹配
  - 测试通配符域名匹配
  - 测试配置缺失降级（空白名单）
  - 测试密码字段识别
  - 测试敏感动作识别（各种语义关键词）
  - 测试 validateAction 综合校验
- **验收标准**: 所有测试用例通过

### 7.3 [T7-03] 单元测试 — BrowserAuditLogger

- **依赖**: T1-03
- **优先级**: P1
- **文件**: `tests/unit/browser/browser-audit.test.ts`
- **实现步骤**:
  - 测试 JSONL 追加写入
  - 测试日期轮转
  - 测试文本脱敏（browser.type 仅记录 textLength）
  - 测试 query 方法返回正确记录数
- **验收标准**: 所有测试用例通过

### 7.4 [T7-04] 单元测试 — BrowserToolServer

- **依赖**: T4-03
- **优先级**: P1
- **文件**: `tests/unit/browser/browser-tool-server.test.ts`
- **实现步骤**:
  - 测试 HTTP 服务启动和端口绑定
  - 测试端口冲突自动递增
  - 测试 GET /tools 返回 Schema 列表
  - 测试 POST /tools/browser.get_state 路由
  - 测试非法工具名返回 400 错误
  - 测试请求超时返回 504
- **验收标准**: 所有测试用例通过

### 7.5 [T7-05] 集成测试 — IPC 端到端

- **依赖**: T6-04
- **优先级**: P1
- **实现步骤**:
  - 启动 Electron 应用
  - 验证 `window.aiosBrowser.open` 可打开白名单域名
  - 验证 `window.aiosBrowser.getState` 返回页面状态
  - 验证 `window.aiosBrowser.screenshot` 返回截图
  - 验证 `window.aiosBrowser.click/type` 可操作页面元素
  - 验证域名白名单拒绝
  - 验证密码字段阻止
  - 验证敏感动作确认/拒绝流程
  - 验证现有 Chat 视图不受影响
- **验收标准**: 所有集成测试通过；现有功能无回归

### 7.6 [T7-06] Tool Bridge curl 验证

- **依赖**: T4-04
- **优先级**: P1
- **实现步骤**:
  - 启动应用后使用 curl 验证：
    - `GET http://127.0.0.1:8765/tools` 返回工具列表
    - `POST http://127.0.0.1:8765/tools/browser.open` 可打开页面
    - `POST http://127.0.0.1:8765/tools/browser.get_state` 返回页面状态
    - `POST http://127.0.0.1:8765/tools/browser.screenshot` 返回截图
    - `POST http://127.0.0.1:8765/tools/browser.click` 执行点击
    - 验证 Tool Server 不绑定 0.0.0.0
- **验收标准**: 所有 curl 测试返回预期结果

### 7.7 [T7-07] 构建验证

- **依赖**: 所有前置任务
- **优先级**: P0
- **实现步骤**:
  - 执行 `npm run typecheck`
  - 执行 `npm run lint`
  - 执行 `npm run build`
  - 确认应用可启动且无崩溃
  - 确认现有 Chat 功能正常
  - 确认 profile 切换正常
- **验收标准**: 构建成功；应用启动正常；现有功能无回归

---

## 任务依赖关系总览

```
Phase 1 (Browser Main):
  T1-01 → T1-02 → T1-04
  T1-01 → T1-03
  T1-01 + T1-02 + T1-03 + T1-04 → T1-05

Phase 2 (IPC + Preload):
  T2-01 → T2-02
  T2-01 + T1-05 → T2-03
  T2-01 → T2-04
  T2-03 + T2-04 → T2-05

Phase 3 (Renderer UI):
  T2-05 → T3-01 → T3-02 / T3-03 / T3-04 / T3-05 / T3-06 / T3-07
  T3-02 + T3-03 + T3-04 + T3-05 + T3-06 + T3-07 → T3-08
  T3-08 → T3-09 / T3-10

Phase 4 (Tool Bridge):
  T2-01 → T4-01
  T1-05 + T4-01 → T4-02
  T4-02 → T4-03
  T4-03 → T4-04

Phase 5 (Hermes Skill):
  T4-04 → T5-01

Phase 6 (敏感动作确认):
  T1-02 → T6-01
  T1-05 + T6-01 → T6-02
  T2-03 + T6-02 → T6-03
  T3-04 + T6-03 → T6-04

Validation:
  All → T7-01 / T7-02 / T7-03 / T7-04 / T7-05 / T7-06 / T7-07
```

## 涉及文件汇总

| 类别 | 文件路径 | 任务 ID |
|------|---------|---------|
| Main Process | `src/main/browser/browser-types.ts` | T1-01 |
| Main Process | `src/main/browser/browser-security.ts` | T1-02, T6-01 |
| Main Process | `src/main/browser/browser-audit.ts` | T1-03 |
| Main Process | `src/main/browser/browser-view-manager.ts` | T1-04 |
| Main Process | `src/main/browser/browser-controller.ts` | T1-05, T6-02 |
| Main Process | `src/main/browser/browser-ipc.ts` | T2-03, T6-03 |
| Main Process | `src/main/browser/browser-tool-bridge.ts` | T4-02 |
| Main Process | `src/main/browser/browser-tool-server.ts` | T4-03 |
| Main Process | `src/main/index.ts` | T2-05, T4-04 |
| Shared | `src/shared/browser/browser-contract.ts` | T2-01 |
| Shared | `src/shared/browser/browser-errors.ts` | T2-02 |
| Shared | `src/shared/browser/browser-tool-schema.ts` | T4-01 |
| Shared | `src/shared/i18n/locales/{en,zh-CN,es,pt-BR}/browser.ts` | T3-10 |
| Preload | `src/preload/browser-api.ts` | T2-04 |
| Preload | `src/preload/index.ts` | T2-05 |
| Preload | `src/preload/index.d.ts` | T2-05 |
| Renderer | `src/renderer/src/screens/WebOperator/hooks/*.ts` | T3-01 |
| Renderer | `src/renderer/src/screens/WebOperator/BrowserToolbar.tsx` | T3-02 |
| Renderer | `src/renderer/src/screens/WebOperator/BrowserViewportHost.tsx` | T3-03 |
| Renderer | `src/renderer/src/screens/WebOperator/HermesTaskPanel.tsx` | T3-04, T6-04 |
| Renderer | `src/renderer/src/screens/WebOperator/BrowserStatePanel.tsx` | T3-05 |
| Renderer | `src/renderer/src/screens/WebOperator/ScreenshotPanel.tsx` | T3-06 |
| Renderer | `src/renderer/src/screens/WebOperator/BrowserActionLog.tsx` | T3-07 |
| Renderer | `src/renderer/src/screens/WebOperator/WebOperatorScreen.tsx` | T3-08 |
| Renderer | `src/renderer/src/screens/Layout/Layout.tsx` | T3-09 |
| Skill | `resources/skills/web/web-operator/SKILL.md` | T5-01 |
| Tests | `tests/unit/browser/browser-security.test.ts` | T7-02 |
| Tests | `tests/unit/browser/browser-audit.test.ts` | T7-03 |
| Tests | `tests/unit/browser/browser-tool-server.test.ts` | T7-04 |
