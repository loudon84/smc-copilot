---
name: RM-17 M6j Evidence Closure
overview: Close the governance evidence chain for the already-committed RM-16/M6j implementation (09efa7ac) from the current committed baseline — fresh completion audit, independent implementation review, Plan-bound verification of the parent V01-V09 blocking set minus package-wide typecheck, durable Evidence Manifest, and a separate Roadmap status commit — without modifying production code or rewriting the blocked historical RM-16 run.
todos:
  - id: t1-closure-baseline-record
    content: "T1 — Closure baseline record [C01]"
    status: completed
  - id: t2-durable-evidence-manifest
    content: "T2 — Durable evidence manifest"
    status: completed
  - id: t3-rm-16-roadmap-status
    content: "T3 — RM-16 Roadmap status [C03]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: RM-17
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-17/evidence-closure-2026-09-09
grounded_commit: a426e44e5990583e8701e0f98d9a5d31ccd9d09e
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# RM-17 M6j Evidence Closure Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6j-evidence-closure.md)

## Scope

- In: author the RM-17 closure record (`docs_agent/evidence/RM-17-closure.json`) attesting the frozen baseline, the preserved blocked RM-16 run, the parent V01–V09 verification mapping, and the package-wide typecheck baseline record; fresh Plan-bound execution of the parent blocking verification set V01–V07/V09 plus a governance closure check V10; delivery-gated Completion Audit, independent Implementation Review, and tooling-generated durable Evidence Manifest (`docs_agent/evidence/RM-17-evidence.json`); separate Phase 9 Roadmap status commit closing RM-16 then RM-17.
- Out: any production code, contract, Provider Bundle, or further `apps/work`/`contracts`/`packages` content change inside this Plan write set; package-wide `npm --prefix apps/work run typecheck` as blocking evidence (recorded instead as independent baseline restoration input); Managed Hermes Runtime Ownership Closure; deletion, rewrite, or re-freeze of the blocked `.smc/runs/RM-16*` history; Roadmap DONE inside the implementation commit. Authorized external exception (not owned by this Plan): commits `6c0ee294` + `55a595c6` only touch `SessionFilesPanel.test.tsx` (jsdom pragma + `afterEach(cleanup)`) so V06 can run under Vitest; V10 attests that this is the sole apps/work/contracts/packages delta from `09efa7ac`. Durable Evidence Manifest is delivery `owned_control` only — never a Change Matrix planned file — because generating the manifest must not stale the proof it summarizes (evidence contract).
- Production Owner inherited from PRD: none added. SMC Delivery/Roadmap owns only governance evidence and status closure; existing Chat, Main Skill Run, Gateway, Service, Session/File owners are unchanged.
- Grounding boundary: source behavior is grounded at committed baseline `a426e44e5990583e8701e0f98d9a5d31ccd9d09e` (RM-17 PRD approval commit). The RM-16 implementation under proof is commit `09efa7ac5a539975896b7e9c41cc7397101f36f5`; the approved parent PRD/plan governance baseline is `91b8560b`. Untracked pre-existing files (legacy PRD drafts, M6g review records, reports) and the modified `infra/windows/hermes-agent/installer/install.log` are ambient state, excluded from write ownership and required to stay byte-stable.
- Todo completion convention: T1 authors the only hand-written Plan-owned artifact (the closure record) during the implementation phase. T2 orchestrates delivery-owned_control Evidence Manifest generation (Phases 6–7) without a Change Matrix write; T3 owns the Phase 9 Roadmap status commit. Cursor completion is recorded at implementation-phase end and stop conditions are enforced by the Completion Gate.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `docs_agent/evidence/RM-17-closure.json` | path does not exist; `docs_agent/evidence/` holds only tooling-generated `RM-*-evidence.json` manifests | committable evidence directory confirmed not gitignored; `.smc/` confirmed gitignored | `workspace.py` treats `docs_agent/evidence/` as dirty-excluded but snapshots planned files; `commit_guard.py` requires all scope-changed files in the implementation commit | no existing closure-record artifact; manifest schema is tooling-owned and cannot carry baseline attestations | PASS |
| C01 | `.smc/runs/RM-16.json` | state `IMPLEMENTATION_BLOCKED`, block reason "V06 and V08 cannot pass within RM-16 write scope", base_commit `cb562e91` | run record schema `smc.delivery.run.v2` resolves | RM-17 PRD AC-01/DOD-05 require preservation; old run is gitignored history, never committed | record state + sha256 in closure record instead of modifying the run | PASS |
| C01 | durable Evidence Manifest path | path does not exist at baseline; delivery auto-owns `docs_agent/evidence/RM-17-evidence.json` as `owned_control` | `evidence.py build_manifest` emits schema `smc.evidence.manifest.v3` bound to scope/ambient fingerprints after audit + reviews + blocking verifications are FRESH_PASS | evidence contract: generating the manifest must not enter implementation scope / stale the proof; `validate_delivery_completion.py` and `commit_guard.py` still require the manifest | reuse the delivery evidence layer exactly as RM-04…RM-15 did; keep the path out of Change Matrix planned_files | PASS |
| C03 | `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` | v2.8 ACTIVE; RM-16 row `IN_PRD` with Plan/Commit/Evidence `-`; RM-17 row `IN_PRD` with PRD set, Plan/Commit/Evidence `-` | roadmap table columns resolve; `validate_roadmap.py` v1.1 passes at HEAD | RM-16 DONE requires parent Plan + commit `09efa7ac` + `external-artifact:docs_agent/evidence/RM-17-evidence.json`; RM-17 DONE requires this Plan + RM-17 implementation commit + `smc-evidence:RM-17@sha256:<scope-fingerprint>` per `validate_roadmap_v11.py` | reuse `smc-roadmap` update/validate tooling in Phase 9; no validator change | PASS |
| C01 | parent verification commands | parent Plan `.cursor/plans/work-v4.0.1-m6j-skill-session-ux-terminal-result-closure.plan.md` Verification Ledger V01–V09 is approved and semantic-review PASS | V01–V07/V09 entry commands resolve against committed test files at HEAD; V08 is package-wide typecheck | RM-16 run record proves V06 previously failed on `better-sqlite3` ABI (environment, now rebuilt) and V08 on baseline errors | reuse parent approved commands verbatim so RM-17 evidence is comparable to the parent blocking set | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | RM-17 workspace 从 21c645ce91f97272f5631866479ed49ec2ac497b 或后续不含 RM-17 scope/ambient 漂移的 HEAD 冻结；旧 RM-16 run 不被删除或重写。 | EVIDENCE | C01 | T1 | V10 | DIFF_SCOPE | yes |
| AC-02 | AC | Completion Audit 确认 RM-17 todos 全部完成、scope drift 为 0、ambient stable、implementation delta 非空。 | EVIDENCE | C01 | T1, T2 | V10 | DIFF_SCOPE | yes |
| AC-03 | AC | 独立 Implementation Review 确认 RM-17 没有引入 production 行为变更，且 RM-16 implementation commit 与 parent PRD scope 一致。 | EVIDENCE | C01 | T1 | V10 | DIFF_SCOPE | yes |
| AC-04 | AC | Session Files explicit-open、accepted-aware selection lock、Main write-once conflict、v1.5 result endpoint、terminal order matrix、result retry/no-second-run、sanitized boundary、Expert/File/Session Files regression、guard 与 LAT 均获得 RM-17 Plan-bound fresh PASS。 | BEHAVIOR | C01 | T1, T2 | V01, V02, V03, V04, V05, V06, V07, V09 | INTEGRATION | yes |
| AC-05 | AC | Package-wide typecheck 不作为 RM-17 blocking evidence；其当前失败被记录为独立 baseline restoration 输入，不影响 RM-16 product behavior closure。 | SCOPE | C01 | T1 | V10 | DOCUMENT_SEMANTIC | yes |
| AC-06 | AC | Durable Evidence Manifest 绑定 RM-17 Plan ID、scope fingerprint、Completion Audit、Implementation Review 和所有 blocking Verification PASS。 | EVIDENCE | C01 | T2 | V10 | DIFF_SCOPE | yes |
| AC-07 | AC | Implementation commit 只包含 RM-17 Plan 允许的 governance/evidence artifacts；不包含 Roadmap DONE 更新。 | OPERATIONS | C01 | T1, T2 | V10 | DIFF_SCOPE | yes |
| AC-08 | AC | Roadmap status commit 先将 RM-16 更新为 DONE：Plan 列引用 RM-16 canonical Plan，Implementation Commit 引用 `09efa7ac`，Verification Evidence 以 `external-artifact:docs_agent/evidence/RM-17-evidence.json` 引用 RM-17 closure manifest——因为 roadmap validator 要求 `smc-evidence:` 引用的 plan_id 与 Plan 列文件的 plan_id 一致、且 manifest 必须存在于所列 implementation commit 内，跨 Item 的严格 `smc-evidence:RM-17@sha256:<scope-fingerprint>` 绑定记录在 RM-17 行；RM-17 自身随后按同一规则 DONE。 | OPERATIONS | C03 | T3 | V10 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | RM-17 有一个独立 canonical Plan；不与 RM-16 原 Plan、Managed Hermes Runtime Ownership Closure 或 typecheck baseline restoration 合并。 | SCOPE | C01, C03 | T1, T2, T3 | V10 | DIFF_SCOPE | yes |
| DOD-02 | DOD | CL-01–CL-08 均有 fresh PASS；Completion Audit、Implementation Review、blocking Verification 和 Evidence Manifest 均为 RM-17 current scope fingerprint 下的 FRESH PASS。 | EVIDENCE | C01 | T1, T2 | V01, V02, V03, V04, V05, V06, V07, V09, V10 | DIFF_SCOPE | yes |
| DOD-03 | DOD | 不修改 production code；若 evidence 暴露产品缺陷，返回 parent PRD/Plan 或新开 defect item。 | SCOPE | C01 | T1 | V10 | DIFF_SCOPE | yes |
| DOD-04 | DOD | Implementation commit 与 Roadmap status commit 分离；RM-16 DONE 必须引用真实 implementation commit `09efa7ac`，并以 `external-artifact:docs_agent/evidence/RM-17-evidence.json` 引用 RM-17 evidence；RM-17 行必须引用 RM-17 真实 implementation commit 和 `smc-evidence:RM-17@sha256:<scope-fingerprint>`。 | OPERATIONS | C01, C03 | T2, T3 | V10 | DIFF_SCOPE | yes |
| DOD-05 | DOD | 旧 .smc/runs/RM-16 保留为历史记录；本 Item 不通过删除/重置治理状态取得 PASS。 | OPERATIONS | C01 | T1 | V10 | DIFF_SCOPE | yes |

## Lifecycle Closure Matrix

No requirement is LIFECYCLE-classified; RM-17 changes no runtime state machine and only produces governance evidence.

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Governed evidence chain | AC-02, AC-03, AC-04, AC-06 | RM-17 blocking verification commands and delivery gates | `.smc/evidence/RM-17/ledger.jsonl` records bound to scope/ambient fingerprints; manifest schema `smc.evidence.manifest.v3` | durable Evidence Manifest, commit guard, Roadmap status commit | command, exit code, timestamp, scope/ambient fingerprint, claim results | smc-plan-delivery evidence layer | any blocking FAIL/STALE keeps RM-17 out of IMPLEMENTED_AND_PROVEN; no diagnostic output is promoted to evidence | verification IDs V01–V07/V09/V10; one manifest per scope fingerprint | V01, V02, V03, V04, V05, V06, V07, V09, V10 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | RM-17 workspace frozen at a426e44e with old RM-16 run preserved | yes | current HEAD contains RM-17 APPROVED PRD baseline | NOT_TESTED | NEW_EVIDENCE | new closure baseline | V10 |
| CLM-02 | AC-02 | Completion Audit FRESH PASS | yes | old RM-16 audit MISSING | NOT_TESTED | NEW_EVIDENCE | old run unrecoverable | V10 |
| CLM-03 | AC-03 | Implementation Review FRESH PASS | yes | old RM-16 review MISSING | NOT_TESTED | NEW_EVIDENCE | old run unrecoverable | V10 |
| CLM-04 | AC-04 | parent V01–V07/V09 behavior proof FRESH PASS under RM-17 scope | yes | diagnostic focused PASS is not governed evidence | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | evidence must be RM-17 Plan-bound | V01, V02, V03, V04, V05, V06, V07, V09 |
| CLM-05 | AC-05 | package-wide typecheck excluded and recorded as baseline restoration input | yes | M6j PRD AC-01–AC-10 never required package-wide typecheck; current baseline FAIL | NOT_TESTED | NEW_EVIDENCE | explicit approved scope boundary | V10 |
| CLM-06 | AC-06 | durable manifest binds plan/scope/audit/review/verifications | yes | old RM-16 manifest MISSING | NOT_TESTED | NEW_EVIDENCE | new closure artifact | V10 |
| CLM-07 | AC-07 | implementation commit contains only Plan-allowed governance/evidence artifacts | yes | 09efa7ac exists but was not commit-guard verified | NOT_TESTED | NEW_EVIDENCE | post-hoc commit requires fresh guard proof | V10 |
| CLM-08 | AC-08 | RM-16 DONE (external-artifact ref) then RM-17 DONE (smc-evidence ref) in separate status commit | yes | RM-16 currently IN_PRD | NOT_TESTED | NEW_EVIDENCE | status update requires proof | V10 |
| CLM-09 | DOD-01 | RM-17 delivered by this single canonical Plan only | yes | RM-17 has no prior delivery | NOT_TESTED | NEW_EVIDENCE | new work item | V10 |
| CLM-10 | DOD-02 | all blocking claims FRESH PASS before completion | yes | no RM-17 evidence ledger | NOT_TESTED | NEW_EVIDENCE | new work item | V01, V02, V03, V04, V05, V06, V07, V09, V10 |
| CLM-11 | DOD-03 | sole apps/work/contracts/packages delta from 09efa7ac is SessionFilesPanel.test.tsx harness fix (jsdom pragma + afterEach cleanup via 6c0ee294/55a595c6); no production content changed by RM-17 | yes | approved PRD boundary; harness fix authorized for V06 | NOT_TESTED | NEW_EVIDENCE | closure could drift and needs fresh proof | V10 |
| CLM-12 | DOD-04 | implementation commit excludes Roadmap DONE | yes | RM-16/RM-17 rows lack commit/evidence references | NOT_TESTED | NEW_EVIDENCE | delivery state must be proven | V10 |
| CLM-13 | DOD-05 | blocked RM-16 run record byte-preserved through delivery | yes | RM-16.json state IMPLEMENTATION_BLOCKED at baseline | NOT_TESTED | NEW_EVIDENCE | governance history must survive closure | V10 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

Parent mapping (recorded durably in the closure record): RM-17 V01–V07 and V09 reuse the approved parent RM-16 Plan test/guard/lat commands semantically; each command is wrapped in `python -c … shell=True` so `evidence.py` can spawn it cross-platform (parent ledger uses bare `npm` entries). Parent V08 (`npm --prefix apps/work run typecheck`, package-wide) is EXCLUDED by approved RM-17 scope and recorded as baseline restoration input; RM-17 V10 is the new governance closure check with no parent counterpart.

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-04, CLM-10 | COMPONENT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/screens/Chat/Chat.layout.test.tsx src/renderer/src/modules/skill-run/SkillSelectionBar.test.tsx src/renderer/src/screens/Chat/Chat.skill-run-transcript.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | new/restored identity starts hidden; session/run/artifact effects stay hidden; show/file click opens; hide holds; accepted UI has no clear/switch while rejected pre-accept remains editable | previous-session visible state, background Artifact refresh, keyboard clear, rejected start | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V02 | CLM-04, CLM-10 | INTEGRATION | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-session-mode-store.test.ts src/main/skill-run/skill-run-ipc.test.ts src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | atomic first accepted tool locks; same tool is idempotent; conflict returns stable sanitized rejection before `callSkill`; reopen and accepted-sidecar migration restore lock | concurrent different tools, old provisional row without providerRunId, public setter bypass absent, cancel/fail cannot unlock | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V03 | CLM-04, CLM-10 | CONTRACT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-gateway-client.test.ts --pool=threads --maxWorkers=1', shell=True))"` | client uses sanitized resultPath and accepts only v1.5 Public Run Result run_id/status/nullable text; snapshot no longer supplies report text | cross-origin/internal URL, wrong run id/type, oversized/malformed/error response, raw body leakage | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V04 | CLM-04, CLM-10 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | one terminal resolver converges poll-first, SSE-first, message-before/after, and replay; `/result.text` wins; empty does not erase; exactly one finalize/telemetry/artifact pass | result GET throw/null, duplicate terminal, stale nonterminal, cancel, persistence failure; no second `callSkill` or fixed-delay oracle | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V05 | CLM-04, CLM-10 | INTEGRATION | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-continuation.test.ts src/main/skill-run/skill-run-transcript-store.test.ts src/renderer/src/modules/skill-run/SkillRunTranscriptCard.test.tsx src/renderer/src/modules/skill-run/skill-run-transcript.test.ts --pool=threads --maxWorkers=1', shell=True))"` | result-unavailable sidecar rehydrates through safe GET and updates same Card; report/no-text/unavailable/output-file labels are distinct; durable text/error round-trips | missing/mismatched providerRunId ignored; failed retry stays succeeded/unavailable; no tools/call/raw URL/path | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V06 | CLM-04, CLM-10 | REGRESSION | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/expert/expert-run-service.test.ts src/main/files/upsert-skill-run-remote-artifact.test.ts src/renderer/src/screens/Chat/expertDefaultEntry.test.ts src/renderer/src/screens/Chat/session-files/SessionFilesPanel.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | Expert lifecycle, Skill artifact upsert, default-entry routing, and Session Files contents/actions remain unchanged | no Expert fallback, no direct artifact transport, no second panel owner; better-sqlite3 ABI must match the current Node runtime | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V07 | CLM-04, CLM-10 | STATIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run guard', shell=True))"` | renderer/network/runtime/i18n contract guards pass and no forbidden boundary appears | direct HTTP/JWT/URL/raw event, legacy runtime or non-English locale edits fail | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V09 | CLM-04, CLM-10 | DOCUMENT_SEMANTIC | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('lat check', cwd='apps/work', shell=True))"` | LAT links/code refs pass and the Skill Run LAT still records explicit-open, accepted lock, and status/result convergence | stale default-visible/identity-mutable/snapshot-result wording fails | REPO_SUMMARY | local repository | NEW_EVIDENCE | yes |
| V10 | CLM-01, CLM-02, CLM-03, CLM-05, CLM-06, CLM-07, CLM-08, CLM-09, CLM-10, CLM-11, CLM-12, CLM-13 | STATIC | LOCAL | `python -c "import json,subprocess,sys,hashlib; from pathlib import Path; plan='.cursor/plans/work-v4.0.1-m6j-evidence-closure.plan.md'; harness='apps/work/src/renderer/src/screens/Chat/session-files/SessionFilesPanel.test.tsx'; rec=json.loads(Path('docs_agent/evidence/RM-17-closure.json').read_text(encoding='utf-8')); old=Path('.smc/runs/RM-16.json').read_bytes(); ok=rec.get('schema')=='smc.closure-record.v1' and rec.get('plan_id')=='RM-17' and rec.get('parent_implementation_commit')=='09efa7ac5a539975896b7e9c41cc7397101f36f5' and json.loads(old.decode('utf-8')).get('state')=='IMPLEMENTATION_BLOCKED' and rec.get('old_run_sha256')=='sha256:'+hashlib.sha256(old).hexdigest() and rec.get('typecheck_baseline',{}).get('disposition')=='BASELINE_RESTORATION_INPUT' and rec.get('verification_mapping',{}).get('V08',{}).get('disposition')=='EXCLUDED_PACKAGE_WIDE_TYPECHECK'; ok=ok and subprocess.call([sys.executable,'.agents/skills/smc-plan-delivery/scripts/completion_audit.py','check','--plan',plan])==0; ok=ok and subprocess.call([sys.executable,'.agents/skills/smc-plan-delivery/scripts/review_record.py','check','--plan',plan,'--kind','implementation'])==0; delta=subprocess.check_output(['git','diff','--name-only','09efa7ac5a539975896b7e9c41cc7397101f36f5','HEAD','--','apps/work','contracts','packages'], text=True).strip().splitlines(); ok=ok and delta==[harness] and Path(harness).read_text(encoding='utf-8').startswith('// @vitest-environment jsdom'); sys.exit(0 if ok else 1)"` | closure record schema/attestations valid; old RM-16 run byte-preserved and still IMPLEMENTATION_BLOCKED; typecheck exclusion recorded; completion audit FRESH_PASS; implementation review FRESH_PASS; sole apps/work/contracts/packages delta from 09efa7ac is SessionFilesPanel.test.tsx harness fix (jsdom + cleanup) | tampered closure record, rewritten old run, missing audit/review, or any extra production/test drift fails | REPO_SUMMARY | local repository | NEW_EVIDENCE | yes |

## Immediate Read

- `.smc/runs/RM-16.json` (blocked run record to attest, never modify)
- `docs/work/PRD-WORK-v4.0.1-M6j-evidence-closure.md` (approved RM-17 PRD)
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` (RM-16/RM-17 rows)
- `.cursor/plans/work-v4.0.1-m6j-skill-session-ux-terminal-result-closure.plan.md` (parent approved Verification Ledger V01–V09)
- `docs_agent/evidence/RM-15-evidence.json` (manifest precedent shape only)

## Triggered Read

- If a parent verification command fails under RM-17 scope: read only the named failing test file and its production owner to classify product defect versus environment defect; a product defect returns to the parent PRD/Plan path, an environment defect is a BLOCKED record.
- If `git diff --name-only 09efa7ac HEAD -- apps/work contracts packages` is anything other than the authorized SessionFilesPanel.test.tsx harness fix (jsdom pragma + afterEach cleanup): stop with RETURN_PRD; the closure premise is broken.
- If `.smc/runs/RM-16.json` is missing or no longer IMPLEMENTATION_BLOCKED: stop with RETURN_PRD; governance history was mutated outside this Plan.
- Otherwise: do not read Managed Runtime, Provider implementation, archived PRDs, build output, runtime data, or reference applications.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `docs_agent/evidence/RM-17-closure.json` | DOC | ADD | SMC Delivery evidence | T1 | closure record attesting frozen baseline, preserved blocked RM-16 run, parent V01–V09 mapping with V08 exclusion, typecheck baseline record, implementation integrity | RM-16 governed completion proof | yes |
| C03 | `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` | DOC | MODIFY | Skill-First Roadmap | T3 | RM-16 DONE: parent Plan + `09efa7ac` + `external-artifact:docs_agent/evidence/RM-17-evidence.json`; RM-17 DONE: this Plan + RM-17 implementation commit + `smc-evidence:RM-17@sha256:<scope-fingerprint>`; Phase 9 status commit only | RM-16 Roadmap status | no |

## Domain Activation Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `docs_agent/evidence/RM-17-closure.json` | the tooling-generated manifest schema has no room for baseline/old-run/V-mapping/typecheck attestations, and AC-05 plus the Roadmap exit criteria require a durable typecheck baseline record; a small Plan-owned JSON record is the minimal committable carrier | evidence-only artifact beside existing manifests; no production owner added |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MINIMAL_NEW | no existing artifact records closure attestations; manifest schema is tooling-owned | one small JSON record authored once; everything else reuses delivery tooling |
| C03 | MODIFY_EXISTING | `smc-roadmap` update/validate tooling already owns status commits for RM-02…RM-15 | two row updates in the existing roadmap via existing tooling; no schema or process change |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `docs_agent/evidence/RM-17-closure.json` | `.smc/runs/RM-16.json`<br>`docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`<br>`.cursor/plans/work-v4.0.1-m6j-skill-session-ux-terminal-result-closure.plan.md` | - | no |
| T2 | - | - | `docs_agent/evidence/RM-17-closure.json`<br>`docs_agent/evidence/RM-15-evidence.json` | T1 | no |
| T3 | C03 | `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md` | `docs_agent/evidence/RM-17-evidence.json` | T2 | no |

## Integration Hotspots

None

## Generated Outputs Ledger

| Output | Producer Todo | Kind | Consumers |
|---|---|---|---|
| `docs_agent/evidence/RM-17-evidence.json` | T2 | GENERATED_ENTRYPOINT | `commit_guard.py`, `validate_delivery_completion.py`, Roadmap RM-16/RM-17 evidence references; delivery `owned_control` only (never Change Matrix planned) |

## Todo T1 — Closure baseline record

**Owns Changes**
- C01

**Goal**

Author the durable RM-17 closure record so every later gate can verify baseline identity, old-run preservation, verification mapping, and the typecheck exclusion from one committable artifact.

**Immediate anchors**
- `.smc/runs/RM-16.json`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
- `.cursor/plans/work-v4.0.1-m6j-skill-session-ux-terminal-result-closure.plan.md`

**Changes**
- Confirm delivery HEAD includes harness commits `6c0ee294`/`55a595c6` and that `git diff --name-only 09efa7ac5a539975896b7e9c41cc7397101f36f5 HEAD -- apps/work contracts packages` equals only `apps/work/src/renderer/src/screens/Chat/session-files/SessionFilesPanel.test.tsx` starting with `// @vitest-environment jsdom`; record both facts.
- Read (never write) `.smc/runs/RM-16.json`; record its path, state `IMPLEMENTATION_BLOCKED`, block reason, and sha256.
- Record the parent verification mapping: RM-17 V01–V07 and V09 reuse the approved parent RM-16 commands verbatim; parent V08 (package-wide typecheck) has disposition `EXCLUDED_PACKAGE_WIDE_TYPECHECK` per the approved RM-17 PRD/Roadmap scope.
- Run `npm --prefix apps/work run typecheck` once, capture the current failure summary (error count and representative error files), and record it with disposition `BASELINE_RESTORATION_INPUT`; this run is a diagnostic record, not blocking evidence.
- Write `docs_agent/evidence/RM-17-closure.json` with schema `smc.closure-record.v1` containing exactly the fields V10 checks: `schema`, `plan_id`, `parent_plan_id`, `parent_implementation_commit`, `governance_baseline_commits`, `frozen_head`, `old_run` (path/state/block_reason), `old_run_sha256`, `verification_mapping` (V01–V09 with V08 exclusion disposition), `typecheck_baseline` (command/observed_at/result/summary/disposition), `implementation_integrity` (command/result), and a diagnostic-evidence disclaimer.

**Stop conditions**
- [ ] V10 PASS.
- [ ] Closure record exists, parses, and satisfies every V10 field oracle.
- [ ] Typecheck failure is recorded as baseline restoration input, not as an RM-16 product defect.
- [ ] No production, test, contract, or roadmap file is modified by T1.

**Triggered reads**
- If the implementation integrity diff is non-empty: stop with RETURN_PRD instead of writing the record.
- If the old run record is missing or not IMPLEMENTATION_BLOCKED: stop with RETURN_PRD.

## Todo T2 — Durable evidence manifest

**Owns Changes**
- -

**Goal**

Prove the committed RM-16 behavior under RM-17 scope with fresh Plan-bound evidence and produce the durable Evidence Manifest through the delivery evidence layer as `owned_control` (not a Change Matrix planned write).

**Immediate anchors**
- `docs_agent/evidence/RM-17-closure.json`
- `docs_agent/evidence/RM-15-evidence.json`

**Changes**
- Delivery-orchestrated (Phase 6): run V01–V07, V09, V10 through `smc-plan-delivery/scripts/evidence.py` with NEW_EVIDENCE so every record binds the current scope/ambient fingerprints.
- Delivery-orchestrated (Phase 7): generate `docs_agent/evidence/RM-17-evidence.json` via `evidence.py manifest` only after Completion Audit and Implementation Review are FRESH_PASS; verify freshness with `validate_delivery_completion.py`.
- Never hand-author or hand-edit the manifest; never promote the pre-Plan diagnostic test output into evidence; never list the manifest path in Change Matrix planned_files.

**Stop conditions**
- [ ] V01, V02, V03, V04, V05, V06, V07, V09, V10 are FRESH PASS.
- [ ] Manifest exists, validates as `smc.evidence.manifest.v3`, and binds the RM-17 scope fingerprint.
- [ ] `validate_delivery_completion.py` reports DELIVERY_READY_TO_COMMIT.
- [ ] Writing the manifest does not change the RM-17 scope fingerprint.

**Triggered reads**
- If V06 fails on `better-sqlite3` ABI again: rebuild the native module as an environment repair, record the blocker, and rerun; do not edit tests.
- If any behavior verification FAILs on product grounds: stop and return to the parent PRD/Plan path; do not patch code inside RM-17.

## Todo T3 — RM-16 Roadmap status

**Owns Changes**
- C03

**Goal**

Close RM-16 then RM-17 in the Skill-First Roadmap through a separate status commit that references the real implementation commit and the RM-17 evidence.

**Immediate anchors**
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`
- `docs_agent/evidence/RM-17-evidence.json`

**Changes**
- Delivery-orchestrated (Phase 9, after the implementation commit): update RM-16 to DONE with Plan `.cursor/plans/work-v4.0.1-m6j-skill-session-ux-terminal-result-closure.plan.md`, Implementation Commit `09efa7ac5a539975896b7e9c41cc7397101f36f5`, Verification Evidence `external-artifact:docs_agent/evidence/RM-17-evidence.json` (cross-item pointer — validator cannot bind `smc-evidence:RM-17@…` to a parent-plan row whose commit predates the manifest); then update RM-17 to DONE with this Plan, the RM-17 implementation commit, and Verification Evidence `smc-evidence:RM-17@sha256:<scope-fingerprint>` from the durable manifest.
- Validate the roadmap with `validate_roadmap.py` before committing; keep the status commit separate from the implementation commit.
- Do not mark any other item DONE; do not alter exit criteria text.

**Stop conditions**
- [ ] V10 PASS and the implementation commit is verified by `commit_guard.py`.
- [ ] Roadmap validator passes with both rows DONE and parseable references.
- [ ] Status commit contains only the roadmap file.

**Triggered reads**
- If the roadmap validator rejects the RM-17 row: verify manifest exists inside the RM-17 implementation commit, plan_id matches `RM-17`, and scope fingerprint matches the manifest payload; do not put `smc-evidence:RM-17@…` on the RM-16 row or change the validator.

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`. LOCAL tests use the committed v1.5.0 Bundle and deterministic fake authorized transport; no live Provider credentials or environment discovery are required by this Plan.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; V01–V07, V09, V10 FRESH PASS; CLM-01–CLM-13 PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07, V09, V10 through SMC evidence ledger plus durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | closure record exists but one or more Todo, audit, review, verification, claim, or manifest states are pending/stale | pending/stale Todo, V01–V07/V09/V10, CLM-01–CLM-13, audit/review/manifest ids |
| BLOCKED | environment/dependency prevents proof after in-scope retries (for example better-sqlite3 ABI rebuild) | blocker record with command, owner, and non-secret diagnostic |
| RETURN_PRD | implementation integrity diff is non-empty, old RM-16 run was mutated, or fresh evidence exposes a product defect | PRD revision request; no Plan-local code repair |
