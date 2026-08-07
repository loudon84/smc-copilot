import { ipcMain } from "electron";
import type {
  WebOperatorTaskSessionPrepareNewInput,
  WebOperatorTaskSessionResolveInput,
  WebOperatorTaskSessionUpsertInput,
} from "../shared/web-operator/web-operator-task-session-contract";
import {
  getLastActiveTaskSession,
  prepareNewTaskSession,
  removeTaskSession,
  resolveTaskSession,
  upsertTaskSession,
} from "./web-operator-task-session-store";

export function registerWebOperatorTaskSessionIpc(): void {
  ipcMain.handle(
    "web-operator-task-session:resolve",
    (_event, input: WebOperatorTaskSessionResolveInput) => {
      if (!input?.source || typeof input.source !== "string") {
        throw new Error("source is required");
      }
      if (!input?.requestId || typeof input.requestId !== "string") {
        throw new Error("requestId is required");
      }
      return resolveTaskSession(input);
    },
  );

  ipcMain.handle(
    "web-operator-task-session:upsert",
    (_event, input: WebOperatorTaskSessionUpsertInput) => {
      if (
        !input?.source ||
        !input?.requestId ||
        !input?.pageUrl ||
        !input?.sessionId ||
        !input?.pageContext
      ) {
        throw new Error("source, requestId, pageUrl, sessionId, and pageContext are required");
      }
      return upsertTaskSession(input);
    },
  );

  ipcMain.handle(
    "web-operator-task-session:prepare-new",
    (_event, input: WebOperatorTaskSessionPrepareNewInput) => {
      if (!input?.source || typeof input.source !== "string") {
        throw new Error("source is required");
      }
      if (!input?.requestId || typeof input.requestId !== "string") {
        throw new Error("requestId is required");
      }
      return prepareNewTaskSession(input);
    },
  );

  ipcMain.handle("web-operator-task-session:remove", (_event, taskId: string) => {
    if (!taskId || typeof taskId !== "string") {
      throw new Error("taskId is required");
    }
    removeTaskSession(taskId);
    return { ok: true as const };
  });

  ipcMain.handle("web-operator-task-session:get-last-active", () => {
    return getLastActiveTaskSession();
  });
}
