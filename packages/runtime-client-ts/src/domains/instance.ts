import type { RuntimeTransport } from "../transport/types";
import type { components } from "../generated/schema";

export type InstanceHealthResponse = components["schemas"]["InstanceHealthResponse"];
export type InstanceStateResponse = components["schemas"]["InstanceStateResponse"];
export type InstanceDiagnosticsResponse = components["schemas"]["InstanceDiagnosticsResponse"];

export interface InstanceDomain {
  list(signal?: AbortSignal): Promise<unknown>;
  get(instanceId: string, signal?: AbortSignal): Promise<unknown>;
  resolve(ref: string, signal?: AbortSignal): Promise<unknown>;
  create(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  patch(instanceId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  delete(instanceId: string, signal?: AbortSignal): Promise<unknown>;
  start(instanceId: string, signal?: AbortSignal): Promise<unknown>;
  stop(instanceId: string, signal?: AbortSignal): Promise<unknown>;
  restart(instanceId: string, signal?: AbortSignal): Promise<unknown>;
  /** PRD v1.5 health-v2 structured probe */
  getHealth(instanceId: string, signal?: AbortSignal): Promise<InstanceHealthResponse>;
  /** @deprecated use getHealth */
  health(instanceId: string, signal?: AbortSignal): Promise<InstanceHealthResponse>;
  getState(instanceId: string, signal?: AbortSignal): Promise<InstanceStateResponse>;
  getDiagnostics(instanceId: string, signal?: AbortSignal): Promise<InstanceDiagnosticsResponse>;
  /** PRD v1.5.1 — re-inspect ownership (not restart) */
  reconcile(instanceId: string, signal?: AbortSignal): Promise<Record<string, unknown>>;
  logs(
    instanceId: string,
    query?: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

export function createInstanceDomain(transport: RuntimeTransport): InstanceDomain {
  const enc = encodeURIComponent;
  const domain: InstanceDomain = {
    list(signal) {
      return transport.request({ path: "/api/v1/instances", signal });
    },
    get(instanceId, signal) {
      return transport.request({ path: `/api/v1/instances/${enc(instanceId)}`, signal });
    },
    resolve(ref, signal) {
      return transport.request({ path: "/api/v1/instances/resolve", query: { ref }, signal });
    },
    create(body, signal) {
      return transport.request({ method: "POST", path: "/api/v1/instances", body, signal });
    },
    patch(instanceId, body, signal) {
      return transport.request({
        method: "PATCH",
        path: `/api/v1/instances/${enc(instanceId)}`,
        body,
        signal,
      });
    },
    delete(instanceId, signal) {
      return transport.request({
        method: "DELETE",
        path: `/api/v1/instances/${enc(instanceId)}`,
        signal,
      });
    },
    start(instanceId, signal) {
      return transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/start`,
        body: {},
        signal,
      });
    },
    stop(instanceId, signal) {
      return transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/stop`,
        body: {},
        signal,
      });
    },
    restart(instanceId, signal) {
      return transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/restart`,
        body: {},
        signal,
      });
    },
    getHealth(instanceId, signal) {
      return transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/health`,
        signal,
      }) as Promise<InstanceHealthResponse>;
    },
    health(instanceId, signal) {
      return domain.getHealth(instanceId, signal);
    },
    getState(instanceId, signal) {
      return transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/state`,
        signal,
      }) as Promise<InstanceStateResponse>;
    },
    getDiagnostics(instanceId, signal) {
      return transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/diagnostics`,
        signal,
      }) as Promise<InstanceDiagnosticsResponse>;
    },
    reconcile(instanceId, signal) {
      return transport.request({
        method: "POST",
        path: `/api/v1/instances/${enc(instanceId)}/reconcile`,
        signal,
      }) as Promise<Record<string, unknown>>;
    },
    logs(instanceId, query, signal) {
      return transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/logs`,
        query,
        signal,
      });
    },
  };
  return domain;
}
