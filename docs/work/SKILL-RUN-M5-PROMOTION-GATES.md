# Skill Run M5 Promotion Gates

Work release owner 用本清单做内部 pilot 与 promotion。不要另写第二套 E2E Owner。RM-06 Roadmap `DONE` 必须是独立 status commit，本文件所在的 implementation tree 应保持 RM-06 为 BACKLOG。

## Internal pilot 清单

在受控 public backend 或等价 harness 上确认：

1. Layout「使用技能」进入现有 Chat
2. Catalog 可选择已发布 prompt-first Skill
3. 提交后 Run 进入终态
4. 取消路径不调用 Local Chat abort
5. 重启 / rehydrate 不发第二次 `tools/call`
6. Session Files / Preview 仍走 File Platform

已完成的受控 live 入口：`SMC_SKILL_RUN_E2E=1` 下的 `npm --prefix apps/work run test:skill-run-e2e`（AC-03/AC-04）以及 RM-05 Checkpoint B 证据。本机 Chat 若被 Hermes Gateway splash 挡住，pilot 的 Layout 点击项可用 Main IPC / harness 等价证明，不得编造未发生的外部用户。

## Promotion 命令

- Feature mode：`npm --prefix apps/work exec -- vitest run src/main/skill-run/feature-mode-store.test.ts --pool=threads --maxWorkers=1`
- Telemetry / lifecycle：`npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-telemetry.test.ts src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1`
- Expert + Local Chat：`npm --prefix apps/work exec -- vitest run src/main/expert/expert-run-service.test.ts src/renderer/src/screens/Layout/chatRuns.test.ts --pool=threads --maxWorkers=1`
- Fixture 负向（unauthorized / unpublish / reconnect / duplicate / cancel / artifact-fail）：`npm --prefix apps/work run test:skill-run-e2e`（不要设置 `SMC_SKILL_RUN_E2E`）

Skill 失败路径不得创建 ExpertTask。Hosted dashboard 与 Expert 入口删除不在本包。
