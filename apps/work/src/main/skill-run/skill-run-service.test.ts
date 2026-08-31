import { describe, expect, it, vi } from "vitest";
import { createSkillRunGatewayClient, SkillRunGatewayClient } from "./skill-run-gateway-client";
import { createSkillRunService } from "./skill-run-service";
import type { SkillRunProjection } from "../../shared/skill-run";

describe("skill-run-service", () => {
  it("returns contract-unsupported when no consumer lock is present", async () => {
    const gateway = createSkillRunGatewayClient({ hasConsumerLock: false });
    const service = createSkillRunService({ gatewayClient: gateway });

    const catalog = await service.listCatalog();
    expect(catalog.status).toBe("contract-unsupported");
    expect(catalog.tools).toEqual([]);
  });

  it("fails closed on start when no consumer lock exists with START_DISABLED_NO_LOCK", async () => {
    const service = createSkillRunService();
    const result = await service.start({
      toolName: "test-tool",
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

  it("fails closed on cancel with NO_ACTIVE_RUN when run is not found", async () => {
    const service = createSkillRunService();
    const result = await service.cancel({
      clientRequestId: "req-123",
      sessionId: "session-abc",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("NO_ACTIVE_RUN");
  });

  it("returns expert-compat as default feature mode", () => {
    const service = createSkillRunService();
    expect(service.getFeatureMode()).toBe("expert-compat");
  });

  it("executes full lifecycle (pending -> starting -> running -> succeeded) with mock gateway when lock is present", async () => {
    const projections: SkillRunProjection[] = [];

    const mockGateway: SkillRunGatewayClient = {
      listCatalog: vi.fn().mockResolvedValue({ status: "ready", tools: [] }),
      callSkill: vi.fn().mockResolvedValue({
        runId: "run-xyz-999",
        status: "starting",
      }),
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
                  'event: run.succeeded\nid: evt-1\ndata: {"result_text":"Calculation completed: 42","artifacts":[{"id":"art-1","file_name":"output.txt"}]}\n\n';
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
    };

    const upsertArtifactMock = vi.fn().mockResolvedValue(undefined);
    const service = createSkillRunService({
      gatewayClient: mockGateway,
      sleep: () => Promise.resolve(),
      onUpsertArtifact: upsertArtifactMock,
    });

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

    // Allow async start flow to settle
    await new Promise((r) => setTimeout(r, 200));

    expect(mockGateway.callSkill).toHaveBeenCalledWith({
      toolName: "calculator",
      prompt: "2+2",
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
    const mockGateway: SkillRunGatewayClient = {
      listCatalog: vi.fn(),
      callSkill: vi.fn().mockResolvedValue({ runId: "run-cancel-1" }),
      getRunSnapshot: vi.fn().mockResolvedValue({ status: "running" }),
      cancelRun: vi.fn().mockResolvedValue(undefined),
      listRunArtifacts: vi.fn().mockResolvedValue([]),
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => {
            return {
              read: async () => {
                return { done: true, value: undefined };
              },
            };
          },
        },
      }),
      hasConsumerLock: () => true,
      clearCache: vi.fn(),
      dispose: vi.fn(),
    };

    const service = createSkillRunService({
      gatewayClient: mockGateway,
      sleep: () => Promise.resolve(),
    });
    await service.start({
      toolName: "long-task",
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
});
