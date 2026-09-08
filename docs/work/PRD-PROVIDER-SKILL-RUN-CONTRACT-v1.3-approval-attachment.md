---
document_id: PRD-PROVIDER-SKILL-RUN-CONTRACT-v1.3
version: v1.0.0
status: DRAFT
audience: nodeskclaw-backend Provider Owner
consumer: smc-copilot/apps/work
target_branch: work/prd-v4.0
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1
grounded_commit: 7a169bd86435aaced5810cd299f96cd59ce4c79e
provider_contract_current: SKILL-RUN-CONTRACT v1.2.1
provider_contract_requested: SKILL-RUN-CONTRACT v1.3
does_not_activate: RM-09, RM-11
---

# Provider 需求 PRD — Skill Run Contract v1.3（Approval decision + Attachment refs/upload）

本文是 **SMC Copilot Work 交给 NoDeskClaw Provider Owner** 的合同发布需求，不是 Work 侧 RM-09 / RM-11 实施 PRD。

目的：发布一份 **不可变新 Contract Bundle**，关闭架构 PRD 的 Provider Contract Gate 第 6、9 条，使 Work 之后可以分别 Grounding RM-09（Approval decision）与 RM-11（Attachment）。在该 Bundle 被 Work 导入、checksum lock 通过之前，Roadmap RM-09 / RM-11 必须保持 `BACKLOG`，Work 不得实施可操作批准卡片或附件上传。

Provider 仓库：`loudon84/nodeskclaw`。Work 只消费发布产物，不读取 Provider 源码、分支、数据库或内部 Agent 路由。

## Evidence Baseline

| 项 | 值 |
|---|---|
| 消费方架构 | `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md`（APPROVED） |
| 消费方 Roadmap | `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` |
| 当前已锁定 Bundle | `contracts/skill-run/v1.2.1/` |
| 当前 tag / pin | `skill-run-contract-v1.2.1` → `10d38f2c97739c4a55df893d1dc954fc8896f1a7` |
| 当前 lock | `contracts/skill-run/v1.2.1/consumer-lock.json` |
| 当前矩阵 | `contracts/skill-run/v1.2.1/http/endpoint-matrix.json`（无 decision / 无 upload） |
| 当前能力声明 | `approval` / `approvalDecision` / `attachments` = `"unsupported"` |
| 已有只读事件 | SSE `approval.requested`（`approval_id` + `summary`）；Public Run 已有 `WAITING_APPROVAL` |
| 已有 Catalog 注解 | `requiresApproval` / `approvalMode` / `supportsAttachments`（布尔/字符串，不是写路径合同） |
| 已有产出文件合同 | Artifact list/download（M4 已消费）。**不是**用户输入附件 |
| Work 已映射 | RM-08 把 `approval.requested` 做成只读 activity，无 allow/deny IPC |

## 当前缺口（v1.2.1 为什么不够）

| 能力 | v1.2.1 现状 | Work 因此不能做的事 |
|---|---|---|
| Approval 通知 | 有 `approval.requested` 与 `WAITING_APPROVAL` | 只能展示摘要，不能提交决策 |
| Approval 决策 | `approvalDecision: unsupported`；矩阵无 endpoint | RM-09 不得开 Stage PRD |
| Attachment 标志 | Catalog `supportsAttachments` 默认 `false` | 不能当作 upload 合同 |
| Attachment 写路径 | `attachments: unsupported`；矩阵无 refs/upload | RM-11 不得开 Stage PRD |
| 幂等 | 仅覆盖 `tools/call` 的 `X-Idempotency-Key` | 决策/上传若无独立幂等，Work 无法安全重试 |

## 目标 Bundle

发布 **SKILL-RUN-CONTRACT v1.3**（版本号由 Provider 冻结；必须高于 1.2.1，且对 Work 标明是否 wire-breaking）。

允许两种发布策略（Work 都能消费，但必须在 manifest 里写清）：

1. **一次 tag**：同一 Bundle 同时关闭 Approval decision 与 Attachment。
2. **两次 tag**：先关闭其中一项（另一项仍 `unsupported`）。未关闭的那一项，对应 Roadmap Item 继续 `BACKLOG`。

兼容要求：

- 保留 v1.2.1 已关闭的 Catalog / `tools/call` / Public Run / Result / Artifact download / SSE `Last-Event-ID` / `tools/call` 幂等。
- 不修改 `contracts/work-expert/v1.0.2`。
- 不把 Hermes Task `/api/v1/hermes/tasks/*` 或 Agent 内部 URL 当作 Skill Run 合同。
- Public DTO 不含 org/user/internal snapshot、credential、内部绝对 URL、本机路径。
- 返回 URL 若出现，必须是 Bundle 允许的 same-origin 相对路径。

## Slice A — Approval decision（解锁 RM-09）

### A1. 能力声明

新 Bundle 必须：

- 将 `capabilities.approval` 与 `capabilities.approvalDecision` 从 `"unsupported"` 提升为可调用（不得再 `const: "unsupported"`）。
- `capabilities/unsupported.schema.json` 与 `fixtures/unsupported-capabilities.json` 同步；未交付 Attachment 时 `attachments` 可继续 `unsupported`。

### A2. Descriptor（补齐现有 `approval.requested`）

现有 payload 只有 `approval_id` + `summary`。决策合同必须冻结至少：

| 字段 | 要求 |
|---|---|
| `approval_id` | 稳定公共身份；同一 Run 内唯一 |
| `run_id` | 已接受的 Skill Run |
| `summary` | 可展示短文本；不含 secret / 内部路径 |
| `options` 或等价 | 至少支持 allow / deny；枚举关闭，Work 不得猜第三动作 |
| `expires_at` | 可选但若存在必须是 RFC3339；过期后决策必须 fail-closed |
| 超时后 Run 状态 | 必须写入 Public Run 合同（例如回到 `FAILED` / `CANCELLED` / 保持 `WAITING_APPROVAL` 直至 cancel）。不得留给 Work 猜测 |

可继续用 SSE `approval.requested` 投递 descriptor，或增加 GET descriptor endpoint；**写路径必须是独立 decision endpoint**，不得复用 `tools/call` 或 Local Chat `clarify-respond`。

### A3. Decision request / response

必须冻结：

- 请求：`run_id`、`approval_id`、决策枚举（至少 `allow` \| `deny`）、可选短 `comment`（有长度上限）。
- 响应：回显 `approval_id`、已接受的决策、生效时间、以及决策后的 Public `run_id` + `status`。
- 认证：与现有矩阵相同，`Authorization: Bearer <access-token>`。
- 禁止：Renderer 直接打该 URL；禁止返回内部 Agent URL / JWT。

推荐路径（Provider 可改，但必须写进 endpoint matrix，且不得与现有 `/cancel` 语义冲突）：

```text
POST /api/v1/runs/{run_id}/approvals/{approval_id}/decision
```

### A4. 幂等

必须与 v1.2.1 `tools/call` 同族，并单独写进矩阵：

- Header：`X-Idempotency-Key`
- Scope：至少 `authenticated org_id + user_id + run_id + approval_id`
- TTL：必须声明秒数
- 同一 key + 同一决策：重放返回原成功响应（200 + 原决策），不得二次执行副作用
- 同一 key + 不同决策：`409` + 稳定 `errorCode`（建议 `IDEMPOTENCY_CONFLICT`）
- 同一 `approval_id` 在已被终态决策后，用新 key 再决策：fail-closed（建议 `APPROVAL_ALREADY_DECIDED` 或 `409`）
- 未知 `approval_id` / 非本用户 Run / 未授权：`401`/`403`/`404`，不得创建新 Approval

### A5. 生命周期

必须在 Public Run / Result / Event 合同中写死：

1. 需要员工决策时，Run `status` 为 `WAITING_APPROVAL`（已存在）。
2. `allow` 被接受后，Run **离开** `WAITING_APPROVAL`（例如 `RESUMING` / `RUNNING`），且单调，不得被旧 SSE 事件打回等待。
3. `deny` 被接受后的终态必须枚举。Work 默认期望：`CANCELLED`（若使用新 status，必须加入 Public Run enum）。
4. 建议增加 SSE `approval.resolved`（payload：`approval_id`、决策、时间）。若暂不增加，GET `/api/v1/runs/{run_id}` 必须足以让 Work 发现已离开 `WAITING_APPROVAL`。
5. Backend 是 Approval 的最终 enforcement owner。合同不得要求 Work 在 Renderer 侧“代替后端批准”。

### A6. 必交 fixtures

至少：

- `approval-requested`（已有可升级，须含决策所需字段）
- `approval-decision-allow`
- `approval-decision-deny`
- `approval-decision-replay`（同 key 同决策）
- `approval-decision-conflict`（同 key 不同决策 → 409）
- `approval-unknown-id`
- `approval-unauthorized`
- `approval-already-terminal`（Run 已 `COMPLETED`/`FAILED`/`CANCELLED`）
- `approval-expired`（若支持 `expires_at`）

## Slice B — Attachment refs / upload（解锁 RM-11）

### B1. 能力声明

- 将 `capabilities.attachments` 从 `"unsupported"` 提升。
- Catalog `supportsAttachments: true` 只有在本 Slice 关闭后才允许被 Work 解释为“可上传”；v1.2.1 的默认 `false` 继续表示不可上传。

### B2. 与 Artifact 的边界（禁止混用）

| | 已有 Artifact（v1.2.1 / M4） | 本 Slice Attachment |
|---|---|---|
| 方向 | Run **产出** 文件 | 用户在 **start 前或 start 时** 提供的输入 |
| 身份 | `artifact_id` + `run_id` | `attachment_ref`（不得是本机绝对路径） |
| 传输 | `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}/download` | 独立 upload / ref 合同 |
| Work Owner | File Platform 消费产出 | 未来 RM-11；在合同未关前必须 fail-closed，不得静默丢弃 |

禁止：把 Artifact download 当作 upload；禁止要求 Work 把本地路径塞进 `tools/call`。

### B3. Upload 不得依赖已接受的 `run_id`

Work 的员工路径是：Catalog 选择 →（可选附件）→ `tools/call`。因此：

- **签发 `attachment_ref` 不得要求已有 Skill `run_id`。**
- 若 Provider 坚持 Run-scoped upload，必须在同一 Bundle 中给出“先开 Run 再执行 Skill”的公共合同；当前 v1.2.1 **没有** 这种预开 Run 语义，Work 不能发明。

推荐路径（可改，必须进矩阵）：

```text
POST /api/v1/attachments
```

成功响应至少：

| 字段 | 要求 |
|---|---|
| `attachment_ref` | 不透明公共引用；不是 filesystem path，不是未认证 CDN |
| `name` | 原始文件名（经清洗，无路径） |
| `size_bytes` | 整数 |
| `checksum_sha256` | 必填 |
| `content_type` | 可选；若出现必须是关闭枚举或明确 allow-list 规则 |
| `expires_at` | 未绑定 `tools/call` 前的 TTL |

认证、大小上限、类型拒绝、超额，都必须有稳定 HTTP status + `errorCode`。

### B4. 如何进入 `tools/call`

必须冻结 **一种** 绑定方式，并在 schema / RELEASE 中写死：

1. 工具 `inputSchema` 声明附件字段（类型关闭，值为 `attachment_ref` 或 ref 数组）；或
2. 保留 arguments 键（名称、基数、是否必填全部关闭）。

禁止：Work 猜测字段名；禁止未在 Catalog schema 中出现的隐藏附件通道。

`tools/call` 时未知 / 过期 / 跨用户 `attachment_ref` 必须 fail-closed，不得忽略附件继续执行（架构要求：附件未就绪时禁用并解释原因，不得静默丢弃）。

### B5. 必交 fixtures

至少：

- `attachment-upload-accepted`
- `attachment-upload-too-large`
- `attachment-upload-unauthorized`
- `attachment-upload-unsupported-type`（若有类型限制）
- `tools-call-with-attachment-ref`
- `tools-call-unknown-attachment-ref`
- `tools-call-expired-attachment-ref`
- `catalog-supports-attachments-true` / `false`

## Bundle 包装（与 v1.2.1 相同的发布形态）

新目录建议：`nodeskclaw-backend/contracts/skill-run/v1.3.0/`（最终版本号由 Provider tag 决定）。

必须包含：

1. Git tag（例如 `skill-run-contract-v1.3.0`）指向不可变 commit
2. `manifest.json`（`contractName`、`contractVersion`、`tagName`、`backendCommit`、`capabilities`、全部 artifact digest）
3. LF `SHA256SUMS`，覆盖 manifest 列出的每一个文件
4. `RELEASE.md`（相对 v1.2.1 的 additive / breaking 说明）
5. `http/endpoint-matrix.json`（method / path / header / success status / retry / cache / 幂等）
6. 本 PRD 列出的 schema 与 fixtures
7. 更新后的 `capabilities/unsupported.schema.json`

Work 导入后只会：

- 把 Bundle 放到 `smc-copilot/contracts/skill-run/<version>/`
- 写 `consumer-lock.json`（`providerRepository`、`tagName`、`tagTargetCommit`、checksum path）
- 跑现有 lock gate：缺文件、checksum 失败、identity-only lock → `contract-unsupported`

**口头确认、Provider CI 绿、或 live 环境里“看起来能批准”，都不能替代 Bundle。**

## 安全与信任边界

- 唯一 public 表面是 Bundle 矩阵中的 endpoint。
- 决策与上传都必须走已认证主体；跨 org/user 的 `approval_id` / `attachment_ref` fail-closed。
- 证据与错误信息不得包含 JWT、Authorization、prompt 正文、文件 bytes、本机绝对路径。
- Approval 的允许/拒绝由 Backend 执行；Work 只提交决策。
- Attachment bytes 若需 Work 侧 Preview，必须另给 **认证 download-by-ref** 合同；不得返回裸 URL 给 Renderer。若 v1.3 暂不提供预览下载，必须显式写 `preview: unsupported`，Work 将只保留“已附加文件名/大小”。

## Provider 验收（Bundle 可被 Work 进口的条件）

1. 新 tag 可解析到单一 commit；manifest 与 LF `SHA256SUMS` 一致。
2. Slice A 和/或 Slice B 的能力声明、矩阵、schema、fixtures 齐全；未交付的 Slice 仍明确 `unsupported`。
3. 不删除或改坏 v1.2.1 已交付的 Catalog discriminator、Public Run、Artifact download、SSE replay、`tools/call` 幂等。
4. Public DTO 无内部 snapshot / credential / 内部 URL。
5. 幂等 replay / conflict fixtures 可离线执行。
6. 提供一份 **受控 public backend** 说明（base URL 不写入本仓）：哪些 fixture 可在 live 重放。live 不是合同本身，但是 Work 日后 RM-09/RM-11 验收会用到。

## 明确不在本需求内

- Work 实施 RM-09 / RM-11（卡片、IPC、File Platform 上传 UX）
- 把 Roadmap RM-09 / RM-11 标为 `READY` 或 `DONE`
- 修改 Work Expert 合同或 Runtime Chat 合同
- 组织推荐 Catalog、通用 JSON Schema 表单引擎、clarify-respond
- Provider 源码级设计文档（Work 不消费）

## Work 在收到 Bundle 之后会做什么（供 Provider 排期，不在本次交付）

1. 导入 Bundle + consumer-lock。
2. 仅当 Slice A 关闭时，开 RM-09 Stage PRD（narrow decision IPC；Chat 不成为 Approval owner）。
3. 仅当 Slice B 关闭时，开 RM-11 Stage PRD（File Platform 为字节 Owner；Skill Run 只传 `attachment_ref`）。
4. 未关闭的 Slice 继续 fail-closed。

## 建议回传给 Work 的清单

发布时请同时给出：

- tag 名与 target commit
- Bundle 目录树
- `SHA256SUMS`
- `RELEASE.md` 中 Slice A / Slice B 是否关闭
- endpoint matrix 里新增行的原文
- 上述 fixtures 文件名

Work 联系面：`smc-copilot` 仓库 `apps/work` Skill Run consumer-lock owner。合同目录一旦 pin，以 checksum 为准，不以 Provider 后续 commit 为准。
