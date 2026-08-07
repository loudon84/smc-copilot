# Profiles

Profiles are isolated Hermes runtime workspaces. Each has its own home directory, Gateway port, sessions DB, memory, skills, and credentials unless explicitly shared.

Path resolution is owned by [[src/main/utils.ts#profileHome]]. Multi-instance control plane: [[domain/gateway#Multi-profile runtime]].

## Profile isolation

[[src/main/utils.ts#profileHome]] is the only path resolver for profile homes. Default is `~/.hermes/`; named profiles live under `~/.hermes/profiles/<profileId>/`.

Features that touch profile data must accept `profile?: string` end-to-end (Renderer → Preload → Main). Do not merge `state.db` across profiles. Do not share memory or credentials by default. Cross-profile work uses explicit delegation or context-share events.

## Profile home layout

Typical contents under a profile home: `config.yaml`, `.env`, `state.db`, `SOUL.md`, `memories/`, `skills/`, `desktop/` (desktop-only metadata when scoped).

Desktop control-plane DB for multi-profile runtime lives at `~/.hermes/desktop/profile-runtime.db` — not inside a single profile’s agent DB.

## Delegation

Delegation is task-like and auditable: source profile dispatches work to a specialist profile with explicit status (`created` … `cancelled`), inputs, results, and audit refs. Invisible cross-profile function calls are not allowed.
