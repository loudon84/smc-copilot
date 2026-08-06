# Current Agent Log

## 2026-08-06 — Chat Interaction Loop v8.0.5 (PR1–PR4)

### Done
- PR1: ChatRuntimeCommand + turnId/requestId; Result codes; clarify/approval.resolved + interaction.failed
- PR2: pending registry + hermes-chat-command-adapter (follow-up message); ClarifyCard/ApprovalCard state machine
- PR3: ChatTurnRequestSnapshot + queue + Retry/Edit/Retry-with-current-context
- PR4: chat-files:changed + useSessionFilesSummary; Host badge uses live total
- Tests: chat-runtime-command-v805 / chat-turn-snapshot-queue-v805 / session-files-summary-v805 (17 passed)
- Verify: typecheck:chat, typecheck, check:chat-boundaries, check:no-reference-imports, build, lat check
- Docs: AGENTS, INDEX, API_CONTRACTS, Hermes.md, lat.md domain/chat + decisions

### Deferred
- PR5 Playwright E2E
- PR6 deprecated API cleanup (forcedSessionId / send / filesToggleSlot)
