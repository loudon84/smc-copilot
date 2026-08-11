export interface AuthEndpointConfig {
  backendUrl: string;
  authPrefix: string;
  aiosHomeUrl: string;
}

export interface LoginInput {
  endpointConfig: AuthEndpointConfig;
  account?: string;
  password: string;
  /**
   * Legacy compatibility.
   * Do not use in new UI.
   */
  email?: string;
}

export interface DesktopAuthUser {
  id: string;
  username: string;
  displayName?: string;
  tenantId?: string;

  email?: string;
  phone?: string;
  avatarUrl?: string;

  currentOrgId?: string;
  orgRole?: string | null;
  portalOrgRole?: string | null;

  isSuperAdmin?: boolean;
  mustChangePassword?: boolean;
}

export interface DesktopAuthState {
  authenticated: boolean;
  endpointConfig: AuthEndpointConfig | null;
  user: DesktopAuthUser | null;
  expiresAt: string | null;
}

/** @deprecated Use DesktopAuthState — kept for migration references */
export interface PublicAuthSession {
  userId: string;
  username: string;
  displayName: string;
  tenantId: string;
  tenantName?: string;
  accessTokenExpiresAt: string;
}

export interface StoredAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType: "Bearer";
  user: DesktopAuthUser;
}

/** @deprecated Use StoredAuthSession */
export interface InternalAuthSession extends PublicAuthSession {
  accessToken: string;
  refreshToken?: string;
}

export interface DesktopAuthAPI {
  getState(): Promise<DesktopAuthState>;
  saveEndpointConfig(config: AuthEndpointConfig): Promise<AuthEndpointConfig>;
  login(input: LoginInput): Promise<DesktopAuthState>;
  logout(): Promise<DesktopAuthState>;
  refresh(): Promise<DesktopAuthState>;
}

export function toPublicState(
  session: StoredAuthSession | null,
  endpointConfig: AuthEndpointConfig | null,
): DesktopAuthState {
  if (!session) {
    return {
      authenticated: false,
      endpointConfig,
      user: null,
      expiresAt: null,
    };
  }
  return {
    authenticated: true,
    endpointConfig,
    user: session.user,
    expiresAt: session.expiresAt ?? null,
  };
}

/** Maps legacy internal session shape to StoredAuthSession */
export function internalToStored(session: InternalAuthSession): StoredAuthSession {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.accessTokenExpiresAt,
    tokenType: "Bearer",
    user: {
      id: session.userId,
      username: session.username,
      displayName: session.displayName,
      tenantId: session.tenantId,
    },
  };
}

/** @deprecated Use toPublicState */
export function toPublicSession(session: InternalAuthSession): PublicAuthSession {
  return {
    userId: session.userId,
    username: session.username,
    displayName: session.displayName,
    tenantId: session.tenantId,
    tenantName: session.tenantName,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
  };
}
