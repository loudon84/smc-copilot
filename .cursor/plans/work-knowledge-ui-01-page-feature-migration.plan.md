---
name: WORK-KNOWLEDGE-UI-01 Page Feature Migration
overview: Replace the Knowledge generic status shell with six Work-native pages (Home/Bases/Sets/Documents/Uploads/Chat) on the RM-03 Facade/Job APIs. Exclude Profile/source Shell; keep provider fail-closed and Mock/Demo badge.
todos:
  - id: t1-page-host
    content: "T1 — Split KnowledgePages into page host + shared UI state [C02]"
    status: completed
  - id: t2-home
    content: "T2 — Add Knowledge Home dashboard [C03]"
    status: completed
  - id: t3-bases
    content: "T3 — Add Bases list/detail [C04]"
    status: completed
  - id: t4-sets
    content: "T4 — Add Sets list/detail [C05]"
    status: completed
  - id: t5-documents
    content: "T5 — Add Documents list/detail + preview [C06]"
    status: completed
  - id: t6-uploads
    content: "T6 — Wire Uploads to Job/file APIs [C07]"
    status: completed
  - id: t7-chat
    content: "T7 — Add Knowledge Chat composition [C08]"
    status: completed
  - id: t8-boundary-guards
    content: "T8 — Enforce Profile/source exclusion + regression guards [C09]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.7
plan_id: WORK-KNOWLEDGE-UI-01
domain_contract: smc.ges.domain-activation.v2
consumer_profile: generic@2.0.0
domain_policy_digest: sha256:44550d8ceca212b2242d0b407ae3ffd279dcdba8841a7a6b19deb0ec6e44aab6
commit_policy: post_review
acceptance_contract:
source_revision: AD-WORK-KNOWLEDGE-v1.1-MOCK-MODE@1.1.0/RM-MOCK-02
grounded_commit: d78e60b88357bde22d4c6c01e17b1556d1bab5a9
grounding_source: committed_baseline
working_tree_fingerprint: clean
governance_profile: LEAN
source_prd: docs/work/PRD-WORK-KNOWLEDGE-v1.1-RM-MOCK-02-page-feature-migration.md
source_prd_sha256: sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4
domain_intent_binding_version: 1
domain_intent_digest: sha256:0b44af0f024b5c78f8e492ac852ef74c9956d809b0037823acb3edf4e75c7c14
domain_activation_digest: sha256:fc75962c9c0201b264a28a7e5104bc4796dfbe9b65fa03df27975d72f1e93bbb
plan_compact: LEAN
---

# WORK-KNOWLEDGE-UI-01 Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-KNOWLEDGE-v1.1-RM-MOCK-02-page-feature-migration.md)

## Scope

- In: Work-native Knowledge page host; Home / Bases / Sets / Documents / Uploads / Chat information architecture and interactions on RM-03 Facade + Job + File APIs; route-scope params for list/detail/session; Work English i18n; provider-mode structure-visible fail-closed; mock-mode operable synthetic data with persistent Mock/Demo badge; Profile/Preferences/source Shell exclusion guards.
- Out: Mode Controller / Facade / Mock adapter / Job contract / File dataMode isolation redesign (RM-03 DONE); real Remote Adapter (RM-02); Profile/Preferences independent pages; TanStack Router / Zustand upload timer / source UI kit; runtime import of `apps/knowledge`; Work Chat/Skill Run writes; new IPC/store/lifecycle (escalate FULL if required).
- Production Owner inherited from PRD: Work Knowledge Renderer MODIFY for pages; RM-03 Main Mode/Facade/Job KEEP (consume only); File Platform KEEP for preview/picker; Auth/Chat/Settings KEEP.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C02 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages` | Generic loading/unavailable/empty/ready shell; no list/detail | `KnowledgePages`, `resolvePresentation` resolve at `d78e60b8` | `KnowledgeView` renders `<KnowledgePages page={...} />` without params | Reuse mode/capability probes; do not add second Shell | PASS |
| C02 | `apps/work/src/shared/knowledge/use-knowledge-facade.ts` | Absent shared probe | New shared facade/mode probe | Host + pages import probe | Keep under shared/ so frontend activation stays one C02 renderer row | PASS |
| C03 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeHomePage.tsx` | Absent | New page under Knowledge module | Host switches on `page==="home"` | Consume `knowledgeJobs.facade.listEntities`; no source Home feature import | PASS |
| C04 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage.tsx` | Absent | New list/detail composition | Host + route `knowledgeBaseId` | Facade `kind:"base"` mutate; local search/filter only | PASS |
| C05 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeSetsPage.tsx` | Absent | New list/detail composition | Host + route `knowledgeSetId` | Facade `kind:"set"`; drafts stay local until mutate | PASS |
| C06 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage.tsx` | Absent | New list/detail + preview region | Host + route `documentId` | Reuse Work File preview APIs when ManagedFile present; permission display-only | PASS |
| C07 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeUploadsPage.tsx` | Absent; Jobs exist via Main | New Uploads UI | Host; `knowledgeJobs` createDraft/list/cancel/retry | Reuse existing Job IPC; no Renderer timer | PASS |
| C08 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx` | Absent | New session/message/composer/citation UI | Host + route `sessionId` | Facade session/citation mutate; never call Work Chat Run APIs | PASS |
| C09 | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts` | Six pages only; no profile | `KNOWLEDGE_ROUTE_PAGES` resolves | Descriptor + guard tests | REMOVE means keep profile absent + assert no cross-root import | PASS |

## Domain Intent Binding

| Domain | Change ID | Intent SHA256 | Source PRD SHA256 |
|---|---|---|---|
| backend | C06 | `sha256:d8dba53fe849dac15bc413cb7f146ffe7816aaac35e8f376bf4268f601b6ba85` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| backend | C07 | `sha256:a95310b68c0db5597fef62a9c9c96d4e1f809a903e470383fe77c08767d29faf` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| backend | C08 | `sha256:d2c2f2be44c01430ea25c9bc959ae73157b86d45947560c24ade26e47f90853f` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C01 | `sha256:ca634c9d127da3b6085705996778f0e95d6d6c9e7068ec52f95647fa344c7fbd` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C02 | `sha256:f5622e3142229c0d8188044b3b88cfcdb5593a637cc96c2eb8aa9b93fb159ce7` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C03 | `sha256:a9041cd9d65816b9725f39f6535b55abd45b4d277f609cc392eba83d4eea4031` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C04 | `sha256:afe4f45f9b30a32f64d36f7cea8139040b5db5861133ad719255adb5fdeac688` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C05 | `sha256:09407f49599934cafb19a33974d5c4b7bb2d2020092023ec99d2535839a72e62` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C06 | `sha256:4ca0d5ed9fe9c7dabcadcfee4f2ff68c79f1a622df0503868d78788386fda546` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C07 | `sha256:8a4545aacd289d31ce356c3a5f4bdcf697ee0907748a3e98f519c8d93db071df` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C08 | `sha256:e29e8fcae509bc072bb1f8b32983507222e9ecff0cf49d6eeac3b9a1cffff1ab` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C09 | `sha256:fb1c4ce5de1d019c3a6982a4bcf353113f0bf2ba574b0ed348cfebe02a3ba6c0` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| frontend | C10 | `sha256:8c73d329122929b822e217f61678dc41a10776c5d956755b5ede191bc1b2887e` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| ops | C01 | `sha256:d053aab102975f7de4218becf89c7256123d4f85ea845fadf406581413ba9db9` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |
| ops | C07 | `sha256:96bd0964cd9ea855660820262039c86f7d426c177f99da1b74f3138e7ff36186` | `sha256:189875d6d502636864edaf5b9b7de77002bf29b13b8761b8970c8dfc20c129c4` |

## Governance Profile

- Profile: `LEAN`
- Route rationale: Approved PRD Routing Facts are BOUNDED/LEAN — no new Production Owner, no public Job/facade contract change, no schema/lifecycle. Pages consume RM-03 APIs only.
- Escalation triggers checked: `new_owner`, `public_contract_change`, `schema_migration`, `lifecycle_contract_change`, `ownership_transfer` remain false. If implementation needs new IPC/store/lifecycle, stop and return PRD/Architecture as FULL.
- Risk Facts Snapshot: `{"bounded_writes":true,"cross_domain_contract_change":false,"cross_domain_ownership":false,"cross_layer_existing_contract":true,"deterministic_verification":true,"existing_capability":true,"existing_external_dependency_use":false,"existing_lifecycle_wiring":true,"existing_owner":true,"existing_public_contract_use":true,"external_dependency":false,"external_dependency_change":false,"external_live_acceptance":false,"lifecycle_change":false,"lifecycle_contract_change":false,"live_acceptance":false,"local_ui_acceptance":true,"new_owner":false,"ownership_transfer":false,"protocol_change":false,"public_contract":false,"public_contract_change":false,"schema_migration":false,"security_boundary":false,"security_boundary_change":false,"security_sensitive_touch":true}`
- Source: approved PRD Routing Facts

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | [C01/C02/C09] Knowledge 只包含 Home、Bases、Sets、Documents、Uploads、Chat；不存在 Profile/Preferences route 或可达页面。 | SCOPE | C01, C02, C09 | T1, T8 | V01, V08 | UNIT | yes |
| AC-02 | AC | [C02/C09] Work production 不跨根 import apps/knowledge，不导入 source UI kit/Router/mock stores。 | NEGATIVE | C02, C09 | T1, T8 | V08 | DIFF_SCOPE | yes |
| AC-03 | AC | [C02/C03] Home 有概览、最近内容和快捷区；provider mode 不显示伪造数值；mock mode 数据来自 Facade。 | BEHAVIOR | C02, C03 | T1, T2 | V02 | UNIT | yes |
| AC-04 | AC | [C04] Bases list/detail 支持本地 search/filter/card-table、detail/back 和 mutation affordance；provider mode 结果为空且 mutation disabled。 | BEHAVIOR | C04 | T3 | V03 | UNIT | yes |
| AC-05 | AC | [C05] Sets list/detail 支持 search、detail/back、binding/weight/retrieval affordance；provider mode 不可提交。 | BEHAVIOR | C05 | T4 | V03 | UNIT | yes |
| AC-06 | AC | [C06] Documents 支持筛选、detail、版本/解析/permission；有 ManagedFile 时用 Work preview；权限 badge 不宣称授权。 | BEHAVIOR | C06 | T5 | V04 | UNIT | yes |
| AC-07 | AC | [C07] Uploads 使用现有 picker 与 knowledgeJobs；mock mode 可观察 Main progress/completed；无 sample timer；View 切换不重复创建 Job。 | LIFECYCLE | C07 | T6 | V05 | UNIT | yes |
| AC-08 | AC | [C08] Knowledge Chat 展示 session/message/composer/citation；provider mode 不能发送；mock mode 不创建 Work Chat/Skill Run。 | BEHAVIOR | C08 | T7 | V06 | UNIT | yes |
| AC-09 | AC | [C02/C04/C05/C06/C08] 现有 route scope 表达 list/detail/session params；不写窗口 URL；不增加 TanStack Router。 | CONTRACT | C02, C04, C05, C06, C08 | T1, T3, T4, T5, T7 | V01, V07 | UNIT | yes |
| AC-10 | AC | [C03–C08] 每页覆盖 loading/unavailable/empty/content/error 及适用的 not-found/disabled/processing；状态切换不依赖源 mock store。 | BEHAVIOR | C03, C04, C05, C06, C07, C08 | T2, T3, T4, T5, T6, T7 | V02, V03, V04, V05, V06 | UNIT | yes |
| AC-11 | AC | [C02–C09] 新增文案只进 Work English source locale；键盘 focus、dialog、列表语义、disabled 原因和窄宽度通过 Frontend visual/accessibility review。 | SCOPE | C02, C03, C04, C05, C06, C07, C08, C09 | T1, T8 | V07, V09 | DOCUMENT_SEMANTIC | yes |
| AC-12 | AC | [C01/C10] 不改变 Layout keep-mounted、Chat/Skill Run、Settings/Profile、mode 合同或 File/Job IPC；RM-03 badge 在 mock mode 保持可见；RM-01 regression 与 boundary guards 继续通过。 | SCOPE | C01, C10 | T1, T8 | V07, V08 | INTEGRATION | yes |
| DOD-01 | DOD | AC-01 至 AC-12 blocking claims 有当前 implementation commit 证据。 | EVIDENCE | C02, C03, C04, C05, C06, C07, C08, C09 | T8 | V08 | INTEGRATION | yes |
| DOD-02 | DOD | Frontend visual verification 覆盖六个页面域宽/窄内容区及关键状态。 | EVIDENCE | C03, C04, C05, C06, C07, C08 | T8 | V09 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | Work typecheck、targeted tests、RM-01/RM-03 regression、no-reference-imports、i18n guard 通过。 | EVIDENCE | C02, C03, C04, C05, C06, C07, C08, C09 | T8 | V08 | INTEGRATION | yes |
| DOD-04 | DOD | production bundle 不含 source mock repository、timer、Profile/Preferences、TanStack app router 或跨根 import。 | NEGATIVE | C09 | T8 | V08 | DIFF_SCOPE | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Knowledge upload Job observe | AC-07 | Uploads page open / picker createDraft / View hide-show | selecting / queued / uploading / processing | Existing Main Job Coordinator snapshots (page is consumer only) | cancel/retry via knowledgeJobs; page must not own sample timer or recreate Jobs on remount | V05 |

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | AC-01, AC-09 | UNIT | LOCAL | `node apps/work/scripts/run-knowledge-ui-01-suite.mjs V01` | Host switches six pages; params drive detail; no profile page id; no window URL mutation | Fail if Profile route appears or host still renders only status shell | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V02 | AC-03, AC-10 | UNIT | LOCAL | `node apps/work/scripts/run-knowledge-ui-01-suite.mjs V02` | Mock mode shows overview/recent/shortcuts from facade fixtures; provider shows unavailable/empty without fake metrics | Fail if provider paints synthetic counts | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V03 | AC-04, AC-05, AC-10 | UNIT | LOCAL | `node apps/work/scripts/run-knowledge-ui-01-suite.mjs V03` | List/detail/search/filter work; mock mutate affordances call facade; provider mutations disabled/empty | Fail if mutate succeeds in provider mode | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V04 | AC-06, AC-10 | UNIT | LOCAL | `node apps/work/scripts/run-knowledge-ui-01-suite.mjs V04` | Filters/detail/permission display; preview uses Work file APIs when ManagedFile present; permission does not claim authorization | Fail if permission copy authorizes File/Chat | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V05 | AC-07 | UNIT | LOCAL | `node apps/work/scripts/run-knowledge-ui-01-suite.mjs V05` | Uploads list Jobs via knowledgeJobs; mock can observe completed; no setInterval upload timer in page module | Fail if page owns progress timer or recreates Job on View remount | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V06 | AC-08 | UNIT | LOCAL | `node apps/work/scripts/run-knowledge-ui-01-suite.mjs V06` | Session/composer/citation render; provider composer disabled; mock send uses facade only; no Work Chat session create | Fail if Chat Run / Skill Run APIs are imported | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V07 | AC-09, AC-11, AC-12 | UNIT | LOCAL | `node apps/work/scripts/run-knowledge-ui-01-suite.mjs V07` | Badge remains in mock; Layout keep-mounted unchanged; provider fail-closed retained | Fail if badge hideable or Chat Run regresses | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V08 | AC-01, AC-02, AC-12, DOD-01, DOD-03, DOD-04 | INTEGRATION | LOCAL | `node apps/work/scripts/run-knowledge-ui-01-v08.mjs` | typecheck/guard pass; no apps/knowledge import; RM-03 facade/job suites still pass | Fail if any listed suite missing/empty | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V09 | AC-11, DOD-02 | COMPONENT | LOCAL | `node apps/work/scripts/run-knowledge-ui-01-v09.mjs` | Review notes PASS with screenshots or structured checklist under `docs_agent/evidence/` | Fail if any page domain missing | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages`
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView`
- `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts`
- `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts#createKnowledgeRouteScope`
- `apps/work/src/shared/knowledge/knowledge-job-ipc.ts#HermesKnowledgeFacadeAPI`
- `apps/work/src/preload/knowledge-job-api.ts#createKnowledgeJobApi`
- `apps/work/src/shared/i18n/locales/en/knowledge.ts`
- `apps/work/tests/knowledge-fail-closed.test.ts`
- `apps/knowledge/lat.md/features.md` (IA reference only; do not import)

## Triggered Read

- If File preview entry is unclear for Documents: Work File preview component under `apps/work/src/renderer`
- If Uploads picker entry is unclear: existing Work file picker / import path used by Knowledge Job createDraft
- If Chat isolation boundary unclear: RM-01 Chat isolation tests / `docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md` AC on Chat
- Otherwise: do not read

## Existing Capability Decision

| Capability | Owner | Decision | Evidence |
|---|---|---|---|
| Mode / Facade / Job / badge | RM-03 Main + KnowledgeView | REUSE | `getMode`, `facade`, `knowledgeJobs`, badge already shipped |
| Host route scope | Knowledge route scope | REUSE | `createKnowledgeRouteScope` + descriptor six pages |
| File preview / picker | Work File Platform | REUSE | Existing File APIs; pages only compose |
| Auth / Chat Run / Settings | Existing Work owners | REUSE | Must remain untouched |
| Source Knowledge features | `apps/knowledge` | REFERENCE_ONLY | IA/behaviour copy source; never runtime import |

## UX Surface Decision

| App ID | UX Role | Surface ID | Decision | Justification |
|---|---|---|---|---|
| apps/work | Knowledge module | knowledge-page-host | EXTEND | Replace status shell with page host inside existing View |
| apps/work | Knowledge module | knowledge-home | NEW | Dashboard IA from features.md Home |
| apps/work | Knowledge module | knowledge-bases | NEW | List/detail IA |
| apps/work | Knowledge module | knowledge-sets | NEW | List/detail + binding/retrieval |
| apps/work | Knowledge module | knowledge-documents | NEW | List/detail + preview |
| apps/work | Knowledge module | knowledge-uploads | EXTEND | Compose existing Job/file surfaces |
| apps/work | Knowledge module | knowledge-chat | NEW | Set-scoped Q&A UI isolated from Work Chat |

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView` | PROD | KEEP | Work Knowledge Renderer | - | renderer_ui | C01 | no |
| C02 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages` | PROD | MODIFY | Work Knowledge Renderer | T1 | renderer_ui | C02 | no |
| C02 | `apps/work/src/shared/knowledge/use-knowledge-facade.ts` | PROD | ADD | none | T1 | isolated_store | C02 | yes |
| C02 | `apps/work/tests/knowledge-page-host.test.ts` | TEST | ADD | none | T1 | isolated_store | C02 | yes |
| C02 | `docs_agent/test-assets/TA-WKUI-HOST.json` | CONFIG | ADD | none | T1 | isolated_store | C02 | yes |
| C02 | `apps/work/src/shared/i18n/locales/en/knowledge.ts` | PROD | MODIFY | Work i18n | T1 | isolated_store | C02 | no |
| C03 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeHomePage.tsx` | PROD | ADD | none | T2 | renderer_ui | C03 | yes |
| C03 | `apps/work/tests/knowledge-home-page.test.ts` | TEST | ADD | none | T2 | isolated_store | C03 | yes |
| C03 | `docs_agent/test-assets/TA-WKUI-HOME.json` | CONFIG | ADD | none | T2 | isolated_store | C03 | yes |
| C04 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage.tsx` | PROD | ADD | none | T3 | renderer_ui | C04 | yes |
| C04 | `apps/work/tests/knowledge-bases-page.test.ts` | TEST | ADD | none | T3 | isolated_store | C04 | yes |
| C04 | `docs_agent/test-assets/TA-WKUI-BASES.json` | CONFIG | ADD | none | T3 | isolated_store | C04 | yes |
| C05 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeSetsPage.tsx` | PROD | ADD | none | T4 | renderer_ui | C05 | yes |
| C05 | `apps/work/tests/knowledge-sets-page.test.ts` | TEST | ADD | none | T4 | isolated_store | C05 | yes |
| C05 | `docs_agent/test-assets/TA-WKUI-SETS.json` | CONFIG | ADD | none | T4 | isolated_store | C05 | yes |
| C06 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage.tsx` | PROD | ADD | none | T5 | renderer_ui | C06 | yes |
| C06 | `apps/work/tests/knowledge-documents-page.test.ts` | TEST | ADD | none | T5 | isolated_store | C06 | yes |
| C06 | `docs_agent/test-assets/TA-WKUI-DOCS.json` | CONFIG | ADD | none | T5 | isolated_store | C06 | yes |
| C07 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeUploadsPage.tsx` | PROD | ADD | none | T6 | renderer_ui | C07 | yes |
| C07 | `apps/work/tests/knowledge-uploads-page.test.ts` | TEST | ADD | none | T6 | isolated_store | C07 | yes |
| C07 | `docs_agent/test-assets/TA-WKUI-UPLOADS.json` | CONFIG | ADD | none | T6 | isolated_store | C07 | yes |
| C08 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx` | PROD | ADD | none | T7 | renderer_ui | C08 | yes |
| C08 | `apps/work/tests/knowledge-chat-page.test.ts` | TEST | ADD | none | T7 | isolated_store | C08 | yes |
| C08 | `docs_agent/test-assets/TA-WKUI-CHAT.json` | CONFIG | ADD | none | T7 | isolated_store | C08 | yes |
| C09 | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts` | PROD | KEEP | Work Knowledge route | - | renderer_ui | C09 | no |
| C09 | `apps/knowledge/src/features` | PROD | REMOVE | Migration boundary | T8 | isolated_store | C09 | no |
| C09 | `apps/work/tests/knowledge-fail-closed.test.ts` | TEST | MODIFY | Existing fail-closed tests | T8 | isolated_store | C09 | no |
| C09 | `docs_agent/test-assets/TA-WK01-CLOSED.json` | CONFIG | MODIFY | Existing test asset | T8 | isolated_store | C09 | no |
| C09 | `docs_agent/evidence/WORK-KNOWLEDGE-UI-01-visual-checklist.md` | DOC | ADD | none | T8 | isolated_store | C09 | yes |
| C09 | `docs_agent/test-assets/TA-WKUI-VISUAL.json` | CONFIG | ADD | none | T8 | isolated_store | C09 | yes |
| C09 | `apps/work/scripts/run-knowledge-ui-01-v08.mjs` | CONFIG | ADD | none | T8 | isolated_store | C09 | yes |
| C09 | `apps/work/scripts/run-knowledge-ui-01-v09.mjs` | CONFIG | ADD | none | T8 | isolated_store | C09 | yes |
| C09 | `apps/work/scripts/run-knowledge-ui-01-suite.mjs` | CONFIG | ADD | none | T8 | isolated_store | C09 | yes |
| C10 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx` | PROD | KEEP | Mock badge chrome | - | renderer_ui | C10 | no |

## Domain Activation Ledger

| Domain | Pack Version | Trigger Changes | Capabilities | Status |
|---|---:|---|---|---|
| backend | 2.2.0 | - | - | NOT_REQUIRED |
| frontend | 2.2.0 | C01,C02,C03,C04,C05,C06,C07,C08,C09,C10 | engineering,preplan,review,verification | REQUIRED |
| ops | 2.2.0 | - | - | NOT_REQUIRED |

## Frontend Quality Ledger

| Change ID | Surface | Framework | Composition | State Ownership | Design System | Accessibility | Interaction States | Performance | Visual Verification |
|---|---|---|---|---|---|---|---|---|---|
| C01 | Knowledge View root keep | REACT | KEEP KnowledgeView / route descriptor | SHARED:Layout owns keep-mounted; route scope owns page id | REUSE Work Layout spacing | Existing view focus | active、hidden | Keep-alive via display:none | STATIC |
| C02 | Knowledge module frame | REACT | EXTEND KnowledgePages into host + module nav; shared facade probe outside screens path | SHARED:route scope owns route，page host owns presentation | REUSE Work spacing、typography、focus、button 和 status patterns | Focusable nav; status text readable | active、hidden、loading、unavailable、empty、error、mock-badge | No polling while View hidden | LIVE_VISUAL |
| C03 | Knowledge Home | REACT | NEW Work-native dashboard sections | LOCAL:页面只拥有展开和快捷交互 | REUSE Work card、empty-state、icon 和 button patterns | Keyboard reachable shortcuts | loading、unavailable、empty、content、error | Facade fetch on active page only | LIVE_VISUAL |
| C04 | Bases list/detail | REACT | NEW Work-native base list/detail composition | LOCAL:search/filter/view/dialog state | REUSE Work inputs、dialog、table/list、badge、toast patterns | Dialog focus trap | loading、unavailable、empty、content、not-found、error、disabled-action | Local filter only | LIVE_VISUAL |
| C05 | Sets list/detail | REACT | NEW Work-native set list/detail composition | LOCAL:search、selection、dialog 和 draft UI state | REUSE Work form、card、badge、dialog 和 status patterns | Disabled reason announced | loading、unavailable、empty、content、not-found、error、disabled-action | No remote submit in provider | LIVE_VISUAL |
| C06 | Documents list/detail | REACT | EXTEND Work file preview；NEW document composition | SHARED:page owns filters，File Platform owns preview data | REUSE Work file icon、badge、preview、table/list 和 empty-state patterns | Preview errors readable | loading、unavailable、empty、content、not-found、preview-error | Lazy preview | LIVE_VISUAL |
| C07 | Uploads | REACT | EXTEND Work file picker + existing Knowledge Job UI | SHARED:Main owns Job，page owns selection/filter/dialog | REUSE Work progress、file card、dialog、toast 和 error patterns | Status not hidden by wrap | selecting、importing、blocked、queued、uploading、processing、completed、failed、cancelled、interrupted | Subscribe Job events; no timer | LIVE_VISUAL |
| C08 | Knowledge Chat | REACT | NEW Knowledge-local composition using Work patterns | LOCAL:selected session、panel visibility 和 composer draft | REUSE Work message typography、textarea、scroll、badge 和 panel patterns | Composer disabled reason | unavailable、no-session、empty-thread、retrieving、generating、failed、citations-empty、composer-disabled | No Work Chat Run | LIVE_VISUAL |
| C09 | Profile/Preferences/source UI | REACT | REMOVE source Profile/Preferences/AppShell/UI primitives | UNCHANGED | REUSE Work Profile Modal/Settings | N/A | N/A | Unchanged | STATIC |
| C10 | Auth/Chat/Settings/badge keep | REACT | REUSE KnowledgeView badge and Work Auth/Settings | SHARED:Main owns mode badge data | REUSE Work badge pattern | Badge remains readable | mock-badge-visible、provider-badge-hidden | Unchanged | STATIC |

## Test Asset Ledger

| Verification ID | Asset ID | Kind | Path / Entrypoint | Required Capabilities | Action | Impact | Reason |
|---|---|---|---|---|---|---|---|
| V01 | TA-WKUI-HOST | TEST | `apps/work/tests/knowledge-page-host.test.ts` | vitest | EXTEND | Host/page switch not covered by status-shell tests | New host |
| V02 | TA-WKUI-HOME | TEST | `apps/work/tests/knowledge-home-page.test.ts` | vitest | EXTEND | Home dashboard absent | New page |
| V03 | TA-WKUI-BASES | TEST | `apps/work/tests/knowledge-bases-page.test.ts` | vitest | EXTEND | Bases IA absent | New page |
| V03 | TA-WKUI-SETS | TEST | `apps/work/tests/knowledge-sets-page.test.ts` | vitest | EXTEND | Sets IA absent | New page |
| V04 | TA-WKUI-DOCS | TEST | `apps/work/tests/knowledge-documents-page.test.ts` | vitest | EXTEND | Documents IA absent | New page |
| V05 | TA-WKUI-UPLOADS | TEST | `apps/work/tests/knowledge-uploads-page.test.ts` | vitest | EXTEND | Uploads UI absent | New page |
| V06 | TA-WKUI-CHAT | TEST | `apps/work/tests/knowledge-chat-page.test.ts` | vitest | EXTEND | Knowledge Chat UI absent | New page |
| V07 | TA-WK01-CLOSED | TEST | `apps/work/tests/knowledge-fail-closed.test.ts` | vitest | EXTEND | Badge/fail-closed regression | Existing suite |
| V08 | TA-WK01-CLOSED | TEST | `apps/work/tests/knowledge-fail-closed.test.ts` | vitest,typescript | EXTEND | Aggregate gate | Guard/typecheck |
| V09 | TA-WKUI-VISUAL | TEST | `docs_agent/evidence/WORK-KNOWLEDGE-UI-01-visual-checklist.md` | manual | EXTEND | Visual/a11y acceptance | DOD-02 |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C02 | MODIFY_EXISTING | `KnowledgePages` is the only page shell; route scope already exists on View | Split host in place; facade probe lives in shared module so frontend activation stays one C02 row |
| C03 | MINIMAL_NEW | Home IA from features.md; Facade list already exists | New page file under Knowledge module |
| C04 | MINIMAL_NEW | Route param `knowledgeBaseId` already in descriptor | Page consumes facade; local UI state only |
| C05 | MINIMAL_NEW | Route param `knowledgeSetId` exists | Same pattern as Bases |
| C06 | MINIMAL_NEW | File Platform preview exists; facade document entities exist | Compose, do not reimplement File owner |
| C07 | MINIMAL_NEW | Job IPC + mock executor already DONE | Uploads page is a consumer only |
| C08 | MINIMAL_NEW | Facade session/citation kinds exist | Knowledge-local chat UI; no Chat Run bridge |
| C09 | REMOVE_ONLY | Descriptor already excludes profile | Assert absence + guard; do not add pages |

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C02 | `apps/work/src/shared/knowledge/use-knowledge-facade.ts` | Shared sanitized facade/mode probe for pages without a second Shell | T1 |
| C02 | `apps/work/tests/knowledge-page-host.test.ts` | Host routing/presentation proofs | T1 |
| C02 | `docs_agent/test-assets/TA-WKUI-HOST.json` | NEW test asset catalog entry | T1 |
| C03 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeHomePage.tsx` | Home dashboard required by PRD | T2 |
| C03 | `apps/work/tests/knowledge-home-page.test.ts` | Home proofs | T2 |
| C03 | `docs_agent/test-assets/TA-WKUI-HOME.json` | NEW test asset catalog entry | T2 |
| C04 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage.tsx` | Bases list/detail required by PRD | T3 |
| C04 | `apps/work/tests/knowledge-bases-page.test.ts` | Bases proofs | T3 |
| C04 | `docs_agent/test-assets/TA-WKUI-BASES.json` | NEW test asset catalog entry | T3 |
| C05 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeSetsPage.tsx` | Sets list/detail required by PRD | T4 |
| C05 | `apps/work/tests/knowledge-sets-page.test.ts` | Sets proofs | T4 |
| C05 | `docs_agent/test-assets/TA-WKUI-SETS.json` | NEW test asset catalog entry | T4 |
| C06 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage.tsx` | Documents list/detail required by PRD | T5 |
| C06 | `apps/work/tests/knowledge-documents-page.test.ts` | Documents proofs | T5 |
| C06 | `docs_agent/test-assets/TA-WKUI-DOCS.json` | NEW test asset catalog entry | T5 |
| C07 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeUploadsPage.tsx` | Uploads UI required by PRD | T6 |
| C07 | `apps/work/tests/knowledge-uploads-page.test.ts` | Uploads proofs | T6 |
| C07 | `docs_agent/test-assets/TA-WKUI-UPLOADS.json` | NEW test asset catalog entry | T6 |
| C08 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx` | Knowledge Chat UI required by PRD | T7 |
| C08 | `apps/work/tests/knowledge-chat-page.test.ts` | Chat proofs | T7 |
| C08 | `docs_agent/test-assets/TA-WKUI-CHAT.json` | NEW test asset catalog entry | T7 |
| C09 | `docs_agent/evidence/WORK-KNOWLEDGE-UI-01-visual-checklist.md` | DOD-02 visual evidence | T8 |
| C09 | `docs_agent/test-assets/TA-WKUI-VISUAL.json` | NEW visual checklist test asset catalog | T8 |
| C09 | `apps/work/scripts/run-knowledge-ui-01-v08.mjs` | Windows-safe V08 aggregate evidence entrypoint | T8 |
| C09 | `apps/work/scripts/run-knowledge-ui-01-v09.mjs` | Windows-safe V09 checklist evidence entrypoint | T8 |
| C09 | `apps/work/scripts/run-knowledge-ui-01-suite.mjs` | Windows-safe V01–V07 suite evidence entrypoint | T8 |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C02 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages`; `apps/work/src/shared/knowledge/use-knowledge-facade.ts`; `apps/work/tests/knowledge-page-host.test.ts`; `docs_agent/test-assets/TA-WKUI-HOST.json`; `apps/work/src/shared/i18n/locales/en/knowledge.ts` | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts#createKnowledgeRouteScope`; `apps/work/src/preload/knowledge-job-api.ts#createKnowledgeJobApi` | - | no |
| T2 | C03 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeHomePage.tsx`; `apps/work/tests/knowledge-home-page.test.ts`; `docs_agent/test-assets/TA-WKUI-HOME.json` | `apps/work/src/shared/knowledge/use-knowledge-facade.ts` | T1 | no |
| T3 | C04 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage.tsx`; `apps/work/tests/knowledge-bases-page.test.ts`; `docs_agent/test-assets/TA-WKUI-BASES.json` | `apps/work/src/shared/knowledge/use-knowledge-facade.ts` | T1 | no |
| T4 | C05 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeSetsPage.tsx`; `apps/work/tests/knowledge-sets-page.test.ts`; `docs_agent/test-assets/TA-WKUI-SETS.json` | `apps/work/src/shared/knowledge/use-knowledge-facade.ts` | T1 | no |
| T5 | C06 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage.tsx`; `apps/work/tests/knowledge-documents-page.test.ts`; `docs_agent/test-assets/TA-WKUI-DOCS.json` | `apps/work/src/shared/knowledge/use-knowledge-facade.ts` | T1 | no |
| T6 | C07 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeUploadsPage.tsx`; `apps/work/tests/knowledge-uploads-page.test.ts`; `docs_agent/test-assets/TA-WKUI-UPLOADS.json` | `apps/work/src/shared/knowledge/knowledge-job-ipc.ts` | T1 | no |
| T7 | C08 | `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx`; `apps/work/tests/knowledge-chat-page.test.ts`; `docs_agent/test-assets/TA-WKUI-CHAT.json` | `apps/work/src/shared/knowledge/use-knowledge-facade.ts` | T1 | no |
| T8 | C09 | `apps/knowledge/src/features`; `apps/work/tests/knowledge-fail-closed.test.ts`; `docs_agent/test-assets/TA-WK01-CLOSED.json`; `docs_agent/evidence/WORK-KNOWLEDGE-UI-01-visual-checklist.md`; `docs_agent/test-assets/TA-WKUI-VISUAL.json`; `apps/work/scripts/run-knowledge-ui-01-v08.mjs`; `apps/work/scripts/run-knowledge-ui-01-v09.mjs`; `apps/work/scripts/run-knowledge-ui-01-suite.mjs` | `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts` | T1, T2, T3, T4, T5, T6, T7 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx` | T1 | Single page host switch; later Todos must not re-fork host |
| `apps/work/src/shared/i18n/locales/en/knowledge.ts` | T1 | Single i18n writer; T1 seeds host and page namespaces |

## Generated Outputs Ledger

None

## Todo T1 — Split KnowledgePages into page host + shared UI state

**Owns Changes**
- C02

**Writes:**
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages`
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`
- `apps/work/tests/knowledge-page-host.test.ts`
- `docs_agent/test-assets/TA-WKUI-HOST.json`
- `apps/work/src/shared/i18n/locales/en/knowledge.ts`

**Reads:**
- `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts#createKnowledgeRouteScope`
- `apps/work/src/preload/knowledge-job-api.ts#createKnowledgeJobApi`

**Depends On:**
- -

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-page-host.test.ts`

**Goal**
Replace the generic status-only shell with a page host that selects Work-native page components, shares mode/capability/facade probing, and wires route-scope params/navigation without a window URL router.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages`
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView`
- `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-scope.ts#createKnowledgeRouteScope`

**Changes**
- Extend `KnowledgePages` to host six page slots using existing route-scope page id and params from the keep-alive View (no second Shell/Router; avoid claiming a second renderer_ui C02 file).
- Add shared `use-knowledge-facade` wrapping `window.hermesAPI.knowledgeJobs.getMode` / `facade` / `getCapability` with injectable overrides for tests.
- Host renders placeholder page slots that T2–T7 fill; until a page Todo lands, host may show structured empty for that page rather than the old single shell.
- Module-local nav affordances for the six pages via route scope push/replace.
- English copy keys for host/nav and page namespaces in `en/knowledge.ts` (single writer hotspot).
- Do not hide Mock/Demo badge; do not import apps/knowledge.

**Stop conditions**
- [ ] Host test covers page switch + params passthrough
- [ ] Provider mode still fail-closed at host level when capability unavailable
- [ ] No TanStack Router / window history writes

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T2 — Add Knowledge Home dashboard

**Owns Changes**
- C03

**Writes:**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeHomePage.tsx`
- `apps/work/tests/knowledge-home-page.test.ts`
- `docs_agent/test-assets/TA-WKUI-HOME.json`

**Reads:**
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Depends On:**
- T1

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-home-page.test.ts`

**Goal**
Home shows overview, recent sets/documents, and shortcuts from Facade in mock mode; provider mode shows structure without fake metrics.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeHomePage.tsx`
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Changes**
- Add `KnowledgeHomePage` consuming facade lists.
- Shortcuts navigate via host `onNavigate` to uploads/chat/bases/sets/documents.
- Provider: unavailable/empty; no fabricated counts.

**Stop conditions**
- [ ] V02 oracles pass
- [ ] No source Home feature import

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T3 — Add Bases list/detail

**Owns Changes**
- C04

**Writes:**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage.tsx`
- `apps/work/tests/knowledge-bases-page.test.ts`
- `docs_agent/test-assets/TA-WKUI-BASES.json`

**Reads:**
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Depends On:**
- T1

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-bases-page.test.ts`

**Goal**
Bases list/detail with local search/filter/card-table, detail/back, and mutation affordances through Facade only.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage.tsx`
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Changes**
- List uses `facade.listEntities({kind:"base"})`; detail uses `knowledgeBaseId` param + `getEntity`.
- Mock: create/edit/delete via `mutateEntity`; provider: empty + disabled with reason.
- Local UI state only for search/filter/view/dialog.

**Stop conditions**
- [ ] Provider mutate disabled
- [ ] Detail/back uses route scope, not URL

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T4 — Add Sets list/detail

**Owns Changes**
- C05

**Writes:**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeSetsPage.tsx`
- `apps/work/tests/knowledge-sets-page.test.ts`
- `docs_agent/test-assets/TA-WKUI-SETS.json`

**Reads:**
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Depends On:**
- T1

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-sets-page.test.ts`

**Goal**
Sets list/detail with binding/weight/retrieval affordances; provider cannot submit.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeSetsPage.tsx`
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Changes**
- Same list/detail pattern for `kind:"set"` and `knowledgeSetId`.
- Draft binding/retrieval UI local until mock mutate; provider submit disabled.

**Stop conditions**
- [ ] Provider submit blocked
- [ ] No remote Knowledge URL calls

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T5 — Add Documents list/detail + preview

**Owns Changes**
- C06

**Writes:**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage.tsx`
- `apps/work/tests/knowledge-documents-page.test.ts`
- `docs_agent/test-assets/TA-WKUI-DOCS.json`

**Reads:**
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Depends On:**
- T1

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-documents-page.test.ts`

**Goal**
Documents filters/detail with version/parse/permission display and Work preview when ManagedFile exists.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage.tsx`
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Changes**
- Facade document entities; permission badge display-only.
- Preview via existing Work File APIs; unavailable/error states when no ManagedFile.
- Do not claim authorization.

**Stop conditions**
- [ ] Permission copy is display-only
- [ ] Preview errors surface without crashing host

**Triggered reads**
- If File preview entry is unclear: Work File preview component under `apps/work/src/renderer`

## Todo T6 — Wire Uploads to Job/file APIs

**Owns Changes**
- C07

**Writes:**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeUploadsPage.tsx`
- `apps/work/tests/knowledge-uploads-page.test.ts`
- `docs_agent/test-assets/TA-WKUI-UPLOADS.json`

**Reads:**
- `apps/work/src/shared/knowledge/knowledge-job-ipc.ts`

**Depends On:**
- T1

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-uploads-page.test.ts`

**Goal**
Uploads page uses Work picker + `knowledgeJobs` snapshots/cancel/retry; mock mode observes Main progress/completed; no Renderer sample timer.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeUploadsPage.tsx`
- `apps/work/src/shared/knowledge/knowledge-job-ipc.ts`

**Changes**
- List snapshots; subscribe `onSnapshotChanged`.
- Mock: picker/createDraft enabled; provider: picker/submit disabled; existing Jobs may show blocked.
- View hide/show must not recreate Jobs.

**Stop conditions**
- [ ] No `setInterval` progress owner in page module
- [ ] Mock completed observable from Main snapshots

**Triggered reads**
- If Uploads picker entry is unclear: existing Work file picker / import path used by Knowledge Job createDraft

## Todo T7 — Add Knowledge Chat composition

**Owns Changes**
- C08

**Writes:**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx`
- `apps/work/tests/knowledge-chat-page.test.ts`
- `docs_agent/test-assets/TA-WKUI-CHAT.json`

**Reads:**
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Depends On:**
- T1

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-chat-page.test.ts`

**Goal**
Session rail, messages, composer, citation panel; mock send via Facade; provider cannot send; never create Work Chat/Skill Run.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx`
- `apps/work/src/shared/knowledge/use-knowledge-facade.ts`

**Changes**
- Facade session/citation kinds; `sessionId` route param.
- Provider composer disabled; mock mutate for send.
- Grep-guard: no imports of Work Chat run/session create APIs in this page.

**Stop conditions**
- [ ] Provider cannot send
- [ ] No Work Chat Session write

**Triggered reads**
- If Chat isolation boundary unclear: RM-01 Chat isolation tests / `docs/work/PRD-WORK-KNOWLEDGE-v1.0-independent-view-integration.md` AC on Chat

## Todo T8 — Enforce Profile/source exclusion + regression guards

**Owns Changes**
- C09

**Writes:**
- `apps/knowledge/src/features`
- `apps/work/tests/knowledge-fail-closed.test.ts`
- `docs_agent/test-assets/TA-WK01-CLOSED.json`
- `docs_agent/evidence/WORK-KNOWLEDGE-UI-01-visual-checklist.md`
- `docs_agent/test-assets/TA-WKUI-VISUAL.json`
- `apps/work/scripts/run-knowledge-ui-01-v08.mjs`
- `apps/work/scripts/run-knowledge-ui-01-v09.mjs`
- `apps/work/scripts/run-knowledge-ui-01-suite.mjs`

**Reads:**
- `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts`

**Depends On:**
- T1, T2, T3, T4, T5, T6, T7

**Parallel Safe:**
- no

**Focused Check:**
- V08 command from Verification Ledger; produce visual checklist evidence for V09

**Goal**
Prove Profile/Preferences unreachable; no cross-root import; RM-01/RM-03 regression and badge persistence; visual checklist for six pages.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Knowledge/knowledge-route-descriptor.ts`
- `apps/work/tests/knowledge-fail-closed.test.ts`

**Changes**
- Extend fail-closed/layout tests for page presence without Profile.
- Confirm `KNOWLEDGE_ROUTE_PAGES` unchanged (no profile/preferences).
- Enforce REMOVE boundary against copying `apps/knowledge/src/features` into Work.
- Write `docs_agent/evidence/WORK-KNOWLEDGE-UI-01-visual-checklist.md`.
- Update TA-WK01-CLOSED and add TA-WKUI-VISUAL as needed.

**Stop conditions**
- [ ] V08 exits 0
- [ ] V09 checklist present covering six pages
- [ ] Mock badge still required when `dataMode=mock`

**Triggered reads**
- None unless a listed trigger becomes true

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07, V08, V09 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts or new IPC/store/lifecycle required | PRD revision request |
