---
work_item_id: NODESKCLAW-SKILL-RUN-CONTRACT-BUNDLE-M0
version: v1.0.1
status: DRAFT
target_branch: main
review_verdict:
approved_at:
source_revision: AD-SKILL-AGENT-V16@1.1.0 + WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/M0 + review:2026-09-01-initial-blocked
grounded_commit: c8af60fca608bdf0811d896290cf57b03597188e
---

# NoDeskClaw PRD v1.0.1 — Skill Run Consumer Contract Bundle（消费合同包）

本文件是消费端转移稿的 Grounding revision（需求校准修订）。它冻结：P0（当前阶段）Consumer Contract Bundle（消费合同包）已经由 NoDeskClaw 以不可变 Git tag（版本标签）发布；本条目 **不授权** 新建平行合同包、平行生成链，或改写已 tag 的 v1.0.0 字节。Work（工作端）导入已发布目录是仓外 Consumer（消费者）动作，不是本仓 Stage PRD（阶段需求）的完成条件。

## Governance status（治理状态）

本文件 **不是** NoDeskClaw 现行 Roadmap 的可实施 Stage PRD。

- 现行 Architecture（架构决策）：`AD-SKILL-AGENT-V16@1.1.0`
- 外部 Work Skill-first Consumer Contract（技能优先消费合同）的唯一后续 Item（交付项）是 **RM-09**，状态 `BACKLOG`，依赖 RM-08
- 现行 `IN_PRD` 项是 RM-04、RM-05，各已有唯一 Stage PRD
- 因此 `work_item_id: NODESKCLAW-SKILL-RUN-CONTRACT-BUNDLE-M0` 不能挂到任何 READY Item；`status` 保持 `DRAFT`，**不得** 进入 `REVIEW_REQUIRED` / Plan / Execute

剩余 OPEN BLOCKER（阻断项）只有 G1。G2–G6 由本 revision 关闭。关闭 G1 需要 Architecture/Roadmap 把 RM-09 提前为 READY，或确认 Work 只导入现有 tag 而不再需要本仓 Stage PRD。

## Evidence Baseline

| Item | Value |
|---|---|
| Consumer repository（消费端仓库） | `smc-copilot` |
| Consumer `grounded_commit`（本文件所在仓基线） | `c8af60fca608bdf0811d896290cf57b03597188e` |
| Provider repository（提供方仓库） | NoDeskClaw |
| Provider capability baseline（能力事实基线） | `21bdc38afc44a780659f3d589daf37bdf6c47328`（`Merge tag 'skill-run-contract-v1.0.0'`） |
| Architecture / Roadmap | `AD-SKILL-AGENT-V16@1.1.0` / `ROADMAP-SKILL-AGENT-V16@1.1.0` |
| P0 release tag（发布标签） | `skill-run-contract-v1.0.0` |
| Tag peeled commit（剥皮后提交） | `3e345519bcfa606553893234b59fb607ee57ac8a` |
| Manifest `backendCommit`（实现提交，I/R 协议中的 I） | `6afab6fbf4574c0458ec4fc809a2dc1f88482c9e` |
| Provider export path（提供方导出路径） | `nodeskclaw-backend/contracts/skill-run/v1.0.0/` |
| Consumer import path（消费端导入路径） | `smc-copilot/contracts/skill-run/v1.0.0/` |
| Consumer gate（消费端门禁） | Work 目录目前只有 `consumer-lock.json` 与 `SHA256SUMS`；摘要与 Provider 发布物一致，缺的是文件导入 |
| Evidence freshness（证据新鲜度） | 对本文件所在仓：`REUSE`。本 revision 复用 initial review 对 Provider tag/目录的抽查，不对 Work 源码做 full Grounding |

`consumer-lock.json` 是 Work 持有的 pin（锁定），指向已有 tag；它不是 Provider Bundle 的必选发布产物。

## Problem and outcome（问题与结果）

Work 的 fail-closed consumer-lock（失败关闭的消费锁定）要求完整、可离线校验的 Bundle。消费端观察到目录不完整，但 Provider 侧 **已经** 发布完整 P0 包：tag `skill-run-contract-v1.0.0` 剥皮到 `3e345519`，与 Work lock 的 `tagTargetCommit` 一致，且该 commit 含 schemas（模式）、endpoint-matrix（端点矩阵）、fixtures（固定样例）、`manifest.json` 与 LF `SHA256SUMS`。

本文件的结果不是「再发布一个 Bundle」，而是：

1. 冻结现有 v1.0.0 为 P0 唯一消费合同；
2. 禁止把 Work 导入/IPC（进程间通信）测试写进本仓 DoD（完成定义）；
3. 把 endpoint-matrix 中未写明的 per-endpoint error mapping（逐端点错误映射）、same-origin（同源）、reconnect limit（重连上限）、polling fallback（轮询回退）标为现有包 PARTIAL，并 **排除出本条目范围**（若需要，走 RM-09 新合同版本，禁止原地改写 v1.0.0）。

## Scope（范围）

本 revision 只冻结下列可观察事实：

- P0 Bundle 身份：tag `skill-run-contract-v1.0.0`、peeled `3e345519`、LF checksum（校验和）完整的 v1.0.0 目录；
- 员工公共面仍是 Backend `/api/v1/mcp` 与 `/api/v1/runs/*`；Agent 仍是 Run 事实源；
- Catalog `capabilityKind: "skill"`、幂等头、SSE `Last-Event-ID`、unsupported Approval/attachments、Artifact 公共描述符均已存在于该包；
- `consumer-lock.json` 归 Work；本仓不新增第二份 lock 作为发布物。

明确不在本条目实施：

- 任何 NoDeskClaw 代码、新合同版本、新生成链、改写 v1.0.0 已发布字节；
- Work 导入、Work 测试、Work UI/IPC；
- RM-09 的 Skill-first 增量合同；v1.1.0 / v1.2.0 已发布内容保持只读，不得为了 P0 unsupported 而回写删除。

## Non-goals（非目标）

- 不导出实现源码、私有 Agent 路由、数据库、内部 URL、凭证、JWT 或可复用下载 token。
- 不让 Work 成为 Agent 客户端、路由选择器或 Provider Run 事实源。
- 不修改 `work-expert/v1.0.2`。
- 不把 live 环境当 schema discovery（模式发现）通道。
- 不在 P0 包中新增 Approval、attachments 或 rich activity（丰富活动）事件；也不删除已经独立发布的 v1.2.0 语义事件合同。
- 不创建平行 `work_item_id` 去抢 RM-04 / RM-05 / RM-09 的 Stage PRD 槽位。

## Current Capability Inventory

能力事实以 Provider commit `21bdc38afc44a780659f3d589daf37bdf6c47328` 与 tag peel `3e345519` 为准。Grounding Result 只使用 EXISTS / PARTIAL / MISSING / CONFLICT。

| Capability | Current State | Production Owner | Evidence | Grounding Result |
|---|---|---|---|---|
| Skill Run v1.0.0 合同包与不可变 tag | EXISTS | `nodeskclaw-backend` Skill Run Contract Package | `skill-run-contract-v1.0.0` → `3e345519`；`nodeskclaw-backend/contracts/skill-run/v1.0.0/{manifest.json,SHA256SUMS}` | KEEP；禁止第二套发布 Owner |
| P0 schemas / matrix / fixtures | EXISTS | 同上 | tag 树含 C02 所列 Provider 产物（不含 `consumer-lock.json`） | KEEP |
| Catalog `capabilityKind: skill` | EXISTS | 同上 + MCP Gateway | `mcp/tools-list.response.schema.json` 将 `capabilityKind` 常量为 `"skill"` 且 required | KEEP |
| tools/call 接受投影与 `run_id` | EXISTS | Backend MCP Gateway / Run API | `mcp/tools-call.response.schema.json` `structuredContent.run_id` | KEEP |
| 客户端路由字段拒绝 | EXISTS | Backend MCP Gateway | Architecture / RM-01：员工不得提供 Runtime Route；既有 Gateway fail-closed | KEEP 运行时边界。请求 schema 的 `params.additionalProperties: true` 不在本条目修改 |
| Run / Result / cancel / SSE / Artifact 公共投影 | EXISTS | Backend Skill Run API；Agent 为 Run SoT | `runs/public-run.schema.json`、`runs/result.schema.json`、artifact schemas、`events/run-event.schema.json`、endpoint-matrix 路径 | KEEP |
| 幂等与 SSE replay | EXISTS（矩阵语义 PARTIAL） | Backend Skill Run API | matrix 已有 `X-Idempotency-Key` scope/TTL/409/replay 与 `Last-Event-ID`；fixtures `idempotency-replay.json`、`sse-resume-duplicate.json`。matrix 未声明 per-endpoint error mapping、same-origin、reconnect limit、polling fallback | KEEP 已发布语义。PARTIAL 缺口 **不在本条目 MODIFY**，留给 RM-09 新版本 |
| 租户安全错误包 | EXISTS | Backend 鉴权 / 公共 API | `fixtures/auth-tenant-denial.json` | KEEP |
| P0 unsupported Approval / attachments | EXISTS | Contract Package | `capabilities/unsupported.schema.json`、`fixtures/unsupported-capabilities.json` | KEEP |
| v1.1.0 / v1.2.0 合同包 | EXISTS | 同一 Contract Package | `nodeskclaw-backend/contracts/skill-run/v1.1.0/`、`v1.2.0/` | KEEP 只读；禁止为 P0 回写 |
| Work consumer lock | EXISTS（仓外） | Work contract owner | `smc-copilot/contracts/skill-run/v1.0.0/consumer-lock.json` 已指向 `3e345519` | KEEP external；本仓 DoD 不含导入 |
| Provider Run 事实源 | EXISTS | `nodeskclaw-agent` | Architecture：Agent 唯一终态裁决者 | KEEP |
| RM-09 Skill-first 消费合同增量 | MISSING as READY item | Backend Contract Package（未来） | Roadmap RM-09 = BACKLOG | 不在本条目 ADD |

## Target End-State Inventory

本条目的目标终态等于当前已发布 P0 终态。无新 Production Owner。

| Capability | Target behaviour | Production owner | Classification |
|---|---|---|---|
| P0 Consumer Contract Bundle | 继续以 tag `skill-run-contract-v1.0.0` / peeled `3e345519` 为唯一 P0 发布物 | Backend Skill Run Contract Package | KEEP |
| 员工公共 API | 仅认证、租户范围内的 Catalog / tools/call / Run / Result / SSE / Artifact 投影 | Backend Skill Run API + MCP Gateway | KEEP |
| Run 事实源 | Agent 保持远端权威状态；Backend 只代理 | Agent | KEEP |
| Work lock / 导入 | Work 自行复制 tag 树并校验；失败保持 fail-closed | Work（仓外） | KEEP external |
| 矩阵 PARTIAL 字段 | 若未来需要，用新合同版本表达 | Backend Contract Package via RM-09 | 本条目不实施 |

## Change Classification

全部为 KEEP。无 ADD / MODIFY / REPLACE / REMOVE。因此无 Replacement / Removal Matrix。本表与正文 Change ID 一一对应。

| Change ID | Capability | Classification | Decision |
|---|---|---|---|
| C01 | 不可变发布身份与完整性 | KEEP | 沿用 tag `skill-run-contract-v1.0.0`、peeled `3e345519`、`manifest.json`、LF `SHA256SUMS`。I/R：实现提交 `6afab6fb`，冻结提交 `3e345519`。 |
| C02 | P0 机器可验证产物集 | KEEP | 沿用 tag 内已有 schemas、matrix、fixtures。Provider 产物集 **不含** `consumer-lock.json`。 |
| C03 | Catalog 与 tools/call 公共合同 | KEEP | 沿用 `capabilityKind: "skill"` 与已发布 request/response schema；不另起 MCP 表面。 |
| C04 | Run / Result / cancel / SSE 生命周期合同 | KEEP | 沿用 public-run、result、run-event 与 matrix 已声明路径。 |
| C05 | 幂等与恢复 | KEEP | 沿用 matrix 已发布的 key/scope/TTL/conflict/replay。 |
| C06 | 鉴权、租户与公共数据边界 | KEEP | 沿用认证公共面与 `auth-tenant-denial` fixture；不泄漏 Agent 内部。 |
| C07 | Artifact 公共合同 | KEEP | 沿用 artifact-list / descriptor / download schema。 |
| C08 | P0 明确不支持的能力 | KEEP | 沿用 unsupported schema；不把 v1.2.0 rich activity 回写进 P0，也不删除 v1.2.0。 |
| C09 | Fixtures 与发布校验 | KEEP | 沿用已发布 fixtures 与 checksum；不再为 P0 重新打 tag。 |

### C01 — Immutable release identity（不可变发布身份）

P0 身份已经发布。Work lock 必须继续指向 peeled `3e345519`，而不是分支名或 live 响应。不得创建第二个 `skill-run-contract-v1.0.0`，也不得移动该 tag。

### C02 — Required P0 artifact set（P0 产物集）

Provider Bundle 的权威清单以 tag 内 `manifest.json` 与 `SHA256SUMS` 为准。Work 完整性检查可额外要求目录内存在其自己的 `consumer-lock.json`；该文件由 Work 生成，不进入 Provider `SHA256SUMS`。

### C03 — Catalog and Tool-call（目录与工具调用）

`tools/list` 的可调用 Skill 条目必须带 `capabilityKind: "skill"`。这已由 v1.0.0 schema 冻结。`tools/call` 接受后返回 Provider `run_id`。禁止客户端路由字段是既有 Gateway 行为；本条目不改 request schema。

### C04 — Run, result, cancellation, events（运行生命周期）

公共 DTO 使用 Provider `run_id`。事件是带 `event_id` / `event_seq` 的判别联合。终态不得回退。SSE 已声明 `Last-Event-ID`。same-origin / reconnect / polling 不在本条目扩展。

### C05 — Idempotency（幂等）

沿用已发布的 `X-Idempotency-Key`：scope 为认证后的 org + user + tool，TTL 86400 秒，冲突 409 `IDEMPOTENCY_CONFLICT`，replay 返回原 `run_id`。

### C06 — Authorization and public-data boundary（鉴权与公共数据边界）

Catalog / call / Run / Result / SSE / Artifact 继续先鉴权再返回。跨租户安全错误包不得证明 Run 存在或泄漏内部拓扑、凭证、内部 URL。

### C07 — Artifact contract（产物合同）

沿用 Run 作用域的 list/descriptor/download。授权每次访问复核。产物发现失败不得把成功 Run 改写成失败 Run。该语义已在 P0 包中表达；本条目不新增 Artifact Owner。

### C08 — Unsupported P0 capabilities（P0 不支持能力）

沿用 `approval` / `attachments` = `unsupported`。P1 rich activity 若出现在更新合同版本中，不得被本 P0 文件要求删除。

### C09 — Fixtures and release verification（样例与发布校验）

已发布 fixtures 保持 schema-valid 与脱敏。本条目不要求再次跑发布打 tag。checksum 或 CRLF 失败仍使 **既有** 发布校验失败；那是既有生成链 KEEP 行为。

## Acceptance Criteria

本条目无 NoDeskClaw 实施变更。AC 只证明 KEEP 事实，不把 Work 仓内测试当作本仓通过条件。

1. `git show-ref --dereference skill-run-contract-v1.0.0` 的 peeled commit 仍是 `3e345519bcfa606553893234b59fb607ee57ac8a`。
2. 该 commit 中 `SHA256SUMS` 为 LF-only，列出的每个 Provider 文件摘要匹配文件字节；缺文件、重复条目、CRLF 或摘要不匹配即视为发布物损坏，而不是「尚未发布」。
3. `tools-list.response.schema.json` 继续要求 `capabilityKind` 常量为 `"skill"`。
4. `tools-call.response.schema.json` 的接受投影继续包含 Provider `run_id`。
5. endpoint-matrix 继续声明 `X-Idempotency-Key` 的 scope / TTL / 409 conflict / replay 原 `run_id`。
6. endpoint-matrix 继续为 SSE 声明 `Last-Event-ID`；重放不得被解释为允许创建第二个 Provider Run。
7. `fixtures/auth-tenant-denial.json` 继续作为跨租户/未授权的安全错误样例。
8. Artifact list/descriptor/download schema 继续存在于同一 Bundle，且不含可复用下载 token 字段作为公共合同。
9. `capabilities/unsupported.schema.json` 继续把 approval 与 attachments 标为 `unsupported`。
10. 本仓 DoD 不要求 `smc-copilot` 导入、Work IPC 或 Work 端到端测试通过。
11. 不存在第二个 P0 合同目录或第二个 `skill-run-contract-v1.0.0` tag 作为本条目产出。
12. v1.0.0 已发布 checksum 与文件字节保持不变。

## Definition of Done（完成定义）

本 DRAFT **没有** 可关闭的 NoDeskClaw 实施 DoD。在 G1 仍 OPEN 时不得声称本 Stage 完成。

可独立于本文件发生的仓外动作（不构成本仓 DONE）：Work 从 peeled `3e345519` 复制完整 `nodeskclaw-backend/contracts/skill-run/v1.0.0/` 文件到 `smc-copilot/contracts/skill-run/v1.0.0/`，保留其 `consumer-lock.json`。

## Dependencies, risks, and handoff（依赖、风险与交接）

| Item | Owner | Required action |
|---|---|---|
| G1 READY Item | Architecture / Roadmap owner | 要么确认无需本仓 Stage PRD（Work 只导入现有 tag），要么经 Architecture revision 让 RM-09 或等价 Item 成为 READY 后再 `smc-prd-grounding discover` |
| 已发布 P0 包 | Backend Contract Package | KEEP；禁止平行包 |
| 矩阵 PARTIAL 增量 | RM-09（BACKLOG） | 若 Work 需要 error mapping / polling / reconnect 的机器可验证字段，用新合同版本，不改 v1.0.0 |
| Work 导入 | Work contract owner | 仓外复制 tag 树；失败保持 fail-closed |
| Expert removal | Work Expert owner | 不在本文件 |

主要失败模式：把「Work 目录缺文件」当成「Provider 未发布」，从而 ADD 第二套 Bundle。缓解：以 peeled tag 树为唯一 P0 输入。

## Source anchors（源锚点）

Provider（本 revision 能力事实）：

- `docs_agent/architecture/AD-SKILL-AGENT-V16.md#Ownership & Boundaries`
- `docs_agent/roadmaps/ROADMAP-SKILL-AGENT-V16.md` RM-09
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/manifest.json`
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/SHA256SUMS`
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/http/endpoint-matrix.json`
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/mcp/tools-list.response.schema.json`
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/mcp/tools-call.response.schema.json`
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/capabilities/unsupported.schema.json`
- `nodeskclaw-backend/app/schemas/skill_run/constants.py`

Consumer（门禁观察，非本仓 Owner）：

- `smc-copilot/contracts/skill-run/v1.0.0/consumer-lock.json`
- `smc-copilot/docs/nodeskclaw/reviews/prd-nodeskclaw-v1.0-skill-run-contract-bundle-initial-review.md`

## Revision closure（修订关闭表）

| Finding | Severity | This revision |
|---|---|---|
| G1 无 READY Roadmap Item / 平行 M0 | BLOCKER | **仍 OPEN**。status 保持 `DRAFT`。不进入 `REVIEW_REQUIRED`。 |
| G2 已发布包被写成 ADD | BLOCKER | CLOSED。Inventory 改为 EXISTS → KEEP；禁止平行 Owner。 |
| G3 Work 验收写入本仓 DoD；lock 当作 Provider 产物 | BLOCKER | CLOSED。DoD/AC 剔除 Work 测试；`consumer-lock.json` 归 Work。 |
| G4 Change ID 表体不一致；VERIFY/ADD | MAJOR | CLOSED。C01–C09 表与正文对齐；合法 Grounding Result；全 KEEP。 |
| G5 矩阵缺口当成新边界 | MAJOR | CLOSED。缺口标 PARTIAL 并排除本条目；公共面仍是 `/api/v1/mcp` 与 `/api/v1/runs/*`。 |
| G6 AC 绑定错误 ADD | MAJOR | CLOSED。AC 只锁已发布 tag/schema/matrix 的 KEEP 行为。 |
| Minor：锚点只在 Work | MINOR | CLOSED。补 Provider 锚点。 |
| Minor：I/R 两提交未区分 | MINOR | CLOSED。C01 写明 `6afab6fb` vs `3e345519`。 |
| Minor：P1 rich activity vs v1.2.0 | MINOR | CLOSED。禁止回写删除 v1.2.0。 |

## Next skill

不要跑 `smc-prd-converge`。不要对本 DRAFT 跑 `smc-prd-review` 期望 PASS。先关闭 G1：

1. Work 导入现有 `skill-run-contract-v1.0.0` 树以解开消费端 M0 gate；或
2. Architecture/Roadmap 使 RM-09（或经批准的更早合同导出 Item）变为 READY 后，再对新的 NoDeskClaw Stage PRD 做 `smc-prd-grounding discover`。
