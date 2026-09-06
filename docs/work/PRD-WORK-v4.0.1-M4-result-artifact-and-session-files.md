---
work_item_id: RM-05
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-06T18:25:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-05
grounded_commit: 2820d5f8d69a77289b5f6741e10a095fb1a4e85f
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.2.1
product_decision: user-input:2026-09-04-defer-rm01-live
---

# WORK PRD v4.0.1 M4 — Result, Artifact, and Session Files

本 Stage PRD 把 Skill Run 终态 Result 与 Artifact 收口到既有 File Platform 与 Session Files。File Platform 是唯一文件 Owner；`SkillRunService` 只做 Bundle Artifact list 的 discovery 与 descriptor adaptation。本阶段不把 Skill-first 设为生产默认，不关闭 RM-01 live，也不引入第二套文件栈或直接 Artifact download IPC。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-05` / M4 Result, Artifact, and Session Files |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-05` |
| Architecture | `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md` Artifact and File Platform |
| Repository baseline | `2820d5f8d69a77289b5f6741e10a095fb1a4e85f` |
| Dependencies | RM-04 is `DONE`（`fe87cc0e`）。RM-01 仍为 `BACKLOG`（fixture 已过；live AC-03/AC-04 按 2026-09-04 产品决定延后）。M4 实施不再等待 RM-01 `DONE`。 |
| Provider input | 已锁定 `contracts/skill-run/v1.2.1/`。Artifact list 为 `PublicArtifactList`（`run_id` + `items[]`）；descriptor 字段为 `artifact_id` / `name` / `content_type` / `size_bytes` / `checksum_sha256`；download 仅为 `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}/download`。 |
| Existing File Platform | `provider=skill-run` 类型、`(profile, provider, remote_run_id, remote_artifact_id)` 唯一索引、`upsertSkillRunRemoteArtifact`、Preview 已按 provider 分流、`hermesAPI.files` Preview/Save As 已存在 |
| Existing Skill Run | 终态后 `discoverArtifacts`、fail-soft 保持 `succeeded`、`retryArtifactDiscovery` IPC、同一 assistant bubble materialize 已存在 |
| Current default mode | `DEFAULT_MODE = "expert-compat"`；生产默认仍属 M5 |
| Deferred live | 2026-09-04：RM-01 跨端 live 保持 BACKLOG。该决定不自动关闭 Checkpoint B，也不把 fixture 当作 live PASS。 |

## Problem and Outcome

M3 已冻结 `run_id` 生命周期、SSE/poll、cancel 与 compact Result。HEAD 已有 Skill Artifact upsert 与 Preview 分流，但生产闭环仍断在三处：Gateway 只认 Work 私有 `id`/`file_name`/`artifacts` 信封，会丢掉 Bundle `artifact_id`/`name`/`items`；Save As 与 context materialize 仍走 Expert transfer，Skill 文件会被错下到 Expert 路径；upsert 使用非法 association role `assistant_attachment`，Session Files 的 Agent Output 分组看不到这些文件。未收口时，两个 Run 复用同一 artifact id、Preview cache、checksum 与 Expert 历史行都可能串资源或静默失败。

完成后，显式 `skill-first` 下的成功 Run 把 Result 写进同一 assistant bubble；Bundle Artifact list 被 upsert 为 run-scoped ManagedFile，并关联当前 session 的 `agent-output`；Preview / Save As / checksum / size limit / atomic rename / materialize 全部复用 File Platform。Renderer 只消费 `ManagedFileView` 与现有 Session Files。Artifact discovery 失败保持 Run `succeeded`，用户可经既有 `skillRun.retryArtifactDiscovery` 显式重试。Checkpoint B 的 fixture 负向为本阶段实施证据；真实发布 Skill 的 live Checkpoint B 是 RM-05 Roadmap `DONE` 门槛。

## Scope

- In: 复用既有 File Platform remote identity、Preview cache、Save As、Session Files、Skill Run discovery/retry 与 transcript materialize；把 Artifact 消费收敛为 v1.2.1 list/descriptor/download；按 provider 分发字节传输；把 session 关联改成 `agent-output`；补齐 identity / checksum / Expert 共存 / fail-soft retry 的 focused 与 fixture 证据。
- Out: 把 RM-01 标 `DONE`；M5 生产默认 `skill-first`；Approval 可操作卡片；rich activity；JSON Schema form；Attachment upload；Expert 默认入口删除；新增 Skill 专用 download IPC 或 `SkillArtifactCards`；把 Hermes Task `/api/v1/hermes/tasks/*` 或未在 Bundle 中的 `/api/v1/artifacts/{id}/download` 当作 Skill download 合同；修改 `contracts/work-expert/v1.0.2`。
- Production Owner: File Platform 是唯一 ManagedFile / Preview / Save As / materialize / Session Files owner。`SkillRunService` 只负责 list/adapt/retry discovery，并把 descriptor 交给 File Platform upsert。`SkillRunGatewayClient` 只消费 Bundle `/api/v1/runs/{run_id}/artifacts*`。Renderer 只消费 sanitized `ManagedFileView` 与 `window.hermesAPI.files` / `skillRun.retryArtifactDiscovery`。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Compact Result → 同一 assistant bubble | `skill-run-session-materialize` | accepted 后按 `clientRequestId` upsert 同一 user/assistant row；终态更新 `content` | EXISTS |
| Artifact list / descriptor adaptation | `SkillRunGatewayClient` + contract parser | 只接受 `id` + `file_name`，信封只读 `artifacts`/`data`；不读 Bundle `items` / `artifact_id` / `name` / `checksum_sha256`。E2E fixture 使用私有形状，不能证明 Bundle | PARTIAL |
| Run-scoped remote identity | File association store + Skill upsert | v2 唯一索引含 `remote_run_id`；Skill upsert 按 `(provider=skill-run, runId, artifactId)` 查找。无 `remoteRunId` 的 lookup 回退到仅 artifact id。Expert 行 `remote_run_id` 多为 NULL，v1 `(provider, artifact)` 唯一索引已删除 | PARTIAL |
| Descriptor upsert + session association | `upsertSkillRunRemoteArtifact` | 写入 `provider=skill-run` remote row，`source=agent-output`；association role 为类型外的 `assistant_attachment`，无 assistant `messageId`，不写 `contentHash` | PARTIAL |
| Artifact discovery fail-soft + retry IPC | `SkillRunService` + Skill Run IPC | list 失败保持 `succeeded`；`retryArtifactDiscovery` 已注册。Projection 无 discovery error；Renderer 无 Skill retry 入口（仅 Expert 卡片有） | PARTIAL |
| Preview | File preview service | `provider===skill-run` 走 `streamSkillRunArtifactBytes`；cache key 含 provider + run + artifact。Renderer 只得 `hermes-file-preview://{fileId}` | EXISTS |
| Save As / materialize / add-to-context | File service + Expert materialize | 无本地副本时 Save As 固定调用 `streamExpertArtifactBytes`；`addToSessionContext` 固定 `materializeRemoteExpertArtifact`。Skill-run 行会被错送到 Expert download | CONFLICT |
| Unscoped Skill download URL | `streamSkillRunArtifactBytes` | `runId` 缺失时回退 `/api/v1/artifacts/{id}/download`，该路径不在 v1.2.1 endpoint matrix | CONFLICT |
| Session Files / ManagedFileView | Session Files panel + `toManagedFileView` | 按 `agent-output` 分组；View 不含绝对路径、download URL、raw bytes；不含 `remoteRunId` | EXISTS |
| Feature mode / Expert compatibility | feature-mode store + Expert owners | 默认 `expert-compat`；Expert upsert 仍用 `agent-output` + `remoteTaskId` | EXISTS |
| Checkpoint B harness | `skill-run-e2e.test.ts` | Fixture 已覆盖 Catalog→artifact upsert 回调、discovery 失败保持 succeeded、unauthorized/unpublish/reconnect/cancel。无 Preview/Save As/Session Files 文件面证据；live 仍 env-gated | PARTIAL |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Compact Result transcript | Existing session materialize | 终态 Result 更新同一 assistant bubble 与持久化 transcript；不因 Artifact 失败改写为 failed | KEEP |
| Bundle Artifact discovery | Existing Gateway + parser | 只消费 v1.2.1 `PublicArtifactList` / `PublicArtifactDescriptor`；内部 DTO 可保留 Work 字段名，但必须从 Bundle 字段映射，缺失必填字段 fail-closed 跳过该条，不得猜测 | MODIFY |
| Run-scoped remote identity | Existing File Platform store | Skill-run 唯一键为 `(profile, provider=skill-run, remoteRunId, remoteArtifactId)`；缺 `run_id` 不得 upsert。Expert 行继续按 Expert identity 唯一，不被 Skill 索引吞并或改写 | MODIFY |
| Upsert + Session `agent-output` | Existing Skill upsert inside File Platform | descriptor upsert 为 remote ManagedFile；association role=`agent-output`；绑定当前 session 与同一 Run 的 assistant message；可重试、幂等 | MODIFY |
| Bytes transfer by provider | Existing File Platform transfer | Preview / Save As / materialize / add-to-context 按 `file.provider` 分发；Skill 只走 Bundle download path + size/checksum/atomic rename；失败不把已 succeeded Run 改成 failed | MODIFY |
| Unscoped / Hermes download | Skill transfer | 禁止无 `run_id` 的 Artifact download，禁止 Hermes Task 路径 | REMOVE |
| Sanitized file UI | Existing Session Files + File Preview | Renderer 只用 `hermesAPI.files` 与现有 ManagedFileView/Session Files；不新增 Skill download IPC，不复制 ExpertArtifactCards 为第二套 Skill 文件 UI | KEEP |
| Observable discovery retry | Existing Skill IPC + StatusBar or Session Files | discovery 失败可显示且可点 retry；不引入新 IPC channel | MODIFY |
| Feature mode and Expert rows | Existing owners | 默认仍 `expert-compat`；File migration 可回滚且不破坏 Expert remote rows；无 Expert silent fallback | KEEP |
| Checkpoint B | Existing e2e harness + File tests | Fixture 覆盖 identity 隔离、discovery fail-soft、unauthorized/unpublish/reconnect/duplicate/cancel 与 artifact failure。RM-05 Roadmap `DONE` 另需真实发布 Skill 的 Catalog → Submit → Run → Result → Artifact → Restart live | MODIFY |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Bundle Artifact list/descriptor/download adapter | MODIFY | Gateway/parser 必须消费 v1.2.1 `items[]`、`artifact_id`、`name`、`checksum_sha256`；把 checksum 写入 ManagedFile `contentHash`。不得继续只认私有 `id`/`file_name` 信封。 |
| C02 | Provider-dispatched File Platform transfer | MODIFY | Save As、materialize、add-to-context 必须按 `provider` 分流。Skill 只使用 `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}/download`，复用 size cap、sha256、`.partial` + atomic rename。 |
| C03 | Unscoped Skill Artifact download | REMOVE | 删除无 `run_id` 的 `/api/v1/artifacts/{id}/download` 回退；缺少 remote run identity 时 fail-closed。 |
| C04 | Run-scoped identity + Expert-safe unique index | MODIFY | Skill-run 必须带 `remoteRunId` 才能 upsert/lookup/cache。Expert 唯一性不得依赖 NULL `remote_run_id` 的 SQLite UNIQUE 语义；迁移可回滚且不改写 Expert rows。 |
| C05 | Session `agent-output` association + retry UX | MODIFY | 关联 role 改为合法 `agent-output` 并挂 assistant message。discovery 失败保持 succeeded，经既有 retry IPC 从 StatusBar 或 Session Files 显式重试。 |
| C06 | Compact Result、sanitized files IPC、feature mode | KEEP | M3 transcript、`hermesAPI.files`、默认 `expert-compat` 与 no silent fallback 不因本阶段改变。不新增 Skill 文件 SoT。 |

## Replacement / Removal Matrix

| Replaced Production Path | Existing Owner | Target Path | Removal Condition |
|---|---|---|---|
| Skill Artifact Save As / materialize / add-to-context 调用 Expert `streamExpertArtifactBytes` | File service / Expert materialize | 按 `ManagedFile.provider` 分发；`skill-run` 走 Skill transfer | M4 implementation commit 合入后，Skill-run 行不得再进入 Expert download |
| `runId` 缺失时 `GET /api/v1/artifacts/{artifactId}/download` | `streamSkillRunArtifactBytes` | 仅 Bundle `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}/download` | 无 `remoteRunId` 不得传输字节；不得用 Hermes Task URL 替代 |
| Skill upsert `role=assistant_attachment` | Skill remote upsert | `role=agent-output` + assistant `messageId` | 新 upsert 不再写入非法 role；Session Files Agent Output 能列出该文件 |
| Gateway 只解析 `id`/`file_name`/`artifacts` 的私有 Artifact 信封 | Skill Gateway / parser | v1.2.1 `PublicArtifactList` / `PublicArtifactDescriptor` | 仅含私有字段、缺少 Bundle 必填字段的 descriptor 不得进入生产 upsert |

## Contract and Security Boundary

- Artifact list/download 只使用 Bundle：`GET /api/v1/runs/{run_id}/artifacts` 与 `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}/download`，以及 `Authorization`。返回 URL 若出现，必须是 Bundle 允许的 same-origin 相对路径；Renderer 永远看不到该 URL。
- 生产 upsert 的 descriptor 必须能从 Bundle 字段得到稳定 `artifact_id`、`name`、`size_bytes`、`checksum_sha256`。Work 内部 DTO 可以继续用 `id`/`file_name`/`sha256`，但那是 adapter 输出，不是第二套合同。
- Skill-run 远端身份必须含 Provider `run_id`。`task_id`、Expert slug、无 run 的 artifact id、Hermes Task URL 都不是 Skill 文件身份。
- Renderer 只接收 `ManagedFileView`：无 JWT、backend origin、download URL、absolute cache path、raw bytes。`remoteRunId` 不进入 Renderer view。Preview 继续用 `hermes-file-preview://{fileId}`。
- 不新增 `skill-run:download` 或任何直接 Artifact download IPC。Preview / Save As / Open / Reveal 只走 `window.hermesAPI.files`。
- Artifact discovery 或单条 upsert/transfer 失败不得把已 `succeeded` 的 Run 改成 `failed`。日志与 telemetry 不记录 prompt、JWT、download token、absolute path、Result body 或 Artifact bytes。
- Expert remote rows 保持独立 provider identity。Skill 迁移不得重写 `provider=expert` 行，不得用 Skill artifact id 去重 Expert 文件。
- 默认 feature mode 仍为 `expert-compat`。本阶段不授权生产默认 `skill-first`，失败路径不 fallback Expert。

## Acceptance Criteria

1. 显式 `skill-first` 下，成功 Run 的终态 Result 更新同一 assistant bubble 与持久化 transcript。Artifact discovery 失败后该 bubble 仍为成功 Result，Run phase 保持 `succeeded`。
2. Bundle `PublicArtifactList`（`run_id` + `items[]`，字段 `artifact_id`/`name`/`content_type`/`size_bytes`/`checksum_sha256`）可被 discovery 消费并 upsert。仅含 Work 私有 `id`/`file_name`、缺少 Bundle 必填字段的生产响应不得写入 File Platform。
3. 两个 Skill Run 使用相同 `artifact_id` 时产生两个 ManagedFile；Preview cache、Save As 与 Session Files 不串资源。缺 `run_id` 的 descriptor 不得 upsert。
4. Skill Artifact 出现在当前 session 的 Session Files Agent Output；association role 为 `agent-output`。Renderer 看不到 download URL、token、absolute cache path 或 raw bytes。
5. Preview / Save As / Materialize / add-to-context 对 Skill-run 行使用 Skill transfer，对 Expert 行仍使用 Expert transfer。Skill download 只打 Bundle `/api/v1/runs/{run_id}/artifacts/{artifact_id}/download`。超过 size cap 或 checksum 不匹配时 fail-closed，并清理 partial 文件。
6. 无 `remoteRunId` 时 Skill transfer fail-closed，不回退无 run 的 download 路径，不调用 Expert cancel/start/download。
7. File identity 迁移不破坏既有 Expert remote rows；回滚后 Expert `(provider, remote_artifact_id)` 查找仍成立。Skill 索引不得把 Expert 行当成 Skill-run 去重。
8. discovery 失败后，用户可经既有 `skillRun.retryArtifactDiscovery` 显式重试；retry 不发第二次 `tools/call`。无对应 active/rehydrated Run 时 fail-closed。
9. 不存在 Skill 专用 download IPC；不把 `ExpertArtifactCards` 复制为 Skill 文件 Owner。focused tests 覆盖 identity 隔离、provider 分发、checksum/size/atomic rename、association role 与 sanitization。`test:skill-run-e2e` fixture 继续覆盖 Catalog→result→artifact discovery fail-soft 与既有负向（unauthorized、unpublish、reconnect、duplicate、cancel）。
10. RM-05 标记 Roadmap `DONE` 前，必须用真实发布 Skill 跑通 Checkpoint B：Catalog → Submit → Run → Result → Artifact Preview/Save As → Restart，并保留上述负向。env-gated live 入口保留。2026-09-04 对 RM-01 live 的延后不构成 Checkpoint B 已通过。实施 commit 可以先凭 fixture/focused 合入，但不得在 live 未跑时把 RM-05 标 `DONE`。

## Definition of Done

1. C01–C05 有 APPROVED Stage PRD、validated Plan、review PASS、implementation commit 与 focused/fixture verification；C03 的无 run download 回退已从生产 Skill transfer 移除；C06 由既有 owner 的回归证据覆盖。
2. RM-01 保持 `BACKLOG`，直到后续阶段重跑 live AC-03/AC-04。RM-05 的 implementation commit 不以 RM-01 `DONE` 为前提。RM-05 Roadmap `DONE` 需要本 PRD AC-10 的 live Checkpoint B 证据。
3. 发现需要改 Bundle 形状、生产默认 `skill-first`、Approval/Attachment 或 Expert 删除的工作，必须返回 RM-01、RM-06、RM-07 或独立 Removal PRD，不得混入 M4。

## Source Anchors

- `apps/work/src/shared/files/managed-file.ts#ManagedFileRemoteProvider`
- `apps/work/src/main/files/file-association-store.ts#ensureRemoteIdentityIndex`
- `apps/work/src/main/files/file-association-store.ts#findByRemoteIdentity`
- `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts#upsertSkillRunRemoteArtifact`
- `apps/work/src/main/files/skill-run-artifact-transfer.ts#streamSkillRunArtifactBytes`
- `apps/work/src/main/files/file-preview-service.ts#getPreviewDescriptor`
- `apps/work/src/main/files/file-service.ts#saveAs`
- `apps/work/src/main/files/materialize-remote-expert-artifact.ts#materializeRemoteExpertArtifact`
- `apps/work/src/main/files/file-metadata.ts#toManagedFileView`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#listRunArtifacts`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript`
- `apps/work/src/main/skill-run/skill-run-ipc.ts`
- `apps/work/src/renderer/src/screens/Chat/session-files/SessionFilesPanel.tsx`
- `apps/work/src/renderer/src/screens/Chat/session-files/useSessionFiles.ts`
- `contracts/skill-run/v1.2.1/runs/artifact-list.schema.json`
- `contracts/skill-run/v1.2.1/runs/artifact-descriptor.schema.json`
- `contracts/skill-run/v1.2.1/http/endpoint-matrix.json`
- `contracts/skill-run/v1.2.1/fixtures/artifact-with-checksum.json`
- `apps/work/lat.md/file-platform.md`
- `apps/work/lat.md/skill-run.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md#Milestone M4 — Result, Artifact, and Session Files`
