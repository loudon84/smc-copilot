# M6d Limited JSON Schema Parameter Form — Initial PRD Review

Review scope is RM-10 Stage PRD v1.0.0 (`REVIEW_REQUIRED`). `grounded_commit` is `c58fe7c4c0fdf965674395c68bfcec9b83f09873`；`source_revision` 是 `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-10`。本审查不重新 full Grounding，不批准 Plan，不把 RM-10 标 DONE，也不授权 RM-09 Approval decision。

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In 只提升 P0 已 fail-closed 的额外必填 string 标量子集，走现有 classify / bind / start / Catalog / Chat。Out 明确排除 `$ref`/组合/非 string、通用 form 引擎、无额外必填的 form→prompt-first、RM-09/11/12、新 IPC channel、Bundle 修改。跳过 RM-09 符合该项 Bundle `approval: unsupported` 闸门。 |
| G2 Existing capability | PASS | Classifier、prompt-first bind、start IPC、Catalog 投影、`modules/skill-run` 选择、Chat Skill submit/queue、Gateway `tools/call` 均已存在。通用 JSON Schema 引擎正确标为 MISSING 且本阶段不 ADD。`inputSchema` 只读投影已存在；本 Item 用 Main 投影的 extra-field 名单，而不是让 Renderer 把 schema 当执行真源。 |
| G3 Production ownership | PASS | Parser 仍拥有 classify+bind。SkillRunService 拥有 start/`tools/call`。DTO 拥有 start map 与字段描述。`modules/skill-run` 拥有选择与 extra string 展示。Chat 只转发 submit/queue snapshot。File / Expert / Catalog cache owner 不分裂。 |
| G4 Classification | PASS | C01–C04 MODIFY 现有 classify/bind/DTO/IPC/UI。C05–C07 KEEP prompt-first、其余 fail-closed、Gateway/lock、Approval/Attachment/Expert/Bundle。无 REPLACE，无需 Removal。未把「多几个 string 输入」升级成新 form 引擎 ADD。 |
| G5 Contract and security | PASS | 只消费本地 Catalog schema；禁 `$ref` 与 format/pattern/enum 控件猜测。Main 白名单 key；未知/非 string/空白/无界 map 拒绝。扩展现有 start，不新增 channel。附件不因 `supportsAttachments` 启用。不改 Bundle。telemetry 不写 extra value 全文。 |
| G6 Behaviour to AC | PASS | AC-01 子集可调用并写入 arguments。AC-02 非子集仍 fail-closed。AC-03 form 无 extra 不得升 prompt-first。AC-04 prompt-first 回归。AC-05 Renderer 伪造 key 被拒。AC-06 queue snapshot。AC-07 无新页面/IPC/Bundle。 |
| G7 External contract maturity | PASS | v1.2.1 已有 Catalog `inputSchema` 与 `tools/call`。本 Item 不需要新 HTTP 表单 endpoint，也不提升 `attachments`/`approval`。 |
| G8 Cross-repo ownership | PASS | Work-only。禁止改 Bundle 与扫描 Provider 源码。 |
| G9 Change traceability | PASS | 对应父 PRD P1「受限 JSON Schema 参数表单」与 Roadmap RM-10 Exit Criteria（只覆盖 fail-closed 子集、不猜 schema）。不吞并 RM-09/11/12。 |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | 可调用模式的 `invocationMode` 字符串由 Plan 冻结；PRD 已禁止把现有 `parameters-required` 语义改成「可调用」，以免 Catalog/测试把剩余 fail-closed 工具误开。 |
| N2 | NOTE | extra required 上限 8 与 value 长度上限是 Work fail-closed bound，不是 Bundle 字段。Plan 必须在 IPC 校验落地，不能依赖 Renderer。 |
| N3 | NOTE | Catalog 已投影只读 `inputSchema`。Plan 必须让 Renderer 只渲染 Main 给出的 extra-field 列表；测试应证明 start arguments 不来自 Renderer 遍历 schema。 |
| N4 | NOTE | `form` 且无额外必填保持 `form-required` 是刻意的，避免本 Item 偷偷扩大 P0 prompt-first。不要在实施时「顺手」把纯 prompt 的 form 打开。 |

PASS -> `smc-prd-converge`。本审查不修改 PRD，不创建 git commit。
