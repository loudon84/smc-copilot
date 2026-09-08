---
name: M6e Skill Run Attachment refs upload
overview: Add File Platform-backed Skill Run attachments on v1.4.0 multipart upload and client_context.attachment_refs. Do not mint att_ refs in Renderer, download-by-ref, or a second file stack.
todos:
  - id: t1-gateway-upload-http-and-v140-gate
    content: "T1 — Gateway upload HTTP and v1.4.0 gate [C01, C02]"
    status: completed
  - id: t2-service-bind-ipc-and-file-ids
    content: "T2 — Service bind IPC and file ids [C03, C04]"
    status: completed
  - id: t3-composer-attach-gate-and-queue-snapshot
    content: "T3 — Composer attach gate and queue snapshot [C05]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.5
plan_id: RM-11
domain_contract: smc.ges.domain-activation.v1
consumer_profile: generic@1.0.0
domain_policy_digest: sha256:78167a10490bbe109ad2f006cfe74ff1390b2187cb6728004964448f2a5c5907
commit_policy: post_review
acceptance_contract: smc.acceptance.v1
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v4.0.1/RM-11
grounded_commit: 9d00381a938b04f6acd4194b6d6455e00cbc7bb4
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M6e Skill Run Attachment refs / upload Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M6-attachment-refs-upload.md)

## Scope

- In: extend existing Skill Run Gateway with `POST /api/v1/attachments` (multipart file, no `X-Idempotency-Key`) and `tools/call` `params.client_context.attachment_refs`; bind File Platform file ids in `SkillRunService.start` after Catalog `supportsAttachments === true` and checksum-complete v1.4.0; extend existing start IPC with optional file ids; enable existing Chat composer attach only when that Catalog flag is true.
- Out: edits to SHA256-covered Provider files; adding attachment schemas to P0 `REQUIRED_BUNDLE_PATHS`; download-by-ref / Provider preview; inventing `inputSchema` attachment fields; Artifact download as user upload; `approvalExpiry`; clarify respond; Chat `MessageRow`; Expert/Local Chat attachment transport; second File/Session/HTTP owner.
- Production Owner inherited from PRD: File Platform owns bytes and local picker/policy. Gateway owns upload HTTP and `client_context` on `tools/call`. SkillRunService owns eligibility, upload-then-bind, and fail-closed. Existing skill-run IPC owns file id entry. Chat composer owns the disable gate and queue snapshot. Backend remains attachment enforcement owner.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | exists at `9d00381a`; `callSkill` JSON-RPC `{name,arguments}` plus `idempotencyKey`; `decideApproval` already uses `authorizedFetch`; no `/api/v1/attachments` | `export interface SkillRunGatewayClient`; `export function createSkillRunGatewayClient`; `function jsonRpc` | `createSkillRunService` is the only production HTTP caller | reuse `authorizedFetch`; FormData body; do not add a second HTTP client | PASS |
| C01 | `apps/work/src/main/auth/authorized-backend-transport.ts#authorizedFetch` | sets `Content-Type: application/json` whenever `init.body` is set and no Content-Type header exists; optional `idempotencyKey` | `export function createAuthorizedBackendTransport`; `authorizedFetch` | Gateway `jsonRpc` and `decideApproval` depend on JSON default | skip the JSON default when `body` is `FormData`; do not invent a second fetch helper | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill` | params are only `name` and `arguments`; accepted identity is `structuredContent.run_id` | `SkillRunGatewayClient.callSkill`; `jsonRpc("tools/call")` | Service `start` calls `gateway.callSkill` after persist | add optional `client_context.attachment_refs`; RELEASE binding fixture; do not guess `inputSchema` keys | PASS |
| C03 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | `start` binds prompt-first then `callSkill`; no file ids; no upload | `export function createSkillRunService`; `SkillRunService.start` | IPC `START` is the production caller | resolve `getManagedFile(profileId, fileId)`; read `managedPath`; upload then `callSkill`; reject remote artifacts | PASS |
| C04 | `apps/work/src/main/skill-run/skill-run-ipc.ts#validateStartInput` | `SkillRunStartInput` has no file ids; extra `attachment_refs` would be dropped | `function validateStartInput`; `registerSkillRunIpc` | Preload `start` already forwards the input object | add optional `fileIds` string array; cap 10; reject `att_*`, paths, `attachment_refs` | PASS |
| C05 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#handleSubmitOrQueue` | `attachmentsDisabled={isSkillRunMode}`; skill queue pushes `attachments: []`; `buildSkillRunQueueRequest` has no file ids | `export function buildSkillRunQueueRequest`; `Chat` submit | `ChatInput` already honors `attachmentsDisabled` and File Platform ingest | compute disable from Catalog `supportsAttachments === true`; snapshot `fileIds` on the skill request | PASS |
| C07 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#REQUIRED_BUNDLE_PATHS` | P0 paths omit attachment schemas; v1.4.0 already checksum-complete; `hasSkillRunApprovalDecisionBundle` is v1.3.0-only | `export function isCompleteSkillRunBundleDir`; `hasSkillRunApprovalDecisionBundle` | first-complete finder still opens P0 on v1.2.1 | add v1.4.0-only `hasSkillRunAttachmentBundle()` under C01; do not edit `REQUIRED_BUNDLE_PATHS` | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | 当前选中 Skill 经 Catalog 投影 supportsAttachments === true 时，现有 composer 出现附加入口；!== true 或未选 Skill 时保持禁用并解释，且 addFiles 仍被拒绝。 | BEHAVIOR | C05 | T3 | V05 | UNIT | yes |
| AC-02 | AC | 允许附加且 checksum-complete v1.4.0：用户经 File Platform 选文件后提交，Main 先 POST /api/v1/attachments（multipart，无 X-Idempotency-Key），再 tools/call 且 params.client_context.attachment_refs 含对应 att_*；arguments 不含猜测附件字段。无文件时纯 prompt start 仍成功且 client_context.attachment_refs 可省略或为空。 | BEHAVIOR | C01, C02, C03, C04 | T1, T2 | V01, V03 | UNIT | yes |
| AC-03 | AC | supportsAttachments !== true、无 v1.4.0、file id 无法解析为 ManagedFile、或仅有 legacy path/dataUrl：start 被拒绝，零 upload HTTP，不发出去掉附件的 tools/call。 | NEGATIVE | C01, C03, C04 | T1, T2 | V03, V04 | UNIT | yes |
| AC-04 | AC | Provider 返回已枚举附件错误（unauthorized / not found / expired / scope denied / ref invalid / too large / type unsupported / scan blocked / not supported）：用户看到已清洗错误；不泄漏 JWT/origin/绝对路径/bytes；不把 Run 标为成功。 | SECURITY | C01, C03 | T1, T2 | V03 | UNIT | yes |
| AC-05 | AC | 忙碌队列出队时仍使用入队 snapshot 的 file id 与 toolName，不重读当前 composer 附件。 | LIFECYCLE | C05 | T3 | V05 | UNIT | yes |
| AC-06 | AC | Artifact list/download、Approval allow/deny、Local Chat 附件、Expert start 行为不变；本 Item 路径不调用那些写通道。不声称 Provider 附件预览或 approvalExpiry 已启用。不修改 v1.2.1 / v1.3.0 / v1.4.0 Provider 字节。P0 Catalog/start 在仅有 checksum-complete v1.2.1 时仍可开门。 | SCOPE | C06, C07, C08 | T1, T2, T3 | V02, V06, V09 | UNIT | yes |
| AC-07 | AC | Renderer 无法从 Skill IPC 取得 att_*、upload URL 或文件绝对路径。Composer 不把 Provider 附件 bytes 交给 MessageList。 | SECURITY | C03, C04, C05 | T2, T3 | V04, V06 | UNIT | yes |
| DOD-01 | DOD | C01–C05 有 Gateway / Service / IPC / composer 的 focused 证明，并覆盖 CL-01–CL-05。C06–C08 由既有 File Platform、Artifact/Approval/Local/Expert 套件与 lock 回归，加上本 Item 负向证明。 | EVIDENCE | C01, C02, C03, C04, C05 | T1, T2, T3 | V01, V03, V04, V06 | UNIT | yes |
| DOD-02 | DOD | RM-11 只有在本 PRD AC 全部通过后，才以独立 Roadmap status commit 标为 DONE。implementation commit 不得包含该 status 更新。 | OPERATIONS | C05 | T3 | V10 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要 preview download-by-ref、改 Bundle、发明 inputSchema 附件字段、把 Artifact 当用户附件、复用 Expert/Local Chat 传输，或把 deny/cancel 与附件混写的工作，必须返回对应 Item / Provider，不得混入本 Item。 | SCOPE | C06, C07, C08 | T1, T2, T3 | V06, V09, V10 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Prompt-only start | AC-02, AC-03 | existing `skillRun.start` with no `fileIds` | existing pending-submit then running | `createSkillRunService` `start` then existing SSE/poll | catalog/bind failures unchanged; do not POST attachments | V03 |
| Attach then start | AC-02, AC-04, AC-07 | `skillRun.start` with File Platform `fileIds` after Catalog `supportsAttachments === true` and v1.4.0 | pending-submit during upload; running only after `tools/call` accepted | same `start` writer; upload then `callSkill` with Main-held `att_*` | missing bundle / catalog false / unknown file / upload error fail before `tools/call`; do not auto-retry upload | V01, V03, V04 |
| Ineligible attachments | AC-03 | start with `fileIds` when catalog false, no v1.4.0, or non-ManagedFile | no new Provider run | none; start rejects before upload and `tools/call` | `rejectStart` without upload HTTP and without stripping files to send prompt-only | V03, V04 |
| Queued attach snapshot | AC-05 | Chat enqueue while `chatBusy` | queue holds immutable `fileIds` with toolName | drain calls `submitSkill` with snapshot | dequeue must not reread composer attachments | V05 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Multipart upload | AC-02, AC-03, AC-04 | `createSkillRunGatewayClient` `uploadAttachment` | `POST /api/v1/attachments`; `Authorization`; multipart field `file`; no `X-Idempotency-Key`; bare receipt | `createSkillRunService` `start` | `attachment_ref` matching `^att_[A-Za-z0-9_-]+$`, `name`, `size_bytes`, `checksum_sha256`, `content_type`, `expires_at` | Gateway JSON + `hasSkillRunAttachmentBundle` | no v1.4.0 / FormData JSON Content-Type forbidden → no or failed fetch; Bundle `error_code` enum sanitized | none; `retry=new-ref-allowed` means one attempt per file per start | V01, V02, V03 |
| tools/call binding | AC-02, AC-07 | `createSkillRunGatewayClient` `callSkill` | JSON-RPC `tools/call` params `name`, `arguments`, optional `client_context.attachment_refs` | Service `start` | `structuredContent.run_id`; echo refs stay in Main | Gateway | missing run_id unchanged; explicit non-empty echo set mismatch fail-closed; omitted or empty echo is not a conflict | existing pending-submit `clientRequestId` on `tools/call` only, never on upload | V01, V03 |
| Narrow start IPC | AC-03, AC-07 | Chat `submitSkill` | existing `skill-run:start`; `{...SkillRunStartInput, fileIds?: string[]}` | `validateStartInput` then service | file ids trimmed, max 10, no `att_*` / path / `attachment_refs` | IPC then service `getManagedFile` under start `profileId` | invalid payload throw; unknown/remote/artifact file → reject without HTTP | none | V04, V06 |
| Composer gate | AC-01, AC-05 | Chat composer | `ChatInput` `attachmentsDisabled`; queue snapshot `fileIds` | File Platform ingest then start IPC | Catalog `supportsAttachments === true` for enablement | Chat computes UX; Main enforces | unselected or false keeps disable and `addFiles` reject | snapshot at enqueue, not drain-time composer | V05 |

## Acceptance Claim Ledger

| Claim ID | Requirement | Observable Fact | Blocking | Prior Evidence | Prior Result | Evidence Action | Invalidation Reason | Verification IDs |
|---|---|---|---|---|---|---|---|---|
| CLM-01 | AC-01 | Attach control shows only when Skill mode and Catalog supportsAttachments is true; otherwise addFiles is rejected | yes | ChatInput skill mode attachmentsDisabled test | PROVEN_BUT_AFFECTED | TARGETED_RERUN | disable gate narrows from all Skill mode to Catalog flag | V05 |
| CLM-02 | AC-02 | Upload POST /api/v1/attachments is multipart without X-Idempotency-Key; tools/call then sends client_context.attachment_refs; prompt-only omits refs | yes | none | NOT_TESTED | NEW_EVIDENCE | v1.4.0 write path is new | V01, V03 |
| CLM-03 | AC-03 | Catalog false, no v1.4.0, or non-ManagedFile yields zero upload HTTP and no prompt-only tools/call that dropped files | yes | start currently discards composer attachments | PROVEN_BUT_AFFECTED | NEW_EVIDENCE | silent drop must become reject | V03, V04 |
| CLM-04 | AC-04 | Bundle attachment error codes are sanitized; phase is not succeeded; no JWT/path/bytes leak | yes | none | NOT_TESTED | NEW_EVIDENCE | new error surface | V03 |
| CLM-05 | AC-05 | Queue snapshot copies fileIds and toolName; later composer edits do not change the dequeued start | yes | extraParameters snapshot tests exist | PROVEN_BUT_AFFECTED | TARGETED_RERUN | fileIds join the existing snapshot helper | V05 |
| CLM-06 | AC-06 | Skill attach path does not call Artifact download, decideApproval, Local handleSend attachments, or expert.start attachmentRefs | yes | those owners exist independently | PROVEN_FRESH | NEW_EVIDENCE | new upload must not join those writers | V06, V09 |
| CLM-07 | AC-07 | Skill IPC and projections never return att_ refs, upload URLs, or filesystem paths | yes | start input has no refs today | NOT_TESTED | NEW_EVIDENCE | new start field is file ids only | V04, V06 |
| CLM-08 | AC-06 | v1.2.1 remains a complete P0 bundle; REQUIRED_BUNDLE_PATHS still omits attachment schemas; hasSkillRunAttachmentBundle is v1.4.0-only | yes | existing lock tests omit attachment schemas from P0 paths | PROVEN_FRESH | TARGETED_RERUN | helper is new; P0 path list must stay | V02 |
| CLM-09 | DOD-01 | Gateway, service, IPC, and composer focused proofs cover upload, bind, fail-closed, and the attach gate | yes | none | NOT_TESTED | NEW_EVIDENCE | new Item proof | V01, V03, V04, V06 |
| CLM-10 | DOD-02 | implementation tree keeps RM-11 not DONE | yes | none | NOT_TESTED | NEW_EVIDENCE | status commit is separate | V10 |
| CLM-11 | DOD-03 | No download-by-ref, Bundle byte edit, inputSchema attachment field, Artifact-as-upload, or Expert/Local Chat reuse | yes | none | NOT_TESTED | NEW_EVIDENCE | out-of-scope work must not land here | V06, V09, V10 |

## Live Scenario Matrix

| Scenario ID | Claim IDs | Verification IDs | Subject / Fixture | Required Capabilities | Preconditions | Stimulus | Oracle | Environment ID |
|---|---|---|---|---|---|---|---|---|

## Live Environment Matrix

| Environment ID | Required Env Vars | Preflight Command | Fault Driver Env | Candidate Mode | Candidate Probe |
|---|---|---|---|---|---|

## Verification Ledger

| Verification ID | Claim IDs | Level | Acceptance Mode | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Evidence Action | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | CLM-02, CLM-09 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-gateway-client.test.ts --pool=threads --maxWorkers=1', shell=True))"` | uploadAttachment POSTs /api/v1/attachments as multipart field file without X-Idempotency-Key; 200 parses att_ receipt; callSkill with refs includes params.client_context.attachment_refs and does not put refs in arguments | no upload fetch when attachment bundle is false; callSkill without files omits client_context; JSON Content-Type is not set on FormData | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V02 | CLM-08 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-consumer-lock.test.ts --pool=threads --maxWorkers=1', shell=True))"` | v1.2.1 remains complete; v1.4.0 remains complete; hasSkillRunAttachmentBundle is true only for checksum-complete v1.4.0 | identity-only v1.0.0 still fails; REQUIRED_BUNDLE_PATHS still omits attachment-upload.response.schema.json and attachment-error.schema.json | LOCAL_TRANSIENT | local apps/work | TARGETED_RERUN | yes |
| V03 | CLM-02, CLM-03, CLM-04, CLM-09 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | supportsAttachments true plus v1.4.0 uploads then callSkill with the returned refs in order; prompt-only start does not call upload; catalog false / no bundle / unknown fileId reject with zero upload and zero callSkill | remoteArtifactId files are rejected; ATTACHMENT_EXPIRED does not mark succeeded; upload is not retried on failure; createMockGateway supplies uploadAttachment and hasAttachmentBundle | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V04 | CLM-03, CLM-07, CLM-09 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-ipc.test.ts --pool=threads --maxWorkers=1', shell=True))"` | START accepts optional fileIds string array and forwards it; result type has no att_ field | attachment_refs, path, or att_ as fileIds rejected; more than 10 fileIds rejected | LOCAL_TRANSIENT | local apps/work | NEW_EVIDENCE | yes |
| V05 | CLM-01, CLM-05 | UNIT | LOCAL | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/renderer/src/screens/Chat/ChatInput.test.tsx src/renderer/src/screens/Chat/skillSelectionRestore.test.ts --pool=threads --maxWorkers=1', shell=True))"` | attachmentsDisabled true still hides attach and rejects addFiles; skillRunComposerAttachmentsDisabled is true unless Skill mode and supportsAttachments true; buildSkillRunQueueRequest copies fileIds and does not alias later array edits | unselected or false Catalog keeps disable | LOCAL_TRANSIENT | local apps/work | TARGETED_RERUN | yes |
| V06 | CLM-06, CLM-07, CLM-09, CLM-11 | UNIT | LOCAL | `python -c "from pathlib import Path; import sys; gw=Path('apps/work/src/main/skill-run/skill-run-gateway-client.ts').read_text(encoding='utf-8'); svc=Path('apps/work/src/main/skill-run/skill-run-service.ts').read_text(encoding='utf-8'); ipc=Path('apps/work/src/main/skill-run/skill-run-ipc.ts').read_text(encoding='utf-8'); chat=Path('apps/work/src/renderer/src/screens/Chat/Chat.tsx').read_text(encoding='utf-8'); dto=Path('apps/work/src/shared/skill-run.ts').read_text(encoding='utf-8'); ok=('/api/v1/attachments' in gw and 'client_context' in gw and 'uploadAttachment' in svc and 'fileIds' in ipc and 'fileIds' in dto and 'attachment_refs' not in dto and 'decideApproval' in chat and 'skillRun.decideApproval' in Path('apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx').read_text(encoding='utf-8') and 'expert.start' not in svc and 'upsertSkillRunRemoteArtifact' not in svc.split('start')[0]); sys.exit(0 if ('fileIds' in chat and 'supportsAttachments' in chat and '/api/v1/attachments' in gw) else 1)"` | Chat snapshots fileIds; Gateway has attachments path; shared DTO has fileIds and no attachment_refs; Service start does not call expert.start | Service must not upsert remote artifacts during start | LOCAL_TRANSIENT | local repo | NEW_EVIDENCE | yes |
| V09 | CLM-06, CLM-11 | DOCUMENT | LOCAL | `python -c "from pathlib import Path; import sys; gw=Path('apps/work/src/main/skill-run/skill-run-gateway-client.ts').read_text(encoding='utf-8'); u14=Path('contracts/skill-run/v1.4.0/capabilities/unsupported.schema.json').read_text(encoding='utf-8'); u12=Path('contracts/skill-run/v1.2.1/SHA256SUMS').read_text(encoding='utf-8'); ch=Path('apps/work/src/shared/skill-run.ts').read_text(encoding='utf-8'); ok=('download' not in gw.lower() or 'artifacts' in gw) and 'approvalExpiry' in u14 and 'unsupported' in u14 and 'fileIds' in ch and 'skill-run:upload' not in ch and len(u12)>0; sys.exit(0 if ('/api/v1/attachments' in gw and 'fileIds' in ch and 'att_' not in ch.split('SkillRunStartInput')[1].split('interface')[0]) else 1)"` | Gateway has upload path; start DTO has fileIds not att_ refs; v1.4.0 approvalExpiry remains unsupported; no skill-run:upload channel | v1.2.1 SHA256SUMS file is untouched in this Item | LOCAL_TRANSIENT | local repo | NEW_EVIDENCE | yes |
| V10 | CLM-10, CLM-11 | DOCUMENT | LOCAL | `python -c "from pathlib import Path; import sys; r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); lat=Path('apps/work/lat.md/skill-run.md').read_text(encoding='utf-8'); p=chr(124); row=next(x for x in r.splitlines() if x.startswith(p+' RM-11 ')); ok=(row.split(p)[4].strip()!='DONE' and 'attachment' in lat.lower() and 'File Platform' in lat); sys.exit(0 if ok else 1)"` | implementation tree keeps RM-11 not DONE; lat.md documents File Platform attachments and still treats preview/expiry as out | implementation commit must not mark RM-11 DONE | LOCAL_TRANSIENT | local repo | NEW_EVIDENCE | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M6-attachment-refs-upload.md`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill`
- `apps/work/src/main/auth/authorized-backend-transport.ts#authorizedFetch`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunApprovalDecisionBundle`
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/files/file-association-store.ts#getManagedFile`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#validateStartInput`
- `apps/work/src/shared/skill-run.ts#SkillRunStartInput`
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#buildSkillRunQueueRequest`
- `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx`
- `contracts/skill-run/v1.4.0/http/endpoint-matrix.json`
- `contracts/skill-run/v1.4.0/fixtures/tools-call-attachment-binding.json`
- `apps/work/lat.md/skill-run.md`

## Triggered Read

- If `authorizedFetch` still forces JSON Content-Type on FormData: skip default Content-Type only for FormData; do not add a second transport
- If Node FormData/Blob types fail in Electron main: use the runtime global FormData already used by fetch; do not add a dependency
- If `getManagedFile` returns a remote artifact row: reject as ineligible; do not download it
- If receipt echo is omitted or `[]`: do not treat as conflict; only fail on an explicit non-empty mismatched set
- If UI wants Provider preview or a new upload IPC channel: stop; out of this Item
- Do not read Provider source, do not edit SHA256-covered Bundle files, do not call `upsertSkillRunRemoteArtifact` from start

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient` | PROD | MODIFY | Skill Run Gateway | T1 | add `uploadAttachment` and `hasAttachmentBundle()` | Multipart upload on existing Gateway | no |
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | PROD | MODIFY | Skill Run Gateway | T1 | POST multipart `/api/v1/attachments`; parse bare receipt; no idempotency header; throw `SkillRunGatewayError` with Bundle error codes | Multipart upload on existing Gateway | no |
| C01 | `apps/work/src/main/auth/authorized-backend-transport.ts#authorizedFetch` | PROD | MODIFY | authorized transport | T1 | do not default JSON Content-Type when body is FormData | Multipart upload on existing Gateway | no |
| C01 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir` | PROD | MODIFY | Skill Run consumer lock | T1 | add `hasSkillRunAttachmentBundle()` for checksum-complete v1.4.0 only; leave `REQUIRED_BUNDLE_PATHS` unchanged | Multipart upload on existing Gateway | no |
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts` | TEST | MODIFY | Skill Run Gateway tests | T1 | upload path/body/headers; zero fetch without bundle; FormData is not JSON | Multipart upload on existing Gateway | no |
| C01 | `apps/work/src/main/auth/authorized-backend-transport.test.ts` | TEST | MODIFY | authorized transport tests | T1 | FormData requests keep Authorization and omit JSON Content-Type | Multipart upload on existing Gateway | no |
| C01 | `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts` | TEST | MODIFY | Skill Run consumer lock tests | T1 | helper true only for v1.4.0; P0 paths still omit attachment schemas | Multipart upload on existing Gateway | no |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill` | PROD | MODIFY | Skill Run Gateway | T1 | optional `attachmentRefs` become `params.client_context.attachment_refs`; arguments unchanged | client_context.attachment_refs on existing tools/call | no |
| C03 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | MODIFY | SkillRunService | T2 | enforce Catalog flag and v1.4.0; resolve ManagedFile; upload then callSkill; map Bundle errors | Upload/bind eligibility in existing SkillRunService | no |
| C03 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | SkillRunService tests | T2 | upload-then-bind, prompt-only, fail-closed, no silent drop; mock `uploadAttachment` | Upload/bind eligibility in existing SkillRunService | no |
| C04 | `apps/work/src/shared/skill-run.ts#SkillRunStartInput` | PROD | MODIFY | Skill Run DTO | T2 | optional `fileIds`; never `attachment_refs` | Narrow skill-run start IPC (file ids) | no |
| C04 | `apps/work/src/main/skill-run/skill-run-ipc.ts#validateStartInput` | PROD | MODIFY | Skill Run IPC | T2 | accept max 10 file ids; reject refs/paths/`att_*` | Narrow skill-run start IPC (file ids) | no |
| C04 | `apps/work/src/main/skill-run/skill-run-ipc.test.ts` | TEST | MODIFY | Skill Run IPC tests | T2 | accept/reject start fileIds | Narrow skill-run start IPC (file ids) | no |
| C05 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#buildSkillRunQueueRequest` | PROD | MODIFY | Chat Skill submit | T3 | snapshot fileIds; `attachmentsDisabled` only when Skill mode and supportsAttachments is not true | Composer disable gate + queue snapshot | no |
| C05 | `apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts` | TEST | MODIFY | Chat Skill submit tests | T3 | fileIds snapshot isolation; composer disable helper | Composer disable gate + queue snapshot | no |
| C05 | `apps/work/src/renderer/src/screens/Chat/ChatInput.test.tsx` | TEST | MODIFY | ChatInput tests | T3 | keep disabled reject; do not require a new ChatInput production API | Composer disable gate + queue snapshot | no |
| C05 | `apps/work/src/shared/i18n/locales/en/skillRun.ts` | PROD | MODIFY | Work i18n English | T3 | keep or extend English-only disabled copy | Composer disable gate + queue snapshot | no |
| C05 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | work lat skill-run | T3 | document M6e File Platform attachments; preview/expiry stay out | Composer disable gate + queue snapshot | no |
| C06 | `apps/work/src/main/files/file-association-store.ts#getManagedFile` | PROD | KEEP | File Platform | - | picker/policy/staging unchanged; start only reads | File Platform picker/policy/staging | no |
| C07 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#REQUIRED_BUNDLE_PATHS` | PROD | KEEP | Skill Run consumer lock | - | P0 path list unchanged | P0 consumer lock paths | no |
| C08 | `apps/work/src/renderer/src/screens/Chat/MessageRow.tsx` | PROD | KEEP | Chat Local approval | - | Local Chat attachments unchanged | Artifact / Approval / Local Chat / Expert / Bundle bytes / preview / expiry | no |
| C08 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts` | PROD | KEEP | File Platform artifacts | - | start must not call this | Artifact / Approval / Local Chat / Expert / Bundle bytes / preview / expiry | no |
| C08 | `contracts/skill-run/v1.4.0/SHA256SUMS` | PROD | KEEP | Provider Bundle | - | no Provider byte edit | Artifact / Approval / Local Chat / Expert / Bundle bytes / preview / expiry | no |

## Domain Activation Ledger

None

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | Gateway already owns Skill Run HTTP; transport already injects Authorization; lock already has a v1.3.0-only helper pattern | Add `uploadAttachment` plus a v1.4.0-only helper; skip JSON Content-Type for FormData; do not add a client or upload IPC |
| C02 | MODIFY_EXISTING | `callSkill` already JSON-RPC posts `{name, arguments}` | Add optional `client_context.attachment_refs` on that same method; do not guess Catalog fields |
| C03 | MODIFY_EXISTING | SkillRunService already owns start lifecycle, Catalog rebind, and `callSkill` | Resolve `getManagedFile` then upload then bind; do not persist `att_*` on projection |
| C04 | MODIFY_EXISTING | start IPC already validates sender/auth and forwards `SkillRunStartInput` | Add optional `fileIds`; Renderer cannot send refs or paths |
| C05 | MODIFY_EXISTING | `ChatInput` already disables attach and File Platform ingest already yields ManagedFile ids | Narrow the Chat prop and snapshot fileIds on the existing queue helper; do not add a Skill Chat page |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01, C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`<br>`apps/work/src/main/auth/authorized-backend-transport.ts#authorizedFetch`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.ts#isCompleteSkillRunBundleDir`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.test.ts`<br>`apps/work/src/main/auth/authorized-backend-transport.test.ts`<br>`apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill` | `contracts/skill-run/v1.4.0/http/endpoint-matrix.json`<br>`contracts/skill-run/v1.4.0/runs/attachment-upload.response.schema.json` | - | no |
| T2 | C03, C04 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts`<br>`apps/work/src/shared/skill-run.ts#SkillRunStartInput`<br>`apps/work/src/main/skill-run/skill-run-ipc.ts#validateStartInput`<br>`apps/work/src/main/skill-run/skill-run-ipc.test.ts` | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#SkillRunGatewayClient`<br>`apps/work/src/main/files/file-association-store.ts#getManagedFile` | T1 | no |
| T3 | C05 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx#buildSkillRunQueueRequest`<br>`apps/work/src/renderer/src/screens/Chat/skillSelectionRestore.test.ts`<br>`apps/work/src/renderer/src/screens/Chat/ChatInput.test.tsx`<br>`apps/work/src/shared/i18n/locales/en/skillRun.ts`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/shared/skill-run.ts#SkillRunStartInput`<br>`apps/work/src/renderer/src/screens/Chat/ChatInput.tsx` | T2 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/skill-run/skill-run-gateway-client.ts` | T1 | upload, v1.4.0 gate, and `callSkill` client_context share one factory |
| `apps/work/src/main/skill-run/skill-run-service.ts` | T2 | eligibility, upload-then-bind, and existing start/cancel share `createSkillRunService` |
| `apps/work/src/shared/skill-run.ts` | T2 | `SkillRunStartInput.fileIds` is the only new DTO field |
| `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | T3 | disable prop, queue snapshot, and start call share one Chat owner |

## Generated Outputs Ledger

None

## Todo T1 — Gateway upload HTTP and v1.4.0 gate

**Owns Changes**
- C01
- C02

**Goal**

Make the existing Skill Run Gateway the only HTTP owner of v1.4.0 multipart upload and `client_context.attachment_refs`, fail closed without checksum-complete v1.4.0, and keep v1.2.1 P0 completeness.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/auth/authorized-backend-transport.ts#authorizedFetch`
- `apps/work/src/main/skill-run/skill-run-consumer-lock.ts#hasSkillRunApprovalDecisionBundle`

**Changes**
- Export `hasSkillRunAttachmentBundle()` that returns `isCompleteSkillRunBundleDir` of `contracts/skill-run/v1.4.0` only. Do not change `REQUIRED_BUNDLE_PATHS`. Do not change first-complete `findSkillRunConsumerLockDir`.
- Add `hasAttachmentBundle()` on `SkillRunGatewayClient`, defaulting to that helper, overridable in tests like `hasApprovalDecisionBundle`.
- In `authorizedFetch`, if `init.body` is `FormData`, do not set `Content-Type: application/json`. Keep Authorization. Do not send `X-Idempotency-Key` unless the caller passed `idempotencyKey`.
- Add `uploadAttachment({ filename, bytes, contentType })`. If the attachment bundle is false, throw without fetch (`ATTACHMENT_NOT_SUPPORTED`). POST `/api/v1/attachments` with `FormData` field name `file`. Do not JSON-encode the file. Parse 200 as a bare receipt requiring `attachment_ref` matching `^att_[A-Za-z0-9_-]+$` plus `name`, `size_bytes`, `checksum_sha256`, `content_type`, `expires_at`. Map Bundle `error_code` values onto `SkillRunGatewayError`.
- Extend `callSkill` with optional `attachmentRefs?: string[]`. When present and non-empty, JSON-RPC params include `client_context: { attachment_refs }`. `arguments` stay the prompt/extra map. Accepted identity remains `structuredContent.run_id`. If `attachment_refs` is an explicit non-empty array that does not match the sent set, throw; omit or empty array is not a conflict. Do not return refs to callers beyond the Gateway method result used by Main.
- Tests: upload path, multipart, no idempotency header, missing bundle zero fetch, callSkill with and without refs, FormData Content-Type. Lock tests: v1.2.1 still complete; helper true only for v1.4.0; P0 paths still omit attachment schemas.

**Stop conditions**
- [ ] V01 PASS
- [ ] V02 PASS
- [ ] upload path is `/api/v1/attachments`
- [ ] v1.2.1 P0 completeness still passes
- [ ] no Provider Bundle file bytes changed

**Triggered reads**
- If FormData typing fails: use the same fetch runtime FormData as Electron; do not add a package
- Do not add attachment schemas to `REQUIRED_BUNDLE_PATHS`
- Do not read Provider source

## Todo T2 — Service bind IPC and file ids

**Owns Changes**
- C03
- C04

**Goal**

Let Main resolve File Platform file ids, upload once per file, bind `client_context.attachment_refs`, and expose those ids on the existing start IPC without leaking `att_*` to Renderer.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService`
- `apps/work/src/main/skill-run/skill-run-ipc.ts#validateStartInput`
- `apps/work/src/shared/skill-run.ts#SkillRunStartInput`
- `apps/work/src/main/files/file-association-store.ts#getManagedFile`

**Changes**
- Add optional `fileIds?: string[]` to `SkillRunStartInput`. Do not add `attachment_refs`. Preload already forwards the start object; only change the shared type unless the invoke wrapper needs a type-only update.
- `validateStartInput`: optional array of trimmed non-empty strings, max 10, max id length 128, unique. Reject if the payload contains `attachment_refs`, `attachmentRefs`, `path`, or any id matching `^att_`.
- After prompt-first bind and before `callSkill`: if `fileIds` is empty/omitted, call `callSkill` as today. If present, require `bindResult.tool.supportsAttachments === true` and `gateway.hasAttachmentBundle()`. Otherwise `rejectStart` with `ATTACHMENT_NOT_SUPPORTED` and do not upload or `callSkill`.
- Resolve each id with `getManagedFile(input.profileId, fileId)`. Reject when missing, `locality === "remote"`, `remoteArtifactId` set, or `managedPath` missing/unreadable. Read bytes from `managedPath`. Upload in user order. Do not auto-retry a failed upload.
- Then `callSkill` with `attachmentRefs` from receipts. Do not write refs onto `SkillRunProjection` or continuation. Do not call `upsertSkillRunRemoteArtifact`. Map Gateway attachment errors onto failed phase with sanitized `errorCode`/`errorMessage`.
- `createMockGateway` adds `uploadAttachment` and `hasAttachmentBundle`. Tests cover prompt-only, happy bind order, catalog false, no bundle, unknown id, remote artifact, and error codes that must not become succeeded.

**Stop conditions**
- [ ] V03 PASS
- [ ] V04 PASS
- [ ] Renderer cannot supply `att_*` or paths
- [ ] catalog false / no v1.4.0 never calls upload or a stripped `tools/call`
- [ ] start does not upsert artifacts

**Triggered reads**
- If mocks fail to type-check: add the Gateway methods in this test file only
- If `managedPath` is absent but `originalPath` exists for a local picker file: still fail-closed unless File Platform already staged `managedPath`
- Do not edit Chat.tsx in this Todo
- Do not persist `att_*` on DTO

## Todo T3 — Composer attach gate and queue snapshot

**Owns Changes**
- C05

**Goal**

Enable the existing Chat attach control only for Skills whose Catalog flag is true, snapshot file ids with the skill queue request, and document the boundary in lat.md.

**Immediate anchors**
- `apps/work/src/renderer/src/screens/Chat/Chat.tsx#buildSkillRunQueueRequest`
- `apps/work/src/renderer/src/screens/Chat/ChatInput.tsx`
- `apps/work/src/shared/i18n/locales/en/skillRun.ts`

**Changes**
- Export `skillRunComposerAttachmentsDisabled(isSkillRunMode, supportsAttachments)` returning true unless Skill mode and `supportsAttachments === true`. Pass that to `ChatInput`. Unselected Skill stays disabled.
- Extend `buildSkillRunQueueRequest` with optional `fileIds` copied by value. `handleSubmitOrQueue` / `submitSkill` pass `attachments.map((a) => a.id)` as `fileIds` and do not put `Attachment` payloads on the skill queue item. Drain uses the snapshot, not the live composer.
- Keep English `skillRun.attachmentsDisabled` (or a same-file English variant). Do not edit non-English locales.
- Keep the ChatInput disabled test. Add snapshot tests for `fileIds` and the disable helper. Do not import MessageRow handlers. Do not call `expert.start`.
- Add an M6e section to `apps/work/lat.md/skill-run.md`. File Platform owns bytes; Skill Run sends refs; preview download-by-ref and `approvalExpiry` stay out. Do not mark Roadmap RM-11 DONE.

**Stop conditions**
- [ ] V05 PASS
- [ ] V06 PASS
- [ ] V09 PASS
- [ ] V10 PASS
- [ ] Roadmap RM-11 status is not DONE in this implementation tree
- [ ] English-only new copy

**Triggered reads**
- If attach button layout needs CSS: reuse existing ChatInput attach control; do not add a CSS file
- If ingest falls back to legacy path-only Attachment: still send the id and let Main fail-closed
- Do not add `skill-run:upload` IPC
- Do not preview Provider attachment bytes

## Verification

Run all blocking Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; all blocking Acceptance Claims PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V09, V10 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts | PRD revision request |
