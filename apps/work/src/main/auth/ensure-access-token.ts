/**
 * Access-token freshness for NoDeskClaw User JWT.
 * Login persists expiresAt + refresh_token; callers must refresh before use
 * and after a backend Authentication-expired response.
 */

import type { StoredAuthSession } from "../../shared/auth/auth-contract";
import { getAuthClient } from "./auth-client";
import {
  getDefaultAuthEndpointConfig,
  readAuthEndpointConfig,
} from "./auth-endpoint-config-store";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./token-store";

/** Refresh this far before expiresAt to absorb clock skew and request RTT. */
export const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

export class AccessTokenError extends Error {
  readonly errorCode: string;

  constructor(message: string, errorCode = "AUTHENTICATION_EXPIRED") {
    super(message);
    this.name = "AccessTokenError";
    this.errorCode = errorCode;
  }
}

let refreshInFlight: Promise<string> | null = null;

export function isAccessTokenExpired(
  expiresAt: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs <= nowMs + ACCESS_TOKEN_REFRESH_SKEW_MS;
}

export function isAuthExpiredMessage(message: string): boolean {
  return /authentication expired|token expired|expired token|invalid authorization|missing or invalid authorization/i.test(
    message,
  );
}

function sessionAccessToken(session: StoredAuthSession | null): string {
  const token = session?.accessToken?.trim();
  if (!token) {
    throw new AccessTokenError("Not authenticated", "UNAUTHORIZED");
  }
  return token;
}

async function performRefresh(): Promise<string> {
  const endpointConfig =
    readAuthEndpointConfig() ?? getDefaultAuthEndpointConfig();
  const session = await readStoredSession();
  if (!session?.refreshToken) {
    await clearStoredSession();
    throw new AccessTokenError("Authentication expired", "AUTHENTICATION_EXPIRED");
  }
  try {
    const refreshed = await getAuthClient().refresh(
      endpointConfig,
      session.refreshToken,
    );
    await writeStoredSession(refreshed);
    return sessionAccessToken(refreshed);
  } catch (err) {
    await clearStoredSession();
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Authentication expired";
    throw new AccessTokenError(message, "AUTHENTICATION_EXPIRED");
  }
}

/** Force a refresh_token rotation. Concurrent callers share one in-flight request. */
export async function refreshStoredAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = performRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Hydrate session, refresh when expiresAt is due, then return a usable access token. */
export async function ensureFreshAccessToken(): Promise<string> {
  const session = await readStoredSession();
  const token = sessionAccessToken(session);
  if (!isAccessTokenExpired(session?.expiresAt)) {
    return token;
  }
  return refreshStoredAccessToken();
}
