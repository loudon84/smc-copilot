# M6f Catalog Favorites and Recent Use — Initial PRD Review

Review scope is RM-12 Stage PRD v1.0.0 (`REVIEW_REQUIRED`). `grounded_commit` is `4bfaa452ea147901a23c8ba94a946b7fbb991a69`；`source_revision` 是 `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-12`。本审查不重新 full Grounding，不批准 Plan，不把 RM-12 标 DONE，也不授权 RM-09 / RM-11。

## Verdict

PASS

## Gate Results

| Gate | Result | Evidence |
|---|---|---|
| G1 Scope | PASS | In 只做本机收藏 + accepted-start 最近使用，并与当前 Main Catalog 做交集。Out 明确排除组织推荐 HTTP、第二 Catalog list、telemetry 回读、session-mode 混用、Approval/Attachment、Bundle 修改、`screens/Skills`。跳过 RM-09/11 符合 Bundle `approval`/`attachments` = `unsupported`。Roadmap 文案含「组织推荐」，本 PRD 将其 KEEP absent 与 RM-10 对 form 引擎的子集处理一致，且 Exit Criteria 只禁止第二 Catalog owner。 |
| G2 Existing capability | PASS | Gateway auth-scope `tools/list` cache、Catalog DTO/IPC、Catalog Panel 搜索分类、session-mode、feature-mode、accepted start 均已存在。收藏/最近使用正确标 MISSING。组织推荐正确标 MISSING 且本阶段不 ADD。未把 telemetry 或 session-mode 误认为已有 Catalog 偏好。 |
| G3 Production ownership | PASS | Main 新偏好 store 只拥有名字与分区。Gateway 仍拥有 Catalog HTTP/cache。`modules/skill-run` 拥有分组展示。Chat 仍拥有 selection/submit。Layout / File / Expert / `screens/Skills` 不分裂 owner。 |
| G4 Classification | PASS | C01 ADD 本机偏好 store（无等价 owner）。C02–C04 MODIFY 交集、Panel 分组、accepted start 写 recent。C05 KEEP cache。C06 KEEP absent 组织推荐。C07 KEEP 其余 M6。无 REPLACE，无需 Removal。未把「本机两个列表」升级成推荐引擎或第二 Catalog client。 |
| G5 Contract and security | PASS | 工具列表真源仍是 Main cache。偏好只存 toolName。auth scope 与 Catalog cache 对齐。禁止 Renderer 未分区 SOT、禁止 telemetry 回读、禁止改 Bundle、禁止伪推荐 API。IPC 只允许扩展现有 skill-run 表面，不新增 list/start 替代 channel。 |
| G6 Behaviour to AC | PASS | AC-01 收藏持久化与选择。AC-02 伪造名字不进 UI / 不补 list。AC-03 accepted start → Recent 且过滤不发明工具。AC-04 拒绝/仅选择不写 recent。AC-05 跨 scope 隔离。AC-06 Catalog 失败无幽灵卡片。AC-07 无推荐分区、无第二 Catalog HTTP。 |

## Findings

No OPEN BLOCKER or MAJOR finding.

| ID | Severity | Note |
|---|---|---|
| N1 | NOTE | 已批准父 PRD 的 P1 列表未单列收藏/最近使用；Roadmap RM-12 仍要求独立 Stage PRD。本审查按 Roadmap Item + Exit Criteria 接受范围，不把组织推荐合同偷运进 Work。 |
| N2 | NOTE | 收藏上限「拒绝新收藏」与具体数字（50/20）由 Plan 冻结 IPC/store 校验；PRD 已要求 bounded 与 fail-closed。 |
| N3 | NOTE | C01 是 ADD store，不是 ADD Catalog HTTP。Plan 不得借此新增 `tools/list` 并行 client 或把偏好 store 做成第二个工具真源。 |
| N4 | NOTE | Recent 只绑 accepted start。不要在实施时改成「一点选就进最近」，那会把浏览记成使用。 |

PASS -> `smc-prd-converge`。本审查不修改 PRD，不创建 git commit。
