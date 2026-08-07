---

# Hermes WebUI — 系统架构分析文档

*面向 AI 编码助手。预设读者将基于此文档修改代码库。*

---

## 1. 系统本质

**是什么：** 一个为 `hermes-agent` CLI 提供浏览器界面的自托管 SPA。核心职责是：会话持久化、SSE 流式代理、Human-in-the-Loop 工具审批、工作区文件管理。

**不是什么：** 不是 LLM 网关、不是多用户 SaaS、不是 React/Vue 应用、不是 WebSocket 系统。它不直接调用任何 LLM API——所有 LLM 调用由 `hermes-agent` 进程完成。

**设计约束（不可违反）：**
- 无构建步骤、无前端框架、无打包器
- Python stdlib `ThreadingHTTPServer`，非 asyncio
- 前端为 7 个 vanilla JS 文件，以 `<script>` 标签顺序加载（非 ES modules）
- 新依赖必须有明确理由和回滚方案 [1](#1-0) 

---

## 2. 架构设计意图

### 职责划分

```
server.py          → HTTP 协议层（Handler、auth、dispatch）
api/routes.py      → 所有路由处理（flat if/elif 链，无路由框架）
api/streaming.py   → SSE 引擎 + agent 线程管理
api/models.py      → Session 模型 + JSON 持久化 + 内存缓存
api/config.py      → 全局状态、模型发现、可重载配置
api/profiles.py    → 多 profile 隔离（thread-local）
static/ui.js       → 全局状态 S、renderMd、工具卡渲染
static/messages.js → send()、SSE 事件处理、审批流
static/sessions.js → 会话 CRUD、列表渲染
static/panels.js   → 侧边栏所有面板（Cron/Skills/Memory/Kanban）
static/boot.js     → 初始化瀑布、事件绑定、语音输入
static/commands.js → /slash 命令注册表
```

### 稳定抽象层（不应随意修改）

| 抽象 | 位置 | 说明 |
|---|---|---|
| `Session` 类 | `api/models.py` | 字段结构是前后端契约 |
| SSE 事件类型 | `api/streaming.py` | `token/tool/approval/clarify/done/error` |
| 全局状态 `S` | `static/ui.js` | `{session, messages, entries, busy, pendingFiles}` |
| `STREAMS` / `CANCEL_FLAGS` | `api/config.py` | 流生命周期注册表 |
| `tools/approval.py` 模块级状态 | hermes-agent | 进程内共享，不可跨进程 | [2](#1-1) 

### 易变实现细节

- `MODEL_LABELS` 字典和 `<select>` 选项（新增 model 需同步两处）
- `renderMd()` 正则链（手写 markdown 渲染，已知缺陷：嵌套列表、混合 bold+link）
- 路由 if/elif 链（`api/routes.py` ~9772 行）
- `all_sessions()` 读 `_index.json`（O(1)，但 index 需随 save/delete 同步维护） [3](#1-2) 

---

## 3. 显式与隐式扩展点

### 显式扩展点

**新增 API 端点：** 在 `api/routes.py` 的 `handle_get`/`handle_post` 的 if/elif 链末尾追加。POST 端点必须在 `/api/upload` 检查之后（`read_body()` 会消耗 rfile）。 [4](#1-3) 

**新增 slash 命令：** 在 `static/commands.js` 的 `COMMANDS` 数组追加条目。

**新增 model：** `MODEL_LABELS` dict（`static/ui.js`）+ `<select id="modelSelect">` 选项（`static/index.html`）。 [5](#1-4) 

**新增侧边栏面板：** `static/index.html` 加 `.panel-view` div + `nav.rail` 加按钮 + `static/panels.js` 加逻辑。

**新增 SSE 事件类型：** `api/streaming.py` 的 `put()` 函数发出，`static/messages.js` 的 `_wireSSE()` 中处理。

### 隐式扩展点

- `HERMES_EXEC_ASK=1` 环境变量启用工具审批门控（由 `_run_agent_streaming` 设置）
- `RuntimeAdapter` 接口（`api/runtime_adapter.py`）：`HERMES_WEBUI_RUNTIME_ADAPTER=legacy-journal` 切换执行路径
- CSS 变量系统（`--accent`, `--sidebar`, `--text` 等）：新增 skin 只需在 `style.css` 追加 `[data-sk='name']` 覆盖块
- `data-i18n` 属性系统：新增 i18n key 在 `static/i18n.js` 的语言对象中追加 [6](#1-5) 

---

## 4. 不变式规则

以下规则被代码注释和测试明确保护，违反会引入已知 bug：

1. **`/api/upload` 必须在 `read_body()` 之前检查**（`api/routes.py`）
2. **`deleteSession()` 永远不调用 `newSession()`**（`static/sessions.js`）
3. **`send()` 必须在任何 await 之前捕获 `activeSid`**，完成后校验 session 是否切换
4. **`tools/approval.py` 模块级 `_pending` dict 只在单进程内有效**，不可 reload 或跨 worker
5. **`os.environ` 写入必须持有 `_ENV_LOCK`**，agent 运行期间不持有（narrow-lock 模式）
6. **SSE 流的 `done`/`error` 事件必须触发 `STREAMS.pop(stream_id)`**（finally 块）
7. **`session.save()` 必须同步更新 `_index.json`**（通过 `_write_session_index(updates=[s])`）
8. **前端 `S.busy=true` 期间，`setBusy(false)` 只能在 `activeSid` 匹配时调用** [7](#1-6) [4](#1-3) 

---

## 5. 系统预期生命周期

```
bootstrap.py / start.sh
  → 检查 agent 依赖 → 启动 ThreadingHTTPServer → 打开浏览器

请求生命周期（每个 HTTP 请求一个线程）：
  Handler.do_GET/do_POST
    → set_request_profile()（thread-local）
    → check_auth()
    → handle_get/handle_post（api/routes.py）
    → clear_request_profile()（finally）

Chat 轮次生命周期：
  POST /api/chat/start
    → 创建 queue.Queue → STREAMS[stream_id] = q
    → 启动 daemon thread: _run_agent_streaming()
    → 返回 {stream_id}
  GET /api/chat/stream?stream_id=X
    → 长连接 SSE，从 q.get(timeout=30) 读取
    → 30s 无事件发 heartbeat comment
    → 收到 done/error 关闭连接
  _run_agent_streaming（daemon thread）：
    → 持有 _get_session_agent_lock(session_id)（防同一 session 并发）
    → 持有 _ENV_LOCK（brief）设置 os.environ
    → 实例化 AIAgent，调用 run_conversation()
    → 通过 on_token/on_tool/on_clarify 回调 put() 事件到队列
    → finally: 恢复 os.environ，STREAMS.pop(stream_id)

Session 持久化：
  ~/.hermes/webui/sessions/{session_id}.json（每次 save() 原子写入）
  ~/.hermes/webui/sessions/_index.json（O(1) 列表查询）
``` [8](#1-7) 

---

## 6. Layout 文件 Spec

### DOM 骨架（`static/index.html`）

```
<header class="app-titlebar">          ← 移动端汉堡菜单 + 标题
<div class="layout">
  <nav class="rail">                   ← 桌面左侧图标导航栏（≥768px）
  <aside class="sidebar">
    <div class="sidebar-nav">          ← 移动端 tab 导航（<768px）
    <div class="panel-view#panelChat"> ← 会话列表
    <div class="panel-view#panelTasks">
    <div class="panel-view#panelKanban">
    <div class="panel-view#panelSkills">
    <div class="panel-view#panelMemory">
    <div class="panel-view#panelTodos">
    <div class="panel-view#panelInsights">
    <div class="panel-view#panelWorkspaces">
    <div class="panel-view#panelProfiles">
    <div class="panel-view#panelLogs">
    <div class="panel-view#panelSettings">
    <div class="resize-handle#sidebarResize">
  <main class="main">
    <div#mainChat class="main-view">   ← 默认激活视图
      <div.messages-shell>
        <div#messages>
          <div.empty-state#emptyState>
          <div.messages-inner#msgInner> ← renderMessages() 目标
          <div#liveCompressionCards>
          <div#liveToolCards>
      <div.update-banner#updateBanner>
      <div.reconnect-banner#reconnectBanner>
      <div.offline-banner#offlineBanner>
      <div.agent-health-banner#agentHealthBanner>
      <div.composer-wrap#composerWrap>
        <div.composer-flyout>
          <div#queueCard>              ← 消息队列飞出层
          <div.approval-card#approvalCard>  ← HITL 审批卡
          <div.clarify-card#clarifyCard>    ← Agent 问题卡
          <div#composerTerminalPanel>  ← 内嵌终端
        <div.composer-box#composerBox>
          <div#cmdDropdown>            ← /slash 自动补全
          <textarea#msg>
          <div.composer-footer>
            <div.composer-left>        ← attach/mic/profile/workspace/model chips
            <div.composer-right>       ← ctx-indicator + send button
    <div#mainSkills class="main-view">
    <div#mainMemory class="main-view">
    <div#mainTasks class="main-view">
    <div#mainKanban class="main-view">
    <div#mainWorkspaces class="main-view">
    <div#mainProfiles class="main-view">
    <div#mainInsights class="main-view">
    <div#mainLogs class="main-view">
    <div#mainSettings class="main-view">
  <div class="rightpanel">
    <div.resizer-h>                    ← 拖拽调整宽度
    <div#workspaceContainer>           ← 文件树 + 预览
```

### CSS 变量契约（`static/style.css`）

主题轴：`:root`（light）/ `:root.dark`（dark）
Skin 轴：`[data-sk='ares']` / `[data-sk='sisyphus']` 等覆盖 `--accent` 系列变量

关键 CSS 变量：`--sidebar`, `--main`, `--text`, `--muted`, `--accent`, `--border`, `--border2`, `--surface`, `--code-bg`, `--error`

响应式断点：`900px`（rightpanel 变 fixed）、`768px`（rail 隐藏，sidebar-nav 显示）、`640px`（移动端全屏） [9](#1-8) [10](#1-9) [11](#1-10) 

---

## 7. UI 组件清单

### Composer 区域组件

| 组件 | ID/Class | 控制函数 |
|---|---|---|
| 消息输入框 | `#msg` | `autoResize()` |
| 发送按钮 | `#btnSend` | `send()` |
| 附件按钮 | `#btnAttach` | `fileInput.click()` |
| 麦克风按钮 | `#btnMic` | `_startMic()/_stopMic()` |
| 语音模式按钮 | `#btnVoiceMode` | voice mode lifecycle |
| Model chip | `#composerModelChip` | `toggleModelDropdown()` |
| Model select | `#modelSelect` | `onchange` → `POST /api/session/update` |
| Model dropdown | `#composerModelDropdown` | `populateModelDropdown()` |
| Workspace chip | `#composerWorkspaceChip` | `toggleComposerWsDropdown()` |
| Profile chip | `#profileChip` | `toggleProfileDropdown()` |
| Reasoning chip | `#composerReasoningChip` | `toggleReasoningDropdown()` |
| Toolsets chip | `#composerToolsetsChip` | `toggleToolsetsDropdown()` |
| Context indicator | `#ctxIndicator` | `syncContextIndicator()` |
| YOLO pill | `#yoloPill` | `cmdYolo()` |
| 附件托盘 | `#attachTray` | `renderTray()` |
| 上传进度条 | `#uploadBar` | `uploadPendingFiles()` |

### 飞出层组件（composer-flyout）

| 组件 | ID | 触发条件 |
|---|---|---|
| 审批卡 | `#approvalCard` | SSE `approval` 事件 |
| 澄清卡 | `#clarifyCard` | SSE `clarify` 事件 |
| 队列卡 | `#queueCard` | `S.busy` + 新消息入队 |
| 内嵌终端 | `#composerTerminalPanel` | `openComposerTerminal()` |

### 消息区域组件

| 组件 | Class | 渲染函数 |
|---|---|---|
| 消息列表 | `#msgInner` | `renderMessages()` |
| 工具卡 | `.tool-card` | `renderToolCard()` |
| 思考卡 | `.thinking-card` | `renderThinkingBlock()` |
| 压缩块 | `.compression-block` | `renderCompressionBlock()` |
| 实时工具卡 | `#liveToolCards` | SSE `tool` 事件 |
| 实时压缩卡 | `#liveCompressionCards` | SSE `compression` 事件 |

### 侧边栏面板（`switchPanel(panelId)` 切换）

`chat` / `tasks` / `kanban` / `skills` / `memory` / `todos` / `insights` / `workspaces` / `profiles` / `logs` / `settings`

每个面板对应：`nav.rail` 按钮 + `aside.sidebar .panel-view#panel{Name}` + `main .main-view#main{Name}` [12](#1-11) [13](#1-12) 

---

## 8. Chat 组件与 hermes-agent 调用详细说明

### 完整调用链

```
用户按 Enter
  → messages.js: send()
      ├─ 拦截 /slash → commands.js: executeCommand()（本地执行，不调 agent）
      ├─ S.busy=true → 按 busy_input_mode: queue / interrupt / steer
      ├─ S.session=null → sessions.js: newSession() → POST /api/session/new
      ├─ uploadPendingFiles() → POST /api/upload（multipart）
      ├─ 构建 userMsg，push 到 S.messages，renderMessages()，appendThinking()
      ├─ setBusy(true)，INFLIGHT[activeSid] = snapshot
      ├─ startApprovalPolling(activeSid)（1500ms 轮询 /api/approval/pending）
      └─ POST /api/chat/start {session_id, message, model, workspace, attachments}
           → api/routes.py → _start_chat_stream()
               → 创建 queue.Queue，STREAMS[stream_id] = q
               → 启动 daemon thread: _run_agent_streaming(...)
               → 返回 {stream_id}
  → new EventSource('/api/chat/stream?stream_id=X')
      → api/routes.py → _sse(handler, stream_id)
          → q.get(timeout=30) 循环，格式化为 SSE frames
``` [14](#1-13) 

### `_run_agent_streaming` 内部流程

```python
# api/streaming.py
def _run_agent_streaming(session_id, msg_text, model, workspace, stream_id, ...):
    with _get_session_agent_lock(session_id):          # 防同一 session 并发
        with _ENV_LOCK:                                # 原子设置 os.environ
            _set_thread_env(TERMINAL_CWD, HERMES_EXEC_ASK, HERMES_SESSION_KEY, HERMES_HOME)
        
        # 实例化 AIAgent（来自 hermes-agent 包）
        agent = AIAgent(
            model=resolved_model,
            platform='cli',
            quiet_mode=True,
            enabled_toolsets=CLI_TOOLSETS,
            session_id=session_id,
            stream_delta_callback=on_token,
            tool_progress_callback=on_tool,
        )
        
        # 注入 SessionDB（Sprint 42+）
        session_db = SessionDB(session_id)
        agent.session_db = session_db
        
        # 执行对话（阻塞，直到 agent 完成或被中断）
        result = agent.run_conversation(
            user_message=msg_text,
            conversation_history=visible_messages,  # 压缩锚点过滤后的消息
            task_id=session_id,                     # 注意：是 task_id 不是 session_id
        )
        
        # 完成后：更新 s.messages，生成 title，save()
        # put('done', {session: s.compact() | {messages: s.messages}})
    
    # finally: 恢复 os.environ，STREAMS.pop(stream_id)
``` [15](#1-14) 

### SSE 回调与事件映射

```
on_token(text):
    if text is None: return  # end-of-stream sentinel
    put('token', {'text': text})
    # 前端: assistantText += d.text → renderMd() via rAF throttle

on_tool(name, preview, args):
    put('tool', {'name': name, 'preview': preview[:120], 'args': args})
    if tools.approval.has_pending(session_id):
        put('approval', pending_entry)  # 立即推送审批，无需等待下次轮询
    # 前端: setStatus(name) + 追加 tool card

on_clarify(question, options, timeout):
    put('clarify', {'question': question, 'options': options})
    # 前端: showClarifyCard() → 用户回答 → POST /api/clarify/respond
``` [16](#1-15) 

### SSE 事件前端处理（`_wireSSE` in `messages.js`）

| 事件 | 前端动作 |
|---|---|
| `token` | `assistantText += d.text`，rAF 节流 `renderMd()` |
| `reasoning` | 追加到 thinking block |
| `tool` | `setStatus(d.name)`，追加 live tool card |
| `approval` | `showApprovalCard(d)`，停止 thinking 动画 |
| `clarify` | `showClarifyCard(d)` |
| `metering` | 更新 TPS 显示 |
| `done` | `S.session = d.session`，`S.messages = d.session.messages`，`renderMessages()`，`loadDir()`，`renderSessionList()`，`setBusy(false)`，`delete INFLIGHT[activeSid]`，drain SESSION_QUEUES |
| `error` | 显示错误 toast/card，`setBusy(false)` |

### 取消流程

```
用户点击取消
  → boot.js: cancelStream(stream_id)
      → GET /api/chat/cancel?stream_id=X
          → cancel_stream(stream_id):
              1. CANCEL_FLAGS[stream_id].set()
              2. AGENT_INSTANCES[stream_id].interrupt("Cancelled by user")
              3. 保存 pending user message 到 s.messages（防数据丢失）
              4. STREAMS.pop() + CANCEL_FLAGS.pop() + AGENT_INSTANCES.pop()（eager release）
      → setBusy(false)，S.activeStreamId = null
``` [17](#1-16) 

### 审批（HITL）完整流程

```
agent 调用危险工具
  → tools/approval.py: submit_pending(session_id, data)
      → _gateway_queues[session_id].append(ApprovalEntry)
      → _approval_sse_notify_locked()（持锁推送，保证队列头部一致性）
  → streaming.py: on_tool() 检测到 has_pending → put('approval', head_entry)
  → 前端: showApprovalCard(data, pendingCount)
  → 用户点击 "Allow once"
  → POST /api/approval/respond {approval_id, decision: 'once'}
      → api/runtime_adapter.py: respond_approval()
          → tools/approval.py: resolve_gateway_approval(session_id, 'once', approval_id)
              → entry.event.set()  ← 解除 agent 线程阻塞
  → agent 线程恢复，工具执行继续
  → 若队列还有待审批项，自动推送下一个 approval SSE
``` [17](#1-16) 

---

## 9. 新增功能归属位置

| 功能类型 | 归属位置 |
|---|---|
| 新 LLM 提供商/模型 | `api/config.py`（发现逻辑）+ `static/ui.js`（MODEL_LABELS）+ `static/index.html`（select options）|
| 新 API 端点 | `api/routes.py` if/elif 链 |
| 新侧边栏面板 | `static/index.html` + `static/panels.js` + `nav.rail` |
| 新 slash 命令 | `static/commands.js` COMMANDS 数组 |
| 新 SSE 事件类型 | `api/streaming.py` put() + `static/messages.js` _wireSSE() |
| 新工具审批逻辑 | `api/runtime_adapter.py` + `tools/approval.py`（hermes-agent 侧）|
| 新 CSS 主题/skin | `static/style.css` CSS 变量覆盖块 |
| 新 i18n 字符串 | `static/i18n.js` 各语言对象 |
| 新 session 字段 | `api/models.py` Session 类 + `compact()` 方法 |
| 新后台任务 | `api/background.py` 或新的 daemon thread |

---

## 10. 高风险修改类型

1. **`api/routes.py` 中 `/api/upload` 的位置**：必须在 `read_body()` 之前，否则 multipart 上传静默失败
2. **`tools/approval.py` 模块级状态**：任何 `importlib.reload()` 或多进程部署会破坏审批系统
3. **`os.environ` 写入**：必须持有 `_ENV_LOCK`，且不能在 agent 运行期间持有（死锁风险）
4. **`Session.save()` 不更新 `_index.json`**：会导致 `all_sessions()` 返回过期数据
5. **前端 `S.busy` 状态管理**：`setBusy(false)` 在错误路径中遗漏会永久锁定 Send 按钮
6. **SSE 流 finally 块**：`STREAMS.pop()` 遗漏会导致内存泄漏和 409 冲突
7. **`send()` 中 `activeSid` 捕获时机**：必须在第一个 await 之前，否则 session 切换竞态
8. **`run_conversation()` 的 `task_id` 参数**：是 `task_id=` 不是 `session_id=`，传错参数静默失败 [4](#1-3) [18](#1-17) [19](#1-18) [20](#1-19)

### Citations

**File:** ARCHITECTURE.md (L31-34)
```markdown
The design philosophy is deliberately minimal. There is no build step, no bundler, no
frontend framework. The Python server is split into a routing shell (server.py) and
business logic modules (api/). The frontend is seven vanilla JS modules loaded from static/.
This makes the code easy to modify from a terminal or by an agent.
```

**File:** ARCHITECTURE.md (L175-179)
```markdown
CRITICAL ORDERING RULE in do_POST:
The /api/upload check MUST appear BEFORE calling read_body(). read_body() calls
handler.rfile.read() which consumes the HTTP body stream. The upload handler also
needs rfile (to read the multipart payload). If read_body() runs first on a multipart
request, the upload handler receives an empty body and the upload silently fails.
```

**File:** ARCHITECTURE.md (L220-292)
```markdown
### 4.3 SSE Streaming Engine

This is the most architecturally interesting part. Two endpoints cooperate:

    POST /api/chat/start     Receives the user message. Creates a queue.Queue, stores it
                             in STREAMS[stream_id], spawns a daemon thread running
                             _run_agent_streaming(), returns {stream_id} immediately.

    GET  /api/chat/stream    Long-lived SSE connection. Reads from STREAMS[stream_id]
                             and forwards events to the browser until 'done' or 'error'.

Queue registry:

    STREAMS = {}               dict: stream_id -> queue.Queue
    STREAMS_LOCK = threading.Lock()

SSE event types and their data shapes:

    token       {"text": "..."}                         LLM token delta
    tool        {"name": "...", "preview": "..."}       Tool invocation started
    approval    {"command": "...", "description": "...", "pattern_keys": [...]}
    done        {"session": {compact_fields + messages}} Agent finished successfully
    error       {"message": "...", "trace": "..."}       Agent threw exception

The SSE handler loop:
    - Blocks on queue.get(timeout=30)
    - On timeout (no events in 30s): sends a heartbeat comment (": heartbeat

")
      to keep the connection alive through proxies and firewalls
    - On 'done' or 'error' event: breaks the loop and returns
    - Catches BrokenPipeError and ConnectionResetError silently (browser disconnected)

Stream cleanup: _run_agent_streaming() pops its stream_id from STREAMS in a finally
block. If the browser disconnects mid-stream, the daemon thread runs to completion and
then cleans up. The queue fills and the put_nowait() calls fail silently (queue.Full
is caught).

Fallback sync endpoint: POST /api/chat still exists and holds the connection open until
the agent finishes. The frontend never uses it but it can be useful for debugging.

### 4.4 Agent Invocation (_run_agent_streaming)

    def _run_agent_streaming(session_id, msg_text, model, workspace, stream_id):

1. Fetches session from SESSIONS (not from disk -- session was just updated by /api/chat/start)
2. Sets TERMINAL_CWD, HERMES_EXEC_ASK, HERMES_SESSION_KEY env vars
3. Creates AIAgent with:
   - model=model, platform='cli', quiet_mode=True
   - enabled_toolsets=CLI_TOOLSETS (from config.yaml or hardcoded default)
   - session_id=session_id
   - stream_delta_callback=on_token (fires per token)
   - tool_progress_callback=on_tool (fires per tool invocation)
4. Calls agent.run_conversation(user_message=msg_text, conversation_history=s.messages,
                                 task_id=session_id)
   NOTE: keyword is task_id NOT session_id (common mistake, documented in skill)
5. On return: updates s.messages, calls title_from(), saves session
6. Puts ('done', {session: ...}) into queue
7. Finally block: restores env vars, pops stream_id from STREAMS

on_token callback:
    if text is None: return  # end-of-stream sentinel from AIAgent
    put('token', {'text': text})

on_tool callback:
    put('tool', {'name': name, 'preview': preview})
    # Also immediately surface any pending approval:
    if has_pending(session_id):
        with _lock: p = dict(_pending.get(session_id, {}))
        if p: put('approval', p)

The approval surface-on-tool logic means approvals appear immediately after the tool
fires (within the same SSE stream), without waiting for the next poll cycle.
```

**File:** ARCHITECTURE.md (L294-320)
```markdown
### 4.5 Approval System Integration

The approval system uses the existing Hermes gateway module at tools/approval.py.
All state lives in module-level variables in that file:

    _pending = {}        dict: session_key -> pending_entry_dict
    _lock = Lock()       protects _pending
    _permanent_approved  set of permanently approved pattern keys

Because server.py imports tools.approval at module load time and everything runs in the
same process, this state IS shared between HTTP threads and agent daemon threads.

Important: this only works because Python imports are cached (sys.modules). The same
module object is used everywhere. If the approval module were ever imported in a subprocess
or via importlib.reload(), this would break.

GET /api/approval/pending:
    - Peeks at _pending[sid] without removing it
    - Returns {pending: entry} or {pending: null}
    - Called by the browser every 1500ms while S.busy is true (polling fallback)

POST /api/approval/respond:
    - Pops _pending[sid] (removes it)
    - For choice "once" or "session": calls approve_session(sid, pattern_key) for each key
    - For choice "always": calls approve_session + approve_permanent + save_permanent_allowlist
    - For choice "deny": just pops, does nothing (agent gets denied result)
    - Returns {ok: true, choice: choice}
```

**File:** ARCHITECTURE.md (L402-415)
```markdown
    const S = {
      session:      null,   // current Session compact dict (includes model, workspace, title)
      messages:     [],     // full messages array for current session
      entries:      [],     // current directory listing
      busy:         false,  // true while agent is running (disables Send button)
      pendingFiles: []      // File objects queued for upload with next message
    }

    const INFLIGHT = {}
    // keyed by session_id while a request is in-flight for that session
    // value: {messages: [...snapshot...], uploaded: [...filenames...]}
    // Purpose: if user switches sessions while a request is pending,
    //   switching back shows the in-progress state instead of the saved state

```

**File:** ARCHITECTURE.md (L509-523)
```markdown
### 5.5 Model Label Resolution (Fixed in Sprint 1, reused by composer selector)

B3 was resolved in Sprint 1. Current code uses a MODEL_LABELS dict:

    const MODEL_LABELS = {
      'openai/gpt-5.4-mini': 'GPT-5.4 Mini', 'openai/gpt-4o': 'GPT-4o',
      'openai/o3': 'o3', 'openai/o4-mini': 'o4-mini',
      'anthropic/claude-sonnet-4.6': 'Sonnet 4.6', 'anthropic/claude-sonnet-4-5': 'Sonnet 4.5',
      'anthropic/claude-haiku-3-5': 'Haiku 3.5', 'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
      'deepseek/deepseek-chat-v3-0324': 'DeepSeek V3', 'meta-llama/llama-4-scout': 'Llama 4 Scout',
    };
    getModelLabel(m) => MODEL_LABELS[m] || (m.split('/').pop() || 'Unknown');

Fallback: any unlisted model shows its short ID (after the last /) rather than a wrong label.
To add a new model: add an entry to MODEL_LABELS and add an <option> to the composer footer <select>.
```

**File:** ARCHITECTURE.md (L525-551)
```markdown
### 5.6 Session Delete Rules (from skill)

These rules are critical. GPT-5.4-mini has repeatedly re-introduced broken versions.

1. deleteSession() NEVER calls newSession(). Deleting does not create.
2. If deleted session was active AND other sessions exist: load sessions[0] (most recent).
3. If deleted session was active AND no sessions remain: show empty state.
4. If deleted session was not active: just re-render the list.
5. Always show toast("Conversation deleted") after any delete.

### 5.7 Send() Session Guard

Before any async operations in send():
    const activeSid = S.session.session_id;

After the agent completes:
    if (S.session && S.session.session_id === activeSid) {
      // apply result, re-render
      setBusy(false);
    } else {
      // user switched sessions mid-flight
      // only refresh sidebar, do NOT call setBusy(false) on the new session
      await renderSessionList();
    }

This prevents a session switch mid-flight from either clobbering the new session's state
or unlocking the Send button on the wrong session.
```

**File:** ARCHITECTURE.md (L557-587)
```markdown
Step-by-step trace of what happens when you type a message and press Send:

1.  User types, presses Enter. send() is called.
2.  Guard: return if (!text && !pendingFiles) || S.busy
3.  If S.session is null: await newSession(), await renderSessionList()
4.  Capture activeSid = S.session.session_id (before any awaits)
5.  uploadPendingFiles(): POST each file in S.pendingFiles to /api/upload
    - Shows upload progress bar
    - Clears S.pendingFiles on completion
    - Returns array of uploaded filenames
6.  Build msgText from text + file note
7.  Build userMsg {role:'user', content: displayText, attachments?: filenames}
8.  Push userMsg to S.messages, call renderMessages(), appendThinking()
9.  setBusy(true), setStatus('Hermes is thinking...')
10. INFLIGHT[activeSid] = {messages: [...S.messages], uploaded}
11. startApprovalPolling(activeSid)
12. POST /api/chat/start {session_id, message, model, workspace}
    Server: saves session, creates queue.Queue, starts daemon thread, returns {stream_id}
13. Browser opens EventSource('/api/chat/stream?stream_id=X')
14. In the SSE loop:
    - 'token': assistantText += d.text, ensureAssistantRow(), render markdown
    - 'tool': setStatus('tool name...')
    - 'approval': showApprovalCard(d)
    - 'done': sync S from d.session, renderMessages(), loadDir, renderSessionList,
               setBusy(false), delete INFLIGHT[activeSid]
    - 'error': show error message, setBusy(false)
    - es.onerror: handle network drops (show error, setBusy(false))
15. If approval needed: user clicks a button, respondApproval() fires
    POST /api/approval/respond -> server pops _pending, calls approve_*
    Agent retries the command (now is_approved() returns True) and continues

```

**File:** ARCHITECTURE.md (L614-618)
```markdown
AIAgent.run_conversation() parameters:

    user_message=           The human turn text
    conversation_history=   Prior messages list (OpenAI format)
    task_id=                Session ID (NOTE: NOT session_id=, it is task_id=)
```

**File:** api/runtime_adapter.py (L1-20)
```python
"""RuntimeAdapter seam for WebUI-owned run execution.

This is the #1925 Slice 2 seam only.  The default WebUI chat path remains the
legacy direct route; enabling ``HERMES_WEBUI_RUNTIME_ADAPTER=legacy-journal``
routes through this protocol-translator facade over the same legacy execution
path plus the Slice 1 run journal.  This module intentionally does not own
AIAgent instances, cancellation flags, approval callbacks, clarify callbacks, or
new long-lived queues.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import os
from pathlib import Path
from typing import Any, Callable, Iterable, Literal, Protocol

_RUNTIME_ADAPTER_ENV = "HERMES_WEBUI_RUNTIME_ADAPTER"
_RUNTIME_ADAPTER_DIRECT = "legacy-direct"
_RUNTIME_ADAPTER_JOURNAL = "legacy-journal"
_VALID_RUNTIME_ADAPTER_MODES = {_RUNTIME_ADAPTER_DIRECT, _RUNTIME_ADAPTER_JOURNAL}
```

**File:** static/index.html (L142-157)
```html
<div class="layout">
  <nav class="rail" aria-label="Primary navigation">
    <button class="rail-btn nav-tab active has-tooltip" data-panel="chat" onclick="switchPanel('chat',{fromRailClick:true})" data-tooltip="Chat" data-i18n-title="tab_chat" aria-label="Chat"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
    <button class="rail-btn nav-tab has-tooltip" data-panel="tasks" onclick="switchPanel('tasks',{fromRailClick:true})" data-tooltip="Tasks" data-i18n-title="tab_tasks" aria-label="Tasks"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
    <button class="rail-btn nav-tab has-tooltip" data-panel="kanban" onclick="switchPanel('kanban',{fromRailClick:true})" data-tooltip="Kanban" data-i18n-title="tab_kanban" aria-label="Kanban"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16"/><path d="M16 4v16"/><path d="M3 10h18"/></svg></button>
    <button class="rail-btn nav-tab has-tooltip" data-panel="skills" onclick="switchPanel('skills',{fromRailClick:true})" data-tooltip="Skills" data-i18n-title="tab_skills" aria-label="Skills"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></button>
    <button class="rail-btn nav-tab has-tooltip" data-panel="memory" onclick="switchPanel('memory',{fromRailClick:true})" data-tooltip="Memory" data-i18n-title="tab_memory" aria-label="Memory"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg></button>
    <button class="rail-btn nav-tab has-tooltip" data-panel="workspaces" onclick="switchPanel('workspaces',{fromRailClick:true})" data-tooltip="Spaces" data-i18n-title="tab_workspaces" aria-label="Spaces"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button>
    <button class="rail-btn nav-tab has-tooltip" data-panel="profiles" onclick="switchPanel('profiles',{fromRailClick:true})" data-tooltip="Agent profiles" data-i18n-title="tab_profiles" aria-label="Agent profiles"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>
    <button class="rail-btn nav-tab has-tooltip" data-panel="todos" onclick="switchPanel('todos',{fromRailClick:true})" data-tooltip="Current task list" data-i18n-title="tab_todos" aria-label="Todos"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg></button>
    <button class="rail-btn nav-tab has-tooltip" data-panel="insights" onclick="switchPanel('insights',{fromRailClick:true})" data-tooltip="Insights" data-i18n-title="tab_insights" aria-label="Insights"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg></button>
    <button class="rail-btn nav-tab dashboard-link has-tooltip" id="dashboardRailBtn" data-dashboard-link style="display:none" onclick="openHermesDashboard(event)" data-tooltip="Hermes Dashboard" data-i18n-title="tab_dashboard" aria-label="Hermes Dashboard"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg><span class="dashboard-external-badge" aria-hidden="true"></span></button>
    <button class="rail-btn nav-tab has-tooltip" data-panel="logs" onclick="switchPanel('logs',{fromRailClick:true})" data-tooltip="Logs" data-i18n-title="tab_logs" aria-label="Logs"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h2"/></svg></button>
    <div class="rail-spacer"></div>
    <button class="rail-btn nav-tab has-tooltip" data-panel="settings" onclick="switchPanel('settings',{fromRailClick:true})" data-tooltip="Settings" data-i18n-title="tab_settings" aria-label="Settings"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0  ... (truncated)
  </nav>
```

**File:** static/index.html (L359-395)
```html
  <main class="main">
    <div id="mainChat" class="main-view">
    <div class="messages-shell">
      <button id="jumpToSessionStartBtn" class="session-jump-btn session-jump-btn--start" aria-label="Jump to beginning of session" data-i18n-aria-label="session_jump_start_label" data-i18n-title="session_jump_start_label" onclick="jumpToSessionStart()" style="display:none"><span aria-hidden="true">↑</span><span data-i18n="session_jump_start">Start</span></button>
      <button id="scrollToBottomBtn" class="scroll-to-bottom-btn" style="display:none" onclick="scrollToBottom()" aria-label="Scroll to bottom" data-i18n-aria-label="session_jump_end_label" data-i18n-title="session_jump_end_label"><span aria-hidden="true">↓</span><span class="session-jump-btn__text" data-i18n="session_jump_end">End</span></button>
    <div class="messages" id="messages">
      <div class="empty-state" id="emptyState">
        <div class="empty-logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="80" height="80" aria-label="Hermes caduceus">
          <defs>
            <linearGradient id="hermes-gold" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#F5C542;stop-opacity:1"/>
              <stop offset="100%" style="stop-color:#D4961C;stop-opacity:1"/>
            </linearGradient>
          </defs>
          <rect x="30" y="10" width="4" height="46" rx="2" fill="url(#hermes-gold)"/>
          <path d="M30 18 C24 14, 14 14, 10 18 C14 16, 22 16, 28 20" fill="#F5C542" opacity="0.9"/>
          <path d="M30 22 C26 19, 18 19, 14 22 C18 20, 24 20, 28 24" fill="#D4961C" opacity="0.8"/>
          <path d="M34 18 C40 14, 50 14, 54 18 C50 16, 42 16, 36 20" fill="#F5C542" opacity="0.9"/>
          <path d="M34 22 C38 19, 46 19, 50 22 C46 20, 40 20, 36 24" fill="#D4961C" opacity="0.8"/>
          <path d="M32 48 C22 44, 20 38, 26 34 C20 36, 18 42, 24 46 C18 40, 22 30, 30 28 C24 32, 22 38, 28 42" fill="none" stroke="#F5C542" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M32 48 C42 44, 44 38, 38 34 C44 36, 46 42, 40 46 C46 40, 42 30, 34 28 C40 32, 42 38, 36 42" fill="none" stroke="#D4961C" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="32" cy="10" r="4" fill="#F5C542"/>
          <circle cx="32" cy="10" r="2" fill="#FFF8E1" opacity="0.7"/>
        </svg></div>
        <h2 data-i18n="empty_title">What can I help with?</h2>
        <p data-i18n="empty_subtitle">Ask anything, run commands, explore files, or manage your scheduled tasks.</p>
        <div class="suggestion-grid">
          <button class="suggestion" data-msg="What files are in this workspace?"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> <span data-i18n="suggest_files">What files are in this workspace?</span></button>
          <button class="suggestion" data-msg="What's on my schedule today?"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg> <span data-i18n="suggest_schedule">What's on my schedule today?</span></button>
          <button class="suggestion" data-msg="Help me plan a small project."><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg> <span data-i18n="suggest_plan">Help me plan a small project.</span></button>
        </div>
      </div>
      <div class="messages-inner" id="msgInner"></div>
      <div id="liveCompressionCards" class="live-compression-cards"></div>
      <div id="liveToolCards" style="display:none;max-width:800px;margin:0 auto;width:100%;padding:0 24px;"></div>
    </div>
    </div>
```

**File:** static/index.html (L440-490)
```html
      <div class="approval-card" id="approvalCard" role="alertdialog" aria-labelledby="approvalHeading" aria-describedby="approvalDesc">
        <div class="approval-inner">
          <div class="approval-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span id="approvalHeading" data-i18n="approval_heading">Approval required</span>
          </div>
          <div class="approval-desc" id="approvalDesc"></div>
          <div class="approval-cmd" id="approvalCmd"></div>
          <div class="approval-counter" id="approvalCounter" style="display:none;font-size:0.75em;opacity:0.6;margin-top:4px;"></div>
          <div class="approval-btns">
            <button class="approval-btn once" id="approvalBtnOnce" onclick="respondApproval('once')" title="Allow this one command (Enter)" data-i18n-title="approval_btn_once_title">
              <span class="approval-btn-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></span>
              <span class="approval-btn-label" data-i18n="approval_btn_once">Allow once</span>
              <kbd class="approval-kbd">↵</kbd>
            </button>
            <button class="approval-btn session" id="approvalBtnSession" onclick="respondApproval('session')" title="Allow for this session">
              <span class="approval-btn-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
              <span class="approval-btn-label" data-i18n="approval_btn_session">Allow session</span>
            </button>
            <button class="approval-btn always" id="approvalBtnAlways" onclick="respondApproval('always')" title="Always allow this command pattern">
              <span class="approval-btn-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
              <span class="approval-btn-label" data-i18n="approval_btn_always">Always allow</span>
            </button>
            <button class="approval-btn deny" id="approvalBtnDeny" onclick="respondApproval('deny')" title="Deny — do not run this command">
              <span class="approval-btn-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
              <span class="approval-btn-label" data-i18n="approval_btn_deny">Deny</span>
            </button>
            <button class="approval-btn yolo" id="approvalSkipAll" onclick="toggleYoloFromApproval()" title="Skip all approvals this session" data-i18n-title="approval_skip_all_title">
              <span class="approval-btn-icon" aria-hidden="true">⚡</span>
              <span class="approval-btn-label" data-i18n="approval_skip_all">Skip all</span>
            </button>
          </div>
        </div>
      </div>
      <div class="clarify-card" id="clarifyCard" role="dialog" aria-labelledby="clarifyHeading" aria-describedby="clarifyQuestion clarifyHint">
        <div class="clarify-inner">
          <div class="clarify-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17h.01"/><path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 2-3 4"/><circle cx="12" cy="12" r="10"/></svg>
            <span id="clarifyHeading" data-i18n="clarify_heading">Clarification needed</span>
            <span class="clarify-countdown" id="clarifyCountdown"></span>
          </div>
          <div class="clarify-question" id="clarifyQuestion"></div>
          <div class="clarify-choices" id="clarifyChoices"></div>
          <div class="clarify-response">
            <input class="clarify-input" id="clarifyInput" type="text" data-i18n-placeholder="clarify_input_placeholder" placeholder="Type your response…">
            <button class="clarify-submit" id="clarifySubmit" onclick="respondClarify()" data-i18n="clarify_send">Send</button>
          </div>
          <div class="clarify-hint" id="clarifyHint" data-i18n="clarify_hint">Pick a choice, or type your own answer below.</div>
        </div>
      </div>
      <div class="composer-terminal-panel" id="composerTerminalPanel" hidden>
```

**File:** static/index.html (L530-720)
```html
      <div class="composer-box" id="composerBox">
        <div class="cmd-dropdown" id="cmdDropdown"></div>
        <div class="drop-hint" id="dropHint">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Drop files to upload to workspace
        </div>
        <div class="attach-tray" id="attachTray"></div>
        <div class="mic-status" id="micStatus" style="display:none"><span class="mic-dot"></span> Listening…</div>
        <div class="voice-mode-bar" id="voiceModeBar" style="display:none">
          <span class="voice-mode-indicator" id="voiceModeIndicator"></span>
          <span class="voice-mode-label" id="voiceModeLabel"></span>
        </div>
        <textarea id="msg" rows="1" placeholder="Message Hermes…"></textarea>
        <div class="composer-footer">
          <div class="composer-left">
            <input type="file" id="fileInput" class="file-input-visually-hidden" multiple accept="image/*,text/*,application/pdf,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.md,.py,.js,.ts,.yaml,.yml,.toml,.csv,.sh,.txt,.log,.env,.xls,.xlsx,.doc,.docx,.zip,.tar,.gz,.tgz,.bz2,.xz">
            <button type="button" class="icon-btn has-tooltip" id="btnAttach" data-tooltip="Attach files">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <button class="icon-btn mic-btn has-tooltip" id="btnMic" data-tooltip="Dictate" data-i18n-title="voice_dictate" style="display:none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="1" width="6" height="12" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <button class="icon-btn voice-mode-btn has-tooltip" id="btnVoiceMode" data-tooltip="Voice mode" data-i18n-title="voice_mode_toggle" style="display:none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <!-- Lucide audio-lines: signals two-way voice conversation, matches ChatGPT/Gemini convention. -->
                <path d="M2 10v4"/>
                <path d="M6 6v12"/>
                <path d="M10 3v18"/>
                <path d="M14 8v8"/>
                <path d="M18 5v14"/>
                <path d="M22 10v4"/>
              </svg>
            </button>
            <div class="composer-divider" aria-hidden="true"></div>
            <button class="yolo-pill" id="yoloPill" type="button" onclick="cmdYolo()" style="display:none" title="YOLO mode — click to disable" data-i18n-title="yolo_pill_title_active">
              <span class="yolo-pill-icon" aria-hidden="true">⚡</span>
              <span class="yolo-pill-label" data-i18n="yolo_pill_label">YOLO</span>
            </button>
            <div id="profileChipWrap" class="composer-profile-wrap">
              <button class="composer-profile-chip profile-chip" id="profileChip" type="button" onclick="toggleProfileDropdown()" title="Switch profile">
                <span class="composer-profile-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                <span class="composer-profile-label" id="profileChipLabel">default</span>
                <span class="composer-profile-chevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
              </button>
            </div>
            <div class="composer-ws-wrap">
              <div class="composer-workspace-group ws-chip" id="composerWorkspaceGroup" role="group" aria-label="Workspace controls">
                <button class="composer-workspace-files-btn" id="btnWorkspacePanelToggle" type="button" onclick="toggleWorkspacePanel()" title="Show workspace panel" aria-pressed="false" aria-label="Toggle workspace files panel">
                  <span class="composer-workspace-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
                </button>
                <button class="composer-workspace-chip" id="composerWorkspaceChip" type="button" onclick="toggleComposerWsDropdown()" title="Switch workspace" disabled>
                  <span class="composer-workspace-label" id="composerWorkspaceLabel"></span>
                  <span class="composer-workspace-chevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
                </button>
              </div>
            </div>
            <button class="icon-btn composer-mobile-config-btn" id="composerMobileConfigBtn" type="button" onclick="toggleMobileComposerConfig()" title="Workspace, model, reasoning, and context settings" aria-label="Workspace, model, reasoning, and context settings" aria-haspopup="true" aria-expanded="false" aria-controls="composerMobileConfigPanel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
              <span class="composer-mobile-ctx-badge" id="composerMobileCtxBadge" aria-hidden="true" style="display:none">0</span>
            </button>
            <div class="composer-model-wrap">
              <button class="composer-model-chip" id="composerModelChip" type="button" onclick="toggleModelDropdown()" title="Conversation model">
                <span class="composer-model-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg></span>
                <span class="composer-model-label" id="composerModelLabel"></span>
                <span class="composer-model-chevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
              </button>
              <select id="modelSelect" class="composer-model-select" title="Conversation model" aria-hidden="true" tabindex="-1">
              <optgroup label="OpenAI">
                <option value="openai/gpt-5.4-mini">GPT-5.4 Mini</option>
                <option value="openai/gpt-4o">GPT-4o</option>
                <option value="openai/o3">o3</option>
                <option value="openai/o4-mini">o4-mini</option>
              </optgroup>
              <optgroup label="Anthropic">
                <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6</option>
                <option value="anthropic/claude-sonnet-4-5">Claude Sonnet 4.5</option>
                <option value="anthropic/claude-haiku-3-5">Claude Haiku 3.5</option>
              </optgroup>
              <optgroup label="Other">
                <option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                <option value="google/gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                <option value="deepseek/deepseek-v4-flash">DeepSeek V4 Flash</option>
                <option value="deepseek/deepseek-v4-pro">DeepSeek V4 Pro</option>
                <option value="deepseek/deepseek-chat-v3-0324">DeepSeek V3 (legacy)</option>
                <option value="meta-llama/llama-4-scout">Llama 4 Scout</option>
              </optgroup>
            </select>
            </div>
            <button class="provider-quota-chip" id="providerQuotaChip" type="button" title="Provider quota" onclick="switchPanel('settings');switchSettingsSection('providers')" hidden>
              <span class="provider-quota-chip-dot" aria-hidden="true"></span>
              <span class="provider-quota-chip-label" id="providerQuotaChipLabel"></span>
            </button>
            <div class="composer-reasoning-wrap" id="composerReasoningWrap" style="display:none">
              <button class="composer-reasoning-chip" id="composerReasoningChip" type="button" onclick="toggleReasoningDropdown()" title="Reasoning effort level">
                <span class="composer-reasoning-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg></span>
                <span class="composer-reasoning-label" id="composerReasoningLabel"></span>
                <span class="composer-reasoning-chevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
              </button>
            </div>
            <div class="composer-toolsets-wrap" id="composerToolsetsWrap">
              <button class="composer-toolsets-chip" id="composerToolsetsChip" type="button" onclick="toggleToolsetsDropdown()" title="Session toolsets">
                <span class="composer-toolsets-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>
                <span class="composer-toolsets-label" id="composerToolsetsLabel">Global</span>
                <span class="composer-toolsets-chevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
              </button>
            </div>
          </div>
          <div class="composer-right">
            <span class="composer-status" id="composerStatus" style="display:none"></span>
            <div class="ctx-indicator-wrap" id="ctxIndicatorWrap" style="display:none">
              <button class="ctx-indicator" id="ctxIndicator" type="button" aria-label="Context window usage" aria-describedby="ctxTooltip">
                <span class="ctx-ring">
                  <svg class="ctx-ring-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <circle class="ctx-ring-track" cx="12" cy="12" r="9.75"></circle>
                    <circle class="ctx-ring-value" id="ctxRingValue" cx="12" cy="12" r="9.75"></circle>
                  </svg>
                  <span class="ctx-ring-center" id="ctxPercent">0</span>
                </span>
              </button>
              <div class="ctx-tooltip" id="ctxTooltip" role="tooltip" aria-hidden="true">
                <div class="ctx-tooltip-title">Context window</div>
                <div class="ctx-tooltip-line" id="ctxTooltipUsage"></div>
                <div class="ctx-tooltip-line" id="ctxTooltipTokens"></div>
                <div class="ctx-tooltip-line" id="ctxTooltipThreshold"></div>
                <div class="ctx-tooltip-line" id="ctxTooltipCost" style="display:none"></div>
                <div class="ctx-tooltip-compress" id="ctxTooltipCompress" style="display:none">
                  <button class="ctx-compress-btn" id="ctxCompressBtn" type="button"></button>
                </div>
              </div>
            </div>
            <span class="bg-badge" id="bgBadge" style="display:none" title="Background tasks running">0</span>
            <button class="send-btn has-tooltip has-tooltip--left" id="btnSend" data-tooltip="Send message" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            </button>
          </div>
          <div class="composer-mobile-config-panel" id="composerMobileConfigPanel" aria-label="Workspace, model, reasoning, and context settings">
            <button class="composer-mobile-config-action" id="composerMobileWorkspaceAction" type="button" onclick="toggleComposerWsDropdown()" title="Switch workspace">
              <span class="composer-workspace-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
              <span class="composer-mobile-config-copy"><span class="composer-mobile-config-kicker" data-i18n="composer_mobile_workspace">Workspace</span><span class="composer-mobile-config-value" id="composerMobileWorkspaceLabel"></span></span>
            </button>
            <button class="composer-mobile-config-action" id="composerMobileModelAction" type="button" onclick="toggleModelDropdown()" title="Conversation model">
              <span class="composer-model-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg></span>
              <span class="composer-mobile-config-copy"><span class="composer-mobile-config-kicker" data-i18n="composer_mobile_model">Model</span><span class="composer-mobile-config-value" id="composerMobileModelLabel"></span></span>
            </button>
            <button class="composer-mobile-config-action" id="composerMobileReasoningAction" type="button" onclick="toggleReasoningDropdown()" title="Reasoning effort level" style="display:none">
              <span class="composer-reasoning-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg></span>
              <span class="composer-mobile-config-copy"><span class="composer-mobile-config-kicker" data-i18n="composer_mobile_reasoning">Reasoning</span><span class="composer-mobile-config-value" id="composerMobileReasoningLabel"></span></span>
            </button>
            <div class="composer-mobile-config-action composer-mobile-context-action" id="composerMobileContextAction" role="group" aria-label="Context window" style="display:none">
              <span class="composer-mobile-config-copy composer-mobile-context-copy">
                <span class="composer-mobile-config-kicker" data-i18n="composer_mobile_context">Context</span>
                <span class="composer-mobile-config-value" id="composerMobileContextUsage"></span>
                <span class="composer-mobile-context-detail" id="composerMobileContextTokens"></span>
                <span class="composer-mobile-context-detail" id="composerMobileContextThreshold"></span>
                <span class="composer-mobile-context-detail" id="composerMobileContextCost" style="display:none"></span>
              </span>
              <button class="ctx-compress-btn composer-mobile-context-compress" id="composerMobileCtxCompressBtn" type="button" style="display:none"></button>
            </div>
          </div>
          <div class="profile-dropdown" id="profileDropdown"></div>
          <div class="ws-dropdown ws-dropdown-footer" id="composerWsDropdown"></div>
          <div class="composer-reasoning-dropdown" id="composerReasoningDropdown">
            <div class="reasoning-option" data-effort="none">None</div>
            <div class="reasoning-option" data-effort="minimal">Minimal</div>
            <div class="reasoning-option" data-effort="low">Low</div>
            <div class="reasoning-option" data-effort="medium">Medium</div>
            <div class="reasoning-option" data-effort="high">High</div>
            <div class="reasoning-option" data-effort="xhigh">Extra High</div>
          </div>
          <div class="composer-toolsets-dropdown" id="composerToolsetsDropdown">
            <div class="toolsets-dropdown-desc" id="toolsetsDropdownDesc"></div>
            <div class="toolsets-dropdown-state" id="toolsetsDropdownState"></div>
            <div class="toolsets-dropdown-input-row">
              <input type="text" id="toolsetsInput" class="toolsets-input" placeholder="" autocomplete="off">
            </div>
            <div class="toolsets-dropdown-actions">
              <button type="button" class="toolsets-action-btn toolsets-apply-btn" id="toolsetsApplyBtn">Apply</button>
              <button type="button" class="toolsets-action-btn toolsets-clear-btn" id="toolsetsClearBtn">Clear (global)</button>
            </div>
          </div>
          <div class="model-dropdown" id="composerModelDropdown"></div>
        </div>
        <div class="upload-bar-wrap" id="uploadBarWrap"><div class="upload-bar" id="uploadBar"></div></div>
      </div>
    </div>
    </div><!-- /#mainChat -->
```

**File:** api/streaming.py (L43-51)
```python
# Global lock for os.environ writes. Per-session locks (_agent_lock) prevent
# concurrent runs of the SAME session, but two DIFFERENT sessions can still
# interleave their os.environ writes. This global lock serializes the env
# save/restore — held only briefly across the env-mutation critical section,
# NOT for the entire agent run. The agent runs outside the lock; the finally
# block re-acquires to atomically restore env vars. See narrow-lock pattern
# in _run_agent_streaming (line ~2719) and profile_env_for_background_worker
# (api/profiles.py:715).
_ENV_LOCK = threading.Lock()
```
