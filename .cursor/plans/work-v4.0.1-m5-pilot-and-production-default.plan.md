---
name: M5 Pilot and Production Default
overview: Add Main-local Skill Run JSONL telemetry, strip secret debug dumps, and ship the rollback handbook, release notes, and promotion-gate package. Keep HEAD production default skill-first and dual Expert/Local readers.
todos:
  - id: t1-telemetry-and-log-hygiene
    content: "T1 — Skill Run telemetry and log hygiene [C01, C04]"
    status: completed
  - id: t2-rollback-handbook-and-release-notes
    content: "T2 — Rollback handbook and release notes [C02]"
    status: completed
  - id: t3-promotion-gate-packaging
    content: "T3 — Promotion-gate evidence packaging [C06]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.4
plan_id: RM-06
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-06
grounded_commit: 464ae20cc5ea53a3e22be03616ab855e36e0d11a
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M5 Pilot and Production Default Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M5-pilot-and-production-default.md)

## Scope

- In: reuse feature-mode store, SkillRunService lifecycle, Expert reader, Local Chat, File Platform, and env-gated E2E. Add a Main Skill Run JSONL telemetry sink. Remove prompt/argument debug dumps. Add rollback handbook, release notes, and promotion-gate packaging. Prove default `skill-first` and no silent Expert fallback.
- Out: Expert default-entry removal; Approval cards; rich activity; JSON Schema forms; Attachment upload; Renderer telemetry dashboard; turning updater-log into a log bus; editing Skill Run or Expert Bundles; resubmitting failed Skill Runs as ExpertTask.
- Production Owner inherited from PRD: Work release owner owns handbook, pilot checklist, promotion package, and release notes. SkillRunService owns lifecycle event emission. feature-mode store owns new-submit routing. Renderer does not own telemetry files.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | exists at `ec41e20d`; catalog/start/accepted/reconnect/terminal/duplicate/artifact behaviour exists; no structured event sink | nested lifecycle functions inside `createSkillRunService` | `listCatalog`, `start`, `consumeSse`, `discoverArtifacts` already own those moments | `updater-log.ts` is updater-only; must not become Skill Run owner | PASS |
| C04 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | `SMC_SKILL_RUN_DEBUG=1` logs `arguments` at start | same `start` debug branch | only that debug branch prints tool arguments | keep the debug switch; strip secret fields | PASS |
| C02 | Work release docs | no rollback handbook or M5 release notes | n/a; docs missing | operators currently have only lat.md / feature-mode store comments | do not put runbook in Renderer | PASS |
| C06 | promotion evidence | fixture/live/Expert/Local suites exist but are not packaged as M5 gates | `skill-run-e2e.test.ts`, `expert-run-service.test.ts`, `chatRuns.test.ts` | existing commands already pass locally | do not add a second E2E owner | PASS |
| C03 | `apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE` | `skill-first` since `8314e5c7`; env/store rollback exists | `getSkillRunFeatureMode` | `start` rejects non-`skill-first` | keep constant; do not flip again | PASS |
| C05 | Expert and Local readers | ExpertRunService and Layout local-chat tests exist; Skill failure does not start Expert | `createExpertRunService`; `chatRuns.ts` | unauthorized e2e does not Expert-fallback | keep dual readers | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | 无 env/store 覆盖时，新 Skill 提交走 `skill-first`；`expert-compat` 与 `local-only` 下 `start` 返回 `START_DISABLED_FEATURE_MODE` 且不发 `tools/call`。 | BEHAVIOR | C03, C05 | T1 | V02, V05 | UNIT | yes |
| AC-02 | AC | Main 为每次 catalog 获取、start 尝试、accepted `run_id`、SSE reconnect、终态、同 session 重复 start、artifact discovery 成功或失败各写一条结构化事件。事件可在 `userData/logs` 的 Skill Run telemetry 文件中按事件名检索。 | BEHAVIOR | C01 | T1 | V01 | UNIT | yes |
| AC-03 | AC | 上述事件与任何 Skill Run debug 日志都不含 prompt、tool arguments、JWT、Authorization、backend origin、Result body、download token、absolute path 或 Artifact bytes。telemetry 写失败不影响 Run 生命周期。 | SECURITY | C01, C04 | T1 | V01, V03 | UNIT | yes |
| AC-04 | AC | 回滚手册说明如何切到 `expert-compat` 与 `local-only`；按手册回滚后新提交停止，已有 Skill Run continuation 与 Expert Task 仍可恢复；手册明确禁止把失败 Skill Run 改交 Expert。 | OPERATIONS | C02 | T2 | V04 | DOCUMENT_SEMANTIC | yes |
| AC-05 | AC | 内部 pilot 清单在受控 live 或等价 harness 上覆盖 Layout 技能入口、执行、取消、rehydrate 与文件使用；负向 unauthorized / unpublish / reconnect / duplicate / cancel / artifact-fail 继续由既有 fixture 证明。 | OPERATIONS | C06 | T3 | V06, V07 | INTEGRATION | yes |
| AC-06 | AC | Expert focused suite 与 Local Chat Layout tests 作为 promotion gate 通过。Skill 失败路径不创建 ExpertTask。 | NEGATIVE | C05, C06 | T3 | V05, V06 | UNIT | yes |
| AC-07 | AC | release notes 记录生产默认 `skill-first`、回滚入口和 telemetry 文件位置。不得声称 Hosted dashboard 或 Expert 入口删除已完成。 | RELEASE | C02 | T2 | V04 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | C01 与 C04 有 focused tests；C02/C06 有手册、pilot 清单、release notes 与 promotion 证据记录。C03/C05 由既有 owner 的回归覆盖。 | EVIDENCE | C01, C02, C03, C04, C05, C06 | T1, T2, T3 | V01, V02, V03, V04, V05, V06, V07 | DOCUMENT_SEMANTIC | yes |
| DOD-02 | DOD | RM-06 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 `DONE`。implementation commit 不得包含该 status 更新。 | OPERATIONS | C06 | T3 | V07 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要 Hosted metrics UI、多客户灰度系统、Approval/Attachment 或删除 Expert 入口的工作，必须返回独立 PRD / RM-07，不得混入 M5。 | SCOPE | C02, C06 | T2, T3 | V04, V07 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Skill Run telemetry | AC-02, AC-03 | catalog/start/accepted/reconnect/terminal/duplicate/artifact | pending-submit through running | SkillRunService emits event then continues existing projection writer | emit `terminal`/`artifact` failure event; do not change phase writer | V01, V03 |
| Mode rollback | AC-01, AC-04 | env or store set to `expert-compat` / `local-only` | in-flight Skill Run still tracked | feature-mode store gates new `start` | `START_DISABLED_FEATURE_MODE` before HTTP; readers keep rehydrate | V02, V04 |
| Promotion package | AC-05, AC-06, AC-07 | Work release owner runs listed suites | checklist pending until suites pass | existing E2E/Expert/Local owners | fixture negatives remain fail-closed | V05, V06, V07 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Ingress | Trust Boundary | Egress | Forbidden | Evidence IDs |
|---|---|---|---|---|---|---|
| Telemetry JSONL | AC-02, AC-03 | SkillRunService lifecycle moments | Main-only file under `userData/logs`; no IPC | JSONL event name + allow-listed fields | prompt, arguments, JWT, URL, Result body, bytes, Renderer read | V01, V03 |
| Rollback handbook | AC-04, AC-07 | operator sets env/store | mode only affects new submits | Expert/Skill readers continue | Expert resubmit of failed Skill Run; deleting continuation | V04 |
| Promotion gates | AC-05, AC-06 | listed test commands | Work harness + controlled live env | PASS logs without secrets | second E2E owner; hosted dashboard; Expert removal claim | V05, V06, V07 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-telemetry.test.ts src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | catalog/start/accepted/reconnect/terminal/duplicate-prevented/artifact events exist; start still works when telemetry write throws | events omit prompt/arguments/JWT/URL/body/bytes | LOCAL_TRANSIENT | local apps/work | yes |
| V02 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/feature-mode-store.test.ts --pool=threads --maxWorkers=1', shell=True))"` | default `skill-first`; env/store rollback to `expert-compat` and `local-only` | invalid env falls through to default | LOCAL_TRANSIENT | local apps/work | yes |
| V03 | UNIT | `python -c "from pathlib import Path; import sys; s=Path('apps/work/src/main/skill-run/skill-run-service.ts').read_text(encoding='utf-8'); ok=('SMC_SKILL_RUN_DEBUG' in s and s.count('arguments: activeRun.callArguments')==1); sys.exit(0 if ok else 1)"` | debug switch may remain; tool arguments are logged only as the Gateway call payload, not as console dump | prompt/arguments dump is gone from debug | LOCAL_TRANSIENT | local repo | yes |
| V04 | DOCUMENT | `python -c "from pathlib import Path; import sys; r=Path('docs/work/SKILL-RUN-M5-ROLLBACK.md').read_text(encoding='utf-8'); n=Path('docs/work/RELEASE-NOTES-WORK-v4.0.1-M5.md').read_text(encoding='utf-8'); ok=('expert-compat' in r and 'local-only' in r and 'Expert' in r and 'skill-first' in n and 'dashboard' in n.lower() and 'RM-07' in n); sys.exit(0 if ok else 1)"` | handbook has both rollback modes and forbids Expert resubmit; release notes record default, rollback, telemetry path, and do not claim dashboard/Expert removal | hosted UI and Expert removal stay out | LOCAL_TRANSIENT | local repo | yes |
| V05 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/expert/expert-run-service.test.ts src/renderer/src/screens/Layout/chatRuns.test.ts --pool=threads --maxWorkers=1', shell=True))"` | Expert and Local Chat focused suites pass | Skill failure still does not start Expert | LOCAL_TRANSIENT | local apps/work | yes |
| V06 | INTEGRATION | `python -c "import os,subprocess,sys; os.environ.pop('SMC_SKILL_RUN_E2E', None); sys.exit(subprocess.call('npm --prefix apps/work run test:skill-run-e2e', shell=True))"` | fixture negatives and happy path pass; live skipped | unauthorized does not Expert-fallback | LOCAL_TRANSIENT | local apps/work | yes |
| V07 | DOCUMENT | `python -c "from pathlib import Path; import sys; p=Path('docs/work/SKILL-RUN-M5-PROMOTION-GATES.md').read_text(encoding='utf-8'); r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); ok=('pilot' in p.lower() and 'unauthorized' in p and 'RM-06' in r and 'BACKLOG' in r); sys.exit(0 if ok else 1)"` | promotion doc lists pilot checklist and fixture negatives; Roadmap RM-06 still BACKLOG in the implementation tree | implementation commit must not mark RM-06 DONE | LOCAL_TRANSIENT | local repo | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M5-pilot-and-production-default.md`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`
- `apps/work/src/main/updater-log.ts`
- `apps/work/src/main/expert/expert-run-service.ts#createExpertRunService`

## Triggered Read

- If Electron `app.getPath('userData')` is unavailable in unit tests: inject a telemetry writer, do not skip events
- If JSONL rotate is needed: follow updater-log size cap, do not add a logging dependency
- Do not read Provider source, Expert start, or Renderer IPC to add a telemetry channel

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-telemetry.ts#recordSkillRunTelemetry` | PROD | ADD | Skill Run Main | T1 | JSONL sink under userData/logs; allow-listed fields only; never throw to caller | Structured Skill Run telemetry | yes |
| C01 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | SkillRunService | T1 | emit catalog/start/accepted/reconnect/terminal/duplicate-prevented/artifact | Structured Skill Run telemetry | no |
| C01 | `apps/work/src/main/skill-run/skill-run-telemetry.test.ts` | TEST | ADD | Skill Run tests | T1 | V01 event names, secret-field ban, write-failure isolation | Telemetry evidence | yes |
| C01 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | Skill Run service tests | T1 | lifecycle still passes with injected telemetry | Telemetry evidence | no |
| C01 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | work lat skill-run | T1 | document JSONL events, secret ban, production default skill-first | Skill Run documentation | no |
| C04 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | SkillRunService | T1 | debug path must not log arguments/prompt | Skill Run log hygiene | no |
| C02 | `docs/work/SKILL-RUN-M5-ROLLBACK.md` | DOC | ADD | Work release docs | T2 | three modes, rollback steps, in-flight readers, no Expert resubmit | Rollback handbook | yes |
| C02 | `docs/work/RELEASE-NOTES-WORK-v4.0.1-M5.md` | DOC | ADD | Work release docs | T2 | default skill-first, rollback entry, telemetry path; no dashboard/Expert-removal claim | Release notes | yes |
| C06 | `docs/work/SKILL-RUN-M5-PROMOTION-GATES.md` | DOC | ADD | Work release docs | T3 | pilot checklist plus exact promotion commands; RM-06 DONE stays a later status commit | Promotion-gate evidence packaging | yes |
| C03 | `apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE` | PROD | KEEP | feature-mode store | - | remains `skill-first`; env/store still roll back new submits | Production default | no |
| C05 | `apps/work/src/main/expert/expert-run-service.ts#createExpertRunService` | PROD | KEEP | Expert Run Service | - | Expert reader unchanged; Skill failure does not start Expert | Dual readers / no silent fallback | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MINIMAL_NEW | lifecycle moments already live in SkillRunService; updater-log is a different owner and would mix updater lines with Skill events | one JSONL helper plus emit calls; no Renderer channel and no logging framework |
| C02 | MINIMAL_NEW | operators have no executable rollback/release document | two docs under docs/work; do not invent a settings UI |
| C04 | MODIFY_EXISTING | the only secret dump is the debug `arguments` log in start | strip fields; keep the debug flag |
| C06 | MINIMAL_NEW | suites already exist; missing is the packaged gate list | one promotion doc pointing at existing commands; no second harness |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01, C04 | `apps/work/src/main/skill-run/skill-run-telemetry.ts#recordSkillRunTelemetry`<br>`apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-telemetry.test.ts`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/main/updater-log.ts`<br>`apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode` | - | no |
| T2 | C02 | `docs/work/SKILL-RUN-M5-ROLLBACK.md`<br>`docs/work/RELEASE-NOTES-WORK-v4.0.1-M5.md` | `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`<br>`apps/work/src/main/skill-run/skill-run-telemetry.ts#recordSkillRunTelemetry` | T1 | no |
| T3 | C06 | `docs/work/SKILL-RUN-M5-PROMOTION-GATES.md` | `apps/work/src/main/skill-run/skill-run-e2e.test.ts`<br>`apps/work/src/main/expert/expert-run-service.ts#createExpertRunService` | T1 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/skill-run/skill-run-service.ts` | T1 | telemetry emit and debug hygiene share the start/SSE/artifact paths |
| `apps/work/lat.md/skill-run.md` | T1 | single Skill Run documentation writer |

## Generated Outputs Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-telemetry.ts` | updater-log cannot own Skill Run events; SkillRunService must not grow a second logging style inline | stays Skill Run Main owner |
| C01 | `apps/work/src/main/skill-run/skill-run-telemetry.test.ts` | no existing telemetry test | stays Skill Run test owner |
| C02 | `docs/work/SKILL-RUN-M5-ROLLBACK.md` | no rollback handbook exists | Work release docs owner |
| C02 | `docs/work/RELEASE-NOTES-WORK-v4.0.1-M5.md` | no M5 release notes exist | Work release docs owner |
| C06 | `docs/work/SKILL-RUN-M5-PROMOTION-GATES.md` | promotion commands are scattered across plans | Work release docs owner; not a second E2E owner |

## Todo T1 — Skill Run telemetry and log hygiene

**Owns Changes**
- C01
- C04

**Goal**

Record allow-listed Skill Run lifecycle events in Main JSONL and stop logging tool arguments.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/updater-log.ts`

**Changes**
- Add `recordSkillRunTelemetry` that appends JSONL under `userData/logs`, mirroring updater-log size rotation without importing updater-log.
- Emit `catalog`, `start`, `accepted`, `reconnect`, `terminal`, `duplicate-prevented`, and `artifact` from existing lifecycle moments.
- Inject the writer in tests; a throwing writer must not fail `start`.
- Keep `SMC_SKILL_RUN_DEBUG` if useful, but do not log `arguments` or prompt.
- Update `lat.md/skill-run.md` for telemetry, secret ban, and production default `skill-first`.

**Stop conditions**
- [ ] events are retrievable by name
- [ ] serialized events omit prompt/arguments/JWT/URL/body/bytes
- [ ] telemetry throw does not change start result
- [ ] source no longer logs `arguments:`
- [ ] V01, V02, and V03 commands are PASS
- [ ] `lat check` in `apps/work` still passes after the lat.md edit

**Triggered reads**
- If Electron `app.getPath('userData')` is unavailable in unit tests: inject a telemetry writer, do not skip events
- If JSONL rotate is needed: follow updater-log size cap, do not add a logging dependency
- Otherwise: do not add IPC or a Renderer dashboard

## Todo T2 — Rollback handbook and release notes

**Owns Changes**
- C02

**Goal**

Give operators an executable rollback path and honest release notes for the production default.

**Immediate anchors**
- `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`

**Changes**
- Document env vs store vs default priority, the three modes, in-flight reader behaviour, and the ban on Expert resubmit.
- Release notes record `skill-first` default, rollback entry, and telemetry file location, and explicitly do not claim a hosted dashboard or Expert removal.

**Stop conditions**
- [ ] handbook contains `expert-compat` and `local-only` steps
- [ ] handbook forbids Expert resubmit
- [ ] release notes mention telemetry path and keep dashboard/Expert removal out
- [ ] V04 command is PASS

**Triggered reads**
- None unless feature-mode priority changed during T1
- Otherwise: do not add a settings UI

## Todo T3 — Promotion-gate evidence packaging

**Owns Changes**
- C06

**Goal**

Package the internal pilot checklist and existing suites as M5 promotion gates without a second harness.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-e2e.test.ts`

**Changes**
- Write a promotion-gate doc listing Layout/execute/cancel/rehydrate/files checklist and the V05/V06 commands.
- Keep RM-06 BACKLOG in this implementation tree; Roadmap DONE is a later status commit.

**Stop conditions**
- [ ] promotion doc includes pilot checklist and unauthorized/unpublish/reconnect/duplicate/cancel/artifact-fail
- [ ] Roadmap RM-06 remains BACKLOG
- [ ] V05, V06, and V07 commands are PASS

**Triggered reads**
- None unless live env is required for the checklist; then reuse existing `SMC_SKILL_RUN_E2E*` and do not log secrets
- Otherwise: do not add a second E2E file

## Verification

Run the Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts | PRD revision request |
