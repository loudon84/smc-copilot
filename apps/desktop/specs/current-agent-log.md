# Current Agent Log — v8.1.0 Durable Chat Runtime

## 2026-08-06

- Started v8.1.0 implementation (PR1–PR5).
- Initialized specs task/state/log.
- Scope confirmed: state.db persistence; PR6/PR7 deferred.

## 2026-08-06 (continue)

- PR1–PR5 implemented: start IPC, durable store, continuation adapter, turn ledger/queue, recovery/diagnostics.
- typecheck OK; chat-* vitest suites OK.
- Docs: API_CONTRACTS, AGENTS, INDEX, Hermes.md, lat.md updated.
- Deferred PR6/PR7.

## 2026-08-06 v8.1.1

- Started v8.1.1 PR1–PR6 implementation.
- Scope: Interaction correctness, profile store, snapshot recovery, queue/retry UI, diagnostics, Electron E2E.
- Deferred: PR7 deprecated cleanup.

## 2026-08-06 v8.1.1 closure

- PR1–PR6 done: interaction correctness, profile store, snapshot/recovery, queue/retry UI, diagnostics, Playwright E2E.
- Verification: typecheck node+web, v811 vitests, e2e structural; lat check passed; docs synced (API_CONTRACTS/AGENTS/INDEX/Hermes).
- Deferred: PR7 deprecated cutover.

