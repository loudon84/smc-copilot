import { getSmcRuntimeClient } from "../smc-runtime-client";
import type {
  WorkTaskAssignBody,
  WorkTaskCreate,
  WorkTaskEventsQuery,
  WorkTaskListQuery,
  WorkTaskPatch,
} from "@smc/runtime-client";

function workTasks() {
  return getSmcRuntimeClient().workTasks;
}

export const taskClient = {
  list: (query?: WorkTaskListQuery, signal?: AbortSignal) => workTasks().list(query, signal),
  create: (body: WorkTaskCreate, signal?: AbortSignal) => workTasks().create(body, signal),
  get: (taskId: string, signal?: AbortSignal) => workTasks().get(taskId, signal),
  patch: (taskId: string, body: WorkTaskPatch, signal?: AbortSignal) =>
    workTasks().patch(taskId, body, signal),
  delete: (taskId: string, signal?: AbortSignal) => workTasks().delete(taskId, signal),
  assign: (taskId: string, body: WorkTaskAssignBody, signal?: AbortSignal) =>
    workTasks().assign(taskId, body, signal),
  start: (taskId: string, signal?: AbortSignal) => workTasks().start(taskId, signal),
  cancel: (taskId: string, signal?: AbortSignal) => workTasks().cancel(taskId, signal),
  retry: (taskId: string, signal?: AbortSignal) => workTasks().retry(taskId, signal),
  listRuns: (taskId: string, signal?: AbortSignal) => workTasks().listRuns(taskId, signal),
  listEvents: (taskId: string, query?: WorkTaskEventsQuery, signal?: AbortSignal) =>
    workTasks().listEvents(taskId, query, signal),
  streamEvents: (
    taskId: string,
    opts?: { lastEventId?: string; signal?: AbortSignal },
  ) => workTasks().streamEvents(taskId, opts),
  getSnapshot: (taskId: string, signal?: AbortSignal) => workTasks().getSnapshot(taskId, signal),
};
