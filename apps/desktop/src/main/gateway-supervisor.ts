import {
  getRuntimeInstance,
  updateRuntimeStatus,
  listRuntimeInstances,
} from "./profile-runtime-db";

const SUPERVISION_INTERVAL_MS = 15_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const AUTO_RESTART_DELAY_MS = 15_000;
const DEFAULT_MAX_RESTART_COUNT = 3;

export interface SupervisionOptions {
  autoRestart?: boolean;
  maxRestartCount?: number;
}

const supervisionTimers = new Map<string, NodeJS.Timeout>();
const consecutiveFailures = new Map<string, number>();
const supervisionOptions = new Map<string, SupervisionOptions>();
const restartCounts = new Map<string, number>();
const autoRestartTimers = new Map<string, NodeJS.Timeout>();

let onAutoRestartCallback: ((profileId: string) => Promise<void>) | null = null;

export function setAutoRestartHandler(handler: (profileId: string) => Promise<void>): void {
  onAutoRestartCallback = handler;
}

async function checkProfileHealth(profileId: string): Promise<void> {
  const instance = getRuntimeInstance(profileId);
  if (!instance || instance.status !== "running") return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`http://${instance.host}:${instance.port}/health`, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      consecutiveFailures.set(profileId, 0);
      updateRuntimeStatus(profileId, "running", {
        lastHealthCheckAt: new Date().toISOString(),
        healthFailCount: 0,
      });
    } else {
      incrementFailure(profileId);
    }
  } catch {
    incrementFailure(profileId);
  }
}

function incrementFailure(profileId: string): void {
  const count = (consecutiveFailures.get(profileId) ?? 0) + 1;
  consecutiveFailures.set(profileId, count);

  const instance = getRuntimeInstance(profileId);
  const currentFailCount = (instance?.health_fail_count ?? 0) + 1;

  updateRuntimeStatus(profileId, "running", {
    healthFailCount: currentFailCount,
    lastHealthCheckAt: new Date().toISOString(),
  });

  if (count >= MAX_CONSECUTIVE_FAILURES) {
    updateRuntimeStatus(profileId, "failed", {
      lastError: `Health check failed ${count} consecutive times`,
      lastHealthCheckAt: new Date().toISOString(),
      healthFailCount: currentFailCount,
    });

    cancelPendingAutoRestart(profileId);

    const opts = supervisionOptions.get(profileId);
    if (opts?.autoRestart) {
      const currentRestarts = restartCounts.get(profileId) ?? 0;
      const maxRestarts = opts.maxRestartCount ?? DEFAULT_MAX_RESTART_COUNT;

      if (currentRestarts < maxRestarts) {
        scheduleAutoRestart(profileId);
      }
    }
  }
}

function scheduleAutoRestart(profileId: string): void {
  cancelPendingAutoRestart(profileId);

  const timer = setTimeout(async () => {
    autoRestartTimers.delete(profileId);
    const currentRestarts = (restartCounts.get(profileId) ?? 0) + 1;
    restartCounts.set(profileId, currentRestarts);

    updateRuntimeStatus(profileId, "starting", {
      restartCount: currentRestarts,
      lastError: `Auto-restart attempt ${currentRestarts}`,
    });

    if (onAutoRestartCallback) {
      try {
        await onAutoRestartCallback(profileId);
      } catch {
        updateRuntimeStatus(profileId, "failed", {
          lastError: `Auto-restart ${currentRestarts} failed`,
        });
      }
    }
  }, AUTO_RESTART_DELAY_MS);

  autoRestartTimers.set(profileId, timer);
}

function cancelPendingAutoRestart(profileId: string): void {
  const timer = autoRestartTimers.get(profileId);
  if (timer) {
    clearTimeout(timer);
    autoRestartTimers.delete(profileId);
  }
}

export function startSupervision(profileId: string, options?: SupervisionOptions): void {
  stopSupervision(profileId);
  consecutiveFailures.set(profileId, 0);
  supervisionOptions.set(profileId, options ?? {});

  if (!restartCounts.has(profileId)) {
    const instance = getRuntimeInstance(profileId);
    restartCounts.set(profileId, instance?.restart_count ?? 0);
  }

  const timer = setInterval(() => {
    checkProfileHealth(profileId).catch(() => {
      incrementFailure(profileId);
    });
  }, SUPERVISION_INTERVAL_MS);

  supervisionTimers.set(profileId, timer);
}

export function stopSupervision(profileId: string): void {
  const timer = supervisionTimers.get(profileId);
  if (timer) {
    clearInterval(timer);
    supervisionTimers.delete(profileId);
  }
  consecutiveFailures.delete(profileId);
  supervisionOptions.delete(profileId);
  cancelPendingAutoRestart(profileId);
}

export function resetRestartCount(profileId: string): void {
  restartCounts.set(profileId, 0);
  updateRuntimeStatus(profileId, undefined, { restartCount: 0 });
}

export function getSupervisionStatus(profileId: string): {
  isSupervised: boolean;
  consecutiveFailures: number;
  restartCount: number;
  autoRestartPending: boolean;
} {
  return {
    isSupervised: supervisionTimers.has(profileId),
    consecutiveFailures: consecutiveFailures.get(profileId) ?? 0,
    restartCount: restartCounts.get(profileId) ?? 0,
    autoRestartPending: autoRestartTimers.has(profileId),
  };
}

export function startAllSupervision(): void {
  const all = listRuntimeInstances() as Array<{ profile_id: string; status: string; auto_restart: boolean }>;
  for (const inst of all) {
    if (inst.status === "running") {
      startSupervision(inst.profile_id, { autoRestart: inst.auto_restart });
    }
  }
}

export function stopAllSupervision(): void {
  for (const profileId of supervisionTimers.keys()) {
    stopSupervision(profileId);
  }
}
