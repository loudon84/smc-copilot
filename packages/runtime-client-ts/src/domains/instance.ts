import type { RuntimeTransport } from "../transport/types";

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
  health(instanceId: string, signal?: AbortSignal): Promise<unknown>;
  logs(instanceId: string, query?: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<unknown>;
}

export function createInstanceDomain(transport: RuntimeTransport): InstanceDomain {
  const enc = encodeURIComponent;
  return {
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
    health(instanceId, signal) {
      return transport.request({ path: `/api/v1/instances/${enc(instanceId)}/health`, signal });
    },
    logs(instanceId, query, signal) {
      return transport.request({
        path: `/api/v1/instances/${enc(instanceId)}/logs`,
        query,
        signal,
      });
    },
  };
}
