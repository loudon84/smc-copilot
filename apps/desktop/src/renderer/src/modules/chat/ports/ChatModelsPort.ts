export type ChatModelOption = {
  id: string;
  label: string;
  provider?: string | null;
  model: string;
  baseUrl?: string | null;
  isCurrent?: boolean;
};

/** FR-04 — Provider-grouped model list for ModelPicker. */
export type ChatModelGroup = {
  provider: string;
  providerLabel: string;
  models: ChatModelOption[];
};

/** Port for listing / selecting session-level model override. */
export interface ChatModelsPort {
  listModels(profileId?: string): Promise<ChatModelOption[]>;
  /** Optional grouped view; UI falls back to grouping listModels client-side. */
  listModelGroups?(profileId?: string): Promise<ChatModelGroup[]>;
  getSessionModel?(
    sessionId: string,
    profileId?: string,
  ): Promise<{ modelId: string } | null>;
  setSessionModel?(
    sessionId: string,
    modelId: string,
    profileId?: string,
  ): Promise<void>;
}
