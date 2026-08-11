# Hermes Kanban Facade

Runtime exposes instance-scoped Kanban APIs that proxy Hermes Agent CLI; Hermes remains the sole Kanban SOT.

## Boundaries

KanbanTask is independent of WorkTask. Runtime never opens `kanban.db` and never maps Kanban lifecycle onto WorkTask rows.

Desktop Renderer reaches Kanban only through `KanbanRuntimePort` → `window.kanbanRuntime` → Main → `@smc/runtime-client` `kanban` domain.

## Transport

P0 uses `HermesKanbanCliAdapter` built on HermesCliAdapter. Every command carries `--board <slug>` so UI board selection never mutates Hermes global current board. See [[architecture#分层职责]].

## API surface

Router prefix `/api/v1/instances/{instance_id}/kanban`. Capabilities, boards, tasks, unified task actions, comments, assignees, and dispatch are orchestrated by KanbanService.

## Errors

CLI failures map to stable codes such as `KANBAN_BOARD_NOT_FOUND`, `KANBAN_INVALID_TRANSITION`, `KANBAN_DEPENDENCY_BLOCKED`, and `KANBAN_TIMEOUT`.
