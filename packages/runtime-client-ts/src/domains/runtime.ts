import type { components } from "../generated/schema";
import type { RuntimeSseMessage, RuntimeTransport } from "../transport/types";

export type RuntimeStatus = components["schemas"]["RuntimeStatusResponse"];
export type RuntimeCapabilities = components["schemas"]["RuntimeCapabilitiesResponse"];

export interface RuntimeDomain {
  getStatus(signal?: AbortSignal): Promise<RuntimeStatus>;
  getCapabilities(signal?: AbortSignal): Promise<RuntimeCapabilities>;
  getCompatibility(signal?: AbortSignal): Promise<Record<string, unknown>>;
  getHealth(signal?: AbortSignal): Promise<Record<string, unknown>>;
  getJobEvents(jobId: string, signal?: AbortSignal): AsyncIterable<RuntimeSseMessage>;
}

export function createRuntimeDomain(transport: RuntimeTransport): RuntimeDomain {
  return {
    getStatus(signal) {
      return transport.request<RuntimeStatus>({ path: "/api/v1/runtime/status", signal });
    },
    getCapabilities(signal) {
      return transport.request<RuntimeCapabilities>({
        path: "/api/v1/runtime/capabilities",
        signal,
      });
    },
    getCompatibility(signal) {
      return transport.request({ path: "/api/v1/runtime/compatibility", signal });
    },
    getHealth(signal) {
      return transport.request({ path: "/api/v1/health", signal });
    },
    getJobEvents(jobId, signal) {
      return transport.stream({
        path: `/api/v1/runtime/jobs/${encodeURIComponent(jobId)}/events`,
        signal,
      });
    },
  };
}
