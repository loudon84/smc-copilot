---
lat:
  require-code-mention: true
---

# Durable Chat Runtime tests

Test specifications for v8.1 event-driven start, durable store, ordered events, interaction continuation, turn ledger/retry/queue, and recovery.

## Durable Chat Runtime tests

Leaf cases below must each have exactly one `@lat:` mention in the matching Vitest file.

### Start returns accepted shape

Verify `ChatStartResult` carries `runId`/`turnId`/`acceptedAt` without waiting for a full agent response, and that channel constants include `start`/`state`/`recover`.

### Sequencer assigns monotonic event ids

Verify [[src/main/chat-runtime/chat-event-sequencer.ts#stampChatRuntimeEvent]] yields increasing per-turn `sequence` values, unique `eventId`s, and isolated counters across turns.

### Pending survives transport clear

Verify durable pending interactions remain readable after transport handles are cleared — stream end must not imply `RUN_NOT_FOUND` for Approval/Clarify.

### Continuation unsupported fails loudly

Verify missing Gateway support surfaces `GATEWAY_UNSUPPORTED` rather than a silent simulated success, and capability probe defaults remain defined.

### Retry binds exact turnId

Verify Turn Ledger Retry plans reuse the named turn’s snapshot and set `skipAppendUser`, so multiple failed turns cannot cross-replay.

### Queue reducer is atomic

Verify enqueue → `mark_running` → `complete` removes entries without relying on React setState updater return values, and move/remove/auto-drain work.

### Recovery waiting and interrupted

Verify incomplete turns with pending interactions restore to `waiting_*`, while streaming without pending becomes `interrupted` (no auto-replay of failures).
