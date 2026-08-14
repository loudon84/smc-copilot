import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { RuntimeContext, type RuntimeContextValue } from "./runtime-context";
import {
  initialRuntimeState,
  runtimeReducer,
} from "./runtime-reducer";

interface RuntimeProviderProps {
  children: ReactNode;
}

export function RuntimeProvider({
  children,
}: RuntimeProviderProps): React.JSX.Element {
  const [state, dispatch] = useReducer(runtimeReducer, initialRuntimeState);

  const connect = useCallback(async (profile?: string): Promise<boolean> => {
    dispatch({ type: "CONNECT_START" });
    try {
      const owner = await window.hermesAPI.getControlOwner();
      switch (owner.owner) {
        case "salt":
        case "opsi": {
          // Probe-only — Salt/OPSI owns install/start; never call Runtime :8765.
          const status = await window.hermesAPI.runtimeGetStatus(profile);
          if (status.state === "ready") {
            dispatch({ type: "CONNECT_SUCCESS", status });
            return true;
          }
          dispatch({
            type: "CONNECT_FAILURE",
            status,
            error:
              status.errorMessage ||
              "Waiting for the organization to install or recover Hermes Agent.",
          });
          return false;
        }
        case "direct":
        case "runtime":
          // direct → Legacy Gateway :8642; runtime → optional Runtime :8765.
          break;
        default: {
          const _exhaustive: never = owner.owner;
          throw new Error(`Unknown control owner: ${_exhaustive}`);
        }
      }
      const result = await window.hermesAPI.runtimeEnsureLocalReady(profile);
      const status = await window.hermesAPI.runtimeGetStatus(profile);
      if (result.ok && status.state === "ready") {
        dispatch({ type: "CONNECT_SUCCESS", status });
        return true;
      }
      dispatch({
        type: "CONNECT_FAILURE",
        status,
        error:
          result.errorMessage ||
          status.errorMessage ||
          "Failed to connect to Hermes Agent",
      });
      return false;
    } catch (err) {
      dispatch({
        type: "CONNECT_FAILURE",
        status: null,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, []);

  const refresh = useCallback(async (profile?: string): Promise<void> => {
    try {
      const status = await window.hermesAPI.runtimeGetStatus(profile);
      dispatch({ type: "STATUS", status });
    } catch (err) {
      dispatch({
        type: "CONNECT_FAILURE",
        status: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const restart = useCallback(async (profile?: string): Promise<boolean> => {
    dispatch({ type: "CONNECT_START" });
    try {
      const owner = await window.hermesAPI.getControlOwner();
      switch (owner.owner) {
        case "salt":
        case "opsi": {
          const status = await window.hermesAPI.runtimeGetStatus(profile);
          dispatch({
            type: "CONNECT_FAILURE",
            status,
            error:
              owner.owner === "opsi"
                ? "Hermes Gateway is managed by the organization (Provider: OPSI). Restart is not available."
                : "Hermes Gateway is Salt-managed. Restart is not available in enterprise mode.",
          });
          return false;
        }
        case "direct":
        case "runtime":
          break;
        default: {
          const _exhaustive: never = owner.owner;
          throw new Error(`Unknown control owner: ${_exhaustive}`);
        }
      }
      const result = await window.hermesAPI.runtimeRestart(profile);
      const status = await window.hermesAPI.runtimeGetStatus(profile);
      if (result.ok && status.state === "ready") {
        dispatch({ type: "CONNECT_SUCCESS", status });
        return true;
      }
      dispatch({
        type: "CONNECT_FAILURE",
        status,
        error:
          result.errorMessage ||
          status.errorMessage ||
          "Failed to restart Hermes Gateway",
      });
      return false;
    } catch (err) {
      dispatch({
        type: "CONNECT_FAILURE",
        status: null,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, []);

  const validateHome = useCallback(async (path: string): Promise<boolean> => {
    return window.hermesAPI.runtimeValidateHome(path);
  }, []);

  const adoptHome = useCallback(async (path: string): Promise<boolean> => {
    return window.hermesAPI.runtimeAdoptHome(path);
  }, []);

  useEffect(() => {
    const cleanup = window.hermesAPI.onRuntimeStatusChanged((probe) => {
      dispatch({ type: "STATUS", status: probe });
    });
    return cleanup;
  }, []);

  const value = useMemo<RuntimeContextValue>(
    () => ({
      ...state,
      lastStatus: state.status,
      connect,
      refresh,
      restart,
      validateHome,
      adoptHome,
    }),
    [state, connect, refresh, restart, validateHome, adoptHome],
  );

  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  );
}
