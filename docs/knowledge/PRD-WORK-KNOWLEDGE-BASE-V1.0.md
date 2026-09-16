---
title: "WORK Knowledge Base 页面真实 CRUD + Detail + FileJob 集成 PRD"
prd_id: "PRD-WORK-KNOWLEDGE-BASE-V1"
version: "1.0.0"
status: "REVIEW"
implementation_decision: "2026-09-16 treat_approved — implement despite REVIEW per product owner; do not block code on APPROVED_FOR_PLAN."
product: "smc-copilot / apps/work / Knowledge"
repository: "https://github.com/loudon84/smc-copilot"
branch: "work/prd-v5.1"
baseline_commit: "990fb605f740223bbfbdabca7e04dd51cb28e145"
owner: "Work Desktop / Knowledge 模块"
reviewers:
  - "产品负责人"
  - "Work Desktop 架构负责人"
  - "Knowledge 前端负责人"
  - "Electron/Main 负责人"
created_at: "2026-09-16"
updated_at: "2026-09-16"
target_release: "Knowledge Base Integration v1.0"
change_type:
  - "BROWNFIELD_CHANGE"
  - "ARCHITECTURE_CHANGE"
  - "INTEGRATION"
golden_consumer:
  repository: "loudon84/smc-copilot"
  branch: "work/prd-v5.1"
  baseline_commit: "990fb605f740223bbfbdabca7e04dd51cb28e145"
related_docs:
  - "需求PRD工程模板.md / template_version=1.0"
  - "nodeskclaw-knowledge/contracts/frontend/v1.0.0"
supersedes: null
---

# WORK Knowledge Base 页面真实 CRUD + Detail + FileJob 集成 PRD

> 本文是 Engineering Contract PRD。  
> 所有 `MUST / MUST NOT` 均映射到 Acceptance、Test 与 Evidence。  
> 文档状态为 `REVIEW`；在人工评审通过并将状态更新为 `APPROVED_FOR_PLAN` 前，MUST NOT 生成实施 `.plan.md`。

---

# 0. 文档基线与规范

## 0.1 PRD 规范基线

本文 MUST 遵循《工程级需求 PRD 严格模板》v1.0 的以下原则：

```text
Requirement → Code → Test → Evidence
```

开发或 Plan Agent 若无法从本文唯一确定状态事实源、默认行为、ownership、side effect、failure、rollback、conflict 或 acceptance oracle，MUST：

```text
report SPEC_SEMANTIC_GAP
BLOCK plan generation
MUST NOT 自行补全语义
```

## 0.2 Brownfield 基线

本需求以以下 Work Desktop 代码基线为 Golden Consumer：

```text
repo:   loudon84/smc-copilot
branch: work/prd-v5.1
commit: 990fb605f740223bbfbdabca7e04dd51cb28e145
```

Plan 生成前 MUST 验证该 commit 可解析。若目标实现基线已前移且相关 Knowledge 文件发生变化，MUST 先执行 grounding；不得直接使用本 PRD 对已漂移实现生成计划。

---

# 1. 一句话目标

让 **Work Desktop 的 Knowledge 用户** 在已登录且本机 `nodeskclaw-knowledge` 服务可访问的前置条件下，通过符合 Work UI Layout 的 **Bases → Base Detail → Uploads** 操作链，完成真实 Knowledge Base 的查询、创建、修改、删除、文件上传与异步摄取状态查看，同时保证 **业务数据以 4580 Knowledge API 为事实源、文件上传以 Main-owned FileJob 为唯一运行态事实源、Renderer 不持有 Bearer Token/绝对路径且不创建第二套 Upload Job 状态系统**。

---

# 2. 背景与问题定义

## 2.1 Current State

### CS-001 — Bases 页面同时承担 List 与 Detail

当前：

```text
apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage.tsx
```

同时承担：

```text
list
detail
search/filter
create modal
update
delete
documents placeholder
members/runtime placeholder
route branch
```

Detail 通过：

```text
params.knowledgeBaseId
```

在同一组件内条件渲染。

### CS-002 — 当前真实 provider 不允许 CRUD mutation

当前 `useKnowledgeFacade()`：

```text
requested provider = auto | mock | office
effective provider = mock | office
mutationsEnabled = effectiveProvider === "mock"
```

因此 provider/office 模式下 Create / Update / Delete 被前端硬禁用。

### CS-003 — 当前 Base CRUD 使用通用 Entity Snapshot

当前 Base 页面基于：

```text
KnowledgeFacadeEntitySnapshot
```

主要只能稳定得到：

```text
id
title
permission
partition
dataMode
```

但真实 Knowledge Base 合同包含：

```text
name
description
status
visibility
tags
embedding_model
chunk_method
acl_version
build_version
...
```

现有通用 Snapshot 无法完整支持真实 Settings / Status / Detail。

### CS-004 — 当前 Delete 不是远端 DELETE

当前 Detail 删除动作通过：

```text
mutateEntity({
  kind: "base",
  entityId,
  patch: { deleted: true }
})
```

并在 Renderer 内维护 `removedIds`。

该行为不是 Knowledge API 的真实删除事实源。

### CS-005 — 当前 Uploads 已存在 Main-owned Job Contract

当前共享合同：

```text
apps/work/src/shared/knowledge/knowledge-job-ipc.ts
```

定义了：

```text
KnowledgeJobSnapshot
KnowledgeJobStatus
createDraft
getSnapshot
listSnapshots
cancel
retry
onSnapshotChanged
```

并明确：

```text
Renderer ↔ Main
Never carry tokens, absolute paths, or provider raw errors.
```

`KnowledgeJobCreateDraftInput` 已包含：

```text
knowledgeBaseId?: string
```

### CS-006 — File Platform 已支持 Knowledge Job 绑定

当前：

```text
FileImportContext
```

支持：

```text
knowledgeJobId?: string
```

并规定：

```text
Exactly one of sessionId or knowledgeJobId must be set.
Main resolves the Job before any File Platform write.
```

`useFilePicker()` 在传入 `context` 时使用：

```text
window.hermesAPI.files.pickFiles
```

由 Main staging/hash；Renderer 无需读取文件字节。

### CS-007 — 当前 Uploads 在 provider 模式仍被 UI 禁用

当前 `KnowledgeUploadsPage`：

```text
pickerEnabled =
  probe.mode?.dataMode === "mock"
  && probe.mutationsEnabled
```

同时当前 `FilePickerButton` 未传 Knowledge `context`，其 `onPicked` 结果未绑定真实 provider ingestion 执行链。

### CS-008 — 当前 Modal Primitive 已使用 Portal

`AppModal` 已使用：

```text
Dialog.Portal
Dialog.Overlay
Dialog.Content
motion.div
```

因此当前 Create Modal 的显示失真不能通过“再增加 Portal”解决。本需求要求将共享 Modal 形成明确的 viewport/panel 布局语义，并对已有 Modal consumer 做回归。

### CS-009 — 当前 Knowledge Route 已支持 Base ID

现有 route contract：

```ts
type KnowledgeRouteParams = {
  knowledgeBaseId?: string
  knowledgeSetId?: string
  documentId?: string
  sessionId?: string
}
```

本需求不新增顶级 Knowledge `page` 枚举；Base Detail 继续属于：

```text
page = "bases"
params.knowledgeBaseId = <KnowledgeBase.id>
```

Base 专属 Upload 继续复用：

```text
page = "uploads"
params.knowledgeBaseId = <KnowledgeBase.id>
```

### CS-010 — NodeSKClaw frontend contract 的真实路径并非全部 `/v2`

冻结合同 `knowledge-frontend-contract v1.0.0` 的 API strategy 是：

```text
/api/v2
+
selected /api/v1 compatibility endpoints
```

Base CRUD：

```text
GET   /api/v2/knowledge-bases
POST  /api/v2/knowledge-bases
GET   /api/v2/knowledge-bases/{kb_id}
PATCH /api/v2/knowledge-bases/{kb_id}

DELETE /api/v1/knowledge-bases/{kb_id}
```

文件上传与 ingestion job：

```text
POST /api/v1/knowledge-bases/{kb_id}/files

GET  /api/v1/ingestion-jobs/{job_id}
POST /api/v1/ingestion-jobs/{job_id}/retry
POST /api/v1/ingestion-jobs/{job_id}/cancel
```

因此本文所称“4580 `/v2` API”在工程实现上 MUST 解释为：

```text
4580 Knowledge frontend contract v1.0.0
```

而不是强制把所有请求重写为 `/api/v2`。

## 2.2 Problem

当前存在以下可验证问题：

```text
P-001  Base 页面职责集中，Page 层直接持有业务 mutation orchestration。
P-002  provider 模式 mutation 被 mock-only gate 阻断，无法完成真实 CRUD。
P-003  通用 Entity Snapshot 丢失真实 Base 合同字段。
P-004  Delete 使用本地 removedIds 模拟，不代表服务端真实状态。
P-005  Create Modal 的公共 primitive 缺少稳定 panel layout 语义。
P-006  Detail 页面信息结构、Settings、Danger Zone 与 Work UI 不一致。
P-007  Members / Runtime 在没有本期真实业务能力的情况下仍暴露为一级 tab。
P-008  Base Upload 没有完成 Managed File → Knowledge Job → remote ingestion 的真实闭环。
P-009  Uploads 当前在 provider 模式被禁用。
P-010  如果新增 Base 上传独立状态源，将导致 Global Uploads 与 Base Upload 进度不一致。
```

## 2.3 Impact

```text
业务影响：
真实 Knowledge Base 无法在 Work 内完成端到端管理与文件摄取。

工程影响：
Page、Facade、Mock、Job 的责任边界混合，后续 Sets/Documents/Mail 等模块会重复该模式。

安全影响：
若绕过现有 Main/File Platform 直接在 Renderer 上传，可能泄露 token、路径或文件字节边界。

运维影响：
服务不可用与 Mock fallback 若混淆，用户无法判断当前数据是否来自真实 Knowledge 服务。

AI Coding 影响：
现有 generic mutate + page-local state 允许多种合理实现解释，无法稳定生成低歧义 Plan。
```

---

# 3. Scope / Non-goal

## 3.1 In Scope

```text
SCOPE-001  重构 KnowledgeBasesPage 为 Work-native List Page。
SCOPE-002  抽取 KnowledgeBaseDetailPage，并保留现有 route-scope 语义。
SCOPE-003  将 Base 操作组件统一迁移到 screens/Knowledge/features/bases/*。
SCOPE-004  将 Base 上传交互统一迁移到 screens/Knowledge/features/file-job/*。
SCOPE-005  通过 typed facade/provider 对接 Knowledge frontend contract v1.0.0 的真实 Base CRUD。
SCOPE-006  对接 Base SourceFile 列表，作为 Detail/Documents 真实数据。
SCOPE-007  修正 Create Modal viewport/panel 行为及 Create 表单。
SCOPE-008  Settings 支持 name / description / visibility 的真实 PATCH。
SCOPE-009  Delete 使用真实 compatibility DELETE，并提供 Danger Zone + Confirm。
SCOPE-010  Base Upload 复用 Managed File Platform + existing Knowledge FileJob IPC。
SCOPE-011  Global Uploads 与 Base Upload 读取同一个 Main Job Snapshot source。
SCOPE-012  provider unavailable、401/403、404、409、5xx、network ambiguity 使用确定性 failure semantics。
SCOPE-013  添加 Unit / Component / IPC / Integration / Golden Consumer Evidence。
```

## 3.2 Out of Scope

```text
NON-GOAL-001  本 Release MUST NOT 重构 Knowledge Sets 的真实 CRUD。
NON-GOAL-002  本 Release MUST NOT 重构 Knowledge Chat / Retrieval。
NON-GOAL-003  本 Release MUST NOT 实现 Members / ACL 管理 UI。
NON-GOAL-004  本 Release MUST NOT 实现 Runtime tab。
NON-GOAL-005  本 Release MUST NOT 直接调用 RAGFlow。
NON-GOAL-006  本 Release MUST NOT 新增 RAGFlow API Key 到 Renderer。
NON-GOAL-007  本 Release MUST NOT 新建第二套 Knowledge Upload Job Store。
NON-GOAL-008  本 Release MUST NOT 使用 optimistic mutation 作为 Base authority。
NON-GOAL-009  本 Release MUST NOT 改变 nodeskclaw frontend contract v1.0.0 的 HTTP schema。
NON-GOAL-010  本 Release MUST NOT 将 compatibility `/api/v1` 路径擅自升级为 `/api/v2`。
NON-GOAL-011  本 Release MUST NOT 在 Base Upload v1.0 中启用多文件单 Job；一个 FileJob 只绑定一个 SourceFile。
NON-GOAL-012  本 Release MUST NOT 为 Base Upload 实现 drag-drop；入口为 managed file picker。
```

---

# 4. Architecture Boundary

## 4.1 Target Architecture

```text
Work Desktop
    │
    ▼
KnowledgePageChrome / KnowledgePages
    │
    ├──────────────────────────────────────┐
    │                                      │
    ▼                                      ▼
KnowledgeBasesPage                KnowledgeBaseDetailPage
    │                                      │
    └──────────────────┬───────────────────┘
                       ▼
         screens/Knowledge/features
              │                  │
              ▼                  ▼
          bases/*             file-job/*
              │                  │
              ▼                  │
       useKnowledgeFacade        │
              │                  │
              ▼                  ▼
       Knowledge Facade IPC   Knowledge Job IPC
              │                  │
              ▼                  ▼
       HTTP Knowledge         Electron Job Runtime
          Provider                │
              │                   ├─ Managed File Platform
              │                   └─ Ingestion Job Reconcile
              ▼                  │
 http://127.0.0.1:4580           ▼
 /api/v2 + stable compat     http://127.0.0.1:4580
 /api/v1                   /api/v1 files + ingestion-jobs
```

## 4.2 Layer Ownership

| Domain | Owner | Input | Output | MUST NOT 负责 |
|---|---|---|---|---|
| Page composition | `screens/Knowledge/pages` | route + feature state | layout | raw HTTP、IPC orchestration |
| Base use case | `features/bases/*` | typed facade | UI state/actions | backend URL、token |
| File Job UI | `features/file-job/*` | Job Snapshot + managed picker result | upload interaction | invent progress、保存 token |
| Facade hook | `useKnowledgeFacade` | typed calls | typed domain result | page layout |
| Facade transport | Electron Preload/Main IPC | sanitized DTO | typed response/error | React state |
| HTTP Provider | Main | token + contract DTO | Knowledge API result | UI fallback |
| File Platform | Main | file picker/import context | ManagedFile | Knowledge business state |
| FileJob Runtime | Main | Job + ManagedFile | Job Snapshot | React state |
| Knowledge Service | `nodeskclaw-knowledge:4580` | authenticated API request | Base/SourceFile/IngestionJob | Work layout |

---

# 5. Terminology / Domain Model

| Term | 唯一定义 |
|---|---|
| Knowledge Base | NodeSKClaw frontend contract 中以 `KnowledgeBase.id` 为 public identity 的知识库资源 |
| Base List | `page="bases"` 且不存在 `params.knowledgeBaseId` 时的列表页面 |
| Base Detail | `page="bases"` 且存在 `params.knowledgeBaseId` 时的详情页面 |
| Base Upload | `page="uploads"` 且存在 `params.knowledgeBaseId` 时，以该 Base 为固定目标的上传视图 |
| Global Uploads | `page="uploads"` 且不存在 `params.knowledgeBaseId` 时显示当前 partition 的全部 Knowledge Job |
| Typed Base Facade | 基于 `KnowledgeBase / KnowledgeBaseCreate / KnowledgeBaseUpdate / PageData` 的 Base API，不使用 generic `patch.deleted` 语义 |
| Provider Mode | Work 使用真实 Knowledge HTTP Provider 的运行模式 |
| Mock Mode | 显式启用的 synthetic/mock 数据模式 |
| Managed File | Work File Platform 在 Main 中管理、Renderer-safe view 不包含绝对路径的文件对象 |
| FileJob | Work Main-owned Knowledge 异步上传/摄取任务 |
| Remote IngestionJob | NodeSKClaw `/api/v1/ingestion-jobs/{id}` 返回的服务端摄取任务 |
| Server-authoritative | 业务结果以 Knowledge Service GET/response 为事实，不以 Renderer 本地猜测为事实 |
| Terminal Success | remote ingestion `status=active` |
| Terminal Failure | remote ingestion `status=failed|cancelled` |
| Uncertain Mutation | 请求已发送但因 timeout/connection reset 无法确定服务端是否提交 |
| Explicit Mock | 用户/测试配置明确选择 mock；服务错误不得触发 mock |
| Verified | 对应 Acceptance 已产生 Evidence；仅代码存在不等于 Verified |

---

# 6. System Context

## 6.1 Context Diagram

```text
User
 ↓
Work Desktop Renderer
 ↓
Knowledge Page / Features
 ↓
Preload IPC
 ↓
Electron Main
 ├── Authenticated HTTP Knowledge Provider ──> nodeskclaw-knowledge:4580
 ├── Knowledge FileJob Runtime ──────────────> nodeskclaw-knowledge:4580
 └── Managed File Platform ─────────────────> local managed storage
```

## 6.2 Boundary

```text
Inside boundary:
- apps/work Knowledge pages/features
- shared knowledge contracts/facade IPC
- Main Knowledge provider
- Main FileJob runtime integration
- shared AppModal behavior required by Knowledge modal

Outside boundary:
- nodeskclaw-knowledge implementation
- RAGFlow implementation
- Backend login implementation itself

External dependency:
- NodeSKClaw Knowledge frontend contract v1.0.0
- Work existing authenticated session
- Work File Platform

Trusted input:
- Main-owned authenticated session
- contract-validated API response
- Main-created ManagedFileView / KnowledgeJobSnapshot

Untrusted input:
- user-entered name/description
- remote HTTP body before schema validation
- file name / mime / file bytes
- route params
```

---

# 7. Authoritative State / Source of Truth

| State | Class | Authoritative? | Writer | Reader | 自动覆盖 |
|---|---|---:|---|---|---:|
| Knowledge Base persisted state | OBSERVED_STATE | YES | Knowledge Service | Main Provider / Renderer via facade | YES，使用服务端结果 |
| SourceFile persisted state | OBSERVED_STATE | YES | Knowledge Service | Base Detail | YES |
| Remote IngestionJob | OBSERVED_STATE | YES | Knowledge Service | FileJob Runtime | YES |
| Work KnowledgeJob internal record | RUNTIME_STATE | YES for local job lifecycle | Main FileJob Runtime | Main/Preload | YES by Main only |
| Renderer KnowledgeJobSnapshot | RUNTIME_STATE | NO，projection only | Main | Renderer | YES |
| Base form draft | DESIRED_STATE | NO | Renderer user | Renderer | NO |
| Base list/detail cache | RESOLVED_STATE | NO | facade result | Renderer | YES by refetch |
| Knowledge route scope | RUNTIME_STATE | YES for current UI navigation | Knowledge route owner | Knowledge pages | YES by route action |
| Bearer token | RUNTIME_STATE | YES for auth credential | existing Work auth/session owner | Main provider | MUST NOT expose to UI |
| ManagedFile metadata/storage | OBSERVED_STATE | YES for local managed file | File Platform Main | FileJob Runtime | Main only |
| Test/Evidence record | EVIDENCE_STATE | YES for Release Gate | test runner | Review/CI | append/replace by test run |

## 7.1 Authority Rules

```text
AUTH-001  Renderer MUST NOT mark CRUD success before provider success is known.
AUTH-002  Renderer MUST NOT synthesize Job progress.
AUTH-003  Main MUST NOT mark local Job completed until remote IngestionJob.status == "active".
AUTH-004  Mock data MUST NOT become authority in provider mode.
AUTH-005  Route state MUST NOT be inferred from a local component-only boolean when route params already encode the state.
```

---

# 8. State Machines

## 8.1 Base List UI

```text
IDLE
  -> LOADING
      -> READY
      -> EMPTY
      -> UNAVAILABLE
      -> ERROR
```

Recovery:

```text
ERROR --retry--> LOADING
UNAVAILABLE --retry/provider restored--> LOADING
```

## 8.2 Create Modal

```text
CLOSED
  -> EDITING
  -> SUBMITTING
      -> CLOSED          on confirmed success
      -> EDITING_ERROR   on deterministic failure
      -> RECONCILING     on uncertain network outcome
          -> CLOSED      if refetch finds created resource
          -> EDITING_ERROR if reconciliation proves not created
```

`SUBMITTING` MUST disable duplicate submit.

## 8.3 Base Detail

```text
LOADING
  -> READY
  -> NOT_FOUND
  -> UNAVAILABLE
  -> ERROR
```

Base business status is separately rendered from NodeSKClaw:

```text
provisioning
active
updating
degraded
error
deleting
```

UI mutation rules:

| Base status | Read | Settings Save | Upload | Delete |
|---|---:|---:|---:|---:|
| provisioning | YES | NO | NO | NO |
| active | YES | YES | YES | YES |
| updating | YES | NO | NO | NO |
| degraded | YES | YES | YES | YES |
| error | YES | YES | NO | YES |
| deleting | YES | NO | NO | NO |

## 8.4 Local FileJob State

现有 local statuses：

```text
draft
queued
uploading
processing
completed
interrupted
failed
cancelled
blocked_provider_unavailable
```

合法主路径：

```text
draft
  -> queued
  -> uploading
  -> processing
  -> completed
```

异常路径：

```text
draft -> cancelled
queued|uploading|processing -> failed
queued|uploading|processing -> interrupted
queued|uploading|processing -> blocked_provider_unavailable
queued|uploading|processing -> cancelled
```

Retry：

```text
failed|interrupted|blocked_provider_unavailable
  -> queued
```

`completed` 与 `cancelled` MUST NOT 被 retry。

## 8.5 Remote → Local Job Status Mapping

| Remote IngestionJob.status | Local KnowledgeJob.status |
|---|---|
| pending | queued |
| uploading | uploading |
| upload_unknown | interrupted |
| ragflow_uploaded | processing |
| metadata_synced | processing |
| parse_dispatched | processing |
| parsing | processing |
| validating | processing |
| active | completed |
| failed | failed |
| cancelled | cancelled |

Local `completed` 的唯一 remote oracle：

```text
remote.status == "active"
```

---

# 9. Data / Schema Contract

## 9.1 External Contract Identity

```text
repo:
  loudon84/nodeskclaw

contract:
  nodeskclaw-knowledge/contracts/frontend/v1.0.0

tag:
  knowledge-frontend-contract-v1.0.0

annotated_tag_object:
  087b8c48d1b977c00ee20a39d0e1438d74338a95

tag_target_commit:
  f11e7cbe74cee767cab7a0cbd65baf98c2f44018
```

关键 checksum：

```text
FRONTEND-INTEGRATION.md
b72580badeacb4ebf92504378ddf880ca7812cfb70b763c5e515b9e7d09354bc

openapi.frontend.yaml
a005a0aa31fc8855e9ca58c769497adffd1b169859543ee580679411fc82d537

typescript/knowledge-contract.ts
0c8d61b0e26419a5eae11ae4f8765aff55d2c667dce07bd5373ea74de9509a4f
```

Consumer Lock MUST 使用：

```text
tag name + tag target commit + SHA256SUMS
```

## 9.2 KnowledgeBase

Schema authority：

```text
urn:nodeskclaw:knowledge:frontend:v1:knowledge-base
contract version: 1.0.0
```

本需求使用字段：

| Field | Type | Required | Authority | UI Meaning |
|---|---|---:|---|---|
| id | string | YES | service | Base public identity |
| org_id | string | YES | service | organization identity，不编辑 |
| name | string | YES | service | 标题 |
| description | string/null | NO | service | 描述 |
| status | enum | YES | service | 生命周期与 mutation gate |
| visibility | private/department/organization | YES | service | 可见范围 |
| tags | string[]/null | NO | service | 本 Release 只读保留 |
| owner_member_id | string | YES | service | owner，不编辑 |
| acl_version | number | YES | service | ACL revision，不编辑 |
| embedding_model | string | YES | service | 本 Release 不编辑 |
| chunk_method | string | YES | service | 本 Release 不编辑 |
| build_version | number | YES | service | 本 Release 不编辑 |

## 9.3 KnowledgeBaseCreate

```text
additionalProperties = false
required = ["name"]
name.minLength = 1
name.maxLength = 128
visibility ∈ {private, department, organization}
```

Work Create Form contract：

| Field | Required | Work default | Submit Mapping |
|---|---:|---|---|
| name | YES | empty | trim 后 1..128 |
| description | NO | empty | empty -> null |
| visibility | YES in UI | organization | always send |
| embedding_model | NO | not rendered | MUST omit |
| chunk_method | NO | not rendered | MUST omit |
| parser_config | NO | not rendered | MUST omit |
| tags | NO | not rendered | MUST omit |

## 9.4 KnowledgeBaseUpdate

本 Release Settings 允许：

```text
name
description
visibility
```

MUST NOT 从 UI PATCH：

```text
embedding_model
chunk_method
parser_config
tags
```

未修改字段 MUST NOT 因 form serialization 被重置。

## 9.5 SourceFile

Detail/Documents 至少渲染：

```text
id
file_name
status
parse_status
version_no
chunk_count
last_error
```

`active_version_id` 是文档版本 authority。

## 9.6 Knowledge Job Renderer Snapshot

Renderer contract MUST 继续保持 sanitized：

```text
jobId
knowledgeBaseId
status
attempt
partition
dataMode
synthetic
progress
fileSummary
errorCode
updatedAt
```

MUST NOT 增加：

```text
Bearer token
absolute originalPath
absolute managedPath
RAGFlow key
raw provider stacktrace
```

## 9.7 Main-only Job Runtime Record

Main 内部持久记录 MUST 能支持 retry/reconcile，至少包含：

```text
jobId
knowledgeBaseId
managedFileId
remoteSourceFileId?
remoteIngestionJobId?
status
attempt
progress
lastErrorCode?
createdAt
updatedAt
partition
```

该 record MUST NOT 直接整体暴露到 Renderer。

## 9.8 Normalized Facade Error

```ts
type KnowledgeFacadeError = {
  code: string
  httpStatus?: number
  messageKey?: string
  retryable: boolean
  operationId: string
  details?: Record<string, unknown>
}
```

Renderer MUST 基于：

```text
httpStatus
messageKey
details
```

做行为分支；MUST NOT 基于服务端本地化 `message` 字符串分支。

---

# 10. Requirements

## REQ-ARCH-001 — Page / Feature / Transport 分层

### Goal

把页面编排、Knowledge 业务 use case、IPC/HTTP transport 与 FileJob runtime 分离，形成可复用的 Work 模块结构。

### Normative Requirement

```text
MUST 将 Base 操作功能块放入 screens/Knowledge/features/bases/*。
MUST 将 Base 文件上传交互放入 screens/Knowledge/features/file-job/*。
MUST 将 KnowledgeBasesPage 与 KnowledgeBaseDetailPage 限制为 route/page composition。
MUST NOT 在 pages/* 或 features/* 中出现 127.0.0.1:4580 literal。
MUST NOT 在 pages/* 中直接调用 window.hermesAPI 的 Knowledge mutation。
MUST NOT 在 features/bases/* 中直接发 raw HTTP request。
```

目标目录：

```text
screens/Knowledge/
├── pages/
│   ├── KnowledgeBasesPage.tsx
│   ├── KnowledgeBaseDetailPage.tsx
│   └── KnowledgeUploadsPage.tsx
└── features/
    ├── bases/
    │   ├── list/
    │   ├── create/
    │   ├── detail/
    │   ├── edit/
    │   └── delete/
    └── file-job/
```

### Inputs

```text
existing Knowledge pages
existing route scope
existing useKnowledgeFacade
existing knowledge-job IPC
```

### Preconditions

```text
PRE-ARCH-001 baseline commit 可 checkout。
PRE-ARCH-002 Knowledge host 已能进入 bases/uploads page。
```

### Authoritative State

```text
SOT: 本 PRD Architecture Boundary
Observed: source tree
Derived: static architecture checks
```

### State Transition

```text
Before: page-owned CRUD/file-job orchestration
Event: refactor
After: page composition -> feature -> facade/job transport
```

### Allowed Side Effects

```text
ALLOW:
- Knowledge 页面/feature 文件重构
- shared Knowledge facade contract 扩展
- Main/Preload Knowledge transport 扩展
- AppModal shared primitive 的兼容性修复
```

### Forbidden Side Effects

```text
DENY:
- 改动 NodeSKClaw backend schema
- 为 Knowledge 创建第二套 HTTP client 于 Renderer
- 复制一套 FileJob store
```

### Ownership Scope

```text
SECTION + FILE
```

### Idempotency

```text
first run: 形成目标目录和依赖方向
second run: static dependency graph 不新增额外层
```

### Failure Semantics

```text
F-ARCH-001
trigger: page/features 检测到 raw 4580 URL 或重复 FileJob store
expected state: build/review blocked
error code: ARCH_BOUNDARY_VIOLATION
rollback: code change不进入 release
retryable: YES
```

### Postconditions

```text
POST-ARCH-001 Page 不持有 raw transport。
POST-ARCH-002 Base 与 FileJob feature 有唯一 owner。
```

### Invariants

```text
INV-ARCH-001 Renderer business page 不拥有 Bearer token。
INV-ARCH-002 FileJob Runtime 始终属于 Main。
```

### Acceptance

```text
A-ARCH-001
A-ARCH-002
```

### Evidence

```text
required test: dependency/static grep test
required artifact: architecture evidence JSON
required runtime output: N/A
```

---

## REQ-API-001 — Typed Base Facade + Real Knowledge Provider

### Goal

让 Work Base UI 以真实 frontend contract v1.0.0 完成 server-authoritative CRUD。

### Normative Requirement

`useKnowledgeFacade` 的 Base consumer MUST 获得 typed API：

```ts
listBases(input): Promise<PageData<KnowledgeBase>>
getBase(id): Promise<KnowledgeBase | null>
createBase(input: KnowledgeBaseCreate): Promise<KnowledgeBase>
updateBase(id, input: KnowledgeBaseUpdate): Promise<KnowledgeBase>
deleteBase(id): Promise<void>
listBaseFiles(id): Promise<SourceFile[]>
```

Provider MUST 使用：

```text
GET    /api/v2/knowledge-bases
POST   /api/v2/knowledge-bases
GET    /api/v2/knowledge-bases/{kb_id}
PATCH  /api/v2/knowledge-bases/{kb_id}
DELETE /api/v1/knowledge-bases/{kb_id}
GET    /api/v1/knowledge-bases/{kb_id}/files
```

同时：

```text
MUST 使用 Work 已登录 session 的同一 opaque Bearer token。
MUST NOT 在 Renderer 解码授权。
MUST NOT 直接调用 RAGFlow。
MUST schema-validate/normalize remote payload before handing to feature。
MUST NOT 使用 patch.deleted=true 模拟 DELETE。
MUST NOT 使用 removedIds 作为远端删除 authority。
```

### Inputs

```text
KnowledgeBaseCreate
KnowledgeBaseUpdate
kb_id
authenticated session
```

### Preconditions

```text
PRE-API-001 provider mode 已启用。
PRE-API-002 auth session 可提供 opaque Bearer token。
PRE-API-003 4580 service 可解析。
```

### Authoritative State

```text
SOT: Knowledge Service
Observed: HTTP response + follow-up GET
Derived: Renderer cache
```

### State Transition

```text
Create: absent -> remote KnowledgeBase
Update: revision N -> updated remote entity
Delete: present -> remote resource absent
```

### Allowed Side Effects

```text
ALLOW:
- remote Knowledge database mutation through frozen contract endpoint
- Renderer cache refresh
```

### Forbidden Side Effects

```text
DENY:
- local-only fake deletion
- automatic mock fallback
- automatic retry of uncertain non-idempotent mutation
```

### Ownership Scope

```text
RESOURCE
```

### Idempotency

```text
GET: idempotent
PATCH: same payload may be repeated only after authority reconciliation
DELETE: retry only after GET proves resource仍存在
POST create: MUST NOT automatically retry after uncertain outcome
```

### Failure Semantics

```text
F-API-001
trigger: 401
expected state: no UI mutation commit; surface auth-required state
error code: KNOWLEDGE_AUTH_REQUIRED
rollback: none; server authority unchanged/unknown
retryable: after auth restored

F-API-002
trigger: 403
expected state: current entity retained; mutation controls disabled for operation
error code: KNOWLEDGE_FORBIDDEN
rollback: none
retryable: NO until permission changes

F-API-003
trigger: 404 detail/delete
expected state: detail -> NOT_FOUND; list refetch
error code: KNOWLEDGE_NOT_FOUND
rollback: none
retryable: NO

F-API-004
trigger: 409
expected state: preserve form draft; refetch current entity; show conflict
error code: KNOWLEDGE_CONFLICT
rollback: Renderer MUST NOT overwrite refetched authority
retryable: user resubmits after review

F-API-005
trigger: 5xx before known commit
expected state: preserve draft; no optimistic commit
error code: KNOWLEDGE_SERVICE_ERROR
rollback: none
retryable: YES

F-API-006
trigger: timeout/connection reset after request send
expected state: enter RECONCILING; perform read before any mutation retry
error code: KNOWLEDGE_MUTATION_OUTCOME_UNKNOWN
rollback: no client compensation
retryable: only after reconciliation
```

### Postconditions

```text
POST-API-001 successful Create appears after server response/refetch。
POST-API-002 successful Update detail equals service result。
POST-API-003 successful Delete causes GET 404/list absence before UI settles。
```

### Invariants

```text
INV-API-001 Service data wins over Renderer cache。
INV-API-002 provider error MUST NOT produce mock data。
```

### Acceptance

```text
A-API-001
A-API-002
A-API-003
A-API-004
A-FAIL-001
```

### Evidence

```text
required test: contract client test + mock HTTP integration + real 4580 golden consumer
required artifact: captured sanitized request/response metadata
required digest: external contract consumer-lock evidence
```

---

## REQ-UI-001 — Bases List Work-native Layout

### Goal

让 Bases List 在视觉与结构上符合 apps/work 的页面 Chrome、toolbar、card/table 模式。

### Normative Requirement

```text
MUST 运行于现有 Knowledge host / KnowledgePageChrome 体系内。
MUST 默认使用 Card view。
MUST 提供 Search、Visibility、Cards/Table、Create Base。
MUST 使用真实 visibility enum：private | department | organization。
MUST 展示 Base.name、visibility、status。
MUST 提供 loading / empty / error / unavailable 四种可区分状态。
MUST NOT 在 error/unavailable 时显示 mock Demo base。
```

分页：

```text
page_size = 50
page starts at 1
total > 50 时 MUST 渲染上一页/下一页控制
Search/Visibility 仅过滤当前已加载 page
```

### Inputs

```text
PageData<KnowledgeBase>
query
visibility filter
view mode
```

### Preconditions

```text
PRE-UI-001 Knowledge host 已挂载。
```

### Authoritative State

```text
SOT: service list response
Observed: list response
Derived: current-page filtered view
```

### State Transition

```text
LOADING -> READY|EMPTY|ERROR|UNAVAILABLE
```

### Allowed Side Effects

```text
ALLOW: local query/filter/view state
```

### Forbidden Side Effects

```text
DENY: list filtering触发 business mutation
```

### Ownership Scope

```text
SECTION
```

### Idempotency

```text
重复打开同一 page 无 remote mutation。
```

### Failure Semantics

```text
F-UI-001 list request fail
expected state: error state + Retry
error code: KNOWLEDGE_LIST_FAILED
rollback: none
retryable: YES
```

### Postconditions

```text
POST-UI-001 1024x768 viewport 内 toolbar 主操作可见。
POST-UI-002 card/table 使用同一 filtered source。
```

### Invariants

```text
INV-UI-001 List item id 始终使用 KnowledgeBase.id。
```

### Acceptance

```text
A-UI-001
```

### Evidence

```text
required test: component + Playwright layout
required artifact: screenshot + DOM assertion
```

---

## REQ-UI-002 — Create Modal 与共享 AppModal Panel

### Goal

修复 Create Modal 左上角/全屏内容失真，并形成可复用的 Modal viewport/panel 语义。

### Normative Requirement

共享 AppModal MUST 形成：

```text
Portal
├── Overlay
└── Dialog.Content / viewport
    └── animated panel
```

Panel MUST：

```text
在 viewport 中水平/垂直居中
width <= min(520px, viewportWidth - 48px)
max-height <= viewportHeight - 48px
overflow-y = auto when needed
保留 Radix focus trap
Escape 可关闭（SUBMITTING 除外）
Overlay click 可关闭（SUBMITTING 除外）
```

Create Form MUST 包含：

```text
name*
description
visibility
Cancel
Create
```

并：

```text
name trim 后长度 1..128
visibility default = organization
empty description -> null
SUBMITTING 时 Create/Cancel/overlay/escape 均不得产生第二次 mutation
失败时 modal 保持打开并保留 draft
```

MUST NOT 使用 CSS `translate(-50%, -50%)` 与 motion transform 叠加实现居中。

### Inputs

```text
open
BaseFormValues
createBase()
```

### Preconditions

```text
PRE-MODAL-001 AppModal 已使用 Radix Portal。
```

### Authoritative State

```text
SOT: user draft until create succeeds
Observed: provider response
Derived: modal visual state
```

### State Transition

```text
CLOSED -> EDITING -> SUBMITTING -> CLOSED|EDITING_ERROR|RECONCILING
```

### Allowed Side Effects

```text
ALLOW:
- shared AppModal internal layout refactor
- Base create mutation
```

### Forbidden Side Effects

```text
DENY:
- AppModal 引入 Knowledge-specific logic
- duplicate submit
```

### Ownership Scope

```text
SECTION + SHARED
```

### Idempotency

```text
重复点击 Create during SUBMITTING -> exactly one provider create call
```

### Failure Semantics

```text
F-MODAL-001 invalid form
expected state: EDITING
error code: BASE_FORM_INVALID
rollback: 0 mutation
retryable: YES

F-MODAL-002 create error
expected state: EDITING_ERROR, draft preserved
error code: normalized provider error
rollback: no UI commit
retryable: per provider error
```

### Postconditions

```text
POST-MODAL-001 modal panel centered and fully visible。
POST-MODAL-002 create success closes modal only after authority confirmed。
```

### Invariants

```text
INV-MODAL-001 shared AppModal remains business-agnostic。
```

### Acceptance

```text
A-UI-002
A-NEG-001
```

### Evidence

```text
required test: AppModal component regression + CreateBaseModal integration + Playwright bounding box
required artifact: modal screenshot
```

---

## REQ-UI-003 — Base Detail / Documents / Settings / Danger Zone

### Goal

把当前同文件 Detail 条件分支抽取为真实 Detail page component，并用真实 Base/SourceFile 数据重建信息架构。

### Normative Requirement

Detail MUST 包含：

```text
Back
Base name
status
visibility
Base id
Upload files action

Tabs:
- Documents
- Settings
```

本 Release：

```text
MUST NOT 渲染 Members tab。
MUST NOT 渲染 Runtime tab。
```

Documents MUST 从：

```text
GET /api/v1/knowledge-bases/{kb_id}/files
```

读取 SourceFile。

Settings MUST 编辑：

```text
name
description
visibility
```

Danger Zone MUST 与 Save 区域分离，并使用二次确认。

Delete success 后 MUST：

```text
navigate/back to Base List
refetch list
```

Delete fail 时 MUST 保持 Detail page，不得本地移除。

### Inputs

```text
knowledgeBaseId
KnowledgeBase
SourceFile[]
```

### Preconditions

```text
PRE-DETAIL-001 route param knowledgeBaseId 非空。
```

### Authoritative State

```text
SOT: Knowledge Service
Observed: GET base/files
Derived: form draft
```

### State Transition

```text
LOADING -> READY|NOT_FOUND|ERROR|UNAVAILABLE
READY -> SAVING -> READY|ERROR
READY -> DELETING -> LIST|ERROR
```

### Allowed Side Effects

```text
ALLOW: PATCH, DELETE, route navigation after confirmed delete
```

### Forbidden Side Effects

```text
DENY:
- removedIds fake authority
- Members/Runtime placeholder
```

### Ownership Scope

```text
RESOURCE + SECTION
```

### Idempotency

```text
Save unchanged values SHOULD avoid PATCH。
Delete confirm during request MUST be single-flight。
```

### Failure Semantics

```text
F-DETAIL-001 GET 404 -> NOT_FOUND
F-DETAIL-002 PATCH fail -> draft preserved
F-DETAIL-003 DELETE fail -> detail retained
```

Error codes：

```text
KNOWLEDGE_NOT_FOUND
KNOWLEDGE_UPDATE_FAILED
KNOWLEDGE_DELETE_FAILED
```

### Postconditions

```text
POST-DETAIL-001 Documents 是 remote SourceFile projection。
POST-DETAIL-002 Settings 与 Danger Zone 分区可识别。
```

### Invariants

```text
INV-DETAIL-001 detail identity == route.params.knowledgeBaseId == KnowledgeBase.id
```

### Acceptance

```text
A-UI-003
A-API-002
A-API-003
```

### Evidence

```text
required test: component/integration
required artifact: Detail Documents/Settings screenshots
```

---

## REQ-ROUTE-001 — Base List / Detail / Upload Route Semantics

### Goal

在不扩张现有顶级 Knowledge page enum 的条件下，让 Base List、Detail 和 Base-scoped Upload 可恢复、可导航、可测试。

### Normative Requirement

```text
page="bases", no knowledgeBaseId
  => KnowledgeBasesPage

page="bases", knowledgeBaseId=<id>
  => KnowledgeBaseDetailPage

page="uploads", no knowledgeBaseId
  => Global Uploads

page="uploads", knowledgeBaseId=<id>
  => Base-scoped Uploads
```

Detail 的 Upload button MUST：

```ts
onNavigate({
  page: "uploads",
  params: { knowledgeBaseId: base.id }
})
```

MUST NOT 新增 `base-detail` / `base-upload` 顶级 page id。

### Inputs

```text
KnowledgeRoute
KnowledgeRouteParams
```

### Preconditions

```text
PRE-ROUTE-001 route descriptor 支持 knowledgeBaseId。
```

### Authoritative State

```text
SOT: Knowledge route scope
```

### State Transition

```text
list -> detail -> base upload
base upload -> back -> detail
detail -> back -> list
```

### Allowed Side Effects

```text
ALLOW: route stack push/pop
```

### Forbidden Side Effects

```text
DENY: component-local detail id replacing route authority
```

### Ownership Scope

```text
OBJECT
```

### Idempotency

```text
resolve 同一 route 输入必须输出相同 page/params。
```

### Failure Semantics

```text
F-ROUTE-001 invalid/absent detail id
expected state: list or NOT_FOUND according to route presence
error code: KNOWLEDGE_ROUTE_INVALID only for malformed untrusted value
rollback: none
retryable: NO
```

### Postconditions

```text
POST-ROUTE-001 base upload 页面固定指向来源 Base。
```

### Invariants

```text
INV-ROUTE-001 top-level page enum 保持现有 six pages。
```

### Acceptance

```text
A-ROUTE-001
```

### Evidence

```text
required test: route unit + navigation component test
```

---

## REQ-FILE-001 — Base Upload 使用 Managed File + Existing FileJob

### Goal

让 Base 的“Upload files”成为独立 Upload 页面操作，但底层完全复用现有 Main-owned FileJob 和 File Platform。

### Normative Requirement

Base Upload v1.0 MUST 使用单文件单 Job。

确定流程：

```text
1. Renderer requests knowledgeJobs.createDraft({ knowledgeBaseId })
2. Main returns JobSnapshot(status=draft, jobId)
3. Renderer invokes managed file picker with:
   {
     knowledgeJobId: jobId,
     mode: "local",
     source: "picker"
   }
   and multiple=false
4. File Platform stages/hashes in Main and binds ManagedFile to knowledgeJobId
5. Main FileJob Runtime resolves ManagedFile
6. Runtime uploads:
   POST /api/v1/knowledge-bases/{kb_id}/files
7. Runtime stores source_file.id + remote ingestion job.id
8. Runtime polls:
   GET /api/v1/ingestion-jobs/{job_id}
9. Main emits KnowledgeJobSnapshot changes
10. Renderer only projects Main snapshots
```

Cancel picker：

```text
pick result count == 0
=> call knowledgeJobs.cancel({jobId})
=> local job status == cancelled
=> MUST NOT call remote upload
```

Managed import error：

```text
no successful FileImportResult
=> call cancel({jobId})
=> render File Platform error separately
=> MUST NOT leave draft job orphaned
```

Provider mode MUST enable picker when：

```text
knowledge job capability available
AND base.status permits Upload
```

MUST NOT use：

```text
hidden raw <input> fallback
Renderer File bytes
Renderer absolute path
direct multipart from React
mock-only picker gate
```

### Inputs

```text
knowledgeBaseId
Managed File picker
KnowledgeJobCreateDraftInput
```

### Preconditions

```text
PRE-FILE-001 valid Base active/degraded with upload permitted by status matrix。
PRE-FILE-002 File Platform managed picker available。
PRE-FILE-003 Knowledge Job capability available。
```

### Authoritative State

```text
SOT local: Main KnowledgeJob internal record
SOT file: Managed File Platform
SOT remote ingestion: NodeSKClaw IngestionJob
```

### State Transition

```text
draft -> queued -> uploading -> processing -> completed
```

### Allowed Side Effects

```text
ALLOW:
- Main managed file storage write
- Main job state write
- Network upload to selected Base
- remote SourceFile/IngestionJob creation
```

### Forbidden Side Effects

```text
DENY:
- upload to another Base id
- raw file bytes persisted in Renderer state
- orphan draft after user picker cancel
```

### Ownership Scope

```text
RESOURCE
```

### Idempotency

```text
A local jobId binds exactly one ManagedFile and one target knowledgeBaseId。
Retry MUST reuse same ManagedFile; MUST NOT create a second local Job identity。
```

### Failure Semantics

```text
F-FILE-001 picker cancelled
expected state: cancelled
error code: none
rollback: no remote side effect
retryable: new upload action

F-FILE-002 managed import rejected
expected state: local job cancelled; File Platform error shown
error code: FILE_IMPORT_REJECTED
rollback: File Platform follows its own failed import cleanup
retryable: YES

F-FILE-003 provider unavailable before remote upload
expected state: blocked_provider_unavailable
error code: KNOWLEDGE_PROVIDER_UNAVAILABLE
rollback: preserve ManagedFile for retry
retryable: YES

F-FILE-004 remote upload returns deterministic failure
expected state: failed
error code: normalized HTTP/message_key
rollback: preserve ManagedFile for retry/evidence
retryable: according to provider error

F-FILE-005 remote upload returns upload_unknown
expected state: interrupted
error code: KNOWLEDGE_UPLOAD_UNKNOWN
rollback: no blind re-upload
retryable: reconciliation/retry API path only
```

### Postconditions

```text
POST-FILE-001 completed job对应 remote ingestion status active。
POST-FILE-002 Global Uploads 与 Base-scoped Uploads 可看到同一个 jobId。
```

### Invariants

```text
INV-FILE-001 one FileJob == one target Base == one managed file in v1.0。
INV-FILE-002 renderer snapshot无 absolute path/token。
```

### Acceptance

```text
A-FILE-001
A-FILE-002
A-NEG-002
A-FAIL-002
```

### Evidence

```text
required test: managed picker integration + job runtime integration + real 4580 upload
required artifact: sanitized Job transition trace
```

---

## REQ-JOB-001 — FileJob 唯一状态源与 Remote Ingestion Reconcile

### Goal

消除 Base Upload 与 Global Uploads 之间的任务状态分叉。

### Normative Requirement

```text
MUST 由 Main 持有 job status/progress/attempt。
MUST 由 Global Uploads 与 Base Upload 共同调用 listSnapshots/onSnapshotChanged。
MUST 通过 knowledgeBaseId 过滤 Base-scoped view。
MUST NOT 在 Base feature 创建第二份 job store。
MUST NOT 用 Renderer timer 生成 progress。
MUST 将 remote ingestion status 按 8.5 映射到 local status。
MUST 持久化 remoteIngestionJobId 供 restart/retry/reconcile。
MUST 在 Work restart 后对 non-terminal job 执行 reconcile。
```

Retry：

```text
remoteIngestionJobId exists
=> POST /api/v1/ingestion-jobs/{id}/retry
=> poll same remote job lifecycle / provider response semantics

remoteIngestionJobId absent
AND managedFileId exists
AND previous failure occurred before remote resource creation
=> same local job may restart upload attempt
```

Cancel：

```text
remoteIngestionJobId exists and remote non-terminal
=> POST /api/v1/ingestion-jobs/{id}/cancel

remoteIngestionJobId absent
=> local cancellation only
```

### Inputs

```text
KnowledgeJobSnapshot
Main internal job record
remote IngestionJob
```

### Preconditions

```text
PRE-JOB-001 job belongs current partition。
```

### Authoritative State

```text
SOT runtime: Main job record
SOT remote ingest: remote IngestionJob
Renderer: projection only
```

### State Transition

见 8.4 / 8.5。

### Allowed Side Effects

```text
ALLOW:
- Main job record update
- remote retry/cancel
- snapshot event
```

### Forbidden Side Effects

```text
DENY:
- completed without remote active
- retry completed/cancelled
- job from another partition surfaced
```

### Ownership Scope

```text
RECORD
```

### Idempotency

```text
同一 snapshot event upsert by jobId。
重复事件不得创建 duplicate job row。
```

### Failure Semantics

```text
F-JOB-001 Main restart during running
expected state: interrupted until remote reconciliation; then mapped state
error code: JOB_RUNTIME_RESTARTED when remote cannot yet resolve
rollback: preserve job/managed file
retryable: YES

F-JOB-002 remote job 404 after previously persisted id
expected state: failed
error code: REMOTE_INGESTION_JOB_NOT_FOUND
rollback: preserve evidence
retryable: NO automatic retry
```

### Postconditions

```text
POST-JOB-001 all upload views agree on status for same jobId。
```

### Invariants

```text
INV-JOB-001 completed iff remote active for provider job。
```

### Acceptance

```text
A-JOB-001
A-JOB-002
A-FAIL-003
```

### Evidence

```text
required test: main runtime/state mapping/restart reconcile
required artifact: job event sequence
```

---

## REQ-STATE-001 — Provider / Mock Fail-closed

### Goal

避免真实服务故障时 UI 静默显示 synthetic data。

### Normative Requirement

```text
MUST 保留 explicit mock mode 供测试/demo。
MUST 在 provider/auto 解析为 provider 时使用真实 provider。
MUST NOT 因 4580 unreachable/401/403/5xx 自动切换为 mock。
MUST 移除 "mutationsEnabled = effectiveProvider === mock" 作为业务 gate。
MUST 将 mutation capability 由 provider/auth/capability/base status 决定。
```

### Inputs

```text
requested mode
provider capability
auth state
base status
```

### Preconditions

```text
PRE-STATE-001 mode snapshot available or fail-closed。
```

### Authoritative State

```text
SOT: Main-owned mode/capability snapshot
```

### State Transition

```text
provider available -> operable
provider unavailable -> unavailable/error
explicit mock -> mock
```

### Allowed Side Effects

```text
ALLOW: capability refresh
```

### Forbidden Side Effects

```text
DENY: service failure -> mock data
```

### Ownership Scope

```text
OBJECT
```

### Idempotency

```text
同一 mode/capability 输入产生同一 UI gate。
```

### Failure Semantics

```text
F-STATE-001 capability unavailable
expected state: unavailable
error code: KNOWLEDGE_PROVIDER_UNAVAILABLE
rollback: 0 business mutation
retryable: YES
```

### Postconditions

```text
POST-STATE-001 provider outage 可被用户明确识别。
```

### Invariants

```text
INV-STATE-001 synthetic data 永不冒充 provider data。
```

### Acceptance

```text
A-STATE-001
A-NEG-003
```

### Evidence

```text
required test: mode matrix
```

---

## REQ-SEC-001 — Auth / File / Identity Security Boundary

### Goal

保证真实 CRUD 和 Upload 接入不破坏已有 Electron 安全边界。

### Normative Requirement

```text
MUST 复用 Work authenticated session 的 opaque Bearer token。
MUST 在 Main/provider boundary 注入 token。
MUST NOT 在 Renderer localStorage/component state/log 中新增 token copy。
MUST NOT decode Knowledge authorization locally。
MUST NOT 保存/展示 RAGFlow API key。
MUST NOT 使用 dataset_id/document_id/chunk_id/ragflow_* 作为 UI public identity。
MUST 使用 KnowledgeBase.id / SourceFile.id / evidence public identity。
MUST 通过 Managed File Platform 执行 file policy/path containment。
MUST NOT 将 absolute path 放入 KnowledgeJobSnapshot。
MUST sanitize provider raw error before IPC。
```

### Inputs

```text
opaque token
remote payload
user file
```

### Preconditions

```text
PRE-SEC-001 existing auth session valid for Knowledge context。
```

### Authoritative State

```text
SOT auth: existing Work auth session owner
SOT identity: frontend contract domain ids
SOT file policy: File Platform Main
```

### State Transition

```text
authenticated -> provider request
invalid auth -> fail closed
```

### Allowed Side Effects

```text
ALLOW: Authorization header in Main HTTP request
```

### Forbidden Side Effects

```text
DENY:
- credential persistence in Renderer
- arbitrary path upload bypassing File Platform
```

### Ownership Scope

```text
FIELD + RESOURCE
```

### Idempotency

```text
security validation repeated => same allow/deny result for same authority state
```

### Failure Semantics

```text
F-SEC-001 token absent/expired -> KNOWLEDGE_AUTH_REQUIRED
F-SEC-002 file policy denied -> FILE_IMPORT_REJECTED
F-SEC-003 malformed provider payload -> KNOWLEDGE_CONTRACT_INVALID
```

### Postconditions

```text
POST-SEC-001 no token/absolute path in IPC test snapshot。
```

### Invariants

```text
INV-SEC-001 Renderer never becomes Knowledge credential owner。
```

### Acceptance

```text
A-SEC-001
A-NEG-004
```

### Evidence

```text
required test: IPC payload inspection + log scan + file policy test
```

---

## REQ-OBS-001 — Error / Operation Observability

### Goal

让 CRUD 与 FileJob 的失败能定位到 stage、operation 与 contract error，而不是只有 UI 文案。

### Normative Requirement

每次 mutation/job command MUST 具有：

```text
operationId
stage
status
timestamp
resource identity
result or normalized error code
```

CRUD stage：

```text
RESOLVE_AUTH
REQUEST
RECONCILE
REFETCH
COMPLETE
```

FileJob stage：

```text
CREATE_DRAFT
PICK_FILE
STAGE_FILE
UPLOAD
POLL_INGESTION
RETRY
CANCEL
COMPLETE
```

日志 MUST NOT 包含：

```text
Bearer token
absolute path
file bytes
provider secret
```

### Inputs

```text
provider operation
job operation
```

### Preconditions

```text
PRE-OBS-001 operation begins
```

### Authoritative State

```text
SOT: Main operation log + test evidence
```

### State Transition

```text
started -> succeeded|failed|reconciling
```

### Allowed Side Effects

```text
ALLOW: sanitized local diagnostic logs
```

### Forbidden Side Effects

```text
DENY: credentials/absolute path in logs
```

### Ownership Scope

```text
ENTRY
```

### Idempotency

```text
same operationId retry attempt MUST include attempt number or new child operation id
```

### Failure Semantics

```text
F-OBS-001 logger failure
expected state: business operation MUST NOT be converted from success to failure solely due log sink failure
error code: OBSERVABILITY_WRITE_FAILED
rollback: none
retryable: MAY retry log sink
```

### Postconditions

```text
POST-OBS-001 failure evidence can identify stage without secrets。
```

### Invariants

```text
INV-OBS-001 localized remote message is not branch key。
```

### Acceptance

```text
A-OBS-001
```

### Evidence

```text
required test: sanitized log snapshot
```

---

# 11. Side-Effect Contract

| Operation | Remote DB | Local File | Network | Renderer Cache | User Data | Business Source |
|---|---:|---:|---:|---:|---:|---:|
| list/get base | NO | NO | YES | YES | NO | READ |
| create base | YES | NO | YES | refresh | YES | WRITE |
| update base | YES | NO | YES | refresh | YES | WRITE |
| delete base | YES | NO | YES | refresh | YES | WRITE |
| list base files | NO | NO | YES | YES | NO | READ |
| open modal | NO | NO | NO | draft only | NO | NO |
| managed file pick | NO | YES | NO | safe view only | YES | NO |
| create FileJob draft | NO | MAY job record | IPC | snapshot | YES | NO |
| FileJob upload | YES | READ managed file | YES | snapshot | YES | WRITE |
| FileJob retry | MAY | READ | YES | snapshot | YES | WRITE |
| FileJob cancel | MAY | NO | YES when remote id exists | snapshot | YES | WRITE |

规则：

```text
Renderer cache 不是业务 source。
日志属于 side effect，但 MUST sanitized。
Main managed storage write 属于 local file side effect。
```

---

# 12. Ownership Contract

## 12.1 Ownership Types

| Resource | Ownership |
|---|---|
| remote KnowledgeBase | WHOLE_RESOURCE owned by Knowledge Service |
| Base form draft | USER_OWNED during edit |
| Base Page layout | SECTION owned by Work Knowledge UI |
| Base feature | FILE/SECTION owned by `features/bases` |
| FileJob feature | FILE/SECTION owned by `features/file-job` |
| AppModal primitive | SHARED |
| ManagedFile | WHOLE_RESOURCE owned by File Platform Main |
| KnowledgeJob internal record | RECORD owned by FileJob Runtime Main |
| Renderer Job Snapshot | GENERATED_ONLY |
| Bearer token | USER/SESSION authority owned outside Knowledge UI |

## 12.2 Update Rules

```text
创建 Base：
remote service owns returned resource immediately.

用户编辑 form：
draft owns unsaved values; service value remains authority until PATCH success.

PATCH success：
returned/refetched remote entity replaces prior resolved cache.

服务端变化：
refetch replaces Renderer cache; no local merge wins automatically.

Delete：
only remote DELETE/404 establishes removal; removedIds is prohibited as authority.
```

## 12.3 Drift

```text
detail loaded at T0
server changes before user Save
=> 409 or refetch mismatch
=> PRESERVE draft + REFRESH observed state + BLOCK blind overwrite
```

Default conflict behavior：

```text
BLOCK blind overwrite
PRESERVE user draft
```

---

# 13. Hash / Identity Contract

## 13.1 External Contract Provenance

External frontend contract identity MUST be verified by：

```text
tag:
knowledge-frontend-contract-v1.0.0

tag target:
f11e7cbe74cee767cab7a0cbd65baf98c2f44018

SHA256SUMS:
as shipped by the tag
```

No custom hash algorithm is introduced by this PRD.

## 13.2 Business Identity

```text
Base identity:
KnowledgeBase.id

SourceFile identity:
SourceFile.id

Remote ingestion identity:
IngestionJob.id

Local upload identity:
KnowledgeJobSnapshot.jobId

Managed local file identity:
ManagedFileView.id
```

MUST NOT use：

```text
dataset_id
document_id
chunk_id
ragflow_*
```

作为 Work UI identity。

---

# 14. Transaction Contract

## 14.1 CRUD Transaction Boundary

CRUD 的 transaction boundary 是 **单个 Knowledge HTTP mutation**。

```text
TXN includes:
- one POST/PATCH/DELETE at Knowledge Service
- service-side transaction semantics

TXN excludes:
- Renderer cache
- follow-up GET/refetch
- UI navigation
```

Renderer MUST NOT 实现跨请求“假原子事务”。

## 14.2 CRUD Commit Order

```text
validate form
→ snapshot UI draft
→ send mutation
→ receive deterministic success
→ refetch/accept server entity
→ update UI cache
→ evidence
```

Uncertain transport：

```text
send
→ timeout/reset
→ DO NOT commit local success
→ reconcile GET/list
→ derive final UI state
```

## 14.3 File Upload Saga

File upload 是跨 Local File Platform + Remote Knowledge 的 Saga，不声明跨系统 ACID。

```text
create local draft
→ managed file pick/stage
→ queue
→ remote multipart upload
→ persist remote source/job ids
→ poll remote ingestion
→ terminal reconcile
→ evidence
```

## 14.4 Failure Atomicity

CRUD：

```text
T0 = mutation 前最后一次 server-authoritative entity/list snapshot
```

若 deterministic mutation failure：

```text
Renderer business cache MUST remain T0
user draft MAY remain newer than T0
```

FileJob：

```text
远端 upload 失败后 MUST preserve ManagedFile + Job evidence for retry.
MUST NOT 因 upload 失败删除用户选定的 managed source as compensation.
```

Picker cancel：

```text
After cancel:
remote writes == 0
job.status == cancelled
```

## 14.5 Rollback Failure

本 PRD 不执行 remote compensating DELETE 作为 upload rollback。

若 cleanup local temp 失败：

```text
MUST preserve recovery evidence
MUST let File Platform cleanup policy handle orphan/temp
MUST NOT hide original upload failure
```

---

# 15. Conflict Contract

| Conflict | Detection | Default | Error | Mutation |
|---|---|---|---|---:|
| Base update conflict | HTTP 409 / revision semantic | BLOCK + refetch + preserve draft | KNOWLEDGE_CONFLICT | no blind retry |
| Delete already removed | DELETE/GET 404 | settle as NOT_FOUND after refetch | KNOWLEDGE_NOT_FOUND | 0 further write |
| provider service unavailable | capability/network | FAIL-CLOSED | KNOWLEDGE_PROVIDER_UNAVAILABLE | 0 mock mutation |
| contract payload invalid | schema validation | BLOCK | KNOWLEDGE_CONTRACT_INVALID | 0 UI authority commit |
| upload remote `upload_unknown` | remote job state | INTERRUPTED | KNOWLEDGE_UPLOAD_UNKNOWN | 0 blind re-upload |
| picker cancel | zero selected results | CANCEL local job | none | remote 0 |
| duplicate snapshot event | same jobId | UPSERT | none | one rendered row |
| different Base route/job target | mismatch | BLOCK | KNOWLEDGE_JOB_TARGET_MISMATCH | 0 upload |

禁止：

```text
last writer wins
blind retry mutation
silent mock fallback
```

---

# 16. Compatibility / Migration

## 16.1 Existing State

```text
Base Page:
single component list/detail

Facade:
generic entity snapshot/mutate

Mutation:
mock-only

Delete:
patch.deleted + removedIds

Uploads:
Main snapshots exist
provider picker disabled
FilePickerButton used without Knowledge Job context
```

## 16.2 Migration Rule

```text
detect:
identify current generic Base consumer

adopt:
retain existing route page ids and params contract

migrate:
Base page consumer -> typed Base facade
upload -> managed File Platform + existing Job IPC

preserve:
explicit mock mode for tests/demo
existing six Knowledge page ids
existing JobSnapshot renderer contract security boundary

remove:
Base-specific use of removedIds authority
mock-only provider mutation gate
Members/Runtime Base tabs
raw/no-context Knowledge upload picker path
```

## 16.3 Unknown Ownership

对本需求未声明 ownership 的既有 Work shared component：

```text
PRESERVE
REPORT in grounding
MUST NOT delete or rewrite wholesale
```

---

# 17. External Dependency Contract

## 17.1 NodeSKClaw Knowledge

```text
name:
NodeSKClaw Knowledge frontend contract

endpoint:
http://127.0.0.1:4580

repo:
loudon84/nodeskclaw

contract:
nodeskclaw-knowledge/contracts/frontend/v1.0.0

version:
1.0.0

immutable identity:
tag knowledge-frontend-contract-v1.0.0
target f11e7cbe74cee767cab7a0cbd65baf98c2f44018

fallback:
NONE in provider mode

offline:
Work MUST show unavailable/error; MUST NOT use mock

failure:
normalized KnowledgeFacadeError
```

## 17.2 Work File Platform

```text
required APIs:
window.hermesAPI.files.pickFiles
FileImportContext.knowledgeJobId
ManagedFileView

fallback for Base Upload:
NONE to raw file input
```

## 17.3 Work Knowledge Jobs

```text
required APIs:
createDraft
listSnapshots
getSnapshot
cancel
retry
onSnapshotChanged
getCapability
```

---

# 18. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| Bearer token 泄露到 Renderer | Main-owned provider 注入 opaque token | A-SEC-001 |
| RAGFlow credential 泄露 | Work 只调用 Knowledge contract | A-NEG-004 |
| absolute path 泄露 | ManagedFileView + sanitized JobSnapshot | A-SEC-001 |
| raw file bypass File policy | Base Upload 必须传 `knowledgeJobId` context 使用 managed picker | A-FILE-001 |
| arbitrary file execution | File Platform deny policy | A-NEG-004 |
| contract injection/unknown fields | schema validation / additionalProperties discipline | A-API-004 |
| provider raw error泄露 | normalized error | A-OBS-001 |
| cross-base upload | job target invariant | A-NEG-002 |
| cross-partition job | Main partition filtering | A-JOB-001 |
| synthetic data confusion | explicit mock only | A-NEG-003 |

---

# 19. Observability Contract

## 19.1 Required Operation Record

```json
{
  "operation_id": "opaque-id",
  "domain": "knowledge-base|knowledge-file-job",
  "stage": "REQUEST",
  "status": "started|succeeded|failed|reconciling",
  "timestamp": "ISO-8601",
  "resource_id": "public-domain-id",
  "error_code": null
}
```

## 19.2 Required Job Transition Record

```json
{
  "job_id": "local-job-id",
  "knowledge_base_id": "kb-id",
  "from": "uploading",
  "to": "processing",
  "attempt": 1,
  "timestamp": "ISO-8601",
  "error_code": null
}
```

MUST NOT log：

```text
Authorization header
absolute path
file bytes
RAGFlow key
```

---

# 20. Acceptance

## A-ARCH-001 — Page / Feature Boundary

### Requirement Refs

```text
REQ-ARCH-001
```

### Given

Golden Consumer checkout at baseline/approved grounded commit。

### When

执行 static architecture test。

### Then

```text
Knowledge pages 不包含 raw 4580 URL。
Knowledge pages 不直接执行 Knowledge mutation IPC。
features/bases 不包含 fetch/axios 到 Knowledge endpoint。
Base operation files 位于 features/bases。
file upload operation 位于 features/file-job。
```

### Oracle

```text
forbidden match count == 0
required feature entry files exist
```

### Evidence

```text
test id: TEST-A-ARCH-001
exit code: 0
artifact: evidence/A-ARCH-001.json
```

---

## A-ARCH-002 — 单一 FileJob Store

### Requirement Refs

```text
REQ-ARCH-001
REQ-JOB-001
```

### Given

Global Uploads 与 Base-scoped Uploads 同时挂载。

### When

Main emits same `jobId` snapshot update。

### Then

两个 view 显示相同 status/progress，Base view 只过滤 target base。

### Oracle

```text
global[jobId].status == base[jobId].status
global[jobId].progress == base[jobId].progress
duplicate runtime store count == 0
```

### Evidence

```text
test id: TEST-A-ARCH-002
artifact: evidence/A-ARCH-002.json
```

---

## A-API-001 — 真实 Create

### Requirement Refs

```text
REQ-API-001
REQ-UI-002
```

### Given

provider mode、authenticated session、4580 ready。

### When

创建：

```text
name = "Demo base"
description = ""
visibility = organization
```

### Then

发送：

```text
POST /api/v2/knowledge-bases
name="Demo base"
description=null
visibility="organization"
```

成功后 list 可读取相同 `KnowledgeBase.id`。

### Oracle

```text
HTTP success
response schema valid
GET/list contains returned id
create request count == 1
```

### Evidence

```text
test id: TEST-A-API-001
artifact: sanitized-http-create.json
```

---

## A-API-002 — 真实 Detail / Update

### Requirement Refs

```text
REQ-API-001
REQ-UI-003
```

### Given

已存在 Base `kb-1`。

### When

打开 detail 并修改 name/description/visibility。

### Then

```text
GET /api/v2/knowledge-bases/kb-1
PATCH /api/v2/knowledge-bases/kb-1
```

PATCH 不包含本期不拥有的字段。

### Oracle

```text
PATCH additional unexpected fields == 0
refetched entity equals submitted owned fields
route id == response.id
```

### Evidence

```text
test id: TEST-A-API-002
artifact: sanitized-http-update.json
```

---

## A-API-003 — 真实 Delete

### Requirement Refs

```text
REQ-API-001
REQ-UI-003
```

### Given

Base `kb-1` 存在且状态允许 Delete。

### When

Danger Zone 二次确认。

### Then

调用：

```text
DELETE /api/v1/knowledge-bases/kb-1
```

确认 resource 不再存在后返回 list。

### Oracle

```text
DELETE request count == 1
subsequent detail GET => 404 OR list excludes kb-1
removedIds authority absent
```

### Evidence

```text
test id: TEST-A-API-003
artifact: sanitized-http-delete.json
```

---

## A-API-004 — Contract Validation

### Requirement Refs

```text
REQ-API-001
REQ-SEC-001
```

### Given

remote 返回不符合 KnowledgeBase schema 的 payload。

### When

provider decode。

### Then

不提交到 UI authority。

### Oracle

```text
error.code == KNOWLEDGE_CONTRACT_INVALID
UI entity update count == 0
```

### Evidence

```text
test id: TEST-A-API-004
```

---

## A-UI-001 — Bases Layout

### Requirement Refs

```text
REQ-UI-001
```

### Given

viewport = 1024x768，list 有至少一个 Base。

### When

进入 Bases。

### Then

Search、Visibility、Cards/Table、Create 均在 Work content region 可见；默认 Card。

### Oracle

```text
all required controls visible == true
view == "card"
control bounding boxes inside content viewport
horizontal overflow == 0
```

### Evidence

```text
test id: TEST-A-UI-001
artifact: screenshots/bases-list-1024x768.png
```

---

## A-UI-002 — Create Modal Geometry / Single Submit

### Requirement Refs

```text
REQ-UI-002
```

### Given

viewport = 1024x768。

### When

点击 Create base。

### Then

panel 居中、未越界、focus 在 dialog 内；重复点击提交不产生重复请求。

### Oracle

```text
abs(panel.centerX - viewport.centerX) <= 8
abs(panel.centerY - viewport.centerY) <= 8
panel.left >= 24
panel.right <= viewport.width - 24
panel.top >= 24
panel.bottom <= viewport.height - 24
create request count == 1
```

### Evidence

```text
test id: TEST-A-UI-002
artifact: screenshots/create-base-modal.png
```

---

## A-UI-003 — Detail Information Architecture

### Requirement Refs

```text
REQ-UI-003
```

### Given

Base + SourceFile fixtures。

### When

打开 Detail。

### Then

只显示 Documents/Settings 两个 tab；Settings 与 Danger Zone 分离；Documents 使用 remote SourceFile。

### Oracle

```text
tab ids == ["documents","settings"]
members tab absent
runtime tab absent
document row source ids == fixture source_file ids
danger zone separate container exists
```

### Evidence

```text
test id: TEST-A-UI-003
artifact: screenshots/base-detail-settings.png
```

---

## A-ROUTE-001 — Base Scoped Navigation

### Requirement Refs

```text
REQ-ROUTE-001
```

### Given

当前 Base id=`kb-1`。

### When

从 Detail 点击 Upload files。

### Then

route：

```text
page = uploads
params.knowledgeBaseId = kb-1
```

返回时回到该 Detail。

### Oracle

```text
route.page == "uploads"
route.params.knowledgeBaseId == "kb-1"
```

### Evidence

```text
test id: TEST-A-ROUTE-001
```

---

## A-FILE-001 — Managed Base Upload

### Requirement Refs

```text
REQ-FILE-001
REQ-SEC-001
```

### Given

`kb-1` active，provider 可用，选择一个合法 PDF。

### When

执行 Upload。

### Then

顺序满足：

```text
createDraft(kb-1)
pickFiles(context.knowledgeJobId=localJobId, multiple=false)
remote upload /api/v1/knowledge-bases/kb-1/files
remote ingestion poll
local completed only after remote active
```

### Oracle

```text
one local job id
one managed file id
one target kb id
remote final status == active
local final status == completed
renderer payload absolute path count == 0
```

### Evidence

```text
test id: TEST-A-FILE-001
artifact: evidence/file-job-success-trace.json
```

---

## A-FILE-002 — Picker Cancel 无 Remote Mutation

### Requirement Refs

```text
REQ-FILE-001
```

### Given

已创建 draft job。

### When

用户关闭文件选择器且未选择文件。

### Then

job cancelled；远端无 upload。

### Oracle

```text
job.status == cancelled
POST /files request count == 0
orphan draft count == 0
```

### Evidence

```text
test id: TEST-A-FILE-002
```

---

## A-JOB-001 — Shared Snapshot Authority

### Requirement Refs

```text
REQ-JOB-001
```

### Given

Main 存在 `job-1`，knowledgeBaseId=`kb-1`。

### When

Main 推送 progress 60 -> 80。

### Then

Global view 与 Base view 均为 80。

### Oracle

```text
global.progress == 80
base.progress == 80
rendered rows for job-1 per view == 1
```

### Evidence

```text
test id: TEST-A-JOB-001
```

---

## A-JOB-002 — Remote Active 才能 Completed

### Requirement Refs

```text
REQ-JOB-001
```

### Given

remote statuses 依次：

```text
uploading
parsing
validating
active
```

### When

runtime reconcile。

### Then

local：

```text
uploading
processing
processing
completed
```

### Oracle

```text
no completed snapshot before remote active
```

### Evidence

```text
test id: TEST-A-JOB-002
```

---

## A-STATE-001 — Provider CRUD Enabled

### Requirement Refs

```text
REQ-STATE-001
REQ-API-001
```

### Given

provider mode、auth valid、capability available、Base active。

### When

进入 List/Detail。

### Then

Create/Save/Delete 按 status matrix 可用，不依赖 mock mode。

### Oracle

```text
mutation capability != (mode == mock)
provider active create enabled == true
```

### Evidence

```text
test id: TEST-A-STATE-001
```

---

## A-SEC-001 — Renderer Sanitization

### Requirement Refs

```text
REQ-SEC-001
```

### Given

真实 CRUD + file upload。

### When

捕获 Preload/Renderer DTO 与日志。

### Then

不存在 token、绝对路径、provider secret。

### Oracle

```text
secret pattern matches == 0
absolute-path pattern matches in KnowledgeJobSnapshot == 0
```

### Evidence

```text
test id: TEST-A-SEC-001
artifact: evidence/ipc-sanitization.json
```

---

## A-OBS-001 — Normalized Error Evidence

### Requirement Refs

```text
REQ-OBS-001
```

### Given

provider 返回 HTTP 409 + message_key。

### When

Update。

### Then

记录 operationId/stage/error code，UI 不基于 localized message 分支。

### Oracle

```text
operation_id non-empty
stage == REQUEST or RECONCILE
error.code == KNOWLEDGE_CONFLICT
message branch dependency count == 0
```

### Evidence

```text
test id: TEST-A-OBS-001
```

---

# 21. Acceptance Input Matrix

| Case | Provider | Base Status | File | Remote Outcome | Expected |
|---|---|---|---|---|---|
| 1 | available | active | valid | success | CRUD/Upload success |
| 2 | available | active | cancel picker | none | local cancelled, remote 0 |
| 3 | available | provisioning | valid | N/A | upload/delete disabled |
| 4 | available | updating | valid | N/A | save/upload/delete disabled |
| 5 | available | degraded | valid | success | warning + allowed operations |
| 6 | available | deleting | valid | N/A | read-only |
| 7 | unavailable | active | valid | none | unavailable, no mock fallback |
| 8 | available | active | policy denied | none | FILE_IMPORT_REJECTED |
| 9 | available | active | valid | HTTP 401 | auth required |
| 10 | available | active | valid | HTTP 403 | forbidden |
| 11 | available | active | valid | HTTP 404 | not found |
| 12 | available | active | valid | HTTP 409 | preserve draft + refetch |
| 13 | available | active | valid | timeout after send | reconcile before retry |
| 14 | available | active | valid | upload_unknown | interrupted, no blind re-upload |
| 15 | available | active | valid | remote failed | local failed |
| 16 | available | active | valid | remote active | local completed |
| 17 | explicit mock | synthetic | synthetic | mock | mock badge/data allowed |
| 18 | provider | N/A | N/A | malformed JSON contract | contract invalid, 0 authority commit |

---

# 22. Negative Acceptance

## A-NEG-001 — Invalid Create 不发请求

```text
Given name="" or >128 chars
When Create
Then request count == 0
And modal remains open
And error == BASE_FORM_INVALID
```

## A-NEG-002 — Cross-base Upload 阻断

```text
Given route base=kb-1
And job target=kb-2
When runtime starts upload
Then remote upload count == 0
And error == KNOWLEDGE_JOB_TARGET_MISMATCH
```

## A-NEG-003 — Provider Failure 不回退 Mock

```text
Given provider mode
When 4580 unavailable
Then Demo/mock entity count == 0
And state == unavailable/error
```

## A-NEG-004 — Renderer 无 Credential/Absolute Path

```text
Given real CRUD/upload
When inspect Renderer state, IPC DTO, diagnostic log
Then bearer token matches == 0
And absolute managed/original path matches == 0
And ragflow key matches == 0
```

---

# 23. Failure Injection

| Injection Point | Expected Postcondition |
|---|---|
| before POST Create | 0 remote mutation; form preserved |
| after Create request send before response | RECONCILING; no automatic second POST |
| before PATCH | T0 service entity remains UI authority |
| after PATCH send before response | refetch before retry |
| before DELETE | Detail remains |
| after DELETE send before response | GET/list reconcile; no local-only delete |
| after createDraft before picker | cancel action can terminate draft |
| picker cancel | cancelled + remote upload 0 |
| after managed file stage before remote upload | job/ManagedFile preserved for retry |
| during remote multipart | failed/interrupted according to deterministic/unknown outcome |
| after remote upload accepted before job id persisted | operation MUST fail evidence/reconcile path; MUST NOT mint completed |
| during remote ingestion poll | local non-terminal preserved |
| during Main restart | job becomes/reconciles from interrupted state |
| during retry | same local jobId, attempt increments |
| during cancel | final state determined by remote response/reconcile |

---

# 24. Evidence Contract

## 24.1 Evidence Schema

每个 Required Acceptance 的 evidence MUST 至少包含：

```json
{
  "acceptance_id": "A-FILE-001",
  "status": "PASS",
  "requirement_ids": ["REQ-FILE-001"],
  "test_ids": ["TEST-A-FILE-001"],
  "command": "<executed command>",
  "exit_code": 0,
  "oracle": {
    "type": "structured_assertion",
    "expected": {},
    "actual": {}
  },
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v5.1",
  "commit_sha": "<implementation commit>",
  "contract_tag": "knowledge-frontend-contract-v1.0.0",
  "contract_commit": "f11e7cbe74cee767cab7a0cbd65baf98c2f44018",
  "timestamp": "ISO-8601",
  "tool_version": "<runner version>",
  "evidence_files": []
}
```

## 24.2 Evidence Integrity

Required：

```text
repo
branch
implementation commit SHA
test command
exit code
timestamp
external contract tag + target commit
```

Screenshot 只能作为 UI Evidence 的一部分，不能替代 DOM/HTTP/state oracle。

---

# 25. Golden Consumer / Real-world Acceptance

本需求属于 Brownfield + Integration，Release Gate MUST 同时包含：

```text
Synthetic Fixture
+
Real Consumer
```

## 25.1 Synthetic

至少覆盖：

```text
HTTP 200/201
401
403
404
409
5xx
malformed payload
upload active/failed/cancelled/upload_unknown
```

## 25.2 Real Consumer

Golden Consumer：

```text
repo:
loudon84/smc-copilot

baseline:
work/prd-v5.1
990fb605f740223bbfbdabca7e04dd51cb28e145
```

执行 Evidence MUST 记录：

```text
implementation HEAD SHA
worktree clean/dirty
before route/UI snapshot
after route/UI snapshot
contract tag/commit
real 4580 service health/result
```

Real Consumer 至少完成：

```text
Create Base
Open Detail
Update Base
Upload one file
Observe ingestion active/completed mapping
Delete Base
Confirm list absence
```

---

# 26. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test | Evidence | Gate |
|---|---|---|---|---|---|
| REQ-ARCH-001 | INV-ARCH-001/002 | A-ARCH-001/002 | TEST-A-ARCH-001/002 | EVID-A-ARCH-* | REQUIRED |
| REQ-API-001 | INV-API-001/002 | A-API-001/002/003/004, A-FAIL-001 | TEST-A-API-* | EVID-A-API-* | REQUIRED |
| REQ-UI-001 | INV-UI-001 | A-UI-001 | TEST-A-UI-001 | EVID-A-UI-001 | REQUIRED |
| REQ-UI-002 | INV-MODAL-001 | A-UI-002, A-NEG-001 | TEST-A-UI-002, TEST-A-NEG-001 | EVID-* | REQUIRED |
| REQ-UI-003 | INV-DETAIL-001 | A-UI-003, A-API-002/003 | TEST-A-UI-003 | EVID-* | REQUIRED |
| REQ-ROUTE-001 | INV-ROUTE-001 | A-ROUTE-001 | TEST-A-ROUTE-001 | EVID-* | REQUIRED |
| REQ-FILE-001 | INV-FILE-001/002 | A-FILE-001/002, A-NEG-002, A-FAIL-002 | TEST-A-FILE-* | EVID-* | REQUIRED |
| REQ-JOB-001 | INV-JOB-001 | A-JOB-001/002, A-FAIL-003 | TEST-A-JOB-* | EVID-* | REQUIRED |
| REQ-STATE-001 | INV-STATE-001 | A-STATE-001, A-NEG-003 | TEST-A-STATE-001 | EVID-* | REQUIRED |
| REQ-SEC-001 | INV-SEC-001 | A-SEC-001, A-NEG-004 | TEST-A-SEC-001 | EVID-* | REQUIRED |
| REQ-OBS-001 | INV-OBS-001 | A-OBS-001 | TEST-A-OBS-001 | EVID-* | REQUIRED |

---

# 27. Failure Acceptance

## A-FAIL-001 — Uncertain CRUD Mutation Reconcile

### Requirement Refs

```text
REQ-API-001
```

### Given

POST/PATCH/DELETE 请求已发送，response 前注入 timeout。

### When

client 收到 uncertain transport error。

### Then

```text
MUST NOT auto retry mutation
MUST enter RECONCILING
MUST perform GET/list
MUST derive UI from server authority
```

### Oracle

```text
duplicate mutation request count == 0
reconcile read request count >= 1
```

### Evidence

```text
test id: TEST-A-FAIL-001
```

---

## A-FAIL-002 — Upload Failure Preserves Retry Source

### Requirement Refs

```text
REQ-FILE-001
```

### Given

ManagedFile staged，remote upload 注入 503。

### When

FileJob executes。

### Then

```text
job.status == failed OR blocked_provider_unavailable according to normalized cause
managedFile still resolvable == true
local jobId unchanged
```

### Oracle

```text
managed file existence == true
job identity unchanged
```

### Evidence

```text
test id: TEST-A-FAIL-002
```

---

## A-FAIL-003 — Main Restart Reconcile

### Requirement Refs

```text
REQ-JOB-001
```

### Given

local job running，remote ingestion id 已持久化。

### When

Main 在 processing 中重启。

### Then

启动后读取 remote job 并恢复映射状态；不得直接 completed。

### Oracle

```text
same local jobId
remote lookup count >= 1
completed only if remote active
```

### Evidence

```text
test id: TEST-A-FAIL-003
```

---

# 28. Release Gate

状态：

```text
PASS
FAIL
SKIPPED
BLOCKED
```

规则：

```text
SKIPPED != PASS
BLOCKED != PASS
```

Required Acceptance：

```text
A-ARCH-001
A-ARCH-002
A-API-001
A-API-002
A-API-003
A-API-004
A-UI-001
A-UI-002
A-UI-003
A-ROUTE-001
A-FILE-001
A-FILE-002
A-JOB-001
A-JOB-002
A-STATE-001
A-SEC-001
A-OBS-001
A-NEG-001
A-NEG-002
A-NEG-003
A-NEG-004
A-FAIL-001
A-FAIL-002
A-FAIL-003
```

任意 Required Acceptance：

```text
status != PASS
```

则：

```text
Release Gate = FAIL
process exit != 0
```

---

# 29. Plan Generation Contract

只有：

```text
status = APPROVED_FOR_PLAN
```

才允许生成 `.plan.md`。

Plan MUST 按以下顺序覆盖：

```text
1. Contract consumer lock / grounding
2. typed Base facade contract
3. Main HTTP Provider
4. provider/mock capability semantics
5. feature extraction
6. Bases List layout
7. shared AppModal panel regression
8. Create Base
9. Base Detail / SourceFile
10. Update/Delete
11. Base-scoped route to Uploads
12. Managed File + FileJob real upload executor
13. remote ingestion reconcile/retry/cancel
14. Global/Base snapshot unification
15. security/observability
16. synthetic acceptance
17. real 4580 Golden Consumer acceptance
18. evidence + release gate
```

每个 Plan Todo MUST 提供：

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
status:
evidence:
```

`implemented` 与 `verified` MUST 分离。

---

# 30. Code Review Contract

Review MUST 依次检查：

```text
1. REQ 是否实现
2. Knowledge Service / FileJob SOT 是否被破坏
3. Page -> Feature -> Transport boundary 是否保持
4. typed contract 是否匹配 frozen frontend contract
5. provider failure 是否 fail-closed
6. CRUD failure/uncertain outcome 是否 reconcile
7. FileJob 是否单一状态源
8. token/path 是否越过 IPC boundary
9. Modal shared primitive 是否回归通过
10. AC / Evidence 是否有效
11. Golden Consumer 是否真实跑通
12. Code quality
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
[x] 所有关键持久状态有 SOT
[x] remote business state / local job state / renderer projection 分离
[x] State transition 明确
```

## Semantics

```text
[x] Create UI default 明确
[x] Base status mutation gate 明确
[x] FileJob one-job-one-file 语义明确
[x] provider/mock fallback 明确
[x] conflict 行为明确
[x] identity 明确
```

## Side Effects

```text
[x] 每个 mutation operation 有 mutation contract
[x] Renderer read/projection 与 Main mutation boundary 可验证
```

## Failure

```text
[x] CRUD failure 有 error semantics
[x] uncertain mutation 有 reconcile
[x] File upload failure 保留 retry source
[x] restart 有 reconcile
```

## Acceptance

```text
[x] 每个 MUST 类能力映射 AC
[x] MUST NOT 有 Negative AC
[x] mutation/upload 有 failure injection
[x] 高风险输入有 matrix
[x] Oracle 可机器判断
```

## Evidence

```text
[x] required AC 有 Evidence contract
[x] Evidence 绑定 repo commit
[x] Evidence 绑定 external contract identity
[x] BLOCKED/SKIPPED 不算 PASS
```

## Plan Readiness

```text
[x] 本文未保留实施语义占位符
[x] Traceability 已建立
[ ] 人工 Review 完成
[ ] status 更新为 APPROVED_FOR_PLAN
```

当前结论：

```text
PRD_CONTENT_READY_FOR_REVIEW
PLAN_GENERATION_BLOCKED_BY_STATUS
```

---

# 32. Definition of Done

本需求只有同时满足以下条件才算 Done：

```text
[ ] PRD status 已由 REVIEW 更新为 APPROVED_FOR_PLAN 后再生成 Plan
[ ] implementation 基于已 grounded 的 smc-copilot commit
[ ] NodeSKClaw consumer lock 校验通过
[ ] Bases List 使用真实 provider
[ ] Create / Detail / Update / Delete 均调用真实 contract endpoint
[ ] Delete 不再依赖 removedIds 作为 authority
[ ] provider 模式 mutation 不再被 mock-only gate 阻断
[ ] service failure 不回退 mock
[ ] Create Modal geometry/focus/single-submit AC 通过
[ ] Detail 只显示 Documents / Settings
[ ] SourceFile 列表为真实 remote data
[ ] Base Upload 通过 managed picker + knowledgeJobId
[ ] provider upload 不使用 raw input fallback
[ ] Global Uploads 与 Base Upload 使用同一 Main Job Snapshot
[ ] local completed 只在 remote ingestion active 后出现
[ ] retry/cancel/restart reconcile AC 通过
[ ] Renderer 无 Bearer token / absolute path
[ ] Synthetic Acceptance 全 PASS
[ ] Real 4580 Golden Consumer Acceptance 全 PASS
[ ] 所有 Required Acceptance == PASS
[ ] Evidence 完整且绑定 implementation commit
[ ] Release Gate == PASS
```

---

# 33. 最终工程约束摘要

```text
Base business authority      = NodeSKClaw Knowledge Service
Base route authority         = Knowledge route scope
Base UI architecture         = Page -> Feature -> Typed Facade
CRUD transport               = Main-owned HTTP Provider
File source authority        = Managed File Platform
Upload runtime authority     = Main-owned Knowledge FileJob
Remote ingestion authority   = NodeSKClaw IngestionJob
Mock                          = explicit only
Renderer credential          = none
Renderer absolute path       = none
Base Upload job store        = no second store
Completed upload oracle      = remote IngestionJob.status == active
```
