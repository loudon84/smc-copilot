# Expert Context Selector Implementation Plan

## Approved PRD

[docs/work/PRD-WORK-v3.0.1-expert-context-selector.md](../../docs/work/PRD-WORK-v3.0.1-expert-context-selector.md)

## Scope

在 `apps/work` 内完成 Expert Context 选择 / 展示 / health / 静默调用门禁。功能迁移只消费 WORK-EXPERT-CONTRACT v1.0.2 的 `GET /api/v1/expert/health` 与 MCP annotations；Hermes Task / SSE / Artifact / Queue / continuation Owner KEEP。不在本 Plan：`loadGate=unmet`、Provider release/CI、Desktop Chip import、平行 gateway / IPC wrapper / Context store。

## Immediate Read

- `apps/work/src/shared/expert.ts#WORK_EXPERT_CONTRACT_VERSION`
- `apps/work/src/shared/expert.ts#ExpertCatalogItem`
- `apps/work/src/shared/expert.ts#ExpertSkillItem`
- `apps/work/src/shared/expert.ts#EXPERT_IPC_CHANNELS`
- `apps/work/src/shared/expert.ts#ExpertApi`

## Triggered Read

- Auth push：`token-store.ts#writeStoredSession` / `clearStoredSession`；`auth-ipc.ts#registerAuthIpc`；`auth-api.ts`；`auth-contract.ts#DesktopAuthAPI` / `toPublicState`；`start.ts#startMainProcess`；`ensure-access-token.ts#performRefresh`；preload `onUpdateStateChanged` 退订模式
- Gateway：`expert-gateway-client.ts#parseCatalogTools` / `parseSkillTools` / `callSkill` / `openAuthorizedGet` / `readJson`；`expert-gateway-client.test.ts`
- IPC：`expert-ipc.ts` listCatalog handler 模式；`expert-api.ts`
- Control UI：`ExpertSelector.tsx`；`expert.css`；`modules/expert/index.ts`；ChatInput `.chat-input-toolbar`
- Chat：`Chat.tsx#handleSubmitOrQueue` / authGeneration / toolbarExtras / onQuickAsk；`ExpertRunCard.tsx` retry catch
- lat：`apps/work/lat.md/expert-execution.md`；`expert-execution-tests.md`

## Change Matrix

| File / Symbol | Action | Existing Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|
| `ChatInput.tsx#toolbarExtras` | KEEP | `ChatInput.tsx` | Composer 扩展点不变 | Composer 插槽 | no |
| `Layout.tsx` multi-run Chat mount + `ChatProps.active` | KEEP | `Layout.tsx` | 每 run 一挂载；后台保持挂载 | 多实例 Chat | no |
| `Chat.tsx#expertSelection` | KEEP | `Chat.tsx` | 不把 Control 变成第二 selection Owner | Context 选择 truth | no |
| `expert-ipc.ts#assertSender` / `requireAuthSession` | KEEP | `expert-ipc.ts` | 新 channel 复用 | IPC sender/auth | no |
| `ExpertRunService` start/retry → `callSkill` | KEEP | `expert-run-service.ts` | 继续经 callSkill 获得门禁 | Expert 执行 | no |
| Expert SSE / Task / Queue / Projection / continuation / artifact | KEEP | v3.0 Owners | 不改职责和协议 | 执行链 | no |
| `ExpertRunCard` `attachmentRefs: []` | KEEP | `ExpertRunCard.tsx` | 本 PRD 不修复附件丢失 | Retry 附件 | no |
| `Chat.tsx#handleSubmitOrQueue` / local-controls / onQuickAsk / auth 订阅 / active | MODIFY | `Chat.tsx` | 不完整 Context 禁止 Local Chat；expertSlug 禁用四控件；auth 订阅；active 下传 | Context 发送判定 | no |
| `token-store.ts#subscribeStoredSessionChanges` | MODIFY | `token-store.ts` | write/clear 后通知 Main listener | Auth session 事件源 | no |
| `start.ts#startMainProcess` | MODIFY | `start.ts` | `registerAuthIpc({ getMainWindow: () => mainWindow })` | Auth 推送窗口 | no |
| `auth-contract.ts` / `auth-ipc.ts` / `auth-api.ts` | MODIFY | Auth IPC/preload/contract | `AUTH_STATE_CHANGED_CHANNEL` + `onStateChanged` | Auth 状态推送 | no |
| `shared/expert.ts` | MODIFY | Shared DTO | v1.0.2、Health DTO、`canSilentCallExpertSkill`、IPC channels | Shared DTO | no |
| `parseCatalogTools` / `parseSkillTools` | MODIFY | gateway client | v1.0.2 拒绝规则与 annotations 投影 | Catalog/Skill 解析 | no |
| `callSkill` | MODIFY | gateway client | getHealth + catalog ready + canSilentCall；失败不得 tools/call | 调用门禁 | no |
| `ExpertGatewayClient.getHealth` | ADD | gateway client | 直出 JSON；复用 openAuthorizedGet | Health | no |
| `expert-ipc.ts` / `expert-api.ts` refresh/health channels | MODIFY | IPC 桥 | getHealth / refreshCatalog 零网络参数 | IPC 窄桥 | no |
| `ExpertRunCard.tsx` retry catch | MODIFY | Run Card | IPC 拒绝可见；attachmentRefs KEEP | Retry 可见错误 | no |
| `expert.css` | MODIFY | Expert renderer | Chip/Popover/density；保留 Run Card | Toolbar Chip UI | no |
| `expert-gateway-client.test.ts` 等现有测试 | MODIFY | 各测试 Owner | 覆盖 health/parser/callSkill/auth/Chat | Acceptance Criteria | no |
| `ExpertSelector.tsx` Catalog/Skill UI 读取 | REPLACE | `ExpertSelector.tsx` | 只剩受控 fields；生命周期迁 Control | Catalog/Skill UI 读取 | no |
| `ExpertSelector.tsx` hermesAPI + cancelled-only skill effect | REMOVE | `ExpertSelector.tsx` | 删除；不得并行两套读取 | Catalog/Skill UI 读取 | no |
| `parseCatalogTools` production `slug = tool.name` | REMOVE | gateway client | 生产删除；仅 tests/fixtures | Catalog 路由身份 | no |
| `contracts/work-expert/v1.0.2/consumer-lock.json` | ADD | Consumer contract lock | 锁 tag + peeled commit + SHA256SUMS 路径 | Consumer Lock | yes |
| `contracts/work-expert/v1.0.2/SHA256SUMS` | ADD | Consumer contract lock | 从 immutable tag 逐字复制 | Consumer Lock | yes |
| `ExpertContextControl.tsx` | ADD | Expert renderer | health/catalog/skills/refresh/revision/callability | Context UI lifecycle | yes |
| `WorkContextChip.tsx` | ADD | Expert renderer | Work 本地 Chip；禁止 Desktop import | Toolbar Chip | yes |
| `WorkContextPopover.tsx` | ADD | Expert renderer | Work 本地 Popover | Toolbar Popover | yes |
| Context renderer tests | ADD | Expert renderer tests | keyboard/outside click/density/revision | Context UI tests | yes |
| `expert-ipc-registration` tests | ADD | IPC 测试 | 验证真实 registerExpertIpc handler | IPC 验收 | yes |
| Auth push tests | ADD | Auth 测试 | login/logout/refresh-failure clear → push | Auth 推送测试 | yes |
| `shared/expert.test.ts` | ADD | Shared DTO tests | canSilentCall + consumer lock 对齐 | Silent-call / lock | yes |

## Implementation Decisions

1. `getHealth` 调用已有 `openAuthorizedGet("/api/v1/expert/health")`，再用 `parseHealthResponse` 严格 JSON；禁止 `httpGetData` / `unwrapApiData`；不改全局 `readJson`。
2. 2xx 非法 JSON / 缺字段：`ExpertGatewayError`，`status` = 实际 HTTP，`errorCode = "INVALID_HEALTH_PAYLOAD"`。合法且 `ok === false` 返回 DTO、不抛。
3. `refreshCatalog` IPC = `clearCache()` + `listCatalog()`；不新增 gateway 方法。
4. `callSkill` 顺序（每次、无 health TTL）：`getHealth()` → catalog `status === "ready"` → `canSilentCallExpertSkill` → 才 `tools/call`。
5. `canSilentCallExpertSkill` 唯一实现在 `shared/expert.ts`；Main 与 Control 都 import。
6. IPC 必须把 `status`/`errorCode` 传到 Renderer；必要时用可结构化克隆的 plain object。
7. `AUTH_STATE_CHANGED_CHANNEL` 在 `auth-contract.ts`；token-store 在 `setMemoryCache` 后 notify；`registerAuthIpc({ getMainWindow })` 唯一订阅者。
8. `authGeneration`：`user:${id}` / `"user:unknown"`；仅 identity 变化升 Control revision。
9. 密度：Chip 对 `.chat-input-toolbar` 做 ResizeObserver；阈值 960/720。
10. `ExpertSelection` 仍在 `ExpertSelector.tsx`；Control 受控、无第二份 selection state。
11. `onQuickAsk` 在 Chat 包一层；不改 `useChatActions.runBackground`。
12. `/btw` 仍先于通用 slash；已选 Expert 时停止。
13. Retry：IPC catch 改为 Run Card alert；`attachmentRefs: []` 不动。
14. `SHA256SUMS` 从 peeled commit 逐字复制；禁止手写。
15. 不新增第二 gateway、IPC wrapper、Context store、Auth 窗口 registry。

## New File Justification

- `consumer-lock.json` + `SHA256SUMS`：Provider 合同在外部仓库；Consumer 需要不可变 identity 证据，不复制 schema SOT。
- `ExpertContextControl.tsx`：Selector 不能同时当 fields 与 lifecycle Owner；Chat 不能吞 catalog 列表。
- `WorkContextChip.tsx` / `WorkContextPopover.tsx`：禁止 Desktop import；Desktop `remote` 与本 PRD 状态合同不同。
- Context renderer / IPC registration / auth push / `shared/expert` tests：现有测试未覆盖；不是新生产 Owner。

## Todo 1 — Consumer Lock + shared DTO + silent-call

**Goal**
锁 v1.0.2 identity；DTO/谓词/IPC 名字就位。

**Immediate anchors**
- `apps/work/src/shared/expert.ts#WORK_EXPERT_CONTRACT_VERSION`

**Changes**
- `contracts/work-expert/v1.0.2/consumer-lock.json` + `SHA256SUMS`
- 扩展 shared DTO；`canSilentCallExpertSkill`；IPC channel 类型

**Stop conditions**
- [ ] 版本与 lock 均为 `1.0.2`；SHA256SUMS 与 tag 逐字一致
- [ ] `canSilentCallExpertSkill` 五条件断言通过

## Todo 2 — Auth identity push

**Goal**
write/clear（含 performRefresh 失败）把 DesktopAuthState 推到 Renderer。

**Immediate anchors**
- `token-store.ts#writeStoredSession`
- `auth-ipc.ts#registerAuthIpc`
- `start.ts#startMainProcess`

**Stop conditions**
- [ ] `webContents.send("auth:state-changed", DesktopAuthState)`；无 token
- [ ] performRefresh 失败 → unauthenticated；unsubscribe 有效

## Todo 3 — Gateway health + parser + callSkill gates

**Goal**
删除生产 `slug = tool.name`；callSkill 强制门禁。

**Immediate anchors**
- `parseCatalogTools`；`callSkill`；`openAuthorizedGet`

**Stop conditions**
- [ ] 缺 slug / 非法 kind/count 丢弃；无 tool.name 回填
- [ ] INVALID_HEALTH_PAYLOAD；门禁失败零 tools/call HTTP

## Todo 4 — IPC health / refresh handlers

**Goal**
真实 registerExpertIpc handler；refresh 清 TTL。

**Stop conditions**
- [ ] sender/auth 拒绝；refresh 后重新拉取；status/errorCode 可达 Renderer

## Todo 5 — Control + Chip/Popover；REMOVE Selector fetch

**Goal**
单一 UI 读取 Owner；Selector 只剩受控 fields。

**Stop conditions**
- [ ] 默认 Chip Local Chat；Escape/outside click；Selector 无 hermesAPI
- [ ] 过期 revision 不 onChange；active 门控 focus IPC

## Todo 6 — Chat 路由 + Run Card

**Goal**
Chat 发送判定；callSkill 仍是权威拦截。

**Stop conditions**
- [ ] 仅选 Expert 禁止 Local Chat；四控件随 expertSlug 禁用
- [ ] /btw 与 onQuickAsk 拦截；retry 拒绝可见；lat.md 更新

## Verification

- `apps/work` focused tests per Todo
- `npm run lint`、`npm run typecheck`、`lat check`
- `python tools/agent-skills/validate_plan.py .cursor/plans/work-expert-v3.0.1-expert-context-selector.plan.md`
