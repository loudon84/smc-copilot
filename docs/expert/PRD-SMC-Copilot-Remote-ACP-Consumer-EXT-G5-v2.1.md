# SMC Copilot Remote ACP Consumer EXT-G5（Pin 2.1.0）PRD v2.1

## 0. Document Meta

```yaml
title: SMC Copilot Remote ACP Consumer EXT-G5 / Golden Consumer Pin 2.1.0
prd_id: PRD-SMC-COPILOT-REMOTE-ACP-CONSUMER-EXT-G5-V2.1
version: "2.1"
status: APPROVED_FOR_PLAN
product: SMC Copilot Work / Remote Expert Consumer
repository: https://github.com/loudon84/smc-copilot
consumer_path: apps/work
owner: SMC Copilot Work Team
created_at: 2026-10-07
updated_at: 2026-10-07
provider_contract: REMOTE-EXPERT-FRONTEND-CONTRACT v2.1.0
provider_status: FROZEN
provider_g3_sha: 3205fdcac003fc91d5a04349c2813b815bc0342b
source_provider_prd: nodeskclaw/docs_agent/PRD-NODESKCLAW-SMC-Copilot-Remote-ACP-Consumer-EXT-G5-v2.1.md
handoff: nodeskclaw/docs_agent/evidence/remote-acp-v2.1/CONSUMER_HANDOFF.md
related_docs:
  - docs/expert/PRD-SMC-Copilot-Remote-Expert-ACP-Rich-Process-and-Terminal-Closure-v6.3.1.md
  - docs/adr/ADR-039-work-chat-execution-context-immutable.md
  - docs/architecture/work-chat-execution-context.md
grilling_lock: Q1–Q10 locked 2026-10-07 (see §16)
production_claim: FORBIDDEN until EXT-G5 PASS and a separate production-gate PRD/Plan
```

### 0.1 Grilling Lock（不得改选）

| ID | Decision |
|---|---|
| Q1 | 唯一 pin **2.1.0**；禁止双 pin（2.0+2.1） |
| Q2 | **Pin cutover + 缺口补齐**：复用现网 WSS ACP / rich tool / turn-scoped seq；不从零重做 |
| Q3/Q8 | `ACP_REMOTE_RUN_FAILED`：保留已流式正文；`turn.end` **outcome=`failed`**；不得伪装 `completed`/`end_turn`；现网有正文→completed 的 hotfix **须回正** |
| Q4 | EXT-G5 = **现有 G6 + 映射 live**；Acceptance ID 映射表对齐 A-SMC-210x |
| Q5 | 本文件为正式 PRD，状态 **`APPROVED_FOR_PLAN`** |
| Q6 | Assistant：**有 snapshot 则对账合并**；无 snapshot 则纯 append |
| Q7 | Continuity：**透传 Provider code** 到 UI/日志；包装码仅兜底 |
| Q9 | **ADR-039** 写入硬约束（绑定后禁止改 Local/Expert） |
| Q10 | **继承** v6.3.1 rich/seq/turn.end；**替换** pin/gate/continuity/EXT-G5；v6.3.1 对 pin 章节 **superseded-for-pin** |

### 0.2 Current Source（实查，禁止假设）

| Fact | Value |
|---|---|
| Work version | `0.7.14` |
| Consumer pin today | `frontendContractVersion=2.0.0`；`REMOTE_EXPERT_PIN_FINALIZATION_STATUS=BLOCKED_UNTIL_PROVIDER_V2_1_0_FROZEN` |
| Contract tree in-repo | 仅 `contracts/remote-expert-frontend/v2.0.0/`；**无** `v2.1.0/` |
| Transport | Electron Main `RemoteAcpClient` → Backend 公网 WSS（**无** `nodeskclaw-acp.exe` / stdio spawn） |
| Already landed | `resetTurnCursor`、resume `afterSeq=0`、rich tool DTO/mapper/upsert、G6 `A-SMC-001..006`、G7 live env 门控 |
| Missing for this PRD | pin 切 2.1.0 + digests；continuity Provider code 透传；`ACP_REMOTE_RUN_FAILED` 回正；EXT-G5 映射与证据闭环 |

---

## 1. Goal

在 Provider `REMOTE-EXPERT-FRONTEND-CONTRACT v2.1.0` **FROZEN** 前提下，将 `apps/work` 升级为 **唯一 pin=2.1.0** 的 Desktop Golden Consumer：Contract Gate 对齐、Original Chat 投影 v2.1 语义、连续性/终态 fail-closed、EXT-G5 可机读证据 PASS；**在此之前禁止宣称 Desktop Remote Expert 生产可用**。

---

## 2. Non-Goals

- 不修改 Provider 契约树 `v2.1.0`（已 FROZEN）
- 不将 `productionGate` / `production_gate` 标为 `passed`（CG5 ≠ 生产门禁）
- 不引入 Skill Run / Work Expert / Remote Agent REST 作为聊天通道
- 不直连 Agent 内网 URL / Hermes
- 不公开 `runtime_session_id` / `runtime_run_id` / capability / JWT 给 Renderer 业务逻辑或 evidence
- 不重做 Task / Knowledge
- 不恢复 `nodeskclaw-acp.exe` / adapter keyring
- 不新建第二套 Remote Expert Chat page/store lifecycle

---

## 3. Frozen Pin（Consumer 硬编码唯一真相）

来源：Provider `CONSUMER_HANDOFF.md` / `contracts/remote-expert-frontend/v2.1.0/consumer/smc-copilot-v2.1-handoff.json`。

| Field | Value |
|---|---|
| `frontendContractVersion` | `2.1.0` |
| `frontendContractDigest`（aggregate） | `b25a9edbf2fa5afd6f15cb1cc1f8b17d6cb63b613bf18a2212e75002c61b4aba` |
| `catalogContractDigest` | `d51d27a33e6776be780bf3556ffa4ef4f6dab7f731c0a48421683708364efd2c` |
| `remoteAcpContractDigest` | `86668a0a013ca3aef08f11611c6c32cb7643918caf21f5d530049b0d0a1a28be` |
| `runtimeContractDigest` | `0c796f63391a5585f7a57318d7b202eb57a65039ee27555adabefce53287e17a` |
| Transport | `nodeskclaw.remote-acp.v1` |
| Auth | 已登录用户 JWT；禁止 adapter 登录 / OS keyring 另存 Agent token |
| Provider G3 SHA | `3205fdcac003fc91d5a04349c2813b815bc0342b` |

**Gate（MUST）**

```text
GET /api/v1/remote-experts/contracts
  .frontendContractVersion  == 2.1.0
  .frontendContractDigest   == pinned aggregate
  .catalogContractDigest    == pinned catalog
  .remoteAcpContractDigest  == pinned remote-acp
→ 全部相等才允许创建 WebSocket
→ 任一不等 → REMOTE_EXPERT_PROVIDER_INCOMPATIBLE，UI 阻断，零 WS、零 session/prompt
```

`runtimeContractDigest` 供观测/排障；**不得**单独因 runtime digest 差异绕过 aggregate/catalog/remote-acp 闸门。

Implementation MUST:

1. 将 Provider `v2.1.0` 契约树（含 SHA256SUMS / handoff）落入本仓 `contracts/remote-expert-frontend/v2.1.0/`（exact digests，禁止伪造）。
2. 更新 `apps/work` pin 常量与 `contract-lock`；清除 `BLOCKED_UNTIL_PROVIDER_V2_1_0_FROZEN` 或改为 `PINNED_V2_1_0`。
3. **MUST NOT** 继续以 `2.0.0` 作为实现或 release pin。

---

## 4. Topology（继承，不改）

```text
Renderer (Original Chat) —IPC投影→ Electron Main
  ├─ ContractGate   GET .../remote-experts/contracts  vs pin 2.1.0
  ├─ CatalogClient  GET .../remote-experts
  └─ RemoteAcpClient WSS .../remote-experts/{agent_ref}/acp  (Bearer JWT)
        → Backend Public → Agent ACP Gateway → Hermes Native
```

Local Hermes Chat 与 Remote Expert **失败域隔离**（Remote 失败不得拖死 Local 发送）。

---

## 5. Inherited Normative（v6.3.1，本 PRD 不重开辩论）

以下已由 `PRD-SMC-Copilot-Remote-Expert-ACP-Rich-Process-and-Terminal-Closure-v6.3.1` 落地，本 PRD **继承**：

- Rich tool DTO / 宽容 mapper / Chat `(turnId,toolCallId)` upsert；failed 不得画成 completed
- Turn-scoped seq；`session/prompt` 前 `resetTurnCursor`；跨 Turn resume/remint **`afterSeq=0`**
- `session/prompt` **无** Consumer RPC 10s timer；`turn.end` 仅 Prompt settled 一次
- Build provenance（packaged `work-build-info.json`）用于 G7/release 证据
- 无 `nodeskclaw-acp.exe`

v6.3.1 中 **pin 仍为 2.0.0 / pin-finalization BLOCKED** 的表述由本 PRD **supersede**。

---

## 6. New / Changed Requirements

### REQ-SMC-2101 — Contract Gate Pin 2.1.0

- MUST Electron Main ContractGate 首连前比对 §3 字段。
- MUST mismatch → `REMOTE_EXPERT_PROVIDER_INCOMPATIBLE`；零 WS、零 prompt。
- MUST NOT 使用旧 pin `2.0.0` 或「先连再说」。

**Acceptance:** A-SMC-2101

### REQ-SMC-2102 — RemoteAcpClient（Backend WSS Only）

- MUST 仅 WSS `/api/v1/remote-experts/{agent_ref}/acp` + 用户 JWT。
- MUST 支持 `session/new|resume|prompt|cancel|close` 与 permission reply（字段以 remote-acp contract 为准）。
- MUST NOT spawn exe / stdio / adapter keyring；MUST NOT 直连 Agent/Hermes/REST chat。

**Acceptance:** A-SMC-2102、A-MIG-2101

### REQ-SMC-2103 — Original Chat Projection（v2.1）

- MUST 复用 Original Chat / ChatInput / MessageList；MUST NOT 新建第二套 lifecycle。
- MUST 投影 streaming text、reasoning（若有）、tool、clarify、approval、artifact。
- Assistant（Q6）：**若 Provider 提供 matching snapshot → 对账合并**；禁止二次追加；对账失败 → `ACP_STREAM_RECONCILIATION_MISMATCH` 可见失败。**无 snapshot → 纯 append**（不得发明 snapshot）。
- MUST 投影 rich tool 安全字段；缺失降级 preview，禁止编造。
- Tool status：`started` → UI `in_progress`；`pending` 禁止作为合法展示态。
- MUST 遵守 turn-scoped seq；乱序/缺口 fail-closed（禁止假成功 transcript）。

**Acceptance:** A-SMC-2103、A-SMC-2104、A-SMC-2105

### REQ-SMC-2104 — Continuity & Terminal Fail-Closed

- MUST 遵守 handoff continuity：同 Formal Session 复用已绑定 Hermes runtime session；never-bound 允许首 turn 按 handoff 重试一次；once-bound-then-missing → `ACP_RUNTIME_SESSION_CONTINUITY_LOST`。
- MUST 透传（Q7）并将下列 code 映射为用户可见错误（不得静默成功重试）：
  - `ACP_RUNTIME_SESSION_BINDING_MISSING`
  - `ACP_RUNTIME_SESSION_CONTINUITY_LOST`
  - `ACP_REMOTE_RUN_FAILED`
  - `ACP_STREAM_RECONCILIATION_MISMATCH`
- **`ACP_REMOTE_RUN_FAILED`（Q3/Q8）**：
  - MUST 按 JSON-RPC **error / 失败终态**处理，**不得**解释为成功 `stopReason=end_turn` 或 `turn.end outcome=completed`。
  - MUST 若已有流式 assistant 正文：**保留正文**；`turn.end` **outcome=`failed`**。
  - MUST 若无正文：错误条 + `turn.end failed`。
  - MUST 回正现网「有正文则当 completed」行为。
- MUST `clarify.requested` 仅作为唯一 `end_turn` 语义消费（与 Provider 一致）。
- MUST 新 Prompt（terminal 之后）`after_seq=0`；dedupe `(turn identity, seq)`。
- MUST Remote 失败不影响 Local Hermes 发送。

**Acceptance:** A-SMC-2106、A-SMC-2107

### REQ-SMC-2105 — Legacy Adapter Retirement（回归门）

- MUST 包内 / 开发路径 0× `nodeskclaw-acp.exe`；无 resolve/spawn/stdio。
- MUST NOT fallback Skill Run / Work Expert / `expert.start` 作为 Remote Expert 聊天替代。

**Acceptance:** A-MIG-2101、A-MIG-2102

### REQ-SMC-2106 — Execution Context Immutable（ADR-039）

- MUST 会话绑定后（非空 transcript 或 history resume）禁止 Local↔Expert / Expert↔Expert 切换。
- MUST history resume 恢复 durable `remoteExpertAgentRef`。
- MUST 改上下文 → 新 Chat（confirm + mint scratch）。

**Acceptance:** 覆盖于 UI/resume 测试；交叉引用 ADR-039。

### REQ-SMC-2107 — Evidence & Gates

- MUST 产出 EXT-G5 可机读 evidence（§8）；`productionGate=unpassed`。
- MUST EXT-G5 PASS 前禁止对外宣称 Desktop 生产可用。

**Acceptance:** A-G5-ALL

---

## 7. Consumer-facing Error Codes

| Code | When | UI |
|---|---|---|
| `REMOTE_EXPERT_PROVIDER_INCOMPATIBLE` | pin ≠ discovery | 阻断；说明期望 2.1.0 |
| `REMOTE_EXPERT_CONNECTION_FAILED` | WSS/鉴权/网络 | 检查登录/网络 |
| `REMOTE_EXPERT_TURN_FAILED` | 单回合包装失败 | 错误条；可新开回合 |
| `REMOTE_EXPERT_SESSION_FAILED` | 会话级包装失败 | 引导新开会话 |
| `ACP_RUNTIME_SESSION_BINDING_MISSING` | 透传 | 可见；never-bound 可按 handoff 重试一次 |
| `ACP_RUNTIME_SESSION_CONTINUITY_LOST` | 透传 | 可见；引导新开会话 |
| `ACP_REMOTE_RUN_FAILED` | 透传 | 失败终态；保留已有正文 |
| `ACP_STREAM_RECONCILIATION_MISMATCH` | 透传 | 错误条；禁止双写正文 |

Provider 原始 code MUST 可观测；包装码不得掩盖或映射成成功态。

---

## 8. EXT-G5 Golden Acceptance（与 G6/G7 映射）

对齐 Provider handoff `goldenConsumerCriteria`。  
**执行策略（Q4）**：不新建第三条独立流水线；以 `scripts/remote-expert-g6.mjs` + 现有 G7 live（env 门控）承载，Acceptance ID **映射**如下。

| EXT-G5 ID | 场景 | 建议承载 | 通过条件（摘要） |
|---|---|---|---|
| A-SMC-2101 | Contract mismatch | G6 单测 + g6 Required | 故意改 pin / mock discovery → 零 WS |
| A-SMC-2102 | Happy connect | G6/G7 | discovery 对齐 → WSS → `session/new` |
| A-SMC-2103 | Assistant merge/append | G6 | 有 snapshot 对账；无 snapshot append；无碎裂双写 |
| A-SMC-2104 | Rich tools | G6（既有 A-SMC-001/002） | 可展开；无 rich 不伪造 |
| A-SMC-2105 | Seq integrity | G6（既有 A-SMC-003） | 乱序/缺口不假完成 |
| A-SMC-2106 | Continuity fail-closed | G6 + G7 | Provider continuity codes 可见；无静默成功 |
| A-SMC-2107 | Local isolation | G7 | Remote 失败后 Local Hermes 仍可发 |
| A-MIG-2101 | No ACP exe | G6 migration-gate | 0 exe / 无 spawn |
| A-MIG-2102 | No illegal fallback | G6 | 断 Remote 不改走 Skill/REST chat |
| A-G5-ALL | Bundle | g6 verify | 以上 Required PASS；`productionGate=unpassed` |

**证据路径（建议）**

- `apps/work/test-results/remote-expert-g6.json`（既有）+ EXT-G5 映射字段  
- 可选：`docs/evidence/remote-acp-v2.1/A-SMC-21*.json`（无密钥）

半自动允许，但 A-SMC-2101 / 2102 / 2106 优先全自动。

---

## 9. Engineering Gates（CG0→CG5）

| Gate | 退出条件 |
|---|---|
| CG0 | Baseline：可登录目标 Backend；无秘密入库；确认 Provider discovery 与 §3 一致 |
| CG1 | Pin & Gate：常量/lock/`v2.1.0` 契约树 + A-SMC-2101 |
| CG2 | WSS Client 回归 + A-SMC-2102；MIG exe 门 |
| CG3 | Projection：A-SMC-2103/2104/2105；回正 REMOTE_RUN_FAILED |
| CG4 | Continuity UI：A-SMC-2106/2107；ADR-039 |
| CG5 | A-MIG-* + A-G5-ALL；文档声明 EXT-G5 PASS；**仍** `productionGate=unpassed` |

CG5 ≠ 生产门禁；生产另开 PRD/Plan。

---

## 10. UI（产品可见）

- 契约不匹配：不可连接；文案说明期望 **2.1.0**；本地对话仍可用  
- 连接中：正在连接远程专家（WSS）  
- Continuity / `ACP_REMOTE_RUN_FAILED`：错误条 + 可操作「新开会话」；已有正文保留  
- **删除**本地 ACP exe 类提示（已拆除则保持）  
- Expert 选择器：绑定后禁用（ADR-039）

---

## 11. Security

- Evidence / commit 禁止 JWT、DSN、Agent token、capability、runtime id  
- Renderer 仅投影；Main 持有 WS/JWT  
- 附件 / artifact 走 Backend URI；非法 URI 拒绝并提示

---

## 12. Relation to Other Docs

| Doc | Relation |
|---|---|
| Provider EXT-G5 PRD（nodeskclaw） | Upstream；本文件为 SMC 仓正式 Consumer PRD |
| v6.3.1 Rich Process PRD | Inherited capabilities；**pin 章节 superseded by this PRD** |
| ADR-039 / work-chat-execution-context | Normative；本 PRD REQ-SMC-2106 |
| Plans targeting pin 2.0.0 G5/G6 | **Superseded for pin**；实现目标改为本 PRD |

---

## 13. Approval & Next Step

**Status:** `APPROVED_FOR_PLAN`（Grilling Lock Q1–Q10 confirmed 2026-10-07）。

Next：另写 **implementation plan**（`commit_policy: post_review`），在 `smc-copilot` 执行 CG0→CG5。  
**禁止**在 EXT-G5 PASS 前于 Roadmap / Release Note / 公告宣称 Desktop Remote Expert 生产可用。

---

## 14. Rollback

- 单 commit / 单 plan revert 回滚 pin 切換；Provider 契约树不因本 PRD 变更。  
- 若目标环境 discovery 未升到 2.1.0，Gate 必须阻断（不得回退双 pin）。

---

## 15. Revision History

| Date | Change |
|---|---|
| 2026-10-07 | 自 Provider PROPOSED EXT-G5 PRD 移植；Grilling Lock Q1–Q10；结合 SMC 实况（0.7.14 / 已 WSS / pin 仍 2.0）定为 pin cutover + 缺口；`APPROVED_FOR_PLAN` |

---

## 16. Grilling Lock Detail

Round 1: Q1=唯一 2.1.0；Q2=A；Q3=C；Q4=C；Q5=A  
Round 2: Q6=C；Q7=A；Q8=同意；Q9=A；Q10=A  
Shared understanding confirmed by product owner before this file was written.
