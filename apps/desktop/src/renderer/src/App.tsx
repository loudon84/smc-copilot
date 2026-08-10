import { useCallback, useEffect } from "react";
import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./screens/Layout/Layout";
import RuntimeRecoveryScreen from "./screens/RuntimeRecovery/RuntimeRecoveryScreen";
import RuntimePairingScreen from "./screens/RuntimePairing/RuntimePairingScreen";
import { AuthProvider } from "./modules/auth/AuthProvider";
import { LoginScreen } from "./modules/auth/LoginScreen";
import SplashScreen from "./screens/SplashScreen/SplashScreen";
import { useStartupGate } from "./hooks/useStartupGate";
import { hideAllContentShellLayers } from "./hooks/useShellLayerVisibility";

function App(): React.JSX.Element {
  const { screen, startupError, navigateTo, recheck, decision } = useStartupGate();
  const isMac =
    window.electron?.process?.platform === "darwin" ||
    navigator.platform.toLowerCase().includes("mac");

  const handleSplashFinished = useCallback(() => {
    /* splash transition is driven by startup gate */
  }, []);

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
      case "runtime-pairing":
        return <RuntimePairingScreen decision={decision} onComplete={recheck} />;
      case "runtime-recovery":
        return (
          <RuntimeRecoveryScreen
            decision={decision}
            error={startupError}
            onRetry={recheck}
            onEnterMain={() => navigateTo("main")}
          />
        );
      case "main":
        return <Layout />;
      default: {
        const _exhaustive: never = screen;
        return (
          <RuntimeRecoveryScreen
            decision={decision}
            error={`Unknown screen: ${String(_exhaustive)}`}
            onRetry={recheck}
          />
        );
      }
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
