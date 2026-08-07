import type {
  HermesChatSendPayload,
  SetHermesChatModelConfigPayload,
  UploadHermesAttachmentsPayload,
} from "../../../../../shared/hermes-default-chat/hermes-default-chat-contract";
import { HERMES_DEFAULT_PROFILE } from "../constants";

export function createHermesProfileApi(profileId: string = HERMES_DEFAULT_PROFILE) {
  const P = profileId;

  return {
    profile: {
      async getDefaultProfile() {
        const list = await window.hermesAPI.listProfiles();
        return list.find((p) => p.name === P || p.isDefault) ?? list[0] ?? null;
      },
      async listProfilesForDisplay() {
        return window.hermesAPI.listProfiles();
      },
    },

    runtime: {
      async status() {
        if (P === HERMES_DEFAULT_PROFILE) return window.hermesAPI.gatewayStatus();
        return window.profileRuntime.getProfile(P);
      },
      async start() {
        if (P === HERMES_DEFAULT_PROFILE) return window.hermesAPI.startGateway();
        return window.profileRuntime.startProfile(P);
      },
      async stop() {
        if (P === HERMES_DEFAULT_PROFILE) return window.hermesAPI.stopGateway();
        return window.profileRuntime.stopProfile(P);
      },
      async restart() {
        if (P === HERMES_DEFAULT_PROFILE) {
          await window.hermesAPI.stopGateway();
          await new Promise((r) => setTimeout(r, 500));
          return window.hermesAPI.startGateway();
        }
        return window.profileRuntime.restartProfile(P);
      },
      async logs(lines = 200) {
        if (P === HERMES_DEFAULT_PROFILE) {
          const result = await window.hermesAPI.readLogs(undefined, lines);
          return result.content;
        }
        const entries = await window.profileRuntime.getGatewayLogs(P, { limit: lines });
        return entries.map((e) => e.message).join("\n");
      },
      async home() {
        return window.hermesAPI.getHermesHome(P);
      },
      async doctor() {
        return window.hermesAPI.runHermesDoctor();
      },
      async version() {
        return window.hermesAPI.getHermesVersion();
      },
      async getModelConfig() {
        return window.hermesAPI.getModelConfig(P);
      },
    },

    chat: {
      listModels() {
        return window.hermesDefaultChat.listModels(P);
      },
      getModelConfig() {
        return window.hermesDefaultChat.getModelConfig(P);
      },
      setModelConfig(payload: SetHermesChatModelConfigPayload) {
        return window.hermesDefaultChat.setModelConfig(P, payload);
      },
      getSessionModel(sessionId: string) {
        return window.hermesDefaultChat.getSessionModel(sessionId, P);
      },
      setSessionModel(sessionId: string, modelId: string) {
        return window.hermesDefaultChat.setSessionModel(sessionId, modelId, P);
      },
      uploadAttachments(payload: Omit<UploadHermesAttachmentsPayload, "profile">) {
        return window.hermesDefaultChat.uploadAttachments({ ...payload, profile: P });
      },
      uploadDroppedAttachments(
        payload: Omit<UploadHermesAttachmentsPayload, "profile">,
        files: FileList,
      ) {
        return window.hermesDefaultChat.uploadDroppedAttachments({ ...payload, profile: P }, files);
      },
      removeAttachment(workspaceId: string, attachmentId: string) {
        return window.hermesDefaultChat.removeAttachment(workspaceId, attachmentId, P);
      },
      sendMessage(input: Omit<HermesChatSendPayload, "profile">) {
        return window.hermesDefaultChat.sendMessage({
          ...input,
          profile: P,
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
      onUsage(callback: Parameters<typeof window.hermesDefaultChat.onUsage>[0]) {
        return window.hermesDefaultChat.onUsage(callback);
      },
    },

    sessions: {
      list(limit = 50, offset = 0) {
        return window.hermesAPI.listCachedSessions(limit, offset);
      },
      sync() {
        return window.hermesAPI.syncSessionCache();
      },
      search(query: string, limit = 20) {
        return window.hermesAPI.searchSessions(query, limit);
      },
      messages(sessionId: string) {
        return window.hermesAPI.getSessionMessages(sessionId);
      },
      rename(sessionId: string, title: string) {
        return window.hermesAPI.updateSessionTitle(sessionId, title);
      },
    },
  };
}

export type HermesProfileApi = ReturnType<typeof createHermesProfileApi>;
