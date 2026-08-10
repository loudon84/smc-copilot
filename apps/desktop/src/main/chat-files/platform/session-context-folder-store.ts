/**
 * PRD v1.6 FR-10 — Desktop Chat path no longer opens Hermes state.db.
 * Context folder ownership moved to Runtime session_chat_settings.
 * These helpers are no-ops / null for legacy callers (e.g. file-service).
 */

/** @deprecated Use Runtime chat-settings PATCH. */
export function setSessionContextFolder(
  _sessionId: string,
  _folder: string | null,
): void {
  // no-op — Runtime owns persistence
}

/** @deprecated Use Runtime chat-settings GET. */
export function getSessionContextFolder(_sessionId: string): string | null {
  return null;
}

/** @deprecated Use Runtime chat-settings. */
export function getSessionContextFolders(
  _sessionIds: string[],
): Map<string, string> {
  return new Map();
}
