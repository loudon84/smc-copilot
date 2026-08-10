import type { ChatFilesPort, ChatFileRef } from "../../ports/ChatFilesPort";

function mapListed(f: {
  id?: string;
  fileId?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  path?: string;
  storagePath?: string;
  workspaceRelativePath?: string;
  category?: ChatFileRef["category"];
  role?: string;
  isContext?: boolean;
}): ChatFileRef {
  const role = f.role;
  let category: ChatFileRef["category"] = f.category;
  if (!category && role) {
    if (role === "context_file" || f.isContext) category = "context";
    else if (role === "agent_output") category = "agent_output";
    else category = "attachment";
  }
  return {
    id: String(f.id ?? f.fileId ?? ""),
    name: String(f.name ?? ""),
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    path: f.path ?? f.storagePath ?? f.workspaceRelativePath,
    category,
  };
}

async function useRuntimeFiles(): Promise<boolean> {
  if (typeof window.copilotRuntime?.listSessionFiles !== "function") return false;
  try {
    if (typeof window.copilotRuntime.isServeChatPreferred === "function") {
      return await window.copilotRuntime.isServeChatPreferred();
    }
  } catch {
    return true;
  }
  return true;
}

/** AI-OS adapter: Runtime Session File API → ChatFilesPort (PRD v1.6 FR-11/12/13). */
export const aiosFilesAdapter: ChatFilesPort = {
  async listSessionFiles(sessionId, profileId) {
    if (await useRuntimeFiles()) {
      const res = await window.copilotRuntime.listSessionFiles(sessionId, profileId);
      return (res.files || []).map((f) => mapListed(f as Parameters<typeof mapListed>[0]));
    }
    const files = await window.chatFiles.listSessionFiles(profileId, sessionId);
    return files.map(mapListed);
  },
  async searchSessionFiles(sessionId, query, profileId) {
    if (await useRuntimeFiles()) {
      const res = await window.copilotRuntime.searchSessionFiles(
        sessionId,
        query,
        profileId,
      );
      return (res.hits || []).map((r) => ({
        id: String((r as { fileId?: string }).fileId ?? ""),
        name: String((r as { name?: string }).name ?? ""),
        category: "search" as const,
      }));
    }
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
    // Upload still uses chatFiles → Main → Runtime Attachment API when Serve preferred.
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
    if (await useRuntimeFiles()) {
      await window.copilotRuntime.addSessionFileContext(sessionId, fileId, profileId);
      return;
    }
    await window.chatFiles.addToSessionContext({
      profile: profileId,
      sessionId,
      fileId,
    });
  },
  async removeFromContext(sessionId, fileId, profileId) {
    if (await useRuntimeFiles()) {
      await window.copilotRuntime.removeSessionFileContext(
        sessionId,
        fileId,
        profileId,
      );
      return;
    }
    await window.chatFiles.removeFromSessionContext({
      profile: profileId,
      sessionId,
      fileId,
    });
  },
};
