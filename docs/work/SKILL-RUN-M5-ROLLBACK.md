# Skill Run M5 回滚手册

本文是 Work v4.0.1 M5 的可执行回滚说明，并覆盖 M6a（RM-07）生产默认下 Composer Expert 默认创建入口已移除后的恢复方式。Feature mode 只影响**新提交**。已创建的 Skill Run 与 Expert Task 继续由各自 Main reader 恢复。本文不删除 Expert 子系统，也不交付 Approval、rich activity、表单或 Attachment。

## Mode 优先级

1. 环境变量 `SMC_WORK_SKILL_RUN_MODE`
2. `userData/skill-run-feature-mode.json` 的 `mode`
3. 仓库默认 `skill-first`

合法值：`skill-first`、`expert-compat`、`local-only`。遗留别名 `skill-only` 映射为 `local-only`。无效值忽略并落入下一层。

## 三种 mode

生产默认 `skill-first` **已移除** local-chat Composer 的 Expert 默认创建入口；Main `expert.start` 在非 `expert-compat` 下返回 `EXPERT_START_DISABLED_FEATURE_MODE`，不发 Expert HTTP。

| Mode | 新 Skill 提交 | 新 Expert Task（Composer / `expert.start`） | 已有 Skill / Expert reader |
|---|---|---|---|
| `skill-first` | 允许 `tools/call` | 拒绝新 Expert 入口与 start（`EXPERT_START_DISABLED_FEATURE_MODE`） | 继续恢复；`expert.retry` / cancel / rehydrate 仍可用 |
| `expert-compat` | `START_DISABLED_FEATURE_MODE`，不发 HTTP | 恢复 Composer Expert 默认入口与 `expert.start` | 继续恢复 |
| `local-only` | `START_DISABLED_FEATURE_MODE`，不发 HTTP | 同时拒绝新 Skill 与新 Expert 创建 | 继续恢复；不把 Skill 失败改交 Expert |

## 回滚步骤（停止新建 Skill Run）

1. 把 `SMC_WORK_SKILL_RUN_MODE` 设为 `expert-compat`（紧急，同时恢复 Expert 默认入口）或 `local-only`（只要本地 Chat，Skill 与 Expert 均不新建）。
2. 或者写入 `skill-run-feature-mode.json`：`{"mode":"expert-compat"}`。
3. 重启 Work。新 Skill 提交应返回 `START_DISABLED_FEATURE_MODE`。`expert-compat` 下 Composer Expert 入口与 `expert.start` 恢复；`local-only` 下两者都不新建。
4. **不要**删除 Skill Run continuation、ManagedFile 或 transcript。
5. **不要**把失败或未完成的 Skill Run 重新提交为 ExpertTask。没有 silent fallback。被拒的 Expert start 也不得改交 Skill 或 Local Chat。

## 恢复生产默认

清除 env 覆盖，并把 store 文件改回 `skill-first` 或删除该文件，然后重启 Work。生产默认下 Expert 默认创建入口保持隐藏；已有 Expert continuation 仍可恢复。

## 诊断

结构化事件在 `userData/logs/skill-run-telemetry.jsonl`。按 `event` 字段检索 `catalog` / `start` / `accepted` / `reconnect` / `terminal` / `duplicate-prevented` / `artifact`。文件不含 prompt、JWT、Result body 或 Artifact bytes。
