/** v8.0 / v8.1 Chat Runtime — runId + turnId scoped discriminative event union. */

export type ChatToolEvent = {
  callId: string;
  hasStableCallId?: boolean;
  name: string;
  status: "running" | "completed" | "failed";
  label?: string;
  emoji?: string;
  preview?: string;
  result?: string;
};

export type ClarifyRequest = {
  requestId: string;
  question: string;
  choices?: string[];
};

export type ApprovalRequest = {
  requestId: string;
  toolName: string;
  summary: string;
  riskLevel?: "low" | "medium" | "high";
};

export type ChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  contextTokens?: number;
  contextWindowTokens?: number;
};

export type ChatRuntimeError = {
  code: string;
  message: string;
};

/** v8.1 — every runtime event carries identity + ordering. */
export type ChatRuntimeEventBase = {
  eventId: string;
  runId: string;
  turnId: string;
  sequence: number;
  emittedAt: number;
};

export type ChatRuntimeEvent =
  | (ChatRuntimeEventBase & {
      type: "session.started";
      sessionId: string;
    })
  | (ChatRuntimeEventBase & { type: "message.delta"; content: string })
  | (ChatRuntimeEventBase & { type: "reasoning.delta"; content: string })
  | (ChatRuntimeEventBase & { type: "tool.progress"; tool: string })
  | (ChatRuntimeEventBase & { type: "tool.event"; event: ChatToolEvent })
  | (ChatRuntimeEventBase & {
      type: "clarify.requested";
      request: ClarifyRequest;
    })
  | (ChatRuntimeEventBase & {
      type: "approval.requested";
      request: ApprovalRequest;
    })
  | (ChatRuntimeEventBase & {
      type: "interaction.accepted";
      requestId: string;
      interactionType: "clarify" | "approval";
    })
  | (ChatRuntimeEventBase & {
      type: "interaction.continuing";
      requestId: string;
      interactionType: "clarify" | "approval";
    })
  | (ChatRuntimeEventBase & {
      type: "interaction.resolved";
      requestId: string;
      interactionType: "clarify" | "approval";
      decision?: "approved" | "denied";
      answer?: string;
      reason?: string;
    })
  | (ChatRuntimeEventBase & {
      type: "clarify.resolved";
      requestId: string;
      answer: string;
    })
  | (ChatRuntimeEventBase & {
      type: "approval.resolved";
      requestId: string;
      decision: "approved" | "denied";
      reason?: string;
    })
  | (ChatRuntimeEventBase & {
      type: "interaction.failed";
      requestId: string;
      error: ChatRuntimeError;
    })
  | (ChatRuntimeEventBase & { type: "usage"; usage: ChatUsage })
  | (ChatRuntimeEventBase & { type: "completed"; sessionId?: string })
  | (ChatRuntimeEventBase & { type: "failed"; error: ChatRuntimeError })
  | (ChatRuntimeEventBase & { type: "cancelled" });

/** Payload shape before sequencer stamps eventId / sequence / emittedAt. */
export type ChatRuntimeEventDraft = {
  [K in ChatRuntimeEvent["type"]]: Omit<
    Extract<ChatRuntimeEvent, { type: K }>,
    "eventId" | "sequence" | "emittedAt"
  >;
}[ChatRuntimeEvent["type"]];

export function isChatRuntimeEvent(value: unknown): value is ChatRuntimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as {
    type?: unknown;
    runId?: unknown;
    turnId?: unknown;
    eventId?: unknown;
    sequence?: unknown;
  };
  return (
    typeof event.type === "string" &&
    typeof event.runId === "string" &&
    typeof event.turnId === "string" &&
    typeof event.eventId === "string" &&
    typeof event.sequence === "number"
  );
}

/** Non-terminal event types that must not mutate state after a turn finishes. */
export const CHAT_TURN_NON_TERMINAL_EVENTS = new Set([
  "message.delta",
  "reasoning.delta",
  "tool.progress",
  "tool.event",
  "session.started",
  "usage",
  "clarify.requested",
  "approval.requested",
  "interaction.accepted",
  "interaction.continuing",
  "interaction.resolved",
  "clarify.resolved",
  "approval.resolved",
  "interaction.failed",
]);

export function isChatTurnTerminalEventType(type: string): boolean {
  return type === "completed" || type === "failed" || type === "cancelled";
}
