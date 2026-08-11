import type {
  AuthEndpointConfig,
  LoginInput,
  StoredAuthSession,
} from "../../shared/auth/auth-contract";
import { buildAuthUrl } from "./auth-url";
import {
  assertMember,
  mapNodeDeskClawSession,
  type NodeDeskClawLoginResponse,
  type NodeDeskClawTokenResponse,
  type NodeDeskClawUserInfo,
  unwrapNodeDeskClawResponse,
} from "./nodeskclaw-auth-response";

export interface AuthClient {
  login(input: LoginInput): Promise<StoredAuthSession>;
  refresh(
    endpointConfig: AuthEndpointConfig,
    refreshToken: string,
  ): Promise<StoredAuthSession>;
  logout(endpointConfig: AuthEndpointConfig, accessToken: string): Promise<void>;
}

/** Only Vitests/debug pipelines explicitly set `HERMES_USE_MOCK_AUTH=true`; Desktop Login otherwise always uses HTTP against your configured Portal backend + authPrefix. */
function useMockAuth(): boolean {
  return process.env.HERMES_USE_MOCK_AUTH === "true";
}

function resolveAccount(input: LoginInput): string {
  const account = input.account?.trim() || input.email?.trim();
  if (!account) {
    throw new Error("Account is required");
  }
  return account;
}

class MockAuthClient implements AuthClient {
  async login(input: LoginInput): Promise<StoredAuthSession> {
    const account = resolveAccount(input);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return {
      user: {
        id: "mock-user-1",
        username: account,
        displayName: account,
        tenantId: "default-org",
        currentOrgId: "default-org",
        portalOrgRole: "member",
        orgRole: "member",
      },
      expiresAt: expires,
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      tokenType: "Bearer",
    };
  }

  async refresh(
    _endpointConfig: AuthEndpointConfig,
    refreshToken: string,
  ): Promise<StoredAuthSession> {
    if (!refreshToken) throw new Error("Missing refresh token");
    return this.login({
      endpointConfig: _endpointConfig,
      account: "mock@example.com",
      password: "",
    });
  }

  async logout(_endpointConfig: AuthEndpointConfig, _accessToken: string): Promise<void> {
    /* mock */
  }
}

function formatAuthError(status: number, text: string): string {
  if (!text) return `Login failed: ${status}`;
  try {
    const parsed = JSON.parse(text) as { message?: string; code?: string };
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    /* fall through */
  }
  return `Login failed: ${status} — ${text}`;
}

async function fetchMe(
  endpointConfig: AuthEndpointConfig,
  accessToken: string,
): Promise<NodeDeskClawUserInfo> {
  const res = await fetch(buildAuthUrl(endpointConfig, "me"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatAuthError(res.status, text));
  }

  const body = await res.json();
  return unwrapNodeDeskClawResponse<NodeDeskClawUserInfo>(body);
}

class HttpAuthClient implements AuthClient {
  async login(input: LoginInput): Promise<StoredAuthSession> {
    const account = resolveAccount(input);
    const url = buildAuthUrl(input.endpointConfig, "account-login");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account,
        password: input.password,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(formatAuthError(res.status, text));
    }
    const body = await res.json();
    const loginData = unwrapNodeDeskClawResponse<NodeDeskClawLoginResponse>(body);
    const me = await fetchMe(input.endpointConfig, loginData.access_token);
    assertMember(me);
    return mapNodeDeskClawSession(loginData, me);
  }

  async refresh(
    endpointConfig: AuthEndpointConfig,
    refreshToken: string,
  ): Promise<StoredAuthSession> {
    const url = buildAuthUrl(endpointConfig, "refresh");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(formatAuthError(res.status, text));
    }
    const body = await res.json();
    const token = unwrapNodeDeskClawResponse<NodeDeskClawTokenResponse>(body);
    const me = await fetchMe(endpointConfig, token.access_token);
    assertMember(me);
    return mapNodeDeskClawSession(
      {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_type: token.token_type,
        expires_in: token.expires_in,
        user: me,
      },
      me,
    );
  }

  async logout(endpointConfig: AuthEndpointConfig, accessToken: string): Promise<void> {
    const url = buildAuthUrl(endpointConfig, "logout");
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => {
      /* best-effort */
    });
  }
}

let client: AuthClient | null = null;

export function getAuthClient(): AuthClient {
  if (!client) {
    client = useMockAuth() ? new MockAuthClient() : new HttpAuthClient();
  }
  return client;
}
