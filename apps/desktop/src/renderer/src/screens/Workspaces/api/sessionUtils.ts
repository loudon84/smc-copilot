/** 本地草稿 session 前缀（勿传给 Hermes resume） */
export const LOCAL_SESSION_PREFIX = "session-";

export function isPersistedSessionId(sessionId: string | null | undefined): boolean {
  if (!sessionId || !sessionId.trim()) return false;
  if (sessionId.startsWith(LOCAL_SESSION_PREFIX)) return false;
  return true;
}

export function resumeSessionIdForApi(sessionId: string | null | undefined): string | undefined {
  if (!isPersistedSessionId(sessionId)) return undefined;
  return sessionId as string;
}
