import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AuthEndpointConfig } from "../../../../shared/auth/auth-contract";
import { getDefaultAuthEndpointConfig } from "../../../../shared/auth/auth-url";
import { useI18n } from "../../components/useI18n";
import { useAuth } from "./AuthProvider";
import { BootstrapScreen } from "./BootstrapScreen";
import { ConfigDiffConfirmDrawer } from "./ConfigDiffConfirmDrawer";
import { EndpointConfigPanel } from "./components/EndpointConfigPanel";
import { LoginForm } from "./components/LoginForm";
import { readLastLoginEmail, saveLastLoginEmail } from "./last-login-email";
import { hideAllContentShellLayers } from "../../hooks/useShellLayerVisibility";
import "./styles/login.css";

export interface LoginScreenProps {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps): React.JSX.Element {
  const { t } = useI18n();
  const { setAuthState, setPendingBootstrapDiff, pendingBootstrapDiff, refreshAuth } =
    useAuth();
  const [endpoint, setEndpoint] = useState<AuthEndpointConfig>(getDefaultAuthEndpointConfig());
  const [account, setAccount] = useState(readLastLoginEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [loadingState, setLoadingState] = useState(true);

  const awaitingConfigConfirm = Boolean(pendingBootstrapDiff?.diff?.length);

  const runBootstrap = useCallback(async (): Promise<void> => {
    const result = await window.desktopUserConfig.bootstrap();
    if (result.diff && result.diff.length > 0) {
      setPendingBootstrapDiff(result);
      return;
    }
    setPendingBootstrapDiff(null);
    onSuccess();
  }, [onSuccess, setPendingBootstrapDiff]);

  const handleConfigApplied = useCallback(async (): Promise<void> => {
    await refreshAuth();
    setPendingBootstrapDiff(null);
    onSuccess();
  }, [onSuccess, refreshAuth, setPendingBootstrapDiff]);

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      try {
        const [authState, bootstrapState] = await Promise.all([
          window.desktopAuth.getState(),
          window.desktopUserConfig.getBootstrapState(),
        ]);

        if (cancelled) return;

        if (authState.endpointConfig) {
          setEndpoint(authState.endpointConfig);
        }

        if (authState.authenticated && !bootstrapState.initialized) {
          setBootstrapping(true);
          try {
            await runBootstrap();
          } catch (err) {
            if (!cancelled) {
              setError((err as Error).message);
            }
          } finally {
            if (!cancelled) {
              setBootstrapping(false);
              setLoadingState(false);
            }
          }
          return;
        }

        setLoadingState(false);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoadingState(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [runBootstrap]);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBootstrapping(true);
    try {
      await window.desktopAuth.saveEndpointConfig(endpoint);
      const state = await window.desktopAuth.login({
        endpointConfig: endpoint,
        account,
        password,
      });
      saveLastLoginEmail(account);
      setAuthState(state);
      await runBootstrap();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBootstrapping(false);
    }
  };

  const handleExit = (): void => {
    void window.smcShell.quitApp();
  };

  useEffect(() => {
    hideAllContentShellLayers();
  }, []);

  useEffect(() => {
    if (loadingState || bootstrapping || awaitingConfigConfirm) {
      hideAllContentShellLayers();
    }
  }, [loadingState, bootstrapping, awaitingConfigConfirm]);

  if (loadingState || bootstrapping) {
    return <BootstrapScreen state={bootstrapping ? "bootstrapping" : "checking-session"} />;
  }

  if (awaitingConfigConfirm) {
    return (
      <div className="login-screen">
        <ConfigDiffConfirmDrawer
          open
          variant="login"
          result={pendingBootstrapDiff}
          preventBackdropDismiss
          onClose={() => setPendingBootstrapDiff(null)}
          onApplied={() => void handleConfigApplied()}
        />
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <header className="login-card-header">
          <h1>{t("auth.login")}</h1>
          <p>{t("auth.loginSubtitle")}</p>
        </header>
        <details className="login-endpoint-details">
          <summary>{t("auth.endpointSection")}</summary>
          <div className="login-endpoint-body">
            <EndpointConfigPanel value={endpoint} onChange={setEndpoint} />
          </div>
        </details>

        <LoginForm
          account={account}
          password={password}
          onAccountChange={setAccount}
          onPasswordChange={setPassword}
          onSubmit={(e) => void handleSubmit(e)}
          error={error}
          busy={bootstrapping}
          onExit={handleExit}
        />
      </div>
    </div>
  );
}
