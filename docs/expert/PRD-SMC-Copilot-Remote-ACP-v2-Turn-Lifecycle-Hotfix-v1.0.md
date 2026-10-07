---
title: "SMC Copilot Remote ACP v2 Consumer Turn Lifecycle Hotfix PRD（prompt 超时 / 双会话 / 结果回填）"
prd_id: "PRD-SMC-WORK-REMOTE-ACP-CONSUMER-v2.0-HOTFIX-2"
version: "1.0.1"
status: "APPROVED_FOR_PLAN"
product: "smc-copilot / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.3 (brownfield baseline)"
owner: "SMC Copilot"
reviewers:
  - "SMC Copilot Architecture"
created_at: "2026-10-07"
updated_at: "2026-10-07"
target_release: "apps/work 0.7.13（Remote Expert turn 生命周期收口）"
change_type:
  - "BROWNFIELD_CHANGE"
  - "HOTFIX"
golden_consumer: "loudon84/smc-copilot/apps/work"
related_docs:
  - "docs/expert/PRD-SMC-Copilot-Remote-ACP-v2-Consumer-Integration-v6.3.md"
  - "docs/expert/PRD-SMC-Copilot-Remote-ACP-v2-Consumer-Hotfix-v1.0.md"
  - "docs/expert/PRD-SMC-Copilot-Remote-Expert-UI-and-Consumer-Release-Closure-v1.0.md"
supersedes: []
grilling:
  rounds: 3
  frontier: empty
  shared_understanding: confirmed
  approved_for_plan_at: "2026-10-07"
---

# 0. 背景与证据来源

Remote Expert Closure（v0.7.12）上线后，真实环境（backend `http://192.168.102.247:4510`，expert `marketing`）复现三类缺陷。日志锚点：

```text
[remote-expert] {"stage":"PROMPT","status":"STARTED","agent_ref":"marketing",
  "desktop_session_id":"75d05ae8-…","request_id":"38a719a6-…"}
[remote-expert] {"stage":"DISCOVER","status":"PASS"}            # gate 已 COMPATIBLE
Error occurred in handler for 'remote-expert:submit':
RemoteExpertError: session/prompt timeout (code ACP_PROTOCOL_ERROR)
```

Provider 侧在超时后仍持续执行工具链（UI 历史聚合可见 72 次工具调用），但 Consumer 已把该 turn 判死。

代码级根因经独立追溯（Grok 4.6 子代理，read-only）确认，证据锚点：

- `apps/work/src/main/remote-expert/remote-acp-client.ts`（`request` 固定 10s 定时器，含 `session/prompt`；超时 `pending.delete` + reject；迟到的 JSON-RPC result 因 `pending` 已删被丢弃）
- `apps/work/src/main/remote-expert/remote-expert-turn-service.ts`（`submitRemoteExpertTurn` / `bootClient` / `wireClient` / `persistRef`；`turn.end` 与最终 materialize 只在 prompt resolve 后执行）
- `apps/work/src/main/remote-expert/remote-expert-transcript.ts`（`insertIfMissing` 使空 assistant 行先入，最终内容更新为 no-op）
- `apps/work/src/main/remote-expert/acp-event-mapper.ts`（只识别部分 `sessionUpdate` kind；嵌套形态不识别）
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`（`handleSubmitOrQueue` remote 分支无 busy 排队；`.catch` 删除 `turnId` 映射并用错误串覆盖已流式内容；`remoteSessionIdRef` 过滤）
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx`（关闭 run 不 `session/close`；历史恢复走 resume）

本 PRD 只覆盖这些缺陷的修复；不改变 v2.0.0 合同 pin / digest，不新增合同语义字段，不改变 G7 真实拓扑要求。

# 0.1 缺陷确认表（现状 → 后果）

| # | 现状（file:line 级） | 后果 |
|---|---|---|
| B1 | `RemoteAcpClient.request` 对所有方法统一 10s 超时；`session/prompt` 同样适用 | 长工具链 / 权限等待必然超时；IPC reject 时 Provider 仍在跑 |
| B2 | 超时后迟到的 prompt result 因 `pending` 已删被丢弃；无重投递路径 | 远端 `end_turn` 永远到不了 Consumer |
| B3 | `turn.end` 与最终 `materializeRemoteExpertTurn` 只在 prompt resolve 后执行 | 超时后无收尾事件、无最终落库 |
| B4 | `transcript.insertIfMissing` 先入空 assistant 行，第二次写入 no-op | 即使成功路径，历史重载 assistant 为空 |
| B5 | Chat `.catch` 删除 `turnId→assistantId` 并用错误串覆盖气泡 | 后续 `assistant.delta` 按 turnId 对不上被丢弃；已流式内容被覆盖 |
| B6 | `handleSubmitOrQueue` remote 分支无 busy 排队；`desktopSessionId` 在首次发送时 `crypto.randomUUID()` 现取 | 双击/连发产生两个 desktop id → 两个 `session/new` |
| B7 | `bootClient` 并发无单飞：两个 submit 都过 `runtimes.get` 后才 `runtimes.set` | 同 desktop id 也可能建两条 WSS、各 `session/new` |
| B8 | `session/new` 自身 10s 超时（unknown commit）后重试会再次 `session/new` | 违反 v6.3「session/new 不在 unknown commit 后盲重试」 |
| B9 | mapper 只认 `params.sessionUpdate` 顶层字符串等形态；`params.update.*` 嵌套、其他 kind 一律 `[]` | 过程事件静默丢失，UI 无工具/增量明细 |
| B10 | 关闭 Chat run 不 `session/close`；重开新 run 重新 mint id | 旧 ACP 会话泄漏；同一用户意图在 Provider 侧多会话 |

# 0.2 规范约束（修复不得违反）

来自 v6.3 与 Hotfix-1（REQ-HF-2 / REQ-HF-6）：

1. **resume 失败（session not found）→ 标记 `expired`，UI 提示重新发起；禁止自动 `session/new`。**
2. **WSS 断开在 prompt 期间 → DISCONNECTED → resume（after_seq）→ 不发新 prompt。**
3. `session/new` 不在 unknown commit 后盲重试；不得为一个已确认的 desktop id 静默创建第二个 ACP 会话。
4. Main 不得为「Provider 未接受的 turn」伪造 `turn.end`（REQ-HF-6 仅覆盖 pre-prompt 失败）。
5. 不改 v2.0.0 冻结 pin / digest；不新增 `RemoteExpertSemanticEvent` 变体或 DTO 字段（合同演进走 v2.1.0）。
6. 不恢复旧 Work Expert / v1 sidecar 任何生产路径；0-fallback 语义保持。

# 0.3 Grilling 锁定决策（2026-10-07，3 rounds，frontier empty）

Owner 对 Q1–Q16 均采纳推荐答案。Plan / 实现不得偏离下表；变更须重新 grilling。

| ID | 决策 | 锁定结论 |
|---|---|---|
| G-Q1 | 范围打包 | TL-1～TL-9 全部打进同一 hotfix |
| G-Q2 | prompt 超时 | `session/prompt` **无** RPC 超时；仅 socket 关闭 / `session/cancel` / Provider 错误帧终结 Promise |
| G-Q3 | 重叠 submit | **硬拒绝 + toast**（不排队） |
| G-Q4 | `session/new` unknown commit | 控制面短超时；**不盲重试**；迟到 result 补绑 `acpSessionId`；否则不可继续 |
| G-Q5 | HF-6 边界 | 仅 **pre-prompt** 失败走 HF-6；`PROMPT_ACTIVE` 后 turn 归 Main，直到真实终态 |
| G-Q6 | desktop id 铸造 | 新建 remote Expert run 时 mint，写入 `ChatRun.sessionId`；submit 只读；历史恢复沿用 |
| G-Q7 | 关 run | `handleCloseRun` best-effort：in-flight 先 cancel 再 `remoteExpert.close` |
| G-Q8 | transcript | 空内容跳过首插；有内容时 **upsert**（二次 materialize 必更新） |
| G-Q9 | mapper | 仅顶层 `sessionUpdate` + `params.update.sessionUpdate` + 嵌套 `toolCall.{toolCallId,title}`；未知 kind 继续 `[]` |
| G-Q10 | new 永不达 | 控制面超时后该 desktop id → **`expired`**（复用现有状态）+ UI「会话未确认，请新建 Chat」；同 id 禁止再 `session/new`/`prompt` |
| G-Q11 | 版本 / G7 | target **0.7.13**；G6 `A-TL-*` 必过；G7 live env 门控，缺环境 **BLOCKED 不挡合并**，release notes 标注 |
| G-Q12 | `sessionId` 语义 | `remoteExpertAgentRef` 非空时 `sessionId` **即** desktop id；Local 语义不变；模式切换不得混用同一 run 的 id |
| G-Q13 | uncertain 落库 | **不新增** persist 状态；复用 `expired` + 文案区分 |
| G-Q14 | 拒绝范围 | `remoteExpertBusy` **或** Main `PROMPT_ACTIVE` / reconnecting / resume-in-flight → 一律 toast 拒绝 |
| G-Q15 | 悬挂义务 | DoD：既有 Stop→cancel + stall **日志**；不强制 stall toast；禁止伪造 `turn.end` |
| G-Q16 | PRD 动作 | 决策回写 PRD；Owner 已批准 → `status: APPROVED_FOR_PLAN`（本轮不进入实现 Plan） |

# 1. 范围

## 1.1 In Scope

| ID | 修复项 | 位置 |
|---|---|---|
| TL-1 | `session/prompt` 不适用 10s RPC 超时；长 turn 由 socket 生命周期承载 | `remote-acp-client.ts` |
| TL-2 | prompt 期间断线：reject 为 retryable、persist `disconnected`、不发新 prompt；resume 仅 `session/resume(after_seq)` | `remote-acp-client.ts` / `remote-expert-turn-service.ts` |
| TL-3 | turn 身份绑定到 in-flight prompt（单槽）；重叠 submit **硬拒绝**；`runtime.turnId` 不被后续 submit 覆盖 | `remote-expert-turn-service.ts` / `Chat.tsx` |
| TL-4 | Renderer：仅 pre-prompt 失败走 HF-6 收尾；in-flight 断线保持订阅与 pending，直到真实 `turn.end` 或 `expired` | `Chat.tsx` |
| TL-5 | 空 assistant 不首插；有内容时 upsert（二次 materialize 更新内容） | `remote-expert-transcript.ts` |
| TL-6 | mapper 兼容顶层字符串与 `params.update.sessionUpdate`；嵌套 `toolCall.{toolCallId,title}`；不新增事件类型 | `acp-event-mapper.ts` + 单测 |
| TL-7 | remote Expert run 创建时 mint `sessionId`（desktop id）；关 run：cancel 后 best-effort `session/close` | `Chat.tsx` / `Layout.tsx` / `chatRuns.ts` |
| TL-8 | `bootClient` 单飞；`session/new` unknown commit 不自动重试；迟到 result 补绑或标 `expired` | `remote-expert-turn-service.ts` |
| TL-9 | G6 增补 `[A-TL-*]`；G7 live 增补长 turn / 断线续流（env 门控，缺环境 BLOCKED） | `tests/remote-expert/**` / `scripts/remote-expert-g6.mjs` |

## 1.2 Out of Scope

- 不改 NodeSkClaw provider / agent / Remote Hermes。
- 不改 v2.0.0 冻结合同字节与 digest；不新增合同语义字段。
- 不重开 G7 环境要求；live 用例仍 env 门控；缺环境不挡本 hotfix 合并。
- 不回炉已发布产物。
- 不新增 `ChatRun.desktopSessionId` 字段；不新增 SQLite persist 状态名。
- 不新增 stall toast / 伪造 `turn.end`。
- 本地 Dashboard 归属错误（`Local dashboard process is not owned by Work`）属 local dashboard 链路，不在本 hotfix。

# 2. 需求

## REQ-TL-1 — prompt 超时与断线语义（对应 B1/B2；G-Q2/G-Q15）

- `session/prompt` 的 JSON-RPC 等待**不受任何 RPC 定时器约束**；仅 socket 关闭 / `session/cancel` / Provider 错误帧可终结该 Promise。
- 其余控制方法（`initialize` / `session/new` / `session/resume` / `session/close`）保留短超时。
- socket 在 prompt 期间关闭：reject retryable `REMOTE_EXPERT_SESSION_NOT_ACTIVE`，persist `disconnected`；**禁止**自动新 prompt 或 `session/new`。
- 迟到的 prompt result（在 Promise 仍挂起时到达）正常 resolve；不再出现「pending 已删 → result 丢弃」。
- 悬挂缓解：既有 Stop→`session/cancel` + stall 日志；**不**要求 stall toast；**禁止**伪造 `turn.end`。

**验收**：模拟 30s 长 turn 的 fake ACP server 下 submit 成功并收到 `turn.end`；prompt 期间断线后 resume 仅发 `session/resume`，`session/prompt` 计数不增。

## REQ-TL-2 — turn 生命周期归 Main 所有（对应 B3/B5；G-Q5）

- Main 持有 turn 直到：prompt result、`session/cancel` 终态、resume-lost/`expired`、或硬关闭。
- Renderer 仅在 **pre-prompt** 失败（gate / bootClient / session/new / 校验）走 HF-6 收尾（`pending:false` + error）。
- 一旦进入 `PROMPT_ACTIVE`：in-flight 断线时气泡保持 pending 并继续接收 delta；直到真实 `turn.end` 或 session `expired`。
- `.catch` 不得删除 in-flight turn 的 `turnId` 映射，不得用错误串覆盖已流式内容。

**验收**：断线后 Provider 继续推 delta，UI 持续追加；真实 `end_turn` 到达后气泡收尾且内容完整。

## REQ-TL-3 — 单会话绑定与单飞（对应 B6/B7/B8/B10；G-Q3/G-Q4/G-Q6/G-Q7/G-Q10/G-Q12/G-Q13/G-Q14）

- 新建 remote Expert run（`remoteExpertAgentRef` 非空）时 mint `ChatRun.sessionId` 作为 **desktop id**；`handleSubmitOrQueue` 不再现取 UUID；历史恢复沿用已存 id。
- Local/Hermes 路径下 `sessionId` 仍为 gateway session id；模式切换不得在同一 run 上混用 id 语义。
- 重叠 submit：**硬拒绝 + toast**。覆盖 `remoteExpertBusy` **或** Main `PROMPT_ACTIVE` / reconnecting / resume-in-flight；不产生第二个 `bootClient` / `session/new` / `session/prompt`。
- `session/new` unknown commit：不自动重试；迟到 result 补绑；永不达则 persist **`expired`** + UI「会话未确认，请新建 Chat」；同 desktop id 禁止再 `session/new`/`prompt`（不新增 uncertain 状态名）。
- 关闭 Chat run：in-flight 先 cancel，再 best-effort `remoteExpert.close`（`session/close`）；重开历史会话走 resume，不新 mint id。

**验收**：双击/连发同一 run 只产生一个 `session/new`（第二次被拒绝）；断线重连后 resume 成功且 `session/new` 计数为 0；关闭再开历史会话不新建远端会话。

## REQ-TL-4 — transcript 最终内容可重载（对应 B4；G-Q8）

- 空 `assistantContent` / reasoning **跳过首插**。
- 有内容时 **upsert**（存在则 UPDATE）；第二次 `materializeRemoteExpertTurn` 必须落最终内容。
- 历史重载的 assistant 内容与 live 气泡一致。

**验收**：成功 turn 后重载会话，assistant 行非空且与 live 一致。

## REQ-TL-5 — 过程事件映射兼容（对应 B9；G-Q9）

- mapper 同时识别 `params.sessionUpdate`（顶层字符串）与 `params.update.sessionUpdate`（嵌套）形态；tool_call/tool_call_update 支持嵌套 `toolCall.{toolCallId,title}`。
- 不识别的新 kind 继续丢弃；不新增 `RemoteExpertSemanticEvent` 变体；不做任意深度启发式。

**验收**：两种形态的 fixture 均产出 `tool.call` / `tool.result` / `assistant.delta`；新增 mapper 单测。

## REQ-TL-6 — 证据与门禁（G-Q11）

- G6 新增验收 ID：`A-TL-PROMPT-001`（长 turn 不超时）、`A-TL-RECONNECT-001`（断线续流无新 prompt）、`A-TL-SESSION-001`（单会话单飞 / 硬拒绝）、`A-TL-TRANSCRIPT-001`（最终内容可重载）、`A-TL-MAPPER-001`（嵌套形态映射）、对应 `A-NEG-TL-*`。
- G7 live 增补：长 turn（>10s）完成回填、断线 resume 续流；env 门控，缺环境保持 BLOCKED，**不挡本 hotfix 合并**；release notes 标注。
- 既有 G6/G7 语义不变；`--release-worktree` / `--verify-evidence` 继续可用。
- 版本目标：`apps/work` **0.7.13**。

# 3. 风险登记

| 风险 | 说明 | 缓解 |
|---|---|---|
| 去掉 prompt 超时后悬挂 | socket 不死且 Provider 不终结时 Promise 长挂 | Stop→cancel；stall 日志；禁止伪造 turn.end |
| busy / reconnecting 再发 | 用户期望排队 | toast 明示「上一轮仍在进行」；硬拒绝（G-Q3） |
| `session/new` 永不达 | Provider 侧可能有孤儿会话 | 标 `expired`；禁止同 id 再 new；关 run close |
| mapper 兼容形态误判 | 嵌套形态字段歧义 | 仅 G-Q9 锁定形态；单测锁定 |
| G7 环境缺失 | live 用例无法验证 | BLOCKED 不挡合并；release notes 标注；现场人工复测 |

# 4. 验收（DoD）

1. `npm run typecheck` / 聚焦 vitest / `lat check` 全绿。
2. G6 `--release-worktree` PASS 且 `--verify-evidence` PASS（SHA==HEAD、dirty=false）；含 `A-TL-*`。
3. 真实环境复测原场景：长工具链 turn 不再 10s 判死；过程明细持续可见；完成后结果回填且历史可重载；同一 Chat 不再产生第二个远端会话；busy 连发被 toast 拒绝。
4. G7 缺环境时 BLOCKED 可接受；有环境则增补 live case PASS。
5. 单 commit（plan-post-review-commit），不含 plans/release/test-results。

# 5. 状态门禁

- 当前：`APPROVED_FOR_PLAN`（grilling 决策已回写，frontier empty；Owner 已批准进入 Plan）。
- 下一动作：撰写实现 Plan（需 Owner 另发指令）；**禁止**在无 APPROVED Plan 下直接实现。
