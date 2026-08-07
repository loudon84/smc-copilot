import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { RecentHermesTask } from "../../shared/hermes-client/hermes-client-contract";

const MAX_RECENT_TASKS = 50;

function storePath(): string {
  return join(app.getPath("userData"), "hermes-mcp", "recent-tasks.json");
}

function readAll(): RecentHermesTask[] {
  const path = storePath();
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as RecentHermesTask[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeAll(tasks: RecentHermesTask[]): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(tasks.slice(0, MAX_RECENT_TASKS), null, 2), "utf-8");
}

export function listRecentHermesTasks(): RecentHermesTask[] {
  return readAll();
}

export function clearRecentHermesTasks(): void {
  writeAll([]);
}

export function upsertRecentHermesTask(
  patch: Omit<RecentHermesTask, "createdAt"> & { createdAt?: string },
): RecentHermesTask {
  const createdAt = patch.createdAt ?? new Date().toISOString();
  const entry: RecentHermesTask = {
    taskId: patch.taskId,
    toolName: patch.toolName,
    agentAlias: patch.agentAlias,
    profileName: patch.profileName,
    status: patch.status,
    eventUrl: patch.eventUrl,
    eventTokenUrl: patch.eventTokenUrl,
    resultUrl: patch.resultUrl,
    createdAt,
  };

  const existing = readAll().filter((row) => row.taskId !== patch.taskId);
  writeAll([entry, ...existing]);
  return entry;
}

export function getRecentHermesTask(taskId: string): RecentHermesTask | null {
  return readAll().find((row) => row.taskId === taskId) ?? null;
}
