# Work Chat execution context (immutable binding)

**Normative decision:** [ADR-039](../adr/ADR-039-work-chat-execution-context-immutable.md).

This document is the architecture SOT for Original Chat **execution context** in `apps/work`. Later features, PRDs, and agent implementations MUST follow it.

## Scope

- Original Chat / Compose in `apps/work` (not Skill Run, not Knowledge kb-set Chat).
- Modes: `local-chat` | `remote-expert` (and skill-run remains a separate mode that never shares this selector).

## Rules (MUST)

| # | Rule |
| --- | --- |
| R1 | A Chat run has at most one execution context: Local Chat **or** one Remote Expert `agentRef`. |
| R2 | After the run is **bound** (non-empty transcript, or opened from history with a `sessionId`), the expert selector MUST be disabled. No Local↔Expert or Expert↔Expert change on that run. |
| R3 | Changing context requires a **new** Chat run (confirm + mint scratch) via `selectRemoteExpertModeTransition` `requires-confirm`. |
| R4 | History resume for `sessionKind=chat` + `executionProvider=remote-expert-acp` MUST restore `remoteExpertAgentRef` from durable `RemoteAcpSessionRef.agentRef` after `remoteExpert.resume`. |
| R5 | After ACP session exists, durable `agentRef` wins over scratch for send routing. |
| R6 | Provider `prior runtime session binding missing` (and session-not-found / resume-forbidden) ⇒ `REMOTE_EXPERT_SESSION_LOST` ⇒ desktop session `expired`; do not fall back to Local Chat on the same run. |

## Ownership

| Concern | Owner |
| --- | --- |
| Scratch / bound ChatRun fields | Layout (`chatRuns.ts`) |
| Expert selector enablement | Chat (`Chat.tsx` → `RemoteExpertContextControl`) |
| Durable ACP binding | Main (`desktop_remote_acp_sessions`, turn service) |
| Provider error mapping | Main (`mapAcpRpcError`) |

## Identity

- **Local / Hermes:** gateway `sessionId` appears after first turn.
- **Remote Expert:** SMC `desktopSessionId` is history identity; Provider `acpSessionId` is remote continuity. Resume uses `session/resume` with turn-scoped `afterSeq=0` (see lat remote-expert turn lifecycle); never silent `session/new` to “fix” a lost binding under the same desktop id.

## Anti-patterns (MUST NOT)

- Resume remote history into a ChatRun that shows Local chat because `remoteExpertAgentRef` was omitted.
- Re-enable the expert selector on a resumed or non-empty conversation “for convenience”.
- Auto-create a new ACP session when Provider reports binding missing, without user starting a new Chat.
- Mutating `executionMode` / `agentRef` in place on a bound run.

## Code anchors

- [`apps/work/src/renderer/src/screens/Layout/chatRuns.ts`](../../apps/work/src/renderer/src/screens/Layout/chatRuns.ts) — `buildResumedChatRun`, `selectRemoteExpertModeTransition`, `resolveResumeExecutionMode`
- [`apps/work/src/renderer/src/screens/Layout/Layout.tsx`](../../apps/work/src/renderer/src/screens/Layout/Layout.tsx) — history resume
- [`apps/work/src/renderer/src/screens/Chat/Chat.tsx`](../../apps/work/src/renderer/src/screens/Chat/Chat.tsx) — selector lock + send routing
- [`apps/work/src/main/remote-expert/remote-acp-client.ts`](../../apps/work/src/main/remote-expert/remote-acp-client.ts) — `mapAcpRpcError`
- Work lat: [`apps/work/lat.md/remote-expert.md`](../../apps/work/lat.md/remote-expert.md)
