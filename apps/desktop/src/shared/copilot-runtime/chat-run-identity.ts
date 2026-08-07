/**
 * Canonical Chat Run identity (PRD §7).
 * Execution requests use instanceId; profileId is display/compat only.
 */
export type ChatRunIdentity = {
  instanceId: string;
  /** Compatibility / display only — do not use for Serve execution routes. */
  profileId?: string;
  sessionId: string | null;
};
