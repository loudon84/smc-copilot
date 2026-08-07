import { runtimeFetch } from "../runtime-http-client";
import { getCachedCapabilities } from "../runtime-capability-manager";
import type { RuntimeCapabilitiesView } from "../../../shared/copilot-runtime/runtime-capability-contract";

export const runtimeClient = {
  getStatus: () => runtimeFetch<Record<string, unknown>>({ path: "/api/v1/runtime/status" }),
  getCapabilities: async (): Promise<RuntimeCapabilitiesView | null> => {
    const cached = getCachedCapabilities();
    if (cached) return cached;
    return runtimeFetch({ path: "/api/v1/runtime/capabilities" });
  },
  getCompatibility: () =>
    runtimeFetch<Record<string, unknown>>({ path: "/api/v1/runtime/compatibility" }),
  getHealth: () => runtimeFetch<Record<string, unknown>>({ path: "/api/v1/health" }),
};
