/**
 * Provider FileJob runtime: POST files + poll ingestion.
 * One Job / one file / one Base. Main-only remote ids.
 */

import { readFile } from "fs/promises";
import { getManagedFile } from "../files/file-association-store";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";
import type { KnowledgeJobStatus } from "../../shared/knowledge/knowledge-job-ipc";
import { getKnowledgeHttpProvider } from "./knowledge-http-provider";
import {
  bindJobRemoteIds,
  getJobById,
  getJobRow,
  updateJobRecord,
} from "./knowledge-upload-job-store";
import type { ParsedIngestionJob } from "./knowledge-schema";

const POLL_MS = 1500;
const POLL_MAX = 40;

export function mapIngestionStatus(status: string): KnowledgeJobStatus {
  if (status === "active") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (
    status === "pending" ||
    status === "uploading" ||
    status === "upload_unknown"
  ) {
    return "uploading";
  }
  return "processing";
}

function ingestionProgress(job: ParsedIngestionJob): number {
  if (job.status === "active") return 100;
  const raw = Number(job.progress);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(99, Math.round(raw <= 1 ? raw * 100 : raw)));
}

async function persistMapped(
  jobId: string,
  attempt: number,
  remote: ParsedIngestionJob,
  extras: { errorCode?: string | null } = {},
): Promise<void> {
  updateJobRecord({
    jobId,
    status: mapIngestionStatus(remote.status),
    attempt,
    progress: ingestionProgress(remote),
    errorCode:
      extras.errorCode ??
      (remote.status === "failed" ? remote.errorCode || "INGESTION_FAILED" : null),
  });
}

export async function runProviderUpload(jobId: string): Promise<void> {
  const snap = getJobById(jobId);
  const row = getJobRow(jobId);
  if (!snap || !row) return;
  if (snap.knowledgeBaseId === "unbound") {
    updateJobRecord({
      jobId,
      status: "failed",
      attempt: snap.attempt,
      errorCode: KNOWLEDGE_ERROR_CODES.JOB_TARGET_MISMATCH,
    });
    return;
  }
  if (!row.managed_file_id) {
    return;
  }

  const file = getManagedFile(snap.partition.workProfileId, row.managed_file_id);
  const filePath = file?.managedPath || file?.originalPath;
  if (!file || !filePath) {
    updateJobRecord({
      jobId,
      status: "failed",
      attempt: snap.attempt,
      errorCode: KNOWLEDGE_ERROR_CODES.JOB_FILE_MISSING,
    });
    return;
  }

  updateJobRecord({
    jobId,
    status: "uploading",
    attempt: snap.attempt,
    progress: 20,
    errorCode: null,
  });

  try {
    const bytes = await readFile(filePath);
    const accepted = await getKnowledgeHttpProvider().uploadBaseFile({
      knowledgeBaseId: snap.knowledgeBaseId,
      fileName: file.name,
      bytes,
      mimeType: file.mime,
    });
    bindJobRemoteIds(jobId, {
      remoteSourceFileId: accepted.sourceFileId,
      remoteIngestionJobId: accepted.job.id,
    });
    await persistMapped(jobId, snap.attempt, accepted.job);
    await pollIngestionUntilTerminal(jobId, accepted.job.id, snap.attempt);
  } catch (err) {
    const code =
      err instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(err.message.split(/\s/)[0] ?? "")
        ? err.message.split(/\s/)[0]!
        : "KNOWLEDGE_UNAVAILABLE";
    updateJobRecord({
      jobId,
      status: "failed",
      attempt: snap.attempt,
      errorCode: code,
    });
  }
}

export async function pollIngestionUntilTerminal(
  jobId: string,
  remoteJobId: string,
  attempt: number,
): Promise<void> {
  const provider = getKnowledgeHttpProvider();
  for (let i = 0; i < POLL_MAX; i += 1) {
    const current = getJobById(jobId);
    if (!current || current.status === "cancelled") return;
    const remote = await provider.getIngestionJob(remoteJobId);
    await persistMapped(jobId, attempt, remote);
    if (
      remote.status === "active" ||
      remote.status === "failed" ||
      remote.status === "cancelled"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  updateJobRecord({
    jobId,
    status: "interrupted",
    attempt,
    errorCode: KNOWLEDGE_ERROR_CODES.TIMEOUT,
  });
}

export async function retryProviderJob(jobId: string): Promise<void> {
  const row = getJobRow(jobId);
  const snap = getJobById(jobId);
  if (!row || !snap) return;
  if (row.remote_ingestion_job_id) {
    try {
      const remote = await getKnowledgeHttpProvider().retryIngestionJob(
        row.remote_ingestion_job_id,
      );
      await persistMapped(jobId, snap.attempt, remote);
      await pollIngestionUntilTerminal(jobId, remote.id, snap.attempt);
      return;
    } catch {
      // Fall through to re-upload when retry endpoint fails without a live job.
    }
  }
  if (row.managed_file_id) {
    await runProviderUpload(jobId);
  }
}

export async function cancelProviderJob(jobId: string): Promise<void> {
  const row = getJobRow(jobId);
  if (!row?.remote_ingestion_job_id) return;
  try {
    await getKnowledgeHttpProvider().cancelIngestionJob(row.remote_ingestion_job_id);
  } catch {
    // Local cancel still wins; remote cancel is best-effort.
  }
}

export async function reconcileProviderJob(jobId: string): Promise<void> {
  const row = getJobRow(jobId);
  const snap = getJobById(jobId);
  if (!row || !snap) return;
  if (row.remote_ingestion_job_id) {
    await pollIngestionUntilTerminal(
      jobId,
      row.remote_ingestion_job_id,
      snap.attempt,
    );
    return;
  }
  if (row.managed_file_id && snap.status !== "draft") {
    await runProviderUpload(jobId);
  }
}
