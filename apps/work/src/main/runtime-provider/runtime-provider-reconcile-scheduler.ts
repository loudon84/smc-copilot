import { logRuntimeProviderReconcile } from "./runtime-provider-observability";
import type {
  AcceptedRuntimeBootstrap,
  RuntimeProviderPublicState,
} from "./runtime-provider-orchestrator";

export const NORMAL_INTERVAL_MS = 300_000;
export const NORMAL_JITTER_MAX_MS = 60_000;
export const TRANSIENT_BACKOFF_MS = [60_000, 120_000, 300_000] as const;
export const BACKOFF_JITTER_MAX_MS = 30_000;
export const RESUME_FRESHNESS_THRESHOLD_MS = 60_000;

const TRANSIENT = new Set(["FETCHING", "APPLYING", "CLEARING"]);
const BACKGROUND = new Set([
  "scheduled_reconcile",
  "resume_reconcile",
  "local_reentry",
]);

export interface ReconcileTimer {
  cancel: () => void;
}

export interface ReconcileSchedulerDeps {
  now: () => number;
  schedule: (delayMs: number, fn: () => void) => ReconcileTimer;
  randomInt: (min: number, max: number) => number;
  readProfile: () => string;
  eligible: () => boolean;
  readPublicState: (profile: string) => RuntimeProviderPublicState;
  bootstrap: (
    reason: string,
    profile: string,
  ) => Promise<AcceptedRuntimeBootstrap>;
  abandonBackground: () => void;
  log?: (fields: Record<string, unknown>) => void;
}

export interface ReconcileScheduler {
  notifyAccepted: (result: AcceptedRuntimeBootstrap) => void;
  stop: () => void;
  noteQuitting: () => void;
  onResume: () => void;
  requestLocalReentry: () => Promise<void>;
  activeTimerCount: () => number;
  state: () => "STOPPED" | "SCHEDULED" | "RUNNING" | "BACKOFF";
  consecutiveUnavailable: () => number;
  lastAttemptAt: () => number | null;
  diagnostics: () => {
    schedulerState: "STOPPED" | "SCHEDULED" | "RUNNING" | "BACKOFF";
    lastTrigger: string | null;
    lastResult: string | null;
    lastAttemptAt: number | null;
    lastSuccessfulFetchAt: number | null;
    nextDueAt: number | null;
    consecutiveUnavailable: number;
  };
}

export function createRuntimeReconcileScheduler(
  deps: ReconcileSchedulerDeps,
): ReconcileScheduler {
  const log = deps.log ?? logRuntimeProviderReconcile;
  let timer: ReconcileTimer | null = null;
  let timerVersion = 0;
  let phase: "STOPPED" | "SCHEDULED" | "RUNNING" | "BACKOFF" = "STOPPED";
  let unavailable = 0;
  let lastAttempt: number | null = null;
  let lastSuccess: number | null = null;
  let nextDueAt: number | null = null;
  let lastTrigger: string | null = null;
  let lastResult: string | null = null;
  let quitting = false;
  let running = false;

  function clearTimer(): void {
    timerVersion += 1;
    timer?.cancel();
    timer = null;
    nextDueAt = null;
  }

  function noteSkip(reason: string): void {
    lastTrigger = reason;
    lastResult = "SKIPPED_BUSY";
  }

  function jitter(max: number): number {
    try {
      return deps.randomInt(0, max);
    } catch {
      return 0;
    }
  }

  function arm(delayMs: number, next: "SCHEDULED" | "BACKOFF"): void {
    if (quitting || !deps.eligible()) {
      stop();
      return;
    }
    clearTimer();
    const version = timerVersion;
    phase = next;
    nextDueAt = deps.now() + delayMs;
    timer = deps.schedule(delayMs, () => {
      if (version !== timerVersion) return;
      timer = null;
      nextDueAt = null;
      void trigger("scheduled_reconcile");
    });
  }

  function applyResult(result: AcceptedRuntimeBootstrap, triggerName: string): void {
    if (!result.accepted || quitting || !deps.eligible()) {
      if (quitting || !deps.eligible()) stop();
      return;
    }
    lastAttempt = deps.now();
    const runtimeState = result.state.state;
    const backendState =
      result.state.state === "NOT_READY" ? result.state.backendState : null;
    const errorCode =
      result.state.state === "ERROR"
        ? result.state.errorCode
        : result.state.state === "STALE_ACTIVE"
          ? result.state.errorCode || null
          : null;
    const unavailableResult =
      errorCode === "RUNTIME_BOOTSTRAP_UNAVAILABLE" || result.outcome === "stale";
    let delay = NORMAL_INTERVAL_MS + jitter(NORMAL_JITTER_MAX_MS);
    let next: "SCHEDULED" | "BACKOFF" = "SCHEDULED";
    let logged: string = "ERROR";
    if (unavailableResult) {
      unavailable += 1;
      const step = Math.min(unavailable, TRANSIENT_BACKOFF_MS.length) - 1;
      delay = TRANSIENT_BACKOFF_MS[step] + jitter(BACKOFF_JITTER_MAX_MS);
      next = "BACKOFF";
      logged = result.state.state === "STALE_ACTIVE" ? "STALE_ACTIVE" : "ERROR";
    } else if (result.outcome === "noop" || result.state.state === "ACTIVE") {
      unavailable = 0;
      logged = result.outcome === "noop" ? "NOOP_MATCH" : "RECONCILED";
    } else if (result.outcome === "not_ready" || result.state.state === "NOT_READY") {
      unavailable = 0;
      logged = "NOT_READY";
    } else {
      logged = "ERROR";
    }
    log({
      trigger: triggerName,
      scheduler_state: next,
      result: logged,
      runtime_state: runtimeState,
      backend_state: backendState,
      error_code: errorCode,
      next_due_delay_ms: delay,
      consecutive_unavailable: unavailable,
    });
    if (
      logged === "NOOP_MATCH" ||
      logged === "RECONCILED" ||
      logged === "NOT_READY"
    ) {
      lastSuccess = lastAttempt;
    }
    lastTrigger = triggerName;
    lastResult = logged;
    arm(delay, next);
  }

  async function trigger(reason: string): Promise<void> {
    if (quitting || !deps.eligible()) {
      stop();
      log({
        trigger: reason,
        scheduler_state: "STOPPED",
        result: "STOPPED_INELIGIBLE",
        consecutive_unavailable: unavailable,
      });
      return;
    }
    const profile = deps.readProfile();
    const current = deps.readPublicState(profile);
    if (TRANSIENT.has(current.state)) {
      noteSkip(reason);
      log({
        trigger: reason,
        scheduler_state: phase,
        result: "SKIPPED_BUSY",
        runtime_state: current.state,
        consecutive_unavailable: unavailable,
      });
      return;
    }
    if (running) return;
    running = true;
    phase = "RUNNING";
    log({
      trigger: reason,
      scheduler_state: "RUNNING",
      result: "START",
      runtime_state: current.state,
      consecutive_unavailable: unavailable,
    });
    try {
      const result = await deps.bootstrap(reason, profile);
      applyResult(result, reason);
    } finally {
      running = false;
    }
  }

  return {
    notifyAccepted(result) {
      try {
        applyResult(result, result.reason || "foreground");
      } catch {
        /* scheduler failure must not fail portal login */
      }
    },
    stop() {
      clearTimer();
      phase = "STOPPED";
      log({
        trigger: "scheduled_reconcile",
        scheduler_state: "STOPPED",
        result: "SCHEDULER_STOP",
        consecutive_unavailable: unavailable,
      });
    },
    noteQuitting() {
      quitting = true;
      deps.abandonBackground();
      clearTimer();
      phase = "STOPPED";
    },
    onResume() {
      if (quitting || !deps.eligible()) return;
      const profile = deps.readProfile();
      const current = deps.readPublicState(profile);
      if (TRANSIENT.has(current.state) || running) {
        if (TRANSIENT.has(current.state)) {
          noteSkip("resume_reconcile");
          log({
            trigger: "resume_reconcile",
            scheduler_state: phase,
            result: "SKIPPED_BUSY",
            runtime_state: current.state,
            consecutive_unavailable: unavailable,
          });
        }
        return;
      }
      const fresh =
        lastAttempt !== null &&
        deps.now() - lastAttempt < RESUME_FRESHNESS_THRESHOLD_MS;
      if (fresh && timer) return;
      clearTimer();
      void trigger("resume_reconcile");
    },
    requestLocalReentry() {
      return trigger("local_reentry");
    },
    activeTimerCount: () => (timer ? 1 : 0),
    state: () => phase,
    consecutiveUnavailable: () => unavailable,
    lastAttemptAt: () => lastAttempt,
    diagnostics: () => ({
      schedulerState: phase,
      lastTrigger,
      lastResult,
      lastAttemptAt: lastAttempt,
      lastSuccessfulFetchAt: lastSuccess,
      nextDueAt,
      consecutiveUnavailable: unavailable,
    }),
  };
}

export function isBackgroundReconcileReason(reason: string): boolean {
  return BACKGROUND.has(reason);
}
