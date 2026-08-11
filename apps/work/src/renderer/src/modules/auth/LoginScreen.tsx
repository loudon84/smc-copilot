/**
 * Work LoginScreen — Portal Auth gate before Runtime connect (PRD Phase 5).
 * Does not migrate desktop bootstrap / Hermes Panel / JSSDK.
 */
import { useEffect, useState, type FormEvent } from "react";
import type { AuthEndpointConfig } from "../../../../shared/auth/auth-contract";
import { getDefaultAuthEndpointConfig } from "../../../../shared/auth/auth-url";
import { LoginForm } from "./components/LoginForm";
import "./login.css";

export interface LoginScreenProps {
  onSuccess: () => void;
}

const LAST_ACCOUNT_KEY = "work.lastLoginAccount";

function readLastAccount(): string {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveLastAccount(account: string): void {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, account);
  } catch {
    /* ignore */
  }
}

export function LoginScreen({ onSuccess }: LoginScreenProps): React.JSX.Element {
  const [endpoint, setEndpoint] = useState<AuthEndpointConfig>(
    getDefaultAuthEndpointConfig(),
  );
  const [account, setAccount] = useState(readLastAccount);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const state = await window.desktopAuth.getState();
        if (cancelled) return;
        if (state.endpointConfig) {
          setEndpoint(state.endpointConfig);
        }
        if (state.authenticated) {
          onSuccess();
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onSuccess]);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await window.desktopAuth.saveEndpointConfig(endpoint);
      const state = await window.desktopAuth.login({
        endpointConfig: endpoint,
        account: account.trim(),
        password,
      });
      if (!state.authenticated) {
        throw new Error("Login did not return an authenticated session");
      }
      saveLastAccount(account.trim());
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <p className="login-subtitle">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">Sign in</h1>
        <p className="login-subtitle">
          Sign in with your Portal account, then connect to Copilot Runtime.
        </p>

        <div className="login-endpoint">
          <label htmlFor="login-backend-url" className="login-field-label">
            Backend URL
          </label>
          <input
            id="login-backend-url"
            className="login-field-input"
            value={endpoint.backendUrl}
            onChange={(e) =>
              setEndpoint((prev) => ({ ...prev, backendUrl: e.target.value }))
            }
            disabled={busy}
          />
          <label htmlFor="login-auth-prefix" className="login-field-label">
            Auth prefix
          </label>
          <input
            id="login-auth-prefix"
            className="login-field-input"
            value={endpoint.authPrefix}
            onChange={(e) =>
              setEndpoint((prev) => ({ ...prev, authPrefix: e.target.value }))
            }
            disabled={busy}
          />
        </div>

        <LoginForm
          account={account}
          password={password}
          onAccountChange={setAccount}
          onPasswordChange={setPassword}
          onSubmit={(ev) => {
            void handleSubmit(ev);
          }}
          error={error}
          busy={busy}
        />
      </div>
    </div>
  );
}

export default LoginScreen;
