---
name: WORK-KNOWLEDGE-01
overview: Grounded implementation plan to add Knowledge as a Work Layout independent View with a Main-owned Upload Job, fail-closed reads, and no apps/knowledge runtime import.
todos:
  - id: t1-knowledge-layout
    content: "T1 — Add Knowledge View to Work Layout [C01]"
    status: pending
  - id: t2-knowledge-module-routing
    content: "T2 — Knowledge module root, route descriptor, and host-instantiated scope [C02, C03, C04, C05]"
    status: pending
  - id: t3-knowledge-fail-closed-pages
    content: "T3 — Fail-closed Knowledge pages without mock repository or fake upload [C06, C10, C13]"
    status: pending
  - id: t4-knowledge-job-ipc
    content: "T4 — Main Knowledge Upload Job Coordinator, capability probe, and sanitized IPC [C07, C09, C11]"
    status: pending
  - id: t5-knowledge-file-import
    content: "T5 — Knowledge Job file-import consumer without forging Chat sessionId [C08]"
    status: pending
isProject: false
plan_contract: smc.plan.v3.7
plan_id: WORK-KNOWLEDGE-01
domain_contract: smc.ges.domain-activation.v2
consumer_profile: generic@2.0.0
domain_policy_digest: sha256:44550d8ceca212b2242d0b407ae3ffd279dcdba8841a7a6b19deb0ec6e44aab6
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-KNOWLEDGE-01@v1.3.0/f1-read-gate-revision
grounded_commit: fa02f4c00d8f425a2b24787cca592ac7ecb5875d
grounding_source: working_tree
working_tree_fingerprint: sha256:aacb8241c0fd243b5dbd136ad1a6ea587f80b4daf9956b5d27c88d691782c6d4
governance_profile: FULL
source_prd: docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md
source_prd_sha256: sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f
domain_intent_binding_version: 1
domain_intent_digest: sha256:6fca92bbf3e82f8b7e5f8576eac4e137bb3337c203d89df933e3822f6905d8b4
domain_activation_digest: sha256:74a2078597f19078bb9d5f5be58f132dec3dd760e6591e2eff7205016270cfb2
---

# WORK-KNOWLEDGE-01 Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md)

## Scope

- In: Work Layout `knowledge` View using existing `visitedViews` / `paneStyle` keep-alive; host-instantiated Knowledge route-scope plus typed Route Descriptor covering Home, Bases, Sets, Documents, Uploads, and Knowledge Chat; Main Knowledge Upload Job Coordinator with isolated sqlite persistence, restart recovery, identity partition `{workProfileId, authSubject, tenantScope}`, and one capability probe shared by upload and entity reads; sanitized Job IPC/preload; File Platform Knowledge Job association that does not set Chat `sessionId`; fail-closed unavailable/empty pages with no mock repository, fake progress, or sendable mock Q&A.
- Out: real Knowledge provider E2E (RM-02); tabs, deep-link/URL router, RAG, archive of `apps/knowledge`; Work Chat Run / Skill Run integration; Settings Modal host; WebView / cross-root import of `apps/knowledge`; `FileJobQueue` / `file-job:*` as ingestion truth; forged Chat `sessionId`; `MockKnowledgeRepository` / `MockUploadFile` as production contracts.
- Production Owner inherited from PRD: Work Renderer Layout owns the View token and keep-alive; Knowledge Renderer Module owns the View root, route-scope, descriptor, and fail-closed pages; Proposed Main Knowledge Upload Job Coordinator owns Job lifecycle, capability probe, and recovery; Work Main File Platform owns ManagedFile bytes and association; Shared Contract plus curated Preload own sanitized Job IPC; existing Chat, Skill Run, Settings, Profile, Auth, and FileJobQueue parse owners KEEP.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#View` | Existing `View` union has no `knowledge`; `visitedViews` starts `{"chat"}`; `paneStyle` uses `display:none`; `apps/work/src/shared/i18n/locales/en/navigation.ts` exists at `fa02f4c` with no `knowledge` key | `type View`, `PINNED_NAV_ITEMS`, `goTo`, `paneStyle`, `navigation:goto` listener, and `en/navigation.ts` default export all resolve at `fa02f4c` | Chat pane at `paneStyle("chat")` stays mounted after first visit; sidebar maps `PINNED_NAV_ITEMS` via `t(labelKey)` | Reuse visited-view keep-alive and source-locale `navigation.*`; do not add a URL router or edit non-en locale packages | PASS |
| C02 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` | Absent at `fa02f4c` | New module root mounted from Layout after first visit | Layout will pass `active={view==="knowledge"}` and keep the pane mounted | No Work Knowledge module exists; do not load `apps/knowledge` | PASS |
| C03 | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts` | Absent at `fa02f4c`. Copy source `apps/knowledge/src/utils/routes.ts` is untracked working-tree only (not in HEAD); content hash in Migration Copy Source Ledger | New typed descriptor replaces TanStack Memory Router on the Work path | Knowledge pages select content from descriptor state, not `useParams` / `Link` | Source uses TanStack `createMemoryHistory`; do not copy `routeTree.gen`. Isolated worktree without the listed copy source is BLOCKED | PASS |
| C04 | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts` | Absent at `fa02f4c` | New host-instantiated owner, not a module singleton | Product creates one default scope; tests may construct a second isolated instance | No Work route-scope exists; do not prebuild tab collections | PASS |
| C05 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` | Absent at `fa02f4c` | Same new root reads `window.desktopAuth` public state only | Tokens stay in Main via existing `auth-api` / `auth-contract` | Do not copy Knowledge Login/AppShell/token store | PASS |
| C06 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | Absent at `fa02f4c`. Copy sources under `apps/knowledge/src/features/*` are untracked working-tree only; hashes in Migration Copy Source Ledger | New Work-owned page module covering six Stage pages | Route descriptor selects page components inside KnowledgeView | Adapt by copy into `apps/work`; never runtime-import the source app. Isolated worktree without listed files is BLOCKED | PASS |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | Absent at `fa02f4c` | New Main owner for draft/queue/recover/cancel/retry; draft persists opaque `knowledgeBaseId` or sentinel `unbound` | Preload/IPC and hidden View subscribe to snapshots; File import associates Job IDs | Reuse `FileJobQueue` concurrency primitive only; do not emit `file-job:*`; do not invent a remote Knowledge HTTP client | PASS |
| C08 | `apps/work/src/shared/files/file-ipc.ts#FileImportContext` | Existing `sessionId: string` is required; `importOnePath` derives `profileId` from `context.profile` and uses that same value for config, copy, ManagedFile, parse, and association; `stageClipboardImport` always reads `context.sessionId`; `insertAssociation` short-circuits only when `sessionId` is set | `FileImportContext`, `importOnePath`, and `stageClipboardImport` resolve at `fa02f4c` | Chat composer still supplies `sessionId` and Chat clipboard keeps that path; Knowledge supplies `knowledgeJobId` instead; Main must resolve that Job before any File Platform write | `FileAssociation.sessionId?` already optional; add optional `knowledgeJobId`; Knowledge never uses clipboard staging or `composerFilePlatform.ts` | PASS |
| C09 | `apps/work/src/preload/knowledge-job-api.ts` | Absent at `fa02f4c` | New curated preload factory mirroring `createFilesApi`; DTO includes `knowledgeBaseId` | `preload/index.ts` exposes `hermesAPI.knowledgeJobs`; Main `registerIpcHandlers` registers handlers | Copy files-api wrapping pattern; new channel family, not `files:` or `file-job:*` | PASS |
| C10 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | Absent at `fa02f4c`. Copy source `apps/knowledge/src/features/uploads/uploads-page.tsx` is untracked working-tree only | Same page module omits `MockUploadFile` / timer / `forceFail` | Uploads page renders Main snapshots or unavailable | Source uploads are mock-only; do not promote them. Isolated worktree without the listed file is BLOCKED | PASS |
| C11 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | Absent at `fa02f4c` | Same coordinator owns the Stage capability probe | Upload commands and entity reads share one probe; missing provider → `blocked_provider_unavailable` | No remote Knowledge adapter exists; do not invent a live HTTP client | PASS |
| C13 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | Absent at `fa02f4c`. Copy source `apps/knowledge/src/services/knowledge/` is untracked working-tree only. `apps/work/src/shared/i18n/index.ts#resources` exists at `fa02f4c` with no `knowledge` namespace | Same page module fail-closes dashboard/list/detail/chat using source-locale `knowledge.*` copy | Pages are reachable under the descriptor; content is unavailable/empty without a provider | `MockKnowledgeRepository` is the source default and is forbidden on the Work path. Isolated worktree without listed copy sources is BLOCKED | PASS |

## Migration Copy Source Ledger

`apps/knowledge/` is not in `fa02f4c` (`git ls-tree HEAD apps/` is only `apps/work`; `?? apps/knowledge/`). Work MODIFY symbols stay resolved with `git show` at `grounded_commit`. Copy sources below are working-tree-only; T2/T3 must exist on disk with these hashes or the Todo is BLOCKED.

`working_tree_fingerprint` is sha256 of concatenated `path + NUL + file bytes + NUL` for these rows in table order:

| Path | Role | Content SHA256 | In HEAD |
|---|---|---|---|
| `apps/knowledge/src/utils/routes.ts` | T2 descriptor copy source (adapt, do not import) | `sha256:5f20e2b8bead9cb01100b80e8ec8b5efdceb69f524b78f0fbb10eb68906958ed` | no |
| `apps/knowledge/src/features/knowledge-home/index.tsx` | T3 Home copy source | `sha256:fcb3f40e6e9141490c074f1380c1ff0c4f306a6e35887a48e5d1d121f106d7ef` | no |
| `apps/knowledge/src/features/knowledge-bases/knowledge-base-list.tsx` | T3 Bases copy source | `sha256:f6a72bfe1963b338500f13cd74cce5b09ce57e012609eb010c69afb67212937c` | no |
| `apps/knowledge/src/features/knowledge-sets/knowledge-set-list.tsx` | T3 Sets copy source | `sha256:19c0065b4dd7442d9560b7876af1457868ca9f3d1ed553699a299e46be9fef20` | no |
| `apps/knowledge/src/features/documents/documents-list.tsx` | T3 Documents copy source | `sha256:37adc46e36eaa7828360530f07f49bc5b07f704986e22cb92df105562b6e4b54` | no |
| `apps/knowledge/src/features/uploads/uploads-page.tsx` | T3 Uploads copy source (omit mock timers) | `sha256:9de4d4d444d50fe992600f7984b2e7bf83d04739e21935f76ec083ebc8ca51b3` | no |
| `apps/knowledge/src/features/knowledge-chat/knowledge-chat-page.tsx` | T3 Knowledge Chat copy source | `sha256:15f63f65e4af035324934855e7a25cb188fb7b6ca92af91bd32a661935080382` | no |
| `apps/knowledge/src/services/knowledge/knowledge-repository.ts` | T3 contract shape to omit from production | `sha256:51ee091f22f8b2748832a4d489bd1e333c64c43aa6aea5f9e6c0c223d6001209` | no |
| `apps/knowledge/src/services/knowledge/mock-knowledge-repository.ts` | Forbidden production contract; read only to keep it out | `sha256:bbb1ce9b30a9f57e84a9c78ed1efeb0bc86ec36b91c90843dc454781ab9d17e0` | no |

## Domain Intent Binding

| Domain | Change ID | Intent SHA256 | Source PRD SHA256 |
|---|---|---|---|
| backend | C07 | `sha256:c77fa229f049c18b897999012fe7c3b359af33d150a3f3ec623aa9d6329755a4` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| backend | C08 | `sha256:755f397346d5a49313e73b8c8398cc4b669d01bb0d16eea93f3bf68792961a32` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| backend | C09 | `sha256:0712a3eae86ed7604a115d6a75673dcef570d4c7636af0560e8571714e924b97` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| backend | C11 | `sha256:4d24dce21d760c090976d50eefd0d94b96ed57f93c8672632bd83244cdb1458b` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| backend | C13 | `sha256:c3c81a13fcddf209d53a7e208eb611eb036ce6102f2b64b2fb6e4ad28271f7e0` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C01 | `sha256:1fdf530cf5c75c3dad79c375d860954cbeaace85eca3814bc8a936e29a735046` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C02 | `sha256:e3da5d29efc3ec683596e2f469dc288d44e110ef570c0c36b22d0b282ec7ec9d` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C03 | `sha256:4c0ae6024adeac6e1b43595f3b53f1e9e8cafc1fe75b02500b2ad23f3103d808` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C04 | `sha256:acab98e55a70e243d1811b89590b0762ca75be73e333c2fbbe5cb2839147cbdf` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C05 | `sha256:50019cb73f88cc567c0ce3a722a4ea2b67a809ff3c5674b9bec2b8eaf28b41fa` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C06 | `sha256:5d2911f0131d347c1fd3bf5e37dff66a702386266ce1a1415ad9e8224376b92f` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C07 | `sha256:e14f8cd058d4df6f76da118996329e302c3e5cc025dc9bdcfa53f2f148bc9835` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C08 | `sha256:834f58caeadf58e3dfa3c795b85fd88c963f0556f687e5f8039da1a0f9434beb` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C09 | `sha256:24f8c2036656606d4af598a61651f71fb4034a338cf88e59a5e6bbaa39a3673b` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C10 | `sha256:65fb8d9e0e435faed5b4b649cd29e8a51ddda68de9853e65afb7f56b9e5ef019` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C11 | `sha256:c3d016c895ab4519de4bd41d03f84b12513d329a6c8ef5091b492655b4e00a2e` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C12 | `sha256:9a7303b57dcf20356c7671b18808c7c34a09a3eb7f37ca23d1d63456b7924a69` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| frontend | C13 | `sha256:0ab7577dd8b68389d3776479c0bcc8849d36e0e49e60a12cb784fc5d1d769407` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| ops | C07 | `sha256:15ae07ab2314432fb881070835c6fe213d5cc348f86660a5ba14e1c4e799057f` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| ops | C08 | `sha256:f5f6baac001da01394d2e59521cf7de71b4c424e371440e39ea4e7268bd9eeff` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| ops | C09 | `sha256:b08b20734f7c3220441cb3f8019808d4d4b71097de0d43d9ae7e6b729c26f12e` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| ops | C11 | `sha256:de3cf0e0de9c9f64a0f735f626560d745ee2a02568c4b41fe745d0cbdfe7c00f` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |
| ops | C13 | `sha256:5cfb770cf423374d1113ac50c04c6fc00ff786f3e825755e2a3038aae2f0835f` | `sha256:8fec2171781d3dec6255d1f561ce2080ff0cad6320225a183266d9af4d497b9f` |


## Governance Profile

- Profile: `FULL`
- Route rationale: Approved PRD Routing Facts already require FULL. This Stage adds a NEW_OWNER Job Coordinator, extends File import and Preload contracts, introduces isolated Job schema, and changes a security boundary for identity-partitioned IPC. Those facts stay true after grounding.
- Escalation triggers checked: `new_owner`, `public_contract_change`, `security_boundary_change`, `schema_migration`, `lifecycle_change`, `cross_domain_contract_change` are present and already absorbed by FULL. No further PRD revision is required to plan this Stage.
- Risk Facts Snapshot: `{"bounded_writes":true,"cross_domain_contract_change":true,"cross_domain_ownership":true,"cross_layer_existing_contract":true,"deterministic_verification":true,"existing_capability":true,"existing_external_dependency_use":false,"existing_lifecycle_wiring":true,"existing_owner":true,"existing_public_contract_use":true,"external_dependency":true,"external_dependency_change":true,"external_live_acceptance":false,"lifecycle_change":true,"lifecycle_contract_change":true,"live_acceptance":false,"local_ui_acceptance":true,"new_owner":true,"ownership_transfer":true,"protocol_change":true,"public_contract":true,"public_contract_change":true,"schema_migration":true,"security_boundary":true,"security_boundary_change":true,"security_sensitive_touch":true}`
- Source: approved PRD Routing Facts

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | [C01/C02/C12] 首次进入 Knowledge 后切换到 Chat，再次进入 Knowledge，Knowledge 恢复同一 route snapshot；当前 Chat Run、消息、草稿和执行状态不变。 | BEHAVIOR | C01, C02, C12 | T1, T2 | V01 | UNIT | yes |
| AC-02 | AC | [C01/C03] Knowledge 内部页面导航不改变 Work 窗口 URL/history，不新增顶层 Router；现有 Work View、菜单和 navigation:goto 行为保持可用。 | BEHAVIOR | C01, C03 | T1, T2 | V01 | UNIT | yes |
| AC-03 | AC | [C03/C04] Route Descriptor 覆盖本 Stage 页面；route owner 不是模块级 singleton，并可由不同 host scope 独立实例化而互不修改。产品只创建一个默认 scope，不包含 tab collection 或跨 tab back stack。 | BEHAVIOR | C03, C04 | T2 | V02 | UNIT | yes |
| AC-04 | AC | [C07/C08/C09] 文件导入先关联 Main 创建的 Knowledge draft Job；不要求或伪造 Chat sessionId，Renderer 不能覆盖 profile/tenant，隐藏/再显示后仍观察同一 Job ID。 | LIFECYCLE | C07, C08, C09 | T4, T5 | V03, V04 | INTEGRATION | yes |
| AC-05 | AC | [C02/C07/C11] Knowledge 隐藏 30 秒期间，UI-only polling、animation frame 和模块级全局快捷键调用计数为 0；Main Job snapshot 可继续变化或稳定进入 provider-unavailable 状态，重新激活后一次同步收敛。 | LIFECYCLE | C02, C07, C11 | T2, T4 | V02, V03 | UNIT | yes |
| AC-06 | AC | [C07/C09] Renderer reload 或应用重启后，每个非终态 Job 恢复并协调，或进入明确的 interrupted/blockedproviderunavailable；不存在永久无 Owner 的 uploading/processing。 | LIFECYCLE | C07, C09 | T4 | V03 | UNIT | yes |
| AC-07 | AC | [C07/C09] 对同一 Job 重复 cancel/retry 命令和重复/乱序事件不会产生不可区分的重复 attempt，也不会让终态回退。 | LIFECYCLE | C07, C09 | T4 | V03 | UNIT | yes |
| AC-08 | AC | [C05/C07/C09] 登出、同 tenant 不同 auth subject、跨 tenant、tenantId 缺失的 personal scope、Work profile 切换和重新登录场景均按 {workProfileId, authSubject, tenantScope} 隔离；不匹配身份看不到旧 cache/snapshot 且 Job 命令被拒绝，Renderer 无法读取 token、绝对路径或 provider 原始错误。 | SECURITY | C05, C07, C09 | T2, T4 | V03 | UNIT | yes |
| AC-09 | AC | [C06/C10/C12/C13] 首页、知识库、知识集、文档、上传任务和知识问答页面可在 Work View 中到达，且无真实 provider 时只展示明确 unavailable/empty，不出现 fixture 列表或可发送的 mock 问答；独立 Login/Profile/Preferences/AppShell/TanStack route tree 不可从 Work production path 到达；Knowledge 问答不接入 Work Chat Run / Skill Run，也不把会话 ID 写入 Chat FileImportContext.sessionId。 | BEHAVIOR | C06, C10, C12, C13 | T2, T3 | V05 | UNIT | yes |
| AC-10 | AC | [C08] Knowledge association 清理不删除仍被 Chat、Skill Run 或其他 Job 引用的 ManagedFile；现有 Chat import/association/preview 行为保持不变。 | CONTRACT | C08 | T5 | V04 | INTEGRATION | yes |
| AC-11 | AC | [C10/C11/C13] 无真实 Knowledge provider 时，生产 UI 显示明确 unavailable/blocked 状态，不出现 mock 数据、fake progress 或 fake completed；MockUploadFile 与 MockKnowledgeRepository 均不属于 Work production repository contract。 | NEGATIVE | C10, C11, C13 | T3, T4 | V05 | UNIT | yes |
| AC-12 | AC | [C06/C12] Work production source 不跨根 import apps/knowledge；Knowledge 激活、隐藏、导入失败和 Job 状态变化不改变 Settings/Profile Modal、Chat/Skill Run 或现有连接模式行为。 | SCOPE | C06, C12 | T1, T3 | V05, V06 | DIFF_SCOPE | yes |
| DOD-01 | DOD | 所有 AC-01 至 AC-12 的 Blocking Claim 有当前 grounded commit 对应的新证据或明确复用证据。 | EVIDENCE | C01, C02, C07, C08 | T1, T2, T3, T4, T5 | V06 | INTEGRATION | yes |
| DOD-02 | DOD | 独立 PRD Review 为 PASS，deterministic converge 把 PRD 置为 APPROVED。 | EVIDENCE | C01 | T1 | V07 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 对应 Architecture Decision 已 APPROVED，Roadmap RM-01 已绑定本 Stage PRD；在 canonical Plan 批准前不得实现。 | EVIDENCE | C01 | T1 | V07 | DOCUMENT_SEMANTIC | yes |
| DOD-04 | DOD | 后续实施通过 Work 类型检查、边界 guard、相关单元/组件/集成回归和 lat check。 | EVIDENCE | C01, C07, C08 | T1, T4, T5 | V06 | INTEGRATION | yes |
| DOD-05 | DOD | Work 运行路径没有第二套 Shell/Auth/Router/File Platform，也没有 fake production upload 或 mock 实体读取。 | SCOPE | C05, C10, C13 | T2, T3 | V05 | UNIT | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Knowledge View keep-alive | AC-01, AC-02, AC-05 | First `goTo("knowledge")` then hide/show via Layout `view` | `visitedViews` has `knowledge`; pane `display:none` while Chat is active | Layout `goTo` / `paneStyle`; KnowledgeView restores route-scope snapshot | Layout never unmounts after first visit; hidden-effect counters stay at 0 | V01, V02 |
| Knowledge Upload Job | AC-04, AC-05, AC-06, AC-07, AC-11 | Renderer asks Main to create a draft Job then import a file | `draft` / `queued` / `uploading` / `processing` / `interrupted` | Main coordinator persists Job identity, opaque `knowledgeBaseId` or sentinel `unbound`, and sanitized snapshot | Coordinator monotonically writes `failed`, `cancelled`, `interrupted`, or `blocked_provider_unavailable`; never fake `completed` | V03, V04 |
| Job restart recovery | AC-06, AC-07 | Main process start or Renderer reload with non-terminal Jobs | recovered coordinating Job or explicit interrupted/unavailable | Coordinator resume on isolated Job store | Duplicate cancel/retry keep one attempt identity; terminal states do not rewind | V03 |
| Identity partition | AC-08 | Logout, subject change, tenant change, missing tenant personal scope, Work profile switch | Commands against a mismatched partition | Main rejects with a stable sanitized error | Renderer cache/snapshot for the old partition is not visible | V03 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Knowledge Job command/event | AC-04, AC-06, AC-07, AC-08 | Main coordinator | New `knowledge-job:*` IPC plus `createKnowledgeJobApi` preload; sanitized snapshot/event DTOs in `apps/work/src/shared/knowledge/knowledge-job-ipc.ts` | KnowledgeView / Uploads page | `jobId`, opaque `knowledgeBaseId` or sentinel `unbound`, partition `{workProfileId, authSubject, tenantScope}`, monotonic `attempt`, sanitized `status` | Main handler in `register-knowledge-job-ipc.ts` | Illegal, cross-identity, or replayed commands return stable sanitized errors; Renderer disconnect does not cancel the Job | `jobId` plus `attempt` / command id | V03 |
| Knowledge file import association | AC-04, AC-10 | File Platform `importOnePath` | Existing `files:` IPC; extended `FileImportContext` with optional `knowledgeJobId` and Chat-required `sessionId` | Knowledge Job association rows in `file_associations` plus ManagedFile/copy/parse on the same partition | Knowledge path: lookup Job before any write; `knowledgeJobId` set and `sessionId` absent; config, `findByHash`, `storeManagedCopy`, `ManagedFile.profileId`, `scheduleParseAfterImport`, and association `profileId` all use Job `workProfileId`, not Renderer `context.profile`. Chat path: `sessionId` set, `knowledgeJobId` absent, `context.profile` KEEP | `importOnePath` plus coordinator Job lookup plus `insertAssociation` | Unknown Job or mismatched partition rejected before any File Platform write; mixed consumer keys or clipboard Knowledge import return sanitized errors; partial import is cleaned; referenced ManagedFile is not physically deleted | Chat: fileId plus `sessionId` plus role. Knowledge: fileId plus `knowledgeJobId` plus role | V04 |
| Capability probe | AC-05, AC-09, AC-11, AC-13 | Main coordinator | Same sanitized snapshot field as Job status; no new remote HTTP client this Stage | Knowledge pages and upload UI | Probe result `available` or `blocked_provider_unavailable` | Main coordinator | Missing provider fail-closes upload and entity reads together | Probe is not an upload attempt; do not mint completed Jobs | V03, V05 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | First Knowledge visit then Chat then Knowledge restores the same route snapshot; current Chat Run, messages, draft, and execution state are unchanged | yes | Layout `visitedViews` / `paneStyle` / Chat display gating at `fa02f4c` | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Adding `knowledge` to `View` changes the Layout navigation set | V01 |
| CLM-02 | AC-02 | Knowledge in-module navigation does not change the Work window URL/history and does not add a top-level Router; existing views, menu, and `navigation:goto` remain usable | yes | Layout `goTo` and `navigation:goto` at `fa02f4c` | PROVEN_BUT_AFFECTED | TARGETED_RERUN | Adding `knowledge` to `View` changes the Layout navigation set | V01 |
| CLM-03 | AC-03 | Route Descriptor covers the six Stage pages; two host scopes do not mutate each other; product creates one default scope and no tab collection | yes | Knowledge TanStack Memory Router in `apps/knowledge/src/utils/routes.ts` | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Work production path must replace Router hooks | V02 |
| CLM-04 | AC-04 | File import binds a Main draft Knowledge Job without Chat `sessionId`; Renderer cannot override profile/tenant; hide/show observes the same Job ID | yes | Knowledge `useUploadJobs` 1s refetch and Renderer timer upload | NOT_PRODUCTION_PROOF | NEW_EVIDENCE | UI timers cannot prove a Main Job | V03, V04 |
| CLM-05 | AC-05 | While Knowledge is hidden for 30s, UI-only polling, animation frames, and module-level shortcut counts stay 0; Main snapshot may still change or become unavailable | yes | Knowledge `useUploadJobs` 1s refetch | NOT_PRODUCTION_PROOF | NEW_EVIDENCE | Hidden-effect proof is new | V02, V03 |
| CLM-06 | AC-06 | After Renderer reload or app restart, every non-terminal Job is resumed or enters interrupted/unavailable; no ownerless uploading/processing remains | yes | FileJobQueue local parse only | NOT_APPLICABLE_TO_REMOTE_JOB | NEW_EVIDENCE | New Job owner is not the parse queue | V03 |
| CLM-07 | AC-07 | Duplicate cancel/retry and out-of-order events do not create indistinguishable extra attempts or rewind a terminal status | yes | FileJobQueue local parse only | NOT_APPLICABLE_TO_REMOTE_JOB | NEW_EVIDENCE | New Job owner is not the parse queue | V03 |
| CLM-08 | AC-08 | Partition `{workProfileId, authSubject, tenantScope}` isolates snapshots and rejects mismatched commands; Renderer never sees tokens, absolute paths, or provider raw errors | yes | `desktopAuth` public state plus Layout `activeProfile` | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | New Job/cache partition key | V03 |
| CLM-09 | AC-09 | Six business pages are reachable in the Work View and show unavailable/empty without a provider; no fixture lists or sendable mock Q&A; no independent Shell/Auth/TanStack on the Work path; Knowledge Chat is not a Work Chat Run | yes | Knowledge features/routes; GES forbidden_roots | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Migrated production path must re-prove fail-closed reads | V05 |
| CLM-10 | AC-10 | Knowledge association cleanup does not delete a ManagedFile still referenced by Chat, Skill Run, or another Job; Chat import/preview regression holds | yes | FileAssociation refs and Chat import at `fa02f4c` | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | New consumer must not break existing refcounts | V04 |
| CLM-11 | AC-11 | Without a real provider the production UI is unavailable/blocked; no mock data, fake progress, or fake completed; no `MockUploadFile` / `MockKnowledgeRepository` production contract | yes | `RemoteKnowledgeRepository` unimplemented; mock is Knowledge default | FAILED_RESIDUAL_GAP | NEW_EVIDENCE | Mock default must not enter the Work production path | V05 |
| CLM-12 | AC-12 | Work production source does not import `apps/knowledge`; Knowledge activate/hide/import/Job changes do not alter Settings/Profile Modal, Chat/Skill Run, or connection-mode behavior | yes | GES app-profile forbidden_roots | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | New Work Knowledge files must stay inside `apps/work` | V05, V06 |
| CLM-13 | DOD-01 | Every blocking AC has current grounded-commit evidence | yes | Stage PRD claim ledger | UNKNOWN | NEW_EVIDENCE | Implementation evidence does not exist yet | V06 |
| CLM-14 | DOD-02 | Independent PRD review is PASS and converge set the PRD to APPROVED | yes | `docs/work/reviews/prd-work-knowledge-01-independent-view-v1.3.0-closure-review.md` plus PRD `status: APPROVED` | PASS | REUSE_EVIDENCE | - | V07 |
| CLM-15 | DOD-03 | Architecture Decision is APPROVED and Roadmap RM-01 is bound to this Stage PRD; implementation waits for canonical Plan approval | yes | `docs/work/AD-WORK-KNOWLEDGE-v1.0-independent-view.md` `status: APPROVED`; `docs/work/ROADMAP-WORK-KNOWLEDGE-v1.0-independent-view.md` RM-01 IN_PRD | PASS | REUSE_EVIDENCE | - | V07 |
| CLM-16 | DOD-04 | Implementation passes Work typecheck, boundary guard, and targeted unit/component/integration regression | yes | Existing `apps/work` `npm test` / `typecheck` / `guard` | UNKNOWN | NEW_EVIDENCE | New Knowledge files are not covered yet | V06 |
| CLM-17 | DOD-05 | Work runtime path has no second Shell/Auth/Router/File Platform and no fake production upload or mock entity reads | yes | Knowledge demo defaults to mock | FAILED_RESIDUAL_GAP | NEW_EVIDENCE | Mock default must not enter the Work production path | V05 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|
| SCN-01 | CLM-01, CLM-02, CLM-03, CLM-04, CLM-05, CLM-06, CLM-07, CLM-08, CLM-09, CLM-10, CLM-11, CLM-12, CLM-13, CLM-16, CLM-17 | V01, V02, V03, V04, V05, V06 | local vitest plus apps/work typecheck and guard | vitest, typescript, node | Work package dependencies installed | run the Verification Ledger LOCAL commands | all listed commands exit 0 and oracles in V01-V06 hold | ENV-01 |

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|
| ENV-01 | - | npm --prefix apps/work test --version | - | LOCAL_WORKTREE | - |

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01, CLM-02 | UNIT | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false tests/layout-knowledge-view.test.ts` | Knowledge keep-alive restores the same route snapshot; Chat pane state is unchanged; `window.history` is not pushed for in-module Knowledge navigation; `navigation:goto` still switches Work views; sidebar label is the English `navigation.knowledge` value, not the raw key. File lives under `apps/work/tests/` so it is outside `tsconfig.node.json` include | Fail if Knowledge unmounts on hide, if Chat draft/run resets, if the test file is missing, or if the suite is empty | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V02 | CLM-03, CLM-05 | UNIT | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-route-scope.test.ts` | Descriptor covers home/bases/sets/documents/uploads/chat; two constructed scopes do not share mutable state; no tab collection API is exported; `KnowledgeView` mounted with `active=false` for 30s keeps UI-only polling/rAF/shortcut counters at 0. File lives under `apps/work/tests/` so renderer imports are outside `tsconfig.node.json` | Fail if a module-level singleton store is the route owner, if counters increment while hidden, if the test file is missing, or if the suite is empty | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V03 | CLM-04, CLM-05, CLM-06, CLM-07, CLM-08 | UNIT | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-upload-job-coordinator.test.ts` | Draft Job persists opaque `knowledgeBaseId` or sentinel `unbound` with the Main partition; Draft Job ID is stable across subscribe/unsubscribe; with no renderer subscriber the coordinator may still change snapshot or enter `blocked_provider_unavailable`; restart recovers or marks interrupted/unavailable; duplicate cancel/retry keeps one attempt; mismatched partition is rejected; snapshots omit token/path/raw provider errors; missing provider is `blocked_provider_unavailable` not completed. This file must not import renderer modules or React | Fail if `file-job:*` is used, if a fake completed status is emitted, if the test file is missing, or if the suite is empty | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V04 | CLM-04, CLM-10 | INTEGRATION | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false src/main/files/file-import-knowledge-job.test.ts src/main/files/file-association-store.test.ts` | Knowledge import looks up the Job first and uses Job `workProfileId` for config, copy, ManagedFile, parse, and association; `sessionId` is absent; Chat import still requires `sessionId` and keeps preview/refcount behavior; Knowledge cleanup does not delete a file still referenced by Chat; unknown Job and cross-partition Knowledge imports are rejected before any write; `insertAssociation` is idempotent on `knowledgeJobId`; `stageClipboardImport` with `knowledgeJobId` is rejected; Chat clipboard still requires `sessionId` | Fail if Knowledge import writes a forged Chat `sessionId`, uses Renderer `context.profile` for any profile-keyed File Platform write, if the test file is missing, or if the suite is empty | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V05 | CLM-09, CLM-11, CLM-12, CLM-17 | UNIT | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-fail-closed.test.ts` | Six pages are selectable and render unavailable/empty without a provider using source-locale `knowledge.*` copy; production module graph contains neither `MockKnowledgeRepository` nor `MockUploadFile`; Knowledge Chat does not call Work Chat Run / Skill Run APIs. File lives under `apps/work/tests/` so renderer imports are outside `tsconfig.node.json` | Fail if fixture lists or sendable mock Q&A appear, if the test file is missing, or if the suite is empty | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V06 | CLM-12, CLM-13, CLM-16 | INTEGRATION | LOCAL | `npm --prefix apps/work run typecheck && npm --prefix apps/work run guard && npm --prefix apps/work test -- --passWithNoTests=false tests/layout-knowledge-view.test.ts tests/knowledge-route-scope.test.ts tests/knowledge-fail-closed.test.ts src/main/knowledge/knowledge-upload-job-coordinator.test.ts src/main/files/file-import-knowledge-job.test.ts src/main/files/file-association-store.test.ts` | `typecheck:node` and `typecheck:web` pass; `check:no-reference-imports` and the rest of `guard` pass; targeted tests pass. Work `lat.md/` is not updated this Stage; `lat check` is not a blocking command here | Fail if Work sources import `apps/knowledge`, if a listed test file is missing, if a targeted suite is empty, or if a UI test is placed under `src/main/` | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V07 | CLM-14, CLM-15 | CONTRACT_RELEASE | LOCAL | `git grep -n "status: APPROVED" -- docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md docs/work/AD-WORK-KNOWLEDGE-v1.0-independent-view.md && git grep -n "RM-01" -- docs/work/ROADMAP-WORK-KNOWLEDGE-v1.0-independent-view.md` | PRD and AD remain APPROVED; Roadmap RM-01 remains bound to this Stage PRD | Fail if either status is not APPROVED | LOCAL_TRANSIENT | local | REUSE_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#View`
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#PINNED_NAV_ITEMS`
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#goTo`
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#paneStyle`
- `apps/work/src/shared/i18n/locales/en/navigation.ts`
- `apps/work/src/shared/i18n/index.ts#resources`
- `apps/work/src/shared/files/file-ipc.ts#FileImportContext`
- `apps/work/src/main/files/file-import-service.ts#importOnePath`
- `apps/work/src/main/files/file-import-service.ts#stageClipboardImport`
- `apps/work/src/shared/files/file-association.ts#FileAssociation`
- `apps/work/src/main/files/file-association-store.ts#insertAssociation`
- `apps/work/src/preload/files-api.ts#createFilesApi`
- `apps/work/src/preload/index.ts#hermesAPI`
- `apps/work/src/main/ipc/register.ts#registerIpcHandlers`
- `apps/work/src/main/session-metadata-store.ts`
- `apps/work/src/main/files/jobs/file-job-queue.ts#FileJobQueue`
- `apps/work/src/shared/auth/auth-contract.ts#DesktopAuthUser`
- `apps/work/tsconfig.node.json`
- `apps/work/tsconfig.web.json`
- `apps/knowledge/src/utils/routes.ts` (working-tree copy source; not in HEAD)
- `apps/knowledge/src/features/knowledge-home/index.tsx` (working-tree copy source; not in HEAD)
- `apps/knowledge/src/features/uploads/uploads-page.tsx` (working-tree copy source; not in HEAD)
- `apps/knowledge/src/services/knowledge/` (working-tree copy source; not in HEAD)

## Triggered Read

- If `importOnePath` callers besides Chat construct `sessionId` themselves: `apps/work/src/main/files/file-service.ts` and `apps/work/src/renderer/src/screens/Chat/composerFilePlatform.ts`
- If association cleanup already has refcount helpers: remainder of `apps/work/src/main/files/file-association-store.ts`
- Otherwise: do not read

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#View` | PROD | MODIFY | Work Renderer Layout | T1 | renderer_ui | C01 | no |
| C01 | `apps/work/src/shared/i18n/locales/en/navigation.ts` | PROD | MODIFY | Work source-locale catalog | T1 | isolated_store | C01 | no |
| C01 | `apps/work/tests/layout-knowledge-view.test.ts` | TEST | ADD | none | T1 | isolated_store | C01 | yes |
| C01 | `docs_agent/test-assets/TA-WK01-LAYOUT.json` | CONFIG | ADD | none | T1 | isolated_store | C01 | yes |
| C02 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` | PROD | ADD | none | T2 | renderer_ui | C02 | yes |
| C03 | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts` | PROD | ADD | none | T2 | renderer_ui | C03 | yes |
| C04 | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts` | PROD | ADD | none | T2 | renderer_ui | C04 | yes |
| C04 | `apps/work/tests/knowledge-route-scope.test.ts` | TEST | ADD | none | T2 | isolated_store | C04 | yes |
| C04 | `docs_agent/test-assets/TA-WK01-ROUTE.json` | CONFIG | ADD | none | T2 | isolated_store | C04 | yes |
| C05 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` | PROD | ADD | none | T2 | renderer_ui | C05 | yes |
| C06 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | PROD | ADD | none | T3 | renderer_ui | C06 | yes |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | PROD | ADD | none | T4 | backend renderer_ui rollback | C07 | yes |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-store.ts` | PROD | ADD | none | T4 | isolated_store | C07 | yes |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts` | TEST | ADD | none | T4 | isolated_store | C07 | yes |
| C07 | `docs_agent/test-assets/TA-WK01-JOB.json` | CONFIG | ADD | none | T4 | isolated_store | C07 | yes |
| C08 | `apps/work/src/shared/files/file-ipc.ts#FileImportContext` | PROD | MODIFY | Work Main File Platform | T5 | backend renderer_ui rollback | C08 | no |
| C08 | `apps/work/src/main/files/file-import-service.ts#importOnePath` | PROD | MODIFY | Work Main File Platform | T5 | isolated_store | C08 | no |
| C08 | `apps/work/src/main/files/file-import-service.ts#stageClipboardImport` | PROD | MODIFY | Work Main File Platform | T5 | isolated_store | C08 | no |
| C08 | `apps/work/src/shared/files/file-association.ts#FileAssociation` | PROD | MODIFY | Work Main File Platform | T5 | isolated_store | C08 | no |
| C08 | `apps/work/src/main/files/file-association-store.ts#insertAssociation` | PROD | MODIFY | Work Main File Platform | T5 | isolated_store | C08 | no |
| C08 | `apps/work/src/main/files/file-import-knowledge-job.test.ts` | TEST | ADD | none | T5 | isolated_store | C08 | yes |
| C08 | `docs_agent/test-assets/TA-WK01-IMPORT.json` | CONFIG | ADD | none | T5 | isolated_store | C08 | yes |
| C09 | `apps/work/src/preload/knowledge-job-api.ts` | PROD | ADD | none | T4 | backend renderer_ui rollback | C09 | yes |
| C09 | `apps/work/src/shared/knowledge/knowledge-job-ipc.ts` | PROD | ADD | none | T4 | isolated_store | C09 | yes |
| C09 | `apps/work/src/main/knowledge/register-knowledge-job-ipc.ts` | PROD | ADD | none | T4 | isolated_store | C09 | yes |
| C09 | `apps/work/src/preload/index.ts#hermesAPI` | PROD | MODIFY | Work Preload barrel | T4 | isolated_store | C09 | no |
| C09 | `apps/work/src/preload/index.d.ts#HermesAPI` | PROD | MODIFY | Work Preload types | T4 | isolated_store | C09 | no |
| C09 | `apps/work/src/main/ipc/register.ts#registerIpcHandlers` | PROD | MODIFY | Work Main IPC registry | T4 | isolated_store | C09 | no |
| C10 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | PROD | ADD | none | T3 | renderer_ui | C10 | yes |
| C11 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | PROD | ADD | none | T4 | backend renderer_ui rollback | C11 | yes |
| C12 | `apps/work/src/renderer/src/screens/Layout/Layout.tsx` | PROD | KEEP | Existing Work owners | - | renderer_ui | C12 | no |
| C13 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | PROD | ADD | none | T3 | backend renderer_ui rollback | C13 | yes |
| C13 | `apps/work/src/shared/i18n/locales/en/knowledge.ts` | PROD | ADD | none | T3 | isolated_store | C13 | yes |
| C13 | `apps/work/src/shared/i18n/index.ts#resources` | PROD | MODIFY | Work source-locale catalog | T3 | isolated_store | C13 | no |
| C13 | `apps/work/tests/knowledge-fail-closed.test.ts` | TEST | ADD | none | T3 | isolated_store | C13 | yes |
| C13 | `docs_agent/test-assets/TA-WK01-CLOSED.json` | CONFIG | ADD | none | T3 | isolated_store | C13 | yes |

## Domain Activation Ledger

| Domain | Pack Version | Trigger Changes | Capabilities | Status |
|---|---:|---|---|---|
| backend | 2.2.0 | C07,C08,C09,C11,C13 | engineering,preplan,review,verification | REQUIRED |
| frontend | 2.2.0 | C01,C02,C03,C04,C05,C06,C07,C08,C09,C10,C11,C12,C13 | engineering,preplan,review,verification | REQUIRED |
| ops | 2.2.0 | C07,C08,C09,C11,C13 | engineering,preplan,review,verification | REQUIRED |


## Frontend Quality Ledger

| Change ID | Surface | Framework | Composition | State Ownership | Design System | Accessibility | Interaction States | Performance | Visual Verification |
|---|---|---|---|---|---|---|---|---|---|
| C01 | Work Layout sidebar + Knowledge workspace (`Layout.tsx` `View`/`PINNED_NAV_ITEMS` plus source-locale `navigation.knowledge`) | REACT | EXTEND Work Layout/Sidebar | SHARED:Work owns active/visited | REUSE Work tokens、spacing、focus 与 sidebar primitives | Keyboard sidebar activation and focus ring | first-load、active、hidden、restore | Keep-alive via `display:none` after first visit | INTERACTION |
| C02 | Knowledge View root in Work content region | REACT | NEW KnowledgeView root | SHARED:Knowledge root owns module UI | REUSE Work tokens、spacing、focus primitives | Hidden pane is not a focus trap | first-load、active、hidden、restore、module-load-error | No UI-only timers while hidden | INTERACTION |
| C03 | Knowledge workspace navigation | REACT | NEW RouteHost；REMOVE TanStack route tree/hooks | NEW_OWNER:host-instantiated route scope | REUSE Work page header、button、breadcrumb 与 focus primitives | In-module back/reset is keyboard reachable | push、replace、back、reset、invalid-route fallback | No window history writes | INTERACTION |
| C04 | Knowledge route-scope host | REACT | NEW route-scope owner | NEW_OWNER:非模块级 singleton | REUSE Work navigation primitives | Scope instance is not a global listener | push、replace、back、reset | One default scope only | INTERACTION |
| C05 | Knowledge identity in Work | REACT | REMOVE AppShell/Login/Profile/Preferences | MOVE_OWNER:身份转由 Work desktopAuth | REUSE Work typography 与 dialog primitives | No second login surface | loading、error | No token material in Renderer | INTERACTION |
| C06 | Knowledge pages in Work | REACT | EXTEND 业务页面 | LOCAL:页面临时状态留在模块 | REUSE Work typography、colors、dialog、table、form 与 toast primitives | Empty/unavailable copy is announced | loading、empty、unavailable、content、error | Scroll owner is Work content region | LIVE_VISUAL |
| C07 | Upload Jobs workspace snapshot | REACT | EXTEND Upload Jobs UI | SHARED:Main owns lifecycle，Renderer owns filters | REUSE Work progress、status、error primitives | Status text is not color-only | draft、queued、uploading、processing、completed、failed、cancelled、interrupted、unavailable | Snapshot subscribe, not 1s hidden refetch | LIVE_VISUAL |
| C08 | Main File Platform Knowledge Job consumer; Uploads UI stays fail-closed this Stage and must not call `composerFilePlatform` | REACT | EXTEND Work file picker/preview consumer；REMOVE filename-only upload | SHARED:File Platform owns bytes，Knowledge UI owns selection intent | REUSE Work file picker、preview、error 与 accessibility primitives | Picker errors are readable | selecting、importing、validation-error、ready、preview-error | Reuse existing files API | INTERACTION |
| C09 | Knowledge Job sanitized events in UI | REACT | EXTEND Upload Jobs event consumer | SHARED:Main owns events，Renderer owns presentation | REUSE Work status 与 toast primitives | Sanitized errors only | snapshot、event-gap、reconnect | Low-cost subscribe while hidden is allowed | INTERACTION |
| C10 | Remove mock upload UI | REACT | REMOVE timer/fake progress UI | UNCHANGED | REUSE Work empty-state primitives | Unavailable copy is explicit | unavailable | No fake progress timers | INTERACTION |
| C11 | Provider unavailable UI | REACT | EXTEND unavailable status | SHARED:Main owns probe，Renderer owns copy | REUSE Work status 与 error primitives | Blocked state is explicit | unavailable | One shared probe | LIVE_VISUAL |
| C12 | Existing Chat/Skill Run/Settings surfaces | REACT | REUSE existing Chat and Settings surfaces | UNCHANGED | REUSE Work Chat primitives | Unchanged | active、hidden | Unchanged Chat keep-alive | INTERACTION |
| C13 | Knowledge Home/Bases/Sets/Documents/Chat content plus source-locale `knowledge.*` empty/unavailable copy | REACT | EXTEND 业务页面 empty/unavailable；REMOVE MockKnowledgeRepository 生产读取 | SHARED:Main owns capability probe，Renderer owns unavailable/empty presentation | REUSE Work empty-state、status 与 error primitives | Empty/unavailable is not a fake list | unavailable、empty、content、query-error | No fixture fetches | LIVE_VISUAL |

## Backend Quality Ledger

| Change ID | Owner | Contract | Data/Transaction | Auth | Idempotency/Concurrency | Failure Semantics | Observability | Verification |
|---|---|---|---|---|---|---|---|---|
| C07 | Proposed Main Knowledge Upload Job Coordinator | COMPATIBLE_EXTEND | MIGRATION | NEW_BOUNDARY | REQUIRED | 启动恢复非终态 Job；无法协调时单调进入 interrupted 或 provider-unavailable；终态不可回退。Draft 必须持久化 opaque `knowledgeBaseId` 或 sentinel `unbound`，本 Stage 不做远程知识库查询。 | 记录 Job ID、knowledgeBaseId、attempt、阶段、持续时间、恢复结果和脱敏错误码；禁止 token/path/payload。 | V03 |
| C08 | Existing Work Main File Platform | COMPATIBLE_EXTEND | TRANSACTIONAL | MODIFY | REQUIRED | Knowledge 路径在任何写入前解析 Job；config/copy/ManagedFile/parse/association 全部使用 Job `workProfileId`；未知或跨分区拒绝。任一步失败都产生可清理结果；`insertAssociation` 对 `knowledgeJobId` 幂等；引用存在时禁止物理删除。Knowledge 不走 clipboard staging。Chat clipboard 仍要求 `sessionId`。 | 记录 consumer kind、Job ID、ManagedFile ID、association 结果和 cleanup 决策，不记录本地绝对路径。 | V04 |
| C09 | Work Shared Contract + curated Preload + Main handler | COMPATIBLE_EXTEND | WRITE | NEW_BOUNDARY | REQUIRED | 非法、跨身份、重复或乱序命令返回稳定安全错误；Renderer 断开不取消 Main Job。 | IPC 命令结果、授权拒绝、事件序号/丢失恢复和 handler latency 可关联到 Job ID。 | V03 |
| C11 | Main Job Owner + Remote Provider Adapter | COMPATIBLE_EXTEND | READ_ONLY | MODIFY | REQUIRED | provider 缺失或 capability probe 失败时 fail closed 到 blocked_provider_unavailable，不进入 fake active/completed。本 Stage 探测函数写在 C07 coordinator 内，不新增独立 adapter 文件或 HTTP client。 | capability 状态、最近成功探测时间和脱敏失败类别可观测；不暴露 provider 原始错误。 | V03 |
| C13 | Main capability probe（与 C11 同一探测）+ Knowledge Renderer | COMPATIBLE_EXTEND | READ_ONLY | MODIFY | REQUIRED | provider 缺失时 dashboard/list/detail/chat fail-closed 到 unavailable/empty；禁止 mock repository 内容。 | 与 C11 共用 capability 观测；页面可达但不返回 fixture 实体或 mock 问答。 | V05 |

## Ops Quality Ledger

| Change ID | Deployment Impact | Compatibility | Environment/Config | Health | Migration Order | Rollback | Verification |
|---|---|---|---|---|---|---|---|
| C07 | RESTART | BACKWARD_COMPATIBLE | 本 Stage 不引入生产 Knowledge provider URL；缺失即 fail-closed | Main 启动必须恢复或单调结束非终态 Job；禁止无 Owner 的 uploading/processing | 先增加隔离的 Job/attempt/association 存储，再启用 Coordinator 与 IPC | 关闭 Knowledge View/IPC；保留未读的附加存储，不回写 Chat/Skill Run 文件行 | SMOKE |
| C08 | RESTART | BACKWARD_COMPATIBLE | 无新部署拓扑；沿用现有 userData File Platform | association 与 ManagedFile 引用计数可诊断；禁止仍被引用时物理删除 | Chat import 合同保持可运行后再叠加 Knowledge Job consumer | 停用 Knowledge consumer；Chat `sessionId` 导入路径保持原语义 | SMOKE |
| C09 | RESTART | BACKWARD_COMPATIBLE | Preload/Main 随应用重启加载；无独立服务端口 | 非法/跨身份命令返回稳定安全错误；Renderer 断开不取消 Main Job | 先冻结 sanitized contract，再注册 handler | 卸载 Knowledge preload API 后现有 `desktopAuth`/`hermesAPI.files` 不受影响 | SMOKE |
| C11 | NONE | UNCHANGED | 无真实 provider 配置项 | capability probe 失败进入 blocked_provider_unavailable | 先于任何 fake upload UI 启用 gate | 去掉 Knowledge View 即无 provider 探测 | NOT_REQUIRED |
| C13 | NONE | UNCHANGED | 无真实 provider 读取配置；缺失即 fail-closed | 无 provider 时 list/detail/chat 只呈现 unavailable/empty | 与 C11 同一 gate，先于任何 fixture/mock 内容启用 | 去掉 Knowledge View 即无实体读取探测 | NOT_REQUIRED |

## Test Asset Ledger

| Verification ID | Asset ID | Kind | Path / Entrypoint | Required Capabilities | Action | Impact | Reason |
|---|---|---|---|---|---|---|---|
| V01 | TA-WK01-LAYOUT | TEST | `apps/work/tests/layout-knowledge-view.test.ts` | vitest | NEW | Adds Layout Knowledge keep-alive, English sidebar label, and history isolation. File stays `.ts` and JSX-free under `apps/work/tests/` (vitest include, outside `tsconfig.node.json`) so it does not duplicate C01 frontend activation or break node typecheck; command uses `--passWithNoTests=false` | No current test asserts a `knowledge` View |
| V02 | TA-WK01-ROUTE | TEST | `apps/work/tests/knowledge-route-scope.test.ts` | vitest | NEW | Adds host-scope isolation, descriptor coverage, and AC-05 hidden-effect counters under `apps/work/tests/`; command uses `--passWithNoTests=false` | Route owner does not exist yet |
| V03 | TA-WK01-JOB | TEST | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts` | vitest | NEW | Adds Job recovery, `knowledgeBaseId`, idempotency, partition, and probe coverage without importing renderer or React; command uses `--passWithNoTests=false` | FileJobQueue tests cannot prove remote ingestion |
| V04 | TA-WK01-IMPORT | TEST | `apps/work/src/main/files/file-import-knowledge-job.test.ts` | vitest | NEW | Adds Knowledge Job association, Job-partition File Platform writes, unknown-Job rejection, clipboard reject, Chat clipboard KEEP, and Chat sessionId KEEP coverage; command uses `--passWithNoTests=false` | Current import always writes `sessionId` and trusts `context.profile` for all profile-keyed writes |
| V05 | TA-WK01-CLOSED | TEST | `apps/work/tests/knowledge-fail-closed.test.ts` | vitest | NEW | Adds fail-closed page and no-mock production-path coverage. File stays `.ts` and JSX-free under `apps/work/tests/`; command uses `--passWithNoTests=false` | Mock residual is the current Knowledge default |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `Layout.tsx` already keep-alives views with `visitedViews` and `paneStyle`; `PINNED_NAV_ITEMS` is the sidebar source; `en/navigation.ts` is the source-locale catalog | Adding one View token, pane, and `knowledge` English key is smaller than a new router or Settings Modal host |
| C02 | MINIMAL_NEW | No Work Knowledge module exists at `fa02f4c` | One root component is the smallest keep-alive host Layout can mount |
| C03 | MINIMAL_NEW | Source Knowledge navigation is TanStack Memory Router in untracked `apps/knowledge/src/utils/routes.ts`; Work has no URL router for views | A typed descriptor avoids copying `routeTree.gen` and window history |
| C04 | MINIMAL_NEW | Product needs one default scope that tests can instantiate twice | A factory/owner is smaller than a tab collection or global singleton |
| C05 | REMOVE_ONLY | `window.desktopAuth` already exposes public `DesktopAuthState`; tokens stay in Main | Not copying Knowledge Login/AppShell is the migration |
| C06 | MINIMAL_NEW | Stage pages exist only under untracked `apps/knowledge/src/features/` | One Work-owned page module is smaller than a second app shell |
| C07 | MINIMAL_NEW | No Knowledge ingestion owner exists; `FileJobQueue` is parse-only | New coordinator plus isolated store with persisted `knowledgeBaseId`; reuse queue concurrency without `file-job:*` |
| C08 | MODIFY_EXISTING | `FileImportContext.sessionId` is required today; `importOnePath` trusts `context.profile` for config/copy/ManagedFile/parse/association; `FileAssociation.sessionId` is already optional | Extend the existing import DTO with `knowledgeJobId`, resolve the Job before any write, bind every profile-keyed File Platform write to Job `workProfileId`, and keep Chat `sessionId` |
| C09 | MINIMAL_NEW | `createFilesApi` is the curated preload pattern | Copy that wrapping pattern onto a new channel family including `knowledgeBaseId` |
| C10 | REMOVE_ONLY | Source uploads use `MockUploadFile` and Renderer timers | Omit those contracts from `KnowledgePages.tsx` rather than porting them |
| C11 | MINIMAL_NEW | Capability probe is the same Main owner as C07 | One probe function inside the coordinator avoids a second adapter |
| C13 | MINIMAL_NEW | Source default repository is `MockKnowledgeRepository`; Work has no `knowledge` i18n namespace | Fail-closed pages on the shared probe plus source-locale `knowledge.ts` avoid a fake read API |

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `apps/work/tests/layout-knowledge-view.test.ts` | Blocking AC-01/AC-02 proof cannot reuse Chat layout tests. Keep `.ts` and JSX-free under `apps/work/tests/` so the extra row does not match frontend `.tsx` activation and does not enter `tsconfig.node.json` | T1 owns the new test |
| C01 | `docs_agent/test-assets/TA-WK01-LAYOUT.json` | v3.7 NEW test asset requires a catalog manifest | T1 owns the manifest with the test |
| C02 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` | Work has no Knowledge module root to keep alive | Knowledge Renderer Module becomes the View owner |
| C03 | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts` | Work production path cannot import TanStack Knowledge routes | Same module owns descriptor and pages |
| C04 | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts` | Route owner must be host-instantiable | Same Todo as the View root |
| C04 | `apps/work/tests/knowledge-route-scope.test.ts` | AC-03 needs deterministic two-scope proof outside `tsconfig.node.json` | T2 owns the test |
| C04 | `docs_agent/test-assets/TA-WK01-ROUTE.json` | NEW test asset catalog | T2 owns the manifest |
| C05 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` | Independent Auth is removed by not creating a second identity owner in this root | Same file as C02, same Todo |
| C06 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | Six Stage pages must live in `apps/work` | Knowledge Renderer Module |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | NEW_OWNER required by Architecture Decision | Main Job Owner |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-store.ts` | Isolated Job schema must not rewrite Chat/Skill Run file rows | Same Main Job Owner |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts` | Job recovery/idempotency/partition proof without renderer imports | T4 owns the test |
| C07 | `docs_agent/test-assets/TA-WK01-JOB.json` | NEW test asset catalog | T4 owns the manifest |
| C08 | `apps/work/src/main/files/file-import-knowledge-job.test.ts` | Chat association tests do not cover Job consumer | T5 owns the test |
| C08 | `docs_agent/test-assets/TA-WK01-IMPORT.json` | NEW test asset catalog | T5 owns the manifest |
| C09 | `apps/work/src/preload/knowledge-job-api.ts` | Sanitized Job API cannot reuse `files:` or `file-job:*` | T4 also owns preload barrel integration |
| C09 | `apps/work/src/shared/knowledge/knowledge-job-ipc.ts` | Main and Renderer need one DTO owner | Shared contract under T4 |
| C09 | `apps/work/src/main/knowledge/register-knowledge-job-ipc.ts` | Keep `registerIpcHandlers` a thin registry | T4 owns the new registrar and the hotspot call site |
| C10 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | Mock upload UI is omitted from the same page module | Same Todo as C06 |
| C11 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | Capability probe belongs to the Job owner | Same file as C07 |
| C13 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | Fail-closed entity reads belong in the page module | Same Todo as C06 |
| C13 | `apps/work/src/shared/i18n/locales/en/knowledge.ts` | Fail-closed English copy has no current namespace; source-locale-only write | T3 owns the catalog and the pages that consume it |
| C13 | `apps/work/tests/knowledge-fail-closed.test.ts` | AC-09/AC-11 need production-path proof. Keep `.ts` and JSX-free under `apps/work/tests/` so the extra row does not match frontend `.tsx` activation and does not enter `tsconfig.node.json` | T3 owns the test |
| C13 | `docs_agent/test-assets/TA-WK01-CLOSED.json` | NEW test asset catalog | T3 owns the manifest |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#View`; `apps/work/src/shared/i18n/locales/en/navigation.ts`; `apps/work/tests/layout-knowledge-view.test.ts`; `docs_agent/test-assets/TA-WK01-LAYOUT.json` | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx`; `apps/work/src/renderer/src/screens/Chat/Chat.layout.test.tsx` | T2 | no |
| T2 | C02, C03, C04, C05 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx`; `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts`; `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts`; `apps/work/tests/knowledge-route-scope.test.ts`; `docs_agent/test-assets/TA-WK01-ROUTE.json` | `apps/work/src/shared/auth/auth-contract.ts#DesktopAuthState`; `apps/knowledge/src/utils/routes.ts` | - | no |
| T3 | C06, C10, C13 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx`; `apps/work/src/shared/i18n/locales/en/knowledge.ts`; `apps/work/src/shared/i18n/index.ts#resources`; `apps/work/tests/knowledge-fail-closed.test.ts`; `docs_agent/test-assets/TA-WK01-CLOSED.json` | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts`; `apps/work/src/preload/knowledge-job-api.ts`; `apps/knowledge/src/features/knowledge-home/index.tsx`; `apps/knowledge/src/features/knowledge-bases/knowledge-base-list.tsx`; `apps/knowledge/src/features/knowledge-sets/knowledge-set-list.tsx`; `apps/knowledge/src/features/documents/documents-list.tsx`; `apps/knowledge/src/features/uploads/uploads-page.tsx`; `apps/knowledge/src/features/knowledge-chat/knowledge-chat-page.tsx`; `apps/knowledge/src/services/knowledge/` | T2, T4 | no |
| T4 | C07, C09, C11 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts`; `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`; `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts`; `docs_agent/test-assets/TA-WK01-JOB.json`; `apps/work/src/preload/knowledge-job-api.ts`; `apps/work/src/shared/knowledge/knowledge-job-ipc.ts`; `apps/work/src/main/knowledge/register-knowledge-job-ipc.ts`; `apps/work/src/preload/index.ts#hermesAPI`; `apps/work/src/preload/index.d.ts#HermesAPI`; `apps/work/src/main/ipc/register.ts#registerIpcHandlers` | `apps/work/src/preload/files-api.ts#createFilesApi`; `apps/work/src/main/files/jobs/file-job-queue.ts#FileJobQueue`; `apps/work/src/main/session-metadata-store.ts`; `apps/work/src/shared/auth/auth-contract.ts#DesktopAuthUser` | - | no |
| T5 | C08 | `apps/work/src/shared/files/file-ipc.ts#FileImportContext`; `apps/work/src/main/files/file-import-service.ts#importOnePath`; `apps/work/src/main/files/file-import-service.ts#stageClipboardImport`; `apps/work/src/shared/files/file-association.ts#FileAssociation`; `apps/work/src/main/files/file-association-store.ts#insertAssociation`; `apps/work/src/main/files/file-import-knowledge-job.test.ts`; `docs_agent/test-assets/TA-WK01-IMPORT.json` | `apps/work/src/shared/knowledge/knowledge-job-ipc.ts`; `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`; `apps/work/src/main/files/file-association-store.test.ts`; `apps/work/src/renderer/src/screens/Chat/composerFilePlatform.ts` | T4 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/preload/index.ts` | T4 | Preload barrel is the only place that may expose `hermesAPI.knowledgeJobs` beside `files` / `desktopAuth` |
| `apps/work/src/main/ipc/register.ts` | T4 | `registerIpcHandlers` is the existing IPC registry; T4 adds one call to the Knowledge Job registrar |

## Generated Outputs Ledger

None

## Todo T1 — Add Knowledge View to Work Layout

**Owns Changes**
- C01

**Writes:**
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#View`
- `apps/work/src/shared/i18n/locales/en/navigation.ts`
- `apps/work/tests/layout-knowledge-view.test.ts`
- `docs_agent/test-assets/TA-WK01-LAYOUT.json`

**Reads:**
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx`
- `apps/work/src/renderer/src/screens/Chat/Chat.layout.test.tsx`

**Depends On:**
- T2

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/layout-knowledge-view.test.ts`

**Goal**
Add `knowledge` to the Work `View` union, sidebar, `visitedViews` keep-alive, and `paneStyle` gating so Knowledge is a first-class independent View beside Chat without a URL router.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#View`
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#PINNED_NAV_ITEMS`
- `apps/work/src/renderer/src/screens/Layout/Layout.tsx#goTo`
- `apps/work/src/shared/i18n/locales/en/navigation.ts`

**Changes**
- Extend `View` with `"knowledge"`.
- Add a pinned sidebar item that calls existing `goTo` with `labelKey: "navigation.knowledge"`.
- Add `knowledge: "Knowledge"` to source-locale `apps/work/src/shared/i18n/locales/en/navigation.ts` only. Do not edit `zh-CN` or other non-source locale packages.
- After first visit, mount `KnowledgeView` under `paneStyle("knowledge")` and keep it mounted while hidden.
- Do not change Chat, Settings Modal, or `navigation:goto` behavior for existing views.
- Add JSX-free `apps/work/tests/layout-knowledge-view.test.ts` using `React.createElement`. Place it under `apps/work/tests/` (already in vitest `include`) so it is outside `tsconfig.node.json` and `tsconfig.web.json`. Do not put it under `src/main/` or `src/renderer/screens`. Do not rename it to `.tsx`. Assert keep-alive, history isolation, and English sidebar label. Hidden-effect counters belong to V02/T2. The focused check must use `--passWithNoTests=false`.

**Stop conditions**
- [ ] `knowledge` is a Layout View token with keep-alive identical to other first-visit panes
- [ ] Sidebar shows the English label, not the raw i18n key
- [ ] V01 command passes

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T2 — Knowledge module root, route descriptor, and host-instantiated scope

**Owns Changes**
- C02
- C03
- C04
- C05

**Writes:**
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx`
- `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts`
- `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts`
- `apps/work/tests/knowledge-route-scope.test.ts`
- `docs_agent/test-assets/TA-WK01-ROUTE.json`

**Reads:**
- `apps/work/src/shared/auth/auth-contract.ts#DesktopAuthState`
- `apps/knowledge/src/utils/routes.ts`

**Depends On:**
- -

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-route-scope.test.ts`

**Goal**
Create the Knowledge module root that honors `active` visibility, hosts one default route-scope, maps the six Stage pages through a typed descriptor, and uses Work `desktopAuth` instead of a Knowledge login shell.

**Immediate anchors**
- `apps/knowledge/src/utils/routes.ts` (working-tree copy source; must exist with Migration Copy Source Ledger hash or this Todo is BLOCKED)
- `apps/work/src/shared/auth/auth-contract.ts#DesktopAuthUser`

**Changes**
- Add `KnowledgeView` that receives `active` from Layout, stops UI-only polling/rAF/shortcuts while hidden, and does not unmount.
- Add `createKnowledgeRouteScope()` that is not a module singleton; product wiring creates one default instance.
- Add a descriptor covering `home`, `bases`, `sets`, `documents`, `uploads`, and `chat` with push/replace/back/reset and invalid-route fallback.
- Read public `desktopAuth` state only; do not copy Knowledge Login, AppShell, Profile, Preferences, or token stores.
- Do not import `@tanstack/react-router` on the Work Knowledge path.
- Place `apps/work/tests/knowledge-route-scope.test.ts` under `apps/work/tests/` so renderer imports stay outside `tsconfig.node.json`. Do not put it under `src/main/`. The same file mounts `KnowledgeView` with `active=false` for 30s and asserts UI-only polling/rAF/shortcut counters stay 0.

**Stop conditions**
- [ ] Listed copy source `apps/knowledge/src/utils/routes.ts` exists on disk
- [ ] Two constructed scopes do not share mutable route state
- [ ] Descriptor lists exactly the six Stage pages
- [ ] Hidden-effect counters stay 0 while `active=false`
- [ ] V02 command passes

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T3 — Fail-closed Knowledge pages without mock repository or fake upload

**Owns Changes**
- C06
- C10
- C13

**Writes:**
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx`
- `apps/work/src/shared/i18n/locales/en/knowledge.ts`
- `apps/work/src/shared/i18n/index.ts#resources`
- `apps/work/tests/knowledge-fail-closed.test.ts`
- `docs_agent/test-assets/TA-WK01-CLOSED.json`

**Reads:**
- `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts`
- `apps/work/src/preload/knowledge-job-api.ts`
- `apps/knowledge/src/features/knowledge-home/index.tsx`
- `apps/knowledge/src/features/knowledge-bases/knowledge-base-list.tsx`
- `apps/knowledge/src/features/knowledge-sets/knowledge-set-list.tsx`
- `apps/knowledge/src/features/documents/documents-list.tsx`
- `apps/knowledge/src/features/uploads/uploads-page.tsx`
- `apps/knowledge/src/features/knowledge-chat/knowledge-chat-page.tsx`
- `apps/knowledge/src/services/knowledge/`

**Depends On:**
- T2
- T4

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-fail-closed.test.ts`

**Goal**
Copy the six Stage business pages into Work as fail-closed UI that is reachable without a provider and never uses mock repositories, fake upload progress, or sendable mock Q&A.

**Immediate anchors**
- `apps/knowledge/src/features/knowledge-home/index.tsx`
- `apps/knowledge/src/features/knowledge-bases/knowledge-base-list.tsx`
- `apps/knowledge/src/features/knowledge-sets/knowledge-set-list.tsx`
- `apps/knowledge/src/features/documents/documents-list.tsx`
- `apps/knowledge/src/features/uploads/uploads-page.tsx`
- `apps/knowledge/src/features/knowledge-chat/knowledge-chat-page.tsx`

Working-tree copy sources above must exist with Migration Copy Source Ledger hashes or this Todo is BLOCKED.

**Changes**
- Implement Home, Bases, Sets, Documents, Uploads, and Knowledge Chat in `KnowledgePages.tsx` using Work primitives and the route descriptor.
- Drive entity reads and upload presentation from the Main capability snapshot; without a provider render unavailable/empty only.
- Add `apps/work/src/shared/i18n/locales/en/knowledge.ts` with fail-closed English copy and register it only on the English `resources` object in `apps/work/src/shared/i18n/index.ts`. Do not edit non-source locale packages.
- Do not port `MockKnowledgeRepository`, `MockUploadFile`, filename-only fake completion, Login, AppShell, or TanStack route hooks.
- Knowledge Chat must not start a Work Chat Run / Skill Run or write Chat `FileImportContext.sessionId`.
- Copy types/components into `apps/work`; never import `apps/knowledge`.
- Add JSX-free `apps/work/tests/knowledge-fail-closed.test.ts` using `React.createElement`. Place it under `apps/work/tests/` so it is outside `tsconfig.node.json`. Do not rename it to `.tsx`. The focused check must use `--passWithNoTests=false`.
- Uploads UI this Stage is fail-closed (no real picker submit). File import proof is Main V04. Do not call `composerFilePlatform.ts` (it forges `sessionId || "default"`).

**Stop conditions**
- [ ] All listed copy sources exist on disk
- [ ] All six pages are selectable in the descriptor
- [ ] Production module graph has no mock repository/upload contracts
- [ ] V05 command passes

**Triggered reads**
- If a presentation primitive is missing in Work: existing Work empty-state / table / dialog components used by Chat or Settings
- None unless a listed trigger becomes true

## Todo T4 — Main Knowledge Upload Job Coordinator, capability probe, and sanitized IPC

**Owns Changes**
- C07
- C09
- C11

**Writes:**
- `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts`
- `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`
- `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts`
- `docs_agent/test-assets/TA-WK01-JOB.json`
- `apps/work/src/preload/knowledge-job-api.ts`
- `apps/work/src/shared/knowledge/knowledge-job-ipc.ts`
- `apps/work/src/main/knowledge/register-knowledge-job-ipc.ts`
- `apps/work/src/preload/index.ts#hermesAPI`
- `apps/work/src/preload/index.d.ts#HermesAPI`
- `apps/work/src/main/ipc/register.ts#registerIpcHandlers`

**Reads:**
- `apps/work/src/preload/files-api.ts#createFilesApi`
- `apps/work/src/main/files/jobs/file-job-queue.ts#FileJobQueue`
- `apps/work/src/main/session-metadata-store.ts`
- `apps/work/src/shared/auth/auth-contract.ts#DesktopAuthUser`

**Depends On:**
- -

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-upload-job-coordinator.test.ts`

**Goal**
Add the Main Knowledge Upload Job Coordinator with isolated persistence, restart recovery, identity partition, a shared capability probe, and a sanitized preload/IPC contract.

**Immediate anchors**
- `apps/work/src/preload/files-api.ts#createFilesApi`
- `apps/work/src/main/session-metadata-store.ts`
- `apps/work/src/main/ipc/register.ts#registerIpcHandlers`

**Changes**
- Persist Jobs/attempts in a new store using `getDbConnection`, without rewriting Chat/Skill Run file rows.
- Coordinator creates draft Jobs bound to the current Main identity partition and an opaque `knowledgeBaseId`. Renderer may send a selected base id or the sentinel `unbound` when no base exists or the probe is unavailable. Main sanitizes (non-empty, max length, allowed charset) and persists; it does not call a remote Knowledge API this Stage.
- Coordinator resumes non-terminal Jobs at process start, and monotonically records `failed` / `cancelled` / `interrupted` / `blocked_provider_unavailable`.
- Reuse `FileJobQueue` only as a concurrency primitive if needed; do not publish `file-job:*`.
- Partition key is `{workProfileId, authSubject, tenantScope}` derived in Main from Layout profile, `DesktopAuthUser.id`, and optional `tenantId` (missing tenant → explicit personal scope).
- Capability probe is one Main function: no provider means upload and entity reads fail closed; never emit fake `completed`.
- Add `knowledge-job-ipc.ts` DTOs including `knowledgeBaseId`, `createKnowledgeJobApi` preload, registrar, and thin hooks in `hermesAPI` plus `registerIpcHandlers`.
- Snapshots/errors omit tokens, absolute paths, and provider raw errors.
- Coordinator test stays at `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts` and must not import renderer modules or React. Hidden-effect UI counters belong to V02/T2, not this file. Simulate a hidden pane by running the coordinator with no renderer subscriber and asserting the snapshot may still change or become `blocked_provider_unavailable`. The focused check must use `--passWithNoTests=false`.

**Stop conditions**
- [ ] Draft Job persists `knowledgeBaseId` or `unbound` with the partition
- [ ] Restart recovery and duplicate command tests pass
- [ ] Cross-partition commands are rejected
- [ ] V03 command passes

**Triggered reads**
- If sqlite migration helpers already exist beside `session-metadata-store.ts`: that store's `CREATE TABLE IF NOT EXISTS` pattern only
- None unless a listed trigger becomes true

## Todo T5 — Knowledge Job file-import consumer without forging Chat sessionId

**Owns Changes**
- C08

**Writes:**
- `apps/work/src/shared/files/file-ipc.ts#FileImportContext`
- `apps/work/src/main/files/file-import-service.ts#importOnePath`
- `apps/work/src/main/files/file-import-service.ts#stageClipboardImport`
- `apps/work/src/shared/files/file-association.ts#FileAssociation`
- `apps/work/src/main/files/file-association-store.ts#insertAssociation`
- `apps/work/src/main/files/file-import-knowledge-job.test.ts`
- `docs_agent/test-assets/TA-WK01-IMPORT.json`

**Reads:**
- `apps/work/src/shared/knowledge/knowledge-job-ipc.ts`
- `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`
- `apps/work/src/main/files/file-association-store.test.ts`
- `apps/work/src/renderer/src/screens/Chat/composerFilePlatform.ts`

**Depends On:**
- T4

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false src/main/files/file-import-knowledge-job.test.ts src/main/files/file-association-store.test.ts`

**Goal**
Let File Platform associate an imported ManagedFile with a Main Knowledge Job without requiring or forging Chat `sessionId`, while Chat import semantics and refcounted cleanup stay unchanged.

**Immediate anchors**
- `apps/work/src/shared/files/file-ipc.ts#FileImportContext`
- `apps/work/src/main/files/file-import-service.ts#importOnePath`
- `apps/work/src/main/files/file-import-service.ts#stageClipboardImport`
- `apps/work/src/main/files/file-association-store.ts#insertAssociation`

**Changes**
- Extend `FileImportContext` so Chat still supplies `sessionId` and Knowledge supplies `knowledgeJobId` instead; reject mixed or empty consumer keys at `importOnePath`.
- For the Knowledge path, Main looks up `knowledgeJobId` in the coordinator store **before any File Platform write**. Unknown Jobs and Jobs whose partition does not match the current Main identity are rejected with a sanitized error; they must not call `readDesktopFilesConfig`, `findByHash`, `storeManagedCopy`, `upsertManagedFile`, `scheduleParseAfterImport`, or `insertAssociation`.
- After a valid Job lookup, every profile-keyed write uses Job `workProfileId`: config, `findByHash`, `storeManagedCopy`, `ManagedFile.profileId`, `scheduleParseAfterImport`, and association `profileId`. Do not use Renderer `context.profile` on the Knowledge path.
- Knowledge path: `knowledgeJobId` set, `sessionId` absent. Chat path unchanged: `assoc.sessionId: context.sessionId` and Chat still uses `context.profile`.
- Knowledge never uses clipboard staging. If `stageClipboardImport` receives `knowledgeJobId`, reject with a sanitized error. Chat clipboard KEEP still requires `sessionId` and does not accept `knowledgeJobId`.
- Add optional `knowledgeJobId` on `FileAssociation` and persist it in `file_associations` with a compatible additive column. `insertAssociation` must short-circuit on an existing `(profileId, fileId, knowledgeJobId, role)` the same way it does today for `sessionId`.
- Knowledge cleanup must not physically delete a ManagedFile still referenced by Chat, Skill Run, or another Job.
- Do not reuse `file-job:*` events.
- Do not call `composerFilePlatform.ts` from Knowledge. This Stage proves import on Main (V04); Uploads UI stays fail-closed.
- The focused check must use `--passWithNoTests=false`.

**Stop conditions**
- [ ] Knowledge import test creates an association without `sessionId` using the Job partition for config, copy, ManagedFile, parse, and association
- [ ] Unknown-Job and cross-partition Knowledge imports are rejected before any write
- [ ] Repeat Knowledge import of the same file/Job does not insert a duplicate association
- [ ] Existing `file-association-store.test.ts` still passes
- [ ] V04 command passes

**Triggered reads**
- If cleanup/refcount helpers are not in `insertAssociation`: remainder of `file-association-store.ts`
- None unless a listed trigger becomes true

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts | PRD revision request |
