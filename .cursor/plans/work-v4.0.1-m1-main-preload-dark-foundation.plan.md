---
plan_contract: smc.plan.v3.2
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-02
grounded_commit: ac88d25ea93722126a1d3661ac55404ed92e7eef
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M1 Main/Preload Dark Foundation Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M1-main-preload-dark-foundation.md)

## Scope

- In: reuse and re-prove shared DTO, consumer lock, Gateway, Service start gate, narrow IPC, Preload wrapper, default `expert-compat`, and the four focused suites (29 tests).
- Out: Provider Bundle edits, default `skill-first`, RM-01 live replay, real start/retry/recovery/cancel, session continuation, artifacts, Layout/Chat selection UI, P1, Expert removal.
- Production Owner inherited from PRD: Main `SkillRunGatewayClient` / `SkillRunService`; `apps/work/src/shared/skill-run.ts` owns cross-process DTO; Preload is an IPC wrapper only.

This Plan is KEEP-only. T1 collects blocking evidence; it does not write Skill Run production symbols. Empty production diff vs `grounded_commit` is success, not a reason to invent a code commit.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS` | exists at `ac88d25e` | `SKILL_RUN_IPC_CHANNELS` and `SkillRunApi` resolved | Preload `createSkillRunApi` and Main `registerSkillRunIpc` import shared DTO | no second IPC contract in renderer or preload | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir` | exists at `ac88d25e` | lock predicate resolved | `createSkillRunGatewayClient` uses `hasSkillRunConsumerLock` as `lockGate` | no parallel lock owner | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | exists at `ac88d25e` | `listCatalog` resolved | missing lock or `capabilityKind` returns `contract-unsupported` without follow-on `tools/call` | reuse existing gateway tests | PASS |
| C03 | `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode` | exists at `ac88d25e` | default `expert-compat` resolved | `createSkillRunService` reads mode before start | no second feature-mode store | PASS |
| C03 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | exists at `ac88d25e` | `start` gate resolved | non-`skill-first` returns `START_DISABLED_FEATURE_MODE`; `gateway.callSkill` not called | service tests assert no call | PASS |
| C04 | `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc` | exists at `ac88d25e` | start handler validates sender, auth generation, fields, length | invalid input throws before `service.start` | ipc tests cover rejection paths | PASS |
| C04 | `apps/work/src/preload/skill-run-api.ts#createSkillRunApi` | exists at `ac88d25e` | invoke/on wrapper only | no `fetch`, token, or origin in preload | V02 static read | PASS |
| C05 | `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts` | exists at `ac88d25e` | focused suite resolved | 29 tests across four files at baseline | no new harness | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Shared DTO、IPC channels 和 Preload bridge 继续构成唯一跨进程 Skill Run surface；Renderer 无法获得 access token、backend URL、raw Provider event、download token、absolute path 或 Artifact bytes。 | SECURITY | C01<br>C04 | T1 | V01<br>V02 | UNIT | yes |
| AC-02 | AC | 完整 Consumer Contract lock 缺失或 Catalog 条目缺少 `capabilityKind` 时，Catalog 返回 `contract-unsupported` 且不得猜测或发起后续执行请求。 | CONTRACT | C02 | T1 | V01 | UNIT | yes |
| AC-03 | AC | 默认 feature mode 是 `expert-compat`；在该模式下 `start` 返回 `START_DISABLED_FEATURE_MODE`，且 Gateway `tools/call` 不被调用。 | NEGATIVE | C03 | T1 | V01 | UNIT | yes |
| AC-04 | AC | Main IPC 对 sender、认证代际、必填字段和长度实施校验；认证或输入无效不得将未验证数据交给 Service。 | SECURITY | C04 | T1 | V01 | UNIT | yes |
| AC-05 | AC | M1 不改变 Provider wire contract、不增加默认真实 `tools/call`、不自动 fallback 到 Expert，也不创建平行 Session/File/Lifecycle owner。 | SCOPE | C01<br>C03<br>C05 | T1 | V01<br>V03 | DIFF_SCOPE | yes |
| AC-06 | AC | consumer-lock、gateway、service 和 IPC focused tests 全部通过；任何为 M1 发现的直接回归只在既有 owner 中最小修正。 | EVIDENCE | C05 | T1 | V01 | UNIT | yes |
| AC-07 | AC | RM-01 的 Provider live 验证仍是 RM-04 真实执行与生产路径的硬 Gate；本 M1 PRD 不能作为其替代证据。 | OPERATIONS | C02<br>C03 | T1 | V04 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | M1 只有在本 PRD 有 validated Plan、review PASS、focused verification evidence 和真实 implementation commit 后才能在 Roadmap 标记 `DONE`。 | EVIDENCE | C05 | T1 | V01<br>V02<br>V03<br>V04 | DOCUMENT_SEMANTIC | yes |
| DOD-02 | DOD | M1 完成不改变 RM-01 的 `BACKLOG` 状态，也不允许 RM-04 在 RM-01 未 `DONE` 时进入真实执行。 | OPERATIONS | C03 | T1 | V04 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 任何发现 M1 需要新 Provider schema、改变 Bundle 或放宽 prompt-first/feature gate 的工作，必须返回 RM-01 或独立 Architecture/Provider PRD，不得混入本阶段。 | SCOPE | C02<br>C03 | T1 | V04 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

None

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Catalog fail-closed | AC-02 | `createSkillRunGatewayClient.listCatalog` | `SkillCatalogResponse` on `skill-run:list-catalog` IPC | `createSkillRunApi.listCatalog` | `status`; `tools` | Gateway `listCatalog` | incomplete lock or missing `capabilityKind` → `contract-unsupported`; no `tools/call` | not used on catalog path | V01 |
| Start disabled | AC-03 AC-04 | Renderer via Preload `SkillRunStartInput` | `skill-run:start` IPC | `registerSkillRunIpc` → `createSkillRunService.start` | `toolName`; `prompt`; `clientRequestId`; `sessionId`; `profileId`; `authGeneration` | IPC `registerSkillRunIpc` start handler | invalid input throws; default mode → `START_DISABLED_FEATURE_MODE`; `callSkill` not invoked | not used when start disabled | V01 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Output | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `npx vitest run src/main/skill-run/skill-run-consumer-lock.test.ts src/main/skill-run/skill-run-gateway-client.test.ts src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-ipc.test.ts` (cwd `apps/work`) | 29 tests pass; catalog `contract-unsupported` without lock or `capabilityKind`; default mode `expert-compat`; start returns `START_DISABLED_FEATURE_MODE` and `callSkill` not called; IPC rejects invalid sender, missing fields, auth-generation mismatch | lock-absent fetch and disabled start | `apps/work/artifacts/rm-02-m1/v01-focused-tests.log` | local apps/work | yes |
| V02 | UNIT | `node -e "const fs=require('fs');const p='src/preload/skill-run-api.ts';const s=fs.readFileSync(p,'utf8');const bad=['fetch(','Authorization','accessToken','backendOrigin'];const hit=bad.filter(x=>s.includes(x));if(hit.length)process.exit(1);"` (cwd `apps/work`) | preload file is ipcRenderer invoke/on only | token/network strings absent | `apps/work/artifacts/rm-02-m1/v02-preload-isolation.log` | local apps/work | yes |
| V03 | DIFF_SCOPE | `git diff --exit-code ac88d25ea93722126a1d3661ac55404ed92e7eef -- apps/work/src/shared/skill-run.ts apps/work/src/main/skill-run/skill-run-consumer-lock.ts apps/work/src/main/skill-run/skill-run-gateway-client.ts apps/work/src/main/skill-run/skill-run-service.ts apps/work/src/main/skill-run/feature-mode-store.ts apps/work/src/main/skill-run/skill-run-ipc.ts apps/work/src/preload/skill-run-api.ts` | exit 0; no production KEEP-target diff | no default `skill-first` or new owner in diff | `apps/work/artifacts/rm-02-m1/v03-prod-diff.log` | local git | yes |
| V04 | DOCUMENT | `node -e "const fs=require('fs');const r=fs.readFileSync('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md','utf8');const m=fs.readFileSync('apps/work/src/main/skill-run/feature-mode-store.ts','utf8');let ok=true;if(r.indexOf('RM-01')<0)ok=false;if(r.indexOf('RM-04')<0)ok=false;if(r.indexOf('BACKLOG')<0)ok=false;if(m.indexOf('expert-compat')<0)ok=false;if(!ok)process.exit(1);"` (cwd repo root) | RM-01 and RM-04 remain BACKLOG; default mode unchanged; this Plan is not RM-01 live proof | M1 must not substitute live replay | `apps/work/artifacts/rm-02-m1/v04-roadmap-gates.log` | local repo | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M1-main-preload-dark-foundation.md`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`
- `apps/work/src/preload/skill-run-api.ts#createSkillRunApi`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts`
- `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts`
- `apps/work/src/main/skill-run/skill-run-service.test.ts`
- `apps/work/src/main/skill-run/skill-run-ipc.test.ts`

## Triggered Read

- If V01 fails: only the failing test file and its existing production owner; then stop for Plan REVISE or RETURN_PRD.
- If the gap needs new Provider schema, Bundle change, or default `skill-first`: RETURN_PRD.
- Otherwise: do not read Renderer Catalog UI, `skill-run-e2e.test.ts` live path, continuation, session materialize, or artifact transfer.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS` | PROD | KEEP | shared skill-run DTO owner | - | unique DTO and IPC channel names remain | Shared Skill Run DTO and Main/Preload ownership | no |
| C02 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir` | PROD | KEEP | consumer-lock owner | - | lock fail-closed remains | Consumer lock and strict Catalog Gateway | no |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | PROD | KEEP | SkillRunGatewayClient | - | discriminator fail-closed remains | Consumer lock and strict Catalog Gateway | no |
| C03 | `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode` | PROD | KEEP | feature-mode store | - | default `expert-compat` remains | Feature-mode default and submission gate | no |
| C03 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | KEEP | SkillRunService | - | pre-request start rejection remains | Feature-mode default and submission gate | no |
| C04 | `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc` | PROD | KEEP | Main IPC owner | - | authenticated narrow IPC remains | Authenticated narrow IPC and Preload bridge | no |
| C04 | `apps/work/src/preload/skill-run-api.ts#createSkillRunApi` | PROD | KEEP | Preload bridge | - | invoke/on wrapper only | Authenticated narrow IPC and Preload bridge | no |
| C05 | `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts` | TEST | KEEP | focused test owner | - | re-runnable lock evidence | Focused M1 regression evidence | no |
| C05 | `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts` | TEST | KEEP | focused test owner | - | re-runnable gateway evidence | Focused M1 regression evidence | no |
| C05 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | KEEP | focused test owner | - | re-runnable service evidence | Focused M1 regression evidence | no |
| C05 | `apps/work/src/main/skill-run/skill-run-ipc.test.ts` | TEST | KEEP | focused test owner | - | re-runnable IPC evidence | Focused M1 regression evidence | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | REUSE_EXISTING | `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS` is the sole cross-process contract | no Renderer-local or second IPC contract |
| C02 | REUSE_EXISTING | `createSkillRunGatewayClient` and `isCompleteSkillRunBundleDir` already fail-closed | no compensating parser or parallel gateway |
| C03 | REUSE_EXISTING | `getSkillRunFeatureMode` and `createSkillRunService.start` already gate before `tools/call` | no new submission owner |
| C04 | REUSE_EXISTING | `registerSkillRunIpc` and `createSkillRunApi` already enforce narrow IPC | no credential or network expansion in Preload |
| C05 | REUSE_EXISTING | four focused suites at baseline cover M1 boundary | no parallel test harness unless a direct regression appears |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | - | - | `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`<br>`apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`<br>`apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`<br>`apps/work/src/preload/skill-run-api.ts#createSkillRunApi`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.test.ts`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts`<br>`apps/work/src/main/skill-run/skill-run-ipc.test.ts` | - | yes |

## Integration Hotspots

None

## Generated Outputs Ledger

None

## Todo T1 — Re-prove M1 dark foundation with focused evidence

**Owns Changes**
- none

**Goal**

Produce V01–V04 evidence that the committed Main/Preload foundation still matches the APPROVED M1 boundary. Do not enable real `tools/call`. Do not add production files, owners, or default `skill-first`.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`
- `apps/work/src/preload/skill-run-api.ts#createSkillRunApi`

**Changes**

- None to production or test sources. Create `apps/work/artifacts/rm-02-m1/` only as Execute evidence output.

**Stop conditions**
- [ ] V01–V04 evidence files exist and match their oracles
- [ ] git diff of KEEP production symbols vs `ac88d25e` is empty
- [ ] no Skill Run production or test file was edited

**Triggered reads**
- If V01 fails: failing test plus its existing owner, then stop
- Otherwise: none

## Verification

Run from repo root unless noted. Capture stdout/stderr to the Evidence Output paths in the Verification Ledger.

```bash
cd apps/work
mkdir -p artifacts/rm-02-m1
npx vitest run src/main/skill-run/skill-run-consumer-lock.test.ts src/main/skill-run/skill-run-gateway-client.test.ts src/main/skill-run/skill-run-service.test.ts src/main/skill-run/skill-run-ipc.test.ts 2>&1 | tee artifacts/rm-02-m1/v01-focused-tests.log
node -e "const fs=require('fs');const p='src/preload/skill-run-api.ts';const s=fs.readFileSync(p,'utf8');const bad=['fetch(','Authorization','accessToken','backendOrigin'];const hit=bad.filter(x=>s.includes(x));if(hit.length){console.error(hit);process.exit(1);}console.log('preload isolation OK');" 2>&1 | tee artifacts/rm-02-m1/v02-preload-isolation.log
cd ../..
git diff --exit-code ac88d25ea93722126a1d3661ac55404ed92e7eef -- apps/work/src/shared/skill-run.ts apps/work/src/main/skill-run/skill-run-consumer-lock.ts apps/work/src/main/skill-run/skill-run-gateway-client.ts apps/work/src/main/skill-run/skill-run-service.ts apps/work/src/main/skill-run/feature-mode-store.ts apps/work/src/main/skill-run/skill-run-ipc.ts apps/work/src/preload/skill-run-api.ts 2>&1 | tee apps/work/artifacts/rm-02-m1/v03-prod-diff.log
node -e "const fs=require('fs');const r=fs.readFileSync('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md','utf8');const m=fs.readFileSync('apps/work/src/main/skill-run/feature-mode-store.ts','utf8');let ok=true;if(r.indexOf('RM-01')<0)ok=false;if(r.indexOf('RM-04')<0)ok=false;if(r.indexOf('BACKLOG')<0)ok=false;if(m.indexOf('expert-compat')<0)ok=false;if(!ok){console.error('roadmap gate check failed');process.exit(1);}console.log('roadmap gates OK');" 2>&1 | tee apps/work/artifacts/rm-02-m1/v04-roadmap-gates.log
```

- AC mapping: V01 covers AC-02–AC-04 and AC-06; V02 covers AC-01; V03 covers AC-05; V04 covers AC-07 and DOD-02–DOD-03.
- Expected: 29 focused tests pass; Preload has no token/network; production KEEP files unchanged; RM-01 remains live-execution gate.
- Negative/regression: missing lock or `capabilityKind` must not proceed to execution; invalid IPC input must not reach Service.
- Do not run `skill-run-e2e` live replay as M1 proof.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all blocking Verification Ledger rows pass | V01,V02,V03,V04 evidence output retained |
| IMPLEMENTED_NOT_PROVEN | evidence collection incomplete | pending verification named |
| BLOCKED | vitest or environment prevents V01 | blocker recorded |
| RETURN_PRD | proof needs new Provider schema, Bundle change, default `skill-first`, or second Skill Run owner | revision request recorded |
