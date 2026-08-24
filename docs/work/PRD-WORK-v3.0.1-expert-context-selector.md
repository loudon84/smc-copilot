---
work_item_id: WORK-EXPERT-CONTEXT-V3.0.1
version: v3.0.1
status: APPROVED
target_branch: work/prd-3.0
review_verdict: PASS
approved_at: 2026-08-24T15:25:00+08:00
---

# WORK PRD v3.0.1 — Expert Work Context Selector UI Refactor

本稿定义 `apps/work` Expert Context 选择、展示、健康检查与调用门禁的目标架构。不得把 SSE、Task、Queue、Run Projection、continuation 或 artifact 下载的生产 Owner 迁走。功能迁移只消费 WORK-EXPERT-CONTRACT v1.0.2 的 health 与 MCP annotations；Hermes Task / SSE / Artifact 语义 KEEP。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Repository | `smc-copilot` |
| Branch | `work/prd-3.0` |
| Checkout | `dd92294`（`优化 PRD skill from agent`） |
| Affected subsystem | `apps/work` |
| Architecture index | `apps/work` `lat.md/expert-execution#Expert execution` |
| Current Consumer Contract | 源码 `WORK_EXPERT_CONTRACT_VERSION = "1.0.1"`（`apps/work/src/shared/expert.ts`） |
| Target Contract | **WORK-EXPERT-CONTRACT v1.0.2** |
| Immutable tag | `work-expert-contract-v1.0.2` |
| Peeled tag target commit | `ed408c354539eab3f4cabb119fbbc3df4b95efad` |
| Provider checksum manifest（tag 内路径） | `nodeskclaw-backend/contracts/work-expert/v1.0.2/SHA256SUMS` |
| Consumer Lock 复制目标（本仓库） | `contracts/work-expert/v1.0.2/SHA256SUMS` |

v1.0.2 的合同消费必须基于不可变 tag `work-expert-contract-v1.0.2`（peeled commit `ed408c354539eab3f4cabb119fbbc3df4b95efad`），不使用 Provider `main`。`manifest.json` 中 `tagTargetCommit === null` 不用于判断 tag 是否发布。`loadGate=unmet` 不在本 PRD Scope；不得把 health `ok === true` 映射为 load gate 已满足。

### v1.0.2 钉定范围

Consumer Lock 与功能迁移范围必须分开：

| 范围 | 本 PRD 处理 |
|---|---|
| Contract identity lock | 锁 `work-expert-contract-v1.0.2` + peeled commit `ed408c354539eab3f4cabb119fbbc3df4b95efad` + 同 tag 完整 `SHA256SUMS` |
| 本 PRD 功能迁移 | `GET /api/v1/expert/health`、Catalog/Skill `tools/list` annotations、调用 identity、reject / silent-call 规则 |
| KEEP、不重新解释 | Hermes Task、SSE、Artifact、Queue、continuation 等 v3.0 已消费语义 |
| Provider 非本 PRD Scope | Provider release pipeline、manifest 回写、CI/deploy、`loadGate` 关闭 |

### Consumer Lock 实施产物

本 PRD 新增**非生产治理产物**，只记录 Consumer 对外部合同的不可变引用，不复制 Provider schema Owner：

- `contracts/work-expert/v1.0.2/consumer-lock.json`
- `contracts/work-expert/v1.0.2/SHA256SUMS`

`consumer-lock.json` 至少记录：

```json
{
  "contractName": "WORK-EXPERT-CONTRACT",
  "contractVersion": "1.0.2",
  "providerRepository": "loudon84/nodeskclaw",
  "tagName": "work-expert-contract-v1.0.2",
  "tagTargetCommit": "ed408c354539eab3f4cabb119fbbc3df4b95efad",
  "providerSha256sumsPath": "nodeskclaw-backend/contracts/work-expert/v1.0.2/SHA256SUMS",
  "sha256sumsPath": "SHA256SUMS"
}
```

路径约定：

- `providerSha256sumsPath`：不可变 tag 树内的源文件路径。
- `sha256sumsPath`：相对本仓库 `consumer-lock.json` 所在目录，即 `contracts/work-expert/v1.0.2/SHA256SUMS`。

本仓库该文件必须逐字复制自 tag 内 `providerSha256sumsPath`；它是 lock evidence，不成为合同 schema SOT。实施测试至少核对本仓库 `WORK_EXPERT_CONTRACT_VERSION === "1.0.2"` 与 lock version 一致，并核对本 PRD 实际消费的关键 artifact checksum 存在于该复制文件。

## Architecture Summary

- Selection truth 与发送判定：`Chat.tsx`。Catalog/Skill UI 读取生命周期：`ExpertContextControl`。HTTP / JWT / cache / `tools/call` 门禁：`ExpertGatewayClient.callSkill()`。
- `Layout.tsx` KEEP 每 run 一挂载、后台保持挂载。仅 `ChatProps.active === true` 发 Chip health/catalog IPC；`onChange` 不得写其它 run。
- 未认证 `authGeneration` KEEP `"user:unknown"`。`getHealth` 复用 `openAuthorizedGet` 的 `redirect: "error"` 与 `withAuthRetry`。2xx 非法 JSON 不得合成 HTTP 500。
- 不从 Desktop import Chip/Popover；不新增第二套 gateway、IPC wrapper、Context store、队列或 Projection Owner。
- Catalog/Skill UI 读取从 `ExpertSelector` REPLACE 到 Control；生产路径 REMOVE `slug = tool.name`。
- Consumer Lock 只锁 v1.0.2 immutable identity，不成为 schema SOT。`loadGate=unmet` 非 Scope。

## Source Anchors

- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`：`expertSelection`（`expertSlug` / `skillName`）、`expertModeActive`（二者皆有才为 true）、`authGeneration`、`handleSubmitOrQueue`、`submitExpert`、`toolbarExtras`。仅完整 Context 才走 Expert；只选 Expert 时落入 Local Chat。`handleSubmitOrQueue` 在 slash 之前调用 `parseBackgroundCommand`（`/btw` `/bg` `/background`）。`ChatInput.onQuickAsk` 不经过 `handleSubmitOrQueue`。`authGeneration` 仅 mount 时 `window.desktopAuth.getState()`，无订阅。`chat-toolbar-local-controls` 在 `expertModeActive` 时以 `opacity` / `pointerEvents` 包裹 `ModelPicker`、`ReasoningEffortPicker`、fast-mode、`ContextFolderChip`。
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx`：`runs.map` 为每个 run 挂载 `<Chat>`，`active={run.runId === activeRunId}`；后台 session 保持挂载。`ChatProps.active` 已存在；health/catalog 的 window `focus` 与首次 IPC 仅 `active === true` 发出。每个 Chat 自有 `expertSelection`，Control `onChange` 只写宿主实例。
- `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx`：`toolbarExtras`；`onQuickAsk`。
- `apps/work/src/renderer/src/screens/Chat/hooks/useChatActions.ts`：`parseBackgroundCommand`。
- `apps/work/src/renderer/src/modules/expert/ExpertSelector.tsx`：Catalog/Skill 读取、error、双原生 `<select>`。Skill effect 只用 `cancelled`。`window.hermesAPI.expert.listCatalog()` / `listSkills(slug)`。
- `apps/work/src/renderer/src/modules/expert/ExpertRunCard.tsx`：`window.hermesAPI.expert.retry(...)`；重建 request 时 `attachmentRefs: []`；失败目前 `console.warn`。
- `apps/work/src/shared/expert.ts`：`WORK_EXPERT_CONTRACT_VERSION = "1.0.1"`。`EXPERT_IPC_CHANNELS`：`expert:list-catalog` 等，无 health/refresh。
- `apps/work/src/main/expert/expert-gateway-client.ts`：`parseCatalogTools()` 缺 slug 时用 `tool.name`。`parseSkillTools()` 丢弃 skill annotations。`httpGetData()` → `unwrapApiData()`。`readJson()` 非法 JSON 返回文本。无 `getHealth()`。`clearCache()` 清 60s TTL。`callSkill()` 无 health / annotations 门禁。
- `apps/work/src/main/expert/expert-ipc.ts`：`registerExpertIpc()`；`assertSender()` + `requireAuthSession()`；`assertAuthGeneration()` 当前接受 `user:${userId}` 或裸 `userId` 字符串，因此本 PRD 不改变 `authGeneration` wire format。
- `apps/work/src/preload/expert-api.ts`：`window.hermesAPI.expert`。
- `apps/work/src/shared/auth/auth-contract.ts`：现有 `DesktopAuthAPI.getState()` / `login()` / `logout()` / `refresh()` 与 `DesktopAuthState`；目标在同一接口增加 `onStateChanged(listener): () => void`，不增加第二套 Auth API。
- `apps/work/src/preload/auth-api.ts`：现有 `authApi` 仅 `ipcRenderer.invoke(...)`；目标增加 `AUTH_STATE_CHANGED_CHANNEL` 的 `ipcRenderer.on` 订阅与 unsubscribe。
- `apps/work/src/main/auth/auth-ipc.ts`：现有 `registerAuthIpc()`、`buildAuthState()`；login 调 `writeStoredSession()` + `restoreExpertSubsystemAfterAuth()`，logout 调 `disposeExpertSubsystem()` + `clearStoredSession()`。目标由该 IPC Owner 将 Main 内部 session-change 转为公开 `DesktopAuthState` 推送。
- `apps/work/src/main/auth/token-store.ts`：现有 `writeStoredSession()` / `clearStoredSession()` 是 session 持久化与内存 cache Owner。目标在该 Owner 内增加 `subscribeStoredSessionChanges()`，在 write / clear 完成内存状态切换后通知 Main listener；listener 参数留在 Main，不向 Renderer 暴露 token。
- `apps/work/src/main/auth/ensure-access-token.ts`：`performRefresh()` 在无 refresh token 或 refresh 失败时调用 `clearStoredSession()`；`refreshStoredAccessToken()` / `ensureFreshAccessToken()` 可能从 Expert HTTP 路径触发。因此状态推送必须覆盖 token-store clear，而不能只挂在 `auth:logout` handler。
- `apps/work/src/main/app/start.ts#startMainProcess()`：当前调用 `registerAuthIpc()`，同文件已有 `mainWindow` 与 `registerExpertIpc({ getMainWindow: () => mainWindow })` 模式。目标将 Auth 注册改为 `registerAuthIpc({ getMainWindow: () => mainWindow })`，由既有 Main Window Owner 提供推送目标；不在 auth 模块新建窗口注册表。
- `apps/desktop/src/renderer/src/modules/chat/components/composer/WorkContextChip.tsx`：仅参考；禁止 import；禁止 `remote` 生产类型。


## Implementation Symbols / Write Paths

本节锁定本 PRD 依赖的当前源码符号与目标新增符号。不得另造平行接口或第二 Production Owner。

### Selection write path

当前唯一 truth：

- `Chat.tsx#expertSelection`
- `Chat.tsx#setExpertSelection`
- `ExpertSelectorProps.value`
- `ExpertSelectorProps.onChange`

目标 `ExpertContextControlProps` 必须是受控接口：

```ts
interface ExpertContextControlProps {
  value: ExpertSelection;
  onChange: (next: ExpertSelection) => void;
  authGeneration: string;
  active: boolean;
  onGatewayStatusChange: (status: ExpertGatewayStatus) => void;
  onSelectedCallabilityChange: (
    snapshot: SelectedCallability | null,
  ) => void;
}
```

`Chat.tsx` 直接传：

```tsx
value={expertSelection}
onChange={setExpertSelection}
active={active}
```

Control 不得 `useState<ExpertSelection>` 保存第二份 truth。只有两类动作允许调用 `onChange`：

1. 用户在受控 Selector 中改变 Expert / Skill；
2. 最新 revision 的 Refresh / Catalog / Skill reconciliation 发现当前 selection 已失效。

修正规则固定：

- 当前 Expert 不在最新合法 Catalog：`onChange({ expertSlug: null, skillName: null })`；
- Expert 仍存在但当前 Skill 不在该 Expert 最新合法 Skills：`onChange({ expertSlug: value.expertSlug, skillName: null })`；
- selection 仍合法：不得回调；
- revision 已过期或组件已卸载：不得回调。

### Auth state push path

当前符号：

- `DesktopAuthAPI`
- `authApi`
- `startMainProcess()` / `mainWindow`
- `registerAuthIpc()`
- `buildAuthState()`
- `writeStoredSession()`
- `clearStoredSession()`
- `performRefresh()`
- `refreshStoredAccessToken()`
- `ensureFreshAccessToken()`

目标新增符号：

- `AUTH_STATE_CHANGED_CHANNEL = "auth:state-changed"`（shared auth contract owner）；
- `subscribeStoredSessionChanges(listener)`（`token-store.ts` Main 内部订阅）；
- `registerAuthIpc({ getMainWindow })`（复用 `startMainProcess()` 现有 `mainWindow` Owner）；
- `DesktopAuthAPI.onStateChanged(listener): () => void`；
- preload `authApi.onStateChanged`。

数据流唯一：

```text
writeStoredSession / clearStoredSession
→ token-store Main 内部 session-change
→ registerAuthIpc({ getMainWindow }) 的唯一 subscriber
→ toPublicState(session, readAuthEndpointConfig())
→ getMainWindow()?.webContents.send(AUTH_STATE_CHANGED_CHANNEL, publicState)
→ preload DesktopAuthAPI.onStateChanged
→ Chat.tsx
```

Renderer 只能收到 `DesktopAuthState`，不得收到 `StoredAuthSession`、access token 或 refresh token。

`Chat.tsx` 初始仍用 `getState()`；随后订阅 `onStateChanged()`。`authGeneration` 在本 PRD 中保持既有 **public auth identity key** 语义与 wire format：

- authenticated + `user.id` → `user:${user.id}`；
- unauthenticated → `user:unknown`；
- refresh success 且 user 不变 → 值不变，不触发 Control auth revision；
- refresh failure → `clearStoredSession()` → `user:unknown`；
- logout → `user:unknown`；
- login → `user:${user.id}`。

不得追加本地 generation counter，因为 Main `expert-ipc.ts#assertAuthGeneration()` 当前只接受 `user:${userId}` 或裸 `userId` 字符串（`assertAuthGeneration` 现有两种形态）。

### Consumer Lock write path

新增治理目录：

```text
contracts/work-expert/v1.0.2/
├── consumer-lock.json
└── SHA256SUMS
```

这两个文件只锁 Provider immutable release identity，不成为 Expert schema / DTO / parser 的第二 Owner。


## Current Capability Inventory

| Capability | Existing Owner | Entry Point | Current Behaviour | Existing Tests |
|---|---|---|---|---|
| Context 选择 truth 与提交路由 | `Chat.tsx` | `handleSubmitOrQueue`；`expertSelection` | Slash 优先；不完整时走 Local Chat；无 gateway / callability 门禁 | `Chat.layout.test.tsx` 不覆盖该路由 |
| 后台提问入口 | `Chat.tsx` / `ChatInput.tsx` | `parseBackgroundCommand`；`onQuickAsk` | 不走 Expert `start`；已选 Expert 时仍可发本地后台 | `parseBackgroundCommand.test.ts` |
| 本地工具栏控件 | `Chat.tsx` | `chat-toolbar-local-controls` | 仅完整 Context 时禁用四个控件 | 无专门断言 |
| `authGeneration` 更新 | `Chat.tsx` | mount `desktopAuth.getState()` | 只有首次读取；没有 public auth identity change 订阅 | 无 |
| Toolbar Expert UI | `ExpertSelector.tsx` | `toolbarExtras` | 双原生 `<select>` | 无 Chip/Popover 测试 |
| 多实例 Chat 挂载 | `Layout.tsx` | `runs.map` + `ChatProps.active` | 每个 run 一个保持挂载的 `<Chat>`；仅 `active={run.runId === activeRunId}` 可见；后台实例仍会跑 effect | `Layout` 会话切换测试不覆盖 Expert health |
| Catalog/Skill UI 读取生命周期 | `ExpertSelector.tsx` | `listCatalog` / `listSkills` | `cancelled` only；无 Refresh；无单一 revision | 无 revision 测试 |
| Gateway HTTP、JWT、MCP、cache | `expert-gateway-client.ts` | `listCatalog` / `listSkills` / `callSkill` / `clearCache` | slug 回填 `tool.name`；无调用门禁 | 成功路径测试，无 v1.0.2 拒绝 |
| Health | 无 | `GET /api/v1/expert/health` | 无 `getHealth`；`httpGetData` 不能解析直出 JSON | 无 |
| 静默调用谓词 | 无 | 不适用 | 规则未编码 | 无 |
| Auth 状态推送 | `auth-contract.ts` / `auth-ipc.ts` / `token-store.ts` | `DesktopAuthAPI`；`writeStoredSession` / `clearStoredSession` | Renderer 不能订阅；refresh 失败可在 `performRefresh` 中直接 clear session，绕过显式 logout handler | 无 Chat 订阅 / refresh-failure-clear 推送测试 |
| 手动刷新 | `clearCache()` | 无 IPC | Renderer 无法要求清 cache | 无 |
| IPC sender/auth 桥 | `expert-ipc.ts` | `registerExpertIpc()` | 现有 channel 有 sender/auth | validation 测试不跑真实 handler |
| Expert 启动 | `submitExpert` → `expert.start` → `callSkill` | `handleSubmitOrQueue` / queue drain | drain 只查 `authGeneration` | 无 annotations/health |
| Expert 重试 | `ExpertRunCard` → `expert.retry` → `callSkill` | 按钮 | 绕过 Chat；`attachmentRefs: []` | 失败仅 console.warn |
| Expert 取消 / 投影 / SSE / Queue / continuation / artifact | 现有 v3.0 Owner | 现有 IPC | 与本 UI 重构正交 | 现有测试 |
| Desktop Chip/Popover | Desktop renderer | 不适用 | 参考；`remote` 不可用；禁止生产复用 | Desktop 自有测试 |

## 状态 / 不变量清单

禁止把下列 Capability 压进同一个 enum。

| State / Invariant | 含义 | Owner | 作用 |
|---|---|---|---|
| Gateway Health | gateway 是否按合同可达且 payload 合法 | `getHealth` 解析；Control 映射 `ExpertGatewayStatus` | 只表示服务健康。`ok === true` ≠ item 可调用，≠ `loadGate` 已满足 |
| Context 完整性 | 是否选了 Expert+Skill | `Chat.tsx` `expertSelection` | `INCOMPLETE` / `READY` / `LOCAL` |
| Catalog item 可展示 | 是否进入 Catalog 列表 | `parseCatalogTools` | kind/slug/计数非法则拒绝该条 |
| Item status | Expert/Skill 是否 `ready` | parser → DTO | `ready` 可用；`offline` 不可用；缺失/未知不得当 ready |
| Call enabled | 是否允许 `tools/call` | `callSkill` 强制执行 | `callEnabled !== true` 禁止调用；仍可列表展示 |
| Silent-call allowlist | 是否允许无 Permission UI 的静默调用 | `canSilentCallExpertSkill` 定义；`callSkill` 强制执行 | 见 Behaviour。P0 无 Permission 选择器 |
| Request revision | 异步结果是否仍属于当前 UI 世代 | Control 单一计数器 | 过期结果不得 `setState` / 回调 |
| Selected callability 投影 | 当前选中项是否可静默调用（UI） | Control 计算并上送；Chat 只读缓存 | 仅用于提示；不得替代 `callSkill` |

## 执行入口闭环

强制执行 Owner 是 `ExpertGatewayClient.callSkill()`。每一次将导致 `tools/call` 的路径都必须经过它，包括 queue drain、retry、以及 Renderer 直接 `expert.start`。

`callSkill` 在发 HTTP `tools/call` 之前必须按顺序：

1. `getHealth()`（每次调用，不做 health TTL cache）。解析失败或 `ok !== true` → 抛错，**不得** `tools/call`。
2. 解析目标 Catalog item（cache 命中可用已解析 DTO，未命中则 `listCatalog`）。缺条目或 Catalog `status !== "ready"` → 抛错。
3. 解析目标 Skill item（cache 命中可用已解析 DTO，未命中则 `listSkills`）。`canSilentCallExpertSkill(catalogItem, skillItem) !== true` → 抛错。
4. 通过后才允许 `tools/call`。

```text
Chat Submit
→ handleSubmitOrQueue（UI 门禁）
→ submitExpert → expert.start → ExpertRunService.start → callSkill

Queue drain
→ submitExpert（只再比 authGeneration）
→ expert.start → callSkill
（drain 不重复跑 Chat UI 门禁；availability / callability 由 callSkill 强制执行）

Retry
→ ExpertRunCard → expert.retry → ExpertRunService.retry → callSkill

Direct IPC
→ expert.start / expert.retry → 同一 callSkill
```

`ExpertContextControl` 不得调用 `start` / `retry` / `cancel` / artifact download。Rehydrate / continuation 只恢复已有 Task 投影，不发起新的 `tools/call`，KEEP。

## Target End-State Inventory

| Capability | Production Owner | Allowed Implementations | Target Responsibility |
|---|---:|---|---|
| Context truth、UI 发送判定、request snapshot | `Chat.tsx` | 1 | 唯一持有 `expertSelection`。缓存只读 `gatewayStatus` 与 `SelectedCallability`。不完整 Context 不得 Local Chat。UI 可拦截；最终以 `callSkill` 为准。`expertSlug != null` 时禁用整个本地控件 wrapper。Queue drain 仍走 `submitExpert` |
| Auth identity key | `Chat.tsx` | 1 | 初始 `getState` + `onStateChanged`；保持 `user:${user.id}` / `user:unknown` wire format。identity 变化触发 Control revision；同用户 refresh success 不触发 |
| Context UI lifecycle、health 展示、revision、callability 投影 | `ExpertContextControl.tsx` | 1 | 唯一 UI 读取 health/catalog/skill/refresh；映射 `ExpertGatewayStatus`；计算 `SelectedCallability`；单一 revision。受控 `value/onChange/active`。仅 `active === true` 因 window focus 重拉 health/catalog；不持有第二份 selection truth；不调用执行 API |
| 多实例 Chat 挂载与 IPC 范围 | `Layout.tsx` + `Chat.tsx` | 1 | KEEP 每 run 一挂载、后台保持挂载。仅 `ChatProps.active === true` 发 Chip health/catalog IPC；`onChange` 不得写其它 run |
| Toolbar Chip / Popover / fields | Chip、Popover、`ExpertSelector` | 各 1 | Chip/Popover 为 Work 本地。Selector 纯受控 fields |
| 静默调用谓词 | `shared/expert.ts` `canSilentCallExpertSkill` | 1 | 唯一规则函数。Main `callSkill` 与 Control 投影必须调用它 |
| Health 解析、annotations 投影、cache、`tools/call` 强制门禁 | `expert-gateway-client.ts` | 1 | `getHealth` 直出路径。parser 拒绝规则。`callSkill` 执行 health + catalog status + `canSilentCallExpertSkill`。`refreshCatalog` = `clearCache()` 后 `listCatalog` |
| IPC 窄桥 | `expert-ipc.ts` / `expert-api.ts` | 1 | `expert:get-health`、`expert:refresh-catalog`；零网络参数 |
| Auth session-change 事件源 | `token-store.ts` | 1 | `writeStoredSession` / `clearStoredSession` 后通知 Main 内部 listener，覆盖显式 logout 与 refresh 失败清会话 |
| Auth 状态推送 | `auth-ipc.ts` / `auth-api.ts` / `auth-contract.ts` | 1 | `registerAuthIpc({ getMainWindow })` 将 session-change 转为 `DesktopAuthState`，复用 `startMainProcess#mainWindow` 推送 `AUTH_STATE_CHANGED_CHANNEL`；preload 暴露 `DesktopAuthAPI.onStateChanged`；不暴露 token |
| Consumer Contract Lock | `contracts/work-expert/v1.0.2/consumer-lock.json` + `SHA256SUMS` | 1 | 仅记录 v1.0.2 immutable release identity；不成为 Provider schema SOT |
| Expert 执行 / SSE / Task / Queue / Projection / continuation / artifact | 现有 v3.0 Owner | 1 | 保持协议。经 `callSkill` 获得门禁 |

## Change Classification

| Item | Action | Owner | Target State |
|---|---|---|---|
| `ChatInput.toolbarExtras` | KEEP | `ChatInput.tsx` | Composer 扩展点 |
| Expert SSE、Task、Queue、Projection、continuation、artifact | KEEP | 现有 v3.0 Owner | 不改职责和协议 |
| `assertSender()` / `requireAuthSession()` | KEEP | `expert-ipc.ts` | 新 channel 复用 |
| `Chat.tsx` 选择 truth | KEEP | `Chat.tsx` | 不把 Control 变成第二套 selection Owner |
| Retry `attachmentRefs: []` | KEEP | `ExpertRunCard.tsx` | 本 PRD 不修复附件丢失；行为保持现状 |
| `Layout.tsx` 多实例 Chat 挂载 | KEEP | `Layout.tsx` | 每 run 一个保持挂载的 `<Chat>`；`active={run.runId === activeRunId}` 已存在 |
| `Chat.tsx` 发送路由、本地 wrapper、后台入口、auth 订阅、active 门控 | MODIFY | `Chat.tsx` | 见 Behaviour。wrapper 四个控件整体随 `expertSlug` 禁用。`/btw` 与 `onQuickAsk` 在已选 Expert 时停止。把 `ChatProps.active` 传给 Control；仅 active 发 focus health IPC |
| `token-store.ts` | MODIFY | Auth session persistence Owner | 增加 `subscribeStoredSessionChanges`；`writeStoredSession` / `clearStoredSession` 统一触发 Main 内部通知 |
| `app/start.ts` | MODIFY | Main Window / startup Owner | `registerAuthIpc()` 改为 `registerAuthIpc({ getMainWindow: () => mainWindow })`；复用现有 `mainWindow`，不新增窗口 Owner |
| `DesktopAuthAPI` / auth IPC / preload | MODIFY | auth IPC/preload/contract | 增加 `AUTH_STATE_CHANGED_CHANNEL` + `onStateChanged`；`registerAuthIpc` 把 token-store 变化转成公开 `DesktopAuthState` |
| `ExpertSelector.tsx` 数据读取 | REPLACE | 见 Replacement / Removal Matrix | 只剩受控 fields |
| `expert.css` | MODIFY | Expert renderer | Chip/Popover/density/status；保留 Run Card/Timeline |
| `shared/expert.ts` | MODIFY | Shared DTO | annotations、Health DTO、`ExpertGatewayStatus`、`SelectedCallability`、IPC、`canSilentCallExpertSkill`、版本 `1.0.2` |
| `parseCatalogTools` / `parseSkillTools` | MODIFY | gateway client | v1.0.2 拒绝规则与投影 |
| `callSkill` | MODIFY | gateway client | `getHealth` + catalog `ready` + `canSilentCallExpertSkill`；失败不得 `tools/call` |
| `getHealth` | ADD（既有 Owner 内） | gateway client | 直出 JSON；不走 `httpGetData` / `unwrapApiData` |
| `refreshCatalog` IPC | ADD（既有 Owner 内） | gateway + IPC | Main `clearCache()` 后 `listCatalog` |
| `expert-ipc.ts` / `expert-api.ts` | MODIFY | IPC 桥 | 新 channel 零网络参数 |
| `ExpertRunCard.tsx` | MODIFY | Run Card | Retry 仍走 IPC；`callSkill` 拒绝必须可见。不改接到 Control。`attachmentRefs` KEEP |
| `ExpertRunService` | KEEP | 执行 Owner | start/retry 继续调用 `callSkill` |
| 现有测试文件 | MODIFY | 各测试 Owner | 见 Acceptance Criteria |
| `ExpertContextControl.tsx` | ADD | Expert renderer | health/catalog/skills/refresh/revision/callability 投影 |
| `WorkContextChip.tsx` / `WorkContextPopover.tsx` | ADD | Expert renderer | 禁止跨 App import |
| Context renderer tests | ADD | Expert renderer | keyboard、outside click、density、revision、删除修正、卸载、空 Catalog |
| `expert-ipc-registration` tests | ADD（测试文件） | IPC 测试 | 验证 `registerExpertIpc()` 真实 handler；不得新增平行 IPC Owner |
| `contracts/work-expert/v1.0.2/consumer-lock.json` | ADD（治理文件） | Consumer contract lock | 锁 tag + peeled commit + `SHA256SUMS` 相对路径；不复制 schema SOT |
| `contracts/work-expert/v1.0.2/SHA256SUMS` | ADD（治理文件） | Consumer contract lock | 从 immutable tag 原样复制完整 checksum 清单 |
| Auth 相关 tests | MODIFY / ADD（测试） | Existing auth test owner | 覆盖 login/logout、refresh success same identity、`performRefresh` 失败 clear session → Renderer state push、unsubscribe |

## Replacement / Removal Matrix

| Replaced capability | Current production path | New Owner | Switch condition | REMOVE |
|---|---|---|---|---|
| Catalog/Skill/error 的 UI 读取生命周期 | `ExpertSelector.tsx` `useEffect` + `window.hermesAPI.expert.listCatalog` / `listSkills` + `cancelled` | `ExpertContextControl.tsx` | `Chat.tsx` `toolbarExtras` 改挂 Control；Selector 只收 props | 删除 Selector 内一切 `window.hermesAPI` 与 `cancelled`-only skill effect。落地后不得并行 |
| Catalog 路由身份在 slug 缺失时改用 `tool.name` | `parseCatalogTools()` 生产分支 | 同一函数的拒绝分支 | 测试改为「缺 slug 则丢弃」后合并 | 生产删除 `slug = tool.name`。只允许出现在 tests/fixtures |

切换完成前不得长期并行两套 UI 读取 Owner。无 Compatibility Contract：不保留平行读取路径。

## New File Justification

- `ExpertContextControl.tsx`：Selector 不能同时当 fields 与 lifecycle Owner；Chat 不能吞下 catalog 列表。
- `WorkContextChip.tsx` / `WorkContextPopover.tsx`：禁止 Desktop import；Desktop `remote` 与本 PRD 状态合同不同。
- Context renderer tests：现有测试未覆盖 Control。
- IPC 注册测试：验证真实 `registerExpertIpc()`，不是新生产 Owner。
- `contracts/work-expert/v1.0.2/consumer-lock.json` + `SHA256SUMS`：Provider 合同位于外部仓库；Consumer 需要一个可审计的不可变版本锁。这里只保存 release identity/checksum evidence，不复制 OpenAPI/MCP schema，不形成第二合同 Owner。
- Auth 测试：现有测试没有覆盖 `performRefresh()` 清 session 后向 Renderer 推送状态；必须证明 token-store → auth IPC → preload 的唯一通道。

## Behaviour Contract

### 合同消费、Consumer Lock 与身份

- 实施后 `WORK_EXPERT_CONTRACT_VERSION` 必须为 `"1.0.2"`。
- Consumer immutable ref 固定为 tag `work-expert-contract-v1.0.2`，peeled target commit `ed408c354539eab3f4cabb119fbbc3df4b95efad`。
- `contracts/work-expert/v1.0.2/SHA256SUMS` 必须与该 tag 中同名文件逐字一致；`consumer-lock.json` 记录 tag、commit 和 checksum 文件路径。
- 本 PRD 的功能迁移只解释 health + MCP annotations / tools-list；Hermes Task / SSE / Artifact 等 v3.0 既有语义 KEEP，不因为整个 release 被锁定而扩大本 PRD 改造范围。
- Catalog 路由身份：`annotations.slug`（非空 string）。禁止用 `displayName` 或 `tool.name` 作生产路由身份。
- Skill 调用身份：`tool.name`。
- 展示：非空 `displayName`，否则 `tool.name`；Catalog 若二者都不可用则展示 `slug`。展示文案不得用于 `tools/call`。

### Catalog annotations（`POST /api/v1/expert/mcp` `tools/list`）

- `kind` 必须是 `"expert"` 或 `"expert_team"`，否则拒绝该条。
- `slug` 必须是非空 string，否则拒绝该条。
- `displayName` 可选。
- `status`：`ready` 可用，`offline` 不可用；缺失或未知 **不得**当 ready（其它字段合法仍可列出，不可选为可发送 Context）。
- `publicSkillCount`、`callableSkillCount` 必须是 ≥ 0 的整数，否则拒绝该条。
- 非法整表返回空列表。空列表时 Popover 显示空状态（目录不可用或无合法条目），不得回退 `slug = tool.name`。

### Skill annotations（`POST /api/v1/expert/mcp/{slug}` `tools/list`）

- 无合法 `tool.name` → 拒绝该条。
- `status`：同 Catalog。
- `callEnabled`：仅严格 `true` 允许调用；缺失 / null / 非 boolean → `false`。`false` 仍可出现在列表。
- `riskLevel` / `approvalMode`：见静默调用谓词。

### `canSilentCallExpertSkill`

定义在 `shared/expert.ts`，唯一实现。返回 `true` 当且仅当：

1. Catalog item `status === "ready"`；
2. Skill `status === "ready"`；
3. Skill `callEnabled === true`；
4. Skill `riskLevel === "low"`（其它任何值含缺失 → false）；
5. Skill `approvalMode === "auto"`（`approval_required`、缺失、其它字符串 → false）。

`callSkill` 与 Control 的 `SelectedCallability.canSilentCall` 必须调用该函数。禁止在 Chat 内再写一份平行规则。

### Health 直出解析

`GET /api/v1/expert/health` 200 体为直出 `ExpertHealthResponse`。Required：`ok` boolean、`status` string、`gateway` object、`catalog` object。extras（含 `runtimes`）不得驱动 Chip ready。`ok === true` 不得解释为 `loadGate` 已满足。

- `getHealth()` 专用直出 JSON。禁止 `httpGetData` / `unwrapApiData`。禁止非法 JSON 当文本成功。`getHealth` 必须复用现有 `openAuthorizedGet` 的 `redirect: "error"` 与 `withAuthRetry`：重定向时 fetch 抛错（映射 `unavailable`，不出现 HTTP 3xx）；HTTP 401 刷新后再试一次 GET。HTTP 2xx 非法 JSON/缺字段抛 `ExpertGatewayError`，`status` 为实际 HTTP 状态（通常 200），`errorCode = "INVALID_HEALTH_PAYLOAD"`；禁止合成 500。Control 将该 errorCode 映射为 `error`，HTTP 5xx 映射为 `unavailable`。
- 非 2xx、无效 JSON、缺字段 → `ExpertGatewayError`。
- 合法且 `ok === false` → 返回 DTO，不抛错。
- `callSkill` 每次调用都执行 `getHealth()`，无 health cache。

Control 映射：

| 条件 | `ExpertGatewayStatus` |
|---|---|
| 请求进行中 | `checking` |
| HTTP 2xx、字段合法、`ok === true` | `ready` |
| HTTP 2xx 且 `ok === false`；或 HTTP 2xx 但 JSON/字段不合法；或 HTTP 403 / 404 | `error` |
| 网络失败、超时、`redirect: "error"` 导致的 fetch 抛错、HTTP 5xx、服务不可达；HTTP 401 经 `withAuthRetry` 再试一次仍失败（且当前并非登出重置路径） | `unavailable` |
| 登录、登出、profile 变化、卸载后的立即重置 | `unknown` |

Auth identity 变化：Control **先**设 `unknown` 并递增 revision（丢弃 in-flight）。随后的旧 401 不得覆盖这次 `unknown`。Chip：`ready` 绿；`checking`/`unknown` 黄；`unavailable`/`error` 红。后端 `status` 字符串默认不展示。

Auth 状态来源不是仅 `auth:login/logout/refresh` handler，而是 `token-store.ts`：

```text
writeStoredSession / clearStoredSession
→ subscribeStoredSessionChanges
→ registerAuthIpc({ getMainWindow })
→ toPublicState
→ getMainWindow()?.webContents.send(AUTH_STATE_CHANGED_CHANNEL, publicState)
→ DesktopAuthAPI.onStateChanged
→ Chat.tsx
```

因此 `ensure-access-token.ts#performRefresh()` 在 refresh token 缺失或 refresh 失败时执行 `clearStoredSession()`，也必须使 Renderer 收到 unauthenticated state。Renderer 不得接收 token。

`Chat.tsx` 保持现有 `authGeneration` wire format，不引入本地计数后缀：认证用户固定为 `user:${state.user.id}`，未认证为 `user:unknown`。`onStateChanged` 每次都可更新公开 Auth state，但只有 identity key 改变才触发 Control 的 auth revision；同一用户 refresh success 不触发新 revision。refresh failure 清 session / logout 变为 `user:unknown`，重新 login 再变回 `user:<id>`。这与 Main 现有 `assertAuthGeneration()` 的 `user:${userId}` 校验兼容。

Chip 重拉 health：mount（revision 0→1）、Refresh、`authGeneration` 变化、window `focus`（仅 `ChatProps.active === true`）。`active` 从 false→true 时补拉；inactive 实例不得因 focus 发 health/catalog IPC，也不得 `onChange` 改写其它 run。不设 interval 轮询。发送权威拦截是 `callSkill` 内 `getHealth()`，不依赖 Chip 实时。

### Chat、Control、后台入口

Control 为受控组件。`Chat.tsx` 是唯一 selection truth，并把现有 `setExpertSelection` 作为写口传入：

- `value: ExpertSelection`
- `onChange(next: ExpertSelection): void`
- `active: boolean`（`ChatProps.active` / `Layout.tsx`）
- `onGatewayStatusChange(status: ExpertGatewayStatus): void`
- `onSelectedCallabilityChange(snapshot: SelectedCallability | null): void`

多实例规则：`Layout.tsx` 对每个 run 挂载一个 `<Chat runId={run.runId} active={run.runId === activeRunId}>`，后台 session **保持挂载**。每个 Chat 自有 `expertSelection`。Control 只在 `active === true` 时因 window `focus` 重拉 health/catalog；`active` 从 false→true 时补拉。inactive 的 Control 可保留上次快照，但不得向其它 run 写 selection。Auth identity 是进程级的：各 Chat 可更新自己的 `authGeneration`，但只有 active 实例因此发出 health/catalog IPC；inactive 实例把 revision 标脏，待变为 active 再拉。Main `callSkill` / `getHealth` 不受 Chat `active` 限制。

`ExpertContextControl` 不得保存第二份 `ExpertSelection` state。用户选择与最新 revision 的合法性修正都只能调用 `onChange`，最终由 Chat 的 `setExpertSelection` 写入 truth。

Refresh / Catalog / Skill reconciliation 的 selection 修正规则：

1. 最新合法 Catalog 不含 `value.expertSlug` → `onChange({ expertSlug: null, skillName: null })`；
2. Expert 仍存在，但最新合法 Skills 不含 `value.skillName` → `onChange({ expertSlug: value.expertSlug, skillName: null })`；
3. selection 合法 → 不回调；
4. revision 已过期或 unmounted → 不回调。

`SelectedCallability` 至少包含：catalog/skill status、`callEnabled`、`riskLevel`、`approvalMode`、`canSilentCall`。无选中 Expert 时上送 `null`。catalog/skills 刷新或 selection 变化时重算。

`handleSubmitOrQueue` 按当时 React state：

1. runtime 未就绪：现有提示，停止。
2. 以 `/` 开头且 `parseBackgroundCommand` 为 null：现有 slash，仍优先于 Expert。
3. `parseBackgroundCommand` 命中：若 `expertSlug != null`，提示并停止（不本地后台、不 `start`）；否则现有后台路径。
4. 已选 Expert、未选 Skill：提示 `Select an expert skill before sending.`；不得 Local Chat，不得 `start`。
5. 完整 Context 且 `selectedCallability?.canSilentCall !== true`：停止；不得 Local Chat，不得 `start`。
6. 完整 Context 且 `gatewayStatus` 为 `unavailable` / `error`：提示 `Expert Gateway unavailable.` 并停止。
7. 完整 Context 且 `gatewayStatus` 为 `checking` / `unknown`：阻止发送。
8. 完整 Context 且 `gatewayStatus === "ready"` 且 `canSilentCall`：现有 Expert start/queue。
9. 无 Expert：忽略 gateway，走现有 Local Chat。

`onQuickAsk`：`expertSlug != null` 时同样停止（不本地后台、不 `start`）；未选 Expert 时 KEEP 现有行为。

`expertSlug != null` 时禁用整个 `chat-toolbar-local-controls`（四个控件）。清空 Expert 后恢复。

Retry：仍 `expert.retry`；拒绝必须在 Run Card 可见。`attachmentRefs: []` KEEP。

### 选择、Refresh、密度、Popover

- 选 Expert 清空 Skill 并按新 revision 读 Skills。Clear 将二者设为 `null`。
- Refresh：递增 revision → Main `clearCache()` 后读 Catalog → 按 `ExpertContextControlProps.onChange` 规则修正 selection。Chat 直接传 `onChange={setExpertSelection}`；全程同一 revision，过期 revision 禁止修正。
- 密度按 **Composer toolbar 行**内容宽度（对该行 `ResizeObserver`）：`>=960` full（`Expert · Skill`）；`720–959` expert；`<720` icon。不是 `window.innerWidth`。默认无选择时 Chip 文案 `Local Chat`。
- 一个 Chip 取代两个横向原生 select。Popover：Status、Expert、Skill、Refresh、Clear、Close；Escape、Close、outside click。空 Catalog 有明确空状态。
- P0 无 Permission 选择器。

### Revision

单一计数器。递增：选 Expert；Refresh；`authGeneration` 变化；卸载。mount 0→1 后再发首次 health/catalog。过期结果丢弃。过期 revision 不得调用 `onChange` 修正 selection；卸载后不得 `setState` / 任何回调。

### IPC 与安全

- `expert:get-health`、`expert:refresh-catalog`。Preload `getHealth()` / `refreshCatalog()` 零额外参数。IPC 验收必须覆盖 `registerExpertIpc()` 真实 handler（sender、auth、refresh 清 cache、无 URL/token/path），不得另造平行 wrapper。
- Auth：`AUTH_STATE_CHANGED_CHANNEL` 只推 `DesktopAuthState` 公共字段；`StoredAuthSession`、access token、refresh token 不得进入 Renderer。`DesktopAuthAPI.onStateChanged()` 必须返回 unsubscribe。
- `registerAuthIpc({ getMainWindow })` 是 auth renderer push 的唯一 IPC Owner；`startMainProcess()` 继续拥有 `mainWindow`；`token-store.ts` 只提供 Main 内部 session-change subscription，不直接 import BrowserWindow、Renderer 或 preload。窗口尚未创建时允许跳过 push，Renderer 首次 mount 仍以 `DesktopAuthAPI.getState()` 建立初始状态。

### 历史错误形状

仅 tests/fixtures：`{ data: ... }` 误读 health；非法 JSON 当文本成功；`slug = tool.name`；复制 IPC helper；过期 Skills 覆盖新 Expert。

## Acceptance Criteria

- [ ] 仅 `ChatProps.active === true` 的实例在 window `focus` 时重拉 health；后台挂载的 Chat 不因 focus 发请求，也不改写其它 run 的 `expertSelection`。`active` 从 false→true 时补拉。
- [ ] `getHealth` 使用与 `openAuthorizedGet` 相同的 `redirect: "error"` 与 `withAuthRetry`（401 再试一次）。映射表与测试不含 HTTP 3xx 状态码。
- [ ] `authGeneration` KEEP 未认证字面量 `"user:unknown"`；认证为 `user:${user.id}`。测试不得期望 `user:anonymous`。
- [ ] HTTP 2xx 非法 JSON/缺字段的 `ExpertGatewayError.status` 为实际 HTTP 状态且 `errorCode === "INVALID_HEALTH_PAYLOAD"`，不得为合成 500；Control 将其映射为 `error`，HTTP 5xx 映射为 `unavailable`。
- [ ] 本仓库 `contracts/work-expert/v1.0.2/SHA256SUMS` 逐字复制自 tag 内 `nodeskclaw-backend/contracts/work-expert/v1.0.2/SHA256SUMS`；`consumer-lock.json` 同时记录 `providerSha256sumsPath` 与相对 `sha256sumsPath`。
- [ ] Toolbar 不再显示两个并列原生 selector；默认 Chip 为 `Local Chat`。
- [ ] 展示与调用身份分离：`tools/call` 只用 `annotations.slug` + `tool.name`。
- [ ] v1.0.2 功能迁移范围仅 health + MCP annotations / tools-list；Hermes Task、SSE、Artifact、Queue、continuation 合同语义保持 KEEP，不因 Consumer Lock 扩 scope。
- [ ] 密度阈值仅 960/720，测量对象为 Composer toolbar 行；`<720` 为 icon，无双 select 挤压；各密度可打开完整 Popover。
- [ ] Popover 含 Status、Expert、Skill、Refresh、Clear、Close；Escape 与 outside click；空 Catalog 有空状态，不恢复 `slug = tool.name`。
- [ ] `getHealth` 直出 JSON，不复用 `httpGetData()`；DTO 最低 `ok`/`status`/`gateway`/`catalog`。
- [ ] Chip 点：`ready` 绿，`checking`/`unknown` 黄，`unavailable`/`error` 红。403/404 → `error`；`redirect: "error"` 的 fetch 抛错 → `unavailable`。不把 `runtimes[].status` 当 ready。不把 `ok` 当 `loadGate` 已满足。
- [ ] Catalog/Skill 拒绝规则按 Behaviour；生产 parser 不写 `slug = tool.name`。
- [ ] `canSilentCallExpertSkill` 仅 `ready`+`ready`+`callEnabled===true`+`riskLevel==="low"`+`approvalMode==="auto"`。其它值 Chat 与 `callSkill` 都不能发出 `tools/call`。
- [ ] `callSkill` 在 `tools/call` 前执行 `getHealth`；`ok !== true` 或解析失败时测试断言 **没有**发出 `tools/call` HTTP。Catalog `status !== "ready"` 同样不发出。
- [ ] Queue drain 与 retry 不经过 Chat UI 门禁时，仍被 `callSkill` 拦住（health / allowlist）。
- [ ] Refresh 由 Main `clearCache()` 后读 Catalog；过期 refresh 不覆盖新选择。
- [ ] Expert 未选时 Skill 不可选；Skill loading；选 Expert 清空 Skill。
- [ ] `ExpertContextControl` 为受控组件：`value={expertSelection}`、`onChange={setExpertSelection}`、`active={active}`；Control 不持有第二份 selection truth。Catalog 删除 Expert 时清 Expert+Skill，Skill 删除时保留 Expert 清 Skill；过期 revision / unmount 不得调用 `onChange`。
- [ ] 仅选 Expert 时发送被阻止且无 Local Chat；完整 Context 但 UI gateway 非 `ready` 时 Chat 阻止；`callSkill` 在 Chip 仍显示 `ready` 但本次 `getHealth` 失败时仍阻止。
- [ ] `expertSlug != null` 时 `ModelPicker`、`ReasoningEffortPicker`、fast-mode、`ContextFolderChip` 均禁用；web preview 仍可用；清空 Expert 后四控件恢复。
- [ ] `expertSlug != null` 时 `/btw` 与 `onQuickAsk` 不发本地后台、不 `start`；其它 slash 仍优先。
- [ ] Auth 状态推送覆盖 `writeStoredSession` 与 `clearStoredSession`，包括 `performRefresh()` 失败清 session；Renderer 只收到 `DesktopAuthState`。`authGeneration` 保持 `user:${user.id}` / `user:unknown`，与 `assertAuthGeneration()` 兼容；同用户 refresh success 不触发 Control revision；identity 变化时 Control 先 `unknown`。
- [ ] `startMainProcess()` 使用现有 `mainWindow` 调用 `registerAuthIpc({ getMainWindow: () => mainWindow })`；Auth 模块不创建第二个窗口 registry。测试捕获 `webContents.send(AUTH_STATE_CHANGED_CHANNEL, DesktopAuthState)`，并验证 unsubscribe。
- [ ] 快速切换 Expert A→B 时 A 的延迟 Skills 不得覆盖 B；Catalog/Skill 删除修正有测试。
- [ ] IPC 测试走 `registerExpertIpc()` 真实 handler。
- [ ] Main 测试覆盖 health 形状、`ok=false`、401/403/404/5xx、非法 JSON、annotations 拒绝、allowlist 拒绝、`callSkill` 不发 `tools/call`。
- [ ] Retry 走 `expert.retry`；拒绝可见；`attachmentRefs: []` 保持不变。
- [ ] 执行链 SSE/Task/Queue/Projection/continuation/artifact Owner 不变。
- [ ] 不新增平行 gateway client、IPC wrapper、Context truth、队列或 Projection Owner。
- [ ] `npm run lint`、`npm run typecheck`、目标测试、`lat check` 通过。
- [ ] Consumer Lock 在本 PRD 实施范围内可完成：`consumer-lock.json` 固定 tag `work-expert-contract-v1.0.2` + peeled commit `ed408c354539eab3f4cabb119fbbc3df4b95efad`，同目录 `SHA256SUMS` 与该 tag 原文件一致；`WORK_EXPERT_CONTRACT_VERSION` 与 lock version 均为 `1.0.2`。

## Non-Scope

| 项 | 边界 |
|---|---|
| v1.0.2 immutable ref | tag `work-expert-contract-v1.0.2` → peeled commit `ed408c354539eab3f4cabb119fbbc3df4b95efad` |
| `SHA256SUMS` | 从同一 immutable tag 复制到本仓库 Consumer Lock 并校验 |
| `manifest.tagTargetCommit === null` | Provider 元数据；不用于判断 tag 是否存在 |
| `loadGate=unmet` | 非本 PRD Scope；禁止把 health `ok` 解释为 load gate 已满足 |
| Provider release / CI / deploy | 非本 PRD Scope |

## Resolved Design Decisions

1. 视觉：采用 Work 现有主题变量的等价交互，不要求与 Desktop 像素级一致，不复制 Desktop `remote` 状态。
2. Health 文案：默认只展示映射后的状态点，不展示 Provider 内部 `status` 字符串。
3. P0 无 Permission UI：非 silent-call allowlist Skill 不调用；若未来增加带确认调用，另开 PRD 扩展 `ExpertRequest`。
4. 静默调用 allowlist：本 PRD 固定仅 `riskLevel === "low"` 且 `approvalMode === "auto"`。这是 Consumer 侧 fail-closed 规则，不把它声称为 Provider schema enum；Provider 后续若正式定义枚举，再独立修订。
5. Consumer Lock：作为本 PRD 可实施治理产物完成，不等待 Provider 回写 manifest。
