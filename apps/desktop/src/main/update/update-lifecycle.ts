import { stopHealthPolling } from "../hermes";
import { stopAll as stopClaw3d } from "../claw3d";
import { onBeforeQuit } from "../profile-runtime-manager";

let browserToolServerStop: (() => void) | null = null;

/** Register Browser Tool Server stop hook from main index. */
export function registerBrowserToolServerStop(stop: () => void): void {
  browserToolServerStop = stop;
}

/**
 * Prepare Desktop for app update (PRD v1.3.1).
 * Must NOT stop Runtime Service / Hermes Gateway / Profiles — Runtime lifecycle
 * is independent of Desktop. Only tear down Desktop-local resources.
 */
export async function prepareForAppUpdate(): Promise<void> {
  try {
    stopHealthPolling();
  } catch {
    /* best effort */
  }

  try {
    stopClaw3d();
  } catch {
    /* best effort */
  }

  try {
    browserToolServerStop?.();
  } catch {
    /* best effort */
  }

  try {
    onBeforeQuit();
  } catch {
    /* best effort */
  }
}
