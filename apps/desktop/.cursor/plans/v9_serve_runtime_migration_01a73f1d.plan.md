---
name: v9 serve runtime migration
overview: "Implement the foundation of the v9.0 Serve-First migration on the Desktop side only: Phase 0 (consume the Serve OpenAPI contract via a generated typed client + drift gate) and Phase 1 (Main-only Serve SDK, device pairing with keytar, capability/compatibility gate, token de-leak, production no-spawn, and Renderer runtime-state UI). Serve already exposes the needed endpoints, so no Serve repo changes are required."
todos:
  - id: phase0-openapi
    content: Add openapi-typescript dep + scripts/serve-client/{generate,check-drift}.mjs + package.json scripts; commit openapi snapshot and generated schema.d.ts under src/shared/generated/copilot-serve/
    status: completed
  - id: phase0-contracts
    content: Author src/shared/copilot-runtime/ stable contracts (runtime-state, runtime-error, chat-run-identity, capability)
    status: completed
  - id: p1-auth-http
    content: Implement runtime-auth-store (keytar, Main-only), runtime-http-client (Bearer + version/request headers + idempotency), runtime-error-mapper, runtime-sse-client scaffold
    status: completed
  - id: p1-connection
    content: Implement runtime-connection-manager (7-state handshake), runtime-capability-manager (gate), runtime-pairing-manager (start/confirm)
    status: completed
  - id: p1-clients-ipc
    content: Add clients/runtime-client.ts + thin typed stub clients; copilot-runtime-ipc.ts registration in index.ts
    status: completed
  - id: p1-token-deleak
    content: Remove token from CopilotServeConnection + getConnection; update workspace-chat-client.ts to use Main-only auth-store
    status: completed
  - id: p1-preload
    content: Add src/preload/copilot-runtime-api.ts (window.copilotRuntime, no token) + index.d.ts + index.ts exposure
    status: completed
  - id: p1-process-policy
    content: Add runtime-mode.ts; guard copilot-serve spawn/stop to non-production; production probe -> RuntimeMissing/Repair; legacy-direct flag defaults false in prod
    status: completed
  - id: p1-renderer-ui
    content: Renderer runtime gate/status UI for 7 states + pairing dialog + Retry/Repair/Diagnostics; block Chat/Task/MCP writes when not Ready
    status: completed
  - id: p1-gates-tests
    content: Add check:no-renderer-runtime-http + wire drift check to CI; scaffold remaining check scripts; add Vitest units + minimal E2E
    status: completed
  - id: docs-sync
    content: Update AGENTS.md, docs/API_CONTRACTS.md, docs/INDEX.md; maintain specs/current-agent-* state files
    status: completed
isProject: false
---

# v9.0 Serve-First Runtime Migration — Phase 0 + Phase 1 (Desktop-only)

## Scope reconciliation

You chose **Phase 0 + Phase 1, Desktop-only**. Phase 0's server endpoints (`/chat-runs` v2, `POST /work-tasks`, session metadata, artifact content, resource/tools/memory/cron) live in the `copilot-serve` repo and are **out of scope**; they are assumed delivered by the Serve team. On the Desktop side, Phase 0 therefore means **consuming the Serve contract** (OpenAPI-typed client + drift gate). Phase 1 is the Desktop foundation: Main-only SDK, pairing, keytar, capability gate, token de-leak, production process policy, and Renderer runtime states.

Verified against the live Serve (`../copilot-serve`):
- `runtime/status|capabilities|compatibility`, `pairings/start|{id}/confirm`, `devices`, `health/*` all exist ([../copilot-serve/src/api/v1/runtime.py](../copilot-serve/src/api/v1/runtime.py), [pairings.py](../copilot-serve/src/api/v1/pairings.py), [health.py](../copilot-serve/src/api/v1/health.py)).
- `verify_desktop_token` already prefers **`Authorization: Bearer <device-token>`** (PairingService) and treats `X-Copilot-Desktop-Token` as a deprecated legacy fallback ([../copilot-serve/src/api/deps.py](../copilot-serve/src/api/deps.py) lines ~130-192). This matches PRD §5.3 exactly.

Deferred to later sessions (NOT this pass): Chat Runtime cutover (Phase 3), Session/Files (Phase 4), Task/Expert/Approval (Phase 5), Resource/Memory/Cron (Phase 6), Endpoint/Experience (Phase 7), Legacy deletion (Phase 8). Their adapter files will be **scaffolded as typed stubs** only.

## Phase 0 — Serve contract consumption (Desktop)

1. Add `openapi-typescript` devDependency (keytar already present).
2. New `scripts/serve-client/generate.mjs`:
   - Source order: `COPILOT_SERVE_OPENAPI_URL` env or `http://127.0.0.1:8765/openapi.json` (live Serve) → fall back to a committed snapshot `src/shared/generated/copilot-serve/openapi.snapshot.json`.
   - Emit `src/shared/generated/copilot-serve/schema.d.ts` via `openapi-typescript`, and refresh the snapshot when fetched live.
3. New `scripts/serve-client/check-drift.mjs`: regenerate to a temp file, diff against committed `schema.d.ts`; non-zero exit on drift.
4. `package.json` scripts: `generate:serve-client`, `check:serve-contract-drift`.
5. New `src/shared/copilot-runtime/` hand-authored stable contracts (independent of generated churn):
   - `runtime-state-contract.ts` — the 7 UI states (`Connecting|PairingRequired|Incompatible|RuntimeMissing|RuntimeStarting|RuntimeDegraded|Ready`), `RuntimeConnectionState`.
   - `runtime-error-contract.ts` — `DesktopRuntimeError` + the PRD §23 code enum.
   - `chat-run-identity.ts` — `ChatRunIdentity { instanceId; profileId?; sessionId }` (PRD §7).
   - `runtime-capability-contract.ts` — capability/compatibility view model.

## Phase 1 — Main-only Serve SDK + connection/pairing/capability

### New `src/main/copilot-runtime-client/`
- `runtime-auth-store.ts` — keytar-backed device-token store (service `smc-copilot-runtime`), Main-only getters/setters; **never** returned across IPC.
- `runtime-http-client.ts` — `fetch` wrapper injecting `Authorization: Bearer <device-token>`, `X-Desktop-Version: 9.0.0`, `X-Runtime-Api-Version: 1.3`, `X-Request-ID: <uuid>`, and `Idempotency-Key` on writes. Legacy `X-Copilot-Desktop-Token` sent only when a dev legacy token is present. Uses generated `schema.d.ts` types.
- `runtime-sse-client.ts` — SSE reader with `Last-Event-ID` + auto-reconnect (scaffold; used in Phase 3).
- `runtime-error-mapper.ts` — map Serve error envelope → `DesktopRuntimeError` categories (PRD §23).
- `runtime-connection-manager.ts` — handshake `health → runtime/status → capabilities → compatibility`, owns the 7-state machine, emits state changes.
- `runtime-capability-manager.ts` — cache capabilities + API version; `assertFeature()` gate used to block Chat/Task/MCP writes when not `Ready`.
- `runtime-pairing-manager.ts` — `POST /pairings/start` → Desktop confirm → `POST /pairings/{id}/confirm` → persist device token via auth-store.
- `clients/runtime-client.ts` — typed status/capabilities/compatibility/diagnostics.
- `clients/{instance,chat-runtime,session,task,approval,attachment,artifact,configuration,resource,diagnostics,endpoint}-client.ts` — **thin typed stubs** wired to `runtime-http-client` (bodies filled in later phases).
- `copilot-runtime-ipc.ts` — registers `copilot-runtime:*` handlers.

### Token de-leak (PRD §5.2)
- Remove `token` from `CopilotServeConnection` in [src/shared/copilot-serve/copilot-serve-contract.ts](src/shared/copilot-serve/copilot-serve-contract.ts) and stop returning it in `getCopilotServeConnection()` ([src/main/copilot-serve/copilot-serve-process.ts](src/main/copilot-serve/copilot-serve-process.ts)).
- Update [src/main/workspace-chat/workspace-chat-client.ts](src/main/workspace-chat/workspace-chat-client.ts) to read the device token from the Main-only auth-store instead of `conn.token` (keeps it working; still Main-side; full merge is Phase 3).

### Preload surface (no token)
- New `src/preload/copilot-runtime-api.ts` → `window.copilotRuntime`: `getState()`, `getCapabilities()`, `getDiagnosticsSummary()`, `startPairing()`, `confirmPairing(id)`, `retry()`, `repair()`, `onStateChanged(cb)`. No method returns a token.
- Declare in [src/preload/index.d.ts](src/preload/index.d.ts); expose in [src/preload/index.ts](src/preload/index.ts).

### Production process policy (PRD §6.1)
- Add `src/main/copilot-runtime-client/runtime-mode.ts` → `development | portable_dev | e2e | production` (env-driven).
- Guard spawn in [src/main/copilot-serve/copilot-serve-process.ts](src/main/copilot-serve/copilot-serve-process.ts): only spawn/stop in non-production modes. In production, probe existing service and set `RuntimeMissing` (→ Repair) if absent; do not stop Serve on Desktop quit.
- `COPILOT_ALLOW_LEGACY_HERMES_DIRECT` defaults `false` in production packaging.

### Renderer runtime states
- Add a runtime gate/status component reflecting the 7 states with **Retry / Repair / Diagnostics** actions and a **Pairing confirmation** dialog. Wire into the existing Runtime/Server surface in [src/renderer/src/screens/SettingsDrawer/server/](src/renderer/src/screens/SettingsDrawer/server) and the app connection gate. Runtime-unavailable allows viewing local UI Workspace but blocks Chat/Task/MCP writes.

### Static gates (partial; PRD §30)
- Add now: `check:no-renderer-runtime-http` (renderer must not `fetch` `127.0.0.1:8765`) and wire `check:serve-contract-drift` into CI.
- Scaffold-only (not wired into blocking CI this pass, since legacy still present): `no-direct-hermes`, `no-hermes-home-access`, `no-hermes-cli`, `no-legacy-profile-chat`.

## Testing
- Vitest units: auth-store never exposes token across IPC; error-mapper category mapping; capability gate blocks writes when not Ready; connection-manager state transitions (mocked fetch); pairing manager happy path.
- `check:serve-contract-drift` runs against the committed snapshot.
- Real Electron E2E for pairing/connection is heavy; add a minimal spec under `tests/e2e/` behind the existing `test:e2e:electron:required` harness, but treat full E2E matrix (PRD §29) as later-phase work.

## Docs sync (per rule 007)
- After implementation: update `AGENTS.md` (new `window.copilotRuntime`, `src/main/copilot-runtime-client/`, version line), `docs/API_CONTRACTS.md` (`copilot-runtime:*` channels), and `docs/INDEX.md`. Track state in `specs/current-agent-task.md` / `current-agent-state.md` per the no-wait-skipped rule.

## Acceptance for this session
- Renderer cannot read the device token (no IPC returns it); `getConnection()` no longer carries `token`.
- Desktop connects to a running Serve at `:8765`, performs the health→status→capabilities→compatibility handshake, and can device-pair (Bearer token stored in keytar).
- Production mode does not spawn/stop Serve; missing Serve → Repair state.
- `npm run generate:serve-client`, `check:serve-contract-drift`, `typecheck`, and `test` pass.