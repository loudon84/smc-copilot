import type { WorkTaskDto, WorkTaskEventDto } from "../../../../shared/work-tasks/work-tasks-contract";

export interface TaskWorkbenchProjectionState {
  task: WorkTaskDto | null;
  events: WorkTaskEventDto[];
  lastEventId: string | null;
}

export type TaskWorkbenchProjectionAction =
  | { type: "reset"; task: WorkTaskDto | null; events?: WorkTaskEventDto[] }
  | { type: "patch_task"; task: WorkTaskDto }
  | { type: "append_event"; event: WorkTaskEventDto };

export function createInitialProjection(
  task: WorkTaskDto | null = null,
  events: WorkTaskEventDto[] = [],
): TaskWorkbenchProjectionState {
  const last = events[events.length - 1];
  return {
    task,
    events,
    lastEventId: last?.id ?? null,
  };
}

export function taskWorkbenchProjectionReducer(
  state: TaskWorkbenchProjectionState,
  action: TaskWorkbenchProjectionAction,
): TaskWorkbenchProjectionState {
  switch (action.type) {
    case "reset": {
      const events = action.events ?? [];
      const last = events[events.length - 1];
      return {
        task: action.task,
        events,
        lastEventId: last?.id ?? null,
      };
    }
    case "patch_task":
      return { ...state, task: action.task };
    case "append_event": {
      if (state.events.some((e) => e.id === action.event.id)) {
        return state;
      }
      const events = [...state.events, action.event];
      return {
        ...state,
        events,
        lastEventId: action.event.id,
        task: state.task
          ? {
              ...state.task,
              updatedAt: action.event.createdAt ?? state.task.updatedAt,
            }
          : state.task,
      };
    }
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
