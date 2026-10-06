---
title: "SMC Copilot Remote ACP v2 Consumer Hotfix PRD（Review 后修复）"
prd_id: "PRD-SMC-WORK-REMOTE-ACP-CONSUMER-v2.0-HOTFIX-1"
version: "1.1.0"
status: "APPROVED_FOR_PLAN"
product: "smc-copilot / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.3 (brownfield baseline)"
owner: "SMC Copilot"
reviewers:
  - "SMC Copilot Architecture"
created_at: "2026-10-06"
updated_at: "2026-10-06"
target_release: "apps/work 0.7.11（Remote Expert Consumer G6 修复 + G7 前置）"
change_type:
  - "BROWNFIELD_CHANGE"
  - "HOTFIX"
golden_consumer: "loudon84/smc-copilot/apps/work"
related_docs:
  - "docs/expert/PRD-SMC-Copilot-Remote-ACP-v2-Consumer-Integration-v6.3.md"
  - ".cursor/plans/remote_acp_v2_consumer_f0758a02.plan.md"
supersedes: []
---

# 0. 背景与证据来源

Remote ACP v2 Consumer（PRD-SMC-WORK-REMOTE-ACP-CONSUMER-v2.0，APPROVED_FOR_PLAN）实现完成后，独立 code review 给出 **FAIL**，并列出 5 个必须修复项与 5 个非阻断观察项。扫描确认（Grok 4.6 子代理，read-only）全部 CONFIRMED。

本 PRD 只覆盖这些缺陷的修复；不改变 v2.0.0 合同 pin、不改变 G7 真实拓扑要求。

证据锚点（当前 HEAD 工作区）：

- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `apps/work/src/shared/remote-expert.ts`
- `apps/work/src/main/remote-expert/remote-expert-turn-service.ts`
- `apps/work/src/main/remote-expert/remote-acp-client.ts`
- `apps/work/src/main/remote-expert/remote-artifact-client.ts`
- `apps/work/src/main/remote-expert/acp-event-mapper.ts`
- `apps/work/src/main/auth/auth-ipc.ts`
- `apps/work/src/main/auth/token-store.ts`（`sessionEpoch` 每次写入递增，含 token refresh）
- `apps/work/src/shared/auth/auth-contract.ts`（session 身份字段 = `userId` + `tenantId`）
- `apps/work/scripts/remote-expert-g6.mjs`

# 0.1 Grilling 决策记录（2026-10-06，owner 逐条确认）

| # | 决策 | 结论 |
|---|---|---|
| Q1 | 范围打包 | HF-1~HF-10 全部打包进同一 hotfix（HF-6/HF-8 与 HF-2 同文件，拆开必冲突） |
| Q2 | HF-1 方向 | 最小修复：删 `summary` 读取；不在 hotfix 里扩合同语义字段（合同演进走 v2.1.0 流程） |
| Q3 | 重连语义 | resume 失败（session not found）→ session 标记 `expired`，UI 提示重新发起，**不**自动 `session/new`；in-flight turn：resume 成功靠 after_seq 续流，resume 失败气泡置 failed |
| Q4 | 阻断 UX | 只 toast + 模式选择器将 remote-expert 选项置灰并带原因 tooltip；不自动切模式 |
| Q5 | G7 不重跑 | 接受；登记风险：HF-2 真实环境验证推迟到 G7 环境可用时补跑，release notes 标注 |
| Q6 | G6 证据机制 | 测试用例命名约定 `[A-XXX-nnn]` 嵌入标题 + vitest JSON 报告解析；无覆盖即 UNCOVERED |
| Q7 | HF-9 触发 | 仅当 session 变为 null **或** (`userId`, `tenantId`) 对变化时失效；显式排除 epoch/token 字段变化；Portal endpoint 变更不纳入 |
| Q8 | HF-6 修复层 | Renderer 本地修：submit 抛错时乐观气泡置 `pending: false` + error；Main 不伪造 `turn.end` |
| Q9 | 测试清单 | 按 §REQ-HF-5 表格写入 |
| Q10 | commit / 版本 | 单 commit；目标版本 **0.7.11**，已发布 0.7.10 产物不回炉 |
| Q11 | 状态流转 | owner 逐条确认 Round 1+2 即视为批准，状态置 `APPROVED_FOR_PLAN` |

# 1. 范围

## 1.1 In Scope（必须修复）

| ID | 缺陷 | 位置 |
|---|---|---|
| HF-1 | `permission.requested` 读取不存在的 `event.summary`，`typecheck:web` 必挂 | `Chat.tsx` / `shared/remote-expert.ts` |
| HF-2 | 断线后 `bootClient` 复用 DISCONNECTED runtime，`acpSessionId` 不清，resume 走僵尸 client，reconnect/resume 实际不可用 | `remote-expert-turn-service.ts` / `remote-acp-client.ts` |
| HF-3 | `executionMode === "remote-expert"` 但 `enabled=false` 时静默落到 Local Hermes，违反 0-fallback | `Chat.tsx` `handleSubmitOrQueue` |
| HF-4 | `session/update` 监听里 `upsertRemoteExpertAcpArtifact` 无 try/catch，畸形 ResourceLink 可打崩 Main | `remote-expert-turn-service.ts` |
| HF-5 | `remote-expert-turn-service` / `remote-expert-session-store` 无测试；G6 把 30 个验收 ID 从单一 vitest 退出码全部标 PASS | `tests/remote-expert/*` / `scripts/remote-expert-g6.mjs` |

## 1.2 In Scope（非阻断，随本 hotfix 一并处理）

| ID | 观察项 |
|---|---|
| HF-6 | 提交失败不 emit `turn.end`，renderer 气泡永远 `pending` |
| HF-7 | WS 子协议空值被接受（`if (protocol && ...)`） |
| HF-8 | `closeRemoteExpertSession` 先 persist `closed`，随后 ws close 又覆盖成 `disconnected` |
| HF-9 | `auth-ipc` 在每次 stored-session 变化（含 token refresh）都断开 ACP runtime |
| HF-10 | G6 脚本 `skipped`/`blocked` 聚合是死代码 |

## 1.3 Out of Scope

- 不改 NodeSkClaw provider / agent / Remote Hermes。
- 不改 v2.0.0 冻结合同字节与 digest；不新增合同语义字段（summary 等留待 v2.1.0 合同演进）。
- 不重开 G7；G7 仍要求真实 backend/agent/Remote Hermes 环境（见 §7 风险登记）。
- 不恢复旧 Work Expert / v1 sidecar 任何生产路径。
- 不回炉已发布的 0.7.10 产物。

# 2. 需求

## REQ-HF-1 — permission.requested 合同一致（最小修复）

`permission.requested` 语义事件字段必须与 `shared/remote-expert.ts` 一致。`Chat.tsx` 删除 `summary` 读取与对应本地 state 字段；权限卡片仅用合同已有字段渲染。不向合同加字段。

**验收**：`npm run typecheck:web` 通过；`RemoteExpertPermissionCard` 正常渲染。

## REQ-HF-2 — 断线重连可用 + expired 语义

- `bootClient`：若 existing runtime 的 client phase 为 `DISCONNECTED`/`CLOSED`/`IDLE`，丢弃并新建（清 `acpSessionId`、disconnect、从 `runtimes` 删除）。
- socket close 时清 `acpSessionId`。
- 重连顺序：新 traceId → `connect()` → `initialize()` → `session/resume`（`_meta.nodeskclaw.after_seq`）。
- `resumeRemoteExpertSession` 不得在僵尸 client 上直接 `sessionResume`。
- **resume 失败（session not found）**：session-store 将该 session 标记为 `expired`（新状态值），UI 提示用户重新发起；**禁止**自动 `session/new`（避免静默丢上下文）。
- **in-flight turn**：resume 成功时靠 after_seq 续流；resume 失败时对应 renderer 气泡置 failed（联动 REQ-HF-6 的收尾路径）。

**验收**：断线后同 session 可 resume，lastSeq 单调；resume 失败进入 `expired` 且 UI 明示；`A-RECONNECT-001` 有真实测试。

## REQ-HF-3 — remote-expert 模式禁止静默回落

`isRemoteExpertMode` 必须足以进入 ACP 分支；当 gate 不可用或 selection 缺失时 fail-closed：
- toast 明示原因；
- 不发送、不落入 `handleSendRef` 的 Local Hermes；
- 模式选择器将 remote-expert 选项置灰并带原因 tooltip；
- **不**自动切换 executionMode（模式状态由用户显式控制）。

**验收**：`executionMode === "remote-expert"` 且 `enabled=false` 时发送被阻断并有提示；Local Chat 回归不受影响。

## REQ-HF-4 — artifact upsert 容错

`session/update` 监听中 `upsertRemoteExpertAcpArtifact` 必须 try/catch；单个畸形 link 失败只记录 `logRemoteExpertError` 并继续其余 link，不得向上抛。

**验收**：注入畸形 `nodeskclaw://artifact/...` 不导致 Main 未捕获异常；其余 artifact 正常入库。

## REQ-HF-5 — G6 证据可信

**命名约定**：测试用例标题嵌入验收 ID，格式 `[A-XXX-nnn]`；`scripts/remote-expert-g6.mjs` 解析 vitest JSON 报告按 ID 匹配。无覆盖的 ID 标 `UNCOVERED`；任一 FAIL/UNCOVERED/BLOCKED 即 exit != 0。禁止由单一退出码标 PASS。

**新增/扩充测试清单**：

| 文件 | 覆盖 |
|---|---|
| `tests/remote-expert/remote-expert-turn-service.test.ts`（新增） | bootClient 复用/断线重建、persistRef close vs disconnect（HF-8）、duplicate-seq fencing、after_seq resume、auth/org invalidation（HF-9）、submit 失败路径 |
| `tests/remote-expert/remote-expert-session-store.test.ts`（新增） | `desktop_remote_acp_sessions` upsert/查询/状态迁移（含新状态 `expired`） |
| `tests/remote-expert/remote-expert-transcript.test.ts`（新增） | transcript materialize |
| `tests/remote-expert/remote-acp-client.test.ts`（扩充） | 空子协议拒绝（HF-7） |
| `tests/ipc-handlers.test.ts`（扩充） | expert.start / HermesTask / Local Hermes = 0 spy 断言 |

**验收**：G6 输出中每个 PASS 都有对应测试文件/用例；无覆盖即非 PASS。

## REQ-HF-6 — 失败 submit 收尾（Renderer 本地修）

`handleSubmitOrQueue` ACP 分支 submit 抛错时，renderer 直接把对应乐观 assistant 气泡置 `pending: false` 并带 error 文本。Main 不伪造 `turn.end`（turn 未在 provider 侧建立，不应产生 Main 侧事件）。

## REQ-HF-7 — 子协议严格相等

`ws.once("open")` 中要求 `protocol === TRANSPORT_PROFILE`，空值也拒绝。

## REQ-HF-8 — close 状态不被覆盖

`phase === "CLOSED"` 时不得 emit/persist `disconnected`；或 close 落定后再 persist `closed` 并忽略后续 disconnected。

## REQ-HF-9 — auth 变化精确失效

`invalidateRemoteExpertAuth` 仅在以下情况调用：
- (a) session 变为 null（logout / 凭证损坏被清除）；
- (b) (`userId`, `tenantId`) 对与上一次存储值不同（换账号 / 换组织）。

显式排除：`sessionEpoch` / token 字段变化（token refresh 不断开 ACP）。Portal endpoint 配置变更不纳入（ACP 目标地址不依赖 Portal endpoint）。

## REQ-HF-10 — G6 死代码清理

移除或实装 `skipped`/`blocked` 聚合，使状态机与输出一致（与 REQ-HF-5 的 UNCOVERED 机制合并落地）。

# 3. 非目标

- 不引入新 feature flag。
- 不改 `electron-builder.yml`。
- 不触碰 `infra/salt`、`services/salt-control`。

# 4. 验收矩阵

| Case | 前置 | 操作 | 期望 |
|---|---|---|---|
| 1 | 任意 | `npm run typecheck:web` | 通过 |
| 2 | 已连接 ACP session | 断网/断 ws 后重连 | 同 session resume，lastSeq 单调 |
| 3 | 已连接 ACP session，provider 侧 session 过期 | 重连 resume | session 标记 `expired`，UI 提示重新发起，无自动 session/new |
| 4 | `executionMode=remote-expert` 且 gate 不可用 | 发送 | 阻断 + toast，选择器置灰带 tooltip，0 Local Hermes 写入 |
| 5 | provider 发畸形 artifact link | session/update | Main 不崩，其余 link 正常 |
| 6 | 运行 G6 | `node scripts/remote-expert-g6.mjs` | 每 ID 有证据；无覆盖即非 PASS，exit != 0 |
| 7 | submit 抛错 | renderer | 气泡 pending=false + error |
| 8 | ws 协商空子协议 | connect | 拒绝 |
| 9 | close 后 | 状态查询 | 保持 `closed` |
| 10 | token refresh | auth 变化 | ACP runtime 不被断开 |
| 11 | 换账号/换组织（userId/tenantId 变化） | auth 变化 | ACP runtime 失效断开 |
| 12 | Local Chat / SkillRun | 回归 | 通过 |

# 5. 验证命令（apps/work 下）

- `npx vitest run src/main/remote-expert src/renderer/src/modules/remote-expert tests/remote-expert tests/ipc-handlers.test.ts`
- `npm run typecheck`
- `node scripts/remote-expert-g6.mjs`
- `npx lat check`

# 6. 交付约束

- **单 commit**：HF-1~HF-10 同属一个 review FAIL 的修复闭环，一次提交。
- **目标版本 0.7.11**；已发布 0.7.10 产物不回炉。
- 遵循 `plan-post-review-commit`：Review PASS + Verification PASS 后才允许 implementation commit。

# 7. 风险登记

| 风险 | 缓解 |
|---|---|
| HF-2 重连路径仅有单测/fake-server 证据，无真实拓扑验证 | G7 环境可用时补跑真实 reconnect/resume 场景；0.7.11 release notes 显式标注该限制 |
| `expired` 新状态值需 renderer/session-store 双侧识别 | REQ-HF-5 测试清单含 session-store 状态迁移用例；UI 文案走 en i18n（Work English-only） |
