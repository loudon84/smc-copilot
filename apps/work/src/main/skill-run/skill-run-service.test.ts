import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSkillRunGatewayClient, SkillRunGatewayClient, SkillRunGatewayError } from "./skill-run-gateway-client";
import {
  FAVORITE_UNKNOWN_TOOL,
  createSkillRunCatalogPreferenceStore,
} from "./skill-run-catalog-preference-store";
import { bindPromptFirstTool } from "./skill-run-contract-parser";
import { createSkillRunService, type SkillRunService } from "./skill-run-service";
import {
  SKILL_RUN_IPC_CHANNELS,
  projectSkillRunActivitiesToNativeRows,
  type SkillCatalogToolItem,
  type SkillRunProjection,
} from "../../shared/skill-run";
import type { ManagedFile } from "../../shared/files";

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
      artifacts: [{ id: "art-1", file_name: "output.txt" }],
    }),
    getRunResult: vi.fn().mockResolvedValue({
      runId: "run-xyz-999",
      status: "succeeded",
      text: null,
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
    hasApprovalDecisionBundle: () => true,
    hasAttachmentBundle: () => true,
    uploadAttachment: vi.fn().mockRejectedValue(
      new SkillRunGatewayError(
        "uploadAttachment not expected",
        500,
        "ATTACHMENT_NOT_SUPPORTED",
      ),
    ),
    decideApproval: vi.fn().mockResolvedValue({
      runId: "run-xyz-999",
      approvalId: "appr-1",
      decision: "allow",
      status: "WAITING_APPROVAL",
      decidedAt: "2026-01-01T00:00:00.000Z",
    }),
    getAuthScopeKey: vi.fn(() => "test-scope"),
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
  it("rejects a conflicting accepted session tool before calling the Provider", async () => {
    const gateway = createMockGateway();
    const service = trackService(createSkillRunService({
      gatewayClient: gateway,
      ...skillFirstOptions,
      lockSessionTool: () => ({ status: "conflict", existing: {
        executionMode: "skill-run" as const,
        toolName: "writer.article",
        toolTitle: "Writer",
        updatedAt: "2026-09-09T00:00:00.000Z",
      } }),
    }));

    const result = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-locked-tool",
      sessionId: "session-locked-tool",
      profileId: "default",
    });

    expect(result).toMatchObject({ accepted: false, errorCode: "SKILL_SESSION_TOOL_LOCKED" });
    expect(gateway.callSkill).not.toHaveBeenCalled();
  });
  it("returns contract-unsupported when no consumer lock is present", async () => {
    const gateway = createSkillRunGatewayClient({ hasConsumerLock: false });
    const service = trackService(createSkillRunService({ gatewayClient: gateway }));
    const catalog = await service.listCatalog();
    expect(catalog.status).toBe("contract-unsupported");
    expect(catalog.tools).toEqual([]);
  });

  it("fails closed on start when feature mode is not skill-first", async () => {
    const gateway = createMockGateway();
    const persistContinuation = vi.fn();
    const persistSanitizedRun = vi.fn();
    const persistSanitizedActivity = vi.fn();
    const onUpsertArtifact = vi.fn();
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        getFeatureMode: () => "expert-compat",
        onPersistContinuation: persistContinuation,
        onPersistSanitizedRun: persistSanitizedRun,
        onPersistSanitizedActivity: persistSanitizedActivity,
        onUpsertArtifact,
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
    expect(persistContinuation).not.toHaveBeenCalled();
    expect(persistSanitizedRun).not.toHaveBeenCalled();
    expect(persistSanitizedActivity).not.toHaveBeenCalled();
    expect(onUpsertArtifact).not.toHaveBeenCalled();
  });

  it("fails closed on start when feature mode is local-only and does not fall back to Expert", async () => {
    const gateway = createMockGateway();
    const persistContinuation = vi.fn();
    const persistSanitizedRun = vi.fn();
    const persistSanitizedActivity = vi.fn();
    const onUpsertArtifact = vi.fn();
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        getFeatureMode: () => "local-only",
        onPersistContinuation: persistContinuation,
        onPersistSanitizedRun: persistSanitizedRun,
        onPersistSanitizedActivity: persistSanitizedActivity,
        onUpsertArtifact,
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
    expect(persistContinuation).not.toHaveBeenCalled();
    expect(persistSanitizedRun).not.toHaveBeenCalled();
    expect(persistSanitizedActivity).not.toHaveBeenCalled();
    expect(onUpsertArtifact).not.toHaveBeenCalled();
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
        artifacts: [],
      }),
      getRunResult: vi.fn().mockResolvedValue({
        runId: "run-hang-1",
        status: "succeeded",
        text: "poll terminal",
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
    expect(terminal?.activities?.map((item) => item.ordinal)).toEqual([1, 2, 3, 4]);
    expect(terminal?.activities?.[1]).toEqual({
      eventId: "evt-2",
      kind: "tool.call",
      toolName: "search",
      callId: "call-1",
      status: "started",
      ordinal: 2,
    });
    const nativeRows = projectSkillRunActivitiesToNativeRows(
      "req-activity-1",
      terminal?.activities ?? [],
    );
    expect(nativeRows.map((row) => row.kind)).toEqual([
      "reasoning",
      "tool_call",
      "notice",
      "notice",
    ]);
    expect(nativeRows[1]).toMatchObject({
      id: "skill-run:req-activity-1:tool:call-1",
      ordinal: 2,
      callId: "call-1",
    });
    expect(JSON.stringify(terminal?.activities)).not.toContain("arguments");
    expect(JSON.stringify(nativeRows)).not.toContain("arguments");
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

  it("keeps one Native tool row identity across started to completed", () => {
    const rows = projectSkillRunActivitiesToNativeRows("req-tool-lifecycle", [
      {
        eventId: "evt-reason",
        kind: "reasoning.summary",
        summary: "think",
        ordinal: 1,
      },
      {
        eventId: "evt-tool-start",
        kind: "tool.call",
        toolName: "search",
        callId: "call-9",
        status: "started",
        ordinal: 2,
      },
      {
        eventId: "evt-tool-done",
        kind: "tool.call",
        toolName: "search",
        callId: "call-9",
        status: "completed",
        ordinal: 3,
      },
      {
        eventId: "evt-notice",
        kind: "clarify.requested",
        question: "which file?",
        ordinal: 4,
      },
    ]);
    expect(rows).toEqual([
      {
        id: "skill-run:req-tool-lifecycle:activity:evt-reason",
        kind: "reasoning",
        ordinal: 1,
        eventId: "evt-reason",
        summary: "think",
      },
      {
        id: "skill-run:req-tool-lifecycle:tool:call-9",
        kind: "tool_call",
        ordinal: 2,
        eventId: "evt-tool-done",
        callId: "call-9",
        toolName: "search",
        status: "completed",
      },
      {
        id: "skill-run:req-tool-lifecycle:activity:evt-notice",
        kind: "notice",
        ordinal: 4,
        eventId: "evt-notice",
        question: "which file?",
      },
    ]);
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

  it("allow keeps waiting-approval on non-terminal receipt and reuses the decision key", async () => {
    const approval = loadBundleFixture("run-event-approval-requested.json");
    const decideApproval = vi.fn().mockResolvedValue({
      runId: "run-xyz-999",
      approvalId: "appr-1",
      decision: "allow",
      status: "WAITING_APPROVAL",
      decidedAt: "2026-01-01T00:00:00.000Z",
    });
    let emitted = false;
    const mockGateway = createMockGateway({
      decideApproval,
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "WAITING_APPROVAL",
      }),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (!emitted) {
                emitted = true;
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
      clientRequestId: "req-decide-allow",
      sessionId: "session-decide-allow",
      profileId: "default",
    });
    await waitForProjection(
      service,
      "req-decide-allow",
      (p) => p.phase === "waiting-approval",
    );
    const first = await service.decideApproval({
      clientRequestId: "req-decide-allow",
      sessionId: "session-decide-allow",
      decision: "allow",
    });
    expect(first.success).toBe(true);
    expect(first.projection?.phase).toBe("waiting-approval");
    expect(first.projection?.decidedApprovalId).toBe("appr-1");
    const replay = await service.decideApproval({
      clientRequestId: "req-decide-allow",
      sessionId: "session-decide-allow",
      decision: "allow",
    });
    expect(replay.success).toBe(true);
    expect(decideApproval).toHaveBeenCalledTimes(2);
    expect(decideApproval.mock.calls[0][0].idempotencyKey).toBe(
      decideApproval.mock.calls[1][0].idempotencyKey,
    );
    expect(decideApproval.mock.calls[0][0].idempotencyKey).not.toBe("req-decide-allow");
    expect(decideApproval.mock.calls[0][0]).toMatchObject({
      runId: "run-xyz-999",
      approvalId: "appr-1",
      decision: "allow",
    });
    expect(mockGateway.callSkill).toHaveBeenCalledTimes(1);
    const blocked = await service.start({
      toolName: "calculator",
      prompt: "second",
      clientRequestId: "req-decide-allow-2",
      sessionId: "session-decide-allow",
      profileId: "default",
    });
    expect(blocked).toMatchObject({
      accepted: false,
      errorCode: "RUN_ALREADY_ACTIVE",
    });
  });

  it("maps deny receipts through Public status and never forces cancelled", async () => {
    const approval = loadBundleFixture("run-event-approval-requested.json");
    function hangingApprovalGateway(
      decideApproval: ReturnType<typeof vi.fn>,
    ): SkillRunGatewayClient {
      let emitted = false;
      return createMockGateway({
        decideApproval:
          decideApproval as SkillRunGatewayClient["decideApproval"],
        getRunSnapshot: vi.fn().mockResolvedValue({
          runId: "run-xyz-999",
          status: "WAITING_APPROVAL",
        }),
        openEventStream: vi.fn().mockResolvedValue({
          ok: true,
          body: {
            getReader: () => ({
              read: async () => {
                if (!emitted) {
                  emitted = true;
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
    }

    const completedGateway = hangingApprovalGateway(
      vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        approvalId: "appr-1",
        decision: "deny",
        status: "COMPLETED",
        decidedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const completedService = trackService(
      createSkillRunService({
        gatewayClient: completedGateway,
        ...skillFirstOptions,
      }),
    );
    await completedService.start({
      toolName: "calculator",
      prompt: "deny-completed",
      clientRequestId: "req-deny-completed",
      sessionId: "session-deny-completed",
      profileId: "default",
    });
    await waitForProjection(
      completedService,
      "req-deny-completed",
      (p) => p.phase === "waiting-approval",
    );
    const completed = await completedService.decideApproval({
      clientRequestId: "req-deny-completed",
      sessionId: "session-deny-completed",
      decision: "deny",
    });
    expect(completed.projection?.phase).toBe("succeeded");
    expect(completed.projection?.phase).not.toBe("cancelled");

    const failedGateway = hangingApprovalGateway(
      vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        approvalId: "appr-1",
        decision: "deny",
        status: "FAILED",
        decidedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const failedService = trackService(
      createSkillRunService({
        gatewayClient: failedGateway,
        ...skillFirstOptions,
      }),
    );
    await failedService.start({
      toolName: "calculator",
      prompt: "deny-failed",
      clientRequestId: "req-deny-failed",
      sessionId: "session-deny-failed",
      profileId: "default",
    });
    await waitForProjection(
      failedService,
      "req-deny-failed",
      (p) => p.phase === "waiting-approval",
    );
    const failed = await failedService.decideApproval({
      clientRequestId: "req-deny-failed",
      sessionId: "session-deny-failed",
      decision: "deny",
    });
    expect(failed.projection?.phase).toBe("failed");
    expect(failed.projection?.phase).not.toBe("cancelled");
  });

  it("rejects ineligible decisions without HTTP and does not rewind terminal on 409", async () => {
    const runningGateway = createMockGateway({
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => new Promise<{ done: boolean; value?: Uint8Array }>(() => undefined),
          }),
        },
      }),
    });
    const runningService = trackService(
      createSkillRunService({
        gatewayClient: runningGateway,
        ...skillFirstOptions,
      }),
    );
    await runningService.start({
      toolName: "calculator",
      prompt: "running",
      clientRequestId: "req-running-decide",
      sessionId: "session-running-decide",
      profileId: "default",
    });
    await waitForProjection(
      runningService,
      "req-running-decide",
      (p) => p.phase === "running",
    );
    const runningResult = await runningService.decideApproval({
      clientRequestId: "req-running-decide",
      sessionId: "session-running-decide",
      decision: "allow",
    });
    expect(runningResult.errorCode).toBe("APPROVAL_NOT_WAITING");
    expect(runningGateway.decideApproval).not.toHaveBeenCalled();

    const approval = loadBundleFixture("run-event-approval-requested.json");
    let unsupportedEmitted = false;
    const unsupportedGateway = createMockGateway({
      hasApprovalDecisionBundle: () => false,
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "WAITING_APPROVAL",
      }),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (!unsupportedEmitted) {
                unsupportedEmitted = true;
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
    const unsupportedService = trackService(
      createSkillRunService({
        gatewayClient: unsupportedGateway,
        ...skillFirstOptions,
      }),
    );
    await unsupportedService.start({
      toolName: "calculator",
      prompt: "unsupported",
      clientRequestId: "req-unsupported-decide",
      sessionId: "session-unsupported-decide",
      profileId: "default",
    });
    await waitForProjection(
      unsupportedService,
      "req-unsupported-decide",
      (p) => p.phase === "waiting-approval",
    );
    const unsupported = await unsupportedService.decideApproval({
      clientRequestId: "req-unsupported-decide",
      sessionId: "session-unsupported-decide",
      decision: "allow",
    });
    expect(unsupported.errorCode).toBe("APPROVAL_DECISION_UNSUPPORTED");
    expect(unsupportedGateway.decideApproval).not.toHaveBeenCalled();

    const missingIdGateway = createMockGateway({
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "WAITING_APPROVAL",
      }),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => new Promise<{ done: boolean; value?: Uint8Array }>(() => undefined),
          }),
        },
      }),
    });
    const missingIdService = trackService(
      createSkillRunService({
        gatewayClient: missingIdGateway,
        ...skillFirstOptions,
      }),
    );
    await missingIdService.start({
      toolName: "calculator",
      prompt: "missing-id",
      clientRequestId: "req-missing-approval",
      sessionId: "session-missing-approval",
      profileId: "default",
    });
    await waitForProjection(
      missingIdService,
      "req-missing-approval",
      (p) => p.phase === "waiting-approval",
    );
    const missing = await missingIdService.decideApproval({
      clientRequestId: "req-missing-approval",
      sessionId: "session-missing-approval",
      decision: "allow",
    });
    expect(missing.errorCode).toBe("APPROVAL_ID_MISSING");
    expect(missingIdGateway.decideApproval).not.toHaveBeenCalled();

    const alreadyGateway = hangingApprovalForConflict();
    function hangingApprovalForConflict(): SkillRunGatewayClient {
      let emitted = false;
      return createMockGateway({
        decideApproval: vi.fn().mockRejectedValue(
          new SkillRunGatewayError("already decided", 409, "APPROVAL_ALREADY_DECIDED"),
        ),
        getRunSnapshot: vi.fn().mockResolvedValue({
          runId: "run-xyz-999",
          status: "WAITING_APPROVAL",
        }),
        openEventStream: vi.fn().mockResolvedValue({
          ok: true,
          body: {
            getReader: () => ({
              read: async () => {
                if (!emitted) {
                  emitted = true;
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
    }
    const conflictService = trackService(
      createSkillRunService({
        gatewayClient: alreadyGateway,
        ...skillFirstOptions,
      }),
    );
    await conflictService.start({
      toolName: "calculator",
      prompt: "conflict",
      clientRequestId: "req-conflict-decide",
      sessionId: "session-conflict-decide",
      profileId: "default",
    });
    await waitForProjection(
      conflictService,
      "req-conflict-decide",
      (p) => p.phase === "waiting-approval",
    );
    const conflict = await conflictService.decideApproval({
      clientRequestId: "req-conflict-decide",
      sessionId: "session-conflict-decide",
      decision: "allow",
    });
    expect(conflict.success).toBe(false);
    expect(conflict.errorCode).toBe("APPROVAL_ALREADY_DECIDED");
    expect(conflict.projection?.phase).toBe("waiting-approval");

    const rewindService = trackService(
      createSkillRunService({
        gatewayClient: createMockGateway({
          decideApproval: vi.fn().mockRejectedValue(
            new SkillRunGatewayError("already decided", 409, "APPROVAL_ALREADY_DECIDED"),
          ),
          getRunSnapshot: vi.fn().mockResolvedValue({
            runId: "run-xyz-999",
            status: "succeeded",
            resultText: "done",
            artifacts: [],
          }),
        }),
        ...skillFirstOptions,
      }),
    );
    await rewindService.start({
      toolName: "calculator",
      prompt: "rewind-decide",
      clientRequestId: "req-rewind-decide",
      sessionId: "session-rewind-decide",
      profileId: "default",
    });
    const succeeded = await waitForProjection(
      rewindService,
      "req-rewind-decide",
      (p) => p.phase === "succeeded",
    );
    expect(succeeded?.phase).toBe("succeeded");
    const rewind = await rewindService.decideApproval({
      clientRequestId: "req-rewind-decide",
      sessionId: "session-rewind-decide",
      decision: "allow",
    });
    expect(rewind.errorCode).toBe("APPROVAL_NOT_WAITING");
    expect(rewindService.getProjection("req-rewind-decide")?.phase).toBe("succeeded");
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

  it("persists every sanitized activity before the live cap and keeps Prompt off Projection", async () => {
    const longPrompt = `durable-prompt-${"x".repeat(160)}`;
    const reasoningEvents = Array.from({ length: 100 }, (_, index) => {
      const seq = index + 1;
      return {
        event_id: `evt-persist-${seq}`,
        run_id: "run-1",
        event_type: "reasoning.summary",
        event_seq: seq,
        timestamp: "2026-08-31T00:00:00Z",
        payload: { summary: `step ${seq}` },
      };
    });
    const persisted: Array<{ eventId: string; ordinal: number; prompt?: string }> = [];
    const runSnapshots: Array<{ prompt: string; auditComplete: boolean; phase: string }> = [];
    const mockGateway = createMockGateway({
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "running",
      }),
      openEventStream: vi.fn().mockResolvedValue(
        sseBodyFromChunks([
          encodeSseEvents([
            {
              eventType: "not.a.real.event",
              id: "sse-raw-skip",
              data: {
                event_id: "evt-raw-skip",
                event_type: "not.a.real.event",
                event_seq: 0,
                payload: { secret: "nope", arguments: { x: 1 } },
              },
            },
            ...reasoningEvents.map((fixture) => ({
              eventType: "reasoning.summary",
              id: String(fixture.event_id),
              data: fixture,
            })),
            {
              eventType: "run.completed",
              id: "evt-persist-done",
              data: {
                event_id: "evt-persist-done",
                event_type: "run.completed",
                event_seq: 200,
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
        onPersistSanitizedActivity: (record) => {
          persisted.push({ eventId: record.eventId, ordinal: record.ordinal });
        },
        onPersistSanitizedRun: (snapshot) => {
          runSnapshots.push({
            prompt: snapshot.prompt,
            auditComplete: snapshot.auditComplete,
            phase: snapshot.phase,
          });
        },
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: longPrompt,
      clientRequestId: "req-persist-100",
      sessionId: "session-persist-100",
      profileId: "default",
    });
    const terminal = await waitForProjection(
      service,
      "req-persist-100",
      (p) => p.phase === "succeeded" && (p.activities?.length ?? 0) === 32,
    );
    expect(persisted).toHaveLength(100);
    expect(persisted[0]).toEqual({ eventId: "evt-persist-1", ordinal: 1 });
    expect(persisted[99]).toEqual({ eventId: "evt-persist-100", ordinal: 100 });
    expect(persisted.some((item) => item.eventId === "evt-raw-skip")).toBe(false);
    expect(terminal?.activities).toHaveLength(32);
    expect(terminal?.activities?.[0]).toMatchObject({
      eventId: "evt-persist-69",
      ordinal: 69,
    });
    expect(terminal?.activities?.[31]).toMatchObject({
      eventId: "evt-persist-100",
      ordinal: 100,
    });
    expect(JSON.stringify(terminal)).not.toContain("x".repeat(160));
    expect(runSnapshots.some((row) => row.prompt === longPrompt)).toBe(true);
    expect(runSnapshots.some((row) => row.phase === "succeeded")).toBe(true);
  });

  it("keeps Provider phase when the durable activity writer throws and marks later snapshots incomplete", async () => {
    const fixture = loadBundleFixture("run-event-reasoning-summary.json");
    const runSnapshots: Array<{ auditComplete: boolean; phase: string }> = [];
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
              id: "sse-writer-fail",
              data: fixture,
            },
            {
              eventType: "run.completed",
              id: "evt-writer-fail-done",
              data: {
                event_id: "evt-writer-fail-done",
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
        onPersistSanitizedActivity: () => {
          throw new Error("disk full");
        },
        onPersistSanitizedRun: (snapshot) => {
          runSnapshots.push({
            auditComplete: snapshot.auditComplete,
            phase: snapshot.phase,
          });
        },
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "writer-fail",
      clientRequestId: "req-writer-fail",
      sessionId: "session-writer-fail",
      profileId: "default",
    });
    const terminal = await waitForProjection(
      service,
      "req-writer-fail",
      (p) => p.phase === "succeeded",
    );
    expect(terminal?.phase).toBe("succeeded");
    expect(terminal?.activities).toHaveLength(1);
    expect(
      runSnapshots.some((row) => row.phase === "succeeded" && row.auditComplete === false),
    ).toBe(true);
  });

  it("does not persist duplicate activity event ids", async () => {
    const fixture = loadBundleFixture("run-event-reasoning-summary.json");
    const persisted: string[] = [];
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
              id: "evt-dup-persist-done",
              data: {
                event_id: "evt-dup-persist-done",
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
        onPersistSanitizedActivity: (record) => {
          persisted.push(record.eventId);
        },
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "dedupe-persist",
      clientRequestId: "req-dedupe-persist",
      sessionId: "session-dedupe-persist",
      profileId: "default",
    });
    await waitForProjection(
      service,
      "req-dedupe-persist",
      (p) => p.phase === "succeeded" && (p.activities?.length ?? 0) > 0,
    );
    expect(persisted).toEqual(["evt-4"]);
  });

  it("overlays favorite flags from the preference store without clearing the Gateway cache", async () => {
    const file = join(tmpdir(), `skill-run-pref-overlay-${Date.now()}.json`);
    const store = createSkillRunCatalogPreferenceStore({ getPath: () => file });
    const mockGateway = createMockGateway();
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        catalogPreferenceStore: store,
        ...skillFirstOptions,
      }),
    );
    const before = await service.listCatalog();
    expect(before.tools[0]?.favorited).toBe(false);
    const updated = await service.setCatalogFavorite({
      toolName: "calculator",
      favorited: true,
    });
    expect(updated.tools[0]?.favorited).toBe(true);
    expect(mockGateway.clearCache).not.toHaveBeenCalled();
    expect(mockGateway.listCatalog).toHaveBeenCalledTimes(2);

    await expect(
      service.setCatalogFavorite({ toolName: "ghost", favorited: true }),
    ).rejects.toMatchObject({ errorCode: FAVORITE_UNKNOWN_TOOL });
    expect(mockGateway.clearCache).not.toHaveBeenCalled();
    if (existsSync(file)) rmSync(file);
  });

  it("records recent only on accepted start and keeps non-ready catalogs empty", async () => {
    const file = join(tmpdir(), `skill-run-pref-recent-${Date.now()}.json`);
    const store = createSkillRunCatalogPreferenceStore({ getPath: () => file });
    const mockGateway = createMockGateway();
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        catalogPreferenceStore: store,
        ...skillFirstOptions,
      }),
    );
    const rejected = await service.start({
      toolName: "not.published",
      prompt: "hello",
      clientRequestId: "req-recent-reject",
      sessionId: "session-recent-reject",
      profileId: "default",
    });
    expect(rejected.accepted).toBe(false);
    const afterReject = await service.listCatalog();
    expect(afterReject.tools[0]?.recentRank).toBeUndefined();

    const accepted = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-recent-ok",
      sessionId: "session-recent-ok",
      profileId: "default",
    });
    expect(accepted.accepted).toBe(true);
    const afterAccept = await service.listCatalog();
    expect(afterAccept.tools[0]?.recentRank).toBe(1);

    const replay = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-recent-ok",
      sessionId: "session-recent-ok",
      profileId: "default",
    });
    expect(replay.accepted).toBe(true);
    const afterReplay = await service.listCatalog();
    expect(afterReplay.tools[0]?.recentRank).toBe(1);

    const unsupportedGateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({
        status: "contract-unsupported",
        tools: [],
      }),
    });
    const unsupported = trackService(
      createSkillRunService({
        gatewayClient: unsupportedGateway,
        catalogPreferenceStore: store,
        ...skillFirstOptions,
      }),
    );
    const catalog = await unsupported.listCatalog();
    expect(catalog.status).toBe("contract-unsupported");
    expect(catalog.tools).toEqual([]);
    if (existsSync(file)) rmSync(file);
  });
});

describe("skill-run-service attachment upload bind", () => {
  const attachableTool: SkillCatalogToolItem = {
    ...callableTool,
    toolName: "writer.article",
    title: "Writer",
    supportsAttachments: true,
  };

  function localFile(id: string, overrides: Partial<ManagedFile> = {}): ManagedFile {
    return {
      id,
      profileId: "profile-xyz",
      name: `${id}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      category: "pdf",
      source: "picker",
      status: "ready",
      size: 3,
      managedPath: `E:\\staged\\${id}.pdf`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      locality: "local",
      ...overrides,
    };
  }

  function startInput(
    overrides: {
      fileIds?: string[];
      toolName?: string;
      clientRequestId?: string;
    } = {},
  ) {
    return {
      toolName: overrides.toolName ?? "writer.article",
      prompt: "hello",
      clientRequestId: overrides.clientRequestId ?? "req-att",
      sessionId: "session-att",
      profileId: "profile-xyz",
      ...(overrides.fileIds ? { fileIds: overrides.fileIds } : {}),
    };
  }

  it("uploads then callSkill with refs in user order", async () => {
    const files = new Map<string, ManagedFile>([
      ["file-a", localFile("file-a")],
      ["file-b", localFile("file-b")],
    ]);
    const uploadOrder: string[] = [];
    const gateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [attachableTool] }),
      hasAttachmentBundle: () => true,
      uploadAttachment: vi.fn(async (input: { filename: string }) => {
        uploadOrder.push(input.filename);
        return {
          attachmentRef: input.filename.startsWith("file-a") ? "att_first" : "att_second",
          name: input.filename,
          sizeBytes: 3,
          checksumSha256: "aa".repeat(32),
          contentType: "application/pdf",
          expiresAt: "2026-09-09T00:00:00Z",
        };
      }),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: () =>
              new Promise<{ done: boolean; value?: Uint8Array }>(() => {
                // Keep the run non-terminal so start cannot upsert artifacts.
              }),
          }),
        },
      }),
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "running",
      }),
    });
    const upsertArtifact = vi.fn();
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
        getManagedFile: (profileId, fileId) => {
          expect(profileId).toBe("profile-xyz");
          return files.get(fileId) ?? null;
        },
        readManagedFileBytes: async () => new Uint8Array([1, 2, 3]),
        onUpsertArtifact: upsertArtifact,
      }),
    );
    const result = await service.start(
      startInput({ fileIds: ["file-a", "file-b"], clientRequestId: "req-att-ok" }),
    );
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(JSON.stringify(result.projection)).not.toMatch(/att_/);
    }
    await waitForProjection(
      service,
      "req-att-ok",
      (projection) => projection.phase === "running",
    );
    expect(uploadOrder).toEqual(["file-a.pdf", "file-b.pdf"]);
    expect(gateway.callSkill).toHaveBeenCalledWith({
      toolName: "writer.article",
      arguments: { prompt: "hello" },
      idempotencyKey: "req-att-ok",
      attachmentRefs: ["att_first", "att_second"],
    });
    expect(upsertArtifact).not.toHaveBeenCalled();
  });

  it("does not upload on prompt-only start", async () => {
    const gateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [attachableTool] }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
        getManagedFile: () => {
          throw new Error("getManagedFile must not run for prompt-only start");
        },
      }),
    );
    const result = await service.start(startInput({ clientRequestId: "req-att-plain" }));
    expect(result.accepted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(gateway.uploadAttachment).not.toHaveBeenCalled();
    expect(gateway.callSkill).toHaveBeenCalledWith({
      toolName: "writer.article",
      arguments: { prompt: "hello" },
      idempotencyKey: "req-att-plain",
    });
  });

  it("rejects catalog false with zero upload and zero callSkill", async () => {
    const gateway = createMockGateway();
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
        getManagedFile: () => localFile("file-a"),
      }),
    );
    const result = await service.start(
      startInput({
        toolName: "calculator",
        fileIds: ["file-a"],
        clientRequestId: "req-att-catalog",
      }),
    );
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("ATTACHMENT_NOT_SUPPORTED");
    }
    expect(gateway.uploadAttachment).not.toHaveBeenCalled();
    expect(gateway.callSkill).not.toHaveBeenCalled();
  });

  it("rejects missing v1.4.0 bundle with zero upload and zero callSkill", async () => {
    const gateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [attachableTool] }),
      hasAttachmentBundle: () => false,
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
        getManagedFile: () => localFile("file-a"),
      }),
    );
    const result = await service.start(
      startInput({ fileIds: ["file-a"], clientRequestId: "req-att-bundle" }),
    );
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("ATTACHMENT_NOT_SUPPORTED");
    }
    expect(gateway.uploadAttachment).not.toHaveBeenCalled();
    expect(gateway.callSkill).not.toHaveBeenCalled();
  });

  it("rejects unknown fileId with zero upload and zero callSkill", async () => {
    const gateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [attachableTool] }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
        getManagedFile: () => null,
      }),
    );
    const result = await service.start(
      startInput({ fileIds: ["missing-file"], clientRequestId: "req-att-missing" }),
    );
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("ATTACHMENT_NOT_FOUND");
    }
    expect(gateway.uploadAttachment).not.toHaveBeenCalled();
    expect(gateway.callSkill).not.toHaveBeenCalled();
  });

  it("rejects remoteArtifactId files with zero upload and zero callSkill", async () => {
    const gateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [attachableTool] }),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
        getManagedFile: () =>
          localFile("file-remote", {
            locality: "remote",
            remoteArtifactId: "art-1",
            managedPath: undefined,
          }),
      }),
    );
    const result = await service.start(
      startInput({ fileIds: ["file-remote"], clientRequestId: "req-att-remote" }),
    );
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.errorCode).toBe("ATTACHMENT_NOT_SUPPORTED");
    }
    expect(gateway.uploadAttachment).not.toHaveBeenCalled();
    expect(gateway.callSkill).not.toHaveBeenCalled();
  });

  it("maps ATTACHMENT_EXPIRED onto failed and does not retry upload", async () => {
    const gateway = createMockGateway({
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [attachableTool] }),
      uploadAttachment: vi.fn().mockRejectedValue(
        new SkillRunGatewayError(
          "expired path C:\\\\secret\\\\file.pdf jwt eyJhbGciOi",
          410,
          "ATTACHMENT_EXPIRED",
        ),
      ),
    });
    const service = trackService(
      createSkillRunService({
        gatewayClient: gateway,
        ...skillFirstOptions,
        getManagedFile: () => localFile("file-a"),
        readManagedFileBytes: async () => new Uint8Array([1, 2, 3]),
      }),
    );
    const result = await service.start(
      startInput({ fileIds: ["file-a"], clientRequestId: "req-att-expired" }),
    );
    expect(result.accepted).toBe(true);
    const terminal = await waitForProjection(
      service,
      "req-att-expired",
      (projection) => projection.phase === "failed",
    );
    expect(terminal?.phase).toBe("failed");
    expect(terminal?.errorCode).toBe("ATTACHMENT_EXPIRED");
    expect(terminal?.errorMessage).toBe("Skill attachment request was not accepted");
    expect(terminal?.errorMessage).not.toMatch(/eyJ|C:\\\\|secret/);
    expect(gateway.uploadAttachment).toHaveBeenCalledTimes(1);
    expect(gateway.callSkill).not.toHaveBeenCalled();
  });
});

describe("skill-run-service enumerated assistant.delta merge", () => {
  function runningGateway(
    openEventStream: SkillRunGatewayClient["openEventStream"],
  ): SkillRunGatewayClient {
    return createMockGateway({
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "running",
      }),
      openEventStream,
    });
  }

  it("ends replay on snapshot text rather than concatenating delta and snapshot", async () => {
    const replay = loadV15Fixture("sse-assistant-delta-replay.json");
    const events = Array.isArray(replay.events) ? replay.events : [];
    const mockGateway = runningGateway(
      vi.fn().mockResolvedValue(
        sseBodyFromChunks([
          encodeSseEvents([
            ...events.map((raw) => {
              const fixture = raw as Record<string, unknown>;
              return {
                eventType: String(fixture.event_type),
                id: String(fixture.event_id),
                data: fixture,
              };
            }),
            {
              eventType: "run.completed",
              id: "evt-delta-done",
              data: {
                event_id: "evt-delta-done",
                event_type: "run.completed",
                event_seq: 99,
                payload: { text: "正在分析完整结果" },
              },
            },
          ]),
        ]),
      ),
    );
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "analyze",
      clientRequestId: "req-delta-replay",
      sessionId: "session-delta",
      profileId: "default",
    });
    const terminal = await waitForProjection(
      service,
      "req-delta-replay",
      (p) => p.phase === "succeeded",
    );
    expect(terminal?.text).toBe("正在分析完整结果");
    expect(terminal?.text).not.toBe("正在分析正在分析完整结果");
  });

  it("projects the first eligible delta into text before the snapshot arrives", async () => {
    let releaseSnapshot: (() => void) | undefined;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    let stage = 0;
    const delta = loadV15Fixture("run-event-assistant-delta.json");
    const snapshot = loadV15Fixture("run-event-assistant-message.json");
    const mockGateway = runningGateway(
      vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (stage === 0) {
                stage += 1;
                return {
                  done: false,
                  value: encodeSseEvents([
                    {
                      eventType: "assistant.delta",
                      id: String(delta.event_id),
                      data: delta,
                    },
                  ]),
                };
              }
              if (stage === 1) {
                await snapshotGate;
                stage += 1;
                return {
                  done: false,
                  value: encodeSseEvents([
                    {
                      eventType: "assistant.message",
                      id: String(snapshot.event_id),
                      data: snapshot,
                    },
                    {
                      eventType: "run.completed",
                      id: "evt-delta-live-done",
                      data: {
                        event_id: "evt-delta-live-done",
                        event_type: "run.completed",
                        event_seq: 99,
                        payload: { text: "正在分析完整结果" },
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
    );
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "analyze",
      clientRequestId: "req-delta-live",
      sessionId: "session-delta",
      profileId: "default",
    });
    const live = await waitForProjection(
      service,
      "req-delta-live",
      (p) => p.text === "正在分析",
    );
    expect(live?.text).toBe("正在分析");
    releaseSnapshot?.();
    const terminal = await waitForProjection(
      service,
      "req-delta-live",
      (p) => p.phase === "succeeded",
    );
    expect(terminal?.text).toBe("正在分析完整结果");
  });

  it("does not double-append a duplicate message_id/delta_seq", async () => {
    const delta = loadV15Fixture("run-event-assistant-delta.json");
    const snapshot = loadV15Fixture("run-event-assistant-message.json");
    const mockGateway = runningGateway(
      vi.fn().mockResolvedValue(
        sseBodyFromChunks([
          encodeSseEvents([
            {
              eventType: "assistant.delta",
              id: "run_demo:3",
              data: delta,
            },
            {
              eventType: "assistant.delta",
              id: "run_demo:3b",
              data: {
                ...delta,
                event_id: "run_demo:3b",
              },
            },
            {
              eventType: "assistant.message",
              id: String(snapshot.event_id),
              data: snapshot,
            },
            {
              eventType: "run.completed",
              id: "evt-dup-done",
              data: {
                event_id: "evt-dup-done",
                event_type: "run.completed",
                event_seq: 99,
                payload: { text: "正在分析完整结果" },
              },
            },
          ]),
        ]),
      ),
    );
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "analyze",
      clientRequestId: "req-delta-dup",
      sessionId: "session-delta",
      profileId: "default",
    });
    const terminal = await waitForProjection(
      service,
      "req-delta-dup",
      (p) => p.phase === "succeeded",
    );
    expect(terminal?.text).toBe("正在分析完整结果");
    expect(terminal?.text).not.toContain("正在分析正在分析");
  });

  it("ignores a gapped delta and does not unseal a snapshot with a late chunk", async () => {
    const snapshot = loadV15Fixture("run-event-assistant-message.json");
    const late = loadV15Fixture("run-event-assistant-delta.json");
    const mockGateway = runningGateway(
      vi.fn().mockResolvedValue(
        sseBodyFromChunks([
          encodeSseEvents([
            {
              eventType: "assistant.delta",
              id: "run_demo:gap",
              data: {
                event_id: "run_demo:gap",
                event_type: "assistant.delta",
                payload: {
                  message_id: "msg_opaque_001",
                  delta_seq: 2,
                  delta: "缺口token",
                },
              },
            },
            {
              eventType: "assistant.message",
              id: String(snapshot.event_id),
              data: snapshot,
            },
            {
              eventType: "assistant.delta",
              id: "run_demo:late",
              data: {
                ...late,
                event_id: "run_demo:late",
              },
            },
            {
              eventType: "run.completed",
              id: "evt-gap-done",
              data: {
                event_id: "evt-gap-done",
                event_type: "run.completed",
                event_seq: 99,
                payload: { text: "正在分析完整结果" },
              },
            },
          ]),
        ]),
      ),
    );
    const texts: string[] = [];
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    service.subscribe((p) => {
      if (p.clientRequestId === "req-delta-gap" && p.text) texts.push(p.text);
    });
    await service.start({
      toolName: "calculator",
      prompt: "analyze",
      clientRequestId: "req-delta-gap",
      sessionId: "session-delta",
      profileId: "default",
    });
    const terminal = await waitForProjection(
      service,
      "req-delta-gap",
      (p) => p.phase === "succeeded",
    );
    expect(texts.some((text) => text.includes("缺口token"))).toBe(false);
    expect(terminal?.text).toBe("正在分析完整结果");
    expect(terminal?.text).not.toContain("正在分析正在分析完整结果");
  });

  it("does not write unknown event payload into text", async () => {
    const mockGateway = runningGateway(
      vi.fn().mockResolvedValue(
        sseBodyFromChunks([
          encodeSseEvents([
            {
              eventType: "not.a.real.event",
              id: "sse-unknown-delta",
              data: {
                event_id: "evt-unknown-delta",
                event_type: "not.a.real.event",
                payload: { text: "leak-delta", delta: "leak-delta" },
              },
            },
            {
              eventType: "run.completed",
              id: "evt-unknown-done",
              data: {
                event_id: "evt-unknown-done",
                event_type: "run.completed",
                event_seq: 99,
                payload: { text: "done" },
              },
            },
          ]),
        ]),
      ),
    );
    const service = trackService(
      createSkillRunService({
        gatewayClient: mockGateway,
        ...skillFirstOptions,
      }),
    );
    await service.start({
      toolName: "calculator",
      prompt: "analyze",
      clientRequestId: "req-delta-unknown",
      sessionId: "session-delta",
      profileId: "default",
    });
    const terminal = await waitForProjection(
      service,
      "req-delta-unknown",
      (p) => p.phase === "succeeded",
    );
    expect(terminal?.text).toBe("done");
    expect(JSON.stringify(terminal)).not.toContain("leak-delta");
  });
});

function loadBundleFixture(name: string): Record<string, unknown> {
  const relative = join("contracts", "skill-run", "v1.2.1", "fixtures", name);
  const fromCwd = join(process.cwd(), relative);
  const fromWork = join(process.cwd(), "..", "..", relative);
  const path = existsSync(fromCwd) ? fromCwd : fromWork;
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function loadV15Fixture(name: string): Record<string, unknown> {
  const relative = join("contracts", "skill-run", "v1.5.0", "fixtures", name);
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
