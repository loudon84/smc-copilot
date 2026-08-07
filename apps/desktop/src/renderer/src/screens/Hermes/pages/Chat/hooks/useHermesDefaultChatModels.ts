import { useCallback, useEffect, useMemo, useState } from "react";
import { PROVIDERS } from "../../../../../constants";
import { HERMES_DRAFT_SESSION_ID } from "../../../constants";
import { hermesDefaultApi } from "../../../api/hermesDefaultApi";
import type {
  HermesChatModel,
  HermesChatModelConfig,
} from "../../../../../../../shared/hermes-default-chat/hermes-default-chat-contract";

export type ModelGroup = {
  provider: string;
  providerLabel: string;
  models: Array<{
    id: string;
    label: string;
    provider: string | null;
    base_url: string | null;
    model: string;
  }>;
};

function groupModels(models: HermesChatModel[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();
  for (const m of models) {
    const provider = m.provider ?? "other";
    if (!map.has(provider)) {
      map.set(provider, {
        provider,
        providerLabel: PROVIDERS.labels[provider] ?? provider,
        models: [],
      });
    }
    map.get(provider)!.models.push({
      id: m.id,
      label: m.label,
      provider: m.provider ?? null,
      base_url: m.base_url ?? null,
      model: m.model,
    });
  }
  return Array.from(map.values());
}

function sessionKey(activeSessionId: string | null): string {
  return activeSessionId?.trim() || HERMES_DRAFT_SESSION_ID;
}

function findModelById(models: HermesChatModel[], id: string): HermesChatModel | null {
  return models.find((m) => m.id === id) ?? null;
}

export function useHermesDefaultChatModels(
  gatewayReady: boolean,
  activeSessionId: string | null,
): {
  models: HermesChatModel[];
  modelGroups: ModelGroup[];
  config: HermesChatModelConfig | null;
  displayModel: string;
  status: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  pendingModel: HermesChatModel | null;
  selectModel: (model: HermesChatModel) => void;
} {
  const [models, setModels] = useState<HermesChatModel[]>([]);
  const [config, setConfig] = useState<HermesChatModelConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingModel, setPendingModel] = useState<HermesChatModel | null>(null);

  const sk = sessionKey(activeSessionId);

  const resolvePendingForSession = useCallback(
    async (list: HermesChatModel[]): Promise<HermesChatModel | null> => {
      const binding = await hermesDefaultApi.chat.getSessionModel(sk);
      if (binding) {
        const match = findModelById(list, binding.modelId);
        if (match) return match;
      }
      return list.find((m) => m.is_current) ?? null;
    },
    [sk],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, cfg] = await Promise.all([
        hermesDefaultApi.chat.listModels(),
        hermesDefaultApi.chat.getModelConfig(),
      ]);
      setModels(list.models);
      setStatus(list.status ?? null);
      setConfig(cfg);
      setPendingModel(await resolvePendingForSession(list.models));
    } catch {
      setModels([]);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }, [resolvePendingForSession]);

  useEffect(() => {
    void reload();
  }, [reload, gatewayReady, sk]);

  const selectModel = useCallback(
    (model: HermesChatModel) => {
      setPendingModel(model);
      void hermesDefaultApi.chat.setSessionModel(sk, model.id);
    },
    [sk],
  );

  const displayModel = useMemo(() => {
    if (pendingModel) return pendingModel.label;
    if (config?.model_label) return config.model_label;
    if (config?.model_id) return config.model_id;
    return "Model";
  }, [pendingModel, config]);

  return {
    models,
    modelGroups: groupModels(models),
    config,
    displayModel,
    status,
    loading,
    pendingModel,
    reload,
    selectModel,
  };
}
