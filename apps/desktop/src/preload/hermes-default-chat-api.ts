import { ipcRenderer, webUtils } from "electron";
import type {
  HermesChatModelConfig,
  HermesChatModelListResponse,
  HermesChatAttachmentBuffer,
  HermesChatSendPayload,
  HermesChatUsageEvent,
  HermesSessionModelBinding,
  SetHermesChatModelConfigPayload,
  UploadHermesAttachmentBuffersPayload,
  UploadHermesAttachmentsPayload,
  UploadHermesAttachmentsResponse,
} from "../shared/hermes-default-chat/hermes-default-chat-contract";

export const hermesDefaultChatApi = {
  listModels(profile?: string): Promise<HermesChatModelListResponse> {
    return ipcRenderer.invoke("hermes-chat:list-models", profile);
  },

  getModelConfig(profile?: string): Promise<HermesChatModelConfig | null> {
    return ipcRenderer.invoke("hermes-chat:get-model-config", profile);
  },

  setModelConfig(
    profile: string | undefined,
    payload: SetHermesChatModelConfigPayload,
  ): Promise<HermesChatModelConfig> {
    return ipcRenderer.invoke("hermes-chat:set-model-config", profile, payload);
  },

  getSessionModel(
    sessionId: string,
    profile?: string,
  ): Promise<HermesSessionModelBinding | null> {
    return ipcRenderer.invoke("hermes-chat:get-session-model", sessionId, profile);
  },

  setSessionModel(
    sessionId: string,
    modelId: string,
    profile?: string,
  ): Promise<HermesSessionModelBinding> {
    return ipcRenderer.invoke("hermes-chat:set-session-model", sessionId, modelId, profile);
  },

  uploadAttachments(
    payload: UploadHermesAttachmentsPayload,
  ): Promise<UploadHermesAttachmentsResponse> {
    return ipcRenderer.invoke("hermes-chat:upload-attachments", payload);
  },

  uploadAttachmentBuffers(
    payload: UploadHermesAttachmentBuffersPayload,
  ): Promise<UploadHermesAttachmentsResponse> {
    return ipcRenderer.invoke("hermes-chat:upload-attachment-buffers", payload);
  },

  async uploadDroppedAttachments(
    payload: UploadHermesAttachmentsPayload,
    files: FileList,
  ): Promise<UploadHermesAttachmentsResponse> {
    if (files.length === 0) {
      return { attachments: [] };
    }
    const file_paths: string[] = [];
    const buffers: HermesChatAttachmentBuffer[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (!file) continue;
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
    if (buffers.length > 0) {
      const fromBuffers = await ipcRenderer.invoke(
        "hermes-chat:upload-attachment-buffers",
        { ...payload, files: buffers },
      );
      if (file_paths.length === 0) {
        return fromBuffers as UploadHermesAttachmentsResponse;
      }
      const fromPaths = await ipcRenderer.invoke("hermes-chat:upload-attachments", {
        ...payload,
        file_paths,
      });
      return {
        attachments: [
          ...(fromBuffers as UploadHermesAttachmentsResponse).attachments,
          ...(fromPaths as UploadHermesAttachmentsResponse).attachments,
        ],
      };
    }
    return ipcRenderer.invoke("hermes-chat:upload-attachments", {
      ...payload,
      file_paths,
    });
  },

  removeAttachment(
    workspaceId: string,
    attachmentId: string,
    profile?: string,
  ): Promise<{ ok: true }> {
    return ipcRenderer.invoke(
      "hermes-chat:remove-attachment",
      workspaceId,
      attachmentId,
      profile,
    );
  },

  sendMessage(payload: HermesChatSendPayload): Promise<{ response: string; sessionId?: string }> {
    return ipcRenderer.invoke("hermes-chat:send-message", payload);
  },

  onChunk(callback: (chunk: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, chunk: string): void => callback(chunk);
    ipcRenderer.on("chat-chunk", listener);
    return () => ipcRenderer.removeListener("chat-chunk", listener);
  },

  onDone(callback: (sessionId?: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, sessionId?: string): void =>
      callback(sessionId);
    ipcRenderer.on("chat-done", listener);
    return () => ipcRenderer.removeListener("chat-done", listener);
  },

  onToolProgress(callback: (tool: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, tool: string): void => callback(tool);
    ipcRenderer.on("chat-tool-progress", listener);
    return () => ipcRenderer.removeListener("chat-tool-progress", listener);
  },

  onUsage(callback: (usage: HermesChatUsageEvent) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, usage: HermesChatUsageEvent): void =>
      callback(usage);
    ipcRenderer.on("chat-usage", listener);
    return () => ipcRenderer.removeListener("chat-usage", listener);
  },

  onError(callback: (error: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, error: string): void => callback(error);
    ipcRenderer.on("chat-error", listener);
    return () => ipcRenderer.removeListener("chat-error", listener);
  },

  abort(): Promise<void> {
    return ipcRenderer.invoke("abort-chat");
  },

  readContactToOrderLastWebUrl(
    profile?: string,
  ): Promise<{ url: string; path: string } | null> {
    return ipcRenderer.invoke("contact-to-order:read-last-web-url", profile);
  },
};
