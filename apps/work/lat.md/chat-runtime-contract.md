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
