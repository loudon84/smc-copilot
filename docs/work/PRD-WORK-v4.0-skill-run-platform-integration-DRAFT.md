---
work_item_id: WORK-SKILL-RUN-V4.0
version: v4.0.0-draft
status: REVIEW_REQUIRED
target_branch: work/prd-3.0
review_verdict: PASS
review_scope: architecture_closure
reviewed_at: 2026-08-26
approved_at:
grounding_mode: revision
source_commit: c10ae2fdc9bd7d286d828836c80fcbc2debb6257
provider_repo: E:/git/nodeskclaw
provider_commit: ddd427c3caaa74ac6f05fb24cc750416aba1934d
provider_contract: SKILL-RUN-CONTRACT v1.0.0 (unreleased)
implementation_gate: BLOCKED_ON_PROVIDER_CONTRACT
supersedes: WORK-EXPERT-UI-V3.2
---

# WORK PRD v4.0 — Skill-First Skill Run Platform Integration

本文定义 `apps/work` 对 NoDeskClaw Skill Platform 的工程级消费方案。用户从 Chat 直接选择并调用已发布 Skill；Work 不再以 Expert slug、HermesTask 或 Agent Profile 作为员工生产调用身份。

本文是对 `PRD-WORK-v3.2-skill-first-expert-ui-DRAFT.md` 的架构修订。v3.2 的 UI 意图继续保留，但“只修改现有 Expert owner、继续发送 `expertSlug + skillName`”不再成立。由于调用身份、合同族、生命周期对象和接口全部改变，本方案升为 v4.0，而不是继续增加 v3.2 补丁版本。

独立 architecture closure review 已通过；`REVIEW_REQUIRED` 表示产品 Open Gates 和跨仓合同 Owner 确认尚未完成，本文仍不能进入实现。`BLOCKED_ON_PROVIDER_CONTRACT` 表示即使本文完成最终批准，在 NoDeskClaw 发布完整且带 tag 的 Skill Run 合同之前，也不得生成生产实施计划。

## 1. 执行摘要

目标调用链冻结为：

```text
apps/work Renderer
  → SkillSelection { toolName }
  → Main skill-run IPC
  → nodeskclaw-backend POST /api/v1/mcp
  → Backend Auth / RBAC / published SkillRelease / Policy / Routing
  → nodeskclaw-agent internal Run execution
  → nodeskclaw-backend /api/v1/runs/* authenticated projection
  → Work Main SkillRunService
  → Chat projection + File Platform
```

关键决定：

1. Work 只连接 `nodeskclaw-backend`，绝不直连 `nodeskclaw-agent`。
2. 新员工调用身份是 `tool_name`；执行身份是 `run_id`。
3. 新增独立 `skill-run` 消费面；不得把两套 wire contract 塞进 `expert-run-service.ts` 的条件分支。
4. `WORK-EXPERT-CONTRACT v1.0.2` 保持 checksum 冻结，只用于旧任务续接和限时兼容。
5. Skill-first Picker 使用新合同中的平面 Tool Catalog 和服务端 `category`，不再由 Expert Catalog 投影分类。
6. Main 进程继续拥有网络、JWT、SSE（服务端推送）、Run 状态机和 Artifact 下载；Renderer 只持有展示投影。
7. Provider 合同未冻结前，不实现 approval、result、artifact、event payload 的猜测性 parser。

## 2. 权威依据与指令优先级

冲突时按以下顺序处理：

1. `smc-copilot/AGENTS.md`、`apps/work/AGENTS.md`；
2. 已发布并带 checksum/tag 的 Consumer Contract；
3. 已批准 NoDeskClaw Skill Platform PRD 与架构决策；
4. 两仓当前生产源码和 `lat.md`；
5. 本文修订的 v3.2 DRAFT；
6. 附件或讨论中的建议类型、目录和 UI 草图。

本次事实基线：

- Work：branch `work/prd-3.0`，commit `c10ae2fdc9bd7d286d828836c80fcbc2debb6257`。
- NoDeskClaw：commit `ddd427c3caaa74ac6f05fb24cc750416aba1934d` 加当前未提交 Skill Platform 工作树。
- Provider 目标：`docs_agent/prd-skill-platform-v1.0.md`、`lat.md/decisions/skill-platform-execution.md`。
- Provider 草拟合同：`nodeskclaw-backend/contracts/skill-run/v1.0.0/`。
- Work 旧合同：`contracts/work-expert/v1.0.2/consumer-lock.json`。

## 3. Grounding 结论

### 3.1 已确认的 Provider 目标

- 员工唯一 MCP（模型上下文协议）入口为 `POST /api/v1/mcp`。
- `tools/list` 只返回 published Skill Tool 和 Public Connector Tool。
- Work 不传 `agent_alias`、`profile`、`workspace_id`、Runtime 地址或凭证。
- `tools/call` 默认异步返回 `run_id` 和 `/api/v1/runs/*`。
- Run/Event/Artifact 的执行事实源属于 `nodeskclaw-agent`；Backend 仅做员工鉴权代理。
- 新 Work 不使用 `/expert/mcp/{slug}`、`/hermes/mcp/{profile}` 或 `/hermes/tasks/*`。
- 高风险 Run 可进入 `WAITING_APPROVAL`，批准后进入 `RESUMING`。
- SSE 使用稳定事件 ID，支持 `Last-Event-ID` 续传。

### 3.2 当前 Provider 合同仍不满足消费条件

当前 `SKILL-RUN-CONTRACT v1.0.0` 只能作为设计输入，不能作为已发布事实：

1. 合同目录、`nodeskclaw-agent/` 和 Backend `/runs` 路由仍在 NoDeskClaw 未跟踪工作树中。
2. Git 中尚无 `skill-run-contract-v1.0.0` tag。
3. `runs/*.schema.json` 未进入 `manifest.json` 与 `SHA256SUMS`。
4. 缺少 Run Result 响应 schema、Artifact List envelope schema 和 Artifact 下载响应约束。
5. `RunEvent.event_type` 与 `payload` 未枚举，Work 无法建立确定性 reducer。
6. Approval 只有布尔 annotations 和状态，没有 `approval_id`、审批请求 descriptor、决策请求/响应 schema。
7. `event_stream` fixture 带 query token，但 Backend 当前实现使用登录 JWT；鉴权语义未冻结。
8. Attachment refs、通用结构化 Tool 参数和错误重试语义未形成完整 Consumer Contract。
9. 当前 `run.schema.json` 是 Agent 内部 RunRecord，包含 `org_id/user_id/snapshot/attempt_id/runtime_policy/placement`，不应成为 Work 公共响应合同。
10. Backend 员工 MCP 链路尚未冻结 `X-Idempotency-Key` 的转发、作用域、TTL、冲突和按 key 重放 Accepted 语义。
11. 只有 JSON schema 文件，没有覆盖 method/path/header/status/error/cache/retry/SSE race 的可执行端点合同。

因此本文把这些内容列为 Provider Gate，而不是在 Work 侧补写私有假合同。

## 4. 相对 v3.2 必须改变的设计

| v3.2 设计 | 新架构事实 | v4.0 决定 |
|---|---|---|
| 只 MODIFY 现有 Expert Context owner | 新 Work 必须消费独立 Skill Run 合同 | ADD `skill-run` owner；Expert 转为 compatibility owner |
| 调用身份仍是 `(expertSlug, skillName)` | 新员工调用只认 `tool_name` | REPLACE 为 `SkillSelection.toolName` |
| `POST /api/v1/expert/mcp/{slug}` | 员工唯一入口是 `POST /api/v1/mcp` | REPLACE Gateway path |
| Accepted 返回 `task_id` | 新合同返回 `run_id` | REPLACE 生命周期身份 |
| 查询 `/hermes/tasks/*` | 新合同使用 `/api/v1/runs/*` | REPLACE 状态、事件、结果、取消、审批路径 |
| Category 投影自 Expert displayName | 新合同明确提供 Tool `category` | REPLACE Category 来源；null 进入本地“其他”分组 |
| 禁止新增 `SkillRunRequest` / Skill IPC | 新 wire contract 与旧 Expert 不兼容 | ADD 独立 shared DTO、IPC、Preload 和 Main service |
| `canSilentCallExpertSkill` 双层门禁 | 新 Catalog 已按 published、RBAC 和可见性过滤 | REMOVE 新路径对 Expert callability 的依赖；Backend `tools/call` 仍最终授权 |
| `ExpertRunProjection.taskId` | Run 是一级对象 | ADD `SkillRunProjection.runId`，不复用 task 字段别名 |
| Expert 私有 Artifact descriptor | Work 只认统一 `ArtifactDescriptor` | ADD Skill Run Artifact Adapter；复用 File Platform，不复用 Expert wire type |
| approvalMode 非 auto 直接拒绝 | 新架构要求高风险审批状态机 | ADD WAITING_APPROVAL UI，但以完整 Approval Contract 为前置 |
| v1.0.2 是唯一 Consumer lock | 新语义必须走新合同族 | ADD `contracts/skill-run/v1.0.0` consumer lock；旧合同不修改 |

## 5. 目标、范围与非目标

### 5.1 产品目标

- 用户按分类浏览已发布 Skill，一次选择后直接从 Chat 发起。
- 用户不需要理解 Expert、Agent、Runtime、Docker、Profile 或 Gateway。
- 执行状态、审批、取消、结果和产物都围绕同一个 `run_id` 展示。
- 网络中断或应用重启后可恢复 Run 跟踪，不重复创建执行。
- 新旧合同迁移期间，旧任务可继续完成，但新调用不会在两套后端之间静默切换。

### 5.2 P0 Scope

- Skill Run Consumer Contract 导入与 checksum lock。
- 平面 Skill Catalog、Category/Search、SkillSelection。
- Prompt-first Skill 调用和稳定幂等键。
- Run SSE、Last-Event-ID、状态轮询 fallback、取消、durable pending-submit 和重启续接。
- WAITING_APPROVAL 展示及审批操作，前提是 Provider Approval Contract 完整。
- Run Result 投影。
- ArtifactDescriptor → File Platform → Chat/Session Files。
- Feature mode、兼容旧 Expert 在途任务、灰度与回滚。
- 安全 URL 校验、JWT 隔离、错误清洗和基础遥测。

### 5.3 P1 Scope

- 基于 `inputSchema` 的结构化 Tool 参数表单。
- Public Connector Tool 的完整非 prompt 参数调用。
- Tool 收藏、最近使用和组织级推荐。
- 更丰富的标准 RunEvent 映射；必须先有 Provider payload schema。

### 5.4 明确不做

- Work 直连 `nodeskclaw-agent` 内部 API。
- Work 选择 Runtime、Agent、Profile、Installation、Edge Node 或 Connector Route。
- 修改 `contracts/work-expert/v1.0.2/`。
- 把 Skill Run 当成 Runtime ChatRun；不得复用 `apps/work/src/main/run-stream.ts` 的 `/v1/runs/*` 语义。
- 把不透明 `run.progress` 猜成 Reasoning 或 ToolActivity。
- 在 Renderer 保存 JWT、服务 URL、SSE token 或 Artifact 下载 URL。
- 在 Provider 合同缺失时由 Work 自行发明 event、approval、result schema。
- 改造本地 Hermes bundled Skills 管理页 `screens/Skills`。
- 把 Skill Run 执行并入 `services/runtime`；Work 仍直连 NoDeskClaw Backend 数据面。

## 6. Target End-State Inventory

| Capability | Target Production Owner | Target Behaviour | Classification |
|---|---|---|---|
| Skill Catalog HTTP | Main `SkillRunGatewayClient` | `POST /api/v1/mcp` `tools/list`；JWT；TTL cache | ADD |
| Skill 调用 | Main `SkillRunGatewayClient` | `tools/call`；`tool_name` + arguments + 幂等键 | ADD |
| Run lifecycle | Main `SkillRunService` | pending-submit、SSE、poll、cancel、approve、result、artifact discovery | ADD |
| Skill DTO / IPC contract | `src/shared/skill-run.ts` | Renderer-safe DTO；不包含内部路由和凭证 | ADD |
| IPC / Preload | `skill-run-ipc.ts` / `skill-run-api.ts` | 狭窄 handler、sender validation、projection push | ADD |
| Renderer projection store | `modules/skill-run/store.ts` | UI projection，不是 Run SoT | ADD |
| Skill Context UI | `modules/skill-run` | 平面 Skill-first Picker；Category 来自 Provider | ADD/REPLACE |
| Chat selection truth | `Chat.tsx` | `SkillSelection | null`；提交时冻结 request snapshot | MODIFY |
| Chat submit router | `Chat.tsx` | Slash 优先；skill-run mode 走 `hermesAPI.skillRun.start` | MODIFY |
| Transcript materialization | Main skill-run session adapter | `run_id` 驱动 user/assistant bubble upsert | ADD，复用通用 DB helper |
| Artifact → File Platform | Main skill-run artifact adapter | 按 `run_id + artifact_id` 安全导入 | ADD，复用 File Platform |
| Expert v1.0.2 execution | 现有 `modules/expert` / Main expert owner | 只处理 feature mode=expert-compat 或迁移前在途任务 | MODIFY 为 compatibility |
| Local bundled Skills | `screens/Skills` | 本地 Hermes skill 管理 | KEEP，禁止混名 |
| Runtime ChatRun | `run-stream.ts` / Runtime client | 现有本地/Runtime Chat 能力 | KEEP，禁止复用 |
| NoDeskClaw Agent internal Run | NoDeskClaw | Work 不可达 | KEEP external boundary |

## 7. Work 进程与模块边界

### 7.1 Shared Contract

新增 `apps/work/src/shared/skill-run.ts`，只定义 Work 消费所需的 Renderer-safe 类型：

```ts
interface SkillToolItem {
  toolName: string;
  title: string;
  description: string;
  category: string | null;
  version: string | null;
  inputSchema: Record<string, unknown>;
  riskLevel: string | null;
  requiresApproval: boolean;
  approvalMode: string | null;
  supportsStreaming: boolean;
  supportsArtifacts: boolean;
}

interface SkillSelection {
  toolName: string;
  title: string;
  category: string | null;
  version: string | null;
  riskLevel: string | null;
  requiresApproval: boolean;
}

interface SkillRunRequest {
  kind: "skill-run";
  toolName: string;
  prompt: string;
  arguments: Record<string, unknown>;
  attachmentRefs: string[];
  sessionId: string;
  localProfileId: string;
  clientRequestId: string;
  authGeneration: string;
}
```

约束：

- `SkillSelection` 只服务 UI；调用时只以 `toolName` 作为 Provider 路由身份。
- `version/category/riskLevel` 是提交时观测快照，不得作为路由 override。
- `arguments` 必须由 Main 再次按 catalog `inputSchema` 校验。
- P0 若 Provider 未冻结 attachment contract，则选中 Skill 时附件入口明确禁用并解释原因，禁止静默丢弃附件。
- `localProfileId` 只用于 Work 本地会话隔离，不发送给 Provider。DTO 不包含 `expertSlug`、`agentId`、Provider `profileId` 路由、Runtime URL、credential 或下载 URL。
- Main 生成 `authScope = backendOrigin + orgId + userId + loginGeneration`；Catalog cache、pending-submit、Run projection、continuation、SSE 和 Artifact 必须按该 scope 分区。Renderer 不可自报 org/user/origin。

### 7.2 Main 网络 Owner

新增建议目录：

```text
apps/work/src/main/skill-run/
  skill-run-gateway-client.ts
  skill-run-service.ts
  skill-run-ipc.ts
  skill-run-session-materialize.ts
  skill-run-contract.ts
```

`SkillRunGatewayClient` 负责：

- 从现有 Portal auth endpoint store 取得 Backend Base URL；
- 通过 `ensureFreshAccessToken` 使用登录 JWT；
- `tools/list` / `tools/call` JSON-RPC；
- `/api/v1/runs/*` GET/POST；
- 401/403 的单次 refresh retry；
- 超时、错误清洗、same-origin URL/path allowlist；
- Catalog TTL cache 和显式 refresh。

Catalog cache key 至少是 `(backendOrigin, orgId, userId, contractVersion)`。401/403、登录代次变化、组织切换、Backend origin 变化和 mode 变化均强制清空；任何 cache hit 之前必须校验完整 authScope。

Expert Client 当前的 authorized transport 应抽取为 Main 内部的 NoDeskClaw authorized transport，供 Expert compatibility 与 Skill Run 两个 client 复用。不得复制 token refresh、URL join 和错误 parser。

### 7.3 IPC / Preload

新增 `window.hermesAPI.skillRun`，建议最小 surface：

```ts
interface SkillRunApi {
  listTools(): Promise<SkillToolItem[]>;
  refreshTools(): Promise<SkillToolItem[]>;
  start(input: SkillRunStartInput): Promise<SkillRunProjection>;
  cancel(input: SkillRunCancelInput): Promise<SkillRunProjection | null>;
  approve(input: SkillRunApprovalInput): Promise<SkillRunProjection>;
  getProjection(clientRequestId: string): Promise<SkillRunProjection | null>;
  listProjections(sessionId: string): Promise<SkillRunProjection[]>;
  rehydrateSession(sessionId: string): Promise<SkillRunProjection[]>;
  retryArtifactDiscovery(input: SkillRunArtifactRetryInput): Promise<SkillRunProjection>;
  onProjectionChanged(listener: (value: SkillRunProjection) => void): () => void;
}
```

所有 handler 必须验证 sender、session/local profile、输入长度和 authScope。Renderer 不得传 event/result/artifact URL；Main 只使用 Accepted 中经过 allowlist 校验的相对路径，或根据 `run_id/artifact_id` 自行构造同源路径。v4.0 不暴露无明确用户场景的通用 resume IPC；Approval 成功后的 RESUMING 由 Provider 状态机推进。

### 7.4 Renderer Owner

新增 `apps/work/src/renderer/src/modules/skill-run/`。模块拥有：

- Skill Context Control / Chip / Picker；
- Skill Run compact transport row；
- Approval card；
- Artifact cards 的 Skill Run 适配层；
- projection store 与 IPC subscription。

`Chat.tsx` 仍是当前 Chat 的 selection truth 和提交路由 owner。模块不得保存第二份 selection truth。

## 8. Skill Catalog 与选择 UX

### 8.1 Catalog 语义

- `name` → `toolName`，是唯一调用身份。
- `title` → 用户展示名；缺失时回退 `name`。
- Tool 顶层 `category` → Picker 唯一分组字段；缺失时才回退 annotations.category，再缺失进入本地 i18n（国际化）“其他”分组。若顶层与 annotations 冲突，以顶层为准并记录 contract drift telemetry。
- `version` 只展示和遥测，不由 Work 指定 Release。
- `riskLevel/requiresApproval/approvalMode` 用于提示和审批 UX，不替代 Backend Policy。
- Catalog 不含本用户无权限或未 published 的 Tool；Work 不展示 Expert/Runtime 管理能力。

### 8.2 Picker

- 宽屏：Category rail + Skill 列表；窄屏：Category section。
- 搜索覆盖 title、name、description、category。
- 每行显示 title、description、category、risk/approval 标记。
- 不出现 Expert、Agent、Runtime、Profile、Installation、Gateway URL。
- Arrow/Enter/Esc 可操作，status/risk 不只依赖颜色。
- 新增用户可见文案必须进入现有全部 locale 的 i18n key；不得只新增中英文硬编码。
- 当前选择从最新合法 Catalog 消失时清空 selection；在途 Run 不受影响。
- Catalog 请求失败时显示错误和重试，不静默回退到 Expert Catalog。

### 8.3 Chat selection 不变量

目标态：

```ts
const [skillSelection, setSkillSelection] = useState<SkillSelection | null>(null);
```

- 未选择时走现有 Local Chat。
- 选中后点击发送，先执行 Slash 优先规则，再冻结 `SkillRunRequest`。
- 冻结后不可重读实时 Picker selection。
- skill-run mode 下 Quick Ask/background 行为保持 v3.0.1 的互斥门禁。
- 不允许同一条消息同时创建 ExpertTask 和 Skill Run。

## 9. 参数绑定与附件

### 9.1 P0 Prompt-first

P0 只把 Chat 输入绑定到合同明确允许的 string `prompt` 字段：

- `inputSchema.properties.prompt.type == "string"` 时绑定当前 Chat 文本。
- 必填字段除 `prompt` 外仍未满足时，不直接调用，显示“需要补充参数”。
- 不允许把完整 prompt 塞入未知字段或把 Tool schema 当作任意 JSON。
- Main 在 `tools/call` 前再次校验参数，Renderer 校验只用于 UX。

### 9.2 结构化 Tool

P0 可展示 Public Connector Tool，但遇到无法由 prompt 满足的 schema 时必须 fail-closed。P1 再实现受限 JSON Schema 表单；支持范围与不支持的 `oneOf/anyOf`、递归 schema 等必须写入独立 Plan 和测试。

Catalog projection 必须计算本地 `callability`：

- `prompt-ready`：P0 可直接进入 selection/send；
- `parameters-required`：可展示但选择前明确提示需要结构化表单；P0 不进入发送态；
- `unsupported-schema`：禁用并解释客户端版本暂不支持。

P0 支持的 JSON Schema 子集冻结为 Draft 2020-12 的本地 object/string 最小子集：根必须为 object；允许 `properties`、`required`、string `minLength/maxLength/enum/default` 和根 `additionalProperties=false`。默认禁止远程 `$ref`、递归、`oneOf/anyOf/allOf`、隐式类型转换、未知 format、超限 schema 深度/字节数。具体上限由 Plan 固化，解析一律 fail-closed。

### 9.3 Attachment refs

附件不得转成裸 URL 或本地路径放进 arguments。只有 Provider 发布 attachment refs 的公开字段、大小限制和授权语义后，Work 才能启用 Skill Run 附件。未满足 Gate 时，选中 Skill 后附件按钮禁用，旧 Local Chat 附件能力不受影响。

## 10. Run 生命周期

### 10.1 本地 Projection

建议本地 phase：

```text
local queued → starting → preparing → running
                              ↘ waiting_approval → resuming → running
                                                   → terminal confirmed
```

远端映射：

| Remote status | Work local phase |
|---|---|
| CREATED / QUEUED | starting |
| PREPARING | preparing |
| RUNNING | running |
| WAITING_APPROVAL | waiting_approval |
| RESUMING | resuming |
| COMPLETED | terminal confirmed；Run phase=succeeded，Result/Artifact 进入独立物化状态 |
| FAILED | failed |
| CANCELLED | cancelled |
| TIMED_OUT | expired |

`SkillRunProjection` 至少包含：

- `clientRequestId/sessionId/runId/toolName/toolTitle`；
- `phase/remoteStatus/displayStage/progressMessage`；
- `lastEventId/lastEventSeq/reconnectAttempts`；
- `resultSummary/resultContent/errorCode/errorMessage`；
- `resultMaterialization: idle | loading | ready | error`，与 Run terminal phase 分离；
- `approval` 的 Renderer-safe descriptor；
- `artifactDiscovery/artifactFileIds`；
- `createdAt/updatedAt`。

Projection 不是 Run SoT，不保存 ExecutionSnapshot 内的 runtime policy、placement、org/user 或 SecretRef。

### 10.2 Pending-submit、Accepted 与幂等

- 每次用户提交生成稳定 `clientRequestId`，作为 `X-Idempotency-Key`。
- Work 在发送 `tools/call` 前先持久化 `pending-submit`，至少包含 authScope、sessionId、localProfileId、clientRequestId、toolName、参数 shape hash、创建时间和提交状态；不得保存完整敏感参数。
- 网络重试、应用重启后的 create retry 必须复用原 key 和同一参数 shape hash。
- Provider 必须支持按 key 重放相同 Accepted，或提供按 key 查询已创建 Run 的能力；没有该语义时 Work 不得在不确定 timeout 后盲目 create retry。
- 只有解析到 `committed=true` 和合法 `run_id` 才进入 accepted。
- Accepted URL 必须为同源相对 `/api/v1/runs/{same-run-id}/*` 路径。
- 不因 timeout 自动改走 Expert Gateway；用户显式重试仍复用幂等键直到确认原 Run 不存在。
- Accepted 后以事务方式把 pending-submit 转成 accepted continuation；terminal 和 retention 到期后按策略清理。

### 10.3 SSE 与恢复

- Main 用登录 JWT 打开 `event_stream`，Renderer 不接触 token。
- 重连发送 `Last-Event-ID`；本地同时保存 `lastEventSeq`。
- 重复或倒序事件不得重复投影；event_seq 小于等于已应用 cursor 时忽略。
- 未知 event_type 只推进 cursor 并记录无 payload 的遥测，不崩溃、不猜 UI 含义。
- SSE 静默时启动有界 status poll；Provider 达到 30 天恢复指标并有单独 Removal PRD 前，不删除 poll fallback。
- terminal SSE 后仍通过 `GET /runs/{id}` 与 `/result` 完成权威确认。

当前 Provider 必须先冻结 event_type 和 payload schema。至少需要 run accepted/started/progress/approval-required/artifact-created/completed/failed/cancelled 的稳定语义。

### 10.4 App 重启与 continuation

Main 持久化最小 continuation：

- `clientRequestId/sessionId/runId/toolName/toolTitle`；
- `lastEventId/lastEventSeq`；
- 当前非敏感 phase；
- Artifact discovery 状态。

启动或进入 Session 时，根据本地 continuation 重新查询 `/runs/{id}` 并恢复 SSE。不得要求 Provider 提供“按本地 session 列出 Run”才能恢复。

现有 `DesktopSessionContinuationItem` 与 normalizer 只支持 `expert-run`。实现必须新增带 `schemaVersion` 的 `skill-run` 和 `skill-run-pending` union、原子 upsert/delete、terminal retention、Session 删除联动和升级/降级迁移。当前 `persistSessionContinuation()` 对空列表直接返回，无法删除最后一个 continuation；v4.0 必须补齐显式 delete/replace-empty 语义和测试。

## 11. Approval

高风险 Skill 的 UI 行为：

1. Catalog 提前显示 risk 与 requiresApproval。
2. Accepted 或事件进入 WAITING_APPROVAL 时显示非模态 Approval Card。
3. Card 展示服务端提供的审批摘要、风险、过期时间和允许动作。
4. 用户确认后 Main 调用 `/api/v1/runs/{run_id}/approvals/{approval_id}`。
5. 只有远端进入 RESUMING/RUNNING 后 UI 才离开等待态。
6. 拒绝、过期、重复批准和无权限均按 Provider error_code 显示。

实施前 Provider 合同必须增加 `ApprovalDescriptor` 和 decision schema。Work 不得用 `run_id` 伪造 `approval_id`，也不得仅根据 Catalog annotations 自行决定跳过审批。

## 12. Result、Transcript 与渲染

- Run accepted 后继续镜像普通 user/assistant bubble，不新增 Skill 专用 `ChatMessage` kind。
- `run.progress` 在 payload schema 冻结前只显示服务端明确提供的安全文本字段。
- 不把 progress 伪装为 Thought、Reasoning 或 ToolActivity。
- COMPLETED 后读取 `/result`；只有 Result Contract 允许的 summary/content 进入 assistant bubble。
- terminal result 更新同一 assistant bubble，不追加重复 terminal 消息。
- Run terminal phase 与 Result materialization 分离：Result 获取失败时 Run 仍保持 succeeded，物化进入 error 并提供有界自动重试和用户手动重试。
- Result 自动重试必须有次数/时间上限；永久 404/410、权限变化和 contract reject 进入可解释终态，不得无限停在 finalizing。
- Result/Artifact 的物化状态必须进入 continuation，重启后可恢复且不会追加重复 bubble/File association。
- Run 与现有 Runtime ChatRun 是不同领域对象；同名 `run_id` 不得交叉进入 Dashboard reducer。

## 13. Artifact 与 File Platform

Work 只消费统一 `ArtifactDescriptor`：

- 身份为 `(run_id, artifact_id)`；
- Main 根据 ID 构造 Backend 同源下载路径；
- Renderer 提供的 `download_url/url` 一律不可信；
- File Platform 新 provider 建议为 `skill-run`，remote metadata 使用 `remoteRunId/remoteArtifactId`；
- Artifact metadata discovery 失败不把已完成 Run 改成 failed；
- Preview 通过 File Platform 安全 materialize 后执行，不依赖旧 Expert preview endpoint；
- checksum 存在时下载后校验；不匹配则拒绝导入并记录错误；
- Chat Artifact Cards 与 Session Files 消费同一个 ManagedFile `fileId`。

现有 `upsert-expert-remote-artifact.ts` 的 DB/file 关联逻辑应抽取通用 helper；不得把 Skill Run Artifact 假装成 provider=`expert` 或 remoteTaskId。

当前 File Platform 只允许 provider=`expert`，远程唯一索引是 `(profile_id, provider, remote_artifact_id)`。v4.0 必须包含同一个变更单元内的数据迁移：

- `ManagedFileRemoteProvider` 新增 `skill-run`；
- managed_files 新增 `remote_run_id`；
- Skill Run 唯一键为 `(profile_id, provider, remote_run_id, remote_artifact_id)`；
- query/upsert/DTO/View/association 全部使用同一 tuple；
- 旧 Expert 行回填/兼容且不改其 identity；
- migration、upgrade、rollback 和重复 artifact ID 跨 Run 测试通过。

如果 Provider 最终冻结 `artifact_id` 全局唯一，也仍保留 `remote_run_id` 做授权路径和审计，不依赖全局唯一作为 Work 隔离边界。

Artifact transfer 必须复用或抽取现有有界下载安全 helper，覆盖最大字节数、Content-Length 不一致、chunked 超限、redirect 拒绝、MIME/扩展名、磁盘配额、临时文件、原子 rename、失败清理和 checksum。不得一次性无上限读入内存。

## 14. Auth 与安全边界

### 14.1 强制要求

- 所有网络请求只在 Main。
- 使用现有 Portal 登录 JWT 和 refresh 流程。
- Work 不持有 `X-Skill-Agent-Token`，不访问 `/internal/v1/*`。
- Accepted URL 只接受当前 Backend origin 和固定 `/api/v1/runs/{runId}` 前缀。
- `toolName/runId/artifactId/approvalId` 做长度与字符边界校验并 URL encode。
- IPC error 不回传完整 prompt、arguments、JWT、query token、ExecutionSnapshot 或 Provider 原始堆栈。
- 日志只记录 trace/clientRequestId、runId、toolName、phase、errorCode 和耗时。
- 完整 authScope 变化后，旧用户/组织/Backend origin 的 catalog、pending-submit、projection、continuation、SSE 和 Artifact 不得被新 scope 继续读取；双方订阅必须中断。

### 14.2 Provider 安全 Gate

Work 上线前必须验证：

- Backend `/runs/*` 在投影缺失时 fail-closed；
- result/artifact/cancel/approve 都进行组织与用户授权；
- Agent Run 与 Backend 投影创建具备幂等/Saga 保证，不产生可执行孤儿 Run；
- Edge 和 central 不会双执行同一个 Run；
- Attempt/Lease/Fencing 满足 crash recovery；
- Snapshot 不保存明文 token/env_file；
- Artifact 字节持久化，不依赖容器 `/tmp`。

这些是 Provider 发布 Skill Run 合同和 Work 灰度的前置，不由 Work 代码补偿。

## 15. Compatibility Contract

### 15.1 Feature mode

新增“新提交路由模式”，建议名为 `SMC_WORK_CAPABILITY_MODE`：

- `expert-compat`：新提交继续走 v1.0.2；用于 Provider 未就绪和紧急回滚。
- `skill-run`：新提交只走 v4.0 Skill Run。

模式由部署配置决定，不提供普通用户在 Picker 内切换。请求失败时不得自动从 `skill-run` 降级为 `expert-compat`，否则同一幂等操作可能在两个执行面重复运行。

该 mode 只决定新的 `start` 路由，不决定 lifecycle reader 是否启动。迁移期 ExpertRunService 与 SkillRunService 都必须在 Main 启动：各自只恢复属于自身合同、当前 authScope 可访问的在途 continuation。登出、组织切换、origin 变化和应用退出必须停止双方 SSE/poll；禁止因回滚到 expert-compat 而停止已有 Skill Run 跟踪。

### 15.2 迁移期

- skill-run mode 启用后，Toolbar 不再展示 Expert Picker。
- 切换前已 accepted 的 ExpertTask 继续由现有 ExpertRunService、SSE 和 Artifact adapter 跟踪到 terminal。
- 新 Skill Run 使用独立 projection/store/continuation，不写 `taskId` 别名。
- rollback 只影响新的提交；已有 Skill Run 必须继续按 run_id 跟踪。
- 不在一个 Chat submit 中同时触发两套 start API。

### 15.3 Removal

旧 Expert 员工生产调用最早在 Work v4.2 REMOVE，且同时满足：

- Skill Run 默认开启至少 30 天；
- accepted、terminal、SSE reconnect、artifact、approval 指标达到门槛；
- 没有仍需 v1.0.2 创建新任务的生产部署；
- 已有 ExpertTask continuation 已完成或达到明确过期策略；
- 独立 Removal PRD 通过。

`contracts/work-expert/v1.0.2` 可继续作为历史 fixture，不修改已发布 checksum。

## 16. Provider Contract Release Gate

Work 实施计划生成前，NoDeskClaw 必须交付：

1. `skill-run-contract-v1.0.0` Git tag，tag 指向 manifest 的 backendCommit。
2. 完整 `SHA256SUMS` 和 manifest，覆盖：
   - MCP tools/list request/response；
   - MCP tools/call request/accepted response；
   - `PublicRunView`；明确排除 org/user、ExecutionSnapshot、attempt、runtime policy、placement 和 SecretRef；
   - Run Result envelope；
   - Run Event 与各 event payload；
   - Artifact list/descriptor/download metadata；
   - Approval descriptor/decision；
   - JSON-RPC 与 REST error envelope。
3. 发布 OpenAPI 或等价可执行 endpoint matrix，完整冻结：
   - method/path/query/header/body/response；
   - JWT、SSE token、Content-Type、heartbeat 和 retry；
   - 200/202/204/400/401/403/404/409/410/422/429/5xx；
   - cancel/approve 的终态 race、幂等和冲突语义；
   - Artifact Content-Disposition、Content-Length、checksum、redirect 和 range 语义。
4. 冻结 `X-Idempotency-Key` 的作用域、TTL、参数冲突、并发重复、dedupe 标识以及按 key 查询/重放 Accepted 的能力。当前 Accepted schema 没有 `deduped`，Work 不得提前依赖该字段。
5. 明确 SSE 鉴权：JWT、query token 或二者之一；token 生命周期和日志规则必须冻结。
6. 明确 attachment refs 和通用 arguments 语义。
7. Provider contract fixture 包含：
   - 普通成功；
   - WAITING_APPROVAL→RESUMING；
   - cancel；
   - timeout/failure；
   - SSE resume/duplicate；
   - artifact with checksum；
   - auth/tenant denial。
8. Provider CI contract check 通过；Work 导入后建立 consumer-lock test。

在 Gate 完成前，本 PRD可以 Review，但实现状态保持 BLOCKED。

## 17. Work Contract 导入与漂移治理

目标目录：`contracts/skill-run/v1.0.0/`。

必须包含 Provider 原始 manifest、SHA256SUMS、公共 schema、endpoint contract、fixtures 和 Work `consumer-lock.json`。Work 不导入 Agent 内部 RunRecord/ExecutionSnapshot，不手写同名 schema，不只复制 TypeScript interface。

CI 增加：

- checksum 校验；
- consumer lock 的 provider repo/tag/commit 校验；
- schema fixture 校验；
- generated/handwritten parser 与 required field 对齐测试；
- 禁止修改 work-expert v1.0.2 checksum 的 guard；
- breaking change 要求新 contract version 和本仓 PRD/ADR。

## 18. 实施 Slice

### Slice A：合同与 Transport

- 导入 Skill Run contract/consumer lock。
- 抽取 Main NoDeskClaw authorized transport。
- 实现 SkillRunGatewayClient parser、URL allowlist、contract fixtures tests。
- 不接 UI、不启用生产调用。

### Slice B：Run Core

- Shared DTO、IPC、Preload。
- SkillRunService、durable pending-submit、SSE、poll、cancel、result、continuation。
- Projection store 与 Main-only auth tests。

### Slice C：Skill-first UI

- Skill Picker/Chip、Category/Search、selection truth。
- Chat submit router 接入 skill-run mode。
- prompt inputSchema binding、风险提示、不可调用状态。

### Slice D：Approval 与 Artifact

- Approval Card 与 approve；RESUMING 只做远端状态投影。
- Artifact adapter、File Platform、Chat cards、Session Files。
- Result/transcript terminal reconcile。

### Slice E：Compatibility 与 Rollout

- Feature mode、旧 Expert 在途 continuation。
- 灰度遥测、故障注入、rollback 验证。
- 文档与 `lat.md` 更新。

Slice A 之前必须满足 Provider Contract Gate；Slice D 之前必须存在 Approval/Artifact 完整 schema。

## 19. Observability

最低事件：

- `skill_catalog_load`：结果、数量、耗时、contractVersion；
- `skill_run_submit`：toolName、clientRequestId、argumentShape，不含值；
- `skill_run_accepted`：runId、accepted latency；Provider 合同未来声明 dedupe 标识后再增加对应维度；
- `skill_run_first_event`：first-event latency；
- `skill_run_sse_reconnect`：attempt、lastEventSeq、结果；
- `skill_run_poll_fallback`：原因和持续时间；
- `skill_run_terminal`：status、总耗时、errorCode；
- `skill_run_approval`：shown/approved/denied/expired；
- `skill_run_artifact_discovery`：count、结果、checksum result；
- `skill_run_contract_reject`：schema/path/event rejection reason。

禁止记录 prompt、arguments 值、JWT、query token、Artifact 内容、Approval 备注全文。

灰度门槛至少覆盖 accepted success、terminal reconcile、SSE resume、重复执行率、artifact success、approval success 和跨租户拒绝。具体数值由发布 Plan 与生产基线确定。

## 20. Test Strategy

### 20.1 Contract tests

- Provider fixtures 全量 schema validation。
- manifest/SHA/tag/consumer-lock 一致。
- required field 缺失、extra internal identity、错误 envelope、unknown event 的行为确定。

### 20.2 Main unit tests

- JWT refresh、401/403、完整 authScope mismatch，以及 user/org/origin/loginGeneration 切换。
- tools/list/parser/category/risk/inputSchema。
- tools/call 幂等、timeout、dedupe、URL allowlist。
- SSE split frame、Last-Event-ID、重复/倒序 event_seq、重连和 poll fallback。
- terminal confirm、cancel race、approval race、unknown event。
- app restart pending-submit/accepted continuation、删除最后一个 continuation 和 mode 切换。
- Artifact path injection、checksum mismatch、跨 run 重复 artifact ID、bounded transfer 和失败临时文件清理。

### 20.3 IPC / Preload tests

- handler 注册唯一、sender validation、DTO length/type validation。
- Renderer 看不到 JWT、query token、Accepted 原始 URL、Snapshot 和内部 error。
- unsubscribe 和多窗口 projection fan-out。

### 20.4 Renderer tests

- Category/Search/Keyboard/Empty/Error/Refresh，以及 category 顶层字段优先级。
- prompt-ready/parameters-required/unsupported-schema 在选择前有确定性 callability。
- SkillSelection 清理和提交 snapshot。
- Slash 优先、Quick Ask 门禁、Local Chat 回归。
- WAITING_APPROVAL、cancel、retry、artifact discovery 独立状态。
- Expert 在途任务与新 Skill Run 同屏但不串 store。
- i18n（国际化）、窄屏、可访问性和非颜色状态。

### 20.5 Cross-project integration

- Work → Backend MCP → Agent → Run Event → Result → Artifact 完整链。
- SSE 断开、Backend Pod 切换、Agent Worker crash、Work 重启。
- 重复 tools/call 不产生两个 Run。
- Edge/central 单 Owner 验证。
- 未授权组织、投影缺失、伪造 run/artifact/approval ID 全部拒绝。
- skill-run mode 回滚后，在途 Run 仍完成，新请求不跨执行面重复。

## 21. Acceptance Criteria

### 合同与边界

- [ ] Work 锁定带 tag 和完整 checksum 的 SKILL-RUN-CONTRACT；不消费 NoDeskClaw 未提交文件。
- [ ] `contracts/work-expert/v1.0.2` checksum 无变化。
- [ ] Work 不访问 `nodeskclaw-agent` 或 `/internal/v1/*`。
- [ ] 新调用只使用 `/api/v1/mcp`、`tool_name`、`run_id` 和 `/api/v1/runs/*`。
- [ ] 新请求/响应/事件/结果/Artifact/Approval 均有 Provider schema 和 fixture。
- [ ] Provider 发布 PublicRunView 与 endpoint matrix；Work 不接收 Agent RunRecord/ExecutionSnapshot。

### Catalog 与调用

- [ ] 用户一次选择 Skill，不需要选择 Expert。
- [ ] Category 来自 Tool contract；缺失项进入“其他”，不从名称猜测。
- [ ] Provider 请求不包含 expertSlug、agent/profile/runtime/installation 路由字段；Work 本地 profile 身份不会被误作 Provider 路由。
- [ ] X-Idempotency-Key 在网络重试和重启恢复时保持稳定。
- [ ] 不满足 inputSchema 的 Tool 不会被错误调用。
- [ ] 非 prompt-ready Tool 在选择前即显示 parameters-required/unsupported-schema，不进入发送态。
- [ ] Provider 未冻结附件合同前，Skill Run 不会静默丢弃附件。
- [ ] Category 冲突按顶层字段优先，并产生 contract drift telemetry。
- [ ] 新 UI 文案全部接入现有 locale，不新增硬编码用户文案。

### Run

- [ ] Accepted 使用 run_id；不存在 task_id 别名。
- [ ] SSE 用 Last-Event-ID 恢复，重复/倒序事件不重复投影。
- [ ] terminal 由 Run/Result 权威确认，不只信任一次 SSE。
- [ ] app 重启后可恢复 pending-submit 与 accepted Run；不确定 create 不会产生重复执行。
- [ ] cancel、approval 的 race 有确定性测试；v4.0 不提供无明确场景的通用 resume 操作。
- [ ] 未知事件不崩溃、不伪造 Reasoning/Tool UI。

### Result 与 Artifact

- [ ] 普通 user/assistant bubble 继续作为 Transcript owner。
- [ ] Skill Run 不新增 ChatMessage 专用 kind。
- [ ] Artifact 只通过 `(run_id, artifact_id)` 和 Backend 鉴权代理导入 File Platform。
- [ ] Renderer URL 不被 Main 信任；checksum mismatch 会拒绝文件。
- [ ] Artifact discovery 失败不把已完成 Run 改成失败。
- [ ] File Platform 完成 skill-run provider、remote_run_id 和 tuple unique index 迁移；跨 Run 相同 artifact_id 不串数据。
- [ ] Result/Artifact 物化失败有独立 error/retry/retention，不让 Run 无限停在 finalizing。

### Compatibility

- [ ] skill-run mode 下新请求不会调用 Expert Gateway。
- [ ] expert-compat mode 下不会创建 Skill Run。
- [ ] 请求失败不会在两套执行面间静默 fallback。
- [ ] 旧 Expert 在途任务可以继续完成和发现 Artifact。
- [ ] rollback 不影响在途 Skill Run 跟踪。
- [ ] mode 只控制新提交；两个 lifecycle service 在迁移期始终可恢复各自在途 continuation。
- [ ] Catalog/projection/continuation/artifact 按 backendOrigin+orgId+userId+loginGeneration 隔离。

### External Release Gate（NoDeskClaw Owner）

- [ ] `/runs/*` 授权 fail-closed；证据为 NoDeskClaw 版本 tag、跨租户集成测试与 CI 报告。
- [ ] Run 创建具备幂等与孤儿补偿；证据为重复/故障注入测试。
- [ ] Edge/central 单一执行 Owner；证据为 placement 集成测试。
- [ ] crash recovery、Lease、Fencing 满足 NoDeskClaw AC-07；证据为 Worker crash 测试。
- [ ] Snapshot 无明文凭证，Artifact 持久化不依赖容器临时目录；证据为安全测试与部署配置。

这些条目不是 Work 代码的完成条件，而是允许 Work skill-run mode 进入生产灰度的外部发布门禁。Work 自身 Acceptance 只验证消费者可观察合同和本地行为。

## 22. Source Anchors

### Work 当前实现

- `apps/work/src/shared/expert.ts#ExpertRequest`
- `apps/work/src/shared/expert.ts#ExpertAcceptedStructuredContent`
- `apps/work/src/main/expert/expert-gateway-client.ts#authorizedFetch`
- `apps/work/src/main/expert/expert-gateway-client.ts#callSkill`
- `apps/work/src/main/expert/expert-run-service.ts#createExpertRunService`
- `apps/work/src/main/expert/expert-session-materialize.ts#shouldMaterializeExpertSession`
- `apps/work/src/main/files/upsert-expert-remote-artifact.ts#upsertExpertRemoteArtifact`
- `apps/work/src/shared/files/managed-file.ts#ManagedFileRemoteProvider`
- `apps/work/src/main/files/file-association-store.ts`
- `apps/work/src/shared/session-continuation.ts#DesktopSessionContinuationItem`
- `apps/work/src/main/session-continuation-store.ts#persistSessionContinuation`
- `apps/work/src/main/expert/expert-continuation.ts`
- `apps/work/src/main/app/start.ts#startMainProcess`
- `apps/work/src/preload/expert-api.ts#createExpertApi`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#expertSelection`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#submitExpert`
- `apps/work/src/renderer/src/modules/expert/ExpertContextControl.tsx`
- `apps/work/src/renderer/src/modules/expert/store.ts`
- `apps/work/src/main/run-stream.ts`
- `apps/work/src/renderer/src/screens/Skills/Skills.tsx`

### Work 文档与合同

- `docs/work/PRD-WORK-v3.0-expert-execution.md`
- `docs/work/PRD-WORK-v3.0.1-expert-context-selector.md`
- `docs/work/PRD-WORK-v3.1-expert-remote-artifact-chat-file-resource.md`
- `docs/work/PRD-WORK-v3.2-skill-first-expert-ui-DRAFT.md`
- `contracts/work-expert/v1.0.2/consumer-lock.json`
- `docs/architecture/contract-flow.md`
- `apps/work/lat.md/expert-execution.md`

### NoDeskClaw Provider

- `docs_agent/prd-skill-platform-v1.0.md`
- `lat.md/decisions/skill-platform-execution.md`
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/manifest.json`
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/events/run-event.schema.json`
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/runs/run.schema.json`
- `nodeskclaw-backend/contracts/skill-run/v1.0.0/runs/artifact-descriptor.schema.json`
- `nodeskclaw-backend/app/api/runs.py`
- `nodeskclaw-backend/app/services/hermes_skill/runtime_skill_run_service.py`
- `nodeskclaw-agent/app/api/internal_runs.py`
- `nodeskclaw-agent/app/services/worker.py`

## 23. Open Gates

独立 PRD Review 必须确认：

1. 接受 v4.0 新增独立 Skill Run consumer owner，而不是继续扩展 Expert wire contract。
2. 接受 skill-run mode 不提供运行时自动 Expert fallback。
3. 接受 P0 只直接调用 prompt-first schema；结构化 Connector Tool 表单进入 P1。
4. 确认附件在 Provider contract 完成前 fail-closed。
5. 确认 ApprovalDescriptor、Run Result、Artifact envelope 和 Event payload 是 Provider v1.0 发布阻断项。
6. 确认旧 Expert 创建路径最早 v4.2 REMOVE，且需要独立 Removal PRD。
7. 确认 Provider 安全 Gate 属于 Work 上线前置，不由 Work 做客户端补偿。
8. 确认 Work 只消费 PublicRunView，不导入 Agent RunRecord/ExecutionSnapshot。
9. 确认 Provider 提供幂等 key 重放/查询语义，Work 持久化 pending-submit。
10. 确认 mode 只切新提交，迁移期两个 lifecycle reader 始终可恢复在途任务。
11. 确认 authScope 包含 Backend origin、org、user、login generation。
12. 确认 File Platform tuple identity 数据迁移与 bounded transfer 属于 v4.0 P0。

关闭 Open Gates 后，本文才可进入最终 APPROVED 收敛。实施必须从批准稿生成 `.plan.md`，并在每个 Slice 更新 `apps/work/lat.md/` 与运行 `lat check`。
