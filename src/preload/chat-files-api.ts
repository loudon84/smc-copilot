/**
 * Preload API — window.chatFiles (v8.0).
 * Thin bridge over chat-files:* IPC; does not extend hermesAPI.files.
 */

import { ipcRenderer, webUtils } from "electron";
import {
  CHAT_FILES_CHANNELS,
  type ChatFilesListed,
} from "../shared/chat-files/chat-files-ipc-channels";

export type { ChatFilesListed };

export const chatFilesApi = {
  listSessionFiles(
    profile: string | undefined,
    sessionId: string,
  ): Promise<ChatFilesListed[]> {
    return ipcRenderer.invoke(
      CHAT_FILES_CHANNELS.listSessionFiles,
      profile,
      sessionId,
    );
  },

  uploadPaths(payload: {
    profile?: string;
    session_id: string;
    file_paths: string[];
  }): Promise<{ files: ChatFilesListed[] }> {
    return ipcRenderer.invoke(CHAT_FILES_CHANNELS.uploadPaths, payload);
  },

  uploadBuffers(payload: {
    profile?: string;
    session_id: string;
    files: Array<{ name: string; mime_type?: string; data: number[] }>;
  }): Promise<{ files: ChatFilesListed[] }> {
    return ipcRenderer.invoke(CHAT_FILES_CHANNELS.uploadBuffers, payload);
  },

  async uploadDropped(
    payload: { profile?: string; session_id: string },
    files: FileList | File[],
  ): Promise<{ files: ChatFilesListed[] }> {
    const list = Array.from(files as ArrayLike<File>);
    if (list.length === 0) return { files: [] };
    const file_paths: string[] = [];
    const buffers: Array<{ name: string; mime_type?: string; data: number[] }> =
      [];
    for (const file of list) {
      try {
        file_paths.push(webUtils.getPathForFile(file));
      } catch {
        const data = await file.arrayBuffer();
        buffers.push({
          name: file.name,
          mime_type: file.type || "application/octet-stream",
          data: Array.from(new Uint8Array(data)),
        });
      }
    }
    const out: ChatFilesListed[] = [];
    if (buffers.length > 0) {
      const r = await chatFilesApi.uploadBuffers({ ...payload, files: buffers });
      out.push(...r.files);
    }
    if (file_paths.length > 0) {
      const r = await chatFilesApi.uploadPaths({ ...payload, file_paths });
      out.push(...r.files);
    }
    return { files: out };
  },

  remove(
    profile: string | undefined,
    fileId: string,
    sessionId?: string,
  ): Promise<{ ok: true }> {
    return ipcRenderer.invoke(
      CHAT_FILES_CHANNELS.remove,
      profile,
      fileId,
      sessionId,
    );
  },

  preview(
    profile: string | undefined,
    fileId: string,
  ): Promise<{ content?: string; name?: string; error?: string }> {
    return ipcRenderer.invoke(CHAT_FILES_CHANNELS.preview, profile, fileId);
  },

  reveal(filePath: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(CHAT_FILES_CHANNELS.reveal, filePath);
  },

  openExternal(filePath: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(CHAT_FILES_CHANNELS.openExternal, filePath);
  },

  saveAs(
    filePath: string,
    suggestedName?: string,
  ): Promise<{ ok: boolean; path?: string }> {
    return ipcRenderer.invoke(
      CHAT_FILES_CHANNELS.saveAs,
      filePath,
      suggestedName,
    );
  },
};

export type ChatFilesAPI = typeof chatFilesApi;
