# Skill Run M5 回滚手册

本文是 Work v4.0.1 M5 的可执行回滚说明。Feature mode 只影响**新提交**。已创建的 Skill Run 与 Expert Task 继续由各自 Main reader 恢复。

## Mode 优先级

1. 环境变量 `SMC_WORK_SKILL_RUN_MODE`
2. `userData/skill-run-feature-mode.json` 的 `mode`
3. 仓库默认 `skill-first`

合法值：`skill-first`、`expert-compat`、`local-only`。遗留别名 `skill-only` 映射为 `local-only`。无效值忽略并落入下一层。

## 三种 mode

| Mode | 新 Skill 提交 | 已有 Skill Run | 已有 Expert Task |
|---|---|---|---|
| `skill-first` | 允许 `tools/call` | 继续跟踪到终态 | 继续恢复 |
| `expert-compat` | `START_DISABLED_FEATURE_MODE`，不发 HTTP | 继续跟踪到终态 | 继续恢复；新 Expert 提交仍走 Expert |
| `local-only` | 同上，禁用 Skill 新提交 | 继续跟踪到终态 | 不把 Skill 失败改交 Expert |

## 回滚步骤（停止新建 Skill Run）

1. 把 `SMC_WORK_SKILL_RUN_MODE` 设为 `expert-compat`（紧急）或 `local-only`（只要本地 Chat）。
2. 或者写入 `skill-run-feature-mode.json`：`{"mode":"expert-compat"}`。
3. 重启 Work。新 Skill 提交应返回 `START_DISABLED_FEATURE_MODE`。
4. **不要**删除 Skill Run continuation、ManagedFile 或 transcript。
5. **不要**把失败或未完成的 Skill Run 重新提交为 ExpertTask。没有 silent fallback。

## 恢复生产默认

清除 env 覆盖，并把 store 文件改回 `skill-first` 或删除该文件，然后重启 Work。

## 诊断

结构化事件在 `userData/logs/skill-run-telemetry.jsonl`。按 `event` 字段检索 `catalog` / `start` / `accepted` / `reconnect` / `terminal` / `duplicate-prevented` / `artifact`。文件不含 prompt、JWT、Result body 或 Artifact bytes。
