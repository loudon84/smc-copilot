import type { GeneHubDescriptor } from "../../shared/genehub/genehub-contract";
import type { GeneHubErrorCode } from "../../shared/genehub/genehub-errors";
import { resolveBackendBaseUrl } from "../mcp-skill-gateway-runtime/mcp-skill-gateway-config";
import { joinUrl } from "./genehub-url";

export type GeneHubDescriptorErrorCode =
  | "GENEHUB_BACKEND_URL_MISSING"
  | "GENEHUB_DESCRIPTOR_MISSING"
  | "GENEHUB_BACKEND_UNREACHABLE";

export interface GeneHubDescriptorResult {
  ok: boolean;
  descriptor?: GeneHubDescriptor;
  error?: {
    code: GeneHubDescriptorErrorCode;
    message: string;
  };
}

interface SystemInfoGeneHubBlock {
  enabled?: boolean;
  name?: string;
  apiPrefix?: string;
  healthEndpoint?: string;
  requiresAuth?: boolean;
  minServerVersion?: string;
}

const DEFAULT_API_PREFIX = "/api/v1/desktop";
const DEFAULT_HEALTH_ENDPOINT = "/api/v1/desktop/genehub/health";

let cachedDescriptor: GeneHubDescriptor | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateGeneHubDescriptorCache(): void {
  cachedDescriptor = null;
  cachedAt = 0;
}

export async function fetchGeneHubDescriptor(
  forceRefresh = false,
): Promise<GeneHubDescriptorResult> {
  const backendBaseUrl = resolveBackendBaseUrl();
  if (!backendBaseUrl) {
    return {
      ok: false,
      error: {
        code: "GENEHUB_BACKEND_URL_MISSING",
        message: "Backend URL is not configured",
      },
    };
  }

  if (
    !forceRefresh &&
    cachedDescriptor &&
    cachedDescriptor.backendBaseUrl === backendBaseUrl &&
    Date.now() - cachedAt < CACHE_TTL_MS
  ) {
    return { ok: true, descriptor: cachedDescriptor };
  }

  const infoUrl = joinUrl(backendBaseUrl, "/api/v1/system/info");

  try {
    const res = await fetch(infoUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: "GENEHUB_BACKEND_UNREACHABLE",
          message: `system/info failed: HTTP ${res.status}`,
        },
      };
    }

    const body = (await res.json()) as { genehub?: SystemInfoGeneHubBlock };
    const genehub = body.genehub;
    if (!genehub) {
      return {
        ok: false,
        error: {
          code: "GENEHUB_DESCRIPTOR_MISSING",
          message:
            "GeneHub descriptor missing. Please update nodeskclaw backend to team_v3.4.1 or later.",
        },
      };
    }

    const apiPrefix = genehub.apiPrefix?.trim() || DEFAULT_API_PREFIX;
    const descriptor: GeneHubDescriptor = {
      enabled: genehub.enabled ?? true,
      name: genehub.name?.trim() || "GeneHub Registry",
      apiPrefix,
      healthEndpoint: genehub.healthEndpoint?.trim() || DEFAULT_HEALTH_ENDPOINT,
      requiresAuth: genehub.requiresAuth ?? true,
      minServerVersion: genehub.minServerVersion?.trim(),
      apiBaseUrl: joinUrl(backendBaseUrl, apiPrefix),
      backendBaseUrl,
    };

    cachedDescriptor = descriptor;
    cachedAt = Date.now();
    return { ok: true, descriptor };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "GENEHUB_BACKEND_UNREACHABLE",
        message: err instanceof Error ? err.message : "Failed to reach backend",
      },
    };
  }
}

export function mapDescriptorErrorToGeneHubCode(
  code: GeneHubDescriptorErrorCode,
): GeneHubErrorCode {
  if (code === "GENEHUB_BACKEND_URL_MISSING") return "GENEHUB_BACKEND_URL_MISSING";
  if (code === "GENEHUB_DESCRIPTOR_MISSING") return "GENEHUB_DESCRIPTOR_MISSING";
  return "GENEHUB_BACKEND_UNREACHABLE";
}
