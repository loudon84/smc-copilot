import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createExpertGatewayClient,
  ExpertGatewayError,
  resetExpertGatewayClientForTests,
} from "./expert-gateway-client";

vi.mock("../auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://expert.test:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://expert.test:4517",
  }),
  getDefaultAuthEndpointConfig: () => ({
    backendUrl: "http://expert.test:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://expert.test:4517",
  }),
}));

vi.mock("../auth/token-store", () => ({
  getCachedAccessToken: () => "test-access-token",
}));

vi.mock("../auth/ensure-access-token", () => ({
  ensureFreshAccessToken: async () => "test-access-token",
  refreshStoredAccessToken: async () => "test-access-token",
  isAuthExpiredMessage: (message: string) =>
    /authentication expired|token expired|invalid authorization/i.test(message),
}));

describe("expert-gateway-client", () => {
  afterEach(() => {
    resetExpertGatewayClientForTests();
  });

  // @lat: [[expert-execution-tests#Gateway catalog cache]]
  it("lists catalog tools and caches by TTL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "1",
            result: {
              tools: [
                {
                  name: "call-prep",
                  description: "Customer research expert",
                  annotations: { kind: "expert", slug: "call-prep" },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    let now = 1_000;
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
      catalogTtlMs: 60_000,
    });

    const first = await client.listCatalog();
    const second = await client.listCatalog();
    expect(first).toEqual([
      {
        name: "call-prep",
        description: "Customer research expert",
        slug: "call-prep",
        kind: "expert",
        inputSchema: undefined,
      },
    ]);
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 61_000;
    fetchImpl.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "2",
          result: { tools: [{ name: "other", annotations: { slug: "other" } }] },
        }),
        { status: 200 },
      ),
    );
    const third = await client.listCatalog();
    expect(third[0]?.slug).toBe("other");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  // @lat: [[expert-execution-tests#Skill exact call]]
  it("reads structuredContent from accepted tools/call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "call-1",
          result: {
            content: [{ type: "text", text: "started" }],
            structuredContent: {
              committed: true,
              task_id: "task-1",
              status: "running",
              event_stream: "/api/v1/hermes/tasks/task-1/events?token=x",
              event_token_url: "/api/v1/hermes/tasks/task-1/events-token",
              result_url: "/api/v1/hermes/tasks/task-1/result",
              artifact_url: "/api/v1/hermes/tasks/task-1/artifacts",
              wait_strategy: { type: "sse", fallback: "poll" },
            },
            isError: false,
          },
        }),
        { status: 200 },
      ),
    );

    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const accepted = await client.callSkill({
      expertSlug: "call-prep",
      skillName: "customer-profiling",
      prompt: "hello",
      idempotencyKey: "idem-1",
    });
    expect(accepted.task_id).toBe("task-1");
    expect(accepted.event_token_url).toContain("events-token");
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get("X-Idempotency-Key")).toBe("idem-1");
    expect((init.headers as Headers).get("Authorization")).toBe(
      "Bearer test-access-token",
    );
  });

  // @lat: [[expert-execution-tests#JSON-RPC 200-with-error]]
  it("surfaces JSON-RPC application errors on HTTP 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "err-1",
          error: {
            code: -32022,
            message: "Permission denied",
            data: { errorCode: "EXPERT_PERMISSION_DENIED" },
          },
        }),
        { status: 200 },
      ),
    );
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      client.callSkill({
        expertSlug: "call-prep",
        skillName: "customer-profiling",
        prompt: "x",
        idempotencyKey: "idem-2",
      }),
    ).rejects.toMatchObject({
      name: "ExpertGatewayError",
      errorCode: "EXPERT_PERMISSION_DENIED",
      status: 200,
    } satisfies Partial<ExpertGatewayError>);
  });

  // @lat: [[expert-execution-tests#HTTP 4xx mapping]]
  it("maps HTTP 4xx API errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 403,
          error_code: 403,
          message_key: "errors.task.owner_forbidden",
          message: "Owner forbidden",
        }),
        { status: 403 },
      ),
    );
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getTask("task-1")).rejects.toMatchObject({
      status: 403,
      errorCode: "errors.task.owner_forbidden",
    });
  });

  // @lat: [[expert-execution-tests#Catalog auth refresh retry]]
  it("refreshes and retries catalog after Authentication expired", async () => {
    let token = "expired-token";
    const refreshAccessToken = vi.fn(async () => {
      token = "fresh-token";
      return token;
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "1",
            error: {
              code: -32010,
              message: "Authentication expired",
              data: { errorCode: "MCP_AUTH_REQUIRED" },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "2",
            result: {
              tools: [{ name: "call-prep", annotations: { slug: "call-prep" } }],
            },
          }),
          { status: 200 },
        ),
      );

    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ensureAccessToken: async () => token,
      refreshAccessToken,
    });
    const items = await client.listCatalog();
    expect(items[0]?.slug).toBe("call-prep");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstAuth = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    const secondAuth = (fetchImpl.mock.calls[1]?.[1] as RequestInit).headers as Headers;
    expect(firstAuth.get("Authorization")).toBe("Bearer expired-token");
    expect(secondAuth.get("Authorization")).toBe("Bearer fresh-token");
  });
});
