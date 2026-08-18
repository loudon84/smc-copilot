import { useState, useEffect, useCallback, useRef } from "react";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "./components/ThemeProvider";
import { FontProvider } from "./components/FontProvider";
import { ProfileModalProvider } from "./components/profile/ProfileModalProvider";
import { SettingsModalProvider } from "./components/settings/SettingsModalProvider";
import { useSettingsModal } from "./components/settings/SettingsModalContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./screens/Layout/Layout";
import SplashScreen from "./screens/SplashScreen/SplashScreen";
import ConnectionErrorScreen from "./screens/ConnectionError/ConnectionErrorScreen";
import { LoginScreen } from "./modules/auth/LoginScreen";
import { RuntimeProvider } from "./runtime/RuntimeProvider";
import { useRuntime } from "./runtime/use-runtime";
import { AppUpdateProvider } from "./update/AppUpdateProvider";
import { captureScreenView } from "./utils/analytics";
import type { HermesRuntimeProbe } from "../../shared/runtime/runtime-contract";

// @lat: [[runtime-connection#Startup]]
type AppScreen = "splash" | "login" | "main" | "connection-error";

const SPLASH_MIN_MS = 3000;

function skipPortalLogin(): boolean {
  return (
    import.meta.env.VITE_SKIP_PORTAL_LOGIN === "true" ||
    import.meta.env.HERMES_SKIP_PORTAL_LOGIN === "true"
  );
}

function AppBootstrap(): React.JSX.Element {
  const runtime = useRuntime();
  const { openSettings } = useSettingsModal();
  const [screen, setScreen] = useState<AppScreen>("splash");
  const [connectionMode, setConnectionMode] = useState<
    "local" | "remote" | "ssh"
  >("local");
  const [splashStatus, setSplashStatus] = useState<string | undefined>(
    undefined,
  );
  const [errorStatus, setErrorStatus] = useState<HermesRuntimeProbe | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMac = window.electron?.process?.platform === "darwin";
  const runIdRef = useRef(0);

  const runRuntimeConnect = useCallback(async (): Promise<AppScreen> => {
    setSplashStatus("Checking connection…");
    const conn = await window.hermesAPI.getConnectionConfig();
    setConnectionMode(conn.mode);

    if (conn.mode === "ssh" && conn.ssh) {
      setSplashStatus("Starting SSH tunnel…");
      try {
        await window.hermesAPI.startSshTunnel();
      } catch (tunnelErr) {
        console.warn("SSH tunnel failed to start on launch:", tunnelErr);
      }
      return "main";
    }
    if (conn.mode === "remote" && conn.remoteUrl) {
      setSplashStatus("Testing remote connection…");
      const ok = await window.hermesAPI.testRemoteConnection(conn.remoteUrl);
      if (!ok) {
        console.warn(`Cannot reach remote Hermes at ${conn.remoteUrl}.`);
      }
      return "main";
    }

    setSplashStatus("Connecting to Hermes Agent…");
    const ok = await runtime.connect();
    if (ok) {
      setSplashStatus("Checking configuration…");
      await Promise.race([
        Promise.all([
          window.hermesAPI
            .getConfigHealth()
            .catch(() => null)
            .then(() => undefined),
          window.hermesAPI
            .gatewayStatus()
            .catch(() => null)
            .then(() => undefined),
        ]),
        new Promise<void>((r) => setTimeout(r, 800)),
      ]);
      return "main";
    }

    setErrorStatus(runtime.status);
    setErrorMessage(runtime.error);
    const status = await window.hermesAPI.runtimeGetStatus();
    setErrorStatus(status);
    setErrorMessage(status.errorMessage || runtime.error);
    return "connection-error";
  }, [runtime]);

  const runBootstrap = useCallback(async () => {
    const myRun = ++runIdRef.current;
    const startedAt = Date.now();
    let next: AppScreen = "connection-error";

    try {
      if (!skipPortalLogin()) {
        setSplashStatus("Checking account…");
        const authState = await window.desktopAuth.getState();
        if (!authState.authenticated) {
          next = "login";
        } else {
          next = await runRuntimeConnect();
        }
      } else {
        next = await runRuntimeConnect();
      }
    } catch (err) {
      next = "connection-error";
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }

    if (myRun !== runIdRef.current) return;

    setSplashStatus(undefined);
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    if (myRun !== runIdRef.current) return;
    setScreen(next);
  }, [runRuntimeConnect]);

  useEffect(() => {
    void runBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    captureScreenView(screen);
  }, [screen]);

  async function handleLoginSuccess(): Promise<void> {
    setScreen("splash");
    setSplashStatus("Connecting to Hermes Agent…");
    const myRun = ++runIdRef.current;
    try {
      const next = await runRuntimeConnect();
      if (myRun !== runIdRef.current) return;
      setScreen(next);
    } catch (err) {
      if (myRun !== runIdRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setScreen("connection-error");
    }
  }

  async function handleReconnect(): Promise<void> {
    setScreen("splash");
    setSplashStatus("Reconnecting…");
    await runBootstrap();
  }

  async function handleSelectHermesHome(): Promise<void> {
    const dir = await window.hermesAPI.selectFolder();
    if (!dir) return;
    const ok = await runtime.validateHome(dir);
    if (!ok) {
      setErrorMessage(
        "That directory is not a valid Hermes home (missing hermes-agent binaries).",
      );
      return;
    }
    const adopted = await runtime.adoptHome(dir);
    if (!adopted) {
      setErrorMessage("Failed to save Hermes home selection.");
      return;
    }
    await window.hermesAPI.relaunchApp();
  }

  async function handleOpenLogs(): Promise<void> {
    try {
      const home =
        errorStatus?.homePath ||
        (await window.hermesAPI.getHermesHome()) ||
        "";
      if (home) {
        await window.hermesAPI.openExternal(`file://${home}/logs`);
      }
    } catch (err) {
      console.warn("Failed to open Hermes logs:", err);
    }
  }

  function handleOpenConnectionSettings(): void {
    setScreen("main");
    openSettings("connection");
  }

  function handleQuit(): void {
    void window.hermesAPI.quitApp();
  }

  async function handleSwitchToLocal(): Promise<void> {
    await window.hermesAPI.stopSshTunnel().catch(() => undefined);
    await window.hermesAPI.setConnectionConfig("local", "", "");
    setConnectionMode("local");
    setScreen("splash");
    await runBootstrap();
  }

  function renderScreen(): React.JSX.Element {
    switch (screen) {
      case "splash":
        return (
          <SplashScreen
            onFinished={() => undefined}
            status={splashStatus}
            onSwitchToLocal={
              connectionMode !== "local" ? handleSwitchToLocal : undefined
            }
          />
        );
      case "login":
        return (
          <LoginScreen onSuccess={() => void handleLoginSuccess()} />
        );
      case "connection-error":
        return (
          <ConnectionErrorScreen
            status={errorStatus || runtime.status}
            error={errorMessage || runtime.error}
            connecting={runtime.connecting}
            onReconnect={() => void handleReconnect()}
            onSelectHermesHome={() => void handleSelectHermesHome()}
            onOpenLogs={() => void handleOpenLogs()}
            onOpenConnectionSettings={handleOpenConnectionSettings}
            onQuit={handleQuit}
          />
        );
      case "main":
        return <Layout />;
      default: {
        const _exhaustive: never = screen;
        return _exhaustive;
      }
    }
  }

  return (
    <ErrorBoundary>
      <div
        className={`app${isMac ? " is-mac" : ""}${
          isMac && screen === "main" ? " shell-vibrant" : ""
        }`}
      >
        {isMac && <div className="drag-region" />}
        <div className="app-content">{renderScreen()}</div>
      </div>
      <Toaster
        position="bottom-right"
        reverseOrder={false}
        toastOptions={{
          style: {
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-bright)",
            fontSize: 13,
          },
        }}
      />
    </ErrorBoundary>
  );
}

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <FontProvider>
        <ProfileModalProvider>
          {/* RuntimeProvider must wrap SettingsModalProvider: the settings
              modal mounts as a sibling of `children` and RuntimePane calls
              useRuntime(). */}
          <RuntimeProvider>
            <AppUpdateProvider>
              <SettingsModalProvider>
                <AppBootstrap />
              </SettingsModalProvider>
            </AppUpdateProvider>
          </RuntimeProvider>
        </ProfileModalProvider>
      </FontProvider>
    </ThemeProvider>
  );
}

export default App;
