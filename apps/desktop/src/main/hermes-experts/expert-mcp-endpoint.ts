/**
 * Expert MCP Gateway endpoint resolver (v1.2.1 hotfix).
 * Independent from Hermes MCP Skill Gateway (/api/v1/hermes/mcp).
 */
import { resolveBackendBaseUrl } from "../mcp-skill-gateway-runtime/mcp-skill-gateway-config";

export const EXPERT_CATALOG_CACHE_VERSION = "v1.2.1_hotfix";

function normalizeBackendBase(): string {
  const backend = resolveBackendBaseUrl();
  return backend ? backend.replace(/\/+$/, "") : "";
}

export function resolveExpertMcpBaseUrl(): string {
  const backend = normalizeBackendBase();
  if (!backend) return "";
  return `${backend}/api/v1/expert`;
}

export function resolveExpertMcpRootUrl(): string {
  const base = resolveExpertMcpBaseUrl();
  return base ? `${base}/mcp` : "";
}

export function resolveExpertMcpSlugUrl(slug: string): string {
  const base = resolveExpertMcpBaseUrl();
  if (!base) return "";
  return `${base}/mcp/${encodeURIComponent(slug.trim())}`;
}

export function resolveExpertHealthUrl(): string {
  const base = resolveExpertMcpBaseUrl();
  return base ? `${base}/health` : "";
}

export function joinExpertMcpPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const backend = normalizeBackendBase();
  if (!backend) return normalized;
  if (normalized.startsWith("/api/v1/expert")) {
    return `${backend}${normalized}`;
  }
  return `${backend}/api/v1/expert${normalized.replace(/^\/api\/v1\/expert/, "")}`;
}
