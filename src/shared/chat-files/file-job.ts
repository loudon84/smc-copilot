/**
 * File Platform parse/index job events (Main → Renderer).
 * Do not import Electron or Node APIs from this module.
 */

import type { FileError } from "./file-errors";

export type FileJobEvent =
  | {
      type: "file-job:started";
      fileId: string;
      jobId: string;
    }
  | {
      type: "file-job:progress";
      fileId: string;
      jobId: string;
      current: number;
      total: number;
      stage: string;
    }
  | {
      type: "file-job:completed";
      fileId: string;
      jobId: string;
    }
  | {
      type: "file-job:failed";
      fileId: string;
      jobId: string;
      error: FileError;
    };

export type FileJobEventListener = (event: FileJobEvent) => void;

/** Push channel from Main to Renderer (not an invoke handler). */
export const FILE_JOB_EVENT_CHANNEL = "file-job:event" as const;
