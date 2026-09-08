---
plan_contract: smc.plan.v3.2
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1
grounded_commit: e72e5edc15af93e6e3a34cc4d6f9517fcd2b7931
grounding_source: committed_baseline
working_tree_fingerprint: sha256:fcf8b67c00516fded5d0b25bc68d4182271b5b13b25bfefb18e7c2f7ac39a14c
---

# WORK-SKILL-FIRST-LAYOUT-V4.0.1 Checkpoint B Live E2E Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md)

## Scope

- In:
  1. 一条可观察 happy path：`listCatalog` → `start`（prompt-first）→ SSE/poll 终态 → result text → artifact list → dispose + `rehydrate` 零第二次 `tools/call`；
  2. 负向：401 catalog、tool 从 catalog 消失、SSE 断线 + `Last-Event-ID` 重连、同一 `X-Idempotency-Key` replay 同一 `run_id`、cancel、artifact discovery 失败不把 succeeded 打成 failed；
  3. CI：fixture `fetchImpl` 调度（复用已有 `createAuthorizedBackendTransport({ fetchImpl })` + `createSkillRunService`）；
  4. Live：`describe.skipIf`，环境变量提供 backend URL / access token / 已发布 `toolName`；证据文件脱敏（无 JWT/绝对 URL）；
  5. `lat.md` 写明 Checkpoint B live 边界与 live skip 时 AC-12 未 proven；
  6. `package.json` 增加 `test:skill-run-e2e` 脚本。
- Out:
  1. 不改 Skill Run 生产生命周期语义（除非 E2E 发现合同路径仍不匹配——那时 STOP 并 RETURN_PRD，不在 E2E 里补 parser）；
  2. 不新建第二套 Service / Playwright Skill Chat / 平行 session DB；
  3. 不把 Provider schema 复制进 `contracts/` 之外的 SOT（fixture JSON 只活在测试文件）；
  4. M5 生产默认、遥测 dashboard、M6 P1、Expert REMOVE；
  5. 不在证据或日志中留下 JWT / prompt 全文 / artifact bytes；
  6. 不覆盖已有 A/B/C `.plan.md`。
- Production Owner inherited from PRD:
  - Lifecycle = `SkillRunService`
  - HTTP = Gateway + authorized transport
  - File = 现有 File Platform（live 只断言 descriptor 进入 `onUpsertArtifact`，不新 download IPC）

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` | absent at `grounded_commit` | new vitest suite entry | vitest -> e2e suite -> `createSkillRunService` / `createSkillRunGatewayClient` | `skill-run-service.test.ts`, `skill-run-gateway-client.test.ts` (fetchImpl + idempotency) | PASS |
| C02 | `apps/work/package.json` | exists at `grounded_commit` | `scripts` object resolved | npm -> `test:skill-run-e2e` -> vitest file | existing `test` / `test:e2e-prd-smoke` scripts | PASS |
| C03 | `apps/work/lat.md/skill-run.md` | exists at `grounded_commit` | doc file resolved | lat index -> skill-run boundary page | Checkpoint C lat updates at same path | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Layout 显示一级“使用技能”；空白 scratch 原地切 mode，已有内容时创建/激活独立 Skill Tab，不取消其它运行。 | BEHAVIOR | - | - | V04 | UNIT | yes |
| AC-02 | AC | View 不新增 Skill Chat 页面；现有 Chat/MessageList/ChatInput 被复用。 | BEHAVIOR | - | - | V04 | UNIT | yes |
| AC-03 | AC | ChatRun 只拥有 execution mode；Skill selection truth 在当前 Chat 中唯一，提交/排队保存不可变 snapshot。 | BEHAVIOR | - | - | V04 | UNIT | yes |
| AC-04 | AC | 未选择 Skill 时展示 Catalog 并禁用发送；选择后展示 Selection Bar；全部错误/空状态可恢复。 | BEHAVIOR | - | - | V04 | UNIT | yes |
| AC-05 | AC | Skill mode 不渲染本地模型、Reasoning、Fast Mode、Context Folder 或 Expert 控件；附件未合同化时明确禁用。 | BEHAVIOR | - | - | V04 | UNIT | yes |
| AC-06 | AC | Catalog 只显示合同可证明为 Skill 的项；缺少 discriminator 时显示 contract unsupported，而不是猜测过滤。 | CONTRACT | C01 | T1 | V01 | INTEGRATION | yes |
| AC-07 | AC | Work 锁定带 tag/checksum 的完整 Skill Run Consumer Contract；旧 work-expert lock 不变。 | CONTRACT | C01 | T1 | V01, V04 | INTEGRATION | yes |
| AC-08 | AC | 新调用只使用 toolname 与 runid，不发送 Expert/Agent/Runtime/Profile/Workspace routing 字段。 | CONTRACT | C01 | T1 | V01 | INTEGRATION | yes |
| AC-09 | AC | Provider runid、Renderer ChatRun.runId 与 clientRequestId 在类型、持久化和日志中不可互换。 | CONTRACT | - | - | V04 | UNIT | yes |
| AC-10 | AC | Renderer 无法取得 JWT、Backend/Agent URL、raw Provider event、download token 或 absolute path。 | SECURITY | C01, C03 | T1, T3 | V01, V02 | INTEGRATION | yes |
| AC-11 | AC | Main 是唯一 Skill Run lifecycle owner；Renderer store 仅为 projection。 | LIFECYCLE | C01 | T1 | V01 | INTEGRATION | yes |
| AC-12 | AC | 不确定网络与 App 重启使用同一 idempotency identity 恢复，跨端证明只创建一个 Provider Run。 | NEGATIVE | C01, C03 | T1, T3 | V01, V02 | REAL_PROCESS | yes |
| AC-13 | AC | SSE replay 去重、terminal 单调、poll fallback 和 cleanup 可验证；旧事件不能回退终态。 | NEGATIVE | C01 | T1 | V01 | INTEGRATION | yes |
| AC-14 | AC | 同一 Chat Tab 至多一个 active Skill Run；queue item 不因用户更换 Skill 而改路由。 | BEHAVIOR | - | - | V04 | UNIT | yes |
| AC-15 | AC | 取消只调用 Skill Run cancel；不得误调用 Local Chat abort。Approval 未合同化时只读等待，不显示伪交互。 | BEHAVIOR | C01 | T1 | V01 | INTEGRATION | yes |
| AC-16 | AC | 只有合同枚举事件可产生 activity UI；unknown payload 不文本化、不触发不可逆 UI side effect。 | NEGATIVE | C01 | T1 | V01 | INTEGRATION | yes |
| AC-17 | AC | Result 更新同一 assistant transcript；restart 后 session mode、在途 projection 与历史可恢复且不重复 start。 | NEGATIVE | C01 | T1 | V01, V02 | INTEGRATION | yes |
| AC-18 | AC | Artifact 进入现有 File Platform，以 run-scoped remote identity 去重，并通过现有 Preview/Save As/Materialize API 使用。 | NEGATIVE | C01 | T1 | V01 | INTEGRATION | yes |
| AC-19 | AC | 不得新增 Skill conversation/file parallel SoT 或直接 Artifact download IPC。 | SECURITY | C01 | T1 | V01 | DIFF_SCOPE | yes |
| AC-20 | AC | Skill-first、Expert compatibility 与 Local Chat 路径显式互斥；一条消息不会同时创建 Skill Run 与 ExpertTask。 | BEHAVIOR | C01 | T1 | V01, V05 | INTEGRATION | yes |
| AC-21 | AC | Skill-first 失败不自动 fallback；回滚停止新建但保留 Skill/Expert 各自 reader。 | BEHAVIOR | C01 | T1 | V01, V05 | INTEGRATION | yes |
| AC-22 | AC | Expert 默认创建入口的最终删除满足 Compatibility Contract，并由独立 Removal PRD 执行。 | SCOPE | - | - | V05 | UNIT | yes |
| DOD-01 | DOD | Provider Contract Gate 与 Work Consumer Lock 就绪，无未验证 schema。 | CONTRACT | C01 | T1 | V01, V04 | INTEGRATION | yes |
| DOD-02 | DOD | Contract、Main、IPC、Renderer 与 Session 聚焦测试全部通过，无回归。 | EVIDENCE | C01, C02 | T1, T2 | V01, V03, V04, V05 | INTEGRATION | yes |
| DOD-03 | DOD | 生产切换前通过完整 Checklist，历史任务可独立恢复且无 silent fallback。 | OPERATIONS | C03 | T3 | V02 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Fixture Happy Path | AC-11, AC-12, AC-13, AC-17, AC-18 | test calls `SkillRunService.start` | pending-submit -> starting -> running | `SkillRunService.updateProjection` | `SkillRunService.updateProjection` | V01 |
| Fixture Negatives | AC-15, AC-16, AC-20, AC-21 | unauthorized / missing tool / cancel / artifact 5xx / unknown event | pending-submit / running / cancelling | `SkillRunService.updateProjection` | `SkillRunService.updateProjection` | V01 |
| Restart Rehydrate | AC-12, AC-17 | dispose service then `rehydrate` with continuation | starting / running | `SkillRunService.rehydrate` | `SkillRunService.updateProjection` | V01, V02 |
| Live Catalog to Artifact | AC-06, AC-08, AC-12 | live env gated `start` against real backend | pending-submit -> running | `SkillRunService.updateProjection` | `SkillRunService.updateProjection` | V02 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Catalog | AC-06, AC-07 | Gateway `tools/list` via fixture or live fetch | HTTP `POST /api/v1/mcp` JSON-RPC | `mapPublicSkillCatalogTools` -> Service bind | `capabilityKind=skill`, `name` | `skill-run-gateway-client` / parser | 401 -> catalog unauthorized / CATALOG_UNAVAILABLE | auth token (not logged) | V01, V02 |
| Start | AC-08, AC-11, AC-12 | `SkillRunService.start` | persist then Gateway `tools/call` + `X-Idempotency-Key` | Backend Accepted `run_id` | `toolName`, `prompt`, `clientRequestId` | Service + Gateway | missing tool -> TOOL_NOT_FOUND; 409 -> IDEMPOTENCY_CONFLICT | `clientRequestId` | V01, V02 |
| Events | AC-13, AC-16 | SSE / poll | SSE envelope `event_id`/`event_seq` | `parseSkillRunEvent` -> projection | `run.completed` / known enums | `skill-run-contract-parser` | unknown -> fail-soft; disconnect -> Last-Event-ID reconnect | `lastEventId` + `providerRunId` | V01 |
| Restart | AC-12, AC-17 | continuation shape | in-memory / store rehydrate | `SkillRunService.rehydrate` | `clientRequestId`, `providerRunId`, `toolName` | Service | must not issue second `tools/call` | `clientRequestId` | V01, V02 |
| Live duplicate | AC-12 | two `start` same key | backend idempotency replay | same `run_id` | `X-Idempotency-Key` | Gateway + backend | conflict/replay must not create second run | `clientRequestId` | V01, V02 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Output | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | INTEGRATION | `npm test -- src/main/skill-run/skill-run-e2e.test.ts --pool=threads --maxWorkers=1` | fixture happy + six negatives; `tools/call` count is 1 under duplicate/restart | unauthorized, unpublish, reconnect, duplicate, cancel, artifact failure | `artifacts/work-v4.0.1-checkpoint-b-live-e2e/v01-fixture.txt` | local node | yes |
| V02 | REAL_PROCESS | same file with `SMC_SKILL_RUN_E2E=1` + URL/token/tool | Catalog contains published skill; one call; terminal; artifact or explicit empty list; rehydrate no second call | missing env -> skip; Completion = IMPLEMENTED_NOT_PROVEN for AC-12 cross-end | `artifacts/work-v4.0.1-checkpoint-b-live-e2e/v02-live.txt` (redacted) | live NoDeskClaw backend | yes |
| V03 | INTEGRATION | `npm run test:skill-run-e2e` | same fixture oracle as V01 | script missing or wrong path fails | `artifacts/work-v4.0.1-checkpoint-b-live-e2e/v03-script.txt` | local node | yes |
| V04 | UNIT | `npm test -- src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-gateway-client.test.ts src/main/skill-run/skill-run-consumer-lock.test.ts --pool=threads --maxWorkers=1` | prior Checkpoint C/M0 suites remain green | lock/parser/gateway regressions | `artifacts/work-v4.0.1-checkpoint-b-live-e2e/v04-regression.txt` | local node | yes |
| V05 | UNIT | `npm test -- src/main/expert/expert-gateway-client.test.ts` | Expert gateway remains green; no silent Skill fallback wiring | Expert path unchanged | `artifacts/work-v4.0.1-checkpoint-b-live-e2e/v05-expert.txt` | local node | yes |

## Immediate Read

- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts`
- `apps/work/src/main/auth/authorized-backend-transport.ts#createAuthorizedBackendTransport`

## Triggered Read

- If live 401/timeout: token-store / ensureAccessToken path
- If artifact upsert failure needs stronger assert: `upsert-skill-run-remote-artifact.ts` (default only spy callback)
- Otherwise: do not read

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` | TEST | ADD | - | T1 | Fixture dispatcher + live skipIf covering Catalog→Run→Result→Artifact→Restart and six negatives | Skill Run live/fixture E2E proof | yes |
| C02 | `apps/work/package.json` | CONFIG | MODIFY | `apps/work/package.json` | T2 | `test:skill-run-e2e` runs vitest on e2e file with `--pool=threads --maxWorkers=1` | Focused E2E npm entry | no |
| C03 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | `lat.md/skill-run.md` | T3 | Document Checkpoint B live boundary, env names, AC-12 evidence grading when live skips | Architecture evidence boundary | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MINIMAL_NEW | Expert/PRD-v1.1 E2E cannot own Skill Run contract; `skill-run-service.test.ts` is mock lifecycle and already OOM-sensitive; gateway test already proves fetchImpl + idempotency patterns | New file tests real entrypoints only; no parallel Service |
| C02 | MODIFY_EXISTING | `apps/work/package.json` already owns npm scripts including vitest `test` | Reuse vitest; no Playwright Electron |
| C03 | MODIFY_EXISTING | `apps/work/lat.md/skill-run.md` is the skill-run boundary page updated in Checkpoint C/M0 | Document live skip/AC-12 grading without a second doc owner |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` | `apps/work/src/main/skill-run/skill-run-service.ts`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.ts`<br>`apps/work/src/main/auth/authorized-backend-transport.ts` | - | no |
| T2 | C02 | `apps/work/package.json` | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` | T1 | no |
| T3 | C03 | `apps/work/lat.md/skill-run.md` | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` | T1 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/package.json` | T2 | Manifest script hotspot; serialize vs other package.json writers |

## Generated Outputs Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` | Fixture+live E2E must own Skill Run contract paths without enlarging mock lifecycle suite or Expert e2e | Single test owner for Skill Run live/fixture chain; production owners unchanged |

## Todo T1 — skill-run fixture and live E2E suite

**Owns Changes**
- C01

**Goal**

Add `skill-run-e2e.test.ts` that drives `createSkillRunService` + `createSkillRunGatewayClient` through fixture HTTP replay for happy path and six negatives, plus env-gated live `describe.skipIf`.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts`
- `apps/work/src/main/auth/authorized-backend-transport.ts#createAuthorizedBackendTransport`

**Changes**
- ADD fixture dispatcher covering `POST /api/v1/mcp` `tools/list`|`tools/call`, `X-Idempotency-Key` replay, SSE `event: run.completed` with `event_id`/`event_seq`
- ADD live suite gated by `SMC_SKILL_RUN_E2E=1` plus backend URL/token/tool env vars
- Wire `getFeatureMode: () => "skill-first"` and consumer lock true (or real lock presence)

**Stop conditions**
- [ ] Fixture happy path and six negatives pass under threads pool maxWorkers=1
- [ ] Duplicate/restart assert exactly one `tools/call`
- [ ] Live suite skips cleanly without env; when env present proves Catalog→terminal→rehydrate

**Triggered reads**
- If live 401/timeout: token-store path
- If artifact upsert assert needs File Platform internals: `upsert-skill-run-remote-artifact.ts`
- Otherwise: none

## Todo T2 — npm skill-run e2e script

**Owns Changes**
- C02

**Goal**

Expose `test:skill-run-e2e` that runs the e2e file with the same vitest pool settings as V01.

**Immediate anchors**
- `apps/work/package.json`

**Changes**
- MODIFY scripts to add `test:skill-run-e2e` -> vitest on `src/main/skill-run/skill-run-e2e.test.ts --pool=threads --maxWorkers=1`

**Stop conditions**
- [ ] `npm run test:skill-run-e2e` matches V01 oracle

**Triggered reads**
- None unless a listed trigger becomes true

## Todo T3 — lat Checkpoint B live boundary

**Owns Changes**
- C03

**Goal**

Document live env names, fixture vs live evidence classes, and that AC-12 cross-end is not proven when live skips; keep M5 Still Out.

**Immediate anchors**
- `apps/work/lat.md/skill-run.md`

**Changes**
- MODIFY lat.md to record Checkpoint B live boundary and AC-12 evidence grading

**Stop conditions**
- [ ] lat states live skip => AC-12 cross-end IMPLEMENTED_NOT_PROVEN
- [ ] env var names documented without secrets

**Triggered reads**
- None unless a listed trigger becomes true

## Verification

```bash
cd apps/work
npm test -- src/main/skill-run/skill-run-e2e.test.ts --pool=threads --maxWorkers=1
npm run test:skill-run-e2e
npm test -- src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-gateway-client.test.ts src/main/skill-run/skill-run-consumer-lock.test.ts --pool=threads --maxWorkers=1
npm test -- src/main/expert/expert-gateway-client.test.ts
```

- AC mapping: AC-06/07/08/11/12/13/15/16/17/18/20/21 proven by V01 (+ V02 when live runs)
- Expected: fixture green always; live optional
- Negative/regression case: Expert gateway and skill-run unit suites stay green

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | V01+V03+V04+V05 green with evidence retained AND V02 live actually ran (not skip) for AC-12 cross-end | V01, V02, V03, V04, V05 |
| IMPLEMENTED_NOT_PROVEN | fixture green but live skipped | V01 green; V02 skipped recorded in lat/evidence |
| BLOCKED | no lock (should not occur) or live unreachable while user requires proven | blocker recorded |
| RETURN_PRD | E2E would require Expert client, unlocked production HTTP, or second session/file owner | revision request recorded |
