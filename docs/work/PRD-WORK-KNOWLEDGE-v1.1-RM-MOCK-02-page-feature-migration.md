---
work_item_id: WORK-KNOWLEDGE-UI-01
version: 1.1.2
status: APPROVED
governance_profile: LEAN
target_branch: work/prd-v5.1
review_verdict: PASS
approved_at: 2026-09-15T22:40:00+08:00
source_revision: AD-WORK-KNOWLEDGE-v1.1-MOCK-MODE@1.1.0/RM-MOCK-02
grounded_commit: d78e60b88357bde22d4c6c01e17b1556d1bab5a9
architecture_decision: docs/work/AD-WORK-KNOWLEDGE-v1.1-mock-mode.md
parent_prd: docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md
depends_on_prd: docs/work/PRD-WORK-KNOWLEDGE-v1.1-RM-MOCK-01-mock-mode-foundation.md
roadmap_item: RM-04
ges_bundle: 5.0.0
ges_feature_slice: 5.0.7
grounding_mode: discover
frontend_adoption_mode: ENFORCED
---

# PRD — Work Knowledge 页面功能迁移

本文档定义 RM-04（Architecture 中的 RM-MOCK-02）：把 `apps/knowledge` 中除 Profile 外的业务页面信息架构与交互迁入已存在的 `apps/work` Knowledge 模块。页面在 RM-03 交付的显式 Mock Mode / Provider Facade 上可操作；不复制独立应用宿主，也不把 source mock store 当作 Work Owner。

RM-03（WORK-KNOWLEDGE-MOCK-01）已 DONE；本 Stage 现可作为 APPROVED Plan 输入。

## Governance Status

GES Work Router 将本工作项判定为 BOUNDED / LEAN：不新增 Production Owner、不改公共 Job/facade 合同、不升级数据结构或生命周期。那些边界由 RM-03 FULL Stage 持有。Bound Work Facts 为 `VERIFIED`，收据 `.smc/runs/WORK-KNOWLEDGE-UI-01/routing/work-facts.json`。

Roadmap Item `RM-04` 依赖 `RM-03`（DONE）。独立 Review PASS（quality）已记录；依赖闸门解除后本 PRD converge 为 APPROVED。

## Objective

1. 用 Work-native 页面组合替换 `KnowledgePages` 的统一 loading/unavailable/empty 占位壳。
2. 迁移 Home、Knowledge Bases、Knowledge Sets、Documents、Uploads 和 Knowledge Chat 的页面信息架构与交互。
3. 支持 list/detail 路由，继续使用现有 host-instantiated route scope，不引入 TanStack Router 或窗口 URL 路由。
4. 优先复用 Work Layout、样式、Dialog、toast、文件选择、预览和 i18n；仅在缺少合适组合时增加 Knowledge-local 组件。
5. `dataMode=mock` 时页面通过 Facade 读写 Work-owned synthetic 数据，上传走已有 Main Job executor，问答可发送并展示 citation；全程保持 Mock/Demo 标识。
6. `dataMode=provider` 且真实 adapter 未交付时，页面结构可见，数据和 mutation 保持 unavailable/disabled，不得 fake success。
7. Knowledge Chat 保持 knowledge-set-scoped Q&A，不接入 Work Chat Run、Skill Run 或 Hermes transcript。
8. 不迁移 Profile；Preferences 不作为独立页面。

## Out of Scope

- 不实现 Mode Controller、Provider Facade、Job `completed`/progress 合同、legacy Job 迁移或 Mock executor；这些属于 RM-03。
- 不迁移 `/profile`、用户资料卡或 Knowledge 独立账号入口。
- 不迁移 `/preferences` 独立页面、reset demo 作为产品设置页、独立主题或语言。
- 不复制 AppShell、独立 Sidebar、TanStack route tree、Zustand persistence 或 source `components/ui`。
- 不运行时 import `apps/knowledge`。
- 不引入 shadcn / TanStack Router/Query/Table / Zustand / react-hook-form / Sonner 仅为复刻源页面。
- 不新增真实 Knowledge provider、远端 RAG 或服务端权限。
- 不把 permission badge 解释为真实 authorization。
- 不建立 Module Registry、多页签 host 或 URL deep link。

## Routing Facts

```json
{
  "existing_owner": true,
  "existing_capability": true,
  "bounded_writes": true,
  "deterministic_verification": true,
  "new_owner": false,
  "public_contract": false,
  "security_boundary": false,
  "schema_migration": false,
  "protocol_change": false,
  "external_dependency": false,
  "lifecycle_change": false,
  "cross_domain_ownership": false,
  "live_acceptance": false,
  "research_intent": false,
  "governed": true,
  "retained_production_change": true,
  "production_write_requested": true,
  "durable_product_artifact_requested": true,
  "security_sensitive_touch": true,
  "existing_lifecycle_wiring": true,
  "cross_layer_existing_contract": true,
  "local_ui_acceptance": true,
  "existing_public_contract_use": true,
  "existing_external_dependency_use": false,
  "public_contract_change": false,
  "security_boundary_change": false,
  "external_dependency_change": false,
  "lifecycle_contract_change": false,
  "ownership_transfer": false,
  "cross_domain_contract_change": false,
  "external_live_acceptance": false
}
```

## Clarification Ledger

| ID | Category | Impact | Question | Answer | Affects | Status |
|---|---|---|---|---|---|---|
| Q01 | Scope | HIGH | Profile 是否迁移？ | 不迁移；Knowledge route/导航/页面集合均不出现 Profile。 | AC-01/10 | CLOSED |
| Q02 | UI reuse | HIGH | 是否直接复制源组件？ | 只迁移信息架构和行为；用 Work 组件重建。 | AC-02/11 | CLOSED |
| Q03 | Data | HIGH | 源 mock 如何进入 Work？ | 禁止 runtime 使用 `apps/knowledge` mock store。`dataMode=mock` 只消费 RM-03 Facade；测试 fixture 不得成为生产入口。 | AC-03/04/12 | CLOSED |
| Q04 | Provider | HIGH | 无真实 provider 时如何表现？ | provider mode：结构可见、数据/动作 unavailable/disabled。mock mode：可操作 synthetic 数据，必须有 Mock/Demo 标识。 | AC-03–09 | CLOSED |
| Q05 | Preferences | MEDIUM | Knowledge Preferences 是否迁移？ | 不建独立页面；局部 view/filter 归 Knowledge UI state，产品设置归 Work Settings；mock reset/delay 只作为明确标记的 Mock 工具，不作为本 Stage 独立页。 | AC-01/10 | CLOSED |

## Current Capability Inventory

| Capability | State | Existing Owner | Grounded Observation |
|---|---|---|---|
| Work Knowledge View / route | EXISTS | Layout + Knowledge Renderer | RM-01 已覆盖六页 route 与 params；页面 host 未消费 detail params。 |
| Work Knowledge 页面 | PARTIAL | `KnowledgePages` | 六页共用状态壳。 |
| Mock Mode / Facade / Job completed | EXISTS | Main Mode Controller / Facade / Job Coordinator | RM-03 DONE；本 Stage 只消费，不重新设计。 |
| Source Home/Bases/Sets/Documents/Chat/Uploads | MOCK ONLY | `apps/knowledge` features | 迁移对照；不是 Work Owner。 |
| Source Profile | EXISTS / EXCLUDED | `apps/knowledge` Auth/Profile | 不迁移。 |

## Production Owner

| Capability | Production Owner | Decision |
|---|---|---|
| 顶层 View / 侧栏 / keep-mounted | Existing Work Layout | KEEP |
| Knowledge 页面 composition、filter、dialog、detail | Existing Work Knowledge Renderer | MODIFY |
| dataMode / Facade / Mock store / Job executor | RM-03 Main owners | KEEP；本 Stage 只调用 sanitized API |
| File picker / preview | Existing Work File Platform | KEEP |
| Auth / Profile Modal / Settings | Existing Work owners | KEEP |
| UI 文案 | Work i18n English source locale | MODIFY；只写 `apps/work/src/shared/i18n/locales/en/**` |

## Options Resolved

| Option | Result | Reason |
|---|---|---|
| A. 复制 Knowledge UI kit / Router / Zustand | REJECT | 违反 AD 与 GES app boundary |
| B. 在现有 Work Knowledge module 用 Work 组件重建页面 | SELECT | 复用 RM-01/RM-03 Owner |
| C. WebView 或跨根加载 `apps/knowledge` | REJECT | 双宿主 |

## Page Behaviour Scope

| Page | `dataMode=mock` behaviour | `dataMode=provider`（无真实 adapter） |
|---|---|---|
| Home | 概览卡、最近知识集/文档、上传与问答入口来自 Facade；快捷入口走现有 route scope。 | 不伪造数值/最近项；unavailable/empty；动作按 capability 禁用。 |
| Bases list/detail | 搜索/筛选/card-table、详情、创建编辑删除走 Facade。 | 结构与本地筛选可见；结果空；mutation disabled。 |
| Sets list/detail | 搜索、绑定、权重、hybrid retrieval 配置走 Facade，不提交到远端。 | 配置不可提交；无 fixture 统计。 |
| Documents list/detail | 筛选、版本/解析/permission 展示、Work preview。 | 无 ManagedFile 则 unavailable；权限只展示。 |
| Uploads | Work picker + 现有 `knowledgeJobs`；mock executor 可 progress/completed。 | picker/submit 禁用；已有 Job 可显示 blocked；无 timer。 |
| Knowledge Chat | 会话、选择知识集、发送、retrieval/generation 位置、citation panel。 | 不能创建会话或发送；无 fake citations。 |

## Change Classification

| Change ID | Action | Requirement | Production Owner | Boundary | Source Anchor |
|---|---|---|---|---|---|
| C01 | KEEP | 保留 KnowledgeView、Layout entry、route scope 与 RM-03 Facade/Job。 | Existing Work owners | 不改全局 Router 或 mode 合同。 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` |
| C02 | MODIFY | 将 `KnowledgePages` 拆为 Work-native page host 与共用状态容器。 | Work Knowledge Renderer | 不创建第二 Shell。 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` |
| C03 | ADD | Home dashboard 与快捷 route actions。 | Work Knowledge Renderer | provider mode 不显示 fake metrics。 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeHomePage.tsx` |
| C04 | ADD | Bases list/detail、search/filter/view mode 与 mutation affordances。 | Work Knowledge Renderer | mutation 只打 Facade。 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage.tsx` |
| C05 | ADD | Sets list/detail、binding/weight/retrieval affordances。 | Work Knowledge Renderer | 不提交 mock configuration 到远端。 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeSetsPage.tsx` |
| C06 | ADD | Documents list/detail、filters、version/parse/permission 与 Work preview。 | Work Knowledge Renderer + File Platform | permission 不代表授权。 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage.tsx` |
| C07 | MODIFY | Uploads 接入既有 Job/file APIs，展示 snapshot/cancel/retry。 | Work Knowledge Renderer | 不改 Job IPC。 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeUploadsPage.tsx` |
| C08 | ADD | Knowledge Chat composition；mock mode 可发送。 | Work Knowledge Renderer | 不接 Work Chat Run。 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx` |
| C09 | REMOVE | 排除 Profile、Preferences 独立页、source Shell/Router/UI kit。 | Migration boundary | production 不可达。 | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts` |
| C10 | KEEP | 保持 Auth、Chat/Skill Run、Settings 与 Mock/Demo badge。 | Existing Work owners | 页面不得隐藏 badge。 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` |

## Frontend Design Intent

| Change ID | Surface | Framework | Layout | Component Map | State Ownership | Interaction States | Design System | Responsive | Visual Verification |
|---|---|---|---|---|---|---|---|---|---|
| C01 | Knowledge View root keep | REACT | UNCHANGED | REUSE KnowledgeView / route descriptor | SHARED:Layout owns keep-mounted; route scope owns page id | active、hidden | REUSE Work Layout spacing | UNCHANGED | STATIC |
| C02 | Knowledge module frame | REACT | MODIFY:在既有 Work content region 增加模块内导航和 page host | EXTEND KnowledgeView/KnowledgePages/route scope | SHARED:route scope owns route，page host owns presentation | active、hidden、loading、unavailable、empty、error、mock-badge | REUSE Work spacing、typography、focus、button 和 status patterns | MODIFY:主内容区窄宽度下导航和内容不横向溢出 | LIVE_VISUAL |
| C03 | Knowledge Home | REACT | MODIFY:概览卡、最近内容与快捷动作区域 | NEW Work-native dashboard sections | LOCAL:页面只拥有展开和快捷交互 | loading、unavailable、empty、content、error | REUSE Work card、empty-state、icon 和 button patterns | MODIFY:卡片从多列收敛到单列 | LIVE_VISUAL |
| C04 | Bases list/detail | REACT | MODIFY:list toolbar、card/table content、detail sections | NEW Work-native base list/detail composition | LOCAL:search/filter/view/dialog state | loading、unavailable、empty、content、not-found、error、disabled-action | REUSE Work inputs、dialog、table/list、badge、toast patterns | MODIFY:toolbar wrap，table 提供受控横向滚动 | LIVE_VISUAL |
| C05 | Sets list/detail | REACT | MODIFY:list/detail 与 binding/retrieval sections | NEW Work-native set list/detail composition | LOCAL:search、selection、dialog 和 draft UI state | loading、unavailable、empty、content、not-found、error、disabled-action | REUSE Work form、card、badge、dialog 和 status patterns | MODIFY:配置区窄宽度纵向排列 | LIVE_VISUAL |
| C06 | Documents list/detail | REACT | MODIFY:list filters、metadata sections 和 preview region | EXTEND Work file preview；NEW document composition | SHARED:page owns filters，File Platform owns preview data | loading、unavailable、empty、content、not-found、preview-error | REUSE Work file icon、badge、preview、table/list 和 empty-state patterns | MODIFY:preview 与 metadata 在窄宽度上下排列 | LIVE_VISUAL |
| C07 | Uploads | REACT | MODIFY:picker、target、Job list 和 actions | EXTEND Work file picker + existing Knowledge Job UI | SHARED:Main owns Job，page owns selection/filter/dialog | selecting、importing、blocked、queued、uploading、processing、completed、failed、cancelled、interrupted | REUSE Work progress、file card、dialog、toast 和 error patterns | MODIFY:Job actions wrap without hiding status | LIVE_VISUAL |
| C08 | Knowledge Chat | REACT | MODIFY:session rail、message region、composer、citation panel | NEW Knowledge-local composition using Work patterns | LOCAL:selected session、panel visibility 和 composer draft | unavailable、no-session、empty-thread、retrieving、generating、failed、citations-empty、composer-disabled | REUSE Work message typography、textarea、scroll、badge 和 panel patterns | MODIFY:窄宽度折叠 session/citation panels | LIVE_VISUAL |
| C09 | Profile/Preferences/source UI | REACT | MODIFY:从页面集合和 production reachability 移除 | REMOVE source Profile/Preferences/AppShell/UI primitives | UNCHANGED | N/A | REUSE Work Profile Modal/Settings | UNCHANGED | STATIC |
| C10 | Auth/Chat/Settings/badge keep | REACT | UNCHANGED | REUSE KnowledgeView badge and Work Auth/Settings | SHARED:Main owns mode badge data | mock-badge-visible、provider-badge-hidden | REUSE Work badge pattern | UNCHANGED | STATIC |

## Backend Design Intent

| Change ID | Owner | Contract | Data/Transaction | Auth | Idempotency/Concurrency | Failure Semantics | Observability |
|---|---|---|---|---|---|---|---|
| C06 | Existing Work File Platform | UNCHANGED | READ_ONLY | UNCHANGED | UNCHANGED | preview unavailable/error 由页面展示。 | 复用现有 File 错误，不增加 payload。 |
| C07 | Existing Main Job Coordinator + File Platform | UNCHANGED | WRITE | UNCHANGED | UNCHANGED | 复用 RM-03 snapshot/command；页面卸载不改变 Job。 | 复用现有 sanitized snapshot/event。 |
| C08 | Existing Provider Facade | UNCHANGED | WRITE | UNCHANGED | UNCHANGED | provider mode composer disabled；mock mode 不写 Work Chat。 | 仅展示现有 capability/mode 状态。 |

本 Stage 不修改 contract 或 schema。若实施发现必须新增 IPC/store/lifecycle，立即升级 FULL 并返回 RM-03/Architecture，不得在本 Plan 顺手增加。

## Ops Design Intent

Live Verification in this table is not LIVE or EXTERNAL acceptance; values are NOT_REQUIRED.

| Change ID | Deployment Impact | Compatibility | Environment/Config | Health | Migration Order | Rollback | Live Verification |
|---|---|---|---|---|---|---|---|
| C01 | NONE | UNCHANGED | 无新服务、端口或启动配置 | N/A: renderer-only page composition | N/A: no schema or deploy migration | N/A: revert page composition | NOT_REQUIRED |
| C07 | NONE | UNCHANGED | 复用已有 Job/File preload | N/A: no new process | N/A: no migration | N/A: no deploy change | NOT_REQUIRED |

## Acceptance Fixture Policy

组件/视觉 harness fixture 必须与 production wiring 隔离，不得从 `apps/knowledge/src/mock` 或源 mock stores 导入。Production 只读取 RM-03 Facade、Job 和 File APIs。`dataMode=provider` 时仍返回 unavailable/empty。

## Observable Behaviour

用户进入 Knowledge 后看到与当前 route 匹配的 Work-native 页面，而不是六页相同状态壳。模块内导航、详情返回、搜索、筛选、card/table、dialog 等纯 UI 在两种 mode 下都可工作。

`dataMode=mock` 时，CRUD、上传完成态和 Knowledge Chat 发送通过 Facade/Job 生效，且 Mock/Demo 标识不可被页面关掉。`dataMode=provider` 时依赖实体的动作 fail-closed。View 切换只改变 `active`；返回 Knowledge 时保留 route 与安全 UI state。

## Acceptance Criteria

- **AC-01**：[C01/C02/C09] Knowledge 只包含 Home、Bases、Sets、Documents、Uploads、Chat；不存在 Profile/Preferences route 或可达页面。
- **AC-02**：[C02/C09] Work production 不跨根 import `apps/knowledge`，不导入 source UI kit/Router/mock stores。
- **AC-03**：[C02/C03] Home 有概览、最近内容和快捷区；provider mode 不显示伪造数值；mock mode 数据来自 Facade。
- **AC-04**：[C04] Bases list/detail 支持本地 search/filter/card-table、detail/back 和 mutation affordance；provider mode 结果为空且 mutation disabled。
- **AC-05**：[C05] Sets list/detail 支持 search、detail/back、binding/weight/retrieval affordance；provider mode 不可提交。
- **AC-06**：[C06] Documents 支持筛选、detail、版本/解析/permission；有 ManagedFile 时用 Work preview；权限 badge 不宣称授权。
- **AC-07**：[C07] Uploads 使用现有 picker 与 `knowledgeJobs`；mock mode 可观察 Main progress/completed；无 sample timer；View 切换不重复创建 Job。
- **AC-08**：[C08] Knowledge Chat 展示 session/message/composer/citation；provider mode 不能发送；mock mode 不创建 Work Chat/Skill Run。
- **AC-09**：[C02/C04/C05/C06/C08] 现有 route scope 表达 list/detail/session params；不写窗口 URL；不增加 TanStack Router。
- **AC-10**：[C03–C08] 每页覆盖 loading/unavailable/empty/content/error 及适用的 not-found/disabled/processing；状态切换不依赖源 mock store。
- **AC-11**：[C02–C09] 新增文案只进 Work English source locale；键盘 focus、dialog、列表语义、disabled 原因和窄宽度通过 Frontend visual/accessibility review。
- **AC-12**：[C01/C10] 不改变 Layout keep-mounted、Chat/Skill Run、Settings/Profile、mode 合同或 File/Job IPC；RM-03 badge 在 mock mode 保持可见；RM-01 regression 与 boundary guards 继续通过。

## Acceptance Claim Ledger

| Claim ID | AC | Blocking | Prior Evidence | Prior Result | Evidence Action |
|---|---|---|---|---|---|
| CL01 | AC-01/02 | YES | RM-01 no-cross-root evidence | PROVEN_FRESH | TARGETED_RERUN + NEW_EVIDENCE |
| CL02 | AC-03 | YES | Generic status shell | PROVEN_BUT_AFFECTED | NEW_EVIDENCE + LIVE_VISUAL |
| CL03 | AC-04/05 | YES | Source Bases/Sets mock pages；Work route params | PROVEN_BUT_AFFECTED | NEW_EVIDENCE + LIVE_VISUAL |
| CL04 | AC-06 | YES | Work FilePreview；source placeholder preview | PROVEN_BUT_AFFECTED | NEW_EVIDENCE + LIVE_VISUAL |
| CL05 | AC-07 | YES | RM-01 Job/File；RM-03 mock executor | PROVEN_BUT_AFFECTED | TARGETED_RERUN + UI EVIDENCE |
| CL06 | AC-08 | YES | RM-01 Chat isolation | PROVEN_BUT_AFFECTED | NEW_EVIDENCE + LIVE_VISUAL |
| CL07 | AC-09/10 | YES | RM-01 route scope | PROVEN_BUT_AFFECTED | NEW_EVIDENCE |
| CL08 | AC-11/12 | YES | Work i18n/guards + RM-03 badge | PROVEN_FRESH | TARGETED_RERUN + LIVE_VISUAL |

## Source Anchors

| Area | Source Anchor | Grounded Fact |
|---|---|---|
| Architecture | `docs/work/AD-WORK-KNOWLEDGE-v1.1-mock-mode.md` | 显式 mock mode；页面不得自建 Owner。 |
| Foundation | `docs/work/PRD-WORK-KNOWLEDGE-v1.1-RM-MOCK-01-mock-mode-foundation.md` | mode/facade/Job/badge 前置。 |
| Parent | `docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md` | View/Job/File/Auth 边界。 |
| Source features | `apps/knowledge/lat.md/features.md`、`apps/knowledge/src/features/` | 六个业务页面域。 |
| Current pages | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | 统一状态壳。 |
| Route | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts` | page/params 已存在。 |
| Work UI | `.agents/ges/frontend/apps/work/component-registry.json` | 目标 UI 语言。 |
| i18n | `apps/work/src/shared/i18n/locales/en/knowledge.ts` | English source locale owner。 |

## Risks and Escalation

| Risk | Severity | Mitigation |
|---|---|---|
| 在 RM-03 完成前实施本 Stage | HIGH | Roadmap 依赖；无 READY 不进 Plan |
| 跨根复制 UI kit / mock store | HIGH | AC-02 失败 |
| 页面自建 Job timer 或 mode 切换 | HIGH | 升级 FULL 并返回 Architecture |
| Knowledge Chat 写入 Work Chat | HIGH | 独立 UI state；任何 Chat Session 写入立即停止 |
| 隐藏 Mock/Demo badge | HIGH | AC-12 失败 |
| Work 缺少 primitive 导致第二套 design system | MEDIUM | Knowledge-local 组件必须使用 Work token |

## Target End-State Inventory

| Capability | Target State | Production Owner | Boundary / Observable Result |
|---|---|---|---|
| Knowledge page host | MODIFY | Work Knowledge Renderer | Six Work-native pages replace the shared loading/unavailable/empty shell. |
| Home / Bases / Sets / Documents / Uploads / Chat | ADD | Work Knowledge Renderer | List/detail/session IA operable on Facade/Job; provider mode structure-visible + data fail-closed. |
| Profile / Preferences / source Shell | REMOVE | Migration boundary | Not reachable in Knowledge module. |
| Mode / Facade / Job / badge | KEEP | RM-03 Main owners | Pages consume only; badge remains visible in mock. |
| Auth / Chat Run / Skill Run / Settings | KEEP | Existing Work owners | Unchanged. |

## Definition of Done

- **DOD-01**：AC-01 至 AC-12 blocking claims 有当前 implementation commit 证据。
- **DOD-02**：Frontend visual verification 覆盖六个页面域宽/窄内容区及关键状态。
- **DOD-03**：Work typecheck、targeted tests、RM-01/RM-03 regression、no-reference-imports、i18n guard 通过。
- **DOD-04**：production bundle 不含 source mock repository、timer、Profile/Preferences、TanStack app router 或跨根 import。

## Open Governance Finding

无。RM-03 DONE（commit `c3715244`）；本 PRD 已 APPROVED，可作为 canonical Plan 输入。v1.0 父 PRD 中禁止生产 mock 的 AC-09/AC-11 由 AD v1.1 替代范围覆盖，不在本 Stage 回写历史审批。
