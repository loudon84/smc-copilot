import type { ChatModelsPort, ChatModelOption } from "../../ports/ChatModelsPort";

/** AI-OS adapter: hermesDefaultChat models → ChatModelsPort */
export const aiosModelsAdapter: ChatModelsPort = {
  async listModels(profileId?: string): Promise<ChatModelOption[]> {
    const res = await window.hermesDefaultChat.listModels(profileId);
    return res.models.map((m) => ({
      id: m.id,
      label: m.label,
      provider: m.provider,
      model: m.model,
      baseUrl: m.base_url,
      isCurrent: m.is_current,
    }));
  },
  async getSessionModel(sessionId, profileId) {
    const binding = await window.hermesDefaultChat.getSessionModel(
      sessionId,
      profileId,
    );
    return binding ? { modelId: binding.modelId } : null;
  },
  async setSessionModel(sessionId, modelId, profileId) {
    await window.hermesDefaultChat.setSessionModel(sessionId, modelId, profileId);
  },
};
