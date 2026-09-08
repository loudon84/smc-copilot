---
name: M6c Skill Run Approval Decision
overview: Add narrow allow/deny on existing Skill Run waiting-approval using the v1.3.0 canonical decision path. Do not call the legacy approval path, Chat approval, or Attachment upload.
todos:
  - id: t1-gateway-decision-http-and-v130-gate
    content: "T1 — Gateway decision HTTP and v1.3.0 gate [C01, C05]"
    status: completed
  - id: t2-service-bind-ipc-and-receipt
    content: "T2 — Service bind IPC and receipt [C02, C03]"
    status: completed
  - id: t3-statusbar-allow-deny-controls
    content: "T3 — StatusBar allow deny controls [C04]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.4
plan_id: RM-09
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-09
grounded_commit: 44b8e2c3741cba38c862f8a28bfc625eddce5c1c
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M6c Skill Run Approval Decision Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6-approval-decision.md)

## Scope

- In: extend existing Skill Run Gateway with canonical `POST /api/v1/runs/{run_id}/approvals/{approval_id}/decision`; bind current waiting `approval_id` and a Main-owned decision idempotency key in `SkillRunService`; add one narrow `skillRun` IPC; show Allow/Deny on existing `modules/skill-run` when `waiting-approval`.
- Out: Attachment upload/refs; edits to `contracts/skill-run/v1.2.1` or v1.3.0 Provider SHA256 files; legacy `POST /approvals/{approval_id}`; `approvalExpiry`; comment UI; clarify respond; Chat `MessageRow` / `handleApprove` / `handleDeny`; Hermes Agent approval respond; new Skill Chat page; second Session/File owner.
- Production Owner inherited from PRD: Gateway owns canonical decision HTTP. SkillRunService owns current-approval bind, decision key, receipt non-terminal handling, and sanitized errors. Existing skill-run IPC/preload owns the narrow entry. Renderer `modules/skill-run` owns Allow/Deny. Backend remains enforcement owner.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | exists at `44b8e2c3`; `defaultSkillRunRoutes` has cancel/snapshot/events/artifacts; `callSkill` already forwards `idempotencyKey` through `authorizedFetch`; no `/decision` POST | `export interface SkillRunGatewayClient`; `export function createSkillRunGatewayClient`; `function defaultSkillRunRoutes` | `createSkillRunService` is the only production caller of Gateway HTTP besides Catalog | reuse `authorizedFetch` + `idempotencyKey`; POST body `{ decision }`; parse bare receipt; do not add a second HTTP client or the legacy path | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | `ActiveRun` has projection/abort/seen events; `approval.requested` already sets `waiting-approval` and `activities[].approvalId`; start uses `clientRequestId` as `tools/call` key; no decide method | `export interface SkillRunService`; `export function createSkillRunService`; `interface ActiveRun` | IPC will be the production caller; SSE/poll already maps Public status via `parseSkillRunStatusToPhase` | store a per-approval UUID key on `ActiveRun`; do not reuse the start key; do not treat a non-terminal receipt as succeeded/failed/cancelled | PASS |
| C03 | `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc` | cancel/retry validate `clientRequestId` + `sessionId`; `SKILL_RUN_IPC_CHANNELS` has no decision channel; preload `createSkillRunApi` mirrors the object | `export function registerSkillRunIpc`; `export const SKILL_RUN_IPC_CHANNELS`; `export function createSkillRunApi` | Renderer `SkillRunStatusBar` already calls `hermesAPI.skillRun.retryArtifactDiscovery` in-process; Chat only passes `onCancel` | add `DECIDE_APPROVAL`; input clientRequestId, sessionId, and decision allow or deny; Main binds approval_id; do not accept Renderer approval id, URL, or idempotency key | PASS |
| C04 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar` | waiting-approval renders approval summary and Cancel; tests assert no Approve/Deny; Chat mounts the bar and owns cancel only | `export const SkillRunStatusBar` | Chat must not gain Skill decision handlers | call `skillRun.decideApproval` like retry; English Allow/Deny; hide when `decidedApprovalId` matches; keep Cancel as cancel | PASS |
| C05 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir` | P0 completeness uses `REQUIRED_BUNDLE_PATHS` without approval schemas; `findSkillRunConsumerLockDir` returns the first complete dir; v1.2.1 and v1.3.0 both complete | `export function isCompleteSkillRunBundleDir`; `export function hasSkillRunConsumerLock` | Gateway `hasConsumerLock` opens P0; decision must fail closed without v1.3.0 | add `hasSkillRunApprovalDecisionBundle()` that only checks `contracts/skill-run/v1.3.0`; do not add approval paths to `REQUIRED_BUNDLE_PATHS` | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | 处于 waiting-approval 且 Main 持有当前 approval_id 时，现有 Skill Run UI 出现 Allow 与 Deny；非该 phase 不出现这两按钮。 | BEHAVIOR | C04 | T3 | V05 | UNIT | yes |
| AC-02 | AC | Allow：Main 对 canonical /decision 发送 decision=allow 与 X-Idempotency-Key；不调用 legacy 路径；不发第二次 tools/call。200 且 receipt 仍非终态时，projection 保持非终态并继续既有 SSE/poll。 | BEHAVIOR | C01, C02, C03 | T1, T2 | V01, V03, V04 | UNIT | yes |
| AC-03 | AC | Deny：发送 decision=deny。随后 Work 终态跟随 Public status。不出现「仅因 deny 而 cancelled」。Cancel 按钮仍走既有 cancel，不冒充 deny。 | BEHAVIOR | C01, C02, C04 | T1, T2, T3 | V03 | UNIT | yes |
| AC-04 | AC | 同一审批重复提交使用同一幂等 key，得到与首次一致的冻结 receipt，且不产生第二次决策副作用。冲突 key / 已决策 / 未知 id / unauthorized：已清洗错误，不回退终态。 | LIFECYCLE | C01, C02 | T1, T2 | V01, V03 | UNIT | yes |
| AC-05 | AC | 非 waiting-approval、缺少 approval_id、或没有 checksum-complete v1.3.0：决策被拒绝且不发 decision HTTP。 | NEGATIVE | C02, C03, C05 | T1, T2 | V02, V03, V04 | UNIT | yes |
| AC-06 | AC | Chat MessageRow Local/Hermes approve/deny 行为不变；本 Item 的决策路径不调用该 IPC。不声称 Attachment 或 clarify respond 已启用。不修改 v1.2.1 Bundle 字节。 | SCOPE | C07, C08 | T3 | V06, V09 | UNIT | yes |
| AC-07 | AC | waiting-approval 期间同 session 第二次 Skill start 仍被拒绝。Renderer 仍无法取得 raw Provider event 或决策 URL。 | LIFECYCLE | C02, C03 | T2 | V03, V04 | UNIT | yes |
| DOD-01 | DOD | C01–C05 有 Gateway / Service / IPC / Skill Run UI 的 focused 证明，并覆盖 CL-01–CL-04 与 CL-06 按钮门。C06–C08 由既有 parser、Local Chat、Bundle unsupported、start/cancel 套件回归。 | EVIDENCE | C01, C02, C03, C04, C05 | T1, T2, T3 | V01, V02, V03, V04, V05, V06 | UNIT | yes |
| DOD-02 | DOD | RM-09 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 DONE。implementation commit 不得包含该 status 更新。 | OPERATIONS | C04 | T3 | V10 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要 Attachment、改 Bundle、legacy 路径、clarify respond、Chat 审批复用或把 deny 写成 cancel 的工作，必须返回对应 Item / Provider，不得混入本 Item。 | SCOPE | C06, C07, C08 | T1, T2, T3 | V06, V09, V10 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Allow decision | AC-02, AC-04, AC-05 | existing `hermesAPI.skillRun.decideApproval` after phase `waiting-approval` | keep `waiting-approval` when receipt status is non-terminal; set `decidedApprovalId` | `createSkillRunService` `decideApproval` then existing SSE/poll | missing v1.3.0 / not waiting / missing approvalId reject before HTTP; Gateway 409/401/404 sanitized on projection; do not rewind terminal | V01, V03, V04 |
| Deny decision | AC-03, AC-04 | same IPC with `decision=deny` | non-terminal receipt stays waiting-approval; terminal Public status uses existing `parseSkillRunStatusToPhase` | same `decideApproval` writer; deny must not force `cancelled` | Cancel remains `cancel()` / `cancelRun`; deny HTTP errors sanitized | V03, V05 |
| Second start while waiting | AC-07 | existing `skillRun.start` | existing `waiting-approval` is non-terminal | none; start rejects `RUN_ALREADY_ACTIVE` | `rejectStart` before `tools/call` | V03 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Canonical decision HTTP | AC-02, AC-04, AC-05 | `createSkillRunGatewayClient` `decideApproval` | `POST /api/v1/runs/{run_id}/approvals/{approval_id}/decision`; header `X-Idempotency-Key`; body decision allow or deny; bare receipt | `createSkillRunService` `decideApproval` | `run_id`, `approval_id`, `decision`, `status`, `decided_at` | Gateway JSON + `hasSkillRunApprovalDecisionBundle` | no v1.3.0 / missing key → no fetch; 400 `IDEMPOTENCY_KEY_REQUIRED`; 409 conflict / already-decided; 401/404 sanitized | Main UUID per `(clientRequestId, approval_id)`; not `tools/call` `clientRequestId` | V01, V02, V03 |
| Narrow decision IPC | AC-01, AC-05, AC-07 | `SkillRunStatusBar` | `SKILL_RUN_IPC_CHANNELS.DECIDE_APPROVAL` (`skill-run:decide-approval`); `{ clientRequestId, sessionId, decision }` | `registerSkillRunIpc` then service | `decision` enum only `allow`/`deny`; ids trimmed length-capped | IPC then service eligibility | invalid enum / missing ids throw; not waiting → `APPROVAL_NOT_WAITING` without HTTP | same Main key on repeat invoke | V04, V05 |
| Forbidden Chat / legacy / attachment / Bundle edit | AC-06, DOD-03 | none | none | none | none | Plan forbids MessageRow handlers, legacy path string, attachment IPC, and v1.2.1 edits | tests and source grep assert absence | None | V06, V09, V10 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | Allow and Deny render only when phase is waiting-approval and Main has a current approval id; other phases have no those buttons | yes | RM-08 SkillRunStatusBar test asserted no Approve/Deny | PASS | TARGETED_RERUN | RM-09 replaces the no-button assertion with a waiting-approval-only Allow/Deny gate | V05 |
| CLM-02 | AC-02 | Allow posts canonical /decision with X-Idempotency-Key; no legacy path; no second tools/call; non-terminal receipt keeps non-terminal phase | yes | none | NOT_TESTED | NEW_EVIDENCE | v1.3.0 decision path is new | V01, V03, V04 |
| CLM-03 | AC-03 | Deny posts decision=deny; Work terminal follows Public status; deny does not force cancelled; Cancel still calls cancel | yes | none | NOT_TESTED | NEW_EVIDENCE | Bundle forbids rewriting deny as cancelled | V03 |
| CLM-04 | AC-04 | Repeat decide uses the same Main key and frozen receipt; conflict/already-decided/unknown/unauthorized are sanitized and do not rewind terminal | yes | start idempotency is a different scope | NOT_TESTED | NEW_EVIDENCE | decision key scope is run plus approval, not tools/call | V01, V03 |
| CLM-05 | AC-05 | Not waiting-approval, missing approval id, or no complete v1.3.0 bundle yields zero decision HTTP | yes | none | NOT_TESTED | NEW_EVIDENCE | new decision entry | V02, V03, V04 |
| CLM-06 | AC-06 | Skill decision does not call Chat approve/deny; MessageRow approval bar source remains; attachments stay unsupported; v1.2.1 bytes are not edited | yes | none | NOT_TESTED | NEW_EVIDENCE | Skill controls must not be wired to Chat | V06, V09 |
| CLM-07 | AC-07 | waiting-approval still returns RUN_ALREADY_ACTIVE on a second start; Renderer is not given decision URLs | yes | none | NOT_TESTED | NEW_EVIDENCE | decideApproval is a new entry beside existing start | V03, V04 |
| CLM-08 | DOD-01 | Gateway, service, IPC, and StatusBar focused tests cover allow/deny, idempotency, fail-closed, and the button gate | yes | none | NOT_TESTED | NEW_EVIDENCE | new Item proof | V01, V02, V03, V04, V06 |
| CLM-09 | DOD-02 | Roadmap RM-09 status is not DONE in the implementation tree | yes | none | NOT_TESTED | NEW_EVIDENCE | status commit is separate | V10 |
| CLM-10 | DOD-03 | No attachment upload, legacy path, Chat reuse, deny-as-cancelled mapping, or v1.2.1 edit is introduced | yes | none | NOT_TESTED | NEW_EVIDENCE | out-of-scope work must not land here | V06, V09, V10 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-02, CLM-04, CLM-08 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-gateway-client.test.ts --pool=threads --maxWorkers=1', shell=True))"` | decideApproval POSTs `/api/v1/runs/run-1/approvals/appr-1/decision` with `X-Idempotency-Key` and decision allow or deny; 200 parses receipt; same key replay does not issue a different body | no fetch when approval-decision bundle is false; path must not omit `/decision`; callSkill is not invoked | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V02 | CLM-05, CLM-08 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-consumer-lock.test.ts --pool=threads --maxWorkers=1', shell=True))"` | v1.2.1 remains a complete P0 bundle; v1.3.0 remains complete; `hasSkillRunApprovalDecisionBundle` is true only for checksum-complete v1.3.0 | identity-only v1.0.0 still fails completeness; `REQUIRED_BUNDLE_PATHS` still omits approval-decision schemas | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V03 | CLM-02, CLM-03, CLM-04, CLM-05, CLM-07, CLM-08 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | waiting-approval allow with receipt WAITING_APPROVAL keeps waiting-approval and sets decidedApprovalId; deny plus Public COMPLETED maps succeeded; deny plus FAILED maps failed; repeat decide reuses the same key; waiting-approval still rejects a second start with RUN_ALREADY_ACTIVE | running phase / missing approvalId / no v1.3.0 gate do not call gateway.decideApproval; deny does not map to cancelled unless snapshot status is cancelled; 409 already-decided does not rewind succeeded; decideApproval must not call callSkill | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V04 | CLM-02, CLM-05, CLM-07, CLM-08 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-ipc.test.ts --pool=threads --maxWorkers=1', shell=True))"` | DECIDE_APPROVAL accepts `{clientRequestId,sessionId,decision}` and forwards to service; channel key is `skill-run:decide-approval` | missing ids, non-allow/deny decision, or extra approvalId field rejected; renderer cannot pass idempotency key | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V05 | CLM-01 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | waiting-approval with approval activity shows Allow and Deny and still shows the summary; Allow invokes decideApproval with allow; Cancel still present | running/succeeded have no Allow/Deny; decidedApprovalId matching current id hides the buttons; source does not import MessageRow or ClarifyCard | LOCAL_TRANSIENT | local apps/work | TARGETED_RERUN | yes |
| V06 | CLM-06, CLM-08, CLM-10 | UNIT | LOCAL | `python -c "from pathlib import Path; import sys; sb=Path('apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx').read_text(encoding='utf-8'); row=Path('apps/work/src/renderer/src/screens/Chat/MessageRow.tsx').read_text(encoding='utf-8'); chat=Path('apps/work/src/renderer/src/screens/Chat/Chat.tsx').read_text(encoding='utf-8'); ok=('decideApproval' in sb and 'handleApprove' not in sb and 'MessageRow' not in sb and 'chat-approval-bar' in row and 'onApprove' in row and 'handleApprove' in chat and 'skillRun.decideApproval' not in chat); sys.exit(0 if ok else 1)"` | StatusBar calls skillRun.decideApproval; Chat still owns Local handleApprove; MessageRow still has the Local approval bar | StatusBar must not reference handleApprove/handleDeny or MessageRow | LOCAL_TRANSIENT | local repo | NEW_EVIDENCE | yes |
| V09 | CLM-06, CLM-10 | DOCUMENT | LOCAL | `python -c "from pathlib import Path; import sys; gw=Path('apps/work/src/main/skill-run/skill-run-gateway-client.ts').read_text(encoding='utf-8'); ch=Path('apps/work/src/shared/skill-run.ts').read_text(encoding='utf-8'); u13=Path('contracts/skill-run/v1.3.0/capabilities/unsupported.schema.json').read_text(encoding='utf-8'); u12=Path('contracts/skill-run/v1.2.1/capabilities/unsupported.schema.json').read_text(encoding='utf-8'); ok=('approvals/' in gw and '/decision' in gw and 'DECIDE_APPROVAL' in ch and 'skill-run:upload' not in ch and 'attachments' in u13 and 'unsupported' in u13 and 'approval' in u12); sys.exit(0 if ok else 1)"` | Gateway includes canonical /decision; shared IPC has DECIDE_APPROVAL and no upload channel; v1.3.0 attachments remain unsupported; v1.2.1 still lists approval unsupported | Gateway source must include /decision on the approvals route | LOCAL_TRANSIENT | local repo | NEW_EVIDENCE | yes |
| V10 | CLM-09, CLM-10 | DOCUMENT | LOCAL | `python -c "from pathlib import Path; import sys; r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); lat=Path('apps/work/lat.md/skill-run.md').read_text(encoding='utf-8'); p=chr(124); row=next(x for x in r.splitlines() if x.startswith(p+' RM-09 ')); ok=(row.split(p)[4].strip()!='DONE' and 'Allow' in lat and 'Deny' in lat and 'Attachment' in lat); sys.exit(0 if ok else 1)"` | implementation tree keeps RM-09 not DONE; lat.md documents Allow/Deny and still treats Attachment as out | implementation commit must not mark RM-09 DONE | LOCAL_TRANSIENT | local repo | NEW_EVIDENCE | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M6-approval-decision.md`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient`
- `apps/work/src/main/auth/authorized-backend-transport.ts`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunStatusToPhase`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`
- `apps/work/src/preload/skill-run-api.ts#createSkillRunApi`
- `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar`
- `contracts/skill-run/v1.3.0/http/endpoint-matrix.json`
- `contracts/skill-run/v1.3.0/runs/approval-decision.request.schema.json`
- `contracts/skill-run/v1.3.0/runs/approval-decision.response.schema.json`
- `apps/work/lat.md/skill-run.md`

## Triggered Read

- If `SkillRunApi` compile fails: update `createSkillRunApi` on the existing skill-run surface only
- If Gateway mocks fail to type-check: add `decideApproval` and `hasApprovalDecisionBundle` to `createMockGateway` in the service test file; do not create a second mock factory
- If receipt status is already a Public terminal: apply `parseSkillRunStatusToPhase` and still do not special-case deny as cancelled
- If UI wants a comment box or a third option: stop; comment and extra options are out of this Item
- If decision seems to need the legacy path because /decision 404s in a fixture: stop and keep fail-closed; do not add the legacy path
- Do not read Provider source, do not edit SHA256-covered Bundle files, do not edit Chat.tsx, do not add Attachment IPC

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient` | PROD | MODIFY | Skill Run Gateway | T1 | add `decideApproval` and `hasApprovalDecisionBundle()`; do not add a second client | Canonical decision HTTP on existing Gateway | no |
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | PROD | MODIFY | Skill Run Gateway | T1 | POST canonical `/decision` with `X-Idempotency-Key` and `{decision}`; parse bare receipt; throw `SkillRunGatewayError` with Bundle error codes | Canonical decision HTTP on existing Gateway | no |
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts` | TEST | MODIFY | Skill Run Gateway tests | T1 | allow/deny path+header+body; replay same key; no fetch without decision bundle; no legacy path | Canonical decision HTTP on existing Gateway | no |
| C05 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir` | PROD | MODIFY | Skill Run consumer lock | T1 | add `hasSkillRunApprovalDecisionBundle()` for checksum-complete v1.3.0 only; keep `REQUIRED_BUNDLE_PATHS` unchanged | v1.3.0 required for decision, v1.2.1 P0 gate preserved | no |
| C05 | `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts` | TEST | MODIFY | Skill Run consumer lock tests | T1 | v1.2.1 complete still true; approval-decision helper true only for v1.3.0 | v1.3.0 required for decision, v1.2.1 P0 gate preserved | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#SkillRunService` | PROD | MODIFY | SkillRunService | T2 | add `decideApproval` returning a cancel-like result plus projection | Current-approval bind, idempotency, receipt handling | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | SkillRunService | T2 | bind current activity `approvalId`; UUID key per approval; apply non-terminal receipt without finishing the run; map terminal receipt via existing parser | Current-approval bind, idempotency, receipt handling | no |
| C02 | `apps/work/src/shared/skill-run.ts#SkillRunProjection` | PROD | MODIFY | Skill Run DTO | T2 | optional `decidedApprovalId`; never include the idempotency key | Current-approval bind, idempotency, receipt handling | no |
| C02 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | SkillRunService tests | T2 | allow/deny/idempotency/fail-closed/deny-not-cancelled; `createMockGateway` supplies `decideApproval` | Current-approval bind, idempotency, receipt handling | no |
| C03 | `apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS` | PROD | MODIFY | Skill Run DTO | T2 | add `DECIDE_APPROVAL: "skill-run:decide-approval"` only | Narrow skill-run decision IPC | no |
| C03 | `apps/work/src/shared/skill-run.ts#SkillRunApi` | PROD | MODIFY | Skill Run DTO | T2 | add `decideApproval({ clientRequestId, sessionId, decision })`; do not accept approvalId or key | Narrow skill-run decision IPC | no |
| C03 | `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc` | PROD | MODIFY | Skill Run IPC | T2 | validate ids and allow/deny; reject extra approvalId; register and remove handler | Narrow skill-run decision IPC | no |
| C03 | `apps/work/src/preload/skill-run-api.ts#createSkillRunApi` | PROD | MODIFY | Skill Run preload | T2 | invoke `DECIDE_APPROVAL` only | Narrow skill-run decision IPC | no |
| C03 | `apps/work/src/main/skill-run/skill-run-ipc.test.ts` | TEST | MODIFY | Skill Run IPC tests | T2 | accept/reject decide payload; channel includes DECIDE_APPROVAL | Narrow skill-run decision IPC | no |
| C04 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar` | PROD | MODIFY | modules/skill-run | T3 | Allow/Deny when waiting-approval and not decided; call `skillRun.decideApproval`; keep Cancel | Allow/Deny on existing Skill Run UI | no |
| C04 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx` | TEST | MODIFY | modules/skill-run tests | T3 | button gate, invoke decideApproval, keep Cancel, no Chat imports | Allow/Deny on existing Skill Run UI | no |
| C04 | `apps/work/src/shared/i18n/locales/en/skillRun.ts` | PROD | MODIFY | Work i18n English | T3 | English-only Allow / Deny strings | Allow/Deny on existing Skill Run UI | no |
| C04 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | work lat skill-run | T3 | document M6c allow/deny; keep Attachment / legacy path / Chat approval out | Allow/Deny on existing Skill Run UI | no |
| C06 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunStatusToPhase` | PROD | KEEP | Skill Run parser | - | Public COMPLETED/FAILED/CANCELLED mapping unchanged; no deny special case | Parser activity + Public status mapping | no |
| C07 | `apps/work/src/renderer/src/screens/Chat/MessageRow.tsx` | PROD | KEEP | Chat Local approval | - | Local approval bar unchanged | Local Chat / Hermes approval | no |
| C07 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | PROD | KEEP | Chat Skill submit | - | do not add Skill decide handlers | Local Chat / Hermes approval | no |
| C08 | `contracts/skill-run/v1.2.1/capabilities/unsupported.schema.json` | PROD | KEEP | Provider Bundle | - | no v1.2.1 edit | Attachment, expiry, clarify respond, Expert, Bundle bytes | no |
| C08 | `contracts/skill-run/v1.3.0/capabilities/unsupported.schema.json` | PROD | KEEP | Provider Bundle | - | attachments remain unsupported | Attachment, expiry, clarify respond, Expert, Bundle bytes | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | Gateway already owns Skill Run HTTP and already sends `X-Idempotency-Key` on `tools/call` | Add one method on `createSkillRunGatewayClient`; reuse `authorizedFetch`; do not add a client or the legacy path |
| C02 | MODIFY_EXISTING | SkillRunService already owns run lifecycle, start keys, and status mapping | Bind `activities[].approvalId` already projected by RM-08; store a separate UUID on `ActiveRun`; reuse `parseSkillRunStatusToPhase` |
| C03 | MODIFY_EXISTING | skill-run IPC already validates sender/auth and mirrors cancel/retry | Add one channel on the existing `hermesAPI.skillRun` object; Renderer sends only run ids plus allow/deny |
| C04 | MODIFY_EXISTING | `SkillRunStatusBar` already shows approval summary and Cancel; Chat only supplies `onCancel` | Add Allow/Deny next to Cancel and invoke IPC like artifact retry; do not edit Chat.tsx |
| C05 | MODIFY_EXISTING | `isCompleteSkillRunBundleDir` already checksums listed files including v1.3.0 approval schemas | Add a v1.3.0-only helper; leave P0 `REQUIRED_BUNDLE_PATHS` and first-complete finder unchanged |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01, C05 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.test.ts`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts` | `apps/work/src/main/auth/authorized-backend-transport.ts`<br>`contracts/skill-run/v1.3.0/http/endpoint-matrix.json` | - | no |
| T2 | C02, C03 | `apps/work/src/main/skill-run/skill-run-service.ts#SkillRunService`<br>`apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/shared/skill-run.ts#SkillRunProjection`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts`<br>`apps/work/src/shared/skill-run.ts#SKILL_RUN_IPC_CHANNELS`<br>`apps/work/src/shared/skill-run.ts#SkillRunApi`<br>`apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`<br>`apps/work/src/preload/skill-run-api.ts#createSkillRunApi`<br>`apps/work/src/main/skill-run/skill-run-ipc.test.ts` | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunStatusToPhase` | T1 | no |
| T3 | C04 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx`<br>`apps/work/src/shared/i18n/locales/en/skillRun.ts`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/shared/skill-run.ts#SkillRunApi`<br>`apps/work/src/shared/skill-run.ts#SkillRunProjection` | T2 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/shared/skill-run.ts` | T2 | projection `decidedApprovalId`, DECIDE_APPROVAL channel, and SkillRunApi method share one DTO file |
| `apps/work/src/main/skill-run/skill-run-service.ts` | T2 | eligibility, key storage, receipt mapping, and start/cancel KEEP paths share `createSkillRunService` |
| `apps/work/src/main/skill-run/skill-run-gateway-client.ts` | T1 | decision POST and `hasApprovalDecisionBundle` share the existing factory |

## Generated Outputs Ledger

None

## Todo T1 — Gateway decision HTTP and v1.3.0 gate

**Owns Changes**
- C01
- C05

**Goal**

Make the existing Skill Run Gateway the only HTTP owner of canonical allow/deny, and fail closed unless checksum-complete v1.3.0 is present, without breaking the v1.2.1 P0 lock.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir`
- `apps/work/src/main/auth/authorized-backend-transport.ts`

**Changes**
- Export `hasSkillRunApprovalDecisionBundle()` that returns `isCompleteSkillRunBundleDir` of `contracts/skill-run/v1.3.0` only. Do not change `REQUIRED_BUNDLE_PATHS`. Do not change first-complete `findSkillRunConsumerLockDir`.
- Add `hasApprovalDecisionBundle()` on `SkillRunGatewayClient`, defaulting to that helper, overridable in tests like `hasConsumerLock`.
- Add `decideApproval({ runId, approvalId, decision, idempotencyKey })`. If the decision bundle is false, throw without fetch. Encode path `/api/v1/runs/{runId}/approvals/{approvalId}/decision`. POST JSON `{ decision }` where decision is only `allow` or `deny`. Pass `idempotencyKey` through existing `authorizedFetch`. Do not send `comment`.
- Parse 200 as a bare receipt requiring `run_id`, `approval_id`, `decision`, `status`, `decided_at`. Map 400/401/404/409 JSON `error_code` onto `SkillRunGatewayError`. Never POST `/api/v1/runs/{runId}/approvals/{approvalId}` without `/decision`.
- Tests: path, header, body, replay, missing bundle zero fetch, no legacy path. Lock tests: v1.2.1 still complete; helper false for v1.0.0; helper true for v1.3.0.

**Stop conditions**
- [ ] V01 PASS
- [ ] V02 PASS
- [ ] canonical path includes `/decision`
- [ ] v1.2.1 P0 completeness still passes
- [ ] no Provider Bundle file bytes changed

**Triggered reads**
- If `authorizedFetch` typing rejects body plus idempotencyKey: reuse the `callSkill` header pattern only
- Do not add approval schemas to `REQUIRED_BUNDLE_PATHS`
- Do not read Provider source

## Todo T2 — Service bind IPC and receipt

**Owns Changes**
- C02
- C03

**Goal**

Let Main bind the current waiting approval, own the decision idempotency key, interpret receipts without inventing a deny-cancelled phase, and expose one narrow skill-run IPC.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#registerSkillRunIpc`
- `apps/work/src/shared/skill-run.ts#SkillRunApi`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunStatusToPhase`

**Changes**
- Add `SkillRunDecideApprovalInput` `{ clientRequestId, sessionId, decision: "allow" | "deny" }` and a cancel-like result. Add `DECIDE_APPROVAL`. Preload forwards it. IPC validates trimmed ids (same length caps as cancel) and the enum. Reject if `approvalId` or `idempotencyKey` is present on the payload.
- `SkillRunService.decideApproval`: require matching session; require `phase === waiting-approval`; bind current `approvalId` from the latest `approval.requested` activity; require `providerRunId`; require `gateway.hasApprovalDecisionBundle()`. Otherwise return failure without HTTP (`APPROVAL_NOT_WAITING`, `APPROVAL_ID_MISSING`, `APPROVAL_DECISION_UNSUPPORTED`).
- Generate `crypto.randomUUID()` once per `(clientRequestId, approvalId)` on `ActiveRun`. Repeat clicks reuse it. Never reuse `clientRequestId` / start `tools/call` key.
- On 200: if `parseSkillRunStatusToPhase(receipt.status)` is non-terminal, keep current non-terminal phase, set `projection.decidedApprovalId`, keep SSE/poll. If terminal, apply that phase. Do not set `cancelled` because `decision === "deny"`. Do not call `callSkill`.
- On Gateway errors: sanitized `errorCode`/`errorMessage` on the projection; do not rewind an already terminal phase. Continue SSE/poll if still non-terminal.
- Do not persist the key on `SkillRunProjection` or continuation DTO (Renderer must not see it). In-process retry is enough for this Item.
- `createMockGateway` adds `decideApproval` and `hasApprovalDecisionBundle`. Tests cover allow non-terminal receipt, deny COMPLETED vs FAILED, key reuse, ineligible zero HTTP, 409 already-decided, and RUN_ALREADY_ACTIVE still blocking start.

**Stop conditions**
- [ ] V03 PASS
- [ ] V04 PASS
- [ ] deny does not force cancelled
- [ ] Renderer cannot supply approvalId or the idempotency key
- [ ] no second tools/call from decideApproval

**Triggered reads**
- If receipt status is already terminal: use `parseSkillRunStatusToPhase`; still no deny special case
- If mocks fail to type-check: add the two Gateway methods in this test file only
- Do not edit Chat.tsx or parser status mapping except by calling it
- Do not add comment on the request body

## Todo T3 — StatusBar allow deny controls

**Owns Changes**
- C04

**Goal**

Show English Allow and Deny on the existing Skill Run status bar only while waiting for approval, invoke the new IPC, and document the boundary in lat.md.

**Immediate anchors**
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx#SkillRunStatusBar`
- `apps/work/src/shared/skill-run.ts#SkillRunProjection`
- `apps/work/src/shared/i18n/locales/en/skillRun.ts`

**Changes**
- When `phase === waiting-approval`, an `approval.requested` activity has `approvalId`, and `decidedApprovalId` is not that id, render Allow and Deny. Labels from English i18n. Do not render a comment field or a third option.
- Clicks call `window.hermesAPI.skillRun.decideApproval({ clientRequestId, sessionId, decision })` inside the existing `startTransition` pattern used by retry. Do not call `onCancel` for Deny.
- Keep Cancel on the compact row. Keep the read-only approval summary. Running, succeeded, and decided states must not show Allow/Deny.
- Update StatusBar tests (keep jsdom pragma). Replace the RM-08 “no Approve/Deny” assertion with the gated Allow/Deny behaviour. Mock `decideApproval`.
- Add an M6c section to `apps/work/lat.md/skill-run.md`. Keep Attachment, legacy path, and Chat approval in Still Out. Do not mark Roadmap RM-09 DONE. Do not edit Chat.tsx.

**Stop conditions**
- [ ] V05 PASS
- [ ] V06 PASS
- [ ] V09 PASS
- [ ] V10 PASS
- [ ] Roadmap RM-09 status is not DONE in this implementation tree
- [ ] Chat.tsx is not modified
- [ ] English-only new copy

**Triggered reads**
- If i18n is needed: `locales/en/skillRun.ts` only
- If buttons collide with Cancel layout: keep both in the existing compact row; do not add a CSS file
- Do not import MessageRow, ClarifyCard, or handleApprove

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; all blocking Acceptance Claims PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V09, V10 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts | PRD revision request |
