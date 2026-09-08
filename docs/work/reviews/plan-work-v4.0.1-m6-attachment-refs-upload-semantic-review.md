# M6e Skill Run Attachment refs / upload — Semantic Plan Review

Review scope is canonical Plan `.cursor/plans/work-v4.0.1-m6-attachment-refs-upload.plan.md` (`plan_id: RM-11`)。Router result was `REQUIRED` (`INTEGRATION_HOTSPOT`, `SECURITY_OR_TRUST_BOUNDARY`)。Plan 声明 `acceptance_contract: smc.acceptance.v1`，Actual Semantic Review 强制。本审查不重开 APPROVED Stage PRD，不把 RM-11 标 DONE，不授权 download-by-ref、Bundle 改写、第二文件栈或其它 Plan。

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| Grounding | PASS | Gateway `callSkill` 仍只发 `{name,arguments}`；`authorizedFetch` 在有 body 时默认 JSON Content-Type；consumer lock P0 路径不含 attachment schema，`hasSkillRunApprovalDecisionBundle` 仅 v1.3.0；`getManagedFile(profileId,fileId)` 已存在；`SkillRunStartInput` 无 file ids；Chat `attachmentsDisabled={isSkillRunMode}` 且队列 `attachments: []`。与 Grounding Evidence Ledger 一致。 |
| Ponytail | PASS | C01–C05 均为 MODIFY_EXISTING：Gateway upload + `client_context`、FormData 跳过 JSON Content-Type、v1.4.0-only helper、Service upload-then-bind、start `fileIds`、composer 门。C06–C08 KEEP File Platform / P0 路径 / Artifact / MessageRow / Bundle。无第二 HTTP client、无 `skill-run:upload` channel、无 ChatInput 新 API、无 Artifact download 当 upload。 |
| Single writer | PASS | T1 拥有 Gateway / transport FormData / `hasSkillRunAttachmentBundle`。T2 拥有 Service / DTO `fileIds` / IPC validate。T3 拥有 Chat.tsx composer 门、队列 snapshot、lat.md，Depends On T2。`skill-run.ts` 仅 T2 写。顺序依赖匹配 hotspot。 |
| Coverage | PASS | AC-01 composer Catalog 门 → T3/V05。AC-02 upload-then-bind → T1/T2 V01/V03。AC-03 零 HTTP / 不静默丢附件 → V03/V04。AC-04 错误清洗 → V03。AC-05 队列 snapshot → V05。AC-06/07 隔离与无 `att_*` → V06/V09。DOD-02 Roadmap 非 DONE → V10。Live Scenario / Environment 为空，本 Item 无 LIVE Claim，合法。 |
| Lifecycle / boundary | PASS | Prompt-only 不 POST attachments。有 fileIds 时 pending-submit 覆盖 upload，accepted 后才 running。不合格路径 `rejectStart` 且零 upload / 零 stripped `tools/call`。Renderer 只传 file id。回显省略/`[]` 不当冲突。upload 不使用 `tools/call` 幂等 key。 |
| Verification | PASS | V01–V05 为现有 focused test 文件上的 LOCAL unit。V06/V09/V10 为文档 grep，冻结隔离、无 upload channel、approvalExpiry unsupported、RM-11 非 DONE。CLM-01/05 TARGETED_RERUN 有 invalidation（全 Skill disable → Catalog 门；snapshot 增加 fileIds）。无 prior blocking FAIL 被降级。 |
| Scope | PASS | Out 仍禁止 SHA256 Bundle 改写、P0 路径塞 attachment schema、download-by-ref、`inputSchema` 附件字段、Artifact 当用户附件、Expert/Local Chat 传输、MessageRow。INTEGRATION_HOTSPOT 是共享 Gateway/Service/Chat 文件，不是新 Owner。SECURITY 边界是 file id vs `att_*` 与 FormData 不带 JSON Content-Type。 |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | `hasSkillRunAttachmentBundle()` 只检查 `contracts/skill-run/v1.4.0`。不得把 attachment schema 写入 `REQUIRED_BUNDLE_PATHS`，不得改 first-complete finder。 |
| N2 | NOTE | 矩阵 `body: "multipart file"`。Plan 冻结 FormData 字段名为 `file`。不得再发明其它 form 字段或 `X-Idempotency-Key`。 |
| N3 | NOTE | `authorizedFetch` 只对 `FormData` 跳过默认 JSON Content-Type；其它 JSON 调用保持原状。不要新增第二 transport。 |
| N4 | NOTE | T2 `createMockGateway` 必须补 `uploadAttachment` / `hasAttachmentBundle`。不要第二 mock factory。Preload 已转发 start 对象时只改 shared DTO。 |
| N5 | NOTE | Composer 只收窄 `attachmentsDisabled`；ChatInput 生产 API 不新增。队列 snapshot `fileIds`，禁止把 Local `Attachment` bytes/path 当 Skill 传输。 |
| N6 | NOTE | V10 要求实施树中 RM-11 不是 DONE。Roadmap DONE 是后续独立 commit。 |

PASS -> `smc-plan-delivery`。本审查不修改 Plan，不创建 git commit。
