import { resolveBackendBaseUrl } from "../mcp-skill-gateway-runtime/mcp-skill-gateway-config";

/** Resolve wiki relative paths like /api/v1/hermes/tasks/{id}/events to absolute backend URLs. */
export function resolveExpertTaskUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const backend = resolveBackendBaseUrl().replace(/\/+$/, "");
  if (!backend) return trimmed;
  return `${backend}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}
