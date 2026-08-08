# ADR-008: Runtime owns the data plane

## Status

Accepted (PRD v1.4 Phase G/H)

## Context

Desktop Main used to read Hermes `state.db`, `MEMORY.md`, and related files via
`better-sqlite3` / `fs`, causing schema drift errors (e.g. missing `sessions` table)
and dual ownership of session/memory data.

## Decision

- Sessions, Memory, Soul, and related domain data are served by Runtime APIs
  (`/instances/*/sessions*`, `/memory*`, readiness/stats).
- Desktop `memory.ts` and session-catalog readers call Runtime only — no local
  Hermes DB/file access.
- Primary Runtime DB path is `%LOCALAPPDATA%/SMC/CopilotRuntime/data/runtime.db`
  (or platform equivalent), not `~/.hermes/desktop/sqlite.db`.

## Consequences

- Guards: `check-no-desktop-hermes-data`, `check-no-desktop-domain-db`,
  `check-no-runtime-legacy-desktop-db`.
- Legacy desktop sqlite may be migration source only.
