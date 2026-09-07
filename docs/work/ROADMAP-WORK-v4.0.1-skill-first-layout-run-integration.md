---
roadmap_id: WORK-SKILL-FIRST-LAYOUT-V4.0.1
version: v2.2
status: ACTIVE
architecture_decision: docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1
target_branch: work/prd-v4.0
updated_at: 2026-09-07T03:36:52.609151Z
implementation_plan_required: true
---

# ROADMAP — Work Skill-First Layout and Run Integration

本路线图把 APPROVED v4.0.1 架构拆成可验证里程碑。它冻结依赖、Owner、退出条件与灰度顺序，不替代 Cursor implementation `.plan.md`；每个 Work 实施 Slice 开始前都必须使用 `smc-plan-from-approved-prd` 生成并批准独立计划。

## Migration Provenance

本 Roadmap 从旧的叙述式 milestone 文档迁移为可校验的 Item DAG。仓库尚无独立 Skill Run Architecture Decision，因此暂以已批准 PRD 的 Target Architecture 作为 provenance bridge；不得把此桥接解释为 M0–M4 已具备新治理所要求的一对一 Stage PRD、Plan、实现提交和验证证据。

## Roadmap Items

| Item ID | Outcome | Depends On | Status | Exit Criteria | PRD | Plan | Implementation Commit | Verification Evidence |
|---|---|---|---|---|---|---|---|---|
| RM-01 | M0 Provider Contract Ready：Provider 更新后由人工完成受控 live 验证；Work 只消费不可变 Bundle。 | - | DONE | tag/manifest/SHA256 与 P0 schemas、endpoint/error fixtures 全部通过；Public DTO 安全；同一 idempotency key 跨端只创建一个 Run；Provider/Work contract tests 通过。 | docs/work/PRD-WORK-v4.0.1-M0-provider-contract-ready.md | .cursor/plans/work-v4.0.1-m0-provider-contract-ready.plan.md | 9b905ffad4db2f0724bc0af0ef7a38b75b753f08 | external-artifact:artifacts/work-v4.0.1-rm-01-live-e2e/v01-live.txt |
| RM-02 | M1 Work Contract and Main Foundation：不启用真实 `tools/call` 的 Main/Preload dark foundation 可用。 | - | DONE | auth scope、sanitized IPC、feature mode、Parser/Gateway/Service 与 focused tests 通过；默认保持 `expert-compat`，不得以本项启用真实 Skill Run start。 | docs/work/PRD-WORK-v4.0.1-M1-main-preload-dark-foundation.md | .cursor/plans/work-v4.0.1-m1-main-preload-dark-foundation.plan.md | e72e5edc15af93e6e3a34cc4d6f9517fcd2b7931 | apps/work/artifacts/rm-02-m1/ |
| RM-03 | M2 Layout, Catalog, and Selection：现有 Chat 内的安全 Skill selection UX 可用。 | RM-02 | DONE | Layout/Chat 单一 owner、Catalog discriminator、a11y、mode/selection persistence 和 Renderer tests 通过；真实 start 仍受 RM-01 gate 控制。 | docs/work/PRD-WORK-v4.0.1-M2-layout-catalog-selection.md | .cursor/plans/work-v4.0.1-m2-layout-catalog-selection.plan.md | f74bdf45 | apps/work/artifacts/rm-03-m2/ (V01-V05 PASS; typecheck:web has only pre-existing diagnostics outside M2) |
| RM-04 | M3 Executable Run and Recovery：幂等执行、SSE/poll、cancel 与 restart recovery 可证明。 | RM-03 | DONE | pending-submit、run identity、terminal monotonic、cancel、queue snapshot、rehydrate 与 focused/fixture E2E 通过。跨端 live 延后到 RM-01 重跑。 | docs/work/PRD-WORK-v4.0.1-M3-executable-run-and-recovery.md | .cursor/plans/work-v4.0.1-m3-executable-run-and-recovery.plan.md | fe87cc0e70e1fe71c2c184a5420a0b2b6a4fec20 | smc-evidence:RM-04@sha256:a930801252a62a82d90b4233fccfd3ab9d0bd4d398f4d0883e86ef7cc22dd7ae |
| RM-05 | M4 Result, Artifact, and Session Files：Result/Artifact 复用现有 File Platform 并完成 Checkpoint B。 | RM-04 | DONE | run-scoped remote identity、Artifact safety、Session Files、真实 Catalog→Artifact→Restart 与负向 Checkpoint B 通过。 | docs/work/PRD-WORK-v4.0.1-M4-result-artifact-and-session-files.md | .cursor/plans/work-v4.0.1-m4-result-artifact-and-session-files.plan.md | 86485027e1693dc51550cc3d5b8ceb77ccee1df0 | smc-evidence:RM-05@sha256:88d1cc66e4ea79df8a7e5c5b3a8019737beaabc8fc1d786415880af3a90a7f7f |
| RM-06 | M5 Pilot and Production Default：受控灰度后，默认新提交使用 Skill Run。 | RM-05 | DONE | telemetry、promotion gates、pilot 验收、rollback、Expert/Local regression、no silent fallback 与 production evidence 完整。 | docs/work/PRD-WORK-v4.0.1-M5-pilot-and-production-default.md | .cursor/plans/work-v4.0.1-m5-pilot-and-production-default.plan.md | 185418ffdc40693a98dcd7ed7162782ff3c7207d | external-artifact:artifacts/work-v4.0.1-m5-promotion/v01.txt |
| RM-07 | M6a v4.2 Expert 默认创建入口 Removal：skill-first / local-only 下新员工 Skill 调用不得经 Expert start；Expert reader 与回滚入口保留。 | RM-06 | DONE | Composer 默认 Expert 入口移除；Main `expert.start` 在非 `expert-compat` 下 fail-closed；既有 Expert Task 可恢复；无 silent fallback；Expert 合同与 Skill Run 合同均不改。 | docs/work/PRD-WORK-v4.0.1-M6-expert-default-entry-removal.md | .cursor/plans/work-v4.0.1-m6-expert-default-entry-removal.plan.md | b4d013e607ca0062bd00bccf77bc51c1fbff975e | smc-evidence:RM-07@sha256:d32d05822c0d025f2a37aaaa87e8abf3367b50b9c6eba68760b8f6d121920bd0 |
| RM-08 | M6b P1 合同化 Run Activity：把 v1.2.1 已枚举的 reasoning / tool / clarify / approval.requested 映射为 sanitized activity。 | RM-06 | DONE | 仅映射 Bundle 已枚举事件；unknown fail-soft；不复用 Local Chat ClarifyCard；无 Approval decision IPC。 | docs/work/PRD-WORK-v4.0.1-M6-skill-run-activity-adapter.md | .cursor/plans/work-v4.0.1-m6-skill-run-activity-adapter.plan.md | 27e19da7999e03d25e82e5b4fe01948381235d83 | smc-evidence:RM-08@sha256:3538984a3d9f0cef375fcf559e413f4ce27e4ddeeb745823086cd1dc1d54f549 |
| RM-09 | M6c P1 Approval decision：可操作批准/拒绝卡片。 | RM-08 | BACKLOG | 新 Bundle 将 `approval` 从 `unsupported` 提升，并给出 decision endpoint / 幂等语义后，才允许独立 Stage PRD。 | - | - | - | - |
| RM-10 | M6d P1 受限 JSON Schema 参数表单。 | RM-06 | BACKLOG | 独立 Stage PRD；只覆盖 P0 已 fail-closed 的 `parameters-required` / `form-required` 子集；不猜 schema。 | - | - | - | - |
| RM-11 | M6e P1 Attachment refs / upload 与 File Platform 接入。 | RM-06 | BACKLOG | 新 Bundle 将 `attachments` 从 `unsupported` 提升并给出 refs/upload 合同后，才允许独立 Stage PRD。 | - | - | - | - |
| RM-12 | M6f P1 收藏、最近使用与组织推荐。 | RM-07 | BACKLOG | 独立 Stage PRD；不得新增第二 Catalog owner 或绕过 Main Catalog cache。 | - | - | - | - |

## Outcome

最终用户从 Layout 的“使用技能”进入现有 Chat，在 Skill Catalog 中选择已发布 Skill，以 `tool_name` 发起 NoDeskClaw Skill Run，并在同一 Chat 中查看状态、结果与文件。Work 不暴露 Agent/Runtime 路由，不复制 Chat、Session 或 File Platform，也不在失败时静默回退 Expert。

## Critical Path

```text
M0 Provider Contract Ready
  → M1 Work Contract + Main Foundation
  → M2 Layout + Catalog + Selection
  → M3 Executable Run + Recovery
  → M4 Result + Artifact + Session Files
  → M5 Pilot + Production Default
  → M6a Expert default-entry Removal（RM-07）
  → M6b–M6f 各 P1 独立 Item（RM-08–RM-12；Approval / Attachment 仍等新 Bundle）
```

M0 Bundle/fixture 仍是合同输入。2026-09-04 曾把 RM-01 受控 live 延后以免阻塞 M3；2026-09-06 已在受控 public backend 重跑 live AC-03/AC-04 并将 RM-01 标为 DONE。

## Milestone M0 — Provider Contract Ready

**Owner:** NoDeskClaw Backend/Agent contract owners；Work contract owner 负责消费验收。

**Dependencies:** APPROVED v4.0.1 PRD。

**Deliverables:**

- 发布带 Git tag、manifest 与 SHA256 的 Skill Run Consumer Contract；
- Catalog 提供稳定 Skill discriminator，保证“使用技能”不会混入 Public Connector；
- 发布 Public Run view、Result envelope、Artifact list/download、Event discriminated union 与 SSE auth/replay contract；
- 发布 idempotency header 的 scope、TTL、conflict 与 accepted replay/query semantics；
- Approval 与 Attachment 可作为 P1 独立扩展，但 P0 必须明示 unsupported/fail-closed 行为；
- Work 导入合同快照并生成 consumer lock，不修改 `work-expert/v1.0.2`。

**Exit criteria:**

- Contract tag 可解析到 immutable commit，manifest 与 SHA256 全部通过；
- endpoint method/path/header/status/error fixtures 可执行；
- Public DTO 不含 org/user/internal snapshot、credential 或 internal URL；
- 同一 idempotency key 的跨端测试只创建一个 Run；
- Work 与 Provider contract tests 共同通过。

**Stop condition:** 任一必需 schema 仍是开放 object/string 时，不得声称合同已关闭。RM-01 live AC-03/AC-04 已于 2026-09-06 在受控 public backend 通过。

## Milestone M1 — Work Contract and Main Foundation

**Owner:** Work Main/Preload owners。

**Dependencies:** M0 的合同形状稳定；正式 consumer lock 可在 M0 完成时落地。

**Deliverables:**

- 从 Expert client 抽取 Main 内部 NoDeskClaw authorized transport，保持 Expert 行为不变；
- 建立 Skill Run shared DTO、contract parser、Gateway Client、Run Service、IPC/Preload skeleton；
- 建立 auth-scope cache partition、logout/org/origin/generation invalidation 与 same-origin path policy；
- 建立 feature mode `local-only | expert-compat | skill-first`，默认保持关闭；
- 建立 sanitized projection contract，禁止 raw Provider event/URL/credential 越过 Preload；
- 建立 contract/main/ipc focused test suites。

**Acceptance criteria:**

- Expert v1.0.2 focused tests无回归；
- Renderer contract guard 证明无 Skill Run HTTP/JWT/URL 访问；
- Main parser 对未知、超限、错版本响应 fail-closed；
- feature mode 关闭时没有真实 Skill Run 网络调用。

**Verification:**

- `npm run guard`
- `npm run typecheck`
- `npm test -- <M1 focused tests>`
- Provider/Work contract fixture verification

## Milestone M2 — Layout, Catalog, and Selection

**Owner:** Work Renderer Layout/Chat owners；Main Catalog client 提供数据。

**Dependencies:** M1 IPC list/refresh 可用；M0 Catalog discriminator 已冻结。

**Deliverables:**

- `ChatRun` 增加 execution mode，保持 Renderer Tab id 与 Provider Run id 分离；
- Layout 增加一级“使用技能”，实现 scratch 原地切换、已有内容新建/复用 Skill Tab、active state；
- 在现有 Chat 中加入 Catalog Panel、搜索/分类、Selection Bar 与 callability；
- `Chat.tsx` 保持唯一 Skill selection truth；提交/queue snapshot 不可变；
- Skill mode 从 DOM 移除 Local Model、Reasoning、Fast Mode、Context Folder 与 Expert 控件；
- Attachment fail-closed、完整 UI states、keyboard/a11y 与全部 locale 文案。

**Acceptance criteria:**

- 不新增 Skill Chat View 或第二套 MessageList/Input；
- 后台 Chat/Expert 运行不会被 Layout mode transition 取消；
- Catalog 无 discriminator 时显示 contract unsupported，不猜测过滤；
- 一条消息不可能同时进入 Local、Expert 与 Skill submit；
- Tab 切换后 mode 与 selection 不丢失。

**Verification:**

- Layout/chatRuns transition tests
- Chat/ChatInput component tests
- keyboard 与 accessibility tests
- `npm run typecheck:web`

## Checkpoint A — Safe Selection Slice

M0–M2 完成后进行第一次人工产品检查：用户可进入 Skill mode、浏览和选择 Skill，但真实 start 仍由 feature gate 控制。只有 Catalog 身份、导航语义、控件隐藏与安全边界均确认后进入 M3。

## Milestone M3 — Executable Run and Recovery

**Owner:** Work Main SkillRunService；Provider Run 仍是远端事实源。

**Dependencies:** M1 foundation；M2 immutable selection snapshot。M0 live 按产品决定延后重跑，不作为本里程碑启动门。

**Deliverables:**

- durable pending-submit 与稳定 clientRequestId/idempotency key；
- prompt-first schema binding 与 Main 二次校验；
- Accepted `run_id`、SSE `Last-Event-ID`、sequence/id 去重、reconnect 与 bounded poll fallback；
- per-Chat 单 active Run、queue snapshot、cancel 与 terminal monotonic；
- versioned `skill-run` continuation、session mode metadata、restart rehydrate；
- compact Run transport row 与 final Result adapter；
- WAITING_APPROVAL 在 P0 仅只读；无合同不显示允许/拒绝动作。

**Acceptance criteria:**

- 网络响应丢失、SSE 重放和 App 重启均不会创建重复 Run；
- Provider `run_id` 不覆盖 `ChatRun.runId`；
- 旧事件不能将 terminal projection 回退；
- 切换当前 Skill 不改变已提交或已排队请求；
- cancel 只调用 Skill Run cancel，不调用 Local Chat abort；
- session 重开后恢复 mode、transcript 与非终态跟踪。

**Verification:**

- Main lifecycle/idempotency/reconnect tests
- Session continuation/materialization tests
- Renderer projection/store tests
- Cross-project fixture start → SSE/poll → result E2E
- `npm run guard && npm run typecheck && npm test`
- 受控 live 同 key / Checkpoint B 全链路延后到 RM-01 重跑，不作为本里程碑 DONE 前提

## Milestone M4 — Result, Artifact, and Session Files

**Owner:** Work File Platform owner；SkillRunService 只负责 descriptor discovery/adaptation。

**Dependencies:** M3 terminal/result；M0 Artifact contracts。

**Deliverables:**

- Result 更新同一 assistant bubble 与持久化 transcript；
- ManagedFile remote provider 增加 `skill-run`；
- remote identity 迁移为 provider + remote run + artifact，兼容既有 Expert rows；
- Artifact descriptor upsert、Session `agent-output` association、retry discovery；
- Preview、Save As、checksum、size limit、atomic rename 与 materialize 全部复用 File Platform；
- Renderer 使用现有 ManagedFileView/Session Files，不增加直接 download IPC。

**Acceptance criteria:**

- 两个 Run 复用相同 artifact id 时不会串资源；
- Renderer 看不到 download URL、token、absolute cache path 或 raw bytes；
- Preview/Save As/Materialize 与 Expert/local ManagedFile 行为一致；
- Artifact discovery 失败不把成功 Run 改成失败，且可显式重试；
- File migration 可回滚且不破坏 Expert remote rows。

**Verification:**

- File association migration/identity tests
- Remote transfer security、size、checksum、atomic rename tests
- Session Files component tests
- Run complete → Artifact → Preview/Save As E2E

## Checkpoint B — End-to-End P0

M3–M4 完成后，使用真实发布 Skill 验证 Catalog → Submit → Run → Result → Artifact → Restart 全链路。Checkpoint 必须包含 unauthorized、unpublish、offline/reconnect、duplicate submission、cancel 与 artifact failure 负向场景。

## Milestone M5 — Pilot and Production Default

**Owner:** Work release owner；NoDeskClaw operations 配合。

**Dependencies:** Checkpoint B PASS。

**Deliverables:**

- 结构化 telemetry：catalog/start/accepted/reconnect/terminal/duplicate-prevented/artifact；不记录 prompt/secret/body；
- developer → internal pilot → limited production → production default 灰度；
- skill-first、expert-compat、local-only 三种 mode 的配置与回滚手册；
- 明确禁止 silent fallback；回滚只停止新建，两个 lifecycle reader 继续恢复在途任务；
- 生产验收与 release notes。

**Promotion gates:**

- Contract drift 为零；
- duplicate Run 为零；
- unauthorized/cross-origin/raw credential 泄漏测试为零失败；
- reconnect 与 artifact failure 在预算内且可诊断；
- Expert compatibility 与 Local Chat regression suite 通过；
- pilot 用户完成 Layout、执行、取消、重启恢复与文件使用验收。

**Rollback:**

- 将新提交切回 `expert-compat` 或 `local-only`；
- 不删除 Skill Run continuation、ManagedFile 或 transcript；
- Main reader 继续跟踪已创建 Run 到终态；
- 不把失败 Run 重新提交为 ExpertTask。

## Milestone M6 — Expert Removal and Independent P1 Items

M5 已关闭。v1.2.1 Bundle 把 `approval` 与 `attachments` 标为 `unsupported`，且 endpoint matrix 没有 Approval decision 或 Attachment upload。因此 M6 不得再作为单一 Roadmap Item；P1 与 Expert removal 必须分 Item、分 Stage PRD。

**RM-07 / M6a — v4.2 Expert 默认创建入口 Removal**

**Owner:** Work Expert owners（IPC/start gate）+ existing Chat Composer owner（入口可见性与提交路由）。Skill Run 与 Local Chat 不接收 Expert 新提交。

**Dependencies:** RM-06 DONE。Compatibility Contract：新提交默认 Skill Run、无 silent fallback、旧 Expert Task 可由独立 reader 恢复。

**Deliverables:**

- `skill-first` 与 `local-only` 下从 local-chat Composer 移除 Expert 默认创建入口（`ExpertContextControl` 不再作为新员工 Skill 调用入口）；
- Chat 不得在上述 mode 对新建 prompt 调用 `expert.start`；
- Main `expert.start` 在非 `expert-compat` 下 fail-closed，防止 Renderer 绕过；
- Expert cancel / rehydrate / list / 历史 session / File Platform Expert rows 保留；
- 已有 ExpertRunCard 的 retry 作为 compatibility 保留，不是默认入口；
- `expert-compat` 回滚后 Composer Expert 入口与 `expert.start` 恢复；
- 回滚手册写清「删除默认入口」与「回滚恢复入口」的差异。

**Exit criteria:** 见 Item 表 RM-07。

**RM-08 / M6b — P1 合同化 Run Activity**

**Owner:** 现有 Main Skill Run contract parser + SkillRunService projection；Renderer `modules/skill-run` 只展示 sanitized activity。

**Dependencies:** RM-06 DONE。v1.2.1 已枚举 `reasoning.summary`、`tool.call`、`clarify.requested`、`approval.requested`。

**Deliverables:** 把上述事件从 `rawUnknown` 提升为 Work activity projection；unknown 仍 fail-soft；`approval.requested` / `clarify.requested` 只读；不复用 Local Chat `ClarifyCard` 或 `clarify-respond` IPC；不增加 Approval decision。

**RM-09–RM-12** 各自独立 Grounding。RM-09 / RM-11 在新 Bundle 关闭 `unsupported` 并补齐 endpoint 前不得开实施 Plan。

不得借 P1 把 Runtime routing、raw Provider payload 或第二 Session/File owner 引入 Renderer。

## Parallelization

可并行：

- M0 Provider contract closure 与 M1 中不依赖 schema 的 authorized transport extraction；
- M1 Main contract skeleton 与 M2 Layout mode transitions/UI states；
- M3 lifecycle tests 与 M2 accessibility/i18n；
- M4 File migration tests 与 Result UI，前提是 remote identity contract 已冻结；
- M5 telemetry dashboard 与 rollout runbook。

必须串行：

- Contract Bundle lock 在生产默认 `skill-first` 前；显式开发 mode 下的 M3 可执行路径以 fixture 为准，live 延后重跑；
- auth/sanitized IPC 在 Renderer projection subscription 前；
- pending-submit/idempotency 在 retry/restart E2E 前；
- run-scoped file identity migration在 Skill Artifact production upsert 前；
- Checkpoint B 在 production default 前；
- v4.2 Removal PRD（RM-07）在 Expert 默认入口删除前；
- Approval decision（RM-09）与 Attachment（RM-11）在新 Bundle 关闭 `unsupported` 前。

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Provider 候选 schema 被误当 release contract | Work parser 漂移或泄漏 internal DTO | M0 tag/checksum/fixture Gate；未关闭时 contract unsupported |
| Layout mode 与 Chat selection 形成双 Owner | Tab 切换或排队时错 Skill | ChatRun 只持 mode；Chat 持 selection；request/queue 持 immutable snapshot |
| SSE 重放产生重复 UI 或重复执行 | 重复消息、产物或 Run | pending-submit + idempotency；Main sequence/id 去重；terminal monotonic |
| Skill Artifact 与 Expert Artifact identity 冲突 | 文件串 Run 或覆盖 | provider + remote run + artifact 唯一键与迁移测试 |
| Skill failure 自动 fallback Expert | 重复付费/副作用 | 显式 mode、no silent fallback、cross-path negative E2E |
| Rich agent output contract 不稳定 | UI 猜测 payload 后频繁破坏 | P0 只映射 phase/result；rich events 延后到 P1 discriminated union |
| 并行开发触碰同一 Chat owner | 高冲突与状态分叉 | 先批准每个 Slice `.plan.md`；Layout mode、Chat selection、Main projection按依赖合并 |

## Definition of Ready for Each Implementation Slice

- Source PRD 仍为 APPROVED，目标 Owner 与 classification 未变化；
- 对应 Provider contract 已锁定，或该 Slice 明确不触碰 wire semantics；
- 独立 `.plan.md` 已列出 exact file/symbol、最小调用链、测试落点和 removal；
- 每个任务有可观察 acceptance 与 focused verification；
- 没有新平行 Service/Store/Parser/Session/File owner；
- 风险较高的 migration、auth、idempotency 和 SSE 任务先于 UI polish；
- 每个 Checkpoint 前运行 `npm run guard`、`npm run typecheck`、focused tests 与 `lat check`。

## Completion Criteria

ROADMAP 完成需同时满足：

- M0–M5 全部退出条件通过；
- RM-07–RM-12 各有独立 Stage PRD，不得把 P1 与 Expert removal 混进同一 Item；
- APPROVED 架构 PRD 的所有 P0 Acceptance Criteria 有自动化或明确人工证据；
- Skill-first 成为生产默认但可安全回滚；
- Expert 兼容 reader、Local Chat 和 Runtime ChatRun 无回归；
- 没有 silent fallback、duplicate Run、raw credential/URL 泄漏或第二 Session/File owner；
- P1 与 Expert Removal 各留在独立 Item / PRD / Plan（RM-07–RM-12），不混入 P0 收尾。
