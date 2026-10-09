# Chat Runtime projection contract

Work Chat keeps one transcript rendering model while each external Runtime retains its authoritative wire contract and lifecycle owner.

## Rendering owner

[[src/renderer/src/screens/Chat/types.ts#ChatMessage]] is the Renderer-only transcript union, and [[src/renderer/src/screens/Chat/MessageList.tsx#MessageList]] renders Bubble, Reasoning, Tool, and Clarify rows without Provider-specific transcript branches.

Artifacts never become a ChatMessage kind. Chat resource cards and Session Files consume the same File Platform resource identity described by [[expert-execution#Continuation and artifacts]] and [[session-file-context#Agent Output Section]].

## Event projection boundary

External wire events are validated by their existing transport owner and normalized before one Renderer projection reducer updates ChatMessage state.

Runtime ChatRun uses generated Runtime contracts; Expert Task/SSE remains owned by [[expert-execution#Run service and SSE framing]]. Dashboard and legacy IPC remain transient compatibility sources until they provide stable event identity and replay.

The projection contract scopes terminal state to a turn, not the multi-turn ChatRun. Durable sources deduplicate by stable event identity and sequence; transient sources must not claim replay support or synthesize durable identity from wall-clock time.

## Resource event boundary

Artifact transport events are routed through Main-owned File Platform rather than a second Renderer resource reducer.

After a provider artifact is validated and upserted, the existing FileDomainEvent path refreshes [[session-file-context#Session Files Panel]]. A Chat resource card may reference the same safe file ID, but raw provider URLs, credentials, and local absolute paths never enter Renderer transcript state.

## Grounding document

The current DRAFT analysis, conflict trace, target inventories, compatibility removals, and acceptance criteria live in `docs/chat-contracts.md`.

## Knowledge conversation lifetime

Knowledge navigation preserves open conversations within the current profile, account and tenant. Leaving the chat page hides its UI while its transcript, draft, attachments, queue and stream subscriptions stay mounted.

[[src/renderer/src/screens/Knowledge/KnowledgeView.tsx#KnowledgeView]] remembers the last chat route and clears that route and its back stack when identity changes. Background session binding updates the remembered route without navigating away from documents or sets.

[[src/renderer/src/screens/Knowledge/features/chat/useKnowledgeChatScope.ts#useKnowledgeChatScope]] owns stable runs, using the same [[src/renderer/src/screens/Layout/chatRuns.ts#mintRun]] identity as ordinary Chat. Reopening a live run selects it; opening cold history validates its binding and loads its transcript before mounting Shared Chat. Resolving or failed bindings block sends; inactive sets remain read-only. Late binding and list responses cannot update another session or profile. Running conversations cannot be deleted until stopped.

[[src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx#KnowledgeChatPage]] retains the run instances and passes visibility separately from lifetime. Only the visible run handles shortcuts. [[src/renderer/src/screens/Chat/Chat.tsx#Chat]] guards initial and retried history reads by session and request generation, merging valid snapshots with live output. First-send binding does not trigger an initial-history reload.

Regression checks live in `tests/knowledge-page-host.test.ts`, `src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.test.tsx`, `src/renderer/src/screens/Knowledge/features/chat/useKnowledgeChatScope.test.tsx` and `src/renderer/src/screens/Chat/Chat.resume-empty.test.tsx`. They cover page round trips with the real input, concurrent sessions, late snapshots, recovery gates, hidden shortcuts and identity isolation. Retention is in-memory; restoring after an application restart is outside this contract.

### History loading and recovery

Knowledge history loads in windows of 50, using the existing list limit and one extra row to detect more. A failed refresh retains loaded rows and exposes Retry; validated cache-change events refresh the loaded window without shrinking it.

The list does not require a new IPC contract or full cache sync on each mutation. Profile and request-generation guards discard stale responses. Cache subscriptions are cleaned up on unmount. Persisted titles take precedence over live fallback titles.

Cold history is loaded once by the Knowledge scope, including empty transcripts. Shared Chat's explicit retry merges refreshed history with live messages and displays a readable failure when it cannot recover. Binding, inactive-set and service failures have distinct messages and a recovery action; invalid bindings never enable sending or create a replacement conversation.

### Task operations and scrolling

Live conversations report running, waiting for a response, completed, failed, stopping and stopped states independently of visibility. Historical sessions without observed lifecycle events do not claim a known terminal state.

[[src/renderer/src/screens/Chat/hooks/useChatActions.ts#useChatActions]] waits for the stop invocation to return before clearing the active turn and loading state. Stop failures preserve the running state for retry. While stopping, deletion and the clear command stay blocked; clearing a running conversation requires stopping it first. This acknowledges the existing stop API and does not introduce server-side termination polling.

`src/renderer/src/assets/main.css` constrains the Knowledge chat host to the available window height. Its history list and message transcript have independent native scrollbars and mouse-wheel scrolling; the composer remains visible. Other Knowledge pages retain their existing scrolling layout.

Regression coverage adds list growth, cache updates, failed refresh/recovery and stop ordering in the existing Knowledge and Chat tests, plus `src/renderer/src/screens/Chat/hooks/useChatActions.stop.test.tsx`. Browser verification uses the real Knowledge view, Shared Chat and CSS with simulated services at 1280x800 and 900x600, checking wheel movement and composer bounds.
