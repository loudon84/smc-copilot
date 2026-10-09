// @vitest-environment node
/**
 * Upload-Byte Gate in runProviderUpload — zero HTTP on REJECT.
 */
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  hermesHome: "",
  uploadCalls: 0,
  lastUploadBytes: null as Buffer | null,
  jobs: new Map<
    string,
    {
      jobId: string;
      knowledgeBaseId: string;
      attempt: number;
      status: string;
      errorCode: string | null;
      managed_file_id: string | null;
      partition: {
        workProfileId: string;
        authSubject: string;
        tenantScope: { kind: "personal" };
      };
    }
  >(),
  files: new Map<
    string,
    {
      id: string;
      name: string;
      mime: string;
      managedPath?: string;
      originalPath?: string;
    }
  >(),
}));

vi.mock("./knowledge-http-provider", () => ({
  getKnowledgeHttpProvider: () => ({
    uploadBaseFile: async (input: {
      fileName: string;
      bytes: Buffer;
      knowledgeBaseId: string;
      mimeType: string;
    }) => {
      mockState.uploadCalls += 1;
      mockState.lastUploadBytes = Buffer.from(input.bytes);
      return {
        sourceFileId: "sf-1",
        job: {
          id: "ing-1",
          status: "active",
          progress: 1,
          errorCode: null,
        },
      };
    },
    getIngestionJob: async () => ({
      id: "ing-1",
      status: "active",
      progress: 1,
      errorCode: null,
    }),
  }),
}));

vi.mock("../files/file-association-store", () => ({
  getManagedFile: (_profile: string, id: string) => mockState.files.get(id),
}));

vi.mock("./knowledge-upload-job-store", () => ({
  getJobById: (jobId: string) => {
    const j = mockState.jobs.get(jobId);
    if (!j) return null;
    return {
      jobId: j.jobId,
      knowledgeBaseId: j.knowledgeBaseId,
      attempt: j.attempt,
      status: j.status,
      errorCode: j.errorCode ?? undefined,
      progress: 0,
      partition: j.partition,
      updatedAt: new Date().toISOString(),
      dataMode: "provider" as const,
      synthetic: false,
    };
  },
  getJobRow: (jobId: string) => {
    const j = mockState.jobs.get(jobId);
    if (!j) return null;
    return {
      managed_file_id: j.managed_file_id,
      remote_ingestion_job_id: null as string | null,
    };
  },
  updateJobRecord: (input: {
    jobId: string;
    status?: string;
    attempt?: number;
    errorCode?: string | null;
    progress?: number;
  }) => {
    const j = mockState.jobs.get(input.jobId);
    if (!j) return;
    if (input.status) j.status = input.status;
    if (input.attempt != null) j.attempt = input.attempt;
    if (input.errorCode !== undefined) j.errorCode = input.errorCode;
    return {
      ...j,
      dataMode: "provider",
      synthetic: false,
      progress: input.progress ?? 0,
      updatedAt: new Date().toISOString(),
    };
  },
  bindJobRemoteIds: () => undefined,
}));

describe("runProviderUpload upload-byte gate", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "ubg-runtime-"));
    mockState.uploadCalls = 0;
    mockState.lastUploadBytes = null;
    mockState.jobs.clear();
    mockState.files.clear();
    vi.resetModules();
  });

  afterEach(() => {
    try {
      rmSync(mockState.hermesHome, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function seedJob(fileName: string, data: Buffer) {
    const fileId = "mf-1";
    const path = join(mockState.hermesHome, fileName);
    writeFileSync(path, data);
    mockState.files.set(fileId, {
      id: fileId,
      name: fileName,
      mime: "application/pdf",
      originalPath: path,
    });
    mockState.jobs.set("job-1", {
      jobId: "job-1",
      knowledgeBaseId: "kb-1",
      attempt: 1,
      status: "queued",
      errorCode: null,
      managed_file_id: fileId,
      partition: {
        workProfileId: "wp",
        authSubject: "u",
        tenantScope: { kind: "personal" },
      },
    });
  }

  it("uploads when pdf buffer is readable (A-UBG-001)", async () => {
    seedJob("ok.pdf", Buffer.from("%PDF-1.7\n"));
    const { runProviderUpload } = await import("./knowledge-job-runtime");
    await runProviderUpload("job-1");
    expect(mockState.uploadCalls).toBe(1);
    expect(mockState.lastUploadBytes?.subarray(0, 5).toString("ascii")).toBe(
      "%PDF-",
    );
  });

  it("rejects unreadable pdf with zero HTTP (A-UBG-002/003)", async () => {
    seedJob("cipher.pdf", Buffer.alloc(32, 0xab));
    const { runProviderUpload, FILE_UPLOAD_CONTENT_UNREADABLE } =
      await import("./knowledge-job-runtime");
    await runProviderUpload("job-1");
    expect(mockState.uploadCalls).toBe(0);
    const job = mockState.jobs.get("job-1");
    expect(job?.status).toBe("failed");
    expect(job?.errorCode).toBe(FILE_UPLOAD_CONTENT_UNREADABLE);
  });

  it("rejects unreadable docx with zero HTTP (A-UBG-004)", async () => {
    seedJob("bad.docx", Buffer.from("not-a-zip"));
    mockState.files.get("mf-1")!.mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const { runProviderUpload } = await import("./knowledge-job-runtime");
    await runProviderUpload("job-1");
    expect(mockState.uploadCalls).toBe(0);
    expect(mockState.jobs.get("job-1")?.errorCode).toBe(
      "FILE_UPLOAD_CONTENT_UNREADABLE",
    );
  });
});

describe("addFileVersion upload-byte gate helper", () => {
  it("assertUploadBytesReadable rejects bad pdf for A-UBG-006 contract", async () => {
    const { assertUploadBytesReadable } =
      await import("../files/upload-byte-gate");
    const r = assertUploadBytesReadable("v.pdf", Buffer.from("xxxx"));
    expect(r.status).toBe("REJECT");
  });
});
