import { ipcMain, Notification, type BrowserWindow } from "electron";
import type {
  HermesChatSendPayload,
  SetHermesChatModelConfigPayload,
  UploadHermesAttachmentBuffersPayload,
  UploadHermesAttachmentsPayload,
} from "../../shared/hermes-default-chat/hermes-default-chat-contract";
import {
  isRemoteMode,
  sendMessage,
  startGatewayAsync,
  isGatewayRunningAsync,
  ensureSshTunnelIfNeeded,
  restartGatewayAsync,
} from "../hermes";
import { getConnectionConfig, getModelConfig } from "../config";
import {
  isSshTunnelHealthy,
  startSshTunnel,
} from "../ssh-tunnel";
import {
  sshGatewayStatus,
  sshStartGateway,
  sshReadRemoteApiKey,
} from "../ssh-remote";
import { setSshRemoteApiKey } from "../hermes";
import {
  listHermesChatModels,
  getHermesChatModelConfig,
  setHermesChatModelConfig,
  resolveModelIdForSend,
  resolveModelsPageDefaultSavedModel,
  isWebOperatorPanelDraftSession,
} from "./hermes-default-chat-models";
import {
  pickAndUploadHermesAttachments,
  uploadHermesAttachmentsFromBuffers,
  removeHermesAttachment,
} from "./hermes-default-chat-attachments";
import {
  getSessionModel,
  setSessionModel,
  HERMES_DRAFT_SESSION_ID,
  migrateSessionModelBinding,
} from "./hermes-session-model-store";
import {
  afterExpertChatComplete,
  beforeExpertChatSend,
  bridgeChatToolProgress,
} from "../hermes-experts/expert-run-bridge";
import { readContactToOrderLastWebUrl } from "../contact-to-order-web-url";

export type HermesChatAbortRef = {
  current: (() => void) | null;
};

function resolveSendModelId(
  payload: HermesChatSendPayload,
): { modelId: string | undefined; saved: ReturnType<typeof resolveModelIdForSend> } {
  const profile = payload.profile;
  const sessionKey = payload.resumeSessionId?.trim() || HERMES_DRAFT_SESSION_ID;

  if (payload.model_id?.trim()) {
    const saved = resolveModelIdForSend(payload.model_id, profile);
    if (saved && !isWebOperatorPanelDraftSession(sessionKey)) {
      setSessionModel(sessionKey, saved, profile);
    }
    return { modelId: payload.model_id, saved };
  }

  if (isWebOperatorPanelDraftSession(sessionKey)) {
    const globalSaved = resolveModelsPageDefaultSavedModel(profile);
    if (globalSaved) {
      return { modelId: globalSaved.id, saved: globalSaved };
    }
    return { modelId: undefined, saved: null };
  }

  const binding = getSessionModel(sessionKey, profile);
  if (binding) {
    return { modelId: binding.modelId, saved: resolveModelIdForSend(binding.modelId, profile) };
  }

  return { modelId: undefined, saved: null };
}

export function registerHermesDefaultChatIpc(
  getMainWindow: () => BrowserWindow | null,
  chatAbortRef: HermesChatAbortRef,
): void {
  ipcMain.handle("contact-to-order:read-last-web-url", (_event, profile?: string) => {
    return readContactToOrderLastWebUrl(profile);
  });

  ipcMain.handle("hermes-chat:list-models", (_event, profile?: string) => {
    return listHermesChatModels(profile);
  });

  ipcMain.handle("hermes-chat:get-model-config", (_event, profile?: string) => {
    return getHermesChatModelConfig(profile);
  });

  ipcMain.handle(
    "hermes-chat:set-model-config",
    async (_event, profile: string | undefined, payload: SetHermesChatModelConfigPayload) => {
      const {
        isServeConfigPreferred,
        serveSetModelConfig,
        serveGetModelConfig,
        ensureServeConfigReachable,
      } = await import("../runtime-adapters/config-control");
      const { resolveSavedModelById } = await import("../models");

      if (isServeConfigPreferred()) {
        if (!(await ensureServeConfigReachable())) {
          const state = (
            await import("../copilot-runtime-client/runtime-connection-manager")
          ).getRuntimeConnectionState();
          throw new Error(
            `Serve Runtime service is not Ready (state=${state.state}, serviceReady=${String(state.serviceReady)}). ` +
              "Start Runtime (npm run dev:runtime), wait until health is ok, " +
              "or set COPILOT_ALLOW_LEGACY_HERMES_DIRECT=true for local legacy only.",
          );
        }
        // Models page passes models.json UUID; Runtime expects execution model name.
        const saved = resolveSavedModelById(payload.model_id);
        if (!saved) {
          throw new Error(`Model not found: ${payload.model_id}`);
        }
        // Set Hermes default first (PUT model-config writes config.yaml model section).
        // custom_providers sync is best-effort — must not block Set Default.
        await serveSetModelConfig(profile, {
          provider: saved.provider || "custom",
          modelId: saved.model,
          model: saved.model,
          modelLabel: saved.name,
          baseUrl: saved.baseUrl,
        });
        try {
          const { syncCustomProvidersViaRuntime } = await import(
            "../hermes-config/hermes-config-yaml"
          );
          await syncCustomProvidersViaRuntime(profile);
        } catch (syncErr) {
          console.warn(
            "[hermes-chat] custom_providers sync via Runtime failed (default model was still set):",
            syncErr,
          );
        }
        const { invalidateModelConfigCache } = await import("../config");
        invalidateModelConfigCache(profile);
        const view = await serveGetModelConfig(profile);
        return {
          profile_id: profile?.trim() || "default",
          provider: view.provider ?? saved.provider,
          model_id: view.modelId ?? saved.model,
          model_label: view.modelLabel ?? saved.name,
          base_url: view.baseUrl ?? saved.baseUrl ?? null,
          updated_at: new Date().toISOString(),
        };
      }

      const before = getModelConfig(profile);
      const result = setHermesChatModelConfig(profile, payload);
      const after = getModelConfig(profile);
      const changed =
        before.provider !== after.provider ||
        before.model !== after.model ||
        before.baseUrl !== after.baseUrl;

      if (!isRemoteMode() && changed && (await isGatewayRunningAsync(profile))) {
        await restartGatewayAsync(profile);
      }
      return result;
    },
  );

  ipcMain.handle(
    "hermes-chat:get-session-model",
    (_event, sessionId: string, profile?: string) => {
      return getSessionModel(sessionId, profile);
    },
  );

  ipcMain.handle(
    "hermes-chat:set-session-model",
    (_event, sessionId: string, modelId: string, profile?: string) => {
      const saved = resolveModelIdForSend(modelId, profile);
      if (!saved) {
        throw new Error(`Model not found: ${modelId}`);
      }
      return setSessionModel(sessionId, saved, profile);
    },
  );

  ipcMain.handle(
    "hermes-chat:upload-attachments",
    async (_event, payload: UploadHermesAttachmentsPayload) => {
      return pickAndUploadHermesAttachments(payload);
    },
  );

  ipcMain.handle(
    "hermes-chat:upload-attachment-buffers",
    async (_event, payload: UploadHermesAttachmentBuffersPayload) => {
      return uploadHermesAttachmentsFromBuffers(payload);
    },
  );

  ipcMain.handle(
    "hermes-chat:remove-attachment",
    async (_event, _workspaceId: string, attachmentId: string, profile?: string) => {
      await removeHermesAttachment(profile, attachmentId);
      return { ok: true as const };
    },
  );

  ipcMain.handle("hermes-chat:send-message", async (event, payload: HermesChatSendPayload) => {
    const profile = payload.profile;
    const block = await beforeExpertChatSend(payload);
    if (block) {
      event.sender.send("chat-error", block.message);
      return { ok: false as const, errorCode: block.errorCode, error: block.message };
    }

    if (!isRemoteMode() && !(await isGatewayRunningAsync(profile))) {
      await startGatewayAsync(profile);
    }

    await ensureSshTunnelIfNeeded();
    const conn = getConnectionConfig();
    if (conn.mode === "ssh" && conn.ssh) {
      const gatewayRunning = await sshGatewayStatus(conn.ssh);
      const tunnelHealthy = await isSshTunnelHealthy();
      if (!gatewayRunning || !tunnelHealthy) {
        await sshStartGateway(conn.ssh);
        await startSshTunnel(conn.ssh);
        const key = await sshReadRemoteApiKey(conn.ssh);
        setSshRemoteApiKey(key);
      }
    }

    if (chatAbortRef.current) {
      chatAbortRef.current();
    }

    const { modelId, saved } = resolveSendModelId(payload);
    const requestSessionKey = payload.resumeSessionId?.trim() || HERMES_DRAFT_SESSION_ID;

    console.log(
      `[Hermes Chat] IPC send-message model_id=${modelId ?? "(session/default)"} profile=${profile ?? "default"}`,
    );

    let fullResponse = "";
    const chatStartTime = Date.now();
    let resolveChat: (v: { response: string; sessionId?: string }) => void;
    let rejectChat: (reason?: unknown) => void;
    const promise = new Promise<{ response: string; sessionId?: string }>((res, rej) => {
      resolveChat = res;
      rejectChat = rej;
    });

    const handle = await sendMessage(
      payload.message,
      {
        onChunk: (chunk) => {
          fullResponse += chunk;
          event.sender.send("chat-chunk", chunk);
        },
        onDone: (sessionId) => {
          chatAbortRef.current = null;
          void afterExpertChatComplete({
            runId: payload.expert_run_id,
            profile,
            response: fullResponse,
            sessionId: sessionId || undefined,
          });
          if (sessionId) {
            migrateSessionModelBinding(requestSessionKey, sessionId, profile);
          }
          event.sender.send("chat-done", sessionId || "");
          resolveChat({ response: fullResponse, sessionId });
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isFocused() && Date.now() - chatStartTime > 10000) {
            const preview = fullResponse
              .replace(/[#*_`~\n]+/g, " ")
              .trim()
              .slice(0, 80);
            new Notification({
              title: "Hermes Agent",
              body: preview || "Response ready",
            }).show();
          }
        },
        onError: (error) => {
          chatAbortRef.current = null;
          void afterExpertChatComplete({
            runId: payload.expert_run_id,
            profile,
            response: fullResponse,
            error,
          });
          event.sender.send("chat-error", error);
          rejectChat(new Error(error));
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isFocused()) {
            new Notification({
              title: "Hermes Agent — Error",
              body: error.slice(0, 100),
            }).show();
          }
        },
        onToolProgress: (tool) => {
          bridgeChatToolProgress({
            runId: payload.expert_run_id,
            profile,
            expertId: payload.expert_id,
            toolLabel: tool,
          });
          event.sender.send("chat-tool-progress", tool);
        },
        onUsage: (usage) => {
          event.sender.send("chat-usage", usage);
        },
      },
      profile,
      payload.resumeSessionId,
      payload.history,
      {
        attachmentIds: payload.attachment_ids,
        attachmentMetas: payload.attachment_metas,
        modelId,
        sessionId: payload.resumeSessionId,
        selectedModel: saved?.model,
        selectedBaseUrl: saved?.baseUrl,
      },
    );

    chatAbortRef.current = handle.abort;
    return promise;
  });
}
