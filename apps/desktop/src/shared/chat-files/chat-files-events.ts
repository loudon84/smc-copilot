/** v8.0.5 — chat-files change notifications for live Session Files summary. */

export type ChatFilesChangedReason =
  | "uploaded"
  | "removed"
  | "context_added"
  | "context_removed"
  | "agent_output_created"
  | "draft_migrated";

export type ChatFilesChangedEvent = {
  profileId: string;
  sessionId: string;
  reason: ChatFilesChangedReason;
  fileId?: string;
};

export const CHAT_FILES_CHANGED_CHANNEL = "chat-files:changed" as const;
