import type {
  HermesChatModelConfig,
  HermesChatSendPayload,
  HermesChatUsageEvent,
  UploadHermesAttachmentBuffersPayload,
  UploadHermesAttachmentsPayload,
  UploadHermesAttachmentsResponse,
} from "../../../../../shared/hermes-default-chat/hermes-default-chat-contract";
import { HERMES_PANEL_DEFAULT_PROFILE } from "../constants";

const P = HERMES_PANEL_DEFAULT_PROFILE;

/**
 * Thin wrapper over `window.hermesDefaultChat` for embed panels.
 * Intentionally omits session-model APIs — panels use global default model only.
 */
export const hermesPanelApi = {
  getModelConfig(): Promise<HermesChatModelConfig | null> {
    return window.hermesDefaultChat.getModelConfig(P);
  },

  uploadAttachmentBuffers(
    payload: Omit<UploadHermesAttachmentBuffersPayload, "profile">,
  ): Promise<UploadHermesAttachmentsResponse> {
    return window.hermesDefaultChat.uploadAttachmentBuffers({
      ...payload,
      profile: P,
    });
  },

  uploadAttachments(
    payload: Omit<UploadHermesAttachmentsPayload, "profile">,
  ): Promise<UploadHermesAttachmentsResponse> {
    return window.hermesDefaultChat.uploadAttachments({ ...payload, profile: P });
  },

  uploadDroppedAttachments(
    payload: Omit<UploadHermesAttachmentsPayload, "profile">,
    files: FileList,
  ): Promise<UploadHermesAttachmentsResponse> {
    return window.hermesDefaultChat.uploadDroppedAttachments({ ...payload, profile: P }, files);
  },

  removeAttachment(attachmentId: string): Promise<{ ok: true }> {
    return window.hermesDefaultChat.removeAttachment(P, attachmentId, P);
  },

  /** Never pass `model_id` — global default model via Main overlay. */
  sendMessage(input: Omit<HermesChatSendPayload, "profile" | "model_id">) {
    return window.hermesDefaultChat.sendMessage({
      message: input.message,
      profile: P,
      resumeSessionId: input.resumeSessionId,
      history: input.history,
      attachment_ids: input.attachment_ids,
      attachment_metas: input.attachment_metas,
    });
  },

  abort() {
    return window.hermesDefaultChat.abort();
  },

  onChunk(callback: (chunk: string) => void) {
    return window.hermesDefaultChat.onChunk(callback);
  },

  onDone(callback: (sessionId?: string) => void) {
    return window.hermesDefaultChat.onDone(callback);
  },

  onError(callback: (error: string) => void) {
    return window.hermesDefaultChat.onError(callback);
  },

  onToolProgress(callback: (tool: string) => void) {
    return window.hermesDefaultChat.onToolProgress(callback);
  },

  onUsage(callback: (usage: HermesChatUsageEvent) => void) {
    return window.hermesDefaultChat.onUsage(callback);
  },

  readContactToOrderLastWebUrl(): Promise<{ url: string; path: string } | null> {
    return window.hermesDefaultChat.readContactToOrderLastWebUrl(P);
  },
};
