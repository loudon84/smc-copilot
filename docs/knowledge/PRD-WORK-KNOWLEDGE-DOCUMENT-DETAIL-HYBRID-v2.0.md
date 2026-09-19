---
title: "smc-copilot Knowledge DocumentDetail Hybrid v2.0 前端集成方案 PRD"
subtitle: "基于 nodeskclaw-knowledge SourceFile Chunk Thin Gateway v1.0"
prd_id: "PRD-WORK-KNOWLEDGE-DOCUMENT-DETAIL-HYBRID-V2"
version: "2.0"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v5.2"
baseline_commit: "090299c1c3bfa39dab5ec1bd5df67be7ac78032c"
owner: "Work / Knowledge"
reviewers:
  - "Product"
  - "Architecture"
  - "Frontend"
  - "Desktop Main/IPC"
  - "QA"
created_at: "2026-09-19"
updated_at: "2026-09-19"
target_release: "Knowledge DocumentDetail Hybrid v2.0"
change_type:
  - "BROWNFIELD_CHANGE"
  - "ARCHITECTURE_CHANGE"
  - "INTEGRATION"
golden_consumer: "smc-copilot apps/work + nodeskclaw-knowledge SourceFile Chunk API"
related_docs:
  - "需求PRD工程模板.md"
  - "PRD-NODESKCLAW-KNOWLEDGE-CHUNK-THIN-GATEWAY-v1.0.md"
  - "nodeskclaw-knowledge/contracts/frontend/v1.0.0/FRONTEND-INTEGRATION.md"
  - "chunk_thin_gateway_1cdc7c24.plan.md"
supersedes: "PRD-WORK-KNOWLEDGE-DOCUMENT-DETAIL-HYBRID-v1.0.md"
---

# 0. PRD 使用原则

本 PRD 作为 **Human + AI Coding Machine-Executable Engineering Contract**。

规范关键词：

- `MUST`：必须实现、必须测试、必须提供 Evidence。
- `MUST NOT`：违反即 Requirement FAIL。
- `SHOULD`：默认必须满足；偏离必须在 Plan / Review 中记录原因。
- `SHOULD NOT`：原则上禁止；偏离必须记录原因。
- `MAY`：可选，不影响本版本主 Release Gate。

No-Inference Rule：

若 Plan Agent / Coding Agent 无法从本 PRD 唯一确定：

```text
状态事实源
默认值
ownership
identity scope
side effects
failure behavior
rollback / uncertain mutation behavior
conflict resolution
error behavior
acceptance oracle
```

则：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT 自行选择一个“看起来合理”的实现
```

---

# 1. Document Meta / 基线

## 1.1 smc-copilot Baseline

```text
repository:
  loudon84/smc-copilot

branch:
  work/prd-v5.2

baseline commit:
  090299c1c3bfa39dab5ec1bd5df67be7ac78032c
```

Plan 执行前：

```text
MUST compare current HEAD with baseline commit
MUST record changed impacted files
MUST NOT silently execute against another baseline
```

## 1.2 nodeskclaw-knowledge Contract Baseline

本 PRD 的 Chunk 集成契约以 **已完成的 SourceFile Chunk Thin Gateway v1.0 实现定义**为准。

对前端有效的冻结语义：

```text
GET  /api/v1/source-files/{source_file_id}/chunks
     ?page&page_size&keywords

PATCH /api/v1/source-files/{source_file_id}/chunks/{chunk_id}

PATCH body:
{
  "file_version_id": "...",
  "available": true|false
}
```

Contract 规则：

```text
RAGFlow = Chunk SOT
nodeskclaw-knowledge = Thin Gateway
GET 不接收 dataset_id / document_id
GET 不接收历史 file_version_id 作为目标版本
PATCH 必须携带 file_version_id stale guard
PATCH 只修改 available
Provider mutation verb = PATCH
GET permission = FilePermission.read
PATCH permission = FilePermission.update OR KbPermission.manage
page default = 1
page_size default = 50
page_size max = 100
keywords max = 200 and trim
total 由 RAGFlow Provider 返回
Public DTO 不暴露 available_int/provider runtime id/provider URL/API key
```

## 1.3 Source Integrity Note

本 PRD 使用以下 source priority：

```text
1. 用户当前 nodeskclaw-knowledge implementation/workspace contract
2. 已完成 Chunk Thin Gateway implementation plan
3. smc-copilot 当前 GitHub branch source
4. 远端 nodeskclaw frontend contract snapshot
```

若 Plan 执行时本地 `contracts/frontend/v1.0.0/FRONTEND-INTEGRATION.md`
与本 PRD 的 §1.2 有冲突：

```text
MUST report SPEC_SEMANTIC_GAP
MUST NOT 由 smc-copilot 自行适配猜测
```

## 1.4 Grilling Decision Lock (2026-09-19)

Owner grilling 锁定如下；偏离 MUST 记 SPEC_SEMANTIC_GAP 并 BLOCK Plan。

```text
SCOPE
  整包 v2.0 DocumentDetail Hybrid（NAV + 模块拆分 + Chunk IPC/HTTP + 状态机 + Golden live）

REQ-NAV-001 AMENDMENT
  Base Documents 文件表 Actions 列 MUST 提供 [Open]
  fileName MUST 保持静态文本（MUST NOT 可点击）
  Open 仅挂文件表；MUST NOT 要求 Upload drawer 任务行提供 Open
  navigation target 不变：
    page = "documents"
    params.knowledgeBaseId = current Base id
    params.documentId = file.id (= sourceFileId)
  Open 后侧栏落 Documents 模块语境（接受离开 Bases 高亮）
  Back MUST 使用路由栈 onBack()（从 Base Open 进入则回到 Base Detail）
  Base 表 MUST 保留既有 Activate / Reparse / Archive|Unarchive（与 Hybrid Header 双入口可接受）

LAYOUT / RUNTIME UI
  divider resize = MUST；库不可用 → fixed 45/55 仍可用
  split / Chunk pageSize / keywords = 仅当前 DocumentDetail 会话 RUNTIME_STATE
  离开或再进同一文档 MUST 重置：split 45/55、pageSize 50、keywords 空

IPC
  结构化 sanitized Chunk IPC 错误仅强制 listFileChunks / setFileChunkAvailability
  既有非 Chunk Knowledge IPC MUST NOT 被本 PRD 强制全量 retrofit

HYBRID SURFACE
  Hybrid MUST NOT 展示 Knowledge Base Build Index / retrieval-ready
  Build / retrieval-ready 仍仅属 Base Detail
  Chunk Review 门控仍仅由 active version parse 状态决定（见 NON-GOAL-014）

MOCK / GOLDEN
  Work Knowledge 产品路径 MUST NOT 提供或依赖 mock 数据集（含 dataMode=mock 作为 Hybrid 事实源）
  Chunk MUST 仅经 live IPC → nodeskclaw-knowledge
  Golden Consumer MUST 只认 live；假数据 MUST NOT 计为 Golden PASS
  自动化测试 MAY 注入同形状 facade（≠ 产品 mock 集）
  本 PRD MUST NOT 实现新的 Knowledge mock；既有 mock 路径标 deprecated，拆除另项

AVAILABLE NULL
  chunk.available === null → 未知态；MUST 禁用 toggle；MUST NOT PATCH
```

---

# 2. Goal / 一句话目标

让 **smc-copilot Knowledge 用户** 在 Knowledge Base 文件列表中打开任意 SourceFile 后，通过统一的 **DocumentDetail Hybrid 工作台**：

```text
左：FilePreview Framework 源文件预览
右：KnowledgeChunkPanel RAGFlow Chunk 结果
```

完成：

```text
源文件查看
Chunk 浏览
Chunk 搜索
Chunk 分页
Chunk Full/Ellipse 阅读
Chunk available 启停
文件版本切换
Reparse 后 Chunk 刷新
```

同时保证：

```text
smc-copilot MUST NOT 直接调用 RAGFlow
smc-copilot MUST NOT 持有 RAGFlow API Key
smc-copilot MUST NOT 使用 dataset_id/document_id 作为 UI identity
SourceFile.activeVersionId 是文档版本 authority
Chunk Page.fileVersionId 是本次 Chunk 结果的版本证明
PATCH available 必须使用 Chunk Page 返回的 fileVersionId
FilePreview Framework 继续作为唯一 Source Preview 能力
```

---

# 3. Background / Problem

## 3.1 Current State — KnowledgeBaseDetail

当前 `KnowledgeBaseDetailPage.tsx` 已具备：

```text
Knowledge Base detail
Documents / Settings tabs
File list
Activate Version
Reparse
Archive/Unarchive
Build Chunk Index
Retrieval readiness display
Upload drawer
```

但当前文件列表：

```text
fileName = static text
无 Actions [Open]
onNavigate 被命名为 _onNavigate 且未使用
```

因此：

```text
KnowledgeBaseDetail
  └─ Document Row
       └─ 无法进入 DocumentDetail 工作台
```

（Closed by REQ-NAV-001 amendment：Actions `[Open]` → documents + knowledgeBaseId + documentId。）

## 3.2 Current State — KnowledgeDocumentDetail

当前 `KnowledgeDocumentDetailPage.tsx` 已具备：

```text
getFile
listFileVersions
owner KnowledgeBase
Reparse
Archive
Delete
Activate Version
Versions Sheet
Parse Sheet
FilePreview Framework
```

当前布局：

```text
┌──────────────────────────────────────────────┐
│ Back                                         │
├───────────────┬──────────────────────────────┤
│ Metadata      │                              │
│ Actions       │       FilePreview            │
│ Versions      │                              │
│ Parse         │                              │
│ ~30%          │       ~70%                   │
└───────────────┴──────────────────────────────┘
```

当前 `FilePreview` 已使用：

```text
source.type = knowledge
source.id = SourceFile id
source.activeVersionId = SourceFile.activeVersionId
KnowledgeFileProvider.resolveDocumentPreview
```

## 3.3 Current State — Desktop Knowledge Contract

当前：

```text
HermesKnowledgeBasesAPI
```

已经支持 Base / File / Version / Preview / Build，
但没有：

```text
listFileChunks
setFileChunkAvailability
```

Main `knowledge-http-provider.ts` 尚未接入 SourceFile Chunk API。

Main `knowledge-schema.ts` 尚无 Chunk DTO parser。

Preload `knowledge-job-api.ts` 尚未暴露 Chunk IPC。

## 3.4 Problem

### P-001 — Base → Document 导航未闭合

文件存在，但用户不能从 Base Documents Table 打开文档工作台。

### P-002 — Document Detail 不是 Source/Chunk 联合工作台

当前主空间由 Metadata Sidebar 占用，无法比较：

```text
原始文档
VS
解析 Chunk
```

### P-003 — nodeskclaw Chunk 能力尚未接入 Electron IPC

后台已定义 SourceFile Chunk API，但 Desktop 当前合同缺失对应类型/HTTP/IPC/Preload。

### P-004 — IPC 当前会丢失 HTTP/message_key 语义

`knowledge-http-provider` 可获得：

```text
httpStatus
messageKey
retryable
```

但 `register-knowledge-base-ipc.ts` 当前 `sanitizeIpcError()` 最终抛：

```text
new Error(err.code)
```

Renderer 只能看到通用错误 code。

Chunk PATCH 至少需要区分：

```text
403 forbidden
409 stale version conflict
501 update unsupported
503 provider unavailable / mutation uncertain
```

因此 Chunk IPC MUST 保留 sanitized error shape。

### P-005 — Source/Chunk 可能版本错配

Chunk GET 返回：

```text
file_version_id
```

若与：

```text
SourceFile.active_version_id
```

不同，则 Chunk 结果不能作为当前内容显示，也不能执行 PATCH。

### P-006 — Reparse 同一版本时，仅比较 version id 不足以判断 Chunk 是否已刷新

Reparse 可能不改变 activeVersionId。

因此当 active FileVersion：

```text
pending / parsing
```

时 MUST 暂停当前 Chunk 展示并轮询 parse status，直到 terminal。

## 3.5 Impact

```text
业务影响：
- 无法在 smc-copilot 内检查文档解析质量。
- 必须跳出 Desktop 到 RAGFlow 才能检查 Chunk。

工程影响：
- 若前端直接访问 RAGFlow 会破坏 provider abstraction。
- 若不绑定 fileVersionId，Source 与 Chunk 容易错配。

安全影响：
- RAGFlow credential/runtime IDs 必须留在 nodeskclaw 服务端。
- Chunk available mutation 必须通过 server permission。

运维影响：
- RAGFlow 升级应该只影响 nodeskclaw。
- Desktop 应只依赖 frontend contract。

AI Coding 影响：
- 必须提前固定 IPC error semantics、version guard 和 parse polling，
  禁止 Plan Agent 自行猜测。
```

---

# 4. Scope / Non-goal

## 4.1 In Scope

```text
SCOPE-001
KnowledgeBaseDetail 文件名可进入 DocumentDetail。

SCOPE-002
将 KnowledgeDocumentDetailPage 主业务实现打包为
apps/work/components/knowledge/document-detail。

SCOPE-003
DocumentDetail 主体采用 Source Preview + Chunk Panel 双栏 Hybrid。

SCOPE-004
Source Preview 继续复用 FilePreview Framework。

SCOPE-005
扩展 HermesKnowledgeBasesAPI：
listFileChunks
setFileChunkAvailability。

SCOPE-006
Main KnowledgeHttpProvider 接入 nodeskclaw SourceFile Chunk GET/PATCH。

SCOPE-007
Main schema fail-closed parse Chunk contract。

SCOPE-008
Main IPC + Preload 暴露 Chunk API。

SCOPE-009
Chunk IPC 保留 sanitized httpStatus/messageKey/retryable。

SCOPE-010
Chunk Panel 支持：
list/search/page/pageSize/refresh。

SCOPE-011
Chunk Panel 支持 Full Text / Ellipse。

SCOPE-012
Chunk available 可见并在允许状态下可切换。

SCOPE-013
PATCH 必须使用 Chunk Page.fileVersionId。

SCOPE-014
Version mismatch / Reparse / Activate Version 后保证 Source/Chunk 一致。

SCOPE-015
parse pending/parsing 时进行前台 polling。

SCOPE-016
补齐 i18n / tests / evidence。
```

## 4.2 Out of Scope

```text
NON-GOAL-001
MUST NOT iframe RAGFlow UI。

NON-GOAL-002
MUST NOT Renderer 直接 HTTP 调用 RAGFlow。

NON-GOAL-003
MUST NOT Renderer 持有 RAGFlow URL/API Key。

NON-GOAL-004
MUST NOT 让用户输入 dataset_id/document_id。

NON-GOAL-005
MUST NOT 将 dataset_id/document_id 作为 route identity。

NON-GOAL-006
MUST NOT 实现 Chunk Add/Delete。

NON-GOAL-007
MUST NOT 实现 Chunk content 编辑。

NON-GOAL-008
MUST NOT 在 smc-copilot 本地持久化 Chunk content。

NON-GOAL-009
MUST NOT 在 Desktop 做 keyword local filter。

NON-GOAL-010
MUST NOT 在 Desktop rerank Chunk。

NON-GOAL-011
MUST NOT 修改 FilePreview Framework 的 local/url 既有语义。

NON-GOAL-012
MUST NOT 复制 nodeskclaw 的 SourceFile→RAGFlow mapping。

NON-GOAL-013
MUST NOT 使用 localized server `message` 做 UI branching。

NON-GOAL-014
MUST NOT 以 Knowledge Base retrieval readiness 作为 Chunk Review UI
唯一展示前提；Chunk Panel 由 SourceFile active version parse 状态决定。

NON-GOAL-015
MUST NOT 在 DocumentDetail Hybrid 展示或操作 Knowledge Base
Build Chunk Index / retrieval-ready；该能力仅保留在 Base Detail。

NON-GOAL-016
MUST NOT 以 Work Knowledge 产品 mock 数据集（含 dataMode=mock）
作为 DocumentDetail / Chunk / Golden 的事实源或验收替代。
既有 mock 路径视为 deprecated；本 PRD 不负责拆除工程。
```

---

# 5. Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Knowledge Route | KnowledgePages / route scope | documentId/baseId | Screen | 不请求 Chunk |
| Document Screen | KnowledgeDocumentDetailPage | route + facade | DocumentDetail props | 不实现 Chunk UI |
| DocumentDetail | `components/knowledge/document-detail` | file API + ids | workspace | 不访问 HTTP |
| Source Preview | FilePreview Framework | Knowledge source | preview | 不管理 Chunk |
| Chunk UI | KnowledgeChunkPanel | KnowledgeChunkProvider | Chunk list | 不知道 RAGFlow |
| Renderer Chunk Provider | DocumentDetail provider adapter | HermesKnowledgeBasesAPI | typed Promise | 不转换 provider IDs |
| Preload | knowledge-job-api | typed IPC | Renderer API | 不做业务逻辑 |
| Main IPC | register-knowledge-base-ipc | typed request | sanitized result | 不做 HTTP mapping |
| Main HTTP Provider | knowledge-http-provider | SourceFile request | typed domain DTO | 不渲染 UI |
| Schema | knowledge-schema | server JSON | validated DTO | 不修复坏数据 |
| nodeskclaw-knowledge | Thin Gateway | source_file_id | Chunk Contract | 不负责 Desktop UI |
| RAGFlow | Chunk SOT | provider IDs | Chunk state | 不知道 Desktop route |

---

# 6. Terminology / Domain Model

## 6.1 DocumentDetail

smc-copilot Knowledge 文档工作台业务模块。

负责：

```text
Header
Info/Versions/Parse
Source Preview
Chunk Panel
Document actions
Source/Chunk consistency
```

## 6.2 Source Preview

`FilePreview Framework` 对 SourceFile active version 的可视化。

## 6.3 Chunk Page

nodeskclaw GET chunks 返回的单页结果。

必须包含：

```text
source_file_id
file_version_id
items
total
page
page_size
```

## 6.4 Chunk Item

RAGFlow Chunk 的最小 frontend projection：

```text
id
content
available
positions
important_keywords
questions
```

其中：

```text
id = opaque operation token
MUST NOT 作为 UI route identity
```

## 6.5 Current Document Version

Frontend 当前文档版本 authority：

```text
KnowledgeBaseFileSnapshot.activeVersionId
```

## 6.6 Chunk Result Version

Chunk Page authority：

```text
KnowledgeFileChunkPage.fileVersionId
```

## 6.7 Version Match

```text
detail.activeVersionId === chunkPage.fileVersionId
```

只有 Version Match 时：

```text
Chunk Page 可标记 CURRENT
Chunk available PATCH 可执行
```

## 6.8 Parse Ready

当前 active FileVersion：

```text
parseStatus === "active"
```

## 6.9 Chunk Mutation Uncertain

PATCH 请求发送后，无法确定 RAGFlow 是否已提交。

Frontend 行为：

```text
MUST NOT optimistic confirm
MUST refresh Chunk Page
MUST block same item toggle until refresh resolves
```

---

# 7. System Context

## 7.1 Context Diagram

```text
User
  │
  ▼
KnowledgeBaseDetailPage
  │ click SourceFile
  ▼
KnowledgeDocumentDetailPage
  │
  ▼
DocumentDetail Module
  │
  ├─────────────────────────────────────┐
  │                                     │
  ▼                                     ▼
FilePreview Framework            KnowledgeChunkPanel
  │                                     │
  ▼                                     ▼
KnowledgeFileProvider            KnowledgeChunkProvider
  │                                     │
  ▼                                     ▼
resolveDocumentPreview           HermesKnowledgeBasesAPI
                                        │
                                        ▼
                                  Preload / IPC
                                        │
                                        ▼
                               KnowledgeHttpProvider
                                        │
                                        ▼
                              nodeskclaw-knowledge
                                        │
                                        ▼
                                     RAGFlow
```

## 7.2 System Boundary

```text
Inside smc-copilot:
- Base file navigation
- DocumentDetail UI
- FilePreview
- Chunk UI state
- IPC
- HTTP adapter
- schema validation
- sanitized error adaptation

Outside smc-copilot:
- user authorization truth
- SourceFile/Version truth
- Chunk business truth
- RAGFlow provider mapping
```

Trusted：

```text
typed DTO after Main validation
route params after route resolver
```

Untrusted：

```text
nodeskclaw JSON
Chunk content
message_key
query input
```

---

# 8. Authoritative State / SOT

| State | Type | Authoritative? | Writer | Reader | Auto Override |
|---|---|---:|---|---|---:|
| SourceFile | OBSERVED_STATE | YES | nodeskclaw | DocumentDetail | YES |
| activeVersionId | OBSERVED_STATE | YES | nodeskclaw | Preview/Chunk | YES |
| FileVersion.parseStatus | OBSERVED_STATE | YES | nodeskclaw | polling state | YES |
| Preview content | RESOLVED_STATE | YES for preview | FilePreview/Main | UI | YES |
| Chunk content | OBSERVED_STATE | YES | RAGFlow→nodeskclaw | ChunkPanel | YES |
| Chunk available | OBSERVED_STATE | YES | RAGFlow→nodeskclaw | ChunkPanel | YES |
| Chunk page fileVersionId | RESOLVED_STATE | YES for result version | nodeskclaw | ChunkPanel | YES |
| search draft | RUNTIME_STATE | NO | user | UI | YES |
| search effective | RUNTIME_STATE | NO | debounce | provider | YES |
| current page | RUNTIME_STATE | NO | user | UI | YES |
| page size | RUNTIME_STATE | NO | user | UI | YES |
| Full/Ellipse | RUNTIME_STATE | NO | user | UI | YES |
| split ratio | RUNTIME_STATE | NO | user | UI | YES |
| in-flight mutation | RUNTIME_STATE | NO | UI | UI | YES |
| Evidence | EVIDENCE_STATE | YES | tests | reviewer | NO |

Rules：

```text
MUST NOT 用本地 Chunk state 覆盖 server-confirmed available。
MUST NOT 将 chunkPage.fileVersionId 自动重写成 detail.activeVersionId。
MUST NOT 伪造 total。
MUST NOT 从 len(items) 推断 total。
```

---

# 9. State Machine

## 9.1 DocumentDetail

```text
UNINITIALIZED
  ↓
LOADING
  ├─ success → READY
  ├─ 404 → NOT_FOUND
  ├─ capability unavailable → UNAVAILABLE
  └─ error → ERROR

READY
  ├─ activate/reparse/archive → MUTATING
  └─ delete → DELETING

MUTATING
  ├─ success → REFRESHING
  └─ failure → READY + action error

REFRESHING
  ├─ success → READY
  └─ failure → ERROR/READY with isolated error
```

## 9.2 Chunk Panel

```text
IDLE
  │ detail + activeVersion available
  ▼
CHECK_PARSE
  ├─ active → LOADING
  ├─ pending/parsing → WAITING_PARSE
  ├─ failed → PARSE_FAILED
  └─ no active version → EMPTY_VERSION

WAITING_PARSE
  ├─ poll active → LOADING
  ├─ poll failed → PARSE_FAILED
  ├─ superseded/version changed → REFRESH_DOCUMENT
  └─ page leave → STOPPED

LOADING
  ├─ items > 0 → READY
  ├─ items == 0 → EMPTY
  ├─ version mismatch → STALE
  └─ error → ERROR

READY
  ├─ search/page/size/refresh → LOADING
  ├─ available toggle → MUTATING_CHUNK
  ├─ document activeVersion changed → STALE
  └─ reparse → WAITING_PARSE

MUTATING_CHUNK
  ├─ confirmed success → READY
  ├─ 409 → STALE
  ├─ 501 → READ_ONLY_UNSUPPORTED
  ├─ 503/uncertain → VERIFYING
  └─ confirmed failure → READY(T0)

VERIFYING
  └─ refetch → READY/EMPTY/ERROR/STALE
```

Illegal：

```text
MUST NOT STALE → READY without a successful current-version GET。
MUST NOT VERIFYING → success without GET confirmation。
MUST NOT WAITING_PARSE display old items as current。
```

## 9.3 Parse Polling

Deterministic schedule：

```text
0–20 seconds:
  poll every 2 seconds

after 20 seconds:
  poll every 5 seconds

stop when:
  active
  failed
  superseded
  version changes
  component unmounts
  page becomes unavailable
```

Polling target：

```text
listFileVersions(sourceFileId)
```

MUST NOT poll RAGFlow directly。

---

# 10. Data / Schema Contract

## 10.1 Renderer Shared Types

### `KnowledgeFileChunk`

```ts
export interface KnowledgeFileChunk {
  id: string;
  content: string;
  available: boolean | null;
  positions: unknown[] | null;
  importantKeywords: string[];
  questions: string[];
}
```

### `KnowledgeFileChunkPage`

```ts
export interface KnowledgeFileChunkPage {
  sourceFileId: string;
  fileVersionId: string;
  items: KnowledgeFileChunk[];
  total: number;
  page: number;
  pageSize: number;
}
```

### `KnowledgeListFileChunksInput`

```ts
export interface KnowledgeListFileChunksInput {
  sourceFileId: string;
  page?: number;
  pageSize?: number;
  keywords?: string;
}
```

Defaults：

```text
page = 1
pageSize = 50
keywords = undefined
```

Validation：

```text
page >= 1
1 <= pageSize <= 100
trim(keywords).length <= 200
```

### `KnowledgeSetFileChunkAvailabilityInput`

```ts
export interface KnowledgeSetFileChunkAvailabilityInput {
  sourceFileId: string;
  chunkId: string;
  fileVersionId: string;
  available: boolean;
}
```

### `KnowledgeFileChunkAvailabilityResult`

```ts
export interface KnowledgeFileChunkAvailabilityResult {
  sourceFileId: string;
  fileVersionId: string;
  chunkId: string;
  available: boolean;
}
```

## 10.2 HTTP Mapping

### GET

```http
GET /api/v1/source-files/{source_file_id}/chunks
?page={page}
&page_size={pageSize}
&keywords={trimmedKeyword}
```

`keywords` 空字符串时：

```text
MUST omit query parameter
```

### PATCH

```http
PATCH /api/v1/source-files/{source_file_id}/chunks/{chunk_id}
Content-Type: application/json

{
  "file_version_id": "...",
  "available": true
}
```

MUST NOT 发送：

```text
content
positions
important_keywords
questions
available_int
dataset_id
document_id
```

## 10.3 Parser Contract

Main parser MUST：

```text
unwrap ApiResponse.data
validate source_file_id string
validate file_version_id string
validate items array
validate total integer >=0
validate page integer >=1
validate page_size integer 1..100
validate chunk.id non-empty string
validate chunk.content string
validate available boolean|null
validate important_keywords string[]
validate questions string[]
allow positions array|null without semantic transformation
```

Invalid：

```text
→ KNOWLEDGE_CONTRACT_INVALID
→ no partial items returned
```

## 10.4 IPC Error Result

Chunk IPC MUST use structured result：

```ts
export type KnowledgeChunkIpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: KnowledgeFacadeErrorShape };
```

Main：

```text
MUST return sanitized:
code
httpStatus
messageKey
retryable
operationId
```

Preload：

```text
MUST unwrap result
MUST recreate KnowledgeFacadeError in Renderer context
```

MUST NOT return：

```text
localized server message
raw server details containing provider IDs
stack trace
token
```

---

# 11. Requirements

## REQ-NAV-001 — KnowledgeBaseDetail Document Navigation

### Goal

从 Base Documents Table 进入 DocumentDetail。

### Normative Requirement

```text
MUST 恢复 onNavigate 参数（禁止继续以 _onNavigate 丢弃）。
MUST 在 Documents 文件表 Actions 列提供 [Open] 控件。
MUST fileName 保持静态文本（MUST NOT 可点击）。
MUST navigation target:
page = "documents"
params.knowledgeBaseId = current Base id
params.documentId = file.id
MUST 保留现有 Activate/Reparse/Archive actions。
MUST NOT 要求 Upload drawer 任务行提供 Open。
```

### Inputs

```text
detailId
file.id
onNavigate
```

### Preconditions
file.id 非空。

### Authoritative State
route scope。

### State Transition

```text
bases(baseId)
→ documents(baseId, sourceFileId)
```

### Allowed Side Effects
route history push。

### Forbidden Side Effects
点击 Open MUST NOT 修改文件。
点击 fileName MUST NOT 导航或修改文件。

### Ownership Scope
`SECTION`

### Idempotency
重复点击同一文件 Open 产生同一目标。

### Failure Semantics

```text
onNavigate missing:
Open remains non-destructive; no mutation
```

### Postconditions
Document Detail route 可达。
DocumentDetail Back MUST 使用 onBack()（路由栈）。

### Invariants
`documentId == source_file_id`。

### Error Codes
N/A

### Acceptance
`A-NAV-001`

### Evidence
RTL navigation test。

---

## REQ-ARCH-001 — DocumentDetail Module Extraction

### Goal

将当前大体量 Screen 打包成可维护的业务模块。

### Normative Requirement

```text
MUST 创建：
apps/work/components/knowledge/document-detail/

MUST 将以下职责移入模块：
- detail load
- versions/base load
- file actions
- FilePreview workspace
- Chunk workspace
- Info/Versions/Parse Drawer
- parse polling
- Source/Chunk consistency

MUST 让 KnowledgeDocumentDetailPage 只负责：
- useKnowledgeFacade
- route param validation
- capability/presentation
- 注入 API / navigation
```

### Inputs
route IDs + `HermesKnowledgeBasesAPI`。

### Preconditions
Knowledge API available。

### Authoritative State
API state。

### State Transition
Screen-heavy → thin screen + business module。

### Allowed Side Effects
component refactor。

### Forbidden Side Effects

```text
MUST NOT 修改 Knowledge route page IDs。
MUST NOT 把 RAGFlow imports 引入 DocumentDetail。
```

### Ownership Scope
`FILE + MODULE`

### Idempotency
render 无持久副作用。

### Failure Semantics
missing sourceFileId → NOT_FOUND。

### Postconditions
Screen 不含 Chunk item rendering。

### Invariants
DocumentDetail 不知道 provider runtime identity。

### Acceptance
`A-ARCH-001`, `A-ARCH-002`

### Evidence
import boundary test + component test。

---

## REQ-UI-001 — Hybrid Workspace

### Goal

同屏比较原文与 Chunk。

### Normative Requirement

```text
MUST Source Pane + Chunk Pane 同时存在。
MUST default split = 45% / 55%。
MUST 支持 divider resize。
MUST Source Pane min 30%。
MUST Source Pane max 70%。
MUST 左右独立 scroll。
MUST h-full/min-h-0 贯穿 workspace。
```

小窗口 `< 960px`：

```text
MUST fallback vertical stack
Source first
Chunk second
```

### Inputs
viewport + runtime split state。

### Preconditions
Document READY。

### Authoritative State
split = RUNTIME_STATE（仅当前 DocumentDetail 会话）。

### State Transition
drag changes runtime ratio。

### Allowed Side Effects
React state only。

### Forbidden Side Effects
no backend write。
MUST NOT 跨会话持久化 split / pageSize / keywords。

### Ownership Scope
`SECTION`

### Idempotency
re-open default 45/55；pageSize 50；keywords 空。

### Failure Semantics
resize library unavailable → fixed 45/55 still functional。

### Postconditions
两 pane failure isolated。

### Invariants
`INV-UI-001 one pane failure does not unmount the other.`

### Acceptance
`A-UI-001`, `A-UI-002`

### Evidence
component + screenshot。

---

## REQ-UI-002 — Header / Info / Versions / Parse

### Goal

释放主工作区。

### Normative Requirement

Header MUST 提供：

```text
Back
FileName
Status
Info
Versions
Parse
Reparse
Archive/Unarchive
Delete
```

Back MUST 调用路由栈 `onBack()`（MUST NOT 硬编码跳 Documents 列表或 Base Detail）。
Hybrid MUST NOT 展示 Build Chunk Index / retrieval-ready。

Info Drawer MUST 展示：

```text
SourceFile id
owner
createdAt
status
activeVersionId
parseStatus
mimeType
archivedAt
knowledge base
lastError
permission note
```

Versions / Parse MUST 保留现有功能。

### Inputs
detail/versions/ownerBase。

### State
drawer state = RUNTIME_STATE。

### Side Effects
opening drawers = none。

### Forbidden
open drawer MUST NOT reload preview/chunks。

### Acceptance
`A-UI-003`

---

## REQ-PREV-001 — FilePreview Reuse

### Goal

Source Preview 继续走公共 Framework。

### Normative Requirement

```text
MUST import `FilePreview` from @/components/file-preview。
MUST source.type = "knowledge"。
MUST source.id = SourceFile id。
MUST source.activeVersionId = detail.activeVersionId。
MUST keep KnowledgeFileProvider.resolveDocumentPreview。
MUST NOT direct import open-file-viewer/PDF.js in DocumentDetail。
```

### Inputs
detail。

### Preconditions
SourceFile loaded。

### Authoritative State
detail.activeVersionId。

### State Transition
active version / previewEpoch change → new preview resolve。

### Allowed Side Effects
existing preview materialization/cache。

### Forbidden Side Effects
no Chunk mutation。

### Ownership Scope
`SHARED`

### Idempotency
same source/version equivalent preview。

### Failure Semantics
Preview error isolated to Source Pane。

### Postconditions
Chunk Panel still usable.

### Invariants
`INV-PREV-001 Preview failure != Chunk failure.`

### Acceptance
`A-PREV-001`, `A-PREV-002`

---

## REQ-API-001 — Chunk Shared Contract / IPC

### Goal

将 nodeskclaw Chunk API 纳入 `HermesKnowledgeBasesAPI`。

### Normative Requirement

`KNOWLEDGE_BASE_IPC_CHANNELS` MUST 新增：

```ts
listFileChunks: "knowledge-base:list-file-chunks",
setFileChunkAvailability: "knowledge-base:set-file-chunk-availability",
```

`HermesKnowledgeBasesAPI` MUST 新增：

```ts
listFileChunks(
  input: KnowledgeListFileChunksInput
): Promise<KnowledgeFileChunkPage>;

setFileChunkAvailability(
  input: KnowledgeSetFileChunkAvailabilityInput
): Promise<KnowledgeFileChunkAvailabilityResult>;
```

### Inputs
typed contract。

### Preconditions
preload/Main registered。

### State
server authoritative。

### Side Effects
GET none; PATCH upstream available only。

### Forbidden
Renderer HTTP fetch。

### Ownership Scope
`RESOURCE CONTRACT`

### Idempotency
GET idempotent; SET target state idempotent upstream。

### Failure Semantics
structured sanitized error。

### Postconditions
自动化测试 MAY 注入同形状 facade。
产品路径 MUST NOT 依赖 Knowledge mock 数据集。

### Invariants
public types contain no provider runtime IDs。

### Acceptance
`A-API-001`, `A-SEC-001`

---

## REQ-API-002 — Main HTTP Chunk GET

### Goal

调用 nodeskclaw Chunk List。

### Normative Requirement

```text
MUST path exactly：
/api/v1/source-files/{sourceFileId}/chunks

MUST default page=1
MUST default pageSize=50
MUST keywords trim
MUST omit empty keywords
MUST reject pageSize >100 before/at server validation path
MUST use existing AuthorizedTransport
MUST parse fail-closed
```

### Inputs
`KnowledgeListFileChunksInput`

### Preconditions
authenticated Desktop session。

### Authoritative State
nodeskclaw response。

### State Transition
none。

### Allowed Side Effects
network/log only。

### Forbidden
no local filtering/rerank。

### Ownership Scope
`NONE`

### Idempotency
same server state equivalent output。

### Failure Semantics

```text
HTTP 403 → FORBIDDEN
HTTP 404 → NOT_FOUND
HTTP 409 → CONFLICT
HTTP >=500 → UNAVAILABLE
invalid JSON/schema → CONTRACT_INVALID
```

Preserve `httpStatus/messageKey` for Chunk IPC。

### Postconditions
validated DTO only。

### Invariants
`total` MUST equal server total。

### Acceptance
`A-API-002`, `A-API-003`, `A-NEG-001`

---

## REQ-API-003 — Main HTTP Chunk PATCH

### Goal

透传 Chunk available SET。

### Normative Requirement

```text
MUST HTTP method = PATCH。
MUST body exactly include：
file_version_id
available

MUST NOT include Chunk content。
MUST NOT retry non-idempotent network failure automatically
unless transport retry is proven pre-send only。
```

### Inputs
set availability input。

### Preconditions
fileVersionId non-empty。

### Authoritative State
nodeskclaw/RAGFlow。

### State Transition
Chunk available SET。

### Allowed Side Effects
remote available field。

### Forbidden Side Effects
no other field mutation。

### Ownership Scope
`FIELD: available`

### Idempotency
same target bool final state same。

### Failure Semantics

```text
409 → stale
501 → unsupported
503 → unavailable or uncertain; UI must verify via GET
403 → forbidden
```

### Postconditions
return server-confirmed result。

### Invariants
no optimistic confirmation.

### Acceptance
`A-API-004`, `A-TXN-001`, `A-NEG-002`

---

## REQ-IPC-001 — Preserve Sanitized Chunk Error Semantics

### Goal

让 Renderer 能安全区分 Chunk failure path。

### Normative Requirement

Chunk IPC MUST return：

```ts
KnowledgeChunkIpcResult<T>
```

Main error shape MUST preserve：

```text
code
httpStatus
messageKey
retryable
operationId
```

Preload MUST unwrap并在 Renderer 抛 `KnowledgeFacadeError`。

Existing non-Chunk IPC MAY 保持当前行为，本 PRD MUST NOT 强制全量迁移。

### Inputs
KnowledgeFacadeError。

### Preconditions
Chunk IPC handler。

### Authoritative State
Main mapped HTTP error。

### State Transition
Main error → serialized shape → Renderer error。

### Allowed Side Effects
sanitized logs。

### Forbidden

```text
MUST NOT pass Error stack。
MUST NOT pass localized message。
MUST NOT pass raw server body。
```

### Ownership Scope
`CONTRACT`

### Idempotency
N/A。

### Failure Semantics
invalid IPC result → `KNOWLEDGE_CONTRACT_INVALID`。

### Postconditions
UI can inspect status/messageKey。

### Invariants
credential-free。

### Acceptance
`A-IPC-001`, `A-SEC-002`

---

## REQ-CHUNK-001 — Chunk Load / Pagination

### Goal

显示当前 active version 的 Chunk Page。

### Normative Requirement

```text
MUST initial page = 1。
MUST initial pageSize = 50。
MUST page size options = 10,25,50,100。
MUST render server total。
MUST totalPages = max(1, ceil(total/pageSize)) for navigation display。
MUST Refresh trigger same query。
MUST discard response from obsolete request generation。
```

### Inputs
sourceFileId/search/page/pageSize。

### Preconditions
active parseStatus == active。

### Authoritative State
Chunk Page response。

### State Transition
LOADING → READY/EMPTY/STALE/ERROR。

### Allowed Side Effects
GET only。

### Forbidden
local total inference。

### Ownership Scope
`NONE`

### Idempotency
refresh no mutation。

### Failure Semantics
retry button on retryable error。

### Postconditions
items correspond to query generation。

### Invariants
`INV-CHUNK-001 current page version == detail active version.`

### Acceptance
`A-CHUNK-001`, `A-CHUNK-002`, `A-CHUNK-003`

---

## REQ-CHUNK-002 — Chunk Search

### Goal

使用 nodeskclaw/RAGFlow provider-side keyword filter。

### Normative Requirement

```text
MUST search draft separate from effective keywords。
MUST debounce = 300ms。
MUST trim before request。
MUST max 200 characters。
MUST effective keywords change → page reset 1。
MUST NOT local filter items。
```

### Inputs
user input。

### Preconditions
Chunk panel usable。

### State
draft/effective = RUNTIME_STATE。

### State Transition
typing → debounce → effective change → LOADING。

### Side Effects
GET only。

### Forbidden
client content filtering。

### Acceptance
`A-CHUNK-004`, `A-NEG-003`

---

## REQ-CHUNK-003 — Full / Ellipse

### Goal

控制长 Chunk 阅读。

### Normative Requirement

```text
MUST default = Ellipse。
MUST global toolbar toggle Full Text / Ellipse。
MUST Ellipse use 8-line visual clamp。
MUST toggle not modify content object。
```

### Inputs
view mode。

### State
RUNTIME_STATE。

### Side Effects
none。

### Ownership Scope
`NONE`

### Acceptance
`A-CHUNK-005`

---

## REQ-CHUNK-004 — Chunk Item Rendering

### Goal

展示 backend public DTO，不引入 Provider UI。

### Normative Requirement

每个 item MUST：

```text
use chunk.id as React key / operation token only
render content as text
render available:
  true → enabled control
  false → disabled control
  null → Unknown / read-only

render importantKeywords when non-empty
render questions in collapsible metadata when non-empty
MUST NOT interpret positions into page number unless contract later定义语义
MUST NOT display provider IDs
```

Chunk content MUST NOT 使用 `dangerouslySetInnerHTML`。

### Acceptance
`A-CHUNK-006`, `A-SEC-003`

---

## REQ-CHUNK-005 — Available Mutation

### Goal

安全启停 Chunk。

### Normative Requirement

Mutation allowed only if：

```text
chunk.available !== null
chunkPage.fileVersionId === detail.activeVersionId
no same-chunk mutation in flight
Chunk Panel state == READY
probe.mutationsEnabled == true
```

Request MUST：

```text
sourceFileId = detail.id
chunkId = chunk.id
fileVersionId = chunkPage.fileVersionId
available = !chunk.available
```

MUST NOT optimistic update。

Confirmed success：

```text
update only target chunk.available
using server result.available
```

### Inputs
current item + page version。

### Preconditions
above。

### Authoritative State
server result。

### State Transition
READY(T0) → MUTATING → READY(server)。

### Allowed Side Effects
one PATCH。

### Forbidden
content mutation。

### Ownership Scope
`FIELD UI projection`

### Idempotency
server SET semantics。

### Failure Semantics

```text
403:
  preserve T0
  show forbidden

409:
  preserve T0
  mark page STALE
  refresh detail + page

501:
  preserve T0
  set mutation capability read-only for current panel session

503:
  preserve visible T0
  enter VERIFYING
  GET current page before enabling same chunk again
```

### Postconditions
UI never claims unconfirmed state。

### Invariants
`INV-CHUNK-002 mutation request version = page.fileVersionId.`

### Acceptance
`A-CHUNK-007`, `A-TXN-001`, `A-NEG-004`

---

## REQ-STATE-001 — Source / Chunk Version Consistency

### Goal

禁止错版 Chunk。

### Normative Requirement

Chunk GET success 后 MUST 比较：

```text
chunkPage.sourceFileId === detail.id
chunkPage.fileVersionId === detail.activeVersionId
```

Mismatch：

```text
MUST NOT render page as current
MUST set STALE
MUST refresh getFile + listFileVersions once
MUST refetch chunks after current active parse is ready
```

若连续两次 mismatch：

```text
MUST enter ERROR
MUST expose Refresh
MUST NOT infinite loop
```

### Acceptance
`A-STATE-001`, `A-NEG-005`

---

## REQ-STATE-002 — Activate Version Synchronization

### Goal

版本切换后同时刷新 Preview/Chunk。

### Normative Requirement

Activate success：

```text
1. refresh detail
2. refresh versions
3. increment previewEpoch
4. clear current Chunk items
5. inspect new active version parseStatus
6. if active → GET chunks
7. if pending/parsing → WAITING_PARSE
```

MUST NOT 保留旧 Chunk 标记为 current。

### Acceptance
`A-STATE-002`

---

## REQ-STATE-003 — Reparse Synchronization

### Goal

同 activeVersionId reparse 时避免展示旧 Chunk。

### Normative Requirement

Reparse request success：

```text
MUST clear current Chunk current marker
MUST refresh detail/versions
MUST increment previewEpoch
MUST enter CHECK_PARSE/WAITING_PARSE
```

若 active version parseStatus：

```text
pending/parsing → poll
active → load chunks
failed → PARSE_FAILED
superseded → refresh detail
```

MUST NOT 仅以 activeVersionId 未变化判断 Chunk 仍 current。

### Acceptance
`A-STATE-003`, `A-POLL-001`

---

## REQ-POLL-001 — Parse Polling Lifecycle

### Goal

前台感知 reparse / version parsing 完成。

### Normative Requirement

```text
MUST poll listFileVersions。
MUST 0–20s every 2s。
MUST after 20s every 5s。
MUST cancel on unmount。
MUST cancel on terminal parse status。
MUST cancel when sourceFileId changes。
MUST prevent overlapping poll requests。
```

### Side Effects
GET only。

### Acceptance
`A-POLL-001`, `A-NEG-006`

---

## REQ-ERR-001 — Frontend Error Contract

### Goal

符合 nodeskclaw frontend integration error规则。

### Normative Requirement

UI branching priority：

```text
1. operation context
2. httpStatus
3. messageKey when present
4. local sanitized code
```

MUST NOT branch on localized server `message`。

For Chunk PATCH：

```text
403 → FORBIDDEN
409 → STALE
501 → READ_ONLY_UNSUPPORTED
503 → VERIFYING then refetch
```

For GET：

```text
403 → ERROR forbidden
404 → NOT_FOUND/ERROR according document state
409 → WAIT/CONFLICT state
5xx → retryable ERROR
```

### Acceptance
`A-ERR-001`, `A-NEG-007`

---

## REQ-SEC-001 — Provider / Credential Boundary

### Goal

保持 Electron 安全边界。

### Normative Requirement

```text
MUST Renderer only call preload typed API。
MUST Main use KnowledgeAuthorizedTransport。
MUST NOT Renderer receive bearer token。
MUST NOT Renderer receive RAGFlow API Key。
MUST NOT Renderer receive dataset/document runtime IDs。
MUST NOT direct fetch nodeskclaw from DocumentDetail。
MUST treat chunk content as untrusted text。
```

### Acceptance
`A-SEC-001`, `A-SEC-002`, `A-SEC-003`

---

## REQ-OBS-001 — Observability

### Goal

Chunk integration 可定位。

### Normative Requirement

Main Chunk operations MUST log sanitized：

```text
operationId
operation=listFileChunks|setFileChunkAvailability
stage
status/code
httpStatus when available
sourceFileId
page/pageSize for list
keywordsPresent boolean
fileVersionId for mutation
duration if existing logger supports
```

MUST NOT log：

```text
full Chunk content
search keyword text
bearer token
RAGFlow URL/API key
raw error body
```

### Acceptance
`A-OBS-001`

---

# 12. UI Contract

## 12.1 Final Layout

```text
┌──────────────────────────────────────────────────────────────────┐
│ ← Back  FileName [Status] | Info Versions Parse | Reparse ...   │
├───────────────────────────────┬──────────────────────────────────┤
│ SOURCE PREVIEW                │ CHUNK RESULT                     │
│                               │                                  │
│ FilePreview Framework         │ [Ellipse|Full] Search [Refresh]  │
│                               │ Total N  Page x/y  Size 50       │
│                               │                                  │
│                               │ Chunk 1             [On/Off]     │
│                               │ content...                       │
│                               │ keywords...                      │
│                               │                                  │
│ 45% default                   │ 55% default                      │
└───────────────────────────────┴──────────────────────────────────┘
```

## 12.2 Chunk Toolbar

Required：

```text
Ellipse / Full Text
Search input
Refresh
Total
Page size
Prev
Next
Current page
```

## 12.3 Chunk Item

Required：

```text
ordinal
content
available switch/status
importantKeywords when non-empty
questions collapsible when non-empty
```

Not displayed：

```text
dataset id
document id
raw provider URL
raw position structure by default
```

## 12.4 Empty States

```text
No active version
Waiting for parse
Parse failed
No chunks
Search no result
Provider unavailable
Chunk update unsupported
Version stale
```

Each MUST have distinct `data-state` for test Oracle。

---

# 13. Side-Effect Contract

| Operation | Local DB | File | Network | Preview Cache | User Data | Business Source |
|---|---:|---:|---:|---:|---:|---:|
| open DocumentDetail | NO | MAY preview materialization | YES | MAY | NO | NO |
| list chunks | NO | NO | YES | NO | NO | NO |
| search chunks | NO | NO | YES | NO | NO | NO |
| page change | NO | NO | YES | NO | NO | NO |
| Full/Ellipse | NO | NO | NO | NO | NO | NO |
| resize | NO | NO | NO | NO | NO | NO |
| toggle available | NO | NO | YES | NO | YES | YES field |
| activate version | NO local | MAY preview | YES | invalidate | YES | YES |
| reparse | NO local | MAY preview | YES | invalidate | YES | YES |
| parse polling | NO | NO | YES | NO | NO | NO |

GET Chunk is read-only against business state。

---

# 14. Ownership Contract

| Resource | Ownership | Owner |
|---|---|---|
| DocumentDetail module code | FILE | smc-copilot |
| Chunk view state | GENERATED_ONLY | smc-copilot |
| Chunk content | BUSINESS_SOURCE | RAGFlow via nodeskclaw |
| Chunk available | FIELD | RAGFlow via nodeskclaw |
| File active version | BUSINESS_SOURCE | nodeskclaw |
| Preview content | SHARED projection | FilePreview |
| Provider IDs | WHOLE_RESOURCE | nodeskclaw server-side |

Rules：

```text
smc-copilot MUST NOT persist/overwrite Chunk content。
smc-copilot mutation ownership limited to requested available target。
```

Drift：

```text
chunkPage.fileVersionId != detail.activeVersionId
→ BLOCK mutation
→ STALE
→ refresh
```

---

# 15. Identity / Hash Contract

```text
SourceFile UI route identity = sourceFileId
Version identity = activeVersionId/fileVersionId
Chunk id = opaque server operation token
```

Chunk id MAY：

```text
be React key
be PATCH target
```

Chunk id MUST NOT：

```text
be document route id
be citation id
be cross-provider stable identity
```

本版本不新增业务 hash。

---

# 16. Transaction Contract

## 16.1 Chunk Availability Transaction

T0：

```text
last server-confirmed chunk.available
```

Commit：

```text
1. verify current page version match
2. mark item mutating
3. PATCH nodeskclaw
4. receive structured success
5. update target item using response.available
6. mark item ready
```

No optimistic commit。

## 16.2 Confirmed Failure

```text
AfterFailure(visible available) == T0
```

## 16.3 Uncertain Mutation

503/uncertain：

```text
visible available remains T0
state = VERIFYING
same item disabled
GET current page
GET result becomes new SOT
```

MUST NOT issue inverse PATCH。

## 16.4 Transaction Boundary

Includes：

```text
one Chunk available field
```

Excludes：

```text
content
other chunks
SourceFile
FileVersion
Preview
```

---

# 17. Failure Contract

| Condition | UI State | Mutation | Retry |
|---|---|---:|---|
| no active version | EMPTY_VERSION | 0 | after version available |
| parse pending/parsing | WAITING_PARSE | 0 | auto poll |
| parse failed | PARSE_FAILED | 0 | after reparse |
| GET 403 | ERROR/FORBIDDEN | 0 | no automatic |
| GET 404 | ERROR/NOT_FOUND | 0 | manual/detail refresh |
| GET 409 | STALE/CONFLICT | 0 | refresh |
| GET 5xx | ERROR | 0 | manual retry |
| schema invalid | ERROR/CONTRACT_INVALID | 0 | no automatic |
| PATCH 403 | READY + forbidden notice | 0/remote none | no automatic |
| PATCH 409 | STALE | 0 | refresh |
| PATCH 501 | READ_ONLY_UNSUPPORTED | 0 | no retry |
| PATCH 503 | VERIFYING | unknown remote | GET verify |
| Preview failure | Source error | Chunk independent | preview retry |
| Chunk failure | Chunk error | Preview independent | chunk retry |

---

# 18. Conflict Contract

| Conflict | Detection | Behavior | Mutation |
|---|---|---|---:|
| chunk page version stale | page vs detail | BLOCK + refresh | 0 |
| PATCH stale | HTTP 409 | STALE + refresh | server guarantees 0 |
| parse in progress | active version parse status | hide old-current marker | 0 |
| old GET response arrives late | request generation | discard | 0 |
| duplicate toggle | item in-flight | ignore/block | 0 |
| same chunk 503 uncertain | VERIFYING | block until GET | 0 new |
| unsupported mutation | HTTP 501 | read-only panel mutation | 0 |

MUST NOT 使用：

```text
last local writer wins
optimistic overwrite
local merge with stale page
```

---

# 19. Compatibility / Migration

## 19.1 Existing State

Preserve：

```text
Knowledge routes
KnowledgeBaseDetail documents/settings tabs
FilePreview Framework
existing file actions
existing Versions/Parse behavior
existing build/index panel
existing non-Chunk HermesKnowledgeBasesAPI methods
```

## 19.2 Migration Sequence

```text
M1 Add shared Chunk types/channels.
M2 Add schema parser.
M3 Add HTTP provider GET/PATCH.
M4 Add structured Chunk IPC result path.
M5 Add Preload bases methods.
M6 Add renderer KnowledgeChunkProvider.
M7 Build DocumentDetail module.
M8 Wire Base file navigation.
M9 Replace old DocumentDetail Screen body.
M10 Add i18n/tests/evidence.
```

## 19.3 Backward Compatibility

```text
MUST additive extend HermesKnowledgeBasesAPI。
MUST NOT rename old channels。
MUST NOT change FilePreview public source contract。
MUST NOT change Knowledge route page IDs。
```

---

# 20. External Dependency Contract

## 20.1 nodeskclaw-knowledge

Required Contract：

```text
GET /api/v1/source-files/{id}/chunks
PATCH /api/v1/source-files/{id}/chunks/{chunk_id}
```

Required semantics：

```text
RAGFlow SOT
GET source_file_id based
PATCH stale guard
Provider PATCH
Public DTO hides runtime IDs
```

Failure：

```text
fail closed
no direct RAGFlow fallback in Desktop
```

## 20.2 FilePreview Framework

Required：

```text
apps/work/components/file-preview
source type knowledge
```

This PRD MUST NOT replace it。

---

# 21. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| RAGFlow credential exposure | Renderer only via IPC | A-SEC-001 |
| Provider ID exposure | strict parser/public DTO | A-SEC-002 |
| Chunk XSS | text rendering | A-SEC-003 |
| stale mutation | page version guard | A-NEG-004 |
| direct HTTP bypass | static import/fetch check | A-NEG-008 |
| error leakage | structured sanitized IPC | A-IPC-001 |
| local auth inference | server 403 authoritative | A-ERR-001 |
| malicious keyword | max 200 + URLSearchParams | A-CHUNK-004 |

---

# 22. Observability

Chunk operation stages：

```text
RENDER_REQUEST
IPC_INVOKE
HTTP_FETCH
SCHEMA_VALIDATE
IPC_RETURN
RENDER_APPLY
```

Required sanitized metadata：

```text
operationId
operation
sourceFileId
fileVersionId when relevant
page/pageSize
keywordsPresent
status/code
httpStatus
```

Forbidden：

```text
full chunk content
keyword raw text
auth token
provider URL/key
raw backend message
```

---

# 23. Acceptance Design

## A-NAV-001 — Base File Opens DocumentDetail

### Requirement Refs
`REQ-NAV-001`

### Given
Base `B1`, file `F1`。

### When
点击 Actions 列 `Open`（`F1` 行）。

### Then

```json
{
  "page": "documents",
  "params": {
    "knowledgeBaseId": "B1",
    "documentId": "F1"
  }
}
```

### And
`F1.fileName` 保持静态；点击 fileName MUST NOT 触发导航。

### Oracle
callback deepEqual；fileName 无 navigation side effect。

### Evidence
RTL test。

---

## A-ARCH-001 — Thin Screen

Refs: `REQ-ARCH-001`

Given implementation。

When import graph inspected。

Then `KnowledgeDocumentDetailPage` 不 import ChunkList/ChunkItem。

Oracle：forbidden imports = 0。

---

## A-ARCH-002 — DocumentDetail Public Module

Refs: `REQ-ARCH-001`

Then：

```text
@/components/knowledge/document-detail
exports DocumentDetail
```

Oracle：module import test PASS。

---

## A-UI-001 — Hybrid Panes

Refs: `REQ-UI-001`

Then：

```text
document-detail-source-pane = 1
document-detail-chunk-pane = 1
```

---

## A-UI-002 — Resize Has No Backend Mutation

Refs: `REQ-UI-001`

When resize。

Then network/mutation call count = 0。

---

## A-UI-003 — Drawers Preserve Workspace

Refs: `REQ-UI-002`

When Info/Versions/Parse open。

Then both pane testids remain mounted。

---

## A-PREV-001 — FilePreview Knowledge Source

Refs: `REQ-PREV-001`

Oracle：

```text
source.type == knowledge
source.id == file.id
source.activeVersionId == detail.activeVersionId
```

---

## A-PREV-002 — Preview/Chunk Failure Isolation

Refs: `REQ-PREV-001`

Preview fail + Chunk success → Chunk items count >0。

Chunk fail + Preview success → Preview remains mounted。

---

## A-API-001 — Shared API Exposed

Refs: `REQ-API-001`

Oracle：

```text
two channels exist
HermesKnowledgeBasesAPI has two methods
preload bases has two methods
```

---

## A-API-002 — GET Mapping

Refs: `REQ-API-002`

Given page=2/pageSize=50/keywords=" test "。

Then path query：

```text
page=2
page_size=50
keywords=test
```

Oracle exact URLSearchParams。

---

## A-API-003 — GET Parser Preserves Total

Refs: `REQ-API-002`

Given server total=137, items=50。

Then frontend page total=137, items=50。

---

## A-API-004 — PATCH Exact Body

Refs: `REQ-API-003`

Given version V1, available=false。

Then body keys exactly：

```text
file_version_id
available
```

No content fields。

---

## A-IPC-001 — Error Shape Preserved

Refs: `REQ-IPC-001`

Given Main KnowledgeFacadeError：

```text
httpStatus=409
messageKey=<chunk conflict key>
```

When IPC/preload。

Then Renderer catches KnowledgeFacadeError with same status/messageKey and no raw body。

---

## A-CHUNK-001 — Initial Load

Refs: `REQ-CHUNK-001`

Given parseStatus active。

Then first call：

```text
page=1
pageSize=50
keywords undefined
```

---

## A-CHUNK-002 — Pagination

Refs: `REQ-CHUNK-001`

When Next。

Then exactly one request for next page。

---

## A-CHUNK-003 — Old Response Discarded

Refs: `REQ-CHUNK-001`

Given request generation 1 and 2。

When generation 1 returns last。

Then generation 1 items not rendered。

---

## A-CHUNK-004 — Search Debounce

Refs: `REQ-CHUNK-002`

Three keystrokes <300ms → exactly one effective request after 300ms。

201 chars → validation, request count 0。

---

## A-CHUNK-005 — Full/Ellipse No Data Mutation

Refs: `REQ-CHUNK-003`

Toggle mode。

Oracle chunk content deepEqual before/after。

---

## A-CHUNK-006 — Available Null Read-only

Refs: `REQ-CHUNK-004`

`available=null` → no enabled toggle / no mutation path。

---

## A-CHUNK-007 — Confirmed Toggle

Refs: `REQ-CHUNK-005`

T0=true，server result false。

Then target UI false，其他 item unchanged。

---

## A-TXN-001 — 503 Mutation Verify

Refs: `REQ-CHUNK-005`, `REQ-API-003`

PATCH 503：

```text
no inverse PATCH
enter VERIFYING
issue GET
same toggle disabled until GET completes
```

---

## A-STATE-001 — GET Version Mismatch

Refs: `REQ-STATE-001`

detail V2, page V1。

Then：

```text
render current chunks = 0
state = STALE
refresh detail count = 1
```

---

## A-STATE-002 — Activate Version

Refs: `REQ-STATE-002`

V1 → V2 success。

Then Preview V2，Chunk old page removed，new V2 load/wait。

---

## A-STATE-003 — Reparse Same Version

Refs: `REQ-STATE-003`

Reparse V1，activeVersion remains V1，parseStatus=parsing。

Then old V1 Chunk MUST NOT remain current；state WAITING_PARSE。

---

## A-POLL-001 — Parse Polling

Refs: `REQ-POLL-001`

Use fake timers。

Oracle：

```text
2s cadence before 20s
5s cadence after
unmount => no later calls
active => poll stopped
```

---

## A-ERR-001 — No Localized Message Branch

Refs: `REQ-ERR-001`

Static test: UI source has no branching comparison against server localized message。

---

## A-SEC-001 — No Renderer Direct HTTP

Refs: `REQ-SEC-001`

Static scan DocumentDetail/chunks for：

```text
fetch(
axios
RAGFLOW
:9222
/api/v1/datasets/
```

relevant matches = 0。

---

## A-SEC-002 — Provider Fields Rejected/Hidden

Refs: `REQ-SEC-001`

Serialized Renderer DTO keys exclude：

```text
dataset_id
document_id
ragflow_*
available_int
provider_url
api_key
```

---

## A-SEC-003 — Chunk XSS

Refs: `REQ-CHUNK-004`, `REQ-SEC-001`

content `<script>window.X=1</script>`。

Then `window.X` undefined；text remains escaped。

---

## A-OBS-001 — Sanitized Log

Refs: `REQ-OBS-001`

Capture Chunk operation log。

Forbidden secret/content fixtures match count = 0。

---

# 24. Acceptance Input Matrix

| Case | Source | Parse | GET | Page Version | available | Mutation | Expected |
|---|---|---|---|---|---|---|---|
| 1 | active V1 | active | 200 items | V1 | true | none | READY |
| 2 | active V1 | active | 200 empty | V1 | n/a | none | EMPTY |
| 3 | active V1 | parsing | n/a | n/a | n/a | none | WAITING_PARSE |
| 4 | active V1 | failed | n/a | n/a | n/a | none | PARSE_FAILED |
| 5 | active V2 | active | 200 | V1 | true | none | STALE |
| 6 | active V1 | active | 403 | n/a | n/a | none | ERROR |
| 7 | active V1 | active | 503 | n/a | n/a | none | ERROR+Retry |
| 8 | active V1 | active | invalid schema | n/a | n/a | none | CONTRACT_INVALID |
| 9 | active V1 | active | 200 | V1 | null | toggle | blocked |
| 10 | active V1 | active | 200 | V1 | true | PATCH success false | false |
| 11 | active V1 | active | 200 | V1 | true | PATCH 403 | T0 |
| 12 | active V1 | active | 200 | V1 | true | PATCH 409 | STALE |
| 13 | active V1 | active | 200 | V1 | true | PATCH 501 | READ_ONLY |
| 14 | active V1 | active | 200 | V1 | true | PATCH 503 | VERIFYING |
| 15 | active V1 | active | total 137/items50 | V1 | n/a | none | total137 |
| 16 | active V1 | active | malicious content | V1 | n/a | none | escaped |
| 17 | V1 reparse | parsing | old cache exists | V1 | n/a | none | old not current |
| 18 | V1→V2 | active | old request returns late | V1 | n/a | none | discard |

---

# 25. Negative Acceptance

```text
A-NEG-001
GET response total replaced by items.length
→ FAIL

A-NEG-002
PATCH body includes content/keywords/questions/provider fields
→ FAIL

A-NEG-003
Chunk search filters current items locally
→ FAIL

A-NEG-004
toggle allowed when page.fileVersionId != detail.activeVersionId
→ FAIL; mutation call must be 0

A-NEG-005
version mismatch page rendered as current
→ FAIL

A-NEG-006
polling continues after unmount/terminal
→ FAIL

A-NEG-007
UI branches on localized backend message
→ FAIL

A-NEG-008
DocumentDetail directly calls RAGFlow/nodeskclaw HTTP
→ FAIL

A-NEG-009
RAGFlow iframe introduced
→ FAIL

A-NEG-010
old Chunk remains current during reparse parsing
→ FAIL
```

---

# 26. Failure Injection

| Injection Point | Required Postcondition |
|---|---|
| before GET IPC | Chunk ERROR; Preview unaffected |
| after IPC before HTTP | retryable error; no mutation |
| malformed GET JSON | CONTRACT_INVALID; no partial render |
| slow old GET after new query | old result discarded |
| version changes during GET | mismatch → STALE |
| before PATCH | T0 visible |
| PATCH confirmed 403 | T0 visible |
| PATCH 409 | T0 + STALE |
| PATCH 501 | T0 + read-only |
| PATCH timeout/503 | T0 + VERIFYING + GET |
| GET after uncertain returns flipped state | UI adopts GET state |
| reparse response success then poll fails | WAITING/ERROR; old Chunk not current |
| Preview provider fails | Chunk remains independent |
| Chunk provider fails | Preview remains independent |

---

# 27. Evidence Contract

Each Required Acceptance：

```json
{
  "acceptance_id": "A-CHUNK-001",
  "status": "PASS",
  "requirement_ids": ["REQ-CHUNK-001"],
  "test_ids": ["TEST-A-CHUNK-001"],
  "command": "npm test -- ...",
  "exit_code": 0,
  "oracle": {
    "type": "exact_assertion",
    "expected": "...",
    "actual": "..."
  },
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v5.2",
  "commit_sha": "<implementation-sha>",
  "nodeskclaw_contract_version": "frontend/v1.0.0",
  "timestamp": "<ISO8601>",
  "evidence_files": []
}
```

Rules：

```text
Evidence MUST bind implementation commit。
SKIPPED != PASS。
BLOCKED != PASS。
```

Golden Consumer Evidence MUST additionally record：

```text
nodeskclaw endpoint contract revision/commit
real SourceFile id in test environment
active fileVersionId
GET total
PATCH pre/target/post state
cleanup/restoration
```

---

# 28. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test | Evidence | Gate |
|---|---|---|---|---|---|
| REQ-NAV-001 | documentId=sourceFileId | A-NAV-001 | TEST-A-NAV-001 | EVID-A-NAV-001 | REQUIRED |
| REQ-ARCH-001 | provider neutral | A-ARCH-001/002 | TEST-A-ARCH-* | EVID-A-ARCH-* | REQUIRED |
| REQ-UI-001 | pane isolation | A-UI-001/002 | TEST-A-UI-* | EVID-A-UI-* | REQUIRED |
| REQ-UI-002 | workspace mounted | A-UI-003 | TEST-A-UI-003 | EVID-A-UI-003 | REQUIRED |
| REQ-PREV-001 | Preview isolated | A-PREV-001/002 | TEST-A-PREV-* | EVID-A-PREV-* | REQUIRED |
| REQ-API-001 | no provider IDs | A-API-001/A-SEC-001 | TEST-A-API-* | EVID-A-API-* | REQUIRED |
| REQ-API-002 | total server | A-API-002/003/A-NEG-001 | TEST-A-API-* | EVID-A-API-* | REQUIRED |
| REQ-API-003 | field containment | A-API-004/A-TXN-001/A-NEG-002 | TEST-* | EVID-* | REQUIRED |
| REQ-IPC-001 | sanitized error | A-IPC-001/A-SEC-002 | TEST-A-IPC-* | EVID-A-IPC-* | REQUIRED |
| REQ-CHUNK-001 | current version | A-CHUNK-001..003 | TEST-A-CHUNK-* | EVID-A-CHUNK-* | REQUIRED |
| REQ-CHUNK-002 | provider search | A-CHUNK-004/A-NEG-003 | TEST-* | EVID-* | REQUIRED |
| REQ-CHUNK-003 | render-only | A-CHUNK-005 | TEST-A-CHUNK-005 | EVID-* | REQUIRED |
| REQ-CHUNK-004 | text-safe | A-CHUNK-006/A-SEC-003 | TEST-* | EVID-* | REQUIRED |
| REQ-CHUNK-005 | no optimistic | A-CHUNK-007/A-TXN-001/A-NEG-004 | TEST-* | EVID-* | REQUIRED |
| REQ-STATE-001 | version match | A-STATE-001/A-NEG-005 | TEST-* | EVID-* | REQUIRED |
| REQ-STATE-002 | activate refresh | A-STATE-002 | TEST-A-STATE-002 | EVID-* | REQUIRED |
| REQ-STATE-003 | reparse stale | A-STATE-003/A-NEG-010 | TEST-* | EVID-* | REQUIRED |
| REQ-POLL-001 | polling stop | A-POLL-001/A-NEG-006 | TEST-* | EVID-* | REQUIRED |
| REQ-ERR-001 | no localized msg | A-ERR-001/A-NEG-007 | TEST-* | EVID-* | REQUIRED |
| REQ-SEC-001 | no direct provider | A-SEC-001..003/A-NEG-008/009 | TEST-* | EVID-* | REQUIRED |
| REQ-OBS-001 | sanitized log | A-OBS-001 | TEST-A-OBS-001 | EVID-* | REQUIRED |

---

# 29. File Change Contract

## 29.1 New Files

```text
apps/work/components/knowledge/document-detail/
├── index.ts
├── DocumentDetail.tsx
├── DocumentDetailHeader.tsx
├── DocumentDetailWorkspace.tsx
├── DocumentInfoDrawer.tsx
├── DocumentVersionsDrawer.tsx
├── DocumentParseDrawer.tsx
├── types.ts
├── providers/
│   └── KnowledgeChunkProvider.ts
├── chunks/
│   ├── KnowledgeChunkPanel.tsx
│   ├── KnowledgeChunkToolbar.tsx
│   ├── KnowledgeChunkList.tsx
│   ├── KnowledgeChunkItem.tsx
│   ├── useKnowledgeChunks.ts
│   └── chunk-view-state.ts
└── __tests__/
    ├── DocumentDetail.test.tsx
    ├── KnowledgeChunkPanel.test.tsx
    └── KnowledgeChunkProvider.test.ts
```

## 29.2 Modified Files — Renderer

```text
apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeBaseDetailPage.tsx
```

Changes：

```text
_onNavigate → onNavigate
Actions 列增加 [Open]
fileName 保持静态
navigate documents + baseId + documentId
保留 Activate / Reparse / Archive|Unarchive
```

```text
apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentDetailPage.tsx
```

Changes：

```text
become thin adapter
render DocumentDetail
remove inline sidebar/workspace implementation
```

Potential i18n resource files：

```text
existing knowledge locale dictionaries
```

Add keys for：

```text
chunkResult
searchChunks
fullText
ellipse
refresh
total
page
pageSize
waitingParse
parseFailed
noChunks
versionStale
availabilityUnknown
chunkMutationUnsupported
chunkMutationVerifying
```

## 29.3 Modified Files — Shared

```text
apps/work/src/shared/knowledge/knowledge-base-ipc.ts
```

Add：

```text
Chunk types
Chunk inputs/results
2 IPC channels
HermesKnowledgeBasesAPI methods
KnowledgeChunkIpcResult
```

```text
apps/work/src/shared/knowledge/knowledge-errors.ts
```

MAY add Chunk-safe helper if needed to rebuild sanitized error from shape。
MUST NOT change existing generic code semantics without regression tests。

## 29.4 Modified Files — Main

```text
apps/work/src/main/knowledge/knowledge-http-provider.ts
```

Add：

```text
listFileChunks
setFileChunkAvailability
```

```text
apps/work/src/main/knowledge/knowledge-schema.ts
```

Add：

```text
parseKnowledgeFileChunk
parseKnowledgeFileChunkPage
parseKnowledgeFileChunkAvailabilityResult
```

```text
apps/work/src/main/knowledge/register-knowledge-base-ipc.ts
```

Add two handlers using structured Chunk result。

## 29.5 Modified Files — Preload

```text
apps/work/src/preload/knowledge-job-api.ts
```

Add：

```text
bases.listFileChunks
bases.setFileChunkAvailability
```

using structured-result unwrap。

If `index.d.ts` declares Knowledge surface separately，MUST update type declaration consistently。

## 29.6 FilePreview

Default：

```text
MUST NOT modify apps/work/components/file-preview/*
```

若 implementation 发现必须变更：

```text
MUST add new Requirement + Acceptance before code change
```

---

# 30. Test Contract

Required test layers：

```text
Shared contract tests
Schema parser tests
KnowledgeHttpProvider tests
IPC handler tests
Preload bridge tests
DocumentDetail component tests
ChunkPanel hook/component tests
KnowledgeBaseDetail navigation test
Security static tests
Golden Consumer integration test
```

Golden Consumer flow：

```text
MUST 仅在 live nodeskclaw-knowledge 环境执行
MUST NOT 使用 Work Knowledge mock 数据集计 PASS

1. Open Knowledge Base
2. Click Actions [Open] on real SourceFile
3. Verify FilePreview loads
4. Verify Chunk GET total/items
5. Search real keyword
6. Toggle a disposable Chunk available
7. Verify server result reflected
8. Restore original available
9. Reparse test file
10. Verify WAITING_PARSE → READY
11. Verify old Chunk never marked current during reparse
```

---

# 31. Release Gate

Required：

```text
A-NAV-001
A-ARCH-001
A-ARCH-002
A-UI-001
A-UI-002
A-UI-003
A-PREV-001
A-PREV-002
A-API-001
A-API-002
A-API-003
A-API-004
A-IPC-001
A-CHUNK-001
A-CHUNK-002
A-CHUNK-003
A-CHUNK-004
A-CHUNK-005
A-CHUNK-006
A-CHUNK-007
A-TXN-001
A-STATE-001
A-STATE-002
A-STATE-003
A-POLL-001
A-ERR-001
A-SEC-001
A-SEC-002
A-SEC-003
A-OBS-001
A-NEG-001
A-NEG-002
A-NEG-003
A-NEG-004
A-NEG-005
A-NEG-006
A-NEG-007
A-NEG-008
A-NEG-009
A-NEG-010
```

Rule：

```text
any Required Acceptance != PASS
→ Release Gate FAIL
→ process exit != 0

SKIPPED != PASS
BLOCKED != PASS
```

---

# 32. Plan Generation Gate

Current：

```text
status = APPROVED_FOR_PLAN
```

Owner grilling 已完成（§1.4）。可生成 `.plan.md`。
（本会话明确要求：先不生成 plan，待用户另行指示。）

Plan Agent MUST NOT redefine：

```text
Chunk API paths
HTTP verbs
page/pageSize defaults
keywords max length
RAGFlow SOT
GET/PATCH permission semantics
activeVersion authority
PATCH fileVersionId source
no optimistic mutation
503 verify behavior
parse polling schedule
module path
45/55 layout
```

Todo format：

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

---

# 33. PRD Quality Gate

## Architecture

```text
[x] Goal 唯一明确
[x] Scope / Non-goal 完整
[x] Owner 不重叠
[x] System Boundary 明确
```

## State

```text
[x] 所有持久状态有 SOT
[x] Observed / Resolved / Runtime / Evidence 分离
[x] State transition 明确
```

## Semantics

```text
[x] default 行为明确
[x] required / optional 明确
[x] conflict behavior 明确
[x] ownership 明确
[x] identity 明确
```

## Side Effects

```text
[x] 每个 operation 有 contract
[x] read-only Chunk GET 可证明
```

## Failure

```text
[x] failure behavior 明确
[x] mutation uncertain recovery 明确
[x] retry/non-retry 明确
```

## Acceptance

```text
[x] MUST → AC
[x] MUST NOT → Negative AC
[x] mutation → failure injection
[x] high risk → matrix
[x] Oracle machine-readable
```

## Evidence

```text
[x] required AC evidence schema
[x] commit-bound
[x] BLOCKED/SKIPPED != PASS
[x] Release Gate exit contract
```

## Plan Readiness

```text
[x] 无 TBD
[x] Traceability 完整
[x] 当前语义无 SPEC_SEMANTIC_GAP
[x] status = APPROVED_FOR_PLAN
[x] §1.4 Grilling Decision Lock 已写入
```

---

# 34. Definition of Done

```text
[ ] KnowledgeBaseDetail Actions [Open] 可打开 DocumentDetail（fileName 静态）
[ ] KnowledgeDocumentDetailPage 已变成 thin route/facade adapter
[ ] DocumentDetail 模块位于 apps/work/components/knowledge/document-detail
[ ] Source Preview 完全复用 FilePreview Framework
[ ] Chunk Panel 接入 nodeskclaw SourceFile Chunk API
[ ] GET page=1/pageSize=50 默认正确
[ ] keywords trim/max200/debounce300 正确
[ ] total 使用 backend total
[ ] no local keyword filter
[ ] Full/Ellipse 不修改数据
[ ] available=null 为 read-only
[ ] PATCH body only file_version_id + available
[ ] PATCH 使用 Chunk Page.fileVersionId
[ ] no optimistic available commit
[ ] 409 → STALE + refresh
[ ] 501 → read-only unsupported
[ ] 503 → VERIFYING + GET
[ ] activeVersion/pageVersion mismatch 不渲染 current
[ ] activate version 同步刷新 Preview/Chunk
[ ] reparse 同版本期间旧 Chunk 不标记 current
[ ] parse polling deterministic + unmount cancel
[ ] IPC 保留 httpStatus/messageKey/retryable
[ ] Renderer 不直接 HTTP
[ ] Renderer 不包含 RAGFlow credential/runtime IDs
[ ] Chunk content escaped
[ ] Preview/Chunk failure isolation
[ ] existing Knowledge regression tests PASS
[ ] Golden Consumer PASS
[ ] Required Acceptance 全部 Evidence PASS
[ ] Release Gate PASS
```

---

# 35. Final Architecture

```text
                 KnowledgeBaseDetailPage
                          │
                    click SourceFile
                          │
                          ▼
              KnowledgeDocumentDetailPage
                    route / facade
                          │
                          ▼
                   DocumentDetail
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
    FilePreview Framework       KnowledgeChunkPanel
            │                           │
    KnowledgeFileProvider       KnowledgeChunkProvider
            │                           │
            │                           ▼
            │                  HermesKnowledgeBasesAPI
            │                           │
            │                           ▼
            │                     Preload / IPC
            │                           │
            │                           ▼
            │                KnowledgeHttpProvider
            │                           │
            │                           ▼
            │                  nodeskclaw-knowledge
            │                      Thin Gateway
            │                           │
            ▼                           ▼
     Source Preview                RAGFlow Chunk
```

稳定职责：

```text
smc-copilot:
- Source preview UX
- Chunk review UX
- UI version consistency
- typed IPC / schema validation

nodeskclaw-knowledge:
- authentication / authorization
- active version mapping
- provider mapping
- thin API normalization
- RAGFlow mutation forwarding

RAGFlow:
- Chunk creation
- Chunk content
- provider search
- pagination/total
- Chunk available state
```

最终原则：

> **smc-copilot 只消费 SourceFile Chunk Contract；nodeskclaw-knowledge 负责可信网关；RAGFlow 始终保持 Chunk SOT。**
