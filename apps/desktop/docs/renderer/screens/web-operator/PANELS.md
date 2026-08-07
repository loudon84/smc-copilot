# WebOperator Panels

> `src/renderer/src/screens/WebOperator/panels/WebOperatorPanels.tsx` 编排的 5 个子面板

## 面板注册表

| PanelId | 组件 | size | i18n labelKey | 图标 |
|---|---|---|---|---|
| `browser-state` | `BrowserStatePanel` | md | `navigation.browserState` | `Monitor` |
| `crm-context` | `CrmEventPanel` | md | `navigation.crmContext` | `Building2` |
| `hermes-task` | `HermesTaskPanel` | md | `navigation.hermesTask` | `Bot` |
| `page-structure` | `PageStructurePanel` | lg | `navigation.pageStructure` | `ScanSearch` |
| `action-log` | `BrowserActionLog` | lg | `navigation.actionLog` | `ScrollText` |

面板顺序由 `WEB_OPERATOR_PANEL_ORDER`（`web-operator-panels-contract.ts`）定义。`normalizeWebOperatorPanelId` 将旧 `"screenshot"` 归一化为 `"browser-state"`。

## 渲染规则

- `hermes-task` **始终挂载**（保持 Chat 会话活跃），非活跃时 `hidden=true`（CSS 隐藏，不卸载）
- 其余面板仅当 `id === activePanel` 时挂载
- 切换面板时 `scrollIntoView({ behavior: "smooth", block: "nearest" })`

## 1. BrowserStatePanel

**文件**：`BrowserStatePanel.tsx`
**数据来源**：
- `useBrowserRuntimeState()` → `window.aiosBrowser.getState()` — 运行时状态（loading/idle、frameCount、canGoBack/Forward、title、url）
- `useBrowserState()` → `window.aiosBrowser.snapshot()` — 页面 inputs/buttons 列表

**展示内容**：
- 运行时状态标签（idle/loading）、frame 数量、导航可用性
- 页面标题与 URL
- 交互 inputs（最多 15 条）：selectorHint / name / id + type
- 交互 buttons（最多 15 条）：text / selectorHint

## 2. CrmEventPanel

**文件**：`CrmEventPanel.tsx`
**数据来源**：
- `useCrmBridgeEvents()` → `window.aiosBrowser.onCrmEvent` 订阅 — CRM Desktop Bridge 事件

**展示内容**：
- 最近一次 CRM 事件：type、origin、entityType/entityId/entityName、page URL
- 原始 JSON（可 Copy）
- "Refresh snapshot" 按钮（调用 `onRefreshSnapshot`，触发 PageStructurePanel 刷新）
- "Send command" 按钮 → `window.aiosBrowser.sendCrmCommand(CrmDesktopCommand)` — 下发 toast 命令到 CRM 页面

**Renderer 侧边界**：CrmEventPanel 仅展示事件和下发命令，不处理 Main 侧校验逻辑（origin / event type / payload size / requestId 去重由 Main `crm-bridge` 模块执行）。

## 3. HermesTaskPanel

**文件**：`HermesTaskPanel.tsx`
**数据来源**：
- `useWebOperatorPageContext()` — analysisRequest、taskStartDialog
- `window.webOperatorTaskSession.resolve()` — 查找已有任务会话
- `WebOperatorHermesChatPanel` → `useWebOperatorHermesPanelChat` — Chat 流

**职责**：
1. 监听 `analysisRequest` → resolve 已有 session 或弹 Dialog
2. Dialog confirm → 设置 `currentTask`（action: "running"）
3. 委托 `WebOperatorHermesChatPanel` 渲染 Chat UI
4. Chat 完成 → `webOperatorTaskSession.upsert()` 持久化绑定

**任务状态机**：
```
analysisRequest 变化
  → resolve(pageUrl)
  → 有 record → { action: "loading", sessionId } → 加载历史
  → 无 record → 弹 Dialog → confirm → { action: "running" } → 首次发送
                              → cancel → { action: "pending" }
```

## 4. PageStructurePanel

**文件**：`PageStructurePanel.tsx`
**数据来源**：
- `usePageSnapshot()` → `window.aiosBrowser.snapshot()` — Frame Tree + 交互元素
- `PageFrameHtmlInspector` → `window.aiosBrowser.getFrameHtml()` — Frame HTML

**子组件结构**：
```
PageStructurePanel
  ├─ FrameTreePanel          — Frame Tree 层级 + 选中
  ├─ PageSelectorActionBar   — CSS selector Find/Click/Type
  ├─ PageFrameHtmlInspector  — Get HTML / 分析内容
  └─ ElementListPanel        — 交互元素列表
```

`onAnalyzeContent` 回调触发 SideRail 切换到 `hermes-task` 面板。

## 5. BrowserActionLog

**文件**：`BrowserActionLog.tsx`
**数据来源**：
- `useBrowserActionLogs()` → V5.7 结构化动作日志（`browser:on-action-log` 事件）
- `useAuditLog()` → 审计日志（`browser:on-audit-log` 事件）

**双 Tab 切换**：
- **Structured**：V5.7 结构化动作日志（action、result.ok/durationMs/frameId/selector/error），可清空
- **Audit**：审计日志（action、status、time、errorCode/message），支持 source（user/hermes/system）与 status（success/failed/blocked）过滤

## 面板容器

`WebOperatorPanelCard`（`panels/WebOperatorPanelCard.tsx`）是每个面板的壳，提供：
- 面板标题（i18n labelKey）
- focused/hidden 状态样式
- ref 转发（用于 scrollIntoView）
