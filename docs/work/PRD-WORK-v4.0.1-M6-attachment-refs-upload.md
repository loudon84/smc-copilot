---
work_item_id: RM-11
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-08T15:02:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-11
grounded_commit: 9d00381a938b04f6acd4194b6d6455e00cbc7bb4
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.4.0
product_decision: user-input:2026-09-08-bundle-import-then-rm11-prd
---

# WORK PRD v4.0.1 M6e — Skill Run Attachment refs / upload

本 Stage PRD 关闭 Roadmap RM-11：在 **已进口** 的 `SKILL-RUN-CONTRACT` v1.4.0 上，为现有 Skill Run 增加 **narrow 用户附件**：File Platform 管字节与本地选文件；现有 Gateway 打 v1.4.0 `POST /api/v1/attachments` 拿到不透明 `attachment_ref`；现有 `tools/call` 只经 **`params.client_context.attachment_refs`** 绑定。不修改 Provider Bundle 字节，不发明 Catalog `inputSchema` 附件字段名，不把 Artifact download 当用户上传，不把 Local Chat `Attachment` 字节/路径直接当 Provider 传输，不开启 download-by-ref / Provider 预览，不开启 `approvalExpiry`。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-11` / M6e P1 Attachment refs / upload 与 File Platform 接入 |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-11` |
| Architecture | 父 PRD：Attachment 在公开 refs/upload 合同完成前禁用并解释原因，不得静默丢弃；File Platform 管 bytes；Skill Run 只传 ref；Artifact Preview/Save As 继续走 `hermesAPI.files`；不新增平行 Session/File owner。 |
| Repository baseline | `9d00381a938b04f6acd4194b6d6455e00cbc7bb4`（v1.4.0 Bundle 进口 + consumer-lock）。RM-11 在当前工作树已标 `READY`；该 READY 行尚未进入本 baseline commit。 |
| Dependencies | RM-06 is `DONE`。RM-05 已把 Skill Artifact 收口到 File Platform（run-scoped `remote_artifact_id`，角色 `agent-output`）。RM-09 已关闭 Approval decision；本 Item 不改决策路径。 |
| Provider input | `contracts/skill-run/v1.4.0/`。`attachments=supported`；`approval`/`approvalDecision=supported`；`approvalExpiry=unsupported`。`wireBreaking=false`；supersedes 含 1.3.0。Tag pin：`skill-run-contract-v1.4.0` → `5d0e538fa68655f0084850d5378398f622ed90ba`。Upload：`POST /api/v1/attachments`，`body=multipart file`，`retry=new-ref-allowed`，header 仅矩阵列出的 `Authorization`（**无** `X-Idempotency-Key`）。Receipt：`attachment_ref` 形如 `att_*`，含 `name` / `size_bytes` / `checksum_sha256` / `content_type` / `expires_at`。绑定：**只允许** `params.client_context.attachment_refs`（RELEASE 写死，不是 Catalog 字段猜测）。Accepted `structuredContent` 可回显 `attachment_refs`。Catalog 有布尔 `supportsAttachments`（默认 false；fixture 样例仍为 false）。错误码关闭枚举见 attachment-error schema。 |
| Contract gaps (fail-closed, 不猜) | 无 upload **request** schema（只消费矩阵 `multipart file`）。上传无幂等 header。缺 too-large / unauthorized / unsupported-type 成功对照 fixture，以及 `supportsAttachments: true` 的 Catalog 样例；Work 仍只使用已发布错误码枚举与矩阵，不得发明新码。`tools/call` request schema 仍是开放 JsonRpc；绑定以 RELEASE + binding fixture 为准。**无** download-by-ref / preview 合同；RELEASE 也未写 `preview: unsupported` → Work 视为预览缺失。上传 **不得**要求已有 `run_id`。 |
| Current Catalog | parser 已把 `supportsAttachments === true` 投影到 Catalog DTO；其余一律 false。Renderer 已持有该布尔，但未用于放行附件。 |
| Current Gateway | Catalog / `tools/call` / snapshot / SSE / cancel / artifacts / v1.3.0 decision。`tools/call` 只发 `{ name, arguments }`，**没有** `client_context`。**没有** attachment upload HTTP。P0 lock 仍认任一 checksum-complete Bundle；决策另证 v1.3.0。尚无 v1.4.0 attachment 可用性门。 |
| Current start / IPC | `SkillRunStartInput` 只有 `toolName/prompt/clientRequestId/sessionId/profileId/extraParameters`，无 file id / ref。Skill 队列 snapshot 不含附件；入队时显式丢掉 composer `Attachment[]`。 |
| Current Chat UX | Skill mode 无条件 `attachmentsDisabled`；`ChatInput` 隐藏附加并拒绝 `addFiles`（文案 `skillRun.attachmentsDisabled`）。Composer 选文件已走 File Platform `pickFiles` / `importDroppedFiles`，再适配为 Local Chat `Attachment`（`id` 为 ManagedFile id）。该 `Attachment` 仍可含 dataUrl/text/path，那是 Local Chat / Hermes 传输，**不是** Skill Run 合同。 |
| Current File Platform | Owner：Main files。已有 size/extension policy、staging、`provider=skill-run`。`upsertSkillRunRemoteArtifact` 是 **Artifact 产出**（run-scoped `remote_artifact_id`），不是用户输入附件。无 `attachment_ref` 字段；不得把 Artifact download 当 upload。 |
| Out of this Item | 改 v1.2.1 / v1.3.0 / v1.4.0 Provider 字节；download-by-ref / Provider 附件预览；`approvalExpiry`；clarify respond；组织推荐；Chat `MessageRow`；Expert start；第二 File/Session owner；把 Local Chat `Attachment` 字节直接 POST 给 Provider。 |

## Problem and Outcome

父 PRD 要求：公开 refs/upload 合同完成前，Skill mode 禁用附件并解释原因，不得静默丢弃。v1.4.0 已关闭 upload 与 `client_context.attachment_refs` 绑定。当前 Work 仍对 **全部** Skill 隐藏附加按钮；即使 composer 拿到了 File Platform 文件，Skill start 也会丢掉附件且从不 upload。若错误地把 Local Chat `Attachment`（dataUrl / 绝对路径）或 Artifact download 接到 Provider，会越过 File Platform 与 Bundle 绑定通道。

完成后：

- 仅当 Main 按当前 auth scope 重确认的 Catalog 条目 `supportsAttachments === true`，且存在 checksum-complete v1.4.0 时，才允许为该次 Skill 提交附加文件。
- 选文件、大小/类型拒绝、本地 staging 继续走现有 File Platform。Renderer **不**铸造 `att_*`，**不**持有 JWT / Backend origin / 文件绝对路径作为 Skill 传输。
- Main 在 `tools/call` **之前**对每个合格 ManagedFile 调用 `POST /api/v1/attachments`（multipart file，无幂等 header），再把得到的 `attachment_ref` 放入 `params.client_context.attachment_refs`。
- `supportsAttachments !== true`、无 v1.4.0、或用户已附加却不能绑定：拒绝提交并解释，**不得**去掉附件后继续 start。
- 无 files 且 Catalog 允许附件：仍允许纯 prompt start（附件非默认必填）。
- 无 download-by-ref：Composer / chip 只展示清洗后的文件名与大小；不得把 Provider 附件 bytes 或裸 URL 交给 Renderer。本地 File Platform 对 **已 staging 的本地副本** 的既有预览保持可用，那不是 Provider attachment preview。
- Artifact list/download、Approval decision、Local Chat 附件、Expert start 保持原状。

## Scope

- In: 在现有 File Platform、Skill Run Gateway / Service、skill-run IPC、现有 Chat composer（`ChatInput` + Chat 提交/队列）上接入 v1.4.0 用户附件；Main 绑定 File Platform file id → upload → `client_context.attachment_refs`；无 v1.4.0 或 Catalog 不允许时 fail-closed 零 upload HTTP。
- Out: 改 `contracts/skill-run/v1.2.1`、v1.3.0 或 v1.4.0 中 Provider 所有、由 `SHA256SUMS` 覆盖的文件；把 attachment schema 塞进 P0 `REQUIRED_BUNDLE_PATHS`；download-by-ref / Provider 预览；发明 `inputSchema` 附件字段；把 Artifact 当用户附件；`approvalExpiry`；clarify respond；Chat `MessageRow`；Hermes / Expert 附件通道；新 Skill Chat 页；第二 File/Session/HTTP owner。
- Production Owner: File Platform 拥有字节、picker、size/type policy、本地 staging。`SkillRunGatewayClient` 拥有 upload HTTP 与带 `client_context` 的 `tools/call`。`SkillRunService` 拥有「何时 upload、绑哪些 ref、缺 Bundle / 不支持附件时 fail-closed」。现有 skill-run IPC 拥有狭窄 start 扩展（File Platform file id，不是 `att_*`）。现有 Chat composer 拥有「仅当该 Skill 允许时解除 disable」与队列 snapshot。Backend 仍是 attachment enforcement owner。Renderer / MessageList / Expert 不拥有 Skill Run 附件传输。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| v1.4.0 Attachment contract | Provider Bundle | `attachments=supported`；upload path + receipt + binding fixture + error enum 已发布；无 request schema / 无 upload 幂等 / 无 preview | EXISTS（external） |
| v1.2.1 / v1.3.0 Bundles | Provider Bundle | 字节冻结；attachments 仍 unsupported 或不含本 Item 写路径 | KEEP |
| Consumer lock / P0 gate | Skill Run consumer lock | 第一个 checksum-complete 目录即可开 Catalog/start；P0 必选路径不含 attachment schema；决策另证 v1.3.0 | PARTIAL（upload 须另证 v1.4.0） |
| Catalog `supportsAttachments` | Contract parser + Catalog DTO | 已投影 `=== true`；UI 未用作放行门 | EXISTS（未接线） |
| Gateway HTTP | `SkillRunGatewayClient` | 无 upload；`tools/call` 无 `client_context` | PARTIAL |
| Skill-run start IPC | Existing skill-run IPC | 无 file id；不接受 `att_*` | PARTIAL |
| Skill composer attach UX | Chat `ChatInput` + Chat 提交 | Skill mode 一律 disable；队列丢弃附件 | PARTIAL |
| File Platform pick/stage/policy | Main File Platform + `hermesAPI.files` | 已服务 Local Chat composer | EXISTS |
| Skill Artifact remote identity | File Platform + SkillRunService | run-scoped artifact upsert / download | KEEP（禁止复用为 upload） |
| Local Chat `Attachment[]` | Chat / files adapter | dataUrl/text/path 给 Hermes/Local | EXISTS（禁止当 Skill 传输） |
| Expert start attachments | Expert owners | 独立 `attachmentRefs` 合同 | KEEP |
| Approval decision | RM-09 owners | v1.3.0 `/decision` | KEEP |
| Provider attachment preview | — | Bundle 无 download-by-ref | KEEP absent |
| `approvalExpiry` / clarify respond | Provider / RM-08 | unsupported / 无 respond | KEEP absent |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Attachment upload HTTP | Existing `SkillRunGatewayClient` | 仅 POST v1.4.0 `/api/v1/attachments`；multipart file；必带 Authorization；**不**发 `X-Idempotency-Key`；解析 bare receipt；不 JSON 编码文件体 | MODIFY |
| `tools/call` binding | Existing Gateway + SkillRunService | `params` 含既有 `name`/`arguments` **以及** `client_context.attachment_refs`（仅 Main 刚拿到的 `att_*`）；不把 ref 写入 arguments 猜测键 | MODIFY |
| Upload + bind orchestration | Existing `SkillRunService` | start 时 Main 重确认 Catalog；仅 `supportsAttachments === true` 且 v1.4.0 complete 才 upload；先 upload 再 `tools/call`；无 run_id 前置；错误码按 Bundle 枚举清洗 | MODIFY |
| Narrow start IPC | Existing `hermesAPI.skillRun` | 可选 File Platform file id 列表；Renderer 不传 URL、JWT、`att_*`、本机路径、文件 bytes | MODIFY |
| Composer enablement | Existing Chat composer | 仅 Skill mode **且**当前选中 Skill 的 Catalog `supportsAttachments === true` 时解除 disable；否则保持禁用并解释；队列 snapshot 必须带上本次 file id，出队不得重读当前 composer | MODIFY |
| File pick / size / type / staging | Existing File Platform | 继续第一道本地门；Skill 不另起 picker。仅 ManagedFile 身份可进入 Skill upload；legacy 仅含 path/dataUrl 的 Attachment 不合格 | KEEP（语义冻结）+ 负向门 |
| Artifact path | Existing File Platform | 行为不变；禁止用 artifact download 填充用户附件 | KEEP |
| Decision / Local Chat / Expert | 对应 Owner | 零调用本 Item 的 upload/bind | KEEP |
| P0 lock 必选路径 | Existing consumer lock | 不因 attachment 把 v1.2.1 判 incomplete | KEEP |
| Provider preview / expiry / clarify | — | 继续缺失 | KEEP absent |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Multipart upload on existing Gateway | MODIFY | 现有 Gateway 已是唯一 Skill Run HTTP owner。补 upload，禁止新 client、禁止 Renderer fetch、禁止 JSON body、禁止发明幂等 header。 |
| C02 | `client_context.attachment_refs` on existing `tools/call` | MODIFY | RELEASE 写死唯一绑定通道。不得猜 `inputSchema` 字段，不得把 ref 塞进 prompt。 |
| C03 | Upload/bind eligibility in existing SkillRunService | MODIFY | Service 已是 start lifecycle owner。Main 不信任 Renderer 的 `supportsAttachments` 或自报 ref。无 v1.4.0 零 HTTP。 |
| C04 | Narrow skill-run start IPC (file ids) | MODIFY | 父 PRD 要求扩展现有 `skillRun` 表面，不新增平行协议。身份是 File Platform file id，不是 `att_*`。 |
| C05 | Composer disable gate + queue snapshot | MODIFY | 现有 `ChatInput` 已有 disable；从「全部 Skill mode」收窄为 Catalog 门。Chat 已是提交/队列 owner。禁止静默丢弃已选文件。 |
| C06 | File Platform picker/policy/staging | KEEP | 已能承载选文件与本地安全门。禁止第二文件栈。禁止把 Artifact upsert/download 当用户附件。 |
| C07 | P0 consumer lock paths | KEEP | 与 RM-09 同构：attachment 合同只在 v1.4.0；不得把 attachment schema 加入 P0 必选路径。 |
| C08 | Artifact / Approval / Local Chat / Expert / Bundle bytes / preview / expiry | KEEP | 分属 RM-05 / RM-09 / Chat / Expert / Provider。本 Item 零改那些写路径。 |

## Replacement / Removal Matrix

本 Item 无 REPLACE。不删除 Skill mode 的「附件禁用并解释」能力，只收窄启用条件。不删除 Local Chat `Attachment[]`、Expert `attachmentRefs`、Artifact download、v1.2.1/v1.3.0 Bundle。不把 `attachmentsDisabled` 整段 REMOVE。

## Behaviour — Narrow user attachments

1. **Catalog gate.** 仅当 Main 在 start 时按当前 auth scope 重拉/重确认的 Catalog 条目满足 `supportsAttachments === true` 时，才允许 upload 与绑定。Renderer 可用同一布尔做 UX 放行，但 **不得**作为 enforcement。`!== true`（含缺省）时 composer 保持禁用并解释；若仍带 file id 进入 start → fail-closed，不发 upload，不发无附件的 `tools/call` 来「凑合执行」。
2. **Bundle gate.** 无 checksum-complete v1.4.0 时，任何 Skill 附件提交 fail-closed，零 `POST /api/v1/attachments`。不得为迁就附件把 attachment schema 写入 P0 必选路径，以免仅有 v1.2.1 时 Catalog/start 无法开门。v1.2.1 / v1.3.0 不得被当作 upload 合同。
3. **File identity.** 用户经现有 File Platform picker / drop / ingest 得到 ManagedFile。start 只接受这些 file id。不合格：Local Chat 仅有的 dataUrl/text/绝对路径、Expert `attachmentRefs`、Artifact `remote_artifact_id`、Renderer 自造的 `att_*`。
4. **Local policy first.** File Platform 既有大小、拒绝扩展名与 staging 规则仍是第一道门。被本地拒绝的文件不得出站。Provider 第二道门使用 Bundle 错误码（`ATTACHMENT_TOO_LARGE` / `TYPE_UNSUPPORTED` / `SCAN_BLOCKED` 等），已清洗展示。
5. **Cardinality.** Provider 未发布附件数量上限。Work 继续沿用现有 composer / File Platform 每消息上限，不发明 Provider max。
6. **Upload HTTP.** 每个合格文件一次 `POST /api/v1/attachments`，`multipart file`，`Authorization` 由现有 authorized transport 注入。不设 `X-Idempotency-Key`。不要求 `run_id`。不发明额外 form 字段名（矩阵未给 request schema → 只发送文件体）。成功解析 bare receipt；`attachment_ref` 必须匹配 `^att_[A-Za-z0-9_-]+$`。
7. **Retry.** 矩阵 `retry=new-ref-allowed`：不得假设重试得到同一 ref。网络不确定时 **不得**盲目重传同一文件（会铸造新 ref）。fail-closed 并解释；用户可重新附加后作为新提交。
8. **Bind.** 全部目标文件成功拿到 ref 之后，才发 `tools/call`。`client_context.attachment_refs` 只含本次 Main 持有的 ref，顺序稳定为用户附加顺序。`arguments` 仍只含既有 prompt / extra string 绑定，不含附件。缺任一 ref → 不调用 Tool。
9. **Expiry / invalid / scope.** `expires_at` 仅作 Main 诊断；过期、未知、跨用户、非法 ref 按 Bundle 错误码 fail-closed，不得忽略附件继续执行。start 在 upload 成功但 `tools/call` 失败后，不把半截 ref 留给 Renderer 重放。
10. **Accepted echo.** `structuredContent.run_id` 仍是 Accepted 身份。回显 `attachment_refs` 不得交给 Renderer。Main 若见到回显且与已发送集合不一致，fail-closed，不得静默丢 ref。
11. **No silent drop.** 用户已选文件但 Catalog 不允许、无 v1.4.0、upload 失败、或绑定失败：拒绝该次提交并解释。禁止去掉附件后当纯 prompt 发出。
12. **Optional files.** Catalog 允许附件但用户未选文件：纯 prompt start 保持允许。
13. **Queue.** 忙碌入队必须 snapshot 本次 file id（与 toolName/prompt/`clientRequestId` 一起）。出队不得重读当前 composer 或当前 Skill 选择中的附件。
14. **Preview.** 无 Provider download-by-ref：不得把附件 bytes 或未认证 URL 给 Renderer。Composer chip 只显示清洗文件名与大小。本地 staging 副本走既有 File Platform 预览（KEEP）。不得把 Artifact preview 合同套到用户附件 ref 上。
15. **Concurrency.** 单一 active Skill Run 规则不变。upload 不是第二次 start，也不替代 `tools/call` 幂等 key。`tools/call` 仍用既有 pending-submit `X-Idempotency-Key`；该 key **不得**用在 upload。
16. **English-only** 新文案。

## Contract and Security Boundary

- 只消费 v1.4.0 已发布的 RELEASE、endpoint matrix、upload receipt schema、error enum、binding fixture、Catalog `supportsAttachments`。不得扫描 Provider 源码补字段、补 request schema、补 preview、补幂等。
- 不得修改 `contracts/skill-run/v1.2.1/`、v1.3.0 或 v1.4.0 中 Provider 所有、由 `SHA256SUMS` 覆盖的文件。Work 可在 v1.4.0 目录增加 **非 SHA256 覆盖** 的 `consumer-lock.json`（已存在）；本 Item 实施不得改 lock 所 pin 的 tag/checksum 身份。
- Renderer 不持有 JWT、Backend origin、`att_*`、upload URL、文件绝对路径（作为 Skill 传输）或 raw Provider event。
- 附件 IPC 只扩展现有 `window.hermesAPI.skillRun.start`；字节进出继续走现有 `window.hermesAPI.files`。不新增 raw fetch。不把 Skill 附件接到 Expert start 或 Local Chat send 管道。
- Backend 仍是 Auth/RBAC/Policy/Attachment enforcement owner；Work 按钮只是 UX。
- telemetry 若记录附件，只允许计数、错误码、file id 指纹等 M5 允许名单字段；不写文件名全文以外的路径、bytes、checksum 原文、JWT、`att_*`。
- `approvalExpiry` 保持 unsupported；clarify respond 保持缺失。

## Acceptance Criteria

1. 当前选中 Skill 经 Catalog 投影 `supportsAttachments === true` 时，现有 composer 出现附加入口；`!== true` 或未选 Skill 时保持禁用并解释，且 `addFiles` 仍被拒绝。
2. 允许附加且 checksum-complete v1.4.0：用户经 File Platform 选文件后提交，Main 先 `POST /api/v1/attachments`（multipart，无 `X-Idempotency-Key`），再 `tools/call` 且 `params.client_context.attachment_refs` 含对应 `att_*`；`arguments` 不含猜测附件字段。无文件时纯 prompt start 仍成功且 `client_context.attachment_refs` 可省略或为空。
3. `supportsAttachments !== true`、无 v1.4.0、file id 无法解析为 ManagedFile、或仅有 legacy path/dataUrl：start 被拒绝，**零** upload HTTP，**不**发出去掉附件的 `tools/call`。
4. Provider 返回已枚举附件错误（unauthorized / not found / expired / scope denied / ref invalid / too large / type unsupported / scan blocked / not supported）：用户看到已清洗错误；不泄漏 JWT/origin/绝对路径/bytes；不把 Run 标为成功。
5. 忙碌队列出队时仍使用入队 snapshot 的 file id 与 toolName，不重读当前 composer 附件。
6. Artifact list/download、Approval allow/deny、Local Chat 附件、Expert start 行为不变；本 Item 路径不调用那些写通道。不声称 Provider 附件预览或 `approvalExpiry` 已启用。不修改 v1.2.1 / v1.3.0 / v1.4.0 Provider 字节。P0 Catalog/start 在仅有 checksum-complete v1.2.1 时仍可开门。
7. Renderer 无法从 Skill IPC 取得 `att_*`、upload URL 或文件绝对路径。Composer 不把 Provider 附件 bytes 交给 MessageList。

## Acceptance Claim Baseline

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason |
|---|---|---|---|---|---|---|---|
| CL-01 | 先 upload 再以 `client_context.attachment_refs` 绑定 `tools/call` | HTTP 顺序、path、multipart、无幂等 header、params 形状可观察 | Yes | 无 upload / 无 client_context | NOT_TESTED | NEW_EVIDENCE | v1.4.0 新写路径 |
| CL-02 | Catalog false / 无 v1.4.0 / 无合格 file id：零 upload 且不静默丢附件后执行 | 负向：零 attachment POST；start 拒绝 | Yes | Skill mode 一律 disable；start 丢弃附件 | PROVEN_BUT_AFFECTED（旧「全禁用」） | TARGETED_RERUN + NEW_EVIDENCE | 本 Item 有意收窄 disable 门，旧「全部 Skill 无附件」不再是产品终态 |
| CL-03 | File Platform 拥有字节；Renderer 不持有 `att_*` | start 输入为 file id；投影/IPC 无 ref | Yes | File Platform picker 已存在；Skill start 无 file id | PROVEN_FRESH（picker）+ NOT_TESTED（bind） | REUSE_EVIDENCE（picker/policy）+ NEW_EVIDENCE（IPC/bind） | 新绑定通道 |
| CL-04 | Bundle 附件错误码已清洗；过期/非法不得忽略附件继续跑 | 错误码与非成功 phase 可观察 | Yes | 无 | NOT_TESTED | NEW_EVIDENCE | 新错误面 |
| CL-05 | 队列 snapshot 含 file id | 出队不跟随后续 composer 变更 | Yes | 队列已 snapshot tool/prompt，但附件被丢 | PROVEN_BUT_AFFECTED | TARGETED_RERUN | 本 Item 把附件纳入 snapshot |
| CL-06 | Artifact / Approval / Local Chat / Expert 不被本路径调用 | 负向：零串通道 | Yes | RM-05/09 与 Local/Expert 独立存在 | PROVEN_FRESH | REUSE_EVIDENCE + 本 Item 负向 NEW | 新增 upload 不得接到那些 owner |
| CL-07 | 无 Provider download-by-ref / 无 expiry 产品 | 无附件预览 URL；无过期倒计时合同 | Yes | Bundle 无该 endpoint；`approvalExpiry=unsupported` | PROVEN_FRESH | REUSE_EVIDENCE | 合同未关闭预览/过期 |
| CL-08 | P0 Catalog/start 与 v1.2.1 lock 不被 attachment schema 卡死 | 仅 v1.2.1 complete 时 P0 仍开；upload 仍关 | Yes | RM-09 已证 P0 路径不含 decision schema | PROVEN_FRESH（P0 路径形状） | REUSE_EVIDENCE + 负向 NEW（v1.4.0 门） | 与 decision 门同构，需证明未把 attachment 写入 P0 必选 |

## Definition of Done

1. C01–C05 有 Gateway / Service / IPC / composer 的 focused 证明，并覆盖 CL-01–CL-05。C06–C08 由既有 File Platform、Artifact/Approval/Local/Expert 套件与 lock 回归，加上本 Item 负向证明。
2. RM-11 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。
3. 发现需要 preview download-by-ref、改 Bundle、发明 `inputSchema` 附件字段、把 Artifact 当用户附件、复用 Expert/Local Chat 传输，或把 deny/cancel 与附件混写的工作，必须返回对应 Item / Provider，不得混入本 Item。

## Source Anchors

- `apps/work/src/main/skill-run/skill-run-gateway-client.ts`
- `apps/work/src/main/skill-run/skill-run-service.ts`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts`
- `apps/work/src/main/skill-run/skill-run-ipc.ts`
- `apps/work/src/preload/skill-run-api.ts`
- `apps/work/src/shared/skill-run.ts`
- `apps/work/src/shared/files/`
- `apps/work/src/main/files/`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx`
- `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx`
- `apps/work/src/renderer/src/screens/Chat/composerFilePlatform.ts`
- `apps/work/src/shared/i18n/locales/en/skillRun.ts`
- `contracts/skill-run/v1.4.0/RELEASE.md`
- `contracts/skill-run/v1.4.0/http/endpoint-matrix.json`
- `contracts/skill-run/v1.4.0/runs/attachment-upload.response.schema.json`
- `contracts/skill-run/v1.4.0/runs/attachment-error.schema.json`
- `contracts/skill-run/v1.4.0/fixtures/tools-call-attachment-binding.json`
- `contracts/skill-run/v1.4.0/fixtures/attachment-upload-accepted.json`
- `contracts/skill-run/v1.4.0/capabilities/unsupported.schema.json`
- `contracts/skill-run/v1.4.0/consumer-lock.json`
- `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md`
- `docs/work/PRD-WORK-v4.0.1-M4-result-artifact-and-session-files.md`
- `docs/work/PRD-WORK-v4.0.1-M6-approval-decision.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
