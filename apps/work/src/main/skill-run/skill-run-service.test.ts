import { afterEach, describe, expect, it, vi } from "vitest";
import { createSkillRunGatewayClient, SkillRunGatewayClient } from "./skill-run-gateway-client";
import { bindPromptFirstTool } from "./skill-run-contract-parser";
import { createSkillRunService, type SkillRunService } from "./skill-run-service";
import type { SkillCatalogToolItem, SkillRunProjection } from "../../shared/skill-run";

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

const callableTool: SkillCatalogToolItem = {
  toolName: "calculator",
  title: "Calculator",
  interactionMode: "chat",
  promptField: "prompt",
  supportsAttachments: false,
  callability: "callable",
  invocationMode: "prompt-first",
  inputSchema: {
    type: "object",
    properties: { prompt: { type: "string" } },
    required: ["prompt"],
  },
};

function createMockGateway(
  overrides: Partial<SkillRunGatewayClient> = {},
): SkillRunGatewayClient {
  return {
    listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [callableTool] }),
    callSkill: vi.fn().mockResolvedValue({ runId: "run-xyz-999", status: "starting" }),
    getRunSnapshot: vi.fn().mockResolvedValue({
      runId: "run-xyz-999",
      status: "succeeded",
      resultText: "Calculation completed: 42",
      artifacts: [{ id: "art-1", file_name: "output.txt" }],
    }),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    listRunArtifacts: vi.fn().mockResolvedValue([
      { id: "art-1", file_name: "output.txt", preview_supported: true },
    ]),
    openEventStream: vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
                const sseData =
                'event: run.completed\nid: evt-1\ndata: {"event_id":"evt-1","event_type":"run.completed","event_seq":1,"payload":{"text":"Calculation completed: 42","artifacts":[{"id":"art-1","file_name":"output.txt"}]}}\n\n';
              return {
                done: false,
                value: new TextEncoder().encode(sseData),
              };
            },
          };
        },
      },
    }),
    hasConsumerLock: () => true,
    clearCache: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

const skillFirstOptions = {
  getFeatureMode: () => "skill-first" as const,
  sleep: () => Promise.resolve(),
};

describe("skill-run-service", () => {
  it("returns contract-unsupported when no consumer lock is present", async () => {
    const gateway = createSkillRunGatewayClient({ hasConsumerLock: false });
    const service = trackService(createSkillRunService({ gatewayClient: gateway }));
    const catalog = await service.listCatalog();
    expect(catalog.status).toBe("contract-unsupported");
    expect(catalog.tools).toEqual([]);
  });

  it("fails closed on start when feature mode is not skill-first", async () => {
    const gateway = createMockGateway();
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        getFeatureMode: () => "expert-compat",
      }),
    );
    const result = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-mode",
      sessionId: "session-abc",
      profileId: "profile-xyz",
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("START_DISABLED_FEATURE_MODE");
    }
    expect(gateway.callSkill).not.toHaveBeenCalled();
  });

  it("fails closed on start when feature mode is local-only and does not fall back to Expert", async () => {
    const gateway = createMockGateway();
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        getFeatureMode: () => "local-only",
      }),
    );
    const result = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-local-only",
      sessionId: "session-abc",
      profileId: "profile-xyz",
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("START_DISABLED_FEATURE_MODE");
    }
    expect(gateway.callSkill).not.toHaveBeenCalled();
  });

  it("fails closed on start when no consumer lock exists with START_DISABLED_NO_LOCK", async () => {
    const service = trackService(
      createSkillRunService({
        ...skillFirstOptions,
        gatewayClient: createSkillRunGatewayClient({ hasConsumerLock: false }),
      }),
    );
    const result = await service.start({
      toolName: "calculator",
      prompt: "hello world",
      clientRequestId: "req-123",
      sessionId: "session-abc",
      profileId: "profile-xyz",
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("START_DISABLED_NO_LOCK");
      expect(result.clientRequestId).toBe("req-123");
    }
  });

  it("rejects extra required parameters via bindPromptFirstTool", () => {
    const result = bindPromptFirstTool(
      "complex",
      "hello",
      [
        {
          toolName: "complex",
          title: "Complex",
          interactionMode: "chat",
          promptField: "prompt",
          supportsAttachments: false,
          callability: "unsupported",
          invocationMode: "parameters-required",
          reasonCode: "EXTRA_REQUIRED_PARAMETERS",
          inputSchema: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              region: { type: "string" },
            },
            required: ["prompt", "region"],
          },
        },
      ],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("SKILL_PARAMETERS_REQUIRED");
    }
  });

  it("binds promptField=query into callSkill arguments", async () => {
    const queryTool: SkillCatalogToolItem = {
      toolName: "search.skill",
      title: "Search",
      interactionMode: "chat",
      promptField: "query",
      supportsAttachments: false,
      callability: "callable",
      invocationMode: "prompt-first",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    };
    const gateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [queryTool] }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
      }),
    );
    const result = await service.start({
      toolName: "search.skill",
      prompt: "find customers",
      clientRequestId: "req-query",
      sessionId: "session-query",
      profileId: "default",
    });
    expect(result.accepted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(gateway.callSkill).toHaveBeenCalledWith({
      toolName: "search.skill",
      arguments: { query: "find customers" },
      idempotencyKey: "req-query",
    });
  });

  it("rejects tampered toolName not in catalog", async () => {
    const gateway = createMockGateway();
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
      }),
    );
    const result = await service.start({
      toolName: "not.published",
      prompt: "hello",
      clientRequestId: "req-tamper",
      sessionId: "session-tamper",
      profileId: "default",
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("TOOL_NOT_FOUND");
    }
    expect(gateway.callSkill).not.toHaveBeenCalled();
  });

  it("rejects unpublished skill after selection via Main revalidation", async () => {
    const gateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [] }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
      }),
    );
    const result = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-unpub",
      sessionId: "session-unpub",
      profileId: "default",
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("TOOL_NOT_FOUND");
    }
  });

  it("rejects second active start for the same session", async () => {
    const gateway = createMockGateway({
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => ({ done: true, value: undefined }),
          }),
        },
      }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
      }),
    );
    const input = {
      toolName: "calculator",
      prompt: "first",
      clientRequestId: "req-1",
      sessionId: "session-dup",
      profileId: "default",
    };
    const first = await service.start(input);
    expect(first.accepted).toBe(true);
    const second = await service.start({
      ...input,
      clientRequestId: "req-2",
      prompt: "second",
    });
    expect(second.accepted).toBe(false);
    if (!second.accepted) {
      expect(second.errorCode).toBe("RUN_ALREADY_ACTIVE");
    }
  });

  it("persists continuation before callSkill", async () => {
    const callOrder: string[] = [];
    const persistMock = vi.fn(() => {
      callOrder.push("persist");
    });
    const gateway = createMockGateway({
      callSkill: vi.fn(async () => {
        callOrder.push("call");
        return { runId: "run-persist", status: "starting" };
      }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
        onPersistContinuation: persistMock,
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-persist",
      sessionId: "session-persist",
      profileId: "default",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(persistMock).toHaveBeenCalled();
    expect(callOrder).toEqual(["persist", "call"]);
  });

  it("fails closed on cancel with NO_ACTIVE_RUN when run is not found", async () => {
    const service = trackService(
      createSkillRunService({
        gatewayClient: createSkillRunGatewayClient({ hasConsumerLock: false }),
      }),
    );
    const result = await service.cancel({
      clientRequestId: "req-123",
      sessionId: "session-abc",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("NO_ACTIVE_RUN");
  });

  it("returns feature mode from feature-mode store wiring", () => {
    const service = trackService(
      createSkillRunService({
        gatewayClient: createSkillRunGatewayClient({ hasConsumerLock: false }),
        getFeatureMode: () => "expert-compat",
      }),
    );
    expect(service.getFeatureMode()).toBe("expert-compat");
  });

  it("executes full lifecycle (pending -> starting -> running -> succeeded) with mock gateway when lock is present", async () => {
    const projections: SkillRunProjection[] = [];
    const mockGateway = createMockGateway();
    const upsertArtifactMock = vi.fn().mockResolvedValue(undefined);
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
        onUpsertArtifact: upsertArtifactMock,
      }),
    );
    service.subscribe((p) => projections.push({ ...p }));
    const startRes = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-calc-1",
      sessionId: "session-1",
      profileId: "default",
    });
    expect(startRes.accepted).toBe(true);
    if (startRes.accepted) {
      expect(startRes.projection.phase).toBe("pending-submit");
      expect(startRes.projection.clientRequestId).toBe("req-calc-1");
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(mockGateway.callSkill).toHaveBeenCalledWith({
      toolName: "calculator",
      arguments: { prompt: "2+2" },
      idempotencyKey: "req-calc-1",
    });
    const finalProjection = service.getProjection("req-calc-1");
    expect(finalProjection).not.toBeNull();
    expect(finalProjection?.providerRunId).toBe("run-xyz-999");
    expect(finalProjection?.phase).toBe("succeeded");
    expect(upsertArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-xyz-999",
        sessionId: "session-1",
      }),
    );
  });

  it("handles cancel cleanly and aborts polling", async () => {
    const mockGateway = createMockGateway({
      callSkill: vi.fn().mockResolvedValue({ runId: "run-cancel-1" }),
      getRunSnapshot: vi.fn().mockResolvedValue({ status: "running" }),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => ({ done: true, value: undefined }),
          }),
        },
      }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "sleep",
      clientRequestId: "req-cancel-1",
      sessionId: "s1",
      profileId: "p1",
    });
    const cancelRes = await service.cancel({
      clientRequestId: "req-cancel-1",
      sessionId: "s1",
    });
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.projection?.phase).toBe("cancelled");
    expect(mockGateway.cancelRun).toHaveBeenCalledWith("run-cancel-1");
  });

  it("reaches Bundle terminal via poll while SSE remains open", async () => {
    const mockGateway = createMockGateway({
      callSkill: vi.fn().mockResolvedValue({ runId: "run-hang-1", status: "starting" }),
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-hang-1",
        status: "succeeded",
        resultText: "poll terminal",
        artifacts: [],
      }),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: () =>
              new Promise<{ done: boolean; value?: Uint8Array }>(() => {
                // Intentionally hang until the run is aborted/disposed.
              }),
          }),
        },
      }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    const startRes = await service.start({
      toolName: "calculator",
      prompt: "hang",
      clientRequestId: "req-hang-1",
      sessionId: "session-hang",
      profileId: "default",
    });
    expect(startRes.accepted).toBe(true);

    const started = Date.now();
    let terminal = service.getProjection("req-hang-1");
    while (
      Date.now() - started < 2000 &&
      (!terminal || !["succeeded", "failed", "cancelled"].includes(terminal.phase))
    ) {
      await new Promise((r) => setTimeout(r, 20));
      terminal = service.getProjection("req-hang-1");
    }
    expect(terminal?.phase).toBe("succeeded");
    expect(terminal?.text).toBe("poll terminal");
    expect(mockGateway.getRunSnapshot).toHaveBeenCalled();
    expect(mockGateway.openEventStream).toHaveBeenCalled();
  });
});
