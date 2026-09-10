---
name: Work v4.1.2 Managed Hermes Verification Boundary Closure
overview: Replace Windows Gateway listen-identity with Locator ProgramRoot directory-boundary ownership so managed python -m hermes_cli.main listeners become READY, while foreign processes stay CONFLICT and Work still never starts or kills Gateway.
todos:
  - id: t1-programroot-listen-ownership
    content: "T1 — ProgramRoot listen-match and probe fields [C01, C02, C03, C06]"
    status: completed
  - id: t2-lat-programroot-contract
    content: "T2 — LAT ProgramRoot listener contract [C04]"
    status: completed
  - id: t3-blocking-evidence
    content: "T3 — Blocking verification evidence"
    status: completed
  - id: t4-roadmap-rm-03-status
    content: "T4 — RM-03 Roadmap status"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: WORK-V4.1.0-RUNTIME-RM-03
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-MANAGED-HERMES-RUNTIME-V4.1.0@v1.2.2/RM-03 + user-input:2026-09-10-v4.1.2-programroot-ownership
grounded_commit: f08773030dfa0313519fa4223c48c9667b5d6d63
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# Work v4.1.2 Managed Hermes Verification Boundary Closure Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.1.2-managed-hermes-verification-boundary-closure.md)

## Scope

- In: Windows listen-identity uses Locator ProgramRoot directory boundary (C01 table); stop using CommandLine/`hermes.exe` tokens for ownership; map `runtimeContextVerified` and add probe `listenerOwnership`/`listenerExecutable`; LAT Gateway probe text; blocking LOCAL+LIVE proof; separate Roadmap RM-03 DONE after evidence.
- Out: Hermes Installer/OPSI/Gateway lifecycle; Work CLI owner change; new Adapter or `managed-local-v2`; RM-01 deletion replay; Skill Registry; Renderer must display new fields; AND with parent AC-21 / RM-02 AC-05.
- Production Owner: existing Gateway listen inspect + `LegacyLocalRuntimeAdapter` Probe. ProgramRoot SOT remains `getHermesProgramRoot()`. OPSI/Installer owns Gateway process.
- Grounding boundary: committed baseline `f08773030dfa0313519fa4223c48c9667b5d6d63`. Ambient `install.log` and untracked `reports/` stay byte-stable and out of this Plan write set.
- Todo completion convention: T1 writes production+unit; T2 writes LAT; T3/T4 are delivery-orchestrated (evidence then Roadmap status).

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/runtime/gateway-probe.ts#isManagedHermesGatewayProcess` | match CLI path or `{installRoot}/python/python.exe` plus CommandLine CLI+gateway+run; live `-m hermes_cli.main` mismatches | `isManagedHermesGatewayProcess`; `inspectGatewayListener`; `normalizeExecutablePath` | `legacy-local-runtime-adapter.ts#probeLocal` passes `getHermesCliPath()` | rewrite existing helper to ProgramRoot descendant; keep PowerShell inspect; no new Adapter | PASS |
| C02 | `apps/work/src/main/runtime/gateway-probe.ts#isManagedHermesGatewayProcess` | CommandLine tokens are required for python listeners; `missing_command_line` inspect_failed | same symbol CommandLine branch | `inspectGatewayListener` evaluation loop | REMOVE_ONLY those tokens; OS still may capture CommandLine but ownership ignores it | PASS |
| C03 | `apps/work/src/shared/runtime/runtime-contract.ts#HermesRuntimeProbe` | comment/semantic = matched managed CLI; flag set only on inspect `match` | `runtimeContextVerified` | `probeLocal` match/fail returns | MODIFY meaning in existing optional field | PASS |
| C04 | `apps/work/lat.md/runtime-connection.md` | Gateway probe section requires managed `hermes.exe` listen | file-level LAT node | `lat check` | edit existing section; no new LAT topic | PASS |
| C06 | `apps/work/src/shared/runtime/runtime-contract.ts#HermesRuntimeProbe` | no `listenerOwnership` / `listenerExecutable` | interface fields | `fail` / ready return in `probeLocal` | ADD optional fields on existing probe type; not a new protocol | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | Windows 托管、health 成功、auth 成功、存在 ≥1 个监听且全部 in-boundary（含 ProgramRoot 内 python.exe，即使 CommandLine 为 -m hermescli.main gateway run 且不含 hermes.exe；PID 个数不否决）→ Probe state=ready 且 runtimeContextVerified=true 且 listenerOwnership=managed。Work 不 start/stop/kill Gateway。 | BEHAVIOR | C01, C02, C03, C06 | T1 | V01 | UNIT | yes |
| AC-02 | AC | 同上前置，监听映像为 ProgramRoot 内 hermes.exe → READY（listenerOwnership=managed）。 | BEHAVIOR | C01 | T1 | V02 | UNIT | yes |
| AC-03 | AC | 检查成功且恰好一个监听、映像 not in-boundary（含用户 AppData hermes、系统 Python、其它 Program Files 应用）→ state=conflict，runtimeContextVerified=false，listenerOwnership=foreign，Probe 带上实际 listenerExecutable；进程 PID 不变。 | BEHAVIOR | C01, C03, C06 | T1 | V02 | UNIT | yes |
| AC-04 | AC | 行 3–5：多个监听且并非全部 in-boundary、听口检查失败、或无本地监听 → configurationerror（或等价非 READY），不是 ready，也不是行 2 的 conflict；runtimeContextVerified 不为真；listenerOwnership 不得为 managed。 | BEHAVIOR | C01, C03, C06 | T1 | V02 | UNIT | yes |
| AC-05 | AC | ProgramRoot 前缀不得把兄弟目录判为 managed（Hermes vs HermesExtra / Hermes-evil）。 | SECURITY | C01 | T1 | V01 | UNIT | yes |
| AC-06 | AC | 管理 CLI 路径合同不变：profile/skill/mcp/doctor 等仍经绝对路径 hermes.exe，不改为 python module。 | SCOPE | C05 | T3 | V05 | UNIT | yes |
| AC-07 | AC | Work 生产路径仍不 spawn/kill Gateway；conflict 文案不得指示用户或 Work 去 stop 该监听进程。 | NEGATIVE | C01, C05 | T1, T3 | V02, V06 | UNIT | yes |
| AC-08 | AC | LAT Gateway probe 描述所有权边界为 managed ProgramRoot，不再要求「managed hermes.exe listener」。 | CONTRACT | C04 | T2 | V03 | DOCUMENT_SEMANTIC | yes |
| AC-09 | AC | runtimeContract 仍为 managed-local-v1；不新增 Adapter。 | SCOPE | C05 | T3 | V07 | DIFF_SCOPE | yes |
| AC-10 | AC | Windows 托管真机：在 Gateway 已由 OPSI/Installer 拉起、health+auth 已成功的现网形态下，Runtime Probe 达到 READY（阻断 LIVE）。Foreign 占用配置端口（恰好一个越界监听）仍 CONFLICT。 | BEHAVIOR | C01, C03, C06 | T1, T3 | V04 | REAL_PROCESS | yes |
| AC-11 | AC | 同上前置（health+auth 成功），监听映像为 ProgramRoot 内 node.exe → READY（listenerOwnership=managed）。 | BEHAVIOR | C01, C06 | T1 | V01 | UNIT | yes |
| DOD-01 | DOD | AC-01 through AC-11 blocking Acceptance Claims PASS；不得把现网 CONFLICT 改写成 observation 后 closure。 | EVIDENCE | C01, C02, C03, C04, C06 | T1, T2, T3 | V08 | DIFF_SCOPE | yes |
| DOD-02 | DOD | 除 C01–C04 与 C06 外无无关生产扩张；不重开 Self-Install / Gateway supervisor。 | SCOPE | C01, C02, C03, C04, C06 | T1, T2 | V08 | DIFF_SCOPE | yes |
| DOD-03 | DOD | Implementation commit 不含 Runtime Roadmap DONE；Roadmap 状态在证据之后独立更新。 | OPERATIONS | C04 | T4 | V08 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Windows Probe after health+auth | AC-01, AC-02, AC-03, AC-04, AC-10, AC-11 | `LegacyLocalRuntimeAdapter.probe` / `probeLocal` | `gateway_unreachable` / `gateway_auth_failed` / `conflict` / `configuration_error` | `probeLocal` maps C01 row 1 to `ready` | same Probe owner; never kill PID | V01, V02, V04, V06 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Listen ownership | AC-01, AC-03, AC-04, AC-05, AC-11 | read-only OS OwningProcess ExecutablePath | `GatewayListenInspectResult` plus probe `listenerOwnership`/`listenerExecutable` | `probeLocal` | C01 rows 1–5 | `gateway-probe.ts` | row1 ready; row2 conflict; row3–5 configuration_error | probe retry idempotent; no PID signal | V01, V02, V04 |
| LAT contract | AC-08 | `runtime-connection.md` Gateway probe section | wiki text | `lat check` | ProgramRoot boundary; no managed hermes.exe listener requirement | LAT owner T2 | stale hermes.exe wording fails V03 | docs commit with T2 | V03 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | ProgramRoot python `-m hermes_cli.main gateway run` → READY | yes | RM-02 AC-05 / HEAD rejects missing CLI path token; live CONFLICT | FAILED | NEW_EVIDENCE | old oracle vs process tree | V01 |
| CLM-02 | AC-02 | ProgramRoot hermes.exe listener → READY | yes | RM-02 hermes.exe direct match | PASS | TARGETED_RERUN | identity input is ProgramRoot not CLI path | V02 |
| CLM-03 | AC-03 | exactly one out-of-boundary listener → conflict, no kill | yes | RM-02 single foreign CONFLICT | PASS | TARGETED_RERUN | match input changed to ProgramRoot; C01 row 2 | V02 |
| CLM-04 | AC-04 | C01 rows 3–5 not ready | yes | RM-02 inspect_failed / no_listener / mixed_listeners | PASS | TARGETED_RERUN | mixed vs single-foreign split | V02 |
| CLM-05 | AC-05 | sibling prefix Hermes vs HermesExtra fail-closed | yes | none | NOT_TESTED | NEW_EVIDENCE | new boundary rule | V01 |
| CLM-06 | AC-06 | CLI remains absolute hermes.exe | yes | RM-01 `hermes-cli-runner` / path immutability | PASS | REUSE_EVIDENCE | - | V05 |
| CLM-07 | AC-07 | no spawn/kill; conflict does not instruct stop | yes | RM-01/RM-02 guards + IPC refuse | PASS | REUSE_EVIDENCE | - | V06 |
| CLM-08 | AC-08 | LAT ProgramRoot wording | yes | `runtime-connection.md` still says hermes.exe listener | FAILED | NEW_EVIDENCE | contract text | V03 |
| CLM-09 | AC-09 | no new Adapter; managed-local-v1 | yes | `check:runtime-adapter-contract` | PASS | REUSE_EVIDENCE | - | V07 |
| CLM-10 | AC-10 | hosted Work Probe READY | yes | live health/auth PASS, Probe CONFLICT | FAILED | NEW_EVIDENCE | this residual gap | V04 |
| CLM-11 | AC-11 | ProgramRoot node.exe → READY | yes | none | NOT_TESTED | NEW_EVIDENCE | new legal class | V01 |
| CLM-12 | DOD-01 | blocking claims PASS; live FAIL not rewritten | yes | none | NOT_TESTED | NEW_EVIDENCE | new item | V08 |
| CLM-13 | DOD-02 | only C01–C04 and C06 production delta | yes | none | NOT_TESTED | NEW_EVIDENCE | scope | V08 |
| CLM-14 | DOD-03 | impl commit has no Roadmap DONE | yes | none | NOT_TESTED | NEW_EVIDENCE | status commit split | V08 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|
| SCN-01 | CLM-10 | V04 | Work + OPSI-managed Gateway on 127.0.0.1:8642 | Work local Probe; Gateway /health | health 200; auth ok; listener under Locator ProgramRoot | probe local runtime until Connection Ready | Probe `state=ready`, `runtimeContextVerified=true`, `listenerOwnership=managed`; Work did not start/stop Gateway | ENV-02 |

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|
| ENV-01 | - | `node -v` | - | LOCAL_WORKTREE | - |
| ENV-02 | - | `python -c "import pathlib,urllib.request; urllib.request.urlopen('http://127.0.0.1:8642/health', timeout=3); assert pathlib.Path(r'D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe').exists(); assert pathlib.Path(r'D:\\Programs\\SMC\\Hermes\\python\\python.exe').exists()"` | - | COMMAND | `python -c "import json; from pathlib import Path; print(json.loads(Path('.smc/runs/WORK-V4.1.0-RUNTIME-RM-03/verification-candidate.json').read_text(encoding='utf-8'))['candidate_id'])"` |

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01, CLM-05, CLM-11 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/runtime/gateway-probe.test.ts tests/runtime-adapter.test.ts --pool=threads --maxWorkers=1', shell=True))"` | python `-m hermes_cli.main` in-boundary ready; node.exe in-boundary ready; HermesExtra sibling not managed | CommandLine without hermes.exe must not veto in-boundary python | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V02 | CLM-02, CLM-03, CLM-04 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/runtime/gateway-probe.test.ts tests/runtime-adapter.test.ts --pool=threads --maxWorkers=1', shell=True))"` | hermes.exe in-boundary ready; single foreign conflict+executable; rows 3–5 configuration_error not conflict | no PID kill; listenerOwnership not managed on rows 3–5 | LOCAL_TRANSIENT | ENV-01 | TARGETED_RERUN | yes |
| V03 | CLM-08 | DOCUMENT_SEMANTIC | LOCAL | `python -c "import subprocess,sys; from pathlib import Path; lat=subprocess.call('lat check', cwd='apps/work', shell=True); txt=Path('apps/work/lat.md/runtime-connection.md').read_text(encoding='utf-8'); ok=('ProgramRoot' in txt or 'program root' in txt.lower()) and 'managed hermes.exe' not in txt.lower(); sys.exit(0 if lat==0 and ok else 1)"` | lat PASS; ProgramRoot ownership; no managed hermes.exe listener requirement | old CLI-path listen wording gone | LOCAL_TRANSIENT | ENV-01 | NEW_EVIDENCE | yes |
| V04 | CLM-10 | LIVE | LIVE | `python .smc/runs/WORK-V4.1.0-RUNTIME-RM-03/live_verify.py V04` | Work Probe ready + managed ownership on hosted Gateway | Work did not spawn/kill; health-only is not sufficient without listen row 1 | LOCAL_TRANSIENT | ENV-02 | NEW_EVIDENCE | yes |
| V05 | CLM-06 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run tests/hermes-path-immutability.test.ts --pool=threads --maxWorkers=1', shell=True))"` | CLI absolute hermes.exe | no python -m hermes_cli in Work production CLI | LOCAL_TRANSIENT | ENV-01 | REUSE_EVIDENCE | yes |
| V06 | CLM-07 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run check:no-work-gateway-spawn', shell=True))"` | spawn guard PASS | conflict message must not tell Work/user to stop the process (covered with V02 adapter oracle) | LOCAL_TRANSIENT | ENV-01 | REUSE_EVIDENCE | yes |
| V07 | CLM-09 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work run check:runtime-adapter-contract', shell=True))"` | adapter freeze PASS; production still legacy-local / managed-local-v1 | no second Adapter | LOCAL_TRANSIENT | ENV-01 | REUSE_EVIDENCE | yes |
| V08 | CLM-12, CLM-13, CLM-14 | STATIC | LOCAL | `python -c "import subprocess,sys; from pathlib import Path; plan='.cursor/plans/work-v4.1.2-managed-hermes-verification-boundary-closure.plan.md'; ok=subprocess.call([sys.executable,'.agents/skills/smc-plan-delivery/scripts/completion_audit.py','check','--plan',plan])==0; ok=ok and subprocess.call([sys.executable,'.agents/skills/smc-plan-delivery/scripts/review_record.py','check','--plan',plan,'--kind','implementation'])==0; sys.exit(0 if ok else 1)"` | audit+implementation review FRESH PASS; impl commit excludes Roadmap DONE | extra production files fail review | REPO_SUMMARY | ENV-01 | NEW_EVIDENCE | yes |

## Immediate Read

- `apps/work/src/main/runtime/gateway-probe.ts`
- `apps/work/src/main/runtime/gateway-probe.test.ts`
- `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts`
- `apps/work/src/shared/runtime/runtime-contract.ts`
- `apps/work/src/main/runtime/hermes-runtime-config.ts#getHermesProgramRoot`
- `apps/work/lat.md/runtime-connection.md`
- `docs/work/PRD-WORK-v4.1.2-managed-hermes-verification-boundary-closure.md` C01 table

## Triggered Read

- If LIVE listener executable is outside Locator ProgramRoot: BLOCK + endpoint/Installer defect; do not fail-open.
- If LIVE listener is in-boundary but Probe still CONFLICT: implementation defect in T1, not a new Adapter.
- If install layout needs CommandLine tokens again: RETURN_PRD; do not AND parent AC-21.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/runtime/gateway-probe.ts#isManagedHermesGatewayProcess` | PROD | MODIFY | gateway-probe | T1 | in-boundary = ProgramRoot or ProgramRoot+separator prefix; C01 listener table | Windows listen-match identity | no |
| C01 | `apps/work/src/main/runtime/gateway-probe.ts#inspectGatewayListener` | PROD | MODIFY | gateway-probe | T1 | second argument is ProgramRoot; apply C01 rows including multi-listener | Windows listen-match identity | no |
| C01 | `apps/work/src/main/runtime/gateway-probe.test.ts` | TEST | MODIFY | gateway-probe tests | T1 | python -m / hermes.exe / node.exe / sibling / foreign / multi not-all-in-boundary | Windows listen-match identity | no |
| C02 | `apps/work/src/main/runtime/gateway-probe.ts#isManagedHermesGatewayProcess` | PROD | REMOVE | gateway-probe | T1 | CommandLine not used for ownership; no missing_command_line veto for in-boundary python | CommandLine-as-ownership | no |
| C03 | `apps/work/src/shared/runtime/runtime-contract.ts#HermesRuntimeProbe` | PROD | MODIFY | runtime-contract | T1 | `runtimeContextVerified` true only on C01 row 1 | runtimeContextVerified semantics | no |
| C03 | `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#probeLocal` | PROD | MODIFY | LegacyLocal adapter | T1 | pass ProgramRoot into inspect; map C01 table to probe state | runtimeContextVerified semantics | no |
| C04 | `apps/work/lat.md/runtime-connection.md` | DOC | MODIFY | LAT runtime-connection | T2 | ProgramRoot listener contract | LAT Gateway probe text | no |
| C05 | `apps/work/src/main/runtime/hermes-cli-runner.ts` | PROD | KEEP | hermes-cli-runner | - | absolute hermes.exe unchanged | CLI / lifecycle KEEP | no |
| C06 | `apps/work/src/shared/runtime/runtime-contract.ts#HermesRuntimeProbe` | PROD | MODIFY | runtime-contract | T1 | optional `listenerOwnership` managed/foreign/unknown and `listenerExecutable` | Probe ownership fields | no |
| C06 | `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#fail` | PROD | MODIFY | LegacyLocal adapter | T1 | conflict message is ProgramRoot ownership, not stop-process; populate ownership fields | Probe ownership fields | no |
| C06 | `apps/work/tests/runtime-adapter.test.ts` | TEST | MODIFY | runtime-adapter tests | T1 | ready/conflict/configuration_error carry C01 ownership fields | Probe ownership fields | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `isManagedHermesGatewayProcess` is the shared identity owner; live listener is ProgramRoot python `-m hermes_cli.main` | one helper + existing inspect; no new Adapter or locator |
| C02 | REMOVE_ONLY | CommandLine token branch is the false CONFLICT | delete ownership use of CommandLine; keep OS capture if inspect still returns it |
| C03 | MODIFY_EXISTING | `runtimeContextVerified` already exists on `HermesRuntimeProbe` | change meaning and assignment only |
| C04 | MODIFY_EXISTING | `runtime-connection.md` Gateway probe section | one paragraph; no new LAT file |
| C06 | MODIFY_EXISTING | same probe interface already shipped over IPC | optional fields; Renderer display out of scope |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01, C02, C03, C06 | `apps/work/src/main/runtime/gateway-probe.ts#isManagedHermesGatewayProcess`<br>`apps/work/src/main/runtime/gateway-probe.ts#inspectGatewayListener`<br>`apps/work/src/main/runtime/gateway-probe.test.ts`<br>`apps/work/src/shared/runtime/runtime-contract.ts#HermesRuntimeProbe`<br>`apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#probeLocal`<br>`apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#fail`<br>`apps/work/tests/runtime-adapter.test.ts` | `apps/work/src/main/runtime/hermes-runtime-config.ts#getHermesProgramRoot`<br>`apps/work/src/main/runtime/hermes-runtime-locator.ts` | - | no |
| T2 | C04 | `apps/work/lat.md/runtime-connection.md` | `apps/work/src/main/runtime/gateway-probe.ts` | T1 | no |
| T3 | - | - | `apps/work/src/main/runtime/gateway-probe.test.ts` | T1, T2 | no |
| T4 | - | - | `docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md` | T3 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/runtime/gateway-probe.ts` | T1 | identity helper and inspect share one file |
| `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts` | T1 | probeLocal and fail share one file |
| `apps/work/src/shared/runtime/runtime-contract.ts` | T1 | verified flag and ownership fields share HermesRuntimeProbe |

## Generated Outputs Ledger

| Output | Producer Todo | Kind | Consumers |
|---|---|---|---|
| `docs_agent/evidence/WORK-V4.1.0-RUNTIME-RM-03-evidence.json` | T3 | GENERATED_ENTRYPOINT | commit_guard; validate_delivery_completion; Roadmap RM-03 evidence ref; owned_control only |

## Todo T1 — ProgramRoot listen-match and probe fields

**Owns Changes**
- C01
- C02
- C03
- C06

**Goal**

Make Windows listen inspect treat Locator ProgramRoot descendants as managed, including `python -m hermes_cli.main gateway run`, without fail-opening foreign listeners or killing PIDs.

**Immediate anchors**
- `apps/work/src/main/runtime/gateway-probe.ts#isManagedHermesGatewayProcess`
- `apps/work/src/main/runtime/legacy-local-runtime-adapter.ts#probeLocal`
- Approved PRD C01 state table

**Changes**
- Identity: executable is in-boundary iff normalized path equals ProgramRoot or is prefixed by ProgramRoot plus a path separator (case-insensitive on Windows).
- `inspectGatewayListener` takes ProgramRoot, not CLI path. Apply C01 rows: all in-boundary → match; exactly one out-of-boundary → mismatch; multiple and not all in-boundary → inspect_failed (not mismatch); empty ProgramRoot → inspect_failed.
- Do not use CommandLine for ownership. Do not return `missing_command_line` for in-boundary python.
- Probe: `getHermesProgramRoot()` into inspect. Row 1 ready + `runtimeContextVerified=true` + `listenerOwnership=managed`. Row 2 conflict + foreign + `listenerExecutable`. Rows 3–5 configuration_error + unknown + verified false. Conflict copy must not instruct stopping the process.
- Replace unit cases that require hermes.exe CommandLine tokens; add python -m, node.exe, sibling prefix, single foreign, multi not-all-in-boundary.

**Stop conditions**
- [ ] V01 and V02 PASS.
- [ ] Adapter restart still refuses; no new Adapter type.

**Triggered reads**
- If ProgramRoot and CLI install-root diverge in config: still use Locator ProgramRoot (PRD SOT). Do not derive root from `dirname(hermes.exe)`.

## Todo T2 — LAT ProgramRoot listener contract

**Owns Changes**
- C04

**Goal**

LAT Gateway probe describes managed ProgramRoot ownership and stops requiring a managed hermes.exe listener.

**Immediate anchors**
- `apps/work/lat.md/runtime-connection.md` Gateway probe section

**Changes**
- Replace managed hermes.exe listener wording with ProgramRoot boundary.
- Keep: read-only inspect, no kill, health alone is not READY.

**Stop conditions**
- [ ] V03 PASS (`lat check` and wording oracle).

**Triggered reads**
- If other LAT files still freeze CLI-path listen identity: update only if they are the same contract surface; otherwise RETURN_PRD rather than silent dual oracle.

## Todo T3 — Blocking verification evidence

**Owns Changes**
- -

**Goal**

Run blocking verifications and emit owned_control Evidence Manifest without changing scope fingerprint.

**Immediate anchors**
- Verification Ledger V01–V08
- `smc-plan-delivery` evidence.py

**Changes**
- Delivery Phase 6: V01–V08 per Evidence Action (do not rerun V05–V07 if REUSE_EVIDENCE stays FRESH).
- Delivery Phase 7: `evidence.py manifest` only after audit+review FRESH PASS.
- Never list the manifest in Change Matrix planned files.
- LIVE V04 uses ENV-02; foreign live listener stays CONFLICT and does not fail-open.

**Stop conditions**
- [ ] All blocking V FRESH PASS.
- [ ] Manifest FRESH; fingerprint unchanged by manifest write.

**Triggered reads**
- LIVE preflight fail: BLOCKED, not fail-open READY.

## Todo T4 — RM-03 Roadmap status

**Owns Changes**
- -

**Goal**

Separate status commit setting Roadmap RM-03 DONE after implementation commit and durable evidence.

**Immediate anchors**
- `docs/work/ROADMAP-WORK-v4.1.0-managed-hermes-runtime-ownership.md`
- `validate_roadmap_v11.py --no-architecture-check`

**Changes**
- Delivery Phase 9 only: RM-03 DONE with this Plan, implementation commit, and `smc-evidence:WORK-V4.1.0-RUNTIME-RM-03@sha256:<scope-fingerprint>`.
- Implementation commit must not include that DONE row.

**Stop conditions**
- [ ] V08 PASS; status commit contains only the roadmap file.

**Triggered reads**
- If validator requires architecture APPROVED frontmatter: keep `--no-architecture-check` as on this Roadmap.

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | todos completed; audit/review FRESH PASS; V01–V08 FRESH PASS; blocking claims PASS; manifest FRESH | V01, V02, V03, V04, V05, V06, V07, V08 through SMC evidence ledger plus durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but gates pending/stale | pending ids |
| BLOCKED | ENV-02 missing managed Gateway or foreign-only listener | blocker record |
| RETURN_PRD | product needs CommandLine tokens or a new Adapter | PRD revision request |
