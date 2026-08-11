import type { AuthEndpointConfig } from "./auth-contract";

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Strip accidental API path suffixes from a backend base URL (e.g. /api/v1). */
export function normalizeBackendBaseUrl(url: string): string {
  let value = normalizeBaseUrl(url);
  value = value.replace(/\/api\/v\d+(?:\/auth|\/desktop)?$/i, "");
  value = value.replace(/\/api\/auth$/i, "");
  return value.replace(/\/+$/, "") || url.trim();
}

export function buildDesktopApiUrl(backendUrl: string, path: string): string {
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizeBackendBaseUrl(backendUrl)}/api/v1/desktop/${normalizedPath}`;
}

export function normalizePrefix(prefix: string): string {
  const value = prefix.trim();
  if (!value) return "/api/v1/auth";
  if (!value.startsWith("/")) return `/${value.replace(/\/+$/, "")}`;
  return value.replace(/\/+$/, "") || "/";
}

export type AuthUrlPath =
  | "login"
  | "account-login"
  | "refresh"
  | "me"
  | "logout";

export function buildAuthUrl(config: AuthEndpointConfig, path: AuthUrlPath): string {
  return `${normalizeBaseUrl(config.backendUrl)}${normalizePrefix(config.authPrefix)}/${path}`;
}

export function buildAllowedOrigins(config: AuthEndpointConfig): string[] {
  const origins = new Set<string>();
  origins.add(new URL(config.aiosHomeUrl).origin);
  origins.add(new URL(config.backendUrl).origin);
  return Array.from(origins);
}

export function isAllowedUrl(url: string, allowedOrigins: string[]): boolean {
  try {
    const origin = new URL(url).origin;
    return allowedOrigins.includes(origin);
  } catch {
    return false;
  }
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeEndpointConfig(input: AuthEndpointConfig): AuthEndpointConfig {
  return {
    backendUrl: normalizeBackendBaseUrl(input.backendUrl),
    authPrefix: normalizePrefix(input.authPrefix),
    aiosHomeUrl: normalizeBaseUrl(input.aiosHomeUrl),
  };
}

export function getDefaultAuthEndpointConfig(): AuthEndpointConfig {
  return {
    backendUrl: "http://192.168.0.118:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://192.168.0.118:4517",
  };
}
