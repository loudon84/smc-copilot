import type { ChatFilesPort, ChatFileRef } from "../../ports/ChatFilesPort";

function mapListed(f: {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  path?: string;
  category?: ChatFileRef["category"];
}): ChatFileRef {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    path: f.path,
    category: f.category,
  };
}

/** AI-OS adapter: window.chatFiles (+ files:* platform) → ChatFilesPort */
export const aiosFilesAdapter: ChatFilesPort = {
  async listSessionFiles(sessionId, profileId) {
    const files = await window.chatFiles.listSessionFiles(profileId, sessionId);
    return files.map(mapListed);
  },
  async searchSessionFiles(sessionId, query, profileId) {
    const rows = await window.chatFiles.searchSessionFiles({
      profile: profileId,
      sessionId,
      query,
    });
    return rows.map((r) => ({
      id: r.fileId,
      name: r.fileName,
      category: "search" as const,
    }));
  },
  async upload(sessionId, profileId, files) {
    const res = await window.chatFiles.uploadDropped(
      { profile: profileId, session_id: sessionId },
      files,
    );
    return res.files.map(mapListed);
  },
  async remove(fileId, profileId) {
    await window.chatFiles.remove(profileId, fileId);
  },
  async preview(fileId, profileId) {
    try {
      const full = await window.chatFiles.platform.getPreview(profileId, fileId);
      if (full && typeof full === "object" && "error" in full) {
        const err = (full as { error: { message?: string } | string }).error;
        return {
          error:
            typeof err === "string" ? err : err?.message || "preview failed",
        };
      }
      const rec = full as {
        content?: string;
        localUrl?: string;
        title?: string;
      };
      return {
        content: rec.content,
        url: rec.localUrl,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
  async reveal(path) {
    await window.chatFiles.reveal(path);
  },
  async openExternal(path) {
    await window.chatFiles.openExternal(path);
  },
  async saveAs(filePath, suggestedName) {
    const result = await window.chatFiles.saveAs(filePath, suggestedName);
    return !!result.ok;
  },
  async saveManagedFileAs(fileId, suggestedName) {
    const result = await window.chatFiles.saveManagedFileAs(
      fileId,
      suggestedName,
    );
    return !!result.ok;
  },
  async saveLocalPathAs(filePath, suggestedName) {
    const result = await window.chatFiles.saveLocalPathAs(
      filePath,
      suggestedName,
    );
    return !!result.ok;
  },
  async migrateDraft(sessionId, profileId, draftSessionId) {
    const res = await window.chatFiles.migrateDraft({
      profile: profileId,
      draftSessionId,
      sessionId,
    });
    return res.files.map(mapListed);
  },
  async addToContext(sessionId, fileId, profileId) {
    await window.chatFiles.addToSessionContext({
      profile: profileId,
      sessionId,
      fileId,
    });
  },
  async removeFromContext(sessionId, fileId, profileId) {
    await window.chatFiles.removeFromSessionContext({
      profile: profileId,
      sessionId,
      fileId,
    });
  },
};
