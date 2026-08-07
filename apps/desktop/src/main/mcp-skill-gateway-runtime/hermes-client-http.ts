import { unwrapNodeDeskClawResponse } from "../auth/nodeskclaw-auth-response";
import { resolveBackendBaseUrl } from "./mcp-skill-gateway-config";
import { getMcpAccessToken } from "./mcp-token-provider";
import { HermesClientError } from "../../shared/hermes-client/hermes-client-errors";

export interface HermesClientHttpOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  requireAuth?: boolean;
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function requireBackendBaseUrl(): string {
  const base = resolveBackendBaseUrl();
  if (!base) {
    throw new HermesClientError(
      "HERMES_CLIENT_BACKEND_NOT_CONFIGURED",
      "Backend URL is not configured",
    );
  }
  return base;
}

export async function hermesClientFetch<T>(
  path: string,
  options: HermesClientHttpOptions = {},
): Promise<T> {
  const token = getMcpAccessToken();
  if (options.requireAuth !== false && !token) {
    throw new HermesClientError("HERMES_CLIENT_NOT_AUTHENTICATED", "Desktop login required");
  }

  const backendBaseUrl = requireBackendBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const finalUrl = path.startsWith("http")
    ? path
    : joinUrl(backendBaseUrl, normalizedPath);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token && options.requireAuth !== false) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(finalUrl, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (res.status === 401) {
      throw new HermesClientError(
        "HERMES_CLIENT_NOT_AUTHENTICATED",
        "Session expired or unauthorized",
      );
    }

    if (res.status === 403) {
      throw new HermesClientError(
        "HERMES_CLIENT_EVENT_STREAM_FORBIDDEN",
        "Forbidden",
      );
    }

    if (!res.ok) {
      const message =
        typeof parsed === "object" &&
        parsed &&
        "message" in parsed &&
        typeof (parsed as { message?: string }).message === "string"
          ? (parsed as { message: string }).message
          : `Hermes Client API failed: HTTP ${res.status}`;
      throw new HermesClientError("HERMES_CLIENT_API_FAILED", message);
    }

    if (parsed === null || parsed === "") {
      return undefined as T;
    }

    if (typeof parsed === "string") {
      return parsed as T;
    }

    return unwrapNodeDeskClawResponse<T>(parsed);
  } catch (err) {
    if (err instanceof HermesClientError) throw err;
    throw new HermesClientError(
      "HERMES_CLIENT_API_FAILED",
      err instanceof Error ? err.message : "Hermes Client request failed",
    );
  }
}

export async function hermesClientFetchRaw(
  url: string,
  options: { method?: string; accept?: string } = {},
): Promise<{ contentType: string; buffer: Buffer; text?: string }> {
  const token = getMcpAccessToken();
  if (!token) {
    throw new HermesClientError("HERMES_CLIENT_NOT_AUTHENTICATED", "Desktop login required");
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Accept: options.accept ?? "*/*",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (res.status === 401) {
    throw new HermesClientError(
      "HERMES_CLIENT_NOT_AUTHENTICATED",
      "Session expired or unauthorized",
    );
  }

  if (!res.ok) {
    throw new HermesClientError(
      "HERMES_CLIENT_API_FAILED",
      `Request failed: HTTP ${res.status}`,
    );
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const isText =
    contentType.includes("text/") ||
    contentType.includes("json") ||
    contentType.includes("markdown");
  return {
    contentType,
    buffer,
    text: isText ? buffer.toString("utf-8") : undefined,
  };
}

export function buildHermesClientUrl(path: string, query?: Record<string, string | undefined>): string {
  const backendBaseUrl = requireBackendBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(joinUrl(backendBaseUrl, normalizedPath));
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}
