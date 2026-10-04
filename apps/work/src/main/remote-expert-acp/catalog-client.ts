import {
  AuthorizedBackendTransportError,
  createAuthorizedBackendTransport,
} from "../auth/authorized-backend-transport";
import type { RemoteExpertCatalogItem, RemoteExpertCatalogList } from "../../shared/remote-expert-acp/contract";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";

const LIST_PATH = "/api/v1/remote-experts";
const CACHE_TTL_MS = 60_000;

let cache: { at: number; value: RemoteExpertCatalogList } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseCatalogItem(value: unknown): RemoteExpertCatalogItem {
  if (!isRecord(value)) {
    throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "catalog item is not an object");
  }
  if (typeof value.agent_ref !== "string" || !value.agent_ref.trim()) {
    throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "agent_ref required");
  }
  if (typeof value.display_name !== "string") {
    throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "display_name required");
  }
  if (value.status !== "ready" && value.status !== "unavailable") {
    throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "status invalid");
  }
  if (!isRecord(value.capabilities)) {
    throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "capabilities required");
  }
  if (typeof value.capabilities.acp_protocol_version !== "number") {
    throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "acp_protocol_version required");
  }
  if (typeof value.capabilities.attachments !== "string") {
    throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "attachments required");
  }
  if (typeof value.capabilities.session_resume !== "boolean") {
    throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "session_resume required");
  }
  return {
    agent_ref: value.agent_ref,
    display_name: value.display_name,
    description: (value.description as string | null | undefined) ?? null,
    category: (value.category as string | null | undefined) ?? null,
    tags: Array.isArray(value.tags) ? value.tags.filter((t): t is string => typeof t === "string") : [],
    avatar: (value.avatar as string | null | undefined) ?? null,
    status: value.status,
    capabilities: value.capabilities as RemoteExpertCatalogItem["capabilities"],
  };
}

export function mapCatalogHttpStatus(status: number): never {
  if (status === 401 || status === 403) {
    throw new RemoteExpertError("REMOTE_EXPERT_CATALOG_AUTH", "catalog auth failed");
  }
  throw new RemoteExpertError("REMOTE_EXPERT_CATALOG_UNAVAILABLE", "catalog unavailable");
}

function mapHttpError(err: unknown): never {
  if (err instanceof AuthorizedBackendTransportError) {
    mapCatalogHttpStatus(err.status ?? 500);
  }
  throw err;
}

export async function fetchRemoteExpertCatalog(options?: {
  force?: boolean;
}): Promise<RemoteExpertCatalogList> {
  if (!options?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  const transport = createAuthorizedBackendTransport();
  try {
    const list = await transport.withAuthRetry(async () => {
      const res = await transport.authorizedFetch(LIST_PATH, { method: "GET" });
      if (!res.ok) {
        throw new AuthorizedBackendTransportError(`catalog ${res.status}`, {
          status: res.status,
        });
      }
      const body = (await res.json()) as unknown;
      if (!isRecord(body) || !Array.isArray(body.items)) {
        throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "list items required");
      }
      return { items: body.items.map(parseCatalogItem) };
    });
    cache = { at: Date.now(), value: list };
    return list;
  } catch (err) {
    mapHttpError(err);
  }
}

export function resetRemoteExpertCatalogCache(): void {
  cache = null;
}

export function assertCatalogDtoHasNoSecrets(dto: RemoteExpertCatalogList): void {
  const raw = JSON.stringify(dto);
  if (/authorization|bearer |access_token|refresh_token|https?:\/\//i.test(raw)) {
    throw new RemoteExpertError("REMOTE_EXPERT_SCHEMA_INVALID", "catalog DTO leaked secrets");
  }
}
