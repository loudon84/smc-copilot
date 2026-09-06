# Work v4.0.1 M5 Release Notes

## 生产默认

新 Skill 提交的仓库默认是 `skill-first`。未设置 `SMC_WORK_SKILL_RUN_MODE` 且没有 `userData/skill-run-feature-mode.json` 覆盖时，Layout「使用技能」会走 Skill Run，而不是 Expert Task。

## 回滚入口

见 `docs/work/SKILL-RUN-M5-ROLLBACK.md`。把 mode 切到 `expert-compat` 或 `local-only` 只停止新建 Skill Run；已有 Run / Expert Task / Session Files 保留。

## Telemetry

Main 将 allow-listed JSONL 写到 `userData/logs/skill-run-telemetry.jsonl`。事件名：`catalog`、`start`、`accepted`、`reconnect`、`terminal`、`duplicate-prevented`、`artifact`。这不是 hosted dashboard，Work 也没有 Renderer 指标页面。

## 本版本没有做的

- 没有 Hosted telemetry dashboard
- 没有删除 Expert 默认入口（见 RM-07 / v4.2 Removal PRD）
- 没有 Approval 卡片、JSON Schema 表单或 Attachment upload
