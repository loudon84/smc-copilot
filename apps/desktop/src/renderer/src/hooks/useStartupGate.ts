import { useState, useEffect, useCallback } from "react";
import type { StartupDecision } from "../../../shared/startup/startup-contract";

export type AppScreen = "splash" | "login" | "runtime-recovery" | "main";

const SPLASH_MIN_MS = 1300;

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

  return {
    screen,
    startupError,
    setStartupError,
    decision,
    navigateTo,
    recheck,
  };
}
