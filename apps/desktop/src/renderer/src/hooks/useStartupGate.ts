import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../components/useI18n";
import type { StartupDecision } from "../../../shared/startup/startup-contract";

export type AppScreen = "splash" | "login" | "welcome" | "installing" | "setup" | "main";

const SPLASH_MIN_MS = 1300;

export interface UseStartupGateResult {
  screen: AppScreen;
  installError: string | null;
  setInstallError: (error: string | null) => void;
  navigateTo: (screen: AppScreen) => void;
  recheck: () => void;
}

/**
 * Startup gate: Main Process resolves route (V3.3 includes login before install).
 */
export function useStartupGate(): UseStartupGateResult {
  const { t } = useI18n();
  const [screen, setScreen] = useState<AppScreen>("splash");
  const [installError, setInstallError] = useState<string | null>(null);
  const [checkKey, setCheckKey] = useState(0);

  const navigateTo = useCallback((next: AppScreen) => {
    setScreen(next);
  }, []);

  const recheck = useCallback(() => {
    setInstallError(null);
    setCheckKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function runDecision() {
      setScreen("splash");
      setInstallError(null);

      const startedAt = Date.now();
      let decision: StartupDecision;

      try {
        decision = await window.smcShell.resolveStartupDecision();
      } catch (err) {
        console.error("[STARTUP] Failed to resolve startup decision:", err);
        decision = {
          runtime: null,
          connectionMode: "local",
          nextScreen: "login",
          skipAgentInstall: false,
          skipModelSetup: false,
          shouldVerifyInBackground: false,
          reason: "auth-required",
          error: "Failed to resolve startup decision",
        };
      }

      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }

      if (cancelled) return;

      if (decision.error) {
        setInstallError(decision.error);
      }

      setScreen(decision.nextScreen as AppScreen);

      if (decision.shouldVerifyInBackground && decision.runtime) {
        window.hermesAPI.verifyInstall().then((ok) => {
          if (cancelled) return;
          if (!ok) {
            if (decision.runtime!.updateMode) {
              console.warn(
                "[STARTUP] Background verify failed in update mode, staying on current screen",
              );
            } else {
              setInstallError(t("errors.installBroken"));
              setScreen("welcome");
            }
          }
        });
      }
    }

    void runDecision();

    return () => {
      cancelled = true;
    };
  }, [t, checkKey]);

  return {
    screen,
    installError,
    setInstallError,
    navigateTo,
    recheck,
  };
}
