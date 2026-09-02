---
roadmap_id: WORK-SKILL-FIRST-LAYOUT-V4.0.1
version: v2.1
status: ACTIVE
architecture_decision: docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1
target_branch: work/prd-v4.0
updated_at: 2026-09-02T03:58:38.010320Z
implementation_plan_required: true
---

# ROADMAP — Work Skill-First Layout and Run Integration

本路线图把 APPROVED v4.0.1 架构拆成可验证里程碑。它冻结依赖、Owner、退出条件与灰度顺序，不替代 Cursor implementation `.plan.md`；每个 Work 实施 Slice 开始前都必须使用 `smc-plan-from-approved-prd` 生成并批准独立计划。

## Migration Provenance

本 Roadmap 从旧的叙述式 milestone 文档迁移为可校验的 Item DAG。仓库尚无独立 Skill Run Architecture Decision，因此暂以已批准 PRD 的 Target Architecture 作为 provenance bridge；不得把此桥接解释为 M0–M4 已具备新治理所要求的一对一 Stage PRD、Plan、实现提交和验证证据。

## Roadmap Items

| Item ID | Outcome | Depends On | Status | Exit Criteria | PRD | Plan | Implementation Commit | Verification Evidence |
|---|---|---|---|---|---|---|---|---|
| RM-01 | M0 Provider Contract Ready：Provider 更新后由人工完成受控 live 验证；Work 只消费不可变 Bundle。 | - | BACKLOG | tag/manifest/SHA256 与 P0 schemas、endpoint/error fixtures 全部通过；Public DTO 安全；同一 idempotency key 跨端只创建一个 Run；Provider/Work contract tests 通过。 | `docs/work/PRD-WORK-v4.0.1-M0-provider-contract-ready.md` | - | - | 2026-09-01 fixture checks passed (consumer/gateway 14/14; E2E 8/8). 2026-09-02 live Catalog found the configured tool but Work rejected its optional object field as `UNSUPPORTED_SCHEMA` before `tools/call`; pending a Provider-published prompt-first skill and manual live replay verification. |
| RM-02 | M1 Work Contract and Main Foundation：不启用真实 `tools/call` 的 Main/Preload dark foundation 可用。 | - | DONE | auth scope、sanitized IPC、feature mode、Parser/Gateway/Service 与 focused tests 通过；默认保持 `expert-compat`，不得以本项启用真实 Skill Run start。 | docs/work/PRD-WORK-v4.0.1-M1-main-preload-dark-foundation.md | .cursor/plans/work-v4.0.1-m1-main-preload-dark-foundation.plan.md | e72e5edc15af93e6e3a34cc4d6f9517fcd2b7931 | apps/work/artifacts/rm-02-m1/ |
| RM-03 | M2 Layout, Catalog, and Selection：现有 Chat 内的安全 Skill selection UX 可用。 | RM-02 | READY | Layout/Chat 单一 owner、Catalog discriminator、a11y、mode/selection persistence 和 Renderer tests 通过；真实 start 仍受 RM-01 gate 控制。 | - | - | - | - |
| RM-04 | M3 Executable Run and Recovery：幂等执行、SSE/poll、cancel 与 restart recovery 可证明。 | RM-01, RM-03 | BACKLOG | pending-submit、run identity、terminal monotonic、cancel、queue snapshot、rehydrate 与跨项目 E2E 通过。 | - | - | - | - |
| RM-05 | M4 Result, Artifact, and Session Files：Result/Artifact 复用现有 File Platform 并完成 Checkpoint B。 | RM-04 | BACKLOG | run-scoped remote identity、Artifact safety、Session Files、真实 Catalog→Artifact→Restart 与负向 Checkpoint B 通过。 | - | - | - | - |
| RM-06 | M5 Pilot and Production Default：受控灰度后，默认新提交使用 Skill Run。 | RM-05 | BACKLOG | telemetry、promotion gates、pilot 验收、rollback、Expert/Local regression、no silent fallback 与 production evidence 完整。 | - | - | - | - |
| RM-07 | M6 Removal Readiness and P1：P1 contract capabilities 与独立 v4.2 Expert removal 准备。 | RM-06 | BACKLOG | M5 稳定 telemetry 后，每项拥有独立 Stage PRD；Expert removal 单独审查。 | - | - | - | - |

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
  → M6 Expert Removal Readiness / P1 Enhancements
```

M0 是生产集成硬 Gate。M0 进行时，Work 可并行完成不依赖 wire schema 的 Layout mode、UI states、shared transport extraction 和测试骨架，但不得启用真实 `tools/call`。

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

**Stop condition:** 任一必需 schema 仍是开放 object/string 时，M1 可以继续暗构建，但 M3 不得接入生产 start。

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

**Dependencies:** M0 全部 P0 contract Gate；M1 foundation；M2 immutable selection snapshot。

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
- Cross-project start → SSE/poll → result E2E
- `npm run guard && npm run typecheck && npm test`

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

## Milestone M6 — Removal Readiness and P1

**Owner:** 按 capability 分别由 Work Expert、Skill Run、Renderer 与 Provider contract owners 负责。

**Dependencies:** M5 稳定运行和真实 telemetry。

可独立规划的后续项：

1. Approval descriptor/decision contract 与交互卡片；
2. reasoning/tool/clarify/streaming delta 的 contract-versioned activity adapter；
3. 受限 JSON Schema 参数表单；
4. Attachment refs/upload 与 File Platform 接入；
5. 收藏、最近使用与组织推荐；
6. v4.2 Expert 默认创建入口 Removal PRD。

每项必须独立 Grounding；不得借 P1 把 Runtime routing、raw Provider payload 或第二 Session/File owner 引入 Renderer。

## Parallelization

可并行：

- M0 Provider contract closure 与 M1 中不依赖 schema 的 authorized transport extraction；
- M1 Main contract skeleton 与 M2 Layout mode transitions/UI states；
- M3 lifecycle tests 与 M2 accessibility/i18n；
- M4 File migration tests 与 Result UI，前提是 remote identity contract 已冻结；
- M5 telemetry dashboard 与 rollout runbook。

必须串行：

- Contract lock 在真实 `tools/call` 前；
- auth/sanitized IPC 在 Renderer projection subscription 前；
- pending-submit/idempotency 在 retry/restart E2E 前；
- run-scoped file identity migration在 Skill Artifact production upsert 前；
- Checkpoint B 在 production default 前；
- v4.2 Removal PRD 在 Expert 默认入口删除前。

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
- APPROVED PRD 的所有 P0 Acceptance Criteria 有自动化或明确人工证据；
- Skill-first 成为生产默认但可安全回滚；
- Expert 兼容 reader、Local Chat 和 Runtime ChatRun 无回归；
- 没有 silent fallback、duplicate Run、raw credential/URL 泄漏或第二 Session/File owner；
- P1 与 Expert Removal 留在独立 PRD/Plan，不混入 P0 收尾。
