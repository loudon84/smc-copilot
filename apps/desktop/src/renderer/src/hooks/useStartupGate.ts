import { useState, useEffect, useCallback, useRef } from "react";
import type { StartupDecision } from "../../../shared/startup/startup-contract";
import type { RuntimeConnectionState } from "../../../shared/copilot-runtime/runtime-state-contract";

export type AppScreen =
  | "splash"
  | "login"
  | "runtime-recovery"
  | "runtime-pairing"
  | "main";

const SPLASH_MIN_MS = 1300;

/** States where the recovery screen may hold a stale snapshot while Main keeps polling. */
const TRANSITIONAL_RUNTIME_STATES = new Set(["Connecting", "RuntimeStarting", "RuntimeMissing"]);

/** Live states that should leave the recovery screen. */
const RECOVERY_EXIT_STATES = new Set([
  "Ready",
  "PairingRequired",
  "RuntimeDegraded",
  "Incompatible",
]);

export interface UseStartupGateResult {
  screen: AppScreen;
  startupError: string | null;
  setStartupError: (error: string | null) => void;
  decision: StartupDecision | null;
  navigateTo: (screen: AppScreen) => void;
  recheck: () => void;
}

/**
 * Startup gate (PRD v1.3.1): Auth + RuntimeConnectionState only.
 * Never calls Hermes install verification APIs or Install screens.
 */
export function useStartupGate(): UseStartupGateResult {
  const [screen, setScreen] = useState<AppScreen>("splash");
  const [startupError, setStartupError] = useState<string | null>(null);
  const [decision, setDecision] = useState<StartupDecision | null>(null);
  const [checkKey, setCheckKey] = useState(0);
  const screenRef = useRef(screen);
  const decisionRef = useRef(decision);
  screenRef.current = screen;
  decisionRef.current = decision;

  const navigateTo = useCallback((next: AppScreen) => {
    setScreen(next);
  }, []);

  const recheck = useCallback(() => {
    setStartupError(null);
    setCheckKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function runDecision() {
      setScreen("splash");
      setStartupError(null);

      const startedAt = Date.now();
      let next: StartupDecision;

      try {
        next = await window.smcShell.resolveStartupDecision();
      } catch (err) {
        console.error("[STARTUP] Failed to resolve startup decision:", err);
        next = {
          nextScreen: "login",
          reason: "auth-required",
          runtimeState: null,
          error: "Failed to resolve startup decision",
        };
      }

      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }

      if (cancelled) return;

      if (next.error) {
        setStartupError(next.error);
      }
      setDecision(next);
      setScreen(next.nextScreen as AppScreen);
    }

    void runDecision();

    return () => {
      cancelled = true;
    };
  }, [checkKey]);

  // When recovery is stuck on Connecting/Starting/Missing, Main may already be
  // Ready / PairingRequired via the 15s poll — refresh without a full splash.
  useEffect(() => {
    if (!window.copilotRuntime?.onStateChanged) return;

    return window.copilotRuntime.onStateChanged((next: RuntimeConnectionState) => {
      if (screenRef.current !== "runtime-recovery") return;
      const frozen = decisionRef.current?.runtimeState?.state;
      if (!frozen || !TRANSITIONAL_RUNTIME_STATES.has(frozen)) return;
      if (!RECOVERY_EXIT_STATES.has(next.state)) return;
      recheck();
    });
  }, [recheck]);

  return {
    screen,
    startupError,
    setStartupError,
    decision,
    navigateTo,
    recheck,
  };
}
