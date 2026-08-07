import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DesktopAuthState } from "../../../../shared/auth/auth-contract";
import type { BootstrapResult } from "../../../../shared/user-config/user-config-contract";

interface AuthContextValue {
  authState: DesktopAuthState | null;
  loading: boolean;
  pendingBootstrapDiff: BootstrapResult | null;
  setAuthState: (state: DesktopAuthState | null) => void;
  setPendingBootstrapDiff: (result: BootstrapResult | null) => void;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const emptyState: DesktopAuthState = {
  authenticated: false,
  endpointConfig: null,
  user: null,
  expiresAt: null,
};

export function AuthProvider({
  children,
  onLogoutComplete,
}: {
  children: ReactNode;
  onLogoutComplete?: () => void;
}): React.JSX.Element {
  const [authState, setAuthState] = useState<DesktopAuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingBootstrapDiff, setPendingBootstrapDiff] = useState<BootstrapResult | null>(
    null,
  );

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    try {
      const state = await window.desktopAuth.getState();
      setAuthState(state);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    const state = await window.desktopAuth.logout();
    setAuthState(state);
    setPendingBootstrapDiff(null);
    onLogoutComplete?.();
  }, [onLogoutComplete]);

  const value = useMemo(
    () => ({
      authState: authState ?? emptyState,
      loading,
      pendingBootstrapDiff,
      setAuthState,
      setPendingBootstrapDiff,
      refreshAuth,
      logout,
    }),
    [authState, loading, pendingBootstrapDiff, refreshAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthSession(): Pick<AuthContextValue, "authState" | "loading"> {
  const { authState, loading } = useAuth();
  return { authState, loading };
}
