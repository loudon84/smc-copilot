import { useCallback, useEffect, useMemo, useState } from "react";
import { PROVIDERS } from "../../../../../constants";
import type { ChatModel, ProfileChatModelConfig } from "../../../../../../../shared/workspace-chat/workspace-chat-contract";

export type ModelGroup = {
  provider: string;
  providerLabel: string;
  models: Array<{
    id: string;
    label: string;
    provider: string | null;
    base_url: string | null;
  }>;
};

function groupModels(models: ChatModel[]): ModelGroup[] {
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
    });
  }
  return Array.from(map.values());
}

export function useChatModels(profileId: string | null, gatewayReady: boolean): {
  models: ChatModel[];
  modelGroups: ModelGroup[];
  config: ProfileChatModelConfig | null;
  displayModel: string;
  status: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  pendingModel: ChatModel | null;
  selectModel: (model: ChatModel) => Promise<void>;
  saveAsDefault: () => Promise<void>;
} {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [config, setConfig] = useState<ProfileChatModelConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingModel, setPendingModel] = useState<ChatModel | null>(null);

  const reload = useCallback(async () => {
    if (!profileId) {
      setModels([]);
      setConfig(null);
      return;
    }
    setLoading(true);
    try {
      const [list, cfg] = await Promise.all([
        window.workspaceChat.listModels(profileId),
        window.workspaceChat.getModelConfig(profileId),
      ]);
      setModels(list.models);
      setStatus(list.status ?? null);
      setConfig(cfg);
      const current = list.models.find((m) => m.is_current);
      if (current) setPendingModel(current);
    } catch {
      setModels([]);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void reload();
  }, [reload, gatewayReady]);

  const selectModel = useCallback(async (model: ChatModel) => {
    setPendingModel(model);
  }, []);

  const saveAsDefault = useCallback(async () => {
    if (!profileId || !pendingModel) return;
    const saved = await window.workspaceChat.setModelConfig(profileId, {
      provider: pendingModel.provider ?? "auto",
      model_id: pendingModel.id,
      model_label: pendingModel.label,
      base_url: pendingModel.base_url ?? null,
    });
    setConfig(saved);
    await reload();
  }, [profileId, pendingModel, reload]);

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
    saveAsDefault,
  };
}
