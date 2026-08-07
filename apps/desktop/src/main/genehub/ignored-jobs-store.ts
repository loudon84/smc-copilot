import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { profileHome } from "../utils";
import { safeWriteFile } from "../utils";

interface IgnoredJobsFile {
  jobIds: string[];
  updatedAt: string;
}

function storePath(): string {
  return join(profileHome(), "desktop", "genehub", "ignored-jobs.json");
}

function readStore(): IgnoredJobsFile {
  const path = storePath();
  if (!existsSync(path)) {
    return { jobIds: [], updatedAt: "" };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as IgnoredJobsFile;
    return { jobIds: parsed.jobIds ?? [], updatedAt: parsed.updatedAt ?? "" };
  } catch {
    return { jobIds: [], updatedAt: "" };
  }
}

function writeStore(jobIds: string[]): void {
  safeWriteFile(
    storePath(),
    JSON.stringify({ jobIds, updatedAt: new Date().toISOString() }, null, 2),
  );
}

export function isJobIgnored(jobId: string): boolean {
  return readStore().jobIds.includes(jobId);
}

export function ignoreInstallJob(jobId: string): void {
  const store = readStore();
  if (!store.jobIds.includes(jobId)) {
    writeStore([...store.jobIds, jobId]);
  }
}

export function listIgnoredJobIds(): string[] {
  return readStore().jobIds;
}
