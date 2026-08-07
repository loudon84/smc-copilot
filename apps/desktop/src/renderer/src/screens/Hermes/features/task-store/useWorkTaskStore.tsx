import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { WorkTask } from "../../../../../../shared/work/work-task-contract";
import type { WorkTaskStartInput } from "../../../../../../shared/work/work-task-contract";
import {
  workTaskReducer,
  initialWorkTaskState,
  type WorkTaskRightPanelTab,
} from "./workTaskReducer";
import { workTaskApi } from "../../api/workTaskApi";
import { useHermesDefault } from "../../context/HermesDefaultContext";

type WorkTaskStoreValue = {
  tasks: WorkTask[];
  activeTask: WorkTask | null;
  activeTaskId: string | null;
  events: [];
  outputs: [];
  participants: [];
  isStreaming: boolean;
  rightPanelTab: WorkTaskRightPanelTab;
  rightPanelOpen: boolean;
  setActiveTaskId: (id: string | null) => void;
  openTask: (task: WorkTask) => void;
  closeTask: () => void;
  startTask: (input: WorkTaskStartInput) => Promise<WorkTask | null>;
  resumeTask: (taskId: string) => Promise<WorkTask | null>;
  refreshTasks: () => Promise<void>;
  setRightPanelTab: (tab: WorkTaskRightPanelTab) => void;
  setRightPanelOpen: (open: boolean) => void;
  renameTask: (taskId: string, title: string) => void;
};

const WorkTaskStoreContext = createContext<WorkTaskStoreValue | null>(null);

export function WorkTaskStoreProvider({ children }: { children: ReactNode }) {
  const { setActiveSessionId } = useHermesDefault();
  const [state, dispatch] = useReducer(workTaskReducer, initialWorkTaskState);

  const refreshTasks = useCallback(async () => {
    const tasks = await workTaskApi.listRecentTasks();
    dispatch({ type: "HYDRATE", state: { tasks: Object.fromEntries(tasks.map((t) => [t.id, t])), taskOrder: tasks.map((t) => t.id) } });
  }, []);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const tasks = useMemo(
    () => state.taskOrder.map((id) => state.tasks[id]).filter(Boolean),
    [state.tasks, state.taskOrder],
  );

  const activeTask = state.activeTaskId ? state.tasks[state.activeTaskId] ?? null : null;

  const setActiveTaskId = useCallback((taskId: string | null) => {
    dispatch({ type: "SET_ACTIVE_TASK", taskId });
  }, []);

  const openTask = useCallback(
    (task: WorkTask) => {
      dispatch({ type: "ADD_TASK", task });
      dispatch({ type: "SET_ACTIVE_TASK", taskId: task.id });
      setActiveSessionId(task.sessionId);
    },
    [setActiveSessionId],
  );

  const closeTask = useCallback(() => {
    dispatch({ type: "SET_ACTIVE_TASK", taskId: null });
  }, []);

  const startTask = useCallback(
    async (input: WorkTaskStartInput): Promise<WorkTask | null> => {
      const result = await workTaskApi.startTask(input);
      if (!result.ok || !result.sessionId) return null;
      const task =
        (await workTaskApi.get(result.taskId)) ??
        ({
          id: result.taskId,
          title: input.prompt.slice(0, 80),
          sessionId: result.sessionId,
          profile: result.profile,
          taskType: input.selectedTeamId ? "expert_team" : "chat",
          status: "running",
          source: "work_home",
          sourceWorkspace: "work",
          activeTeamId: input.selectedTeamId,
          selectedExpertIds: input.selectedExpertIds ?? [],
          selectedSkillIds: input.selectedSkillIds ?? [],
          selectedAppIds: input.selectedAppIds ?? [],
          permissionMode: input.permissionMode ?? "default",
          mode: input.mode,
          contextRefs: input.contextRefs ?? [],
          outputRefs: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies WorkTask);
      openTask(task);
      void refreshTasks();
      return task;
    },
    [openTask, refreshTasks],
  );

  const resumeTask = useCallback(
    async (taskId: string): Promise<WorkTask | null> => {
      const result = await workTaskApi.resumeTask(taskId);
      if (!result.ok || !result.task) return null;
      openTask(result.task);
      return result.task;
    },
    [openTask],
  );

  const setRightPanelTab = useCallback((tab: WorkTaskRightPanelTab) => {
    dispatch({ type: "SET_RIGHT_PANEL_TAB", tab });
  }, []);

  const setRightPanelOpen = useCallback((open: boolean) => {
    dispatch({ type: "SET_RIGHT_PANEL_OPEN", open });
  }, []);

  const renameTask = useCallback((taskId: string, title: string) => {
    dispatch({ type: "UPDATE_TASK", taskId, patch: { title } });
  }, []);

  const value = useMemo<WorkTaskStoreValue>(
    () => ({
      tasks,
      activeTask,
      activeTaskId: state.activeTaskId,
      events: [],
      outputs: [],
      participants: [],
      isStreaming: false,
      rightPanelTab: state.rightPanelTab,
      rightPanelOpen: state.rightPanelOpen,
      setActiveTaskId,
      openTask,
      closeTask,
      startTask,
      resumeTask,
      refreshTasks,
      setRightPanelTab,
      setRightPanelOpen,
      renameTask,
    }),
    [
      tasks,
      activeTask,
      state.activeTaskId,
      state.rightPanelTab,
      state.rightPanelOpen,
      setActiveTaskId,
      openTask,
      closeTask,
      startTask,
      resumeTask,
      refreshTasks,
      setRightPanelTab,
      setRightPanelOpen,
      renameTask,
    ],
  );

  return (
    <WorkTaskStoreContext.Provider value={value}>{children}</WorkTaskStoreContext.Provider>
  );
}

export function useWorkTaskStore(): WorkTaskStoreValue {
  const ctx = useContext(WorkTaskStoreContext);
  if (!ctx) {
    throw new Error("useWorkTaskStore must be used within WorkTaskStoreProvider");
  }
  return ctx;
}
