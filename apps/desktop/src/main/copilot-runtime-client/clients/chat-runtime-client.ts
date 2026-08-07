/**
 * Serve Chat Runtime v2 client — HTTP paths via @smc/runtime-client chat domain.
 * SSE auto-reconnect stays on Desktop runtime-sse-client.
 */
import { getSmcRuntimeClient } from "../smc-runtime-client";
import { subscribeRuntimeSse, type RuntimeSseMessage } from "../runtime-sse-client";
import {
  normalizeServeChatEvent,
  type ServeChatAcceptedResult,
  type ServeChatCreateRunBody,
  type ServeChatCreateTurnBody,
  type ServeChatEvent,
  type ServeChatInteractionRespondBody,
  type ServeChatQueueEntry,
  type ServeChatSnapshot,
} from "../../../shared/copilot-runtime/chat-runtime-serve-contract";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function mapAccepted(raw: unknown, fallbackRunId: string, fallbackTurnId: string): ServeChatAcceptedResult {
  const obj = asRecord(raw);
  return {
    accepted: obj.accepted !== false,
    runId: pickString(obj, "runId", "run_id") ?? fallbackRunId,
    turnId: pickString(obj, "turnId", "turn_id") ?? fallbackTurnId,
    eventCursor: pickNumber(obj, "eventCursor", "event_cursor", "cursor") ?? 0,
  };
}

function mapQueueEntry(raw: unknown): ServeChatQueueEntry | null {
  const obj = asRecord(raw);
  const queueId = pickString(obj, "queueId", "queue_id", "id");
  const runId = pickString(obj, "runId", "run_id");
  if (!queueId || !runId) return null;
  const payload = asRecord(obj.payload ?? obj.snapshot ?? obj.data ?? {});
  return {
    queueId,
    runId,
    status: pickString(obj, "status") ?? "pending",
    payload,
    createdAt: pickString(obj, "createdAt", "created_at") ?? null,
    updatedAt: pickString(obj, "updatedAt", "updated_at") ?? null,
  };
}

function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = asRecord(raw);
  const items = obj.items ?? obj.events ?? obj.queue ?? obj.data;
  return Array.isArray(items) ? items : [];
}

function parseSseDataToEvent(message: RuntimeSseMessage): ServeChatEvent | null {
  if (!message.data?.trim()) return null;
  try {
    const parsed = JSON.parse(message.data) as unknown;
    return normalizeServeChatEvent(
      message.id
        ? {
            ...asRecord(parsed),
            eventId: pickString(asRecord(parsed), "eventId", "event_id") ?? message.id,
          }
        : parsed,
    );
  } catch {
    return null;
  }
}

function chat() {
  return getSmcRuntimeClient().chat;
}

export const chatRuntimeClient = {
  createRun: async (body: ServeChatCreateRunBody): Promise<ServeChatAcceptedResult> => {
    const raw = await chat().createRun(body);
    return mapAccepted(raw, body.clientRunId, "");
  },

  getRun: (runId: string) => chat().getRun(runId),

  getSnapshot: async (runId: string): Promise<ServeChatSnapshot> => {
    const raw = await chat().snapshot(runId);
    const obj = asRecord(raw);
    const events = unwrapList(obj.events ?? raw)
      .map((e) => normalizeServeChatEvent(e))
      .filter((e): e is ServeChatEvent => e != null);
    const queue = unwrapList(obj.queue)
      .map((q) => mapQueueEntry(q))
      .filter((q): q is ServeChatQueueEntry => q != null);
    return {
      runId: pickString(obj, "runId", "run_id") ?? runId,
      sessionId: pickString(obj, "sessionId", "session_id") ?? null,
      status: pickString(obj, "status") ?? "unknown",
      events,
      queue,
    };
  },

  createTurn: async (
    runId: string,
    body: ServeChatCreateTurnBody,
  ): Promise<ServeChatAcceptedResult> => {
    const raw = await chat().createTurn(runId, body);
    return mapAccepted(raw, body.clientRunId || runId, body.clientTurnId);
  },

  startTurn: async (body: ServeChatCreateTurnBody): Promise<ServeChatAcceptedResult> => {
    const clientRunId = body.clientRunId ?? body.clientTurnId;
    const instanceId = body.instanceId ?? "";
    try {
      await chatRuntimeClient.createRun({
        clientRunId,
        instanceId,
        sessionId: body.sessionId,
        workspaceId: body.workspaceId,
      });
    } catch {
      // Run may already exist — continue with turn.
    }
    return chatRuntimeClient.createTurn(clientRunId, body);
  },

  abort: (runId: string) => chat().abort(runId, {}),

  respondInteraction: (
    runId: string,
    requestId: string,
    body: ServeChatInteractionRespondBody,
  ) => chat().respondInteraction(runId, requestId, body),

  listEvents: async (
    runId: string,
    options?: { afterSequence?: number; limit?: number },
  ): Promise<ServeChatEvent[]> => {
    const raw = await chat().listEvents(runId, {
      after_sequence: options?.afterSequence,
      limit: options?.limit ?? 500,
    });
    return unwrapList(raw)
      .map((e) => normalizeServeChatEvent(e))
      .filter((e): e is ServeChatEvent => e != null);
  },

  subscribeEvents: (input: {
    runId: string;
    lastEventId?: string | null;
    signal?: AbortSignal;
    onEvent: (event: ServeChatEvent) => void;
    onError?: (error: unknown) => void;
    autoReconnect?: boolean;
  }): Promise<void> => {
    const seen = new Set<string>();
    return subscribeRuntimeSse({
      path: `/api/v1/chat-runs/${encodeURIComponent(input.runId)}/events/stream`,
      lastEventId: input.lastEventId,
      signal: input.signal,
      autoReconnect: input.autoReconnect ?? true,
      onError: input.onError,
      onMessage: (message) => {
        const event = parseSseDataToEvent(message);
        if (!event) return;
        if (seen.has(event.eventId)) return;
        seen.add(event.eventId);
        input.onEvent(event);
      },
    });
  },

  listQueue: async (runId: string): Promise<ServeChatQueueEntry[]> => {
    const raw = await chat().listQueue(runId);
    return unwrapList(raw)
      .map((q) => mapQueueEntry(q))
      .filter((q): q is ServeChatQueueEntry => q != null);
  },

  enqueue: (runId: string, body: Record<string, unknown>) => chat().enqueue(runId, body),

  patchQueue: (runId: string, queueId: string, body: Record<string, unknown>) =>
    chat().patchQueue(runId, queueId, body),

  deleteQueue: (runId: string, queueId: string) => chat().deleteQueue(runId, queueId),
};
