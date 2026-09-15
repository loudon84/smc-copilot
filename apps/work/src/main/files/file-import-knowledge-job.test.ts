// @vitest-environment node
/**
 * V04 / TA-WK01-IMPORT — Knowledge Job file-import consumer (C08).
 * Must not import React, renderer, or composerFilePlatform.
 */
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
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
  const actual = await vi.importActual<typeof import("./file-config")>(
    "./file-config",
  );
  return {
    ...actual,
    readDesktopFilesConfig: (profile?: string) => {
      mockState.configProfiles.push(profile ?? "default");
      return {
        ...actual.readDesktopFilesConfig(profile),
        managedStorage: true,
        copyPickerFiles: true,
      };
    },
  };
});

vi.mock("./file-store", async () => {
  const actual = await vi.importActual<typeof import("./file-store")>(
    "./file-store",
  );
  return {
    ...actual,
    storeManagedCopy: async (
      sourcePath: string,
      hash: string,
      profile?: string,
    ) => {
      mockState.copyProfiles.push(profile ?? "default");
      return actual.storeManagedCopy(sourcePath, hash, profile);
    },
  };
});

vi.mock("./jobs/parse-file-job", () => ({
  scheduleParseJob: (profile: string | undefined, _fileId: string) => {
    mockState.parseProfiles.push(profile ?? "default");
  },
}));

type JobRow = {
  job_id: string;
  knowledge_base_id: string;
  work_profile_id: string;
  auth_subject: string;
  tenant_scope_kind: string;
  tenant_id: string | null;
  status: string;
  attempt: number;
  last_command_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "knowledge_upload_jobs";

class FakeStatement {
  constructor(
    private readonly sql: string,
    private readonly db: FakeDb,
  ) {}

  get(...args: unknown[]): unknown {
    if (this.sql.includes("sqlite_master")) {
      const name = String(args[0] ?? "");
      return this.db.tables.has(name) ? { name } : undefined;
    }
    if (this.sql.includes(`FROM ${TABLE}`) && this.sql.includes("job_id")) {
      const jobId = String(args[0]);
      return this.db.jobs.get(jobId);
    }
    return undefined;
  }

  all(): unknown[] {
    return [];
  }

  run(...args: unknown[]): void {
    if (this.sql.includes(`INSERT INTO ${TABLE}`)) {
      const [
        job_id,
        knowledge_base_id,
        work_profile_id,
        auth_subject,
        tenant_scope_kind,
        tenant_id,
        status,
        attempt,
        last_command_id,
        error_code,
        created_at,
        updated_at,
      ] = args;
      this.db.jobs.set(String(job_id), {
        job_id: String(job_id),
        knowledge_base_id: String(knowledge_base_id),
        work_profile_id: String(work_profile_id),
        auth_subject: String(auth_subject),
        tenant_scope_kind: String(tenant_scope_kind),
        tenant_id: tenant_id == null ? null : String(tenant_id),
        status: String(status),
        attempt: Number(attempt),
        last_command_id:
          last_command_id == null ? null : String(last_command_id),
        error_code: error_code == null ? null : String(error_code),
        created_at: String(created_at),
        updated_at: String(updated_at),
      });
    }
  }
}

class FakeDb {
  readonly tables = new Set<string>();
  readonly jobs = new Map<string, JobRow>();

  exec(): void {
    this.tables.add(TABLE);
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql.trim(), this);
  }
}

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
): Promise<void> {
  const {
    createKnowledgeUploadJobCoordinator,
    resetKnowledgeUploadJobCoordinatorForTests,
  } = await import("../knowledge/knowledge-upload-job-coordinator");
  resetKnowledgeUploadJobCoordinatorForTests();
  createKnowledgeUploadJobCoordinator({
    getPartition: () => partition,
    isProviderAvailable: () => false,
  });
}

async function draftJob(
  partition: KnowledgeJobPartition,
  knowledgeBaseId: string,
) {
  const { insertDraftJob } = await import(
    "../knowledge/knowledge-upload-job-store"
  );
  return insertDraftJob({ partition, knowledgeBaseId });
}

describe("file-import Knowledge Job consumer (V04)", () => {
  let fakeDb: FakeDb;

  beforeEach(async () => {
    mockState.hermesHome = mkdtempSync(
      join(tmpdir(), "hermes-files-import-kj-"),
    );
    resetTrackers();
    fakeDb = new FakeDb();
    mockedGetDbConnection.mockReturnValue(fakeDb as never);
    vi.resetModules();
    await bootCoordinator(PARTITION_A);
  });

  afterEach(async () => {
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
      const { resetKnowledgeUploadJobCoordinatorForTests } = await import(
        "../knowledge/knowledge-upload-job-coordinator"
      );
      resetKnowledgeUploadJobCoordinatorForTests();
    } catch {
      // ignore
    }
    try {
      rmSync(mockState.hermesHome, { recursive: true, force: true });
    } catch {
      // Windows may hold WAL locks briefly; best-effort cleanup.
    }
  });

  it("binds Knowledge import to Job workProfileId without sessionId", async () => {
    const job = await draftJob(PARTITION_A, "kb-1");
    const { importOnePath } = await import("./file-import-service");
    const { findAssociation, getManagedFile, listBySession } = await import(
      "./file-association-store"
    );

    const result = await importOnePath(
      sampleFile("knowledge.txt"),
      knowledgeContext(job.jobId),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockState.configProfiles).toEqual(["profile-job"]);
    expect(mockState.copyProfiles).toEqual(["profile-job"]);
    expect(mockState.parseProfiles).toEqual(["profile-job"]);
    expect(mockState.configProfiles).not.toContain("renderer-spoofed-profile");

    const managed = getManagedFile("profile-job", result.file.id);
    expect(managed?.profileId).toBe("profile-job");

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
    const managedPath = store.getManagedFile("profile-job", chat.file.id)
      ?.managedPath;
    if (managedPath) {
      expect(existsSync(managedPath)).toBe(true);
    }
  });
});
