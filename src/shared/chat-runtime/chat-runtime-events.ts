/** v8.0 Chat Runtime — runId + turnId scoped discriminative event union. */

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

export type ChatRuntimeEventBase = {
  runId: string;
  turnId: string;
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

export function isChatRuntimeEvent(value: unknown): value is ChatRuntimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as { type?: unknown; runId?: unknown; turnId?: unknown };
  return (
    typeof event.type === "string" &&
    typeof event.runId === "string" &&
    typeof event.turnId === "string"
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
  "clarify.resolved",
  "approval.resolved",
  "interaction.failed",
]);

export function isChatTurnTerminalEventType(type: string): boolean {
  return type === "completed" || type === "failed" || type === "cancelled";
}
