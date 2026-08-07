/**
 * v8.1 Chat Runtime IPC — event-driven start + durable run state + interaction continuation.
 */

import { ipcMain, Notification, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type {
  ChatAbortInput,
  ChatStartInput,
  ChatStartResult,
  ChatSubmitInput,
  ChatSubmitResult,
  ChatTurnRequestPayload,
} from "../../shared/chat-runtime/chat-runtime-contract";
import {
  CHAT_RUNTIME_CHANNELS,
  submitInputToStartInput,
} from "../../shared/chat-runtime/chat-runtime-contract";
import {
  isChatTurnTerminalEventType,
  type ChatRuntimeEventDraft,
} from "../../shared/chat-runtime/chat-runtime-events";
import {
  ChatRuntimeErrorCode,
  chatRuntimeError,
} from "../../shared/chat-runtime/chat-runtime-errors";
import type {
  ChatRuntimeGetStateInput,
  ChatRuntimeGetStateResult,
  ChatRuntimeRecoverInput,
  ChatRuntimeRecoverResult,
  ChatRuntimeGetSnapshotInput,
  ChatRuntimeReplayEventsInput,
} from "../../shared/chat-runtime/chat-runtime-state";
import type { ChatDiagnosticsExport } from "../../shared/chat-runtime/chat-runtime-trace";
import {
  buildChatDiagnosticsExport,
  saveChatDiagnosticsWithDialog,
} from "./chat-diagnostics-service";
import {
  getChatRuntimeSnapshot,
  replayChatRuntimeEvents,
} from "./chat-event-replay-service";
import { registerChatQueueIpc } from "./chat-queue-service";
import { ServeChatRuntimeAdapter } from "../runtime-adapters/ServeChatRuntimeAdapter";
import { getRuntimeConnectionState } from "../copilot-runtime-client/runtime-connection-manager";
import {
  assertReadyForChat,
  getCachedCapabilities,
  hasFeature,
} from "../copilot-runtime-client/runtime-capability-manager";
import type { HermesChatSendPayload } from "../../shared/hermes-default-chat/hermes-default-chat-contract";
import {
  isRemoteMode,
  sendMessage,
  startGatewayAsync,
  isGatewayRunningAsync,
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
  patchActiveRun,
  setActiveRun,
} from "./chat-runtime-manager";
import {
  createPendingApproval,
  createPendingClarify,
  validatePendingInteraction,
} from "./chat-interaction-registry";
import {
  HermesChatCommandFailedError,
  HermesChatCommandUnsupportedError,
} from "./hermes-chat-command-adapter";
import {
  createHermesInteractionContinuationAdapter,
  type ChatContinuationResult,
  type DurableTurnRequestContext,
} from "./hermes-interaction-continuation-adapter";
import {
  finalizeSessionReconcile,
  startSessionReconcile,
  stopAllSessionReconciles,
  stopSessionReconcile,
} from "./chat-session-reconciler";
import {
  abortAllTransports,
  abortTransport,
  clearTransportHandle,
  setTransportHandle,
} from "./chat-transport-registry";
import {
  bindSessionToRun,
} from "../chat-workspace/chat-workspace-service";
import { notifyChanged as notifySessionCatalogChanged } from "../session-catalog/session-catalog-service";
import {
  getPendingInteraction,
  getRun,
  getTurn,
  listPendingInteractions,
  listQueueEntries,
  listRuntimeEvents,
  listTurnsForRun,
  upsertPendingInteraction,
  upsertRun,
  upsertTurn,
} from "./chat-runtime-store";
import { recoverIncompleteTurns } from "./chat-recovery-coordinator";
import { getTurnLastSequence } from "./chat-event-sequencer";

const continuationAdapter = createHermesInteractionContinuationAdapter();

function toHermesPayload(
  request: ChatTurnRequestPayload,
): HermesChatSendPayload {
  return {
    message: request.message,
    profile: request.profileId === "default" ? undefined : request.profileId,
    resumeSessionId: request.sessionId,
    history: request.history,
    attachment_ids: request.attachments?.map((a) => a.id),
    attachment_metas: request.attachments?.map((a) => ({
      id: a.id,
      profile_id: request.profileId,
      session_id: request.sessionId || HERMES_DRAFT_SESSION_ID,
      name: a.name,
      mime_type: a.mime_type || "application/octet-stream",
      size_bytes: a.size_bytes ?? 0,
      storage_path: a.storage_path || "",
      text_preview: a.text_preview ?? null,
    })),
    model_id: request.model?.modelId,
    expert_id: request.expertId,
    team_id: request.teamId,
    expert_run_id: request.expertRunId,
    work_mode: request.workMode as HermesChatSendPayload["work_mode"],
    invocation_source: request.invocationSource,
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

function validateStart(input: ChatStartInput): string | null {
  if (!input?.runId?.trim()) return "runId is required";
  if (!input?.turnId?.trim()) return "turnId is required";
  const req = input.request;
  if (!req?.profileId?.trim()) return "profileId is required";
  if (!req.message?.trim() && !(req.attachments && req.attachments.length > 0)) {
    return "message or attachments required";
  }
  if (!req.invocationSource) return "invocationSource is required";
  return null;
}

type TerminalWaiter = {
  resolve: (result: ChatSubmitResult) => void;
  fullResponse: { value: string };
};

const submitWaiters = new Map<string, TerminalWaiter>();

function turnWaitKey(runId: string, turnId: string): string {
  return `${runId}::${turnId}`;
}

function parseTurnRequestContext(
  snapshotJson: string | undefined,
  profileId: string,
  sessionId: string,
): DurableTurnRequestContext {
  let parsed: Partial<ChatTurnRequestPayload> = {};
  if (snapshotJson) {
    try {
      parsed = JSON.parse(snapshotJson) as ChatTurnRequestPayload;
    } catch {
      parsed = {};
    }
  }
  const modelId = parsed.model?.modelId;
  return {
    profileId: parsed.profileId || profileId,
    sessionId: parsed.sessionId || sessionId,
    modelId: modelId || undefined,
    expertId: parsed.expertId,
    teamId: parsed.teamId,
    expertRunId: parsed.expertRunId,
    workMode: parsed.workMode,
    permissionMode: parsed.permissionMode,
    invocationSource: parsed.invocationSource,
    contextFolder: parsed.contextFolder,
    attachmentIds: parsed.attachments
      ?.map((a) => a.id)
      .filter((id): id is string => Boolean(id)),
    history: parsed.history,
  };
}

async function beginChatTurn(
  event: IpcMainInvokeEvent,
  input: ChatStartInput,
  getMainWindow: () => BrowserWindow | null,
): Promise<ChatStartResult> {
  const invalid = validateStart(input);
  if (invalid) {
    return { ok: false, code: ChatRuntimeErrorCode.INVALID_INPUT, error: invalid };
  }

  // Phase 3 / v1.2 Phase 5: Serve Chat Runtime transport + capability gate.
  if (ServeChatRuntimeAdapter.preferred()) {
    const ready = getRuntimeConnectionState().ready;
    const gate = assertReadyForChat(ready);
    if (gate) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.RUNTIME_UNAVAILABLE,
        error: gate.message,
      };
    }
    // Prefer finer gate when Runtime advertises subdivided chat.runtime.v2.* features.
    const caps = getCachedCapabilities();
    if (
      caps &&
      caps.featureIds.some(
        (id) => id.startsWith("chat.runtime.v2.") && id !== "chat.runtime.v2",
      ) &&
      !hasFeature("chat.runtime.v2.real-execution")
    ) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.RUNTIME_UNAVAILABLE,
        error: "Runtime missing required chat feature: chat.runtime.v2.real-execution",
      };
    }
    return ServeChatRuntimeAdapter.startTurn(input, event.sender);
  }

  const runId = input.runId.trim();
  const turnId = input.turnId.trim();
  const request = input.request;
  const payload = toHermesPayload(request);
  const profile = payload.profile;
  const acceptedAt = Date.now();

  upsertRun({
    runId,
    activeTurnId: turnId,
    profileId: request.profileId,
    sessionId: request.sessionId,
    status: "starting",
    pendingInteractions: listPendingInteractions(runId),
    lastEventSequence: 0,
    updatedAt: acceptedAt,
  });
  upsertTurn({
    turnId,
    runId,
    sessionId: request.sessionId,
    profileId: request.profileId,
    status: "starting",
    rawText: request.message,
    effectiveText: request.message,
    requestSnapshotJson: JSON.stringify(request),
    startedAt: acceptedAt,
    lastSequence: 0,
  });

  // Kick off async work — do not await completion.
  void runChatTurnAsync(event, input, getMainWindow).catch((err) => {
    console.error("[chat-runtime] turn async failed:", err);
  });

  return { ok: true, runId, turnId, acceptedAt };
}

async function runChatTurnAsync(
  event: IpcMainInvokeEvent,
  input: ChatStartInput,
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  const runId = input.runId.trim();
  const turnId = input.turnId.trim();
  const request = input.request;
  const payload = toHermesPayload(request);
  const profile = payload.profile;

  let turnTerminal = false;
  let sessionStartedEmitted = false;
  let fullResponse = "";
  let resolvedSessionId: string | undefined = request.sessionId;
  const chatStartTime = Date.now();
  let cancelled = false;
  let finished = false;

  const emitTurnEvent = (draft: ChatRuntimeEventDraft): boolean => {
    if (turnTerminal && !isChatTurnTerminalEventType(draft.type)) {
      return true;
    }
    if (isChatTurnTerminalEventType(draft.type)) {
      turnTerminal = true;
    }
    return emitChatRuntimeEvent(event.sender, { ...draft, runId, turnId });
  };

  const emitSessionStartedOnce = (sessionId: string): void => {
    if (sessionStartedEmitted || !sessionId || turnTerminal) return;
    sessionStartedEmitted = true;
    try {
      bindSessionToRun(runId, sessionId);
    } catch (err) {
      console.warn("[chat-runtime] bindSessionToRun failed:", err);
    }
    try {
      notifySessionCatalogChanged(profile, "session.started");
    } catch (err) {
      console.warn("[chat-runtime] session-catalog notify failed:", err);
    }
    void emitTurnEvent({
      type: "session.started",
      runId,
      turnId,
      sessionId,
    });
  };

  const finishTransport = (): void => {
    clearTransportHandle(runId, turnId);
    stopSessionReconcile(runId);
  };

  const persistRunStatus = (
    status: import("../../shared/chat-runtime/chat-runtime-state").DurableChatRunStatus,
    turnStatus: import("../../shared/chat-runtime/chat-runtime-state").ChatTurnStatus,
    extras?: { errorCode?: string; errorMessage?: string },
  ): void => {
    const pending = listPendingInteractions(runId);
    const effectiveStatus =
      pending.length > 0 && (status === "completed" || status === "streaming")
        ? pending[0].interactionType === "clarify"
          ? "waiting_clarify"
          : "waiting_approval"
        : status;
    const effectiveTurnStatus =
      pending.length > 0 && (turnStatus === "completed" || turnStatus === "streaming")
        ? pending[0].interactionType === "clarify"
          ? "waiting_clarify"
          : "waiting_approval"
        : turnStatus;

    upsertRun({
      runId,
      activeTurnId: turnId,
      profileId: request.profileId,
      sessionId: resolvedSessionId,
      status: effectiveStatus,
      pendingInteractions: pending,
      lastEventSequence: getTurnLastSequence(runId, turnId),
      updatedAt: Date.now(),
    });
    upsertTurn({
      turnId,
      runId,
      sessionId: resolvedSessionId,
      profileId: request.profileId,
      status: effectiveTurnStatus,
      rawText: request.message,
      effectiveText: request.message,
      requestSnapshotJson: JSON.stringify(request),
      startedAt: chatStartTime,
      completedAt:
        effectiveTurnStatus === "completed" ||
        effectiveTurnStatus === "failed" ||
        effectiveTurnStatus === "cancelled"
          ? Date.now()
          : undefined,
      errorCode: extras?.errorCode,
      errorMessage: extras?.errorMessage,
      lastSequence: getTurnLastSequence(runId, turnId),
    });
  };

  const resolveSubmitWaiter = (result: ChatSubmitResult): void => {
    const waiter = submitWaiters.get(turnWaitKey(runId, turnId));
    if (waiter) {
      submitWaiters.delete(turnWaitKey(runId, turnId));
      waiter.resolve(result);
    }
  };

  const finishOnce = (result: ChatSubmitResult): void => {
    if (finished) return;
    finished = true;
    finishTransport();
    // Keep durable run / pending interactions — do NOT clearActiveRun when waiting.
    const pending = listPendingInteractions(runId);
    if (pending.length === 0) {
      // Soft-clear memory handle abort hooks but retain run id lookup via store.
      clearActiveRun(runId);
    }
    resolveSubmitWaiter(result);
  };

  const block = await beforeExpertChatSend(payload);
  if (block) {
    emitTurnEvent({
      type: "failed",
      runId,
      turnId,
      error: chatRuntimeError(ChatRuntimeErrorCode.EXPERT_BLOCKED, block.message),
    });
    persistRunStatus("failed", "failed", {
      errorCode: block.errorCode || ChatRuntimeErrorCode.EXPERT_BLOCKED,
      errorMessage: block.message,
    });
    finishOnce({
      ok: false,
      runId,
      turnId,
      errorCode: block.errorCode || ChatRuntimeErrorCode.EXPERT_BLOCKED,
      error: block.message,
    });
    return;
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

  const { modelId, saved } = resolveSendModelId(payload);
  const requestSessionKey =
    payload.resumeSessionId?.trim() || HERMES_DRAFT_SESSION_ID;

  let chatHandle: { abort: () => void } | null = null;

  setActiveRun(runId, {
    abort: () => {
      if (finished || cancelled) return;
      cancelled = true;
      try {
        chatHandle?.abort();
      } catch {
        /* best effort */
      }
      emitTurnEvent({ type: "cancelled", runId, turnId });
      persistRunStatus("cancelled", "cancelled");
      finishOnce({
        ok: false,
        runId,
        turnId,
        errorCode: ChatRuntimeErrorCode.CANCELLED,
        error: "Run cancelled",
      });
    },
    profileId: request.profileId,
    sessionId: request.sessionId,
    turnId,
    startedAt: Date.now(),
    pendingInteractions: new Map(),
  });

  setTransportHandle({
    runId,
    turnId,
    abort: () => {
      try {
        chatHandle?.abort();
      } catch {
        /* best effort */
      }
    },
  });

  upsertRun({
    runId,
    activeTurnId: turnId,
    profileId: request.profileId,
    sessionId: request.sessionId,
    status: "streaming",
    pendingInteractions: [],
    lastEventSequence: 0,
    updatedAt: Date.now(),
  });
  upsertTurn({
    turnId,
    runId,
    sessionId: request.sessionId,
    profileId: request.profileId,
    status: "streaming",
    rawText: request.message,
    effectiveText: request.message,
    requestSnapshotJson: JSON.stringify(request),
    startedAt: chatStartTime,
    lastSequence: 0,
  });

  const ensureReconcile = (sessionId: string): void => {
    startSessionReconcile(runId, sessionId, (payloadDiff) => {
      for (const evt of payloadDiff.events) {
        emitTurnEvent({
          type: "tool.progress",
          runId,
          turnId,
          tool: evt.tool,
        });
      }
    });
  };

  const emitReconcileDiff = (
    payloadDiff: import("./chat-session-reconciler").ChatSessionReconcileDiff,
  ): void => {
    for (const evt of payloadDiff.events) {
      emitTurnEvent({
        type: "tool.progress",
        runId,
        turnId,
        tool: evt.tool,
      });
    }
  };

  const handle = await sendMessage(
    payload.message,
    {
      onChunk: (chunk) => {
        if (finished || cancelled) return;
        fullResponse += chunk;
        const waiter = submitWaiters.get(turnWaitKey(runId, turnId));
        if (waiter) waiter.fullResponse.value = fullResponse;
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
          persistRunStatus("cancelled", "cancelled");
          finishOnce({
            ok: false,
            runId,
            turnId,
            errorCode: ChatRuntimeErrorCode.CANCELLED,
            error: "Run cancelled",
          });
        }
      },
      onSessionStarted: (sessionId) => {
        if (finished || cancelled || !sessionId) return;
        resolvedSessionId = sessionId;
        migrateSessionModelBinding(requestSessionKey, sessionId, profile);
        patchActiveRun(runId, { sessionId });
        emitSessionStartedOnce(sessionId);
        ensureReconcile(sessionId);
      },
      onDone: (sessionId) => {
        if (finished) return;
        if (cancelled) {
          persistRunStatus("cancelled", "cancelled");
          finishOnce({
            ok: false,
            runId,
            turnId,
            errorCode: ChatRuntimeErrorCode.CANCELLED,
            error: "Run cancelled",
          });
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

        const pending = listPendingInteractions(runId);
        if (pending.length === 0) {
          emitTurnEvent({
            type: "completed",
            runId,
            turnId,
            sessionId: resolvedSessionId,
          });
          persistRunStatus("completed", "completed");
          try {
            notifySessionCatalogChanged(profile, "turn.completed");
          } catch {
            /* ignore */
          }
        } else {
          persistRunStatus(
            pending[0].interactionType === "clarify"
              ? "waiting_clarify"
              : "waiting_approval",
            pending[0].interactionType === "clarify"
              ? "waiting_clarify"
              : "waiting_approval",
          );
        }
        finishOnce({
          ok: true,
          runId,
          turnId,
          response: fullResponse,
          sessionId: resolvedSessionId,
        });

        const mainWindow = getMainWindow();
        if (
          mainWindow &&
          !mainWindow.isFocused() &&
          Date.now() - chatStartTime > 10000 &&
          pending.length === 0
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
          persistRunStatus("cancelled", "cancelled");
          finishOnce({
            ok: false,
            runId,
            turnId,
            errorCode: ChatRuntimeErrorCode.CANCELLED,
            error: "Run cancelled",
          });
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
        persistRunStatus("failed", "failed", {
          errorCode: ChatRuntimeErrorCode.SEND_FAILED,
          errorMessage: error,
        });
        finishOnce({
          ok: false,
          runId,
          turnId,
          errorCode: ChatRuntimeErrorCode.SEND_FAILED,
          error,
        });

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
      onClarifyRequested: (req) => {
        if (cancelled) return;
        const run = getActiveRun(runId);
        if (run) {
          run.pendingInteractions.set(
            req.requestId,
            createPendingClarify(req.requestId, turnId),
          );
        }
        upsertPendingInteraction({
          requestId: req.requestId,
          runId,
          turnId,
          interactionType: "clarify",
          payloadJson: JSON.stringify(req),
          status: "pending",
          createdAt: Date.now(),
        });
        persistRunStatus("waiting_clarify", "waiting_clarify");
        emitTurnEvent({
          type: "clarify.requested",
          runId,
          turnId,
          request: req,
        });
      },
      onApprovalRequested: (req) => {
        if (cancelled) return;
        const run = getActiveRun(runId);
        if (run) {
          run.pendingInteractions.set(
            req.requestId,
            createPendingApproval(req.requestId, turnId, req.toolName),
          );
        }
        upsertPendingInteraction({
          requestId: req.requestId,
          runId,
          turnId,
          interactionType: "approval",
          payloadJson: JSON.stringify(req),
          status: "pending",
          createdAt: Date.now(),
        });
        persistRunStatus("waiting_approval", "waiting_approval");
        emitTurnEvent({
          type: "approval.requested",
          runId,
          turnId,
          request: req,
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
  setTransportHandle({
    runId,
    turnId,
    abort: () => {
      try {
        chatHandle?.abort();
      } catch {
        /* best effort */
      }
    },
  });

  if (request.sessionId) {
    ensureReconcile(request.sessionId);
  }
}

export function registerChatRuntimeIpc(
  getMainWindow: () => BrowserWindow | null,
): void {
  // @lat: [[domain/chat#Durable runtime (v8.1)]]
  // Best-effort recovery of incomplete turns from prior session.
  void recoverIncompleteTurns().catch((err) => {
    console.warn("[chat-runtime] startup recover failed:", err);
  });

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.start,
    async (
      event: IpcMainInvokeEvent,
      input: ChatStartInput,
    ): Promise<ChatStartResult> => beginChatTurn(event, input, getMainWindow),
  );

  /** Compatibility adapter — waits for terminal event. Prefer start. */
  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.submit,
    async (
      event: IpcMainInvokeEvent,
      input: ChatSubmitInput,
    ): Promise<ChatSubmitResult> => {
      const startInput = submitInputToStartInput(input);
      const fullResponse = { value: "" };
      const waitKey = turnWaitKey(
        startInput.runId.trim(),
        startInput.turnId.trim(),
      );

      const resultPromise = new Promise<ChatSubmitResult>((resolve) => {
        submitWaiters.set(waitKey, { resolve, fullResponse });
      });

      const started = await beginChatTurn(event, startInput, getMainWindow);
      if (!started.ok) {
        submitWaiters.delete(waitKey);
        return {
          ok: false,
          runId: startInput.runId,
          turnId: startInput.turnId,
          errorCode: started.code,
          error: started.error,
        };
      }

      return resultPromise;
    },
  );

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.abort,
    async (_event, input: ChatAbortInput | string) => {
      const runId = typeof input === "string" ? input : input?.runId;
      if (!runId?.trim()) {
        abortRun();
        abortAllTransports();
        return { ok: true };
      }
      const id = runId.trim();
      if (ServeChatRuntimeAdapter.preferred()) {
        return ServeChatRuntimeAdapter.abort(id);
      }
      abortTransport(id);
      const ok = abortRun(id);
      stopSessionReconcile(id);
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

      if (ServeChatRuntimeAdapter.preferred()) {
        const result = await ServeChatRuntimeAdapter.command(command);
        if (result.ok) {
          const interactionType =
            command.type === "clarify.respond" ? "clarify" : "approval";
          emitChatRuntimeEvent(
            event.sender,
            {
              type: "interaction.accepted",
              runId: command.runId.trim(),
              turnId: command.turnId.trim(),
              requestId: command.requestId.trim(),
              interactionType,
            },
            { persist: false },
          );
        }
        return result;
      }

      const runId = command.runId.trim();
      const turnId = command.turnId.trim();
      const requestId = command.requestId.trim();

      const durable = getRun(runId);
      const memoryRun = getActiveRun(runId);
      if (!durable && !memoryRun) {
        return {
          ok: false,
          code: "RUN_NOT_FOUND",
          error: `No durable run ${runId}`,
        };
      }

      const storePending = getPendingInteraction(requestId);
      const memoryPending = memoryRun?.pendingInteractions.get(requestId);
      const pendingForValidate = memoryPending
        ? memoryPending
        : storePending
          ? {
              type: storePending.interactionType,
              requestId: storePending.requestId,
              turnId: storePending.turnId,
              createdAt: storePending.createdAt,
              resolved: storePending.status === "resolved",
              toolName:
                storePending.interactionType === "approval"
                  ? (JSON.parse(storePending.payloadJson) as { toolName?: string })
                      .toolName || ""
                  : undefined,
            }
          : undefined;

      const expectKind =
        command.type === "clarify.respond" ? "clarify" : "approval";
      const invalid = validatePendingInteraction({
        pending: pendingForValidate as
          | import("./chat-interaction-registry").PendingInteraction
          | undefined,
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

      const profileId =
        memoryRun?.profileId || durable?.profileId || "default";
      const sessionId =
        command.sessionId ||
        memoryRun?.sessionId ||
        durable?.sessionId ||
        "";

      if (!sessionId.trim()) {
        emitChatRuntimeEvent(event.sender, {
          type: "interaction.failed",
          runId,
          turnId,
          requestId,
          error: {
            code: "COMMAND_FAILED",
            message: "sessionId is required for interaction continuation",
          },
        });
        return {
          ok: false,
          code: "COMMAND_FAILED",
          error: "sessionId is required for interaction continuation",
        };
      }

      try {
        emitChatRuntimeEvent(event.sender, {
          type: "interaction.accepted",
          runId,
          turnId,
          requestId,
          interactionType: expectKind,
        });

        upsertPendingInteraction({
          requestId,
          runId,
          turnId,
          interactionType: expectKind,
          payloadJson: storePending?.payloadJson || "{}",
          status: "accepted",
          createdAt: storePending?.createdAt || Date.now(),
        });

        const turnRecord = getTurn(turnId);
        const context = parseTurnRequestContext(
          turnRecord?.requestSnapshotJson,
          profileId,
          sessionId,
        );

        upsertPendingInteraction({
          requestId,
          runId,
          turnId,
          interactionType: expectKind,
          payloadJson: storePending?.payloadJson || "{}",
          status: "continuing",
          createdAt: storePending?.createdAt || Date.now(),
        });

        let completionResult: ChatContinuationResult;

        if (command.type === "clarify.respond") {
          const execution = await continuationAdapter.continueClarify({
            runId,
            turnId,
            profileId,
            sessionId,
            requestId,
            answer: command.answer,
            modelId: context.modelId,
            context,
            sender: event.sender,
          });
          completionResult = await execution.completion;
          if (!completionResult.ok) {
            upsertPendingInteraction({
              requestId,
              runId,
              turnId,
              interactionType: "clarify",
              payloadJson: storePending?.payloadJson || "{}",
              status: "failed",
              createdAt: storePending?.createdAt || Date.now(),
              resolvedAt: Date.now(),
            });
            emitChatRuntimeEvent(event.sender, {
              type: "interaction.failed",
              runId,
              turnId,
              requestId,
              error: {
                code: completionResult.code,
                message: completionResult.error,
              },
            });
            return {
              ok: false,
              code: completionResult.code as import("../../shared/chat-runtime/chat-runtime-contract").ChatRuntimeCommandErrorCode,
              error: completionResult.error,
            };
          }
          upsertPendingInteraction({
            requestId,
            runId,
            turnId,
            interactionType: "clarify",
            payloadJson: storePending?.payloadJson || "{}",
            status: "resolved",
            createdAt: storePending?.createdAt || Date.now(),
            resolvedAt: Date.now(),
          });
          memoryRun?.pendingInteractions.delete(requestId);
          emitChatRuntimeEvent(event.sender, {
            type: "clarify.resolved",
            runId,
            turnId,
            requestId,
            answer: command.answer,
          });
          emitChatRuntimeEvent(event.sender, {
            type: "interaction.resolved",
            runId,
            turnId,
            requestId,
            interactionType: "clarify",
            answer: command.answer,
          });
        } else {
          const decision =
            command.type === "approval.approve" ? "approved" : "denied";
          const reason =
            command.type === "approval.deny" ? command.reason : undefined;
          const execution = await continuationAdapter.continueApproval({
            runId,
            turnId,
            profileId,
            sessionId,
            requestId,
            decision,
            reason,
            modelId: context.modelId,
            context,
            sender: event.sender,
          });
          completionResult = await execution.completion;
          if (!completionResult.ok) {
            upsertPendingInteraction({
              requestId,
              runId,
              turnId,
              interactionType: "approval",
              payloadJson: storePending?.payloadJson || "{}",
              status: "failed",
              createdAt: storePending?.createdAt || Date.now(),
              resolvedAt: Date.now(),
            });
            emitChatRuntimeEvent(event.sender, {
              type: "interaction.failed",
              runId,
              turnId,
              requestId,
              error: {
                code: completionResult.code,
                message: completionResult.error,
              },
            });
            return {
              ok: false,
              code: completionResult.code as import("../../shared/chat-runtime/chat-runtime-contract").ChatRuntimeCommandErrorCode,
              error: completionResult.error,
            };
          }
          upsertPendingInteraction({
            requestId,
            runId,
            turnId,
            interactionType: "approval",
            payloadJson: storePending?.payloadJson || "{}",
            status: "resolved",
            createdAt: storePending?.createdAt || Date.now(),
            resolvedAt: Date.now(),
          });
          memoryRun?.pendingInteractions.delete(requestId);
          emitChatRuntimeEvent(event.sender, {
            type: "approval.resolved",
            runId,
            turnId,
            requestId,
            decision,
            reason,
          });
          emitChatRuntimeEvent(event.sender, {
            type: "interaction.resolved",
            runId,
            turnId,
            requestId,
            interactionType: "approval",
            decision,
            reason,
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
        upsertPendingInteraction({
          requestId,
          runId,
          turnId,
          interactionType: expectKind,
          payloadJson: storePending?.payloadJson || "{}",
          status: "failed",
          createdAt: storePending?.createdAt || Date.now(),
          resolvedAt: Date.now(),
        });
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

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.state,
    (_event, input: ChatRuntimeGetStateInput): ChatRuntimeGetStateResult => {
      if (!input?.runId?.trim()) {
        return { ok: false, code: "INVALID_INPUT", error: "runId required" };
      }
      const runId = input.runId.trim();
      const run = getRun(runId);
      if (!run) {
        return { ok: false, code: "RUN_NOT_FOUND", error: `No run ${runId}` };
      }
      return {
        ok: true,
        run: {
          ...run,
          pendingInteractions: listPendingInteractions(runId),
        },
        turns: listTurnsForRun(runId),
        queue: listQueueEntries(runId),
      };
    },
  );

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.recover,
    async (
      _event,
      input?: ChatRuntimeRecoverInput,
    ): Promise<ChatRuntimeRecoverResult> => {
      if (ServeChatRuntimeAdapter.preferred()) {
        return ServeChatRuntimeAdapter.recover(input);
      }
      try {
        const recovered = await recoverIncompleteTurns(input?.runId);
        return { ok: true, recoveredRuns: recovered };
      } catch (err) {
        return {
          ok: false,
          code: "RECOVER_FAILED",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.exportDiagnostics,
    (_event, input: { runId: string }): ChatDiagnosticsExport | { ok: false; error: string } => {
      return buildChatDiagnosticsExport(input);
    },
  );

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.saveDiagnostics,
    async (_event, input: { runId: string }) => {
      return saveChatDiagnosticsWithDialog(input);
    },
  );

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.getSnapshot,
    async (_event, input: ChatRuntimeGetSnapshotInput) => {
      if (ServeChatRuntimeAdapter.preferred()) {
        return ServeChatRuntimeAdapter.getSnapshot(input);
      }
      return getChatRuntimeSnapshot(input);
    },
  );

  ipcMain.handle(
    CHAT_RUNTIME_CHANNELS.replayEvents,
    async (_event, input: ChatRuntimeReplayEventsInput) => {
      if (ServeChatRuntimeAdapter.preferred()) {
        return ServeChatRuntimeAdapter.replayEvents(input);
      }
      return replayChatRuntimeEvents(input);
    },
  );

  registerChatQueueIpc();
}

export function shutdownChatRuntimeIpc(): void {
  abortRun();
  abortAllTransports();
  stopAllSessionReconciles();
}

// Re-export for tests that poke store via getTurn
export { getTurn, getRun };
