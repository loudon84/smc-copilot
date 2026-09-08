/**
 * Sanitized Main → Renderer hint that the profile session cache changed.
 * Payload is sessionId + reason only — never Prompt, title, result, or paths.
 */

export const SESSION_CACHE_CHANGED_CHANNEL = "session-cache:changed" as const;

export const SESSION_CACHE_CHANGED_REASONS = [
  "created",
  "updated",
  "deleted",
] as const;

export type SessionCacheChangedReason =
  (typeof SESSION_CACHE_CHANGED_REASONS)[number];

export type SessionCacheChangedEvent = {
  sessionId: string;
  reason: SessionCacheChangedReason;
};

export type SessionCacheChangedListener = (
  event: SessionCacheChangedEvent,
) => void;

function isSessionCacheChangedReason(
  value: unknown,
): value is SessionCacheChangedReason {
  return (
    value === "created" || value === "updated" || value === "deleted"
  );
}

/** Strict guard: exactly `{ sessionId, reason }` with a non-empty id. */
export function isSessionCacheChangedEvent(
  value: unknown,
): value is SessionCacheChangedEvent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length !== 2) return false;
  if (!keys.includes("sessionId") || !keys.includes("reason")) return false;
  const sessionId = (value as { sessionId: unknown }).sessionId;
  const reason = (value as { reason: unknown }).reason;
  return (
    typeof sessionId === "string" &&
    sessionId.trim() !== "" &&
    isSessionCacheChangedReason(reason)
  );
}
