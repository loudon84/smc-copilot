import { runtimeFetch } from "../runtime-http-client";
import type { ServeModelConfigView, ServeModelOption } from "../../../shared/copilot-runtime/instance-contract";
import { asRecord, pickString } from "../../../shared/copilot-runtime/instance-contract";

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

function mapOptions(raw: unknown): ServeModelOption[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(asRecord(raw).options)
      ? (asRecord(raw).options as unknown[])
      : Array.isArray(asRecord(raw).items)
        ? (asRecord(raw).items as unknown[])
        : [];
  return list.map((item) => {
    const obj = asRecord(item);
    const id = pickString(obj, "id", "modelId", "model_id", "name") ?? "";
    return {
      id,
      label: pickString(obj, "label", "displayName", "display_name", "name") ?? id,
      provider: pickString(obj, "provider", "providerId", "provider_id"),
    };
  }).filter((o) => o.id);
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

  listModelOptions: async (instanceId: string): Promise<ServeModelOption[]> => {
    const raw = await runtimeFetch({
      path: `/api/v1/instances/${encodeId(instanceId)}/chat/model-options`,
    });
    return mapOptions(raw);
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
