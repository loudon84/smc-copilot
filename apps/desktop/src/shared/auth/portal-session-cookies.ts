/** NextAuth / Auth.js session cookie names we persist for aios-home. */
export const PORTAL_SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

export function isPortalSessionCookieName(name: string): boolean {
  if (PORTAL_SESSION_COOKIE_NAMES.includes(name as (typeof PORTAL_SESSION_COOKIE_NAMES)[number])) {
    return true;
  }
  return name.startsWith("next-auth.") || name.startsWith("__Secure-next-auth.");
}

export interface PersistedPortalCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
}
