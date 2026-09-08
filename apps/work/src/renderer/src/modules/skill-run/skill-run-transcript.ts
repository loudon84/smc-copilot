/**
 * Pure Skill Chat transcript adapter: optimistic, live, and history cards
 * share one clientRequestId identity.
 */

import {
  isSkillRunTerminalPhase,
  type SkillRunActivityItem,
  type SkillRunProjection,
  type SkillRunToolCallStatus,
} from "../../../../shared/skill-run";
import type { ChatMessage, SkillRunMessage } from "../../screens/Chat/types";

export function skillRunUserMessageId(clientRequestId: string): string {
  return `skill-run:${clientRequestId}:user`;
}

export function skillRunCardMessageId(clientRequestId: string): string {
  return `skill-run:${clientRequestId}`;
}

export function compactSkillRunActivities(
  items: ReadonlyArray<SkillRunActivityItem>,
): SkillRunActivityItem[] {
  const byEventId = new Map<string, SkillRunActivityItem>();
  for (const item of items) {
    if (!byEventId.has(item.eventId)) {
      byEventId.set(item.eventId, item);
    }
  }
  const deduped = Array.from(byEventId.values());
  const output: SkillRunActivityItem[] = [];
  const toolIndexByCall = new Map<string, number>();
  for (const item of deduped) {
    if (item.kind === "tool.call" && item.callId) {
      const existing = toolIndexByCall.get(item.callId);
      if (existing === undefined) {
        toolIndexByCall.set(item.callId, output.length);
        output.push(item);
        continue;
      }
      if (rankToolStatus(item.status) >= rankToolStatus(output[existing]?.status)) {
        output[existing] = item;
      }
      continue;
    }
    output.push(item);
  }
  return output;
}

function rankToolStatus(status: SkillRunToolCallStatus | undefined): number {
  if (status === "failed") return 3;
  if (status === "completed") return 2;
  if (status === "started") return 1;
  return 0;
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
    activities: compactSkillRunActivities(projection.activities ?? []),
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
  const user: ChatMessage = {
    id: skillRunUserMessageId(input.clientRequestId),
    role: "user",
    content: input.prompt,
    timestamp: Date.now(),
  };
  const card: SkillRunMessage = {
    id: skillRunCardMessageId(input.clientRequestId),
    kind: "skill_run",
    role: "agent",
    clientRequestId: input.clientRequestId,
    toolName: input.toolName,
    phase: "pending-submit",
    displayStage: "Submitting skill request...",
    activities: [],
    pending: true,
  };
  return [user, card];
}

export function patchSkillRunCard(
  messages: ReadonlyArray<ChatMessage>,
  clientRequestId: string,
  patch: Partial<SkillRunMessage>,
): ChatMessage[] {
  return messages.map((message) => {
    if (
      "kind" in message &&
      message.kind === "skill_run" &&
      message.clientRequestId === clientRequestId
    ) {
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
    if (
      "kind" in message &&
      message.kind === "skill_run" &&
      message.clientRequestId === card.clientRequestId
    ) {
      replaced = true;
      return card;
    }
    return message;
  });
  return replaced ? next : [...next, card];
}

export function applySkillRunProjectionsToMessages(
  messages: ReadonlyArray<ChatMessage>,
  projections: ReadonlyArray<SkillRunProjection>,
): ChatMessage[] {
  let next = [...messages];
  for (const projection of projections) {
    next = upsertSkillRunCard(next, projectionToSkillRunMessage(projection));
  }
  return next;
}

export function rejectSkillRunCard(
  messages: ReadonlyArray<ChatMessage>,
  clientRequestId: string,
  errorMessage: string,
): ChatMessage[] {
  return patchSkillRunCard(messages, clientRequestId, {
    phase: "failed",
    displayStage: "Skill execution failed",
    errorMessage,
    pending: false,
  });
}
