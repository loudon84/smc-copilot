import { describe, it, expect } from "vitest";
import {
  assertMember,
  mapNodeDeskClawSession,
  mapNodeDeskClawUser,
  unwrapNodeDeskClawResponse,
  type NodeDeskClawLoginResponse,
  type NodeDeskClawUserInfo,
} from "../src/main/auth/nodeskclaw-auth-response";

describe("nodeskclaw auth response parser", () => {
  it("unwraps successful ApiResponse", () => {
    const data = unwrapNodeDeskClawResponse<{ token: string }>({
      code: 0,
      message: "success",
      data: { token: "abc" },
    });
    expect(data.token).toBe("abc");
  });

  it("throws when code is not zero", () => {
    expect(() =>
      unwrapNodeDeskClawResponse({
        code: 401,
        message: "invalid credentials",
        data: null,
      }),
    ).toThrow("invalid credentials");
  });

  it("throws when data is missing", () => {
    expect(() =>
      unwrapNodeDeskClawResponse({
        code: 0,
        message: "success",
        data: null,
      }),
    ).toThrow("Invalid response: missing data");
  });

  it("maps user fields from nodeskclaw snake_case", () => {
    const user = mapNodeDeskClawUser({
      id: "u1",
      username: "admin",
      email: "admin@portal.local",
      name: "Admin",
      current_org_id: "org-1",
      org_role: "member",
      portal_org_role: "member",
    });
    expect(user.currentOrgId).toBe("org-1");
    expect(user.portalOrgRole).toBe("member");
  });

  it("assertMember rejects missing org", () => {
    expect(() =>
      assertMember({
        id: "u1",
        is_active: true,
        portal_org_role: "member",
      } as NodeDeskClawUserInfo),
    ).toThrow("当前账号未加入任何组织");
  });

  it("maps login session with expiresAt", () => {
    const me: NodeDeskClawUserInfo = {
      id: "u1",
      username: "admin",
      current_org_id: "org-1",
      portal_org_role: "member",
      is_active: true,
    };
    const login: NodeDeskClawLoginResponse = {
      access_token: "access",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_in: 3600,
      user: me,
    };
    const session = mapNodeDeskClawSession(login, me);
    expect(session.accessToken).toBe("access");
    expect(session.user.portalOrgRole).toBe("member");
    expect(session.expiresAt).toBeTruthy();
  });
});
