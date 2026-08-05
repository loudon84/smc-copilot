# Current Agent State

| Stage | Status |
|---|---|
| v8.0-chat-module-migration | done |

## Notes

**v8.0 Copilot Chat Module migration** complete for planned stages:

- `scripts/chat-migration/*` + `check:no-reference-imports` / `check:chat-boundaries`
- `window.chatRuntime` runId isolation (`src/main/chat-runtime`, `src/shared/chat-runtime`)
- `window.chatFiles` thin bridge; full File Platform upstream parked in `src/main/chat-files/_upstream`
- `modules/chat` ChatSurface + AI-OS adapters/ports; host `AiosCopilotChatHost`
- Entry switch via `VITE_CHAT_ENGINE=legacy|copilot` (default copilot)
- Docs: `docs/API_CONTRACTS.md` + `AGENTS.md` preload/version rows
- Verified: `npm run typecheck`, boundary checks, `tests/chat-runtime-ipc.test.ts`
