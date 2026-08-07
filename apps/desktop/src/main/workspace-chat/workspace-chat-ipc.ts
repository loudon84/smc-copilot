import { randomUUID } from "node:crypto";
import { ipcMain, type BrowserWindow } from "electron";
import type {
  SetProfileChatModelConfigPayload,
  UploadWorkspaceAttachmentBuffersPayload,
  UploadWorkspaceAttachmentsPayload,
  WorkspaceChatSendPayload,
} from "../../shared/workspace-chat/workspace-chat-contract";
import {
  getChatModelConfig,
  listChatModels,
  removeChatAttachment,
  setChatModelConfig,
} from "./workspace-chat-client";
import {
  pickAndUploadAttachments,
  uploadAttachmentsFromBuffers,
} from "./workspace-attachment-staging";
import { resolveWorkspaceProfile } from "./workspace-profile-resolver";
import {
  abortWorkspaceChatStream,
  startWorkspaceChatStream,
} from "./workspace-chat-stream";

export function registerWorkspaceChatIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("workspace-chat:resolve-profile", async (_event, profileRef: string) => {
    return resolveWorkspaceProfile(profileRef);
  });

  ipcMain.handle("workspace-chat:list-models", async (_event, profileId: string) => {
    return listChatModels(profileId);
  });

  ipcMain.handle("workspace-chat:get-model-config", async (_event, profileId: string) => {
    return getChatModelConfig(profileId);
  });

  ipcMain.handle(
    "workspace-chat:set-model-config",
    async (_event, profileId: string, payload: SetProfileChatModelConfigPayload) => {
      return setChatModelConfig(profileId, payload);
    },
  );

  ipcMain.handle(
    "workspace-chat:upload-attachments",
    async (_event, payload: UploadWorkspaceAttachmentsPayload) => {
      return pickAndUploadAttachments(payload);
    },
  );

  ipcMain.handle(
    "workspace-chat:upload-attachment-buffers",
    async (_event, payload: UploadWorkspaceAttachmentBuffersPayload) => {
      return uploadAttachmentsFromBuffers(payload);
    },
  );

  ipcMain.handle(
    "workspace-chat:remove-attachment",
    async (_event, workspaceId: string, attachmentId: string) => {
      await removeChatAttachment(workspaceId, attachmentId);
      return { ok: true as const };
    },
  );

  ipcMain.handle(
    "workspace-chat:send-message",
    async (_event, payload: WorkspaceChatSendPayload) => {
      const win = getWindow();
      if (!win || win.isDestroyed()) {
        throw new Error("主窗口不可用");
      }
      const streamId = payload.stream_id ?? `stream_${randomUUID()}`;
      void startWorkspaceChatStream(win, { ...payload, stream_id: streamId });
      return { stream_id: streamId };
    },
  );

  ipcMain.handle(
    "workspace-chat:abort",
    async (
      _event,
      payload: string | { profile_id: string; session_id?: string },
    ) => {
      if (typeof payload === "string") {
        abortWorkspaceChatStream(payload);
      } else {
        abortWorkspaceChatStream(payload.profile_id, payload.session_id);
      }
      return { ok: true as const };
    },
  );
}
