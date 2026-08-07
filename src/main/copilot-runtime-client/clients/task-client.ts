import { runtimeFetch } from "../runtime-http-client";

/** Thin stub — filled in Phase 5. */
export const taskClient = {
  list: () => runtimeFetch({ path: "/api/v1/work-tasks" }),
  create: (body: Record<string, unknown>) =>
    runtimeFetch({ method: "POST", path: "/api/v1/work-tasks", body }),
  get: (taskId: string) =>
    runtimeFetch({ path: `/api/v1/work-tasks/${encodeURIComponent(taskId)}` }),
  start: (taskId: string) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/work-tasks/${encodeURIComponent(taskId)}/start`,
      body: {},
    }),
  cancel: (taskId: string) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/work-tasks/${encodeURIComponent(taskId)}/cancel`,
      body: {},
    }),
};
