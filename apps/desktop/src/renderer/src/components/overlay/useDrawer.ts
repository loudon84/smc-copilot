import { useMemo } from "react";
import type { DrawerApi } from "./overlay-types";
import { useOverlayState } from "./useOverlayState";

export function useDrawer(): DrawerApi {
  const { drawerApi } = useOverlayState();
  return useMemo(() => drawerApi, [drawerApi]);
}
