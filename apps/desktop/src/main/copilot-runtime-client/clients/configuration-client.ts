import { runtimeFetch } from "../runtime-http-client";
import type { ServeModelConfigView, ServeModelOption } from "../../../shared/copilot-runtime/instance-contract";
import { asRecord, pickString } from "../../../shared/copilot-runtime/instance-contract";

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

function mapModelItem(item: unknown): ServeModelOption | null {
  const obj = asRecord(item);
  const id = pickString(obj, "id", "modelId", "model_id", "name") ?? "";
  if (!id || id === "smc-copilot") return null;
  const available = obj.available;
  const isDefault = obj.isDefault ?? obj.is_default;
  const isCurrent = obj.isCurrent ?? obj.is_current;
  return {
    id,
    label: pickString(obj, "label", "displayName", "display_name", "name") ?? id,
    provider: pickString(obj, "provider", "providerId", "provider_id"),
    baseUrl: pickString(obj, "baseUrl", "base_url"),
    available: typeof available === "boolean" ? available : true,
    isDefault: typeof isDefault === "boolean" ? isDefault : false,
    isCurrent: typeof isCurrent === "boolean" ? isCurrent : false,
    source: pickString(obj, "source"),
  };
}

function mapOptions(raw: unknown): ServeModelOption[] {
  const record = asRecord(raw);
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(record.models)
      ? (record.models as unknown[])
      : Array.isArray(record.options)
        ? (record.options as unknown[])
        : Array.isArray(record.items)
          ? (record.items as unknown[])
          : [];
  return list.map(mapModelItem).filter((o): o is ServeModelOption => o != null);
}

export const configurationClient = {
  get: (instanceId: string) =>
    runtimeFetch({
      path: `/api/v1/instances/${encodeId(instanceId)}/configuration`,
    }),

  patch: (instanceId: string, body: Record<string, unknown>) =>
    runtimeFetch({
      method: "PATCH",
      path: `/api/v1/instances/${encodeId(instanceId)}/configuration`,
      body,
    }),

  validate: (instanceId: string, body?: Record<string, unknown>) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/instances/${encodeId(instanceId)}/configuration/validate`,
      body: body ?? {},
    }),

  apply: (instanceId: string, body?: Record<string, unknown>) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/instances/${encodeId(instanceId)}/configuration/apply`,
      body: body ?? {},
    }),

  reload: (instanceId: string) =>
    runtimeFetch({
      method: "POST",
      path: `/api/v1/instances/${encodeId(instanceId)}/configuration/reload`,
      body: {},
    }),

  /**
   * PRD v1.5.4: prefer `/chat/models` (execution catalog). Fallback to
   * `/chat/model-options` for older Runtimes.
   */
  listModelOptions: async (
    instanceId: string,
    options?: { refresh?: boolean },
  ): Promise<ServeModelOption[]> => {
    const query = options?.refresh ? { refresh: "true" } : undefined;
    try {
      const raw = await runtimeFetch({
        path: `/api/v1/instances/${encodeId(instanceId)}/chat/models`,
        query,
      });
      return mapOptions(raw);
    } catch {
      const raw = await runtimeFetch({
        path: `/api/v1/instances/${encodeId(instanceId)}/chat/model-options`,
        query,
      });
      return mapOptions(raw);
    }
  },

  getModelConfig: async (instanceId: string): Promise<ServeModelConfigView> => {
    const [configRaw, options] = await Promise.all([
      runtimeFetch({
        path: `/api/v1/instances/${encodeId(instanceId)}/chat/model-config`,
      }),
      configurationClient.listModelOptions(instanceId).catch(() => [] as ServeModelOption[]),
    ]);
    const obj = asRecord(configRaw);
    return {
      modelId: pickString(obj, "modelId", "model_id", "model", "id"),
      provider: pickString(obj, "provider", "providerId", "provider_id"),
      modelLabel: pickString(obj, "modelLabel", "model_label", "label"),
      baseUrl: pickString(obj, "baseUrl", "base_url"),
      source: pickString(obj, "source"),
      options,
    };
  },

  setModelConfig: (instanceId: string, body: Record<string, unknown>) =>
    runtimeFetch({
      method: "PUT",
      path: `/api/v1/instances/${encodeId(instanceId)}/chat/model-config`,
      body,
    }),
};
