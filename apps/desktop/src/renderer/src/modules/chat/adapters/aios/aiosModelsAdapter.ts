import type { ChatModelsPort, ChatModelOption } from "../../ports/ChatModelsPort";

async function useRuntimeCatalog(): Promise<boolean> {
  if (typeof window.copilotRuntime?.listChatModels !== "function") return false;
  try {
    if (typeof window.copilotRuntime.isServeChatPreferred === "function") {
      return await window.copilotRuntime.isServeChatPreferred();
    }
    if (typeof window.copilotRuntime.isServeControlPlane === "function") {
      return await window.copilotRuntime.isServeControlPlane();
    }
  } catch {
    return true;
  }
  return true;
}

function mapRuntimeModels(
  models: Array<{
    id: string;
    label: string;
    provider?: string | null;
    baseUrl?: string | null;
    isCurrent?: boolean;
    isDefault?: boolean;
  }>,
): ChatModelOption[] {
  return models
    .filter((m) => m.id && m.id !== "smc-copilot")
    .map((m) => ({
      id: m.id,
      label: m.label || m.id,
      provider: m.provider,
      model: m.id,
      baseUrl: m.baseUrl ?? null,
      isCurrent: Boolean(m.isCurrent || m.isDefault),
    }));
}

/**
 * AI-OS adapter: Runtime `/chat/models` + session chat-settings (PRD v1.5.4 / v1.6 FR-08).
 */
export const aiosModelsAdapter: ChatModelsPort = {
  async listModels(profileId?: string): Promise<ChatModelOption[]> {
    if (await useRuntimeCatalog()) {
      const models = await window.copilotRuntime.listChatModels({
        profileRef: profileId,
      });
      return mapRuntimeModels(models);
    }
    const res = await window.hermesDefaultChat.listModels(profileId);
    return res.models
      .filter((m) => m.id !== "smc-copilot")
      .map((m) => ({
        id: m.id,
        label: m.label,
        provider: m.provider,
        model: m.model,
        baseUrl: m.base_url,
        isCurrent: m.is_current,
      }));
  },
  async getSessionModel(sessionId, profileId) {
    if (await useRuntimeCatalog()) {
      try {
        if (typeof window.copilotRuntime.getSessionChatSettings === "function") {
          const settings = await window.copilotRuntime.getSessionChatSettings(
            sessionId,
            profileId,
          );
          if (settings?.modelId && settings.modelId !== "smc-copilot") {
            return { modelId: settings.modelId };
          }
        }
      } catch {
        /* ignore */
      }
      return null;
    }
    if (!window.hermesDefaultChat?.getSessionModel) return null;
    const binding = await window.hermesDefaultChat.getSessionModel(
      sessionId,
      profileId,
    );
    return binding ? { modelId: binding.modelId } : null;
  },
  async setSessionModel(sessionId, modelId, profileId) {
    if (modelId === "smc-copilot") return;
    if (await useRuntimeCatalog()) {
      if (typeof window.copilotRuntime.patchSessionChatSettings === "function") {
        await window.copilotRuntime.patchSessionChatSettings(
          sessionId,
          { modelId },
          profileId,
        );
      }
      return;
    }
    if (window.hermesDefaultChat?.setSessionModel) {
      await window.hermesDefaultChat.setSessionModel(sessionId, modelId, profileId);
    }
  },
};
