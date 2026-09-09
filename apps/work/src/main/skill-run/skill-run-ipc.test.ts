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
  materializeMock,
  upsertRunMock,
  appendActivityMock,
  continuationMock,
  windows,
  persist,
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
  materializeMock: vi.fn(),
  upsertRunMock: vi.fn(),
  appendActivityMock: vi.fn(),
  continuationMock: vi.fn(),
  windows: {
    list: [] as Array<{
      isDestroyed: () => boolean;
      webContents: { send: ReturnType<typeof vi.fn> };
    }>,
  },
  persist: {
    run: undefined as ((snapshot: unknown) => void) | undefined,
    activity: undefined as ((record: unknown) => void) | undefined,
    listener: undefined as ((projection: unknown) => void) | undefined,
  },
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => windows.list,
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
  upsertSkillRunContinuationProjection: continuationMock,
}));

vi.mock("./skill-run-session-materialize", () => ({
  materializeSkillRunSessionTranscript: materializeMock,
  shouldMaterializeSkillRunSession: (projection: {
    providerRunId: string | null;
    phase: string;
  }) =>
    projection.providerRunId != null && projection.phase !== "pending-submit",
}));

vi.mock("./skill-run-transcript-store", () => ({
  upsertSkillRunTranscriptRun: upsertRunMock,
  appendSkillRunTranscriptActivity: appendActivityMock,
}));

vi.mock("../files/upsert-skill-run-remote-artifact", () => ({
  upsertSkillRunRemoteArtifact: vi.fn(),
}));

vi.mock("./skill-run-session-mode-store", () => ({
  getSkillRunSessionMode: vi.fn(async () => null),
  lockSkillRunSessionMode: vi.fn(() => ({ status: "locked" })),
}));

vi.mock("./skill-run-service", () => ({
  createSkillRunService: (options: {
    onPersistSanitizedRun?: (snapshot: unknown) => void;
    onPersistSanitizedActivity?: (record: unknown) => void;
  }) => {
    persist.run = options.onPersistSanitizedRun;
    persist.activity = options.onPersistSanitizedActivity;
    return {
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
      subscribe: (listener: (projection: unknown) => void) => {
        persist.listener = listener;
        return () => {
          persist.listener = undefined;
        };
      },
      dispose: vi.fn(),
    };
  },
}));

import {
  registerSkillRunIpc,
  resetSkillRunServiceForTests,
} from "./skill-run-ipc";

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
    windows.list = [];
    persist.run = undefined;
    persist.activity = undefined;
    persist.listener = undefined;
    resetSkillRunServiceForTests();
    registerSkillRunIpc();
  });

  afterEach(() => {
    resetSkillRunServiceForTests();
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

  it("start forwards optional fileIds and rejects refs, paths, and oversize lists", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.START)!;
    startMock.mockResolvedValueOnce({
      accepted: true,
      projection: { clientRequestId: "req-1", phase: "pending-submit" },
    });
    await expect(
      handler(validEvent(), validStartInput({ fileIds: ["file-a", "file-b"] })),
    ).resolves.toMatchObject({ accepted: true });
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileIds: ["file-a", "file-b"],
      }),
    );
    const forwarded = startMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(forwarded).not.toHaveProperty("attachment_refs");
    expect(JSON.stringify(forwarded)).not.toMatch(/att_/);

    await expect(
      handler(validEvent(), validStartInput({ attachment_refs: ["att_stolen"] })),
    ).rejects.toThrow(/Invalid SkillRunStartInput/);
    await expect(
      handler(validEvent(), validStartInput({ path: "C:\\\\Users\\\\x.pdf" })),
    ).rejects.toThrow(/Invalid SkillRunStartInput/);
    await expect(
      handler(validEvent(), validStartInput({ fileIds: ["att_live_example"] })),
    ).rejects.toThrow(/Invalid SkillRunStartInput\.fileIds/);
    await expect(
      handler(validEvent(), validStartInput({ fileIds: ["C:\\\\staged\\\\a.pdf"] })),
    ).rejects.toThrow(/Invalid SkillRunStartInput\.fileIds/);
    await expect(
      handler(
        validEvent(),
        validStartInput({
          fileIds: Array.from({ length: 11 }, (_, i) => `file-${i}`),
        }),
      ),
    ).rejects.toThrow(/Invalid SkillRunStartInput\.fileIds/);
  });

  it("wires persist callbacks in materialize-then-upsert order and skips pending-submit", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.START)!;
    startMock.mockResolvedValueOnce({
      accepted: true,
      projection: { clientRequestId: "req-1", phase: "pending-submit" },
    });
    await handler(validEvent(), validStartInput());
    expect(persist.run).toEqual(expect.any(Function));
    expect(persist.activity).toEqual(expect.any(Function));

    persist.run?.({
      clientRequestId: "req-1",
      sessionId: "session-1",
      profileId: "default",
      toolName: "calculator",
      prompt: "pending only",
      providerRunId: null,
      phase: "pending-submit",
      displayStage: "Submitting...",
      lastEventId: null,
      eventSeq: 0,
      createdAt: "t0",
      updatedAt: "t0",
      auditComplete: true,
    });
    expect(materializeMock).not.toHaveBeenCalled();
    expect(upsertRunMock).not.toHaveBeenCalled();

    const exactPrompt = `Please analyze this customer in full detail. ${"x".repeat(130)}`;
    persist.run?.({
      clientRequestId: "req-1",
      sessionId: "session-1",
      profileId: "default",
      toolName: "calculator",
      prompt: exactPrompt,
      providerRunId: "task-1",
      phase: "running",
      displayStage: "Executing skill...",
      lastEventId: "evt-1",
      eventSeq: 1,
      createdAt: "t0",
      updatedAt: "t1",
      auditComplete: true,
    });
    expect(materializeMock).toHaveBeenCalledTimes(1);
    expect(materializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRequestId: "req-1",
        providerRunId: "task-1",
        phase: "running",
      }),
      exactPrompt,
    );
    expect(JSON.stringify(materializeMock.mock.calls[0]?.[0])).not.toMatch(
      /Please analyze this customer in full detail/,
    );
    expect(upsertRunMock).toHaveBeenCalledTimes(1);
    expect(materializeMock.mock.invocationCallOrder[0]).toBeLessThan(
      upsertRunMock.mock.invocationCallOrder[0]!,
    );

    persist.activity?.({
      clientRequestId: "req-1",
      sessionId: "session-1",
      eventId: "evt-1",
      kind: "reasoning.summary",
      ordinal: 0,
    });
    expect(appendActivityMock).toHaveBeenCalledTimes(1);
  });

  it("broadcasts a bounded projection without rematerializing or exposing Prompt", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.START)!;
    startMock.mockResolvedValueOnce({
      accepted: true,
      projection: { clientRequestId: "req-1", phase: "pending-submit" },
    });
    await handler(validEvent(), validStartInput());
    const send = vi.fn();
    windows.list = [{ isDestroyed: () => false, webContents: { send } }];
    const projection = {
      clientRequestId: "req-1",
      providerRunId: "task-1",
      toolName: "calculator",
      promptSummary: "2+2",
      sessionId: "session-1",
      profileId: "default",
      phase: "running",
      displayStage: "Executing skill...",
      lastEventId: "evt-1",
      eventSeq: 1,
      createdAt: "t0",
      updatedAt: "t1",
    };
    persist.listener?.(projection);
    expect(materializeMock).not.toHaveBeenCalled();
    expect(continuationMock).toHaveBeenCalledWith(projection);
    expect(send).toHaveBeenCalledWith(
      SKILL_RUN_IPC_CHANNELS.ON_PROJECTION_CHANGED,
      projection,
    );
    expect(JSON.stringify(send.mock.calls[0])).not.toMatch(/"prompt"/);
  });

  it("does not swallow sidecar persistence failures", async () => {
    const handler = handlers.get(SKILL_RUN_IPC_CHANNELS.START)!;
    startMock.mockResolvedValueOnce({
      accepted: true,
      projection: { clientRequestId: "req-1", phase: "pending-submit" },
    });
    await expect(handler(validEvent(), validStartInput())).resolves.toMatchObject(
      { accepted: true },
    );
    upsertRunMock.mockImplementationOnce(() => {
      throw new Error("SKILL_RUN_TRANSCRIPT_UNAVAILABLE");
    });
    expect(() =>
      persist.run?.({
        clientRequestId: "req-1",
        sessionId: "session-1",
        profileId: "default",
        toolName: "calculator",
        prompt: "keep going",
        providerRunId: "task-1",
        phase: "running",
        displayStage: "Executing skill...",
        lastEventId: null,
        eventSeq: 1,
        createdAt: "t0",
        updatedAt: "t1",
        auditComplete: true,
      }),
    ).toThrow(/UNAVAILABLE/);
  });
});
