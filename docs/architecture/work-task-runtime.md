# Work Task Runtime (v1.3)

WorkTask is the **source of truth** for agent task execution in SMC Copilot Runtime. LocalTask (`/api/v1/tasks`) remains for legacy clients; new Desktop Workbench 2.0 and Service Center flows use `/api/v1/work-tasks`.

## Components

| Layer | Module | Role |
|-------|--------|------|
| API | `services/runtime/src/api/v1/work_tasks.py` | CRUD, assign, start, cancel, snapshot, approvals, artifacts |
| Service | `services/work_task_service.py` | Orchestration, durable queue enqueue, inline execute when workers disabled |
| State machine | `runtime/tasks/state_machine.py` | All WorkTask status changes via `transition()` |
| Durable queue | `task_execution_queue` table + `TaskWorker` | Atomic claim, lease, workspace resource lock |
| Kernel | `runtime/execution/kernel.py` | **Only** path to Hermes chat completions for task runs |
| Events | `runtime/tasks/event_store.py` + `schemas/task_events.py` | 21 typed durable events; schema in `contracts/runtime-events/task-event.schema.json` |
| Recovery | `runtime/tasks/task_recovery_service.py` | Startup: queued rows survive; running → `interrupted` without re-sending Hermes |

## Lifecycle (happy path)

```text
create (draft) → assign profile → start → queued → claim → running → completed
                      ↓                              ↓
              task_routing_rules              AgentExecutionKernel → Hermes adapter
```

Workers are disabled in tests (`app.state._disable_workers`); `WorkTaskService.start` executes inline after enqueue.

## Contracts

- OpenAPI: `GET /api/v1/work-tasks/{id}/snapshot`, approvals, artifacts (bundle `1.3.0`, `runtimeApi` `3.0.0`)
- Events: `runtimeEvents` `2.1.0` — see [[contract-flow#Contract flow]]
- TS client: `packages/runtime-client-ts/src/domains/work-task.ts` (`createWorkTaskDomain`)

## Desktop boundary

Renderer **must not** call `/api/v1/tasks` from Workbench 2.0. Use Main IPC → `@smc/runtime-client` → `/api/v1/work-tasks`. Guard: `apps/desktop/scripts/check-no-legacy-local-task-client.mjs`.

## CI guards (Runtime)

| Script | Purpose |
|--------|---------|
| `check:no-task-direct-hermes` | No `/v1/chat/completions` under `runtime/tasks/` |
| `check:worktask-state-machine` | No direct `task.status =` bypassing `transition()` |
| `check:task-contract-drift` | `TASK_EVENT_TYPES` ↔ JSON schema ↔ `version.json` |

Run: `npm run guard` from `services/runtime/`.

## Related

- [contract-flow.md](./contract-flow.md)
- [desktop-runtime-boundary.md](./desktop-runtime-boundary.md)
- Runtime lat.md: `services/runtime/lat.md/task-runtime.md`
