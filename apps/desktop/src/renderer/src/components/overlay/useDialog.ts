import { useMemo } from "react";
import type { DialogApi } from "./overlay-types";
import { useOverlayState } from "./useOverlayState";

export function useDialog(): DialogApi {
  const { dialogApi } = useOverlayState();
  return useMemo(() => dialogApi, [dialogApi]);
}
