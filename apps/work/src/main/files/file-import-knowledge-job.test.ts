// @vitest-environment node
/**
 * V04 / TA-WK01-IMPORT — Knowledge Job file-import consumer (C08).
 * Must not import React, renderer, or composerFilePlatform.
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
import { openSqliteDatabase, type SqliteDatabase } from "../sqlite-database";
import type { KnowledgeJobPartition } from "../knowledge/knowledge-upload-job-coordinator";
import type {
  FileAssociation,
  FileImportContext,
  ManagedFile,
} from "../../shared/files";

vi.mock("../db", () => ({
  getDbConnection: vi.fn(),
}));

const mockedGetDbConnection = vi.mocked(getDbConnection);

const mockState = vi.hoisted(() => ({
  hermesHome: "",
  parseProfiles: [] as string[],
  configProfiles: [] as string[],
  copyProfiles: [] as string[],
  managedStorage: true,
  copyPickerFiles: false,
  beforeCopy: null as (() => Promise<void>) | null,
}));

vi.mock("../runtime/hermes-runtime-paths", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
  getHermesHome: () => mockState.hermesHome,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => mockState.hermesHome,
    setPath: () => undefined,
  },
}));

vi.mock("./file-config", async () => {
  const actual =
    await vi.importActual<typeof import("./file-config")>("./file-config");
  return {
    ...actual,
    readDesktopFilesConfig: (profile?: string) => {
      mockState.configProfiles.push(profile ?? "default");
      return {
        ...actual.readDesktopFilesConfig(profile),
        managedStorage: mockState.managedStorage,
        copyPickerFiles: mockState.copyPickerFiles,
      };
    },
  };
});

vi.mock("./file-store", async () => {
  const actual =
    await vi.importActual<typeof import("./file-store")>("./file-store");
  return {
    ...actual,
    storeManagedCopy: async (
      sourcePath: string,
      hash: string,
      profile?: string,
    ) => {
      mockState.copyProfiles.push(profile ?? "default");
      await mockState.beforeCopy?.();
      return actual.storeManagedCopy(sourcePath, hash, profile);
    },
  };
});

vi.mock("./jobs/parse-file-job", () => ({
  scheduleParseJob: (profile: string | undefined, _fileId: string) => {
    mockState.parseProfiles.push(profile ?? "default");
  },
}));

const PARTITION_A: KnowledgeJobPartition = {
  workProfileId: "profile-job",
  authSubject: "user-1",
  tenantScope: { kind: "tenant", tenantId: "tenant-1" },
};

const PARTITION_B: KnowledgeJobPartition = {
  workProfileId: "profile-job",
  authSubject: "user-2",
  tenantScope: { kind: "tenant", tenantId: "tenant-1" },
};

function resetTrackers(): void {
  mockState.configProfiles = [];
  mockState.copyProfiles = [];
  mockState.parseProfiles = [];
  mockState.managedStorage = true;
  mockState.copyPickerFiles = false;
  mockState.beforeCopy = null;
}

function sampleFile(name = "note.txt"): string {
  const path = join(mockState.hermesHome, name);
  writeFileSync(path, `body-${name}`);
  return path;
}

function knowledgeContext(
  jobId: string,
  overrides?: Partial<FileImportContext>,
): FileImportContext {
  return {
    knowledgeJobId: jobId,
    // Renderer may still send a misleading profile — Knowledge must ignore it.
    profile: "renderer-spoofed-profile",
    mode: "local",
    source: "picker",
    ...overrides,
  };
}

function chatContext(
  sessionId: string,
  overrides?: Partial<FileImportContext>,
): FileImportContext {
  return {
    sessionId,
    profile: "chat-profile",
    mode: "local",
    source: "picker",
    ...overrides,
  };
}

async function bootCoordinator(
  partition: KnowledgeJobPartition = PARTITION_A,
  dataMode: "mock" | "provider" = "provider",
): Promise<void> {
  const {
    createKnowledgeUploadJobCoordinator,
    resetKnowledgeUploadJobCoordinatorForTests,
  } = await import("../knowledge/knowledge-upload-job-coordinator");
  resetKnowledgeUploadJobCoordinatorForTests();
  createKnowledgeUploadJobCoordinator({
    getPartition: () => partition,
    isProviderAvailable: () => false,
    getDataMode: () => dataMode,
  });
}

async function draftJob(
  partition: KnowledgeJobPartition,
  knowledgeBaseId: string,
  dataMode: "mock" | "provider" = "provider",
) {
  const { insertDraftJob } =
    await import("../knowledge/knowledge-upload-job-store");
  return insertDraftJob({ partition, knowledgeBaseId, dataMode });
}

describe("file-import Knowledge Job consumer (V04)", () => {
  let jobDb: SqliteDatabase;

  beforeEach(async () => {
    mockState.hermesHome = mkdtempSync(
      join(tmpdir(), "hermes-files-import-kj-"),
    );
    resetTrackers();
    jobDb = openSqliteDatabase(":memory:");
    mockedGetDbConnection.mockReturnValue(jobDb);
    vi.resetModules();
    await bootCoordinator(PARTITION_A);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      const store = await import("./file-association-store");
      store.closeFileIndexDb("profile-job");
      store.closeFileIndexDb("chat-profile");
      store.closeFileIndexDb("renderer-spoofed-profile");
      store.closeFileIndexDb();
    } catch {
      // ignore
    }
    try {
      const { resetKnowledgeUploadJobCoordinatorForTests } =
        await import("../knowledge/knowledge-upload-job-coordinator");
      resetKnowledgeUploadJobCoordinatorForTests();
    } catch {
      // ignore
    }
    try {
      rmSync(mockState.hermesHome, { recursive: true, force: true });
    } catch {
      // Windows may hold WAL locks briefly; best-effort cleanup.
    }
    jobDb.close();
  });

  it("binds Knowledge import to Job workProfileId without sessionId", async () => {
    const job = await draftJob(PARTITION_A, "kb-1");
    const { importOnePath } = await import("./file-import-service");
    const { findAssociation, getManagedFile, listBySession } =
      await import("./file-association-store");

    const result = await importOnePath(
      sampleFile("knowledge.txt"),
      knowledgeContext(job.jobId),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockState.configProfiles).toEqual(["profile-job"]);
    expect(mockState.copyProfiles).toEqual(["profile-job"]);
    expect(mockState.parseProfiles).toEqual([]);
    expect(mockState.configProfiles).not.toContain("renderer-spoofed-profile");

    const managed = getManagedFile("profile-job", result.file.id);
    expect(managed?.profileId).toBe("profile-job");
    expect(managed?.managedPath && existsSync(managed.managedPath)).toBe(true);
    const { getJobRow } =
      await import("../knowledge/knowledge-upload-job-store");
    expect(getJobRow(job.jobId)?.managed_file_id).toBe(result.file.id);

    const assoc = findAssociation({
      profileId: "profile-job",
      fileId: result.file.id,
      knowledgeJobId: job.jobId,
      role: "prompt-attachment",
    });
    expect(assoc).toMatchObject({
      fileId: result.file.id,
      profileId: "profile-job",
      knowledgeJobId: job.jobId,
      role: "prompt-attachment",
    });
    expect(assoc?.sessionId).toBeUndefined();
    expect(listBySession("profile-job", "any-session")).toHaveLength(0);
  });

  it("reuses one managed file for concurrent same-content Knowledge imports", async () => {
    const firstJob = await draftJob(PARTITION_A, "kb-concurrent");
    const secondJob = await draftJob(PARTITION_A, "kb-concurrent");
    const { importOnePath } = await import("./file-import-service");
    const store = await import("./file-association-store");
    const { getJobRow } =
      await import("../knowledge/knowledge-upload-job-store");
    let releaseCopies!: () => void;
    let bothCopiesStarted!: () => void;
    const copyGate = new Promise<void>((resolve) => {
      releaseCopies = resolve;
    });
    const copiesStarted = new Promise<void>((resolve) => {
      bothCopiesStarted = resolve;
    });
    let arrivals = 0;
    mockState.beforeCopy = async () => {
      if (++arrivals === 2) bothCopiesStarted();
      await copyGate;
    };
    const sourcePath = sampleFile("concurrent-shared.txt");
    const imports = [
      importOnePath(sourcePath, knowledgeContext(firstJob.jobId)),
      importOnePath(sourcePath, knowledgeContext(secondJob.jobId)),
    ];
    await copiesStarted;
    expect(getJobRow(firstJob.jobId)?.managed_file_id).toBeNull();
    expect(getJobRow(secondJob.jobId)?.managed_file_id).toBeNull();
    releaseCopies();
    const [first, second] = await Promise.all(imports);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.file.id).toBe(first.file.id);
    expect(getJobRow(firstJob.jobId)?.managed_file_id).toBe(first.file.id);
    expect(getJobRow(secondJob.jobId)?.managed_file_id).toBe(first.file.id);
    for (const job of [firstJob, secondJob]) {
      expect(
        store.findAssociation({
          profileId: "profile-job",
          fileId: first.file.id,
          knowledgeJobId: job.jobId,
          role: "prompt-attachment",
        }),
      ).toMatchObject({ fileId: first.file.id, knowledgeJobId: job.jobId });
    }
    expect(store.countAssociations(first.file.id, "profile-job")).toBe(2);
    expect(mockState.parseProfiles).toEqual([]);
  });

  it("rejects unknown and cross-partition Knowledge imports before any File Platform write", async () => {
    const foreign = await draftJob(PARTITION_B, "kb-foreign");
    await bootCoordinator(PARTITION_A);

    const { importOnePath } = await import("./file-import-service");

    const unknown = await importOnePath(
      sampleFile("unknown.txt"),
      knowledgeContext("missing-job-id"),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error.message).toMatch(/KNOWLEDGE_JOB/);
      expect(JSON.stringify(unknown.error)).not.toMatch(/[A-Za-z]:\\/);
      expect(JSON.stringify(unknown.error)).not.toMatch(/Bearer\s+/i);
    }

    const cross = await importOnePath(
      sampleFile("cross.txt"),
      knowledgeContext(foreign.jobId),
    );
    expect(cross.ok).toBe(false);
    if (!cross.ok) {
      expect(cross.error.message).toMatch(/KNOWLEDGE_JOB/);
      expect(JSON.stringify(cross.error)).not.toMatch(/[A-Za-z]:\\/);
    }

    expect(mockState.configProfiles).toEqual([]);
    expect(mockState.copyProfiles).toEqual([]);
    expect(mockState.parseProfiles).toEqual([]);
  });

  it("rejects mixed or empty consumer keys at importOnePath", async () => {
    const job = await draftJob(PARTITION_A, "kb-1");
    const { importOnePath } = await import("./file-import-service");

    const mixed = await importOnePath(sampleFile("mixed.txt"), {
      sessionId: "sess-1",
      knowledgeJobId: job.jobId,
      mode: "local",
      source: "picker",
    });
    expect(mixed.ok).toBe(false);

    const empty = await importOnePath(sampleFile("empty.txt"), {
      mode: "local",
      source: "picker",
    } as FileImportContext);
    expect(empty.ok).toBe(false);
  });

  it("keeps Chat picker copies opt-in and respects disabled managed storage for Knowledge", async () => {
    const { importOnePath } = await import("./file-import-service");
    const chat = await importOnePath(
      sampleFile("chat-original.txt"),
      chatContext("session-original"),
    );
    expect(chat.ok).toBe(true);
    if (chat.ok) expect(chat.file.hasManagedCopy).toBe(false);
    expect(mockState.copyProfiles).toEqual([]);
    expect(mockState.parseProfiles).toEqual(["chat-profile"]);

    mockState.managedStorage = false;
    const job = await draftJob(PARTITION_A, "kb-original");
    const knowledge = await importOnePath(
      sampleFile("knowledge-original.txt"),
      knowledgeContext(job.jobId),
    );
    expect(knowledge.ok).toBe(true);
    if (knowledge.ok) expect(knowledge.file.hasManagedCopy).toBe(false);
    expect(mockState.copyProfiles).toEqual([]);
    expect(mockState.parseProfiles).toEqual(["chat-profile"]);
  });

  it.each(["cancel", "new-attempt", "identity-change"])(
    "does not bind a file after %s during an asynchronous import",
    async (change) => {
      const job = await draftJob(PARTITION_A, "kb-stale");
      const { importOnePath } = await import("./file-import-service");
      const { getJobRow, updateJobRecord } =
        await import("../knowledge/knowledge-upload-job-store");
      mockState.beforeCopy = async () => {
        if (change === "identity-change") {
          await bootCoordinator(PARTITION_B);
        } else {
          updateJobRecord({
            jobId: job.jobId,
            status: change === "cancel" ? "cancelled" : "draft",
            attempt: change === "cancel" ? 1 : 2,
            expectedAttempt: 1,
          });
        }
      };
      const result = await importOnePath(
        sampleFile(`stale-${change}.txt`),
        knowledgeContext(job.jobId),
      );
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error.message).toMatch(
          /KNOWLEDGE_JOB_(IMPORT_STALE|PARTITION_DENIED)/,
        );
      expect(getJobRow(job.jobId)?.managed_file_id).toBeNull();
      expect(mockState.parseProfiles).toEqual([]);
    },
  );

  it("returns a sanitized binding failure instead of reporting import success", async () => {
    const job = await draftJob(PARTITION_A, "kb-bind-fail");
    const { getKnowledgeUploadJobCoordinator } =
      await import("../knowledge/knowledge-upload-job-coordinator");
    vi.spyOn(
      getKnowledgeUploadJobCoordinator(),
      "bindImportedFile",
    ).mockImplementation(() => {
      throw new Error("KNOWLEDGE_JOB_STORE_UNAVAILABLE private path");
    });
    const { importOnePath } = await import("./file-import-service");
    const result = await importOnePath(
      sampleFile("binding-failed.txt"),
      knowledgeContext(job.jobId),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "FILE_ASSOCIATION_SAVE_FAILED",
        message: "KNOWLEDGE_JOB_STORE_UNAVAILABLE",
      },
    });
    expect(JSON.stringify(result)).not.toContain("private path");
  });

  it("does not bind a stale import after the account changes away and back", async () => {
    const { createKnowledgeUploadJobCoordinator } =
      await import("../knowledge/knowledge-upload-job-coordinator");
    let acting = PARTITION_A;
    const coordinator = createKnowledgeUploadJobCoordinator({
      getPartition: () => acting,
      isProviderAvailable: () => false,
      getDataMode: () => "provider",
    });
    const job = await draftJob(PARTITION_A, "kb-roundtrip");
    const { importOnePath } = await import("./file-import-service");
    const { getJobRow } =
      await import("../knowledge/knowledge-upload-job-store");
    mockState.beforeCopy = async () => {
      acting = PARTITION_B;
      coordinator.pauseForIdentityChange();
      acting = PARTITION_A;
      coordinator.pauseForIdentityChange();
    };
    const result = await importOnePath(
      sampleFile("roundtrip.txt"),
      knowledgeContext(job.jobId),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { message: "KNOWLEDGE_JOB_IMPORT_STALE" },
    });
    expect(getJobRow(job.jobId)?.managed_file_id).toBeNull();
    expect(mockState.parseProfiles).toEqual([]);
  });

  it("is idempotent for (profileId, fileId, knowledgeJobId, role)", async () => {
    const job = await draftJob(PARTITION_A, "kb-1");
    const store = await import("./file-association-store");
    const ts = "2026-01-01T00:00:00.000Z";
    const file: ManagedFile = {
      id: "f-kj-1",
      profileId: "profile-job",
      name: "doc.txt",
      extension: "txt",
      mime: "text/plain",
      category: "text",
      source: "picker",
      status: "ready",
      size: 4,
      createdAt: ts,
      updatedAt: ts,
    };
    store.upsertManagedFile(file);

    const a1: FileAssociation = {
      id: "a-kj-1",
      fileId: file.id,
      profileId: "profile-job",
      knowledgeJobId: job.jobId,
      role: "prompt-attachment",
      ordinal: 0,
      createdAt: ts,
    };
    const a2: FileAssociation = {
      ...a1,
      id: "a-kj-2",
      ordinal: 1,
    };
    store.insertAssociation(a1);
    store.insertAssociation(a2);

    const found = store.findAssociation({
      profileId: "profile-job",
      fileId: file.id,
      knowledgeJobId: job.jobId,
      role: "prompt-attachment",
    });
    expect(found?.id).toBe("a-kj-1");
    expect(store.countAssociations(file.id, "profile-job")).toBe(1);
  });

  it("rejects stageClipboardImport with knowledgeJobId; Chat clipboard still requires sessionId", async () => {
    const job = await draftJob(PARTITION_A, "kb-1");
    const { stageClipboardImport } = await import("./file-import-service");
    const payload = {
      filename: "paste.txt",
      mime: "text/plain",
      base64Bytes: Buffer.from("hello").toString("base64"),
    };

    const knowledgeClip = await stageClipboardImport(payload, {
      knowledgeJobId: job.jobId,
      mode: "local",
      source: "clipboard",
    });
    expect(knowledgeClip.ok).toBe(false);
    if (!knowledgeClip.ok) {
      expect(knowledgeClip.error.message).toMatch(/KNOWLEDGE|CLIPBOARD/i);
    }

    const missingSession = await stageClipboardImport(payload, {
      mode: "local",
      source: "clipboard",
    } as FileImportContext);
    expect(missingSession.ok).toBe(false);

    resetTrackers();
    const chatClip = await stageClipboardImport(
      payload,
      chatContext("sess-clip", {
        source: "clipboard",
        profile: "chat-profile",
      }),
    );
    expect(chatClip.ok).toBe(true);
    expect(mockState.parseProfiles).toEqual(["chat-profile"]);
    if (chatClip.ok) {
      const store = await import("./file-association-store");
      const assoc = store.findAssociation({
        profileId: "chat-profile",
        fileId: chatClip.file.id,
        sessionId: "sess-clip",
        role: "prompt-attachment",
      });
      expect(assoc?.sessionId).toBe("sess-clip");
      expect(assoc?.knowledgeJobId).toBeUndefined();
    }
  });

  it("keeps Chat import sessionId semantics and does not delete shared ManagedFile on Knowledge cleanup", async () => {
    const job = await draftJob(PARTITION_A, "kb-1");
    const { importOnePath } = await import("./file-import-service");
    const store = await import("./file-association-store");

    const chat = await importOnePath(
      sampleFile("shared.txt"),
      chatContext("sess-shared", { profile: "profile-job" }),
    );
    expect(chat.ok).toBe(true);
    if (!chat.ok) return;

    const chatAssoc = store.findAssociation({
      profileId: "profile-job",
      fileId: chat.file.id,
      sessionId: "sess-shared",
      role: "prompt-attachment",
    });
    expect(chatAssoc?.sessionId).toBe("sess-shared");
    expect(chatAssoc?.knowledgeJobId).toBeUndefined();

    // Same bytes → same ManagedFile via hash; Knowledge adds a second association.
    const knowledge = await importOnePath(
      sampleFile("shared.txt"),
      knowledgeContext(job.jobId),
    );
    expect(knowledge.ok).toBe(true);
    if (!knowledge.ok) return;
    expect(knowledge.file.id).toBe(chat.file.id);

    const kjAssoc = store.findAssociation({
      profileId: "profile-job",
      fileId: chat.file.id,
      knowledgeJobId: job.jobId,
      role: "prompt-attachment",
    });
    expect(kjAssoc?.id).toBeTruthy();
    expect(store.countAssociations(chat.file.id, "profile-job")).toBe(2);

    store.deleteAssociation("profile-job", kjAssoc!.id);
    expect(store.countAssociations(chat.file.id, "profile-job")).toBe(1);
    expect(store.getManagedFile("profile-job", chat.file.id)).not.toBeNull();

    const { cleanupOrphanFiles } = await import("./file-cleanup-service");
    cleanupOrphanFiles("profile-job");
    expect(store.getManagedFile("profile-job", chat.file.id)).not.toBeNull();
    const managedPath = store.getManagedFile(
      "profile-job",
      chat.file.id,
    )?.managedPath;
    if (managedPath) {
      expect(existsSync(managedPath)).toBe(true);
    }
  });

  it("stores dataMode=mock on Knowledge mock import without sessionId", async () => {
    await bootCoordinator(PARTITION_A, "mock");
    const job = await draftJob(PARTITION_A, "kb-mock", "mock");
    expect(job.dataMode).toBe("mock");

    const { importOnePath } = await import("./file-import-service");
    const store = await import("./file-association-store");

    const result = await importOnePath(
      sampleFile("mock-note.txt"),
      knowledgeContext(job.jobId),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assoc = store.findAssociation({
      profileId: "profile-job",
      fileId: result.file.id,
      knowledgeJobId: job.jobId,
      role: "prompt-attachment",
    });
    expect(assoc).toMatchObject({
      knowledgeJobId: job.jobId,
      dataMode: "mock",
    });
    expect(assoc?.sessionId).toBeUndefined();
    expect(store.listBySession("profile-job", "any-session")).toHaveLength(0);
  });

  it("keeps Chat associations consumable and does not delete shared ManagedFile on mock unlink", async () => {
    await bootCoordinator(PARTITION_A, "mock");
    const job = await draftJob(PARTITION_A, "kb-mock", "mock");
    const { importOnePath } = await import("./file-import-service");
    const store = await import("./file-association-store");

    const chat = await importOnePath(
      sampleFile("shared-mock.txt"),
      chatContext("sess-mock-shared", { profile: "profile-job" }),
    );
    expect(chat.ok).toBe(true);
    if (!chat.ok) return;

    const knowledge = await importOnePath(
      sampleFile("shared-mock.txt"),
      knowledgeContext(job.jobId),
    );
    expect(knowledge.ok).toBe(true);
    if (!knowledge.ok) return;
    expect(knowledge.file.id).toBe(chat.file.id);

    const mockAssoc = store.findAssociation({
      profileId: "profile-job",
      fileId: chat.file.id,
      knowledgeJobId: job.jobId,
      role: "prompt-attachment",
    });
    expect(mockAssoc?.dataMode).toBe("mock");
    expect(store.countAssociations(chat.file.id, "profile-job")).toBe(2);

    // Chat consumer list must still see the Chat association (mock is not consumable).
    const chatRows = store.listBySession("profile-job", "sess-mock-shared");
    expect(chatRows).toHaveLength(1);
    expect(chatRows[0]?.association.sessionId).toBe("sess-mock-shared");
    expect(chatRows[0]?.association.dataMode).not.toBe("mock");

    // Adversarial: mock row sharing the Chat session key must stay non-consumable.
    store.insertAssociation({
      id: "a-mock-sess-adversarial",
      fileId: chat.file.id,
      profileId: "profile-job",
      sessionId: "sess-mock-shared",
      knowledgeJobId: `${job.jobId}-adv`,
      dataMode: "mock",
      role: "reference",
      ordinal: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(store.listBySession("profile-job", "sess-mock-shared")).toHaveLength(
      1,
    );

    // Unlink mock via File Platform association cleanup only.
    store.deleteAssociation("profile-job", mockAssoc!.id);
    expect(store.countAssociations(chat.file.id, "profile-job")).toBe(2);
    expect(store.getManagedFile("profile-job", chat.file.id)).not.toBeNull();
    expect(store.listBySession("profile-job", "sess-mock-shared")).toHaveLength(
      1,
    );

    store.deleteAssociation("profile-job", "a-mock-sess-adversarial");
    expect(store.countAssociations(chat.file.id, "profile-job")).toBe(1);

    const { cleanupOrphanFiles } = await import("./file-cleanup-service");
    cleanupOrphanFiles("profile-job");
    expect(store.getManagedFile("profile-job", chat.file.id)).not.toBeNull();
  });
});
