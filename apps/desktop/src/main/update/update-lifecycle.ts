import { stopHealthPolling, stopGateway } from "../hermes";
import { stopSshTunnel } from "../ssh-tunnel";
import { stopAll as stopClaw3d } from "../claw3d";
import { stopAllProfiles, onBeforeQuit } from "../profile-runtime-manager";

let browserToolServerStop: (() => void) | null = null;

/** Register Browser Tool Server stop hook from main index. */
export function registerBrowserToolServerStop(stop: () => void): void {
  browserToolServerStop = stop;
}

export async function prepareForAppUpdate(): Promise<void> {
  try {
    stopHealthPolling();
  } catch {
    /* best effort */
  }

  try {
    await stopAllProfiles();
  } catch {
    /* best effort */
  }

  try {
    stopGateway();
  } catch {
    /* best effort */
  }

  try {
    stopSshTunnel();
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
