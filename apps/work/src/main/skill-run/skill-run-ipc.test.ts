import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKILL_RUN_IPC_CHANNELS } from "../../shared/skill-run";

const handlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => Promise<unknown>
>();

const {
  ensureFreshAccessToken,
  readStoredSessionSync,
  startMock,
  listCatalogMock,
  clearCacheMock,
  setFavoriteMock,
  decideApprovalMock,
} = vi.hoisted(() => ({
  ensureFreshAccessToken: vi.fn(async () => "token"),
  readStoredSessionSync: vi.fn(() => ({
    accessToken: "token",
    tokenType: "Bearer" as const,
    user: { id: "u1", username: "alice" },
  })),
  startMock: vi.fn(),
  listCatalogMock: vi.fn(),
  clearCacheMock: vi.fn(),
  setFavoriteMock: vi.fn(),
  decideApprovalMock: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => Promise<unknown>,
    ) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
  },
}));

vi.mock("../auth/ensure-access-token", () => ({
  ensureFreshAccessToken,
}));

vi.mock("../auth/token-store", () => ({
  readStoredSessionSync,
}));

vi.mock("./skill-run-continuation", () => ({
  rehydrateSkillRunContinuationsForSession: vi.fn(async () => []),
  upsertSkillRunContinuationProjection: vi.fn(),
}));

vi.mock("./skill-run-session-materialize", () => ({
  materializeSkillRunSessionTranscript: vi.fn(),
}));

vi.mock("../files/upsert-skill-run-remote-artifact", () => ({
  upsertSkillRunRemoteArtifact: vi.fn(),
}));

vi.mock("./skill-run-session-mode-store", () => ({
  getSkillRunSessionMode: vi.fn(async () => null),
  setSkillRunSessionMode: vi.fn(),
}));

vi.mock("./skill-run-service", () => ({
  createSkillRunService: () => ({
    listCatalog: listCatalogMock,
    refreshCatalog: async () => {
      clearCacheMock();
      return listCatalogMock();
    },
    setCatalogFavorite: setFavoriteMock,
    start: startMock,
    cancel: vi.fn(),
    decideApproval: decideApprovalMock,
    getFeatureMode: () => "expert-compat",
    getProjection: vi.fn(),
    listProjections: vi.fn(),
    retryArtifactDiscovery: vi.fn(),
    subscribe: () => () => undefined,
    dispose: vi.fn(),
  }),
}));

import { registerSkillRunIpc } from "./skill-run-ipc";

function validEvent(): { sender: { isDestroyed: () => boolean } } {
  return {
    sender: {
      isDestroyed: () => false,
    },
  };
}

function validStartInput(overrides: Record<string, unknown> = {}) {
  return {
    toolName: "calculator",
    prompt: "2+2",
    clientRequestId: "req-1",
    sessionId: "session-1",
    profileId: "default",
    authGeneration: "user:u1",
    ...overrides,
  };
}

describe("registerSkillRunIpc", () => {
  beforeEach(() => {
    handlers.clear();
    registerSkillRunIpc();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("start rejects invalid sender and missing required fields", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.START)!;
    await expect(
      handler({ sender: { isDestroyed: () => true } }, validStartInput()),
    ).rejects.toThrow(/Invalid IPC sender/);

    await expect(handler(validEvent(), {})).rejects.toThrow(
      /Invalid SkillRunStartInput\.toolName/,
    );
  });

  it("start rejects auth generation mismatch", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.START)!;
    await expect(
      handler(validEvent(), validStartInput({ authGeneration: "user:other" })),
    ).rejects.toThrow(/Auth generation mismatch/);
  });

  it("start forwards validated input to service", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.START)!;
    startMock.mockResolvedValueOnce({
      accepted: true,
      projection: { clientRequestId: "req-1", phase: "pending-submit" },
    });
    await expect(handler(validEvent(), validStartInput())).resolves.toMatchObject({
      accepted: true,
    });
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "calculator",
        authGeneration: "user:u1",
      }),
    );
    const serialized = JSON.stringify(startMock.mock.calls[0]);
    expect(serialized).not.toMatch(/eyJ/);
    expect(serialized).not.toMatch(/https?:\/\//);
  });

  it("start forwards bounded extraParameters and rejects illegal maps", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.START)!;
    startMock.mockResolvedValueOnce({
      accepted: true,
      projection: { clientRequestId: "req-1", phase: "pending-submit" },
    });
    await expect(
      handler(
        validEvent(),
        validStartInput({ extraParameters: { region: "cn" } }),
      ),
    ).resolves.toMatchObject({ accepted: true });
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extraParameters: { region: "cn" },
      }),
    );

    await expect(
      handler(validEvent(), validStartInput({ extraParameters: { region: 1 } })),
    ).rejects.toThrow(/Invalid SkillRunStartInput\.extraParameters/);

    const nine: Record<string, string> = {};
    for (let i = 0; i < 9; i += 1) {
      nine[`k${i}`] = "v";
    }
    await expect(
      handler(validEvent(), validStartInput({ extraParameters: nine })),
    ).rejects.toThrow(/Invalid SkillRunStartInput\.extraParameters/);
  });

  it("list-catalog requires auth session", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.LIST_CATALOG)!;
    ensureFreshAccessToken.mockRejectedValueOnce(new Error("no session"));
    await expect(handler(validEvent())).rejects.toThrow(/no session/);
  });

  it("refresh-catalog clears cache before listing", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.REFRESH_CATALOG)!;
    listCatalogMock.mockResolvedValueOnce({ status: "ready", tools: [] });
    await expect(handler(validEvent())).resolves.toEqual({
      status: "ready",
      tools: [],
    });
    expect(clearCacheMock).toHaveBeenCalledTimes(1);
    expect(listCatalogMock).toHaveBeenCalledTimes(1);
  });

  it("set-catalog-favorite validates input and does not refresh for unknown names", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.SET_CATALOG_FAVORITE)!;
    await expect(handler(validEvent(), {})).rejects.toThrow(
      /Invalid SkillRunSetCatalogFavoriteInput/,
    );
    await expect(
      handler(validEvent(), { toolName: "ghost", favorited: "yes" }),
    ).rejects.toThrow(/Invalid SkillRunSetCatalogFavoriteInput\.favorited/);
    await expect(
      handler(validEvent(), { toolName: "a".repeat(257), favorited: true }),
    ).rejects.toThrow(/Invalid SkillRunSetCatalogFavoriteInput\.toolName/);

    setFavoriteMock.mockRejectedValueOnce(new Error("FAVORITE_UNKNOWN_TOOL"));
    await expect(
      handler(validEvent(), { toolName: "ghost", favorited: true }),
    ).rejects.toThrow(/FAVORITE_UNKNOWN_TOOL/);
    expect(setFavoriteMock).toHaveBeenCalledWith({
      toolName: "ghost",
      favorited: true,
    });
    expect(clearCacheMock).not.toHaveBeenCalled();

    setFavoriteMock.mockResolvedValueOnce({
      status: "ready",
      tools: [{ toolName: "calculator", favorited: true }],
    });
    await expect(
      handler(validEvent(), { toolName: "calculator", favorited: true }),
    ).resolves.toMatchObject({ status: "ready" });

    expect(Object.keys(SKILL_RUN_IPC_CHANNELS)).toEqual(
      expect.arrayContaining(["SET_CATALOG_FAVORITE"]),
    );
    expect(SKILL_RUN_IPC_CHANNELS.SET_CATALOG_FAVORITE).toBe(
      "skill-run:set-catalog-favorite",
    );
    expect(Object.keys(SKILL_RUN_IPC_CHANNELS)).not.toEqual(
      expect.arrayContaining(["LIST_RECOMMENDED"]),
    );
    expect(Object.values(SKILL_RUN_IPC_CHANNELS)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("recommend")]),
    );
  });

  it("DECIDE_APPROVAL accepts allow/deny and rejects extra approval identity", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.DECIDE_APPROVAL)!;
    decideApprovalMock.mockResolvedValueOnce({
      success: true,
      projection: { clientRequestId: "req-1", phase: "waiting-approval" },
    });
    await expect(
      handler(validEvent(), {
        clientRequestId: "req-1",
        sessionId: "session-1",
        decision: "allow",
      }),
    ).resolves.toMatchObject({ success: true });
    expect(decideApprovalMock).toHaveBeenCalledWith({
      clientRequestId: "req-1",
      sessionId: "session-1",
      decision: "allow",
    });
    expect(SKILL_RUN_IPC_CHANNELS.DECIDE_APPROVAL).toBe("skill-run:decide-approval");

    await expect(handler(validEvent(), { sessionId: "session-1", decision: "allow" })).rejects.toThrow(
      /Invalid SkillRunDecideApprovalInput/,
    );
    await expect(
      handler(validEvent(), {
        clientRequestId: "req-1",
        sessionId: "session-1",
        decision: "skip",
      }),
    ).rejects.toThrow(/Invalid SkillRunDecideApprovalInput.decision/);
    await expect(
      handler(validEvent(), {
        clientRequestId: "req-1",
        sessionId: "session-1",
        decision: "allow",
        approvalId: "appr-1",
      }),
    ).rejects.toThrow(/Invalid SkillRunDecideApprovalInput/);
    await expect(
      handler(validEvent(), {
        clientRequestId: "req-1",
        sessionId: "session-1",
        decision: "deny",
        idempotencyKey: "stolen-key",
      }),
    ).rejects.toThrow(/Invalid SkillRunDecideApprovalInput/);
  });
});
