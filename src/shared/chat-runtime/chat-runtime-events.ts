/** v8.0 Chat Runtime — runId-scoped discriminative event union. */

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

export type ChatRuntimeEvent =
  | { type: "session.started"; runId: string; sessionId: string }
  | { type: "message.delta"; runId: string; content: string }
  | { type: "reasoning.delta"; runId: string; content: string }
  | { type: "tool.progress"; runId: string; tool: string }
  | { type: "tool.event"; runId: string; event: ChatToolEvent }
  | { type: "clarify.requested"; runId: string; request: ClarifyRequest }
  | { type: "approval.requested"; runId: string; request: ApprovalRequest }
  | { type: "usage"; runId: string; usage: ChatUsage }
  | { type: "completed"; runId: string; sessionId?: string }
  | { type: "failed"; runId: string; error: ChatRuntimeError }
  | { type: "cancelled"; runId: string };

export function isChatRuntimeEvent(value: unknown): value is ChatRuntimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as { type?: unknown; runId?: unknown };
  return typeof event.type === "string" && typeof event.runId === "string";
}
