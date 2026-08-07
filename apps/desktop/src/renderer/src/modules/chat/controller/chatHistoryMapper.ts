import type { ChatHistoryMessage } from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatSessionMessage } from "../ports/ChatSessionPort";
import type { ChatViewItem } from "./chatViewTypes";

/** Session DB / SessionPort messages → ChatViewItem[] */
export function sessionMessagesToViewItems(
  messages: ChatSessionMessage[],
): ChatViewItem[] {
  return messages.map((m, index) => {
    const role = m.role.toLowerCase();
    const id = m.id || `hist-${index}-${role}`;
    if (role === "user") {
      return {
        id,
        kind: "user" as const,
        content: m.content,
        timestamp: m.timestamp,
      };
    }
    if (role === "assistant" || role === "agent") {
      return {
        id,
        kind: "assistant" as const,
        content: m.content,
        timestamp: m.timestamp,
      };
    }
    if (m.kind === "reasoning") {
      return {
        id,
        kind: "reasoning" as const,
        content: m.content,
      };
    }
    return {
      id,
      kind: "assistant" as const,
      content: m.content,
      timestamp: m.timestamp,
    };
  });
}

/** ChatViewItem[] → Hermes history payload (user/assistant text only). */
export function viewItemsToHistory(items: ChatViewItem[]): ChatHistoryMessage[] {
  const history: ChatHistoryMessage[] = [];
  for (const item of items) {
    if (item.kind === "user") {
      history.push({ role: "user", content: item.content });
    } else if (item.kind === "assistant" && item.content.trim()) {
      history.push({ role: "assistant", content: item.content });
    }
  }
  return history;
}

/**
 * History for the next submit: current committed messages, excluding
 * any still-pending assistant placeholder that belongs to this send.
 */
export function historyForSubmit(items: ChatViewItem[]): ChatHistoryMessage[] {
  return viewItemsToHistory(
    items.filter((m) => !(m.kind === "assistant" && m.pending)),
  );
}
