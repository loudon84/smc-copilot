---
name: M3 Executable Run and Recovery
overview: Converge Skill Run to native structuredContent.run_id transport, concurrent bounded poll while SSE stays open, and restore the expert-compat default. Fixture and focused tests prove lifecycle; RM-01 live stays deferred.
todos:
  - id: t1-native-run-id-transport
    content: "T1: callSkill 只接受 Bundle structuredContent.run_id；task_id / Hermes Task URL fail-closed 且不调用 Expert；更新 gateway 单测（C01/C02）"
    status: completed
  - id: t2-concurrent-sse-poll
    content: "T2: consumeSse 在 SSE 仍打开时并发启动既有 pollStatus；新增 hanging-SSE 用例；e2e fixture 对齐 structuredContent.run_id；更新 lat.md/skill-run.md（C03）"
    status: completed
  - id: t3-restore-expert-compat-default
    content: "T3: feature-mode-store DEFAULT_MODE 恢复 expert-compat；保留 env/store 显式覆盖，不动 M5 生产默认（C06）"
    status: completed
isProject: false
plan_contract: smc.plan.v3.3
plan_id: RM-04
commit_policy: post_review
source_revision: WORK-SKILL-FIRST-LAYOUT-V4.0.1@v2.1/RM-04
grounded_commit: 92748e3655d9528700ab31ef683ce126722631eb
grounding_source: committed_baseline
working_tree_fingerprint: clean
---

# M3 Executable Run and Recovery Implementation Plan

## Approved PRD

[Approved PRD](../../docs/work/PRD-WORK-v4.0.1-M3-executable-run-and-recovery.md)

## Scope

- In: reuse existing `SkillRunService`, `SkillRunGatewayClient`, prompt-first binder, continuation, Chat queue snapshot, and session materialize. Accept only Bundle `structuredContent.run_id` and `/api/v1/runs/{run_id}/*`. Start bounded poll while SSE is still open. Restore store default `expert-compat`. Prove with focused tests plus `test:skill-run-e2e` fixture.
- Out: marking RM-01 `DONE`; M5 production default `skill-first`; M4 File Platform / Preview / Save As / Session Files / Checkpoint B; Approval decision cards; Hermes Task `/api/v1/hermes/tasks/*` as Skill Run contract; Expert silent fallback; live lab replay.
- Production Owner inherited from PRD: Main `SkillRunService` owns lifecycle; `SkillRunGatewayClient` consumes Bundle MCP and `/api/v1/runs/*` only; mounted Chat owns immutable queue snapshots; Renderer consumes sanitized projection only.
- Grounding is `committed_baseline` `92748e3655d9528700ab31ef683ce126722631eb`. Uncommitted working-tree Hermes Task `task_id` bridging and debug `debugger` statements are not source and must not land.

## Grounding Evidence Ledger

| Change ID | Target | Baseline State | Symbol / Entry Resolution | Caller / Callee Evidence | Existing Reuse Search | Result |
|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill` | exists at `92748e36`; reads top-level `data.run_id` / `data.runId`; throws `missing run_id`; `getRunSnapshot` / `openEventStream` / `cancelRun` already use `/api/v1/runs/{id}/*` | `async callSkill` inside `createSkillRunGatewayClient` | `createSkillRunService.start` calls `gateway.callSkill` with `idempotencyKey: clientRequestId` | reuse `contracts/skill-run/v1.2.1/fixtures/tools-call-accepted.json` and `http/endpoint-matrix.json`; no second gateway | PASS |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill` | committed baseline has no `task_id` alias and no `/api/v1/hermes/tasks/*` Skill Run routes; working-tree bridge is outside this grounding | same `callSkill` symbol | Service never calls Expert start/cancel; Expert owners remain outside this Plan | do not copy working-tree `defaultHermesTaskRoutes`; fail-closed already exists | PASS |
| C03 | `apps/work/src/main/skill-run/skill-run-service.ts#consumeSse` | exists at `92748e36`; comment `Fall back to polling if SSE disconnected`; `pollStatus` runs only after the SSE while-loop | `async function consumeSse` | `start` and `rehydrate` both `void consumeSse`; `pollStatus` already maps snapshot phases and respects `terminalConfirmed` | reuse existing `pollStatus` / `updateProjection` / `Last-Event-ID`; e2e already has unused `hangingSseResponse` | PASS |
| C06 | `apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE` | exists at `92748e36` as `skill-first`; `getSkillRunFeatureMode` still prefers env then store file then default | `const DEFAULT_MODE` | `createSkillRunService` uses `options.getFeatureMode ?? getSkillRunFeatureMode`; non-`skill-first` returns `START_DISABLED_FEATURE_MODE` before HTTP | no second feature-mode store; service tests already inject mode | PASS |

## Requirement Coverage Ledger

| Requirement | Source | Obligation | Classification | Change IDs | Todo | Verification IDs | Evidence Class | Blocking |
|---|---|---|---|---|---|---|---|---|
| AC-01 | AC | 显式 `skill-first` 且 consumer lock 完整时，prompt-first Skill 的提交会在 `tools/call` 前进入 `pending-submit`，并以 `clientRequestId` 作为 `X-Idempotency-Key`；Catalog `callable` 蕴含 Main bind 成功。 | BEHAVIOR | C04 | T2 | V02 | UNIT | yes |
| AC-02 | AC | `tools/call` accepted envelope 必须产生 Provider `run_id`；后续 status、SSE、result、cancel 只使用 `/api/v1/runs/{run_id}/*`。缺少 `run_id`、仅有 `task_id` 或 Hermes Task URL 时 fail-closed，且不调用 Expert cancel/start。 | CONTRACT | C01, C02 | T1 | V01 | UNIT | yes |
| AC-03 | AC | 同 session 第二个非终态 start 返回 `RUN_ALREADY_ACTIVE`；Chat 出队使用入队时的 tool/prompt/`clientRequestId` 快照，更换当前 Skill 不改变已提交或已排队请求。 | LIFECYCLE | C05 | T2 | V02, V04 | UNIT | yes |
| AC-04 | AC | SSE 重放使用 `Last-Event-ID` 并按 event identity 去重。SSE 连接仍打开且未终态时，bounded poll 仍能把 projection 推进到 Bundle 终态；terminal 后旧事件不能回退。 | LIFECYCLE | C03 | T2 | V02, V03 | INTEGRATION | yes |
| AC-05 | AC | Cancel 只调用 Skill Run cancel，不调用 Local Chat abort；无 active run 时 fail-closed。 | BEHAVIOR | C04 | T2 | V02, V03 | UNIT | yes |
| AC-06 | AC | 重启后 continuation rehydrate 恢复非终态跟踪与 transcript，不发出第二次 `tools/call`。同进程 fixture 证明 idempotency。跨端 live 同 key 证明延后到 RM-01 重跑，不阻塞本 AC。 | LIFECYCLE | C05 | T2 | V03 | INTEGRATION | yes |
| AC-07 | AC | 最终 Result 更新同一 assistant bubble；`waiting-approval` 只读。本阶段不要求 Preview/Save As/Session Files 或 Checkpoint B 全链路通过。 | BEHAVIOR | C05 | T2 | V04 | DOCUMENT_SEMANTIC | yes |
| AC-08 | AC | 仓库默认 feature mode 为 `expert-compat`；该模式下 UI 提交不产生 `tools/call`。失败路径无 Expert silent fallback。Provider `run_id` 不写入 Renderer `ChatRun.runId`。 | NEGATIVE | C06 | T2, T3 | V02, V05 | UNIT | yes |
| AC-09 | AC | lifecycle/idempotency/reconnect/cancel/queue/rehydrate focused tests 与 `test:skill-run-e2e` **fixture** 通过。env-gated live 入口保留，但 RM-04 `DONE` 不以 live PASS 为前提。 | EVIDENCE | C01, C02, C03, C04, C05, C06 | T1, T2, T3 | V01, V02, V03 | INTEGRATION | yes |
| DOD-01 | DOD | C01/C03/C06 有 APPROVED Stage PRD、validated Plan、review PASS、implementation commit 与 focused/fixture verification；C02 的 Hermes Task Skill-Run bridge 已从生产 Skill Run 路径移除或从未合入；C04/C05 由既有 owner 的回归证据覆盖。 | EVIDENCE | C01, C02, C03, C04, C05, C06 | T1, T2, T3 | V01, V02, V03, V04, V05, V06 | DOCUMENT_SEMANTIC | yes |
| DOD-02 | DOD | RM-01 保持 `BACKLOG`，直到后续阶段重跑 live AC-03/AC-04。RM-04 可以在 RM-01 未 `DONE` 时凭 fixture/focused 证据标记 `DONE`。不得把默认 mode 改为生产 `skill-first`。 | OPERATIONS | C06 | T3 | V05, V06 | DOCUMENT_SEMANTIC | yes |
| DOD-03 | DOD | 发现需要改 Bundle、File Platform identity、生产默认或 Expert 删除的工作，必须返回 RM-01、RM-05、RM-06 或独立 Removal PRD，不得混入 M3。 | SCOPE | C06 | T3 | V06 | DOCUMENT_SEMANTIC | yes |

## Lifecycle Closure Matrix

| Journey | Requirements | Trigger | Nonterminal State | Success Writer | Failure / Cancel Writer | Evidence IDs |
|---|---|---|---|---|---|---|
| Prompt-first start before HTTP | AC-01 | `SkillRunService.start` with explicit `skill-first` and complete consumer lock | `pending-submit` then `starting` | `createSkillRunService.start` writes continuation then `callSkill` | same Service `rejectStart` / failed projection; no Expert writer | V02 |
| Accepted run identity | AC-02 | `tools/call` returns accepted envelope | `starting` / `running` until `run_id` stored | `callSkill` is the only identity writer | `callSkill` throws; Service maps to failed; no Expert start | V01 |
| Single-active session plus queue snapshot | AC-03 | second nonterminal `start` on same `sessionId`; Chat dequeue | first run remains nonterminal | Service rejects with `RUN_ALREADY_ACTIVE`; Chat dequeues stored `skillRequest` | Service only | V02, V04 |
| SSE plus concurrent bounded poll | AC-04 | `consumeSse` after accepted `run_id` | `running` / `waiting-approval` while SSE body is open | `consumeSse` event apply and `pollStatus` snapshot apply through `updateProjection` | `cancel` or failed snapshot/event; `terminalConfirmed` blocks rollback | V02, V03 |
| Cancel | AC-05 | Chat/Service `cancel` with active `clientRequestId` | `running` | not a success path | Service `cancelRun` only; no Local Chat abort | V02, V03 |
| Restart rehydrate | AC-06 | `rehydrate` with stored continuation | restored nonterminal projection | Service resumes `consumeSse` without second `tools/call` | failed snapshot/event; cancel path unchanged | V03 |

## Contract / Data Flow Closure Matrix

| Flow | Requirements | Producer | Transport / Schema | Consumer | Required Fields | Validation Owner | Failure Mapping | Retry / Idempotency Identity | Evidence IDs |
|---|---|---|---|---|---|---|---|---|---|
| MCP tools/call accept | AC-01, AC-02 | `SkillRunService.start` after pending-submit persist | `POST /api/v1/mcp` JSON-RPC `tools/call`; `X-Idempotency-Key`; Bundle accepted `structuredContent` | `SkillRunGatewayClient.callSkill` | `structuredContent.run_id`; no `task_id` SoT | Gateway `callSkill` | missing `run_id` or task-only envelope: Gateway 502 fail-closed; Service failed projection; no Expert | `clientRequestId` is the idempotency key | V01, V02 |
| Run HTTP lifecycle | AC-02, AC-04, AC-05 | Gateway after accepted `run_id` | Bundle `/api/v1/runs/{run_id}`, `/events`, `/result`, `/cancel`, `/artifacts`; `Last-Event-ID` on SSE | `getRunSnapshot`, `openEventStream`, `cancelRun`, `listRunArtifacts` then Service | path `run_id` equals accepted identity | Gateway URL builder | non-2xx: `SkillRunGatewayError`; cancel without active run: `NO_ACTIVE_RUN` | same `run_id`; poll is read-only retry | V01, V03 |
| Projection to Chat/session | AC-03, AC-07, AC-08 | Service `updateProjection` | sanitized `SkillRunProjection` via IPC; transcript via `materializeSkillRunSessionTranscript` | mounted Chat and session materialize | `clientRequestId`; `providerRunId` stays Provider-owned; Chat queue stores `skillRequest` snapshot | Chat snapshot owner; materialize updates same assistant `platform_message_id` | `waiting-approval` has no decision IPC; no JWT/origin in projection | queue snapshot identity is enqueue-time `clientRequestId` | V02, V04 |
| Feature-mode gate | AC-08 | `getSkillRunFeatureMode` / injected test mode | local store file plus `SMC_WORK_SKILL_RUN_MODE` | `createSkillRunService.start` | default `expert-compat` | Service start gate | `START_DISABLED_FEATURE_MODE` before HTTP; no Expert fallback | not an idempotency flow | V02, V05 |

## Verification Ledger

| Verification ID | Level | Entry Point / Command | Oracle | Negative / Regression | Evidence Policy | Environment | Blocking |
|---|---|---|---|---|---|---|---|
| V01 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-gateway-client.test.ts --pool=threads --maxWorkers=1', shell=True))"` | `structuredContent.run_id` accepted; follow-on fetches use `/api/v1/runs/{run_id}/` | `task_id`-only or Hermes Task URL envelope throws; `callSkill` does not invoke Expert | LOCAL_TRANSIENT | local apps/work | yes |
| V02 | UNIT | `python -c "import subprocess,sys; sys.exit(subprocess.call('npm --prefix apps/work exec -- vitest run src/main/skill-run/skill-run-service.test.ts --pool=threads --maxWorkers=1', shell=True))"` | pending-submit before `callSkill`; `X-Idempotency-Key` is `clientRequestId`; `RUN_ALREADY_ACTIVE`; cancel calls `cancelRun` not abortChat; hanging SSE still reaches terminal via poll; `expert-compat` start is `START_DISABLED_FEATURE_MODE` | terminal snapshot cannot be rolled back by a later nonterminal event; no Expert fallback | LOCAL_TRANSIENT | local apps/work | yes |
| V03 | INTEGRATION | `python -c "import os,subprocess,sys; os.environ.pop('SMC_SKILL_RUN_E2E', None); sys.exit(subprocess.call('npm --prefix apps/work run test:skill-run-e2e', shell=True))"` | fixture suite PASS including reconnect `Last-Event-ID`, cancel, idempotent replay, rehydrate without second `tools/call`, and hanging-SSE plus poll | live describe stays skipped without live env; fixture `tools/call` uses Bundle `structuredContent.run_id` | LOCAL_TRANSIENT | local apps/work | yes |
| V04 | DOCUMENT | `python -c "from pathlib import Path; import sys; c=Path('apps/work/src/renderer/src/screens/Chat/Chat.tsx').read_text(encoding='utf-8'); m=Path('apps/work/src/main/skill-run/skill-run-session-materialize.ts').read_text(encoding='utf-8'); i=Path('apps/work/src/main/skill-run/skill-run-ipc.ts').read_text(encoding='utf-8'); ok=('skillRequest: request' in c and 'item.skillRequest.clientRequestId' in c and 'UPDATE messages SET content' in m and 'ids.assistant' in m and 'approval-decision' not in i and 'approveSkill' not in i); sys.exit(0 if ok else 1)"` | Chat dequeue uses enqueue-time `skillRequest`; materialize updates the same assistant row; IPC has no approval decision handler | Preview/Save As/Session Files remain out of this Plan | LOCAL_TRANSIENT | local repo | yes |
| V05 | DOCUMENT | `python -c "from pathlib import Path; import sys; f=Path('apps/work/src/main/skill-run/feature-mode-store.ts').read_text(encoding='utf-8'); r=Path('apps/work/src/renderer/src/screens/Layout/chatRuns.ts').read_text(encoding='utf-8'); ok=('const DEFAULT_MODE: SkillRunFeatureMode = \"expert-compat\"' in f and 'const DEFAULT_MODE: SkillRunFeatureMode = \"skill-first\"' not in f and 'providerRunId' not in r); sys.exit(0 if ok else 1)"` | store default is `expert-compat`; Layout `ChatRun` has no `providerRunId` field | production default `skill-first` remains M5 | LOCAL_TRANSIENT | local repo | yes |
| V06 | DOCUMENT | `python -c "from pathlib import Path; import sys; r=Path('docs/work/ROADMAP-WORK-v4.0.1-skill-first-layout-run-integration.md').read_text(encoding='utf-8'); p=Path('apps/work/src/main/skill-run/skill-run-gateway-client.ts').read_text(encoding='utf-8'); ok=('RM-01' in r and 'BACKLOG' in r and 'keep BACKLOG and re-verify' in r and '/api/v1/hermes/tasks/' not in p); sys.exit(0 if ok else 1)"` | RM-01 stays BACKLOG with deferred live; Skill Run gateway has no Hermes Task path | M3 must not edit Bundle, File Platform identity, or Expert removal | LOCAL_TRANSIENT | local repo | yes |

## Immediate Read

- `docs/work/PRD-WORK-v4.0.1-M3-executable-run-and-recovery.md`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill`
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient`
- `apps/work/src/main/skill-run/skill-run-service.ts#consumeSse`
- `apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE`
- `contracts/skill-run/v1.2.1/fixtures/tools-call-accepted.json`
- `contracts/skill-run/v1.2.1/http/endpoint-matrix.json`

## Triggered Read

- If working-tree `callSkill` still contains Hermes Task bridging: delete that branch, do not extend it
- If e2e `tools/call` fixture still returns top-level `run_id` only: update that fixture to Bundle `structuredContent.run_id` in T2, do not loosen T1 parse
- If hanging-SSE unit proof cannot complete because `pollStatus` waits on `setTimeout(4000)` before the first snapshot: invoke `pollStatus` immediately from `consumeSse`, do not add a new poll service
- If `lat.md/skill-run.md` current text still describes Hermes Task as Skill Run transport: T2 rewrites that section only
- Do not read File Platform transfer, ExpertRunService, live lab credentials, or RM-05 Preview/Save As

## Change Matrix

| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill` | PROD | MODIFY | SkillRunGatewayClient | T1 | accept only Bundle `structuredContent.run_id`; status/SSE/result/cancel stay on `/api/v1/runs/{run_id}/*` | Native run_id transport | no |
| C01 | `apps/work/src/main/skill-run/skill-run-gateway-client.test.ts` | TEST | MODIFY | gateway unit tests | T1 | V01 structuredContent happy path and follow-on `/api/v1/runs/` assertions | Native run_id evidence | no |
| C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill` | PROD | REMOVE | SkillRunGatewayClient | T1 | `task_id` / Hermes Task URL is not Run SoT; fail-closed; no Expert call | Hermes Task Skill-Run bridge | no |
| C03 | `apps/work/src/main/skill-run/skill-run-service.ts#consumeSse` | PROD | MODIFY | SkillRunService | T2 | start bounded `pollStatus` while SSE is still open; keep Last-Event-ID and terminal monotonic | Concurrent bounded poll | no |
| C03 | `apps/work/src/main/skill-run/skill-run-service.test.ts` | TEST | MODIFY | service unit tests | T2 | hanging-SSE plus snapshot terminal; KEEP C04/C05 regressions stay green | Concurrent poll evidence | no |
| C03 | `apps/work/src/main/skill-run/skill-run-e2e.test.ts` | TEST | MODIFY | skill-run e2e fixture | T2 | fixture `structuredContent.run_id`; hanging-SSE poll case; live suite remains env-gated | Fixture lifecycle evidence | no |
| C03 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | work lat skill-run | T2 | document native run_id, concurrent poll, no Hermes Task SoT, default expert-compat, deferred RM-01 live | Lifecycle documentation | no |
| C04 | `apps/work/src/main/skill-run/skill-run-service.ts#createSkillRunService` | PROD | KEEP | SkillRunService | - | pending-submit, idempotency, cancel, terminal monotonic unchanged | Durable start and cancel | no |
| C05 | `apps/work/src/renderer/src/screens/Chat/Chat.tsx` | PROD | KEEP | mounted Chat | - | queue snapshot and single-active Service gate unchanged | Queue snapshot and rehydrate | no |
| C06 | `apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE` | PROD | MODIFY | feature-mode store | T3 | default `expert-compat`; env/store override unchanged | Feature-mode default | no |

## Implementation Decisions

| Change ID | Strategy | Root-Cause / Reuse Evidence | Why This Is Minimum |
|---|---|---|---|
| C01 | MODIFY_EXISTING | `callSkill` is the only accepted-identity parser; HTTP helpers already use `/api/v1/runs/{id}` at `92748e36` | changing the parse in the existing client avoids a second transport owner |
| C02 | REMOVE_ONLY | committed baseline has no Hermes Skill Run route table; working-tree `task_id` bridge is the defect to keep out | delete or never add the alias; do not create a compatibility mapper |
| C03 | MODIFY_EXISTING | `pollStatus` already understands Bundle snapshots; it is only started after SSE disconnect | start the existing poller from `consumeSse`; no new recovery service |
| C04 | REUSE_EXISTING | `createSkillRunService.start` already persists `pending-submit` and cancel already calls `cancelRun` | evidence only; no second lifecycle owner |
| C05 | REUSE_EXISTING | Chat already stores `skillRequest` on enqueue; e2e already rehydrates without a second `tools/call` | evidence only; no Session SoT change |
| C06 | MODIFY_EXISTING | `DEFAULT_MODE` is the committed default used when env and store file are absent | one constant restore; M5 remains production-default owner |

## Write Ownership Ledger

| Todo | Owns Changes | Writes | Reads | Depends On | Parallel Safe |
|---|---|---|---|---|---|
| T1 | C01, C02 | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.test.ts` | `contracts/skill-run/v1.2.1/fixtures/tools-call-accepted.json`<br>`apps/work/src/main/skill-run/skill-run-gateway-client.ts#createSkillRunGatewayClient` | - | no |
| T2 | C03 | `apps/work/src/main/skill-run/skill-run-service.ts#consumeSse`<br>`apps/work/src/main/skill-run/skill-run-service.test.ts`<br>`apps/work/src/main/skill-run/skill-run-e2e.test.ts`<br>`apps/work/lat.md/skill-run.md` | `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill`<br>`apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE`<br>`apps/work/src/main/skill-run/skill-run-service.ts#pollStatus` | T1, T3 | no |
| T3 | C06 | `apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE` | `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode` | - | no |

## Integration Hotspots

| File | Owner Todo | Reason |
|---|---|---|
| `apps/work/src/main/skill-run/skill-run-gateway-client.ts` | T1 | accepted identity, route table, and fail-closed share one client closure |
| `apps/work/src/main/skill-run/skill-run-service.ts` | T2 | `consumeSse` must start `pollStatus` in the same ActiveRun closure |
| `apps/work/lat.md/skill-run.md` | T2 | single documentation writer after transport and default-mode land |

## Generated Outputs Ledger

None

## Todo T1 — Native run_id transport and Hermes removal

**Owns Changes**
- C01
- C02

**Goal**

Make `callSkill` accept only Bundle `structuredContent.run_id`, keep follow-on HTTP on `/api/v1/runs/{run_id}/*`, and fail closed on `task_id` or Hermes Task URLs without calling Expert.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-gateway-client.ts#callSkill`
- `contracts/skill-run/v1.2.1/fixtures/tools-call-accepted.json`

**Changes**
- Parse accepted identity from `structuredContent.run_id` only.
- Do not alias `task_id`, Hermes Task URLs, or Expert slugs into `providerRunId`.
- Do not copy `agent_alias` / `agent_id` / `profile_id` / `installation_id` into the public accepted DTO.
- If the working tree still has Hermes Task route helpers, debug `debugger`, or a passing Hermes-bridge test, remove them instead of keeping a compatibility path.
- Extend gateway unit tests for the v1.2.1 happy path and the task-only negative.

**Stop conditions**
- [ ] `callSkill` returns the Bundle `run_id` from `structuredContent`
- [ ] missing `run_id` or `task_id`-only envelope throws fail-closed
- [ ] follow-on client methods still use `/api/v1/runs/{run_id}/*` only
- [ ] V01 command output is PASS
- [ ] no Expert start/cancel call is added

**Triggered reads**
- If working-tree `callSkill` still contains Hermes Task bridging: delete that branch, do not extend it
- Otherwise: do not read Expert task clients

## Todo T2 — Concurrent bounded poll and lifecycle evidence

**Owns Changes**
- C03

**Goal**

Start existing `pollStatus` while SSE is still open so a hung nonterminal stream cannot block Bundle terminal, then prove KEEP lifecycle plus fixture e2e.

**Immediate anchors**
- `apps/work/src/main/skill-run/skill-run-service.ts#consumeSse`
- `apps/work/src/main/skill-run/skill-run-e2e.test.ts`

**Changes**
- At the start of `consumeSse`, invoke existing `pollStatus` without waiting for SSE disconnect; keep the post-disconnect poll as fallback.
- Preserve `Last-Event-ID` reconnect, `seenEventIds` dedupe, and `terminalConfirmed` monotonic updates.
- Add a hanging-SSE unit/fixture case where snapshot poll reaches a Bundle terminal.
- Point the e2e `tools/call` fixture at Bundle `structuredContent.run_id` so it stays compatible with T1.
- Do not enable live e2e; do not treat RM-01 live as this Plan's proof.
- Update `apps/work/lat.md/skill-run.md` for native run_id, concurrent poll, no Hermes Task SoT, restored default `expert-compat`, and deferred RM-01 live.

**Stop conditions**
- [ ] hanging SSE with succeeded snapshot reaches a terminal projection
- [ ] reconnect still sends `Last-Event-ID`
- [ ] KEEP cancel, pending-submit, single-active, and rehydrate tests stay green
- [ ] `npm run test:skill-run-e2e` fixture PASS without `SMC_SKILL_RUN_E2E`
- [ ] V02, V03, and V04 commands PASS
- [ ] lat skill-run section matches the approved owners

**Triggered reads**
- If e2e `tools/call` fixture still returns top-level `run_id` only: update that fixture to Bundle `structuredContent.run_id` in this Todo
- If first poll is delayed by `setTimeout(4000)` before any snapshot: start `pollStatus` immediately from `consumeSse`
- Otherwise: do not add a poll interval option or second service

## Todo T3 — Restore expert-compat default

**Owns Changes**
- C06

**Goal**

Restore the repository default feature mode to `expert-compat` so new submits do not enter Skill Run unless the developer explicitly enables `skill-first`.

**Immediate anchors**
- `apps/work/src/main/skill-run/feature-mode-store.ts#DEFAULT_MODE`
- `apps/work/src/main/skill-run/feature-mode-store.ts#getSkillRunFeatureMode`

**Changes**
- Set `DEFAULT_MODE` to `expert-compat`.
- Leave `SMC_WORK_SKILL_RUN_MODE` and the store file as explicit overrides.
- Do not change M5 production-default ownership and do not delete Expert entry points.

**Stop conditions**
- [ ] `DEFAULT_MODE` is `expert-compat`
- [ ] source no longer defaults to `skill-first`
- [ ] V05 and V06 commands PASS

**Triggered reads**
- None unless `getSkillRunFeatureMode` no longer returns `DEFAULT_MODE` when env and store file are absent

## Verification

Run the Verification Ledger entries through `smc-plan-delivery/scripts/evidence.py`.

## Completion Gate

| Exit State | Allowed When | Blocking Evidence |
|---|---|---|
| IMPLEMENTED_AND_PROVEN | all Cursor todos completed; completion audit FRESH PASS; implementation review FRESH PASS; all blocking Verification FRESH PASS; durable Evidence Manifest FRESH | V01, V02, V03, V04, V05, V06 via SMC evidence ledger + durable Evidence Manifest |
| IMPLEMENTED_NOT_PROVEN | implementation exists but completion audit, implementation review, or a blocking Verification is pending or stale | pending/stale V01-V06 or review/audit ids |
| BLOCKED | environment or dependency prevents implementation or proof | blocker record |
| RETURN_PRD | approved owner/boundary conflicts with current reality, including any need to change Bundle, File Platform identity, production default, or Expert removal | PRD revision request |
