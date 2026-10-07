# ADR-039: Work Chat execution context is immutable after binding

Once an Original Chat conversation is bound to **Local Chat** or to a specific **Remote Expert**, that execution context MUST NOT be changed on the same Chat run. History reopen MUST restore the binding. Changing context requires a new Chat (confirm + mint scratch).

## Status

Accepted. Implementation baseline: `apps/work` commit `120757cd` (and subsequent follow-ups). Applies to all Work Original Chat / Remote Expert Consumer work.

## Context

Reopening a Remote Expert history session dropped `ChatRun.remoteExpertAgentRef`, so the toolbar showed **Local chat** while Main still held a durable `desktop_remote_acp_sessions` row. Submitting then hit Provider errors such as `prior runtime session binding missing` (surfaced as `ACP_PROTOCOL_ERROR`). Users could also re-select Local / another Expert on a non-empty transcript, which violates one-conversation-one-context.

## Decision

1. **Immutable bound context.** After a Chat run is bound — non-empty transcript, or resumed with a known `sessionId` — the expert selector MUST be disabled. The user MUST NOT switch Local ↔ Remote Expert or change `agentRef` on that run.
2. **Scratch-only selection.** Local ↔ Expert / Expert ↔ Expert selection is allowed only on blank scratch runs (no transcript, not a history resume). Bound runs that need another context MUST use the existing `selectRemoteExpertModeTransition` **requires-confirm** path and mint a new scratch ChatRun.
3. **History resume restores expert.** When `resolveResumeExecutionMode` yields `remote-expert`, Layout MUST call `remoteExpert.resume`, then pass durable `RemoteAcpSessionRef.agentRef` into `buildResumedChatRun` as `remoteExpertAgentRef`. Resume MUST NOT leave the UI on Local chat when the sidebar pair is `chat` + `remote-expert-acp`.
4. **Durable agentRef wins.** After ACP session exists, `RemoteAcpSessionRef.agentRef` is the source of truth for submit routing; scratch `remoteExpertAgentRef` MUST NOT override a conflicting durable ref.
5. **Provider binding-lost is session lost.** Provider messages matching `prior runtime session binding missing` (and equivalent session-not-found / resume-forbidden codes) MUST map to `REMOTE_EXPERT_SESSION_LOST`, mark the desktop session `expired`, emit exactly one failed `turn.end`, and block further continue-on-same-session UX (expired / cannot-continue), not a silent Local Chat fallback.

## Considered Options

- Allow in-place expert switch with confirm on the same sessionId: rejected (ACP continuity and transcript ownership break; Provider binding is per session).
- Keep toolbar editable and only warn: rejected (users re-selected Local and re-triggered the bug).
- On binding-missing, auto `session/new` under the same desktop id: rejected (unknown commit / continuity rules; prefer expire + new Chat).

## Consequences

- UI: `RemoteExpertContextControl` disabled when `messages.length > 0` or `initialSessionId` is set.
- Layout: resume path must thread `remoteExpertAgentRef` from ACP session store.
- Main: `mapAcpRpcError` + turn service expired path for binding-missing.
- Agents and PRDs MUST treat bound Chat execution context as immutable; do not reintroduce in-place Local↔Expert mutation on history or non-empty runs.
- Documented for product architecture in [`docs/architecture/work-chat-execution-context.md`](../architecture/work-chat-execution-context.md) and Work lat [`apps/work/lat.md/remote-expert.md`](../../apps/work/lat.md/remote-expert.md).

## References

- Implementation: `apps/work/src/renderer/src/screens/Layout/chatRuns.ts` (`buildResumedChatRun`, `selectRemoteExpertModeTransition`), `Layout.tsx` resume, `Chat.tsx` selector lock, `remote-acp-client.ts#mapAcpRpcError`, `remote-expert-turn-service.ts`
- Related PRDs: Remote ACP v2 Consumer, Turn Lifecycle Hotfix, Rich Process v6.3.1 (pin/turn cursor remain separate)
