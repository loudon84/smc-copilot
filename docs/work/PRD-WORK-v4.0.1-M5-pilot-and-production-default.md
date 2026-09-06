---
work_item_id: RM-06
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-06T23:20:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-06
grounded_commit: ec41e20dcde37c8cee3c5824b1eff2bf32355d01
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.2.1
product_decision: user-input:2026-09-06-production-default-skill-first
---

# WORK PRD v4.0.1 M5 — Pilot and Production Default

本 Stage PRD 关闭 Skill-first 生产启用：结构化、可诊断、不含秘密的 Skill Run telemetry；三种 feature mode 的回滚手册；内部 pilot / promotion 验收与 release notes。Main `SkillRunService` 仍是唯一执行生命周期 Owner；feature-mode store 仍是唯一新提交路由 Owner。本阶段不删除 Expert 默认入口，不引入第二套 Chat / Session / File / 遥测平台，也不把失败 Run 改写成 ExpertTask。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-06` / M5 Pilot and Production Default |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-06` |
| Architecture | `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md` Rollout and Removal；Roadmap Milestone M5 |
| Repository baseline | `ec41e20dcde37c8cee3c5824b1eff2bf32355d01` |
| Dependencies | RM-05 is `DONE`（`86485027`，Checkpoint B live）。RM-01 is `DONE`（`9b905ffa`，live AC-03/AC-04）。 |
| Provider input | 已锁定 `contracts/skill-run/v1.2.1/`。受控 live 已用已发布 Skill `hermes_marketing__live-plain-response` 证明原生 `run_id`。 |
| Current default mode | HEAD `DEFAULT_MODE = "skill-first"`（`8314e5c7`）。`SMC_WORK_SKILL_RUN_MODE` 与 `userData/skill-run-feature-mode.json` 仍可把新提交回滚到 `expert-compat` / `local-only`。 |
| Telemetry | Skill Run 无结构化事件记录。存在 `updater-log.ts`（updater 专用）和 `SMC_SKILL_RUN_DEBUG` 下会打印 `tools/call` arguments 的调试输出。 |
| Rollback handbook / release notes | 仓库无 M5 回滚手册、pilot 清单或生产 release notes。 |
| Promotion tests | Fixture E2E、focused Skill Run / Expert / Layout local-chat tests 已存在；无把它们收成 M5 promotion package 的文档。 |

## Problem and Outcome

M0–M4 已关闭合同、执行、Artifact 与 Session Files。HEAD 已把新提交默认切到 Skill Run，但生产启用仍缺三块：catalog/start/accepted/reconnect/terminal/duplicate-prevented/artifact 无法在不含秘密的前提下被诊断；三种 mode 的回滚步骤未写成可执行手册；内部 pilot 与 promotion gates 没有一份可审计的验收包。未收口时，现场只能靠可能泄漏 prompt 的 debug 日志，回滚会误删 continuation 或把失败 Run 改走 Expert。

完成后，仓库默认新提交继续走 Skill Run；Main 记录一组固定事件名的结构化 telemetry，且永不写入 prompt、JWT、Result body 或 Artifact bytes；发布 owner 可按手册把新提交切回 `expert-compat` 或 `local-only`，已创建 Run 与 Expert Task 仍由各自 reader 恢复；内部 pilot 清单与 promotion 回归在受控环境可重跑。Hosted metrics UI、多客户灰度队列和 Expert 入口删除不在本阶段。

## Scope

- In: 复用既有 feature-mode store、SkillRunService 生命周期、Expert reader、Local Chat、File Platform 与 env-gated E2E；为 Skill Run 增加 Main 侧结构化 telemetry sink；写清三种 mode 的配置与回滚手册；把内部 pilot / promotion gates / release notes 收成可验证包；证明默认 `skill-first`、无 silent fallback、回滚不销毁在途状态。
- Out: Expert 默认入口删除（RM-07 / v4.2 Removal PRD）；Approval 卡片、rich activity、JSON Schema form、Attachment upload；Renderer telemetry dashboard 或第二套观测平台；把 `updater-log` 改成通用日志总线；修改 `contracts/skill-run/v1.2.1` 或 `contracts/work-expert/v1.0.2`；把失败 Skill Run 自动改交 ExpertTask。
- Production Owner: Work release owner 拥有灰度顺序、回滚手册、pilot 清单与 release notes。Main `SkillRunService` 拥有生命周期事件发射点。feature-mode store 拥有新提交 mode。Expert Run Service 与 Local Chat 保持独立 reader。Renderer 不拥有 telemetry 文件、JWT 或 raw event。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Production default feature mode | feature-mode store | 默认 `skill-first`；env 与 store file 可覆盖；`skill-only` 别名映射 `local-only`；非 `skill-first` 的 `start` 返回 `START_DISABLED_FEATURE_MODE` 且不发 HTTP | EXISTS |
| No silent Expert fallback | SkillRunService + Chat routing | Skill 失败保持 Skill 错误；unauthorized catalog 不改走 Expert start | EXISTS |
| Dual lifecycle readers | SkillRunService + ExpertRunService | Mode 只影响新提交；rehydrate/cancel 不因回滚 mode 而停止已有 Run/Task | EXISTS |
| Catalog / start / accepted / reconnect / terminal / duplicate / artifact | SkillRunService + Gateway | 行为已存在；没有可查询的结构化事件计数 | PARTIAL |
| Main file logger pattern | updater-log | 只写 `userData/logs/updater.log`；与 Skill Run 生命周期无关 | EXISTS（不可复用为 Skill sink） |
| Debug argument dump | SkillRunService | `SMC_SKILL_RUN_DEBUG=1` 时把 `arguments` 打到 console | CONFLICT |
| Rollback handbook | Work release docs | 缺失 | MISSING |
| Internal pilot / promotion package | Work release owner | live Checkpoint B 与 RM-01 live 已发生，但未收成 M5 清单 / release notes | PARTIAL |
| Expert / Local Chat regression | Expert service tests + Layout `chatRuns` tests | 套件存在，未声明为 M5 promotion gate | PARTIAL |
| Hosted telemetry dashboard | none | 不存在；架构把 dashboard 与 runbook 标为可并行，但 Work 无观测 UI owner | MISSING（本阶段不 ADD UI） |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Production default | Existing feature-mode store | 无 env/store 覆盖时新提交为 `skill-first`；覆盖为 `expert-compat` / `local-only` 只停止新建 Skill Run | KEEP |
| Structured Skill Run telemetry | Existing SkillRunService + new Main Skill Run telemetry sink | 记录 `catalog` / `start` / `accepted` / `reconnect` / `terminal` / `duplicate-prevented` / `artifact`；JSONL 落在 Main `userData/logs`；不含 prompt/secret/body/URL/bytes | ADD |
| Debug / ops logging hygiene | Existing SkillRunService | 任何 Skill Run 日志与 telemetry 都不得写出 prompt、tool arguments、JWT、Result body、Artifact bytes | MODIFY |
| Rollback handbook | Work release docs | 三种 mode 的配置、回滚步骤、在途恢复、禁止事项可执行 | ADD |
| Internal pilot and promotion evidence | Work release owner + existing harness | 受控 backend 上完成 Layout/执行/取消/rehydrate/文件 清单；duplicate / unauthorized / reconnect / artifact-fail / Expert / Local 回归为零失败 | MODIFY |
| Dual readers / no Expert resubmit | Existing Skill and Expert owners | 回滚不删除 continuation、ManagedFile、transcript；失败 Skill Run 不得自动变成 ExpertTask | KEEP |
| Hosted metrics UI | n/a | 继续缺失；本阶段用 JSONL 作为可诊断证据，不新增 Renderer View | KEEP absent |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Structured Skill Run telemetry | ADD | 生命周期事件目前只能靠非结构化 console。需要 Skill Run 自己的 Main JSONL sink。不得把 updater logger 或 Renderer 变成第二 Owner。 |
| C02 | Rollback handbook, pilot checklist, release notes | ADD | 生产回滚与内部 pilot 验收目前没有可执行文档。由 Work release owner 持有，不进入 Renderer。 |
| C03 | Production default and mode rollback | KEEP | HEAD 已是 `skill-first`；env/store 回滚已存在。本阶段证明并冻结，不再改默认常量。 |
| C04 | Skill Run log hygiene | MODIFY | `SMC_SKILL_RUN_DEBUG` 打印 `arguments` 违反架构“日志不记录 prompt”。必须从生产调试路径移除秘密字段。 |
| C05 | Dual readers and no silent fallback | KEEP | Expert 与 Local Chat 回归继续作为 promotion gate；失败不 fallback Expert。 |
| C06 | Promotion-gate evidence packaging | MODIFY | 把已有 fixture/live/Expert/Local 套件声明为 M5 闸门并留下可审计记录，而不是新写第二套 E2E Owner。 |

## Replacement / Removal Matrix

| Replaced Production Path | Existing Owner | Target Path | Removal Condition |
|---|---|---|---|
| `SMC_SKILL_RUN_DEBUG` 把 `tools/call` arguments / prompt 打到 console | SkillRunService debug branch | 只记录事件名、mode、errorCode、phase、重连次数、artifact 计数等非秘密字段 | M5 implementation commit 合入后，生产与 debug 路径都不得再输出 prompt 或 arguments |

## Compatibility Contract

### Expert compatibility

- **Current Consumer:** 已部署 Expert v1.0.2 的在途 HermesTask、历史 session 与 Local Chat。
- **Reason:** Skill Run 与 Expert Task 身份不兼容；回滚后仍需恢复旧任务。
- **Removal Condition:** 不在本 PRD。Expert 默认入口删除属于 v4.2 Removal PRD / RM-07。
- **Removal Version:** 最早 Work v4.2。

Mode 只影响新提交。回滚到 `expert-compat` 或 `local-only` 不得停止已有 Skill Run reader，也不得把未完成 Skill Run 改交 Expert。

## Contract and Security Boundary

- Telemetry 只由 Main 写本地 JSONL；Renderer、Preload、IPC 不得读取或转发该文件，不得新增 `skillRun.telemetry` channel。
- 允许字段：事件名、UTC 时间、feature mode、outcome/`errorCode`、Run phase、reconnect attempt、artifact item count、不可逆短指纹（例如 `clientRequestId` 的 SHA-256 前 12 位）。禁止字段：prompt、tool arguments、JWT、Authorization、backend origin、absolute path、Result body、download token、Artifact bytes、raw Provider event。
- Catalog/start/SSE/artifact HTTP 仍只走 v1.2.1 Bundle；telemetry 失败不得改变 start/cancel/rehydrate 结果。
- 回滚只改 feature mode。不得删除 continuation、ManagedFile 或 transcript，不得对失败 Run 发 Expert start。
- 内部 pilot 只使用受控 public backend 与已发布 Skill；不得扫描 Provider 源码或内部 Agent 路由。

## Pilot, Promotion, and Rollback

内部 pilot 就是本仓库 Work release owner 在受控 public backend 上的验收，不另开客户队列。清单必须覆盖：Layout「使用技能」、Catalog 选择、提交、取消、重启 rehydrate、Session Files / Preview。Promotion gates：

- consumer-lock / fixture 证明合同无 drift；
- 同 key 不产生第二个 Provider Run；
- unauthorized / credential 负向测试为零失败；
- reconnect 与 artifact failure 保持终态可诊断（telemetry 有对应事件）；
- Expert 与 Local Chat focused suites 通过；
- 回滚手册中的 `expert-compat` / `local-only` 步骤可把新提交停掉。

回滚手册必须写清：环境变量与 store 文件的优先级；三种 mode 的效果；回滚后 reader 继续；禁止 silent fallback 与 Expert 重放。

## Acceptance Criteria

1. 无 env/store 覆盖时，新 Skill 提交走 `skill-first`；`expert-compat` 与 `local-only` 下 `start` 返回 `START_DISABLED_FEATURE_MODE` 且不发 `tools/call`。
2. Main 为每次 catalog 获取、start 尝试、accepted `run_id`、SSE reconnect、终态、同 session 重复 start、artifact discovery 成功或失败各写一条结构化事件。事件可在 `userData/logs` 的 Skill Run telemetry 文件中按事件名检索。
3. 上述事件与任何 Skill Run debug 日志都不含 prompt、tool arguments、JWT、Authorization、backend origin、Result body、download token、absolute path 或 Artifact bytes。telemetry 写失败不影响 Run 生命周期。
4. 回滚手册说明如何切到 `expert-compat` 与 `local-only`；按手册回滚后新提交停止，已有 Skill Run continuation 与 Expert Task 仍可恢复；手册明确禁止把失败 Skill Run 改交 Expert。
5. 内部 pilot 清单在受控 live 或等价 harness 上覆盖 Layout 技能入口、执行、取消、rehydrate 与文件使用；负向 unauthorized / unpublish / reconnect / duplicate / cancel / artifact-fail 继续由既有 fixture 证明。
6. Expert focused suite 与 Local Chat Layout tests 作为 promotion gate 通过。Skill 失败路径不创建 ExpertTask。
7. release notes 记录生产默认 `skill-first`、回滚入口和 telemetry 文件位置。不得声称 Hosted dashboard 或 Expert 入口删除已完成。

## Definition of Done

1. C01 与 C04 有 focused tests；C02/C06 有手册、pilot 清单、release notes 与 promotion 证据记录。C03/C05 由既有 owner 的回归覆盖。
2. RM-06 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。
3. 发现需要 Hosted metrics UI、多客户灰度系统、Approval/Attachment 或删除 Expert 入口的工作，必须返回独立 PRD / RM-07，不得混入 M5。

## Source Anchors

- `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`
- `apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/updater-log.ts`
- `apps/work/src/main/expert/expert-run-service.ts#createExpertRunService`
- `apps/work/src/renderer/src/screens/Layout/chatRuns.ts`
- `apps/work/src/main/skill-run/skill-run-e2e.test.ts`
- `apps/work/lat.md/skill-run.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md#Milestone M5 — Pilot and Production Default`
- `docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md#Rollout and Removal`
