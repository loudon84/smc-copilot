/** Prompt navigator anchor id helpers (v8.0.2). */

export function getPromptAnchorId(runId: string, messageId: string): string {
  return `prompt-${runId}-${messageId}`;
}

export type PromptNavItem = {
  id: string;
  messageId: string;
  summary: string;
};

export function buildPromptNavigationItems(
  messages: Array<{ id: string; kind: string; content?: string }>,
): PromptNavItem[] {
  return messages
    .filter((m) => m.kind === "user" && (m.content || "").trim())
    .map((m) => {
      const firstLine = (m.content || "").split(/\r?\n/)[0].trim();
      return {
        id: m.id,
        messageId: m.id,
        summary: firstLine.slice(0, 80) || "(empty)",
      };
    });
}
