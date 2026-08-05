import type { ChatFilesPort, ChatFileRef } from "../../ports/ChatFilesPort";

/** AI-OS adapter: window.chatFiles → ChatFilesPort */
export const aiosFilesAdapter: ChatFilesPort = {
  async listSessionFiles(sessionId, profileId) {
    const files = await window.chatFiles.listSessionFiles(profileId, sessionId);
    return files as ChatFileRef[];
  },
  async upload(sessionId, profileId, files) {
    const res = await window.chatFiles.uploadDropped(
      { profile: profileId, session_id: sessionId },
      files,
    );
    return res.files as ChatFileRef[];
  },
  async remove(fileId, profileId) {
    await window.chatFiles.remove(profileId, fileId);
  },
  async preview(fileId, profileId) {
    return window.chatFiles.preview(profileId, fileId);
  },
  async reveal(path) {
    await window.chatFiles.reveal(path);
  },
  async saveAs(filePath, suggestedName) {
    const result = await window.chatFiles.saveAs(filePath, suggestedName);
    return !!result.ok;
  },
};
