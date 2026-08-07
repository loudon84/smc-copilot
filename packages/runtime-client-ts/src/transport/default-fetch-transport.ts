import { normalizeRuntimeError, RuntimeApiError } from "../client/error-normalizer";
import { readSseStream } from "../client/sse-client";
import type { RuntimeClientAuthOptions } from "../client/auth-provider";
import type {
  RuntimeRequest,
  RuntimeSseMessage,
  RuntimeStreamRequest,
  RuntimeTransport,
} from "./types";

export interface DefaultFetchTransportOptions extends RuntimeClientAuthOptions {
  baseUrl: string;
  desktopVersion?: string;
  runtimeApiVersion?: string;
  fetchImpl?: typeof fetch;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: RuntimeRequest["query"],
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl.replace(/\/$/, "")}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildHeaders(
  options: DefaultFetchTransportOptions,
  request: RuntimeRequest | RuntimeStreamRequest,
  accept: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    ...(request.headers ?? {}),
  };
  if (options.desktopVersion) {
    headers["X-Desktop-Version"] = options.desktopVersion;
  }
  if (options.runtimeApiVersion) {
    headers["X-Runtime-Api-Version"] = options.runtimeApiVersion;
  }
  if (!("unauthenticated" in request && request.unauthenticated)) {
    const token = options.getDeviceToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const legacy = options.getLegacyToken?.();
    if (legacy) headers["X-Copilot-Desktop-Token"] = legacy;
  }
  return headers;
}

/** Default package transport (lightweight). Desktop should inject DesktopRuntimeTransport. */
export function createDefaultFetchTransport(
  options: DefaultFetchTransportOptions,
): RuntimeTransport {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async request<T>(request: RuntimeRequest): Promise<T> {
      const method = request.method ?? "GET";
      const headers = buildHeaders(options, request, "application/json");
      let body: BodyInit | undefined;
      if (request.body !== undefined && request.body !== null) {
        if (typeof FormData !== "undefined" && request.body instanceof FormData) {
          body = request.body as BodyInit;
        } else if (typeof request.body === "string" || request.body instanceof Uint8Array) {
          body = request.body as BodyInit;
        } else {
          headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
          body = JSON.stringify(request.body);
        }
      }
      const res = await fetchImpl(buildUrl(options.baseUrl, request.path, request.query), {
        method,
        headers,
        body,
        signal: request.signal,
      });
      if (!res.ok) {
        let parsed: unknown = null;
        const text = await res.text();
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        throw normalizeRuntimeError({ status: res.status, body: parsed });
      }
      if (request.parseJson === false) {
        return res as unknown as T;
      }
      if (res.status === 204) {
        return undefined as T;
      }
      return (await res.json()) as T;
    },

    async *stream(request: RuntimeStreamRequest): AsyncIterable<RuntimeSseMessage> {
      const headers = buildHeaders(options, request, "text/event-stream");
      if (request.lastEventId) {
        headers["Last-Event-ID"] = request.lastEventId;
      }
      let body: BodyInit | undefined;
      if (request.body !== undefined && request.body !== null) {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        body = JSON.stringify(request.body);
      }
      const res = await fetchImpl(buildUrl(options.baseUrl, request.path, request.query), {
        method: request.method ?? "GET",
        headers,
        body,
        signal: request.signal,
      });
      if (!res.ok) {
        throw new RuntimeApiError({
          message: `SSE HTTP ${res.status}`,
          status: res.status,
          code: "sse_error",
        });
      }
      yield* readSseStream(res, request.signal);
    },
  };
}
