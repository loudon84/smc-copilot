---
name: RM-18 Typecheck Baseline Restoration
overview: Restore apps/work package-wide TypeScript typecheck (node+web) to exit 0 by fixing the frozen 19-file error inventory, without product behavior change, then durable-capture evidence and close Roadmap RM-18.
todos:
  - id: t1-node-typecheck-fixes
    content: "T1 — Node typecheck fixes [C01, C02]"
    status: completed
  - id: t2-web-typecheck-fixes
    content: "T2 — Web typecheck fixes [C03]"
    status: completed
  - id: t3-durable-captures-evidence
    content: "T3 — Durable captures + evidence [C04.1]"
    status: completed
  - id: t4-roadmap-rm-18-done
    content: "T4 — Roadmap RM-18 DONE [C04.2]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: RM-18
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.10/RM-18/typecheck-baseline-2026-09-10
grounded_commit: a23c342803f580baceff88ebee9e15513e209bc3
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# RM-18 Typecheck Baseline Restoration Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-typecheck-baseline-restoration.md)

## Scope

- In: minimal type/dead-code fixes on the PRD frozen 19-file inventory so `npm --prefix apps/work run typecheck` (`typecheck:node` && `typecheck:web`) exits 0; focused vitest on every touched `*.test.ts` / `*.test.tsx`; durable baseline captures under `docs_agent/evidence/`; delivery-owned Evidence Manifest; separate Phase 9 Roadmap status commit closing RM-18.
- Out: new product capability; Provider Bundle; Managed Hermes deletion-surface reopen; weakening `compilerOptions` check flags; Skill Registry v4.1.1; rewriting historical runs; Roadmap DONE inside the implementation commit. Durable Evidence Manifest `docs_agent/evidence/RM-18-evidence.json` is delivery `owned_control` only — never a Change Matrix planned file.
- Production Owner inherited from PRD: each of the 19 files keeps its existing Owner; no new Owner is introduced.
- Grounding boundary: Approved PRD at `a23c342803f580baceff88ebee9e15513e209bc3`. Error inventory is the PRD frozen 19-file set (node 13 / web 6). Plan-stage FRESH typecheck captures confirm counts before implementation commit.
- Todo completion convention: T1 closes node errors (C01 unused hermes leftovers + C02 Expert/Skill/File type drift). T2 closes web/renderer errors (C03) with in-place SkillRunStatusBar.test repair (no exclude-only). T3 authors durable baseline txt captures (C04.1) and orchestrates delivery evidence (Generated Outputs). T4 owns Phase 9 Roadmap DONE (C04.2). C04 is refined into C04.1/C04.2 so each Change ID has a single Todo WRITE_OWNER.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/dashboard.ts#getManagedDashboard` | `typecheck:node` TS6133 unused `getManagedDashboard` / `waitForDashboardReady` | local helpers remain after Managed Hermes spawn removal | remote dashboard paths KEEP | REMOVE unused symbols only; do not reopen Gateway/dashboard spawn | PASS |
| C01 | `apps/work/src/main/hermes-agent-compat.ts#ensureLocalDashboardCompatibility` | TS6133 unused `readFileSync` import in compat module that still exports `ensureLocalDashboardCompatibility` | `ensureLocalDashboardCompatibility` remains the KEEP entry | hermes/dashboard callers | delete unused import only | PASS |
| C01 | `apps/work/src/main/hermes.ts#waitForApiServerReady` | many TS6133/TS6192 unused imports and dead local helpers after supervisor removal | `waitForApiServerReady`, gateway restart helpers, unused secret/models imports | chat/runtime KEEP paths must compile | unused-symbol deletion only; no Managed Hermes behavior reopen | PASS |
| C02 | `apps/work/src/main/expert/expert-gateway-client.ts#joinUrl` | unused imports TS6133 plus unused local `joinUrl` | `joinUrl` / transport imports unused after Expert client reshape | expert-run-service | drop unused imports/helpers; keep client API | PASS |
| C02 | `apps/work/src/main/expert/expert-session-materialize.ts` | TS2345 better-sqlite3 `Database` vs narrow `prepare().get` structural type | materialize helper prepare/get | expert session open | widen helper param or adapt Statement typing at existing owner | PASS |
| C02 | `apps/work/src/main/files/skill-run-artifact-transfer.ts` | TS2345 `"FILE_PERMISSION_DENIED"` not in `FileErrorCode` | File error mapping | file-service / upsert path | use allowed FileErrorCode or extend enum at File owner only if required for compile | PASS |
| C02 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts` | TS2561 `profileId` not on `file:created` event type | event literal at upsert | skill-run artifact IPC | remove illicit field or align to current event contract | PASS |
| C02 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.test.ts` | TS2739 Gateway mock missing approval/attachment methods | test mock of `SkillRunGatewayClient` | focused vitest | extend mock with required methods | PASS |
| C02 | `apps/work/src/main/remote-sessions.ts` | TS2366 function lacks ending return | remote session list/branch | remote IPC | add exhaustive return/undefined | PASS |
| C02 | `apps/work/src/main/session-continuation-store.ts` | TS2322 `SkillRunContinuationItem` assignable to `never` | continuation push into narrowed array | skill-run continuation | fix discriminated array typing | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-contract-parser.test.ts` | TS2300 duplicate `existsSync`/`readFileSync`/`join` imports | test harness imports | vitest | dedupe imports | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TS2322 vitest `Mock` vs approval decision fn type | service test mock | focused vitest | type mock as concrete fn | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts` | same TS2345 Database prepare typing as expert materialize | skill-run materialize | skill-run session open | same owner-local typing fix | PASS |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx` | web project TS2307/TS2591 Node `fs`/`path`/`process` | renderer test incorrectly imports Node APIs | SkillRunStatusBar UI | **in-place** remove/mock Node usage; must not exclude-only from web project | PASS |
| C03 | `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx` | TS2322 Promise shape missing `AttachmentError` fields | attachment error mapping | Chat send UI | align returned errors to `AttachmentError` | PASS |
| C03 | `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts` | TS2322 `ChatBubbleMessage` to `never` | history reducer/array narrowing | Chat history | fix message union accumulation typing | PASS |
| C03 | `apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts` | TS2353 `invocationMode` not on Pick callability | restore fixture | focused vitest | drop illicit field / match catalog Pick | PASS |
| C03 | `apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx` | TS2322 Mock vs `() => void` handlers | screen test props | focused vitest | type mocks as void fns | PASS |
| C03 | `apps/work/src/shared/i18n/source-locale-authoring.test.ts` | TS2307/TS2591 `node:child_process` / `process` under web types | shared test in web project | i18n authoring guard | in-place mock or type-safe Node access without weakening tsconfig | PASS |
| C04.1 | `docs_agent/evidence/RM-18-typecheck-node-baseline.txt` | path absent; PRD requires durable capture | evidence dir not gitignored for manifests/captures | V01/V08/Roadmap consumers | ADD capture after green typecheck:node | PASS |
| C04.1 | `docs_agent/evidence/RM-18-typecheck-web-baseline.txt` | path absent | same | V02/V08 | ADD capture after green typecheck:web | PASS |
| C04.2 | `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` | RM-18 row `IN_PRD`; Plan/Commit/Evidence `-` | roadmap columns + `validate_roadmap_v11.py` | Phase 9 status commit | MODIFY RM-18 → DONE with Plan + impl commit + `smc-evidence:RM-18@sha256:<scope-fingerprint>` | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | npm --prefix apps/work run typecheck:node 退出 0。 | BEHAVIOR | C01, C02 | T1 | V01 | UNIT | yes |
| AC-02 | AC | npm --prefix apps/work run typecheck:web 退出 0。 | BEHAVIOR | C03 | T2 | V02 | UNIT | yes |
| AC-03 | AC | npm --prefix apps/work run typecheck 退出 0。 | BEHAVIOR | C01, C02, C03 | T1, T2 | V03 | UNIT | yes |
| AC-04 | AC | npm --prefix apps/work run guard 退出 0。 | BEHAVIOR | C01, C02, C03 | T1, T2 | V04 | UNIT | yes |
| AC-05 | AC | lat check（cwd apps/work）退出 0。 | BEHAVIOR | C01, C02, C03 | T1, T2 | V05 | DOCUMENT_SEMANTIC | yes |
| AC-06 | AC | 不放宽 tsconfig 严格性。tsconfig.json diff 仅限 include/exclude/types；compilerOptions 不得新增关闭检查类标志（strict、noUnused、noImplicit 等）。任何文件被移出某 tsc project 的 include，必须仍被另一 project 覆盖；src/renderer/ 测试因 node 工程不覆盖，须原地修复，不得仅以 exclude 消除错误。 | SCOPE | C01, C02, C03 | T1, T2 | V06 | DIFF_SCOPE | yes |
| AC-07 | AC | 所有被本 Item 修改的 .test.ts / .test.tsx 经 focused vitest run <those files> PASS。 | BEHAVIOR | C02, C03 | T1, T2 | V07 | UNIT | yes |
| AC-08 | AC | 无产品行为变更（无新 IPC/UI/Runtime ownership）；Impl commit 不含 Roadmap DONE。 | SCOPE | C01, C02, C03, C04.1 | T1, T2, T3 | V08 | DIFF_SCOPE | yes |
| AC-09 | AC | Status commit 将 RM-18 DONE，Evidence=smc-evidence:RM-18@sha256:<scope-fingerprint>。 | OPERATIONS | C04.2 | T4 | V08 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | AC-01–AC-09 FRESH PASS。 | EVIDENCE | C01, C02, C03, C04.1, C04.2 | T1, T2, T3, T4 | V01, V02, V03, V04, V05, V06, V07, V08 | DIFF_SCOPE | yes |
| DOD-02 | DOD | 独立 canonical Plan；commitpolicy: postreview。 | SCOPE | C01, C02, C03, C04.1, C04.2 | T1, T2, T3, T4 | V08 | DIFF_SCOPE | yes |
| DOD-03 | DOD | Impl/status commit 分离。 | OPERATIONS | C04.1, C04.2 | T3, T4 | V08 | DIFF_SCOPE | yes |

## Lifecycle Closure Matrix

No requirement is LIFECYCLE-classified; RM-18 restores compile gates only and does not change runtime state machines.

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Typecheck gate restoration | AC-01, AC-02, AC-03, AC-06 | `tsc --noEmit` via apps/work package scripts | tsconfig.node.json / tsconfig.web.json compile graph | Delivery Verification + durable baseline captures | exit 0; no weakened compilerOptions | apps/work build owner | residual TS errors keep V01–V03 FAIL; exclude-only renderer fix fails V06 | one FRESH run per Verification ID per scope fingerprint | V01, V02, V03, V06 |
| Governed evidence + Roadmap close | AC-08, AC-09, DOD-01, DOD-02, DOD-03 | blocking Verifications + delivery gates | `.smc/evidence/RM-18/ledger.jsonl`; manifest `smc.evidence.manifest.v3` | durable Evidence Manifest; commit guard; Roadmap status commit | plan_id RM-18; scope/ambient fingerprints; V01–V08 FRESH PASS | smc-plan-delivery evidence layer | any blocking FAIL/STALE blocks IMPLEMENTED_AND_PROVEN; Roadmap DONE only after impl commit | verification IDs V01–V08; one manifest per scope fingerprint | V08 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | typecheck:node exits 0 | yes | PRD baseline FAIL ~35 node errors on frozen inventory | FAIL | NEW_EVIDENCE | - | V01 |
| CLM-02 | AC-02 | typecheck:web exits 0 | yes | PRD baseline FAIL ~15 web errors on frozen inventory | FAIL | NEW_EVIDENCE | - | V02 |
| CLM-03 | AC-03 | package-wide typecheck exits 0 | yes | combined typecheck FAIL | FAIL | NEW_EVIDENCE | - | V03 |
| CLM-04 | AC-04 | guard exits 0 | yes | recent PASS under prior items | PASS | NEW_EVIDENCE | - | V04 |
| CLM-05 | AC-05 | lat check (cwd apps/work) exits 0 | yes | recent PASS under prior items | PASS | NEW_EVIDENCE | - | V05 |
| CLM-06 | AC-06 | tsconfig policy held; no compilerOptions weaken; renderer tests fixed in place | yes | N/A at PRD | NOT_TESTED | NEW_EVIDENCE | - | V06 |
| CLM-07 | AC-07 | all touched *.test.ts / *.test.tsx focused vitest PASS | yes | N/A at PRD | NOT_TESTED | NEW_EVIDENCE | - | V07 |
| CLM-08 | AC-08 | no new IPC/UI/Runtime ownership; impl commit excludes Roadmap DONE | yes | N/A at PRD | NOT_TESTED | NEW_EVIDENCE | - | V08 |
| CLM-09 | AC-09 | RM-18 DONE with smc-evidence:RM-18@sha256:<scope-fingerprint> | yes | Roadmap RM-18 IN_PRD | READY | NEW_EVIDENCE | - | V08 |
| CLM-10 | DOD-01 | AC-01–AC-09 all FRESH PASS under current scope fingerprint | yes | no RM-18 evidence ledger | NOT_TESTED | NEW_EVIDENCE | - | V01, V02, V03, V04, V05, V06, V07, V08 |
| CLM-11 | DOD-02 | this single canonical Plan with commit_policy post_review | yes | Plan authored for RM-18 only | NOT_TESTED | NEW_EVIDENCE | - | V08 |
| CLM-12 | DOD-03 | implementation commit and Roadmap status commit are separate | yes | no prior RM-18 commits | NOT_TESTED | NEW_EVIDENCE | - | V08 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|
| ENV-01 | - | - | - | LOCAL_WORKTREE | - |

## Verification Ledger

All Verifications are LOCAL-only on ENV-01. No LIVE / FAULT_INJECTION / EXTERNAL mode.

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01, CLM-10 | STATIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run typecheck:node', shell=True))"` | exit 0; no TS errors in node project | residual unused/type errors on C01/C02 files fail | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V02 | CLM-02, CLM-10 | STATIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run typecheck:web', shell=True))"` | exit 0; no TS errors in web project | SkillRunStatusBar Node-in-web or Chat typing residuals fail | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V03 | CLM-03, CLM-10 | STATIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run typecheck', shell=True))"` | exit 0 for combined node+web | either project non-zero fails | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V04 | CLM-04, CLM-10 | STATIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run guard', shell=True))"` | guard exits 0 | boundary/i18n/runtime guard regressions fail | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V05 | CLM-05, CLM-10 | DOCUMENT_SEMANTIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('lat check', cwd='apps/work', shell=True))"` | lat check exits 0 | stale LAT refs fail | REPO_SUMMARY | ENV-01 | NEW_EVIDENCE | yes |
| V06 | CLM-06, CLM-10 | STATIC | LOCAL | `python -c "import subprocess,sys; from pathlib import Path; files=['apps/work/tsconfig.json','apps/work/tsconfig.node.json','apps/work/tsconfig.web.json','apps/work/tsconfig.web.main-tests.json']; flags=('strict','noUnused','noImplicit'); diffs=[subprocess.check_output(['git','diff','HEAD','--',f], text=True, errors='replace') for f in files if Path(f).is_file()]; bad=any(line.startswith('+') and not line.startswith('+++') and any(f in line for f in flags) and (': false' in line or ':false' in line) for diff in diffs for line in diff.splitlines()); ok_file=Path('apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx').is_file(); sys.exit(1 if bad or not ok_file else 0)"` | no compilerOptions check-flag weaken vs HEAD; SkillRunStatusBar.test remains an in-place file (not deleted to dodge web tsc) | exclude-only or strict/noUnused/noImplicit false additions fail | REPO_SUMMARY | ENV-01 | NEW_EVIDENCE | yes |
| V07 | CLM-07, CLM-10 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/files/upsert-skill-run-remote-artifact.test.ts src/main/skill-run/skill-run-contract-parser.test.ts src/main/skill-run/skill-run-service.test.ts src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx src/renderer/src/screens/Chat/ChatInput.test.tsx src/renderer/src/screens/Chat/skillSelectionRestore.test.ts src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx src/shared/i18n/source-locale-authoring.test.ts --pool=threads --maxWorkers=1', shell=True))"` | all listed touched tests PASS | any touched-test failure fails | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V08 | CLM-08, CLM-09, CLM-10, CLM-11, CLM-12 | STATIC | LOCAL | `python -c "import subprocess,sys; from pathlib import Path; plan='.cursor/plans/work-v4.0.1-typecheck-baseline-restoration.plan.md'; node_cap=Path('docs_agent/evidence/RM-18-typecheck-node-baseline.txt'); web_cap=Path('docs_agent/evidence/RM-18-typecheck-web-baseline.txt'); ok=node_cap.is_file() and web_cap.is_file() and node_cap.stat().st_size>0 and web_cap.stat().st_size>0; ok=ok and subprocess.call([sys.executable,'.agents/skills/smc-plan-delivery/scripts/completion_audit.py','check','--plan',plan])==0; ok=ok and subprocess.call([sys.executable,'.agents/skills/smc-plan-delivery/scripts/review_record.py','check','--plan',plan,'--kind','implementation'])==0; fm=Path(plan).read_text(encoding='utf-8'); ok=ok and 'plan_id: RM-18' in fm and 'commit_policy: post_review' in fm; roadmap=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); ok=ok and any(line.lstrip().startswith('RM-18 ') or ' RM-18 ' in line for line in roadmap.splitlines()); sys.exit(0 if ok else 1)"` | durable baseline captures present; completion audit FRESH_PASS; implementation review FRESH_PASS; Plan identity RM-18 + post_review; RM-18 roadmap row exists for status close | missing captures/audit/review or Plan identity drift fails | REPO_SUMMARY | ENV-01 | NEW_EVIDENCE | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-typecheck-baseline-restoration.md`
- `apps/work/src/main/hermes.ts#waitForApiServerReady`
- `apps/work/src/main/dashboard.ts#getManagedDashboard`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx`
- `apps/work/tsconfig.node.json`
- `apps/work/tsconfig.web.json`

## Triggered Read

- If C01 unused deletion breaks a still-reachable call site: read only that call site in the same owner file; do not reopen Managed Hermes spawn/supervisor.
- If FileErrorCode / event-type mismatch needs an enum or shared type edit: read only the existing File/Skill-Run type owner file required for compile; stop with RETURN_PRD if a new Owner would be required.
- If SkillRunStatusBar.test cannot drop Node APIs without changing production StatusBar behavior: stop with RETURN_PRD (exclude-only is forbidden).
- Otherwise: do not read Provider Bundles, archived PRDs, build outputs, runtime data, or `apps/desktop`.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/dashboard.ts#getManagedDashboard` | PROD | MODIFY | dashboard.ts | T1 | unused dashboard helpers removed; remote paths unchanged | Main unused / hermes leftovers | no |
| C01 | `apps/work/src/main/hermes-agent-compat.ts#ensureLocalDashboardCompatibility` | PROD | MODIFY | hermes-agent-compat.ts | T1 | unused import removed | Main unused / hermes leftovers | no |
| C01 | `apps/work/src/main/hermes.ts#waitForApiServerReady` | PROD | MODIFY | hermes.ts | T1 | unused imports/dead helpers removed; no supervisor reopen | Main unused / hermes leftovers | no |
| C02 | `apps/work/src/main/expert/expert-gateway-client.ts#joinUrl` | PROD | MODIFY | expert-gateway-client | T1 | unused imports/helpers removed | Expert / Skill Run / File type drift | no |
| C02 | `apps/work/src/main/expert/expert-session-materialize.ts` | PROD | MODIFY | expert-session-materialize | T1 | Database prepare typing compiles | Expert / Skill Run / File type drift | no |
| C02 | `apps/work/src/main/files/skill-run-artifact-transfer.ts` | PROD | MODIFY | skill-run-artifact-transfer | T1 | FileErrorCode usage valid | Expert / Skill Run / File type drift | no |
| C02 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts` | PROD | MODIFY | upsert-skill-run-remote-artifact | T1 | file:created event matches contract | Expert / Skill Run / File type drift | no |
| C02 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.test.ts` | TEST | MODIFY | upsert-skill-run-remote-artifact tests | T1 | Gateway mock complete for SkillRunGatewayClient | Expert / Skill Run / File type drift | no |
| C02 | `apps/work/src/main/remote-sessions.ts` | PROD | MODIFY | remote-sessions | T1 | all code paths return | Expert / Skill Run / File type drift | no |
| C02 | `apps/work/src/main/session-continuation-store.ts` | PROD | MODIFY | session-continuation-store | T1 | continuation item typing no longer `never` | Expert / Skill Run / File type drift | no |
| C02 | `apps/work/src/main/skill-run/skill-run-contract-parser.test.ts` | TEST | MODIFY | skill-run-contract-parser tests | T1 | duplicate imports removed | Expert / Skill Run / File type drift | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | skill-run-service tests | T1 | approval mock types align | Expert / Skill Run / File type drift | no |
| C02 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts` | PROD | MODIFY | skill-run-session-materialize | T1 | Database prepare typing compiles | Expert / Skill Run / File type drift | no |
| C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx` | TEST | MODIFY | SkillRunStatusBar tests | T2 | no Node fs/path/process dependency under web tsc | Renderer / shared test typing | no |
| C03 | `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx` | PROD | MODIFY | ChatInput | T2 | AttachmentError-shaped failures | Renderer / shared test typing | no |
| C03 | `apps/work/src/renderer/src/screens/Chat/ChatInput.test.tsx` | TEST | MODIFY | ChatInput tests | T2 | skill-mode addFiles expectation matches AttachmentError (`code`/`filename`/`detail`) | Renderer / shared test typing | no |
| C03 | `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts` | PROD | MODIFY | sessionHistory | T2 | bubble message union accumulates without `never` | Renderer / shared test typing | no |
| C03 | `apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts` | TEST | MODIFY | skillSelectionRestore tests | T2 | fixture matches callability Pick | Renderer / shared test typing | no |
| C03 | `apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx` | TEST | MODIFY | ConnectionErrorScreen tests | T2 | mocks typed as void handlers | Renderer / shared test typing | no |
| C03 | `apps/work/src/shared/i18n/source-locale-authoring.test.ts` | TEST | MODIFY | source-locale-authoring tests | T2 | compiles under web types without tsconfig weaken | Renderer / shared test typing | no |
| C04.1 | `docs_agent/evidence/RM-18-typecheck-node-baseline.txt` | DOC | ADD | SMC Delivery evidence | T3 | durable PASS capture of typecheck:node | Evidence + Roadmap DONE | yes |
| C04.1 | `docs_agent/evidence/RM-18-typecheck-web-baseline.txt` | DOC | ADD | SMC Delivery evidence | T3 | durable PASS capture of typecheck:web | Evidence + Roadmap DONE | yes |
| C04.2 | `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` | DOC | MODIFY | Skill-First Roadmap | T4 | RM-18 DONE with Plan + impl commit + smc-evidence ref | Evidence + Roadmap DONE | no |

## Domain Activation Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C04.1 | `docs_agent/evidence/RM-18-typecheck-node-baseline.txt` | PRD Evidence Baseline requires a durable node typecheck capture in the implementation commit | evidence-only; no production Owner |
| C04.1 | `docs_agent/evidence/RM-18-typecheck-web-baseline.txt` | PRD Evidence Baseline requires a durable web typecheck capture in the implementation commit | evidence-only; no production Owner |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | REMOVE_ONLY | Managed Hermes left unused symbols; TS6133/TS6192 on dashboard/hermes/compat | delete unused symbols/imports only; no behavior reopen |
| C02 | MODIFY_EXISTING | Expert/File/Skill Run type drift and incomplete mocks after prior slices | fix typing/mocks at existing owners; no new modules |
| C03 | MODIFY_EXISTING | web project lacks Node types; Chat fixtures drifted; renderer tests imported Node APIs | in-place type/fixture fixes; forbid exclude-only |
| C04.1 | MINIMAL_NEW | PRD mandates durable baseline txt captures | two small capture files beside existing evidence artifacts |
| C04.2 | MODIFY_EXISTING | Roadmap already has RM-18 row; smc-roadmap owns status commits | one row update via existing tooling |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01<br>C02 | `apps/work/src/main/dashboard.ts#getManagedDashboard`<br>`apps/work/src/main/hermes-agent-compat.ts#ensureLocalDashboardCompatibility`<br>`apps/work/src/main/hermes.ts#waitForApiServerReady`<br>`apps/work/src/main/expert/expert-gateway-client.ts#joinUrl`<br>`apps/work/src/main/expert/expert-session-materialize.ts`<br>`apps/work/src/main/files/skill-run-artifact-transfer.ts`<br>`apps/work/src/main/files/upsert-skill-run-remote-artifact.ts`<br>`apps/work/src/main/files/upsert-skill-run-remote-artifact.test.ts`<br>`apps/work/src/main/remote-sessions.ts`<br>`apps/work/src/main/session-continuation-store.ts`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.test.ts`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts`<br>`apps/work/src/main/skill-run/skill-run-session-materialize.ts` | `apps/work/tsconfig.node.json` | - | no |
| T2 | C03 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx`<br>`apps/work/src/renderer/src/screens/Chat/ChatInput.tsx`<br>`apps/work/src/renderer/src/screens/Chat/ChatInput.test.tsx`<br>`apps/work/src/renderer/src/screens/Chat/sessionHistory.ts`<br>`apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts`<br>`apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx`<br>`apps/work/src/shared/i18n/source-locale-authoring.test.ts` | `apps/work/tsconfig.web.json`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx` | T1 | no |
| T3 | C04.1 | `docs_agent/evidence/RM-18-typecheck-node-baseline.txt`<br>`docs_agent/evidence/RM-18-typecheck-web-baseline.txt` | `docs_agent/evidence/RM-17-evidence.json` | T2 | no |
| T4 | C04.2 | `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` | `docs_agent/evidence/RM-18-evidence.json`<br>`docs_agent/evidence/RM-18-typecheck-node-baseline.txt`<br>`docs_agent/evidence/RM-18-typecheck-web-baseline.txt` | T3 | no |

## Integration Hotspots

None

## Generated Outputs Ledger

| Output | Producer Todo | Kind | Consumers |
|---|---|---|---|
| `docs_agent/evidence/RM-18-evidence.json` | T3 | GENERATED_ENTRYPOINT | `commit_guard.py`, `validate_delivery_completion.py`, Roadmap RM-18 evidence reference; delivery `owned_control` only (never Change Matrix planned) |

## Todo T1 — Node typecheck fixes

**Owns Changes**
- C01
- C02

**Goal**

Make `npm --prefix apps/work run typecheck:node` exit 0 by deleting Managed Hermes unused leftovers and fixing Expert/Skill Run/File typing drift on the frozen node inventory.

**Immediate anchors**
- `apps/work/src/main/hermes.ts#waitForApiServerReady`
- `apps/work/src/main/dashboard.ts#getManagedDashboard`
- `apps/work/src/main/session-continuation-store.ts`
- `apps/work/src/main/files/skill-run-artifact-transfer.ts`

**Changes**
- C01: remove unused symbols/imports in `dashboard.ts`, `hermes-agent-compat.ts`, and `hermes.ts` only; do not restore Gateway spawn, TUI, or Python runtime paths.
- C02: repair Expert/File/Skill Run compile errors (Database prepare typing, FileErrorCode, file:created fields, remote-sessions returns, continuation `never`, gateway/service test mocks, duplicate test imports).
- Do not edit `tsconfig*.json` compilerOptions check flags; do not touch renderer/web files.

**Stop conditions**
- [ ] `npm --prefix apps/work run typecheck:node` exits 0.
- [ ] Focused vitest on touched node tests PASS.
- [ ] No new IPC/UI/Runtime ownership symbols introduced.

**Triggered reads**
- If deleting an unused hermes helper is referenced: read only that call site and keep a minimal stub only if still required for compile of a KEEP path; otherwise STOP and escalate.
- If FileErrorCode requires shared-type expansion: read only the existing FileErrorCode owner; RETURN_PRD if a new Owner appears necessary.

## Todo T2 — Web typecheck fixes

**Owns Changes**
- C03

**Goal**

Make `npm --prefix apps/work run typecheck:web` exit 0 by fixing renderer/shared typing and repairing Node-in-web tests in place.

**Immediate anchors**
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx`
- `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx`
- `apps/work/src/renderer/src/screens/Chat/sessionHistory.ts`
- `apps/work/tsconfig.web.json`

**Changes**
- Fix `SkillRunStatusBar.test.tsx` and `source-locale-authoring.test.ts` so they compile under the web project without relying on Node typings; prefer mocks/fixtures over Node APIs.
- Fix `ChatInput.tsx` AttachmentError typing and companion `ChatInput.test.tsx` skill-mode `addFiles` expectation (`code`/`filename`/`detail`).
- Fix `sessionHistory.ts` `never` accumulation.
- Fix `skillSelectionRestore.test.ts` and `ConnectionErrorScreen.test.tsx` fixture/mock typing.
- Forbidden: exclude-only removal of these tests from the web project to silence errors; forbidden: weakening compilerOptions.

**Stop conditions**
- [ ] `npm --prefix apps/work run typecheck:web` exits 0.
- [ ] `npm --prefix apps/work run typecheck` exits 0.
- [ ] Focused vitest on touched web tests PASS.

**Triggered reads**
- If StatusBar production component must change for the test to compile: limit to type-only surface; behavior change ⇒ RETURN_PRD.
- If tsconfig include/exclude edit appears required for coverage: read both node and web tsconfigs and prove every moved file remains covered; compilerOptions weaken ⇒ hard fail.

## Todo T3 — Durable captures + evidence

**Owns Changes**
- C04.1

**Goal**

Persist durable typecheck baseline captures and produce the delivery-owned Evidence Manifest after Verification FRESH PASS (manifest is Generated Outputs / owned_control, not a Matrix write).

**Immediate anchors**
- `docs_agent/evidence/RM-18-typecheck-node-baseline.txt`
- `docs_agent/evidence/RM-18-typecheck-web-baseline.txt`
- `docs_agent/evidence/RM-17-evidence.json`

**Changes**
- After V01/V02 green: write `docs_agent/evidence/RM-18-typecheck-node-baseline.txt` and `docs_agent/evidence/RM-18-typecheck-web-baseline.txt` with command, timestamp, exit code, and concise PASS summary (PRD durable capture requirement).
- Delivery-orchestrated (Phases 6–7): run V01–V08 via `evidence.py` with NEW_EVIDENCE; after Completion Audit + Implementation Review FRESH_PASS, generate `docs_agent/evidence/RM-18-evidence.json` via `evidence.py manifest` only.
- Never hand-author the Evidence Manifest; never list it in Change Matrix planned_files; never include Roadmap DONE in the implementation commit.

**Stop conditions**
- [ ] Both baseline capture files exist and are non-empty.
- [ ] V01–V08 FRESH PASS and durable manifest validates as `smc.evidence.manifest.v3`.
- [ ] `validate_delivery_completion.py` reports DELIVERY_READY_TO_COMMIT.
- [ ] Implementation commit candidates exclude Roadmap DONE.

**Triggered reads**
- If evidence freshness fails due to scope drift: inspect workspace fingerprint only; do not expand write set.
- Closure JSON is not required for this Plan; do not invent extra governance artifacts beyond the two captures + owned_control manifest.

## Todo T4 — Roadmap RM-18 DONE

**Owns Changes**
- C04.2

**Goal**

Close Roadmap RM-18 in a separate status commit that references the real implementation commit and `smc-evidence:RM-18@sha256:<scope-fingerprint>`.

**Immediate anchors**
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
- `docs_agent/evidence/RM-18-evidence.json`

**Changes**
- Delivery-orchestrated (Phase 9, after implementation commit): set RM-18 to DONE with Plan `.cursor/plans/work-v4.0.1-typecheck-baseline-restoration.plan.md`, Implementation Commit = RM-18 impl SHA, Verification Evidence = `smc-evidence:RM-18@sha256:<scope-fingerprint>` from the durable manifest.
- Validate with `validate_roadmap_v11.py` / `validate_roadmap.py` before the status commit.
- Status commit contains only the roadmap file; do not mark unrelated items DONE.

**Stop conditions**
- [ ] Roadmap validator PASS with RM-18 DONE and parseable Plan/Commit/Evidence refs.
- [ ] Evidence reference uses `smc-evidence:RM-18@sha256:<scope-fingerprint>`.
- [ ] Status commit is separate from the implementation commit.

**Triggered reads**
- If roadmap validator rejects the evidence ref: verify manifest exists inside the implementation commit and plan_id is `RM-18`; do not alter the validator.

## Verification

Run all blocking Verification Ledger entries (V01–V08) through `smc-plan-delivery/scripts/evidence.py` on ENV-01 LOCAL_WORKTREE only. No LIVE scenarios. Capture durable node/web baselines as C04.1 DOC artifacts after green typecheck; Evidence Manifest remains delivery owned_control Generated Output.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; V01, V02, V03, V04, V05, V06, V07, V08 FRESH PASS; CLM-01–CLM-12 PASS; durable Evidence Manifest FRESH; baseline captures present | V01, V02, V03, V04, V05, V06, V07, V08 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | code/captures exist but one or more Todo, audit, review, verification, claim, or manifest states are pending/stale | pending/stale Todo, V01–V08, CLM-01–CLM-12, audit/review/manifest ids |
| BLOCKED | environment/tooling prevents proof after in-scope retries (for example local tsc/tooling crash) | blocker record with command, owner, and non-secret diagnostic |
| RETURN_PRD | fix requires new Owner, product behavior change, Managed Hermes deletion-surface reopen, or compilerOptions weaken | mismatch record against Approved PRD scope |
