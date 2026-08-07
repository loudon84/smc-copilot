/** v8.0 Chat Files IPC channel names. */

export const CHAT_FILES_CHANNELS = {
  listSessionFiles: "chat-files:list-session-files",
  uploadPaths: "chat-files:upload-paths",
  uploadBuffers: "chat-files:upload-buffers",
  remove: "chat-files:remove",
  preview: "chat-files:preview",
  reveal: "chat-files:reveal",
  openExternal: "chat-files:open-external",
  saveAs: "chat-files:save-as",
} as const;

export type ChatFilesListed = {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  path?: string;
  category?: "attachment" | "context" | "agent_output" | "search";
};
