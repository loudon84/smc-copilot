// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  KnowledgeJobPartition,
  KnowledgeJobSnapshot,
} from "../src/shared/knowledge/knowledge-job-ipc";

const mocks = vi.hoisted(() => {
  const coordinator = {
    subscribe: vi.fn(),
    getIdentityEpoch: vi.fn(() => 0),
    pickAndUpload: vi.fn(),
    dropAndUpload: vi.fn(),
    pauseForIdentityChange: vi.fn(),
    recoverOnStart: vi.fn(),
    getSnapshot: vi.fn(),
    listSnapshots: vi.fn(),
    refreshStatus: vi.fn(),
    createDraft: vi.fn(),
    cancel: vi.fn(),
    deleteCancelled: vi.fn(),
    retry: vi.fn(),
  };
  return {
    coordinator,
    configure: vi.fn(() => coordinator),
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    getPathForFile: vi.fn(),
    send: vi.fn(),
    select: vi.fn(),
    importFile: vi.fn(),
    probe: vi.fn(),
    hydrate: vi.fn(),
    subscribeSession: vi.fn(),
    profile: "default",
    mode: "provider" as "provider" | "mock",
    session: { user: { id: "alice", tenantId: "team-a" } } as {
      user: { id: string; tenantId: string };
    } | null,
  };
});
vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, webContents: { send: mocks.send } },
    ],
  },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
  webUtils: { getPathForFile: mocks.getPathForFile },
}));
vi.mock("../src/main/utils", () => ({
  getActiveProfileNameSync: () => mocks.profile,
}));
vi.mock("../src/main/auth/token-store", () => ({
  readStoredSessionSync: () => mocks.session,
  hydrateTokenStore: mocks.hydrate,
  subscribeStoredSessionChanges: mocks.subscribeSession,
}));
vi.mock("../src/main/files/file-service", () => ({
  selectFilePaths: mocks.select,
}));
vi.mock("../src/main/files/file-import-service", () => ({
  importOnePath: mocks.importFile,
}));
vi.mock("../src/main/knowledge/knowledge-mode-controller", () => ({
  getKnowledgeModeSnapshot: () => ({ dataMode: mocks.mode }),
}));
vi.mock("../src/main/knowledge/knowledge-http-provider", () => ({
  getKnowledgeHttpProvider: () => ({ probeCapability: mocks.probe }),
}));
vi.mock("../src/main/knowledge/knowledge-upload-job-coordinator", () => {
  const equal = (a: KnowledgeJobPartition, b: KnowledgeJobPartition) =>
    JSON.stringify(a) === JSON.stringify(b);
  return {
    configureKnowledgeUploadJobCoordinator: mocks.configure,
    getKnowledgeUploadJobCoordinator: () => mocks.coordinator,
    deriveKnowledgeJobPartition: (input: {
      workProfileId: string;
      authSubject: string;
      tenantId?: string;
    }) => ({
      workProfileId: input.workProfileId,
      authSubject: input.authSubject,
      tenantScope: input.tenantId
        ? { kind: "tenant", tenantId: input.tenantId }
        : { kind: "personal" },
    }),
    partitionsEqual: equal,
    isKnowledgeJobSnapshotVisibleToPartition: (
      snapshot: KnowledgeJobSnapshot,
      acting: KnowledgeJobPartition | null,
    ) => Boolean(acting && equal(snapshot.partition, acting)),
  };
});

import { createKnowledgeJobApi } from "../src/preload/knowledge-job-api";
import {
  pauseKnowledgeJobsForProfileChange,
  registerKnowledgeJobIpcHandlers,
  resumeKnowledgeJobsForActiveProfile,
  startKnowledgeProviderAfterAuth,
} from "../src/main/knowledge/register-knowledge-job-ipc";
import {
  getCachedKnowledgeCapability,
  invalidateKnowledgeCapability,
  refreshKnowledgeCapability,
} from "../src/main/knowledge/knowledge-capability";
import { KNOWLEDGE_JOB_IPC_CHANNELS } from "../src/shared/knowledge/knowledge-job-ipc";

type Handler = (...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateKnowledgeCapability();
  mocks.profile = "default";
  mocks.mode = "provider";
  mocks.session = { user: { id: "alice", tenantId: "team-a" } };
  mocks.probe.mockResolvedValue({ available: true, status: "available" });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.subscribeSession.mockReturnValue(() => undefined);
  mocks.select.mockResolvedValue(["D:\\private\\a.pdf"]);
  mocks.coordinator.pickAndUpload.mockResolvedValue({
    batchId: "batch-1",
    jobs: [],
  });
  mocks.coordinator.dropAndUpload.mockResolvedValue({
    batchId: "drop-1",
    jobs: [],
  });
  mocks.coordinator.deleteCancelled.mockReturnValue({
    jobId: "gone",
    knowledgeBaseId: "kb-1",
  });
  mocks.getPathForFile.mockReturnValue("D:\\private\\a.pdf");
  mocks.coordinator.refreshStatus.mockResolvedValue([]);
  handlers.clear();
  registerKnowledgeJobIpcHandlers({
    handle: (channel: string, handler: Handler) =>
      handlers.set(channel, handler),
  } as never);
});

describe("Knowledge batch IPC and identity lifecycle", () => {
  it("routes the remote refresh command through preload without starting upload recovery", async () => {
    const input = { knowledgeBaseId: "kb-1" };
    await createKnowledgeJobApi().refreshStatus(input);
    expect(mocks.invoke).toHaveBeenCalledWith(
      KNOWLEDGE_JOB_IPC_CHANNELS.refreshStatus,
      input,
    );
    const result = await handlers.get(
      KNOWLEDGE_JOB_IPC_CHANNELS.refreshStatus,
    )!({}, input);
    expect(result).toEqual([]);
    expect(mocks.coordinator.refreshStatus).toHaveBeenCalledWith(input);
    expect(mocks.coordinator.recoverOnStart).not.toHaveBeenCalled();
    expect(mocks.coordinator.pickAndUpload).not.toHaveBeenCalled();
  });

  it.each(["identity", "mode"])(
    "rejects refresh when %s changes during capability preflight",
    async (change) => {
      let accept!: (value: { available: boolean; status: "available" }) => void;
      mocks.probe.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            accept = resolve;
          }),
      );
      const pending = handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.refreshStatus)!(
        {},
        { knowledgeBaseId: "kb-1" },
      );
      if (change === "identity") mocks.session!.user.id = "bob";
      else mocks.mode = "mock";
      accept({ available: true, status: "available" });
      await expect(pending).rejects.toThrow("KNOWLEDGE_JOB_PARTITION_DENIED");
      expect(mocks.coordinator.refreshStatus).not.toHaveBeenCalled();
    },
  );

  it("does not return refresh snapshots after the caller switches profiles", async () => {
    let accept!: (value: KnowledgeJobSnapshot[]) => void;
    mocks.coordinator.refreshStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    const pending = handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.refreshStatus)!(
      {},
      { knowledgeBaseId: "kb-1" },
    );
    await flush();
    expect(mocks.coordinator.refreshStatus).toHaveBeenCalledTimes(1);
    mocks.profile = "other";
    accept([]);
    await expect(pending).rejects.toThrow("KNOWLEDGE_JOB_PARTITION_DENIED");
  });

  it("sanitizes remote refresh failures without exposing private details", async () => {
    mocks.coordinator.refreshStatus.mockRejectedValueOnce(
      new Error("private D:\\secrets\\token"),
    );
    await expect(
      handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.refreshStatus)!(
        {},
        { knowledgeBaseId: "kb-1" },
      ),
    ).rejects.toThrow("KNOWLEDGE_JOB_ERROR");
  });

  it.each([
    ["blocked_provider_unavailable", "PROVIDER_UNAVAILABLE"],
    ["auth_required", "KNOWLEDGE_JOB_AUTH_REQUIRED"],
  ] as const)(
    "refuses remote refresh when capability is %s",
    async (status, code) => {
      mocks.probe.mockResolvedValueOnce({ available: false, status });
      await expect(
        handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.refreshStatus)!(
          {},
          { knowledgeBaseId: "kb-1" },
        ),
      ).rejects.toThrow(code);
      expect(mocks.coordinator.refreshStatus).not.toHaveBeenCalled();
    },
  );

  it("reads mock snapshots without probing or starting provider recovery", async () => {
    mocks.mode = "mock";
    expect(
      await handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.refreshStatus)!(
        {},
        { knowledgeBaseId: "kb-1" },
      ),
    ).toEqual([]);
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.coordinator.recoverOnStart).not.toHaveBeenCalled();
  });

  it("exposes the batch command through preload and keeps picker paths in Main", async () => {
    const input = { knowledgeBaseId: "kb-1" };
    await createKnowledgeJobApi().pickAndUpload(input);
    expect(mocks.invoke).toHaveBeenCalledWith(
      KNOWLEDGE_JOB_IPC_CHANNELS.pickAndUpload,
      input,
    );
    const result = await handlers.get(
      KNOWLEDGE_JOB_IPC_CHANNELS.pickAndUpload,
    )!({}, input);
    expect(mocks.coordinator.pickAndUpload).toHaveBeenCalledWith(input);
    expect(result).toEqual({ batchId: "batch-1", jobs: [] });
    const deps = mocks.configure.mock.calls[0]![0] as unknown as {
      selectFiles: () => Promise<string[]>;
      importFile: unknown;
    };
    expect(await deps.selectFiles()).toEqual(["D:\\private\\a.pdf"]);
    expect(mocks.select).toHaveBeenCalledWith({ multiple: true });
    expect(deps.importFile).toBe(mocks.importFile);
  });

  it("resolves dropped File paths only in preload and routes a bounded batch to Main", async () => {
    const file = { name: "a.pdf" } as File;
    const result = await createKnowledgeJobApi().dropAndUpload({
      knowledgeBaseId: "kb-1",
      files: [file],
    });
    expect(mocks.getPathForFile).toHaveBeenCalledWith(file);
    expect(mocks.invoke).toHaveBeenCalledWith(
      KNOWLEDGE_JOB_IPC_CHANNELS.dropAndUpload,
      {
        knowledgeBaseId: "kb-1",
        paths: ["D:\\private\\a.pdf"],
      },
    );
    expect(result).toBeUndefined();
    expect(mocks.invoke).not.toHaveBeenCalledWith(
      KNOWLEDGE_JOB_IPC_CHANNELS.pickAndUpload,
      expect.anything(),
    );
    await expect(
      createKnowledgeJobApi().dropAndUpload({
        knowledgeBaseId: "kb-1",
        files: [],
      }),
    ).rejects.toThrow("KNOWLEDGE_JOB_FILE_INVALID");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(
      await handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.dropAndUpload)!(
        {},
        { knowledgeBaseId: "kb-1", paths: ["D:\\private\\a.pdf"] },
      ),
    ).toEqual({ batchId: "drop-1", jobs: [] });
    expect(mocks.coordinator.dropAndUpload).toHaveBeenCalledWith({
      knowledgeBaseId: "kb-1",
      paths: ["D:\\private\\a.pdf"],
    });
    await expect(
      handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.dropAndUpload)!(
        {},
        { knowledgeBaseId: "kb-1", paths: Array(501).fill("x") },
      ),
    ).rejects.toThrow("KNOWLEDGE_JOB_FILE_INVALID");
  });

  it("deletes a cancelled local task without probing and broadcasts its removal", async () => {
    const input = { jobId: "gone", expectedRevision: 3 };
    await createKnowledgeJobApi().deleteCancelled(input);
    expect(mocks.invoke).toHaveBeenCalledWith(
      KNOWLEDGE_JOB_IPC_CHANNELS.deleteCancelled,
      input,
    );
    expect(
      handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.deleteCancelled)!({}, input),
    ).toEqual({ jobId: "gone", knowledgeBaseId: "kb-1" });
    expect(mocks.coordinator.deleteCancelled).toHaveBeenCalledWith(input, {
      partition: {
        workProfileId: "default",
        authSubject: "alice",
        tenantScope: { kind: "tenant", tenantId: "team-a" },
      },
    });
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.coordinator.recoverOnStart).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith(
      KNOWLEDGE_JOB_IPC_CHANNELS.jobRemoved,
      { jobId: "gone", knowledgeBaseId: "kb-1" },
    );
    const listener = vi.fn();
    const unsubscribe = createKnowledgeJobApi().onJobRemoved(listener);
    const handler = mocks.on.mock.calls.at(-1)![1] as (
      _event: unknown,
      removed: { jobId: string; knowledgeBaseId: string },
    ) => void;
    handler({}, { jobId: "gone", knowledgeBaseId: "kb-1" });
    expect(listener).toHaveBeenCalledWith({
      jobId: "gone",
      knowledgeBaseId: "kb-1",
    });
    unsubscribe();
    expect(mocks.removeListener).toHaveBeenCalledWith(
      KNOWLEDGE_JOB_IPC_CHANNELS.jobRemoved,
      handler,
    );
  });

  it("sanitizes rejected commands and never broadcasts another identity's snapshot", async () => {
    mocks.coordinator.pickAndUpload.mockRejectedValue(
      new Error("private D:\\secrets\\file.pdf"),
    );
    await expect(
      handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.pickAndUpload)!(
        {},
        { knowledgeBaseId: "kb-1" },
      ),
    ).rejects.toThrow("KNOWLEDGE_JOB_ERROR");
    const publish = mocks.coordinator.subscribe.mock.calls[0]![0] as (
      snapshot: KnowledgeJobSnapshot,
    ) => void;
    publish({
      partition: {
        workProfileId: "default",
        authSubject: "bob",
        tenantScope: { kind: "tenant", tenantId: "team-a" },
      },
    } as KnowledgeJobSnapshot);
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.session = null;
    publish({
      partition: {
        workProfileId: "default",
        authSubject: "alice",
        tenantScope: { kind: "tenant", tenantId: "team-a" },
      },
    } as KnowledgeJobSnapshot);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("pauses for account/tenant/profile changes while token refresh retains active work", async () => {
    startKnowledgeProviderAfterAuth();
    await flush();
    mocks.coordinator.pauseForIdentityChange.mockClear();
    const changed = mocks.subscribeSession.mock.calls.at(-1)![0] as () => void;
    changed();
    await flush();
    expect(mocks.coordinator.pauseForIdentityChange).not.toHaveBeenCalled();
    mocks.session!.user.tenantId = "team-b";
    changed();
    await flush();
    expect(mocks.coordinator.pauseForIdentityChange).toHaveBeenCalledTimes(1);
    pauseKnowledgeJobsForProfileChange();
    expect(getCachedKnowledgeCapability().available).toBe(false);
    mocks.profile = "other";
    resumeKnowledgeJobsForActiveProfile();
    await flush();
    expect(mocks.coordinator.recoverOnStart).toHaveBeenCalled();
  });

  it("does not let a late capability probe replace a new identity's capability", async () => {
    let acceptOld!: (value: {
      available: boolean;
      status: "available";
    }) => void;
    mocks.probe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acceptOld = resolve;
        }),
    );
    const old = refreshKnowledgeCapability();
    invalidateKnowledgeCapability();
    mocks.probe.mockResolvedValue({
      available: false,
      status: "auth_required",
    });
    await refreshKnowledgeCapability();
    acceptOld({ available: true, status: "available" });
    await old;
    expect(getCachedKnowledgeCapability()).toEqual({
      available: false,
      status: "auth_required",
    });
  });

  it("rejects a picker command when identity changes during its capability preflight", async () => {
    let accept!: (value: { available: boolean; status: "available" }) => void;
    mocks.probe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    const pending = handlers.get(KNOWLEDGE_JOB_IPC_CHANNELS.pickAndUpload)!(
      {},
      { knowledgeBaseId: "kb-1" },
    );
    mocks.session!.user.id = "bob";
    accept({ available: true, status: "available" });
    await expect(pending).rejects.toThrow("KNOWLEDGE_JOB_PARTITION_DENIED");
    expect(mocks.coordinator.pickAndUpload).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
