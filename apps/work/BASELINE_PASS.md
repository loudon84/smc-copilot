# apps/work Baseline Pass (PRD v1.0 Phase 0)

**Date**: 2026-08-11  
**Scope**: Establish runnable baseline before Runtime Control Plane migration. No functional migration in this phase.

## Automated checks

| Check | Result | Notes |
|-------|--------|-------|
| `npm install` | PASS | Fresh install completed |
| `npm run typecheck` | PASS | Fixed unused `Building` import in `Layout.tsx` (no behavior change) |
| Runtime-related tests | PASS | `runtime-adapter`, `preload-api-surface`, `ipc-handlers`, `gateway-ports` — 243/243 |
| Full `npm test` | PARTIAL | 1858 passed / 105 failed / 9 skipped — many failures look environment-related (Windows short vs long path, hermes home mocks) |
| `npm run lint` | PARTIAL | Prettier CRLF warnings dominate; treat as known baseline debt, not blocking Runtime migration |
| `npm run build` | PASS | electron-vite build succeeded |

## Manual verification checklist (operator)

Confirm on a machine with local Hermes Agent available:

- [ ] Chat send + streaming chunks / reasoning / tool / done
- [ ] Attachment upload + agent read
- [ ] Session resume after app restart
- [ ] File Preview / Session Files
- [ ] Slash commands (`/status`, `/compact`, …)
- [ ] `/btw` concurrent with main chat
- [ ] Context Folder / Worktree
- [ ] Model switch (session override)

## Migration baseline notes

- Current Gateway lifecycle: Desktop Main spawns `hermes gateway` via `LegacyLocalRuntimeAdapter`
- No `@smc/runtime-client` / `services/runtime` HTTP client yet
- Renderer contract `window.hermesAPI` is the freeze surface for Phases 1–4

## Definition for proceeding

Phase 1 may start once:

1. Typecheck is green (done)
2. Runtime-related unit tests are green (done)
3. Operator acknowledges manual checklist items above (or accepts deferred manual verification)
