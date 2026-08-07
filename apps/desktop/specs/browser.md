# Browser Agent Spec（Main Process: Web Operator Browser）

## 1. 文档目标

本规格用于描述 `src/main/browser` 目录的代码结构、模块职责、安全策略与扩展边界，供 AI Agent 在以下场景中执行一致实现：

- 扩展浏览器自动化动作（click/type/extractTable 等）
- 修改安全策略（域名白名单、敏感动作关键词）
- 扩展审计日志字段或存储策略
- 接入 Hermes Agent 的 Tool 调用（通过 Tool Server）
- 新增 IPC channel 或修改现有 IPC 处理逻辑

---

## 2. 范围与非范围

### 2.1 In Scope

- `browser-view-manager.ts`：WebContentsView 生命周期管理
- `browser-security.ts`：域名白名单与敏感动作安全检查
- `browser-audit.ts`：动作审计日志（JSONL 文件 + 实时推送）
- `browser-controller.ts`：核心动作执行器（含 JS 注入脚本）
- `browser-ipc.ts`：IPC handler 注册与注销
- `browser-tool-bridge.ts`：Hermes Tool 调用适配层
- `browser-tool-server.ts`：本地 HTTP Tool Server（127.0.0.1:8765-8775）
- `browser-types.ts`：内部常量与类型定义

### 2.2 Out of Scope

- Renderer 侧 UI 组件（见 `specs/weboperator.md`）
- Preload API 封装（见 `src/preload/browser-api.ts`）
- 共享 contract 类型（见 `src/shared/browser/browser-contract.ts`）

---

## 3. 代码地图（Code Map）

```
src/main/browser/
├── browser-types.ts          # 内部常量：SENSITIVE_ACTION_KEYWORDS / JS_SCRIPT_NAMES / BROWSER_PARTITION / PENDING_ACTION_TIMEOUT_MS
├── browser-view-manager.ts   # WebContentsView 创建/导航/销毁/bounds 更新
├── browser-security.ts       # BrowserSecurityGuard：域名白名单 + 敏感动作检测
├── browser-audit.ts          # BrowserAuditLogger：JSONL 日志 + 实时监听器
├── browser-controller.ts     # BrowserController：动作执行 + 安全校验 + 敏感动作队列
├── browser-ipc.ts            # BrowserIPC：ipcMain.handle 注册/注销
├── browser-tool-bridge.ts    # BrowserToolBridge：Hermes Tool 调用适配
└── browser-tool-server.ts    # BrowserToolServer：HTTP Tool Server（127.0.0.1:8765-8775）
```

---

## 4. 架构总览

```
Renderer (window.aiosBrowser)
  ↓ IPC (browser.*)
BrowserIPC
  ↓ 委托
BrowserController
  ├─→ BrowserViewManager    (WebContentsView 操作)
  ├─→ BrowserSecurityGuard  (安全校验)
  └─→ BrowserAuditLogger    (审计记录)
       └─→ mainWindow.webContents.send("browser.on_audit_update")

Hermes Agent (HTTP)
  ↓ POST /tools/{toolName}
BrowserToolServer
  ↓ 委托
BrowserToolBridge
  ↓ 委托
BrowserController
```

**核心设计原则**：

- 所有动作经过 SecurityGuard 校验后才执行
- 所有动作结果（含失败/阻断）均写入 AuditLogger
- 敏感动作不直接执行，而是进入 Pending 队列等待用户确认
- Tool Server 仅监听 127.0.0.1，不对外暴露

---

## 5. 模块规格（Module Spec）

## 5.1 browser-types.ts

### 职责

定义内部常量，供其他模块引用。

### 关键常量

- `SENSITIVE_ACTION_KEYWORDS: Set<string>`
  - 触发敏感动作确认的关键词：submit/approve/reject/delete/remove/payment/transfer/archive/publish/send
- `JS_SCRIPT_NAMES: Set<string>`
  - 注入 JS 函数名白名单（用于识别自身注入的脚本）
- `BROWSER_PARTITION: "persist:aios-external-web"`
  - WebContentsView 使用的独立 session partition
- `PENDING_ACTION_TIMEOUT_MS: 5 * 60 * 1000`
  - 敏感动作等待确认的超时时间（5 分钟）

---

## 5.2 browser-view-manager.ts

### 职责

管理 Electron `WebContentsView` 的完整生命周期。

### 核心方法

- `createView(url)`: 若 view 已存在则导航，否则创建新 WebContentsView 并加入 mainWindow.contentView
- `navigate(url)`: 导航到指定 URL（若 view 不存在则先创建）
- `destroyView()`: 从 contentView 移除并关闭 WebContents
- `updateBounds(bounds)`: 更新 view 的位置和尺寸（由 Renderer 同步触发）
- `getExternalWebContents()`: 返回 WebContents 引用（用于 JS 注入）
- `isReady()`: 检查 view 是否存在且未销毁
- `onBoundsUpdate(callback)`: 注册 bounds 变化回调（窗口 resize 时触发）

### 配置

- `sandbox: true`（沙箱模式）
- `partition: BROWSER_PARTITION`（独立 session，与主窗口隔离）

---

## 5.3 browser-security.ts

### 职责

提供域名白名单校验与敏感动作检测。

### 配置文件

- 路径由构造函数传入（`configPath`）
- 格式：`{ allowedDomains: string[], sensitiveActionConfirm: boolean }`
- 支持通配符：`*.example.com`
- 本地地址（localhost/127.0.0.1/::1/0.0.0.0）始终允许

### 核心方法

- `isDomainAllowed(url)`: 检查 URL 的 hostname 是否在白名单
- `isPasswordField(selector)`: 检测 selector 是否指向密码字段
- `isSensitiveAction(selector, elementInfo?)`: 检测是否包含敏感关键词
- `validateAction(url, selector, options?)`: 综合校验，返回 `BrowserSecurityCheckResult`
- `reloadConfig()`: 重新从文件加载配置

### 校验优先级

1. 域名不在白名单 → `DOMAIN_NOT_ALLOWED`
2. type 动作且为密码字段 → `PASSWORD_FIELD_BLOCKED`
3. 敏感动作且 sensitiveActionConfirm=true → `UNSAFE_ACTION_REQUIRES_CONFIRMATION`

---

## 5.4 browser-audit.ts

### 职责

记录所有浏览器动作的审计日志，支持实时推送。

### 存储策略

- 按日期分文件：`{logDir}/browser-audit-{YYYY-MM-DD}.jsonl`
- 每条记录为一行 JSON（JSONL 格式）
- 使用 append 模式写入，日期变更时自动切换文件

### 核心方法

- `log(params)`: 写入一条审计记录，同时通知所有监听器
- `query(limit?)`: 读取当日日志文件，返回最近 N 条记录
- `onLog(listener)`: 注册实时监听器，返回取消订阅函数
- `sanitizeTypeArgs(text)`: 对 type 动作的文本内容脱敏（只记录长度）
- `close()`: 关闭写入流，清空监听器

### 安全注意

- type 动作的文本内容不写入日志（通过 `sanitizeTypeArgs` 脱敏）
- 日志目录在构造时自动创建

---

## 5.5 browser-controller.ts

### 职责

核心动作执行器，协调 ViewManager/SecurityGuard/AuditLogger，实现所有浏览器动作。

### 注入 JS 脚本

- `GET_PAGE_STATE_SCRIPT`：提取页面 title/url/text/inputs/buttons/links（各限 50 条，text 限 5000 字符）
- `CLICK_SELECTOR_SCRIPT(selector)`：点击指定元素
- `TYPE_SELECTOR_SCRIPT(selector, text)`：向指定元素输入文本（使用 execCommand + input/change 事件）
- `EXTRACT_TABLE_SCRIPT(selector)`：提取表格数据为二维数组

### 动作方法

| 方法 | 安全校验 | 审计 |
|------|---------|------|
| `openExternalUrl(request)` | 域名白名单 | 是 |
| `goBack/goForward/reload(source)` | 仅检查 view 就绪 | 是 |
| `getPageState(source)` | 仅检查 view 就绪 | 是 |
| `captureScreenshot(source)` | 仅检查 view 就绪 | 是 |
| `clickSelector(request)` | 域名 + 敏感动作 | 是 |
| `typeIntoSelector(request)` | 域名 + 密码字段 + 敏感动作 | 是 |
| `extractTable(request)` | 仅检查 view 就绪 | 是 |

### 敏感动作处理流程

1. SecurityGuard 返回 `UNSAFE_ACTION_REQUIRES_CONFIRMATION`
2. 生成 `pendingActionId`（UUID），设置 5 分钟超时
3. 通过 `mainWindow.webContents.send("browser.on_pending_action", ...)` 推送到 Renderer
4. 返回 `UNSAFE_ACTION_REQUIRES_CONFIRMATION` 错误给调用方
5. 用户 confirm → 执行原始动作，记录 `confirmed` 状态
6. 用户 reject → 清除 pending，记录 `rejected` 状态
7. 超时 → 自动清除，记录 `timeout` 状态

---

## 5.6 browser-ipc.ts

### 职责

注册/注销所有 `browser.*` IPC handler。

### IPC Channels

| Channel | 处理方法 | 说明 |
|---------|---------|------|
| `browser.open` | `controller.openExternalUrl` | 打开 URL |
| `browser.back` | `controller.goBack` | 后退 |
| `browser.forward` | `controller.goForward` | 前进 |
| `browser.reload` | `controller.reload` | 刷新 |
| `browser.get_state` | `controller.getPageState` | 获取页面状态 |
| `browser.screenshot` | `controller.captureScreenshot` | 截图 |
| `browser.click` | `controller.clickSelector` | 点击元素 |
| `browser.type` | `controller.typeIntoSelector` | 输入文本 |
| `browser.extract_table` | `controller.extractTable` | 提取表格 |
| `browser.get_audit_log` | `controller.getAuditLog` | 查询审计日志 |
| `browser.confirm_action` | `controller.confirmAction` | 确认敏感动作 |
| `browser.reject_action` | `controller.rejectAction` | 拒绝敏感动作 |
| `browser.update_bounds` | `viewManager.updateBounds` | 更新 view 位置 |

### 推送事件（Main → Renderer）

| 事件 | 触发时机 |
|------|---------|
| `browser.on_pending_action` | 敏感动作进入 pending 队列 |
| `browser.on_audit_update` | 每次审计记录写入（通过 AuditLogger.onLog） |

---

## 5.7 browser-tool-bridge.ts

### 职责

将 Hermes Agent 的 Tool 调用格式适配为 BrowserController 方法调用。

### 支持的 Tool

- `browser.open`、`browser.get_state`、`browser.screenshot`
- `browser.click`、`browser.type`
- `browser.back`、`browser.forward`、`browser.reload`
- `browser.extract_table`

### 特点

- 所有调用使用 `source: "hermes"`
- 返回值统一包含 `data` 字段（用于 Tool 结果传递）
- 通过 `getToolSchemas()` 暴露 Tool 定义（来自 `shared/browser/browser-tool-schema`）

---

## 5.8 browser-tool-server.ts

### 职责

提供本地 HTTP 服务，供 Hermes Agent 通过 HTTP 调用浏览器 Tool。

### 端口策略

- 尝试端口范围：`127.0.0.1:8765` ~ `127.0.0.1:8775`
- 逐个尝试，第一个可用端口启动
- 全部占用时打印错误，不启动

### API 端点

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/tools` | 返回所有 Tool 的 schema 定义 |
| `POST` | `/tools/{toolName}` | 执行指定 Tool，body 为 JSON 参数 |

### 安全约束

- 仅监听 `127.0.0.1`，不对外暴露
- 请求超时：30 秒
- 支持 CORS（`Access-Control-Allow-Origin: *`，仅本地使用）

---

## 6. 数据流（Data Flow Spec）

### 用户发起动作

```
Renderer (window.aiosBrowser.click)
  → IPC: browser.click
  → BrowserIPC.handle
  → BrowserController.clickSelector
      ├─→ BrowserSecurityGuard.validateAction
      │    ├─ 域名不允许 → 返回 DOMAIN_NOT_ALLOWED
      │    ├─ 敏感动作 → handleSensitiveAction
      │    │    ├─→ 生成 pendingActionId
      │    │    ├─→ mainWindow.send("browser.on_pending_action")
      │    │    └─→ 返回 UNSAFE_ACTION_REQUIRES_CONFIRMATION
      │    └─ 允许 → executeClick
      │         ├─→ wc.executeJavaScript(CLICK_SELECTOR_SCRIPT)
      │         └─→ BrowserAuditLogger.log(success/failed)
      └─→ BrowserAuditLogger.log(blocked)
           └─→ mainWindow.send("browser.on_audit_update")
```

### Hermes Agent 发起动作

```
Hermes Agent (HTTP POST /tools/browser.click)
  → BrowserToolServer.handleRequest
  → BrowserToolBridge.handleToolCall("browser.click", params)
  → BrowserController.clickSelector({ source: "hermes", ... })
  → (同上安全校验流程)
```

---

## 7. 扩展规范（Agent Execution Rules）

### 7.1 新增浏览器动作

1. `src/shared/browser/browser-contract.ts`：在 `BrowserActionName` 中添加新动作名
2. `browser-controller.ts`：实现动作方法（含安全校验 + 审计）
3. `browser-ipc.ts`：注册新的 IPC handler，并在 `unregister` 中添加 channel
4. `browser-tool-bridge.ts`：在 `handleToolCall` 中添加 case
5. `src/preload/browser-api.ts`：暴露新方法
6. `src/preload/index.d.ts`：更新 `AiosBrowserAPI` 接口

### 7.2 修改安全策略

- 域名白名单：修改配置文件（`allowedDomains`），调用 `securityGuard.reloadConfig()`
- 敏感关键词：修改 `browser-types.ts` 的 `SENSITIVE_ACTION_KEYWORDS`
- 禁用敏感动作确认：配置文件中设置 `sensitiveActionConfirm: false`

### 7.3 扩展审计日志

- 新增字段：修改 `BrowserAuditRecord`（shared contract）和 `BrowserAuditLogger.log` 参数
- 修改存储路径：修改 `BrowserAuditLogger` 构造函数的 `logDir` 参数
- 跨日期查询：当前 `query()` 仅读取当日文件，如需历史查询需扩展

---

## 8. 安全约束（Security Constraints）

- 密码字段（`type="password"` 等）的 type 动作始终阻断
- 敏感动作（含 submit/delete/payment 等关键词）默认需用户确认
- 域名白名单为空时，仅允许 localhost
- WebContentsView 使用独立 partition（`persist:aios-external-web`），与主窗口 session 隔离
- Tool Server 仅监听 127.0.0.1，不对外暴露
- type 动作的文本内容不写入审计日志（脱敏为 textLength）

---

## 9. 验收清单（Acceptance Checklist）

- [ ] `browser.open` 对白名单域名成功创建 WebContentsView
- [ ] `browser.open` 对非白名单域名返回 `DOMAIN_NOT_ALLOWED`
- [ ] `browser.type` 对密码字段返回 `PASSWORD_FIELD_BLOCKED`
- [ ] 含敏感关键词的 click/type 触发 pending action 推送
- [ ] pending action 超时（5 分钟）后自动清除并记录 timeout
- [ ] confirm/reject 后 pending action 从队列移除
- [ ] 所有动作均写入审计日志（含 blocked/failed 状态）
- [ ] `browser.on_audit_update` 实时推送到 Renderer
- [ ] Tool Server 在 8765-8775 范围内成功启动
- [ ] Tool Server `GET /tools` 返回正确的 schema
- [ ] Tool Server `POST /tools/browser.click` 正确执行并返回结果

---

## 10. 快速参考（For Agent）

### 关键文件

- `src/main/browser/browser-controller.ts`（核心逻辑）
- `src/main/browser/browser-security.ts`（安全策略）
- `src/main/browser/browser-audit.ts`（审计日志）
- `src/main/browser/browser-ipc.ts`（IPC 注册）
- `src/shared/browser/browser-contract.ts`（共享类型）
- `src/shared/browser/browser-errors.ts`（错误码工厂）

### 最小改动原则

- 新增动作：先改 contract 类型，再改 controller，再改 ipc，最后改 preload
- 修改安全策略：优先通过配置文件，避免修改代码
- 审计字段扩展：同步修改 shared contract 和 logger 实现
