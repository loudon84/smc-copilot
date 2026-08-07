import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import type { View } from "../../types/desktop-shell";
import { resolveActiveShellLayerId } from "../../screens/MainPage/shell-layer-id";
import { useOverlayState } from "./useOverlayState";

export interface NativeShellLayerGateValue {
  nativeBlocked: boolean;
}

const NativeShellLayerGateContext =
  createContext<NativeShellLayerGateValue | null>(null);

const MISSING_GATE_ERROR =
  "useNativeShellLayerGate must be used within NativeShellLayerGateProvider";

export interface NativeShellLayerGateProviderProps {
  children: ReactNode;
  /** Active workspace view — used for first-frame hide when overlay blocks native layer. */
  activeView?: View;
}

export function NativeShellLayerGateProvider({
  children,
  activeView,
}: NativeShellLayerGateProviderProps): React.JSX.Element {
  const { nativeBlocked } = useOverlayState();

  useLayoutEffect(() => {
    if (!nativeBlocked) return;

    const layerId = activeView ? resolveActiveShellLayerId(activeView) : null;
    if (!layerId) return;

    void window.shellView.hide(layerId).catch(() => {});
  }, [nativeBlocked, activeView]);

  return (
    <NativeShellLayerGateContext.Provider value={{ nativeBlocked }}>
      {children}
    </NativeShellLayerGateContext.Provider>
  );
}

export function useNativeShellLayerGate(): NativeShellLayerGateValue {
  const context = useContext(NativeShellLayerGateContext);
  if (!context) {
    throw new Error(MISSING_GATE_ERROR);
  }
  return context;
}
