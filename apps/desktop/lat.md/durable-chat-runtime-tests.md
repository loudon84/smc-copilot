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

### Capability tri-state

Verify capability values map to `supported|unsupported|unknown`.

### Unknown capability does not default continue

Verify probe/network failure yields `unknown` and continuation throws rather than falling through to fallback.

### Native and fallback mutually exclusive

Verify native clarify path does not call `sendMessage` structured fallback.

### Resolved after completion

Verify fallback continuation returns a handle whose `completion` resolves after stream `onDone`.

### Profile store isolation

Verify runs for different `profileId`s do not cross-read in the memory/profile store path.

### Sequence continuous after restart

Verify sequencer seeds from durable MAX(sequence) after in-memory counters clear.

### Unique sequence conflict

Verify `allocateAndAppendEvent` assigns monotonic sequences for the same turn.

### Snapshot recovery

Verify get-snapshot returns pending, queue, and event windows for UI rebuild.

### Queue durable ipc

Verify enqueue/move/remove/complete operate on durable queue entries.

### Turn specific retry

Verify Retry plans bind to an explicit `turnId` in the Turn Ledger.

### Diagnostics fileIds

Verify diagnostics export collects attachment ids from turn request snapshots.
