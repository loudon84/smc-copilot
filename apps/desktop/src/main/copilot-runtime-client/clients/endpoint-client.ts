import { runtimeFetch } from "../runtime-http-client";

/** Thin stub — filled in Phase 7. */
export const endpointClient = {
  status: () => runtimeFetch({ path: "/api/v1/endpoint/status" }),
  inventory: () => runtimeFetch({ path: "/api/v1/endpoint/inventory" }),
  syncNow: () => runtimeFetch({ method: "POST", path: "/api/v1/sync/now", body: {} }),
};
