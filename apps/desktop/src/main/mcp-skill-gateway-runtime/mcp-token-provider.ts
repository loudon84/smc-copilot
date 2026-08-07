import { getCachedAccessToken, readStoredSessionSync } from "../auth/token-store";

export interface McpAuthState {
  authenticated: boolean;
  tokenPresent: boolean;
  tokenPreview?: string;
  userId?: string;
  organizationId?: string;
}

function previewToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function getMcpAuthState(): McpAuthState {
  const token = getCachedAccessToken();
  const session = readStoredSessionSync();

  if (!token) {
    return {
      authenticated: false,
      tokenPresent: false,
    };
  }

  return {
    authenticated: true,
    tokenPresent: true,
    tokenPreview: previewToken(token),
    userId: session?.user.id,
    organizationId: session?.user.currentOrgId,
  };
}

export function getMcpAccessToken(): string | null {
  return getCachedAccessToken();
}
