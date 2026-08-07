import { runtimeFetch } from "../runtime-http-client";
import type { ServeSecretMeta } from "../../../shared/copilot-runtime/instance-contract";
import { asRecord, pickString } from "../../../shared/copilot-runtime/instance-contract";

function encodePath(...parts: string[]): string {
  return parts.map((p) => encodeURIComponent(p)).join("/");
}

function mapSecret(raw: unknown): ServeSecretMeta {
  const obj = asRecord(raw);
  // Never pass through plaintext value fields even if Serve mistakenly returns them.
  return {
    name: pickString(obj, "name", "id", "key") ?? "",
    configured: Boolean(obj.configured ?? obj.isConfigured ?? pickString(obj, "source")),
    source: pickString(obj, "source"),
    updatedAt: pickString(obj, "updatedAt", "updated_at"),
  };
}

function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = asRecord(raw);
  const items = obj.items ?? obj.secrets ?? obj.data;
  return Array.isArray(items) ? items : [];
}

/** Strip any accidental secret payloads before leaving Main→IPC boundary. */
export function sanitizeSecretMeta(meta: ServeSecretMeta): ServeSecretMeta {
  return {
    name: meta.name,
    configured: meta.configured,
    source: meta.source,
    updatedAt: meta.updatedAt,
  };
}

export const secretsClient = {
  list: async (scope: string): Promise<ServeSecretMeta[]> => {
    const raw = await runtimeFetch({ path: `/api/v1/secrets/${encodePath(scope)}` });
    return unwrapList(raw).map(mapSecret).map(sanitizeSecretMeta).filter((s) => s.name);
  },

  get: async (scope: string, name: string): Promise<ServeSecretMeta> => {
    const raw = await runtimeFetch({
      path: `/api/v1/secrets/${encodePath(scope, name)}`,
    });
    return sanitizeSecretMeta(mapSecret(raw));
  },

  put: async (scope: string, name: string, value: string): Promise<ServeSecretMeta> => {
    const raw = await runtimeFetch({
      method: "PUT",
      path: `/api/v1/secrets/${encodePath(scope, name)}`,
      body: { value },
    });
    return sanitizeSecretMeta(mapSecret(raw));
  },

  delete: (scope: string, name: string) =>
    runtimeFetch({
      method: "DELETE",
      path: `/api/v1/secrets/${encodePath(scope, name)}`,
    }),
};
