/**
 * Thin Chat Files IPC (v8.0) — bridges window.chatFiles to existing
 * hermes-default-chat attachment APIs + shell open/reveal.
 * Full File Platform lives in `_upstream/` for progressive enablement.
 */

import { ipcMain, shell, dialog, BrowserWindow } from "electron";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import {
  CHAT_FILES_CHANNELS,
  type ChatFilesListed,
} from "../../shared/chat-files/chat-files-ipc-channels";
import {
  pickAndUploadHermesAttachments,
  uploadHermesAttachmentsFromBuffers,
  removeHermesAttachment,
} from "../hermes-default-chat/hermes-default-chat-attachments";

export { CHAT_FILES_CHANNELS };

/** In-memory session file index for the thin bridge (cleared on app quit). */
const sessionFiles = new Map<string, ChatFilesListed[]>();

function sessionKey(profile: string | undefined, sessionId: string): string {
  return `${profile || "default"}::${sessionId}`;
}

export function registerChatFilesIpc(): void {
  ipcMain.handle(
    CHAT_FILES_CHANNELS.listSessionFiles,
    (_e, profile: string | undefined, sessionId: string) => {
      return sessionFiles.get(sessionKey(profile, sessionId)) || [];
    },
  );

  ipcMain.handle(
    CHAT_FILES_CHANNELS.uploadPaths,
    async (
      _e,
      payload: { profile?: string; session_id: string; file_paths: string[] },
    ) => {
      const res = await pickAndUploadHermesAttachments({
        profile: payload.profile,
        session_id: payload.session_id,
        file_paths: payload.file_paths,
      });
      const key = sessionKey(payload.profile, payload.session_id);
      const listed: ChatFilesListed[] = res.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        path: a.storage_path,
        category: "attachment" as const,
      }));
      sessionFiles.set(key, [...(sessionFiles.get(key) || []), ...listed]);
      return { files: listed };
    },
  );

  ipcMain.handle(
    CHAT_FILES_CHANNELS.uploadBuffers,
    async (
      _e,
      payload: {
        profile?: string;
        session_id: string;
        files: Array<{ name: string; mime_type?: string; data: number[] }>;
      },
    ) => {
      const res = await uploadHermesAttachmentsFromBuffers({
        profile: payload.profile,
        session_id: payload.session_id,
        files: payload.files,
      });
      const key = sessionKey(payload.profile, payload.session_id);
      const listed: ChatFilesListed[] = res.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        path: a.storage_path,
        category: "attachment" as const,
      }));
      sessionFiles.set(key, [...(sessionFiles.get(key) || []), ...listed]);
      return { files: listed };
    },
  );

  ipcMain.handle(
    CHAT_FILES_CHANNELS.remove,
    async (_e, profile: string | undefined, fileId: string, sessionId?: string) => {
      await removeHermesAttachment(profile, fileId);
      if (sessionId) {
        const key = sessionKey(profile, sessionId);
        sessionFiles.set(
          key,
          (sessionFiles.get(key) || []).filter((f) => f.id !== fileId),
        );
      } else {
        for (const [key, list] of sessionFiles) {
          sessionFiles.set(
            key,
            list.filter((f) => f.id !== fileId),
          );
        }
      }
      return { ok: true as const };
    },
  );

  ipcMain.handle(
    CHAT_FILES_CHANNELS.preview,
    (_e, _profile: string | undefined, fileId: string) => {
      for (const list of sessionFiles.values()) {
        const found = list.find((f) => f.id === fileId);
        if (found?.path && existsSync(found.path)) {
          try {
            const content = readFileSync(found.path, "utf8");
            return { content: content.slice(0, 256 * 1024), name: found.name };
          } catch {
            return { error: "Unable to read file" };
          }
        }
      }
      return { error: "File not found" };
    },
  );

  ipcMain.handle(CHAT_FILES_CHANNELS.reveal, async (_e, filePath: string) => {
    if (!filePath || !existsSync(filePath)) return { ok: false };
    shell.showItemInFolder(filePath);
    return { ok: true };
  });

  ipcMain.handle(CHAT_FILES_CHANNELS.openExternal, async (_e, filePath: string) => {
    if (!filePath || !existsSync(filePath)) return { ok: false };
    await shell.openPath(filePath);
    return { ok: true };
  });

  ipcMain.handle(
    CHAT_FILES_CHANNELS.saveAs,
    async (_e, filePath: string, suggestedName?: string) => {
      if (!filePath || !existsSync(filePath)) return { ok: false };
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog({
        defaultPath: suggestedName || basename(filePath),
        ...(win ? { browserWindow: win } : {}),
      } as Electron.SaveDialogOptions);
      if (result.canceled || !result.filePath) return { ok: false };
      const { copyFileSync } = await import("node:fs");
      copyFileSync(filePath, result.filePath);
      return { ok: true, path: result.filePath };
    },
  );
}
