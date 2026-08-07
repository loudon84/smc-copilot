/**
 * Main-only Serve HTTP client (PRD §5.3).
 * Injects Bearer device token + version headers. Never log token.
 */
import { randomUUID } from "crypto";
import type { DesktopRuntimeError } from "../../shared/copilot-runtime/runtime-error-contract";
import {
  getDeviceTokenSync,
  getLegacySharedTokenSync,
} from "./runtime-auth-store";
import {
  DESKTOP_RUNTIME_API_VERSION,
  DESKTOP_VERSION,
  resolveServeBaseUrl,
} from "./runtime-mode";
import { mapNetworkError, mapServeErrorEnvelope } from "./runtime-error-mapper";

export class CopilotRuntimeHttpError extends Error {
  readonly runtimeError: DesktopRuntimeError;
  readonly status: number | null;

  constructor(runtimeError: DesktopRuntimeError, status: number | null = null) {
    super(runtimeError.message);
    this.name = "CopilotRuntimeHttpError";
    this.runtimeError = runtimeError;
    this.status = status;
  }
}

export type RuntimeHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RuntimeHttpRequestOptions {
  method?: RuntimeHttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Defaults true for mutating methods. */
  idempotent?: boolean;
  /** Skip Authorization header (e.g. pairing start before token). */
  unauthenticated?: boolean;
  signal?: AbortSignal;
  parseJson?: boolean;
}

function buildUrl(baseUrl: string, path: string, query?: RuntimeHttpRequestOptions["query"]): string {
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

export function buildRuntimeRequestHeaders(options?: {
  method?: RuntimeHttpMethod;
  extra?: Record<string, string>;
  unauthenticated?: boolean;
  idempotent?: boolean;
  requestId?: string;
}): { headers: Record<string, string>; requestId: string } {
  const requestId = options?.requestId ?? randomUUID();
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Desktop-Version": DESKTOP_VERSION,
    "X-Runtime-Api-Version": DESKTOP_RUNTIME_API_VERSION,
    "X-Request-ID": requestId,
    ...options?.extra,
  };

  if (!options?.unauthenticated) {
    const deviceToken = getDeviceTokenSync();
    if (deviceToken) {
      headers.Authorization = `Bearer ${deviceToken}`;
    }
    // Legacy shared token only as deprecated bridge for old Serve installs.
    const legacy = getLegacySharedTokenSync();
    if (legacy) {
      headers["X-Copilot-Desktop-Token"] = legacy;
    }
  }

  const isWrite = method !== "GET";
  const wantIdempotency = options?.idempotent ?? isWrite;
  if (wantIdempotency && isWrite) {
    headers["Idempotency-Key"] = randomUUID();
  }

  return { headers, requestId };
}

export async function runtimeFetch<T = unknown>(
  options: RuntimeHttpRequestOptions,
): Promise<T> {
  const method = options.method ?? "GET";
  const baseUrl = resolveServeBaseUrl();
  const url = buildUrl(baseUrl, options.path, options.query);
  const { headers, requestId } = buildRuntimeRequestHeaders({
    method,
    extra: options.headers,
    unauthenticated: options.unauthenticated,
    idempotent: options.idempotent,
  });

  let body: BodyInit | undefined;
  if (options.body !== undefined && options.body !== null) {
    if (typeof FormData !== "undefined" && options.body instanceof FormData) {
      body = options.body as BodyInit;
      delete headers["Content-Type"];
    } else if (typeof options.body === "string" || options.body instanceof Uint8Array) {
      body = options.body as BodyInit;
    } else {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(options.body);
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body,
      signal: options.signal,
    });
  } catch (err) {
    throw new CopilotRuntimeHttpError(mapNetworkError(err, requestId));
  }

  if (!res.ok) {
    let parsed: unknown = null;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    throw new CopilotRuntimeHttpError(
      mapServeErrorEnvelope({
        status: res.status,
        body: parsed,
        requestId,
        fallbackMessage: `HTTP ${res.status}`,
      }),
      res.status,
    );
  }

  if (res.status === 204 || options.parseJson === false) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return (await res.text()) as T;
  }
  return (await res.json()) as T;
}

export async function runtimeFetchRaw(
  options: RuntimeHttpRequestOptions,
): Promise<Response> {
  const method = options.method ?? "GET";
  const baseUrl = resolveServeBaseUrl();
  const url = buildUrl(baseUrl, options.path, options.query);
  const { headers, requestId } = buildRuntimeRequestHeaders({
    method,
    extra: options.headers,
    unauthenticated: options.unauthenticated,
    idempotent: options.idempotent,
  });

  try {
    const res = await fetch(url, {
      method,
      headers,
      body:
        options.body === undefined || options.body === null
          ? undefined
          : typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body),
      signal: options.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* keep text */
      }
      throw new CopilotRuntimeHttpError(
        mapServeErrorEnvelope({
          status: res.status,
          body: parsed,
          requestId,
        }),
        res.status,
      );
    }
    return res;
  } catch (err) {
    if (err instanceof CopilotRuntimeHttpError) throw err;
    throw new CopilotRuntimeHttpError(mapNetworkError(err, requestId));
  }
}
