import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSkillRunGatewayClient, SkillRunGatewayClient } from "./skill-run-gateway-client";
import { bindPromptFirstTool } from "./skill-run-contract-parser";
import { createSkillRunService, type SkillRunService } from "./skill-run-service";
import {
  SKILL_RUN_IPC_CHANNELS,
  type SkillCatalogToolItem,
  type SkillRunProjection,
} from "../../shared/skill-run";

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

  it("binds extra required strings when extraParameters are supplied", () => {
    const catalogTool = {
      toolName: "complex",
      title: "Complex",
      interactionMode: "chat" as const,
      promptField: "prompt",
      supportsAttachments: false,
      callability: "callable" as const,
      invocationMode: "limited-parameter-form" as const,
      extraStringFields: [{ name: "region" }],
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          region: { type: "string" },
        },
        required: ["prompt", "region"],
      },
    };
    const missing = bindPromptFirstTool("complex", "hello", [catalogTool]);
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errorCode).toBe("SKILL_PARAMETERS_REQUIRED");
    }
    const result = bindPromptFirstTool("complex", "hello", [catalogTool], {
      region: "cn",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.arguments).toEqual({ prompt: "hello", region: "cn" });
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

  it("binds extra required strings into callSkill arguments", async () => {
    const extraTool: SkillCatalogToolItem = {
      toolName: "writer.extra",
      title: "Writer Extra",
      interactionMode: "chat",
      promptField: "prompt",
      supportsAttachments: false,
      callability: "callable",
      invocationMode: "limited-parameter-form",
      extraStringFields: [{ name: "region" }],
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          region: { type: "string" },
        },
        required: ["prompt", "region"],
      },
    };
    const gateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [extraTool] }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
      }),
    );
    const missing = await service.start({
      toolName: "writer.extra",
      prompt: "hello",
      clientRequestId: "req-extra-missing",
      sessionId: "session-extra",
      profileId: "default",
    });
    expect(missing.accepted).toBe(false);
    const unknown = await service.start({
      toolName: "writer.extra",
      prompt: "hello",
      clientRequestId: "req-extra-unknown",
      sessionId: "session-extra",
      profileId: "default",
      extraParameters: { region: "cn", forged: "nope" },
    });
    expect(unknown.accepted).toBe(false);
    expect(gateway.callSkill).not.toHaveBeenCalled();

    const result = await service.start({
      toolName: "writer.extra",
      prompt: "hello",
      clientRequestId: "req-extra-ok",
      sessionId: "session-extra-ok",
      profileId: "default",
      extraParameters: { region: "cn" },
    });
    expect(result.accepted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(gateway.callSkill).toHaveBeenCalledWith({
      toolName: "writer.extra",
      arguments: { prompt: "hello", region: "cn" },
      idempotencyKey: "req-extra-ok",
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

  it("records catalog, start, accepted, terminal, and artifact telemetry without secrets", async () => {
    const events: Array<{ event: string }> = [];
    const mockGateway = createMockGateway();
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
        recordTelemetry: (event) => {
          events.push(event);
        },
      }),
    );
    await service.listCatalog();
    await service.start({
      toolName: "calculator",
      prompt: "secret prompt body",
      clientRequestId: "req-telemetry-1",
      sessionId: "session-telemetry",
      profileId: "default",
    });
    await new Promise((r) => setTimeout(r, 200));
    const names = events.map((event) => event.event);
    expect(names).toContain("catalog");
    expect(names).toContain("start");
    expect(names).toContain("accepted");
    expect(names).toContain("terminal");
    expect(names).toContain("artifact");
    expect(JSON.stringify(events)).not.toContain("secret prompt body");
  });

  it("keeps start accepted when telemetry throws", async () => {
    const mockGateway = createMockGateway();
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
        recordTelemetry: () => {
          throw new Error("telemetry write failed");
        },
      }),
    );
    const result = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-telemetry-throw",
      sessionId: "session-telemetry-throw",
      profileId: "default",
    });
    expect(result.accepted).toBe(true);
    expect(mockGateway.callSkill).toHaveBeenCalled();
  });

  it("records duplicate-prevented when a second non-terminal start hits the same session", async () => {
    const events: Array<{ event: string }> = [];
    const mockGateway = createMockGateway({
      callSkill: vi.fn().mockResolvedValue({ runId: "run-dup-1", status: "starting" }),
      getRunSnapshot: vi.fn().mockResolvedValue({ status: "running" }),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: () =>
              new Promise<{ done: boolean; value?: Uint8Array }>(() => undefined),
          }),
        },
      }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
        recordTelemetry: (event) => {
          events.push(event);
        },
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "first",
      clientRequestId: "req-dup-a",
      sessionId: "session-dup",
      profileId: "default",
    });
    const second = await service.start({
      toolName: "calculator",
      prompt: "second",
      clientRequestId: "req-dup-b",
      sessionId: "session-dup",
      profileId: "default",
    });
    expect(second.accepted).toBe(false);
    expect(events.some((event) => event.event === "duplicate-prevented")).toBe(true);
  });

  it("projects sanitized activity from the four Bundle event types over SSE", async () => {
    const fixtures = [
      loadBundleFixture("run-event-reasoning-summary.json"),
      loadBundleFixture("run-event-tool-call.json"),
      loadBundleFixture("run-event-clarify-requested.json"),
      loadBundleFixture("run-event-approval-requested.json"),
    ];
    const completed = {
      event_id: "evt-done",
      event_type: "run.completed",
      event_seq: 99,
      payload: { text: "done" },
    };
    const mockGateway = createMockGateway({
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "running",
      }),
      openEventStream: vi.fn().mockResolvedValue(
        sseBodyFromChunks([
          encodeSseEvents([
            ...fixtures.map((fixture) => ({
              eventType: String(fixture.event_type),
              id: String(fixture.event_id),
              data: fixture,
            })),
            {
              eventType: "run.completed",
              id: "evt-done",
              data: completed,
            },
          ]),
        ]),
      ),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    const startRes = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-activity-1",
      sessionId: "session-activity",
      profileId: "default",
    });
    expect(startRes.accepted).toBe(true);

    const terminal = await waitForProjection(
      service,
      "req-activity-1",
      (p) => p.phase === "succeeded" && (p.activities?.length ?? 0) === 4,
    );
    expect(terminal?.phase).toBe("succeeded");
    expect(terminal?.activities?.map((item) => item.kind)).toEqual([
      "reasoning.summary",
      "tool.call",
      "clarify.requested",
      "approval.requested",
    ]);
    expect(terminal?.activities?.[1]).toEqual({
      eventId: "evt-2",
      kind: "tool.call",
      toolName: "search",
      callId: "call-1",
      status: "started",
    });
    expect(JSON.stringify(terminal?.activities)).not.toContain("arguments");
    expect(Object.keys(SKILL_RUN_IPC_CHANNELS)).toEqual(
      expect.arrayContaining([
        "START",
        "CANCEL",
        "ON_PROJECTION_CHANGED",
      ]),
    );
    expect(Object.values(SKILL_RUN_IPC_CHANNELS)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("activity")]),
    );
  });

  it("sets waiting-approval from approval.requested and does not rewind a succeeded run", async () => {
    const approval = loadBundleFixture("run-event-approval-requested.json");
    let approvalReads = 0;
    const mockGateway = createMockGateway({
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "running",
      }),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              approvalReads += 1;
              if (approvalReads === 1) {
                return {
                  done: false,
                  value: encodeSseEvents([
                    {
                      eventType: "approval.requested",
                      id: String(approval.event_id),
                      data: approval,
                    },
                  ]),
                };
              }
              return new Promise<{ done: boolean; value?: Uint8Array }>(() => undefined);
            },
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
      prompt: "approve",
      clientRequestId: "req-approval-wait",
      sessionId: "session-approval-wait",
      profileId: "default",
    });
    const waiting = await waitForProjection(
      service,
      "req-approval-wait",
      (p) => p.phase === "waiting-approval",
    );
    expect(waiting?.phase).toBe("waiting-approval");
    expect(waiting?.activities?.[0]).toMatchObject({
      kind: "approval.requested",
      approvalId: "appr-1",
      summary: "delete file",
    });

    let serviceRewind: SkillRunService | undefined;
    let reads = 0;
    const rewindGateway = createMockGateway({
      callSkill: vi.fn().mockResolvedValue({ runId: "run-rewind", status: "starting" }),
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-rewind",
        status: "succeeded",
        resultText: "already done",
        artifacts: [],
      }),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              reads += 1;
              if (reads === 1) {
                const started = Date.now();
                while (Date.now() - started < 2000) {
                  const current = serviceRewind?.getProjection("req-rewind");
                  if (current?.phase === "succeeded") break;
                  await new Promise((r) => setTimeout(r, 10));
                }
                return {
                  done: false,
                  value: encodeSseEvents([
                    {
                      eventType: "approval.requested",
                      id: "evt-late-approval",
                      data: {
                        ...approval,
                        event_id: "evt-late-approval",
                      },
                    },
                  ]),
                };
              }
              return { done: true, value: undefined };
            },
          }),
        },
      }),
    });
    serviceRewind = trackService(
      createSkillRunService({
        gatewayClient: rewindGateway,
        ...skillFirstOptions,
      }),
    );
    await serviceRewind.start({
      toolName: "calculator",
      prompt: "rewind",
      clientRequestId: "req-rewind",
      sessionId: "session-rewind",
      profileId: "default",
    });
    const succeeded = await waitForProjection(
      serviceRewind,
      "req-rewind",
      (p) => p.phase === "succeeded",
    );
    expect(succeeded?.phase).toBe("succeeded");
    await new Promise((r) => setTimeout(r, 80));
    expect(serviceRewind.getProjection("req-rewind")?.phase).toBe("succeeded");
    expect(serviceRewind.getProjection("req-rewind")?.displayStage).not.toBe(
      "Waiting for approval...",
    );
  });

  it("dedupes activity by event_id", async () => {
    const fixture = loadBundleFixture("run-event-reasoning-summary.json");
    const mockGateway = createMockGateway({
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "running",
      }),
      openEventStream: vi.fn().mockResolvedValue(
        sseBodyFromChunks([
          encodeSseEvents([
            {
              eventType: "reasoning.summary",
              id: "sse-dup-a",
              data: fixture,
            },
            {
              eventType: "reasoning.summary",
              id: "sse-dup-b",
              data: fixture,
            },
            {
              eventType: "run.completed",
              id: "evt-dup-done",
              data: {
                event_id: "evt-dup-done",
                event_type: "run.completed",
                event_seq: 99,
                payload: { text: "done" },
              },
            },
          ]),
        ]),
      ),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "dedupe",
      clientRequestId: "req-dedupe",
      sessionId: "session-dedupe",
      profileId: "default",
    });
    const terminal = await waitForProjection(
      service,
      "req-dedupe",
      (p) => p.phase === "succeeded" && (p.activities?.length ?? 0) > 0,
    );
    expect(terminal?.activities).toHaveLength(1);
    expect(terminal?.activities?.[0]?.eventId).toBe("evt-4");
  });

  it("caps the activity list at 32", async () => {
    const reasoningEvents = Array.from({ length: 33 }, (_, index) => {
      const seq = index + 1;
      return {
        event_id: `evt-bound-${seq}`,
        run_id: "run-1",
        event_type: "reasoning.summary",
        event_seq: seq,
        timestamp: "2026-08-31T00:00:00Z",
        payload: { summary: `step ${seq}` },
      };
    });
    const mockGateway = createMockGateway({
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "running",
      }),
      openEventStream: vi.fn().mockResolvedValue(
        sseBodyFromChunks([
          encodeSseEvents([
            ...reasoningEvents.map((fixture) => ({
              eventType: "reasoning.summary",
              id: String(fixture.event_id),
              data: fixture,
            })),
            {
              eventType: "run.completed",
              id: "evt-bound-done",
              data: {
                event_id: "evt-bound-done",
                event_type: "run.completed",
                event_seq: 99,
                payload: { text: "done" },
              },
            },
          ]),
        ]),
      ),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "bound",
      clientRequestId: "req-bound",
      sessionId: "session-bound",
      profileId: "default",
    });
    const terminal = await waitForProjection(
      service,
      "req-bound",
      (p) => p.phase === "succeeded" && (p.activities?.length ?? 0) > 0,
    );
    expect(terminal?.activities).toHaveLength(32);
    expect(terminal?.activities?.[0]?.eventId).toBe("evt-bound-2");
    expect(terminal?.activities?.[31]?.eventId).toBe("evt-bound-33");
    expect(
      terminal?.activities?.some((item) => item.eventId === "evt-bound-1"),
    ).toBe(false);
  });
});

function loadBundleFixture(name: string): Record<string, unknown> {
  const relative = join("contracts", "skill-run", "v1.2.1", "fixtures", name);
  const fromCwd = join(process.cwd(), relative);
  const fromWork = join(process.cwd(), "..", "..", relative);
  const path = existsSync(fromCwd) ? fromCwd : fromWork;
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function encodeSseEvents(
  events: Array<{
    eventType: string;
    id: string;
    data: Record<string, unknown>;
  }>,
): Uint8Array {
  const body = events
    .map(
      (event) =>
        `event: ${event.eventType}\nid: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`,
    )
    .join("");
  return new TextEncoder().encode(body);
}

function sseBodyFromChunks(chunks: Uint8Array[]) {
  let index = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (index >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: chunks[index++] };
        },
      }),
    },
  };
}

async function waitForProjection(
  service: SkillRunService,
  clientRequestId: string,
  predicate: (projection: SkillRunProjection) => boolean,
  timeoutMs = 2000,
): Promise<SkillRunProjection | null> {
  const started = Date.now();
  let current = service.getProjection(clientRequestId);
  while (Date.now() - started < timeoutMs) {
    if (current && predicate(current)) return current;
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = service.getProjection(clientRequestId);
  }
  return current;
}
