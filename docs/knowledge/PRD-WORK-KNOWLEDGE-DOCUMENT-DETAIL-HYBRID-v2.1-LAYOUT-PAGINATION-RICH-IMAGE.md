---
title: "smc-copilot Knowledge DocumentDetail Hybrid v2.1 Layout + Pagination + Rich Chunk/Image 方案 PRD"
prd_id: "PRD-WORK-KNOWLEDGE-DOCUMENT-DETAIL-HYBRID-V2.1"
version: "2.1"
status: "APPROVED_FOR_PLAN"
template_version: "需求PRD工程模板 v1.0"
product: "smc-copilot Desktop / apps/work"
repository: "loudon84/smc-copilot"
branch: "work/prd-v6.2"
baseline_commit: "e098f3f0c1bb09d80706fc4ded7122b68e55fb1d"
owner: "Work / Knowledge"
reviewers: ["Product", "Architecture", "Frontend", "Desktop Main/IPC", "Security", "QA"]
created_at: "2026-09-20"
updated_at: "2026-09-20"
target_release: "DocumentDetail Hybrid v2.1"
change_type: ["BROWNFIELD_CHANGE", "BUGFIX", "INTEGRATION"]
golden_consumer: "apps/work DocumentDetail + live nodeskclaw-knowledge Chunk Gateway v1.1 + live RAGFlow"
related_docs:
  - "需求PRD工程模板.md"
  - "PRD-WORK-KNOWLEDGE-DOCUMENT-DETAIL-HYBRID-v2.0.md"
  - "documentdetail_hybrid_1a321216.plan.md"
  - "nodeskclaw-knowledge Chunk Gateway v1.1 PRD"
supersedes: "PRD-WORK-KNOWLEDGE-DOCUMENT-DETAIL-HYBRID-v2.0.md"
---

# 0. PRD 使用原则

本 PRD 严格按《需求PRD工程模板.md》输出，作为 Human + AI Coding 的 Machine-Executable Engineering Contract。

## 0.1 强制关键词

`MUST / MUST NOT / SHOULD / SHOULD NOT / MAY` 按模板定义。所有 `MUST / MUST NOT` MUST 映射至少一个 Acceptance。

## 0.2 No-Inference Rule

若 Plan/Coding Agent 无法唯一确定 SOT、default、selection semantics、ownership、identity scope、side effects、rollback、conflict、error 或 acceptance oracle：

```text
MUST report SPEC_SEMANTIC_GAP
MUST BLOCK plan generation
MUST NOT 自行补全
```

## 0.3 Source Integrity Gate

本 PRD 基于：

```text
smc-copilot work/prd-v6.2 @ e098f3f0...
当前 DocumentDetail/HybridSplit/KnowledgeChunkPanel/useKnowledgeChunkPanel 源码
已完成 documentdetail_hybrid_1a321216.plan.md
nodeskclaw-knowledge v1.0 Chunk Thin Gateway 语义
本轮 nodeskclaw v1.1 pagination + image public contract
```

在 `APPROVED_FOR_PLAN` 前 MUST 验证实际 nodeskclaw `FRONTEND-INTEGRATION.md` 已包含 v1.1 `has_image + image endpoint`。若未包含，smc PRD 保持 REVIEW，不能由前端猜测 Provider 字段。

**Gate result (2026-09-20)：** Owner 指定本地合同路径  
`E:\git\nodeskclaw2\nodeskclaw-knowledge\contracts\frontend\v1.0.0`  
已验证 `FRONTEND-INTEGRATION.md` / OpenAPI / schema / TS 含 `has_image` 与  
`GET /api/v1/source-files/{id}/chunks/{chunk_id}/image?file_version_id=`。  
包目录标签仍为 `1.0.0`，以**内容**为 SOT（见 §1.3）。Gate **PASS**。

# 1. 文档元数据 / 源码基线

## 1.1 Repository Baseline

```text
repository: loudon84/smc-copilot
branch: work/prd-v6.2
HEAD: e098f3f0c1bb09d80706fc4ded7122b68e55fb1d
```

## 1.3 Grilling Decision Lock (2026-09-20)

Owner grilling 已确认 shared understanding。偏离 MUST 记 `SPEC_SEMANTIC_GAP` 并 BLOCK Plan。

```text
SCOPE
  整包 SCOPE-001…012 一次落地（Layout + Pagination + Rich + Image）

RELATION TO v2.0
  REPLACE：本 PRD supersedes v2.0；v2.1 为唯一现行 Hybrid 工程合同
  继承 v2.0 grilling 硬锁：
    无产品 mock Chunk / Golden 只认 live
    Base Actions [Open]；fileName 静态
    Back = onBack()
    Hybrid 不展示 Build/retrieval-ready
    available === null → 禁 PATCH
    runtime UI 仅会话内；再进重置
  v2.1 显式覆盖：
    default split Source 42% / Chunk 58%（clamp 30..70；失败固定 42/58）
    UI default pageSize = 10（options 10/25/50/100；显式发送 pageSize）

CONTRACT SOT
  本地路径：E:\git\nodeskclaw2\nodeskclaw-knowledge\contracts\frontend\v1.0.0
  FRONTEND-INTEGRATION.md + schemas/openapi/typescript 为 Chunk list/image 权威
  包标签可为 1.0.0；不得因文件夹名缺少 “1.1” 而猜测字段

HAS_IMAGE PARSE
  字段缺失 → hasImage = false
  存在但非 boolean → KNOWLEDGE_CONTRACT_INVALID（整页 ERROR）

IMAGE IPC
  getFileChunkImage 使用与 listFileChunks 同形结构化 envelope
  （KnowledgeChunkIpcResult 或等价 {ok,data|error}，含 httpStatus）
  preload unwrap → Renderer KnowledgeFacadeError
  MUST NOT 仅 throw Error(code)

IMAGE UX
  MUST NOT 实现 click-to-expand Dialog（MAY 保留为 post-v2.1）
  Ellipse 与 Full 均可 IntersectionObserver lazy 加载图片
  全局最多 3 个 in-flight image IPC；其余排队
  缩略图 128×120 object-fit contain；失败隔离文本

RICH CONTENT
  DOMParser + allowlist（REQ-RICH-001）
  无合法 structural 节点或 parse fail → 整段 PlainText
  MUST NOT dangerouslySetInnerHTML；MUST NOT content 内 <img>

GOVERNANCE
  status = APPROVED_FOR_PLAN
  本轮会话明确：先落盘 Decision Lock，不自动生成 .plan.md（待用户另行指示）
```

## 1.2 Current Source Facts

### Thin Screen 已成立

`KnowledgeDocumentDetailPage.tsx` 当前仅负责 facade/route 注入并渲染 `<DocumentDetail />`。

### DocumentDetail 已模块化

当前目录：

```text
apps/work/components/knowledge/document-detail/
  DocumentDetail.tsx
  HybridSplit.tsx
  KnowledgeChunkPanel.tsx
  useKnowledgeChunkPanel.ts
  useKnowledgeChunkPanel.test.ts
```

### HybridSplit 当前行为

```text
default sourcePercent = 45
clamp 30..70
pointer drag divider
<960px stacked
```

### KnowledgeChunkPanel 当前行为

```text
Refresh / Ellipse / Full
Search
Page size default 50
Total
<pre> plain-text Chunk rendering
Available + Toggle button
pagination footer after list
```

### Hook 当前行为

```text
pageIndex/pageSize/search debounce
GET listFileChunks
only validates result.fileVersionId == activeVersionId
pageSize options 10/25/50/100
PATCH available state machine
```

### Shared Contract 当前缺口

`KnowledgeFileChunk` 当前只有：

```text
id
content
available
positions
importantKeywords
questions
```

无 `hasImage`，无 Chunk image IPC。

### Test Gap

现有 Chunk hook/http tests 主要证明单页 `total=1/page=1/pageSize=50`；未证明真实 multi-page 行为，也未覆盖图片。

# 2. 一句话目标

让 Knowledge 用户在 DocumentDetail 中以更接近“文档解析工作台”的结构，同时阅读 Source File 与 RAGFlow Chunk，能够稳定分页、搜索、查看结构化表格/文本和 Chunk 图片，并安全切换 available；同时保证 Source Preview 继续复用 FilePreview、Desktop 不接触 RAGFlow identity/credential、所有 Chunk 数据只来自 nodeskclaw SourceFile Contract。

# 3. 背景与问题定义

## 3.1 Current State

当前页面已实现 v2.0 主架构：

```text
KnowledgeDocumentDetailPage
→ DocumentDetail
   ├─ FilePreview
   └─ KnowledgeChunkPanel
```

截图显示 Source Preview 可正常显示 PDF；Chunk 右栏能显示文本与 available。

## 3.2 Problem

### P-001 Layout 信息层级偏“功能堆叠”

Header 同时出现 Back、标题、状态、Info、Versions、Parse、Reparse、Archive、Delete；Chunk toolbar 分为多行，占用阅读空间。

### P-002 pageSize=50 掩盖分页行为

当 total=11、pageSize=50 时 `Page 1/1` 是数学正确结果，但用户无法直观验证分页；同时当前 tests 未证明 page2 请求/响应一致性。

### P-003 Hook 缺少完整 Page Contract 校验

当前仅比较 `fileVersionId`；若 backend 错误返回：

```text
sourceFileId mismatch
page mismatch
pageSize mismatch
```

前端可能静默接受并计算错误 totalPages。

### P-004 Chunk content 被 `<pre>` 当纯文本

RAGFlow Chunk 中 `<table>...</table>` 等结构被原样显示，导致横向溢出和可读性差。

### P-005 Chunk 图片 Contract 不存在

前端无 `hasImage`、无图片 authenticated fetch/IPC、无 Blob lifecycle，因此不能达到 RAGFlow 图文 Chunk 体验。

### P-006 图片与 Rich Content 不能通过“不安全 HTML”补丁解决

禁止直接 `dangerouslySetInnerHTML`，禁止从 content 内的 `<img src=RAGFlow...>` 绕过 Gateway。

## 3.3 Impact

```text
业务：原文与 Chunk 比较效率低，图表类文档关键上下文缺失。
工程：分页 bug 难定位，Rich Content 无稳定 renderer owner。
安全：直接 HTML/image URL 可能产生 XSS、credential/provider coupling。
运维：RAGFlow 变化必须继续隔离在 nodeskclaw。
AI Coding：若 renderer allowlist/image lifecycle/page invariant 不冻结，Agent 会自行选择。
```

# 4. Scope

## 4.1 In Scope

```text
SCOPE-001 DocumentDetail Header/Workspace 布局优化。
SCOPE-002 default split 42/58，保留 30..70 drag。
SCOPE-003 Chunk panel 固定 Header/Search/List/Footer 信息结构。
SCOPE-004 frontend default pageSize 10，options 10/25/50/100。
SCOPE-005 强化 Chunk page contract validation。
SCOPE-006 multi-page UI + provider tests。
SCOPE-007 Safe Chunk Rich Content Renderer（text/table/list/code）。
SCOPE-008 KnowledgeFileChunk 增加 hasImage。
SCOPE-009 Main/IPC/Preload 新增 getFileChunkImage。
SCOPE-010 Chunk image lazy load + Blob URL lifecycle。
SCOPE-011 Image per-card failure isolation。
SCOPE-012 i18n/tests/evidence/golden。
```

## 4.2 Out of Scope

```text
NON-GOAL-001 MUST NOT 修改 FilePreview Framework 语义。
NON-GOAL-002 MUST NOT iframe RAGFlow。
NON-GOAL-003 MUST NOT Renderer 直接 fetch RAGFlow/nodeskclaw。
NON-GOAL-004 MUST NOT 接触 image_id/img_id/dataset_id/document_id。
NON-GOAL-005 MUST NOT Chunk Add/Delete/content edit。
NON-GOAL-006 MUST NOT local keyword filter/rerank。
NON-GOAL-007 MUST NOT persist Chunk/image bytes 到业务 DB。
NON-GOAL-008 MUST NOT render `<img>` embedded in chunk.content。
NON-GOAL-009 MUST NOT unsanitized `dangerouslySetInnerHTML`。
NON-GOAL-010 MUST NOT 将 positions 猜成 page number。
```

## 4.3 Architecture Boundary

| Domain | Owner | Input | Output | 不负责 |
|---|---|---|---|---|
| Route Page | Knowledge screen | route/facade | DocumentDetail | Chunk rendering |
| DocumentDetail | Work module | file state | workspace | Provider HTTP |
| FilePreview | FilePreview Framework | knowledge source | source preview | Chunk |
| Chunk Hook | document-detail | typed bases API | view state | Provider identity |
| Rich Renderer | document-detail | content string | safe React tree | remote image |
| Chunk Image | document-detail | typed bytes | Blob/image | Provider ID |
| Preload/IPC | Desktop bridge | typed request | typed result | UI layout |
| Main HTTP | knowledge provider | SourceFile contract | validated DTO/bytes | RAGFlow mapping |
| nodeskclaw | Thin Gateway | SourceFile identity | public API | UI |
| RAGFlow | SOT | provider refs | Chunk/image | Desktop auth |

# 5. Terminology / Domain Model

**Hybrid Workspace**：左 Source + 右 Chunk 的同页工作台。

**Chunk Page Contract**：`sourceFileId,fileVersionId,items,total,page,pageSize` 六项共同组成当前 Page 事实。

**Rich Chunk Content**：Chunk `content` 中允许按安全 allowlist 转成 React 结构的文本/表格/列表/代码。

**Chunk Image**：通过 nodeskclaw SourceFile Chunk Image endpoint 得到的 authenticated bytes；与 content 内 HTML `<img>` 无关。

**Image Visibility Load**：只有 `hasImage=true` 且 Card 进入 IntersectionObserver 阈值时发起 image IPC。

**Current Page**：所有 Contract invariants 与当前 request/activeVersion 匹配的 Page。

# 6. System Context

## 6.1 Context Diagram

```text
KnowledgeBaseDetail
  ↓ Open
KnowledgeDocumentDetailPage (thin)
  ↓
DocumentDetail
  ├─ FilePreview Framework
  └─ KnowledgeChunkPanel
       ├─ ChunkToolbar
       ├─ ChunkList
       │    └─ ChunkCard
       │         ├─ ChunkImage
       │         └─ ChunkRichContentRenderer
       └─ PaginationFooter
             ↓
      HermesKnowledgeBasesAPI
             ↓
        Preload / IPC
             ↓
      KnowledgeHttpProvider
             ↓
       nodeskclaw v1.1
             ↓
           RAGFlow
```

## 6.2 Boundary

```text
Inside smc: layout, UI state, safe rendering, typed IPC, schema validation, Blob lifecycle
Outside smc: permissions, active version truth, Chunk/image truth, Provider mapping
Trusted: Main-validated typed DTO
Untrusted: Chunk content, image bytes/MIME, server JSON, search input
```

# 7. Authoritative State / SOT

| State | Role | Type | Authoritative? | Writer | Reader | Auto Override |
|---|---|---|---:|---|---|---:|
| SourceFile | document state | OBSERVED_STATE | YES | nodeskclaw | DocumentDetail | YES |
| activeVersionId | version | OBSERVED_STATE | YES | nodeskclaw | Preview/Chunk | YES |
| Chunk Page | page data | OBSERVED_STATE | YES | nodeskclaw/RAGFlow | Hook | YES |
| total | query count | OBSERVED_STATE | YES | nodeskclaw/RAGFlow | UI | YES |
| hasImage | image capability | RESOLVED_STATE | YES for public contract | nodeskclaw | UI | YES |
| image bytes | image data | OBSERVED_STATE | YES | RAGFlow via gateway | UI | YES |
| Blob URL | render handle | RUNTIME_STATE | NO | Renderer | `<img>` | YES |
| pageIndex/pageSize | UI query | RUNTIME_STATE | NO | User/UI | Hook | YES |
| search draft/effective | UI query | RUNTIME_STATE | NO | User/debounce | Hook | YES |
| split ratio | UI layout | RUNTIME_STATE | NO | User | UI | YES |
| Evidence | verification | EVIDENCE_STATE | YES | tests | reviewer | NO |

MUST NOT locally invent `total/hasImage/fileVersionId`。

# 8. State Machine

## 8.1 Chunk Panel

```text
IDLE
→ CHECK_PARSE
  ├─ active → LOADING
  ├─ pending/parsing → WAITING_PARSE
  └─ failed → PARSE_FAILED

LOADING
  ├─ contract match + items → READY
  ├─ contract match + empty → EMPTY
  ├─ version mismatch → STALE
  └─ other contract mismatch/error → ERROR

READY
  ├─ query/page/size/refresh → LOADING
  ├─ available toggle → MUTATING_CHUNK
  └─ activeVersion change → STALE
```

## 8.2 Chunk Image

```text
IDLE
→ OBSERVING
→ VISIBLE
→ LOADING
  ├─ success → READY
  ├─ 404 no image → EMPTY
  └─ error → ERROR

READY/ERROR
→ card unmount → REVOKED
```

每次成功创建的 Object URL MUST 在替换/unmount 时 `URL.revokeObjectURL()`。

# 9. Data / Schema Contract

## 9.1 Shared Chunk v2.1

```ts
export interface KnowledgeFileChunk {
  id: string;
  content: string;
  available: boolean | null;
  hasImage: boolean;
  positions: unknown[] | null;
  importantKeywords: string[];
  questions: string[];
}
```

`hasImage`：字段缺失 → default `false`；存在但非 boolean → `KNOWLEDGE_CONTRACT_INVALID`（§1.3）。
Main parser 从 `has_image` 读取；provider-only fields 继续丢弃。

## 9.2 Image IPC

```ts
export interface KnowledgeGetFileChunkImageInput {
  sourceFileId: string;
  chunkId: string;
  fileVersionId: string;
}

export interface KnowledgeFileChunkImageResult {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  bytes: Uint8Array;
}
```

新增 channel：

```text
knowledge-base:get-file-chunk-image
```

`HermesKnowledgeBasesAPI` 新增：

```ts
getFileChunkImage(input: KnowledgeGetFileChunkImageInput): Promise<KnowledgeFileChunkImageResult>;
```

## 9.3 Main HTTP Mapping

```http
GET /api/v1/source-files/{sourceFileId}/chunks/{chunkId}/image?file_version_id={fileVersionId}
```

Main MUST enforce defense-in-depth：

```text
Content-Type allowlist same as backend
bytes <= 20MiB
```

# 10. Requirement Units

## REQ-UI-001 — DocumentDetail Workspace Layout v2.1

### Goal
把页面从“按钮+两个面板”优化为稳定的文档解析工作台。

### Normative Requirement

```text
MUST default split Source 42% / Chunk 58%.
MUST retain drag clamp 30..70.
MUST <960px stack vertically.
MUST Header retain Back/FileName/Status/Info/Versions/Parse.
MUST move Reparse/Archive/Delete into More actions menu.
MUST Delete remain destructive + confirmation.
MUST NOT remove existing file actions.
```

### Inputs
viewport/detail/action capability。

### Preconditions
DocumentDetail content state。

### Authority
file status=server；layout=runtime。

### State Transition
user drag/menu → runtime UI state only。

### Allowed Side Effects
React state；existing file actions only when clicked。

### Forbidden Side Effects
opening menu/drawer = 0 backend mutation。

### Ownership Scope
`MODULE/SECTION`

### Idempotency
reopen v2.1 default 42/58；no cross-session persistence。

### Failure Semantics
pointer resize unavailable → fixed 42/58 functional。

### Postconditions
source/chunk independent full-height workspace。

### Invariants
`INV-UI-001 pane failure isolation`。

### Acceptance
`A-UI-001,A-UI-002,A-UI-003`

### Evidence
RTL + screenshot。

## REQ-UI-002 — Chunk Panel Information Architecture

### Goal
减少 toolbar vertical waste，固定分页操作位置。

### Normative Requirement
MUST structure：

```text
ChunkHeader     sticky top
SearchToolbar   sticky
ChunkList       min-h-0 flex-1 overflow-y-auto
PaginationFooter sticky bottom
```

Header contains：`Chunk result + total + Refresh + Ellipse/Full`。

SearchToolbar contains search input + pageSize。

Footer contains Previous / Page X of Y / Next。

### Side Effects
UI only except explicit Refresh/page/search GET。

### Acceptance
`A-UI-004`

## REQ-PAGE-001 — Frontend Pagination Defaults

### Goal
让普通文档默认形成可管理的 Chunk 页面并可验证翻页。

### Normative Requirement

```text
MUST default pageSize = 10.
MUST options = 10,25,50,100.
MUST pageSize change reset page=1.
MUST effective search change reset page=1.
MUST totalPages=max(1,ceil(total/pageSize)).
MUST Next disabled iff page>=totalPages.
MUST Previous disabled iff page<=1.
```

Backend default 50 MUST NOT 决定 UI default；前端每次请求显式发送 pageSize。

### Inputs
page/size/total。

### Authority
total/page response=server；query=runtime。

### State Transition
Next/Previous/size/search → new GET generation。

### Side Effects
GET only。

### Failure Semantics
request error → previous confirmed page MAY remain visually stale only if clearly marked；v2.1 default clears current list on query generation to avoid wrong-current ambiguity。

### Acceptance
`A-PAGE-001,A-PAGE-002,A-PAGE-003`

## REQ-PAGE-002 — Chunk Page Contract Invariants

### Goal
前端不能静默接受 backend 错页。

### Normative Requirement
GET success MUST validate：

```text
result.sourceFileId === requested sourceFileId
result.fileVersionId === activeVersionId
result.page === requested pageIndex
result.pageSize === requested pageSize
result.total >= 0
```

行为：

```text
fileVersion mismatch → STALE
sourceFile/page/pageSize mismatch → ERROR + KNOWLEDGE_CONTRACT_INVALID
MUST NOT render mismatched result as current
```

### Authority
request generation + validated response。

### Failure Semantics
contract mismatch non-retryable until explicit Refresh/new request。

### Acceptance
`A-PAGE-004,A-NEG-001`

## REQ-PAGE-003 — Multi-page Tests

### Goal
补 v2.0 测试缺口。

### Normative Requirement
MUST test：

```text
total=11,size=10 → page1/2
Next → request page=2
page2 items=1 → Prev enabled,Next disabled
total=137,size=50 → totalPages=3
size 50→10 → page resets 1
search change → page resets 1
```

Golden live MUST use nodeskclaw page1/page2。

### Acceptance
`A-PAGE-005`

## REQ-RICH-001 — Safe Rich Chunk Renderer

### Goal
将 RAGFlow table/list markup 显示成可读结构，而不是 `<pre>` 源码。

### Normative Requirement
MUST create `ChunkRichContentRenderer`。

Detection：若 content 包含可解析 HTML structural tag，使用 `DOMParser`；否则 PlainText。

Allowed tags：

```text
p br strong em b i
ul ol li
code pre
caption table thead tbody tfoot tr th td
```

Allowed attributes：

```text
th/td: colspan,rowspan only; must parse positive integer and clamp 1..20
all other attributes discarded
```

MUST：

```text
render React elements from allowlist
escape text nodes by React
fallback plain text on parser failure
wrap tables in overflow-x-auto container
```

MUST NOT：

```text
dangerouslySetInnerHTML
script/style/iframe/object/embed
on* handlers
href/src/style/class attributes from provider
<img> from content
```

### Inputs
untrusted content string。

### Authority
content text=server；presentation=renderer。

### Side Effects
none。

### Ownership Scope
`MODULE`

### Idempotency
same content → equivalent React tree。

### Failure Semantics
parse fail → safe plain text，not panel error。

### Invariants
`INV-RICH-001 renderer never executes provider markup`。

### Acceptance
`A-RICH-001,A-RICH-002,A-SEC-001,A-NEG-002`

## REQ-IMG-001 — Chunk Image Shared/Main Contract

### Goal
接入 nodeskclaw v1.1 image proxy。

### Normative Requirement
MUST add：

```text
KnowledgeFileChunk.hasImage
KnowledgeGetFileChunkImageInput
KnowledgeFileChunkImageResult
getFileChunkImage channel/API
```

Main parser MUST parse `has_image:boolean`；must not expose image token。

Main HTTP MUST call exact SourceFile image endpoint using `file_version_id` query。

### Inputs
sourceFileId/chunkId/fileVersionId。

### Preconditions
chunk.hasImage=true for normal UI call；API itself still validates input。

### Authority
nodeskclaw response。

### Side Effects
GET only。

### Failure Semantics
404 image missing is item-local；409 version conflict informs panel stale；503 retryable item error。

### Acceptance
`A-IMG-001,A-IMG-002,A-SEC-002`

## REQ-IMG-002 — Lazy Chunk Image Rendering

### Goal
图文 Chunk 可视且不一次拉取整页所有图片。

### Normative Requirement
MUST create `ChunkImage`/hook：

```text
hasImage=false → no observer/no IPC
hasImage=true → IntersectionObserver
rootMargin = 200px
visible → one in-flight image request per chunk/version
success → Blob → Object URL → <img loading="lazy">
unmount/reload → revoke Object URL
```

Image card：

```text
desktop thumbnail width 128px, max-height 120px, object-fit contain
narrow card stacks image above content
```

MAY offer click-to-expand dialog；不是 Release Gate。
v2.1 Decision Lock：MUST NOT 实现 click-to-expand（见 §1.3 Q7）。

MUST NOT retry continuously；item Retry MAY be explicit once per user action。

全局 in-flight image IPC MUST ≤ 3；超出排队（见 §1.3 Q11）。

### State
`IDLE/OBSERVING/LOADING/READY/EMPTY/ERROR/REVOKED`。

### Side Effects
IPC GET + Blob runtime memory。

### Ownership Scope
`OBJECT URL runtime`

### Failure Semantics
image failure MUST NOT make Chunk text unavailable。

### Invariants
`INV-IMG-001 every created Object URL eventually revoked`。

### Acceptance
`A-IMG-003,A-IMG-004,A-NEG-003`

## REQ-IMG-003 — Desktop Binary Safety

### Goal
Main/Renderer defense-in-depth。

### Normative Requirement

```text
MUST accept only image/png/jpeg/webp/gif.
MUST reject SVG/HTML/XML.
MUST reject bytes >20MiB even if backend failed to enforce.
MUST normalize Node Buffer to Uint8Array before IPC result.
MUST NOT log bytes/provider token.
```

### Failure Semantics
contract/type/size failure → `KNOWLEDGE_CONTRACT_INVALID` or dedicated safe local code；no Blob created。

### Acceptance
`A-IMG-005,A-SEC-003,A-NEG-004`

## REQ-CHUNK-001 — Chunk Card v2.1

### Goal
形成接近 RAGFlow 的图文阅读 Card。

### Normative Requirement
每 Card MUST：

```text
render image area only when hasImage
render RichContent
show availability state/control
show keywords when non-empty
show questions collapsibly when non-empty
use chunk.id as React key and mutation token only
```

MUST NOT show raw positions/provider metadata。

Ellipse mode：Plain text/clamped rich content visual max 8 lines/controlled height；Full mode shows full content。

### Acceptance
`A-CHUNK-001,A-NEG-005`

## REQ-CHUNK-002 — Existing Availability Semantics Preserve

### Goal
v2.1 UI 重构不破坏 v2.0 mutation safety。

### Normative Requirement
MUST retain：

```text
available=null → no PATCH
page.fileVersionId must match activeVersionId
no optimistic commit
409 → STALE+refresh
501 → read-only unsupported
503 → VERIFYING+GET
```

### Acceptance
`A-CHUNK-002,A-TXN-001`

## REQ-SEC-001 — Provider Boundary

### Normative Requirement

```text
MUST Renderer only use preload HermesKnowledgeBasesAPI.
MUST NOT fetch nodeskclaw/RAGFlow directly.
MUST NOT receive image_id/img_id/dataset_id/document_id/provider URL/token.
MUST NOT execute provider HTML.
```

### Acceptance
`A-SEC-001..003,A-NEG-006`

## REQ-OBS-001 — Observability

Main list logs MUST include safe page/pageSize/returnedCount/total；image logs MUST include sourceFileId/fileVersionId/chunk digest/mime/byteCount/error code。

MUST NOT log search text/chunk content/image bytes/credentials。

### Acceptance
`A-OBS-001`

# 11. Side-Effect Contract

| Operation | Local DB | File | Network | Cache/Memory | User Data | Business Source |
|---|---:|---:|---:|---:|---:|---:|
| open detail | NO | MAY preview | YES | preview MAY | NO | NO |
| list/search/page chunks | NO | NO | GET | runtime | NO | NO |
| rich render | NO | NO | NO | React | NO | NO |
| lazy image | NO | NO | GET | Blob URL | NO | NO |
| toggle available | NO | NO | PATCH | runtime | YES | YES field |
| resize/menu | NO | NO | NO | runtime | NO | NO |

Blob URL 是 runtime side effect，必须 revoke。

# 12. Ownership Contract

```text
DocumentDetail UI = FILE/MODULE / smc-copilot
Chunk query/view state = GENERATED_ONLY / smc-copilot
Chunk content/image/available = BUSINESS_SOURCE / RAGFlow via nodeskclaw
Blob URL = RUNTIME / smc renderer
FilePreview = SHARED / FilePreview Framework
Provider IDs = server-side / nodeskclaw only
```

Drift：page version mismatch → BLOCK mutation + STALE。

# 13. Hash / Identity Contract

```text
SourceFile route identity = sourceFileId
FileVersion = fileVersionId
Chunk = opaque chunkId
Image render cache key = sourceFileId + NUL + fileVersionId + NUL + chunkId
```

不新增业务 hash。若日志需 chunk digest：SHA256 chunkId，前12 hex。

# 14. Transaction Contract

## 14.1 Availability

沿用 v2.0：T0=server-confirmed available；无 optimistic；503 uncertain → GET verify；MUST NOT inverse PATCH。

## 14.2 Image

GET only，无 business transaction。Object URL lifecycle：

```text
bytes received → createObjectURL → set READY
replace/unmount → revokeObjectURL previous
```

Failure before URL creation → no runtime artifact。

# 15. Failure Contract

| Failure | UI | Mutation | Retry |
|---|---|---:|---|
| page contract mismatch | ERROR | 0 | explicit refresh |
| version mismatch | STALE | 0 | refresh |
| page GET 5xx | ERROR | 0 | retry |
| rich parse malformed | safe plain text | 0 | n/a |
| image 404 | item image EMPTY | 0 | no auto |
| image 409 | panel STALE | 0 | refresh |
| image 503 | item ERROR | 0 | user retry |
| image invalid MIME/size | item ERROR | 0 | no auto |
| image load fail | text remains READY | 0 | user retry |
| availability 503 | VERIFYING | remote unknown | GET verify |

# 16. Conflict Contract

| Conflict | Detection | Behavior | Mutation |
|---|---|---|---:|
| result sourceFile mismatch | exact compare | CONTRACT_INVALID | 0 |
| result page mismatch | exact compare | CONTRACT_INVALID | 0 |
| result pageSize mismatch | exact compare | CONTRACT_INVALID | 0 |
| result version mismatch | exact compare | STALE | 0 |
| late request generation | generation token | discard | 0 |
| image version 409 | HTTP | STALE | 0 |
| duplicate image load | in-flight key | dedupe | 0 |
| duplicate toggle | mutating id | block | 0 new |

# 17. Compatibility / Migration

Preserve：Knowledge routes、FilePreview、existing file actions、existing Chunk GET/PATCH、non-Chunk IPC。

Migration：

```text
M1 bind nodeskclaw v1.1 contract
M2 shared hasImage/image types/channel
M3 schema + Main image bytes
M4 IPC/preload image method
M5 page invariant + default 10
M6 Rich renderer
M7 Chunk image lazy renderer
M8 layout/header/panel structure
M9 tests/evidence/golden
```

# 18. External Dependency Contract

## nodeskclaw-knowledge v1.1

Required：

```text
GET source-file chunks with authoritative total/page/page_size
Chunk item has_image
GET source-file chunk image?file_version_id=
```

No direct RAGFlow fallback。

## Browser/Electron primitives

```text
DOMParser
IntersectionObserver
Blob
URL.createObjectURL/revokeObjectURL
```

No new npm rich HTML dependency required by this PRD。

# 19. Security Contract

| Threat | Control | Acceptance |
|---|---|---|
| XSS markup | allowlist React renderer | A-SEC-001 |
| content `<img>` bypass | `<img>` forbidden | A-NEG-002 |
| provider ID leakage | strict public schema | A-SEC-002 |
| direct HTTP | preload only | A-NEG-006 |
| SVG active content | MIME deny | A-IMG-005 |
| memory exhaustion | 20MiB + lazy load | A-SEC-003 |
| Blob leak | revoke lifecycle | A-IMG-004 |
| stale image | fileVersion query guard | A-IMG-002 |

# 20. Observability

Stages：`UI_QUERY → IPC → HTTP → VALIDATE → UI_APPLY`；图片增加 `OBSERVE → IMAGE_FETCH → BLOB_CREATE → BLOB_REVOKE`。

Required safe fields：operationId/sourceFileId/fileVersionId/page/pageSize/total/returnedCount/chunkDigest/mime/byteCount/errorCode。

# 21. Acceptance Design

## A-UI-001 — Default 42/58
Given desktop >=960。Then source width=42±1%，chunk fills remainder。

## A-UI-002 — Resize Clamp
Drag beyond bounds → source remains 30..70；network mutation count=0。

## A-UI-003 — Header Action Hierarchy
Header directly shows Back/File/Status/Info/Versions/Parse/More；Reparse/Archive/Delete available in More；Delete still confirmation。

## A-UI-004 — Sticky Chunk Structure
Chunk header/search/footer remain in panel while list scrollTop changes；page footer remains visible。

## A-PAGE-001 — Default Size 10
First Chunk request exact `{page:1,pageSize:10}`。

## A-PAGE-002 — 11 Chunks Gives 2 Pages
`total=11,pageSize=10 → Page 1/2, Next enabled`。

## A-PAGE-003 — Next Requests Page2
Click Next → exactly one `listFileChunks({page:2,pageSize:10})`；response page2 renders。

## A-PAGE-004 — Contract Mismatch Rejected
Requested page2，response page1 → state ERROR + `KNOWLEDGE_CONTRACT_INVALID`，items not current。

## A-PAGE-005 — Multi-page Matrix
137/50 → 3 pages；size change/search reset to page1；all tests PASS。

## A-RICH-001 — Table Rendered
Input `<table><tr><td>A</td></tr></table>` → DOM contains table/td text A；literal `<table>` text not shown as primary representation。

## A-RICH-002 — Unsafe Markup Removed
Input script/style/onerror/img → no script/style/img/event attribute DOM；`window` side effect absent。

## A-IMG-001 — Shared Image Contract
`has_image=true` parses to `hasImage=true`；provider token absent。

## A-IMG-002 — Exact Image HTTP
Input source/chunk/version → Main GET exact SourceFile image route with `file_version_id` query。

## A-IMG-003 — Lazy Load
Offscreen card → image IPC call=0；Intersection event → call=1。

## A-IMG-004 — Blob Lifecycle
Success creates one URL；rerender replacement/unmount calls `revokeObjectURL` exactly for each created URL。

## A-IMG-005 — Binary Safety
SVG or >20MiB → no Object URL，item error only。

## A-CHUNK-001 — Card Composition
Image chunk shows media+rich content+availability；non-image chunk has no media request。

## A-CHUNK-002 — Mutation Regression
null blocked；409 stale；501 read-only；503 verifying GET；no optimistic update。

## A-TXN-001 — Uncertain PATCH
503 → no inverse PATCH，GET verification required。

## A-SEC-001 — No Executable Markup
Malicious HTML produces 0 executable elements/handlers。

## A-SEC-002 — No Provider IDs
Renderer DTO/DOM has no image_id/img_id/dataset_id/document_id/RAGFlow URL。

## A-SEC-003 — Main Cap
20MiB+1 response fails before IPC success。

## A-OBS-001 — Sanitized Logs
Forbidden content/token fixtures absent。

# 22. Acceptance Input Matrix

| Case | total | size | page | content | hasImage | image | Expected |
|---|---:|---:|---:|---|---:|---|---|
| 1 | 11 | 10 | 1 | plain | false | - | Page1/2 |
| 2 | 11 | 10 | 2 | plain | false | - | 1 item |
| 3 | 137 | 50 | 3 | plain | false | - | Page3/3 |
| 4 | 11 | 10 | req2/resp1 | plain | false | - | CONTRACT_INVALID |
| 5 | 1 | 10 | 1 | table | false | - | safe table |
| 6 | 1 | 10 | 1 | script | false | - | no execute |
| 7 | 1 | 10 | 1 | plain | true | png | lazy image READY |
| 8 | 1 | 10 | 1 | plain | true | 404 | text READY/image EMPTY |
| 9 | 1 | 10 | 1 | plain | true | 409 | STALE |
| 10 | 1 | 10 | 1 | plain | true | svg | image ERROR |
| 11 | 1 | 10 | 1 | plain | true | >20MiB | image ERROR |
| 12 | 1 | 10 | 1 | plain | null available | - | toggle disabled |

# 23. Negative Acceptance

```text
A-NEG-001 page/pageSize/sourceFile response mismatch rendered current → FAIL
A-NEG-002 content `<img>` or script/event rendered executable → FAIL
A-NEG-003 hasImage=false triggers image IPC → FAIL
A-NEG-004 SVG/oversize creates Blob URL → FAIL
A-NEG-005 raw positions/provider metadata displayed → FAIL
A-NEG-006 Renderer direct fetch/RAGFlow/nodeskclaw URL → FAIL
A-NEG-007 provider IDs appear in DOM/log → FAIL
A-NEG-008 FilePreview Framework public contract modified → FAIL
```

# 24. Failure Injection

| Point | Required Postcondition |
|---|---|
| old Page1 response after Page2 | discard old generation |
| response page mismatch | ERROR/no current items |
| rich DOMParser throws/fails | plain text fallback |
| image before intersection | 0 IPC |
| image IPC 404 | text unaffected |
| image IPC 409 | STALE |
| image IPC 503 | item error/text unaffected |
| Blob created then card unmount | revoke called |
| Main reads oversize body | fail/no renderer bytes |
| availability PATCH 503 | VERIFYING/no optimistic |

# 25. Evidence Contract

```json
{
  "acceptance_id": "A-PAGE-003",
  "status": "PASS",
  "requirement_ids": ["REQ-PAGE-001"],
  "test_ids": ["TEST-A-PAGE-003"],
  "command": "npx vitest run ...",
  "exit_code": 0,
  "oracle": {"type":"exact_call_args","expected":{"page":2,"pageSize":10},"actual":{}},
  "repo": "loudon84/smc-copilot",
  "branch": "work/prd-v6.2",
  "commit_sha": "<implementation-sha>",
  "nodeskclaw_contract_revision": "<revision>",
  "timestamp": "<ISO8601>",
  "evidence_files": []
}
```

SKIPPED/BLOCKED != PASS。

# 26. Release Gate

Required：

```text
A-UI-001..004
A-PAGE-001..005
A-RICH-001..002
A-IMG-001..005
A-CHUNK-001..002
A-TXN-001
A-SEC-001..003
A-OBS-001
A-NEG-001..008
```

任一非 PASS → Release Gate FAIL + process exit !=0。

# 27. Golden Consumer / Real-world Acceptance

同一真实知识库 SourceFile：

```text
1 DocumentDetail source preview visible
2 Chunk pageSize=10 → Page1/Page2 live
3 keyword search live
4 HTML/table chunk visually structured
5 has_image=true chunk image visible
6 image card does not expose RAGFlow URL/id
7 available toggle then restore
8 reparse → waiting → current chunks
```

必须记录 smc HEAD、nodeskclaw HEAD/contract revision、RAGFlow version/digest、before/after screenshot/evidence。

Synthetic Fixture MUST NOT 替代。

# 28. Requirement Traceability Matrix

| Requirement | Invariant | Acceptance | Test | Evidence | Gate |
|---|---|---|---|---|---|
| REQ-UI-001 | INV-UI-001 | A-UI-001..003 | TEST-UI-* | EVID-* | REQUIRED |
| REQ-UI-002 | fixed panel zones | A-UI-004 | TEST-UI-004 | EVID-* | REQUIRED |
| REQ-PAGE-001 | explicit query | A-PAGE-001..003 | TEST-PAGE-* | EVID-* | REQUIRED |
| REQ-PAGE-002 | exact contract | A-PAGE-004,A-NEG-001 | TEST-CONTRACT-* | EVID-* | REQUIRED |
| REQ-PAGE-003 | multi-page | A-PAGE-005 | TEST-PAGE-MATRIX | EVID-* | REQUIRED |
| REQ-RICH-001 | INV-RICH-001 | A-RICH-001/002,A-SEC-001,A-NEG-002 | TEST-RICH-* | EVID-* | REQUIRED |
| REQ-IMG-001 | provider neutral | A-IMG-001/002,A-SEC-002 | TEST-IMG-CONTRACT | EVID-* | REQUIRED |
| REQ-IMG-002 | INV-IMG-001 | A-IMG-003/004,A-NEG-003 | TEST-IMG-UI-* | EVID-* | REQUIRED |
| REQ-IMG-003 | binary safety | A-IMG-005,A-SEC-003,A-NEG-004 | TEST-IMG-SAFE | EVID-* | REQUIRED |
| REQ-CHUNK-001 | card boundary | A-CHUNK-001,A-NEG-005 | TEST-CARD | EVID-* | REQUIRED |
| REQ-CHUNK-002 | no optimistic | A-CHUNK-002,A-TXN-001 | TEST-MUTATION | EVID-* | REQUIRED |
| REQ-SEC-001 | provider boundary | A-SEC-001..003,A-NEG-006/007 | TEST-SEC-* | EVID-* | REQUIRED |
| REQ-OBS-001 | sanitized | A-OBS-001 | TEST-LOG | EVID-* | REQUIRED |

# 29. Plan Generation Contract

Current：

```text
status = APPROVED_FOR_PLAN
```

只有 `status=APPROVED_FOR_PLAN` 才可生成 `.plan.md`。

nodeskclaw Chunk image / `has_image` 合同已按 §0.3 / §1.3 验证 PASS。

Owner grilling Decision Lock 见 §1.3。  
（本会话明确要求：先落盘 APPROVE，**不**自动生成 `.plan.md`，待用户另行指示。）

Before plan execution MUST re-compare §9 against the Contract SOT path in §1.3；漂移 → `SPEC_SEMANTIC_GAP`。

# 30. `.plan.md` 输出标准

Todo MUST：

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

# 31. Code Review Contract

顺序：Requirement → SOT → page contract → Rich security → image lifecycle → side effects → failure state → AC → Evidence → code quality。

# 32. PRD Quality Gate

```text
[x] Goal/Scope/Boundary 唯一明确
[x] SOT/State Machine 完整
[x] page default/authority/invariant 明确
[x] Rich allowlist 明确
[x] Image IPC/MIME/20MiB/lazy/revoke 明确
[x] Side Effect/Ownership 明确
[x] Failure/Conflict 明确
[x] MUST→AC / MUST NOT→Negative AC
[x] Edge matrix/Failure injection
[x] Evidence/Traceability
[x] nodeskclaw v1.1 actual contract verified (§0.3 / §1.3 local SOT)
[x] status=APPROVED_FOR_PLAN
[x] §1.3 Grilling Decision Lock 已写入
```

# 33. PRD 禁止写法

禁止“优化布局 / 正确翻页 / 安全渲染 HTML / 图片按需加载 / 兼容后台”这类无 Oracle 语句；必须按本 PRD exact ratio/page/allowlist/MIME/byte cap/lifecycle 执行。

# 34. 最小完整结构检查

已覆盖 Meta、Goal、Background、Scope、Boundary、Terminology、SOT、State Machine、Schema、Requirements、Side Effects、Ownership、Identity、Transaction、Failure、Conflict、Migration、External Dependency、Security、Observability、Acceptance、Matrix、Negative、Failure Injection、Evidence、Traceability、Release Gate、Plan Gate、DoD。

# 35. Definition of Done

```text
[ ] DocumentDetail default 42/58 + 30..70 drag
[ ] Header action hierarchy + More menu
[ ] Chunk Header/Search/List/Footer fixed structure
[ ] default pageSize=10
[ ] pageSize 10/25/50/100
[ ] exact result sourceFile/page/pageSize/version validation
[ ] 11/10 live Page1/Page2 PASS
[ ] 137/50 three-page test PASS
[ ] Rich table/list/text renderer implemented
[ ] no dangerouslySetInnerHTML
[ ] no provider `<img>` rendered from content
[ ] hasImage parsed
[ ] getFileChunkImage Main/IPC/Preload exposed
[ ] image lazy IntersectionObserver
[ ] Blob URL revoke verified
[ ] SVG/HTML/XML denied
[ ] 20MiB defense-in-depth
[ ] image failure isolated from text
[ ] available mutation v2.0 semantics preserved
[ ] no direct Renderer HTTP/provider IDs
[ ] regression suite PASS
[ ] live Golden Consumer PASS
[ ] Required AC Evidence complete
[ ] Release Gate PASS
```

> 最终原则：**FilePreview 负责原文；DocumentDetail 负责文档解析工作台；nodeskclaw 提供 SourceFile Contract；RAGFlow 保持 Chunk/Image SOT。**
