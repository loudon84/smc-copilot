import { getSmcRuntimeClient } from "../smc-runtime-client";

export const taskClient = {
  list: () => getSmcRuntimeClient().tasks.list(),
  create: (body: Record<string, unknown>) => getSmcRuntimeClient().tasks.create(body),
  get: (taskId: string) => getSmcRuntimeClient().tasks.get(taskId),
  cancel: (taskId: string) => getSmcRuntimeClient().tasks.cancel(taskId),
  start: (taskId: string) =>
    getSmcRuntimeClient().transport.request({
      method: "POST",
      path: `/api/v1/work-tasks/${encodeURIComponent(taskId)}/start`,
      body: {},
    }),
};
