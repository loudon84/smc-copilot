export type ChatModelOption = {
  id: string;
  label: string;
  provider?: string | null;
  model: string;
  baseUrl?: string | null;
  isCurrent?: boolean;
};

/** Port for listing / selecting session-level model override. */
export interface ChatModelsPort {
  listModels(profileId?: string): Promise<ChatModelOption[]>;
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
