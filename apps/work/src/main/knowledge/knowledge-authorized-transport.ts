/**
 * Work-session Bearer transport scoped to the Knowledge service origin (4530).
 *
 * Auth is the same Portal JWT as LoginScreen:
 *   Login → backendUrl (default http://192.168.102.247:4510) /api/v1/auth/account-login
 *   Main token-store session.accessToken
 *   This transport injects `Authorization: Bearer <same token>`
 *   Knowledge verifies it by calling backend `/api/v1/auth/knowledge-context`
 *
 * Must not reuse the 4510 same-origin *URL* transport. Token reuse is required.
 * Renderer never sees tokens or the Knowledge base URL.
 */

import {
  ensureFreshAccessToken,
  refreshStoredAccessToken,
} from "../auth/ensure-access-token";
import {
  AuthorizedBackendTransportError,
  assertSameOriginAndJoinUrl,
  DEFAULT_FETCH_TIMEOUT_MS,
  isAuthExpiredTransportError,
  requireCachedAccessToken,
  type AuthorizedTransportRequestOptions,
} from "../auth/authorized-backend-transport";
import { resolveKnowledgeServiceUrl } from "./knowledge-service-url";

export type KnowledgeAuthorizedTransport = {
  getBaseUrl(): string;
  joinUrl(pathOrUrl: string): string;
  authorizedFetch(
    pathOrUrl: string,
    init?: AuthorizedTransportRequestOptions,
  ): Promise<Response>;
  withAuthRetry<T>(op: () => Promise<T>): Promise<T>;
};

export interface CreateKnowledgeAuthorizedTransportOptions {
  fetchImpl?: typeof fetch;
  ensureAccessToken?: () => Promise<string | null>;
  refreshAccessToken?: () => Promise<string | null>;
  timeoutMs?: number;
  baseUrl?: string;
}

export function createKnowledgeAuthorizedTransport(
  options: CreateKnowledgeAuthorizedTransportOptions = {},
): KnowledgeAuthorizedTransport {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const ensureAccessToken =
    options.ensureAccessToken ?? ensureFreshAccessToken;
  const refreshAccessToken =
    options.refreshAccessToken ?? refreshStoredAccessToken;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  function baseUrl(): string {
    return options.baseUrl ?? resolveKnowledgeServiceUrl();
  }

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
    const url = assertSameOriginAndJoinUrl(baseUrl(), pathOrUrl);
    const token = (await ensureAccessToken()) || requireCachedAccessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const formDataBody =
      typeof FormData !== "undefined" && init.body instanceof FormData;
    if (!headers.has("Content-Type") && init.body && !formDataBody) {
      headers.set("Content-Type", "application/json");
    }
    if (init.idempotencyKey) {
      headers.set("X-Idempotency-Key", init.idempotencyKey);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), defaultTimeoutMs);
    const onExternalAbort = (): void => {
      controller.abort();
    };
    if (init.signal) {
      if (init.signal.aborted) controller.abort();
      else init.signal.addEventListener("abort", onExternalAbort, { once: true });
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
          "Knowledge transport request timed out or aborted",
          { status: 0, errorCode: "FETCH_ABORTED" },
        );
      }
      throw new AuthorizedBackendTransportError("Knowledge service unreachable", {
        status: 0,
        errorCode: "FETCH_FAILED",
      });
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  return {
    getBaseUrl(): string {
      return baseUrl();
    },
    joinUrl(pathOrUrl: string): string {
      return assertSameOriginAndJoinUrl(baseUrl(), pathOrUrl);
    },
    authorizedFetch,
    withAuthRetry,
  };
}
