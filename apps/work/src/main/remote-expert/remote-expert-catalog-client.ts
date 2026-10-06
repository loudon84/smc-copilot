import {
  AuthorizedBackendTransportError,
  createAuthorizedBackendTransport,
} from "../auth/authorized-backend-transport";
import {
  isRemoteExpertCallable,
  RemoteExpertError,
  type RemoteExpertCatalogItem,
  type RemoteExpertCatalogList,
} from "../../shared/remote-expert";

const LIST_PATH = "/api/v1/remote-experts";
const CACHE_TTL_MS = 60_000;

let cache: { at: number; value: RemoteExpertCatalogList } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseCatalogItem(value: unknown): RemoteExpertCatalogItem {
  if (!isRecord(value)) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_CATALOG_INVALID",
      "catalog item is not an object",
    );
  }
  const agentRef = String(value.agent_ref ?? value.agentRef ?? "").trim();
  if (!agentRef) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_CATALOG_INVALID",
      "agent_ref required",
    );
  }
  const displayName = String(value.display_name ?? value.displayName ?? "");
  const status = value.status;
  if (status !== "ready" && status !== "unavailable") {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_CATALOG_INVALID",
      "status invalid",
    );
  }
  if (!isRecord(value.capabilities) || !isRecord(value.capabilities.acp)) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_CATALOG_INVALID",
      "capabilities.acp required",
    );
  }
  const acp = value.capabilities.acp;
  const protocolVersion = Number(
    acp.protocol_version ?? acp.protocolVersion,
  );
  const remoteTransport = Boolean(
    acp.remote_transport ?? acp.remoteTransport,
  );
  if (protocolVersion !== 1) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_CATALOG_INVALID",
      "capabilities.acp.protocol_version must be 1",
    );
  }
  if (typeof value.capabilities.permissions !== "boolean") {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_CATALOG_INVALID",
      "permissions required",
    );
  }
  return {
    agentRef,
    displayName,
    description:
      typeof value.description === "string" ? value.description : null,
    category: typeof value.category === "string" ? value.category : null,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((t): t is string => typeof t === "string")
      : [],
    avatar: typeof value.avatar === "string" ? value.avatar : null,
    status,
    capabilities: {
      acp: { protocolVersion: 1, remoteTransport },
      sessionResume: Boolean(value.capabilities.session_resume),
      attachments: String(value.capabilities.attachments ?? ""),
      artifacts: String(value.capabilities.artifacts ?? ""),
      permissions: value.capabilities.permissions,
    },
  };
}

export function mapCatalogHttpStatus(status: number): never {
  if (status === 401) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_AUTH_REQUIRED",
      "catalog auth required",
    );
  }
  if (status === 403) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_FORBIDDEN",
      "catalog forbidden",
    );
  }
  throw new RemoteExpertError(
    "REMOTE_EXPERT_CATALOG_UNAVAILABLE",
    "catalog unavailable",
  );
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
        throw new RemoteExpertError(
          "REMOTE_EXPERT_CATALOG_INVALID",
          "list items required",
        );
      }
      return { items: body.items.map(parseCatalogItem) };
    });
    cache = { at: Date.now(), value: list };
    return list;
  } catch (err) {
    if (err instanceof AuthorizedBackendTransportError) {
      mapCatalogHttpStatus(err.status);
    }
    throw err;
  }
}

export async function fetchRemoteExpertByRef(
  agentRef: string,
): Promise<RemoteExpertCatalogItem> {
  const transport = createAuthorizedBackendTransport();
  try {
    return await transport.withAuthRetry(async () => {
      const res = await transport.authorizedFetch(
        `${LIST_PATH}/${encodeURIComponent(agentRef)}`,
        { method: "GET" },
      );
      if (res.status === 404) {
        throw new RemoteExpertError(
          "REMOTE_EXPERT_NOT_FOUND",
          "expert not found",
        );
      }
      if (!res.ok) {
        throw new AuthorizedBackendTransportError(`catalog ${res.status}`, {
          status: res.status,
        });
      }
      return parseCatalogItem(await res.json());
    });
  } catch (err) {
    if (err instanceof AuthorizedBackendTransportError) {
      mapCatalogHttpStatus(err.status);
    }
    throw err;
  }
}

export function resetRemoteExpertCatalogCache(): void {
  cache = null;
}

export function requireCallableExpert(
  item: RemoteExpertCatalogItem,
): RemoteExpertCatalogItem {
  if (!isRemoteExpertCallable(item)) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_UNAVAILABLE",
      "selected expert is not callable",
    );
  }
  return item;
}
