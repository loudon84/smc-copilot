/**
 * Desktop Boot Coordinator (PRD v1.3.1 §10 / v1.5.4 §25).
 * Ensures Renderer startup decision awaits Runtime connection (with timeout).
 *
 * Thin Client: Desktop never auto-spawns Runtime. Start Runtime via
 * `npm run dev:runtime` (dev) or the Windows service (production).
 */
import type { RuntimeConnectionState } from "../../shared/copilot-runtime/runtime-state-contract";
import { createInitialRuntimeConnectionState } from "../../shared/copilot-runtime/runtime-state-contract";
import {
  getRuntimeConnectionState,
  initCopilotRuntimeConnection,
  runRuntimeHandshake,
} from "../copilot-runtime-client/runtime-connection-manager";
import { resolveServeBaseUrl } from "../copilot-runtime-client/runtime-mode";
import { resolveStartupDecisionFromRuntime } from "./startup-decision";
import type { StartupDecision } from "../../shared/startup/startup-contract";

const BOOTSTRAP_WAIT_MS = 15000;

class DesktopBootCoordinator {
  private runtimeBootstrapPromise: Promise<RuntimeConnectionState> | null = null;

  /**
   * Connect to an already-running Runtime (probe + handshake).
   * Idempotent — subsequent calls reuse the same promise.
   *
   * PRD v1.5.4: does **not** spawn Serve / Runtime.
   */
  bootstrap(): Promise<RuntimeConnectionState> {
    if (this.runtimeBootstrapPromise) return this.runtimeBootstrapPromise;

    this.runtimeBootstrapPromise = (async () => {
      try {
        return await initCopilotRuntimeConnection();
      } catch (err) {
        console.warn("[BOOT] runtime handshake failed:", err);
        return getRuntimeConnectionState();
      }
    })();

    return this.runtimeBootstrapPromise;
  }

  /**
   * Await bootstrap up to BOOTSTRAP_WAIT_MS; then return current state
   * (may still be Connecting / RuntimeMissing).
   */
  async runtime(): Promise<RuntimeConnectionState> {
    const boot = this.bootstrap();
    const timed = await Promise.race([
      boot,
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), BOOTSTRAP_WAIT_MS);
      }),
    ]);

    if (timed === "timeout") {
      const current = getRuntimeConnectionState();
      // Keep transitional states transitional — do not invent RuntimeMissing.
      // A false RuntimeMissing freezes the recovery screen (useStartupGate only
      // auto-refreshes when the *frozen* snapshot was Connecting/Starting).
      if (current.state === "Connecting" || current.state === "RuntimeStarting") {
        return {
          ...current,
          lastError:
            current.lastError ??
            "Still connecting to Runtime. Ensure npm run dev:runtime is up, then Retry.",
          canRetry: true,
          updatedAt: new Date().toISOString(),
        };
      }
      return current;
    }
    return timed;
  }

  async resolveStartupDecision(): Promise<StartupDecision> {
    let runtimeState = await this.runtime();
    // Boot may race Serve startup: if still transitional OR a stale Missing while
    // Runtime is actually up, do one fresh handshake before freezing the snapshot.
    if (
      runtimeState.state === "Connecting" ||
      runtimeState.state === "RuntimeStarting" ||
      runtimeState.state === "RuntimeMissing"
    ) {
      try {
        runtimeState = await runRuntimeHandshake();
      } catch {
        runtimeState = getRuntimeConnectionState();
      }
    }
    return resolveStartupDecisionFromRuntime(runtimeState);
  }

  /** Force a fresh handshake (e.g. recovery Retry). */
  async retryHandshake(): Promise<RuntimeConnectionState> {
    return runRuntimeHandshake();
  }
}

export const desktopBootCoordinator = new DesktopBootCoordinator();

export function createStartingPlaceholderState(): RuntimeConnectionState {
  return createInitialRuntimeConnectionState({
    state: "Connecting",
    baseUrl: resolveServeBaseUrl(),
  });
}
