import { describe, expect, it } from "vitest";
import { isPortalSessionCookieName } from "../src/shared/auth/portal-session-cookies";
import { resolvePortalCallbackUrl } from "../src/main/auth/portal-session-bridge";

describe("portal session bridge", () => {
  it("detects NextAuth session cookie names", () => {
    expect(isPortalSessionCookieName("next-auth.session-token")).toBe(true);
    expect(isPortalSessionCookieName("__Secure-next-auth.session-token")).toBe(true);
    expect(isPortalSessionCookieName("other")).toBe(false);
  });

  it("uses deep aiosHomeUrl as NextAuth callbackUrl", () => {
    expect(
      resolvePortalCallbackUrl("http://localhost:3000/zh/dashboard"),
    ).toBe("http://localhost:3000/zh/dashboard");
  });

  it("falls back to /dashboard when aiosHomeUrl is origin only", () => {
    expect(resolvePortalCallbackUrl("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000/dashboard",
    );
  });
});
