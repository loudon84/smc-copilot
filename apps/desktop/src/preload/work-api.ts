import { ipcRenderer } from "electron";
import type { WorkTaskEvent } from "../shared/work/work-event-contract";
import type {
  WorkTask,
  WorkTaskResumeResult,
  WorkTaskSendInput,
  WorkTaskSendResult,
  WorkTaskStartInput,
  WorkTaskStartResult,
} from "../shared/work/work-task-contract";

export const workApiBridge = {
  task: {
    start(input: WorkTaskStartInput & { task: WorkTask }): Promise<WorkTaskStartResult> {
      return ipcRenderer.invoke("work:task-start", input);
    },
    resume(taskId: string, profile?: string): Promise<WorkTaskResumeResult> {
      return ipcRenderer.invoke("work:task-resume", taskId, profile);
    },
    list(profile?: string): Promise<WorkTask[]> {
      return ipcRenderer.invoke("work:task-list", profile);
    },
    getBySession(sessionId: string, profile?: string): Promise<WorkTask | null> {
      return ipcRenderer.invoke("work:task-get-by-session", sessionId, profile);
    },
    /** @deprecated v7.4 legacy */
    send(input: WorkTaskSendInput): Promise<WorkTaskSendResult> {
      return ipcRenderer.invoke("work:task-send", input);
    },
    stop(taskId: string): Promise<void> {
      return ipcRenderer.invoke("work:task-stop", taskId);
    },
    onEvent(callback: (event: WorkTaskEvent) => void): () => void {
      const listener = (_event: Electron.IpcRendererEvent, payload: WorkTaskEvent) => {
        callback(payload);
      };
      ipcRenderer.on("work:task-event", listener);
      return () => {
        ipcRenderer.removeListener("work:task-event", listener);
      };
    },
  },
};
