---
title: "SMC Copilot Remote Expert Chat UI Entry + Consumer Release Closure 方案 PRD"
subtitle: "Remote ACP v2 Consumer 可发现性、选择语义、G6 Evidence 与 G7 Golden Consumer 闭环"
template_version: "1.0"
prd_id: "PRD-SMC-WORK-REMOTE-ACP-CONSUMER-CLOSURE-v1.0"
version: "1.0.0"
status: "APPROVED_FOR_PLAN"
product: "smc-copilot / apps/work"
repository: "https://github.com/loudon84/smc-copilot"
branch: "work/prd-v6.3"
source_commit: "ed386ac9e01d6b0a654e650a3dd7b666ae20dea0"
owner: "SMC Copilot / Work Architecture"
reviewers:
  - "SMC Copilot Desktop"
  - "NodeSkClaw Remote Expert Provider"
created_at: "2026-10-06"
updated_at: "2026-10-06"
target_release: "apps/work 0.7.12 / Remote Expert Consumer Closure"
change_type:
  - "BROWNFIELD_CHANGE"
  - "BUGFIX"
  - "INTEGRATION"
  - "GOVERNANCE"
golden_consumer: "loudon84/smc-copilot/apps/work"
related_docs:
  - "需求PRD工程模板.md"
  - "docs/expert/PRD-SMC-Copilot-Remote-ACP-v2-Consumer-Integration-v6.3.md"
  - "docs/expert/PRD-SMC-Copilot-Remote-ACP-v2-Consumer-Hotfix-v1.0.md"
  - "contracts/remote-expert-frontend/v2.0.0/"
  - "NodeSkClaw REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0"
supersedes: []
---

# 0. Document Meta / Verification Basis

## 0.1 本 PRD 的定位

本 PRD 不重新设计 Remote ACP v2 Provider，也不重新实现已经存在的 Consumer Main/Preload/ACP transport。

本 PRD 只处理 `PRD-SMC-WORK-REMOTE-ACP-CONSUMER-v2.0` 在当前 `work/prd-v6.3` 实施后的剩余闭环问题：

```text
1. Original Chat 中 Remote Expert 入口在 Gate unavailable / discovery failure 时被整体隐藏，用户无法发现功能，也无法诊断原因。
2. Remote Expert 选择目前由 Chat 局部 state 驱动，Layout 缺少一等的 remote-expert scratch-run transition；非空 Local Chat 切换 Expert 时，新建 Chat 后不会自动携带目标 agent_ref。
3. RemoteExpertSelector 在 Gate unavailable 时仍会尝试 listCatalog，造成错误叠加与诊断混淆。
4. G6 runner 已存在，但当前仓库没有可证明当前 HEAD 已通过 Required Acceptance 的 commit-bound Evidence。
5. G7 runner 当前始终输出 BLOCKED / exit 1；Golden Consumer 尚未闭环。
```

本 PRD 是 **Consumer Closure PRD**，不是 Provider PRD，也不是新的 ACP 协议版本。

## 0.2 当前源码基线

```text
Repository:
  loudon84/smc-copilot

Branch:
  work/prd-v6.3

Baseline HEAD:
  ed386ac9e01d6b0a654e650a3dd7b666ae20dea0

Commit message:
  feat(work): 接入 Remote ACP v2 Consumer 并修复审查缺陷

apps/work package version:
  0.7.11
```

Plan 生成前 MUST 重新读取该分支 HEAD。

若 HEAD != `ed386ac9e01d6b0a654e650a3dd7b666ae20dea0`：

```text
MUST diff ed386ac9e01d6b0a654e650a3dd7b666ae20dea0..HEAD
MUST inventory 本 PRD Ownership Scope 内全部变更
```

如果以下任何 ownership 已被后续 commit 语义性修改：

```text
Chat toolbar Remote Expert entry
ChatRun executionMode / scratch transition
RemoteExpertContextControl / RemoteExpertSelector
Remote Expert availability projection
Remote Expert catalog fetch lifecycle
G6 / G7 acceptance runner
```

则 Plan MUST 输出：

```text
SMC_BASELINE_CONFLICT
```

并 BLOCK 对应 Todo，禁止按旧源码行号直接实施。

## 0.3 已验证的现有实现事实

当前代码已经具备：

```text
Main:
  src/main/remote-expert/remote-acp-client.ts
  src/main/remote-expert/remote-expert-turn-service.ts
  src/main/remote-expert/remote-expert-contract-gate.ts
  src/main/remote-expert/remote-expert-catalog-client.ts
  src/main/remote-expert/remote-attachment-client.ts
  src/main/remote-expert/remote-artifact-client.ts
  src/main/remote-expert/remote-expert-session-store.ts
  src/main/remote-expert/remote-expert-transcript.ts

Preload:
  src/preload/remote-expert-api.ts

Renderer:
  src/renderer/src/modules/remote-expert/RemoteExpertContextControl.tsx
  src/renderer/src/modules/remote-expert/RemoteExpertSelector.tsx
  src/renderer/src/modules/remote-expert/RemoteExpertPermissionCard.tsx
  src/renderer/src/modules/remote-expert/RemoteExpertArtifactCards.tsx
  src/renderer/src/screens/Chat/Chat.tsx

Session classification:
  executionProvider = remote-expert-acp

Contract lock:
  REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0
  Catalog v1.1.0
  Remote ACP Gateway v1.0.0
  nodeskclaw.remote-acp.v1
```

因此本 PRD MUST NOT 创建第二套 Remote Expert transport、第二套 Chat 页面、第二套 Session SOT。

## 0.4 当前缺陷的确定性根因

当前 `Chat.tsx` 只有在以下条件之一成立时才 mount `RemoteExpertContextControl`：

```text
isRemoteExpertMode == true
OR
remoteExpertEnabled == true
```

而新 Chat 默认：

```text
executionMode = local-chat
remoteExpertEnabled = false
```

`remoteExpertEnabled` 只有在 `getAvailability()` 成功并得到 compatible 结果后才变为 true。

所以以下情况都会导致整个 Remote Expert UI Entry 不存在：

```text
Contract Discovery unreachable
Contract incompatible
Preload Remote Expert bridge unavailable
Backend not deployed / wrong backend
Main getAvailability throws
```

这与现有 `RemoteExpertSelector` 的 Negative Acceptance 语义冲突：组件测试要求 Gate unavailable 时 selector 应存在但 disabled，而真实 Chat 在外层先把组件隐藏。

## 0.5 Provider Contract Pin 不变

本 PRD MUST NOT 修改以下 pin：

```text
frontendContractVersion = 2.0.0
frontendContractDigest  = 22ad68dd1132a073f6df5d2bf9f219b683c73ebb7ea1fa48933c9b92a744ecd5
catalogContractVersion  = 1.1.0
catalogContractDigest   = d51d27a33e6776be780bf3556ffa4ef4f6dab7f731c0a48421683708364efd2c
remoteAcpContractVersion = 1.0.0
remoteAcpContractDigest  = 8a48e74e363c71875739c33b2bcdcb6f6f2ea7ee15897ae9fb9b8e9407ee9d06
acpProtocolVersion       = 1
transportProfile         = nodeskclaw.remote-acp.v1
providerTag              = remote-expert-frontend-contract-v2.0.0
providerTagTarget        = 5d36d6f7bebe1e70e7e031eaf384e124c76d98bc
```

发现真实 Provider Contract 与上述 pin 不一致时：

```text
MUST report REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
MUST NOT 绕过 Gate
MUST NOT fallback 到旧 Work Expert
MUST NOT fallback 到 Local Hermes 代替 Remote Expert 请求
```

---

# 1. 一句话目标

让 **SMC Copilot Work 的 Original Chat 用户**在 Remote ACP v2 Consumer 已存在的前置条件下，通过 **始终可发现、可诊断的 Remote Expert 入口**选择远程 Expert，并以明确的 ChatRun / agent_ref 选择语义进入现有 Remote ACP v2 执行链，同时保证 **Gate 不可用时入口不消失、Remote Expert 请求不静默回退 Local Hermes、G6 有 commit-bound Evidence、G7 能在真实拓扑上执行 Golden Consumer 验收**。

---

# 2. Background / Problem

## 2.1 Current State

当前产品行为：

```text
Original Chat
  ↓
默认 ChatRun = local-chat
  ↓
Renderer mount
  ↓
getAvailability()
  ├─ compatible → remoteExpertEnabled=true → RemoteExpertContextControl 出现
  └─ error/incompatible → remoteExpertEnabled=false → RemoteExpertContextControl 不 mount
```

当前 `RemoteExpertSelector`：

```text
mount
  ↓
无条件 listCatalog()
  ↓
Local chat option + catalog items
```

当前 `Layout/chatRuns.ts`：

```text
ChatExecutionMode:
  local-chat
  skill-run
  remote-expert

已有：
  selectSkillModeTransition()

缺少：
  selectRemoteExpertModeTransition()
```

当前 G7：

```text
scripts/remote-expert-g7.mjs
→ overall = BLOCKED
→ process.exit(1)
```

即使环境变量全部存在，当前 runner 也不会执行真实 Golden Consumer case。

## 2.2 Problem

### P-001 — Discoverability Gap

Remote Expert capability 是否“在产品里可见”被错误绑定到 Provider availability。

结果：Provider 故障、Contract mismatch、Backend 部署错误时，用户看到的是“没有这个功能”，而不是“功能存在但当前不可用”。

### P-002 — Diagnostics Gap

Main 已返回：

```text
enabled
gateState
reason
errorCode
```

但 Renderer 主要压缩为：

```text
remoteExpertEnabled: boolean
```

导致失败原因无法成为一等 UI 状态。

### P-003 — Selection Ownership Gap

Remote Expert 选择只存在于 `Chat.tsx` 局部 `remoteExpertSelected` state。

当当前 Chat 已有消息，选择 Remote Expert 触发 `onNewChat()` 后：

```text
旧 Chat return
→ Layout 创建 local-chat scratch
→ 新 Chat 没有目标 agent_ref
```

因此“确认新建 Remote Expert Chat”没有确定的选择继承语义。

### P-004 — Mode Transition Gap

`remote-expert` 已是 `ChatExecutionMode`，但 Layout 没有 Remote Expert 专用 transition owner。

这使执行模式与 Remote Expert 选择不由同一个状态转换负责。

### P-005 — Catalog Lifecycle Gap

Gate 不可用时仍可能执行 `listCatalog()`，会产生：

```text
contract error
+
catalog auth/network error
```

导致用户和 Evidence 无法区分首要失败原因。

### P-006 — G6 Evidence Gap

当前已有 G6 runner 与测试，但 Release Gate 不能仅凭“测试文件存在”或“实现代码存在”判 PASS。

必须产生与当前 repo/branch/commit 绑定的 Evidence。

### P-007 — G7 Golden Consumer Gap

当前 G7 runner 是 blocker recorder，不是 live execution harness。

因此当前状态：

```text
Implementation != Production Verified
```

## 2.3 Impact

```text
业务影响：
  Remote Expert 已实现但用户无法稳定发现，导致产品表现为“功能不存在”。

工程影响：
  executionMode、selected agent_ref、session binding 三种状态没有统一 transition owner。

安全影响：
  若为修 UI 临时绕过 Contract Gate，会破坏 v2 fail-closed 约束。

运维影响：
  Provider outage 与功能未发布在 UI 上不可区分，现场排障依赖 DevTools。

AI Coding 影响：
  若 PRD 不冻结 selection semantics，Coding Agent 可能仅把 selector 强制显示，却留下新 Chat 丢 selection、双路径、silent fallback 等问题。
```

---

# 3. Scope / Non-goal

## 3.1 In Scope

```text
SCOPE-001  Original Chat 持久可发现的 Remote Expert Entry。→ REQ-UI-001
SCOPE-002  完整 availability/gate diagnostics state。→ REQ-STATE-001
SCOPE-003  Gate-aware catalog fetch + retry。→ REQ-CATALOG-001
SCOPE-004  ChatRun 一等 Remote Expert selection/mode transition。→ REQ-STATE-002
SCOPE-005  空白 Chat / 非空 Chat / session-bound Chat 的确定性切换语义。→ REQ-UI-002
SCOPE-006  Remote Expert send fail-closed 与 Local Chat 隔离。→ REQ-ROUTE-001
SCOPE-007  UI integration tests 必须覆盖真实 ContextControl，不允许全部 mock 掉。→ REQ-TEST-001
SCOPE-008  G6 Evidence 必须与当前 commit 绑定。→ REQ-EVID-001
SCOPE-009  G7 runner 从固定 BLOCKED 改为真实 live harness + BLOCKED 条件化。→ REQ-G7-001
SCOPE-010  G7 必须验证 real smc-copilot consumer → backend → agent → Remote Hermes。→ REQ-G7-002
SCOPE-011  Remote Expert UI/Live acceptance 的日志与错误码收口。→ REQ-OBS-001
```

## 3.2 Out of Scope

```text
NON-GOAL-001  MUST NOT 修改 NodeSkClaw Provider / nodeskclaw-agent / Remote Hermes 协议。
NON-GOAL-002  MUST NOT 修改 Remote Expert Frontend Contract v2.0.0 字节或 digest。
NON-GOAL-003  MUST NOT 恢复 nodeskclaw-acp.exe / stdio sidecar。
NON-GOAL-004  MUST NOT 恢复 WORK-EXPERT-CONTRACT / expert.start / HermesTask Remote Expert 生产链。
NON-GOAL-005  MUST NOT 新建独立 Remote Expert 页面；入口固定为 Original Chat Compose。
NON-GOAL-006  MUST NOT 把 Remote Expert 合并进 SkillRunStore。
NON-GOAL-007  MUST NOT 在 Knowledge Chat（knowledgeRequired=true）自动展示 Remote Expert 入口；本 PRD 只覆盖普通 Original Chat。
NON-GOAL-008  MUST NOT 让 Renderer 持有 JWT、Backend URL、X-Org-Id secret 或 raw ACP socket。
NON-GOAL-009  MUST NOT 用 synthetic fake server 代替 G7 Golden Consumer。
NON-GOAL-010  MUST NOT 因 Remote Backend 故障阻断 Local Hermes Chat。
```

## 3.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Remote Expert Entry UX | Renderer / `modules/remote-expert` | Main availability + catalog projection | visible selector/status/retry/selection intent | token、WSS、Provider routing |
| ChatRun Transition | Renderer Layout | current ChatRun + target agent_ref + user confirm | local/remote scratch run transition | ACP session SOT |
| Secure Bridge | Preload | typed Renderer call | typed IPC | network policy |
| Availability / Contract Gate | Electron Main | Backend discovery | `RemoteExpertAvailability` | UI rendering |
| Catalog | NodeSkClaw Backend | authenticated list request | Remote Expert catalog | Desktop selection SOT |
| ACP Execution | Existing Electron Main Remote Expert bounded context | agent_ref + prompt + ManagedFile ids | semantic events/session ref/artifacts | UI layout |
| Agent Execution SOT | nodeskclaw-agent | ACP Runtime request | Run/Attempt/Event/Terminal | Desktop transcript SOT |
| Local Chat | Existing Hermes Chat path | local prompt | Local Hermes result | Remote Expert fallback |
| G6 Evidence | apps/work test runner | unit/component/integration tests | commit-bound JSON evidence | Production topology proof |
| G7 Evidence | apps/work live runner | real environment + current commit | Golden Consumer JSON evidence | Provider synthetic validation |

---

# 4. Terminology / Domain Model

## 4.1 Original Chat

`apps/work` 普通 Chat 页面；本 PRD 中排除 `Skill Run` 与 `Knowledge Chat`。

判定：

```text
isOriginalChat = !isSkillRunMode && knowledgeRequired !== true
```

## 4.2 Remote Expert Entry

Original Chat Compose toolbar 中的 Remote Expert 可发现入口。

它的存在不等价于 Remote Expert 当前可调用。

```text
Entry visibility = product capability exists
Callability       = runtime/provider state
```

二者 MUST 分离。

## 4.3 Availability

Main `getAvailability()` 返回的 Provider/Contract compatibility projection：

```text
enabled
gateState
packed
reason?
errorCode?
```

## 4.4 Gate State

沿用现有：

```text
UNRESOLVED
DISCOVERED
COMPATIBLE
INCOMPATIBLE
```

## 4.5 Catalog State

Renderer 本地加载状态：

```text
IDLE
LOADING
READY
EMPTY
ERROR
```

它不是 Backend Catalog SOT。

## 4.6 Remote Expert Selection

用户在当前 Remote Expert scratch ChatRun 中选择的 `agent_ref`。

在 ACP session 创建前，selection 是 Renderer Run State；ACP session 创建后，`desktop_remote_acp_sessions.agent_ref` 成为该 session 的 durable binding。

## 4.7 Remote Expert Scratch Run

满足：

```text
executionMode = remote-expert
sessionId = null
loading = false
no persisted transcript
```

并允许持有：

```text
remoteExpertAgentRef?: string
```

## 4.8 Session-bound Remote Expert Run

满足：

```text
executionMode = remote-expert
sessionId != null
```

其 agent_ref 不允许原地改变。

## 4.9 G6

SMC Consumer implementation/evidence gate。

Synthetic/fake-server 可以属于 G6，但 Required Acceptance 每项必须有具体 Test + Oracle + Evidence。

## 4.10 G7

Production Golden Consumer gate。

必须走真实：

```text
smc-copilot consumer
→ NodeSkClaw Backend
→ nodeskclaw-agent
→ Remote Hermes
```

---

# 5. System Context

## 5.1 Context Diagram

```text
┌─────────────────────────────────────────────────────┐
│ smc-copilot / apps/work                            │
│                                                     │
│ Original Chat                                      │
│  ├─ Remote Expert Entry (always discoverable)      │
│  │      │                                          │
│  │      ├─ availability / diagnostics              │
│  │      ├─ catalog                                 │
│  │      └─ selected agent_ref                      │
│  │                                                 │
│  ├─ Local Chat → Local Hermes                      │
│  │                                                 │
│  └─ Remote Expert                                  │
│         Renderer intent                            │
│              ↓                                     │
│         Preload typed IPC                          │
│              ↓                                     │
│         Electron Main Remote Expert Consumer       │
└──────────────┬──────────────────────────────────────┘
               │ HTTPS/WSS public contract
               ▼
┌─────────────────────────────────────────────────────┐
│ NodeSkClaw Backend                                  │
│ Contract Discovery / Catalog / Auth / ACL / WSS    │
└──────────────┬──────────────────────────────────────┘
               │ internal ACP runtime transport
               ▼
┌─────────────────────────────────────────────────────┐
│ nodeskclaw-agent                                    │
│ ACP Runtime Gateway + Run SOT                       │
└──────────────┬──────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────┐
│ Remote Hermes                                       │
└─────────────────────────────────────────────────────┘
```

## 5.2 System Boundary

```text
Inside boundary:
  apps/work Renderer Remote Expert entry/selection
  ChatRun mode transition
  existing Main Remote Expert consumer
  G6 / G7 consumer evidence harness

Outside boundary:
  NodeSkClaw Backend implementation
  nodeskclaw-agent implementation
  Remote Hermes implementation
  Contract v2.0.0 bytes

External dependency:
  NodeSkClaw public Backend
  published Remote Expert catalog
  ready agent runtime
  Remote Hermes

Trusted input:
  Main-sanitized RemoteExpertAvailability
  Main-sanitized RemoteExpertCatalogList
  persisted RemoteAcpSessionRef

Untrusted input:
  Backend HTTP/WSS body until Main validation
  catalog display text
  ACP semantic event payload before validation
  operator-supplied G7 env
```

---

# 6. Authoritative State / Source of Truth

| State | Role | Type | Authoritative? | Writer | Reader | 可否自动覆盖 |
|---|---|---|---:|---|---|---:|
| Provider Contract Compatibility | compatibility | OBSERVED_STATE | YES for Desktop runtime decision | Main `remote-expert-contract-gate` | Renderer via IPC | YES, only by fresh discovery |
| Remote Expert Catalog | callable expert list | OBSERVED_STATE | YES | NodeSkClaw Backend | Main → Renderer | YES, refresh/cache expiry |
| Entry Visibility | product capability visibility | RESOLVED_STATE | YES in Renderer rule | Renderer rule | User | NO by provider outage |
| Availability UI State | diagnostics projection | RESOLVED_STATE | YES | Renderer derives from Main DTO | Remote Expert Entry | YES on refresh |
| Scratch `remoteExpertAgentRef` | pre-session selection | RUNTIME_STATE | YES before session exists | Layout transition | Chat | YES only while scratch |
| `ChatRun.executionMode` | renderer execution route | RUNTIME_STATE | YES for active run | Layout | Chat | only via explicit transition |
| ACP session `agent_ref` binding | durable remote context | LAST_APPLIED_STATE | YES after session exists | Main session store | Main/Renderer | NO in place |
| ACP Formal Session / Run / Event / Terminal | remote execution | RUNTIME_STATE | YES | nodeskclaw-agent | Backend proxy / SMC | NO by Desktop |
| Local transcript | UI/history projection | LAST_APPLIED_STATE | YES for Desktop history | Main transcript materializer | Renderer/history | idempotent only |
| G6 Evidence | consumer verification | EVIDENCE_STATE | YES for G6 | G6 runner | Release Gate | only regenerated for same/current commit |
| G7 Evidence | production verification | EVIDENCE_STATE | YES for G7 | G7 live runner | Release Gate | only regenerated against real topology |

## 6.1 State Authority Invariants

```text
INV-STATE-001
Provider unavailable MUST NOT delete/hide product capability entry.

INV-STATE-002
Before ACP session exists, target agent_ref authority = current remote-expert ChatRun selection.

INV-STATE-003
After ACP session exists, agent_ref authority = RemoteAcpSessionRef / desktop_remote_acp_sessions.

INV-STATE-004
A session-bound Remote Expert MUST NOT mutate agent_ref in place.

INV-STATE-005
Remote Expert Gate failure MUST NOT mutate Local Hermes runtime state.

INV-STATE-006
G6/G7 PASS MUST be derived from Evidence, not from code presence.
```

---

# 7. State Machines

## 7.1 Remote Expert Availability State Machine

```text
UNINITIALIZED
    ↓ mount Original Chat
CHECKING
    ├─ compatible exact-match
    │      ↓
    │   COMPATIBLE
    │
    ├─ discovery success but digest/version mismatch
    │      ↓
    │   INCOMPATIBLE
    │
    └─ network / discovery unavailable / bridge error
           ↓
       UNAVAILABLE
```

Retry：

```text
INCOMPATIBLE → CHECKING
UNAVAILABLE  → CHECKING
COMPATIBLE   → CHECKING   (manual refresh MAY revalidate)
```

规则：

```text
CHECKING / INCOMPATIBLE / UNAVAILABLE
→ Entry MUST remain visible
→ Remote Expert selection MUST be disabled
→ Local Chat MUST remain usable
```

## 7.2 Catalog State Machine

```text
IDLE
  ↓ only when Availability=COMPATIBLE
LOADING
  ├─ items.length > 0 → READY
  ├─ items.length = 0 → EMPTY
  └─ request/parse/auth error → ERROR
```

禁止：

```text
Availability != COMPATIBLE
→ MUST NOT invoke listCatalog()
```

Retry：

```text
ERROR → LOADING
EMPTY → LOADING
READY → LOADING
```

## 7.3 ChatRun Selection State Machine

```text
LOCAL_SCRATCH
  ├─ select remote expert X
  │      ↓
  │ REMOTE_SCRATCH(X)
  │
  └─ send local
         ↓
     LOCAL_BOUND

REMOTE_SCRATCH(X)
  ├─ select local chat
  │      ↓
  │ LOCAL_SCRATCH
  │
  ├─ select remote expert Y
  │      ↓
  │ REMOTE_SCRATCH(Y)
  │
  └─ first remote submit/session create
         ↓
     REMOTE_BOUND(X)

LOCAL_BOUND
  └─ select remote expert X + user confirms
         ↓
     NEW REMOTE_SCRATCH(X)

REMOTE_BOUND(X)
  ├─ continue prompt
  │      ↓
  │ REMOTE_BOUND(X)
  │
  └─ select expert Y/local chat + user confirms
         ↓
     NEW SCRATCH RUN
```

非法转移：

```text
REMOTE_BOUND(X) → REMOTE_BOUND(Y) in place
REMOTE_BOUND(X) → LOCAL_BOUND in place
REMOTE_EXPERT mode → Local Hermes send due gate error
```

## 7.4 Release Gate State Machine

```text
IMPLEMENTED
   ↓ G6 command + all required AC evidence
G6_PASS
   ↓ real topology available
G7_RUNNING
   ├─ all required cases PASS → G7_PASS
   └─ any FAIL/BLOCKED/SKIPPED → RELEASE_BLOCKED
```

---

# 8. Data / Schema Contract

## 8.1 Existing `RemoteExpertAvailability`

沿用当前 shared contract：

```ts
interface RemoteExpertAvailability {
  enabled: boolean;
  gateState: "UNRESOLVED" | "DISCOVERED" | "COMPATIBLE" | "INCOMPATIBLE";
  packed: boolean;
  reason?: string;
  errorCode?: string;
}
```

本 PRD MUST NOT 为 UI 修复修改 Provider wire contract。

## 8.2 Renderer Derived State

实现 MAY 定义 Renderer-only type，但语义必须等价：

```ts
interface RemoteExpertEntryState {
  availabilityStatus:
    | "checking"
    | "compatible"
    | "incompatible"
    | "unavailable";
  availability: RemoteExpertAvailability | null;
  catalogStatus:
    | "idle"
    | "loading"
    | "ready"
    | "empty"
    | "error";
  catalogErrorCode?: string;
  catalogErrorMessage?: string;
}
```

Schema rule：

```text
Renderer-only
not persisted
not sent to Provider
not written to ACP JSON-RPC
```

## 8.3 ChatRun Extension

`ChatRun` 增加：

```ts
remoteExpertAgentRef?: string;
```

Field Semantic Table：

| Field | Type | Required | Default | Authority | Meaning |
|---|---|---:|---|---|---|
| executionMode | `local-chat\|skill-run\|remote-expert` | YES | `local-chat` | Layout | 当前 run 的执行路由 |
| remoteExpertAgentRef | string | NO | undefined | Layout scratch state | Remote Expert scratch 的目标 `agent_ref` |
| sessionId | string/null | YES | null | Main/Chat | Desktop session identity |

约束：

```text
executionMode != remote-expert
→ remoteExpertAgentRef MUST be undefined

executionMode == remote-expert && sessionId == null
→ remoteExpertAgentRef MAY be undefined before user selects

executionMode == remote-expert && sessionId != null
→ agent_ref MUST be resolved from RemoteAcpSessionRef
→ scratch field MUST NOT override durable binding
```

## 8.4 Evidence Schema

### G6

```json
{
  "gate": "G6",
  "overall": "PASS|FAIL|BLOCKED",
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v6.3",
  "commitSha": "...",
  "dirty": false,
  "generatedAt": "ISO-8601",
  "commands": [],
  "cases": {},
  "byId": {},
  "toolVersions": {},
  "evidenceFiles": []
}
```

### G7

```json
{
  "gate": "G7",
  "overall": "PASS|FAIL|BLOCKED",
  "consumer": {
    "repo": "loudon84/smc-copilot",
    "branch": "work/prd-v6.3",
    "sha": "...",
    "dirty": false
  },
  "provider": {
    "frontendContractVersion": "2.0.0",
    "frontendContractDigest": "...",
    "agentRef": "..."
  },
  "topology": {
    "backend": "redacted-origin-only",
    "orgIdHash": "sha256:..."
  },
  "cases": {},
  "traceIds": [],
  "artifacts": [],
  "generatedAt": "ISO-8601"
}
```

Evidence MUST NOT contain access token、refresh token、Authorization header、raw credential。

---

# 9. Requirements

# REQ-UI-001 — Original Chat Remote Expert Entry 必须始终可发现

### Goal

解决 Remote Expert 在 Gate failure 时整个入口消失的问题。

### Normative Requirement

```text
MUST 在普通 Original Chat 中始终 mount Remote Expert Entry。
MUST NOT 以 remoteExpertEnabled 作为 Entry visibility 条件。
MUST 在 availability=checking/incompatible/unavailable 时保留 Entry，并显示不可用状态。
MUST NOT 在 Skill Run 中显示 Remote Expert Entry。
MUST NOT 在 knowledgeRequired=true 的 Knowledge Chat 中显示 Remote Expert Entry。
```

### Inputs

```text
executionMode
knowledgeRequired
RemoteExpertAvailability | null
```

### Preconditions

```text
PRE-UI-001-01 Chat Renderer 已 mount。
PRE-UI-001-02 preload bridge 可以存在或暂时不可用；bridge 不可用也必须产生 unavailable UI 状态。
```

### Authoritative State

```text
SOT: Original Chat eligibility rule
Observed: Main RemoteExpertAvailability
Derived: Entry enabled/disabled/status message
```

### State Transition

```text
Before: Entry hidden because availability=false
Event: Chat mount / availability result
After: Entry visible; only callability changes
```

### Allowed Side Effects

```text
ALLOW:
  Renderer state update
  availability IPC call
  status rendering
```

### Forbidden Side Effects

```text
DENY:
  Local Hermes request
  Remote ACP connect
  session creation
  token exposure
  Backend mutation
```

### Ownership Scope

```text
SECTION:
  ChatInput toolbarExtras Remote Expert entry rendering condition

FILES:
  src/renderer/src/screens/Chat/Chat.tsx
  src/renderer/src/modules/remote-expert/RemoteExpertContextControl.tsx
```

### Idempotency

```text
first mount: one availability check
re-render: MUST NOT create duplicate semantic selection or ACP session
```

### Failure Semantics

```text
F-UI-001-01
trigger: getAvailability rejects / remoteExpert bridge missing
expected state: Entry visible + unavailable indication; Local Chat remains usable
error code: REMOTE_EXPERT_DISCOVERY_UNAVAILABLE or sanitized bridge error
rollback: none
retryable: YES
```

### Postconditions

```text
POST-UI-001-01 Original Chat 中可看到 Remote Expert capability entry。
POST-UI-001-02 Provider 故障不再表现为“功能不存在”。
```

### Invariants

```text
INV-UI-001-01 Entry visibility != provider availability
INV-UI-001-02 unavailable Remote Expert != unavailable Local Chat
```

### Error Codes

```text
REMOTE_EXPERT_DISCOVERY_UNAVAILABLE
REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
```

### Acceptance

```text
A-UI-ENTRY-001
A-NEG-UI-ENTRY-001
A-NEG-UI-ENTRY-002
```

### Evidence

```text
required test:
  Chat integration test using real RemoteExpertContextControl

required artifact:
  G6 JSON byId[A-UI-ENTRY-001]

required runtime output:
  screenshot or Playwright DOM assertion proving visible disabled entry under Gate failure
```

---

# REQ-STATE-001 — Availability 必须作为完整诊断状态，而不是单 boolean

### Goal

让 Renderer 能区分 compatible、contract mismatch、discovery unavailable、checking。

### Normative Requirement

```text
MUST 保存完整 RemoteExpertAvailability projection 或语义等价状态。
MUST 保留 gateState、reason、errorCode。
MUST 将 getAvailability 抛错映射为显式 unavailable state。
MUST 提供用户可触发的 Retry。
MUST NOT catch 后只设置 remoteExpertEnabled=false 并丢弃原因。
```

### Inputs

```text
window.hermesAPI.remoteExpert.getAvailability()
```

### Preconditions

```text
PRE-STATE-001-01 Main Remote Expert IPC 已注册，或 Renderer 能检测 bridge missing。
```

### Authoritative State

```text
SOT: Main availability DTO
Derived: Renderer display state
```

### State Transition

```text
UNINITIALIZED → CHECKING → COMPATIBLE|INCOMPATIBLE|UNAVAILABLE
retry → CHECKING
```

### Allowed Side Effects

```text
ALLOW:
  renderer in-memory state
  availability IPC request
```

### Forbidden Side Effects

```text
DENY:
  catalog request while incompatible/unavailable
  ACP connect
  session mutation
```

### Ownership Scope

```text
SECTION:
  Chat Remote Expert availability state/effect
  RemoteExpertContextControl status rendering
```

### Idempotency

```text
same availability result → same derived state
retry result supersedes previous result only when latest request wins
```

### Failure Semantics

```text
F-STATE-001-01
trigger: availability request throws
expected state: UNAVAILABLE with sanitized reason; Entry remains visible
error code: REMOTE_EXPERT_DISCOVERY_UNAVAILABLE when supplied by Main; otherwise REMOTE_EXPERT_UI_AVAILABILITY_FAILED
rollback: none
retryable: YES
```

### Postconditions

```text
POST-STATE-001-01 UI 能显示首要失败原因。
POST-STATE-001-02 DevTools 不再是唯一诊断方式。
```

### Invariants

```text
INV-STATE-001-01 errorCode MUST NOT contain token/backend credential
INV-STATE-001-02 only latest async availability request may update state
```

### Error Codes

```text
REMOTE_EXPERT_UI_AVAILABILITY_FAILED
REMOTE_EXPERT_DISCOVERY_UNAVAILABLE
REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
```

### Acceptance

```text
A-STATE-AVAIL-001
A-NEG-STATE-AVAIL-001
```

### Evidence

```text
component tests for all four display states
race test: stale slower response MUST NOT overwrite latest retry response
G6 evidence row
```

---

# REQ-CATALOG-001 — Catalog 必须受 Compatible Gate 控制并支持 Retry

### Goal

避免 Contract Gate 失败时继续请求 catalog，收口诊断顺序。

### Normative Requirement

```text
MUST 仅在 availabilityStatus=compatible 时执行 listCatalog。
MUST 在 gate unavailable/incompatible/checking 时保持 catalogStatus=idle。
MUST 在 compatible 后加载 catalog。
MUST 将 empty catalog 与 catalog error 区分。
MUST 保留 status=unavailable 的 Expert 但禁止选择。
MUST 仅允许 isRemoteExpertCallable(item)==true 的 Expert 发起 Remote ACP。
MUST 提供 catalog retry/refresh，且 retry MUST NOT mutate current session binding。
```

### Inputs

```text
availabilityStatus
listCatalog()
RemoteExpertCatalogList
```

### Preconditions

```text
PRE-CATALOG-001-01 Contract Gate COMPATIBLE
```

### Authoritative State

```text
SOT: Backend catalog response validated by Main client
Observed: Renderer cached list
Derived: option enabled/disabled
```

### State Transition

```text
IDLE → LOADING → READY|EMPTY|ERROR
ERROR|EMPTY|READY → LOADING on explicit refresh
```

### Allowed Side Effects

```text
ALLOW:
  authorized GET /api/v1/remote-experts via Main
  Renderer catalog cache
```

### Forbidden Side Effects

```text
DENY:
  ACP connect
  prompt submit
  current session agent_ref mutation
  direct Renderer HTTP
```

### Ownership Scope

```text
FILE:
  src/renderer/src/modules/remote-expert/RemoteExpertSelector.tsx

MAY add:
  src/renderer/src/modules/remote-expert/useRemoteExpertCatalog.ts
```

### Idempotency

```text
same catalog → same rendered options
refresh may replace list atomically after successful parse
```

### Failure Semantics

```text
F-CATALOG-001-01
trigger: 401/403/network/invalid catalog
expected state: catalogStatus=ERROR, no Remote Expert submit possible, Local Chat unaffected
error code: existing Main RemoteExpertError code
rollback: preserve previous selected durable session; scratch selection MAY be cleared only if selected item is proven absent/unusable after successful refresh
retryable: 401 after auth refresh according to existing transport; network YES; invalid schema NO until provider changes
```

### Postconditions

```text
POST-CATALOG-001-01 gate failure only shows gate failure, not secondary catalog failure.
POST-CATALOG-001-02 compatible empty catalog is explicitly visible as empty.
```

### Invariants

```text
INV-CATALOG-001-01 Gate incompatible → listCatalog call count == 0
INV-CATALOG-001-02 status=unavailable → option disabled
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
A-CATALOG-GATE-001
A-CATALOG-EMPTY-001
A-CATALOG-READY-001
A-NEG-CATALOG-GATE-001
```

### Evidence

```text
RemoteExpertSelector tests with call-count oracle
Chat integration test
G6 evidence
```

---

# REQ-STATE-002 — Remote Expert 必须成为一等 ChatRun Transition

### Goal

让 executionMode 与目标 agent_ref 由 Layout 统一管理，解决 `onNewChat()` 后选择丢失。

### Normative Requirement

```text
MUST 在 ChatRun 增加 scratch-only remoteExpertAgentRef。
MUST 新增确定性 selectRemoteExpertModeTransition 或语义等价的 Layout-owned transition。
MUST 在选择 Remote Expert 时使 executionMode=remote-expert。
MUST 在选择 Local Chat 时使空白 remote-expert scratch 转回 local-chat。
MUST NOT 在 session-bound run 原地修改 executionMode 或 agent_ref。
MUST NOT 依赖 Chat.tsx 局部 state 作为跨新 Chat 的唯一 selection SOT。
```

### Inputs

```text
runs
activeRunId
profile
selected agent_ref | null
current run scratch/bound state
```

### Preconditions

```text
PRE-STATE-002-01 target Expert 已来自当前 compatible catalog。
```

### Authoritative State

```text
Before session: ChatRun.executionMode + ChatRun.remoteExpertAgentRef
After session: RemoteAcpSessionRef.agentRef
```

### State Transition

```text
LOCAL_SCRATCH + expert X
→ same run REMOTE_SCRATCH(X)

REMOTE_SCRATCH(X) + expert Y
→ same run REMOTE_SCRATCH(Y)

REMOTE_SCRATCH(X) + Local Chat
→ same run LOCAL_SCRATCH

BOUND run + different context + confirm
→ create NEW scratch run with requested target
```

### Allowed Side Effects

```text
ALLOW:
  Renderer runs state mutation
  activeRunId switch
```

### Forbidden Side Effects

```text
DENY:
  existing session metadata rewrite
  existing ACP session agent_ref rewrite
  message deletion
  abort unrelated background runs
```

### Ownership Scope

```text
FILES:
  src/renderer/src/screens/Layout/chatRuns.ts
  src/renderer/src/screens/Layout/Layout.tsx
  src/renderer/src/screens/Chat/Chat.tsx
```

### Idempotency

```text
select same agent_ref on same scratch → no new run
repeat transition on existing matching remote scratch → reuse same run
```

### Failure Semantics

```text
F-STATE-002-01
trigger: target run not found / invalid transition
expected state: runs unchanged
error code: REMOTE_EXPERT_RUN_TRANSITION_INVALID
rollback: 0 mutation
retryable: after user state refresh
```

### Postconditions

```text
POST-STATE-002-01 New remote scratch can carry target agent_ref across Chat remount.
POST-STATE-002-02 Layout and Chat route agree on remote-expert mode.
```

### Invariants

```text
INV-STATE-002-01 session-bound run immutable context
INV-STATE-002-02 local-chat run MUST NOT retain remoteExpertAgentRef
```

### Error Codes

```text
REMOTE_EXPERT_RUN_TRANSITION_INVALID
```

### Acceptance

```text
A-RUN-TRANSITION-001
A-RUN-TRANSITION-002
A-RUN-TRANSITION-003
A-NEG-RUN-TRANSITION-001
```

### Evidence

```text
chatRuns unit tests
Layout transition integration test
G6 evidence
```

---

# REQ-UI-002 — Context 切换必须具有确定性用户语义

### Goal

冻结空白/非空/session-bound Chat 的切换行为。

### Normative Requirement

```text
MUST 对空白 Local scratch 直接转换为 Remote Expert scratch，不弹确认。
MUST 对已有消息的 Local Chat 选择 Remote Expert 时显示确认。
MUST 在用户确认后创建并激活携带目标 agent_ref 的新 Remote Expert scratch。
MUST 在用户取消后保持原 run、原 executionMode、原 selection 不变。
MUST 对 session-bound Remote Expert 切换 Expert 或 Local Chat 时创建新 scratch，不原地改 durable context。
MUST 在新 scratch 创建成功后才切 activeRunId。
```

### Inputs

```text
current run
messages/sessionId/title/loading
selected target
confirm result
```

### Preconditions

```text
PRE-UI-002-01 target remote item callable；选择 Local Chat 不需要 catalog callable。
```

### Authoritative State

```text
SOT: Layout run list + durable session binding when present
```

### State Transition

见 §7.3。

### Allowed Side Effects

```text
ALLOW:
  one new ChatRun when required
  activeRunId switch
```

### Forbidden Side Effects

```text
DENY:
  modify old transcript
  close old Remote ACP session automatically
  abort old run automatically unless user separately invokes close/cancel
```

### Ownership Scope

```text
SECTION:
  RemoteExpertContextControl onChange integration
  Layout remote run transition callback
```

### Idempotency

```text
cancel confirmation → exact 0 mutation
confirm repeated after activeRun switch → no duplicate identical scratch if one already exists
```

### Failure Semantics

```text
F-UI-002-01
trigger: new run transition fails
expected state: old run remains active and unchanged
error code: REMOTE_EXPERT_RUN_TRANSITION_INVALID
rollback: discard uncommitted next-state object
retryable: YES
```

### Postconditions

```text
POST-UI-002-01 用户确认的目标 Expert 在新 Chat 中仍被选中。
POST-UI-002-02 旧 session 不发生 context drift。
```

### Invariants

```text
INV-UI-002-01 user confirmation is required only for context-destructive in-place intent
INV-UI-002-02 confirmation cancel means 0 mutation
```

### Error Codes

```text
REMOTE_EXPERT_RUN_TRANSITION_INVALID
```

### Acceptance

```text
A-UI-SWITCH-001
A-UI-SWITCH-002
A-NEG-UI-SWITCH-001
A-NEG-UI-SWITCH-002
```

### Evidence

```text
React integration tests
run transition unit tests
G6 evidence
```

---

# REQ-ROUTE-001 — Remote Expert 路由必须 Fail-Closed，Local Chat 必须故障隔离

### Goal

保持 v2 Consumer 的 no-fallback 安全语义，同时不让 Remote outage 影响 Local Chat。

### Normative Requirement

```text
MUST 当 executionMode=remote-expert 时只走 Remote Expert submit path。
MUST 当 gate not compatible 时阻断 remote submit 并显示明确错误。
MUST 当 agent_ref 缺失时阻断 remote submit。
MUST 当 selected catalog item 不 callable 时阻断 remote submit。
MUST NOT 在任何 Remote Expert failure 条件下调用 Local Chat handleSend 作为 fallback。
MUST 保证 executionMode=local-chat 且未选择 Remote Expert 时继续使用现有 Local Hermes path。
```

### Inputs

```text
executionMode
remoteExpertAgentRef
availability
catalog item
RemoteAcpSessionRef
```

### Preconditions

```text
PRE-ROUTE-001-01 normal slash routing remains higher priority according to existing Chat contract。
```

### Authoritative State

```text
SOT: current ChatRun executionMode; session-bound case uses RemoteAcpSessionRef
```

### State Transition

```text
remote submit accepted → existing Remote Expert lifecycle
remote validation failure → no transport mutation
local submit → existing Local Hermes lifecycle
```

### Allowed Side Effects

```text
ALLOW remote mode:
  existing remoteExpert.submit IPC
  existing transcript optimistic row

ALLOW local mode:
  existing Local Hermes send path
```

### Forbidden Side Effects

```text
DENY:
  remote mode → Local Hermes fallback
  local mode → implicit Remote Expert submit
```

### Ownership Scope

```text
SECTION:
  Chat.tsx handleSubmitOrQueue routing
```

### Idempotency

```text
blocked validation failure → no requestId consumed by remote transport
existing remote request idempotency remains unchanged
```

### Failure Semantics

```text
F-ROUTE-001-01
trigger: incompatible gate / missing agent / unavailable expert
expected state: visible toast/status, 0 Local Hermes sends, 0 ACP session mutation
error code: existing Remote Expert code or REMOTE_EXPERT_SELECTION_REQUIRED
rollback: optimistic message MUST NOT be created before validation passes
retryable: depends on cause
```

### Postconditions

```text
POST-ROUTE-001-01 no silent fallback
POST-ROUTE-001-02 Local Chat remains functional under Remote outage
```

### Invariants

```text
INV-ROUTE-001-01 Remote failure != Local runtime failure
INV-ROUTE-001-02 one user submit chooses exactly one execution provider
```

### Error Codes

```text
REMOTE_EXPERT_SELECTION_REQUIRED
REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
REMOTE_EXPERT_UNAVAILABLE
```

### Acceptance

```text
A-ROUTE-REMOTE-001
A-ROUTE-LOCAL-001
A-NEG-ROUTE-FALLBACK-001
```

### Evidence

```text
spy-based integration test proving Local handleSend call count == 0 in blocked remote mode
Local Chat regression test proving call count == 1 in local mode
G6 evidence
```

---

# REQ-TEST-001 — UI Integration Test 必须覆盖真实 Entry，而不是把关键组件 mock 掉

### Goal

让测试能够捕获当前“组件单测 PASS，但真实 Chat 不 mount 组件”的缺陷。

### Normative Requirement

```text
MUST 新增至少一组 Chat integration test 使用真实 RemoteExpertContextControl + RemoteExpertSelector。
MUST NOT 在该组 Entry acceptance 测试中 mock RemoteExpertContextControl 为静态 div。
MUST 覆盖 compatible、unavailable、incompatible、empty catalog、ready catalog。
MUST 覆盖 non-empty local → confirmed remote new Chat selection carry-over。
MUST 覆盖 cancel confirmation 0 mutation。
```

### Inputs

```text
mocked Main IPC responses only
real Renderer Remote Expert components
```

### Preconditions

```text
PRE-TEST-001-01 jsdom/React testing environment available
```

### Authoritative State

```text
SOT: rendered DOM + spy call counts + run transition result
```

### State Transition

```text
fixture → render → interaction → assertion
```

### Allowed Side Effects

```text
ALLOW:
  test DOM
  mock IPC counters
```

### Forbidden Side Effects

```text
DENY:
  real production backend network in G6 unit/integration suite
```

### Ownership Scope

```text
FILES:
  src/renderer/src/modules/remote-expert/RemoteExpertSelector.test.tsx
  src/renderer/src/screens/Chat/Chat.remote-expert-hotfix.test.tsx
  new Chat.remote-expert-entry.test.tsx MAY be added
  src/renderer/src/screens/Layout/chatRuns.test.ts
```

### Idempotency

```text
repeat test → same deterministic assertions
```

### Failure Semantics

```text
F-TEST-001-01
trigger: required acceptance has no matching test id
expected state: G6 overall FAIL via UNCOVERED
error code: G6_REQUIRED_ACCEPTANCE_UNCOVERED
rollback: none
retryable: after adding evidence
```

### Postconditions

```text
POST-TEST-001-01 current hidden-entry regression is machine-detectable.
```

### Invariants

```text
INV-TEST-001-01 component existence alone cannot satisfy Chat integration acceptance
```

### Error Codes

```text
G6_REQUIRED_ACCEPTANCE_UNCOVERED
```

### Acceptance

```text
A-TEST-ENTRY-001
A-NEG-TEST-ENTRY-001
```

### Evidence

```text
vitest JSON assertion records with acceptance IDs in titles
```

---

# REQ-EVID-001 — G6 Evidence 必须 commit-bound 且 Required Acceptance 全覆盖

### Goal

将“代码完成”与“Consumer Verified”分离。

### Normative Requirement

```text
MUST 运行 Remote Expert G6 suite 并生成 machine-readable JSON。
MUST 在 Evidence 中记录 repo/branch/HEAD SHA/dirty state/test commands/tool versions/timestamp。
MUST 对每个 Required Acceptance 记录至少一个具体 test title + file + status。
MUST 将 UNCOVERED/BLOCKED/SKIPPED 视为非 PASS。
MUST 在 overall != PASS 时 process exit != 0。
MUST NOT 用单一 vitest exit code 自动把全部 acceptance 标 PASS。
MUST 要求 consumer working tree clean；dirty=true 时 G6 Release Evidence 状态为 BLOCKED。
```

### Inputs

```text
vitest JSON
npm typecheck result
lat check result
Git metadata
```

### Preconditions

```text
PRE-EVID-001-01 implementation commit exists
PRE-EVID-001-02 working tree clean for release evidence
```

### Authoritative State

```text
SOT: generated remote-expert-g6.json bound to current SHA
```

### State Transition

```text
NO_EVIDENCE → RUNNING → PASS|FAIL|BLOCKED
```

### Allowed Side Effects

```text
ALLOW:
  apps/work/test-results/remote-expert-g6.json
  CI artifact upload
```

### Forbidden Side Effects

```text
DENY:
  source code mutation during evidence generation
  production backend mutation
```

### Ownership Scope

```text
FILE:
  scripts/remote-expert-g6.mjs
  test-results/remote-expert-g6*.json generated artifacts
```

### Idempotency

```text
same commit + same toolchain + same tests → semantic same pass/fail result
```

### Failure Semantics

```text
F-EVID-001-01
trigger: dirty worktree
expected state: BLOCKED
error code: G6_CONSUMER_DIRTY
rollback: none
retryable: after clean commit

F-EVID-001-02
trigger: required acceptance uncovered
expected state: FAIL
error code: G6_REQUIRED_ACCEPTANCE_UNCOVERED
rollback: none
retryable: after test/evidence added
```

### Postconditions

```text
POST-EVID-001-01 G6 PASS 可以追溯到精确 commit 与测试。
```

### Invariants

```text
INV-EVID-001-01 green unit test suite != G6 PASS unless acceptance coverage complete
```

### Error Codes

```text
G6_CONSUMER_DIRTY
G6_REQUIRED_ACCEPTANCE_UNCOVERED
G6_REQUIRED_ACCEPTANCE_FAILED
```

### Acceptance

```text
A-EVID-G6-001
A-NEG-EVID-G6-001
A-NEG-EVID-G6-002
```

### Evidence

```text
remote-expert-g6.json itself
CI artifact or release attachment
```

---

# REQ-G7-001 — G7 Runner 必须从固定 BLOCKED 改为真实条件执行器

### Goal

让 `scripts/remote-expert-g7.mjs` 在真实环境满足前置条件时执行验证，而不是永远 BLOCKED。

### Normative Requirement

```text
MUST 保留缺少 live prerequisites 时 BLOCKED + exit != 0。
MUST 在 prerequisites 完整时执行真实 Golden Consumer harness。
MUST NOT 在 prerequisites 完整时仍无条件返回 BLOCKED。
MUST NOT 复制一套新的 ACP transport 作为 Golden Consumer；live harness 必须调用 smc-copilot 生产 Remote Expert consumer code path。
MUST 在运行前记录 consumer SHA 和 dirty state；dirty=true → BLOCKED。
MUST 在运行前验证 Contract Discovery exact match 与 target Expert callable。
```

### Inputs

最低环境变量：

```text
SMC_REMOTE_EXPERT_G7=1
SMC_REMOTE_EXPERT_G7_BACKEND_URL
SMC_REMOTE_EXPERT_G7_TOKEN
SMC_REMOTE_EXPERT_G7_ORG_ID
SMC_REMOTE_EXPERT_G7_USER_ID
SMC_REMOTE_EXPERT_G7_AGENT_REF
```

敏感值不得写入 Evidence。

### Preconditions

```text
PRE-G7-001-01 real NodeSkClaw Backend reachable
PRE-G7-001-02 real nodeskclaw-agent runtime ready
PRE-G7-001-03 real Remote Hermes ready
PRE-G7-001-04 token belongs to USER_ID + ORG_ID and has expert:invoke
PRE-G7-001-05 target agent_ref status=ready and remote_transport=true
PRE-G7-001-06 consumer worktree clean
```

### Authoritative State

```text
SOT: live harness results + backend/agent trace evidence
```

### State Transition

```text
BLOCKED(prereq missing)
OR
READY → RUNNING → PASS|FAIL
```

### Allowed Side Effects

```text
ALLOW:
  real ACP sessions/runs on designated test Expert
  designated test attachment upload
  designated test artifacts
  local ephemeral test session DB/evidence files
```

### Forbidden Side Effects

```text
DENY:
  changing Provider contract
  using production business Expert with uncontrolled side effects
  storing raw token in evidence/log
  direct call nodeskclaw-agent internal endpoint
  direct call Remote Hermes
```

### Ownership Scope

```text
FILES:
  scripts/remote-expert-g7.mjs
  tests/remote-expert/live/* MAY be added
```

### Idempotency

```text
Each G7 run MUST mint a unique operation/run namespace.
Repeated G7 runs MUST NOT reuse mutating prompt request IDs.
```

### Failure Semantics

```text
F-G7-001-01
trigger: env incomplete
expected state: BLOCKED
error code: G7_ENV_INCOMPLETE
rollback: none
retryable: YES

F-G7-001-02
trigger: contract mismatch
expected state: FAIL or BLOCKED according to discovery reachability; MUST NOT run prompt
error code: REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
rollback: 0 remote prompt mutation
retryable: after provider correction

F-G7-001-03
trigger: target expert unavailable
expected state: BLOCKED
error code: G7_EXPERT_NOT_READY
rollback: 0 prompt mutation
retryable: YES
```

### Postconditions

```text
POST-G7-001-01 complete prerequisites no longer end in fixed BLOCKED.
POST-G7-001-02 G7 result bound to current consumer commit.
```

### Invariants

```text
INV-G7-001-01 synthetic client cannot produce G7 PASS
INV-G7-001-02 dirty consumer cannot produce G7 PASS
```

### Error Codes

```text
G7_ENV_INCOMPLETE
G7_CONSUMER_DIRTY
G7_EXPERT_NOT_READY
G7_LIVE_CASE_FAILED
```

### Acceptance

```text
A-G7-RUNNER-001
A-NEG-G7-RUNNER-001
A-NEG-G7-RUNNER-002
```

### Evidence

```text
remote-expert-g7.json
live trace ids
consumer SHA
provider contract discovery snapshot without secrets
```

---

# REQ-G7-002 — Golden Consumer 必须覆盖真实 Remote Expert 关键路径

### Goal

关闭 productionGate 所需真实 Consumer 验证。

### Normative Requirement

```text
MUST 使用 smc-copilot production Remote Expert consumer path。
MUST 覆盖 15 个 live case。
MUST 每个 case 具有明确 Oracle、trace id 或本地可验证状态。
MUST 任一 Required case FAIL/BLOCKED/SKIPPED → G7 overall != PASS。
MUST 验证 Local Chat 在 Remote Provider outage case 后仍可用。
```

### Inputs

```text
real backend
real org/user/token
real ready agent_ref
controlled test files
controlled permission-requiring test skill/tool path
```

### Preconditions

沿用 REQ-G7-001。

### Authoritative State

```text
Remote execution SOT: nodeskclaw-agent
Desktop history/session projection SOT: smc-copilot local stores
Evidence SOT: G7 JSON + trace ids
```

### State Transition

按每个 case 独立执行；case 间不得共享会改变 Oracle 的隐式状态，除明确的 resume/reconnect case。

### Allowed Side Effects

```text
ALLOW:
  test ACP session/run
  test attachment
  permission decision
  cancel
  generated artifact
```

### Forbidden Side Effects

```text
DENY:
  non-test external business actions
  destructive enterprise integrations
  hidden Local Hermes fallback
```

### Ownership Scope

```text
G7 live harness + evidence only
production consumer behavior由现有 Remote Expert bounded context负责
```

### Idempotency

```text
All mutating JSON-RPC request IDs unique per run.
Retry case MUST verify existing Provider idempotency contract, not blind-create duplicate business run.
```

### Failure Semantics

```text
F-G7-002-01
trigger: any case oracle fails
expected state: overall FAIL; remaining non-destructive diagnostic cases MAY continue for evidence collection
error code: G7_LIVE_CASE_FAILED
rollback: close/cancel test session where applicable
retryable: after defect fixed
```

### Postconditions

```text
POST-G7-002-01 Golden Consumer production chain has real evidence.
```

### Invariants

```text
INV-G7-002-01 Required case count = 15
INV-G7-002-02 no required case may be marked PASS without evidence
```

### Error Codes

```text
G7_LIVE_CASE_FAILED
```

### Acceptance

```text
A-G7-LIVE-001 .. A-G7-LIVE-015
```

### Evidence

每个 case 至少：

```text
acceptance id
status
operation id
trace id if remote request exists
oracle expected/actual
evidence file references
elapsed ms
sanitized error code
```

---

# REQ-OBS-001 — Remote Expert Entry / G6 / G7 必须具备可诊断观测

### Goal

让 UI 入口错误、Contract/Catalog 错误、Live Gate 错误可区分。

### Normative Requirement

```text
MUST 使用结构化 stage。
MUST 对 availability retry/catalog retry/live case 记录 operation id。
MUST NOT 记录 access token/refresh token/Authorization header。
MUST 对 UI 展示的 errorCode 使用受控枚举或 sanitized code。
```

### Inputs

```text
availability result
catalog result
G6/G7 operation state
```

### Preconditions

```text
PRE-OBS-001-01 existing remote-expert-log infrastructure available for Main execution logs
```

### Authoritative State

```text
SOT: operation log/evidence record, not toast text
```

### State Transition

```text
operation start → stage records → terminal status
```

### Allowed Side Effects

```text
ALLOW:
  sanitized logs
  test evidence files
```

### Forbidden Side Effects

```text
DENY:
  secrets
  raw request headers
  user attachment bytes in log
```

### Ownership Scope

```text
Renderer diagnostic state
G6/G7 evidence serializer
existing Main remote-expert log integration if needed
```

### Idempotency

```text
same operation id identifies one operation only
```

### Failure Semantics

```text
F-OBS-001-01
trigger: evidence/log serializer detects forbidden secret field
expected state: evidence generation FAIL
error code: REMOTE_EXPERT_EVIDENCE_SECRET_LEAK
rollback: delete incomplete evidence output; keep source/runtime state unchanged
retryable: after sanitizer fix
```

### Postconditions

```text
POST-OBS-001-01 failure can be classified without inspecting credentials.
```

### Invariants

```text
INV-OBS-001-01 credentials never cross Renderer boundary
INV-OBS-001-02 evidence is sanitized before write
```

### Error Codes

```text
REMOTE_EXPERT_EVIDENCE_SECRET_LEAK
```

### Acceptance

```text
A-OBS-CLOSURE-001
A-NEG-OBS-CLOSURE-001
```

### Evidence

```text
log sanitizer test
evidence secret-scan test
```

---

# 10. Side-Effect Contract

| Operation | DB Write | File Write | Network | Cache | User Data | Business Source |
|---|---:|---:|---:|---:|---:|---:|
| render Remote Expert Entry | NO | NO | NO | NO | NO | NO |
| getAvailability | NO | NO | YES GET | Main in-memory gate cache MAY | NO | NO |
| listCatalog | NO | NO | YES GET | Main catalog cache YES | NO | NO |
| select expert on scratch | NO | NO | NO | Renderer state YES | NO | NO |
| create new remote scratch | NO | NO | NO | Renderer run state YES | NO | NO |
| submit remote prompt | YES local projection after execution | MAY via File Platform | YES WSS/HTTP | YES | YES transcript | Remote execution YES |
| G6 | NO production DB | YES evidence | NO real Provider required | test cache MAY | test fixture only | NO |
| G7 | YES test session projection | YES evidence/test files | YES real topology | YES | test transcript | designated test Expert only |

规则：

```text
Entry visibility change MUST have zero business mutation.
Availability/catalog diagnostics MUST remain read-only to remote business state.
G7 MAY mutate only designated test execution resources.
```

---

# 11. Ownership Contract

## 11.1 Ownership Type

```text
Chat toolbar entry condition         SECTION
ChatRun transition                   FUNCTION/SECTION
remoteExpertAgentRef scratch state   FIELD
RemoteAcpSessionRef agent_ref         ROW/FIELD durable binding
Provider contract                    EXTERNAL IMMUTABLE
G6/G7 evidence                       GENERATED_ONLY
```

## 11.2 Ownership Rule

```text
创建时 ownership:
  Layout owns scratch ChatRun mode/agentRef.

session 创建后:
  Main session store owns durable RemoteAcpSessionRef projection.

用户修改 selection:
  only scratch run may change in place.

升级时:
  Provider contract pin remains immutable.

remove 时:
  removing UI selection MUST NOT remove persisted old session or transcript.
```

## 11.3 Drift

```text
If current source still matches baseline semantics:
  implement normally

If ownership section changed since baseline:
  BLOCK with SMC_BASELINE_CONFLICT

If Provider contract digest changed:
  BLOCK runtime with REMOTE_EXPERT_PROVIDER_INCOMPATIBLE
```

禁止：

```text
last writer wins
silent contract adoption
silent session rebinding
```

---

# 12. Identity / Hash Contract

## 12.1 Consumer Source Identity

```text
repo = loudon84/smc-copilot
branch = work/prd-v6.3
commit = git rev-parse HEAD
clean = git status --porcelain == ""
```

G6/G7 Release Evidence：

```text
dirty == false
```

否则：

```text
BLOCKED
```

## 12.2 Org Identity Redaction

Evidence 只允许记录：

```text
orgIdHash = "sha256:" + SHA256(UTF8(org_id)).hex_lower
```

禁止记录 token。

## 12.3 Contract Identity

Contract identity 继续使用 §0.5 已冻结 version/digest。

MUST NOT 重新计算一个“等价但不同”的 normalized JSON digest 替代 Provider 定义的 digest。

## 12.4 UI Selection Identity

```text
Remote Expert identity = exact agent_ref string returned by validated catalog
```

禁止使用：

```text
displayName
array index
Hermes profile name
local profile id
```

作为 Remote Expert identity。

---

# 13. Transaction Contract

## 13.1 UI Run Transition Transaction

### T0

```text
T0 = immutable snapshot of:
  runs
  activeRunId
```

### Commit Order

```text
validate target
→ classify current run scratch/bound
→ obtain confirmation if required
→ compute next runs state in memory
→ validate invariant
→ setRuns(next)
→ setActiveRunId(nextId)
```

### Failure Atomicity

若 transition 在 commit 前失败：

```text
AfterFailure.runs == T0.runs
AfterFailure.activeRunId == T0.activeRunId
```

React 两次 state update MUST 使用一个 deterministic transition result，禁止分别重新计算。

## 13.2 G6 Evidence Transaction

```text
run tests
→ collect raw report
→ validate acceptance coverage
→ collect git/tool metadata
→ build evidence in memory
→ secret scan
→ write temp file
→ atomic rename to remote-expert-g6.json
```

失败：

```text
MUST NOT leave a final PASS evidence file from current failed run.
```

## 13.3 G7 Evidence Transaction

```text
validate prerequisites
→ validate clean consumer
→ discovery
→ catalog target check
→ execute live cases
→ cleanup/close designated test sessions where possible
→ build evidence
→ secret scan
→ atomic evidence write
```

若 rollback/cleanup 失败：

```text
MUST keep recovery evidence
MUST report cleanup error
MUST NOT convert overall to PASS
```

---

# 14. Failure Contract

| Failure | Expected State | Error Code | Mutation | Retryable |
|---|---|---|---:|---:|
| availability bridge missing | Entry visible/unavailable | REMOTE_EXPERT_UI_AVAILABILITY_FAILED | 0 business | YES after app update |
| discovery unreachable | Entry visible/unavailable | REMOTE_EXPERT_DISCOVERY_UNAVAILABLE | 0 business | YES |
| contract mismatch | Entry visible/incompatible | REMOTE_EXPERT_PROVIDER_INCOMPATIBLE | 0 business | after provider correction |
| catalog 401 | Entry visible/catalog error | REMOTE_EXPERT_AUTH_REQUIRED | 0 business | according to auth refresh |
| catalog 403 | Entry visible/catalog error | REMOTE_EXPERT_FORBIDDEN | 0 business | after permission change |
| catalog empty | Entry visible/empty | none | 0 business | YES refresh |
| run transition cancelled | old state preserved | none | 0 | user decision |
| invalid run transition | old state preserved | REMOTE_EXPERT_RUN_TRANSITION_INVALID | 0 | YES |
| blocked remote send | no local fallback | existing Remote Expert code | 0 remote prompt | depends |
| G6 dirty | BLOCKED | G6_CONSUMER_DIRTY | 0 | after commit |
| G6 uncovered AC | FAIL | G6_REQUIRED_ACCEPTANCE_UNCOVERED | 0 | after tests |
| G7 env missing | BLOCKED | G7_ENV_INCOMPLETE | 0 remote | YES |
| G7 target not ready | BLOCKED | G7_EXPERT_NOT_READY | 0 prompt | YES |
| G7 live case failure | FAIL | G7_LIVE_CASE_FAILED | bounded test effects | after fix |

---

# 15. Conflict Contract

| Conflict | Detection | Default Behavior | Error | Mutation |
|---|---|---|---|---:|
| baseline ownership changed | git diff ownership files | BLOCK Plan | SMC_BASELINE_CONFLICT | 0 |
| Provider contract mismatch | discovery exact match fails | disable Remote Expert call, keep entry visible | REMOTE_EXPERT_PROVIDER_INCOMPATIBLE | 0 prompt |
| selected scratch expert disappears after successful catalog refresh | agent_ref not found | clear scratch selection, keep remote mode needing selection | REMOTE_EXPERT_NOT_FOUND | 0 session |
| session-bound agent differs from scratch field | RemoteAcpSessionRef.agentRef != scratch | durable binding wins; ignore scratch | REMOTE_EXPERT_CONTEXT_CONFLICT | 0 binding rewrite |
| user changes context on bound session | sessionId/ref exists | require new run | none unless transition fails | new scratch only |
| G6 evidence SHA != HEAD | compare metadata | BLOCK | G6_EVIDENCE_STALE | 0 |
| G7 evidence SHA != release SHA | compare metadata | BLOCK release | G7_EVIDENCE_STALE | 0 |

禁止：

```text
last writer wins
silently rewriting durable session agent_ref
silently accepting stale evidence
```

---

# 16. Compatibility / Migration

## 16.1 Existing State

当前已有：

```text
Remote Expert sessions:
  sessionKind = chat
  executionProvider = remote-expert-acp

Remote ACP refs:
  desktop_remote_acp_sessions

Historical Work Expert:
  retired production path
```

## 16.2 Migration Rule

本 PRD 不迁移现有 DB schema。

`ChatRun.remoteExpertAgentRef` 是 Renderer runtime field：

```text
no DB migration
no historical backfill
```

恢复已存在 Remote Expert session：

```text
executionProvider=remote-expert-acp
→ executionMode=remote-expert
→ getSession(sessionId)
→ agentRef from RemoteAcpSessionRef
```

MUST NOT 从历史 title/displayName 推断 agent_ref。

## 16.3 Old UI State

旧版本启动后的 ephemeral Renderer selection 不需要迁移。

## 16.4 Unknown Ownership

无法证明某 session 是 remote-expert-acp：

```text
PRESERVE
REPORT
MUST NOT reclassify based on text/content heuristic
```

---

# 17. External Dependency Contract

## 17.1 NodeSkClaw Backend

```text
name: NodeSkClaw Remote Expert Public Backend
required APIs:
  GET /api/v1/remote-experts/contracts
  GET /api/v1/remote-experts
  GET /api/v1/remote-experts/{agent_ref}
  WSS /api/v1/remote-experts/{agent_ref}/acp
  POST /api/v1/attachments
  artifact public route

immutable contract identity:
  REMOTE-EXPERT-FRONTEND-CONTRACT v2.0.0 pins in §0.5

fallback:
  NONE for Remote Expert

offline behavior:
  Entry visible unavailable
  Local Chat unaffected

failure behavior:
  fail closed for Remote Expert submit
```

## 17.2 nodeskclaw-agent / Remote Hermes

Desktop MUST NOT connect directly。

Dependency health 只通过 Backend catalog/status/ACP public behavior 观察。

## 17.3 Git Identity

G6/G7 MUST pin exact current consumer commit SHA in Evidence。

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| Renderer token exposure | credentials remain Main-only | A-NEG-SEC-CLOSURE-001 |
| Direct internal Agent access | only Backend public HTTP/WSS | A-NEG-SEC-CLOSURE-002 |
| Contract bypass to make UI work | Entry visibility separated from callability; send still gated | A-NEG-SEC-CLOSURE-003 |
| Stale session agent substitution | session-bound agent_ref immutable | A-NEG-UI-SWITCH-002 |
| Evidence token leak | secret scan before evidence commit | A-NEG-OBS-CLOSURE-001 |
| Untrusted catalog label injection | render as text/select option, no HTML injection | A-NEG-SEC-CLOSURE-004 |
| G7 destructive business side effect | designated test Expert / controlled permission path only | A-NEG-G7-LIVE-001 |

Security invariants：

```text
Renderer MUST NOT receive accessToken.
Renderer MUST NOT build Backend URL.
Renderer MUST NOT open raw WebSocket.
G7 evidence MUST NOT contain Authorization or token material.
UI availability fix MUST NOT weaken Main Contract Gate.
```

---

# 19. Observability

## 19.1 Stages

```text
ENTRY
DISCOVER
CATALOG
SELECT
ROUTE
CONNECT
SESSION
PROMPT
RESUME
ATTACHMENT
PERMISSION
CANCEL
ARTIFACT
CLOSE
G6
G7
```

## 19.2 Minimum Record

每个 operation 至少：

```text
operation_id
stage
status
timestamp
consumer_sha
agent_ref when non-secret and applicable
sanitized error_code
trace_id when remote call exists
```

## 19.3 UI Diagnostics

Entry 至少区分：

```text
Checking Remote Experts…
Remote Expert
Remote Expert unavailable
Remote Expert contract incompatible
No Remote Experts available
Catalog unavailable
```

文案 MAY 通过现有 i18n source locale 增加 key，但 errorCode MUST 保留为机器诊断字段。

---

# 20. Acceptance Design

## A-UI-ENTRY-001 — Original Chat 在 Provider Compatible 时显示 Remote Expert Entry

### Requirement Refs

```text
REQ-UI-001
REQ-STATE-001
```

### Given

```text
executionMode=local-chat
knowledgeRequired=false
getAvailability => enabled=true, gateState=COMPATIBLE
```

### When

渲染 Chat。

### Then

```text
Remote Expert selector exists
selector enabled after catalog load
```

### Oracle

```text
getByRole("combobox") exists
getAvailability call count == 1
```

### Evidence

```text
test id: TEST-A-UI-ENTRY-001
command: vitest Chat.remote-expert-entry.test.tsx
exit code: 0
artifact: G6 byId[A-UI-ENTRY-001]
```

---

## A-NEG-UI-ENTRY-001 — Gate unavailable 时 Entry 仍存在但禁用

### Requirement Refs

```text
REQ-UI-001
REQ-STATE-001
REQ-CATALOG-001
```

### Given

```text
getAvailability => enabled=false, gateState=UNRESOLVED, errorCode=REMOTE_EXPERT_DISCOVERY_UNAVAILABLE
```

### When

渲染 Chat。

### Then

```text
Entry visible
disabled=true
shows unavailable diagnostic
listCatalog call count == 0
```

### Oracle

DOM + spy exact equality。

### Evidence

```text
TEST-A-NEG-UI-ENTRY-001
```

---

## A-NEG-UI-ENTRY-002 — Knowledge Chat / Skill Run 不出现 Remote Expert Entry

### Requirement Refs

```text
REQ-UI-001
```

### Given

Case A：`knowledgeRequired=true`。
Case B：`executionMode=skill-run`。

### When

渲染 Chat。

### Then

Remote Expert Entry 不存在。

### Oracle

```text
queryByRole(remote expert control) == null
```

### Evidence

```text
TEST-A-NEG-UI-ENTRY-002A
TEST-A-NEG-UI-ENTRY-002B
```

---

## A-STATE-AVAIL-001 — Availability Retry 从 unavailable 恢复 compatible

### Requirement Refs

```text
REQ-STATE-001
```

### Given

```text
first getAvailability throws
second getAvailability returns COMPATIBLE
```

### When

用户点击 Retry。

### Then

```text
state unavailable → checking → compatible
catalog starts only after compatible
```

### Oracle

IPC call order + final DOM state。

### Evidence

```text
TEST-A-STATE-AVAIL-001
```

---

## A-NEG-STATE-AVAIL-001 — Stale availability response 不得覆盖新状态

### Requirement Refs

```text
REQ-STATE-001
```

### Given

第一次请求慢且返回 incompatible；Retry 请求先完成并返回 compatible。

### When

两个 Promise 最终都 settle。

### Then

最终 state=compatible。

### Oracle

```text
final displayed state == compatible
```

### Evidence

```text
TEST-A-NEG-STATE-AVAIL-001
```

---

## A-CATALOG-GATE-001 — Compatible 后才加载 Catalog

### Requirement Refs

```text
REQ-CATALOG-001
```

### Given

availability compatible。

### When

Entry mount 完成。

### Then

`listCatalog()` 恰好被调用并展示返回 Expert。

### Oracle

```text
listCatalog call count == 1
option(agent_ref) exists
```

### Evidence

```text
TEST-A-CATALOG-GATE-001
```

---

## A-CATALOG-EMPTY-001 — Empty Catalog 可区分

### Requirement Refs

```text
REQ-CATALOG-001
```

### Given

```json
{"items":[]}
```

### When

catalog load complete。

### Then

显示 No Remote Experts available；Local Chat 不被阻断。

### Oracle

```text
empty diagnostic exists
remote options count == 0
```

### Evidence

```text
TEST-A-CATALOG-EMPTY-001
```

---

## A-CATALOG-READY-001 — unavailable Expert 不可选

### Requirement Refs

```text
REQ-CATALOG-001
```

### Given

catalog 同时包含 ready 与 unavailable item。

### When

打开 selector。

### Then

ready enabled；unavailable disabled。

### Oracle

DOM option.disabled exact boolean。

### Evidence

```text
TEST-A-CATALOG-READY-001
```

---

## A-NEG-CATALOG-GATE-001 — Incompatible Gate 时 Catalog 请求为 0

### Requirement Refs

```text
REQ-CATALOG-001
```

### Given

availability incompatible。

### When

渲染并等待 effect settle。

### Then

`listCatalog call count == 0`。

### Evidence

```text
TEST-A-NEG-CATALOG-GATE-001
```

---

## A-RUN-TRANSITION-001 — 空白 Local Chat 直接转 Remote Expert Scratch

### Requirement Refs

```text
REQ-STATE-002
REQ-UI-002
```

### Given

```text
active = LOCAL_SCRATCH
select agent_ref = sales-expert
```

### When

调用 remote transition。

### Then

```text
same runId
executionMode=remote-expert
remoteExpertAgentRef=sales-expert
```

### Oracle

对象字段 exact equality，runs.length 不变。

### Evidence

```text
TEST-A-RUN-TRANSITION-001
```

---

## A-RUN-TRANSITION-002 — Remote Scratch 可更换 Expert

Given `REMOTE_SCRATCH(A)`，When select B，Then same run becomes `REMOTE_SCRATCH(B)`。

Oracle：runId 相同，agentRef=B，runs.length 不变。

Evidence：`TEST-A-RUN-TRANSITION-002`。

---

## A-RUN-TRANSITION-003 — 空白 Remote Scratch 可切回 Local Chat

Given `REMOTE_SCRATCH(A)`，When select Local Chat，Then same run `executionMode=local-chat` 且 `remoteExpertAgentRef=undefined`。

Evidence：`TEST-A-RUN-TRANSITION-003`。

---

## A-NEG-RUN-TRANSITION-001 — Session-bound Run 不得原地换 Expert

Given `REMOTE_BOUND(A)`，When select B，Then 原 run 不变；必须返回 requires-new-run decision 或创建新 scratch。

Oracle：old session run agent/mode/sessionId exact unchanged。

Evidence：`TEST-A-NEG-RUN-TRANSITION-001`。

---

## A-UI-SWITCH-001 — 非空 Local Chat 确认后创建携带目标 Expert 的新 Chat

### Requirement Refs

```text
REQ-UI-002
REQ-STATE-002
```

### Given

已有 Local Chat 消息，用户选择 `finance-expert`。

### When

确认新建 Chat。

### Then

```text
old run preserved
new active run:
  executionMode=remote-expert
  remoteExpertAgentRef=finance-expert
  sessionId=null
```

### Oracle

runs count +1；new active exact fields。

### Evidence

```text
TEST-A-UI-SWITCH-001
```

---

## A-UI-SWITCH-002 — Bound Remote Expert 切换目标创建新 Scratch

Given `REMOTE_BOUND(A)`，When select B + confirm，Then old bound A preserved，新 active `REMOTE_SCRATCH(B)`。

Evidence：`TEST-A-UI-SWITCH-002`。

---

## A-NEG-UI-SWITCH-001 — 用户取消确认时 0 mutation

Oracle：pre/post runs deepEqual 且 activeRunId 不变。

Evidence：`TEST-A-NEG-UI-SWITCH-001`。

---

## A-NEG-UI-SWITCH-002 — Durable agent_ref 不得被 Scratch 值覆盖

Given persisted session ref agent=A，但 Renderer stale scratch field=B，When resume，Then execution target=A 且记录 context conflict/忽略 B。

Evidence：`TEST-A-NEG-UI-SWITCH-002`。

---

## A-ROUTE-REMOTE-001 — Remote mode 正常 submit 只调用 Remote Expert

Given mode=remote-expert、compatible、ready expert，When send，Then `remoteExpert.submit` call count=1，Local `handleSend`=0。

Evidence：`TEST-A-ROUTE-REMOTE-001`。

---

## A-ROUTE-LOCAL-001 — Local mode 在 Remote Provider unavailable 时仍正常

Given mode=local-chat、Remote availability unavailable，When send local prompt，Then existing Local handleSend=1，remote submit=0。

Evidence：`TEST-A-ROUTE-LOCAL-001`。

---

## A-NEG-ROUTE-FALLBACK-001 — Remote Gate failure 不回落 Local Hermes

Given mode=remote-expert、Gate unavailable，When send，Then blocked/error UI，remote submit=0，local handleSend=0。

Evidence：`TEST-A-NEG-ROUTE-FALLBACK-001`。

---

## A-TEST-ENTRY-001 — Chat Entry 测试使用真实 Remote Expert 组件

Oracle：测试模块未 mock `RemoteExpertContextControl`，且能够检测 gate unavailable 下 combobox/status DOM。

Evidence：test source scan + vitest pass。

---

## A-NEG-TEST-ENTRY-001 — 删除 Entry mount 后测试必须失败

Failure injection：测试构建中临时将 Entry condition 置 false 或通过 mutation test fixture 模拟。

Oracle：至少一个 Required UI test FAIL。

---

## A-EVID-G6-001 — G6 生成 commit-bound PASS Evidence

Given clean implementation commit，When 执行 G6，Then：

```text
overall=PASS
commitSha == git rev-parse HEAD
dirty=false
all Required Acceptance == PASS
exit=0
```

Evidence：`test-results/remote-expert-g6.json`。

---

## A-NEG-EVID-G6-001 — Dirty Worktree 不能 G6 PASS

Given git status 非空，When G6，Then overall=BLOCKED、error=`G6_CONSUMER_DIRTY`、exit!=0。

---

## A-NEG-EVID-G6-002 — Missing Acceptance 不能 G6 PASS

Given Required ID 无匹配 test，When G6，Then status=UNCOVERED/FAIL、overall=FAIL、exit!=0。

---

## A-G7-RUNNER-001 — 完整 Live Prerequisite 时 G7 实际运行

Given 所有 env 完整、consumer clean、contract compatible、expert ready，When `node scripts/remote-expert-g7.mjs`，Then runner 进入 live cases，不返回固定 blocker reason。

Oracle：至少 Case 1 被执行并有 operation/trace evidence。

---

## A-NEG-G7-RUNNER-001 — 缺 env 必须 BLOCKED

Oracle：`overall=BLOCKED`、`errorCode=G7_ENV_INCOMPLETE`、exit!=0。

---

## A-NEG-G7-RUNNER-002 — Dirty Consumer 必须 BLOCKED

Oracle：`overall=BLOCKED`、`errorCode=G7_CONSUMER_DIRTY`、exit!=0。

---

# 21. G7 Live Acceptance Matrix

以下 15 项全部 Required：

| ID | Scenario | Given / When | Machine Oracle |
|---|---|---|---|
| A-G7-LIVE-001 | Contract Discovery | real Backend | exact 8-field contract match |
| A-G7-LIVE-002 | Catalog | target agent_ref | item exists, status=ready, remoteTransport=true |
| A-G7-LIVE-003 | Initialize | public WSS | subprotocol exact + protocolVersion=1 |
| A-G7-LIVE-004 | Session New | new remote scratch | ACP session id non-empty; local session ref persisted |
| A-G7-LIVE-005 | Prompt Streaming | normal prompt | >=1 assistant delta + turn.end completed |
| A-G7-LIVE-006 | Transcript Projection | completed turn | local session classification=chat/remote-expert-acp and user+assistant rows exist |
| A-G7-LIVE-007 | Resume | disconnect after completed turn | same acpSessionId resumed; lastSeq non-decreasing |
| A-G7-LIVE-008 | Disconnect/Reconnect In-flight | controlled network/socket drop | reconnect/resume or explicit failed terminal; no silent session/new |
| A-G7-LIVE-009 | Attachment | controlled small file | attachment_ref accepted; remote prompt receives resource link; no local path leak |
| A-G7-LIVE-010 | Permission | controlled approval-required action | permission.requested → allow_once/reject_once roundtrip; no auto allow |
| A-G7-LIVE-011 | Cancel | long-running prompt | cancel reaches terminal cancelled/stopped semantics; no duplicate run |
| A-G7-LIVE-012 | Artifact | prompt generates artifact | ManagedFile provider=remote-expert-acp; preview/download bytes accessible through public resource path |
| A-G7-LIVE-013 | Session Close | active session | state=closed; later socket close does not persist disconnected over closed |
| A-G7-LIVE-014 | Security / Route Boundary | inspect traffic/evidence | no `/internal/*`, no direct agent/Hermes URL, no token in ACP payload/evidence |
| A-G7-LIVE-015 | Local Chat Isolation | make Remote Backend unavailable after remote case | Local Chat prompt still succeeds through existing Local Hermes path |

G7 runner MUST 输出每个 ID 的：

```text
status
oracle expected
oracle actual
operation id
trace id when applicable
evidence files
error code if failed
```

---

# 22. Acceptance Input / Edge-case Matrix

| Case | Gate | Catalog | Current Run | Selection | Confirm | Expected |
|---|---|---|---|---|---|---|
| 1 | compatible | ready | local scratch | expert A | N/A | same run remote scratch A |
| 2 | compatible | ready | local bound | expert A | yes | new remote scratch A |
| 3 | compatible | ready | local bound | expert A | no | 0 mutation |
| 4 | compatible | ready | remote scratch A | expert B | N/A | same run remote scratch B |
| 5 | compatible | ready | remote scratch A | local | N/A | same run local scratch |
| 6 | compatible | ready | remote bound A | expert B | yes | new remote scratch B |
| 7 | compatible | ready | remote bound A | local | yes | new local scratch |
| 8 | unavailable | N/A | local scratch | N/A | N/A | entry visible disabled, local chat usable |
| 9 | incompatible | N/A | local scratch | N/A | N/A | entry visible disabled, no catalog call |
| 10 | compatible | empty | local scratch | N/A | N/A | empty diagnostic, local chat usable |
| 11 | compatible | catalog error | local scratch | N/A | N/A | catalog error + retry |
| 12 | compatible | expert unavailable | local scratch | unavailable expert | N/A | option disabled, no submit |
| 13 | availability slow race | ready later | local scratch | N/A | retry | latest request wins |
| 14 | session stale scratch conflict | ready | remote bound A + scratch B | send | N/A | durable A wins |
| 15 | Remote backend down | N/A | local scratch | local | N/A | Local Hermes unaffected |

---

# 23. Negative Acceptance

Required negative cases：

```text
A-NEG-UI-ENTRY-001      Gate unavailable does not hide entry
A-NEG-UI-ENTRY-002      no entry in Skill/Knowledge Chat
A-NEG-STATE-AVAIL-001   stale async response cannot overwrite latest
A-NEG-CATALOG-GATE-001  incompatible gate → 0 catalog request
A-NEG-RUN-TRANSITION-001 bound run cannot mutate context in place
A-NEG-UI-SWITCH-001     cancel confirm → 0 mutation
A-NEG-UI-SWITCH-002     durable agent_ref wins over stale scratch
A-NEG-ROUTE-FALLBACK-001 no Local Hermes fallback
A-NEG-TEST-ENTRY-001    mutation removing entry makes test fail
A-NEG-EVID-G6-001       dirty consumer blocks G6
A-NEG-EVID-G6-002       uncovered AC fails G6
A-NEG-G7-RUNNER-001     missing env blocks G7
A-NEG-G7-RUNNER-002     dirty consumer blocks G7
A-NEG-SEC-CLOSURE-001   Renderer has no token
A-NEG-SEC-CLOSURE-002   no direct internal Agent URL
A-NEG-SEC-CLOSURE-003   UI visibility fix does not bypass contract gate
A-NEG-SEC-CLOSURE-004   catalog labels are text, not HTML injection
A-NEG-G7-LIVE-001       G7 cannot use uncontrolled destructive Expert
A-NEG-OBS-CLOSURE-001   evidence secret scan rejects token material
```

---

# 24. Failure Injection

| Injection Point | Operation | Expected Postcondition |
|---|---|---|
| before availability response | UI discovery | Entry visible checking/unavailable; Local Chat usable |
| stale availability response after retry | UI discovery | latest request result remains authoritative |
| before catalog request | catalog | if gate not compatible, request count remains 0 |
| catalog parse error | catalog | catalog ERROR; no remote submit |
| before run transition commit | selection | runs/activeRunId == T0 |
| user cancels confirm | selection | exact 0 mutation |
| remote submit validation fail | routing | no optimistic remote message, no local fallback |
| G6 after tests before evidence write | evidence | no final PASS evidence file for failed attempt |
| G6 secret scan fail | evidence | final evidence not written |
| G7 after session/new | live run | cleanup/close attempted; overall non-PASS if cleanup fails |
| G7 during attachment | live run | case FAIL; no false artifact PASS |
| G7 during permission | live run | pending request must be resolved/rejected or session cleanup recorded |
| G7 evidence secret scan | evidence | FAIL with REMOTE_EXPERT_EVIDENCE_SECRET_LEAK |

---

# 25. Evidence Contract

## 25.1 G6 Required Commands

在 `apps/work`：

```text
npm run typecheck
npx vitest run \
  src/main/remote-expert \
  src/renderer/src/modules/remote-expert \
  src/renderer/src/screens/Chat/Chat.remote-expert-hotfix.test.tsx \
  src/renderer/src/screens/Chat/Chat.remote-expert-entry.test.tsx \
  src/renderer/src/screens/Layout/chatRuns.test.ts \
  src/shared/remote-expert.test.ts \
  src/main/auth/auth-ipc.test.ts \
  tests/remote-expert \
  tests/ipc-handlers.test.ts
node scripts/remote-expert-g6.mjs
npx lat check
```

若实现选择不同 test filename，Plan MUST 在 Verification 中给出真实文件名，但 Requirement/Acceptance ID 不得丢失。

## 25.2 G6 PASS 条件

```text
typecheck exit = 0
vitest exit = 0
lat check exit = 0
all Required Acceptance covered
all Required Acceptance status = PASS
git dirty = false
Evidence commitSha = HEAD
```

## 25.3 G7 Required Command

```text
SMC_REMOTE_EXPERT_G7=1 \
SMC_REMOTE_EXPERT_G7_BACKEND_URL=<real backend> \
SMC_REMOTE_EXPERT_G7_TOKEN=<secret> \
SMC_REMOTE_EXPERT_G7_ORG_ID=<org> \
SMC_REMOTE_EXPERT_G7_USER_ID=<user> \
SMC_REMOTE_EXPERT_G7_AGENT_REF=<ready expert_slug> \
node scripts/remote-expert-g7.mjs
```

Windows PowerShell 实施计划 MUST 提供等价 `$env:` 命令；PRD 不把 secret 值写入文档。

## 25.4 Evidence Integrity

Evidence MUST 绑定：

```text
repo
branch
commit SHA
clean/dirty
test command
timestamp
Node version
npm version
Vitest version where applicable
Provider contract discovery identity for G7
```

---

# 26. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Primary Test/Evidence | Release Gate |
|---|---|---|---|---|
| REQ-UI-001 | INV-UI-001-01/02 | A-UI-ENTRY-001, A-NEG-UI-ENTRY-001/002 | Chat real-component integration | G6 REQUIRED |
| REQ-STATE-001 | INV-STATE-001-01/02 | A-STATE-AVAIL-001, A-NEG-STATE-AVAIL-001 | availability state tests | G6 REQUIRED |
| REQ-CATALOG-001 | INV-CATALOG-001-01/02 | A-CATALOG-GATE/EMPTY/READY, A-NEG-CATALOG-GATE | selector/catalog tests | G6 REQUIRED |
| REQ-STATE-002 | INV-STATE-002-01/02 | A-RUN-TRANSITION-001/002/003, A-NEG-RUN-TRANSITION-001 | chatRuns tests | G6 REQUIRED |
| REQ-UI-002 | INV-UI-002-01/02 | A-UI-SWITCH-001/002, A-NEG-UI-SWITCH-001/002 | Chat/Layout integration | G6 REQUIRED |
| REQ-ROUTE-001 | INV-ROUTE-001-01/02 | A-ROUTE-REMOTE-001, A-ROUTE-LOCAL-001, A-NEG-ROUTE-FALLBACK-001 | routing spies | G6 REQUIRED |
| REQ-TEST-001 | INV-TEST-001-01 | A-TEST-ENTRY-001, A-NEG-TEST-ENTRY-001 | source/test evidence | G6 REQUIRED |
| REQ-EVID-001 | INV-EVID-001-01 | A-EVID-G6-001, A-NEG-EVID-G6-001/002 | remote-expert-g6.json | G6 REQUIRED |
| REQ-G7-001 | INV-G7-001-01/02 | A-G7-RUNNER-001, A-NEG-G7-RUNNER-001/002 | remote-expert-g7.json | G7 REQUIRED |
| REQ-G7-002 | INV-G7-002-01/02 | A-G7-LIVE-001..015 | live traces + G7 JSON | G7 REQUIRED |
| REQ-OBS-001 | INV-OBS-001-01/02 | A-OBS-CLOSURE-001, A-NEG-OBS-CLOSURE-001 | sanitizer/evidence tests | G6+G7 REQUIRED |

任何 Requirement 中的 MUST 未被上表 Acceptance 覆盖：

```text
PRD_INVALID
PLAN BLOCKED
```

---

# 27. File / Symbol Change Inventory

Implementation Plan MUST 以当前 HEAD 重新确认，但目标 ownership 清单如下：

## 27.1 Expected Modify

```text
apps/work/src/renderer/src/screens/Chat/Chat.tsx
apps/work/src/renderer/src/screens/Layout/chatRuns.ts
apps/work/src/renderer/src/screens/Layout/Layout.tsx
apps/work/src/renderer/src/modules/remote-expert/RemoteExpertContextControl.tsx
apps/work/src/renderer/src/modules/remote-expert/RemoteExpertSelector.tsx
apps/work/src/shared/i18n/locales/en/chat.ts
apps/work/src/renderer/src/modules/remote-expert/RemoteExpertSelector.test.tsx
apps/work/src/renderer/src/screens/Chat/Chat.remote-expert-hotfix.test.tsx
apps/work/src/renderer/src/screens/Layout/chatRuns.test.ts
apps/work/scripts/remote-expert-g6.mjs
apps/work/scripts/remote-expert-g7.mjs
```

## 27.2 Expected Add

允许新增：

```text
apps/work/src/renderer/src/screens/Chat/Chat.remote-expert-entry.test.tsx
apps/work/src/renderer/src/modules/remote-expert/useRemoteExpertEntryState.ts
apps/work/tests/remote-expert/live/*
```

是否新增 hook 由 Plan 根据当前源码拆分决定；但不得改变本 PRD SOT 与状态语义。

## 27.3 Must Not Modify for this Closure unless SPEC conflict proves necessary

```text
NodeSkClaw provider repositories
apps/work/src/main/remote-expert/remote-acp-client.ts protocol semantics
apps/work/src/main/remote-expert/remote-expert-turn-service.ts execution semantics
contracts/remote-expert-frontend/v2.0.0/*
historical WORK-EXPERT-CONTRACT bytes
```

若 G7 暴露真实 Main execution bug，则必须单独登记 Requirement/Hotfix，不允许在“UI closure”Todo 中无追踪扩展 protocol semantics。

---

# 28. Plan Generation Contract

只有本 PRD：

```text
status = APPROVED_FOR_PLAN
```

时允许生成 `.plan.md`。

Plan MUST：

```text
1. 重新读取 work/prd-v6.3 HEAD。
2. diff baseline..HEAD。
3. 逐项确认 §27 ownership。
4. 每个 Todo 映射 requirement_refs + acceptance_refs。
5. implemented 与 verified 分开。
6. G6 Evidence 在 implementation commit 后重新执行。
7. G7 没有真实环境时状态只能 blocked，不得 verified。
```

Plan Todo schema：

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

## 28.1 Semantic Gap Rule

若 Plan 无法唯一确定：

```text
Original Chat eligibility
Gate unavailable UI behavior
selection carry-over
scratch vs bound transition
Local Chat fallback behavior
G6 evidence oracle
G7 Golden Consumer path
```

则：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK affected Todo
MUST NOT 自行改语义
```

---

# 29. Release Gate

## G6-CLOSURE — SMC Consumer Closure

Required：

```text
REQ-UI-001 PASS
REQ-STATE-001 PASS
REQ-CATALOG-001 PASS
REQ-STATE-002 PASS
REQ-UI-002 PASS
REQ-ROUTE-001 PASS
REQ-TEST-001 PASS
REQ-EVID-001 PASS
REQ-OBS-001 G6 portion PASS
Local Chat regression PASS
Skill Run regression PASS
```

判定：

```text
任何 Required Acceptance != PASS
→ G6-CLOSURE FAIL
→ process exit != 0
```

## G7 — Production Golden Consumer

Required：

```text
A-G7-RUNNER-001 PASS
A-G7-LIVE-001..015 PASS
REQ-OBS-001 G7 portion PASS
consumer clean
consumer SHA bound
Provider contract exact match
```

判定：

```text
SKIPPED != PASS
BLOCKED != PASS
FAIL != PASS
```

## Production Release

```text
G6-CLOSURE == PASS
AND
G7 == PASS
```

才允许标记：

```text
Remote ACP v2 SMC Golden Consumer = VERIFIED
```

---

# 30. Definition of Done

```text
[ ] Original Chat 无论 Provider 是否可用都能看到 Remote Expert Entry
[ ] Gate unavailable/incompatible 时 Entry 可诊断且 remote selection disabled
[ ] Gate incompatible 时 listCatalog call count = 0
[ ] Compatible 后 catalog 正常加载并区分 ready/unavailable/empty/error
[ ] ChatRun 有一等 remote-expert transition owner
[ ] non-empty Local Chat → Remote Expert 确认后，新 Chat 携带目标 agent_ref
[ ] session-bound Remote Expert context 不原地改变
[ ] remote-expert mode failure 不回退 Local Hermes
[ ] Remote Provider 故障不影响 Local Chat
[ ] Chat integration acceptance 使用真实 Remote Expert UI 组件
[ ] G6 Required Acceptance 每项都有 Test + Oracle + Evidence
[ ] G6 Evidence 绑定 clean commit SHA
[ ] G7 runner prerequisites 完整时不再固定 BLOCKED
[ ] G7 使用 smc-copilot production consumer path，不使用 synthetic client 代替
[ ] G7 15 个 live case 全 PASS
[ ] G7 Evidence 不含 secret
[ ] Contract v2.0.0 pin 未修改
[ ] nodeskclaw-acp.exe 未恢复
[ ] WORK-EXPERT-CONTRACT / expert.start / HermesTask Remote Expert production path 未恢复
[ ] 无 SPEC_SEMANTIC_GAP
```

---

# 31. PRD Quality Gate

## Architecture

```text
[x] Goal 唯一明确
[x] Scope / Non-goal 完整
[x] Owner 不重叠
[x] System Boundary 明确
```

## State

```text
[x] Availability / Catalog / Selection / Session / Evidence 均有 SOT
[x] Scratch 与 Bound 状态分离
[x] State transition 明确
```

## Semantics

```text
[x] Entry visibility 与 callability 分离
[x] Original Chat eligibility 明确
[x] selection carry-over 明确
[x] conflict 行为明确
[x] durable agent_ref authority 明确
```

## Side Effects

```text
[x] UI diagnostics 为 0 business mutation
[x] selection mutation scope 明确
[x] G7 mutation 限定于 designated test resources
```

## Failure

```text
[x] discovery/catalog/transition/evidence/live failures 有 error semantics
[x] cancel confirm = 0 mutation
[x] evidence failure 不产生 false PASS artifact
```

## Acceptance

```text
[x] 每个 MUST 有 AC
[x] MUST NOT 有 Negative AC
[x] 高风险 selection/gate/live 有 edge-case matrix
[x] Oracle 可机器判断
```

## Evidence

```text
[x] G6/G7 Evidence schema 明确
[x] Evidence 绑定 repo commit
[x] BLOCKED/SKIPPED 不算 PASS
[x] Release Gate 与 process exit 一致
```

## Plan Readiness

```text
[x] 无 TBD / 待确认 / 视情况
[x] Traceability 完整
[x] status = APPROVED_FOR_PLAN
```

---

# 32. 最终实施总纲

```text
不要再改 Remote ACP v2 架构。

本轮只做 Consumer Closure：

1. Remote Expert Entry 永久可发现；Provider 状态只决定可调用性，不决定入口是否存在。
2. availability 不再压缩成一个 boolean，错误原因进入一等 UI state。
3. Catalog 只在 Contract COMPATIBLE 后加载。
4. Remote Expert selection 上移到 ChatRun transition，解决新 Chat 丢 agent_ref。
5. Bound session context immutable，切换 Expert 必须新建 scratch。
6. Remote failure fail-closed，但 Local Hermes Chat 独立可用。
7. G6 用 commit-bound Evidence 证明 Consumer 已完成。
8. G7 runner 真正执行 real smc-copilot → backend → agent → Remote Hermes。
9. G6 + G7 全 PASS 后，才把 Remote ACP v2 SMC Golden Consumer 标记为 VERIFIED。
```
