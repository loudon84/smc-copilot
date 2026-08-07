import type { WorkRunStatus } from "../../model/run";

export function canCancelRun(status: WorkRunStatus): boolean {
  return status === "running" || status === "waiting_approval" || status === "queued";
}

export function canRetryRun(status: WorkRunStatus): boolean {
  return status === "failed" || status === "cancelled" || status === "completed";
}
