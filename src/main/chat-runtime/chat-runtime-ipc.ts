import { ipcMain, Notification, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type {
  ChatAbortInput,
  ChatSubmitInput,
  ChatSubmitResult,
} from "../../shared/chat-runtime/chat-runtime-contract";
import { CHAT_RUNTIME_CHANNELS } from "../../shared/chat-runtime/chat-runtime-contract";
import {
  ChatRuntimeErrorCode,
  chatRuntimeError,
} from "../../shared/chat-runtime/chat-runtime-errors";
import type { HermesChatSendPayload } from "../../shared/hermes-default-chat/hermes-default-chat-contract";
import {
  isRemoteMode,
  sendMessage,
  startGateway,
  isGatewayRunning,
  ensureSshTunnelIfNeeded,
} from "../hermes";
import { getConnectionConfig } from "../config";
import { isSshTunnelHealthy, startSshTunnel } from "../ssh-tunnel";
import {
  sshGatewayStatus,
  sshStartGateway,
  sshReadRemoteApiKey,
} from "../ssh-remote";
import { setSshRemoteApiKey } from "../hermes";
import {
  resolveModelIdForSend,
  resolveModelsPageDefaultSavedModel,
  isWebOperatorPanelDraftSession,
} from "../hermes-default-chat/hermes-default-chat-models";
import {
  getSessionModel,
  setSessionModel,
  HERMES_DRAFT_SESSION_ID,
  migrateSessionModelBinding,
} from "../hermes-default-chat/hermes-session-model-store";
import {
  afterExpertChatComplete,
  beforeExpertChatSend,
  bridgeChatToolProgress,
} from "../hermes-experts/expert-run-bridge";
import { emitChatRuntimeEvent } from "./chat-event-emitter";
import {
  abortRun,
  clearActiveRun,
  getActiveRun,
  setActiveRun,
} from "./chat-runtime-manager";
import {
  finalizeSessionReconcile,
  startSessionReconcile,
  stopAllSessionReconciles,
  stopSessionReconcile,
} from "./chat-session-reconciler";

function toHermesPayload(input: ChatSubmitInput): HermesChatSendPayload {
  return {
    message: input.message,
    profile: input.profileId === "default" ? undefined : input.profileId,
    resumeSessionId: input.sessionId,
    history: input.history,
    attachment_ids: input.attachments?.map((a) => a.id),
    attachment_metas: input.attachments?.map((a) => ({
      id: a.id,
      profile_id: input.profileId,
      session_id: input.sessionId || HERMES_DRAFT_SESSION_ID,
      name: a.name,
      mime_type: a.mime_type || "application/octet-stream",
      size_bytes: a.size_bytes ?? 0,
      storage_path: a.storage_path || "",
      text_preview: a.text_preview ?? null,
    })),
    model_id: input.model?.modelId,
    expert_id: input.expertId,
    team_id: input.teamId,
    expert_run_id: input.expertRunId,
    work_mode: input.workMode as HermesChatSendPayload["work_mode"],
    invocation_source: input.invocationSource,
  };
}

function resolveSendModelId(payload: HermesChatSendPayload): {
  modelId: string | undefined;
  saved: ReturnType<typeof resolveModelIdForSend>;
} {
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
    return {
      modelId: binding.modelId,
      saved: resolveModelIdForSend(binding.modelId, profile),
    };
  }

  return { modelId: undefined, saved: null };
}

function validateSubmit(input: ChatSubmitInput): string | null {
  if (!input?.runId?.trim()) return "runId is required";
  if (!input.profileId?.trim()) return "profileId is required";
  if (!input.message?.trim() && !(input.attachments && input.attachments.length > 0)) {
    return "message or attachments required";
  }
  if (!input.invocationSource) return "invocationSource is required";
  return null;
}

export function registerChatRuntimeIpc(
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.submit,
    async (event: IpcMainInvokeEvent, input: ChatSubmitInput): Promise<ChatSubmitResult> => {
      const invalid = validateSubmit(input);
      if (invalid) {
        return {
          ok: false,
          runId: input?.runId || "",
          errorCode: ChatRuntimeErrorCode.INVALID_INPUT,
          error: invalid,
        };
      }

      const runId = input.runId.trim();
      const payload = toHermesPayload(input);
      const profile = payload.profile;

      const block = await beforeExpertChatSend(payload);
      if (block) {
        emitChatRuntimeEvent(event.sender, {
          type: "failed",
          runId,
          error: chatRuntimeError(ChatRuntimeErrorCode.EXPERT_BLOCKED, block.message),
        });
        return {
          ok: false,
          runId,
          errorCode: block.errorCode || ChatRuntimeErrorCode.EXPERT_BLOCKED,
          error: block.message,
        };
      }

      if (!isRemoteMode() && !isGatewayRunning(profile)) {
        startGateway(profile);
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

      const { modelId, saved } = resolveSendModelId(payload);
      const requestSessionKey =
        payload.resumeSessionId?.trim() || HERMES_DRAFT_SESSION_ID;

      let fullResponse = "";
      let resolvedSessionId: string | undefined;
      const chatStartTime = Date.now();
      let cancelled = false;
      let finished = false;

      let resolveChat: (v: ChatSubmitResult) => void;
      const promise = new Promise<ChatSubmitResult>((res) => {
        resolveChat = res;
      });

      const finishOnce = (result: ChatSubmitResult): void => {
        if (finished) return;
        finished = true;
        stopSessionReconcile(runId);
        clearActiveRun(runId);
        resolveChat(result);
      };

      const finishCompleted = (sessionId?: string): void => {
        finishOnce({
          ok: true,
          runId,
          response: fullResponse,
          sessionId,
        });
      };

      const finishFailed = (code: string, message: string): void => {
        finishOnce({
          ok: false,
          runId,
          errorCode: code,
          error: message,
        });
      };

      const finishCancelled = (): void => {
        emitChatRuntimeEvent(event.sender, { type: "cancelled", runId });
        finishOnce({
          ok: false,
          runId,
          errorCode: ChatRuntimeErrorCode.CANCELLED,
          error: "Run cancelled",
        });
      };

      const ensureReconcile = (sessionId: string): void => {
        startSessionReconcile(runId, sessionId, (payload) => {
          for (const evt of payload.events) {
            emitChatRuntimeEvent(event.sender, { ...evt, runId } as Parameters<
              typeof emitChatRuntimeEvent
            >[1]);
          }
        });
      };

      const emitReconcileDiff = (
        payload: import("./chat-session-reconciler").ChatSessionReconcileDiff,
      ): void => {
        for (const evt of payload.events) {
          emitChatRuntimeEvent(event.sender, { ...evt, runId } as Parameters<
            typeof emitChatRuntimeEvent
          >[1]);
        }
      };

      let chatHandle: { abort: () => void } | null = null;

      const handle = await sendMessage(
        payload.message,
        {
          onChunk: (chunk) => {
            if (finished || cancelled) return;
            fullResponse += chunk;
            if (
              !emitChatRuntimeEvent(event.sender, {
                type: "message.delta",
                runId,
                content: chunk,
              })
            ) {
              cancelled = true;
              chatHandle?.abort();
              finishCancelled();
            }
          },
          onSessionStarted: (sessionId) => {
            if (finished || cancelled || !sessionId) return;
            resolvedSessionId = sessionId;
            migrateSessionModelBinding(requestSessionKey, sessionId, profile);
            emitChatRuntimeEvent(event.sender, {
              type: "session.started",
              runId,
              sessionId,
            });
            ensureReconcile(sessionId);
          },
          onDone: (sessionId) => {
            if (finished) return;
            if (cancelled) {
              finishCancelled();
              return;
            }
            resolvedSessionId = sessionId || resolvedSessionId;
            void afterExpertChatComplete({
              runId: payload.expert_run_id,
              profile,
              response: fullResponse,
              sessionId: resolvedSessionId,
            });
            if (resolvedSessionId) {
              migrateSessionModelBinding(
                requestSessionKey,
                resolvedSessionId,
                profile,
              );
              emitChatRuntimeEvent(event.sender, {
                type: "session.started",
                runId,
                sessionId: resolvedSessionId,
              });
              finalizeSessionReconcile(
                runId,
                resolvedSessionId,
                emitReconcileDiff,
              );
            }
            emitChatRuntimeEvent(event.sender, {
              type: "completed",
              runId,
              sessionId: resolvedSessionId,
            });
            finishCompleted(resolvedSessionId);

            const mainWindow = getMainWindow();
            if (
              mainWindow &&
              !mainWindow.isFocused() &&
              Date.now() - chatStartTime > 10000
            ) {
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
            if (finished) return;
            if (cancelled) {
              finishCancelled();
              return;
            }
            void afterExpertChatComplete({
              runId: payload.expert_run_id,
              profile,
              response: fullResponse,
              error,
            });
            emitChatRuntimeEvent(event.sender, {
              type: "failed",
              runId,
              error: chatRuntimeError(ChatRuntimeErrorCode.SEND_FAILED, error),
            });
            finishFailed(ChatRuntimeErrorCode.SEND_FAILED, error);

            const mainWindow = getMainWindow();
            if (mainWindow && !mainWindow.isFocused()) {
              new Notification({
                title: "Hermes Agent — Error",
                body: error.slice(0, 100),
              }).show();
            }
          },
          onToolProgress: (tool) => {
            if (finished || cancelled) return;
            bridgeChatToolProgress({
              runId: payload.expert_run_id,
              profile,
              expertId: payload.expert_id,
              toolLabel: tool,
            });
            emitChatRuntimeEvent(event.sender, {
              type: "tool.progress",
              runId,
              tool,
            });
          },
          onReasoningDelta: (content) => {
            if (finished || cancelled) return;
            emitChatRuntimeEvent(event.sender, {
              type: "reasoning.delta",
              runId,
              content,
            });
          },
          onToolEvent: (toolEvent) => {
            if (finished || cancelled) return;
            emitChatRuntimeEvent(event.sender, {
              type: "tool.event",
              runId,
              event: toolEvent,
            });
          },
          onClarifyRequested: (request) => {
            if (finished || cancelled) return;
            emitChatRuntimeEvent(event.sender, {
              type: "clarify.requested",
              runId,
              request,
            });
          },
          onApprovalRequested: (request) => {
            if (finished || cancelled) return;
            emitChatRuntimeEvent(event.sender, {
              type: "approval.requested",
              runId,
              request,
            });
          },
          onUsage: (usage) => {
            if (finished || cancelled) return;
            emitChatRuntimeEvent(event.sender, {
              type: "usage",
              runId,
              usage: {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
                cost: usage.cost,
                rateLimitRemaining: usage.rateLimitRemaining,
                rateLimitReset: usage.rateLimitReset,
              },
            });
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

      chatHandle = handle;

      setActiveRun(runId, {
        abort: () => {
          if (finished || cancelled) return;
          cancelled = true;
          try {
            handle.abort();
          } catch {
            /* best effort */
          }
          finishCancelled();
        },
        profileId: input.profileId,
        sessionId: input.sessionId,
        startedAt: Date.now(),
      });

      if (input.sessionId) {
        ensureReconcile(input.sessionId);
      }

      return promise;
    },
  );

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.abort,
    (_event, input: ChatAbortInput | string) => {
      const runId = typeof input === "string" ? input : input?.runId;
      if (!runId?.trim()) {
        abortRun();
        return { ok: true as const };
      }
      const ok = abortRun(runId.trim());
      stopSessionReconcile(runId.trim());
      return { ok };
    },
  );

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.command,
    async (
      _event,
      command: import("../../shared/chat-runtime/chat-runtime-contract").ChatRuntimeCommand,
    ): Promise<
      import("../../shared/chat-runtime/chat-runtime-contract").ChatRuntimeCommandResult
    > => {
      if (!command?.type || !command.runId?.trim() || !command.requestId?.trim()) {
        return { ok: false, error: "Invalid chat-runtime command" };
      }
      // Clarify / approval responses are forwarded as follow-up chat messages
      // when Hermes Gateway supports them; until then acknowledge and emit a
      // synthesised message.delta so UI can continue.
      const run = getActiveRun(command.runId);
      void run;
      return { ok: true as const };
    },
  );
}

export function shutdownChatRuntimeIpc(): void {
  abortRun();
  stopAllSessionReconciles();
}
