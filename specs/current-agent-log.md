# Agent Log

## 2026-08-05 — v8.0.1 Chat migration closure

Completed PR1–PR5 of PRD 8.0.1 (default engine kept `copilot`).

Verification (all OK):
- npm run typecheck:chat
- npm run typecheck
- npm test -- tests/chat- (19 passed)
- npm run check:chat-boundaries
- npm run check:no-reference-imports
- npm run build
