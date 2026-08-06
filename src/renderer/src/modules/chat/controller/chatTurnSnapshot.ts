/** v8.0.5 — full turn request snapshot for Queue + Retry. */

import type { ChatInvocationSource } from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatAttachmentState } from "./chatViewTypes";

export type ChatTurnRequestSnapshot = {
  turnId: string;
  rawText: string;
  effectiveText: string;
  attachments: ChatAttachmentState[];
  sessionId: string | null;
  profileId: string;
  modelId: string | null;
  expertId?: string;
  teamId?: string;
  expertRunId?: string;
  skillName?: string;
  workMode?: string;
  permissionMode?: string;
  invocationSource: ChatInvocationSource;
  promptHintMode?: "auto" | "custom" | "disabled";
  createdAt: number;
};

export function createTurnSnapshot(
  partial: Omit<ChatTurnRequestSnapshot, "createdAt"> & { createdAt?: number },
): ChatTurnRequestSnapshot {
  return {
    ...partial,
    attachments: partial.attachments.map((a) => ({ ...a })),
    createdAt: partial.createdAt ?? Date.now(),
  };
}
