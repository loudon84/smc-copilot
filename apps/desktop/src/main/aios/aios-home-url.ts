import { readAuthEndpointConfig } from "../auth/auth-endpoint-config-store";
import {
  readBootstrapState,
  readLocalBootstrapConfig,
} from "../user-config/user-config-store";
import { getDefaultAuthEndpointConfig } from "../../shared/auth/auth-url";

/**
 * Resolve Portal Home URL for WebContentsView load.
 * Priority: login endpoint config (auth-endpoint-config.json) → applied bootstrap cache → default.
 * Endpoint must win before bootstrap re-apply so a new login URL is not masked by stale bootstrap-config.json.
 */
export function resolveAiosHomeUrl(): string {
  const endpoint = readAuthEndpointConfig();
  if (endpoint?.aiosHomeUrl) {
    return endpoint.aiosHomeUrl;
  }

  const local = readLocalBootstrapConfig();
  if (local?.aios.aiosHomeUrl) {
    return local.aios.aiosHomeUrl;
  }
  if (local?.aios.frontendUrl) {
    return local.aios.frontendUrl;
  }

  return getDefaultAuthEndpointConfig().aiosHomeUrl;
}

export function resolveAiosBackendUrl(): string {
  const endpoint = readAuthEndpointConfig();
  const bootstrap = readBootstrapState();
  const local = readLocalBootstrapConfig();

  // Before bootstrap completes, always use the endpoint saved at login time.
  if (!bootstrap.initialized && endpoint?.backendUrl) {
    return endpoint.backendUrl;
  }

  if (local?.aios.backendUrl) {
    return local.aios.backendUrl;
  }
  if (endpoint?.backendUrl) {
    return endpoint.backendUrl;
  }
  return getDefaultAuthEndpointConfig().backendUrl;
}

/** Remote Portal backend health probe URL (Desktop does not spawn backend locally). */
export function resolveAiosBackendHealthUrl(): string {
  const base = resolveAiosBackendUrl().replace(/\/+$/, "");
  return `${base}/health`;
}

export function parseBackendPortFromUrl(backendUrl: string, fallback = 8000): number {
  try {
    const parsed = new URL(backendUrl);
    if (parsed.port) return Number(parsed.port);
    return parsed.protocol === "https:" ? 443 : 80;
  } catch {
    const match = backendUrl.match(/:(\d+)/);
    return match ? Number(match[1]) : fallback;
  }
}
