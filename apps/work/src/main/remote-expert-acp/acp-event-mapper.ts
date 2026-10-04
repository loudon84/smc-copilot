import type { RemoteExpertSemanticEvent } from "../../shared/remote-expert-acp/events";
import { emitRemoteExpertDiagnostic } from "./diagnostics";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mapAcpSessionUpdate(input: {
  turnId: string;
  sessionId: string;
  params: Record<string, unknown>;
}): RemoteExpertSemanticEvent[] {
  const update = isRecord(input.params.sessionUpdate)
    ? input.params.sessionUpdate
    : input.params;
  const kind = String(update.sessionUpdate ?? update.type ?? "");
  const events: RemoteExpertSemanticEvent[] = [];
  if (kind === "agent_message_chunk" || kind === "agent_message") {
    const text = extractText(update);
    if (text) events.push({ type: "assistant.delta", turnId: input.turnId, text });
    return events;
  }
  if (kind === "agent_thought_chunk") {
    const text = extractText(update);
    if (text) events.push({ type: "reasoning.delta", turnId: input.turnId, text });
    return events;
  }
  if (kind === "tool_call") {
    events.push({
      type: "tool.call",
      turnId: input.turnId,
      toolCallId: String(update.toolCallId ?? update.tool_call_id ?? ""),
      toolName: String(update.toolName ?? update.title ?? "tool"),
      title: typeof update.title === "string" ? update.title : undefined,
    });
    return events;
  }
  if (kind === "tool_call_update") {
    events.push({
      type: "tool.result",
      turnId: input.turnId,
      toolCallId: String(update.toolCallId ?? update.tool_call_id ?? ""),
      content: extractText(update),
    });
    return events;
  }
  if (kind === "resource_link" || update.type === "resource_link") {
    return events;
  }
  if (kind === "end_turn" || update.stopReason === "end_turn") {
    return events;
  }
  emitRemoteExpertDiagnostic({
    name: "remote_expert.error",
    trace_id: input.turnId,
    error_code: "ACP_PROTOCOL_ERROR",
  });
  return events;
}

export function collectNodeskclawArtifactUris(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string" && value.startsWith("nodeskclaw://artifact/")) {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNodeskclawArtifactUris(item, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectNodeskclawArtifactUris(nested, acc);
    }
  }
  return acc;
}

function extractText(update: Record<string, unknown>): string {
  const content = update.content;
  if (typeof update.text === "string") return update.text;
  if (isRecord(content) && typeof content.text === "string") return content.text;
  if (Array.isArray(content)) {
    return content
      .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
      .join("");
  }
  return "";
}

export function mapResumeError(err: unknown): "forbidden" | "not_found" | "mismatch" | "temp" {
  const code = err instanceof Error ? err.message : String(err);
  const symbol =
    err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : code;
  if (symbol.includes("RESUME_FORBIDDEN") || symbol.includes("FORBIDDEN")) return "forbidden";
  if (symbol.includes("NOT_FOUND")) return "not_found";
  if (symbol.includes("AGENT_MISMATCH") || symbol.includes("PROFILE_MISMATCH")) return "mismatch";
  return "temp";
}
