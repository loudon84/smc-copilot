/**
 * Extracted SSE parsing logic — testable without Electron or HTTP.
 */

export interface ParsedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

export interface SseToolEvent {
  callId: string;
  name: string;
  status: "running" | "completed" | "failed";
  label?: string;
  preview?: string;
  result?: string;
}

export interface SseClarifyRequest {
  requestId: string;
  question: string;
  choices?: string[];
}

export interface SseApprovalRequest {
  requestId: string;
  toolName: string;
  summary: string;
  riskLevel?: "low" | "medium" | "high";
}

export interface SseCallbacks {
  onChunk: (text: string) => void;
  onToolProgress?: (tool: string) => void;
  onUsage?: (usage: ParsedUsage) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
  onSessionStarted?: (sessionId: string) => void;
  onReasoningDelta?: (content: string) => void;
  onToolEvent?: (event: SseToolEvent) => void;
  onClarifyRequested?: (request: SseClarifyRequest) => void;
  onApprovalRequested?: (request: SseApprovalRequest) => void;
}

/** Tool progress pattern: `emoji tool_name` or `emoji description` */
const toolProgressRe = /^`([^\s`]+)\s+([^`]+)`$/;

/**
 * Process a custom SSE event (e.g. hermes.tool.progress, hermes.reasoning.delta).
 * Returns true if the event was handled.
 */
export function processCustomEvent(
  eventType: string,
  data: string,
  cb: Pick<
    SseCallbacks,
    | "onToolProgress"
    | "onSessionStarted"
    | "onReasoningDelta"
    | "onToolEvent"
    | "onClarifyRequested"
    | "onApprovalRequested"
    | "onUsage"
    | "onError"
  >,
): boolean {
  if (eventType === "hermes.tool.progress" && cb.onToolProgress) {
    try {
      const payload = JSON.parse(data);
      const label = payload.label || payload.tool || "";
      const emoji = payload.emoji || "";
      cb.onToolProgress(emoji ? `${emoji} ${label}` : label);
      return true;
    } catch {
      /* malformed — skip */
    }
  }
  if (eventType === "hermes.session.started" && cb.onSessionStarted) {
    try {
      const payload = JSON.parse(data);
      const sid = payload.session_id || payload.sessionId;
      if (typeof sid === "string" && sid.trim()) {
        cb.onSessionStarted(sid);
        return true;
      }
    } catch {
      /* malformed — skip */
    }
  }
  if (eventType === "hermes.reasoning.delta" && cb.onReasoningDelta) {
    try {
      const payload = JSON.parse(data);
      const content = payload.content || payload.delta || "";
      if (content) {
        cb.onReasoningDelta(String(content));
        return true;
      }
    } catch {
      /* malformed — skip */
    }
  }
  if (eventType === "hermes.tool.event" && cb.onToolEvent) {
    try {
      const payload = JSON.parse(data);
      cb.onToolEvent({
        callId: String(payload.call_id || payload.callId || payload.id || ""),
        name: String(payload.name || payload.tool || "tool"),
        status: (payload.status || "running") as SseToolEvent["status"],
        label: payload.label,
        preview: payload.preview,
        result: payload.result,
      });
      return true;
    } catch {
      /* malformed — skip */
    }
  }
  if (eventType === "hermes.clarify.requested" && cb.onClarifyRequested) {
    try {
      const payload = JSON.parse(data);
      cb.onClarifyRequested({
        requestId: String(payload.request_id || payload.requestId || ""),
        question: String(payload.question || ""),
        choices: Array.isArray(payload.choices)
          ? payload.choices.map(String)
          : undefined,
      });
      return true;
    } catch {
      /* malformed — skip */
    }
  }
  if (eventType === "hermes.approval.requested" && cb.onApprovalRequested) {
    try {
      const payload = JSON.parse(data);
      cb.onApprovalRequested({
        requestId: String(payload.request_id || payload.requestId || ""),
        toolName: String(payload.tool_name || payload.toolName || ""),
        summary: String(payload.summary || ""),
        riskLevel: payload.risk_level || payload.riskLevel,
      });
      return true;
    } catch {
      /* malformed — skip */
    }
  }
  if (eventType === "hermes.usage" && cb.onUsage) {
    try {
      const payload = JSON.parse(data);
      cb.onUsage({
        promptTokens: payload.prompt_tokens || payload.promptTokens || 0,
        completionTokens:
          payload.completion_tokens || payload.completionTokens || 0,
        totalTokens: payload.total_tokens || payload.totalTokens || 0,
        cost: payload.cost,
        rateLimitRemaining:
          payload.rate_limit_remaining || payload.rateLimitRemaining,
        rateLimitReset: payload.rate_limit_reset || payload.rateLimitReset,
      });
      return true;
    } catch {
      /* malformed — skip */
    }
  }
  if (eventType === "hermes.failed" && cb.onError) {
    try {
      const payload = JSON.parse(data);
      cb.onError(String(payload.message || payload.error || "Hermes failed"));
    } catch {
      cb.onError("Hermes failed");
    }
    return true;
  }
  if (eventType === "hermes.completed") {
    return true;
  }
  return false;
}

export interface SseDataResult {
  done: boolean;
  hasContent: boolean;
  error?: string;
}

/**
 * Process a single SSE data payload (after `data: ` prefix is stripped).
 * Returns parsing result.
 */
export function processSseData(
  data: string,
  cb: SseCallbacks,
  state: { hasContent: boolean; lastError: string },
): SseDataResult {
  if (data === "[DONE]") {
    if (state.hasContent) {
      cb.onDone?.();
    }
    return { done: true, hasContent: state.hasContent, error: state.lastError };
  }

  try {
    const parsed = JSON.parse(data);

    // Capture error responses forwarded through SSE
    if (parsed.error) {
      state.lastError =
        parsed.error.message || JSON.stringify(parsed.error);
      return { done: false, hasContent: state.hasContent };
    }

    const delta = parsed.choices?.[0]?.delta;

    // Extract usage from final chunk
    if (parsed.usage && cb.onUsage) {
      cb.onUsage({
        promptTokens: parsed.usage.prompt_tokens || 0,
        completionTokens: parsed.usage.completion_tokens || 0,
        totalTokens: parsed.usage.total_tokens || 0,
        cost: parsed.usage.cost,
        rateLimitRemaining: parsed.usage.rate_limit_remaining,
        rateLimitReset: parsed.usage.rate_limit_reset,
      });
    }

    // OpenAI-style reasoning / thinking deltas (when present)
    const reasoning =
      delta?.reasoning_content ||
      delta?.reasoning ||
      parsed.reasoning_content;
    if (reasoning && cb.onReasoningDelta) {
      cb.onReasoningDelta(String(reasoning));
    }

    if (delta?.content) {
      const content = delta.content.trim();
      // Legacy: Detect tool progress lines injected into content
      const match = toolProgressRe.exec(content);
      if (match && cb.onToolProgress) {
        cb.onToolProgress(`${match[1]} ${match[2]}`);
      } else {
        state.hasContent = true;
        cb.onChunk(delta.content);
      }
    }
  } catch {
    /* malformed chunk — skip */
  }

  return { done: false, hasContent: state.hasContent };
}

/**
 * Parse a full SSE block (may contain `event:` and `data:` lines).
 * Returns { eventType, data } or null if no data line found.
 */
export function parseSseBlock(
  block: string,
): { eventType: string; data: string } | null {
  let eventType = "";
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataLine = line.slice(6);
    }
  }
  if (!dataLine) return null;
  return { eventType, data: dataLine };
}
