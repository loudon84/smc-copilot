import type { RuntimeClientAuthOptions } from "./auth-provider";
import { normalizeRuntimeError, RuntimeApiError } from "./error-normalizer";
import { readSseStream, type SseMessage } from "./sse-client";
import type { components } from "../generated/schema";

export type RuntimeStatus = components["schemas"]["RuntimeStatusResponse"];
export type RuntimeCapabilities = components["schemas"]["RuntimeCapabilitiesResponse"];

export interface CreateRuntimeClientOptions extends RuntimeClientAuthOptions {
  baseUrl: string;
  desktopVersion?: string;
  runtimeApiVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface RuntimeClient {
  getStatus(signal?: AbortSignal): Promise<RuntimeStatus>;
  getCapabilities(signal?: AbortSignal): Promise<RuntimeCapabilities>;
  getJobEvents(
    jobId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<SseMessage>;
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function createRuntimeClient(options: CreateRuntimeClientOptions): RuntimeClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (options.desktopVersion) {
      headers["X-Desktop-Version"] = options.desktopVersion;
    }
    if (options.runtimeApiVersion) {
      headers["X-Runtime-Api-Version"] = options.runtimeApiVersion;
    }
    const token = options.getDeviceToken?.();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const legacy = options.getLegacyToken?.();
    if (legacy) {
      headers["X-Copilot-Desktop-Token"] = legacy;
    }

    const res = await fetchImpl(buildUrl(options.baseUrl, path), {
      ...init,
      headers,
    });
    if (!res.ok) {
      let body: unknown = null;
      const text = await res.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      throw normalizeRuntimeError({ status: res.status, body });
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  return {
    getStatus(signal) {
      return request<RuntimeStatus>("/api/v1/runtime/status", { method: "GET", signal });
    },
    getCapabilities(signal) {
      return request<RuntimeCapabilities>("/api/v1/runtime/capabilities", {
        method: "GET",
        signal,
      });
    },
    async *getJobEvents(jobId, signal) {
      const headers: Record<string, string> = { Accept: "text/event-stream" };
      const token = options.getDeviceToken?.();
      if (token) headers.Authorization = `Bearer ${token}`;
      const legacy = options.getLegacyToken?.();
      if (legacy) headers["X-Copilot-Desktop-Token"] = legacy;

      const res = await fetchImpl(
        buildUrl(options.baseUrl, `/api/v1/runtime/jobs/${encodeURIComponent(jobId)}/events`),
        { method: "GET", headers, signal },
      );
      if (!res.ok) {
        throw new RuntimeApiError({
          message: `SSE HTTP ${res.status}`,
          status: res.status,
          code: "sse_error",
        });
      }
      yield* readSseStream(res, signal);
    },
  };
}

export { RuntimeApiError };
