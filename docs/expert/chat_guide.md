对照刚才那张 UI（左侧已出现 session、中间 user 气泡 +「专家正在分析…」），当前链路如下。

---

## 1. 与截图对应的 UI 状态

| 截图元素 | 组件 / 状态来源 |
|---------|----------------|
| 左侧 Chats 高亮项 | `session-cache` + sidebar；`task_id` 到手后 `materializeExpertSessionTranscript` 写入 |
| 中间 user 蓝气泡 | `Chat.tsx` 在 `taskId != null` 时镜像 `expertTranscriptBubbleIds().user` |
| 中间「专家正在分析…」 | 同 effect 的 assistant 气泡；文案来自 `buildExpertTranscriptAssistantContent`（running 且尚无 `progressMessage`） |
| 输入区上方 **不再** 有 ExpertRunCard | `taskId` 已有 → panel 只渲染 `taskId == null` |
| 右侧 SESSION FILES 空 | 终态后才可能拉 artifacts；running 阶段本来就空 |

---

## 2. 创建 Task：`/expert/mcp/market-profiling`

### 交互链（Renderer → Main → Gateway）

```
ExpertContextControl / ExpertSelector
  → 选中 expertSlug=market-profiling, skillName=…（如 customer-profiling）
ChatInput 发送
  → Chat.tsx：expertModeActive + silent-call 门禁
  → buildExpertRequest() → ExpertRequest
  → window.hermesAPI.expert.start({ request })
expert-ipc → ExpertRunService.start()
  → beginAccepted() → gateway.callSkill()
```

### `callSkill` 实际打的接口（有序）

| 顺序 | Method | Path | 用途 |
|------|--------|------|------|
| 1 | GET | `/api/v1/expert/health` | 网关健康 |
| 2 | JSON-RPC `tools/list` | `/api/v1/expert/mcp` | Catalog（slug=`market-profiling` 须 ready） |
| 3 | JSON-RPC `tools/list` | `/api/v1/expert/mcp/market-profiling` | Skill 列表 + silent-call 校验 |
| 4 | **JSON-RPC `tools/call`** | **`/api/v1/expert/mcp/market-profiling`** | **创建 HermesTask** |

`tools/call` body 要点：

- `name`: skillName（UI 所选，不是 path）
- `arguments.prompt`: 用户输入
- Header：`Idempotency-Key` = `clientRequestId`

Accept 回包（`structuredContent`）关键字段：

- `task_id`
- `event_stream`（常已带 `?token=…`）
- `event_token_url` / `result_url` / `artifact_url`

`beginAccepted` 拿到后：`updateProjection({ taskId, phase: "running" })` → 物化 session + 气泡「专家正在分析…」。

---

## 3. Subscribe SSE：`/hermes/tasks/{id}/events?token=…`

### 谁订阅

**仅 Main**：`ExpertRunService.consumeSse()`。Renderer **不**直连 SSE，只收 IPC `onProjectionChanged`。

### URL 怎么拼

```
path = run.accepted.event_stream   // 优先：Accept 返回的相对路径（可含 token）
     || gateway.buildEventsPath(taskId)
        // → /api/v1/hermes/tasks/{taskId}/events
```

请求：`openAuthorizedGet(path, { Accept: text/event-stream, Last-Event-ID? })`  
→ 即对完整 URL 做 GET（Bearer JWT + 若 `event_stream` 已含 query token 则一并带上）。

### 与 Postman 写法的对应关系

| Postman | 当前 Work 实现 |
|---------|----------------|
| `GET …/hermes/tasks/{id}/events?token={{event_token}}` | **优先直接用 Accept 的 `event_stream`**（通常已含 token） |
| 另调 `events-token` 拿 token | Client 有 `getEventsToken()` → `GET …/events-token`，**当前 run 路径未调用** |
| 解析 `task.started` / `task.progress` / `task.completed`… | `applyEvent`；`task.progress.message` → `progressMessage` → 刷 assistant 气泡 |

兜底：`ensureTerminalWatch` 轮询  
`GET /api/v1/hermes/tasks/{id}/snapshot`（及终态 `result` / `artifacts`）。

---

## 4. 组件 × 接口清单（按职责）

| 层 | 组件 / 模块 | 对接口 / IPC |
|----|-------------|--------------|
| 选 Expert | `ExpertContextControl` / `ExpertSelector` / `WorkContextChip` | `expert:get-health`、`listCatalog`、`listSkills`、`refreshCatalog` |
| 提交 | `Chat.tsx` + `ChatInput` | `expert:start` |
| 状态卡（仅 pre-task） | `ExpertRunCard` | `expert:cancel` / `retry` |
| 气泡镜像 | `Chat.tsx`（`expertProjections` effect） | 订阅 `onProjectionChanged`（无 HTTP） |
| Session 落库 | `expert-session-materialize` | 本地 `state.db` + `sessions.json` |
| 编排 | `expert-run-service` | `callSkill` + SSE + poll |
| HTTP | `expert-gateway-client` | 上表 health / mcp / hermes/tasks/* |
| 桥 | `expert-ipc` + preload `hermesAPI.expert` | 窄 DTO，不暴露 JWT/URL 给 Renderer |

---

## 5. 一句话结论

- **创建 task**：UI 选 `market-profiling` + skill → Main `tools/call` 打 **`POST /api/v1/expert/mcp/market-profiling`**，拿 `task_id` + `event_stream`。
- **订 SSE**：Main 用 Accept 返回的 **`event_stream`（含 token 则等同 Postman 那条）** 拉 `text/event-stream`；`events-token` 接口已封装但**现网 run 未单独走**；UI 只吃 projection，不碰 SSE URL。