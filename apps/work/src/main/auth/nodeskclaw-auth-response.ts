import type { DesktopAuthUser, StoredAuthSession } from "../../shared/auth/auth-contract";

export interface NodeDeskClawApiResponse<T> {
  code: number;
  error_code?: number | null;
  message_key?: string | null;
  message: string;
  data: T | null;
}

export interface NodeDeskClawUserInfo {
  id: string;
  username?: string;
  email?: string;
  name?: string;
  phone?: string;
  avatar_url?: string;
  current_org_id?: string;
  org_role?: string | null;
  portal_org_role?: string | null;
  is_super_admin?: boolean;
  must_change_password?: boolean;
  is_active?: boolean;
}

export interface NodeDeskClawLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: NodeDeskClawUserInfo;
}

export interface NodeDeskClawTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export function unwrapNodeDeskClawResponse<T>(body: unknown): T {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid response body");
  }

  const resp = body as Partial<NodeDeskClawApiResponse<T>>;

  if (typeof resp.code === "number") {
    if (resp.code !== 0) {
      throw new Error(resp.message || resp.message_key || "Request failed");
    }

    if (resp.data == null) {
      throw new Error("Invalid response: missing data");
    }

    return resp.data;
  }

  return body as T;
}

export function mapNodeDeskClawUser(user: NodeDeskClawUserInfo): DesktopAuthUser {
  const username = user.username ?? user.email ?? user.id;
  return {
    id: user.id,
    username,
    displayName: user.name ?? username,
    tenantId: user.current_org_id,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    currentOrgId: user.current_org_id,
    orgRole: user.org_role ?? null,
    portalOrgRole: user.portal_org_role ?? null,
    isSuperAdmin: user.is_super_admin,
    mustChangePassword: user.must_change_password,
  };
}

export function mapNodeDeskClawSession(
  loginData: NodeDeskClawLoginResponse,
  me: NodeDeskClawUserInfo,
): StoredAuthSession {
  const expiresAt =
    loginData.expires_in > 0
      ? new Date(Date.now() + loginData.expires_in * 1000).toISOString()
      : undefined;

  return {
    accessToken: loginData.access_token,
    refreshToken: loginData.refresh_token,
    expiresAt,
    tokenType: "Bearer",
    user: mapNodeDeskClawUser(me),
  };
}

export function assertMember(user: NodeDeskClawUserInfo): void {
  if (user.is_active === false) {
    throw new Error("当前账号已被禁用");
  }

  if (!user.current_org_id) {
    throw new Error("当前账号未加入任何组织，无法登录 Desktop");
  }

  if (!user.portal_org_role) {
    throw new Error("当前账号不是组织成员，无法登录 Desktop");
  }
}
