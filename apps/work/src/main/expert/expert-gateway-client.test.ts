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

function catalogTool(
  overrides: {
    name?: string;
    slug?: string | null;
    kind?: string;
    status?: string;
    publicSkillCount?: number;
    callableSkillCount?: number;
    omitSlug?: boolean;
  } = {},
) {
  const annotations: Record<string, unknown> = {
    kind: overrides.kind ?? "expert",
    status: overrides.status ?? "ready",
    publicSkillCount: overrides.publicSkillCount ?? 1,
    callableSkillCount: overrides.callableSkillCount ?? 1,
  };
  if (!overrides.omitSlug) {
    annotations.slug =
      overrides.slug === null ? null : (overrides.slug ?? "call-prep");
  }
  return {
    name: overrides.name ?? "call-prep",
    description: "Customer research expert",
    annotations,
  };
}

function skillTool(
  overrides: {
    name?: string;
    status?: string;
    callEnabled?: boolean | null;
    riskLevel?: string;
    approvalMode?: string;
  } = {},
) {
  return {
    name: overrides.name ?? "customer-profiling",
    annotations: {
      status: overrides.status ?? "ready",
      callEnabled:
        overrides.callEnabled === undefined ? true : overrides.callEnabled,
      riskLevel: overrides.riskLevel ?? "low",
      approvalMode: overrides.approvalMode ?? "auto",
    },
  };
}

function jsonRpcResult(tools: unknown[]) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: "1", result: { tools } }),
    { status: 200 },
  );
}

function healthOk(ok = true) {
  return new Response(
    JSON.stringify({
      ok,
      status: ok ? "ready" : "degraded",
      gateway: { version: "1" },
      catalog: { count: 1 },
    }),
    { status: 200 },
  );
}

function acceptedCall() {
  return new Response(
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
  );
}

function isToolsCall(url: unknown): boolean {
  return (
    typeof url === "string" && url.includes("/mcp/") && !url.endsWith("/mcp")
  );
}

function methodOf(init: RequestInit | undefined): string {
  return (init?.method ?? "GET").toUpperCase();
}

function bodyMethod(init: RequestInit | undefined): string | null {
  if (typeof init?.body !== "string") return null;
  try {
    const parsed = JSON.parse(init.body) as { method?: string };
    return typeof parsed.method === "string" ? parsed.method : null;
  } catch {
    return null;
  }
}

describe("expert-gateway-client", () => {
  afterEach(() => {
    resetExpertGatewayClientForTests();
  });

  // @lat: [[expert-execution-tests#Gateway catalog cache]]
  it("lists catalog tools and caches by TTL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonRpcResult([catalogTool()]));

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
        displayName: undefined,
        status: "ready",
        publicSkillCount: 1,
        callableSkillCount: 1,
        inputSchema: undefined,
      },
    ]);
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 61_000;
    fetchImpl.mockResolvedValueOnce(
      jsonRpcResult([
        catalogTool({
          name: "other",
          slug: "other",
        }),
      ]),
    );
    const third = await client.listCatalog();
    expect(third[0]?.slug).toBe("other");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects catalog items missing slug or illegal annotations", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonRpcResult([
        catalogTool({ omitSlug: true }),
        catalogTool({ slug: "bad-kind", kind: "agent" }),
        catalogTool({
          slug: "bad-count",
          publicSkillCount: -1 as unknown as number,
        }),
        catalogTool({ slug: "ok" }),
      ]),
    );
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const items = await client.listCatalog();
    expect(items.map((item) => item.slug)).toEqual(["ok"]);
  });

  it("parses skill annotations including callEnabled false", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonRpcResult([
          skillTool({ callEnabled: false, riskLevel: "high" }),
          { name: "no-name-valid", annotations: {} },
        ]),
      );
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const skills = await client.listSkills("call-prep");
    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      name: "customer-profiling",
      callEnabled: false,
      riskLevel: "high",
      approvalMode: "auto",
    });
  });

  it("getHealth parses direct JSON and rejects invalid payload", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(healthOk(true))
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getHealth()).resolves.toMatchObject({
      ok: true,
      status: "ready",
    });
    await expect(client.getHealth()).rejects.toMatchObject({
      name: "ExpertGatewayError",
      status: 200,
      errorCode: "INVALID_HEALTH_PAYLOAD",
    } satisfies Partial<ExpertGatewayError>);
  });

  it("getHealth returns ok=false without throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(healthOk(false));
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getHealth()).resolves.toMatchObject({ ok: false });
  });

  it("accepts live 谢艺-latest catalog/skill payload for silent call", async () => {
    const expertSlug = "市场调研客户跟进产品分析";
    const encoded = encodeURIComponent(expertSlug);
    const fetchImpl = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (methodOf(init) === "GET" && url.includes("/expert/health")) {
          return Promise.resolve(healthOk(true));
        }
        if (bodyMethod(init) === "tools/list" && url.endsWith("/expert/mcp")) {
          return Promise.resolve(
            jsonRpcResult([
              {
                name: expertSlug,
                description: "谢艺-latest",
                annotations: {
                  kind: "expert",
                  slug: expertSlug,
                  displayName: "谢艺-latest",
                  status: "ready",
                  publicSkillCount: 1,
                  callableSkillCount: 1,
                },
              },
            ]),
          );
        }
        if (
          bodyMethod(init) === "tools/list" &&
          url.includes(`/mcp/${encoded}`)
        ) {
          return Promise.resolve(
            jsonRpcResult([
              {
                name: "customer-profiling",
                description: "客户画像",
                annotations: {
                  kind: "expert_skill",
                  slug: expertSlug,
                  displayName: "customer-profiling",
                  callEnabled: true,
                  riskLevel: "low",
                  approvalMode: "auto",
                  status: "ready",
                },
              },
            ]),
          );
        }
        if (bodyMethod(init) === "tools/call") {
          return Promise.resolve(acceptedCall());
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      });

    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const catalog = await client.listCatalog();
    const skills = await client.listSkills(expertSlug);
    expect(catalog[0]).toMatchObject({
      slug: expertSlug,
      displayName: "谢艺-latest",
      status: "ready",
    });
    expect(skills[0]).toMatchObject({
      name: "customer-profiling",
      callEnabled: true,
      riskLevel: "low",
      approvalMode: "auto",
      status: "ready",
    });
    await expect(
      client.callSkill({
        expertSlug,
        skillName: "customer-profiling",
        prompt: "给华阳做客户画像",
        idempotencyKey: "idem-xieyi",
      }),
    ).resolves.toMatchObject({ task_id: "task-1" });
    expect(
      fetchImpl.mock.calls.some(
        ([url, init]) =>
          bodyMethod(init as RequestInit) === "tools/call" &&
          String(url).includes(`/mcp/${encoded}`),
      ),
    ).toBe(true);
  });

  // @lat: [[expert-execution-tests#Skill exact call]]
  it("reads structuredContent from accepted tools/call after gates", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (methodOf(init) === "GET" && url.includes("/expert/health")) {
          return Promise.resolve(healthOk(true));
        }
        if (bodyMethod(init) === "tools/list" && url.endsWith("/expert/mcp")) {
          return Promise.resolve(jsonRpcResult([catalogTool()]));
        }
        if (
          bodyMethod(init) === "tools/list" &&
          url.includes("/mcp/call-prep")
        ) {
          return Promise.resolve(jsonRpcResult([skillTool()]));
        }
        if (bodyMethod(init) === "tools/call") {
          return Promise.resolve(acceptedCall());
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      });

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
    const call = fetchImpl.mock.calls.find(
      ([url, init]) =>
        bodyMethod(init as RequestInit) === "tools/call" && isToolsCall(url),
    );
    expect(call).toBeTruthy();
    const [, init] = call as [string, RequestInit];
    expect((init.headers as Headers).get("X-Idempotency-Key")).toBe("idem-1");
    expect((init.headers as Headers).get("Authorization")).toBe(
      "Bearer test-access-token",
    );
  });

  it("does not emit tools/call when health ok is false", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (methodOf(init) === "GET" && url.includes("/expert/health")) {
          return Promise.resolve(healthOk(false));
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      });
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      client.callSkill({
        expertSlug: "call-prep",
        skillName: "customer-profiling",
        prompt: "x",
        idempotencyKey: "idem-x",
      }),
    ).rejects.toMatchObject({ errorCode: "GATEWAY_UNHEALTHY" });
    expect(
      fetchImpl.mock.calls.some(
        ([, init]) => bodyMethod(init as RequestInit) === "tools/call",
      ),
    ).toBe(false);
  });

  it("does not emit tools/call when skill is not silently callable", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (methodOf(init) === "GET" && url.includes("/expert/health")) {
          return Promise.resolve(healthOk(true));
        }
        if (bodyMethod(init) === "tools/list" && url.endsWith("/expert/mcp")) {
          return Promise.resolve(jsonRpcResult([catalogTool()]));
        }
        if (
          bodyMethod(init) === "tools/list" &&
          url.includes("/mcp/call-prep")
        ) {
          return Promise.resolve(
            jsonRpcResult([skillTool({ callEnabled: false })]),
          );
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      });
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      client.callSkill({
        expertSlug: "call-prep",
        skillName: "customer-profiling",
        prompt: "x",
        idempotencyKey: "idem-y",
      }),
    ).rejects.toMatchObject({ errorCode: "SILENT_CALL_DENIED" });
    expect(
      fetchImpl.mock.calls.some(
        ([, init]) => bodyMethod(init as RequestInit) === "tools/call",
      ),
    ).toBe(false);
  });

  // @lat: [[expert-execution-tests#JSON-RPC 200-with-error]]
  it("surfaces JSON-RPC application errors on HTTP 200", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (methodOf(init) === "GET" && url.includes("/expert/health")) {
          return Promise.resolve(healthOk(true));
        }
        if (bodyMethod(init) === "tools/list" && url.endsWith("/expert/mcp")) {
          return Promise.resolve(jsonRpcResult([catalogTool()]));
        }
        if (
          bodyMethod(init) === "tools/list" &&
          url.includes("/mcp/call-prep")
        ) {
          return Promise.resolve(jsonRpcResult([skillTool()]));
        }
        return Promise.resolve(
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
      });
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
      .mockResolvedValueOnce(jsonRpcResult([catalogTool()]));

    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ensureAccessToken: async () => token,
      refreshAccessToken,
    });
    const items = await client.listCatalog();
    expect(items[0]?.slug).toBe("call-prep");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstAuth = (fetchImpl.mock.calls[0]?.[1] as RequestInit)
      .headers as Headers;
    const secondAuth = (fetchImpl.mock.calls[1]?.[1] as RequestInit)
      .headers as Headers;
    expect(firstAuth.get("Authorization")).toBe("Bearer expired-token");
    expect(secondAuth.get("Authorization")).toBe("Bearer fresh-token");
  });

  // @lat: [[expert-execution-tests#Cross-origin rejection]]
  it("ExpertGatewayError carries cross-origin rejection code", () => {
    const err = new ExpertGatewayError("Cross-origin URL rejected", {
      status: 400,
      errorCode: "CROSS_ORIGIN_REJECTED",
    });
    expect(err.errorCode).toBe("CROSS_ORIGIN_REJECTED");
  });

  it("wraps undici fetch failed with URL and cause", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), {
        cause: new Error("connect ECONNREFUSED 192.168.102.247:4510"),
      }),
    );
    const client = createExpertGatewayClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getHealth()).rejects.toMatchObject({
      name: "ExpertGatewayError",
      errorCode: "FETCH_FAILED",
      message: expect.stringContaining("192.168.102.247:4510"),
    });
  });
});
