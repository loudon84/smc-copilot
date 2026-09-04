/**
 * Checkpoint B live/fixture E2E for Skill Run.
 * Fixture path uses fetchImpl HTTP replay; live path is env-gated.
 * Does not create a parallel lifecycle owner.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthorizedBackendTransport } from "../auth/authorized-backend-transport";
import { createSkillRunGatewayClient } from "./skill-run-gateway-client";
import {
  createSkillRunService,
  type CreateSkillRunServiceOptions,
  type SkillRunService,
} from "./skill-run-service";
import type { SkillRunProjection } from "../../shared/skill-run";

vi.mock("../auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl:
      process.env.SMC_SKILL_RUN_E2E_BACKEND_URL ??
      "http://nodeskclaw.test:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://nodeskclaw.test:4517",
  }),
  getDefaultAuthEndpointConfig: () => ({
    backendUrl:
      process.env.SMC_SKILL_RUN_E2E_BACKEND_URL ??
      "http://nodeskclaw.test:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://nodeskclaw.test:4517",
  }),
}));

vi.mock("../auth/token-store", () => ({
  getCachedAccessToken: () =>
    process.env.SMC_SKILL_RUN_E2E_ACCESS_TOKEN ?? "cached-jwt-token",
  readStoredSessionSync: () => ({
    user: { id: "u1", username: "alice" },
  }),
}));

const LIVE_ENABLED = process.env.SMC_SKILL_RUN_E2E === "1";
const LIVE_TOOL =
  process.env.SMC_SKILL_RUN_E2E_TOOL_NAME?.trim() || "writer.article";
const LIVE_PROMPT =
  process.env.SMC_SKILL_RUN_E2E_PROMPT?.trim() || "e2e short prompt";

const SKILL_TOOL = {
  name: "writer.article",
  title: "Writer",
  description: "Generate an article",
  capabilityKind: "skill",
  interactionMode: "chat",
  promptField: "prompt",
  supportsAttachments: false,
  category: "writing",
  inputSchema: {
    type: "object",
    properties: { prompt: { type: "string" } },
    required: ["prompt"],
  },
};

const UNSUPPORTED_SCHEMA_TOOL = {
  name: "writer.ref",
  title: "Writer Ref",
  capabilityKind: "skill",
  interactionMode: "chat",
  promptField: "prompt",
  inputSchema: { $ref: "#/definitions/Input" },
};

const EXTRA_REQUIRED_TOOL = {
  name: "writer.extra",
  title: "Writer Extra",
  capabilityKind: "skill",
  interactionMode: "chat",
  promptField: "prompt",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      region: { type: "string" },
    },
    required: ["prompt", "region"],
  },
};

const CONNECTOR_TOOL = {
  name: "public.connector",
  title: "Connector",
  capabilityKind: "connector",
  interactionMode: "chat",
};

const services: SkillRunService[] = [];

afterEach(() => {
  while (services.length > 0) {
    services.pop()?.dispose();
  }
});

function trackService(service: SkillRunService): SkillRunService {
  services.push(service);
  return service;
}

function jsonRpcResult(result: unknown, status = 200): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: "1", result }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headerValue(
  init: RequestInit | undefined,
  name: string,
): string | null {
  return new Headers(init?.headers).get(name);
}

function sseChunk(
  eventType: string,
  data: Record<string, unknown>,
  id?: string,
): string {
  const lines = [`event: ${eventType}`];
  if (id) lines.push(`id: ${id}`);
  lines.push(`data: ${JSON.stringify(data)}`, "", "");
  return lines.join("\n");
}

function sseResponse(chunks: string[]): Response {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode(chunks[index++]));
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function hangingSseResponse(signal?: AbortSignal): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      if (signal?.aborted) {
        close();
        return;
      }
      signal?.addEventListener("abort", close, { once: true });
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function waitForProjection(
  service: SkillRunService,
  clientRequestId: string,
  predicate: (projection: SkillRunProjection) => boolean,
  timeoutMs = 4000,
): Promise<SkillRunProjection> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const projection = service.getProjection(clientRequestId);
    if (projection && predicate(projection)) {
      return projection;
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(
    `timeout waiting for projection ${clientRequestId}; last=${JSON.stringify(
      service.getProjection(clientRequestId),
    )}`,
  );
}

function countToolsCall(fetchImpl: ReturnType<typeof vi.fn>): number {
  return fetchImpl.mock.calls.filter((call) => {
    const init = call[1] as RequestInit | undefined;
    if ((init?.method ?? "GET").toUpperCase() !== "POST") return false;
    try {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
      };
      return body.method === "tools/call";
    } catch {
      return false;
    }
  }).length;
}

type FixtureMode =
  | "happy"
  | "unauthorized"
  | "unpublish"
  | "reconnect"
  | "cancel"
  | "artifact-fail"
  | "unknown-event"
  | "unsupported-schema"
  | "extra-required"
  | "hanging-sse";

interface FixtureState {
  fetchImpl: ReturnType<typeof vi.fn>;
  acceptedByKey: Map<string, string>;
  sseAttempts: number;
  lastEventIdsSeen: string[];
}

function createFixtureFetch(mode: FixtureMode): FixtureState {
  const acceptedByKey = new Map<string, string>();
  const lastEventIdsSeen: string[] = [];
  let sseAttempts = 0;
  let catalogTools: unknown[] =
    mode === "unpublish"
      ? [CONNECTOR_TOOL]
      : mode === "unsupported-schema"
        ? [UNSUPPORTED_SCHEMA_TOOL, CONNECTOR_TOOL]
        : mode === "extra-required"
          ? [EXTRA_REQUIRED_TOOL, CONNECTOR_TOOL]
          : [SKILL_TOOL, CONNECTOR_TOOL];

  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(url);
    const method = (init?.method ?? "GET").toUpperCase();

    if (urlStr.includes("/api/v1/mcp") && method === "POST") {
      if (mode === "unauthorized") {
        return new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      if (body.method === "tools/list") {
        return jsonRpcResult({ tools: catalogTools });
      }
      if (body.method === "tools/call") {
        if (
          mode === "happy" ||
          mode === "reconnect" ||
          mode === "cancel" ||
          mode === "artifact-fail" ||
          mode === "unknown-event" ||
          mode === "hanging-sse"
        ) {
          expect(body.params?.arguments).toEqual(
            expect.objectContaining({ prompt: expect.any(String) }),
          );
        }
        const key = headerValue(init, "X-Idempotency-Key") ?? "";
        const existing = acceptedByKey.get(key);
        if (existing) {
          return jsonRpcResult({
            structuredContent: {
              run_id: existing,
              status: "starting",
              event_stream: `/api/v1/runs/${existing}/events`,
            },
          });
        }
        const runId = `run-${key || "anon"}`;
        acceptedByKey.set(key, runId);
        return jsonRpcResult({
          structuredContent: {
            run_id: runId,
            status: "starting",
            event_stream: `/api/v1/runs/${runId}/events`,
          },
        });
      }
      return jsonRpcResult({ error: "unknown method" }, 400);
    }

    if (urlStr.includes("/events") && method === "GET") {
      sseAttempts += 1;
      const lastEventId = headerValue(init, "Last-Event-ID");
      if (lastEventId) lastEventIdsSeen.push(lastEventId);

      if (mode === "cancel" || mode === "hanging-sse") {
        return hangingSseResponse(init?.signal ?? undefined);
      }

      if (mode === "reconnect") {
        if (sseAttempts === 1) {
          return sseResponse([
            sseChunk(
              "run.progress",
              {
                event_id: "evt-1",
                event_type: "run.progress",
                event_seq: 1,
                payload: { text: "working" },
              },
              "evt-1",
            ),
          ]);
        }
        return sseResponse([
          sseChunk(
            "run.completed",
            {
              event_id: "evt-2",
              event_type: "run.completed",
              event_seq: 2,
              payload: { text: "reconnected done" },
            },
            "evt-2",
          ),
        ]);
      }

      if (mode === "unknown-event") {
        return sseResponse([
          sseChunk(
            "run.mystery",
            {
              event_id: "evt-mystery",
              event_type: "run.mystery",
              event_seq: 1,
              payload: { text: "should not surface" },
            },
            "evt-mystery",
          ),
          sseChunk(
            "run.completed",
            {
              event_id: "evt-ok",
              event_type: "run.completed",
              event_seq: 2,
              payload: { text: "completed after unknown" },
            },
            "evt-ok",
          ),
        ]);
      }

      return sseResponse([
        sseChunk(
          "run.completed",
          {
            event_id: "evt-1",
            event_type: "run.completed",
            event_seq: 1,
            payload: {
              text: "fixture result text",
              artifacts: [{ id: "art-1", file_name: "out.txt" }],
            },
          },
          "evt-1",
        ),
      ]);
    }

    if (urlStr.includes("/artifacts") && method === "GET") {
      if (mode === "artifact-fail") {
        return new Response(JSON.stringify({ message: "boom" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          artifacts: [{ id: "art-1", file_name: "out.txt", preview_supported: true }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (urlStr.includes("/cancel") && method === "POST") {
      return new Response(null, { status: 204 });
    }

    if (urlStr.includes("/api/v1/runs/") && method === "GET") {
      const match = /\/api\/v1\/runs\/([^/?]+)/.exec(urlStr);
      const runId = match ? decodeURIComponent(match[1]) : "poll-run";
      if (mode === "hanging-sse") {
        return new Response(
          JSON.stringify({
            run_id: runId,
            status: "succeeded",
            result_text: "poll result",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // Concurrent poll must not steal SSE-driven fixtures; stay nonterminal.
      return new Response(
        JSON.stringify({
          run_id: runId,
          status: "running",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ message: `unhandled ${method} ${urlStr}` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });

  return {
    fetchImpl,
    acceptedByKey,
    get sseAttempts() {
      return sseAttempts;
    },
    lastEventIdsSeen,
  };
}

function createServiceFromFetch(
  fetchImpl: typeof fetch,
  extras: Pick<
    CreateSkillRunServiceOptions,
    "onUpsertArtifact" | "onPersistContinuation"
  > = {},
): SkillRunService {
  const gateway = createSkillRunGatewayClient({
    hasConsumerLock: true,
    getAuthScopeKey: () => `e2e-scope-${Math.random().toString(36).slice(2)}`,
    transport: createAuthorizedBackendTransport({
      fetchImpl,
      ensureAccessToken: async () =>
        process.env.SMC_SKILL_RUN_E2E_ACCESS_TOKEN ?? "fresh-jwt-token",
    }),
  });
  return trackService(
    createSkillRunService({
      gatewayClient: gateway,
      getFeatureMode: () => "skill-first",
      sleep: async () => undefined,
      ...extras,
    }),
  );
}

describe("skill-run e2e fixture", () => {
  it("happy path: catalog → start → SSE → artifacts → rehydrate without second tools/call", async () => {
    const fixture = createFixtureFetch("happy");
    const upserts: Array<{ runId: string; artifactId: string }> = [];
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
      {
        onUpsertArtifact: async ({ meta, runId }) => {
          upserts.push({ runId, artifactId: meta.id });
        },
      },
    );

    const catalog = await service.listCatalog();
    expect(catalog.status).toBe("ready");
    expect(catalog.tools.map((tool) => tool.toolName)).toEqual([
      "writer.article",
    ]);

    const clientRequestId = "e2e-happy-1";
    const start = await service.start({
      toolName: "writer.article",
      prompt: "write briefly",
      clientRequestId,
      sessionId: "session-happy",
      profileId: "profile-1",
    });
    expect(start.accepted).toBe(true);

    const terminal = await waitForProjection(
      service,
      clientRequestId,
      (projection) => projection.phase === "succeeded",
    );
    expect(terminal.providerRunId).toBe(`run-${clientRequestId}`);
    expect(terminal.text).toBe("fixture result text");
    expect(upserts).toEqual([
      { runId: `run-${clientRequestId}`, artifactId: "art-1" },
    ]);
    expect(countToolsCall(fixture.fetchImpl)).toBe(1);

    const continuation = {
      clientRequestId,
      providerRunId: terminal.providerRunId,
      toolName: terminal.toolName,
      promptSummary: terminal.promptSummary,
      sessionId: terminal.sessionId,
      profileId: terminal.profileId,
      lastEventId: terminal.lastEventId,
      phase: terminal.phase,
      text: terminal.text,
      updatedAt: terminal.updatedAt,
    };
    service.dispose();

    const restarted = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const rehydrated = await restarted.rehydrate(continuation);
    expect(rehydrated?.phase).toBe("succeeded");
    expect(countToolsCall(fixture.fetchImpl)).toBe(1);
  });

  it("negative: unauthorized catalog does not start via Expert fallback", async () => {
    const fixture = createFixtureFetch("unauthorized");
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const catalog = await service.listCatalog();
    expect(catalog.status).toBe("unauthorized");
    const start = await service.start({
      toolName: "writer.article",
      prompt: "nope",
      clientRequestId: "e2e-unauth",
      sessionId: "session-unauth",
      profileId: "profile-1",
    });
    expect(start.accepted).toBe(false);
    if (!start.accepted) {
      expect(start.errorCode).toBe("CATALOG_UNAVAILABLE");
    }
    expect(countToolsCall(fixture.fetchImpl)).toBe(0);
  });

  it("negative: unpublished tool is TOOL_NOT_FOUND", async () => {
    const fixture = createFixtureFetch("unpublish");
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const catalog = await service.listCatalog();
    expect(catalog.status).toBe("ready");
    expect(catalog.tools).toEqual([]);
    const start = await service.start({
      toolName: "writer.article",
      prompt: "gone",
      clientRequestId: "e2e-unpublish",
      sessionId: "session-unpublish",
      profileId: "profile-1",
    });
    expect(start.accepted).toBe(false);
    if (!start.accepted) {
      expect(start.errorCode).toBe("TOOL_NOT_FOUND");
    }
    expect(countToolsCall(fixture.fetchImpl)).toBe(0);
  });

  it("negative: SSE reconnect sends Last-Event-ID and completes", async () => {
    const fixture = createFixtureFetch("reconnect");
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const clientRequestId = "e2e-reconnect";
    await service.start({
      toolName: "writer.article",
      prompt: "reconnect",
      clientRequestId,
      sessionId: "session-reconnect",
      profileId: "profile-1",
    });
    const terminal = await waitForProjection(
      service,
      clientRequestId,
      (projection) => projection.phase === "succeeded",
    );
    expect(terminal.text).toBe("reconnected done");
    expect(fixture.sseAttempts).toBeGreaterThanOrEqual(2);
    expect(fixture.lastEventIdsSeen).toContain("evt-1");
  });

  it("negative: duplicate clientRequestId / X-Idempotency-Key yields one tools/call and same run_id", async () => {
    const fixture = createFixtureFetch("happy");
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const input = {
      toolName: "writer.article",
      prompt: "dup",
      clientRequestId: "e2e-dup-key",
      sessionId: "session-dup",
      profileId: "profile-1",
    };
    const first = await service.start(input);
    expect(first.accepted).toBe(true);
    await waitForProjection(
      service,
      input.clientRequestId,
      (projection) => projection.phase === "succeeded",
    );
    // Same identity after terminal: in-memory map returns existing projection (no second call).
    const replayStart = await service.start(input);
    expect(replayStart.accepted).toBe(true);
    if (replayStart.accepted) {
      expect(replayStart.projection.providerRunId).toBe(
        `run-${input.clientRequestId}`,
      );
    }
    expect(countToolsCall(fixture.fetchImpl)).toBe(1);
    expect(fixture.acceptedByKey.get(input.clientRequestId)).toBe(
      `run-${input.clientRequestId}`,
    );

    // Gateway-level HTTP replay: same X-Idempotency-Key maps to same run_id.
    const gateway = createSkillRunGatewayClient({
      hasConsumerLock: true,
      getAuthScopeKey: () => "dup-gateway",
      transport: createAuthorizedBackendTransport({
        fetchImpl: fixture.fetchImpl as unknown as typeof fetch,
        ensureAccessToken: async () => "fresh-jwt-token",
      }),
    });
    const replay = await gateway.callSkill({
      toolName: "writer.article",
      arguments: { prompt: "dup" },
      idempotencyKey: input.clientRequestId,
    });
    expect(replay.runId).toBe(`run-${input.clientRequestId}`);
  });

  it("negative: unsupported schema is rejected before tools/call", async () => {
    const fixture = createFixtureFetch("unsupported-schema");
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const catalog = await service.listCatalog();
    expect(catalog.status).toBe("ready");
    const tool = catalog.tools.find((entry) => entry.toolName === "writer.ref");
    expect(tool?.callability).toBe("unsupported");
    expect(tool?.invocationMode).toBe("unsupported-schema");

    const result = await service.start({
      toolName: "writer.ref",
      prompt: "hello",
      clientRequestId: "e2e-unsupported",
      sessionId: "session-unsupported",
      profileId: "profile-1",
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("SKILL_UNSUPPORTED_SCHEMA");
    }
    expect(countToolsCall(fixture.fetchImpl)).toBe(0);
  });

  it("negative: extra required parameters are rejected before tools/call", async () => {
    const fixture = createFixtureFetch("extra-required");
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const catalog = await service.listCatalog();
    const tool = catalog.tools.find((entry) => entry.toolName === "writer.extra");
    expect(tool?.invocationMode).toBe("parameters-required");

    const result = await service.start({
      toolName: "writer.extra",
      prompt: "hello",
      clientRequestId: "e2e-extra",
      sessionId: "session-extra",
      profileId: "profile-1",
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("SKILL_PARAMETERS_REQUIRED");
    }
    expect(countToolsCall(fixture.fetchImpl)).toBe(0);
  });

  it("negative: cancel reaches cancelled without abortChat", async () => {
    const fixture = createFixtureFetch("cancel");
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const clientRequestId = "e2e-cancel";
    await service.start({
      toolName: "writer.article",
      prompt: "cancel me",
      clientRequestId,
      sessionId: "session-cancel",
      profileId: "profile-1",
    });
    await waitForProjection(
      service,
      clientRequestId,
      (projection) => projection.phase === "running" && Boolean(projection.providerRunId),
    );
    const cancel = await service.cancel({
      clientRequestId,
      sessionId: "session-cancel",
    });
    expect(cancel.success).toBe(true);
    expect(cancel.projection?.phase).toBe("cancelled");
  });

  it("negative: artifact discovery failure keeps succeeded", async () => {
    const fixture = createFixtureFetch("artifact-fail");
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const clientRequestId = "e2e-artifact-fail";
    await service.start({
      toolName: "writer.article",
      prompt: "artifacts",
      clientRequestId,
      sessionId: "session-artifact",
      profileId: "profile-1",
    });
    const terminal = await waitForProjection(
      service,
      clientRequestId,
      (projection) => projection.phase === "succeeded",
    );
    expect(terminal.phase).toBe("succeeded");
    expect(terminal.errorCode).toBeUndefined();
  });

  it("negative: unknown SSE event is fail-soft then completed", async () => {
    const fixture = createFixtureFetch("unknown-event");
    const projections: SkillRunProjection[] = [];
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    service.subscribe((projection) => projections.push({ ...projection }));
    const clientRequestId = "e2e-unknown";
    await service.start({
      toolName: "writer.article",
      prompt: "unknown",
      clientRequestId,
      sessionId: "session-unknown",
      profileId: "profile-1",
    });
    const terminal = await waitForProjection(
      service,
      clientRequestId,
      (projection) => projection.phase === "succeeded",
    );
    expect(terminal.text).toBe("completed after unknown");
    expect(
      projections.some((projection) => projection.text === "should not surface"),
    ).toBe(false);
  });

  it("negative: hanging SSE still reaches terminal via concurrent poll", async () => {
    const fixture = createFixtureFetch("hanging-sse");
    const service = createServiceFromFetch(
      fixture.fetchImpl as unknown as typeof fetch,
    );
    const clientRequestId = "e2e-hanging-sse";
    await service.start({
      toolName: "writer.article",
      prompt: "hang",
      clientRequestId,
      sessionId: "session-hang",
      profileId: "profile-1",
    });
    const terminal = await waitForProjection(
      service,
      clientRequestId,
      (projection) => projection.phase === "succeeded",
      3000,
    );
    expect(terminal.phase).toBe("succeeded");
    expect(terminal.text).toBe("poll result");
  });
});

describe.skipIf(!LIVE_ENABLED)("skill-run e2e live", () => {
  it("Catalog → start → terminal → artifact/empty → rehydrate without second tools/call", async () => {
    expect(process.env.SMC_SKILL_RUN_E2E_BACKEND_URL).toBeTruthy();
    expect(process.env.SMC_SKILL_RUN_E2E_ACCESS_TOKEN).toBeTruthy();
    expect(process.env.SMC_SKILL_RUN_E2E_TOOL_NAME).toBeTruthy();

    const fetchSpy = vi.fn(globalThis.fetch.bind(globalThis));
    const service = createServiceFromFetch(fetchSpy as unknown as typeof fetch);
    const catalog = await service.listCatalog();
    expect(catalog.status).toBe("ready");
    expect(
      catalog.tools.some((tool) => tool.toolName === LIVE_TOOL),
    ).toBe(true);

    const clientRequestId = `live-${Date.now()}`;
    const start = await service.start({
      toolName: LIVE_TOOL,
      prompt: LIVE_PROMPT,
      clientRequestId,
      sessionId: `live-session-${Date.now()}`,
      profileId: "live-profile",
    });
    expect(start.accepted).toBe(true);

    const terminal = await waitForProjection(
      service,
      clientRequestId,
      (projection) =>
        projection.phase === "succeeded" ||
        projection.phase === "failed" ||
        projection.phase === "cancelled" ||
        projection.phase === "expired",
      120_000,
    );
    expect(terminal.providerRunId).toBeTruthy();
    expect(countToolsCall(fetchSpy)).toBe(1);

    const continuation = {
      clientRequestId,
      providerRunId: terminal.providerRunId,
      toolName: terminal.toolName,
      promptSummary: terminal.promptSummary,
      sessionId: terminal.sessionId,
      profileId: terminal.profileId,
      lastEventId: terminal.lastEventId,
      phase: terminal.phase,
      text: terminal.text,
      updatedAt: terminal.updatedAt,
    };
    service.dispose();

    const restarted = createServiceFromFetch(fetchSpy as unknown as typeof fetch);
    await restarted.rehydrate(continuation);
    expect(countToolsCall(fetchSpy)).toBe(1);
  }, 180_000);
});
