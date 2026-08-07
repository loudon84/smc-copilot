import { unwrapNodeDeskClawResponse } from "../auth/nodeskclaw-auth-response";
import { getGeneHubAccessToken } from "./genehub-auth";
import { joinUrl } from "./genehub-url";
import { GeneHubError } from "../../shared/genehub/genehub-errors";
import type { GeneHubDescriptor } from "../../shared/genehub/genehub-contract";

export interface GeneHubHttpOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  requireAuth?: boolean;
}

export async function genehubFetch<T>(
  descriptor: GeneHubDescriptor,
  path: string,
  options: GeneHubHttpOptions = {},
): Promise<T> {
  const token = getGeneHubAccessToken();
  if (options.requireAuth !== false && !token) {
    throw new GeneHubError("GENEHUB_NOT_AUTHENTICATED", "Desktop login required");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const finalUrl = path.startsWith("http")
    ? path
    : joinUrl(descriptor.apiBaseUrl, normalizedPath);

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
      throw new GeneHubError("GENEHUB_NOT_AUTHENTICATED", "Session expired or unauthorized");
    }

    if (!res.ok) {
      const message =
        typeof parsed === "object" &&
        parsed &&
        "message" in parsed &&
        typeof (parsed as { message?: string }).message === "string"
          ? (parsed as { message: string }).message
          : `GeneHub API failed: HTTP ${res.status}`;
      throw new GeneHubError("GENEHUB_API_FAILED", message);
    }

    if (parsed === null || parsed === "") {
      return undefined as T;
    }

    return unwrapNodeDeskClawResponse<T>(parsed);
  } catch (err) {
    if (err instanceof GeneHubError) throw err;
    throw new GeneHubError(
      "GENEHUB_API_FAILED",
      err instanceof Error ? err.message : "GeneHub request failed",
    );
  }
}
