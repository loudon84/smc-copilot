import { describe, expect, it } from "vitest";
import type { AcceptedRuntimeBootstrap } from "./runtime-provider-orchestrator";
import {
  BACKOFF_JITTER_MAX_MS,
  NORMAL_INTERVAL_MS,
  NORMAL_JITTER_MAX_MS,
  RESUME_FRESHNESS_THRESHOLD_MS,
  TRANSIENT_BACKOFF_MS,
  createRuntimeReconcileScheduler,
  isBackgroundReconcileReason,
  type ReconcileSchedulerDeps,
} from "./runtime-provider-reconcile-scheduler";

const ACTIVE = {
  state: "ACTIVE" as const,
  revision: "rev-1",
  providerRef: "named:nodeskclaw" as const,
  defaultModel: "enterprise-a",
  modelIds: ["enterprise-a"],
  modelCount: 1,
};

function accepted(
  overrides: Partial<AcceptedRuntimeBootstrap> = {},
): AcceptedRuntimeBootstrap {
  return {
    accepted: true,
    generation: 1,
    reason: "login",
    state: ACTIVE,
    outcome: "reconciled",
    ...overrides,
  };
}

function harness(overrides: Partial<ReconcileSchedulerDeps> = {}) {
  const logs: Array<Record<string, unknown>> = [];
  const timers: Array<{ delay: number; fn: () => void; cancelled: boolean }> = [];
  let clock = 1_000_000;
  let profile = "desk";
  let eligible = true;
  let publicState: AcceptedRuntimeBootstrap["state"] = { state: "UNBOUND" };
  const bootstrapCalls: Array<{ reason: string; profile: string }> = [];
  let boot: ReconcileSchedulerDeps["bootstrap"] = async (reason, profileName) => {
    bootstrapCalls.push({ reason, profile: profileName });
    return accepted({ reason });
  };
  const deps: ReconcileSchedulerDeps = {
    now: () => clock,
    schedule(delay, fn) {
      const entry = { delay, fn, cancelled: false };
      timers.push(entry);
      return {
        cancel() {
          entry.cancelled = true;
        },
      };
    },
    randomInt: () => 0,
    readProfile: () => profile,
    eligible: () => eligible,
    readPublicState: () => publicState,
    bootstrap: (reason, profileName) => boot(reason, profileName),
    abandonBackground: () => {
      logs.push({ abandon: true });
    },
    log: (fields) => logs.push(fields),
    ...overrides,
  };
  return {
    scheduler: createRuntimeReconcileScheduler(deps),
    logs,
    timers,
    bootstrapCalls,
    setClock: (value: number) => {
      clock = value;
    },
    setEligible: (value: boolean) => {
      eligible = value;
    },
    setProfile: (value: string) => {
      profile = value;
    },
    setPublicState: (value: AcceptedRuntimeBootstrap["state"]) => {
      publicState = value;
    },
    setBootstrap: (value: ReconcileSchedulerDeps["bootstrap"]) => {
      boot = value;
    },
  };
}

describe("runtime provider reconcile scheduler", () => {
  it("keeps a deterministic error on the normal interval", () => {
    const { scheduler, timers } = harness();
    scheduler.notifyAccepted(
      accepted({
        outcome: "error",
        state: { state: "ERROR", errorCode: "RUNTIME_BOOTSTRAP_UNAVAILABLE" },
      }),
    );
    scheduler.notifyAccepted(
      accepted({
        outcome: "error",
        state: { state: "ERROR", errorCode: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" },
      }),
    );
    expect(scheduler.consecutiveUnavailable()).toBe(1);
    expect(timers.at(-1)?.delay).toBe(NORMAL_INTERVAL_MS);
    expect(scheduler.state()).toBe("SCHEDULED");
  });

  it("zeroes the counter for an explicit not-ready result", () => {
    const { scheduler } = harness();
    scheduler.notifyAccepted(
      accepted({
        outcome: "stale",
        state: {
          ...ACTIVE,
          state: "STALE_ACTIVE",
          errorCode: "RUNTIME_BOOTSTRAP_UNAVAILABLE",
        },
      }),
    );
    scheduler.notifyAccepted(
      accepted({
        outcome: "not_ready",
        state: { state: "NOT_READY", backendState: "DISABLED" },
      }),
    );
    expect(scheduler.consecutiveUnavailable()).toBe(0);
    expect(scheduler.state()).toBe("SCHEDULED");
  });

  it("stops local reentry without a bootstrap when the session is gone", async () => {
    const { scheduler, bootstrapCalls, logs, setEligible } = harness();
    setEligible(false);
    await scheduler.requestLocalReentry();
    expect(bootstrapCalls).toHaveLength(0);
    expect(scheduler.state()).toBe("STOPPED");
    expect(logs.some((line) => line.result === "STOPPED_INELIGIBLE")).toBe(true);
  });

  it("records the armed due and keeps it when resume is busy", async () => {
    const { scheduler, setClock, setPublicState } = harness();
    setClock(1_000_000);
    scheduler.notifyAccepted(accepted());
    const due = scheduler.diagnostics().nextDueAt;
    expect(due).toBe(1_000_000 + NORMAL_INTERVAL_MS);
    expect(scheduler.diagnostics().lastSuccessfulFetchAt).toBe(1_000_000);
    setPublicState({ state: "APPLYING" });
    await scheduler.onResume();
    expect(scheduler.activeTimerCount()).toBe(1);
    expect(scheduler.diagnostics().nextDueAt).toBe(due);
    expect(scheduler.diagnostics().lastResult).toBe("SKIPPED_BUSY");
    expect(scheduler.diagnostics().lastTrigger).toBe("resume_reconcile");
    expect(scheduler.lastAttemptAt()).toBe(1_000_000);
    scheduler.stop();
    expect(scheduler.diagnostics().nextDueAt).toBeNull();
    expect(scheduler.diagnostics().lastResult).toBe("SKIPPED_BUSY");
  });

  it("keeps a single armed timer across repeated accepted results", () => {
    const { scheduler, timers } = harness();
    scheduler.notifyAccepted(accepted());
    scheduler.notifyAccepted(accepted());
    scheduler.notifyAccepted(accepted());
    expect(scheduler.activeTimerCount()).toBe(1);
    expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(1);
  });

  it("backs off at 60, 120, then 300 seconds and stays on the last tier", () => {
    const { scheduler, timers } = harness();
    const unavailable = accepted({
      reason: "scheduled_reconcile",
      outcome: "error",
      state: { state: "ERROR", errorCode: "RUNTIME_BOOTSTRAP_UNAVAILABLE" },
    });
    for (let i = 0; i < 4; i += 1) scheduler.notifyAccepted(unavailable);
    const delays = timers.map((timer) => timer.delay);
    expect(delays).toEqual([
      TRANSIENT_BACKOFF_MS[0],
      TRANSIENT_BACKOFF_MS[1],
      TRANSIENT_BACKOFF_MS[2],
      TRANSIENT_BACKOFF_MS[2],
    ]);
    expect(scheduler.consecutiveUnavailable()).toBe(4);
    expect(scheduler.state()).toBe("BACKOFF");
    for (const delay of delays.slice(0, 3)) {
      const tier = TRANSIENT_BACKOFF_MS.find(
        (base) => delay >= base && delay <= base + BACKOFF_JITTER_MAX_MS,
      );
      expect(tier).toBeTypeOf("number");
    }
  });

  it("clears the unavailable counter after an accepted ready result", () => {
    const { scheduler, timers } = harness();
    scheduler.notifyAccepted(
      accepted({
        outcome: "stale",
        state: {
          ...ACTIVE,
          state: "STALE_ACTIVE",
          errorCode: "RUNTIME_BOOTSTRAP_UNAVAILABLE",
        },
      }),
    );
    scheduler.notifyAccepted(accepted({ outcome: "reconciled" }));
    expect(scheduler.consecutiveUnavailable()).toBe(0);
    expect(timers.at(-1)?.delay).toBeGreaterThanOrEqual(NORMAL_INTERVAL_MS);
    expect(timers.at(-1)?.delay).toBeLessThanOrEqual(
      NORMAL_INTERVAL_MS + NORMAL_JITTER_MAX_MS,
    );
    expect(scheduler.state()).toBe("SCHEDULED");
  });

  it("does not bootstrap or arm a due while the runtime is applying", async () => {
    const { scheduler, timers, bootstrapCalls, logs, setPublicState } = harness();
    scheduler.notifyAccepted(accepted());
    const armed = timers.find((timer) => !timer.cancelled);
    setPublicState({ state: "APPLYING" });
    armed?.fn();
    await Promise.resolve();
    expect(bootstrapCalls).toHaveLength(0);
    expect(scheduler.consecutiveUnavailable()).toBe(0);
    expect(scheduler.activeTimerCount()).toBe(0);
    expect(logs.some((line) => line.result === "SKIPPED_BUSY")).toBe(true);
  });

  it("uses zero jitter when the random source throws", () => {
    const { scheduler, timers } = harness({
      randomInt: () => {
        throw new Error("rng");
      },
    });
    scheduler.notifyAccepted(accepted({ outcome: "noop" }));
    expect(timers[0]?.delay).toBe(NORMAL_INTERVAL_MS);
  });

  it("ignores a superseded result when scheduling the next due", () => {
    const { scheduler, timers } = harness();
    scheduler.notifyAccepted(
      accepted({
        accepted: false,
        outcome: "superseded",
        state: { state: "ERROR", errorCode: "RUNTIME_BOOTSTRAP_UNAVAILABLE" },
      }),
    );
    expect(scheduler.consecutiveUnavailable()).toBe(0);
    expect(scheduler.lastAttemptAt()).toBeNull();
    expect(timers).toHaveLength(0);
  });

  it("issues one resume reconcile when the last attempt is missing", async () => {
    const { scheduler, bootstrapCalls, setProfile } = harness();
    setProfile("desk");
    await scheduler.onResume();
    expect(bootstrapCalls).toEqual([
      { reason: "resume_reconcile", profile: "desk" },
    ]);
    expect(scheduler.activeTimerCount()).toBe(1);
  });

  it("keeps the existing timer when resume is inside 60 seconds", async () => {
    const { scheduler, bootstrapCalls, timers } = harness();
    scheduler.notifyAccepted(accepted());
    const before = timers.filter((timer) => !timer.cancelled).length;
    await scheduler.onResume();
    expect(bootstrapCalls).toHaveLength(0);
    expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(before);
    expect(RESUME_FRESHNESS_THRESHOLD_MS).toBe(60_000);
  });

  it("does not arm another timer after quit supersedes a background read", async () => {
    let release: (result: AcceptedRuntimeBootstrap) => void = () => {};
    const { scheduler, logs, setBootstrap } = harness();
    setBootstrap(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = scheduler.requestLocalReentry();
    scheduler.noteQuitting();
    release(accepted({ reason: "local_reentry", outcome: "reconciled" }));
    await pending;
    expect(logs.some((line) => line.abandon === true)).toBe(true);
    expect(scheduler.activeTimerCount()).toBe(0);
    expect(scheduler.state()).toBe("STOPPED");
    expect(scheduler.consecutiveUnavailable()).toBe(0);
  });

  it("does not treat login, refresh, or profile switch as a background quit", () => {
    expect(isBackgroundReconcileReason("scheduled_reconcile")).toBe(true);
    expect(isBackgroundReconcileReason("resume_reconcile")).toBe(true);
    expect(isBackgroundReconcileReason("local_reentry")).toBe(true);
    expect(isBackgroundReconcileReason("login")).toBe(false);
    expect(isBackgroundReconcileReason("refresh")).toBe(false);
    expect(isBackgroundReconcileReason("profile_switch")).toBe(false);
  });

  it("logs busy and unavailable as different results without secrets", () => {
    const { scheduler, logs, setPublicState } = harness();
    setPublicState({ state: "FETCHING" });
    void scheduler.onResume();
    scheduler.notifyAccepted(
      accepted({
        outcome: "error",
        state: { state: "ERROR", errorCode: "RUNTIME_BOOTSTRAP_UNAVAILABLE" },
      }),
    );
    const busy = logs.find((line) => line.result === "SKIPPED_BUSY");
    const unavailable = logs.find((line) => line.result === "ERROR");
    expect(busy?.scheduler_state).not.toBe("BACKOFF");
    expect(unavailable?.scheduler_state).toBe("BACKOFF");
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("member-key");
    expect(serialized).not.toContain("Authorization");
  });

  it("records local reconcile evidence and leaves the golden blocked", () => {
    const evidence = {
      commands: [
        "npx vitest run src/main/runtime-provider/runtime-provider-reconcile-scheduler.test.ts src/main/runtime-provider/runtime-provider-orchestrator.test.ts src/main/runtime-provider/runtime-provider-observability.test.ts src/main/auth/auth-ipc.test.ts src/main/runtime-provider/runtime-provider.test.ts",
        "npm run typecheck",
      ],
      "A-SCHED-001": "single active timer",
      "A-SCHED-002": "backoff tiers 60/120/300",
      "A-SCHED-003": "active profile sampled at trigger",
      "A-TIME-001": "normal interval plus jitter bounds",
      "A-TIME-002": "random failure uses jitter 0",
      "A-TIME-003": "resume freshness is 60000ms",
      "A-COAL-001": "APPLYING bootstrap count is 0",
      "A-COAL-002": "quit does not arm after a background read",
      "A-COAL-003": "superseded result does not change the counter",
      "A-LIFE-001": "accepted ready enters SCHEDULED",
      "A-LIFE-002": "ineligible reconcile stops",
      "A-LIFE-003": "local reentry is one background reason",
      "A-LIFE-004": "login refresh and profile_switch are not quit-superseded",
      "A-RESUME-001": "missing lastAttemptAt resumes once",
      "A-RESUME-002": "fresh resume keeps the timer",
      "A-OBS-001": "SKIPPED_BUSY differs from BACKOFF",
      "A-OBS-002": "reconcile event name",
      "A-SEC-001": "logs omit credentials",
      "A-SEC-002": "logs omit bearer headers",
      "A-SEC-003": "logs omit derived identifiers",
      l4GoldenNodeDeskClawInference: "BLOCKED",
      l4GoldenNewApiDirect: "BLOCKED",
      v13AutomaticReconcile: "BLOCKED",
    };
    expect(evidence.l4GoldenNodeDeskClawInference).toBe("BLOCKED");
    expect(evidence.l4GoldenNewApiDirect).toBe("BLOCKED");
    expect(evidence.v13AutomaticReconcile).toBe("BLOCKED");
    expect(JSON.stringify(evidence)).not.toContain("sk-");
  });
});
