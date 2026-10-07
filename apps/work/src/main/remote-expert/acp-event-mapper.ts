import type { RemoteExpertSemanticEvent } from "../../shared/remote-expert";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractText(update: Record<string, unknown>): string {
  if (typeof update.text === "string") return update.text;
  const content = update.content;
  if (typeof content === "string") return content;
  if (isRecord(content) && content.type === "text" && typeof content.text === "string") {
    return content.text;
  }
  return "";
}

function resolveUpdate(params: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(params.sessionUpdate)) {
    return params.sessionUpdate;
  }
  if (isRecord(params.update)) {
    return params.update;
  }
  return params;
}

function parseToolStatus(
  value: unknown,
  fallback: "in_progress" | "completed" | "failed",
): "in_progress" | "completed" | "failed" {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "in_progress" || s === "pending" || s === "running") {
    return "in_progress";
  }
  if (s === "completed" || s === "complete" || s === "success") {
    return "completed";
  }
  if (s === "failed" || s === "error" || s === "cancelled" || s === "canceled") {
    return "failed";
  }
  return fallback;
}

function parseResultStatus(
  value: unknown,
  fallback: "completed" | "failed",
): "completed" | "failed" {
  // tool_call_update is treated as terminal for Consumer DTO tool.result.
  // Non-failed Provider statuses (incl. in_progress aliases) map to completed
  // only when Provider does not signal failure; prefer explicit status when present.
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "failed" || s === "error" || s === "cancelled" || s === "canceled") {
    return "failed";
  }
  if (s === "completed" || s === "complete" || s === "success") {
    return "completed";
  }
  if (s === "in_progress" || s === "pending" || s === "running") {
    // Non-terminal update: keep as completed=false path via fallback (usually completed
    // only when content arrives without error — Consumer still needs a terminal status).
    return fallback;
  }
  return fallback;
}

function optionalBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function resolveToolCallFields(update: Record<string, unknown>): {
  toolCallId: string;
  toolName: string;
  title?: string;
  status: "in_progress" | "completed" | "failed";
  rawInput?: Record<string, unknown>;
  redacted?: boolean;
  truncated?: boolean;
} {
  const nested = isRecord(update.toolCall) ? update.toolCall : null;
  const toolCallId = String(
    update.toolCallId ?? nested?.toolCallId ?? "",
  );
  const title =
    typeof update.title === "string"
      ? update.title
      : typeof nested?.title === "string"
        ? nested.title
        : undefined;
  const toolName = String(
    update.toolName ?? nested?.toolName ?? title ?? nested?.title ?? "tool",
  );
  const rawInputCandidate = update.rawInput ?? nested?.rawInput;
  const rawInput = isRecord(rawInputCandidate) ? rawInputCandidate : undefined;
  return {
    toolCallId,
    toolName,
    title,
    status: parseToolStatus(
      update.status ?? nested?.status,
      "in_progress",
    ),
    rawInput,
    redacted: optionalBool(update.redacted ?? nested?.redacted),
    truncated: optionalBool(update.truncated ?? nested?.truncated),
  };
}

function resolveToolResultFields(update: Record<string, unknown>): {
  toolCallId: string;
  status: "completed" | "failed";
  content?: string;
  structuredContent?: unknown;
  errorCode?: string;
  errorMessage?: string;
  redacted?: boolean;
  truncated?: boolean;
} {
  const nested = isRecord(update.toolCall) ? update.toolCall : null;
  const toolCallId = String(
    update.toolCallId ?? nested?.toolCallId ?? "",
  );
  const errorObj = isRecord(update.error)
    ? update.error
    : isRecord(nested?.error)
      ? nested.error
      : null;
  const errorCode =
    typeof update.errorCode === "string"
      ? update.errorCode
      : typeof errorObj?.code === "string"
        ? errorObj.code
        : typeof errorObj?.error_code === "string"
          ? errorObj.error_code
          : undefined;
  const errorMessage =
    typeof update.errorMessage === "string"
      ? update.errorMessage
      : typeof errorObj?.message === "string"
        ? errorObj.message
        : undefined;
  const hasError = Boolean(errorCode || errorMessage);
  const content = extractText(update) || undefined;
  const structuredContent =
    update.structuredContent !== undefined
      ? update.structuredContent
      : nested?.structuredContent !== undefined
        ? nested.structuredContent
        : undefined;
  return {
    toolCallId,
    status: parseResultStatus(
      update.status ?? nested?.status,
      hasError ? "failed" : "completed",
    ),
    content,
    structuredContent,
    errorCode,
    errorMessage,
    redacted: optionalBool(update.redacted ?? nested?.redacted),
    truncated: optionalBool(update.truncated ?? nested?.truncated),
  };
}

export function mapAcpSessionUpdate(input: {
  turnId: string;
  sessionId: string;
  params: Record<string, unknown>;
}): RemoteExpertSemanticEvent[] {
  const update = resolveUpdate(input.params);
  const kind = String(
    update.sessionUpdate ??
      input.params.sessionUpdate ??
      (isRecord(input.params.update)
        ? input.params.update.sessionUpdate
        : undefined) ??
      update.type ??
      "",
  );
  if (kind === "agent_message_chunk") {
    const text = extractText(update.content && isRecord(update.content) ? update.content : update);
    if (isRecord(update.content) && update.content.type === "resource_link") {
      return [];
    }
    if (text) {
      return [{ type: "assistant.delta", turnId: input.turnId, text }];
    }
    return [];
  }
  if (kind === "agent_message") {
    // Full-message snapshot is reconciliation authority — never a second append.
    const text = extractText(update.content && isRecord(update.content) ? update.content : update);
    if (isRecord(update.content) && update.content.type === "resource_link") {
      return [];
    }
    if (text) {
      return [{ type: "assistant.snapshot", turnId: input.turnId, text }];
    }
    return [];
  }
  if (kind === "agent_thought_chunk") {
    const text = extractText(isRecord(update.content) ? update.content : update);
    return text
      ? [{ type: "reasoning.delta", turnId: input.turnId, text }]
      : [];
  }
  if (kind === "tool_call") {
    const fields = resolveToolCallFields(update);
    if (!fields.toolCallId.trim()) return [];
    return [
      {
        type: "tool.call",
        turnId: input.turnId,
        toolCallId: fields.toolCallId,
        toolName: fields.toolName,
        title: fields.title,
        status: fields.status,
        rawInput: fields.rawInput,
        redacted: fields.redacted,
        truncated: fields.truncated,
      },
    ];
  }
  if (kind === "tool_call_update") {
    const fields = resolveToolResultFields(update);
    if (!fields.toolCallId.trim()) return [];
    return [
      {
        type: "tool.result",
        turnId: input.turnId,
        toolCallId: fields.toolCallId,
        status: fields.status,
        content: fields.content,
        structuredContent: fields.structuredContent,
        errorCode: fields.errorCode,
        errorMessage: fields.errorMessage,
        redacted: fields.redacted,
        truncated: fields.truncated,
      },
    ];
  }
  return [];
}

export function collectArtifactResourceLinks(
  value: unknown,
  acc: Array<{ uri: string; name?: string; downloadPath?: string }> = [],
): Array<{ uri: string; name?: string; downloadPath?: string }> {
  if (Array.isArray(value)) {
    for (const item of value) collectArtifactResourceLinks(item, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (
      rec.type === "resource_link" &&
      typeof rec.uri === "string" &&
      rec.uri.startsWith("nodeskclaw://artifact/")
    ) {
      acc.push({
        uri: rec.uri,
        name: typeof rec.name === "string" ? rec.name : undefined,
        downloadPath:
          typeof rec.downloadPath === "string" ? rec.downloadPath : undefined,
      });
    }
    for (const nested of Object.values(rec)) {
      collectArtifactResourceLinks(nested, acc);
    }
  }
  return acc;
}
