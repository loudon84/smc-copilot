# SMC PRD Contract

PRD frontmatter 必须包含：`work_item_id`、`version`、`status`、`target_branch`、`review_verdict`、`approved_at`。

`status` 只能为 `DRAFT`、`REVIEW_REQUIRED`、`APPROVED` 或 `SUPERSEDED`。只有 `APPROVED` 可以进入 Plan。

非平凡 PRD 必须包含以下章节：

- `## Current Capability Inventory`
- `## Target End-State Inventory`
- `## Change Classification`
- `## Acceptance Criteria`

所有变更只能分类为 `KEEP`、`MODIFY`、`ADD`、`REPLACE`、`REMOVE`。出现 `REPLACE` 时，必须有 `## Replacement / Removal Matrix`，并列出对应 `REMOVE`。出现 compat、adapter、fallback、alias 或 legacy 时，必须有 `## Compatibility Contract`，写明 Current Consumer、Reason、Removal Condition 和 Removal Version。
