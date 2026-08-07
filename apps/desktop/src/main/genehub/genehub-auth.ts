import { getCachedAccessToken, readStoredSessionSync } from "../auth/token-store";

export interface GeneHubAuthState {
  authenticated: boolean;
  tokenPresent: boolean;
  memberVerified: boolean;
  userDisplayName: string | null;
  userId?: string;
  organizationId?: string;
}

export function getGeneHubAuthState(): GeneHubAuthState {
  const token = getCachedAccessToken();
  const session = readStoredSessionSync();

  if (!token || !session) {
    return {
      authenticated: false,
      tokenPresent: false,
      memberVerified: false,
      userDisplayName: null,
    };
  }

  const memberVerified = Boolean(
    session.user.currentOrgId && session.user.portalOrgRole,
  );

  return {
    authenticated: true,
    tokenPresent: true,
    memberVerified,
    userDisplayName:
      session.user.displayName || session.user.username || session.user.email || null,
    userId: session.user.id,
    organizationId: session.user.currentOrgId,
  };
}

export function getGeneHubAccessToken(): string | null {
  return getCachedAccessToken();
}
