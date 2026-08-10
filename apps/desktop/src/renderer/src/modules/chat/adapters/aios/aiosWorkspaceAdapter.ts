import type {
  ChatWorkspacePort,
  WorkspaceEntry,
  WorkspaceFile,
} from "../../ports/ChatWorkspacePort";

/** AI-OS adapter: Runtime Workspace browse + chat-settings contextFolder (PRD v1.6 FR-04/06/07). */
export const aiosWorkspaceAdapter: ChatWorkspacePort = {
  async getContextFolder(sessionId, profileId) {
    if (typeof window.copilotRuntime?.getSessionChatSettings !== "function") {
      return null;
    }
    const settings = await window.copilotRuntime.getSessionChatSettings(
      sessionId,
      profileId,
    );
    return settings?.contextFolder ?? null;
  },
  async setContextFolder(sessionId, path, profileId) {
    if (typeof window.copilotRuntime?.patchSessionChatSettings !== "function") {
      throw new Error("Runtime chat-settings unavailable");
    }
    await window.copilotRuntime.patchSessionChatSettings(
      sessionId,
      { contextFolder: path },
      profileId,
    );
  },
  async listDirectory(sessionId, path, profileId) {
    const res = (await window.copilotRuntime.listSessionWorkspace(
      sessionId,
      path,
      profileId,
    )) as { entries?: Array<Record<string, unknown>> };
    return (res.entries || []).map(
      (e): WorkspaceEntry => ({
        name: String(e.name ?? ""),
        path: String(e.path ?? ""),
        kind: e.kind === "directory" ? "directory" : "file",
        sizeBytes:
          typeof e.sizeBytes === "number"
            ? e.sizeBytes
            : typeof e.size_bytes === "number"
              ? e.size_bytes
              : null,
        modifiedAt:
          (e.modifiedAt as string | undefined) ??
          (e.modified_at as string | undefined) ??
          null,
      }),
    );
  },
  async readFile(sessionId, path, profileId) {
    const res = (await window.copilotRuntime.readSessionWorkspaceFile(
      sessionId,
      path,
      profileId,
    )) as Record<string, unknown>;
    return {
      path: String(res.path ?? path),
      name: String(res.name ?? path.split(/[/\\]/).pop() ?? path),
      content: (res.content as string | null | undefined) ?? null,
      mimeType:
        (res.mimeType as string | undefined) ??
        (res.mime_type as string | undefined) ??
        null,
      sizeBytes:
        typeof res.sizeBytes === "number"
          ? res.sizeBytes
          : typeof res.size_bytes === "number"
            ? res.size_bytes
            : null,
      truncated: Boolean(res.truncated),
    } satisfies WorkspaceFile;
  },
  async getTerminalPath(sessionId, profileId) {
    if (typeof window.copilotRuntime?.sessionWorkspaceTerminalPath !== "function") {
      return null;
    }
    const res = await window.copilotRuntime.sessionWorkspaceTerminalPath(
      sessionId,
      profileId,
    );
    return res?.path ?? null;
  },
};
