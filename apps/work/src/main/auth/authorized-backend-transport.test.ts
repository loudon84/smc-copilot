import { describe, expect, it, vi } from "vitest";
import {
  AuthorizedBackendTransportError,
  createAuthorizedBackendTransport,
} from "./authorized-backend-transport";

vi.mock("./auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://nodeskclaw.test:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://nodeskclaw.test:4517",
  }),
  getDefaultAuthEndpointConfig: () => ({
    backendUrl: "http://nodeskclaw.test:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://nodeskclaw.test:4517",
  }),
}));

vi.mock("./token-store", () => ({
  getCachedAccessToken: () => "cached-jwt-token",
  readStoredSession: () => Promise.resolve(null),
}));

describe("authorized-backend-transport", () => {
  it("resolves base url and injects Authorization header", async () => {
    let capturedUrl = "";
    let capturedHeaders: Headers | undefined;

    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const transport = createAuthorizedBackendTransport({
      fetchImpl: mockFetch as unknown as typeof fetch,
      ensureAccessToken: async () => "fresh-jwt-token",
    });

    expect(transport.getBaseUrl()).toBe("http://nodeskclaw.test:4510");
    const res = await transport.authorizedFetch("/api/v1/test", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      idempotencyKey: "idem-123",
    });

    expect(res.status).toBe(200);
    expect(capturedUrl).toBe("http://nodeskclaw.test:4510/api/v1/test");
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer fresh-jwt-token");
    expect(capturedHeaders?.get("Content-Type")).toBe("application/json");
    expect(capturedHeaders?.get("X-Idempotency-Key")).toBe("idem-123");
  });

  it("keeps Authorization and omits JSON Content-Type for FormData bodies", async () => {
    let capturedHeaders: Headers | undefined;
    let capturedBody: BodyInit | undefined;

    const mockFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      capturedBody = init?.body ?? undefined;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const transport = createAuthorizedBackendTransport({
      fetchImpl: mockFetch as unknown as typeof fetch,
      ensureAccessToken: async () => "fresh-jwt-token",
    });

    const form = new FormData();
    form.append("file", new Blob(["hello"], { type: "text/plain" }), "note.txt");
    await transport.authorizedFetch("/api/v1/attachments", {
      method: "POST",
      body: form,
    });

    expect(capturedBody).toBe(form);
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer fresh-jwt-token");
    expect(capturedHeaders?.get("Content-Type")).toBeNull();
    expect(capturedHeaders?.get("X-Idempotency-Key")).toBeNull();
  });

  it("rejects cross-origin paths", async () => {
    const transport = createAuthorizedBackendTransport();
    await expect(
      transport.authorizedFetch("http://evil.com/api/steal"),
    ).rejects.toThrow(AuthorizedBackendTransportError);
  });

  it("retries on 401 with refreshed token", async () => {
    let callCount = 0;
    const mockRefresh = vi.fn(async () => "refreshed-token");

    const transport = createAuthorizedBackendTransport({
      fetchImpl: vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new AuthorizedBackendTransportError("Unauthorized", {
            status: 401,
            errorCode: "UNAUTHORIZED",
          });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }) as unknown as typeof fetch,
      ensureAccessToken: async () => "valid-token",
      refreshAccessToken: mockRefresh,
    });

    const result = await transport.withAuthRetry(async () => {
      return transport.authorizedFetch("/api/v1/protected");
    });

    expect(result.status).toBe(200);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(2);
  });
});
