import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import type { WorkTaskEvent } from "../../shared/work/work-event-contract";
import type {
  WorkTask,
  WorkTaskSendInput,
  WorkTaskSendResult,
  WorkTaskStartInput,
  WorkTaskStartResult,
  WorkTaskResumeResult,
} from "../../shared/work/work-task-contract";
import {
  bindWorkTaskSession,
  createWorkTaskId,
  getWorkTask,
  listWorkTasks,
  upsertWorkTask,
} from "./work-task-store";
import { emitWorkTaskEvent, stopWorkTaskStream, startWorkTaskStream } from "./work-task-stream";

let getWindow: (() => BrowserWindow | null) | null = null;

export function registerWorkIpc(getMainWindow: () => BrowserWindow | null): void {
  getWindow = getMainWindow;

  ipcMain.handle(
    "work:task-start",
    async (_event, input: WorkTaskStartInput & { task?: WorkTask }): Promise<WorkTaskStartResult> => {
      const profile = input.profile ?? "default";
      const task = input.task;
      if (!task?.sessionId) {
        return { ok: false, taskId: "", sessionId: "", profile, error: "WORK_TASK_MISSING_SESSION" };
      }
      const saved = upsertWorkTask(task, profile);
      bindWorkTaskSession(
        { taskId: saved.id, sessionId: saved.sessionId, profile: saved.profile },
        profile,
      );
      return { ok: true, taskId: saved.id, sessionId: saved.sessionId, profile };
    },
  );

  ipcMain.handle("work:task-list", async (_event, profile?: string): Promise<WorkTask[]> => {
    return listWorkTasks(profile ?? "default");
  });

  ipcMain.handle(
    "work:task-resume",
    async (_event, taskId: string, profile?: string): Promise<WorkTaskResumeResult> => {
      const task = getWorkTask(taskId, profile ?? "default");
      if (!task) {
        return { ok: false, task: null, error: "WORK_TASK_NOT_FOUND" };
      }
      return { ok: true, task };
    },
  );

  ipcMain.handle(
    "work:task-get-by-session",
    async (_event, sessionId: string, profile?: string): Promise<WorkTask | null> => {
      const tasks = listWorkTasks(profile ?? "default");
      return tasks.find((t) => t.sessionId === sessionId) ?? null;
    },
  );

  /** @deprecated v7.4 legacy — Renderer uses hermesDefaultChat directly */
  ipcMain.handle(
    "work:task-send",
    async (_event, input: WorkTaskSendInput): Promise<WorkTaskSendResult> => {
      const taskId = input.taskId ?? createWorkTaskId();
      void startWorkTaskStream(taskId, input, (ev) => {
        const win = getWindow?.();
        win?.webContents.send("work:task-event", ev);
      });
      return { taskId, ok: true, streamId: taskId };
    },
  );

  ipcMain.handle("work:task-stop", async (_event, taskId: string) => {
    stopWorkTaskStream(taskId);
  });
}

export function pushWorkTaskEventToRenderer(event: WorkTaskEvent): void {
  const win = getWindow?.();
  win?.webContents.send("work:task-event", event);
  emitWorkTaskEvent(event);
}
