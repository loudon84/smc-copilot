import { getConnectionConfig } from "../config";
import { readStoredSessionSync } from "../auth/token-store";
import { getActiveProfileNameSync } from "../utils";
import {
  beginRuntimeIntent,
  currentRuntimeReason,
} from "./runtime-provider-operation-coordinator";
import {
  bootstrapRuntimeProvider,
  getRuntimeProviderPublicState,
  type AcceptedRuntimeBootstrap,
} from "./runtime-provider-orchestrator";
import {
  createRuntimeReconcileScheduler,
  isBackgroundReconcileReason,
  type ReconcileScheduler,
} from "./runtime-provider-reconcile-scheduler";

let singleton: ReconcileScheduler | null = null;

function scheduler(): ReconcileScheduler {
  if (!singleton) {
    singleton = createRuntimeReconcileScheduler({
      now: () => Date.now(),
      schedule(delayMs, fn) {
        const handle = setTimeout(fn, delayMs);
        return { cancel: () => clearTimeout(handle) };
      },
      randomInt(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
      },
      readProfile: () => getActiveProfileNameSync(),
      eligible: () =>
        getConnectionConfig().mode === "local" && readStoredSessionSync() !== null,
      readPublicState: (profile) => getRuntimeProviderPublicState(profile),
      bootstrap: (reason, profile) => bootstrapRuntimeProvider(reason, profile),
      abandonBackground() {
        if (isBackgroundReconcileReason(currentRuntimeReason())) {
          beginRuntimeIntent("app-quit");
        }
      },
    });
  }
  return singleton;
}

export function notifyAcceptedRuntimeBootstrap(
  result: AcceptedRuntimeBootstrap,
): void {
  scheduler().notifyAccepted(result);
}

export function stopRuntimeReconcile(): void {
  scheduler().stop();
}

export function noteRuntimeReconcileQuitting(): void {
  scheduler().noteQuitting();
}

export function onRuntimeProviderResume(): void {
  scheduler().onResume();
}

export function requestRuntimeLocalReentry(): Promise<void> {
  return scheduler().requestLocalReentry();
}
