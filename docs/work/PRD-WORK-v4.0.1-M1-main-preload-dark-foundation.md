---
work_item_id: RM-02
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-02T09:50:48+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-02
grounded_commit: ac88d25ea93722126a1d3661ac55404ed92e7eef
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.2.1
---

# WORK PRD v4.0.1 M1 — Main/Preload Dark Foundation

本 Stage PRD 将既有 Skill Run Main/Preload foundation 收敛为可审查的 M1 交付边界。在 RM-01 的 Provider live 验证延后期间，它保持默认关闭、fail-closed 和 Main-only trust boundary，不启用新的真实 Skill Run 提交。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-02` / M1 Work Contract and Main Foundation |
| Roadmap source | `WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-02` |
| Repository baseline | `ac88d25ea93722126a1d3661ac55404ed92e7eef` |
| Provider input | 已锁定的 `contracts/skill-run/v1.2.1/`；RM-01 的受控 live 同键重放仍由 Provider 更新后人工验证 |
| Focused baseline | `skill-run-consumer-lock`、`skill-run-gateway-client`、`skill-run-service`、`skill-run-ipc` 共 29 tests passed（2026-09-02） |
| Existing owners | `src/shared/skill-run.ts`、Main Skill Run subsystem、`window.hermesAPI.skillRun` Preload bridge |

## Problem and Outcome

Work 已有共享 DTO、锁门、Gateway、Service、IPC 和 Preload bridge，但它们先于新的 Item DAG 被实现，尚未以一个只覆盖 M1 的 Stage PRD 收敛。RM-01 的 live Provider 证明已延后，不能让 M1 重复实现 lifecycle 或把 feature mode 改成生产默认。

完成本阶段后，Main/Preload 的 dark foundation 具有唯一 Owner、稳定的公开 IPC DTO、认证与输入校验、lock/discriminator fail-closed 行为和可重跑 focused evidence。它允许后续 M2 构建安全选择 UI；真实 `tools/call`、跨端幂等、run recovery 和 Artifact 仍不因本 PRD 获得启用资格。

## Scope

- In: 复用并验证既有 shared DTO、Consumer Contract lock、Main Gateway/Service、窄 IPC 和 Preload bridge；明确默认 feature mode、认证范围、输入限制与 Renderer trust boundary；保留或仅在现有 owner 中修正 M1 focused tests。
- Out: 修改 Provider Bundle 或发布流程；默认 `skill-first`；RM-01 的 live 同键重放；真实 start/retry/recovery/cancel lifecycle；Session continuation、Result/Artifact materialization；Layout/Chat Skill selection UI；Approval、Attachment、P1 和 Expert removal。
- Production Owner: Main `SkillRunGatewayClient` / `SkillRunService` 是唯一 Backend 调用与 lifecycle owner；`src/shared/skill-run.ts` 是跨进程 DTO owner；Preload 只公开 IPC wrapper；Renderer 不获得 token、backend origin、raw Provider event、download URL 或 bytes。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Cross-process Skill Run DTO and IPC channel names | `src/shared/skill-run.ts` | Feature modes、catalog/projection/start DTO 和 `SKILL_RUN_IPC_CHANNELS` 已集中定义 | EXISTS |
| Complete-bundle lock and strict Catalog gateway | Main consumer lock + `SkillRunGatewayClient` | 无完整 lock 不 fetch；缺少 `capabilityKind` 返回 `contract-unsupported` | EXISTS |
| Default-off Main execution gate | `SkillRunService` + feature-mode store | 默认 `expert-compat`；非 `skill-first` 的 start 在发请求前拒绝 | EXISTS |
| Narrow authenticated IPC and projection broadcast | `skill-run-ipc.ts` | Main 验证 sender、认证代际和 bounded input；仅发送 sanitized projection | EXISTS |
| Preload bridge | `preload/skill-run-api.ts` | 仅 `ipcRenderer.invoke/on` wrapper，不读取 token 或直接联网 | EXISTS |
| Focused regression evidence | existing Skill Run test suites | lock、gateway、service、IPC 的 29 个 focused tests 已通过 | EXISTS |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Shared public DTO boundary | Existing `src/shared/skill-run.ts` owner | Main、Preload 和 Renderer 只通过 versioned/sanitized DTO 通信；不新增 parallel contract | KEEP |
| Contract lock and Catalog discriminator gate | Existing Main lock/Gateway owner | lock 或 discriminator 缺失时 fail-closed，且默认路径不猜测 Provider payload | KEEP |
| Default-off submission boundary | Existing `SkillRunService` / feature-mode owner | `expert-compat` 仍为默认；M1 不使用户提交产生真实 `tools/call` | KEEP |
| Authenticated narrow IPC | Existing Main IPC + Preload owner | Main 继续执行认证、sender、字段和长度校验；Preload 不扩张权限 | KEEP |
| M1 focused verification | Existing focused test suites | 保留 M1 安全边界的可重跑证据；发现直接回归时只修正现有 owner | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Shared Skill Run DTO and Main/Preload ownership | KEEP | 已存在唯一跨进程 contract owner；不得复制为 Renderer-local 或第二 IPC contract。 |
| C02 | Consumer lock and strict Catalog Gateway | KEEP | v1.2.1 lock 与 discriminator fail-closed 已满足 M1 的输入边界；Provider live proof 仍属 RM-01。 |
| C03 | Feature-mode default and submission gate | KEEP | 默认 `expert-compat` 与 pre-request rejection 已防止 M1 在 M0 延后期间启用真实提交。 |
| C04 | Authenticated narrow IPC and Preload bridge | KEEP | Main-side authentication/validation 与 Preload-only IPC 已满足 trust boundary。 |
| C05 | Focused M1 regression evidence | KEEP | 已有 focused tests 覆盖 M1 boundary；只有可证明的直接缺口才允许在既有测试 owner 中补充。 |

## Contract and Security Boundary

- Bundle 仍只能来自 `contracts/skill-run/<version>/` 的 checksum-valid Consumer Contract；Work 不从 Provider checkout、数据库或内部路由推断 contract。
- Renderer 只能调用 `window.hermesAPI.skillRun` 的 DTO API；它不得构造 Authorization、读取 token/origin、订阅 raw SSE 或下载 Artifact。
- `start` 必须在 Main 内检查 feature mode、consumer lock、Catalog 和 prompt-first binding；M1 不放宽这些检查，也不提供 silent Expert fallback。
- M0 的 live replay 失败或未验证时，M1 不能将 feature default 改为 `skill-first`，不能把任何 UI 操作升级为真实 `tools/call`。
- 不新增 Service、Store、Session persistence、File owner 或 Provider-private schema；后续 lifecycle、recovery 与 artifact work 分别留在 RM-04/RM-05。

## Acceptance Criteria

1. Shared DTO、IPC channels 和 Preload bridge 继续构成唯一跨进程 Skill Run surface；Renderer 无法获得 access token、backend URL、raw Provider event、download token、absolute path 或 Artifact bytes。
2. 完整 Consumer Contract lock 缺失或 Catalog 条目缺少 `capabilityKind` 时，Catalog 返回 `contract-unsupported` 且不得猜测或发起后续执行请求。
3. 默认 feature mode 是 `expert-compat`；在该模式下 `start` 返回 `START_DISABLED_FEATURE_MODE`，且 Gateway `tools/call` 不被调用。
4. Main IPC 对 sender、认证代际、必填字段和长度实施校验；认证或输入无效不得将未验证数据交给 Service。
5. M1 不改变 Provider wire contract、不增加默认真实 `tools/call`、不自动 fallback 到 Expert，也不创建平行 Session/File/Lifecycle owner。
6. consumer-lock、gateway、service 和 IPC focused tests 全部通过；任何为 M1 发现的直接回归只在既有 owner 中最小修正。
7. RM-01 的 Provider live 验证仍是 RM-04 真实执行与生产路径的硬 Gate；本 M1 PRD 不能作为其替代证据。

## Definition of Done

1. M1 只有在本 PRD 有 validated Plan、review PASS、focused verification evidence 和真实 implementation commit 后才能在 Roadmap 标记 `DONE`。
2. M1 完成不改变 RM-01 的 `BACKLOG` 状态，也不允许 RM-04 在 RM-01 未 `DONE` 时进入真实执行。
3. 任何发现 M1 需要新 Provider schema、改变 Bundle 或放宽 prompt-first/feature gate 的工作，必须返回 RM-01 或独立 Architecture/Provider PRD，不得混入本阶段。

## Source Anchors

- `src/shared/skill-run.ts`
- `src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir`
- `src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`
- `src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`
- `src/preload/skill-run-api.ts#createSkillRunApi`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md#Roadmap Items`
