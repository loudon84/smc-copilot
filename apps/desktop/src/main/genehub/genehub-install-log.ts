import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { InstallLogEntry } from "../../shared/genehub/genehub-contract";

const MAX_LOG_ENTRIES = 1000;

function logPath(): string {
  return join(app.getPath("userData"), "genehub", "install-logs.jsonl");
}

export function appendInstallLog(entry: Omit<InstallLogEntry, "time"> & { time?: string }): void {
  const path = logPath();
  mkdirSync(dirname(path), { recursive: true });
  const line: InstallLogEntry = {
    time: entry.time ?? new Date().toISOString(),
    jobId: entry.jobId,
    geneSlug: entry.geneSlug,
    step: entry.step,
    status: entry.status,
    message: entry.message,
    errorCode: entry.errorCode,
  };
  appendFileSync(path, `${JSON.stringify(line)}\n`, "utf-8");
  trimLogs(path);
}

function trimLogs(path: string): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  if (lines.length <= MAX_LOG_ENTRIES) return;
  const trimmed = lines.slice(lines.length - MAX_LOG_ENTRIES);
  writeFileSyncSafe(path, `${trimmed.join("\n")}\n`);
}

function writeFileSyncSafe(path: string, content: string): void {
  writeFileSync(path, content, "utf-8");
}

export function readInstallLogs(limit = 100): InstallLogEntry[] {
  const path = logPath();
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  const slice = lines.slice(-limit);
  const entries: InstallLogEntry[] = [];
  for (const line of slice) {
    try {
      entries.push(JSON.parse(line) as InstallLogEntry);
    } catch {
      /* skip malformed */
    }
  }
  return entries.reverse();
}
