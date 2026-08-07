import { openSync, closeSync, unlinkSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { getHermesBasePath } from "./deployment-config";

const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000;

export interface InstallLock {
  acquired: boolean;
  release: () => void;
}

export function acquireInstallLock(timeoutMs = 10000): InstallLock {
  const lockPath = join(getHermesBasePath(), "install.lock");
  const start = Date.now();

  while (true) {
    try {
      if (existsSync(lockPath)) {
        const stat = statSync(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_THRESHOLD_MS) {
          try { unlinkSync(lockPath); } catch { /* ignore */ }
        } else {
          if (Date.now() - start > timeoutMs) {
            return { acquired: false, release: () => {} };
          }
          continue;
        }
      }

      const fd = openSync(lockPath, "wx");
      closeSync(fd);
      break;
    } catch {
      if (Date.now() - start > timeoutMs) {
        return { acquired: false, release: () => {} };
      }
    }

    const elapsed = Date.now() - start;
    if (elapsed > timeoutMs) {
      return { acquired: false, release: () => {} };
    }

    const waitMs = Math.min(500, timeoutMs - elapsed);
    const end = Date.now() + waitMs;
    while (Date.now() < end) { /* busy wait */ }
  }

  return {
    acquired: true,
    release: () => {
      try { unlinkSync(lockPath); } catch { /* ignore */ }
    },
  };
}
