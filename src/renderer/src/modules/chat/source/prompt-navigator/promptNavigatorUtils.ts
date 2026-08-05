// @lat: [[prompt-navigator#Conversation Prompt Navigator]]
import type { ChatBubbleMessage, ChatMessage } from "../types";

export interface PromptNavigationItem {
  messageId: string;
  sequence: number;
  label: string;
  fullText: string;
  attachmentCount: number;
  timestamp?: number;
}

export function isUserBubble(
  message: ChatMessage,
): message is ChatBubbleMessage {
  const kind = message.kind;
  return message.role === "user" && (!kind || kind === "user");
}

export function normalizePromptLabel(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateLabel(content: string, maxLength = 72): string {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, maxLength - 1)}…`;
}

export function getPromptAnchorId(runId: string, messageId: string): string {
  return [
    "chat-prompt",
    encodeURIComponent(runId),
    encodeURIComponent(messageId),
  ].join("-");
}

export function buildPromptNavigationItems(
  messages: ChatMessage[],
  options?: {
    attachmentFallback?: (count: number) => string;
    emptyFallback?: string;
  },
): PromptNavigationItem[] {
  let sequence = 0;
  const attachmentFallback =
    options?.attachmentFallback ??
    ((count: number) =>
      count === 1 ? "1 attachment" : `${count} attachments`);
  const emptyFallback = options?.emptyFallback ?? "User prompt";

  return messages.flatMap((message) => {
    if (!isUserBubble(message)) {
      return [];
    }

    const attachmentCount = message.attachments?.length ?? 0;
    const normalized = normalizePromptLabel(message.content);

    if (!normalized && attachmentCount === 0) {
      return [];
    }

    sequence += 1;

    const fallback =
      attachmentCount > 0 ? attachmentFallback(attachmentCount) : emptyFallback;

    return [
      {
        messageId: message.id,
        sequence,
        label: truncateLabel(normalized || fallback),
        fullText: normalized || fallback,
        attachmentCount,
        timestamp: message.timestamp,
      },
    ];
  });
}
