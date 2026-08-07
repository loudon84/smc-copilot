# Hermes Task Flow

> Page Structure [分析内容] → Hermes Task 侧栏 → HermesTaskStartDialog → 遮罩策略 → WebContentsHost enabled=false 完整流程

## 流程总览

```
┌─────────────────────────────────────────────────────────────┐
│ PageStructurePanel                                          │
│   PageFrameHtmlInspector                                    │
│     [分析内容] 按钮                                         │
│       │                                                     │
│       ├─ 1. getFrameHtml() → BrowserFrameHtmlResult         │
│       ├─ 2. derivePageUrl() → stable pageUrl                │
│       ├─ 3. buildPageContextFromFrameHtml() → pageContext   │
│       ├─ 4. onAnalyzeContent() → 切换到 hermes-task 面板    │
│       └─ 5. requestHermesAnalysis({ pageUrl, pageContext }) │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ WebOperatorPageContext                                      │
│   currentTask（v6.3.1 Context + sessionStorage 快照）        │
│   analysisRequest = { source, requestId, pageUrl, ... }     │
│   mount hydrate: getLastActive → 否则 sessionStorage        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ HermesTaskPanel                                            │
│   useEffect([analysisRequest?.requestId])                   │
│     │                                                       │
│     ├─ webOperatorTaskSession.resolve({ source, requestId })│
│     │                                                       │
│     ├─ 有已绑定 session ──→ action: "loading"               │
│     │   └─ loadSessionHistory(sessionId)                    │
│     │                                                       │
│     └─ 无已绑定 session ──→ openStartDialog()               │
│         └─ setTaskStartDialog(state)                        │
│         └─ setTaskStartDialogHandlers(handlers)             │
└─────────────────────────────────────────────────────────────┘
                          │
                ┌─────────┴─────────┐
                │                   │
                ▼                   ▼
┌───────────────────┐  ┌──────────────────────────────────────┐
│ Dialog Confirm     │  │ Dialog Cancel                       │
│  action: "running" │  │  action: "pending"                  │
│  closeStartDialog  │  │  closeStartDialog                   │
└───────────────────┘  └──────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ WebOperatorHermesChatPanel                                  │
│   useWebOperatorHermesPanelChat({ task, pageContext, ... }) │
│     │                                                       │
│     ├─ autoRun effect → buildTaskFirstMessage()             │
│     ├─ sendInternal()                                       │
│     │   ├─ injectWebContextAttachments() → attachmentIds    │
│     │   ├─ buildWebContextPrefix() → context prefix         │
│     │   └─ hermesPanelApi.sendMessage() → SSE              │
│     │                                                       │
│     └─ onDone → onTaskSessionReady()                        │
│         └─ webOperatorTaskSession.upsert() 持久化           │
└─────────────────────────────────────────────────────────────┘
```

## 阶段详解

### 阶段 1：PageFrameHtmlInspector → requestHermesAnalysis

**触发**：用户在 PageStructurePanel 点击 [分析内容] 按钮

1. 若无已有 HTML result → 先调用 `fetchFrameHtml()`（`aiosBrowser.getFrameHtml()`）
2. `extractBodyInnerHtml(result.html)` 提取 body innerHTML
3. `derivePageUrl({ frame, frames, result })` 生成稳定 pageUrl
4. `buildPageContextFromFrameHtml({ frame, result, htmlExcerpt, pageUrl })` 构建 `HermesPanelPageContext`
5. `onAnalyzeContent?.()` → 通知父组件切换到 `hermes-task` 面板
6. `requestHermesAnalysis({ pageUrl, pageContext })` → 写入 context，生成 `analysisRequest`

### 阶段 2：HermesTaskPanel → resolve / dialog

**触发**：`analysisRequest?.requestId` 变化

1. 调用 `window.webOperatorTaskSession.resolve({ source, requestId, pageUrl })` 查找已有任务（v6.3.3 按 `source + requestId`）
2. **有 record**（已绑定 sessionId）：
   - 设置 `currentTask = { action: "loading", sessionId }`
   - `WebOperatorHermesChatPanel` 检测 `task.action === "loading"` → `loadSessionHistory(sessionId)`
3. **无 record**：
   - 调用 `openStartDialog()` → 设置 `taskStartDialog` + `taskStartDialogHandlers`
   - `WebOperatorTaskStartDialogHost` 检测 `taskStartDialog.requestId === analysisRequest.requestId` → 渲染 Dialog

### 阶段 3：HermesTaskStartDialog 遮罩策略

**Dialog 渲染**：`createPortal(jsx, document.body)`

**遮罩效果**：

| 层 | 效果 | 实现 |
|---|---|---|
| WebContentsView | 隐藏（不可交互） | `WebContentsHost enabled={enabled && !isTaskStartDialogOpen}` → `shellView.hide()` |
| DOM 背景 | 不可滚动 | `document.body.style.overflow = "hidden"` |
| 键盘 | Escape 被拦截 | `addEventListener("keydown", blockEscape, true)` |
| Dialog | 模态居中 | `role="dialog" aria-modal="true"` |

**Dialog 内容**（V6.3）：
- 页面 / URL / formType / action / callbackUrl 元信息
- 用户提示词（可编辑 textarea）
- **技能**：`HermesPanelSkill`（`requiredSkillName` 来自 HostBridge 时强制校验已安装 skill）
- **会话**：`HermesPanelSession`（最近 7 天 sessions 或「新建会话」）
- 取消 / 确认执行 按钮（skill 校验未通过时禁用提交）

**HostBridge 入口**（V6.3+）：
- `host.bridge.submit` 到达后 **自动** `requestHermesAnalysis`（按 JSSDK `requestId` 去重）；**不**切换侧栏（已移除 `onAnalyzeContent`）。
- `preferStartDialog: true` → **始终**弹出 `HermesTaskStartDialog`（不因已有 `task_session` 直接续聊）。
- **仅**在 Dialog「确认执行」后：`HermesTaskPanel.onActivatePanel` → `focusedPanel = hermes-task`，并 `setCurrentTask` 启动 Chat。
- 取消 Dialog：`dismissHermesAnalysis(hostBridgeRequestId)` 清除 `analysisRequest` 并记录该 JSSDK `requestId` 已关闭（同事件不再自动弹框）；关闭弹层并切到 `host-context`。手动「AI 分析」传 `force: true` 可再次弹框。
- Dialog 内 `HermesPanelSkill` 统一校验 `requiredSkillName`；选 **新建会话** 并确认 → `action: "running"`、`sessionId: null` → autoRun 发起新 Gateway 会话。

### 阶段 4：Dialog Confirm → Chat 发送

1. `handleDialogConfirm` → `setCurrentTask({ action: "running" | "loading", sessionId, hostBridge?, ... })` + `closeStartDialog()`
2. `closeStartDialog` → `setTaskStartDialog(null)` + `setTaskStartDialogHandlers(null)`
3. `WebContentsHost` 恢复 `enabled=true`（原生层重新显示）
4. `useWebOperatorHermesPanelChat` 检测 `task.action === "running"` → autoRun effect：

#### autoRun 流程

1. `buildTaskFirstMessage({ pageUrl, pageContext, userPrompt, skill, sessionId, hostBridge? })` 构建首次消息：
   ```
   [HostBridge]（可选）
   requestId / formType / action / callbackUrl / skillName

   [技能]
   {skill}

   [会话]
   {sessionId || "new"}
   ...
   ```
2. `sendInternal(message, { forceFirstMessage: true, displayText })` 发送

#### sendInternal 流程

1. 首次消息且 `injectedRef.current === false` → `injectWebContextAttachments()`：
   - 上传 `web-context/body.html`（或 `body.txt`）+ `web-context/meta.json` 作为附件
   - 通过 `hermesPanelApi.uploadAttachmentBuffers()` 发送到 Gateway
2. 构建 payload message：`systemLead + ctxPrefix + [用户] + text`（非 task 模式）或 `systemLead + text`（task 模式）
3. `hermesPanelApi.sendMessage({ message, resumeSessionId, attachment_ids })` → SSE 流

### 阶段 5：SSE 流 → 结果持久化

1. `onChunk` → 追加 `streamingContent`
2. `onToolProgress` → 追加 `toolCalls`
3. `onDone` → 将 streaming 追加为 assistant message → `runState = "idle"` → 调用 `onTaskSessionReady`（task 模式）或 `setPanelSessionBinding`（draft 模式）
4. `onError` → 设置 error + `runState = "error"`

**持久化**：`webOperatorTaskSession.upsert({ source, requestId, pageUrl, sessionId, pageContext, skill })` 写入 SQLite（Main 侧 `task_session` 表；`taskId` 由 Main 内部派生）。

## v6.3.4 — Hermes Chat 写回 HostBridge 表单

```
Hermes assistant 回复（含 ```host_form_fill JSON```）
  → WebOperatorHermesPanelMessageList 解析 artifact
  → 显示「写回当前表单」按钮（用户确认）
  → HostBridgeCommandContext.runCommand()
  → desktop.host.form.fill → Web 页面 ack
```

| 机制 | 说明 |
|------|------|
| artifact 格式 | assistant 消息末尾 ` ```host_form_fill\n{ type, formType, action, fields, subTables }\n``` ` |
| 解析 | `extractHostFormFillArtifact`；多代码块取最后一个；非法 JSON 不影响聊天展示 |
| 字段标准化 | `normalizeProductFillFields`（价格/电池/日期/状态） |
| 写回入口 | `HostFormFillActionButton` 挂在每条 assistant 消息下 |
| command 复用 | `HostBridgeCommandProvider` 包裹 WebOperator；`HostBridgePanel` 与 Hermes Panel 共用 `runCommand` |
| 不依赖 callbackURL | 写回走 Renderer → `aiosBrowser.sendHostCommand`，非 HTTP callback |

PRD：[`prd/v6.3.4_weboperator-hermes-host-form-fill.md`](../../../../prd/v6.3.4_weboperator-hermes-host-form-fill.md)

## v6.3.3 — 任务会话绑定键（source + requestId）

| 机制 | 说明 |
|------|------|
| 业务唯一键 | `source + requestId`（非 `pageUrl`）；同页面不同 JSSDK 请求可创建多条 `task_session` |
| `taskId` | Main `buildTaskId(source, requestId)`；Renderer **不**向 upsert 传入 `taskId` |
| `source` 约定 | `manual`（Page Structure）、`web-host-bridge`（HostBridge）、`legacy-page-url`（v1 迁移） |
| `resolve` | `HermesTaskPanel` 收到 `analysisRequest` 后 `resolve({ source, requestId, pageUrl })` |
| HostBridge | `requestHermesAnalysis({ source: "web-host-bridge", requestId: event.requestId, ... })` |

PRD：[`prd/v6.3.3_task-to-session-request.md`](../../../../prd/v6.3.3_task-to-session-request.md)

## v6.3.1 — 任务 Chat 恢复（Context + hydrate）

| 机制 | 说明 |
|------|------|
| `currentTask` | 存放在 `WebOperatorPageContext`（非 `HermesTaskPanel` 本地 state），侧栏折叠卸载 Panel 后仍保留 |
| `sessionStorage` | 键 `weboperator-current-task-v2`（含 `source/requestId`）；`setCurrentTask` 时写入；有 `sessionId` 时快照为 `action: "loading"` |
| 冷启动 hydrate | `WebOperatorPageContextProvider` mount：`getLastActive()` → 有 record 则 `recordToTaskInput`；否则读 sessionStorage |
| 弹 Dialog | **不** `setCurrentTask(null)`；确认后覆盖 `currentTask` |
| `requestHermesAnalysis` 守卫 | 同 `source + requestId` 且非 `force` 时仅更新 pageContext，不新建 `analysisRequest` |
| HostBridge 自动分析 | 同活跃 `source + requestId` 时跳过 `triggerHermesAnalysis`（与 Context 守卫双保险） |
| Chat remount | `hermes-task` 隐藏保活或折叠后 remount：`task.action=loading` + `sessionId` → `loadSessionHistory` |

PRD：[`prd/v6.3.1_hermes-task-persist-hotfix.md`](../../../../prd/v6.3.1_hermes-task-persist-hotfix.md)

## Dialog Cancel 路径

Cancel 时 `handleDialogCancel` 仅 `dismissHermesAnalysis` + 关闭 Dialog + 切到 `host-context`；**不**清空 `currentTask`，Hermes Task 侧栏 Chat 保持。
