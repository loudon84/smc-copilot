/**
 * Skill Run Native transcript adapter: optimistic, live, and history turns
 * share one clientRequestId identity on existing ChatMessage rows.
 */

import {
  compactSkillRunActivityItems,
  isSkillRunTerminalPhase,
  projectSkillRunActivitiesToNativeRows,
  skillRunNativeAssistantMessageId,
  skillRunNativeUserMessageId,
  type SkillRunNativeActivityRow,
  type SkillRunProjection,
  type SkillRunToolCallStatus,
} from "../../../../shared/skill-run";
import type {
  ChatBubbleMessage,
  ChatMessage,
  ReasoningMessage,
  SkillRunMessage,
  ToolCallMessage,
} from "../../screens/Chat/types";

export const skillRunUserMessageId = skillRunNativeUserMessageId;
export const compactSkillRunActivities = compactSkillRunActivityItems;

export function skillRunCardMessageId(clientRequestId: string): string {
  return `skill-run:${clientRequestId}`;
}

export function projectionToSkillRunMessage(
  projection: SkillRunProjection,
): SkillRunMessage {
  return {
    id: skillRunCardMessageId(projection.clientRequestId),
    kind: "skill_run",
    role: "agent",
    clientRequestId: projection.clientRequestId,
    providerRunId: projection.providerRunId,
    toolName: projection.toolName,
    phase: projection.phase,
    displayStage: projection.displayStage,
    activities: compactSkillRunActivityItems(projection.activities ?? []),
    resultText: projection.text,
    errorCode: projection.errorCode,
    errorMessage: projection.errorMessage,
    pending: !isSkillRunTerminalPhase(projection.phase),
    auditComplete: true,
    artifactFileIds: (projection.artifacts ?? []).map((item) => item.id),
  };
}

export function createOptimisticSkillRunTurn(input: {
  prompt: string;
  clientRequestId: string;
  toolName: string;
}): ChatMessage[] {
  const user: ChatBubbleMessage = {
    id: skillRunNativeUserMessageId(input.clientRequestId),
    kind: "user",
    role: "user",
    content: input.prompt,
    timestamp: Date.now(),
  };
  const assistant: ChatBubbleMessage = {
    id: skillRunNativeAssistantMessageId(input.clientRequestId),
    kind: "assistant",
    role: "agent",
    content: "Submitting skill request...",
    pending: true,
    timestamp: Date.now(),
  };
  return [user, assistant];
}

function isSkillRunCard(
  message: ChatMessage,
  clientRequestId: string,
): message is SkillRunMessage {
  return (
    "kind" in message &&
    message.kind === "skill_run" &&
    message.clientRequestId === clientRequestId
  );
}

export function ownsSkillRunTurnMessage(
  message: ChatMessage,
  clientRequestId: string,
): boolean {
  if (isSkillRunCard(message, clientRequestId)) return true;
  const id = message.id;
  return (
    id === skillRunNativeUserMessageId(clientRequestId) ||
    id === skillRunNativeAssistantMessageId(clientRequestId) ||
    id.startsWith(`skill-run:${clientRequestId}:activity:`) ||
    id.startsWith(`skill-run:${clientRequestId}:tool:`)
  );
}

function toolStatus(
  status: SkillRunToolCallStatus | undefined,
): ToolCallMessage["status"] {
  if (status === "failed") return "failed";
  if (status === "completed") return "completed";
  return "running";
}

function nativeRowToMessage(row: SkillRunNativeActivityRow): ChatMessage {
  switch (row.kind) {
    case "reasoning": {
      const message: ReasoningMessage = {
        id: row.id,
        kind: "reasoning",
        role: "agent",
        text: row.summary ?? "",
      };
      return message;
    }
    case "tool_call": {
      const message: ToolCallMessage = {
        id: row.id,
        kind: "tool_call",
        role: "agent",
        callId: row.callId ?? row.eventId,
        name: row.toolName ?? "tool",
        args: "",
        status: toolStatus(row.status),
      };
      return message;
    }
    case "notice": {
      const message: ChatBubbleMessage = {
        id: row.id,
        kind: "assistant",
        role: "agent",
        content: row.question ?? row.summary ?? "Skill run needs input",
        localOnly: true,
      };
      return message;
    }
    default: {
      const exhaustive: never = row.kind;
      return exhaustive;
    }
  }
}

function assistantFromProjection(
  projection: SkillRunProjection,
  existing?: ChatMessage,
): ChatBubbleMessage {
  const prior =
    existing && (!("kind" in existing) || existing.kind === "assistant")
      ? (existing as ChatBubbleMessage)
      : undefined;
  const sealed = isSkillRunTerminalPhase(projection.phase);
  const content =
    projection.text ||
    (sealed ? "" : projection.displayStage) ||
    prior?.content ||
    "";
  return {
    id: skillRunNativeAssistantMessageId(projection.clientRequestId),
    kind: "assistant",
    role: "agent",
    content,
    error: projection.errorMessage,
    pending: !sealed,
  };
}

export function patchSkillRunCard(
  messages: ReadonlyArray<ChatMessage>,
  clientRequestId: string,
  patch: Partial<SkillRunMessage>,
): ChatMessage[] {
  return messages.map((message) => {
    if (isSkillRunCard(message, clientRequestId)) {
      return { ...message, ...patch, id: message.id, clientRequestId };
    }
    return message;
  });
}

export function upsertSkillRunCard(
  messages: ReadonlyArray<ChatMessage>,
  card: SkillRunMessage,
): ChatMessage[] {
  let replaced = false;
  const next = messages.map((message) => {
    if (isSkillRunCard(message, card.clientRequestId)) {
      replaced = true;
      return card;
    }
    return message;
  });
  return replaced ? next : [...next, card];
}

function replaceSkillRunTurn(
  messages: ReadonlyArray<ChatMessage>,
  clientRequestId: string,
  turn: ChatMessage[],
): ChatMessage[] {
  const kept: ChatMessage[] = [];
  let insertAt = messages.length;
  let placed = false;
  for (const message of messages) {
    if (ownsSkillRunTurnMessage(message, clientRequestId)) {
      if (!placed) {
        insertAt = kept.length;
        placed = true;
      }
      continue;
    }
    kept.push(message);
  }
  if (!placed) insertAt = kept.length;
  kept.splice(insertAt, 0, ...turn);
  return kept;
}

export function applySkillRunProjectionsToMessages(
  messages: ReadonlyArray<ChatMessage>,
  projections: ReadonlyArray<SkillRunProjection>,
): ChatMessage[] {
  let next = [...messages];
  for (const projection of projections) {
    const clientRequestId = projection.clientRequestId;
    const existingUser = next.find(
      (message) => message.id === skillRunNativeUserMessageId(clientRequestId),
    );
    const existingAssistant = next.find(
      (message) =>
        message.id === skillRunNativeAssistantMessageId(clientRequestId),
    );
    const user: ChatBubbleMessage = {
      id: skillRunNativeUserMessageId(clientRequestId),
      kind: "user",
      role: "user",
      content:
        existingUser && "content" in existingUser
          ? existingUser.content
          : projection.promptSummary,
    };
    const turn: ChatMessage[] = [
      user,
      ...projectSkillRunActivitiesToNativeRows(
        clientRequestId,
        projection.activities ?? [],
      ).map(nativeRowToMessage),
      assistantFromProjection(projection, existingAssistant),
    ];
    next = replaceSkillRunTurn(next, clientRequestId, turn);
  }
  return next;
}

export function rejectSkillRunCard(
  messages: ReadonlyArray<ChatMessage>,
  clientRequestId: string,
  errorMessage: string,
): ChatMessage[] {
  if (messages.some((message) => isSkillRunCard(message, clientRequestId))) {
    return patchSkillRunCard(messages, clientRequestId, {
      phase: "failed",
      displayStage: "Skill execution failed",
      errorMessage,
      pending: false,
    });
  }
  const existingAssistant = messages.find(
    (message) =>
      message.id === skillRunNativeAssistantMessageId(clientRequestId),
  );
  const failed: ChatBubbleMessage = {
    id: skillRunNativeAssistantMessageId(clientRequestId),
    kind: "assistant",
    role: "agent",
    content: "",
    error: errorMessage,
    pending: false,
  };
  if (existingAssistant) {
    return messages.map((message) =>
      message.id === failed.id ? failed : message,
    );
  }
  return [...messages, failed];
}
