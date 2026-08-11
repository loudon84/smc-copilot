import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  runtimeKanbanAdapter,
  runtimeKanbanWorkspaceAdapter,
} from "../adapters/runtimeKanbanAdapter";
import type { KanbanRuntimePort } from "../ports/KanbanRuntimePort";
import type { KanbanWorkspacePort } from "../ports/KanbanWorkspacePort";
import type {
  CreateKanbanBoardInput,
  CreateKanbanTaskInput,
  KanbanTask,
  KanbanTaskActionInput,
} from "../types/kanban";
import {
  collectUnknownStatuses,
  selectActiveBoard,
  selectRenderedColumns,
  selectTasksByStatus,
} from "./kanbanSelectors";
import { dragAction, isValidDragTransition } from "./kanbanTransitions";
import {
  initialKanbanState,
  kanbanReducer,
  type KanbanState,
} from "./kanbanReducer";

const BOARD_STORAGE_KEY = "smc.kanban.selectedBoardSlug";
const ARCHIVED_STORAGE_KEY = "smc.kanban.showArchived";
export const POLL_INTERVAL_MS = 6000;

export interface UseKanbanControllerOptions {
  instanceId: string | null;
  port?: KanbanRuntimePort;
  workspacePort?: KanbanWorkspacePort;
  visible?: boolean;
}

export interface KanbanController {
  state: KanbanState;
  columns: ReturnType<typeof selectRenderedColumns>;
  tasksByStatus: Record<string, KanbanTask[]>;
  activeBoard: ReturnType<typeof selectActiveBoard>;
  actions: {
    refresh: (silent?: boolean) => Promise<void>;
    selectBoard: (slug: string) => void;
    toggleArchived: () => void;
    openCreateTask: (open: boolean) => void;
    openCreateBoard: (open: boolean) => void;
    createTask: (input: CreateKanbanTaskInput) => Promise<void>;
    createBoard: (input: CreateKanbanBoardInput) => Promise<void>;
    selectTask: (taskId: string | null) => Promise<void>;
    executeAction: (
      taskId: string,
      input: KanbanTaskActionInput,
    ) => Promise<void>;
    addComment: (taskId: string, text: string) => Promise<void>;
    dispatch: (dryRun?: boolean) => Promise<void>;
    handleDrop: (task: KanbanTask, targetColumn: string) => Promise<void>;
    setDragging: (taskId: string | null) => void;
    setDragOver: (column: string | null) => void;
    openBlockDialog: (taskId: string | null) => void;
    openScheduleDialog: (taskId: string | null) => void;
    pickDirectory: () => Promise<string | null>;
    clearError: () => void;
  };
}

function runtimeUnavailableMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/runtime unavailable|failed to fetch|ECONNREFUSED|network/i.test(msg)) {
    return "Runtime unavailable";
  }
  return msg || "Kanban request failed";
}

export function useKanbanController(
  options: UseKanbanControllerOptions,
): KanbanController {
  const port = options.port ?? runtimeKanbanAdapter;
  const workspacePort = options.workspacePort ?? runtimeKanbanWorkspaceAdapter;
  const visible = options.visible !== false;

  const [state, dispatch] = useReducer(kanbanReducer, initialKanbanState, (init) => {
    let selectedBoardSlug: string | null = null;
    let showArchived = false;
    try {
      selectedBoardSlug = localStorage.getItem(BOARD_STORAGE_KEY);
      showArchived = localStorage.getItem(ARCHIVED_STORAGE_KEY) === "1";
    } catch {
      /* ignore */
    }
    return {
      ...init,
      selectedBoardSlug,
      showArchived,
      instanceId: options.instanceId,
    };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    dispatch({ type: "SET_INSTANCE", instanceId: options.instanceId });
  }, [options.instanceId]);

  useEffect(() => {
    try {
      if (state.selectedBoardSlug) {
        localStorage.setItem(BOARD_STORAGE_KEY, state.selectedBoardSlug);
      }
      localStorage.setItem(ARCHIVED_STORAGE_KEY, state.showArchived ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [state.selectedBoardSlug, state.showArchived]);

  const refresh = useCallback(
    async (silent = false) => {
      const current = stateRef.current;
      const instanceId = current.instanceId ?? options.instanceId;
      if (!instanceId) {
        dispatch({ type: "SET_ERROR", error: "Runtime unavailable" });
        return;
      }
      if (!silent) dispatch({ type: "SET_LOADING", loading: true });
      else dispatch({ type: "SET_REFRESHING", refreshing: true });
      try {
        const [capabilities, boards] = await Promise.all([
          port.getCapabilities(instanceId),
          port.listBoards(instanceId, { includeArchived: false }),
        ]);
        dispatch({ type: "SET_CAPABILITIES", capabilities });
        dispatch({ type: "SET_BOARDS", boards });

        let boardSlug = current.selectedBoardSlug;
        if (!boardSlug || !boards.some((b) => b.slug === boardSlug)) {
          boardSlug = boards[0]?.slug ?? null;
          dispatch({ type: "SET_BOARD", slug: boardSlug });
        }

        if (boardSlug) {
          const tasks = await port.listTasks(instanceId, boardSlug, {
            includeArchived: current.showArchived,
          });
          dispatch({ type: "SET_TASKS", tasks });
          dispatch({
            type: "SET_UNKNOWN_STATUSES",
            statuses: collectUnknownStatuses(tasks),
          });
        } else {
          dispatch({ type: "SET_TASKS", tasks: [] });
        }
        dispatch({ type: "SET_ERROR", error: null });
      } catch (err) {
        dispatch({ type: "SET_ERROR", error: runtimeUnavailableMessage(err) });
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
        dispatch({ type: "SET_REFRESHING", refreshing: false });
      }
    },
    [options.instanceId, port],
  );

  useEffect(() => {
    void refresh();
  }, [refresh, options.instanceId, state.showArchived]);

  useEffect(() => {
    if (!visible) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, visible]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => void refresh(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh, visible]);

  const selectTask = useCallback(
    async (taskId: string | null) => {
      dispatch({ type: "SELECT_TASK", taskId });
      const current = stateRef.current;
      const instanceId = current.instanceId;
      const boardSlug = current.selectedBoardSlug;
      if (!taskId || !instanceId || !boardSlug) {
        dispatch({ type: "SET_TASK_DETAIL", detail: null });
        return;
      }
      try {
        const detail = await port.getTask(instanceId, boardSlug, taskId);
        dispatch({ type: "SET_TASK_DETAIL", detail });
      } catch (err) {
        dispatch({ type: "SET_ERROR", error: runtimeUnavailableMessage(err) });
      }
    },
    [port],
  );

  const executeAction = useCallback(
    async (taskId: string, input: KanbanTaskActionInput) => {
      const current = stateRef.current;
      const instanceId = current.instanceId;
      const boardSlug = current.selectedBoardSlug;
      if (!instanceId || !boardSlug) {
        dispatch({ type: "SET_ERROR", error: "Runtime unavailable" });
        return;
      }
      dispatch({ type: "SET_ACTION_BUSY", actionBusy: `${input.action}:${taskId}` });
      try {
        const task = await port.executeTaskAction(instanceId, boardSlug, taskId, input);
        dispatch({ type: "UPSERT_TASK", task });
        if (current.selectedTaskId === taskId) {
          await selectTask(taskId);
        }
        await refresh(true);
      } catch (err) {
        dispatch({ type: "SET_ERROR", error: runtimeUnavailableMessage(err) });
      } finally {
        dispatch({ type: "SET_ACTION_BUSY", actionBusy: null });
      }
    },
    [port, refresh, selectTask],
  );

  const handleDrop = useCallback(
    async (task: KanbanTask, targetColumn: string) => {
      const action = dragAction(task.status, targetColumn);
      if (!action) return;
      if (!isValidDragTransition(task.status, targetColumn, task.allowedActions)) {
        return;
      }
      if (targetColumn === "done") {
        const ok = window.confirm(`Mark "${task.title}" as done?`);
        if (!ok) return;
      }
      if (action === "block") {
        dispatch({ type: "OPEN_BLOCK_DIALOG", taskId: task.id });
        return;
      }
      if (action === "schedule") {
        dispatch({ type: "OPEN_SCHEDULE_DIALOG", taskId: task.id });
        return;
      }
      await executeAction(task.id, { action });
    },
    [executeAction],
  );

  const columns = useMemo(() => selectRenderedColumns(state), [state]);
  const tasksByStatus = useMemo(
    () => selectTasksByStatus(state.tasks, state.unknownStatuses),
    [state.tasks, state.unknownStatuses],
  );
  const activeBoard = useMemo(() => selectActiveBoard(state), [state]);

  return {
    state,
    columns,
    tasksByStatus,
    activeBoard,
    actions: {
      refresh,
      selectBoard: (slug) => dispatch({ type: "SET_BOARD", slug }),
      toggleArchived: () =>
        dispatch({ type: "SET_SHOW_ARCHIVED", showArchived: !state.showArchived }),
      openCreateTask: (open) => dispatch({ type: "OPEN_CREATE_TASK", open }),
      openCreateBoard: (open) => dispatch({ type: "OPEN_CREATE_BOARD", open }),
      createTask: async (input) => {
        const current = stateRef.current;
        if (!current.instanceId || !current.selectedBoardSlug) {
          dispatch({ type: "SET_ERROR", error: "Runtime unavailable" });
          return;
        }
        dispatch({ type: "SET_ACTION_BUSY", actionBusy: "create-task" });
        try {
          await port.createTask(current.instanceId, current.selectedBoardSlug, input);
          dispatch({ type: "OPEN_CREATE_TASK", open: false });
          await refresh(true);
        } catch (err) {
          dispatch({ type: "SET_ERROR", error: runtimeUnavailableMessage(err) });
        } finally {
          dispatch({ type: "SET_ACTION_BUSY", actionBusy: null });
        }
      },
      createBoard: async (input) => {
        const current = stateRef.current;
        if (!current.instanceId) {
          dispatch({ type: "SET_ERROR", error: "Runtime unavailable" });
          return;
        }
        dispatch({ type: "SET_ACTION_BUSY", actionBusy: "create-board" });
        try {
          const board = await port.createBoard(current.instanceId, input);
          dispatch({ type: "OPEN_CREATE_BOARD", open: false });
          dispatch({ type: "SET_BOARD", slug: board.slug });
          await refresh(true);
        } catch (err) {
          dispatch({ type: "SET_ERROR", error: runtimeUnavailableMessage(err) });
        } finally {
          dispatch({ type: "SET_ACTION_BUSY", actionBusy: null });
        }
      },
      selectTask,
      executeAction,
      addComment: async (taskId, text) => {
        const current = stateRef.current;
        if (!current.instanceId || !current.selectedBoardSlug) return;
        try {
          await port.addComment(current.instanceId, current.selectedBoardSlug, taskId, text);
          await selectTask(taskId);
        } catch (err) {
          dispatch({ type: "SET_ERROR", error: runtimeUnavailableMessage(err) });
        }
      },
      dispatch: async (dryRun = false) => {
        const current = stateRef.current;
        if (!current.instanceId || !current.selectedBoardSlug) {
          dispatch({ type: "SET_ERROR", error: "Runtime unavailable" });
          return;
        }
        dispatch({ type: "SET_ACTION_BUSY", actionBusy: "dispatch" });
        try {
          await port.dispatch(current.instanceId, current.selectedBoardSlug, dryRun);
          await refresh(true);
        } catch (err) {
          dispatch({ type: "SET_ERROR", error: runtimeUnavailableMessage(err) });
        } finally {
          dispatch({ type: "SET_ACTION_BUSY", actionBusy: null });
        }
      },
      handleDrop,
      setDragging: (taskId) => dispatch({ type: "SET_DRAGGING", taskId }),
      setDragOver: (column) => dispatch({ type: "SET_DRAG_OVER", column }),
      openBlockDialog: (taskId) => dispatch({ type: "OPEN_BLOCK_DIALOG", taskId }),
      openScheduleDialog: (taskId) =>
        dispatch({ type: "OPEN_SCHEDULE_DIALOG", taskId }),
      pickDirectory: () => workspacePort.pickDirectory(),
      clearError: () => dispatch({ type: "SET_ERROR", error: null }),
    },
  };
}
