---
name: RM-13 Skill Run Streaming Delta Contract Import
overview: Import the released SKILL-RUN-CONTRACT v1.5.0 Bundle, pin it with a Work receipt, and add an offline v1.5 streaming-delta eligibility gate. Do not map delta into runtime or UI.
todos:
  - id: t1-import-v150-bundle-and-work-receipt
    content: "T1 — Import v1.5.0 Bundle and Work receipt [C01]"
    status: completed
  - id: t2-add-v150-streaming-delta-eligibility
    content: "T2 — Add v1.5 streaming-delta eligibility [C02]"
    status: completed
  - id: t3-prove-consumer-lock-contract-shape
    content: "T3 — Prove consumer-lock contract shape [C03]"
    status: completed
  - id: t4-document-import-only-delta-state
    content: "T4 — Document import-only delta state [C04]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: RM-13
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/AD-WORK-v4.0.1-STREAMING-DELTA@1.0.1/RM-13
grounded_commit: 6e7516bf53d9c2144453c291a8b1405d32af43a9
grounding_source: committed_baseline
working_tree_fingerprint: dirty
---

# RM-13 Skill Run Streaming Delta Contract Import Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6g-streaming-delta-contract-import.md)

## Scope

- In: import complete local Provider tag `skill-run-contract-v1.5.0` to `contracts/skill-run/v1.5.0/`; add one Work-owned receipt; add a v1.5-only contract-shape helper and focused proof; document imported-but-unmapped state.
- Out: Provider byte/checksum generation; parser/service/Gateway/IPC/Preload/shared DTO/Renderer/Chat/Session/File/Artifact changes; raw SSE transport; delta display/persistence; attachment, approval-expiry, download-by-ref, clarify response; RM-14 status changes.
- Production Owner inherited from PRD: Provider owns release bytes, schema, fixtures, manifest and checksums. Existing Work consumer-lock owns offline receipt and eligibility. RM-14 parser/service/Renderer owners do not write in this Plan.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `contracts/skill-run/v1.5.0/` | v1.2.1/v1.3.0/v1.4.0 are complete imports; v1.5.0 absent | Provider local tag resolves to `3a7fa5ac`; source is `E:/git/nodeskclaw/nodeskclaw-backend/contracts/skill-run/v1.5.0/` | C02 reads the imported directory only; no runtime caller | reuse v1.4 layout and receipt | PASS |
| C02 | `skill-run-consumer-lock.ts` | generic completeness plus v1.3/v1.4 exact-version helpers exist | add `hasSkillRunStreamingDeltaBundle()` beside exact helpers | future RM-14 is only intended consumer; this Plan does not wire one | reuse generic completeness then add structural delta checks | PASS |
| C03 | `skill-run-consumer-lock.test.ts` | tests pin v1.2.1/v1.3/v1.4 and generic P0 compatibility | add v1.5 identity, shape and negatives | direct caller of C02, preserves prior lock evidence | reuse temporary checksum tampering fixtures | PASS |
| C04 | `apps/work/lat.md/skill-run.md` | v1.2.1-v1.4 state documented; no v1.5 readiness/mapping separation | add v1.5 import-only entry | future Grounding reads LAT; runtime does not | reuse existing contract state wording | PASS |
| C05 | parser/service/IPC/Renderer and Provider assets | no delta projection/display/raw IPC exists | excluded by AD and RM-14 dependency | no change is permitted | retain all owners/bytes | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | `contracts/skill-run/v1.5.0/` 是完整 Provider v1.5.0 tag Bundle 的字节级复制；LF `SHA256SUMS` 全部验证通过。Work receipt 精确 pin `skill-run-contract-v1.5.0` 和 `3a7fa5ac32017d41f7191b8221c861b93d7e7f32`，并保留 Provider checksum source path。 | CONTRACT | C01, C03 | T1, T3 | V01, V02 | UNIT | yes |
| AC-02 | AC | `hasSkillRunStreamingDeltaBundle()` 仅在 checksum-complete v1.5.0 的 manifest 同时声明 `streamingDelta=supported`、`assistantMessageSnapshot=supported`，并存在可验证的 `assistant.delta` discriminator、`message_id`/`delta_seq`/`delta` payload 及两个 delta fixtures 时为 true。 | CONTRACT | C02, C03 | T2, T3 | V02 | UNIT | yes |
| AC-03 | AC | 任一 v1.5 asset 缺失、hash 变更、CRLF `SHA256SUMS`、capability 缺失、payload field 缺失、fixture 缺失或错误 version 时 helper false；不得降级为 generic P0 complete 的成功结论。 | NEGATIVE | C02, C03 | T2, T3 | V02 | UNIT | yes |
| AC-04 | AC | v1.2.1 继续 checksum-complete 并可满足 generic P0 gate，v1.3 approval 和 v1.4 attachment helper 保持各自 version-specific。generic P0 required paths 不含 delta files。 | CONTRACT | C02, C03 | T2, T3 | V02 | UNIT | yes |
| AC-05 | AC | 本 Item 不修改 parser/service/gateway/IPC/preload/shared Renderer DTO/Chat/Session/File/Artifact，且不引入 `assistant.delta` 的显示、持久化或 raw event transport。RM-14 保持 BACKLOG。 | SCOPE | C01, C02, C03, C04 | T1, T2, T3, T4 | V03 | DIFF_SCOPE | yes |
| AC-06 | AC | LAT 明确说明：v1.5.0 已 import、consumer lock 已能验证 streaming-delta contract readiness，但 Work 仍不消费或展示 delta，等待 RM-14。 | SCOPE | C04 | T4 | V03 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | C01–C04 are completed by a single canonical Plan, and focused consumer-lock evidence proves AC-01 through AC-04; no Provider SHA-covered byte has been altered. | EVIDENCE | C01, C02, C03, C04 | T1, T2, T3, T4 | V01, V02 | UNIT | yes |
| DOD-02 | DOD | lat check and npm run guard pass after the import and documentation update. The implementation evidence must include a static scope proof for AC-05. | EVIDENCE | C02, C03, C04 | T2, T3, T4 | V03, V04 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | RM-13 may be marked DONE only in a separate Roadmap status commit after all blocking claims are fresh PASS and durable evidence exists. This implementation Plan must not set RM-13 to DONE. | OPERATIONS | C04 | T4 | V03 | DOCUMENT_SEMANTIC | yes |
| DOD-04 | DOD | If v1.5’s published contract requires parser/service/IPC/Renderer behavior, an additional Provider field, altered Provider byte, attachment/expiry/download work, or a raw event route, return to Provider / RM-14 / Architecture rather than expanding RM-13. | SCOPE | C01, C02, C03, C04 | T1, T2, T3, T4 | V03 | DIFF_SCOPE | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Offline Bundle import | AC-01, DOD-01 | developer starts T1 from local tag | directory is untrusted until copied/checksummed | Provider SHA256SUMS plus Work receipt | mismatch stops before T2; no substitute asset | V01, V02 |
| Delta eligibility | AC-02, AC-03, AC-04 | future owner calls helper | false means unavailable for RM-14; P0 remains independent | helper returns true only for closed v1.5 input | false; no runtime request/fallback | V02 |
| Documentation/status | AC-05, AC-06, DOD-02, DOD-03 | T4 after test proof | Roadmap stays READY/PLANNED, never DONE here | LAT records import-only state | scope/doc check failure blocks completion; RM-14 stays BACKLOG | V03, V04 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Provider release to Work import | AC-01 | local immutable Provider tag | copied static Bundle plus Provider SHA256SUMS | Work contracts directory | tag, peeled commit, manifest, listed assets, LF checksum | Provider release check then Work verifier | mismatch stops import; no generated substitute | tag `skill-run-contract-v1.5.0` / `3a7fa5ac` | V01, V02 |
| Work receipt | AC-01 | T1 | non-Provider `consumer-lock.json` | Work consumer lock | contract/version/repository/tag/tag target/Provider checksum path | C03 plus generic completeness | absent/bad receipt makes incomplete | exact tag target | V02 |
| Delta eligibility | AC-02, AC-03, AC-04 | manifest/schema/fixtures | local JSON assets only | C02 helper | two capabilities, discriminator, three fields, two fixtures | Work consumer lock | false; no P0 mutation | pure read | V02 |
| Deferred consumption | AC-05, AC-06, DOD-04 | future RM-14 | none in RM-13 | no runtime consumer | none | static scope/Roadmap | return to RM-14/Provider | n/a | V03 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | v1.5 Work copy is checksum-valid and receipt pins released identity | yes | Provider local release check PASS; no Work receipt | PROVEN_BUT_AFFECTED | TARGETED_RERUN | import is new | V01, V02 |
| CLM-02 | AC-02 | helper accepts only published capability/schema/fixtures shape | yes | generic lock has no delta semantics | PROVEN_BUT_AFFECTED | TARGETED_RERUN | new capability gate | V02 |
| CLM-03 | AC-03 | tamper/CRLF/missing/unsupported inputs return false | yes | generic checksum negatives | PROVEN_BUT_AFFECTED | TARGETED_RERUN | semantic checks are new | V02 |
| CLM-04 | AC-04 | older P0/decision/attachment gates stay independent | yes | current consumer lock tests | PROVEN_BUT_AFFECTED | TARGETED_RERUN | helper must not alter prior gates | V02 |
| CLM-05 | AC-05 | scope proof finds no mapping and RM-14 stays BACKLOG | yes | approved AD/current source | PROVEN_BUT_AFFECTED | TARGETED_RERUN | import can tempt premature mapping | V03 |
| CLM-06 | AC-06 | LAT calls v1.5 import-only and names RM-14 | yes | no v1.5 LAT state | PROVEN_BUT_AFFECTED | TARGETED_RERUN | doc is new | V03 |
| CLM-07 | DOD-01 | C01-C04 have fresh Plan-owned proof | yes | no RM-13 implementation evidence | PROVEN_BUT_AFFECTED | TARGETED_RERUN | new item | V01, V02 |
| CLM-08 | DOD-02 | guard/LAT check pass after changes | yes | prior guard/LAT baseline | PROVEN_BUT_AFFECTED | TARGETED_RERUN | lock/LAT changed | V03, V04 |
| CLM-09 | DOD-03 | tree does not mark RM-13 DONE | yes | Roadmap currently READY | PROVEN_BUT_AFFECTED | TARGETED_RERUN | status rule | V03 |
| CLM-10 | DOD-04 | expansion rejected instead of added | yes | approved PRD boundary | PROVEN_BUT_AFFECTED | TARGETED_RERUN | importer remains narrow | V03 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-01, CLM-07 | CONTRACT_RELEASE | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call([sys.executable,'nodeskclaw-backend/scripts/contracts.py','check','--family','skill-run','--version','1.5.0','--release'],cwd='E:/git/nodeskclaw'))"` | Provider release check PASS for exact local v1.5 tag directory before copy | failure blocks T1; do not fetch/use SSH/fabricate Bundle | LOCAL_TRANSIENT | local Provider checkout | TARGETED_RERUN | yes |
| V02 | CLM-01, CLM-02, CLM-03, CLM-04, CLM-07 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-consumer-lock.test.ts --pool=threads --maxWorkers=1', shell=True))"` | v1.5 receipt/checksum/capability/discriminator/payload/fixtures qualify; v1.2.1/v1.3/v1.4 remain valid | identity-only v1.0, tamper, CRLF, absent capability/field/fixture, wrong version fail; generic P0 has no delta paths | LOCAL_TRANSIENT | local Work checkout | TARGETED_RERUN | yes |
| V03 | CLM-05, CLM-06, CLM-08, CLM-09, CLM-10 | DOCUMENT_SEMANTIC | LOCAL | `python -c "from pathlib import Path; import subprocess,sys; p=Path('apps/work/src/main/skill-run/skill-run-consumer-lock.ts').read_text(encoding='utf-8'); lat=Path('apps/work/lat.md/skill-run.md').read_text(encoding='utf-8'); road=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); row=next(x for x in road.splitlines() if x.startswith(chr(124)+' RM-14 ')); ok=('hasSkillRunStreamingDeltaBundle' in p and 'v1.5.0' in lat and 'RM-14' in lat and row.split(chr(124))[4].strip()=='BACKLOG' and 'skill-run-contract-parser.ts' not in p and 'skill-run-service.ts' not in p); sys.exit(0 if ok and subprocess.call('lat check',shell=True,cwd='apps/work')==0 else 1)"` | helper is lock-only, LAT says import-only/RM-14, Roadmap keeps RM-14 BACKLOG, LAT validates | no runtime mapping, raw event transport or status drift | LOCAL_TRANSIENT | local Work checkout | TARGETED_RERUN | yes |
| V04 | CLM-08 | UNIT | LOCAL | `npm --prefix apps/work run guard` | all Work boundary guards pass | renderer contract, gateway spawn, runtime HTTP, reference import and i18n guards remain clean | LOCAL_TRANSIENT | local Work checkout | TARGETED_RERUN | yes |

## Immediate Read

- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts`
- `apps/work/lat.md/skill-run.md`
- `contracts/skill-run/v1.4.0/consumer-lock.json`
- `E:/git/nodeskclaw/nodeskclaw-backend/contracts/skill-run/v1.5.0/manifest.json`
- `E:/git/nodeskclaw/nodeskclaw-backend/contracts/skill-run/v1.5.0/events/run-event.schema.json`

## Triggered Read

- If C02 needs payload reference resolution: read only the referenced SHA-covered v1.5 schema; never Provider source.
- If pinned local tag cannot resolve: stop and return to Provider; do not use network Git.
- If runtime behavior becomes necessary: stop and open RM-14 grounding; do not add runtime code here.

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `contracts/skill-run/v1.5.0/consumer-lock.json` | CONFIG | ADD | Work contract package | T1 | receipt for complete Provider v1.5 import | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/SHA256SUMS` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/RELEASE.md` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/capabilities/unsupported.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/events/run-event.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-already-terminal.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-decision-allow.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-decision-conflict.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-decision-deny.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-decision-replay.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-unauthorized.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-unknown-id.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/artifact-with-checksum.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-expired.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-ref-invalid.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-scan-blocked.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-scope-denied.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-upload-accepted.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/auth-tenant-denial.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/idempotency-replay.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-cancelled.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-approval-requested.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-artifact-persisted.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-assistant-delta.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-assistant-message.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-clarify-requested.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-control-created.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-control-progress.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-reasoning-summary.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-tool-call.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-timeout.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/skill-tools-list.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/sse-assistant-delta-replay.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/sse-resume-duplicate.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/tools-call-accepted.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/tools-call-attachment-binding.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/fixtures/unsupported-capabilities.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/http/endpoint-matrix.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/manifest.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/mcp/json-rpc-error.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/mcp/skill-tool-annotations.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/mcp/tools-call.request.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/mcp/tools-call.response.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/mcp/tools-list.request.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/mcp/tools-list.response.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/runs/approval-decision.request.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/runs/approval-decision.response.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/runs/artifact-descriptor.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/runs/artifact-download.response.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/runs/artifact-list.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/runs/attachment-error.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/runs/attachment-upload.response.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/runs/public-run.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C01 | `contracts/skill-run/v1.5.0/runs/result.schema.json` | CONFIG | ADD | Provider release bytes | T1 | immutable Provider v1.5.0 tag asset copy | Provider Bundle and Work receipt | yes |
| C02 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts` | PROD | MODIFY | Work consumer-lock | T2 | exact v1.5 structural eligibility | streaming-delta eligibility | no |
| C03 | `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts` | TEST | MODIFY | Work consumer-lock tests | T3 | identity/shape/negative/compat proof | consumer-lock focused tests | no |
| C04 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | Work LAT | T4 | import-only v1.5/RM-14 state | architecture documentation | no |


## Domain Activation Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C01 | `contracts/skill-run/v1.5.0/consumer-lock.json` | Work needs an offline tag receipt; Provider checksum-covered assets cannot contain it. | Extends existing Work consumer-lock receipt pattern; does not create a runtime owner. |
| C01 | `contracts/skill-run/v1.5.0/SHA256SUMS` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/RELEASE.md` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/capabilities/unsupported.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/events/run-event.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-already-terminal.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-decision-allow.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-decision-conflict.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-decision-deny.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-decision-replay.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-unauthorized.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/approval-unknown-id.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/artifact-with-checksum.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-expired.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-ref-invalid.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-scan-blocked.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-scope-denied.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/attachment-upload-accepted.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/auth-tenant-denial.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/idempotency-replay.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-cancelled.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-approval-requested.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-artifact-persisted.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-assistant-delta.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-assistant-message.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-clarify-requested.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-control-created.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-control-progress.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-reasoning-summary.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-event-tool-call.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/run-timeout.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/skill-tools-list.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/sse-assistant-delta-replay.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/sse-resume-duplicate.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/tools-call-accepted.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/tools-call-attachment-binding.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/fixtures/unsupported-capabilities.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/http/endpoint-matrix.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/manifest.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/mcp/json-rpc-error.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/mcp/skill-tool-annotations.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/mcp/tools-call.request.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/mcp/tools-call.response.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/mcp/tools-list.request.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/mcp/tools-list.response.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/runs/approval-decision.request.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/runs/approval-decision.response.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/runs/artifact-descriptor.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/runs/artifact-download.response.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/runs/artifact-list.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/runs/attachment-error.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/runs/attachment-upload.response.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/runs/public-run.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |
| C01 | `contracts/skill-run/v1.5.0/runs/result.schema.json` | Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete. | Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes. |


## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MINIMAL_NEW | v1.4 established bundle-plus-receipt layout; Provider release check passed locally. | Offline contract needs immutable input, not another schema author/network dependency. |
| C02 | MODIFY_EXISTING | v1.3 decision/v1.4 attachment already split P1 eligibility from generic P0. | One predicate makes RM-14 input strict without broad impact. |
| C03 | MODIFY_EXISTING | Existing suite covers receipt, checksums and older versions. | No live harness is required for offline contract eligibility. |
| C04 | MODIFY_EXISTING | Work AGENTS requires LAT update after architecture change. | Smallest truthful status statement. |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `contracts/skill-run/v1.5.0/consumer-lock.json`<br>`contracts/skill-run/v1.5.0/SHA256SUMS`<br>`contracts/skill-run/v1.5.0/RELEASE.md`<br>`contracts/skill-run/v1.5.0/capabilities/unsupported.schema.json`<br>`contracts/skill-run/v1.5.0/events/run-event.schema.json`<br>`contracts/skill-run/v1.5.0/fixtures/approval-already-terminal.json`<br>`contracts/skill-run/v1.5.0/fixtures/approval-decision-allow.json`<br>`contracts/skill-run/v1.5.0/fixtures/approval-decision-conflict.json`<br>`contracts/skill-run/v1.5.0/fixtures/approval-decision-deny.json`<br>`contracts/skill-run/v1.5.0/fixtures/approval-decision-replay.json`<br>`contracts/skill-run/v1.5.0/fixtures/approval-unauthorized.json`<br>`contracts/skill-run/v1.5.0/fixtures/approval-unknown-id.json`<br>`contracts/skill-run/v1.5.0/fixtures/artifact-with-checksum.json`<br>`contracts/skill-run/v1.5.0/fixtures/attachment-expired.json`<br>`contracts/skill-run/v1.5.0/fixtures/attachment-ref-invalid.json`<br>`contracts/skill-run/v1.5.0/fixtures/attachment-scan-blocked.json`<br>`contracts/skill-run/v1.5.0/fixtures/attachment-scope-denied.json`<br>`contracts/skill-run/v1.5.0/fixtures/attachment-upload-accepted.json`<br>`contracts/skill-run/v1.5.0/fixtures/auth-tenant-denial.json`<br>`contracts/skill-run/v1.5.0/fixtures/idempotency-replay.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-cancelled.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-event-approval-requested.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-event-artifact-persisted.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-event-assistant-delta.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-event-assistant-message.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-event-clarify-requested.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-event-control-created.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-event-control-progress.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-event-reasoning-summary.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-event-tool-call.json`<br>`contracts/skill-run/v1.5.0/fixtures/run-timeout.json`<br>`contracts/skill-run/v1.5.0/fixtures/skill-tools-list.json`<br>`contracts/skill-run/v1.5.0/fixtures/sse-assistant-delta-replay.json`<br>`contracts/skill-run/v1.5.0/fixtures/sse-resume-duplicate.json`<br>`contracts/skill-run/v1.5.0/fixtures/tools-call-accepted.json`<br>`contracts/skill-run/v1.5.0/fixtures/tools-call-attachment-binding.json`<br>`contracts/skill-run/v1.5.0/fixtures/unsupported-capabilities.json`<br>`contracts/skill-run/v1.5.0/http/endpoint-matrix.json`<br>`contracts/skill-run/v1.5.0/manifest.json`<br>`contracts/skill-run/v1.5.0/mcp/json-rpc-error.schema.json`<br>`contracts/skill-run/v1.5.0/mcp/skill-tool-annotations.schema.json`<br>`contracts/skill-run/v1.5.0/mcp/tools-call.request.schema.json`<br>`contracts/skill-run/v1.5.0/mcp/tools-call.response.schema.json`<br>`contracts/skill-run/v1.5.0/mcp/tools-list.request.schema.json`<br>`contracts/skill-run/v1.5.0/mcp/tools-list.response.schema.json`<br>`contracts/skill-run/v1.5.0/runs/approval-decision.request.schema.json`<br>`contracts/skill-run/v1.5.0/runs/approval-decision.response.schema.json`<br>`contracts/skill-run/v1.5.0/runs/artifact-descriptor.schema.json`<br>`contracts/skill-run/v1.5.0/runs/artifact-download.response.schema.json`<br>`contracts/skill-run/v1.5.0/runs/artifact-list.schema.json`<br>`contracts/skill-run/v1.5.0/runs/attachment-error.schema.json`<br>`contracts/skill-run/v1.5.0/runs/attachment-upload.response.schema.json`<br>`contracts/skill-run/v1.5.0/runs/public-run.schema.json`<br>`contracts/skill-run/v1.5.0/runs/result.schema.json` | local Provider tag; v1.4 receipt layout | - | no |
| T2 | C02 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts` | T1 manifest/schema/fixtures; existing helper | T1 | no |
| T3 | C03 | `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts` | T1 receipt/assets; T2 helper; existing tests | T1, T2 | no |
| T4 | C04 | `apps/work/lat.md/skill-run.md` | T1 contract; T2 semantics; Roadmap/AD | T1, T2, T3 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/skill-run/skill-run-consumer-lock.ts` | T2 | `REQUIRED_BUNDLE_PATHS` is a P0 compatibility boundary; T2 must not add delta assets. |
| `contracts/skill-run/v1.5.0/consumer-lock.json` | T1 | It is the sole Work-owned C01 file and must remain outside Provider checksum coverage. |

## Generated Outputs Ledger

| Source Change | Generator / Owner | Output | Reproduction / Validation | Mutable by Work? |
|---|---|---|---|---|
| C01 | Provider release `skill-run-contract-v1.5.0` | all files covered by `contracts/skill-run/v1.5.0/SHA256SUMS` | V01 and V02 | no |
| C01 | Work consumer-lock | `contracts/skill-run/v1.5.0/consumer-lock.json` | V02 receipt/completeness tests | yes, receipt only |

## Todo T1 — Import v1.5.0 Bundle and Work receipt

**Owns Changes**
- C01

**Goal**

Make the published v1.5 contract available offline without changing Provider-owned bytes.

**Immediate anchors**
- `E:/git/nodeskclaw/nodeskclaw-backend/contracts/skill-run/v1.5.0/`
- `contracts/skill-run/v1.4.0/consumer-lock.json`

**Changes**
- Copy the complete directory from the checked local tag to `contracts/skill-run/v1.5.0/`; preserve names, bytes and LF `SHA256SUMS`.
- Before copying, verify tag target is `3a7fa5ac32017d41f7191b8221c861b93d7e7f32`; use tag tree, not mutable worktree/untracked content.
- Add only `consumer-lock.json` with `contractName: SKILL-RUN-CONTRACT`, `contractVersion: 1.5.0`, `providerRepository: loudon84/nodeskclaw`, `tagName: skill-run-contract-v1.5.0`, `tagTargetCommit: 3a7fa5ac32017d41f7191b8221c861b93d7e7f32`, `providerSha256sumsPath: nodeskclaw-backend/contracts/skill-run/v1.5.0/SHA256SUMS`, `sha256sumsPath: SHA256SUMS`.
- Do not alter manifest `releaseCommit`, regenerate/appended checksum, or access GitHub/SSH.

**Stop conditions**
- [ ] V01 PASS before copy.
- [ ] tag target equals pinned commit.
- [ ] Provider SHA-covered assets are unchanged.

**Triggered reads**
- If tag differs or source has untracked extras: stop and return to Provider; import only the tag tree.

## Todo T2 — Add v1.5 streaming-delta eligibility

**Owns Changes**
- C02

**Goal**

Expose a strict offline predicate for future RM-14 without changing generic P0 start/catalog eligibility.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunAttachmentBundle`
- `contracts/skill-run/v1.5.0/manifest.json`
- `contracts/skill-run/v1.5.0/events/run-event.schema.json`

**Changes**
- Add exact-version `hasSkillRunStreamingDeltaBundle()` and call generic completeness first.
- Structurally parse manifest capabilities, the `assistant.delta` union branch and its local payload schema reference; require `message_id`, `delta_seq`, `delta` in payload `required`.
- Require checksum-listed `fixtures/run-event-assistant-delta.json` and `fixtures/sse-assistant-delta-replay.json`; return false for any parse/IO/shape error.
- Do not modify `REQUIRED_BUNDLE_PATHS`, first-complete finder, IPC exports, parser, service, Gateway or Renderer.

**Stop conditions**
- [ ] T1 complete.
- [ ] V02 PASS.
- [ ] generic P0 list is untouched.

**Triggered reads**
- If schema reference is external/unresolvable: return false and return to Provider, never accept via string search.

## Todo T3 — Prove consumer-lock contract shape

**Owns Changes**
- C03

**Goal**

Prove v1.5 is valid only as a full streaming contract while all existing gates retain behavior.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts`
- `contracts/skill-run/v1.5.0/consumer-lock.json`
- `contracts/skill-run/v1.5.0/events/run-event.schema.json`

**Changes**
- Assert receipt identity, LF SHA, generic completeness, checksum-listed delta assets, capabilities, discriminator/payload fields and helper true.
- Add temp mutations for tampered/missing listed asset, CRLF, missing/unsupported capability, missing field, missing fixture and wrong version; all must false.
- Preserve v1.0 identity negative and v1.2.1/v1.3/v1.4 positives. Assert generic P0 source has no delta paths.

**Stop conditions**
- [ ] V02 PASS.
- [ ] no live endpoint/mutable Provider branch in tests.
- [ ] unrelated user formatting changes are preserved.

**Triggered reads**
- If test needs a referenced schema: add minimal temporary checksum-valid fixture only; never change Provider assets.

## Todo T4 — Document import-only delta state

**Owns Changes**
- C04

**Goal**

Keep LAT truthful: contract ready, no token/delta product behavior until RM-14.

**Immediate anchors**
- `apps/work/lat.md/skill-run.md`
- `docs/work/AD-WORK-v4.0.1-streaming-delta.md`
- `docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md`

**Changes**
- Add M6g/v1.5 entry: complete Bundle, receipt and `hasSkillRunStreamingDeltaBundle` condition.
- State Work does not parse/project/persist/IPC/render `assistant.delta`; RM-14 is the mapping stage.
- Preserve existing v1.2.1/v1.3/v1.4 facts. Do not mark RM-13 DONE or change RM-14 BACKLOG.
- Run `lat check` from `apps/work`, then Work guard.

**Stop conditions**
- [ ] V03 PASS.
- [ ] V04 PASS.
- [ ] LAT does not claim UI/raw SSE/persistence/preview support.

**Triggered reads**
- If LAT format fails: repair only `apps/work/lat.md/skill-run.md`; if runtime behavior is needed, open RM-14 instead.

## Verification

Run all blocking ledger entries through `smc-plan-delivery/scripts/evidence.py`. V01 is local Provider-release preflight, V02 is Work contract proof, V03/V04 close scope/documentation/guard evidence; none is live runtime E2E.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos complete; completion audit and implementation review fresh PASS; all blocking verification/claims PASS; evidence manifest fresh | V01, V02, V03, V04 |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | local Provider tag/Bundle mismatches pinned release or shape is incomplete | blocker record; no substitute Bundle |
| RETURN_PRD | parser/service/IPC/Renderer mapping, Provider byte change or other feature boundary is required | RM-14/Provider/Architecture revision |
