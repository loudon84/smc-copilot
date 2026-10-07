# Remote Expert (ACP v2)

Original Chat can select a catalog Remote Expert. Electron Main owns WSS, JWT, org fencing, attachments, and artifacts. The renderer only sees sanitized semantic events.

## Contract lock

Pinned Provider files live under `contracts/remote-expert-frontend/v2.0.0/` plus `consumer-lock.json`. Runtime pin is [[src/shared/remote-expert.ts]].

Compatibility is eight-field exact match in [[src/main/remote-expert/remote-expert-contract-gate.ts#ensureCompatibleContract]]. `frontendContractDigest` is SHA256 of raw SHA256SUMS and must not equal the frontend bundle digest.

## Bounded context

Main code lives in [[src/main/remote-expert/remote-expert-ipc.ts]]. It must not import Skill Run execution modules or the retired Work Expert HermesTask path.

Chat entry is [[src/renderer/src/modules/remote-expert/RemoteExpertContextControl.tsx]] via ChatInput toolbarExtras. Unselected Chat remains Local Hermes. `executionMode === "remote-expert"` is fail-closed: a disabled contract gate toasts and greys the selector; it never falls through to Local Hermes.

## Entry discoverability

Entry visibility is product capability, not provider availability. [[src/renderer/src/modules/remote-expert/entry-eligibility.ts#isRemoteExpertEntryVisible]] mounts the control on Original Chat (`executionMode !== "skill-run"` and `knowledgeRequired !== true`) even when discovery fails. Skill Run and Knowledge Chat never show the entry.

[[src/renderer/src/modules/remote-expert/useRemoteExpertEntryState.ts]] keeps Availability as `checking | compatible | incompatible | unavailable` with `gateState` / `reason` / `errorCode`, latest-wins retries, and Catalog as `idle | loading | ready | empty | error`. Catalog `listCatalog` runs only after `compatible`.

## ChatRun selection

Layout owns scratch `remoteExpertAgentRef` via [[src/renderer/src/screens/Layout/chatRuns.ts#selectRemoteExpertModeTransition]].

Blank scratch converts in place; bound runs require confirm and mint a new scratch. After ACP session exists, durable `RemoteAcpSessionRef.agentRef` wins over any stale scratch field.

## Session identity

SMC `desktopSessionId` is local history identity; Provider `acpSessionId` is remote continuity.

For Remote Expert runs, Layout mints desktop id into `ChatRun.sessionId` at run create and remints on Local↔Remote mode switch. Rows live in `desktop_remote_acp_sessions` with state `active | disconnected | closed | expired`. Session class is `chat/remote-expert-acp`.

Resume uses `session/resume` with `_meta.nodeskclaw.after_seq` and never silent `session/new`. Provider session-not-found and `session/new` control-plane timeout (unknown commit) mark `expired` without blind retry; a late `session/new` result may still bind.

Closing a Remote Expert Chat tab best-effort `session/cancel` then `session/close`. Disconnected runtimes are discarded and rebuilt before resume. `closed` is not overwritten by a later socket `disconnected`. Token refresh does not drop ACP; logout or a change of `(userId, tenantId)` does.

## Turn lifecycle

`session/prompt` has no RPC timer; long turns follow the socket lifecycle.

Only socket close, `session/cancel`, or a Provider error frame ends the prompt Promise. Control methods keep a short timeout. Overlapping submit while `PROMPT_ACTIVE` / reconnecting is hard-rejected (toast). After prompt is in flight, Renderer keeps the turn mapping on disconnect until real `turn.end` or `expired` (HF-6 cleanup is pre-prompt only). Settled prompt result/error emits exactly one `turn.end`; pre-prompt / IN_FLIGHT disconnect does not.

Seq dedupe is **turn-scoped**: [[src/main/remote-expert/remote-acp-client.ts#resetTurnCursor]] zeros `lastSeq` before each `session/prompt`. Between-turn `session/resume` / capability remint always use `afterSeq=0`. `desktop_remote_acp_sessions.last_seq` remains a diagnostic watermark only.

Transcript materialize skips empty assistant/reasoning inserts and upserts final content on the second write. [[src/main/remote-expert/acp-event-mapper.ts]] maps rich tool fields (`status`, `rawInput`, `structuredContent`, `error*`, `redacted`, `truncated`) with tolerant parsing; Chat upserts tool cards by `(turnId,toolCallId)` and must not paint failed as completed.

## Build provenance

Packaged `resources/work-build-info.json` (schema `smc.work.build.v1`) records `version/gitCommit/gitBranch/buildTime/dirty`. G7 A-SMC-006 records those fields in evidence without tokens or capability material. Pin remains frontend-contract **v2.0.0**; v2.1.0 pin-finalization is BLOCKED until Provider freeze (`REMOTE_EXPERT_PIN_FINALIZATION_STATUS`).

## Transport

[[src/main/remote-expert/remote-acp-client.ts]] opens WSS with `ws`, Bearer, `X-Org-Id`, and `X-Trace-Id`.

The negotiated subprotocol must equal `nodeskclaw.remote-acp.v1` (empty is rejected). Query credentials are rejected locally. `bootClient` is single-flight per desktop session id.

## Files

Public attachments become ResourceLink `nodeskclaw://attachment/att_*` via [[src/main/remote-expert/remote-attachment-client.ts]]. Artifact ResourceLinks `nodeskclaw://artifact/{run}/{id}` materialize through File Platform [[src/main/remote-expert/remote-artifact-client.ts]] and [[src/main/files/stream-managed-remote-bytes.ts#streamManagedRemoteBytes]]. A malformed artifact link is logged and skipped; it must not crash Main.

## Evidence gates

G6 (`scripts/remote-expert-g6.mjs`) maps vitest titles containing `[A-…-nnn]` into commit-bound `test-results/remote-expert-g6.json`, including rich-process Required Acceptance `A-SMC-001`..`A-SMC-006` (`A-SMC-007` deferred). Dirty worktree or uncovered Required Acceptance cannot PASS. Use `--release-worktree` for clean release evidence.

G7 (`scripts/remote-expert-g7.mjs`) is a conditional live harness over production consumer modules (`tests/remote-expert/live/`). Missing env or dirty consumer yields `BLOCKED` (exit != 0); complete prerequisites execute A-G7-LIVE-* plus rich/seq-reset/multi-turn/provenance cases against a designated test Expert.
