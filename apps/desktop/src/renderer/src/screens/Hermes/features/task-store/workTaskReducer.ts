import type { WorkOutput } from "../../../../../../shared/work/work-output-contract";
import type { WorkParticipant } from "../../../../../../shared/work/work-participant-contract";
import type { WorkTask, WorkTaskStatus } from "../../../../../../shared/work/work-task-contract";
import type { WorkTaskEvent } from "../../../../../../shared/work/work-event-contract";
import { participantsFromEvents } from "./workTaskSelectors";

export type WorkTaskRightPanelTab =
  | "output"
  | "context"
  | "participants"
  | "skills"
  | "governance";

export type WorkTaskState = {
  tasks: Record<string, WorkTask>;
  taskOrder: string[];
  eventsByTaskId: Record<string, WorkTaskEvent[]>;
  outputsByTaskId: Record<string, WorkOutput[]>;
  participantsByTaskId: Record<string, WorkParticipant[]>;
  activeTaskId: string | null;
  isStreaming: boolean;
  streamingTaskId: string | null;
  rightPanelTab: WorkTaskRightPanelTab;
  rightPanelOpen: boolean;
  rightPanelAutoDismissed: Record<string, boolean>;
};

export type WorkTaskAction =
  | { type: "SET_ACTIVE_TASK"; taskId: string | null }
  | { type: "ADD_TASK"; task: WorkTask }
  | { type: "UPDATE_TASK"; taskId: string; patch: Partial<WorkTask> }
  | { type: "APPEND_EVENT"; event: WorkTaskEvent }
  | { type: "SET_STREAMING"; taskId: string | null; streaming: boolean }
  | { type: "SET_RIGHT_PANEL_TAB"; tab: WorkTaskRightPanelTab }
  | { type: "SET_RIGHT_PANEL_OPEN"; open: boolean }
  | { type: "DISMISS_RIGHT_PANEL_AUTO"; taskId: string }
  | { type: "HYDRATE"; state: Partial<WorkTaskState> };

export const initialWorkTaskState: WorkTaskState = {
  tasks: {},
  taskOrder: [],
  eventsByTaskId: {},
  outputsByTaskId: {},
  participantsByTaskId: {},
  activeTaskId: null,
  isStreaming: false,
  streamingTaskId: null,
  rightPanelTab: "output",
  rightPanelOpen: true,
  rightPanelAutoDismissed: {},
};

function taskListGroup(status: WorkTaskStatus): number {
  if (status === "running" || status === "dispatching" || status === "planning") return 0;
  if (status === "waiting_approval") return 1;
  return 2;
}

export function sortTaskIds(tasks: Record<string, WorkTask>, order: string[]): string[] {
  return [...order].sort((a, b) => {
    const ta = tasks[a];
    const tb = tasks[b];
    if (!ta || !tb) return 0;
    const ga = taskListGroup(ta.status);
    const gb = taskListGroup(tb.status);
    if (ga !== gb) return ga - gb;
    return tb.updatedAt.localeCompare(ta.updatedAt);
  });
}

function applyOutputFromEvent(
  outputs: WorkOutput[],
  event: WorkTaskEvent,
): WorkOutput[] {
  if (event.type !== "output.created" && event.type !== "output.updated" && event.type !== "output.saved") {
    return outputs;
  }
  const idx = outputs.findIndex((o) => o.id === event.outputId);
  const next: WorkOutput = {
    id: event.outputId,
    taskId: event.taskId,
    name: event.name,
    type: event.outputType,
    source: "agent",
    previewable: event.previewable ?? true,
    version: idx >= 0 ? outputs[idx].version + 1 : 1,
    localPath: event.localPath,
    remoteRef: event.remoteRef,
    content: event.content,
    createdBy: "agent",
    createdAt: event.createdAt,
  };
  if (idx >= 0) {
    const copy = [...outputs];
    copy[idx] = next;
    return copy;
  }
  return [...outputs, next];
}

export function workTaskReducer(state: WorkTaskState, action: WorkTaskAction): WorkTaskState {
  switch (action.type) {
    case "SET_ACTIVE_TASK":
      return { ...state, activeTaskId: action.taskId };
    case "ADD_TASK": {
      const task = action.task;
      return {
        ...state,
        tasks: { ...state.tasks, [task.id]: task },
        taskOrder: state.taskOrder.includes(task.id)
          ? state.taskOrder
          : [task.id, ...state.taskOrder],
        eventsByTaskId: state.eventsByTaskId[task.id]
          ? state.eventsByTaskId
          : { ...state.eventsByTaskId, [task.id]: [] },
        activeTaskId: task.id,
      };
    }
    case "UPDATE_TASK": {
      const existing = state.tasks[action.taskId];
      if (!existing) return state;
      const updated = { ...existing, ...action.patch, updatedAt: new Date().toISOString() };
      return {
        ...state,
        tasks: { ...state.tasks, [action.taskId]: updated },
      };
    }
    case "APPEND_EVENT": {
      const { event } = action;
      const prev = state.eventsByTaskId[event.taskId] ?? [];
      if (prev.some((e) => e.id === event.id)) return state;
      const events = [...prev, event];
      const outputs = applyOutputFromEvent(
        state.outputsByTaskId[event.taskId] ?? [],
        event,
      );
      const participants = participantsFromEvents(event.taskId, events);
      let next: WorkTaskState = {
        ...state,
        eventsByTaskId: { ...state.eventsByTaskId, [event.taskId]: events },
        outputsByTaskId: { ...state.outputsByTaskId, [event.taskId]: outputs },
        participantsByTaskId: { ...state.participantsByTaskId, [event.taskId]: participants },
      };
      const task = state.tasks[event.taskId];
      if (task) {
        const patch: Partial<WorkTask> = { updatedAt: event.createdAt };
        if (event.type === "task.completed") patch.status = "completed";
        if (event.type === "task.failed") patch.status = "failed";
        if (event.type === "task.started") patch.status = "running";
        if (event.type === "output.created") {
          patch.outputRefs = [
            ...task.outputRefs.filter((r) => r.id !== event.outputId),
            { id: event.outputId, name: event.name, type: event.outputType },
          ];
          patch.status = "output_ready";
        }
        next = {
          ...next,
          tasks: {
            ...next.tasks,
            [event.taskId]: { ...task, ...patch },
          },
        };
      }
      if (event.type === "output.created" && !state.rightPanelAutoDismissed[event.taskId]) {
        next = { ...next, rightPanelTab: "output", rightPanelOpen: true };
      }
      if (event.type === "approval.required") {
        next = { ...next, rightPanelTab: "governance", rightPanelOpen: true };
      }
      if (event.type === "task.completed" || event.type === "task.failed") {
        next = {
          ...next,
          isStreaming: false,
          streamingTaskId: null,
        };
      }
      return next;
    }
    case "SET_STREAMING":
      return {
        ...state,
        isStreaming: action.streaming,
        streamingTaskId: action.streaming ? action.taskId : null,
      };
    case "SET_RIGHT_PANEL_TAB":
      return { ...state, rightPanelTab: action.tab };
    case "SET_RIGHT_PANEL_OPEN":
      return { ...state, rightPanelOpen: action.open };
    case "DISMISS_RIGHT_PANEL_AUTO":
      return {
        ...state,
        rightPanelAutoDismissed: {
          ...state.rightPanelAutoDismissed,
          [action.taskId]: true,
        },
      };
    case "HYDRATE":
      return { ...state, ...action.state };
    default:
      return state;
  }
}
