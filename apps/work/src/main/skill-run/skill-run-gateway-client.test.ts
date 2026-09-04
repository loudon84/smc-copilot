import { describe, expect, it, vi } from "vitest";
import { createAuthorizedBackendTransport } from "../auth/authorized-backend-transport";
import {
  createSkillRunGatewayClient,
} from "./skill-run-gateway-client";
import {
  mapPublicSkillCatalogTools,
  parseSkillRunEvent,
} from "./skill-run-contract-parser";

vi.mock("../auth/auth-endpoint-config-store", () => ({
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

vi.mock("../auth/token-store", () => ({
  getCachedAccessToken: () => "cached-jwt-token",
  readStoredSessionSync: () => ({
    user: { id: "u1", username: "alice" },
  }),
}));

const IDEMPOTENCY_REPLAY_FIXTURE = {
  key: "request-1",
  first: { status: 200, run_id: "run-1" },
  replay: { status: 200, run_id: "run-1" },
  conflict: { status: 409, error_code: "IDEMPOTENCY_CONFLICT" },
};

function jsonRpcResult(result: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: "1", result }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function createClient(fetchImpl: typeof fetch) {
  return createSkillRunGatewayClient({
    hasConsumerLock: true,
    getAuthScopeKey: () => "test-scope",
    transport: createAuthorizedBackendTransport({
      fetchImpl,
      ensureAccessToken: async () => "fresh-jwt-token",
    }),
  });
}

describe("skill-run-gateway-client lock and discriminator gates", () => {
  it("returns contract-unsupported without fetch when consumer lock is absent", async () => {
    const fetchImpl = vi.fn(async () => jsonRpcResult({ tools: [] }));
    const client = createSkillRunGatewayClient({
      hasConsumerLock: false,
      getAuthScopeKey: () => "test-scope-no-lock",
      transport: createAuthorizedBackendTransport({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        ensureAccessToken: async () => "fresh-jwt-token",
      }),
    });

    const catalog = await client.listCatalog();
    expect(catalog.status).toBe("contract-unsupported");
    expect(catalog.tools).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(
      client.callSkill({
        toolName: "writer.article",
        arguments: { prompt: "hello" },
        idempotencyKey: "request-1",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "SkillRunGatewayError",
        errorCode: "CONTRACT_UNSUPPORTED",
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns contract-unsupported when tools lack capabilityKind", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRpcResult({
        tools: [{ name: "writer.article", title: "Writer" }],
      }),
    );
    const client = createClient(fetchImpl as unknown as typeof fetch);
    const catalog = await client.listCatalog();
    expect(catalog.status).toBe("contract-unsupported");
    expect(catalog.tools).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns contract-unsupported when tools/list omits the tools array", async () => {
    const fetchImpl = vi.fn(async () => jsonRpcResult({}));
    const client = createClient(fetchImpl as unknown as typeof fetch);
    const catalog = await client.listCatalog();
    expect(catalog.status).toBe("contract-unsupported");
    expect(catalog.tools).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("skill-run-gateway-client contract wire", () => {
  it("lists catalog via POST /api/v1/mcp tools/list and keeps only capabilityKind=skill", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      expect(body.method).toBe("tools/list");
      return jsonRpcResult({
        tools: [
          {
            name: "writer.article",
            title: "Writer",
            description: "Generate an article",
            capabilityKind: "skill",
            interactionMode: "chat",
            promptField: "prompt",
            category: "writing",
            inputSchema: {
              type: "object",
              properties: { prompt: { type: "string" } },
              required: ["prompt"],
            },
          },
          {
            name: "public.connector",
            title: "Connector",
            capabilityKind: "connector",
            interactionMode: "chat",
          },
        ],
      });
    });

    const client = createClient(fetchImpl as unknown as typeof fetch);
    const catalog = await client.listCatalog();
    expect(catalog.status).toBe("ready");
    expect(catalog.tools).toEqual([
      expect.objectContaining({
        toolName: "writer.article",
        title: "Writer",
        callability: "callable",
        invocationMode: "prompt-first",
        promptField: "prompt",
        interactionMode: "chat",
      }),
    ]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "http://nodeskclaw.test:4510/api/v1/mcp",
    );
    expect(
      (fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.method,
    ).toBe("POST");
  });

  it("replays the same X-Idempotency-Key to the same run_id", async () => {
    expect(IDEMPOTENCY_REPLAY_FIXTURE.first.run_id).toBe(
      IDEMPOTENCY_REPLAY_FIXTURE.replay.run_id,
    );

    const acceptedByKey = new Map<string, string>();
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      expect(body.method).toBe("tools/call");
      const key = headerValue(init, "X-Idempotency-Key");
      expect(key).toBe(IDEMPOTENCY_REPLAY_FIXTURE.key);
      const existing = acceptedByKey.get(key ?? "");
      if (existing) {
        return jsonRpcResult(
          {
            structuredContent: {
              run_id: existing,
              status: "QUEUED",
              event_stream: `/api/v1/runs/${existing}/events`,
            },
          },
          IDEMPOTENCY_REPLAY_FIXTURE.replay.status,
        );
      }
      acceptedByKey.set(key ?? "", IDEMPOTENCY_REPLAY_FIXTURE.first.run_id);
      return jsonRpcResult(
        {
          structuredContent: {
            run_id: IDEMPOTENCY_REPLAY_FIXTURE.first.run_id,
            status: "QUEUED",
            event_stream: `/api/v1/runs/${IDEMPOTENCY_REPLAY_FIXTURE.first.run_id}/events`,
          },
        },
        IDEMPOTENCY_REPLAY_FIXTURE.first.status,
      );
    });

    const client = createClient(fetchImpl as unknown as typeof fetch);
    const input = {
      toolName: "writer.article",
      arguments: { prompt: "hello" },
      idempotencyKey: IDEMPOTENCY_REPLAY_FIXTURE.key,
    };
    const first = await client.callSkill(input);
    const replay = await client.callSkill(input);
    expect(first.runId).toBe("run-1");
    expect(replay.runId).toBe(first.runId);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps IDEMPOTENCY_CONFLICT on 409", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error_code: "IDEMPOTENCY_CONFLICT",
          message: "key reused with different arguments",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = createClient(fetchImpl as unknown as typeof fetch);
    await expect(
      client.callSkill({
        toolName: "writer.article",
        arguments: { prompt: "other" },
        idempotencyKey: IDEMPOTENCY_REPLAY_FIXTURE.key,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "SkillRunGatewayError",
        status: 409,
        errorCode: "IDEMPOTENCY_CONFLICT",
      }),
    );
  });
});

describe("skill-run contract parser", () => {
  it("drops non-skill catalog entries", () => {
    const tools = mapPublicSkillCatalogTools([
      {
        name: "writer.article",
        title: "Writer",
        capabilityKind: "skill",
        interactionMode: "chat",
        promptField: "prompt",
        inputSchema: {
          type: "object",
          properties: { prompt: { type: "string" } },
          required: ["prompt"],
        },
      },
      { name: "slack.send", title: "Slack", capabilityKind: "connector" },
    ]);
    expect(tools.map((tool) => tool.toolName)).toEqual(["writer.article"]);
  });

  it("sends tools/call arguments keyed by promptField", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      expect(body.method).toBe("tools/call");
      expect(body.params?.name).toBe("search.skill");
      expect(body.params?.arguments).toEqual({ query: "find customers" });
      expect(headerValue(init, "X-Idempotency-Key")).toBe("req-query-field");
      return jsonRpcResult({
        structuredContent: {
          run_id: "run-query-1",
          status: "QUEUED",
          event_stream: "/api/v1/runs/run-query-1/events",
        },
      });
    });
    const client = createClient(fetchImpl as unknown as typeof fetch);
    const accepted = await client.callSkill({
      toolName: "search.skill",
      arguments: { query: "find customers" },
      idempotencyKey: "req-query-field",
    });
    expect(accepted.runId).toBe("run-query-1");
  });

  it("reads run_id from structuredContent (v1.2.1 accepted shape)", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      if (urlStr.includes("/api/v1/mcp") && method === "POST") {
        return jsonRpcResult({
          content: [{ type: "text", text: "accepted" }],
          structuredContent: {
            committed: true,
            run_id: "run-structured-1",
            status: "QUEUED",
            tool_name: "writer.article",
            event_stream: "/api/v1/runs/run-structured-1/events",
            result_url: "/api/v1/runs/run-structured-1/result",
            artifact_url: "/api/v1/runs/run-structured-1/artifacts",
            execution_mode: "async_event",
            contract_version: "1.2.1",
          },
          isError: false,
        });
      }
      if (urlStr.includes("/api/v1/runs/run-structured-1") && method === "GET") {
        return new Response(
          JSON.stringify({ run_id: "run-structured-1", status: "running" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch: ${method} ${urlStr}`);
    });
    const client = createClient(fetchImpl as unknown as typeof fetch);
    const accepted = await client.callSkill({
      toolName: "writer.article",
      arguments: { prompt: "hello" },
      idempotencyKey: "req-structured",
    });
    expect(accepted.runId).toBe("run-structured-1");
    expect(accepted.status).toBe("QUEUED");
    expect(accepted.eventStreamUrl).toBe(
      "/api/v1/runs/run-structured-1/events",
    );
    await client.getRunSnapshot(accepted.runId);
    expect(String(fetchImpl.mock.calls.at(-1)?.[0])).toContain(
      "/api/v1/runs/run-structured-1",
    );
    expect(String(fetchImpl.mock.calls.at(-1)?.[0])).not.toContain(
      "/api/v1/hermes/tasks/",
    );
  });

  it("fails closed on task_id-only Hermes Task envelope", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRpcResult({
        content: [{ type: "text", text: "queued" }],
        structuredContent: {
          tool_name: "hermes_xieyi__customer-profiling",
          status: "queued",
          task_id: "eaaab37a-1068-4123-9d8e-7880c407106a",
          event_url:
            "/api/v1/hermes/tasks/eaaab37a-1068-4123-9d8e-7880c407106a/events",
          result_url:
            "/api/v1/hermes/tasks/eaaab37a-1068-4123-9d8e-7880c407106a/result",
        },
        isError: false,
      }),
    );
    const client = createClient(fetchImpl as unknown as typeof fetch);
    await expect(
      client.callSkill({
        toolName: "hermes_xieyi__customer-profiling",
        arguments: { prompt: "hello" },
        idempotencyKey: "req-hermes-task",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("missing structuredContent.run_id"),
      status: 502,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("parses PublicRunEvent envelope run.completed", () => {
    const parsed = parseSkillRunEvent("run.completed", {
      event_id: "evt-1",
      run_id: "run-1",
      event_type: "run.completed",
      event_seq: 3,
      payload: { phase: "COMPLETED", text: "done" },
    });
    expect(parsed.rawUnknown).toBeUndefined();
    expect(parsed.phase).toBe("succeeded");
    expect(parsed.eventId).toBe("evt-1");
    expect(parsed.eventSeq).toBe(3);
    expect(parsed.text).toBe("done");
  });

  it("parses Hermes task.completed into succeeded projection", () => {
    const parsed = parseSkillRunEvent("message", {
      event: "task.completed",
      event_seq: 4,
      result: { summary: "ok", content: "profile ready" },
    });
    expect(parsed.phase).toBe("succeeded");
    expect(parsed.text).toBe("profile ready");
  });
});
