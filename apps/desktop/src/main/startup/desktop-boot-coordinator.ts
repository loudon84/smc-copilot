/**
 * Desktop Boot Coordinator (PRD v1.3.1 §10).
 * Ensures Renderer startup decision awaits Runtime bootstrap (with timeout).
 */
import type { RuntimeConnectionState } from "../../shared/copilot-runtime/runtime-state-contract";
import { createInitialRuntimeConnectionState } from "../../shared/copilot-runtime/runtime-state-contract";
import {
  getRuntimeConnectionState,
  initCopilotRuntimeConnection,
  runRuntimeHandshake,
} from "../copilot-runtime-client/runtime-connection-manager";
import {
  canSpawnCopilotServe,
  resolveCopilotRuntimeMode,
  resolveServeBaseUrl,
} from "../copilot-runtime-client/runtime-mode";
import { autoStartCopilotServeIfReady } from "../copilot-serve/copilot-serve-process";
import { resolveStartupDecisionFromRuntime } from "./startup-decision";
import type { StartupDecision } from "../../shared/startup/startup-contract";

const BOOTSTRAP_WAIT_MS = 4500;

class DesktopBootCoordinator {
  private runtimeBootstrapPromise: Promise<RuntimeConnectionState> | null = null;

  /**
   * Start Runtime IPC-side bootstrap (spawn Serve in dev + handshake).
   * Idempotent — subsequent calls reuse the same promise.
   */
  bootstrap(): Promise<RuntimeConnectionState> {
    if (this.runtimeBootstrapPromise) return this.runtimeBootstrapPromise;

    this.runtimeBootstrapPromise = (async () => {
      const mode = resolveCopilotRuntimeMode();
      if (canSpawnCopilotServe(mode)) {
        try {
          await autoStartCopilotServeIfReady();
        } catch (err) {
          console.warn("[BOOT] auto-start Serve skipped:", err);
        }
      }
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
   * (may still be Connecting / RuntimeStarting).
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
      if (current.state === "Connecting") {
        return {
          ...current,
          state: "RuntimeStarting",
          lastError: current.lastError ?? "Runtime bootstrap still in progress",
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
    // Boot may race Serve startup: if still transitional, do one fresh handshake
    // before freezing the Renderer recovery snapshot.
    if (runtimeState.state === "Connecting" || runtimeState.state === "RuntimeStarting") {
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
    state: "RuntimeStarting",
    baseUrl: resolveServeBaseUrl(),
  });
}
