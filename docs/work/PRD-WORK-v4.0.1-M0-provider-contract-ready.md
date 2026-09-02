---
work_item_id: RM-01
version: v1.0.0
status: APPROVED
target_branch: work/prd-v4.0
review_verdict: PASS
approved_at: 2026-09-01T16:40:00+08:00
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.0/RM-01
grounded_commit: 394d00a9d6e08f9a6072e420810d48420e1c456f
grounding_mode: discover
provider_contract: SKILL-RUN-CONTRACT v1.2.1
---

# WORK PRD v4.0.1 M0 — Provider Contract Ready

本 Stage PRD 完成 Work 对已发布 Skill Run Contract 的消费验收，并以受控 Provider live 环境证明跨端幂等与 Checkpoint B P0 链路；它不改变默认执行模式或 Expert 兼容边界。

## Evidence Baseline

| 项 | 值 |
|---|---|
| Roadmap Item | `RM-01` / M0 Provider Contract Ready |
| Repository baseline | `394d00a9d6e08f9a6072e420810d48420e1c456f` |
| Provider input | `contracts/skill-run/v1.2.1/` 的不可变 Bundle，tag `skill-run-contract-v1.2.1` |
| Work pin | `consumer-lock.json` → `10d38f2c97739c4a55df893d1dc954fc8896f1a7` |
| Offline evidence | manifest、LF `SHA256SUMS`、P0 schema/matrix/fixture 与 consumer-lock test 已在本仓可复现 |
| Existing E2E | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` 同时提供 fixture replay 与 env-gated live happy path |
| Live environment | `SMC_SKILL_RUN_E2E*` 在本次 Grounding 时未配置；没有 live 输出不得声称跨端幂等已证明 |

Work 只把此 Bundle 和 Provider Owner 提供的受控 live 环境作为合同输入。不得读取 Provider checkout、分支、实现源码、数据库或内部 Agent 路由来补齐任何语义。

## Problem and Outcome

Work 已能离线确认 v1.2.1 Bundle 完整，并在 fixture 中覆盖 Catalog、start、SSE/poll、result、artifact、restart、unauthorized、unpublish、reconnect、cancel 与 artifact failure。当前 env-gated live case 仅检查一次新提交后 rehydrate 不会在同一进程产生第二次 `tools/call`；它没有从独立 Work client/session 对同一 `X-Idempotency-Key` 发起 replay，无法证明 Provider 的跨端单 Run 语义。

完成后，M0 的合同验收将由不可变 Bundle、Work 的离线验证、CI fixture 负向场景，以及受控 live 环境中的同 key replay 与 Checkpoint B happy path 共同支撑。live 环境不可用时，M0 必须保持 BLOCKED，不能以 mock、Provider source 或口头确认替代。

## Scope

- In: Work 对 v1.2.1 Bundle 的离线完整性和 wire fixture 验收；在既有 Skill Run E2E harness 中增加受控 live 同 key replay 证据；运行并脱敏保留 Checkpoint B 证据；将 M0 状态更新建立在真实提交和验证上。
- Out: `skill-first` 生产默认（M5/C03）；Expert 默认入口移除（M6/C04）；Approval decision、rich activity、JSON Schema forms、Attachment upload；新增 Provider schema、私有 parser 或第二个 lifecycle/file/session owner。
- Production Owner: Provider Owner 负责 Bundle 与受控 public backend；Work consumer-lock owner 负责离线验证；现有 Work Main `SkillRunGatewayClient` / `SkillRunService` 负责 live 调用和恢复；Renderer 不获得 Provider URL、credential 或 raw event。

## Current Capability Inventory

| Capability | Existing Owner | Current State | Classification |
|---|---|---|---|
| Immutable Bundle + Work lock | Work consumer-lock owner | v1.2.1 manifest、LF checksums、P0 files 和 tag pin 已在 `contracts/skill-run/v1.2.1/` | EXISTS |
| Offline lock gate | `isCompleteSkillRunBundleDir()` | lock、all listed digests 和 P0 required paths 成功才开放 | EXISTS |
| Contract wire fixture | Main Gateway/parser tests | JSON-RPC Catalog discriminator、endpoint/idempotency/replay fixture 与 fail-closed mapping 可复现 | EXISTS |
| Checkpoint B fixture | existing E2E harness | replay、restart、SSE/poll、取消和安全负向场景可在 CI 重跑 | EXISTS |
| Cross-end idempotency proof | existing env-gated E2E harness | 只验证同一 service rehydrate；未从独立 live clients replay 同一 key | PARTIAL |
| Controlled Provider live environment | Provider operations owner | 本 Grounding 环境没有必要的 E2E configuration | MISSING external |

## Target End-State Inventory

| Capability | Target Owner | Target State | Classification |
|---|---|---|---|
| Bundle acceptance | Existing Work consumer-lock owner | 仅接受 tag-pinned、checksum-valid v1.2.1-compatible Bundle；旧 identity-only material 始终 fail-closed | KEEP |
| Fixture contract acceptance | Existing Gateway/parser and E2E owners | Bundle-defined catalog, run, result, artifact, SSE and idempotency semantics 在 CI 可复现 | KEEP |
| Live same-key replay proof | Existing Skill Run E2E harness | 两个独立 Work client/session 使用相同 idempotency identity 得到同一 Provider `run_id`，且不产生第二个 Run | MODIFY |
| Checkpoint B live evidence | Existing Skill Run E2E harness | Catalog → start → terminal → artifact/empty → rehydrate 的 live run 完成，输出不含 secret 或敏感正文 | MODIFY |
| Feature mode / Expert compatibility | Existing feature-mode and Expert owners | 默认仍为 `expert-compat`；没有 live proof 时不启用新提交 | KEEP |

## Change Classification

| Change ID | Capability | Action | Rationale |
|---|---|---|---|
| C01 | Controlled live idempotency replay acceptance | MODIFY | 扩展既有 Skill Run E2E harness，使独立 client/session 同 key replay 成为真实 Provider oracle；不新建 client/service owner。 |
| C02 | Checkpoint B evidence capture and redaction | MODIFY | 复用既有 live/fixture E2E entry，保留可审计且不含 URL、JWT、prompt 正文或 artifact bytes 的 M0 evidence。 |
| C03 | Consumer lock and Bundle validation | KEEP | v1.2.1 lock、manifest、LF SHA256SUMS 和 P0 completeness 已由既有 Work owner 校验。 |
| C04 | Feature mode and Expert compatibility | KEEP | M0 只关闭合同证据门；默认 mode 与 Expert removal 仍由后续 M5/M6 拥有。 |

## Contract and Security Boundary

- 请求只使用 Bundle 定义的 public endpoint、`Authorization` 和 `X-Idempotency-Key`；同 key 的 scope 为 authenticated org、user、tool。
- 两个 live client/session 必须使用相同已授权 subject、tool、request identity 与参数；断言接受结果返回相同 `run_id`。不得依赖 Provider 内部计数器、日志或数据库。
- fixture 继续作为 unauthorized、unpublish、reconnect、cancel、artifact failure 和 unsafe payload 的可重跑负向证据；受控 live 环境只运行被 Provider 明确支持的 public scenario。
- Renderer 不接收 backend origin、JWT、SSE credential、download token、absolute path 或 raw Provider event；证据文件只记录结果状态、run identity 的不可逆摘要或允许公开的断言，不记录 secret/prompt/body/bytes。
- Live failure、缺失环境变量、catalog 找不到指定 tool、replay 返回不同 run_id 或测试超时均为 M0 BLOCKED/FAIL，绝不自动转发 Expert Task。

## Acceptance Criteria

1. Work 的 v1.2.1 consumer lock、manifest、LF `SHA256SUMS` 与所有 P0 required paths 离线验证通过；v1.0.0 identity-only material 仍返回 closed gate。
2. CI fixture 通过 Bundle 定义的 JSON-RPC Catalog discriminator、Public Run/Result/Artifact、SSE replay 和 idempotency success/conflict semantics；缺失 discriminator 或 checksum/path 失败必须 fail-closed。
3. 受控 live 环境中，两个独立 Work client/session 以相同 subject、tool、arguments 和 `X-Idempotency-Key` 提交，得到同一 Provider `run_id`；replay 不创建第二个 Run。
4. 受控 live 环境完成 Catalog → start → terminal → artifact/empty → rehydrate，rehydrate 不创建第二次 `tools/call`；终态和 `run_id` 与 Bundle contract 一致。
5. Fixture 与 live evidence 覆盖 unauthorized、unpublish、offline/reconnect、duplicate submission、cancel 与 artifact failure 的既定 fail-closed/恢复语义；只有 Provider 可安全触发的 live case 可实际执行，其余以 fixture 可重跑证据保留。
6. 任何验证输出、日志或 Roadmap evidence 均不包含 JWT、Authorization header、absolute backend URL、prompt 正文、Result body、download token 或 artifact bytes。
7. M0 完成前，`expert-compat` 默认、Skill/Expert reader 并存与 no-silent-fallback 行为保持不变；不得借 M0 改为 `skill-first` 或删除 Expert 入口。

## Definition of Done

1. `C01`/`C02` 有 APPROVED Stage PRD、validated Plan、review PASS、implementation commit 与脱敏验证证据；Bundle 只来自本仓已锁定合同目录。
2. 受控 live 环境实际执行并通过 AC-03/AC-04；若环境未提供，Roadmap RM-01 保持 BLOCKED，不能标记 DONE。
3. RM-01 只有在所有 M0 exit criteria 与本 PRD AC 通过后才以独立 Roadmap status commit 更新为 DONE；M1–M4 不在本 PRD 中回填或标记 DONE。

## Source Anchors

- `contracts/skill-run/v1.2.1/manifest.json`
- `contracts/skill-run/v1.2.1/SHA256SUMS`
- `contracts/skill-run/v1.2.1/http/endpoint-matrix.json`
- `contracts/skill-run/v1.2.1/fixtures/idempotency-replay.json`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-e2e.test.ts`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md#Roadmap Items`

