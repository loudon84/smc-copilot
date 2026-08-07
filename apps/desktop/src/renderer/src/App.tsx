import { useCallback, useEffect } from "react";
import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Welcome from "./screens/Welcome/Welcome";
import Install from "./screens/Install/Install";
import Setup from "./screens/Setup/Setup";
import Layout from "./screens/Layout/Layout";
import { AuthProvider } from "./modules/auth/AuthProvider";
import { LoginScreen } from "./modules/auth/LoginScreen";
import SplashScreen from "./screens/SplashScreen/SplashScreen";
import { useStartupGate } from "./hooks/useStartupGate";
import { hideAllContentShellLayers } from "./hooks/useShellLayerVisibility";

function App(): React.JSX.Element {
  const { screen, installError, setInstallError, navigateTo, recheck } = useStartupGate();
  const isMac =
    window.electron?.process?.platform === "darwin" ||
    navigator.platform.toLowerCase().includes("mac");

  const handleSplashFinished = useCallback(() => {
    /* splash transition is driven by startup gate */
  }, []);

  function handleInstallComplete(): void {
    setInstallError(null);
    try {
      sessionStorage.setItem("smc-v13-navigate-runtime-setup", "1");
      sessionStorage.setItem("smc-v13-run-doctor", "1");
    } catch {
      /* sessionStorage unavailable */
    }
    navigateTo("setup");
  }

  function handleInstallFailed(error: string): void {
    setInstallError(error);
    navigateTo("welcome");
  }

  function handleRetryInstall(): void {
    setInstallError(null);
    navigateTo("installing");
  }

  function handleRecheck(): void {
    recheck();
  }

  useEffect(() => {
    if (screen === "main") return;
    hideAllContentShellLayers();
  }, [screen]);

  function renderScreen(): React.JSX.Element {
    switch (screen) {
      case "splash":
        return <SplashScreen onFinished={handleSplashFinished} />;
      case "login":
        return <LoginScreen onSuccess={recheck} />;
      case "welcome":
        return (
          <Welcome
            error={installError}
            onStart={handleRetryInstall}
            onRecheck={handleRecheck}
          />
        );
      case "installing":
        return (
          <Install onComplete={handleInstallComplete} onFailed={handleInstallFailed} />
        );
      case "setup":
        return (
          <Setup
            onComplete={() => {
              try {
                sessionStorage.setItem("smc-v13-navigate-runtime-setup", "1");
              } catch {
                /* ignore */
              }
              navigateTo("main");
            }}
          />
        );
      case "main":
        return <Layout />;
    }
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider onLogoutComplete={recheck}>
          <div className="app">
            {isMac && screen !== "main" && <div className="drag-region" />}
            <div className="app-content">{renderScreen()}</div>
          </div>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;


