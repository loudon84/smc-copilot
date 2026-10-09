// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";
import type { KnowledgeJobSnapshot } from "../../shared/knowledge/knowledge-job-ipc";
import type { ParsedIngestionJob } from "./knowledge-schema";

const state = vi.hoisted(() => ({
  job: null as KnowledgeJobSnapshot | null,
  row: {
    managed_file_id: "file-1",
    remote_ingestion_job_id: null as string | null,
  },
  file: {
    name: "ok.pdf",
    mime: "application/pdf",
    originalPath: "/ok.pdf",
    contentHash: "",
  },
  writes: [] as Array<Record<string, unknown>>,
  read: vi.fn(),
  upload: vi.fn(),
  query: vi.fn(),
  retry: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("fs/promises", () => ({ readFile: state.read }));
vi.mock("../files/file-association-store", () => ({
  getManagedFile: () => state.file,
}));
vi.mock("./knowledge-http-provider", () => ({
  getKnowledgeHttpProvider: () => ({
    uploadBaseFile: state.upload,
    getIngestionJob: state.query,
    retryIngestionJob: state.retry,
    cancelIngestionJob: state.cancel,
  }),
}));
vi.mock("./knowledge-upload-job-store", () => ({
  getJobById: () => state.job,
  getJobRow: () => state.row,
  updateJobRecord: (input: Record<string, unknown>) => {
    if (!state.job || input.expectedAttempt !== state.job.attempt) return null;
    state.writes.push(input);
    state.job = {
      ...state.job,
      ...input,
      phase:
        input.phase === null ? undefined : (input.phase ?? state.job.phase),
      revision: (state.job.revision ?? 0) + 1,
      lastRemoteConfirmedAt: input.remoteConfirmed
        ? new Date().toISOString()
        : state.job.lastRemoteConfirmedAt,
    } as KnowledgeJobSnapshot;
    if (typeof input.remoteIngestionJobId === "string") {
      state.row.remote_ingestion_job_id = input.remoteIngestionJobId;
    }
    return state.job;
  },
}));

import {
  cancelProviderJob,
  confirmProviderJobOnce,
  mapIngestionStatus,
  pollIngestionUntilTerminal,
  reconcileProviderJob,
  retryProviderJob,
  runProviderUpload,
} from "./knowledge-job-runtime";

function remote(
  status = "parse_dispatched",
  progress = 70,
): ParsedIngestionJob {
  return { id: "remote-1", sourceFileId: "source-1", status, progress };
}

describe("provider upload runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    state.job = {
      jobId: "job-1",
      knowledgeBaseId: "kb-1",
      attempt: 1,
      status: "queued",
      progress: 0,
      dataMode: "provider",
      synthetic: false,
      partition: {
        workProfileId: "work-1",
        authSubject: "user-1",
        tenantScope: { kind: "personal" },
      },
      updatedAt: "2026-10-08T00:00:00Z",
    };
    state.row = { managed_file_id: "file-1", remote_ingestion_job_id: null };
    state.file.contentHash = "";
    state.writes = [];
    state.read.mockResolvedValue(Buffer.from("%PDF-1.7\n"));
    state.upload.mockResolvedValue({
      sourceFileId: "source-1",
      fileVersionId: "version-1",
      job: remote(),
    });
    state.query.mockResolvedValue(remote("active", 100));
    state.retry.mockResolvedValue(remote());
    state.cancel.mockResolvedValue(remote("cancelled"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps unknown outcomes separately and completes only on active", () => {
    expect(mapIngestionStatus("active")).toBe("completed");
    expect(mapIngestionStatus("upload_unknown")).toBe("awaiting_confirmation");
    expect(mapIngestionStatus("parsing")).toBe("processing");
    expect(mapIngestionStatus("failed")).toBe("failed");
    expect(mapIngestionStatus("cancelled")).toBe("cancelled");
  });

  it("saves identifiers and accepted status in one update and releases submission without polling", async () => {
    const controller = new AbortController();
    await runProviderUpload("job-1", { signal: controller.signal });
    expect(state.query).not.toHaveBeenCalled();
    expect(state.writes.at(-1)).toMatchObject({
      remoteSourceFileId: "source-1",
      remoteIngestionJobId: "remote-1",
      status: "processing",
      phase: "waiting_parse",
      expectedAttempt: 1,
      progress: 70,
      remoteConfirmed: true,
    });
    expect(state.upload).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(state.writes[0]?.progress).toBe(0);
  });

  it.each([
    "uploading",
    "awaiting_confirmation",
    "processing",
    "draft",
  ] as const)("does not submit an existing %s task again", async (status) => {
    state.job!.status = status;
    await runProviderUpload("job-1");
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.read).not.toHaveBeenCalled();
  });

  it("keeps one percent as one percent", async () => {
    state.upload.mockResolvedValue({
      sourceFileId: "source-1",
      job: remote("parse_dispatched", 1),
    });
    await runProviderUpload("job-1");
    expect(state.job?.progress).toBe(1);
  });

  it("stops after read when cancellation or a newer attempt wins", async () => {
    state.read.mockImplementation(async () => {
      state.job!.attempt = 2;
      return Buffer.from("%PDF-1.7\n");
    });
    await runProviderUpload("job-1", { attempt: 1 });
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.writes).toHaveLength(0);
    const controller = new AbortController();
    controller.abort();
    await runProviderUpload("job-1", { signal: controller.signal });
    expect(state.read).toHaveBeenCalledTimes(1);
  });

  it("rejects changed content before sending bytes", async () => {
    state.file.contentHash = createHash("sha256")
      .update("different")
      .digest("hex");
    await runProviderUpload("job-1");
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.job).toMatchObject({
      status: "failed",
      errorCode: "KNOWLEDGE_JOB_FILE_CHANGED",
    });
  });

  it("retains an unknown submission without reuploading on reconciliation", async () => {
    state.upload.mockRejectedValue(
      new KnowledgeFacadeError({
        code: KNOWLEDGE_ERROR_CODES.TIMEOUT,
        httpStatus: 0,
        retryable: true,
      }),
    );
    await runProviderUpload("job-1");
    expect(state.job).toMatchObject({
      status: "awaiting_confirmation",
      phase: "confirming",
    });
    await runProviderUpload("job-1");
    await reconcileProviderJob("job-1");
    expect(state.upload).toHaveBeenCalledTimes(1);
  });

  it("keeps a definite permission rejection failed", async () => {
    state.upload.mockRejectedValue(
      new KnowledgeFacadeError({
        code: KNOWLEDGE_ERROR_CODES.FORBIDDEN,
        httpStatus: 403,
      }),
    );
    await runProviderUpload("job-1");
    expect(state.job).toMatchObject({
      status: "failed",
      errorCode: KNOWLEDGE_ERROR_CODES.FORBIDDEN,
    });
  });

  it.each([
    ["errors.knowledge.file_exists", KNOWLEDGE_ERROR_CODES.CONFLICT],
    ["errors.knowledge.upload_too_large", "FILE_TOO_LARGE"],
    ["errors.knowledge.upload_invalid", "KNOWLEDGE_UPLOAD_REJECTED"],
  ])(
    "retains non-retryable upload rejection for %s",
    async (messageKey, errorCode) => {
      state.upload.mockRejectedValue(
        new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
          httpStatus: 400,
          messageKey,
        }),
      );
      await runProviderUpload("job-1");
      expect(state.job).toMatchObject({ status: "failed", errorCode });
    },
  );

  it.each([
    [408, "awaiting_confirmation"],
    [429, "failed"],
  ])(
    "distinguishes upload timeout %s from a rate-limit rejection",
    async (httpStatus, status) => {
      state.upload.mockRejectedValue(
        new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
          httpStatus: httpStatus as number,
        }),
      );
      await runProviderUpload("job-1");
      expect(state.job!.status).toBe(status);
      expect(state.upload).toHaveBeenCalledTimes(1);
    },
  );

  it("ignores a late upload receipt from an old execution", async () => {
    state.upload.mockImplementation(async () => {
      state.job!.attempt = 2;
      state.job!.status = "cancelled";
      return { sourceFileId: "source-1", job: remote() };
    });
    await runProviderUpload("job-1", { attempt: 1 });
    expect(state.row.remote_ingestion_job_id).toBeNull();
    expect(state.job).toMatchObject({ attempt: 2, status: "cancelled" });
  });

  it("publishes parse stages, keeps polling past one minute, and stops at active", async () => {
    state.row.remote_ingestion_job_id = "remote-1";
    state.job!.status = "processing";
    const query = vi
      .fn()
      .mockResolvedValueOnce(remote("parse_dispatched", 1))
      .mockResolvedValueOnce(remote("validating", 90))
      .mockResolvedValue(remote("parsing", 80));
    const task = pollIngestionUntilTerminal("job-1", "remote-1", 1, { query });
    await vi.advanceTimersByTimeAsync(84_000);
    expect(query.mock.calls.length).toBeGreaterThan(40);
    expect(state.job!.status).toBe("processing");
    expect(
      state.writes.some(
        (input) => input.phase === "waiting_parse" && input.progress === 1,
      ),
    ).toBe(true);
    expect(state.writes.some((input) => input.phase === "validating")).toBe(
      true,
    );
    query.mockResolvedValue(remote("active", 100));
    await vi.advanceTimersByTimeAsync(2_000);
    await task;
    expect(state.job).toMatchObject({ status: "completed", progress: 100 });
    const calls = query.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(query).toHaveBeenCalledTimes(calls);
  });

  it("backs off temporary query errors for 5/10/30 seconds and recovers", async () => {
    state.row.remote_ingestion_job_id = "remote-1";
    const unavailable = new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
      httpStatus: 503,
      retryable: true,
    });
    const query = vi
      .fn()
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValue(remote("active", 100));
    const task = pollIngestionUntilTerminal("job-1", "remote-1", 1, { query });
    await vi.advanceTimersByTimeAsync(0);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(query).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(query).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30_000);
    await task;
    expect(query).toHaveBeenCalledTimes(4);
    expect(state.job!.status).toBe("completed");
  });

  it.each([408, 429])(
    "retries transient query HTTP %s without reupload",
    async (httpStatus) => {
      state.row.remote_ingestion_job_id = "remote-1";
      const query = vi
        .fn()
        .mockRejectedValueOnce(
          new KnowledgeFacadeError({
            code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
            httpStatus,
          }),
        )
        .mockResolvedValue(remote("active", 100));
      const task = pollIngestionUntilTerminal("job-1", "remote-1", 1, {
        query,
      });
      await vi.advanceTimersByTimeAsync(5_000);
      await task;
      expect(query).toHaveBeenCalledTimes(2);
      expect(state.upload).not.toHaveBeenCalled();
      expect(state.job!.status).toBe("completed");
    },
  );

  it("aborts a polling wait promptly and discards late query results", async () => {
    state.row.remote_ingestion_job_id = "remote-1";
    const controller = new AbortController();
    state.query.mockResolvedValue(remote("parsing", 80));
    const task = pollIngestionUntilTerminal("job-1", "remote-1", 1, {
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await task;
    expect(vi.getTimerCount()).toBe(0);
    expect(state.query).toHaveBeenCalledTimes(1);
    state.query.mockImplementation(async () => {
      state.job!.attempt = 2;
      return remote("active", 100);
    });
    await pollIngestionUntilTerminal("job-1", "remote-1", 1);
    expect(state.job).toMatchObject({ attempt: 2, status: "processing" });
  });

  it("never falls back to upload after remote retry failure and does not poll on retry success", async () => {
    state.row.remote_ingestion_job_id = "remote-1";
    state.retry.mockRejectedValue(new Error("temporary unavailable"));
    await retryProviderJob("job-1");
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.job!.status).toBe("awaiting_confirmation");
    state.retry.mockResolvedValue(remote());
    await retryProviderJob("job-1");
    expect(state.query).not.toHaveBeenCalled();
    expect(state.job).toMatchObject({
      status: "processing",
      phase: "waiting_parse",
    });
  });

  it("returns cancellation confirmation without declaring success on failure", async () => {
    state.row.remote_ingestion_job_id = "remote-1";
    const controller = new AbortController();
    await expect(
      cancelProviderJob("job-1", { signal: controller.signal }),
    ).resolves.toMatchObject({ status: "cancelled" });
    expect(state.cancel).toHaveBeenCalledWith("remote-1", {
      signal: controller.signal,
    });
    expect(state.writes).toHaveLength(0);
    state.cancel.mockRejectedValue(new Error("offline"));
    await expect(cancelProviderJob("job-1")).rejects.toThrow("offline");
    expect(state.job!.status).toBe("queued");
  });

  it("confirms exactly one GET without scheduling another poll or submitting a file", async () => {
    state.job!.status = "processing";
    state.row.remote_ingestion_job_id = "remote-1";
    state.query.mockResolvedValue(remote("parsing", 80));
    const result = await confirmProviderJobOnce("job-1", "remote-1", 1);
    expect(result).toMatchObject({
      status: "processing",
      phase: "parsing",
      progress: 80,
    });
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]?.remoteConfirmed).toBe(true);
    expect(result?.lastRemoteConfirmedAt).toBe(new Date().toISOString());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.query).toHaveBeenCalledTimes(1);
    expect(state.upload).not.toHaveBeenCalled();
  });

  it.each([403, 503])(
    "keeps the prior confirmation on a failed one-shot HTTP %s",
    async (httpStatus) => {
      state.row.remote_ingestion_job_id = "remote-1";
      state.job!.status = "processing";
      state.job!.lastRemoteConfirmedAt = "2026-10-08T01:00:00.000Z";
      state.query.mockRejectedValue(
        new KnowledgeFacadeError({
          code: KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
          httpStatus,
        }),
      );
      await expect(
        confirmProviderJobOnce("job-1", "remote-1", 1),
      ).rejects.toMatchObject({ httpStatus });
      expect(state.writes).toHaveLength(1);
      expect(state.writes[0]).not.toHaveProperty("remoteConfirmed");
      expect(state.job).toMatchObject({
        status: "awaiting_confirmation",
        lastRemoteConfirmedAt: "2026-10-08T01:00:00.000Z",
      });
      expect(state.upload).not.toHaveBeenCalled();
    },
  );

  it("rejects GET and mutation receipts for another remote task without confirming them", async () => {
    state.row.remote_ingestion_job_id = "remote-1";
    const mismatched = { ...remote(), id: "other-remote" };
    state.query.mockResolvedValue(mismatched);
    await expect(
      confirmProviderJobOnce("job-1", "remote-1", 1),
    ).rejects.toMatchObject({ code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID });
    expect(state.job?.lastRemoteConfirmedAt).toBeUndefined();
    expect(state.writes).toHaveLength(1);
    state.row.remote_ingestion_job_id = "remote-1";
    state.retry.mockResolvedValue(mismatched);
    await retryProviderJob("job-1");
    expect(state.job?.lastRemoteConfirmedAt).toBeUndefined();
    state.cancel.mockResolvedValue(mismatched);
    await expect(cancelProviderJob("job-1")).rejects.toMatchObject({
      code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
    });
    expect(state.writes.some((write) => write.remoteConfirmed)).toBe(false);
    expect(state.upload).not.toHaveBeenCalled();
  });

  it("does not confirm a successful GET when the local write is rejected", async () => {
    state.row.remote_ingestion_job_id = "remote-1";
    const update = vi.fn(() => null);
    expect(
      await confirmProviderJobOnce("job-1", "remote-1", 1, { update }),
    ).toBeNull();
    expect(update).toHaveBeenCalledOnce();
    expect(state.job?.lastRemoteConfirmedAt).toBeUndefined();
    expect(state.writes).toHaveLength(0);
  });

  it.each(["replacement-remote", null])(
    "ignores a GET when its remote binding changes to %s during the await",
    async (replacement) => {
      state.row.remote_ingestion_job_id = "remote-1";
      state.job!.status = "processing";
      state.job!.lastRemoteConfirmedAt = "2026-10-08T01:00:00.000Z";
      state.query.mockImplementation(async () => {
        state.row.remote_ingestion_job_id = replacement;
        return remote("active", 100);
      });
      expect(await confirmProviderJobOnce("job-1", "remote-1", 1)).toBeNull();
      expect(state.writes).toHaveLength(0);
      expect(state.job).toMatchObject({
        status: "processing",
        lastRemoteConfirmedAt: "2026-10-08T01:00:00.000Z",
      });
      expect(state.upload).not.toHaveBeenCalled();
    },
  );
});
