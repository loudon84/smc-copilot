import { runtimeFetch } from "../runtime-http-client";

/** Thin stub — filled in Phase 6. */
export const resourceClient = {
  list: (instanceId: string) =>
    runtimeFetch({ path: `/api/v1/instances/${encodeURIComponent(instanceId)}/resources` }),
  apply: (instanceId: string, type: string, resourceId: string) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/instances/${encodeURIComponent(instanceId)}/resources/${encodeURIComponent(type)}/${encodeURIComponent(resourceId)}/apply`,
      body: {},
    }),
  probe: (instanceId: string, type: string, resourceId: string) =>
    runtimeFetch({
      path: `/api/v1/instances/${encodeURIComponent(instanceId)}/resources/${encodeURIComponent(type)}/${encodeURIComponent(resourceId)}/probe`,
    }),
};
