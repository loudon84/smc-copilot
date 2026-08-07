import { ipcRenderer } from "electron";
import {
  WORK_TASKS_CHANNELS,
  type WorkTaskAssignInput,
  type WorkTaskCreateInput,
  type WorkTaskDto,
  type WorkTaskEventPush,
  type WorkTaskListParams,
  type WorkTaskListResult,
  type WorkTaskSnapshotDto,
  type WorkTaskStartResultDto,
  type WorkTaskSubscribeInput,
  type WorkTaskSubscribeResult,
} from "../shared/work-tasks/work-tasks-contract";

export const workTasksApi = {
  hasWorkV2(): Promise<boolean> {
    return ipcRenderer.invoke(WORK_TASKS_CHANNELS.hasWorkV2);
  },

  list(params?: WorkTaskListParams): Promise<WorkTaskListResult> {
    return ipcRenderer.invoke(WORK_TASKS_CHANNELS.list, params);
  },

  get(taskId: string): Promise<WorkTaskDto> {
    return ipcRenderer.invoke(WORK_TASKS_CHANNELS.get, taskId);
  },

  create(input: WorkTaskCreateInput): Promise<WorkTaskDto> {
    return ipcRenderer.invoke(WORK_TASKS_CHANNELS.create, input);
  },

  start(taskId: string): Promise<WorkTaskStartResultDto> {
    return ipcRenderer.invoke(WORK_TASKS_CHANNELS.start, taskId);
  },

  cancel(taskId: string): Promise<WorkTaskDto> {
    return ipcRenderer.invoke(WORK_TASKS_CHANNELS.cancel, taskId);
  },

  retry(taskId: string): Promise<WorkTaskStartResultDto> {
    return ipcRenderer.invoke(WORK_TASKS_CHANNELS.retry, taskId);
  },

  assign(taskId: string, input: WorkTaskAssignInput): Promise<WorkTaskDto> {
    return ipcRenderer.invoke(WORK_TASKS_CHANNELS.assign, taskId, input);
  },

  getSnapshot(taskId: string): Promise<WorkTaskSnapshotDto> {
    return ipcRenderer.invoke(WORK_TASKS_CHANNELS.getSnapshot, taskId);
  },

  /**
   * Main-side SSE subscription. Events are pushed on work-tasks:event.
   * Returns unsubscribe that stops Main stream and removes listener.
   */
  subscribeEvents(
    input: WorkTaskSubscribeInput,
    callback: (payload: WorkTaskEventPush) => void,
  ): () => void {
    let subscriptionId: string | null = null;
    let disposed = false;

    const listener = (_event: Electron.IpcRendererEvent, payload: WorkTaskEventPush) => {
      if (subscriptionId && payload.subscriptionId !== subscriptionId) return;
      if (payload.taskId !== input.taskId) return;
      callback(payload);
    };
    ipcRenderer.on(WORK_TASKS_CHANNELS.event, listener);

    void ipcRenderer
      .invoke(WORK_TASKS_CHANNELS.subscribeEvents, input)
      .then((result: WorkTaskSubscribeResult) => {
        if (disposed) {
          void ipcRenderer.invoke(WORK_TASKS_CHANNELS.unsubscribeEvents, result.subscriptionId);
          return;
        }
        subscriptionId = result.subscriptionId;
      })
      .catch((err: unknown) => {
        console.warn("[workTasks] subscribeEvents failed", err);
      });

    return () => {
      disposed = true;
      ipcRenderer.removeListener(WORK_TASKS_CHANNELS.event, listener);
      if (subscriptionId) {
        void ipcRenderer.invoke(WORK_TASKS_CHANNELS.unsubscribeEvents, subscriptionId);
        subscriptionId = null;
      }
    };
  },
};

export type WorkTasksAPI = typeof workTasksApi;
