---
work_item_id: RM-04
version: v1.1.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-04T17:03:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-04
grounded_commit: 92748e3655d9528700ab31ef683ce126722631eb
grounding_mode: revision
provider_contract: SKILL-RUN-CONTRACT v1.2.1
product_decision: user-input:2026-09-04-defer-rm01-live
---

# WORK PRD v4.0.1 M3 — Executable Run and Recovery

本 Stage PRD 收敛既有 Main Skill Run 可执行生命周期：prompt-first 绑定、幂等 start、原生 `run_id` 传输、SSE/poll 恢复、取消、队列快照与重启 rehydrate。RM-01 受控 live 验收按产品决定保持 BACKLOG，在后续阶段重跑，不阻塞本 PRD 审查与 M3 实施。本阶段不把 Skill-first 设为生产默认，也不收口 Artifact/File Platform 或 Checkpoint B。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-04` / M3 Executable Run and Recovery |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-04` |
| Repository baseline | `92748e3655d9528700ab31ef683ce126722631eb` |
| Product decision | 2026-09-04：跳过 RM-01 待验证 live AC，RM-01 保持 `BACKLOG`，后续功能推进中重跑 |
| Dependencies | RM-03 is `DONE`。RM-01 仍为 `BACKLOG`（fixture 已过；live 延后）。M3 实施不再等待 RM-01 `DONE`。 |
| Provider input | 已锁定 `contracts/skill-run/v1.2.1/`；accepted identity 为 `structuredContent.run_id` 与 `/api/v1/runs/{run_id}/*`。Provider 已声明按该合同修复 envelope。 |
| Existing lifecycle | `SkillRunService.start/cancel/rehydrate`、pending-submit、`X-Idempotency-Key`、SSE `Last-Event-ID`、poll fallback、terminal monotonic、prompt-first binder、Chat queue snapshot、session continuation 已存在 |
| Current default mode | HEAD `DEFAULT_MODE = "skill-first"`，与 M1 AC 及 M5 production-default owner 冲突，本阶段必须收回 `expert-compat` |
| Uncommitted deviation | 工作区存在 Hermes Task `task_id` transport bridge 与 debug `debugger`；它们不是本 Grounding 基线，不得作为 Skill Run 合同 |
| Deferred live | 2026-09-04 对旧 origin 的 Work live：Catalog prompt-first PASS；accepted 当时为 HermesTask；SSE 挂起导致 120s 未终态。该次结果不关闭 RM-01，也不作为 M3 完成证明。 |

## Problem and Outcome

M1/M2 已冻结 dark foundation 与安全选择。Main 已能在 `skill-first` 下发出 `tools/call` 并跟踪 Run，但尚未作为 M3 独立冻结：生产身份必须是 Provider `run_id`；SSE 长时间不结束时必须能靠 poll 进入终态；每 Chat 只能有一个 active Run；默认 mode 仍属 M5。HEAD 把默认 mode 改成 `skill-first`，会在未显式打开开发开关时把新提交送进真实执行。

完成后，开发者在显式 `skill-first` 下可从现有 Chat 提交 prompt-first Skill，Main 以同一 `clientRequestId` 作为幂等键拿到唯一 `run_id`，经 Bundle 定义的 `/api/v1/runs/*` 完成 SSE、并行 bounded poll、cancel、终态与重启恢复。默认新提交仍为 `expert-compat`。RM-01 跨端 live 与 Checkpoint B 全链路在后续阶段重跑。Artifact Preview/Save As/Session Files 仍属 RM-05。

## Scope

- In: 复用既有 `SkillRunService` / `SkillRunGatewayClient` / contract parser / continuation / Chat queue snapshot / session materialize；把 accepted identity 收敛为 v1.2.1 `run_id` + `/api/v1/runs/*`；SSE 未断开时也要 bounded poll；恢复默认 `expert-compat`；以 fixture 与 focused tests 证明 lifecycle。
- Out: 把 RM-01 标 `DONE`；M5 生产默认 `skill-first`；M4 File Platform identity/Preview/Save As/Session Files 与 Checkpoint B 收口；Approval 可操作卡片；rich activity；JSON Schema form；Attachment upload；Expert 默认入口删除；把 Hermes Task `/api/v1/hermes/tasks/*` 提升为 Skill Run 合同。
- Production Owner: Main `SkillRunService` 是唯一 Work lifecycle owner；`SkillRunGatewayClient` 只消费 Bundle 定义的 MCP 与 `/api/v1/runs/*`；挂载 Chat 拥有不可变 queue snapshot 与 submit 路由；Renderer 只消费 sanitized projection；Session/File Platform owner 不变。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Prompt-first bind and start gates | Main parser + `SkillRunService` | `classifySkillInvocation` / `bindPromptFirstTool` 与 Catalog 共用；start 校验 feature mode、lock、`RUN_ALREADY_ACTIVE`、catalog ready，并在 `tools/call` 前持久化 `pending-submit` | EXISTS |
| Accepted Run identity and HTTP transport | `SkillRunGatewayClient` | 基线要求 `run_id` 并默认 `/api/v1/runs/{id}/*`；工作区未提交的 Hermes Task bridge 把 `task_id` 别名成 Run | PARTIAL |
| Idempotency and pending-submit | Main Service + authorized transport | `clientRequestId` 作为 `X-Idempotency-Key`；同 key 本地 replay 返回已有 projection | EXISTS |
| SSE / poll / terminal monotonic | Main Service | `Last-Event-ID` 与 event 去重已存在；poll 仅在 SSE 断开后启动，开着的空闲 SSE 会挡住终态 | PARTIAL |
| Cancel | Main Service + Chat | cancel 调用 Skill Run cancel，不调用 Local Chat abort | EXISTS |
| Per-session single active Run and queue snapshot | Service + mounted Chat | Service 拒绝第二非终态 start；Chat queue 保存入队快照 | EXISTS |
| Restart rehydrate | continuation + Service | versioned `skill-run` continuation 与 `rehydrate()`；fixture 已覆盖同进程不二次 `tools/call` | EXISTS |
| Compact result / transcript adapter | session materialize | accepted 后 upsert 同一 assistant bubble | EXISTS |
| WAITING_APPROVAL | projection phase | 只读展示；无 Approval decision IPC | EXISTS |
| Feature mode default | feature-mode store | HEAD 默认为 `skill-first` | CONFLICT |
| RM-01 live proof | Skill Run E2E live harness | 按产品决定延后重跑；不阻塞本 Stage PRD | KEEP deferred |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Prompt-first start and Main revalidation | Existing parser + `SkillRunService` | Renderer 只提交 `toolName` + prompt；Main 按当前 auth-scoped Catalog 二次分类并构造 `arguments[promptField]` | KEEP |
| Native Skill Run transport | Existing `SkillRunGatewayClient` | `tools/call` 只接受 Bundle `run_id`；status/SSE/result/cancel/artifacts 只走 `/api/v1/runs/{run_id}/*` | MODIFY |
| Hermes Task Skill-Run bridge | Existing Gateway (uncommitted) / Expert owners | Skill Run 不得把 `task_id` 或 `/api/v1/hermes/tasks/*` 当作 Run SoT；Expert 继续独占 HermesTask | REMOVE |
| Durable pending-submit and idempotent start | Existing `SkillRunService` | 发 `tools/call` 前写入 continuation；同 `clientRequestId` 恢复同一 Run | KEEP |
| SSE replay plus concurrent bounded poll | Existing `SkillRunService` | `Last-Event-ID` 重连、sequence/id 去重；SSE 仍打开时也 bounded poll；terminal 后旧事件不能回退终态 | MODIFY |
| Single active Run + immutable queue | Existing Service + Chat | 每 session 一个非终态 Run；出队使用入队快照 | KEEP |
| Restart recovery | Existing continuation owner | App 重启恢复 mode、transcript 与非终态跟踪，不重复 `tools/call` | KEEP |
| Compact result row | Existing session materialize | 终态 Result 更新同一 assistant transcript | KEEP |
| Approval waiting | Existing projection | P0 只读 `waiting-approval` | KEEP |
| Feature mode and Expert compatibility | Existing feature-mode / Expert owners | 仓库默认 `expert-compat`；显式 `skill-first` 才允许新 `tools/call`；失败不 fallback Expert | MODIFY |
| Deferred RM-01 live | Existing E2E harness | 保持 env-gated live 入口；本阶段 DONE 不以 live PASS 为前提 | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Native `run_id` + `/api/v1/runs/*` transport | MODIFY | 只消费 v1.2.1 `structuredContent.run_id` 与 Bundle endpoint matrix；缺少 `run_id` fail-closed。 |
| C02 | Hermes Task as Skill Run transport | REMOVE | 禁止用 Expert `task_id` 充当 Skill Run 合同。未提交 bridge 不得合入生产 Skill Run owner。 |
| C03 | Concurrent bounded poll while SSE open | MODIFY | 现有 poll 只在 SSE 断开后启动；开着的非终态 SSE 会让投影卡在 `running`。M3 必须在 SSE 存活时也能 poll 到 Bundle 终态。 |
| C04 | Pending-submit, idempotency, cancel, terminal monotonic | KEEP | 现有 Service 已是唯一 lifecycle owner；补齐 focused 证据，不新增第二 service。 |
| C05 | Single-active Run, queue snapshot, rehydrate, compact result | KEEP | Chat 为 snapshot owner，Main 为 Run owner；不新增 Session SoT，不收口 File Platform。 |
| C06 | Feature-mode default and no silent fallback | MODIFY | 将 HEAD 默认 `skill-first` 收回 `expert-compat`；生产默认仍属 M5。 |

## Replacement / Removal Matrix

| Replaced Production Path | Existing Owner | Target Path | Removal Condition |
|---|---|---|---|
| Skill Run Gateway 将 HermesTask `task_id` + `/api/v1/hermes/tasks/*` 映射为 `providerRunId` | `SkillRunGatewayClient`（工作区未提交） | v1.2.1 `structuredContent.run_id` + `/api/v1/runs/{run_id}/*` | 缺少 `run_id` 时 fail-closed；不得改写 Expert reader，也不得 fallback 到 `ExpertRunService` |
| HEAD 默认 `skill-first` 使新提交自动走 Skill Run | feature-mode store | 默认 `expert-compat`；`SMC_WORK_SKILL_RUN_MODE` 或显式 store 才能切到 `skill-first` | M3 implementation commit 必须恢复默认；M5 才拥有生产默认切换 |

## Contract and Security Boundary

- 请求只使用 Bundle 定义的 `POST /api/v1/mcp`、`Authorization`、`X-Idempotency-Key` 与 `/api/v1/runs/{run_id}` status/events/result/cancel/artifacts。`Last-Event-ID` 是唯一 SSE replay header。
- Accepted 结果必须含稳定 `run_id`。`task_id`、Hermes Task URL、Expert slug、Agent/Runtime routing 都不是 Skill Run 身份。缺失 `run_id` 不得猜测、不得改写为 `task_id`、不得创建 Expert Task。
- Public accepted DTO 不得含 `agent_alias` / `agent_id` / `profile_id` / `installation_id` 等内部路由字段进入 Renderer projection。
- `ChatRun.runId`、`clientRequestId`、Provider `run_id` 继续不可互换。Renderer 不得提交 `promptField`、`inputSchema`、release 或 routing metadata。
- Renderer 只接收 sanitized projection；不得获得 JWT、backend origin、SSE credential、download URL、absolute path 或 raw Provider event。
- `waiting-approval` 不显示允许/拒绝控件。Attachment 与 Approval decision 仍 fail-closed。
- 默认 mode 为 `expert-compat` 时 `start` 在 HTTP 前返回 `START_DISABLED_FEATURE_MODE`。Skill 失败不自动改走 Expert。

## Acceptance Criteria

1. 显式 `skill-first` 且 consumer lock 完整时，prompt-first Skill 的提交会在 `tools/call` 前进入 `pending-submit`，并以 `clientRequestId` 作为 `X-Idempotency-Key`；Catalog `callable` 蕴含 Main bind 成功。
2. `tools/call` accepted envelope 必须产生 Provider `run_id`；后续 status、SSE、result、cancel 只使用 `/api/v1/runs/{run_id}/*`。缺少 `run_id`、仅有 `task_id` 或 Hermes Task URL 时 fail-closed，且不调用 Expert cancel/start。
3. 同 session 第二个非终态 start 返回 `RUN_ALREADY_ACTIVE`；Chat 出队使用入队时的 tool/prompt/`clientRequestId` 快照，更换当前 Skill 不改变已提交或已排队请求。
4. SSE 重放使用 `Last-Event-ID` 并按 event identity 去重。SSE 连接仍打开且未终态时，bounded poll 仍能把 projection 推进到 Bundle 终态；terminal 后旧事件不能回退。
5. Cancel 只调用 Skill Run cancel，不调用 Local Chat abort；无 active run 时 fail-closed。
6. 重启后 continuation rehydrate 恢复非终态跟踪与 transcript，不发出第二次 `tools/call`。同进程 fixture 证明 idempotency。跨端 live 同 key 证明延后到 RM-01 重跑，不阻塞本 AC。
7. 最终 Result 更新同一 assistant bubble；`waiting-approval` 只读。本阶段不要求 Preview/Save As/Session Files 或 Checkpoint B 全链路通过。
8. 仓库默认 feature mode 为 `expert-compat`；该模式下 UI 提交不产生 `tools/call`。失败路径无 Expert silent fallback。Provider `run_id` 不写入 Renderer `ChatRun.runId`。
9. lifecycle/idempotency/reconnect/cancel/queue/rehydrate focused tests 与 `test:skill-run-e2e` **fixture** 通过。env-gated live 入口保留，但 RM-04 `DONE` 不以 live PASS 为前提。

## Definition of Done

1. C01/C03/C06 有 APPROVED Stage PRD、validated Plan、review PASS、implementation commit 与 focused/fixture verification；C02 的 Hermes Task Skill-Run bridge 已从生产 Skill Run 路径移除或从未合入；C04/C05 由既有 owner 的回归证据覆盖。
2. RM-01 保持 `BACKLOG`，直到后续阶段重跑 live AC-03/AC-04。RM-04 可以在 RM-01 未 `DONE` 时凭 fixture/focused 证据标记 `DONE`。不得把默认 mode 改为生产 `skill-first`。
3. 发现需要改 Bundle、File Platform identity、生产默认或 Expert 删除的工作，必须返回 RM-01、RM-05、RM-06 或独立 Removal PRD，不得混入 M3。

## Source Anchors

- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#bindPromptFirstTool`
- `apps/work/src/main/skill-run/skill-run-continuation.ts#rehydrateSkillRunContinuationsForSession`
- `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript`
- `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `contracts/skill-run/v1.2.1/fixtures/tools-call-accepted.json`
- `contracts/skill-run/v1.2.1/http/endpoint-matrix.json`
- `apps/work/lat.md/skill-run.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md#Milestone M3 — Executable Run and Recovery`
