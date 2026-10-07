# SMC Copilot Remote Expert ACP 富过程展示、长任务终态与多轮会话 PRD v6.3.1

## 0. Document Meta

```yaml
title: SMC Copilot Remote Expert ACP 富过程展示、长任务终态与多轮会话 PRD
prd_id: PRD-SMC-COPILOT-REMOTE-ACP-RICH-PROCESS-V6.3.1
version: 6.3.1
status: APPROVED_FOR_PLAN
product: SMC Copilot Work / Remote Expert Consumer
repository: https://github.com/loudon84/smc-copilot
branch: work/prd-v6.3
source_baseline: f23e5faf089db44cb2391f779c08546ef38ce484
owner: SMC Copilot Work Team
reviewers:
  - NodeSkClaw Remote ACP Provider Owner
  - SMC Work Chat Owner
created_at: 2026-10-07
updated_at: 2026-10-07
target_release:
  - Work Remote Expert Consumer v6.3.1
  - REMOTE-EXPERT-FRONTEND-CONTRACT v2.1.0 consumer pin
change_type:
  - BROWNFIELD_CHANGE
  - INTEGRATION
  - BUGFIX
  - GOVERNANCE
golden_consumer: apps/work real Desktop Main process
related_docs:
  - 需求PRD工程模板.md
  - NodeSkClaw PRD-NODESKCLAW-REMOTE-ACP-FIDELITY-SESSION-V2.1
  - apps/work/tests/remote-expert/live/g7-golden-consumer.live.test.ts
supersedes: none
```

### 0.1 基线冻结

本 PRD 以 `f23e5faf089db44cb2391f779c08546ef38ce484` 为唯一 Current Source 基线。该提交已包含 capability TTL 前 remint、绝对 cwd、二轮 execution-context retry 等改动。

当前源码 `remote-acp-client.ts` 已明确：`session/prompt` **没有 10 秒 RPC timer**；仅 control-plane RPC 使用 10 秒 timer。因此现场出现 `RemoteExpertError: session/prompt timeout` 时，首先视为**运行包 provenance 与源码基线不一致的证据**，不得再次用“把 timeout 从 10 秒改成更大数字”作为修复方案。

---

## 1. Goal

让 Work Desktop 用户在同一 Chat 中调用 Remote Expert 时，能够看到与 Provider 安全语义一致的 Tool 参数/结果/失败状态，长任务完成后得到唯一完成节点，同一 Desktop Session 多轮 Prompt 复用同一 ACP Formal Session，同时保证不会因 Run-local `seq` 被误当成 Session-global 序号而丢失第二轮事件，并通过可核验的 packaged-build provenance 证明运行代码就是验收源码。

---

## 2. Background

### 2.1 Current State

| 领域 | 当前实现 | Grounding |
|---|---|---|
| Prompt timeout | `request()` 对 `session/prompt` 不创建 10s timer | `apps/work/src/main/remote-expert/remote-acp-client.ts` |
| WSS/Session | Desktop session → `desktop_remote_acp_sessions` → acp_session_id | `remote-expert-session-store.ts` |
| Multi-turn submit | 有 `client.acpSessionId` 时直接复用；有 stored session 时 resume；都没有才 session/new | `remote-expert-turn-service.ts` |
| Capability refresh | >60s open WSS 会重连/remint 并 resume | `remote-expert-turn-service.ts` |
| Event parser | tool.call 仅解析 id/name/title；tool.result 仅解析 content | `acp-event-mapper.ts` |
| Renderer | tool.call 直接 append 新 message，`args=event.title`；tool.result 默认把 tool 标 completed | `Chat.tsx` |
| Assistant | `assistant.delta` 直接字符串 append | `Chat.tsx` |
| Terminal | Main 收到 Prompt result 后 emit `turn.end`；Renderer 清 busy/pending | `remote-expert-turn-service.ts`, `Chat.tsx` |
| Seq | `RemoteAcpClient.lastSeq` 以单一数字跨客户端生命周期递增并对 `seq <= lastSeq` 丢弃 | `remote-acp-client.ts` |
| Session Store | `last_seq` 以 max(existing, incoming) 持久化 | `remote-expert-session-store.ts` |
| Golden Consumer | 已有真实 G7 live harness | `apps/work/tests/remote-expert/live/g7-golden-consumer.live.test.ts` |
| Build Provenance | build 生成 `resources/work-build-info.json`，包含 version/gitCommit/gitBranch/buildTime/dirty | `scripts/generate-work-build-info.mjs` |

### 2.2 Problem

真实联调出现：

1. Tool 卡片只有 Skill View/Search Files/Terminal 等名称，没有安全参数和结果内容。
2. Provider 已完成，但现场 Desktop 曾报 `session/prompt timeout` 并没有 completed 节点。
3. 同一 Chat 第二次提交时 Remote Hermes 侧出现新会话；同时当前 `lastSeq`/`after_seq` 使用方式存在多轮事件丢弃风险。
4. Provider 已确认存在 Assistant delta/snapshot 双发缺陷；Consumer 不得用模糊字符串去重掩盖 Provider 错误，但必须正确消费 Provider v2.1 的无重复 contract。

### 2.3 Impact

- 用户无法判断 Agent 做了什么；
- Tool status/error 被错误显示为 completed；
- 长任务 UI 卡住或误判失败；
- 第二轮开始后可能因为旧 `lastSeq` 丢弃合法更新；
- 现场包与源码不一致时无法快速证明；
- Consumer 若做字符串 heuristic 去重，会把 Provider 缺陷永久隐藏并可能误删正常文本。

---

## 3. Scope / Non-goal

### 3.1 In Scope

- Pin Provider `REMOTE-EXPERT-FRONTEND-CONTRACT v2.1.0` 及其 component digests。
- 扩展 `RemoteExpertSemanticEvent` 与 ACP parser，消费 safe rich Tool fields。
- Renderer 按 `(turnId, toolCallId)` upsert Tool 卡，不再同 call id 无条件 append。
- 正确渲染 Tool in_progress/completed/failed、safe input、content/structured result/error。
- 将 ACP `seq` 明确作为 Turn-scoped cursor；每次新 Prompt reset client turn cursor。
- capability refresh/session resume **发生在 terminal 之后、准备新 Prompt 时**不得把上一 Turn `lastSeq` 带到新 Turn。
- 保持同一 Desktop Session 的 ACP Session 不变；Consumer MUST NOT 管理 Hermes runtime session id。
- 保持 `session/prompt` 无固定 10s application timer。
- terminal exactly-once UI closure。
- G7 新增长任务、rich tool、3-turn、seq-reset、build-provenance cases。

### 3.2 Out of Scope

- 不在 Consumer 端修 Provider Assistant snapshot/delta 算法。
- 不通过文本相似度/字符串 contains 去重 Provider 输出。
- 不让 Renderer 直连 Backend REST Run API、Agent、Hermes。
- 不持久化/显示 `runtime_session_id`。
- 不新增第二 Chat 页面；沿用现有 MessageList/tool_call/tool_result 展示体系。
- 不在本期实现完整 in-flight disconnect replay；保留现有断线提示/恢复边界。
- 不把 raw chain-of-thought 展示为 reasoning。

### 3.3 Architecture Boundary

```text
Renderer Chat
   ^
   | typed semantic events
Main Remote Expert Service
   ^
   | ACP JSON-RPC/WSS
NodeSkClaw Backend
   ^
   | transparent public transport
NodeSkClaw Agent / Hermes
```

Renderer MUST NOT 持有 access token 或 Execution Capability。Main Process 仍是 Remote ACP transport owner。

---

## 4. Terminology

| Term | Definition |
|---|---|
| Desktop Session | Work Chat 的持久 session id |
| ACP Session | Provider `session/new` 返回的 formal session id |
| Turn | 一次用户 Prompt；SMC requestId UUID |
| Turn Cursor | 当前 Turn 内 Provider `seq` 的最大已消费值 |
| Session Ref Row | `desktop_remote_acp_sessions` 中的 Desktop→ACP projection |
| Tool Card | Chat Message model 中 `kind=tool_call/tool_result` 的展示 |
| Rich Tool Event | Provider v2.1 safe `rawInput/content/structuredContent/error/redacted/truncated` |
| Terminal Closure | 一个 Turn 收到唯一 `turn.end`，对应 Assistant `pending=false` |
| Build Provenance | packaged Work 的 `work-build-info.json` 中 version/gitCommit/dirty 等身份 |

---

## 5. System Context

### 5.1 Context Diagram

```text
Provider ACP frame
  session/update
       |
       v
RemoteAcpClient
  - turn cursor
  - transport
       |
       v
acp-event-mapper
       |
       v
RemoteExpertSemanticEvent
       |
       v
remote-expert-turn-service
       |
       v
IPC
       |
       v
Chat.tsx
  - assistant
  - reasoning summary
  - tool upsert/result
  - terminal
```

### 5.2 System Boundary

- Contract parsing/Main transport 在 Main Process。
- Renderer 只消费 typed semantic event。
- Contract version/digest 固定在 shared layer。
- Desktop Session→ACP Session 持久化只在 `remote-expert-session-store.ts`。
- Hermes runtime session 不是 Consumer domain object。

---

## 6. State / Source of Truth

| State | SOT | Rule |
|---|---|---|
| Selected Expert | Remote Expert Chat context + durable session agentRef | durable session wins after binding |
| ACP Session | `desktop_remote_acp_sessions.acp_session_id` | one per Desktop Session until closed/expired |
| Current Turn | Main Runtime `turnId=requestId` | one active turn |
| Turn Cursor | `RemoteAcpClient` current turn state | resets at new prompt |
| Historical ACP Session projection | SQLite row | does not own Hermes continuation |
| Tool call state | semantic events keyed `(turnId,toolCallId)` | renderer upsert |
| Turn terminal | `turn.end` from Main after Provider Prompt result/error | exactly once |
| Build identity | `resources/work-build-info.json` in tested package | evidence required |
| Provider contract | v2.1 frozen discovery exact match | release dependency |

Session-store `last_seq` MUST NOT be interpreted as Session-global event sequence.

---

## 7. State Machine

### 7.1 Consumer Turn

```text
IDLE
  |
  | submit UUID
  v
PROMPT_ACTIVE
  |
  +--> TOOL/ASSISTANT/REASONING updates
  |
  +--> WAITING_PERMISSION --> PROMPT_ACTIVE
  |
  +--> Provider end_turn ----> COMPLETED -> turn.end once -> IDLE
  +--> Provider cancelled ---> CANCELLED -> turn.end once -> IDLE
  +--> Provider error -------> FAILED -> turn.end once -> IDLE
  +--> socket lost ----------> DISCONNECTED (no fake completed)
```

### 7.2 Session

```text
No row
  -> session/new
  -> ACTIVE(acpSessionId=S)

new Turn:
  ACTIVE(S) -> session/prompt(S)
  terminal -> ACTIVE(S)

capability refresh between Turns:
  reconnect -> initialize -> session/resume(S, afterSeq=0) -> ACTIVE(S)

close:
  ACTIVE(S) -> session/close -> CLOSED
```

---

## 8. Data / Schema Contract

### 8.1 Contract Pin

Implementation MUST pin Provider v2.1 exact values only after Provider freeze：

```text
REMOTE_EXPERT_FRONTEND_CONTRACT_VERSION = "2.1.0"
REMOTE_ACP_CONTRACT_VERSION = "1.1.0"
catalog version remains as frozen provider declares
frontend/component digests = exact values from provider frozen manifest/SHA256SUMS
provider tag target = exact frozen tag target
```

这些 digest/tag SHA 是 release-derived artifact，不是开发者可选择的 TBD。Provider 未 freeze 时 Consumer release gate = BLOCKED；Plan 仍可生成 parser/render/test tasks，但 pin-finalization task 不得伪造 digest。

### 8.2 `RemoteExpertSemanticEvent.tool.call`

```ts
{
  type: "tool.call";
  turnId: string;
  toolCallId: string;
  toolName: string;
  title?: string;
  status: "in_progress" | "completed" | "failed";
  rawInput?: Record<string, unknown>;
  redacted?: boolean;
  truncated?: boolean;
}
```

### 8.3 `tool.result`

```ts
{
  type: "tool.result";
  turnId: string;
  toolCallId: string;
  status: "completed" | "failed";
  content?: string;
  structuredContent?: unknown;
  errorCode?: string;
  errorMessage?: string;
  redacted?: boolean;
  truncated?: boolean;
}
```

### 8.4 Render Contract

Tool call key:

```text
message identity = remote-tool:{turnId}:{toolCallId}
```

On repeated call update with same key，Renderer MUST update existing card，不得 append duplicate card。

`args` rendering：

```text
rawInput exists -> stable JSON pretty string
else -> title/toolName fallback
```

Result rendering priority：

```text
failed:
  errorCode + safe errorMessage + optional safe content
else content exists:
  content
else structuredContent exists:
  stable JSON pretty string
else:
  no separate tool_result text node required
```

`redacted/truncated=true` MUST be shown as non-secret metadata indicator；Consumer MUST NOT attempt reconstruct original value。

### 8.5 Turn Cursor Contract

- `seq` MUST be consumed only within current Prompt Turn。
- `RemoteAcpClient` MUST reset its dedupe cursor before sending a new `session/prompt` requestId。
- Dedup identity MUST be `(currentPromptRequestId, seq)`，not `seq` alone。
- capability refresh/resume **between terminal Turns** MUST use `afterSeq=0`。
- historical SQLite `last_seq` MAY remain for schema compatibility, but MUST NOT be passed as resume cursor for a brand-new Prompt。
- Existing `upsertRemoteAcpSessionRef` max behavior MUST NOT decide new-turn dedupe。
- Consumer MUST NOT drop a second-turn frame because its `seq` is lower than a previous turn's `seq`。

### 8.6 Prompt Timeout Contract

- `session/prompt` MUST NOT have the 10s control RPC timer。
- Connect timeout/control RPC timeout MAY remain existing values。
- Long Prompt completion is bounded by socket/Provider terminal，不是 arbitrary UI RPC timer。
- Packaged artifact MUST prove this behavior through G7 long-turn acceptance。

---

## 9. Requirements

## REQ-SMC-MAP-001 — Rich ACP Event Parsing

### Goal
把 Provider v2.1 safe process semantics 转为 typed Consumer events。

### Normative Requirement
`acp-event-mapper.ts` MUST parse status/rawInput/content/structuredContent/error/redacted/truncated；MUST preserve call id and turn id；unknown optional fields MAY be ignored，known malformed required fields MUST fail/omit deterministically according to parser contract。

### Inputs
Provider `session/update`.

### Preconditions
Contract gate exact match v2.1.

### Authoritative State
Provider frame; Main parser is projection only.

### State Transition
frame → typed event.

### Allowed Side Effects
emit typed event.

### Forbidden Side Effects
infer arguments from title；read secrets；parse natural language into fake tool fields。

### Ownership Scope
Main Process parser/shared DTO.

### Idempotency
same frame mapped same output.

### Failure Semantics
invalid protocol shape → `ACP_PROTOCOL_ERROR` / ignore only explicitly optional unsupported update kinds.

### Postconditions
Renderer receives all safe rich fields.

### Invariants
no runtime ids in DTO.

### Error Codes
existing `ACP_PROTOCOL_ERROR` and contract mismatch codes.

### Acceptance
A-SMC-001.

### Evidence
Vitest mapper fixtures.

---

## REQ-SMC-UI-001 — Tool Card Upsert and Detail Rendering

### Goal
Tool 卡与 Remote Agent 实际调用一一对应。

### Normative Requirement
Renderer MUST key by `(turnId,toolCallId)` and upsert；status MUST follow Provider；failed MUST NOT be painted completed。Tool input/result MUST use safe typed fields。

### Inputs
typed tool.call/tool.result.

### Preconditions
active Remote Expert turn.

### Authoritative State
semantic event stream.

### State Transition
none → in_progress → completed|failed.

### Allowed Side Effects
Chat message state update.

### Forbidden Side Effects
same call id append multiple call cards；把 missing result 显示为成功内容；恢复 redacted data。

### Ownership Scope
`Chat.tsx` / message rendering helpers.

### Idempotency
duplicate typed event with same identity/status is no-op or equivalent upsert.

### Failure Semantics
malformed detail does not crash Chat；card remains with known status and safe fallback text.

### Postconditions
用户可以展开看到参数和结果/错误。

### Invariants
tool card count equals unique call ids per turn.

### Error Codes
UI local parse/render error MUST be logged, not injected into Assistant正文。

### Acceptance
A-SMC-002, N-SMC-001.

### Evidence
component/unit test + G7 case.

---

## REQ-SMC-CURSOR-001 — Turn-scoped Seq

### Goal
第二轮及后续 Prompt 不因上一轮 event_seq 而丢消息。

### Normative Requirement
Client MUST maintain `currentPromptRequestId` and reset `lastSeq` to 0 before each new prompt；dedupe only applies to frames of that active Turn。Between-turn reconnect/resume MUST pass `afterSeq=0`。

### Inputs
requestId, seq, session lifecycle.

### Preconditions
no active prompt when starting a new turn.

### Authoritative State
Main Runtime current Turn.

### State Transition
new turn → cursor 0 → seq increasing → terminal → cursor archived/non-authoritative.

### Allowed Side Effects
update in-memory cursor；persist diagnostic last seq.

### Forbidden Side Effects
use `max(previousTurn,lastSeq)` as new-turn cursor；drop lower seq in new turn。

### Ownership Scope
`remote-acp-client.ts`, `remote-expert-turn-service.ts`, session store semantics/tests.

### Idempotency
within same Turn duplicate seq dropped exactly once.

### Failure Semantics
frame with non-monotonic seq in same Turn is duplicate/invalid per existing rule；does not contaminate next Turn.

### Postconditions
Turn 2 seq=1 is accepted even if Turn 1 ended at seq=72.

### Invariants
`cursor_scope == active requestId`.

### Error Codes
same-turn invalid protocol may use `ACP_PROTOCOL_ERROR`.

### Acceptance
A-SMC-003, N-SMC-002.

### Evidence
unit + fake server multi-turn + G7.

---

## REQ-SMC-SESSION-001 — Desktop Session Reuses ACP Formal Session

### Goal
同一 Chat 多轮 Prompt 不触发新的 `session/new`。

### Normative Requirement
只在没有可用 persisted ACP Session 时调用 `session/new`。已有 active/disconnected session 必须按现有规则复用/resume。Consumer MUST NOT 接触 Hermes runtime session id。

### Inputs
desktopSessionId, stored RemoteAcpSessionRef.

### Preconditions
same org/auth generation/agentRef；session not closed/expired.

### Authoritative State
`desktop_remote_acp_sessions`.

### State Transition
missing → new → active → reconnect/resume → active.

### Allowed Side Effects
SQLite session row update; WSS reconnect.

### Forbidden Side Effects
每个 Prompt new session；切换 expert without new Chat；保存 runtime_session_id.

### Ownership Scope
turn service + session store.

### Idempotency
same desktop session lookup returns same acpSessionId.

### Failure Semantics
closed/expired → block continuation/new Chat required；session lost → existing lost semantics.

### Postconditions
three turns `session/new` call count=1.

### Invariants
one Desktop Session → one active ACP Session.

### Error Codes
existing session/create/lost errors.

### Acceptance
A-SMC-004.

### Evidence
fake server call audit + G7.

---

## REQ-SMC-TERM-001 — Long Prompt and Exactly-One Turn End

### Goal
Remote Run 完成后 Work 必须结束 pending，且长任务不得被本地短 timeout 杀死。

### Normative Requirement
`session/prompt` MUST remain without 10s timer。Main MUST emit exactly one `turn.end` after Prompt result/error；Renderer MUST set matching Assistant `pending=false` exactly once。

### Inputs
Provider JSON-RPC terminal reply.

### Preconditions
accepted Prompt.

### Authoritative State
Provider Prompt reply + Main turn state.

### State Transition
PROMPT_ACTIVE → completed|cancelled|failed.

### Allowed Side Effects
materialize transcript, emit turn.end, clear busy.

### Forbidden Side Effects
timer-generated fake failure while socket healthy；duplicate turn.end；completed before Provider terminal。

### Ownership Scope
RemoteAcpClient + turn service + Renderer.

### Idempotency
terminal handler for same turn id is idempotent.

### Failure Semantics
Provider error maps failed；disconnect follows existing disconnected behavior and MUST NOT emit fake completed.

### Postconditions
successful long turn has no pending bubble.

### Invariants
`turn.end count(turnId)==1`.

### Error Codes
Provider mapped codes + existing session-not-active.

### Acceptance
A-SMC-005.

### Evidence
G7 >120s + event capture.

---

## REQ-SMC-PROV-001 — Packaged Build Provenance

### Goal
防止“源码已修复、现场运行旧包”造成误诊。

### Normative Requirement
Golden/Release evidence MUST read packaged `resources/work-build-info.json` and record `version/gitCommit/gitBranch/dirty/buildTime`。Required release build MUST have `dirty=false` and `gitCommit` equal designated implementation SHA。

### Inputs
packaged Work resources.

### Preconditions
release candidate built via existing build pipeline.

### Authoritative State
packaged build-info file.

### State Transition
source → build → immutable evidence identity.

### Allowed Side Effects
evidence JSON.

### Forbidden Side Effects
只记录本地 `git rev-parse` 代替包内 identity；dirty package 进入 PASS。

### Ownership Scope
build/release/G7 harness.

### Idempotency
same package readback stable.

### Failure Semantics
unknown/mismatch/dirty → Golden FAIL.

### Postconditions
现场截图可对应到 exact source commit.

### Invariants
tested package commit == claimed implementation commit.

### Error Codes
`SMC_BUILD_PROVENANCE_MISMATCH`.

### Acceptance
A-SMC-006.

### Evidence
build-info copy/hash + G7 case.

---

## REQ-SMC-CONTRACT-001 — Provider v2.1 Exact Pin

### Goal
Consumer 不靠宽松兼容猜测新字段。

### Normative Requirement
Release implementation MUST 从 Provider frozen v2.1 bundle 拷贝 exact versions/digests/tag target，并保持 discovery exact match gate。Provider 未 freeze 时 release MUST BLOCK。

### Inputs
Provider v2.1 frozen manifest/component pins.

### Preconditions
Provider release gate reaches contract freeze.

### Authoritative State
Provider frozen bundle.

### State Transition
blocked → pinned → compatible.

### Allowed Side Effects
shared constants/tests.

### Forbidden Side Effects
invent digest；accept v2.0 as v2.1；disable mismatch gate。

### Ownership Scope
SMC shared contract lock.

### Idempotency
same provider bundle produces same pins.

### Failure Semantics
mismatch → `REMOTE_EXPERT_PROVIDER_INCOMPATIBLE`/contract mismatch existing path.

### Postconditions
Consumer only enables Remote Expert for exact supported Provider.

### Invariants
all advertised pinned fields exact.

### Error Codes
existing contract mismatch codes.

### Acceptance
A-SMC-007.

### Evidence
contract-lock tests + live discovery.

---

## 10. Side-Effect Contract

允许：

- 更新 shared DTO/contract constants。
- 更新 Main event mapper/client/turn service。
- 更新现有 SQLite session row semantics；如需要 schema field migration，必须向后兼容已有 row。
- 更新 Chat tool_call/tool_result message state。
- 增加 tests/evidence。

禁止：

- 新建 Remote Expert 第二 transport。
- Renderer 直接网络访问 Provider。
- 保存 Hermes runtime ids。
- 修改普通 Local Hermes Chat 行为。
- 用文本 heuristic 对 Assistant 去重。
- 将 Tool safe details 混入 Assistant 最终正文。

---

## 11. Ownership Contract

| Object | Owner |
|---|---|
| Network/Auth/ACP client | Work Main Process |
| Desktop→ACP Session projection | Work Main SQLite |
| Provider execution truth | NodeSkClaw Agent |
| Hermes continuation | NodeSkClaw Agent; Consumer unaware |
| Tool render state | Work Renderer |
| Contract lock | Work shared layer |
| Build provenance | Work release build |
| Golden evidence | Work test/release pipeline |

Provider terminal overrides local “loading” guess；Consumer不得生成自己的 remote terminal truth。

---

## 12. Identity / Hash Contract

- Turn identity = `requestId` UUID。
- Tool identity = `(turnId, toolCallId)`。
- Turn event dedupe = `(requestId, seq)`。
- Desktop Session identity = existing Work session id。
- ACP Session identity = stored `acpSessionId`。
- Contract digests = Provider frozen manifest values。
- Build identity = `work-build-info.json.gitCommit + version + dirty`。
- Artifact checksum/contract existing rules保持。

---

## 13. Transaction Contract

### 13.1 Transaction Boundary

T0 user submit → T1 optimistic user/assistant message → T2 Main session lookup/boot → T3 optional resume/new → T4 begin current Turn cursor → T5 session/prompt → T6 stream updates → T7 Prompt terminal → T8 transcript materialize → T9 `turn.end` → T10 Renderer pending=false。

### 13.2 Commit Order

Session binding MUST be persisted after confirmed session/new/resume before Prompt。New Turn cursor reset MUST happen before first update can be consumed。Final transcript materialization SHOULD precede turn.end emission as current flow。

### 13.3 Failure Atomicity

- session/new unknown commit retains existing late-bind behavior；MUST NOT blind retry。
- rich detail render failure MUST NOT corrupt ACP session binding。
- contract mismatch MUST block before session mutation。
- terminal processing failure MUST not emit completed twice。

### 13.4 Rollback Failure

SQLite projection write failure uses existing `REMOTE_EXPERT_PROJECTION_PERSIST_FAILED`/logging；MUST NOT silently switch to a new ACP session in same Chat。

---

## 14. Failure Semantics

| Failure | Required Consumer Behavior |
|---|---|
| Provider contract not v2.1 exact | feature unavailable, no submit |
| Rich optional field malformed | safe fallback/log; no renderer crash |
| `tool.result.status=failed` | failed card, not completed |
| Same-turn duplicate seq | drop duplicate |
| New-turn seq restarts at 1 | accept |
| Long prompt >120s | keep waiting while socket/session valid |
| Socket disconnect | existing disconnected semantics; no fake completion |
| Session closed/expired | block continuation |
| Build provenance mismatch | Golden/release FAIL |
| Provider continuity error | surface failed turn; do not create local replacement session automatically |

---

## 15. Conflict Contract

- durable session agentRef vs scratch selected agentRef 冲突：durable wins + existing context conflict log。
- existing tool card same identity with different immutable `toolName`：record protocol conflict; do not create second card。
- tool result before call：Consumer MAY create placeholder result/card only if existing Message model requires；行为必须在 test 固定，不得 crash。
- Provider failed status vs prior completed status for same call：terminal failed wins only if event order/seq later；same seq conflict = protocol error。
- build-info gitCommit != claimed implementation SHA：evidence FAIL，禁止“以本地源码为准”。

---

## 16. Compatibility / Migration

### 16.1 Existing State

`desktop_remote_acp_sessions` 当前有 `last_seq`。该列可继续保留，避免 destructive migration。

### 16.2 Migration

- 新语义把 `last_seq` 降级为“最近观察值/active-turn cursor”，不再是跨 Turn Session cursor。
- 如果新增 `cursor_turn_id` 字段，migration MUST nullable/backward compatible；历史 row 的 cursor scope 视为 unknown，因此 between-turn resume 使用 0。
- Existing transcript/messages 不重写。
- Existing v2.0 pins 在升级提交中被 v2.1 新 pins 替换，但历史 contract tests必须能验证 v2.0 文件未被 Consumer伪造。

### 16.3 Unknown Ownership

历史 row 只有 `last_seq` 且无 active turn proof 时，MUST 当作 between-turn 状态，resume afterSeq=0；不得推断它属于某个正在执行的 Prompt。

---

## 17. External Dependency Contract

| Dependency | Requirement |
|---|---|
| Provider v2.1 | frozen discovery + rich tool + no-duplicate assistant + terminal/session semantics |
| Node WebSocket | transport profile exact |
| SQLite | session projection available |
| Electron Main/Renderer IPC | typed event only |
| Hermes | indirect only; Consumer MUST NOT call |
| Build pipeline | generates work-build-info |

Provider v2.1 未 freeze 是 release dependency BLOCKED，不是让 Consumer 猜 digest 的许可。

---

## 18. Security Contract

- Existing `sanitizeRemoteExpertDto` forbidden-key guard MUST remain。
- `rawInput` 只接受 Provider safe field；不得命名混淆后重新读取 local file/secret。
- `structuredContent` 作为 untrusted display data；必须走现有 React escaping/安全 renderer，不得 `dangerouslySetInnerHTML`。
- runtime/session internal ids MUST NOT 新增到 DTO、log、SQLite schema。
- token/capability MUST 继续只在 Main transport使用。
- Tool error message 必须按文本显示，不执行其中命令/HTML。

---

## 19. Observability

每个 Remote Turn 日志至少关联：

```text
operation_id=requestId
trace_id
desktop_session_id
acp_session_id (现有允许范围；若日志政策要求可 hash)
agent_ref
stage
status
turn_seq_last
contract_version
build_git_commit
```

不得记录 token、Execution Capability、runtime_session_id、raw secret。

新增建议低基数计数：

```text
remote_expert_tool_event_render_total{status}
remote_expert_turn_terminal_total{outcome}
remote_expert_turn_cursor_reset_total{outcome}
remote_expert_build_provenance_check_total{outcome}
```

---

## 20. Acceptance

## A-SMC-001 — Rich Mapper

### Requirement Refs
REQ-SMC-MAP-001

### Given
Provider v2.1 tool_call/tool_call_update fixtures。

### When
`mapAcpSessionUpdate()`。

### Then
typed event fields exact。

### Oracle
deepEqual expected DTO；forbidden field scan zero。

### Evidence
`apps/work/tests/remote-expert/acp-event-mapper.test.ts`.

---

## A-SMC-002 — Tool Upsert/UI Status

### Requirement Refs
REQ-SMC-UI-001

### Given
started → completed same callId，以及另一个 failed call。

### When
Chat consumes events。

### Then
每个 unique callId 一个 call card；status正确；safe args/result可见。

### Oracle
`tool_call_card_count == unique_call_id_count`; failed card status=`failed`.

### Evidence
Vitest/RTL component test.

---

## A-SMC-003 — Turn Cursor Reset

### Requirement Refs
REQ-SMC-CURSOR-001

### Given
Turn1 seq 1..72，Turn2 seq 1..5。

### When
同一 ACP Client 连续执行两轮 Prompt。

### Then
Turn2 5 个更新全部到达；Turn1 duplicate 仍可去重。

### Oracle
`turn2_received_seq == [1,2,3,4,5]`.

### Evidence
fake server transport test + live case.

---

## A-SMC-004 — One Session, Three Prompts

### Requirement Refs
REQ-SMC-SESSION-001

### Given
同一 desktopSessionId/agentRef，3 次 sequential submit。

### When
Provider 每轮正常 terminal。

### Then
`session/new` 只调用一次，三次 `session/prompt` 使用同一个 acpSessionId。

### Oracle
`session_new_count=1 && unique(prompt.sessionId)=1 && prompt_count=3`.

### Evidence
fake server audit + G7 public evidence；Hermes unique runtime session 由 Provider evidence证明，SMC不读取 internal id。

---

## A-SMC-005 — Long Prompt Terminal

### Requirement Refs
REQ-SMC-TERM-001

### Given
Provider Prompt 持续 >120 秒并最终 end_turn。

### When
真实 G7 Desktop Main modules 执行。

### Then
无 `session/prompt timeout`；Assistant pending false；turn.end exactly once completed。

### Oracle
`elapsedMs > 120000 && local_prompt_timeout_count=0 && turn_end_count=1 && outcome="completed"`.

### Evidence
G7 JSONL + Main logs.

---

## A-SMC-006 — Packaged Build Provenance

### Requirement Refs
REQ-SMC-PROV-001

### Given
release candidate package。

### When
G7 启动前读取 package build-info。

### Then
gitCommit 等于 designated SHA，dirty=false。

### Oracle
exact string match.

### Evidence
G7 case + build-info SHA256.

---

## A-SMC-007 — Provider Contract Exact Match

### Requirement Refs
REQ-SMC-CONTRACT-001

### Given
Provider v2.1 frozen discovery。

### When
`ensureCompatibleContract()`。

### Then
all pinned fields exact match，Remote Expert enabled。

### Oracle
`discoveryExactMatch=true`.

### Evidence
contract lock test + G7 A-G7 discovery case.

---

## 21. Acceptance Input Matrix

| Case | Turns | Tool | Provider Seq | Duration | Expected |
|---|---:|---|---|---:|---|
| C01 | 1 | none | 1..N | short | assistant no duplicate |
| C02 | 1 | search_files/read_file | 1..N | medium | rich input/result |
| C03 | 1 | terminal failed | 1..N | short | failed card |
| C04 | 2 | mixed | 1..72 then 1..5 | medium | Turn2 no drops |
| C05 | 3 | profile workflow | resets each turn | long | one ACP session |
| C06 | 1 | long terminal | 1..N | >120s | no prompt timeout |
| C07 | 1 | redacted tool | 1..N | short | no secret |
| C08 | package | n/a | n/a | n/a | exact build SHA |

---

## 22. Negative Acceptance

### N-SMC-001 — Same Tool Call MUST NOT Duplicate
Two `tool_call` frames with same `(turnId,toolCallId)` MUST result in one card.

### N-SMC-002 — Previous Turn Seq MUST NOT Suppress New Turn
Turn2 seq=1 MUST NOT be dropped because Turn1 lastSeq=72.

### N-SMC-003 — Consumer MUST NOT String-Dedupe Assistant
Given legitimate repeated human-language text with different Provider events，Consumer MUST render both；只允许基于 protocol identity/seq 去重。

### N-SMC-004 — Runtime ID MUST NOT Enter DTO
Recursive DTO/log/session-store scan MUST find zero `runtime_run_id/runtime_session_id/executionCapability`.

### N-SMC-005 — Old Package MUST NOT Pass
Package gitCommit mismatch or dirty=true MUST fail Golden evidence.

---

## 23. Failure Injection

| ID | Injection | Expected |
|---|---|---|
| F-SMC-001 | fake server Turn1 ends seq=72, Turn2 starts seq=1 | Turn2 accepted |
| F-SMC-002 | duplicate same-turn seq | one event delivered |
| F-SMC-003 | provider sends tool failed with errorCode | failed UI, no completed overwrite |
| F-SMC-004 | delay prompt terminal >120s | no local prompt timeout |
| F-SMC-005 | socket closes mid-turn | disconnected path, no fake completed |
| F-SMC-006 | contract digest one byte mismatch | gate incompatible |
| F-SMC-007 | build-info gitCommit mismatch | G7 FAIL |
| F-SMC-008 | structuredContent contains HTML/script-like string | rendered as text/data, no execution |

---

## 24. Evidence Contract

### 24.1 Required G7 Evidence

Existing `apps/work/tests/remote-expert/live/g7-golden-consumer.live.test.ts` MUST be extended, not replaced by a second unrelated harness。

Required env family remains existing `SMC_REMOTE_EXPERT_G7_*`，包括 backend/token/org/user/agent/designated expert 等；新增 cases MUST 复用相同 credential boundary。

Evidence row MUST include：

```json
{
  "id": "A-SMC-005",
  "status": "PASS|FAIL|BLOCKED",
  "operationId": "...",
  "elapsedMs": 130000,
  "providerContractVersion": "2.1.0",
  "buildVersion": "0.7.x",
  "buildGitCommit": "<40-hex>",
  "buildDirty": false,
  "oracleExpected": "...",
  "oracleActual": "..."
}
```

### 24.2 Evidence Integrity

- token/user secret 不进入 JSONL。
- build identity 来自 packaged resource，不来自测试进程 cwd 的 Git。
- BLOCKED/SKIPPED 不算 PASS。
- required case 任一非 PASS，G7 command exit non-zero。

---

## 25. Release Gate

```text
G1 Provider Dependency
  Provider REMOTE-EXPERT-FRONTEND-CONTRACT v2.1.0 FROZEN
  exact component pins available

G2 Consumer Unit
  remote-expert mapper/client/session/turn/UI tests PASS
  typecheck PASS
  guard PASS

G3 Package Provenance
  release package build-info exact SHA
  dirty=false

G4 Consumer Live
  discovery exact
  rich tool
  seq-reset two-turn
  same-session three-turn
  long prompt >120s
  terminal exactly once
  security leak scan

G5 Golden
  all Required G7 rows PASS
```

Any gate not PASS => release process non-zero。Provider productionGate 与 SMC Consumer gate 独立，MUST 两边都通过。

---

## 26. Golden Consumer / Real-world Acceptance

Golden 必须运行现有真实 Main modules，不能把 `fake-remote-acp-server.ts` 当最终证据。Fake server 只用于 deterministic unit/integration。

建议命令形态：

```bash
cd apps/work
npx vitest run tests/remote-expert/acp-event-mapper.test.ts \
  tests/remote-expert/remote-acp-client.test.ts \
  tests/remote-expert/remote-expert-session-store.test.ts \
  tests/remote-expert/remote-expert-turn-service.test.ts

npm run typecheck
npm run guard

SMC_REMOTE_EXPERT_G7=1 \
npx vitest run tests/remote-expert/live/g7-golden-consumer.live.test.ts \
  --pool=threads --maxWorkers=1
```

G7 Required env names以现有 harness 代码为准；凭证不得写入仓库或 evidence。

---

## 27. Requirement Traceability Matrix

| Requirement | Source Anchor | Acceptance | Negative/Failure | Evidence |
|---|---|---|---|---|
| REQ-SMC-MAP-001 | `acp-event-mapper.ts`, `shared/remote-expert.ts` | A-SMC-001 | N-SMC-004 | EVID-SMC-MAP |
| REQ-SMC-UI-001 | `Chat.tsx` | A-SMC-002 | N-SMC-001, F-SMC-003/008 | EVID-SMC-UI |
| REQ-SMC-CURSOR-001 | `remote-acp-client.ts`, `turn-service.ts`, session store | A-SMC-003 | N-SMC-002, F-SMC-001/002 | EVID-SMC-CURSOR |
| REQ-SMC-SESSION-001 | `turn-service.ts`, session store | A-SMC-004 | F-SMC-005 | EVID-SMC-SESSION |
| REQ-SMC-TERM-001 | `remote-acp-client.ts`, `turn-service.ts`, `Chat.tsx` | A-SMC-005 | F-SMC-004/005 | EVID-SMC-TERM |
| REQ-SMC-PROV-001 | `generate-work-build-info.mjs` | A-SMC-006 | N-SMC-005, F-SMC-007 | EVID-SMC-PROV |
| REQ-SMC-CONTRACT-001 | `shared/remote-expert.ts`, contract gate | A-SMC-007 | F-SMC-006 | EVID-SMC-CONTRACT |

---

## 28. Plan Generation Contract

### 28.1 Semantic Gap Check

以下语义已经冻结，Plan MUST NOT 再选择：

- Provider rich fields 是唯一 Tool detail 来源。
- Tool card identity = `(turnId,toolCallId)`。
- seq scope = current Prompt Turn。
- new Prompt reset cursor。
- between-turn capability refresh/resume uses `afterSeq=0`。
- Prompt 不设 10s timer。
- same Desktop Session 复用同一 ACP Session。
- Consumer 不知道/不保存 Hermes runtime session id。
- Assistant 不做文本 heuristic 去重。
- packaged build provenance required。

Provider v2.1 digest 在 freeze 前尚未产生是**外部发布依赖**，不是语义空白；Plan 的 pin task MUST 等 freeze 后读取 exact artifact，MUST NOT 填 placeholder。

### 28.2 Requirement Coverage Check

每个 REQ 必须对应 implementation/test/evidence。UI requirement 必须有 Renderer test，transport/session requirement 必须有 Main test，release requirement 必须有 G7。

### 28.3 Side Effect Check

Plan 不得新增 Renderer HTTP/WSS、第二 Remote Expert transport、runtime id persistence。

### 28.4 State Authority Check

Plan MUST 保持 Desktop→ACP projection SOT 与 Provider execution SOT 分离。

### 28.5 Failure-path Check

必须覆盖：seq reset、failed tool、long prompt、disconnect、contract mismatch、build mismatch。

---

## 29. `.plan.md` Output Standard

```text
P1 Provider v2.1 contract intake / pin staging
P2 shared DTO + mapper
P3 turn-scoped cursor and resume semantics
P4 tool card upsert/render
P5 terminal exactly-once regression
P6 build provenance gate
P7 unit/typecheck/guard
P8 G7 real Golden Consumer
P9 final pin + release evidence
```

每项必须给出 changed files、tests、oracle、evidence、rollback。

---

## 30. Code Review Contract

Reviewer MUST 检查：

- `session/prompt` 是否仍无 10s timer；
- 是否把 `lastSeq` 当 Session-global；
- refresh/resume between turns 是否还传上一轮 seq；
- tool call 是否按 identity upsert；
- failed status 是否被错误写 completed；
- 是否出现文本 heuristic 去重；
- runtime ids/credentials 是否进入 DTO/log/store；
- packaged G7 是否核验 exact build commit；
- v2.1 pin 是否来自 frozen provider bytes。

任一项失败 MUST REQUEST_CHANGES。

---

## 31. PRD Quality Gate

### Architecture
- [x] Main/Renderer/Provider boundary 明确
- [x] Consumer 不拥有 remote execution truth

### State
- [x] Desktop Session、ACP Session、Turn Cursor、Tool state SOT 明确
- [x] seq scope 明确

### Semantics
- [x] rich tool mapping 唯一
- [x] cursor reset 唯一
- [x] timeout语义唯一

### Side Effects
- [x] Allowed/Forbidden 明确

### Failure
- [x] 长任务、断线、failed tool、mismatch、旧包有 deterministic behavior

### Acceptance
- [x] 每个 MUST 有 AC
- [x] 每个 MUST NOT 有 Negative AC
- [x] failure injection 完整

### Evidence
- [x] package provenance + G7 evidence contract 明确

### Plan Readiness
- [x] 无核心 SPEC_SEMANTIC_GAP
- [x] 外部 provider freeze dependency 有 blocking rule
- [x] status=APPROVED_FOR_PLAN

---

## 32. Definition of Done

- [ ] Provider v2.1 frozen并完成 exact pin。
- [ ] Tool safe input/result/error 在 Work UI 可见。
- [ ] 相同 toolCallId 不产生重复 Tool 卡。
- [ ] failed Tool 不再显示 completed。
- [ ] Turn1 seq 高值后 Turn2 seq=1 仍完整到达。
- [ ] 同一 Desktop Chat 连续三轮 `session/new` 计数=1。
- [ ] Consumer 不保存/显示 runtime_session_id。
- [ ] 真实 >120s Prompt 不出现本地 `session/prompt timeout`。
- [ ] successful Prompt `turn.end` exactly once，Assistant pending=false。
- [ ] Assistant 不存在 Consumer 文本 heuristic 去重。
- [ ] release package `buildGitCommit` 等于 designated implementation SHA 且 dirty=false。
- [ ] `npm run typecheck` PASS。
- [ ] `npm run guard` PASS。
- [ ] Remote Expert unit/integration tests PASS。
- [ ] G7 Required live cases 全 PASS，BLOCKED/SKIPPED 不计 PASS。
- [ ] Release Gate 任一非 PASS 时进程退出码非零。
