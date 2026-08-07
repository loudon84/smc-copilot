import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  WorkTask,
  WorkTaskSessionBinding,
  WorkTasksJson,
} from "../../shared/work/work-task-contract";
import { profileHome } from "../utils";

const FILE_VERSION = 1 as const;

function storePath(profile = "default"): string {
  const dir = join(profileHome(profile), "desktop");
  mkdirSync(dir, { recursive: true });
  return join(dir, "work-tasks.json");
}

function emptyStore(): WorkTasksJson {
  return { version: FILE_VERSION, tasks: [], bindings: [] };
}

export function readWorkTasksStore(profile = "default"): WorkTasksJson {
  try {
    const raw = JSON.parse(readFileSync(storePath(profile), "utf-8")) as WorkTasksJson;
    if (raw.version !== FILE_VERSION || !Array.isArray(raw.tasks)) {
      return emptyStore();
    }
    return {
      version: FILE_VERSION,
      tasks: raw.tasks,
      bindings: raw.bindings ?? [],
    };
  } catch {
    return emptyStore();
  }
}

function writeWorkTasksStore(data: WorkTasksJson, profile = "default"): void {
  writeFileSync(storePath(profile), JSON.stringify(data, null, 2), "utf-8");
}

export function listWorkTasks(profile = "default"): WorkTask[] {
  return readWorkTasksStore(profile).tasks.sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getWorkTask(taskId: string, profile = "default"): WorkTask | null {
  return readWorkTasksStore(profile).tasks.find((t) => t.id === taskId) ?? null;
}

export function getWorkTaskBySessionId(
  sessionId: string,
  profile = "default",
): WorkTask | null {
  return readWorkTasksStore(profile).tasks.find((t) => t.sessionId === sessionId) ?? null;
}

export function upsertWorkTask(task: WorkTask, profile = "default"): WorkTask {
  const store = readWorkTasksStore(profile);
  const idx = store.tasks.findIndex((t) => t.id === task.id);
  const next = { ...task, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    store.tasks[idx] = next;
  } else {
    store.tasks.unshift(next);
  }
  writeWorkTasksStore(store, profile);
  return next;
}

export function bindWorkTaskSession(
  input: Omit<WorkTaskSessionBinding, "createdAt" | "updatedAt"> & { createdAt?: string },
  profile = "default",
): WorkTaskSessionBinding {
  const store = readWorkTasksStore(profile);
  const now = new Date().toISOString();
  const existing = store.bindings.find((b) => b.taskId === input.taskId);
  const binding: WorkTaskSessionBinding = {
    taskId: input.taskId,
    sessionId: input.sessionId,
    profile: input.profile,
    firstMessageId: input.firstMessageId ?? existing?.firstMessageId,
    lastMessageId: input.lastMessageId ?? existing?.lastMessageId,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
  };
  const idx = store.bindings.findIndex((b) => b.taskId === input.taskId);
  if (idx >= 0) {
    store.bindings[idx] = binding;
  } else {
    store.bindings.unshift(binding);
  }
  writeWorkTasksStore(store, profile);
  return binding;
}

export function createWorkTaskId(): string {
  return randomUUID();
}
