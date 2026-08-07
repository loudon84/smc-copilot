import { runtimeFetch } from "../runtime-http-client";

/** Thin stub — filled in Phase 4. */
export const sessionClient = {
  list: (instanceId: string) =>
    runtimeFetch({ path: `/api/v1/instances/${encodeURIComponent(instanceId)}/sessions` }),
  get: (instanceId: string, sessionId: string) =>
    runtimeFetch({
      path: `/api/v1/instances/${encodeURIComponent(instanceId)}/sessions/${encodeURIComponent(sessionId)}`,
    }),
  catalog: (query?: Record<string, string | number | boolean | undefined | null>) =>
    runtimeFetch({ path: "/api/v1/session-catalog", query }),
  patch: (instanceId: string, sessionId: string, body: Record<string, unknown>) =>
    runtimeFetch({
      method: "PATCH",
      path: `/api/v1/instances/${encodeURIComponent(instanceId)}/sessions/${encodeURIComponent(sessionId)}`,
      body,
    }),
};
