---
name: M4 Result Artifact and Session Files
overview: Consume v1.2.1 Artifact list/download through existing File Platform, isolate run-scoped identity from Expert rows, dispatch Save As/materialize by provider, and surface Session agent-output plus StatusBar retry. Fixture and focused tests prove implementation; live Checkpoint B remains the Roadmap DONE bar.
todos:
  - id: t1-bundle-artifact-adapter
    content: "T1 — Bundle Artifact list adapter [C01]"
    status: completed
  - id: t2-run-scoped-remote-identity
    content: "T2 — Run-scoped remote identity [C04]"
    status: completed
  - id: t3-require-run-scoped-download
    content: "T3 — Require run-scoped Skill download [C03]"
    status: completed
  - id: t4-provider-dispatched-transfer
    content: "T4 — Provider-dispatched Save As and materialize [C02]"
    status: completed
  - id: t5-agent-output-association-and-retry
    content: "T5 — Session agent-output association and retry [C05]"
    status: completed
isProject: false
plan_contract: smc.plan.v3.4
plan_id: RM-05
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-05
grounded_commit: 2820d5f8d69a77289b5f6741e10a095fb1a4e85f
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M4 Result Artifact and Session Files Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M4-result-artifact-and-session-files.md)

## Scope

- In: reuse File Platform remote identity, Preview cache, Save As, Session Files, Skill discovery/retry, and compact Result materialize. Consume v1.2.1 `PublicArtifactList` / `PublicArtifactDescriptor` / run-scoped download. Dispatch bytes by `ManagedFile.provider`. Associate Session `agent-output`. Prove with focused tests plus `test:skill-run-e2e` fixture.
- Out: marking RM-01 `DONE`; M5 production default `skill-first`; Approval cards; JSON Schema forms; Attachment upload; Expert default-entry removal; Skill download IPC; `SkillArtifactCards`; Hermes Task or unscoped `/api/v1/artifacts/{id}/download` as Skill contract; editing `contracts/work-expert/v1.0.2`.
- Production Owner inherited from PRD: File Platform owns ManagedFile, Preview, Save As, materialize, Session Files. `SkillRunService` only lists/adapts/retries discovery. Gateway only consumes Bundle `/api/v1/runs/{run_id}/artifacts*`. Renderer consumes sanitized `ManagedFileView` plus `hermesAPI.files` and existing retry IPC.
- Grounding is `committed_baseline` `2820d5f8d69a77289b5f6741e10a095fb1a4e85f`. Live Checkpoint B is the RM-05 Roadmap `DONE` bar, not an implementation-commit prerequisite.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#normalizeArtifactList` | exists at `2820d5f8`; requires `item.id` and `file_name`/`title`; envelope is `artifacts` or `data`; ignores Bundle `items` / `artifact_id` / `name` / `checksum_sha256` | nested `function normalizeArtifactList` inside `createSkillRunGatewayClient`; `parseSkillRunEvent` completed-branch copies `id`/`file_name` | `listRunArtifacts` and `getRunSnapshot` call `normalizeArtifactList`; `discoverArtifacts` upserts Gateway descriptors | reuse `contracts/skill-run/v1.2.1/fixtures/artifact-with-checksum.json`, `runs/artifact-list.schema.json`, existing `SkillRunArtifactDescriptor`; hoist mapping next to `mapPublicSkillCatalogTools`; no second client | PASS |
| C02 | `apps/work/src/main/files/file-service.ts#saveRemoteArtifactAs` | exists at `2820d5f8`; Save As always `streamExpertArtifactBytes`; `addToSessionContext` always `materializeRemoteExpertArtifact`; Preview already branches on `provider === "skill-run"` | `async function saveRemoteArtifactAs`; `export async function materializeRemoteExpertArtifact` | `fileService.saveAs` and `addToSessionContext` are the remaining Expert-hardcoded callers | reuse `streamSkillRunArtifactBytes` and `storeManagedCopy`; do not add a Skill materialize module | PASS |
| C03 | `apps/work/src/main/files/skill-run-artifact-transfer.ts#streamSkillRunArtifactBytes` | exists at `2820d5f8`; `runId` optional; missing run falls back to `/api/v1/artifacts/{id}/download` | `export async function streamSkillRunArtifactBytes` | Preview already passes `runId: file.remoteRunId`; Save As/materialize will after C02 | reuse size cap, sha256, `.partial`, `renameSync`; endpoint matrix has only `/api/v1/runs/{run_id}/artifacts/{artifact_id}/download` | PASS |
| C04 | `apps/work/src/main/files/file-association-store.ts#ensureRemoteIdentityIndex` | exists at `2820d5f8`; v2 unique is `(profile_id, provider, remote_run_id, remote_artifact_id)` and dropped v1 `(provider, artifact)`; `findByRemoteIdentity` without `remoteRunId` matches any run | `function ensureRemoteIdentityIndex`; `export function findByRemoteIdentity` | Skill upsert already queries with `remoteRunId`; Expert upsert queries artifact id only | reuse existing v2 index plus an Expert partial unique; SQLite NULL UNIQUE is not Expert safety | PASS |
| C05 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts#upsertSkillRunRemoteArtifact` | exists at `2820d5f8`; writes `assistant_attachment` (not in `FileAssociationRole`); no assistant `messageId`; no `contentHash`; `retryArtifactDiscovery` IPC exists; StatusBar has cancel only; `skillRun.artifactRetry` locale key already exists | `export function upsertSkillRunRemoteArtifact`; `async function discoverArtifacts`; `export interface SkillRunProjection`; `SkillRunStatusBar` | `skill-run-ipc.ts` already calls upsert; Chat already mounts StatusBar; Session Files groups `agent-output` | reuse `skillRunTranscriptBubbleIds`, existing retry IPC, `skillRun.artifactRetry`; do not copy `ExpertArtifactCards` | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | 显式 skill-first 下，成功 Run 的终态 Result 更新同一 assistant bubble 与持久化 transcript。Artifact discovery 失败后该 bubble 仍为成功 Result，Run phase 保持 succeeded。 | BEHAVIOR | C06, C05 | T5 | V06, V08 | UNIT | yes |
| AC-02 | AC | Bundle PublicArtifactList（run_id + items[]，字段 artifact_id/name/content_type/size_bytes/checksum_sha256）可被 discovery 消费并 upsert。仅含 Work 私有 id/file_name、缺少 Bundle 必填字段的生产响应不得写入 File Platform。 | CONTRACT | C01 | T1 | V01, V07 | UNIT | yes |
| AC-03 | AC | 两个 Skill Run 使用相同 artifact_id 时产生两个 ManagedFile；Preview cache、Save As 与 Session Files 不串资源。缺 run_id 的 descriptor 不得 upsert。 | LIFECYCLE | C04, C05 | T2, T5 | V02, V05 | UNIT | yes |
| AC-04 | AC | Skill Artifact 出现在当前 session 的 Session Files Agent Output；association role 为 agent-output。Renderer 看不到 download URL、token、absolute cache path 或 raw bytes。 | BEHAVIOR | C05 | T5 | V05, V08 | UNIT | yes |
| AC-05 | AC | Preview / Save As / Materialize / add-to-context 对 Skill-run 行使用 Skill transfer，对 Expert 行仍使用 Expert transfer。Skill download 只打 Bundle /api/v1/runs/{run_id}/artifacts/{artifact_id}/download。超过 size cap 或 checksum 不匹配时 fail-closed，并清理 partial 文件。 | SECURITY | C02, C03 | T3, T4 | V03, V04 | UNIT | yes |
| AC-06 | AC | 无 remoteRunId 时 Skill transfer fail-closed，不回退无 run 的 download 路径，不调用 Expert cancel/start/download。 | NEGATIVE | C03 | T3 | V03, V08 | UNIT | yes |
| AC-07 | AC | File identity 迁移不破坏既有 Expert remote rows；回滚后 Expert (provider, remote_artifact_id) 查找仍成立。Skill 索引不得把 Expert 行当成 Skill-run 去重。 | LIFECYCLE | C04 | T2 | V02 | UNIT | yes |
| AC-08 | AC | discovery 失败后，用户可经既有 skillRun.retryArtifactDiscovery 显式重试；retry 不发第二次 tools/call。无对应 active/rehydrated Run 时 fail-closed。 | LIFECYCLE | C05 | T5 | V06, V08 | UNIT | yes |
| AC-09 | AC | 不存在 Skill 专用 download IPC；不把 ExpertArtifactCards 复制为 Skill 文件 Owner。focused tests 覆盖 identity 隔离、provider 分发、checksum/size/atomic rename、association role 与 sanitization。test:skill-run-e2e fixture 继续覆盖 Catalog→result→artifact discovery fail-soft 与既有负向（unauthorized、unpublish、reconnect、duplicate、cancel）。 | EVIDENCE | C01, C02, C03, C04, C05, C06 | T1, T2, T3, T4, T5 | V01, V02, V03, V04, V05, V06, V07, V08 | INTEGRATION | yes |
| AC-10 | AC | RM-05 标记 Roadmap DONE 前，必须用真实发布 Skill 跑通 Checkpoint B：Catalog → Submit → Run → Result → Artifact Preview/Save As → Restart，并保留上述负向。env-gated live 入口保留。2026-09-04 对 RM-01 live 的延后不构成 Checkpoint B 已通过。实施 commit 可以先凭 fixture/focused 合入，但不得在 live 未跑时把 RM-05 标 DONE。 | OPERATIONS | C06 | T5 | V08 | DOCUMENT_SEMANTIC | yes |
| DOD-01 | DOD | C01–C05 有 APPROVED Stage PRD、validated Plan、review PASS、implementation commit 与 focused/fixture verification；C03 的无 run download 回退已从生产 Skill transfer 移除；C06 由既有 owner 的回归证据覆盖。 | EVIDENCE | C01, C02, C03, C04, C05, C06 | T1, T2, T3, T4, T5 | V01, V02, V03, V04, V05, V06, V07, V08 | DOCUMENT_SEMANTIC | yes |
| DOD-02 | DOD | RM-01 保持 BACKLOG，直到后续阶段重跑 live AC-03/AC-04。RM-05 的 implementation commit 不以 RM-01 DONE 为前提。RM-05 Roadmap DONE 需要本 PRD AC-10 的 live Checkpoint B 证据。 | OPERATIONS | C06 | T5 | V08 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要改 Bundle 形状、生产默认 skill-first、Approval/Attachment 或 Expert 删除的工作，必须返回 RM-01、RM-06、RM-07 或独立 Removal PRD，不得混入 M4。 | SCOPE | C06 | T5 | V08 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Run-scoped upsert | AC-03 | discovery descriptor with `run_id` and `artifact_id` | discovering-artifacts | `upsertSkillRunRemoteArtifact` keyed by `(provider=skill-run, remoteRunId, remoteArtifactId)` | missing `run_id` skips upsert; Run phase stays `succeeded` via `discoverArtifacts` catch | V02, V05 |
| Expert-safe identity | AC-07 | Skill unique index migration on existing `file-index.db` | existing Expert remote rows remain readable | File association store Expert partial unique `(profile, provider=expert, remote_artifact_id)` | Skill lookup never matches `provider=expert`; no rewrite of Expert rows | V02 |
| Discovery retry | AC-08 | user retry after list/upsert failure | succeeded with visible discovery error | `SkillRunService.retryArtifactDiscovery` re-enters `discoverArtifacts`; StatusBar invokes existing IPC | no active/rehydrated run returns null; no second `tools/call`; phase stays `succeeded` | V06, V08 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| Artifact list to ManagedFile | AC-02, AC-03, AC-04 | Provider `GET /api/v1/runs/{run_id}/artifacts` | v1.2.1 `PublicArtifactList` `run_id` + `items[]`; adapter emits `SkillRunArtifactDescriptor` | `listRunArtifacts` then `upsertSkillRunRemoteArtifact` | Bundle `artifact_id`, `name`, `size_bytes`, `checksum_sha256`; Work `run_id` from accepted Run | Gateway adapter; File Platform upsert | private-only or missing required fields skipped; discovery throw keeps `succeeded` | upsert key is `(profile, skill-run, run_id, artifact_id)` | V01, V05, V07 |
| Artifact bytes | AC-05, AC-06 | File Platform Preview / Save As / materialize | Bundle `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}/download`; `Authorization` | `streamSkillRunArtifactBytes` then `hermes-file-preview://{fileId}` or Save As destination | `remoteRunId` and `remoteArtifactId` on ManagedFile | File Platform transfer | missing runId or unscoped path fail-closed; size/checksum mismatch deletes partial; no Expert download | download is not a Skill start; retry is discovery-only | V03, V04, V08 |
| Discovery retry | AC-08 | StatusBar after fail-soft discovery | existing `skill-run:retry-artifact-discovery` IPC | `retryArtifactDiscovery` | `clientRequestId` + `sessionId` of rehydrated Run | SkillRunService | null when no run; no `tools/call` | same `clientRequestId` / `providerRunId` | V06, V08 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-gateway-client.test.ts src/main/skill-run/skill-run-contract-parser.test.ts --pool=threads --maxWorkers=1', shell=True))"` | Bundle `items[]` + `artifact_id`/`name`/`checksum_sha256` maps to internal descriptor and checksum; `listRunArtifacts` uses `/api/v1/runs/{run_id}/artifacts` | private `id`/`file_name` envelope without Bundle required fields yields empty list and no upsert | LOCAL_TRANSIENT | local apps/work | yes |
| V02 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/files/file-association-store.test.ts --pool=threads --maxWorkers=1', shell=True))"` | two skill-run rows with same artifact id and different `remoteRunId` stay distinct; Expert `(provider, remote_artifact_id)` lookup still returns the Expert row | Skill lookup without `remoteRunId` does not collapse Expert or cross-run rows | LOCAL_TRANSIENT | local apps/work | yes |
| V03 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/files/skill-run-artifact-transfer.test.ts --pool=threads --maxWorkers=1', shell=True))"` | download URL is `/api/v1/runs/{run_id}/artifacts/{artifact_id}/download`; size cap and sha256 mismatch fail-closed and remove `.partial` | missing `runId` throws; source has no `/api/v1/artifacts/` fallback | LOCAL_TRANSIENT | local apps/work | yes |
| V04 | DOCUMENT | `python -c "from pathlib import Path; import sys; s=Path('apps/work/src/main/files/file-service.ts').read_text(encoding='utf-8'); m=Path('apps/work/src/main/files/materialize-remote-expert-artifact.ts').read_text(encoding='utf-8'); p=Path('apps/work/src/main/files/file-preview-service.ts').read_text(encoding='utf-8'); ok=('streamSkillRunArtifactBytes' in s and 'streamExpertArtifactBytes' in s and 'streamSkillRunArtifactBytes' in m and 'provider === \"skill-run\"' in p); sys.exit(0 if ok else 1)"` | Save As and materialize dispatch Skill vs Expert transfer; Preview still branches on skill-run | Skill-run rows do not call Expert-only download | LOCAL_TRANSIENT | local repo | yes |
| V05 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/files/upsert-skill-run-remote-artifact.test.ts --pool=threads --maxWorkers=1', shell=True))"` | association role is `agent-output`; assistant `messageId` uses `skill-run:{clientRequestId}:assistant`; `contentHash` comes from checksum | invalid meta or missing `runId` returns null; role `assistant_attachment` is absent | LOCAL_TRANSIENT | local apps/work | yes |
| V06 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx --pool=threads --maxWorkers=1', shell=True))"` | list failure keeps `succeeded`; retry calls `listRunArtifacts` again and does not call `callSkill`; StatusBar exposes retry | retry without active run is fail-closed; no ExpertArtifactCards import in StatusBar | LOCAL_TRANSIENT | local apps/work | yes |
| V07 | INTEGRATION | `python -c "import os,subprocess,sys; os.environ.pop('SMC_SKILL_RUN_E2E', None); sys.exit(subprocess.call('npm --prefix apps/work run test:skill-run-e2e', shell=True))"` | fixture PASS including Catalog to result, Bundle artifact list, discovery fail-soft, unauthorized, unpublish, reconnect, duplicate, cancel | live describe stays skipped without live env | LOCAL_TRANSIENT | local apps/work | yes |
| V08 | DOCUMENT | `python -c "from pathlib import Path; import sys; g=Path('apps/work/src/main/files/skill-run-artifact-transfer.ts').read_text(encoding='utf-8'); i=Path('apps/work/src/shared/skill-run.ts').read_text(encoding='utf-8'); c=Path('apps/work/src/renderer/src/screens/Chat/Chat.tsx').read_text(encoding='utf-8'); f=Path('apps/work/src/main/skill-run/feature-mode-store.ts').read_text(encoding='utf-8'); r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); e=Path('apps/work/src/main/skill-run/skill-run-e2e.test.ts').read_text(encoding='utf-8'); v=Path('apps/work/src/main/files/file-metadata.ts').read_text(encoding='utf-8'); ok=('/api/v1/artifacts/' not in g and 'skill-run:download' not in i and 'ExpertArtifactCards' in c and 'SkillArtifactCards' not in c and 'expert-compat' in f and 'RM-05' in r and 'BACKLOG' in r and 'LIVE_ENABLED' in e and 'displayPath: isRemote ? undefined' in v); sys.exit(0 if ok else 1)"` | no unscoped Skill download; no Skill download IPC; Chat still uses Expert cards only for Expert; default remains expert-compat; RM-05 stays BACKLOG; live suite remains env-gated; remote view has no absolute path | live skip is not claimed as Checkpoint B PASS; production default skill-first remains M5 | LOCAL_TRANSIENT | local repo | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M4-result-artifact-and-session-files.md`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#normalizeArtifactList`
- `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent`
- `apps/work/src/main/files/file-association-store.ts#ensureRemoteIdentityIndex`
- `apps/work/src/main/files/skill-run-artifact-transfer.ts#streamSkillRunArtifactBytes`
- `apps/work/src/main/files/file-service.ts#saveRemoteArtifactAs`
- `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts#upsertSkillRunRemoteArtifact`
- `contracts/skill-run/v1.2.1/fixtures/artifact-with-checksum.json`
- `contracts/skill-run/v1.2.1/http/endpoint-matrix.json`

## Triggered Read

- If v2 unique index still lets two Expert rows share one artifact id because `remote_run_id` is NULL: add an Expert partial unique, do not stamp Expert rows with a fake `remoteRunId`
- If Provider list uses `items` but omits `checksum_sha256`: skip that item, do not invent a hash
- If `addToSessionContext` still reaches Expert download after materialize dispatch: fix the shared materialize function, do not patch Chat
- If retry copy is needed: reuse `skillRun.artifactRetry`, do not add a second locale owner
- Do not read Expert IPC download, Hermes Task routes, or M5 feature-default code to copy a Skill file UI

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#normalizeArtifactList` | PROD | MODIFY | SkillRunGatewayClient | T1 | consume `items[]`, `artifact_id`, `name`, `checksum_sha256`; map into existing `SkillRunArtifactDescriptor` | Bundle Artifact adapter | no |
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent` | PROD | MODIFY | contract parser | T1 | event-carried artifacts use the same Bundle field mapping | Bundle Artifact adapter | no |
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts` | TEST | MODIFY | gateway unit tests | T1 | V01 Bundle happy path and private-envelope negative | Bundle Artifact evidence | no |
| C01 | `apps/work/src/main/skill-run/skill-run-contract-parser.test.ts` | TEST | MODIFY | parser unit tests | T1 | completed/artifact events map Bundle descriptor fields | Bundle Artifact evidence | no |
| C01 | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` | TEST | MODIFY | skill-run e2e fixture | T1 | fixture list envelope is v1.2.1 `run_id` + `items[]`; live stays env-gated | Fixture artifact evidence | no |
| C02 | `apps/work/src/main/files/file-service.ts#saveRemoteArtifactAs` | PROD | MODIFY | File service | T4 | Skill-run Save As streams via `streamSkillRunArtifactBytes`; Expert unchanged | Provider-dispatched transfer | no |
| C02 | `apps/work/src/main/files/materialize-remote-expert-artifact.ts#materializeRemoteExpertArtifact` | PROD | MODIFY | File Platform materialize | T4 | skill-run provider uses Skill transfer then `storeManagedCopy`; Expert path unchanged | Provider-dispatched transfer | no |
| C02 | `apps/work/lat.md/file-platform.md` | DOC | MODIFY | file-platform lat | T4 | document provider dispatch, run-scoped cache key, Expert-safe unique index | File Platform documentation | no |
| C03 | `apps/work/src/main/files/skill-run-artifact-transfer.ts#streamSkillRunArtifactBytes` | PROD | REMOVE | Skill transfer | T3 | require `runId`; only Bundle run-scoped download; delete unscoped fallback | Unscoped Skill download | no |
| C03 | `apps/work/src/main/files/skill-run-artifact-transfer.test.ts` | TEST | ADD | Skill transfer tests | T3 | V03 URL, size, checksum, missing-run negatives | Unscoped download evidence | yes |
| C04 | `apps/work/src/main/files/file-association-store.ts#ensureRemoteIdentityIndex` | PROD | MODIFY | File association store | T2 | Skill-run unique requires `remote_run_id`; Expert unique stays `(profile, provider, remote_artifact_id)` | Run-scoped remote identity | no |
| C04 | `apps/work/src/main/files/file-association-store.ts#findByRemoteIdentity` | PROD | MODIFY | File association store | T2 | skill-run lookup requires `remoteRunId`; Expert lookup does not use Skill run id | Run-scoped remote identity | no |
| C04 | `apps/work/src/main/files/file-association-store.test.ts` | TEST | MODIFY | association store tests | T2 | V02 cross-run isolation and Expert row survival | Identity evidence | no |
| C05 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts#upsertSkillRunRemoteArtifact` | PROD | MODIFY | Skill remote upsert | T5 | `role=agent-output`; assistant `messageId`; persist checksum as `contentHash` | Session agent-output association | no |
| C05 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.test.ts` | TEST | ADD | Skill upsert tests | T5 | V05 role, messageId, checksum, missing-run skip | Association evidence | yes |
| C05 | `apps/work/src/main/skill-run/skill-run-service.ts#discoverArtifacts` | PROD | MODIFY | SkillRunService | T5 | fail-soft keeps `succeeded` and records retryable discovery error; retry does not `callSkill` | Observable discovery retry | no |
| C05 | `apps/work/src/shared/skill-run.ts#SkillRunProjection` | PROD | MODIFY | Skill Run DTO | T5 | sanitized discovery error flag/message; no URL/path/bytes | Observable discovery retry | no |
| C05 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx` | PROD | MODIFY | Skill Run StatusBar | T5 | retry control on succeeded-with-discovery-error; calls existing retry IPC | Observable discovery retry | no |
| C05 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx` | TEST | ADD | StatusBar tests | T5 | retry visible and invokes retry IPC; no ExpertArtifactCards | Retry UX evidence | yes |
| C05 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | work lat skill-run | T5 | document Bundle artifact consume, agent-output association, StatusBar retry, live DONE bar | Skill Run documentation | no |
| C06 | `apps/work/src/main/skill-run/skill-run-session-materialize.ts#materializeSkillRunSessionTranscript` | PROD | KEEP | session materialize | - | same assistant bubble; discovery failure does not rewrite failed | Compact Result | no |
| C06 | `apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE` | PROD | KEEP | feature-mode store | - | default remains `expert-compat` | Feature mode | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `normalizeArtifactList` is the only list parser; `parseSkillRunEvent` is the only event parser; both already emit `SkillRunArtifactDescriptor` | one mapping in the existing parser/client; no second Artifact client |
| C02 | MODIFY_EXISTING | Preview already dispatches; remaining Expert-hardcoded callers are `saveRemoteArtifactAs` and `materializeRemoteExpertArtifact` | branch inside existing File Platform functions; a new Skill materialize file would duplicate `storeManagedCopy` |
| C03 | REMOVE_ONLY | unscoped `/api/v1/artifacts/{id}/download` is not in the v1.2.1 matrix | delete the fallback; do not add a compatibility download |
| C04 | MODIFY_EXISTING | v2 index already has `remote_run_id`; Expert uniqueness regressed when v1 was dropped | restore Expert partial unique beside Skill-run unique; do not invent a second file database |
| C05 | MODIFY_EXISTING | upsert, retry IPC, StatusBar, Session Files `agent-output` grouping, and `skillRun.artifactRetry` already exist | fix role/message/checksum and show retry on StatusBar; do not add SkillArtifactCards |
| C06 | REUSE_EXISTING | compact Result and `expert-compat` default already landed in M3 | evidence only; no second session or mode owner |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#normalizeArtifactList`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.ts#parseSkillRunEvent`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.test.ts`<br>`apps/work/src/main/skill-run/skill-run-contract-parser.test.ts`<br>`apps/work/src/main/skill-run/skill-run-e2e.test.ts` | `contracts/skill-run/v1.2.1/fixtures/artifact-with-checksum.json`<br>`apps/work/src/shared/skill-run.ts#SkillRunArtifactDescriptor` | - | no |
| T2 | C04 | `apps/work/src/main/files/file-association-store.ts#ensureRemoteIdentityIndex`<br>`apps/work/src/main/files/file-association-store.ts#findByRemoteIdentity`<br>`apps/work/src/main/files/file-association-store.test.ts` | `apps/work/src/main/files/upsert-expert-remote-artifact.ts#upsertExpertRemoteArtifact` | - | no |
| T3 | C03 | `apps/work/src/main/files/skill-run-artifact-transfer.ts#streamSkillRunArtifactBytes`<br>`apps/work/src/main/files/skill-run-artifact-transfer.test.ts` | `contracts/skill-run/v1.2.1/http/endpoint-matrix.json` | - | no |
| T4 | C02 | `apps/work/src/main/files/file-service.ts#saveRemoteArtifactAs`<br>`apps/work/src/main/files/materialize-remote-expert-artifact.ts#materializeRemoteExpertArtifact`<br>`apps/work/lat.md/file-platform.md` | `apps/work/src/main/files/skill-run-artifact-transfer.ts#streamSkillRunArtifactBytes`<br>`apps/work/src/main/files/file-preview-service.ts#getPreviewDescriptor` | T3 | no |
| T5 | C05 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts#upsertSkillRunRemoteArtifact`<br>`apps/work/src/main/files/upsert-skill-run-remote-artifact.test.ts`<br>`apps/work/src/main/skill-run/skill-run-service.ts#discoverArtifacts`<br>`apps/work/src/shared/skill-run.ts#SkillRunProjection`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx`<br>`apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#normalizeArtifactList`<br>`apps/work/src/main/files/file-association-store.ts#findByRemoteIdentity`<br>`apps/work/src/main/skill-run/skill-run-session-materialize.ts#skillRunTranscriptBubbleIds`<br>`apps/work/src/shared/i18n/locales/en/skillRun.ts` | T1, T2 | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/skill-run/skill-run-gateway-client.ts` | T1 | list envelope, descriptor mapping, and follow-on artifact path share one client closure |
| `apps/work/src/main/files/file-association-store.ts` | T2 | Skill-run and Expert unique indexes plus lookup must change together |
| `apps/work/src/main/files/skill-run-artifact-transfer.ts` | T3 | download URL construction and fail-closed run identity share one transfer |
| `apps/work/src/main/files/file-service.ts` | T4 | Save As remote dispatch must not grow a second download owner |
| `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts` | T5 | identity fields, association role, and checksum persist on one upsert |
| `apps/work/src/main/skill-run/skill-run-service.ts` | T5 | fail-soft phase and retry share ActiveRun |
| `apps/work/src/shared/skill-run.ts` | T5 | projection DTO must stay Renderer-safe |
| `apps/work/lat.md/file-platform.md` | T4 | single File Platform documentation writer |
| `apps/work/lat.md/skill-run.md` | T5 | single Skill Run documentation writer after adapter and retry land |

## Generated Outputs Ledger

None

## New File Justification

| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
| C03 | `apps/work/src/main/files/skill-run-artifact-transfer.test.ts` | no existing transfer test file; Preview tests do not assert download URL construction | stays File Platform / Skill transfer test owner; no new production owner |
| C05 | `apps/work/src/main/files/upsert-skill-run-remote-artifact.test.ts` | upsert currently has no focused test; association-store tests do not cover Skill role/messageId/checksum | stays File Platform upsert test owner |
| C05 | `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.test.tsx` | StatusBar has no test; ExpertArtifactCards tests must not become Skill retry owner | stays Skill Run presentation test owner |

## Todo T1 — Bundle Artifact list adapter

**Owns Changes**
- C01

**Goal**

Make Gateway and event parsing consume v1.2.1 `PublicArtifactList` / `PublicArtifactDescriptor` and map into the existing internal descriptor, so production list responses are not dropped.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#normalizeArtifactList`
- `contracts/skill-run/v1.2.1/fixtures/artifact-with-checksum.json`

**Changes**
- Parse `items[]` with `artifact_id`, `name`, `content_type`, `size_bytes`, `checksum_sha256`.
- Map into existing `id` / `file_name` / `sha256` DTO fields; `content_type` may be null.
- Skip items missing Bundle required fields; do not accept private-only `id`/`file_name` as production upsert input.
- Align `parseSkillRunEvent` artifact mapping to the same fields.
- Update e2e fixture list envelope to Bundle `run_id` + `items[]`. Keep live suite env-gated.

**Stop conditions**
- [ ] Bundle fixture list maps to internal descriptors with checksum
- [ ] private-only envelope does not produce upsertable descriptors
- [ ] `listRunArtifacts` still uses `/api/v1/runs/{run_id}/artifacts`
- [ ] V01 and V07 commands are PASS

**Triggered reads**
- If Provider list uses `items` but omits `checksum_sha256`: skip that item, do not invent a hash
- Otherwise: do not add a second Artifact client

## Todo T2 — Run-scoped remote identity

**Owns Changes**
- C04

**Goal**

Keep two Skill Runs with the same artifact id on distinct ManagedFiles, and restore Expert uniqueness so Skill indexes cannot swallow Expert rows.

**Immediate anchors**
- `apps/work/src/main/files/file-association-store.ts#ensureRemoteIdentityIndex`
- `apps/work/src/main/files/file-association-store.ts#findByRemoteIdentity`

**Changes**
- Skill-run unique identity requires non-null `remote_run_id`.
- Expert unique identity remains `(profile, provider=expert, remote_artifact_id)` without depending on NULL `remote_run_id` UNIQUE semantics.
- Skill-run `findByRemoteIdentity` requires `remoteRunId`; do not fall back to artifact-id-only for `provider=skill-run`.
- Do not rewrite existing Expert `provider` or `remoteTaskId` values.

**Stop conditions**
- [ ] same artifact id across two skill-run ids yields two files
- [ ] Expert lookup by `(provider, remote_artifact_id)` still works
- [ ] skill-run lookup without `remoteRunId` does not return a row
- [ ] V02 command is PASS

**Triggered reads**
- If v2 unique index still lets two Expert rows share one artifact id because `remote_run_id` is NULL: add an Expert partial unique, do not stamp Expert rows with a fake `remoteRunId`
- Otherwise: do not add a second file database

## Todo T3 — Require run-scoped Skill download

**Owns Changes**
- C03

**Goal**

Delete the unscoped Skill download fallback and require `runId` before any byte transfer.

**Immediate anchors**
- `apps/work/src/main/files/skill-run-artifact-transfer.ts#streamSkillRunArtifactBytes`

**Changes**
- Require `runId`; build only `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}/download`.
- Keep size cap, optional sha256, `.partial`, and atomic rename.
- Fail closed without calling Expert download.

**Stop conditions**
- [ ] source has no `/api/v1/artifacts/` download fallback
- [ ] missing `runId` throws File Platform error
- [ ] checksum/size failures remove partial files
- [ ] V03 command is PASS

**Triggered reads**
- None unless endpoint-matrix download path changed in the locked Bundle

## Todo T4 — Provider-dispatched Save As and materialize

**Owns Changes**
- C02

**Goal**

Make Save As and context materialize follow Preview: Skill-run rows use Skill transfer, Expert rows keep Expert transfer.

**Immediate anchors**
- `apps/work/src/main/files/file-service.ts#saveRemoteArtifactAs`
- `apps/work/src/main/files/materialize-remote-expert-artifact.ts#materializeRemoteExpertArtifact`

**Changes**
- `saveRemoteArtifactAs` selects `streamSkillRunArtifactBytes` when `provider === "skill-run"`.
- Shared materialize writes managed copy through Skill transfer for skill-run rows and Expert transfer otherwise.
- Do not add `skill-run:download` IPC.
- Update `lat.md/file-platform.md` for dispatch and identity.

**Stop conditions**
- [ ] Skill-run Save As/materialize call Skill transfer
- [ ] Expert rows still call Expert transfer
- [ ] V04 command is PASS
- [ ] `lat check` in `apps/work` still passes after the lat.md edit

**Triggered reads**
- If `addToSessionContext` still reaches Expert download after materialize dispatch: fix the shared materialize function, do not patch Chat
- Otherwise: do not add a new Skill materialize module

## Todo T5 — Session agent-output association and retry

**Owns Changes**
- C05

**Goal**

Persist Skill artifacts as Session `agent-output` on the same assistant bubble, keep discovery fail-soft, and let StatusBar retry through existing IPC.

**Immediate anchors**
- `apps/work/src/main/files/upsert-skill-run-remote-artifact.ts#upsertSkillRunRemoteArtifact`
- `apps/work/src/main/skill-run/skill-run-service.ts#discoverArtifacts`
- `apps/work/src/renderer/src/modules/skill-run/SkillRunStatusBar.tsx`

**Changes**
- Association role `agent-output`; `messageId` from `skillRunTranscriptBubbleIds(clientRequestId).assistant`; persist checksum as `contentHash`.
- Discovery failure keeps `succeeded` and stores a sanitized retryable error on projection.
- StatusBar shows retry using `skillRun.artifactRetry` and existing `retryArtifactDiscovery`; do not add ExpertArtifactCards or Session Files discovery ownership.
- Document Bundle consume, association, retry, and that live Checkpoint B is the Roadmap DONE bar.

**Stop conditions**
- [ ] upsert role is `agent-output` with assistant message id
- [ ] discovery failure does not set phase `failed`
- [ ] retry does not call `callSkill`
- [ ] V05, V06, and V08 commands are PASS
- [ ] `lat check` in `apps/work` still passes after the lat.md edit

**Triggered reads**
- If retry copy is needed: reuse `skillRun.artifactRetry`, do not add a second locale owner
- Otherwise: do not copy ExpertArtifactCards into Skill UI

## Verification

Run the Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06, V07, V08 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but proof is pending/stale | pending/stale gate IDs |
| BLOCKED | environment/dependency prevents proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts | PRD revision request |
