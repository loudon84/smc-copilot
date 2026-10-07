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

function resolveToolCallFields(update: Record<string, unknown>): {
  toolCallId: string;
  toolName: string;
  title?: string;
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
    update.toolName ?? title ?? nested?.title ?? "tool",
  );
  return { toolCallId, toolName, title };
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
  if (kind === "agent_message_chunk" || kind === "agent_message") {
    const text = extractText(update.content && isRecord(update.content) ? update.content : update);
    if (isRecord(update.content) && update.content.type === "resource_link") {
      return [];
    }
    if (text) {
      return [{ type: "assistant.delta", turnId: input.turnId, text }];
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
    return [
      {
        type: "tool.call",
        turnId: input.turnId,
        toolCallId: fields.toolCallId,
        toolName: fields.toolName,
        title: fields.title,
      },
    ];
  }
  if (kind === "tool_call_update") {
    const fields = resolveToolCallFields(update);
    return [
      {
        type: "tool.result",
        turnId: input.turnId,
        toolCallId: fields.toolCallId,
        content: extractText(update),
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
