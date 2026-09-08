# M6e Skill Run Attachment refs / upload — Initial PRD Review

Review scope is RM-11 Stage PRD v1.0.0 (`REVIEW_REQUIRED`)。`grounded_commit` 是 `9d00381a938b04f6acd4194b6d6455e00cbc7bb4`；`source_revision` 是 `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-11`。本审查不重新 full Grounding，不修改 PRD，不批准 Plan，不把 RM-11 标 DONE，也不授权 preview / `approvalExpiry` / Bundle 改写。

抽查（非 rediscovery）：HEAD 仍为该 `grounded_commit`；v1.4.0 RELEASE 已关闭 `POST /api/v1/attachments` 与 `params.client_context.attachment_refs`；P0 `REQUIRED_BUNDLE_PATHS` 仍不含 attachment schema；Gateway `tools/call` 仍无 `client_context`；Skill composer 仍 `attachmentsDisabled={isSkillRunMode}` 且队列丢弃附件；Catalog parser 已投影 `supportsAttachments === true`。与 Evidence Baseline 一致。

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In 只在现有 File Platform、Skill Run Gateway / Service、skill-run start IPC、现有 Chat composer 上叠加 narrow 用户附件：multipart upload + `client_context.attachment_refs`。Out 排除改 SHA256 覆盖的 Provider 字节、P0 必选路径塞 attachment schema、download-by-ref / Provider 预览、发明 `inputSchema` 附件字段、Artifact 当用户附件、`approvalExpiry`、clarify respond、Chat `MessageRow`、Expert/Local Chat 传输、第二 File/Session/HTTP owner。与 Roadmap RM-11 Exit Criteria 和进口 v1.4.0 Bundle 一致。 |
| G2 Existing capability | PASS | File Platform picker/policy/staging、Catalog `supportsAttachments` 投影、Skill start/queue、Gateway HTTP、consumer lock、Artifact upsert/download、RM-09 decision、Local Chat `Attachment[]`、Expert `attachmentRefs` 均已存在。upload HTTP 与 `client_context` 正确标 PARTIAL。preview / expiry / clarify 正确 KEEP absent。未发明第二文件栈、第二 Gateway 或新 Skill Chat 页。未把 Artifact remote identity 误标为可复用 upload。 |
| G3 Production ownership | PASS | File Platform 拥有字节与本地门。Gateway 拥有 upload HTTP 与带 `client_context` 的 `tools/call`。SkillRunService 拥有 Catalog/Bundle 资格、upload-then-bind、fail-closed。现有 skill-run IPC 拥有 file id 入口。Chat composer 拥有 disable 门与队列 snapshot。Backend 仍是 attachment enforcement owner。Renderer / MessageList / Expert 不拥有 Skill 附件传输。Composer 承担附加入口符合父 PRD「复用 ChatInput」，不是把 StatusBar 做成第二 composer。 |
| G4 Classification | PASS | C01–C05 均为对现有 owner 的 MODIFY（upload HTTP、binding、Service 资格、start IPC、composer 门）。C06 KEEP File Platform picker/policy。C07 KEEP P0 lock 路径。C08 KEEP Artifact/Approval/Local/Expert/Bundle/preview/expiry。无 ADD 新 Service/Protocol，无 REPLACE，无需 Removal。不把 `attachmentsDisabled` 整段 REMOVE，只收窄启用条件。C06「KEEP + 负向门」的负向属于 C03/C04 资格规则，不是第二 File owner。 |
| G5 Contract and security | PASS | 只消费 v1.4.0 已发布 RELEASE/matrix/receipt/error enum/binding fixture；合同缺口（无 request schema、无 upload 幂等、无 preview）fail-closed 不猜。禁止改 SHA256 覆盖文件。Renderer 不持有 JWT/origin/`att_*`/upload URL/Skill 传输用绝对路径。start 只扩展现有 `skillRun`；字节走现有 `files` API。P0 lock 不得因 attachment schema 把 v1.2.1 判 incomplete。错误清洗且不得忽略附件继续执行。 |
| G6 Behaviour to AC | PASS | AC-01 Catalog UX 门。AC-02 upload-then-bind、无幂等 header、纯 prompt 可省略 refs。AC-03 无资格 / 无 v1.4.0 / 非 ManagedFile：零 upload 且不静默丢附件后执行。AC-04 Bundle 错误码清洗。AC-05 队列 snapshot。AC-06 Artifact/Approval/Local/Expert/Bundle/P0 回归。AC-07 Renderer 拿不到 `att_*`/URL/路径。Behaviour 7（`new-ref-allowed` 不得盲目重传）未单列 AC，见 N3，不升 MAJOR。 |
| G7 Evidence integrity | PASS | CL-01/CL-04 为新写路径 NEW_EVIDENCE。CL-02/CL-05 正确把旧「Skill 全禁用 / 队列丢附件」标为 PROVEN_BUT_AFFECTED 并 TARGETED_RERUN，而不是把旧 AC 藏成 observation。CL-03 picker REUSE + bind NEW。CL-06/CL-07 REUSE + 负向。CL-08 REUSE RM-09 P0 路径形状 + 负向证明 v1.4.0 门。未把具体 test file 绑成产品合同。无「blocking FAIL 允许 DONE、下一 RM 再修」。 |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | Consumer lock 当前「第一个 checksum-complete 目录」即可开 P0 门。C03/C07 要求 upload fail-closed unless v1.4.0 complete，且不得把 attachment schema 塞进 P0 必选路径。Plan 必须分开 P0 gate 与 attachment 可用性，禁止为了附件把 v1.2.1 判死。同构于 RM-09 的 v1.3.0 决策门。 |
| N2 | NOTE | Renderer 必须传 File Platform file id（不像 approval_id 已由 Main 持有）。Plan 须在 Main 按 start 的 profile/session 解析这些 id；跨 profile、未知、非 ManagedFile、仅 legacy path/dataUrl 一律 fail-closed 且零 upload。禁止信任 Renderer 自报 `supportsAttachments` 或自造 `att_*`。 |
| N3 | NOTE | 矩阵 `retry=new-ref-allowed`。Plan 不得在网络不确定时自动重传同一文件再把多个 ref 绑进一次 `tools/call`。用户重试必须是一次新的 start。`tools/call` 既有 pending-submit key 不得用于 upload。 |
| N4 | NOTE | Accepted `attachment_refs` 在 schema 中 default `[]` 且非 required。Plan 只能把 **显式出现且非空** 的回显当「见到回显」；省略字段不得当成与已发送集合冲突。回显不得进入 Renderer。`run_id` 仍是 Accepted 身份。 |
| N5 | NOTE | C05 的 UX owner 是现有 Chat composer（`ChatInput` + Chat 提交/队列），不是 `modules/skill-run` StatusBar，也不是 `MessageRow`。Source Anchors 中的 Chat 文件是当前 composer 表面证据。禁止把 Skill 附件接到 Local Chat send 或 Expert start。 |
| N6 | NOTE | 现有 authorized transport 在有 body 时可能默认 JSON `Content-Type`。这是 Plan 层对 multipart 的落地约束，不是 PRD 新 Owner。实施时不得因此 JSON 编码文件体，也不得发明 matrix 未列的 form 字段。 |
| N7 | NOTE | 不得把 `att_*` 写入 Artifact `remote_artifact_id`，也不得为预览去 download-by-ref。本地 File Platform 对 staging 副本的既有预览保持 KEEP。`approvalExpiry` / clarify respond 本阶段 KEEP absent。 |

PASS -> `smc-prd-converge`。本审查不修改 PRD，不创建 git commit。
