import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPERT_IPC_CHANNELS } from "../../shared/expert";
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
  rehydrateExpertContinuationsForSession: vi.fn(),
  upsertExpertContinuationProjection: vi.fn(),
}));

vi.mock("./expert-session-materialize", () => ({
  materializeExpertSessionTranscript: vi.fn(),
}));

vi.mock("./expert-artifact-download", () => ({
  downloadExpertArtifact: vi.fn(),
  cleanupExpertArtifactTemps: vi.fn(),
}));

vi.mock("./expert-run-service", () => ({
  getExpertRunService: () => ({
    onProjectionChanged: () => () => undefined,
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
