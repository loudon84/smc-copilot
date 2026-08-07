import { useEffect } from "react";
import type { View } from "../types/desktop-shell";
import { resolveActiveShellLayerId } from "../screens/MainPage/shell-layer-id";

const STATIC_SHELL_LAYERS = ["portal", "web-operator"] as const;

async function hideShellLayer(layerId: string): Promise<void> {
  try {
    await window.shellView.hide(layerId);
  } catch {
    /* layer may not exist yet */
  }
}

/** Hide native WebContentsView layers that are not the active workspace tab. */
export function syncInactiveShellLayers(
  activeView: View,
  externalTabIds: string[],
): void {
  const activeLayer = resolveActiveShellLayerId(activeView);
  const allLayers = [...STATIC_SHELL_LAYERS, ...externalTabIds];

  for (const layerId of allLayers) {
    if (layerId !== activeLayer) {
      void hideShellLayer(layerId);
    }
  }
}

/** Hide all content shell layers (login / splash / bootstrap gate). */
export function hideAllContentShellLayers(): void {
  for (const layerId of STATIC_SHELL_LAYERS) {
    void hideShellLayer(layerId);
  }
}

export function useShellLayerVisibility(
  activeView: View,
  externalTabIds: string[],
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    syncInactiveShellLayers(activeView, externalTabIds);
  }, [activeView, externalTabIds, enabled]);
}
