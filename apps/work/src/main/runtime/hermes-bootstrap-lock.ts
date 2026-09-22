/**
 * Bootstrap mutual exclusion via userData lockfile.
 *
 * Choice (PRD C-007): prefer `userData/hermes-bootstrap.lock` with pid +
 * stale detection over Win32 CreateMutex — Electron main has no CreateMutex
 * without adding a native FFI dependency (koffi). Named mutex semantics are
 * approximated: second waiter polls until lock release or wait timeout.
 */
import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";

export const BOOTSTRAP_LOCK_FILENAME = "hermes-bootstrap.lock";
/** Default stale age: slightly above the 1800s installer timeout. */
export const BOOTSTRAP_LOCK_STALE_MS = 1_900_000;
export const BOOTSTRAP_LOCK_WAIT_MS = 1_800_000;
export const BOOTSTRAP_LOCK_POLL_MS = 250;

export interface BootstrapLockPayload {
  pid: number;
  operationId: string;
  acquiredAt: string;
}

export interface BootstrapLockOptions {
  userDataPath: string;
  operationId: string;
  pid?: number;
  staleMs?: number;
  waitMs?: number;
  pollMs?: number;
  now?: () => number;
  isPidAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  /** Optional progress while blocked on a peer lock (throttled by caller). */
  onWait?: (info: {
    holderPid: number | null;
    holderOperationId: string | null;
    waitedMs: number;
  }) => void;
}

function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function bootstrapLockPath(userDataPath: string): string {
  return join(userDataPath, BOOTSTRAP_LOCK_FILENAME);
}

function readLock(path: string): BootstrapLockPayload | null {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as BootstrapLockPayload;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.operationId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isStale(
  payload: BootstrapLockPayload,
  staleMs: number,
  now: number,
  isPidAlive: (pid: number) => boolean,
): boolean {
  if (!isPidAlive(payload.pid)) return true;
  const acquired = Date.parse(payload.acquiredAt);
  if (!Number.isFinite(acquired)) return true;
  return now - acquired > staleMs;
}

function tryAcquire(path: string, payload: BootstrapLockPayload): boolean {
  mkdirSync(dirname(path), { recursive: true });
  const body = JSON.stringify(payload);
  // Prefer O_EXCL create so Windows cannot "rename onto missing" race into a
  // permanent fail loop when a peer briefly touches the path.
  try {
    const fd = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    );
    try {
      writeFileSync(fd, body, "utf-8");
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    if (code === "EEXIST") return false;
  }

  // Fallback for environments that reject O_EXCL on the volume.
  const tmp = `${path}.${payload.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, body, "utf-8");
    if (existsSync(path)) {
      unlinkSync(tmp);
      return false;
    }
    renameSync(tmp, path);
    return true;
  } catch {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return false;
  }
}

export function releaseBootstrapLock(userDataPath: string, pid?: number): void {
  const path = bootstrapLockPath(userDataPath);
  const ownerPid = pid ?? process.pid;
  const existing = readLock(path);
  if (!existing) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      /* ignore */
    }
    return;
  }
  if (existing.pid !== ownerPid) return;
  try {
    unlinkSync(path);
  } catch {
    /* ignore */
  }
}

/**
 * Acquire lock (waiting for peer), run `fn`, always release if we own it.
 * Throws if waitMs elapses without acquiring.
 */
export async function withBootstrapLock<T>(
  opts: BootstrapLockOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const path = bootstrapLockPath(opts.userDataPath);
  const staleMs = opts.staleMs ?? BOOTSTRAP_LOCK_STALE_MS;
  const waitMs = opts.waitMs ?? BOOTSTRAP_LOCK_WAIT_MS;
  const pollMs = opts.pollMs ?? BOOTSTRAP_LOCK_POLL_MS;
  const nowFn = opts.now ?? Date.now;
  const isPidAlive = opts.isPidAlive ?? defaultIsPidAlive;
  const sleep = opts.sleep ?? defaultSleep;
  const pid = opts.pid ?? process.pid;
  const payload: BootstrapLockPayload = {
    pid,
    operationId: opts.operationId,
    acquiredAt: new Date(nowFn()).toISOString(),
  };

  const deadline = nowFn() + waitMs;
  let acquired = false;
  const startedAt = nowFn();
  let lastWaitLogAt = 0;

  while (nowFn() < deadline) {
    const existing = existsSync(path) ? readLock(path) : null;
    if (existing && isStale(existing, staleMs, nowFn(), isPidAlive)) {
      try {
        unlinkSync(path);
      } catch {
        /* race with peer */
      }
    }
    if (tryAcquire(path, payload)) {
      acquired = true;
      break;
    }
    const waitedMs = nowFn() - startedAt;
    if (opts.onWait && waitedMs - lastWaitLogAt >= 5_000) {
      lastWaitLogAt = waitedMs;
      const holder = existsSync(path) ? readLock(path) : null;
      opts.onWait({
        holderPid: holder?.pid ?? null,
        holderOperationId: holder?.operationId ?? null,
        waitedMs,
      });
    }
    await sleep(pollMs);
  }

  if (!acquired) {
    const holder = existsSync(path) ? readLock(path) : null;
    throw new Error(
      `HERMES_BOOTSTRAP_LOCK_TIMEOUT: another Work bootstrap is still running` +
        (holder
          ? ` (holderPid=${holder.pid} holderOp=${holder.operationId})`
          : " (no lock file — acquire failed repeatedly)"),
    );
  }

  try {
    return await fn();
  } finally {
    releaseBootstrapLock(opts.userDataPath, pid);
  }
}
