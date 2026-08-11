# Desktop ↔ Runtime boundary

```text
Renderer
  → Preload (contextBridge)
  → Desktop Main
  → @smc/runtime-client (generated facade)
  → Runtime API (http://127.0.0.1:8765)
  → Hermes Agent / Gateway
```

## Rules

1. Runtime device tokens stay in Main (`runtime-auth-store`).
2. Renderer talks to Runtime only through IPC / Preload APIs.
3. Process control IPC (`copilot-serve-contract`) remains separate from HTTP API contracts.
4. Production Desktop connects to a resident Runtime; local spawn is a development escape hatch.
5. Do not confuse `COPILOT_PORTAL_ROOT` (Portal monorepo) with `SMC_COPILOT_MONOREPO_ROOT`.
6. **v1.7 Kanban**: Renderer uses only `window.kanbanRuntime` → Main → Runtime `/api/v1/instances/{id}/kanban/*`. Runtime is Hermes Kanban CLI Facade only (never opens `kanban.db`). KanbanTask is independent of WorkTask.
