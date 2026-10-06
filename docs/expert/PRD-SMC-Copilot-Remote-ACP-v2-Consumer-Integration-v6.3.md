---
title: "SMC Copilot Remote Expert Remote ACP v2 Consumer 对接方案 PRD"
prd_id: "PRD-SMC-WORK-REMOTE-ACP-CONSUMER-v2.0"
version: "1.0.0"
status: "APPROVED_FOR_PLAN"
product: "smc-copilot / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.3 (brownfield baseline)"
owner: "SMC Copilot"
reviewers:
  - "SMC Copilot Architecture"
  - "NodeSkClaw Provider Owner"
created_at: "2026-10-06"
updated_at: "2026-10-06"
target_release: "Remote Expert Consumer G6 + Golden Consumer G7"
change_type:
  - "BROWNFIELD_CHANGE"
  - "ARCHITECTURE_CHANGE"
  - "INTEGRATION"
  - "MIGRATION"
golden_consumer: "loudon84/smc-copilot/apps/work"
related_docs:
  - "需求PRD工程模板.md"
  - "NodeSkClaw REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0"
  - "NodeSkClaw Remote Expert Catalog v1.1.0"
  - "NodeSkClaw Remote ACP Gateway v1.0.0"
supersedes:
  - "apps/work production dependency on WORK-EXPERT-CONTRACT v1.0.2 for Remote Expert execution"
---

# 0. Document Meta / Verification Basis

## 0.1 Provider Consumer-Gate 结论

**结论：PASS，允许开始 SMC Consumer 实现。**

冻结依据：

```text
Provider repository:
  loudon84/nodeskclaw

Frozen tag:
  remote-expert-frontend-contract-v2.0.0

Tag target commit:
  5d36d6f7bebe1e70e7e031eaf384e124c76d98bc

Provider implementation commit recorded by bundle:
  11c9ee89ad02d369290242d7ee568c0cc647bb72

Contract:
  REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0

Contract status:
  FROZEN

frontendContractGate:
  passed

productionGate:
  unpassed
```

`productionGate=unpassed` **MUST NOT** 被解释为 Consumer 开发阻塞。该 Gate 的语义是：等待本 PRD 完成后，由真实 `smc-copilot` 执行 Golden Consumer E2E 后再关闭。

Provider Frozen Bundle：

```text
contracts/remote-expert-frontend/v2.0.0/
├── RELEASE.md
├── manifest.json
├── component-pins.json
├── SHA256SUMS
└── consumer/smc-copilot-v6.3.json
```

Provider 对 `smc-copilot/work/prd-v6.3` 明确声明：

```text
integrationMode = remote-acp-wss
```

Forbidden Dependencies：

```text
WORK-EXPERT-CONTRACT
ExpertProjectionStore
expert.start
skillName
SkillRunStore
nodeskclaw-acp.exe
acpAdapter
remoteAgent
acpRuntimeGateway
```

Required Capabilities：

```text
remote-expert-catalog
remote-acp-gateway
session-resume
attachment-resource-link
artifact-resource-link
permission-bridge
```

## 0.2 Consumer Brownfield Baseline

本 PRD 分析基线：

```text
Repository:
  loudon84/smc-copilot

Branch:
  work/prd-v6.3

Baseline HEAD:
  be619f66aa8483e716d32b614860da9a45759e4e
```

若 Implementation Plan 生成时该分支 HEAD 已变化：

```text
MUST diff <baseline SHA>..HEAD
MUST inventory all touched ownership files in §16
MUST BLOCK plan generation if a conflicting change alters:
  - Expert/Remote Expert execution ownership
  - Chat submit routing
  - auth/currentOrg contract
  - File Platform remote resource behavior
```

错误码：

```text
SMC_BASELINE_CONFLICT
```

## 0.3 Contract Identity

SMC Public Consumer 只 pin：

```text
REMOTE-EXPERT-CATALOG-CONTRACT v1.1.0
REMOTE-ACP-GATEWAY-CONTRACT v1.0.0
```

不得 pin：

```text
ACP-RUNTIME-GATEWAY-CONTRACT
REMOTE-AGENT-PROVIDER-CONTRACT
Hermes Native Contract
nodeskclaw-agent internal endpoints
nodeskclaw-acp adapter contract
```

冻结 Hash：

```text
frontendContractVersion = 2.0.0
frontendContractDigest  = 22ad68dd1132a073f6df5d2bf9f219b683c73ebb7ea1fa48933c9b92a744ecd5

catalogContractVersion  = 1.1.0
catalogContractDigest   = d51d27a33e6776be780bf3556ffa4ef4f6dab7f731c0a48421683708364efd2c

remoteAcpContractVersion = 1.0.0
remoteAcpContractDigest  = 8a48e74e363c71875739c33b2bcdcb6f6f2ea7ee15897ae9fb9b8e9407ee9d06

acpProtocolVersion = 1
transportProfile   = nodeskclaw.remote-acp.v1
```

Aggregate manifest 另记录：

```text
bundleDigest = 3de6c671bd9b22c5d6e35855f9dbb3f8432a6f0291df21b4824dc6ff9a0df43a
```

注意：

```text
frontendContractDigest
!=
manifest.bundleDigest
```

运行期 Contract Discovery 比较的是 `frontendContractDigest` 与两个 component digest，而不是把 `bundleDigest` 当作 Discovery digest。

---

# 1. Goal

让 `smc-copilot/apps/work` 在用户已登录 NodeSkClaw、已存在有效 `currentOrgId` 且 Provider `REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0` 兼容时，通过 Original Chat / Compose 直接选择 Remote Expert，并经：

```text
Electron Renderer
→ Electron Main
→ NodeSkClaw Backend Public WSS
→ nodeskclaw-agent ACP Runtime Gateway
→ Remote Hermes
```

完成 Remote Expert 对话，同时保证：

```text
1. Local Chat → Local Hermes 路径不受影响。
2. Desktop 不安装、不 resolve、不 spawn nodeskclaw-acp.exe。
3. Desktop 不直接访问 nodeskclaw-agent / Remote Hermes / /internal/*。
4. Desktop 不再用 WORK-EXPERT-CONTRACT / HermesTask / expert.start 作为 Remote Expert 生产执行模型。
5. Agent Formal Session / Run / Attempt / Event / Terminal 的 SOT 保持在远端 Agent Execution Plane。
6. SMC 只持有 Public Contract、ACP session reference、chat transcript、UI projection 和受控资源引用。
```

---

# 2. Background

## 2.1 Current State

`work/prd-v6.3` 当前 Remote Expert 实现采用旧模型：

```text
Original Chat
→ ExpertContextControl
→ Expert + Skill selection
→ window.hermesAPI.expert.start()
→ expert-ipc
→ expert-run-service
→ expert-gateway-client
→ /api/v1/expert/mcp
→ tools/call
→ HermesTask
→ SSE / Poll
→ Result / Artifact
```

当前关键事实：

```text
src/shared/expert.ts
  pins WORK-EXPERT-CONTRACT v1.0.2

ExpertRequest
  requires expertSlug + skillName

expert-gateway-client.ts
  owns /api/v1/expert/mcp
  tools/list
  tools/call
  HermesTask endpoints

expert-run-service.ts
  treats HermesTask as authoritative remote execution state

expert-ipc.ts
  exposes expert.start
  expert.cancel
  expert.retry
  getProjection/listProjections

ExpertContextControl
  loads Expert + Skill
  enforces low risk + auto approval silent-call semantics

expert-session-materialize.ts
  materializes Expert task transcript into local Hermes state.db
```

## 2.2 Problem

Frozen v2 Consumer Contract 明确禁止旧模型中的：

```text
WORK-EXPERT-CONTRACT
ExpertProjectionStore
expert.start
skillName
SkillRunStore
```

并要求：

```text
Remote Expert Catalog
+
Remote ACP WSS
+
ACP session/resume
+
ResourceLink attachments/artifacts
+
Permission bridge
```

因此当前代码不能通过“改一个 URL”完成迁移。

必须完成：

```text
Old Work Expert task execution model
        ↓ migration
Remote ACP session execution model
```

## 2.3 Impact

业务影响：

```text
Remote Expert 从“显式 Expert Skill 单次任务”
升级为“可连续 session 的远程 Agent 对话”。
```

工程影响：

```text
Main Process execution owner 从 HermesTask REST/SSE service
切换为 ACP WebSocket client。
```

安全影响：

```text
JWT / Org / WSS URL / Trace / ResourceLink 校验必须全部留在 Main。
```

运维影响：

```text
Desktop 不再需要 ACP sidecar binary 生命周期。
Provider compatibility 可通过 /remote-experts/contracts 独立诊断。
```

AI Coding 影响：

```text
Plan Agent MUST NOT 复用旧 HermesTask/Skill semantics 补全 Remote ACP。
```

---

# 3. Scope / Non-goal

## 3.1 In Scope

```text
SCOPE-001  冻结 Remote Expert v2 Consumer Contract Lock
SCOPE-002  Remote Expert Catalog REST Consumer
SCOPE-003  Contract Discovery / Compatibility Gate
SCOPE-004  Electron Main Remote ACP WebSocket Client
SCOPE-005  initialize / session/new / session/resume / session/close
SCOPE-006  session/prompt streaming
SCOPE-007  disconnect/reconnect + after_seq resume
SCOPE-008  session/request_permission → UI → permission response
SCOPE-009  session/cancel
SCOPE-010  Public Attachment upload → ResourceLink
SCOPE-011  Artifact ResourceLink → File Platform
SCOPE-012  Original Chat Remote Expert selector / send routing
SCOPE-013  Remote ACP session reference / transcript projection persistence
SCOPE-014  旧 Work Expert production path 退出
SCOPE-015  Local Chat regression isolation
SCOPE-016  Golden Consumer E2E / G7 Evidence
```

## 3.2 Out of Scope

```text
NON-GOAL-001  MUST NOT 修改 NodeSkClaw Provider Public Contract 语义。
NON-GOAL-002  MUST NOT 修改 nodeskclaw-agent ACP Runtime Gateway ownership。
NON-GOAL-003  MUST NOT 修改 Remote Hermes Engine。
NON-GOAL-004  MUST NOT 引入 nodeskclaw-acp.exe 到 Desktop package。
NON-GOAL-005  MUST NOT direct-call nodeskclaw-agent。
NON-GOAL-006  MUST NOT direct-call Remote Hermes。
NON-GOAL-007  MUST NOT 复活 Remote Agent REST v1.x 作为 fallback。
NON-GOAL-008  MUST NOT 把 Remote Expert 映射回 SkillRunStore。
NON-GOAL-009  MUST NOT 改造 Knowledge bounded context。
NON-GOAL-010  MUST NOT 改造 Automation / nodeskclaw-task。
NON-GOAL-011  MUST NOT 改变 Local Hermes Chat protocol。
NON-GOAL-012  MUST NOT 删除历史 frozen WORK-EXPERT-CONTRACT v1.0.2 bundle；只能退出 production dependency。
```

## 3.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| User Selection | Renderer | Catalog DTO | `agent_ref` | Provider routing |
| Auth / Org Context | Main Auth | Stored session | Bearer + `currentOrgId` | Remote runtime identity |
| Contract Gate | Main Remote Expert | Discovery payload + pinned lock | compatible / incompatible | Provider contract generation |
| Catalog | NodeSkClaw Backend | JWT/org | Remote Expert list | Agent run state |
| Public ACP Transport | Main RemoteAcpClient + Backend | WSS frames | ACP JSON-RPC frames | Agent internal routing |
| ACP Formal Session | nodeskclaw-agent | ACP methods | sessionId/events | Desktop local session SOT |
| Agent Run / Attempt / Terminal | nodeskclaw-agent | session/prompt | updates/result | Desktop task store |
| Hermes Native Run | Remote Hermes | Agent Runtime request | native run events | Public auth |
| Attachment Authority | NodeSkClaw Backend | uploaded bytes | attachment_ref | Desktop local path |
| Artifact Authority | NodeSkClaw Backend / Agent | public ResourceLink | authorized bytes | Internal object-store credential |
| Transcript Projection | SMC Desktop | ACP public events | Original Chat messages | Run SOT |
| Local Chat | Local Hermes | Local Compose | Local Chat stream | Remote Expert |

---

# 4. Terminology

**Remote Expert**  
NodeSkClaw Backend Catalog 中以 `agent_ref` 公开的已发布 Expert。

**agent_ref**  
Public Remote Expert identity；Provider 实现中对应 `Expert.expert_slug`。SMC 只把它作为公开路由标识。

**ACP Session**  
由 `nodeskclaw-agent` 持有事实源的 Formal Run Session；公开引用为 `sessionId`。

**Desktop Chat Session**  
SMC Original Chat 的本地 UI/历史容器，不是远端 ACP Session SOT。

**RemoteAcpClient**  
Electron Main 中唯一允许建立 Public WSS、发送 ACP JSON-RPC、接收 `session/update` / permission request 的客户端。

**Contract Gate**  
把本地 pinned contract identity 与 Backend Discovery 做严格比较的 fail-closed gate。

**ResourceLink**  
ACP prompt/update 中的公开资源引用。Attachment 只接受 `nodeskclaw://attachment/<attachment_ref>`；Artifact 使用 Provider 输出的公开 ResourceLink。

**Projection**  
SMC 为 UI/恢复保存的非权威副本。Projection 不能覆盖远端 Agent SOT。

**Golden Consumer**  
真实 `smc-copilot` 安装/运行形态连接真实 Backend/Agent/Hermes 的 E2E 验收。

---

# 5. System Context

## 5.1 Target Context Diagram

```text
Employee PC
┌───────────────────────────────────────────────────────┐
│ smc-copilot / apps/work                              │
│                                                       │
│ Original Chat / Compose                              │
│   ├─ Local Chat                                      │
│   │    └─ Local Hermes Gateway                       │
│   │                                                  │
│   └─ Remote Expert                                   │
│        ├─ RemoteExpertCatalogClient                  │
│        ├─ RemoteExpertContractGate                   │
│        ├─ RemoteAttachmentClient                     │
│        └─ RemoteAcpClient                            │
└───────────────────┬───────────────────────────────────┘
                    │ HTTPS + WSS
                    │ nodeskclaw.remote-acp.v1
                    ▼
┌───────────────────────────────────────────────────────┐
│ nodeskclaw-backend                                   │
│ Auth / Org / Expert ACL / Catalog / Discovery        │
│ Public ACP Ingress / Placement / Capability / Proxy  │
└───────────────────┬───────────────────────────────────┘
                    │ internal WSS
                    ▼
┌───────────────────────────────────────────────────────┐
│ nodeskclaw-agent                                     │
│ ACP Session + Run/Attempt/Event/Terminal SOT          │
│ Permission / Artifact / Hermes Bridge                │
└───────────────────┬───────────────────────────────────┘
                    ▼
              Remote Hermes
```

## 5.2 System Boundary

```text
Inside SMC boundary:
  Renderer selection / Original Chat
  Main auth integration
  Contract Gate
  Catalog Client
  Remote Attachment Client
  Remote ACP Client
  Public event normalization
  UI transcript projection
  File Platform integration
  Golden Consumer tests/evidence

Outside SMC boundary:
  Backend ACL
  Runtime placement
  execution capability
  Agent Formal Session
  Agent Run/Attempt/Event/Terminal
  Remote Hermes execution
  Backend attachment authority
  Provider artifact authority

Trusted input:
  Frozen consumer lock in source tree
  Main-process stored auth session after validation
  Same-origin Backend HTTPS/WSS endpoint

Untrusted input:
  Renderer IPC input
  Backend catalog payload until schema validation
  ACP frames until JSON-RPC / method / session validation
  ResourceLink URI
  file metadata
  user-selected local file
```

---

# 6. Authoritative State / Source of Truth

| State | Type | Authoritative? | Writer | Reader | 自动覆盖 |
|---|---|---:|---|---|---:|
| Frozen Contract identity | DESIRED_STATE | YES | Source control | Contract Gate | NO |
| Provider Discovery | OBSERVED_STATE | YES for provider runtime compatibility | Backend | Contract Gate | N/A |
| Remote Expert Catalog | OBSERVED_STATE | YES | Backend | Main/Renderer | cache only |
| Selected `agent_ref` | RUNTIME_STATE | YES for current UI selection | Renderer | Main at submit | YES by user |
| JWT / currentOrgId | RUNTIME_STATE | YES | Auth subsystem | Main only | auth lifecycle |
| ACP `sessionId` | RUNTIME_STATE | YES | nodeskclaw-agent | Main | NO |
| ACP event sequence | RUNTIME_STATE | YES | nodeskclaw-agent | Main | monotonic only |
| Agent Run / Attempt / Terminal | RUNTIME_STATE | YES | nodeskclaw-agent | via ACP | NO |
| Remote Hermes native run | RUNTIME_STATE | YES | Hermes | Agent | NO |
| Desktop transcript | RESOLVED_STATE | NO; projection | SMC | Renderer/sidebar | ACP-derived only |
| Desktop Remote Session Ref | LAST_APPLIED_STATE | NO; reference | SMC | resume | ACP-derived only |
| `attachment_ref` | RUNTIME_STATE | YES | Backend | Main / ACP prompt | NO |
| Artifact ResourceLink | RUNTIME_STATE | YES | Agent/Backend | Main | NO |
| ManagedFile metadata for artifact | RESOLVED_STATE | NO; projection | File Platform | Renderer | Provider-derived only |
| Local Hermes Chat state | RUNTIME_STATE | YES for local path | Local Hermes | Local Chat | Remote path MUST NOT write as authority |

Invariant：

```text
SMC MUST NOT write a competing Agent Run SOT.
SMC MUST NOT infer terminal state from WebSocket close alone.
SMC MUST NOT convert local transcript persistence into ACP ownership.
```

---

# 7. State Machines

## 7.1 Contract Gate

```text
UNRESOLVED
  ↓ GET /api/v1/remote-experts/contracts
DISCOVERED
  ├─ exact pins match → COMPATIBLE
  └─ any mismatch     → INCOMPATIBLE
```

`INCOMPATIBLE`：

```text
MUST block session/new
MUST block session/prompt
MUST expose REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
MUST NOT fallback to old Expert/Skill/HermesTask path
```

## 7.2 Remote ACP Connection / Session

```text
IDLE
  ↓ select ready Expert + contract compatible
CONNECTING
  ↓ WSS accepted with required subprotocol
CONNECTED
  ↓ initialize(protocolVersion=1)
INITIALIZED
  ↓ session/new
SESSION_ACTIVE
  ↓ session/prompt
PROMPT_ACTIVE
  ├─ session/update → PROMPT_ACTIVE
  ├─ session/request_permission → WAITING_PERMISSION
  │       ↓ valid user decision
  │    PROMPT_ACTIVE
  ├─ terminal response → SESSION_ACTIVE
  ├─ session/cancel → CANCELLING → SESSION_ACTIVE
  └─ socket lost → DISCONNECTED
                    ↓ reconnect + initialize + session/resume(after_seq)
                  SESSION_ACTIVE
  ↓ session/close
CLOSED
```

非法转移：

```text
UNRESOLVED/INCOMPATIBLE → session/new
CONNECTED without initialize → session/new
no active session → session/prompt
permission for stale session/generation → permission response
CLOSED → prompt
```

非法转移必须：

```text
0 Provider mutation when failure is locally detectable
0 Local Chat fallback
explicit error
```

## 7.3 Prompt Turn

```text
CREATED
  ↓ UUID JSON-RPC id frozen
SUBMITTED
  ↓ first update
STREAMING
  ├─ permission request → WAITING_PERMISSION → STREAMING
  ├─ cancel → CANCELLING → CANCELLED
  ├─ result → COMPLETED
  └─ error → FAILED
```

同一个 prompt turn：

```text
request_id MUST remain stable across reconnect/replay.
```

---

# 8. Data / Schema Contract

## 8.1 Consumer Lock

新建：

```text
contracts/remote-expert-frontend/v2.0.0/
├── consumer-lock.json
└── SHA256SUMS
```

`consumer-lock.json` schema：

```json
{
  "contractName": "REMOTE-EXPERT-FRONTEND-CONTRACT",
  "contractVersion": "2.0.0",
  "providerRepository": "loudon84/nodeskclaw",
  "tagName": "remote-expert-frontend-contract-v2.0.0",
  "tagTargetCommit": "5d36d6f7bebe1e70e7e031eaf384e124c76d98bc",
  "frontendContractDigest": "22ad68dd1132a073f6df5d2bf9f219b683c73ebb7ea1fa48933c9b92a744ecd5",
  "catalogContractVersion": "1.1.0",
  "catalogContractDigest": "d51d27a33e6776be780bf3556ffa4ef4f6dab7f731c0a48421683708364efd2c",
  "remoteAcpContractVersion": "1.0.0",
  "remoteAcpContractDigest": "8a48e74e363c71875739c33b2bcdcb6f6f2ea7ee15897ae9fb9b8e9407ee9d06",
  "acpProtocolVersion": 1,
  "transportProfile": "nodeskclaw.remote-acp.v1"
}
```

Rules：

```text
additionalProperties = false
all fields required
```

## 8.2 RemoteExpertCatalogItem

```ts
interface RemoteExpertCatalogItem {
  agentRef: string
  displayName: string
  description: string | null
  category: string | null
  tags: string[]
  avatar: string | null
  status: "ready" | "unavailable"
  capabilities: {
    acp: {
      protocolVersion: 1
      remoteTransport: boolean
    }
    sessionResume: boolean
    attachments: string
    artifacts: string
    permissions: boolean
    [publicCapability: string]: unknown
  }
}
```

Callability：

```text
status == ready
AND capabilities.acp.protocolVersion == 1
AND capabilities.acp.remoteTransport == true
```

## 8.3 RemoteAcpSessionRef

```ts
interface RemoteAcpSessionRef {
  schemaVersion: 1
  desktopSessionId: string
  agentRef: string
  acpSessionId: string
  lastSeq: number
  connectionState:
    | "active"
    | "disconnected"
    | "closed"
  updatedAt: string
}
```

这是 resume reference，不是 Run SOT。

## 8.4 RemoteExpertTurnRequest

```ts
interface RemoteExpertTurnRequest {
  kind: "remote-expert"
  agentRef: string
  desktopSessionId: string
  requestId: string        // UUID string
  promptText: string
  managedFileIds: string[]
  authGeneration: string
}
```

禁止字段：

```text
skillName
taskId
HermesTask
runtime_run_id
agent internal URL
Hermes URL
execution capability
internal token
```

## 8.5 Attachment Receipt

`POST /api/v1/attachments` 成功结果：

```ts
interface RemoteAttachmentReceipt {
  attachment_ref: string
  name: string
  size_bytes: number
  checksum_sha256: string
  content_type: string
  expires_at: string
}
```

转换：

```text
attachment_ref = att_xxx
→
ACP ResourceLink URI:
nodeskclaw://attachment/att_xxx
```

## 8.6 Public ACP Frame

```text
jsonrpc = "2.0"

request:
  id = UUID string
  method = string
  params = object

notifications / server requests:
  session/update
  session/request_permission

resume:
  params._meta.nodeskclaw.after_seq = non-negative integer
```

---

# 9. Requirements

# REQ-CONTRACT-001 — Frozen Contract Pin + Runtime Compatibility Gate

### Goal

Consumer 只能连接已冻结且与本地 pin 完全一致的 Remote ACP Provider。

### Normative Requirement

```text
MUST vendor consumer-lock.json + SHA256SUMS.
MUST pin tag target commit 5d36d6f7...
MUST GET /api/v1/remote-experts/contracts before first ACP session mutation.
MUST exact-match all version/digest/protocol/transport fields.
MUST fail closed on mismatch.
MUST NOT fallback to WORK-EXPERT / Remote Agent REST / ACP sidecar.
```

### Inputs

```text
local consumer-lock
Backend discovery payload
```

### Preconditions

```text
PRE-CONTRACT-001 Backend base URL resolvable
```

### Authoritative State

```text
SOT desired: local consumer-lock
Observed: Backend discovery
Derived: compatible | incompatible
```

### State Transition

```text
UNRESOLVED → DISCOVERED → COMPATIBLE | INCOMPATIBLE
```

### Allowed Side Effects

```text
ALLOW:
  in-memory compatibility cache
  sanitized diagnostic log
```

### Forbidden Side Effects

```text
DENY:
  ACP session mutation before compatible
  contract auto-rewrite
  provider pin mutation at runtime
  fallback execution
```

### Ownership Scope

```text
FILE:
  contracts/remote-expert-frontend/v2.0.0/*
CODE:
  Main RemoteExpertContractGate
```

### Idempotency

```text
Repeated discovery with same payload → same compatibility result.
```

### Failure Semantics

```text
F-CONTRACT-001:
trigger: network unavailable
expected state: UNRESOLVED
error code: REMOTE_EXPERT_DISCOVERY_UNAVAILABLE
rollback: none
retryable: true

F-CONTRACT-002:
trigger: any identity mismatch
expected state: INCOMPATIBLE
error code: REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
rollback: none
retryable: false until provider/config changes
```

### Postconditions

```text
POST-CONTRACT-001 compatible is machine provable.
```

### Invariants

```text
INV-CONTRACT-001 No mutating ACP call before compatible.
```

### Error Codes

```text
REMOTE_EXPERT_DISCOVERY_UNAVAILABLE
REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
```

### Acceptance

```text
A-CONTRACT-001
A-NEG-CONTRACT-001
```

### Evidence

```text
unit contract-gate test
consumer lock checksum output
live discovery comparison artifact
```

---

# REQ-CATALOG-001 — Public Remote Expert Catalog

### Goal

Renderer 只看到 Public Catalog，不再看到 Expert Skill execution catalog。

### Normative Requirement

```text
MUST use GET /api/v1/remote-experts.
MUST parse Remote Expert Catalog v1.1.0 schema.
MUST use agent_ref as identity.
MUST display unavailable entries as non-callable when returned.
MUST NOT call /api/v1/expert/mcp for Remote Expert v2.
MUST NOT request per-Expert skillName for Remote ACP submit.
```

### Inputs

```text
JWT
currentOrgId
catalog response
```

### Preconditions

```text
authenticated
contract compatible
```

### Authoritative State

```text
SOT: Backend Catalog
Derived cache: Main TTL cache
```

### State Transition

```text
EMPTY → LOADING → READY | ERROR
```

### Allowed Side Effects

```text
ALLOW Main memory cache
ALLOW Renderer selection reconciliation
```

### Forbidden Side Effects

```text
DENY synthetic slug
DENY fallback slug = tool.name
DENY skill list fetch for Remote ACP
```

### Ownership Scope

```text
Main RemoteExpertCatalogClient
Shared DTO
Renderer RemoteExpertSelector
```

### Idempotency

```text
GET repeated → read-only.
```

### Failure Semantics

```text
401 → auth refresh once, then REMOTE_EXPERT_AUTH_REQUIRED
403 → REMOTE_EXPERT_FORBIDDEN
5xx/network → REMOTE_EXPERT_CATALOG_UNAVAILABLE
invalid schema → REMOTE_EXPERT_CATALOG_INVALID
```

### Postconditions

```text
Selected identity is exact Backend agent_ref.
```

### Invariants

```text
INV-CATALOG-001 status != ready => no session/new.
```

### Error Codes

```text
REMOTE_EXPERT_AUTH_REQUIRED
REMOTE_EXPERT_FORBIDDEN
REMOTE_EXPERT_CATALOG_UNAVAILABLE
REMOTE_EXPERT_CATALOG_INVALID
```

### Acceptance

```text
A-CATALOG-001
A-NEG-CATALOG-001
```

### Evidence

```text
schema fixture tests
live catalog snapshot
```

---

# REQ-TRANSPORT-001 — Electron Main Public Remote ACP WSS

### Goal

所有 Remote ACP transport credential 和 socket ownership 留在 Electron Main。

### Normative Requirement

```text
MUST connect:
  /api/v1/remote-experts/{agent_ref}/acp

MUST send handshake:
  Authorization: Bearer <access token>
  X-Org-Id: <currentOrgId>
  X-Trace-Id: <UUID>

MUST negotiate:
  Sec-WebSocket-Protocol: nodeskclaw.remote-acp.v1

MUST NOT place credential/token in query string.
MUST NOT expose JWT or raw WSS credential to Renderer.
MUST NOT connect agent/internal endpoints.
```

### Inputs

```text
backendUrl
accessToken
currentOrgId
agentRef
traceId
```

### Preconditions

```text
contract compatible
agent callable
currentOrgId non-empty
```

### Authoritative State

```text
SOT connection: Main RemoteAcpClient
Auth SOT: Auth subsystem
```

### State Transition

```text
IDLE → CONNECTING → CONNECTED | FAILED
```

### Allowed Side Effects

```text
network WSS
trace log without credential
```

### Forbidden Side Effects

```text
query credential
Renderer WebSocket
token logging
direct Agent/Hermes connection
```

### Ownership Scope

```text
Main RemoteAcpClient only
```

### Idempotency

```text
One logical connection attempt has one traceId.
Reconnect creates a new traceId but resumes same acpSessionId.
```

### Failure Semantics

Map Provider pre-upgrade errors exactly:

```text
REMOTE_ACP_AUTH_REQUIRED
REMOTE_ACP_ORG_FORBIDDEN
REMOTE_ACP_EXPERT_NOT_FOUND
REMOTE_ACP_EXPERT_FORBIDDEN
REMOTE_ACP_EXPERT_UNAVAILABLE
REMOTE_ACP_RUNTIME_UNAVAILABLE
REMOTE_ACP_ROUTE_FAILED
REMOTE_ACP_TRANSPORT_UNSUPPORTED
REMOTE_ACP_CONTRACT_MISMATCH
```

### Postconditions

```text
accepted socket subprotocol == nodeskclaw.remote-acp.v1
```

### Invariants

```text
INV-TRANSPORT-001 Renderer never owns credentialed Remote ACP socket.
```

### Acceptance

```text
A-TRANSPORT-001
A-NEG-TRANSPORT-001
```

### Evidence

```text
WSS handshake integration test
negative query-token test
Renderer token leak scan
```

---

# REQ-SESSION-001 — initialize + Formal ACP Session Lifecycle

### Goal

Remote Expert 对话使用 Agent-owned Formal ACP Session。

### Normative Requirement

```text
MUST initialize with protocolVersion=1 after WSS connect.
MUST create session using session/new.
MUST persist returned sessionId only as reference.
MUST support session/close.
MUST NOT fabricate ACP sessionId locally.
MUST NOT map ACP session ownership to HermesTask/local run SOT.
```

### Inputs

```text
agentRef
desktopSessionId
```

### Preconditions

```text
WSS connected
contract compatible
```

### Authoritative State

```text
SOT: nodeskclaw-agent
Projection: RemoteAcpSessionRef
```

### State Transition

```text
CONNECTED → INITIALIZED → SESSION_ACTIVE → CLOSED
```

### Allowed Side Effects

```text
ACP session mutation
persist public session reference
```

### Forbidden Side Effects

```text
server-side duplicate session SOT
local fabricated sessionId
```

### Ownership Scope

```text
Main session controller
Desktop continuation reference
```

### Idempotency

```text
session/new is not blindly retried after unknown commit.
If response state is unknown after disconnect, reconnect MUST resolve via known session reference or start a user-visible new session; MUST NOT silently create two sessions for one acknowledged ID.
```

### Failure Semantics

```text
initialize failure → ACP_INITIALIZE_FAILED
session/new failure → REMOTE_EXPERT_SESSION_CREATE_FAILED
session/close failure → REMOTE_EXPERT_SESSION_CLOSE_FAILED
```

### Postconditions

```text
active Remote Expert chat has exactly one current public acpSessionId.
```

### Invariants

```text
INV-SESSION-001 acpSessionId always originates from Provider response.
```

### Acceptance

```text
A-SESSION-001
A-NEG-SESSION-001
```

### Evidence

```text
live initialize/new/close trace
session reference persistence fixture
```

---

# REQ-PROMPT-001 — Remote Prompt Streaming

### Goal

Original Chat 的 Remote Expert send 映射为 ACP `session/prompt`，而不是 `expert.start/tools/call`。

### Normative Requirement

```text
MUST use UUID string JSON-RPC request id.
MUST send prompt blocks under active sessionId.
MUST render session/update incrementally.
MUST derive completion from matching JSON-RPC terminal response/provider terminal semantics.
MUST keep requestId stable for the logical turn.
MUST NOT call expert.start.
MUST NOT carry skillName.
MUST NOT call HermesTask REST/SSE for new Remote Expert turns.
MUST NOT fallback to Local Chat when Remote Expert send fails.
```

### Inputs

```text
RemoteExpertTurnRequest
ACP sessionId
attachment ResourceLinks
```

### Preconditions

```text
contract compatible
session active
agent status ready
auth generation unchanged
```

### Authoritative State

```text
Run/Event/Terminal SOT: Agent
UI projection: SMC
```

### State Transition

```text
CREATED → SUBMITTED → STREAMING → COMPLETED | FAILED | CANCELLED
```

### Allowed Side Effects

```text
send ACP frame
append/update UI transcript projection
persist lastSeq
```

### Forbidden Side Effects

```text
HermesTask creation through old endpoint
Skill selection lookup
Local Hermes send
```

### Ownership Scope

```text
RemoteAcpClient
RemoteExpert Chat routing
```

### Idempotency

```text
same logical turn = same UUID requestId
MUST NOT generate a new requestId for transport replay
```

### Failure Semantics

```text
socket lost before terminal → DISCONNECTED and resume flow
provider error → preserve exact public error_code when available
local validation failure → 0 network mutation
```

### Postconditions

```text
one submit action cannot intentionally create two logical prompt runs.
```

### Invariants

```text
INV-PROMPT-001 Remote Expert failure never falls through to Local Hermes.
```

### Error Codes

```text
REMOTE_EXPERT_PROMPT_REJECTED
REMOTE_EXPERT_PROMPT_FAILED
REMOTE_EXPERT_SESSION_NOT_ACTIVE
```

### Acceptance

```text
A-PROMPT-001
A-NEG-PROMPT-001
```

### Evidence

```text
streaming integration trace
request-id replay unit test
network spy proving old endpoints=0
```

---

# REQ-RECONNECT-001 — Disconnect / Resume / Event Fencing

### Goal

网络断开后恢复同一 ACP Formal Session，不制造新 Run。

### Normative Requirement

```text
MUST track highest accepted public event seq.
MUST reconnect WSS with fresh traceId.
MUST initialize again.
MUST call session/resume with same sessionId.
MUST send _meta.nodeskclaw.after_seq when lastSeq > 0.
MUST de-duplicate replayed event seq.
MUST NOT infer terminal from disconnect.
MUST NOT start replacement prompt during unresolved reconnect.
```

### Inputs

```text
acpSessionId
lastSeq
```

### Preconditions

```text
prior session exists
connection lost
```

### Authoritative State

```text
Event order SOT: provider seq
```

### State Transition

```text
PROMPT_ACTIVE/SESSION_ACTIVE
→ DISCONNECTED
→ CONNECTING
→ INITIALIZED
→ RESUMING
→ SESSION_ACTIVE
```

### Allowed Side Effects

```text
new WSS connection
session/resume
projection de-dup
```

### Forbidden Side Effects

```text
new session/new during ordinary resume
duplicate transcript insert
duplicate side effect run
```

### Ownership Scope

```text
RemoteAcpClient reconnect controller
```

### Idempotency

```text
event with seq <= lastSeq → no second UI/business side effect.
```

### Failure Semantics

```text
resume 404/invalid → REMOTE_EXPERT_SESSION_LOST
runtime unavailable → keep reference, show retryable disconnected state
```

### Postconditions

```text
successful resume continues same acpSessionId.
```

### Invariants

```text
INV-RECONNECT-001 lastSeq monotonic non-decreasing.
```

### Acceptance

```text
A-RECONNECT-001
A-NEG-RECONNECT-001
```

### Evidence

```text
forced socket close E2E
duplicate seq injection test
```

---

# REQ-PERM-001 — ACP Permission Bridge

### Goal

把 Agent permission request 显示为 Human-in-the-Loop UI，并把决定回传到当前 attempt。

### Normative Requirement

```text
MUST receive session/request_permission in Main.
MUST expose sanitized permission request to Renderer.
MUST require explicit user action for non-auto response.
MUST reply using server request id.
MUST preserve Provider _meta.nodeskclaw fencing metadata.
MUST support at least allow_once and deny when offered by Provider options.
MUST NOT auto-allow arbitrary permission requests in production.
MUST NOT send response for stale session/auth generation.
```

### Inputs

```text
server permission JSON-RPC request
user decision
```

### Preconditions

```text
active session
matching request id/session generation
```

### Authoritative State

```text
Pending permission request: current Main connection
Decision: user action
Attempt validity: Provider
```

### State Transition

```text
STREAMING → WAITING_PERMISSION → STREAMING | FAILED
```

### Allowed Side Effects

```text
Renderer approval card
one JSON-RPC response
```

### Forbidden Side Effects

```text
credential display
silent arbitrary allow
stale response
```

### Ownership Scope

```text
RemoteAcpClient permission bridge
Original Chat approval UI
```

### Idempotency

```text
one server permission request id → at most one user decision response.
```

### Failure Semantics

```text
stale/local mismatch → REMOTE_EXPERT_PERMISSION_STALE, 0 response
provider stale fencing → surface provider public error
```

### Postconditions

```text
permission card resolves once.
```

### Invariants

```text
INV-PERM-001 permission response remains bound to original request id + _meta.
```

### Acceptance

```text
A-PERM-001
A-NEG-PERM-001
```

### Evidence

```text
permission live E2E
double-click decision negative test
stale request test
```

---

# REQ-CANCEL-001 — Remote ACP Cancel

### Goal

用户停止 Remote Expert turn 时终止远端执行，而不是只停止 UI。

### Normative Requirement

```text
MUST send session/cancel with active sessionId.
MUST preserve UI in CANCELLING until Provider terminal/response.
MUST NOT mark cancelled solely because local socket/send returned.
MUST NOT call old HermesTask cancel endpoint for v2 turns.
```

### Inputs

```text
sessionId
active turn
```

### Preconditions

```text
turn non-terminal
```

### Authoritative State

```text
Terminal SOT: Agent
```

### State Transition

```text
STREAMING → CANCELLING → CANCELLED | FAILED
```

### Allowed Side Effects

```text
session/cancel JSON-RPC
```

### Forbidden Side Effects

```text
old task cancel REST
fabricated terminal
```

### Ownership Scope

```text
RemoteAcpClient + Chat cancel routing
```

### Idempotency

```text
repeated UI cancel while CANCELLING → no duplicate local transition; at most one active cancel request at a time.
```

### Failure Semantics

```text
transport unavailable → remain unresolved/disconnected; resume/reconcile
```

### Postconditions

```text
cancelled terminal must be provider-observed.
```

### Invariants

```text
INV-CANCEL-001 UI terminal cannot outrun Provider terminal.
```

### Acceptance

```text
A-CANCEL-001
A-NEG-CANCEL-001
```

### Evidence

```text
long-running live cancel test
old cancel endpoint network spy=0
```

---

# REQ-ATTACH-001 — Local File → Public Attachment → ACP ResourceLink

### Goal

Remote Expert 可以消费 Compose 附件，但 Desktop local path 永不成为 Remote Hermes path。

### Normative Requirement

```text
MUST upload selected remote file bytes using:
  POST /api/v1/attachments
  multipart field: file

MUST use authenticated Backend same-origin transport.
MUST validate receipt fields.
MUST convert:
  attachment_ref
  →
  nodeskclaw://attachment/<attachment_ref>

MUST place only ResourceLink into ACP prompt.
MUST NOT send file:// URI.
MUST NOT send Windows/POSIX absolute local path.
MUST NOT embed arbitrary http/https ResourceLink.
MUST NOT reuse expired attachment_ref.
```

### Inputs

```text
ManagedFile IDs
File Platform readable bytes
```

### Preconditions

```text
Remote Expert selected
catalog capabilities.attachments == "resource_link"
```

### Authoritative State

```text
local bytes: File Platform
attachment_ref: Backend
```

### State Transition

```text
LOCAL_FILE
→ UPLOADING
→ ATTACHMENT_READY
→ PROMPT_RESOURCE_LINK
```

### Allowed Side Effects

```text
Backend upload
temporary read stream
receipt cache scoped to auth/org/expiry
```

### Forbidden Side Effects

```text
raw local path on wire
upload to Agent internal endpoint
provider storage credential in Renderer
```

### Ownership Scope

```text
RemoteAttachmentClient
File Platform bridge
```

### Idempotency

```text
One upload attempt may create one attachment_ref.
Retry after unknown upload commit MUST create a new ref only when prior receipt was not obtained; prompt MUST reference only the chosen valid receipt.
```

### Failure Semantics

Map public attachment errors:

```text
ATTACHMENT_TOO_LARGE
ATTACHMENT_TYPE_UNSUPPORTED
ATTACHMENT_SCAN_BLOCKED
ATTACHMENT_REF_INVALID
ATTACHMENT_NOT_FOUND
ATTACHMENT_SCOPE_DENIED
ATTACHMENT_EXPIRED
```

Local file read error:

```text
REMOTE_ATTACHMENT_LOCAL_READ_FAILED
```

### Postconditions

```text
ACP frame contains 0 local filesystem path.
```

### Invariants

```text
INV-ATTACH-001 Attachment authority is Backend, not Desktop path.
```

### Acceptance

```text
A-ATTACH-001
A-NEG-ATTACH-001
```

### Evidence

```text
REAL positive file upload + Remote Hermes consumption
wire capture showing nodeskclaw://attachment/...
negative file:// test
```

---

# REQ-ARTIFACT-001 — ACP Artifact ResourceLink → File Platform

### Goal

Remote Hermes 产生的 artifact 在 Original Chat / Session Files 中可预览、保存、物化。

### Normative Requirement

```text
MUST detect Provider artifact ResourceLink from ACP public updates.
MUST accept only Provider public artifact identity for current agent/session.
MUST download through Backend public authorized route:
  /api/v1/remote-experts/{agent_ref}/acp/runs/{run_id}/artifacts/{artifact_id}

MUST use Cache-Control no-store semantics for authority fetch.
MUST hand resulting bytes/metadata to existing File Platform.
MUST NOT use old /api/v1/hermes/artifacts/{artifact_id} Expert path for v2.
MUST NOT expose internal object-store credential/url.
```

### Inputs

```text
ACP artifact ResourceLink
agentRef
```

### Preconditions

```text
authenticated
resource belongs to active/public ACP stream
```

### Authoritative State

```text
artifact bytes/authorization: Backend
ManagedFile: local projection
```

### State Transition

```text
RESOURCE_LINK_OBSERVED
→ REGISTERED
→ PREVIEW/DOWNLOAD ON DEMAND
```

### Allowed Side Effects

```text
File Platform metadata upsert
authorized download
preview cache/materialization
```

### Forbidden Side Effects

```text
internal storage URL
old Hermes artifact discovery
blind cross-origin URL navigation
```

### Ownership Scope

```text
RemoteArtifactClient
File Platform remote provider adapter
```

### Idempotency

```text
same public artifact identity → upsert same ManagedFile remote identity.
```

### Failure Semantics

```text
403 → FILE_REMOTE_FORBIDDEN / ARTIFACT_ACCESS_DENIED
404 → FILE_REMOTE_NOT_FOUND
5xx → FILE_REMOTE_UNAVAILABLE
integrity mismatch when checksum provided → FILE_INTEGRITY_MISMATCH
```

### Postconditions

```text
Renderer opens artifact through ManagedFile identity, not privileged raw URL.
```

### Invariants

```text
INV-ARTIFACT-001 File Platform remains Desktop file UI authority.
```

### Acceptance

```text
A-ARTIFACT-001
A-NEG-ARTIFACT-001
```

### Evidence

```text
live artifact create/download/preview
same artifact duplicate-upsert test
cross-origin negative test
```

---

# REQ-UI-001 — Original Chat Remote Expert UX

### Goal

复用现有 Original Chat / Compose，不建立第二套 Remote Expert Chat 页面。

### Normative Requirement

```text
MUST retain Original Chat as Remote Expert surface.
MUST replace Expert+Skill selector semantics with Remote Expert selector semantics.
MUST identify selection by agent_ref.
MUST show ready/unavailable state.
MUST route Send to Remote ACP only when Remote Expert selected.
MUST route Send to Local Hermes when no Remote Expert selected and Local mode applies.
MUST fail closed when a Remote Expert is selected but not callable.
MUST NOT silently clear selected Expert and send locally on remote failure.
MUST NOT require skillName.
MUST NOT gate Remote ACP send on old expert-compat execution mode.
```

### Inputs

```text
RemoteExpertCatalogItem[]
selected agentRef
Compose prompt/files
```

### Preconditions

```text
authenticated for remote selection
```

### Authoritative State

```text
selection: Renderer
callability: catalog + contract gate
```

### State Transition

```text
LOCAL
↔ REMOTE_EXPERT_SELECTED
→ REMOTE_SESSION_ACTIVE
```

### Allowed Side Effects

```text
selection state
Chat message projection
```

### Forbidden Side Effects

```text
second chat screen
skill picker for Remote ACP
implicit Local fallback
```

### Ownership Scope

```text
Chat.tsx routing
RemoteExpertContextControl/Selector
Remote Expert message cards
```

### Idempotency

```text
UI re-render does not initiate network mutation.
```

### Failure Semantics

```text
selected unavailable → REMOTE_EXPERT_UNAVAILABLE; Send disabled/blocked
contract incompatible → REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
```

### Postconditions

```text
user can distinguish Local Chat vs selected Remote Expert before Send.
```

### Invariants

```text
INV-UI-001 selection intent must survive until explicitly changed or invalidated by catalog.
```

### Acceptance

```text
A-UI-001
A-NEG-UI-001
```

### Evidence

```text
component tests
routing spies
manual screenshot optional; automated routing oracle required
```

---

# REQ-PERSIST-001 — Session Reference / Transcript Projection Persistence

### Goal

App restart或页面恢复后可以 resume Remote ACP session，同时不创建第二套 Run SOT。

### Normative Requirement

```text
MUST persist minimal RemoteAcpSessionRef.
MUST persist public transcript/UI projection needed by existing Chat history UX.
MUST mark/structure Remote ACP continuation so resume routes to RemoteAcpClient.
MUST NOT persist Agent internal run/attempt/capability/token as authoritative state.
MUST NOT resume a Remote ACP transcript through Local Hermes.
```

### Inputs

```text
desktopSessionId
agentRef
acpSessionId
lastSeq
public transcript events
```

### Preconditions

```text
session/new returned successfully
```

### Authoritative State

```text
remote execution: Agent
local persistence: projection/reference only
```

### State Transition

```text
ACTIVE → PERSISTED_REFERENCE → APP_RESTART → RESUME
```

### Allowed Side Effects

```text
Desktop continuation store
existing session cache/transcript projection
```

### Forbidden Side Effects

```text
fake remote terminal
capability/token persistence
Local Hermes execution ownership
```

### Ownership Scope

```text
session-continuation schema
remote ACP continuation normalizer
sidebar projection adapter
```

### Idempotency

```text
same desktopSessionId/acpSessionId → upsert, not duplicate.
```

### Failure Semantics

```text
projection persistence failure:
  remote run continues
  UI shows non-durable warning
  error REMOTE_EXPERT_PROJECTION_PERSIST_FAILED

resume reference missing:
  MUST NOT guess sessionId
```

### Postconditions

```text
restart can call session/resume with exact stored acpSessionId when reference exists.
```

### Invariants

```text
INV-PERSIST-001 Local persistence never outranks remote session state.
```

### Acceptance

```text
A-PERSIST-001
A-NEG-PERSIST-001
```

### Evidence

```text
restart/resume E2E
local store inspection
secret-field absence test
```

---

# REQ-MIGRATE-001 — Retire Old Work Expert Production Execution Path

### Goal

v2 Remote Expert 生产路径只有一个 execution owner，避免旧/new 双写双执行。

### Normative Requirement

```text
MUST remove production dependency on:
  WORK_EXPERT_CONTRACT
  expert.start
  skillName
  ExpertProjectionStore
  /api/v1/expert/mcp for Remote Expert
  HermesTask Expert lifecycle for new Remote Expert
  old Expert artifact REST
  nodeskclaw-acp.exe

MUST preserve historical contracts/files when deletion cannot prove ownership.
MUST preserve Local Chat and SkillRun as independent product paths.
MUST NOT use old path as runtime fallback.
```

### Inputs

```text
work/prd-v6.3 source inventory
```

### Preconditions

```text
new Remote ACP implementation tests green
```

### Authoritative State

```text
production execution owner: RemoteAcpClient
```

### State Transition

```text
DUAL_CODEBASE / OLD_ACTIVE
→ NEW_IMPLEMENTED
→ OLD_PRODUCTION_REFERENCES_REMOVED
→ VERIFIED
```

### Allowed Side Effects

```text
code delete/refactor within owned Expert path
new tests
lat.md update
contract lock addition
```

### Forbidden Side Effects

```text
delete frozen historical contract bundle without ownership proof
modify SkillRun semantics
modify Local Chat transport
```

### Ownership Scope

Candidate owned production paths:

```text
apps/work/src/main/expert/*
apps/work/src/preload/expert-api.ts
apps/work/src/shared/expert.ts
apps/work/src/renderer/src/modules/expert/*
apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.ts
Expert branches inside Chat.tsx
apps/work/lat.md/expert-execution.md
apps/work/tests/*expert*
contracts/work-expert/v1.0.2 consumer dependency references
```

Recommended target namespace:

```text
apps/work/src/main/remote-expert/
apps/work/src/shared/remote-expert.ts
apps/work/src/preload/remote-expert-api.ts
apps/work/src/renderer/src/modules/remote-expert/
```

### Idempotency

```text
migration checker repeated → same forbidden-reference count.
```

### Failure Semantics

```text
unknown ownership → PRESERVE + REPORT
conflicting branch change → SMC_BASELINE_CONFLICT
forbidden production reference remains → REMOTE_EXPERT_LEGACY_PATH_PRESENT
```

### Postconditions

```text
forbidden production reference count = 0
new Remote Expert network path count = expected Remote ACP public endpoints only
```

### Invariants

```text
INV-MIGRATE-001 Remote Expert has exactly one production execution path.
```

### Acceptance

```text
A-MIGRATE-001
A-NEG-MIGRATE-001
```

### Evidence

```text
static source scan
network integration spy
Local Chat regression suite
SkillRun regression suite
```

---

# REQ-SEC-001 — Public Boundary / Credential / Resource Security

### Goal

Desktop 只消费公开 Remote Expert Contract，不扩大信任边界。

### Normative Requirement

```text
MUST keep JWT in Main auth subsystem.
MUST use currentOrgId from authenticated stored session.
MUST generate X-Trace-Id as UUID.
MUST validate same Backend origin for HTTP resources.
MUST reject file/http/https arbitrary ACP ResourceLink input except Provider-defined public artifact route handling.
MUST sanitize logs.
MUST NOT log:
  Authorization
  refresh token
  execution capability
  internal token
  provider credential
MUST NOT expose:
  Agent URL
  Hermes URL
  /internal/*
```

### Inputs

```text
auth session
public resource links
remote frames
```

### Preconditions

```text
Main process trust boundary intact
```

### Authoritative State

```text
credential authority: auth subsystem
resource authority: Backend
```

### State Transition

```text
N/A
```

### Allowed Side Effects

```text
sanitized logs
```

### Forbidden Side Effects

```text
credential persistence outside auth store
cross-origin privileged fetch
path traversal / arbitrary file path transport
```

### Ownership Scope

```text
RemoteAcpClient
RemoteAttachmentClient
RemoteArtifactClient
IPC DTO sanitizers
```

### Idempotency

```text
security validation read-only.
```

### Failure Semantics

```text
REMOTE_EXPERT_ORG_REQUIRED
REMOTE_EXPERT_RESOURCE_DENIED
CROSS_ORIGIN_REJECTED
REMOTE_EXPERT_CREDENTIAL_LEAK_GUARD
```

### Postconditions

```text
Renderer public DTO contains no secret-bearing field.
```

### Invariants

```text
INV-SEC-001 Public Consumer never learns execution capability/internal token.
```

### Acceptance

```text
A-SEC-001
A-NEG-SEC-001
```

### Evidence

```text
IPC snapshot
log scan
network destination allowlist test
```

---

# REQ-OBS-001 — Remote ACP Observability

### Goal

出现 Contract、WSS、resume、permission、attachment、artifact 问题时可定位而不泄露凭证。

### Normative Requirement

```text
MUST record:
  operationId
  traceId
  stage
  status
  timestamp
  agentRef
  desktopSessionId
  acpSessionId when public
  requestId when public
  lastSeq
  public errorCode

MUST define stages:
  DISCOVER
  CATALOG
  CONNECT
  INITIALIZE
  SESSION
  PROMPT
  PERMISSION
  RESUME
  ATTACHMENT
  ARTIFACT
  CLOSE

MUST redact credentials.
```

### Inputs

```text
Remote Expert operation lifecycle
```

### Preconditions

```text
none
```

### Authoritative State

```text
observability = evidence, not execution SOT
```

### State Transition

```text
operation stage transitions only
```

### Allowed Side Effects

```text
local diagnostic log/evidence
```

### Forbidden Side Effects

```text
secret logging
full private file bytes
internal capability
```

### Ownership Scope

```text
Remote Expert Main subsystem logger
```

### Idempotency

```text
duplicate log event does not mutate execution.
```

### Failure Semantics

```text
logging failure MUST NOT change ACP execution state.
```

### Postconditions

```text
each failed public operation has public error code + trace context.
```

### Invariants

```text
INV-OBS-001 Evidence cannot become authoritative terminal state.
```

### Acceptance

```text
A-OBS-001
A-NEG-OBS-001
```

### Evidence

```text
redacted log fixture
failure trace
```

---

# REQ-GOLDEN-001 — Real SMC Golden Consumer Gate

### Goal

用真实 SMC Consumer 证明 Provider Contract 可生产消费。

### Normative Requirement

```text
MUST run:
  real smc-copilot
  → real nodeskclaw-backend
  → real nodeskclaw-agent
  → real Remote Hermes

MUST cover:
  contract discovery
  catalog
  initialize
  session/new
  prompt streaming
  session/resume
  positive attachment upload + consumption
  permission
  cancel
  artifact
  terminal
  disconnect/reconnect
  auth/org/ACL negative cases
  contract mismatch negative case
  Local Chat isolation

MUST record exact repo SHAs and clean/dirty state.
MUST treat SKIPPED/BLOCKED as non-PASS.
```

### Inputs

```text
built apps/work
live Provider
test account/org/expert
```

### Preconditions

```text
all unit/component/integration required acceptance PASS
```

### Authoritative State

```text
Evidence state only
```

### State Transition

```text
UNRUN → RUNNING → PASS | FAIL | BLOCKED
```

### Allowed Side Effects

```text
test ACP sessions/runs
test attachment/artifact
test logs/evidence
```

### Forbidden Side Effects

```text
production user data mutation outside dedicated test fixture
```

### Ownership Scope

```text
acceptance scripts/evidence only
```

### Idempotency

```text
test fixture uses unique session/request/resource IDs per run.
```

### Failure Semantics

```text
any required case != PASS → Release Gate FAIL, process exit != 0
```

### Postconditions

```text
G7 PASS is machine-readable.
```

### Invariants

```text
INV-GOLDEN-001 Synthetic tests cannot substitute real consumer evidence.
```

### Acceptance

```text
A-GOLDEN-001
```

### Evidence

```text
machine-readable G7 evidence JSON
```

---

# 10. Side-Effect Contract

| Operation | Local DB Write | File Write | Network | Cache | User Data | Provider Business Source |
|---|---:|---:|---:|---:|---:|---:|
| Contract discover | NO | NO | YES GET | MAY | NO | NO |
| Catalog list/get | NO | NO | YES GET | YES | NO | NO |
| WSS connect/init | NO | NO | YES | MAY | NO | NO |
| session/new | MAY projection | MAY projection | YES | YES | NO | YES session |
| session/prompt | MAY transcript | MAY projection | YES | YES | YES prompt | YES run |
| session/resume | MAY reference | MAY projection | YES | YES | NO | NO new run |
| permission response | MAY UI | MAY projection | YES | YES | YES decision | YES attempt side effect |
| cancel | MAY UI | MAY projection | YES | YES | YES | YES |
| attachment upload | NO | temp MAY | YES | receipt MAY | YES file bytes | YES attachment |
| artifact preview/download | NO | temp/cache MAY | YES | MAY | provider output | NO source rewrite |
| Local Chat | existing | existing | localhost existing | existing | existing | NO Remote ACP |

Rules：

```text
Read-only operation MUST NOT mutate Provider business state.
Projection writes MUST NOT be interpreted as remote execution authority.
```

---

# 11. Ownership Contract

## 11.1 Ownership Types

```text
Consumer lock                 FILE / GENERATED_FROM_PROVIDER_PIN
Remote Expert Main subsystem  FILE / SMC_OWNED
Chat routing branches         SECTION / SHARED
Auth store                    SHARED / AUTH_OWNED
File Platform                 SHARED / FILE_PLATFORM_OWNED
Historical work-expert lock   FILE / PRESERVE
Provider contracts            EXTERNAL / READ_ONLY
```

## 11.2 Drift Rules

```text
current == baseline
→ normal migration

current != baseline and touched section not owned by Remote Expert change
→ PRESERVE + merge around it

current != baseline and changes same routing/DTO/transport ownership
→ BLOCK with SMC_BASELINE_CONFLICT
```

## 11.3 Remove Rules

```text
Old production import/call:
  REMOVE

Historical frozen contract artifact:
  PRESERVE

User-owned settings/session data:
  PRESERVE

Unknown ownership:
  PRESERVE + REPORT
  MUST NOT DELETE
```

---

# 12. Identity / Hash Contract

## 12.1 Provider Tag Identity

```text
repo = loudon84/nodeskclaw
tag = remote-expert-frontend-contract-v2.0.0
tag target = 5d36d6f7bebe1e70e7e031eaf384e124c76d98bc
```

## 12.2 Aggregate Consumer Digest

Algorithm：

```text
SHA256(
  exact bytes of:
  contracts/remote-expert-frontend/v2.0.0/SHA256SUMS
)
```

Expected：

```text
22ad68dd1132a073f6df5d2bf9f219b683c73ebb7ea1fa48933c9b92a744ecd5
```

No line-ending normalization is permitted during verification.

## 12.3 Component Digests

```text
Catalog v1.1.0:
d51d27a33e6776be780bf3556ffa4ef4f6dab7f731c0a48421683708364efd2c

Remote ACP Gateway v1.0.0:
8a48e74e363c71875739c33b2bcdcb6f6f2ea7ee15897ae9fb9b8e9407ee9d06
```

## 12.4 JSON-RPC Request Identity

Mutating Remote ACP request：

```text
id = UUID string
```

Prompt replay identity：

```text
same logical turn
→ same requestId
```

---

# 13. Transaction Contract

Remote ACP 网络操作不是跨 Desktop/Provider 的 ACID transaction；本 PRD 采用“本地 projection commit discipline”。

## 13.1 Prompt Local Transaction

```text
T0 =
  current desktop transcript
  RemoteAcpSessionRef
  lastSeq
  attachment receipt set

prepare:
  validate contract/auth/org/catalog
  upload attachments
  freeze requestId/prompt blocks

network mutation:
  session/prompt

commit local projection:
  only after request sent/accepted public event observed

terminal:
  only from Provider public terminal/result
```

## 13.2 Failure Atomicity

在第一次网络 mutation 前失败：

```text
AfterFailure(local managed scope) == T0
Provider prompt side effect = 0
```

网络 mutation 后连接中断：

```text
MUST NOT rollback by creating another prompt.
MUST enter reconnect/resume/reconcile.
```

## 13.3 Attachment Transaction

```text
local file read
→ upload
→ validate receipt
→ build ResourceLink
→ prompt
```

如果 upload 已成功但 prompt 未发送：

```text
attachment may remain until provider expiry
MUST NOT fabricate prompt success
MUST NOT reuse after expiry
```

## 13.4 Rollback Failure

不适用远端业务 side effect 的强制回滚；采用 reconcile。

本地临时文件 cleanup 失败：

```text
MUST log recovery path
MUST preserve evidence
MUST NOT mark Remote ACP run failed solely due cleanup failure
```

---

# 14. Failure Contract

| Failure | Expected State | Retry | Mutation Rule |
|---|---|---:|---|
| Contract discovery network fail | UNRESOLVED | YES | ACP mutation=0 |
| Contract mismatch | INCOMPATIBLE | NO | ACP mutation=0 |
| Catalog 401 | auth refresh once | YES once | session mutation=0 |
| Org missing | BLOCKED | after login/org change | WSS=0 |
| WSS pre-upgrade 403 | FAILED | after permission change | session=0 |
| WSS drop during prompt | DISCONNECTED | resume | no new prompt |
| duplicate event seq | unchanged | N/A | UI side effect=0 |
| stale permission | WAIT/FAILED | NO blind retry | response=0 locally |
| attachment upload fail | prompt not sent | conditional | prompt=0 |
| artifact 403 | artifact unavailable | after auth/ACL | no cross-origin fallback |
| local projection persist fail | remote continues | local retry | remote unchanged |
| old path detected | RELEASE BLOCKED | fix source | production release=0 |

---

# 15. Conflict Contract

| Conflict | Detection | Default Behavior | Error | Mutation |
|---|---|---|---|---:|
| Provider digest mismatch | Contract Gate | BLOCK | REMOTE_EXPERT_PROVIDER_INCOMPATIBLE | 0 ACP |
| selected Expert disappears | catalog refresh | clear/disable remote selection, user-visible | REMOTE_EXPERT_NOT_FOUND | 0 prompt |
| selected Expert unavailable | catalog status | BLOCK send | REMOTE_EXPERT_UNAVAILABLE | 0 prompt |
| auth generation changed | submit check | BLOCK | REMOTE_EXPERT_AUTH_GENERATION_CHANGED | 0 prompt |
| currentOrg changed | auth state | close/disconnect old context; require reselect/resume validation | REMOTE_EXPERT_ORG_CHANGED | 0 cross-org mutation |
| duplicate event | seq fence | IGNORE duplicate | none | 0 duplicate UI side effect |
| local branch ownership drift | source diff | BLOCK plan/merge | SMC_BASELINE_CONFLICT | 0 source mutation |
| old + new production execution both reachable | static/runtime scan | BLOCK release | REMOTE_EXPERT_DUAL_PATH | 0 release |

禁止：

```text
last writer wins
silent fallback
best effort across org
automatic old-path fallback
```

---

# 16. Compatibility / Migration

## 16.1 Existing State

旧 Contract：

```text
contracts/work-expert/v1.0.2/
```

旧 API/Execution：

```text
/api/v1/expert/mcp
Expert + Skill
tools/call
HermesTask
SSE/Poll
expert.start
```

旧 projection：

```text
ExpertRunProjection
ExpertProjectionStore
taskId
skillName
```

## 16.2 Migration Strategy

```text
detect
→ introduce new Remote ACP contract lock
→ implement new clients alongside tests
→ adapt Renderer selector/routing
→ migrate continuation schema
→ wire attachment/artifact/permission
→ disable/remove old production routing
→ static scan forbidden dependencies
→ Golden Consumer
→ remove dead owned code only when ownership proven
```

## 16.3 Proposed File Change Map

### New

```text
contracts/remote-expert-frontend/v2.0.0/consumer-lock.json
contracts/remote-expert-frontend/v2.0.0/SHA256SUMS

apps/work/src/shared/remote-expert.ts
apps/work/src/main/remote-expert/remote-expert-contract-gate.ts
apps/work/src/main/remote-expert/remote-expert-catalog-client.ts
apps/work/src/main/remote-expert/remote-acp-client.ts
apps/work/src/main/remote-expert/remote-attachment-client.ts
apps/work/src/main/remote-expert/remote-artifact-client.ts
apps/work/src/main/remote-expert/remote-expert-session-store.ts
apps/work/src/main/remote-expert/remote-expert-ipc.ts
apps/work/src/preload/remote-expert-api.ts
apps/work/src/renderer/src/modules/remote-expert/*
apps/work/src/main/remote-expert/*.test.ts
apps/work/src/renderer/src/modules/remote-expert/*.test.tsx
apps/work/tests/remote-expert/*
```

### Modify

```text
apps/work/src/renderer/src/screens/Chat/Chat.tsx
apps/work/src/shared/session-continuation.ts
apps/work/src/main/session-continuation-store.ts
apps/work/src/main/app/start.ts
apps/work/src/preload/index.ts or preload aggregation owner
apps/work/src/preload/index.d.ts / shared API declaration owner
apps/work/src/main/files/* remote artifact integration points
apps/work/lat.md/expert-execution.md
apps/work/lat.md/* relevant tests/index
```

### Retire from Production Path

```text
apps/work/src/main/expert/expert-gateway-client.ts
apps/work/src/main/expert/expert-run-service.ts
apps/work/src/main/expert/expert-ipc.ts
apps/work/src/main/expert/expert-continuation.ts
apps/work/src/main/expert/expert-session-materialize.ts
apps/work/src/preload/expert-api.ts
apps/work/src/shared/expert.ts
apps/work/src/renderer/src/modules/expert/*
apps/work/src/renderer/src/screens/Chat/expertDefaultEntry.ts
```

规则：

```text
“Retire”不等于无条件删除。
Plan MUST use source reference inventory to decide delete / replace / preserve test history.
```

## 16.4 Historical Data

已有旧 Expert transcript：

```text
MUST preserve.
MUST NOT retroactively convert HermesTask IDs to ACP sessionIds.
MUST open as historical/read-only where continuation cannot be proven.
```

---

# 17. External Dependency Contract

## 17.1 NodeSkClaw Frontend Aggregate

```text
name:
  REMOTE-EXPERT-FRONTEND-CONTRACT

version:
  2.0.0

repo:
  loudon84/nodeskclaw

immutable tag:
  remote-expert-frontend-contract-v2.0.0

immutable target:
  5d36d6f7bebe1e70e7e031eaf384e124c76d98bc

fallback:
  NONE

offline behavior:
  Remote Expert unavailable
  Local Chat remains available

failure behavior:
  fail closed Remote Expert
```

## 17.2 Public Attachment API

Provider public platform API at frozen tag target：

```text
POST /api/v1/attachments
multipart field=file
JWT/org member required
```

Receipt：

```text
attachment_ref
name
size_bytes
checksum_sha256
content_type
expires_at
```

该 API 是 Attachment authority dependency，但 **MUST NOT 被伪装成第三个 Remote Expert aggregate component pin**。Remote Expert aggregate 的 component pins 仍只有 Catalog + Remote ACP Gateway。

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| JWT leakage | Main-only token; IPC DTO allowlist | A-SEC-001 |
| Query credential leakage | WSS query credential forbidden | A-NEG-TRANSPORT-001 |
| Cross-org use | X-Org-Id from authenticated currentOrgId; provider ACL | A-NEG-SEC-001 |
| Direct Agent access | URL/path allowlist | A-NEG-SEC-001 |
| Local path leakage | upload + attachment ResourceLink | A-NEG-ATTACH-001 |
| Arbitrary URL resource | reject untrusted scheme/origin | A-NEG-ARTIFACT-001 |
| Permission replay | request-id + session/auth generation fence | A-NEG-PERM-001 |
| Duplicate event side effect | seq fence | A-NEG-RECONNECT-001 |
| Contract downgrade | exact digest/version gate | A-NEG-CONTRACT-001 |
| Secret log | redaction + evidence scan | A-NEG-OBS-001 |
| Old execution fallback | source/network negative acceptance | A-NEG-MIGRATE-001 |

---

# 19. Observability

每次 Remote Expert 操作至少输出：

```json
{
  "operation_id": "uuid",
  "trace_id": "uuid",
  "stage": "PROMPT",
  "status": "STARTED|PASS|FAIL",
  "timestamp": "RFC3339",
  "agent_ref": "sales-expert",
  "desktop_session_id": "...",
  "acp_session_id": "...",
  "request_id": "...",
  "last_seq": 12,
  "error_code": null
}
```

禁止字段：

```text
access_token
refresh_token
authorization_header
execution_capability
internal_token
provider_credential
file_bytes
```

---

# 20. Acceptance Design

## A-CONTRACT-001 — Exact Frozen Provider Accepted

**Requirement Refs**

```text
REQ-CONTRACT-001
```

**Given**

本地 lock 为 §8.1，Backend discovery 与 pinned values 完全一致。

**When**

执行 Contract Gate。

**Then**

```text
state = COMPATIBLE
```

**Oracle**

```text
all 8 discovery fields exact-equal
```

**Evidence**

```text
TEST-A-CONTRACT-001
exit_code=0
local_lock_digest
provider_discovery.json
```

## A-CATALOG-001 — Ready Expert Listed Without Skill Dependency

**Requirement Refs**

```text
REQ-CATALOG-001
```

**Given**

Catalog 有 `sales-expert status=ready remote_transport=true`。

**When**

Renderer 打开 Remote Expert selector。

**Then**

```text
sales-expert 可选择
skill list request count = 0
/api/v1/expert/mcp request count = 0
```

**Oracle**

network spy exact counts。

## A-TRANSPORT-001 — WSS Public Handshake

**Requirement Refs**

```text
REQ-TRANSPORT-001
```

**Then Oracle**

```text
accepted subprotocol == nodeskclaw.remote-acp.v1
Authorization header present
X-Org-Id exact currentOrgId
X-Trace-Id UUID
query token count = 0
```

## A-SESSION-001 — initialize/new/close

**Requirement Refs**

```text
REQ-SESSION-001
```

**Oracle**

```text
initialize.result.protocolVersion == 1
session/new returns non-empty sessionId
stored acpSessionId == returned sessionId
session/close completes
```

## A-PROMPT-001 — Original Chat Remote Streaming

**Requirement Refs**

```text
REQ-PROMPT-001
REQ-UI-001
```

**Oracle**

```text
session/prompt request id matches UUID regex
session/update count > 0
matching terminal response observed
old expert.start IPC count = 0
old HermesTask HTTP count = 0
Local Hermes send count = 0
```

## A-RECONNECT-001 — Same Session Resume

**Requirement Refs**

```text
REQ-RECONNECT-001
```

**Oracle**

```text
resume.sessionId == original sessionId
after_seq == pre_disconnect lastSeq
duplicate rendered event ids = 0
new session/new during resume = 0
```

## A-PERM-001 — Human Permission Round Trip

**Requirement Refs**

```text
REQ-PERM-001
```

**Oracle**

```text
permission request rendered
response id == provider request id
_meta.nodeskclaw preserved
one decision response only
```

## A-CANCEL-001 — Provider-confirmed Cancel

**Requirement Refs**

```text
REQ-CANCEL-001
```

**Oracle**

```text
session/cancel sent
terminal stopReason == cancelled
old HermesTask cancel request count = 0
```

## A-ATTACH-001 — Positive Attachment E2E

**Requirement Refs**

```text
REQ-ATTACH-001
```

**Given**

真实 Compose 选择一个允许类型的小文件，内容包含唯一 marker。

**Then**

```text
POST /api/v1/attachments HTTP success
receipt.attachment_ref matches ^att_[A-Za-z0-9_-]+$
ACP prompt contains nodeskclaw://attachment/<same-ref>
ACP prompt contains no file://
Remote Hermes response/tool evidence proves file was consumable
```

**重要**

Provider G4 当前 attachment case 对 `file://` 做负向拒绝验证；它 **不能替代本 Acceptance 的正向 Golden Consumer Attachment E2E**。

## A-ARTIFACT-001 — Artifact to File Platform

**Requirement Refs**

```text
REQ-ARTIFACT-001
```

**Oracle**

```text
artifact ResourceLink observed
authorized public artifact GET HTTP 200
ManagedFile created/upserted once
preview/materialize succeeds
old /api/v1/hermes/artifacts path request count = 0
```

## A-UI-001 — Local / Remote Explicit Routing

**Requirement Refs**

```text
REQ-UI-001
```

**Oracle**

```text
no Remote Expert selected → Local route
Remote Expert selected → Remote ACP route
Remote Expert selected + unavailable → neither route mutates provider/local Hermes
```

## A-PERSIST-001 — Restart Resume

**Requirement Refs**

```text
REQ-PERSIST-001
```

**Oracle**

```text
restart
→ exact acpSessionId recovered
→ session/resume sent
→ Local Hermes send count = 0
```

## A-MIGRATE-001 — Forbidden Production Dependency Count Zero

**Requirement Refs**

```text
REQ-MIGRATE-001
```

**Oracle**

Production runtime/static scan：

```text
WORK-EXPERT-CONTRACT Remote execution import = 0
expert.start callable production path = 0
Remote Expert request skillName = 0
/api/v1/expert/mcp Remote Expert calls = 0
nodeskclaw-acp.exe runtime reference = 0
direct /internal/ request = 0
direct Agent/Hermes endpoint = 0
```

历史 contract artifact 本身可存在，不计 production dependency。

## A-SEC-001 — Secret Boundary

**Requirement Refs**

```text
REQ-SEC-001
```

**Oracle**

```text
Renderer IPC snapshot secret fields = 0
captured logs token/internal capability matches = 0
```

## A-OBS-001 — Diagnosable Public Failure

**Requirement Refs**

```text
REQ-OBS-001
```

**Oracle**

故障日志包含：

```text
traceId
stage
agentRef
public errorCode
```

且 secret matches=0。

## A-GOLDEN-001 — Real Consumer G7

**Requirement Refs**

```text
REQ-GOLDEN-001
```

**Oracle**

所有 Required Acceptance：

```text
status == PASS
```

并且：

```text
process exit code == 0
```

---

# 21. Acceptance Input Matrix

| Case | Contract | Expert | Network | Attachment | Permission | Expected |
|---|---|---|---|---|---|---|
| 1 | match | ready | stable | none | none | prompt PASS |
| 2 | mismatch | ready | stable | none | none | BLOCK before session |
| 3 | match | unavailable | stable | none | none | BLOCK send |
| 4 | match | ready | disconnect | none | none | same-session resume |
| 5 | match | ready | stable | valid file | none | positive attachment PASS |
| 6 | match | ready | stable | file:// injected | none | DENY |
| 7 | match | ready | stable | expired ref | none | explicit attachment error |
| 8 | match | ready | stable | none | allow_once | continuation PASS |
| 9 | match | ready | stable | none | deny | provider-visible denied path |
| 10 | match | ready | cancel | none | none | provider terminal cancelled |
| 11 | match | ready | stable | none | none | artifact preview/download PASS |
| 12 | match | ready | stable | none | stale permission | 0 stale response |
| 13 | match | ready | duplicate seq | none | none | 0 duplicate UI side effect |
| 14 | match | removed after select | stable | none | none | fail closed |
| 15 | match | ready | stable | none | none | Local Chat remains separately PASS |

---

# 22. Negative Acceptance

## A-NEG-CONTRACT-001

任意 digest 改 1 hex：

```text
→ REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
→ session/new count = 0
→ prompt count = 0
→ old fallback count = 0
```

## A-NEG-CATALOG-001

Catalog item missing `agent_ref` / invalid schema：

```text
→ REMOTE_EXPERT_CATALOG_INVALID
→ item not callable
```

## A-NEG-TRANSPORT-001

尝试 query token：

```text
→ local construction rejected OR Provider auth reject
→ production client query credential count = 0
```

## A-NEG-SESSION-001

无 initialize 直接 session/new：

```text
→ local state machine block
→ WSS mutating frame count = 0
```

## A-NEG-PROMPT-001

Remote Expert selected but WSS unavailable：

```text
→ Local Hermes send count = 0
```

## A-NEG-RECONNECT-001

Provider replay `seq <= lastSeq`：

```text
→ duplicate transcript/update side effect = 0
```

## A-NEG-PERM-001

旧 permission request / double decision：

```text
→ second response count = 0
```

## A-NEG-CANCEL-001

UI click cancel：

```text
→ MUST NOT set terminal cancelled before Provider confirmation
```

## A-NEG-ATTACH-001

Prompt 包含：

```text
file:///C:/secret.txt
file:///etc/passwd
https://untrusted.example/x
```

期望：

```text
0 Remote Run side effect when rejected before run
explicit resource denial
0 local path leak
```

## A-NEG-ARTIFACT-001

跨 origin / internal object store URL：

```text
→ rejected
→ privileged fetch count = 0
```

## A-NEG-UI-001

Remote Expert selected但 unavailable：

```text
→ Remote ACP prompt count = 0
→ Local Hermes prompt count = 0
```

## A-NEG-PERSIST-001

本地 continuation 无合法 acpSessionId：

```text
→ MUST NOT invent ID
→ session/resume count = 0
```

## A-NEG-MIGRATE-001

静态植入一个 `expert.start` production call：

```text
→ migration gate FAIL
→ release exit != 0
```

## A-NEG-SEC-001

Renderer IPC 中注入/返回 `accessToken`、`executionCapability` 等：

```text
→ contract test FAIL
```

## A-NEG-OBS-001

日志出现 Bearer token：

```text
→ security acceptance FAIL
```

---

# 23. Failure Injection

| Point | Injection | Expected Postcondition |
|---|---|---|
| before discovery | network fail | ACP mutation=0 |
| after discovery before WSS | auth cleared | WSS mutation=0 |
| during WSS connect | connection reset | no session |
| after initialize before session/new | socket close | reconnect; no blind session duplicate |
| after session/new response | persistence fail | remote session exists; explicit non-durable warning |
| after prompt send before first update | socket close | resume/reconcile same request/session |
| after Nth session/update | socket close | lastSeq persisted; duplicate render=0 |
| while waiting permission | auth generation changes | stale response=0 |
| after attachment upload before prompt | prompt validation fail | uploaded ref may expire naturally; prompt=0 |
| during artifact download | stream abort | partial temp cleaned; authoritative artifact unchanged |
| during local projection write | DB error | Remote run unchanged |
| during old-path removal | ownership conflict | source mutation blocked/preserved |

---

# 24. Evidence Contract

每个 Required Acceptance 生成：

```json
{
  "acceptance_id": "A-PROMPT-001",
  "status": "PASS",
  "requirement_ids": ["REQ-PROMPT-001"],
  "test_ids": ["TEST-A-PROMPT-001"],
  "repository": "loudon84/smc-copilot",
  "branch": "implementation-branch",
  "commit_sha": "<exact SHA>",
  "provider_repository": "loudon84/nodeskclaw",
  "provider_tag": "remote-expert-frontend-contract-v2.0.0",
  "provider_tag_target": "5d36d6f7bebe1e70e7e031eaf384e124c76d98bc",
  "command": "<exact command>",
  "exit_code": 0,
  "oracle": {
    "type": "exact",
    "expected": {},
    "actual": {}
  },
  "timestamp": "RFC3339",
  "tool_versions": {},
  "evidence_files": []
}
```

Evidence MUST 关联：

```text
repo
branch
commit SHA
clean/dirty
provider tag target
test command
exit code
timestamp
tool version
```

---

# 25. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Negative | Evidence | Gate |
|---|---|---|---|---|---|
| REQ-CONTRACT-001 | INV-CONTRACT-001 | A-CONTRACT-001 | A-NEG-CONTRACT-001 | EVID-CONTRACT | REQUIRED |
| REQ-CATALOG-001 | INV-CATALOG-001 | A-CATALOG-001 | A-NEG-CATALOG-001 | EVID-CATALOG | REQUIRED |
| REQ-TRANSPORT-001 | INV-TRANSPORT-001 | A-TRANSPORT-001 | A-NEG-TRANSPORT-001 | EVID-TRANSPORT | REQUIRED |
| REQ-SESSION-001 | INV-SESSION-001 | A-SESSION-001 | A-NEG-SESSION-001 | EVID-SESSION | REQUIRED |
| REQ-PROMPT-001 | INV-PROMPT-001 | A-PROMPT-001 | A-NEG-PROMPT-001 | EVID-PROMPT | REQUIRED |
| REQ-RECONNECT-001 | INV-RECONNECT-001 | A-RECONNECT-001 | A-NEG-RECONNECT-001 | EVID-RECONNECT | REQUIRED |
| REQ-PERM-001 | INV-PERM-001 | A-PERM-001 | A-NEG-PERM-001 | EVID-PERM | REQUIRED |
| REQ-CANCEL-001 | INV-CANCEL-001 | A-CANCEL-001 | A-NEG-CANCEL-001 | EVID-CANCEL | REQUIRED |
| REQ-ATTACH-001 | INV-ATTACH-001 | A-ATTACH-001 | A-NEG-ATTACH-001 | EVID-ATTACH | REQUIRED |
| REQ-ARTIFACT-001 | INV-ARTIFACT-001 | A-ARTIFACT-001 | A-NEG-ARTIFACT-001 | EVID-ARTIFACT | REQUIRED |
| REQ-UI-001 | INV-UI-001 | A-UI-001 | A-NEG-UI-001 | EVID-UI | REQUIRED |
| REQ-PERSIST-001 | INV-PERSIST-001 | A-PERSIST-001 | A-NEG-PERSIST-001 | EVID-PERSIST | REQUIRED |
| REQ-MIGRATE-001 | INV-MIGRATE-001 | A-MIGRATE-001 | A-NEG-MIGRATE-001 | EVID-MIGRATE | REQUIRED |
| REQ-SEC-001 | INV-SEC-001 | A-SEC-001 | A-NEG-SEC-001 | EVID-SEC | REQUIRED |
| REQ-OBS-001 | INV-OBS-001 | A-OBS-001 | A-NEG-OBS-001 | EVID-OBS | REQUIRED |
| REQ-GOLDEN-001 | INV-GOLDEN-001 | A-GOLDEN-001 | covered by all negatives | EVID-G7 | REQUIRED |

---

# 26. Release Gate

## G6 — SMC Consumer Implementation

PASS 条件：

```text
A-CONTRACT-001      PASS
A-CATALOG-001       PASS
A-TRANSPORT-001     PASS
A-SESSION-001       PASS
A-PROMPT-001        PASS
A-RECONNECT-001     PASS
A-PERM-001          PASS
A-CANCEL-001        PASS
A-ATTACH-001        PASS
A-ARTIFACT-001      PASS
A-UI-001            PASS
A-PERSIST-001       PASS
A-MIGRATE-001       PASS
A-SEC-001           PASS
A-OBS-001           PASS

all A-NEG-*          PASS
Local Chat regression PASS
SkillRun regression   PASS
```

任一：

```text
FAIL
BLOCKED
SKIPPED
```

则：

```text
G6 FAIL
process exit != 0
```

## G7 — Production Golden Consumer

真实拓扑：

```text
real smc-copilot
→ real backend
→ real nodeskclaw-agent
→ real Remote Hermes
```

必须覆盖 §20/§21 所有 real-world Required cases。

只有 G7 PASS 后：

```text
SMC Remote Expert Remote ACP v2 = Production PASS
NodeSkClaw productionGate may be closed by provider release process
```

---

# 27. Plan Generation Gate

本 PRD：

```text
status = APPROVED_FOR_PLAN
```

Plan 生成前必须执行：

```text
1. verify smc branch baseline / diff
2. verify provider tag target
3. verify local consumer-lock exact digest values
4. inventory old Expert production references
5. verify no SPEC_SEMANTIC_GAP introduced by changed HEAD
```

若出现以下任一情况：

```text
Provider tag moved
Provider discovery schema changed
work/prd-v6.3 ownership files materially changed after baseline
Attachment public API behavior differs from frozen-tag implementation
Existing Chat persistence cannot distinguish Remote ACP continuation from Local Hermes resume
```

则：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT let Plan Agent invent fallback semantics
```

`.plan.md` 每个 Todo 必须包含：

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
status: planned
evidence:
```

---

# 28. Code Review Contract

Review 顺序：

```text
1. 是否真的从 Work Expert task semantics 迁移到 ACP session semantics
2. Remote state SOT 是否仍在 Agent
3. Contract Gate 是否 exact pin + fail closed
4. Renderer/Main secret boundary
5. Local/Remote Chat 是否严格隔离
6. reconnect/requestId/event seq 是否避免双执行/双渲染
7. attachment 是否完全消除 local path wire leakage
8. permission 是否有 stale fencing
9. artifact 是否只走 public authority + File Platform
10. old production path 是否为 0
11. Required Acceptance 是否有真实 Evidence
12. 最后才检查一般 code quality
```

---

# 29. Definition of Done

```text
[ ] REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0 consumer lock 已加入
[ ] consumer lock exact pin tag target 5d36d6f7...
[ ] runtime discovery exact-match gate 已实现
[ ] Remote Catalog v1.1.0 已实现
[ ] Main-only Remote ACP WSS 已实现
[ ] initialize/session-new/resume/close 已实现
[ ] session/prompt streaming 已实现
[ ] UUID request-id / replay semantics 已实现
[ ] event seq de-dup 已实现
[ ] permission bridge 已实现
[ ] cancel provider-confirmed terminal 已实现
[ ] positive attachment upload→ResourceLink→Remote Hermes E2E PASS
[ ] artifact ResourceLink→File Platform E2E PASS
[ ] Original Chat 复用完成，无第二套 Chat
[ ] Remote Expert 不再要求 skillName
[ ] expert.start production call = 0
[ ] /api/v1/expert/mcp Remote Expert production call = 0
[ ] WORK-EXPERT-CONTRACT production dependency = 0
[ ] HermesTask Remote Expert execution = 0
[ ] nodeskclaw-acp.exe dependency = 0
[ ] direct Agent/Hermes/internal access = 0
[ ] Local Chat regression PASS
[ ] SkillRun regression PASS
[ ] 所有 A-NEG-* PASS
[ ] 所有 Required Acceptance 有 machine-readable Evidence
[ ] G6 PASS
[ ] Real Golden Consumer G7 PASS
[ ] SKIPPED/BLOCKED 不被计作 PASS
[ ] 无 SPEC_SEMANTIC_GAP
```

---

# 30. Final Architecture Decision

本 PRD 冻结以下最终关系：

```text
SMC Original Chat
  ├─ Local
  │    └─ Local Hermes
  │
  └─ Remote Expert
       ├─ GET Remote Expert Catalog
       ├─ GET Contract Discovery
       ├─ POST Public Attachment
       └─ WSS Remote ACP
             ↓
          Backend
             ↓
          Agent ACP Runtime Gateway
             ↓
          Remote Hermes
```

生产环境明确禁止：

```text
SMC
→ WORK-EXPERT tools/call
→ HermesTask

SMC
→ nodeskclaw-acp.exe

SMC
→ Remote Agent REST

SMC
→ nodeskclaw-agent direct

SMC
→ Remote Hermes direct
```

这是 `REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0` 在 `smc-copilot/work/prd-v6.3` 上的唯一 Production Consumer Target。

---

# Appendix A — Provider Frozen Source Identity

```text
Repository:
https://github.com/loudon84/nodeskclaw

Frozen tag:
remote-expert-frontend-contract-v2.0.0

Tag target:
5d36d6f7bebe1e70e7e031eaf384e124c76d98bc

Aggregate:
contracts/remote-expert-frontend/v2.0.0

Catalog:
nodeskclaw-backend/contracts/remote-expert-catalog/v1.1.0

Remote ACP:
nodeskclaw-backend/contracts/remote-acp-gateway/v1.0.0
```

Public endpoints：

```text
GET  /api/v1/remote-experts/contracts
GET  /api/v1/remote-experts
GET  /api/v1/remote-experts/{agent_ref}
WSS  /api/v1/remote-experts/{agent_ref}/acp
POST /api/v1/attachments
GET  /api/v1/remote-experts/{agent_ref}/acp/runs/{run_id}/artifacts/{artifact_id}
```

---

# Appendix B — SMC Brownfield Source Inventory

Current key files verified on `work/prd-v6.3`：

```text
apps/work/lat.md/expert-execution.md
apps/work/src/main/expert/expert-gateway-client.ts
apps/work/src/main/expert/expert-run-service.ts
apps/work/src/main/expert/expert-ipc.ts
apps/work/src/main/expert/expert-session-materialize.ts
apps/work/src/preload/expert-api.ts
apps/work/src/shared/expert.ts
apps/work/src/shared/session-continuation.ts
apps/work/src/renderer/src/modules/expert/ExpertContextControl.tsx
apps/work/src/renderer/src/screens/Chat/Chat.tsx
apps/work/src/main/files/attachment-adapter.ts
apps/work/src/main/files/expert-artifact-transfer.ts
contracts/work-expert/v1.0.2/consumer-lock.json
apps/work/src/main/expert/expert-consumer-lock.test.ts
```

Migration Plan MUST re-read current branch HEAD before editing and MUST NOT depend on the line numbers captured during PRD analysis.
