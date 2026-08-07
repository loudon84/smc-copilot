# WebOperator Agent Spec（Renderer Screen: Web Operator）

## 1. 文档目标

本规格用于描述 `src/renderer/src/screens/WebOperator` 目录的代码结构、组件职责、数据流与外部契约（Preload API），使 AI Agent 能在不破坏安全边界与 IPC 契约的前提下完成：

- Web Operator UI 的迭代（布局、交互、展示面板）
- 浏览器动作（open/back/forward/reload/click/type/extractTable）相关 UI 的扩展
- 审计日志（Audit Log）与敏感操作确认（Pending Actions）面板增强
- 与外部 BrowserView/WebContentsView 的 bounds 同步机制维护

---

## 2. 范围与非范围

### 2.1 In Scope

- `WebOperatorScreen.tsx` 主屏幕布局
- 组件：`BrowserToolbar` / `BrowserViewportHost` / `BrowserStatePanel` / `ScreenshotPanel` / `BrowserActionLog` / `HermesTaskPanel`
- hooks：`use-browser-actions` / `use-browser-state` / `use-audit-log` / `use-pending-actions`
- Renderer 侧消费的 `window.aiosBrowser` API 与共享 contract 类型

### 2.2 Out of Scope

- 主进程 BrowserView/WebContentsView 具体实现与安全策略细节
- IPC handler 的新增或修改（除非明确需求）
- Hermes Agent 如何生成浏览器动作（此处仅展示 pending actions 与审计结果）

---

## 3. 代码地图（Code Map）

目录：`src/renderer/src/screens/WebOperator/`

- `WebOperatorScreen.tsx`：三栏布局装配
- `BrowserToolbar.tsx`：地址栏与导航按钮
- `BrowserViewportHost.tsx`：浏览器视口宿主与 bounds 同步
- `BrowserStatePanel.tsx`：页面状态信息（Title/URL/Inputs/Buttons/Links）
- `ScreenshotPanel.tsx`：截图操作与预览
- `BrowserActionLog.tsx`：动作审计日志筛选与列表
- `HermesTaskPanel.tsx`：任务输入与敏感动作确认/拒绝

hooks：`src/renderer/src/screens/WebOperator/hooks/`

- `use-browser-actions.ts`：封装 user source 的浏览器动作调用
- `use-browser-state.ts`：封装 getState + 状态与错误管理
- `use-audit-log.ts`：拉取初始审计日志 + 订阅增量更新 + 过滤
- `use-pending-actions.ts`：订阅待确认动作 + confirm/reject

相关 contract 与 preload：

- `src/shared/browser/browser-contract.ts`：Browser contract types
- `src/preload/browser-api.ts`：`window.aiosBrowser` 的 Preload 实现
- `src/preload/index.d.ts`：Renderer 全局对象类型声明（含 `aiosBrowser`）

---

## 4. UI 架构与布局

### 4.1 WebOperatorScreen：三栏布局

`WebOperatorScreen` 采用典型“三栏”布局：

- 左栏（固定宽 `w-80`）：`HermesTaskPanel`
- 中栏（自适应）：`BrowserToolbar` + `BrowserViewportHost`
- 右栏（固定宽 `w-80`）：`BrowserStatePanel` + `ScreenshotPanel` + `BrowserActionLog`

布局特性：

- 根容器：`flex h-full bg-neutral-900 text-neutral-200`
- 左右栏均带边框：`border-neutral-700`
- 各栏使用 `flex flex-col overflow-hidden` 控制内部滚动

### 4.2 BrowserViewportHost：视口宿主与 bounds 更新

- 通过 `containerRef.getBoundingClientRect()` 计算 bounds
- 使用 `ResizeObserver` 监听容器尺寸变化，触发更新
- 更新通道：
  - 组件内部会直接调用 `window.aiosBrowser.updateBounds(bounds)`
  - 同时回调 `onBoundsUpdate?.(bounds)`，`WebOperatorScreen` 也会调用 `updateBounds`

说明：当前实现存在“重复调用”的可能（Host 内调用 + 外部回调再调用）。如需优化，应选择单一职责：要么 Host 负责调用，要么只上报给父级。

---

## 5. 组件规格（Component Spec）

## 5.1 BrowserToolbar

### 职责

- 提供 back/forward/reload/open
- 提供 URL 输入框（Enter 触发导航）
- 基于 `useBrowserActions()` 调用 `window.aiosBrowser.*`

### Props

- `onNavigate?: (url: string) => void`
- `currentUrl?: string`（默认 ""）
- `isDomainAllowed?: boolean`（可选显示绿色/红色盾牌图标）

### 行为规则

- 点击 Open：`actions.open(url.trim())`，成功后触发 `onNavigate`
- 导航按钮：直接调用 actions.back/forward/reload
- `actions.isLoading` 时禁用 Open

---

## 5.2 BrowserStatePanel

### 职责

- 展示页面状态：Title/URL/Inputs/Buttons/Links
- 提供刷新按钮触发 `getState`

### 数据来源

- `useBrowserState()`：
  - `state: BrowserPageState | null`
  - `isLoading`
  - `error`
  - `refresh()`

### 展示策略

- `state.inputs/buttons/links` 仅在长度大于 0 时渲染分区
- links 默认只展示前 20 条
- 无 state 且无 error 且非 loading：展示 “No page loaded”

---

## 5.3 ScreenshotPanel

### 职责

- 调用 `window.aiosBrowser.screenshot()` 获取 base64
- 展示错误信息或截图预览

### 状态

- `base64`：用于 `<img src="data:image/png;base64,..." />`
- `isCapturing`：控制按钮动画/禁用
- `persistEnabled`：仅 UI 存在，当前未对接持久化逻辑

---

## 5.4 BrowserActionLog

### 职责

- 展示审计日志列表（最近记录）
- 支持按 source/status 过滤

### 数据来源

- `useAuditLog()`：
  - 初始拉取：`window.aiosBrowser.getAuditLog(100)`
  - 增量订阅：`window.aiosBrowser.onAuditUpdate(...)`
  - 本地保留最近 200 条

### UI 规则

- 过滤器：source（all/user/hermes/system）、status（all/success/failed/blocked/confirmed/rejected/timeout）
- 记录展示：time、status（颜色映射）、action、source
- 若存在 `errorCode`：附加显示 `errorCode: message`

---

## 5.5 HermesTaskPanel

### 职责

- 任务输入框（当前仅清空输入，尚未对接发送逻辑）
- 展示并处理“敏感动作待确认”队列

### 数据来源

- `usePendingActions()`：订阅 `window.aiosBrowser.onPendingAction`

### 行为规则

- pendingActions 为空：显示 “No pending actions”
- 每条 action：
  - 显示 `action.action`、`selector`、`url`
  - 若已过期（`expiresAt < now`）：标记 Expired 并隐藏 Confirm/Reject
  - Confirm → `confirmAction(pendingActionId)` 成功后从队列移除
  - Reject → `rejectAction(pendingActionId)` 成功后从队列移除

---

## 6. hooks 规格（Hooks Spec）

## 6.1 useBrowserActions

目的：统一封装用户发起（`source: "user"`）的浏览器动作调用。

提供：

- `isLoading`
- `open(url)` → `window.aiosBrowser.open({ url, source: "user" })`
- `back/forward/reload`
- `getState/screenshot`
- `click(selector)` → `window.aiosBrowser.click({ selector, source: "user" })`
- `type(selector, text)` → `window.aiosBrowser.type({ selector, text, source: "user" })`
- `extractTable(selector)` → `window.aiosBrowser.extractTable({ selector, source: "user" })`

说明：除 open 以外，其它调用是直接透传，不维护 UI 级错误展示。

## 6.2 useBrowserState

- `refresh()` 调用 `window.aiosBrowser.getState()`
- `result.ok && result.state` 才写入 state
- 错误优先使用 `result.message`，否则 fallback

## 6.3 useAuditLog

- `getAuditLog(100)` 拉取初始数据
- `onAuditUpdate` 订阅追加数据，并截断到最近 200 条
- `filterSource/filterStatus` 在 hook 内过滤后返回

## 6.4 usePendingActions

- `onPendingAction` 订阅追加 pending action
- `confirmAction/rejectAction` 成功则从列表移除

---

## 7. 外部契约（Preload API Contract）

Renderer 仅通过 `window.aiosBrowser` 与外部浏览器能力交互，契约由：

- `src/preload/browser-api.ts`（实现）
- `src/preload/index.d.ts`（类型声明）
- `src/shared/browser/browser-contract.ts`（共享类型）

### 7.1 AiosBrowserAPI 方法（Renderer 可用）

- 动作
  - `open(request: BrowserOpenRequest): Promise<BrowserOpenResult>`
  - `back()/forward()/reload(): Promise<BrowserActionResult>`
  - `click(request: BrowserClickRequest): Promise<BrowserActionResult>`
  - `type(request: BrowserTypeRequest): Promise<BrowserActionResult>`
  - `extractTable(request: BrowserExtractTableRequest): Promise<BrowserActionResult>`
- 观察
  - `getState(): Promise<BrowserStateResult>`
  - `screenshot(): Promise<BrowserScreenshotResult>`
  - `getAuditLog(limit?: number): Promise<BrowserAuditRecord[]>`
  - `onAuditUpdate(cb): () => void`
  - `onPendingAction(cb): () => void`
- UI/嵌入
  - `updateBounds(bounds: BrowserViewBounds): Promise<void>`

### 7.2 错误码（BrowserErrorCode）

常见：

- `DOMAIN_NOT_ALLOWED`
- `UNSAFE_ACTION_REQUIRES_CONFIRMATION`
- `PASSWORD_FIELD_BLOCKED`
- `EXTERNAL_WEB_VIEW_NOT_READY`

UI 扩展时建议将 `errorCode` 显式映射为可读提示，并避免泄漏敏感页面数据。

---

## 8. 数据流（Data Flow Spec）

- WebOperatorScreen
  - `BrowserViewportHost` 计算 bounds → `window.aiosBrowser.updateBounds`
- BrowserToolbar
  - 用户输入 URL → `useBrowserActions.open` → `window.aiosBrowser.open`
- BrowserStatePanel
  - refresh → `window.aiosBrowser.getState` → 渲染 Title/URL/Elements
- ScreenshotPanel
  - capture → `window.aiosBrowser.screenshot` → base64 预览
- BrowserActionLog
  - mount → `getAuditLog` 拉取初始记录
  - subscribe → `onAuditUpdate` 追加记录
- HermesTaskPanel
  - subscribe → `onPendingAction` 追加 pending actions
  - confirm/reject → 对应 API → 成功移除

---

## 9. 扩展规范（Agent Execution Rules）

### 9.1 新增浏览器动作按钮

- 优先扩展 `useBrowserActions` 暴露方法（若 contract 已支持）
- 在 `BrowserToolbar` 或新增面板中消费该方法
- 不允许在 Renderer 直接使用 `ipcRenderer`（必须通过 `window.aiosBrowser`）

### 9.2 新增契约/IPC

如必须新增动作：

1. Main 注册 handler
2. Preload `browser-api.ts` 添加方法
3. `preload/index.d.ts` 更新声明（若类型暴露变化）
4. `shared/browser/browser-contract.ts` 补充类型/错误码

### 9.3 安全与隐私

- 避免在 UI 中长期展示页面全文 `state.text`（当前 contract 包含该字段，但 UI 未展示）
- 对敏感动作采用 Pending Action → 用户确认/拒绝流程
- 对 `PASSWORD_FIELD_BLOCKED` 等错误码，不应提供绕过入口

---

## 10. 验收清单（Acceptance Checklist）

- [ ] 进入 Web Operator 页面后，布局三栏稳定，滚动区域正常
- [ ] 调整窗口大小时，bounds 更新能触发（主进程能正确重设 BrowserView）
- [ ] 地址栏 open/back/forward/reload 可用
- [ ] Page State refresh 能拉到 title/url/inputs/buttons/links
- [ ] Screenshot 可生成预览并在失败时提示 message
- [ ] Action Log 能显示并可按 source/status 过滤
- [ ] Pending Actions 能实时出现，并支持 confirm/reject 后从列表移除
