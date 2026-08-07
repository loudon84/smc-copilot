# ADR-002: Keep npm and uv Build Systems Isolated

## Status

Accepted

## Context

Desktop depends on Electron native modules (`better-sqlite3`, `keytar`) with a local `postinstall` rebuild. Runtime uses Python 3.12 + uv.

## Decision

Do not introduce npm workspaces or a unified package manager in v1.0. Nx only orchestrates targets with explicit `cwd`.

## Consequences

- Two dependency trees (`apps/desktop/node_modules`, `services/runtime/.venv`).
- Root `package.json` stays minimal (Nx + tooling).
- Avoids node_modules hoisting surprises for Electron Builder.
