---
name: WORK-KNOWLEDGE-MOCK-01 Mock Mode Foundation
overview: Implement Main-owned explicit Knowledge dataMode, Provider Facade, Work mock adapter, mode-discriminated Job progress/completed, legacy Job migration, File association isolation, and a visible Mock/Demo badge. No six-page feature parity.
todos:
  - id: t1-job-contract-store
    content: "T1 — Extend Job contract and migrate store [C05, C07]"
    status: completed
  - id: t2-mode-controller
    content: "T2 — Add Main Knowledge Mode Controller [C02]"
    status: completed
  - id: t3-facade-mock-adapter
    content: "T3 — Add Provider Facade and Mock Adapter [C03, C04]"
    status: completed
  - id: t4-mock-executor
    content: "T4 — Add Main Mock Job executor [C06]"
    status: completed
  - id: t5-file-association-mode
    content: "T5 — Isolate mock File associations [C08]"
    status: completed
  - id: t6-ipc-badge
    content: "T6 — Wire sanitized IPC and Mock/Demo badge [C09, C10, C12]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.7
plan_id: WORK-KNOWLEDGE-MOCK-01
governance_profile: FULL
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
domain_contract: smc.ges.domain-activation.v2
consumer_profile: generic@2.0.0
domain_policy_digest: sha256:44550d8ceca212b2242d0b407ae3ffd279dcdba8841a7a6b19deb0ec6e44aab6
source_revision: AD-WORK-KNOWLEDGE-v1.1-MOCK-MODE@1.1.0/RM-MOCK-01
grounded_commit: c6a321e16f872d29544b998266c3959011db9e8a
grounding_source: committed_baseline
source_prd: docs/work/PRD-WORK-KNOWLEDGE-v1.1-RM-MOCK-01-mock-mode-foundation.md
source_prd_sha256: sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913
domain_intent_binding_version: 1
domain_intent_digest: sha256:b43a74ae7d6567c6a40a6bf51e700703dbdcc1602b6fbb760e343c16ecd187a5
domain_activation_digest: sha256:ef5b621ffcfc96ca1f12617ac44ee8bc25777880198af64e50a8c9a9620eb9a6
---

# WORK-KNOWLEDGE-MOCK-01 Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-KNOWLEDGE-v1.1-RM-MOCK-01-mock-mode-foundation.md)

## Scope

- In: Main-owned `dataMode=mock|provider` with dual-declaration mock entry; Provider Facade selecting one adapter; Work-owned Mock Adapter/Store; Job envelope `dataMode` / synthetic / progress / `completed`; Main Mock executor; `legacy-unclassified` Job migration; mock File association isolation; visible Mock/Demo badge; sanitized mode/facade IPC.
- Out: six-page feature parity (RM-04); real Remote Adapter (RM-02); Profile/source Shell/Router/Zustand timer; runtime import of `apps/knowledge`; hot mode switch; mock→provider data copy; Chat/Skill Run/Settings changes.
- Production Owner inherited from PRD: Mode Controller / Facade / Mock Adapter are new Main owners; existing Job Coordinator, File Platform, Layout, Auth, and Chat owners KEEP their RM-01 boundaries.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C02 | `apps/work/src/main/knowledge/knowledge-mode-controller.ts` | Absent at `c6a321e` | New Main owner; reuse `loadWorkBuildInfo` candidate-path pattern | `registerKnowledgeJobIpcHandlers` currently hard-codes `isProviderAvailable: () => false` | `feature-mode-store.ts` is Renderer-writable Skill Run mode and must not own Knowledge dataMode | PASS |
| C03 | `apps/work/src/main/knowledge/knowledge-provider-facade.ts` | Absent | New Facade; coordinator `readEntitiesForTests` returns empty arrays | Job IPC getCapability is the only current entity gate | Do not import `apps/knowledge` repository | PASS |
| C04 | `apps/work/src/main/knowledge/knowledge-mock-adapter.ts` | Absent at `c6a321e`. Copy source `apps/knowledge/src/services/knowledge/mock-knowledge-repository.ts` is working-tree only (not in HEAD); content hash in Migration Copy Source Ledger | New Work-owned adapter; copy/adapt fixture behaviour | Source upload timer in `upload-job-store.ts` is forbidden owner | Reuse `getDbConnection` like Job store; never runtime-import source mock. Isolated worktree without the listed copy source is BLOCKED | PASS |
| C05 | `apps/work/src/shared/knowledge/knowledge-job-ipc.ts#KnowledgeJobStatus` | No `completed`, progress, or dataMode; comment forbids completed without a real provider | `KnowledgeJobStatus`, `KnowledgeJobSnapshot`, `HermesKnowledgeJobsAPI` resolve at `c6a321e` | Preload and coordinator import this module | Extend the existing DTO; do not add a second Job channel family | PASS |
| C06 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts#enqueue` | `enqueue` fail-closes to `blocked_provider_unavailable`; never `completed` | `KnowledgeUploadJobCoordinator`, `enqueue`, `recoverOnStart` resolve | `register-knowledge-job-ipc.ts` calls `recoverOnStart` | Add Mock executor beside existing monotonic writer; keep provider path fail-closed | PASS |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-store.ts` | `knowledge_upload_jobs` has no mode column | `ensureTable`, `insertDraftJob`, `rowToSnapshot`, `listNonTerminalJobs` resolve | Coordinator is the only production writer | Additive sqlite columns + `legacy-unclassified`; do not rewrite Chat tables | PASS |
| C08 | `apps/work/src/main/files/file-association-store.ts#insertAssociation` | Association has `knowledgeJobId` but no dataMode | `insertAssociation` and `ALTER TABLE ... knowledge_job_id` pattern resolve | `importOnePath` already looks up the Knowledge Job first | Additive `data_mode` column like `knowledge_job_id` | PASS |
| C09 | `apps/work/src/preload/knowledge-job-api.ts#createKnowledgeJobApi` | Job-only preload; no mode/facade methods | `createKnowledgeJobApi` and `hermesAPI.knowledgeJobs` resolve | `register.ts` registers job handlers only | Copy files-api wrapping; add mode/facade invokes on the same curated surface | PASS |
| C10 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView` | Module root has route + auth, no mode badge | `KnowledgeView` resolves | Layout keep-alive already mounts this root | Add presentation-only badge from Main mode snapshot | PASS |
| C12 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages` | Generic unavailable/empty shell via capability probe | `KnowledgePages`, `resolvePresentation` resolve | Pages call `knowledgeJobs.getCapability` | Keep provider fail-closed; do not render fixture lists when mode is provider | PASS |

## Migration Copy Source Ledger

`apps/knowledge/` is not in `c6a321e` (`git show` fails for these paths). Work MODIFY symbols stay resolved with `git show` at `grounded_commit`. Copy sources below are working-tree-only; T3 must find them on disk with these hashes or the Todo is BLOCKED.

| Path | Role | Content SHA256 | In HEAD |
|---|---|---|---|
| `apps/knowledge/src/services/knowledge/mock-knowledge-repository.ts` | T3 behaviour/fixture copy source (adapt, do not import) | `sha256:bbb1ce9b30a9f57e84a9c78ed1efeb0bc86ec36b91c90843dc454781ab9d17e0` | no |
| `apps/knowledge/src/stores/upload-job-store.ts` | T4 negative example only (Renderer timer owner; do not copy) | `sha256:c06744933a7a6f8be88990227eae922136b33dbb8e30bd5bcaa9a76f34f1e18a` | no |

## Domain Intent Binding

| Domain | Change ID | Intent SHA256 | Source PRD SHA256 |
|---|---|---|---|
| backend | C02 | `sha256:b955952871c7e0f0e9be63a51e445b7c6486a64bc22d90dc1b8dde7aa02d1b05` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| backend | C03 | `sha256:67d84f3cfbe33e4f3864c867ee0a8bf2a43f8ab9f33a67b8aa40d3ab1d0c6dfd` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| backend | C04 | `sha256:dbbf81e1d630e262f247ced1a9a4096cff5623e6f6967dc6e84fab948f79cf8f` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| backend | C05 | `sha256:90d13d4b96fefd54ee15cfceb150673851f4ae8769a150844ba990a6bc371379` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| backend | C06 | `sha256:27dab7b28aa4e077dfba8f15474e4627be0ae993364d2e031183207a172324ea` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| backend | C07 | `sha256:728109aa30d618a1f7072260f80db42e57d2ee34b62ea616b2a596c788ba8286` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| backend | C08 | `sha256:9ad8301811ec5ef228847a569b8ccfb8e0941d9f1d581cd3320896d93f8075e9` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| backend | C09 | `sha256:8ea581f2b2dd30f60944199144e055ae4361fae7e97a7a60b5d2b38d005e2be2` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| frontend | C10 | `sha256:ef1b707aa7055fab7efbff4d48e0e51f29cef8fd7748d6ac90cb702bb7d1ce04` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| frontend | C09 | `sha256:3a60a44868271a608f1df0d7b810dbcffeb98c7b328d0839f49d3031f5fbb887` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| frontend | C12 | `sha256:38267545a41dd30aeb1e33676770c7378622ee709677cd20de607cfca2476cdb` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| ops | C02 | `sha256:591faf6a66daad9034e825930e3badbd23a8ed262ee1c97d710dba80e75ead16` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| ops | C05 | `sha256:6ab88ee3dd5857546d34827c0b340c4077910e3e1bec30b004e31a76a29090e4` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| ops | C07 | `sha256:542130735a6434d9fc30781b96c24fb869e68cb80e7aa856dec9f3b8a971969c` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |
| ops | C06 | `sha256:0380c3a17836586a017edf0cc83bc2a9f777869e1d2e3182735e1f952a785ab3` | `sha256:375d99b9ca8a52a5b54afc3693e13e3e7f3e01dd83ef2bd67ff50c9e8bea5913` |

## Governance Profile

- Profile: `FULL`
- Route rationale: Approved PRD Routing Facts require FULL. This Stage adds Mode Controller and Facade owners, extends the Job public contract, migrates Job sqlite, and isolates File associations by dataMode.
- Escalation triggers checked: `new_owner`, `public_contract_change`, `security_boundary_change`, `schema_migration`, `protocol_change`, `lifecycle_contract_change`, `cross_domain_contract_change` are absorbed by FULL. No PRD revision is required to plan this Stage.
- Risk Facts Snapshot: `{"existing_owner":true,"existing_capability":true,"bounded_writes":true,"deterministic_verification":true,"new_owner":true,"public_contract":true,"security_boundary":true,"schema_migration":true,"protocol_change":true,"external_dependency":false,"lifecycle_change":true,"cross_domain_ownership":true,"live_acceptance":false,"research_intent":false,"governed":true,"retained_production_change":true,"production_write_requested":true,"durable_product_artifact_requested":true,"security_sensitive_touch":true,"existing_lifecycle_wiring":true,"cross_layer_existing_contract":true,"local_ui_acceptance":true,"existing_public_contract_use":true,"existing_external_dependency_use":false,"public_contract_change":true,"security_boundary_change":true,"external_dependency_change":false,"lifecycle_contract_change":true,"ownership_transfer":false,"cross_domain_contract_change":true,"external_live_acceptance":false}`
- Source: approved PRD Routing Facts

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | [C02/C09] Main 是 `dataMode` 唯一写入者；默认 `provider`；缺 `mode=mock` 或 `allowSyntheticData=true` 时拒绝 mock；Renderer 不能覆盖。 | SECURITY | C02, C09 | T2, T6 | V01 | UNIT | yes |
| AC-02 | AC | [C03/C12] 同一 identity partition 同时只激活一个 adapter；provider 失败不得返回 mock entity/answer/completed。 | SECURITY | C03, C12 | T3, T6 | V02, V06 | UNIT | yes |
| AC-03 | AC | [C04] mock 实体/session 按 `{workProfileId, authSubject, tenantScope, dataMode=mock}` 分区；切换身份后旧数据不可见且命令被拒绝。 | SECURITY | C04 | T3 | V02 | UNIT | yes |
| AC-04 | AC | [C05/C06] mock Job snapshot 含 dataMode、synthetic、progress，并可进入 `completed`；进度不依赖 Renderer timer/React 挂载。 | LIFECYCLE | C05, C06 | T1, T4 | V03, V04 | UNIT | yes |
| AC-05 | AC | [C06/C01] 隐藏 Knowledge 30s、Renderer reload、应用重启后，非终态 mock Job 由 Main 恢复或单调 interrupted；不存在无 Owner 的 uploading/processing。 | LIFECYCLE | C06, C01 | T4 | V04 | UNIT | yes |
| AC-06 | AC | [C07] 无 mode 的旧 Job 为 `legacy-unclassified`，不显示为 mock 活动态；迁移失败时旧库只读且不能创建新 mock Job。 | LIFECYCLE | C07 | T1 | V03 | UNIT | yes |
| AC-07 | AC | [C08] mock association 不能被 Chat/Skill/provider 消费；清理 mock 引用不删除仍被其他消费者引用的 ManagedFile。 | CONTRACT | C08 | T5 | V05 | INTEGRATION | yes |
| AC-08 | AC | [C10] `dataMode=mock` 时 Knowledge 模块持续显示 Mock/Demo 标识；`provider` 时不显示该标识也不出现 mock 列表。 | BEHAVIOR | C10 | T6 | V06 | UNIT | yes |
| AC-09 | AC | [C02] 启动诊断包含 effective mode、channel 与配置来源，不含 token 或用户内容。 | OPERATIONS | C02 | T2 | V01 | UNIT | yes |
| AC-10 | AC | [C01/C11] 不交付六个页面的完整 feature layout；不出现 Profile/source Shell；不跨根 import `apps/knowledge`；Chat/Skill/Settings 不变。 | SCOPE | C01, C11 | T6 | V06, V07 | DIFF_SCOPE | yes |
| AC-11 | AC | [C04/C12] Work production 不以 source `MockKnowledgeRepository` 或 Zustand upload store 为 Owner。 | NEGATIVE | C04, C12 | T3, T6 | V02, V07 | UNIT | yes |
| AC-12 | AC | [C05/C09] Job/facade IPC 不暴露绝对路径、token 或 provider 原始错误。 | SECURITY | C05, C09 | T1, T6 | V01, V04 | UNIT | yes |
| AC-13 | AC | [C03/C04] `dataMode=mock` 时 Facade 的 sanitized IPC 可 list/read/mutate synthetic bases/sets/documents/sessions/citations，并返回 display-only permission；`provider` 时这些调用 unavailable/empty。mock permission 不得授权 File、Chat、Settings 或 provider 操作。本 AC 不要求六个页面 layout。 | CONTRACT | C03, C04 | T3 | V02 | UNIT | yes |
| DOD-01 | DOD | AC-01 至 AC-13 的 blocking claims 在当前 implementation commit 上有证据。 | EVIDENCE | C02, C05, C06 | T1, T2, T4, T6 | V07 | INTEGRATION | yes |
| DOD-02 | DOD | Job 合同、legacy 迁移、mode 启动校验、隔离与 badge 的 targeted tests 通过；Work typecheck、RM-01 regression、no-reference-imports 与 i18n English-only 通过。 | EVIDENCE | C05, C07, C10 | T1, T6 | V07 | INTEGRATION | yes |
| DOD-03 | DOD | 不宣称六个页面 feature parity 完成。 | SCOPE | C12 | T6 | V06 | UNIT | yes |
| DOD-04 | DOD | 独立 PRD Review 为 PASS，且 Architecture Decision 保持 APPROVED。 | EVIDENCE | C02 | T2 | V08 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Mode start | AC-01, AC-09 | Main process start | validating dual declaration | Mode Controller writes immutable effective mode | Missing/illegal mock declaration refuses mock and stays provider or aborts mock start | V01 |
| Facade adapter select | AC-02, AC-13 | First Knowledge entity command after mode is set | exactly one adapter live | Facade | Cross-mode or dual-adapter writes rejected | V02 |
| Mock Job progress | AC-04, AC-05 | Mock-mode draft enqueue | queued / uploading / processing | Main Mock executor | cancel/fail/interrupted; provider mode never mints completed | V04 |
| Legacy Job migrate | AC-06 | Store open / recoverOnStart | legacy-unclassified or interrupted | Job store migration | Failed migration freezes old DB read-only and blocks new mock Jobs | V03 |
| Mock file association | AC-07 | Knowledge import in mock mode | associated ManagedFile | File Platform insert with dataMode=mock | unlink mock consumer without deleting Chat/Skill refs | V05 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Mode snapshot | AC-01, AC-09, AC-12 | Mode Controller | sanitized IPC on knowledge job/mode channels | KnowledgeView badge and Facade | `dataMode`, `allowSyntheticData` effective flag, channel/source; no token | Main handler | Illegal mock start returns stable sanitized error | process lifetime; mode is immutable | V01 |
| Facade entity command | AC-02, AC-03, AC-13 | Facade + Mock Adapter | sanitized entity DTO in `knowledge-job-ipc.ts` (extended) | Tests this Stage; pages in RM-04 | partition + dataMode; entity id; display-only permission | Facade | provider mode unavailable; cross-partition denied | entity id + partition + dataMode | V02 |
| Job snapshot | AC-04, AC-06, AC-12 | Coordinator + store | existing `knowledge-job:*` plus new fields | Uploads consumers / tests | jobId, dataMode, synthetic, progress, status including completed | Coordinator | unknown mode rejected; terminal never rewinds | jobId + attempt + commandId | V03, V04 |
| Mock file association | AC-07 | `importOnePath` | existing `files:` IPC; association `dataMode` | File association store | knowledgeJobId, dataMode=mock, no sessionId | File Platform + Job lookup | unknown Job / wrong mode / Chat consumer mix rejected | fileId + knowledgeJobId + role + dataMode | V05 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | Default provider; mock only after dual declaration; Renderer cannot set mode | yes | RM-01 capability fail-closed | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | New Mode Controller | V01 |
| CLM-02 | AC-02 | Provider failure never returns mock entity/completed | yes | Coordinator `isProviderAvailable: () => false` | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Facade added | V02, V06 |
| CLM-03 | AC-03 | Mock store is identity+dataMode partitioned | yes | Source mock is not Work owner | NOT_TESTED | NEW_EVIDENCE | New Mock Store | V02 |
| CLM-04 | AC-04 | Mock Jobs expose progress/completed from Main | yes | Job IPC has no completed | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Contract extend | V03, V04 |
| CLM-05 | AC-05 | Hide/reload/restart recovers mock Jobs without Renderer timer | yes | recoverOnStart exists but no mock executor | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | Mock executor | V04 |
| CLM-06 | AC-06 | Legacy rows are unclassified, not mock-active | yes | sqlite has no mode column | NOT_TESTED | NEW_EVIDENCE | Schema upgrade | V03 |
| CLM-07 | AC-07 | Mock unlink does not delete Chat-referenced files | yes | RM-01 association refcount | PROVEN_BUT_AFFECTED | TARGETED_RERUN | New dataMode column | V05 |
| CLM-08 | AC-08 | Mock badge visible only in mock mode | yes | KnowledgeView has no badge | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | New chrome | V06 |
| CLM-09 | AC-09 | Diagnostics name mode/channel/source without secrets | yes | No mode diagnostics | NOT_TESTED | NEW_EVIDENCE | Mode Controller | V01 |
| CLM-10 | AC-10 | No page parity, Profile, or `apps/knowledge` import | yes | GES forbidden_roots; generic pages | PROVEN_FRESH | NEW_EVIDENCE | New files must stay in apps/work | V06, V07 |
| CLM-11 | AC-11 | Source repository/timer is not Work owner; permission display-only | yes | Source mock repository | FAILED_RESIDUAL_GAP | NEW_EVIDENCE | Work-owned adapter | V02, V07 |
| CLM-12 | AC-12 | IPC omits path/token/raw errors | yes | Existing sanitizeIpcError | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | New facade fields | V01, V04 |
| CLM-13 | AC-13 | Facade IPC covers synthetic entity families in mock mode | yes | No Work entity owner | NOT_TESTED | NEW_EVIDENCE | New Facade | V02 |
| CLM-14 | DOD-01 | All blocking ACs have current evidence | yes | Stage PRD ledger | UNKNOWN | NEW_EVIDENCE | Implementation absent | V07 |
| CLM-15 | DOD-02 | typecheck, guard, targeted tests pass | yes | RM-01 tests | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | New files | V07 |
| CLM-16 | DOD-03 | Six-page parity is not claimed | yes | KnowledgePages shell | PROVEN_FRESH | NEW_EVIDENCE | Badge-only UI | V06 |
| CLM-17 | DOD-04 | PRD and AD remain APPROVED | yes | PRD APPROVED 2026-09-15; AD v1.1 APPROVED | PASS | REUSE_EVIDENCE | - | V08 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|
| SCN-01 | CLM-01, CLM-02, CLM-03, CLM-04, CLM-05, CLM-06, CLM-07, CLM-08, CLM-09, CLM-10, CLM-11, CLM-12, CLM-13, CLM-14, CLM-15, CLM-16, CLM-17 | V01, V02, V03, V04, V05, V06, V07, V08 | local vitest plus apps/work typecheck and guard | vitest, typescript, node | Work package dependencies installed | run Verification Ledger LOCAL commands | all listed commands exit 0 | ENV-01 |

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|
| ENV-01 | - | npm --prefix apps/work test --version | - | LOCAL_WORKTREE | - |

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01, CLM-09, CLM-12 | UNIT | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-mode-controller.test.ts` | Default mode is provider; mock start without both declarations is rejected; Renderer-equivalent inputs cannot change mode; diagnostics omit token/content | Fail if Preference/URL/localStorage can set mode, if the test file is missing, or if the suite is empty | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V02 | CLM-02, CLM-03, CLM-11, CLM-13 | UNIT | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-provider-facade.test.ts` | Mock mode lists/mutates synthetic bases/sets/documents/sessions/citations; provider mode is unavailable/empty; cross-partition denied; permission is display-only; provider failure does not return mock | Fail if source `MockKnowledgeRepository` is imported, if the test file is missing, or if the suite is empty | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V03 | CLM-04, CLM-06 | UNIT | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-upload-job-store.test.ts` | New rows persist dataMode; missing-mode rows become `legacy-unclassified`; failed migration leaves old DB read-only and blocks new mock Jobs | Fail if a legacy row is rewritten as mock completed | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V04 | CLM-04, CLM-05, CLM-12 | UNIT | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-upload-job-coordinator.test.ts` | Mock executor advances progress to completed without a timer; recoverOnStart restores non-terminal mock Jobs; provider path still never fakes completed; snapshots omit path/token | Fail if `file-job:*` is used or if RM-01 fail-closed provider tests regress | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V05 | CLM-07 | INTEGRATION | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false src/main/files/file-import-knowledge-job.test.ts src/main/files/file-association-store.test.ts` | Mock association stores dataMode=mock; Chat association cleanup still protects shared ManagedFile; Chat `sessionId` path unchanged | Fail if mock unlink deletes a Chat-referenced file | LOCAL_TRANSIENT | local | TARGETED_RERUN | yes |
| V06 | CLM-02, CLM-08, CLM-10, CLM-16 | UNIT | LOCAL | `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-fail-closed.test.ts` | Provider mode keeps unavailable/empty pages and hides badge; mock mode shows badge; pages are still the generic shell (no six-page parity) | Fail if fixture lists appear in provider mode or if badge is missing in mock mode | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V07 | CLM-10, CLM-11, CLM-14, CLM-15 | INTEGRATION | LOCAL | `npm --prefix apps/work run typecheck && npm --prefix apps/work run guard && npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-mode-controller.test.ts src/main/knowledge/knowledge-provider-facade.test.ts src/main/knowledge/knowledge-upload-job-store.test.ts src/main/knowledge/knowledge-upload-job-coordinator.test.ts src/main/files/file-import-knowledge-job.test.ts tests/knowledge-fail-closed.test.ts tests/layout-knowledge-view.test.ts tests/knowledge-route-scope.test.ts` | typecheck and guard pass; no `apps/knowledge` runtime import; targeted suites pass | Fail if a listed test is missing or empty | LOCAL_TRANSIENT | local | NEW_EVIDENCE | yes |
| V08 | CLM-17 | CONTRACT_RELEASE | LOCAL | `git grep -n "status: APPROVED" -- docs/work/PRD-WORK-KNOWLEDGE-v1.1-RM-MOCK-01-mock-mode-foundation.md docs/work/AD-WORK-KNOWLEDGE-v1.1-mock-mode.md` | PRD and AD remain APPROVED | Fail if either status is not APPROVED | LOCAL_TRANSIENT | local | REUSE_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/shared/knowledge/knowledge-job-ipc.ts#KnowledgeJobStatus`
- `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`
- `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts#enqueue`
- `apps/work/src/main/knowledge/register-knowledge-job-ipc.ts`
- `apps/work/src/preload/knowledge-job-api.ts#createKnowledgeJobApi`
- `apps/work/src/preload/index.ts`
- `apps/work/src/main/ipc/register.ts#registerIpcHandlers`
- `apps/work/src/main/build-info.ts#candidatePaths`
- `apps/work/src/main/files/file-association-store.ts#insertAssociation`
- `apps/work/src/main/files/file-import-service.ts#importOnePath`
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView`
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages`
- `apps/work/src/shared/i18n/locales/en/knowledge.ts`
- `apps/knowledge/src/services/knowledge/mock-knowledge-repository.ts`
- `apps/knowledge/src/stores/upload-job-store.ts`

## Triggered Read

- If packaged config already exists beside `work-build-info.json`: remainder of `apps/work/src/main/build-info.ts`
- If sqlite ALTER helpers already exist beside `knowledge_job_id`: remainder of `file-association-store.ts`
- Otherwise: do not read

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/renderer/src/screens/Layout/Layout.tsx#View` | PROD | KEEP | Work Renderer Layout | - | renderer_ui | C01 | no |
| C02 | `apps/work/src/main/knowledge/knowledge-mode-controller.ts` | PROD | ADD | none | T2 | backend rollback | C02 | yes |
| C02 | `apps/work/src/main/knowledge/knowledge-mode-controller.test.ts` | TEST | ADD | none | T2 | isolated_store | C02 | yes |
| C02 | `docs_agent/test-assets/TA-WK11-MODE.json` | CONFIG | ADD | none | T2 | isolated_store | C02 | yes |
| C03 | `apps/work/src/main/knowledge/knowledge-provider-facade.ts` | PROD | ADD | none | T3 | backend | C03 | yes |
| C03 | `apps/work/src/main/knowledge/knowledge-provider-facade.test.ts` | TEST | ADD | none | T3 | isolated_store | C03 | yes |
| C03 | `docs_agent/test-assets/TA-WK11-FACADE.json` | CONFIG | ADD | none | T3 | isolated_store | C03 | yes |
| C04 | `apps/work/src/main/knowledge/knowledge-mock-adapter.ts` | PROD | ADD | none | T3 | backend | C04 | yes |
| C04 | `apps/work/src/main/knowledge/knowledge-mock-store.ts` | PROD | ADD | none | T3 | isolated_store | C04 | yes |
| C05 | `apps/work/src/shared/knowledge/knowledge-job-ipc.ts#KnowledgeJobStatus` | PROD | MODIFY | Shared Knowledge Job contract | T1 | backend rollback | C05 | no |
| C06 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts#enqueue` | PROD | MODIFY | Main Knowledge Upload Job Coordinator | T4 | backend rollback | C06 | no |
| C06 | `apps/work/src/main/knowledge/register-knowledge-job-ipc.ts` | PROD | MODIFY | Main Knowledge Job IPC registrar | T4 | isolated_store | C06 | no |
| C06 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts` | TEST | MODIFY | Main Job tests | T4 | isolated_store | C06 | no |
| C06 | `docs_agent/test-assets/TA-WK01-JOB.json` | CONFIG | MODIFY | Existing test asset | T4 | isolated_store | C06 | no |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-store.ts` | PROD | MODIFY | Main Knowledge Job store | T1 | backend rollback | C07 | no |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-store.test.ts` | TEST | ADD | none | T1 | isolated_store | C07 | yes |
| C07 | `docs_agent/test-assets/TA-WK11-STORE.json` | CONFIG | ADD | none | T1 | isolated_store | C07 | yes |
| C08 | `apps/work/src/shared/files/file-association.ts#FileAssociation` | PROD | MODIFY | Work File Platform | T5 | backend | C08 | no |
| C08 | `apps/work/src/main/files/file-association-store.ts#insertAssociation` | PROD | MODIFY | Work File Platform | T5 | isolated_store | C08 | no |
| C08 | `apps/work/src/main/files/file-import-service.ts#importOnePath` | PROD | MODIFY | Work File Platform | T5 | isolated_store | C08 | no |
| C08 | `apps/work/src/main/files/file-import-knowledge-job.test.ts` | TEST | MODIFY | Existing Knowledge import tests | T5 | isolated_store | C08 | no |
| C08 | `docs_agent/test-assets/TA-WK01-IMPORT.json` | CONFIG | MODIFY | Existing test asset | T5 | isolated_store | C08 | no |
| C09 | `apps/work/src/preload/knowledge-job-api.ts#createKnowledgeJobApi` | PROD | MODIFY | Curated Knowledge Job preload | T6 | backend renderer_ui | C09 | no |
| C09 | `apps/work/src/preload/index.ts` | PROD | MODIFY | Work Preload barrel | T6 | isolated_store | C09 | no |
| C09 | `apps/work/src/preload/index.d.ts` | PROD | MODIFY | Work Preload types | T6 | isolated_store | C09 | no |
| C09 | `apps/work/src/main/ipc/register.ts#registerIpcHandlers` | PROD | MODIFY | Work Main IPC registry | T6 | isolated_store | C09 | no |
| C09 | `apps/work/src/main/knowledge/register-knowledge-mode-ipc.ts` | PROD | ADD | none | T6 | isolated_store | C09 | yes |
| C10 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView` | PROD | MODIFY | Work Knowledge Renderer | T6 | renderer_ui | C10 | no |
| C10 | `apps/work/src/shared/i18n/locales/en/knowledge.ts` | PROD | MODIFY | Work source-locale catalog | T6 | isolated_store | C10 | no |
| C11 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | PROD | KEEP | Existing Work Chat/Skill isolation | - | isolated_store | C11 | no |
| C12 | `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages` | PROD | MODIFY | Work Knowledge pages | T6 | renderer_ui | C12 | no |
| C12 | `apps/work/tests/knowledge-fail-closed.test.ts` | TEST | MODIFY | Existing fail-closed tests | T6 | isolated_store | C12 | no |
| C12 | `docs_agent/test-assets/TA-WK01-CLOSED.json` | CONFIG | MODIFY | Existing test asset | T6 | isolated_store | C12 | no |

## Domain Activation Ledger

| Domain | Pack Version | Trigger Changes | Capabilities | Status |
|---|---:|---|---|---|
| backend | 2.2.0 | C02,C03,C04,C05,C06,C07,C08,C09 | engineering,preplan,review,verification | REQUIRED |
| frontend | 2.2.0 | C01,C09,C10,C12 | engineering,preplan,review,verification | REQUIRED |
| ops | 2.2.0 | C02,C05,C06,C07 | engineering,preplan,review,verification | REQUIRED |

## Frontend Quality Ledger

| Change ID | Surface | Framework | Composition | State Ownership | Design System | Accessibility | Interaction States | Performance | Visual Verification |
|---|---|---|---|---|---|---|---|---|---|
| C01 | Work Layout Knowledge host | REACT | KEEP existing keep-alive Knowledge pane | SHARED:Work owns active/visited | REUSE Work tokens | Existing view focus | first-load、active、hidden、restore | Keep-alive via display:none | INTERACTION |
| C09 | Knowledge capability/mode read | REACT | EXTEND existing capability consumer | SHARED:Main owns snapshot | REUSE Work empty-state/status | Mode/capability status is text, not a trap | loading、provider-unavailable、mock-ready | No extra polling while hidden | INTERACTION |
| C10 | Knowledge module chrome badge | REACT | NEW Work-native Mock/Demo badge；EXTEND KnowledgeView | SHARED:Main owns mode，Renderer owns presentation | REUSE Work status/badge/focus primitives | Badge is persistently visible and not the only focus stop | mock-visible、provider-hidden、mode-unavailable | No Renderer timer | LIVE_VISUAL |
| C12 | Forbidden fallback UI | REACT | REMOVE silent mock success copy | UNCHANGED | REUSE Work error primitives | Unavailable copy remains readable | provider-unavailable | Unchanged shell | INTERACTION |

## Backend Quality Ledger

| Change ID | Owner | Contract | Data/Transaction | Auth | Idempotency/Concurrency | Failure Semantics | Observability | Verification |
|---|---|---|---|---|---|---|---|---|
| C02 | Main Knowledge Mode Controller | COMPATIBLE_EXTEND | READ_ONLY | NEW_BOUNDARY | REQUIRED | 缺双声明或非法 mode 拒绝 mock 启动；运行中不可变。 | 记录 effective mode、channel、配置来源；禁止 token/内容。 | UNIT |
| C03 | Main Provider Facade | COMPATIBLE_EXTEND | WRITE | NEW_BOUNDARY | REQUIRED | 同时只激活一个 adapter；跨 mode 读写被拒绝。 | 记录 adapter 选择与拒绝原因，不记录实体正文。 | UNIT |
| C04 | Mock Adapter + Store | COMPATIBLE_EXTEND | MIGRATION | MODIFY | REQUIRED | 分区键含 dataMode=mock；登出切断可见性，不自动 purge。 | 脱敏 mutation 计数；禁止绝对路径。 | UNIT |
| C05 | Shared Job contract + Coordinator | COMPATIBLE_EXTEND | WRITE | MODIFY | REQUIRED | 未知 mode 命令拒绝；终态不回退。 | snapshot 含 mode/synthetic/progress。 | UNIT |
| C06 | Main Mock executor | COMPATIBLE_EXTEND | WRITE | UNCHANGED | REQUIRED | View 卸载不停止 Job；重启从 Main 恢复。 | 阶段、attempt、duration；无远端 receipt。 | UNIT |
| C07 | Main Job store | COMPATIBLE_EXTEND | MIGRATION | UNCHANGED | REQUIRED | 迁移失败保持旧库只读，禁止新 mock Job。 | 记录迁移结果与 blocked 计数。 | UNIT |
| C08 | Work File Platform | COMPATIBLE_EXTEND | TRANSACTIONAL | MODIFY | REQUIRED | mock unlink 不删除仍被 Chat/Skill 引用的 ManagedFile。 | consumer kind、mode、refcount 决策，无绝对路径。 | UNIT |
| C09 | Preload + Main handler | COMPATIBLE_EXTEND | WRITE | NEW_BOUNDARY | REQUIRED | 非法/跨身份/跨 mode 返回稳定安全错误。 | 命令结果与授权拒绝可关联 Job/entity id。 | UNIT |

## Ops Quality Ledger

| Change ID | Deployment Impact | Compatibility | Environment/Config | Health | Migration Order | Rollback | Verification |
|---|---|---|---|---|---|---|---|
| C02 | RESTART | BACKWARD_COMPATIBLE | 新增 Main 启动/release manifest 的 mode 与 `allowSyntheticData`；缺省 provider | 启动日志必须能辨认 effective mode | 先校验配置再打开 Facade/Job | 去掉 mock 声明即回 provider fail-closed | SMOKE |
| C05 | RESTART | BACKWARD_COMPATIBLE | Preload/Main 随应用加载；无新服务端口 | 旧客户端不得因未知字段崩溃 | 先扩合同与 store，再启用 Mock executor | 卸载新字段写入，旧 Job 只读 | SMOKE |
| C07 | RESTART | WINDOW_REQUIRED | 无拓扑变化；userData sqlite 原地升级 | 迁移失败后禁止新 mock Job | 先标记 legacy-unclassified，再写新 namespace | 失败保持旧库可恢复只读 | SMOKE |
| C06 | RESTART | BACKWARD_COMPATIBLE | 无远端 Knowledge URL | 非终态 mock Job 必须有 Main owner | executor 在合同/store 就绪后启用 | 停用 executor 后 mock Job interrupted | SMOKE |

## Test Asset Ledger

| Verification ID | Asset ID | Kind | Path / Entrypoint | Required Capabilities | Action | Impact | Reason |
|---|---|---|---|---|---|---|---|
| V01 | TA-WK11-MODE | TEST | `apps/work/src/main/knowledge/knowledge-mode-controller.test.ts` | vitest | NEW | Mode start/reject paths have no existing test | New Main owner |
| V02 | TA-WK11-FACADE | TEST | `apps/work/src/main/knowledge/knowledge-provider-facade.test.ts` | vitest | NEW | Entity families are not covered by Job tests | New Facade/adapter |
| V03 | TA-WK11-STORE | TEST | `apps/work/src/main/knowledge/knowledge-upload-job-store.test.ts` | vitest | NEW | Legacy migration is store-level, not coordinator-only | Schema upgrade |
| V04 | TA-WK01-JOB | TEST | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts` | vitest | EXTEND | Reuse RM-01 Job proofs and add mock executor/completed | Same owner file |
| V05 | TA-WK01-IMPORT | TEST | `apps/work/src/main/files/file-import-knowledge-job.test.ts` | vitest | EXTEND | Reuse RM-01 import proofs and add dataMode isolation | Same owner file |
| V06 | TA-WK01-CLOSED | TEST | `apps/work/tests/knowledge-fail-closed.test.ts` | vitest | EXTEND | Reuse fail-closed page proofs and add badge/mode assertions | Same owner file |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C02 | MINIMAL_NEW | `register-knowledge-job-ipc.ts` hard-codes provider=false; `build-info.ts#candidatePaths` already locates packaged JSON; `feature-mode-store.ts` is user-writable Skill Run mode | A new Main-only controller is the approved owner; reusing Skill Run mode would let Renderer write Knowledge dataMode |
| C03 | MINIMAL_NEW | `readEntitiesForTests` is an empty fail-closed helper, not an entity API | Facade is the approved unique access point |
| C04 | MINIMAL_NEW | Source `mock-knowledge-repository.ts` is the behaviour source, not a Work owner; Job store already uses `getDbConnection` | Copy/adapt fixtures into Work sqlite; do not import or symlink `apps/knowledge` |
| C05 | MODIFY_EXISTING | `knowledge-job-ipc.ts#KnowledgeJobStatus` is the shared envelope | One DTO owner avoids a second Job protocol |
| C06 | MODIFY_EXISTING | `KnowledgeUploadJobCoordinator#enqueue` is the monotonic Job writer | Mock executor belongs in the existing Job owner |
| C07 | MODIFY_EXISTING | `ensureTable` already owns `knowledge_upload_jobs` | Additive columns + legacy marker beat a second database |
| C08 | MODIFY_EXISTING | `insertAssociation` already added `knowledge_job_id` via ALTER | Same additive-column pattern for dataMode |
| C09 | MODIFY_EXISTING | `createKnowledgeJobApi` is the curated preload | Extend that factory; do not add a second `hermesAPI` root |
| C10 | MODIFY_EXISTING | `KnowledgeView` is the keep-alive module chrome | Badge is presentation of Main mode, not a new shell |
| C12 | REMOVE_ONLY | `KnowledgePages#resolvePresentation` currently maps missing provider to unavailable | Keep that mapping for provider mode; do not add fixture success copy |

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C02 | `apps/work/src/main/knowledge/knowledge-mode-controller.ts` | Approved new Mode Controller must not live in Skill Run or Renderer stores | T2 Main owner |
| C02 | `apps/work/src/main/knowledge/knowledge-mode-controller.test.ts` | AC-01/AC-09 have no existing test file | T2 |
| C02 | `docs_agent/test-assets/TA-WK11-MODE.json` | NEW test asset requires a catalog manifest | T2 |
| C03 | `apps/work/src/main/knowledge/knowledge-provider-facade.ts` | Approved new Facade owner | T3 |
| C03 | `apps/work/src/main/knowledge/knowledge-provider-facade.test.ts` | AC-13 entity-family proof | T3 |
| C03 | `docs_agent/test-assets/TA-WK11-FACADE.json` | NEW test asset catalog | T3 |
| C04 | `apps/work/src/main/knowledge/knowledge-mock-adapter.ts` | Work-owned adapter cannot be the source repository | T3 |
| C04 | `apps/work/src/main/knowledge/knowledge-mock-store.ts` | Mock persistence must not share un-moded Job primary keys | T3 |
| C07 | `apps/work/src/main/knowledge/knowledge-upload-job-store.test.ts` | Migration proofs would overload coordinator tests | T1 |
| C07 | `docs_agent/test-assets/TA-WK11-STORE.json` | NEW test asset catalog | T1 |
| C09 | `apps/work/src/main/knowledge/register-knowledge-mode-ipc.ts` | Keep `registerIpcHandlers` a thin registry | T6 |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C05, C07 | `apps/work/src/shared/knowledge/knowledge-job-ipc.ts#KnowledgeJobStatus`; `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`; `apps/work/src/main/knowledge/knowledge-upload-job-store.test.ts`; `docs_agent/test-assets/TA-WK11-STORE.json` | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | - | no |
| T2 | C02 | `apps/work/src/main/knowledge/knowledge-mode-controller.ts`; `apps/work/src/main/knowledge/knowledge-mode-controller.test.ts`; `docs_agent/test-assets/TA-WK11-MODE.json` | `apps/work/src/main/build-info.ts`; `apps/work/src/shared/knowledge/knowledge-job-ipc.ts#KnowledgeJobStatus` | T1 | no |
| T3 | C03, C04 | `apps/work/src/main/knowledge/knowledge-provider-facade.ts`; `apps/work/src/main/knowledge/knowledge-provider-facade.test.ts`; `docs_agent/test-assets/TA-WK11-FACADE.json`; `apps/work/src/main/knowledge/knowledge-mock-adapter.ts`; `apps/work/src/main/knowledge/knowledge-mock-store.ts` | `apps/knowledge/src/services/knowledge/mock-knowledge-repository.ts`; `apps/work/src/main/knowledge/knowledge-mode-controller.ts` | T1, T2 | no |
| T4 | C06 | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts#enqueue`; `apps/work/src/main/knowledge/register-knowledge-job-ipc.ts`; `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts`; `docs_agent/test-assets/TA-WK01-JOB.json` | `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`; `apps/work/src/main/knowledge/knowledge-mode-controller.ts` | T1, T2 | no |
| T5 | C08 | `apps/work/src/shared/files/file-association.ts#FileAssociation`; `apps/work/src/main/files/file-association-store.ts#insertAssociation`; `apps/work/src/main/files/file-import-service.ts#importOnePath`; `apps/work/src/main/files/file-import-knowledge-job.test.ts`; `docs_agent/test-assets/TA-WK01-IMPORT.json` | `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts` | T1, T4 | no |
| T6 | C09, C10, C12 | `apps/work/src/preload/knowledge-job-api.ts#createKnowledgeJobApi`; `apps/work/src/preload/index.ts`; `apps/work/src/preload/index.d.ts`; `apps/work/src/main/ipc/register.ts#registerIpcHandlers`; `apps/work/src/main/knowledge/register-knowledge-mode-ipc.ts`; `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView`; `apps/work/src/shared/i18n/locales/en/knowledge.ts`; `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages`; `apps/work/tests/knowledge-fail-closed.test.ts`; `docs_agent/test-assets/TA-WK01-CLOSED.json` | `apps/work/src/main/knowledge/knowledge-mode-controller.ts`; `apps/work/src/main/knowledge/knowledge-provider-facade.ts` | T2, T3, T4 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/preload/index.ts` | T6 | Only barrel that may expose mode/facade beside `knowledgeJobs` |
| `apps/work/src/main/ipc/register.ts` | T6 | Existing IPC registry; T6 adds one call to the mode/facade registrar |
| `apps/work/src/shared/knowledge/knowledge-job-ipc.ts` | T1 | Single shared DTO owner for Job, mode snapshot, and facade envelopes |

## Generated Outputs Ledger

None

## Todo T1 — Extend Job contract and migrate store

**Owns Changes**
- C05
- C07

**Writes:**
- `apps/work/src/shared/knowledge/knowledge-job-ipc.ts#KnowledgeJobStatus`
- `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`
- `apps/work/src/main/knowledge/knowledge-upload-job-store.test.ts`
- `docs_agent/test-assets/TA-WK11-STORE.json`

**Reads:**
- `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts`

**Depends On:**
- -

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-upload-job-store.test.ts`

**Goal**
Extend the shared Knowledge Job envelope with `dataMode`, synthetic, progress, optional file summary, and `completed`, and migrate `knowledge_upload_jobs` so legacy rows become `legacy-unclassified`.

**Immediate anchors**
- `apps/work/src/shared/knowledge/knowledge-job-ipc.ts#KnowledgeJobStatus`
- `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`

**Changes**
- Add `completed` to `KnowledgeJobStatus` and include it in terminal statuses only when a mode-qualified executor writes it.
- Add sanitized snapshot fields: `dataMode`, `synthetic`, `progress` (0–100 or staged enum), optional file summary without absolute paths.
- Add mode/facade snapshot and command types to the same DTO module so T6 does not invent a second contract file.
- ALTER/ensure `knowledge_upload_jobs` with mode and progress columns. Existing rows without mode become `legacy-unclassified` and must not display as mock uploading/processing/completed.
- If migration fails, keep the old table read-only and refuse new mock Job inserts.
- New mock Jobs use a mode-qualified namespace/key; do not reuse un-moded primary key space.
- Place `knowledge-upload-job-store.test.ts` next to the store; do not import renderer/React.

**Stop conditions**
- [ ] Legacy rows are unclassified
- [ ] New snapshots can carry dataMode/progress/completed
- [ ] V03 command passes

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T2 — Add Main Knowledge Mode Controller

**Owns Changes**
- C02

**Writes:**
- `apps/work/src/main/knowledge/knowledge-mode-controller.ts`
- `apps/work/src/main/knowledge/knowledge-mode-controller.test.ts`
- `docs_agent/test-assets/TA-WK11-MODE.json`

**Reads:**
- `apps/work/src/main/build-info.ts`
- `apps/work/src/shared/knowledge/knowledge-job-ipc.ts#KnowledgeJobStatus`

**Depends On:**
- T1

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-mode-controller.test.ts`

**Goal**
Resolve immutable `dataMode` at Main start. Default `provider`. Enter `mock` only when `mode=mock` and `allowSyntheticData=true` are both declared.

**Immediate anchors**
- `apps/work/src/main/build-info.ts#candidatePaths`
- `apps/work/src/main/knowledge/register-knowledge-job-ipc.ts`

**Changes**
- Read mode from Main env and/or packaged JSON using the build-info candidate-path pattern. Do not read Renderer Preference, URL, or localStorage.
- Default `provider`. Reject mock if either declaration is missing.
- If non-terminal Jobs exist for a different mode, refuse the target mock/provider start with a sanitized diagnostic.
- Log effective mode, channel, and config source; never log tokens or user content.
- Do not reuse `getSkillRunFeatureMode()`.

**Stop conditions**
- [ ] Provider is default
- [ ] Dual-declaration gate is tested
- [ ] V01 command passes

**Triggered reads**
- If packaged JSON already exists beside `work-build-info.json`: that loader only

## Todo T3 — Add Provider Facade and Mock Adapter

**Owns Changes**
- C03
- C04

**Writes:**
- `apps/work/src/main/knowledge/knowledge-provider-facade.ts`
- `apps/work/src/main/knowledge/knowledge-provider-facade.test.ts`
- `docs_agent/test-assets/TA-WK11-FACADE.json`
- `apps/work/src/main/knowledge/knowledge-mock-adapter.ts`
- `apps/work/src/main/knowledge/knowledge-mock-store.ts`

**Reads:**
- `apps/knowledge/src/services/knowledge/mock-knowledge-repository.ts`
- `apps/work/src/main/knowledge/knowledge-mode-controller.ts`

**Depends On:**
- T1
- T2

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-provider-facade.test.ts`

**Goal**
Put all Knowledge entity/session/Q&A access behind one Main Facade. In mock mode, a Work-owned adapter serves synthetic bases/sets/documents/sessions/citations.

**Immediate anchors**
- `apps/knowledge/src/services/knowledge/mock-knowledge-repository.ts`
- `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts#readEntitiesForTests`

**Changes**
- Facade selects exactly one adapter from current mode. Remote adapter stays unimplemented and fail-closed.
- Copy/adapt source mock repository behaviour and fixtures into Work files. Do not import `apps/knowledge`.
- Persist mock data with partition `{workProfileId, authSubject, tenantScope, dataMode=mock}` via `getDbConnection`.
- Permission/member fields are display-only and must not authorize File/Chat/Settings.
- Provider-mode calls return unavailable/empty. Provider failure must not read the mock store.
- Isolated worktree without the listed copy source is BLOCKED.

**Stop conditions**
- [ ] Listed copy source exists on disk
- [ ] Mock entity families are callable via Facade tests
- [ ] V02 command passes

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T4 — Add Main Mock Job executor

**Owns Changes**
- C06

**Writes:**
- `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts#enqueue`
- `apps/work/src/main/knowledge/register-knowledge-job-ipc.ts`
- `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.test.ts`
- `docs_agent/test-assets/TA-WK01-JOB.json`

**Reads:**
- `apps/work/src/main/knowledge/knowledge-upload-job-store.ts`
- `apps/work/src/main/knowledge/knowledge-mode-controller.ts`

**Depends On:**
- T1
- T2

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false src/main/knowledge/knowledge-upload-job-coordinator.test.ts`

**Goal**
When `dataMode=mock`, Main advances Knowledge Jobs through recoverable progress to `completed` without remote transfer. Provider mode stays RM-01 fail-closed.

**Immediate anchors**
- `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts#enqueue`
- `apps/knowledge/src/stores/upload-job-store.ts` (negative example only; do not copy)

**Changes**
- Inject current dataMode into coordinator deps. Keep provider mode fail-closed; mock mode uses the Main executor.
- Mock executor writes progress/`completed` in Main. No `setInterval` in Renderer, no Query refetch driver, no Zustand persist. Do not copy `apps/knowledge/src/stores/upload-job-store.ts`.
- `recoverOnStart` restores non-terminal mock Jobs or marks them interrupted. Hide/reload must not mint a second Job.
- Do not emit `file-job:*` or forge remote ids/receipts.
- Extend the existing coordinator test; keep it renderer-free.

**Stop conditions**
- [ ] Mock completed exists without a Renderer timer
- [ ] Provider path still has no fake completed
- [ ] V04 command passes

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T5 — Isolate mock File associations

**Owns Changes**
- C08

**Writes:**
- `apps/work/src/shared/files/file-association.ts#FileAssociation`
- `apps/work/src/main/files/file-association-store.ts#insertAssociation`
- `apps/work/src/main/files/file-import-service.ts#importOnePath`
- `apps/work/src/main/files/file-import-knowledge-job.test.ts`
- `docs_agent/test-assets/TA-WK01-IMPORT.json`

**Reads:**
- `apps/work/src/main/knowledge/knowledge-upload-job-coordinator.ts`

**Depends On:**
- T1
- T4

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false src/main/files/file-import-knowledge-job.test.ts src/main/files/file-association-store.test.ts`

**Goal**
Persist Knowledge mock associations with `dataMode=mock` and keep File Platform refcount as the only physical-delete owner.

**Immediate anchors**
- `apps/work/src/main/files/file-association-store.ts#insertAssociation`
- `apps/work/src/main/files/file-import-service.ts#importOnePath`

**Changes**
- Additive `dataMode` on `FileAssociation` using the same ALTER pattern as `knowledge_job_id`.
- Mock Knowledge import writes `dataMode=mock` and never `sessionId`.
- Chat/Skill associations remain consumable; mock associations are not.
- Unlink/reset of mock consumers must call File Platform association cleanup; do not delete a ManagedFile with remaining Chat/Skill refs.
- Extend the existing Knowledge import test.

**Stop conditions**
- [ ] Mock association carries dataMode=mock
- [ ] Chat refcount regression still passes
- [ ] V05 command passes

**Triggered reads**
- If cleanup helpers are not beside `insertAssociation`: remainder of `file-association-store.ts`

## Todo T6 — Wire sanitized IPC and Mock/Demo badge

**Owns Changes**
- C09
- C10
- C12

**Writes:**
- `apps/work/src/preload/knowledge-job-api.ts#createKnowledgeJobApi`
- `apps/work/src/preload/index.ts`
- `apps/work/src/preload/index.d.ts`
- `apps/work/src/main/ipc/register.ts#registerIpcHandlers`
- `apps/work/src/main/knowledge/register-knowledge-mode-ipc.ts`
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView`
- `apps/work/src/shared/i18n/locales/en/knowledge.ts`
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgePages.tsx#KnowledgePages`
- `apps/work/tests/knowledge-fail-closed.test.ts`
- `docs_agent/test-assets/TA-WK01-CLOSED.json`

**Reads:**
- `apps/work/src/main/knowledge/knowledge-mode-controller.ts`
- `apps/work/src/main/knowledge/knowledge-provider-facade.ts`

**Depends On:**
- T2
- T3
- T4

**Parallel Safe:**
- no

**Focused Check:**
- `npm --prefix apps/work test -- --passWithNoTests=false tests/knowledge-fail-closed.test.ts`

**Goal**
Expose sanitized mode/facade/Job APIs on `hermesAPI.knowledgeJobs` and show a persistent Mock/Demo badge in mock mode without delivering six-page layouts.

**Immediate anchors**
- `apps/work/src/preload/knowledge-job-api.ts#createKnowledgeJobApi`
- `apps/work/src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView`

**Changes**
- Add getMode / facade invoke wrappers to the existing preload factory. Errors stay code-only, no paths/tokens.
- Register thin Main handlers in a new registrar; `registerIpcHandlers` only calls it.
- KnowledgeView reads Main mode and renders a Work badge with source-locale English copy. Renderer cannot hide it in mock mode.
- KnowledgePages stay a generic shell. Provider mode remains unavailable/empty. Mock mode may show badge-driven ready state but must not grow list/detail/chat layouts.
- English strings only in `locales/en/knowledge.ts`.
- Extend `tests/knowledge-fail-closed.test.ts` with badge and provider-no-fixture assertions. Keep the file under `apps/work/tests/`.

**Stop conditions**
- [ ] Badge visible only in mock mode
- [ ] Provider mode has no fixture lists
- [ ] V06 command passes

**Triggered reads**
- None unless a listed trigger becomes true

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07, V08 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts | PRD revision request |
