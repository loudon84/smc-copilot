/**
 * Parse-file job: wraps parseFile and emits FileJobEvent progress.
 */

import { randomUUID } from "crypto";
import { makeFileError } from "../../../shared/files";
import { readDesktopFilesConfig } from "../file-config";
import { parseFile } from "../file-parse-service";
import { FilePlatformError } from "../file-security";
import { emitFileJobEvent } from "./file-job-events";
import { getFileJobQueue } from "./file-job-queue";

export interface EnqueueParseOptions {
  profile?: string;
  fileId: string;
  force?: boolean;
  /** When true, await job completion (retryParse). */
  wait?: boolean;
}

/**
 * Enqueue a parse job on the shared FileJobQueue.
 * Returns the job id. When `wait` is true, resolves after the job finishes.
 */
// @lat: [[file-platform#File job queue]]
export async function enqueueParseFileJob(
  options: EnqueueParseOptions,
): Promise<string> {
  const fileId = options.fileId;
  const profile = options.profile;
  const force = options.force === true;
  const config = readDesktopFilesConfig(profile);
  const concurrency = config.parsing.concurrency || 2;
  const queue = getFileJobQueue(concurrency);
  const jobId = randomUUID();

  queue.enqueue({
    id: jobId,
    kind: "parse",
    run: async ({ signal, jobId: id }) => {
      emitFileJobEvent({
        type: "file-job:started",
        fileId,
        jobId: id,
      });
      emitFileJobEvent({
        type: "file-job:progress",
        fileId,
        jobId: id,
        current: 0,
        total: 2,
        stage: "parse",
      });
      try {
        await parseFile(profile, fileId, {
          force,
          signal,
          // Queue owns concurrency — skip inner semaphore.
          skipConcurrency: true,
        });
        emitFileJobEvent({
          type: "file-job:progress",
          fileId,
          jobId: id,
          current: 2,
          total: 2,
          stage: "chunk",
        });
        emitFileJobEvent({
          type: "file-job:completed",
          fileId,
          jobId: id,
        });
      } catch (err) {
        const error =
          err instanceof FilePlatformError
            ? err.fileError
            : makeFileError(
                "FILE_PARSE_FAILED",
                err instanceof Error ? err.message : "Parse failed",
                { retryable: true },
              );
        emitFileJobEvent({
          type: "file-job:failed",
          fileId,
          jobId: id,
          error,
        });
        throw err;
      }
    },
  });

  if (options.wait) {
    await queue.waitFor(jobId);
  }
  return jobId;
}

/** Fire-and-forget schedule used after import. */
export function scheduleParseJob(
  profile: string | undefined,
  fileId: string,
): void {
  const config = readDesktopFilesConfig(profile);
  if (!config.parsing.enabled) return;
  void enqueueParseFileJob({ profile, fileId }).catch(() => {
    // Best-effort — import already succeeded.
  });
}
