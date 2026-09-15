---
decision_id: AD-WORK-KNOWLEDGE-v1.0-INDEPENDENT-VIEW
version: 1.0.0
status: APPROVED
target_branch: work/prd-v5.0
review_verdict: PASS
approved_at: 2026-09-15T13:14:18.264199+08:00
source_revision: PRD-WORK-KNOWLEDGE-01@v1.3.0/f1-read-gate-revision
grounded_commit: fa02f4c00d8f425a2b24787cca592ac7ecb5875d
---

# Architecture Decision: Work Knowledge 独立 View 与 Main Upload Job

## Problem

Work 需要把 `apps/knowledge` 的业务页面迁入主窗口，作为与 Chat 并列的独立 View。当前仓库没有 `knowledge` View、没有 Knowledge ingestion Job Owner、没有可判别的非 Chat 文件导入消费者，也没有真实 Knowledge provider。

若不冻结 Owner 与边界，实现会落入以下错误之一：把 Knowledge 做成第二套 Electron/Auth/Router；用 `FileJobQueue` / `file-job:*` 冒充远端上传；向 `FileImportContext.sessionId` 填伪造 Chat Session；或用 `MockKnowledgeRepository` 填满首页/列表/问答以满足“页面可达”。

本 Decision 回答 APPROVED Stage PRD `WORK-KNOWLEDGE-01` 留给 Architecture 的缺口：新 Main Job Owner 与 FileJobQueue 的职责切分、Knowledge Job association / IPC 的公共契约形状、身份分区与恢复生命周期、以及无真实 provider 时的读取门控。它不重新选择 PRD 已批准的 Stage 范围。

## Decision Drivers

1. Knowledge 必须是 Work Layout 的独立 View，复用 `visitedViews` / 可见性保活；不得新增全局 URL Router，也不得做成 Settings Modal。
2. 顶层导航、Chat Run、File Platform 字节、Work Auth 必须保持现有 Owner；只新增无法由现有能力扩展的 Owner。
3. 本地 parse Job 与远端 Knowledge ingestion 生命周期不同，禁止共用 `file-job:*` 事件名或把 parse queue 当作上传事实源。
4. Knowledge 导入不得伪造 Chat `sessionId`；Chat `FileImportContext.sessionId` 语义 KEEP。
5. 无真实 Knowledge provider 时，上传与 dashboard/list/detail/chat 读取都必须 fail-closed；禁止 mock 成功或 fixture 内容。
6. Knowledge 问答与 Work Chat Run / Skill Run 同名不同生命周期，禁止接入 Hermes Chat 或占用 Chat Session。
7. GES app boundary 禁止 Work 运行时跨根 import `apps/knowledge`。
8. 本 Stage 不发明真实远端 Knowledge API；精确表结构、IPC 字段名和 Todo 属于后续 Plan。

## Evidence Baseline

| Claim | Type | Evidence |
|---|---|---|
| Stage 范围、Change C01–C13、fail-closed 读取与 AC-01–AC-12 已 APPROVED | USER_CONSTRAINT | `docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md` v1.3.0 |
| Work `View` 无 `knowledge`；侧栏来自 `PINNED_NAV_ITEMS` / `FOOTER_NAV_ITEMS`；`visitedViews` + `paneStyle` 已保活 | REPO_FACT | `apps/work/src/renderer/src/screens/Layout/Layout.tsx` |
| `FileImportContext.sessionId` 必填；当前导入按 Chat Session 语义 | REPO_FACT | `apps/work/src/shared/files/file-ipc.ts` |
| `FileAssociation.sessionId` / `messageId` / `taskId` 已可选 | REPO_FACT | `apps/work/src/shared/files/file-association.ts` |
| `FileJobQueue` 是本地并发队列；`file-job:*` 只服务 parse | REPO_FACT | `apps/work/src/main/files/jobs/file-job-queue.ts`；`apps/work/src/shared/files/file-job.ts` |
| Renderer 只见 `DesktopAuthState`；`DesktopAuthUser.id` 与可选 `tenantId`；token 在 Main | REPO_FACT | `apps/work/src/shared/auth/auth-contract.ts`；`apps/work/src/preload/auth-api.ts` |
| Knowledge 源应用默认 `MockKnowledgeRepository`；remote adapter 未实现 | REPO_FACT | `apps/knowledge/src/services/knowledge/` |
| Knowledge 上传是 Renderer timer / `MockUploadFile`，不是真实字节传输 | REPO_FACT | `apps/knowledge/src/stores/upload-job-store.ts`；`apps/knowledge/src/types/knowledge-document.ts` |
| GES 禁止 Work↔Knowledge 跨根 | REPO_FACT | `.agents/ges/frontend/apps/work/app-profile.json`；`.agents/ges/frontend/apps/knowledge/app-profile.json` |
| Chatbox `references/chatbox` 知识库不是生产路径 | REPO_FACT | `apps/work/references/chatbox/` |
| 可复用 FileJobQueue 调度 primitive 而不复用 parse 事件语义 | INFERENCE | FileJobQueue `kind` 是调试标签，事件合同绑定 parse |
| 本 Stage 无真实 Knowledge 服务端 | ASSUMPTION | 与 PRD Out of Scope 一致；后续独立 RM 才引入 provider |

## Current Capability

| Capability | State | Current Production Owner |
|---|---|---|
| Work 顶层 View 保活与侧栏 | EXISTS | Work Renderer Layout |
| Chat Run 生命周期 | EXISTS | Existing Chat owners |
| Work 身份 / token | EXISTS | Work Main Auth / `desktopAuth` |
| ManagedFile、导入、预览、引用清理 | EXISTS / PARTIAL | Work Main File Platform；导入消费者仅 Chat Session |
| 本地 parse / index Job | EXISTS | `FileJobQueue` + `file-job:*` |
| Knowledge 业务页面与领域类型 | EXISTS / CONFLICT | `apps/knowledge` Renderer + TanStack Memory Router + 独立 Auth/Shell |
| Knowledge 上传执行 | MOCK ONLY | Knowledge Renderer store / timer |
| Knowledge 实体读取 | MOCK ONLY / MISSING | `MockKnowledgeRepository` 默认；`RemoteKnowledgeRepository` 未实现 |
| Knowledge Upload Job | MISSING | 无 |
| Knowledge Job IPC | MISSING | 无 |
| 真实 Knowledge provider | MISSING | OUT of this architecture |

## Options Considered

| Option | Reuse | Owner/Boundary Impact | Risks | Decision |
|---|---|---|---|---|
| A. Layout 独立 View + 模块状态路由 + Main Knowledge Job Coordinator + 可判别 Job association + 共用 capability probe 的 fail-closed 读取 | 扩展 Layout、File Platform、Auth、Preload；新增 Job Owner | 新 Owner 仅覆盖 ingestion Job / capability / 恢复；读取展示留在 Knowledge Renderer | 需隔离 Job 存储与 IPC | **SELECT** |
| B. Settings Modal / overlay 承载 Knowledge | 复用 Modal host | 把一级产品面降为设置附属，破坏 View 保活与 Chat 并列 | 隐藏后状态与 Job 更难分离 | REJECT |
| C. WebView / 子进程 / 运行时跨根加载 `apps/knowledge` | 复用源应用 Shell | 第二套 Electron/Auth/Router；违反 GES `forbidden_roots` | 双宿主、双身份 | REJECT |
| D. 用 `FileJobQueue` + `file-job:*` 作为 Knowledge 上传事实源 | 最大复用队列 | parse 与远端 ingestion 生命周期混用；隐藏 View 时事件语义错误 | fake progress、无法恢复远端态 | REJECT |
| E. 伪造 Chat `sessionId` 走现有导入 | 零合同改动 | 污染 Chat association / 清理 / 历史 | 跨产品引用无法拆分 | REJECT |
| F. 生产使用 `MockKnowledgeRepository` 直到远端就绪 | 复用 demo 数据 | 页面“可达”但内容为假；与 AC-11/C13 冲突 | 用户以为知识库已可用 | REJECT |
| G. 本 Stage 做通用 Module Registry 或多页签 host | 过早抽象 | 新控制面，无当前消费者 | 范围膨胀 | REJECT |
| H. Knowledge 问答接入 Work Chat Run | 复用 Chat sessionId / transcript | 两个执行事实源合并 | 假 Session、Skill Run 串扰 | REJECT |

## Decision

选择 Option A。

Work Layout 增加唯一顶层 `knowledge` View。首次访问后根模块保持挂载；切换只改变可见性。内部导航是 host 可实例化的模块状态路由，不是窗口 URL / TanStack Router。本 Stage 只创建一个默认 `routeScopeId`；不交付 tab collection。

上传与处理的权威 Owner 是 **Main Knowledge Upload Job Coordinator**（NEW_OWNER）。它可以复用 FileJobQueue 的并发/调度 primitive，但：

- 不得使用 `file-job:*` 事件名；
- 不得把 parse/index `kind` 当作 Knowledge ingestion；
- 不得让 Renderer timer、Query refetch 或内存 `File` 推进 Job。

权威流程：Main 先创建绑定当前身份与目标知识库的 draft Job → File Platform 以 Knowledge Job association 导入 ManagedFile → Coordinator 做 capability 判定、提交、进度、取消、重试、恢复与终态。Renderer 只发幂等命令并消费 sanitized snapshot/event。

无真实 provider 时，Job 只能进入明确 unavailable/blocked，不得进入 fake `uploading` / `completed`。Capability probe 由同一 Main Owner 持有；dashboard/list/detail/chat 读取共用该探测结果。无 provider 时页面可达，内容只允许 unavailable/empty。

Chat 导入合同 KEEP：`FileImportContext.sessionId` 仍为 Chat 必填。Knowledge 使用可判别的 consumer context，引用已由 Main 校验的 Job ID，禁止填写伪造 Chat Session。`FileAssociation` 允许缺少 `sessionId`；Knowledge 行不得占用 Chat `sessionId`。引用感知清理仍由 File Platform 执行。

身份分区键 `{workProfileId, authSubject, tenantScope}` 由 Main 从 Layout Hermes profile、`DesktopAuthUser.id` 与可选 `tenantId` 派生。缺失 `tenantId` 时使用绑定该 authSubject 的显式 personal scope。Renderer 不能自报或覆盖分区键，不能读取 token、绝对路径或 provider 原始错误。

Work 生产代码把批准的业务页面复制/改写进 `apps/work`；禁止运行时 import `apps/knowledge`。`apps/knowledge` 独立应用与 Chatbox 归档知识库都不是本架构 Owner。

## Target Architecture

```text
Work Layout (View + visitedViews/paneStyle)
  ├─ Chat / Skill Run / Settings     KEEP existing owners
  └─ Knowledge View (active visibility only)
        ├─ Knowledge Renderer Module
        │     route-scope owner (one default scope)
        │     unavailable/empty pages when probe fails
        │     commands / snapshot subscription
        └─ curated Preload (sanitized Knowledge Job IPC)
                    │
                    ▼
         Main Knowledge Upload Job Coordinator
           ├─ capability probe (shared by upload + entity reads)
           ├─ draft / submit / cancel / retry / recover
           ├─ isolated Job/attempt persistence
           └─ File Platform association (knowledge job consumer)
                    │
                    ▼
              ManagedFile bytes / preview / refcount cleanup

No: TanStack URL router, MockKnowledgeRepository,
    MockUploadFile, file-job:* ingestion, fake Chat sessionId,
    Work Chat Run as Knowledge Q&A, remote Knowledge API in this stage
```

公共 Job 状态至少包括：`draft`、`queued`、`uploading`、`processing`、`completed`、`failed`、`cancelled`、`interrupted`、`blocked_provider_unavailable`。终态不可回退。重启后非终态 Job 必须恢复并与 provider 协调，或单调进入 `interrupted` / `blocked_provider_unavailable`。

IPC 是 Work 既有 Electron 桥的扩展，不是新的网络控制面。精确 channel / DTO / 表名由 Stage Plan 冻结。

## Ownership & Boundaries

| Capability | Production Owner | Boundary |
|---|---|---|
| 顶层 View、active/visited、侧栏 | Existing Work Renderer Layout | 只增加 `knowledge` token；不改全局 URL Router |
| Chat Run / Skill Run / Settings / Profile / 连接模式 | Existing Work owners | Knowledge 激活、隐藏、导入失败、Job 变化不得改变其行为 |
| Knowledge 模块路由与页面 UI | Knowledge Renderer Module in `apps/work` | 不拥有窗口 URL、tab collection、上传执行或 token |
| 用户 / 租户 / token | Existing Work Main Auth / `desktopAuth` | Renderer 只见公共用户状态 |
| ManagedFile 字节、预览、物理清理 | Existing Work Main File Platform | 新增 Knowledge Job association；Chat `sessionId` 导入 KEEP |
| Knowledge 上传/处理 Job、capability probe、恢复、幂等命令 | Main Knowledge Upload Job Coordinator | 可复用调度 primitive；禁止冒充 FileJobQueue parse；该 Owner 是本 Decision 批准的 NEW_OWNER |
| Knowledge Job IPC | Shared contract + curated Preload + Main handler | Main 校验身份与输入；Renderer 只见 sanitized snapshot/event |
| Knowledge dashboard/list/detail/chat 权威数据访问 | Main Knowledge Upload Job Coordinator（capability probe） | 与上传共用同一探测；无 provider 时 fail-closed。Renderer 只展示 unavailable/empty，不拥有数据权威，也不使用 `MockKnowledgeRepository` |
| 真实远端 Knowledge 上传/读取/RAG | OUT | 本架构不交付；后续独立 Architecture/RM |
| `apps/knowledge` 独立应用 | OUT（仅迁移源） | 不打包、不启动、不跨根 import |
| Chatbox 归档知识库 | OUT | 禁止作为 Owner 或迁移源 |

每个目标 Capability 只有一个 Production Owner。Main capability probe 不另建第二个读取服务；Renderer 只拥有展示。

## Dependencies & Cascading Effects

1. Layout 增加 `knowledge` View 且保活成立后，模块路由和页面迁移才有宿主。
2. Main 必须先能创建并校验 draft Job，File Platform 才能接受 Knowledge consumer；否则导入会倒退到伪造 `sessionId`。
3. Capability probe 必须先于任何上传 UI 与实体读取 UI 启用；否则会出现 fake progress 或 fixture 列表。
4. Job 持久化与 association 必须原子到“可清理”：不允许 Job 存在而 ManagedFile 无法引用计数，或相反。
5. 身份切换/登出必须同时切断 Renderer cache 与 Job 命令授权；远端已提交任务可继续由 Main 协调，但只在同一分区重新进入时可见。
6. Knowledge Chat 页面不得写入 Chat `FileImportContext.sessionId`，也不得出现在 Chat Run 列表。
7. 隐藏 View 必须停止 UI-only polling / rAF / 模块快捷键；Job 仍由 Main 推进。
8. 本 Stage 不引入生产 Knowledge provider URL；缺失配置即 fail-closed。真实 provider 会改变外部依赖与验收，必须新开 Architecture/RM。
9. 多页签、URL 深链、RAG、服务端权限、`apps/knowledge` 归档都依赖本 Stage 的 View / Job / 分区已经稳定，不得塞进 RM-01。

## Risks & Kill Criteria

| Risk | Mitigation | Kill/Revisit Criterion |
|---|---|---|
| 把 View 保活当成上传可靠性 | Job 只由 Main/provider 推进 | 依赖 React 树、Query timer 或内存 `File` 推进 Job 则回滚该 Stage |
| 无 provider 却展示成功或 fixture 知识库 | 共用 capability gate | 生产 UI 出现 fake progress/completed、fixture 列表或可发送 mock 问答则失败 |
| 伪造 sessionId 污染 Chat | 可判别 Job consumer | 任何 Knowledge 路径写入 Chat Session 则终止 |
| Job Owner 与 parse queue 混用 | 事件名与 kind 隔离 | Knowledge 使用 `file-job:*` 或 parse kind 则回滚 |
| 身份串用 | Main 派生分区 + 命令拒绝 | 跨用户/租户/profile 能看到或操作旧 Job 则失败 |
| 清理删除仍被 Chat/Skill Run 引用的文件 | File Platform 引用计数 | Knowledge 清理导致 Chat 附件消失则失败 |
| 跨根复用源码 | GES forbidden_roots | Work 运行时 import `apps/knowledge` 则失败 |
| 把测试 adapter 当生产 provider | 本 Stage 无真实成功验收 | 以 mock 完成态关闭 RM-01 则非法 |
| 为 tabs/registry 过建 | 只要求 route owner 可实例化 | 本 Stage 出现 tab collection 或通用 Module Registry 则范围失控 |

出现 Kill Criterion 时停止该 Stage 实现，返回本 Architecture / PRD，不得在 Plan 里改 Owner。

## Rejected Alternatives

| Alternative | Why Rejected | Revisit When |
|---|---|---|
| Settings Modal / overlay Knowledge | 不是一级产品面，无法复用 View 保活 | 产品明确把 Knowledge 降为设置能力 |
| WebView / 子应用 / 跨根 import | 违反 GES 边界，复制 Shell/Auth | 独立应用被批准为嵌入运行时（当前禁止） |
| `FileJobQueue` + `file-job:*` 作为 ingestion | parse 生命周期不能表达远端上传/恢复 | File Platform 被重新设计为通用远端 Job 总线且 Chat parse 已迁移 |
| 伪造 Chat `sessionId` | 污染 Chat association 与清理 | 导入上下文升级为显式 consumer union 且 Chat 已迁移 |
| 生产 `MockKnowledgeRepository` / `MockUploadFile` | 把 demo 数据当成知识库事实 | 永不作为生产接口；测试 fixture 除外 |
| 通用 Module Registry / 本 Stage 多页签 | 无当前消费者 | 独立 RM 需要第二个 Knowledge scope UI |
| Knowledge 问答走 Work Chat Run | 合并两个执行事实源 | 产品批准 Knowledge 引用注入 Chat，且不复用 Chat Session 作为 Job 键 |
| 本 Stage 真实 RAG/对象存储/服务端权限 | 超出 integration foundation | 独立 Architecture 定义远端 Knowledge 服务 |
| Chatbox `references/chatbox` 知识库 | 归档非生产路径 | 永不作为本产品 Owner |

## Roadmap Boundaries

| Stage Outcome | Depends On | Exit Signal |
|---|---|---|
| RM-01 Knowledge 独立 View 集成 foundation：Layout View、模块状态路由、Main Job Coordinator、Job IPC、Knowledge association、身份分区、fail-closed 上传与读取 | - | AC-01–AC-12 的 blocking claim 在无真实 provider 下关闭；生产路径无 mock 内容/假成功；Chat/Skill Run 回归保持 |
| RM-02 真实 Knowledge provider 与端到端上传/读取成功 | RM-01 | 必须另开 Architecture Decision 与 Stage PRD；用真实 provider 替换 capability gate，而不是删除 gate 或把测试 adapter 当作成功 |

下列工作明确排除出本 Decision 的编号 Stage，各自需要独立 Architecture/PRD，不得并入 RM-01 或 RM-02：多页签 UI 与恢复；URL/deep-link 投影；Knowledge 与 Work Chat 的引用/搜索/上下文注入；`apps/knowledge` 独立应用归档；服务端权限、对象存储、解析、Embedding、RAG；通用 Business Module Registry。

RM-01 对应已存在的 Stage PRD `WORK-KNOWLEDGE-01`。RM-02 在 RM-01 DONE 之前保持 BACKLOG。
