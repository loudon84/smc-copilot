/**
 * Trusted Main-process NoDeskClaw authorized HTTP transport.
 * Centralizes same-origin URL validation, JWT injection, 401/403 single retry,
 * timeout controls, and unified error sanitization.
 * Renderer never sees tokens or backend URLs.
 */

import {
  getDefaultAuthEndpointConfig,
  readAuthEndpointConfig,
} from "./auth-endpoint-config-store";
import {
  ensureFreshAccessToken,
  isAuthExpiredMessage,
  refreshStoredAccessToken,
} from "./ensure-access-token";
import { getCachedAccessToken } from "./token-store";
import { normalizeBackendBaseUrl } from "../../shared/auth/auth-url";

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export class AuthorizedBackendTransportError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  readonly body: unknown;

  constructor(
    message: string,
    options: { status: number; errorCode?: string | null; body?: unknown },
  ) {
    super(message);
    this.name = "AuthorizedBackendTransportError";
    this.status = options.status;
    this.errorCode = options.errorCode ?? null;
    this.body = options.body;
  }
}

export interface AuthorizedTransportRequestOptions extends RequestInit {
  idempotencyKey?: string;
}

export interface AuthorizedBackendTransport {
  getBaseUrl(): string;
  getAccessToken(): string;
  joinUrl(pathOrUrl: string): string;
  authorizedFetch(
    pathOrUrl: string,
    init?: AuthorizedTransportRequestOptions,
  ): Promise<Response>;
  withAuthRetry<T>(op: () => Promise<T>): Promise<T>;
}

export interface CreateAuthorizedBackendTransportOptions {
  fetchImpl?: typeof fetch;
  ensureAccessToken?: () => Promise<string | null>;
  refreshAccessToken?: () => Promise<string | null>;
  timeoutMs?: number;
}

export function resolveBackendBaseUrl(): string {
  const config = readAuthEndpointConfig() ?? getDefaultAuthEndpointConfig();
  return normalizeBackendBaseUrl(config.backendUrl);
}

export function requireCachedAccessToken(): string {
  const token = getCachedAccessToken();
  if (!token) {
    throw new AuthorizedBackendTransportError("Not authenticated", {
      status: 401,
      errorCode: "UNAUTHORIZED",
    });
  }
  return token;
}

export function assertSameOriginAndJoinUrl(base: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const url = new URL(pathOrUrl);
    const baseUrl = new URL(base);
    if (url.origin !== baseUrl.origin) {
      throw new AuthorizedBackendTransportError("Cross-origin URL rejected", {
        status: 400,
        errorCode: "CROSS_ORIGIN_REJECTED",
      });
    }
    return url.toString();
  }
  const normalized = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${normalized}`;
}

export function isAuthExpiredTransportError(err: unknown): boolean {
  if (err instanceof AuthorizedBackendTransportError) {
    if (err.status === 401) return true;
    if (err.errorCode === "UNAUTHORIZED" || err.errorCode === "TOKEN_EXPIRED") {
      return true;
    }
    if (isAuthExpiredMessage(err.message)) return true;
    if (
      err.body &&
      typeof err.body === "object" &&
      "message" in err.body &&
      typeof (err.body as { message?: unknown }).message === "string"
    ) {
      return isAuthExpiredMessage((err.body as { message: string }).message);
    }
  }
  return false;
}

export function createAuthorizedBackendTransport(
  options: CreateAuthorizedBackendTransportOptions = {},
): AuthorizedBackendTransport {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const ensureAccessToken =
    options.ensureAccessToken ?? ensureFreshAccessToken;
  const refreshAccessToken =
    options.refreshAccessToken ?? refreshStoredAccessToken;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  async function withAuthRetry<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (!isAuthExpiredTransportError(err)) throw err;
      await refreshAccessToken();
      return await op();
    }
  }

  async function authorizedFetch(
    pathOrUrl: string,
    init: AuthorizedTransportRequestOptions = {},
  ): Promise<Response> {
    const base = resolveBackendBaseUrl();
    const url = assertSameOriginAndJoinUrl(base, pathOrUrl);
    const token = (await ensureAccessToken()) || requireCachedAccessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    if (init.idempotencyKey) {
      headers.set("X-Idempotency-Key", init.idempotencyKey);
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      defaultTimeoutMs,
    );
    const onExternalAbort = (): void => {
      controller.abort();
    };
    if (init.signal) {
      if (init.signal.aborted) controller.abort();
      else
        init.signal.addEventListener("abort", onExternalAbort, { once: true });
    }
    try {
      return await fetchImpl(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof AuthorizedBackendTransportError) throw err;
      const aborted =
        (err instanceof Error && err.name === "AbortError") ||
        (typeof DOMException !== "undefined" &&
          err instanceof DOMException &&
          err.name === "AbortError");
      if (aborted) {
        throw new AuthorizedBackendTransportError(
          `Backend transport request timed out or aborted (${url})`,
          { status: 0, errorCode: "FETCH_ABORTED" },
        );
      }
      const cause =
        err instanceof Error && "cause" in err && err.cause instanceof Error
          ? err.cause.message
          : "";
      const baseMsg = err instanceof Error ? err.message : String(err);
      throw new AuthorizedBackendTransportError(
        cause
          ? `Backend unreachable (${url}): ${cause}`
          : `Backend unreachable (${url}): ${baseMsg}`,
        { status: 0, errorCode: "FETCH_FAILED" },
      );
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  return {
    getBaseUrl(): string {
      return resolveBackendBaseUrl();
    },
    getAccessToken(): string {
      return requireCachedAccessToken();
    },
    joinUrl(pathOrUrl: string): string {
      return assertSameOriginAndJoinUrl(resolveBackendBaseUrl(), pathOrUrl);
    },
    authorizedFetch,
    withAuthRetry,
  };
}
