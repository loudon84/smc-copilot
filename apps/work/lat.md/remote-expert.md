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

SMC `desktopSessionId` is local history identity. Provider `acpSessionId` is remote continuity in `desktop_remote_acp_sessions`. Connection state is `active | disconnected | closed | expired`.

Resume uses `session/resume` with `_meta.nodeskclaw.after_seq` and never silent `session/new`. Provider session-not-found marks the row `expired` and the UI asks the user to start a new request. Session class is `chat/remote-expert-acp`.

Disconnected runtimes are discarded and rebuilt before resume. `closed` is not overwritten by a later socket `disconnected`. Token refresh does not drop ACP; logout or a change of `(userId, tenantId)` does.

## Transport

[[src/main/remote-expert/remote-acp-client.ts]] opens WSS with `ws`, Bearer, `X-Org-Id`, and `X-Trace-Id`. The negotiated subprotocol must equal `nodeskclaw.remote-acp.v1` (empty is rejected). Query credentials are rejected locally.

## Files

Public attachments become ResourceLink `nodeskclaw://attachment/att_*` via [[src/main/remote-expert/remote-attachment-client.ts]]. Artifact ResourceLinks `nodeskclaw://artifact/{run}/{id}` materialize through File Platform [[src/main/remote-expert/remote-artifact-client.ts]] and [[src/main/files/stream-managed-remote-bytes.ts#streamManagedRemoteBytes]]. A malformed artifact link is logged and skipped; it must not crash Main.

## Evidence gates

G6 (`scripts/remote-expert-g6.mjs`) maps vitest titles containing `[A-…-nnn]` into commit-bound `test-results/remote-expert-g6.json`. Dirty worktree or uncovered Required Acceptance cannot PASS. Use `--release-worktree` for clean release evidence.

G7 (`scripts/remote-expert-g7.mjs`) is a conditional live harness over production consumer modules (`tests/remote-expert/live/`). Missing env or dirty consumer yields `BLOCKED` (exit != 0); complete prerequisites execute A-G7-LIVE-001..015 against a designated test Expert.
