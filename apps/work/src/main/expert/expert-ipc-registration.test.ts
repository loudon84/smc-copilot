import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPERT_IPC_CHANNELS,
  type ExpertRequest,
} from "../../shared/expert";
import type { SkillRunFeatureMode } from "../../shared/skill-run";
import { ExpertGatewayError } from "./expert-gateway-client";

const handlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => Promise<unknown>
>();

const {
  clearCache,
  getHealth,
  listCatalog,
  ensureFreshAccessToken,
  readStoredSessionSync,
  startMock,
  retryMock,
  cancelMock,
  rehydrateMock,
} = vi.hoisted(() => ({
  clearCache: vi.fn(),
  getHealth: vi.fn(),
  listCatalog: vi.fn(),
  ensureFreshAccessToken: vi.fn(async () => "token"),
  readStoredSessionSync: vi.fn(() => ({
    accessToken: "token",
    tokenType: "Bearer" as const,
    user: { id: "u1", username: "alice" },
  })),
  startMock: vi.fn(),
  retryMock: vi.fn(),
  cancelMock: vi.fn(),
  rehydrateMock: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => Promise<unknown>,
    ) => {
      handlers.set(channel, handler);
    },
  },
}));

vi.mock("../auth/ensure-access-token", () => ({
  ensureFreshAccessToken,
}));

vi.mock("../auth/token-store", () => ({
  readStoredSessionSync,
}));

vi.mock("./expert-continuation", () => ({
  rehydrateExpertContinuationsForSession: rehydrateMock,
  upsertExpertContinuationProjection: vi.fn(),
}));

vi.mock("./expert-session-materialize", () => ({
  materializeExpertSessionTranscript: vi.fn(),
}));

vi.mock("../skill-run/feature-mode-store", () => ({
  getSkillRunFeatureMode: vi.fn(() => "skill-first"),
}));

vi.mock("./expert-run-service", () => ({
  getExpertRunService: () => ({
    onProjectionChanged: () => () => undefined,
    retryArtifactDiscovery: vi.fn(),
    start: startMock,
    retry: retryMock,
    cancel: cancelMock,
  }),
  resetExpertRunServiceForTests: vi.fn(),
}));

vi.mock("./expert-gateway-client", async () => {
  const actual = await vi.importActual<
    typeof import("./expert-gateway-client")
  >("./expert-gateway-client");
  return {
    ...actual,
    getExpertGatewayClient: () => ({
      getHealth,
      clearCache,
      listCatalog,
    }),
    resetExpertGatewayClientForTests: vi.fn(),
  };
});

import { registerExpertIpc } from "./expert-ipc";

function validEvent(): { sender: { isDestroyed: () => boolean } } {
  return {
    sender: {
      isDestroyed: () => false,
    },
  };
}

function validRequest(
  overrides: Partial<ExpertRequest> = {},
): ExpertRequest {
  return {
    kind: "expert",
    expertSlug: "call-prep",
    skillName: "customer-profiling",
    prompt: "hello",
    attachmentRefs: [],
    sessionId: "session-1",
    profileId: "profile-1",
    clientRequestId: "req-1",
    authGeneration: "user:u1",
    ...overrides,
  };
}

function parseIpcError(err: unknown): {
  name: string;
  status: number;
  errorCode: string;
} {
  expect(err).toBeInstanceOf(Error);
  return JSON.parse((err as Error).message) as {
    name: string;
    status: number;
    errorCode: string;
  };
}

describe("registerExpertIpc health and refresh handlers", () => {
  beforeEach(() => {
    handlers.clear();
    registerExpertIpc({ getMainWindow: () => null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("get-health rejects invalid sender and requires auth", async () => {
    const handler = handlers.get(EXPERT_IPC_CHANNELS.getHealth);
    expect(handler).toBeTypeOf("function");
    await expect(
      handler?.({ sender: { isDestroyed: () => true } }),
    ).rejects.toThrow(/Invalid IPC sender/);

    readStoredSessionSync.mockReturnValueOnce({
      accessToken: "token",
      tokenType: "Bearer",
      user: { id: "u1", username: "alice" },
    });
    ensureFreshAccessToken.mockRejectedValueOnce(new Error("no session"));
    await expect(handler?.(validEvent())).rejects.toThrow(/no session/);
  });

  it("get-health returns DTO and preserves gateway error fields", async () => {
    const handler = handlers.get(EXPERT_IPC_CHANNELS.getHealth)!;
    getHealth.mockResolvedValueOnce({
      ok: true,
      status: "ready",
      gateway: {},
      catalog: {},
    });
    await expect(handler(validEvent())).resolves.toMatchObject({ ok: true });
    expect(getHealth.mock.calls[0]?.length).toBe(0);

    getHealth.mockRejectedValueOnce(
      new ExpertGatewayError("bad", {
        status: 200,
        errorCode: "INVALID_HEALTH_PAYLOAD",
      }),
    );
    await expect(handler(validEvent())).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(Error);
      const message = (err as Error).message;
      const parsed = JSON.parse(message) as {
        name: string;
        status: number;
        errorCode: string;
      };
      expect(parsed).toMatchObject({
        name: "ExpertGatewayError",
        status: 200,
        errorCode: "INVALID_HEALTH_PAYLOAD",
      });
      return true;
    });
  });

  it("refresh-catalog clears cache then lists catalog with zero args", async () => {
    const handler = handlers.get(EXPERT_IPC_CHANNELS.refreshCatalog)!;
    listCatalog.mockResolvedValueOnce([{ slug: "call-prep" }]);
    await expect(handler(validEvent())).resolves.toEqual([
      { slug: "call-prep" },
    ]);
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(listCatalog).toHaveBeenCalledTimes(1);
    expect(listCatalog.mock.calls[0]?.length).toBe(0);
    expect(handler.length).toBeLessThanOrEqual(1);
  });
});

describe("registerExpertIpc start feature-mode gate", () => {
  afterEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  function registerWithMode(mode: SkillRunFeatureMode): void {
    handlers.clear();
    registerExpertIpc({
      getMainWindow: () => null,
      getFeatureMode: () => mode,
    });
  }

  it.each(["skill-first", "local-only"] as const)(
    "%s expert.start throws EXPERT_START_DISABLED_FEATURE_MODE and does not call start",
    async (mode) => {
      registerWithMode(mode);
      const handler = handlers.get(EXPERT_IPC_CHANNELS.start)!;
      await expect(
        handler(validEvent(), { request: validRequest() }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(parseIpcError(err)).toMatchObject({
          name: "ExpertGatewayError",
          errorCode: "EXPERT_START_DISABLED_FEATURE_MODE",
        });
        return true;
      });
      expect(startMock).not.toHaveBeenCalled();
    },
  );

  it("expert-compat expert.start still calls getExpertRunService().start", async () => {
    registerWithMode("expert-compat");
    const projection = { clientRequestId: "req-1", phase: "queued" };
    startMock.mockResolvedValueOnce(projection);
    const handler = handlers.get(EXPERT_IPC_CHANNELS.start)!;
    await expect(
      handler(validEvent(), { request: validRequest() }),
    ).resolves.toEqual(projection);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith(validRequest());
  });

  it("retry, cancel, and rehydrate remain ungated in skill-first", async () => {
    registerWithMode("skill-first");
    const request = validRequest();
    retryMock.mockResolvedValueOnce({ clientRequestId: "req-2" });
    cancelMock.mockResolvedValueOnce({ clientRequestId: "req-1" });
    rehydrateMock.mockResolvedValueOnce([]);

    await expect(
      handlers.get(EXPERT_IPC_CHANNELS.retry)!(validEvent(), {
        previousClientRequestId: "prev-1",
        request,
      }),
    ).resolves.toEqual({ clientRequestId: "req-2" });
    expect(retryMock).toHaveBeenCalledWith("prev-1", request);

    await expect(
      handlers.get(EXPERT_IPC_CHANNELS.cancel)!(validEvent(), {
        clientRequestId: "req-1",
        taskId: "task-1",
      }),
    ).resolves.toEqual({ clientRequestId: "req-1" });
    expect(cancelMock).toHaveBeenCalledWith("req-1", "task-1");

    await expect(
      handlers.get(EXPERT_IPC_CHANNELS.rehydrateSession)!(
        validEvent(),
        "session-1",
      ),
    ).resolves.toEqual([]);
    expect(rehydrateMock).toHaveBeenCalledWith("session-1");
    expect(startMock).not.toHaveBeenCalled();
  });
});
