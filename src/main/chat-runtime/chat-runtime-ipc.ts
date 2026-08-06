import { ipcMain, Notification, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type {
  ChatAbortInput,
  ChatSubmitInput,
  ChatSubmitResult,
} from "../../shared/chat-runtime/chat-runtime-contract";
import { CHAT_RUNTIME_CHANNELS } from "../../shared/chat-runtime/chat-runtime-contract";
import { isChatTurnTerminalEventType } from "../../shared/chat-runtime/chat-runtime-events";
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
  createPendingApproval,
  createPendingClarify,
  validatePendingInteraction,
} from "./chat-interaction-registry";
import {
  createHermesChatCommandAdapter,
  HermesChatCommandFailedError,
  HermesChatCommandUnsupportedError,
} from "./hermes-chat-command-adapter";
import {
  finalizeSessionReconcile,
  startSessionReconcile,
  stopAllSessionReconciles,
  stopSessionReconcile,
} from "./chat-session-reconciler";

const hermesCommandAdapter = createHermesChatCommandAdapter();

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
  if (!input?.turnId?.trim()) return "turnId is required";
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
          turnId: input?.turnId || "",
          errorCode: ChatRuntimeErrorCode.INVALID_INPUT,
          error: invalid,
        };
      }

      const runId = input.runId.trim();
      const turnId = input.turnId.trim();
      const payload = toHermesPayload(input);
      const profile = payload.profile;

      /** Drop non-terminal events after the turn has finished. */
      let turnTerminal = false;
      let sessionStartedEmitted = false;

      const emitTurnEvent = (
        evt: Parameters<typeof emitChatRuntimeEvent>[1],
      ): boolean => {
        if (turnTerminal && !isChatTurnTerminalEventType(evt.type)) {
          return true;
        }
        if (isChatTurnTerminalEventType(evt.type)) {
          turnTerminal = true;
        }
        return emitChatRuntimeEvent(event.sender, { ...evt, runId, turnId });
      };

      const emitSessionStartedOnce = (sessionId: string): void => {
        if (sessionStartedEmitted || !sessionId || turnTerminal) return;
        sessionStartedEmitted = true;
        void emitTurnEvent({
          type: "session.started",
          runId,
          turnId,
          sessionId,
        });
      };

      const block = await beforeExpertChatSend(payload);
      if (block) {
        emitTurnEvent({
          type: "failed",
          runId,
          turnId,
          error: chatRuntimeError(ChatRuntimeErrorCode.EXPERT_BLOCKED, block.message),
        });
        return {
          ok: false,
          runId,
          turnId,
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
          turnId,
          response: fullResponse,
          sessionId,
        });
      };

      const finishFailed = (code: string, message: string): void => {
        finishOnce({
          ok: false,
          runId,
          turnId,
          errorCode: code,
          error: message,
        });
      };

      const finishCancelled = (): void => {
        emitTurnEvent({ type: "cancelled", runId, turnId });
        finishOnce({
          ok: false,
          runId,
          turnId,
          errorCode: ChatRuntimeErrorCode.CANCELLED,
          error: "Run cancelled",
        });
      };

      const ensureReconcile = (sessionId: string): void => {
        startSessionReconcile(runId, sessionId, (payload) => {
          for (const evt of payload.events) {
            emitTurnEvent({
              ...evt,
              runId,
              turnId,
            } as Parameters<typeof emitChatRuntimeEvent>[1]);
          }
        });
      };

      const emitReconcileDiff = (
        payload: import("./chat-session-reconciler").ChatSessionReconcileDiff,
      ): void => {
        for (const evt of payload.events) {
          emitTurnEvent({
            ...evt,
            runId,
            turnId,
          } as Parameters<typeof emitChatRuntimeEvent>[1]);
        }
      };

      let chatHandle: { abort: () => void } | null = null;

      // Register before sendMessage so mid-stream clarify/approval can attach pending.
      setActiveRun(runId, {
        abort: () => {
          if (finished || cancelled) return;
          cancelled = true;
          try {
            chatHandle?.abort();
          } catch {
            /* best effort */
          }
          finishCancelled();
        },
        profileId: input.profileId,
        sessionId: input.sessionId,
        turnId,
        startedAt: Date.now(),
        pendingInteractions: new Map(),
        respondClarify: async (requestId, answer) => {
          await hermesCommandAdapter.respondClarify({
            profileId: input.profileId,
            sessionId: resolvedSessionId || input.sessionId,
            requestId,
            answer,
          });
        },
        approve: async (requestId) => {
          await hermesCommandAdapter.approve({
            profileId: input.profileId,
            sessionId: resolvedSessionId || input.sessionId,
            requestId,
          });
        },
        deny: async (requestId, reason) => {
          await hermesCommandAdapter.deny({
            profileId: input.profileId,
            sessionId: resolvedSessionId || input.sessionId,
            requestId,
            reason,
          });
        },
      });

      const handle = await sendMessage(
        payload.message,
        {
          onChunk: (chunk) => {
            if (finished || cancelled) return;
            fullResponse += chunk;
            if (
              !emitTurnEvent({
                type: "message.delta",
                runId,
                turnId,
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
            const run = getActiveRun(runId);
            if (run) run.sessionId = sessionId;
            emitSessionStartedOnce(sessionId);
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
              emitSessionStartedOnce(resolvedSessionId);
              finalizeSessionReconcile(
                runId,
                resolvedSessionId,
                emitReconcileDiff,
              );
            }
            emitTurnEvent({
              type: "completed",
              runId,
              turnId,
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
            emitTurnEvent({
              type: "failed",
              runId,
              turnId,
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
            emitTurnEvent({
              type: "tool.progress",
              runId,
              turnId,
              tool,
            });
          },
          onReasoningDelta: (content) => {
            if (finished || cancelled) return;
            emitTurnEvent({
              type: "reasoning.delta",
              runId,
              turnId,
              content,
            });
          },
          onToolEvent: (toolEvent) => {
            if (finished || cancelled) return;
            emitTurnEvent({
              type: "tool.event",
              runId,
              turnId,
              event: toolEvent,
            });
          },
          onClarifyRequested: (request) => {
            if (finished || cancelled) return;
            const run = getActiveRun(runId);
            if (run) {
              run.pendingInteractions.set(
                request.requestId,
                createPendingClarify(request.requestId, turnId),
              );
            }
            emitTurnEvent({
              type: "clarify.requested",
              runId,
              turnId,
              request,
            });
          },
          onApprovalRequested: (request) => {
            if (finished || cancelled) return;
            const run = getActiveRun(runId);
            if (run) {
              run.pendingInteractions.set(
                request.requestId,
                createPendingApproval(
                  request.requestId,
                  turnId,
                  request.toolName,
                ),
              );
            }
            emitTurnEvent({
              type: "approval.requested",
              runId,
              turnId,
              request,
            });
          },
          onUsage: (usage) => {
            if (finished || cancelled) return;
            emitTurnEvent({
              type: "usage",
              runId,
              turnId,
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
      event: IpcMainInvokeEvent,
      command: import("../../shared/chat-runtime/chat-runtime-contract").ChatRuntimeCommand,
    ): Promise<
      import("../../shared/chat-runtime/chat-runtime-contract").ChatRuntimeCommandResult
    > => {
      if (
        !command?.type ||
        !command.runId?.trim() ||
        !command.turnId?.trim() ||
        !command.requestId?.trim()
      ) {
        return {
          ok: false,
          code: "INVALID_INPUT",
          error: "runId, turnId, and requestId are required",
        };
      }

      const runId = command.runId.trim();
      const turnId = command.turnId.trim();
      const requestId = command.requestId.trim();
      const run = getActiveRun(runId);
      if (!run) {
        return {
          ok: false,
          code: "RUN_NOT_FOUND",
          error: `No active run ${runId}`,
        };
      }
      if (run.turnId && run.turnId !== turnId) {
        return {
          ok: false,
          code: "TURN_MISMATCH",
          error: `Command turn ${turnId} does not match active turn ${run.turnId}`,
        };
      }

      const expectKind =
        command.type === "clarify.respond" ? "clarify" : "approval";
      const pending = run.pendingInteractions.get(requestId);
      const invalid = validatePendingInteraction({
        pending,
        commandTurnId: turnId,
        commandType: command.type,
        expectKind,
      });
      if (invalid) {
        return {
          ok: false,
          code: invalid,
          error: `Interaction invalid: ${invalid}`,
        };
      }

      try {
        if (command.type === "clarify.respond") {
          await run.respondClarify?.(requestId, command.answer);
          const entry = run.pendingInteractions.get(requestId);
          if (entry) entry.resolved = true;
          run.pendingInteractions.delete(requestId);
          emitChatRuntimeEvent(event.sender, {
            type: "clarify.resolved",
            runId,
            turnId,
            requestId,
            answer: command.answer,
          });
        } else if (command.type === "approval.approve") {
          await run.approve?.(requestId);
          run.pendingInteractions.delete(requestId);
          emitChatRuntimeEvent(event.sender, {
            type: "approval.resolved",
            runId,
            turnId,
            requestId,
            decision: "approved",
          });
        } else {
          await run.deny?.(requestId, command.reason);
          run.pendingInteractions.delete(requestId);
          emitChatRuntimeEvent(event.sender, {
            type: "approval.resolved",
            runId,
            turnId,
            requestId,
            decision: "denied",
            reason: command.reason,
          });
        }
      } catch (err) {
        const code =
          err instanceof HermesChatCommandUnsupportedError
            ? "GATEWAY_UNSUPPORTED"
            : err instanceof HermesChatCommandFailedError
              ? "COMMAND_FAILED"
              : "COMMAND_FAILED";
        const message = err instanceof Error ? err.message : String(err);
        emitChatRuntimeEvent(event.sender, {
          type: "interaction.failed",
          runId,
          turnId,
          requestId,
          error: { code, message },
        });
        return { ok: false, code, error: message };
      }

      return {
        ok: true,
        runId,
        turnId,
        requestId,
        acceptedAt: Date.now(),
      };
    },
  );
}

export function shutdownChatRuntimeIpc(): void {
  abortRun();
  stopAllSessionReconciles();
}
