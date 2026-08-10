/**
 * Serve Chat Runtime adapter — routes window.chatRuntime execution to Serve chat-runs* (Phase 3).
 */
import type { WebContents } from "electron";
import { chatRuntimeClient } from "../copilot-runtime-client/clients/chat-runtime-client";
import { getRuntimeConnectionState } from "../copilot-runtime-client/runtime-connection-manager";
import {
  getCachedReadiness,
  isRuntimeChatReady,
  isRuntimeServiceReady,
} from "../copilot-runtime-client/runtime-capability-manager";
import {
  isServeChatTransportPreferred,
} from "../copilot-runtime-client/runtime-mode";
import { CopilotRuntimeHttpError } from "../copilot-runtime-client/runtime-http-client";
import type { ChatStartInput, ChatStartResult } from "../../shared/chat-runtime/chat-runtime-contract";
import type { ChatRuntimeCommand, ChatRuntimeCommandResult } from "../../shared/chat-runtime/chat-runtime-contract";
import { ChatRuntimeErrorCode } from "../../shared/chat-runtime/chat-runtime-errors";
import type {
  ChatRuntimeGetSnapshotInput,
  ChatRuntimeGetSnapshotResult,
  ChatRuntimeReplayEventsInput,
  ChatRuntimeReplayEventsResult,
  ChatRuntimeRecoverInput,
  ChatRuntimeRecoverResult,
  DurableChatQueueEntry,
} from "../../shared/chat-runtime/chat-runtime-state";
import type { ChatRunIdentity } from "../../shared/copilot-runtime/chat-run-identity";
import {
  mapServeChatEventToRuntimeEvent,
  stampServeMappedEvent,
  mapServeChatEventToDraft,
  type ServeChatEvent,
  type ServeChatQueueEntry,
} from "../../shared/copilot-runtime/chat-runtime-serve-contract";
import { remapServeEventIdentity } from "../../shared/copilot-runtime/serve-event-identity";
import { ServeInstanceAdapter } from "./ServeInstanceAdapter";
import { emitChatRuntimeEvent } from "../chat-runtime/chat-event-emitter";
import {
  setTransportHandle,
  clearTransportHandle,
  abortTransport,
} from "../chat-runtime/chat-transport-registry";
import { isChatTurnTerminalEventType } from "../../shared/chat-runtime/chat-runtime-events";

const runAbortControllers = new Map<string, AbortController>();
/** clientRunId → serverRunId (Serve UUID); abort may arrive with either. */
const clientToServerRunId = new Map<string, string>();
const workspaceId = "desktop-default";

function resolveAbortRunId(runRef: string): string {
  return clientToServerRunId.get(runRef) || runRef;
}

/**
 * Chat transport ready = serviceReady AND execution.chatReady (PRD v1.5.4 §40).
 * maintenance.ready must not block Chat.
 */
function liveReady(): boolean {
  if (!isServeChatTransportPreferred()) return false;
  const connection = getRuntimeConnectionState();
  const serviceReady = connection.serviceReady || isRuntimeServiceReady();
  const chatReady =
    connection.chatReady ||
    isRuntimeChatReady() ||
    getCachedReadiness()?.execution?.chatReady === true;
  return serviceReady && chatReady;
}

function errorMessage(err: unknown): string {
  if (err instanceof CopilotRuntimeHttpError) return err.runtimeError.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function mapQueueToDurable(entry: ServeChatQueueEntry, index: number): DurableChatQueueEntry {
  const statusRaw = entry.status.toLowerCase();
  const status =
    statusRaw === "running"
      ? "running"
      : statusRaw === "completed"
        ? "completed"
        : statusRaw === "failed"
          ? "failed"
          : statusRaw === "cancelled"
            ? "cancelled"
            : "queued";
  return {
    queueId: entry.queueId,
    runId: entry.runId,
    position: index,
    snapshotJson: JSON.stringify(entry.payload),
    status,
    createdAt: entry.createdAt ? Date.parse(entry.createdAt) || Date.now() : Date.now(),
  };
}

function forwardServeEvent(sender: WebContents, event: ServeChatEvent): boolean {
  const mapped = mapServeChatEventToRuntimeEvent(event);
  if (!mapped) {
    const draft = mapServeChatEventToDraft(event);
    if (!draft) return true;
    return emitChatRuntimeEvent(sender, stampServeMappedEvent(event, draft), {
      persist: false,
    });
  }
  return emitChatRuntimeEvent(sender, mapped, { persist: false });
}

export const ServeChatRuntimeAdapter = {
  name: "ServeChatRuntimeAdapter" as const,

  get ready(): boolean {
    return liveReady();
  },

  preferred(): boolean {
    return isServeChatTransportPreferred();
  },

  async resolveIdentity(profileRef?: string, sessionId?: string | null): Promise<ChatRunIdentity> {
    const ref = (profileRef || "default").trim() || "default";
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(ref);
    return {
      instanceId,
      profileId: ref === "default" ? undefined : ref,
      sessionId: sessionId ?? null,
    };
  },

  async startTurn(
    input: ChatStartInput,
    sender: WebContents,
  ): Promise<ChatStartResult> {
    if (!this.preferred()) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.GATEWAY_UNAVAILABLE,
        error: "Serve chat transport not preferred",
      };
    }
    if (!this.ready) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.RUNTIME_UNAVAILABLE,
        error:
          "Serve Runtime is not Ready. Chat transport is fail-closed (no Hermes fallback).",
      };
    }

    const runId = input.runId.trim();
    const turnId = input.turnId.trim();
    const request = input.request;
    const acceptedAt = Date.now();

    try {
      const identity = await this.resolveIdentity(
        request.profileId,
        request.sessionId ?? null,
      );
      const attachmentIds =
        request.attachments?.map((a) => a.id).filter(Boolean) ?? [];

      const accepted = await chatRuntimeClient.startTurn({
        clientRunId: runId,
        clientTurnId: turnId,
        instanceId: identity.instanceId,
        sessionId: identity.sessionId,
        workspaceId,
        message: request.message,
        // PRD v1.5.4 §47: never send Gateway virtual model as execution modelId.
        // Omit when unset / virtual so Hermes uses config.yaml default.
        modelId:
          request.model?.modelId && request.model.modelId !== "smc-copilot"
            ? request.model.modelId
            : undefined,
        attachmentIds,
        context: {
          expertId: request.expertId,
          teamId: request.teamId,
          workMode: request.workMode,
          permissionMode: request.permissionMode,
          invocationSource: request.invocationSource,
        },
      });

      const serverRunId = accepted.runId || runId;
      const serverTurnId = accepted.turnId || turnId;
      clientToServerRunId.set(runId, serverRunId);

      // Subscribe SSE (fire-and-forget); abort via controller.
      // Controllers are keyed by both client and server ids — Renderer aborts with client runId.
      const existing =
        runAbortControllers.get(runId) || runAbortControllers.get(serverRunId);
      existing?.abort();
      const controller = new AbortController();
      runAbortControllers.set(runId, controller);
      runAbortControllers.set(serverRunId, controller);

      setTransportHandle({
        runId,
        turnId,
        abort: () => {
          controller.abort();
          void chatRuntimeClient.abort(serverRunId).catch(() => undefined);
        },
      });

      let turnTerminal = false;
      void chatRuntimeClient
        .subscribeEvents({
          runId: serverRunId,
          lastEventId: accepted.eventCursor > 0 ? String(accepted.eventCursor) : null,
          signal: controller.signal,
          onEvent: (serveEvent) => {
            // Serve events carry server UUIDs; Renderer filters on client runId/turnId.
            const ev = remapServeEventIdentity(serveEvent, {
              clientRunId: runId,
              clientTurnId: turnId,
              serverRunId,
              serverTurnId,
            });
            if (turnTerminal && !isChatTurnTerminalEventType(
              mapServeChatEventToRuntimeEvent(ev)?.type ?? "ping",
            )) {
              return;
            }
            const mapped = mapServeChatEventToRuntimeEvent(ev);
            if (mapped && isChatTurnTerminalEventType(mapped.type)) {
              turnTerminal = true;
              clearTransportHandle(runId, turnId);
              clearTransportHandle(serverRunId, serverTurnId);
              runAbortControllers.delete(runId);
              runAbortControllers.delete(serverRunId);
            }
            forwardServeEvent(sender, ev);
          },
          onError: (err) => {
            console.warn("[ServeChatRuntimeAdapter] SSE error:", errorMessage(err));
          },
        })
        .catch((err) => {
          console.warn("[ServeChatRuntimeAdapter] SSE ended:", errorMessage(err));
        });

      // Return client ids — UI identity stays stable; server ids are transport-only.
      return { ok: true, runId, turnId, acceptedAt };
    } catch (err) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.SEND_FAILED,
        error: errorMessage(err),
      };
    }
  },

  async abort(runId: string): Promise<{ ok: boolean }> {
    const id = runId.trim();
    if (!id) return { ok: false };
    const serverId = resolveAbortRunId(id);
    runAbortControllers.get(id)?.abort();
    runAbortControllers.get(serverId)?.abort();
    runAbortControllers.delete(id);
    runAbortControllers.delete(serverId);
    abortTransport(id);
    abortTransport(serverId);
    try {
      if (this.ready) {
        await chatRuntimeClient.abort(serverId);
      }
      return { ok: true };
    } catch (err) {
      console.warn("[ServeChatRuntimeAdapter] abort failed:", errorMessage(err));
      return { ok: true };
    }
  },

  async command(
    command: ChatRuntimeCommand,
  ): Promise<ChatRuntimeCommandResult> {
    if (!this.ready) {
      return {
        ok: false,
        code: "COMMAND_FAILED",
        error: "Serve Runtime is not Ready for chat interactions",
      };
    }
    const runId = command.runId.trim();
    const turnId = command.turnId.trim();
    const requestId = command.requestId.trim();
    try {
      if (command.type === "clarify.respond") {
        await chatRuntimeClient.respondInteraction(runId, requestId, {
          turnId,
          type: "clarify",
          answer: command.answer,
        });
      } else if (command.type === "approval.approve") {
        await chatRuntimeClient.respondInteraction(runId, requestId, {
          turnId,
          type: "approval",
          decision: "approved",
        });
      } else {
        await chatRuntimeClient.respondInteraction(runId, requestId, {
          turnId,
          type: "approval",
          decision: "denied",
          reason: command.reason ?? null,
        });
      }
      return {
        ok: true,
        runId,
        turnId,
        requestId,
        acceptedAt: Date.now(),
      };
    } catch (err) {
      return {
        ok: false,
        code: "COMMAND_FAILED",
        error: errorMessage(err),
      };
    }
  },

  async getSnapshot(
    input: ChatRuntimeGetSnapshotInput,
  ): Promise<ChatRuntimeGetSnapshotResult> {
    if (!this.ready) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.RUNTIME_UNAVAILABLE,
        error: "Serve Runtime is not Ready",
      };
    }
    try {
      const snap = await chatRuntimeClient.getSnapshot(input.runId.trim());
      return {
        ok: true,
        snapshot: {
          runId: snap.runId,
          profileId: input.profileId || "default",
          run: {
            runId: snap.runId,
            profileId: input.profileId || "default",
            sessionId: snap.sessionId ?? undefined,
            status: "streaming",
            pendingInteractions: [],
            lastEventSequence:
              snap.events.length > 0
                ? Math.max(...snap.events.map((e) => e.sequence))
                : 0,
            updatedAt: Date.now(),
          },
          turns: [],
          pendingInteractions: [],
          queue: snap.queue.map(mapQueueToDurable),
          events: snap.events.map((e) => ({
            eventId: e.eventId,
            runId: e.runId,
            turnId: e.turnId,
            sequence: e.sequence,
            type: e.type,
            emittedAt: Date.parse(e.timestamp) || Date.now(),
            payloadJson: JSON.stringify(e),
          })),
          lastEventSequence:
            snap.events.length > 0
              ? Math.max(...snap.events.map((e) => e.sequence))
              : 0,
          truncated: false,
        },
      };
    } catch (err) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.SEND_FAILED,
        error: errorMessage(err),
      };
    }
  },

  async replayEvents(
    input: ChatRuntimeReplayEventsInput,
  ): Promise<ChatRuntimeReplayEventsResult> {
    if (!this.ready) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.RUNTIME_UNAVAILABLE,
        error: "Serve Runtime is not Ready",
      };
    }
    try {
      const after = input.afterSequence ?? 0;
      const events = await chatRuntimeClient.listEvents(input.runId.trim(), {
        afterSequence: after,
        limit: input.limit,
      });
      const lastSequence =
        events.length > 0 ? Math.max(...events.map((e) => e.sequence)) : after;
      return {
        ok: true,
        events: events.map((e) => ({
          eventId: e.eventId,
          runId: e.runId,
          turnId: e.turnId,
          sequence: e.sequence,
          type: e.type,
          emittedAt: Date.parse(e.timestamp) || Date.now(),
          payloadJson: JSON.stringify(e),
        })),
        truncated: false,
        lastSequence,
      };
    } catch (err) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.SEND_FAILED,
        error: errorMessage(err),
      };
    }
  },

  async recover(
    input?: ChatRuntimeRecoverInput,
  ): Promise<ChatRuntimeRecoverResult> {
    if (!this.ready) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.RUNTIME_UNAVAILABLE,
        error: "Serve Runtime is not Ready",
      };
    }
    const runId = input?.runId?.trim();
    if (!runId) {
      return { ok: true, recoveredRuns: [] };
    }
    try {
      await chatRuntimeClient.getSnapshot(runId);
      return { ok: true, recoveredRuns: [runId] };
    } catch (err) {
      return {
        ok: false,
        code: ChatRuntimeErrorCode.SEND_FAILED,
        error: errorMessage(err),
      };
    }
  },

  async listQueue(runId: string): Promise<DurableChatQueueEntry[]> {
    const entries = await chatRuntimeClient.listQueue(runId.trim());
    return entries.map(mapQueueToDurable);
  },

  async enqueue(runId: string, snapshotJson: string): Promise<DurableChatQueueEntry> {
    const raw = await chatRuntimeClient.enqueue(runId.trim(), {
      snapshotJson,
      payload: (() => {
        try {
          return JSON.parse(snapshotJson) as Record<string, unknown>;
        } catch {
          return { snapshotJson };
        }
      })(),
    });
    const mapped = mapQueueToDurable(
      {
        queueId:
          (raw as { queueId?: string; queue_id?: string; id?: string })?.queueId ||
          (raw as { queue_id?: string })?.queue_id ||
          (raw as { id?: string })?.id ||
          `q-${Date.now()}`,
        runId: runId.trim(),
        status: "pending",
        payload: {},
        createdAt: new Date().toISOString(),
        updatedAt: null,
      },
      0,
    );
    return { ...mapped, snapshotJson };
  },

  async deleteQueue(runId: string, queueId: string): Promise<void> {
    await chatRuntimeClient.deleteQueue(runId.trim(), queueId.trim());
  },

  async patchQueue(
    runId: string,
    queueId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await chatRuntimeClient.patchQueue(runId.trim(), queueId.trim(), body);
  },
};

export type ServeChatRuntimeAdapterType = typeof ServeChatRuntimeAdapter;
