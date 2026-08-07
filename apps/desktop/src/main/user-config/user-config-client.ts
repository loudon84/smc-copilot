import { randomBytes } from "crypto";
import { readAuthEndpointConfig } from "../auth/auth-endpoint-config-store";
import { readStoredSession } from "../auth/token-store";
import { resolveAiosBackendUrl } from "../aios/aios-home-url";
import type { StoredAuthSession } from "../../shared/auth/auth-contract";
import type { DesktopBootstrapConfig } from "../../shared/user-config/user-config-contract";
import { normalizeBootstrapConfig } from "../../shared/user-config/user-config-normalize";
import {
  buildDesktopApiUrl,
  getDefaultAuthEndpointConfig,
} from "../../shared/auth/auth-url";
import { readBootstrapState } from "./user-config-store";

let mockLoginCount = 0;

function useMockUserConfig(): boolean {
  if (process.env.HERMES_USE_MOCK_USER_CONFIG === "false") {
    return false;
  }
  if (process.env.HERMES_USE_MOCK_USER_CONFIG === "true") {
    return true;
  }
  return false;
}

/** Opt-in when Portal backend implements GET /api/v1/desktop/bootstrap */
function useRemoteUserConfig(): boolean {
  return process.env.HERMES_USE_REMOTE_USER_CONFIG === "true";
}

function buildMockConfig(versionSuffix: string): DesktopBootstrapConfig {
  const endpoint = readAuthEndpointConfig() ?? getDefaultAuthEndpointConfig();
  return normalizeBootstrapConfig({
    schemaVersion: 2,
    configVersion: `mock-v2-${versionSuffix}`,
    configHash: `mock-hash-${versionSuffix}`,
    user: {
      userId: "mock-user-1",
      username: "mock",
      displayName: "Mock User",
      tenantId: "default-tenant",
    },
    features: {
      aiosHome: true,
      aiosWorkspace: true,
      webOperator: true,
      office: true,
      hermesRuntimeDrawer: true,
    },
    hermes: {
      activeProfile: "default",
      connection: { mode: "local" },
      profiles: [
        {
          name: "default",
          enabled: true,
          env: { OPENAI_API_KEY: "mock-key-placeholder" },
        },
      ],
      models: [
        {
          name: "default",
          provider: "openai",
          model: "gpt-4o-mini",
          baseUrl: "https://api.openai.com/v1",
        },
      ],
      toolsets: {},
      platforms: {},
    },
    aios: {
      backendUrl: endpoint.backendUrl,
      authPrefix: endpoint.authPrefix,
      aiosHomeUrl: endpoint.aiosHomeUrl,
      frontendUrl: endpoint.aiosHomeUrl,
      autoStart: true,
    },
  });
}

function buildLocalBootstrapConfig(session: StoredAuthSession): DesktopBootstrapConfig {
  const endpoint = readAuthEndpointConfig() ?? getDefaultAuthEndpointConfig();
  return normalizeBootstrapConfig({
    schemaVersion: 2,
    configVersion: "local-v1",
    configHash: `local-${session.user.id}`,
    user: {
      userId: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName ?? session.user.username,
      tenantId: session.user.tenantId ?? "default-tenant",
    },
    features: {
      aiosHome: true,
      aiosWorkspace: true,
      webOperator: true,
      office: true,
      hermesRuntimeDrawer: true,
    },
    hermes: {
      activeProfile: "default",
      connection: { mode: "local" },
      profiles: [{ name: "default", enabled: true }],
      models: [],
    },
    aios: {
      backendUrl: endpoint.backendUrl,
      authPrefix: endpoint.authPrefix,
      aiosHomeUrl: endpoint.aiosHomeUrl,
      frontendUrl: endpoint.aiosHomeUrl,
      autoStart: true,
    },
  });
}

function formatRemoteBootstrapError(status: number, backendUrl: string, text: string): string {
  if (status === 404) {
    return (
      `Bootstrap API not found (404) at ${backendUrl}/api/v1/desktop/bootstrap. ` +
      "Remote bootstrap is disabled by default; set HERMES_USE_REMOTE_USER_CONFIG=true only after the backend implements this route."
    );
  }
  if (status === 401) {
    return "Bootstrap fetch unauthorized — session token missing or expired. Please sign in again.";
  }
  if (text) {
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) return `Bootstrap fetch failed: ${parsed.message}`;
    } catch {
      /* ignore */
    }
  }
  return `Bootstrap fetch failed: ${status}`;
}

async function fetchRemoteBootstrapFromBackend(
  accessToken?: string,
): Promise<DesktopBootstrapConfig> {
  const backendUrl = resolveAiosBackendUrl();
  const url = buildDesktopApiUrl(backendUrl, "bootstrap");
  const res = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatRemoteBootstrapError(res.status, backendUrl, text));
  }

  const raw = (await res.json()) as DesktopBootstrapConfig;
  return normalizeBootstrapConfig(raw);
}

async function resolveAuthenticatedSession(
  accessToken?: string,
): Promise<StoredAuthSession> {
  const session = await readStoredSession();
  if (session) return session;
  if (accessToken) {
    throw new Error("Bootstrap requires a hydrated auth session");
  }
  throw new Error("Bootstrap requires an authenticated session");
}

/**
 * Resolves desktop bootstrap config.
 * Default: local config from login session + endpoint (no remote HTTP).
 * Remote GET /api/v1/desktop/bootstrap only when HERMES_USE_REMOTE_USER_CONFIG=true.
 */
export async function fetchRemoteBootstrapConfig(
  accessToken?: string,
): Promise<DesktopBootstrapConfig> {
  if (useMockUserConfig()) {
    mockLoginCount += 1;
    const state = readBootstrapState();
    const suffix = state.initialized ? String(mockLoginCount) : "initial";
    return buildMockConfig(suffix);
  }

  if (useRemoteUserConfig()) {
    return fetchRemoteBootstrapFromBackend(accessToken);
  }

  const session = await resolveAuthenticatedSession(accessToken);
  return buildLocalBootstrapConfig(session);
}

const pendingApply = new Map<string, DesktopBootstrapConfig>();

export function stashPendingConfig(config: DesktopBootstrapConfig): string {
  const token = randomBytes(16).toString("hex");
  pendingApply.set(token, normalizeBootstrapConfig(config));
  return token;
}

export function takePendingConfig(token: string): DesktopBootstrapConfig | null {
  const config = pendingApply.get(token) ?? null;
  pendingApply.delete(token);
  return config;
}
