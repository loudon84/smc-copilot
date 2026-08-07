import type { RecentHermesTask } from "../../shared/hermes-client/hermes-client-contract";

export interface HermesTaskHints {
  taskId?: string;
  eventUrl?: string;
  eventTokenUrl?: string;
  resultUrl?: string;
  artifactUrl?: string;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function readStructuredContent(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const obj = result as Record<string, unknown>;
  const structured =
    obj.structuredContent ??
    obj.structured_content ??
    (obj.content && typeof obj.content === "object"
      ? (obj.content as Record<string, unknown>).structuredContent
      : undefined);
  if (structured && typeof structured === "object") {
    return structured as Record<string, unknown>;
  }
  return null;
}

export function extractTaskHintsFromToolResult(result: unknown): HermesTaskHints {
  const structured = readStructuredContent(result);
  if (!structured) return {};

  return {
    taskId: readString(structured.task_id ?? structured.taskId),
    eventUrl: readString(structured.event_url ?? structured.eventUrl),
    eventTokenUrl: readString(structured.event_token_url ?? structured.eventTokenUrl),
    resultUrl: readString(structured.result_url ?? structured.resultUrl),
    artifactUrl: readString(structured.artifact_url ?? structured.artifactUrl),
  };
}

export function taskHintsToRecentTask(
  hints: HermesTaskHints,
  context?: { toolName?: string; agentAlias?: string; profileName?: string },
): RecentHermesTask | null {
  if (!hints.taskId) return null;
  return {
    taskId: hints.taskId,
    toolName: context?.toolName,
    agentAlias: context?.agentAlias,
    profileName: context?.profileName,
    eventUrl: hints.eventUrl,
    eventTokenUrl: hints.eventTokenUrl,
    resultUrl: hints.resultUrl,
    createdAt: new Date().toISOString(),
  };
}
