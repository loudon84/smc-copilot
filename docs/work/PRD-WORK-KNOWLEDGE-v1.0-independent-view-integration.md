---
work_item_id: WORK-KNOWLEDGE-01
version: 1.3.0
status: APPROVED
governance_profile: FULL
target_branch: work/prd-v5.0
review_verdict: PASS
approved_at: 2026-09-15T13:05:05.596500+08:00
source_revision: WORK-KNOWLEDGE-01@v1.3.0/f1-read-gate-revision
grounded_commit: fa02f4c00d8f425a2b24787cca592ac7ecb5875d
ges_bundle: 5.0.0
ges_feature_slice: 5.0.7
frontend_adoption_mode: ENFORCED
frontend_calibration_status: ACCEPTED
clarification_provider_status: UNAVAILABLE
clarification_integration_status: NATIVE_ONLY
grounding_mode: revision
closes_review_findings: F1
---

# PRD — Work Knowledge 独立 View 集成

本文档定义把本地 `apps/knowledge` 的可复用前端能力迁移为 Work 内独立 Knowledge View 的 Stage 边界。本文档已按 GES 5 FULL profile 完成 revision grounding（关闭 initial review F1）、独立 Review PASS 与 deterministic converge，状态为 `APPROVED`。本 PRD 不单独授权实现：仍须 APPROVED Architecture Decision 与 READY Roadmap Item 后才能生成或执行实施 Plan。

## Governance Status

GES Work Router 将本工作项判定为 FULL：它引入新的 Knowledge Upload Job Owner，改变 Main/Preload/Renderer 公共契约，触及身份隔离、文件生命周期和跨域所有权。仓库当前未发现对应的 APPROVED Architecture Decision 或 READY Roadmap Item；在补齐上游治理前，不得生成或执行实施 Plan。

本轮 `grounding_mode: revision` 关闭 `docs/work/reviews/prd-work-knowledge-01-independent-view-v1.2.0-initial-review.md` 的 F1：为 dashboard/list/detail/chat 指定 fail-closed 读取 Owner，并让 AC-09 与 AC-11 对齐。F2（身份库存重复、permission-denied 过宽）一并收敛。HIGH 澄清项 Q01–Q06 保持 CLOSED。不重做无关 Skill Run 发现。`grounded_commit` 仍为 HEAD `fa02f4c00d8f425a2b24787cca592ac7ecb5875d`。

本地安装证据只支持以下表述：GES bundle 为 `5.0.0`，包含 `5.0.7` feature slice；安装事务为 PASS，但安装源工作树不干净、`release_eligible=false`，因此不能把它表述为已验证的干净 `5.0.7 bundle` 发布证明。路由收据写入 `.smc/runs/WORK-KNOWLEDGE-01/routing/work-facts.json`。

## Objective

1. 在 Work 主侧栏增加 Knowledge 一级入口，并在主内容区承载独立 Knowledge View。
2. Knowledge 首次访问后保持挂载；切换到 Chat 或其他 Work View 时只改变可见性，不销毁模块根状态，也不改变 Chat Run 生命周期。
3. Knowledge 内部导航采用模块状态路由，不读写窗口 URL/history，不改造 Work 全局 URL Router。
4. 内部路由状态由可独立实例化的 scope owner 承载；本阶段只创建一个 scope，为未来由页签 host 创建第二个独立 scope 保留兼容边界，不交付 tab collection 或多页签 UI。
5. 文件选择、导入、上传、处理、取消、重试和恢复通过 Main-owned Knowledge Upload Job 管理；Renderer View 是否活跃不拥有 Job 生命周期。
6. Knowledge 复用 Work 的身份、主题、i18n、File Platform 和受控 IPC，不形成第二套宿主能力。
7. 迁移并适配 `apps/knowledge` 的业务页面、领域类型和可复用展示组件；Work 运行时不直接跨根导入 `apps/knowledge`。
8. 在真实 Knowledge provider 尚未交付时，以明确的 unavailable 状态关闭生产能力，不以 mock repository、`MockUploadFile` 或模拟进度宣称真实成功。

## Out of Scope

- 不引入 React Router、TanStack Router 或其他全局 URL Router 作为 Work 顶层导航 Owner。
- 不提供 `/knowledge/*` URL、刷新深链、浏览器前进/后退、外部 URL 唤醒或跨窗口路由同步。
- 不交付多页签栏、“在新页签打开”、页签拖拽、持久恢复或关闭确认。
- 不迁移 Knowledge 的独立 Electron Main、Preload、窗口、自动更新、认证 IPC、登录页、Profile、Preferences、AppShell 或全局 Sidebar。
- 不设计或实现真实 Knowledge 服务端 API、数据库、对象存储、解析、Embedding、RAG、索引、服务端权限或跨设备任务中心。
- 不把 `apps/knowledge` 作为 Work 的运行时依赖、子进程、WebView 或可直接跨应用根导入的源码包。
- 不重构 Work 全部 View，也不建立通用 Module Registry。
- 不把本阶段的 Job contract 测试 adapter 当作生产 provider；真实远端完成态属于后续独立 Roadmap Item 的阻塞验收。

## Routing Facts

```json
{
  "existing_owner": true,
  "existing_capability": true,
  "bounded_writes": true,
  "deterministic_verification": true,
  "new_owner": true,
  "public_contract": true,
  "security_boundary": true,
  "schema_migration": true,
  "protocol_change": true,
  "external_dependency": true,
  "lifecycle_change": true,
  "cross_domain_ownership": true,
  "live_acceptance": false,
  "research_intent": false,
  "governed": true,
  "retained_production_change": true,
  "production_write_requested": false,
  "durable_product_artifact_requested": true,
  "security_sensitive_touch": true,
  "existing_lifecycle_wiring": true,
  "cross_layer_existing_contract": true,
  "local_ui_acceptance": true,
  "existing_public_contract_use": true,
  "existing_external_dependency_use": false,
  "public_contract_change": true,
  "security_boundary_change": true,
  "external_dependency_change": true,
  "lifecycle_contract_change": true,
  "ownership_transfer": true,
  "cross_domain_contract_change": true,
  "external_live_acceptance": false
}
```

## Clarification Ledger

| ID | Category | Impact | Question | Answer | Affects | Status |
|---|---|---|---|---|---|---|
| Q01 | UX / Navigation | HIGH | Knowledge 如何进入和退出？ | 作为 Work 独立 View；复用 Work 的 active/visited View 机制，不使用 Settings Modal，也不新增全局 URL Router。 | AC-01/02 | CLOSED |
| Q02 | Routing | HIGH | 如何支持未来子路由单独显示？ | 采用 typed、host-scoped 模块状态路由；当前只实例化一个 scope，未来页签可创建另一个实例，不预建 tab collection 或跨 tab back stack。 | AC-03 | CLOSED |
| Q03 | Lifecycle | HIGH | View 隐藏后上传如何存活？ | 上传由 Main-owned Job 执行和持久化；Renderer 只订阅 sanitized snapshot/event。 | AC-04/05/06 | CLOSED |
| Q04 | Scope / Dependency | HIGH | 真实 Knowledge provider 是否属于本阶段？ | 不属于。本阶段交付 integration foundation 和 provider capability gate；无 provider 时上传与实体读取都只能进入明确 unavailable/blocked/empty 状态。 | AC-05/09/11 | CLOSED |
| Q05 | File Contract | HIGH | 现有 `FileImportContext.sessionId` 如何用于 Knowledge？ | 不伪造 Chat Session。先创建绑定当前身份和目标知识库的 draft Job，再以 Knowledge Job association 导入 ManagedFile；具体公共契约须由上游 Architecture 批准。 | AC-04/09/10 | CLOSED |
| Q06 | Data / Ownership | HIGH | 无真实 provider 时 list/detail/chat 从哪读取？ | 全部知识读取与上传共用 Main capability gate。无 provider 时页面可达但只展示明确 unavailable/empty，不使用 `MockKnowledgeRepository`、fixture 列表或可发送的 mock 问答。Knowledge 问答不接入 Work Chat Run。 | AC-09/11/12 | CLOSED |

## Current Capability Inventory

| Capability | Current State | Existing Owner | Grounded Observation |
|---|---|---|---|
| Work 顶层 View 导航 | EXISTS | Work Renderer Layout | `View`、`goTo`、`visitedViews` 和 `paneStyle` 已实现首次访问后挂载、切换时隐藏的保活模式。 |
| Chat Run 保活 | EXISTS | Work Renderer Layout / Chat | Chat Run 保持挂载，只根据当前 View 和 active run 控制显示。 |
| Work 统一身份 | EXISTS | Work Main Auth + `window.desktopAuth` | Renderer 只见 `DesktopAuthState`（`user.id`、可选 `tenantId`）；token 留在 Main。Hermes `activeProfile` 由 Layout 持有，不是 auth-contract 字段。 |
| Work File Platform | EXISTS | Work Main File Platform | 已有 ManagedFile、导入、解析、预览、关联、事件和本地解析 Job；导入上下文当前要求 Chat `sessionId`。 |
| Knowledge 页面 | PARTIAL | `apps/knowledge` Renderer | 已有首页、知识库、知识集、文档、上传任务和知识问答页面，但依赖独立 Shell、Router、Auth 和 mock repository。 |
| Knowledge 内部导航 | EXISTS / CONFLICT | `apps/knowledge` TanStack Memory Router | 不修改窗口 URL，但业务页面直接依赖 Router hooks 和生成 route tree。 |
| Knowledge 上传 | MOCK ONLY | `apps/knowledge` Renderer store | `MockUploadFile` 和 Renderer timer 只模拟进度，不传输真实文件字节。 |
| Knowledge 远端数据 | MISSING | `RemoteKnowledgeRepository` placeholder | 远端 repository 方法未实现，不能作为生产能力。`MockKnowledgeRepository` 是源 demo 默认，禁止作为 Work 生产读取接口。 |
| Knowledge 上传 Job | MISSING | 无 | Work `FileJobQueue` 只调度本地 parse/index；其事件是 `file-job:*`，不是远端 Knowledge ingestion Job Owner。 |
| File association 形状 | EXISTS / PARTIAL | Work Main File Platform | `FileAssociation` 已有可选 `sessionId` / `messageId` / `taskId`；`FileImportContext.sessionId` 仍为必填，当前导入路径按 Chat Session 语义校验。 |
| Chatbox 知识库参考实现 | EXISTS / OUT OF SCOPE | `apps/work/references/chatbox` | 归档 Chatbox 含 knowledge-base 工具集；不是 Work 生产路径，不得作为本 Stage Owner 或迁移源。 |
| GES Frontend Context | EXISTS / PARTIAL | `.agents/ges/frontend` | `work` 与 `knowledge` 均 INITIALIZED，calibration ACCEPTED、adoption ENFORCED、baseline lock FRESH。Work surface-registry 无 `work:sidebar.navigation`；生产侧栏 Owner 是 `Layout.tsx` 的 `View` / `PINNED_NAV_ITEMS`。 |
| Knowledge hidden polling | EXISTS (source app) | `apps/knowledge` upload Query | `useUploadJobs` 在有活跃任务时 `refetchInterval: 1000`。迁入 Work 后不得把该 UI timer 当作 Job 推进手段（AC-05）。 |

## Target End-State Inventory

| Capability | Target State | Production Owner | Boundary / Observable Result |
|---|---|---|---|
| Work 顶层 Knowledge View | ADD | Existing Work Renderer Layout | `View` 增加 `knowledge`；侧栏一级入口；`visitedViews`/`paneStyle` 保活；不改窗口 URL Router。 |
| Knowledge 模块根与内部路由 | ADD | Knowledge Renderer Module in `apps/work` | 首次访问后根 identity/store/QueryClient 稳定；typed Route Descriptor；host-scoped `routeScopeId`；本 Stage 只创建一个默认 scope。 |
| Work 身份/主题/i18n | KEEP | Work Main Auth / `desktopAuth` + 现有主题/i18n | Knowledge 不持有 token、独立登录页或独立 endpoint owner。 |
| 本地文件字节与预览 | KEEP / MODIFY | Work Main File Platform | Chat `FileImportContext.sessionId` 语义不变；Knowledge 使用已创建并校验的 Job association，不伪造 Chat Session。 |
| Knowledge Upload Job | ADD | Proposed Main Knowledge Upload Job Coordinator | 权威生命周期与持久化；可复用 FileJobQueue primitive，但不冒充 parse job；无真实 provider 时只进入 unavailable/blocked。 |
| Knowledge 实体读取 | ADD | Main capability probe + Knowledge Renderer unavailable/empty UI | Dashboard/list/detail/chat 与上传共用同一 Main capability gate；无 provider 时页面可达但只展示明确 unavailable/empty。`MockKnowledgeRepository` 不是 Work 生产接口。 |
| Knowledge Job IPC | ADD | Shared contract + curated Preload | Renderer 只发命令、读 sanitized snapshot/event；Main 校验身份与输入。 |
| 迁移后的业务页面 | ADD | Knowledge Renderer Module | Home/Bases/Sets/Documents/Uploads/Chat 可在 Work View 到达；无真实 provider 时不得渲染 fixture 列表或可发送 mock 问答；独立 Shell/Auth/TanStack/MockUploadFile 不在 Work 生产路径。 |
| 真实 Knowledge provider | DEFERRED | Remote Knowledge Service | 本 Stage 只交付 capability gate；端到端成功属于后续 Roadmap Item。不发明新的远端 Knowledge API。 |
| Chat / Skill Run / Settings / 连接模式 | KEEP | Existing Work owners | Knowledge 激活、隐藏、导入失败和 Job 状态变化不改变其行为或 ownership。 |
| `apps/knowledge` 独立应用 | KEEP (source only) | 非 Work 运行时 | 本 Stage 不打包、不启动、不跨根 import；归档删除属于后续清理项。 |

## Production Owner

| Capability | Production Owner | Ownership Decision |
|---|---|---|
| Work 顶层 View、active/visited 与 Chat 保活 | Existing Work Renderer Layout | KEEP / MODIFY；仍是唯一顶层导航 Owner。 |
| Knowledge 内部 route、route-scope snapshot 和页面 UI state | Knowledge Renderer Module inside `apps/work` | NEW_OWNER；每个 host 实例只拥有自己的模块状态，不拥有窗口 URL、tab collection 或上传执行。 |
| Work 用户、租户与 token | Existing Work Main Auth / `desktopAuth` | KEEP；Renderer 不能读取或持久化 token。 |
| 本地文件字节、ManagedFile、预览和物理清理 | Existing Work Main File Platform | KEEP / MODIFY；新增 Knowledge Job association，不复制文件平台。 |
| Knowledge 上传/处理 Job、恢复、幂等命令和事件 | Proposed Main Knowledge Upload Job Coordinator | NEW_OWNER；可复用调度/持久化 primitive，但不能冒充现有 FileJobQueue 的既有能力。该 Owner 必须先获 Architecture 批准。 |
| Knowledge dashboard/list/detail/chat 权威数据访问 | Main capability probe（与 C11 同一探测）+ Knowledge Renderer unavailable/empty UI | ADD；无真实 provider 时 fail-closed。不是 `MockKnowledgeRepository`，也不新增本 Stage 远端 Knowledge API Owner。 |
| Knowledge Job IPC | Work Shared Contract + curated Preload | ADD；Main 校验身份和输入，Renderer 只见 sanitized contract。 |
| 真实知识库上传、读取与处理 | Remote Knowledge Service | DEFERRED；不是本 Stage 的交付 Owner。 |

## Boundary and Lifecycle Contract

### Work View lifecycle

Knowledge 由 Work Layout 首次按需挂载，之后根组件 identity、模块 store 和 QueryClient 保持稳定。切换 View 只改变 `active`/可见性；不得通过条件卸载、变化的 React `key` 或 Router 重建实现切换。Chat Run 的显示、草稿和执行状态保持由现有 Owner 管理。

### Module state routing

Knowledge route 是可序列化 typed state，不是字符串 URL。Route Descriptor 至少表达 Home、Knowledge Base list/detail、Knowledge Set list/detail、Document list/detail、Upload Jobs、Knowledge Chat list/session，并支持 push、replace、back 和 reset-to-home。

Route owner 必须可由 host 以独立 `routeScopeId` 实例化，不能是模块级 singleton；每个实例只保存自己的 `currentRoute`、`routeParams` 和 `backStack`。当前 Knowledge View 只创建一个默认 scope；tab collection、跨 tab back stack、选择和持久恢复均留给多页签 Roadmap Item。Route state 不保存 React element、DOM node、`File`、token、请求实例或其他不可序列化对象。

### Knowledge upload job

权威流程是：Main 先创建绑定当前 Work profile/tenant、目标 Knowledge Base 和稳定 Job ID 的 draft Job；File Platform 再以 Knowledge Job association 导入 ManagedFile；Job Coordinator 负责 provider capability 判定、提交、进度、处理、取消、重试、恢复与终态；Renderer 只发命令并读取 snapshot/event。

公共状态至少包括 `draft`、`queued`、`uploading`、`processing`、`completed`、`failed`、`cancelled`、`interrupted` 和 `blocked_provider_unavailable`。真实 provider 不存在时，Job 不得模拟 `uploading` 或 `completed`，只能进入明确的 unavailable/blocked 状态。

Renderer reload 或应用重启后，非终态 Job 必须从 Main 持久状态恢复并与 provider 协调，或单调地进入 `interrupted`/`blocked_provider_unavailable`；不能永久停留在无 Owner 的活动状态。取消和重试是按 Job ID 幂等的命令，重复事件不能使终态回退。

### Knowledge entity reads

Dashboard、知识库/知识集/文档 list/detail 与 Knowledge Chat 的查询与上传共用同一 Main capability probe。无真实 provider 时这些页面仍可到达，但只渲染明确 unavailable/empty；不得使用 `MockKnowledgeRepository`、fixture 列表或可发送的 mock 问答。Knowledge 问答不接入 Work Chat Run / Skill Run，也不把会话 ID 写入 Chat `FileImportContext.sessionId`。本 Stage 不设计真实远端 Knowledge 读取 API。

### File association and cleanup

Knowledge 不向现有 `FileImportContext` 填写伪造的 `sessionId`。公共导入契约需要可判别的 consumer context：现有 Chat 语义保持不变，Knowledge 语义引用已由 Main 创建并校验的 Job ID。`FileAssociation` 已允许缺少 `sessionId` 并使用 `taskId`；本 Stage 不得把 Chat Session 填进 Knowledge Job 行。profile/tenant 从权威身份上下文派生，不能由 Renderer 自报覆盖。

Knowledge Job association 在 Job 非终态和产品保留期内持有 ManagedFile 引用。取消、失败或清理 association 时，只有在不存在 Chat、Skill Run、其他 Knowledge Job 等引用后，File Platform 才能执行物理删除；本 PRD 不自行冻结数据库表或精确保留天数。

### Identity partition

Job、snapshot、query cache 和实体数据必须按 Main 派生的 `{workProfileId, authSubject, tenantScope}` 分区。这是本 Stage 要新增的隔离键，不是现有 DTO 字段名：`workProfileId` 对应 Layout 当前 Hermes profile；`authSubject` 对应 `DesktopAuthUser.id`；`tenantScope` 在存在 `tenantId` 时绑定该租户，缺失时使用绑定 authSubject 的显式 personal scope，绝不能与其他无 tenantId 用户合并。Renderer 不能自报或覆盖这些分区键。

登出、同租户切换用户、跨租户切换或切换 Work profile 后，旧身份 UI cache 立即不可见，旧 Job 的读取/取消/重试命令被拒绝；远端已提交任务可继续由 Main/provider 协调，但只有重新进入同一 `{workProfileId, authSubject, tenantScope}` 且授权仍有效时才能显示。Renderer 不保存 token、绝对路径或 provider 原始错误。

### Source migration boundary

GES app profile 将 `apps/work` 与 `apps/knowledge` 定义为互相禁止的应用根。迁移必须把批准的业务能力复制/改写到 `apps/work` 内的 Work-owned 模块边界，或通过另行治理的 shared package；Work 生产代码不得运行时跨根 import `apps/knowledge`。

`apps/knowledge` 在本 Stage 中只作为迁移来源和对照，不由 Work 打包、启动或展示为第二个产品。其独立应用删除/归档属于后续清理工作；本 Stage 必须确保其 Shell、Auth、Router、Updater、`MockUploadFile` 和 `MockKnowledgeRepository` production interface 不进入 Work 运行路径。

## Change Classification

| Change ID | Action | Requirement | Production Owner | Source Anchor | Target State | Boundary |
|---|---|---|---|---|---|---|
| C01 | MODIFY | Work 侧栏和 Layout 增加 Knowledge 独立 View。 | Work Renderer Layout | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#View` | renderer_ui | 复用 visited-view；不改全局 URL Router。 |
| C02 | ADD | Knowledge View 根容器接收 `active` 可见性语义并首次访问后常驻。 | Knowledge Renderer Module | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` | renderer_ui | 隐藏不取消 Job，不重建模块根。 |
| C03 | REPLACE | TanStack Memory Router 与页面 Router hooks 替换为模块状态路由。 | Knowledge Renderer Module | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts` | renderer_ui | 无 window URL/history 副作用。 |
| C04 | ADD | 可由 host 独立实例化的 route-scope owner。 | Knowledge Renderer Module | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts` | renderer_ui | 当前只创建一个 scope；不预建 tab collection 或跨 tab 状态。 |
| C05 | REPLACE | 移除迁移模块的独立 Auth/Login/Token/Endpoint owner。 | Work Main Auth / `desktopAuth` | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` | renderer_ui | token 留在 Main。 |
| C06 | MODIFY | 迁移 Knowledge 业务页面、领域类型和可复用展示组件。 | Knowledge Renderer Module | `apps/work/src/renderer/src/screens/Knowledge/pages/` | renderer_ui | 目标代码归属 `apps/work`；不运行时导入源应用根；页面内容受 C13 fail-closed gate 约束。 |
| C07 | ADD | Main Knowledge Upload Job Coordinator 和持久生命周期。 | Proposed Main Job Owner | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | backend renderer_ui rollback | 与本地解析 FileJobQueue 区分。 |
| C08 | MODIFY | File import contract 支持 Knowledge Job association。 | Work Main File Platform | `apps/work/src/shared/files/file-ipc.ts#FileImportContext` | backend renderer_ui rollback | 不伪造 sessionId，不改变 Chat 语义。 |
| C09 | ADD | sanitized Job snapshot/event/action preload contract。 | Shared Contract + Preload | `apps/work/src/preload/knowledge-job-api.ts` | backend renderer_ui rollback | Main 负责身份与输入校验。 |
| C10 | REMOVE | Work production path 中的 mock upload、`MockUploadFile` 与 fake completion。 | Knowledge migration scope | `apps/work/src/renderer/src/screens/Knowledge/pages/` | renderer_ui | 测试 fixture 可保留但不可成为生产 repository interface。 |
| C11 | ADD | Provider capability gate 和 unavailable UI。 | Main Job Owner + Renderer | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | backend renderer_ui rollback | 无真实 provider 时不得宣称上传完成。 |
| C12 | KEEP | Chat、Skill Run、Settings、Profile 和现有连接模式。 | Existing Work owners | `apps/work/src/renderer/src/screens/Layout/Layout.tsx` | renderer_ui | Knowledge 不改变其行为或 ownership；Knowledge 问答不加入 Work Chat Run。 |
| C13 | ADD | 知识实体读取 fail-closed gate：dashboard/list/detail/chat 无真实 provider 时只展示 unavailable/empty。 | Main capability probe（与 C11 同一探测）+ Knowledge Renderer | `apps/work/src/renderer/src/screens/Knowledge/pages/` | backend renderer_ui rollback | 不使用 `MockKnowledgeRepository` 或 fixture 内容；不发明本 Stage 远端读取 API。 |

## Replacement / Removal Matrix

| Existing | Action | Replacement | Removal Condition |
|---|---|---|---|
| Migrated pages' TanStack Memory Router, generated `routeTree`, and Router hooks (`useParams` / `Link` / `createFileRoute`) | REMOVE from Work production path | Host-instantiated Knowledge route-scope owner + typed Route Descriptor | Work 运行路径不再 import `@tanstack/react-router` 作为 Knowledge 导航。`apps/knowledge` 源树可保留至后续归档 RM。 |
| Knowledge `KnowledgeAuthProvider` / Login / token store / endpoint IPC | REMOVE from Work production path | Existing Work `desktopAuth` + Main token store | Work 不挂载 Knowledge 登录页，也不复制 `safeStorage` session 文件格式。源应用可保留至归档 RM。 |
| `MockUploadFile`, Renderer timer/`forceFail` upload as production interface | REMOVE from Work production path | Main Knowledge Upload Job + provider capability gate (`blocked_provider_unavailable`) | 生产 UI 不得出现 fake progress/completed。测试 fixture 可保留，但不是 production repository contract。 |
| `MockKnowledgeRepository`, fixture dashboard/list/detail/chat, and sendable mock Q&A as production interface | REMOVE from Work production path | Same Main capability probe as C11 + fail-closed unavailable/empty Renderer | 生产 UI 不得出现 fixture 列表或可发送 mock 问答。测试 fixture 可保留，但不是 production repository contract。 |
| Knowledge 独立 AppShell / Profile / Preferences / 全局 Sidebar | REMOVE from Work production path | Work Layout + existing Settings/Profile Modal + Work i18n/theme | 业务页面只进入 Work 主内容区。 |
| Chatbox `references/chatbox` knowledge-base | KEEP out | None | 禁止作为本 Stage 迁移源或第二 Knowledge Owner。 |

## Compatibility Contract

| Compatibility | Current Consumer | Reason | Removal Condition |
|---|---|---|---|
| `FileImportContext.sessionId` required for Chat import | Work Chat / File Platform | KEEP Chat 语义；Knowledge 不填伪造 sessionId，而是走可判别的 Job consumer context | 仅当后续 Architecture 把导入上下文升级为显式 consumer union 且 Chat 已迁移完毕 |
| `FileAssociation.sessionId?` / `taskId?` | Chat message/context, Skill Run/Expert artifacts | KEEP 现有可选字段；Knowledge Job association 不得占用 Chat sessionId | 本 Stage 不删除这些字段 |
| `FileJobQueue` local parse jobs / `file-job:*` events | File Platform parsers | KEEP；Knowledge Upload Job 不复用这些事件名冒充远端 ingestion | 无 |
| Work `View` union without `knowledge` | Layout / `navigation:goto` | MODIFY 只增加一个 view token；现有 view 行为不变 | 无 |
| `apps/knowledge` 独立 Electron 应用 | 本地 demo | KEEP 作为对照源，不由 Work 打包 | 后续独立归档 RM |

## Frontend Design Intent

| Change ID | Surface | Framework | Layout | Component Map | State Ownership | Interaction States | Design System | Responsive | Visual Verification |
|---|---|---|---|---|---|---|---|---|---|
| C01 | Work Layout sidebar + Knowledge workspace (`Layout.tsx` `View`/`PINNED_NAV_ITEMS`) | REACT | NEW_HIERARCHY:在既有 Work 主内容区增加独立 Knowledge pane | EXTEND Work Layout/Sidebar | SHARED:Work owns active/visited | first-load、active、hidden、restore | REUSE Work tokens、spacing、focus 与 sidebar primitives | UNCHANGED | INTERACTION |
| C02 | Knowledge View root in Work content region | REACT | NEW_HIERARCHY:独立 Knowledge pane 常驻 | NEW KnowledgeView root | SHARED:Knowledge root owns module UI | first-load、active、hidden、restore、module-load-error | REUSE Work tokens、spacing、focus primitives | UNCHANGED | INTERACTION |
| C03 | Knowledge workspace navigation | REACT | MODIFY:页面内容由 typed Route Descriptor 选择 | NEW RouteHost；REMOVE TanStack route tree/hooks | NEW_OWNER:host-instantiated route scope | push、replace、back、reset、invalid-route fallback | REUSE Work page header、button、breadcrumb 与 focus primitives | UNCHANGED | INTERACTION |
| C04 | Knowledge route-scope host | REACT | MODIFY:独立 scope 实例 | NEW route-scope owner | NEW_OWNER:非模块级 singleton | push、replace、back、reset | REUSE Work navigation primitives | UNCHANGED | INTERACTION |
| C05 | Knowledge identity in Work | REACT | MODIFY:移除独立 Shell/Login | REMOVE AppShell/Login/Profile/Preferences | MOVE_OWNER:身份转由 Work desktopAuth | loading、error | REUSE Work typography 与 dialog primitives | UNCHANGED | INTERACTION |
| C06 | Knowledge pages in Work | REACT | MODIFY:适配 Work content region | EXTEND 业务页面 | LOCAL:页面临时状态留在模块 | loading、empty、unavailable、content、error | REUSE Work typography、colors、dialog、table、form 与 toast primitives | MODIFY:遵循 Work 主内容区最小宽度和滚动 owner | LIVE_VISUAL |
| C07 | Upload Jobs workspace snapshot | REACT | MODIFY:展示权威 Job snapshot | EXTEND Upload Jobs UI | SHARED:Main owns lifecycle，Renderer owns filters | draft、queued、uploading、processing、completed、failed、cancelled、interrupted、unavailable | REUSE Work progress、status、error primitives | UNCHANGED | LIVE_VISUAL |
| C08 | File select/import/preview flow | REACT | MODIFY:在 Knowledge 页面复用 Work file interaction | EXTEND Work file picker/preview consumer；REMOVE filename-only upload | SHARED:File Platform owns bytes，Knowledge UI owns selection intent | selecting、importing、validation-error、ready、preview-error | REUSE Work file picker、preview、error 与 accessibility primitives | UNCHANGED | INTERACTION |
| C09 | Knowledge Job sanitized events in UI | REACT | MODIFY:订阅 sanitized snapshot/event | EXTEND Upload Jobs event consumer | SHARED:Main owns events，Renderer owns presentation | snapshot、event-gap、reconnect | REUSE Work status 与 toast primitives | UNCHANGED | INTERACTION |
| C10 | Remove mock upload UI | REACT | MODIFY:去掉 timer/fake progress | REMOVE timer/fake progress UI | UNCHANGED | unavailable | REUSE Work empty-state primitives | UNCHANGED | INTERACTION |
| C11 | Provider unavailable UI | REACT | MODIFY:capability gate 展示 | EXTEND unavailable status | SHARED:Main owns probe，Renderer owns copy | unavailable | REUSE Work status 与 error primitives | UNCHANGED | LIVE_VISUAL |
| C12 | Existing Chat/Skill Run/Settings surfaces | REACT | UNCHANGED | REUSE existing Chat and Settings surfaces | UNCHANGED | active、hidden | REUSE Work Chat primitives | UNCHANGED | INTERACTION |
| C13 | Knowledge Home/Bases/Sets/Documents/Chat content | REACT | MODIFY:无 provider 时页面可达但内容 fail-closed | EXTEND 业务页面 empty/unavailable；REMOVE MockKnowledgeRepository 生产读取 | SHARED:Main owns capability probe，Renderer owns unavailable/empty presentation | unavailable、empty、content、query-error | REUSE Work empty-state、status 与 error primitives | UNCHANGED | LIVE_VISUAL |

## Backend Design Intent

| Change ID | Owner | Contract | Data/Transaction | Auth | Idempotency/Concurrency | Failure Semantics | Observability |
|---|---|---|---|---|---|---|---|
| C07 | Proposed Main Knowledge Upload Job Coordinator | COMPATIBLE_EXTEND | MIGRATION | NEW_BOUNDARY | REQUIRED | 启动恢复非终态 Job；无法协调时单调进入 interrupted 或 provider-unavailable；终态不可回退。 | 记录 Job ID、attempt、阶段、持续时间、恢复结果和脱敏错误码；禁止 token/path/payload。 |
| C08 | Existing Work Main File Platform | COMPATIBLE_EXTEND | TRANSACTIONAL | MODIFY | REQUIRED | draft Job、ManagedFile 和 association 任一步失败都产生可清理结果；引用存在时禁止物理删除。 | 记录 consumer kind、Job ID、ManagedFile ID、association 结果和 cleanup 决策，不记录本地绝对路径。 |
| C09 | Work Shared Contract + curated Preload + Main handler | COMPATIBLE_EXTEND | WRITE | NEW_BOUNDARY | REQUIRED | 非法、跨身份、重复或乱序命令返回稳定安全错误；Renderer 断开不取消 Main Job。 | IPC 命令结果、授权拒绝、事件序号/丢失恢复和 handler latency 可关联到 Job ID。 |
| C11 | Main Job Owner + Remote Provider Adapter | COMPATIBLE_EXTEND | READ_ONLY | MODIFY | REQUIRED | provider 缺失或 capability probe 失败时 fail closed 到 blocked_provider_unavailable，不进入 fake active/completed。 | capability 状态、最近成功探测时间和脱敏失败类别可观测；不暴露 provider 原始错误。 |
| C13 | Main capability probe（与 C11 同一探测）+ Knowledge Renderer | COMPATIBLE_EXTEND | READ_ONLY | MODIFY | REQUIRED | provider 缺失时 dashboard/list/detail/chat fail-closed 到 unavailable/empty；禁止 mock repository 内容。 | 与 C11 共用 capability 观测；页面可达但不返回 fixture 实体或 mock 问答。 |

持久 Job 需要新增隔离的数据结构和兼容升级路径，因此 `schema_migration=true`。该 migration 只允许新增 Knowledge Job/attempt/association 所需结构，不重写现有 Chat/Skill Run 文件行；原子边界至少保证 Job identity 与其 ManagedFile association 不会形成无法清理的半提交状态。精确表、字段和迁移文件属于 Plan grounding，不在 PRD 中指定。

## Ops Design Intent

| Change ID | Deployment Impact | Compatibility | Environment/Config | Health | Migration Order | Rollback | Live Verification |
|---|---|---|---|---|---|---|---|
| C07 | RESTART | BACKWARD_COMPATIBLE | 本 Stage 不引入生产 Knowledge provider URL；缺失即 fail-closed | Main 启动必须恢复或单调结束非终态 Job；禁止无 Owner 的 uploading/processing | 先增加隔离的 Job/attempt/association 存储，再启用 Coordinator 与 IPC | 关闭 Knowledge View/IPC；保留未读的附加存储，不回写 Chat/Skill Run 文件行 | SMOKE |
| C08 | RESTART | BACKWARD_COMPATIBLE | 无新部署拓扑；沿用现有 userData File Platform | association 与 ManagedFile 引用计数可诊断；禁止仍被引用时物理删除 | Chat import 合同保持可运行后再叠加 Knowledge Job consumer | 停用 Knowledge consumer；Chat `sessionId` 导入路径保持原语义 | SMOKE |
| C09 | RESTART | BACKWARD_COMPATIBLE | Preload/Main 随应用重启加载；无独立服务端口 | 非法/跨身份命令返回稳定安全错误；Renderer 断开不取消 Main Job | 先冻结 sanitized contract，再注册 handler | 卸载 Knowledge preload API 后现有 `desktopAuth`/`hermesAPI.files` 不受影响 | SMOKE |
| C11 | NONE | UNCHANGED | 无真实 provider 配置项 | capability probe 失败进入 blocked_provider_unavailable | 先于任何 fake upload UI 启用 gate | 去掉 Knowledge View 即无 provider 探测 | NOT_REQUIRED |
| C13 | NONE | UNCHANGED | 无真实 provider 读取配置；缺失即 fail-closed | 无 provider 时 list/detail/chat 只呈现 unavailable/empty | 与 C11 同一 gate，先于任何 fixture/mock 内容启用 | 去掉 Knowledge View 即无实体读取探测 | NOT_REQUIRED |

## Observable Behaviour

### View navigation and retained state

用户从 Chat 进入 Knowledge，再切回 Chat 时，Chat Run、消息、草稿和执行状态不变。再次进入 Knowledge 时，显示切换前的 route 和可恢复 UI state；Knowledge 第一次访问前可以惰性加载，第一次访问后不重建模块根。

### Hidden activity

`active=false` 时，Knowledge 停止可见性专用轮询、动画帧和模块级全局快捷键；Main Job 继续运行并持久化。Renderer 可以保留一个低成本的事件订阅，也可以重新激活时拉取权威 snapshot，但不能依赖隐藏页面的定时器推进 Job。

### Upload continuity and provider gate

用户选择文件时先得到同一身份下的 draft Job，再完成 ManagedFile import/association。切换 View 不重复创建 Job。无真实 provider 时 UI 显示 unavailable，Job 保留明确状态；本 Stage 不把 contract adapter 的模拟结果显示为真实上传完成。

### Entity reads without provider

用户打开 Knowledge 首页、知识库、知识集、文档或知识问答时，页面可达。无真实 provider 时只看到明确 unavailable 或 empty，看不到 fixture 列表、假知识库卡片或可发送的 mock 问答。Knowledge 问答会话不出现在 Work Chat Run 列表中，也不占用 Chat `sessionId`。

### Errors and recovery

UI 区分本地导入失败、provider unavailable、上传失败、processing 失败、认证失效、连接中断和不可恢复旧 Job。可重试错误提供按 Job ID 的幂等重试；不可重试错误提供稳定终态和可安全展示的信息。

## Acceptance Criteria

- **AC-01**：[C01/C02/C12] 首次进入 Knowledge 后切换到 Chat，再次进入 Knowledge，Knowledge 恢复同一 route snapshot；当前 Chat Run、消息、草稿和执行状态不变。
- **AC-02**：[C01/C03] Knowledge 内部页面导航不改变 Work 窗口 URL/history，不新增顶层 Router；现有 Work View、菜单和 `navigation:goto` 行为保持可用。
- **AC-03**：[C03/C04] Route Descriptor 覆盖本 Stage 页面；route owner 不是模块级 singleton，并可由不同 host scope 独立实例化而互不修改。产品只创建一个默认 scope，不包含 tab collection 或跨 tab back stack。
- **AC-04**：[C07/C08/C09] 文件导入先关联 Main 创建的 Knowledge draft Job；不要求或伪造 Chat `sessionId`，Renderer 不能覆盖 profile/tenant，隐藏/再显示后仍观察同一 Job ID。
- **AC-05**：[C02/C07/C11] Knowledge 隐藏 30 秒期间，UI-only polling、animation frame 和模块级全局快捷键调用计数为 0；Main Job snapshot 可继续变化或稳定进入 provider-unavailable 状态，重新激活后一次同步收敛。
- **AC-06**：[C07/C09] Renderer reload 或应用重启后，每个非终态 Job 恢复并协调，或进入明确的 `interrupted`/`blocked_provider_unavailable`；不存在永久无 Owner 的 `uploading`/`processing`。
- **AC-07**：[C07/C09] 对同一 Job 重复 cancel/retry 命令和重复/乱序事件不会产生不可区分的重复 attempt，也不会让终态回退。
- **AC-08**：[C05/C07/C09] 登出、同 tenant 不同 auth subject、跨 tenant、tenantId 缺失的 personal scope、Work profile 切换和重新登录场景均按 `{workProfileId, authSubject, tenantScope}` 隔离；不匹配身份看不到旧 cache/snapshot 且 Job 命令被拒绝，Renderer 无法读取 token、绝对路径或 provider 原始错误。
- **AC-09**：[C06/C10/C12/C13] 首页、知识库、知识集、文档、上传任务和知识问答页面可在 Work View 中到达，且无真实 provider 时只展示明确 unavailable/empty，不出现 fixture 列表或可发送的 mock 问答；独立 Login/Profile/Preferences/AppShell/TanStack route tree 不可从 Work production path 到达；Knowledge 问答不接入 Work Chat Run / Skill Run，也不把会话 ID 写入 Chat `FileImportContext.sessionId`。
- **AC-10**：[C08] Knowledge association 清理不删除仍被 Chat、Skill Run 或其他 Job 引用的 ManagedFile；现有 Chat import/association/preview 行为保持不变。
- **AC-11**：[C10/C11/C13] 无真实 Knowledge provider 时，生产 UI 显示明确 unavailable/blocked 状态，不出现 mock 数据、fake progress 或 fake completed；`MockUploadFile` 与 `MockKnowledgeRepository` 均不属于 Work production repository contract。
- **AC-12**：[C06/C12] Work production source 不跨根 import `apps/knowledge`；Knowledge 激活、隐藏、导入失败和 Job 状态变化不改变 Settings/Profile Modal、Chat/Skill Run 或现有连接模式行为。

## Acceptance Claim Ledger

| Claim ID | AC | Blocking | Prior Evidence | Prior Result | Evidence Action | Required Observable Evidence |
|---|---|---|---|---|---|---|
| CL01 | AC-01/02 | YES | Work Layout visited/display gating | PROVEN_BUT_AFFECTED | TARGETED_RERUN | View interaction test + Chat state regression。 |
| CL02 | AC-03 | YES | Knowledge route/page inventory | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Route coverage、非 singleton 和独立 host-scope 行为证据。 |
| CL03 | AC-04/05 | YES | Renderer mock timer | NOT_PRODUCTION_PROOF | NEW_EVIDENCE | Main Job snapshot survives hidden View；hidden-effect counters deterministic。 |
| CL04 | AC-06/07 | YES | Work FileJobQueue local parse semantics | NOT_APPLICABLE_TO_REMOTE_JOB | NEW_EVIDENCE | Main restart/recovery, duplicate command and event-order tests。 |
| CL05 | AC-08 | YES | Work Auth public state/token ownership | PROVEN_BUT_AFFECTED | TARGETED_RERUN | profile/tenant partition and command rejection tests。 |
| CL06 | AC-09/12 | YES | Knowledge pages and GES app boundary profile | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | migrated page reachability with unavailable/empty (no fixture/mock Q&A), Knowledge Chat isolated from Work Chat Run, forbidden import and dead production path checks。 |
| CL07 | AC-10 | YES | Work File Platform Chat associations | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Knowledge association ref/cleanup plus Chat regression tests。 |
| CL08 | AC-11 | YES | Remote repository unimplemented; mock default exists | FAILED_RESIDUAL_GAP | NEW_EVIDENCE | production capability gate for upload and entity reads; no mock lists/Q&A; no-fake-success tests。 |

任何 Blocking Claim 未关闭时，不得把 Roadmap Item 标记 DONE；真实 provider 的端到端成功不属于本 Stage Claim，必须在其后续 Roadmap Item 中作为 blocking acceptance 单独关闭。

## Evidence Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL01 | AC-01/02 View 保活与 URL 隔离 | 首次访问后切换 Chat 再回 Knowledge 恢复同一 route snapshot；Chat Run/草稿不变；窗口 history 无 `/knowledge` | YES | Layout `visitedViews`/`paneStyle`/Chat display gating at grounded HEAD | PROVEN_BUT_AFFECTED | TARGETED_RERUN | 新增 `knowledge` View 改变 Layout 导航集合 |
| CL02 | AC-03 模块状态路由与可实例化 scope | Route Descriptor 覆盖本 Stage 页面；两个 host scope 互不修改；产品只创建一个默认 scope | YES | Knowledge TanStack Memory Router + feature pages | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Work 生产路径必须替换 Router hooks |
| CL03 | AC-04/05 Job 权威生命周期与 hidden-effect | 导入先绑定 Main draft Job；隐藏 30s UI-only polling/rAF/快捷键计数为 0；Main snapshot 仍可变化或进入 unavailable | YES | Knowledge `useUploadJobs` 1s refetch；Renderer timer upload | NOT_PRODUCTION_PROOF | NEW_EVIDENCE | UI timer 不能证明 Main Job |
| CL04 | AC-06/07 恢复与幂等 | 重启后非终态 Job 恢复或 interrupted/unavailable；重复 cancel/retry 不回退终态 | YES | FileJobQueue 仅本地 parse | NOT_APPLICABLE_TO_REMOTE_JOB | NEW_EVIDENCE | 新 Owner 与 parse queue 不同生命周期 |
| CL05 | AC-08 身份分区 | `{workProfileId, authSubject, tenantScope}` 隔离；Renderer 无 token/绝对路径/原始 provider 错误 | YES | `desktopAuth` public state + Layout `activeProfile` | PROVEN_BUT_AFFECTED | TARGETED_RERUN+NEW_EVIDENCE | 新 Job/cache 分区键 |
| CL06 | AC-09/12 页面可达、fail-closed 内容与禁止跨根 | 六个业务页面在 Work View 可达且无真实 provider 时为 unavailable/empty；无 fixture/mock 问答；Knowledge Chat 不接入 Work Chat Run；无独立 Shell/Auth/TanStack；无 `apps/knowledge` runtime import | YES | Knowledge features/routes；GES app-profile forbidden_roots；mock repository 为源默认 | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | 迁移后生产路径必须重证 fail-closed 读取 |
| CL07 | AC-10 association 清理 | Knowledge 清理不删仍被 Chat/Skill Run/其他 Job 引用的 ManagedFile；Chat import 回归 | YES | FileAssociation 引用与 Chat import | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | 新 consumer 不得破坏现有引用计数 |
| CL08 | AC-11 无 fake success / mock 实体 | 无真实 provider 时生产 UI 为 unavailable/blocked；无 mock 数据、fake progress、fake completed；无 `MockUploadFile` / `MockKnowledgeRepository` production contract | YES | `RemoteKnowledgeRepository` unimplemented；mock 为 Knowledge 默认 | FAILED_RESIDUAL_GAP | NEW_EVIDENCE | mock 默认不得进入 Work 生产路径 |

Evidence Baseline 只冻结可观察 scenario requirement，不绑定测试文件名、private symbol 或 Todo ownership。Acceptance Claim Ledger 与本表 Claim ID 对齐。

## Source Anchors

| Evidence Area | Source Anchor | Proven Fact |
|---|---|---|
| Work routing policy | `.agents/skills/smc-work-router/` | GES 5 Work Facts v2 和 FULL profile 路由规则。 |
| GES install identity | `.smc/consumer-bootstrap/install-identity.json`、`.smc/ges-install-receipt.json` | bundle 5.0.0、5.0.7 feature slice、transaction PASS、非干净 release attestation。 |
| Frontend context | `.agents/ges/frontend/apps-registry.json`、`.agents/ges/frontend/apps/{work,knowledge}/` | 两个 React Electron app baseline、边界、surface/component inventory 和 FRESH lock。 |
| Work View lifecycle | `apps/work/src/renderer/src/screens/Layout/Layout.tsx` | `View` 无 `knowledge`；`visitedViews` 首次访问后挂载；`paneStyle` 用 `display:none` 切换；Chat run 按 `view === "chat" && runId === activeRunId` 显示。侧栏入口来自 `PINNED_NAV_ITEMS` / `FOOTER_NAV_ITEMS`。 |
| Work file IPC | `apps/work/src/shared/files/file-ipc.ts`、`apps/work/src/shared/files/file-association.ts`、`apps/work/src/main/files/` | `FileImportContext.sessionId` 必填；`FileAssociation.sessionId`/`taskId` 可选；ManagedFile/导入/预览/本地 parse Job 位于 Main。 |
| Work file parse jobs | `apps/work/src/main/files/jobs/file-job-queue.ts`、`apps/work/src/shared/files/file-job.ts` | `FileJobQueue` 与 `file-job:*` 只服务本地解析，不是 Knowledge ingestion。 |
| Work auth | `apps/work/src/shared/auth/auth-contract.ts`、`apps/work/src/preload/auth-api.ts`、`apps/work/src/preload/index.ts` | `window.desktopAuth` 暴露公共 `DesktopAuthState`；token 留在 Main。 |
| Knowledge routes/pages | `apps/knowledge/src/routes/`、`apps/knowledge/src/features/`、`apps/knowledge/src/utils/routes.ts` | Home/Bases/Sets/Documents/Uploads/Chat 页面；Memory Router；业务页依赖 Router hooks。 |
| Knowledge standalone host | `apps/knowledge/src/app.tsx`、`apps/knowledge/src/main.ts`、`apps/knowledge/src/preload.ts`、`apps/knowledge/src/components/layout/` | 需排除的独立 Shell、Electron、Auth 和应用生命周期。 |
| Knowledge repository | `apps/knowledge/src/services/knowledge/` | `MockKnowledgeRepository` 为源默认；`RemoteKnowledgeRepository` 未实现。二者都不是 Work 生产读取 Owner。 |
| Knowledge upload mock | `apps/knowledge/src/features/uploads/`、`apps/knowledge/src/stores/upload-job-store.ts`、`apps/knowledge/src/types/knowledge-document.ts` | `MockUploadFile`、filename-only 输入、Renderer timer、活跃任务 1s refetch。 |
| Knowledge domain docs | `apps/knowledge/lat.md/` | 源应用架构/领域/mock 边界；只作迁移对照，不是 Work 运行时。 |
| Non-production Chatbox KB | `apps/work/references/chatbox/` | 归档 knowledge-base 实现；禁止作为本 Stage Owner。 |
| Work architecture docs | `apps/work/lat.md/project-structure.md`、`apps/work/lat.md/file-platform.md`、`apps/work/lat.md/sidebar-navigation.md` | Main/Preload/Renderer、File Platform 与侧栏当前职责；本 PRD 阶段不改产品文档。 |

## Risks and Kill Criteria

| Risk | Severity | Mitigation / Kill Criterion |
|---|---|---|
| 把 View 保活误当上传可靠性 | HIGH | Job 必须由 Main/provider Owner 推进；若依赖 React component、Query observer、timer 或内存 `File`，AC-04/05/06 失败。 |
| 没有真实 provider 却展示成功 | HIGH | capability gate 必须阻止 fake progress/completed 与 fixture/mock 实体；否则 AC-11 失败。 |
| 页面可达被 mock 列表满足 | HIGH | AC-09 要求可达且 unavailable/empty；出现 fixture 列表或可发送 mock 问答则失败。 |
| 伪造 sessionId 污染 Chat association | HIGH | 使用 Knowledge Job association；任何 fake Chat Session 方案终止。 |
| 新 Job Owner 与 FileJobQueue 边界重叠 | HIGH | Architecture 必须冻结两者职责、复用 primitive 和故障恢复；未批准则不进入 Plan。 |
| 身份切换造成数据串用 | HIGH | profile/tenant 分区、Main 授权、logout 隐藏和命令拒绝必须同时满足。 |
| File cleanup 删除共享文件 | HIGH | 引用感知清理；未证明 Chat/Skill Run 回归则 AC-10 失败。 |
| 隐藏 View 持续消耗资源 | MEDIUM | AC-05 以固定窗口和调用计数验证 UI-only effect 停止。 |
| 为未来 tabs 过度建设 | MEDIUM | 当前只要求 route owner 可独立实例化，不预建 tab collection、跨 tab back stack 或 tab UI。 |
| 跨应用根直接复用源码 | HIGH | 遵守 GES app boundary；发现 Work runtime import `apps/knowledge` 则 AC-12 失败。 |

## Definition of Done

- **DOD-01**：所有 AC-01 至 AC-12 的 Blocking Claim 有当前 grounded commit 对应的新证据或明确复用证据。
- **DOD-02**：独立 PRD Review 为 PASS，deterministic converge 把 PRD 置为 APPROVED。
- **DOD-03**：对应 Architecture Decision 已 APPROVED，Roadmap RM-01 已绑定本 Stage PRD；在 canonical Plan 批准前不得实现。
- **DOD-04**：后续实施通过 Work 类型检查、边界 guard、相关单元/组件/集成回归和 `lat check`。
- **DOD-05**：Work 运行路径没有第二套 Shell/Auth/Router/File Platform，也没有 fake production upload 或 mock 实体读取。

## Roadmap Boundary

后续独立工作项包括：真实 Knowledge provider API/IPC 与端到端上传验收；服务端权限、存储、解析、Embedding 和 RAG；多页签 UI 与恢复；URL/deep-link 投影；Knowledge 与 Work Chat 的引用/搜索/上下文注入；独立 `apps/knowledge` 的最终归档或删除；通用 Business Module Registry。

## Open Governance Finding

Architecture Decision `AD-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW` 已 APPROVED；Roadmap RM-01 已绑定本 Stage PRD（IN_PRD）。剩余闸门是 canonical Plan 与 post_review 实施。真实 Knowledge provider 仍属 RM-02，不在本 Stage 关闭。
