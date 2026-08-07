/**
 * Hand-authored Serve Chat Runtime v2 contracts until Runtime OpenAPI includes chat-runs*.
 * Desktop OpenAPI snapshot removed (PRD v1.1 §4.1); types move to @smc/runtime-client after Phase 5.
 */

import type {
  ApprovalRequest,
  ChatRuntimeEvent,
  ChatRuntimeEventDraft,
  ChatToolEvent,
  ChatUsage,
  ClarifyRequest,
} from "../chat-runtime/chat-runtime-events";

export type ServeChatEventType =
  | "run.started"
  | "session.started"
  | "agent.message.delta"
  | "agent.message.completed"
  | "reasoning.delta"
  | "reasoning.completed"
  | "tool.started"
  | "tool.progress"
  | "tool.completed"
  | "tool.failed"
  | "clarify.requested"
  | "clarify.resolved"
  | "approval.requested"
  | "approval.resolved"
  | "usage.updated"
  | "artifact.created"
  | "turn.completed"
  | "turn.failed"
  | "turn.cancelled"
  | "queue.changed"
  | "ping"
  | string;

export type ServeChatEvent = {
  eventId: string;
  sequence: number;
  runId: string;
  turnId: string;
  segmentId?: string;
  instanceId?: string;
  sessionId?: string;
  type: ServeChatEventType;
  timestamp: string;
  payload: Record<string, unknown>;
};

export type ServeChatCreateRunBody = {
  clientRunId: string;
  instanceId: string;
  sessionId?: string | null;
  workspaceId?: string;
};

export type ServeChatCreateTurnBody = {
  clientRunId: string;
  clientTurnId: string;
  instanceId: string;
  sessionId?: string | null;
  workspaceId?: string;
  message: string;
  modelId?: string;
  attachmentIds?: string[];
  context?: {
    expertId?: string;
    teamId?: string;
    skillName?: string;
    workMode?: string;
    permissionMode?: string;
    invocationSource?: string;
  };
};

export type ServeChatAcceptedResult = {
  accepted: boolean;
  runId: string;
  turnId: string;
  eventCursor: number;
};

export type ServeChatInteractionRespondBody =
  | {
      turnId: string;
      type: "clarify";
      answer: string;
    }
  | {
      turnId: string;
      type: "approval";
      decision: "approved" | "denied";
      reason?: string | null;
    };

export type ServeChatQueueEntry = {
  queueId: string;
  runId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | string;
  payload: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ServeChatSnapshot = {
  runId: string;
  sessionId: string | null;
  status: string;
  events: ServeChatEvent[];
  queue: ServeChatQueueEntry[];
};

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
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

/** Normalize Serve JSON (snake_case or camelCase) into ServeChatEvent. */
export function normalizeServeChatEvent(raw: unknown): ServeChatEvent | null {
  const obj = asRecord(raw);
  const eventId = pickString(obj, "eventId", "event_id", "id");
  const runId = pickString(obj, "runId", "run_id");
  const turnId = pickString(obj, "turnId", "turn_id") ?? "";
  const type = pickString(obj, "type", "event", "eventType", "event_type");
  if (!eventId || !runId || !type) return null;
  const sequence = pickNumber(obj, "sequence", "seq", "cursor") ?? 0;
  const timestamp =
    pickString(obj, "timestamp", "emittedAt", "emitted_at", "createdAt", "created_at") ??
    new Date().toISOString();
  const payloadRaw = obj.payload ?? obj.data ?? {};
  const payload = asRecord(payloadRaw);
  return {
    eventId,
    sequence,
    runId,
    turnId: turnId || pickString(payload, "turnId", "turn_id") || "",
    segmentId: pickString(obj, "segmentId", "segment_id"),
    instanceId: pickString(obj, "instanceId", "instance_id"),
    sessionId: pickString(obj, "sessionId", "session_id") ?? pickString(payload, "sessionId", "session_id"),
    type,
    timestamp,
    payload,
  };
}

function mapToolEvent(payload: Record<string, unknown>, status: ChatToolEvent["status"]): ChatToolEvent {
  return {
    callId: pickString(payload, "callId", "call_id", "id") ?? "unknown",
    name: pickString(payload, "name", "tool", "toolName", "tool_name") ?? "tool",
    status,
    label: pickString(payload, "label"),
    emoji: pickString(payload, "emoji"),
    preview: pickString(payload, "preview"),
    result: pickString(payload, "result"),
  };
}

/**
 * Map Serve Chat Event → Desktop ChatRuntimeEventDraft (no eventId/sequence stamp yet).
 * Returns null for ping / unknown / queue.changed (handled separately).
 */
export function mapServeChatEventToDraft(event: ServeChatEvent): ChatRuntimeEventDraft | null {
  const { runId, turnId, type, payload } = event;
  if (!turnId && type !== "run.started" && type !== "ping" && type !== "queue.changed") {
    // still allow with empty turnId for early session events
  }
  const base = { runId, turnId: turnId || "unknown" };

  switch (type) {
    case "ping":
    case "queue.changed":
    case "run.started":
    case "artifact.created":
    case "reasoning.completed":
    case "agent.message.completed":
      return null;
    case "session.started": {
      const sessionId =
        event.sessionId ||
        pickString(payload, "sessionId", "session_id") ||
        "";
      if (!sessionId) return null;
      return { ...base, type: "session.started", sessionId };
    }
    case "agent.message.delta": {
      const content =
        pickString(payload, "content", "text", "delta", "message") ?? "";
      return { ...base, type: "message.delta", content };
    }
    case "reasoning.delta": {
      const content =
        pickString(payload, "content", "text", "delta") ?? "";
      return { ...base, type: "reasoning.delta", content };
    }
    case "tool.progress":
    case "tool.started": {
      const tool =
        pickString(payload, "tool", "name", "toolName", "tool_name") ?? "tool";
      if (type === "tool.started") {
        return {
          ...base,
          type: "tool.event",
          event: mapToolEvent(payload, "running"),
        };
      }
      return { ...base, type: "tool.progress", tool };
    }
    case "tool.completed":
      return {
        ...base,
        type: "tool.event",
        event: mapToolEvent(payload, "completed"),
      };
    case "tool.failed":
      return {
        ...base,
        type: "tool.event",
        event: mapToolEvent(payload, "failed"),
      };
    case "clarify.requested": {
      const request: ClarifyRequest = {
        requestId:
          pickString(payload, "requestId", "request_id", "id") ?? event.eventId,
        question: pickString(payload, "question", "prompt", "message") ?? "",
        choices: Array.isArray(payload.choices)
          ? (payload.choices as unknown[]).filter((c): c is string => typeof c === "string")
          : undefined,
      };
      return { ...base, type: "clarify.requested", request };
    }
    case "approval.requested": {
      const request: ApprovalRequest = {
        requestId:
          pickString(payload, "requestId", "request_id", "id") ?? event.eventId,
        toolName:
          pickString(payload, "toolName", "tool_name", "tool", "name") ?? "tool",
        summary: pickString(payload, "summary", "message", "description") ?? "",
        riskLevel: (() => {
          const r = pickString(payload, "riskLevel", "risk_level")?.toLowerCase();
          return r === "low" || r === "medium" || r === "high" ? r : undefined;
        })(),
      };
      return { ...base, type: "approval.requested", request };
    }
    case "clarify.resolved": {
      const requestId =
        pickString(payload, "requestId", "request_id") ?? event.eventId;
      const answer = pickString(payload, "answer", "response") ?? "";
      return { ...base, type: "clarify.resolved", requestId, answer };
    }
    case "approval.resolved": {
      const requestId =
        pickString(payload, "requestId", "request_id") ?? event.eventId;
      const decisionRaw = pickString(payload, "decision")?.toLowerCase();
      const decision =
        decisionRaw === "denied" || decisionRaw === "rejected" ? "denied" : "approved";
      return {
        ...base,
        type: "approval.resolved",
        requestId,
        decision,
        reason: pickString(payload, "reason") ?? undefined,
      };
    }
    case "usage.updated": {
      const usage: ChatUsage = {
        promptTokens: pickNumber(payload, "promptTokens", "prompt_tokens") ?? 0,
        completionTokens:
          pickNumber(payload, "completionTokens", "completion_tokens") ?? 0,
        totalTokens: pickNumber(payload, "totalTokens", "total_tokens") ?? 0,
        cost: pickNumber(payload, "cost"),
      };
      return { ...base, type: "usage", usage };
    }
    case "turn.completed":
      return {
        ...base,
        type: "completed",
        sessionId:
          event.sessionId ||
          pickString(payload, "sessionId", "session_id") ||
          undefined,
      };
    case "turn.failed":
      return {
        ...base,
        type: "failed",
        error: {
          code: pickString(payload, "code", "errorCode", "error_code") ?? "TURN_FAILED",
          message:
            pickString(payload, "message", "error", "detail") ?? "Turn failed",
        },
      };
    case "turn.cancelled":
      return { ...base, type: "cancelled" };
    default:
      return null;
  }
}

/** Stamp Serve event identity onto a Desktop event (use Serve's eventId/sequence). */
export function stampServeMappedEvent(
  event: ServeChatEvent,
  draft: ChatRuntimeEventDraft,
): ChatRuntimeEvent {
  const emittedAt = Date.parse(event.timestamp);
  return {
    ...draft,
    eventId: event.eventId,
    sequence: event.sequence,
    emittedAt: Number.isFinite(emittedAt) ? emittedAt : Date.now(),
  } as ChatRuntimeEvent;
}

export function mapServeChatEventToRuntimeEvent(
  raw: unknown,
): ChatRuntimeEvent | null {
  const normalized = normalizeServeChatEvent(raw);
  if (!normalized) return null;
  const draft = mapServeChatEventToDraft(normalized);
  if (!draft) return null;
  return stampServeMappedEvent(normalized, draft);
}
