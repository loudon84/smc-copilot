# Remote Expert (ACP v2.1)

Original Chat can select a catalog Remote Expert. Electron Main owns WSS, JWT, org fencing, attachments, and artifacts. The renderer only sees sanitized semantic events.

## Contract lock

Pinned Provider files live under `contracts/remote-expert-frontend/v2.1.0/` plus `consumer-lock.json`. Runtime pin is [[src/shared/remote-expert.ts]] with `REMOTE_EXPERT_PIN_FINALIZATION_STATUS=PINNED_V2_1_0`.

Compatibility is eight-field exact match in [[src/main/remote-expert/remote-expert-contract-gate.ts#ensureCompatibleContract]]. Hard fail-closed fields: `frontendContractVersion`, `frontendContractDigest`, `catalogContractDigest`, `remoteAcpContractDigest` (plus catalog/remote-acp version, protocol, transport). `RUNTIME_CONTRACT_DIGEST` is observational only and must not alone block the gate. `frontendContractDigest` is SHA256 of raw SHA256SUMS and must not equal the frontend bundle digest.

## Bounded context

Main code lives in [[src/main/remote-expert/remote-expert-ipc.ts]]. It must not import Skill Run execution modules or the retired Work Expert HermesTask path.

Chat entry is [[src/renderer/src/modules/remote-expert/RemoteExpertContextControl.tsx]] via ChatInput toolbarExtras. Unselected Chat remains Local Hermes. `executionMode === "remote-expert"` is fail-closed: a disabled contract gate toasts and greys the selector; it never falls through to Local Hermes.

## Entry discoverability

Entry visibility is product capability, not provider availability. [[src/renderer/src/modules/remote-expert/entry-eligibility.ts#isRemoteExpertEntryVisible]] mounts the control on Original Chat (`executionMode !== "skill-run"` and `knowledgeRequired !== true`) even when discovery fails. Skill Run and Knowledge Chat never show the entry.

[[src/renderer/src/modules/remote-expert/useRemoteExpertEntryState.ts]] keeps Availability as `checking | compatible | incompatible | unavailable` with `gateState` / `reason` / `errorCode`, latest-wins retries, and Catalog as `idle | loading | ready | empty | error`. Catalog `listCatalog` runs only after `compatible`.

## ChatRun selection

Layout owns scratch `remoteExpertAgentRef` via [[src/renderer/src/screens/Layout/chatRuns.ts#selectRemoteExpertModeTransition]].

Blank scratch converts in place; bound runs require confirm and mint a new scratch. After ACP session exists, durable `RemoteAcpSessionRef.agentRef` wins over any stale scratch field.

**Immutable bound context (ADR-039):** once a run has transcript or was opened from history (`initialSessionId`), the expert selector MUST stay disabled — no Local↔Expert or Expert↔Expert change on that run. Normative architecture: repo `docs/architecture/work-chat-execution-context.md` and `docs/adr/ADR-039-work-chat-execution-context-immutable.md`.

## Session identity

SMC `desktopSessionId` is local history identity; Provider `acpSessionId` is remote continuity.

For Remote Expert runs, Layout mints desktop id into `ChatRun.sessionId` at run create and remints on Local↔Remote mode switch. Rows live in `desktop_remote_acp_sessions` with state `active | disconnected | closed | expired`. Session class is `chat/remote-expert-acp`.

Resume uses `session/resume` with turn-scoped `afterSeq=0` and never silent `session/new`. History resume MUST restore `remoteExpertAgentRef` from the durable ACP session ref after `remoteExpert.resume` ([[src/renderer/src/screens/Layout/chatRuns.ts#buildResumedChatRun]]). Provider continuity codes (`ACP_RUNTIME_SESSION_BINDING_MISSING`, `ACP_RUNTIME_SESSION_CONTINUITY_LOST`), session-not-found, resume-forbidden, and `session/new` control-plane timeout (unknown commit) mark `expired` without blind retry; a late `session/new` result may still bind. [[src/main/remote-expert/remote-acp-client.ts#mapAcpRpcError]] passthroughs those Provider codes (wrapping codes are fallback only).

Closing a Remote Expert Chat tab best-effort `session/cancel` then `session/close`. Disconnected runtimes are discarded and rebuilt before resume. `closed` is not overwritten by a later socket `disconnected`. Token refresh does not drop ACP; logout or a change of `(userId, tenantId)` does.

## Turn lifecycle

`session/prompt` has no RPC timer; long turns follow the socket lifecycle.

Only socket close, `session/cancel`, or a Provider error frame ends the prompt Promise. Control methods keep a short timeout. Overlapping submit while `PROMPT_ACTIVE` / reconnecting is hard-rejected (toast). After prompt is in flight, Renderer keeps the turn mapping on disconnect until real `turn.end` or `expired` (HF-6 cleanup is pre-prompt only). Settled prompt result/error emits exactly one `turn.end`; pre-prompt / IN_FLIGHT disconnect does not.

`ACP_REMOTE_RUN_FAILED` (including RPC-error channel) keeps any streamed assistant body and emits `turn.end outcome=failed` — never soft-complete to `end_turn`/`completed`.

Seq dedupe is **turn-scoped**: [[src/main/remote-expert/remote-acp-client.ts#RemoteAcpClient#resetTurnCursor]] zeros `lastSeq` before each `session/prompt`. Between-turn `session/resume` / capability remint always use `afterSeq=0`. `desktop_remote_acp_sessions.last_seq` remains a diagnostic watermark only.

Assistant projection: `agent_message_chunk` → `assistant.delta` (append); `agent_message` → `assistant.snapshot` (replace / reconcile). Matching snapshot must not second-append. Mismatch → `ACP_STREAM_RECONCILIATION_MISMATCH` fail-closed.

Transcript materialize skips empty assistant/reasoning inserts and upserts final content on the second write. [[src/main/remote-expert/acp-event-mapper.ts]] maps rich tool fields (`status`, `rawInput`, `structuredContent`, `error*`, `redacted`, `truncated`) with tolerant parsing; Chat upserts tool cards by `(turnId,toolCallId)` and must not paint failed as completed.

## Build provenance

Packaged `resources/work-build-info.json` records version/gitCommit/branch/buildTime/dirty.

G7 A-SMC-006 records those fields without tokens. Pin is frontend-contract **v2.1.0** (`PINNED_V2_1_0`).

## Transport

[[src/main/remote-expert/remote-acp-client.ts]] opens WSS with `ws`, Bearer, `X-Org-Id`, and `X-Trace-Id`.

The negotiated subprotocol must equal `nodeskclaw.remote-acp.v1` (empty is rejected). Query credentials are rejected locally. `bootClient` is single-flight per desktop session id.

## Files

Public attachments become ResourceLink `nodeskclaw://attachment/att_*` via [[src/main/remote-expert/remote-attachment-client.ts]]. Artifact ResourceLinks `nodeskclaw://artifact/{run}/{id}` materialize through File Platform [[src/main/remote-expert/remote-artifact-client.ts]] and [[src/main/files/stream-managed-remote-bytes.ts#streamManagedRemoteBytes]]. A malformed artifact link is logged and skipped; it must not crash Main.

## Evidence gates

G6 maps `[A-…-nnn]` vitest titles into `test-results/remote-expert-g6.json`.

Required IDs include rich-process `A-SMC-001`..`006` and EXT-G5 `A-SMC-2101`..`2106` / `A-MIG-2101` / `A-MIG-2102` / `A-G5-ALL`. Evidence sets `productionGate: "unpassed"`. Dirty worktree or uncovered Required cannot PASS.

G7 (`scripts/remote-expert-g7.mjs`) is env-gated live. Missing env yields `BLOCKED`; when ready it runs A-G7-LIVE-* plus A-SMC-2107 Local isolation.
