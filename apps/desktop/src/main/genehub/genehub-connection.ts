import type { GeneHubConnection, GeneHubConnectionStatus } from "../../shared/genehub/genehub-contract";
import type { GeneHubErrorCode } from "../../shared/genehub/genehub-errors";
import { resolveBackendBaseUrl } from "../mcp-skill-gateway-runtime/mcp-skill-gateway-config";
import {
  fetchGeneHubDescriptor,
  mapDescriptorErrorToGeneHubCode,
} from "./genehub-backend-descriptor";
import { getGeneHubAuthState, getGeneHubAccessToken } from "./genehub-auth";
import { getGeneHubConfig } from "./genehub-config";
import { joinUrl } from "./genehub-url";

let lastSyncAt: string | null = null;
let initialized = false;

export function markGeneHubInitialized(at = new Date().toISOString()): void {
  initialized = true;
  lastSyncAt = at;
}

export function markGeneHubUninitialized(): void {
  initialized = false;
}

export function isGeneHubInitialized(): boolean {
  return initialized;
}

export function getGeneHubLastSyncAt(): string | null {
  return lastSyncAt;
}

async function probeGeneHubHealth(
  healthEndpoint: string,
  backendBaseUrl: string,
  requiresAuth: boolean,
): Promise<{ ok: boolean; detail: string }> {
  const healthUrl = joinUrl(backendBaseUrl, healthEndpoint);
  const token = getGeneHubAccessToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (requiresAuth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      return { ok: true, detail: "ok" };
    }
    if (res.status === 401) {
      return { ok: false, detail: "unauthorized" };
    }
    if (res.status === 403) {
      return { ok: false, detail: "forbidden" };
    }
    return { ok: false, detail: `http_${res.status}` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "unreachable",
    };
  }
}

function formatConnectionLastError(input: {
  loggedIn: boolean;
  descriptorOk: boolean;
  errorCode?: GeneHubErrorCode;
  healthDetail: string;
  rawMessage: string | null;
}): string | null {
  if (!input.loggedIn && input.descriptorOk) {
    return "Desktop login required.";
  }
  if (input.errorCode === "GENEHUB_DESCRIPTOR_MISSING") {
    return "GeneHub descriptor missing. Please update nodeskclaw backend.";
  }
  if (input.healthDetail === "http_404") {
    return "GeneHub health endpoint not found. Please update nodeskclaw backend.";
  }
  return input.rawMessage;
}

function resolveConnectionStatus(input: {
  configEnabled: boolean;
  descriptorEnabled: boolean;
  loggedIn: boolean;
  memberVerified: boolean;
  descriptorOk: boolean;
  healthOk: boolean;
  healthDetail: string;
  backendConfigured: boolean;
}): GeneHubConnectionStatus {
  if (!input.configEnabled || !input.descriptorEnabled) return "disabled";
  if (!input.backendConfigured || !input.descriptorOk) return "misconfigured";
  if (!input.loggedIn) return "unauthorized";
  if (!input.memberVerified) return "forbidden";
  if (input.healthDetail === "unauthorized") return "unauthorized";
  if (input.healthDetail === "forbidden") return "forbidden";
  if (!input.healthOk) return "offline";
  if (!input.descriptorOk) return "degraded";
  return "connected";
}

export async function buildGeneHubConnection(forceRefresh = false): Promise<GeneHubConnection> {
  const config = getGeneHubConfig();
  const auth = getGeneHubAuthState();
  const backendBaseUrl = resolveBackendBaseUrl();

  if (!backendBaseUrl) {
    return {
      ok: false,
      status: "misconfigured",
      enabled: config.enabled,
      loggedIn: auth.authenticated,
      memberVerified: auth.memberVerified,
      backendBaseUrl: "",
      apiBaseUrl: "",
      descriptor: null,
      healthOk: false,
      healthDetail: "missing_backend",
      userDisplayName: auth.userDisplayName,
      lastError: "Backend URL is not configured",
      errorCode: "GENEHUB_BACKEND_URL_MISSING",
      initialized,
      lastSyncAt,
    };
  }

  const descriptorResult = await fetchGeneHubDescriptor(forceRefresh);
  const descriptor = descriptorResult.ok ? descriptorResult.descriptor ?? null : null;

  let healthOk = false;
  let healthDetail = "not_probed";
  if (descriptor) {
    const health = await probeGeneHubHealth(
      descriptor.healthEndpoint,
      backendBaseUrl,
      descriptor.requiresAuth,
    );
    healthOk = health.ok;
    healthDetail = health.detail;
  }

  const status = resolveConnectionStatus({
    configEnabled: config.enabled,
    descriptorEnabled: descriptor?.enabled ?? false,
    loggedIn: auth.authenticated,
    memberVerified: auth.memberVerified,
    descriptorOk: descriptorResult.ok,
    healthOk,
    healthDetail,
    backendConfigured: Boolean(backendBaseUrl),
  });

  const rawLastError = descriptorResult.ok
    ? healthOk
      ? null
      : `GeneHub health check failed: ${healthDetail}`
    : descriptorResult.error?.message ?? "GeneHub descriptor unavailable";

  const errorCode = descriptorResult.error
    ? mapDescriptorErrorToGeneHubCode(descriptorResult.error.code)
    : undefined;

  const lastError = formatConnectionLastError({
    loggedIn: auth.authenticated,
    descriptorOk: descriptorResult.ok,
    errorCode,
    healthDetail,
    rawMessage: rawLastError,
  });

  return {
    ok: status === "connected",
    status,
    enabled: config.enabled && (descriptor?.enabled ?? false),
    loggedIn: auth.authenticated,
    memberVerified: auth.memberVerified,
    backendBaseUrl,
    apiBaseUrl: descriptor?.apiBaseUrl ?? joinUrl(backendBaseUrl, "/api/v1/desktop"),
    descriptor,
    healthOk,
    healthDetail,
    userDisplayName: auth.userDisplayName,
    lastError,
    errorCode,
    initialized,
    lastSyncAt,
  };
}
