import { getSmcRuntimeClient } from "../smc-runtime-client";
import { getCachedCapabilities, toCapabilitiesView } from "../runtime-capability-manager";
import type { RuntimeCapabilitiesView } from "../../../shared/copilot-runtime/runtime-capability-contract";

export const runtimeClient = {
  getStatus: () => getSmcRuntimeClient().runtime.getStatus() as Promise<Record<string, unknown>>,
  getCapabilities: async (): Promise<RuntimeCapabilitiesView | null> => {
    const cached = getCachedCapabilities();
    if (cached) return cached;
    const raw = await getSmcRuntimeClient().runtime.getCapabilities();
    return toCapabilitiesView(raw as { apiVersion?: string; features?: string[] });
  },
  getCompatibility: () => getSmcRuntimeClient().runtime.getCompatibility(),
  getHealth: () => getSmcRuntimeClient().runtime.getHealth(),
};
