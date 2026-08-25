import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExpertRequest } from "../../shared/expert";
import {
  createExpertRunService,
  SSE_RECONNECT_DELAYS_MS,
} from "./expert-run-service";
import type { ExpertGatewayClient } from "./expert-gateway-client";

function makeRequest(overrides: Partial<ExpertRequest> = {}): ExpertRequest {
  return {
    kind: "expert",
    expertSlug: "call-prep",
    skillName: "customer-profiling",
    prompt: "hello",
    attachmentRefs: [],
    sessionId: "session-1",
    profileId: "profile-1",
    clientRequestId: "req-1",
    authGeneration: "user-1",
    ...overrides,
  };
}

function mockGateway(
  overrides: Partial<ExpertGatewayClient> = {},
): ExpertGatewayClient {
  return {
    listCatalog: vi.fn(),
    listSkills: vi.fn(),
    getHealth: vi.fn().mockResolvedValue({
      ok: true,
      status: "ready",
      gateway: {},
      catalog: {},
    }),
    callSkill: vi.fn().mockResolvedValue({
      committed: true,
      task_id: "task-1",
      status: "running",
      event_stream: "/api/v1/hermes/tasks/task-1/events",
      event_token_url: "/api/v1/hermes/tasks/task-1/events-token",
      result_url: "/api/v1/hermes/tasks/task-1/result",
      artifact_url: "/api/v1/hermes/tasks/task-1/artifacts",
      wait_strategy: { type: "sse", fallback: "poll" },
    }),
    getTask: vi.fn(),
    getSnapshot: vi.fn().mockResolvedValue({
      status: "running",
      result: { ready: false },
    }),
    getResult: vi.fn().mockResolvedValue({
      ready: true,
      status: "completed",
      result_summary: "summary",
      result_content: "full",
      content: "full",
    }),
    listArtifacts: vi.fn().mockResolvedValue([]),
    getEventsToken: vi.fn(),
    cancelTask: vi.fn().mockResolvedValue({}),
    retryTask: vi.fn(),
    buildArtifactDownloadPath: (id) =>
      `/api/v1/hermes/artifacts/${id}/download`,
    buildEventsPath: (id) => `/api/v1/hermes/tasks/${id}/events`,
    getBaseUrl: () => "http://expert.test:4510",
    getAccessToken: () => "token",
    openAuthorizedGet: vi.fn().mockRejectedValue(new Error("sse down")),
    clearCache: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe("expert-run-service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // @lat: [[expert-execution-tests#SSE dedup and ordering]]
  it("dedupes SSE events by id and ignores lower seq after higher", async () => {
    const encoder = new TextEncoder();
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount === 1) {
          controller.enqueue(
            encoder.encode(
              'id: 1\ndata: {"event":"task.progress","task_id":"task-1","event_type":"progress","event_seq":1,"stage":"preparing"}\n\n',
            ),
          );
          controller.enqueue(
            encoder.encode(
              'id: 1\ndata: {"event":"task.progress","task_id":"task-1","event_type":"progress","event_seq":1,"stage":"preparing"}\n\n',
            ),
          );
          controller.enqueue(
            encoder.encode(
              'id: 3\ndata: {"event":"task.progress","task_id":"task-1","event_type":"progress","event_seq":3,"stage":"finalizing"}\n\n',
            ),
          );
          controller.enqueue(
            encoder.encode(
              'id: 2\ndata: {"event":"task.progress","task_id":"task-1","event_type":"progress","event_seq":2,"stage":"running"}\n\n',
            ),
          );
          controller.enqueue(
            encoder.encode(
              'id: 4\ndata: {"event":"task.completed","task_id":"task-1","event_type":"completed","event_seq":4,"result":{"summary":"ok","content":"body"}}\n\n',
            ),
          );
          controller.close();
          return;
        }
        controller.close();
      },
    });

    const gateway = mockGateway({
      openAuthorizedGet: vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    });

    const service = createExpertRunService({ gateway });
    const projections: string[] = [];
    service.onProjectionChanged((p) => {
      projections.push(`${p.phase}:${p.displayStage}:${p.lastEventSeq}`);
    });

    await service.start(makeRequest());
    await vi.waitFor(() => {
      const latest = service.getProjection("req-1");
      expect(latest?.phase).toBe("succeeded");
    });
    const latest = service.getProjection("req-1");
    expect(latest?.lastEventSeq).toBe(4);
    expect(latest?.resultSummary).toBe("ok");
    // Out-of-order seq=2 must not overwrite seq=3 display after it was applied;
    // terminal completed wins.
    expect(projections.some((p) => p.includes("finalizing:3"))).toBe(true);
    service.dispose();
  });

  // @lat: [[expert-execution-tests#SSE reconnect and polling fallback]]
  it("falls back to status polling after reconnect budget and can complete", async () => {
    vi.useFakeTimers();
    const gateway = mockGateway({
      openAuthorizedGet: vi.fn().mockRejectedValue(new Error("sse down")),
      getSnapshot: vi
        .fn()
        .mockResolvedValueOnce({ status: "running", result: { ready: false } })
        .mockResolvedValueOnce({
          status: "completed",
          result: {
            ready: true,
            summary: "done",
            result_content: "full",
            content: "full",
          },
        }),
    });

    const service = createExpertRunService({
      gateway,
      sleep: async (ms, signal) => {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        await vi.advanceTimersByTimeAsync(ms);
      },
    });

    await service.start(makeRequest());
    // Companion terminal watch polls immediately; second tick completes.
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => {
      expect(service.getProjection("req-1")?.phase).toBe("succeeded");
    });
    service.dispose();
  });

  it("completes via companion poll when SSE hangs open without events", async () => {
    vi.useFakeTimers();
    const hangingStream = new ReadableStream<Uint8Array>({
      pull() {
        /* never enqueues or closes — silent SSE */
      },
    });
    const gateway = mockGateway({
      openAuthorizedGet: vi.fn().mockResolvedValue(
        new Response(hangingStream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
      getSnapshot: vi
        .fn()
        .mockResolvedValueOnce({ status: "running", result: { ready: false } })
        .mockResolvedValueOnce({
          status: "completed",
          result: {
            ready: true,
            summary: "from-poll",
            result_content: "body",
            content: "body",
          },
        }),
      getResult: vi.fn().mockResolvedValue({
        ready: true,
        status: "completed",
        result_summary: "from-poll",
        result_content: "body",
        content: "body",
      }),
    });
    const service = createExpertRunService({
      gateway,
      sleep: async (ms, signal) => {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        await vi.advanceTimersByTimeAsync(ms);
      },
    });
    await service.start(makeRequest());
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => {
      expect(service.getProjection("req-1")?.phase).toBe("succeeded");
    });
    expect(service.getProjection("req-1")?.resultSummary).toBe("from-poll");
    service.dispose();
  });

  // @lat: [[expert-execution-tests#Polling delivery timeout]]
  it("reports delivery-timeout after polling budget", async () => {
    vi.useFakeTimers();
    const gateway = mockGateway({
      openAuthorizedGet: vi.fn().mockRejectedValue(new Error("sse down")),
      getSnapshot: vi.fn().mockResolvedValue({
        status: "running",
        result: { ready: false },
      }),
    });
    const service = createExpertRunService({
      gateway,
      sleep: async (ms, signal) => {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        await vi.advanceTimersByTimeAsync(ms);
      },
    });
    await service.start(makeRequest());
    for (const delay of SSE_RECONNECT_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay);
    }
    // Exceed 10 minute poll budget.
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 15_000);
    await vi.waitFor(() => {
      expect(service.getProjection("req-1")?.errorCode).toBe(
        "delivery-timeout",
      );
    });
    service.dispose();
  });

  // @lat: [[expert-execution-tests#Cancel queued vs running]]
  it("cancel queued removes locally; cancel running calls remote", async () => {
    const gateway = mockGateway({
      callSkill: vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never resolves — stay in starting */
          }),
      ),
    });
    const service = createExpertRunService({ gateway });
    const queued = await service.start(
      makeRequest({ clientRequestId: "queued-1" }),
    );
    // Force queued cancel path before network returns.
    queued.phase = "queued";
    const cancelled = await service.cancel("queued-1");
    expect(cancelled?.phase).toBe("cancelled");

    const gateway2 = mockGateway();
    const service2 = createExpertRunService({ gateway: gateway2 });
    await service2.start(makeRequest({ clientRequestId: "run-1" }));
    await vi.waitFor(() => {
      expect(service2.getProjection("run-1")?.taskId).toBe("task-1");
    });
    await service2.cancel("run-1", "task-1");
    expect(gateway2.cancelTask).toHaveBeenCalledWith("task-1");
    expect(service2.getProjection("run-1")?.phase).toBe("cancelled");
    service.dispose();
    service2.dispose();
  });

  // @lat: [[expert-execution-tests#Retry clientRequestId]]
  it("retry requires terminal failure and a new clientRequestId", async () => {
    const gateway = mockGateway({
      callSkill: vi.fn().mockRejectedValue({
        name: "ExpertGatewayError",
        message: "boom",
        status: 500,
        errorCode: "BOOM",
      }),
    });
    // Use real ExpertGatewayError path via rejected Error-like — patch start failure manually.
    const service = createExpertRunService({
      gateway: mockGateway({
        callSkill: vi.fn().mockRejectedValue(new Error("boom")),
      }),
    });
    await service.start(makeRequest({ clientRequestId: "fail-1" }));
    await vi.waitFor(() => {
      expect(service.getProjection("fail-1")?.phase).toBe("failed");
    });
    await expect(
      service.retry("fail-1", makeRequest({ clientRequestId: "fail-1" })),
    ).rejects.toMatchObject({ errorCode: "RETRY_ID_REUSED" });

    const retried = await service.retry(
      "fail-1",
      makeRequest({ clientRequestId: "fail-2" }),
    );
    expect(retried.clientRequestId).toBe("fail-2");
    service.dispose();
    void gateway;
  });
});
