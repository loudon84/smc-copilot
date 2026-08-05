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
  upload?(
    sessionId: string,
    profileId: string,
    files: FileList | File[],
  ): Promise<ChatFileRef[]>;
  remove?(fileId: string, profileId?: string): Promise<void>;
  preview?(fileId: string, profileId?: string): Promise<{ content?: string; url?: string }>;
  reveal?(path: string): Promise<void>;
  saveAs?(fileId: string, suggestedName?: string): Promise<boolean>;
}
