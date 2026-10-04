---
title: "SMC Copilot Original Chat / Compose 对接 NodeSkClaw Remote ACP Expert"
subtitle: "work/prd-v6.3 Brownfield ACP Integration Solution"
template_version: "1.0"
prd_id: "PRD-SMC-COPILOT-ACP-REMOTE-EXPERT-001"
version: "1.0"
status: "APPROVED_FOR_PLAN"
product: "SMC Copilot Work"
repository: "https://github.com/loudon84/smc-copilot"
branch: "work/prd-v6.3"
source_commit: "0efacd230ebb02c5d5177b8cc35370a4f8456431"
owner: "SMC Copilot / Work Architecture"
reviewers:
  - "SMC Copilot Desktop"
  - "NodeSkClaw Remote Expert Provider"
created_at: "2026-10-04"
updated_at: "2026-10-04"
target_release: "SMC Copilot Work Remote Expert Alpha / Windows x64"
change_type:
  - BROWNFIELD_CHANGE
  - ARCHITECTURE_CHANGE
  - INTEGRATION
  - MIGRATION
golden_consumer: "apps/work"
provider_contract_tag: "remote-expert-frontend-contract-v1.0.0"
provider_contract_tag_object_sha: "9f694a3b61e1b86366d23581951f2560a07946fc"
provider_contract_target_commit: "e08428af6b814d276ed92274a64db3a46a44091f"
provider_implementation_commit: "896450ad479033afc2428852a2d02f70f77ab19e"
provider_frontend_contract_gate: "passed"
provider_production_gate: "unpassed"
related_docs:
  - "需求PRD工程模板.md"
  - "NodeSkClaw REMOTE-EXPERT-FRONTEND-CONTRACT v1.0.0"
supersedes: null
---

# SMC Copilot Original Chat / Compose 对接 NodeSkClaw Remote ACP Expert PRD v1.0

> 本 PRD 按《需求PRD工程模板》1.0 编制。它不是 UI 草图，而是 `smc-copilot/apps/work` 对 NodeSkClaw Remote ACP Expert 的工程契约。
>
> 本文所有“源码事实”来自 `loudon84/smc-copilot@work/prd-v6.3`、基线 commit `0efacd230ebb02c5d5177b8cc35370a4f8456431`；所有“Provider 契约事实”来自 annotated tag `remote-expert-frontend-contract-v1.0.0`，target commit `e08428af6b814d276ed92274a64db3a46a44091f`。未被上游契约规定、但属于 SMC 消费端责任的行为，在本文中明确冻结为 **SMC Design Decision**。

---

# 0. PRD 使用原则

## 0.1 PRD 的职责

本 PRD 同时回答：

```text
WHY         为什么 work/prd-v6.3 需要新的 Remote ACP Expert 执行路径
WHAT        Original Chat / Compose 最终获得什么能力
BOUNDARY    Renderer / Preload / Electron Main / ACP Adapter / NodeSkClaw 各自负责什么
STATE       Chat transcript、ACP session、ManagedFile、Contract Lock 分别由谁作为 SOT
INPUT       Expert Context、Prompt、Attachment、Permission Decision
OUTPUT      Streaming Chat、Tool/Reasoning、Artifact、Session Continuity
SIDE EFFECT 哪些 DB、文件、child process、远端 run 可以被修改
FAILURE     Contract 不兼容、Adapter crash、401、resume 失败、上传/下载失败时如何 fail-closed
ACCEPTANCE  如何验证没有回退旧 Expert / Skill Run 路径
EVIDENCE    哪些测试、日志、快照、LIVE 运行记录构成发布证据
```

## 0.2 强制规范关键词

本文使用 `MUST / MUST NOT / SHOULD / SHOULD NOT / MAY`。每一个出现在 Requirement Unit 中的 `MUST / MUST NOT` 均显式引用至少一个 Acceptance ID。

## 0.3 No-Inference Rule

计划生成与实现不得自行推断以下事项：

- execution provider 如何分类；
- SMC Chat Session 与 ACP Session 是否同一 ID；
- Remote Expert profile 如何做 identity/hash；
- Durable Context 是否允许会话中热修改；
- token 是否允许经过 Renderer / ACP JSON-RPC；
- attachment 与 artifact 的归属；
- permission dialog 关闭行为；
- resume 失败是否创建新 ACP Session；
- Contract digest 不一致是否可 fallback；
- legacy Expert/Skill Run 是否可作为兼容路径。

本 PRD 已冻结上述语义；`SPEC_SEMANTIC_GAP = 0`。若实施过程中发现 Provider Contract 与本文冻结语义发生真实冲突，Plan/Implementation Agent 必须产生 `SPEC_SEMANTIC_GAP` 并阻断对应 Todo，而不是自行改协议。

---

# 1. 文档元数据

```yaml
title: SMC Copilot Original Chat / Compose 对接 NodeSkClaw Remote ACP Expert
prd_id: PRD-SMC-COPILOT-ACP-REMOTE-EXPERT-001
version: 1.0
status: APPROVED_FOR_PLAN
product: SMC Copilot Work
repository: loudon84/smc-copilot
branch: work/prd-v6.3
source_commit: 0efacd230ebb02c5d5177b8cc35370a4f8456431
owner: SMC Copilot / Work Architecture
created_at: 2026-10-04
updated_at: 2026-10-04
target_release: Remote Expert Alpha / Windows x64
change_type:
  - BROWNFIELD_CHANGE
  - ARCHITECTURE_CHANGE
  - INTEGRATION
  - MIGRATION
golden_consumer: apps/work
provider_contract:
  tag: remote-expert-frontend-contract-v1.0.0
  annotated_tag_object_sha: 9f694a3b61e1b86366d23581951f2560a07946fc
  target_commit: e08428af6b814d276ed92274a64db3a46a44091f
  implementation_commit: 896450ad479033afc2428852a2d02f70f77ab19e
  protocol: ACP v1
  acp_adapter: 1.1.0
  remote_expert_catalog: 1.0.0
  remote_agent: 1.5.0
  frontendContractGate: passed
  productionGate: unpassed
```

## 1.1 Provider Component Pin

| Component | Version | Consumer Digest |
|---|---:|---|
| Remote Expert Catalog | 1.0.0 | `e5bd3f364e40ec05abb3dcb6724b11c34162175f407adbe073cf4ff0932f4d6f` |
| ACP Adapter | 1.1.0 | `29acb865bf90f0a3a9b51d50d93e195f76bac401e4d33217d45a738e281b2397` |
| Remote Agent | 1.5.0 | `c8bc0ed8a1cf5b21fcbfb743a59a2d24480ff4dc90a651e8a0b5c057ca27b18c` |
| Remote Agent LF materialization | 1.5.0 | `9bb6b0cd316a8ceab2824a259edfa90d033f5dcb7e56785aa0ab2698990403e3` |
| Aggregate bundle | 1.0.0 | `598ae09bb681049b42dbca509ff32394aaed81b1b826fab243de78cd3ff090cd` |

Provider Release 明确：annotated tag 是 discovery/freeze handle，不替代 digest validation；生产发布仍被 `productionGate=unpassed` 阻塞。

---

# 2. 一句话目标

让 **SMC Copilot Work 用户**在已登录 NodeSkClaw、Provider Frontend Contract 通过且 Remote Expert 可用的前置条件下，通过现有 **Original Chat / ChatInput Compose** 选择一个 Remote Expert，并以 **ACP v1** 完成新建/恢复会话、Prompt、附件、Tool/Reasoning 流、Permission、Artifact 和 Cancel，同时保证 **Renderer 不持有 NodeSkClaw 凭据、不绕过 ACP、不会回退到旧 Work Expert 或 Skill Run 执行链、桌面重启后可恢复同一 ACP Session**。

---

# 3. 背景与问题定义

## 3.1 Current State

### 3.1.1 smc-copilot `work/prd-v6.3` 源码事实

1. 分支 head 固定为 `0efacd230ebb02c5d5177b8cc35370a4f8456431`。
2. `apps/work/src/renderer/src/screens/Layout/chatRuns.ts` 中 `ChatExecutionMode` 仅包含 `local-chat | skill-run`；恢复模型 `ResumeSessionTarget.executionProvider` 仅包含 `hermes-chat | skill-run`。
3. `apps/work/src/main/session-metadata-store.ts` 中 `ExecutionProvider` 仅包含 `hermes-chat | skill-run`，SQLite `desktop_session_metadata` CHECK 约束也只接受现有组合。
4. `ChatInput.tsx` 已提供 `toolbarExtras`、Managed File attachment ingest、picker、drag/drop、onSubmit/onAbort，因此已有可复用 Compose extension seam。
5. `Chat.tsx` 当前同时存在 Local Hermes、Skill Run 和旧 Expert UI/Projection 集成；旧 Expert 依赖 `ExpertProjectionStore`、`expert.start` 等语义。
6. Main 已有 `AuthorizedBackendTransport`，统一 same-origin、JWT 注入、401/403 刷新、超时与错误净化，并明确 Renderer 不接触 token/backend URL。
7. Main File Platform 已有 `ManagedFile`、文件关联、预览、artifact materialization；但 `ManagedFileRemoteProvider` 当前只有 `expert | skill-run`，`materialize-remote-expert-artifact.ts` 的非 skill-run 分支隐式落到旧 Expert transfer。
8. `chat-session-materialize.ts` 已展示如何将 Chat transcript 写入既有 `sessions/messages`，并将 session metadata 标记为 `hermes-chat`；旧 `expert-session-materialize.ts` 依赖旧 Expert Projection，不可用于新 ACP 路径。
9. `sessionHistory.ts` 已能将 DB user/assistant/reasoning/tool_call/tool_result 行恢复为统一 `ChatMessage`，因此 Remote ACP transcript 可复用同一个 Chat history renderer，只需要正确的 Main-side materialization 与 execution provider 分类。
10. preload 已存在 `expert-api.ts` / `skill-run-api.ts`；旧 `expert-api.ts` 仅包装旧 Expert IPC，不能被新 ACP 路径复用为协议伪装层。

### 3.1.2 NodeSkClaw Provider Contract 事实

Provider `REMOTE-EXPERT-FRONTEND-CONTRACT v1.0.0` 为 `smc-copilot/apps/work` 冻结：

- Consumer baseline：`work/prd-v6.3`；
- Integration Mode：`original-chat-compose-acp`；
- Required Capabilities：`remote-expert-catalog`、`acp-v1`、`session-resume`、`managed-credential`、`attachment-resource-link`、`artifact-resource-link`、`permission-bridge`；
- Forbidden Dependencies：`WORK-EXPERT-CONTRACT`、`ExpertProjectionStore`、`expert.start`、`skillName`、`SkillRunStore`；
- Catalog：`GET /api/v1/remote-experts`、`GET /api/v1/remote-experts/{agent_ref}`，权限 `expert:invoke`；
- Catalog item 最少包含 `agent_ref/display_name/status/capabilities`，`status=ready|unavailable`；
- ACP profile schema required：`profile_version=1`、`name`、`agent_ref`，可选 `knowledge_refs[]/connector_binding_refs[]/integration_account_refs[]`；
- Managed Credential：`NODESKCLAW_CREDENTIAL_MODE=managed`，Main 注入 access/refresh token；Adapter 不读写 OS keyring、不主动 login；401 内存 refresh 一次并仅重试 logical request 一次；token 不进入 ACP JSON-RPC；
- Provider frontend contract gate 已通过；production gate 尚未通过。

## 3.2 Problem

当前 `work/prd-v6.3` 不能直接、正确地消费新 Remote ACP Expert，存在以下可验证缺口：

- **P-001 Session Classification Gap**：SMC session metadata 无 `remote-expert-acp`，重启后无法判断应恢复 ACP 还是 Local Hermes。
- **P-002 Identity Gap**：没有持久化 `agent_ref + acp_session_id + profile_digest + contract pin` 的绑定 SOT。
- **P-003 Runtime Ownership Gap**：没有独立的 Main-owned ACP child lifecycle / JSON-RPC client / compatibility gate。
- **P-004 IPC Boundary Gap**：现有 `expert-api.ts` 是旧 Expert 语义，复用会违反 Provider forbidden dependencies。
- **P-005 File Provider Gap**：ManagedFile provider 只有 `expert|skill-run`，新 ACP artifact 会被误路由到旧 Expert transfer。
- **P-006 Resume Gap**：当前 history/resume 分类不认识 ACP session；若只加 UI Selector，重启后执行连续性会丢失。
- **P-007 Credential Gap**：Provider 要求 managed credential child injection；当前尚无 ACP 专用 credential/process bridge。
- **P-008 Contract Supply-chain Gap**：SMC 仓库尚无本地 lock，无法在 build/runtime 验证 tag/components digest。
- **P-009 Legacy Collision**：`Chat.tsx` 已包含旧 Expert UI，若不隔离会形成同一 Compose 内两套 Remote Expert SOT。

## 3.3 Impact

```text
业务影响：无法把 NodeSkClaw Remote Expert 作为稳定的企业远程智能体接入 Original Chat。
工程影响：若直接复用旧 Expert，会形成 ACP + Projection + Skill Run 多执行链并存，恢复和故障归因失真。
安全影响：若 Renderer 直接调用 Backend 或携带 token，将破坏已有 Main-only 信任边界。
运维影响：缺少 Contract/Adapter version gate 时，桌面与 Provider 可发生静默协议漂移。
AI Coding 影响：没有冻结 SOT/identity/side-effect/failure 语义时，Coding Agent 很容易“看起来能跑”但错误复用旧模块。
```

---

# 4. Scope

## 4.1 In Scope

- `SCOPE-001`：为 ChatRun / session metadata 增加 `remote-expert-acp` 一等执行分类。→ `REQ-ACP-002`
- `SCOPE-002`：建立 SMC 本地 Contract Lock + build/runtime compatibility gate。→ `REQ-ACP-001`
- `SCOPE-003`：Electron Main 新增独立 `remote-expert-acp` bounded context。→ `REQ-ACP-003/004/005`
- `SCOPE-004`：Original Chat Compose 增加 Remote Expert Context Control，不创建新 Expert Screen。→ `REQ-ACP-006`
- `SCOPE-005`：ACP `initialize/session/new/session/prompt/session/resume/session/close/cancel` 生命周期。→ `REQ-ACP-007/008/012`
- `SCOPE-006`：ACP event → SMC Chat semantic event 映射。→ `REQ-ACP-007`
- `SCOPE-007`：Managed File attachment → ACP attachment resource_link。→ `REQ-ACP-009`
- `SCOPE-008`：ACP artifact resource_link → ManagedFile → FilePreview。→ `REQ-ACP-010`
- `SCOPE-009`：ACP permission request → SMC Approval UI → ACP decision。→ `REQ-ACP-011`
- `SCOPE-010`：Remote ACP transcript/history 本地持久化与重启恢复。→ `REQ-ACP-008/013`
- `SCOPE-011`：managed credential、安全、日志净化、故障诊断。→ `REQ-ACP-014/015`
- `SCOPE-012`：旧 Expert / Skill Run 静态依赖隔离和 feature gate。→ `REQ-ACP-016/018`
- `SCOPE-013`：Windows x64 sidecar package/integrity gate。→ `REQ-ACP-017`
- `SCOPE-014`：Durable Remote Context immutable-per-ACP-session。→ `REQ-ACP-019`

## 4.2 Out of Scope

- `NON-GOAL-001`：本版本 **MUST NOT** 改造 NodeSkClaw Provider 协议或 Remote Agent 实现。`[A-ACP-001]`
- `NON-GOAL-002`：本版本 **MUST NOT** 通过 `WORK-EXPERT-CONTRACT`、`ExpertProjectionStore`、`expert.start` 或 `SkillRunStore` 执行 Remote Expert。`[A-ACP-016]`
- `NON-GOAL-003`：本版本 **MUST NOT** 把 Remote Expert 做成独立工作台/独立聊天路由；入口固定为 Original Chat / Compose。`[A-ACP-006]`
- `NON-GOAL-004`：本版本 **MUST NOT** 在 ACP session 创建后原地热修改 `agent_ref/knowledge_refs/connector_binding_refs/integration_account_refs`。`[A-ACP-019]`
- `NON-GOAL-005`：本版本 **MUST NOT** 自动批准外部动作，也不引入 Always Allow。`[A-ACP-011]`
- `NON-GOAL-006`：本版本 **MUST NOT** 将 `productionGate=unpassed` 的 Provider 作为正式 GA 默认开启。`[A-ACP-018]`
- `NON-GOAL-007`：本版本不实现跨 Desktop 的 ACP child pooling；每个 active Remote Expert Chat 使用独立 Adapter process（SMC Design Decision）。
- `NON-GOAL-008`：本版本不缓存长期 attachment_ref；附件按 turn 上传/证明。

## 4.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Chat UX / Compose | Renderer | semantic state/ManagedFile IDs | prompt/context/decision intents | token、Backend URL、raw ACP |
| Secure Bridge | Preload | typed Renderer call | typed IPC | network、child process |
| Remote Expert Consumer | Electron Main | typed IPC、token store、files | semantic events/ManagedFile | Remote Agent business execution |
| ACP Runtime | `nodeskclaw-acp` | ACP JSON-RPC、profile、managed credential | ACP events/resource links | SMC UI/history SOT |
| Remote Expert Catalog | NodeSkClaw Backend | authorized GET | expert DTO | SMC selection state |
| Remote Agent | NodeSkClaw Backend/Agent | Adapter request | run/tool/approval/artifact | SMC local transcript |
| Local Hermes Chat | existing SMC/Hermes | local chat | local stream | Remote ACP Expert |
| Skill Run | existing SMC Skill Run | skill task | task projection | Remote ACP Expert |

---

# 5. Terminology / Domain Model

- **SMC Chat Session**：SMC UI/history identity；沿用 `sessionId`，不等于 ACP Session ID。
- **ACP Session**：NodeSkClaw ACP execution continuity identity；由 `acp_session_id` 表示。
- **Remote Expert Binding**：一个 SMC Chat Session 与一个 ACP Session、Agent Profile、Contract Pin 的持久化绑定。
- **Remote Expert Profile**：ACP schema v1 的 `agent_ref + durable refs` canonical object。
- **Durable Context**：`agent_ref/knowledge_refs/connector_binding_refs/integration_account_refs`；ACP Session 创建后不可原地变更。
- **Turn Context**：当前 prompt + attachments；只影响一个 turn。
- **Contract Lock**：SMC 仓内 pin 的 tag/object SHA/target commit/component versions/digests/bundle digest。
- **Semantic Event**：SMC renderer 能理解的 assistant/reasoning/tool/permission/artifact/lifecycle event；不等于 raw ACP JSON-RPC。
- **Managed Credential**：Main 读取/刷新凭据并通过 child environment 注入 Adapter；Renderer 与 ACP JSON-RPC 不持有 token。
- **ManagedFile**：SMC File Platform 的统一文件 identity；Remote Artifact 落地后仍以 ManagedFile 进入预览/关联链。
- **Legacy Expert**：当前 `modules/expert` + Main `expert/*` + `ExpertProjectionStore` 执行体系，仅兼容旧功能，不是 Remote ACP Expert 的 Provider。
- **Frontend Contract Gate**：允许 SMC 依据冻结契约开发和联调的 Provider gate。
- **Production Gate**：允许生产默认发布的 Provider LIVE gate；当前为 `unpassed`。

---

# 6. System Context

## 6.1 Context Diagram

```text
┌──────────────────────── smc-copilot/apps/work ────────────────────────┐
│                                                                       │
│  Original Chat.tsx                                                    │
│       │                                                               │
│       ├── MessageList / FilePreview (existing)                        │
│       │                                                               │
│       └── ChatInput                                                   │
│             └── toolbarExtras                                         │
│                   └── RemoteExpertContextControl                      │
│                             │ semantic IPC                            │
│                             ▼                                         │
│  Preload: remote-expert-api.ts                                        │
│                             │                                         │
│                             ▼                                         │
│  Electron Main: remote-expert-acp/                                    │
│       ├── ContractLock / CompatibilityGate                            │
│       ├── RemoteExpertCatalogClient ── AuthorizedBackendTransport ─┐  │
│       ├── ManagedCredentialBridge                                   │  │
│       ├── AcpProcessManager                                         │  │
│       ├── AcpClient / AcpSessionManager                             │  │
│       ├── AcpEventMapper / PermissionMapper                         │  │
│       ├── RemoteAttachmentBridge                                    │  │
│       ├── RemoteArtifactBridge ── ManagedFile/FilePreview            │  │
│       └── RemoteExpertSessionMaterializer                           │  │
└──────────────────────────────┬───────────────────────────────────────┘  │
                               │ stdio ACP v1                              │
                               ▼                                           │
                       nodeskclaw-acp                                      │
                               │ HTTPS / SSE                               │
                               ▼                                           │
                    nodeskclaw-backend / Remote Agent ◄───────────────────┘
                               │
                               ▼
                             Hermes
```

## 6.2 System Boundary

SMC 管理：选择状态、Local Chat identity、ACP child、credential injection、typed IPC、Chat event projection、local transcript、ManagedFile、用户 permission decision、contract compatibility。

NodeSkClaw 管理：Expert Catalog 业务可见性、ACP Adapter 协议实现、Remote Agent Run、Tool execution、Approval state、Artifact source、Remote Session proof。

严格边界：Renderer 不直接访问 NodeSkClaw；Remote ACP Expert 不直接访问 Local Hermes Gateway；旧 Expert 与 Skill Run 不可成为 fallback。

---

# 7. Authoritative State / Source of Truth

| State | SOT | Projection / Cache | 禁止作为 SOT |
|---|---|---|---|
| SMC Chat transcript | local `sessions/messages` | Renderer ChatMessage[] | ACP event memory |
| Chat execution classification | `desktop_session_metadata` | ChatRun | UI selector state |
| ACP execution continuity | `desktop_remote_expert_bindings.acp_session_id` + Provider session | process memory | SMC `sessionId` |
| Remote Expert durable profile | `desktop_remote_expert_bindings` canonical fields | Compose badges | Catalog display object |
| Contract compatibility | checked-in `contract-lock.json` | runtime compatibility state | Git tag name alone |
| Remote Expert catalog | NodeSkClaw Catalog API | Main TTL cache | old Expert catalog |
| Access/Refresh credential | existing Main auth/token store | ACP child environment, process lifetime | Renderer/localStorage/ChatRun |
| Attachment local identity | ManagedFile | Attachment UI | Provider attachment_ref |
| Remote artifact source | NodeSkClaw resource identity | ManagedFile remote metadata | preview URL |
| Permission execution state | ACP/Remote Agent | SMC approval card | local button state |

State priority rule：Provider execution state wins for Remote run lifecycle；SMC DB wins for rendered historical transcript；binding wins for which ACP session a Chat must resume.

---

# 8. State Machine

## 8.1 Remote Expert Chat Lifecycle

```text
LOCAL_CHAT
   │ user selects ready Remote Expert and sends first turn
   ▼
REMOTE_PROFILE_SELECTED
   │ contract compatible + credentials present + profile frozen
   ▼
ACP_STARTING
   │ initialize OK
   ▼
ACP_SESSION_CREATING ───────────────┐
   │ session/new OK                 │ failure
   ▼                                ▼
REMOTE_READY                    REMOTE_BLOCKED
   │ prompt
   ▼
REMOTE_RUNNING
   ├─ permission ─► WAITING_PERMISSION ─allow/reject─► REMOTE_RUNNING
   ├─ cancel ─────► CANCELLING ─► REMOTE_READY
   ├─ end_turn ──────────────────► REMOTE_READY
   └─ transport/process failure ─► REMOTE_RECOVERY_REQUIRED

Desktop restart / history open:
REMOTE_PERSISTED
   │ spawn + initialize + session/resume(existing acp_session_id)
   ├─ success ─► REMOTE_READY
   └─ forbidden/not_found/profile_mismatch ─► RESUME_BLOCKED
```

## 8.2 Durable Context Change

```text
REMOTE_READY(existing ACP session)
  │ user changes agent / knowledge / connector / integration account
  ▼
NEW_SESSION_REQUIRED
  │ explicit confirmation
  ├─ cancel ─► keep existing binding
  └─ confirm ─► close old ACP session (best effort) + create NEW SMC Chat/ACP binding
```

禁止在原 binding 上覆盖 profile。

## 8.3 Turn State

```text
IDLE -> SUBMITTING -> STREAMING ->
  COMPLETED | FAILED | CANCELLED | WAITING_PERMISSION
```

Turn failure 不删除已经持久化的历史；未确认成功的 side effect 不在 SMC 侧自动重试。

---

# 9. Data / Schema Contract

## 9.1 Schema Rule

所有新持久化 schema 由 Main owner；Renderer 只接收 DTO。所有 JSON 数组进入 identity 计算前执行 trim-empty → dedupe → Unicode codepoint ascending sort。所有 persisted JSON 使用 UTF-8 canonical JSON、无 insignificant whitespace。

### 9.1.1 TypeScript execution classification

```ts
type ChatExecutionMode =
  | "local-chat"
  | "skill-run"
  | "remote-expert";

type ExecutionProvider =
  | "hermes-chat"
  | "skill-run"
  | "remote-expert-acp";
```

有效组合新增：

```text
sessionKind="chat" + executionProvider="remote-expert-acp"
```

### 9.1.2 `desktop_remote_expert_bindings`

```sql
CREATE TABLE desktop_remote_expert_bindings (
  session_scope TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider='nodeskclaw-acp'),
  agent_ref TEXT NOT NULL,
  acp_session_id TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  profile_digest TEXT NOT NULL,
  knowledge_refs_json TEXT NOT NULL,
  connector_binding_refs_json TEXT NOT NULL,
  integration_account_refs_json TEXT NOT NULL,
  contract_tag TEXT NOT NULL,
  contract_bundle_digest TEXT NOT NULL,
  acp_protocol_version INTEGER NOT NULL,
  acp_adapter_version TEXT NOT NULL,
  acp_adapter_digest TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  catalog_digest TEXT NOT NULL,
  remote_agent_version TEXT NOT NULL,
  remote_agent_digest TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(session_scope, profile_id, session_id),
  UNIQUE(session_scope, profile_id, acp_session_id)
);
```

`state ∈ active | resume_blocked | closed`。

### 9.1.3 Remote Expert profile canonical form

```json
{
  "profile_version": 1,
  "name": "<display name snapshot>",
  "agent_ref": "<provider agent_ref>",
  "knowledge_refs": [],
  "connector_binding_refs": [],
  "integration_account_refs": []
}
```

Digest：`sha256(UTF8(canonical_json))` lowercase hex。

### 9.1.4 Contract lock target

Path：

```text
apps/work/contracts/nodeskclaw/remote-expert-frontend-v1.0.0/contract-lock.json
```

最低字段：tag、tagObjectSha、targetCommit、implementationCommit、bundleDigest、protocolVersion、component version/digest、expected gates。

### 9.1.5 Managed File provider

```ts
type ManagedFileRemoteProvider =
  | "expert"          // legacy only
  | "skill-run"
  | "remote-expert-acp";
```

## 9.2 Field Semantic Table

| Field | Owner | Required | Mutable | Semantic |
|---|---|---:|---:|---|
| `session_id` | SMC | yes | no | Local Chat/history identity |
| `agent_ref` | Provider catalog / binding snapshot | yes | no in binding | Remote expert identity |
| `acp_session_id` | ACP Provider | yes after session/new | no | remote execution continuity |
| `profile_digest` | SMC Main | yes | no | exact durable profile identity |
| `knowledge_refs_json` | SMC Main | yes | no | sorted/deduped durable refs |
| `connector_binding_refs_json` | SMC Main | yes | no | sorted/deduped durable refs |
| `integration_account_refs_json` | SMC Main | yes | no | sorted/deduped durable refs |
| `contract_bundle_digest` | checked-in lock | yes | no | aggregate integrity |
| access/refresh token | Auth Store | yes at runtime | yes | never persisted in binding |
| `attachment_ref` | Provider | per turn | expires | turn-scoped remote input identity |
| artifact resource id | Provider | per output | no | remote output identity |

---

# 10. Requirement Unit

## REQ-ACP-001 — Contract Pin & Compatibility Gate

### Goal
保证 SMC 消费精确冻结的 Provider Contract，而不是漂移的 `nodeskclaw/main`。

### Normative Requirement
- SMC **MUST** 检入 `contract-lock.json`，固定 tag/object SHA/target commit/bundle digest/component digests。`[A-ACP-001]`
- Build/CI **MUST** 校验 lock 与 vendored/下载的 Provider contract fixture 一致。`[A-ACP-001]`
- Runtime **MUST** 在启动 Remote Expert 前验证 Adapter version/protocol/contract digest；不兼容时 fail-closed。`[A-ACP-001]`
- Runtime **MUST NOT** 因不兼容 fallback 到 Legacy Expert 或 Skill Run。`[A-ACP-001,A-ACP-016]`

### Inputs
Contract tag、manifest、component pins、Adapter version output。
### Preconditions
Provider Frontend Contract tag 可解析；本地 lock 已存在。
### Authoritative State
checked-in contract lock + Provider component SHA256SUMS-derived digest。
### State Transition
`UNKNOWN -> COMPATIBLE | INCOMPATIBLE`。
### Allowed Side Effects
写 diagnostics；禁用 Remote Expert feature。
### Forbidden Side Effects
修改 Provider；切换旧执行链；覆盖 lock。
### Ownership Scope
`apps/work/contracts/nodeskclaw/**`、Main compatibility module。
### Idempotency
同一 binary + lock 重复验证结果一致。
### Failure Semantics
任何 digest/version/protocol mismatch -> `ACP_CONTRACT_INCOMPATIBLE`。
### Postconditions
只有 COMPATIBLE 可启动 ACP session。
### Invariants
Tag 名不是唯一信任根。
### Error Codes
`ACP_CONTRACT_LOCK_MISSING`、`ACP_CONTRACT_INCOMPATIBLE`、`ACP_ADAPTER_VERSION_UNREADABLE`。
### Acceptance
`A-ACP-001`。
### Evidence
CI lock verification output、runtime compatibility test、tamper negative test。

## REQ-ACP-002 — Session Classification & Binding Persistence

### Goal
让 SMC 在关闭/重启后仍知道某个 Chat 属于 Remote ACP Expert，并精确找到原 ACP Session。

### Normative Requirement
- Session metadata **MUST** 支持 `executionProvider="remote-expert-acp"` 与 `sessionKind="chat"`。`[A-ACP-002]`
- SMC **MUST** 分离 `session_id` 与 `acp_session_id`。`[A-ACP-002]`
- Binding **MUST** 持久化 agent/profile/contract identity，但 **MUST NOT** 持久化 access/refresh token。`[A-ACP-002,A-ACP-014]`
- Migration **MUST** 保持既有 `hermes-chat` / `skill-run` 行语义不变。`[A-ACP-002]`

### Inputs
SMC session id、ACP session/new result、canonical profile、contract lock。
### Preconditions
metadata DB 可迁移。
### Authoritative State
`desktop_session_metadata` + `desktop_remote_expert_bindings`。
### State Transition
`unbound -> active -> resume_blocked|closed`。
### Allowed Side Effects
SQLite migration/upsert binding/cache classification。
### Forbidden Side Effects
更改旧 session provider；token 入库。
### Ownership Scope
Main session metadata/binding stores、shared continuation DTO。
### Idempotency
同一个 SMC session 重复 upsert 相同 binding 无变化；不同 acp_session/profile_digest 冲突。
### Failure Semantics
binding DB transaction fail 时，不报告 session ready。
### Postconditions
任何 Remote Expert persisted Chat 都可被唯一分类和恢复。
### Invariants
一个 active SMC Chat 只有一个 active ACP binding。
### Error Codes
`REMOTE_BINDING_CONFLICT`、`REMOTE_BINDING_NOT_FOUND`、`REMOTE_METADATA_MIGRATION_FAILED`。
### Acceptance
`A-ACP-002`。
### Evidence
migration test、restart fixture、unique constraint test。

## REQ-ACP-003 — Remote Expert Catalog Client

### Goal
通过 Main 安全消费冻结 Catalog，并为 Compose 提供 typed expert list。

### Normative Requirement
- Main **MUST** 使用 `AuthorizedBackendTransport` 调用 `GET /api/v1/remote-experts` 和 get endpoint。`[A-ACP-003]`
- Renderer **MUST NOT** 直接获得 Backend URL/access token。`[A-ACP-003,A-ACP-014]`
- `status=unavailable` **MUST** 显示但不可选择启动。`[A-ACP-003]`
- Catalog DTO **MUST** 至少验证 `agent_ref/display_name/status/capabilities`。`[A-ACP-003]`

### Inputs
Main auth、Catalog response。
### Preconditions
用户已登录且具 `expert:invoke`。
### Authoritative State
NodeSkClaw Catalog API。
### State Transition
`loading -> ready|auth_error|unavailable`。
### Allowed Side Effects
Main in-memory bounded cache。
### Forbidden Side Effects
写旧 Expert catalog store。
### Ownership Scope
`remote-expert-acp/catalog/**`。
### Idempotency
GET 无业务副作用。
### Failure Semantics
401 走现有 auth refresh；403/404/5xx 映射净化错误。
### Postconditions
Renderer 获得无秘密的 semantic DTO。
### Invariants
Catalog 不决定 SMC transcript identity。
### Error Codes
`REMOTE_EXPERT_CATALOG_AUTH`、`REMOTE_EXPERT_CATALOG_UNAVAILABLE`、`REMOTE_EXPERT_SCHEMA_INVALID`。
### Acceptance
`A-ACP-003`。
### Evidence
contract fixture test、401 refresh test、unavailable UI test。

## REQ-ACP-004 — Main-owned ACP Process Lifecycle

### Goal
使 ACP runtime 成为 Electron Main 管理的受控 child，而非 Renderer 能力。

### Normative Requirement
- Electron Main **MUST** 是 `nodeskclaw-acp` process 唯一 owner。`[A-ACP-004]`
- P0 每个 active Remote Expert Chat **MUST** 使用独立 child process。`[A-ACP-004]`
- Child stdout **MUST** 仅由 ACP JSON-RPC parser 消费；stderr 进入 sanitized diagnostics。`[A-ACP-004,A-ACP-014]`
- Renderer **MUST NOT** spawn/kill child 或读取 raw stdout/stderr。`[A-ACP-004]`

### Inputs
Adapter executable、profile、credentials、contract lock。
### Preconditions
binary integrity/compatibility passed。
### Authoritative State
Main `AcpProcessManager` process registry。
### State Transition
`stopped -> starting -> initialized -> active -> closing -> stopped/crashed`。
### Allowed Side Effects
spawn/terminate child、temporary profile file。
### Forbidden Side Effects
global ACP login、OS keyring write、Renderer child handle。
### Ownership Scope
`src/main/remote-expert-acp/acp/**`。
### Idempotency
同 session ensureProcess 并发去重。
### Failure Semantics
start timeout/crash -> session unavailable；不创建第二个 run。
### Postconditions
active process 与 SMC Chat binding 一一对应。
### Invariants
profile/credential process scoped。
### Error Codes
`ACP_PROCESS_START_FAILED`、`ACP_PROCESS_CRASHED`、`ACP_INITIALIZE_TIMEOUT`。
### Acceptance
`A-ACP-004`。
### Evidence
process lifecycle unit/integration、crash injection。

## REQ-ACP-005 — Semantic Preload IPC Boundary

### Goal
保持 Context Isolation：Renderer 只看 semantic contract，不看 raw ACP/network credential。

### Normative Requirement
- 新增 `remote-expert-api.ts`，**MUST NOT** 把新能力塞进 legacy `expert-api.ts`。`[A-ACP-005,A-ACP-016]`
- IPC **MUST** 对输入做 schema validation，事件 payload **MUST** 是 SMC semantic DTO。`[A-ACP-005]`
- Raw ACP JSON-RPC、access/refresh token、absolute backend URL **MUST NOT** 跨到 Renderer。`[A-ACP-005,A-ACP-014]`

### Inputs
Renderer intents / Main events。
### Preconditions
contextIsolation/preload 正常。
### Authoritative State
shared `remote-expert-acp` type contract。
### State Transition
N/A。
### Allowed Side Effects
ipc invoke/on/off。
### Forbidden Side Effects
arbitrary network proxy、raw method passthrough。
### Ownership Scope
shared/preload/main IPC registration。
### Idempotency
subscribe/unsubscribe 可重复且无泄漏。
### Failure Semantics
schema invalid -> reject without child/network call。
### Postconditions
Renderer API 面只包含 catalog/session/prompt/cancel/permission/artifact operations。
### Invariants
IPC channel allowlist 固定。
### Error Codes
`REMOTE_IPC_INVALID_INPUT`、`REMOTE_IPC_NOT_READY`。
### Acceptance
`A-ACP-005`。
### Evidence
preload contract tests、secret scan、raw-method negative test。

## REQ-ACP-006 — Original Chat Compose Remote Expert Context

### Goal
在现有 ChatInput extension seam 内选择 Remote Expert，而不创建第二套聊天 UI。

### Normative Requirement
- Remote Expert control **MUST** 通过 `ChatInput.toolbarExtras` 或等价现有 Compose extension seam 集成。`[A-ACP-006]`
- UI **MUST** 展示 selected expert 与 durable context 摘要。`[A-ACP-006]`
- `unavailable` expert **MUST** disabled；不得静默隐藏 Provider 返回项。`[A-ACP-003,A-ACP-006]`
- 新 ACP 路径 **MUST NOT** mount legacy Expert default entry。`[A-ACP-006,A-ACP-016]`

### Inputs
catalog DTO、binding state。
### Preconditions
Original Chat 可用。
### Authoritative State
未建 session 前为 Renderer draft；建 session 后为 persisted binding。
### State Transition
`none -> draft selected -> bound`。
### Allowed Side Effects
local draft state；first submit 才创建 remote session。
### Forbidden Side Effects
selection click 即执行 Remote Agent。
### Ownership Scope
`renderer/screens/Chat/remote-expert/**` + Chat integration seam。
### Idempotency
反复选择相同 expert 不创建 session。
### Failure Semantics
catalog unavailable 时 Local Chat 仍可用，Remote Expert 控件显示不可用原因。
### Postconditions
Local Chat 与 Remote Expert 模式视觉可区分。
### Invariants
不改变 Skill Run UI ownership。
### Error Codes
UI 映射 Main semantic errors。
### Acceptance
`A-ACP-006`。
### Evidence
component test、golden screenshot、interaction test。

## REQ-ACP-007 — ACP Session New / Prompt / Event Mapping

### Goal
完成从 first remote prompt 到统一 Chat transcript 的主执行闭环。

### Normative Requirement
- First turn **MUST** 按 `initialize -> session/new -> persist binding -> session/prompt` 顺序执行。`[A-ACP-007]`
- Prompt **MUST** 通过 ACP v1；**MUST NOT** 直接 POST Remote Agent run API。`[A-ACP-007,A-ACP-016]`
- ACP agent message/reasoning/tool/lifecycle events **MUST** 先映射为 SMC semantic events，再进入 Renderer。`[A-ACP-007]`
- Unknown ACP notification **MUST** 记录 sanitized diagnostic 且不得崩溃 Chat；协议 required-field violation 则当前 turn fail。`[A-ACP-007]`

### Inputs
prompt text、ACP profile、turn attachments。
### Preconditions
contract compatible、expert ready、managed credential available。
### Authoritative State
ACP session/run for execution；SMC transcript for rendered history。
### State Transition
`REMOTE_READY -> REMOTE_RUNNING -> REMOTE_READY|FAILED|WAITING_PERMISSION`。
### Allowed Side Effects
remote run、local semantic stream、transcript finalize。
### Forbidden Side Effects
double submit、旧 Expert projection write。
### Ownership Scope
AcpClient/AcpEventMapper/Chat remote transport。
### Idempotency
UI double-click/IPC duplicate guarded by turnId；不自动重复 side-effecting prompt。
### Failure Semantics
transport ambiguity -> fail turn and require user explicit retry; no blind prompt retry。
### Postconditions
正常 end_turn 后 transcript finalized。
### Invariants
one active turn per ACP session in P0。
### Error Codes
`ACP_PROMPT_REJECTED`、`ACP_PROTOCOL_ERROR`、`ACP_OUTCOME_UNKNOWN`。
### Acceptance
`A-ACP-007`。
### Evidence
provider golden prompt fixture、stream mapping tests、LIVE transcript capture。

## REQ-ACP-008 — Session Resume & Recovery

### Goal
Desktop restart 后恢复同一 ACP Session，而不是 silently fork。

### Normative Requirement
- 打开 `executionProvider=remote-expert-acp` 的历史 Chat 时 **MUST** 读取 persisted binding 并调用 ACP `session/resume(acp_session_id)`。`[A-ACP-008]`
- Resume 前 **MUST** 重做 contract compatibility gate。`[A-ACP-008]`
- `forbidden/not_found/profile_mismatch` 时 **MUST** 进入 `resume_blocked`，保留 transcript 可读但禁用 submit。`[A-ACP-008]`
- SMC **MUST NOT** 在 resume 失败后静默 `session/new`。`[A-ACP-008]`

### Inputs
session metadata、binding、adapter。
### Preconditions
历史 session 存在。
### Authoritative State
binding + Provider ACP session proof。
### State Transition
`REMOTE_PERSISTED -> RESUMING -> REMOTE_READY|RESUME_BLOCKED`。
### Allowed Side Effects
spawn child、binding state update。
### Forbidden Side Effects
新 Remote run、改写旧 transcript。
### Ownership Scope
AcpSessionManager + Layout resume classification。
### Idempotency
并发 resume 合并；成功后重复 ensure 不重复 resume。
### Failure Semantics
offline/timeout -> `temporarily-unavailable` 可重试；semantic mismatch -> resume_blocked。
### Postconditions
成功时继续原 ACP identity。
### Invariants
`session_id != acp_session_id` 无相等要求。
### Error Codes
`ACP_SESSION_RESUME_FORBIDDEN`、`ACP_SESSION_NOT_FOUND`、`ACP_SESSION_PROFILE_MISMATCH`、`ACP_SESSION_TEMPORARILY_UNAVAILABLE`。
### Acceptance
`A-ACP-008`。
### Evidence
restart E2E、resume negative fixtures。

## REQ-ACP-009 — Attachment ResourceLink Bridge

### Goal
复用现有 ManagedFile/ChatInput attachment UX，将当前 turn 文件安全转换为 ACP attachment resource_link。

### Normative Requirement
- Renderer **MUST** 继续只传 ManagedFile/Attachment semantic identity。`[A-ACP-009]`
- Main **MUST** 通过 authorized backend attachment flow 获取当前有效 `attachment_ref`，再生成 Provider Contract 指定 resource_link。`[A-ACP-009]`
- Attachment ref **MUST NOT** 进入 durable Remote Expert profile/binding。`[A-ACP-009,A-ACP-019]`
- Upload/proof 失败 **MUST** 在发送 prompt 前失败，不得发送缺文件的降级 prompt。`[A-ACP-009]`

### Inputs
selected ManagedFiles。
### Preconditions
文件可读/安全检查通过。
### Authoritative State
ManagedFile local identity + Provider current attachment_ref。
### State Transition
`selected -> uploading/proving -> linked -> prompt`。
### Allowed Side Effects
remote attachment upload、temporary transfer state。
### Forbidden Side Effects
长久缓存 ref 作为 session context。
### Ownership Scope
RemoteAttachmentBridge + existing File Platform。
### Idempotency
同一次 turn preparation 可按 content/turn identity 去重，但跨 turn 默认重新证明/上传。
### Failure Semantics
任何附件失败 -> whole prompt preparation fail。
### Postconditions
ACP prompt resource list 与 UI snapshot 一致。
### Invariants
attachment 是 turn-scoped。
### Error Codes
`REMOTE_ATTACHMENT_UPLOAD_FAILED`、`REMOTE_ATTACHMENT_PROOF_FAILED`。
### Acceptance
`A-ACP-009`。
### Evidence
PDF/XLSX fixture、failed upload negative test、resource_link capture。

## REQ-ACP-010 — Artifact ResourceLink → ManagedFile

### Goal
将 Remote Agent 输出接入现有 File Platform / FilePreview，而不让 Renderer 接触远端内部 URL。

### Normative Requirement
- ACP artifact resource_link **MUST** 在 Main 严格 parse/validate。`[A-ACP-010]`
- Remote artifact **MUST** 建立 `provider="remote-expert-acp"` 的 ManagedFile 记录。`[A-ACP-010]`
- materializer **MUST** 对 provider 做 exhaustive switch；**MUST NOT** 以“非 skill-run = legacy expert”作为 fallback。`[A-ACP-010,A-ACP-016]`
- Renderer **MUST** 仅通过 ManagedFileId/FilePreview 访问已物化文件。`[A-ACP-010,A-ACP-014]`

### Inputs
artifact resource_link/metadata。
### Preconditions
artifact 属于当前授权 run/session。
### Authoritative State
Provider artifact source + ManagedFile metadata。
### State Transition
`remote-only -> materializing -> local+remote|failed`。
### Allowed Side Effects
authorized download、checksum、managed copy、association。
### Forbidden Side Effects
暴露 raw signed/internal URL。
### Ownership Scope
RemoteArtifactBridge + File Platform。
### Idempotency
同 ManagedFile materialize 并发合并；完成后复用本地 copy。
### Failure Semantics
checksum/size/download mismatch -> failed，不打开文件。
### Postconditions
FilePreview 可按既有机制预览支持格式。
### Invariants
artifact bytes 不进入 IPC event body。
### Error Codes
`REMOTE_ARTIFACT_URI_INVALID`、`REMOTE_ARTIFACT_DOWNLOAD_FAILED`、`REMOTE_ARTIFACT_INTEGRITY_FAILED`。
### Acceptance
`A-ACP-010`。
### Evidence
artifact live/fixture test、provider routing test、FilePreview E2E。

## REQ-ACP-011 — Permission Bridge

### Goal
让 Remote Agent 外部动作保持 human-in-the-loop，且批准结果只通过 ACP 返回。

### Normative Requirement
- `session/request_permission` **MUST** 映射到 SMC permission semantic state。`[A-ACP-011]`
- P0 UI **MUST** 只提供 `allow_once` 与 `reject_once`。`[A-ACP-011]`
- UI 关闭/Esc **MUST** 显式发送 `reject_once`。`[A-ACP-011]`
- SMC **MUST NOT** 绕过 ACP 直接调用 Remote Agent approval endpoint。`[A-ACP-011,A-ACP-016]`

### Inputs
ACP permission request、user decision。
### Preconditions
turn active。
### Authoritative State
ACP/Remote Agent approval state。
### State Transition
`running -> waiting_permission -> running|failed/cancelled`。
### Allowed Side Effects
ACP permission response。
### Forbidden Side Effects
autoApprove、persistent allow policy。
### Ownership Scope
PermissionMapper + existing approval visual primitives。
### Idempotency
同 request_id 仅接受首个 terminal decision。
### Failure Semantics
response send fail -> UI 保持 unresolved/error，不假定已批准。
### Postconditions
每个 permission request 有可审计 decision。
### Invariants
关闭窗口不等于批准。
### Error Codes
`ACP_PERMISSION_ALREADY_RESOLVED`、`ACP_PERMISSION_RESPONSE_FAILED`。
### Acceptance
`A-ACP-011`。
### Evidence
approval golden fixture、reject-on-close test、no-direct-backend assertion。

## REQ-ACP-012 — Cancellation & Session Close

### Goal
区分协议取消和进程故障清理，避免以 kill process 代替业务 cancel。

### Normative Requirement
- Chat Abort 对 Remote Expert **MUST** 路由到 ACP cancel 语义。`[A-ACP-012]`
- 正常 cancel **MUST NOT** 先 kill Adapter。`[A-ACP-012]`
- 若 cancel 后 5 秒 child/turn 无终态，Main **MAY** 强制终止该 child，并标记 recovery required。`[A-ACP-012]`
- 删除/显式关闭 Remote Chat 时 **MUST** best-effort `session/close`，但本地删除事务不依赖远端 close 永久成功。`[A-ACP-012]`

### Inputs
abort/close intent。
### Preconditions
active binding/process。
### Authoritative State
ACP lifecycle。
### State Transition
`running -> cancelling -> ready/recovery_required`；`active -> closing -> closed`。
### Allowed Side Effects
ACP cancel/close、child kill after grace。
### Forbidden Side Effects
取消其它 session process。
### Ownership Scope
AcpSessionManager/ProcessManager。
### Idempotency
重复 cancel/close 安全。
### Failure Semantics
close failure 记录 diagnostics；binding 可标 closed/tombstone 防止再 resume。
### Postconditions
UI 不再显示 turn running。
### Invariants
process kill 是 recovery，不是正常 cancel。
### Error Codes
`ACP_CANCEL_FAILED`、`ACP_CANCEL_GRACE_EXCEEDED`、`ACP_CLOSE_FAILED`。
### Acceptance
`A-ACP-012`。
### Evidence
cancel live test、hung process injection。

## REQ-ACP-013 — Transcript / History Persistence

### Goal
继续使用既有 Chat renderer/history 数据模型，不再建立 Remote Expert ProjectionStore。

### Normative Requirement
- Finalized Remote ACP user/assistant/reasoning/tool rows **MUST** 物化到既有 `sessions/messages`，并保持 `executionProvider=remote-expert-acp`。`[A-ACP-013]`
- Materialization **MUST** 使用 deterministic provider-specific platform_message_id 防重复。`[A-ACP-013]`
- 新路径 **MUST NOT** 写 `ExpertProjectionStore`。`[A-ACP-013,A-ACP-016]`
- History **MUST** 可由现有 `dbItemsToChatMessages()` 语义恢复 user/assistant/reasoning/tool rows。`[A-ACP-013]`

### Inputs
semantic turn events/final turn snapshot。
### Preconditions
SMC session/binding ready。
### Authoritative State
SMC `sessions/messages`。
### State Transition
stream-only -> finalized persisted。
### Allowed Side Effects
state DB rows/session cache。
### Forbidden Side Effects
把 ACP raw packet 当历史行。
### Ownership Scope
new `remote-expert-acp/session-materialize.ts`。
### Idempotency
deterministic IDs + DB uniqueness/upsert。
### Failure Semantics
persistence failure -> turn UI 标 local persistence error；不得重发 remote prompt。
### Postconditions
重启后 transcript 可读。
### Invariants
execution continuity 与 transcript storage 解耦。
### Error Codes
`REMOTE_TRANSCRIPT_PERSIST_FAILED`。
### Acceptance
`A-ACP-013`。
### Evidence
reopen DB test、duplicate materialize test。

## REQ-ACP-014 — Credential & Security Isolation

### Goal
遵循 Provider Managed Credential Contract 与 SMC 现有 Main trust boundary。

### Normative Requirement
- Child **MUST** 以 `NODESKCLAW_CREDENTIAL_MODE=managed` 启动，并由 Main 注入 access/refresh token。`[A-ACP-014]`
- Adapter **MUST NOT** 通过 SMC 启动路径读写 OS keyring或弹出 login。`[A-ACP-014]`
- Token **MUST NOT** 出现在 ACP JSON-RPC、Renderer、binding DB、Chat DB、diagnostic export、argv。`[A-ACP-014]`
- 401 refresh **MUST** 遵循 Provider Contract：内存刷新一次，对同一 logical request 最多重试一次。`[A-ACP-014]`
- Main/backend HTTP **MUST** 继续经过 `AuthorizedBackendTransport` 的 same-origin 与 error sanitization。`[A-ACP-014]`

### Inputs
existing Main auth/token state。
### Preconditions
用户已登录 NodeSkClaw。
### Authoritative State
Main token store/session auth SOT。
### State Transition
credential `valid -> refreshed_once | invalid`。
### Allowed Side Effects
child env/in-memory refresh。
### Forbidden Side Effects
secret logging/persistence/Renderer exposure。
### Ownership Scope
ManagedCredentialBridge + existing auth store。
### Idempotency
logical request 只允许一轮 refresh retry。
### Failure Semantics
第二次 401 -> auth-required，停止当前 remote operation。
### Postconditions
secret scan 无泄漏。
### Invariants
Renderer trust level不提升。
### Error Codes
`REMOTE_AUTH_REQUIRED`、`REMOTE_AUTH_REFRESH_FAILED`。
### Acceptance
`A-ACP-014`。
### Evidence
secret scanning、IPC snapshot、401 test、process env test。

## REQ-ACP-015 — Observability & Diagnostics

### Goal
让 ACP/Remote Expert 故障可定位，同时不泄露秘密和用户文件内容。

### Normative Requirement
- Main **MUST** 生成 `remote_session_trace_id` 与 per-turn `turn_id`，并关联 local session/acp session 的 redacted hash。`[A-ACP-015]`
- Logs **MUST NOT** 记录 token、raw refresh token、attachment bytes、full prompt、provider secrets。`[A-ACP-014,A-ACP-015]`
- Diagnostics **MUST** 至少记录 contract gate、adapter lifecycle、session lifecycle、event counts、permission latency、artifact/attachment transfer outcome。`[A-ACP-015]`

### Inputs
runtime events。
### Preconditions
logging service available。
### Authoritative State
structured diagnostics events。
### State Transition
N/A。
### Allowed Side Effects
sanitized local logs/support export。
### Forbidden Side Effects
secret/content dump。
### Ownership Scope
remote-expert diagnostics module。
### Idempotency
one terminal turn metric per turn_id。
### Failure Semantics
logging failure不得改变业务结果。
### Postconditions
support 可区分 contract/auth/process/resume/provider/file failures。
### Invariants
可观测性不成为数据外泄路径。
### Error Codes
N/A。
### Acceptance
`A-ACP-015`。
### Evidence
log schema tests、redaction tests、support export fixture。

## REQ-ACP-016 — Legacy Expert / Skill Run Isolation

### Goal
保证新 Remote ACP Expert 是独立 bounded context，不再复用旧 Expert 执行协议。

### Normative Requirement
- 新 `remote-expert-acp/**` **MUST NOT** import/use `WORK-EXPERT-CONTRACT`、`ExpertProjectionStore`、`expert.start`、`skillName`、`SkillRunStore`。`[A-ACP-016]`
- Remote Expert submit **MUST NOT** 进入 Skill Run API。`[A-ACP-016]`
- Legacy Expert 可保留兼容，但 **MUST NOT** 是 ACP compatibility/auth/runtime failure 的 fallback。`[A-ACP-016]`
- CI **MUST** 提供 forbidden dependency static test。`[A-ACP-016]`

### Inputs
source graph/build output。
### Preconditions
bounded-context paths defined。
### Authoritative State
source import graph + test allow/deny list。
### State Transition
N/A。
### Allowed Side Effects
legacy code保持原行为。
### Forbidden Side Effects
跨域复用旧 projection/start/skill path。
### Ownership Scope
whole `apps/work` compile graph for new feature。
### Idempotency
static test deterministic。
### Failure Semantics
violation -> CI FAIL / release blocked。
### Postconditions
new path可独立删除/升级。
### Invariants
ACP is唯一 Remote Expert execution protocol。
### Error Codes
`FORBIDDEN_REMOTE_EXPERT_DEPENDENCY` (build/test code)。
### Acceptance
`A-ACP-016`。
### Evidence
AST/import scan、runtime spy tests。

## REQ-ACP-017 — Adapter Packaging & Binary Integrity

### Goal
在企业 Windows Desktop 中以受控、可验证方式分发 NodeSkClaw ACP Adapter。

### Normative Requirement
- Windows x64 package **MUST** 将受支持 Adapter binary 作为应用资源或企业受控安装资源提供，且路径只由 Main 解析。`[A-ACP-017]`
- Main **MUST** 在 spawn 前验证 expected distribution/version/contract identity；不符合即禁用 Remote Expert。`[A-ACP-017]`
- Dev override **MUST** 只在 development build 生效；production 不接受任意用户路径。`[A-ACP-017]`

### Inputs
packaged adapter manifest/binary。
### Preconditions
contract compatible binary exists。
### Authoritative State
SMC package manifest + contract lock。
### State Transition
`not_verified -> verified|rejected`。
### Allowed Side Effects
read/hash/version probe。
### Forbidden Side Effects
从 Renderer 提供 executable path；production 随意下载执行。
### Ownership Scope
packaging/build + AcpBinaryResolver。
### Idempotency
相同 file hash verification stable。
### Failure Semantics
binary missing/tampered -> feature blocked；Local Chat 保持正常。
### Postconditions
只有 verified binary 可 spawn。
### Invariants
供应链失败不降级到 legacy expert。
### Error Codes
`ACP_BINARY_MISSING`、`ACP_BINARY_INTEGRITY_FAILED`、`ACP_BINARY_UNSUPPORTED`。
### Acceptance
`A-ACP-017`。
### Evidence
clean-machine packaging E2E、tamper test。

## REQ-ACP-018 — Feature / Release Gates

### Goal
区分“可开发/联调”与“可正式生产默认开启”。

### Normative Requirement
- SMC **MUST** 将 Provider `frontendContractGate=passed` 作为开发/Contract Test 前置条件。`[A-ACP-018]`
- Provider `productionGate=unpassed` 时，production build 中 Remote Expert **MUST** 默认关闭，仅允许显式 internal/alpha enablement。`[A-ACP-018]`
- GA gate **MUST** 要求 Provider production live evidence + SMC Golden Consumer live acceptance 全通过。`[A-ACP-018]`

### Inputs
provider release manifest、SMC feature gate config、acceptance evidence。
### Preconditions
contract lock可读取。
### Authoritative State
checked-in release policy + verified evidence manifest。
### State Transition
`DEV_READY -> ALPHA_READY -> PRODUCTION_READY`。
### Allowed Side Effects
feature enable/disable。
### Forbidden Side Effects
以 frontend gate 替代 production gate。
### Ownership Scope
feature gate/release pipeline。
### Idempotency
gate evaluation deterministic。
### Failure Semantics
任一 hard gate fail -> release blocked，但 Local Chat/Skill Run 不受影响。
### Postconditions
生产 exposure 与证据一致。
### Invariants
当前 PRD 允许实施，不宣称 production ready。
### Error Codes
`REMOTE_EXPERT_PRODUCTION_GATE_BLOCKED`。
### Acceptance
`A-ACP-018`。
### Evidence
release gate report、feature-default test。

## REQ-ACP-019 — Durable Context Immutability

### Goal
避免同一 ACP Session 在生命周期内发生无法证明的 agent/knowledge/account 语义漂移。

### Normative Requirement
- `agent_ref/knowledge_refs/connector_binding_refs/integration_account_refs` **MUST** 在 session/new 前 canonicalize 并生成 `profile_digest`。`[A-ACP-019]`
- Binding active 后这些字段 **MUST NOT** 原地变化。`[A-ACP-019]`
- 用户修改 durable context **MUST** 被解释为“创建新的 Remote Expert Chat/ACP Session”，需要显式确认。`[A-ACP-019]`
- `profile_digest` mismatch **MUST** 阻止 resume。`[A-ACP-008,A-ACP-019]`

### Inputs
Compose context draft。
### Preconditions
catalog/context refs selected。
### Authoritative State
persisted binding profile + digest。
### State Transition
`draft -> frozen`; changes -> `new_session_required`。
### Allowed Side Effects
创建新 SMC Chat/binding。
### Forbidden Side Effects
update existing active binding profile fields。
### Ownership Scope
profile builder/context control/binding store。
### Idempotency
同 canonical profile产生同 digest。
### Failure Semantics
canonicalization invalid ref -> prevent session/new。
### Postconditions
一个 ACP Session 始终对应单一 profile digest。
### Invariants
attachments 不属于 durable profile。
### Error Codes
`REMOTE_PROFILE_INVALID`、`REMOTE_PROFILE_IMMUTABLE`、`ACP_SESSION_PROFILE_MISMATCH`。
### Acceptance
`A-ACP-019`。
### Evidence
canonical hash tests、context-change UI/E2E、resume mismatch test。

---

# 11. Side-Effect Contract

| Operation | Allowed Side Effects | Forbidden Side Effects | Transaction / Compensation |
|---|---|---|---|
| Catalog list/get | authorized GET, memory cache | DB expert projection write | none |
| Select expert | Renderer draft only | remote run/session | none |
| First remote submit | spawn adapter, session/new, binding insert, prompt | legacy expert/skill run | binding commit before prompt; failure before prompt has no remote turn |
| Subsequent prompt | ACP prompt, transcript finalization | silent retry | ambiguity -> explicit user retry |
| Resume | spawn/init/resume, binding state update | session/new fallback | semantic resume failure -> blocked |
| Attachment | upload/proof, turn resource_link | durable profile mutation | all attachments prepared before prompt |
| Artifact materialize | authorized download, managed copy, hash | expose raw URL | failed bytes removed/quarantined |
| Permission | ACP decision | direct backend approval | one terminal decision/request |
| Cancel | ACP cancel; delayed kill recovery | immediate normal-path kill | 5s grace then recovery kill |
| Close/delete | ACP close best effort, local tombstone/delete | delete other sessions | local state must not depend forever on remote close |
| Contract failure | diagnostics, feature disabled | fallback old Expert | fail closed |

---

# 12. Ownership Contract

## 12.1 Ownership Type

```text
OWN-ACP-001 Renderer owns presentation/draft selection only.
OWN-ACP-002 Preload owns exposure of typed semantic IPC only.
OWN-ACP-003 Electron Main owns ACP process, credentials, binding, contract gate, file transfer.
OWN-ACP-004 NodeSkClaw owns remote catalog/session/run/approval/artifact execution facts.
OWN-ACP-005 File Platform owns local file identity/materialized bytes/preview access.
OWN-ACP-006 Legacy Expert remains legacy owner only; owns no new ACP state.
```

## 12.2 Ownership Rule

- 一个字段只能有一个 authoritative owner。
- Renderer 不得写 binding DB。
- Adapter 不得写 SMC Chat DB。
- Catalog display metadata 更新不得覆盖 persisted profile identity of existing binding。
- Local Chat provider 不得被 ACP runtime state重分类。

## 12.3 Drift

检测到以下 drift 时 fail-closed：

- contract digest/version drift；
- persisted profile digest 与 canonical fields 不一致；
- session metadata 为 remote-expert-acp 但 binding 不存在；
- ManagedFile provider 与 transfer handler 不匹配；
- ACP resume 返回的 agent/profile identity 与 binding 不一致。

---

# 13. Hash / Identity Contract

## 13.1 Profile Digest

Canonicalization algorithm：

1. 所有 ref 必须 string、trim 后非空；
2. arrays dedupe；
3. 按 Unicode codepoint ascending sort；
4. 固定 key order：`profile_version,name,agent_ref,knowledge_refs,connector_binding_refs,integration_account_refs`；
5. UTF-8 JSON，无 pretty print、无 trailing newline；
6. `sha256(bytes)` -> lowercase hex。

## 13.2 Contract Identity

Contract identity tuple：

```text
(tagObjectSha,
 targetCommit,
 bundleDigest,
 acpProtocolVersion,
 acpAdapterVersion+Digest,
 catalogVersion+Digest,
 remoteAgentVersion+Digest)
```

Tag 文本相同但 tuple 变化视为 tamper/incompatible。

## 13.3 Session Identity

```text
SMC session_id     = local conversation/history identity
ACP acp_session_id = remote execution identity
```

严禁依赖两者字符串相等。

## 13.4 Turn Identity

Main 为每次 submit 生成 `turn_id=UUIDv4`；同一 UI submit intent 在 Main active-turn registry 中只能创建一个 prompt call。

---

# 14. Transaction Contract

## 14.1 Transaction Boundary

本地 DB transaction 与远端 ACP/HTTP 无法形成分布式事务，因此采用 **ordered commit + explicit uncertainty**。

## 14.2 Commit Order

First remote turn：

```text
1 contract/runtime/profile validation
2 prepare all attachments
3 spawn + initialize Adapter
4 session/new -> obtain acp_session_id
5 transaction: insert/update desktop_session_metadata + binding
6 persist optimistic user transcript identity
7 session/prompt
8 stream semantic events
9 finalize transcript / artifact associations
```

关键理由：第 5 步后 crash，重启可以 resume；第 7 步若结果不确定，不自动重发。

## 14.3 Failure Atomicity

- Step 1–4 fail：不得留下 active binding，也不得发送 prompt。
- Step 5 fail：best-effort close newly created ACP session；Chat 保持未绑定。
- Step 7 network/transport ambiguity：标 `ACP_OUTCOME_UNKNOWN`，不 blind retry。
- Step 9 local persistence fail：不重发 remote prompt，只记录 local persistence error 并允许从 Provider/session recovery 修复。

## 14.4 Rollback Failure

Remote session close compensation 失败时：记录 orphan-session diagnostic（只含 hashed identity），本地不将其绑定到 Chat；后续运维清理，不允许自动重用。

---

# 15. Conflict Contract

| Conflict | Resolution |
|---|---|
| 两个窗口同时 first-submit 同一 SMC session | Main keyed mutex；仅首个创建 binding，第二个复用或收到 active-turn conflict |
| binding 已存在但 profile draft不同 | `REMOTE_PROFILE_IMMUTABLE`，要求新 Chat |
| metadata remote 但 binding missing | `REMOTE_BINDING_NOT_FOUND` + repair/block，不 fallback |
| binding acp_session_id 唯一冲突 | DB reject + block |
| Adapter version 与 lock不一致 | compatibility block |
| Catalog expert变 unavailable，但 existing binding resume | 允许尝试 resume；新 session 不允许；Provider resume最终事实为准 |
| duplicate permission response | first terminal response wins，后续 `ALREADY_RESOLVED` |
| duplicate artifact event | same remote artifact identity dedupe to same ManagedFile association |

---

# 16. Compatibility / Migration

## 16.1 Existing State

现有三类状态需保持：

- `chat/hermes-chat`
- `work/skill-run`
- `kb-set/hermes-chat`

Legacy Expert transcript/projection 不自动迁移为 ACP binding。

## 16.2 Migration

1. SQLite migration 扩展 `desktop_session_metadata.execution_provider` CHECK；由于 SQLite CHECK 变更通常需要 table rebuild，migration 需 copy-validate-swap 并有 rollback fixture。
2. 新建 `desktop_remote_expert_bindings`。
3. Shared/Renderer `ChatExecutionMode` 与 resume classifier 增加 remote expert。
4. `ManagedFileRemoteProvider` 增加 `remote-expert-acp`，materializer 改 exhaustive routing。
5. 不批量修改任何历史 session。

## 16.3 Unknown Ownership

若历史数据无法确定是否属于 Legacy Expert：保持原数据，只读展示；不得猜测并生成 ACP binding。

---

# 17. External Dependency Contract

| Dependency | Contract | Timeout / Retry | Failure Behavior |
|---|---|---|---|
| NodeSkClaw Catalog | Catalog v1.0.0 | existing AuthorizedBackendTransport timeout; auth retry per auth layer | disable selection / retain Local Chat |
| nodeskclaw-acp | ACP Adapter 1.1.0 / ACP v1 | initialize/process bounded timeout | block Remote Expert |
| Managed Credential | ACP managed-credential contract | 401 refresh exactly once/logical request | auth required |
| Remote Agent | v1.5.0 via Adapter only | no SMC direct retry of ambiguous prompt | outcome unknown |
| File Platform | existing ManagedFile | local IO rules | attachment/artifact specific failure |
| SQLite/state DB | existing desktop persistence | transaction | do not report ready before commit |

Provider endpoint/capability schema以冻结 contract 为准，SMC 不对未声明字段建立 mandatory dependency。

---

# 18. Security Contract

## 18.1 Threats

- token/refresh token 泄露到 Renderer/log/argv；
- malicious/tampered Adapter binary；
- ACP stdout injection / malformed JSON-RPC；
- crafted `nodeskclaw://artifact/...` path traversal；
- resource link 越权访问其他 run/artifact；
- attachment 未经 local file security policy；
- permission dialog clickjacking/double decision；
- contract tag漂移/tamper；
- remote error 包含敏感 backend details；
- legacy fallback 绕过新安全边界。

## 18.2 Controls

- Main-only credentials/network/process ownership；
- contextIsolation + typed preload allowlist；
- same-origin `AuthorizedBackendTransport`；
- child token only through process environment and redacted process diagnostics；
- Adapter/contract integrity check；
- strict URI parser + ownership proof；
- artifact bytes进入 File Platform 的 existing security/preview policy；
- permission only once semantics；
- error sanitizer；
- forbidden dependency CI；
- no raw prompt/file bytes in telemetry。

---

# 19. Observability

Structured event names至少：

```text
remote_expert.contract_gate
remote_expert.catalog_fetch
remote_expert.adapter_start
remote_expert.adapter_exit
remote_expert.session_new
remote_expert.session_resume
remote_expert.session_close
remote_expert.turn_start
remote_expert.turn_end
remote_expert.permission_requested
remote_expert.permission_resolved
remote_expert.attachment_prepare
remote_expert.artifact_materialize
remote_expert.cancel
remote_expert.error
```

每条 event 公共字段：`timestamp, app_version, contract_version, trace_id, session_hash, acp_session_hash?, turn_id?, error_code?, duration_ms?`。

禁止公共字段：token、refresh token、raw backend URL query、full prompt、file bytes、OAuth secret、absolute user path（仅可 redacted/hash）。

核心 metrics：adapter startup latency、resume success rate、turn success/error/unknown、permission wait latency、attachment success、artifact materialization success、contract incompatibility count。

---

# 20. Acceptance Design Standard

所有 Acceptance 使用 Given / When / Then / Oracle / Evidence。Mock-only 不能满足 `Golden Consumer / Real-world Acceptance`；Provider production gate 仍需 LIVE evidence。

## A-ACP-001 — Contract lock / tamper fail-closed
### Requirement Refs
`REQ-ACP-001`
### Given
正确 lock 与 ACP Adapter；另准备被篡改 digest/version binary/manifest。
### When
执行 CI contract verifier 与 runtime compatibility gate。
### Then
正确基线 PASS；任一 tamper/mismatch FAIL，Remote Expert disabled，且未调用 legacy Expert/Skill Run。
### Oracle
expected tuple 全部相等才 COMPATIBLE。
### Evidence
CI output、tamper test log、runtime gate snapshot。

## A-ACP-002 — Session metadata migration and persistence
### Requirement Refs
`REQ-ACP-002`
### Given
包含 hermes-chat/skill-run/kb-set 旧数据库。
### When
迁移并创建 Remote Expert binding，再重启应用。
### Then
旧行不变，新行分类 remote-expert-acp，可唯一恢复 binding，DB 无 token。
### Oracle
SQL queries + schema constraints。
### Evidence
before/after DB fixture、migration test。

## A-ACP-003 — Catalog contract
### Requirement Refs
`REQ-ACP-003,REQ-ACP-006`
### Given
Catalog fixture含 ready/unavailable expert，授权用户具 `expert:invoke`。
### When
打开 Compose expert selector。
### Then
ready 可选择、unavailable 可见但 disabled；Renderer payload 无 URL/token。
### Oracle
contract schema + UI state。
### Evidence
network spy at Main、IPC snapshot、component test。

## A-ACP-004 — ACP process Main ownership
### Requirement Refs
`REQ-ACP-004`
### Given
两个 active remote chats。
### When
分别启动 session。
### Then
Main registry有两个隔离 child；Renderer无 process handle；其中一个 crash 不终止另一个。
### Oracle
PID/process registry + Renderer API surface。
### Evidence
integration logs、crash injection。

## A-ACP-005 — Typed IPC isolation
### Requirement Refs
`REQ-ACP-005`
### Given
Renderer devtools/IPC spy。
### When
完成 catalog/new/prompt/permission/artifact 流程。
### Then
只能观察 semantic DTO；raw ACP/token/backend URL均不存在。
### Oracle
IPC channel snapshot + secret regex scan。
### Evidence
test snapshot、scan report。

## A-ACP-006 — Original Chat Compose integration
### Requirement Refs
`REQ-ACP-006`
### Given
Original Chat 页面。
### When
选择 Remote Expert 并查看 Compose。
### Then
控件位于现有 ChatInput extension seam；没有新 Expert Screen；未 mount legacy default entry。
### Oracle
DOM/component tree + route table。
### Evidence
component test、screenshot、static import test。

## A-ACP-007 — New session + prompt + streaming
### Requirement Refs
`REQ-ACP-007`
### Given
ready expert、valid auth、text prompt。
### When
发送 first remote turn。
### Then
顺序 initialize→session/new→binding commit→session/prompt；assistant/reasoning/tool映射到 Chat；end_turn 后 finalized。
### Oracle
ordered trace + DB + provider run identity。
### Evidence
E2E trace、Chat transcript、DB query。

## A-ACP-008 — Restart and resume
### Requirement Refs
`REQ-ACP-008,REQ-ACP-019`
### Given
完成一个 Remote Expert Chat 并关闭 Desktop。
### When
重新启动并打开同一 Chat。
### Then
使用原 acp_session_id `session/resume`；不调用 session/new；profile mismatch 时 resume_blocked。
### Oracle
ACP RPC trace。
### Evidence
restart E2E、negative mismatch test。

## A-ACP-009 — Attachment resource link
### Requirement Refs
`REQ-ACP-009`
### Given
PDF/XLSX ManagedFiles attached to one turn。
### When
发送 prompt。
### Then
先完成 upload/proof，再通过 ACP resource_link发送；任一附件失败则 prompt不发送；binding无 attachment_ref。
### Oracle
ordered trace + binding DB。
### Evidence
LIVE/fixture transfer trace、failure injection。

## A-ACP-010 — Artifact to ManagedFile
### Requirement Refs
`REQ-ACP-010`
### Given
Remote Agent 返回 artifact resource_link。
### When
用户点击 artifact。
### Then
Main授权下载并创建 provider=remote-expert-acp ManagedFile，FilePreview 打开；Renderer无 raw internal URL。
### Oracle
ManagedFile row + preview + IPC payload。
### Evidence
artifact E2E、routing unit test。

## A-ACP-011 — Permission bridge
### Requirement Refs
`REQ-ACP-011`
### Given
Remote run请求 side-effect permission。
### When
分别 allow_once、reject_once、Esc/close。
### Then
三者分别通过 ACP 返回 allow/reject/reject；无 direct approval HTTP；无 Always Allow。
### Oracle
ACP RPC trace + backend spy。
### Evidence
LIVE approval test、UI test。

## A-ACP-012 — Cancel/close
### Requirement Refs
`REQ-ACP-012`
### Given
running turn 与 active session。
### When
Abort；再测试 hung child。
### Then
正常先 ACP cancel；hung 超过 5s 才 kill；close/delete触发 best-effort session/close。
### Oracle
process/RPC ordered trace。
### Evidence
cancel E2E、failure injection。

## A-ACP-013 — Transcript persistence
### Requirement Refs
`REQ-ACP-013`
### Given
包含 assistant/reasoning/tool/result 的 remote turn。
### When
完成、刷新 DB、重启打开历史。
### Then
现有 ChatMessage renderer还原相同语义且无重复行，无 ExpertProjectionStore写入。
### Oracle
DB rows + rendered message sequence。
### Evidence
snapshot、DB query、projection spy=0。

## A-ACP-014 — Managed credential security
### Requirement Refs
`REQ-ACP-014,REQ-ACP-005`
### Given
access token将过期且 refresh有效。
### When
ACP/backend logical request 首次401。
### Then
内存refresh一次、logical request retry一次；token只在 Main/child env；第二次401停止。
### Oracle
refresh count=1、retry count=1、secret scans=0 leak。
### Evidence
auth integration、process env assertion、log/IPC/DB scan。

## A-ACP-015 — Diagnostics
### Requirement Refs
`REQ-ACP-015`
### Given
成功 turn 与 contract/process/resume/file failures。
### When
导出 support diagnostics。
### Then
可按 trace/error code区分故障域，无 prompt/token/file bytes/absolute path。
### Oracle
schema validation + forbidden pattern scan。
### Evidence
diagnostic fixture/report。

## A-ACP-016 — Forbidden dependency isolation
### Requirement Refs
`REQ-ACP-016` 以及所有标注该 Acceptance 的 MUST NOT。
### Given
Remote Expert 新代码完整 import graph 与 runtime spies。
### When
CI运行 static/runtime isolation tests。
### Then
forbidden dependency为0；Remote prompt不调用 old expert.start/SkillRun。
### Oracle
AST/import graph + mocks/spies。
### Evidence
CI report。

## A-ACP-017 — Windows sidecar package
### Requirement Refs
`REQ-ACP-017`
### Given
全新 Windows x64 machine / clean user profile。
### When
安装生产候选 SMC Copilot 并启用 Alpha Remote Expert。
### Then
Main能定位/验证/启动 Adapter；tampered binary被拒绝；无需用户手工安装 Python/Node runtime（若 Provider 发布物为 standalone binary）。
### Oracle
clean-machine run + hash/version gate。
### Evidence
安装录像/log、binary gate report。

## A-ACP-018 — Release gate
### Requirement Refs
`REQ-ACP-018`
### Given
当前 Provider manifest `frontend=passed, production=unpassed`。
### When
构建 production release。
### Then
Remote Expert 默认关闭；internal/alpha可显式开启；GA pipeline blocked。
### Oracle
feature default + release policy evaluator。
### Evidence
release gate output。

## A-ACP-019 — Durable profile immutability
### Requirement Refs
`REQ-ACP-019`
### Given
active Remote Expert binding。
### When
用户修改 expert/knowledge/connector/integration account。
### Then
UI要求新会话；existing binding不变；同 profile canonicalization结果稳定。
### Oracle
DB before/after + digest fixture。
### Evidence
unit/E2E/hash vectors。

---

# 21. Acceptance Input Matrix

| Dimension | Values |
|---|---|
| Chat | new / resumed / local existing / skill-run existing |
| Expert | ready / unavailable / removed-after-binding |
| Auth | valid / first-401-refresh-success / second-401 / no-login |
| Contract | exact / adapter mismatch / digest tamper / missing lock |
| Adapter | start success / crash / hung / malformed JSON |
| Prompt | text / text+PDF / text+XLSX / empty text+attachment |
| Permission | allow_once / reject_once / Esc-close / duplicate response |
| Resume | success / forbidden / not-found / profile mismatch / offline |
| Artifact | PDF / XLSX / unsupported preview type / download fail / hash fail |
| Concurrency | one chat / two chats / double submit same chat |
| Legacy | legacy expert enabled / disabled / skill-run enabled |

Hard Acceptance 至少覆盖所有 value 一次；security/legacy/contract negative values不得只做 mock snapshot。

---

# 22. Negative Acceptance

- `NEG-001`：Renderer 直接 fetch `/api/v1/remote-experts` -> FAIL。
- `NEG-002`：token 出现在 IPC/log/Chat DB/binding DB -> FAIL。
- `NEG-003`：contract mismatch 后 fallback old Expert -> FAIL。
- `NEG-004`：resume not-found 后自动 session/new -> FAIL。
- `NEG-005`：artifact provider remote-expert-acp 被旧 Expert transfer处理 -> FAIL。
- `NEG-006`：attachment upload部分失败但仍发送 prompt -> FAIL。
- `NEG-007`：permission dialog close 被当作 allow -> FAIL。
- `NEG-008`：active binding profile字段原地更新 -> FAIL。
- `NEG-009`：Remote Expert prompt 进入 SkillRunStore -> FAIL。
- `NEG-010`：productionGate=unpassed 时 production默认开启 -> FAIL。

---

# 23. Failure Injection

| Injection | Expected |
|---|---|
| Adapter binary byte tamper | pre-spawn integrity block |
| initialize timeout | no session/new; process cleaned |
| crash after session/new before binding commit | best-effort close; no active binding |
| crash after binding commit before prompt | restart can resume; no prompt auto-send |
| transport break during prompt | `ACP_OUTCOME_UNKNOWN`; no blind retry |
| DB fail during transcript finalization | remote prompt not replayed; local persistence error |
| 401 first request | exactly one refresh + one retry |
| 401 after retry | auth-required |
| permission response transport fail | unresolved/error; never assume approved |
| attachment upload fail | prompt not sent |
| artifact hash mismatch | no preview; failed/quarantine |
| resume profile mismatch | resume_blocked |
| legacy module unavailable | ACP path unaffected |

---

# 24. Evidence Contract

## 24.1 Evidence 不是状态标签

`implemented` 仅说明代码存在；只有 Evidence 满足 Acceptance Oracle 才能标 `verified`。

每条 Hard Acceptance 的 Evidence manifest 需包含：

```yaml
acceptance_id:
source_commit:
app_version:
provider_contract_tag:
provider_bundle_digest:
platform:
test_type: unit | integration | e2e | live
command_or_scenario:
result: PASS | FAIL
artifact_paths:
timestamp:
```

## 24.2 Evidence Integrity

- Evidence 与 source commit绑定；
- Provider LIVE evidence 与 contract tag/bundle digest绑定；
- 日志必须经过 secret redaction；
- screenshot/录像不能替代 machine oracle，但可作为补充；
- mock-only evidence 不允许通过 `A-ACP-009/010/011/017/018` 的最终 release gate。

---

# 25. Release Gate

## Gate G0 — PRD / Plan Ready

- `SPEC_SEMANTIC_GAP = 0`
- Requirement ↔ Acceptance trace 100%
- source baseline/contract baseline pinned
- 状态：**PASS，允许生成 Plan**

## Gate G1 — Contract Ready

- Provider Frontend Contract Gate = passed
- local lock/digest tests PASS
- forbidden dependency tests PASS

## Gate G2 — Desktop Integration Alpha

- A-ACP-001..016,019 在 automated integration/e2e 层通过；
- Windows package至少 internal build可启动 Adapter；
- feature 默认仅 internal/alpha。

## Gate G3 — Production Candidate

必须同时满足：

1. Provider `productionGate=passed`；
2. Provider要求的 LIVE gates：Windows clean-machine、managed auth、attachments、approvals、Zed regression 等有对应 release evidence；
3. SMC `A-ACP-017` Windows clean-machine PASS；
4. SMC Golden Consumer live suite PASS；
5. secret/static security scan PASS；
6. rollback/feature disable演练 PASS。

**当前外部状态：G3 BLOCKED，因为 Provider contract 明确 `productionGate=unpassed`。这不是 SPEC_SEMANTIC_GAP，不阻止计划/实现。**

---

# 26. Golden Consumer / Real-world Acceptance

Golden Consumer 固定：`smc-copilot/apps/work@work/prd-v6.3` 演进实现。

最低 LIVE Scenario：

```text
GC-01 Windows clean machine 安装 -> login -> Catalog -> 选择 ready Expert -> text prompt -> end_turn
GC-02 Desktop 完全退出 -> 重启 -> 打开历史 -> resume 同一 ACP session -> 第二轮 prompt
GC-03 PDF + XLSX attachment -> Remote Expert 能收到 resource links 并产生正确 run
GC-04 Remote Expert 触发外部动作 -> WAITING permission -> allow_once -> 成功
GC-05 相同动作 -> reject_once -> provider 无被拒绝的业务 mutation
GC-06 artifact resource link -> materialize -> FilePreview 打开
GC-07 running turn Abort -> ACP cancel -> UI终态
GC-08 expired access token -> managed refresh once -> turn继续
GC-09 Adapter crash -> only current remote chat受影响；Local Chat/另一个 remote chat可用
GC-10 contract/binary tamper -> Remote Expert被阻止且无 legacy fallback
GC-11 change Knowledge/Connector/Account -> explicit new session；旧 binding不变
```

---

# 27. Requirement Traceability Matrix

| Requirement | Source Scope | Acceptance | Primary Evidence |
|---|---|---|---|
| REQ-ACP-001 | contract lock/compat | A-ACP-001 | CI + tamper |
| REQ-ACP-002 | metadata/binding | A-ACP-002 | migration/restart |
| REQ-ACP-003 | catalog | A-ACP-003 | contract/UI |
| REQ-ACP-004 | process manager | A-ACP-004 | lifecycle/crash |
| REQ-ACP-005 | preload IPC | A-ACP-005 | API/secret scan |
| REQ-ACP-006 | Compose | A-ACP-006 | component/E2E |
| REQ-ACP-007 | ACP prompt/events | A-ACP-007 | E2E trace |
| REQ-ACP-008 | resume | A-ACP-008 | restart E2E |
| REQ-ACP-009 | attachment | A-ACP-009 | PDF/XLSX LIVE |
| REQ-ACP-010 | artifact | A-ACP-010 | materialize/preview |
| REQ-ACP-011 | permission | A-ACP-011 | approval LIVE |
| REQ-ACP-012 | cancel/close | A-ACP-012 | cancel/failure injection |
| REQ-ACP-013 | transcript | A-ACP-013 | DB/reopen |
| REQ-ACP-014 | security | A-ACP-014 | secret/auth tests |
| REQ-ACP-015 | observability | A-ACP-015 | diagnostic schema |
| REQ-ACP-016 | legacy isolation | A-ACP-016 | static/runtime spy |
| REQ-ACP-017 | packaging | A-ACP-017 | clean-machine |
| REQ-ACP-018 | release gate | A-ACP-018 | release evaluator |
| REQ-ACP-019 | profile immutability | A-ACP-019,A-ACP-008 | hash/context E2E |

---

# 28. Plan Generation Contract

## 28.1 Semantic Gap Check

Plan 生成前必须检查：

```text
SPEC_SEMANTIC_GAP = 0
```

本 PRD 已冻结 execution provider、identity、hash、process ownership、credential、retry、cancel grace、profile mutation、resume failure、legacy isolation、production gate 语义。

仅以下内容属于 implementation discovery，而不是 semantic gap：现有 repository 中各 IPC registration function 的最小拆分位置、测试文件命名、SQLite migration helper 复用点、Electron build config 的具体 property placement。这些不得改变本文 contract。

## 28.2 Requirement Coverage Check

每个 REQ 必须至少被一个 Plan Todo引用，每个 Acceptance 必须至少被一个 Todo verification引用。禁止创建“misc cleanup” Todo 承载未映射 normative behavior。

## 28.3 Side Effect Check

每个 Todo 必须列出它可修改的 path/schema/process/network side effect；发现跨边界写入 legacy Expert/Skill Run 时阻断。

## 28.4 State Authority Check

Todo 必须注明其读取/写入哪个 SOT；Renderer state 不能被描述成 Remote Session SOT。

## 28.5 Failure-path Check

每个执行链 Todo 必须同时实现并验证至少一个失败路径；不能只验证 happy path。

### 28.6 推荐 Plan Phase

```text
T0  Source/Contract baseline + checked-in lock
T1  Session metadata migration + RemoteExpertBinding store
T2  Shared semantic contracts + preload API
T3  Catalog Client + AuthorizedBackendTransport integration
T4  Adapter binary resolver + compatibility gate
T5  ManagedCredentialBridge + AcpProcessManager
T6  AcpClient / initialize / session-new
T7  Compose RemoteExpertContextControl
T8  Prompt + semantic event mapper
T9  Transcript materializer + history classification
T10 Session resume/recovery
T11 Attachment resource-link bridge
T12 Artifact resource-link + ManagedFile routing
T13 Permission bridge
T14 Cancel/session-close/process recovery
T15 Diagnostics/security hardening
T16 Forbidden dependency tests
T17 Packaging + Windows clean-machine
T18 Golden Consumer LIVE + Release Gate
```

---

# 29. `.plan.md` 输出标准

每个 Todo 必须使用以下结构，不允许退化为普通 checklist：

```yaml
id:
requirement_refs:
acceptance_refs:
files_or_symbols:
implementation_goal:
preconditions:
state_transition:
side_effect_scope:
failure_cases:
verification:
status: planned | implemented | verified | blocked
evidence:
```

Plan 额外要求：

- `files_or_symbols` 尽量指向已存在源码或本文冻结的新 bounded-context path；
- `status=implemented` 不能自动升级 `verified`；
- `verification` 必须含 Oracle，不接受“测试通过”四字；
- T0 完成前不得开始 T4/T5；T1/T2 完成前不得开始 renderer Remote Expert submit；
- G3 被 Provider production gate 阻塞时，代码 Todo仍可 verified，但 production release Todo保持 blocked。

---

# 30. Code Review Contract

Review 必查：

1. 是否新增任何 Renderer→NodeSkClaw direct fetch；
2. 是否把 raw token/URL/ACP packet暴露给 Renderer；
3. 是否 import legacy Expert forbidden dependency；
4. 是否错误地让 `sessionId == acpSessionId`；
5. 是否允许 active profile原地修改；
6. 是否在 resume失败时 silently session/new；
7. 是否 blind retry prompt/side-effect action；
8. 是否把 `remote-expert-acp` artifact fallback到旧 Expert handler；
9. 是否正确处理 SQLite migration rollback与旧数据；
10. 是否缺少 negative/failure-injection test；
11. 是否改变 Provider contract而未升级 contract pin；
12. 是否把 `productionGate=unpassed` 忽略为普通 warning。

任何 1–8、11–12 命中即 `REQUEST_CHANGES`。

---

# 31. PRD Quality Gate

## Architecture
- [x] Original Chat / Compose 是唯一 UX入口。
- [x] Main 是 network/process/credential owner。
- [x] ACP 是 Remote Expert 唯一执行协议。
- [x] Legacy Expert/Skill Run 明确隔离。

## State
- [x] Chat transcript / ACP session / binding / ManagedFile SOT 分开。
- [x] restart/resume行为确定。
- [x] profile immutable semantics确定。

## Semantics
- [x] selection/default/failure/conflict均有定义。
- [x] Contract Lock 和 hash定义明确。
- [x] `SPEC_SEMANTIC_GAP=0`。

## Side Effects
- [x] remote prompt/attachment/artifact/permission/cancel副作用明确。
- [x] forbidden fallback明确。

## Failure
- [x] auth/process/transport/DB/resume/file failure均有 fail-closed 语义。
- [x] ambiguous prompt禁止 blind retry。

## Acceptance
- [x] 19 Requirements 对应 19 Acceptance。
- [x] negative/failure injection/input matrix 完整。

## Evidence
- [x] Evidence schema固定。
- [x] LIVE 与 mock证据边界明确。

## Plan Readiness
- [x] phase与 dependency可直接编译为 `.plan.md`。
- [x] Provider production gate作为 external release blocker，不是假装成 spec gap。

---

# 32. PRD 禁止写法

本项目实现文档禁止出现以下无约束语义：

```text
“可以考虑复用旧 Expert”
“必要时回退 Skill Run”
“sessionId 大概可以沿用 ACP id”
“token 先传到 renderer 再说”
“失败就重试”
“resume 不行就创建新 session”
“artifact 非 skill-run 就走 expert”
“权限弹窗关掉按默认允许”
“production gate 后面处理”
```

若实现需要偏离本文冻结 contract，必须先升级 PRD/version，而不是在 Plan 内自行解释。

---

# 33. 推荐 ID 体系

```text
PRD:        PRD-SMC-COPILOT-ACP-REMOTE-EXPERT-001
Scope:      SCOPE-001...
Non-goal:   NON-GOAL-001...
Requirement:REQ-ACP-001...
Acceptance: A-ACP-001...
Negative:   NEG-001...
Golden:     GC-01...
Todo:       T0...T18
Error:      ACP_* / REMOTE_*
Ownership:  OWN-ACP-001...
```

---

# 34. PRD 最小完整结构

本 PRD 的机器可执行最小闭环为：

```text
Pinned Source Baseline
  ↓
Pinned Provider Contract
  ↓
Architecture Boundary
  ↓
Authoritative State
  ↓
Schema / Identity / Hash
  ↓
19 Requirement Units
  ↓
Side Effect / Transaction / Failure Semantics
  ↓
19 Acceptance Oracles
  ↓
Negative + Failure Injection
  ↓
Evidence Contract
  ↓
Release Gate
  ↓
Golden Consumer LIVE
  ↓
Plan Generation Contract
```

删除其中任何一段都会让 Coding Agent 需要重新推断关键工程语义。

---

# 35. Definition of Done

## 35.1 Implementation DoD

- [ ] Contract lock与 verifier落地；
- [ ] session metadata migration + binding SOT落地；
- [ ] Remote Expert bounded context不依赖 legacy Expert/Skill Run；
- [ ] Main-owned ACP process + managed credential可运行；
- [ ] Original Chat Compose可选择 expert；
- [ ] first prompt/new、stream、tool/reasoning完成；
- [ ] restart/resume同一 ACP session；
- [ ] attachment/artifact/permission/cancel闭环；
- [ ] transcript/history/ManagedFile稳定；
- [ ] diagnostics/security/forbidden dependency checks落地；
- [ ] Windows Alpha package可运行。

## 35.2 Verification DoD

- [ ] A-ACP-001..019 均有 machine-readable evidence；
- [ ] NEG-001..010 全部 PASS；
- [ ] failure injection矩阵全部执行；
- [ ] static secret/import scans PASS；
- [ ] Golden Consumer GC-01..11 在符合 gate 的环境完成；
- [ ] Provider production gate未通过前，GA/default-on 保持 blocked。

## 35.3 Release DoD

`IMPLEMENTED` ≠ `VERIFIED` ≠ `PRODUCTION_READY`。

当前可达目标：`APPROVED_FOR_PLAN -> IMPLEMENTED -> VERIFIED(ALPHA)`；只有 Provider `productionGate=passed` 且 G3 全证据通过后才能标 `PRODUCTION_READY`。

---

# 36. 最终原则

本次对接不是把 NodeSkClaw 的“专家页面”搬进 SMC，也不是给旧 Expert 加一条新的 HTTP endpoint。

最终工程边界固定为：

```text
SMC Original Chat / Compose
        │
        │ semantic intent/events
        ▼
Electron Main Remote ACP Expert Bounded Context
        │
        │ ACP v1 / managed credential / resource links
        ▼
nodeskclaw-acp
        │
        ▼
NodeSkClaw Remote Agent
```

SMC 的 Local Chat、Remote ACP Expert、Skill Run 是三个不同 execution target；Remote ACP Expert 与 Local Chat 共享 Chat UX/History/File Platform，但不共享执行协议与远端 session identity。

**核心不变量：**

1. **Original Chat 是 UX SOT，ACP Session 是 Remote execution SOT。**
2. **Electron Main 是 credential/network/process trust boundary。**
3. **Contract digest 是兼容性 SOT，tag 仅是 freeze handle。**
4. **Durable profile 在 ACP Session 内不可变。**
5. **Attachment 是 turn input；Artifact 是 managed output；两者都不成为 Chat execution identity。**
6. **Permission、Cancel、Resume 必须走 ACP，不允许 SMC 绕过 Adapter。**
7. **任何 Contract/Auth/Resume 失败都不允许回退旧 Expert 或 Skill Run。**
8. **Provider production gate 未通过不阻止工程实施，但阻止生产默认发布。**

---

## Appendix A — 源码改造清单（按当前 `work/prd-v6.3` 基线）

### A.1 必须修改的现有文件/模块

```text
apps/work/src/renderer/src/screens/Layout/chatRuns.ts
  - ChatExecutionMode + resume provider classification

apps/work/src/renderer/src/screens/Chat/Chat.tsx
  - add remote-expert execution branch
  - isolate legacy Expert default entry from remote-expert-acp
  - route submit/abort/events to remote transport

apps/work/src/renderer/src/screens/Chat/ChatInput.tsx
  - reuse toolbarExtras/attachments; avoid protocol-specific logic

apps/work/src/main/session-metadata-store.ts
  - executionProvider migration
  - valid-combination constraint

apps/work/src/shared/files/managed-file.ts
  - add remote-expert-acp provider

apps/work/src/main/files/materialize-remote-expert-artifact.ts
  - refactor to explicit provider routing; no implicit legacy fallback

apps/work/src/main/ipc/register.ts (or extracted registrations)
  - register semantic remote-expert IPC

apps/work/src/preload/index.ts / index.d.ts
  - expose typed remoteExpert API
```

### A.2 推荐新增 bounded-context 文件

```text
apps/work/contracts/nodeskclaw/remote-expert-frontend-v1.0.0/
  contract-lock.json
  consumer-fixtures/*

apps/work/src/shared/remote-expert-acp/
  contract.ts
  ipc.ts
  events.ts
  errors.ts

apps/work/src/preload/remote-expert-api.ts

apps/work/src/main/remote-expert-acp/
  contract-lock.ts
  compatibility-gate.ts
  catalog-client.ts
  managed-credential-bridge.ts
  acp-binary-resolver.ts
  acp-process-manager.ts
  acp-jsonrpc-transport.ts
  acp-client.ts
  acp-session-manager.ts
  acp-event-mapper.ts
  permission-mapper.ts
  remote-attachment-bridge.ts
  remote-artifact-bridge.ts
  remote-expert-binding-store.ts
  remote-expert-session-materialize.ts
  diagnostics.ts
  register-ipc.ts

apps/work/src/renderer/src/screens/Chat/remote-expert/
  RemoteExpertContextControl.tsx
  RemoteExpertSelector.tsx
  RemoteExpertStatus.tsx
  RemoteExpertPermissionView.tsx
  useRemoteExpertTransport.ts
```

### A.3 明确禁止新代码依赖

```text
apps/work/src/renderer/src/modules/expert/**
apps/work/src/main/expert/**
apps/work/src/preload/expert-api.ts
apps/work/src/shared/expert.ts
ExpertProjectionStore
expert.start
skillName / SkillRunStore as Remote Expert execution path
```

旧文件可继续服务 legacy feature，但不能成为新 bounded context 的 import dependency。

---

## Appendix B — Source / Contract Evidence Index

### B.1 SMC source baseline

```text
repo: loudon84/smc-copilot
branch: work/prd-v6.3
commit: 0efacd230ebb02c5d5177b8cc35370a4f8456431
```

审阅核心文件：

```text
apps/work/src/renderer/src/screens/Layout/chatRuns.ts
apps/work/src/renderer/src/screens/Chat/Chat.tsx
apps/work/src/renderer/src/screens/Chat/ChatInput.tsx
apps/work/src/renderer/src/screens/Chat/sessionHistory.ts
apps/work/src/renderer/src/screens/Chat/types.ts
apps/work/src/main/session-metadata-store.ts
apps/work/src/main/chat-session-materialize.ts
apps/work/src/main/expert/expert-session-materialize.ts
apps/work/src/main/auth/authorized-backend-transport.ts
apps/work/src/main/files/materialize-remote-expert-artifact.ts
apps/work/src/shared/files/managed-file.ts
apps/work/src/preload/expert-api.ts
apps/work/src/main/ipc/register.ts
```

### B.2 Provider Contract baseline

```text
tag: remote-expert-frontend-contract-v1.0.0
annotated tag object: 9f694a3b61e1b86366d23581951f2560a07946fc
target commit: e08428af6b814d276ed92274a64db3a46a44091f
implementation commit: 896450ad479033afc2428852a2d02f70f77ab19e
```

核心契约路径：

```text
contracts/remote-expert-frontend/v1.0.0/manifest.json
contracts/remote-expert-frontend/v1.0.0/component-pins.json
contracts/remote-expert-frontend/v1.0.0/consumer/smc-copilot-v6.3.json
contracts/remote-expert-frontend/v1.0.0/RELEASE.md
nodeskclaw-acp/contracts/acp-v1-adapter/v1.1.0/manifest.json
nodeskclaw-acp/contracts/acp-v1-adapter/v1.1.0/profile/acp-profile.schema.json
nodeskclaw-acp/contracts/acp-v1-adapter/v1.1.0/desktop/managed-credential.md
nodeskclaw-backend/contracts/remote-expert-catalog/v1.0.0/http/endpoint-matrix.json
nodeskclaw-backend/contracts/remote-expert-catalog/v1.0.0/schemas/catalog-item.schema.json
```

---

## Appendix C — PRD 状态声明

```yaml
SPEC_SEMANTIC_GAP: 0
PLAN_GENERATION: ALLOWED
PROVIDER_FRONTEND_CONTRACT: PASSED
PROVIDER_PRODUCTION_GATE: UNPASSED
SMC_PRODUCTION_RELEASE: BLOCKED_BY_EXTERNAL_LIVE_GATE
```

该状态表示：**方案语义已经足够生成严格 `.plan.md` 并开始实现；并不表示可以绕过 Provider LIVE Production Gate 直接面向企业终端正式默认发布。**
