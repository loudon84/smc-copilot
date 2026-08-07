/** Auth token provider for Runtime HTTP client (Main process only). */
export type RuntimeAuthProvider = () => string | null | undefined;

export type RuntimeLegacyTokenProvider = () => string | null | undefined;

export interface RuntimeClientAuthOptions {
  /** Device pairing Bearer token. */
  getDeviceToken?: RuntimeAuthProvider;
  /** Deprecated X-Copilot-Desktop-Token bridge. */
  getLegacyToken?: RuntimeLegacyTokenProvider;
}
