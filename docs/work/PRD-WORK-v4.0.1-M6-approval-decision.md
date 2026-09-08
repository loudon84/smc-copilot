---
work_item_id: RM-09
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-08T09:45:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-09
grounded_commit: 44b8e2c3741cba38c862f8a28bfc625eddce5c1c
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.3.0
product_decision: user-input:2026-09-08-bundle-import-then-rm09-prd
---

# WORK PRD v4.0.1 M6c — Skill Run Approval Decision

本 Stage PRD 关闭 Roadmap RM-09：在 **已进口** 的 `SKILL-RUN-CONTRACT` v1.3.0 上，为现有 Skill Run 的 `waiting-approval` / `approval.requested` 增加 **narrow allow/deny**。Main 现有 Gateway 打 canonical decision HTTP；现有 `window.hermesAPI.skillRun` 增加狭窄决策入口；现有 `modules/skill-run` 在等待审批时出示控件。不修改 Provider Bundle 字节，不走 legacy 路径，不把 deny 改写成 Work `cancelled`，不复用 Local Chat / Hermes 审批条，不开启 Attachment。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-09` / M6c P1 Approval decision：可操作批准/拒绝卡片 |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-09` |
| Architecture | 父 PRD：IPC 最小能力在 Approval contract 完成后增加 narrow approval decision；Backend 是 Approval enforcement owner；Renderer 只收已清洗 UX；MessageList 不 switch Provider DTO。RM-08 已把 `approval.requested` 映射为只读 activity，并显式禁止决策控件。 |
| Repository baseline | `44b8e2c3741cba38c862f8a28bfc625eddce5c1c`（v1.3.0 Bundle 进口 + RM-09 READY） |
| Dependencies | RM-08 is `DONE`。v1.3.0 已将 `approval` / `approvalDecision` 标为 `supported`，并发布 canonical decision path、receipt schema 与幂等矩阵。`attachments` 与 `approvalExpiry` 仍 `unsupported`。 |
| Provider input | `contracts/skill-run/v1.3.0/`。Canonical：`POST /api/v1/runs/{run_id}/approvals/{approval_id}/decision`，header `X-Idempotency-Key`，body 仅 `decision: allow\|deny`（可选 `comment` ≤ 500）。Response 为 bare receipt。矩阵另有 **legacy** `POST .../approvals/{approval_id}`。Deny 终态：Hermes REAL_PROCESS live → Public `COMPLETED`；Local no-binding → `FAILED`；**禁止**改写成 `CANCELLED`。Receipt `status` 在 allow replay 中可为 `WAITING_APPROVAL`（accepted 不等于 Run 已推进）。 |
| Current parser | `approval.requested` → phase `waiting-approval` + activity `approvalId` / `summary`。不投影 `options`，无决策副作用。 |
| Current Gateway | 已有 Catalog / `tools/call` / snapshot / SSE / cancel / artifacts。**没有** decision HTTP。Consumer lock 任一 checksum-complete Bundle 即可开 P0 门；v1.2.1 与 v1.3.0 并存。 |
| Current IPC / UI | `SKILL_RUN_IPC_CHANNELS` 无 decision channel。`SkillRunStatusBar` 只读 activity + Cancel / artifact retry。Chat `MessageRow` 的 approve/deny 绑定 Local/Hermes Chat 动作，**不是** Skill Run 合同。 |
| Current concurrency | `waiting-approval` 非终态；同 session 第二次 start 仍 `RUN_ALREADY_ACTIVE`。 |
| Out of this Item | RM-11 Attachment；改 Bundle / v1.2.1 字节；legacy decision path；`approvalExpiry`；clarify respond；Local Chat 审批条 / Hermes `approval.respond` / `ClarifyCard`；JSON Schema 表单；组织推荐；新 Skill Chat 页；Expert start。 |

## Problem and Outcome

员工在 Skill Run 进入 `waiting-approval` 时只能看到摘要。P1 只读映射是正确的，因为当时 Bundle 把 `approval` 标为 `unsupported` 且无 endpoint。v1.3.0 已关闭 decision 合同后，若仍不出 allow/deny，审批无法在 Work 内完成。若错误地复用 Chat `MessageRow` 审批条或 Hermes `approval.respond`，决策会打到另一条合同，且可能把 deny 当成本地 cancel。

完成后：

- 仅当该 Skill Run 处于 `waiting-approval` 且 Main 已持有当前 `approval_id` 时，现有 `modules/skill-run` 出示 **Allow** 与 **Deny**。
- 用户选择后，Main 对 v1.3.0 canonical `/decision` 发送 `allow` 或 `deny`，并携带 Main 持有的 `X-Idempotency-Key`。
- 200 receipt **不**单独把 Run 标为终态；Work 继续既有 SSE / poll，按后续 Public Run / event 推进 phase。
- Deny 后的 Work 终态跟随 Public `status`（`COMPLETED` → 成功，`FAILED` → 失败）。**不得**仅因 decision=`deny` 把 phase 写成 `cancelled`。
- 同一 `(run, approval)` 重试使用同一幂等 key，得到冻结 receipt；冲突与已决策按 Bundle 错误码 fail-closed 并展示已清洗错误。
- Attachment、legacy 路径、Local Chat 审批、clarify 回答、Expert 均保持原状。

## Scope

- In: 在现有 Skill Run Gateway / Service / skill-run IPC / `modules/skill-run` 上增加 narrow allow/deny；Main 绑定当前等待中的 `approval_id` 与幂等 key；只打 v1.3.0 canonical decision；按 Bundle 映射 receipt 与后续 Public status；无 waiting-approval 时 fail-closed 不发 HTTP。
- Out: Attachment upload/refs；改 `contracts/skill-run/v1.2.1` 或 v1.3.0 Provider 文件；legacy `POST /approvals/{approval_id}`；`approvalExpiry`；可选 comment UI；clarify respond；Chat `MessageRow` / `handleApprove` / `handleDeny`；Hermes Agent `approval.respond`；新 Skill Chat 页面；第二 Session/File owner；组织推荐。
- Production Owner: `SkillRunGatewayClient` 拥有 canonical decision HTTP。`SkillRunService` 拥有「当前等待审批」绑定、幂等 key、receipt 非终态解释、错误投影。现有 skill-run IPC/Preload 拥有狭窄决策入口。Renderer `modules/skill-run` 拥有 allow/deny 展示。Backend 仍是 Approval enforcement owner。Chat / MessageList / File Platform / Expert 不拥有 Skill Run 审批。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| v1.3.0 Approval decision contract | Provider Bundle | `approval`/`approvalDecision`=supported；canonical `/decision` + receipt + 幂等矩阵已发布；legacy 路径并存 | EXISTS（external） |
| v1.2.1 Bundle | Provider Bundle | 字节冻结；`approval` 仍 unsupported；无 decision path | KEEP |
| Consumer lock / P0 gate | Skill Run consumer lock | 第一个 checksum-complete 目录即可开门；v1.2.1 与 v1.3.0 均可 complete；P0 必选路径不含 approval schema | PARTIAL（决策须证明 v1.3.0） |
| Event → waiting-approval activity | Contract parser + SkillRunService | `approvalId` + `summary`；无 options 投影；无决策 | EXISTS |
| Gateway HTTP | `SkillRunGatewayClient` | list/call/snapshot/SSE/cancel/artifacts；无 decision | PARTIAL |
| Skill-run IPC | Existing skill-run IPC | start/cancel/catalog/favorite/projection；无 decision | PARTIAL |
| Compact run UI | `SkillRunStatusBar` / `modules/skill-run` | 只读 activity + Cancel；无 allow/deny | PARTIAL |
| Start idempotency key | SkillRunService | Main 在 `tools/call` 前持久化 pending-submit key | EXISTS（可类比，禁止混用 start key） |
| Single active run | SkillRunService | 非终态（含 waiting-approval）挡第二 start | KEEP |
| Local Chat approve/deny | Chat `MessageRow` + Chat actions | Hermes/Local 危险确认，不是 Skill Run | EXISTS（禁止复用） |
| Skill clarify answer | Skill Run HTTP | matrix 仍无 respond | KEEP absent |
| Attachment | Provider capability | 仍 `unsupported` | KEEP absent |
| Expert start | Expert owners | 不因审批改变 | KEEP |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Canonical decision HTTP | Existing `SkillRunGatewayClient` | 仅 POST v1.3.0 `/decision`；必带 `X-Idempotency-Key`；body 仅合同 `allow`/`deny`；解析 bare receipt；不调用 legacy 路径 | MODIFY |
| Decision bind + idempotency | Existing `SkillRunService` | 只对当前 `waiting-approval` 的 `approval_id` 决策；Main 生成并保存该审批的幂等 key；200 receipt 不单独终态化；后续仍走 SSE/poll 与既有 Public status 映射 | MODIFY |
| Narrow decision IPC | Existing `hermesAPI.skillRun` | 输入为当前 run 标识 + `allow`/`deny`；Renderer 不传 URL、JWT、幂等 key、任意 `approval_id` | MODIFY |
| Allow/Deny presentation | Existing `modules/skill-run` | 仅 `waiting-approval` 且尚未对本 `approval_id` 提交成功时出示两按钮；文案 English-only；不出现第三决策 | MODIFY |
| Decision contract availability | Existing consumer lock + Gateway | 无 checksum-complete v1.3.0 时决策 fail-closed；不得为迁就 decision 而让 v1.2.1 因缺少 approval schema 无法开 P0 门 | MODIFY |
| Activity read mapping | Existing parser | 继续提供 `approvalId`/`summary` 与 `waiting-approval`；不必为按钮发明新 event type | KEEP |
| Cancel / artifact retry | Existing StatusBar + cancel IPC | 等待审批时 Cancel 仍走既有 Skill Run cancel，不是 deny | KEEP |
| Public status → Work phase | Existing parser/service | deny 后按 Public `COMPLETED`/`FAILED`/其它合同状态映射；禁止因 deny 改写成 `cancelled` | KEEP（语义冻结） |
| Local Chat approval bar | Chat / Hermes | 行为不变；Skill Run 决策零调用该路径 | KEEP |
| Attachment / expiry / clarify respond / Expert / Bundle bytes | 对应 Owner | 继续缺失或不变 | KEEP absent / KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Canonical decision HTTP on existing Gateway | MODIFY | 现有 Gateway 已是唯一 Skill Run HTTP owner。补 decision 方法，禁止新 client、禁止 legacy path、禁止 Renderer fetch。 |
| C02 | Current-approval bind, idempotency, receipt handling | MODIFY | SkillRunService 已是 lifecycle / start-key owner。决策 key 不得复用 `tools/call` key。Receipt 不是 Run 终态。 |
| C03 | Narrow skill-run decision IPC | MODIFY | 父 PRD 要求在现有 `skillRun` 表面增加 narrow decision，不新增平行协议。 |
| C04 | Allow/Deny on existing Skill Run UI | MODIFY | `modules/skill-run` 已展示 approval activity；Chat MessageList 不是 Owner。 |
| C05 | v1.3.0 required for decision, v1.2.1 P0 gate preserved | MODIFY | 决策合同只在 v1.3.0。P0 lock 必选路径保持不依赖 approval schema，以免 v1.2.1 fail。 |
| C06 | Parser activity + Public status mapping | KEEP | RM-08 映射与既有 phase 映射足够；本 Item 不重写 event union，不把 deny 特判为 cancel。 |
| C07 | Local Chat / Hermes approval | KEEP | 零调用；禁止把 Skill decision 接到 `handleApprove`/`handleDeny`。 |
| C08 | Attachment, expiry, clarify respond, Expert, Bundle bytes | KEEP | 分属 RM-11 / Provider / RM-08 只读 / Expert owners。 |

## Replacement / Removal Matrix

本 Item 无 REPLACE。不删除 RM-08 只读 activity。不删除 Chat `MessageRow` 审批条。不删除 v1.2.1 Bundle。不删除 Skill Run cancel。Legacy decision path **不是**兼容层：Work **不得**调用，也不为它做 REMOVE 产品入口。

## Behaviour — Narrow allow/deny

1. **Eligibility.** 仅当该 `clientRequestId` 的 projection `phase === waiting-approval`，且 Main 已有非空当前 `approval_id` 时，才出示 Allow/Deny 并接受决策。否则 IPC fail-closed，不发 HTTP。
2. **Identity bind.** Renderer 只提交当前 Skill Run 标识与 `allow`/`deny`。Main 绑定该 run 当前等待中的 `approval_id` 与已接受的 `providerRunId`。Renderer 不得指定任意 approval id、run URL 或第三枚举值。
3. **Closed enum.** 合同决策只有 `allow` 与 `deny`。不渲染 `comment` 输入（schema 可选字段本阶段不作为产品能力）。event `options` 不得扩展出合同枚举之外的按钮。
4. **HTTP.** 只打 canonical `/decision`。必须带 Main 持有的 `X-Idempotency-Key`。缺 key 不得出站。禁止 legacy `POST /approvals/{approval_id}`。
5. **Idempotency.** scope 按 Bundle：authenticated org+user + `run_id` + `approval_id`。同一审批的重试/重复点击使用同一 key。200 replay 返回冻结 receipt，不得当作第二次决策。不同 decision 撞同一 key → 按 `IDEMPOTENCY_CONFLICT` fail-closed。已决策 → `APPROVAL_ALREADY_DECIDED` fail-closed。
6. **Receipt is not terminal.** 200 且 receipt.`status` 仍为非终态（含 `WAITING_APPROVAL`）时，Work **保持**非终态，隐藏或禁用该 `approval_id` 的按钮，继续 SSE/poll。不得因为「已经点过 Allow」就把 phase 写成 succeeded/failed/cancelled。
7. **Deny mapping.** 终态只来自后续 Public Run/event（或 Bundle 已定义为终态的 snapshot）。Public `COMPLETED` → Work 成功；`FAILED` → 失败。**禁止**把 deny 改写成 `cancelled`。用户仍可用既有 **Cancel** 走 cancel endpoint；Cancel ≠ Deny。
8. **Errors.** unknown id / unauthorized / already decided / conflict / 缺 v1.3.0 lock：已清洗错误，不泄漏 JWT/origin/绝对路径；不得回退已观察到的终态。
9. **Concurrency.** 等待审批期间仍是单一 active run；不得用 decision 通道再发 `tools/call`。Allow 不是第二次 start。
10. **English-only** 新文案。

## Contract and Security Boundary

- 只消费 v1.3.0 已发布的 decision request/response、endpoint matrix、幂等与错误 fixture。不得扫描 Provider 源码补字段。
- 不得修改 `contracts/skill-run/v1.2.1/` 或 v1.3.0 中 Provider 所有、由 `SHA256SUMS` 覆盖的文件。
- Renderer 不持有 JWT、Backend origin、幂等 key、approval 内部 descriptor 全文或 raw Provider event。
- 决策 IPC 只扩展现有 `window.hermesAPI.skillRun`；不新增 raw fetch；不把决策接到 Chat / Expert / files API。
- Backend 仍是 Auth/RBAC/Policy/Approval enforcement owner；Work 按钮只是 UX。
- telemetry 若记录决策，只允许决策枚举与错误码等 M5 允许名单字段；不写 summary 全文、comment、JWT。
- Attachment / `approvalExpiry` 保持 unsupported；不得发明 upload 或过期倒计时合同。

## Acceptance Criteria

1. 处于 `waiting-approval` 且 Main 持有当前 `approval_id` 时，现有 Skill Run UI 出现 Allow 与 Deny；非该 phase 不出现这两按钮。
2. Allow：Main 对 canonical `/decision` 发送 `decision=allow` 与 `X-Idempotency-Key`；不调用 legacy 路径；不发第二次 `tools/call`。200 且 receipt 仍非终态时，projection 保持非终态并继续既有 SSE/poll。
3. Deny：发送 `decision=deny`。随后 Work 终态跟随 Public status。**不**出现「仅因 deny 而 `cancelled`」。Cancel 按钮仍走既有 cancel，不冒充 deny。
4. 同一审批重复提交使用同一幂等 key，得到与首次一致的冻结 receipt，且不产生第二次决策副作用。冲突 key / 已决策 / 未知 id / unauthorized：已清洗错误，不回退终态。
5. 非 `waiting-approval`、缺少 `approval_id`、或没有 checksum-complete v1.3.0：决策被拒绝且不发 decision HTTP。
6. Chat `MessageRow` Local/Hermes approve/deny 行为不变；本 Item 的决策路径不调用该 IPC。不声称 Attachment 或 clarify respond 已启用。不修改 v1.2.1 Bundle 字节。
7. `waiting-approval` 期间同 session 第二次 Skill start 仍被拒绝。Renderer 仍无法取得 raw Provider event 或决策 URL。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL-01 | Allow 走 canonical `/decision`，200 receipt 不单独终态化 | HTTP path/header/body 与投影 phase 可观察 | Yes | 无决策路径 | NOT_TESTED | NEW_EVIDENCE | v1.3.0 新合同 |
| CL-02 | Deny 终态跟随 Public status，不得写成 cancelled | Deny 后 phase ≠ cancelled，除非 Public 就是 CANCELLED | Yes | 无 | NOT_TESTED | NEW_EVIDENCE | RELEASE.md 显式禁止改写 |
| CL-03 | 同一审批幂等 replay / conflict / already-decided | 重复提交与错误码可观察 | Yes | Start 幂等是另一 scope | NOT_TESTED（决策 scope） | NEW_EVIDENCE | 决策 key scope ≠ tools/call |
| CL-04 | 无 waiting-approval / 无 v1.3.0 不发 HTTP | 负向：零 decision 请求 | Yes | 无 | NOT_TESTED | NEW_EVIDENCE | 新入口 |
| CL-05 | 不复用 Local Chat 审批 | Skill 决策零调用 Chat approve/deny | Yes | RM-08 证明无 decision IPC；Local 审批独立存在 | PROVEN_FRESH（Local 路径） | REUSE_EVIDENCE（Local）+ 本 Item 负向 NEW | Skill 新增控件不得接到 Chat |
| CL-06 | RM-08 activity 只读摘要仍在；本 Item 只在 waiting-approval 增加按钮 | summary 仍展示；按钮有门 | Yes | RM-08 activity mapping | PROVEN_BUT_AFFECTED | TARGETED_RERUN | RM-08 AC「无允许/拒绝控件」被本 Item 有意取代 |
| CL-07 | Attachment 仍 unsupported | 无 upload/refs 产品入口 | Yes | v1.3.0 unsupported schema | PROVEN_FRESH | REUSE_EVIDENCE | Bundle 未提升 attachments |
| CL-08 | Catalog/start/cancel/SSE/artifact 既有能力 | 回归不破坏 P0/P1 已证路径 | Yes | RM-04/05/08 证据 | PROVEN_FRESH（未改那些合同） | REUSE_EVIDENCE | 本 Item 只叠加 decision；未改 start/SSE schema |

## Definition of Done

1. C01–C05 有 Gateway / Service / IPC / Skill Run UI 的 focused 证明，并覆盖 CL-01–CL-04 与 CL-06 按钮门。C06–C08 由既有 parser、Local Chat、Bundle unsupported、start/cancel 套件回归。
2. RM-09 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。
3. 发现需要 Attachment、改 Bundle、legacy 路径、clarify respond、Chat 审批复用或把 deny 写成 cancel 的工作，必须返回对应 Item / Provider，不得混入本 Item。

## Source Anchors

- `apps/work/src/main/skill-run/skill-run-gateway-client.ts`
- `apps/work/src/main/skill-run/skill-run-service.ts`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts`
- `apps/work/src/main/skill-run/skill-run-ipc.ts`
- `apps/work/src/preload/skill-run-api.ts`
- `apps/work/src/shared/skill-run.ts`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx`
- `apps/work/src/renderer/src/screens/Chat/MessageRow.tsx`
- `contracts/skill-run/v1.3.0/RELEASE.md`
- `contracts/skill-run/v1.3.0/http/endpoint-matrix.json`
- `contracts/skill-run/v1.3.0/runs/approval-decision.request.schema.json`
- `contracts/skill-run/v1.3.0/runs/approval-decision.response.schema.json`
- `contracts/skill-run/v1.3.0/capabilities/unsupported.schema.json`
- `contracts/skill-run/v1.3.0/consumer-lock.json`
- `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md`
- `docs/work/PRD-WORK-v4.0.1-M6-skill-run-activity-adapter.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
