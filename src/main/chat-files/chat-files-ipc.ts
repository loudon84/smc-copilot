/**
 * Chat Files IPC (v8.0.1) — persistent session index + hermes attachment bridge.
 * Full parser/preview pipeline is productionized under `platform/` (`files:*` IPC).
 */

import { ipcMain, shell, dialog, BrowserWindow } from "electron";
import { readFileSync, existsSync, copyFileSync } from "node:fs";
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
import {
  appendPersistedSessionFiles,
  findPersistedFile,
  listPersistedSessionFiles,
  migratePersistedDraftAttachments,
  removePersistedSessionFile,
} from "./chat-files-session-store";

export { CHAT_FILES_CHANNELS };

const DRAFT_SESSION = "draft";

export function registerChatFilesIpc(): void {
  ipcMain.handle(
    CHAT_FILES_CHANNELS.listSessionFiles,
    (_e, profile: string | undefined, sessionId: string) => {
      return listPersistedSessionFiles(profile, sessionId);
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
      const listed: ChatFilesListed[] = res.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        path: a.storage_path,
        category: "attachment" as const,
      }));
      appendPersistedSessionFiles(payload.profile, payload.session_id, listed);
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
      const listed: ChatFilesListed[] = res.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        path: a.storage_path,
        category: "attachment" as const,
      }));
      appendPersistedSessionFiles(payload.profile, payload.session_id, listed);
      return { files: listed };
    },
  );

  ipcMain.handle(
    CHAT_FILES_CHANNELS.remove,
    async (_e, profile: string | undefined, fileId: string, sessionId?: string) => {
      await removeHermesAttachment(profile, fileId);
      removePersistedSessionFile(profile, fileId, sessionId);
      return { ok: true as const };
    },
  );

  ipcMain.handle(
    CHAT_FILES_CHANNELS.preview,
    (_e, _profile: string | undefined, fileId: string) => {
      const found = findPersistedFile(fileId);
      if (found?.path && existsSync(found.path)) {
        try {
          const content = readFileSync(found.path, "utf8");
          return { content: content.slice(0, 256 * 1024), name: found.name };
        } catch {
          return { error: "Unable to read file" };
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
    async (_e, filePathOrId: string, suggestedName?: string) => {
      const managed = findPersistedFile(filePathOrId);
      const filePath = managed?.path || filePathOrId;
      const name = suggestedName || managed?.name || basename(filePath);
      if (!filePath || !existsSync(filePath)) return { ok: false };
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog({
        defaultPath: name,
        ...(win ? { browserWindow: win } : {}),
      } as Electron.SaveDialogOptions);
      if (result.canceled || !result.filePath) return { ok: false };
      copyFileSync(filePath, result.filePath);
      return { ok: true, path: result.filePath };
    },
  );

  ipcMain.handle(
    "chat-files:migrate-draft",
    (
      _e,
      payload: { profile?: string; draftSessionId?: string; sessionId: string },
    ) => {
      const files = migratePersistedDraftAttachments(
        payload.profile,
        payload.draftSessionId || DRAFT_SESSION,
        payload.sessionId,
      );
      return { files };
    },
  );

  ipcMain.handle(
    "chat-files:save-managed-as",
    async (_e, fileId: string, suggestedName?: string) => {
      const managed = findPersistedFile(fileId);
      if (!managed?.path || !existsSync(managed.path)) {
        return { ok: false };
      }
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog({
        defaultPath: suggestedName || managed.name,
        ...(win ? { browserWindow: win } : {}),
      } as Electron.SaveDialogOptions);
      if (result.canceled || !result.filePath) return { ok: false };
      copyFileSync(managed.path, result.filePath);
      return { ok: true, path: result.filePath };
    },
  );

  ipcMain.handle(
    "chat-files:save-local-path-as",
    async (_e, filePath: string, suggestedName?: string) => {
      if (!filePath || !existsSync(filePath)) return { ok: false };
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog({
        defaultPath: suggestedName || basename(filePath),
        ...(win ? { browserWindow: win } : {}),
      } as Electron.SaveDialogOptions);
      if (result.canceled || !result.filePath) return { ok: false };
      copyFileSync(filePath, result.filePath);
      return { ok: true, path: result.filePath };
    },
  );
}
