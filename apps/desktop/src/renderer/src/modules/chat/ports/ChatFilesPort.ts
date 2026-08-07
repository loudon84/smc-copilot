export type ChatFileRef = {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  path?: string;
  category?: "attachment" | "context" | "agent_output" | "search";
};

/** Port for session files / attachments / preview. */
export interface ChatFilesPort {
  listSessionFiles?(sessionId: string, profileId?: string): Promise<ChatFileRef[]>;
  searchSessionFiles?(
    sessionId: string,
    query: string,
    profileId?: string,
  ): Promise<ChatFileRef[]>;
  upload?(
    sessionId: string,
    profileId: string,
    files: FileList | File[],
  ): Promise<ChatFileRef[]>;
  remove?(fileId: string, profileId?: string): Promise<void>;
  preview?(
    fileId: string,
    profileId?: string,
  ): Promise<{ content?: string; url?: string; error?: string }>;
  reveal?(path: string): Promise<void>;
  openExternal?(path: string): Promise<void>;
  /** @deprecated Prefer saveManagedFileAs / saveLocalPathAs */
  saveAs?(fileIdOrPath: string, suggestedName?: string): Promise<boolean>;
  saveManagedFileAs?(fileId: string, suggestedName?: string): Promise<boolean>;
  saveLocalPathAs?(filePath: string, suggestedName?: string): Promise<boolean>;
  migrateDraft?(
    sessionId: string,
    profileId?: string,
    draftSessionId?: string,
  ): Promise<ChatFileRef[]>;
  addToContext?(
    sessionId: string,
    fileId: string,
    profileId?: string,
  ): Promise<void>;
  removeFromContext?(
    sessionId: string,
    fileId: string,
    profileId?: string,
  ): Promise<void>;
}
