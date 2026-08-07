/**
 * Ephemeral Session File Context for the wire message only.
 * Does not mutate UI/history text — callers keep the original `message` for display + dual-write.
 */

import { buildSessionFileContext } from "./file-context-builder";

const QUERY_MAX_CHARS = 200;

/**
 * Prepend session context-file XML to the user message when a session has
 * `context-file` associations. Returns the original message when empty/unavailable.
 */
// @lat: [[session-file-context#Wire injection on send]]
export async function composeWireMessageWithSessionContext(
  message: string,
  options: {
    profile?: string;
    sessionId?: string | null;
  },
): Promise<string> {
  const sessionId = options.sessionId?.trim();
  if (!sessionId) return message;

  try {
    const query = message.trim().slice(0, QUERY_MAX_CHARS);
    const result = await buildSessionFileContext({
      profile: options.profile,
      sessionId,
      query: query || undefined,
    });
    const contextText = result.text.trim();
    if (!contextText) return message;
    return `${contextText}\n\n${message}`;
  } catch (err) {
    console.warn("[files] Failed to build session file context:", err);
    return message;
  }
}
