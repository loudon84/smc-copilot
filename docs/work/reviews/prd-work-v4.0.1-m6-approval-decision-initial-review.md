# M6c Skill Run Approval Decision — Initial PRD Review

Review scope is RM-09 Stage PRD v1.0.0 (`REVIEW_REQUIRED`). `grounded_commit` is `44b8e2c3741cba38c862f8a28bfc625eddce5c1c`；`source_revision` 是 `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-09`。本审查不重新 full Grounding，不批准 Plan，不把 RM-09 标 DONE，也不授权 RM-11。

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In 只在现有 Skill Run Gateway / Service / skill-run IPC / `modules/skill-run` 上叠加 narrow allow/deny，且只打 v1.3.0 canonical `/decision`。Out 排除 Attachment、v1.2.1/v1.3.0 Provider 字节修改、legacy path、`approvalExpiry`、comment UI、clarify respond、Chat `MessageRow` / Hermes 审批、新 Skill Chat 页。与 Roadmap Exit Criteria 和进口 Bundle 一致。 |
| G2 Existing capability | PASS | parser 已映射 `approval.requested` → `waiting-approval` + `approvalId`/`summary`。Gateway / skill-run IPC / StatusBar / start 幂等 / 单 active run 均已存在。决策 HTTP、决策 IPC、按钮正确标 PARTIAL。Local Chat 审批正确标 EXISTS 且禁止复用。Attachment / clarify respond 正确 KEEP absent。未发明第二 HTTP client 或第二 Chat 页。 |
| G3 Production ownership | PASS | Gateway 拥有 canonical HTTP。SkillRunService 拥有当前 `approval_id` 绑定、决策幂等 key、receipt 非终态解释。现有 skill-run IPC 拥有狭窄入口。`modules/skill-run` 拥有按钮。Backend 仍是 enforcement owner。Chat / MessageList / File / Expert 不分裂 owner。 |
| G4 Classification | PASS | C01–C05 均为对现有 owner 的 MODIFY（HTTP、bind/idempotency、IPC、UI、v1.3.0 可用性）。C06 KEEP parser/status 映射。C07 KEEP Local Chat。C08 KEEP Attachment/Bundle/Expert。无 REPLACE，无需 Removal。Legacy path 明确「不得调用」，不是兼容层。未把决策做成新 Gateway 或新协议。 |
| G5 Contract and security | PASS | 只消费 v1.3.0 matrix/schema/幂等。禁止 legacy path、禁止 Renderer 持有 JWT/origin/幂等 key/任意 approval id。禁止改 SHA256 覆盖的 Provider 文件。P0 lock 不得因 approval schema 把 v1.2.1 判 incomplete。决策失败清洗错误且不回退终态。 |
| G6 Behaviour to AC | PASS | AC-01 按钮门。AC-02 Allow canonical HTTP + receipt 非终态继续 SSE/poll。AC-03 Deny 跟随 Public status 且不得写成 cancelled；Cancel ≠ Deny。AC-04 幂等 replay/conflict/already-decided。AC-05 无资格 / 无 v1.3.0 零 HTTP。AC-06 不复用 Chat 审批、不启用 Attachment、不改 v1.2.1。AC-07 等待审批仍挡第二 start。 |
| G7 Evidence integrity | PASS | CL-01–CL-04 为新决策路径 NEW_EVIDENCE。CL-05 Local 路径 REUSE + Skill 负向 NEW。CL-06 正确把 RM-08「无允许/拒绝控件」标为 PROVEN_BUT_AFFECTED 并 TARGETED_RERUN，而不是把旧 AC 藏成 observation。CL-07/CL-08 REUSE Bundle unsupported 与既有 start/SSE。未绑定具体 test file / fixture 文件名作为产品合同。无「blocking FAIL 下一项再修」。 |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | 可选 `comment` 本阶段 KEEP absent，符合父 PRD「narrow」。若以后要评论框，另开 Item，不要在实施时顺手加上。 |
| N2 | NOTE | Consumer lock 当前「第一个 checksum-complete 目录」即可开 P0 门。C05 要求决策 fail-closed unless v1.3.0 complete，且不得把 approval schema 塞进 v1.2.1 必选路径。Plan 必须分开 P0 gate 与 decision 可用性，禁止为了决策把 v1.2.1 判死。 |
| N3 | NOTE | 200 receipt 的 `status` 在 allow replay fixture 中可以是 `WAITING_APPROVAL`；deny 在 Hermes live 可为 `COMPLETED`。Plan 只能把 **非终态 receipt** 当「已接受、Run 未推进」；若 receipt 已是合同终态，走既有 Public status 映射，仍不得把 deny 特判为 `cancelled`。 |
| N4 | NOTE | C04 的 UI owner 是 `modules/skill-run`。Source Anchors 中的 StatusBar 是当前 compact 表面证据，不是禁止把按钮放在该 module 内更合适的子区域。禁止接到 `MessageRow`。 |
| N5 | NOTE | 决策幂等 key 不得复用 `tools/call` pending-submit key。scope 是 org+user+run_id+approval_id。 |

PASS -> `smc-prd-converge`。本审查不修改 PRD，不创建 git commit。
