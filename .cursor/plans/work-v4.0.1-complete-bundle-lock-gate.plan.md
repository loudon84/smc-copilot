---
name: ""
overview: ""
todos: []
isProject: false
---

# WORK-SKILL-FIRST-LAYOUT-V4.0.1 Complete Bundle Lock Gate

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-skill-first-layout-run-integration.md)

## Scope

- In: PRD C01 Work Contract Bundle / lock Gate; PRD C02 Skill Run Gateway / contract adapter fail-closed on incomplete Bundle or missing Catalog discriminator.
- Out: PRD C03 production-default REPLACE remaining (Skill Run path already exists; M5 switches default); PRD C04 Expert default REMOVE (v4.2 Removal PRD); PRD C05 Work-authored Provider Bundle files (Provider Owner delivers into `contracts/skill-run/<version>/`; Work only validates); live-E2E enablement; P1 Approval/activity/forms/attachments.
- Production Owner inherited from PRD: existing Work Skill Run consumer-lock owner and existing Main `SkillRunGatewayClient` / contract adapter. Do not ADD a parallel lock service, parser, or gateway.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunConsumerLock` | exists at `e72e5edc`; returns true when `consumer-lock.json` and `SHA256SUMS` exist | `hasSkillRunConsumerLock` / `findSkillRunConsumerLockDir` resolved | `createSkillRunGatewayClient` defaults `lockGate` from `hasSkillRunConsumerLock`; `SkillRunService.start` and rehydrate call `gateway.hasConsumerLock()` | Node `fs` + `crypto.createHash('sha256')` already available; no second lock module; current test asserts identity-only lock is true | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | exists at `e72e5edc`; `listCatalog` returns `contract-unsupported` only when `lockGate` is false; `callSkill`/`getRunSnapshot`/`cancelRun` use `assertLock()` | `createSkillRunGatewayClient` resolved; `mapPublicSkillCatalogTools` filters `capabilityKind !== "skill"` and yields empty `ready` catalog when the field is absent | Renderer `hermesAPI.skillRun` → IPC → `SkillRunService` → gateway; tests inject `hasConsumerLock: true` | Reuse `SkillCatalogResponse.status = "contract-unsupported"`; do not add a new parser class | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Layout 显示一级“使用技能”；空白 scratch 原地切 mode，已有内容时创建/激活独立 Skill Tab，不取消其它运行。 | BEHAVIOR | - | - | V05 | UNIT | yes |
| AC-02 | AC | View 不新增 Skill Chat 页面；现有 Chat/MessageList/ChatInput 被复用。 | BEHAVIOR | - | - | V05 | UNIT | yes |
| AC-03 | AC | ChatRun 只拥有 execution mode；Skill selection truth 在当前 Chat 中唯一，提交/排队保存不可变 snapshot。 | BEHAVIOR | - | - | V05 | UNIT | yes |
| AC-04 | AC | 未选择 Skill 时展示 Catalog 并禁用发送；选择后展示 Selection Bar；全部错误/空状态可恢复。 | BEHAVIOR | C02 | T2 | V02 | INTEGRATION | yes |
| AC-05 | AC | Skill mode 不渲染本地模型、Reasoning、Fast Mode、Context Folder 或 Expert 控件；附件未合同化时明确禁用。 | BEHAVIOR | - | - | V05 | UNIT | yes |
| AC-06 | AC | Catalog 只显示合同可证明为 Skill 的项；缺少 discriminator 时显示 contract unsupported，而不是猜测过滤。 | CONTRACT | C02 | T2 | V02 | INTEGRATION | yes |
| AC-07 | AC | Work locks only the complete, tag/release-identified and checksummed Skill Run Contract Bundle delivered by Provider Owner; identity-only consumer-lock.json + SHA256SUMS is not a closed lock and must surface contract-unsupported for Catalog, production start, and live-E2E. The old work-expert lock remains unchanged and Provider source is never a Contract input. | CONTRACT | C01<br>C02 | T1<br>T2 | V01<br>V02 | CONTRACT_RELEASE | yes |
| AC-08 | AC | 新调用只使用 tool_name 与 run_id，不发送 Expert/Agent/Runtime/Profile/Workspace routing 字段。 | CONTRACT | - | - | V03 | INTEGRATION | yes |
| AC-09 | AC | Provider run_id、Renderer ChatRun.runId 与 clientRequestId 在类型、持久化和日志中不可互换。 | CONTRACT | - | - | V03 | INTEGRATION | yes |
| AC-10 | AC | Renderer 无法取得 JWT、Backend/Agent URL、raw Provider event、download token 或 absolute path。 | SECURITY | - | - | V04 | DIFF_SCOPE | yes |
| AC-11 | AC | Main 是唯一 Skill Run lifecycle owner；Renderer store 仅为 projection。 | BEHAVIOR | - | - | V03 | INTEGRATION | yes |
| AC-12 | AC | 不确定网络与 App 重启使用同一 idempotency identity 恢复，跨端证明只创建一个 Provider Run。 | LIFECYCLE | - | - | V05 | INTEGRATION | yes |
| AC-13 | AC | SSE replay 去重、terminal 单调、poll fallback 和 cleanup 可验证；旧事件不能回退终态。 | LIFECYCLE | - | - | V05 | INTEGRATION | yes |
| AC-14 | AC | 同一 Chat Tab 至多一个 active Skill Run；queue item 不因用户更换 Skill 而改路由。 | LIFECYCLE | - | - | V03 | INTEGRATION | yes |
| AC-15 | AC | 取消只调用 Skill Run cancel；不得误调用 Local Chat abort。Approval 未合同化时只读等待，不显示伪交互。 | LIFECYCLE | - | - | V03 | INTEGRATION | yes |
| AC-16 | AC | 只有合同枚举事件可产生 activity UI；unknown payload 不文本化、不触发不可逆 UI side effect。 | BEHAVIOR | - | - | V05 | INTEGRATION | yes |
| AC-17 | AC | Result 更新同一 assistant transcript；restart 后 session mode、在途 projection 与历史可恢复且不重复 start。 | LIFECYCLE | - | - | V05 | INTEGRATION | yes |
| AC-18 | AC | Artifact 进入现有 File Platform，以 run-scoped remote identity 去重，并通过现有 Preview/Save As/Materialize API 使用。 | BEHAVIOR | - | - | V05 | INTEGRATION | yes |
| AC-19 | AC | 不得新增 Skill conversation/file parallel SoT 或直接 Artifact download IPC。 | SCOPE | - | - | V04 | DIFF_SCOPE | yes |
| AC-20 | AC | Skill-first、Expert compatibility 与 Local Chat 路径显式互斥；一条消息不会同时创建 Skill Run 与 ExpertTask。 | BEHAVIOR | - | - | V03 | INTEGRATION | yes |
| AC-21 | AC | Skill-first 失败不自动 fallback；回滚停止新建但保留 Skill/Expert 各自 reader。 | BEHAVIOR | - | - | V03 | INTEGRATION | yes |
| AC-22 | AC | Expert 默认创建入口的最终删除满足 Compatibility Contract，并由独立 Removal PRD 执行。 | RELEASE | - | - | V06 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | Provider Owner Contract Bundle and Work Consumer Lock are present and content-validated; no schema is unverified and no Work implementation/test input comes from Provider source. | CONTRACT | C01 | T1 | V01 | CONTRACT_RELEASE | yes |
| DOD-02 | DOD | Contract、Main、IPC、Renderer 与 Session 聚焦测试全部通过，无回归。 | EVIDENCE | C01<br>C02 | T1<br>T2 | V03 | INTEGRATION | yes |
| DOD-03 | DOD | 生产切换前通过完整 Checklist，历史任务可独立恢复且无 silent fallback。 | OPERATIONS | - | - | V06 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Skill Run start / recover | AC-12 | `SkillRunService.start` after complete Bundle and feature mode `skill-first` | pending-submit / accepted non-terminal | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | same owner cancel / terminal error; incomplete Bundle never leaves local fail-closed | V05 |
| SSE / poll projection | AC-13 | accepted `run_id` event stream or poll | running / reconnecting | `createSkillRunService` | same owner; unknown events fail-soft without terminal rollback | V05 |
| Single active run | AC-14 | second start on same session | existing non-terminal | `createSkillRunService` rejects `RUN_ALREADY_ACTIVE` | queue snapshot owned by Chat submit; cancel via `skillRun.cancel` | V03 |
| Cancel | AC-15 | user cancel | cancelling | `createSkillRunService` / `cancelRun` | Local Chat abort must not be called | V03 |
| Transcript restore | AC-17 | restart rehydrate | non-terminal continuation | `createSkillRunService` rehydrate; no second `tools/call` | terminal cleanup retains transcript | V05 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Catalog enablement | AC-06 AC-07 | Work lock owner `hasSkillRunConsumerLock` over `contracts/skill-run/<version>/` | none when incomplete; when complete, Main `POST /api/v1/mcp` `tools/list` JSON-RPC | `createSkillRunGatewayClient` `listCatalog` → `SkillCatalogResponse` | `status`; `tools[].capabilityKind` when listing | `hasSkillRunConsumerLock` then `listCatalog` discriminator check | incomplete or missing discriminator → `contract-unsupported` / `CONTRACT_UNSUPPORTED`; no Provider HTTP | catalog has no idempotency key | V01 V02 |
| Production start enablement | AC-07 DOD-01 | same lock owner | none when incomplete; when complete, `POST /api/v1/mcp` `tools/call` plus `X-Idempotency-Key` | `callSkill` / `SkillRunService.start` | lock completeness; `toolName`; `prompt`; `idempotencyKey` | `assertLock` in gateway; feature mode in service | incomplete lock → `CONTRACT_UNSUPPORTED`; feature mode not `skill-first` → `START_DISABLED_FEATURE_MODE` | `clientRequestId` / `X-Idempotency-Key` only after lock closed | V01 V03 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Output | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | CONTRACT_RELEASE | `npm test -- src/main/skill-run/skill-run-consumer-lock.test.ts` (cwd `apps/work`) | identity-only `contracts/skill-run/v1.0.0` → `hasSkillRunConsumerLock() === false`; temp complete checksummed fixture → `true`; `contracts/work-expert/v1.0.2/consumer-lock.json` still present | SHA256 mismatch or missing `manifest.json` / required schema path → false; no Provider source read | `artifacts/work-v4.0.1-complete-bundle-lock-gate/v01-consumer-lock.txt` | local repo | yes |
| V02 | INTEGRATION | `npm test -- src/main/skill-run/skill-run-gateway-client.test.ts` (cwd `apps/work`) | default lock (identity-only) catalog `status=contract-unsupported` and fetch not called; `tools/call` throws `CONTRACT_UNSUPPORTED`; raw tools without `capabilityKind` → `contract-unsupported` not `ready` empty | `hasConsumerLock: true` wire tests still list only `capabilityKind=skill` | `artifacts/work-v4.0.1-complete-bundle-lock-gate/v02-gateway.txt` | local repo | yes |
| V03 | INTEGRATION | `npm test -- src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-ipc.test.ts` (cwd `apps/work`) | start with no lock returns contract-unsupported; no Expert fallback; identities not swapped | cancel does not call local abort; no second SkillRunService | `artifacts/work-v4.0.1-complete-bundle-lock-gate/v03-service-ipc.txt` | local repo | yes |
| V04 | DIFF_SCOPE | `npm run guard` (cwd `apps/work`) | renderer contract / no renderer runtime HTTP / no reference imports | no new Artifact download IPC; Expert lock path untouched | `artifacts/work-v4.0.1-complete-bundle-lock-gate/v04-guard.txt` | local repo | yes |
| V05 | INTEGRATION | `npm test -- src/main/skill-run/skill-run-e2e.test.ts src/renderer/src/screens/Layout/chatRuns.test.ts --pool=threads --maxWorkers=1` (cwd `apps/work`) | fixture e2e still injects lock and covers idempotency/SSE/artifact/unknown-event; chatRuns executionMode scratch preserved | live suite remains `describe.skipIf` unless `SMC_SKILL_RUN_E2E=1`; this slice must not force live on | `artifacts/work-v4.0.1-complete-bundle-lock-gate/v05-regression.txt` | local repo; live env not required | yes |
| V06 | DOCUMENT_SEMANTIC | `git grep -n createExpertRunService -- apps/work/src/main/expert/expert-run-service.ts` and confirm this Plan Scope.Out contains C04 | Expert Run Service still exists; this slice does not delete default Expert entry | no REMOVE of Expert IPC in the Change Matrix | `artifacts/work-v4.0.1-complete-bundle-lock-gate/v06-expert-retained.txt` | local repo | yes |

## Immediate Read

- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunConsumerLock`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#findSkillRunConsumerLockDir`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts`
- `contracts/skill-run/v1.0.0/consumer-lock.json`
- `contracts/skill-run/v1.0.0/SHA256SUMS`
- `apps/work/lat.md/skill-run.md` (M0 lock paragraph)

## Triggered Read

- If checksum helper needs an existing hash utility: search `apps/work/src` for `createHash` / `sha256` and reuse; otherwise Node `crypto`.
- If `listCatalog` raw tool shape is not an array of records: `apps/work/src/main/skill-run/skill-run-contract-parser.ts#mapPublicSkillCatalogTools`.
- If service start bypasses gateway lock: `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`.
- If lat.md section ids break `lat check`: `apps/work/lat.md/skill-run.md` only.
- Otherwise: do not read

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunConsumerLock` | PROD | MODIFY | Work Skill Run consumer-lock owner | T1 | identity-only lock is not closed; complete checksummed Bundle is required | Work Contract Bundle / lock Gate | no |
| C01 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#findSkillRunConsumerLockDir` | PROD | MODIFY | Work Skill Run consumer-lock owner | T1 | directory selection uses the same completeness predicate | Work Contract Bundle / lock Gate | no |
| C01 | `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts` | TEST | MODIFY | existing consumer-lock tests | T1 | assert current v1.0.0 identity-only is false; fixture complete tree is true | Work Contract Bundle / lock Gate | no |
| C01 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | Skill Run architecture notes | T1 | document complete-Bundle lock Gate; identity-only insufficient | Work Contract Bundle / lock Gate | no |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | PROD | MODIFY | Main SkillRunGatewayClient | T2 | Catalog/start/live HTTP stay behind complete lock; missing discriminator → `contract-unsupported` | Skill Run Gateway / contract adapter | no |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts` | TEST | MODIFY | existing gateway contract tests | T2 | default lock does not fetch; missing `capabilityKind` is unsupported | Skill Run Gateway / contract adapter | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `hasSkillRunConsumerLock` is the single production predicate used by `createSkillRunGatewayClient` (`lockGate`) and `SkillRunService` via `gateway.hasConsumerLock()` | Tightening this function closes Catalog/start/live enablement without a new lock service; Node `fs` + `crypto` checksum the SHA256SUMS list in-place |
| C02 | MODIFY_EXISTING | `listCatalog` already has a `contract-unsupported` branch; `mapPublicSkillCatalogTools` already keeps `capabilityKind === "skill"` but current missing-field path yields `ready` + empty tools | One extra discriminator check in the existing gateway owner; no new adapter; tests that inject `hasConsumerLock: true` keep wire coverage |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunConsumerLock`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.ts#findSkillRunConsumerLockDir`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts`<br>`apps/work/lat.md/skill-run.md` | `contracts/skill-run/v1.0.0/consumer-lock.json`<br>`contracts/skill-run/v1.0.0/SHA256SUMS` | - | no |
| T2 | C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.test.ts` | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunConsumerLock`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts#mapPublicSkillCatalogTools` | T1 | no |

## Integration Hotspots

None

## Generated Outputs Ledger

None

## Todo T1 — Complete Bundle lock predicate

**Owns Changes**
- C01

**Goal**

Make `hasSkillRunConsumerLock()` return true only when `contracts/skill-run/<version>/` contains a checksum-valid complete Bundle (lock, SHA256SUMS entries, `manifest.json`, and the PRD P0 schema/matrix/fixture paths). Current identity-only v1.0.0 must return false. Do not write Provider schemas.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunConsumerLock`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#findSkillRunConsumerLockDir`

**Changes**
- Parse SHA256SUMS (LF); verify every listed file exists and sha256 matches.
- Require `manifest.json` and the P0 paths already named in the current SHA256SUMS (mcp/runs/events/http/fixtures/capabilities). Missing or mismatched → false.
- Keep `work-expert` lock untouched.
- Update consumer-lock tests and the M0 paragraph in `lat.md/skill-run.md`.

**Stop conditions**
- [ ] `hasSkillRunConsumerLock()` is false on repo `contracts/skill-run/v1.0.0`
- [ ] A temp complete checksummed fixture returns true
- [ ] V01 command passes

**Triggered reads**
- If no existing sha256 helper: use Node `crypto.createHash('sha256')`
- Otherwise: none

## Todo T2 — Gateway fail-closed Catalog and start

**Owns Changes**
- C02

**Goal**

Keep Provider HTTP behind the tightened lock. Catalog with default (incomplete) lock must be `contract-unsupported` with zero fetch. Raw `tools/list` results that omit `capabilityKind` must be `contract-unsupported`, not an empty ready list.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`

**Changes**
- After T1, default `lockGate` is false for identity-only; keep `assertLock` / catalog unsupported branch.
- In `listCatalog`, if any raw tool record lacks `capabilityKind`, return `contract-unsupported` (do not map-as-empty-ready).
- Add tests without `hasConsumerLock: true` and a missing-discriminator case. Do not enable live E2E.

**Stop conditions**
- [ ] Default-lock catalog does not call fetch
- [ ] Missing discriminator is `contract-unsupported`
- [ ] V02 command passes

**Triggered reads**
- If raw tool iteration is cleaner in the parser: `mapPublicSkillCatalogTools` (read-only unless discriminator check cannot live in gateway)
- If start bypasses gateway lock: `createSkillRunService` (read-only; hoist back to T1 if a second lock predicate appears)
- Otherwise: none

## Verification

Use the Verification Ledger as the only evidence SOT. Run from `apps/work` after T1 then T2:

```bash
npm test -- src/main/skill-run/skill-run-consumer-lock.test.ts
npm test -- src/main/skill-run/skill-run-gateway-client.test.ts
npm test -- src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-ipc.test.ts
npm run guard
npm test -- src/main/skill-run/skill-run-e2e.test.ts src/renderer/src/screens/Layout/chatRuns.test.ts --pool=threads --maxWorkers=1
```

Retain stdout under `artifacts/work-v4.0.1-complete-bundle-lock-gate/`. Do not set `SMC_SKILL_RUN_E2E=1` in this slice.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | T1/T2 done, V01–V06 retained, and this slice's fail-closed oracles met. Does not claim ROADMAP M0 / production Gate closed while repo Bundle is still identity-only | V01,V02,V03,V04,V05,V06 |
| IMPLEMENTED_NOT_PROVEN | lock/gateway code changed but a blocking V command was not retained | pending V id named |
| BLOCKED | production HTTP or live-E2E would require a complete Provider Bundle that Work must not invent | record missing Bundle files under `contracts/skill-run/v1.0.0/` |
| RETURN_PRD | would need a new lock owner, Provider-source parser, or Work-authored schema SOT | PRD revision requested |
