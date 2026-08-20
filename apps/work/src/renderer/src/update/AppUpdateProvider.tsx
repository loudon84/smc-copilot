import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppUpdateState } from "../../../shared/app-update";

interface AppUpdateContextValue {
  state: AppUpdateState | null;
  checkForUpdates: () => Promise<AppUpdateState>;
  downloadUpdate: () => Promise<AppUpdateState>;
  installUpdate: () => Promise<AppUpdateState>;
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

interface AppUpdateProviderProps {
  children: ReactNode;
}

function mergeByRevision(
  current: AppUpdateState | null,
  incoming: AppUpdateState,
): AppUpdateState {
  if (!current || incoming.revision > current.revision) {
    return incoming;
  }
  return current;
}

export function AppUpdateProvider({
  children,
}: AppUpdateProviderProps): React.JSX.Element {
  const [state, setState] = useState<AppUpdateState | null>(null);
  const latestRevisionRef = useRef(-1);

  const applyState = useCallback((incoming: AppUpdateState): void => {
    setState((current) => {
      const next = mergeByRevision(current, incoming);
      latestRevisionRef.current = next.revision;
      return next;
    });
  }, []);

  useEffect(() => {
    const cleanup = window.hermesAPI.onUpdateStateChanged((incoming) => {
      if (incoming.revision > latestRevisionRef.current) {
        applyState(incoming);
      }
    });

    void window.hermesAPI
      .getUpdateState()
      .then((snapshot) => {
        if (snapshot.revision > latestRevisionRef.current) {
          applyState(snapshot);
        }
      })
      .catch(() => undefined);

    return cleanup;
  }, [applyState]);

  const checkForUpdates = useCallback(async (): Promise<AppUpdateState> => {
    const next = await window.hermesAPI.checkForUpdates();
    applyState(next);
    return next;
  }, [applyState]);

  const downloadUpdate = useCallback(async (): Promise<AppUpdateState> => {
    const next = await window.hermesAPI.downloadUpdate();
    applyState(next);
    return next;
  }, [applyState]);

  const installUpdate = useCallback(async (): Promise<AppUpdateState> => {
    const next = await window.hermesAPI.installUpdate();
    applyState(next);
    return next;
  }, [applyState]);

  const value = useMemo<AppUpdateContextValue>(
    () => ({
      state,
      checkForUpdates,
      downloadUpdate,
      installUpdate,
    }),
    [state, checkForUpdates, downloadUpdate, installUpdate],
  );

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
    </AppUpdateContext.Provider>
  );
}

export function useAppUpdate(): AppUpdateContextValue {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) {
    throw new Error("useAppUpdate must be used within AppUpdateProvider");
  }
  return ctx;
}
