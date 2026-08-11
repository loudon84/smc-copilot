import type {
  KanbanBoard,
  KanbanCapabilities,
  KanbanTask,
  KanbanTaskDetail,
} from "../types/kanban";

export interface KanbanState {
  instanceId: string | null;
  selectedBoardSlug: string | null;
  boards: KanbanBoard[];
  tasks: KanbanTask[];
  selectedTaskId: string | null;
  selectedTaskDetail: KanbanTaskDetail | null;
  showArchived: boolean;
  capabilities: KanbanCapabilities | null;
  loading: boolean;
  refreshing: boolean;
  actionBusy: string | null;
  createTaskOpen: boolean;
  createBoardOpen: boolean;
  blockDialogTaskId: string | null;
  scheduleDialogTaskId: string | null;
  draggingTaskId: string | null;
  dragOverColumn: string | null;
  error: string | null;
  unknownStatuses: string[];
}

export type KanbanAction =
  | { type: "SET_INSTANCE"; instanceId: string | null }
  | { type: "SET_BOARD"; slug: string | null }
  | { type: "SET_BOARDS"; boards: KanbanBoard[] }
  | { type: "SET_TASKS"; tasks: KanbanTask[] }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_REFRESHING"; refreshing: boolean }
  | { type: "SET_ACTION_BUSY"; actionBusy: string | null }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_SHOW_ARCHIVED"; showArchived: boolean }
  | { type: "SET_CAPABILITIES"; capabilities: KanbanCapabilities | null }
  | { type: "SELECT_TASK"; taskId: string | null }
  | { type: "SET_TASK_DETAIL"; detail: KanbanTaskDetail | null }
  | { type: "OPEN_CREATE_TASK"; open: boolean }
  | { type: "OPEN_CREATE_BOARD"; open: boolean }
  | { type: "OPEN_BLOCK_DIALOG"; taskId: string | null }
  | { type: "OPEN_SCHEDULE_DIALOG"; taskId: string | null }
  | { type: "SET_DRAGGING"; taskId: string | null }
  | { type: "SET_DRAG_OVER"; column: string | null }
  | { type: "SET_UNKNOWN_STATUSES"; statuses: string[] }
  | { type: "UPSERT_TASK"; task: KanbanTask };

export const initialKanbanState: KanbanState = {
  instanceId: null,
  selectedBoardSlug: null,
  boards: [],
  tasks: [],
  selectedTaskId: null,
  selectedTaskDetail: null,
  showArchived: false,
  capabilities: null,
  loading: false,
  refreshing: false,
  actionBusy: null,
  createTaskOpen: false,
  createBoardOpen: false,
  blockDialogTaskId: null,
  scheduleDialogTaskId: null,
  draggingTaskId: null,
  dragOverColumn: null,
  error: null,
  unknownStatuses: [],
};

export function kanbanReducer(state: KanbanState, action: KanbanAction): KanbanState {
  switch (action.type) {
    case "SET_INSTANCE":
      return { ...state, instanceId: action.instanceId };
    case "SET_BOARD":
      return { ...state, selectedBoardSlug: action.slug };
    case "SET_BOARDS":
      return { ...state, boards: action.boards };
    case "SET_TASKS":
      return { ...state, tasks: action.tasks };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_REFRESHING":
      return { ...state, refreshing: action.refreshing };
    case "SET_ACTION_BUSY":
      return { ...state, actionBusy: action.actionBusy };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SET_SHOW_ARCHIVED":
      return { ...state, showArchived: action.showArchived };
    case "SET_CAPABILITIES":
      return { ...state, capabilities: action.capabilities };
    case "SELECT_TASK":
      return {
        ...state,
        selectedTaskId: action.taskId,
        selectedTaskDetail: action.taskId ? state.selectedTaskDetail : null,
      };
    case "SET_TASK_DETAIL":
      return { ...state, selectedTaskDetail: action.detail };
    case "OPEN_CREATE_TASK":
      return { ...state, createTaskOpen: action.open };
    case "OPEN_CREATE_BOARD":
      return { ...state, createBoardOpen: action.open };
    case "OPEN_BLOCK_DIALOG":
      return { ...state, blockDialogTaskId: action.taskId };
    case "OPEN_SCHEDULE_DIALOG":
      return { ...state, scheduleDialogTaskId: action.taskId };
    case "SET_DRAGGING":
      return { ...state, draggingTaskId: action.taskId };
    case "SET_DRAG_OVER":
      return { ...state, dragOverColumn: action.column };
    case "SET_UNKNOWN_STATUSES":
      return { ...state, unknownStatuses: action.statuses };
    case "UPSERT_TASK": {
      const idx = state.tasks.findIndex((t) => t.id === action.task.id);
      const tasks =
        idx >= 0
          ? state.tasks.map((t, i) => (i === idx ? action.task : t))
          : [...state.tasks, action.task];
      return { ...state, tasks };
    }
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
