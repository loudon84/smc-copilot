/** Provider upload submission and independently scheduled ingestion polling. */

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { getManagedFile } from "../files/file-association-store";
import {
  assertUploadBytesReadable,
  logUploadByteCheckEvent,
} from "../files/upload-byte-gate";
import { FILE_UPLOAD_CONTENT_UNREADABLE_CODE } from "../../shared/files";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";
import {
  isKnowledgeJobTerminal,
  type KnowledgeJobPhase,
  type KnowledgeJobSnapshot,
  type KnowledgeJobStatus,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  KnowledgeFacadeError,
  toKnowledgeFacadeError,
} from "../../shared/knowledge/knowledge-errors";
import { getKnowledgeHttpProvider } from "./knowledge-http-provider";
import {
  getJobById,
  getJobRow,
  updateJobRecord,
} from "./knowledge-upload-job-store";
import type { ParsedIngestionJob } from "./knowledge-schema";

/** @deprecated use FILE_UPLOAD_CONTENT_UNREADABLE_CODE from shared/files */
export const FILE_UPLOAD_CONTENT_UNREADABLE =
  FILE_UPLOAD_CONTENT_UNREADABLE_CODE;

export interface ProviderJobRuntimeOptions {
  attempt?: number;
  signal?: AbortSignal;
  update?: (
    input: Parameters<typeof updateJobRecord>[0],
  ) => KnowledgeJobSnapshot | null;
  query?: (
    remoteJobId: string,
    signal?: AbortSignal,
  ) => Promise<ParsedIngestionJob>;
  confirm?: (
    remoteJobId: string,
    signal?: AbortSignal,
  ) => Promise<KnowledgeJobSnapshot | null>;
}

const POLL_MS = 2_000;
const ERROR_BACKOFF_MS = [5_000, 10_000, 30_000];

export function mapIngestionStatus(status: string): KnowledgeJobStatus {
  if (status === "active") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "upload_unknown") return "awaiting_confirmation";
  if (status === "pending" || status === "uploading") return "uploading";
  return "processing";
}

function ingestionPhase(status: string): KnowledgeJobPhase | null {
  if (status === "upload_unknown") return "confirming";
  if (status === "parsing") return "parsing";
  if (status === "validating") return "validating";
  if (
    ["ragflow_uploaded", "metadata_synced", "parse_dispatched"].includes(status)
  ) {
    return "waiting_parse";
  }
  return null;
}

function currentJob(
  jobId: string,
  attempt: number,
  signal?: AbortSignal,
): KnowledgeJobSnapshot | null {
  if (signal?.aborted) return null;
  const current = getJobById(jobId);
  return current &&
    current.attempt === attempt &&
    !isKnowledgeJobTerminal(current.status)
    ? current
    : null;
}

function write(
  jobId: string,
  attempt: number,
  options: ProviderJobRuntimeOptions,
  patch: Omit<Parameters<typeof updateJobRecord>[0], "jobId" | "attempt">,
): KnowledgeJobSnapshot | null {
  const current = currentJob(jobId, attempt, options.signal);
  if (!current) return null;
  return (options.update ?? updateJobRecord)({
    ...patch,
    jobId,
    attempt,
    expectedAttempt: attempt,
    partition: current.partition,
  });
}

function persistMapped(
  jobId: string,
  attempt: number,
  remote: ParsedIngestionJob,
  options: ProviderJobRuntimeOptions,
  ids: { remoteSourceFileId?: string; remoteIngestionJobId?: string } = {},
): KnowledgeJobSnapshot | null {
  const raw = Number(remote.progress);
  return write(jobId, attempt, options, {
    ...ids,
    status: mapIngestionStatus(remote.status),
    phase: ingestionPhase(remote.status),
    progress:
      remote.status === "active"
        ? 100
        : Number.isFinite(raw)
          ? Math.max(0, Math.min(100, Math.round(raw)))
          : 0,
    errorCode:
      remote.status === "failed"
        ? remote.errorCode || "INGESTION_FAILED"
        : null,
    remoteConfirmed: true,
  });
}

function assertRemoteJobId(
  remote: ParsedIngestionJob,
  remoteJobId: string,
): void {
  if (remote.id !== remoteJobId)
    throw new KnowledgeFacadeError({
      code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
      messageKey: "errors.knowledge.contract_invalid",
    });
}

export async function confirmProviderJobOnce(
  jobId: string,
  remoteJobId: string,
  attempt: number,
  options: ProviderJobRuntimeOptions = {},
): Promise<KnowledgeJobSnapshot | null> {
  if (
    !currentJob(jobId, attempt, options.signal) ||
    getJobRow(jobId)?.remote_ingestion_job_id !== remoteJobId
  )
    return null;
  const query =
    options.query ??
    ((id, signal) =>
      getKnowledgeHttpProvider().getIngestionJob(id, { signal }));
  try {
    const remote = await query(remoteJobId, options.signal);
    if (
      !currentJob(jobId, attempt, options.signal) ||
      getJobRow(jobId)?.remote_ingestion_job_id !== remoteJobId
    )
      return null;
    assertRemoteJobId(remote, remoteJobId);
    return persistMapped(jobId, attempt, remote, options);
  } catch (err) {
    if (
      !currentJob(jobId, attempt, options.signal) ||
      getJobRow(jobId)?.remote_ingestion_job_id !== remoteJobId
    )
      return null;
    write(jobId, attempt, options, {
      status: "awaiting_confirmation",
      phase: "confirming",
      errorCode: toKnowledgeFacadeError(err).code,
    });
    throw err;
  }
}

function waitForPoll(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

export async function runProviderUpload(
  jobId: string,
  options: ProviderJobRuntimeOptions = {},
): Promise<void> {
  const snap = getJobById(jobId);
  const row = getJobRow(jobId);
  const attempt = options.attempt ?? snap?.attempt;
  if (
    !snap ||
    !row ||
    attempt == null ||
    !currentJob(jobId, attempt, options.signal)
  )
    return;
  if (row.remote_ingestion_job_id || snap.status !== "queued") return;
  if (snap.knowledgeBaseId === "unbound") {
    write(jobId, attempt, options, {
      status: "failed",
      errorCode: KNOWLEDGE_ERROR_CODES.JOB_TARGET_MISMATCH,
    });
    return;
  }
  if (!row.managed_file_id) return;

  const file = getManagedFile(
    snap.partition.workProfileId,
    row.managed_file_id,
  );
  const filePath = file?.managedPath || file?.originalPath;
  if (!file || !filePath) {
    write(jobId, attempt, options, {
      status: "failed",
      errorCode: KNOWLEDGE_ERROR_CODES.JOB_FILE_MISSING,
    });
    return;
  }

  let submitted = false;
  try {
    if (!currentJob(jobId, attempt, options.signal)) return;
    const bytes = await readFile(filePath, { signal: options.signal });
    if (!currentJob(jobId, attempt, options.signal)) return;
    if (
      file.contentHash &&
      createHash("sha256").update(bytes).digest("hex") !== file.contentHash
    ) {
      write(jobId, attempt, options, {
        status: "failed",
        errorCode: "KNOWLEDGE_JOB_FILE_CHANGED",
      });
      return;
    }
    const gate = assertUploadBytesReadable(file.name, bytes);
    logUploadByteCheckEvent({
      result: gate,
      errorCode:
        gate.status === "REJECT" ? FILE_UPLOAD_CONTENT_UNREADABLE_CODE : null,
      fileName: file.name,
    });
    if (gate.status === "REJECT") {
      write(jobId, attempt, options, {
        status: "failed",
        errorCode: FILE_UPLOAD_CONTENT_UNREADABLE_CODE,
      });
      return;
    }
    if (
      !write(jobId, attempt, options, {
        status: "uploading",
        phase: null,
        progress: 0,
        errorCode: null,
      })
    )
      return;
    if (!currentJob(jobId, attempt, options.signal)) return;
    submitted = true;
    const accepted = await getKnowledgeHttpProvider().uploadBaseFile({
      knowledgeBaseId: snap.knowledgeBaseId,
      fileName: file.name,
      bytes,
      mimeType: file.mime,
      signal: options.signal,
    });
    if (!currentJob(jobId, attempt, options.signal)) return;
    persistMapped(jobId, attempt, accepted.job, options, {
      remoteSourceFileId: accepted.sourceFileId,
      remoteIngestionJobId: accepted.job.id,
    });
  } catch (err) {
    if (!currentJob(jobId, attempt, options.signal)) return;
    const error = toKnowledgeFacadeError(err);
    const unknown =
      submitted &&
      (!error.httpStatus ||
        error.httpStatus < 400 ||
        error.httpStatus === 408 ||
        error.httpStatus >= 500);
    const rejectionCode =
      error.messageKey === "errors.knowledge.file_exists"
        ? KNOWLEDGE_ERROR_CODES.CONFLICT
        : error.messageKey === "errors.knowledge.upload_too_large"
          ? "FILE_TOO_LARGE"
          : [400, 413, 415, 422].includes(error.httpStatus ?? 0)
            ? "KNOWLEDGE_UPLOAD_REJECTED"
            : error.code;
    write(jobId, attempt, options, {
      status: unknown ? "awaiting_confirmation" : "failed",
      phase: unknown ? "confirming" : null,
      errorCode: submitted
        ? rejectionCode
        : KNOWLEDGE_ERROR_CODES.JOB_FILE_MISSING,
    });
  }
}

export async function pollIngestionUntilTerminal(
  jobId: string,
  remoteJobId: string,
  attempt: number,
  options: ProviderJobRuntimeOptions = {},
): Promise<void> {
  const confirm =
    options.confirm ??
    ((id: string) => confirmProviderJobOnce(jobId, id, attempt, options));
  let errors = 0;
  while (currentJob(jobId, attempt, options.signal)) {
    let delay = POLL_MS;
    try {
      if (!currentJob(jobId, attempt, options.signal)) return;
      const updated = await confirm(remoteJobId, options.signal);
      if (!currentJob(jobId, attempt, options.signal)) return;
      errors = 0;
      if (!updated || isKnowledgeJobTerminal(updated.status)) return;
    } catch (err) {
      if (!currentJob(jobId, attempt, options.signal)) return;
      const error = toKnowledgeFacadeError(err);
      if (
        error.httpStatus &&
        error.httpStatus >= 400 &&
        error.httpStatus < 500 &&
        ![408, 429].includes(error.httpStatus)
      )
        return;
      delay =
        ERROR_BACKOFF_MS[Math.min(errors++, ERROR_BACKOFF_MS.length - 1)]!;
    }
    if (!currentJob(jobId, attempt, options.signal)) return;
    await waitForPoll(delay, options.signal);
    if (!currentJob(jobId, attempt, options.signal)) return;
  }
}

export async function retryProviderJob(
  jobId: string,
  options: ProviderJobRuntimeOptions = {},
): Promise<void> {
  const row = getJobRow(jobId);
  const snap = getJobById(jobId);
  const attempt = options.attempt ?? snap?.attempt;
  if (!row || attempt == null || !currentJob(jobId, attempt, options.signal))
    return;
  if (!row.remote_ingestion_job_id) {
    await runProviderUpload(jobId, options);
    return;
  }
  try {
    const remote = await getKnowledgeHttpProvider().retryIngestionJob(
      row.remote_ingestion_job_id,
      { signal: options.signal },
    );
    if (!currentJob(jobId, attempt, options.signal)) return;
    assertRemoteJobId(remote, row.remote_ingestion_job_id);
    persistMapped(jobId, attempt, remote, options);
  } catch (err) {
    if (!currentJob(jobId, attempt, options.signal)) return;
    write(jobId, attempt, options, {
      status: "awaiting_confirmation",
      phase: "confirming",
      errorCode: toKnowledgeFacadeError(err).code,
    });
  }
}

export async function cancelProviderJob(
  jobId: string,
  options: ProviderJobRuntimeOptions = {},
): Promise<ParsedIngestionJob | null> {
  const row = getJobRow(jobId);
  const snap = getJobById(jobId);
  const attempt = options.attempt ?? snap?.attempt;
  if (
    !row?.remote_ingestion_job_id ||
    attempt == null ||
    !currentJob(jobId, attempt, options.signal)
  )
    return null;
  const remote = await getKnowledgeHttpProvider().cancelIngestionJob(
    row.remote_ingestion_job_id,
    { signal: options.signal },
  );
  if (!currentJob(jobId, attempt, options.signal)) return null;
  assertRemoteJobId(remote, row.remote_ingestion_job_id);
  return remote;
}

export async function reconcileProviderJob(
  jobId: string,
  options: ProviderJobRuntimeOptions = {},
): Promise<void> {
  const row = getJobRow(jobId);
  const snap = getJobById(jobId);
  if (!row || !snap) return;
  const attempt = options.attempt ?? snap.attempt;
  if (row.remote_ingestion_job_id) {
    await pollIngestionUntilTerminal(
      jobId,
      row.remote_ingestion_job_id,
      attempt,
      options,
    );
  } else if (snap.status === "queued" && row.managed_file_id) {
    await runProviderUpload(jobId, options);
  }
}
