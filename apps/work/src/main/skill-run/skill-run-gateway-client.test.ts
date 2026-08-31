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
        prompt: "hello",
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
          { run_id: existing },
          IDEMPOTENCY_REPLAY_FIXTURE.replay.status,
        );
      }
      acceptedByKey.set(key ?? "", IDEMPOTENCY_REPLAY_FIXTURE.first.run_id);
      return jsonRpcResult(
        { run_id: IDEMPOTENCY_REPLAY_FIXTURE.first.run_id },
        IDEMPOTENCY_REPLAY_FIXTURE.first.status,
      );
    });

    const client = createClient(fetchImpl as unknown as typeof fetch);
    const input = {
      toolName: "writer.article",
      prompt: "hello",
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
        prompt: "other",
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
      { name: "writer.article", title: "Writer", capabilityKind: "skill" },
      { name: "slack.send", title: "Slack", capabilityKind: "connector" },
    ]);
    expect(tools.map((tool) => tool.toolName)).toEqual(["writer.article"]);
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
});
