---
name: Work v4.1.0 Managed Hermes Verification Closure
overview: Close governed evidence for committed Managed Hermes Data Plane Client (cb562e91), tighten Windows listen-match for managed python launcher, and mark RM-01/RM-02 DONE without rewriting the blocked parent delivery run.
todos:
  - id: t1-listen-match-oracle
    content: "T1 — Listen-match oracle [C03, C05]"
    status: completed
  - id: t2-closure-baseline-record
    content: "T2 — Closure baseline record [C01]"
    status: completed
  - id: t3-durable-evidence-manifest
    content: "T3 — Durable evidence manifest"
    status: completed
  - id: t4-roadmap-status
    content: "T4 — RM-01/RM-02 Roadmap status [C04]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: WORK-V4.1.0-RUNTIME-RM-02
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-MANAGED-HERMES-RUNTIME-V4.1.0@v1.2.0/RM-02/verification-closure-2026-09-10
grounded_commit: 09314441f0b9d6a76d5da55345ea7495d8409f62
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# Work v4.1.0 Managed Hermes Verification Closure Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.1.0-managed-hermes-verification-closure.md)

## Scope

- In: implement parent v1.1.3 listen-match oracle in `gateway-probe.ts` with focused unit coverage; author RM-02 closure record; fresh Plan-bound LOCAL V01–V03/V06/V07/V09/V11 plus V12 remainder (focused unit/lat/docs/status, **no** package-wide typecheck) and LIVE V04/V05/V08/V10/V13; delivery-owned Evidence Manifest; separate Roadmap status commit closing RM-01 then RM-02.
- Out: re-implement Self-Install/supervisor deletion; Installer packaging; Credential; Skill Run; package-wide typecheck repair; rewrite `.smc/runs/WORK-V4.1.0-RUNTIME-RM-01*`; foreign listener fail-open; Roadmap DONE inside implementation commit.
- Production Owner: `gateway-probe.ts` remains Probe owner; no new Adapter. SMC Delivery owns closure/evidence/status only.
- Grounding boundary: committed baseline `09314441`; parent implementation under proof `cb562e91`; ambient untracked reports/M6g drafts/`install.log` must stay byte-stable.
- Todo completion convention: T1 writes production listen-match; T2 authors closure record; T3/T4 are delivery-orchestrated (evidence + Phase 9 status).

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C03 | `apps/work/src/main/runtime/gateway-probe.ts#inspectGatewayListener` | compares only ExecutablePath to expected CLI; managed install listens as `...\Hermes\python\python.exe` with CommandLine containing `...\bin\hermes.exe gateway run` | `inspectGatewayListener`; `normalizeExecutablePath` | `legacy-local-runtime-adapter.ts#probeLocal` | keep adapter owner; extend probe helper only | PASS |
| C03 | `apps/work/src/main/runtime/gateway-probe.test.ts` | path absent | new unit file for match/mismatch/python-launcher/foreign/missing-cmdline | vitest via apps/work | add beside probe module; adapter tests keep mocks | PASS |
| C05 | `apps/work/src/renderer/src/components/settings/RuntimePane.test.tsx` | jsdom Self-Install gate tests lack `afterEach(cleanup)`; multi-case run accumulates Retry buttons | `describe` / `render` / `getByRole('button', { name: 'Retry' })` | V09 vitest command | same test owner; cleanup only | PASS |
| C05 | `apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx` | same jsdom accumulation on Retry | `describe` / `renderScreen` | V09 vitest command | same test owner; cleanup only | PASS |
| C01 | `docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-closure.json` | absent | closure schema `smc.closure-record.v1` | V10-style governance check | RM-17 closure precedent | PASS |
| C04 | `docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md` | RM-01 IN_PRD; RM-02 IN_PRD; Commit/Evidence `-` | roadmap columns | `roadmap_update.py` / `validate_roadmap_v11.py --no-architecture-check` | reuse tooling | PASS |
| C01 | `.smc/runs/WORK-V4.1.0-RUNTIME-RM-01.json` | `IMPLEMENTATION_COMPLETE`; ambient previously mutated | run schema v2 | preserve only | attest sha256 in closure | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | workspace 冻结；旧 parent run 字节保留。 | EVIDENCE | C01 | T2 | V14 | DIFF_SCOPE | yes |
| AC-02 | AC | Completion Audit FRESH PASS。 | EVIDENCE | C01 | T2, T3 | V14 | DIFF_SCOPE | yes |
| AC-03 | AC | Implementation Review FRESH PASS；除 C03 外无额外 production 扩张。 | EVIDENCE | C01, C03 | T1, T2 | V14 | DIFF_SCOPE | yes |
| AC-04 | AC | LOCAL V01–V03/V06/V07/V09/V11 FRESH PASS。 | BEHAVIOR | C01, C03 | T1, T3 | V01, V02, V03, V06, V07, V09, V11 | INTEGRATION | yes |
| AC-05 | AC | Listen-match 单测 + 行为： | BEHAVIOR | C03 | T1 | V15 | UNIT | yes |
| AC-06 | AC | LIVE V04/V05/V08/V10/V13 FRESH PASS（ENV-02 + 合法 managed listener）。Foreign listener → BLOCK + defect，不 fail-open。 | BEHAVIOR | C03 | T1, T3 | V04, V05, V08, V10, V13 | REAL_PROCESS | yes |
| AC-07 | AC | package-wide typecheck 排除并写入 closure（parent AC-20 v1.1.3）；V12 的 focused unit/`lat`/docs/status 部分仍阻断。 | SCOPE | C01 | T2, T3 | V12, V14 | DOCUMENT_SEMANTIC | yes |
| AC-08 | AC | Durable manifest owned_control；不 stale fingerprint。 | EVIDENCE | C01 | T3 | V14 | DIFF_SCOPE | yes |
| AC-09 | AC | Impl commit 仅 Plan 允许文件；无 Roadmap DONE。 | OPERATIONS | C01, C03 | T1, T2, T3 | V14 | DIFF_SCOPE | yes |
| AC-10 | AC | Status commit：RM-01 DONE（parent Plan + `cb562e91` + `external-artifact:docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-evidence.json`）然后 RM-02 DONE（`smc-evidence:WORK-V4.1.0-RUNTIME-RM-02@sha256:<fp>`）。 | OPERATIONS | C04 | T4 | V14 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | AC-01–AC-10 FRESH PASS under RM-02 scope。 | EVIDENCE | C01, C03, C04 | T1, T2, T3, T4 | V01, V02, V03, V04, V05, V06, V07, V08, V09, V10, V11, V12, V13, V14, V15 | DIFF_SCOPE | yes |
| DOD-02 | DOD | 独立 Plan；不与 parent Plan 合并。 | SCOPE | C01, C03, C04 | T1, T2, T3, T4 | V14 | DIFF_SCOPE | yes |
| DOD-03 | DOD | 除 C03 外无无关 production。 | SCOPE | C03 | T1 | V14, V15 | DIFF_SCOPE | yes |
| DOD-04 | DOD | Impl/status commit 分离；证据引用过 `validate_roadmap_v11.py --no-architecture-check`。 | OPERATIONS | C04 | T4 | V14 | DIFF_SCOPE | yes |
| DOD-05 | DOD | 旧 parent run 保留。 | OPERATIONS | C01 | T2 | V14 | DIFF_SCOPE | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Probe READY after managed gateway up | AC-05, AC-06 | health+auth+listen | UNAVAILABLE / CONFLICT / configuration_error | `LegacyLocalRuntimeAdapter.probeLocal` via revised `inspectGatewayListener` | same Probe owner; never kill | V15, V04, V10, V13 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Listen inspect | AC-05, AC-06 | PowerShell read-only OwningProcess path + CommandLine | `GatewayListenInspectResult` | `probeLocal` | status match/mismatch/no_listener/inspect_failed | `gateway-probe.ts` | foreign→CONFLICT; parse fail→configuration_error | probe retry idempotent | V15, V13 |
| Evidence chain | AC-02, AC-04, AC-06, AC-08 | evidence.py | `smc.evidence.manifest.v3` | commit_guard / roadmap | scope/ambient fingerprints | smc-plan-delivery | STALE/FAIL blocks DONE | one manifest per fingerprint | V14 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | freeze + old run preserved | yes | ambient mutated parent run | FAILED | NEW_EVIDENCE | new closure | V14 |
| CLM-02 | AC-02 | audit FRESH PASS | yes | MISSING | NOT_TESTED | NEW_EVIDENCE | new item | V14 |
| CLM-03 | AC-03 | review FRESH PASS | yes | MISSING | NOT_TESTED | NEW_EVIDENCE | new item | V14 |
| CLM-04 | AC-04 | LOCAL parent set PASS | yes | MISSING | NOT_TESTED | NEW_EVIDENCE | RM-02 bound | V01, V02, V03, V06, V07, V09, V11 |
| CLM-05 | AC-05 | listen-match oracle | yes | ExecutablePath-only | FAILED | NEW_EVIDENCE | packaging | V15 |
| CLM-06 | AC-06 | LIVE PASS | yes | false CONFLICT | FAILED | NEW_EVIDENCE | after C03 | V04, V05, V08, V10, V13 |
| CLM-07 | AC-07 | typecheck excluded; V12 remainder PASS | yes | package-wide FAIL | FAILED | NEW_EVIDENCE | parent v1.1.3 | V12, V14 |
| CLM-08 | AC-08 | manifest binds | yes | MISSING | NOT_TESTED | NEW_EVIDENCE | new | V14 |
| CLM-09 | AC-09 | commit scope | yes | ungated parent commit | NOT_TESTED | NEW_EVIDENCE | guard | V14 |
| CLM-10 | AC-10 | roadmap refs | yes | IN_PRD | NOT_TESTED | NEW_EVIDENCE | status | V14 |
| CLM-11 | DOD-01 | AC-01–AC-10 FRESH PASS under RM-02 scope | yes | no closure evidence | NOT_TESTED | NEW_EVIDENCE | new item | V14 |
| CLM-12 | DOD-02 | single canonical Plan only | yes | none | NOT_TESTED | NEW_EVIDENCE | new item | V14 |
| CLM-13 | DOD-03 | only C03 production delta | yes | listen mismatch | FAILED | NEW_EVIDENCE | packaging | V14, V15 |
| CLM-14 | DOD-04 | impl/status commits separated | yes | parent ungated | NOT_TESTED | NEW_EVIDENCE | status commit | V14 |
| CLM-15 | DOD-05 | old parent run byte-preserved | yes | ambient mutated history | FAILED | NEW_EVIDENCE | must survive | V14 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|
| SCN-01 | CLM-06 | V04 | Work + managed Gateway | Chat UI; main logs | Gateway healthy; listen match | start Work; send Chat | response; no Python/TUI/fallback logs | ENV-02 |
| SCN-02 | CLM-06 | V05 | Work + hermes.exe | profile/cron/kanban/mcp/skills | PATH without Hermes | CRUD/list/install | success via absolute CLI | ENV-02 |
| SCN-03 | CLM-06 | V08 | Chat tool runtime | Chat | Probe READY | ask HERMES_HOME/TERMINAL_CWD | ProgramData home+workspace | ENV-02 |
| SCN-04 | CLM-06 | V10 | SMC Hermes Gateway task | admin stop/start | Work open | stop/start/quit | UNAVAILABLE; READY; PID stable | ENV-02 |
| SCN-05 | CLM-05, CLM-06 | V13 | foreign listener fixture | Windows listen inspect | non-managed exe on 8642 | probe | CONFLICT; no kill | ENV-02 |

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|
| ENV-01 | - | `node -v` | - | LOCAL_WORKTREE | - |
| ENV-02 | - | `python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8642/health', timeout=3); import pathlib; assert pathlib.Path(r'D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe').exists()"` | - | COMMAND | `python -c "import json; from pathlib import Path; print(json.loads(Path('.smc/runs/WORK-V4.1.0-RUNTIME-RM-02/verification-candidate.json').read_text(encoding='utf-8'))['candidate_id'])"` |

## Verification Ledger

Parent LOCAL commands reused via `python -c … shell=True`. Parent V12 is **split**: package-wide typecheck excluded; remainder is focused unit already covered by V01–V03/V06/V07/V09/V11 plus `lat check` + docs/status oracles in V12/V14. V15 is new listen-match unit coverage.

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-04 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run tests/hermes-runtime-paths.test.ts --pool=threads --maxWorkers=1', shell=True))"` | no Self-Install path exports; HERMES_HOME live | fixtures may keep literals | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V02 | CLM-04 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run tests/profiles.test.ts tests/cronjobs.test.ts tests/mcp-servers.test.ts tests/kanban-unsupported.test.ts tests/skills-cli-output.test.ts tests/hermes-auth.test.ts --pool=threads --maxWorkers=1', shell=True))"` | CLI via hermes-cli-runner | PATH hermes spawn forbidden | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V03 | CLM-04 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run guard', shell=True))"` | guard PASS | reintro FAIL | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V04 | CLM-06 | LIVE | LIVE | `python .smc/runs/WORK-V4.1.0-RUNTIME-RM-02/live_verify.py V04` | response; forbidden logs absent | no TUI fallback | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |
| V05 | CLM-06 | LIVE | LIVE | `python .smc/runs/WORK-V4.1.0-RUNTIME-RM-02/live_verify.py V05` | CRUD/list success | pythonw never launched | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |
| V06 | CLM-04 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run tests/model-discovery.test.ts --pool=threads --maxWorkers=1', shell=True))"` | curated; no Python discovery | helper gone | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V07 | CLM-04 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/hermes.test.ts --pool=threads --maxWorkers=1', shell=True))"` | STT unavailable | no HERMES_PYTHON | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V08 | CLM-06 | LIVE | LIVE | `python .smc/runs/WORK-V4.1.0-RUNTIME-RM-02/live_verify.py V08` | managed ProgramData paths | AppData → BLOCK installer | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |
| V09 | CLM-04 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/components/settings/RuntimePane.test.tsx src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | Self-Install UI unreachable | INSTALL_CMD* gone | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V10 | CLM-06 | LIVE | LIVE | `python .smc/runs/WORK-V4.1.0-RUNTIME-RM-02/live_verify.py V10` | UNAVAILABLE; READY; PID stable | Work did not spawn | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |
| V11 | CLM-04 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run tests/dashboard-remote.test.ts tests/dashboard-launch.test.ts tests/dashboard-web-dist.test.ts --pool=threads --maxWorkers=1', shell=True))"` | remote/SSH PASS | local spawn gone | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V12 | CLM-07 | DOCUMENT_SEMANTIC | LOCAL | `python -c "import subprocess,sys; from pathlib import Path; lat=subprocess.call('lat check', cwd='apps/work', shell=True); txt='\n'.join(Path(p).read_text(encoding='utf-8') for p in ['apps/work/README.md','apps/work/lat.md/runtime-connection.md']); ok=('data-plane' in txt.lower() or 'Data Plane' in txt or 'managed' in txt.lower()) and 'hermes-agent/venv' not in txt; sys.exit(0 if lat==0 and ok else 1)"` | lat PASS; docs data-plane client | no package-wide typecheck | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V13 | CLM-05, CLM-06 | LIVE | LIVE | `python .smc/runs/WORK-V4.1.0-RUNTIME-RM-02/live_verify.py V13` | not READY; no kill | health-only must not READY | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |
| V14 | CLM-01, CLM-02, CLM-03, CLM-07, CLM-08, CLM-09, CLM-10, CLM-11, CLM-12, CLM-13, CLM-14, CLM-15 | STATIC | LOCAL | `python -c "import json,subprocess,sys,hashlib; from pathlib import Path; plan='.cursor/plans/work-v4.1.0-managed-hermes-verification-closure.plan.md'; rec=json.loads(Path('docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-closure.json').read_text(encoding='utf-8')); old=Path('.smc/runs/WORK-V4.1.0-RUNTIME-RM-01.json').read_bytes(); ok=rec.get('schema')=='smc.closure-record.v1' and rec.get('plan_id')=='WORK-V4.1.0-RUNTIME-RM-02' and rec.get('parent_implementation_commit')=='cb562e91' and json.loads(old.decode()).get('state')=='IMPLEMENTATION_COMPLETE' and rec.get('old_run_sha256')=='sha256:'+hashlib.sha256(old).hexdigest() and rec.get('typecheck_baseline',{}).get('disposition')=='BASELINE_RESTORATION_INPUT'; ok=ok and subprocess.call([sys.executable,'.agents/skills/smc-plan-delivery/scripts/completion_audit.py','check','--plan',plan])==0; ok=ok and subprocess.call([sys.executable,'.agents/skills/smc-plan-delivery/scripts/review_record.py','check','--plan',plan,'--kind','implementation'])==0; sys.exit(0 if ok else 1)"` | closure+audit+review; old run preserved; typecheck excluded | tamper fails | REPO_SUMMARY | ENV-01 | NEW_EVIDENCE | yes |
| V15 | CLM-05, CLM-13 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/runtime/gateway-probe.test.ts tests/runtime-adapter.test.ts --pool=threads --maxWorkers=1', shell=True))"` | hermes match; same-root python+gateway run match; foreign/missing cmdline/other-root mismatch | never kill | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/main/runtime/gateway-probe.ts`
- `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts`
- `apps/work/tests/runtime-adapter.test.ts`
- `.smc/runs/WORK-V4.1.0-RUNTIME-RM-01.json`
- `docs/work/PRD-WORK-v4.1.0-managed-hermes-runtime-ownership-closure.md` (v1.1.3 C05)
- `.cursor/plans/work-v4.1.0-managed-hermes-runtime-ownership-closure.plan.md`

## Triggered Read

- If LIVE FAILs on foreign listener: record BLOCK + Installer/endpoint defect; do not weaken CONFLICT.
- If LOCAL product FAIL: RETURN_PRD / parent path; do not patch outside C03.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C03 | `apps/work/src/main/runtime/gateway-probe.ts#inspectGatewayListener` | PROD | MODIFY | gateway-probe | T1 | match hermes.exe or same-install-root python.exe with CommandLine tokens (expected CLI path, gateway, run); else mismatch/inspect_failed; never kill | Listen-match oracle | no |
| C03 | `apps/work/src/main/runtime/gateway-probe.test.ts` | TEST | ADD | gateway-probe tests | T1 | unit coverage for hermes/python-launcher/foreign/missing-cmdline/other-root | Listen-match oracle | yes |
| C05 | `apps/work/src/renderer/src/components/settings/RuntimePane.test.tsx` | TEST | MODIFY | RuntimePane tests | T1 | afterEach(cleanup) so V09 jsdom isolation does not accumulate Retry buttons | Self-Install UI gate proof | no |
| C05 | `apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx` | TEST | MODIFY | ConnectionErrorScreen tests | T1 | afterEach(cleanup) so V09 jsdom isolation does not accumulate Retry buttons | Self-Install UI gate proof | no |
| C01 | `docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-closure.json` | DOC | ADD | SMC Delivery evidence | T2 | closure attestations for freeze/old-run/V-map/typecheck exclusion | Completion proof | yes |
| C04 | `docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md` | DOC | MODIFY | Managed Hermes Roadmap | T4 | RM-01 DONE external-artifact; RM-02 DONE smc-evidence | Roadmap status | no |

## Domain Activation Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C03 | `apps/work/src/main/runtime/gateway-probe.test.ts` | probe match rules need direct unit oracles beyond adapter mocks | same Probe owner |
| C01 | `docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-closure.json` | manifest cannot carry baseline/old-run/typecheck attestations | evidence-only |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C03 | MODIFY_EXISTING | parent v1.1.3 C05; real packaging uses python launcher | extend existing inspect helper; no new Adapter |
| C05 | MODIFY_EXISTING | V09 jsdom accumulates DOM without cleanup (same class as RM-17 SessionFilesPanel) | afterEach(cleanup) only |
| C01 | MINIMAL_NEW | RM-17 closure precedent | one JSON record |
| C04 | MODIFY_EXISTING | roadmap_update tooling | two row updates |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C03, C05 | `apps/work/src/main/runtime/gateway-probe.ts#inspectGatewayListener`<br>`apps/work/src/main/runtime/gateway-probe.test.ts`<br>`apps/work/src/renderer/src/components/settings/RuntimePane.test.tsx`<br>`apps/work/src/renderer/src/screens/ConnectionError/ConnectionErrorScreen.test.tsx` | `legacy-local-runtime-adapter.ts`<br>`tests/runtime-adapter.test.ts`<br>parent PRD C05 | - | no |
| T2 | C01 | `docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-closure.json` | `.smc/runs/WORK-V4.1.0-RUNTIME-RM-01.json`<br>parent Plan<br>Managed Hermes Roadmap | T1 | no |
| T3 | - | - | `docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-closure.json` | T2 | no |
| T4 | C04 | `docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md` | `docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-evidence.json` | T3 | no |

## Integration Hotspots

None

## Generated Outputs Ledger

| Output | Producer Todo | Kind | Consumers |
|---|---|---|---|
| `docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-evidence.json` | T3 | GENERATED_ENTRYPOINT | commit_guard; validate_delivery_completion; Roadmap RM-01/RM-02 refs; owned_control only |

## Todo T1 — Listen-match oracle

**Owns Changes**
- C03
- C05

**Goal**

Make Windows listen inspect accept the real managed Hermes packaging without fail-opening foreign listeners.

**Immediate anchors**
- `apps/work/src/main/runtime/gateway-probe.ts#inspectGatewayListener`
- parent PRD v1.1.3 C05 “合法 managed Hermes Gateway 进程”

**Changes**
- Extend inspect to capture CommandLine with ExecutablePath.
- Match when path equals expected CLI **or** (path is `{installRoot}\python\python.exe` for expected `{installRoot}\bin\hermes.exe` **and** CommandLine contains expected CLI absolute path token plus `gateway` and `run` tokens).
- Otherwise mismatch / inspect_failed; never signal PID.
- Add `gateway-probe.test.ts` covering hermes / same-root python launcher / other-root python / foreign exe / missing cmdline.
- Authorized V09 harness: `afterEach(cleanup)` on RuntimePane + ConnectionErrorScreen tests (jsdom accumulation).

**Stop conditions**
- [ ] V15 PASS.
- [ ] Adapter CONFLICT paths for foreign exe still covered by `tests/runtime-adapter.test.ts`.

**Triggered reads**
- If install layout uses a different python relative path under Hermes root: RETURN_PRD rather than broaden matching.

## Todo T2 — Closure baseline record

**Owns Changes**
- C01

**Goal**

Durable attestations for freeze, old-run preservation, verification mapping, and typecheck exclusion.

**Immediate anchors**
- `.smc/runs/WORK-V4.1.0-RUNTIME-RM-01.json`
- parent Plan Verification Ledger

**Changes**
- Record parent commit `cb562e91`, frozen HEAD, old run state/sha256, V01–V13 mapping with V12 typecheck exclusion disposition, typecheck baseline FAIL summary.
- Confirm C03 is the only intentional apps/work production delta in this Plan write set.

**Stop conditions**
- [ ] V14 field oracles satisfiable by the record.

**Triggered reads**
- If old run missing: RETURN_PRD.

## Todo T3 — Durable evidence manifest

**Owns Changes**
- -

**Goal**

Run blocking verifications and emit owned_control Evidence Manifest without changing scope fingerprint.

**Immediate anchors**
- closure record
- parent Plan commands

**Changes**
- Delivery Phase 6: V01–V15 NEW_EVIDENCE.
- Delivery Phase 7: `evidence.py manifest` only after audit+review FRESH PASS.
- Never list manifest in Change Matrix planned_files.

**Stop conditions**
- [ ] All blocking V FRESH PASS.
- [ ] Manifest FRESH; fingerprint unchanged by manifest write.
- [ ] `validate_delivery_completion.py` READY.

**Triggered reads**
- LIVE ENV preflight fail on foreign listener: BLOCK + defect; do not weaken oracle.

## Todo T4 — RM-01/RM-02 Roadmap status

**Owns Changes**
- C04

**Goal**

Separate status commit closing RM-01 then RM-02 with split evidence refs.

**Immediate anchors**
- Managed Hermes Roadmap
- durable manifest

**Changes**
- RM-01 DONE: parent Plan + `cb562e91` + `external-artifact:docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-02-evidence.json`.
- RM-02 DONE: this Plan + RM-02 impl commit + `smc-evidence:WORK-V4.1.0-RUNTIME-RM-02@sha256:<scope-fingerprint>`.
- Validate with `validate_roadmap_v11.py --no-architecture-check`.

**Stop conditions**
- [ ] Validator PASS; status commit contains only the roadmap file.

**Triggered reads**
- If RM-01 smc-evidence binding mistakenly used: keep external-artifact; do not change validator.

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | todos completed; audit/review FRESH PASS; V01–V15 FRESH PASS; manifest FRESH | V01, V02, V03, V04, V05, V06, V07, V08, V09, V10, V11, V12, V13, V14, V15 through SMC evidence ledger plus durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | closure exists but gates pending/stale | pending ids |
| BLOCKED | ENV-02 foreign listener or installer cwd defect | blocker record |
| RETURN_PRD | product defect outside C03 or old run mutated | PRD revision request |
